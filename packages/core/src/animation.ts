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
 * Crop one animation out of a composed master sheet.
 *
 * Standard animations (`ANIMATION_CONFIGS`) mirror upstream
 * `extractAnimationFromCanvas`: full sheet width (832) and `config.num*64`
 * rows starting at `config.row*64`; columns are not tight-cropped (unused
 * frame columns stay transparent). A known standard animation that was not
 * actually composed yields a valid, fully-transparent crop (Step 3.3 Q4).
 *
 * Custom animations (wheelchair / `tool_rod` / …) live in variable-height
 * blocks below the standard sheet; their geometry is on
 * `sheet.customAnimations` (Step 3.4 Q3). They are tight-cropped to the
 * block's own `cols*frameSize × rows*frameSize` at `(0, offsetY)` (N4),
 * with `directions = rows`, `frameCount = cols`.
 *
 * Lookup order is standard → this sheet's custom blocks; only a name in
 * neither throws (refines Step 3.3 Q3 — not an override). `name` shares the
 * `ComposedSheet.animations` / `customAnimations`-key namespace.
 */
export function extractAnimation(
  sheet: ComposedSheet,
  name: AnimationName,
  options: ExtractAnimationOptions,
): ComposedAnimation {
  const config = ANIMATION_CONFIGS[name];
  if (config) {
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

  const region = sheet.customAnimations?.get(name);
  if (region) {
    const { offsetY, frameSize, rows, cols } = region;
    const width = cols * frameSize;
    const height = rows * frameSize;

    const canvas = options.adapter.createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(
      sheet.canvas,
      0,
      offsetY,
      width,
      height,
      0,
      0,
      width,
      height,
    );

    return {
      canvas,
      width,
      height,
      animation: name,
      // All known custom definitions have 4 directional rows; the ternary
      // keeps the `1 | 4` type without a cast for the degenerate 1-row case.
      frameCount: cols,
      directions: rows === 1 ? 1 : 4,
      credits: sheet.credits,
    };
  }

  const known = [
    ...Object.keys(ANIMATION_CONFIGS),
    ...(sheet.customAnimations ? [...sheet.customAnimations.keys()] : []),
  ];
  throw new Error(
    `extractAnimation: unknown animation "${name}". Known: ${known.join(', ')}`,
  );
}
