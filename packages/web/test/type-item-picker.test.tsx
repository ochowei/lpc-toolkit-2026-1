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
});
