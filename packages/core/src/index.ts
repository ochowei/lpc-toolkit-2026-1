/**
 * @module @lpc-toolkit/core
 *
 * The pure TypeScript core library for the Liberated Pixel Cup (LPC) character sprite toolkit.
 * Contains core composition, animation parsing, palette recoloring, and credit attribution logic.
 *
 * Strictly environment-agnostic. All I/O, canvas operations, and image loading are abstracted via
 * `CanvasAdapter` and must be provided by the caller.
 */

// ==========================================
// 1. Foundation Types and Definitions
// ==========================================
export type {
  AliasEntry,
  AnimationName,
  BodyType,
  Catalog,
  ComposedAnimation,
  ComposedSheet,
  CreditEntry,
  CreditsManifest,
  CustomAnimationRegion,
  FilePath,
  ItemDefinition,
  ItemId,
  LayerSpec,
  License,
  MultiRecolorConfig,
  PaletteColors,
  PaletteMap,
  PaletteMaterialMeta,
  PaletteMetadata,
  PaletteVersionColors,
  PaletteVersionMeta,
  RawLayer,
  RawRecolors,
  RecolorConfig,
  Selection,
  Selections,
  TypeName,
} from './types.js';

// ==========================================
// 2. Environment-Agnostic Adapters
// ==========================================
export type {
  CanvasAdapter,
  CanvasLike,
  Context2DLike,
  ImageDataLike,
  ImageLike,
} from './adapters.js';

// ==========================================
// 3. Functional Error Handling
// ==========================================
export type { Result } from './result.js';
export { ok, err, isOk, isErr, unwrapOr } from './result.js';

// ==========================================
// 4. Sprite and Metadata Catalog Loader
// ==========================================
export type { CatalogLoadWarning, CreateCatalogResult } from './catalog.js';
export { createCatalog } from './catalog.js';

// ==========================================
// 5. Palette and Color Metadata Catalog
// ==========================================
export type {
  CreatePaletteCatalogResult,
  PaletteLoadWarning,
} from './palettes.js';
export { createPaletteCatalog } from './palettes.js';

// ==========================================
// 6. Recolor SWATCHES and Variant Resolvers
// ==========================================
export type {
  MakeResolvePaletteOptions,
  RecolorSwatch,
  ResolvePalette,
} from './recolor-resolve.js';
export {
  getRecolorSwatches,
  getRecolorVariants,
  getRecolorVariantsForType,
  itemSupportsSelectionType,
  makeResolvePalette,
} from './recolor-resolve.js';
export { getDefaultColorSelection } from './selection-defaults.js';

// ==========================================
// 7. Layer Composition Engine
// ==========================================
export type { ComposeOptions, SpritePathResolutionOptions } from './compose.js';
export { composeSelections, getSpritePathsForSelections } from './compose.js';

// ==========================================
// 8. License & Credit Attribution Engine
// ==========================================
export { getCredits, computeEffectiveLicense } from './credits.js';
export { creditsToTxt, creditsToCsv } from './credits-format.js';

// ==========================================
// 9. Selection URL State Serializer
// ==========================================
export type {
  ParsedSelectionJson,
  SelectionJson,
  SelectionJsonItem,
} from './selection-document.js';
export {
  parseSelectionJson,
  SELECTION_SCHEMA,
  selectionJsonFromCore,
} from './selection-document.js';
export type {
  ImportedSelectionDocument,
  SelectionDocumentErrorCode,
  SelectionDocumentImportContext,
  SelectionDocumentSource,
} from './upstream-selection-import.js';
export {
  importSelectionDocument,
  SelectionDocumentError,
} from './upstream-selection-import.js';
export type { HashWarning, ParseHashResult } from './hash.js';
export {
  decodeSelectionToken,
  encodeSelectionToken,
  parseHash,
  serializeHash,
} from './hash.js';

// ==========================================
// 10. Animation Strip Extractor
// ==========================================
export type { ExtractAnimationOptions } from './animation.js';
export { extractAnimation } from './animation.js';

// ==========================================
// 11. Animation Playback Descriptions
// ==========================================
export type { AnimationPlaybackDescriptor } from './animation-playback.js';
export { describeAnimationPlayback } from './animation-playback.js';

// ==========================================
// 12. Individual Frame Slicer
// ==========================================
export { extractAnimationFrames } from './frames.js';
export type { ExtractFramesOptions, FrameSlice } from './frames.js';

// ==========================================
// 13. Custom Animations Layout Config
// ==========================================
export type {
  AnimationRowsLayout,
  CustomAnimationDefinition,
} from './custom-animations.js';
export {
  animationRowsLayout,
  customAnimationBase,
  customAnimations,
  customAnimationSize,
} from './custom-animations.js';

// ==========================================
// 14. System Constants and Configurations
// ==========================================
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
  VIRTUAL_ANIMATION_MAP,
} from './constants.js';

// ==========================================
// 15. Image & Pixel Recolor Core
// ==========================================
export type {
  ColorHex,
  Palette,
  PaletteSwap,
  RecolorOptions,
} from './recolor.js';
export { recolorImage, recolorPixels } from './recolor.js';

// ==========================================
// 16. Static Asset Validator
// ==========================================
export { validateAssets } from './validation/asset-validator.js';
export type { ValidateAssetsOptions, ValidationIssue } from './validation/asset-validator.js';
