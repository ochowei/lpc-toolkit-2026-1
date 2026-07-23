import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ASSET_PACK_SCHEMA, type AssetPackSource } from '@lpc-toolkit/core';
import { loadAssetPackFiles } from '../src/asset-pack-files.js';
import { parseAssetPackPayload } from '../src/asset-pack-payload.js';

const temporaryDirectories: string[] = [];

const PACK_CREDITS = {
  authors: ['Alice'],
  licenses: ['CC-BY-SA 4.0'],
  urls: ['https://example.com/alice'],
  notes: '',
} as const;

function createDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

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

function writePack(
  root: string,
  manifestBytes: Buffer,
  sourceBytes: ReadonlyMap<string, Buffer>,
): void {
  writeFileSync(path.join(root, 'asset-pack.json'), manifestBytes);
  for (const [sourcePath, bytes] of sourceBytes) {
    const filePath = path.join(root, sourcePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, bytes);
  }
}

async function parsePayloadOk(input: Parameters<typeof parseAssetPackPayload>[0]) {
  const result = await parseAssetPackPayload(input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected payload parsing to succeed.');
  return result;
}

async function loadFilesOk(root: string) {
  const result = await loadAssetPackFiles(root);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected directory loading to succeed.');
  return result;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('parseAssetPackPayload', () => {
  it('matches directory snapshots with sorted source digests and independent byte copies', async () => {
    const root = createDirectory('lpc-asset-pack-payload-parity-');
    const manifestBytes = Buffer.from(`${JSON.stringify(packFixture(), null, 2)}\n`);
    const sourceBytes = new Map<string, Buffer>([
      ['sprites/wind-braid/foreground/walk.png', Buffer.from('walk')],
      ['sprites/wind-braid/foreground/climb.png', Buffer.from('climb')],
    ]);
    writePack(root, manifestBytes, sourceBytes);

    const direct = await parsePayloadOk({ manifestBytes, sourceBytes });
    const directory = await loadFilesOk(root);

    expect(direct.pack).toEqual(directory.pack);
    expect([...direct.sourceDigests]).toEqual([...directory.sourceDigests]);
    expect([...direct.sourceBytes.keys()]).toEqual([
      'sprites/wind-braid/foreground/climb.png',
      'sprites/wind-braid/foreground/walk.png',
    ]);
    expect(direct.contentDigest).toBe(directory.contentDigest);

    manifestBytes[0] = 0x5b;
    sourceBytes.get('sprites/wind-braid/foreground/walk.png')![0] = 0x58;
    sourceBytes.set('sprites/ignored.png', Buffer.from('ignored'));

    expect(direct.manifestBytes[0]).not.toBe(0x5b);
    expect(direct.sourceBytes.get('sprites/wind-braid/foreground/walk.png')?.toString())
      .toBe('walk');
    expect(direct.sourceBytes.has('sprites/ignored.png')).toBe(false);
  });

  it('surfaces schema, missing-source, and unexpected-source diagnostics', async () => {
    const invalidSchema = await parseAssetPackPayload({
      manifestBytes: Buffer.from(JSON.stringify({ ...packFixture(), schema: 'lpc-toolkit.asset-pack.v2' })),
      sourceBytes: new Map(),
    });
    expect(invalidSchema.ok).toBe(false);
    if (invalidSchema.ok) throw new Error('Expected schema parsing to fail.');
    expect(invalidSchema.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_pack_schema_invalid' }),
    ]));

    const missingAndExtra = await parseAssetPackPayload({
      manifestBytes: Buffer.from(JSON.stringify(packFixture())),
      sourceBytes: new Map([
        ['sprites/wind-braid/foreground/walk.png', Buffer.from('walk')],
        ['sprites/unreferenced.png', Buffer.from('extra')],
      ]),
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

  it('keeps the content digest stable for acknowledgement-only manifest changes', async () => {
    const sourceBytes = new Map<string, Buffer>([
      ['sprites/wind-braid/foreground/walk.png', Buffer.from('walk')],
      ['sprites/wind-braid/foreground/climb.png', Buffer.from('climb')],
    ]);
    const base = await parsePayloadOk({
      manifestBytes: Buffer.from(JSON.stringify(packFixture())),
      sourceBytes,
    });
    const acknowledged = await parsePayloadOk({
      manifestBytes: Buffer.from(JSON.stringify(packFixture({
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

    expect(acknowledged.contentDigest).toBe(base.contentDigest);
  });
});
