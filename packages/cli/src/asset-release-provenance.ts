import { createHash, randomUUID } from 'node:crypto';
import {
  lstatSync,
  linkSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {
  ASSET_RELEASE_PROVENANCE_SCHEMA,
  assetReleaseProvenanceProjection,
  parseAssetReleaseProvenance,
  type AssetReleaseProvenanceProjection,
  type AssetReleaseProvenanceReceipt,
  type AssetReleaseProvenanceRecord,
} from '@lpc-toolkit/core';
import {
  AssetReleaseProvenanceEncodingError,
  encodeAssetReleaseProvenanceProjection,
  encodeAssetReleaseProvenanceReceipt,
} from '@lpc-toolkit/asset-pack-format';

const ZERO_DIGEST = `sha256:${'0'.repeat(64)}`;

export type AssetReleaseProvenanceFileErrorCode =
  | 'asset_release_provenance_invalid'
  | 'asset_release_provenance_unsupported'
  | 'asset_release_provenance_stale'
  | 'asset_release_provenance_digest_mismatch'
  | 'asset_release_provenance_private_data'
  | 'asset_release_provenance_conflict'
  | 'asset_release_provenance_path_invalid'
  | 'asset_release_provenance_publish_failed'
  | 'asset_release_provenance_limit_exceeded';

export class AssetReleaseProvenanceFileError extends Error {
  readonly code: AssetReleaseProvenanceFileErrorCode;
  readonly path: string | undefined;

  constructor(
    code: AssetReleaseProvenanceFileErrorCode,
    message: string,
    filePath?: string,
  ) {
    super(message);
    this.name = 'AssetReleaseProvenanceFileError';
    this.code = code;
    this.path = filePath;
  }
}

export interface EncodedAssetReleaseProvenance {
  readonly receipt: AssetReleaseProvenanceReceipt;
  readonly bytes: Buffer;
  readonly projectionDigest: string;
  readonly provenanceDigest: string;
}

export interface PublishedAssetReleaseProvenance {
  readonly provenanceDigest: string;
  readonly reusedExistingFile: boolean;
}

export function assetReleaseProvenanceSha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function parseAssetReleaseProvenanceRecords(
  value: unknown,
  projection: AssetReleaseProvenanceProjection,
): readonly AssetReleaseProvenanceRecord[] {
  if (!Array.isArray(value)) {
    throw new AssetReleaseProvenanceFileError(
      'asset_release_provenance_invalid',
      'The provenance records input must be a JSON array.',
    );
  }
  const candidate: AssetReleaseProvenanceReceipt = {
    schema: ASSET_RELEASE_PROVENANCE_SCHEMA,
    projection: {
      ...projection,
      records: value,
    },
    projectionDigest: ZERO_DIGEST,
  } as AssetReleaseProvenanceReceipt;
  const parsed = parseAssetReleaseProvenance(candidate);
  if (!parsed.ok) {
    const diagnostic = parsed.diagnostics[0];
    throw new AssetReleaseProvenanceFileError(
      diagnostic?.code ?? 'asset_release_provenance_invalid',
      diagnostic?.message ?? 'The provenance records input is invalid.',
    );
  }
  return parsed.receipt.projection.records;
}

export function encodeAssetReleaseProvenance(
  projection: AssetReleaseProvenanceProjection,
  encodeUtf8: (text: string) => Uint8Array,
): EncodedAssetReleaseProvenance {
  const normalizedProjection = assetReleaseProvenanceProjection(projection);
  const projectionBytes = encodeAssetReleaseProvenanceProjection(normalizedProjection, encodeUtf8);
  const projectionDigest = assetReleaseProvenanceSha256(projectionBytes);
  const receipt: AssetReleaseProvenanceReceipt = {
    schema: ASSET_RELEASE_PROVENANCE_SCHEMA,
    projection: normalizedProjection,
    projectionDigest,
  };
  let bytes: Uint8Array;
  try {
    bytes = encodeAssetReleaseProvenanceReceipt(receipt, encodeUtf8);
  } catch (error) {
    if (error instanceof AssetReleaseProvenanceEncodingError) {
      throw new AssetReleaseProvenanceFileError(
        error.code,
        error.message,
      );
    }
    throw error;
  }
  const completeBytes = Buffer.from(bytes);
  return {
    receipt,
    bytes: completeBytes,
    projectionDigest,
    provenanceDigest: assetReleaseProvenanceSha256(completeBytes),
  };
}

export function parseAssetReleaseProvenanceBytes(
  bytes: Uint8Array,
): AssetReleaseProvenanceReceipt {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch (error) {
    throw new AssetReleaseProvenanceFileError(
      'asset_release_provenance_invalid',
      `The release provenance receipt is not valid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
  const parsed = parseAssetReleaseProvenance(value);
  if (!parsed.ok) {
    const diagnostic = parsed.diagnostics[0];
    throw new AssetReleaseProvenanceFileError(
      diagnostic?.code ?? 'asset_release_provenance_invalid',
      diagnostic?.message ?? 'The release provenance receipt is invalid.',
    );
  }
  return parsed.receipt;
}

export function publishAssetReleaseProvenance(
  filePath: string,
  bytes: Buffer,
): PublishedAssetReleaseProvenance {
  const expectedDigest = assetReleaseProvenanceSha256(bytes);
  const existing = lstatSync(filePath, { throwIfNoEntry: false });
  if (existing !== undefined) {
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new AssetReleaseProvenanceFileError(
        'asset_release_provenance_path_invalid',
        `Release provenance output must be a regular file: ${filePath}.`,
        filePath,
      );
    }
    const existingBytes = readFileSync(filePath);
    if (assetReleaseProvenanceSha256(existingBytes) === expectedDigest) {
      return { provenanceDigest: expectedDigest, reusedExistingFile: true };
    }
    throw new AssetReleaseProvenanceFileError(
      'asset_release_provenance_conflict',
      `Release provenance output already contains different bytes: ${filePath}.`,
      filePath,
    );
  }

  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, bytes, { flag: 'wx', mode: 0o600 });
    const writtenBytes = readFileSync(temporaryPath);
    if (assetReleaseProvenanceSha256(writtenBytes) !== expectedDigest) {
      throw new AssetReleaseProvenanceFileError(
        'asset_release_provenance_publish_failed',
        `Release provenance temporary bytes did not match the generated digest: ${filePath}.`,
        filePath,
      );
    }
    linkSync(temporaryPath, filePath);
    return { provenanceDigest: expectedDigest, reusedExistingFile: false };
  } catch (error) {
    if (error instanceof AssetReleaseProvenanceFileError) throw error;
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      const raced = lstatSync(filePath, { throwIfNoEntry: false });
      if (raced?.isFile() && !raced.isSymbolicLink()) {
        const racedBytes = readFileSync(filePath);
        if (assetReleaseProvenanceSha256(racedBytes) === expectedDigest) {
          return { provenanceDigest: expectedDigest, reusedExistingFile: true };
        }
      }
      throw new AssetReleaseProvenanceFileError(
        'asset_release_provenance_conflict',
        `Release provenance output already contains different bytes: ${filePath}.`,
        filePath,
      );
    }
    throw new AssetReleaseProvenanceFileError(
      'asset_release_provenance_publish_failed',
      `Could not publish release provenance: ${error instanceof Error ? error.message : String(error)}.`,
      filePath,
    );
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}
