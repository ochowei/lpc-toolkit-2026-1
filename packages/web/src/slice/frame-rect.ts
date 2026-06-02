import {
  DIRECTIONS,
  FRAME_SIZE,
  type AnimationConfig,
  type Direction,
} from '@lpc-toolkit/core';

/** Source rectangle for copying one 64px playback frame out of an animation canvas. */
export interface FrameRect {
  readonly sx: number;
  readonly sy: number;
  readonly size: number;
}

/**
 * Source rectangle (within an extracted ComposedAnimation canvas) for one
 * playback frame. Column = cycle[frameIndex % cycle.length]; row = direction
 * index, clamped to row 0 when the animation has a single directional row.
 * Caller must pass `frameIndex >= 0`; negative values fall through to
 * column 0 (JS `%` is sign-preserving).
 */
export function frameRect(
  config: AnimationConfig,
  directions: 1 | 4,
  dir: Direction,
  frameIndex: number,
): FrameRect {
  const col = config.cycle[frameIndex % config.cycle.length] ?? 0;
  const rowIndex = directions === 1 ? 0 : Math.max(0, DIRECTIONS.indexOf(dir));
  return { sx: col * FRAME_SIZE, sy: rowIndex * FRAME_SIZE, size: FRAME_SIZE };
}
