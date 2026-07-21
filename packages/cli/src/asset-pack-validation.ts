import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import { loadImage as loadCanvasImage } from '@napi-rs/canvas';
import {
  assetPackContentProjection,
  createCatalog,
  createPaletteCatalog,
  normalizeAssetPack,
  parseAssetPackSource,
  standardAnimationGeometry,
  validateAssetPack as validateCoreAssetPack,
  type AnimationAuditGeometry,
  type AssetPackAcknowledgement,
  type AssetPackBaseline,
  type AssetPackDiagnostic,
  type AssetPackSourceInspection,
  type FilePath,
  type ItemDefinition,
  type ItemId,
  type NormalizedAssetPack,
  type PaletteMetadata,
} from '@lpc-toolkit/core';
import type { AssetWorkspace } from './asset-workspace.js';
import type { AssetPackFilesSuccess } from './asset-pack-files.js';
import type { AssetPackPayloadSuccess } from './asset-pack-payload.js';
import { loadJsonRecords } from './loaders.js';
import { createNodeCanvasAdapter } from './node-canvas-adapter.js';
import type { RuntimeAssets } from './runtime-assets.js';
import {
  checkAssetPackCompatibility,
  type AssetPackLifecycleDiagnostic,
} from './asset-pack-compatibility.js';
import { CLI_VERSION } from './package-info.js';

export interface ActiveAssetPackBaseline extends AssetPackBaseline {
  readonly palettes: PaletteMetadata;
}

export interface AssetPackValidationReport {
  readonly schema: 'lpc-toolkit.asset-pack-validation.v1';
  readonly packId?: string;
  readonly packDirectory: string;
  readonly contentDigest?: string;
  readonly valid: boolean;
  readonly diagnostics: readonly (AssetPackDiagnostic | AssetPackLifecycleDiagnostic)[];
  readonly acknowledgementRecords: readonly AssetPackAcknowledgement[];
}

interface SourceUse {
  readonly sourcePath: string;
  readonly geometry: AnimationAuditGeometry;
}

interface DecodedImageData {
  readonly width: number;
  readonly height: number;
  readonly nonTransparentCells: readonly string[];
  readonly paletteColors: readonly string[];
}

const VALIDATION_SCHEMA = 'lpc-toolkit.asset-pack-validation.v1' as const;
const MANIFEST_FILE = 'asset-pack.json';
const INSPECTION_CONCURRENCY = 4;

function sha256Buffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256Json(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)] as const);
    return Object.fromEntries(entries);
  }

  return value;
}

function definitionDigest(item: ItemDefinition): string {
  const { credits: _credits, itemId: _itemId, sourcePath: _sourcePath, ...rest } = item;
  return sha256Json(canonicalize(rest));
}

function creditDigest(item: ItemDefinition): string {
  return sha256Json(canonicalize(item.credits));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asItemDefinitions(records: Record<string, unknown>): Record<FilePath, ItemDefinition> {
  const definitions: Record<FilePath, ItemDefinition> = {};
  Object.entries(records).forEach(([filePath, record]) => {
    if (isRecord(record)) {
      definitions[filePath as FilePath] = record as unknown as ItemDefinition;
    }
  });
  return definitions;
}

function collectUniqueSourcePaths(pack: NormalizedAssetPack): readonly string[] {
  const seen = new Set<string>();
  const sourcePaths: string[] = [];

  pack.assets.forEach((asset) => {
    if (asset.kind === 'new-item') {
      asset.layers.forEach((layer) => {
        layer.sprites.forEach((sprite) => {
          if (!seen.has(sprite.source)) {
            seen.add(sprite.source);
            sourcePaths.push(sprite.source);
          }
        });
      });
      return;
    }

    asset.addAnimations.forEach((animation) => {
      animation.layers.forEach((layer) => {
        if (!seen.has(layer.source)) {
          seen.add(layer.source);
          sourcePaths.push(layer.source);
        }
      });
    });
  });

  return sourcePaths.sort((left, right) => left.localeCompare(right));
}

function collectSourceUses(pack: NormalizedAssetPack): ReadonlyMap<string, readonly SourceUse[]> {
  const uses = new Map<string, SourceUse[]>();

  pack.assets.forEach((asset) => {
    if (asset.kind === 'new-item') {
      asset.layers.forEach((layer) => {
        layer.sprites.forEach((sprite) => {
          const grouped = uses.get(sprite.source) ?? [];
          grouped.push({
            sourcePath: sprite.source,
            geometry: standardAnimationGeometry(sprite.animation),
          });
          uses.set(sprite.source, grouped);
        });
      });
      return;
    }

    asset.addAnimations.forEach((animation) => {
      animation.layers.forEach((layer) => {
        const grouped = uses.get(layer.source) ?? [];
        grouped.push({
          sourcePath: layer.source,
          geometry: standardAnimationGeometry(animation.animation),
        });
        uses.set(layer.source, grouped);
      });
    });
  });

  return uses;
}

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative))
  );
}

