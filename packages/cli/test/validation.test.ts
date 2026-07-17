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
  it('accepts a recolor sub-binding without requiring its own sprite layer', () => {
    const coat: ItemDefinition = {
      name: 'Coat',
      type_name: 'coat',
      animations: ['walk'],
      credits: [],
      recolors: {
        color_1: { material: 'cloth', palettes: ['ulpc'] },
        color_2: { material: 'metal', palettes: ['ulpc'], type_name: 'trim' },
      },
      layer_1: { zPos: 20, male: 'coat/' },
    };
    const catalog = createCatalog({ 'torso/coat.json': coat }).catalog;
    const result = validateSelections(
      {
        bodyType: 'male',
        items: {
          coat: { typeName: 'coat', name: 'Coat', recolor: 'ulpc.blue' },
          trim: { typeName: 'trim', name: 'Coat', recolor: 'ulpc.gold' },
        },
      },
      {
        catalog,
        palettes: {
          materials: {
            cloth: {
              default: 'lpcr',
              base: 'blue',
              palettes: { ulpc: { blue: ['#2255aa'] } },
            },
            metal: {
              default: 'lpcr',
              base: 'iron',
              palettes: { ulpc: { iron: ['#777777'], gold: ['#d4af37'] } },
            },
          },
          versions: {},
        },
        pathExists: () => true,
      },
    );

    expect(result).toEqual({ ok: true, warnings: [], errors: [] });
  });

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
