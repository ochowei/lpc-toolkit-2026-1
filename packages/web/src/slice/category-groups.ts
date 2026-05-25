import type { TranslationKey } from '../i18n';
import type { TypeName } from '@lpc-toolkit/core';

export type GroupId = 'body' | 'face' | 'clothing' | 'accessories' | 'weapons';

export interface CategoryGroup {
  readonly id: GroupId;
  readonly labelKey: TranslationKey;
  readonly typeNames: readonly TypeName[];
}

/**
 * 5 super-groups consolidating the LPC catalog's many `type_name` values
 * into a smaller taxonomy for AddLayer + AdvancedPalette grouping.
 *
 * TypeNames not listed here return `null` from `groupForType` and are
 * hidden from grouped UI (AddLayer). They remain reachable via ⌘K search.
 */
export const CATEGORY_GROUPS: readonly CategoryGroup[] = [
  {
    id: 'body',
    labelKey: 'group.body' as TranslationKey,
    typeNames: ['body', 'head', 'eyes', 'eyebrows', 'nose', 'ears', 'ears_inner'],
  },
  {
    id: 'face',
    labelKey: 'group.face' as TranslationKey,
    typeNames: [
      'hair', 'hair_tie', 'beard', 'facial', 'expression', 'expression_crying',
      'bandana', 'bandana_overlay', 'earrings', 'earring_left', 'earring_right',
    ],
  },
  {
    id: 'clothing',
    labelKey: 'group.clothing' as TranslationKey,
    typeNames: [
      'torso', 'shoulders', 'arms', 'wrists', 'hands', 'legs', 'feet',
      'neck', 'clothes', 'dress', 'dress_sleeves', 'dress_sleeves_trim',
      'dress_trim', 'shoes', 'overalls', 'apron', 'armour', 'chainmail',
      'bracers', 'bauldron', 'hat', 'hat_secondary', 'hat_accessory_secondary',
    ],
  },
  {
    id: 'accessories',
    labelKey: 'group.accessories' as TranslationKey,
    typeNames: [
      'cape', 'cape_trim', 'belt', 'backpack', 'backpack_straps', 'quiver',
      'charm', 'accessory', 'buckles', 'leather_armor_belt', 'bandages', 'cargo',
    ],
  },
  {
    id: 'weapons',
    labelKey: 'group.weapons' as TranslationKey,
    typeNames: ['weapon', 'weapon_magic_crystal', 'shield', 'ammo'],
  },
];

const TYPE_TO_GROUP: ReadonlyMap<TypeName, GroupId> = new Map(
  CATEGORY_GROUPS.flatMap((g) => g.typeNames.map((tn) => [tn, g.id] as const)),
);

export function groupForType(typeName: TypeName): GroupId | null {
  return TYPE_TO_GROUP.get(typeName) ?? null;
}
