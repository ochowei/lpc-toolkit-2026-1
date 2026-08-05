import {
  inspectAssetPackTransactionRecoveryEligibility,
  recoverAssetPackTransaction,
  type AssetPackRecoveryAction,
  type AssetTransactionFileOps,
} from './asset-pack-transaction.js';
import type {
  AssetDistributionRegistryCapture,
} from './asset-distribution-transport.js';
import type { AssetWorkspace } from './asset-workspace.js';

export const ASSET_DISTRIBUTION_AUDIT_SCHEMA =
  'lpc-toolkit.asset-distribution-audit.v1' as const;
export const ASSET_DISTRIBUTION_QUARANTINE_SCHEMA =
  'lpc-toolkit.asset-distribution-quarantine.v1' as const;

export type AssetDistributionAuditState =
  | 'blocked'
  | 'tampered'
  | 'untrusted'
  | 'conflict'
  | 'withdrawn'
  | 'recoverable'
  | 'verified';

export type AssetDistributionAuditOperation =
  | 'verify'
  | 'fetch'
  | 'publish'
  | 'install'
  | 'rollback'
  | 'recover';

export type AssetDistributionRecoveryAction =
  | 'none'
  | 'obtain-fresh-authorized-evidence'
  | 'preserve-and-refetch-exact-pair'
  | 'use-authorized-key-policy'
  | 'select-existing-or-greater-version'
  | 'select-prior-verified-release'
  | 'resume-or-discard-local-transaction'
  | 'rollback-local-transaction'
  | 'complete-local-transaction';

export interface AssetDistributionAuditDiagnostic {
  readonly code: string;
  readonly message: string;
}

export interface AssetDistributionAuditInput {
  readonly operation: AssetDistributionAuditOperation;
  readonly diagnostics: readonly { readonly code: string }[];
  readonly recoveryAvailable?: boolean;
  readonly identity?: {
    readonly namespace: string;
    readonly packId: string;
    readonly version: string;
  };
  readonly archiveDigest?: string;
  readonly recordDigest?: string;
  readonly policyId?: string;
  readonly keyId?: string;
  readonly transportSourceId?: string;
  readonly priorReceiptDigest?: string;
  readonly recoveryAction?: AssetDistributionRecoveryAction;
}

export interface AssetDistributionAuditEvidence {
  readonly schema: typeof ASSET_DISTRIBUTION_AUDIT_SCHEMA;
  readonly operation: AssetDistributionAuditOperation;
  readonly state: AssetDistributionAuditState;
  readonly decision: AssetDistributionAuditState;
  readonly diagnosticCodes: readonly string[];
  readonly identity?: {
    readonly namespace: string;
    readonly packId: string;
    readonly version: string;
  };
  readonly archiveDigest?: string;
  readonly recordDigest?: string;
  readonly policyId?: string;
  readonly keyId?: string;
  readonly transportSourceId?: string;
  readonly priorReceiptDigest?: string;
  readonly recoveryAction: AssetDistributionRecoveryAction;
  readonly nextAction:
    | 'none'
    | 'refetch-authorized-record'
    | 'preserve-and-refetch-exact-pair'
    | 'select-authorized-key-policy'
    | 'select-existing-or-greater-version'
    | 'select-prior-verified-release'
    | 'resume-or-discard-local-transaction';
}

export type AssetDistributionAuditResult =
  | { readonly ok: true; readonly audit: AssetDistributionAuditEvidence }
  | { readonly ok: false; readonly diagnostics: readonly AssetDistributionAuditDiagnostic[] };

export interface AssetDistributionQuarantineEvidence {
  readonly schema: typeof ASSET_DISTRIBUTION_QUARANTINE_SCHEMA;
  readonly state: 'quarantined';
  readonly reason: 'withdrawn' | 'compromised';
  readonly identityKey: string;
  readonly archiveDigest: string;
  readonly recordDigest: string;
  readonly priorReceiptDigest?: string;
  readonly preservedEvidence: true;
  readonly nextAction: 'select-prior-verified-release';
}

