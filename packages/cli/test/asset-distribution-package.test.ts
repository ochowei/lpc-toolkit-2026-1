import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  inspectAssetDistributionPackage,
  verifyAssetDistributionPackageReceipt,
  type AssetDistributionPackageInspection,
  type AssetDistributionPackagePublisher,
  type AssetDistributionPackageReceiptAdapter,
  type AssetDistributionPackageReceipt,
} from '../src/asset-distribution-package.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const PACKAGE_NAME = '@lpc-toolkit/cli';
const PACKAGE_VERSION = '0.2.0';
const TARBALL_BYTES = Buffer.from('local package tarball fixture');

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function packageInput(overrides: {
  readonly manifest?: Readonly<Record<string, unknown>>;
  readonly entries?: readonly {
    readonly path: string;
    readonly kind: 'file' | 'directory';
    readonly bytes?: Uint8Array;
  }[];
  readonly entrypoint?: {
    readonly path: string;
    readonly help: string;
    readonly version: string;
  };
  readonly releaseEvidence?: {
    readonly commit: string;
    readonly tag?: string;
    readonly ciEvidenceDigest: string;
    readonly assetReleaseEvidenceDigest?: string;
  };
} = {}) {
  const manifest = overrides.manifest ?? {
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    license: 'GPL-3.0-or-later',
    type: 'module',
    bin: { 'lpc-toolkit': './dist/index.js' },
    files: ['dist', 'README.md'],
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`);
  return {
    expected: { packageName: PACKAGE_NAME, version: PACKAGE_VERSION },
    tarballBytes: TARBALL_BYTES,
    entries: overrides.entries ?? [
      { path: 'package/', kind: 'directory' as const },
      { path: 'package/package.json', kind: 'file' as const, bytes: manifestBytes },
      { path: 'package/dist/', kind: 'directory' as const },
      { path: 'package/dist/index.js', kind: 'file' as const, bytes: Buffer.from('#!/usr/bin/env node\n') },
      { path: 'package/README.md', kind: 'file' as const, bytes: Buffer.from('# lpc-toolkit\n') },
    ],
    entrypoint: overrides.entrypoint ?? {
      path: 'package/dist/index.js',
      help: 'Usage: lpc-toolkit <command>\n',
      version: `${PACKAGE_VERSION}\n`,
    },
    releaseEvidence: overrides.releaseEvidence ?? {
      commit: '0123456789abcdef0123456789abcdef01234567',
      tag: 'v0.2.0',
      ciEvidenceDigest: DIGEST_A,
      assetReleaseEvidenceDigest: DIGEST_B,
    },
  };
}

function expectInspection(): AssetDistributionPackageInspection {
  const result = inspectAssetDistributionPackage(packageInput());
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.inspection;
}

function receiptFor(
  inspection: AssetDistributionPackageInspection,
  overrides: Partial<AssetDistributionPackageReceipt> = {},
): AssetDistributionPackageReceipt {
  const base: AssetDistributionPackageReceipt = {
    schema: 'lpc-toolkit.asset-distribution-package-receipt.v1',
    transport: {
      kind: 'fake-npm',
      sourceId: 'fixture-npm',
      credentialsUsed: false,
    },
    packageName: inspection.package.name,
    version: inspection.package.version,
    tarballSha256: inspection.tarball.sha256,
    integrity: inspection.tarball.integrity,
    status: 'published',
    publicationId: 'fixture-publication-1',
    packageInspectionDigest: inspection.inspectionDigest,
  };
  const withBinding = inspection.lpcArchive.state === 'bound'
    ? { ...base, assetReleaseEvidenceDigest: inspection.lpcArchive.releaseEvidenceDigest }
    : base;
  return { ...withBinding, ...overrides };
}

describe('asset distribution package inspection and fake publication evidence', () => {
  it('inspects a local packed CLI shape without retaining tarball bytes or private paths', () => {
    const result = inspectAssetDistributionPackage(packageInput());

    expect(result).toMatchObject({
      ok: true,
      inspection: {
        schema: 'lpc-toolkit.asset-distribution-package-inspection.v1',
        package: {
          name: PACKAGE_NAME,
          version: PACKAGE_VERSION,
          license: 'GPL-3.0-or-later',
          binPath: './dist/index.js',
        },
        entrypoint: {
          path: 'package/dist/index.js',
          version: PACKAGE_VERSION,
        },
        lpcArchive: { state: 'bound', releaseEvidenceDigest: DIGEST_B },
      },
    });
    if (!result.ok) throw new Error('Expected a valid package inspection.');
    expect(result.inspection.tarball.sha256).toBe(sha256(TARBALL_BYTES));
    expect(result.inspection.tarball.integrity).toMatch(/^sha512-[A-Za-z0-9+/]+=*$/u);
    expect(JSON.stringify(result.inspection)).not.toContain(TARBALL_BYTES.toString());
    expect(JSON.stringify(result.inspection)).not.toContain('/Users/');
    expect(JSON.stringify(result.inspection)).not.toContain('token=');
  });

  it('refuses missing entrypoints, version/help drift, and accidental asset payloads', () => {
    const missingEntrypoint = inspectAssetDistributionPackage(packageInput({
      entries: packageInput().entries.filter((entry) => entry.path !== 'package/dist/index.js'),
    }));
    expect(missingEntrypoint).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_distribution_package_entrypoint_missing' }],
    });

    const versionDrift = inspectAssetDistributionPackage(packageInput({
      entrypoint: {
        path: 'package/dist/index.js',
        help: 'Usage: lpc-toolkit <command>\n',
        version: '0.2.1\n',
      },
    }));
    expect(versionDrift).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_distribution_package_version_drift' }],
    });

    const assetPayload = inspectAssetDistributionPackage(packageInput({
      entries: [
        ...packageInput().entries,
        { path: 'package/acme.hair-1.0.0.lpc-assets.zip', kind: 'file', bytes: Buffer.from('asset') },
      ],
    }));
    expect(assetPayload).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_distribution_package_asset_payload' }],
    });
  });

  it('verifies fake npm and marketplace receipts while keeping LPC archive trust separate', async () => {
    const inspection = expectInspection();
    const receipt = receiptFor(inspection);
    let publishCalls = 0;
    const publisher: AssetDistributionPackagePublisher = {
      transport: 'fake-npm',
      async publish(input) {
        publishCalls += 1;
        expect(input.inspection.inspectionDigest).toBe(inspection.inspectionDigest);
        return receipt;
      },
    };
    const receiptAdapter: AssetDistributionPackageReceiptAdapter = {
      transport: 'fake-npm',
      async fetch(input) {
        expect(input.packageName).toBe(PACKAGE_NAME);
        expect(input.version).toBe(PACKAGE_VERSION);
        return receipt;
      },
    };

    const published = await publisher.publish({ inspection });
    const fetched = await receiptAdapter.fetch({ packageName: PACKAGE_NAME, version: PACKAGE_VERSION });
    const verified = fetched && typeof fetched === 'object'
      ? verifyAssetDistributionPackageReceipt({ inspection, receipt: fetched, expectedTransport: 'fake-npm' })
      : undefined;

    expect(published).toBe(receipt);
    expect(publishCalls).toBe(1);
    expect(verified).toMatchObject({
      ok: true,
      verification: {
        state: 'verified',
        packageTransport: {
          kind: 'fake-npm',
          credentialsUsed: false,
        },
        lpcArchive: { state: 'bound', releaseEvidenceDigest: DIGEST_B },
      },
    });

    const marketplaceReceipt = {
      ...receipt,
      transport: { ...receipt.transport, kind: 'fake-marketplace' as const, sourceId: 'fixture-marketplace' },
    };
    const marketplace = verifyAssetDistributionPackageReceipt({
      inspection,
      receipt: marketplaceReceipt,
      expectedTransport: 'fake-marketplace',
    });
    expect(marketplace).toMatchObject({ ok: true, verification: { packageTransport: { kind: 'fake-marketplace' } } });
  });

  it.each([
    ['metadata-drift', 'asset_distribution_package_metadata_drift'],
    ['integrity-drift', 'asset_distribution_package_integrity_drift'],
    ['version-conflict', 'asset_distribution_package_version_conflict'],
    ['unavailable', 'asset_distribution_package_unavailable'],
  ] as const)('returns a bounded refusal for fake receipt state %s', (status, code) => {
    const inspection = expectInspection();
    const result = verifyAssetDistributionPackageReceipt({
      inspection,
      receipt: receiptFor(inspection, { status }),
      expectedTransport: 'fake-npm',
    });
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code }] });
  });

  it('refuses receipt drift, credential evidence, and accidental asset binding', async () => {
    const inspection = expectInspection();
    const digestDrift = verifyAssetDistributionPackageReceipt({
      inspection,
      receipt: receiptFor(inspection, { packageInspectionDigest: DIGEST_A }),
      expectedTransport: 'fake-npm',
    });
    expect(digestDrift).toMatchObject({ ok: false, diagnostics: [{ code: 'asset_distribution_package_record_mismatch' }] });

    const credentialReceipt = {
      ...receiptFor(inspection),
      transport: { ...receiptFor(inspection).transport, credentialsUsed: true },
    };
    expect(verifyAssetDistributionPackageReceipt({
      inspection,
      receipt: credentialReceipt,
      expectedTransport: 'fake-npm',
    })).toMatchObject({ ok: false, diagnostics: [{ code: 'asset_distribution_package_auth_forbidden' }] });

    const bindingDrift = verifyAssetDistributionPackageReceipt({
      inspection,
      receipt: receiptFor(inspection, { assetReleaseEvidenceDigest: DIGEST_A }),
      expectedTransport: 'fake-npm',
    });
    expect(bindingDrift).toMatchObject({ ok: false, diagnostics: [{ code: 'asset_distribution_package_asset_binding_mismatch' }] });
  });
});
