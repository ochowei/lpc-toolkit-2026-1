import { describe, expect, it } from 'vitest';
import type {
  Catalog,
  ItemDefinition,
  LicenseGroup,
  TypeName,
} from '@lpc-toolkit/core';
import {
  ALL_LICENSE_GROUPS,
  incompatibleTypeNamesFor,
  itemMatchesLicenseFilter,
  type LicenseFilter,
} from '../src/slice/license-filter';
import type { SliceState } from '../src/slice/selection';

function item(
  name: string,
  licenses: ItemDefinition['credits'][number]['licenses'],
  typeName: TypeName = 'hair',
): ItemDefinition {
  return {
    name,
    type_name: typeName,
    animations: ['walk'],
    credits: [
      { file: `${typeName}/${name}`, notes: '', authors: ['Artist'], licenses, urls: [] },
    ],
    layer_1: { zPos: 10, male: `${typeName}/${name}/` },
  } as ItemDefinition;
}

function itemNoCredits(name: string): ItemDefinition {
  return {
    name,
    type_name: 'hair',
    animations: ['walk'],
    credits: [],
    layer_1: { zPos: 10, male: `hair/${name}/` },
  } as ItemDefinition;
}

function itemMultiCredit(name: string): ItemDefinition {
  return {
    name,
    type_name: 'hair',
    animations: ['walk'],
    credits: [
      { file: 'a', notes: '', authors: ['A'], licenses: ['GPL 3.0'], urls: [] },
      { file: 'b', notes: '', authors: ['B'], licenses: ['CC0'], urls: [] },
    ],
    layer_1: { zPos: 10, male: `hair/${name}/` },
  } as ItemDefinition;
}

const ALL: LicenseFilter = ALL_LICENSE_GROUPS;
const ONLY_CC0: LicenseFilter = new Set<LicenseGroup>(['CC0']);
const ONLY_GPL: LicenseFilter = new Set<LicenseGroup>(['GPL']);
const ONLY_CC_BY: LicenseFilter = new Set<LicenseGroup>(['CC-BY']);
const NONE: LicenseFilter = new Set<LicenseGroup>();

describe('itemMatchesLicenseFilter', () => {
  it('matches when all 5 groups enabled and item has any license', () => {
    expect(itemMatchesLicenseFilter(item('a', ['CC0']), ALL)).toBe(true);
  });

  it('matches when item license group is in enabled set', () => {
    expect(itemMatchesLicenseFilter(item('a', ['GPL 3.0']), ONLY_GPL)).toBe(true);
  });

  it('rejects when item license group is not in enabled set', () => {
    expect(itemMatchesLicenseFilter(item('a', ['GPL 3.0']), ONLY_CC0)).toBe(false);
  });

  it('rejects everything when no group is enabled', () => {
    expect(itemMatchesLicenseFilter(item('a', ['CC0']), NONE)).toBe(false);
  });

  it('treats empty credits as compatible (assume compatible)', () => {
    expect(itemMatchesLicenseFilter(itemNoCredits('blank'), ONLY_CC0)).toBe(true);
  });

  it('OR-matches across multiple licenses on one credit', () => {
    expect(
      itemMatchesLicenseFilter(item('a', ['GPL 2.0', 'CC-BY 4.0']), ONLY_CC_BY),
    ).toBe(true);
  });

  it('maps versioned license to its group via LICENSE_GROUP_OF', () => {
    expect(itemMatchesLicenseFilter(item('a', ['CC-BY 3.0']), ONLY_CC_BY)).toBe(true);
  });

  it('matches if any one credit (of many) has matching license', () => {
    expect(itemMatchesLicenseFilter(itemMultiCredit('mix'), ONLY_CC0)).toBe(true);
  });
});

describe('licenseExceedsFilter is removed from the slice module', () => {
  it('does not exist as an export', async () => {
    const mod = await import('../src/slice/license-filter');
    expect('licenseExceedsFilter' in mod).toBe(false);
  });
});

describe('incompatibleTypeNamesFor', () => {
  function makeCatalog(items: ItemDefinition[]): Catalog {
    const byTypeName = new Map<TypeName, ItemDefinition[]>();
    for (const it of items) {
      const list = byTypeName.get(it.type_name) ?? [];
      list.push(it);
      byTypeName.set(it.type_name, list);
    }
    return { byTypeName } as unknown as Catalog;
  }

  function makeState(
    selections: Record<TypeName, { name: string; typeName: TypeName }>,
  ): SliceState {
    return {
      bodyType: 'male',
      selections,
      anim: 'walk',
      dir: 'down',
      playing: false,
      zoom: 4,
    } as SliceState;
  }

  it('returns empty when all selections are compatible', () => {
    const cc0Item = item('cc0', ['CC0']);
    const catalog = makeCatalog([cc0Item]);
    const state = makeState({
      hair: { name: 'cc0', typeName: 'hair' },
    });
    expect(incompatibleTypeNamesFor(state, catalog, ALL)).toEqual([]);
  });

  it('returns type names of selections whose item is not in enabled groups', () => {
    const gplItem = item('gpl', ['GPL 3.0']);
    const cc0Item = item('cc0', ['CC0']);
    const catalog = makeCatalog([gplItem, cc0Item]);
    const state = makeState({
      hair: { name: 'gpl', typeName: 'hair' },
    });
    expect(incompatibleTypeNamesFor(state, catalog, ONLY_CC0)).toEqual(['hair']);
  });

  it('skips unknown selections (item not found in catalog)', () => {
    const catalog = makeCatalog([item('cc0', ['CC0'])]);
    const state = makeState({
      hair: { name: 'missing', typeName: 'hair' },
    });
    expect(incompatibleTypeNamesFor(state, catalog, ONLY_CC0)).toEqual([]);
  });

  it('collects all incompatible type names when multiple selections fail', () => {
    const gplHair = item('gpl_hair', ['GPL 3.0']);
    const gplClothes = item('gpl_clothes', ['GPL 3.0'], 'clothes');
    const catalog = makeCatalog([gplHair, gplClothes]);
    const state = makeState({
      hair: { name: 'gpl_hair', typeName: 'hair' },
      clothes: { name: 'gpl_clothes', typeName: 'clothes' },
    });
    const result = incompatibleTypeNamesFor(state, catalog, ONLY_CC0);
    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining(['hair', 'clothes']));
  });
});
