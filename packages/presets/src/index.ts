type TypeName = string;
type BodyType = string;

interface Selection {
  readonly typeName: TypeName;
  readonly name: string;
  readonly variant?: string;
  readonly recolor?: string;
}

interface RecolorConfig {
  readonly material: string;
  readonly palettes: readonly string[];
  readonly type_name?: TypeName;
  readonly base?: string;
  readonly source?: readonly string[];
  readonly label?: string;
}

interface MultiRecolorConfig {
  readonly [colorKey: `color_${number}`]: RecolorConfig | undefined;
}

type RawRecolors = RecolorConfig | MultiRecolorConfig;

interface RawLayer {
  readonly zPos: number;
  readonly custom_animation?: string;
  readonly [bodyType: string]: number | string | undefined;
}

interface ItemDefinition {
  readonly name: string;
  readonly type_name: TypeName;
  readonly recolors?: RawRecolors;
  readonly variants?: readonly string[];
  readonly [layerKey: `layer_${number}`]: RawLayer | undefined;
}

interface Catalog {
  readonly byTypeName: ReadonlyMap<TypeName, readonly ItemDefinition[]>;
}

type PaletteVersionColors = Readonly<Record<string, readonly string[]>>;
type PaletteMap = Readonly<Record<string, PaletteVersionColors>>;

interface PaletteMaterialMeta {
  readonly palettes: PaletteMap;
  readonly default?: string;
  readonly base?: string;
}

interface PaletteMetadata {
  readonly materials: Readonly<Record<string, PaletteMaterialMeta>>;
}

/** One item slot in a preset: a catalog item plus an optional variant. */
export interface PresetItem {
  readonly typeName: TypeName;
  /** Must equal the catalog ItemDefinition.name. */
  readonly name: string;
  /** Color/variant; required when the catalog item declares variants. */
  readonly variant?: string;
  /** Palette recolor; used for recolor-backed items. */
  readonly recolor?: string;
}

/** A themed outfit the user can apply with one click. */
export interface Preset {
  readonly id: string;
  readonly labelKey: string;
  readonly emoji: string;
  readonly bodyType?: BodyType;
  readonly items: readonly PresetItem[];
}

/** Result of applying a clothing preset to the current character selections. */
export interface PresetApplyResult {
  /** Target body type resolved from the preset (falling back to current). */
  readonly bodyType: BodyType;
  /** Full new selections: personal categories kept, clothing replaced. */
  readonly selections: Record<TypeName, Selection>;
  /** Preset items dropped - catalog miss or unsupported body type. */
  readonly skipped: readonly PresetItem[];
}

/**
 * Clothing / equipment categories cleared before a preset is applied.
 * Personal-appearance categories (body, head, hair, expression, eyes,
 * beard, ...) are NOT in this set and are never touched by a preset.
 * Covers the common-picker clothing slots (torso/legs/feet) plus every
 * type_name used by a preset. Items the user added via advanced search in
 * a category outside this set are not auto-cleared (a documented edge).
 */
export const CLOTHING_TYPES: ReadonlySet<TypeName> = new Set<TypeName>([
  'torso',
  'legs',
  'feet',
  'clothes',
  'overalls',
  'apron',
  'armour',
  'chainmail',
  'shoes',
  'cape',
  'hat',
  'weapon',
  'weapon_magic_crystal',
  'shield',
  'quiver',
  'arms',
  'gloves',
]);

/**
 * Six themed outfit presets. Item names / type names / variants are
 * verified against the upstream catalog by presets.test.ts. Some items
 * only ship art for a subset of body types (e.g. armour: male/female/teen
 * only); incompatible items are skipped at apply time.
 */
