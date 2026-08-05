import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  ASSET_AUTHORING_RELEASE_ARTIFACT_IDS,
  assetAuthoringReleaseReceiptDigestInput,
  assetProviderInvocationDigestInput,
  parseAssetProviderInvocation,
  parseAssetProviderRefusal,
  parseAssetProviderResult,
  parseAssetAuthoringPlan,
  parseAssetAuthoringReleaseReceipt,
  type AssetAuthoringPlan,
  type AssetAuthoringPreviewAcceptanceReceipt as CoreAssetAuthoringPreviewAcceptanceReceipt,
  type AssetAuthoringReleaseArtifactDigest,
  type AssetAuthoringReleaseDeclarationReceipt as CoreAssetAuthoringReleaseDeclarationReceipt,
  type AssetProviderInvocation,
  type AssetProviderRefusal,
  type AssetProviderResult,
} from '@lpc-toolkit/core';
import { CLI_VERSION } from './package-info.js';
import {
  assetAuthoringSessionsRoot,
  type AssetWorkspace,
} from './asset-workspace.js';
import type {
  AuthoringCheckpointFreshness,
  AuthoringGoal,
  AuthoringPhase,
  AuthoringState,
} from './response.js';

export const ASSET_AUTHORING_SESSION_SCHEMA =
  'lpc-toolkit.asset-authoring-session.v1' as const;
export const ASSET_AUTHORING_SESSION_FILE = 'session.json' as const;

const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const AUTHORING_PHASES: readonly AuthoringPhase[] = [
  'planned',
  'scaffolded',
  'contract-ready',
  'awaiting-candidate',
  'imported',
  'validated',
  'previewed',
  'blocked',
];
const AUTHORING_STATES: readonly AuthoringState[] = [
  'completed',
  'needs-user-action',
  'failed',
];
const CHECKPOINT_FRESHNESS_VALUES: readonly AuthoringCheckpointFreshness[] = [
  'missing',
  'current',
  'stale',
  'blocked',
];
const SESSION_KEYS = [
  'schema',
  'sessionId',
  'workspaceRoot',
  'packRoot',
  'cliVersion',
  'goal',
  'plan',
  'state',
  'reason',
  'phase',
  'checkpoint',
  'checkpointFreshness',
  'checkpoints',
  'receipts',
  'provenance',
  'conflict',
  'manifestDigest',
  'createdAt',
  'updatedAt',
] as const;

export type AssetAuthoringSessionErrorCode =
  | 'asset_authoring_session_invalid'
  | 'asset_authoring_session_not_found'
  | 'asset_authoring_session_workspace_mismatch'
  | 'asset_authoring_session_path_invalid'
  | 'asset_authoring_session_tampered';

export class AssetAuthoringSessionError extends Error {
  readonly code: AssetAuthoringSessionErrorCode;
  readonly path: string | undefined;

  constructor(
    code: AssetAuthoringSessionErrorCode,
    message: string,
    targetPath?: string,
  ) {
    super(message);
    this.name = 'AssetAuthoringSessionError';
    this.code = code;
    this.path = targetPath;
  }
}

export interface AssetAuthoringSourceDigest {
  readonly path: string;
  readonly digest: string;
}

export interface AssetAuthoringValidationReceipt {
  readonly id: string;
  readonly manifestDigest: string;
  readonly sourceDigests: readonly AssetAuthoringSourceDigest[];
}

export interface AssetAuthoringPreviewReceipt {
  readonly id: string;
  readonly manifestDigest: string;
  readonly sourceDigests: readonly AssetAuthoringSourceDigest[];
  /** Null means this receipt predates the validation-revision binding. */
  readonly validationReceiptId: string | null;
  readonly inputDigest: string;
  /** Null means this receipt predates the exact preview artifact binding. */
  readonly artifacts: readonly AssetAuthoringReleaseArtifactDigest[] | null;
}

export interface AssetAuthoringAcknowledgementReceipt {
  readonly id: string;
  readonly manifestDigest: string;
  readonly sourceDigests: readonly AssetAuthoringSourceDigest[];
  readonly recordDigests: readonly string[];
}

export const ASSET_AUTHORING_DRAFT_RECEIPT_SCHEMA =
  'lpc-toolkit.asset-authoring-draft-receipt.v1' as const;
export const ASSET_AUTHORING_FORMAL_ARCHIVE_RECEIPT_SCHEMA =
  'lpc-toolkit.asset-authoring-formal-archive-receipt.v1' as const;
export const ASSET_AUTHORING_ARCHIVE_INSPECTION_RECEIPT_SCHEMA =
  'lpc-toolkit.asset-authoring-archive-inspection-receipt.v1' as const;
export const ASSET_AUTHORING_INSTALLATION_RECEIPT_SCHEMA =
  'lpc-toolkit.asset-authoring-install-receipt.v1' as const;
export const ASSET_AUTHORING_RELEASE_PROVENANCE_RECEIPT_SCHEMA =
  'lpc-toolkit.asset-authoring-release-provenance-receipt.v1' as const;

export interface AssetAuthoringDraftArchiveReceipt {
  readonly schema: typeof ASSET_AUTHORING_DRAFT_RECEIPT_SCHEMA;
  readonly packId: string;
  readonly version: string;
  readonly archivePath: string;
  readonly archiveDigest: string;
  readonly manifestDigest: string;
  readonly contentDigest: string;
  readonly sourceDigests: readonly AssetAuthoringSourceDigest[];
  readonly recordedAt: string;
}

export interface AssetAuthoringSyncReceipt {
  readonly id: string;
  readonly packId: string;
  readonly version: string;
  readonly manifestDigest: string;
  readonly contentDigest: string;
  readonly sourceDigests: readonly AssetAuthoringSourceDigest[];
  readonly workspaceId: string;
  readonly outputRoot: string;
  readonly registryDigest: string;
  readonly compileDigest: string;
  readonly generatedDigests: Readonly<Record<string, string>>;
  readonly recordedAt: string;
}

export interface AssetAuthoringFormalArchiveReceipt {
  readonly schema: typeof ASSET_AUTHORING_FORMAL_ARCHIVE_RECEIPT_SCHEMA;
  readonly packId: string;
  readonly version: string;
  readonly archivePath: string;
  readonly archiveDigest: string;
  readonly manifestDigest: string;
  readonly contentDigest: string;
  readonly sourceDigests: readonly AssetAuthoringSourceDigest[];
  readonly validationReceiptId: string;
  readonly declarationReceiptDigest: string;
  readonly previewAcceptanceReceiptDigest: string;
  readonly previewInputDigest: string;
  readonly previewArtifacts: readonly AssetAuthoringReleaseArtifactDigest[];
  readonly recordedAt: string;
}

export interface AssetAuthoringArchiveInspectionReceipt {
  readonly schema: typeof ASSET_AUTHORING_ARCHIVE_INSPECTION_RECEIPT_SCHEMA;
  readonly packId: string;
  readonly version: string;
  readonly archivePath: string;
  readonly archiveDigest: string;
  readonly formalArchiveDigest: string;
  readonly manifestDigest: string;
  readonly contentDigest: string;
  readonly sourceDigests: readonly AssetAuthoringSourceDigest[];
  readonly entryCount: number;
  readonly totalUncompressedBytes: number;
  readonly recordedAt: string;
}

export interface AssetAuthoringInstallationReceipt {
  readonly schema: typeof ASSET_AUTHORING_INSTALLATION_RECEIPT_SCHEMA;
  readonly workspaceId: string;
  readonly workspaceRoot: string;
  readonly packId: string;
  readonly version: string;
  readonly archivePath: string;
  readonly archiveDigest: string;
  readonly installedDirectory: string;
  readonly payloadDigests: Readonly<Record<string, string>>;
  readonly registryPath: string;
  readonly registryDigest: string;
  readonly outputRoot: string;
  readonly generatedDigests: Readonly<Record<string, string>>;
  readonly creditsDigest: string;
  readonly recordedAt: string;
}

export interface AssetAuthoringReleaseProvenanceReceipt {
  readonly schema: typeof ASSET_AUTHORING_RELEASE_PROVENANCE_RECEIPT_SCHEMA;
  readonly packId: string;
  readonly version: string;
  readonly provenancePath: string;
  readonly provenanceDigest: string;
  readonly projectionDigest: string;
  readonly formalArchiveDigest: string;
  readonly recordedAt: string;
}

export type AssetAuthoringReleaseDeclarationReceipt =
  CoreAssetAuthoringReleaseDeclarationReceipt;

export type AssetAuthoringPreviewAcceptanceReceipt =
  CoreAssetAuthoringPreviewAcceptanceReceipt;

export interface AssetAuthoringSessionReceipts {
  readonly validation: AssetAuthoringValidationReceipt | null;
  readonly preview: AssetAuthoringPreviewReceipt | null;
  readonly acknowledgements: AssetAuthoringAcknowledgementReceipt | null;
  readonly releaseDeclaration: AssetAuthoringReleaseDeclarationReceipt | null;
  readonly previewAcceptance: AssetAuthoringPreviewAcceptanceReceipt | null;
  readonly draftArchive?: AssetAuthoringDraftArchiveReceipt | null;
  readonly sync?: AssetAuthoringSyncReceipt | null;
  readonly formalArchive?: AssetAuthoringFormalArchiveReceipt | null;
  readonly archiveInspection?: AssetAuthoringArchiveInspectionReceipt | null;
  readonly installation?: AssetAuthoringInstallationReceipt | null;
  readonly releaseProvenance?: AssetAuthoringReleaseProvenanceReceipt | null;
  readonly providerInvocation?: AssetProviderInvocation | null;
  readonly providerResult?: AssetProviderResult | AssetProviderRefusal | null;
}

export interface AssetAuthoringSessionCheckpoint {
  readonly id: string;
  readonly phase: AuthoringPhase;
  readonly digest: string;
  readonly freshness: AuthoringCheckpointFreshness;
}

export interface AssetAuthoringTargetCheckpoint {
  readonly targetId: string;
  readonly freshness: AuthoringCheckpointFreshness;
  readonly checkpoint?: AssetAuthoringSessionCheckpoint | null;
}

export type AssetAuthoringProvenanceKind =
  | 'session-created'
  | 'checkpoint-invalidated'
  | 'external-png-observed'
  | 'manifest-conflict'
  | 'draft-archive-recorded'
  | 'sync-receipt-recorded'
  | 'formal-archive-recorded'
  | 'archive-inspection-recorded'
  | 'installation-receipt-recorded'
  | 'release-provenance-recorded'
  | 'provider'
  | 'human-declaration'
  | 'human-preview-acceptance';

export interface AssetAuthoringProvenanceEvent {
  readonly id: string;
  readonly kind: AssetAuthoringProvenanceKind;
  readonly occurredAt: string;
  readonly summary: string;
  readonly digest?: string;
}

export interface AssetAuthoringManifestConflict {
  readonly kind: 'manifest-drift';
  readonly expectedDigest: string;
  readonly actualDigest: string;
  readonly detectedAt: string;
  readonly resolution: 'unresolved' | 'external' | 'session';
}

