import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createCatalog,
  createPaletteCatalog,
  type ItemDefinition,
} from '@lpc-toolkit/core';
import { TypeItemPicker } from '../src/components/layer-stack/type-item-picker';
import { createLabelTranslator, createTranslator } from '../src/i18n';
import { ALL_LICENSE_GROUPS } from '../src/slice/license-filter';
import type { SliceState } from '../src/slice/selection';

const normalBowItem: ItemDefinition = {
  name: 'Normal',
  display_name: 'Normal Bow',
  type_name: 'weapon',
  animations: ['walk'],
  credits: [],
  layer_1: { male: 'weapon/bow/normal_male/' },
} as unknown as ItemDefinition;

const { catalog } = createCatalog({
  'weapon/bow/weapon_ranged_bow_normal.json': normalBowItem,
});

const palettes = createPaletteCatalog({}).palettes;

const linkedPalettes = createPaletteCatalog({
  'body/meta_body.json': { type: 'material', default: 'v1', base: 'light' },
  'body/body_v1.json': {
    light: ['#f0d0b0'],
    brown: ['#704020'],
  },
}).palettes;

const bodyItem: ItemDefinition = {
  name: 'Body Color',
  type_name: 'body',
  animations: ['walk'],
  credits: [],
  match_body_color: true,
  recolors: { material: 'body', palettes: ['v1'] },
  layer_1: { zPos: 1, male: 'body/' },
};

const expressionItem: ItemDefinition = {
  name: 'Neutral',
  type_name: 'expression',
  animations: ['walk'],
  credits: [],
  match_body_color: true,
  recolors: { material: 'body', palettes: ['v1'] },
  layer_1: { zPos: 2, male: 'expression/' },
};

const { catalog: linkedCatalog } = createCatalog({
  'body/body.json': bodyItem,
  'head/faces/face_neutral.json': expressionItem,
});

const state: SliceState = {
  bodyType: 'male',
  selections: {},
  anim: 'walk',
  dir: 'down',
  playing: true,
  zoom: 4,
  layout: 'single',
};

describe('TypeItemPicker Catalog Localized Name Rendering', () => {
  it('uses catalogItemName to render translated item name rather than raw name', () => {
    const html = renderToStaticMarkup(
      <TypeItemPicker
        disabled={false}
        typeName="weapon"
        catalog={catalog}
        palettes={palettes}
        state={state}
        dispatch={() => {}}
        tl={createLabelTranslator('zh-TW')}
        t={createTranslator('zh-TW')}
        licenseFilter={ALL_LICENSE_GROUPS}
        animationFilter={new Set()}
        replacementCardDisplayMode="overlay"
        onReplacementCardDisplayModeChange={() => {}}
      />
    );

    // ITEM_DISPLAY_NAMES_ZH has "weapon_ranged_bow_normal" -> "普通弓"
    // ITEM_NAME_LABELS_ZH has "Normal" -> "正常"
    // We expect the translated label/title to contain "普通弓" rather than "正常"
    expect(html).toContain('普通弓');
    expect(html).not.toContain('正常');
  });

  it('passes the selected body color to a followed item as read-only status', () => {
    const linkedState: SliceState = {
      ...state,
      selections: {
        body: { typeName: 'body', name: 'Body Color', recolor: 'brown' },
        expression: {
          typeName: 'expression',
          name: 'Neutral',
          recolor: 'light',
        },
      },
    };
    const html = renderToStaticMarkup(
      <TypeItemPicker
        disabled={false}
        typeName="expression"
        catalog={linkedCatalog}
        palettes={linkedPalettes}
        state={linkedState}
        dispatch={() => {}}
        tl={createLabelTranslator('zh-TW')}
        t={createTranslator('zh-TW')}
        licenseFilter={ALL_LICENSE_GROUPS}
        animationFilter={new Set()}
        replacementCardDisplayMode="overlay"
        onReplacementCardDisplayModeChange={() => {}}
      />
    );

    expect(html).toContain('跟隨身體');
    expect(html).toContain('棕色');
    expect(html).toContain('background-color:#704020');
  });
});