function canonicalRoot(root: string): string {
  try {
    return realpathSync.native(root);
  } catch {
    return root;
  }
}

function inspectSourceEntryPath(
  root: string,
  sourcePath: string,
): {
  readonly ok: true;
  readonly canonicalPath: string;
} | {
  readonly ok: false;
  readonly inspection: AssetPackSourceInspection;
} {
  const resolvedRoot = canonicalRoot(root);
  const resolvedPath = path.resolve(root, sourcePath);
  if (!isInsideRoot(root, resolvedPath)) {
    return {
      ok: false,
      inspection: {
        sourcePath,
        regularFile: false,
        error: 'outside-pack',
      },
    };
  }

  const relativePath = path.relative(root, resolvedPath);
  const segments = relativePath.split(path.sep).filter((segment) => segment.length > 0);
  let currentPath = root;
  for (const segment of segments) {
    currentPath = path.join(currentPath, segment);

    let currentStats: ReturnType<typeof lstatSync>;
    try {
      currentStats = lstatSync(currentPath);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error
        ? (error as { readonly code?: unknown }).code
        : undefined;
      if (code === 'ENOENT') {
        return {
          ok: false,
          inspection: {
            sourcePath,
            regularFile: false,
            error: 'missing',
          },
        };
      }
      throw error;
    }

    if (currentStats.isSymbolicLink()) {
      return {
        ok: false,
        inspection: {
          sourcePath,
          regularFile: false,
          error: 'not-regular',
        },
      };
    }

    const canonicalPath = realpathSync.native(currentPath);
    if (!isInsideRoot(resolvedRoot, canonicalPath)) {
      return {
        ok: false,
        inspection: {
          sourcePath,
          regularFile: false,
          error: 'outside-pack',
        },
      };
    }
  }

  return {
    ok: true,
    canonicalPath: realpathSync.native(resolvedPath),
  };
}

function geometryBounds(geometry: AnimationAuditGeometry): { width: number; height: number } {
  const maxColumn = Math.max(
    ...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)),
  );
  return {
    width: (maxColumn + 1) * geometry.frameSize,
    height: geometry.rows.length * geometry.frameSize,
  };
}

function geometryKey(geometry: AnimationAuditGeometry): string {
  const bounds = geometryBounds(geometry);
  return `${bounds.width}x${bounds.height}`;
}

function geometryForDimensions(
  uses: readonly SourceUse[],
  width: number,
  height: number,
): AnimationAuditGeometry | undefined {
  const key = `${width}x${height}`;
  return uses.find((use) => geometryKey(use.geometry) === key)?.geometry;
}

function decodeImageCells(
  image: Awaited<ReturnType<ReturnType<typeof createNodeCanvasAdapter>['loadImage']>>,
  geometry: AnimationAuditGeometry,
): DecodedImageData {
  const adapter = createNodeCanvasAdapter();
  const canvas = adapter.createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);

  const maxColumn = Math.max(
    ...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)),
  );
  const nonTransparentCells: string[] = [];
  const paletteColors = new Set<string>();

  for (const row of geometry.rows) {
    for (let column = 0; column <= maxColumn; column += 1) {
      const x = column * geometry.frameSize;
      const y = row.sourceRow * geometry.frameSize;
      const pixels = context.getImageData(
        x,
        y,
        geometry.frameSize,
        geometry.frameSize,
      ).data;
      let hasOpaquePixel = false;

      for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3];
        if (alpha === undefined || alpha === 0) {
          continue;
        }

        hasOpaquePixel = true;
        const red = pixels[index] ?? 0;
        const green = pixels[index + 1] ?? 0;
        const blue = pixels[index + 2] ?? 0;
        paletteColors.add(
          `#${red.toString(16).padStart(2, '0')}${green
            .toString(16)
            .padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`,
        );
      }

      if (hasOpaquePixel) {
        nonTransparentCells.push(`${row.sourceRow}:${column}`);
      }
    }
  }

  return {
    width: image.width,
    height: image.height,
    nonTransparentCells,
    paletteColors: [...paletteColors].sort((left, right) => left.localeCompare(right)),
  };
}

