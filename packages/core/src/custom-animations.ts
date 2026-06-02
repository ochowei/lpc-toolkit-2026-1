/**
 * @file custom-animations.ts
 *
 * Custom-animation configuration and geometry definitions.
 * Contains definitions for non-standard layout structures (e.g., wheelchair, oversized assets)
 * and tools to compute their dynamic height/width allocations.
 *
 * Lifted from `upstream/sources/custom-animations.ts` (API.md Step 3.4 Q1 / N1).
 *
 * ## Non-Standard Layout Structures
 * Standard LPC character animations are constrained to 64x64px squares.
 * Modern/complex actions require non-standard structures:
 * 1. Wheelchair (`wheelchair`): A 64x64px layout containing 4 directional rows of 2 frames each.
 *    Renders standard `sit` base frames placed on top of a wheelchair frame.
 * 2. Oversized Swings/Whips/Thrusts (`tool_rod`, `walk_128`, `slash_oversize`, etc.):
 *    Spans 128x128px or 192x192px frames to accommodate extended weapons, poles, or whips
 *    without cropping, keeping the character centered.
 *
 * ## Dynamic Height Allocations
 * Each custom animation declares a custom `frameSize` (64, 128, 192) and a grid of `frames`.
 * During sprite composition, these custom blocks are appended below the standard 832x3456px sheet
 * sequentially. The dynamic vertical space allocated for each block is computed as:
 * `blockHeight = frameSize * rows`.
 */

export type AnimationRowsLayout = Record<string, number>;

const animationRowsLayout: AnimationRowsLayout = {
  'thrust-n': 3,
  'thrust-w': 4,
  'thrust-s': 5,
  'thrust-e': 6,
  'walk-n': 7,
  'walk-w': 8,
  'walk-s': 9,
  'walk-e': 10,
  'slash-n': 11,
  'slash-w': 12,
  'slash-s': 13,
  'slash-e': 14,
  'backslash-n': 45,
  'backslash-w': 46,
  'backslash-s': 47,
  'backslash-e': 48,
  'halfslash-n': 49,
  'halfslash-w': 50,
  'halfslash-s': 51,
  'halfslash-e': 52,
  'sit-n': 29,
  'sit-w': 30,
  'sit-s': 31,
  'sit-e': 32,
};

export interface CustomAnimationDefinition {
  frameSize: number;
  frames: string[][];
  skipFirstFrameInPreview?: boolean;
}

