import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  createAssetPackArchive,
  inspectAssetPackArchiveBytes,
  type AssetPackFormatRuntime,
} from '@lpc-toolkit/asset-pack-format';
import { createBrowserAssetPackFormatRuntime } from '../src/adapter/asset-pack-format-runtime';

const SOURCE_PATH = 'sprites/wind-braid/foreground/walk.png';
const UTF8_FLAG = 0x0800;
const UNIX_REGULAR_ATTRIBUTES = (0o100644 * 0x1_0000) >>> 0;

const manifest = {
  schema: 'lpc-toolkit.asset-pack.v1',
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
} as const;

const normalizedManifest = {
  assets: [{
    animations: ['walk'],
    bodyTypes: ['male', 'female'],
    displayName: 'Wind Braid',
    kind: 'new-item',
    layers: [{
      id: 'foreground',
      sprites: [{ animation: 'walk', source: SOURCE_PATH }],
      zPos: 120,
    }],
    localId: 'wind-braid',
    typeName: 'hair',
  }],
  credits: {
    authors: ['Alice'],
    licenses: ['CC-BY-SA 4.0'],
    notes: 'Original wind braid.',
    urls: ['https://example.com/alice'],
  },
  displayName: 'ACME Wind Braid',
  id: 'acme.wind-braid',
  schema: 'lpc-toolkit.asset-pack.v1',
  version: '1.0.0',
} as const;

const FROZEN_ARCHIVE_HEX =
  '504b03040a0000000800000021006c6044c96f0100004c0300000f00000061737365742d7061636b2e6a736f6e6553cb6ec32010bce72b10e71827554fb925510f3df421b5525555396c3089913120c049d328ff5ec04e1de805997dccce0ee3f304210cd63267f1027df91b42e77886b8e42d38aee4988bf12388060fd7cdf45abd55d5e9fda45956dc8260783ade772c46feb557dc6a01a767689907c01f5c56686580577fcdb8f1b19093ec5870c7da31e31b9949079fffbe7c9ec7be9d326c6f5427ab1b423e6bb5f170697b0e910a12d0a20ad3bcc4aaced0b8c1805a1e3deb621b3629470265e8265aee710270b9b96d128e3faf2a109cdfcd2679f1a8a15014c463dc759c3aaae4fceb5cf5ad819b7e76808910981a56f168847e730c9dab55a22b5e0a4e87d71be6e2109136d10fafd7c5eab3785ba27b324baba5eaa5c62f86efb90481025514a992812bee8c48e06ae7b45d9425fb86560b46a86a4bb861e2cf4b5c2173d172fdf480322b0d6600da3292a9842dadbd3d435a685a38a544c31d89ff47a18136e430ef0b0fde6e830fe6641676bc4c7e01504b03040a000000080000002100ce9265fbf8000000930100000e000000636865636b73756d732e6a736f6e7d50d16e83300c7ce72b10cf05e22424a4bf32ed21899dc2a080085da555fdf78556d3266ddacbc9be3bd967dfb23c2f423f522c8ef94b6af2fcf6c0442f76eb125bd818692b17eb87ea2dce5371f832c4cef246ed966775d481a470601420c756a546310f0d03cfb841ee381a2111b569b4050744c6390d2190078b40f2c7e8fe83d2e056ca07733ffc1d2d2e6bbf51acaffd84a55b6d8f7598573aadf365c2fa6ac7a15aa6d33f8955a3db569390dab7c270a7181701317080d0328b41098e8a3833d653ba4c80e6da49a78d090d08fa9518e01938e1ebae15d17774b6fbca71f1e536cfe3d06fd5f74fcba4fb215eceb17a8722bb679f504b03040a000000080000002100bb92d4640d0000000b00000026000000737072697465732f77696e642d62726169642f666f726567726f756e642f77616c6b2e706e672b4fccc9d62dc8ac48cd290600504b01021e030a0000000800000021006c6044c96f0100004c0300000f0000000000000000000000a4810000000061737365742d7061636b2e6a736f6e504b01021e030a000000080000002100ce9265fbf8000000930100000e0000000000000000000000a4819c010000636865636b73756d732e6a736f6e504b01021e030a000000080000002100bb92d4640d0000000b000000260000000000000000000000a481c0020000737072697465732f77696e642d62726169642f666f726567726f756e642f77616c6b2e706e67504b05060000000003000300cd000000110300000000';

