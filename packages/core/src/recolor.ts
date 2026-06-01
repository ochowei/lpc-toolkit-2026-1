import type { CanvasAdapter, CanvasLike, ImageLike } from './adapters.js';

/** Represents a hexadecimal color string (e.g., "#ff0000" or "ff0000"). */
export type ColorHex = string;

/** A list of color values forming a gradient ramp for a material. */
export type Palette = readonly ColorHex[];

/**
 * Defines a swap configuration to recolor an LPC asset from a source palette
 * to a target palette (color ramp). Used to dynamically recolor hair, eyes,
 * skin, leather, metal, and other material surfaces.
 */
export interface PaletteSwap {
  /** The material category name (e.g., "leather", "metal", "hair"). */
  readonly material: string;
  /** The original source color ramp found in the base spritesheet. */
  readonly source: Palette;
  /** The new target color ramp to replace the source colors with. */
  readonly target: Palette;
}

/**
 * Options for the recoloring process.
 */
export interface RecolorOptions {
  /** Environment-agnostic canvas adapter facilitating canvas creation and image drawing. */
  readonly adapter: CanvasAdapter;
}

/**
 * Recolors a loaded sprite image dynamically using a PaletteSwap color mapping.
 *
 * This function handles environment-agnostic ImageData replacement:
 * 1. Draws the source image onto an offscreen canvas created via the CanvasAdapter.
 * 2. Extracts the low-level pixel bytes from the 2D context using `getImageData`.
 * 3. Applies the PaletteSwap substitution via `recolorPixels` directly to the byte buffer.
 * 4. Puts the modified pixels back into the context via `putImageData` and returns the canvas.
 * This guarantees environment-agnosticism (safe for both Node.js and modern browsers).
 *
 * @param image The loaded source image to recolor.
 * @param swap The PaletteSwap config containing source and target color ramps.
 * @param options Configuration options including the canvas adapter.
 * @returns A new CanvasLike element containing the recolored sprite.
 */
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
  
  // Extract pixels from the 2D context in a standard, environment-agnostic format
  const imageData = ctx.getImageData(0, 0, width, height);
  const newPixels = recolorPixels(imageData.data, swap);
  
  // `imageData.data` is `readonly` only at the field level — the backing
  // buffer is still mutable. `recolorPixels` is non-mutating (returns a
  // fresh buffer), so copy it back in place and update the canvas.
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

/** Regex to parse 6-character hex values, ignoring leading hash marks and enforcing case-insensitivity. */
const HEX_RE = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;

/**
 * Helper to convert a hexadecimal color string into RGB byte values.
 * Returns null if the color hex string is invalid.
 */
function hexToRgb(hex: ColorHex): Rgb | null {
  const m = HEX_RE.exec(hex);
  if (!m) return null;
  return {
    r: parseInt(m[1]!, 16),
    g: parseInt(m[2]!, 16),
    b: parseInt(m[3]!, 16),
  };
}

/**
 * Pairs source and target colors for efficient lookup.
 * Performs standard palette swatch alignment and color ramp mapping validation.
 * Verifies that the source and target color lists have identical length.
 */
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

/**
 * Tolerance of ±1 color byte variance to account for slight PNG color rounding
 * or scaling artifacts in modern rendering/compression pipelines.
 * Mirrors upstream CPU recolor (~0.004 * 255).
 */
const TOLERANCE = 1;

/**
 * Perform low-level pixel byte extraction and color replacement on a flat Uint8ClampedArray.
 *
 * Pixel Array Layout (RGBA):
 * The array contains 4 bytes per pixel:
 * - Index i + 0: Red channel (0 - 255)
 * - Index i + 1: Green channel (0 - 255)
 * - Index i + 2: Blue channel (0 - 255)
 * - Index i + 3: Alpha channel (0 = transparent, 255 = fully opaque)
 *
 * Performance optimizations:
 * - If the alpha channel `a` is 0 (fully transparent), we skip the pixel instantly.
 * - Compares extracted RGB values against the source palette mapping under an allowed TOLERANCE range.
 * - On a match, replaces the RGB bytes inline with the target palette color's RGB values and breaks out.
 *
 * @param pixels Flat Uint8ClampedArray representing RGBA values of the canvas image.
 * @param swap The PaletteSwap configuration mapping source colors to target colors.
 * @returns A fresh Uint8ClampedArray containing the recolored pixel bytes.
 */
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
    // Low-level pixel byte extraction
    const a = out[i + 3]!;
    if (a === 0) continue; // Skip fully transparent pixels immediately to save CPU cycles

    const r = out[i]!;
    const g = out[i + 1]!;
    const b = out[i + 2]!;

    // Perform color ramp mapping comparison
    for (const { source, target } of pairs) {
      if (
        Math.abs(r - source.r) <= TOLERANCE &&
        Math.abs(g - source.g) <= TOLERANCE &&
        Math.abs(b - source.b) <= TOLERANCE
      ) {
        // Match found! Replace the pixel bytes inline
        out[i] = target.r;
        out[i + 1] = target.g;
        out[i + 2] = target.b;
        break; // Match found, advance to the next pixel
      }
    }
  }
  return out;
}
