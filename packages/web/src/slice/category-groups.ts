import type { TranslationKey } from '../i18n';
import type { TypeName } from '@lpc-toolkit/core';

/** High-level grouping used by add-layer, search, settings, and random outfit logic. */
export type GroupId =
  | 'body'
  | 'face'
  | 'clothing'
  | 'accessories'
  | 'weapons'
  | 'fx'
  | 'fantasy';

/** User-facing bucket of upstream type_name values. */
export interface CategoryGroup {
  readonly id: GroupId;
  readonly labelKey: TranslationKey;
  readonly typeNames: readonly TypeName[];
}

// TODO(2026-05-25): removed dead keys `facial` / `torso` / `hands` /
// `feet` / `hair_tie` / `hat_secondary` / `hat_accessory_secondary` /
// `leather_armor_belt` (no matching catalog `type_name`). Coverage
// test in category-groups.test.ts will fail if either direction breaks.
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
      'hair', 'beard', 'expression', 'expression_crying',
      'bandana', 'bandana_overlay', 'earrings', 'earring_left', 'earring_right',
      'ponytail', 'updo', 'mustache',
      'hairextl', 'hairextr', 'hairtie', 'hairtie_rune',
      'facial_eyes', 'facial_left', 'facial_left_trim',
      'facial_mask', 'facial_right', 'facial_right_trim',
      'visor',
    ],
  },
  {
    id: 'clothing',
    labelKey: 'group.clothing' as TranslationKey,
    typeNames: [
      'shoulders', 'arms', 'wrists', 'legs', 'clothes',
      'dress', 'dress_sleeves', 'dress_sleeves_trim', 'dress_trim',
      'shoes', 'overalls', 'apron', 'armour', 'chainmail',
      'bracers', 'bauldron', 'hat', 'neck',
      'jacket', 'jacket_collar', 'jacket_pockets', 'jacket_trim',
      'sleeves', 'socks', 'vest',
      'hat_accessory', 'hat_buckle', 'hat_overlay', 'hat_trim',
      'headcover', 'headcover_rune',
      'shoes_toe',
    ],
  },
  {
    id: 'accessories',
    labelKey: 'group.accessories' as TranslationKey,
    typeNames: [
      'cape', 'cape_trim', 'belt', 'backpack', 'backpack_straps', 'quiver',
      'charm', 'accessory', 'buckles', 'bandages', 'cargo',
      'gloves', 'necklace', 'ring', 'sash', 'sash_tie',
    ],
  },
  {
    id: 'weapons',
    labelKey: 'group.weapons' as TranslationKey,
    typeNames: [
      'weapon', 'weapon_magic_crystal', 'shield', 'ammo',
      'shield_paint', 'shield_pattern', 'shield_trim',
    ],
  },
  {
    id: 'fx',
    labelKey: 'group.fx' as TranslationKey,
    typeNames: [
      'wound_arm', 'wound_brain', 'wound_eye_left', 'wound_eye_right',
      'wound_mouth', 'wound_ribs',
      'shadow', 'wrinkles',
      'prosthesis_hand', 'prosthesis_leg', 'wheelchair',
    ],
  },
  {
    id: 'fantasy',
    labelKey: 'group.fantasy' as TranslationKey,
    typeNames: [
      'horns', 'wings', 'wings_dots', 'wings_edge',
      'fins', 'furry_ears', 'furry_ears_skin', 'tail',
    ],
  },
];

const TYPE_TO_GROUP: ReadonlyMap<TypeName, GroupId> = new Map(
  CATEGORY_GROUPS.flatMap((g) => g.typeNames.map((tn) => [tn, g.id] as const)),
);

/** Return the high-level group containing a type_name, if it is configured. */
export function groupForType(typeName: TypeName): GroupId | null {
  return TYPE_TO_GROUP.get(typeName) ?? null;
}
