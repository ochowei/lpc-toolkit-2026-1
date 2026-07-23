import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  ASSET_PACK_ARCHIVE_LIMITS,
  ASSET_PACK_CHECKSUMS_SCHEMA,
  createAssetPackArchive,
  inspectAssetPackArchiveBytes,
  type AssetPackArchiveDiagnostic,
  type AssetPackChecksumEntry,
} from '@lpc-toolkit/asset-pack-format';
import type { AssetPackPayloadSuccess } from './asset-pack-payload.js';
import { nodeAssetPackFormatRuntime } from './asset-pack-node-runtime.js';

export {
  ASSET_PACK_ARCHIVE_LIMITS,
  ASSET_PACK_CHECKSUMS_SCHEMA,
  type AssetPackChecksumEntry,
  type AssetPackArchiveDiagnostic,
};

export interface AssetPackArchiveSnapshot {
  readonly archivePath: string;
  readonly archiveBytes: Buffer;
  readonly archiveDigest: string;
  readonly manifestBytes: Buffer;
  readonly checksumsBytes: Buffer;
  readonly entryCount: number;
  readonly totalUncompressedBytes: number;
  readonly payload: AssetPackPayloadSuccess;
}

export type AssetPackArchiveReadResult =
  | { readonly ok: true; readonly snapshot: AssetPackArchiveSnapshot }
  | { readonly ok: false; readonly diagnostics: readonly AssetPackArchiveDiagnostic[] };

const verifiedExtractionFiles = new WeakMap<
  AssetPackArchiveSnapshot,
  ReadonlyMap<string, Buffer>
>();

function copyPayload(
  payload: import('@lpc-toolkit/asset-pack-format').AssetPackPayloadSuccess,
): AssetPackPayloadSuccess {
  return {
    ok: true,
    manifestBytes: Buffer.from(payload.manifestBytes),
    pack: payload.pack,
    sourceBytes: new Map(
      [...payload.sourceBytes].map(
        ([entryPath, contents]) => [entryPath, Buffer.from(contents)] as const,
      ),
    ),
    sourceDigests: new Map(payload.sourceDigests),
    inspections: [...payload.inspections],
    contentDigest: payload.contentDigest,
  };
}

function comparePaths(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export async function readAssetPackArchive(options: {
  readonly archivePath: string;
  readonly archiveBytes?: Buffer;
}): Promise<AssetPackArchiveReadResult> {
  let archiveBytes: Buffer;
  try {
    if (options.archiveBytes === undefined) {
      const descriptor = openSync(
        options.archivePath,
        fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
      );
      try {
        const metadata = fstatSync(descriptor);
        if (!metadata.isFile()) {
          return {
            ok: false,
            diagnostics: [{
              code: 'asset_archive_invalid',
              message: 'Asset-pack archive path must refer to a regular file.',
              path: options.archivePath,
            }],
          };
        }
        if (metadata.size > ASSET_PACK_ARCHIVE_LIMITS.archiveBytes) {
          return {
            ok: false,
            diagnostics: [{
              code: 'asset_archive_limit_exceeded',
              message: `Archive exceeds the ${String(ASSET_PACK_ARCHIVE_LIMITS.archiveBytes)}-byte encoded limit.`,
              path: options.archivePath,
            }],
          };
        }
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        while (totalBytes <= ASSET_PACK_ARCHIVE_LIMITS.archiveBytes) {
          const remaining = ASSET_PACK_ARCHIVE_LIMITS.archiveBytes + 1 - totalBytes;
          const chunk = Buffer.alloc(Math.min(64 * 1_024, remaining));
          const bytesRead = readSync(descriptor, chunk, 0, chunk.byteLength, null);
          if (bytesRead === 0) break;
          chunks.push(chunk.subarray(0, bytesRead));
          totalBytes += bytesRead;
          if (totalBytes > ASSET_PACK_ARCHIVE_LIMITS.archiveBytes) {
            return {
              ok: false,
              diagnostics: [{
                code: 'asset_archive_limit_exceeded',
                message: `Archive exceeds the ${String(ASSET_PACK_ARCHIVE_LIMITS.archiveBytes)}-byte encoded limit.`,
                path: options.archivePath,
              }],
            };
          }
        }
        const finalMetadata = fstatSync(descriptor);
        if (finalMetadata.size > ASSET_PACK_ARCHIVE_LIMITS.archiveBytes) {
          return {
            ok: false,
            diagnostics: [{
              code: 'asset_archive_limit_exceeded',
              message: `Archive exceeds the ${String(ASSET_PACK_ARCHIVE_LIMITS.archiveBytes)}-byte encoded limit.`,
              path: options.archivePath,
            }],
          };
        }
        archiveBytes = Buffer.concat(chunks, totalBytes);
      } finally {
        closeSync(descriptor);
      }
    } else {
      if (options.archiveBytes.byteLength > ASSET_PACK_ARCHIVE_LIMITS.archiveBytes) {
        return {
          ok: false,
          diagnostics: [{
            code: 'asset_archive_limit_exceeded',
            message: `Archive exceeds the ${String(ASSET_PACK_ARCHIVE_LIMITS.archiveBytes)}-byte encoded limit.`,
            path: options.archivePath,
          }],
        };
      }
      archiveBytes = Buffer.from(options.archiveBytes);
    }
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{
        code: 'asset_archive_invalid',
        message: `Could not read asset-pack archive: ${options.archivePath}.`,
        path: options.archivePath,
        details: { error: error instanceof Error ? error.message : String(error) },
      }],
    };
  }

  const readBack = await inspectAssetPackArchiveBytes({
    archiveBytes,
    runtime: nodeAssetPackFormatRuntime,
  });

  if (readBack.kind !== 'verified') {
    return { ok: false, diagnostics: readBack.diagnostics };
  }

  const snapshot: AssetPackArchiveSnapshot = {
    archivePath: options.archivePath,
    archiveBytes: Buffer.from(readBack.snapshot.archiveBytes),
    archiveDigest: readBack.snapshot.archiveDigest,
    manifestBytes: Buffer.from(readBack.snapshot.manifestBytes),
    checksumsBytes: Buffer.from(readBack.snapshot.checksumsBytes),
    entryCount: readBack.snapshot.entryCount,
    totalUncompressedBytes: readBack.snapshot.totalUncompressedBytes,
    payload: copyPayload(readBack.snapshot.payload),
  };

  verifiedExtractionFiles.set(
    snapshot,
    new Map<string, Buffer>([
      ['asset-pack.json', Buffer.from(snapshot.payload.manifestBytes)],
      ...[...snapshot.payload.sourceBytes].map(
        ([entryPath, contents]) => [entryPath, Buffer.from(contents)] as const,
      ),
    ]),
  );

  return { ok: true, snapshot };
}

