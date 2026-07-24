import { describe, expect, it } from 'vitest';
import {
  assetPackCreditProjection,
  assetPackDefinitionProjection,
} from '../src/asset-pack-baseline.js';
import type { ItemDefinition } from '../src/types.js';

describe('asset pack baseline projections', () => {
  it('projects definition without credits, itemId, or sourcePath', () => {
    const item: ItemDefinition = {
      name: 'Braid',
      type_name: 'hair',
      itemId: 'acme.fantasy-hair--braid',
      sourcePath: 'sheet_definitions/hair/braid.json',
      animations: ['walk', 'climb'],
      credits: [{
        file: 'hair/braid.png',
        author: 'Alice',
        license: 'CC-BY-SA 4.0',
        url: 'https://example.com/alice',
      }],
      layer_1: { zPos: 50, male: 'hair/braid/', female: 'hair/braid/' },
    };

    const def = assetPackDefinitionProjection(item) as Record<string, unknown>;
    expect(def).not.toHaveProperty('credits');
    expect(def).not.toHaveProperty('itemId');
    expect(def).not.toHaveProperty('sourcePath');
    expect(def).toHaveProperty('name', 'Braid');
    expect(def).toHaveProperty('type_name', 'hair');

    expect(assetPackCreditProjection(item)).toEqual(item.credits);
  });

  it('recursively sorts keys so key insertion order produces identical projections', () => {
    const itemForward: ItemDefinition = {
      name: 'Braid',
      type_name: 'hair',
      itemId: 'acme.fantasy-hair--braid',
      sourcePath: 'sheet_definitions/hair/braid.json',
      animations: ['walk', 'climb'],
      variants: ['dark brown', 'black'],
      credits: [{
        file: 'hair/braid.png',
        author: 'Alice',
        license: 'CC-BY-SA 4.0',
        url: 'https://example.com/alice',
      }],
      layer_1: { zPos: 50, male: 'hair/braid/', female: 'hair/braid/' },
    };

    const itemReverse: ItemDefinition = {
      layer_1: { female: 'hair/braid/', male: 'hair/braid/', zPos: 50 },
      credits: [{
        url: 'https://example.com/alice',
        license: 'CC-BY-SA 4.0',
        author: 'Alice',
        file: 'hair/braid.png',
      }],
      variants: ['dark brown', 'black'],
      animations: ['walk', 'climb'],
      sourcePath: 'sheet_definitions/hair/braid.json',
      itemId: 'acme.fantasy-hair--braid',
      type_name: 'hair',
      name: 'Braid',
    };

    const defForward = assetPackDefinitionProjection(itemForward);
    const defReverse = assetPackDefinitionProjection(itemReverse);
    expect(JSON.stringify(defForward)).toBe(JSON.stringify(defReverse));

    const creditForward = assetPackCreditProjection(itemForward);
    const creditReverse = assetPackCreditProjection(itemReverse);
    expect(JSON.stringify(creditForward)).toBe(JSON.stringify(creditReverse));
  });
});
