import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ASSET_AUTHORING_RELEASE_ARTIFACT_IDS,
  assetAuthoringReleaseGateProjection,
  assetAuthoringReleaseReceiptDigestInput,
  type AssetAuthoringPreviewAcceptanceReceipt,
  type AssetAuthoringReleaseDeclarationReceipt,
  type AssetDistributionRelease,
} from '@lpc-toolkit/core';
import { readAssetPackArchive } from '../src/asset-pack-archive-format.js';
import type { AssetPackArchiveSnapshot } from '../src/asset-pack-archive-format.js';
import {
  ASSET_DISTRIBUTION_LICENSE_EVIDENCE_SCHEMA,
  assetDistributionReleaseEvidenceDigest,
  parseAssetDistributionProviderEvidence,
  verifyAssetDistributionReleaseEvidence,
} from '../src/asset-distribution-release-evidence.js';
import type {
  AssetDistributionReleaseEvidenceInput,
  AssetDistributionProviderEvidence,
} from '../src/asset-distribution-release-evidence.js';
import { createD3WebCliFixtures } from './fixtures/d3-web-cli-fixtures.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const DIGEST_C = `sha256:${'c'.repeat(64)}`;
const DIGEST_D = `sha256:${'d'.repeat(64)}`;
const DIGEST_E = `sha256:${'e'.repeat(64)}`;
const DIGEST_F = `sha256:${'f'.repeat(64)}`;
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sourceDigests(snapshot: AssetPackArchiveSnapshot): readonly { readonly path: string; readonly digest: string }[] {
  return [...snapshot.payload.sourceDigests]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, digest]) => ({ path, digest }));
}

function artifacts(): readonly {
  readonly id: (typeof ASSET_AUTHORING_RELEASE_ARTIFACT_IDS)[number];
  readonly path: string;
  readonly digest: string;
}[] {
  return ASSET_AUTHORING_RELEASE_ARTIFACT_IDS.map((id, index) => ({
    id,
    path: `preview-artifact-${index}`,
    digest: [DIGEST_A, DIGEST_B, DIGEST_C, DIGEST_D][index] ?? DIGEST_A,
  }));
}

function receiptDigest(receipt: AssetAuthoringPreviewAcceptanceReceipt): string {
  return sha256(Buffer.from(assetAuthoringReleaseReceiptDigestInput(receipt), 'utf8'));
}

