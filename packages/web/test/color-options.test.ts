/** Verifies item color-option derivation from recolor palettes and variants. */
import { describe, expect, it } from 'vitest';
import { createPaletteCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import { getColorOptions, pickDefaults } from '../src/slice/color-options';

const palettes = createPaletteCatalog({
  'm/meta_m.json': { type: 'material', default: 'v1', base: 'c0' },
  'm/m_v1.json': {
    c0: ['#000000', '#111111'],
    red: ['#ff0000', '#ee0000'],
  },
}).palettes;

const recolorItem: ItemDefinition = {
  name: 'Recolor Thing',
  type_name: 't',
  animations: ['walk'],
  credits: [],
  recolors: { material: 'm', palettes: ['v1'] },
  layer_1: { zPos: 1, male: 't/' },
};

const variantItem: ItemDefinition = {
  name: 'Variant Thing',
  type_name: 't',
  animations: ['walk'],
  credits: [],
  variants: ['black', 'bright_green'],
  layer_1: { zPos: 1, male: 't/' },
};

const plainItem: ItemDefinition = {
  name: 'Plain Thing',
  type_name: 't',
  animations: ['walk'],
  credits: [],
  layer_1: { zPos: 1, male: 't/' },
};

describe('getColorOptions', () => {
  it('returns real color swatches for a recolors item', () => {
    expect(getColorOptions(recolorItem, palettes)).toEqual({
      mode: 'recolors',
      options: [
        { kind: 'recolor', value: 'c0', swatch: '#111111', label: 'C0' },
        { kind: 'recolor', value: 'red', swatch: '#ee0000', label: 'Red' },
      ],
    });
  });

  it('returns named chips for a variants item', () => {
    expect(getColorOptions(variantItem, palettes)).toEqual({
      mode: 'variants',
      options: [
        { kind: 'variant', value: 'black', label: 'Black' },
        { kind: 'variant', value: 'bright_green', label: 'Bright green' },
      ],
    });
  });

  it('returns mode "none" for an item with no colors', () => {
    expect(getColorOptions(plainItem, palettes)).toEqual({ mode: 'none' });
  });
});

describe('pickDefaults', () => {
  it('defaults a recolors item to its first color', () => {
    expect(pickDefaults(recolorItem, palettes)).toEqual({ recolor: 'c0' });
  });

  it('defaults a variants item to its first variant', () => {
    expect(pickDefaults(variantItem, palettes)).toEqual({ variant: 'black' });
  });

  it('returns no color fields for an item with no colors', () => {
    expect(pickDefaults(plainItem, palettes)).toEqual({});
  });

  it('returns no color fields for a missing item', () => {
    expect(pickDefaults(undefined, palettes)).toEqual({});
  });
});
