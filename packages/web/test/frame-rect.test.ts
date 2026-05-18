import { describe, expect, it } from 'vitest';
import { ANIMATION_CONFIGS } from '@lpc-toolkit/core';
import { frameRect } from '../src/slice/frame-rect';

describe('frameRect', () => {
  it('maps a 4-dir walk frame to the right source cell', () => {
    // walk.cycle = [1,2,3,4,5,6,7,8]; DIRECTIONS index of 'down' = 2.
    const r = frameRect(ANIMATION_CONFIGS['walk']!, 4, 'down', 0);
    expect(r).toEqual({ sx: 1 * 64, sy: 2 * 64, size: 64 });
  });

  it('clamps to row 0 for single-direction animations', () => {
    const r = frameRect(ANIMATION_CONFIGS['hurt']!, 1, 'right', 2);
    // hurt.cycle = [0,1,2,3,4,5]; directions=1 => row 0.
    expect(r).toEqual({ sx: 2 * 64, sy: 0, size: 64 });
  });

  it('wraps frameIndex past the cycle length', () => {
    const cfg = ANIMATION_CONFIGS['walk']!; // length 8
    expect(frameRect(cfg, 4, 'up', 8)).toEqual(
      frameRect(cfg, 4, 'up', 0),
    );
  });
});
