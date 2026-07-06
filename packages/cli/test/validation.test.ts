import { createCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import { describe, expect, it } from 'vitest';
import { validateSelections } from '../src/validation.js';

const body: ItemDefinition = {
  name: 'Body Color',
  type_name: 'body',
  animations: ['walk'],
  credits: [],
  recolors: { material: 'body', palettes: ['ulpc'] },
  layer_1: { zPos: 10, male: 'body/bodies/male/' },
};

describe('validateSelections', () => {
  it('reports unknown items', () => {
    const catalog = createCatalog({ 'body/body.json': body }).catalog;
    const result = validateSelections(
      {
        bodyType: 'male',
        items: { body: { typeName: 'body', name: 'Missing' } },
      },
      { catalog, palettes: { materials: {}, versions: {} }, pathExists: () => true },
    );

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe('unknown_item');
  });

  it('reports missing sprite paths', () => {
    const catalog = createCatalog({ 'body/body.json': body }).catalog;
    const result = validateSelections(
      {
        bodyType: 'male',
        items: { body: { typeName: 'body', name: 'Body Color' } },
      },
      { catalog, palettes: { materials: {}, versions: {} }, pathExists: () => false },
    );

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe('missing_sprite_path');
  });
});
