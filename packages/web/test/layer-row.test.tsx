import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createCatalog, createPaletteCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import { LayerRow } from '../src/components/layer-stack/layer-row';
import { createLabelTranslator, createTranslator } from '../src/i18n';
import { ALL_LICENSE_GROUPS } from '../src/slice/license-filter';
import type { SliceState } from '../src/slice/selection';

const palettes = createPaletteCatalog({}).palettes;

const smashItem: ItemDefinition = {
  name: 'Smash',
  type_name: 'tools',
  animations: ['walk'],
  credits: [],
  variants: ['axe', 'hammer'],
  layer_1: { zPos: 1, male: 't/' },
};

const { catalog } = createCatalog({
  'smash.json': smashItem,
});

describe('LayerRow collapsed summary', () => {
  it('uses the variant translator in the collapsed layer summary', () => {
    const tl = createLabelTranslator('zh-TW');
    const t = createTranslator('zh-TW');
    const state: SliceState = {
      bodyType: 'male',
      selections: {
        tools: { typeName: 'tools', name: 'Smash', variant: 'axe' },
      },
      anim: 'walk',
      dir: 'down',
      playing: false,
      zoom: 4,
    };

    const html = renderToStaticMarkup(
      <LayerRow
        disabled={false}
        typeName="tools"
        catalog={catalog}
        palettes={palettes}
        state={state}
        dispatch={() => {}}
        tl={tl}
        t={t}
        licenseFilter={ALL_LICENSE_GROUPS}
        animationFilter={new Set()}
        expanded={false}
        onToggle={() => {}}
      />
    );

    // Traditional Chinese expected outputs:
    // 'Smash' translates to '敲擊工具'
    expect(html).toContain('敲擊工具');
    // 'axe' variant translates to '斧頭'
    expect(html).toContain('斧頭');
  });
});
