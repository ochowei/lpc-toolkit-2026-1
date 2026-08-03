import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import {
  inspectAssetPackSourceBytes,
  type AssetPackSha256,
} from '@lpc-toolkit/asset-pack-format';
import {
  assetPackContentProjection,
  createCatalog,
  createPaletteCatalog,
  validateAssetPack as validateCoreAssetPack,
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
import {
  loadAssetPackFiles,
  type AssetPackDirectoryFileOps,
  type AssetPackFileDiagnostic,
  type AssetPackFilesSuccess,
} from './asset-pack-files.js';
import { nodeAssetPackPngDecoder } from './asset-pack-node-runtime.js';
import type { AssetPackPayloadSuccess } from './asset-pack-payload.js';
import { loadJsonRecords } from './loaders.js';
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
  readonly manifestDigest?: string;
  readonly sourceDigests?: readonly AssetPackValidationSourceDigest[];
  readonly valid: boolean;
  readonly diagnostics: readonly (AssetPackDiagnostic | AssetPackLifecycleDiagnostic)[];
  readonly acknowledgementRecords: readonly AssetPackAcknowledgement[];
}

export interface AssetPackValidationSourceDigest {
  readonly path: string;
  readonly digest: string;
}

export interface AssetPackValidationEvidence {
  readonly manifestDigest: string;
  readonly sourceDigests: readonly AssetPackValidationSourceDigest[];
}

const VALIDATION_SCHEMA = 'lpc-toolkit.asset-pack-validation.v1' as const;
const MANIFEST_FILE = 'asset-pack.json';
const INSPECTION_CONCURRENCY = 4;

function sha256Buffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function validationEvidence(
  payload: AssetPackPayloadSuccess,
): AssetPackValidationEvidence {
  return {
    manifestDigest: `sha256:${sha256Buffer(payload.manifestBytes)}`,
    sourceDigests: [...payload.sourceDigests.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([sourcePath, digest]) => ({ path: sourcePath, digest })),
  };
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
async function captureDirectorySourceBytes(options: {
  readonly packDirectory: string;
  readonly pack: NormalizedAssetPack;
}): Promise<{
  readonly sourcePaths: readonly string[];
  readonly sourceBytes: ReadonlyMap<string, Uint8Array>;
  readonly sourceDigests: ReadonlyMap<string, AssetPackSha256>;
  readonly pathErrors: ReadonlyMap<string, AssetPackSourceInspection>;
}> {
  const sourcePaths = collectUniqueSourcePaths(options.pack);
  const sourceBytes = new Map<string, Uint8Array>();
  const sourceDigests = new Map<string, AssetPackSha256>();
  const pathErrors = new Map<string, AssetPackSourceInspection>();
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < sourcePaths.length) {
      const sourceIndex = nextIndex;
      nextIndex += 1;
      const sourcePath = sourcePaths[sourceIndex];
      if (!sourcePath) continue;
      const inspected = inspectSourceEntryPath(options.packDirectory, sourcePath);
      if (!inspected.ok) {
        pathErrors.set(sourcePath, inspected.inspection);
        continue;
      }

      const stats = lstatSync(inspected.canonicalPath);
      if (!stats.isFile()) {
        pathErrors.set(sourcePath, {
          sourcePath,
          regularFile: false,
          error: 'not-regular',
        });
        continue;
      }

      const bytes = readFileSync(inspected.canonicalPath);
      sourceBytes.set(sourcePath, new Uint8Array(bytes));
      sourceDigests.set(sourcePath, `sha256:${sha256Buffer(bytes)}`);
    }
  }

  const workerCount = Math.min(INSPECTION_CONCURRENCY, sourcePaths.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return { sourcePaths, sourceBytes, sourceDigests, pathErrors };
}

