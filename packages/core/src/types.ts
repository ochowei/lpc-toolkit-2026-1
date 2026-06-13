import type { CanvasLike } from './adapters.js';

/**
 * Represents the type/category of an LPC item (e.g. 'body', 'hair', 'chest', 'legs').
 * Corresponds to directory names or slot types in the sprite catalog.
 */
export type TypeName = string;

/**
 * A unique identifier for a specific item within the catalog.
 * Formatted as `[typeName]/[itemName]` (e.g., 'hair/messy1').
 */
export type ItemId = string;

/**
 * Represents a body archetype or size category (e.g., 'male', 'female', 'teen', 'child').
 * Used to resolve correct sprite layer graphics and offsets.
 */
export type BodyType = string;

/**
 * Represents the name of a standard or custom sprite animation (e.g., 'walk', 'spellcast', 'hurt').
 */
export type AnimationName = string;

/**
 * A file path or path fragment pointing to sprite assets or metadata files.
 */
export type FilePath = string;

/**
 * Supported licenses under the Liberated Pixel Cup (LPC) asset catalog rules.
 * Derived from LPC upstream standards and GPL-3.0 compatibility guidelines.
 */
export type License =
  | 'CC0'
  | 'CC-BY'
  | 'CC-BY 3.0'
  | 'CC-BY 3.0+'
  | 'CC-BY 4.0'
  | 'CC-BY-SA 3.0'
  | 'CC-BY-SA 4.0'
  | 'OGA-BY 3.0'
  | 'OGA-BY 3.0+'
  | 'OGA-BY 4.0'
  | 'GPL 2.0'
  | 'GPL 3.0';

/**
 * Defines a raw graphic layer's configuration in the sprite sheet definition.
 */
export interface RawLayer {
  /** The Z-index positioning of the layer relative to others. */
  readonly zPos: number;
  /** Optional custom animation name that applies specifically to this layer. */
  readonly custom_animation?: string;
  /** BodyType-specific layer file paths or numeric overrides. Key is the body type name. */
  readonly [bodyType: string]: number | string | undefined;
}

/**
 * Represents a single credit and attribution record for a sprite asset.
 * Derived from upstream `CREDITS.csv` to ensure mandatory GPL-3.0 and CC-BY compliance.
 */
export interface CreditEntry {
  /** The baseline relative path to the asset folder or file. */
  readonly file: FilePath;
  /** Additional notes, details, or context about the asset's contribution or origin. */
  readonly notes: string;
  /** The list of authors who created or contributed to the asset. */
  readonly authors: readonly string[];
  /** The licenses under which this asset is distributed. */
  readonly licenses: readonly License[];
  /** Reference URLs (e.g. OpenGameArt submissions) for the asset. */
  readonly urls: readonly string[];
}

/**
 * One recolor entry as it appears in a sheet definition. `material` +
 * `palettes` (palette-token refs like `ulpc` / `all.lpcr`) are always
 * present; the rest are optional overrides the raw JSON may carry
 * (upstream `applyRecolorDefaults` reads them). Step 4.2 normalises this
 * against `PaletteMetadata`.
 */
export interface RecolorConfig {
  /** The material class name being recolored (e.g., 'hair', 'cloth', 'metal'). */
  readonly material: string;
  /** Palette names or versions applicable to this material (e.g., ['ulpc', 'all.lpcr']). */
  readonly palettes: readonly string[];
  /** Optional override for the target type name. */
  readonly type_name?: TypeName;
  /** Optional base color ramp key to use as the source ramp. */
  readonly base?: string;
  /** Optional array of raw source hex colors. */
  readonly source?: readonly string[];
  /** Optional human-readable label for the recolor configuration. */
  readonly label?: string;
}

/**
 * Multi-color form: `color_1` / `color_2` / … each a `RecolorConfig`
 * (upstream `collectRecolorEntries`). Real upstream data only uses the
 * single-object form, but the shape is supported for fidelity.
 */
export interface MultiRecolorConfig {
  /** Dynamic key matching color channels, e.g., 'color_1', 'color_2'. */
  readonly [colorKey: `color_${number}`]: RecolorConfig | undefined;
}

/**
 * Raw `recolors` value — a single `RecolorConfig` **object** or the
 * `color_N` multi form. (Note: this is an object in the source JSON, not
 * an array.)
 */
export type RawRecolors = RecolorConfig | MultiRecolorConfig;

/**
 * Represents the complete definition of an item in the sprite sheet catalog.
 * Contains metadata, credits, layering instructions, and custom asset overrides.
 */
