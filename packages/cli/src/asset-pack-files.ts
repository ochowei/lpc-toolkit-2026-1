import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  realpathSync,
  rmSync,
  writeFileSync,
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

export interface AssetPackAtomicFileOps extends AssetPackDirectoryFileOps {
  readonly mkdirSync: typeof mkdirSync;
  readonly writeFileSync: typeof writeFileSync;
  readonly renameSync: typeof renameSync;
  readonly rmSync: typeof rmSync;
}

export interface AssetPackBoundedFileSnapshot {
  readonly bytes: Buffer;
  readonly identity: string;
}

export interface AssetPackAtomicReplacementResult {
  readonly targetPath: string;
  readonly digest: `sha256:${string}`;
}

const DEFAULT_DIRECTORY_FILE_OPS: AssetPackDirectoryFileOps = {
  openSync,
  closeSync,
  fstatSync,
  readFileSync,
  lstatSync,
  realpathSync: realpathSync.native,
};

const DEFAULT_ATOMIC_FILE_OPS: AssetPackAtomicFileOps = {
  ...DEFAULT_DIRECTORY_FILE_OPS,
  mkdirSync,
  writeFileSync,
  renameSync,
  rmSync,
};

export type AssetPackCaptureDiagnosticCode =
  | 'asset_source_missing'
  | 'asset_source_outside_pack'
  | 'asset_source_symlink'
  | 'asset_source_not_regular'
  | 'asset_source_too_large'
  | 'asset_digest_mismatch';

export class AssetPackCaptureError extends Error {
  constructor(
    readonly diagnosticCode: AssetPackCaptureDiagnosticCode,
    readonly targetPath: string,
    message: string,
  ) {
    super(message);
    this.name = 'AssetPackCaptureError';
  }
}

export type AssetPackAtomicReplacementErrorCode =
  | AssetPackCaptureDiagnosticCode
  | 'asset_atomic_publish_failed';

