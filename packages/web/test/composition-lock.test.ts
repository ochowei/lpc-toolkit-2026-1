import { describe, expect, it } from 'vitest';
import {
  formatCompositionProgress,
  isCompositionChangingAction,
  isCompositionLocked,
} from '../src/lib/composition-lock';
import type { SliceAction, SliceState } from '../src/slice/selection';

const initialState: SliceState = {
  bodyType: 'male',
  selections: {},
  anim: 'walk',
  dir: 'down',
  playing: true,
  zoom: 4,
};

describe('isCompositionChangingAction', () => {
  it.each<SliceAction>([
    { type: 'set_body_type', bodyType: 'female' },
    { type: 'pick', typeName: 'hair', name: 'Hair' },
    { type: 'clear', typeName: 'hair' },
    {
      type: 'apply_selections',
      selections: { bodyType: 'male', items: {} },
    },
    {
      type: 'reset',
      scopes: { outfit: true, view: false },
      init: initialState,
    },
  ])('returns true for $type composition changes', (action) => {
    expect(isCompositionChangingAction(action)).toBe(true);
  });

  it.each<SliceAction>([
    { type: 'set_anim', anim: 'walk' },
    { type: 'set_dir', dir: 'down' },
    { type: 'toggle_play' },
    { type: 'set_zoom', zoom: 4 },
    {
      type: 'reset',
      scopes: { outfit: false, view: true },
      init: initialState,
    },
  ])('returns false for $type view changes', (action) => {
    expect(isCompositionChangingAction(action)).toBe(false);
  });
});

describe('formatCompositionProgress', () => {
  it.each([
    [-1, 0],
    [0, 0],
    [0.456, 46],
    [1, 100],
    [2, 100],
  ])('formats %s as %s percent', (progress, expected) => {
    expect(formatCompositionProgress(progress)).toBe(expected);
  });
});

describe('isCompositionLocked', () => {
  it.each([
    ['idle', false],
    ['loading', true],
    ['ready', false],
    ['error', false],
  ] as const)('returns %s for status %s', (status, expected) => {
    expect(isCompositionLocked(status)).toBe(expected);
  });
});
