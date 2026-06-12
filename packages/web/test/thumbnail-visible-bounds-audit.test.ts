import { describe, expect, it } from 'vitest';
import {
  deriveThumbnailMetrics,
  findAlphaBounds,
} from '../scripts/thumbnail-visible-bounds-audit-lib';

function rgba(width: number, height: number, visible: readonly [number, number][]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of visible) data[(y * width + x) * 4 + 3] = 255;
  return data;
}

describe('findAlphaBounds', () => {
  it('returns null for a transparent frame', () => {
    expect(findAlphaBounds(rgba(4, 4, []), 4, 4)).toBeNull();
  });

  it('returns inclusive bounds for visible pixels touching frame edges', () => {
    expect(findAlphaBounds(rgba(4, 4, [[0, 1], [3, 2]]), 4, 4)).toEqual({
      x: 0,
      y: 1,
      width: 4,
      height: 2,
    });
  });
});

describe('deriveThumbnailMetrics', () => {
  it('calculates current visible size and two-pixel-margin fit scale', () => {
    expect(deriveThumbnailMetrics({ x: 10, y: 8, width: 16, height: 8 }, 64))
      .toEqual({
        widthRatio: 0.25,
        heightRatio: 0.125,
        visibleWidthAt24: 6,
        visibleHeightAt24: 3,
        fitScalePxPerSourcePixel: 1.25,
        additionalScaleOverCurrent: 10 / 3,
      });
  });
});