const customAnimations: Record<string, CustomAnimationDefinition> = {
  wheelchair: {
    frameSize: 64,
    frames: [
      ['sit-n,2', 'sit-n,2'],
      ['sit-w,2', 'sit-w,2'],
      ['sit-s,2', 'sit-s,2'],
      ['sit-e,2', 'sit-e,2'],
    ],
  },
  tool_rod: {
    frameSize: 128,
    frames: [
      [
        'thrust-n,0',
        'thrust-n,1',
        'thrust-n,2',
        'thrust-n,3',
        'thrust-n,4',
        'thrust-n,5',
        'thrust-n,4',
        'thrust-n,4',
        'thrust-n,4',
        'thrust-n,5',
        'thrust-n,4',
        'thrust-n,2',
        'thrust-n,3',
      ],
      [
        'thrust-w,0',
        'thrust-w,1',
        'thrust-w,2',
        'thrust-w,3',
        'thrust-w,4',
        'thrust-w,5',
        'thrust-w,4',
        'thrust-w,4',
        'thrust-w,4',
        'thrust-w,5',
        'thrust-w,4',
        'thrust-w,2',
        'thrust-w,3',
      ],
      [
        'thrust-s,0',
        'thrust-s,1',
        'thrust-s,2',
        'thrust-s,3',
        'thrust-s,4',
        'thrust-s,5',
        'thrust-s,4',
        'thrust-s,4',
        'thrust-s,4',
        'thrust-s,5',
        'thrust-s,4',
        'thrust-s,2',
        'thrust-s,3',
      ],
      [
        'thrust-e,0',
        'thrust-e,1',
        'thrust-e,2',
        'thrust-e,3',
        'thrust-e,4',
        'thrust-e,5',
        'thrust-e,4',
        'thrust-e,4',
        'thrust-e,4',
        'thrust-e,5',
        'thrust-e,4',
        'thrust-e,2',
        'thrust-e,3',
      ],
    ],
  },
  slash_128: {
    frameSize: 128,
    frames: [
      ['slash-n,0', 'slash-n,1', 'slash-n,2', 'slash-n,3', 'slash-n,4', 'slash-n,5'],
      ['slash-w,0', 'slash-w,1', 'slash-w,2', 'slash-w,3', 'slash-w,4', 'slash-w,5'],
      ['slash-s,0', 'slash-s,1', 'slash-s,2', 'slash-s,3', 'slash-s,4', 'slash-s,5'],
      ['slash-e,0', 'slash-e,1', 'slash-e,2', 'slash-e,3', 'slash-e,4', 'slash-e,5'],
    ],
  },
  backslash_128: {
    frameSize: 128,
    frames: [
      [
        'backslash-n,0',
        'backslash-n,1',
        'backslash-n,2',
        'backslash-n,3',
        'backslash-n,4',
        'backslash-n,5',
        'backslash-n,6',
        'backslash-n,7',
        'backslash-n,8',
        'backslash-n,9',
        'backslash-n,10',
        'backslash-n,11',
        'backslash-n,12',
      ],
      [
        'backslash-w,0',
        'backslash-w,1',
        'backslash-w,2',
        'backslash-w,3',
        'backslash-w,4',
        'backslash-w,5',
        'backslash-w,6',
        'backslash-w,7',
        'backslash-w,8',
        'backslash-w,9',
        'backslash-w,10',
        'backslash-w,11',
        'backslash-w,12',
      ],
      [
        'backslash-s,0',
        'backslash-s,1',
        'backslash-s,2',
        'backslash-s,3',
        'backslash-s,4',
        'backslash-s,5',
        'backslash-s,6',
        'backslash-s,7',
        'backslash-s,8',
        'backslash-s,9',
        'backslash-s,10',
        'backslash-s,11',
        'backslash-s,12',
      ],
      [
        'backslash-e,0',
        'backslash-e,1',
        'backslash-e,2',
        'backslash-e,3',
        'backslash-e,4',
        'backslash-e,5',
        'backslash-e,6',
        'backslash-e,7',
        'backslash-e,8',
        'backslash-e,9',
        'backslash-e,10',
        'backslash-e,11',
        'backslash-e,12',
      ],
    ],
  },
  halfslash_128: {
    frameSize: 128,
    frames: [
      [
        'halfslash-n,0',
        'halfslash-n,1',
        'halfslash-n,2',
        'halfslash-n,3',
        'halfslash-n,4',
        'halfslash-n,5',
      ],
      [
        'halfslash-w,0',
        'halfslash-w,1',
        'halfslash-w,2',
        'halfslash-w,3',
        'halfslash-w,4',
        'halfslash-w,5',
      ],
      [
        'halfslash-s,0',
        'halfslash-s,1',
        'halfslash-s,2',
        'halfslash-s,3',
        'halfslash-s,4',
        'halfslash-s,5',
      ],
      [
        'halfslash-e,0',
        'halfslash-e,1',
        'halfslash-e,2',
        'halfslash-e,3',
        'halfslash-e,4',
        'halfslash-e,5',
      ],
    ],
  },
  thrust_oversize: {
    frameSize: 192,
    frames: [
      [
        'thrust-n,0',
        'thrust-n,1',
        'thrust-n,2',
        'thrust-n,3',
        'thrust-n,4',
        'thrust-n,5',
        'thrust-n,6',
        'thrust-n,7',
      ],
      [
        'thrust-w,0',
        'thrust-w,1',
        'thrust-w,2',
        'thrust-w,3',
        'thrust-w,4',
        'thrust-w,5',
        'thrust-w,6',
        'thrust-w,7',
      ],
      [
        'thrust-s,0',
        'thrust-s,1',
        'thrust-s,2',
        'thrust-s,3',
        'thrust-s,4',
        'thrust-s,5',
        'thrust-s,6',
        'thrust-s,7',
      ],
      [
        'thrust-e,0',
        'thrust-e,1',
        'thrust-e,2',
        'thrust-e,3',
        'thrust-e,4',
        'thrust-e,5',
        'thrust-e,6',
        'thrust-e,7',
      ],
    ],
  },
  slash_oversize: {
    frameSize: 192,
    frames: [
      ['slash-n,0', 'slash-n,1', 'slash-n,2', 'slash-n,3', 'slash-n,4', 'slash-n,5'],
      ['slash-w,0', 'slash-w,1', 'slash-w,2', 'slash-w,3', 'slash-w,4', 'slash-w,5'],
      ['slash-s,0', 'slash-s,1', 'slash-s,2', 'slash-s,3', 'slash-s,4', 'slash-s,5'],
      ['slash-e,0', 'slash-e,1', 'slash-e,2', 'slash-e,3', 'slash-e,4', 'slash-e,5'],
    ],
  },
  walk_128: {
    skipFirstFrameInPreview: true,
    frameSize: 128,
    frames: [
      [
        'walk-n,0',
        'walk-n,1',
        'walk-n,2',
        'walk-n,3',
        'walk-n,4',
        'walk-n,5',
        'walk-n,6',
        'walk-n,7',
        'walk-n,8',
      ],
      [
        'walk-w,0',
        'walk-w,1',
        'walk-w,2',
        'walk-w,3',
        'walk-w,4',
        'walk-w,5',
        'walk-w,6',
        'walk-w,7',
        'walk-w,8',
      ],
      [
        'walk-s,0',
        'walk-s,1',
        'walk-s,2',
        'walk-s,3',
        'walk-s,4',
        'walk-s,5',
        'walk-s,6',
        'walk-s,7',
        'walk-s,8',
      ],
      [
        'walk-e,0',
        'walk-e,1',
        'walk-e,2',
        'walk-e,3',
        'walk-e,4',
        'walk-e,5',
        'walk-e,6',
        'walk-e,7',
        'walk-e,8',
      ],
    ],
  },
  thrust_128: {
    frameSize: 128,
    frames: [
      [
        'thrust-n,0',
        'thrust-n,1',
        'thrust-n,2',
        'thrust-n,3',
        'thrust-n,4',
        'thrust-n,5',
        'thrust-n,6',
        'thrust-n,7',
      ],
      [
        'thrust-w,0',
        'thrust-w,1',
        'thrust-w,2',
        'thrust-w,3',
        'thrust-w,4',
        'thrust-w,5',
        'thrust-w,6',
        'thrust-w,7',
      ],
      [
        'thrust-s,0',
        'thrust-s,1',
        'thrust-s,2',
        'thrust-s,3',
        'thrust-s,4',
        'thrust-s,5',
        'thrust-s,6',
        'thrust-s,7',
      ],
      [
        'thrust-e,0',
        'thrust-e,1',
        'thrust-e,2',
        'thrust-e,3',
        'thrust-e,4',
        'thrust-e,5',
        'thrust-e,6',
        'thrust-e,7',
      ],
    ],
  },
  slash_reverse_oversize: {
    frameSize: 192,
    frames: [
      ['slash-n,5', 'slash-n,4', 'slash-n,3', 'slash-n,2', 'slash-n,1', 'slash-n,0'],
      ['slash-w,5', 'slash-w,4', 'slash-w,3', 'slash-w,2', 'slash-w,1', 'slash-w,0'],
      ['slash-s,5', 'slash-s,4', 'slash-s,3', 'slash-s,2', 'slash-s,1', 'slash-s,0'],
      ['slash-e,5', 'slash-e,4', 'slash-e,3', 'slash-e,2', 'slash-e,1', 'slash-e,0'],
    ],
  },
  whip_oversize: {
    frameSize: 192,
    frames: [
      [
        'slash-n,0',
        'slash-n,1',
        'slash-n,4',
        'slash-n,5',
        'slash-n,3',
        'slash-n,2',
        'slash-n,2',
        'slash-n,1',
      ],
      [
        'slash-w,0',
        'slash-w,1',
        'slash-w,5',
        'slash-w,4',
        'slash-w,3',
        'slash-w,3',
        'slash-w,3',
        'slash-w,2',
      ],
      [
        'slash-s,0',
        'slash-s,1',
        'slash-s,5',
        'slash-s,4',
        'slash-s,3',
        'slash-s,3',
        'slash-s,2',
        'slash-w,1',
      ],
      [
        'slash-e,0',
        'slash-e,1',
        'slash-e,5',
        'slash-e,4',
        'slash-e,3',
        'slash-e,3',
        'slash-e,3',
        'slash-e,2',
      ],
    ],
  },
  tool_whip: {
    frameSize: 192,
    frames: [
      [
        'slash-n,0',
        'slash-n,1',
        'slash-n,4',
        'slash-n,5',
        'slash-n,3',
        'slash-n,2',
        'slash-n,2',
        'slash-n,1',
      ],
      [
        'slash-w,0',
        'slash-w,1',
        'slash-w,5',
        'slash-w,4',
        'slash-w,3',
        'slash-w,3',
        'slash-w,3',
        'slash-w,2',
      ],
      [
        'slash-s,0',
        'slash-s,1',
        'slash-s,5',
        'slash-s,4',
        'slash-s,3',
        'slash-s,3',
        'slash-s,2',
        'slash-s,1',
      ],
      [
        'slash-e,0',
        'slash-e,1',
        'slash-e,5',
        'slash-e,4',
        'slash-e,3',
        'slash-e,3',
        'slash-e,3',
        'slash-e,2',
      ],
    ],
  },
};

