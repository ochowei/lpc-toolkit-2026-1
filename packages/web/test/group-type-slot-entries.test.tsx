import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createCatalog,
  createPaletteCatalog,
  type ItemDefinition,
  type TypeName,
} from '@lpc-toolkit/core';
import { GroupTypeSlotEntries } from '../src/components/layer-stack/group-type-slot-entries';
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
  'head/heads_human_male.json': defn('Human Male', 'head'),
  'head/neutral.json': defn('Neutral', 'expression'),
  'head/ears.json': defn('Pointed Ears', 'ears'),
});

const palettes = createPaletteCatalog({}).palettes;

const state: SliceState = {
  bodyType: 'male',
  selections: {
    expression: { typeName: 'expression', name: 'Neutral' },
  },
  anim: 'walk',
  dir: 'down',
  playing: true,
  zoom: 4,
  layout: 'single',
};

function renderEntries(args: {
  readonly sectionOpen: boolean;
  readonly expandedSlotType?: TypeName | null;
}): string {
  return renderToStaticMarkup(
    <GroupTypeSlotEntries
      disabled={false}
      sectionOpen={args.sectionOpen}
      onToggleSection={() => {}}
      typeNames={['head', 'expression', 'ears']}
      catalog={catalog}
      palettes={palettes}
      state={state}
      dispatch={() => {}}
      tl={createLabelTranslator('en')}
      t={createTranslator('en')}
      licenseFilter={ALL_LICENSE_GROUPS}
      animationFilter={new Set()}
      expandedSlotType={args.expandedSlotType ?? null}
      onToggleSlotType={() => {}}
      replacementCardDisplayMode="overlay"
      onReplacementCardDisplayModeChange={() => {}}
      onNavigateToType={() => {}}
    />,
  );
}

describe('GroupTypeSlotEntries collapsed groups', () => {
  it('shows a compact group control and hides slot chips when closed', () => {
    const html = renderEntries({ sectionOpen: false });

    expect(html).toContain('Show 3 slots');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('bg-transparent');
    expect(html).toContain('border-dashed');
    expect(html).toContain('text-text-mute');
    expect(html).not.toContain('+ head');
    expect(html).not.toContain('expression: Neutral');
    expect(html).not.toContain('+ ears');
  });

  it('shows slot chips and selected replacement entries when open', () => {
    const html = renderEntries({ sectionOpen: true });

    expect(html).toContain('Hide 3 slots');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('+ head');
    expect(html).toContain('expression: Neutral - Replace');
    expect(html).toContain('+ ears');
    expect(html).toContain('pl-2 pr-1');
    expect(html).toContain('mt-1.5 pl-2');
  });

  it('keeps the inline picker visible for the active unselected slot entry', () => {
    const html = renderEntries({ sectionOpen: true, expandedSlotType: 'head' });

    expect(html).toContain('Swap head');
    expect(html).toContain('Human Male');
  });

  it('opens the inline picker under a selected slot entry', () => {
    const html = renderEntries({
      sectionOpen: true,
      expandedSlotType: 'expression',
    });

    expect(html).toContain('expression: Neutral - Replace');
    expect(html).toContain('Swap expression');
    expect(html).toContain('Neutral');
    expect(html).toContain('border-accent bg-accent/10 text-text');
    expect(html).toContain('aria-expanded="true"');
  });
});
