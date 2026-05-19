import { describe, expect, it } from 'vitest';
import { createCatalog } from '../src/catalog.js';
import { getSpritePathsForSelections } from '../src/compose.js';
import type { ItemDefinition, Selections } from '../src/types.js';

// Real upstream data has 84 items with NO `animations` key, violating the
// non-optional ItemDefinition.animations type. resolveLayers must not crash.
const noAnims = {
  name: 'No Anim Body',
  type_name: 'body',
  credits: [],
  layer_1: { zPos: 10, male: 'body/bodies/male/' },
} as unknown as ItemDefinition;

describe('resolveLayers with an item missing `animations`', () => {
  it('does not throw and yields no path for that layer', () => {
    const { catalog } = createCatalog({ 'no_anim.json': noAnims });
    const selections: Selections = {
      bodyType: 'male',
      items: { body: { typeName: 'body', name: 'No Anim Body' } },
    };
    expect(() =>
      getSpritePathsForSelections(selections, catalog),
    ).not.toThrow();
    expect(getSpritePathsForSelections(selections, catalog)).toEqual([]);
  });
});