export interface ItemDefinition {
  /** The human-readable name of the item. */
  readonly name: string;
  /** The slot/category type this item belongs to. */
  readonly type_name: TypeName;
  /** The path to the source JSON file where this item was defined. */
  readonly sourcePath?: FilePath;
  /** The list of animations supported by this item. */
  readonly animations: readonly AnimationName[];
  /** Mandatory credit/attribution records for this item. */
  readonly credits: readonly CreditEntry[];
  /** Optional recoloring definitions for materials inside the item. */
  readonly recolors?: RawRecolors;
  /** Available variants/sub-types of the item (e.g. 'long', 'short', colors). */
  readonly variants?: readonly string[];
  /** Categorization tags associated with this item. */
  readonly tags?: readonly string[];
  /** Prerequisite tags required by this item. */
  readonly required_tags?: readonly string[];
  /** Text replacements for resolving paths dynamically based on selections. */
  readonly replace_in_path?: Readonly<Record<TypeName, Readonly<Record<string, string>>>>;
  /** Rendering order priority override. Higher values render on top. */
  readonly priority?: number;
  /** If true, the item's color should synchronize with the character's body color. */
  readonly match_body_color?: boolean;
  /** Row index in the sheet definition preview image. */
  readonly preview_row?: number;
  /** Column index in the sheet definition preview image. */
  readonly preview_column?: number;
  /** Aliased variants/colors map for standardizing legacy or alternative references. */
  readonly aliases?: Readonly<Record<string, string>>;
  /** If true, this item will be excluded from selection lists. */
  readonly ignore?: boolean;
  /** Individual layers of the item (e.g., 'layer_1', 'layer_2') defining visual composite rules. */
  readonly [layerKey: `layer_${number}`]: RawLayer | undefined;
}

/**
 * Represents a resolved alias pointing to a concrete item and variant.
 */
export interface AliasEntry {
  /** The target item category/type name. */
  readonly typeName: TypeName;
  /** The target item name. */
  readonly name: string;
  /** The target item variant/color. */
  readonly variant: string;
}

/**
 * The consolidated catalog of all available LPC assets, items, and aliases.
 */
export interface Catalog {
  /** Fast lookups by item ID (`typeName/name`). */
  readonly byItemId: ReadonlyMap<ItemId, ItemDefinition>;
  /** Grouped item definitions indexed by their category TypeName. */
  readonly byTypeName: ReadonlyMap<TypeName, readonly ItemDefinition[]>;
  /** The list of all unique item category names. */
  readonly typeNames: readonly TypeName[];
  /** Aliased names resolved by TypeName and alias key. */
  readonly aliases: ReadonlyMap<TypeName, ReadonlyMap<string, AliasEntry>>;
}

/** Ordered list of hex color strings (one palette "ramp"). */
export type PaletteColors = readonly string[];

/** A version's recolor name (e.g. `ivory`, `tan`) → its color ramp. */
export type PaletteVersionColors = Readonly<Record<string, PaletteColors>>;

/** A material's version id (e.g. `ulpc`, `lpcr`) → its recolor ramps. */
export type PaletteMap = Readonly<Record<string, PaletteVersionColors>>;

/**
 * One palette material (e.g. `body`, `metal`). `palettes` is always
 * present; the descriptive / default fields come from `meta_<material>.json`
 * and are optional because a material can be created from a data file that
 * arrives before its meta (order-independent merge, mirroring upstream
 * `scripts/generateSources/palettes.js`).
 */
export interface PaletteMaterialMeta {
  /** Maps palette version ID (e.g., 'ulpc') to its corresponding recolor ramps. */
  readonly palettes: PaletteMap;
  /** Explicit type discriminator for the material. */
  readonly type?: 'material';
  /** Human-readable label for the material. */
  readonly label?: string;
  /** Human-readable description of the material. */
  readonly desc?: string;
  /** The default palette version ID (e.g., 'ulpc'). */
  readonly default?: string;
  /** The default recolor ID/ramp name (e.g., 'tan'). */
  readonly base?: string;
}

/** One palette version (e.g. `ulpc`), from `meta_<version>.json`. */
export interface PaletteVersionMeta {
  /** Explicit type discriminator for the palette version. */
  readonly type?: 'version';
  /** Human-readable label for the palette version. */
  readonly label?: string;
  /** Human-readable description of the palette version. */
  readonly desc?: string;
}

/**
 * Ingested `palette_definitions/**` — the parallel of `Catalog` for
 * palette color data. Built by `createPaletteCatalog` (Step 4.1).
 */
export interface PaletteMetadata {
  /** Materials mapping by material identifier (e.g., 'metal', 'cloth'). */
  readonly materials: Readonly<Record<string, PaletteMaterialMeta>>;
  /** Versions mapping by version identifier (e.g., 'ulpc', 'all.lpcr'). */
  readonly versions: Readonly<Record<string, PaletteVersionMeta>>;
}

