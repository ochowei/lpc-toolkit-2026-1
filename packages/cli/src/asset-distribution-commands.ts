import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  evaluateAssetDistributionTrust,
  parseAssetDistributionRelease,
  parseAssetDistributionTrustPolicy,
  verifyAssetDistributionSignature,
  type AssetDistributionRelease,
  type AssetDistributionTrustDecision,
  type AssetDistributionTrustPolicy,
} from '@lpc-toolkit/core';
import { AUTHORING_CAPABILITIES } from './capabilities.js';
import {
  ASSET_DISTRIBUTION_CAPABILITIES,
  ASSET_DISTRIBUTION_VERIFICATION_SCHEMA,
  type AssetDistributionPublicIdentity,
  type AssetDistributionPublicNextAction,
  type AssetDistributionPublicOperation,
  type AssetDistributionPublicPackage,
  type AssetDistributionPublicResponseData,
  type AssetDistributionPublicState,
  type AssetDistributionPublicTrust,
} from './asset-distribution-contract.js';
import {
  projectAssetDistributionOutcome,
  selectAssetDistributionRollbackRelease,
  type AssetDistributionAuditEvidence,
  type AssetDistributionRollbackCandidate,
} from './asset-distribution-audit.js';
import {
  installAssetDistributionToConsumerPrefix,
  type AssetDistributionConsumerInstallEvidence,
} from './asset-distribution-global-install.js';
import {
  verifyAssetDistributionPackageReceipt,
  type AssetDistributionPackageInspection,
} from './asset-distribution-package.js';
import {
  captureAssetDistributionRegistryResponse,
  type AssetDistributionRegistryCapture,
} from './asset-distribution-transport.js';
import { flagBoolean, flagString, type ParsedArgs } from './args.js';
import {
  commandError,
  commandOk,
  type CliIssue,
  type CliResponse,
} from './response.js';
import type { AssetWorkspace } from './asset-workspace.js';
import type { RuntimeAssets } from './runtime-assets.js';

const FIXTURE_OBSERVED_AT = '2026-08-06T00:00:00.000Z';
const MAX_FIXTURE_BYTES = 128 * 1024 * 1024;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const INTEGRITY_PATTERN = /^sha512-[A-Za-z0-9+/]+={0,2}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const IDENTITY_PATTERN = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9]+(?:[.-][a-z0-9]+)*@\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?#sha256:[0-9a-f]{64}$/u;

type JsonRecord = Readonly<Record<string, unknown>>;

export interface AssetDistributionCommandContext {
  readonly parsed: ParsedArgs;
  readonly cwd: string;
  readonly workspace?: AssetWorkspace;
  readonly runtime?: RuntimeAssets;
}

type LocalFixtureResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly issue: CliIssue };

interface CapturedFixture {
  readonly capture: AssetDistributionRegistryCapture;
  readonly release: AssetDistributionRelease;
}

interface VerifierFixture {
  readonly signatureValid: boolean;
  readonly publicKeyFingerprint: string;
  readonly observedAt: string;
}

interface VerificationFixture extends CapturedFixture {
  readonly trustDecision: AssetDistributionTrustDecision;
  readonly signatureVerified: boolean;
  readonly policy: AssetDistributionTrustPolicy;
  readonly verifier: VerifierFixture;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function digestField(value: unknown): value is string {
  return stringField(value) && DIGEST_PATTERN.test(value);
}

function exactKeys(record: JsonRecord, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(record).every((key) => allowed.has(key));
}

function issue(
  code: string,
  message: string,
  issuePath?: string,
): CliIssue {
  return {
    code,
    message,
    ...(issuePath === undefined ? {} : { path: issuePath }),
  };
}

function safeFixtureMessage(kind: string): string {
  return `The local ${kind} fixture failed strict D4 validation.`;
}

function localFixturePath(
  cwd: string,
  flagName: string,
  value: string | undefined,
): { readonly ok: true; readonly path: string } | { readonly ok: false; readonly issue: CliIssue } {
  if (value === undefined || value.length === 0) {
    return { ok: false, issue: issue('missing_argument', `--${flagName} is required.`, `--${flagName}`) };
  }
  const resolved = path.resolve(cwd, value);
  const segments = resolved.split(path.sep);
  if (segments.includes('upstream')) {
    return {
      ok: false,
      issue: issue('asset_distribution_upstream_forbidden', 'D4 local fixtures must not read upstream/.', `--${flagName}`),
    };
  }
  try {
    const stats = lstatSync(resolved);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_FIXTURE_BYTES) {
      return { ok: false, issue: issue('asset_distribution_fixture_unreadable', safeFixtureMessage(flagName), `--${flagName}`) };
    }
  } catch {
    return { ok: false, issue: issue('asset_distribution_fixture_unreadable', safeFixtureMessage(flagName), `--${flagName}`) };
  }
  return { ok: true, path: resolved };
}

