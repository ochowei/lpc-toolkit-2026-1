import { describe, expect, it } from 'vitest';
import { createCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import {
  buildUpstreamCategoryGroups,
  UPSTREAM_CATEGORY_GROUPS,
} from '../src/slice/upstream-category-groups';

function defn(name: string, type_name: string): ItemDefinition {
  return {
    name,
    type_name,
    animations: ['walk'],
    credits: [],
    layer_1: { zPos: 10, male: `${type_name}/${name}/` },
  } as unknown as ItemDefinition;
}

describe('UPSTREAM_CATEGORY_GROUPS', () => {
  it('uses the upstream top-level category display order', () => {
    expect(UPSTREAM_CATEGORY_GROUPS.map((g) => g.label)).toEqual([
      'Body',
      'Head',
      'Hair',
      'Headwear',
      'Arms',
      'Torso',
      'Legs',
      'Feet',
      'Tools',
      'Weapons',
    ]);
  });
});

describe('buildUpstreamCategoryGroups', () => {
  it('keeps every upstream group even when no type names are selected in that group', () => {
    const { catalog } = createCatalog({
      'body/body.json': defn('Body Color', 'body'),
      'head/heads_human_male.json': defn('Human Male', 'head'),
      'head/face_neutral.json': defn('Neutral', 'expression'),
      'hair/short/hair_a.json': defn('Hair A', 'hair'),
      'headwear/hats/hat_a.json': defn('Hat A', 'hat'),
      'arms/gloves/gloves_a.json': defn('Gloves A', 'gloves'),
      'torso/clothes/shirt_a.json': defn('Shirt A', 'clothes'),
      'legs/pants/pants_a.json': defn('Pants A', 'legs'),
      'feet/shoes/shoes_a.json': defn('Shoes A', 'shoes'),
      'tools/tool_a.json': defn('Tool A', 'tools'),
      'weapons/sword_a.json': defn('Sword A', 'weapon'),
    });

    const groups = buildUpstreamCategoryGroups(catalog, [
      'body',
      'head',
      'hair',
      'hat',
      'gloves',
      'clothes',
      'legs',
      'shoes',
      'tools',
      'weapon',
    ]);

    expect(groups.map((g) => [g.label, g.typeNames])).toEqual([
      ['Body', ['body']],
      ['Head', ['head']],
      ['Hair', ['hair']],
      ['Headwear', ['hat']],
      ['Arms', ['gloves']],
      ['Torso', ['clothes']],
      ['Legs', ['legs']],
      ['Feet', ['shoes']],
      ['Tools', ['tools']],
      ['Weapons', ['weapon']],
    ]);
  });

  it('returns empty type lists for upstream groups without shown type names', () => {
    const { catalog } = createCatalog({
      'body/body.json': defn('Body Color', 'body'),
      'head/heads_human_male.json': defn('Human Male', 'head'),
      'head/face_neutral.json': defn('Neutral', 'expression'),
    });

    const groups = buildUpstreamCategoryGroups(catalog, ['body']);

    expect(groups.map((g) => [g.label, g.typeNames])).toEqual([
      ['Body', ['body']],
      ['Head', []],
      ['Hair', []],
      ['Headwear', []],
      ['Arms', []],
      ['Torso', []],
      ['Legs', []],
      ['Feet', []],
      ['Tools', []],
      ['Weapons', []],
    ]);
  });
});