/**
 * Computes the total width and height of a custom animation block
 * based on its configured frame size, rows count, and columns count.
 * Used for dynamic sheet layout resizing.
 * 
 * @param customAnimation The custom animation definition.
 * @returns An object containing the computed width and height.
 */
const customAnimationSize = (
  customAnimation: CustomAnimationDefinition,
): { width: number; height: number } => ({
  width: customAnimation.frameSize * (customAnimation.frames[0]?.length ?? 0),
  height: customAnimation.frameSize * customAnimation.frames.length,
});

/**
 * Extracts the standard base animation name (e.g. "sit" or "thrust")
 * from the first frame definition of a custom animation.
 * Custom frames are defined like "sit-n,2", where "sit" is the base animation name
 * whose standard frames will be extracted and re-laid onto the custom animation region.
 * 
 * @param custAnim The custom animation definition.
 * @returns The base standard animation name (e.g. "sit" or "thrust").
 */
const customAnimationBase = (custAnim: CustomAnimationDefinition): string => {
  const first = custAnim.frames[0]?.[0];
  if (first === undefined) {
    throw new Error('customAnimationBase: definition has no frames');
  }
  // e.g. "sit-n,2" → "sit-n" → "sit". `split` always yields ≥1 element,
  // so the `?? first` fallbacks are unreachable — they exist only to
  // satisfy `noUncheckedIndexedAccess` without a non-null assertion.
  const beforeComma = first.split(',')[0] ?? first;
  return beforeComma.split('-')[0] ?? beforeComma;
};

export {
  animationRowsLayout,
  customAnimations,
  customAnimationSize,
  customAnimationBase,
};
