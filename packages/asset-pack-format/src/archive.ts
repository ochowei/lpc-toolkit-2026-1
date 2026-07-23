import JSZip from 'jszip';
import { encodeCanonicalJson } from './canonical-json.js';
import { inspectRawDeflate } from './deflate.js';
import {
  parseAssetPackPayload,
  type AssetPackPayloadSuccess,
} from './payload.js';
import type { AssetPackFormatRuntime, AssetPackSha256 } from './runtime.js';

export const ASSET_PACK_CHECKSUMS_SCHEMA =
  'lpc-toolkit.asset-pack-checksums.v1' as const;

export const ASSET_PACK_ARCHIVE_LIMITS = {
  entries: 4_096,
  manifestBytes: 1 * 1_024 * 1_024,
  entryBytes: 64 * 1_024 * 1_024,
  totalBytes: 512 * 1_024 * 1_024,
  pathBytes: 1 * 1_024,
  archiveBytes: 512 * 1_024 * 1_024 + 4_096 * (2 * 65_535 + 76) + 65_557,
} as const;

export interface AssetPackChecksumEntry {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

export interface AssetPackArchiveDiagnostic {
  readonly code:
    | 'asset_archive_unsafe'
    | 'asset_archive_limit_exceeded'
    | 'asset_archive_invalid'
    | 'asset_checksum_invalid'
    | 'asset_digest_mismatch';
  readonly message: string;
  readonly path?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AssetPackRepairSnapshot {
  readonly archiveBytes: Uint8Array;
  readonly archiveDigest: AssetPackSha256;
  readonly manifestBytes?: Uint8Array;
  readonly manifestDocument?: Readonly<Record<string, unknown>>;
  readonly checksumsBytes?: Uint8Array;
  readonly sourceBytes: ReadonlyMap<string, Uint8Array>;
  readonly entryCount: number;
  readonly totalUncompressedBytes: number;
}

export interface AssetPackVerifiedSnapshot extends AssetPackRepairSnapshot {
  readonly manifestBytes: Uint8Array;
  readonly manifestDocument: Readonly<Record<string, unknown>>;
  readonly checksumsBytes: Uint8Array;
  readonly payload: AssetPackPayloadSuccess;
}

export type AssetPackArchiveInspection =
  | {
      readonly kind: 'unsafe';
      readonly diagnostics: readonly AssetPackArchiveDiagnostic[];
    }
  | {
      readonly kind: 'repairable';
      readonly snapshot: AssetPackRepairSnapshot;
      readonly diagnostics: readonly AssetPackArchiveDiagnostic[];
    }
  | {
      readonly kind: 'verified';
      readonly snapshot: AssetPackVerifiedSnapshot;
      readonly diagnostics: readonly [];
    };

interface ZipCentralEntry {
  readonly path: string;
  readonly rawName: Uint8Array;
  readonly flags: number;
  readonly compressionMethod: number;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly creatorPlatform: number;
  readonly externalAttributes: number;
  readonly localHeaderOffset: number;
  readonly dataStart: number;
  readonly dataEnd: number;
}

type Checked<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly diagnostics: readonly AssetPackArchiveDiagnostic[];
    };

type Rejected = Extract<Checked<never>, { readonly ok: false }>;

const EOCD_SIGNATURE = 0x0605_4b50;
const ZIP64_EOCD_SIGNATURE = 0x0606_4b50;
const ZIP64_LOCATOR_SIGNATURE = 0x0706_4b50;
const CENTRAL_SIGNATURE = 0x0201_4b50;
const LOCAL_SIGNATURE = 0x0403_4b50;
const UTF8_FLAG = 0x0800;
const DATA_DESCRIPTOR_FLAG = 0x0008;
const ENCRYPTED_FLAGS = 0x0041;
const DEFLATE_FLAGS = 0x0006;
const ALLOWED_FLAGS = UTF8_FLAG | DEFLATE_FLAGS;
const ZIP64_EXTRA_ID = 0x0001;
const UNIX_CREATOR_PLATFORM = 3;
const UNIX_FILE_TYPE_MASK = 0o170000;
const UNIX_REGULAR_FILE = 0o100000;
const DOS_DIRECTORY_ATTRIBUTE = 0x10;

const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb8_8320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ bytes[i]!) & 0xff]!;
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function comparePaths(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function rejected(
  code: AssetPackArchiveDiagnostic['code'],
  message: string,
  diagnosticPath?: string,
  details?: Readonly<Record<string, unknown>>,
): Rejected {
  const diagnostic: AssetPackArchiveDiagnostic = {
    code,
    message,
    ...(diagnosticPath === undefined ? {} : { path: diagnosticPath }),
    ...(details === undefined ? {} : { details }),
  };
  return { ok: false, diagnostics: [diagnostic] };
}

function readUInt16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUInt32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

function findEocd(bytes: Uint8Array): number | undefined {
  if (bytes.byteLength < 22) return undefined;
  const searchStart = Math.max(0, bytes.byteLength - 65_557);
  for (let offset = bytes.byteLength - 22; offset >= searchStart; offset -= 1) {
    if (readUInt32LE(bytes, offset) !== EOCD_SIGNATURE) continue;
    const commentLength = readUInt16LE(bytes, offset + 20);
    if (offset + 22 + commentLength === bytes.byteLength) return offset;
  }
  return undefined;
}

function containsZip64Record(bytes: Uint8Array, eocdOffset: number): boolean {
  if (
    eocdOffset >= 20 &&
    readUInt32LE(bytes, eocdOffset - 20) === ZIP64_LOCATOR_SIGNATURE
  ) {
    return true;
  }
  const searchStart = Math.max(0, eocdOffset - 65_557);
  for (let offset = searchStart; offset + 4 <= eocdOffset; offset += 1) {
    if (readUInt32LE(bytes, offset) === ZIP64_EOCD_SIGNATURE) return true;
  }
  return false;
}

function extraFieldStatus(extra: Uint8Array): 'ok' | 'invalid' | 'zip64' {
  let offset = 0;
  while (offset < extra.byteLength) {
    if (offset + 4 > extra.byteLength) return 'invalid';
    const id = readUInt16LE(extra, offset);
    const size = readUInt16LE(extra, offset + 2);
    const nextOffset = offset + 4 + size;
    if (nextOffset > extra.byteLength) return 'invalid';
    if (id === ZIP64_EXTRA_ID) return 'zip64';
    offset = nextOffset;
  }
  return 'ok';
}

function decodeEntryName(
  rawName: Uint8Array,
  flags: number,
  runtime: AssetPackFormatRuntime,
): Checked<string> {
  if ((flags & UTF8_FLAG) !== 0) {
    try {
      return { ok: true, value: runtime.decodeUtf8Fatal(rawName) };
    } catch {
      return rejected(
        'asset_archive_unsafe',
        'ZIP entry name is not valid UTF-8.',
      );
    }
  }
  for (const byte of rawName) {
    if (byte < 0x20 || byte > 0x7e) {
      return rejected(
        'asset_archive_unsafe',
        'Unflagged ZIP entry names must contain printable ASCII only.',
      );
    }
  }
  let str = '';
  for (const byte of rawName) {
    str += String.fromCharCode(byte);
  }
  return { ok: true, value: str };
}

function validateArchivePath(
  entryPath: string,
  runtime: AssetPackFormatRuntime,
): Checked<string> {
  if (
    entryPath.length === 0 ||
    entryPath.startsWith('/') ||
    /^[A-Za-z]:/u.test(entryPath) ||
    entryPath.includes('\\') ||
    /[\u0000-\u001f\u007f]/u.test(entryPath)
  ) {
    return rejected(
      'asset_archive_unsafe',
      `Unsafe archive entry path: ${entryPath}.`,
      entryPath,
    );
  }
  const segments = entryPath.split('/');
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        /[<>:"|?*]/u.test(segment) ||
        /[. ]$/u.test(segment) ||
        /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/iu.test(segment),
    )
  ) {
    return rejected(
      'asset_archive_unsafe',
      `Unsafe archive entry path: ${entryPath}.`,
      entryPath,
    );
  }
  const pathByteLength = runtime.encodeUtf8(entryPath).byteLength;
  if (pathByteLength > ASSET_PACK_ARCHIVE_LIMITS.pathBytes) {
    return rejected(
      'asset_archive_limit_exceeded',
      `Archive entry path exceeds the ${String(ASSET_PACK_ARCHIVE_LIMITS.pathBytes)}-byte limit.`,
      entryPath,
    );
  }
  if (
    entryPath !== 'asset-pack.json' &&
    entryPath !== 'checksums.json' &&
    !entryPath.startsWith('sprites/')
  ) {
    return rejected(
      'asset_archive_unsafe',
      `Archive entry is outside the allowed roots: ${entryPath}.`,
      entryPath,
    );
  }
  return { ok: true, value: entryPath };
}