export interface AssetAuthoringSession {
  readonly schema: typeof ASSET_AUTHORING_SESSION_SCHEMA;
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly packRoot: string;
  readonly cliVersion: string;
  readonly goal: AuthoringGoal;
  readonly plan: AssetAuthoringPlan;
  readonly state: AuthoringState;
  readonly reason: string;
  readonly phase: AuthoringPhase;
  readonly checkpoint: AssetAuthoringSessionCheckpoint | null;
  readonly checkpointFreshness: AuthoringCheckpointFreshness;
  readonly checkpoints: readonly AssetAuthoringTargetCheckpoint[];
  readonly receipts: AssetAuthoringSessionReceipts;
  readonly provenance: readonly AssetAuthoringProvenanceEvent[];
  readonly conflict: AssetAuthoringManifestConflict | null;
  readonly manifestDigest: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AssetAuthoringSessionCreateInput {
  readonly plan: AssetAuthoringPlan;
  readonly packRoot: string;
}

export interface AssetAuthoringSessionUpdate {
  readonly state?: AuthoringState;
  readonly reason?: string;
  readonly phase?: AuthoringPhase;
  readonly checkpoint?: AssetAuthoringSessionCheckpoint | null;
  readonly checkpointFreshness?: AuthoringCheckpointFreshness;
  readonly checkpoints?: readonly AssetAuthoringTargetCheckpoint[];
  readonly receipts?: AssetAuthoringSessionReceipts;
  readonly provenance?: readonly AssetAuthoringProvenanceEvent[];
  readonly conflict?: AssetAuthoringManifestConflict | null;
  readonly manifestDigest?: string | null;
}

export interface AssetAuthoringSessionFileOps {
  readonly mkdirSync: typeof mkdirSync;
  readonly writeFileSync: typeof writeFileSync;
  readonly readFileSync: typeof readFileSync;
  readonly renameSync: typeof renameSync;
  readonly rmSync: typeof rmSync;
  readonly lstatSync: typeof lstatSync;
  readonly realpathSync: typeof realpathSync;
}

export interface AssetAuthoringSessionStoreOptions {
  readonly fileOps?: Partial<AssetAuthoringSessionFileOps>;
  readonly now?: () => string;
  readonly sessionId?: () => string;
  readonly eventId?: () => string;
}

export interface AssetAuthoringSessionResumeOptions {
  readonly invalidation?: readonly AssetAuthoringInvalidationDecision[];
}

export interface AssetAuthoringSessionStore {
  create(input: AssetAuthoringSessionCreateInput): AssetAuthoringSession;
  read(sessionId: string): AssetAuthoringSession;
  replace(sessionId: string, update: AssetAuthoringSessionUpdate): AssetAuthoringSession;
  status(sessionId: string): AssetAuthoringSession;
  resume(
    sessionId: string,
    options?: AssetAuthoringSessionResumeOptions,
  ): AssetAuthoringSession;
}

export interface AssetAuthoringEvidence {
  readonly manifestDigest: string | null;
  readonly contractDigest: string | null;
  readonly sourceDigests: readonly AssetAuthoringSourceDigest[];
  readonly validationReceipt: AssetAuthoringValidationReceipt | null;
  readonly previewReceipt: AssetAuthoringPreviewReceipt | null;
  readonly acknowledgementsReceipt?: AssetAuthoringAcknowledgementReceipt | null;
  readonly releaseDeclarationReceipt?: AssetAuthoringReleaseDeclarationReceipt | null;
  readonly previewAcceptanceReceipt?: AssetAuthoringPreviewAcceptanceReceipt | null;
  readonly formalArchiveReceipt?: AssetAuthoringFormalArchiveReceipt | null;
  readonly archiveInspectionReceipt?: AssetAuthoringArchiveInspectionReceipt | null;
  readonly installationReceipt?: AssetAuthoringInstallationReceipt | null;
  readonly releaseProvenanceReceipt?: AssetAuthoringReleaseProvenanceReceipt | null;
  /** The newly requested preview input, separate from the last receipt. */
  readonly previewInputDigest?: string | null;
}

export type AssetAuthoringInvalidationCheckpoint =
  | 'manifest'
  | 'contract'
  | 'source'
  | 'acknowledgements'
  | 'validation'
  | 'preview'
  | 'previewArtifacts'
  | 'releaseDeclaration'
  | 'previewAcceptance'
  | 'formalArchive'
  | 'archiveInspection'
  | 'installation'
  | 'releaseProvenance';

export type AssetAuthoringInvalidationReason =
  | 'manifest-semantic-drift'
  | 'contract-replaced'
  | 'png-drift'
  | 'acknowledgement-receipt-stale'
  | 'validation-receipt-stale'
  | 'preview-receipt-stale'
  | 'preview-artifact-stale'
  | 'release-declaration-stale'
  | 'preview-acceptance-stale'
  | 'formal-archive-stale'
  | 'archive-inspection-stale'
  | 'installation-stale'
  | 'release-provenance-stale';

export interface AssetAuthoringInvalidationDecision {
  readonly checkpoint: AssetAuthoringInvalidationCheckpoint;
  readonly reason: AssetAuthoringInvalidationReason;
}

type JsonRecord = Readonly<Record<string, unknown>>;

const DEFAULT_FILE_OPS: AssetAuthoringSessionFileOps = {
  mkdirSync,
  writeFileSync,
  readFileSync,
  renameSync,
  rmSync,
  lstatSync,
  realpathSync,
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function fail(
  code: AssetAuthoringSessionErrorCode,
  message: string,
  targetPath?: string,
): never {
  throw new AssetAuthoringSessionError(code, message, targetPath);
}

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === ''
    || (
      relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative)
    );
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) fail('asset_authoring_session_invalid', `${label} must be an object.`);
  return value;
}

function requireString(record: JsonRecord, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    fail('asset_authoring_session_invalid', `${label}.${key} must be a non-empty string.`);
  }
  return value;
}

function assertExactKeys(
  record: JsonRecord,
  keys: readonly string[],
  label: string,
): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    fail(
      'asset_authoring_session_tampered',
      `${label} contains unknown fields: ${unknown.join(', ')}`,
    );
  }
}

function requireEnum<T extends string>(
  record: JsonRecord,
  key: string,
  values: readonly T[],
  label: string,
): T {
  const value = requireString(record, key, label);
  if (!values.includes(value as T)) {
    fail('asset_authoring_session_invalid', `${label}.${key} has an unsupported value: ${value}.`);
  }
  return value as T;
}

function requireDigest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    fail('asset_authoring_session_invalid', `${label} must be a sha256 digest.`);
  }
  return value;
}

function requireNullableDigest(
  record: JsonRecord,
  key: string,
  label: string,
): string | null {
  const value = record[key];
  if (value === null) return null;
  return requireDigest(value, `${label}.${key}`);
}

function requireTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    fail('asset_authoring_session_invalid', `${label} must be an ISO timestamp.`);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) {
    fail('asset_authoring_session_invalid', `${label} must use canonical ISO formatting.`);
  }
  return value;
}

function requireUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SESSION_ID_PATTERN.test(value)) {
    fail('asset_authoring_session_invalid', `${label} must be a UUIDv4.`);
  }
  return value;
}

function requireLogicalTargetId(value: unknown, label: string): string {
  const targetId = requireString({ value }, 'value', label);
  if (
    targetId.includes('\u0000')
    || targetId.split('/').some((segment) => segment === '..')
  ) {
    fail('asset_authoring_session_path_invalid', `${label} must be a contained logical target id.`);
  }
  return targetId;
}

function sortedStrings(values: readonly string[]): readonly string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function assertStableOrder(values: readonly string[], label: string): void {
  if (values.some((value, index) => value !== sortedStrings(values)[index])) {
    fail('asset_authoring_session_tampered', `${label} must use stable lexical ordering.`);
  }
}

function parseSourceDigests(value: unknown, label: string): readonly AssetAuthoringSourceDigest[] {
  if (!Array.isArray(value)) fail('asset_authoring_session_invalid', `${label} must be an array.`);
  const result = value.map((entry, index) => {
    const record = requireRecord(entry, `${label}[${index}]`);
    assertExactKeys(record, ['path', 'digest'], `${label}[${index}]`);
    return {
      path: requireLogicalTargetId(record.path, `${label}[${index}].path`),
      digest: requireDigest(record.digest, `${label}[${index}].digest`),
    };
  });
  assertStableOrder(result.map((entry) => entry.path), label);
  return result;
}

function parseCheckpoint(
  value: unknown,
  label: string,
): AssetAuthoringSessionCheckpoint | null {
  if (value === null) return null;
  const record = requireRecord(value, label);
  assertExactKeys(record, ['id', 'phase', 'digest', 'freshness'], label);
  return {
    id: requireString(record, 'id', label),
    phase: requireEnum(record, 'phase', AUTHORING_PHASES, label),
    digest: requireDigest(record.digest, `${label}.digest`),
    freshness: requireEnum(record, 'freshness', CHECKPOINT_FRESHNESS_VALUES, label),
  };
}

function parseTargetCheckpoints(value: unknown): readonly AssetAuthoringTargetCheckpoint[] {
  if (!Array.isArray(value)) fail('asset_authoring_session_invalid', 'session.checkpoints must be an array.');
  const result = value.map((entry, index) => {
    const label = `session.checkpoints[${index}]`;
    const record = requireRecord(entry, label);
    assertExactKeys(record, ['targetId', 'freshness', 'checkpoint'], label);
    const checkpoint = record.checkpoint === undefined
      ? undefined
      : parseCheckpoint(record.checkpoint, `${label}.checkpoint`);
    return {
      targetId: requireLogicalTargetId(record.targetId, `${label}.targetId`),
      freshness: requireEnum(record, 'freshness', CHECKPOINT_FRESHNESS_VALUES, label),
      ...(checkpoint === undefined ? {} : { checkpoint }),
    };
  });
  const targetIds = result.map((entry) => entry.targetId);
  if (new Set(targetIds).size !== targetIds.length) {
    fail('asset_authoring_session_tampered', 'session.checkpoints contains duplicate target ids.');
  }
  assertStableOrder(targetIds, 'session.checkpoints');
  return result;
}

function parseProviderInvocation(
  value: unknown,
  sessionId: string,
  plan: AssetAuthoringPlan,
): AssetProviderInvocation {
  const parsed = parseAssetProviderInvocation(value);
  if (!parsed.ok) {
    fail(
      'asset_authoring_session_tampered',
      `session.receipts.providerInvocation is invalid: ${parsed.diagnostics.map((diagnostic) => diagnostic.message).join(' ')}`,
    );
  }
  const invocation = parsed.invocation;
  if (invocation.sessionId !== sessionId) {
    fail(
      'asset_authoring_session_tampered',
      'session.receipts.providerInvocation.sessionId must match the session.',
    );
  }
  if (!invocation.consent.confirmed) {
    fail(
      'asset_authoring_session_tampered',
      'session.receipts.providerInvocation.consent.confirmed must be true.',
    );
  }
  const targetIds = new Set(plan.scope.paths);
  const contractAssetId = plan.goal === 'new-item'
    ? `${plan.pack.id}--${plan.asset.localId}`
    : plan.goal === 'extend-item'
      ? plan.asset.itemId
      : undefined;
  const contractTargetPrefix = `${plan.pack.id}/${contractAssetId ?? ''}`;
  if (invocation.targetIds.some((targetId) =>
    !targetIds.has(targetId) && !targetId.startsWith(contractTargetPrefix))) {
    fail(
      'asset_authoring_session_path_invalid',
      'session.receipts.providerInvocation.targetIds must stay inside the session plan scope.',
    );
  }
  if (invocation.candidate.stagingId !== `${invocation.provider.id}/${sessionId}`) {
    fail(
      'asset_authoring_session_path_invalid',
      'session.receipts.providerInvocation.candidate.stagingId must be the session-relative provider staging id.',
    );
  }
  if (!invocation.consent.network.enabled && invocation.consent.network.hosts.length > 0) {
    fail(
      'asset_authoring_session_tampered',
      'session.receipts.providerInvocation.consent.network.hosts must be empty when network is disabled.',
    );
  }
  return invocation;
}

