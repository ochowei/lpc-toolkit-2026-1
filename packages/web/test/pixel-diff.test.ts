import { describe, expect, it } from 'vitest';
import { diffRgba } from '../e2e/helpers/pixel-diff';

describe('diffRgba', () => {
  it('reports no mismatches for equal buffers', () => {
    const actual = new Uint8ClampedArray([0, 1, 2, 3, 4, 5, 6, 7]);
    const expected = new Uint8ClampedArray([0, 1, 2, 3, 4, 5, 6, 7]);

    expect(diffRgba(actual, expected, 1, 2)).toEqual({
      mismatchCount: 0,
      samples: [],
    });
  });

  it('reports mismatch count and sample coordinates', () => {
    const actual = new Uint8ClampedArray([0, 0, 0, 0, 9, 9, 9, 9]);
    const expected = new Uint8ClampedArray([0, 0, 0, 0, 1, 1, 1, 1]);

    expect(diffRgba(actual, expected, 2, 1)).toEqual({
      mismatchCount: 1,
      samples: [
        {
          x: 1,
          y: 0,
          actual: [9, 9, 9, 9],
          expected: [1, 1, 1, 1],
        },
      ],
    });
  });
});