export type AssetDistributionQuarantineResult =
  | { readonly ok: true; readonly quarantine: AssetDistributionQuarantineEvidence }
  | { readonly ok: false; readonly diagnostics: readonly AssetDistributionAuditDiagnostic[] };

export interface AssetDistributionRollbackCandidate {
  readonly identityKey: string;
  readonly namespace: string;
  readonly packId: string;
  readonly version: string;
  readonly archiveDigest: string;
  readonly recordDigest: string;
  readonly state: 'verified' | 'withdrawn';
}

export interface AssetDistributionRollbackSelection {
  readonly state: 'selected';
  readonly mutation: 'none';
  readonly candidate: AssetDistributionRollbackCandidate;
  readonly priorReceiptDigest?: string;
  readonly nextAction: 'confirm-consumer-install';
}

export type AssetDistributionRollbackResult =
  | { readonly ok: true; readonly selection: AssetDistributionRollbackSelection }
  | { readonly ok: false; readonly diagnostics: readonly AssetDistributionAuditDiagnostic[] };

export type AssetDistributionConsumerRecoveryResult =
  | {
    readonly ok: true;
    readonly state: 'needs-user-action' | 'recovered';
    readonly action: 'confirmation-required' | AssetPackRecoveryAction;
    readonly audit: AssetDistributionAuditEvidence;
  }
  | {
    readonly ok: false;
    readonly diagnostics: readonly AssetDistributionAuditDiagnostic[];
    readonly audit: AssetDistributionAuditEvidence;
  };

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const IDENTIFIER_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;
const PACK_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const IDENTITY_PATTERN = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9]+(?:[.-][a-z0-9]+)*@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?#sha256:[0-9a-f]{64}$/u;

function invalid(
  code: string,
  message: string,
): AssetDistributionAuditDiagnostic {
  return { code, message };
}

function failure(
  diagnostic: AssetDistributionAuditDiagnostic,
): { readonly ok: false; readonly diagnostics: readonly AssetDistributionAuditDiagnostic[] } {
  return { ok: false, diagnostics: [diagnostic] };
}

function validDigest(value: string | undefined): boolean {
  return value === undefined || DIGEST_PATTERN.test(value);
}

function validIdentifier(value: string | undefined): boolean {
  return value === undefined || (value.length <= 128 && IDENTIFIER_PATTERN.test(value));
}

function validPolicyOrKeyIdentifier(value: string | undefined): boolean {
  return value === undefined || validIdentifier(value) || DIGEST_PATTERN.test(value);
}

function validIdentity(identity: AssetDistributionAuditInput['identity']): boolean {
  return identity === undefined
    || (
      IDENTIFIER_PATTERN.test(identity.namespace)
      && PACK_ID_PATTERN.test(identity.packId)
      && VERSION_PATTERN.test(identity.version)
    );
}

function diagnosticCodes(
  diagnostics: readonly { readonly code: string }[],
): readonly string[] {
  return [...new Set(
    diagnostics
      .map((diagnostic) => diagnostic.code)
      .filter((code) => /^[a-z0-9_:-]{1,128}$/u.test(code)),
  )].sort((left, right) => left.localeCompare(right));
}

function includesCode(codes: readonly string[], pattern: RegExp): boolean {
  return codes.some((code) => pattern.test(code));
}

function stateFor(input: AssetDistributionAuditInput): AssetDistributionAuditState {
  const codes = diagnosticCodes(input.diagnostics);
  if (codes.length === 0) return 'verified';
  if (includesCode(codes, /(?:withdrawn|withdrawal)/u)) return 'withdrawn';
  if (includesCode(codes, /(?:key_untrusted|key_revoked|key_expired|signature_invalid|namespace_unauthorized|trust)/u)) return 'untrusted';
  if (includesCode(codes, /(?:archive_tampered|archive_.*mismatch|listing_.*drift|tampered|record_mismatch)/u)) return 'tampered';
  if (includesCode(codes, /(?:version_conflict|mirror_disagreement|conflict)/u)) return 'conflict';
  if (includesCode(codes, /(?:recovery_required|transaction_unsafe)/u)) return 'recoverable';
  if (
    includesCode(codes, /asset_publish_failed/u)
    && (input.recoveryAvailable === true || input.operation === 'recover' || input.operation === 'publish' || input.operation === 'install')
  ) return 'recoverable';
  return 'blocked';
}

