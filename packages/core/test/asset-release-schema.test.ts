import { describe, expect, it } from 'vitest';
import {
  ASSET_AUTHORING_RELEASE_ARTIFACT_IDS,
  ASSET_AUTHORING_RELEASE_RECEIPT_SCHEMA,
  ASSET_RELEASE_DECLARATION_SCHEMA,
  assetAuthoringReleaseGateProjection,
  assetAuthoringReleaseReceiptDigestInput,
  assetAuthoringReleaseReceiptProjection,
  parseAssetReleaseDeclaration,
  parseAssetAuthoringReleaseReceipt,
  assetReleaseDeclarationDigestInput,
  assetReleaseDeclarationProjection,
} from '../src/asset-release-schema.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const DIGEST_C = `sha256:${'c'.repeat(64)}`;
const DIGEST_D = `sha256:${'d'.repeat(64)}`;
const DIGEST_E = `sha256:${'e'.repeat(64)}`;
const DIGEST_F = `sha256:${'f'.repeat(64)}`;

const DECLARATION = {
  schema: ASSET_RELEASE_DECLARATION_SCHEMA,
  expectedManifestDigest: DIGEST_A,
  declarant: {
    displayName: 'Alice Example',
    kind: 'person',
    role: 'authorized-release-declarant',
  },
  authorAndSource: {
    confirmed: true,
    creditDigest: DIGEST_B,
  },
  licenseAuthority: {
    confirmed: true,
    creditDigest: DIGEST_B,
  },
  acknowledgements: {
    confirmed: true,
    contentDigest: DIGEST_C,
    recordDigests: [DIGEST_C, DIGEST_B],
  },
} as const;

const DECLARATION_RECEIPT = {
  schema: ASSET_AUTHORING_RELEASE_RECEIPT_SCHEMA,
  kind: 'declaration',
  sessionId: '123e4567-e89b-42d3-a456-426614174000',
  cliVersion: '0.0.0',
  recordedAt: '2026-08-04T04:00:00.000Z',
  declarant: DECLARATION.declarant,
  declarationDigest: DIGEST_A,
  manifestDigest: DIGEST_B,
  sourceDigests: [
    { path: 'sprites/z.png', digest: DIGEST_C },
    { path: 'sprites/a.png', digest: DIGEST_D },
  ],
  validationReceiptId: 'validation-01',
  validationReceiptRevision: 'validation-revision-01',
  creditDigests: {
    authorAndSource: DIGEST_E,
    licenseAuthority: DIGEST_F,
  },
  acknowledgements: {
    contentDigest: DIGEST_C,
    recordDigests: [DIGEST_C, DIGEST_B],
  },
} as const;

const PREVIEW_ACCEPTANCE_RECEIPT = {
  schema: ASSET_AUTHORING_RELEASE_RECEIPT_SCHEMA,
  kind: 'preview-acceptance',
  sessionId: DECLARATION_RECEIPT.sessionId,
  cliVersion: DECLARATION_RECEIPT.cliVersion,
  recordedAt: DECLARATION_RECEIPT.recordedAt,
  declarant: DECLARATION_RECEIPT.declarant,
  declarationReceiptDigest: DIGEST_F,
  manifestDigest: DIGEST_B,
  sourceDigests: DECLARATION_RECEIPT.sourceDigests,
  validationReceiptId: DECLARATION_RECEIPT.validationReceiptId,
  validationReceiptRevision: DECLARATION_RECEIPT.validationReceiptRevision,
  previewReceiptId: 'preview-01',
  previewInputDigest: DIGEST_E,
  artifacts: [
    { id: 'preview:credits_csv', path: 'release/credits.csv', digest: DIGEST_C },
    { id: 'preview:credits_txt', path: 'release/credits.txt', digest: DIGEST_D },
    { id: 'preview:metadata', path: 'release/metadata.json', digest: DIGEST_E },
    { id: 'preview:preview', path: 'release/preview.png', digest: DIGEST_F },
  ],
} as const;

