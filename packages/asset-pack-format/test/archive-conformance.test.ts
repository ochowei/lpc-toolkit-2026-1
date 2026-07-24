import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createAssetPackArchive } from '../src/archive.js';
import type { AssetPackFormatRuntime } from '../src/runtime.js';

const testRuntime: AssetPackFormatRuntime = {
  sha256: async (bytes) =>
    `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  decodeUtf8Fatal: (bytes) =>
    new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  encodeUtf8: (str) => new TextEncoder().encode(str),
  inflateRawBounded: async ({ compressed, declaredSize, maximumSize }) => {
    const limit = Math.min(declaredSize, maximumSize);
    const output = inflateRawSync(compressed, {
      maxOutputLength: Math.max(limit, 1),
    });
    if (output.byteLength !== declaredSize) {
      throw new Error('Raw DEFLATE output length does not match declaration');
    }
    return new Uint8Array(output);
  },
};

describe('Archive Conformance Snapshot', () => {
  it('conforms to frozen minimal formal archive snapshot', async () => {
    const manifestDocument = {
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
              sprites: [
                {
                  animation: 'walk',
                  source: 'sprites/wind-braid/foreground/walk.png',
                },
              ],
            },
          ],
        },
      ],
    };

    const sourceBytes = new Map<string, Uint8Array>([
      [
        'sprites/wind-braid/foreground/walk.png',
        new TextEncoder().encode('walk-pixels'),
      ],
    ]);

    const result = await createAssetPackArchive({
      kind: 'formal',
      manifestDocument,
      sourceBytes,
      runtime: testRuntime,
    });

    expect(result.inspection.kind).toBe('verified');
    if (result.inspection.kind !== 'verified')
      throw new Error('Expected verified');

    // Conformance assertions on snapshot
    expect(result.inspection.snapshot.payload.pack.id).toBe('acme.wind-braid');
    expect(
      result.inspection.snapshot.payload.sourceDigests.get(
        'sprites/wind-braid/foreground/walk.png',
      ),
    ).toBe(
      'sha256:657887e347c8392b6023fddf211f80adf632d6e209aceb1931727b4b799f513e',
    );
  });
});