export async function createDeterministicAssetPackArchive(options: {
  readonly manifestBytes: Buffer;
  readonly sourceBytes: ReadonlyMap<string, Buffer>;
}): Promise<Buffer> {
  if (options.manifestBytes.byteLength > ASSET_PACK_ARCHIVE_LIMITS.manifestBytes) {
    throw new Error(
      `asset-pack.json exceeds limit of ${String(ASSET_PACK_ARCHIVE_LIMITS.manifestBytes)} bytes.`,
    );
  }
  let manifestDocument: Record<string, unknown>;
  try {
    const text = nodeAssetPackFormatRuntime.decodeUtf8Fatal(options.manifestBytes);
    manifestDocument = JSON.parse(text) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Cannot archive an invalid asset-pack payload: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const result = await createAssetPackArchive({
    kind: 'formal',
    manifestDocument,
    sourceBytes: options.sourceBytes,
    runtime: nodeAssetPackFormatRuntime,
  });

  return Buffer.from(result.archiveBytes);
}

interface PinnedExtractionDirectory {
  readonly canonicalPath: string;
  readonly device: number;
  readonly inode: number;
}

function extractionDirectoryStatus(directory: string) {
  const status = lstatSync(directory, { throwIfNoEntry: false });
  if (!status || status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(`Extraction directory is not a pinned directory: ${directory}`);
  }
  return status;
}

function hasPinnedIdentity(
  status: ReturnType<typeof extractionDirectoryStatus>,
  pinned: PinnedExtractionDirectory,
): boolean {
  return status.dev === pinned.device && status.ino === pinned.inode;
}

function pinCanonicalExtractionDirectory(directory: string): PinnedExtractionDirectory {
  const before = extractionDirectoryStatus(directory);
  const canonicalPath = realpathSync(directory);
  const after = extractionDirectoryStatus(directory);
  const confirmedCanonicalPath = realpathSync(directory);
  if (canonicalPath !== directory) {
    throw new Error(`Extraction directory resolves through an alias: ${directory}`);
  }
  if (
    confirmedCanonicalPath !== canonicalPath
    || before.dev !== after.dev
    || before.ino !== after.ino
  ) {
    throw new Error(`Extraction directory canonical path or identity changed: ${directory}`);
  }
  return {
    canonicalPath,
    device: after.dev,
    inode: after.ino,
  };
}

function assertPinnedExtractionDirectory(
  pinned: PinnedExtractionDirectory,
): ReturnType<typeof extractionDirectoryStatus> {
  const before = extractionDirectoryStatus(pinned.canonicalPath);
  if (!hasPinnedIdentity(before, pinned)) {
    throw new Error(`Pinned extraction directory identity changed: ${pinned.canonicalPath}`);
  }
  const canonicalPath = realpathSync(pinned.canonicalPath);
  const after = extractionDirectoryStatus(pinned.canonicalPath);
  const confirmedCanonicalPath = realpathSync(pinned.canonicalPath);
  if (
    !hasPinnedIdentity(after, pinned)
    || canonicalPath !== pinned.canonicalPath
    || confirmedCanonicalPath !== pinned.canonicalPath
  ) {
    throw new Error(`Pinned extraction directory canonical path changed: ${pinned.canonicalPath}`);
  }
  return after;
}

function assertPrivateStagingRoot(pinned: PinnedExtractionDirectory): void {
  const status = assertPinnedExtractionDirectory(pinned);
  if ((status.mode & 0o077) !== 0) {
    throw new Error(
      `Extraction parent is writable or accessible outside the private staging root: ${pinned.canonicalPath}`,
    );
  }
}

function pinSafeExtractionParent(targetDirectory: string): {
  readonly stagingRoot: PinnedExtractionDirectory;
  readonly targetPath: string;
} {
  const requestedTarget = path.resolve(targetDirectory);
  const parent = path.dirname(requestedTarget);
  const root = path.parse(parent).root;
  let current = root;
  let stagingRoot = pinCanonicalExtractionDirectory(root);
  for (const segment of path.relative(root, parent).split(path.sep)) {
    if (segment.length === 0) continue;
    current = path.join(current, segment);
    const status = lstatSync(current, { throwIfNoEntry: false });
    if (!status) throw new Error(`Extraction parent does not exist: ${current}`);
    if (status.isSymbolicLink()) {
      throw new Error(`Refusing to extract through symlinked parent: ${current}`);
    }
    if (!status.isDirectory()) {
      throw new Error(`Extraction parent is not a directory: ${current}`);
    }
    stagingRoot = pinCanonicalExtractionDirectory(current);
  }
  assertPrivateStagingRoot(stagingRoot);
  const targetPath = path.join(stagingRoot.canonicalPath, path.basename(requestedTarget));
  assertPinnedExtractionDirectory(stagingRoot);
  if (lstatSync(targetPath, { throwIfNoEntry: false }) !== undefined) {
    throw new Error(`Extraction target already exists: ${targetPath}`);
  }
  return { stagingRoot, targetPath };
}

function createPinnedExtractionDirectory(
  parent: PinnedExtractionDirectory,
  name: string,
): PinnedExtractionDirectory {
  assertPinnedExtractionDirectory(parent);
  const directory = path.join(parent.canonicalPath, name);
  mkdirSync(directory, { mode: 0o700 });
  const pinned = pinCanonicalExtractionDirectory(directory);
  assertPinnedExtractionDirectory(parent);
  assertPinnedExtractionDirectory(pinned);
  return pinned;
}

function cleanupPinnedExtractionDirectory(
  stagingRoot: PinnedExtractionDirectory,
  target: PinnedExtractionDirectory,
): void {
  try {
    assertPrivateStagingRoot(stagingRoot);
    assertPinnedExtractionDirectory(target);
  } catch {
    return;
  }
  rmSync(target.canonicalPath, { recursive: true, force: true });
}

function writeNewFileNoFollow(
  directory: PinnedExtractionDirectory,
  fileName: string,
  contents: Buffer,
): void {
  assertPinnedExtractionDirectory(directory);
  const filePath = path.join(directory.canonicalPath, fileName);
  const descriptor = openSync(
    filePath,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
    0o600,
  );
  try {
    writeFileSync(descriptor, contents);
  } finally {
    closeSync(descriptor);
  }
  assertPinnedExtractionDirectory(directory);
}

export function extractVerifiedAssetPackPayload(options: {
  readonly snapshot: AssetPackArchiveSnapshot;
  readonly targetDirectory: string;
}): void {
  const verifiedFiles = verifiedExtractionFiles.get(options.snapshot);
  if (!verifiedFiles) throw new Error('Extraction requires a verified archive snapshot.');
  const { stagingRoot, targetPath } = pinSafeExtractionParent(options.targetDirectory);
  let target: PinnedExtractionDirectory | undefined;
  try {
    target = createPinnedExtractionDirectory(stagingRoot, path.basename(targetPath));
    const createdDirectories = new Map<string, PinnedExtractionDirectory>([
      [target.canonicalPath, target],
    ]);
    for (const [entryPath, contents] of [...verifiedFiles].sort(
      ([left], [right]) => comparePaths(left, right),
    )) {
      assertPrivateStagingRoot(stagingRoot);
      assertPinnedExtractionDirectory(target);
      const segments = entryPath.split('/');
      let directory = target;
      for (const segment of segments.slice(0, -1)) {
        assertPinnedExtractionDirectory(directory);
        const childPath = path.join(directory.canonicalPath, segment);
        const existing = createdDirectories.get(childPath);
        if (existing) {
          assertPinnedExtractionDirectory(existing);
          directory = existing;
        } else {
          const created = createPinnedExtractionDirectory(directory, segment);
          createdDirectories.set(created.canonicalPath, created);
          directory = created;
        }
      }
      const fileName = segments.at(-1);
      if (!fileName) throw new Error(`Invalid verified archive path: ${entryPath}`);
      writeNewFileNoFollow(directory, fileName, Buffer.from(contents));
    }
    assertPrivateStagingRoot(stagingRoot);
    assertPinnedExtractionDirectory(target);
  } catch (error) {
    if (target) cleanupPinnedExtractionDirectory(stagingRoot, target);
    throw error;
  }
}