function readLocalFixture(
  cwd: string,
  flagName: string,
  value: string | undefined,
): LocalFixtureResult {
  const fixturePath = localFixturePath(cwd, flagName, value);
  if (!fixturePath.ok) return fixturePath;
  try {
    return { ok: true, value: JSON.parse(readFileSync(fixturePath.path, 'utf8')) as unknown };
  } catch {
    return { ok: false, issue: issue('asset_distribution_fixture_invalid', safeFixtureMessage(flagName), `--${flagName}`) };
  }
}

function readArchiveFixture(
  cwd: string,
  value: string | undefined,
): { readonly ok: true; readonly bytes: Buffer } | { readonly ok: false; readonly issue: CliIssue } {
  const fixturePath = localFixturePath(cwd, 'archive', value);
  if (!fixturePath.ok) return fixturePath;
  try {
    return { ok: true, bytes: readFileSync(fixturePath.path) };
  } catch {
    return { ok: false, issue: issue('asset_distribution_fixture_unreadable', safeFixtureMessage('archive'), '--archive') };
  }
}

function requiredFlag(
  parsed: ParsedArgs,
  name: string,
): string | undefined {
  return flagString(parsed.flags, name);
}

function captureFixture(
  context: AssetDistributionCommandContext,
): { readonly ok: true; readonly captured: CapturedFixture } | { readonly ok: false; readonly issue: CliIssue } {
  const recordFixture = readLocalFixture(context.cwd, 'record', flagString(context.parsed.flags, 'record'));
  if (!recordFixture.ok) return recordFixture;
  const archiveFixture = readArchiveFixture(context.cwd, flagString(context.parsed.flags, 'archive'));
  if (!archiveFixture.ok) return archiveFixture;
  const parsedRecord = parseAssetDistributionRelease(recordFixture.value);
  if (!parsedRecord.ok) {
    return {
      ok: false,
      issue: issue('asset_distribution_record_invalid', safeFixtureMessage('record'), '--record'),
    };
  }
  const release = parsedRecord.release;
  const namespace = requiredFlag(context.parsed, 'namespace');
  const packId = requiredFlag(context.parsed, 'pack-id');
  const version = requiredFlag(context.parsed, 'version');
  if (namespace === undefined || packId === undefined || version === undefined) {
    return {
      ok: false,
      issue: issue('missing_argument', 'Namespace, pack id, and version are required.', '--namespace'),
    };
  }
  const archiveDigest = flagString(context.parsed.flags, 'archive-digest');
  const request = {
    namespace,
    packId,
    version,
    ...(archiveDigest === undefined ? {} : { archiveDigest }),
  };
  const captured = captureAssetDistributionRegistryResponse({
    request,
    response: {
      record: release,
      archiveBytes: archiveFixture.bytes,
      availability: flagString(context.parsed.flags, 'availability') === 'withdrawn'
        ? 'withdrawn'
        : 'available',
      transport: {
        sourceId: flagString(context.parsed.flags, 'source-id') ?? 'fixture-registry',
        statusCode: 200,
      },
      observedAt: FIXTURE_OBSERVED_AT,
    },
  });
  if (!captured.ok) {
    return {
      ok: false,
      issue: issue('asset_distribution_capture_invalid', safeFixtureMessage('record/archive capture')),
    };
  }
  return { ok: true, captured: { capture: captured.capture, release } };
}

function parseVerifierFixture(value: unknown): VerifierFixture | undefined {
  if (!isRecord(value) || !exactKeys(value, ['signatureValid', 'publicKeyFingerprint', 'observedAt'])) return undefined;
  return typeof value.signatureValid === 'boolean'
    && digestField(value.publicKeyFingerprint)
    && stringField(value.observedAt)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value.observedAt)
    ? {
      signatureValid: value.signatureValid,
      publicKeyFingerprint: value.publicKeyFingerprint,
      observedAt: value.observedAt,
    }
    : undefined;
}

