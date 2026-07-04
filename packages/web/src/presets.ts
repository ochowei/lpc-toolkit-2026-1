import type { TypeName, BodyType } from '@lpc-toolkit/core';
import type { TranslationKey } from './i18n';

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
  readonly labelKey: TranslationKey;
  readonly emoji: string;
  readonly bodyType?: BodyType;
  readonly items: readonly PresetItem[];
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
    items: [
      { typeName: 'clothes', name: 'Longsleeve', recolor: 'brown' },
      { typeName: 'legs', name: 'Pants', recolor: 'brown' },
      { typeName: 'shoes', name: 'Basic Shoes', variant: 'tan' },
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
