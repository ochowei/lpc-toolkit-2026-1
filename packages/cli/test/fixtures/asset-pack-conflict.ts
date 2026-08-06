import { createHash } from 'node:crypto';
import {
  assetPackConflictDigestInput,
  type AssetPackConflict,
  type AssetPackConflictSelection,
} from '@lpc-toolkit/core';

export const d6Digest = (character: string): string => `sha256:${character.repeat(64)}`;

export interface D6ConflictFixture {
  readonly conflict: AssetPackConflict;
  readonly selection: AssetPackConflictSelection;
}

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function createD6ConflictFixture(): D6ConflictFixture {
  const target = {
    kind: 'generated-destination' as const,
    key: 'generated-destination:hair/item:walk:male:layer_1',
  };
  const conflictWithoutId: AssetPackConflict = {
    schema: 'lpc-toolkit.asset-pack-conflict.v1',
    conflictId: d6Digest('0'),
    workspaceBaselineDigest: d6Digest('1'),
    target,
    baseline: {
      resultDigest: d6Digest('2'),
      snapshotDigest: d6Digest('3'),
      sourceReferenceDigests: [d6Digest('4')],
      creditReferenceDigests: [d6Digest('5')],
      licenseReferenceDigests: [d6Digest('6')],
      provenanceReferenceDigests: [d6Digest('7')],
    },
    contenders: [{
      contenderId: 'alpha.pack@1.0.0',
      pack: {
        packId: 'alpha.pack',
        version: '1.0.0',
        contentDigest: d6Digest('8'),
        sourceDigestSet: [d6Digest('9')],
        manifestDigest: d6Digest('a'),
        compatibility: {
          minimumCliVersion: '0.2.0',
          requiredCapabilities: ['asset-pack.v1'],
        },
        generatedOwnership: ['spritesheets/hair/item/walk/male/layer_1.png'],
        replacementIntentDigests: [],
        creditDigests: [d6Digest('b')],
        licenseDigests: [d6Digest('c')],
        acknowledgementDigests: [],
        provenanceReferenceDigests: [d6Digest('d')],
      },
      target,
      resultDigest: d6Digest('e'),
      baseSnapshotDigest: d6Digest('3'),
      sourceReferenceDigests: [d6Digest('9')],
      creditReferenceDigests: [d6Digest('b')],
      licenseReferenceDigests: [d6Digest('c')],
      provenanceReferenceDigests: [d6Digest('d')],
      compatibility: {
        status: 'compatible',
        digest: d6Digest('f'),
        diagnostics: [],
      },
      trust: {
        status: 'verified',
        receiptDigests: [d6Digest('a')],
      },
      origin: 'pack-source',
      semanticPatches: [{
        path: 'definition.layer_1',
        baseDigest: d6Digest('3'),
        resultDigest: d6Digest('e'),
      }],
      d5EvidenceDigests: [],
    }],
    compatibility: {
      status: 'compatible',
      digest: d6Digest('8'),
      requiredCapabilities: ['asset-pack.v1'],
      diagnostics: [],
    },
    attribution: {
      complete: true,
      sourceReferenceDigests: [d6Digest('9')],
      creditReferenceDigests: [d6Digest('b')],
      licenseReferenceDigests: [d6Digest('c')],
      acknowledgementDigests: [],
      provenanceReferenceDigests: [d6Digest('d')],
    },
    policy: {
      schema: 'lpc-toolkit.asset-pack-conflict-policy.v1',
      allowedResolutions: ['retain-current', 'select-contender', 'merge-disjoint', 'decline'],
      explicitSelectionRequired: true,
      digest: d6Digest('9'),
    },
    status: 'selection-required',
    diagnostics: [],
  };
  const conflict: AssetPackConflict = {
    ...conflictWithoutId,
    conflictId: digest(assetPackConflictDigestInput(conflictWithoutId)),
  };
  const selection: AssetPackConflictSelection = {
    schema: 'lpc-toolkit.asset-pack-conflict-selection.v1',
    conflictId: conflict.conflictId,
    baselineDigest: conflict.workspaceBaselineDigest,
    targets: [{
      targetKey: target.key,
      resolution: 'select-contender',
      contenderIds: ['alpha.pack@1.0.0'],
      reviewEvidenceDigests: [d6Digest('c')],
    }],
    review: {
      label: 'manual-review',
      reason: 'The bounded local fixture was reviewed by a human.',
    },
  };
  return { conflict, selection };
}