function sameProviderIdentity(
  left: AssetProviderInvocation['provider'],
  right: AssetProviderInvocation['provider'],
): boolean {
  return left.id === right.id
    && left.adapter.id === right.adapter.id
    && left.adapter.version === right.adapter.version;
}

function providerInvocationDigest(invocation: AssetProviderInvocation): string {
  return `sha256:${createHash('sha256')
    .update(assetProviderInvocationDigestInput(invocation), 'utf8')
    .digest('hex')}`;
}

function parseProviderResult(
  value: unknown,
  sessionId: string,
  plan: AssetAuthoringPlan,
  invocation: AssetProviderInvocation | null,
): AssetProviderResult | AssetProviderRefusal {
  const record = requireRecord(value, 'session.receipts.providerResult');
  const schema = record.schema;
  const isRefusal = schema === 'lpc-toolkit.asset-provider-refusal.v1';
  let result: AssetProviderResult | AssetProviderRefusal;
  if (isRefusal) {
    const parsed = parseAssetProviderRefusal(value);
    if (!parsed.ok) {
      fail(
        'asset_authoring_session_tampered',
        `session.receipts.providerResult is invalid: ${parsed.diagnostics.map((diagnostic) => diagnostic.message).join(' ')}`,
      );
    }
    result = parsed.refusal;
  } else {
    const parsed = parseAssetProviderResult(value);
    if (!parsed.ok) {
      fail(
        'asset_authoring_session_tampered',
        `session.receipts.providerResult is invalid: ${parsed.diagnostics.map((diagnostic) => diagnostic.message).join(' ')}`,
      );
    }
    result = parsed.result;
  }
  if (result.sessionId !== sessionId) {
    fail('asset_authoring_session_tampered', 'session.receipts.providerResult.sessionId must match the session.');
  }
  if (invocation === null) {
    fail('asset_authoring_session_tampered', 'session.receipts.providerResult requires providerInvocation.');
  }
  const boundInvocation = invocation;
  if (result.invocationDigest !== providerInvocationDigest(boundInvocation)) {
    fail('asset_authoring_session_tampered', 'session.receipts.providerResult.invocationDigest must match providerInvocation.');
  }
  if (result.contractDigest !== boundInvocation.contractDigest) {
    fail('asset_authoring_session_tampered', 'session.receipts.providerResult.contractDigest must match providerInvocation.');
  }
  if (!sameProviderIdentity(result.provider, boundInvocation.provider)) {
    fail('asset_authoring_session_tampered', 'session.receipts.providerResult.provider must match providerInvocation.');
  }
  const targetIds = new Set(plan.scope.paths);
  if (result.schema === 'lpc-toolkit.asset-provider-result.v1') {
    if (!targetIds.has(result.targetId) || !boundInvocation.targetIds.includes(result.targetId)) {
      fail('asset_authoring_session_path_invalid', 'session.receipts.providerResult.targetId must stay inside the invocation scope.');
    }
    if (result.consentScopeDigest !== boundInvocation.consent.scopeDigest) {
      fail('asset_authoring_session_tampered', 'session.receipts.providerResult.consentScopeDigest must match providerInvocation.');
    }
  } else {
    if (result.targetIds.some((targetId) => !targetIds.has(targetId) || !boundInvocation.targetIds.includes(targetId))) {
      fail('asset_authoring_session_path_invalid', 'session.receipts.providerResult.targetIds must stay inside the invocation scope.');
    }
    if (result.consentScopeDigest !== boundInvocation.consent.scopeDigest) {
      fail('asset_authoring_session_tampered', 'session.receipts.providerResult.consentScopeDigest must match providerInvocation.');
    }
  }
  return result;
}

function parseReceipts(
  value: unknown,
  sessionId: string,
  plan: AssetAuthoringPlan,
): AssetAuthoringSessionReceipts {
  const record = requireRecord(value, 'session.receipts');
  assertExactKeys(
    record,
    [
      'validation',
      'preview',
      'acknowledgements',
      'releaseDeclaration',
      'previewAcceptance',
      'draftArchive',
      'sync',
      'formalArchive',
      'archiveInspection',
      'installation',
      'releaseProvenance',
      'providerInvocation',
      'providerResult',
    ],
    'session.receipts',
  );
  const validation = record.validation === null
    ? null
    : parseValidationReceipt(record.validation);
  const preview = record.preview === null
    ? null
    : parsePreviewReceipt(record.preview);
  const acknowledgements = record.acknowledgements === undefined || record.acknowledgements === null
    ? null
    : parseAcknowledgementsReceipt(record.acknowledgements);
  const releaseDeclaration = record.releaseDeclaration === undefined || record.releaseDeclaration === null
    ? null
    : parseReleaseDeclarationReceipt(record.releaseDeclaration);
  const previewAcceptance = record.previewAcceptance === undefined || record.previewAcceptance === null
    ? null
    : parsePreviewAcceptanceReceipt(record.previewAcceptance);
  const draftArchive = record.draftArchive === undefined || record.draftArchive === null
    ? null
    : parseDraftArchiveReceipt(record.draftArchive);
  const sync = record.sync === undefined || record.sync === null
    ? null
    : parseSyncReceipt(record.sync);
  const formalArchive = record.formalArchive === undefined || record.formalArchive === null
    ? null
    : parseFormalArchiveReceipt(record.formalArchive);
  const archiveInspection = record.archiveInspection === undefined || record.archiveInspection === null
    ? null
    : parseArchiveInspectionReceipt(record.archiveInspection);
  const installation = record.installation === undefined || record.installation === null
    ? null
    : parseInstallationReceipt(record.installation);
  const releaseProvenance = record.releaseProvenance === undefined || record.releaseProvenance === null
    ? null
    : parseReleaseProvenanceReceipt(record.releaseProvenance);
  const providerInvocation = record.providerInvocation === undefined || record.providerInvocation === null
    ? null
    : parseProviderInvocation(record.providerInvocation, sessionId, plan);
  const providerResult = record.providerResult === undefined || record.providerResult === null
    ? null
    : parseProviderResult(record.providerResult, sessionId, plan, providerInvocation);
  return {
    validation,
    preview,
    acknowledgements,
    releaseDeclaration,
    previewAcceptance,
    draftArchive,
    sync,
    formalArchive,
    archiveInspection,
    installation,
    releaseProvenance,
    providerInvocation,
    providerResult,
  };
}

function parseAbsoluteReceiptPath(
  record: JsonRecord,
  key: string,
  label: string,
): string {
  const value = requireString(record, key, label);
  if (!path.isAbsolute(value)) {
    fail('asset_authoring_session_path_invalid', `${label}.${key} must be absolute.`);
  }
  return value;
}

function parseFormalArchiveReceipt(value: unknown): AssetAuthoringFormalArchiveReceipt {
  const record = requireRecord(value, 'session.receipts.formalArchive');
  assertExactKeys(
    record,
    [
      'schema',
      'packId',
      'version',
      'archivePath',
      'archiveDigest',
      'manifestDigest',
      'contentDigest',
      'sourceDigests',
      'validationReceiptId',
      'declarationReceiptDigest',
      'previewAcceptanceReceiptDigest',
      'previewInputDigest',
      'previewArtifacts',
      'recordedAt',
    ],
    'session.receipts.formalArchive',
  );
  if (record.schema !== ASSET_AUTHORING_FORMAL_ARCHIVE_RECEIPT_SCHEMA) {
    fail(
      'asset_authoring_session_tampered',
      `Unknown formal archive receipt schema: ${String(record.schema)}.`,
    );
  }
  const previewArtifacts = parsePreviewArtifactReceipts(
    record.previewArtifacts,
    'session.receipts.formalArchive.previewArtifacts',
  );
  if (previewArtifacts === null) {
    fail(
      'asset_authoring_session_invalid',
      'session.receipts.formalArchive.previewArtifacts must contain all release artifacts.',
    );
  }
  return {
    schema: ASSET_AUTHORING_FORMAL_ARCHIVE_RECEIPT_SCHEMA,
    packId: requireString(record, 'packId', 'session.receipts.formalArchive'),
    version: requireString(record, 'version', 'session.receipts.formalArchive'),
    archivePath: parseAbsoluteReceiptPath(record, 'archivePath', 'session.receipts.formalArchive'),
    archiveDigest: requireDigest(record.archiveDigest, 'session.receipts.formalArchive.archiveDigest'),
    manifestDigest: requireDigest(record.manifestDigest, 'session.receipts.formalArchive.manifestDigest'),
    contentDigest: requireDigest(record.contentDigest, 'session.receipts.formalArchive.contentDigest'),
    sourceDigests: parseSourceDigests(
      record.sourceDigests,
      'session.receipts.formalArchive.sourceDigests',
    ),
    validationReceiptId: requireString(record, 'validationReceiptId', 'session.receipts.formalArchive'),
    declarationReceiptDigest: requireDigest(
      record.declarationReceiptDigest,
      'session.receipts.formalArchive.declarationReceiptDigest',
    ),
    previewAcceptanceReceiptDigest: requireDigest(
      record.previewAcceptanceReceiptDigest,
      'session.receipts.formalArchive.previewAcceptanceReceiptDigest',
    ),
    previewInputDigest: requireDigest(
      record.previewInputDigest,
      'session.receipts.formalArchive.previewInputDigest',
    ),
    previewArtifacts,
    recordedAt: requireTimestamp(record.recordedAt, 'session.receipts.formalArchive.recordedAt'),
  };
}