async function inspectSingleSource(
  root: string,
  sourcePath: string,
  uses: readonly SourceUse[],
): Promise<AssetPackSourceInspection> {
  const inspected = inspectSourceEntryPath(root, sourcePath);
  if (!inspected.ok) {
    return inspected.inspection;
  }

  const stats = lstatSync(inspected.canonicalPath);
  if (!stats.isFile()) {
    return {
      sourcePath,
      regularFile: false,
      error: 'not-regular',
    };
  }

  const digest = `sha256:${sha256Buffer(readFileSync(inspected.canonicalPath))}`;
  const adapter = createNodeCanvasAdapter();

  try {
    const image = await adapter.loadImage(inspected.canonicalPath);
    const matchedGeometry = geometryForDimensions(uses, image.width, image.height);
    if (!matchedGeometry) {
      return {
        sourcePath,
        digest,
        regularFile: true,
        decoded: {
          width: image.width,
          height: image.height,
          nonTransparentCells: [],
          paletteColors: [],
        },
      };
    }

    return {
      sourcePath,
      digest,
      regularFile: true,
      decoded: decodeImageCells(image, matchedGeometry),
    };
  } catch {
    return {
      sourcePath,
      digest,
      regularFile: true,
      error: 'decode-failed',
    };
  }
}

async function inspectCapturedSource(
  sourcePath: string,
  bytes: Buffer,
  digest: string,
  uses: readonly SourceUse[],
): Promise<AssetPackSourceInspection> {
  try {
    const image = await loadCanvasImage(bytes);
    const matchedGeometry = geometryForDimensions(uses, image.width, image.height);
    if (!matchedGeometry) {
      return {
        sourcePath,
        digest,
        regularFile: true,
        decoded: {
          width: image.width,
          height: image.height,
          nonTransparentCells: [],
          paletteColors: [],
        },
      };
    }

    return {
      sourcePath,
      digest,
      regularFile: true,
      decoded: decodeImageCells(image, matchedGeometry),
    };
  } catch {
    return {
      sourcePath,
      digest,
      regularFile: true,
      error: 'decode-failed',
    };
  }
}

