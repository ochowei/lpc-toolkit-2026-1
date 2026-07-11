import { describe, expect, it } from 'vitest';
import type {
  CanvasAdapter,
  Catalog,
  ComposedSheet,
  ComposeOptions,
  ItemDefinition,
  PaletteMetadata,
  Selections,
} from '@lpc-toolkit/core';
import { createSingleItemComposer } from '../src/hooks/use-single-item-composer';

describe('createSingleItemComposer', () => {
  it('composes full items and individual layers with selection-bound palettes', async () => {
    const item: ItemDefinition = {
      name: 'Tunic',
      type_name: 'torso',
      animations: ['walk'],
      credits: [],
      recolors: { material: 'cloth', palettes: ['ulpc'] },
    };
    const catalog: Catalog = {
      byItemId: new Map([['tunic', item]]),
      byTypeName: new Map([['torso', [item]]]),
      typeNames: ['torso'],
      aliases: new Map(),
    };
    const palettes: PaletteMetadata = {
      materials: {
        cloth: {
          default: 'ulpc',
          base: 'white',
          palettes: {
            ulpc: {
              white: ['#ffffff'],
              red: ['#ff0000'],
            },
          },
        },
      },
      versions: {},
    };
    const selections: Selections = {
      bodyType: 'male',
      items: {
        torso: { typeName: 'torso', name: 'Tunic', recolor: 'red' },
      },
    };
    const adapter = {} as CanvasAdapter;
    const sheet = {} as ComposedSheet;
    const calls: Array<{
      selections: Selections;
      options: ComposeOptions;
    }> = [];
    const compose = async (
      passedSelections: Selections,
      options: ComposeOptions,
    ): Promise<ComposedSheet> => {
      calls.push({ selections: passedSelections, options });
      return sheet;
    };
    const composer = createSingleItemComposer({
      catalog,
      palettes,
      adapter,
      compose,
    });

    await composer.composeSingleItem(selections);
    await composer.composeSingleItemLayer(selections, 3);

    expect(calls[0]?.selections).toBe(selections);
    expect(calls[0]?.options).not.toHaveProperty('onlyLayerNumber');
    expect(calls[1]?.selections).toBe(selections);
    expect(calls[1]?.options.onlyLayerNumber).toBe(3);
    expect(calls[0]?.options.adapter).toBe(adapter);
    expect(calls[1]?.options.adapter).toBe(adapter);
    expect(calls[0]?.options.spritesheetsBaseUrl).toBe('');
    expect(calls[1]?.options.spritesheetsBaseUrl).toBe('');
    expect(calls[0]?.options.resolvePalette?.(selections.items.torso!, item)).toEqual({
      source: ['#ffffff'],
      target: ['#ff0000'],
      material: 'cloth',
    });
    expect(calls[1]?.options.resolvePalette?.(selections.items.torso!, item)).toEqual({
      source: ['#ffffff'],
      target: ['#ff0000'],
      material: 'cloth',
    });
  });
});
