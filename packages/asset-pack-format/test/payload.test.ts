import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ASSET_PACK_SCHEMA,
  assetPackContentProjection,
  type AssetPackSource,
} from '@lpc-toolkit/core';
import type { AssetPackFormatRuntime } from '../src/runtime.js';
import { parseAssetPackPayload } from '../src/payload.js';

const runtime: AssetPackFormatRuntime = {
  sha256: async (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  decodeUtf8Fatal: (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  encodeUtf8: (value: string) => new TextEncoder().encode(value),
  inflateRawBounded: async () => {
    throw new Error('not used by payload tests');
  },
};

const PACK_CREDITS = {
  authors: ['Alice'],
  licenses: ['CC-BY-SA 4.0'],
  urls: ['https://example.com/alice'],
  notes: '',
} as const;

function packFixture(overrides?: Partial<AssetPackSource>): AssetPackSource {
  return {
    schema: ASSET_PACK_SCHEMA,
    id: 'acme.wind-braid',
    version: '1.0.0',
    displayName: 'ACME Wind Braid',
    credits: PACK_CREDITS,
    assets: [{
      kind: 'new-item',
      localId: 'wind-braid',
      displayName: 'Wind Braid',
      typeName: 'hair',
      bodyTypes: ['male', 'female'],
      animations: ['walk', 'climb'],
      layers: [{
        id: 'foreground',
        zPos: 120,
        sprites: [
          { animation: 'walk', source: 'sprites/wind-braid/foreground/walk.png' },
          { animation: 'climb', source: 'sprites/wind-braid/foreground/climb.png' },
        ],
      }],
    }],
    ...overrides,
  };
}

async function parsePayloadOk(input: { manifestBytes: Uint8Array; sourceBytes: ReadonlyMap<string, Uint8Array> }) {
  const result = await parseAssetPackPayload({ ...input, runtime });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected payload parsing to succeed.');
  return result;
}

describe('parseAssetPackPayload', () => {
  it('parses valid payload with sorted source digests and independent byte copies', async () => {
    const encoder = new TextEncoder();
    const manifestBytes = encoder.encode(JSON.stringify(packFixture(), null, 2));
    const walkBytes = encoder.encode('walk');
    const climbBytes = encoder.encode('climb');

    const sourceBytes = new Map<string, Uint8Array>([
      ['sprites/wind-braid/foreground/walk.png', walkBytes],
      ['sprites/wind-braid/foreground/climb.png', climbBytes],
    ]);

    const result = await parsePayloadOk({ manifestBytes, sourceBytes });

    expect(result.pack.id).toBe('acme.wind-braid');
    expect([...result.sourceDigests.keys()]).toEqual([
      'sprites/wind-braid/foreground/climb.png',
      'sprites/wind-braid/foreground/walk.png',
    ]);
    expect([...result.sourceBytes.keys()]).toEqual([
      'sprites/wind-braid/foreground/climb.png',
      'sprites/wind-braid/foreground/walk.png',
    ]);

    // Mutate original arrays
    manifestBytes[0] = 0x5b;
    walkBytes[0] = 0x58;
    sourceBytes.set('sprites/ignored.png', encoder.encode('ignored'));

    expect(result.manifestBytes[0]).not.toBe(0x5b);
    expect(new TextDecoder().decode(result.sourceBytes.get('sprites/wind-braid/foreground/walk.png'))).toBe('walk');
    expect(result.sourceBytes.has('sprites/ignored.png')).toBe(false);
  });

  it('surfaces schema, JSON syntax, missing-source, and unexpected-source diagnostics', async () => {
    const encoder = new TextEncoder();

    const invalidJson = await parseAssetPackPayload({
      manifestBytes: encoder.encode('{ invalid json'),
      sourceBytes: new Map(),
      runtime,
    });
    expect(invalidJson.ok).toBe(false);
    if (invalidJson.ok) throw new Error('Expected JSON parsing to fail');
    expect(invalidJson.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_pack_manifest_json_invalid' }),
    ]));

    const invalidSchema = await parseAssetPackPayload({
      manifestBytes: encoder.encode(JSON.stringify({ ...packFixture(), schema: 'lpc-toolkit.asset-pack.v2' })),
      sourceBytes: new Map(),
      runtime,
    });
    expect(invalidSchema.ok).toBe(false);
    if (invalidSchema.ok) throw new Error('Expected schema parsing to fail.');
    expect(invalidSchema.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_pack_schema_invalid' }),
    ]));

    const missingAndExtra = await parseAssetPackPayload({
      manifestBytes: encoder.encode(JSON.stringify(packFixture())),
      sourceBytes: new Map([
        ['sprites/wind-braid/foreground/walk.png', encoder.encode('walk')],
        ['sprites/unreferenced.png', encoder.encode('extra')],
      ]),
      runtime,
    });
    expect(missingAndExtra.ok).toBe(false);
    if (missingAndExtra.ok) throw new Error('Expected source coverage parsing to fail.');
    expect(missingAndExtra.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'asset_source_missing',
        sourcePath: 'sprites/wind-braid/foreground/climb.png',
      }),
      expect.objectContaining({
        code: 'asset_source_unexpected',
        sourcePath: 'sprites/unreferenced.png',
      }),
    ]));
  });

  it('keeps the content digest identical for formal versus draft status and acknowledgement-only manifest changes', async () => {
    const encoder = new TextEncoder();
    const sourceBytes = new Map<string, Uint8Array>([
      ['sprites/wind-braid/foreground/walk.png', encoder.encode('walk')],
      ['sprites/wind-braid/foreground/climb.png', encoder.encode('climb')],
    ]);

    const base = await parsePayloadOk({
      manifestBytes: encoder.encode(JSON.stringify(packFixture())),
      sourceBytes,
    });

    const draft = await parsePayloadOk({
      manifestBytes: encoder.encode(JSON.stringify(packFixture({ status: 'draft' }))),
      sourceBytes,
    });

    const acknowledged = await parsePayloadOk({
      manifestBytes: encoder.encode(JSON.stringify(packFixture({
        acknowledgements: [{
          code: 'asset_path_inferred',
          subject: {
            itemId: 'braid',
            animation: 'climb',
            layer: 'layer_1',
            bodyTypes: ['female'],
          },
          contentDigest: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
          reason: 'Reviewed after validation.',
        }],
      }))),
      sourceBytes,
    });

    expect(draft.contentDigest).toBe(base.contentDigest);
    expect(acknowledged.contentDigest).toBe(base.contentDigest);
  });

  it('invalidates content digest on substantive changes', async () => {
    const encoder = new TextEncoder();
    const sourceBytes = new Map<string, Uint8Array>([
      ['sprites/wind-braid/foreground/walk.png', encoder.encode('walk')],
      ['sprites/wind-braid/foreground/climb.png', encoder.encode('climb')],
    ]);

    const base = await parsePayloadOk({
      manifestBytes: encoder.encode(JSON.stringify(packFixture())),
      sourceBytes,
    });

    const versionChanged = await parsePayloadOk({
      manifestBytes: encoder.encode(JSON.stringify(packFixture({ version: '1.0.1' }))),
      sourceBytes,
    });

    expect(versionChanged.contentDigest).not.toBe(base.contentDigest);
  });

  it('preserves the legacy JSON digest for Unicode credit-override paths', async () => {
    const encoder = new TextEncoder();
    const sourceBytes = new Map<string, Uint8Array>([
      ['sprites/wind-braid/foreground/walk.png', encoder.encode('walk')],
      ['sprites/wind-braid/foreground/climb.png', encoder.encode('climb')],
    ]);
    const result = await parsePayloadOk({
      manifestBytes: encoder.encode(JSON.stringify(packFixture({
        creditOverrides: {
          'sprites/éclair/foreground/walk.png': PACK_CREDITS,
          'sprites/zebra/foreground/walk.png': PACK_CREDITS,
        },
      }))),
      sourceBytes,
    });

    const legacyDigest = `sha256:${createHash('sha256').update(JSON.stringify({
      manifest: assetPackContentProjection(result.pack),
      sources: [...result.sourceDigests].map(([sourcePath, digest]) => ({ sourcePath, digest })),
    })).digest('hex')}`;

    expect(legacyDigest).toBe('sha256:55f76683fbbf0da3faae69c479a4ed64e289fcac5348f867d6cabd404dee3aec');
    expect(result.contentDigest).toBe(legacyDigest);
  });
});