function mergeInspections(options: {
  readonly sourcePaths: readonly string[];
  readonly inspected: readonly AssetPackSourceInspection[];
  readonly overrides: ReadonlyMap<string, AssetPackSourceInspection>;
}): readonly AssetPackSourceInspection[] {
  const inspectedBySource = new Map(options.inspected.map((inspection) => [
    inspection.sourcePath,
    inspection,
  ]));
  return options.sourcePaths.map((sourcePath) =>
    options.overrides.get(sourcePath)
    ?? inspectedBySource.get(sourcePath)
    ?? {
      sourcePath,
      regularFile: false,
      error: 'missing',
    });
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
  const captured = await captureDirectorySourceBytes({
    packDirectory: absoluteRoot,
    pack,
  });
  const inspected = await inspectAssetPackSourceBytes({
    pack,
    sourceBytes: captured.sourceBytes,
    sourceDigests: captured.sourceDigests,
    decoder: nodeAssetPackPngDecoder,
  });
  return mergeInspections({
    sourcePaths: captured.sourcePaths,
    inspected,
    overrides: captured.pathErrors,
  });
}

async function inspectCapturedAssetPackSources(
  loaded: AssetPackPayloadSuccess,
): Promise<readonly AssetPackSourceInspection[]> {
  return inspectAssetPackSourceBytes({
    pack: loaded.pack,
    sourceBytes: loaded.sourceBytes,
    sourceDigests: loaded.sourceDigests,
    decoder: nodeAssetPackPngDecoder,
  });
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
    evidence: validationEvidence(options.payload),
    runtime: options.runtime,
    ...(options.workspace ? { workspace: options.workspace } : {}),
    origin: options.origin,
  });
}

function validateInspectedAssetPack(options: {
  readonly pack: NormalizedAssetPack;
  readonly inspections: readonly AssetPackSourceInspection[];
  readonly contentDigest: string;
  readonly evidence?: AssetPackValidationEvidence;
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
  const compatibilityDiagnostics = checkAssetPackCompatibility(
    options.pack,
    CLI_VERSION,
  );

  return {
    schema: VALIDATION_SCHEMA,
    packId: options.pack.id,
    packDirectory: options.origin,
    contentDigest: options.contentDigest,
    ...(options.evidence === undefined ? {} : {
      manifestDigest: options.evidence.manifestDigest,
      sourceDigests: options.evidence.sourceDigests,
    }),
    valid: result.ok && compatibilityDiagnostics.length === 0,
    diagnostics: [...compatibilityDiagnostics, ...result.diagnostics],
    acknowledgementRecords: result.acknowledgementRecords,
  };
}

async function inspectPartialAssetPackSources(options: {
  readonly pack: NormalizedAssetPack;
  readonly sourceBytes: ReadonlyMap<string, Buffer>;
  readonly diagnostics: readonly AssetPackFileDiagnostic[];
}): Promise<readonly AssetPackSourceInspection[]> {
  const sourcePaths = collectUniqueSourcePaths(options.pack);
  const diagnostics = new Map(
    options.diagnostics
      .filter((diagnostic) => diagnostic.sourcePath !== undefined)
      .map((diagnostic) => [diagnostic.sourcePath!, diagnostic.code] as const),
  );
  const capturedBytes = new Map<string, Uint8Array>();
  const capturedDigests = new Map<string, AssetPackSha256>();
  const overrides = new Map<string, AssetPackSourceInspection>();

  sourcePaths.forEach((sourcePath) => {
    const bytes = options.sourceBytes.get(sourcePath);
    if (bytes) {
      capturedBytes.set(sourcePath, new Uint8Array(bytes));
      capturedDigests.set(sourcePath, `sha256:${sha256Buffer(bytes)}`);
      return;
    }
    const code = diagnostics.get(sourcePath);
    overrides.set(sourcePath, {
      sourcePath,
      regularFile: false,
      error: code === 'asset_source_missing'
        ? 'missing' as const
        : code === 'asset_source_outside_pack'
          ? 'outside-pack' as const
          : 'not-regular' as const,
    });
  });

  const inspected = await inspectAssetPackSourceBytes({
    pack: options.pack,
    sourceBytes: capturedBytes,
    sourceDigests: capturedDigests,
    decoder: nodeAssetPackPngDecoder,
  });
  return mergeInspections({
    sourcePaths,
    inspected,
    overrides,
  });
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
