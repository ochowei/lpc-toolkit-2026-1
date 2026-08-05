import { describe, expect, it } from 'vitest';
import {
  ASSET_RELEASE_PROVENANCE_SCHEMA,
  assetReleaseProvenanceProjection,
  assetReleaseProvenanceProjectionDigestInput,
  parseAssetReleaseProvenance,
} from '../src/index.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const DIGEST_C = `sha256:${'c'.repeat(64)}`;
const DIGEST_D = `sha256:${'d'.repeat(64)}`;
const DIGEST_E = `sha256:${'e'.repeat(64)}`;
const DIGEST_F = `sha256:${'f'.repeat(64)}`;
const DIGEST_G = `sha256:${'9'.repeat(64)}`;
const DIGEST_H = `sha256:${'0'.repeat(64)}`;

const VALID_RECEIPT = {
  schema: ASSET_RELEASE_PROVENANCE_SCHEMA,
  projection: {
    pack: {
      id: 'example-pack',
      version: '1.2.3',
    },
    releaseBindings: {
      archiveDigest: DIGEST_A,
      manifestDigest: DIGEST_B,
      contentDigest: DIGEST_C,
      sourceDigests: [
        { path: 'sprites/a.png', digest: DIGEST_D },
        { path: 'sprites/z.png', digest: DIGEST_E },
      ],
      releaseDeclarationReceiptDigest: DIGEST_F,
      previewAcceptanceReceiptDigest: DIGEST_G,
      previewArtifacts: [
        { id: 'preview:credits_csv', digest: DIGEST_C },
        { id: 'preview:credits_txt', digest: DIGEST_B },
        { id: 'preview:metadata', digest: DIGEST_A },
        { id: 'preview:preview', digest: DIGEST_H },
      ],
    },
    records: [],
  },
  projectionDigest: DIGEST_D,
} as const;

function receiptWithRecords(records: readonly unknown[]): Record<string, unknown> {
  return {
    ...VALID_RECEIPT,
    projection: {
      ...VALID_RECEIPT.projection,
      records,
    },
  };
}

