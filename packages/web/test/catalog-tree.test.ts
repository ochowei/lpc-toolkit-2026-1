/** Verifies catalog tree construction and body-type support checks. */
import { describe, expect, it } from 'vitest';
import { createCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import { buildCatalogTree, itemSupportsBodyType } from '../src/slice/catalog-tree';

function item(
  name: string,
  typeName: string,
  layerPath: string,
): ItemDefinition {
  return {
    name,
    type_name: typeName,
    animations: ['walk'],
    credits: [],
    layer_1: { zPos: 10, male: layerPath },
  } as unknown as ItemDefinition;
}

describe('buildCatalogTree', () => {
  it('groups catalog items by source path category segments', () => {
    const { catalog } = createCatalog({
      'headwear/hats/magic/hat_magic_large.json': item('Large Magic Hat', 'hat', 'headwear/hats/magic/large/'),
      'weapons/sword/weapon_sword_rapier.json': item('Rapier', 'weapon', 'weapons/sword/rapier/'),
    });

    const tree = buildCatalogTree(catalog);

    expect(tree.children.headwear?.children.hats?.children.magic?.items).toEqual([
      {
        id: 'hat_magic_large',
        name: 'Large Magic Hat',
        typeName: 'hat',
      },
    ]);
    expect(tree.children.weapons?.children.sword?.items?.[0]?.name).toBe('Rapier');
  });

  it('sorts children and items by display name', () => {
    const { catalog } = createCatalog({
      'zeta/item_z.json': item('Zed', 'hat', 'z/'),
      'alpha/item_a.json': item('Able', 'hat', 'a/'),
      'alpha/item_b.json': item('Baker', 'hat', 'b/'),
    });

    const tree = buildCatalogTree(catalog);

    expect(Object.keys(tree.children)).toEqual(['alpha', 'zeta']);
    expect(tree.children.alpha?.items?.map((i) => i.name)).toEqual([
      'Able',
      'Baker',
    ]);
  });
});

describe('itemSupportsBodyType', () => {
  it('returns true when layer_1 has the selected body type', () => {
    expect(itemSupportsBodyType(item('Rapier', 'weapon', 'weapons/rapier/'), 'male')).toBe(true);
  });

  it('returns false when layer_1 lacks the selected body type', () => {
    const def = {
      name: 'Child Only',
      type_name: 'hat',
      animations: ['walk'],
      credits: [],
      layer_1: { zPos: 10, child: 'hat/child/' },
    } as unknown as ItemDefinition;
    expect(itemSupportsBodyType(def, 'male')).toBe(false);
  });
});