describe('asset release declaration schema', () => {
  it('parses the strict human declaration and canonicalizes digest ordering', () => {
    const result = parseAssetReleaseDeclaration(DECLARATION);

    expect(result).toEqual({
      ok: true,
      declaration: {
        ...DECLARATION,
        acknowledgements: {
          ...DECLARATION.acknowledgements,
          recordDigests: [DIGEST_B, DIGEST_C],
        },
      },
    });
  });

  it('rejects unknown fields and missing explicit human confirmation', () => {
    const result = parseAssetReleaseDeclaration({
      ...DECLARATION,
      ambientIdentity: 'from-the-agent',
      authorAndSource: { ...DECLARATION.authorAndSource, confirmed: false },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected strict declaration parsing to fail.');
    expect(result.diagnostics.map((diagnostic) => diagnostic.path)).toEqual([
      '$.ambientIdentity',
      '$.authorAndSource.confirmed',
    ]);
  });

  it('rejects malformed and duplicate evidence digests', () => {
    const malformed = parseAssetReleaseDeclaration({
      ...DECLARATION,
      expectedManifestDigest: 'sha256:not-a-digest',
    });
    const duplicate = parseAssetReleaseDeclaration({
      ...DECLARATION,
      acknowledgements: {
        ...DECLARATION.acknowledgements,
        recordDigests: [DIGEST_B, DIGEST_B],
      },
    });

    expect(malformed.ok).toBe(false);
    if (malformed.ok) throw new Error('Expected malformed digest to fail.');
    expect(malformed.diagnostics.map((diagnostic) => diagnostic.path)).toContain(
      '$.expectedManifestDigest',
    );
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) throw new Error('Expected duplicate digest to fail.');
    expect(duplicate.diagnostics.map((diagnostic) => diagnostic.path)).toContain(
      '$.acknowledgements.recordDigests',
    );
  });

  it('uses one stable digest for equivalent declaration property order', () => {
    const reordered = {
      acknowledgements: {
        recordDigests: [DIGEST_B, DIGEST_C],
        contentDigest: DIGEST_C,
        confirmed: true,
      },
      licenseAuthority: { creditDigest: DIGEST_B, confirmed: true },
      authorAndSource: { creditDigest: DIGEST_B, confirmed: true },
      declarant: {
        role: 'authorized-release-declarant',
        kind: 'person',
        displayName: 'Alice Example',
      },
      expectedManifestDigest: DIGEST_A,
      schema: ASSET_RELEASE_DECLARATION_SCHEMA,
    };

    const first = parseAssetReleaseDeclaration(DECLARATION);
    const second = parseAssetReleaseDeclaration(reordered);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error('Expected valid declarations.');

    expect(assetReleaseDeclarationProjection(first.declaration))
      .toEqual(assetReleaseDeclarationProjection(second.declaration));
    expect(assetReleaseDeclarationDigestInput(first.declaration))
      .toBe(assetReleaseDeclarationDigestInput(second.declaration));
  });
});

describe('asset authoring release receipts', () => {
  it('parses both receipt kinds and canonicalizes independent evidence bindings', () => {
    const declarationResult = parseAssetAuthoringReleaseReceipt(DECLARATION_RECEIPT);
    const previewResult = parseAssetAuthoringReleaseReceipt(PREVIEW_ACCEPTANCE_RECEIPT);

    expect(declarationResult.ok).toBe(true);
    expect(previewResult.ok).toBe(true);
    if (!declarationResult.ok || !previewResult.ok) {
      throw new Error('Expected valid release receipts.');
    }

    expect(declarationResult.receipt).toMatchObject({
      kind: 'declaration',
      manifestDigest: DIGEST_B,
      declarationDigest: DIGEST_A,
      validationReceiptId: 'validation-01',
      creditDigests: {
        authorAndSource: DIGEST_E,
        licenseAuthority: DIGEST_F,
      },
      acknowledgements: {
        contentDigest: DIGEST_C,
        recordDigests: [DIGEST_B, DIGEST_C],
      },
    });
    expect(declarationResult.receipt.sourceDigests.map((entry) => entry.path)).toEqual([
      'sprites/a.png',
      'sprites/z.png',
    ]);
    expect(previewResult.receipt).toMatchObject({
      kind: 'preview-acceptance',
      declarationReceiptDigest: DIGEST_F,
      previewReceiptId: 'preview-01',
      previewInputDigest: DIGEST_E,
    });
    expect(previewResult.receipt.artifacts.map((artifact) => artifact.id)).toEqual([
      ...ASSET_AUTHORING_RELEASE_ARTIFACT_IDS,
    ]);
  });

  it('rejects unknown fields and incomplete preview artifact bindings', () => {
    const unknownField = parseAssetAuthoringReleaseReceipt({
      ...DECLARATION_RECEIPT,
      ambientIdentity: 'from-the-agent',
    });
    const missingArtifact = parseAssetAuthoringReleaseReceipt({
      ...PREVIEW_ACCEPTANCE_RECEIPT,
      artifacts: PREVIEW_ACCEPTANCE_RECEIPT.artifacts.slice(1),
    });

    expect(unknownField.ok).toBe(false);
    if (unknownField.ok) throw new Error('Expected unknown receipt field to fail.');
    expect(unknownField.diagnostics.map((diagnostic) => diagnostic.path)).toContain(
      '$.ambientIdentity',
    );
    expect(missingArtifact.ok).toBe(false);
    if (missingArtifact.ok) throw new Error('Expected incomplete artifact binding to fail.');
    expect(missingArtifact.diagnostics.map((diagnostic) => diagnostic.path)).toContain(
      '$.artifacts',
    );
  });

  it('keeps receipt digests stable across property and evidence ordering', () => {
    const reordered = {
      acknowledgements: {
        recordDigests: [DIGEST_B, DIGEST_C],
        contentDigest: DIGEST_C,
      },
      creditDigests: {
        licenseAuthority: DIGEST_F,
        authorAndSource: DIGEST_E,
      },
      validationReceiptRevision: 'validation-revision-01',
      validationReceiptId: 'validation-01',
      sourceDigests: [
        { digest: DIGEST_D, path: 'sprites/a.png' },
        { digest: DIGEST_C, path: 'sprites/z.png' },
      ],
      manifestDigest: DIGEST_B,
      declarationDigest: DIGEST_A,
      declarant: DECLARATION.declarant,
      recordedAt: '2026-08-04T04:00:00.000Z',
      cliVersion: '0.0.0',
      sessionId: '123e4567-e89b-42d3-a456-426614174000',
      kind: 'declaration',
      schema: ASSET_AUTHORING_RELEASE_RECEIPT_SCHEMA,
    };

    const first = parseAssetAuthoringReleaseReceipt(DECLARATION_RECEIPT);
    const second = parseAssetAuthoringReleaseReceipt(reordered);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error('Expected valid release receipts.');

    expect(assetAuthoringReleaseReceiptProjection(first.receipt))
      .toEqual(assetAuthoringReleaseReceiptProjection(second.receipt));
    expect(assetAuthoringReleaseReceiptDigestInput(first.receipt))
      .toBe(assetAuthoringReleaseReceiptDigestInput(second.receipt));
  });
});

describe('asset authoring release gates', () => {
  it('projects a stable release-ready result from all current checkpoints', () => {
    const input = {
      acknowledgements: 'current',
      validation: 'current',
      releaseDeclaration: 'current',
      preview: 'current',
      previewArtifacts: 'current',
    } as const;
    const reordered = {
      previewArtifacts: 'current',
      preview: 'current',
      releaseDeclaration: 'current',
      validation: 'current',
      acknowledgements: 'current',
    } as const;

    expect(assetAuthoringReleaseGateProjection(input)).toEqual({
      releaseReady: true,
      gates: [
        { id: 'acknowledgements', freshness: 'current' },
        { id: 'validation', freshness: 'current' },
        { id: 'releaseDeclaration', freshness: 'current' },
        { id: 'preview', freshness: 'current' },
        { id: 'previewArtifacts', freshness: 'current' },
      ],
    });
    expect(assetAuthoringReleaseGateProjection(reordered))
      .toEqual(assetAuthoringReleaseGateProjection(input));
    expect(assetAuthoringReleaseGateProjection({ ...input, preview: 'stale' }).releaseReady)
      .toBe(false);
  });
});