function verifyFixture(
  context: AssetDistributionCommandContext,
): { readonly ok: true; readonly verified: VerificationFixture } | { readonly ok: false; readonly issue: CliIssue } {
  const captured = captureFixture(context);
  if (!captured.ok) return captured;
  const policyFixture = readLocalFixture(context.cwd, 'trust-policy', flagString(context.parsed.flags, 'trust-policy'));
  if (!policyFixture.ok) return policyFixture;
  const verifierFixture = readLocalFixture(context.cwd, 'verifier', flagString(context.parsed.flags, 'verifier'));
  if (!verifierFixture.ok) return verifierFixture;
  const parsedPolicy = parseAssetDistributionTrustPolicy(policyFixture.value);
  const verifier = parseVerifierFixture(verifierFixture.value);
  if (!parsedPolicy.ok || verifier === undefined) {
    return {
      ok: false,
      issue: issue('asset_distribution_verifier_invalid', safeFixtureMessage('trust/verifier')),
    };
  }
  const signature = verifyAssetDistributionSignature({
    release: captured.captured.release,
    publicKeyFingerprint: verifier.publicKeyFingerprint,
    verifier: {
      algorithm: captured.captured.release.signature.algorithm,
      verify: () => verifier.signatureValid,
    },
  });
  return {
    ok: true,
    verified: {
      ...captured.captured,
      policy: parsedPolicy.policy,
      verifier,
      signatureVerified: signature.signatureValid,
      trustDecision: evaluateAssetDistributionTrust({
        release: captured.captured.release,
        policy: parsedPolicy.policy,
        signatureValid: signature.signatureValid,
        publicKeyFingerprint: verifier.publicKeyFingerprint,
        observedAt: verifier.observedAt,
      }),
    },
  };
}

function identityOf(capture: AssetDistributionRegistryCapture): AssetDistributionPublicIdentity {
  const release = capture.release.release;
  return {
    namespace: release.namespace,
    packId: release.packId,
    version: release.version,
    archiveDigest: capture.archiveDigest,
    recordDigest: capture.recordDigest,
  };
}

function nextAction(
  id: string,
  summary: string,
  command: string,
  requiresConfirmation: boolean,
): AssetDistributionPublicNextAction {
  return { id, summary, command, requiresConfirmation };
}

function nextActions(
  operation: AssetDistributionPublicOperation,
  state: AssetDistributionPublicState,
): readonly AssetDistributionPublicNextAction[] {
  if (operation === 'inspect' || operation === 'fetch') {
    return [nextAction(
      'verify-local-trust',
      'Evaluate the supplied local trust policy and deterministic verifier fixture.',
      'lpc-toolkit asset distribution verify --record <record.json> --archive <archive> --trust-policy <policy.json> --verifier <verifier.json> --json',
      false,
    )];
  }
  if (operation === 'verify' && state === 'verified') {
    return [nextAction(
      'install-temporary-prefix',
      'Review the exact evidence, then confirm installation into a temporary consumer prefix.',
      'lpc-toolkit asset distribution install --prefix-kind temporary-consumer-prefix --confirm --json',
      true,
    )];
  }
  if (state === 'untrusted') {
    return [nextAction(
      'authorized-trust-policy',
      'Supply an explicitly authorized local key policy; do not bypass verification.',
      'lpc-toolkit asset distribution verify --trust-policy <authorized-policy.json> --verifier <verifier.json> --json',
      false,
    )];
  }
  if (state === 'withdrawn') {
    return [nextAction(
      'select-prior-verified-release',
      'Select a previously verified immutable release; do not install the withdrawn release.',
      'lpc-toolkit asset distribution rollback --candidates <candidates.json> --selected <identity> --json',
      false,
    )];
  }
  if (operation === 'install' && state === 'needs-user-action') {
    return [nextAction(
      'confirm-install',
      'Confirm this exact release and temporary consumer prefix before mutation.',
      'lpc-toolkit asset distribution install --prefix-kind temporary-consumer-prefix --confirm --json',
      true,
    )];
  }
  if (operation === 'install' && state === 'blocked') {
    return [nextAction(
      'temporary-prefix-only',
      'Use only the explicitly selected temporary consumer-prefix seam in D4 local verification.',
      'lpc-toolkit asset distribution install --prefix-kind temporary-consumer-prefix --json',
      false,
    )];
  }
  if (operation === 'rollback' && state === 'needs-user-action') {
    return [nextAction(
      'confirm-consumer-install',
      'Review the selected prior verified identity, then confirm the existing consumer install operation.',
      'lpc-toolkit asset distribution install --prefix-kind temporary-consumer-prefix --confirm --json',
      true,
    )];
  }
  if (operation === 'post-publication' && state === 'verified') {
    return [nextAction(
      'real-publication-approval-required',
      'A fake receipt was verified locally; real publication still requires separate maintainer approval.',
      'No real publication command is provided by the D4 local fixture seam.',
      false,
    )];
  }
  return [nextAction(
    'preserve-and-recover',
    'Preserve the exact local evidence and follow the bounded recovery action.',
    'lpc-toolkit asset doctor --json',
    false,
  )];
}

