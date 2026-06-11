import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createPaletteCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import { ColorPicker } from '../src/components/color-picker';
import { createLabelTranslator } from '../src/i18n';

const palettes = createPaletteCatalog({
  'm/meta_m.json': { type: 'material', default: 'v1', base: 'c0' },
  'm/m_v1.json': {
    c0: ['#000000', '#111111'],
    red: ['#ff0000', '#ee0000'],
  },
}).palettes;

const smashItem: ItemDefinition = {
  name: 'Smash',
  type_name: 'tools',
  animations: ['walk'],
  credits: [],
  variants: ['axe', 'hammer'],
  layer_1: { zPos: 1, male: 't/' },
};

const clothItem: ItemDefinition = {
  name: 'Cloth',
  type_name: 'armor',
  animations: ['walk'],
  credits: [],
  recolors: { material: 'm', palettes: ['v1'] },
  layer_1: { zPos: 1, male: 't/' },
};

describe('ColorPicker rendering', () => {
  it('renders variants as localized styles', () => {
    const tl = createLabelTranslator('zh-TW');
    const html = renderToStaticMarkup(
      <ColorPicker
        item={smashItem}
        selection={{ typeName: 'tools', name: 'Smash', variant: 'axe' }}
        palettes={palettes}
        colorLabel="顏色"
        styleLabel="款式"
        tl={tl}
        onSelect={() => {}}
      />
    );

    // Should render the style label instead of color label
    expect(html).toContain('款式');
    expect(html).not.toContain('顏色');

    // Should translate variant buttons using tl.variant() (e.g. axe -> 斧頭, hammer -> 鐵鎚)
    expect(html).toContain('斧頭');
    expect(html).toContain('鐵鎚');
  });

  it('keeps recolors under the localized color label', () => {
    const tl = createLabelTranslator('zh-TW');
    const html = renderToStaticMarkup(
      <ColorPicker
        item={clothItem}
        selection={{ typeName: 'armor', name: 'Cloth', recolor: 'red' }}
        palettes={palettes}
        colorLabel="顏色"
        styleLabel="款式"
        tl={tl}
        onSelect={() => {}}
      />
    );

    // Should render the color label instead of style label
    expect(html).toContain('顏色');
    expect(html).not.toContain('款式');

    // Should translate recolor buttons using tl.color()
    expect(html).toContain('紅色');
    expect(html).toContain('title="紅色"');
    expect(html).toContain('aria-label="紅色"');
  });
});
