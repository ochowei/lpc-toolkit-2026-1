import { describe, expect, it } from 'vitest';
import {
  createCatalog,
  createPaletteCatalog,
  type ItemDefinition,
} from '@lpc-toolkit/core';
import { PRESETS } from '../src/presets';
import { pickRandomOutfit } from '../src/slice/random-outfit';
import {
  NORMAL_RANDOM_PROFILE,
  profileTypeNames,
  randomProfileForStyle,
} from '../src/slice/random-profiles';

function makeItem(
  name: string,
  typeName: string,
  layerKey: 'male' | 'female' = 'male',
  variants: readonly string[] = [],
): ItemDefinition {
  return {
    name,
    type_name: typeName,
    animations: ['walk'],
    credits: [{ file: '', notes: '', authors: ['A'], licenses: ['CC0'], urls: [] }],
    layer_1: { zPos: 10, [layerKey]: `${typeName}/${name}/` },
    ...(variants.length > 0 ? { variants } : {}),
  } as unknown as ItemDefinition;
}

function makeRecolorItem(
  name: string,
  typeName: string,
  palettesForItem: readonly string[] = ['v1'],
  layerKey: 'male' | 'female' = 'male',
): ItemDefinition {
  return {
    ...makeItem(name, typeName, layerKey),
    recolors: { material: 'm', palettes: palettesForItem },
  } as unknown as ItemDefinition;
}

const palettes = createPaletteCatalog({
  'm/meta_m.json': { type: 'material', default: 'v1', base: 'c0' },
  'm/m_v1.json': {
    c0: ['#000000', '#111111'],
    red: ['#ff0000', '#ee0000'],
  },
}).palettes;