function validateEntryKind(
  entryPath: string,
  creatorPlatform: number,
  externalAttributes: number,
): Checked<true> {
  if (creatorPlatform === UNIX_CREATOR_PLATFORM) {
    const unixMode = externalAttributes >>> 16;
    if ((unixMode & UNIX_FILE_TYPE_MASK) !== UNIX_REGULAR_FILE) {
      return rejected(
        'asset_archive_unsafe',
        `Archive entry is not a UNIX regular file: ${entryPath}.`,
        entryPath,
      );
    }
  } else if ((externalAttributes & DOS_DIRECTORY_ATTRIBUTE) !== 0) {
    return rejected(
      'asset_archive_unsafe',
      `Archive entry is a directory: ${entryPath}.`,
      entryPath,
    );
  }
  return { ok: true, value: true };
}

function parseArchiveMetadata(
  bytes: Uint8Array,
  runtime: AssetPackFormatRuntime,
): Checked<readonly ZipCentralEntry[]> {
  const eocdOffset = findEocd(bytes);
  if (eocdOffset === undefined) {
    return rejected(
      'asset_archive_invalid',
      'Archive has no valid end-of-central-directory record.',
    );
  }
  const diskNumber = readUInt16LE(bytes, eocdOffset + 4);
  const centralDisk = readUInt16LE(bytes, eocdOffset + 6);
  const diskEntryCount = readUInt16LE(bytes, eocdOffset + 8);
  const entryCount = readUInt16LE(bytes, eocdOffset + 10);
  const centralSize = readUInt32LE(bytes, eocdOffset + 12);
  const centralOffset = readUInt32LE(bytes, eocdOffset + 16);

  if (
    containsZip64Record(bytes, eocdOffset) ||
    diskEntryCount === 0xffff ||
    entryCount === 0xffff ||
    centralSize === 0xffff_ffff ||
    centralOffset === 0xffff_ffff
  ) {
    return rejected(
      'asset_archive_unsafe',
      'ZIP64 asset-pack archives are not supported.',
    );
  }
  if (diskNumber !== 0 || centralDisk !== 0 || diskEntryCount !== entryCount) {
    return rejected(
      'asset_archive_unsafe',
      'Multi-disk ZIP archives are not supported.',
    );
  }
  if (entryCount > ASSET_PACK_ARCHIVE_LIMITS.entries) {
    return rejected(
      'asset_archive_limit_exceeded',
      `Archive contains more than ${String(ASSET_PACK_ARCHIVE_LIMITS.entries)} entries.`,
    );
  }
  if (centralOffset + centralSize !== eocdOffset) {
    return rejected(
      'asset_archive_invalid',
      'Archive central-directory offset or length is invalid.',
    );
  }

  const entries: ZipCentralEntry[] = [];
  const collisionPaths = new Set<string>();
  let declaredTotal = 0;
  let declaredEncodedTotal = 0;
  let offset = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (
      offset + 46 > eocdOffset ||
      readUInt32LE(bytes, offset) !== CENTRAL_SIGNATURE
    ) {
      return rejected(
        'asset_archive_invalid',
        'Archive central-directory entry is invalid.',
      );
    }
    const creatorPlatform = readUInt16LE(bytes, offset + 4) >>> 8;
    const flags = readUInt16LE(bytes, offset + 8);
    const compressionMethod = readUInt16LE(bytes, offset + 10);
    const entryCrc32 = readUInt32LE(bytes, offset + 16);
    const compressedSize = readUInt32LE(bytes, offset + 20);
    const uncompressedSize = readUInt32LE(bytes, offset + 24);
    const nameLength = readUInt16LE(bytes, offset + 28);
    const extraLength = readUInt16LE(bytes, offset + 30);
    const commentLength = readUInt16LE(bytes, offset + 32);
    const startDisk = readUInt16LE(bytes, offset + 34);
    const externalAttributes = readUInt32LE(bytes, offset + 38);
    const localHeaderOffset = readUInt32LE(bytes, offset + 42);
    const nameStart = offset + 46;
    const extraStart = nameStart + nameLength;
    const nextOffset = extraStart + extraLength + commentLength;

    if (nextOffset > eocdOffset) {
      return rejected(
        'asset_archive_invalid',
        'Archive central-directory entry length is invalid.',
      );
    }
    if (
      compressedSize === 0xffff_ffff ||
      uncompressedSize === 0xffff_ffff ||
      localHeaderOffset === 0xffff_ffff ||
      startDisk === 0xffff
    ) {
      return rejected(
        'asset_archive_unsafe',
        'ZIP64 entry markers are not supported.',
      );
    }
    if (startDisk !== 0) {
      return rejected(
        'asset_archive_unsafe',
        'Multi-disk ZIP entries are not supported.',
      );
    }
    const extraStatus = extraFieldStatus(
      bytes.subarray(extraStart, extraStart + extraLength),
    );
    if (extraStatus === 'zip64') {
      return rejected(
        'asset_archive_unsafe',
        'ZIP64 entry metadata is not supported.',
      );
    }
    if (extraStatus === 'invalid') {
      return rejected(
        'asset_archive_invalid',
        'Archive central-directory extra data is invalid.',
      );
    }
    if (
      (flags & ENCRYPTED_FLAGS) !== 0 ||
      (flags & DATA_DESCRIPTOR_FLAG) !== 0
    ) {
      return rejected(
        'asset_archive_unsafe',
        'Encrypted or streamed ZIP entries are not supported.',
      );
    }
    if ((flags & ~ALLOWED_FLAGS) !== 0) {
      return rejected(
        'asset_archive_unsafe',
        'ZIP entry uses unsupported general-purpose flags.',
      );
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      return rejected(
        'asset_archive_unsafe',
        `ZIP compression method ${String(compressionMethod)} is not supported.`,
      );
    }
    if (compressionMethod === 0 && (flags & DEFLATE_FLAGS) !== 0) {
      return rejected(
        'asset_archive_unsafe',
        'Stored ZIP entries must not use DEFLATE-specific general-purpose flags.',
      );
    }

    const rawName = bytes.subarray(nameStart, nameStart + nameLength);
    const decoded = decodeEntryName(rawName, flags, runtime);
    if (!decoded.ok) return decoded;
    const validatedPath = validateArchivePath(decoded.value, runtime);
    if (!validatedPath.ok) return validatedPath;
    const entryPath = validatedPath.value;
    const collisionPath = entryPath.normalize('NFC').toLowerCase();
    if (collisionPaths.has(collisionPath)) {
      return rejected(
        'asset_archive_unsafe',
        `Archive entry path collides with another entry: ${entryPath}.`,
        entryPath,
      );
    }
    collisionPaths.add(collisionPath);
    const kind = validateEntryKind(
      entryPath,
      creatorPlatform,
      externalAttributes,
    );
    if (!kind.ok) return kind;

    if (compressedSize > ASSET_PACK_ARCHIVE_LIMITS.entryBytes) {
      return rejected(
        'asset_archive_limit_exceeded',
        `Archive encoded entry exceeds the ${String(ASSET_PACK_ARCHIVE_LIMITS.entryBytes)}-byte limit.`,
        entryPath,
      );
    }
    declaredEncodedTotal += compressedSize;
    if (declaredEncodedTotal > ASSET_PACK_ARCHIVE_LIMITS.totalBytes) {
      return rejected(
        'asset_archive_limit_exceeded',
        `Archive encoded data exceeds the ${String(ASSET_PACK_ARCHIVE_LIMITS.totalBytes)}-byte total limit.`,
      );
    }
    if (uncompressedSize > ASSET_PACK_ARCHIVE_LIMITS.entryBytes) {
      return rejected(
        'asset_archive_limit_exceeded',
        `Archive entry exceeds the ${String(ASSET_PACK_ARCHIVE_LIMITS.entryBytes)}-byte limit.`,
        entryPath,
      );
    }
    if (
      entryPath === 'asset-pack.json' &&
      uncompressedSize > ASSET_PACK_ARCHIVE_LIMITS.manifestBytes
    ) {
      return rejected(
        'asset_archive_limit_exceeded',
        `asset-pack.json exceeds the ${String(ASSET_PACK_ARCHIVE_LIMITS.manifestBytes)}-byte limit.`,
        entryPath,
      );
    }
    declaredTotal += uncompressedSize;
    if (declaredTotal > ASSET_PACK_ARCHIVE_LIMITS.totalBytes) {
      return rejected(
        'asset_archive_limit_exceeded',
        `Archive exceeds the ${String(ASSET_PACK_ARCHIVE_LIMITS.totalBytes)}-byte total limit.`,
      );
    }

    if (
      localHeaderOffset + 30 > centralOffset ||
      readUInt32LE(bytes, localHeaderOffset) !== LOCAL_SIGNATURE
    ) {
      return rejected(
        'asset_archive_invalid',
        'Archive local entry offset is invalid.',
        entryPath,
      );
    }
    const localFlags = readUInt16LE(bytes, localHeaderOffset + 6);
    const localMethod = readUInt16LE(bytes, localHeaderOffset + 8);
    const localCrc32 = readUInt32LE(bytes, localHeaderOffset + 14);
    const localCompressedSize = readUInt32LE(bytes, localHeaderOffset + 18);
    const localUncompressedSize = readUInt32LE(bytes, localHeaderOffset + 22);
    const localNameLength = readUInt16LE(bytes, localHeaderOffset + 26);
    const localExtraLength = readUInt16LE(bytes, localHeaderOffset + 28);
    const localNameStart = localHeaderOffset + 30;
    const localExtraStart = localNameStart + localNameLength;
    const dataStart = localExtraStart + localExtraLength;
    const dataEnd = dataStart + compressedSize;

    if (dataStart > centralOffset || dataEnd > centralOffset) {
      return rejected(
        'asset_archive_invalid',
        'Archive local entry length is invalid.',
        entryPath,
      );
    }
    const localExtraStatus = extraFieldStatus(
      bytes.subarray(localExtraStart, localExtraStart + localExtraLength),
    );
    if (localExtraStatus === 'zip64') {
      return rejected(
        'asset_archive_unsafe',
        'ZIP64 local entry metadata is not supported.',
        entryPath,
      );
    }
    if (localExtraStatus === 'invalid') {
      return rejected(
        'asset_archive_invalid',
        'Archive local entry extra data is invalid.',
        entryPath,
      );
    }
    const localRawName = bytes.subarray(
      localNameStart,
      localNameStart + localNameLength,
    );
    if (
      !bytesEqual(rawName, localRawName) ||
      flags !== localFlags ||
      compressionMethod !== localMethod ||
      entryCrc32 !== localCrc32 ||
      compressedSize !== localCompressedSize ||
      uncompressedSize !== localUncompressedSize
    ) {
      return rejected(
        'asset_archive_invalid',
        'Archive central and local entry metadata do not match.',
        entryPath,
      );
    }

    entries.push({
      path: entryPath,
      rawName: new Uint8Array(rawName),
      flags,
      compressionMethod,
      crc32: entryCrc32,
      compressedSize,
      uncompressedSize,
      creatorPlatform,
      externalAttributes,
      localHeaderOffset,
      dataStart,
      dataEnd,
    });
    offset = nextOffset;
  }

  if (offset !== eocdOffset) {
    return rejected(
      'asset_archive_invalid',
      'Archive central-directory length is invalid.',
    );
  }

  const localRanges = [...entries].sort(
    (left, right) => left.localHeaderOffset - right.localHeaderOffset,
  );
  for (let index = 1; index < localRanges.length; index += 1) {
    const previous = localRanges[index - 1]!;
    const current = localRanges[index]!;
    if (current.localHeaderOffset < previous.dataEnd) {
      return rejected(
        'asset_archive_invalid',
        'Archive local entry ranges overlap.',
        current.path,
      );
    }
  }

  return { ok: true, value: entries };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function readEntryBytes(
  bytes: Uint8Array,
  entry: ZipCentralEntry,
  runtime: AssetPackFormatRuntime,
): Promise<Checked<Uint8Array>> {
  const compressed = bytes.subarray(entry.dataStart, entry.dataEnd);
  let contents: Uint8Array;

  if (entry.compressionMethod === 0) {
    contents = new Uint8Array(compressed);
  } else {
    // Preflight inspect DEFLATE stream structure before invoking runtime inflater
    try {
      const inspection = inspectRawDeflate({
        compressed,
        declaredSize: entry.uncompressedSize,
        maximumSize: Math.min(
          entry.uncompressedSize,
          ASSET_PACK_ARCHIVE_LIMITS.entryBytes,
        ),
      });
      if (inspection.decodedSize !== entry.uncompressedSize) {
        return rejected(
          'asset_archive_invalid',
          `Archive entry length does not match its declaration: ${entry.path}.`,
          entry.path,
        );
      }
    } catch (error) {
      return rejected(
        'asset_archive_invalid',
        `Could not inflate archive entry: ${entry.path}.`,
        entry.path,
        { error: error instanceof Error ? error.message : String(error) },
      );
    }

    try {
      contents = await runtime.inflateRawBounded({
        compressed,
        declaredSize: entry.uncompressedSize,
        maximumSize: Math.min(
          entry.uncompressedSize,
          ASSET_PACK_ARCHIVE_LIMITS.entryBytes,
        ),
      });
    } catch (error) {
      return rejected(
        'asset_archive_invalid',
        `Could not inflate archive entry: ${entry.path}.`,
        entry.path,
        { error: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  if (contents.byteLength !== entry.uncompressedSize) {
    return rejected(
      'asset_archive_invalid',
      `Archive entry length does not match its declaration: ${entry.path}.`,
      entry.path,
    );
  }
  if (crc32(contents) !== entry.crc32) {
    return rejected(
      'asset_archive_invalid',
      `Archive entry CRC does not match its contents: ${entry.path}.`,
      entry.path,
    );
  }

  return { ok: true, value: contents };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  record: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(record).sort(comparePaths);
  const sortedExpected = [...expected].sort(comparePaths);
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function parseChecksums(
  bytes: Uint8Array,
  runtime: AssetPackFormatRuntime,
): Checked<readonly AssetPackChecksumEntry[]> {
  let json: unknown;
  try {
    json = JSON.parse(runtime.decodeUtf8Fatal(bytes)) as unknown;
  } catch (error) {
    return rejected(
      'asset_checksum_invalid',
      'checksums.json is not valid UTF-8 JSON.',
      'checksums.json',
      { error: error instanceof Error ? error.message : String(error) },
    );
  }
  if (
    !isRecord(json) ||
    !hasExactKeys(json, ['schema', 'files']) ||
    json['schema'] !== ASSET_PACK_CHECKSUMS_SCHEMA ||
    !Array.isArray(json['files'])
  ) {
    return rejected(
      'asset_checksum_invalid',
      'checksums.json does not match the required schema.',
      'checksums.json',
    );
  }

  const entries: AssetPackChecksumEntry[] = [];
  for (const value of json['files']) {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, ['path', 'size', 'sha256']) ||
      typeof value['path'] !== 'string' ||
      !Number.isSafeInteger(value['size']) ||
      typeof value['size'] !== 'number' ||
      value['size'] < 0 ||
      typeof value['sha256'] !== 'string' ||
      !/^sha256:[0-9a-f]{64}$/u.test(value['sha256'])
    ) {
      return rejected(
        'asset_checksum_invalid',
        'checksums.json contains an invalid file row.',
        'checksums.json',
      );
    }
    const validatedPath = validateArchivePath(value['path'], runtime);
    if (!validatedPath.ok || value['path'] === 'checksums.json') {
      return rejected(
        'asset_checksum_invalid',
        'checksums.json contains an unsafe or self-referential path.',
        'checksums.json',
      );
    }
    const previous = entries.at(-1);
    if (previous && comparePaths(previous.path, value['path']) >= 0) {
      return rejected(
        'asset_checksum_invalid',
        'checksums.json file rows are not strictly path-sorted.',
        'checksums.json',
      );
    }
    entries.push({
      path: value['path'],
      size: value['size'],
      sha256: value['sha256'],
    });
  }
  return { ok: true, value: entries };
}

async function verifyChecksums(
  files: ReadonlyMap<string, Uint8Array>,
  checksums: readonly AssetPackChecksumEntry[],
  runtime: AssetPackFormatRuntime,
): Promise<Checked<true>> {
  const expectedPaths = [...files.keys()]
    .filter((entryPath) => entryPath !== 'checksums.json')
    .sort(comparePaths);
  if (
    expectedPaths.length !== checksums.length ||
    expectedPaths.some(
      (entryPath, index) => entryPath !== checksums[index]?.path,
    )
  ) {
    return rejected(
      'asset_checksum_invalid',
      'checksums.json must cover every payload entry exactly once.',
      'checksums.json',
    );
  }
  for (const checksum of checksums) {
    const contents = files.get(checksum.path);
    if (!contents) {
      return rejected(
        'asset_checksum_invalid',
        `Checksum references a missing archive entry: ${checksum.path}.`,
        checksum.path,
      );
    }
    const fileDigest = await runtime.sha256(contents);
    if (
      contents.byteLength !== checksum.size ||
      fileDigest !== checksum.sha256
    ) {
      return rejected(
        'asset_digest_mismatch',
        `Archive entry does not match its checksum: ${checksum.path}.`,
        checksum.path,
      );
    }
  }
  return { ok: true, value: true };
}

export async function inspectAssetPackArchiveBytes(options: {
  readonly archiveBytes: Uint8Array;
  readonly runtime: AssetPackFormatRuntime;
}): Promise<AssetPackArchiveInspection> {
  const archiveBytesCopy = new Uint8Array(options.archiveBytes);
  if (archiveBytesCopy.byteLength > ASSET_PACK_ARCHIVE_LIMITS.archiveBytes) {
    return {
      kind: 'unsafe',
      diagnostics: [
        {
          code: 'asset_archive_limit_exceeded',
          message: `Archive exceeds the ${String(ASSET_PACK_ARCHIVE_LIMITS.archiveBytes)}-byte encoded limit.`,
        },
      ],
    };
  }

  const metadata = parseArchiveMetadata(archiveBytesCopy, options.runtime);
  if (!metadata.ok) {
    return { kind: 'unsafe', diagnostics: metadata.diagnostics };
  }

  const files = new Map<string, Uint8Array>();
  let totalUncompressedBytes = 0;
  for (const entry of metadata.value) {
    const contents = await readEntryBytes(
      archiveBytesCopy,
      entry,
      options.runtime,
    );
    if (!contents.ok) {
      return { kind: 'unsafe', diagnostics: contents.diagnostics };
    }
    files.set(entry.path, contents.value);
    totalUncompressedBytes += contents.value.byteLength;
  }

  const archiveDigest = await options.runtime.sha256(archiveBytesCopy);
  const manifestBytes = files.get('asset-pack.json');
  const checksumsBytes = files.get('checksums.json');

  const sourceBytes = new Map<string, Uint8Array>();
  for (const [entryPath, contents] of files) {
    if (entryPath.startsWith('sprites/')) {
      sourceBytes.set(entryPath, new Uint8Array(contents));
    }
  }

  let manifestDocument: Record<string, unknown> | undefined;
  if (manifestBytes) {
    try {
      const parsed = JSON.parse(
        options.runtime.decodeUtf8Fatal(manifestBytes),
      ) as unknown;
      if (isRecord(parsed)) manifestDocument = parsed;
    } catch {
      // Ignore parse failure, keep undefined
    }
  }

  const snapshotBase = {
    archiveBytes: archiveBytesCopy,
    archiveDigest,
    ...(manifestBytes ? { manifestBytes: new Uint8Array(manifestBytes) } : {}),
    ...(manifestDocument ? { manifestDocument } : {}),
    ...(checksumsBytes
      ? { checksumsBytes: new Uint8Array(checksumsBytes) }
      : {}),
    sourceBytes,
    entryCount: files.size,
    totalUncompressedBytes,
  };

  const diagnostics: AssetPackArchiveDiagnostic[] = [];

  if (!manifestBytes || !checksumsBytes) {
    diagnostics.push({
      code: 'asset_archive_invalid',
      message: 'Archive must contain asset-pack.json and checksums.json.',
    });
    return { kind: 'repairable', snapshot: snapshotBase, diagnostics };
  }

  const checksums = parseChecksums(checksumsBytes, options.runtime);
  if (!checksums.ok) {
    return {
      kind: 'repairable',
      snapshot: snapshotBase,
      diagnostics: checksums.diagnostics,
    };
  }

  const verifiedChecksums = await verifyChecksums(
    files,
    checksums.value,
    options.runtime,
  );
  if (!verifiedChecksums.ok) {
    return {
      kind: 'repairable',
      snapshot: snapshotBase,
      diagnostics: verifiedChecksums.diagnostics,
    };
  }

  const payload = await parseAssetPackPayload({
    manifestBytes,
    sourceBytes,
    runtime: options.runtime,
  });

  if (!payload.ok) {
    return {
      kind: 'repairable',
      snapshot: snapshotBase,
      diagnostics: [
        {
          code: 'asset_archive_invalid',
          message: 'Archive payload is invalid.',
          path: 'asset-pack.json',
          details: { diagnostics: payload.diagnostics },
        },
      ],
    };
  }

  // Check for safe unreferenced sprite sources
  if (sourceBytes.size > payload.sourceBytes.size) {
    diagnostics.push({
      code: 'asset_archive_invalid',
      message: 'Archive contains unreferenced sprite source entries.',
    });
    return { kind: 'repairable', snapshot: snapshotBase, diagnostics };
  }

  const verifiedSnapshot: AssetPackVerifiedSnapshot = {
    ...snapshotBase,
    manifestBytes: new Uint8Array(manifestBytes),
    manifestDocument: manifestDocument ?? {},
    checksumsBytes: new Uint8Array(checksumsBytes),
    payload,
  };

  return {
    kind: 'verified',
    snapshot: verifiedSnapshot,
    diagnostics: [],
  };
}

export async function createAssetPackArchive(options: {
  readonly kind: 'draft' | 'formal';
  readonly manifestDocument: Readonly<Record<string, unknown>>;
  readonly sourceBytes: ReadonlyMap<string, Uint8Array>;
  readonly runtime: AssetPackFormatRuntime;
}): Promise<{
  readonly archiveBytes: Uint8Array;
  readonly archiveDigest: AssetPackSha256;
  readonly inspection: Extract<
    AssetPackArchiveInspection,
    { readonly kind: 'verified' | 'repairable' }
  >;
}> {
  const docToUse =
    options.kind === 'draft'
      ? { ...options.manifestDocument, status: 'draft' }
      : { ...options.manifestDocument };

  if (options.kind === 'formal' && docToUse['status'] === 'draft') {
    throw new Error('Cannot assemble a formal asset-pack archive with draft status.');
  }

  const manifestBytes = encodeCanonicalJson(docToUse, options.runtime.encodeUtf8);
  if (manifestBytes.byteLength > ASSET_PACK_ARCHIVE_LIMITS.manifestBytes) {
    throw new Error(
      `asset-pack.json exceeds limit of ${String(ASSET_PACK_ARCHIVE_LIMITS.manifestBytes)} bytes.`,
    );
  }

  const sourceBytesCopy = new Map<string, Uint8Array>();
  for (const [k, v] of options.sourceBytes) {
    const validated = validateArchivePath(k, options.runtime);
    if (!validated.ok) {
      throw new Error(`Unsafe archive path: ${k}`);
    }
    sourceBytesCopy.set(k, new Uint8Array(v));
  }

  if (options.kind === 'formal') {
    const payload = await parseAssetPackPayload({
      manifestBytes,
      sourceBytes: sourceBytesCopy,
      runtime: options.runtime,
    });
    if (!payload.ok) {
      throw new Error(
        `Cannot archive invalid formal payload: ${JSON.stringify(payload.diagnostics)}`,
      );
    }
    if (sourceBytesCopy.size > payload.sourceBytes.size) {
      throw new Error(
        'Cannot assemble formal archive with unreferenced sprite sources.',
      );
    }
  }

  const filesForChecksums = new Map<string, Uint8Array>([
    ['asset-pack.json', manifestBytes],
    ...sourceBytesCopy,
  ]);

  const checksumRows: AssetPackChecksumEntry[] = [];
  for (const [path, contents] of [...filesForChecksums].sort(
    ([left], [right]) => comparePaths(left, right),
  )) {
    const sha = await options.runtime.sha256(contents);
    checksumRows.push({ path, size: contents.byteLength, sha256: sha });
  }

  const checksumsBytes = encodeCanonicalJson(
    {
      schema: ASSET_PACK_CHECKSUMS_SCHEMA,
      files: checksumRows,
    },
    options.runtime.encodeUtf8,
  );

  const allFiles = new Map<string, Uint8Array>([
    ['asset-pack.json', manifestBytes],
    ['checksums.json', checksumsBytes],
    ...sourceBytesCopy,
  ]);

  if (allFiles.size > ASSET_PACK_ARCHIVE_LIMITS.entries) {
    throw new Error('Exceeds archive entry limit.');
  }

  const zip = new JSZip();
  for (const [entryPath, contents] of [...allFiles].sort(
    ([left], [right]) => comparePaths(left, right),
  )) {
    zip.file(entryPath, contents, {
      binary: true,
      date: new Date(Date.UTC(1980, 0, 1, 0, 0, 0)),
      createFolders: false,
      unixPermissions: 0o100644,
    });
  }

  const archiveBytes = await zip.generateAsync({
    type: 'uint8array',
    platform: 'UNIX',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    streamFiles: false,
  });

  if (archiveBytes.byteLength > ASSET_PACK_ARCHIVE_LIMITS.archiveBytes) {
    throw new Error('Generated archive exceeds maximum encoded size limit.');
  }

  const readBack = await inspectAssetPackArchiveBytes({
    archiveBytes,
    runtime: options.runtime,
  });

  if (options.kind === 'formal' && readBack.kind !== 'verified') {
    throw new Error(
      `Generated formal archive failed verification: ${JSON.stringify(readBack.diagnostics)}`,
    );
  }
  if (readBack.kind === 'unsafe') {
    throw new Error(
      `Generated draft archive is unsafe: ${JSON.stringify(readBack.diagnostics)}`,
    );
  }

  const archiveDigest = await options.runtime.sha256(archiveBytes);
  return {
    archiveBytes,
    archiveDigest,
    inspection: readBack,
  };
}
