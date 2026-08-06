import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AssetDistributionRelease } from '@lpc-toolkit/core';
import {
  ASSET_DISTRIBUTION_MARKETPLACE_LISTING_SCHEMA,
  captureAssetDistributionRegistryResponse,
  compareAssetDistributionRegistryCaptures,
  createAssetDistributionFixtureMarketplace,
  createAssetDistributionFixtureRegistry,
  fetchAssetDistributionRegistryRelease,
  parseAssetDistributionMarketplaceListing,
  verifyAssetDistributionMarketplaceListing,
} from '../src/asset-distribution-transport.js';
import type {
  AssetDistributionMarketplaceListing,
  AssetDistributionRegistryCapture,
  AssetDistributionRegistryFetchRequest,
  AssetDistributionRegistryFetchResponse,
} from '../src/asset-distribution-transport.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const DIGEST_C = `sha256:${'c'.repeat(64)}`;
const DIGEST_D = `sha256:${'d'.repeat(64)}`;
const DIGEST_E = `sha256:${'e'.repeat(64)}`;

function archiveDigest(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

const ARCHIVE_A = Buffer.from('formal archive fixture A');
const ARCHIVE_B = Buffer.from('formal archive fixture B');

const RELEASE_A: AssetDistributionRelease = {
  schema: 'lpc-toolkit.asset-distribution-release.v1',
  release: {
    namespace: 'example',
    packId: 'example.hair',
    version: '1.2.3',
    archiveKind: 'formal',
    archiveDigest: archiveDigest(ARCHIVE_A),
    byteLength: ARCHIVE_A.byteLength,
    manifestDigest: DIGEST_A,
    contentDigest: DIGEST_B,
    sourceDigests: [{ path: 'sprites/a.png', digest: DIGEST_C }],
    creditsDigest: DIGEST_D,
    licenseEvidenceDigest: DIGEST_E,
    requiredCapabilities: [],
  },
  authorization: {
    namespacePolicyId: 'example-policy-v1',
    releaseEvidenceDigest: DIGEST_A,
  },
  signature: {
    keyId: DIGEST_A,
    algorithm: 'ed25519',
    payloadDigest: DIGEST_B,
    value: 'ZmFrZS1zaWduYXR1cmU',
  },
};

const REQUEST_A: AssetDistributionRegistryFetchRequest = {
  namespace: 'example',
  packId: 'example.hair',
  version: '1.2.3',
};

function responseFor(
  release: AssetDistributionRelease,
  archiveBytes: Buffer,
  overrides: Partial<AssetDistributionRegistryFetchResponse> = {},
): AssetDistributionRegistryFetchResponse {
  return {
    record: release,
    archiveBytes,
    availability: 'available',
    transport: {
      sourceId: 'mirror-a',
      statusCode: 200,
      metadata: { namespace: 'transport-metadata-is-not-authoritative' },
    },
    observedAt: '2026-08-06T00:00:00.000Z',
    ...overrides,
  };
}

function captureOf(
  request: AssetDistributionRegistryFetchRequest,
  response: AssetDistributionRegistryFetchResponse,
): AssetDistributionRegistryCapture {
  const captured = captureAssetDistributionRegistryResponse({ request, response });
  if (!captured.ok) throw new Error(JSON.stringify(captured.diagnostics));
  return captured.capture;
}

describe('asset distribution registry and marketplace transport', () => {
  it('captures exact archive bytes and ignores transport metadata for identity', async () => {
    const adapter = createAssetDistributionFixtureRegistry([{
      request: REQUEST_A,
      response: responseFor(RELEASE_A, ARCHIVE_A),
    }]);

    const captured = await fetchAssetDistributionRegistryRelease({
      adapter,
      request: { ...REQUEST_A, archiveDigest: RELEASE_A.release.archiveDigest },
    });
    expect(captured).toMatchObject({
      ok: true,
      capture: {
        identityKey: `example/example.hair@1.2.3#${RELEASE_A.release.archiveDigest}`,
        archiveDigest: RELEASE_A.release.archiveDigest,
        byteLength: ARCHIVE_A.byteLength,
        availability: 'available',
        transport: { sourceId: 'mirror-a' },
      },
    });
    if (!captured.ok) throw new Error('Expected fixture registry capture to succeed.');
    expect(captured.capture.release.release.namespace).toBe('example');
    expect(captured.capture.archiveBytes.equals(ARCHIVE_A)).toBe(true);
    expect(captured.capture.transport.metadata).toEqual({
      namespace: 'transport-metadata-is-not-authoritative',
    });
  });

  it('refuses a record whose archive bytes do not match its digest', () => {
    const captured = captureAssetDistributionRegistryResponse({
      request: REQUEST_A,
      response: responseFor(RELEASE_A, ARCHIVE_B),
    });
    expect(captured).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_distribution_archive_digest_mismatch' }],
    });

    const privateMetadata = captureAssetDistributionRegistryResponse({
      request: REQUEST_A,
      response: responseFor(RELEASE_A, ARCHIVE_A, {
        transport: {
          sourceId: 'mirror-a',
          statusCode: 200,
          metadata: { credential: 'token=fixture-secret' },
        },
      }),
    });
    expect(privateMetadata).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_distribution_transport_private_data' }],
    });
  });

  it('detects same-version conflicts, mirror disagreement, and withdrawal', () => {
    const releaseB: AssetDistributionRelease = {
      ...RELEASE_A,
      release: {
        ...RELEASE_A.release,
        archiveDigest: archiveDigest(ARCHIVE_B),
        byteLength: ARCHIVE_B.byteLength,
      },
    };
    const conflictCaptures = [
      captureOf(REQUEST_A, responseFor(RELEASE_A, ARCHIVE_A)),
      captureOf(REQUEST_A, responseFor(releaseB, ARCHIVE_B, {
        transport: { sourceId: 'mirror-b', statusCode: 200 },
      })),
    ];
    const conflictEvidenceBefore = conflictCaptures.map((capture) => capture.identityKey);
    const sameVersionConflict = compareAssetDistributionRegistryCaptures(conflictCaptures);
    expect(sameVersionConflict).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_distribution_version_conflict' }],
    });
    expect(conflictCaptures.map((capture) => capture.identityKey)).toEqual(conflictEvidenceBefore);

    const mirrorRecord = {
      ...RELEASE_A,
      signature: { ...RELEASE_A.signature, value: 'bWlycm9yLWRpZmZlcmVudA' },
    };
    const mirrorDisagreement = compareAssetDistributionRegistryCaptures([
      captureOf(REQUEST_A, responseFor(RELEASE_A, ARCHIVE_A)),
      captureOf(REQUEST_A, responseFor(mirrorRecord, ARCHIVE_A, {
        transport: { sourceId: 'mirror-b', statusCode: 200 },
      })),
    ]);
    expect(mirrorDisagreement).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_distribution_mirror_disagreement' }],
    });

    const withdrawn = captureAssetDistributionRegistryResponse({
      request: REQUEST_A,
      response: responseFor(RELEASE_A, ARCHIVE_A, { availability: 'withdrawn' }),
    });
    expect(withdrawn).toMatchObject({ ok: true, capture: { availability: 'withdrawn' } });
  });

  it('treats a marketplace listing as an exact reference, not a trust authority', async () => {
    const capture = captureOf(REQUEST_A, responseFor(RELEASE_A, ARCHIVE_A));
    const listing: AssetDistributionMarketplaceListing = {
      schema: ASSET_DISTRIBUTION_MARKETPLACE_LISTING_SCHEMA,
      listingId: 'example-hair-listing',
      namespace: RELEASE_A.release.namespace,
      packId: RELEASE_A.release.packId,
      version: RELEASE_A.release.version,
      archiveDigest: capture.archiveDigest,
      recordDigest: capture.recordDigest,
      status: 'listed',
    };
    const marketplace = createAssetDistributionFixtureMarketplace([listing]);
    const fetched = await marketplace.fetchListing({ listingId: listing.listingId });
    expect(fetched).toMatchObject({ ok: true, sourceId: 'fixture-marketplace' });
    if (!fetched.ok) throw new Error('Expected fixture marketplace listing.');

    const parsed = parseAssetDistributionMarketplaceListing(fetched.listing);
    expect(parsed).toEqual({ ok: true, listing });
    if (!parsed.ok) throw new Error('Expected marketplace listing to parse.');
    expect(verifyAssetDistributionMarketplaceListing({
      listing: parsed.listing,
      capture,
    })).toEqual({ ok: true, listing: parsed.listing });

    const drift = parseAssetDistributionMarketplaceListing({
      ...listing,
      recordDigest: DIGEST_A,
    });
    if (!drift.ok) throw new Error('Expected drift fixture to parse.');
    expect(verifyAssetDistributionMarketplaceListing({ listing: drift.listing, capture })).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_distribution_listing_digest_drift' }],
    });

    const withdrawnListing = parseAssetDistributionMarketplaceListing({
      ...listing,
      status: 'withdrawn',
    });
    if (!withdrawnListing.ok) throw new Error('Expected withdrawal fixture to parse.');
    expect(verifyAssetDistributionMarketplaceListing({
      listing: withdrawnListing.listing,
      capture,
    })).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_distribution_release_withdrawn' }],
    });
  });
});
