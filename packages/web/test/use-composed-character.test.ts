import { describe, expect, it } from 'vitest';
import type { ComposedAnimation, ComposedSheet } from '@lpc-toolkit/core';
import {
  compositionErrorResult,
  compositionInputKey,
  resultForCompositionKey,
  type ComposedResult,
} from '../src/hooks/use-composed-character';
import type { SliceState } from '../src/slice/selection';

const state: SliceState = {
  bodyType: 'male',
  selections: {
    body: { typeName: 'body', name: 'Body Color', recolor: 'light' },
  },
  anim: 'walk',
  dir: 'down',
  playing: true,
  zoom: 4,
};

const settled: ComposedResult = {
  status: 'ready',
  progress: 1,
  sheet: {} as ComposedSheet,
  animation: {} as ComposedAnimation,
  error: null,
};

describe('compositionErrorResult', () => {
  it('clears the stale sheet and animation for a hard composition error', () => {
    expect(compositionErrorResult(new Error('compose failed'))).toEqual({
      status: 'error',
      progress: 1,
      sheet: null,
      animation: null,
      error: 'compose failed',
    });
  });
});

describe('resultForCompositionKey', () => {
  it('exposes loading immediately when the current input key has no stored result', () => {
    expect(resultForCompositionKey({ key: null, result: settled }, 'current')).toEqual({
      ...settled,
      status: 'loading',
      progress: 0,
      error: null,
    });
  });

  it('returns the settled result when it belongs to the current input key', () => {
    expect(resultForCompositionKey({ key: 'current', result: settled }, 'current')).toBe(
      settled,
    );
  });
});

describe('compositionInputKey', () => {
  it('ignores view-only state changes', () => {
    const changedView: SliceState = {
      ...state,
      anim: 'slash',
      dir: 'left',
      playing: false,
      zoom: 2,
    };
    expect(compositionInputKey(changedView, 0, null)).toBe(
      compositionInputKey(state, 0, null),
    );
  });

  it('changes for selections, reloads, and custom overlay identity or z-position', () => {
    const base = compositionInputKey(state, 0, null);
    const changedSelections = {
      ...state,
      selections: {
        ...state.selections,
        hair: { typeName: 'hair', name: 'Plain' },
      },
    };
    expect(compositionInputKey(changedSelections, 0, null)).not.toBe(base);
    expect(compositionInputKey(state, 1, null)).not.toBe(base);
    expect(
      compositionInputKey(state, 0, { objectUrl: 'blob:first', zPos: 10 }),
    ).not.toBe(base);
    expect(
      compositionInputKey(state, 0, { objectUrl: 'blob:first', zPos: 20 }),
    ).not.toBe(
      compositionInputKey(state, 0, { objectUrl: 'blob:first', zPos: 10 }),
    );
    expect(
      compositionInputKey(state, 0, { objectUrl: 'blob:second', zPos: 10 }),
    ).not.toBe(
      compositionInputKey(state, 0, { objectUrl: 'blob:first', zPos: 10 }),
    );
  });
});
