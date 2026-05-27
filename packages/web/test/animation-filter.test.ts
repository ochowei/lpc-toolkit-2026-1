import { describe, expect, it } from 'vitest';
import type {
  Catalog,
  ItemDefinition,
  AnimationName,
  TypeName,
} from '@lpc-toolkit/core';
import {
  incompatibleAnimationTypeNamesFor,
  itemMatchesAnimationFilter,
  type AnimationFilter,
} from '../src/slice/animation-filter';
import type { SliceState } from '../src/slice/selection';

function item(
  name: string,
  animations: readonly AnimationName[],
  typeName: TypeName = 'hair',
): ItemDefinition {
  return {
    name,
    type_name: typeName,
    animations,
    credits: [
      { file: `${typeName}/${name}`, notes: '', authors: ['Artist'], licenses: ['CC0'], urls: [] },
    ],
    layer_1: { zPos: 10, male: `${typeName}/${name}/` },
  } as ItemDefinition;
}

const NONE: AnimationFilter = new Set<AnimationName>();
const ONLY_WALK: AnimationFilter = new Set<AnimationName>(['walk']);
const ONLY_SIT: AnimationFilter = new Set<AnimationName>(['sit']);
const ONLY_SLASH: AnimationFilter = new Set<AnimationName>(['slash']);

describe('itemMatchesAnimationFilter', () => {
  it('matches everything when no animation is enabled (0 = All)', () => {
    expect(itemMatchesAnimationFilter(item('a', ['walk']), NONE)).toBe(true);
  });

  it('treats empty animations as compatible (assume compatible)', () => {
    expect(itemMatchesAnimationFilter(item('blank', []), ONLY_WALK)).toBe(true);
  });

  it('matches when item.animations contains a directly-enabled anim', () => {
    expect(
      itemMatchesAnimationFilter(item('a', ['walk', 'slash']), ONLY_WALK),
    ).toBe(true);
  });

  it('rejects when item.animations has none of the enabled anims', () => {
    expect(itemMatchesAnimationFilter(item('a', ['walk']), ONLY_SLASH)).toBe(false);
  });

  it('matches via custom anim base resolution (wheelchair -> sit)', () => {
    expect(
      itemMatchesAnimationFilter(item('wc', ['wheelchair']), ONLY_SIT),
    ).toBe(true);
  });

  it('rejects when custom anim base is not in enabled set (wheelchair -> sit, walk only)', () => {
    expect(
      itemMatchesAnimationFilter(item('wc', ['wheelchair']), ONLY_WALK),
    ).toBe(false);
  });

  it('matches when mix of standard + custom anim resolves to an enabled base', () => {
    expect(
      itemMatchesAnimationFilter(item('mix', ['walk', 'wheelchair']), ONLY_SIT),
    ).toBe(true);
  });

  it('does not throw on unknown custom anim names (silently skip)', () => {
    expect(
      itemMatchesAnimationFilter(item('weird', ['nonexistent_custom']), ONLY_SIT),
    ).toBe(false);
  });
});

describe('incompatibleAnimationTypeNamesFor', () => {
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

  it('returns empty when filter is empty (0 enabled = All, all compatible)', () => {
    const walkItem = item('a', ['walk']);
    const catalog = makeCatalog([walkItem]);
    const state = makeState({ hair: { name: 'a', typeName: 'hair' } });
    expect(incompatibleAnimationTypeNamesFor(state, catalog, NONE)).toEqual([]);
  });

  it('returns type names whose item lacks any enabled anim', () => {
    const walkOnly = item('walk_only', ['walk']);
    const catalog = makeCatalog([walkOnly]);
    const state = makeState({ hair: { name: 'walk_only', typeName: 'hair' } });
    expect(
      incompatibleAnimationTypeNamesFor(state, catalog, ONLY_SLASH),
    ).toEqual(['hair']);
  });

  it('skips selections whose item is not in catalog', () => {
    const catalog = makeCatalog([item('present', ['walk'])]);
    const state = makeState({ hair: { name: 'missing', typeName: 'hair' } });
    expect(
      incompatibleAnimationTypeNamesFor(state, catalog, ONLY_SLASH),
    ).toEqual([]);
  });

  it('collects all incompatible type names when multiple selections fail', () => {
    const walkHair = item('walk_hair', ['walk'], 'hair');
    const walkClothes = item('walk_clothes', ['walk'], 'clothes');
    const catalog = makeCatalog([walkHair, walkClothes]);
    const state = makeState({
      hair: { name: 'walk_hair', typeName: 'hair' },
      clothes: { name: 'walk_clothes', typeName: 'clothes' },
    });
    const result = incompatibleAnimationTypeNamesFor(state, catalog, ONLY_SLASH);
    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining(['hair', 'clothes']));
  });
});
