import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { ASSET_PACK_SCHEMA, type AssetPackSource } from '@lpc-toolkit/core';
import {
  ASSET_PACK_ARCHIVE_LIMITS,
  ASSET_PACK_CHECKSUMS_SCHEMA,
  createDeterministicAssetPackArchive,
  extractVerifiedAssetPackPayload,
  readAssetPackArchive,
  type AssetPackArchiveDiagnostic,
  type AssetPackArchiveReadResult,
} from '../src/asset-pack-archive-format.js';

const UTF8_FLAG = 0x0800;
const SOURCE_PATH = 'sprites/wind-braid/foreground/walk.png';
const SECOND_SOURCE_PATH = 'sprites/wind-braid/foreground/slash.png';
const UNIX_REGULAR_ATTRIBUTES = (0o100644 * 0x1_0000) >>> 0;
const temporaryDirectories: string[] = [];

interface RawZipEntry {
  readonly name: string | Buffer;
  readonly data?: Buffer;
  readonly compressedData?: Buffer;
  readonly flags?: number;
  readonly localFlags?: number;
  readonly method?: number;
  readonly localMethod?: number;
  readonly crc32?: number;
  readonly localCrc32?: number;
  readonly compressedSize?: number;
  readonly localCompressedSize?: number;
  readonly uncompressedSize?: number;
  readonly localUncompressedSize?: number;
  readonly localName?: string | Buffer;
  readonly localExtra?: Buffer;
  readonly centralExtra?: Buffer;
  readonly creatorPlatform?: number;
  readonly externalAttributes?: number;
  readonly centralLocalOffset?: number;
}

interface RawZipOptions {
  readonly eocdEntryCount?: number;
  readonly eocdCentralSize?: number;
  readonly eocdCentralOffset?: number;
}

interface PreparedRawZipEntry {
  readonly name: Buffer;
  readonly localName: Buffer;
  readonly data: Buffer;
  readonly compressedData: Buffer;
  readonly flags: number;
  readonly localFlags: number;
  readonly method: number;
  readonly localMethod: number;
  readonly crc32: number;
  readonly localCrc32: number;
  readonly compressedSize: number;
  readonly localCompressedSize: number;
  readonly uncompressedSize: number;
  readonly localUncompressedSize: number;
  readonly localExtra: Buffer;
  readonly centralExtra: Buffer;
  readonly creatorPlatform: number;
  readonly externalAttributes: number;
  readonly centralLocalOffset?: number;
  actualLocalOffset: number;
}

interface CentralEntryInspection {
  readonly path: string;
  readonly creatorPlatform: number;
  readonly flags: number;
  readonly method: number;
  readonly dosTime: number;
  readonly dosDate: number;
  readonly externalAttributes: number;
}

function crc32(bytes: Buffer): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 0 ? 0 : 0xedb8_8320);
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function nameBytes(name: string | Buffer): Buffer {
  return typeof name === 'string' ? Buffer.from(name, 'utf8') : Buffer.from(name);
}

function prepareRawEntry(entry: RawZipEntry): PreparedRawZipEntry {
  const data = Buffer.from(entry.data ?? Buffer.alloc(0));
  const method = entry.method ?? 8;
  const compressedData = Buffer.from(
    entry.compressedData ?? (method === 8 ? deflateRawSync(data) : data),
  );
  const checksum = entry.crc32 ?? crc32(data);
  const flags = entry.flags ?? UTF8_FLAG;
  const compressedSize = entry.compressedSize ?? compressedData.byteLength;
  const uncompressedSize = entry.uncompressedSize ?? data.byteLength;
  return {
    name: nameBytes(entry.name),
    localName: nameBytes(entry.localName ?? entry.name),
    data,
    compressedData,
    flags,
    localFlags: entry.localFlags ?? flags,
    method,
    localMethod: entry.localMethod ?? method,
    crc32: checksum,
    localCrc32: entry.localCrc32 ?? checksum,
    compressedSize,
    localCompressedSize: entry.localCompressedSize ?? compressedSize,
    uncompressedSize,
    localUncompressedSize: entry.localUncompressedSize ?? uncompressedSize,
    localExtra: Buffer.from(entry.localExtra ?? Buffer.alloc(0)),
    centralExtra: Buffer.from(entry.centralExtra ?? Buffer.alloc(0)),
    creatorPlatform: entry.creatorPlatform ?? 3,
    externalAttributes: entry.externalAttributes ?? UNIX_REGULAR_ATTRIBUTES,
    ...(entry.centralLocalOffset === undefined
      ? {}
      : { centralLocalOffset: entry.centralLocalOffset }),
    actualLocalOffset: 0,
  };
}

