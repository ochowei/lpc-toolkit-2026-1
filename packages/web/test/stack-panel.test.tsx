import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createCatalog, createPaletteCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import { StackPanel } from '../src/components/layer-stack/stack-panel';
import { createLabelTranslator, createTranslator } from '../src/i18n';
import { ALL_LICENSE_GROUPS } from '../src/slice/license-filter';
import type { SliceState } from '../src/slice/selection';

function defn(name: string, type_name: string): ItemDefinition {
  return {
    name,
    type_name,
    animations: ['walk'],
    credits: [],
    layer_1: { zPos: 10, male: `${type_name}/${name}/` },
  } as unknown as ItemDefinition;
}

const { catalog } = createCatalog({
  'body/body.json': defn('Body Color', 'body'),
  'head/heads_human_male.json': defn('Human Male', 'head'),
  'hair/short/hair_a.json': defn('Hair A', 'hair'),
  'headwear/hats/hat_a.json': defn('Hat A', 'hat'),
  'arms/gloves/gloves_a.json': defn('Gloves A', 'gloves'),
  'torso/clothes/shirt_a.json': defn('Shirt A', 'clothes'),
  'legs/pants/pants_a.json': defn('Pants A', 'legs'),
  'feet/shoes/shoes_a.json': defn('Shoes A', 'shoes'),
  'tools/tool_a.json': defn('Tool A', 'tools'),
  'weapons/sword_a.json': defn('Sword A', 'weapon'),
});

const palettes = createPaletteCatalog({}).palettes;

const state: SliceState = {
  bodyType: 'male',
  selections: {
    body: { typeName: 'body', name: 'Body Color' },
    weapon: { typeName: 'weapon', name: 'Sword A' },
  },
  anim: 'walk',
  dir: 'down',
  playing: true,
  zoom: 4,
  layout: 'single',
};

describe('StackPanel upstream selected-layer groups', () => {
  it('renders every upstream group and keeps empty groups visible', () => {
    const html = renderToStaticMarkup(
      <StackPanel
        disabled={false}
        catalog={catalog}
        palettes={palettes}
        state={state}
        dispatch={() => {}}
        shownTypeNames={[
          'body',
          'head',
          'hair',
          'hat',
          'gloves',
          'clothes',
          'legs',
          'shoes',
          'tools',
          'weapon',
        ]}
        licenseFilter={ALL_LICENSE_GROUPS}
        toggleLicenseGroup={() => {}}
        licenseIncompatibleCount={0}
        removeLicenseIncompatibleSelections={() => {}}
        animationFilter={new Set()}
        toggleAnimation={() => {}}
        animationIncompatibleCount={0}
        removeAnimationIncompatibleSelections={() => {}}
        customOverlay={null}
        customOverlayZPos={95}
        onCustomOverlayUpload={() => {}}
        onCustomOverlayZPosChange={() => {}}
        onClearCustomOverlay={() => {}}
        t={createTranslator('en')}
        tl={createLabelTranslator('en')}
        onPresetApplied={() => {}}
        onReset={() => {}}
        status={null}
        searchInputRef={{ current: null }}
        expanded={null}
        setExpanded={() => {}}
        replacementCardDisplayMode="overlay"
        onReplacementCardDisplayModeChange={() => {}}
      />,
    );

    for (const label of [
      'Body',
      'Head',
      'Hair',
      'Headwear',
      'Arms',
      'Torso',
      'Legs',
      'Feet',
      'Tools',
      'Weapons',
    ]) {
      expect(html).toContain(`>${label}<`);
    }
    expect(html).toContain('Body Color');
    expect(html).toContain('Sword A');
    expect(html.match(/No layer selected/g)).toHaveLength(8);
  });
});
