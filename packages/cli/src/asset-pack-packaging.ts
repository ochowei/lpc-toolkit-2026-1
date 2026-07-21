import { createHash, randomUUID } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { assetPackSourceFromNormalized } from '@lpc-toolkit/core';
import {
  createDeterministicAssetPackArchive,
} from './asset-pack-archive-format.js';
import type { AssetPackLifecycleDiagnostic } from './asset-pack-compatibility.js';
import { loadAssetPackFiles } from './asset-pack-files.js';
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

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => sortJson(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJson(entry)]),
    );
  }
  return value;
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
    snapshot = loadAssetPackFiles(packDirectory);
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
    sortJson(assetPackSourceFromNormalized(snapshot.pack)),
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
