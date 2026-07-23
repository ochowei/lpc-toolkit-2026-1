import { describe, expect, it } from 'vitest';
import {
  extractLatestPreviewAnimation,
  previewErrorResult,
  previewResultForKey,
  previewRequestKey,
  type AssetPackPreviewResult,
} from '../src/hooks/use-asset-pack-preview';
import type { ComposedSheet } from '@lpc-toolkit/core';

const ready: AssetPackPreviewResult = {
  status: 'ready',
  progress: 1,
  sheet: { canvas: {} as ComposedSheet['canvas'], width: 1, height: 1, selections: { bodyType: 'male', items: {} }, credits: { entries: [], resolvedPaths: [], licenses: [] }, layers: [], animations: ['walk'] },
  animation: null,
  credits: { entries: [], resolvedPaths: [], licenses: [] },
  effectiveLicense: null,
  error: null,
};

describe('use asset-pack preview freshness', () => {
  it('returns pending with no image when the revision key changes', () => {
    const key4 = previewRequestKey({ revision: 4, bodyType: 'male', focusedAssetId: 'hair', importedDigest: null, sourceIdentity: 'a' });
    const key5 = previewRequestKey({ revision: 5, bodyType: 'male', focusedAssetId: 'hair', importedDigest: null, sourceIdentity: 'b' });
    const pending = previewResultForKey({ key: key4, result: ready }, key5);

    expect(pending.status).toBe('pending');
    expect(pending.sheet).toBeNull();
    expect(pending.animation).toBeNull();
    expect(pending.credits).toBeNull();
  });

  it('discards a late error/result and clears prior output for the current failed revision', () => {
    const key4 = previewRequestKey({ revision: 4, bodyType: 'male', focusedAssetId: 'hair', importedDigest: null, sourceIdentity: 'a' });
    const key5 = previewRequestKey({ revision: 5, bodyType: 'male', focusedAssetId: 'hair', importedDigest: null, sourceIdentity: 'b' });
    const late = previewResultForKey({ key: key4, result: ready }, key5);
    const failed = previewErrorResult(new Error('revision 5 failed'));

    expect(late.sheet).toBeNull();
    expect(failed.status).toBe('error');
    expect(failed.sheet).toBeNull();
    expect(failed.animation).toBeNull();
    expect(failed.credits).toBeNull();
  });

  it('keeps composition identity stable when only animation or direction changes', () => {
    const first = previewRequestKey({ revision: 4, bodyType: 'male', focusedAssetId: 'hair', importedDigest: 'same', sourceIdentity: 'bytes' });
    const second = previewRequestKey({ revision: 4, bodyType: 'male', focusedAssetId: 'hair', importedDigest: 'same', sourceIdentity: 'bytes' });
    expect(second).toBe(first);
  });

  it('extracts the latest animation requested while composition is pending', () => {
    const canvas = {
      width: 1,
      height: 1,
      getContext: () => ({
        drawImage: () => undefined,
      }),
    } as never;
    const sheet = {
      canvas,
      width: 1,
      height: 1,
      selections: { bodyType: 'male', items: {} },
      credits: { entries: [], resolvedPaths: [], licenses: [] },
      layers: [],
      animations: ['walk', 'slash'],
    } as const;
    const adapter = {
      createCanvas: () => canvas,
      loadImage: async () => ({ width: 1, height: 1 }),
    };
    const latestAnimation = { current: 'slash' };

    expect(extractLatestPreviewAnimation(sheet, latestAnimation, adapter).animation)
      .toBe('slash');
  });
});