/**
 * Represents a single layer selection for character composition.
 */
export interface Selection {
  /** The target item category (e.g. 'hair'). */
  readonly typeName: TypeName;
  /** The target item name (e.g. 'messy1'). */
  readonly name: string;
  /** Optional variant or color option (e.g. 'long'). */
  readonly variant?: string;
  /** Optional recolor variant name (e.g. 'red'). */
  readonly recolor?: string;
}

/**
 * The full collection of selections used to compose a single character.
 */
export interface Selections {
  /** The character's core body model type (e.g., 'male', 'female'). */
  readonly bodyType: BodyType;
  /** Active selections keyed by slot/category TypeName. */
  readonly items: Readonly<Record<TypeName, Selection>>;
}

/**
 * Fully resolved layer specification prepared for rendering.
 */
export interface LayerSpec {
  /** The ID of the item this layer belongs to. */
  readonly itemId: ItemId;
  /** The category slot type of the item. */
  readonly typeName: TypeName;
  /** The absolute or relative path to the image asset. */
  readonly path: FilePath;
  /** The Z-index position for composition layering. */
  readonly zPos: number;
  /** Optional custom animation name used if this layer deviates from the standard. */
  readonly customAnimation?: string;
}

/**
 * A bundle of credit attributions representing all assets used in a composition.
 */
export interface CreditsManifest {
  /** The list of raw credit entries. */
  readonly entries: readonly CreditEntry[];
  /**
   * Parallel to `entries`: the actual PNG path that triggered each credit
   * to be included (upstream calls this `lastUsedPath`). Used by the
   * `credits-format` exporters to write the full filename column. Empty
   * array is valid for callers that synthesize a manifest without going
   * through `getCredits` (e.g. AttributionPopover) — exporters fall back
   * to `entry.file + '/' + anim + '.png'` in that case.
   */
  readonly resolvedPaths: readonly string[];
  /** All unique licenses applicable to the composed asset. */
  readonly licenses: readonly License[];
}

/**
 * Where a custom-animation block lives inside a (variable-height)
 * `ComposedSheet.canvas` and how it is laid out (API.md Step 3.4 Q3 / N3).
 * `extractAnimation` uses this to crop a custom block when `name` is not a
 * standard `ANIMATION_CONFIGS` entry.
 */
export interface CustomAnimationRegion {
  /** The vertical pixel offset where this custom block starts in the sheet. */
  readonly offsetY: number;
  /** The pixel size of each frame in this block (typically 64 or 32). */
  readonly frameSize: number;
  /** The number of rows in the custom block. */
  readonly rows: number;
  /** The number of columns in the custom block. */
  readonly cols: number;
}

/**
 * Represents a fully composed sprite sheet containing canvas, metadata,
 * credits, and layout maps.
 */
export interface ComposedSheet {
  /** The underlying environment-agnostic canvas element. */
  readonly canvas: CanvasLike;
  /** Total width of the composed sheet in pixels. */
  readonly width: number;
  /** Total height of the composed sheet in pixels (including custom animations). */
  readonly height: number;
  /** Selections used to generate this sheet. */
  readonly selections: Selections;
  /** Comprehensive legal and credit attributions for all layers. */
  readonly credits: CreditsManifest;
  /** List of resolved layer specs that went into the composition. */
  readonly layers: readonly LayerSpec[];
  /** List of animations contained in the standard portion of the sheet. */
  readonly animations: readonly AnimationName[];
  /** Logical spritesheet paths that could not be loaded during composition. */
  readonly missingPaths?: readonly string[];
  /**
   * Custom-animation blocks composed below the standard 832×3456 sheet,
   * keyed by custom-animation name (e.g. `wheelchair`). Omitted entirely
   * when the selection has no custom-animation layers, so a standard-only
   * sheet's shape is unchanged (N3). Order is encounter order (Q6).
   */
  readonly customAnimations?: ReadonlyMap<string, CustomAnimationRegion>;
}

/**
 * Represents a single composed and extracted sprite animation.
 */
export interface ComposedAnimation {
  /** The environment-agnostic canvas holding the animation strip or sheet. */
  readonly canvas: CanvasLike;
  /** Total width of the animation image. */
  readonly width: number;
  /** Total height of the animation image. */
  readonly height: number;
  /** The name of the animation (e.g. 'walk'). */
  readonly animation: AnimationName;
  /** The number of frames in the animation cycle. */
  readonly frameCount: number;
  /** The number of directions present in the output (1 or 4). */
  readonly directions: 1 | 4;
  /** Credits manifest specific to the layers that compose this animation. */
  readonly credits: CreditsManifest;
}
