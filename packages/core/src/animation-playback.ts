import { ANIMATION_CONFIGS, FRAME_SIZE } from './constants.js';
import type { AnimationName, ComposedSheet } from './types.js';

export interface AnimationPlaybackDescriptor {
  readonly animation: AnimationName;
  readonly kind: 'standard' | 'custom';
  readonly sourceX: number;
  readonly sourceY: number;
  readonly frameSize: number;
  readonly cycle: readonly number[];
  readonly directions: 1 | 4;
}

export function describeAnimationPlayback(
  sheet: Pick<ComposedSheet, 'animations' | 'customAnimations'>,
): readonly AnimationPlaybackDescriptor[] {
  const descriptors: AnimationPlaybackDescriptor[] = [];
  const seen = new Set<AnimationName>();
  for (const animation of sheet.animations) {
    const config = ANIMATION_CONFIGS[animation];
    if (!config) throw new Error(`Unknown composed animation: ${animation}`);
    if (seen.has(animation)) continue;
    seen.add(animation);
    descriptors.push({
      animation,
      kind: 'standard',
      sourceX: 0,
      sourceY: config.row * FRAME_SIZE,
      frameSize: FRAME_SIZE,
      cycle: [...config.cycle],
      directions: config.num,
    });
  }
  for (const [animation, region] of sheet.customAnimations ?? []) {
    if (seen.has(animation)) continue;
    seen.add(animation);
    descriptors.push({
      animation,
      kind: 'custom',
      sourceX: 0,
      sourceY: region.offsetY,
      frameSize: region.frameSize,
      cycle: Array.from({ length: region.cols }, (_, index) => index),
      directions: region.rows === 1 ? 1 : 4,
    });
  }
  return descriptors;
}
