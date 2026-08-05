import { describe, expect, it } from 'vitest';
import type { AssetReleaseProvenanceProjection, AssetReleaseProvenanceReceipt } from '@lpc-toolkit/core';
import {
  encodeAssetReleaseProvenanceProjection,
  encodeAssetReleaseProvenanceReceipt,
} from '../src/index.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const DIGEST_C = `sha256:${'c'.repeat(64)}`;
const DIGEST_D = `sha256:${'d'.repeat(64)}`;
const DIGEST_E = `sha256:${'e'.repeat(64)}`;
const DIGEST_F = `sha256:${'f'.repeat(64)}`;
const DIGEST_G = `sha256:${'9'.repeat(64)}`;
const DIGEST_H = `sha256:${'0'.repeat(64)}`;

const PROJECTION: AssetReleaseProvenanceProjection = {
  pack: { id: 'example-pack', version: '1.2.3' },
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
};

const RECEIPT: AssetReleaseProvenanceReceipt = {
  schema: 'lpc-toolkit.asset-release-provenance.v1',
  projection: PROJECTION,
  projectionDigest: DIGEST_D,
};

const encodeUtf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

describe('release provenance canonical encoding', () => {
  it('encodes equivalent projection property and collection order identically', () => {
    const reordered: AssetReleaseProvenanceProjection = {
      records: [],
      releaseBindings: {
        ...PROJECTION.releaseBindings,
        sourceDigests: [...PROJECTION.releaseBindings.sourceDigests].reverse(),
        previewArtifacts: [...PROJECTION.releaseBindings.previewArtifacts].reverse(),
      },
      pack: { version: '1.2.3', id: 'example-pack' },
    };

    expect(encodeAssetReleaseProvenanceProjection(PROJECTION, encodeUtf8))
      .toEqual(encodeAssetReleaseProvenanceProjection(reordered, encodeUtf8));
  });

  it('encodes the complete receipt as canonical UTF-8 JSON', () => {
    const bytes = encodeAssetReleaseProvenanceReceipt(RECEIPT, encodeUtf8);
    const text = new TextDecoder().decode(bytes);

    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text) as unknown).toEqual(RECEIPT);
    expect(text.indexOf('"projection"')).toBeLessThan(text.indexOf('"projectionDigest"'));
  });

  it('refuses a canonical receipt over the public byte limit', () => {
    const digestFor = (index: number): string =>
      `sha256:${index.toString(16).padStart(64, '0')}`;
    const records = Array.from({ length: 128 }, (_, recordIndex) => ({
      kind: 'provider-output' as const,
      targetId: `target-${recordIndex}`,
      contractDigest: DIGEST_A,
      provider: {
        id: 'provider.example',
        tool: 'sprite-tool',
        model: 'model-v1',
      },
      inputDigests: Array.from({ length: 64 }, (_, index) =>
        digestFor(recordIndex * 128 + index)),
      referenceDigests: Array.from({ length: 64 }, (_, index) =>
        digestFor(16_384 + recordIndex * 128 + index)),
      resultDigest: DIGEST_D,
    }));
    const oversized: AssetReleaseProvenanceReceipt = {
      ...RECEIPT,
      projection: {
        ...RECEIPT.projection,
        records,
      },
    };

    expect(() => encodeAssetReleaseProvenanceReceipt(oversized, encodeUtf8))
      .toThrow('exceeds 262144 bytes');
  });
});