function parseArchiveInspectionReceipt(value: unknown): AssetAuthoringArchiveInspectionReceipt {
  const record = requireRecord(value, 'session.receipts.archiveInspection');
  assertExactKeys(
    record,
    [
      'schema',
      'packId',
      'version',
      'archivePath',
      'archiveDigest',
      'formalArchiveDigest',
      'manifestDigest',
      'contentDigest',
      'sourceDigests',
      'entryCount',
      'totalUncompressedBytes',
      'recordedAt',
    ],
    'session.receipts.archiveInspection',
  );
  if (record.schema !== ASSET_AUTHORING_ARCHIVE_INSPECTION_RECEIPT_SCHEMA) {
    fail(
      'asset_authoring_session_tampered',
      `Unknown archive inspection receipt schema: ${String(record.schema)}.`,
    );
  }
  const entryCount = record.entryCount;
  const totalUncompressedBytes = record.totalUncompressedBytes;
  if (typeof entryCount !== 'number' || !Number.isInteger(entryCount) || entryCount < 0) {
    fail('asset_authoring_session_invalid', 'session.receipts.archiveInspection.entryCount must be a non-negative integer.');
  }
  if (
    typeof totalUncompressedBytes !== 'number'
    || !Number.isInteger(totalUncompressedBytes)
    || totalUncompressedBytes < 0
  ) {
    fail('asset_authoring_session_invalid', 'session.receipts.archiveInspection.totalUncompressedBytes must be a non-negative integer.');
  }
  return {
    schema: ASSET_AUTHORING_ARCHIVE_INSPECTION_RECEIPT_SCHEMA,
    packId: requireString(record, 'packId', 'session.receipts.archiveInspection'),
    version: requireString(record, 'version', 'session.receipts.archiveInspection'),
    archivePath: parseAbsoluteReceiptPath(record, 'archivePath', 'session.receipts.archiveInspection'),
    archiveDigest: requireDigest(record.archiveDigest, 'session.receipts.archiveInspection.archiveDigest'),
    formalArchiveDigest: requireDigest(record.formalArchiveDigest, 'session.receipts.archiveInspection.formalArchiveDigest'),
    manifestDigest: requireDigest(record.manifestDigest, 'session.receipts.archiveInspection.manifestDigest'),
    contentDigest: requireDigest(record.contentDigest, 'session.receipts.archiveInspection.contentDigest'),
    sourceDigests: parseSourceDigests(
      record.sourceDigests,
      'session.receipts.archiveInspection.sourceDigests',
    ),
    entryCount,
    totalUncompressedBytes,
    recordedAt: requireTimestamp(record.recordedAt, 'session.receipts.archiveInspection.recordedAt'),
  };
}

function parseInstallationReceipt(value: unknown): AssetAuthoringInstallationReceipt {
  const record = requireRecord(value, 'session.receipts.installation');
  assertExactKeys(
    record,
    [
      'schema',
      'workspaceId',
      'workspaceRoot',
      'packId',
      'version',
      'archivePath',
      'archiveDigest',
      'installedDirectory',
      'payloadDigests',
      'registryPath',
      'registryDigest',
      'outputRoot',
      'generatedDigests',
      'creditsDigest',
      'recordedAt',
    ],
    'session.receipts.installation',
  );
  if (record.schema !== ASSET_AUTHORING_INSTALLATION_RECEIPT_SCHEMA) {
    fail(
      'asset_authoring_session_tampered',
      `Unknown installation receipt schema: ${String(record.schema)}.`,
    );
  }
  const workspaceRoot = parseAbsoluteReceiptPath(
    record,
    'workspaceRoot',
    'session.receipts.installation',
  );
  const installedDirectory = parseAbsoluteReceiptPath(
    record,
    'installedDirectory',
    'session.receipts.installation',
  );
  const registryPath = parseAbsoluteReceiptPath(
    record,
    'registryPath',
    'session.receipts.installation',
  );
  const outputRoot = parseAbsoluteReceiptPath(
    record,
    'outputRoot',
    'session.receipts.installation',
  );
  return {
    schema: ASSET_AUTHORING_INSTALLATION_RECEIPT_SCHEMA,
    workspaceId: requireString(record, 'workspaceId', 'session.receipts.installation'),
    workspaceRoot,
    packId: requireString(record, 'packId', 'session.receipts.installation'),
    version: requireString(record, 'version', 'session.receipts.installation'),
    archivePath: parseAbsoluteReceiptPath(
      record,
      'archivePath',
      'session.receipts.installation',
    ),
    archiveDigest: requireDigest(
      record.archiveDigest,
      'session.receipts.installation.archiveDigest',
    ),
    installedDirectory,
    payloadDigests: parseGeneratedDigests(
      record.payloadDigests,
      'session.receipts.installation.payloadDigests',
    ),
    registryPath,
    registryDigest: requireDigest(
      record.registryDigest,
      'session.receipts.installation.registryDigest',
    ),
    outputRoot,
    generatedDigests: parseGeneratedDigests(
      record.generatedDigests,
      'session.receipts.installation.generatedDigests',
    ),
    creditsDigest: requireDigest(
      record.creditsDigest,
      'session.receipts.installation.creditsDigest',
    ),
    recordedAt: requireTimestamp(
      record.recordedAt,
      'session.receipts.installation.recordedAt',
    ),
  };
}

function parseReleaseProvenanceReceipt(value: unknown): AssetAuthoringReleaseProvenanceReceipt {
  const record = requireRecord(value, 'session.receipts.releaseProvenance');
  assertExactKeys(
    record,
    [
      'schema',
      'packId',
      'version',
      'provenancePath',
      'provenanceDigest',
      'projectionDigest',
      'formalArchiveDigest',
      'recordedAt',
    ],
    'session.receipts.releaseProvenance',
  );
  if (record.schema !== ASSET_AUTHORING_RELEASE_PROVENANCE_RECEIPT_SCHEMA) {
    fail(
      'asset_authoring_session_tampered',
      `Unknown release provenance receipt schema: ${String(record.schema)}.`,
    );
  }
  return {
    schema: ASSET_AUTHORING_RELEASE_PROVENANCE_RECEIPT_SCHEMA,
    packId: requireString(record, 'packId', 'session.receipts.releaseProvenance'),
    version: requireString(record, 'version', 'session.receipts.releaseProvenance'),
    provenancePath: parseAbsoluteReceiptPath(
      record,
      'provenancePath',
      'session.receipts.releaseProvenance',
    ),
    provenanceDigest: requireDigest(
      record.provenanceDigest,
      'session.receipts.releaseProvenance.provenanceDigest',
    ),
    projectionDigest: requireDigest(
      record.projectionDigest,
      'session.receipts.releaseProvenance.projectionDigest',
    ),
    formalArchiveDigest: requireDigest(
      record.formalArchiveDigest,
      'session.receipts.releaseProvenance.formalArchiveDigest',
    ),
    recordedAt: requireTimestamp(
      record.recordedAt,
      'session.receipts.releaseProvenance.recordedAt',
    ),
  };
}

function parseDraftArchiveReceipt(value: unknown): AssetAuthoringDraftArchiveReceipt {
  const record = requireRecord(value, 'session.receipts.draftArchive');
  assertExactKeys(
    record,
    [
      'schema',
      'packId',
      'version',
      'archivePath',
      'archiveDigest',
      'manifestDigest',
      'contentDigest',
      'sourceDigests',
      'recordedAt',
    ],
    'session.receipts.draftArchive',
  );
  if (record.schema !== ASSET_AUTHORING_DRAFT_RECEIPT_SCHEMA) {
    fail(
      'asset_authoring_session_tampered',
      `Unknown draft receipt schema: ${String(record.schema)}.`,
    );
  }
  const archivePath = requireString(record, 'archivePath', 'session.receipts.draftArchive');
  if (!path.isAbsolute(archivePath)) {
    fail(
      'asset_authoring_session_path_invalid',
      'session.receipts.draftArchive.archivePath must be absolute.',
    );
  }
  return {
    schema: ASSET_AUTHORING_DRAFT_RECEIPT_SCHEMA,
    packId: requireString(record, 'packId', 'session.receipts.draftArchive'),
    version: requireString(record, 'version', 'session.receipts.draftArchive'),
    archivePath,
    archiveDigest: requireDigest(
      record.archiveDigest,
      'session.receipts.draftArchive.archiveDigest',
    ),
    manifestDigest: requireDigest(
      record.manifestDigest,
      'session.receipts.draftArchive.manifestDigest',
    ),
    contentDigest: requireDigest(
      record.contentDigest,
      'session.receipts.draftArchive.contentDigest',
    ),
    sourceDigests: parseSourceDigests(
      record.sourceDigests,
      'session.receipts.draftArchive.sourceDigests',
    ),
    recordedAt: requireTimestamp(
      record.recordedAt,
      'session.receipts.draftArchive.recordedAt',
    ),
  };
}

function parseGeneratedDigests(
  value: unknown,
  label: string,
): Readonly<Record<string, string>> {
  const record = requireRecord(value, label);
  const entries = Object.entries(record);
  const paths = entries.map(([entryPath]) => requireLogicalTargetId(entryPath, label));
  assertStableOrder(paths, label);
  const result: Record<string, string> = {};
  for (const [entryPath, digest] of entries) {
    result[entryPath] = requireDigest(digest, `${label}.${entryPath}`);
  }
  return result;
}

function parseSyncReceipt(value: unknown): AssetAuthoringSyncReceipt {
  const record = requireRecord(value, 'session.receipts.sync');
  assertExactKeys(
    record,
    [
      'id',
      'packId',
      'version',
      'manifestDigest',
      'contentDigest',
      'sourceDigests',
      'workspaceId',
      'outputRoot',
      'registryDigest',
      'compileDigest',
      'generatedDigests',
      'recordedAt',
    ],
    'session.receipts.sync',
  );
  const outputRoot = requireString(record, 'outputRoot', 'session.receipts.sync');
  if (!path.isAbsolute(outputRoot)) {
    fail(
      'asset_authoring_session_path_invalid',
      'session.receipts.sync.outputRoot must be absolute.',
    );
  }
  return {
    id: requireDigest(record.id, 'session.receipts.sync.id'),
    packId: requireString(record, 'packId', 'session.receipts.sync'),
    version: requireString(record, 'version', 'session.receipts.sync'),
    manifestDigest: requireDigest(record.manifestDigest, 'session.receipts.sync.manifestDigest'),
    contentDigest: requireDigest(record.contentDigest, 'session.receipts.sync.contentDigest'),
    sourceDigests: parseSourceDigests(
      record.sourceDigests,
      'session.receipts.sync.sourceDigests',
    ),
    workspaceId: requireString(record, 'workspaceId', 'session.receipts.sync'),
    outputRoot,
    registryDigest: requireDigest(record.registryDigest, 'session.receipts.sync.registryDigest'),
    compileDigest: requireDigest(record.compileDigest, 'session.receipts.sync.compileDigest'),
    generatedDigests: parseGeneratedDigests(
      record.generatedDigests,
      'session.receipts.sync.generatedDigests',
    ),
    recordedAt: requireTimestamp(record.recordedAt, 'session.receipts.sync.recordedAt'),
  };
}

function parseValidationReceipt(value: unknown): AssetAuthoringValidationReceipt {
  const record = requireRecord(value, 'session.receipts.validation');
  assertExactKeys(
    record,
    ['id', 'manifestDigest', 'sourceDigests'],
    'session.receipts.validation',
  );
  return {
    id: requireString(record, 'id', 'session.receipts.validation'),
    manifestDigest: requireDigest(
      record.manifestDigest,
      'session.receipts.validation.manifestDigest',
    ),
    sourceDigests: parseSourceDigests(
      record.sourceDigests,
      'session.receipts.validation.sourceDigests',
    ),
  };
}

function parsePreviewReceipt(value: unknown): AssetAuthoringPreviewReceipt {
  const record = requireRecord(value, 'session.receipts.preview');
  assertExactKeys(
    record,
    ['id', 'manifestDigest', 'sourceDigests', 'validationReceiptId', 'inputDigest', 'artifacts'],
    'session.receipts.preview',
  );
  const validationReceiptId = record.validationReceiptId === undefined
    ? null
    : requireString(record, 'validationReceiptId', 'session.receipts.preview');
  const artifacts = parsePreviewArtifactReceipts(
    record.artifacts,
    'session.receipts.preview.artifacts',
  );
  return {
    id: requireString(record, 'id', 'session.receipts.preview'),
    manifestDigest: requireDigest(
      record.manifestDigest,
      'session.receipts.preview.manifestDigest',
    ),
    sourceDigests: parseSourceDigests(
      record.sourceDigests,
      'session.receipts.preview.sourceDigests',
    ),
    validationReceiptId,
    inputDigest: requireDigest(record.inputDigest, 'session.receipts.preview.inputDigest'),
    artifacts,
  };
}