async function validEvidence(): Promise<AssetDistributionReleaseEvidenceInput> {
  const fixtures = await createD3WebCliFixtures();
  const archiveResult = await readAssetPackArchive({
    archivePath: 'd4-formal-fixture.lpc-assets.zip',
    archiveBytes: Buffer.from(fixtures.archiveBytes),
  });
  if (!archiveResult.ok) throw new Error(JSON.stringify(archiveResult.diagnostics));
  const archive = archiveResult.snapshot;
  const sources = sourceDigests(archive);
  const manifestDigest = sha256(archive.manifestBytes);
  const validationReceiptId = archive.payload.contentDigest;
  const creditsBytes = Buffer.from(canonicalJson({
    credits: archive.payload.pack.credits,
    creditOverrides: {},
  }));
  const creditsDigest = sha256(creditsBytes);
  const licenseEvidenceBytes = Buffer.from(canonicalJson({
    schema: ASSET_DISTRIBUTION_LICENSE_EVIDENCE_SCHEMA,
    creditsDigest,
    licenses: ['CC-BY-SA 4.0'],
  }));
  const licenseEvidenceDigest = sha256(licenseEvidenceBytes);
  const validation = {
    receiptId: validationReceiptId,
    valid: true as const,
    manifestDigest,
    contentDigest: archive.payload.contentDigest,
    sourceDigests: sources,
  };
  const declaration: AssetAuthoringReleaseDeclarationReceipt = {
    schema: 'lpc-toolkit.asset-authoring-release-receipt.v1',
    kind: 'declaration',
    sessionId: SESSION_ID,
    cliVersion: '0.2.0',
    recordedAt: '2026-08-06T12:00:00.000Z',
    declarant: {
      displayName: 'Fixture Maintainer',
      kind: 'person',
      role: 'authorized-release-declarant',
    },
    declarationDigest: DIGEST_A,
    manifestDigest,
    sourceDigests: sources,
    validationReceiptId,
    validationReceiptRevision: validationReceiptId,
    creditDigests: {
      authorAndSource: creditsDigest,
      licenseAuthority: creditsDigest,
    },
    acknowledgements: {
      contentDigest: archive.payload.contentDigest,
      recordDigests: [],
    },
  };
  const previewAcceptance: AssetAuthoringPreviewAcceptanceReceipt = {
    schema: 'lpc-toolkit.asset-authoring-release-receipt.v1',
    kind: 'preview-acceptance',
    sessionId: SESSION_ID,
    cliVersion: '0.2.0',
    recordedAt: '2026-08-06T12:01:00.000Z',
    declarant: declaration.declarant,
    declarationReceiptDigest: declaration.declarationDigest,
    manifestDigest,
    sourceDigests: sources,
    validationReceiptId,
    validationReceiptRevision: validationReceiptId,
    previewReceiptId: DIGEST_B,
    previewInputDigest: DIGEST_C,
    artifacts: artifacts(),
  };
  const previewAcceptanceDigest = receiptDigest(previewAcceptance);
  const formalArchive = {
    schema: 'lpc-toolkit.asset-authoring-formal-archive-receipt.v1' as const,
    packId: archive.payload.pack.id,
    version: archive.payload.pack.version,
    archivePath: '/tmp/d4-formal-fixture.lpc-assets.zip',
    archiveDigest: archive.archiveDigest,
    manifestDigest,
    contentDigest: archive.payload.contentDigest,
    sourceDigests: sources,
    validationReceiptId,
    declarationReceiptDigest: declaration.declarationDigest,
    previewAcceptanceReceiptDigest: previewAcceptanceDigest,
    previewInputDigest: previewAcceptance.previewInputDigest,
    previewArtifacts: artifacts(),
    recordedAt: '2026-08-06T12:02:00.000Z',
  } as const;
  const archiveInspection = {
    schema: 'lpc-toolkit.asset-authoring-archive-inspection-receipt.v1' as const,
    packId: archive.payload.pack.id,
    version: archive.payload.pack.version,
    archivePath: formalArchive.archivePath,
    archiveDigest: archive.archiveDigest,
    formalArchiveDigest: archive.archiveDigest,
    manifestDigest,
    contentDigest: archive.payload.contentDigest,
    sourceDigests: sources,
    entryCount: archive.entryCount,
    totalUncompressedBytes: archive.totalUncompressedBytes,
    recordedAt: '2026-08-06T12:03:00.000Z',
  } as const;
  const provenance = {
    schema: 'lpc-toolkit.asset-release-provenance-verification.v1' as const,
    verified: true as const,
    archivePath: formalArchive.archivePath,
    provenancePath: 'd4-provenance.json',
    provenanceDigest: DIGEST_D,
    projectionDigest: DIGEST_E,
    packId: archive.payload.pack.id,
    version: archive.payload.pack.version,
    archiveDigest: archive.archiveDigest,
    manifestDigest,
    contentDigest: archive.payload.contentDigest,
    sourceDigests: sources,
    recordCount: 1,
    releaseDeclarationReceiptDigest: declaration.declarationDigest,
    previewAcceptanceReceiptDigest: previewAcceptanceDigest,
    previewArtifacts: artifacts().map(({ id, digest }) => ({ id, digest })),
    humanEvidence: {
      releaseDeclarationReceiptRecreated: false as const,
      previewAcceptanceReceiptRecreated: false as const,
    },
  };
  const provider: AssetDistributionProviderEvidence = {
    schema: 'lpc-toolkit.asset-distribution-provider-evidence.v1',
    invocationDigest: DIGEST_E,
    evidenceDigest: DIGEST_F,
    role: 'provenance-only',
  };
  const handoff = {
    handoffDigest: fixtures.handoff.web.stateDigest,
    receiptDigest: DIGEST_F,
    status: 'current' as const,
    archiveDigest: archive.archiveDigest,
    manifestDigest,
    contentDigest: archive.payload.contentDigest,
    creditDigest: creditsDigest,
  };
  const releaseBase: AssetDistributionRelease = {
    schema: 'lpc-toolkit.asset-distribution-release.v1',
    release: {
      namespace: 'example',
      packId: archive.payload.pack.id,
      version: archive.payload.pack.version,
      archiveKind: 'formal',
      archiveDigest: archive.archiveDigest,
      byteLength: archive.archiveBytes.byteLength,
      manifestDigest,
      contentDigest: archive.payload.contentDigest,
      sourceDigests: sources,
      creditsDigest,
      licenseEvidenceDigest,
      provenanceDigest: DIGEST_D,
      requiredCapabilities: [],
    },
    authorization: {
      namespacePolicyId: 'example-policy-v1',
      releaseEvidenceDigest: DIGEST_F,
    },
    signature: {
      keyId: DIGEST_A,
      algorithm: 'ed25519',
      payloadDigest: DIGEST_B,
      value: 'ZmFrZS1zaWduYXR1cmU',
    },
  };
  const evidence = {
    release: releaseBase,
    archive,
    credits: { source: 'formal-archive' as const, archiveDigest: archive.archiveDigest, bytes: creditsBytes },
    licenseEvidenceBytes,
    validation,
    releaseGates: assetAuthoringReleaseGateProjection({
      acknowledgements: 'current',
      validation: 'current',
      releaseDeclaration: 'current',
      preview: 'current',
      previewArtifacts: 'current',
      previewAcceptance: 'current',
    }),
    releaseDeclaration: declaration,
    previewAcceptance,
    formalArchive,
    archiveInspection,
    provenance,
    provider,
    handoff,
  } satisfies AssetDistributionReleaseEvidenceInput;
  const releaseEvidenceDigest = assetDistributionReleaseEvidenceDigest(evidence);
  return {
    ...evidence,
    release: {
      ...releaseBase,
      authorization: {
        ...releaseBase.authorization,
        releaseEvidenceDigest,
      },
    },
  };
}

