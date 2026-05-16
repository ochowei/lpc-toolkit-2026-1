export type {
  AliasEntry,
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

export type {
  AnimationConfig,
  AnimationFolderName,
  AnimationListEntry,
  Direction,
  LicenseGroup,
  LicenseGroupConfig,
  StandardBodyType,
} from './constants.js';
export {
  ANIMATIONS,
  ANIMATION_CONFIGS,
  ANIMATION_DEFAULTS,
  ANIMATION_OFFSETS,
  BODY_TYPES,
  COMPACT_FRAME_SIZE,
  DIRECTIONS,
  FRAME_SIZE,
  LICENSE_CONFIG,
  LICENSE_GROUP_OF,
  LICENSE_GROUP_ORDER,
  LICENSE_VERSION_RANK,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  STANDARD_ANIMATION_FRAMES_PER_ROW,
} from './constants.js';

export type {
  ColorHex,
  Palette,
  PaletteSwap,
  RecolorOptions,
} from './recolor.js';
export { recolorImage, recolorPixels } from './recolor.js';
