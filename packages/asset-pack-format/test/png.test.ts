import { describe, expect, it, vi } from 'vitest';
import {
  ASSET_PACK_SCHEMA,
  normalizeAssetPack,
  standardAnimationGeometry,
  type AnimationName,
  type AssetPackSource,
} from '@lpc-toolkit/core';
import {
  inspectAssetPackSourceBytes,
  type AssetPackPngDecoder,
} from '../src/index.js';

const PACK_CREDITS = {
  authors: ['Alice'],
  licenses: ['CC-BY-SA 4.0'],
  urls: ['https://example.com/alice'],
  notes: '',
} as const;

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_IHDR_LENGTH = 13;

function packFixture(
  sprites: readonly {
    readonly animation: AnimationName;
    readonly source: string;
    readonly bodyTypes?: readonly ('male' | 'female')[];
  }[],
  overrides?: Partial<AssetPackSource>,
) {
  return normalizeAssetPack({
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
      animations: [...new Set(sprites.map((sprite) => sprite.animation))],
      recolor: { material: 'hair', palettes: ['ulpc'] },
      layers: [{
        id: 'foreground',
        zPos: 120,
        sprites: sprites.map((sprite) => ({
          animation: sprite.animation,
          source: sprite.source,
          ...(sprite.bodyTypes ? { bodyTypes: sprite.bodyTypes } : {}),
        })),
      }],
    }],
    ...overrides,
  });
}

function geometryBounds(animation: AnimationName): { width: number; height: number } {
  const geometry = standardAnimationGeometry(animation);
  const maxColumn = Math.max(
    ...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)),
  );
  return {
    width: (maxColumn + 1) * geometry.frameSize,
    height: geometry.rows.length * geometry.frameSize,
  };
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

function minimalPngBytes(
  width: number,
  height: number,
  overrides: Partial<{
    readonly signature: Uint8Array;
    readonly ihdrLength: number;
    readonly ihdrType: string;
    readonly bitDepth: number;
    readonly colorType: number;
    readonly compression: number;
    readonly filter: number;
    readonly interlace: number;
    readonly corruptCrc: boolean;
  }> = {},
): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set(overrides.signature ?? PNG_SIGNATURE, 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, overrides.ihdrLength ?? PNG_IHDR_LENGTH);
  const ihdrType = overrides.ihdrType ?? 'IHDR';
  for (let index = 0; index < ihdrType.length; index += 1) {
    bytes[12 + index] = ihdrType.charCodeAt(index);
  }
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = overrides.bitDepth ?? 8;
  bytes[25] = overrides.colorType ?? 6;
  bytes[26] = overrides.compression ?? 0;
  bytes[27] = overrides.filter ?? 0;
  bytes[28] = overrides.interlace ?? 0;
  view.setUint32(29, crc32(bytes.subarray(12, 29)));
  if (overrides.corruptCrc) {
    view.setUint32(29, (view.getUint32(29) ^ 0xffff_ffff) >>> 0);
  }
  return bytes;
}

function createDigestMap(sourceBytes: ReadonlyMap<string, Uint8Array>): ReadonlyMap<string, `sha256:${string}`> {
  return new Map(
    [...sourceBytes.keys()].map((sourcePath, index) => [sourcePath, `sha256:${String(index + 1).padStart(64, '0')}`]),
  );
}

function coloredCellPixels(
  animation: AnimationName,
  colorsByCell: Readonly<Record<string, string>>,
): Uint8ClampedArray {
  const geometry = standardAnimationGeometry(animation);
  const bounds = geometryBounds(animation);
  const pixels = new Uint8ClampedArray(bounds.width * bounds.height * 4);

  for (const [cell, color] of Object.entries(colorsByCell)) {
    const match = /^#([0-9a-f]{6})$/iu.exec(color);
    if (!match?.[1]) throw new Error(`Invalid test color ${color}`);
    const red = Number.parseInt(match[1].slice(0, 2), 16);
    const green = Number.parseInt(match[1].slice(2, 4), 16);
    const blue = Number.parseInt(match[1].slice(4, 6), 16);
    const [rowText, columnText] = cell.split(':');
    const row = Number(rowText);
    const column = Number(columnText);
    const startX = column * geometry.frameSize;
    const startY = row * geometry.frameSize;
    for (let y = startY; y < startY + geometry.frameSize; y += 1) {
      for (let x = startX; x < startX + geometry.frameSize; x += 1) {
        const offset = (y * bounds.width + x) * 4;
        pixels[offset] = red;
        pixels[offset + 1] = green;
        pixels[offset + 2] = blue;
        pixels[offset + 3] = 255;
      }
    }
  }

  return pixels;
}

