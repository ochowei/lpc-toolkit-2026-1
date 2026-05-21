import { describe, expect, it } from 'vitest';
import { createCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import {
  pickInitialSelections,
  sliceReducer,
  toSelections,
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
    'body.json': defn('Body Color', 'body'),
    'heads_human_male.json': defn('Human Male', 'head'),
    'face_neutral.json': defn('Neutral', 'expression'),
    'hair_a.json': defn('Hair A', 'hair'),
  }).catalog;
}

describe('pickInitialSelections', () => {
  it('selects body + heads_human_male + face_neutral with light recolor', () => {
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
      recolor: 'light',
    });
    expect(state.selections['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
      recolor: 'light',
    });
    expect(state.anim).toBe('walk');
    expect(state.dir).toBe('down');
    expect(state.playing).toBe(true);
  });

  it('does not pre-select hair / eyes / torso / legs / feet', () => {
    const { state } = pickInitialSelections(makeFullCatalog());
    expect(state.selections['hair']).toBeUndefined();
    expect(state.selections['eyes']).toBeUndefined();
    expect(state.selections['torso']).toBeUndefined();
    expect(state.selections['legs']).toBeUndefined();
    expect(state.selections['feet']).toBeUndefined();
  });

  it('exposes body / head / hair / expression in shownTypeNames so the Common picker shows them', () => {
    const { shownTypeNames } = pickInitialSelections(makeFullCatalog());
    expect(shownTypeNames).toContain('body');
    expect(shownTypeNames).toContain('head');
    expect(shownTypeNames).toContain('expression');
    expect(shownTypeNames).toContain('hair');
    // Order: defaults first, then the remaining "common" types in the
    // declared order.
    expect(shownTypeNames.indexOf('body')).toBeLessThan(
      shownTypeNames.indexOf('head'),
    );
    expect(shownTypeNames.indexOf('head')).toBeLessThan(
      shownTypeNames.indexOf('hair'),
    );
    expect(shownTypeNames.indexOf('hair')).toBeLessThan(
      shownTypeNames.indexOf('expression'),
    );
  });

  it('omits common types whose catalog lookup is empty', () => {
    const { catalog } = createCatalog({
      'body.json': defn('Body Color', 'body'),
      'heads_human_male.json': defn('Human Male', 'head'),
      'face_neutral.json': defn('Neutral', 'expression'),
    });
    const { shownTypeNames } = pickInitialSelections(catalog);
    expect(shownTypeNames).not.toContain('hair');
    expect(shownTypeNames).not.toContain('legs');
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
    };
    const sel = toSelections(state);
    expect(sel.bodyType).toBe('male');
    expect(sel.items['hair']).toEqual({ typeName: 'hair', name: 'Hair A' });
    expect('variant' in sel.items['body']!).toBe(false);
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
    };
    const s1 = sliceReducer(s0, { type: 'pick', typeName: 'hair', name: 'Hair B' });
    expect(s1.selections['hair']).toEqual({
      typeName: 'hair',
      name: 'Hair B',
    });
    const s2 = sliceReducer(s1, { type: 'clear', typeName: 'hair' });
    expect('hair' in s2.selections).toBe(false);
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
    });
  });

  it('preserves decoded selection variants for sprite path composition', () => {
    const s0: SliceState = {
      bodyType: 'male',
      selections: { body: { typeName: 'body', name: 'Body A' } },
      anim: 'walk',
      dir: 'down',
      playing: true,
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
  });

  it('outfit + view reset restores all four fields', () => {
    const s = sliceReducer(mutated, {
      type: 'reset',
      scopes: { outfit: true, view: true },
      init,
    });
    expect(s).toEqual(init);
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