function parsePreviewArtifactReceipts(
  value: unknown,
  label: string,
): readonly AssetAuthoringReleaseArtifactDigest[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length !== ASSET_AUTHORING_RELEASE_ARTIFACT_IDS.length) {
    fail(
      'asset_authoring_session_invalid',
      `${label} must contain exactly ${ASSET_AUTHORING_RELEASE_ARTIFACT_IDS.length} artifacts.`,
    );
  }
  const seen = new Set<string>();
  const parsed = value.map((entry, index) => {
    const entryLabel = `${label}[${index}]`;
    const record = requireRecord(entry, entryLabel);
    assertExactKeys(record, ['id', 'path', 'digest'], entryLabel);
    const id = requireString(record, 'id', entryLabel);
    if (!ASSET_AUTHORING_RELEASE_ARTIFACT_IDS.includes(
      id as (typeof ASSET_AUTHORING_RELEASE_ARTIFACT_IDS)[number],
    )) {
      fail('asset_authoring_session_invalid', `${entryLabel}.id is unsupported.`);
    }
    if (seen.has(id)) {
      fail('asset_authoring_session_tampered', `${label} contains duplicate artifact ids.`);
    }
    seen.add(id);
    const artifactPath = requireString(record, 'path', entryLabel);
    if (!path.isAbsolute(artifactPath)) {
      fail('asset_authoring_session_path_invalid', `${entryLabel}.path must be absolute.`);
    }
    return {
      id: id as AssetAuthoringReleaseArtifactDigest['id'],
      path: artifactPath,
      digest: requireDigest(record.digest, `${entryLabel}.digest`),
    };
  });
  const expectedIds = [...ASSET_AUTHORING_RELEASE_ARTIFACT_IDS];
  if (parsed.some((artifact, index) => artifact.id !== expectedIds[index])) {
    fail('asset_authoring_session_tampered', `${label} must use stable artifact ordering.`);
  }
  return parsed;
}

function parseAcknowledgementsReceipt(value: unknown): AssetAuthoringAcknowledgementReceipt {
  const record = requireRecord(value, 'session.receipts.acknowledgements');
  assertExactKeys(
    record,
    ['id', 'manifestDigest', 'sourceDigests', 'recordDigests'],
    'session.receipts.acknowledgements',
  );
  const recordDigests = record.recordDigests;
  if (!Array.isArray(recordDigests)) {
    fail(
      'asset_authoring_session_invalid',
      'session.receipts.acknowledgements.recordDigests must be an array.',
    );
  }
  const parsedRecordDigests = recordDigests.map((digest, index) =>
    requireDigest(digest, `session.receipts.acknowledgements.recordDigests[${index}]`));
  if (parsedRecordDigests.length === 0) {
    fail(
      'asset_authoring_session_invalid',
      'session.receipts.acknowledgements.recordDigests must not be empty.',
    );
  }
  if (new Set(parsedRecordDigests).size !== parsedRecordDigests.length) {
    fail(
      'asset_authoring_session_tampered',
      'session.receipts.acknowledgements.recordDigests contains duplicates.',
    );
  }
  assertStableOrder(parsedRecordDigests, 'session.receipts.acknowledgements.recordDigests');
  return {
    id: requireDigest(record.id, 'session.receipts.acknowledgements.id'),
    manifestDigest: requireDigest(
      record.manifestDigest,
      'session.receipts.acknowledgements.manifestDigest',
    ),
    sourceDigests: parseSourceDigests(
      record.sourceDigests,
      'session.receipts.acknowledgements.sourceDigests',
    ),
    recordDigests: parsedRecordDigests,
  };
}

function parseReleaseDeclarationReceipt(
  value: unknown,
): AssetAuthoringReleaseDeclarationReceipt {
  const result = parseAssetAuthoringReleaseReceipt(value);
  if (!result.ok) {
    fail(
      'asset_authoring_session_invalid',
      result.diagnostics[0]?.message ?? 'session.receipts.releaseDeclaration is invalid.',
    );
  }
  if (result.receipt.kind !== 'declaration') {
    fail(
      'asset_authoring_session_invalid',
      'session.receipts.releaseDeclaration must be a declaration receipt.',
    );
  }
  return result.receipt;
}

function parsePreviewAcceptanceReceipt(
  value: unknown,
): AssetAuthoringPreviewAcceptanceReceipt {
  const result = parseAssetAuthoringReleaseReceipt(value);
  if (!result.ok) {
    fail(
      'asset_authoring_session_invalid',
      result.diagnostics[0]?.message ?? 'session.receipts.previewAcceptance is invalid.',
    );
  }
  if (result.receipt.kind !== 'preview-acceptance') {
    fail(
      'asset_authoring_session_invalid',
      'session.receipts.previewAcceptance must be a preview-acceptance receipt.',
    );
  }
  return result.receipt;
}

function parseProvenance(value: unknown): readonly AssetAuthoringProvenanceEvent[] {
  if (!Array.isArray(value)) fail('asset_authoring_session_invalid', 'session.provenance must be an array.');
  return value.map((entry, index) => {
    const label = `session.provenance[${index}]`;
    const record = requireRecord(entry, label);
    assertExactKeys(record, ['id', 'kind', 'occurredAt', 'summary', 'digest'], label);
    const digest = record.digest === undefined
      ? undefined
      : requireDigest(record.digest, `${label}.digest`);
    return {
      id: requireUuid(record.id, `${label}.id`),
      kind: requireEnum(record, 'kind', [
        'session-created',
        'checkpoint-invalidated',
        'external-png-observed',
        'manifest-conflict',
        'draft-archive-recorded',
        'sync-receipt-recorded',
        'formal-archive-recorded',
        'archive-inspection-recorded',
        'installation-receipt-recorded',
        'release-provenance-recorded',
        'provider',
        'human-declaration',
        'human-preview-acceptance',
      ], label),
      occurredAt: requireTimestamp(record.occurredAt, `${label}.occurredAt`),
      summary: requireString(record, 'summary', label),
      ...(digest === undefined ? {} : { digest }),
    };
  });
}

function parseConflict(value: unknown): AssetAuthoringManifestConflict | null {
  if (value === null) return null;
  const record = requireRecord(value, 'session.conflict');
  assertExactKeys(
    record,
    ['kind', 'expectedDigest', 'actualDigest', 'detectedAt', 'resolution'],
    'session.conflict',
  );
  return {
    kind: requireEnum(record, 'kind', ['manifest-drift'], 'session.conflict'),
    expectedDigest: requireDigest(record.expectedDigest, 'session.conflict.expectedDigest'),
    actualDigest: requireDigest(record.actualDigest, 'session.conflict.actualDigest'),
    detectedAt: requireTimestamp(record.detectedAt, 'session.conflict.detectedAt'),
    resolution: requireEnum(
      record,
      'resolution',
      ['unresolved', 'external', 'session'],
      'session.conflict',
    ),
  };
}

function canonicalWorkspaceRoot(
  workspace: AssetWorkspace,
  fileOps: AssetAuthoringSessionFileOps,
): string {
  try {
    assertExistingDirectory(workspace.root, 'Asset workspace root', fileOps);
    return path.resolve(workspace.root);
  } catch {
    fail(
      'asset_authoring_session_path_invalid',
      `Asset workspace root is unavailable: ${workspace.root}`,
      workspace.root,
    );
  }
}

function assertExistingDirectory(
  target: string,
  label: string,
  fileOps: AssetAuthoringSessionFileOps,
): void {
  let stats;
  try {
    stats = fileOps.lstatSync(target);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      fail('asset_authoring_session_not_found', `${label} does not exist: ${target}`, target);
    }
    throw error;
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    fail('asset_authoring_session_path_invalid', `${label} is not a real directory: ${target}`, target);
  }
}

function assertNoExistingSymlinkInPath(
  root: string,
  target: string,
  label: string,
  fileOps: AssetAuthoringSessionFileOps,
): void {
  // Keep the lexical root here. On macOS, temporary directories commonly use
  // the `/var` alias while `realpathSync` returns `/private/var`; comparing
  // those two spellings would reject a contained path before we inspect its
  // existing components for symlinks.
  const canonicalRoot = path.resolve(root);
  const absoluteTarget = path.resolve(target);
  if (!isInsideRoot(canonicalRoot, absoluteTarget)) {
    fail('asset_authoring_session_path_invalid', `${label} escapes its managed root: ${target}`, target);
  }
  let current = canonicalRoot;
  const relative = path.relative(canonicalRoot, absoluteTarget);
  for (const segment of relative === '' ? [] : relative.split(path.sep)) {
    current = path.join(current, segment);
    if (!existsSync(current)) break;
    const stats = fileOps.lstatSync(current);
    if (stats.isSymbolicLink()) {
      fail('asset_authoring_session_path_invalid', `${label} traverses a symlink: ${current}`, current);
    }
  }
}

function ensureSessionsRoot(
  workspace: AssetWorkspace,
  fileOps: AssetAuthoringSessionFileOps,
): string {
  assertExistingDirectory(workspace.root, 'Asset workspace root', fileOps);
  assertExistingDirectory(workspace.stateRoot, 'Asset workspace state root', fileOps);
  const sessionsRoot = assetAuthoringSessionsRoot(workspace);
  assertNoExistingSymlinkInPath(workspace.stateRoot, sessionsRoot, 'Asset authoring session root', fileOps);
  if (!existsSync(sessionsRoot)) {
    fileOps.mkdirSync(sessionsRoot, { recursive: false, mode: 0o700 });
  }
  assertExistingDirectory(sessionsRoot, 'Asset authoring session root', fileOps);
  return sessionsRoot;
}

function validatePackRoot(
  workspace: AssetWorkspace,
  packRoot: string,
  fileOps: AssetAuthoringSessionFileOps,
): string {
  const packsRoot = path.resolve(workspace.packsRoot);
  const resolved = path.isAbsolute(packRoot)
    ? path.resolve(packRoot)
    : path.resolve(workspace.root, packRoot);
  if (!isInsideRoot(packsRoot, resolved) || resolved === packsRoot) {
    fail(
      'asset_authoring_session_path_invalid',
      `Authoring pack root must stay inside the workspace packs root: ${packRoot}`,
      packRoot,
    );
  }
  assertNoExistingSymlinkInPath(packsRoot, resolved, 'Authoring pack root', fileOps);
  return resolved;
}