function auditFor(
  operation: 'verify' | 'fetch' | 'install' | 'rollback',
  capture: AssetDistributionRegistryCapture | undefined,
  diagnostics: readonly { readonly code: string }[],
  trust?: AssetDistributionTrustDecision,
): AssetDistributionAuditEvidence | undefined {
  const result = projectAssetDistributionOutcome({
    operation,
    diagnostics,
    ...(capture === undefined ? {} : {
      identity: {
        namespace: capture.release.release.namespace,
        packId: capture.release.release.packId,
        version: capture.release.release.version,
      },
      archiveDigest: capture.archiveDigest,
      recordDigest: capture.recordDigest,
      transportSourceId: capture.transport.sourceId,
    }),
    ...(trust === undefined ? {} : {
      policyId: trust.policyId,
      keyId: trust.keyId,
    }),
  });
  return result.ok ? result.audit : undefined;
}

function publicData(input: {
  readonly operation: AssetDistributionPublicOperation;
  readonly state: AssetDistributionPublicState;
  readonly decision?: AssetDistributionAuditEvidence['decision'];
  readonly scope: AssetDistributionPublicResponseData['scope'];
  readonly mutation?: AssetDistributionPublicResponseData['mutation'];
  readonly publication?: AssetDistributionPublicResponseData['publication'];
  readonly result?: AssetDistributionPublicResponseData['result'];
  readonly capture?: AssetDistributionRegistryCapture;
  readonly trust?: AssetDistributionPublicTrust;
  readonly package?: AssetDistributionPublicPackage;
  readonly audit?: AssetDistributionAuditEvidence;
}): AssetDistributionPublicResponseData {
  const decision = input.decision ?? (input.state === 'needs-user-action' ? 'verified' : input.state);
  return {
    schema: ASSET_DISTRIBUTION_VERIFICATION_SCHEMA,
    operation: input.operation,
    state: input.state,
    decision,
    scope: input.scope,
    mutation: input.mutation ?? 'none',
    publication: input.publication ?? 'not-performed',
    ...(input.result === undefined ? {} : { result: input.result }),
    ...(input.capture === undefined ? {} : {
      identity: identityOf(input.capture),
      archive: {
        digest: input.capture.archiveDigest,
        byteLength: input.capture.byteLength,
      },
    }),
    ...(input.trust === undefined ? {} : { trust: input.trust }),
    ...(input.package === undefined ? {} : { package: input.package }),
    ...(input.audit === undefined ? {} : { audit: input.audit }),
    nextActions: nextActions(input.operation, input.state),
  };
}

function responseError(
  command: string,
  response: { readonly ok: false; readonly issue: CliIssue },
): CliResponse<AssetDistributionPublicResponseData | null> {
  return commandError(command, response.issue);
}

function captureResponse(
  context: AssetDistributionCommandContext,
  operation: 'inspect' | 'fetch',
): CliResponse<AssetDistributionPublicResponseData | null> {
  const result = captureFixture(context);
  if (!result.ok) return responseError(context.parsed.command.join(' '), result);
  const diagnostics = result.captured.capture.availability === 'withdrawn'
    ? [{ code: 'asset_distribution_withdrawn' }]
    : [];
  const audit = auditFor(operation === 'inspect' ? 'verify' : 'fetch', result.captured.capture, diagnostics);
  if (audit === undefined) {
    return commandError(context.parsed.command.join(' '), issue('asset_distribution_audit_invalid', safeFixtureMessage('audit')));
  }
  return commandOk(context.parsed.command.join(' '), publicData({
    operation,
    state: audit.state,
    scope: operation === 'inspect' ? 'record-archive-capture' : 'local-fixture-fetch',
    result: 'captured',
    capture: result.captured.capture,
    audit,
  }));
}