function localRecord(entry: PreparedRawZipEntry): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x0403_4b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(entry.localFlags, 6);
  header.writeUInt16LE(entry.localMethod, 8);
  header.writeUInt32LE(entry.localCrc32, 14);
  header.writeUInt32LE(entry.localCompressedSize, 18);
  header.writeUInt32LE(entry.localUncompressedSize, 22);
  header.writeUInt16LE(entry.localName.byteLength, 26);
  header.writeUInt16LE(entry.localExtra.byteLength, 28);
  return Buffer.concat([header, entry.localName, entry.localExtra, entry.compressedData]);
}

function buildRawZip(entries: readonly RawZipEntry[], options: RawZipOptions = {}): Buffer {
  const prepared = entries.map(prepareRawEntry);
  const localRecords: Buffer[] = [];
  let localOffset = 0;
  for (const entry of prepared) {
    entry.actualLocalOffset = localOffset;
    const record = localRecord(entry);
    localRecords.push(record);
    localOffset += record.byteLength;
  }

  const centralOffset = localOffset;
  const centralRecords = prepared.map((entry) => {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x0201_4b50, 0);
    header.writeUInt16LE((entry.creatorPlatform << 8) | 20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(entry.flags, 8);
    header.writeUInt16LE(entry.method, 10);
    header.writeUInt32LE(entry.crc32, 16);
    header.writeUInt32LE(entry.compressedSize, 20);
    header.writeUInt32LE(entry.uncompressedSize, 24);
    header.writeUInt16LE(entry.name.byteLength, 28);
    header.writeUInt16LE(entry.centralExtra.byteLength, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(entry.externalAttributes, 38);
    header.writeUInt32LE(entry.centralLocalOffset ?? entry.actualLocalOffset, 42);
    return Buffer.concat([header, entry.name, entry.centralExtra]);
  });
  const centralDirectory = Buffer.concat(centralRecords);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x0605_4b50, 0);
  eocd.writeUInt16LE(options.eocdEntryCount ?? prepared.length, 8);
  eocd.writeUInt16LE(options.eocdEntryCount ?? prepared.length, 10);
  eocd.writeUInt32LE(options.eocdCentralSize ?? centralDirectory.byteLength, 12);
  eocd.writeUInt32LE(options.eocdCentralOffset ?? centralOffset, 16);
  return Buffer.concat([...localRecords, centralDirectory, eocd]);
}

function packFixture(): AssetPackSource {
  return {
    schema: ASSET_PACK_SCHEMA,
    id: 'acme.wind-braid',
    version: '1.0.0',
    displayName: 'ACME Wind Braid',
    credits: {
      authors: ['Alice'],
      licenses: ['CC-BY-SA 4.0'],
      urls: ['https://example.com/alice'],
      notes: 'Original wind braid.',
    },
    assets: [{
      kind: 'new-item',
      localId: 'wind-braid',
      displayName: 'Wind Braid',
      typeName: 'hair',
      bodyTypes: ['male', 'female'],
      animations: ['walk'],
      layers: [{
        id: 'foreground',
        zPos: 120,
        sprites: [{ animation: 'walk', source: SOURCE_PATH }],
      }],
    }],
  };
}

function manifestBytesOfLength(byteLength?: number): Buffer {
  const json = Buffer.from(`${JSON.stringify(packFixture(), null, 2)}\n`);
  if (byteLength === undefined) return json;
  if (json.byteLength > byteLength) throw new Error('Manifest fixture exceeds requested length.');
  return Buffer.concat([json, Buffer.alloc(byteLength - json.byteLength, 0x20)]);
}

function manifestBytesWithSources(sourcePaths: readonly string[]): Buffer {
  const source = packFixture();
  const asset = source.assets[0];
  if (!asset || asset.kind !== 'new-item') throw new Error('Expected a new-item fixture.');
  const layer = asset.layers[0];
  if (!layer) throw new Error('Expected a layer fixture.');
  return Buffer.from(`${JSON.stringify({
    ...source,
    assets: [{
      ...asset,
      layers: [{
        ...layer,
        sprites: sourcePaths.map((sourcePath) => ({ animation: 'walk', source: sourcePath })),
      }],
    }],
  }, null, 2)}\n`);
}