function readSessionFile(
  workspace: AssetWorkspace,
  sessionId: string,
  fileOps: AssetAuthoringSessionFileOps,
): string {
  const filePath = assetAuthoringSessionPath(workspace, sessionId);
  const sessionsRoot = assetAuthoringSessionsRoot(workspace);
  try {
    assertExistingDirectory(sessionsRoot, 'Asset authoring session root', fileOps);
    assertNoExistingSymlinkInPath(sessionsRoot, path.dirname(filePath), 'Asset authoring session directory', fileOps);
    const directoryStats = fileOps.lstatSync(path.dirname(filePath));
    if (directoryStats.isSymbolicLink() || !directoryStats.isDirectory()) {
      fail('asset_authoring_session_path_invalid', `Asset authoring session directory is invalid: ${path.dirname(filePath)}`, path.dirname(filePath));
    }
    const fileStats = fileOps.lstatSync(filePath);
    if (fileStats.isSymbolicLink() || !fileStats.isFile()) {
      fail('asset_authoring_session_tampered', `Asset authoring session file is not regular: ${filePath}`, filePath);
    }
    return fileOps.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error instanceof AssetAuthoringSessionError) throw error;
    if (isNodeError(error) && error.code === 'ENOENT') {
      fail('asset_authoring_session_not_found', `Asset authoring session not found: ${sessionId}`, filePath);
    }
    throw error;
  }
}

function parseSessionDocument(
  input: unknown,
  workspace: AssetWorkspace,
  requestedSessionId: string,
  fileOps: AssetAuthoringSessionFileOps,
): AssetAuthoringSession {
  const record = requireRecord(input, 'Asset authoring session');
  assertExactKeys(record, SESSION_KEYS, 'Asset authoring session');
  const schema = requireString(record, 'schema', 'session');
  if (schema !== ASSET_AUTHORING_SESSION_SCHEMA) {
    fail('asset_authoring_session_tampered', `Unknown asset authoring session schema: ${schema}.`);
  }
  const sessionId = requireUuid(record.sessionId, 'session.sessionId');
  if (sessionId !== requestedSessionId) {
    fail('asset_authoring_session_tampered', 'Session file identity does not match its directory.');
  }
  const currentWorkspaceRoot = canonicalWorkspaceRoot(workspace, fileOps);
  const workspaceRoot = requireString(record, 'workspaceRoot', 'session');
  if (!path.isAbsolute(workspaceRoot) || path.resolve(workspaceRoot) !== workspaceRoot) {
    fail('asset_authoring_session_path_invalid', 'session.workspaceRoot must be an absolute path.');
  }
  if (workspaceRoot !== currentWorkspaceRoot) {
    fail(
      'asset_authoring_session_workspace_mismatch',
      `Authoring session ${sessionId} does not belong to this workspace.`,
      workspaceRoot,
    );
  }
  const packRoot = validatePackRoot(workspace, requireString(record, 'packRoot', 'session'), fileOps);
  const cliVersion = requireString(record, 'cliVersion', 'session');
  const goal = requireEnum(record, 'goal', ['new-item', 'extend-item', 'attach-pack'], 'session');
  const planResult = parseAssetAuthoringPlan(record.plan);
  if (!planResult.ok) {
    fail('asset_authoring_session_tampered', 'session.plan is not a valid strict authoring plan.');
  }
  if (planResult.plan.goal !== goal) {
    fail('asset_authoring_session_tampered', 'session.goal does not match session.plan.goal.');
  }
  const state = requireEnum(record, 'state', AUTHORING_STATES, 'session');
  const reason = requireString(record, 'reason', 'session');
  const phase = requireEnum(record, 'phase', AUTHORING_PHASES, 'session');
  const checkpoint = parseCheckpoint(record.checkpoint, 'session.checkpoint');
  const checkpointFreshness = requireEnum(
    record,
    'checkpointFreshness',
    CHECKPOINT_FRESHNESS_VALUES,
    'session',
  );
  const checkpoints = parseTargetCheckpoints(record.checkpoints);
  const receipts = parseReceipts(record.receipts, sessionId, planResult.plan);
  validateReceiptScope(receipts, workspace, sessionId, packRoot);
  const provenance = parseProvenance(record.provenance);
  const conflict = parseConflict(record.conflict);
  const manifestDigest = requireNullableDigest(record, 'manifestDigest', 'session');
  const createdAt = requireTimestamp(record.createdAt, 'session.createdAt');
  const updatedAt = requireTimestamp(record.updatedAt, 'session.updatedAt');
  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    fail('asset_authoring_session_invalid', 'session.updatedAt cannot precede session.createdAt.');
  }
  return {
    schema: ASSET_AUTHORING_SESSION_SCHEMA,
    sessionId,
    workspaceRoot,
    packRoot,
    cliVersion,
    goal,
    plan: planResult.plan,
    state,
    reason,
    phase,
    checkpoint,
    checkpointFreshness,
    checkpoints,
    receipts,
    provenance,
    conflict,
    manifestDigest,
    createdAt,
    updatedAt,
  };
}

function validateReceiptScope(
  receipts: AssetAuthoringSessionReceipts,
  workspace: AssetWorkspace,
  sessionId: string,
  packRoot: string,
): void {
  const draftArchive = receipts.draftArchive;
  if (draftArchive !== null && draftArchive !== undefined) {
    const artifactRoot = path.join(
      path.dirname(assetAuthoringSessionPath(workspace, sessionId)),
      'release-artifacts',
    );
    if (!isInsideRoot(path.resolve(artifactRoot), path.resolve(draftArchive.archivePath))) {
      fail(
        'asset_authoring_session_path_invalid',
        'session.receipts.draftArchive.archivePath must stay inside the session release-artifact root.',
        draftArchive.archivePath,
      );
    }
  }

  const sync = receipts.sync;
  if (sync !== null && sync !== undefined) {
    const outputRoot = path.resolve(workspace.outputRoot);
    if (path.resolve(sync.outputRoot) !== outputRoot) {
      fail(
        'asset_authoring_session_workspace_mismatch',
        'session.receipts.sync.outputRoot must match the workspace manager output root.',
        sync.outputRoot,
      );
    }
  }

  const formalArchive = receipts.formalArchive;
  if (formalArchive !== null && formalArchive !== undefined) {
    const artifactRoot = path.join(
      path.dirname(assetAuthoringSessionPath(workspace, sessionId)),
      'release-artifacts',
    );
    if (!isInsideRoot(path.resolve(artifactRoot), path.resolve(formalArchive.archivePath))) {
      fail(
        'asset_authoring_session_path_invalid',
        'session.receipts.formalArchive.archivePath must stay inside the session release-artifact root.',
        formalArchive.archivePath,
      );
    }
    const resolvedPackRoot = path.resolve(packRoot);
    for (const artifact of formalArchive.previewArtifacts) {
      if (!isInsideRoot(resolvedPackRoot, path.resolve(artifact.path))) {
        fail(
          'asset_authoring_session_path_invalid',
          'session.receipts.formalArchive.previewArtifacts must stay inside the session pack root.',
          artifact.path,
        );
      }
    }
  }

  const installation = receipts.installation;
  if (installation !== null && installation !== undefined) {
    const artistWorkspaceRoot = path.resolve(workspace.root);
    const consumerWorkspaceRoot = path.resolve(installation.workspaceRoot);
    if (
      isInsideRoot(artistWorkspaceRoot, consumerWorkspaceRoot)
      || isInsideRoot(consumerWorkspaceRoot, artistWorkspaceRoot)
    ) {
      fail(
        'asset_authoring_session_workspace_mismatch',
        'session.receipts.installation.workspaceRoot must be a distinct workspace outside the artist workspace.',
        installation.workspaceRoot,
      );
    }
    for (const [label, target] of [
      ['installedDirectory', installation.installedDirectory],
      ['registryPath', installation.registryPath],
      ['outputRoot', installation.outputRoot],
    ] as const) {
      if (!isInsideRoot(consumerWorkspaceRoot, path.resolve(target))) {
        fail(
          'asset_authoring_session_path_invalid',
          `session.receipts.installation.${label} must stay inside the consumer workspace.`,
          target,
        );
      }
    }
  }

  const releaseProvenance = receipts.releaseProvenance;
  if (releaseProvenance !== null && releaseProvenance !== undefined) {
    const artifactRoot = path.join(
      path.dirname(assetAuthoringSessionPath(workspace, sessionId)),
      'release-artifacts',
    );
    if (!isInsideRoot(path.resolve(artifactRoot), path.resolve(releaseProvenance.provenancePath))) {
      fail(
        'asset_authoring_session_path_invalid',
        'session.receipts.releaseProvenance.provenancePath must stay inside the session release-artifact root.',
        releaseProvenance.provenancePath,
      );
    }
  }
}

function serializeSession(session: AssetAuthoringSession): string {
  return `${JSON.stringify(session, null, 2)}\n`;
}

function atomicWriteSession(
  filePath: string,
  content: string,
  fileOps: AssetAuthoringSessionFileOps,
): void {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    fileOps.writeFileSync(temporaryPath, content, { flag: 'wx', mode: 0o600 });
    fileOps.renameSync(temporaryPath, filePath);
  } finally {
    fileOps.rmSync(temporaryPath, { force: true });
  }
}

function sessionTargetCheckpoints(plan: AssetAuthoringPlan): readonly AssetAuthoringTargetCheckpoint[] {
  return sortedStrings(plan.scope.paths).map((targetId) => ({
    targetId,
    freshness: 'missing',
  }));
}

function normalizedNow(now: () => string): string {
  return requireTimestamp(now(), 'session.now');
}

function updateFromSession(
  session: AssetAuthoringSession,
  update: AssetAuthoringSessionUpdate,
  updatedAt: string,
): AssetAuthoringSession {
  return {
    ...session,
    ...(update.state === undefined ? {} : { state: update.state }),
    ...(update.reason === undefined ? {} : { reason: update.reason }),
    ...(update.phase === undefined ? {} : { phase: update.phase }),
    ...(update.checkpoint === undefined ? {} : { checkpoint: update.checkpoint }),
    ...(update.checkpointFreshness === undefined ? {} : { checkpointFreshness: update.checkpointFreshness }),
    ...(update.checkpoints === undefined ? {} : { checkpoints: update.checkpoints }),
    ...(update.receipts === undefined ? {} : {
      receipts: {
        ...session.receipts,
        ...update.receipts,
      },
    }),
    ...(update.provenance === undefined ? {} : { provenance: update.provenance }),
    ...(update.conflict === undefined ? {} : { conflict: update.conflict }),
    ...(update.manifestDigest === undefined ? {} : { manifestDigest: update.manifestDigest }),
    updatedAt,
  };
}

class AssetAuthoringSessionStoreImpl implements AssetAuthoringSessionStore {
  private readonly workspace: AssetWorkspace;
  private readonly fileOps: AssetAuthoringSessionFileOps;
  private readonly now: () => string;
  private readonly sessionId: () => string;
  private readonly eventId: () => string;

  constructor(workspace: AssetWorkspace, options: AssetAuthoringSessionStoreOptions) {
    this.workspace = workspace;
    this.fileOps = { ...DEFAULT_FILE_OPS, ...(options.fileOps ?? {}) };
    this.now = options.now ?? (() => new Date().toISOString());
    this.sessionId = options.sessionId ?? randomUUID;
    this.eventId = options.eventId ?? randomUUID;
  }

