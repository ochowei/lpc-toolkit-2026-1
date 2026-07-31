import { describe, expect, it } from 'vitest';
import { serializeHash } from '@lpc-toolkit/core';
import {
  bootstrapStateFromHash,
  computeHashChangeAction,
  computeHashWrite,
  effectiveHash,
  reducePendingHashChange,
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

  it('restores a real multi-recolor sub-selection from the URL hash', () => {
    const result = bootstrapStateFromHash({
      rawHash: 'sex=male&hair=Long_tied_black&hair_tie=Long_tied_red',
      catalog,
      palettes,
      defaults,
    });

    expect(result.warnings).toEqual([]);
    expect(result.state.selections.hair).toMatchObject({
      typeName: 'hair',
      name: 'Long tied',
      recolor: 'black',
    });
    expect(result.state.selections.hair_tie).toEqual({
      typeName: 'hair_tie',
      name: 'Long tied',
      recolor: 'red',
    });
  });

  it('restores a v2 multi-recolor value inside its owning asset', () => {
    const result = bootstrapStateFromHash({
      rawHash:
        'v=2&sex=male&hair=Long_tied_black&color.hair.hair_tie=red',
      catalog,
      palettes,
      defaults,
    });

    expect(result.warnings).toEqual([]);
    expect(result.state.selections.hair).toMatchObject({
      typeName: 'hair',
      name: 'Long tied',
      recolor: 'black',
      channelRecolors: { hair_tie: 'red' },
    });
    expect(result.state.selections.hair_tie).toBeUndefined();
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
    expect(result).toMatch(/^v=2&/);
    expect(result).toContain('body=');
  });
});

describe('computeHashChangeAction', () => {
  it('returns shouldApply=false when rawHash matches current state serialize', () => {
    const result = computeHashChangeAction({
      rawHash: defaultsHash,
      currentState: defaults,
      defaults,
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
      defaults,
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
      defaults,
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
      defaults,
      catalog,
      palettes,
    });
    expect(result.shouldApply).toBe(true);
    expect(result.selections).not.toBe(null);
    expect(Object.keys(result.selections?.items ?? {}).length).toBe(0);
    expect(result.warnings.length).toBe(1);
  });

  it('treats empty hash as the complete default selections', () => {
    const modified = {
      ...defaults,
      selections: {
        ...defaults.selections,
        body: { typeName: 'body', name: 'Body Color', recolor: 'dark' },
      },
    };
    const result = computeHashChangeAction({
      rawHash: '',
      currentState: modified,
      defaults,
      catalog,
      palettes,
    });
    expect(result).toEqual({
      shouldApply: true,
      selections: toSelections(defaults),
      warnings: [],
    });

    const incoming = {
      selections: result.selections!,
      canonicalHash: '',
    };
    expect(
      reducePendingHashChange({
        dispatchResult: false,
        incoming,
      }),
    ).toEqual({
      pending: incoming,
      canonicalHashToNormalize: null,
    });
  });
});

describe('reducePendingHashChange', () => {
  const incoming = {
    selections: {
      bodyType: 'female',
      items: {
        body: { typeName: 'body', name: 'Body Color', recolor: 'dark' },
      },
    },
    canonicalHash: 'sex=female&body=Body_color_dark',
  };

  it('defers the incoming selection without normalizing the reached history entry', () => {
    expect(
      reducePendingHashChange({
        dispatchResult: false,
        incoming,
      }),
    ).toEqual({
      pending: incoming,
      canonicalHashToNormalize: null,
    });
  });

  it.each([true, undefined])(
    'applies and normalizes the pending selection when dispatch returns %s',
    (dispatchResult) => {
      expect(
        reducePendingHashChange({
          dispatchResult,
          incoming,
        }),
      ).toEqual({
        pending: null,
        canonicalHashToNormalize: incoming.canonicalHash,
      });
    },
  );
});
