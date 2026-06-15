import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createCatalog, createPaletteCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import { LayerRow } from '../src/components/layer-stack/layer-row';
import { createLabelTranslator, createTranslator } from '../src/i18n';
import { ALL_LICENSE_GROUPS } from '../src/slice/license-filter';
import type { SliceState } from '../src/slice/selection';
import type { ReplacementCardDisplayMode } from '../src/lib/replacement-card-display-mode';

const palettes = createPaletteCatalog({}).palettes;

const smashItem: ItemDefinition = {
  name: 'Smash',
  type_name: 'tools',
  animations: ['walk'],
  credits: [],
  variants: ['axe', 'hammer'],
  layer_1: { zPos: 1, male: 't/' },
};

const hammerItem: ItemDefinition = {
  ...smashItem,
  name: 'Hammer',
  variants: ['hammer'],
};

const { catalog } = createCatalog({
  'smash.json': smashItem,
  'hammer.json': hammerItem,
});

const state: SliceState = {
  bodyType: 'male',
  selections: {
    tools: { typeName: 'tools', name: 'Smash', variant: 'axe' },
  },
  anim: 'walk',
  dir: 'down',
  playing: false,
  zoom: 4,
  layout: 'single',
};

function renderExpanded(mode: ReplacementCardDisplayMode): string {
  return renderToStaticMarkup(
    <LayerRow
      disabled={false}
      typeName="tools"
      catalog={catalog}
      palettes={palettes}
      state={state}
      dispatch={() => {}}
      tl={createLabelTranslator('en')}
      t={createTranslator('en')}
      licenseFilter={ALL_LICENSE_GROUPS}
      animationFilter={new Set()}
      expanded
      onToggle={() => {}}
      replacementCardDisplayMode={mode}
      onReplacementCardDisplayModeChange={() => {}}
    />,
  );
}

describe('LayerRow collapsed summary', () => {
  it('uses the variant translator in the collapsed layer summary', () => {
    const tl = createLabelTranslator('zh-TW');
    const t = createTranslator('zh-TW');

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
        replacementCardDisplayMode="overlay"
        onReplacementCardDisplayModeChange={() => {}}
      />
    );

    // Traditional Chinese expected outputs:
    // 'Smash' translates to '敲擊工具'
    expect(html).toContain('敲擊工具');
    // 'axe' variant translates to '斧頭'
    expect(html).toContain('斧頭');
    expect(html).toContain('style="width:28px;height:28px"');
    expect(html).not.toContain('grid-cols-[repeat(auto-fill,minmax(72px,1fr))]');
  });
});

describe('LayerRow expanded replacements', () => {
  it('renders an accessible icon-and-text segmented control', () => {
    const html = renderExpanded('overlay');
    expect(html).toContain('aria-label="Card labels"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Overlay');
    expect(html).toContain('Stacked');
    expect(html).toContain('Hidden');
  });

  it('keeps one card height while changing thumbnail and label layout', () => {
    const stacked = renderExpanded('stacked');
    const overlay = renderExpanded('overlay');
    const hidden = renderExpanded('hidden');

    for (const html of [stacked, overlay, hidden]) {
      expect(html).toContain('h-16');
      expect(html).toContain(
        'grid-cols-[repeat(auto-fill,minmax(72px,1fr))]',
      );
    }

    expect(stacked.match(/style="width:40px;height:40px"/g)).toHaveLength(2);
    expect(stacked).toContain('data-label-layout="stacked"');

    expect(overlay.match(/style="width:56px;height:56px"/g)).toHaveLength(2);
    expect(overlay).toContain('data-label-layout="overlay"');
    expect(overlay).toContain('bg-black/65');

    expect(hidden.match(/style="width:56px;height:56px"/g)).toHaveLength(2);
    expect(hidden).toContain('data-label-layout="hidden"');
    expect(hidden).not.toContain('data-visible-item-label="true"');
    expect(hidden).toContain('aria-label="Smash"');
    expect(hidden).toContain('aria-label="Hammer"');
  });
});
