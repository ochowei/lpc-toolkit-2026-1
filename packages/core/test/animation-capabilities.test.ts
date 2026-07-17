import { describe, expect, it } from 'vitest';
import {
  animationsSupportFolder,
  auditAnimationFolder,
  compatibleAnimationSource,
  itemAnimationCapabilities,
} from '../src/animation-capabilities.js';
import type { ItemDefinition } from '../src/types.js';

const item = (animations: unknown): ItemDefinition => ({
  name: 'Fixture',
  type_name: 'fixture',
  animations,
  credits: [],
  layer_1: { zPos: 1, male: 'fixture/' },
} as ItemDefinition);

describe('itemAnimationCapabilities', () => {
  it('derives a registered custom base without mutating native names', () => {
    expect(itemAnimationCapabilities(item(['wheelchair']))).toMatchObject({
      native: ['wheelchair'],
      compatible: ['sit'],
    });
    expect(compatibleAnimationSource(item(['wheelchair']), 'sit')).toBe('wheelchair');
  });

  it('defaults malformed metadata but preserves an explicit empty list', () => {
    expect(itemAnimationCapabilities(item('walk')).native).toContain('walk');
    expect(itemAnimationCapabilities(item([])).native).toEqual([]);
  });

  it('maps aliases and virtual audit sources to physical folders', () => {
    expect(auditAnimationFolder('combat')).toBe('combat_idle');
    expect(auditAnimationFolder('1h_backslash')).toBe('backslash');
    expect(auditAnimationFolder('1h_halfslash')).toBe('halfslash');
    expect(auditAnimationFolder('watering')).toBe('thrust');
  });

  it('shares the existing folder support gates', () => {
    expect(animationsSupportFolder(['combat'], 'combat_idle')).toBe(true);
    expect(animationsSupportFolder(['1h_slash'], 'backslash')).toBe(true);
    expect(animationsSupportFolder(['walk'], 'combat_idle')).toBe(false);
  });
});
