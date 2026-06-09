import { describe, expect, it } from 'vitest';
import { serializeHash } from '@lpc-toolkit/core';
import {
  bootstrapStateFromHash,
  computeHashChangeAction,
  computeHashWrite,
  effectiveHash,
  hashAfterSelectionDispatch,
} from '../src/lib/url-hash-sync';
import { loadCatalogFromUpstream } from '../src/catalog/load-catalog';
import { loadPalettesFromUpstream } from '../src/catalog/load-palettes';
import { pickInitialSelections, toSelections } from '../src/slice/selection';

const catalog = loadCatalogFromUpstream();
const palettes = loadPalettesFromUpstream();
const defaults = pickInitialSelections(catalog).state;
const defaultsHash = serializeHash(toSelections(defaults));

describe('bootstrapStateFromHash', () => {
  it('returns defaults when rawHash is empty', () => {
    const result = bootstrapStateFromHash({
      rawHash: '',
      catalog,
      palettes,
      defaults,
    });
    expect(result.state).toBe(defaults);
    expect(result.warnings).toEqual([]);
  });

  it('replaces selections + bodyType when rawHash has valid items', () => {
    const result = bootstrapStateFromHash({
      rawHash: 'sex=female&body=Body_color_light',
      catalog,
      palettes,
      defaults,
    });
    expect(result.state.bodyType).toBe('female');
    expect(result.state.selections.body?.name).toBe('Body Color');
    // anim/dir/zoom/playing are preserved from defaults:
    expect(result.state.anim).toBe(defaults.anim);
    expect(result.state.dir).toBe(defaults.dir);
    expect(result.state.zoom).toBe(defaults.zoom);
    expect(result.state.playing).toBe(defaults.playing);
    expect(result.warnings).toEqual([]);
  });

  it('returns defaults when every hash key is unknown', () => {
    const result = bootstrapStateFromHash({
      rawHash: 'fictional_type=foo&another_fake=bar',
      catalog,
      palettes,
      defaults,
    });
    expect(result.state).toBe(defaults);
    expect(result.warnings.length).toBe(2);
  });

  it('keeps known items and reports unknowns when partially valid', () => {
    const result = bootstrapStateFromHash({
      rawHash: 'sex=male&body=Body_color_light&fictional_xyz=foo',
      catalog,
      palettes,
      defaults,
    });
    expect(result.state.bodyType).toBe('male');
    expect(result.state.selections.body).toBeDefined();
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]?.key).toBe('fictional_xyz');
  });
});

describe('computeHashWrite', () => {
  it('returns null when currentHash equals nextHash', () => {
    expect(
      computeHashWrite({
        currentHash: 'sex=male&body=Body_color_light',
        nextHash: 'sex=male&body=Body_color_light',
        isFirstWrite: false,
      }),
    ).toBe(null);
  });

  it('returns "replace" on first write when hashes differ', () => {
    expect(
      computeHashWrite({
        currentHash: '',
        nextHash: 'sex=male&body=Body_color_light',
        isFirstWrite: true,
      }),
    ).toBe('replace');
  });

  it('returns "push" on subsequent writes when hashes differ', () => {
    expect(
      computeHashWrite({
        currentHash: 'sex=male&body=Body_color_light',
        nextHash: 'sex=male&body=Body_color_dark',
        isFirstWrite: false,
      }),
    ).toBe('push');
  });

  it('still returns null on first write when hashes already match', () => {
    expect(
      computeHashWrite({
        currentHash: 'sex=male&body=Body_color_light',
        nextHash: 'sex=male&body=Body_color_light',
        isFirstWrite: true,
      }),
    ).toBe(null);
  });
});

describe('effectiveHash', () => {
  it('returns empty string when state matches defaults', () => {
    expect(effectiveHash(defaults, defaultsHash)).toBe('');
  });

  it('returns serialized hash when state differs from defaults', () => {
    const modified = {
      ...defaults,
      selections: {
        ...defaults.selections,
        body: { typeName: 'body', name: 'Body Color', recolor: 'dark' },
      },
    };
    const result = effectiveHash(modified, defaultsHash);
    expect(result).not.toBe('');
    expect(result).toContain('body=');
  });
});

describe('computeHashChangeAction', () => {
  it('returns shouldApply=false when rawHash matches current state serialize', () => {
    const result = computeHashChangeAction({
      rawHash: defaultsHash,
      currentState: defaults,
      catalog,
      palettes,
    });
    expect(result.shouldApply).toBe(false);
    expect(result.selections).toBe(null);
  });

  it('returns parsed selections + warnings when rawHash differs', () => {
    const result = computeHashChangeAction({
      rawHash: 'sex=female&body=Body_color_light',
      currentState: defaults,
      catalog,
      palettes,
    });
    expect(result.shouldApply).toBe(true);
    expect(result.selections?.bodyType).toBe('female');
    expect(result.warnings).toEqual([]);
  });

  it('surfaces warnings when rawHash has unknown entries and differs', () => {
    const result = computeHashChangeAction({
      rawHash: 'sex=female&fictional_xyz=foo',
      currentState: defaults,
      catalog,
      palettes,
    });
    expect(result.shouldApply).toBe(true);
    expect(result.warnings.length).toBe(1);
  });

  it('returns selections with empty items when all hash keys are unknown', () => {
    const result = computeHashChangeAction({
      rawHash: 'fictional_xyz=foo',
      currentState: defaults,
      catalog,
      palettes,
    });
    expect(result.shouldApply).toBe(true);
    expect(result.selections).not.toBe(null);
    expect(Object.keys(result.selections?.items ?? {}).length).toBe(0);
    expect(result.warnings.length).toBe(1);
  });
});

describe('hashAfterSelectionDispatch', () => {
  it('restores the current canonical hash when dispatch rejects the incoming selection', () => {
    expect(
      hashAfterSelectionDispatch({
        dispatchResult: false,
        currentCanonicalHash: 'sex=male&body=Body_color_light',
        incomingCanonicalHash: 'sex=female&body=Body_color_dark',
      }),
    ).toBe('sex=male&body=Body_color_light');
  });

  it.each([true, undefined])(
    'keeps the incoming canonical hash when dispatch returns %s',
    (dispatchResult) => {
      expect(
        hashAfterSelectionDispatch({
          dispatchResult,
          currentCanonicalHash: 'sex=male&body=Body_color_light',
          incomingCanonicalHash: 'sex=female&body=Body_color_dark',
        }),
      ).toBe('sex=female&body=Body_color_dark');
    },
  );
});
