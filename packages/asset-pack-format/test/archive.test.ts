import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { ASSET_PACK_SCHEMA, type AssetPackSource } from '@lpc-toolkit/core';
import {
  ASSET_PACK_ARCHIVE_LIMITS,
  ASSET_PACK_CHECKSUMS_SCHEMA,
  createAssetPackArchive,
  inspectAssetPackArchiveBytes,
  type AssetPackArchiveDiagnostic,
  type AssetPackArchiveInspection,
} from '../src/archive.js';
import type { AssetPackFormatRuntime } from '../src/runtime.js';

const UTF8_FLAG = 0x0800;
const SOURCE_PATH = 'sprites/wind-braid/foreground/walk.png';
const SECOND_SOURCE_PATH = 'sprites/wind-braid/foreground/slash.png';
const UNIX_REGULAR_ATTRIBUTES = (0o100644 * 0x1_0000) >>> 0;

function createTestRuntime(options?: {
  readonly onInflate?: () => void;
}): AssetPackFormatRuntime {
  return {
    sha256: async (bytes) =>
      `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    decodeUtf8Fatal: (bytes) =>
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    encodeUtf8: (str) => new TextEncoder().encode(str),
    inflateRawBounded: async ({ compressed, declaredSize, maximumSize }) => {
      options?.onInflate?.();
      const limit = Math.min(declaredSize, maximumSize);
      const output = deflateRawSync
        ? (await import('node:zlib')).inflateRawSync(compressed, {
            maxOutputLength: Math.max(limit, 1),
          })
        : new Uint8Array();
      if (output.byteLength !== declaredSize) {
        throw new Error('Raw DEFLATE output length does not match declaration');
      }
      return new Uint8Array(output);
    },
  };
}

const testRuntime = createTestRuntime();

interface RawZipEntry {
  readonly name: string | Uint8Array;
  readonly data?: Uint8Array;
  readonly compressedData?: Uint8Array;
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
  readonly localName?: string | Uint8Array;
  readonly localExtra?: Uint8Array;
  readonly centralExtra?: Uint8Array;
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
  readonly name: Uint8Array;
  readonly localName: Uint8Array;
  readonly data: Uint8Array;
  readonly compressedData: Uint8Array;
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
  readonly localExtra: Uint8Array;
  readonly centralExtra: Uint8Array;
  readonly creatorPlatform: number;
  readonly externalAttributes: number;
  readonly centralLocalOffset?: number;
  actualLocalOffset: number;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 0 ? 0 : 0xedb8_8320);
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function nameBytes(name: string | Uint8Array): Uint8Array {
  return typeof name === 'string' ? new TextEncoder().encode(name) : name;
}

function prepareRawEntry(entry: RawZipEntry): PreparedRawZipEntry {
  const data = entry.data ?? new Uint8Array(0);
  const method = entry.method ?? 8;
  const compressedData =
    entry.compressedData ??
    (method === 8 ? deflateRawSync(Buffer.from(data)) : data);
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
    localExtra: entry.localExtra ?? new Uint8Array(0),
    centralExtra: entry.centralExtra ?? new Uint8Array(0),
    creatorPlatform: entry.creatorPlatform ?? 3,
    externalAttributes: entry.externalAttributes ?? UNIX_REGULAR_ATTRIBUTES,
    ...(entry.centralLocalOffset === undefined
      ? {}
      : { centralLocalOffset: entry.centralLocalOffset }),
    actualLocalOffset: 0,
  };
}

function concat(arrays: readonly Uint8Array[]): Uint8Array {
  const total = arrays.reduce((acc, a) => acc + a.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.byteLength;
  }
  return result;
}

function localRecord(entry: PreparedRawZipEntry): Uint8Array {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x0403_4b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, entry.localFlags, true);
  view.setUint16(8, entry.localMethod, true);
  view.setUint32(14, entry.localCrc32, true);
  view.setUint32(18, entry.localCompressedSize, true);
  view.setUint32(22, entry.localUncompressedSize, true);
  view.setUint16(26, entry.localName.byteLength, true);
  view.setUint16(28, entry.localExtra.byteLength, true);
  return concat([
    header,
    entry.localName,
    entry.localExtra,
    entry.compressedData,
  ]);
}

function buildRawZip(
  entries: readonly RawZipEntry[],
  options: RawZipOptions = {},
): Uint8Array {
  const prepared = entries.map(prepareRawEntry);
  const localRecords: Uint8Array[] = [];
  let localOffset = 0;
  for (const entry of prepared) {
    entry.actualLocalOffset = localOffset;
    const record = localRecord(entry);
    localRecords.push(record);
    localOffset += record.byteLength;
  }

  const centralOffset = localOffset;
  const centralRecords = prepared.map((entry) => {
    const header = new Uint8Array(46);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x0201_4b50, true);
    view.setUint16(4, (entry.creatorPlatform << 8) | 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, entry.flags, true);
    view.setUint16(10, entry.method, true);
    view.setUint32(16, entry.crc32, true);
    view.setUint32(20, entry.compressedSize, true);
    view.setUint32(24, entry.uncompressedSize, true);
    view.setUint16(28, entry.name.byteLength, true);
    view.setUint16(30, entry.centralExtra.byteLength, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, entry.externalAttributes, true);
    view.setUint32(
      42,
      entry.centralLocalOffset ?? entry.actualLocalOffset,
      true,
    );
    return concat([header, entry.name, entry.centralExtra]);
  });
  const centralDirectory = concat(centralRecords);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x0605_4b50, true);
  eocdView.setUint16(8, options.eocdEntryCount ?? prepared.length, true);
  eocdView.setUint16(10, options.eocdEntryCount ?? prepared.length, true);
  eocdView.setUint32(
    12,
    options.eocdCentralSize ?? centralDirectory.byteLength,
    true,
  );
  eocdView.setUint32(16, options.eocdCentralOffset ?? centralOffset, true);
  return concat([...localRecords, centralDirectory, eocd]);
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
    assets: [
      {
        kind: 'new-item',
        localId: 'wind-braid',
        displayName: 'Wind Braid',
        typeName: 'hair',
        bodyTypes: ['male', 'female'],
        animations: ['walk'],
        layers: [
          {
            id: 'foreground',
            zPos: 120,
            sprites: [{ animation: 'walk', source: SOURCE_PATH }],
          },
        ],
      },
    ],
  };
}

function manifestBytesOfLength(byteLength?: number): Uint8Array {
  const json = new TextEncoder().encode(
    `${JSON.stringify(packFixture(), null, 2)}\n`,
  );
  if (byteLength === undefined) return json;
  if (json.byteLength > byteLength)
    throw new Error('Manifest fixture exceeds requested length.');
  const padded = new Uint8Array(byteLength);
  padded.set(json);
  padded.fill(0x20, json.byteLength);
  return padded;
}

function checksumBytes(files: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const rows = [...files]
    .map(([filePath, bytes]) => ({
      path: filePath,
      size: bytes.byteLength,
      sha256: sha256(bytes),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return new TextEncoder().encode(
    `${JSON.stringify({ schema: ASSET_PACK_CHECKSUMS_SCHEMA, files: rows }, null, 2)}\n`,
  );
}

function archiveFixture(
  options: {
    readonly manifestBytes?: Uint8Array;
    readonly sourceBytes?: ReadonlyMap<string, Uint8Array>;
    readonly checksumsBytes?: Uint8Array;
    readonly entryOverrides?: ReadonlyMap<string, Partial<RawZipEntry>>;
  } = {},
): Uint8Array {
  const manifest = options.manifestBytes ?? manifestBytesOfLength();
  const sources =
    options.sourceBytes ??
    new Map([[SOURCE_PATH, new TextEncoder().encode('walk-pixels')]]);
  const payloadFiles = new Map<string, Uint8Array>([
    ['asset-pack.json', manifest],
    ...sources,
  ]);
  const checksums = options.checksumsBytes ?? checksumBytes(payloadFiles);
  const files = new Map<string, Uint8Array>([
    ['asset-pack.json', manifest],
    ['checksums.json', checksums],
    ...sources,
  ]);
  return buildRawZip(
    [...files].map(([filePath, data]) => ({
      name: filePath,
      data,
      ...options.entryOverrides?.get(filePath),
    })),
  );
}

async function expectUnsafe(
  archiveBytes: Uint8Array,
  code: AssetPackArchiveDiagnostic['code'],
): Promise<Extract<AssetPackArchiveInspection, { readonly kind: 'unsafe' }>> {
  const result = await inspectAssetPackArchiveBytes({
    archiveBytes,
    runtime: testRuntime,
  });
  expect(result.kind).toBe('unsafe');
  expect('snapshot' in result).toBe(false);
  if (result.kind !== 'unsafe')
    throw new Error('Expected unsafe archive inspection result.');
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([expect.objectContaining({ code })]),
  );
  return result;
}

describe('inspectAssetPackArchiveBytes security and bounds', () => {
  it('rejects an oversized input before copying its bytes', async () => {
    const oversizedInput = {
      byteLength: ASSET_PACK_ARCHIVE_LIMITS.archiveBytes + 1,
    } as unknown as Uint8Array;

    await expectUnsafe(oversizedInput, 'asset_archive_limit_exceeded');
  });

  it.each([
    ['absolute POSIX', '/sprites/a.png'],
    ['Windows drive', 'C:/sprites/a.png'],
    ['UNC', '//server/share/a.png'],
    ['backslash', 'sprites\\a.png'],
    ['Windows ADS', 'sprites/a:alternate-stream.png'],
    ['Windows reserved device', 'sprites/aux.png'],
    ['Windows superscript COM1 device', 'sprites/COM¹.png'],
    ['Windows superscript COM2 device', 'sprites/com².asset.png'],
    ['Windows superscript COM3 device', 'sprites/COM³'],
    ['Windows superscript LPT1 device', 'sprites/LPT¹.png'],
    ['Windows superscript LPT2 device', 'sprites/lpt².asset.png'],
    ['Windows superscript LPT3 device', 'sprites/LPT³'],
    ['Windows forbidden character', 'sprites/a?.png'],
    ['Windows trailing dot', 'sprites/a.png.'],
    ['Windows trailing space', 'sprites/a.png '],
    ['empty segment', 'sprites//a.png'],
    ['dot segment', 'sprites/./a.png'],
    ['parent segment', 'sprites/../a.png'],
    ['directory suffix', 'sprites/a/'],
  ])('rejects %s paths as unsafe', async (_label, unsafePath) => {
    await expectUnsafe(
      buildRawZip([{ name: unsafePath, data: new Uint8Array(0) }]),
      'asset_archive_unsafe',
    );
  });

  it('rejects NUL names', async () => {
    await expectUnsafe(
      buildRawZip([
        {
          name: new TextEncoder().encode('sprites/a\0.png'),
          data: new Uint8Array(0),
        },
      ]),
      'asset_archive_unsafe',
    );
  });

  it('rejects exact duplicates, ASCII-case collisions, and Unicode NFC collisions', async () => {
    const exact = buildRawZip([
      {
        name: 'sprites/a.png',
        data: new TextEncoder().encode('a'),
      },
      {
        name: 'sprites/a.png',
        data: new TextEncoder().encode('b'),
      },
    ]);
    const asciiCase = buildRawZip([
      {
        name: 'sprites/A.png',
        data: new TextEncoder().encode('a'),
      },
      {
        name: 'sprites/a.png',
        data: new TextEncoder().encode('b'),
      },
    ]);
    const unicode = buildRawZip([
      {
        name: 'sprites/caf\u00e9.png',
        data: new TextEncoder().encode('a'),
      },
      {
        name: 'sprites/cafe\u0301.png',
        data: new TextEncoder().encode('b'),
      },
    ]);

    await expectUnsafe(exact, 'asset_archive_unsafe');
    await expectUnsafe(asciiCase, 'asset_archive_unsafe');
    await expectUnsafe(unicode, 'asset_archive_unsafe');
  });

  it.each([
    ['directory mode', 0o040755],
    ['symlink mode', 0o120777],
    ['FIFO mode', 0o010644],
    ['socket mode', 0o140644],
  ])('rejects UNIX %s entries', async (_label, unixMode) => {
    await expectUnsafe(
      buildRawZip([
        {
          name: 'sprites/a.png',
          data: new Uint8Array(0),
          externalAttributes: (unixMode * 0x1_0000) >>> 0,
        },
      ]),
      'asset_archive_unsafe',
    );
  });

  it('rejects DOS directory entries', async () => {
    await expectUnsafe(
      buildRawZip([
        {
          name: 'sprites/a.png',
          data: new Uint8Array(0),
          creatorPlatform: 0,
          externalAttributes: 0x10,
        },
      ]),
      'asset_archive_unsafe',
    );
  });

  it.each([
    ['traditional encryption', 0x0001],
    ['strong encryption', 0x0040],
  ])('rejects %s flags', async (_label, flag) => {
    await expectUnsafe(
      buildRawZip([
        {
          name: 'sprites/a.png',
          data: new TextEncoder().encode('a'),
          flags: UTF8_FLAG | flag,
          localFlags: UTF8_FLAG | flag,
        },
      ]),
      'asset_archive_unsafe',
    );
  });

  it('rejects unsupported compression methods and data descriptors', async () => {
    await expectUnsafe(
      buildRawZip([
        {
          name: 'sprites/a.png',
          data: new TextEncoder().encode('a'),
          method: 12,
          localMethod: 12,
          compressedData: new TextEncoder().encode('a'),
        },
      ]),
      'asset_archive_unsafe',
    );
    await expectUnsafe(
      buildRawZip([
        {
          name: 'sprites/a.png',
          data: new TextEncoder().encode('a'),
          flags: UTF8_FLAG | 0x0008,
          localFlags: UTF8_FLAG | 0x0008,
        },
      ]),
      'asset_archive_unsafe',
    );
  });

  it('rejects DEFLATE-specific flags on stored entries', async () => {
    await expectUnsafe(
      buildRawZip([
        {
          name: 'sprites/a.png',
          data: new TextEncoder().encode('a'),
          method: 0,
          localMethod: 0,
          flags: UTF8_FLAG | 0x0002,
          localFlags: UTF8_FLAG | 0x0002,
        },
      ]),
      'asset_archive_unsafe',
    );
  });

  it('rejects central/local filename and metadata mismatches', async () => {
    const cases: RawZipEntry[] = [
      {
        name: 'sprites/a.png',
        localName: 'sprites/b.png',
        data: new TextEncoder().encode('a'),
      },
      {
        name: 'sprites/a.png',
        data: new TextEncoder().encode('a'),
        localFlags: 0,
      },
      {
        name: 'sprites/a.png',
        data: new TextEncoder().encode('a'),
        localMethod: 0,
      },
      {
        name: 'sprites/a.png',
        data: new TextEncoder().encode('a'),
        localCrc32: 0,
      },
      {
        name: 'sprites/a.png',
        data: new TextEncoder().encode('a'),
        localCompressedSize: 1,
      },
      {
        name: 'sprites/a.png',
        data: new TextEncoder().encode('a'),
        localUncompressedSize: 2,
      },
    ];
    for (const entry of cases) {
      await expectUnsafe(buildRawZip([entry]), 'asset_archive_invalid');
    }
  });

  it('rejects malformed raw DEFLATE before calling the runtime inflater', async () => {
    let inflations = 0;
    const runtime = createTestRuntime({ onInflate: () => (inflations += 1) });
    const malformedDeflate = buildRawZip([
      {
        name: 'asset-pack.json',
        compressedData: new Uint8Array([0x07]), // reserved block type
        method: 8,
        uncompressedSize: 10,
        localUncompressedSize: 10,
      },
    ]);

    const result = await inspectAssetPackArchiveBytes({
      archiveBytes: malformedDeflate,
      runtime,
    });
    expect(result.kind).toBe('unsafe');
    expect('snapshot' in result).toBe(false);
    expect(inflations).toBe(0);
  });
});

describe('inspectAssetPackArchiveBytes repairable vs verified', () => {
  it('returns repairable snapshot for missing/invalid checksums or manifest schema errors', async () => {
    const badChecksums = archiveFixture({
      checksumsBytes: new TextEncoder().encode('{ bad json }'),
    });
    const result = await inspectAssetPackArchiveBytes({
      archiveBytes: badChecksums,
      runtime: testRuntime,
    });

    expect(result.kind).toBe('repairable');
    if (result.kind !== 'repairable') throw new Error('Expected repairable.');
    expect(result.snapshot.archiveDigest).toBe(sha256(badChecksums));
    expect(result.snapshot.manifestBytes).toBeDefined();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'asset_checksum_invalid' }),
      ]),
    );
  });

  it('returns repairable for safe unreferenced sprite entries in draft envelope', async () => {
    const manifest = manifestBytesOfLength();
    const sourceBytes = new Map<string, Uint8Array>([
      [SOURCE_PATH, new TextEncoder().encode('walk-pixels')],
      ['sprites/extra.png', new TextEncoder().encode('extra')],
    ]);
    const payloadFiles = new Map<string, Uint8Array>([
      ['asset-pack.json', manifest],
      ...sourceBytes,
    ]);
    const archive = archiveFixture({
      manifestBytes: manifest,
      sourceBytes,
      checksumsBytes: checksumBytes(payloadFiles),
    });

    const result = await inspectAssetPackArchiveBytes({
      archiveBytes: archive,
      runtime: testRuntime,
    });

    expect(result.kind).toBe('repairable');
    if (result.kind !== 'repairable') throw new Error('Expected repairable.');
    expect(result.snapshot.sourceBytes.has('sprites/extra.png')).toBe(true);
  });

  it('returns verified for complete valid archive and ensures returned arrays are immutable copies', async () => {
    const archive = archiveFixture();
    const result = await inspectAssetPackArchiveBytes({
      archiveBytes: archive,
      runtime: testRuntime,
    });

    expect(result.kind).toBe('verified');
    if (result.kind !== 'verified') throw new Error('Expected verified.');
    expect(result.diagnostics).toEqual([]);
    expect(result.snapshot.archiveDigest).toBe(sha256(archive));

    // Input mutation check
    const originalDigest = result.snapshot.archiveDigest;
    archive[0] ^= 0xff;
    expect(result.snapshot.archiveDigest).toBe(originalDigest);
  });
});

describe('createAssetPackArchive formal and draft assembly', () => {
  it('rejects an oversized source before copying its bytes', async () => {
    const oversizedSource = {
      byteLength: ASSET_PACK_ARCHIVE_LIMITS.entryBytes + 1,
    } as unknown as Uint8Array;

    await expect(
      createAssetPackArchive({
        kind: 'draft',
        manifestDocument: packFixture(),
        sourceBytes: new Map([[SOURCE_PATH, oversizedSource]]),
        runtime: testRuntime,
      }),
    ).rejects.toThrow('Archive entry exceeds limit');
  });

  it('writes byte-identical archives regardless of map insertion order or process timezone', async () => {
    const manifestDoc = packFixture();
    const source1 = new Map<string, Uint8Array>([
      [SOURCE_PATH, new TextEncoder().encode('walk-pixels')],
      [SECOND_SOURCE_PATH, new TextEncoder().encode('slash-pixels')],
    ]);
    const source2 = new Map([...source1].reverse());

    const originalTz = process.env.TZ;
    let first: Uint8Array;
    let second: Uint8Array;
    try {
      process.env.TZ = 'UTC';
      const r1 = await createAssetPackArchive({
        kind: 'formal',
        manifestDocument: {
          ...manifestDoc,
          assets: [
            {
              ...manifestDoc.assets[0],
              layers: [
                {
                  ...manifestDoc.assets[0].layers[0],
                  sprites: [
                    { animation: 'walk', source: SOURCE_PATH },
                    { animation: 'walk', source: SECOND_SOURCE_PATH },
                  ],
                },
              ],
            },
          ],
        },
        sourceBytes: source1,
        runtime: testRuntime,
      });
      first = r1.archiveBytes;

      process.env.TZ = 'Asia/Tokyo';
      const r2 = await createAssetPackArchive({
        kind: 'formal',
        manifestDocument: {
          ...manifestDoc,
          assets: [
            {
              ...manifestDoc.assets[0],
              layers: [
                {
                  ...manifestDoc.assets[0].layers[0],
                  sprites: [
                    { animation: 'walk', source: SOURCE_PATH },
                    { animation: 'walk', source: SECOND_SOURCE_PATH },
                  ],
                },
              ],
            },
          ],
        },
        sourceBytes: source2,
        runtime: testRuntime,
      });
      second = r2.archiveBytes;
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }

    expect(second).toEqual(first);
    expect(sha256(second)).toBe(sha256(first));
  });

  it('assembles verified draft archives with draft status', async () => {
    const manifestDoc = packFixture();
    const sourceBytes = new Map<string, Uint8Array>([
      [SOURCE_PATH, new TextEncoder().encode('walk-pixels')],
    ]);

    const draft = await createAssetPackArchive({
      kind: 'draft',
      manifestDocument: manifestDoc,
      sourceBytes,
      runtime: testRuntime,
    });

    expect(draft.inspection.kind).toBe('verified');
    if (draft.inspection.kind !== 'verified')
      throw new Error('Expected draft to be verified.');
    expect(draft.inspection.snapshot.payload.pack.status).toBe('draft');
  });

  it('draft preserves unreferenced sprite as repairable diagnostic while formal rejects it', async () => {
    const manifestDoc = packFixture();
    const sourceBytes = new Map<string, Uint8Array>([
      [SOURCE_PATH, new TextEncoder().encode('walk-pixels')],
      ['sprites/unreferenced.png', new TextEncoder().encode('extra')],
    ]);

    const draft = await createAssetPackArchive({
      kind: 'draft',
      manifestDocument: manifestDoc,
      sourceBytes,
      runtime: testRuntime,
    });
    expect(draft.inspection.kind).toBe('repairable');

    await expect(
      createAssetPackArchive({
        kind: 'formal',
        manifestDocument: manifestDoc,
        sourceBytes,
        runtime: testRuntime,
      }),
    ).rejects.toThrow();
  });
});
