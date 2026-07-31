import {
  getDefaultColorSelection,
  getColorChannels,
  type BodyType,
  type Catalog,
  type ItemDefinition,
  type PaletteMetadata,
  type Selection,
  type TypeName,
} from '@lpc-toolkit/core';

/** One item slot in a preset: a catalog item plus an optional variant. */
export interface PresetItem {
  readonly typeName: TypeName;
  /** Must equal the catalog ItemDefinition.name. */
  readonly name: string;
  /** Color/variant; required when the catalog item declares variants. */
  readonly variant?: string;
  /** Palette recolor; used for recolor-backed items. */
  readonly recolor?: string;
  /** Explicit independent non-primary values owned by this preset item. */
  readonly channelRecolors?: Readonly<Record<TypeName, string>>;
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
  /** Preset items dropped - catalog/body mismatch or invalid channel value. */
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

interface PresetChannelResult {
  readonly valid: boolean;
  readonly channelRecolors?: Readonly<Record<TypeName, string>>;
}

function resolvePresetChannels(
  presetItem: PresetItem,
  previous: Selection | undefined,
  definition: ItemDefinition,
  palettes: PaletteMetadata,
): PresetChannelResult {
  const channels = getColorChannels(definition, palettes);
  const values = new Map<TypeName, string>();

  for (const channel of channels) {
    if (channel.primary || channel.linkedTo) continue;
    const previousValue = previous?.channelRecolors?.[channel.id];
    if (
      previousValue
      && channel.swatches.some((swatch) => swatch.recolor === previousValue)
    ) {
      values.set(channel.id, previousValue);
    }
  }

  for (const [channelId, recolor] of Object.entries(
    presetItem.channelRecolors ?? {},
  )) {
    const channel = channels.find((candidate) => candidate.id === channelId);
    if (
      !channel
      || channel.primary
      || channel.linkedTo
      || !channel.swatches.some((swatch) => swatch.recolor === recolor)
    ) {
      return { valid: false };
    }
    values.set(channelId, recolor);
  }

  return {
    valid: true,
    ...(values.size > 0
      ? { channelRecolors: Object.fromEntries(values) }
      : {}),
  };
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
    const channelResult = resolvePresetChannels(
      item,
      current[item.typeName],
      def,
      palettes,
    );
    if (!channelResult.valid) {
      skipped.push(item);
      continue;
    }
    const colorFields =
      item.variant || item.recolor
        ? {
            ...(item.variant ? { variant: item.variant } : {}),
            ...(item.recolor ? { recolor: item.recolor } : {}),
          }
        : getDefaultColorSelection(def, palettes);
    selections[item.typeName] = {
      typeName: item.typeName,
      name: item.name,
      ...colorFields,
      ...(channelResult.channelRecolors
        ? { channelRecolors: channelResult.channelRecolors }
        : {}),
    };
  }

  return { bodyType: targetBodyType, selections, skipped };
}
