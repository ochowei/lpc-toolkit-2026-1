import { describe, expect, it } from 'vitest';
import {
  createCatalog,
  createPaletteCatalog,
  parseHash,
  type ItemDefinition,
  type Selections,
} from '@lpc-toolkit/core';
import {
  orderedSelectionEntries,
  pickActionForItem,
  pickInitialSelections,
  sliceReducer,
  toSelections,
  treeItemAction,
  type SliceState,
} from '../src/slice/selection';

function defn(
  name: string,
  type_name: string,
  bodyType = 'male',
): ItemDefinition {
  return {
    name,
    type_name,
    animations: ['walk'],
    credits: [],
    layer_1: { zPos: 10, [bodyType]: `${type_name}/${name}/` },
  } as unknown as ItemDefinition;
}

function makeFullCatalog() {
  return createCatalog({
    'body/body.json': defn('Body Color', 'body'),
    'head/heads_human_male.json': {
      ...defn('Human Male', 'head'),
      match_body_color: true,
    },
    'head/face_neutral.json': {
      ...defn('Neutral', 'expression'),
      match_body_color: true,
    },
    'hair/hair_a.json': defn('Hair A', 'hair'),
  }).catalog;
}

function decodedPrototypeSelection(): Selections {
  const catalog = createCatalog({
    'torso/proto-coat.json': {
      ...defn('Proto Coat', 'coat'),
      recolors: {
        color_1: { material: 'cloth', palettes: ['v1'] },
        color_2: {
          material: 'cloth',
          palettes: ['v1'],
          type_name: '__proto__',
        },
      },
    },
  }).catalog;
  const palettes = createPaletteCatalog({
    'cloth/meta_cloth.json': {
      type: 'material',
      default: 'v1',
      base: 'white',
    },
    'cloth/cloth_v1.json': {
      white: ['#ffffff'],
      crimson: ['#dc143c'],
    },
  }).palettes;
  const decoded = parseHash(
    '#sex=male&__proto__=Proto_Coat_crimson',
    catalog,
    palettes,
  );
  expect(decoded.warnings).toEqual([]);
  expect(Object.hasOwn(decoded.selections.items, '__proto__')).toBe(true);
  return decoded.selections;
}

