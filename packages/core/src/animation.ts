import type { CanvasAdapter } from './adapters.js';
import { ANIMATION_CONFIGS, FRAME_SIZE, SHEET_WIDTH } from './constants.js';
import type {
  AnimationName,
  ComposedAnimation,
  ComposedSheet,
} from './types.js';

/**
 * Options configuring the animation cropping process.
 */
export interface ExtractAnimationOptions {
  /** Canvas adapter utilized to create Canvas elements for the cropped animation. */
  readonly adapter: CanvasAdapter;
}

/**
 * Crops one specific logical animation block out of the composed master sheet.
 *
 * This function supports two layouts:
 *
 * 1. Standard Animations (`ANIMATION_CONFIGS`):
 *    - Row Indexing: Maps to a pre-defined standard row offset. The vertical start offset
 *      `srcY` on the master canvas is computed as: `config.row * FRAME_SIZE` (64px).
 *    - Frame Interval Slices: Spans the full width of the standard sheet (`SHEET_WIDTH` = 832px),
 *      which contains up to 13 frames per row. Unused frames remain transparent.
 *    - Direction Coordinates: Spans `config.num` rows, where each row represents one direction
 *      coordinate: north, west, south, east. The vertical height is `num * FRAME_SIZE`.
 *
 * 2. Custom Animations (Wheelchair, Riding, Oversized swings):
 *    - Row Indexing: Located in the dynamically allocated region below the standard sheet (Y >= 3456).
 *      Uses the block's `offsetY` coordinate.
 *    - Frame Interval Slices: Tight-crops the horizontal layout to precisely the custom animation's
 *      columns count: `width = cols * frameSize`. This avoids unnecessary transparent padding on the right.
 *    - Direction Coordinates: Crops precisely the active directional rows: `height = rows * frameSize`.
 *      The number of directions is mapped to `rows` (usually 4 rows).
 *
 * @param sheet The ComposedSheet master canvas to crop from.
 * @param name The logical name of the animation (e.g., "walk", "spellcast", "wheelchair").
 * @param options Configuration options including the canvas adapter.
 * @returns A ComposedAnimation containing the cropped canvas and metadata.
 */
export function extractAnimation(
  sheet: ComposedSheet,
  name: AnimationName,
  options: ExtractAnimationOptions,
): ComposedAnimation {
  const config = ANIMATION_CONFIGS[name];
  if (config) {
    // --- Standard Animation Path ---
    const { row, num, cycle } = config;
    const srcY = row * FRAME_SIZE;
    const srcHeight = num * FRAME_SIZE;

    // Standard animation crops always span the full sheet width (832px)
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
    // --- Custom Animation Path (Tight-cropping) ---
    const { offsetY, frameSize, rows, cols } = region;
    const width = cols * frameSize;
    const height = rows * frameSize;

    // Tight-crops the canvas to fit exactly the columns and rows count of this custom animation
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

  // Handle errors for unknown animation requests
  const known = [
    ...Object.keys(ANIMATION_CONFIGS),
    ...(sheet.customAnimations ? [...sheet.customAnimations.keys()] : []),
  ];
  throw new Error(
    `extractAnimation: unknown animation "${name}". Known: ${known.join(', ')}`,
  );
}
