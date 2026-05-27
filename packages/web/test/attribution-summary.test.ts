import { describe, expect, it } from 'vitest';
import type {
  Catalog,
  ItemDefinition,
  TypeName,
} from '@lpc-toolkit/core';
import { ALL_LICENSE_GROUPS, type LicenseFilter } from '../src/slice/license-filter';
import type { AnimationFilter } from '../src/slice/animation-filter';
import type { SliceState } from '../src/slice/selection';
import { summarizeAttribution } from '../src/components/layer-stack/popovers/attribution-summary';

function item(
  name: string,
  licenses: ItemDefinition['credits'][number]['licenses'],
  typeName: TypeName = 'hair',
  animations: string[] = ['walk'],
): ItemDefinition {
  return {
    name,
    type_name: typeName,
    animations,
    credits: [
      { file: `${typeName}/${name}`, notes: '', authors: ['Artist'], licenses, urls: [] },
    ],
    layer_1: { zPos: 10, male: `${typeName}/${name}/` },
  } as ItemDefinition;
}

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

const ALL_ANIMS: AnimationFilter = new Set(['walk']);

describe('summarizeAttribution', () => {
  it('returns sourceCount=0 and incompatibleAny=false with no selections', () => {
    const catalog = makeCatalog([item('cc0', ['CC0'])]);
    const state = makeState({});
    const result = summarizeAttribution(catalog, state, ALL_LICENSE_GROUPS, ALL_ANIMS);
    expect(result.sourceCount).toBe(0);
    expect(result.incompatibleAny).toBe(false);
  });

  it('counts unique (authors|license) buckets across selections', () => {
    const hair = item('hair_a', ['CC0'], 'hair');
    const clothes = item('clothes_a', ['CC0'], 'clothes');
    const catalog = makeCatalog([hair, clothes]);
    const state = makeState({
      hair: { name: 'hair_a', typeName: 'hair' },
      clothes: { name: 'clothes_a', typeName: 'clothes' },
    });
    // Both items have the same authors ('Artist') and effective license (CC0),
    // so they collapse into a single bucket.
    const result = summarizeAttribution(catalog, state, ALL_LICENSE_GROUPS, ALL_ANIMS);
    expect(result.sourceCount).toBe(1);
    expect(result.incompatibleAny).toBe(false);
  });

  it('counts separate buckets when authors differ', () => {
    const hair: ItemDefinition = {
      name: 'hair_a',
      type_name: 'hair',
      animations: ['walk'],
      credits: [
        { file: 'hair/hair_a', notes: '', authors: ['Alice'], licenses: ['CC0'], urls: [] },
      ],
      layer_1: { zPos: 10, male: 'hair/hair_a/' },
    } as ItemDefinition;
    const clothes: ItemDefinition = {
      name: 'clothes_a',
      type_name: 'clothes',
      animations: ['walk'],
      credits: [
        { file: 'clothes/clothes_a', notes: '', authors: ['Bob'], licenses: ['CC0'], urls: [] },
      ],
      layer_1: { zPos: 10, male: 'clothes/clothes_a/' },
    } as ItemDefinition;
    const catalog = makeCatalog([hair, clothes]);
    const state = makeState({
      hair: { name: 'hair_a', typeName: 'hair' },
      clothes: { name: 'clothes_a', typeName: 'clothes' },
    });
    const result = summarizeAttribution(catalog, state, ALL_LICENSE_GROUPS, ALL_ANIMS);
    expect(result.sourceCount).toBe(2);
    expect(result.incompatibleAny).toBe(false);
  });

  it('sets incompatibleAny=true when a selected item fails the license filter', () => {
    const gplItem = item('gpl_hair', ['GPL 3.0'], 'hair');
    const catalog = makeCatalog([gplItem]);
    const state = makeState({ hair: { name: 'gpl_hair', typeName: 'hair' } });
    const onlyCC0: LicenseFilter = new Set(['CC0']);
    const result = summarizeAttribution(catalog, state, onlyCC0, ALL_ANIMS);
    expect(result.incompatibleAny).toBe(true);
  });

  it('sets incompatibleAny=true when a selected item lacks an enabled animation', () => {
    const spellcastOnly = item('spellcast_hair', ['CC0'], 'hair', ['spellcast']);
    const catalog = makeCatalog([spellcastOnly]);
    const state = makeState({ hair: { name: 'spellcast_hair', typeName: 'hair' } });
    // Animation filter only allows 'walk'; item only supports 'spellcast'
    const walkOnly: AnimationFilter = new Set(['walk']);
    const result = summarizeAttribution(catalog, state, ALL_LICENSE_GROUPS, walkOnly);
    expect(result.incompatibleAny).toBe(true);
  });

  it('skips items with no licenses when counting buckets', () => {
    const noLicenseItem: ItemDefinition = {
      name: 'no_license',
      type_name: 'hair',
      animations: ['walk'],
      credits: [],
      layer_1: { zPos: 10, male: 'hair/no_license/' },
    } as ItemDefinition;
    const catalog = makeCatalog([noLicenseItem]);
    const state = makeState({ hair: { name: 'no_license', typeName: 'hair' } });
    const result = summarizeAttribution(catalog, state, ALL_LICENSE_GROUPS, ALL_ANIMS);
    expect(result.sourceCount).toBe(0);
    expect(result.incompatibleAny).toBe(false);
  });
});
