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
  void image;
  void swap;
  void options;
  throw new Error('not implemented');
}

export function recolorPixels(
  pixels: Uint8ClampedArray,
  swap: PaletteSwap,
): Uint8ClampedArray {
  void pixels;
  void swap;
  throw new Error('not implemented');
}
