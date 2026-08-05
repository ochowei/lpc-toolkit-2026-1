import type {
  AssetReleaseProvenanceProviderOutput,
} from './asset-release-provenance-schema.js';
import {
  parseAssetProviderResult,
  type AssetProviderDiagnostic,
} from './asset-provider-schema.js';

export type AssetProviderProvenanceProjectionResult =
  | {
    readonly ok: true;
    readonly record: AssetReleaseProvenanceProviderOutput;
  }
  | {
    readonly ok: false;
    readonly diagnostics: readonly AssetProviderDiagnostic[];
  };

/**
 * Projects only the bounded, digest-based part of a successful D2 result into
 * the existing D1 provider-output record. Provider identity is metadata, not
 * attribution or human approval evidence.
 */
export function assetProviderResultToReleaseProvenanceRecord(
  value: unknown,
): AssetProviderProvenanceProjectionResult {
  const parsed = parseAssetProviderResult(value);
  if (!parsed.ok) return parsed;
  const result = parsed.result;
  return {
    ok: true,
    record: {
      kind: 'provider-output',
      targetId: result.targetId,
      contractDigest: result.contractDigest,
      provider: {
        id: result.provider.id,
        tool: result.provider.adapter.id,
      },
      ...(result.inputDigests === undefined ? {} : { inputDigests: result.inputDigests }),
      ...(result.referenceDigests === undefined
        ? {}
        : { referenceDigests: result.referenceDigests }),
      resultDigest: result.candidate.digest,
    },
  };
}