  create(input: AssetAuthoringSessionCreateInput): AssetAuthoringSession {
    const planResult = parseAssetAuthoringPlan(input.plan);
    if (!planResult.ok) {
      fail('asset_authoring_session_invalid', 'Cannot create a session from an invalid authoring plan.');
    }
    const sessionsRoot = ensureSessionsRoot(this.workspace, this.fileOps);
    const sessionId = requireUuid(this.sessionId(), 'session id');
    const directory = path.join(sessionsRoot, sessionId);
    const filePath = path.join(directory, ASSET_AUTHORING_SESSION_FILE);
    const packRoot = validatePackRoot(this.workspace, input.packRoot, this.fileOps);
    const workspaceRoot = canonicalWorkspaceRoot(this.workspace, this.fileOps);
    const timestamp = normalizedNow(this.now);
    const session: AssetAuthoringSession = {
      schema: ASSET_AUTHORING_SESSION_SCHEMA,
      sessionId,
      workspaceRoot,
      packRoot,
      cliVersion: CLI_VERSION,
      goal: planResult.plan.goal,
      plan: planResult.plan,
      state: 'needs-user-action',
      reason: 'session-created',
      phase: 'planned',
      checkpoint: null,
      checkpointFreshness: 'missing',
      checkpoints: sessionTargetCheckpoints(planResult.plan),
      receipts: {
        validation: null,
        preview: null,
        acknowledgements: null,
        releaseDeclaration: null,
        previewAcceptance: null,
        draftArchive: null,
        sync: null,
        formalArchive: null,
        archiveInspection: null,
        installation: null,
        releaseProvenance: null,
        providerInvocation: null,
        providerResult: null,
      },
      provenance: [{
        id: this.eventId(),
        kind: 'session-created',
        occurredAt: timestamp,
        summary: 'Authoring session created from a strict plan.',
      }],
      conflict: null,
      manifestDigest: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    let directoryCreated = false;
    try {
      this.fileOps.mkdirSync(directory, { recursive: false, mode: 0o700 });
      directoryCreated = true;
      atomicWriteSession(filePath, serializeSession(session), this.fileOps);
    } catch (error) {
      if (directoryCreated) this.fileOps.rmSync(directory, { recursive: true, force: true });
      throw error;
    }
    return session;
  }

  read(sessionId: string): AssetAuthoringSession {
    const content = readSessionFile(this.workspace, sessionId, this.fileOps);
    let parsed: unknown;
    try {
      parsed = JSON.parse(content) as unknown;
    } catch {
      fail('asset_authoring_session_tampered', `Asset authoring session JSON is invalid: ${sessionId}.`);
    }
    return parseSessionDocument(parsed, this.workspace, sessionId, this.fileOps);
  }

  replace(sessionId: string, update: AssetAuthoringSessionUpdate): AssetAuthoringSession {
    const current = this.read(sessionId);
    const next = updateFromSession(current, update, normalizedNow(this.now));
    const validated = parseSessionDocument(
      next,
      this.workspace,
      sessionId,
      this.fileOps,
    );
    const filePath = assetAuthoringSessionPath(this.workspace, sessionId);
    atomicWriteSession(filePath, serializeSession(validated), this.fileOps);
    return validated;
  }

  status(sessionId: string): AssetAuthoringSession {
    return this.read(sessionId);
  }

  resume(
    sessionId: string,
    options: AssetAuthoringSessionResumeOptions = {},
  ): AssetAuthoringSession {
    const current = this.read(sessionId);
    const decisions = options.invalidation ?? [];
    if (decisions.length === 0) return current;
    const first = decisions[0]!;
    if (current.checkpointFreshness === 'stale' && current.reason === first.reason) {
      return current;
    }
    const timestamp = normalizedNow(this.now);
    const next = updateFromSession(current, {
      state: 'needs-user-action',
      reason: first.reason,
      phase: 'blocked',
      checkpointFreshness: 'stale',
      checkpoints: current.checkpoints.map((checkpoint) => ({
        ...checkpoint,
        freshness: 'stale',
      })),
      provenance: [
        ...current.provenance,
        {
          id: this.eventId(),
          kind: 'checkpoint-invalidated',
          occurredAt: timestamp,
          summary: `Checkpoint invalidated: ${first.reason}.`,
        },
      ],
    }, timestamp);
    const validated = parseSessionDocument(next, this.workspace, sessionId, this.fileOps);
    const filePath = assetAuthoringSessionPath(this.workspace, sessionId);
    atomicWriteSession(filePath, serializeSession(validated), this.fileOps);
    return validated;
  }
}

export function assetAuthoringSessionPath(
  workspace: AssetWorkspace,
  sessionId: string,
): string {
  requireUuid(sessionId, 'session id');
  const sessionsRoot = assetAuthoringSessionsRoot(workspace);
  const directory = path.resolve(sessionsRoot, sessionId);
  if (!isInsideRoot(path.resolve(sessionsRoot), directory) || directory === path.resolve(sessionsRoot)) {
    fail('asset_authoring_session_path_invalid', `Session id escapes the managed session root: ${sessionId}`);
  }
  return path.join(directory, ASSET_AUTHORING_SESSION_FILE);
}

export function createAssetAuthoringSessionStore(
  workspace: AssetWorkspace,
  options: AssetAuthoringSessionStoreOptions = {},
): AssetAuthoringSessionStore {
  return new AssetAuthoringSessionStoreImpl(workspace, options);
}

function sameSourceDigests(
  left: readonly AssetAuthoringSourceDigest[],
  right: readonly AssetAuthoringSourceDigest[],
): boolean {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort((a, b) => a.path.localeCompare(b.path));
  const rightSorted = [...right].sort((a, b) => a.path.localeCompare(b.path));
  return leftSorted.every((entry, index) => {
    const other = rightSorted[index]!;
    return entry.path === other.path && entry.digest === other.digest;
  });
}

function sameArtifactDigests(
  left: readonly AssetAuthoringReleaseArtifactDigest[],
  right: readonly AssetAuthoringReleaseArtifactDigest[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((artifact, index) => {
    const other = right[index];
    return other !== undefined
      && artifact.id === other.id
      && artifact.path === other.path
      && artifact.digest === other.digest;
  });
}

function sameReleaseDeclarationReceipts(
  left: AssetAuthoringReleaseDeclarationReceipt | null | undefined,
  right: AssetAuthoringReleaseDeclarationReceipt | null | undefined,
): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    return left === right;
  }
  return left.declarationDigest === right.declarationDigest
    && left.manifestDigest === right.manifestDigest
    && sameSourceDigests(left.sourceDigests, right.sourceDigests)
    && left.validationReceiptId === right.validationReceiptId
    && left.validationReceiptRevision === right.validationReceiptRevision
    && left.creditDigests.authorAndSource === right.creditDigests.authorAndSource
    && left.creditDigests.licenseAuthority === right.creditDigests.licenseAuthority
    && left.acknowledgements.contentDigest === right.acknowledgements.contentDigest
    && left.acknowledgements.recordDigests.length === right.acknowledgements.recordDigests.length
    && left.acknowledgements.recordDigests.every((digest, index) =>
      digest === right.acknowledgements.recordDigests[index]);
}

function samePreviewAcceptanceReceipts(
  left: AssetAuthoringPreviewAcceptanceReceipt | null | undefined,
  right: AssetAuthoringPreviewAcceptanceReceipt | null | undefined,
): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    return left === right;
  }
  return left.declarationReceiptDigest === right.declarationReceiptDigest
    && left.manifestDigest === right.manifestDigest
    && sameSourceDigests(left.sourceDigests, right.sourceDigests)
    && left.validationReceiptId === right.validationReceiptId
    && left.validationReceiptRevision === right.validationReceiptRevision
    && left.previewReceiptId === right.previewReceiptId
    && left.previewInputDigest === right.previewInputDigest
    && sameArtifactDigests(left.artifacts, right.artifacts);
}

function sameFormalArchiveReceipts(
  left: AssetAuthoringFormalArchiveReceipt | null | undefined,
  right: AssetAuthoringFormalArchiveReceipt | null | undefined,
): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    return left === right;
  }
  return left.schema === right.schema
    && left.packId === right.packId
    && left.version === right.version
    && left.archivePath === right.archivePath
    && left.archiveDigest === right.archiveDigest
    && left.manifestDigest === right.manifestDigest
    && left.contentDigest === right.contentDigest
    && sameSourceDigests(left.sourceDigests, right.sourceDigests)
    && left.validationReceiptId === right.validationReceiptId
    && left.declarationReceiptDigest === right.declarationReceiptDigest
    && left.previewAcceptanceReceiptDigest === right.previewAcceptanceReceiptDigest
    && left.previewInputDigest === right.previewInputDigest
    && sameArtifactDigests(left.previewArtifacts, right.previewArtifacts)
    && left.recordedAt === right.recordedAt;
}

function sameArchiveInspectionReceipts(
  left: AssetAuthoringArchiveInspectionReceipt | null | undefined,
  right: AssetAuthoringArchiveInspectionReceipt | null | undefined,
): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    return left === right;
  }
  return left.schema === right.schema
    && left.packId === right.packId
    && left.version === right.version
    && left.archivePath === right.archivePath
    && left.archiveDigest === right.archiveDigest
    && left.formalArchiveDigest === right.formalArchiveDigest
    && left.manifestDigest === right.manifestDigest
    && left.contentDigest === right.contentDigest
    && sameSourceDigests(left.sourceDigests, right.sourceDigests)
    && left.entryCount === right.entryCount
    && left.totalUncompressedBytes === right.totalUncompressedBytes
    && left.recordedAt === right.recordedAt;
}

function sameInstallationReceipts(
  left: AssetAuthoringInstallationReceipt | null | undefined,
  right: AssetAuthoringInstallationReceipt | null | undefined,
): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    return left === right;
  }
  return left.schema === right.schema
    && left.workspaceId === right.workspaceId
    && left.workspaceRoot === right.workspaceRoot
    && left.packId === right.packId
    && left.version === right.version
    && left.archivePath === right.archivePath
    && left.archiveDigest === right.archiveDigest
    && left.installedDirectory === right.installedDirectory
    && JSON.stringify(left.payloadDigests) === JSON.stringify(right.payloadDigests)
    && left.registryPath === right.registryPath
    && left.registryDigest === right.registryDigest
    && left.outputRoot === right.outputRoot
    && JSON.stringify(left.generatedDigests) === JSON.stringify(right.generatedDigests)
    && left.creditsDigest === right.creditsDigest
    && left.recordedAt === right.recordedAt;
}

function sameReleaseProvenanceReceipts(
  left: AssetAuthoringReleaseProvenanceReceipt | null | undefined,
  right: AssetAuthoringReleaseProvenanceReceipt | null | undefined,
): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    return left === right;
  }
  return left.schema === right.schema
    && left.packId === right.packId
    && left.version === right.version
    && left.provenancePath === right.provenancePath
    && left.provenanceDigest === right.provenanceDigest
    && left.projectionDigest === right.projectionDigest
    && left.formalArchiveDigest === right.formalArchiveDigest
    && left.recordedAt === right.recordedAt;
}

function releaseReceiptDigest(
  receipt: AssetAuthoringReleaseDeclarationReceipt | AssetAuthoringPreviewAcceptanceReceipt,
): string {
  return `sha256:${createHash('sha256')
    .update(assetAuthoringReleaseReceiptDigestInput(receipt), 'utf8')
    .digest('hex')}`;
}

