import type { CanvasAdapter } from './adapters.js';
import type {
  AnimationName,
  Catalog,
  ComposedSheet,
  LayerSpec,
  Selections,
} from './types.js';

export interface ComposeOptions {
  readonly catalog: Catalog;
  readonly adapter: CanvasAdapter;
  readonly spritesheetsBaseUrl: string;
  readonly animations?: readonly AnimationName[];
  readonly onProgress?: (loaded: number, total: number) => void;
}

export function composeSelections(
  selections: Selections,
  options: ComposeOptions,
): Promise<ComposedSheet> {
  void selections;
  void options;
  throw new Error('not implemented');
}

export function getSpritePathsForSelections(
  selections: Selections,
  catalog: Catalog,
): readonly LayerSpec[] {
  void selections;
  void catalog;
  throw new Error('not implemented');
}
