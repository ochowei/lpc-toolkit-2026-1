import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { createCanvas } from '@napi-rs/canvas';
import { ASSET_PACK_SCHEMA, standardAnimationGeometry, type AssetPackSource } from '@lpc-toolkit/core';
import { createAssetPackArchive, type AssetPackFormatRuntime, type AssetPackSha256 } from '@lpc-toolkit/asset-pack-format';

export const ASSET_PACK_FIXTURE = {
  id: 'acme.wind-braid',
  displayName: 'ACME Wind Braid',
  localId: 'wind-braid',
  author: 'Alice',
  license: 'CC-BY-SA 4.0',
  url: 'https://example.com/alice',
  sourcePath: 'sprites/wind-braid/foreground/walk.png',
} as const;

export function createAssetPackManifest(version: string): AssetPackSource {
  return {
    schema: ASSET_PACK_SCHEMA,
    id: ASSET_PACK_FIXTURE.id,
    version,
    displayName: ASSET_PACK_FIXTURE.displayName,
    credits: {
      authors: [ASSET_PACK_FIXTURE.author],
      licenses: [ASSET_PACK_FIXTURE.license],
      urls: [ASSET_PACK_FIXTURE.url],
      notes: 'Original wind braid.',
    },
    assets: [{
      kind: 'new-item',
      localId: ASSET_PACK_FIXTURE.localId,
      displayName: 'Wind Braid',
      typeName: 'hair',
      bodyTypes: ['male', 'female'],
      animations: ['walk'],
      variants: ['orange'],
      recolor: {
        material: 'hair',
        palettes: ['ulpc'],
        source: ['#aa5500', '#0055aa'],
      },
      layers: [{
        id: 'foreground',
        zPos: 120,
        sprites: [{
          animation: 'walk',
          source: ASSET_PACK_FIXTURE.sourcePath,
          bodyTypes: ['male'],
          variant: 'orange',
        }],
      }],
    }],
  };
}

export function createWalkPng(fill: string): Buffer {
  const geometry = standardAnimationGeometry('walk');
  const maxColumn = Math.max(...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)));
  const canvas = createCanvas((maxColumn + 1) * geometry.frameSize, geometry.rows.length * geometry.frameSize);
  const context = canvas.getContext('2d');
  context.fillStyle = '#aa5500';
  context.fillRect(0, 0, 4, 4);
  context.fillStyle = '#0055aa';
  context.fillRect(4, 0, 4, 4);
  context.fillStyle = fill;
  for (const row of geometry.rows) {
    for (let column = 0; column <= maxColumn; column += 1) {
      context.fillRect(column * geometry.frameSize + 8, row.sourceRow * geometry.frameSize + 8, 16, 16);
    }
  }
  return canvas.toBuffer('image/png');
}

export async function createAssetPackFixtureArchive(version = '1.0.0', fill = '#aa5500'): Promise<Buffer> {
  const sourceBytes = new Map<string, Uint8Array>([[ASSET_PACK_FIXTURE.sourcePath, createWalkPng(fill)]]);
  const result = await createAssetPackArchive({
    kind: 'formal',
    manifestDocument: { ...createAssetPackManifest(version) },
    sourceBytes,
    runtime: nodeAssetPackFormatRuntime,
  });
  return Buffer.from(result.archiveBytes);
}

const nodeAssetPackFormatRuntime: AssetPackFormatRuntime = {
  sha256: async (bytes): Promise<AssetPackSha256> => `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  decodeUtf8Fatal: (bytes) => new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  encodeUtf8: (value) => new TextEncoder().encode(value),
  inflateRawBounded: async ({ compressed, declaredSize, maximumSize }) => {
    const output = inflateRawSync(Buffer.from(compressed), { maxOutputLength: maximumSize });
    if (output.byteLength !== declaredSize) throw new Error('Raw DEFLATE output length does not match its declaration.');
    return new Uint8Array(output);
  },
};
