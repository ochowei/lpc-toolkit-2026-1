import { describe, expect, it } from 'vitest';
import { describeAnimationPlayback } from '../src/animation-playback.js';

describe('describeAnimationPlayback', () => {
  it('describes standard animations in composed order', () => {
    expect(describeAnimationPlayback({
      animations: ['walk', 'hurt'],
      customAnimations: undefined,
    })).toEqual([
      {
        animation: 'walk', kind: 'standard', sourceX: 0, sourceY: 8 * 64,
        frameSize: 64, cycle: [1, 2, 3, 4, 5, 6, 7, 8], directions: 4,
      },
      {
        animation: 'hurt', kind: 'standard', sourceX: 0, sourceY: 20 * 64,
        frameSize: 64, cycle: [0, 1, 2, 3, 4, 5], directions: 1,
      },
    ]);
  });

  it('rejects an unknown standard animation instead of guessing a layout', () => {
    expect(() => describeAnimationPlayback({
      animations: ['not-real'],
      customAnimations: undefined,
    })).toThrow('Unknown composed animation: not-real');
  });

  it('appends custom regions in encounter order with sequential cycles', () => {
    expect(describeAnimationPlayback({
      animations: ['walk', 'walk'],
      customAnimations: new Map([
        ['tool_rod', { offsetY: 3456, frameSize: 128, rows: 4, cols: 13 }],
        ['portrait_blink', { offsetY: 3968, frameSize: 32, rows: 1, cols: 2 }],
      ]),
    })).toEqual([
      expect.objectContaining({ animation: 'walk' }),
      {
        animation: 'tool_rod', kind: 'custom', sourceX: 0, sourceY: 3456,
        frameSize: 128, cycle: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        directions: 4,
      },
      {
        animation: 'portrait_blink', kind: 'custom', sourceX: 0, sourceY: 3968,
        frameSize: 32, cycle: [0, 1], directions: 1,
      },
    ]);
  });

  it('keeps a standard name once when a custom map collides', () => {
    const descriptors = describeAnimationPlayback({
      animations: ['walk'],
      customAnimations: new Map([
        ['walk', { offsetY: 4000, frameSize: 64, rows: 4, cols: 2 }],
      ]),
    });
    expect(descriptors.map(({ animation }) => animation)).toEqual(['walk']);
  });
});
