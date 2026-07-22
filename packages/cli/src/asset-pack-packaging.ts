import { createHash, randomUUID } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  assetPackSourceFromNormalized,
  type AssetPackSource,
  type NormalizedAssetPack,
} from '@lpc-toolkit/core';
import {
  createDeterministicAssetPackArchive,
} from './asset-pack-archive-format.js';
import type { AssetPackLifecycleDiagnostic } from './asset-pack-compatibility.js';
import {
  loadAssetPackFiles,
  type AssetPackDirectoryFileOps,
} from './asset-pack-files.js';
import type { AssetWorkspace } from './asset-workspace.js';
import {
  validateAssetPackDirectory,
} from './asset-pack-validation.js';
import type { RuntimeAssets } from './runtime-assets.js';

export interface AssetPackArchivePublicationFileOps {
  readonly lstatSync: typeof lstatSync;
  readonly writeFileSync: typeof writeFileSync;
  readonly renameSync: typeof renameSync;
  readonly rmSync: typeof rmSync;
}

export interface PackAssetPackSuccess {
  readonly ok: true;
  readonly packId: string;
  readonly version: string;
  readonly contentDigest: string;
  readonly archiveDigest: string;
  readonly archivePath: string;
  readonly entryCount: number;
}

export type PackAssetPackResult =
  | PackAssetPackSuccess
  | { readonly ok: false; readonly diagnostics: readonly AssetPackLifecycleDiagnostic[] };

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => sortJson(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([key, entry]) => [key, sortJson(entry)]),
    );
  }
  return value;
}

function compareArchiveAssets(
  packId: string,
  left: AssetPackSource['assets'][number],
  right: AssetPackSource['assets'][number],
): number {
  const leftId = left.kind === 'new-item' ? `${packId}--${left.localId}` : left.itemId;
  const rightId = right.kind === 'new-item' ? `${packId}--${right.localId}` : right.itemId;
  return compareCodeUnits(leftId, rightId);
}

function canonicalArchiveAsset(
  asset: AssetPackSource['assets'][number],
): AssetPackSource['assets'][number] {
  if (asset.kind === 'new-item') {
    return {
      ...asset,
      layers: asset.layers.map((layer) => ({
        ...layer,
        sprites: [...layer.sprites].sort((left, right) =>
          compareCodeUnits(left.animation, right.animation)
          || compareCodeUnits(left.variant ?? '', right.variant ?? '')
          || compareCodeUnits(left.source, right.source)
          || compareCodeUnits(left.bodyTypes?.join('\0') ?? '', right.bodyTypes?.join('\0') ?? '')),
      })),
      ...(asset.variants
        ? { variants: [...asset.variants].sort(compareCodeUnits) }
        : {}),
    };
  }

  return {
    ...asset,
    addAnimations: asset.addAnimations.map((animation) => ({
      ...animation,
      layers: [...animation.layers].sort((left, right) =>
        compareCodeUnits(left.layer, right.layer)
        || compareCodeUnits(left.variant ?? '', right.variant ?? '')
        || compareCodeUnits(left.source, right.source)),
    })),
  };
}

function canonicalArchiveSource(pack: NormalizedAssetPack): AssetPackSource {
  const source = assetPackSourceFromNormalized(pack);
  return {
    ...source,
    ...(source.compatibility ? {
      compatibility: {
        ...source.compatibility,
        ...(source.compatibility.requiredCapabilities ? {
          requiredCapabilities: [...source.compatibility.requiredCapabilities].sort(compareCodeUnits),
        } : {}),
      },
    } : {}),
    ...(source.replaces ? {
      replaces: source.replaces
        .map((replacement) => ({
          ...replacement,
          assets: [...replacement.assets].sort(compareCodeUnits),
        }))
        .sort((left, right) =>
          compareCodeUnits(left.packId, right.packId)
          || compareCodeUnits(left.versions, right.versions)
          || compareCodeUnits(left.assets.join('\0'), right.assets.join('\0'))),
    } : {}),
    ...(source.acknowledgements ? {
      acknowledgements: [...source.acknowledgements].sort((left, right) =>
        compareCodeUnits(left.code, right.code)
        || compareCodeUnits(left.contentDigest, right.contentDigest)
        || compareCodeUnits(left.reason, right.reason)
        || compareCodeUnits(
          JSON.stringify(sortJson(left.subject)),
          JSON.stringify(sortJson(right.subject)),
        )),
    } : {}),
    assets: source.assets
      .map(canonicalArchiveAsset)
      .sort((left, right) => compareArchiveAssets(source.id, left, right)),
  };
}

function archiveDigest(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function failure(
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): PackAssetPackResult {
  return {
    ok: false,
    diagnostics: [{
      code,
      severity: 'error',
      message,
      ...(details === undefined ? {} : { details }),
    }],
  };
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function assertPublicationDirectory(
  directory: string,
  fileOps: AssetPackArchivePublicationFileOps,
): string | undefined {
  try {
    const status = fileOps.lstatSync(directory);
    if (!status.isDirectory() || status.isSymbolicLink()) {
      return `Asset-pack archive directory must be a non-symlink directory: ${directory}.`;
    }
  } catch (error) {
    return error instanceof Error
      ? `Could not inspect asset-pack archive directory: ${error.message}`
      : 'Could not inspect asset-pack archive directory.';
  }
  return undefined;
}

function assertArchiveTarget(
  archivePath: string,
  fileOps: AssetPackArchivePublicationFileOps,
): string | undefined {
  try {
    const status = fileOps.lstatSync(archivePath);
    if (!status.isFile() || status.isSymbolicLink()) {
      return `Asset-pack archive target must be a regular file when it exists: ${archivePath}.`;
    }
  } catch (error) {
    if (isMissing(error)) return undefined;
    return error instanceof Error
      ? `Could not inspect asset-pack archive target: ${error.message}`
      : 'Could not inspect asset-pack archive target.';
  }
  return undefined;
}

function siblingPath(archivePath: string, kind: 'tmp' | 'bak'): string {
  return path.join(
    path.dirname(archivePath),
    `.${path.basename(archivePath)}.${randomUUID()}.${kind}`,
  );
}

function asLifecycleDiagnostics(
  diagnostics: readonly {
    readonly code: string;
    readonly message: string;
    readonly severity?: 'error' | 'warning';
    readonly path?: string;
    readonly packId?: string;
    readonly details?: Readonly<Record<string, unknown>>;
  }[],
): readonly AssetPackLifecycleDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity ?? 'error',
    message: diagnostic.message,
    ...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
    ...(diagnostic.packId === undefined ? {} : { packId: diagnostic.packId }),
    ...(diagnostic.details === undefined ? {} : { details: diagnostic.details }),
  }));
}

