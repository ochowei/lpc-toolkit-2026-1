import {
  BODY_TYPES,
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

const PREFERRED: readonly TypeName[] = [
  'body',
  'head',
  'hair',
  'eyes',
  'torso',
  'legs',
  'feet',
];

function supportsBodyType(item: ItemDefinition, bt: BodyType): boolean {
  return typeof item.layer_1?.[bt] === 'string';
}

/**
 * Derive a known-good starting outfit from the live catalog (spec deviation
 * 4). Body type = first BODY_TYPES value some body item supports. shownTypeNames
 * = the preferred types present in the catalog; the body type is always shown.
 *
 * Deterministic only w.r.t. catalog order: it first-matches over
 * `byTypeName` arrays, whose order follows the `records` insertion order
 * passed to `createCatalog`. Callers that must agree (the copy script and
 * the app) MUST build `records` in the same order — sort by the
 * sheet_definitions-relative key. Otherwise the bundled asset subset can
 * diverge from what the app composes.
 */
export function pickInitialSelections(catalog: Catalog): {
  state: SliceState;
  shownTypeNames: TypeName[];
} {
  const bodies = catalog.byTypeName.get('body') ?? [];
  let bodyType: BodyType | undefined;
  let bodyItem: ItemDefinition | undefined;
  for (const bt of BODY_TYPES) {
    const item = bodies.find((i) => supportsBodyType(i, bt));
    if (item) {
      bodyType = bt;
      bodyItem = item;
      break;
    }
  }
  if (!bodyType || !bodyItem) {
    throw new Error(
      'pickInitialSelections: no "body" item supports any standard body type',
    );
  }

  const shownTypeNames: TypeName[] = ['body'];
  const selections: Record<TypeName, Selection> = {
    body: selectionForItem('body', bodyItem),
  };
  for (const tn of PREFERRED) {
    if (tn === 'body') continue;
    const items = catalog.byTypeName.get(tn);
    if (!items || items.length === 0) continue;
    shownTypeNames.push(tn);
    const first = items.find((i) => supportsBodyType(i, bodyType!));
    if (first) selections[tn] = selectionForItem(tn, first);
  }

  return {
    state: { bodyType, selections, anim: 'walk', dir: 'down', playing: true },
    shownTypeNames,
  };
}
