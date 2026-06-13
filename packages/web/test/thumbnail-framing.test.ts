import { describe, expect, it } from 'vitest';
import {
  computeThumbnailDrawRect,
  createThumbnailDrawPlan,
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

describe('createThumbnailDrawPlan', () => {
  it('uses runtime bounds and the configured type scale', () => {
    expect(createThumbnailDrawPlan({
      bounds: { x: 24, y: 28, width: 16, height: 8 },
      frameSize: 64,
      outputSize: 24,
      scale: 2,
    })).toEqual({
      dx: -12,
      dy: -12,
      dWidth: 48,
      dHeight: 48,
    });
  });

  it('falls back to full-frame drawing without usable bounds', () => {
    expect(createThumbnailDrawPlan({
      bounds: null,
      frameSize: 64,
      outputSize: 24,
      scale: 3,
    })).toEqual({
      dx: 0,
      dy: 0,
      dWidth: 24,
      dHeight: 24,
    });
  });
});