describe('asset distribution release evidence', () => {
  it('binds exact archive, credits, license, provenance, and human release gates', async () => {
    const evidence = await validEvidence();
    const verified = verifyAssetDistributionReleaseEvidence(evidence);
    expect(verified).toMatchObject({
      ok: true,
      decision: 'publishable',
      releaseEvidenceDigest: evidence.release.authorization.releaseEvidenceDigest,
      creditsDigest: evidence.release.release.creditsDigest,
      licenseEvidenceDigest: evidence.release.release.licenseEvidenceDigest,
      provenanceDigest: DIGEST_D,
    });
    expect(JSON.stringify(verified)).not.toMatch(/d4-formal|provenance\.json|archiveBytes|upstream\//iu);
  });

  it('blocks changed credits, unsupported licenses, provenance drift, and missing approval', async () => {
    const evidence = await validEvidence();
    const changedCredits = verifyAssetDistributionReleaseEvidence({
      ...evidence,
      credits: { ...evidence.credits, bytes: Buffer.from('changed CREDITS.csv') },
    });
    expect(changedCredits).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_distribution_credit_mismatch' }],
    });

    const unsupportedLicenseBytes = Buffer.from(canonicalJson({
      schema: ASSET_DISTRIBUTION_LICENSE_EVIDENCE_SCHEMA,
      creditsDigest: evidence.release.release.creditsDigest,
      licenses: ['MIT'],
    }));
    const unsupportedLicense = verifyAssetDistributionReleaseEvidence({
      ...evidence,
      licenseEvidenceBytes: unsupportedLicenseBytes,
    });
    expect(unsupportedLicense).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_distribution_license_mismatch' }],
    });

    const changedLicenseBytes = Buffer.from(canonicalJson({
      schema: ASSET_DISTRIBUTION_LICENSE_EVIDENCE_SCHEMA,
      creditsDigest: evidence.release.release.creditsDigest,
      licenses: ['CC-BY 4.0'],
    }));
    const changedLicense = verifyAssetDistributionReleaseEvidence({
      ...evidence,
      licenseEvidenceBytes: changedLicenseBytes,
    });
    expect(changedLicense).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_distribution_license_mismatch' }],
    });

    if (evidence.provenance === undefined) throw new Error('Expected provenance fixture.');
    const provenanceDrift = verifyAssetDistributionReleaseEvidence({
      ...evidence,
      provenance: { ...evidence.provenance, archiveDigest: DIGEST_A },
    });
    expect(provenanceDrift).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_distribution_provenance_mismatch' }],
    });

    const noApproval = verifyAssetDistributionReleaseEvidence({
      ...evidence,
      releaseGates: assetAuthoringReleaseGateProjection({
        acknowledgements: 'current',
        validation: 'current',
        releaseDeclaration: 'stale',
        preview: 'current',
        previewArtifacts: 'current',
        previewAcceptance: 'current',
      }),
    });
    expect(noApproval).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_distribution_release_authorization_required' }],
    });
  });

  it('refuses provider attribution and accepts only bounded provenance evidence', () => {
    const providerAsAuthor = parseAssetDistributionProviderEvidence({
      schema: 'lpc-toolkit.asset-distribution-provider-evidence.v1',
      invocationDigest: DIGEST_A,
      evidenceDigest: DIGEST_B,
      role: 'author',
    });
    expect(providerAsAuthor).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_distribution_provider_authority_forbidden' }],
    });

    const provider = parseAssetDistributionProviderEvidence({
      schema: 'lpc-toolkit.asset-distribution-provider-evidence.v1',
      invocationDigest: DIGEST_A,
      evidenceDigest: DIGEST_B,
      role: 'provenance-only',
    });
    expect(provider).toMatchObject({ ok: true });
  });
});