function verifyResponse(
  context: AssetDistributionCommandContext,
): CliResponse<AssetDistributionPublicResponseData | null> {
  const result = verifyFixture(context);
  if (!result.ok) return responseError(context.parsed.command.join(' '), result);
  const diagnostics = [
    ...(result.verified.trustDecision.status === 'trusted'
      ? []
      : [{ code: result.verified.trustDecision.code }]),
    ...(result.verified.capture.availability === 'withdrawn'
      ? [{ code: 'asset_distribution_withdrawn' }]
      : []),
  ];
  const audit = auditFor('verify', result.verified.capture, diagnostics, result.verified.trustDecision);
  if (audit === undefined) {
    return commandError(context.parsed.command.join(' '), issue('asset_distribution_audit_invalid', safeFixtureMessage('audit')));
  }
  const trust: AssetDistributionPublicTrust = {
    status: result.verified.trustDecision.status,
    policyId: result.verified.trustDecision.policyId,
    keyId: result.verified.trustDecision.keyId,
    signatureVerified: result.verified.signatureVerified,
  };
  return commandOk(context.parsed.command.join(' '), publicData({
    operation: 'verify',
    state: audit.state,
    scope: 'record-archive-trust',
    result: audit.state === 'verified' ? 'trusted' : undefined,
    capture: result.verified.capture,
    trust,
    audit,
  }));
}

function parseInstallEvidence(value: unknown): AssetDistributionConsumerInstallEvidence | undefined {
  if (!isRecord(value)) return undefined;
  if (
    value.ok !== true
    || value.decision !== 'publishable'
    || !digestField(value.releaseEvidenceDigest)
    || !digestField(value.creditsDigest)
    || !digestField(value.licenseEvidenceDigest)
  ) return undefined;
  return {
    ok: true,
    decision: 'publishable',
    releaseEvidenceDigest: value.releaseEvidenceDigest,
    creditsDigest: value.creditsDigest,
    licenseEvidenceDigest: value.licenseEvidenceDigest,
    ...(digestField(value.provenanceDigest) ? { provenanceDigest: value.provenanceDigest } : {}),
    ...(digestField(value.providerEvidenceDigest) ? { providerEvidenceDigest: value.providerEvidenceDigest } : {}),
    ...(digestField(value.handoffEvidenceDigest) ? { handoffEvidenceDigest: value.handoffEvidenceDigest } : {}),
  };
}

