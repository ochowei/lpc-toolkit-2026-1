import { describe, expect, it } from 'vitest';
import { createCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import { filterAndRankPaletteItems } from '../src/components/layer-stack/palette-search';

function makeItem(name: string, typeName: string, author = 'Anon'): ItemDefinition {
  return {
    name,
    type_name: typeName,
    animations: ['walk'],
    credits: [{ file: '', notes: '', authors: [author], licenses: ['CC-BY 3.0'], urls: [] }],
    layer_1: { zPos: 10, male: `${typeName}/${name}/` },
  } as unknown as ItemDefinition;
}

describe('filterAndRankPaletteItems', () => {
  const { catalog } = createCatalog({
    'hair/curly.json': makeItem('Curly', 'hair'),
    'hair/spiky.json': makeItem('Spiky', 'hair', 'AltAuthor'),
    'weapon/sword.json': makeItem('Sword', 'weapon'),
    'body/light.json': makeItem('Light', 'body'),
  });
  const shownTypeNames = ['body', 'hair', 'weapon'];

  it('returns all items when query is empty', () => {
    const r = filterAndRankPaletteItems({
      catalog, bodyType: 'male', query: '', shownTypeNames,
    });
    expect(r).toHaveLength(4);
  });

  it('filters by item name substring (case-insensitive)', () => {
    const r = filterAndRankPaletteItems({
      catalog, bodyType: 'male', query: 'cur', shownTypeNames,
    });
    expect(r.map((x) => x.item.name)).toEqual(['Curly']);
  });

  it('filters by typeName substring', () => {
    const r = filterAndRankPaletteItems({
      catalog, bodyType: 'male', query: 'weapon', shownTypeNames,
    });
    expect(r.map((x) => x.item.name)).toEqual(['Sword']);
  });

  it('filters by author', () => {
    const r = filterAndRankPaletteItems({
      catalog, bodyType: 'male', query: 'altauthor', shownTypeNames,
    });
    expect(r.map((x) => x.item.name)).toEqual(['Spiky']);
  });

  it('sorts by typeName then item name (compat is uniform here)', () => {
    const r = filterAndRankPaletteItems({
      catalog, bodyType: 'male', query: '', shownTypeNames,
    });
    expect(r.map((x) => `${x.typeName}:${x.item.name}`)).toEqual([
      'body:Light', 'hair:Curly', 'hair:Spiky', 'weapon:Sword',
    ]);
  });

  it('puts body-type-incompatible items after compatible ones', () => {
    // Build a catalog where one item supports only female
    const femaleOnly: ItemDefinition = {
      ...makeItem('FemaleHair', 'hair'),
      layer_1: { zPos: 10, female: 'hair/femalehair/' },
    } as unknown as ItemDefinition;
    const { catalog: c2 } = createCatalog({
      'hair/curly.json': makeItem('Curly', 'hair'),
      'hair/femalehair.json': femaleOnly,
    });
    const r = filterAndRankPaletteItems({
      catalog: c2, bodyType: 'male', query: '', shownTypeNames: ['hair'],
    });
    expect(r).toHaveLength(2);
    expect(r[0]?.item.name).toBe('Curly');          // compatible first
    expect(r[1]?.item.name).toBe('FemaleHair');     // incompatible after
  });

  it('filters and sorts by display names / itemLabel', () => {
    const normalBow = {
      ...makeItem('Normal', 'weapon'),
      display_name: 'Normal Bow',
    } as unknown as ItemDefinition;
    const longBow = {
      ...makeItem('Long', 'weapon'),
      display_name: 'Long Bow',
    } as unknown as ItemDefinition;

    const { catalog: c3 } = createCatalog({
      'weapon/normal.json': normalBow,
      'weapon/long.json': longBow,
    });

    const itemLabel = (item: ItemDefinition) => {
      if (item.name === 'Normal') return 'Translated Normal Bow';
      return item.display_name ?? item.name;
    };

    // Queries for 'normal bow' (part of itemLabel) should match
    const r1 = filterAndRankPaletteItems({
      catalog: c3,
      bodyType: 'male',
      query: 'normal bow',
      shownTypeNames: ['weapon'],
      itemLabel,
    });
    expect(r1.map((x) => x.item.name)).toEqual(['Normal']);

    // Queries for 'normal' (the name/display_name/itemLabel) should match
    const r2 = filterAndRankPaletteItems({
      catalog: c3,
      bodyType: 'male',
      query: 'normal',
      shownTypeNames: ['weapon'],
      itemLabel,
    });
    expect(r2.map((x) => x.item.name)).toEqual(['Normal']);

    // Test sorting by label. 'Long Bow' vs 'Translated Normal Bow'.
    // Alphabetically, 'Long Bow' comes before 'Translated Normal Bow'.
    const r3 = filterAndRankPaletteItems({
      catalog: c3,
      bodyType: 'male',
      query: 'bow',
      shownTypeNames: ['weapon'],
      itemLabel,
    });
    expect(r3.map((x) => x.item.name)).toEqual(['Long', 'Normal']);
  });
});