// Deterministic RNG: returns a sequence of values from `values`.
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('pickRandomOutfit', () => {
  const { catalog } = createCatalog({
    'body/light.json':       makeItem('Light', 'body'),
    'body/dark.json':        makeItem('Dark', 'body'),
    'head/round.json':       makeItem('Round', 'head'),
    'eyes/blue.json':        makeItem('Blue', 'eyes'),
    'hair/curly.json':       makeItem('Curly', 'hair'),
    'hair/spiky.json':       makeItem('Spiky', 'hair'),
    'cape/red.json':         makeItem('Red Cape', 'cape'),
    'weapon/sword.json':     makeItem('Sword', 'weapon'),
    'unknown_type/foo.json': makeItem('Foo', 'unknown_type'),
  });

  it('always picks a body type compatible body item (required category)', () => {
    const sel = pickRandomOutfit({ catalog, bodyType: 'male', rng: seqRng([0]) });
    expect(sel.items['body']).toBeDefined();
  });

  it('skips categories with no compatible items', () => {
    const femaleOnly: ItemDefinition = makeItem('FemaleHair', 'hair', 'female');
    const { catalog: c2 } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'hair/female.json': femaleOnly,
    });
    // rng=0.99 means add everything; but FemaleHair is incompat for male
    const sel = pickRandomOutfit({
      catalog: c2, bodyType: 'male', rng: () => 0.99, optionalProb: 1.0,
    });
    expect(sel.items['hair']).toBeUndefined();
  });

  it('sets the first variant for randomly picked variant-backed items', () => {
    const { catalog: variantCatalog } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'shield/round.json': makeItem('Round Shield', 'shield', 'male', [
        'brown',
        'silver',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: variantCatalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1.0,
    });

    expect(sel.items['shield']).toEqual({
      typeName: 'shield',
      name: 'Round Shield',
      variant: 'brown',
    });
  });

  it('sets the first recolor swatch for randomly picked recolor-backed items when palettes are provided', () => {
    const { catalog: recolorCatalog } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'cape/hooded.json': {
        ...makeItem('Hooded Cape', 'cape'),
        recolors: { material: 'm', palettes: ['v1'] },
      },
    });

    const sel = pickRandomOutfit({
      catalog: recolorCatalog,
      palettes,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1.0,
    });

    expect(sel.items['cape']).toEqual({
      typeName: 'cape',
      name: 'Hooded Cape',
      recolor: 'c0',
    });
  });

  it('does not set a recolor default without palette metadata', () => {
    const { catalog: recolorCatalog } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'cape/hooded.json': {
        ...makeItem('Hooded Cape', 'cape'),
        recolors: { material: 'm', palettes: ['v1'] },
      },
    });

    const sel = pickRandomOutfit({
      catalog: recolorCatalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1.0,
    });

    expect(sel.items['cape']).toEqual({
      typeName: 'cape',
      name: 'Hooded Cape',
    });
  });

  it('never randomizes non-primary channels on a multi-channel item', () => {
    const { catalog: multiChannelCatalog } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'hair/two-tone.json': {
        ...makeItem('Two Tone', 'hair'),
        recolors: {
          color_1: { material: 'm', palettes: ['v1'] },
          color_2: {
            material: 'm',
            palettes: ['v1'],
            type_name: 'accent',
          },
        },
      },
    });

    const selection = pickRandomOutfit({
      catalog: multiChannelCatalog,
      palettes,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1,
    });

    expect(selection.items.hair).toMatchObject({
      typeName: 'hair',
      name: 'Two Tone',
    });
    expect(selection.items.hair?.channelRecolors).toBeUndefined();
  });

  it('respects optionalProb: 0 produces no optional categories', () => {
    const sel = pickRandomOutfit({
      catalog, bodyType: 'male', rng: () => 0.5, optionalProb: 0,
    });
    // body / head / eyes are required (group 'body' members);
    // hair / cape / weapon are optional and excluded
    expect(sel.items['hair']).toBeUndefined();
    expect(sel.items['cape']).toBeUndefined();
    expect(sel.items['weapon']).toBeUndefined();
  });

  it('respects optionalProb: 1 includes every optional category that has compatible items', () => {
    const sel = pickRandomOutfit({
      catalog, bodyType: 'male', rng: () => 0.5, optionalProb: 1.0,
    });
    expect(sel.items['hair']).toBeDefined();
    expect(sel.items['cape']).toBeDefined();
    expect(sel.items['weapon']).toBeDefined();
  });

  it('returns the configured bodyType', () => {
    const sel = pickRandomOutfit({ catalog, bodyType: 'female', rng: () => 0 });
    expect(sel.bodyType).toBe('female');
  });

  it('is deterministic for a given rng', () => {
    const a = pickRandomOutfit({
      catalog, bodyType: 'male', rng: seqRng([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]),
    });
    const b = pickRandomOutfit({
      catalog, bodyType: 'male', rng: seqRng([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]),
    });
    expect(a).toEqual(b);
  });

  describe('excludeGroups', () => {
    const fxItem = makeItem('Bleeding', 'wound_arm');
    const shadowItem = makeItem('Shadow', 'shadow');
    const wingsItem = makeItem('Wings', 'wings');
    const { catalog: cWithFx } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'head/round.json': makeItem('Round', 'head'),
      'eyes/blue.json': makeItem('Blue', 'eyes'),
      'wound_arm/bleed.json': fxItem,
      'shadow/dark.json': shadowItem,
      'wings/feather.json': wingsItem,
    });

    it('default excludeGroups (["fx"]) never includes wound/shadow items', () => {
      for (let i = 0; i < 200; i++) {
        const sel = pickRandomOutfit({
          catalog: cWithFx,
          bodyType: 'male',
          rng: () => Math.random(),
          optionalProb: 1.0,
        });
        expect(sel.items['wound_arm']).toBeUndefined();
        expect(sel.items['shadow']).toBeUndefined();
      }
    });

    it('default excludeGroups still allows fantasy group items', () => {
      const sel = pickRandomOutfit({
        catalog: cWithFx,
        bodyType: 'male',
        rng: () => 0.5,
        optionalProb: 1.0,
      });
      expect(sel.items['wings']).toBeDefined();
    });

    it('excludeGroups: [] re-enables fx items', () => {
      const sel = pickRandomOutfit({
        catalog: cWithFx,
        bodyType: 'male',
        rng: () => 0.5,
        optionalProb: 1.0,
        excludeGroups: [],
      });
      expect(sel.items['wound_arm']).toBeDefined();
      expect(sel.items['shadow']).toBeDefined();
    });

    it('custom excludeGroups overrides the default', () => {
      const sel = pickRandomOutfit({
        catalog: cWithFx,
        bodyType: 'male',
        rng: () => 0.5,
        optionalProb: 1.0,
        excludeGroups: ['weapons'],
      });
      expect(sel.items['wound_arm']).toBeDefined();
      expect(sel.items['wings']).toBeDefined();
    });

    it('does not preserve fx selections when all random scopes are enabled', () => {
      const sel = pickRandomOutfit({
        catalog: cWithFx,
        bodyType: 'male',
        rng: () => 0,
        optionalProb: 1.0,
        currentSelections: {
          wound_arm: { typeName: 'wound_arm', name: 'Existing Wound' },
        },
        scope: {
          appearance: true,
          clothing: true,
          equipment: true,
          colors: true,
        },
      });

      expect(sel.items['wound_arm']).toBeUndefined();
    });
  });

  it('normal profile preserves current default random behavior', () => {
    const rngValues = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    const legacy = pickRandomOutfit({
      catalog,
      bodyType: 'male',
      rng: seqRng(rngValues),
    });
    const profiled = pickRandomOutfit({
      catalog,
      bodyType: 'male',
      rng: seqRng(rngValues),
      profile: 'normal',
    });
    expect(profiled).toEqual(legacy);
  });

  it('resolves every current preset id to a dedicated non-normal random profile', () => {
    for (const preset of PRESETS) {
      const profile = randomProfileForStyle(preset.id);
      expect(profile.id).toBe(preset.id);
      expect(profile).not.toBe(NORMAL_RANDOM_PROFILE);
    }
  });

  it('unknown profile ids still fall back to normal', () => {
    const rngValues = [0.2, 0.3, 0.4, 0.5, 0.6];
    const normal = pickRandomOutfit({
      catalog,
      bodyType: 'male',
      rng: seqRng(rngValues),
      profile: 'normal',
    });
    const unknown = pickRandomOutfit({
      catalog,
      bodyType: 'male',
      rng: seqRng(rngValues),
      profile: 'missing-style',
    });
    expect(unknown).toEqual(normal);
  });

  it('preset random profiles only expose their intended type names', () => {
    const expected: Readonly<Record<string, readonly string[]>> = {
      farmer: ['body', 'head', 'expression', 'hair', 'clothes', 'overalls', 'shoes'],
      villager: ['body', 'head', 'expression', 'hair', 'clothes', 'legs', 'shoes'],
      mage: [
        'body',
        'head',
        'expression',
        'hair',
        'clothes',
        'legs',
        'shoes',
        'cape',
        'hat',
        'weapon',
        'weapon_magic_crystal',
      ],
      knight: [
        'body',
        'head',
        'expression',
        'hair',
        'armour',
        'legs',
        'shoes',
        'hat',
        'weapon',
        'shield',
        'arms',
        'gloves',
      ],
      ranger: [
        'body',
        'head',
        'expression',
        'hair',
        'armour',
        'legs',
        'shoes',
        'hat',
        'weapon',
        'quiver',
      ],
      noble: ['body', 'head', 'expression', 'hair', 'clothes', 'legs', 'shoes', 'hat'],
    };

    for (const [styleId, typeNames] of Object.entries(expected)) {
      expect(profileTypeNames(randomProfileForStyle(styleId))).toEqual(typeNames);
    }
  });

  it('preserves disabled scope selections from the current outfit', () => {
    const sel = pickRandomOutfit({
      catalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1.0,
      currentSelections: {
        weapon: { typeName: 'weapon', name: 'Existing Sword' },
        hair: { typeName: 'hair', name: 'Existing Hair' },
      },
      scope: {
        appearance: false,
        clothing: true,
        equipment: false,
        colors: true,
      },
    });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Existing Sword',
    });
    expect(sel.items['hair']).toEqual({
      typeName: 'hair',
      name: 'Existing Hair',
    });
  });

  it('profile itemPools constrain choices to allowed names', () => {
    const { catalog: poolCatalog } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'weapon/sword.json': makeItem('Sword', 'weapon'),
      'weapon/staff.json': makeItem('Staff', 'weapon'),
    });
    const sel = pickRandomOutfit({
      catalog: poolCatalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1.0,
      profile: {
        id: 'mage-test',
        labelKey: 'randomProfile.normal',
        requiredGroups: ['body'],
        optionalGroups: ['weapons'],
        excludeGroups: [],
        optionalProb: 1.0,
        itemPools: {
          weapon: ['Staff'],
        },
      },
    });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Staff',
    });
  });

  it('optional profile item sets respect optional probability', () => {
    const { catalog: itemSetCatalog } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'clothes/jacket.json': makeItem('Jacket', 'clothes'),
      'legs/trousers.json': makeItem('Trousers', 'legs'),
    });
    const sel = pickRandomOutfit({
      catalog: itemSetCatalog,
      bodyType: 'male',
      rng: () => 0.5,
      profile: {
        id: 'optional-set-test',
        labelKey: 'randomProfile.normal',
        requiredGroups: ['body'],
        optionalGroups: ['clothing'],
        excludeGroups: [],
        optionalProb: 0,
        typeNames: ['body', 'clothes', 'legs'],
        itemSets: [
          {
            requiredTypeNames: ['clothes', 'legs'],
            items: {
              clothes: 'Jacket',
              legs: 'Trousers',
            },
          },
        ],
      },
    });

    expect(sel.items['body']).toEqual({ typeName: 'body', name: 'Light' });
    expect(sel.items['clothes']).toBeUndefined();
    expect(sel.items['legs']).toBeUndefined();
  });

  it('resolves farmer as a dedicated random profile', () => {
    expect(randomProfileForStyle('farmer').id).toBe('farmer');
  });

  it('farmer profile excludes fantasy, combat, and fx categories', () => {
    const { catalog: farmerCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'head/human.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'hair/messy.json': makeItem('Messy3', 'hair'),
      'clothes/shortsleeve.json': makeItem('Shortsleeve', 'clothes'),
      'overalls/brown.json': makeItem('Overalls', 'overalls', 'male', ['brown']),
      'shoes/basic-boots.json': makeItem('Basic Boots', 'shoes', 'male', ['brown']),
      'wings/feather.json': makeItem('Wings', 'wings'),
      'horns/basic.json': makeItem('Horns', 'horns'),
      'armour/plate.json': makeItem('Plate', 'armour'),
      'chainmail/steel.json': makeItem('Chainmail', 'chainmail'),
      'weapon/sword.json': makeItem('Sword', 'weapon'),
      'weapon/crystal.json': makeItem('Crystal', 'weapon_magic_crystal'),
      'shield/kite.json': makeItem('Kite', 'shield'),
      'quiver/quiver.json': makeItem('Quiver', 'quiver'),
      'wound/arm.json': makeItem('Bleeding', 'wound_arm'),
    });

    const sel = pickRandomOutfit({
      catalog: farmerCatalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1.0,
      profile: 'farmer',
    });

    expect(sel.items['body']).toBeDefined();
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Shortsleeve',
    });
    expect(sel.items['overalls']).toEqual({
      typeName: 'overalls',
      name: 'Overalls',
      variant: 'brown',
    });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Boots',
      variant: 'brown',
    });

    for (const typeName of [
      'wings',
      'horns',
      'armour',
      'chainmail',
      'weapon',
      'weapon_magic_crystal',
      'shield',
      'quiver',
      'wound_arm',
    ] as const) {
      expect(sel.items[typeName]).toBeUndefined();
    }
  });

  it('farmer profile fixes male neutral required workwear while keeping skin random', () => {
    const { catalog: farmerCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/human-female.json': makeItem('Human Female', 'head', 'female'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'expression/happy.json': makeItem('Happy', 'expression'),
      'hair/messy.json': makeItem('Messy3', 'hair'),
      'hair/curly.json': makeItem('Curly', 'hair'),
      'clothes/shortsleeve.json': makeItem('Shortsleeve', 'clothes'),
      'overalls/brown.json': makeItem('Overalls', 'overalls', 'male', ['brown']),
      'shoes/basic-boots.json': makeItem('Basic Boots', 'shoes', 'male', ['brown']),
    });

    const sel = pickRandomOutfit({
      catalog: farmerCatalog,
      palettes,
      bodyType: 'female',
      rng: seqRng([0, 0.99, 0.99, 0, 0.99, 0, 0, 0]),
      optionalProb: 0,
      profile: 'farmer',
    });

    expect(sel.bodyType).toBe('male');
    expect(sel.items['body']).toEqual({
      typeName: 'body',
      name: 'Body Color',
      recolor: 'red',
    });
    expect(sel.items['head']).toEqual({ typeName: 'head', name: 'Human Male' });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['hair']).toBeUndefined();
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Shortsleeve',
    });
    expect(sel.items['overalls']).toEqual({
      typeName: 'overalls',
      name: 'Overalls',
      variant: 'brown',
    });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Boots',
      variant: 'brown',
    });
  });

  it('farmer profile uses human body and adult male head while randomizing farmer colors', () => {
    const { catalog: farmerCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'body/skeleton-body.json': makeItem('Skeleton Body', 'body'),
      'body/zombie-body.json': makeItem('Zombie Body', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/skeleton.json': makeItem('Skeleton', 'head'),
      'head/zombie.json': makeItem('Zombie', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'hair/messy.json': makeItem('Messy3', 'hair'),
      'clothes/shortsleeve.json': makeRecolorItem('Shortsleeve', 'clothes'),
      'overalls/brown.json': makeItem('Overalls', 'overalls', 'male', [
        'brown',
        'blue',
      ]),
      'shoes/basic-boots.json': makeItem('Basic Boots', 'shoes', 'male', [
        'brown',
        'tan',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: farmerCatalog,
      palettes,
      bodyType: 'female',
      rng: seqRng([
        0.99, 0.99,
        0.99,
        0,
        0, 0,
        0, 0.99,
        0, 0.99,
        0, 0.99,
      ]),
      optionalProb: 1,
      profile: 'farmer',
    });

    expect(sel.bodyType).toBe('male');
    expect(sel.items['body']).toEqual({
      typeName: 'body',
      name: 'Body Color',
      recolor: 'red',
    });
    expect(sel.items['head']).toEqual({ typeName: 'head', name: 'Human Male' });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['hair']).toEqual({ typeName: 'hair', name: 'Messy3' });
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Shortsleeve',
      recolor: 'red',
    });
    expect(sel.items['overalls']).toEqual({
      typeName: 'overalls',
      name: 'Overalls',
      variant: 'blue',
    });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Boots',
      variant: 'tan',
    });
  });

  it('farmer profile keeps default farmer colors when random colors are disabled', () => {
    const { catalog: farmerCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'clothes/shortsleeve.json': makeRecolorItem('Shortsleeve', 'clothes'),
      'overalls/brown.json': makeItem('Overalls', 'overalls', 'male', [
        'brown',
        'blue',
      ]),
      'shoes/basic-boots.json': makeItem('Basic Boots', 'shoes', 'male', [
        'brown',
        'tan',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: farmerCatalog,
      palettes,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 0,
      profile: 'farmer',
      scope: {
        appearance: true,
        clothing: true,
        equipment: true,
        colors: false,
      },
    });

    expect(sel.items['body']).toEqual({ typeName: 'body', name: 'Body Color' });
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Shortsleeve',
    });
    expect(sel.items['overalls']).toEqual({
      typeName: 'overalls',
      name: 'Overalls',
      variant: 'brown',
    });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Boots',
      variant: 'brown',
    });
  });

  it('farmer profile can still randomize hair when appearance optional slots are included', () => {
    const { catalog: farmerCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'hair/messy.json': makeItem('Messy3', 'hair'),
      'hair/curly.json': makeItem('Curly', 'hair'),
      'clothes/shortsleeve.json': makeItem('Shortsleeve', 'clothes'),
      'overalls/brown.json': makeItem('Overalls', 'overalls', 'male', ['brown']),
      'shoes/basic-boots.json': makeItem('Basic Boots', 'shoes', 'male', ['brown']),
    });

    const sel = pickRandomOutfit({
      catalog: farmerCatalog,
      bodyType: 'male',
      rng: seqRng([0, 0, 0, 0, 0.99, 0.99, 0, 0, 0]),
      optionalProb: 1,
      profile: 'farmer',
    });

    expect(sel.items['hair']).toEqual({ typeName: 'hair', name: 'Curly' });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['overalls']).toEqual({
      typeName: 'overalls',
      name: 'Overalls',
      variant: 'brown',
    });
  });

  it('farmer profile drops incompatible preserved appearance selections when forcing male body type', () => {
    const { catalog: farmerCatalog } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'head/human-female.json': makeItem('Human Female', 'head', 'female'),
      'hair/long.json': makeItem('Long Hair', 'hair', 'female'),
    });

    const sel = pickRandomOutfit({
      catalog: farmerCatalog,
      bodyType: 'female',
      rng: () => 0,
      optionalProb: 1,
      profile: 'farmer',
      scope: {
        appearance: false,
        clothing: true,
        equipment: true,
        colors: true,
      },
      currentSelections: {
        head: { typeName: 'head', name: 'Human Female' },
        hair: { typeName: 'hair', name: 'Long Hair' },
      },
    });

    expect(sel.bodyType).toBe('male');
    expect(sel.items['head']).toBeUndefined();
    expect(sel.items['hair']).toBeUndefined();
  });

  it('villager profile keeps random outfits mundane and clothing-only', () => {
    const { catalog: villagerCatalog } = createCatalog({
      'body/body-color.json': makeItem('Body Color', 'body'),
      'head/human.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'hair/messy.json': makeItem('Messy3', 'hair'),
      'clothes/formal.json': makeItem('Collared/Formal Longsleeve', 'clothes'),
      'clothes/longsleeve.json': makeItem('Longsleeve', 'clothes'),
      'clothes/shortsleeve.json': makeItem('Shortsleeve', 'clothes'),
      'legs/pants.json': makeItem('Pants', 'legs'),
      'shoes/basic-shoes.json': makeItem('Basic Shoes', 'shoes', 'male', ['tan']),
      'shoes/basic-boots.json': makeItem('Basic Boots', 'shoes', 'male', ['brown']),
      'overalls/brown.json': makeItem('Overalls', 'overalls', 'male', ['brown']),
      'apron/plain.json': makeItem('Apron', 'apron'),
      'hat/hood.json': makeItem('Hood', 'hat'),
      'weapon/sword.json': makeItem('Sword', 'weapon'),
      'shield/kite.json': makeItem('Kite', 'shield'),
      'wings/feather.json': makeItem('Wings', 'wings'),
      'wound/arm.json': makeItem('Bleeding', 'wound_arm'),
    });

    const sel = pickRandomOutfit({
      catalog: villagerCatalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1.0,
      profile: 'villager',
    });

    expect(sel.items['body']).toBeDefined();
    expect(sel.items['clothes']?.name).toBe('Longsleeve');
    expect(sel.items['legs']).toEqual({ typeName: 'legs', name: 'Pants' });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Shoes',
      variant: 'tan',
    });

    for (const typeName of [
      'overalls',
      'apron',
      'hat',
      'weapon',
      'shield',
      'wings',
      'wound_arm',
    ] as const) {
      expect(sel.items[typeName]).toBeUndefined();
    }
  });

  it('villager profile uses human male body parts while randomizing villager colors', () => {
    const { catalog: villagerCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'body/skeleton.json': makeItem('Skeleton', 'body'),
      'body/zombie.json': makeItem('Zombie', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/minotaur.json': makeItem('Minotaur', 'head'),
      'head/zombie.json': makeItem('Zombie', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'expression/angry.json': makeItem('Angry', 'expression'),
      'hair/messy.json': makeItem('Messy3', 'hair'),
      'clothes/longsleeve.json': makeRecolorItem('Longsleeve', 'clothes'),
      'clothes/shortsleeve.json': makeRecolorItem('Shortsleeve', 'clothes'),
      'legs/pants.json': makeRecolorItem('Pants', 'legs'),
      'shoes/basic-shoes.json': makeItem('Basic Shoes', 'shoes', 'male', [
        'tan',
        'black',
      ]),
      'shoes/basic-boots.json': makeItem('Basic Boots', 'shoes', 'male', [
        'brown',
        'gray',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: villagerCatalog,
      palettes,
      bodyType: 'female',
      rng: () => 0.99,
      optionalProb: 1,
      profile: 'villager',
    });

    expect(sel.bodyType).toBe('male');
    expect(sel.items['body']).toEqual({
      typeName: 'body',
      name: 'Body Color',
      recolor: 'red',
    });
    expect(sel.items['head']).toEqual({ typeName: 'head', name: 'Human Male' });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['hair']).toEqual({ typeName: 'hair', name: 'Messy3' });
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Shortsleeve',
      recolor: 'red',
    });
    expect(sel.items['legs']).toEqual({
      typeName: 'legs',
      name: 'Pants',
      recolor: 'red',
    });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Boots',
      variant: 'gray',
    });
  });

  it('villager profile always includes pants even when optional clothing is skipped', () => {
    const { catalog: villagerCatalog } = createCatalog({
      'body/body-color.json': makeItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'clothes/longsleeve.json': makeItem('Longsleeve', 'clothes'),
      'legs/pants.json': makeItem('Pants', 'legs'),
      'shoes/basic-shoes.json': makeItem('Basic Shoes', 'shoes'),
    });

    const sel = pickRandomOutfit({
      catalog: villagerCatalog,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 0,
      profile: 'villager',
    });

    expect(sel.items['legs']).toEqual({ typeName: 'legs', name: 'Pants' });
    expect(sel.items['clothes']).toBeUndefined();
    expect(sel.items['shoes']).toBeUndefined();
  });

  it('mage profile excludes heavy armor while allowing staff and crystal slots', () => {
    const { catalog: mageCatalog } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'clothes/laced.json': makeItem('Longsleeve laced', 'clothes'),
      'legs/pants.json': makeItem('Pants', 'legs'),
      'shoes/basic.json': makeItem('Basic Shoes', 'shoes'),
      'cape/solid.json': makeItem('Solid', 'cape'),
      'hat/wizard.json': makeItem('Wizard Hat Base', 'hat'),
      'weapon/staff.json': makeItem('Gnarled staff', 'weapon'),
      'weapon/crystal.json': makeItem('Crystal', 'weapon_magic_crystal'),
      'armour/plate.json': makeItem('Plate', 'armour'),
      'chainmail/steel.json': makeItem('Chainmail', 'chainmail'),
    });

    const sel = pickRandomOutfit({
      catalog: mageCatalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1.0,
      profile: 'mage',
    });

    expect(sel.items['weapon']).toBeDefined();
    expect(sel.items['weapon_magic_crystal']).toBeDefined();
    expect(sel.items['armour']).toBeUndefined();
    expect(sel.items['chainmail']).toBeUndefined();
  });

  it('mage profile uses standard human identity and requires full mage equipment', () => {
    const { catalog: mageCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'body/skeleton.json': makeItem('Skeleton', 'body'),
      'body/zombie.json': makeItem('Zombie', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/human-female.json': makeItem('Human Female', 'head', 'female'),
      'head/skeleton.json': makeItem('Skeleton', 'head'),
      'head/zombie.json': makeItem('Zombie', 'head'),
      'head/orc.json': makeItem('Orc Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'expression/angry.json': makeItem('Angry', 'expression'),
      'hair/messy.json': makeItem('Messy3', 'hair'),
      'clothes/laced.json': makeItem('Longsleeve laced', 'clothes'),
      'legs/pants.json': makeItem('Pants', 'legs'),
      'shoes/basic.json': makeItem('Basic Shoes', 'shoes'),
      'cape/solid.json': makeItem('Solid', 'cape'),
      'hat/wizard.json': makeItem('Wizard Hat Base', 'hat'),
      'weapon/staff.json': makeItem('Gnarled staff', 'weapon'),
      'weapon/crystal.json': makeItem('Crystal', 'weapon_magic_crystal'),
      'armour/plate.json': makeItem('Plate', 'armour'),
      'chainmail/steel.json': makeItem('Chainmail', 'chainmail'),
      'overalls/brown.json': makeItem('Overalls', 'overalls'),
      'shield/kite.json': makeItem('Kite', 'shield'),
      'quiver/quiver.json': makeItem('Quiver', 'quiver'),
    });

    const sel = pickRandomOutfit({
      catalog: mageCatalog,
      bodyType: 'male',
      rng: seqRng([
        0.99, 0.99, 0.99,
        0.99,
        0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99,
      ]),
      optionalProb: 0,
      profile: 'mage',
    });

    expect(sel.bodyType).toBe('male');
    expect(sel.items['body']).toEqual({
      typeName: 'body',
      name: 'Body Color',
    });
    expect(sel.items['head']).toEqual({
      typeName: 'head',
      name: 'Human Male',
    });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['hair']).toBeUndefined();
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Longsleeve laced',
    });
    expect(sel.items['legs']).toEqual({ typeName: 'legs', name: 'Pants' });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Shoes',
    });
    expect(sel.items['cape']).toEqual({ typeName: 'cape', name: 'Solid' });
    expect(sel.items['hat']).toEqual({
      typeName: 'hat',
      name: 'Wizard Hat Base',
    });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Gnarled staff',
    });
    expect(sel.items['weapon_magic_crystal']).toEqual({
      typeName: 'weapon_magic_crystal',
      name: 'Crystal',
    });

    for (const typeName of [
      'armour',
      'chainmail',
      'overalls',
      'shield',
      'quiver',
    ] as const) {
      expect(sel.items[typeName]).toBeUndefined();
    }
  });

  it('mage profile supports female human identity without forcing male', () => {
    const { catalog: mageCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body', ['v1'], 'female'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/human-female.json': makeItem('Human Female', 'head', 'female'),
      'head/zombie.json': makeItem('Zombie', 'head', 'female'),
      'expression/neutral.json': makeItem('Neutral', 'expression', 'female'),
      'clothes/laced.json': makeItem('Longsleeve laced', 'clothes', 'female'),
      'legs/pants.json': makeItem('Pants', 'legs', 'female'),
      'shoes/basic.json': makeItem('Basic Shoes', 'shoes', 'female'),
      'cape/solid.json': makeItem('Solid', 'cape', 'female'),
      'hat/wizard.json': makeItem('Wizard Hat Base', 'hat', 'female'),
      'weapon/staff.json': makeItem('Gnarled staff', 'weapon', 'female'),
      'weapon/crystal.json': makeItem('Crystal', 'weapon_magic_crystal', 'female'),
    });

    const sel = pickRandomOutfit({
      catalog: mageCatalog,
      bodyType: 'female',
      rng: () => 0.99,
      optionalProb: 0,
      profile: 'mage',
    });

    expect(sel.bodyType).toBe('female');
    expect(sel.items['body']).toEqual({
      typeName: 'body',
      name: 'Body Color',
    });
    expect(sel.items['head']).toEqual({
      typeName: 'head',
      name: 'Human Female',
    });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Gnarled staff',
    });
    expect(sel.items['weapon_magic_crystal']).toEqual({
      typeName: 'weapon_magic_crystal',
      name: 'Crystal',
    });
  });

  it('mage profile randomizes mage skin clothing and equipment colors', () => {
    const { catalog: mageCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'clothes/laced.json': makeRecolorItem('Longsleeve laced', 'clothes'),
      'legs/pants.json': makeRecolorItem('Pants', 'legs'),
      'shoes/basic.json': makeItem('Basic Shoes', 'shoes', 'male', [
        'black',
        'purple',
      ]),
      'cape/solid.json': makeItem('Solid', 'cape', 'male', [
        'black',
        'purple',
      ]),
      'hat/wizard.json': makeItem('Wizard Hat Base', 'hat', 'male', [
        'black',
        'purple',
      ]),
      'weapon/staff.json': makeItem('Gnarled staff', 'weapon', 'male', [
        'light',
        'dark',
      ]),
      'weapon/crystal.json': makeItem('Crystal', 'weapon_magic_crystal', 'male', [
        'blue',
        'purple',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: mageCatalog,
      palettes,
      bodyType: 'male',
      rng: seqRng([
        0, 0.99,
        0,
        0,
        0.99,
        0, 0.99,
        0, 0.99,
        0, 0.99,
        0, 0.99,
        0, 0.99,
        0, 0.99,
        0, 0.99,
      ]),
      optionalProb: 0,
      profile: 'mage',
    });

    expect(sel.items['body']).toEqual({
      typeName: 'body',
      name: 'Body Color',
      recolor: 'red',
    });
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Longsleeve laced',
      recolor: 'red',
    });
    expect(sel.items['legs']).toEqual({
      typeName: 'legs',
      name: 'Pants',
      recolor: 'red',
    });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Shoes',
      variant: 'purple',
    });
    expect(sel.items['cape']).toEqual({
      typeName: 'cape',
      name: 'Solid',
      variant: 'purple',
    });
    expect(sel.items['hat']).toEqual({
      typeName: 'hat',
      name: 'Wizard Hat Base',
      variant: 'purple',
    });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Gnarled staff',
      variant: 'dark',
    });
    expect(sel.items['weapon_magic_crystal']).toEqual({
      typeName: 'weapon_magic_crystal',
      name: 'Crystal',
      variant: 'purple',
    });
  });

  it('mage profile keeps default mage colors when random colors are disabled', () => {
    const { catalog: mageCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'clothes/laced.json': makeRecolorItem('Longsleeve laced', 'clothes'),
      'legs/pants.json': makeRecolorItem('Pants', 'legs'),
      'shoes/basic.json': makeItem('Basic Shoes', 'shoes', 'male', [
        'black',
        'purple',
      ]),
      'cape/solid.json': makeItem('Solid', 'cape', 'male', [
        'black',
        'purple',
      ]),
      'hat/wizard.json': makeItem('Wizard Hat Base', 'hat', 'male', [
        'black',
        'purple',
      ]),
      'weapon/staff.json': makeItem('Gnarled staff', 'weapon', 'male', [
        'light',
        'dark',
      ]),
      'weapon/crystal.json': makeItem('Crystal', 'weapon_magic_crystal', 'male', [
        'blue',
        'purple',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: mageCatalog,
      palettes,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 0,
      profile: 'mage',
      scope: {
        appearance: true,
        clothing: true,
        equipment: true,
        colors: false,
      },
    });

    expect(sel.items['body']).toEqual({ typeName: 'body', name: 'Body Color' });
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Longsleeve laced',
    });
    expect(sel.items['legs']).toEqual({ typeName: 'legs', name: 'Pants' });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Shoes',
      variant: 'black',
    });
    expect(sel.items['cape']).toEqual({
      typeName: 'cape',
      name: 'Solid',
      variant: 'black',
    });
    expect(sel.items['hat']).toEqual({
      typeName: 'hat',
      name: 'Wizard Hat Base',
      variant: 'black',
    });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Gnarled staff',
      variant: 'light',
    });
    expect(sel.items['weapon_magic_crystal']).toEqual({
      typeName: 'weapon_magic_crystal',
      name: 'Crystal',
      variant: 'blue',
    });
  });

  it('knight profile excludes farmer workwear and mage crystal parts', () => {
    const { catalog: knightCatalog } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'armour/plate.json': makeItem('Plate', 'armour'),
      'legs/armour.json': makeItem('Armour', 'legs'),
      'shoes/armour.json': makeItem('Armour', 'shoes'),
      'hat/armet.json': makeItem('Armet', 'hat'),
      'weapon/sword.json': makeItem('Longsword', 'weapon'),
      'shield/kite.json': makeItem('Kite', 'shield'),
      'arms/armour.json': makeItem('Armour', 'arms'),
      'gloves/gloves.json': makeItem('Gloves', 'gloves'),
      'overalls/brown.json': makeItem('Overalls', 'overalls'),
      'apron/plain.json': makeItem('Plain Apron', 'apron'),
      'weapon/crystal.json': makeItem('Crystal', 'weapon_magic_crystal'),
    });

    const sel = pickRandomOutfit({
      catalog: knightCatalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1.0,
      profile: 'knight',
    });

    expect(sel.items['armour']).toBeDefined();
    expect(sel.items['weapon']).toBeDefined();
    expect(sel.items['shield']).toBeDefined();
    expect(sel.items['overalls']).toBeUndefined();
    expect(sel.items['apron']).toBeUndefined();
    expect(sel.items['weapon_magic_crystal']).toBeUndefined();
  });

  it('knight profile requires human identity and core equipment while leaving arms and gloves optional', () => {
    const { catalog: knightCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'body/skeleton.json': makeItem('Skeleton', 'body'),
      'body/zombie.json': makeItem('Zombie', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/human-female.json': makeItem('Human Female', 'head', 'female'),
      'head/skeleton.json': makeItem('Skeleton', 'head'),
      'head/zombie.json': makeItem('Zombie', 'head'),
      'head/wolf.json': makeItem('Wolf male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'expression/happy.json': makeItem('Happy', 'expression'),
      'hair/messy.json': makeItem('Messy3', 'hair'),
      'armour/plate.json': makeRecolorItem('Plate', 'armour'),
      'legs/knight-legs-armour.json': makeRecolorItem('Armour', 'legs'),
      'shoes/knight-shoes-armour.json': makeItem('Armour', 'shoes', 'male', [
        'steel',
        'gold',
      ]),
      'hat/armet.json': makeRecolorItem('Armet', 'hat'),
      'weapon/longsword.json': makeItem('Longsword', 'weapon', 'male', [
        'longsword',
      ]),
      'shield/kite.json': makeItem('Kite', 'shield', 'male', [
        'kite blue gray',
        'kite red gray',
      ]),
      'arms/knight-arms-armour.json': makeRecolorItem('Armour', 'arms'),
      'gloves/gloves.json': makeRecolorItem('Gloves', 'gloves'),
    });

    const sel = pickRandomOutfit({
      catalog: knightCatalog,
      bodyType: 'male',
      rng: seqRng([0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5]),
      optionalProb: 0,
      profile: 'knight',
    });

    expect(sel.bodyType).toBe('male');
    expect(sel.items['body']).toEqual({ typeName: 'body', name: 'Body Color' });
    expect(sel.items['head']).toEqual({ typeName: 'head', name: 'Human Male' });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['hair']).toBeUndefined();
    expect(sel.items['armour']).toEqual({ typeName: 'armour', name: 'Plate' });
    expect(sel.items['legs']).toEqual({ typeName: 'legs', name: 'Armour' });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Armour',
      variant: 'steel',
    });
    expect(sel.items['hat']).toEqual({ typeName: 'hat', name: 'Armet' });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Longsword',
      variant: 'longsword',
    });
    expect(sel.items['shield']).toEqual({
      typeName: 'shield',
      name: 'Kite',
      variant: 'kite blue gray',
    });
    expect(sel.items['arms']).toBeUndefined();
    expect(sel.items['gloves']).toBeUndefined();
  });

  it('knight profile keeps female body type and selects the compatible human head', () => {
    const { catalog: knightCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body', ['v1'], 'female'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/human-female.json': makeItem('Human Female', 'head', 'female'),
      'expression/neutral.json': makeItem('Neutral', 'expression', 'female'),
      'armour/plate.json': makeRecolorItem('Plate', 'armour', ['v1'], 'female'),
      'legs/knight-legs-armour.json': makeRecolorItem('Armour', 'legs', ['v1'], 'female'),
      'shoes/knight-shoes-armour.json': makeItem('Armour', 'shoes', 'female', ['steel']),
      'hat/armet.json': makeRecolorItem('Armet', 'hat', ['v1'], 'female'),
      'weapon/longsword.json': makeItem('Longsword', 'weapon', 'female', [
        'longsword',
      ]),
      'shield/kite.json': makeItem('Kite', 'shield', 'female', [
        'kite blue gray',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: knightCatalog,
      bodyType: 'female',
      rng: () => 0,
      optionalProb: 0,
      profile: 'knight',
    });

    expect(sel.bodyType).toBe('female');
    expect(sel.items['head']).toEqual({
      typeName: 'head',
      name: 'Human Female',
    });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Longsword',
      variant: 'longsword',
    });
    expect(sel.items['shield']).toEqual({
      typeName: 'shield',
      name: 'Kite',
      variant: 'kite blue gray',
    });
  });

  it('knight profile can randomize armor and shield colors when optional arms and gloves are included', () => {
    const { catalog: knightCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'hair/messy.json': makeItem('Messy3', 'hair'),
      'armour/plate.json': makeRecolorItem('Plate', 'armour'),
      'legs/knight-legs-armour.json': makeRecolorItem('Armour', 'legs'),
      'shoes/knight-shoes-armour.json': makeItem('Armour', 'shoes', 'male', [
        'steel',
        'gold',
      ]),
      'hat/armet.json': makeRecolorItem('Armet', 'hat'),
      'weapon/longsword.json': makeItem('Longsword', 'weapon', 'male', [
        'longsword',
      ]),
      'shield/kite.json': makeItem('Kite', 'shield', 'male', [
        'kite blue gray',
        'kite red gray',
      ]),
      'arms/knight-arms-armour.json': makeRecolorItem('Armour', 'arms'),
      'gloves/gloves.json': makeRecolorItem('Gloves', 'gloves'),
    });

    const sel = pickRandomOutfit({
      catalog: knightCatalog,
      palettes,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 1,
      profile: 'knight',
    });

    expect(sel.items['body']).toEqual({
      typeName: 'body',
      name: 'Body Color',
      recolor: 'red',
    });
    expect(sel.items['hair']).toEqual({ typeName: 'hair', name: 'Messy3' });
    expect(sel.items['armour']).toEqual({
      typeName: 'armour',
      name: 'Plate',
      recolor: 'red',
    });
    expect(sel.items['legs']).toEqual({
      typeName: 'legs',
      name: 'Armour',
      recolor: 'red',
    });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Armour',
      variant: 'gold',
    });
    expect(sel.items['hat']).toEqual({
      typeName: 'hat',
      name: 'Armet',
      recolor: 'red',
    });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Longsword',
      variant: 'longsword',
    });
    expect(sel.items['shield']).toEqual({
      typeName: 'shield',
      name: 'Kite',
      variant: 'kite red gray',
    });
    expect(sel.items['arms']).toEqual({
      typeName: 'arms',
      name: 'Armour',
      recolor: 'red',
    });
    expect(sel.items['gloves']).toEqual({
      typeName: 'gloves',
      name: 'Gloves',
      recolor: 'red',
    });
  });

  it('knight profile keeps default colors when random colors are disabled', () => {
    const { catalog: knightCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'armour/plate.json': makeRecolorItem('Plate', 'armour'),
      'legs/knight-legs-armour.json': makeRecolorItem('Armour', 'legs'),
      'shoes/knight-shoes-armour.json': makeItem('Armour', 'shoes', 'male', [
        'steel',
        'gold',
      ]),
      'hat/armet.json': makeRecolorItem('Armet', 'hat'),
      'weapon/longsword.json': makeItem('Longsword', 'weapon', 'male', [
        'longsword',
      ]),
      'shield/kite.json': makeItem('Kite', 'shield', 'male', [
        'kite blue gray',
        'kite red gray',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: knightCatalog,
      palettes,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 0,
      profile: 'knight',
      scope: {
        appearance: true,
        clothing: true,
        equipment: true,
        colors: false,
      },
    });

    expect(sel.items['body']).toEqual({ typeName: 'body', name: 'Body Color' });
    expect(sel.items['armour']).toEqual({ typeName: 'armour', name: 'Plate' });
    expect(sel.items['legs']).toEqual({ typeName: 'legs', name: 'Armour' });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Armour',
      variant: 'steel',
    });
    expect(sel.items['hat']).toEqual({ typeName: 'hat', name: 'Armet' });
    expect(sel.items['shield']).toEqual({
      typeName: 'shield',
      name: 'Kite',
      variant: 'kite blue gray',
    });
  });

  it('ranger profile excludes heavy, formal, farmer, mage, fantasy, and fx items', () => {
    const { catalog: rangerCatalog } = createCatalog({
      'body/body-color.json': makeItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'armour/leather.json': makeItem('Leather', 'armour'),
      'legs/pants.json': makeItem('Pants', 'legs'),
      'shoes/boots.json': makeItem('Basic Boots', 'shoes'),
      'hat/hood.json': makeItem('Hood', 'hat'),
      'weapon/bow.json': makeItem('Normal', 'weapon'),
      'quiver/quiver.json': makeItem('Quiver', 'quiver'),
      'chainmail/steel.json': makeItem('Chainmail', 'chainmail'),
      'clothes/formal.json': makeItem('Collared/Formal Longsleeve', 'clothes'),
      'overalls/brown.json': makeItem('Overalls', 'overalls'),
      'apron/plain.json': makeItem('Plain Apron', 'apron'),
      'weapon/crystal.json': makeItem('Crystal', 'weapon_magic_crystal'),
      'shield/kite.json': makeItem('Kite', 'shield'),
      'wings/feather.json': makeItem('Wings', 'wings'),
      'wound/arm.json': makeItem('Bleeding', 'wound_arm'),
    });

    const sel = pickRandomOutfit({
      catalog: rangerCatalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1.0,
      profile: 'ranger',
    });

    expect(sel.items['armour']).toEqual({ typeName: 'armour', name: 'Leather' });
    expect(sel.items['weapon']).toEqual({ typeName: 'weapon', name: 'Normal' });
    expect(sel.items['quiver']).toEqual({ typeName: 'quiver', name: 'Quiver' });

    for (const typeName of [
      'chainmail',
      'clothes',
      'overalls',
      'apron',
      'weapon_magic_crystal',
      'shield',
      'wings',
      'wound_arm',
    ] as const) {
      expect(sel.items[typeName]).toBeUndefined();
    }
  });

  it('ranger profile fixes human neutral required kit while preserving body type and random colors', () => {
    const { catalog: rangerCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'body/skeleton.json': makeItem('Skeleton Body', 'body'),
      'body/zombie.json': makeItem('Zombie Body', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/human-female.json': makeItem('Human Female', 'head', 'female'),
      'head/skeleton.json': makeItem('Skeleton', 'head'),
      'head/zombie.json': makeItem('Zombie', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'expression/happy.json': makeItem('Happy', 'expression'),
      'hair/messy.json': makeItem('Messy3', 'hair'),
      'armour/leather.json': makeItem('Leather', 'armour', 'male', [
        'brown',
        'green',
      ]),
      'legs/pants.json': makeRecolorItem('Pants', 'legs'),
      'shoes/basic-boots.json': makeItem('Basic Boots', 'shoes', 'male', [
        'brown',
        'black',
      ]),
      'hat/hood.json': makeItem('Hood', 'hat', 'male', ['brown', 'green']),
      'weapon/bow.json': makeItem('Normal', 'weapon', 'male', ['dark', 'light']),
      'quiver/quiver.json': makeItem('Quiver', 'quiver', 'male', [
        'quiver',
        'green',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: rangerCatalog,
      palettes,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 0,
      profile: 'ranger',
    });

    expect(sel.bodyType).toBe('male');
    expect(sel.items['body']).toEqual({
      typeName: 'body',
      name: 'Body Color',
      recolor: 'red',
    });
    expect(sel.items['head']).toEqual({ typeName: 'head', name: 'Human Male' });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['hair']).toBeUndefined();
    expect(sel.items['armour']).toEqual({
      typeName: 'armour',
      name: 'Leather',
      variant: 'green',
    });
    expect(sel.items['legs']).toEqual({
      typeName: 'legs',
      name: 'Pants',
      recolor: 'red',
    });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Boots',
      variant: 'black',
    });
    expect(sel.items['hat']).toEqual({
      typeName: 'hat',
      name: 'Hood',
      variant: 'green',
    });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Normal',
      variant: 'light',
    });
    expect(sel.items['quiver']).toEqual({
      typeName: 'quiver',
      name: 'Quiver',
      variant: 'green',
    });
  });

  it('ranger profile keeps female body type and selects the compatible human head', () => {
    const { catalog: rangerCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body', ['v1'], 'female'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/human-female.json': makeItem('Human Female', 'head', 'female'),
      'head/skeleton.json': makeItem('Skeleton', 'head', 'female'),
      'expression/neutral.json': makeItem('Neutral', 'expression', 'female'),
      'armour/leather.json': makeItem('Leather', 'armour', 'female'),
      'legs/pants.json': makeItem('Pants', 'legs', 'female'),
      'shoes/basic-boots.json': makeItem('Basic Boots', 'shoes', 'female', [
        'brown',
      ]),
      'hat/hood.json': makeItem('Hood', 'hat', 'female'),
      'weapon/bow.json': makeItem('Normal', 'weapon', 'female', ['dark']),
      'quiver/quiver.json': makeItem('Quiver', 'quiver', 'female', ['quiver']),
    });

    const sel = pickRandomOutfit({
      catalog: rangerCatalog,
      bodyType: 'female',
      rng: () => 0.99,
      optionalProb: 0,
      profile: 'ranger',
    });

    expect(sel.bodyType).toBe('female');
    expect(sel.items['body']).toEqual({ typeName: 'body', name: 'Body Color' });
    expect(sel.items['head']).toEqual({ typeName: 'head', name: 'Human Female' });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['armour']).toEqual({ typeName: 'armour', name: 'Leather' });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Normal',
      variant: 'dark',
    });
    expect(sel.items['quiver']).toEqual({
      typeName: 'quiver',
      name: 'Quiver',
      variant: 'quiver',
    });
  });

  it('ranger profile keeps default ranger colors when random colors are disabled', () => {
    const { catalog: rangerCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'armour/leather.json': makeItem('Leather', 'armour', 'male', [
        'brown',
        'green',
      ]),
      'legs/pants.json': makeRecolorItem('Pants', 'legs'),
      'shoes/basic-boots.json': makeItem('Basic Boots', 'shoes', 'male', [
        'brown',
        'black',
      ]),
      'hat/hood.json': makeItem('Hood', 'hat', 'male', ['brown', 'green']),
      'weapon/bow.json': makeItem('Normal', 'weapon', 'male', ['dark', 'light']),
      'quiver/quiver.json': makeItem('Quiver', 'quiver', 'male', [
        'quiver',
        'green',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: rangerCatalog,
      palettes,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 0,
      profile: 'ranger',
      scope: {
        appearance: true,
        clothing: true,
        equipment: true,
        colors: false,
      },
    });

    expect(sel.items['body']).toEqual({ typeName: 'body', name: 'Body Color' });
    expect(sel.items['armour']).toEqual({
      typeName: 'armour',
      name: 'Leather',
      variant: 'brown',
    });
    expect(sel.items['legs']).toEqual({ typeName: 'legs', name: 'Pants' });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Boots',
      variant: 'brown',
    });
    expect(sel.items['hat']).toEqual({
      typeName: 'hat',
      name: 'Hood',
      variant: 'brown',
    });
    expect(sel.items['weapon']).toEqual({
      typeName: 'weapon',
      name: 'Normal',
      variant: 'dark',
    });
    expect(sel.items['quiver']).toEqual({
      typeName: 'quiver',
      name: 'Quiver',
      variant: 'quiver',
    });
  });

  it('noble profile excludes undead, non-human, workwear, combat, fantasy, and fx items', () => {
    const { catalog: nobleCatalog } = createCatalog({
      'body/body-color.json': makeItem('Body Color', 'body'),
      'body/skeleton.json': makeItem('Skeleton Body', 'body'),
      'body/zombie.json': makeItem('Zombie Body', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/skeleton.json': makeItem('Skeleton', 'head'),
      'head/zombie.json': makeItem('Zombie', 'head'),
      'head/orc.json': makeItem('Orc', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'clothes/formal-longsleeve.json': makeItem(
        'Collared/Formal Longsleeve',
        'clothes',
        'male',
        ['white'],
      ),
      'clothes/formal-striped-longsleeve.json': makeItem(
        'Striped Collared/Formal Longsleeve',
        'clothes',
        'male',
        ['white'],
      ),
      'legs/formal-pants.json': makeItem('Formal Pants', 'legs'),
      'legs/formal-striped-pants.json': makeItem('Striped Formal Pants', 'legs'),
      'shoes/basic.json': makeItem('Basic Shoes', 'shoes'),
      'hat/tophat.json': makeItem('Formal Tophat', 'hat'),
      'overalls/brown.json': makeItem('Overalls', 'overalls'),
      'apron/plain.json': makeItem('Apron', 'apron'),
      'cape/solid.json': makeItem('Solid', 'cape'),
      'armour/plate.json': makeItem('Plate', 'armour'),
      'chainmail/steel.json': makeItem('Chainmail', 'chainmail'),
      'weapon/sword.json': makeItem('Sword', 'weapon'),
      'weapon/crystal.json': makeItem('Crystal', 'weapon_magic_crystal'),
      'shield/kite.json': makeItem('Kite', 'shield'),
      'quiver/quiver.json': makeItem('Quiver', 'quiver'),
      'arms/armour.json': makeItem('Armour', 'arms'),
      'gloves/gloves.json': makeItem('Gloves', 'gloves'),
      'wings/feather.json': makeItem('Wings', 'wings'),
      'wound/arm.json': makeItem('Bleeding', 'wound_arm'),
    });

    const sel = pickRandomOutfit({
      catalog: nobleCatalog,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 1.0,
      profile: 'noble',
    });

    expect(sel.items['body']).toEqual({ typeName: 'body', name: 'Body Color' });
    expect(sel.items['head']).toEqual({ typeName: 'head', name: 'Human Male' });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Striped Collared/Formal Longsleeve',
      variant: 'white',
    });
    expect(sel.items['legs']).toEqual({
      typeName: 'legs',
      name: 'Striped Formal Pants',
    });
    expect(sel.items['shoes']?.name).toBe('Basic Shoes');
    expect(sel.items['hat']?.name).toBe('Formal Tophat');

    for (const typeName of [
      'overalls',
      'apron',
      'cape',
      'armour',
      'chainmail',
      'weapon',
      'weapon_magic_crystal',
      'shield',
      'quiver',
      'arms',
      'gloves',
      'wings',
      'wound_arm',
    ] as const) {
      expect(sel.items[typeName]).toBeUndefined();
    }
  });

  it('noble profile fixes male human neutral identity and complete formalwear', () => {
    const { catalog: nobleCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'body/skeleton.json': makeItem('Skeleton Body', 'body'),
      'body/zombie.json': makeItem('Zombie Body', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'head/human-female.json': makeItem('Human Female', 'head', 'female'),
      'head/skeleton.json': makeItem('Skeleton', 'head'),
      'head/zombie.json': makeItem('Zombie', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'expression/happy.json': makeItem('Happy', 'expression'),
      'hair/parted.json': makeItem('Parted', 'hair'),
      'clothes/formal-longsleeve.json': makeItem(
        'Collared/Formal Longsleeve',
        'clothes',
        'male',
        ['white'],
      ),
      'clothes/formal-striped-longsleeve.json': makeItem(
        'Striped Collared/Formal Longsleeve',
        'clothes',
        'male',
        ['white'],
      ),
      'legs/formal-pants.json': makeRecolorItem('Formal Pants', 'legs'),
      'legs/formal-striped-pants.json': makeRecolorItem(
        'Striped Formal Pants',
        'legs',
      ),
      'shoes/basic-shoes.json': makeItem('Basic Shoes', 'shoes', 'male', [
        'black',
        'blue',
      ]),
      'hat/tophat.json': makeItem('Formal Tophat', 'hat', 'male', [
        'black',
        'blue',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: nobleCatalog,
      bodyType: 'female',
      rng: seqRng([0, 0, 0, 0, 0.99, 0, 0]),
      optionalProb: 0,
      profile: 'noble',
    });

    expect(sel.bodyType).toBe('male');
    expect(sel.items['body']).toEqual({ typeName: 'body', name: 'Body Color' });
    expect(sel.items['head']).toEqual({ typeName: 'head', name: 'Human Male' });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['hair']).toBeUndefined();
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Collared/Formal Longsleeve',
      variant: 'white',
    });
    expect(sel.items['legs']).toEqual({
      typeName: 'legs',
      name: 'Formal Pants',
    });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Shoes',
      variant: 'black',
    });
    expect(sel.items['hat']).toEqual({
      typeName: 'hat',
      name: 'Formal Tophat',
      variant: 'black',
    });
  });

  it('noble profile keeps plain and striped formal tops paired with matching pants', () => {
    const { catalog: nobleCatalog } = createCatalog({
      'body/body-color.json': makeItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'clothes/formal-longsleeve.json': makeItem(
        'Collared/Formal Longsleeve',
        'clothes',
        'male',
        ['white'],
      ),
      'clothes/formal-striped-longsleeve.json': makeItem(
        'Striped Collared/Formal Longsleeve',
        'clothes',
        'male',
        ['white'],
      ),
      'legs/formal-pants.json': makeItem('Formal Pants', 'legs'),
      'legs/formal-striped-pants.json': makeItem('Striped Formal Pants', 'legs'),
      'shoes/basic-shoes.json': makeItem('Basic Shoes', 'shoes', 'male', ['black']),
      'hat/tophat.json': makeItem('Formal Tophat', 'hat', 'male', ['black']),
    });

    const plain = pickRandomOutfit({
      catalog: nobleCatalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1,
      profile: 'noble',
    });
    const striped = pickRandomOutfit({
      catalog: nobleCatalog,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 1,
      profile: 'noble',
    });

    expect(plain.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Collared/Formal Longsleeve',
      variant: 'white',
    });
    expect(plain.items['legs']).toEqual({
      typeName: 'legs',
      name: 'Formal Pants',
    });
    expect(striped.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Striped Collared/Formal Longsleeve',
      variant: 'white',
    });
    expect(striped.items['legs']).toEqual({
      typeName: 'legs',
      name: 'Striped Formal Pants',
    });
  });

  it('noble profile does not fall back to unrelated clothes or legs when no formal set is compatible', () => {
    const { catalog: nobleCatalog } = createCatalog({
      'body/body-color.json': makeItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'clothes/tunic.json': makeItem('Tunic', 'clothes', 'male', ['blue']),
      'legs/plain-pants.json': makeItem('Plain Pants', 'legs'),
      'shoes/basic-shoes.json': makeItem('Basic Shoes', 'shoes', 'male', ['black']),
      'hat/tophat.json': makeItem('Formal Tophat', 'hat', 'male', ['black']),
    });

    const sel = pickRandomOutfit({
      catalog: nobleCatalog,
      bodyType: 'male',
      rng: () => 0,
      optionalProb: 1,
      profile: 'noble',
    });

    expect(sel.items['body']).toEqual({ typeName: 'body', name: 'Body Color' });
    expect(sel.items['head']).toEqual({ typeName: 'head', name: 'Human Male' });
    expect(sel.items['expression']).toEqual({
      typeName: 'expression',
      name: 'Neutral',
    });
    expect(sel.items['clothes']).toBeUndefined();
    expect(sel.items['legs']).toBeUndefined();
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Shoes',
      variant: 'black',
    });
    expect(sel.items['hat']).toEqual({
      typeName: 'hat',
      name: 'Formal Tophat',
      variant: 'black',
    });
  });

  it('noble profile randomizes skin, pants, shoes, and tophat colors', () => {
    const { catalog: nobleCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'clothes/formal-longsleeve.json': makeItem(
        'Collared/Formal Longsleeve',
        'clothes',
        'male',
        ['white'],
      ),
      'clothes/formal-striped-longsleeve.json': makeItem(
        'Striped Collared/Formal Longsleeve',
        'clothes',
        'male',
        ['white'],
      ),
      'legs/formal-pants.json': makeRecolorItem('Formal Pants', 'legs'),
      'legs/formal-striped-pants.json': makeRecolorItem(
        'Striped Formal Pants',
        'legs',
      ),
      'shoes/basic-shoes.json': makeItem('Basic Shoes', 'shoes', 'male', [
        'black',
        'blue',
      ]),
      'hat/tophat.json': makeItem('Formal Tophat', 'hat', 'male', [
        'black',
        'blue',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: nobleCatalog,
      palettes,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 0,
      profile: 'noble',
    });

    expect(sel.items['body']).toEqual({
      typeName: 'body',
      name: 'Body Color',
      recolor: 'red',
    });
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Striped Collared/Formal Longsleeve',
      variant: 'white',
    });
    expect(sel.items['legs']).toEqual({
      typeName: 'legs',
      name: 'Striped Formal Pants',
      recolor: 'red',
    });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Shoes',
      variant: 'blue',
    });
    expect(sel.items['hat']).toEqual({
      typeName: 'hat',
      name: 'Formal Tophat',
      variant: 'blue',
    });
  });

  it('noble profile keeps default colors when random colors are disabled', () => {
    const { catalog: nobleCatalog } = createCatalog({
      'body/body-color.json': makeRecolorItem('Body Color', 'body'),
      'head/human-male.json': makeItem('Human Male', 'head'),
      'expression/neutral.json': makeItem('Neutral', 'expression'),
      'clothes/formal-longsleeve.json': makeItem(
        'Collared/Formal Longsleeve',
        'clothes',
        'male',
        ['white'],
      ),
      'clothes/formal-striped-longsleeve.json': makeItem(
        'Striped Collared/Formal Longsleeve',
        'clothes',
        'male',
        ['white'],
      ),
      'legs/formal-pants.json': makeRecolorItem('Formal Pants', 'legs'),
      'legs/formal-striped-pants.json': makeRecolorItem(
        'Striped Formal Pants',
        'legs',
      ),
      'shoes/basic-shoes.json': makeItem('Basic Shoes', 'shoes', 'male', [
        'black',
        'blue',
      ]),
      'hat/tophat.json': makeItem('Formal Tophat', 'hat', 'male', [
        'black',
        'blue',
      ]),
    });

    const sel = pickRandomOutfit({
      catalog: nobleCatalog,
      palettes,
      bodyType: 'male',
      rng: () => 0.99,
      optionalProb: 0,
      profile: 'noble',
      scope: {
        appearance: true,
        clothing: true,
        equipment: true,
        colors: false,
      },
    });

    expect(sel.items['body']).toEqual({ typeName: 'body', name: 'Body Color' });
    expect(sel.items['clothes']).toEqual({
      typeName: 'clothes',
      name: 'Striped Collared/Formal Longsleeve',
      variant: 'white',
    });
    expect(sel.items['legs']).toEqual({
      typeName: 'legs',
      name: 'Striped Formal Pants',
    });
    expect(sel.items['shoes']).toEqual({
      typeName: 'shoes',
      name: 'Basic Shoes',
      variant: 'black',
    });
    expect(sel.items['hat']).toEqual({
      typeName: 'hat',
      name: 'Formal Tophat',
      variant: 'black',
    });
  });
});
