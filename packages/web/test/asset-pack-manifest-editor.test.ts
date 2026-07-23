import { describe, expect, it } from 'vitest';
import type { AssetPackAcknowledgement, AssetPackSource } from '@lpc-toolkit/core';
import {
  acknowledgeCurrentWarning,
  acknowledgeWarning,
  applyAssetPackAdvancedProjection,
  projectAssetPackAdvanced,
  projectAssetPackCredits,
  projectAssetPackOverview,
  serializeAssetPackManifest,
} from '../src/lib/asset-pack-manifest-editor';

const source: AssetPackSource = {
  schema: 'lpc-toolkit.asset-pack.v1',
  id: 'acme.demo',
  displayName: 'Demo',
  version: '1.2.3',
  credits: { authors: ['A'], licenses: ['CC-BY-SA 4.0'], urls: [], notes: 'n' },
  compatibility: { minimumCliVersion: '1.0.0', requiredCapabilities: ['sprites'] },
  creditOverrides: { 'sprites/a.png': { authors: ['B'], licenses: ['CC0'], urls: [], notes: '' } },
  replaces: [{ packId: 'old.pack', versions: '>=1.0.0', assets: ['demo'] }],
  assets: [],
};

const candidate: AssetPackAcknowledgement = {
  code: 'asset_path_inferred',
  subject: { path: 'sprites/a.png' },
  contentDigest: `sha256:${'a'.repeat(64)}`,
  reason: '',
};

describe('asset-pack manifest editor projections', () => {
  it('keeps Overview, Credits, and Advanced ownership disjoint', () => {
    expect(projectAssetPackOverview(source)).toEqual({
      id: 'acme.demo', displayName: 'Demo', version: '1.2.3', compatibility: source.compatibility,
    });
    expect(projectAssetPackCredits(source)).toEqual(source.credits);
    expect(projectAssetPackAdvanced(source)).toEqual({
      creditOverrides: source.creditOverrides,
      replaces: source.replaces,
      assets: source.assets,
    });
  });

  it('rejects unknown advanced keys and common, schema, status, or acknowledgement mutation', () => {
    expect(() => applyAssetPackAdvancedProjection(source, { assets: [], unknown: true })).toThrow();
    expect(() => applyAssetPackAdvancedProjection(source, { assets: [], id: 'changed' })).toThrow();
    expect(() => applyAssetPackAdvancedProjection(source, { assets: [], schema: 'changed' })).toThrow();
    expect(() => applyAssetPackAdvancedProjection(source, { assets: [], status: 'draft' })).toThrow();
    expect(() => applyAssetPackAdvancedProjection(source, { assets: [], acknowledgements: [] })).toThrow();
  });

  it('serializes one complete manifest text and preserves non-advanced fields', () => {
    const edited = applyAssetPackAdvancedProjection(source, {
      assets: [],
      replaces: [],
    });
    expect(serializeAssetPackManifest(edited)).toBe(`${JSON.stringify(edited, null, 2)}\n`);
    expect(edited.id).toBe(source.id);
    expect(edited.credits).toEqual(source.credits);
  });

  it('acknowledges only the exact current candidate, trims the reason, and removes stale records', () => {
    const stale: AssetPackAcknowledgement = { ...candidate, contentDigest: `sha256:${'b'.repeat(64)}`, reason: 'old' };
    const acknowledged = acknowledgeWarning({ ...source, acknowledgements: [candidate, stale] }, candidate, '  reviewed  ');
    expect(acknowledged.acknowledgements).toEqual([{ ...candidate, reason: 'reviewed' }]);
    expect(acknowledgeWarning(source, candidate, 'reason').acknowledgements).toEqual([{ ...candidate, reason: 'reason' }]);
    expect(() => acknowledgeWarning(source, candidate, '   ')).toThrow();
    expect(() => acknowledgeWarning({ ...source, acknowledgements: [stale] }, candidate, 'reason')).toThrow();
  });

  it('replaces a stale same-binding record when the current warning candidate is explicitly confirmed', () => {
    const stale: AssetPackAcknowledgement = { ...candidate, contentDigest: `sha256:${'b'.repeat(64)}`, reason: 'old' };
    expect(acknowledgeCurrentWarning({ ...source, acknowledgements: [stale] }, candidate, 'reason').acknowledgements)
      .toEqual([{ ...candidate, reason: 'reason' }]);
  });
});