export const PRESETS: readonly Preset[] = [
  {
    id: 'farmer',
    labelKey: 'preset.farmer',
    emoji: '🌾',
    bodyType: 'male',
    items: [
      { typeName: 'body', name: 'Body Color', recolor: 'light' },
      { typeName: 'head', name: 'Human Male', recolor: 'light' },
      { typeName: 'expression', name: 'Neutral', recolor: 'light' },
      { typeName: 'clothes', name: 'Shortsleeve', recolor: 'brown' },
      { typeName: 'overalls', name: 'Overalls', variant: 'brown' },
      { typeName: 'shoes', name: 'Basic Boots', variant: 'brown' },
      { typeName: 'hair', name: 'Messy3', recolor: 'orange' },
    ],
  },
  {
    id: 'villager',
    labelKey: 'preset.villager',
    emoji: '🏘️',
    bodyType: 'male',
    items: [
      { typeName: 'body', name: 'Body Color', recolor: 'light' },
      { typeName: 'head', name: 'Human Male', recolor: 'light' },
      { typeName: 'expression', name: 'Neutral', recolor: 'light' },
      { typeName: 'clothes', name: 'Longsleeve Polo', recolor: 'white' },
      { typeName: 'legs', name: 'Pants', recolor: 'black' },
      { typeName: 'shoes', name: 'Basic Shoes', variant: 'gray' },
      { typeName: 'hair', name: 'Side Parted w/Bangs 2', recolor: 'sandy' },
    ],
  },
  {
    id: 'mage',
    labelKey: 'preset.mage',
    emoji: '🔮',
    bodyType: 'male',
    items: [
      { typeName: 'body', name: 'Body Color', recolor: 'light' },
      { typeName: 'head', name: 'Human Male', recolor: 'light' },
      { typeName: 'expression', name: 'Neutral', recolor: 'light' },
      { typeName: 'clothes', name: 'Longsleeve laced', variant: 'black' },
      { typeName: 'legs', name: 'Pants', recolor: 'black' },
      { typeName: 'shoes', name: 'Basic Shoes', variant: 'black' },
      { typeName: 'cape', name: 'Solid', variant: 'purple' },
      { typeName: 'hat', name: 'Wizard Hat Base', variant: 'purple' },
      { typeName: 'weapon', name: 'Gnarled staff', variant: 'dark' },
      { typeName: 'weapon_magic_crystal', name: 'Crystal', variant: 'purple' },
    ],
  },
  {
    id: 'knight',
    labelKey: 'preset.knight',
    emoji: '⚔️',
    bodyType: 'male',
    items: [
      { typeName: 'body', name: 'Body Color', recolor: 'light' },
      { typeName: 'head', name: 'Human Male', recolor: 'light' },
      { typeName: 'expression', name: 'Neutral', recolor: 'light' },
      { typeName: 'armour', name: 'Plate', recolor: 'steel' },
      { typeName: 'legs', name: 'Armour', recolor: 'steel' },
      { typeName: 'shoes', name: 'Armour', variant: 'steel' },
      { typeName: 'hat', name: 'Armet', recolor: 'steel' },
      { typeName: 'weapon', name: 'Longsword', variant: 'longsword' },
      { typeName: 'shield', name: 'Kite', variant: 'kite blue gray' },
      { typeName: 'arms', name: 'Armour', recolor: 'steel' },
      { typeName: 'gloves', name: 'Gloves', recolor: 'all.lpcr.smoke' },
    ],
  },
  {
    id: 'ranger',
    labelKey: 'preset.ranger',
    emoji: '🏹',
    items: [
      { typeName: 'armour', name: 'Leather' },
      { typeName: 'legs', name: 'Pants' },
      { typeName: 'shoes', name: 'Basic Boots', variant: 'brown' },
      { typeName: 'hat', name: 'Hood' },
      { typeName: 'weapon', name: 'Normal', variant: 'dark' },
      { typeName: 'quiver', name: 'Quiver', variant: 'quiver' },
    ],
  },
  {
    id: 'noble',
    labelKey: 'preset.noble',
    emoji: '👑',
    items: [
      {
        typeName: 'clothes',
        name: 'Collared/Formal Longsleeve',
        variant: 'white',
      },
      { typeName: 'legs', name: 'Formal Pants' },
      { typeName: 'shoes', name: 'Basic Shoes', variant: 'black' },
      { typeName: 'hat', name: 'Formal Tophat', variant: 'black' },
    ],
  },
];

