import type { CanvasAdapter } from './adapters.js';
import { ANIMATION_CONFIGS, FRAME_SIZE, SHEET_WIDTH } from './constants.js';
import type {
  AnimationName,
  ComposedAnimation,
  ComposedSheet,
} from './types.js';

export interface ExtractAnimationOptions {
  readonly adapter: CanvasAdapter;
}

/**
 * Crop one animation's row group out of a composed master sheet.
 *
 * Mirrors upstream `extractAnimationFromCanvas` (renderer.ts): the source
 * region is the full sheet width (832) and `config.num * 64` rows starting
 * at `config.row * 64`; columns are not tight-cropped (unused frame
 * columns stay transparent). `name` is a logical animation name
 * (`ANIMATION_CONFIGS` namespace, symmetric with `ComposedSheet.animations`).
 *
 * Throws if `name` is not a known animation. A known animation that was
 * not actually composed yields a valid, fully-transparent crop — extract
 * keys purely off `ANIMATION_CONFIGS`, independent of `sheet.animations`
 * (so e.g. `watering`, which shares the thrust rows, is extractable).
 */
export function extractAnimation(
  sheet: ComposedSheet,
  name: AnimationName,
  options: ExtractAnimationOptions,
): ComposedAnimation {
  const config = ANIMATION_CONFIGS[name];
  if (!config) {
    throw new Error(
      `extractAnimation: unknown animation "${name}". Known: ${Object.keys(
        ANIMATION_CONFIGS,
      ).join(', ')}`,
    );
  }

  const { row, num, cycle } = config;
  const srcY = row * FRAME_SIZE;
  const srcHeight = num * FRAME_SIZE;

  const canvas = options.adapter.createCanvas(SHEET_WIDTH, srcHeight);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    sheet.canvas,
    0,
    srcY,
    SHEET_WIDTH,
    srcHeight,
    0,
    0,
    SHEET_WIDTH,
    srcHeight,
  );

  return {
    canvas,
    width: SHEET_WIDTH,
    height: srcHeight,
    animation: name,
    frameCount: cycle.length,
    directions: num,
    credits: sheet.credits,
  };
}
