export type {
  AnimationName,
  BodyType,
  Catalog,
  ComposedAnimation,
  ComposedSheet,
  CreditEntry,
  CreditsManifest,
  FilePath,
  ItemDefinition,
  ItemId,
  LayerSpec,
  License,
  RawLayer,
  RecolorConfig,
  Selection,
  Selections,
  TypeName,
} from './types.js';

export type {
  CanvasAdapter,
  CanvasLike,
  Context2DLike,
  ImageDataLike,
  ImageLike,
} from './adapters.js';

export type { Result } from './result.js';
export { ok, err, isOk, isErr, unwrapOr } from './result.js';

export type { CatalogLoadWarning, CreateCatalogResult } from './catalog.js';
export { createCatalog } from './catalog.js';

export type { ComposeOptions } from './compose.js';
export { composeSelections, getSpritePathsForSelections } from './compose.js';

export { getCredits, computeEffectiveLicense } from './credits.js';

export type { HashWarning, ParseHashResult } from './hash.js';
export { parseHash, serializeHash } from './hash.js';

export type { ExtractAnimationOptions } from './animation.js';
export { extractAnimation } from './animation.js';
