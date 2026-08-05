import {
  assetReleaseProvenanceProjection,
  type AssetReleaseProvenanceProjection,
  type AssetReleaseProvenanceReceipt,
} from '@lpc-toolkit/core';
import { encodeCanonicalJson } from './canonical-json.js';

export const ASSET_RELEASE_PROVENANCE_MAX_BYTES = 256 * 1024;

export class AssetReleaseProvenanceEncodingError extends Error {
  readonly code = 'asset_release_provenance_limit_exceeded' as const;

  constructor(message: string) {
    super(message);
    this.name = 'AssetReleaseProvenanceEncodingError';
  }
}

export function encodeAssetReleaseProvenanceProjection(
  projection: AssetReleaseProvenanceProjection,
  encodeUtf8: (text: string) => Uint8Array,
): Uint8Array {
  return encodeCanonicalJson(
    assetReleaseProvenanceProjection(projection),
    encodeUtf8,
  );
}

export function encodeAssetReleaseProvenanceReceipt(
  receipt: AssetReleaseProvenanceReceipt,
  encodeUtf8: (text: string) => Uint8Array,
): Uint8Array {
  const bytes = encodeCanonicalJson(
    {
      schema: receipt.schema,
      projection: assetReleaseProvenanceProjection(receipt.projection),
      projectionDigest: receipt.projectionDigest,
    },
    encodeUtf8,
  );
  if (bytes.byteLength > ASSET_RELEASE_PROVENANCE_MAX_BYTES) {
    throw new AssetReleaseProvenanceEncodingError(
      `Release provenance receipt exceeds ${ASSET_RELEASE_PROVENANCE_MAX_BYTES} bytes.`,
    );
  }
  return bytes;
}