interface RawEntry {
  readonly name: string;
  readonly data: Uint8Array;
  readonly method?: number;
  readonly compressedData?: Uint8Array;
  readonly uncompressedSize?: number;
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

function rawZip(entries: readonly RawEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const data = entry.data;
    const method = entry.method ?? 8;
    const compressed = entry.compressedData ?? (method === 8 ? new Uint8Array(deflateRawSync(data)) : data);
    const header = new Uint8Array(30);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x0403_4b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, UTF8_FLAG, true);
    view.setUint16(8, method, true);
    view.setUint32(14, crc32(data), true);
    view.setUint32(18, compressed.byteLength, true);
    view.setUint32(22, entry.uncompressedSize ?? data.byteLength, true);
    view.setUint16(26, name.byteLength, true);
    const local = new Uint8Array(header.byteLength + name.byteLength + compressed.byteLength);
    local.set(header);
    local.set(name, header.byteLength);
    local.set(compressed, header.byteLength + name.byteLength);
    locals.push(local);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x0201_4b50, true);
    centralView.setUint16(4, (3 << 8) | 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, UTF8_FLAG, true);
    centralView.setUint16(10, method, true);
    centralView.setUint32(16, crc32(data), true);
    centralView.setUint32(20, compressed.byteLength, true);
    centralView.setUint32(24, entry.uncompressedSize ?? data.byteLength, true);
    centralView.setUint16(28, name.byteLength, true);
    centralView.setUint32(38, UNIX_REGULAR_ATTRIBUTES, true);
    centralView.setUint32(42, offset, true);
    const centralRecord = new Uint8Array(centralHeader.byteLength + name.byteLength);
    centralRecord.set(centralHeader);
    centralRecord.set(name, centralHeader.byteLength);
    central.push(centralRecord);
    offset += local.byteLength;
  }

  const centralOffset = offset;
  const centralBytes = new Uint8Array(central.reduce((total, item) => total + item.byteLength, 0));
  offset = 0;
  for (const record of central) {
    centralBytes.set(record, offset);
    offset += record.byteLength;
  }
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x0605_4b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralBytes.byteLength, true);
  eocdView.setUint32(16, centralOffset, true);
  const result = new Uint8Array(offset + locals.reduce((total, item) => total + item.byteLength, 0) + eocd.byteLength);
  offset = 0;
  for (const local of locals) {
    result.set(local, offset);
    offset += local.byteLength;
  }
  result.set(centralBytes, offset);
  result.set(eocd, offset + centralBytes.byteLength);
  return result;
}

function runtime(): AssetPackFormatRuntime {
  return createBrowserAssetPackFormatRuntime({
    crypto: globalThis.crypto,
    createDecompressionStream: (format) => new DecompressionStream(format),
  });
}

function bytesFromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

describe('browser asset-pack archive conformance', () => {
  it('matches the frozen Task 3 archive bytes, digests, normalized manifest, and diagnostics', async () => {
    const browserRuntime = runtime();
    const sourceBytes = new Map([[SOURCE_PATH, new TextEncoder().encode('walk-pixels')]]);
    const created = await createAssetPackArchive({
      kind: 'formal',
      manifestDocument: manifest,
      sourceBytes,
      runtime: browserRuntime,
    });
    expect(created.archiveBytes).toEqual(bytesFromHex(FROZEN_ARCHIVE_HEX));
    expect(created.archiveDigest).toBe(
      'sha256:fa9795d2924c7e88a1553caaf583d25f246f1398070af20ebdc7f5e83818dee0',
    );

    const inspected = await inspectAssetPackArchiveBytes({
      archiveBytes: bytesFromHex(FROZEN_ARCHIVE_HEX),
      runtime: browserRuntime,
    });
    expect(inspected.kind).toBe('verified');
    if (inspected.kind !== 'verified') throw new Error('Expected verified archive.');
    expect(inspected.diagnostics).toEqual([]);
    expect(inspected.snapshot.payload.contentDigest).toBe(
      'sha256:e8bf8cafde81d21dd9b77456a4a41512b8fd133e328ef2f5ce40c42c2e20a317',
    );
    expect(Object.fromEntries(inspected.snapshot.payload.sourceDigests)).toEqual({
      [SOURCE_PATH]: 'sha256:657887e347c8392b6023fddf211f80adf632d6e209aceb1931727b4b799f513e',
    });
    expect(inspected.snapshot.manifestDocument).toEqual(normalizedManifest);
  });

  it('preserves the shared unsafe, repairable, stored, no-inflater, and declared-size vectors', async () => {
    const unsafe = await inspectAssetPackArchiveBytes({
      archiveBytes: rawZip([{ name: '../unsafe.png', data: new Uint8Array() }]),
      runtime: runtime(),
    });
    expect(unsafe.kind).toBe('unsafe');
    if (unsafe.kind !== 'unsafe') throw new Error('Expected unsafe archive.');
    expect(unsafe.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_archive_unsafe' }),
    ]));

    const repairable = await inspectAssetPackArchiveBytes({
      archiveBytes: rawZip([
        { name: 'asset-pack.json', data: new TextEncoder().encode('{}') },
        { name: 'checksums.json', data: new TextEncoder().encode('{ bad json }') },
      ]),
      runtime: runtime(),
    });
    expect(repairable.kind).toBe('repairable');
    if (repairable.kind !== 'repairable') throw new Error('Expected repairable archive.');
    expect(repairable.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_checksum_invalid' }),
    ]));

    let inflaterCalled = false;
    const noInflaterRuntime = createBrowserAssetPackFormatRuntime({
      crypto: globalThis.crypto,
      createDecompressionStream: () => {
        inflaterCalled = true;
        throw new Error('DecompressionStream must not be used for stored entries.');
      },
    });
    const stored = await inspectAssetPackArchiveBytes({
      archiveBytes: rawZip([{ name: 'asset-pack.json', data: new TextEncoder().encode('{}'), method: 0 }]),
      runtime: noInflaterRuntime,
    });
    expect(stored.kind).toBe('repairable');
    expect(inflaterCalled).toBe(false);

    const declaredSize = await inspectAssetPackArchiveBytes({
      archiveBytes: rawZip([{
        name: 'asset-pack.json',
        data: new TextEncoder().encode('hello'),
        uncompressedSize: 4,
      }]),
      runtime: runtime(),
    });
    expect(declaredSize.kind).toBe('unsafe');
    if (declaredSize.kind !== 'unsafe') throw new Error('Expected declared-size archive to be unsafe.');
    expect(declaredSize.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_archive_invalid' }),
    ]));
  });
});