function assertPathMissing(
  candidate: string,
  fileOps: AssetPackArchivePublicationFileOps,
): void {
  try {
    fileOps.lstatSync(candidate);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  throw new Error(`Refusing to reuse an existing asset-pack publication path: ${candidate}.`);
}

export async function packAssetPack(options: {
  readonly packDirectory: string;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly fileOps?: AssetPackArchivePublicationFileOps;
  readonly sourceFileOps?: AssetPackDirectoryFileOps;
}): Promise<PackAssetPackResult> {
  const fileOps: AssetPackArchivePublicationFileOps = options.fileOps ?? {
    lstatSync,
    writeFileSync,
    renameSync,
    rmSync,
  };
  const packDirectory = path.resolve(options.packDirectory);
  let snapshot;
  try {
    snapshot = loadAssetPackFiles(packDirectory, options.sourceFileOps);
  } catch (error) {
    return failure(
      'asset_pack_load_failed',
      error instanceof Error ? error.message : 'Could not load asset-pack source.',
      { packDirectory },
    );
  }
  if (!snapshot.ok) {
    return { ok: false, diagnostics: asLifecycleDiagnostics(snapshot.diagnostics) };
  }

  const validation = await validateAssetPackDirectory({
    packDirectory,
    workspace: options.workspace,
    runtime: options.runtime,
    snapshot,
  });
  if (!validation.valid) {
    return { ok: false, diagnostics: asLifecycleDiagnostics(validation.diagnostics) };
  }

  const manifestBytes = Buffer.from(`${JSON.stringify(
    sortJson(canonicalArchiveSource(snapshot.pack)),
    null,
    2,
  )}\n`);
  let archiveBytes: Buffer;
  try {
    archiveBytes = await createDeterministicAssetPackArchive({
      manifestBytes,
      sourceBytes: snapshot.sourceBytes,
    });
  } catch (error) {
    return failure(
      'asset_pack_archive_failed',
      error instanceof Error ? error.message : 'Could not create asset-pack archive.',
    );
  }

  const archivePath = path.join(
    path.dirname(snapshot.root),
    `${snapshot.pack.id}-${snapshot.pack.version}.lpc-assets.zip`,
  );
  const directoryError = assertPublicationDirectory(path.dirname(archivePath), fileOps);
  if (directoryError) return failure('asset_pack_archive_target_unsafe', directoryError);
  const targetError = assertArchiveTarget(archivePath, fileOps);
  if (targetError) return failure('asset_pack_archive_target_unsafe', targetError);

  const expectedArchiveDigest = archiveDigest(archiveBytes);
  const temporaryPath = siblingPath(archivePath, 'tmp');
  const backupPath = siblingPath(archivePath, 'bak');
  let temporaryExists = false;
  let backupExists = false;
  let archivePublished = false;

  try {
    assertPathMissing(temporaryPath, fileOps);
    assertPathMissing(backupPath, fileOps);
    fileOps.writeFileSync(temporaryPath, archiveBytes, { flag: 'wx', mode: 0o600 });
    temporaryExists = true;
    if (archiveDigest(readFileSync(temporaryPath)) !== expectedArchiveDigest) {
      throw new Error('Asset-pack archive temporary file digest did not match the generated archive.');
    }

    try {
      const currentTargetError = assertArchiveTarget(archivePath, fileOps);
      if (currentTargetError) throw new Error(currentTargetError);
      fileOps.lstatSync(archivePath);
      fileOps.renameSync(archivePath, backupPath);
      backupExists = true;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }

    fileOps.renameSync(temporaryPath, archivePath);
    temporaryExists = false;
    archivePublished = true;
    if (backupExists) {
      fileOps.rmSync(backupPath, { force: true });
      backupExists = false;
    }
  } catch (error) {
    const rollbackErrors: string[] = [];
    if (archivePublished) {
      try {
        fileOps.rmSync(archivePath, { force: true });
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
      }
    }
    if (backupExists) {
      try {
        fileOps.renameSync(backupPath, archivePath);
        backupExists = false;
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
      }
    }
    if (temporaryExists) {
      try {
        fileOps.rmSync(temporaryPath, { force: true });
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
      }
    }
    return failure(
      'asset_pack_publish_failed',
      error instanceof Error ? error.message : 'Could not publish asset-pack archive.',
      rollbackErrors.length === 0 ? undefined : { rollbackErrors },
    );
  }

  return {
    ok: true,
    packId: snapshot.pack.id,
    version: snapshot.pack.version,
    contentDigest: snapshot.contentDigest,
    archiveDigest: expectedArchiveDigest,
    archivePath,
    entryCount: snapshot.sourceBytes.size + 2,
  };
}
