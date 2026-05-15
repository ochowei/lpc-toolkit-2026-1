import type { CanvasAdapter, CanvasLike, ImageLike } from './adapters.js';

export type ColorHex = string;

export type Palette = readonly ColorHex[];

export interface PaletteSwap {
  readonly material: string;
  readonly source: Palette;
  readonly target: Palette;
}

export interface RecolorOptions {
  readonly adapter: CanvasAdapter;
}

export function recolorImage(
  image: ImageLike,
  swap: PaletteSwap,
  options: RecolorOptions,
): CanvasLike {
  const { adapter } = options;
  const { width, height } = image;
  const canvas = adapter.createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  const newPixels = recolorPixels(imageData.data, swap);
  // `imageData.data` is `readonly` only at the field level — the backing
  // buffer is still mutable. `recolorPixels` is non-mutating (returns a
  // fresh buffer), so copy it back in place and put the same object.
  imageData.data.set(newPixels);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

interface ColorPair {
  readonly source: Rgb;
  readonly target: Rgb;
}

const HEX_RE = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;

function hexToRgb(hex: ColorHex): Rgb | null {
  const m = HEX_RE.exec(hex);
  if (!m) return null;
  return {
    r: parseInt(m[1]!, 16),
    g: parseInt(m[2]!, 16),
    b: parseInt(m[3]!, 16),
  };
}

function buildColorPairs(swap: PaletteSwap): ColorPair[] {
  const { source, target } = swap;
  if (source.length !== target.length) {
    throw new Error(
      `recolorPixels: PaletteSwap source/target length mismatch (${source.length} vs ${target.length})`,
    );
  }
  const pairs: ColorPair[] = [];
  for (let i = 0; i < source.length; i++) {
    const s = hexToRgb(source[i]!);
    const t = hexToRgb(target[i]!);
    if (s && t) pairs.push({ source: s, target: t });
  }
  return pairs;
}

// Tolerance=1 mirrors upstream CPU recolor (~0.004 * 255), tolerating ±1 rounding.
const TOLERANCE = 1;

export function recolorPixels(
  pixels: Uint8ClampedArray,
  swap: PaletteSwap,
): Uint8ClampedArray {
  if (pixels.length % 4 !== 0) {
    throw new Error(
      `recolorPixels: pixel buffer length ${pixels.length} is not a multiple of 4 (RGBA)`,
    );
  }
  const out = new Uint8ClampedArray(pixels);
  const pairs = buildColorPairs(swap);
  if (pairs.length === 0) return out;

  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3]!;
    if (a === 0) continue;
    const r = out[i]!;
    const g = out[i + 1]!;
    const b = out[i + 2]!;
    for (const { source, target } of pairs) {
      if (
        Math.abs(r - source.r) <= TOLERANCE &&
        Math.abs(g - source.g) <= TOLERANCE &&
        Math.abs(b - source.b) <= TOLERANCE
      ) {
        out[i] = target.r;
        out[i + 1] = target.g;
        out[i + 2] = target.b;
        break;
      }
    }
  }
  return out;
}
