import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  type Stats,
} from 'node:fs';

export interface AssetPackManagedFileOps {
  readonly openSync: typeof openSync;
  readonly closeSync: typeof closeSync;
  readonly fstatSync: typeof fstatSync;
  readonly readFileSync: typeof readFileSync;
  readonly lstatSync?: typeof lstatSync;
}

export interface AssetPackManagedFileSnapshot {
  readonly bytes: Buffer;
  readonly identity: string;
}

const DEFAULT_FILE_OPS: AssetPackManagedFileOps = {
  openSync,
  closeSync,
  fstatSync,
  readFileSync,
  lstatSync,
};

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

function identity(stats: Stats): string {
  return JSON.stringify([
    String(stats.dev),
    String(stats.ino),
    stats.mode,
    stats.nlink,
    stats.size,
    stats.mtimeMs,
    stats.ctimeMs,
    stats.birthtimeMs,
  ]);
}

export function readAssetPackManagedFile(options: {
  readonly filePath: string;
  readonly label: string;
  readonly fileOps?: AssetPackManagedFileOps;
}): AssetPackManagedFileSnapshot {
  const fileOps = options.fileOps ?? DEFAULT_FILE_OPS;
  const stat = fileOps.lstatSync ?? lstatSync;
  const pathBefore = stat(options.filePath);
  if (pathBefore.isSymbolicLink() || !pathBefore.isFile()) {
    throw new Error(
      `${options.label} must be a regular file and not a symbolic link: ${options.filePath}.`,
    );
  }

  let descriptor: number;
  try {
    descriptor = fileOps.openSync(
      options.filePath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK,
    );
  } catch (error) {
    throw new Error(
      `${options.label} must remain a stable regular file: ${options.filePath}. ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let actionError: unknown;
  try {
    const descriptorBefore = fileOps.fstatSync(descriptor);
    if (!descriptorBefore.isFile() || !sameIdentity(pathBefore, descriptorBefore)) {
      throw new Error(
        `${options.label} changed before it could be read safely: ${options.filePath}.`,
      );
    }
    const read = fileOps.readFileSync(descriptor);
    const bytes = Buffer.isBuffer(read) ? Buffer.from(read) : Buffer.from(read);
    const descriptorAfter = fileOps.fstatSync(descriptor);
    const pathAfter = stat(options.filePath);
    if (
      !descriptorAfter.isFile()
      || !sameIdentity(descriptorBefore, descriptorAfter)
      || !sameIdentity(descriptorAfter, pathAfter)
      || bytes.byteLength !== descriptorAfter.size
    ) {
      throw new Error(
        `${options.label} changed while it was being read: ${options.filePath}.`,
      );
    }
    return { bytes, identity: identity(descriptorAfter) };
  } catch (error) {
    actionError = error;
    throw error;
  } finally {
    try {
      fileOps.closeSync(descriptor);
    } catch (error) {
      if (actionError === undefined) throw error;
    }
  }
}
