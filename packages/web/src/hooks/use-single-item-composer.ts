import { useMemo } from 'react';
import {
  composeSelections,
  makeResolvePalette,
  type CanvasAdapter,
  type Catalog,
  type ComposedSheet,
  type PaletteMetadata,
  type Selections,
} from '@lpc-toolkit/core';
import { createBrowserCanvasAdapter } from '../adapter/browser-canvas-adapter';

export interface SingleItemComposer {
  readonly composeSingleItem: (selections: Selections) => Promise<ComposedSheet>;
  readonly composeSingleItemLayer: (
    selections: Selections,
    layerNumber: number,
  ) => Promise<ComposedSheet>;
}

export function createSingleItemComposer(args: {
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly adapter: CanvasAdapter;
  readonly compose?: typeof composeSelections;
}): SingleItemComposer {
  const compose = args.compose ?? composeSelections;
  const run = (selections: Selections, onlyLayerNumber?: number) =>
    compose(selections, {
      catalog: args.catalog,
      adapter: args.adapter,
      spritesheetsBaseUrl: '',
      resolvePalette: makeResolvePalette(args.catalog, args.palettes, selections),
      ...(onlyLayerNumber === undefined ? {} : { onlyLayerNumber }),
    });

  return {
    composeSingleItem: (selections) => run(selections),
    composeSingleItemLayer: (selections, layerNumber) =>
      run(selections, layerNumber),
  };
}

export function useSingleItemComposer(
  catalog: Catalog,
  palettes: PaletteMetadata,
): SingleItemComposer {
  const adapter = useMemo(() => createBrowserCanvasAdapter(), []);
  return useMemo(
    () => createSingleItemComposer({ catalog, palettes, adapter }),
    [adapter, catalog, palettes],
  );
}
