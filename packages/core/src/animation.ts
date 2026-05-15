import type { CanvasAdapter } from './adapters.js';
import type {
  AnimationName,
  ComposedAnimation,
  ComposedSheet,
} from './types.js';

export interface ExtractAnimationOptions {
  readonly adapter: CanvasAdapter;
}

export function extractAnimation(
  sheet: ComposedSheet,
  name: AnimationName,
  options: ExtractAnimationOptions,
): ComposedAnimation {
  void sheet;
  void name;
  void options;
  throw new Error('not implemented');
}
