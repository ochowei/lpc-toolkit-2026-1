import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type {
  AssetDistributionRelease,
  AssetDistributionTrustDecision,
} from '@lpc-toolkit/core';
import { compareAssetPackVersions } from '@lpc-toolkit/core';
import {
  assetDistributionRegistryRecordDigest,
  type AssetDistributionRegistryCapture,
} from './asset-distribution-transport.js';
import {
  installAssetPack,
  type AssetPackInstallSuccess,
} from './asset-pack-install.js';
import {
  prepareAssetPackDesiredState,
  type AssetPackDesiredState,
} from './asset-pack-state.js';
import {
  assertManagedAssetOutput,
  type AssetWorkspace,
} from './asset-workspace.js';
import type { AssetDistributionReleaseEvidenceResult } from './asset-distribution-release-evidence.js';
import type { RuntimeAssets } from './runtime-assets.js';

export interface AssetDistributionConsumerInstallEvidence {
  readonly ok: true;
  readonly decision: 'publishable';
  readonly releaseEvidenceDigest: string;
  readonly creditsDigest: string;
  readonly licenseEvidenceDigest: string;
  readonly provenanceDigest?: string;
  readonly providerEvidenceDigest?: string;
  readonly handoffEvidenceDigest?: string;
}

export interface AssetDistributionConsumerInstallInput {
  /** The only permitted D4 mutation target is a caller-selected temporary prefix. */
  readonly prefixKind: 'temporary-consumer-prefix' | 'system-wide-prefix';
  readonly confirm: boolean;
  readonly allowDowngrade?: boolean;
  readonly archivePath: string;
  readonly capture: AssetDistributionRegistryCapture;
  readonly release: AssetDistributionRelease;
  readonly trustDecision: AssetDistributionTrustDecision;
  readonly evidence: AssetDistributionReleaseEvidenceResult;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly supportedCapabilities: readonly string[];
  readonly now?: () => Date;
  readonly install?: typeof installAssetPack;
}

export type AssetDistributionConsumerInstallResult =
  | {
    readonly ok: true;
    readonly state: 'needs-user-action';
    readonly action: 'confirmation-required';
    readonly evidence: AssetDistributionConsumerInstallEvidence;
    readonly packId: string;
    readonly version: string;
    readonly archiveDigest: string;
  }
  | {
    readonly ok: true;
    readonly state: 'installed';
    readonly action: AssetPackInstallSuccess['action'];
    readonly evidence: AssetDistributionConsumerInstallEvidence;
    readonly install: AssetPackInstallSuccess;
  }
  | {
    readonly ok: false;
    readonly diagnostics: readonly AssetDistributionConsumerInstallDiagnostic[];
  };

export interface AssetDistributionConsumerInstallDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function failure(
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): Exclude<AssetDistributionConsumerInstallResult, { readonly ok: true }> {
  return {
    ok: false,
    diagnostics: [{ code, message, ...(details === undefined ? {} : { details }) }],
  };
}

function evidenceIsPublishable(
  evidence: AssetDistributionReleaseEvidenceResult,
): evidence is AssetDistributionConsumerInstallEvidence {
  return evidence.ok && evidence.decision === 'publishable';
}

function readExactArchive(
  archivePath: string,
  capture: AssetDistributionRegistryCapture,
): Buffer | Exclude<AssetDistributionConsumerInstallResult, { readonly ok: true }> {
  const absolutePath = path.resolve(archivePath);
  const stats = lstatSync(absolutePath, { throwIfNoEntry: false });
  if (stats === undefined || stats.isSymbolicLink() || !stats.isFile()) {
    return failure(
      'asset_distribution_archive_tampered',
      'The selected archive path must be a regular non-symlink file.',
    );
  }
  let bytes: Buffer;
  try {
    bytes = readFileSync(absolutePath);
  } catch {
    return failure(
      'asset_distribution_archive_tampered',
      'The selected archive could not be read for exact digest verification.',
    );
  }
  if (
    !bytes.equals(capture.archiveBytes)
    || bytes.byteLength !== capture.byteLength
    || sha256(bytes) !== capture.archiveDigest
  ) {
    return failure(
      'asset_distribution_archive_tampered',
      'The selected archive bytes differ from the captured immutable release evidence.',
    );
  }
  return bytes;
}

function checkCaptureAndRelease(
  capture: AssetDistributionRegistryCapture,
  release: AssetDistributionRelease,
): Exclude<AssetDistributionConsumerInstallResult, { readonly ok: true }> | undefined {
  if (
    capture.identityKey !== `${release.release.namespace}/${release.release.packId}@${release.release.version}#${release.release.archiveDigest}`
    || capture.recordDigest !== assetDistributionRegistryRecordDigest(release)
    || capture.release.release.archiveDigest !== release.release.archiveDigest
  ) {
    return failure(
      'asset_distribution_record_mismatch',
      'The selected release record differs from the captured immutable registry evidence.',
    );
  }
  if (capture.availability === 'withdrawn') {
    return failure(
      'asset_distribution_withdrawn',
      'Withdrawn releases cannot be installed into a consumer prefix.',
    );
  }
  return undefined;
}