export class AssetPackAtomicReplacementError extends Error {
  constructor(
    readonly code: AssetPackAtomicReplacementErrorCode,
    readonly targetPath: string,
    message: string,
  ) {
    super(message);
    this.name = 'AssetPackAtomicReplacementError';
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
  code: AssetPackCaptureDiagnosticCode,
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

function verifyPinnedDirectory(
  entry: PinnedPathEntry,
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
      `Asset-pack directory changed during atomic publication: ${entry.targetPath}. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (
    stats.isSymbolicLink()
    || !stats.isDirectory()
    || stats.dev !== entry.stats.dev
    || stats.ino !== entry.stats.ino
    || canonicalPath !== entry.canonicalPath
  ) {
    captureError(
      'asset_digest_mismatch',
      entry.targetPath,
      `Asset-pack directory changed during atomic publication: ${entry.targetPath}.`,
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

interface PinnedContainedParents {
  readonly targetPath: string;
  readonly parents: readonly PinnedPathEntry[];
}

function pinContainedParentDirectories(
  root: PinnedPackRoot,
  sourcePath: string,
  fileOps: AssetPackDirectoryFileOps,
): PinnedContainedParents {
  verifyPinnedEntry(root, 'directory', fileOps);
  const resolvedPath = path.resolve(root.rootPath, sourcePath);
  if (
    path.isAbsolute(sourcePath)
    || !isInsideRoot(root.rootPath, resolvedPath)
    || resolvedPath === root.rootPath
  ) {
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
  for (const segment of segments.slice(0, -1)) {
    currentPath = path.join(currentPath, segment);
    let stats: Stats;
    try {
      stats = fileOps.lstatSync(currentPath);
    } catch (error) {
      if (errorCode(error) === 'ENOENT' || errorCode(error) === 'ENOTDIR') {
        captureError(
          'asset_source_missing',
          currentPath,
          `Asset-pack source parent is missing: ${sourcePath}.`,
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
    if (!stats.isDirectory()) {
      captureError(
        'asset_source_not_regular',
        currentPath,
        `Asset-pack source parent must be a directory: ${sourcePath}.`,
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
    parents.push({ targetPath: currentPath, canonicalPath, stats });
  }
  return { targetPath: resolvedPath, parents };
}

function sha256Bytes(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function readBoundedAssetPackFile(options: {
  readonly root: string;
  readonly filePath: string;
  readonly label: string;
  readonly maximumBytes: number;
  readonly fileOps?: AssetPackDirectoryFileOps;
}): AssetPackBoundedFileSnapshot {
  const fileOps = options.fileOps ?? DEFAULT_DIRECTORY_FILE_OPS;
  const absoluteRoot = path.resolve(options.root);
  const absoluteFilePath = path.resolve(options.filePath);
  const relativePath = path.relative(absoluteRoot, absoluteFilePath);
  if (
    relativePath === ''
    || !isInsideRoot(absoluteRoot, absoluteFilePath)
    || path.isAbsolute(relativePath)
  ) {
    captureError(
      'asset_source_outside_pack',
      absoluteFilePath,
      `${options.label} must remain inside its root: ${absoluteFilePath}.`,
    );
  }
  if (!Number.isSafeInteger(options.maximumBytes) || options.maximumBytes < 0) {
    captureError(
      'asset_source_too_large',
      absoluteFilePath,
      `${options.label} has an invalid byte bound.`,
    );
  }
  const root = pinPackRoot(absoluteRoot, fileOps);
  const pinned = pinContainedFile(root, relativePath, fileOps);
  if (pinned.stats.size > options.maximumBytes) {
    captureError(
      'asset_source_too_large',
      pinned.targetPath,
      `${options.label} exceeds the ${String(options.maximumBytes)}-byte limit.`,
    );
  }
  const captured = captureContainedFile({
    root,
    sourcePath: relativePath,
    label: options.label,
    fileOps,
  });
  if (captured.bytes.byteLength > options.maximumBytes) {
    captureError(
      'asset_source_too_large',
      captured.targetPath,
      `${options.label} exceeds the ${String(options.maximumBytes)}-byte limit.`,
    );
  }
  return {
    bytes: Buffer.from(captured.bytes),
    identity: assetPackManagedFileIdentity(captured.stats),
  };
}

export function readOptionalBoundedAssetPackFile(options: {
  readonly root: string;
  readonly filePath: string;
  readonly label: string;
  readonly maximumBytes: number;
  readonly fileOps?: AssetPackDirectoryFileOps;
}): AssetPackBoundedFileSnapshot | undefined {
  const fileOps = options.fileOps ?? DEFAULT_DIRECTORY_FILE_OPS;
  const absoluteRoot = path.resolve(options.root);
  const absoluteFilePath = path.resolve(options.filePath);
  const relativePath = path.relative(absoluteRoot, absoluteFilePath);
  if (
    relativePath === ''
    || !isInsideRoot(absoluteRoot, absoluteFilePath)
    || path.isAbsolute(relativePath)
  ) {
    captureError(
      'asset_source_outside_pack',
      absoluteFilePath,
      `${options.label} must remain inside its root: ${absoluteFilePath}.`,
    );
  }
  if (!Number.isSafeInteger(options.maximumBytes) || options.maximumBytes < 0) {
    captureError(
      'asset_source_too_large',
      absoluteFilePath,
      `${options.label} has an invalid byte bound.`,
    );
  }
  const root = pinPackRoot(absoluteRoot, fileOps);
  const parentDirectories = pinContainedParentDirectories(root, relativePath, fileOps);
  let stats: Stats;
  try {
    stats = fileOps.lstatSync(parentDirectories.targetPath);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined;
    if (errorCode(error) === 'ENOTDIR') {
      captureError(
        'asset_source_not_regular',
        parentDirectories.targetPath,
        `${options.label} has a non-directory parent: ${absoluteFilePath}.`,
      );
    }
    throw error;
  }
  if (stats.isSymbolicLink()) {
    captureError(
      'asset_source_symlink',
      parentDirectories.targetPath,
      `${options.label} must not be a symbolic link: ${absoluteFilePath}.`,
    );
  }
  if (!stats.isFile()) {
    captureError(
      'asset_source_not_regular',
      parentDirectories.targetPath,
      `${options.label} must be a regular file: ${absoluteFilePath}.`,
    );
  }
  if (stats.size > options.maximumBytes) {
    captureError(
      'asset_source_too_large',
      parentDirectories.targetPath,
      `${options.label} exceeds the ${String(options.maximumBytes)}-byte limit.`,
    );
  }
  const captured = captureContainedFile({
    root,
    sourcePath: relativePath,
    label: options.label,
    fileOps,
  });
  if (captured.bytes.byteLength > options.maximumBytes) {
    captureError(
      'asset_source_too_large',
      captured.targetPath,
      `${options.label} exceeds the ${String(options.maximumBytes)}-byte limit.`,
    );
  }
  return {
    bytes: Buffer.from(captured.bytes),
    identity: assetPackManagedFileIdentity(captured.stats),
  };
}

interface PinnedTargetState {
  readonly targetPath: string;
  readonly parents: readonly PinnedPathEntry[];
  readonly existing?: CapturedContainedFile;
}

function pinTargetState(options: {
  readonly root: PinnedPackRoot;
  readonly sourcePath: string;
  readonly fileOps: AssetPackDirectoryFileOps;
  readonly maximumBytes: number;
}): PinnedTargetState {
  const parentDirectories = pinContainedParentDirectories(
    options.root,
    options.sourcePath,
    options.fileOps,
  );
  let stats: Stats;
  try {
    stats = options.fileOps.lstatSync(parentDirectories.targetPath);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return parentDirectories;
    }
    if (errorCode(error) === 'ENOTDIR') {
      captureError(
        'asset_source_not_regular',
        parentDirectories.targetPath,
        `Asset-pack target parent is not a directory: ${options.sourcePath}.`,
      );
    }
    throw error;
  }
  if (stats.isSymbolicLink()) {
    captureError(
      'asset_source_symlink',
      parentDirectories.targetPath,
      `Asset-pack target must not be a symbolic link: ${options.sourcePath}.`,
    );
  }
  if (!stats.isFile()) {
    captureError(
      'asset_source_not_regular',
      parentDirectories.targetPath,
      `Asset-pack target must be a regular file: ${options.sourcePath}.`,
    );
  }
  if (stats.size > options.maximumBytes) {
    captureError(
      'asset_source_too_large',
      parentDirectories.targetPath,
      `Asset-pack target exceeds the ${String(options.maximumBytes)}-byte limit.`,
    );
  }
  const captured = captureContainedFile({
    root: options.root,
    sourcePath: options.sourcePath,
    label: `Asset-pack target ${options.sourcePath}`,
    fileOps: options.fileOps,
  });
  if (captured.bytes.byteLength > options.maximumBytes) {
    captureError(
      'asset_source_too_large',
      captured.targetPath,
      `Asset-pack target exceeds the ${String(options.maximumBytes)}-byte limit.`,
    );
  }
  return {
    targetPath: parentDirectories.targetPath,
    parents: captured.parents,
    existing: captured,
  };
}

function verifyMissingTarget(
  targetPath: string,
  fileOps: AssetPackDirectoryFileOps,
): void {
  try {
    const stats = fileOps.lstatSync(targetPath);
    if (stats.isSymbolicLink()) {
      captureError(
        'asset_source_symlink',
        targetPath,
        `Asset-pack target became a symbolic link: ${targetPath}.`,
      );
    }
    captureError(
      'asset_digest_mismatch',
      targetPath,
      `Asset-pack target appeared during atomic publication: ${targetPath}.`,
    );
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return;
    if (error instanceof AssetPackCaptureError) throw error;
    throw error;
  }
}

function verifyExistingTarget(
  root: PinnedPackRoot,
  existing: CapturedContainedFile,
  fileOps: AssetPackDirectoryFileOps,
): void {
  verifyPinnedDirectory(root, fileOps);
  for (const parent of existing.parents) verifyPinnedDirectory(parent, fileOps);
  verifyPinnedEntry(existing, 'file', fileOps);
  const current = readAssetPackManagedFile({
    filePath: existing.targetPath,
    label: 'Asset-pack target',
    fileOps,
  });
  if (
    current.identity !== assetPackManagedFileIdentity(existing.stats)
    || !current.bytes.equals(existing.bytes)
  ) {
    captureError(
      'asset_digest_mismatch',
      existing.targetPath,
      `Asset-pack target changed during atomic publication: ${existing.targetPath}.`,
    );
  }
}

export function atomicallyReplaceAssetPackSource(options: {
  readonly root: string;
  readonly sourcePath: string;
  readonly bytes: Buffer;
  readonly maximumBytes: number;
  readonly expectedTargetDigest: `sha256:${string}` | null;
  readonly fileOps?: AssetPackAtomicFileOps;
}): AssetPackAtomicReplacementResult {
  const fileOps = options.fileOps ?? DEFAULT_ATOMIC_FILE_OPS;
  const root = path.resolve(options.root);
  let temporaryPath: string | undefined;
  try {
    if (options.bytes.byteLength > options.maximumBytes) {
      captureError(
        'asset_source_too_large',
        path.resolve(root, options.sourcePath),
        `Asset-pack candidate exceeds the ${String(options.maximumBytes)}-byte limit.`,
      );
    }
    const pinnedRoot = pinPackRoot(root, fileOps);
    const target = pinTargetState({
      root: pinnedRoot,
      sourcePath: options.sourcePath,
      fileOps,
      maximumBytes: options.maximumBytes,
    });
    const currentDigest = target.existing === undefined
      ? null
      : sha256Bytes(target.existing.bytes);
    if (currentDigest !== options.expectedTargetDigest) {
      captureError(
        'asset_digest_mismatch',
        target.targetPath,
        options.expectedTargetDigest === null
          ? `Asset-pack target already exists and requires an exact replacement digest: ${target.targetPath}.`
          : `Asset-pack target digest does not match the expected revision: ${target.targetPath}.`,
      );
    }

    verifyPinnedDirectory(pinnedRoot, fileOps);
    for (const parent of target.parents) verifyPinnedDirectory(parent, fileOps);
    if (target.existing === undefined) {
      verifyMissingTarget(target.targetPath, fileOps);
    } else {
      verifyExistingTarget(pinnedRoot, target.existing, fileOps);
    }

    temporaryPath = path.join(
      path.dirname(target.targetPath),
      `.lpc-toolkit-import-${randomUUID()}.tmp`,
    );
    fileOps.writeFileSync(temporaryPath, options.bytes, { flag: 'wx', mode: 0o600 });

    verifyPinnedDirectory(pinnedRoot, fileOps);
    for (const parent of target.parents) verifyPinnedDirectory(parent, fileOps);
    if (target.existing === undefined) {
      verifyMissingTarget(target.targetPath, fileOps);
    } else {
      verifyExistingTarget(pinnedRoot, target.existing, fileOps);
    }

    fileOps.renameSync(temporaryPath, target.targetPath);
    temporaryPath = undefined;
    return {
      targetPath: target.targetPath,
      digest: sha256Bytes(options.bytes),
    };
  } catch (error) {
    if (error instanceof AssetPackAtomicReplacementError) throw error;
    if (error instanceof AssetPackCaptureError) {
      throw new AssetPackAtomicReplacementError(
        error.diagnosticCode,
        error.targetPath,
        error.message,
      );
    }
    throw new AssetPackAtomicReplacementError(
      'asset_atomic_publish_failed',
      path.resolve(root, options.sourcePath),
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    if (temporaryPath !== undefined) fileOps.rmSync(temporaryPath, { force: true });
  }
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

function verifyCapturedEntry(
  root: PinnedPackRoot,
  entry: CapturedContainedFile,
  fileOps: AssetPackDirectoryFileOps,
): void {
  verifyPinnedEntry(root, 'directory', fileOps);
  for (const parent of entry.parents) {
    verifyPinnedEntry(parent, 'directory', fileOps);
  }
  verifyPinnedEntry(entry, 'file', fileOps);
}

function verifyCapturedEntryBytes(
  root: PinnedPackRoot,
  entry: CapturedContainedFile,
  fileOps: AssetPackDirectoryFileOps,
): void {
  verifyCapturedEntry(root, entry, fileOps);
  const snapshot = readAssetPackManagedFile({
    filePath: entry.targetPath,
    label: 'Captured asset-pack file',
    fileOps,
  });
  if (
    snapshot.identity !== assetPackManagedFileIdentity(entry.stats)
    || !snapshot.bytes.equals(entry.bytes)
  ) {
    captureError(
      'asset_digest_mismatch',
      entry.targetPath,
      `Asset-pack file changed between generation captures: ${entry.targetPath}.`,
    );
  }
  verifyCapturedEntry(root, entry, fileOps);
}

function verifyCapturedGeneration(options: {
  readonly root: PinnedPackRoot;
  readonly manifest: CapturedContainedFile;
  readonly sources: readonly CapturedContainedFile[];
  readonly fileOps: AssetPackDirectoryFileOps;
}): void {
  const entries = [options.manifest, ...options.sources];
  for (const entry of entries) {
    verifyCapturedEntryBytes(options.root, entry, options.fileOps);
  }
  verifyPinnedEntry(options.root, 'directory', options.fileOps);
  for (const entry of entries) {
    verifyCapturedEntry(options.root, entry, options.fileOps);
  }
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
  readonly capturedSources: readonly CapturedContainedFile[];
} {
  const diagnostics: AssetPackFileDiagnostic[] = [];
  const sourceBytes = new Map<string, Buffer>();
  const capturedSources: CapturedContainedFile[] = [];
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
    capturedSources.push(captured);
  });

  return { diagnostics, sourceBytes, capturedSources };
}

export async function loadAssetPackFiles(
  root: string,
  fileOps: AssetPackDirectoryFileOps = DEFAULT_DIRECTORY_FILE_OPS,
): Promise<AssetPackFilesResult> {
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
    verifyCapturedGeneration({
      root: pinnedRoot,
      manifest,
      sources: inspected.capturedSources,
      fileOps,
    });
  } catch (error) {
    return {
      ok: false,
      diagnostics: [pathDiagnostic(absoluteRoot, '.', error)],
    };
  }

  const payload = await parseAssetPackPayload({ manifestBytes, sourceBytes: inspected.sourceBytes });
  if (!payload.ok) return payload;

  return {
    root: absoluteRoot,
    manifestPath,
    manifestMtimeMs,
    ...payload,
  };
}
