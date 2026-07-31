/** Verifies item color-option derivation from recolor palettes and variants. */
import { describe, expect, it } from 'vitest';
import { createPaletteCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import {
  getColorOptions,
  pickDefaults,
  transferChannelRecolors,
} from '../src/slice/color-options';

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

const recolorAndVariantItem: ItemDefinition = {
  ...recolorItem,
  variants: ['black'],
};

const linkedRecolorItem: ItemDefinition = {
  ...recolorItem,
  name: 'Linked Thing',
  recolors: {
    material: 'm',
    palettes: ['v1'],
    linked_to: { selection: 'body', channel: 'primary' },
  },
};

const legacyLinkedRecolorItem: ItemDefinition = {
  ...recolorItem,
  name: 'Legacy Linked Thing',
  match_body_color: true,
};

const bodyRecolorItem: ItemDefinition = {
  ...recolorItem,
  name: 'Body Color',
  type_name: 'body',
};

const multiRecolorItem: ItemDefinition = {
  ...recolorItem,
  name: 'Multi Thing',
  recolors: {
    color_1: { material: 'm', palettes: ['v1'] },
    color_2: {
      material: 'm',
      palettes: ['v1'],
      type_name: 'accent',
    },
    color_3: {
      material: 'm',
      palettes: ['v1'],
      type_name: 'skin',
      linked_to: { selection: 'body', channel: 'primary' },
    },
  },
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

  it('returns the resolved body color as read-only for a followed non-body item', () => {
    expect(
      getColorOptions(linkedRecolorItem, palettes, { bodyRecolor: 'red' }),
    ).toEqual({
      mode: 'linked-recolor',
      recolor: 'red',
      swatch: '#ee0000',
    });
  });

  it('keeps the legacy match flag readable during pinned-release migration', () => {
    expect(
      getColorOptions(legacyLinkedRecolorItem, palettes, { bodyRecolor: 'red' }),
    ).toMatchObject({
      mode: 'linked-recolor',
      recolor: 'red',
    });
  });

  it('keeps the body primary recolor editable', () => {
    expect(getColorOptions(bodyRecolorItem, palettes, { bodyRecolor: 'red' }))
      .toEqual({
        mode: 'recolors',
        options: [
          { kind: 'recolor', value: 'c0', swatch: '#111111', label: 'C0' },
          { kind: 'recolor', value: 'red', swatch: '#ee0000', label: 'Red' },
        ],
      });
  });

  it('returns mode "none" for an item with no colors', () => {
    expect(getColorOptions(plainItem, palettes)).toEqual({ mode: 'none' });
  });
});

describe('pickDefaults', () => {
  it('uses the shared recolor-first priority', () => {
    expect(pickDefaults(recolorAndVariantItem, palettes)).toEqual({ recolor: 'c0' });
  });

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

  it('does not invent a local primary value for a followed item', () => {
    expect(pickDefaults(linkedRecolorItem, palettes)).toEqual({});
  });
});

describe('transferChannelRecolors', () => {
  it('keeps only valid same-name independent channel values', () => {
    expect(transferChannelRecolors({
      typeName: 't',
      name: 'Old Thing',
      channelRecolors: {
        accent: 'red',
        skin: 'red',
        removed: 'red',
      },
    }, multiRecolorItem, palettes)).toEqual({
      accent: 'red',
    });
  });

  it('drops a same-name value that is invalid for the replacement channel', () => {
    expect(transferChannelRecolors({
      typeName: 't',
      name: 'Old Thing',
      channelRecolors: { accent: 'missing' },
    }, multiRecolorItem, palettes)).toBeUndefined();
  });
});
