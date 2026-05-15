import { describe, expect, it } from 'vitest';
import { recolorPixels, type PaletteSwap } from '../src/recolor.js';

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
