import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  createAssetPackArchive,
  inspectAssetPackArchiveBytes,
} from '@lpc-toolkit/asset-pack-format';
import { createBrowserAssetPackFormatRuntime } from '../src/adapter/asset-pack-format-runtime';

const manifest = {
  schema: 'lpc-toolkit.asset-pack.v1',
  id: 'acme.wind-braid',
  version: '1.0.0',
  displayName: 'ACME Wind Braid',
  credits: { authors: ['Alice'], licenses: ['CC-BY-SA 4.0'], urls: ['https://example.com/alice'], notes: 'Original wind braid.' },
  assets: [{ kind: 'new-item', localId: 'wind-braid', displayName: 'Wind Braid', typeName: 'hair', bodyTypes: ['male', 'female'], animations: ['walk'], layers: [{ id: 'foreground', zPos: 120, sprites: [{ animation: 'walk', source: 'sprites/wind-braid/foreground/walk.png' }] }] }],
} as const;

describe('browser asset-pack archive conformance', () => {
  it('inspects and assembles a formal archive through the browser runtime', async () => {
    const runtime = createBrowserAssetPackFormatRuntime({
      crypto: globalThis.crypto,
      createDecompressionStream: (format) => new DecompressionStream(format),
    });
    const sourceBytes = new Map([['sprites/wind-braid/foreground/walk.png', new TextEncoder().encode('walk-pixels')]]);
    const created = await createAssetPackArchive({ kind: 'formal', manifestDocument: manifest, sourceBytes, runtime });
    expect(created.inspection.kind).toBe('verified');
    const inspected = await inspectAssetPackArchiveBytes({ archiveBytes: created.archiveBytes, runtime });
    expect(inspected.kind).toBe('verified');
    if (inspected.kind !== 'verified') throw new Error('expected verified archive');
    expect(inspected.snapshot.archiveDigest).toBe(created.archiveDigest);
    expect(inspected.snapshot.payload.pack.id).toBe('acme.wind-braid');
    expect(inspected.snapshot.payload.sourceDigests.get('sprites/wind-braid/foreground/walk.png')).toBe(
      'sha256:657887e347c8392b6023fddf211f80adf632d6e209aceb1931727b4b799f513e',
    );
  });

  it('uses the shared archive trust decisions for malformed deflate', async () => {
    const runtime = createBrowserAssetPackFormatRuntime({ crypto: globalThis.crypto, createDecompressionStream: (format) => new DecompressionStream(format) });
    const compressed = new Uint8Array(deflateRawSync(Buffer.from('hello')));
    await expect(runtime.inflateRawBounded({ compressed, declaredSize: 5, maximumSize: 4 })).rejects.toThrow(/bounded output/i);
  });
});