async function installResponse(
  context: AssetDistributionCommandContext,
): Promise<CliResponse<AssetDistributionPublicResponseData | null>> {
  const prefixKind = flagString(context.parsed.flags, 'prefix-kind');
  if (prefixKind === 'system-wide-prefix') {
    const audit = auditFor('install', undefined, [{ code: 'asset_distribution_external_mutation_blocked' }]);
    if (audit === undefined) return commandError(context.parsed.command.join(' '), issue('asset_distribution_audit_invalid', safeFixtureMessage('audit')));
    return commandOk(context.parsed.command.join(' '), publicData({
      operation: 'install',
      state: 'blocked',
      scope: 'temporary-consumer-prefix',
      audit,
    }));
  }
  if (context.workspace === undefined || context.runtime === undefined) {
    return commandError(context.parsed.command.join(' '), issue('asset_workspace_not_found', 'A temporary consumer workspace is required.', '--workspace'));
  }
  const verified = verifyFixture(context);
  if (!verified.ok) return responseError(context.parsed.command.join(' '), verified);
  const evidenceFixture = readLocalFixture(context.cwd, 'evidence', flagString(context.parsed.flags, 'evidence'));
  if (!evidenceFixture.ok) return responseError(context.parsed.command.join(' '), evidenceFixture);
  const evidence = parseInstallEvidence(evidenceFixture.value);
  if (evidence === undefined) {
    return commandError(context.parsed.command.join(' '), issue('asset_distribution_release_evidence_invalid', safeFixtureMessage('release evidence'), '--evidence'));
  }
  const diagnostics = [
    ...(verified.verified.trustDecision.status === 'trusted' ? [] : [{ code: verified.verified.trustDecision.code }]),
    ...(verified.verified.capture.availability === 'withdrawn' ? [{ code: 'asset_distribution_withdrawn' }] : []),
  ];
  if (diagnostics.length > 0) {
    const audit = auditFor('install', verified.verified.capture, diagnostics, verified.verified.trustDecision);
    if (audit === undefined) return commandError(context.parsed.command.join(' '), issue('asset_distribution_audit_invalid', safeFixtureMessage('audit')));
    return commandOk(context.parsed.command.join(' '), publicData({
      operation: 'install',
      state: audit.state,
      scope: 'temporary-consumer-prefix',
      capture: verified.verified.capture,
      trust: {
        status: verified.verified.trustDecision.status,
        policyId: verified.verified.trustDecision.policyId,
        keyId: verified.verified.trustDecision.keyId,
        signatureVerified: verified.verified.signatureVerified,
      },
      audit,
    }));
  }
  const archiveFlag = flagString(context.parsed.flags, 'archive');
  const install = await installAssetDistributionToConsumerPrefix({
    prefixKind: 'temporary-consumer-prefix',
    confirm: flagBoolean(context.parsed.flags, 'confirm'),
    allowDowngrade: flagBoolean(context.parsed.flags, 'allow-downgrade'),
    archivePath: path.resolve(context.cwd, archiveFlag ?? ''),
    capture: verified.verified.capture,
    release: verified.verified.release,
    trustDecision: verified.verified.trustDecision,
    evidence,
    workspace: context.workspace,
    runtime: context.runtime,
    supportedCapabilities: [...AUTHORING_CAPABILITIES, ...ASSET_DISTRIBUTION_CAPABILITIES],
  });
  if (!install.ok) {
    const audit = auditFor('install', verified.verified.capture, install.diagnostics, verified.verified.trustDecision);
    if (audit === undefined) return commandError(context.parsed.command.join(' '), issue('asset_distribution_audit_invalid', safeFixtureMessage('audit')));
    return commandOk(context.parsed.command.join(' '), publicData({
      operation: 'install',
      state: audit.state,
      scope: 'temporary-consumer-prefix',
      capture: verified.verified.capture,
      trust: {
        status: verified.verified.trustDecision.status,
        policyId: verified.verified.trustDecision.policyId,
        keyId: verified.verified.trustDecision.keyId,
        signatureVerified: verified.verified.signatureVerified,
      },
      audit,
    }));
  }
  const audit = auditFor('install', verified.verified.capture, [], verified.verified.trustDecision);
  if (audit === undefined) return commandError(context.parsed.command.join(' '), issue('asset_distribution_audit_invalid', safeFixtureMessage('audit')));
  const state: AssetDistributionPublicState = install.state === 'needs-user-action' ? 'needs-user-action' : 'verified';
  return commandOk(context.parsed.command.join(' '), publicData({
    operation: 'install',
    state,
    decision: 'verified',
    scope: 'temporary-consumer-prefix',
    mutation: 'temporary-consumer-prefix-only',
    result: install.state === 'needs-user-action' ? 'confirmation-required' : 'installed',
    capture: verified.verified.capture,
    trust: {
      status: verified.verified.trustDecision.status,
      policyId: verified.verified.trustDecision.policyId,
      keyId: verified.verified.trustDecision.keyId,
      signatureVerified: verified.verified.signatureVerified,
    },
    audit,
  }));
}

function parseRollbackCandidates(value: unknown): readonly AssetDistributionRollbackCandidate[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const candidates: AssetDistributionRollbackCandidate[] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate)
      || !stringField(candidate.identityKey)
      || !IDENTITY_PATTERN.test(candidate.identityKey)
      || !stringField(candidate.namespace)
      || !stringField(candidate.packId)
      || !stringField(candidate.version)
      || !digestField(candidate.archiveDigest)
      || !digestField(candidate.recordDigest)
      || (candidate.state !== 'verified' && candidate.state !== 'withdrawn')
    ) return undefined;
    candidates.push({
      identityKey: candidate.identityKey,
      namespace: candidate.namespace,
      packId: candidate.packId,
      version: candidate.version,
      archiveDigest: candidate.archiveDigest,
      recordDigest: candidate.recordDigest,
      state: candidate.state,
    });
  }
  return candidates;
}

