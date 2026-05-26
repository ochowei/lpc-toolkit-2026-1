import { describe, expect, it } from 'vitest';
import {
  nextActiveIndex,
  pickIndexForEnter,
} from '../src/components/layer-stack/sidebar-search-keyboard';

describe('nextActiveIndex', () => {
  it('moves from -1 to 0 on ArrowDown', () => {
    expect(nextActiveIndex(-1, 'ArrowDown', 5)).toBe(0);
  });

  it('clamps at the last index on ArrowDown', () => {
    expect(nextActiveIndex(4, 'ArrowDown', 5)).toBe(4);
  });

  it('moves from 0 to -1 on ArrowUp', () => {
    expect(nextActiveIndex(0, 'ArrowUp', 5)).toBe(-1);
  });

  it('clamps at -1 on ArrowUp from -1', () => {
    expect(nextActiveIndex(-1, 'ArrowUp', 5)).toBe(-1);
  });

  it('returns -1 when results are empty', () => {
    expect(nextActiveIndex(0, 'ArrowDown', 0)).toBe(-1);
  });
});

describe('pickIndexForEnter', () => {
  it('returns the active index when active >= 0', () => {
    expect(pickIndexForEnter(3, 5)).toBe(3);
  });

  it('returns 0 (first row) when active is -1 but results exist', () => {
    expect(pickIndexForEnter(-1, 5)).toBe(0);
  });

  it('returns null when results are empty (active = -1)', () => {
    expect(pickIndexForEnter(-1, 0)).toBeNull();
  });

  it('returns null when results are empty (active = 0)', () => {
    expect(pickIndexForEnter(0, 0)).toBeNull();
  });
});