describe('pickInitialSelections', () => {
  it('selects defaults without storing ignored linked primary colors', () => {
    const { state } = pickInitialSelections(makeFullCatalog());
    expect(state.bodyType).toBe('male');
    expect(state.selections['body']).toEqual({
      typeName: 'body',
      name: 'Body Color',
      recolor: 'light',
    });
    expect(state.selections['head']).toEqual({
      typeName: 'head',
      name: 'Human Male',
    });
    expect(state.selections['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(state.anim).toBe('walk');
    expect(state.dir).toBe('down');
    expect(state.playing).toBe(true);
    expect(state.zoom).toBe(4);
  });

  it('does not pre-select hair / eyes / clothes / legs / shoes', () => {
    const { state } = pickInitialSelections(makeFullCatalog());
    expect(state.selections['hair']).toBeUndefined();
    expect(state.selections['eyes']).toBeUndefined();
    expect(state.selections['clothes']).toBeUndefined();
    expect(state.selections['legs']).toBeUndefined();
    expect(state.selections['shoes']).toBeUndefined();
  });

  it('exposes body / head / hair / expression in upstream group order', () => {
    const { shownTypeNames } = pickInitialSelections(makeFullCatalog());
    expect(shownTypeNames).toContain('body');
    expect(shownTypeNames).toContain('head');
    expect(shownTypeNames).toContain('expression');
    expect(shownTypeNames).toContain('hair');
    expect(shownTypeNames.indexOf('body')).toBeLessThan(
      shownTypeNames.indexOf('head'),
    );
    expect(shownTypeNames.indexOf('head')).toBeLessThan(
      shownTypeNames.indexOf('expression'),
    );
    expect(shownTypeNames.indexOf('expression')).toBeLessThan(
      shownTypeNames.indexOf('hair'),
    );
  });

  it('omits common types whose catalog lookup is empty', () => {
    const { catalog } = createCatalog({
      'body/body.json': defn('Body Color', 'body'),
      'head/heads_human_male.json': defn('Human Male', 'head'),
      'head/face_neutral.json': defn('Neutral', 'expression'),
    });
    const { shownTypeNames } = pickInitialSelections(catalog);
    expect(shownTypeNames).not.toContain('hair');
    expect(shownTypeNames).not.toContain('legs');
  });

  it('includes non-default upstream type names when catalog has them', () => {
    const { catalog } = createCatalog({
      'body/body.json': defn('Body Color', 'body'),
      'head/heads_human_male.json': defn('Human Male', 'head'),
      'head/face_neutral.json': defn('Neutral', 'expression'),
      'weapons/sword.json': defn('Sword', 'weapon'),
      'weapons/shields/heater.json': defn('Heater', 'shield'),
      'body/wings/feather.json': defn('Feather Wings', 'wings'),
    });
    const { shownTypeNames } = pickInitialSelections(catalog);
    expect(shownTypeNames).toContain('weapon');
    expect(shownTypeNames).toContain('shield');
    expect(shownTypeNames).toContain('wings');
    // COMMON priority preserved: body still appears before weapon
    expect(shownTypeNames.indexOf('body')).toBeLessThan(
      shownTypeNames.indexOf('weapon'),
    );
  });

  it('throws when a required default itemId is missing from the catalog', () => {
    const { catalog } = createCatalog({
      'body.json': defn('Body Color', 'body'),
      'face_neutral.json': defn('Neutral', 'expression'),
      // heads_human_male intentionally absent
    });
    expect(() => pickInitialSelections(catalog)).toThrowError(
      /heads_human_male/,
    );
  });
});

describe('toSelections', () => {
  it('maps state to core Selections using ItemDefinition.name, no variant', () => {
    const state: SliceState = {
      bodyType: 'male',
      selections: {
        body: { typeName: 'body', name: 'Body A' },
        hair: { typeName: 'hair', name: 'Hair A' },
      },
      anim: 'walk',
      dir: 'down',
      playing: true,
      zoom: 4,
      layout: 'single',
    };
    const sel = toSelections(state);
    expect(sel.bodyType).toBe('male');
    expect(sel.items['hair']).toEqual({ typeName: 'hair', name: 'Hair A' });
    expect('variant' in sel.items['body']!).toBe(false);
  });

  it('does not surface zoom (view state, not part of selection token)', () => {
    const state: SliceState = {
      bodyType: 'male',
      selections: {
        body: { typeName: 'body', name: 'Body A' },
      },
      anim: 'walk',
      dir: 'down',
      playing: true,
      zoom: 7,
      layout: 'single',
    };
    const sel = toSelections(state);
    expect('zoom' in sel).toBe(false);
  });

  it('retains a validated __proto__ selection when mapping state to core', () => {
    const decoded = decodedPrototypeSelection();
    const state: SliceState = {
      bodyType: decoded.bodyType,
      selections: decoded.items,
      anim: 'walk',
      dir: 'down',
      playing: true,
      zoom: 4,
      layout: 'single',
    };

    const selections = toSelections(state);

    expect(Object.hasOwn(selections.items, '__proto__')).toBe(true);
    expect(selections.items['__proto__']).toEqual(
      decoded.items['__proto__'],
    );
  });
});

describe('sliceReducer', () => {
  it('pick sets, clear removes', () => {
    const s0: SliceState = {
      bodyType: 'male',
      selections: { body: { typeName: 'body', name: 'Body A' } },
      anim: 'walk',
      dir: 'down',
      playing: true,
      zoom: 4,
      layout: 'single',
    };
    const s1 = sliceReducer(s0, { type: 'pick', typeName: 'hair', name: 'Hair B' });
    expect(s1.selections['hair']).toEqual({
      typeName: 'hair',
      name: 'Hair B',
    });
    const s2 = sliceReducer(s1, { type: 'clear', typeName: 'hair' });
    expect('hair' in s2.selections).toBe(false);
  });

  it('sets and clears an asset-owned secondary channel override', () => {
    const s0: SliceState = {
      bodyType: 'male',
      selections: { head: { typeName: 'head', name: 'Head A' } },
      anim: 'walk',
      dir: 'down',
      playing: true,
      zoom: 4,
      layout: 'single',
    };
    const s1 = sliceReducer(s0, {
      type: 'set_channel_recolor',
      typeName: 'head',
      channelId: 'eyes',
      recolor: 'red',
    });
    expect(s1.selections.head?.channelRecolors).toEqual({ eyes: 'red' });

    const s2 = sliceReducer(s1, {
      type: 'clear_channel_recolor',
      typeName: 'head',
      channelId: 'eyes',
    });
    expect(s2.selections.head).toEqual({ typeName: 'head', name: 'Head A' });
  });

  it('applies decoded selections without resetting preview controls', () => {
    const s0: SliceState = {
      bodyType: 'male',
      selections: {
        body: { typeName: 'body', name: 'Body A' },
        hair: { typeName: 'hair', name: 'Hair A' },
      },
      anim: 'slash',
      dir: 'left',
      playing: false,
      zoom: 4,
      layout: 'single',
    };

    const s1 = sliceReducer(s0, {
      type: 'apply_selections',
      selections: {
        bodyType: 'female',
        items: {
          body: { typeName: 'body', name: 'Body B' },
          hair: { typeName: 'hair', name: 'Hair B', variant: 'blue' },
        },
      },
    });

    expect(s1).toEqual({
      bodyType: 'female',
      selections: {
        body: { typeName: 'body', name: 'Body B' },
        hair: { typeName: 'hair', name: 'Hair B', variant: 'blue' },
      },
      anim: 'slash',
      dir: 'left',
      playing: false,
      zoom: 4,
      layout: 'single',
    });
  });

  it('applies a validated __proto__ selection without losing it', () => {
    const decoded = decodedPrototypeSelection();
    const s0: SliceState = {
      bodyType: 'male',
      selections: {},
      anim: 'slash',
      dir: 'left',
      playing: false,
      zoom: 4,
      layout: 'single',
    };

    const applied = sliceReducer(s0, {
      type: 'apply_selections',
      selections: decoded,
    });

    expect(Object.hasOwn(applied.selections, '__proto__')).toBe(true);
    expect(applied.selections['__proto__']).toEqual(
      decoded.items['__proto__'],
    );
  });

  it('preserves decoded selection variants for sprite path composition', () => {
    const s0: SliceState = {
      bodyType: 'male',
      selections: { body: { typeName: 'body', name: 'Body A' } },
      anim: 'walk',
      dir: 'down',
      playing: true,
      zoom: 4,
      layout: 'single',
    };

    const s1 = sliceReducer(s0, {
      type: 'apply_selections',
      selections: {
        bodyType: 'male',
        items: {
          body: { typeName: 'body', name: 'Skeleton', variant: 'skeleton' },
        },
      },
    });

    expect(toSelections(s1).items['body']).toEqual({
      typeName: 'body',
      name: 'Skeleton',
      variant: 'skeleton',
    });
  });
});

describe('sliceReducer reset', () => {
  const init: SliceState = {
    bodyType: 'male',
    selections: {
      body: { typeName: 'body', name: 'Body Color', recolor: 'light' },
      head: { typeName: 'head', name: 'Human Male', recolor: 'light' },
      expression: { typeName: 'expression', name: 'Neutral', recolor: 'light' },
    },
    anim: 'walk',
    dir: 'down',
    playing: true,
    zoom: 4,
    layout: 'single',
  };

  const mutated: SliceState = {
    bodyType: 'female',
    selections: {
      body: { typeName: 'body', name: 'Body Color', recolor: 'light' },
      hair: { typeName: 'hair', name: 'Hair A' },
    },
    anim: 'slash',
    dir: 'left',
    playing: false,
    zoom: 2,
    layout: 'single',
  };

  it('outfit-only reset restores bodyType + selections, leaves view untouched', () => {
    const s = sliceReducer(mutated, {
      type: 'reset',
      scopes: { outfit: true, view: false },
      init,
    });
    expect(s.bodyType).toBe(init.bodyType);
    expect(s.selections).toEqual(init.selections);
    expect(s.anim).toBe(mutated.anim);
    expect(s.dir).toBe(mutated.dir);
    expect(s.playing).toBe(mutated.playing);
    expect(s.zoom).toBe(mutated.zoom);
  });

  it('view-only reset restores anim/dir/playing, leaves outfit untouched', () => {
    const s = sliceReducer(mutated, {
      type: 'reset',
      scopes: { outfit: false, view: true },
      init,
    });
    expect(s.bodyType).toBe(mutated.bodyType);
    expect(s.selections).toEqual(mutated.selections);
    expect(s.anim).toBe(init.anim);
    expect(s.dir).toBe(init.dir);
    expect(s.playing).toBe(init.playing);
    expect(s.zoom).toBe(init.zoom);
  });

  it('outfit + view reset restores all four fields', () => {
    const s = sliceReducer(mutated, {
      type: 'reset',
      scopes: { outfit: true, view: true },
      init,
    });
    expect(s).toEqual(init);
    expect(s.zoom).toBe(init.zoom);
  });

  it('reset with no scopes is a no-op', () => {
    const s = sliceReducer(mutated, {
      type: 'reset',
      scopes: { outfit: false, view: false },
      init,
    });
    expect(s).toEqual(mutated);
  });
});

describe('orderedSelectionEntries', () => {
  it('orders common types head-to-toe, ahead of non-common types', () => {
    const entries = orderedSelectionEntries({
      weapon: { typeName: 'weapon', name: 'Sword' },
      hair: { typeName: 'hair', name: 'Hair A' },
      body: { typeName: 'body', name: 'Body A' },
    });
    expect(entries.map(([tn]) => tn)).toEqual(['body', 'hair', 'weapon']);
  });

  it('sorts non-common types alphabetically by typeName', () => {
    const entries = orderedSelectionEntries({
      wings: { typeName: 'wings', name: 'Wings A' },
      cape: { typeName: 'cape', name: 'Cape A' },
    });
    expect(entries.map(([tn]) => tn)).toEqual(['cape', 'wings']);
  });

  it('drops entries with an empty name', () => {
    const entries = orderedSelectionEntries({
      body: { typeName: 'body', name: 'Body A' },
      hair: { typeName: 'hair', name: '' },
    });
    expect(entries.map(([tn]) => tn)).toEqual(['body']);
  });

  it('returns an empty array for empty selections', () => {
    expect(orderedSelectionEntries({})).toEqual([]);
  });
});

describe('treeItemAction', () => {
  const item = { id: 'sword_a', name: 'Sword', typeName: 'weapon' };

  it('returns a pick action when the item is not selected', () => {
    const action = treeItemAction({}, item, undefined);
    expect(action).toEqual({
      type: 'pick',
      typeName: 'weapon',
      name: 'Sword',
    });
  });

  it('includes the first variant when the definition has variants', () => {
    const def = { variants: ['steel', 'iron'] } as unknown as ItemDefinition;
    const action = treeItemAction({}, item, def);
    expect(action).toEqual({
      type: 'pick',
      typeName: 'weapon',
      name: 'Sword',
      variant: 'steel',
    });
  });

  it('returns a clear action when the item is the current selection', () => {
    const action = treeItemAction(
      { weapon: { typeName: 'weapon', name: 'Sword' } },
      item,
      undefined,
    );
    expect(action).toEqual({ type: 'clear', typeName: 'weapon' });
  });

  it('returns a pick action when a different item of the same type is selected', () => {
    const action = treeItemAction(
      { weapon: { typeName: 'weapon', name: 'Axe' } },
      item,
      undefined,
    );
    expect(action).toEqual({
      type: 'pick',
      typeName: 'weapon',
      name: 'Sword',
    });
  });

  it('transfers only valid same-name channels to a replacement item', () => {
    const palettes = createPaletteCatalog({
      'm/meta_m.json': { type: 'material', default: 'v1', base: 'base' },
      'm/m_v1.json': {
        base: ['#000000'],
        red: ['#ff0000'],
      },
    }).palettes;
    const replacement: ItemDefinition = {
      ...defn('Sword', 'weapon'),
      recolors: {
        color_1: { material: 'm', palettes: ['v1'] },
        color_2: {
          material: 'm',
          palettes: ['v1'],
          type_name: 'grip',
        },
      },
    };
    const action = pickActionForItem('weapon', replacement, {
      palettes,
      previous: {
        typeName: 'weapon',
        name: 'Axe',
        channelRecolors: { grip: 'red', removed: 'red' },
      },
    });

    expect(action).toEqual({
      type: 'pick',
      typeName: 'weapon',
      name: 'Sword',
      channelRecolors: { grip: 'red' },
    });
  });
});

describe('sliceReducer set_zoom', () => {
  const base: SliceState = {
    bodyType: 'male',
    selections: { body: { typeName: 'body', name: 'Body A' } },
    anim: 'walk',
    dir: 'down',
    playing: true,
    zoom: 4,
    layout: 'single',
  };

  it('clamps zoom to MIN_ZOOM lower bound', () => {
    const s = sliceReducer(base, { type: 'set_zoom', zoom: 0 });
    expect(s.zoom).toBe(1);
  });

  it('clamps zoom to MAX_ZOOM upper bound', () => {
    const s = sliceReducer(base, { type: 'set_zoom', zoom: 12 });
    expect(s.zoom).toBe(8);
  });

  it('rounds non-integer zoom to nearest integer (defensive)', () => {
    const s = sliceReducer(base, { type: 'set_zoom', zoom: 3.6 });
    expect(s.zoom).toBe(4);
    const s2 = sliceReducer(base, { type: 'set_zoom', zoom: 3.4 });
    expect(s2.zoom).toBe(3);
  });

  it('accepts in-range integer unchanged', () => {
    const s = sliceReducer(base, { type: 'set_zoom', zoom: 6 });
    expect(s.zoom).toBe(6);
  });
});

describe('selection slice layout', () => {
  it('sets layout correctly', () => {
    const { state: init } = pickInitialSelections(makeFullCatalog());
    expect(init.layout).toBe('grid');
    const next = sliceReducer(init, { type: 'set_layout', layout: 'single' });
    expect(next.layout).toBe('single');
  });

  it('resets layout to init layout on reset view scope', () => {
    const { state: init } = pickInitialSelections(makeFullCatalog());
    const changed = sliceReducer(init, { type: 'set_layout', layout: 'row' });
    const resetState = sliceReducer(changed, {
      type: 'reset',
      scopes: { outfit: false, view: true },
      init,
    });
    expect(resetState.layout).toBe('grid');
  });
});
