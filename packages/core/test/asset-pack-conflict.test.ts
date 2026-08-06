import { describe, expect, it } from 'vitest';
import {
  assetPackConflictDigestInput,
  evaluateAssetPackConflict,
  parseAssetPackConflict,
  resolveAssetPackConflict,
  type AssetPackConflict,
  type AssetPackConflictSelection,
} from '../src/asset-pack-conflict.js';

const digest = (character: string): string => `sha256:${character.repeat(64)}`;

const target = {
  kind: 'generated-destination' as const,
  key: 'generated-destination:hair/item:walk:male:layer_1',
};

const basePack = {
  packId: 'base.pack',
  version: '1.0.0',
  contentDigest: digest('a'),
  sourceDigestSet: [digest('b')],
  manifestDigest: digest('c'),
  compatibility: {
    minimumCliVersion: '0.2.0',
    requiredCapabilities: ['asset-pack.v1'],
  },
  generatedOwnership: ['spritesheets/hair/item/walk/male/layer_1.png'],
  replacementIntentDigests: [],
  creditDigests: [digest('d')],
  licenseDigests: [digest('e')],
  acknowledgementDigests: [],
  provenanceReferenceDigests: [digest('f')],
};

const conflictFixture: AssetPackConflict = {
  schema: 'lpc-toolkit.asset-pack-conflict.v1',
  conflictId: digest('0'),
  workspaceBaselineDigest: digest('1'),
  target,
  baseline: {
    resultDigest: digest('2'),
    snapshotDigest: digest('3'),
    sourceReferenceDigests: [digest('4')],
    creditReferenceDigests: [digest('5')],
    licenseReferenceDigests: [digest('6')],
    provenanceReferenceDigests: [digest('7')],
  },
  contenders: [
    {
      contenderId: 'alpha.pack@1.0.0',
      pack: {
        ...basePack,
        packId: 'alpha.pack',
        contentDigest: digest('8'),
        sourceDigestSet: [digest('9')],
        manifestDigest: digest('a'),
        creditDigests: [digest('b')],
        licenseDigests: [digest('c')],
        provenanceReferenceDigests: [digest('d')],
      },
      target,
      resultDigest: digest('e'),
      baseSnapshotDigest: digest('3'),
      sourceReferenceDigests: [digest('9')],
      creditReferenceDigests: [digest('b')],
      licenseReferenceDigests: [digest('c')],
      provenanceReferenceDigests: [digest('d')],
      compatibility: {
        status: 'compatible',
        digest: digest('f'),
        diagnostics: [],
      },
      trust: {
        status: 'verified',
        receiptDigests: [digest('a')],
      },
      origin: 'pack-source',
      semanticPatches: [{
        path: 'definition.layer_1',
        baseDigest: digest('3'),
        resultDigest: digest('e'),
      }],
      d5EvidenceDigests: [],
    },
    {
      contenderId: 'bravo.pack@1.0.0',
      pack: {
        ...basePack,
        packId: 'bravo.pack',
        contentDigest: digest('b'),
        sourceDigestSet: [digest('c')],
        manifestDigest: digest('d'),
        creditDigests: [digest('e')],
        licenseDigests: [digest('f')],
        provenanceReferenceDigests: [digest('a')],
      },
      target,
      resultDigest: digest('f'),
      baseSnapshotDigest: digest('3'),
      sourceReferenceDigests: [digest('c')],
      creditReferenceDigests: [digest('e')],
      licenseReferenceDigests: [digest('f')],
      provenanceReferenceDigests: [digest('a')],
      compatibility: {
        status: 'compatible',
        digest: digest('e'),
        diagnostics: [],
      },
      trust: {
        status: 'verified',
        receiptDigests: [digest('b')],
      },
      origin: 'd5-candidate',
      semanticPatches: [{
        path: 'definition.layer_2',
        baseDigest: digest('3'),
        resultDigest: digest('f'),
      }],
      d5EvidenceDigests: [digest('c')],
    },
  ],
  compatibility: {
    status: 'compatible',
    digest: digest('8'),
    requiredCapabilities: ['asset-pack.v1'],
    diagnostics: [],
  },
  attribution: {
    complete: true,
    sourceReferenceDigests: [digest('9')],
    creditReferenceDigests: [digest('b'), digest('e')],
    licenseReferenceDigests: [digest('c'), digest('f')],
    acknowledgementDigests: [],
    provenanceReferenceDigests: [digest('a'), digest('d')],
  },
  policy: {
    schema: 'lpc-toolkit.asset-pack-conflict-policy.v1',
    allowedResolutions: ['retain-current', 'select-contender', 'merge-disjoint', 'decline'],
    explicitSelectionRequired: true,
    digest: digest('9'),
  },
  status: 'selection-required',
  diagnostics: [],
};