describe('inspectAssetPackSourceBytes', () => {
  it.each([
    ['bad signature', () => minimalPngBytes(384, 64, { signature: Uint8Array.from([0]) })],
    ['bad IHDR length', () => minimalPngBytes(384, 64, { ihdrLength: 12 })],
    ['bad IHDR type', () => minimalPngBytes(384, 64, { ihdrType: 'IDAT' })],
    ['bad IHDR CRC', () => minimalPngBytes(384, 64, { corruptCrc: true })],
    ['zero width', () => minimalPngBytes(0, 64)],
    ['oversized width', () => minimalPngBytes(0x8000_0000, 64)],
    ['invalid bit-depth/color-type pair', () => minimalPngBytes(384, 64, { bitDepth: 4, colorType: 6 })],
    ['invalid compression', () => minimalPngBytes(384, 64, { compression: 1 })],
    ['invalid filter', () => minimalPngBytes(384, 64, { filter: 1 })],
    ['invalid interlace', () => minimalPngBytes(384, 64, { interlace: 2 })],
  ])('rejects malformed IHDR for %s without calling the decoder', async (_label, buildBytes) => {
    const pack = packFixture([{ animation: 'climb', source: 'sprites/wind-braid/climb.png' }]);
    const sourceBytes = new Map([['sprites/wind-braid/climb.png', buildBytes()]]);
    const decoder: AssetPackPngDecoder = {
      decode: vi.fn(async () => ({
        width: 384,
        height: 64,
        pixels: new Uint8ClampedArray(384 * 64 * 4),
      })),
    };

    const inspections = await inspectAssetPackSourceBytes({
      pack,
      sourceBytes,
      sourceDigests: createDigestMap(sourceBytes),
      decoder,
    });

    expect(inspections).toEqual([expect.objectContaining({
      sourcePath: 'sprites/wind-braid/climb.png',
      regularFile: true,
      error: 'decode-failed',
    })]);
    expect(decoder.decode).not.toHaveBeenCalled();
  });

  it('returns dimensions without decoding when the declared geometry does not match the source use', async () => {
    const pack = packFixture([{ animation: 'climb', source: 'sprites/wind-braid/climb.png' }]);
    const sourceBytes = new Map([[
      'sprites/wind-braid/climb.png',
      minimalPngBytes(512, 64),
    ]]);
    const decoder: AssetPackPngDecoder = {
      decode: vi.fn(async () => ({
        width: 512,
        height: 64,
        pixels: new Uint8ClampedArray(512 * 64 * 4),
      })),
    };

    const inspections = await inspectAssetPackSourceBytes({
      pack,
      sourceBytes,
      sourceDigests: createDigestMap(sourceBytes),
      decoder,
    });

    expect(inspections).toEqual([{
      sourcePath: 'sprites/wind-braid/climb.png',
      digest: 'sha256:0000000000000000000000000000000000000000000000000000000000000001',
      regularFile: true,
      decoded: {
        width: 512,
        height: 64,
        nonTransparentCells: [],
        paletteColors: [],
      },
    }]);
    expect(decoder.decode).not.toHaveBeenCalled();
  });

  it('decodes exact geometry once and reports sorted non-transparent cells plus lowercase palette colors', async () => {
    const pack = packFixture([{ animation: 'climb', source: 'sprites/wind-braid/climb.png' }]);
    const bounds = geometryBounds('climb');
    const sourceBytes = new Map([[
      'sprites/wind-braid/climb.png',
      minimalPngBytes(bounds.width, bounds.height),
    ]]);
    const decoder: AssetPackPngDecoder = {
      decode: vi.fn(async () => ({
        width: bounds.width,
        height: bounds.height,
        pixels: coloredCellPixels('climb', {
          '0:2': '#00FF00',
          '0:1': '#FF00AA',
        }),
      })),
    };

    const inspections = await inspectAssetPackSourceBytes({
      pack,
      sourceBytes,
      sourceDigests: createDigestMap(sourceBytes),
      decoder,
    });

    expect(inspections).toEqual([{
      sourcePath: 'sprites/wind-braid/climb.png',
      digest: 'sha256:0000000000000000000000000000000000000000000000000000000000000001',
      regularFile: true,
      decoded: {
        width: bounds.width,
        height: bounds.height,
        nonTransparentCells: ['0:1', '0:2'],
        paletteColors: ['#00ff00', '#ff00aa'],
      },
    }]);
    expect(decoder.decode).toHaveBeenCalledTimes(1);
  });

  it('treats same-source multi-use geometry as incompatible when same-bounds declared uses do not share one exact layout', async () => {
    const slashBounds = geometryBounds('slash');
    const pack = packFixture([
      { animation: 'slash', source: 'sprites/wind-braid/shared.png' },
      { animation: 'watering', source: 'sprites/wind-braid/shared.png' },
    ]);
    const sourceBytes = new Map([[
      'sprites/wind-braid/shared.png',
      minimalPngBytes(slashBounds.width, slashBounds.height),
    ]]);
    const decoder: AssetPackPngDecoder = {
      decode: vi.fn(async () => ({
        width: slashBounds.width,
        height: slashBounds.height,
        pixels: new Uint8ClampedArray(slashBounds.width * slashBounds.height * 4),
      })),
    };

    const inspections = await inspectAssetPackSourceBytes({
      pack,
      sourceBytes,
      sourceDigests: createDigestMap(sourceBytes),
      decoder,
    });

    expect(inspections).toEqual([{
      sourcePath: 'sprites/wind-braid/shared.png',
      digest: 'sha256:0000000000000000000000000000000000000000000000000000000000000001',
      regularFile: true,
      decoded: {
        width: slashBounds.width,
        height: slashBounds.height,
        nonTransparentCells: [],
        paletteColors: [],
      },
    }]);
    expect(decoder.decode).not.toHaveBeenCalled();
  });
});
