import { describe, expect, it } from 'vitest';
import {
  ASSET_PROVIDER_RESULT_SCHEMA,
  assetProviderResultToReleaseProvenanceRecord,
} from '../src/index.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const DIGEST_C = `sha256:${'c'.repeat(64)}`;

const VALID_RESULT = {
  schema: ASSET_PROVIDER_RESULT_SCHEMA,
  invocationDigest: DIGEST_A,
  sessionId: '00000000-0000-4000-8000-000000000000',
  contractDigest: DIGEST_A,
  operation: 'sprite-candidate.v1',
  provider: {
    id: 'provider.example',
    adapter: {
      id: 'agent-adapter.example',
      version: '1.0.0',
    },
  },
  targetId: 'sprites/hair/acme/walk.png',
  consentScopeDigest: DIGEST_C,
  inputDigests: [DIGEST_C],
  referenceDigests: [DIGEST_A],
  candidate: {
    id: 'provider.example/00000000-0000-4000-8000-000000000000',
    digest: DIGEST_B,
    byteLength: 1024,
  },
} as const;

describe('provider-neutral D1 projection', () => {
  it('maps a normalized successful result to the existing provider-output record', () => {
    expect(assetProviderResultToReleaseProvenanceRecord(VALID_RESULT)).toEqual({
      ok: true,
      record: {
        kind: 'provider-output',
        targetId: VALID_RESULT.targetId,
        contractDigest: VALID_RESULT.contractDigest,
        provider: {
          id: 'provider.example',
          tool: 'agent-adapter.example',
        },
        inputDigests: [DIGEST_C],
        referenceDigests: [DIGEST_A],
        resultDigest: DIGEST_B,
      },
    });
  });

  it('rejects private or unbounded provider fields before D1 projection', () => {
    const result = assetProviderResultToReleaseProvenanceRecord({
      ...VALID_RESULT,
      rawPrompt: 'paint a sprite',
      provider: {
        ...VALID_RESULT.provider,
        id: '/private/provider',
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected private provider fields to fail.');
    expect(result.diagnostics.map((diagnostic) => diagnostic.path)).toEqual(
      expect.arrayContaining(['$.rawPrompt', '$.provider.id']),
    );
  });
});
