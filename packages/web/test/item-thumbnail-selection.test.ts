import { describe, expect, it } from 'vitest';
import type { ItemDefinition } from '@lpc-toolkit/core';
import {
  buildItemThumbnailSelections,
  effectiveThumbnailVariant,
} from '../src/lib/item-thumbnail-selection';

function item(overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    name: 'Twists fade',
    type_name: 'hair',
    animations: ['walk'],
    credits: [],
    layer_1: { zPos: 10, male: 'hair/twists/' },
    ...overrides,
  } as ItemDefinition;
}

describe('item thumbnail selections', () => {
  it('uses the explicit variant before the catalog default', () => {
    expect(effectiveThumbnailVariant('short', item({ variants: ['long'] })))
      .toBe('short');
  });

  it('uses the first declared variant when no explicit variant is supplied', () => {
    expect(effectiveThumbnailVariant(undefined, item({ variants: ['long', 'short'] })))
      .toBe('long');
  });

  it('builds one item selection without choosing a recolor', () => {
    expect(buildItemThumbnailSelections({
      item: item({ variants: ['long'] }),
      bodyType: 'female',
      variant: 'long',
    })).toEqual({
      bodyType: 'female',
      items: {
        hair: { typeName: 'hair', name: 'Twists fade', variant: 'long' },
      },
    });
  });

  it('synthesizes sibling selections for replace_in_path placeholders', () => {
    const selections = buildItemThumbnailSelections({
      item: item({
        type_name: 'expression',
        replace_in_path: {
          head: {
            Human_Male: 'male',
            Human_Female: 'female',
          },
        },
      }),
      bodyType: 'female',
    });

    expect(selections.items.head).toEqual({
      typeName: 'head',
      name: 'Human Female',
    });
  });
});
