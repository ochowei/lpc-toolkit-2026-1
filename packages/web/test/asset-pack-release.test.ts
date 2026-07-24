import { describe, expect, it } from 'vitest';
import type { AssetPackWorkbenchRevision } from '../src/lib/asset-pack-worker-protocol';
import {
  assetPackFormalBlockers,
  canAcknowledgeAssetPackWarning,
  suggestNextAssetPackPatchVersion,
  type AssetPackFormalBlocker,
} from '../src/slice/asset-pack-release';

const digest = (char: string): `sha256:${string}` => `sha256:${char.repeat(64)}`;
function workbench(overrides: Partial<AssetPackWorkbenchRevision> = {}): AssetPackWorkbenchRevision {
  return {
    revision: 2,
    manifestText: JSON.stringify({ schema: 'lpc-toolkit.asset-pack.v1', id: 'acme.demo', version: '1.2.3', displayName: 'Demo', credits: { authors: ['A'], licenses: ['CC0'], urls: [], notes: '' }, assets: [] }),
    uploadMetadata: { originalArchiveDigest: digest('a'), uploadedVersion: '1.2.3', uploadedStatus: 'formal', baselineReleaseTag: 'test' },
    sourceSummaries: [], diagnostics: [], acknowledgementRecords: [], contentDigest: digest('c'), releaseFingerprint: digest('r'), draftSerializable: true,
    formalCandidate: { revision: 2, archiveDigest: digest('a'), filename: 'acme.demo-1.2.3.lpc-assets.zip', version: '1.2.3', byteIdenticalToUploadedFormal: true, uploadMetadata: { originalArchiveDigest: digest('a'), uploadedVersion: '1.2.3', uploadedStatus: 'formal', baselineReleaseTag: 'test' } },
    ...overrides,
  };
}

describe('asset-pack formal release gates', () => {
  it('suggests the next patch for stable and prerelease versions, but not invalid input', () => {
    expect(suggestNextAssetPackPatchVersion('1.2.3')).toBe('1.2.4');
    expect(suggestNextAssetPackPatchVersion('1.2.3-beta.2')).toBe('1.2.4');
    expect(suggestNextAssetPackPatchVersion('not-semver')).toBeUndefined();
  });

  it('reports every blocker in stable order and makes ready equivalent to no blockers', () => {
    const withErrors = workbench({
      diagnostics: [
        { code: 'asset_source_missing', severity: 'error', message: 'missing', scope: 'source' },
        { code: 'asset_path_inferred', severity: 'warning', message: 'warning', scope: 'warning', subject: { path: 'x' } },
      ],
    });
    const { formalCandidate: _candidate, ...missingCandidate } = withErrors;
    const blockers = assetPackFormalBlockers({
      workbench: missingCandidate,
      originalReleaseFingerprint: digest('o'),
    });
    expect(blockers.map((blocker) => blocker.code)).toEqual([
      'validation-error', 'unacknowledged-warning', 'missing-candidate', 'version-increase-required',
    ]);
    expect(blockers.every((blocker: AssetPackFormalBlocker) => blocker.message.length > 0)).toBe(true);
  });

  it('requires a greater version for changed release content, drafts, and changed formal bytes, but accepts greater custom versions', () => {
    const changed = workbench({
      releaseFingerprint: digest('n'),
      formalCandidate: { ...workbench().formalCandidate!, archiveDigest: digest('b'), byteIdenticalToUploadedFormal: false, version: '1.2.3' },
    });
    expect(assetPackFormalBlockers({ workbench: changed, originalReleaseFingerprint: digest('o') }).some(({ code }) => code === 'version-increase-required')).toBe(true);
    expect(assetPackFormalBlockers({ workbench: { ...changed, manifestText: changed.manifestText.replace('1.2.3', '2.0.0') }, originalReleaseFingerprint: digest('o') }).some(({ code }) => code === 'version-increase-required')).toBe(false);
    expect(assetPackFormalBlockers({ workbench: { ...workbench(), uploadMetadata: { ...workbench().uploadMetadata, uploadedStatus: 'draft' } }, originalReleaseFingerprint: digest('r') }).some(({ code }) => code === 'version-increase-required')).toBe(true);
    const repairedDraft = workbench({
      manifestText: workbench().manifestText.replace('"1.2.3"', '"1.2.4"'),
      uploadMetadata: { ...workbench().uploadMetadata, uploadedStatus: 'draft' },
      formalCandidate: { ...workbench().formalCandidate!, version: '1.2.4', uploadMetadata: { ...workbench().formalCandidate!.uploadMetadata, uploadedStatus: 'draft' } },
    });
    expect(assetPackFormalBlockers({ workbench: repairedDraft, originalReleaseFingerprint: digest('r') }).map(({ code }) => code))
      .not.toContain('draft-status');
    expect(assetPackFormalBlockers({ workbench: repairedDraft, originalReleaseFingerprint: digest('r') }).map(({ code }) => code))
      .not.toContain('version-increase-required');
  });

  it('allows unchanged formal upload to retain its version only when candidate bytes match', () => {
    expect(assetPackFormalBlockers({ workbench: workbench(), originalReleaseFingerprint: digest('r') })).toEqual([]);
    const changedBytes = workbench({ formalCandidate: { ...workbench().formalCandidate!, archiveDigest: digest('b'), byteIdenticalToUploadedFormal: false } });
    expect(assetPackFormalBlockers({ workbench: changedBytes, originalReleaseFingerprint: digest('r') }).some(({ code }) => code === 'version-increase-required')).toBe(true);
    const forgedIdentity = workbench({ formalCandidate: { ...workbench().formalCandidate!, archiveDigest: digest('b'), byteIdenticalToUploadedFormal: true } });
    expect(assetPackFormalBlockers({ workbench: forgedIdentity, originalReleaseFingerprint: digest('r') }).some(({ code }) => code === 'version-increase-required')).toBe(true);
  });

  it('uses the preserved original upload metadata for version and archive comparisons', () => {
    const currentMetadata = { originalArchiveDigest: digest('z'), uploadedVersion: '1.2.3', uploadedStatus: 'formal' as const, baselineReleaseTag: 'test' };
    const originalMetadata = workbench().uploadMetadata;
    const current = workbench({
      uploadMetadata: currentMetadata,
      formalCandidate: { ...workbench().formalCandidate!, archiveDigest: originalMetadata.originalArchiveDigest, byteIdenticalToUploadedFormal: true },
    });
    expect(assetPackFormalBlockers({
      workbench: current,
      originalReleaseFingerprint: digest('r'),
      originalUploadMetadata: originalMetadata,
    })).toEqual([]);
  });

  it('requires the version gate before acknowledgement submission', () => {
    const warning = { code: 'asset_path_inferred' as const, subject: { path: 'x' }, contentDigest: digest('c'), reason: '' };
    expect(canAcknowledgeAssetPackWarning({ workbench: workbench({ acknowledgementRecords: [warning] }), originalReleaseFingerprint: digest('o') }, warning)).toBe(false);
    expect(canAcknowledgeAssetPackWarning({ workbench: workbench(), originalReleaseFingerprint: digest('r') }, warning)).toBe(true);
  });
});