function defaultRecoveryAction(state: AssetDistributionAuditState): AssetDistributionRecoveryAction {
  const actions: Readonly<Record<AssetDistributionAuditState, AssetDistributionRecoveryAction>> = {
    blocked: 'obtain-fresh-authorized-evidence',
    tampered: 'preserve-and-refetch-exact-pair',
    untrusted: 'use-authorized-key-policy',
    conflict: 'select-existing-or-greater-version',
    withdrawn: 'select-prior-verified-release',
    recoverable: 'resume-or-discard-local-transaction',
    verified: 'none',
  };
  return actions[state];
}

function defaultNextAction(state: AssetDistributionAuditState): AssetDistributionAuditEvidence['nextAction'] {
  const actions: Readonly<Record<AssetDistributionAuditState, AssetDistributionAuditEvidence['nextAction']>> = {
    blocked: 'refetch-authorized-record',
    tampered: 'preserve-and-refetch-exact-pair',
    untrusted: 'select-authorized-key-policy',
    conflict: 'select-existing-or-greater-version',
    withdrawn: 'select-prior-verified-release',
    recoverable: 'resume-or-discard-local-transaction',
    verified: 'none',
  };
  return actions[state];
}

export function projectAssetDistributionOutcome(
  input: AssetDistributionAuditInput,
): AssetDistributionAuditResult {
  if (!validIdentity(input.identity)) {
    return failure(invalid(
      'asset_distribution_invalid',
      'Audit identity is not normalized and cannot be recorded.',
    ));
  }
  if (
    !validDigest(input.archiveDigest)
    || !validDigest(input.recordDigest)
    || !validPolicyOrKeyIdentifier(input.policyId)
    || !validPolicyOrKeyIdentifier(input.keyId)
    || !validDigest(input.priorReceiptDigest)
  ) {
    return failure(invalid(
      'asset_distribution_invalid',
      'Audit evidence digests must be sha256 values.',
    ));
  }
  if (!validIdentifier(input.transportSourceId)) {
    return failure(invalid(
      'asset_distribution_invalid',
      'Audit transport source must be a bounded fixture identifier.',
    ));
  }
  const state = stateFor(input);
  const codes = diagnosticCodes(input.diagnostics);
  const audit: AssetDistributionAuditEvidence = {
    schema: ASSET_DISTRIBUTION_AUDIT_SCHEMA,
    operation: input.operation,
    state,
    decision: state,
    diagnosticCodes: codes,
    ...(input.identity === undefined ? {} : { identity: input.identity }),
    ...(input.archiveDigest === undefined ? {} : { archiveDigest: input.archiveDigest }),
    ...(input.recordDigest === undefined ? {} : { recordDigest: input.recordDigest }),
    ...(input.policyId === undefined ? {} : { policyId: input.policyId }),
    ...(input.keyId === undefined ? {} : { keyId: input.keyId }),
    ...(input.transportSourceId === undefined ? {} : { transportSourceId: input.transportSourceId }),
    ...(input.priorReceiptDigest === undefined ? {} : { priorReceiptDigest: input.priorReceiptDigest }),
    recoveryAction: input.recoveryAction ?? defaultRecoveryAction(state),
    nextAction: defaultNextAction(state),
  };
  return { ok: true, audit };
}

function captureIdentity(capture: AssetDistributionRegistryCapture): string {
  const release = capture.release.release;
  return `${release.namespace}/${release.packId}@${release.version}#${release.archiveDigest}`;
}

