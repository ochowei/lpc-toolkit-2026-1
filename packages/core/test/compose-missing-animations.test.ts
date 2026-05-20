import { describe, expect, it } from 'vitest';
import { createCatalog } from '../src/catalog.js';
import { getSpritePathsForSelections } from '../src/compose.js';
import type { ItemDefinition, Selections } from '../src/types.js';

// Real upstream data has items with NO `animations` key; upstream normalizes
// those to the default base animation set.
const noAnims = {
  name: 'No Anim Body',
  type_name: 'body',
  credits: [],
  layer_1: { zPos: 10, male: 'body/bodies/male/' },
} as unknown as ItemDefinition;

describe('resolveLayers with an item missing `animations`', () => {
  it('uses upstream default animations for that layer', () => {
    const { catalog } = createCatalog({ 'no_anim.json': noAnims });
    const selections: Selections = {
      bodyType: 'male',
      items: { body: { typeName: 'body', name: 'No Anim Body' } },
    };
    expect(getSpritePathsForSelections(selections, catalog)).toEqual([
      {
        itemId: 'no_anim',
        typeName: 'body',
        path: 'spritesheets/body/bodies/male/walk.png',
        zPos: 10,
      },
    ]);
  });
});
