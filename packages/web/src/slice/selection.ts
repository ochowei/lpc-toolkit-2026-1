import {
  type AnimationName,
  type BodyType,
  type Catalog,
  type Direction,
  type ItemDefinition,
  type PaletteMetadata,
  type Selection,
  type Selections,
  type TypeName,
} from '@lpc-toolkit/core';
import type { CatalogTreeItem } from './catalog-tree';
import { CATEGORY_GROUPS } from './category-groups';
import { pickDefaults } from './color-options';

/** Preview zoom bounds used by the reducer and preview controls. */
export const MIN_ZOOM = 1;
/** Largest supported integer preview zoom. */
export const MAX_ZOOM = 8;
/** Initial preview zoom used when building/resetting slice state. */
export const DEFAULT_ZOOM = 4;

function clampZoom(z: number): number {
  const r = Math.round(z);
  if (r < MIN_ZOOM) return MIN_ZOOM;
  if (r > MAX_ZOOM) return MAX_ZOOM;
  return r;
}

/** Reducer-owned character selection and preview playback state. */
export interface SliceState {
  readonly bodyType: BodyType;
  readonly selections: Readonly<Record<TypeName, Selection>>;
  readonly anim: AnimationName;
  readonly dir: Direction;
  readonly playing: boolean;
  readonly zoom: number;
  readonly layout: 'single' | 'grid' | 'row';
}

/** User actions that can change selections, playback, body type, or zoom. */
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
  | {
      type: 'reset';
      scopes: { outfit: boolean; view: boolean };
      init: SliceState;
    }
  | { type: 'set_anim'; anim: AnimationName }
  | { type: 'set_dir'; dir: Direction }
  | { type: 'toggle_play' }
  | { type: 'set_zoom'; zoom: number }
  | { type: 'set_layout'; layout: 'single' | 'grid' | 'row' };

/** Pure state reducer for the layer stack UI. */
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
    case 'reset': {
      let next = s;
      if (a.scopes.outfit) {
        next = {
          ...next,
          bodyType: a.init.bodyType,
          selections: a.init.selections,
        };
      }
      if (a.scopes.view) {
        next = {
          ...next,
          anim: a.init.anim,
          dir: a.init.dir,
          playing: a.init.playing,
          zoom: a.init.zoom,
          layout: a.init.layout,
        };
      }
      return next;
    }
    case 'set_anim':
      return { ...s, anim: a.anim };
    case 'set_dir':
      return { ...s, dir: a.dir };
    case 'toggle_play':
      return { ...s, playing: !s.playing };
    case 'set_zoom':
      return { ...s, zoom: clampZoom(a.zoom) };
    case 'set_layout':
      return { ...s, layout: a.layout };
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

/** Convert a catalog item into the Selection shape expected by core. */
export function selectionForItem(
  typeName: TypeName,
  item: ItemDefinition,
  palettes?: PaletteMetadata,
): Selection {
  return {
    typeName,
    name: item.name,
    ...(palettes ? pickDefaults(item, palettes) : {}),
    ...(!palettes && item.variants?.[0] ? { variant: item.variants[0] } : {}),
  };
}

/**
 * Build the `SliceAction.pick` for selecting `item` under `typeName`.
 * Auto-sets the first declared variant so items whose sprites live under
 * a variant-named filename (e.g. `body/bodies/zombie/walk/zombie.png`)
 * render correctly. Items with no variants get no `variant` field — the
 * compose pipeline then loads the flat `walk.png` and recolor handles
 * any per-pixel color.
 */
export function pickActionForItem(
  typeName: TypeName,
  item: ItemDefinition,
): SliceAction {
  return {
    type: 'pick',
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
 * head-to-toe order. Types with no defaults (hair/eyes/clothes/legs/shoes)
 * render as empty selectors the user can pick into. A type-name is
 * included only if the catalog has at least one item of that type, so
 * pared-down test catalogs still work.
 */
export const COMMON_TYPE_ORDER: readonly TypeName[] = [
  'body',
  'head',
  'hair',
  'expression',
  'eyes',
  'clothes',
  'legs',
  'shoes',
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

  // Show every catalog type the user can theoretically pick. COMMON_TYPE_ORDER
  // goes first to preserve the head-to-toe display order in the active-layer
  // list; remaining types follow in CATEGORY_GROUPS declaration order so they
  // appear under the right super-group in AddLayer / SidebarSearch.
  const seen = new Set<TypeName>();
  const shownTypeNames: TypeName[] = [];
  for (const tn of [
    ...COMMON_TYPE_ORDER,
    ...CATEGORY_GROUPS.flatMap((g) => g.typeNames),
  ]) {
    if (seen.has(tn)) continue;
    if ((catalog.byTypeName.get(tn) ?? []).length === 0) continue;
    seen.add(tn);
    shownTypeNames.push(tn);
  }

  return {
    state: {
      bodyType: DEFAULT_BODY_TYPE,
      selections,
      anim: 'walk',
      dir: 'down',
      playing: true,
      zoom: DEFAULT_ZOOM,
      layout: 'single',
    },
    shownTypeNames,
  };
}

/**
 * The `SliceAction` an advanced-tree click should dispatch. Clicking the
 * item already selected for its type toggles it off (`clear`); any other
 * click selects it (`pick`), replacing whatever was selected for that
 * type.
 */
export function treeItemAction(
  selections: Readonly<Record<TypeName, Selection>>,
  item: CatalogTreeItem,
  def: ItemDefinition | undefined,
): SliceAction {
  if (selections[item.typeName]?.name === item.name) {
    return { type: 'clear', typeName: item.typeName };
  }
  return {
    type: 'pick',
    typeName: item.typeName,
    name: item.name,
    ...(def?.variants?.[0] ? { variant: def.variants[0] } : {}),
  };
}

/**
 * The selections as `[typeName, Selection]` pairs in the order the
 * "Selected items" panel renders them: common types first in their
 * head-to-toe order, then any remaining types alphabetically by
 * `typeName`. Entries with an empty `name` are dropped.
 */
export function orderedSelectionEntries(
  selections: Readonly<Record<TypeName, Selection>>,
): [TypeName, Selection][] {
  const entries = Object.entries(selections).filter(
    ([, sel]) => sel.name,
  ) as [TypeName, Selection][];
  const rank = (tn: TypeName): number => {
    const i = COMMON_TYPE_ORDER.indexOf(tn);
    return i === -1 ? COMMON_TYPE_ORDER.length : i;
  };
  return entries.sort(([a], [b]) => {
    const diff = rank(a) - rank(b);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
}