function checkTrust(
  decision: AssetDistributionTrustDecision,
): Exclude<AssetDistributionConsumerInstallResult, { readonly ok: true }> | undefined {
  if (decision.status === 'trusted') return undefined;
  return failure(
    'asset_distribution_untrusted',
    'The release trust decision is not trusted; installation is blocked before mutation.',
    { status: decision.status, ...(decision.code === undefined ? {} : { reason: decision.code }) },
  );
}

function checkCapabilities(
  release: AssetDistributionRelease,
  supportedCapabilities: readonly string[],
): Exclude<AssetDistributionConsumerInstallResult, { readonly ok: true }> | undefined {
  const supported = new Set(supportedCapabilities);
  const missing = release.release.requiredCapabilities.filter((capability) => !supported.has(capability));
  if (missing.length === 0) return undefined;
  return failure(
    'asset_distribution_capability_unsupported',
    'The selected release requires capabilities not supported by this consumer operation.',
    { missingCapabilities: missing },
  );
}

function currentDesiredState(
  workspace: AssetWorkspace,
  runtime: RuntimeAssets,
): Promise<AssetPackDesiredState | Exclude<AssetDistributionConsumerInstallResult, { readonly ok: true }>> {
  return prepareAssetPackDesiredState({
    workspace,
    runtime,
    mutation: { kind: 'none' },
  }).then((result) => result.ok
    ? result
    : failure(
      'asset_distribution_prefix_preflight_failed',
      'The existing consumer prefix failed its protected registry/output preflight.',
      { diagnostics: result.diagnostics },
    ));
}

export async function installAssetDistributionToConsumerPrefix(
  input: AssetDistributionConsumerInstallInput,
): Promise<AssetDistributionConsumerInstallResult> {
  if (input.prefixKind !== 'temporary-consumer-prefix') {
    return failure(
      'asset_distribution_external_mutation_blocked',
      'Only the explicitly named temporary consumer-prefix seam is available in D4 local verification.',
    );
  }
  try {
    assertManagedAssetOutput(input.workspace);
  } catch {
    return failure(
      'asset_distribution_prefix_preflight_failed',
      'The consumer prefix is not initialized and managed by the existing asset installer.',
    );
  }
  const captureFailure = checkCaptureAndRelease(input.capture, input.release);
  if (captureFailure) return captureFailure;
  const archive = readExactArchive(input.archivePath, input.capture);
  if (!Buffer.isBuffer(archive)) return archive;
  const trustFailure = checkTrust(input.trustDecision);
  if (trustFailure) return trustFailure;
  if (
    !evidenceIsPublishable(input.evidence)
    || input.evidence.releaseEvidenceDigest !== input.release.authorization.releaseEvidenceDigest
  ) {
    return failure(
      'asset_distribution_record_mismatch',
      'Exact release evidence is missing or does not match the selected record.',
    );
  }
  const capabilityFailure = checkCapabilities(input.release, input.supportedCapabilities);
  if (capabilityFailure) return capabilityFailure;
  if (!input.confirm) {
    return {
      ok: true,
      state: 'needs-user-action',
      action: 'confirmation-required',
      evidence: input.evidence,
      packId: input.release.release.packId,
      version: input.release.release.version,
      archiveDigest: input.release.release.archiveDigest,
    };
  }
  const current = await currentDesiredState(input.workspace, input.runtime);
  if (!('ok' in current) || current.ok === false) return current;
  const existing = current.registry.entries.find((entry) => entry.packId === input.release.release.packId);
  if (
    existing !== undefined
    && existing.kind === 'installed'
    && compareAssetPackVersions(input.release.release.version, existing.version) < 0
    && input.allowDowngrade !== true
  ) {
    return failure(
      'asset_distribution_downgrade_requires_confirmation',
      'Downgrade selection requires an explicit allowDowngrade decision in addition to --confirm.',
      { installedVersion: existing.version, requestedVersion: input.release.release.version },
    );
  }
  void archive;
  const install = input.install ?? installAssetPack;
  const result = await install({
    archivePath: path.resolve(input.archivePath),
    workspace: input.workspace,
    runtime: input.runtime,
    ...(input.now === undefined ? {} : { now: input.now }),
  });
  if (!result.ok) return { ok: false, diagnostics: result.diagnostics };
  return {
    ok: true,
    state: 'installed',
    action: result.action,
    evidence: input.evidence,
    install: result,
  };
}