export function quarantineAssetDistributionRelease(input: {
  readonly capture: AssetDistributionRegistryCapture;
  readonly reason: 'withdrawn' | 'compromised';
  readonly priorReceiptDigest?: string;
}): AssetDistributionQuarantineResult {
  if (
    input.reason === 'withdrawn'
    && input.capture.availability !== 'withdrawn'
  ) {
    return failure(invalid(
      'asset_distribution_withdrawn',
      'Only a captured withdrawn release may be quarantined as withdrawn.',
    ));
  }
  const identityKey = captureIdentity(input.capture);
  if (
    identityKey !== input.capture.identityKey
    || !DIGEST_PATTERN.test(input.capture.archiveDigest)
    || !DIGEST_PATTERN.test(input.capture.recordDigest)
    || !validDigest(input.priorReceiptDigest)
  ) {
    return failure(invalid(
      'asset_distribution_record_mismatch',
      'Quarantine evidence does not match the exact captured release identity.',
    ));
  }
  return {
    ok: true,
    quarantine: {
      schema: ASSET_DISTRIBUTION_QUARANTINE_SCHEMA,
      state: 'quarantined',
      reason: input.reason,
      identityKey,
      archiveDigest: input.capture.archiveDigest,
      recordDigest: input.capture.recordDigest,
      ...(input.priorReceiptDigest === undefined ? {} : { priorReceiptDigest: input.priorReceiptDigest }),
      preservedEvidence: true,
      nextAction: 'select-prior-verified-release',
    },
  };
}

export function selectAssetDistributionRollbackRelease(input: {
  readonly currentIdentityKey?: string;
  readonly candidates: readonly AssetDistributionRollbackCandidate[];
  readonly selectedIdentityKey?: string;
  readonly priorReceiptDigest?: string;
}): AssetDistributionRollbackResult {
  if (input.selectedIdentityKey === undefined) {
    return failure(invalid(
      'asset_distribution_rollback_selection_required',
      'Rollback requires one explicitly selected prior verified release identity.',
    ));
  }
  if (!IDENTITY_PATTERN.test(input.selectedIdentityKey)) {
    return failure(invalid(
      'asset_distribution_record_mismatch',
      'Selected rollback identity is not normalized.',
    ));
  }
  if (input.currentIdentityKey === input.selectedIdentityKey) {
    return failure(invalid(
      'asset_distribution_rollback_selection_required',
      'Rollback selection must identify a prior release, not the current release.',
    ));
  }
  if (!validDigest(input.priorReceiptDigest)) {
    return failure(invalid(
      'asset_distribution_invalid',
      'Rollback prior receipt evidence must be a sha256 digest.',
    ));
  }
  const matches = input.candidates.filter((candidate) => candidate.identityKey === input.selectedIdentityKey);
  if (matches.length !== 1) {
    return failure(invalid(
      'asset_distribution_record_mismatch',
      'Rollback selection does not identify exactly one immutable candidate.',
    ));
  }
  const candidate = matches[0]!;
  if (candidate.state === 'withdrawn') {
    return failure(invalid(
      'asset_distribution_withdrawn',
      'A withdrawn release cannot be selected for rollback.',
    ));
  }
  if (
    !IDENTIFIER_PATTERN.test(candidate.namespace)
    || !PACK_ID_PATTERN.test(candidate.packId)
    || !VERSION_PATTERN.test(candidate.version)
    || !IDENTITY_PATTERN.test(candidate.identityKey)
    || !DIGEST_PATTERN.test(candidate.archiveDigest)
    || !DIGEST_PATTERN.test(candidate.recordDigest)
  ) {
    return failure(invalid(
      'asset_distribution_invalid',
      'Rollback candidate evidence is not normalized.',
    ));
  }
  const expectedIdentity = `${candidate.namespace}/${candidate.packId}@${candidate.version}#${candidate.archiveDigest}`;
  if (candidate.identityKey !== expectedIdentity) {
    return failure(invalid(
      'asset_distribution_record_mismatch',
      'Rollback candidate identity does not bind its exact archive digest.',
    ));
  }
  return {
    ok: true,
    selection: {
      state: 'selected',
      mutation: 'none',
      candidate,
      ...(input.priorReceiptDigest === undefined ? {} : { priorReceiptDigest: input.priorReceiptDigest }),
      nextAction: 'confirm-consumer-install',
    },
  };
}

