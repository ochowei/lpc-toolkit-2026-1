import {
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  type Stats,
} from 'node:fs';
import path from 'node:path';
import {
  normalizeAssetPack,
  parseAssetPackSource,
  type NormalizedAssetPack,
} from '@lpc-toolkit/core';
import {
  parseAssetPackPayload,
  type AssetPackFileDiagnostic,
  type AssetPackPayloadSuccess,
} from './asset-pack-payload.js';
import {
  assetPackManagedFileIdentity,
  readAssetPackManagedFile,
  type AssetPackManagedFileOps,
} from './asset-pack-managed-file.js';

const MANIFEST_FILE = 'asset-pack.json';

export type { AssetPackFileDiagnostic } from './asset-pack-payload.js';

export interface AssetPackFilesSuccess extends AssetPackPayloadSuccess {
  readonly root: string;
  readonly manifestPath: string;
  readonly manifestMtimeMs: number;
}

export interface AssetPackFilesFailure {
  readonly ok: false;
  readonly diagnostics: readonly AssetPackFileDiagnostic[];
  readonly partial?: {
    readonly manifestBytes: Buffer;
    readonly pack: NormalizedAssetPack;
    readonly sourceBytes: ReadonlyMap<string, Buffer>;
  };
}

export type AssetPackFilesResult = AssetPackFilesSuccess | AssetPackFilesFailure;

export interface AssetPackDirectoryFileOps
  extends Omit<AssetPackManagedFileOps, 'lstatSync'> {
  readonly lstatSync: typeof lstatSync;
  readonly realpathSync: (target: string) => string;
}

const DEFAULT_DIRECTORY_FILE_OPS: AssetPackDirectoryFileOps = {
  openSync,
  closeSync,
  fstatSync,
  readFileSync,
  lstatSync,
  realpathSync: realpathSync.native,
};

type CaptureDiagnosticCode =
  | 'asset_source_missing'
  | 'asset_source_outside_pack'
  | 'asset_source_symlink'
  | 'asset_source_not_regular'
  | 'asset_digest_mismatch';

class AssetPackCaptureError extends Error {
  constructor(
    readonly diagnosticCode: CaptureDiagnosticCode,
    readonly targetPath: string,
    message: string,
  ) {
    super(message);
    this.name = 'AssetPackCaptureError';
  }
}

interface PinnedPathEntry {
  readonly targetPath: string;
  readonly canonicalPath: string;
  readonly stats: Stats;
}

interface PinnedPackRoot extends PinnedPathEntry {
  readonly rootPath: string;
}

interface PinnedContainedFile extends PinnedPathEntry {
  readonly parents: readonly PinnedPathEntry[];
}

interface CapturedContainedFile extends PinnedContainedFile {
  readonly bytes: Buffer;
}

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === ''
    || (relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative))
  );
}

function sameIdentity(left: Stats, right: Stats): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs
    && left.birthtimeMs === right.birthtimeMs;
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    && typeof error.code === 'string'
    ? error.code
    : undefined;
}

function captureError(
  code: CaptureDiagnosticCode,
  targetPath: string,
  message: string,
): never {
  throw new AssetPackCaptureError(code, targetPath, message);
}

function pinPackRoot(
  rootPath: string,
  fileOps: AssetPackDirectoryFileOps,
): PinnedPackRoot {
  let stats: Stats;
  try {
    stats = fileOps.lstatSync(rootPath);
  } catch (error) {
    if (errorCode(error) === 'ENOENT' || errorCode(error) === 'ENOTDIR') {
      captureError('asset_source_missing', rootPath, `Asset-pack root is missing: ${rootPath}.`);
    }
    throw error;
  }
  if (stats.isSymbolicLink()) {
    captureError(
      'asset_source_symlink',
      rootPath,
      `Asset-pack root must not be a symbolic link: ${rootPath}.`,
    );
  }
  if (!stats.isDirectory()) {
    captureError(
      'asset_source_not_regular',
      rootPath,
      `Asset-pack root must be a directory: ${rootPath}.`,
    );
  }
  const canonicalPath = fileOps.realpathSync(rootPath);
  const canonicalStats = fileOps.lstatSync(canonicalPath);
  if (
    canonicalStats.isSymbolicLink()
    || !canonicalStats.isDirectory()
    || !sameIdentity(stats, canonicalStats)
  ) {
    captureError(
      'asset_digest_mismatch',
      rootPath,
      `Asset-pack root changed while its identity was captured: ${rootPath}.`,
    );
  }
  return { rootPath, targetPath: rootPath, canonicalPath, stats };
}

