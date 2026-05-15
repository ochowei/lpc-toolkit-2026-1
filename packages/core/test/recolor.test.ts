import { describe, expect, it } from 'vitest';
import { recolorImage, recolorPixels, type PaletteSwap } from '../src/recolor.js';
import type { CanvasLike } from '../src/adapters.js';
import {
  createNodeCanvasAdapter,
  makeImage,
  solidImage,
} from './helpers/node-canvas-adapter.js';

function readPixels(canvas: CanvasLike): Uint8ClampedArray {
  const { data } = canvas
    .getContext('2d')
    .getImageData(0, 0, canvas.width, canvas.height);
  return data;
}

function everyPixelEquals(
  data: Uint8ClampedArray,
  rgba: readonly [number, number, number, number],
): boolean {
  for (let i = 0; i < data.length; i += 4) {
    if (
      data[i] !== rgba[0] ||
      data[i + 1] !== rgba[1] ||
      data[i + 2] !== rgba[2] ||
      data[i + 3] !== rgba[3]
    ) {
      return false;
    }
  }
  return true;
}

function pixel(
  r: number,
  g: number,
  b: number,
  a: number,
): Uint8ClampedArray {
  return new Uint8ClampedArray([r, g, b, a]);
}

describe('recolorPixels', () => {
  it('swaps a single color exactly', () => {
    const swap: PaletteSwap = {
      material: 'body',
      source: ['#000000'],
      target: ['#ff0000'],
    };
    const out = recolorPixels(pixel(0, 0, 0, 255), swap);
    expect(Array.from(out)).toEqual([255, 0, 0, 255]);
  });

  it('preserves alpha when swapping color', () => {
    const swap: PaletteSwap = {
      material: 'body',
      source: ['#112233'],
      target: ['#ffeedd'],
    };
    const out = recolorPixels(pixel(0x11, 0x22, 0x33, 0x80), swap);
    expect(Array.from(out)).toEqual([0xff, 0xee, 0xdd, 0x80]);
  });

  it('leaves non-matching pixels unchanged', () => {
    const swap: PaletteSwap = {
      material: 'body',
      source: ['#000000'],
      target: ['#ff0000'],
    };
    const out = recolorPixels(pixel(0x77, 0x88, 0x99, 0xff), swap);
    expect(Array.from(out)).toEqual([0x77, 0x88, 0x99, 0xff]);
  });

  it('skips fully transparent pixels (alpha=0) without applying swap', () => {
    const swap: PaletteSwap = {
      material: 'body',
      source: ['#000000'],
      target: ['#ff0000'],
    };
    const out = recolorPixels(pixel(0, 0, 0, 0), swap);
    expect(Array.from(out)).toEqual([0, 0, 0, 0]);
  });

  it('matches within tolerance ±1', () => {
    const swap: PaletteSwap = {
      material: 'body',
      source: ['#808080'],
      target: ['#00ff00'],
    };
    const out = recolorPixels(pixel(0x7f, 0x80, 0x81, 0xff), swap);
    expect(Array.from(out)).toEqual([0x00, 0xff, 0x00, 0xff]);
  });

  it('does not match outside tolerance', () => {
    const swap: PaletteSwap = {
      material: 'body',
      source: ['#808080'],
      target: ['#00ff00'],
    };
    const out = recolorPixels(pixel(0x82, 0x80, 0x80, 0xff), swap);
    expect(Array.from(out)).toEqual([0x82, 0x80, 0x80, 0xff]);
  });

  it('handles multi-pair palette', () => {
    const swap: PaletteSwap = {
      material: 'hair',
      source: ['#100000', '#200000', '#300000'],
      target: ['#001000', '#002000', '#003000'],
    };
    const buf = new Uint8ClampedArray([
      0x10, 0x00, 0x00, 0xff,
      0x20, 0x00, 0x00, 0xff,
      0x30, 0x00, 0x00, 0xff,
      0xff, 0xff, 0xff, 0xff,
    ]);
    const out = recolorPixels(buf, swap);
    expect(Array.from(out)).toEqual([
      0x00, 0x10, 0x00, 0xff,
      0x00, 0x20, 0x00, 0xff,
      0x00, 0x30, 0x00, 0xff,
      0xff, 0xff, 0xff, 0xff,
    ]);
  });

  it('does not mutate the input buffer', () => {
    const swap: PaletteSwap = {
      material: 'body',
      source: ['#000000'],
      target: ['#ff0000'],
    };
    const input = pixel(0, 0, 0, 255);
    const out = recolorPixels(input, swap);
    expect(out).not.toBe(input);
    expect(Array.from(input)).toEqual([0, 0, 0, 255]);
  });

  it('throws when source/target palette lengths mismatch', () => {
    const swap: PaletteSwap = {
      material: 'body',
      source: ['#000000', '#111111'],
      target: ['#ff0000'],
    };
    expect(() => recolorPixels(pixel(0, 0, 0, 255), swap)).toThrow(
      /length mismatch/,
    );
  });

  it('throws when buffer length is not a multiple of 4', () => {
    const swap: PaletteSwap = {
      material: 'body',
      source: ['#000000'],
      target: ['#ff0000'],
    };
    expect(() =>
      recolorPixels(new Uint8ClampedArray([0, 0, 0]), swap),
    ).toThrow(/multiple of 4/);
  });

  it('returns input copy when palette has no valid hex pairs', () => {
    const swap: PaletteSwap = {
      material: 'body',
      source: ['nothex'],
      target: ['alsobad'],
    };
    const out = recolorPixels(pixel(0, 0, 0, 255), swap);
    expect(Array.from(out)).toEqual([0, 0, 0, 255]);
  });
});

