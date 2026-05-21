import {
  type AnimationName,
  type BodyType,
  type Catalog,
  type Direction,
  type ItemDefinition,
  type Selection,
  type Selections,
  type TypeName,
} from '@lpc-toolkit/core';

export interface SliceState {
  readonly bodyType: BodyType;
  readonly selections: Readonly<Record<TypeName, Selection>>;
  readonly anim: AnimationName;
  readonly dir: Direction;
  readonly playing: boolean;
}

export type SliceAction =
  | { type: 'set_body_type'; bodyType: BodyType }
  | {
      type: 'pick';
      typeName: TypeName;
      name: string;
      variant?: string;
      recolor?: string;
    }
  | { type: 'clear'; typeName: TypeName }
  | { type: 'apply_selections'; selections: Selections }
  | { type: 'set_anim'; anim: AnimationName }
  | { type: 'set_dir'; dir: Direction }
  | { type: 'toggle_play' };

export function sliceReducer(s: SliceState, a: SliceAction): SliceState {
  switch (a.type) {
    case 'set_body_type':
      return { ...s, bodyType: a.bodyType };
    case 'pick':
      return {
        ...s,
        selections: {
          ...s.selections,
          [a.typeName]: {
            typeName: a.typeName,
            name: a.name,
            ...(a.variant ? { variant: a.variant } : {}),
            ...(a.recolor ? { recolor: a.recolor } : {}),
          },
        },
      };
    case 'clear': {
      const next = { ...s.selections };
      delete next[a.typeName];
      return { ...s, selections: next };
    }
    case 'apply_selections': {
      const selections: Record<TypeName, Selection> = {};
      for (const [typeName, item] of Object.entries(a.selections.items)) {
        selections[typeName] = item;
      }
      return {
        ...s,
        bodyType: a.selections.bodyType,
        selections,
      };
    }
    case 'set_anim':
      return { ...s, anim: a.anim };
    case 'set_dir':
      return { ...s, dir: a.dir };
    case 'toggle_play':
      return { ...s, playing: !s.playing };
    default:
      return s;
  }
}

/** Core's Selection requires `name` to equal ItemDefinition.name. */
export function toSelections(state: SliceState): Selections {
  const items: Record<TypeName, Selection> = {};
  for (const [typeName, selection] of Object.entries(state.selections)) {
    if (selection.name) items[typeName] = selection;
  }
  return { bodyType: state.bodyType, items };
}

export function selectionForItem(
  typeName: TypeName,
  item: ItemDefinition,
): Selection {
  return {
    typeName,
    name: item.name,
    ...(item.variants?.[0] ? { variant: item.variants[0] } : {}),
  };
}

/**
 * itemId (filename minus `.json`) of each default the upstream generator
 * pre-selects on first load. Keyed by the `type_name` field each item
 * declares so the lookup result can be assigned straight into selections.
 *
 * Source: upstream `selectDefaults()` at
 * `upstream/sources/state/state.ts:161`.
 */
const DEFAULT_ITEM_IDS = {
  body: 'body',
  head: 'heads_human_male',
  expression: 'face_neutral',
} as const;

const DEFAULT_RECOLOR = 'light';

const DEFAULT_BODY_TYPE: BodyType = 'male';

/**
 * Common-picker order. `expression` is slotted next to its visual
 * neighbours (head/hair); the other entries preserve the previous flat
 * head-to-toe order. Types with no defaults (hair/eyes/torso/legs/feet)
 * render as empty selectors the user can pick into. A type-name is
 * included only if the catalog has at least one item of that type, so
 * pared-down test catalogs still work.
 */
const COMMON_TYPE_ORDER: readonly TypeName[] = [
  'body',
  'head',
  'hair',
  'expression',
  'eyes',
  'torso',
  'legs',
  'feet',
];

/**
 * Build the initial outfit matching the upstream generator's defaults:
 * male body + `heads_human_male` + `face_neutral`, all with the `light`
 * recolor. Items are looked up by stable itemId (the JSON filename), so
 * the result is independent of catalog insertion order.
 *
 * Throws if any of the three required items is missing from the catalog
 * — that means a real bundling bug, not a runtime fallback case.
 */
export function pickInitialSelections(catalog: Catalog): {
  state: SliceState;
  shownTypeNames: TypeName[];
} {
  const selections: Record<TypeName, Selection> = {};
  for (const [typeName, itemId] of Object.entries(DEFAULT_ITEM_IDS) as [
    TypeName,
    string,
  ][]) {
    const item = catalog.byItemId.get(itemId);
    if (!item) {
      throw new Error(
        `pickInitialSelections: missing required default item "${itemId}" in catalog`,
      );
    }
    selections[typeName] = {
      typeName,
      name: item.name,
      recolor: DEFAULT_RECOLOR,
    };
  }

  const shownTypeNames = COMMON_TYPE_ORDER.filter(
    (tn) => (catalog.byTypeName.get(tn) ?? []).length > 0,
  );

  return {
    state: {
      bodyType: DEFAULT_BODY_TYPE,
      selections,
      anim: 'walk',
      dir: 'down',
      playing: true,
    },
    shownTypeNames,
  };
}
