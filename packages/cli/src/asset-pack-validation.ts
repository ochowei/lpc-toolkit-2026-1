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
  type RawRecolors,
  type RecolorConfig,
} from '@lpc-toolkit/core';
import type { AssetWorkspace } from './asset-workspace.js';
import {
  loadAssetPackFiles,
  type AssetPackDirectoryFileOps,
  type AssetPackFileDiagnostic,
  type AssetPackFilesSuccess,
} from './asset-pack-files.js';
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
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_IHDR_LENGTH = 13;
const PNG_IHDR_END = 33;
const PNG_MAX_DIMENSION = 0x7fff_ffff;
const PNG_BIT_DEPTHS_BY_COLOR_TYPE: Readonly<Record<number, readonly number[]>> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};

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

function geometryForEveryDeclaredUse(
  uses: readonly SourceUse[],
  width: number,
  height: number,
): AnimationAuditGeometry | undefined {
  const first = uses[0]?.geometry;
  if (!first) return undefined;
  const key = `${width}x${height}`;
  return uses.every((use) => geometryKey(use.geometry) === key)
    ? first
    : undefined;
}

function pngCrc32(bytes: Buffer): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb8_8320 : 0);
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function readPngIhdrGeometry(rawBytes: Uint8Array): {
  readonly width: number;
  readonly height: number;
} | undefined {
  const bytes = Buffer.from(rawBytes);
  if (
    bytes.byteLength < PNG_IHDR_END
    || !bytes.subarray(0, PNG_SIGNATURE.byteLength).equals(PNG_SIGNATURE)
    || bytes.readUInt32BE(8) !== PNG_IHDR_LENGTH
    || bytes.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    return undefined;
  }

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  if (
    width === 0
    || height === 0
    || width > PNG_MAX_DIMENSION
    || height > PNG_MAX_DIMENSION
    || bitDepth === undefined
    || colorType === undefined
    || !PNG_BIT_DEPTHS_BY_COLOR_TYPE[colorType]?.includes(bitDepth)
    || bytes[26] !== 0
    || bytes[27] !== 0
    || (bytes[28] !== 0 && bytes[28] !== 1)
    || bytes.readUInt32BE(29) !== pngCrc32(bytes.subarray(12, 29))
  ) {
    return undefined;
  }
  return { width, height };
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

  const bytes = readFileSync(inspected.canonicalPath);
  const digest = `sha256:${sha256Buffer(bytes)}`;
  const ihdr = readPngIhdrGeometry(bytes);
  if (!ihdr) {
    return {
      sourcePath,
      digest,
      regularFile: true,
      error: 'decode-failed',
    };
  }

  const matchedGeometry = geometryForDimensions(uses, ihdr.width, ihdr.height);
  if (!matchedGeometry) {
    return {
      sourcePath,
      digest,
      regularFile: true,
      decoded: {
        width: ihdr.width,
        height: ihdr.height,
        nonTransparentCells: [],
        paletteColors: [],
      },
    };
  }

  try {
    const image = await loadCanvasImage(new Uint8Array(bytes));
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

interface RecolorEntry {
  readonly config: RecolorConfig;
  readonly path: string;
}

function collectRecolorEntries(
  recolor: RawRecolors | undefined,
  pathValue: string,
): readonly RecolorEntry[] {
  if (!recolor) return [];
  const entries: RecolorEntry[] = [];
  const multi = recolor as {
    readonly [key: `color_${number}`]: RecolorConfig | undefined;
  };
  for (let index = 1; index < 10; index += 1) {
    const config = multi[`color_${index}`];
    if (!config) break;
    entries.push({ config, path: `${pathValue}.color_${index}` });
  }
  return entries.length > 0
    ? entries
    : [{ config: recolor as RecolorConfig, path: pathValue }];
}

function normalizedColorRamp(colors: readonly string[]): readonly string[] | undefined {
  if (colors.length === 0) return undefined;
  const normalized: string[] = [];
  for (const color of colors) {
    const match = /^#?([0-9a-f]{6})$/i.exec(color);
    if (!match?.[1]) return undefined;
    normalized.push(`#${match[1].toLowerCase()}`);
  }
  return normalized;
}

function configuredSourceRamp(
  config: RecolorConfig,
  palettes: PaletteMetadata,
): readonly string[] | undefined {
  if (config.source) return normalizedColorRamp(config.source);

  const material = palettes.materials[config.material];
  if (!material) return undefined;
  let base = config.base;
  if (!base) {
    if (!material.default || !material.base) return undefined;
    base = `${material.default}.${material.base}`;
  } else if (!base.includes('.')) {
    if (!material.default) return undefined;
    base = `${material.default}.${base}`;
  }

  const [version, recolor] = base.split('.');
  if (!version || !recolor) return undefined;
  const ramp = material.palettes[version]?.[recolor];
  return ramp ? normalizedColorRamp(ramp) : undefined;
}

function requiredCells(geometry: AnimationAuditGeometry): readonly string[] {
  return geometry.rows.flatMap((row) =>
    row.cells.map((cell) => `${row.sourceRow}:${cell.sourceColumn}`),
  );
}

function validateRecolorSourceRamps(
  pack: NormalizedAssetPack,
  palettes: PaletteMetadata,
  inspections: readonly AssetPackSourceInspection[],
): readonly AssetPackDiagnostic[] {
  const diagnostics: AssetPackDiagnostic[] = [];
  const inspectionMap = new Map(inspections.map((inspection) => [
    inspection.sourcePath,
    inspection,
  ]));
  const uses = collectSourceUses(pack);

  pack.assets.forEach((asset, assetIndex) => {
    if (asset.kind !== 'new-item' || !asset.recolor) return;
    const entries = collectRecolorEntries(
      asset.recolor,
      `$.assets[${assetIndex}].recolor`,
    );
    const sourcePaths = [...new Set(asset.layers.flatMap((layer) =>
      layer.sprites.map((sprite) => sprite.source),
    ))].sort((left, right) => left.localeCompare(right));

    for (const sourcePath of sourcePaths) {
      const inspection = inspectionMap.get(sourcePath);
      const sourceUses = uses.get(sourcePath) ?? [];
      if (!inspection?.decoded || inspection.error) continue;
      const geometry = geometryForEveryDeclaredUse(
        sourceUses,
        inspection.decoded.width,
        inspection.decoded.height,
      );
      if (!geometry) continue;
      const presentCells = new Set(inspection.decoded.nonTransparentCells);
      if (requiredCells(geometry).some((cell) => !presentCells.has(cell))) continue;
      const presentColors = new Set(inspection.decoded.paletteColors);

      for (const entry of entries) {
        const requiredColors = configuredSourceRamp(entry.config, palettes);
        if (!requiredColors) continue;
        const missingColors = requiredColors.filter((color) => !presentColors.has(color));
        if (missingColors.length === 0) continue;
        diagnostics.push({
          code: 'asset_pack_schema_invalid',
          severity: 'error',
          message: `Configured recolor source ramp is not present in ${sourcePath}.`,
          assetId: asset.itemId,
          sourcePath,
          details: {
            path: entry.path,
            material: entry.config.material,
            requiredColors,
            missingColors,
          },
        });
      }
    }
  });

  return diagnostics.sort((left, right) => {
    const leftPath = typeof left.details?.path === 'string' ? left.details.path : '';
    const rightPath = typeof right.details?.path === 'string' ? right.details.path : '';
    return [leftPath, left.sourcePath ?? '', left.message]
      .join('\u0000')
      .localeCompare([rightPath, right.sourcePath ?? '', right.message].join('\u0000'));
  });
}

async function inspectCapturedSource(
  sourcePath: string,
  bytes: Buffer,
  digest: string,
  uses: readonly SourceUse[],
): Promise<AssetPackSourceInspection> {
  const ihdr = readPngIhdrGeometry(bytes);
  if (!ihdr) {
    return {
      sourcePath,
      digest,
      regularFile: true,
      error: 'decode-failed',
    };
  }

  const matchedGeometry = geometryForEveryDeclaredUse(uses, ihdr.width, ihdr.height);
  if (!matchedGeometry) {
    return {
      sourcePath,
      digest,
      regularFile: true,
      decoded: {
        width: ihdr.width,
        height: ihdr.height,
        nonTransparentCells: [],
        paletteColors: [],
      },
    };
  }

  try {
    const image = await loadCanvasImage(bytes);
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

function invalidFileReport(
  packDirectory: string,
  diagnostics: readonly AssetPackFileDiagnostic[],
): AssetPackValidationReport {
  return {
    schema: VALIDATION_SCHEMA,
    packDirectory,
    valid: false,
    diagnostics: diagnostics.map((diagnostic) => ({
      ...diagnostic,
      severity: 'error' as const,
    })),
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
  return validateInspectedAssetPack({
    pack: options.payload.pack,
    inspections,
    contentDigest: options.payload.contentDigest,
    runtime: options.runtime,
    ...(options.workspace ? { workspace: options.workspace } : {}),
    origin: options.origin,
  });
}

function validateInspectedAssetPack(options: {
  readonly pack: NormalizedAssetPack;
  readonly inspections: readonly AssetPackSourceInspection[];
  readonly contentDigest: string;
  readonly runtime: RuntimeAssets;
  readonly workspace?: AssetWorkspace;
  readonly origin: string;
}): AssetPackValidationReport {
  const baseline = loadActiveAssetPackBaseline({
    runtime: options.runtime,
    ...(options.workspace ? { workspace: options.workspace } : {}),
  });
  const result = validateCoreAssetPack({
    pack: options.pack,
    baseline,
    palettes: baseline.palettes,
    inspections: options.inspections,
    contentDigest: options.contentDigest,
  });
  const recolorDiagnostics = validateRecolorSourceRamps(
    options.pack,
    baseline.palettes,
    options.inspections,
  );
  const compatibilityDiagnostics = checkAssetPackCompatibility(
    options.pack,
    CLI_VERSION,
  );

  return {
    schema: VALIDATION_SCHEMA,
    packId: options.pack.id,
    packDirectory: options.origin,
    contentDigest: options.contentDigest,
    valid: result.ok && recolorDiagnostics.length === 0 && compatibilityDiagnostics.length === 0,
    diagnostics: [...compatibilityDiagnostics, ...result.diagnostics, ...recolorDiagnostics],
    acknowledgementRecords: result.acknowledgementRecords,
  };
}

async function inspectPartialAssetPackSources(options: {
  readonly pack: NormalizedAssetPack;
  readonly sourceBytes: ReadonlyMap<string, Buffer>;
  readonly diagnostics: readonly AssetPackFileDiagnostic[];
}): Promise<readonly AssetPackSourceInspection[]> {
  const sourcePaths = collectUniqueSourcePaths(options.pack);
  const uses = collectSourceUses(options.pack);
  const diagnostics = new Map(
    options.diagnostics
      .filter((diagnostic) => diagnostic.sourcePath !== undefined)
      .map((diagnostic) => [diagnostic.sourcePath!, diagnostic.code] as const),
  );
  return Promise.all(sourcePaths.map(async (sourcePath) => {
    const bytes = options.sourceBytes.get(sourcePath);
    if (bytes) {
      return inspectCapturedSource(
        sourcePath,
        bytes,
        `sha256:${sha256Buffer(bytes)}`,
        uses.get(sourcePath) ?? [],
      );
    }
    const code = diagnostics.get(sourcePath);
    return {
      sourcePath,
      regularFile: false,
      error: code === 'asset_source_missing'
        ? 'missing' as const
        : code === 'asset_source_outside_pack'
          ? 'outside-pack' as const
          : 'not-regular' as const,
    };
  }));
}

export async function validateAssetPackDirectory(options: {
  readonly packDirectory: string;
  readonly runtime: RuntimeAssets;
  readonly workspace?: AssetWorkspace;
  readonly snapshot?: AssetPackFilesSuccess;
  readonly fileOps?: AssetPackDirectoryFileOps;
}): Promise<AssetPackValidationReport> {
  const absoluteRoot = path.resolve(options.packDirectory);
  const snapshot = options.snapshot ?? await loadAssetPackFiles(
    absoluteRoot,
    options.fileOps,
  );
  if (!snapshot.ok) {
    if (
      snapshot.partial
      && !snapshot.diagnostics.some((diagnostic) =>
        diagnostic.code === 'asset_digest_mismatch')
    ) {
      const inspections = await inspectPartialAssetPackSources({
        pack: snapshot.partial.pack,
        sourceBytes: snapshot.partial.sourceBytes,
        diagnostics: snapshot.diagnostics,
      });
      return validateInspectedAssetPack({
        pack: snapshot.partial.pack,
        inspections,
        contentDigest: contentDigest(snapshot.partial.pack, inspections),
        runtime: options.runtime,
        ...(options.workspace ? { workspace: options.workspace } : {}),
        origin: absoluteRoot,
      });
    }
    return invalidFileReport(absoluteRoot, snapshot.diagnostics);
  }
  if (snapshot.root !== absoluteRoot) {
    return invalidManifestReport(absoluteRoot, 'Asset-pack snapshot root does not match validation root.');
  }
  return validateAssetPackPayload({
    payload: snapshot,
    runtime: options.runtime,
    ...(options.workspace ? { workspace: options.workspace } : {}),
    origin: absoluteRoot,
  });
}
