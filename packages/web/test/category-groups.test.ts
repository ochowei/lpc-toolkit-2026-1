import { describe, expect, it } from 'vitest';
import { CATEGORY_GROUPS, groupForType, type GroupId } from '../src/slice/category-groups';

describe('CATEGORY_GROUPS', () => {
  it('has the seven canonical super-groups in display order', () => {
    const ids = CATEGORY_GROUPS.map((g) => g.id);
    expect(ids).toEqual([
      'body', 'face', 'clothing', 'accessories', 'weapons', 'fx', 'fantasy',
    ]);
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

  it('returns clothing for legs / clothes / jacket / shoes_toe / etc.', () => {
    expect(groupForType('legs')).toBe('clothing');
    expect(groupForType('clothes')).toBe('clothing');
    expect(groupForType('jacket')).toBe('clothing');
    expect(groupForType('shoes_toe')).toBe('clothing');
    expect(groupForType('hat_trim')).toBe('clothing');
  });

  it('returns fx for wound / shadow / prosthesis / wheelchair', () => {
    expect(groupForType('wound_arm')).toBe('fx');
    expect(groupForType('shadow')).toBe('fx');
    expect(groupForType('wrinkles')).toBe('fx');
    expect(groupForType('prosthesis_hand')).toBe('fx');
    expect(groupForType('wheelchair')).toBe('fx');
  });

  it('returns fantasy for wings / horns / tail / fins / furry_ears', () => {
    expect(groupForType('wings')).toBe('fantasy');
    expect(groupForType('horns')).toBe('fantasy');
    expect(groupForType('tail')).toBe('fantasy');
    expect(groupForType('fins')).toBe('fantasy');
    expect(groupForType('furry_ears')).toBe('fantasy');
  });

  it('returns null for the four removed dead keys', () => {
    expect(groupForType('facial' as never)).toBeNull();
    expect(groupForType('torso' as never)).toBeNull();
    expect(groupForType('hands' as never)).toBeNull();
    expect(groupForType('feet' as never)).toBeNull();
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
