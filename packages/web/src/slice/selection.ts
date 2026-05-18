import {
  BODY_TYPES,
  type AnimationName,
  type BodyType,
  type Catalog,
  type Direction,
  type ItemDefinition,
  type Selections,
  type TypeName,
} from '@lpc-toolkit/core';

export interface SliceState {
  readonly bodyType: BodyType;
  /** typeName -> ItemDefinition.name (raw name, what core's Selection wants). */
  readonly selections: Readonly<Record<TypeName, string>>;
  readonly anim: AnimationName;
  readonly dir: Direction;
  readonly playing: boolean;
}

export type SliceAction =
  | { type: 'set_body_type'; bodyType: BodyType }
  | { type: 'pick'; typeName: TypeName; name: string }
  | { type: 'clear'; typeName: TypeName }
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
        selections: { ...s.selections, [a.typeName]: a.name },
      };
    case 'clear': {
      const next = { ...s.selections };
      delete next[a.typeName];
      return { ...s, selections: next };
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

/** Core's Selection requires `name` to equal ItemDefinition.name; no variant. */
export function toSelections(state: SliceState): Selections {
  const items: Record<TypeName, { typeName: TypeName; name: string }> = {};
  for (const [typeName, name] of Object.entries(state.selections)) {
    if (name) items[typeName] = { typeName, name };
  }
  return { bodyType: state.bodyType, items };
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
 */
export function pickInitialSelections(catalog: Catalog): {
  state: SliceState;
  shownTypeNames: TypeName[];
} {
  const bodies = catalog.byTypeName.get('body') ?? [];
  let bodyType: BodyType | undefined;
  let bodyName: string | undefined;
  for (const bt of BODY_TYPES) {
    const item = bodies.find((i) => supportsBodyType(i, bt));
    if (item) {
      bodyType = bt;
      bodyName = item.name;
      break;
    }
  }
  if (!bodyType || !bodyName) {
    throw new Error(
      'pickInitialSelections: no "body" item supports any standard body type',
    );
  }

  const shownTypeNames: TypeName[] = ['body'];
  const selections: Record<TypeName, string> = { body: bodyName };
  for (const tn of PREFERRED) {
    if (tn === 'body') continue;
    const items = catalog.byTypeName.get(tn);
    if (!items || items.length === 0) continue;
    shownTypeNames.push(tn);
    const first = items.find((i) => supportsBodyType(i, bodyType!));
    if (first) selections[tn] = first.name;
  }

  return {
    state: { bodyType, selections, anim: 'walk', dir: 'down', playing: true },
    shownTypeNames,
  };
}