describe('asset release provenance schema', () => {
  it('parses a release-bound v1 receipt with no generation records', () => {
    const result = parseAssetReleaseProvenance(VALID_RECEIPT);

    expect(result).toEqual({
      ok: true,
      receipt: VALID_RECEIPT,
    });
  });

  it('rejects unknown fields at the receipt boundary', () => {
    const result = parseAssetReleaseProvenance({
      ...VALID_RECEIPT,
      unexpected: 'ambient-provider-payload',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected unknown receipt field to fail.');
    expect(result.diagnostics.map((diagnostic) => diagnostic.path)).toContain(
      '$.unexpected',
    );
  });

  it('reports an unsupported receipt schema distinctly from malformed fields', () => {
    const result = parseAssetReleaseProvenance({
      ...VALID_RECEIPT,
      schema: 'lpc-toolkit.asset-release-provenance.v2',
    });

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        code: 'asset_release_provenance_unsupported',
        path: '$.schema',
        message: 'Unsupported release provenance schema.',
      }],
    });
  });

  it('rejects nested unknown fields and malformed release bindings', () => {
    const unknownField = parseAssetReleaseProvenance({
      ...VALID_RECEIPT,
      projection: {
        ...VALID_RECEIPT.projection,
        releaseBindings: {
          ...VALID_RECEIPT.projection.releaseBindings,
          privatePayload: 'raw-provider-response',
        },
      },
    });
    const malformedDigest = parseAssetReleaseProvenance({
      ...VALID_RECEIPT,
      projection: {
        ...VALID_RECEIPT.projection,
        pack: { id: '', version: 'not-a-version' },
        releaseBindings: {
          ...VALID_RECEIPT.projection.releaseBindings,
          archiveDigest: 'sha256:not-a-digest',
        },
      },
    });

    expect(unknownField.ok).toBe(false);
    if (unknownField.ok) throw new Error('Expected nested unknown field to fail.');
    expect(unknownField.diagnostics.map((diagnostic) => diagnostic.path)).toContain(
      '$.projection.releaseBindings.privatePayload',
    );

    expect(malformedDigest.ok).toBe(false);
    if (malformedDigest.ok) throw new Error('Expected malformed binding to fail.');
    expect(malformedDigest.diagnostics.map((diagnostic) => diagnostic.path)).toEqual(
      expect.arrayContaining([
        '$.projection.pack.id',
        '$.projection.pack.version',
        '$.projection.releaseBindings.archiveDigest',
      ]),
    );
  });

  it('accepts provider, external-input, and source-transformation records', () => {
    const provider = {
      kind: 'provider-output',
      targetId: 'item-animation-layer',
      contractDigest: DIGEST_A,
      provider: {
        id: 'provider.example',
        tool: 'sprite-tool',
        model: 'model-v1',
      },
      inputDigests: [DIGEST_B],
      referenceDigests: [DIGEST_C],
      promptDigest: DIGEST_E,
      resultDigest: DIGEST_D,
    };
    const external = {
      kind: 'external-input',
      targetId: 'item-animation-layer',
      contractDigest: DIGEST_A,
      referenceDigests: [DIGEST_C],
      resultDigest: DIGEST_E,
    };
    const transformation = {
      kind: 'source-transformation',
      targetId: 'item-animation-layer',
      contractDigest: DIGEST_A,
      inputDigests: [DIGEST_D],
      referenceDigests: [DIGEST_C],
      operation: 'format-conversion',
      resultDigest: DIGEST_E,
    };

    for (const record of [provider, external, transformation]) {
      const result = parseAssetReleaseProvenance(receiptWithRecords([record]));
      expect(result.ok).toBe(true);
    }
  });

  it('accepts a transformation result through a source-bound predecessor', () => {
    const result = parseAssetReleaseProvenance(receiptWithRecords([{
      kind: 'source-transformation',
      targetId: 'item-animation-layer',
      inputDigests: [DIGEST_D],
      operation: 'manual-edit',
      resultDigest: DIGEST_F,
    }]));

    expect(result.ok).toBe(true);
  });

  it('rejects unsupported operations and unbound result digests', () => {
    const unsupportedOperation = parseAssetReleaseProvenance(receiptWithRecords([{
      kind: 'source-transformation',
      targetId: 'item-animation-layer',
      inputDigests: [DIGEST_D],
      operation: 'run-provider-command',
      resultDigest: DIGEST_F,
    }]));
    const unboundResult = parseAssetReleaseProvenance(receiptWithRecords([{
      kind: 'external-input',
      targetId: 'item-animation-layer',
      resultDigest: DIGEST_F,
    }]));

    expect(unsupportedOperation.ok).toBe(false);
    if (unsupportedOperation.ok) throw new Error('Expected unsupported operation to fail.');
    expect(unsupportedOperation.diagnostics.map((diagnostic) => diagnostic.path)).toContain(
      '$.projection.records[0].operation',
    );

    expect(unboundResult.ok).toBe(false);
    if (unboundResult.ok) throw new Error('Expected unbound result to fail.');
    expect(unboundResult.diagnostics.map((diagnostic) => diagnostic.path)).toContain(
      '$.projection.records',
    );
  });

  it('normalizes projection ordering and keeps digest input stable', () => {
    const reordered = {
      records: [],
      releaseBindings: {
        ...VALID_RECEIPT.projection.releaseBindings,
        sourceDigests: [...VALID_RECEIPT.projection.releaseBindings.sourceDigests].reverse(),
        previewArtifacts: [...VALID_RECEIPT.projection.releaseBindings.previewArtifacts].reverse(),
      },
      pack: {
        version: VALID_RECEIPT.projection.pack.version,
        id: VALID_RECEIPT.projection.pack.id,
      },
    };

    expect(assetReleaseProvenanceProjection(reordered))
      .toEqual(assetReleaseProvenanceProjection(VALID_RECEIPT.projection));
    expect(assetReleaseProvenanceProjectionDigestInput(reordered))
      .toBe(assetReleaseProvenanceProjectionDigestInput(VALID_RECEIPT.projection));
  });

  it('rejects a receipt whose release arrays are not canonically ordered', () => {
    const result = parseAssetReleaseProvenance({
      ...VALID_RECEIPT,
      projection: {
        ...VALID_RECEIPT.projection,
        releaseBindings: {
          ...VALID_RECEIPT.projection.releaseBindings,
          sourceDigests: [...VALID_RECEIPT.projection.releaseBindings.sourceDigests].reverse(),
        },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected unsorted source evidence to fail.');
    expect(result.diagnostics.map((diagnostic) => diagnostic.path)).toContain(
      '$.projection.releaseBindings.sourceDigests',
    );
  });

  it('sorts records by canonical UTF-8 record bytes and rejects unsorted receipts', () => {
    const records = [
      {
        kind: 'external-input',
        targetId: 'z-target',
        resultDigest: DIGEST_E,
      },
      {
        kind: 'external-input',
        targetId: 'a-target',
        resultDigest: DIGEST_D,
      },
    ] as const;
    const normalized = assetReleaseProvenanceProjection({
      ...VALID_RECEIPT.projection,
      records,
    });
    const result = parseAssetReleaseProvenance(receiptWithRecords(
      [...normalized.records].reverse(),
    ));

    expect(normalized.records.map((record) => record.targetId)).toEqual([
      'a-target',
      'z-target',
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected unsorted records to fail.');
    expect(result.diagnostics.map((diagnostic) => diagnostic.path)).toContain(
      '$.projection.records',
    );
  });

  it('rejects private provider values, raw prompt payloads, and resource-limit overflow', () => {
    const privateProvider = parseAssetReleaseProvenance(receiptWithRecords([{
      kind: 'provider-output',
      targetId: 'item-animation-layer',
      contractDigest: DIGEST_A,
      provider: {
        id: 'https://provider.example/private?token=secret',
        tool: 'sprite-tool',
      },
      promptDigest: 'raw prompt text',
      resultDigest: DIGEST_D,
    }]));
    const tooManyReferences = Array.from(
      { length: 65 },
      (_, index) => `sha256:${index.toString(16).padStart(2, '0')}${'0'.repeat(62)}`,
    );
    const oversizedRecord = parseAssetReleaseProvenance(receiptWithRecords([{
      kind: 'provider-output',
      targetId: 't'.repeat(257),
      contractDigest: DIGEST_A,
      provider: {
        id: 'provider.example',
        tool: 'sprite-tool',
      },
      referenceDigests: tooManyReferences,
      resultDigest: DIGEST_D,
    }]));

    expect(privateProvider.ok).toBe(false);
    if (privateProvider.ok) throw new Error('Expected private provider data to fail.');
    expect(privateProvider.diagnostics.map((diagnostic) => diagnostic.path)).toEqual(
      expect.arrayContaining([
        '$.projection.records[0].provider.id',
        '$.projection.records[0].promptDigest',
      ]),
    );

    expect(oversizedRecord.ok).toBe(false);
    if (oversizedRecord.ok) throw new Error('Expected oversized record to fail.');
    expect(oversizedRecord.diagnostics.map((diagnostic) => diagnostic.path)).toEqual(
      expect.arrayContaining([
        '$.projection.records[0].targetId',
        '$.projection.records[0].referenceDigests',
      ]),
    );
  });

  it('rejects duplicate logical records and empty transformation predecessors', () => {
    const duplicate = {
      kind: 'external-input' as const,
      targetId: 'item-animation-layer',
      resultDigest: DIGEST_D,
    };
    const duplicateResult = parseAssetReleaseProvenance(receiptWithRecords([
      duplicate,
      duplicate,
    ]));
    const emptyInputsResult = parseAssetReleaseProvenance(receiptWithRecords([{
      kind: 'source-transformation',
      targetId: 'item-animation-layer',
      inputDigests: [],
      operation: 'crop',
      resultDigest: DIGEST_D,
    }]));

    expect(duplicateResult.ok).toBe(false);
    if (duplicateResult.ok) throw new Error('Expected duplicate records to fail.');
    expect(duplicateResult.diagnostics.map((diagnostic) => diagnostic.path)).toContain(
      '$.projection.records',
    );

    expect(emptyInputsResult.ok).toBe(false);
    if (emptyInputsResult.ok) throw new Error('Expected empty predecessors to fail.');
    expect(emptyInputsResult.diagnostics.map((diagnostic) => diagnostic.path)).toContain(
      '$.projection.records[0].inputDigests',
    );
  });
});
