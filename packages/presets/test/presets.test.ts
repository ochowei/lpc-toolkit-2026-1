import {
  createCatalog,
  createPaletteCatalog,
  type ItemDefinition,
  type Selection,
  type TypeName,
} from '@lpc-toolkit/core';
import { describe, expect, it } from 'vitest';
import { computePresetSelection, PRESETS } from '../src/index.js';

function item(name: string, typeName: TypeName): ItemDefinition {
  return {
    name,
    type_name: typeName,
    animations: ['walk'],
    credits: [],
    layer_1: { zPos: 10, male: `${typeName}/${name}/` },
  };
}

describe('built-in presets', () => {
  it('includes stable unique preset ids', () => {
    const ids = PRESETS.map((preset) => preset.id);

    expect(ids).toContain('farmer');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('applies a preset while preserving non-clothing selections', () => {
    const farmer = PRESETS.find((preset) => preset.id === 'farmer');
    if (!farmer) throw new Error('Expected farmer preset to exist.');

    const catalog = createCatalog({
      'body/body.json': item('Body Color', 'body'),
      'head/human-male.json': item('Human Male', 'head'),
      'expression/neutral.json': item('Neutral', 'expression'),
      'clothes/shortsleeve.json': item('Shortsleeve', 'clothes'),
      'overalls/overalls.json': item('Overalls', 'overalls'),
      'shoes/basic-boots.json': item('Basic Boots', 'shoes'),
      'hair/messy3.json': item('Messy3', 'hair'),
    }).catalog;
    const palettes = createPaletteCatalog({}).palettes;
    const beard: Selection = {
      typeName: 'beard',
      name: 'Short Beard',
    };
    const current: Record<TypeName, Selection> = {
      beard,
      hat: { typeName: 'hat', name: 'Old Hat' },
    };

    const result = computePresetSelection(
      farmer,
      current,
      'female',
      catalog,
      palettes,
    );

    expect(result.bodyType).toBe('male');
    expect(result.selections.beard).toBe(beard);
    expect(result.selections.hat).toBeUndefined();
    expect(result.selections.body?.name).toBe('Body Color');
    expect(result.selections.clothes?.recolor).toBe('brown');
    expect(result.skipped).toEqual([]);
  });
});
