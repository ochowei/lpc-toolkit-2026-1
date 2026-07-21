import { createHash } from 'node:crypto';
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
import { inflateRawSync } from 'node:zlib';
import JSZip from 'jszip';
import {
  parseAssetPackPayload,
  type AssetPackPayloadSuccess,
} from './asset-pack-payload.js';

export const ASSET_PACK_CHECKSUMS_SCHEMA =
  'lpc-toolkit.asset-pack-checksums.v1' as const;

export const ASSET_PACK_ARCHIVE_LIMITS = {
  entries: 4_096,
  manifestBytes: 1 * 1_024 * 1_024,
  entryBytes: 64 * 1_024 * 1_024,
  totalBytes: 512 * 1_024 * 1_024,
  pathBytes: 1 * 1_024,
  archiveBytes: (512 * 1_024 * 1_024) + (4_096 * ((2 * 65_535) + 76)) + 65_557,
} as const;

export interface AssetPackChecksumEntry {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

export interface AssetPackArchiveSnapshot {
  readonly archivePath: string;
  readonly archiveBytes: Buffer;
  readonly archiveDigest: string;
  readonly manifestBytes: Buffer;
  readonly checksumsBytes: Buffer;
  readonly checksums: readonly AssetPackChecksumEntry[];
  readonly payload: AssetPackPayloadSuccess;
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

export type AssetPackArchiveReadResult =
  | { readonly ok: true; readonly snapshot: AssetPackArchiveSnapshot }
  | { readonly ok: false; readonly diagnostics: readonly AssetPackArchiveDiagnostic[] };

interface ZipCentralEntry {
  readonly path: string;
  readonly rawName: Buffer;
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
  | { readonly ok: false; readonly diagnostics: readonly AssetPackArchiveDiagnostic[] };

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
const verifiedExtractionFiles = new WeakMap<
  AssetPackArchiveSnapshot,
  ReadonlyMap<string, Buffer>
>();
const fatalUtf8Decoder = new TextDecoder('utf-8', { fatal: true });

function comparePaths(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function digest(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function crc32(bytes: Buffer): number {
  let value = 0xffff_ffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ ((value & 1) === 0 ? 0 : 0xedb8_8320);
    }
  }
  return (value ^ 0xffff_ffff) >>> 0;
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

function findEocd(bytes: Buffer): number | undefined {
  if (bytes.byteLength < 22) return undefined;
  const searchStart = Math.max(0, bytes.byteLength - 65_557);
  for (let offset = bytes.byteLength - 22; offset >= searchStart; offset -= 1) {
    if (bytes.readUInt32LE(offset) !== EOCD_SIGNATURE) continue;
    const commentLength = bytes.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === bytes.byteLength) return offset;
  }
  return undefined;
}

function containsZip64Record(bytes: Buffer, eocdOffset: number): boolean {
  if (
    eocdOffset >= 20
    && bytes.readUInt32LE(eocdOffset - 20) === ZIP64_LOCATOR_SIGNATURE
  ) {
    return true;
  }
  const searchStart = Math.max(0, eocdOffset - 65_557);
  for (let offset = searchStart; offset + 4 <= eocdOffset; offset += 1) {
    if (bytes.readUInt32LE(offset) === ZIP64_EOCD_SIGNATURE) return true;
  }
  return false;
}

function extraFieldStatus(extra: Buffer): 'ok' | 'invalid' | 'zip64' {
  let offset = 0;
  while (offset < extra.byteLength) {
    if (offset + 4 > extra.byteLength) return 'invalid';
    const id = extra.readUInt16LE(offset);
    const size = extra.readUInt16LE(offset + 2);
    const nextOffset = offset + 4 + size;
    if (nextOffset > extra.byteLength) return 'invalid';
    if (id === ZIP64_EXTRA_ID) return 'zip64';
    offset = nextOffset;
  }
  return 'ok';
}

function decodeEntryName(rawName: Buffer, flags: number): Checked<string> {
  if ((flags & UTF8_FLAG) !== 0) {
    try {
      return { ok: true, value: fatalUtf8Decoder.decode(rawName) };
    } catch {
      return rejected('asset_archive_unsafe', 'ZIP entry name is not valid UTF-8.');
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
  return { ok: true, value: rawName.toString('ascii') };
}

function validateArchivePath(entryPath: string): Checked<string> {
  if (
    entryPath.length === 0
    || entryPath.startsWith('/')
    || /^[A-Za-z]:/u.test(entryPath)
    || entryPath.includes('\\')
    || /[\u0000-\u001f\u007f]/u.test(entryPath)
  ) {
    return rejected('asset_archive_unsafe', `Unsafe archive entry path: ${entryPath}.`, entryPath);
  }
  const segments = entryPath.split('/');
  if (segments.some((segment) => (
    segment.length === 0
    || segment === '.'
    || segment === '..'
    || /[<>:"|?*]/u.test(segment)
    || /[. ]$/u.test(segment)
    || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/iu.test(segment)
  ))) {
    return rejected('asset_archive_unsafe', `Unsafe archive entry path: ${entryPath}.`, entryPath);
  }
  if (Buffer.byteLength(entryPath) > ASSET_PACK_ARCHIVE_LIMITS.pathBytes) {
    return rejected(
      'asset_archive_limit_exceeded',
      `Archive entry path exceeds the ${String(ASSET_PACK_ARCHIVE_LIMITS.pathBytes)}-byte limit.`,
      entryPath,
    );
  }
  if (
    entryPath !== 'asset-pack.json'
    && entryPath !== 'checksums.json'
    && !entryPath.startsWith('sprites/')
  ) {
    return rejected(
      'asset_archive_unsafe',
      `Archive entry is outside the allowed roots: ${entryPath}.`,
      entryPath,
    );
  }
  return { ok: true, value: entryPath };
}

function validateArchiveFiles(files: ReadonlyMap<string, Buffer>): Checked<true> {
  if (files.size > ASSET_PACK_ARCHIVE_LIMITS.entries) {
    return rejected(
      'asset_archive_limit_exceeded',
      `Archive contains more than ${String(ASSET_PACK_ARCHIVE_LIMITS.entries)} entries.`,
    );
  }
  const collisionPaths = new Set<string>();
  let totalBytes = 0;
  for (const [entryPath, contents] of files) {
    const validatedPath = validateArchivePath(entryPath);
    if (!validatedPath.ok) return validatedPath;
    const collisionPath = validatedPath.value.normalize('NFC').toLowerCase();
    if (collisionPaths.has(collisionPath)) {
      return rejected(
        'asset_archive_unsafe',
        `Archive entry path collides with another entry: ${entryPath}.`,
        entryPath,
      );
    }
    collisionPaths.add(collisionPath);
    if (contents.byteLength > ASSET_PACK_ARCHIVE_LIMITS.entryBytes) {
      return rejected(
        'asset_archive_limit_exceeded',
        `Archive entry exceeds the ${String(ASSET_PACK_ARCHIVE_LIMITS.entryBytes)}-byte limit.`,
        entryPath,
      );
    }
    if (
      entryPath === 'asset-pack.json'
      && contents.byteLength > ASSET_PACK_ARCHIVE_LIMITS.manifestBytes
    ) {
      return rejected(
        'asset_archive_limit_exceeded',
        `asset-pack.json exceeds the ${String(ASSET_PACK_ARCHIVE_LIMITS.manifestBytes)}-byte limit.`,
        entryPath,
      );
    }
    totalBytes += contents.byteLength;
    if (totalBytes > ASSET_PACK_ARCHIVE_LIMITS.totalBytes) {
      return rejected(
        'asset_archive_limit_exceeded',
        `Archive exceeds the ${String(ASSET_PACK_ARCHIVE_LIMITS.totalBytes)}-byte total limit.`,
      );
    }
  }
  return { ok: true, value: true };
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

function parseArchiveMetadata(bytes: Buffer): Checked<readonly ZipCentralEntry[]> {
  const eocdOffset = findEocd(bytes);
  if (eocdOffset === undefined) {
    return rejected('asset_archive_invalid', 'Archive has no valid end-of-central-directory record.');
  }
  const diskNumber = bytes.readUInt16LE(eocdOffset + 4);
  const centralDisk = bytes.readUInt16LE(eocdOffset + 6);
  const diskEntryCount = bytes.readUInt16LE(eocdOffset + 8);
  const entryCount = bytes.readUInt16LE(eocdOffset + 10);
  const centralSize = bytes.readUInt32LE(eocdOffset + 12);
  const centralOffset = bytes.readUInt32LE(eocdOffset + 16);
  if (
    containsZip64Record(bytes, eocdOffset)
    || diskEntryCount === 0xffff
    || entryCount === 0xffff
    || centralSize === 0xffff_ffff
    || centralOffset === 0xffff_ffff
  ) {
    return rejected('asset_archive_unsafe', 'ZIP64 asset-pack archives are not supported.');
  }
  if (diskNumber !== 0 || centralDisk !== 0 || diskEntryCount !== entryCount) {
    return rejected('asset_archive_unsafe', 'Multi-disk ZIP archives are not supported.');
  }
  if (entryCount > ASSET_PACK_ARCHIVE_LIMITS.entries) {
    return rejected(
      'asset_archive_limit_exceeded',
      `Archive contains more than ${String(ASSET_PACK_ARCHIVE_LIMITS.entries)} entries.`,
    );
  }
  if (centralOffset + centralSize !== eocdOffset) {
    return rejected('asset_archive_invalid', 'Archive central-directory offset or length is invalid.');
  }

  const entries: ZipCentralEntry[] = [];
  const collisionPaths = new Set<string>();
  let declaredTotal = 0;
  let declaredEncodedTotal = 0;
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > eocdOffset || bytes.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      return rejected('asset_archive_invalid', 'Archive central-directory entry is invalid.');
    }
    const creatorPlatform = bytes.readUInt16LE(offset + 4) >>> 8;
    const flags = bytes.readUInt16LE(offset + 8);
    const compressionMethod = bytes.readUInt16LE(offset + 10);
    const entryCrc32 = bytes.readUInt32LE(offset + 16);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const startDisk = bytes.readUInt16LE(offset + 34);
    const externalAttributes = bytes.readUInt32LE(offset + 38);
    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const extraStart = nameStart + nameLength;
    const nextOffset = extraStart + extraLength + commentLength;
    if (nextOffset > eocdOffset) {
      return rejected('asset_archive_invalid', 'Archive central-directory entry length is invalid.');
    }
    if (
      compressedSize === 0xffff_ffff
      || uncompressedSize === 0xffff_ffff
      || localHeaderOffset === 0xffff_ffff
      || startDisk === 0xffff
    ) {
      return rejected('asset_archive_unsafe', 'ZIP64 entry markers are not supported.');
    }
    if (startDisk !== 0) {
      return rejected('asset_archive_unsafe', 'Multi-disk ZIP entries are not supported.');
    }
    const extraStatus = extraFieldStatus(bytes.subarray(extraStart, extraStart + extraLength));
    if (extraStatus === 'zip64') {
      return rejected('asset_archive_unsafe', 'ZIP64 entry metadata is not supported.');
    }
    if (extraStatus === 'invalid') {
      return rejected('asset_archive_invalid', 'Archive central-directory extra data is invalid.');
    }
    if ((flags & ENCRYPTED_FLAGS) !== 0 || (flags & DATA_DESCRIPTOR_FLAG) !== 0) {
      return rejected('asset_archive_unsafe', 'Encrypted or streamed ZIP entries are not supported.');
    }
    if ((flags & ~ALLOWED_FLAGS) !== 0) {
      return rejected('asset_archive_unsafe', 'ZIP entry uses unsupported general-purpose flags.');
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
    const rawName = Buffer.from(bytes.subarray(nameStart, nameStart + nameLength));
    const decoded = decodeEntryName(rawName, flags);
    if (!decoded.ok) return decoded;
    const validatedPath = validateArchivePath(decoded.value);
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
    const kind = validateEntryKind(entryPath, creatorPlatform, externalAttributes);
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
      entryPath === 'asset-pack.json'
      && uncompressedSize > ASSET_PACK_ARCHIVE_LIMITS.manifestBytes
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
      localHeaderOffset + 30 > centralOffset
      || bytes.readUInt32LE(localHeaderOffset) !== LOCAL_SIGNATURE
    ) {
      return rejected('asset_archive_invalid', 'Archive local entry offset is invalid.', entryPath);
    }
    const localFlags = bytes.readUInt16LE(localHeaderOffset + 6);
    const localMethod = bytes.readUInt16LE(localHeaderOffset + 8);
    const localCrc32 = bytes.readUInt32LE(localHeaderOffset + 14);
    const localCompressedSize = bytes.readUInt32LE(localHeaderOffset + 18);
    const localUncompressedSize = bytes.readUInt32LE(localHeaderOffset + 22);
    const localNameLength = bytes.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localHeaderOffset + 28);
    const localNameStart = localHeaderOffset + 30;
    const localExtraStart = localNameStart + localNameLength;
    const dataStart = localExtraStart + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataStart > centralOffset || dataEnd > centralOffset) {
      return rejected('asset_archive_invalid', 'Archive local entry length is invalid.', entryPath);
    }
    const localExtraStatus = extraFieldStatus(
      bytes.subarray(localExtraStart, localExtraStart + localExtraLength),
    );
    if (localExtraStatus === 'zip64') {
      return rejected('asset_archive_unsafe', 'ZIP64 local entry metadata is not supported.', entryPath);
    }
    if (localExtraStatus === 'invalid') {
      return rejected('asset_archive_invalid', 'Archive local entry extra data is invalid.', entryPath);
    }
    const localRawName = bytes.subarray(localNameStart, localNameStart + localNameLength);
    if (
      Buffer.compare(rawName, localRawName) !== 0
      || flags !== localFlags
      || compressionMethod !== localMethod
      || entryCrc32 !== localCrc32
      || compressedSize !== localCompressedSize
      || uncompressedSize !== localUncompressedSize
    ) {
      return rejected(
        'asset_archive_invalid',
        'Archive central and local entry metadata do not match.',
        entryPath,
      );
    }
    entries.push({
      path: entryPath,
      rawName,
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
    return rejected('asset_archive_invalid', 'Archive central-directory length is invalid.');
  }

  const localRanges = [...entries].sort(
    (left, right) => left.localHeaderOffset - right.localHeaderOffset,
  );
  for (let index = 1; index < localRanges.length; index += 1) {
    const previous = localRanges[index - 1];
    const current = localRanges[index];
    if (!previous || !current) continue;
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

function readEntryBytes(bytes: Buffer, entry: ZipCentralEntry): Checked<Buffer> {
  const compressed = bytes.subarray(entry.dataStart, entry.dataEnd);
  let contents: Buffer;
  try {
    if (entry.compressionMethod === 0) {
      contents = Buffer.from(compressed);
    } else {
      const inflated = inflateRawSync(compressed, {
        // Node requires a positive maxOutputLength; one byte still strictly bounds a declared zero.
        maxOutputLength: Math.max(entry.uncompressedSize, 1),
        info: true,
      }) as unknown as {
        readonly buffer: Buffer;
        readonly engine: { readonly bytesWritten: number };
      };
      if (inflated.engine.bytesWritten !== compressed.byteLength) {
        return rejected(
          'asset_archive_invalid',
          `Archive entry contains trailing DEFLATE bytes: ${entry.path}.`,
          entry.path,
        );
      }
      contents = inflated.buffer;
    }
  } catch (error) {
    return rejected(
      'asset_archive_invalid',
      `Could not inflate archive entry: ${entry.path}.`,
      entry.path,
      { error: error instanceof Error ? error.message : String(error) },
    );
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

function hasExactKeys(record: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort(comparePaths);
  const sortedExpected = [...expected].sort(comparePaths);
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function parseChecksums(bytes: Buffer): Checked<readonly AssetPackChecksumEntry[]> {
  let json: unknown;
  try {
    json = JSON.parse(fatalUtf8Decoder.decode(bytes)) as unknown;
  } catch (error) {
    return rejected(
      'asset_checksum_invalid',
      'checksums.json is not valid UTF-8 JSON.',
      'checksums.json',
      { error: error instanceof Error ? error.message : String(error) },
    );
  }
  if (
    !isRecord(json)
    || !hasExactKeys(json, ['schema', 'files'])
    || json.schema !== ASSET_PACK_CHECKSUMS_SCHEMA
    || !Array.isArray(json.files)
  ) {
    return rejected(
      'asset_checksum_invalid',
      'checksums.json does not match the required schema.',
      'checksums.json',
    );
  }

  const entries: AssetPackChecksumEntry[] = [];
  for (const value of json.files) {
    if (
      !isRecord(value)
      || !hasExactKeys(value, ['path', 'size', 'sha256'])
      || typeof value.path !== 'string'
      || !Number.isSafeInteger(value.size)
      || typeof value.size !== 'number'
      || value.size < 0
      || typeof value.sha256 !== 'string'
      || !/^sha256:[0-9a-f]{64}$/u.test(value.sha256)
    ) {
      return rejected(
        'asset_checksum_invalid',
        'checksums.json contains an invalid file row.',
        'checksums.json',
      );
    }
    const validatedPath = validateArchivePath(value.path);
    if (!validatedPath.ok || value.path === 'checksums.json') {
      return rejected(
        'asset_checksum_invalid',
        'checksums.json contains an unsafe or self-referential path.',
        'checksums.json',
      );
    }
    const previous = entries.at(-1);
    if (previous && comparePaths(previous.path, value.path) >= 0) {
      return rejected(
        'asset_checksum_invalid',
        'checksums.json file rows are not strictly path-sorted.',
        'checksums.json',
      );
    }
    entries.push({ path: value.path, size: value.size, sha256: value.sha256 });
  }
  return { ok: true, value: entries };
}

function verifyChecksums(
  files: ReadonlyMap<string, Buffer>,
  checksums: readonly AssetPackChecksumEntry[],
): Checked<true> {
  const expectedPaths = [...files.keys()]
    .filter((entryPath) => entryPath !== 'checksums.json')
    .sort(comparePaths);
  if (
    expectedPaths.length !== checksums.length
    || expectedPaths.some((entryPath, index) => entryPath !== checksums[index]?.path)
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
    if (contents.byteLength !== checksum.size || digest(contents) !== checksum.sha256) {
      return rejected(
        'asset_digest_mismatch',
        `Archive entry does not match its checksum: ${checksum.path}.`,
        checksum.path,
      );
    }
  }
  return { ok: true, value: true };
}

export function readAssetPackArchive(options: {
  readonly archivePath: string;
  readonly archiveBytes?: Buffer;
}): AssetPackArchiveReadResult {
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
          return rejected(
            'asset_archive_invalid',
            'Asset-pack archive path must refer to a regular file.',
            options.archivePath,
          );
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
            return rejected(
              'asset_archive_limit_exceeded',
              `Archive exceeds the ${String(ASSET_PACK_ARCHIVE_LIMITS.archiveBytes)}-byte encoded limit.`,
              options.archivePath,
            );
          }
        }
        const finalMetadata = fstatSync(descriptor);
        if (finalMetadata.size > ASSET_PACK_ARCHIVE_LIMITS.archiveBytes) {
          return rejected(
            'asset_archive_limit_exceeded',
            `Archive exceeds the ${String(ASSET_PACK_ARCHIVE_LIMITS.archiveBytes)}-byte encoded limit.`,
            options.archivePath,
          );
        }
        archiveBytes = Buffer.concat(chunks, totalBytes);
      } finally {
        closeSync(descriptor);
      }
    } else {
      if (options.archiveBytes.byteLength > ASSET_PACK_ARCHIVE_LIMITS.archiveBytes) {
        return rejected(
          'asset_archive_limit_exceeded',
          `Archive exceeds the ${String(ASSET_PACK_ARCHIVE_LIMITS.archiveBytes)}-byte encoded limit.`,
          options.archivePath,
        );
      }
      archiveBytes = Buffer.from(options.archiveBytes);
    }
  } catch (error) {
    return rejected(
      'asset_archive_invalid',
      `Could not read asset-pack archive: ${options.archivePath}.`,
      options.archivePath,
      { error: error instanceof Error ? error.message : String(error) },
    );
  }
  if (archiveBytes.byteLength > ASSET_PACK_ARCHIVE_LIMITS.archiveBytes) {
    return rejected(
      'asset_archive_limit_exceeded',
      `Archive exceeds the ${String(ASSET_PACK_ARCHIVE_LIMITS.archiveBytes)}-byte encoded limit.`,
      options.archivePath,
    );
  }
  const metadata = parseArchiveMetadata(archiveBytes);
  if (!metadata.ok) return metadata;

  const files = new Map<string, Buffer>();
  for (const entry of metadata.value) {
    const contents = readEntryBytes(archiveBytes, entry);
    if (!contents.ok) return contents;
    files.set(entry.path, contents.value);
  }
  const manifestBytes = files.get('asset-pack.json');
  const checksumsBytes = files.get('checksums.json');
  if (!manifestBytes || !checksumsBytes) {
    return rejected(
      'asset_archive_invalid',
      'Archive must contain asset-pack.json and checksums.json.',
    );
  }
  const checksums = parseChecksums(checksumsBytes);
  if (!checksums.ok) return checksums;
  const verifiedChecksums = verifyChecksums(files, checksums.value);
  if (!verifiedChecksums.ok) return verifiedChecksums;

  const sourceBytes = new Map<string, Buffer>();
  for (const [entryPath, contents] of files) {
    if (entryPath.startsWith('sprites/')) sourceBytes.set(entryPath, contents);
  }
  const payload = parseAssetPackPayload({ manifestBytes, sourceBytes });
  if (!payload.ok) {
    return rejected(
      'asset_archive_invalid',
      'Archive payload is invalid.',
      'asset-pack.json',
      { diagnostics: payload.diagnostics },
    );
  }

  const snapshot: AssetPackArchiveSnapshot = {
    archivePath: options.archivePath,
    archiveBytes: Buffer.from(archiveBytes),
    archiveDigest: digest(archiveBytes),
    manifestBytes: Buffer.from(manifestBytes),
    checksumsBytes: Buffer.from(checksumsBytes),
    checksums: checksums.value.map((checksum) => ({ ...checksum })),
    payload,
  };
  verifiedExtractionFiles.set(snapshot, new Map<string, Buffer>([
    ['asset-pack.json', Buffer.from(payload.manifestBytes)],
    ...[...payload.sourceBytes].map(
      ([entryPath, contents]) => [entryPath, Buffer.from(contents)] as const,
    ),
  ]));
  return { ok: true, snapshot };
}

function checksumsBytesFor(files: ReadonlyMap<string, Buffer>): Buffer {
  const checksums = [...files]
    .sort(([left], [right]) => comparePaths(left, right))
    .map(([entryPath, contents]) => ({
      path: entryPath,
      size: contents.byteLength,
      sha256: digest(contents),
    }));
  return Buffer.from(`${JSON.stringify({
    schema: ASSET_PACK_CHECKSUMS_SCHEMA,
    files: checksums,
  }, null, 2)}\n`);
}

export async function createDeterministicAssetPackArchive(options: {
  readonly manifestBytes: Buffer;
  readonly sourceBytes: ReadonlyMap<string, Buffer>;
}): Promise<Buffer> {
  const payload = parseAssetPackPayload({
    manifestBytes: Buffer.from(options.manifestBytes),
    sourceBytes: new Map(
      [...options.sourceBytes].map(
        ([entryPath, contents]) => [entryPath, Buffer.from(contents)] as const,
      ),
    ),
  });
  if (!payload.ok) {
    throw new Error(`Cannot archive an invalid asset-pack payload: ${JSON.stringify(payload.diagnostics)}`);
  }
  const payloadFiles = new Map<string, Buffer>([
    ['asset-pack.json', Buffer.from(payload.manifestBytes)],
    ...[...payload.sourceBytes].map(
      ([entryPath, contents]) => [entryPath, Buffer.from(contents)] as const,
    ),
  ]);
  const archiveFiles = new Map<string, Buffer>(payloadFiles);
  archiveFiles.set('checksums.json', checksumsBytesFor(payloadFiles));
  const archiveFilesStatus = validateArchiveFiles(archiveFiles);
  if (!archiveFilesStatus.ok) {
    throw new Error(`Cannot archive unsafe asset-pack files: ${JSON.stringify(archiveFilesStatus.diagnostics)}`);
  }

  const zip = new JSZip();
  for (const [entryPath, contents] of [...archiveFiles].sort(
    ([left], [right]) => comparePaths(left, right),
  )) {
    zip.file(entryPath, contents, {
      binary: true,
      date: new Date(Date.UTC(1980, 0, 1, 0, 0, 0)),
      createFolders: false,
      unixPermissions: 0o100644,
    });
  }
  const archive = await zip.generateAsync({
    type: 'nodebuffer',
    platform: 'UNIX',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    streamFiles: false,
  });
  const readBack = readAssetPackArchive({
    archivePath: '<generated asset-pack archive>',
    archiveBytes: archive,
  });
  if (!readBack.ok) {
    throw new Error(`Generated asset-pack archive failed validation: ${JSON.stringify(readBack.diagnostics)}`);
  }
  return archive;
}

function assertSafeExtractionParent(targetDirectory: string): string {
  const requestedTarget = path.resolve(targetDirectory);
  const parent = path.dirname(requestedTarget);
  const root = path.parse(parent).root;
  let current = root;
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
  }
  assertPrivateStagingRoot(current);
  const canonicalParent = realpathSync(current);
  const resolvedTarget = path.join(canonicalParent, path.basename(requestedTarget));
  if (lstatSync(resolvedTarget, { throwIfNoEntry: false }) !== undefined) {
    throw new Error(`Extraction target already exists: ${resolvedTarget}`);
  }
  return resolvedTarget;
}

function assertPrivateStagingRoot(directory: string): void {
  const status = lstatSync(directory, { throwIfNoEntry: false });
  if (!status || status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(`Extraction parent is not a private staging root: ${directory}`);
  }
  if ((status.mode & 0o077) !== 0) {
    throw new Error(`Extraction parent is writable or accessible outside the private staging root: ${directory}`);
  }
}

function assertPinnedExtractionDirectory(directory: string): void {
  const status = lstatSync(directory, { throwIfNoEntry: false });
  if (!status || status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(`Extraction directory is not a pinned directory: ${directory}`);
  }
  if (realpathSync(directory) !== directory) {
    throw new Error(`Extraction directory resolves through an alias: ${directory}`);
  }
}

function cleanupPinnedExtractionDirectory(directory: string): void {
  const status = lstatSync(directory, { throwIfNoEntry: false });
  if (!status || status.isSymbolicLink() || !status.isDirectory()) return;
  if (realpathSync(directory) !== directory) return;
  rmSync(directory, { recursive: true, force: true });
}

function writeNewFileNoFollow(filePath: string, contents: Buffer): void {
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
}

export function extractVerifiedAssetPackPayload(options: {
  readonly snapshot: AssetPackArchiveSnapshot;
  readonly targetDirectory: string;
}): void {
  const verifiedFiles = verifiedExtractionFiles.get(options.snapshot);
  if (!verifiedFiles) throw new Error('Extraction requires a verified archive snapshot.');
  const targetDirectory = assertSafeExtractionParent(options.targetDirectory);
  mkdirSync(targetDirectory, { mode: 0o700 });
  try {
    assertPinnedExtractionDirectory(targetDirectory);
    const createdDirectories = new Set<string>([targetDirectory]);
    for (const [entryPath, contents] of [...verifiedFiles].sort(
      ([left], [right]) => comparePaths(left, right),
    )) {
      assertPinnedExtractionDirectory(targetDirectory);
      const segments = entryPath.split('/');
      let directory = targetDirectory;
      for (const segment of segments.slice(0, -1)) {
        directory = path.join(directory, segment);
        if (!createdDirectories.has(directory)) {
          mkdirSync(directory, { mode: 0o700 });
          createdDirectories.add(directory);
        }
        assertPinnedExtractionDirectory(directory);
      }
      const fileName = segments.at(-1);
      if (!fileName) throw new Error(`Invalid verified archive path: ${entryPath}`);
      assertPinnedExtractionDirectory(directory);
      writeNewFileNoFollow(path.join(directory, fileName), Buffer.from(contents));
    }
  } catch (error) {
    cleanupPinnedExtractionDirectory(targetDirectory);
    throw error;
  }
}
