import { describe, expect, it } from 'vitest';
import { createCatalog, type ItemDefinition, type Selection } from '@lpc-toolkit/core';
import { computePresetSelection } from '../src/presets-apply';
import type { Preset } from '../src/presets';

function defn(
  name: string,
  type_name: string,
  bodyType = 'male',
): ItemDefinition {
  return {
    name,
    type_name,
    animations: ['walk'],
    credits: [],
    layer_1: { zPos: 10, [bodyType]: `${type_name}/${name}/` },
  } as unknown as ItemDefinition;
}

const { catalog } = createCatalog({
  'tunic.json': defn('Tunic', 'clothes', 'male'),
  'helm.json': defn('Helm', 'hat', 'male'),
  'gown.json': defn('Gown', 'clothes', 'female'),
});

const malePreset: Preset = {
  id: 'm',
  labelKey: 'preset.farmer',
  emoji: '🌾',
  items: [
    { typeName: 'clothes', name: 'Tunic' },
    { typeName: 'hat', name: 'Helm' },
  ],
};

const femaleOnlyPreset: Preset = {
  id: 'f',
  labelKey: 'preset.mage',
  emoji: '🔮',
  items: [
    { typeName: 'clothes', name: 'Gown' }, // female-only art
    { typeName: 'hat', name: 'Helm' },
  ],
};

describe('computePresetSelection', () => {
  it('clears clothing categories but keeps personal appearance', () => {
    const current: Record<string, Selection> = {
      body: { typeName: 'body', name: 'Body' },
      hair: { typeName: 'hair', name: 'Hair' },
      torso: { typeName: 'torso', name: 'Old Shirt' },
      weapon: { typeName: 'weapon', name: 'Old Sword' },
    };
    const { selections } = computePresetSelection(
      malePreset,
      current,
      'male',
      catalog,
    );
    expect(selections.body).toEqual(current.body);
    expect(selections.hair).toEqual(current.hair);
    expect('torso' in selections).toBe(false);
    expect('weapon' in selections).toBe(false);
  });

  it('adds compatible preset items', () => {
    const { selections, skipped } = computePresetSelection(
      malePreset,
      {},
      'male',
      catalog,
    );
    expect(skipped).toHaveLength(0);
    expect(selections.clothes).toEqual({ typeName: 'clothes', name: 'Tunic' });
    expect(selections.hat).toEqual({ typeName: 'hat', name: 'Helm' });
  });

  it('skips items not available for the current body type', () => {
    const { selections, skipped } = computePresetSelection(
      femaleOnlyPreset,
      {},
      'male',
      catalog,
    );
    expect(skipped.map((i) => i.name)).toEqual(['Gown']);
    expect('clothes' in selections).toBe(false);
    expect(selections.hat).toEqual({ typeName: 'hat', name: 'Helm' });
  });

  it('skips items missing from the catalog', () => {
    const badPreset: Preset = {
      id: 'b',
      labelKey: 'preset.rogue',
      emoji: '🗡️',
      items: [{ typeName: 'clothes', name: 'Nonexistent' }],
    };
    const { skipped } = computePresetSelection(badPreset, {}, 'male', catalog);
    expect(skipped.map((i) => i.name)).toEqual(['Nonexistent']);
  });

  it('carries the preset variant into the selection', () => {
    const variantPreset: Preset = {
      id: 'v',
      labelKey: 'preset.knight',
      emoji: '⚔️',
      items: [{ typeName: 'clothes', name: 'Tunic', variant: 'red' }],
    };
    const { selections } = computePresetSelection(
      variantPreset,
      {},
      'male',
      catalog,
    );
    expect(selections.clothes).toEqual({
      typeName: 'clothes',
      name: 'Tunic',
      variant: 'red',
    });
  });

  it('leaves no residue when switching from one preset to another', () => {
    const afterA = computePresetSelection(malePreset, {}, 'male', catalog)
      .selections;
    const afterB = computePresetSelection(
      femaleOnlyPreset,
      afterA,
      'male',
      catalog,
    ).selections;
    // malePreset's Tunic was cleared; femaleOnlyPreset's Gown was skipped.
    expect('clothes' in afterB).toBe(false);
    expect(afterB.hat).toEqual({ typeName: 'hat', name: 'Helm' });
  });
});
