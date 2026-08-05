import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import type { AssetDistributionRelease } from '@lpc-toolkit/core';
import {
  ASSET_DISTRIBUTION_REGISTRY_CAPTURE_SCHEMA,
  assetDistributionRegistryRecordDigest,
  type AssetDistributionRegistryCapture,
} from '../src/asset-distribution-transport.js';
import { initializeAssetWorkspace } from '../src/asset-workspace.js';
import {
  projectAssetDistributionOutcome,
  quarantineAssetDistributionRelease,
  recoverAssetDistributionConsumerPrefix,
  selectAssetDistributionRollbackRelease,
  type AssetDistributionRollbackCandidate,
} from '../src/asset-distribution-audit.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const ARCHIVE = Buffer.from('exact formal archive audit fixture');
const TEMPORARY_DIRECTORIES: string[] = [];

const RELEASE: AssetDistributionRelease = {
  schema: 'lpc-toolkit.asset-distribution-release.v1',
  release: {
    namespace: 'example',
    packId: 'example.hair',
    version: '1.2.4',
    archiveKind: 'formal',
    archiveDigest: DIGEST_A,
    byteLength: ARCHIVE.byteLength,
    manifestDigest: DIGEST_A,
    contentDigest: DIGEST_B,
    sourceDigests: [],
    creditsDigest: DIGEST_A,
    licenseEvidenceDigest: DIGEST_B,
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

function capture(overrides: Partial<AssetDistributionRegistryCapture> = {}): AssetDistributionRegistryCapture {
  return {
    schema: ASSET_DISTRIBUTION_REGISTRY_CAPTURE_SCHEMA,
    identityKey: `example/example.hair@1.2.4#${DIGEST_A}`,
    release: RELEASE,
    archiveBytes: Buffer.from(ARCHIVE),
    recordDigest: assetDistributionRegistryRecordDigest(RELEASE),
    archiveDigest: DIGEST_A,
    byteLength: ARCHIVE.byteLength,
    availability: 'available',
    transport: { sourceId: 'fixture-registry', statusCode: 200 },
    observedAt: '2026-08-06T12:00:00.000Z',
    ...overrides,
  };
}

function candidate(options: {
  readonly version: string;
  readonly archiveDigest: string;
  readonly recordDigest: string;
  readonly state?: 'verified' | 'withdrawn';
}): AssetDistributionRollbackCandidate {
  return {
    identityKey: `example/example.hair@${options.version}#${options.archiveDigest}`,
    namespace: 'example',
    packId: 'example.hair',
    version: options.version,
    archiveDigest: options.archiveDigest,
    recordDigest: options.recordDigest,
    state: options.state ?? 'verified',
  };
}

afterEach(() => {
  for (const directory of TEMPORARY_DIRECTORIES.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('asset distribution tamper, rollback, recovery, and audit evidence', () => {
  it.each([
    ['asset_distribution_record_invalid', 'blocked'],
    ['asset_distribution_record_mismatch', 'tampered'],
    ['asset_distribution_archive_tampered', 'tampered'],
    ['asset_distribution_listing_digest_drift', 'tampered'],
    ['asset_distribution_key_revoked', 'untrusted'],
    ['asset_distribution_version_conflict', 'conflict'],
    ['asset_distribution_withdrawn', 'withdrawn'],
    ['asset_distribution_recovery_required', 'recoverable'],
  ] as const)('projects %s into the stable %s state', (code, state) => {
    const result = projectAssetDistributionOutcome({
      operation: 'verify',
      diagnostics: [{ code }],
      identity: {
        namespace: RELEASE.release.namespace,
        packId: RELEASE.release.packId,
        version: RELEASE.release.version,
      },
      archiveDigest: RELEASE.release.archiveDigest,
      recordDigest: assetDistributionRegistryRecordDigest(RELEASE),
      policyId: RELEASE.authorization.namespacePolicyId,
      keyId: RELEASE.signature.keyId,
      priorReceiptDigest: DIGEST_B,
    });
    expect(result).toMatchObject({
      ok: true,
      audit: {
        state,
        decision: state,
        identity: { namespace: 'example', packId: 'example.hair', version: '1.2.4' },
        archiveDigest: DIGEST_A,
        recordDigest: assetDistributionRegistryRecordDigest(RELEASE),
        policyId: 'example-policy-v1',
        keyId: DIGEST_A,
        priorReceiptDigest: DIGEST_B,
      },
    });
  });

  it('projects a verified outcome and failed local publication as bounded evidence', () => {
    const verified = projectAssetDistributionOutcome({
      operation: 'verify',
      diagnostics: [],
      identity: {
        namespace: RELEASE.release.namespace,
        packId: RELEASE.release.packId,
        version: RELEASE.release.version,
      },
      archiveDigest: RELEASE.release.archiveDigest,
      recordDigest: assetDistributionRegistryRecordDigest(RELEASE),
      policyId: RELEASE.authorization.namespacePolicyId,
      keyId: RELEASE.signature.keyId,
    });
    expect(verified).toMatchObject({ ok: true, audit: { state: 'verified', decision: 'verified', recoveryAction: 'none' } });

    const failedPublish = projectAssetDistributionOutcome({
      operation: 'publish',
      diagnostics: [{ code: 'asset_publish_failed' }],
      recoveryAvailable: true,
      archiveDigest: RELEASE.release.archiveDigest,
      recordDigest: assetDistributionRegistryRecordDigest(RELEASE),
    });
    expect(failedPublish).toMatchObject({
      ok: true,
      audit: { state: 'recoverable', decision: 'recoverable', recoveryAction: 'resume-or-discard-local-transaction' },
    });

    for (const operation of ['fetch', 'install'] as const) {
      const failed = projectAssetDistributionOutcome({
        operation,
        diagnostics: [{ code: 'asset_publish_failed' }],
        recoveryAvailable: true,
      });
      expect(failed).toMatchObject({ ok: true, audit: { state: 'recoverable', decision: 'recoverable' } });
    }
  });

  it('quarantines a withdrawn release without deleting or rewriting the captured evidence', () => {
    const withdrawn = capture({ availability: 'withdrawn' });
    const beforeBytes = Buffer.from(withdrawn.archiveBytes);
    const result = quarantineAssetDistributionRelease({
      capture: withdrawn,
      reason: 'withdrawn',
      priorReceiptDigest: DIGEST_B,
    });
    expect(result).toMatchObject({
      ok: true,
      quarantine: {
        state: 'quarantined',
        reason: 'withdrawn',
        identityKey: withdrawn.identityKey,
        archiveDigest: DIGEST_A,
        recordDigest: withdrawn.recordDigest,
        priorReceiptDigest: DIGEST_B,
        nextAction: 'select-prior-verified-release',
      },
    });
    expect(withdrawn.archiveBytes).toEqual(beforeBytes);
    expect(JSON.stringify(result)).not.toContain(ARCHIVE.toString());
    expect(JSON.stringify(result)).not.toContain('/Users/');
  });

  it('requires explicit prior verified release selection and never selects a withdrawn candidate', () => {
    const current = candidate({ version: '1.2.4', archiveDigest: DIGEST_A, recordDigest: DIGEST_A });
    const prior = candidate({ version: '1.2.3', archiveDigest: DIGEST_B, recordDigest: DIGEST_B });
    const noSelection = selectAssetDistributionRollbackRelease({
      currentIdentityKey: current.identityKey,
      candidates: [current, prior],
      priorReceiptDigest: DIGEST_A,
    });
    expect(noSelection).toMatchObject({ ok: false, diagnostics: [{ code: 'asset_distribution_rollback_selection_required' }] });

    const selected = selectAssetDistributionRollbackRelease({
      currentIdentityKey: current.identityKey,
      candidates: [current, prior],
      selectedIdentityKey: prior.identityKey,
      priorReceiptDigest: DIGEST_A,
    });
    expect(selected).toMatchObject({
      ok: true,
      selection: {
        state: 'selected',
        mutation: 'none',
        nextAction: 'confirm-consumer-install',
        candidate: prior,
      },
    });

    const withdrawn = selectAssetDistributionRollbackRelease({
      currentIdentityKey: current.identityKey,
      candidates: [current, { ...prior, state: 'withdrawn' }],
      selectedIdentityKey: prior.identityKey,
    });
    expect(withdrawn).toMatchObject({ ok: false, diagnostics: [{ code: 'asset_distribution_withdrawn' }] });
  });

  it('uses existing local recovery with confirmation and repeated recovery is an idempotent no-op', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'lpc-d4-audit-recovery-'));
    TEMPORARY_DIRECTORIES.push(root);
    const workspace = initializeAssetWorkspace(root);
    const beforeConfig = readFileSync(workspace.configPath);

    const pending = recoverAssetDistributionConsumerPrefix({
      workspace,
      confirm: false,
      priorReceiptDigest: DIGEST_A,
    });
    expect(pending).toMatchObject({
      ok: true,
      state: 'recovered',
      action: 'none',
      audit: { state: 'verified', recoveryAction: 'none', priorReceiptDigest: DIGEST_A },
    });
    expect(readFileSync(workspace.configPath)).toEqual(beforeConfig);

    const repeated = recoverAssetDistributionConsumerPrefix({
      workspace,
      confirm: true,
      priorReceiptDigest: DIGEST_A,
    });
    expect(repeated).toMatchObject({ ok: true, state: 'recovered', action: 'none' });
    expect(readFileSync(workspace.configPath)).toEqual(beforeConfig);
  });
});