function selection(
  resolution: AssetPackConflictSelection['targets'][number]['resolution'],
  contenderIds: readonly string[],
  baselineDigest = conflictFixture.workspaceBaselineDigest,
): AssetPackConflictSelection {
  return {
    schema: 'lpc-toolkit.asset-pack-conflict-selection.v1',
    conflictId: conflictFixture.conflictId,
    baselineDigest,
    targets: [{
      targetKey: target.key,
      resolution,
      contenderIds,
      reviewEvidenceDigests: [digest('c')],
      ...(resolution === 'merge-disjoint' ? { resultDigest: digest('f') } : {}),
    }],
    review: {
      label: 'manual-review',
      reason: 'The user reviewed the bounded local evidence.',
    },
  };
}

describe('asset-pack conflict contract', () => {
  it('parses a bounded conflict and gives discovery-order-independent identity input', () => {
    const result = parseAssetPackConflict(conflictFixture);
    expect(result).toEqual({ ok: true, conflict: conflictFixture });

    const reversed = {
      ...conflictFixture,
      contenders: [...conflictFixture.contenders].reverse(),
    };
    expect(assetPackConflictDigestInput(reversed)).toBe(
      assetPackConflictDigestInput(conflictFixture),
    );
  });

  it('rejects unknown fields, malformed digests, and unsafe logical target keys', () => {
    const unknownField = parseAssetPackConflict({
      ...conflictFixture,
      unexpected: true,
    });
    expect(unknownField.ok).toBe(false);

    const malformed = parseAssetPackConflict({
      ...conflictFixture,
      workspaceBaselineDigest: 'not-a-digest',
    });
    expect(malformed.ok).toBe(false);

    const unsafeTarget = parseAssetPackConflict({
      ...conflictFixture,
      target: { ...target, key: '/tmp/escape' },
    });
    expect(unsafeTarget.ok).toBe(false);
  });

  it('requires explicit selection for different output bytes and never ranks contenders', () => {
    const evaluation = evaluateAssetPackConflict(conflictFixture);
    expect(evaluation.status).toBe('selection-required');
    expect(evaluation.nextAction).toBe('select-all-targets');
    expect(evaluation.eligibleContenderIds).toEqual([
      'alpha.pack@1.0.0',
      'bravo.pack@1.0.0',
    ]);

    const incomplete = resolveAssetPackConflict(conflictFixture, {
      ...selection('select-contender', ['alpha.pack@1.0.0']),
      targets: [],
    }, { confirmed: true });
    expect(incomplete).toMatchObject({
      ok: false,
      code: 'conflict_selection_incomplete',
      nextAction: 'select-all-targets',
    });
  });

  it('accepts only a confirmed, digest-bound, eligible user selection', () => {
    expect(resolveAssetPackConflict(
      conflictFixture,
      selection('select-contender', ['alpha.pack@1.0.0']),
      { confirmed: false },
    )).toMatchObject({
      ok: false,
      code: 'conflict_requires_confirmation',
      nextAction: 'confirm-resolution',
    });

    const result = resolveAssetPackConflict(
      conflictFixture,
      selection('select-contender', ['alpha.pack@1.0.0']),
      { confirmed: true },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected a confirmed selection to resolve.');
    expect(result.resolution.status).toBe('resolved');
    expect(result.resolution.targets[0]).toMatchObject({
      targetKey: target.key,
      resolution: 'select-contender',
      contenderIds: ['alpha.pack@1.0.0'],
    });
  });

  it('refuses changed baselines and incompatible contenders without mutation', () => {
    expect(resolveAssetPackConflict(
      conflictFixture,
      selection('select-contender', ['alpha.pack@1.0.0'], digest('f')),
      { confirmed: true },
    )).toMatchObject({
      ok: false,
      code: 'conflict_baseline_stale',
      nextAction: 'refresh-conflict',
    });

    const blocked = {
      ...conflictFixture,
      contenders: conflictFixture.contenders.map((contender) =>
        contender.contenderId === 'alpha.pack@1.0.0'
          ? {
            ...contender,
            compatibility: {
              ...contender.compatibility,
              status: 'incompatible' as const,
              diagnostics: ['minimum-cli-version'],
            },
          }
          : contender),
    };
    expect(resolveAssetPackConflict(
      blocked,
      selection('select-contender', ['alpha.pack@1.0.0']),
      { confirmed: true },
    )).toMatchObject({
      ok: false,
      code: 'conflict_incompatible_pack',
      nextAction: 'remove-incompatible-contender',
    });
  });

  it('merges disjoint digest-bound semantic patches and preserves evidence', () => {
    const result = resolveAssetPackConflict(
      conflictFixture,
      selection('merge-disjoint', [
        'alpha.pack@1.0.0',
        'bravo.pack@1.0.0',
      ]),
      { confirmed: true },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected disjoint patches to merge.');
    expect(result.resolution.targets[0]).toMatchObject({
      resolution: 'merge-disjoint',
      contenderIds: ['alpha.pack@1.0.0', 'bravo.pack@1.0.0'],
      resultDigest: digest('f'),
    });
    expect(result.resolution.evidenceDigests).toEqual([
      digest('9'),
      digest('a'),
      digest('b'),
      digest('c'),
      digest('d'),
      digest('e'),
      digest('f'),
    ]);
  });

  it('coalesces same-result contenders without using contender order as precedence', () => {
    const sameResult = {
      ...conflictFixture,
      contenders: conflictFixture.contenders.map((contender) => ({
        ...contender,
        resultDigest: digest('e'),
        semanticPatches: contender.semanticPatches.map((patch) => ({
          ...patch,
          ...(contender.contenderId === 'bravo.pack@1.0.0'
            ? { path: 'definition.layer_1' }
            : {}),
          resultDigest: digest('e'),
        })),
      })),
    };
    const result = resolveAssetPackConflict(
      sameResult,
      {
        ...selection('merge-disjoint', [
          'alpha.pack@1.0.0',
          'bravo.pack@1.0.0',
        ]),
        targets: [{
          ...selection('merge-disjoint', [
            'alpha.pack@1.0.0',
            'bravo.pack@1.0.0',
          ]).targets[0]!,
          resultDigest: digest('e'),
        }],
      },
      { confirmed: true },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected same-result contenders to coalesce.');
    expect(result.resolution.targets[0]?.resultDigest).toBe(digest('e'));
  });

  it('blocks incomplete attribution and keeps D5 evidence non-authoritative', () => {
    const incomplete = {
      ...conflictFixture,
      attribution: { ...conflictFixture.attribution, complete: false },
    };
    expect(evaluateAssetPackConflict(incomplete)).toMatchObject({
      status: 'blocked',
      nextAction: 'review-attribution',
    });

    const d5WithoutEvidence = {
      ...conflictFixture,
      contenders: conflictFixture.contenders.map((contender) =>
        contender.origin === 'd5-candidate'
          ? { ...contender, d5EvidenceDigests: [] }
          : contender),
    };
    expect(resolveAssetPackConflict(
      d5WithoutEvidence,
      selection('select-contender', ['bravo.pack@1.0.0']),
      { confirmed: true },
    )).toMatchObject({
      ok: false,
      code: 'conflict_incompatible_pack',
      nextAction: 'remove-incompatible-contender',
    });
  });
});
