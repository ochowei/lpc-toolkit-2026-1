import { describe, expect, it } from 'vitest';
import {
  computeThumbnailDrawRect,
  findAlphaBounds,
} from '../src/lib/thumbnail-framing';

function rgba(
  width: number,
  height: number,
  visible: readonly (readonly [number, number])[],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of visible) {
    data[(y * width + x) * 4 + 3] = 255;
  }
  return data;
}

describe('findAlphaBounds', () => {
  it('returns null for a transparent frame', () => {
    expect(findAlphaBounds(rgba(4, 4, []), 4, 4)).toBeNull();
  });

  it('includes disconnected alpha-positive pixels', () => {
    expect(findAlphaBounds(rgba(4, 4, [[0, 1], [3, 2]]), 4, 4)).toEqual({
      x: 0,
      y: 1,
      width: 4,
      height: 2,
    });
  });
});

describe('computeThumbnailDrawRect', () => {
  it('centers the visible bounds while preserving the type scale', () => {
    expect(computeThumbnailDrawRect(
      { x: 24, y: 28, width: 16, height: 8 },
      64,
      24,
      2,
    )).toEqual({
      dx: -12,
      dy: -12,
      dWidth: 48,
      dHeight: 48,
    });
  });
});
