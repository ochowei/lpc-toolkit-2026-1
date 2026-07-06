import { createCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import { describe, expect, it } from 'vitest';
import { listCatalogItems, listCatalogTypes } from '../src/catalog-commands.js';

const body: ItemDefinition = {
  name: 'Body Color',
  type_name: 'body',
  animations: ['walk'],
  credits: [],
  layer_1: { zPos: 10, male: 'body/bodies/male/' },
};

const hair: ItemDefinition = {
  name: 'Braids',
  type_name: 'hair',
  animations: ['walk'],
  credits: [],
  variants: ['brown'],
  layer_1: { zPos: 50, male: 'hair/braids/' },
};

describe('catalog commands', () => {
  const catalog = createCatalog({
    'body/body.json': body,
    'hair/braids.json': hair,
  }).catalog;

  it('lists types', () => {
    expect(listCatalogTypes(catalog).typeNames).toEqual(['body', 'hair']);
    expect(listCatalogTypes(catalog).count).toBe(2);
  });

  it('filters items by search and body type', () => {
    expect(
      listCatalogItems(catalog, {
        typeName: 'hair',
        search: 'braid',
        bodyType: 'male',
        animation: 'walk',
      }).items,
    ).toEqual([
      {
        itemId: 'braids',
        typeName: 'hair',
        name: 'Braids',
        variants: ['brown'],
        recolors: [],
        animations: ['walk'],
      },
    ]);
  });
});
