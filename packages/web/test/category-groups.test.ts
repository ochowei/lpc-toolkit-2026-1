import { describe, expect, it } from 'vitest';
import { CATEGORY_GROUPS, groupForType, type GroupId } from '../src/slice/category-groups';

describe('CATEGORY_GROUPS', () => {
  it('has the five canonical super-groups', () => {
    const ids = CATEGORY_GROUPS.map((g) => g.id);
    expect(ids).toEqual(['body', 'face', 'clothing', 'accessories', 'weapons']);
  });

  it('every group has a non-empty typeNames list', () => {
    for (const g of CATEGORY_GROUPS) {
      expect(g.typeNames.length).toBeGreaterThan(0);
    }
  });

  it('no TypeName appears in more than one group', () => {
    const seen = new Map<string, GroupId>();
    for (const g of CATEGORY_GROUPS) {
      for (const tn of g.typeNames) {
        const prev = seen.get(tn);
        expect(prev, `${tn} appears in ${prev} and ${g.id}`).toBeUndefined();
        seen.set(tn, g.id);
      }
    }
  });
});

describe('groupForType', () => {
  it('returns body for body-part type names', () => {
    expect(groupForType('body')).toBe('body');
    expect(groupForType('head')).toBe('body');
    expect(groupForType('eyes')).toBe('body');
  });

  it('returns face for hair / facial / expression', () => {
    expect(groupForType('hair')).toBe('face');
    expect(groupForType('beard')).toBe('face');
    expect(groupForType('expression')).toBe('face');
  });

  it('returns clothing for torso/legs/feet/etc.', () => {
    expect(groupForType('torso')).toBe('clothing');
    expect(groupForType('legs')).toBe('clothing');
    expect(groupForType('feet')).toBe('clothing');
    expect(groupForType('clothes')).toBe('clothing');
  });

  it('returns accessories for cape/belt/etc.', () => {
    expect(groupForType('cape')).toBe('accessories');
    expect(groupForType('belt')).toBe('accessories');
    expect(groupForType('backpack')).toBe('accessories');
  });

  it('returns weapons for weapon/shield/ammo', () => {
    expect(groupForType('weapon')).toBe('weapons');
    expect(groupForType('shield')).toBe('weapons');
    expect(groupForType('ammo')).toBe('weapons');
  });

  it('returns null for unrecognized TypeName', () => {
    expect(groupForType('completely_made_up_type_xyz')).toBeNull();
  });
});