async function inspectWithConcurrency(
  root: string,
  sourcePaths: readonly string[],
  uses: ReadonlyMap<string, readonly SourceUse[]>,
): Promise<readonly AssetPackSourceInspection[]> {
  const results: AssetPackSourceInspection[] = new Array(sourcePaths.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < sourcePaths.length) {
      const sourceIndex = nextIndex;
      nextIndex += 1;
      const sourcePath = sourcePaths[sourceIndex];
      if (!sourcePath) continue;
      results[sourceIndex] = await inspectSingleSource(
        root,
        sourcePath,
        uses.get(sourcePath) ?? [],
      );
    }
  }

  const workerCount = Math.min(INSPECTION_CONCURRENCY, sourcePaths.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export function loadActiveAssetPackBaseline(options: {
  readonly runtime: RuntimeAssets;
  readonly workspace?: AssetWorkspace;
}): ActiveAssetPackBaseline {
  const baseRecords = asItemDefinitions(loadJsonRecords(
    options.runtime.context.sheetDefinitionsRoot,
  ).records);
  const catalog = createCatalog(baseRecords).catalog;
  const palettes = createPaletteCatalog(
    Object.fromEntries(
      Object.entries(loadJsonRecords(options.runtime.context.paletteDefinitionsRoot).records)
        .filter(([, record]) => isRecord(record))
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  ).palettes;

  const definitionDigests = new Map<ItemId, string>();
  const creditDigests = new Map<ItemId, string>();

  for (const [itemId, item] of catalog.byItemId) {
    definitionDigests.set(itemId, definitionDigest(item));
    creditDigests.set(itemId, creditDigest(item));
  }

  return {
    catalog,
    palettes,
    definitionDigests,
    creditDigests,
  };
}

export async function inspectAssetPackSources(
  packDirectory: string,
  pack: NormalizedAssetPack,
): Promise<readonly AssetPackSourceInspection[]> {
  const absoluteRoot = path.resolve(packDirectory);
  const sourcePaths = collectUniqueSourcePaths(pack);
  const uses = collectSourceUses(pack);
  return inspectWithConcurrency(absoluteRoot, sourcePaths, uses);
}

async function inspectCapturedAssetPackSources(
  loaded: AssetPackPayloadSuccess,
): Promise<readonly AssetPackSourceInspection[]> {
  const sourcePaths = collectUniqueSourcePaths(loaded.pack);
  const uses = collectSourceUses(loaded.pack);
  const results: AssetPackSourceInspection[] = new Array(sourcePaths.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < sourcePaths.length) {
      const sourceIndex = nextIndex;
      nextIndex += 1;
      const sourcePath = sourcePaths[sourceIndex];
      if (!sourcePath) continue;
      const bytes = loaded.sourceBytes.get(sourcePath);
      const digest = loaded.sourceDigests.get(sourcePath);
      results[sourceIndex] = bytes && digest
        ? await inspectCapturedSource(sourcePath, bytes, digest, uses.get(sourcePath) ?? [])
        : {
            sourcePath,
            regularFile: false,
            error: 'missing',
          };
    }
  }

  const workerCount = Math.min(INSPECTION_CONCURRENCY, sourcePaths.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function contentDigest(
  pack: NormalizedAssetPack,
  inspections: readonly AssetPackSourceInspection[],
): string {
  return sha256Json({
    manifest: assetPackContentProjection(pack),
    sources: inspections.map((inspection) => ({
      sourcePath: inspection.sourcePath,
      digest: inspection.digest,
      error: inspection.error,
    })),
  });
}

function invalidManifestReport(
  packDirectory: string,
  message: string,
): AssetPackValidationReport {
  return {
    schema: VALIDATION_SCHEMA,
    packDirectory,
    valid: false,
    diagnostics: [{
      code: 'asset_pack_schema_invalid',
      severity: 'error',
      message,
      details: { path: MANIFEST_FILE },
    }],
    acknowledgementRecords: [],
  };
}

export async function validateAssetPackPayload(options: {
  readonly payload: AssetPackPayloadSuccess;
  readonly runtime: RuntimeAssets;
  readonly workspace?: AssetWorkspace;
  readonly origin: string;
}): Promise<AssetPackValidationReport> {
  const inspections = await inspectCapturedAssetPackSources(options.payload);
  const baseline = loadActiveAssetPackBaseline({
    runtime: options.runtime,
    ...(options.workspace ? { workspace: options.workspace } : {}),
  });
  const result = validateCoreAssetPack({
    pack: options.payload.pack,
    baseline,
    palettes: baseline.palettes,
    inspections,
    contentDigest: options.payload.contentDigest,
  });
  const compatibilityDiagnostics = checkAssetPackCompatibility(
    options.payload.pack,
    CLI_VERSION,
  );

  return {
    schema: VALIDATION_SCHEMA,
    packId: options.payload.pack.id,
    packDirectory: options.origin,
    contentDigest: options.payload.contentDigest,
    valid: result.ok && compatibilityDiagnostics.length === 0,
    diagnostics: [...compatibilityDiagnostics, ...result.diagnostics],
    acknowledgementRecords: result.acknowledgementRecords,
  };
}

export async function validateAssetPackDirectory(options: {
  readonly packDirectory: string;
  readonly runtime: RuntimeAssets;
  readonly workspace?: AssetWorkspace;
  readonly snapshot?: AssetPackFilesSuccess;
}): Promise<AssetPackValidationReport> {
  const absoluteRoot = path.resolve(options.packDirectory);
  let inspectedPack: NormalizedAssetPack;
  let inspections: readonly AssetPackSourceInspection[];
  let currentDigest: string;

  if (options.snapshot) {
    if (options.snapshot.root !== absoluteRoot) {
      return invalidManifestReport(absoluteRoot, 'Asset-pack snapshot root does not match validation root.');
    }
    return validateAssetPackPayload({
      payload: options.snapshot,
      runtime: options.runtime,
      ...(options.workspace ? { workspace: options.workspace } : {}),
      origin: absoluteRoot,
    });
  } else {
    const manifestBytes = readFileSync(path.join(absoluteRoot, MANIFEST_FILE));

    let manifestJson: unknown;
    try {
      manifestJson = JSON.parse(manifestBytes.toString('utf8')) as unknown;
    } catch (error) {
      return invalidManifestReport(
        absoluteRoot,
        error instanceof Error ? error.message : 'Invalid asset-pack JSON.',
      );
    }

    const parsed = parseAssetPackSource(manifestJson);
    if (!parsed.ok) {
      return {
        schema: VALIDATION_SCHEMA,
        packDirectory: absoluteRoot,
        valid: false,
        diagnostics: parsed.diagnostics,
        acknowledgementRecords: [],
      };
    }

    inspectedPack = normalizeAssetPack(parsed.source);
    inspections = await inspectAssetPackSources(absoluteRoot, inspectedPack);
    currentDigest = contentDigest(inspectedPack, inspections);
  }
  const baseline = loadActiveAssetPackBaseline({
    runtime: options.runtime,
    ...(options.workspace ? { workspace: options.workspace } : {}),
  });
  const result = validateCoreAssetPack({
    pack: inspectedPack,
    baseline,
    palettes: baseline.palettes,
    inspections,
    contentDigest: currentDigest,
  });
  const compatibilityDiagnostics = checkAssetPackCompatibility(inspectedPack, CLI_VERSION);

  return {
    schema: VALIDATION_SCHEMA,
    packId: inspectedPack.id,
    packDirectory: absoluteRoot,
    contentDigest: currentDigest,
    valid: result.ok && compatibilityDiagnostics.length === 0,
    diagnostics: [...compatibilityDiagnostics, ...result.diagnostics],
    acknowledgementRecords: result.acknowledgementRecords,
  };
}