function checksumBytes(files: ReadonlyMap<string, Buffer>): Buffer {
  const rows = [...files]
    .map(([filePath, bytes]) => ({ path: filePath, size: bytes.byteLength, sha256: sha256(bytes) }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return Buffer.from(`${JSON.stringify({ schema: ASSET_PACK_CHECKSUMS_SCHEMA, files: rows }, null, 2)}\n`);
}

function archiveFixture(options: {
  readonly manifestBytes?: Buffer;
  readonly sourceBytes?: ReadonlyMap<string, Buffer>;
  readonly checksumsBytes?: Buffer;
  readonly entryOverrides?: ReadonlyMap<string, Partial<RawZipEntry>>;
} = {}): Buffer {
  const manifestBytes = options.manifestBytes ?? manifestBytesOfLength();
  const sourceBytes = options.sourceBytes ?? new Map([[SOURCE_PATH, Buffer.from('walk-pixels')]]);
  const payloadFiles = new Map<string, Buffer>([['asset-pack.json', manifestBytes], ...sourceBytes]);
  const checksumsBytes = options.checksumsBytes ?? checksumBytes(payloadFiles);
  const files = new Map<string, Buffer>([
    ['asset-pack.json', manifestBytes],
    ['checksums.json', checksumsBytes],
    ...sourceBytes,
  ]);
  return buildRawZip([...files].map(([filePath, data]) => ({
    name: filePath,
    data,
    ...options.entryOverrides?.get(filePath),
  })));
}

function expectFailure(
  archiveBytes: Buffer,
  code: AssetPackArchiveDiagnostic['code'],
): Extract<AssetPackArchiveReadResult, { readonly ok: false }> {
  const result = readAssetPackArchive({ archivePath: '/fixtures/pack.lpc-assets.zip', archiveBytes });
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Expected archive reading to fail.');
  expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
  return result;
}

function inspectCentralEntries(archive: Buffer): readonly CentralEntryInspection[] {
  const eocdOffset = archive.byteLength - 22;
  expect(archive.readUInt32LE(eocdOffset)).toBe(0x0605_4b50);
  const count = archive.readUInt16LE(eocdOffset + 10);
  let offset = archive.readUInt32LE(eocdOffset + 16);
  const entries: CentralEntryInspection[] = [];
  for (let index = 0; index < count; index += 1) {
    expect(archive.readUInt32LE(offset)).toBe(0x0201_4b50);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    entries.push({
      path: archive.toString('utf8', offset + 46, offset + 46 + nameLength),
      creatorPlatform: archive.readUInt16LE(offset + 4) >>> 8,
      flags: archive.readUInt16LE(offset + 8),
      method: archive.readUInt16LE(offset + 10),
      dosTime: archive.readUInt16LE(offset + 12),
      dosDate: archive.readUInt16LE(offset + 14),
      externalAttributes: archive.readUInt32LE(offset + 38),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function createDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(realpathSync(os.tmpdir()), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('readAssetPackArchive path and central-directory safety', () => {
  it.each([
    ['absolute POSIX', '/sprites/a.png'],
    ['Windows drive', 'C:/sprites/a.png'],
    ['UNC', '//server/share/a.png'],
    ['backslash', 'sprites\\a.png'],
    ['Windows ADS', 'sprites/a:alternate-stream.png'],
    ['Windows reserved device', 'sprites/aux.png'],
    ['Windows forbidden character', 'sprites/a?.png'],
    ['Windows trailing dot', 'sprites/a.png.'],
    ['Windows trailing space', 'sprites/a.png '],
    ['empty segment', 'sprites//a.png'],
    ['dot segment', 'sprites/./a.png'],
    ['parent segment', 'sprites/../a.png'],
    ['directory suffix', 'sprites/a/'],
  ])('rejects %s paths', (_label, unsafePath) => {
    expectFailure(buildRawZip([{ name: unsafePath, data: Buffer.alloc(0) }]), 'asset_archive_unsafe');
  });

  it('rejects NUL names', () => {
    expectFailure(buildRawZip([{
      name: Buffer.from('sprites/a\0.png'),
      data: Buffer.alloc(0),
    }]), 'asset_archive_unsafe');
  });

  it('rejects exact duplicates, ASCII-case collisions, and Unicode NFC collisions', () => {
    const exact = buildRawZip([
      { name: 'sprites/a.png', data: Buffer.from('a') },
      { name: 'sprites/a.png', data: Buffer.from('b') },
    ]);
    const asciiCase = buildRawZip([
      { name: 'sprites/A.png', data: Buffer.from('a') },
      { name: 'sprites/a.png', data: Buffer.from('b') },
    ]);
    const unicode = buildRawZip([
      { name: 'sprites/caf\u00e9.png', data: Buffer.from('a') },
      { name: 'sprites/cafe\u0301.png', data: Buffer.from('b') },
    ]);

    expectFailure(exact, 'asset_archive_unsafe');
    expectFailure(asciiCase, 'asset_archive_unsafe');
    expectFailure(unicode, 'asset_archive_unsafe');
  });

  it.each([
    ['directory mode', 0o040755],
    ['symlink mode', 0o120777],
    ['FIFO mode', 0o010644],
    ['socket mode', 0o140644],
  ])('rejects UNIX %s entries', (_label, unixMode) => {
    expectFailure(buildRawZip([{
      name: 'sprites/a.png',
      data: Buffer.alloc(0),
      externalAttributes: (unixMode * 0x1_0000) >>> 0,
    }]), 'asset_archive_unsafe');
  });

  it('rejects DOS directory entries', () => {
    expectFailure(buildRawZip([{
      name: 'sprites/a.png',
      data: Buffer.alloc(0),
      creatorPlatform: 0,
      externalAttributes: 0x10,
    }]), 'asset_archive_unsafe');
  });

  it.each([
    ['traditional encryption', 0x0001],
    ['strong encryption', 0x0040],
  ])('rejects %s flags', (_label, flag) => {
    expectFailure(buildRawZip([{
      name: 'sprites/a.png',
      data: Buffer.from('a'),
      flags: UTF8_FLAG | flag,
      localFlags: UTF8_FLAG | flag,
    }]), 'asset_archive_unsafe');
  });

  it('rejects unsupported compression methods and data descriptors', () => {
    expectFailure(buildRawZip([{
      name: 'sprites/a.png',
      data: Buffer.from('a'),
      method: 12,
      localMethod: 12,
      compressedData: Buffer.from('a'),
    }]), 'asset_archive_unsafe');
    expectFailure(buildRawZip([{
      name: 'sprites/a.png',
      data: Buffer.from('a'),
      flags: UTF8_FLAG | 0x0008,
      localFlags: UTF8_FLAG | 0x0008,
    }]), 'asset_archive_unsafe');
  });

  it('rejects DEFLATE-specific flags on stored entries', () => {
    expectFailure(buildRawZip([{
      name: 'sprites/a.png',
      data: Buffer.from('a'),
      method: 0,
      localMethod: 0,
      flags: UTF8_FLAG | 0x0002,
      localFlags: UTF8_FLAG | 0x0002,
    }]), 'asset_archive_unsafe');
  });

  it('rejects invalid UTF-8 when flagged and non-printable or non-ASCII legacy names', () => {
    expectFailure(buildRawZip([{
      name: Buffer.from([0x73, 0x70, 0x72, 0x69, 0x74, 0x65, 0x73, 0x2f, 0xc3, 0x28]),
      data: Buffer.alloc(0),
      flags: UTF8_FLAG,
      localFlags: UTF8_FLAG,
    }]), 'asset_archive_unsafe');
    expectFailure(buildRawZip([{
      name: Buffer.from([0x73, 0x70, 0x72, 0x69, 0x74, 0x65, 0x73, 0x2f, 0x80]),
      data: Buffer.alloc(0),
      flags: 0,
      localFlags: 0,
    }]), 'asset_archive_unsafe');
    expectFailure(buildRawZip([{
      name: Buffer.from('sprites/a\u001f.png'),
      data: Buffer.alloc(0),
      flags: 0,
      localFlags: 0,
    }]), 'asset_archive_unsafe');
  });

  it('rejects central/local filename and metadata mismatches', () => {
    const cases: RawZipEntry[] = [
      { name: 'sprites/a.png', localName: 'sprites/b.png', data: Buffer.from('a') },
      { name: 'sprites/a.png', data: Buffer.from('a'), localFlags: 0 },
      { name: 'sprites/a.png', data: Buffer.from('a'), localMethod: 0 },
      { name: 'sprites/a.png', data: Buffer.from('a'), localCrc32: 0 },
      { name: 'sprites/a.png', data: Buffer.from('a'), localCompressedSize: 1 },
      { name: 'sprites/a.png', data: Buffer.from('a'), localUncompressedSize: 2 },
    ];
    for (const entry of cases) {
      expectFailure(buildRawZip([entry]), 'asset_archive_invalid');
    }
  });

  it('rejects invalid central/local offsets and lengths', () => {
    expectFailure(buildRawZip([{
      name: 'sprites/a.png',
      data: Buffer.alloc(0),
      centralLocalOffset: 0xffff_ff00,
    }]), 'asset_archive_invalid');
    expectFailure(buildRawZip([{
      name: 'sprites/a.png',
      compressedData: Buffer.alloc(0),
      compressedSize: 16,
      localCompressedSize: 16,
      uncompressedSize: 16,
      localUncompressedSize: 16,
    }]), 'asset_archive_invalid');
    expectFailure(buildRawZip([{ name: 'sprites/a.png', data: Buffer.alloc(0) }], {
      eocdCentralSize: 1,
    }), 'asset_archive_invalid');
    expectFailure(buildRawZip([{ name: 'sprites/a.png', data: Buffer.alloc(0) }], {
      eocdCentralOffset: 1,
    }), 'asset_archive_invalid');
  });

  it('rejects overlapping local entry data ranges', () => {
    const embedded = prepareRawEntry({ name: 'sprites/b.png', data: Buffer.from('b'), method: 0 });
    const embeddedRecord = localRecord(embedded);
    const firstNameLength = Buffer.byteLength('sprites/a.png');
    const embeddedOffset = 30 + firstNameLength;
    const archive = buildRawZip([
      { name: 'sprites/a.png', data: embeddedRecord, method: 0 },
      {
        name: 'sprites/b.png',
        data: Buffer.from('b'),
        method: 0,
        centralLocalOffset: embeddedOffset,
      },
    ]);
    expectFailure(archive, 'asset_archive_invalid');
  });

  it('rejects ZIP64 EOCD and entry markers', () => {
    expectFailure(buildRawZip([{ name: 'sprites/a.png', data: Buffer.alloc(0) }], {
      eocdEntryCount: 0xffff,
    }), 'asset_archive_unsafe');
    expectFailure(buildRawZip([{
      name: 'sprites/a.png',
      compressedData: Buffer.alloc(0),
      compressedSize: 0xffff_ffff,
      localCompressedSize: 0xffff_ffff,
      uncompressedSize: 0xffff_ffff,
      localUncompressedSize: 0xffff_ffff,
    }]), 'asset_archive_unsafe');
    expectFailure(buildRawZip([{
      name: 'sprites/a.png',
      data: Buffer.alloc(0),
      centralExtra: Buffer.from([0x01, 0x00, 0x00, 0x00]),
    }]), 'asset_archive_unsafe');
  });

  it('rejects more than 4,096 entries before reading payload data', () => {
    const entries = Array.from({ length: ASSET_PACK_ARCHIVE_LIMITS.entries + 1 }, (_, index) => ({
      name: `sprites/file-${String(index).padStart(4, '0')}.png`,
      compressedData: Buffer.alloc(0),
      uncompressedSize: 1,
      localUncompressedSize: 1,
    }));
    const result = expectFailure(buildRawZip(entries), 'asset_archive_limit_exceeded');
    expect(result.diagnostics.every((diagnostic) => diagnostic.code === 'asset_archive_limit_exceeded'))
      .toBe(true);
  });
});

describe('readAssetPackArchive bounds and checksums', () => {
  it('accepts an exact 1 MiB manifest and rejects 1 MiB + 1 before inflation', () => {
    const exactManifest = manifestBytesOfLength(ASSET_PACK_ARCHIVE_LIMITS.manifestBytes);
    const accepted = readAssetPackArchive({
      archivePath: '/fixtures/exact-manifest.lpc-assets.zip',
      archiveBytes: archiveFixture({ manifestBytes: exactManifest }),
    });
    expect(accepted.ok).toBe(true);

    const tooLarge = buildRawZip([{
      name: 'asset-pack.json',
      compressedData: Buffer.from('not-deflate-data'),
      compressedSize: 16,
      localCompressedSize: 16,
      uncompressedSize: ASSET_PACK_ARCHIVE_LIMITS.manifestBytes + 1,
      localUncompressedSize: ASSET_PACK_ARCHIVE_LIMITS.manifestBytes + 1,
    }]);
    const rejected = expectFailure(tooLarge, 'asset_archive_limit_exceeded');
    expect(rejected.diagnostics.every((diagnostic) => diagnostic.code === 'asset_archive_limit_exceeded'))
      .toBe(true);
  });

  it('accepts an exact 64 MiB entry and rejects 64 MiB + 1 before inflation', { timeout: 30_000 }, () => {
    const exactBytes = Buffer.alloc(ASSET_PACK_ARCHIVE_LIMITS.entryBytes);
    const accepted = readAssetPackArchive({
      archivePath: '/fixtures/exact-entry.lpc-assets.zip',
      archiveBytes: archiveFixture({ sourceBytes: new Map([[SOURCE_PATH, exactBytes]]) }),
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) throw new Error('Expected exact entry bound to succeed.');
    expect(accepted.snapshot.payload.sourceBytes.get(SOURCE_PATH)?.byteLength)
      .toBe(ASSET_PACK_ARCHIVE_LIMITS.entryBytes);

    const tooLarge = buildRawZip([{
      name: 'sprites/too-large.png',
      compressedData: Buffer.from('not-deflate-data'),
      compressedSize: 16,
      localCompressedSize: 16,
      uncompressedSize: ASSET_PACK_ARCHIVE_LIMITS.entryBytes + 1,
      localUncompressedSize: ASSET_PACK_ARCHIVE_LIMITS.entryBytes + 1,
    }]);
    const rejected = expectFailure(tooLarge, 'asset_archive_limit_exceeded');
    expect(rejected.diagnostics.every((diagnostic) => diagnostic.code === 'asset_archive_limit_exceeded'))
      .toBe(true);
  });

  it('rejects a declared total of 512 MiB + 1 before inflation', () => {
    const entries: RawZipEntry[] = Array.from({ length: 8 }, (_, index) => ({
      name: `sprites/large-${String(index)}.png`,
      compressedData: Buffer.alloc(0),
      uncompressedSize: ASSET_PACK_ARCHIVE_LIMITS.entryBytes,
      localUncompressedSize: ASSET_PACK_ARCHIVE_LIMITS.entryBytes,
    }));
    entries.push({
      name: 'sprites/final-byte.png',
      compressedData: Buffer.alloc(0),
      uncompressedSize: 1,
      localUncompressedSize: 1,
    });
    const result = expectFailure(buildRawZip(entries), 'asset_archive_limit_exceeded');
    expect(result.diagnostics.every((diagnostic) => diagnostic.code === 'asset_archive_limit_exceeded'))
      .toBe(true);
  });

  it('rejects inflater output that exceeds the declared length', () => {
    const actual = Buffer.from('too long');
    expectFailure(buildRawZip([{
      name: 'asset-pack.json',
      compressedData: deflateRawSync(actual),
      crc32: crc32(actual),
      localCrc32: crc32(actual),
      uncompressedSize: 1,
      localUncompressedSize: 1,
    }]), 'asset_archive_invalid');
  });

  it('rejects oversized encoded entries before inflation and DEFLATE trailing bytes', () => {
    const encodedTooLarge = buildRawZip([{
      name: 'sprites/encoded-too-large.png',
      compressedData: Buffer.alloc(0),
      compressedSize: ASSET_PACK_ARCHIVE_LIMITS.entryBytes + 1,
      localCompressedSize: ASSET_PACK_ARCHIVE_LIMITS.entryBytes + 1,
      uncompressedSize: 0,
      localUncompressedSize: 0,
    }]);
    expectFailure(encodedTooLarge, 'asset_archive_limit_exceeded');

    const data = Buffer.from('verified bytes');
    expectFailure(buildRawZip([{
      name: 'sprites/trailing-deflate.png',
      data,
      compressedData: Buffer.concat([deflateRawSync(data), Buffer.from([0xde, 0xad])]),
    }]), 'asset_archive_invalid');
  });

  it.each([
    ['invalid JSON', Buffer.from('{')],
    ['wrong schema', Buffer.from(JSON.stringify({ schema: 'wrong', files: [] }))],
    ['unknown document field', Buffer.from(JSON.stringify({
      schema: ASSET_PACK_CHECKSUMS_SCHEMA,
      files: [],
      extra: true,
    }))],
    ['unknown row field', Buffer.from(JSON.stringify({
      schema: ASSET_PACK_CHECKSUMS_SCHEMA,
      files: [{ path: 'asset-pack.json', size: 1, sha256: `sha256:${'0'.repeat(64)}`, extra: true }],
    }))],
    ['invalid digest spelling', Buffer.from(JSON.stringify({
      schema: ASSET_PACK_CHECKSUMS_SCHEMA,
      files: [{ path: 'asset-pack.json', size: 1, sha256: `sha256:${'A'.repeat(64)}` }],
    }))],
  ])('rejects checksum %s', (_label, invalidChecksums) => {
    expectFailure(archiveFixture({ checksumsBytes: invalidChecksums }), 'asset_checksum_invalid');
  });

  it('rejects checksum rows that are not strictly path-sorted', () => {
    const manifest = manifestBytesOfLength();
    const sprite = Buffer.from('walk-pixels');
    const checksums = Buffer.from(JSON.stringify({
      schema: ASSET_PACK_CHECKSUMS_SCHEMA,
      files: [
        { path: SOURCE_PATH, size: sprite.byteLength, sha256: sha256(sprite) },
        { path: 'asset-pack.json', size: manifest.byteLength, sha256: sha256(manifest) },
      ],
    }));
    expectFailure(archiveFixture({ manifestBytes: manifest, checksumsBytes: checksums }), 'asset_checksum_invalid');
  });

  it('rejects missing and extra checksum rows', () => {
    const manifest = manifestBytesOfLength();
    const missing = checksumBytes(new Map([['asset-pack.json', manifest]]));
    expectFailure(archiveFixture({ manifestBytes: manifest, checksumsBytes: missing }), 'asset_checksum_invalid');

    const files = new Map<string, Buffer>([
      ['asset-pack.json', manifest],
      [SOURCE_PATH, Buffer.from('walk-pixels')],
      ['sprites/extra.png', Buffer.from('extra')],
    ]);
    expectFailure(archiveFixture({ manifestBytes: manifest, checksumsBytes: checksumBytes(files) }), 'asset_checksum_invalid');
  });

  it('rejects checksum size and digest mismatches', () => {
    const manifest = manifestBytesOfLength();
    const sprite = Buffer.from('walk-pixels');
    const manifestRow = {
      path: 'asset-pack.json',
      size: manifest.byteLength,
      sha256: sha256(manifest),
    };
    const spriteRow = {
      path: SOURCE_PATH,
      size: sprite.byteLength,
      sha256: sha256(sprite),
    };
    const bytes = (rows: readonly { readonly path: string; readonly size: number; readonly sha256: string }[]) =>
      Buffer.from(JSON.stringify({ schema: ASSET_PACK_CHECKSUMS_SCHEMA, files: rows }));
    expectFailure(archiveFixture({
      manifestBytes: manifest,
      checksumsBytes: bytes([{ ...manifestRow, size: manifest.byteLength + 1 }, spriteRow]),
    }), 'asset_digest_mismatch');
    expectFailure(archiveFixture({
      manifestBytes: manifest,
      checksumsBytes: bytes([manifestRow, { ...spriteRow, sha256: `sha256:${'0'.repeat(64)}` }]),
    }), 'asset_digest_mismatch');
  });

  it('rejects unexpected roots and a checksum attempting to cover itself', () => {
    expectFailure(buildRawZip([{ name: 'other/file.png', data: Buffer.from('x') }]), 'asset_archive_unsafe');

    const manifest = manifestBytesOfLength();
    const sprite = Buffer.from('walk-pixels');
    const checksums = Buffer.from(JSON.stringify({
      schema: ASSET_PACK_CHECKSUMS_SCHEMA,
      files: [
        { path: 'asset-pack.json', size: manifest.byteLength, sha256: sha256(manifest) },
        { path: 'checksums.json', size: 0, sha256: `sha256:${'0'.repeat(64)}` },
        { path: SOURCE_PATH, size: sprite.byteLength, sha256: sha256(sprite) },
      ],
    }));
    expectFailure(archiveFixture({ manifestBytes: manifest, checksumsBytes: checksums }), 'asset_checksum_invalid');
  });

  it('rejects a checksummed but unreferenced sprite', () => {
    const manifest = manifestBytesOfLength();
    const sourceBytes = new Map([
      [SOURCE_PATH, Buffer.from('walk-pixels')],
      ['sprites/unreferenced.png', Buffer.from('extra')],
    ]);
    const payloadFiles = new Map<string, Buffer>([['asset-pack.json', manifest], ...sourceBytes]);
    expectFailure(archiveFixture({
      manifestBytes: manifest,
      sourceBytes,
      checksumsBytes: checksumBytes(payloadFiles),
    }), 'asset_archive_invalid');
  });

  it('rejects missing manifest and missing checksums entries', () => {
    const sprite = Buffer.from('walk-pixels');
    expectFailure(buildRawZip([
      { name: 'checksums.json', data: checksumBytes(new Map([[SOURCE_PATH, sprite]])) },
      { name: SOURCE_PATH, data: sprite },
    ]), 'asset_archive_invalid');
    expectFailure(buildRawZip([
      { name: 'asset-pack.json', data: manifestBytesOfLength() },
      { name: SOURCE_PATH, data: sprite },
    ]), 'asset_archive_invalid');
  });
});

describe('createDeterministicAssetPackArchive', () => {
  it('enforces archive safety limits before creating ZIP entries', async () => {
    await expect(createDeterministicAssetPackArchive({
      manifestBytes: manifestBytesOfLength(ASSET_PACK_ARCHIVE_LIMITS.manifestBytes + 1),
      sourceBytes: new Map([[SOURCE_PATH, Buffer.from('walk-pixels')]]),
    })).rejects.toThrow(/manifest|limit/i);

    await expect(createDeterministicAssetPackArchive({
      manifestBytes: manifestBytesWithSources(['sprites/aux.png']),
      sourceBytes: new Map([['sprites/aux.png', Buffer.from('walk-pixels')]]),
    })).rejects.toThrow(/unsafe|path/i);
  });

  it('writes byte-identical sorted UNIX archives across map order and process timezone', async () => {
    const manifest = manifestBytesWithSources([SOURCE_PATH, SECOND_SOURCE_PATH]);
    const firstSources = new Map<string, Buffer>([
      [SOURCE_PATH, Buffer.from('walk-pixels')],
      [SECOND_SOURCE_PATH, Buffer.from('slash-pixels')],
    ]);
    const reversedSources = new Map([...firstSources].reverse());
    const originalTimezone = process.env.TZ;
    let first: Buffer;
    let second: Buffer;
    try {
      process.env.TZ = 'UTC';
      first = await createDeterministicAssetPackArchive({ manifestBytes: manifest, sourceBytes: firstSources });
      process.env.TZ = 'Asia/Tokyo';
      second = await createDeterministicAssetPackArchive({ manifestBytes: manifest, sourceBytes: reversedSources });
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }

    expect(second).toEqual(first);
    expect(sha256(second)).toBe(sha256(first));
    const central = inspectCentralEntries(first);
    expect(central.map((entry) => entry.path)).toEqual([
      'asset-pack.json',
      'checksums.json',
      SECOND_SOURCE_PATH,
      SOURCE_PATH,
    ]);
    for (const entry of central) {
      expect(entry.creatorPlatform).toBe(3);
      expect(entry.flags & 0x0009).toBe(0);
      expect(entry.method).toBe(8);
      expect(entry.dosTime).toBe(0);
      expect(entry.dosDate).toBe(0x0021);
      expect(entry.externalAttributes >>> 16).toBe(0o100644);
      expect(entry.path.endsWith('/')).toBe(false);
    }

    const parsed = readAssetPackArchive({ archivePath: '/fixtures/deterministic.zip', archiveBytes: first });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('Expected deterministic archive to read successfully.');
    expect(parsed.snapshot.archiveDigest).toBe(sha256(first));
    expect(parsed.snapshot.checksums.map((entry) => entry.path)).toEqual([
      'asset-pack.json',
      SECOND_SOURCE_PATH,
      SOURCE_PATH,
    ]);
    expect(parsed.snapshot.checksums.some((entry) => entry.path === 'checksums.json')).toBe(false);
  });
});

describe('extractVerifiedAssetPackPayload', () => {
  it('creates a new payload tree with exact verified bytes and mode 0o600', async () => {
    const manifest = manifestBytesOfLength();
    const sprite = Buffer.from('walk-pixels');
    const archive = await createDeterministicAssetPackArchive({
      manifestBytes: manifest,
      sourceBytes: new Map([[SOURCE_PATH, sprite]]),
    });
    const read = readAssetPackArchive({ archivePath: '/fixtures/verified.zip', archiveBytes: archive });
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error('Expected archive to verify.');
    const stagingRoot = createDirectory('lpc-asset-pack-extract-');
    const target = path.join(stagingRoot, 'payload');

    extractVerifiedAssetPackPayload({ snapshot: read.snapshot, targetDirectory: target });

    expect(readFileSync(path.join(target, 'asset-pack.json'))).toEqual(manifest);
    expect(readFileSync(path.join(target, SOURCE_PATH))).toEqual(sprite);
    expect(lstatSync(path.join(target, 'checksums.json'), { throwIfNoEntry: false })).toBeUndefined();
    expect(statSync(path.join(target, 'asset-pack.json')).mode & 0o777).toBe(0o600);
    expect(statSync(path.join(target, SOURCE_PATH)).mode & 0o777).toBe(0o600);
  });

  it('rejects existing targets, symlink parents, and forged snapshots', async () => {
    const archive = await createDeterministicAssetPackArchive({
      manifestBytes: manifestBytesOfLength(),
      sourceBytes: new Map([[SOURCE_PATH, Buffer.from('walk-pixels')]]),
    });
    const read = readAssetPackArchive({ archivePath: '/fixtures/verified.zip', archiveBytes: archive });
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error('Expected archive to verify.');
    const root = createDirectory('lpc-asset-pack-extract-safety-');
    const existing = path.join(root, 'existing');
    mkdirSync(existing);
    expect(() => extractVerifiedAssetPackPayload({
      snapshot: read.snapshot,
      targetDirectory: existing,
    })).toThrow();

    const realParent = path.join(root, 'real-parent');
    const linkedParent = path.join(root, 'linked-parent');
    mkdirSync(realParent);
    mkdirSync(path.join(realParent, 'nested'));
    symlinkSync(realParent, linkedParent, 'dir');
    expect(() => extractVerifiedAssetPackPayload({
      snapshot: read.snapshot,
      targetDirectory: path.join(linkedParent, 'nested', 'payload'),
    })).toThrow(/symlink/iu);

    expect(() => extractVerifiedAssetPackPayload({
      snapshot: { ...read.snapshot },
      targetDirectory: path.join(root, 'forged'),
    })).toThrow(/verified/iu);
  });
});
