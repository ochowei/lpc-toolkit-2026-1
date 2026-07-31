import { describe, expect, it } from 'vitest';
import {
  createCatalog,
  createPaletteCatalog,
  type ItemDefinition,
  type Selection,
} from '@lpc-toolkit/core';
import { computePresetSelection } from '../src/presets-apply';
import type { Preset } from '../src/presets';

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

const palettes = createPaletteCatalog({
  'cloth/meta_cloth.json': { type: 'material', default: 'ulpc', base: 'white' },
  'cloth/cloth_ulpc.json': {
    brown: ['#3b2618'],
    white: ['#ffffff'],
  },
}).palettes;

const { catalog } = createCatalog({
  'tunic.json': defn('Tunic', 'clothes', 'male'),
  'helm.json': defn('Helm', 'hat', 'male'),
  'gown.json': defn('Gown', 'clothes', 'female'),
  'body.json': defn('Body Color', 'body', 'male'),
  'shirt.json': {
    ...defn('Shirt', 'clothes', 'male'),
    recolors: { material: 'cloth', palettes: ['ulpc'] },
  },
  'coat.json': {
    ...defn('Multi Coat', 'coat', 'male'),
    recolors: {
      color_1: { material: 'cloth', palettes: ['ulpc'] },
      color_2: {
        material: 'cloth',
        palettes: ['ulpc'],
        type_name: 'accent',
      },
    },
  },
});

const malePreset: Preset = {
  id: 'm',
  labelKey: 'preset.farmer',
  emoji: '🌾',
  items: [
    { typeName: 'clothes', name: 'Tunic' },
    { typeName: 'hat', name: 'Helm' },
  ],
};

const femaleOnlyPreset: Preset = {
  id: 'f',
  labelKey: 'preset.mage',
  emoji: '🔮',
  items: [
    { typeName: 'clothes', name: 'Gown' }, // female-only art
    { typeName: 'hat', name: 'Helm' },
  ],
};

describe('computePresetSelection', () => {
  it('clears clothing categories but keeps personal appearance', () => {
    const current: Record<string, Selection> = {
      body: { typeName: 'body', name: 'Body' },
      hair: { typeName: 'hair', name: 'Hair' },
      torso: { typeName: 'torso', name: 'Old Shirt' },
      weapon: { typeName: 'weapon', name: 'Old Sword' },
    };
    const { selections } = computePresetSelection(
      malePreset,
      current,
      'male',
      catalog,
      palettes,
    );
    expect(selections.body).toEqual(current.body);
    expect(selections.hair).toEqual(current.hair);
    expect('torso' in selections).toBe(false);
    expect('weapon' in selections).toBe(false);
  });

  it('adds compatible preset items', () => {
    const { selections, skipped } = computePresetSelection(
      malePreset,
      {},
      'male',
      catalog,
      palettes,
    );
    expect(skipped).toHaveLength(0);
    expect(selections.clothes).toEqual({ typeName: 'clothes', name: 'Tunic' });
    expect(selections.hat).toEqual({ typeName: 'hat', name: 'Helm' });
  });

  it('skips items not available for the current body type', () => {
    const { selections, skipped } = computePresetSelection(
      femaleOnlyPreset,
      {},
      'male',
      catalog,
      palettes,
    );
    expect(skipped.map((i) => i.name)).toEqual(['Gown']);
    expect('clothes' in selections).toBe(false);
    expect(selections.hat).toEqual({ typeName: 'hat', name: 'Helm' });
  });

  it('skips items missing from the catalog', () => {
    const badPreset: Preset = {
      id: 'b',
      labelKey: 'preset.ranger',
      emoji: '🗡️',
      items: [{ typeName: 'clothes', name: 'Nonexistent' }],
    };
    const { skipped } = computePresetSelection(
      badPreset,
      {},
      'male',
      catalog,
      palettes,
    );
    expect(skipped.map((i) => i.name)).toEqual(['Nonexistent']);
  });

  it('carries the preset variant into the selection', () => {
    const variantPreset: Preset = {
      id: 'v',
      labelKey: 'preset.knight',
      emoji: '⚔️',
      items: [{ typeName: 'clothes', name: 'Tunic', variant: 'red' }],
    };
    const { selections } = computePresetSelection(
      variantPreset,
      {},
      'male',
      catalog,
      palettes,
    );
    expect(selections.clothes).toEqual({
      typeName: 'clothes',
      name: 'Tunic',
      variant: 'red',
    });
  });

  it('defaults recolor-backed preset items to their first swatch', () => {
    const recolorPreset: Preset = {
      id: 'r',
      labelKey: 'preset.farmer',
      emoji: '🌾',
      items: [{ typeName: 'clothes', name: 'Shirt' }],
    };
    const { selections } = computePresetSelection(
      recolorPreset,
      {},
      'male',
      catalog,
      palettes,
    );
    expect(selections.clothes).toEqual({
      typeName: 'clothes',
      name: 'Shirt',
      recolor: 'brown',
    });
  });

  it('leaves no residue when switching from one preset to another', () => {
    const afterA = computePresetSelection(
      malePreset,
      {},
      'male',
      catalog,
      palettes,
    ).selections;
    const afterB = computePresetSelection(
      femaleOnlyPreset,
      afterA,
      'male',
      catalog,
      palettes,
    ).selections;
    // malePreset's Tunic was cleared; femaleOnlyPreset's Gown was skipped.
    expect('clothes' in afterB).toBe(false);
    expect(afterB.hat).toEqual({ typeName: 'hat', name: 'Helm' });
  });

  it('overwrites personal appearance categories if defined in the preset', () => {
    const presetWithBody: Preset = {
      id: 'pb',
      labelKey: 'preset.farmer',
      emoji: '🌾',
      items: [
        { typeName: 'body', name: 'Body Color' },
      ],
    };
    const current: Record<string, Selection> = {
      body: { typeName: 'body', name: 'Old Body' },
    };
    const { selections } = computePresetSelection(
      presetWithBody,
      current,
      'male',
      catalog,
      palettes,
    );
    expect(selections.body).toEqual({ typeName: 'body', name: 'Body Color' });
  });

  it('uses preset bodyType when specified', () => {
    const femalePreset: Preset = {
      id: 'f_bt',
      labelKey: 'preset.mage',
      emoji: '🔮',
      bodyType: 'female',
      items: [],
    };
    const { bodyType } = computePresetSelection(
      femalePreset,
      {},
      'male',
      catalog,
      palettes,
    );
    expect(bodyType).toBe('female');
  });

  it('preserves asset-owned channel values through the Web preset adapter', () => {
    const channelPreset: Preset = {
      id: 'channels',
      labelKey: 'preset.farmer',
      emoji: '',
      items: [
        {
          typeName: 'coat',
          name: 'Multi Coat',
          channelRecolors: { accent: 'brown' },
        },
      ],
    };

    const { selections, skipped } = computePresetSelection(
      channelPreset,
      {},
      'male',
      catalog,
      palettes,
    );

    expect(skipped).toEqual([]);
    expect(selections.coat).toEqual({
      typeName: 'coat',
      name: 'Multi Coat',
      recolor: 'brown',
      channelRecolors: { accent: 'brown' },
    });
  });
});