export function deriveAuthoringInvalidationDecisions(
  previous: AssetAuthoringEvidence,
  current: AssetAuthoringEvidence,
): readonly AssetAuthoringInvalidationDecision[] {
  const decisions: AssetAuthoringInvalidationDecision[] = [];
  if (
    previous.manifestDigest !== null
    && current.manifestDigest !== null
    && previous.manifestDigest !== current.manifestDigest
  ) {
    decisions.push({ checkpoint: 'manifest', reason: 'manifest-semantic-drift' });
  }
  if (
    previous.contractDigest !== null
    && current.contractDigest !== null
    && previous.contractDigest !== current.contractDigest
  ) {
    decisions.push({ checkpoint: 'contract', reason: 'contract-replaced' });
  }
  if (!sameSourceDigests(previous.sourceDigests, current.sourceDigests)) {
    decisions.push({ checkpoint: 'source', reason: 'png-drift' });
  }
  const acknowledgementsReceipt = current.acknowledgementsReceipt;
  if (
    acknowledgementsReceipt !== undefined
    && acknowledgementsReceipt !== null
    && (
      acknowledgementsReceipt.manifestDigest !== current.manifestDigest
      || !sameSourceDigests(acknowledgementsReceipt.sourceDigests, current.sourceDigests)
    )
  ) {
    decisions.push({ checkpoint: 'acknowledgements', reason: 'acknowledgement-receipt-stale' });
  }
  if (
    current.validationReceipt !== null
    && (
      current.validationReceipt.manifestDigest !== current.manifestDigest
      || !sameSourceDigests(current.validationReceipt.sourceDigests, current.sourceDigests)
    )
  ) {
    decisions.push({ checkpoint: 'validation', reason: 'validation-receipt-stale' });
  }
  if (
    current.previewReceipt !== null
    && (
      current.previewReceipt.manifestDigest !== current.manifestDigest
      || !sameSourceDigests(current.previewReceipt.sourceDigests, current.sourceDigests)
      || current.validationReceipt === null
      || current.previewReceipt.validationReceiptId === null
      || current.previewReceipt.validationReceiptId !== current.validationReceipt.id
      || (
        current.previewInputDigest !== undefined
        && current.previewInputDigest !== current.previewReceipt.inputDigest
      )
    )
  ) {
    decisions.push({ checkpoint: 'preview', reason: 'preview-receipt-stale' });
  }
  const previousPreviewArtifacts = previous.previewReceipt?.artifacts;
  const currentPreviewArtifacts = current.previewReceipt?.artifacts;
  if (
    previous.previewReceipt !== null
    && current.previewReceipt !== null
    && previousPreviewArtifacts !== null
    && previousPreviewArtifacts !== undefined
    && currentPreviewArtifacts !== null
    && currentPreviewArtifacts !== undefined
    && !sameArtifactDigests(previousPreviewArtifacts, currentPreviewArtifacts)
  ) {
    decisions.push({ checkpoint: 'previewArtifacts', reason: 'preview-artifact-stale' });
  }
  const previousDeclaration = previous.releaseDeclarationReceipt;
  const currentDeclaration = current.releaseDeclarationReceipt;
  if (!sameReleaseDeclarationReceipts(previousDeclaration, currentDeclaration)) {
    if (previousDeclaration !== undefined && previousDeclaration !== null) {
      decisions.push({ checkpoint: 'releaseDeclaration', reason: 'release-declaration-stale' });
    }
  } else if (
    previousDeclaration !== undefined
    && previousDeclaration !== null
    && currentDeclaration !== undefined
    && currentDeclaration !== null
    && (
      current.validationReceipt === null
      || currentDeclaration.manifestDigest !== current.manifestDigest
      || !sameSourceDigests(currentDeclaration.sourceDigests, current.sourceDigests)
      || currentDeclaration.validationReceiptId !== current.validationReceipt.id
      || (
        current.acknowledgementsReceipt !== undefined
        && (
          current.acknowledgementsReceipt === null
          || currentDeclaration.acknowledgements.recordDigests.length
            !== current.acknowledgementsReceipt.recordDigests.length
          || currentDeclaration.acknowledgements.recordDigests.some((digest, index) =>
            digest !== current.acknowledgementsReceipt?.recordDigests[index])
        )
      )
    )
  ) {
    decisions.push({ checkpoint: 'releaseDeclaration', reason: 'release-declaration-stale' });
  }
  const previousAcceptance = previous.previewAcceptanceReceipt;
  const currentAcceptance = current.previewAcceptanceReceipt;
  if (!samePreviewAcceptanceReceipts(previousAcceptance, currentAcceptance)) {
    if (previousAcceptance !== undefined && previousAcceptance !== null) {
      decisions.push({ checkpoint: 'previewAcceptance', reason: 'preview-acceptance-stale' });
    }
  } else if (
    previousAcceptance !== undefined
    && previousAcceptance !== null
    && currentAcceptance !== undefined
    && currentAcceptance !== null
    && (
      currentDeclaration === undefined
      || currentDeclaration === null
      || current.validationReceipt === null
      || current.previewReceipt === null
      || current.previewReceipt.artifacts === null
      || currentAcceptance.declarationReceiptDigest !== currentDeclaration?.declarationDigest
      || currentAcceptance.manifestDigest !== current.manifestDigest
      || !sameSourceDigests(currentAcceptance.sourceDigests, current.sourceDigests)
      || currentAcceptance.validationReceiptId !== current.validationReceipt.id
      || currentAcceptance.previewReceiptId !== current.previewReceipt.id
      || currentAcceptance.previewInputDigest !== current.previewReceipt.inputDigest
      || !sameArtifactDigests(currentAcceptance.artifacts, current.previewReceipt.artifacts)
    )
  ) {
    decisions.push({ checkpoint: 'previewAcceptance', reason: 'preview-acceptance-stale' });
  }
  const previousFormalArchive = previous.formalArchiveReceipt;
  const currentFormalArchive = current.formalArchiveReceipt;
  if (!sameFormalArchiveReceipts(previousFormalArchive, currentFormalArchive)) {
    if (previousFormalArchive !== undefined && previousFormalArchive !== null) {
      decisions.push({ checkpoint: 'formalArchive', reason: 'formal-archive-stale' });
    }
  } else if (
    previousFormalArchive !== undefined
    && previousFormalArchive !== null
    && currentFormalArchive !== undefined
    && currentFormalArchive !== null
    && (
      current.validationReceipt === null
      || current.releaseDeclarationReceipt === undefined
      || current.releaseDeclarationReceipt === null
      || current.previewAcceptanceReceipt === undefined
      || current.previewAcceptanceReceipt === null
      || currentFormalArchive.manifestDigest !== current.manifestDigest
      || !sameSourceDigests(currentFormalArchive.sourceDigests, current.sourceDigests)
      || currentFormalArchive.validationReceiptId !== current.validationReceipt.id
      || currentFormalArchive.declarationReceiptDigest
        !== current.releaseDeclarationReceipt.declarationDigest
      || currentFormalArchive.previewAcceptanceReceiptDigest
        !== releaseReceiptDigest(current.previewAcceptanceReceipt)
      || currentFormalArchive.previewInputDigest !== current.previewAcceptanceReceipt.previewInputDigest
      || !sameArtifactDigests(
        currentFormalArchive.previewArtifacts,
        current.previewAcceptanceReceipt.artifacts,
      )
    )
  ) {
    decisions.push({ checkpoint: 'formalArchive', reason: 'formal-archive-stale' });
  }

  const previousArchiveInspection = previous.archiveInspectionReceipt;
  const currentArchiveInspection = current.archiveInspectionReceipt;
  if (!sameArchiveInspectionReceipts(previousArchiveInspection, currentArchiveInspection)) {
    if (previousArchiveInspection !== undefined && previousArchiveInspection !== null) {
      decisions.push({ checkpoint: 'archiveInspection', reason: 'archive-inspection-stale' });
    }
  } else if (
    previousArchiveInspection !== undefined
    && previousArchiveInspection !== null
    && currentArchiveInspection !== undefined
    && currentArchiveInspection !== null
    && (
      currentFormalArchive === undefined
      || currentFormalArchive === null
      || currentArchiveInspection.formalArchiveDigest !== currentFormalArchive.archiveDigest
      || currentArchiveInspection.packId !== currentFormalArchive.packId
      || currentArchiveInspection.version !== currentFormalArchive.version
      || currentArchiveInspection.manifestDigest !== currentFormalArchive.manifestDigest
      || currentArchiveInspection.contentDigest !== currentFormalArchive.contentDigest
      || !sameSourceDigests(currentArchiveInspection.sourceDigests, currentFormalArchive.sourceDigests)
      || currentArchiveInspection.manifestDigest !== current.manifestDigest
      || !sameSourceDigests(currentArchiveInspection.sourceDigests, current.sourceDigests)
    )
  ) {
    decisions.push({ checkpoint: 'archiveInspection', reason: 'archive-inspection-stale' });
  }

  const previousInstallation = previous.installationReceipt;
  const currentInstallation = current.installationReceipt;
  const releaseArchiveStale = decisions.some((decision) =>
    decision.checkpoint === 'formalArchive' || decision.checkpoint === 'archiveInspection');
  if (!sameInstallationReceipts(previousInstallation, currentInstallation)) {
    if (previousInstallation !== undefined && previousInstallation !== null) {
      decisions.push({ checkpoint: 'installation', reason: 'installation-stale' });
    }
  } else if (
    previousInstallation !== undefined
    && previousInstallation !== null
    && currentInstallation !== undefined
    && currentInstallation !== null
    && (
      currentArchiveInspection === undefined
      || currentArchiveInspection === null
      || currentInstallation.archiveDigest !== currentArchiveInspection.archiveDigest
      || currentInstallation.packId !== currentArchiveInspection.packId
      || currentInstallation.version !== currentArchiveInspection.version
      || currentInstallation.archivePath !== currentArchiveInspection.archivePath
      || releaseArchiveStale
    )
  ) {
    decisions.push({ checkpoint: 'installation', reason: 'installation-stale' });
  }

  const previousReleaseProvenance = previous.releaseProvenanceReceipt;
  const currentReleaseProvenance = current.releaseProvenanceReceipt;
  const releaseEvidenceStale = decisions.some((decision) =>
    decision.checkpoint === 'releaseDeclaration'
    || decision.checkpoint === 'previewAcceptance'
    || decision.checkpoint === 'formalArchive'
    || decision.checkpoint === 'archiveInspection');
  if (!sameReleaseProvenanceReceipts(previousReleaseProvenance, currentReleaseProvenance)) {
    if (previousReleaseProvenance !== undefined && previousReleaseProvenance !== null) {
      decisions.push({ checkpoint: 'releaseProvenance', reason: 'release-provenance-stale' });
    }
  } else if (
    previousReleaseProvenance !== undefined
    && previousReleaseProvenance !== null
    && currentReleaseProvenance !== undefined
    && currentReleaseProvenance !== null
    && (
      currentFormalArchive === undefined
      || currentFormalArchive === null
      || currentReleaseProvenance.formalArchiveDigest !== currentFormalArchive.archiveDigest
      || releaseEvidenceStale
    )
  ) {
    decisions.push({ checkpoint: 'releaseProvenance', reason: 'release-provenance-stale' });
  }
  return decisions;
}
