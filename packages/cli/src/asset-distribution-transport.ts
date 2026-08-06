import { createHash } from 'node:crypto';
import type {
  AssetDistributionRelease,
  AssetDistributionReleaseParseResult,
} from '@lpc-toolkit/core';
import { parseAssetDistributionRelease } from '@lpc-toolkit/core';

export const ASSET_DISTRIBUTION_REGISTRY_CAPTURE_SCHEMA =
  'lpc-toolkit.asset-distribution-registry-capture.v1' as const;
export const ASSET_DISTRIBUTION_MARKETPLACE_LISTING_SCHEMA =
  'lpc-toolkit.asset-distribution-marketplace-listing.v1' as const;

export type AssetDistributionRegistryAvailability = 'available' | 'withdrawn' | 'not-found';

export interface AssetDistributionTransportDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AssetDistributionRegistryFetchRequest {
  readonly namespace: string;
  readonly packId: string;
  readonly version: string;
  readonly archiveDigest?: string;
}

export interface AssetDistributionRegistryTransportObservation {
  readonly sourceId: string;
  readonly statusCode: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface AssetDistributionRegistryFetchResponse {
  readonly record: unknown;
  readonly archiveBytes: Buffer;
  readonly availability: AssetDistributionRegistryAvailability;
  readonly transport: AssetDistributionRegistryTransportObservation;
  readonly observedAt: string;
}

export interface AssetDistributionRegistryAdapter {
  fetch(request: AssetDistributionRegistryFetchRequest): Promise<AssetDistributionRegistryFetchResponse>;
}

export interface AssetDistributionRegistryCapture {
  readonly schema: typeof ASSET_DISTRIBUTION_REGISTRY_CAPTURE_SCHEMA;
  readonly identityKey: string;
  readonly release: AssetDistributionRelease;
  readonly archiveBytes: Buffer;
  readonly recordDigest: string;
  readonly archiveDigest: string;
  readonly byteLength: number;
  readonly availability: Exclude<AssetDistributionRegistryAvailability, 'not-found'>;
  readonly transport: AssetDistributionRegistryTransportObservation;
  readonly observedAt: string;
}

export type AssetDistributionRegistryCaptureResult =
  | { readonly ok: true; readonly capture: AssetDistributionRegistryCapture }
  | { readonly ok: false; readonly diagnostics: readonly AssetDistributionTransportDiagnostic[] };

export interface AssetDistributionRegistryFixtureEntry {
  readonly request: AssetDistributionRegistryFetchRequest;
  readonly response: AssetDistributionRegistryFetchResponse;
}

export interface AssetDistributionRegistryConsistencyResult {
  readonly ok: boolean;
  readonly diagnostics: readonly AssetDistributionTransportDiagnostic[];
}

export interface AssetDistributionMarketplaceListing {
  readonly schema: typeof ASSET_DISTRIBUTION_MARKETPLACE_LISTING_SCHEMA;
  readonly listingId: string;
  readonly namespace: string;
  readonly packId: string;
  readonly version: string;
  readonly archiveDigest: string;
  readonly recordDigest: string;
  readonly status: 'listed' | 'withdrawn';
}

export type AssetDistributionMarketplaceListingParseResult =
  | { readonly ok: true; readonly listing: AssetDistributionMarketplaceListing }
  | { readonly ok: false; readonly diagnostics: readonly AssetDistributionTransportDiagnostic[] };

export interface AssetDistributionMarketplaceAdapter {
  fetchListing(input: {
    readonly listingId: string;
  }): Promise<
    | { readonly ok: true; readonly listing: unknown; readonly sourceId: string }
    | { readonly ok: false; readonly diagnostics: readonly AssetDistributionTransportDiagnostic[] }
  >;
}

export type AssetDistributionMarketplaceFixtureEntry = AssetDistributionMarketplaceListing;

export type AssetDistributionMarketplaceVerificationResult =
  | { readonly ok: true; readonly listing: AssetDistributionMarketplaceListing }
  | { readonly ok: false; readonly diagnostics: readonly AssetDistributionTransportDiagnostic[] };

type JsonRecord = Readonly<Record<string, unknown>>;

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const IDENTIFIER_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;
const PACK_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_TRANSPORT_METADATA = 16;
const MAX_TRANSPORT_STRING = 256;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(code: string, message: string, details?: Readonly<Record<string, unknown>>): AssetDistributionTransportDiagnostic {
  return { code, message, ...(details === undefined ? {} : { details }) };
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort(compareCodeUnits)
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function canonicalReleaseRecordInput(release: AssetDistributionRelease): string {
  return JSON.stringify(canonicalize({
    authorization: release.authorization,
    release: release.release,
    schema: release.schema,
    signature: release.signature,
  }));
}

export function assetDistributionRegistryRecordDigestInput(
  release: AssetDistributionRelease,
): string {
  return canonicalReleaseRecordInput(release);
}

export function assetDistributionRegistryRecordDigest(
  release: AssetDistributionRelease,
): string {
  return sha256(Buffer.from(canonicalReleaseRecordInput(release), 'utf8'));
}

function stringField(
  record: JsonRecord,
  key: string,
  pattern?: RegExp,
): string | undefined {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) return undefined;
  if (value.length > MAX_TRANSPORT_STRING || (pattern !== undefined && !pattern.test(value))) return undefined;
  return value;
}

function digestField(record: JsonRecord, key: string): string | undefined {
  const value = stringField(record, key);
  return value !== undefined && DIGEST_PATTERN.test(value) ? value : undefined;
}

function exactKeys(
  record: JsonRecord,
  expected: readonly string[],
  path: string,
): readonly AssetDistributionTransportDiagnostic[] {
  const expectedSet = new Set(expected);
  return Object.keys(record)
    .filter((key) => !expectedSet.has(key))
    .map((key) => invalid(
      'asset_distribution_listing_unknown_field',
      `Unknown field at ${path}.${key}.`,
      { path: `${path}.${key}` },
    ));
}

function safeTransportObservation(
  observation: AssetDistributionRegistryTransportObservation,
): readonly AssetDistributionTransportDiagnostic[] {
  const diagnostics: AssetDistributionTransportDiagnostic[] = [];
  if (
    !IDENTIFIER_PATTERN.test(observation.sourceId)
    || observation.sourceId.length > MAX_TRANSPORT_STRING
  ) {
    diagnostics.push(invalid(
      'asset_distribution_transport_invalid',
      'Transport sourceId must be a bounded normalized fixture identifier.',
    ));
  }
  if (!Number.isInteger(observation.statusCode) || observation.statusCode < 100 || observation.statusCode > 599) {
    diagnostics.push(invalid(
      'asset_distribution_transport_invalid',
      'Transport statusCode must be an HTTP-like integer between 100 and 599.',
    ));
  }
  const metadata = observation.metadata;
  if (metadata !== undefined) {
    const entries = Object.entries(metadata);
    if (entries.length > MAX_TRANSPORT_METADATA) {
      diagnostics.push(invalid(
        'asset_distribution_transport_invalid',
        `Transport metadata cannot contain more than ${MAX_TRANSPORT_METADATA} fields.`,
      ));
    }
    for (const [key, value] of entries) {
      if (
        !IDENTIFIER_PATTERN.test(key)
        || key.length > MAX_TRANSPORT_STRING
        || value.length === 0
        || value.length > MAX_TRANSPORT_STRING
        || value.includes('\u0000')
        || /(?:bearer|api[_-]?key|password|cookie|secret|token)\s*[:=]/iu.test(value)
        || value.startsWith('/')
        || value.startsWith('~')
        || /^[A-Za-z]:[\\/]/u.test(value)
        || value.includes('://')
      ) {
        diagnostics.push(invalid(
          'asset_distribution_transport_private_data',
          `Transport metadata ${key} contains a credential, private path, or URL.`,
          { path: `transport.metadata.${key}` },
        ));
      }
    }
  }
  return diagnostics;
}

function captureIdentityKey(release: AssetDistributionRelease): string {
  return `${release.release.namespace}/${release.release.packId}@${release.release.version}#${release.release.archiveDigest}`;
}

function releaseParseDiagnostics(
  result: AssetDistributionReleaseParseResult,
): readonly AssetDistributionTransportDiagnostic[] {
  if (result.ok) return [];
  return result.diagnostics.map((diagnostic) => invalid(
    'asset_distribution_record_invalid',
    diagnostic.message,
    { path: diagnostic.path, code: diagnostic.code },
  ));
}

export function captureAssetDistributionRegistryResponse(input: {
  readonly request: AssetDistributionRegistryFetchRequest;
  readonly response: AssetDistributionRegistryFetchResponse;
}): AssetDistributionRegistryCaptureResult {
  const { request, response } = input;
  const transportDiagnostics = safeTransportObservation(response.transport);
  if (transportDiagnostics.length > 0) return { ok: false, diagnostics: transportDiagnostics };
  if (
    response.availability !== 'available'
    && response.availability !== 'withdrawn'
    && response.availability !== 'not-found'
  ) {
    return {
      ok: false,
      diagnostics: [invalid(
        'asset_distribution_transport_invalid',
        'Registry availability must be available, withdrawn, or not-found.',
      )],
    };
  }
  if (!ISO_DATE_PATTERN.test(response.observedAt)) {
    return {
      ok: false,
      diagnostics: [invalid(
        'asset_distribution_transport_invalid',
        'observedAt must be a UTC ISO-8601 timestamp.',
      )],
    };
  }
  if (response.availability === 'not-found') {
    return {
      ok: false,
      diagnostics: [invalid(
        'asset_distribution_registry_not_found',
        'The registry fixture did not return an immutable release record.',
      )],
    };
  }
  if (!Buffer.isBuffer(response.archiveBytes) || response.archiveBytes.byteLength === 0) {
    return {
      ok: false,
      diagnostics: [invalid(
        'asset_distribution_archive_missing',
        'The registry response must contain exact non-empty archive bytes.',
      )],
    };
  }
  const parsed = parseAssetDistributionRelease(response.record);
  const parseDiagnostics = releaseParseDiagnostics(parsed);
  if (parseDiagnostics.length > 0 || !parsed.ok) {
    return { ok: false, diagnostics: parseDiagnostics };
  }
  const release = parsed.release;
  if (
    release.release.namespace !== request.namespace
    || release.release.packId !== request.packId
    || release.release.version !== request.version
  ) {
    return {
      ok: false,
      diagnostics: [invalid(
        'asset_distribution_identity_mismatch',
        'Registry record identity does not match the explicit fetch request.',
        {
          requested: `${request.namespace}/${request.packId}@${request.version}`,
          received: `${release.release.namespace}/${release.release.packId}@${release.release.version}`,
        },
      )],
    };
  }
  if (request.archiveDigest !== undefined && request.archiveDigest !== release.release.archiveDigest) {
    return {
      ok: false,
      diagnostics: [invalid(
        'asset_distribution_archive_digest_mismatch',
        'Registry record archive digest does not match the explicit fetch request.',
        { requested: request.archiveDigest, received: release.release.archiveDigest },
      )],
    };
  }
  const observedArchiveDigest = sha256(response.archiveBytes);
  if (observedArchiveDigest !== release.release.archiveDigest) {
    return {
      ok: false,
      diagnostics: [invalid(
        'asset_distribution_archive_digest_mismatch',
        'Fetched archive bytes do not match the immutable release archive digest.',
        { expected: release.release.archiveDigest, observed: observedArchiveDigest },
      )],
    };
  }
  if (response.archiveBytes.byteLength !== release.release.byteLength) {
    return {
      ok: false,
      diagnostics: [invalid(
        'asset_distribution_archive_length_mismatch',
        'Fetched archive byte length does not match the immutable release record.',
        { expected: release.release.byteLength, observed: response.archiveBytes.byteLength },
      )],
    };
  }
  return {
    ok: true,
    capture: {
      schema: ASSET_DISTRIBUTION_REGISTRY_CAPTURE_SCHEMA,
      identityKey: captureIdentityKey(release),
      release,
      archiveBytes: Buffer.from(response.archiveBytes),
      recordDigest: assetDistributionRegistryRecordDigest(release),
      archiveDigest: observedArchiveDigest,
      byteLength: response.archiveBytes.byteLength,
      availability: response.availability,
      transport: response.transport,
      observedAt: response.observedAt,
    },
  };
}

export async function fetchAssetDistributionRegistryRelease(input: {
  readonly adapter: AssetDistributionRegistryAdapter;
  readonly request: AssetDistributionRegistryFetchRequest;
}): Promise<AssetDistributionRegistryCaptureResult> {
  const response = await input.adapter.fetch(input.request);
  return captureAssetDistributionRegistryResponse({ request: input.request, response });
}

function sameVersionKey(capture: AssetDistributionRegistryCapture): string {
  const { namespace, packId, version } = capture.release.release;
  return `${namespace}/${packId}@${version}`;
}

export function compareAssetDistributionRegistryCaptures(
  captures: readonly AssetDistributionRegistryCapture[],
): AssetDistributionRegistryConsistencyResult {
  const diagnostics: AssetDistributionTransportDiagnostic[] = [];
  const byVersion = new Map<string, AssetDistributionRegistryCapture[]>();
  for (const capture of captures) {
    const existing = byVersion.get(sameVersionKey(capture)) ?? [];
    existing.push(capture);
    byVersion.set(sameVersionKey(capture), existing);
  }
  for (const [versionKey, group] of byVersion) {
    const archiveDigests = [...new Set(group.map((capture) => capture.archiveDigest))];
    if (archiveDigests.length > 1) {
      diagnostics.push(invalid(
        'asset_distribution_version_conflict',
        'One namespace/pack/version maps to different archive digests.',
        {
          versionKey,
          archiveDigests,
          sources: group.map((capture) => capture.transport.sourceId),
        },
      ));
      continue;
    }
    const recordDigests = [...new Set(group.map((capture) => capture.recordDigest))];
    if (recordDigests.length > 1) {
      diagnostics.push(invalid(
        'asset_distribution_mirror_disagreement',
        'Mirrors returned different immutable release records for one archive digest.',
        {
          identityKey: group[0]?.identityKey,
          recordDigests,
          sources: group.map((capture) => capture.transport.sourceId),
        },
      ));
    }
    const availability = [...new Set(group.map((capture) => capture.availability))];
    if (availability.length > 1) {
      diagnostics.push(invalid(
        'asset_distribution_withdrawal_disagreement',
        'Mirrors disagree about whether an immutable release is withdrawn.',
        { identityKey: group[0]?.identityKey, availability },
      ));
    }
  }
  return { ok: diagnostics.length === 0, diagnostics };
}

export function createAssetDistributionFixtureRegistry(
  entries: readonly AssetDistributionRegistryFixtureEntry[],
): AssetDistributionRegistryAdapter {
  return {
    async fetch(request) {
      const entry = entries.find((candidate) => (
        candidate.request.namespace === request.namespace
        && candidate.request.packId === request.packId
        && candidate.request.version === request.version
      ));
      if (entry !== undefined) return entry.response;
      return {
        record: null,
        archiveBytes: Buffer.alloc(0),
        availability: 'not-found',
        transport: { sourceId: 'fixture-registry', statusCode: 404 },
        observedAt: '2026-08-06T00:00:00.000Z',
      };
    },
  };
}

function parseMarketplaceListingFields(
  input: JsonRecord,
): AssetDistributionMarketplaceListingParseResult {
  const diagnostics: AssetDistributionTransportDiagnostic[] = [...exactKeys(input, [
    'schema',
    'listingId',
    'namespace',
    'packId',
    'version',
    'archiveDigest',
    'recordDigest',
    'status',
  ], '$')];
  const listingId = stringField(input, 'listingId', IDENTIFIER_PATTERN);
  const namespace = stringField(input, 'namespace', IDENTIFIER_PATTERN);
  const packId = stringField(input, 'packId', PACK_ID_PATTERN);
  const version = stringField(input, 'version', VERSION_PATTERN);
  const archiveDigest = digestField(input, 'archiveDigest');
  const recordDigest = digestField(input, 'recordDigest');
  const status = input.status === 'listed' || input.status === 'withdrawn' ? input.status : undefined;
  if (input.schema !== ASSET_DISTRIBUTION_MARKETPLACE_LISTING_SCHEMA) {
    diagnostics.push(invalid(
      'asset_distribution_listing_unsupported',
      'Unsupported marketplace listing schema.',
    ));
  }
  if (listingId === undefined) diagnostics.push(invalid('asset_distribution_listing_invalid', '$.listingId is not normalized.'));
  if (namespace === undefined) diagnostics.push(invalid('asset_distribution_listing_invalid', '$.namespace is not normalized.'));
  if (packId === undefined) diagnostics.push(invalid('asset_distribution_listing_invalid', '$.packId is not normalized.'));
  if (version === undefined) diagnostics.push(invalid('asset_distribution_listing_invalid', '$.version is not semantic version.'));
  if (archiveDigest === undefined) diagnostics.push(invalid('asset_distribution_listing_invalid', '$.archiveDigest must be a sha256 digest.'));
  if (recordDigest === undefined) diagnostics.push(invalid('asset_distribution_listing_invalid', '$.recordDigest must be a sha256 digest.'));
  if (status === undefined) diagnostics.push(invalid('asset_distribution_listing_invalid', '$.status must be listed or withdrawn.'));
  if (
    diagnostics.length > 0
    || listingId === undefined
    || namespace === undefined
    || packId === undefined
    || version === undefined
    || archiveDigest === undefined
    || recordDigest === undefined
    || status === undefined
  ) return { ok: false, diagnostics };
  return {
    ok: true,
    listing: {
      schema: ASSET_DISTRIBUTION_MARKETPLACE_LISTING_SCHEMA,
      listingId,
      namespace,
      packId,
      version,
      archiveDigest,
      recordDigest,
      status,
    },
  };
}

export function parseAssetDistributionMarketplaceListing(
  input: unknown,
): AssetDistributionMarketplaceListingParseResult {
  if (!isRecord(input)) {
    return {
      ok: false,
      diagnostics: [invalid('asset_distribution_listing_invalid', '$ must be an object.')],
    };
  }
  return parseMarketplaceListingFields(input);
}

export function verifyAssetDistributionMarketplaceListing(input: {
  readonly listing: AssetDistributionMarketplaceListing;
  readonly capture: AssetDistributionRegistryCapture;
}): AssetDistributionMarketplaceVerificationResult {
  const { listing, capture } = input;
  if (listing.status === 'withdrawn' || capture.availability === 'withdrawn') {
    return {
      ok: false,
      diagnostics: [invalid(
        'asset_distribution_release_withdrawn',
        'A withdrawn marketplace reference cannot authorize selection or trust.',
      )],
    };
  }
  if (
    listing.namespace !== capture.release.release.namespace
    || listing.packId !== capture.release.release.packId
    || listing.version !== capture.release.release.version
  ) {
    return {
      ok: false,
      diagnostics: [invalid(
        'asset_distribution_listing_identity_mismatch',
        'Marketplace listing identity does not match the captured release record.',
      )],
    };
  }
  if (listing.archiveDigest !== capture.archiveDigest || listing.recordDigest !== capture.recordDigest) {
    return {
      ok: false,
      diagnostics: [invalid(
        'asset_distribution_listing_digest_drift',
        'Marketplace listing digests drifted from the captured immutable release evidence.',
        {
          listingArchiveDigest: listing.archiveDigest,
          capturedArchiveDigest: capture.archiveDigest,
          listingRecordDigest: listing.recordDigest,
          capturedRecordDigest: capture.recordDigest,
        },
      )],
    };
  }
  return { ok: true, listing };
}

export function createAssetDistributionFixtureMarketplace(
  entries: readonly AssetDistributionMarketplaceFixtureEntry[],
): AssetDistributionMarketplaceAdapter {
  return {
    async fetchListing(input) {
      const entry = entries.find((candidate) => candidate.listingId === input.listingId);
      if (entry === undefined) {
        return {
          ok: false,
          diagnostics: [invalid(
            'asset_distribution_listing_not_found',
            'The marketplace fixture did not return the requested listing.',
          )],
        };
      }
      return {
        ok: true,
        listing: entry,
        sourceId: 'fixture-marketplace',
      };
    },
  };
}
