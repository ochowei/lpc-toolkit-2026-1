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
import { inspectAssetPackArchive } from './asset-pack-inspection.js';
import type { RuntimeAssets } from './runtime-assets.js';

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

export interface AssetReleaseProvenanceVerificationData {
  readonly schema: 'lpc-toolkit.asset-release-provenance-verification.v1';
  readonly verified: true;
  readonly archivePath: string;
  readonly provenancePath: string;
  readonly provenanceDigest: string;
  readonly projectionDigest: string;
  readonly packId: string;
  readonly version: string;
  readonly archiveDigest: string;
  readonly manifestDigest: string;
  readonly contentDigest: string;
  readonly sourceDigests: readonly { readonly path: string; readonly digest: string }[];
  readonly recordCount: number;
  readonly releaseDeclarationReceiptDigest: string;
  readonly previewAcceptanceReceiptDigest: string;
  readonly previewArtifacts: readonly { readonly id: string; readonly digest: string }[];
  readonly humanEvidence: {
    readonly releaseDeclarationReceiptRecreated: false;
    readonly previewAcceptanceReceiptRecreated: false;
  };
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

function sourceDigestBindings(
  entries: ReadonlyMap<string, string>,
): readonly { readonly path: string; readonly digest: string }[] {
  return [...entries]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, digest]) => ({ path, digest }));
}

function sameDigestBindings(
  left: readonly { readonly path: string; readonly digest: string }[],
  right: readonly { readonly path: string; readonly digest: string }[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    return other !== undefined && entry.path === other.path && entry.digest === other.digest;
  });
}

function requireRegularProvenanceFile(filePath: string): Buffer {
  let stats: ReturnType<typeof lstatSync> | undefined;
  try {
    stats = lstatSync(filePath, { throwIfNoEntry: false });
  } catch (error) {
    throw new AssetReleaseProvenanceFileError(
      'asset_release_provenance_invalid',
      `Release provenance receipt could not be inspected: ${error instanceof Error ? error.message : String(error)}.`,
      filePath,
    );
  }
  if (stats === undefined || stats.isSymbolicLink() || !stats.isFile()) {
    throw new AssetReleaseProvenanceFileError(
      'asset_release_provenance_invalid',
      `Release provenance receipt must be a regular file: ${filePath}.`,
      filePath,
    );
  }
  try {
    return readFileSync(filePath);
  } catch (error) {
    throw new AssetReleaseProvenanceFileError(
      'asset_release_provenance_invalid',
      `Release provenance receipt could not be read: ${error instanceof Error ? error.message : String(error)}.`,
      filePath,
    );
  }
}

function verificationMismatch(
  message: string,
  archivePath: string,
): never {
  throw new AssetReleaseProvenanceFileError(
    'asset_release_provenance_digest_mismatch',
    message,
    archivePath,
  );
}

function verificationStale(
  message: string,
  provenancePath: string,
): never {
  throw new AssetReleaseProvenanceFileError(
    'asset_release_provenance_stale',
    message,
    provenancePath,
  );
}

export async function verifyAssetReleaseProvenance(options: {
  readonly archivePath: string;
  readonly provenancePath: string;
  readonly runtime: RuntimeAssets;
}): Promise<AssetReleaseProvenanceVerificationData> {
  const provenanceBytes = requireRegularProvenanceFile(options.provenancePath);
  const receipt = parseAssetReleaseProvenanceBytes(provenanceBytes);
  const encoded = encodeAssetReleaseProvenance(
    receipt.projection,
    (value) => new TextEncoder().encode(value),
  );
  if (encoded.projectionDigest !== receipt.projectionDigest) {
    throw new AssetReleaseProvenanceFileError(
      'asset_release_provenance_digest_mismatch',
      'The release provenance projection digest does not match its canonical projection.',
      options.provenancePath,
    );
  }
  if (!Buffer.from(encoded.bytes).equals(provenanceBytes)) {
    throw new AssetReleaseProvenanceFileError(
      'asset_release_provenance_invalid',
      'The release provenance receipt is not encoded as canonical UTF-8 JSON.',
      options.provenancePath,
    );
  }

  const inspected = await inspectAssetPackArchive({
    archivePath: options.archivePath,
    runtime: options.runtime,
  });
  if (!inspected.report.valid || inspected.snapshot === undefined) {
    const diagnostic = inspected.report.diagnostics[0];
    throw new AssetReleaseProvenanceFileError(
      'asset_release_provenance_invalid',
      diagnostic?.message ?? 'The formal archive is not a valid installable asset pack.',
      diagnostic?.path ?? options.archivePath,
    );
  }

  const snapshot = inspected.snapshot;
  const bindings = receipt.projection.releaseBindings;
  if (receipt.projection.pack.id !== snapshot.payload.pack.id) {
    verificationStale(
      `The provenance pack id ${receipt.projection.pack.id} does not match the archive pack id ${snapshot.payload.pack.id}.`,
      options.provenancePath,
    );
  }
  if (receipt.projection.pack.version !== snapshot.payload.pack.version) {
    verificationStale(
      `The provenance version ${receipt.projection.pack.version} does not match the archive version ${snapshot.payload.pack.version}.`,
      options.provenancePath,
    );
  }
  const manifestDigest = assetReleaseProvenanceSha256(snapshot.manifestBytes);
  const sourceDigests = sourceDigestBindings(snapshot.payload.sourceDigests);
  if (bindings.archiveDigest !== snapshot.archiveDigest) {
    verificationMismatch('The provenance archive digest does not match the exact archive bytes.', options.archivePath);
  }
  if (bindings.manifestDigest !== manifestDigest) {
    verificationMismatch('The provenance manifest digest does not match the archive manifest bytes.', options.archivePath);
  }
  if (bindings.contentDigest !== snapshot.payload.contentDigest) {
    verificationMismatch('The provenance content digest does not match the archive content projection.', options.archivePath);
  }
  if (!sameDigestBindings(bindings.sourceDigests, sourceDigests)) {
    verificationMismatch('The provenance source digest set does not match the archive source bytes.', options.archivePath);
  }

  return {
    schema: 'lpc-toolkit.asset-release-provenance-verification.v1',
    verified: true,
    archivePath: options.archivePath,
    provenancePath: options.provenancePath,
    provenanceDigest: assetReleaseProvenanceSha256(provenanceBytes),
    projectionDigest: receipt.projectionDigest,
    packId: snapshot.payload.pack.id,
    version: snapshot.payload.pack.version,
    archiveDigest: snapshot.archiveDigest,
    manifestDigest,
    contentDigest: snapshot.payload.contentDigest,
    sourceDigests,
    recordCount: receipt.projection.records.length,
    releaseDeclarationReceiptDigest: bindings.releaseDeclarationReceiptDigest,
    previewAcceptanceReceiptDigest: bindings.previewAcceptanceReceiptDigest,
    previewArtifacts: [...bindings.previewArtifacts],
    humanEvidence: {
      releaseDeclarationReceiptRecreated: false,
      previewAcceptanceReceiptRecreated: false,
    },
  };
}
