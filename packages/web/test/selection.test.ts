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

const { catalog } = createCatalog({
  'body_a.json': defn('Body A', 'body'),
  'hair_a.json': defn('Hair A', 'hair'),
  'hair_b.json': defn('Hair B', 'hair'),
});

describe('pickInitialSelections', () => {
  it('picks a body + first item of each available preferred type', () => {
    const { state, shownTypeNames } = pickInitialSelections(catalog);
    expect(state.bodyType).toBe('male');
    expect(state.selections['body']).toBe('Body A');
    expect(state.selections['hair']).toBe('Hair A');
    expect(shownTypeNames).toContain('body');
    expect(shownTypeNames).toContain('hair');
    expect(state.anim).toBe('walk');
    expect(state.dir).toBe('down');
  });
});

describe('toSelections', () => {
  it('maps state to core Selections using ItemDefinition.name, no variant', () => {
    const state: SliceState = {
      bodyType: 'male',
      selections: { body: 'Body A', hair: 'Hair A' },
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
      selections: { body: 'Body A' },
      anim: 'walk',
      dir: 'down',
      playing: true,
    };
    const s1 = sliceReducer(s0, { type: 'pick', typeName: 'hair', name: 'Hair B' });
    expect(s1.selections['hair']).toBe('Hair B');
    const s2 = sliceReducer(s1, { type: 'clear', typeName: 'hair' });
    expect('hair' in s2.selections).toBe(false);
  });

  it('applies decoded selections without resetting preview controls', () => {
    const s0: SliceState = {
      bodyType: 'male',
      selections: { body: 'Body A', hair: 'Hair A' },
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
      selections: { body: 'Body B', hair: 'Hair B' },
      anim: 'slash',
      dir: 'left',
      playing: false,
    });
  });
});
