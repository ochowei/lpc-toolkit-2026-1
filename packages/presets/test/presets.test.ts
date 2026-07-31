import {
  createCatalog,
  createPaletteCatalog,
  type ItemDefinition,
  type Selection,
  type TypeName,
} from '@lpc-toolkit/core';
import { describe, expect, it } from 'vitest';
import {
  computePresetSelection,
  PRESETS,
  type Preset,
} from '../src/index.js';

function item(name: string, typeName: TypeName): ItemDefinition {
  return {
    name,
    type_name: typeName,
    animations: ['walk'],
    credits: [],
    layer_1: { zPos: 10, male: `${typeName}/${name}/` },
  };
}

describe('built-in presets', () => {
  it('keeps an exact snapshot of every existing preset without secondary channels', () => {
    const snapshot = PRESETS.map((preset) =>
      [
        preset.id,
        preset.bodyType ?? '',
        ...preset.items.map((presetItem) => [
          presetItem.typeName,
          presetItem.name,
          presetItem.variant ?? '',
          presetItem.recolor ?? '',
          JSON.stringify(presetItem.channelRecolors ?? {}),
        ].join(':')),
      ].join('|'),
    );

    expect(snapshot).toEqual([
      'farmer|male|body:Body Color::light:{}|head:Human Male::light:{}|expression:Neutral::light:{}|clothes:Shortsleeve::brown:{}|overalls:Overalls:brown::{}|shoes:Basic Boots:brown::{}|hair:Messy3::orange:{}',
      'villager|male|body:Body Color::light:{}|head:Human Male::light:{}|expression:Neutral::light:{}|clothes:Longsleeve Polo::white:{}|legs:Pants::black:{}|shoes:Basic Shoes:gray::{}|hair:Side Parted w/Bangs 2::sandy:{}',
      'mage|male|body:Body Color::light:{}|head:Human Male::light:{}|expression:Neutral::light:{}|clothes:Longsleeve laced:black::{}|legs:Pants::black:{}|shoes:Basic Shoes:black::{}|cape:Solid:purple::{}|hat:Wizard Hat Base:purple::{}|weapon:Gnarled staff:dark::{}|weapon_magic_crystal:Crystal:purple::{}',
      'knight|male|body:Body Color::light:{}|head:Human Male::light:{}|expression:Neutral::light:{}|armour:Plate::steel:{}|legs:Armour::steel:{}|shoes:Armour:steel::{}|hat:Armet::steel:{}|weapon:Longsword:longsword::{}|shield:Kite:kite blue gray::{}|arms:Armour::steel:{}|gloves:Gloves::all.lpcr.smoke:{}',
      'ranger||armour:Leather:::{}|legs:Pants:::{}|shoes:Basic Boots:brown::{}|hat:Hood:::{}|weapon:Normal:dark::{}|quiver:Quiver:quiver::{}',
      'noble||clothes:Collared/Formal Longsleeve:white::{}|legs:Formal Pants:::{}|shoes:Basic Shoes:black::{}|hat:Formal Tophat:black::{}',
    ]);
  });

  it('uses recolor-first defaults for preset items without explicit color fields', () => {
    const def: ItemDefinition = {
      ...item('Defaulted Hair', 'hair'),
      variants: ['brown'],
      recolors: { material: 'hair', palettes: ['ulpc'] },
    };
    const catalog = createCatalog({ 'hair/defaulted.json': def }).catalog;
    const palettes = createPaletteCatalog({
      'hair/meta_hair.json': { type: 'material', default: 'ulpc', base: 'black' },
      'hair/hair_ulpc.json': { black: ['#111111'], orange: ['#ee7700'] },
    }).palettes;

    const result = computePresetSelection({
      id: 'defaults',
      labelKey: 'preset.defaults',
      emoji: '',
      items: [{ typeName: 'hair', name: 'Defaulted Hair' }],
    }, {}, 'male', catalog, palettes);

    expect(result.selections.hair).toEqual({
      typeName: 'hair',
      name: 'Defaulted Hair',
      recolor: 'black',
    });
  });

  it('includes stable unique preset ids', () => {
    const ids = PRESETS.map((preset) => preset.id);

    expect(ids).toContain('farmer');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('applies a preset while preserving non-clothing selections', () => {
    const farmer = PRESETS.find((preset) => preset.id === 'farmer');
    if (!farmer) throw new Error('Expected farmer preset to exist.');

    const catalog = createCatalog({
      'body/body.json': item('Body Color', 'body'),
      'head/human-male.json': item('Human Male', 'head'),
      'expression/neutral.json': item('Neutral', 'expression'),
      'clothes/shortsleeve.json': item('Shortsleeve', 'clothes'),
      'overalls/overalls.json': item('Overalls', 'overalls'),
      'shoes/basic-boots.json': item('Basic Boots', 'shoes'),
      'hair/messy3.json': item('Messy3', 'hair'),
    }).catalog;
    const palettes = createPaletteCatalog({}).palettes;
    const beard: Selection = {
      typeName: 'beard',
      name: 'Short Beard',
    };
    const current: Record<TypeName, Selection> = {
      beard,
      hat: { typeName: 'hat', name: 'Old Hat' },
    };

    const result = computePresetSelection(
      farmer,
      current,
      'female',
      catalog,
      palettes,
    );

    expect(result.bodyType).toBe('male');
    expect(result.selections.beard).toBe(beard);
    expect(result.selections.hat).toBeUndefined();
    expect(result.selections.body?.name).toBe('Body Color');
    expect(result.selections.clothes?.recolor).toBe('brown');
    expect(result.skipped).toEqual([]);
  });
});

describe('preset asset-owned color channels', () => {
  const palettes = createPaletteCatalog({
    'cloth/meta_cloth.json': {
      type: 'material',
      default: 'v1',
      base: 'black',
    },
    'cloth/cloth_v1.json': {
      black: ['#000000'],
      red: ['#ff0000'],
      blue: ['#0000ff'],
    },
  }).palettes;
  const multiCoat: ItemDefinition = {
    ...item('Multi Coat', 'coat'),
    recolors: {
      color_1: { material: 'cloth', palettes: ['v1'] },
      color_2: {
        material: 'cloth',
        palettes: ['v1'],
        type_name: 'accent',
      },
      color_3: {
        material: 'cloth',
        palettes: ['v1'],
        type_name: 'skin',
        linked_to: { selection: 'body', channel: 'primary' },
      },
    },
  };
  const catalog = createCatalog({ 'coat/multi.json': multiCoat }).catalog;

  function presetWithChannels(
    channelRecolors: Readonly<Record<TypeName, string>>,
  ): Preset {
    return {
      id: 'channels',
      labelKey: 'preset.channels',
      emoji: '',
      items: [
        {
          typeName: 'coat',
          name: 'Multi Coat',
          channelRecolors,
        },
      ],
    };
  }

  it('applies an explicit valid non-primary channel value', () => {
    const result = computePresetSelection(
      presetWithChannels({ accent: 'blue' }),
      {},
      'male',
      catalog,
      palettes,
    );

    expect(result.skipped).toEqual([]);
    expect(result.selections.coat).toEqual({
      typeName: 'coat',
      name: 'Multi Coat',
      recolor: 'black',
      channelRecolors: { accent: 'blue' },
    });
  });

  it('rejects a preset value for a linked channel', () => {
    const preset = presetWithChannels({ skin: 'red' });
    const result = computePresetSelection(
      preset,
      {},
      'male',
      catalog,
      palettes,
    );

    expect(result.selections.coat).toBeUndefined();
    expect(result.skipped).toEqual(preset.items);
  });

  it('transfers only valid same-name independent values on replacement', () => {
    const result = computePresetSelection(
      {
        id: 'replacement',
        labelKey: 'preset.replacement',
        emoji: '',
        items: [{ typeName: 'coat', name: 'Multi Coat' }],
      },
      {
        coat: {
          typeName: 'coat',
          name: 'Old Coat',
          channelRecolors: {
            accent: 'red',
            skin: 'red',
            removed: 'red',
          },
        },
      },
      'male',
      catalog,
      palettes,
    );

    expect(result.selections.coat).toEqual({
      typeName: 'coat',
      name: 'Multi Coat',
      recolor: 'black',
      channelRecolors: { accent: 'red' },
    });
  });
});
