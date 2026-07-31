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

const linkedClothItem: ItemDefinition = {
  ...clothItem,
  name: 'Linked Cloth',
  match_body_color: true,
};

const multiChannelItem: ItemDefinition = {
  ...clothItem,
  name: 'Multi Cloth',
  recolors: {
    color_1: { material: 'm', palettes: ['v1'] },
    color_2: {
      material: 'm',
      palettes: ['v1'],
      type_name: 'accent',
      label: 'Accent Color',
    },
    color_3: {
      material: 'm',
      palettes: ['v1'],
      type_name: 'skin',
      linked_to: { selection: 'body', channel: 'primary' },
    },
  },
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
        linkedColorLabel="跟隨身體"
        assetDefaultColorLabel="資產預設色"
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
        linkedColorLabel="跟隨身體"
        assetDefaultColorLabel="資產預設色"
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

  it('renders a followed non-body recolor as read-only without dispatch controls', () => {
    const tl = createLabelTranslator('zh-TW');
    const html = renderToStaticMarkup(
      <ColorPicker
        item={linkedClothItem}
        selection={{ typeName: 'armor', name: 'Linked Cloth', recolor: 'c0' }}
        bodyRecolor="red"
        palettes={palettes}
        colorLabel="顏色"
        styleLabel="款式"
        linkedColorLabel="跟隨身體"
        assetDefaultColorLabel="資產預設色"
        tl={tl}
        onSelect={() => {
          throw new Error('read-only followed colors must not dispatch');
        }}
      />
    );

    expect(html).toContain('顏色');
    expect(html).toContain('跟隨身體');
    expect(html).toContain('紅色');
    expect(html).toContain('background-color:#ee0000');
    expect(html).not.toContain('<button');
  });

  it('shows the asset default when the body has no explicit recolor', () => {
    const html = renderToStaticMarkup(
      <ColorPicker
        item={linkedClothItem}
        selection={{ typeName: 'armor', name: 'Linked Cloth' }}
        palettes={palettes}
        colorLabel="Color"
        styleLabel="Style"
        linkedColorLabel="Follows body"
        assetDefaultColorLabel="Asset default"
        tl={createLabelTranslator('en')}
        onSelect={() => {}}
      />
    );

    expect(html).toContain('Follows body');
    expect(html).toContain('Asset default');
    expect(html).not.toContain('<button');
  });

  it('renders grouped secondary controls, explicit default, and linked status', () => {
    const html = renderToStaticMarkup(
      <ColorPicker
        item={multiChannelItem}
        selection={{
          typeName: 'armor',
          name: 'Multi Cloth',
          recolor: 'red',
          channelRecolors: { accent: 'red' },
        }}
        bodyRecolor="red"
        palettes={palettes}
        colorLabel="Color"
        styleLabel="Style"
        linkedColorLabel="Follows body"
        assetDefaultColorLabel="Asset default"
        tl={createLabelTranslator('en')}
        onSelect={() => {}}
      />
    );

    expect(html).toContain('Color');
    expect(html).toContain('Accent Color');
    expect(html).toContain('Skin');
    expect(html).toContain('Asset default');
    expect(html).toContain('Follows body');
    expect(html).toContain('data-channel-id="accent"');
    expect(html).toContain('data-channel-id="skin"');
    expect(html).toContain('flex-wrap');
    expect(html).toContain('overflow-y-auto');
  });

  it('disables every editable channel button', () => {
    const html = renderToStaticMarkup(
      <ColorPicker
        disabled
        item={multiChannelItem}
        selection={{ typeName: 'armor', name: 'Multi Cloth' }}
        palettes={palettes}
        colorLabel="Color"
        styleLabel="Style"
        linkedColorLabel="Follows body"
        assetDefaultColorLabel="Asset default"
        tl={createLabelTranslator('en')}
        onSelect={() => {}}
      />
    );

    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(5);
    expect(html).toContain('aria-pressed="true"');
  });
});