async function rollbackResponse(
  context: AssetDistributionCommandContext,
): Promise<CliResponse<AssetDistributionPublicResponseData | null>> {
  const candidatesFixture = readLocalFixture(context.cwd, 'candidates', flagString(context.parsed.flags, 'candidates'));
  if (!candidatesFixture.ok) return responseError(context.parsed.command.join(' '), candidatesFixture);
  const candidates = parseRollbackCandidates(candidatesFixture.value);
  if (candidates === undefined) return commandError(context.parsed.command.join(' '), issue('asset_distribution_rollback_candidates_invalid', safeFixtureMessage('rollback candidates'), '--candidates'));
  const currentIdentityKey = flagString(context.parsed.flags, 'current');
  const selectedIdentityKey = flagString(context.parsed.flags, 'selected');
  const priorReceiptDigest = flagString(context.parsed.flags, 'prior-receipt-digest');
  const selected = selectAssetDistributionRollbackRelease({
    ...(currentIdentityKey === undefined ? {} : { currentIdentityKey }),
    candidates,
    ...(selectedIdentityKey === undefined ? {} : { selectedIdentityKey }),
    ...(priorReceiptDigest === undefined ? {} : { priorReceiptDigest }),
  });
  if (!selected.ok) {
    const audit = auditFor('rollback', undefined, selected.diagnostics);
    if (audit === undefined) return commandError(context.parsed.command.join(' '), issue('asset_distribution_audit_invalid', safeFixtureMessage('audit')));
    return commandOk(context.parsed.command.join(' '), publicData({
      operation: 'rollback',
      state: audit.state,
      scope: 'rollback-selection',
      audit,
    }));
  }
  const audit = auditFor('rollback', undefined, []);
  if (audit === undefined) return commandError(context.parsed.command.join(' '), issue('asset_distribution_audit_invalid', safeFixtureMessage('audit')));
  const candidate = selected.selection.candidate;
  return commandOk(context.parsed.command.join(' '), publicData({
    operation: 'rollback',
    state: 'needs-user-action',
    decision: 'verified',
    scope: 'rollback-selection',
    result: 'rollback-selected',
    audit: {
      ...audit,
      identity: {
        namespace: candidate.namespace,
        packId: candidate.packId,
        version: candidate.version,
      },
      archiveDigest: candidate.archiveDigest,
      recordDigest: candidate.recordDigest,
      ...(selected.selection.priorReceiptDigest === undefined ? {} : { priorReceiptDigest: selected.selection.priorReceiptDigest }),
    },
  }));
}

function packageInspection(value: unknown): AssetDistributionPackageInspection | undefined {
  if (!isRecord(value) || value.schema !== 'lpc-toolkit.asset-distribution-package-inspection.v1' || !digestField(value.inspectionDigest)) return undefined;
  const packageValue = value.package;
  const tarball = value.tarball;
  const entrypoint = value.entrypoint;
  const evidence = value.releaseEvidence;
  const archive = value.lpcArchive;
  if (!isRecord(packageValue) || !isRecord(tarball) || !isRecord(entrypoint) || !isRecord(evidence) || !isRecord(archive)) return undefined;
  if (
    !stringField(packageValue.name)
    || !stringField(packageValue.version)
    || packageValue.license !== 'GPL-3.0-or-later'
    || packageValue.binPath !== './dist/index.js'
    || !digestField(packageValue.manifestDigest)
    || typeof tarball.byteLength !== 'number'
    || !Number.isInteger(tarball.byteLength)
    || tarball.byteLength <= 0
    || !digestField(tarball.sha256)
    || !stringField(tarball.integrity)
    || !INTEGRITY_PATTERN.test(tarball.integrity)
    || entrypoint.path !== 'package/dist/index.js'
    || !digestField(entrypoint.digest)
    || !digestField(entrypoint.helpDigest)
    || !stringField(entrypoint.version)
    || !stringField(evidence.commit)
    || !COMMIT_PATTERN.test(evidence.commit)
    || (evidence.tag !== undefined && (!stringField(evidence.tag) || !/^v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/u.test(evidence.tag)))
    || !digestField(evidence.ciEvidenceDigest)
    || (evidence.assetReleaseEvidenceDigest !== undefined && !digestField(evidence.assetReleaseEvidenceDigest))
  ) return undefined;
  if (archive.state !== 'not-bound' && archive.state !== 'bound') return undefined;
  const lpcArchive = archive.state === 'bound'
    ? (!digestField(archive.releaseEvidenceDigest)
      ? undefined
      : { state: 'bound' as const, releaseEvidenceDigest: archive.releaseEvidenceDigest })
    : { state: 'not-bound' as const };
  if (lpcArchive === undefined) return undefined;
  return {
    schema: 'lpc-toolkit.asset-distribution-package-inspection.v1',
    inspectionDigest: value.inspectionDigest,
    package: {
      name: packageValue.name,
      version: packageValue.version,
      license: 'GPL-3.0-or-later',
      binPath: './dist/index.js',
      manifestDigest: packageValue.manifestDigest,
    },
    tarball: {
      byteLength: tarball.byteLength,
      sha256: tarball.sha256,
      integrity: tarball.integrity,
    },
    entrypoint: {
      path: 'package/dist/index.js',
      digest: entrypoint.digest,
      helpDigest: entrypoint.helpDigest,
      version: entrypoint.version,
    },
    releaseEvidence: {
      commit: evidence.commit,
      ...(evidence.tag === undefined ? {} : { tag: evidence.tag }),
      ciEvidenceDigest: evidence.ciEvidenceDigest,
      ...(evidence.assetReleaseEvidenceDigest === undefined ? {} : { assetReleaseEvidenceDigest: evidence.assetReleaseEvidenceDigest }),
    },
    lpcArchive,
  };
}