function itemSupportsBodyType(
  item: ItemDefinition,
  bodyType: BodyType,
): boolean {
  return typeof item.layer_1?.[bodyType] === 'string';
}

function pickDefaults(
  item: ItemDefinition | undefined,
  palettes: PaletteMetadata,
): { variant?: string; recolor?: string } {
  if (!item) return {};
  const firstRecolor = getFirstRecolorVariant(item, palettes);
  if (firstRecolor) return { recolor: firstRecolor };
  const firstVariant = item.variants?.[0];
  return firstVariant ? { variant: firstVariant } : {};
}

function collectRecolorEntries(
  recolors: ItemDefinition['recolors'],
): RecolorConfig[] {
  if (!recolors) return [];
  const entries: RecolorConfig[] = [];
  const multi = recolors as {
    readonly [key: `color_${number}`]: RecolorConfig | undefined;
  };
  for (let n = 1; n < 10; n++) {
    const entry = multi[`color_${n}`];
    if (entry) entries.push(entry);
    else break;
  }
  return entries.length > 0 ? entries : [recolors as RecolorConfig];
}

function resolvePaletteToken(
  token: string,
  fallbackMaterial: string,
): { material: string; version: string } {
  const parts = token.split('.');
  let material = parts[0] ?? '';
  let version = parts[1] ?? '';
  if (!version) {
    version = material;
    material = fallbackMaterial;
  }
  return { material, version };
}

function getFirstRecolorVariant(
  item: ItemDefinition,
  palettes: PaletteMetadata,
): string | undefined {
  const entry = collectRecolorEntries(item.recolors)[0];
  if (!entry) return undefined;
  const material = palettes.materials[entry.material];
  if (!material) return undefined;
  const defaultVersion = material.default ?? '';

  for (const token of entry.palettes) {
    const { material: tokenMaterial, version } = resolvePaletteToken(
      token,
      entry.material,
    );
    const variantMap = palettes.materials[tokenMaterial]?.palettes[version];
    if (!variantMap) continue;
    const firstColor = Object.keys(variantMap)[0];
    if (!firstColor) continue;
    const materialPrefix =
      entry.material !== tokenMaterial ? `${tokenMaterial}.` : '';
    const versionPrefix = defaultVersion !== version ? `${version}.` : '';
    return `${materialPrefix}${versionPrefix}${firstColor}`;
  }

  return undefined;
}

/**
 * Compute the selections after applying `preset`:
 * - every CLOTHING_TYPES entry is removed from `current` (clean slate);
 * - personal-appearance categories are kept untouched;
 * - each preset item that resolves in the catalog AND supports the resolved
 *   bodyType is added; the rest are returned in `skipped`.
 */
export function computePresetSelection(
  preset: Preset,
  current: Readonly<Record<TypeName, Selection>>,
  bodyType: BodyType,
  catalog: Catalog,
  palettes: PaletteMetadata,
): PresetApplyResult {
  const targetBodyType = preset.bodyType ?? bodyType;
  const selections: Record<TypeName, Selection> = {};
  for (const [typeName, selection] of Object.entries(current)) {
    if (!CLOTHING_TYPES.has(typeName)) selections[typeName] = selection;
  }

  const skipped: PresetItem[] = [];
  for (const item of preset.items) {
    const def = (catalog.byTypeName.get(item.typeName) ?? []).find(
      (d) => d.name === item.name,
    );
    if (!def || !itemSupportsBodyType(def, targetBodyType)) {
      skipped.push(item);
      continue;
    }
    const colorFields =
      item.variant || item.recolor
        ? {
            ...(item.variant ? { variant: item.variant } : {}),
            ...(item.recolor ? { recolor: item.recolor } : {}),
          }
        : pickDefaults(def, palettes);
    selections[item.typeName] = {
      typeName: item.typeName,
      name: item.name,
      ...colorFields,
    };
  }

  return { bodyType: targetBodyType, selections, skipped };
}
