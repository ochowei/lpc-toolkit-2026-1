import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createCatalog, createPaletteCatalog } from '@lpc-toolkit/core';
import { SidebarSearchResultRow } from '../src/components/layer-stack/sidebar-search';
import { createLabelTranslator, createTranslator } from '../src/i18n';
import type { SliceState } from '../src/slice/selection';
import type { PaletteResult } from '../src/components/layer-stack/palette-search';
import { createRef } from 'react';

const { catalog } = createCatalog({
  'tanktop.json': {
    name: 'Tanktop',
    type_name: 'clothes',
    animations: ['walk'],
    credits: [],
    layer_1: { zPos: 10, female: 'clothes/tanktop/' },
  },
});

const palettes = createPaletteCatalog({}).palettes;

const result: PaletteResult = {
  typeName: 'clothes',
  item: catalog.byTypeName.get('clothes')![0]!,
  supports: false, // male is not supported by female-only Tanktop
  score: 1,
} as unknown as PaletteResult;

const state: SliceState = {
  bodyType: 'male',
  selections: {},
  anim: 'walk',
  dir: 'down',
  playing: false,
  zoom: 4,
  layout: 'single',
};

describe('SidebarSearchResultRow', () => {
  it('renders a body-incompatible result with a tooltip explanation', () => {
    const html = renderToStaticMarkup(
      <SidebarSearchResultRow
        result={result}
        index={0}
        activeIndex={-1}
        disabled={false}
        licenseFilter={new Set()}
        animationFilter={new Set()}
        state={state}
        catalog={catalog}
        palettes={palettes}
        t={createTranslator('en')}
        tl={createLabelTranslator('en')}
        onPick={() => {}}
        setActiveIndex={() => {}}
        activeRowRef={createRef()}
      />
    );

    expect(html).toContain('disabled=""');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('Not available for current body type: Male');
    expect(html).toContain('tabindex="0"');
  });
});