function recoveryAudit(input: {
  readonly priorReceiptDigest: string | undefined;
  readonly diagnostics: readonly { readonly code: string }[];
  readonly recoveryAction?: AssetDistributionRecoveryAction;
}): AssetDistributionAuditEvidence {
  const projected = projectAssetDistributionOutcome({
    operation: 'recover',
    diagnostics: input.diagnostics,
    recoveryAvailable: input.diagnostics.length > 0,
    ...(input.priorReceiptDigest === undefined ? {} : { priorReceiptDigest: input.priorReceiptDigest }),
    ...(input.recoveryAction === undefined ? {} : { recoveryAction: input.recoveryAction }),
  });
  if (!projected.ok) {
    return {
      schema: ASSET_DISTRIBUTION_AUDIT_SCHEMA,
      operation: 'recover',
      state: 'blocked',
      decision: 'blocked',
      diagnosticCodes: ['asset_distribution_invalid'],
      ...(input.priorReceiptDigest === undefined ? {} : { priorReceiptDigest: input.priorReceiptDigest }),
      recoveryAction: 'obtain-fresh-authorized-evidence',
      nextAction: 'refetch-authorized-record',
    };
  }
  return projected.audit;
}

export function recoverAssetDistributionConsumerPrefix(input: {
  readonly workspace: AssetWorkspace;
  readonly confirm: boolean;
  readonly priorReceiptDigest?: string;
  readonly fileOps?: AssetTransactionFileOps;
}): AssetDistributionConsumerRecoveryResult {
  if (!validDigest(input.priorReceiptDigest)) {
    return {
      ok: false,
      diagnostics: [invalid(
        'asset_distribution_invalid',
        'Recovery prior receipt evidence must be a sha256 digest.',
      )],
      audit: recoveryAudit({
        priorReceiptDigest: undefined,
        diagnostics: [{ code: 'asset_distribution_invalid' }],
      }),
    };
  }
  const eligibility = inspectAssetPackTransactionRecoveryEligibility({
    workspace: input.workspace,
    ...(input.fileOps === undefined ? {} : { fileOps: input.fileOps }),
  });
  if (eligibility.status === 'idle') {
    return {
      ok: true,
      state: 'recovered',
      action: 'none',
      audit: recoveryAudit({
        priorReceiptDigest: input.priorReceiptDigest,
        diagnostics: [],
      }),
    };
  }
  if (eligibility.status === 'unsafe') {
    return {
      ok: false,
      diagnostics: [invalid(
        'asset_distribution_recovery_required',
        'The local transaction recovery state is unsafe and requires owner review.',
      )],
      audit: recoveryAudit({
        priorReceiptDigest: input.priorReceiptDigest,
        diagnostics: [{ code: 'asset_distribution_recovery_required' }],
      }),
    };
  }
  if (!input.confirm) {
    return {
      ok: true,
      state: 'needs-user-action',
      action: 'confirmation-required',
      audit: recoveryAudit({
        priorReceiptDigest: input.priorReceiptDigest,
        diagnostics: [{ code: 'asset_distribution_recovery_required' }],
      }),
    };
  }
  const recovered = recoverAssetPackTransaction({
    workspace: input.workspace,
    ...(input.fileOps === undefined ? {} : { fileOps: input.fileOps }),
  });
  if (!recovered.ok) {
    return {
      ok: false,
      diagnostics: [invalid(
        'asset_distribution_recovery_required',
        'The local transaction owner could not complete recovery safely.',
      )],
      audit: recoveryAudit({
        priorReceiptDigest: input.priorReceiptDigest,
        diagnostics: [{ code: 'asset_distribution_recovery_required' }],
      }),
    };
  }
  const recoveryAction: AssetDistributionRecoveryAction = recovered.action === 'rolled-back'
    ? 'rollback-local-transaction'
    : recovered.action === 'completed'
      ? 'complete-local-transaction'
      : 'none';
  return {
    ok: true,
    state: 'recovered',
    action: recovered.action,
    audit: recoveryAudit({
      priorReceiptDigest: input.priorReceiptDigest,
      diagnostics: [],
      recoveryAction,
    }),
  };
}