function verifyPinnedEntry(
  entry: PinnedPathEntry,
  expectedKind: 'directory' | 'file',
  fileOps: AssetPackDirectoryFileOps,
): void {
  let stats: Stats;
  let canonicalPath: string;
  try {
    stats = fileOps.lstatSync(entry.targetPath);
    canonicalPath = fileOps.realpathSync(entry.targetPath);
  } catch (error) {
    captureError(
      'asset_digest_mismatch',
      entry.targetPath,
      `Asset-pack path changed during capture: ${entry.targetPath}. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const expectedType = expectedKind === 'directory' ? stats.isDirectory() : stats.isFile();
  if (
    stats.isSymbolicLink()
    || !expectedType
    || !sameIdentity(entry.stats, stats)
    || canonicalPath !== entry.canonicalPath
  ) {
    captureError(
      'asset_digest_mismatch',
      entry.targetPath,
      `Asset-pack path changed during capture: ${entry.targetPath}.`,
    );
  }
}

function pinContainedFile(
  root: PinnedPackRoot,
  sourcePath: string,
  fileOps: AssetPackDirectoryFileOps,
): PinnedContainedFile {
  verifyPinnedEntry(root, 'directory', fileOps);
  const resolvedPath = path.resolve(root.rootPath, sourcePath);
  if (!isInsideRoot(root.rootPath, resolvedPath) || resolvedPath === root.rootPath) {
    captureError(
      'asset_source_outside_pack',
      resolvedPath,
      `Asset-pack source must remain inside its root: ${sourcePath}.`,
    );
  }
  const relativePath = path.relative(root.rootPath, resolvedPath);
  const segments = relativePath.split(path.sep).filter((segment) => segment.length > 0);
  const parents: PinnedPathEntry[] = [];
  let currentPath = root.rootPath;
  for (const [index, segment] of segments.entries()) {
    currentPath = path.join(currentPath, segment);
    let stats: Stats;
    try {
      stats = fileOps.lstatSync(currentPath);
    } catch (error) {
      if (errorCode(error) === 'ENOENT' || errorCode(error) === 'ENOTDIR') {
        captureError(
          'asset_source_missing',
          currentPath,
          `Asset-pack source is missing: ${sourcePath}.`,
        );
      }
      throw error;
    }
    if (stats.isSymbolicLink()) {
      captureError(
        'asset_source_symlink',
        currentPath,
        `Asset-pack source must not traverse a symbolic link: ${sourcePath}.`,
      );
    }
    const isFinal = index === segments.length - 1;
    if ((!isFinal && !stats.isDirectory()) || (isFinal && !stats.isFile())) {
      captureError(
        'asset_source_not_regular',
        currentPath,
        `Asset-pack source must use directories and end at a regular file: ${sourcePath}.`,
      );
    }
    const canonicalPath = fileOps.realpathSync(currentPath);
    if (!isInsideRoot(root.canonicalPath, canonicalPath)) {
      captureError(
        'asset_source_outside_pack',
        currentPath,
        `Asset-pack source resolves outside its root: ${sourcePath}.`,
      );
    }
    const pinned = { targetPath: currentPath, canonicalPath, stats };
    if (isFinal) return { ...pinned, parents };
    parents.push(pinned);
  }
  return captureError(
    'asset_source_missing',
    resolvedPath,
    `Asset-pack source is missing: ${sourcePath}.`,
  );
}

function captureContainedFile(options: {
  readonly root: PinnedPackRoot;
  readonly sourcePath: string;
  readonly label: string;
  readonly fileOps: AssetPackDirectoryFileOps;
}): CapturedContainedFile {
  const pinned = pinContainedFile(options.root, options.sourcePath, options.fileOps);
  const snapshot = readAssetPackManagedFile({
    filePath: pinned.targetPath,
    label: options.label,
    fileOps: options.fileOps,
  });
  if (snapshot.identity !== assetPackManagedFileIdentity(pinned.stats)) {
    captureError(
      'asset_digest_mismatch',
      pinned.targetPath,
      `Asset-pack source changed before descriptor capture: ${options.sourcePath}.`,
    );
  }
  verifyPinnedEntry(options.root, 'directory', options.fileOps);
  for (const parent of pinned.parents) {
    verifyPinnedEntry(parent, 'directory', options.fileOps);
  }
  verifyPinnedEntry(pinned, 'file', options.fileOps);
  return { ...pinned, bytes: snapshot.bytes };
}

function uniqueSourcePaths(pack: NormalizedAssetPack): readonly string[] {
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

function sourceDiagnostic(
  code: AssetPackFileDiagnostic['code'],
  root: string,
  sourcePath: string,
  details?: Readonly<Record<string, unknown>>,
): AssetPackFileDiagnostic {
  return {
    code,
    message: `Invalid asset-pack source: ${sourcePath}`,
    path: path.join(root, sourcePath),
    sourcePath,
    ...(details ? { details } : {}),
  };
}

function pathDiagnostic(
  root: string,
  sourcePath: string,
  error: unknown,
): AssetPackFileDiagnostic {
  if (error instanceof AssetPackCaptureError) {
    if (sourcePath !== '.' && error.diagnosticCode !== 'asset_digest_mismatch') {
      return sourceDiagnostic(error.diagnosticCode, root, sourcePath);
    }
    return {
      code: error.diagnosticCode,
      message: error.message,
      path: error.targetPath,
      ...(sourcePath === '.' ? {} : { sourcePath }),
    };
  }
  return {
    code: 'asset_digest_mismatch',
    message: error instanceof Error ? error.message : String(error),
    path: sourcePath === '.' ? root : path.join(root, sourcePath),
    ...(sourcePath === '.' ? {} : { sourcePath }),
  };
}

function inspectSources(
  root: PinnedPackRoot,
  pack: NormalizedAssetPack,
  fileOps: AssetPackDirectoryFileOps,
): {
  readonly diagnostics: readonly AssetPackFileDiagnostic[];
  readonly sourceBytes: ReadonlyMap<string, Buffer>;
} {
  const diagnostics: AssetPackFileDiagnostic[] = [];
  const sourceBytes = new Map<string, Buffer>();
  const canonicalOwners = new Map<string, string>();

  uniqueSourcePaths(pack).forEach((sourcePath) => {
    let captured: CapturedContainedFile;
    try {
      captured = captureContainedFile({
        root,
        sourcePath,
        label: `Asset-pack source ${sourcePath}`,
        fileOps,
      });
    } catch (error) {
      diagnostics.push(pathDiagnostic(root.rootPath, sourcePath, error));
      return;
    }
    const existingOwner = canonicalOwners.get(captured.canonicalPath);
    if (existingOwner !== undefined) {
      diagnostics.push(sourceDiagnostic(
        'asset_source_duplicate_canonical_path',
        root.rootPath,
        sourcePath,
        { duplicateOf: existingOwner },
      ));
      return;
    }
    canonicalOwners.set(captured.canonicalPath, sourcePath);
    sourceBytes.set(sourcePath, captured.bytes);
  });

  return { diagnostics, sourceBytes };
}

export function loadAssetPackFiles(
  root: string,
  fileOps: AssetPackDirectoryFileOps = DEFAULT_DIRECTORY_FILE_OPS,
): AssetPackFilesResult {
  const absoluteRoot = path.resolve(root);
  const manifestPath = path.join(absoluteRoot, MANIFEST_FILE);
  let pinnedRoot: PinnedPackRoot;
  try {
    pinnedRoot = pinPackRoot(absoluteRoot, fileOps);
  } catch (error) {
    return { ok: false, diagnostics: [pathDiagnostic(absoluteRoot, '.', error)] };
  }
  let manifest: CapturedContainedFile;
  try {
    manifest = captureContainedFile({
      root: pinnedRoot,
      sourcePath: MANIFEST_FILE,
      label: 'Asset-pack manifest',
      fileOps,
    });
  } catch (error) {
    return {
      ok: false,
      diagnostics: [pathDiagnostic(absoluteRoot, MANIFEST_FILE, error)],
    };
  }
  const manifestBytes = manifest.bytes;
  const manifestMtimeMs = manifest.stats.mtimeMs;

  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(manifestBytes.toString('utf8')) as unknown;
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{
        code: 'asset_pack_manifest_json_invalid',
        message: error instanceof Error ? error.message : 'Invalid asset-pack JSON.',
        path: manifestPath,
      }],
    };
  }

  const parsed = parseAssetPackSource(manifestJson);
  if (!parsed.ok) {
    return { ok: false, diagnostics: parsed.diagnostics };
  }

  const pack = normalizeAssetPack(parsed.source);
  const inspected = inspectSources(pinnedRoot, pack, fileOps);
  if (inspected.diagnostics.length > 0) {
    return {
      ok: false,
      diagnostics: inspected.diagnostics,
      partial: {
        manifestBytes: Buffer.from(manifestBytes),
        pack,
        sourceBytes: new Map(
          [...inspected.sourceBytes].map(([sourcePath, bytes]) => [
            sourcePath,
            Buffer.from(bytes),
          ]),
        ),
      },
    };
  }

  try {
    verifyPinnedEntry(pinnedRoot, 'directory', fileOps);
  } catch (error) {
    return {
      ok: false,
      diagnostics: [pathDiagnostic(absoluteRoot, '.', error)],
    };
  }

  const payload = parseAssetPackPayload({ manifestBytes, sourceBytes: inspected.sourceBytes });
  if (!payload.ok) return payload;

  return {
    root: absoluteRoot,
    manifestPath,
    manifestMtimeMs,
    ...payload,
  };
}