describe('recolorImage (real @napi-rs/canvas adapter)', () => {
  const adapter = createNodeCanvasAdapter();

  it('recolors a real 8x8 red image entirely to blue', () => {
    const image = solidImage(8, 8, '#ff0000');
    const swap: PaletteSwap = {
      material: 'body',
      source: ['#ff0000'],
      target: ['#0000ff'],
    };

    const out = recolorImage(image, swap, { adapter });

    expect(out.width).toBe(8);
    expect(out.height).toBe(8);
    expect(everyPixelEquals(readPixels(out), [0, 0, 255, 255])).toBe(true);
  });

  it('does not modify fully transparent (alpha=0) pixels', () => {
    // An unpainted canvas is (0,0,0,0) everywhere. Source #000000 matches
    // the RGB, but alpha=0 must make recolorPixels skip it.
    const image = makeImage(4, 4, () => {});
    const swap: PaletteSwap = {
      material: 'body',
      source: ['#000000'],
      target: ['#ff0000'],
    };

    const out = recolorImage(image, swap, { adapter });

    expect(everyPixelEquals(readPixels(out), [0, 0, 0, 0])).toBe(true);
  });

  it('leaves pixels not in the source palette untouched', () => {
    const image = solidImage(6, 6, '#77ff88');
    const swap: PaletteSwap = {
      material: 'body',
      source: ['#ff0000'],
      target: ['#0000ff'],
    };

    const out = recolorImage(image, swap, { adapter });

    expect(everyPixelEquals(readPixels(out), [0x77, 0xff, 0x88, 0xff])).toBe(
      true,
    );
  });

  it('recolors only matching pixels in a mixed image', () => {
    // Top half red (in palette), bottom half green (not in palette).
    const image = makeImage(4, 4, (ctx) => {
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 4, 2);
      ctx.fillStyle = '#00cc44';
      ctx.fillRect(0, 2, 4, 2);
    });
    const swap: PaletteSwap = {
      material: 'body',
      source: ['#ff0000'],
      target: ['#0000ff'],
    };

    const data = readPixels(recolorImage(image, swap, { adapter }));
    const rowStride = 4 * 4;

    // Rows 0..1 → blue
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 4; x++) {
        const i = y * rowStride + x * 4;
        expect([data[i], data[i + 1], data[i + 2], data[i + 3]]).toEqual([
          0, 0, 255, 255,
        ]);
      }
    }
    // Rows 2..3 → unchanged green
    for (let y = 2; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const i = y * rowStride + x * 4;
        expect([data[i], data[i + 1], data[i + 2], data[i + 3]]).toEqual([
          0x00, 0xcc, 0x44, 0xff,
        ]);
      }
    }
  });

  it('returns a fresh canvas and does not mutate the source image', () => {
    const image = solidImage(8, 8, '#ff0000');
    const swap: PaletteSwap = {
      material: 'body',
      source: ['#ff0000'],
      target: ['#0000ff'],
    };

    const out = recolorImage(image, swap, { adapter });

    // Source must still be readable as red (recolor wrote to a new canvas).
    expect(
      everyPixelEquals(readPixels(image as CanvasLike), [255, 0, 0, 255]),
    ).toBe(true);
    expect(out).not.toBe(image);
  });
});