async function postPublicationResponse(
  context: AssetDistributionCommandContext,
): Promise<CliResponse<AssetDistributionPublicResponseData | null>> {
  const inspectionFixture = readLocalFixture(context.cwd, 'inspection', flagString(context.parsed.flags, 'inspection'));
  if (!inspectionFixture.ok) return responseError(context.parsed.command.join(' '), inspectionFixture);
  const receiptFixture = readLocalFixture(context.cwd, 'receipt', flagString(context.parsed.flags, 'receipt'));
  if (!receiptFixture.ok) return responseError(context.parsed.command.join(' '), receiptFixture);
  const inspection = packageInspection(inspectionFixture.value);
  if (inspection === undefined) return commandError(context.parsed.command.join(' '), issue('asset_distribution_package_inspection_invalid', safeFixtureMessage('package inspection'), '--inspection'));
  const transport = flagString(context.parsed.flags, 'transport') as 'fake-npm' | 'fake-marketplace' | undefined;
  const verified = verifyAssetDistributionPackageReceipt({
    inspection,
    receipt: receiptFixture.value,
    ...(transport === undefined ? {} : { expectedTransport: transport }),
  });
  if (!verified.ok) {
    const audit = auditFor('verify', undefined, verified.diagnostics);
    if (audit === undefined) return commandError(context.parsed.command.join(' '), issue('asset_distribution_audit_invalid', safeFixtureMessage('audit')));
    return commandOk(context.parsed.command.join(' '), publicData({
      operation: 'post-publication',
      state: audit.state,
      scope: 'fake-package-receipt',
      audit,
    }));
  }
  return commandOk(context.parsed.command.join(' '), publicData({
    operation: 'post-publication',
    state: 'verified',
    scope: 'fake-package-receipt',
    result: 'fake-receipt-verified',
    publication: 'fake-receipt-verified',
    package: {
      name: inspection.package.name,
      version: inspection.package.version,
      transport: verified.verification.packageTransport.kind,
      ...(verified.verification.packageTransport.publicationId === undefined ? {} : { publicationId: verified.verification.packageTransport.publicationId }),
    },
  }));
}

export async function runAssetDistributionCommand(
  context: AssetDistributionCommandContext,
): Promise<CliResponse<AssetDistributionPublicResponseData | null>> {
  const operation = context.parsed.command[2];
  switch (operation) {
    case 'inspect':
      return captureResponse(context, 'inspect');
    case 'fetch':
      return captureResponse(context, 'fetch');
    case 'verify':
      return verifyResponse(context);
    case 'install':
      return installResponse(context);
    case 'rollback':
      return rollbackResponse(context);
    case 'post-publication':
      return postPublicationResponse(context);
    default:
      return commandError(context.parsed.command.join(' '), issue('unknown_command', `Unknown asset distribution command: ${context.parsed.command.join(' ')}`));
  }
}

export function assetDistributionResponseFailed(
  response: CliResponse<unknown>,
): boolean {
  if (!response.ok || !response.command.startsWith('asset distribution ')) return false;
  if (!isRecord(response.data)) return true;
  const state = response.data.state;
  return state !== 'verified' && state !== 'needs-user-action';
}
