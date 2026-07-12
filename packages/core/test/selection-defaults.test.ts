import {
  createPaletteCatalog,
  getDefaultColorSelection,
  type ItemDefinition,
} from '../src/index.js';
import { describe, expect, it } from 'vitest';

const palettes = createPaletteCatalog({
  'hair/meta_hair.json': { type: 'material', default: 'ulpc', base: 'black' },
  'hair/hair_ulpc.json': {
    black: ['#111111', '#222222'],
    orange: ['#cc5500', '#ee7700'],
  },
}).palettes;

function item(overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    name: 'Hair',
    type_name: 'hair',
    animations: ['walk'],
    credits: [],
    layer_1: { zPos: 50, male: 'hair/' },
    ...overrides,
  };
}

describe('getDefaultColorSelection', () => {
  it('uses the first recolor swatch before declared variants', () => {
    expect(getDefaultColorSelection(item({
      recolors: { material: 'hair', palettes: ['ulpc'] },
      variants: ['brown'],
    }), palettes)).toEqual({ recolor: 'black' });
  });

  it('falls back to the first variant when recolors are unavailable', () => {
    expect(getDefaultColorSelection(item({ variants: ['brown'] }), palettes)).toEqual({
      variant: 'brown',
    });
  });

  it('returns no fields for an item with no color choices', () => {
    expect(getDefaultColorSelection(item(), palettes)).toEqual({});
    expect(getDefaultColorSelection(undefined, palettes)).toEqual({});
  });
});
