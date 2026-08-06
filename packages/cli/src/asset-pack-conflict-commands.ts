import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  assetPackConflictDigestInput,
  assetPackConflictResolutionDigestInput,
  assetPackConflictResolutionProjection,
  assetPackConflictSelectionDigestInput,
  evaluateAssetPackConflict,
  parseAssetPackConflict,
  parseAssetPackConflictSelection,
  resolveAssetPackConflict,
  type AssetPackConflict,
  type AssetPackConflictDiagnosticCode,
  type AssetPackConflictEvaluation,
  type AssetPackConflictNextAction,
  type AssetPackConflictResolution,
  type AssetPackConflictSelection,
} from '@lpc-toolkit/core';
import { flagBoolean, flagString, type ParsedArgs } from './args.js';
import type { AssetWorkspace } from './asset-workspace.js';
import { commandError, commandOk, type CliResponse } from './response.js';

export const ASSET_PACK_CONFLICT_RECEIPT_SCHEMA =
  'lpc-toolkit.asset-pack-conflict-receipt.v1' as const;

type AssetPackConflictAuditEventName =
  | 'inspected'
  | 'selection-required'
  | 'resolved'
  | 'declined'
  | 'blocked'
  | 'stale'
  | 'recovered'
  | 'discarded';

interface AssetPackConflictAuditEvent {
  readonly sequence: number;
  readonly event: AssetPackConflictAuditEventName;
  readonly conflictId: string;
  readonly baselineDigest: string;
  readonly targetKeys: readonly string[];
  readonly status: string;
  readonly nextAction: AssetPackConflictNextAction | 'import-resolution-candidate';
  readonly evidenceDigests: readonly string[];
  readonly resolutionDigest?: string;
}

interface AssetPackConflictAudit {
  readonly schema: 'lpc-toolkit.asset-pack-conflict-audit.v1';
  readonly conflictId: string;
  readonly baselineDigest: string;
  readonly events: readonly AssetPackConflictAuditEvent[];
}

interface AssetPackConflictReceipt {
  readonly schema: typeof ASSET_PACK_CONFLICT_RECEIPT_SCHEMA;
  readonly conflict: AssetPackConflict;
  readonly conflictDigest: string;
  readonly selection: AssetPackConflictSelection;
  readonly selectionDigest: string;
  readonly resolution: AssetPackConflictResolution;
  readonly resolutionDigest: string;
  readonly audit: AssetPackConflictAudit;
  readonly auditDigest: string;
  readonly stagingRelativePath: string;
}

interface AssetConflictCommandContext {
  readonly parsed: ParsedArgs;
  readonly cwd: string;
  readonly workspace?: AssetWorkspace;
}

interface AssetConflictIssue {
  readonly code: string;
  readonly message: string;
  readonly nextAction?: AssetPackConflictNextAction | 'import-resolution-candidate';
}

const MAX_INPUT_BYTES = 128 * 1024;
const MAX_RECEIPT_BYTES = 256 * 1024;
const RECEIPT_DIRECTORY = 'conflict-resolutions';

export function runAssetConflictCommand(
  context: AssetConflictCommandContext,
): CliResponse<unknown> {
  const subcommand = context.parsed.command[2];
  try {
    if (subcommand === 'inspect') return inspectConflict(context);
    if (subcommand === 'resolve') return resolveConflict(context);
    if (subcommand === 'recover') return recoverConflict(context);
  } catch (error) {
    if (error instanceof AssetConflictInputError) {
      if (error.issue.nextAction !== undefined) {
        return commandOk(context.parsed.command.join(' '), {
          schema: ASSET_PACK_CONFLICT_RECEIPT_SCHEMA,
          status: 'needs-user-action',
          code: error.issue.code,
          message: error.issue.message,
          mutation: 'none',
          nextAction: error.issue.nextAction,
        });
      }
      return commandError(context.parsed.command.join(' '), {
        code: error.issue.code,
        message: error.issue.message,
      });
    }
    return commandError(context.parsed.command.join(' '), {
      code: 'asset_conflict_command_failed',
      message: error instanceof Error ? error.message : 'Asset conflict command failed.',
    });
  }
  return commandError(context.parsed.command.join(' '), {
    code: 'unknown_command',
    message: `Unknown asset conflict command: ${context.parsed.command.join(' ')}`,
  });
}

function inspectConflict(context: AssetConflictCommandContext): CliResponse<unknown> {
  const conflict = readConflict(context.cwd, flagString(context.parsed.flags, 'conflict'), context.cwd);
  const evaluation = evaluateAssetPackConflict(conflict);
  const audit = auditForInspection(conflict, evaluation);
  return commandOk('asset conflict inspect', {
    schema: conflict.schema,
    conflictId: conflict.conflictId,
    conflictDigest: digest(assetPackConflictDigestInput(conflict)),
    status: evaluation.status,
    target: conflict.target,
    contenders: conflict.contenders.map((contender) => ({
      contenderId: contender.contenderId,
      packId: contender.pack.packId,
      version: contender.pack.version,
      contentDigest: contender.pack.contentDigest,
      resultDigest: contender.resultDigest,
      origin: contender.origin,
      replacementIntentDigests: contender.pack.replacementIntentDigests,
      compatibility: contender.compatibility,
      trust: contender.trust,
      attribution: {
        sourceReferenceDigests: contender.sourceReferenceDigests,
        creditReferenceDigests: contender.creditReferenceDigests,
        licenseReferenceDigests: contender.licenseReferenceDigests,
        provenanceReferenceDigests: contender.provenanceReferenceDigests,
      },
      d2EvidenceDigests: contender.d2EvidenceDigests,
      d5EvidenceDigests: contender.d5EvidenceDigests,
    })),
    compatibility: conflict.compatibility,
    attribution: conflict.attribution,
    policy: conflict.policy,
    diagnostics: [...conflict.diagnostics, ...evaluation.diagnostics],
    mutation: 'none',
    nextAction: evaluation.nextAction,
    audit,
  });
}

function resolveConflict(context: AssetConflictCommandContext): CliResponse<unknown> {
  const workspace = requireWorkspace(context.workspace);
  const conflict = readConflict(
    context.cwd,
    flagString(context.parsed.flags, 'conflict'),
    workspace.root,
  );
  const selection = readSelection(
    context.cwd,
    flagString(context.parsed.flags, 'selection'),
    workspace.root,
  );
  const selectionDigest = digest(assetPackConflictSelectionDigestInput(selection));
  const result = resolveAssetPackConflict(conflict, selection, {
    confirmed: flagBoolean(context.parsed.flags, 'confirm'),
    selectionDigest,
  });
  if (!result.ok) return needsAction('asset conflict resolve', conflict, result.code, result.message, result.nextAction);

  const resolutionDigest = digest(assetPackConflictResolutionDigestInput(result.resolution));
  const relativeReceiptPath = path.posix.join(
    path.posix.relative(workspace.root, workspace.stagingRoot).split(path.sep).join('/'),
    RECEIPT_DIRECTORY,
    conflict.conflictId.slice('sha256:'.length),
    'receipt.json',
  );
  const receiptPath = path.resolve(workspace.root, relativeReceiptPath);
  ensureContainedPath(workspace.stagingRoot, path.dirname(receiptPath), 'D6 staging');
  ensureOwnedDirectory(workspace.stagingRoot, path.dirname(receiptPath));
  const audit = auditForResolution(conflict, result.resolution, resolutionDigest);
  const receipt: AssetPackConflictReceipt = {
    schema: ASSET_PACK_CONFLICT_RECEIPT_SCHEMA,
    conflict,
    conflictDigest: digest(assetPackConflictDigestInput(conflict)),
    selection,
    selectionDigest,
    resolution: result.resolution,
    resolutionDigest,
    audit,
    auditDigest: digest(canonicalJson(audit)),
    stagingRelativePath: relativeReceiptPath,
  };
  const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  if (bytes.byteLength > MAX_RECEIPT_BYTES) {
    throw new AssetConflictInputError({
      code: 'conflict_schema_invalid',
      message: 'The D6 conflict receipt exceeds the bounded receipt size.',
    });
  }
  const existing = readExistingFileState(receiptPath, bytes);
  if (existing === 'different') {
    return needsAction(
      'asset conflict resolve',
      conflict,
      'conflict_resolution_tampered',
      'An existing D6 receipt differs from the digest-bound resolution.',
      'discard-resolution',
    );
  }
  if (existing === 'missing') writeExclusiveFile(receiptPath, bytes);
  return commandOk('asset conflict resolve', {
    schema: ASSET_PACK_CONFLICT_RECEIPT_SCHEMA,
    conflictId: conflict.conflictId,
    status: result.resolution.status,
    resolutionDigest,
    mutation: 'staged',
    receiptPath: relativeReceiptPath,
    nextAction: result.resolution.status === 'declined'
      ? 'none'
      : 'import-resolution-candidate',
    resolution: assetPackConflictResolutionProjection(result.resolution),
    audit,
  });
}

function recoverConflict(context: AssetConflictCommandContext): CliResponse<unknown> {
  const workspace = requireWorkspace(context.workspace);
  const receiptInput = requireFlag(context.parsed.flags, 'receipt');
  const receiptPath = resolveInputPath(workspace.root, context.cwd, receiptInput, 'receipt');
  const receipt = readReceipt(receiptPath);
  const action = flagString(context.parsed.flags, 'action');
  if (action !== 'resume' && action !== 'discard') {
    throw new AssetConflictInputError({
      code: 'invalid_option',
      message: '--action must be resume or discard.',
    });
  }
  if (!flagBoolean(context.parsed.flags, 'confirm')) {
    return needsAction(
      'asset conflict recover',
      receipt.conflict,
      'conflict_requires_confirmation',
      'Explicit confirmation is required before recovering or discarding a D6 receipt.',
      'confirm-resolution',
    );
  }
  if (action === 'discard') {
    const resolutionDirectory = path.dirname(receiptPath);
    ensureContainedPath(workspace.stagingRoot, resolutionDirectory, 'D6 discard');
    rmSync(resolutionDirectory, { recursive: true, force: false });
    return commandOk('asset conflict recover', {
      schema: ASSET_PACK_CONFLICT_RECEIPT_SCHEMA,
      conflictId: receipt.conflict.conflictId,
      status: 'discarded',
      mutation: 'staging-discarded',
      nextAction: 'none',
      audit: appendAuditEvent(receipt.audit, {
        event: 'discarded',
        status: 'recoverable',
        nextAction: 'none',
        evidenceDigests: receipt.audit.events.at(-1)?.evidenceDigests ?? [],
      }),
    });
  }

  const conflictInput = flagString(context.parsed.flags, 'conflict');
  if (conflictInput !== undefined) {
    const currentConflict = readConflict(context.cwd, conflictInput, workspace.root);
    if (digest(assetPackConflictDigestInput(currentConflict)) !== receipt.conflictDigest) {
      return needsAction(
        'asset conflict recover',
        receipt.conflict,
        'conflict_baseline_stale',
        'The current conflict evidence no longer matches the recovery receipt.',
        'refresh-conflict',
      );
    }
  }
  const resolutionDirectory = path.dirname(receiptPath);
  ensureContainedPath(workspace.stagingRoot, resolutionDirectory, 'D6 recovery');
  return commandOk('asset conflict recover', {
    schema: ASSET_PACK_CONFLICT_RECEIPT_SCHEMA,
    conflictId: receipt.conflict.conflictId,
    status: 'recovered',
    mutation: 'none',
    receiptPath: receipt.stagingRelativePath,
    nextAction: receipt.resolution.status === 'declined'
      ? 'none'
      : 'import-resolution-candidate',
    audit: appendAuditEvent(receipt.audit, {
      event: 'recovered',
      status: 'recoverable',
      nextAction: receipt.resolution.status === 'declined'
        ? 'none'
        : 'import-resolution-candidate',
      evidenceDigests: receipt.audit.events.at(-1)?.evidenceDigests ?? [],
      resolutionDigest: receipt.resolutionDigest,
    }),
  });
}

function readConflict(cwd: string, input: string | undefined, allowedRoot: string): AssetPackConflict {
  const value = readJsonFile(resolveInputPath(allowedRoot, cwd, requireValue(input, '--conflict'), 'conflict'), MAX_INPUT_BYTES);
  const result = parseAssetPackConflict(value);
  if (!result.ok) {
    throw new AssetConflictInputError({
      code: 'conflict_schema_invalid',
      message: result.diagnostics[0]?.message ?? 'The conflict record is invalid.',
    });
  }
  if (digest(assetPackConflictDigestInput(result.conflict)) !== result.conflict.conflictId) {
    throw new AssetConflictInputError({
      code: 'conflict_identity_changed',
      message: 'The conflictId does not match the canonical conflict evidence.',
      nextAction: 'reinspect-conflict',
    });
  }
  return result.conflict;
}

function readSelection(cwd: string, input: string | undefined, allowedRoot: string): AssetPackConflictSelection {
  const value = readJsonFile(resolveInputPath(allowedRoot, cwd, requireValue(input, '--selection'), 'selection'), MAX_INPUT_BYTES);
  const result = parseAssetPackConflictSelection(value);
  if (!result.ok) {
    throw new AssetConflictInputError({
      code: 'conflict_invalid_selection',
      message: result.diagnostics[0]?.message ?? 'The selection record is invalid.',
    });
  }
  return result.selection;
}

function readReceipt(receiptPath: string): AssetPackConflictReceipt {
  const value = readJsonFile(receiptPath, MAX_RECEIPT_BYTES);
  if (!isRecord(value)) throw new AssetConflictInputError({ code: 'conflict_schema_invalid', message: 'The recovery receipt must be an object.' });
  const conflictResult = parseAssetPackConflict(value.conflict);
  const selectionResult = parseAssetPackConflictSelection(value.selection);
  if (!conflictResult.ok || !selectionResult.ok || value.schema !== ASSET_PACK_CONFLICT_RECEIPT_SCHEMA) {
    throw new AssetConflictInputError({ code: 'conflict_schema_invalid', message: 'The D6 recovery receipt is invalid.' });
  }
  if (!isRecord(value.resolution) || !isRecord(value.audit)) {
    throw new AssetConflictInputError({ code: 'conflict_schema_invalid', message: 'The D6 recovery receipt is incomplete.' });
  }
  const resolution = parseResolution(value.resolution);
  const audit = parseAudit(value.audit);
  const conflictDigest = requiredDigestValue(value.conflictDigest);
  const selectionDigest = requiredDigestValue(value.selectionDigest);
  const resolutionDigest = requiredDigestValue(value.resolutionDigest);
  const auditDigest = requiredDigestValue(value.auditDigest);
  const stagingRelativePath = value.stagingRelativePath;
  if (resolution === undefined || audit === undefined || conflictDigest === undefined || selectionDigest === undefined || resolutionDigest === undefined || auditDigest === undefined || typeof stagingRelativePath !== 'string' || path.posix.isAbsolute(stagingRelativePath) || stagingRelativePath.includes('..')) {
    throw new AssetConflictInputError({ code: 'conflict_schema_invalid', message: 'The D6 recovery receipt contains invalid evidence.' });
  }
  if (resolution.conflictId !== conflictResult.conflict.conflictId || resolution.selectionDigest !== selectionDigest || digest(assetPackConflictDigestInput(conflictResult.conflict)) !== conflictDigest || digest(assetPackConflictSelectionDigestInput(selectionResult.selection)) !== selectionDigest || digest(assetPackConflictResolutionDigestInput(resolution)) !== resolutionDigest || digest(canonicalJson(audit)) !== auditDigest) {
    throw new AssetConflictInputError({ code: 'conflict_resolution_tampered', message: 'The D6 recovery receipt digest does not match its contents.', nextAction: 'discard-resolution' });
  }
  return {
    schema: ASSET_PACK_CONFLICT_RECEIPT_SCHEMA,
    conflict: conflictResult.conflict,
    conflictDigest,
    selection: selectionResult.selection,
    selectionDigest,
    resolution,
    resolutionDigest,
    audit,
    auditDigest,
    stagingRelativePath,
  };
}

function parseResolution(value: Record<string, unknown>): AssetPackConflictResolution | undefined {
  if (value.schema !== 'lpc-toolkit.asset-pack-resolution.v1' || !isDigestString(value.conflictId) || !isDigestString(value.baselineDigest) || !isDigestString(value.selectionDigest) || (value.status !== 'resolved' && value.status !== 'declined') || !Array.isArray(value.targets) || !Array.isArray(value.evidenceDigests)) return undefined;
  const targets: AssetPackConflictResolution['targets'][number][] = [];
  for (const entry of value.targets) {
    if (!isRecord(entry) || typeof entry.targetKey !== 'string' || !isResolutionKind(entry.resolution) || !Array.isArray(entry.contenderIds) || !Array.isArray(entry.evidenceDigests) || !isDigestString(entry.resultDigest)) return undefined;
    if (!entry.contenderIds.every((item): item is string => typeof item === 'string') || !entry.evidenceDigests.every((item): item is string => typeof item === 'string')) return undefined;
    targets.push({
      targetKey: entry.targetKey,
      resolution: entry.resolution as AssetPackResolutionKind,
      contenderIds: entry.contenderIds,
      resultDigest: entry.resultDigest,
      evidenceDigests: entry.evidenceDigests,
    });
  }
  if (!value.evidenceDigests.every((item): item is string => isDigestString(item))) return undefined;
  return {
    schema: 'lpc-toolkit.asset-pack-resolution.v1',
    conflictId: value.conflictId,
    baselineDigest: value.baselineDigest,
    selectionDigest: value.selectionDigest,
    status: value.status,
    targets,
    evidenceDigests: value.evidenceDigests,
  };
}

type AssetPackResolutionKind = AssetPackConflictResolution['targets'][number]['resolution'];

function parseAudit(value: Record<string, unknown>): AssetPackConflictAudit | undefined {
  if (value.schema !== 'lpc-toolkit.asset-pack-conflict-audit.v1' || !isDigestString(value.conflictId) || !isDigestString(value.baselineDigest) || !Array.isArray(value.events)) return undefined;
  const events: AssetPackConflictAuditEvent[] = [];
  for (const entry of value.events) {
    if (!isRecord(entry) || typeof entry.sequence !== 'number' || !isAuditEventName(entry.event) || !isDigestString(entry.conflictId) || !isDigestString(entry.baselineDigest) || !Array.isArray(entry.targetKeys) || typeof entry.status !== 'string' || typeof entry.nextAction !== 'string' || !Array.isArray(entry.evidenceDigests)) return undefined;
    if (!entry.targetKeys.every((item): item is string => typeof item === 'string') || !entry.evidenceDigests.every((item): item is string => isDigestString(item))) return undefined;
    events.push({
      sequence: entry.sequence,
      event: entry.event,
      conflictId: entry.conflictId,
      baselineDigest: entry.baselineDigest,
      targetKeys: entry.targetKeys,
      status: entry.status,
      nextAction: entry.nextAction as AssetPackConflictNextAction | 'import-resolution-candidate',
      evidenceDigests: entry.evidenceDigests,
      ...(typeof entry.resolutionDigest === 'string' ? { resolutionDigest: entry.resolutionDigest } : {}),
    });
  }
  return {
    schema: 'lpc-toolkit.asset-pack-conflict-audit.v1',
    conflictId: value.conflictId,
    baselineDigest: value.baselineDigest,
    events,
  };
}

function auditForInspection(
  conflict: AssetPackConflict,
  evaluation: AssetPackConflictEvaluation,
): AssetPackConflictAudit {
  const inspected: AssetPackConflictAudit = {
    schema: 'lpc-toolkit.asset-pack-conflict-audit.v1',
    conflictId: conflict.conflictId,
    baselineDigest: conflict.workspaceBaselineDigest,
    events: [{
      sequence: 1,
      event: 'inspected',
      conflictId: conflict.conflictId,
      baselineDigest: conflict.workspaceBaselineDigest,
      targetKeys: [conflict.target.key],
      status: evaluation.status,
      nextAction: evaluation.nextAction,
      evidenceDigests: conflictEvidenceDigests(conflict),
    }],
  };
  if (evaluation.status === 'selection-required' || evaluation.status === 'equivalent') {
    return appendAuditEvent(inspected, {
      event: 'selection-required',
      status: evaluation.status,
      nextAction: evaluation.nextAction,
      evidenceDigests: conflictEvidenceDigests(conflict),
    });
  }
  if (evaluation.status === 'blocked') {
    return appendAuditEvent(inspected, {
      event: 'blocked',
      status: evaluation.status,
      nextAction: evaluation.nextAction,
      evidenceDigests: conflictEvidenceDigests(conflict),
    });
  }
  return inspected;
}

function auditForResolution(
  conflict: AssetPackConflict,
  resolution: AssetPackConflictResolution,
  resolutionDigest: string,
): AssetPackConflictAudit {
  const evaluation = evaluateAssetPackConflict(conflict);
  const inspected = auditForInspection(conflict, evaluation);
  return appendAuditEvent(inspected, {
    event: resolution.status === 'declined' ? 'declined' : 'resolved',
    status: resolution.status,
    nextAction: resolution.status === 'declined' ? 'none' : 'import-resolution-candidate',
    evidenceDigests: resolution.evidenceDigests,
    resolutionDigest,
  });
}

function appendAuditEvent(
  audit: AssetPackConflictAudit,
  input: Omit<AssetPackConflictAuditEvent, 'sequence' | 'conflictId' | 'baselineDigest' | 'targetKeys'>,
): AssetPackConflictAudit {
  return {
    ...audit,
    events: [...audit.events, {
      sequence: audit.events.length + 1,
      conflictId: audit.conflictId,
      baselineDigest: audit.baselineDigest,
      targetKeys: audit.events[0]?.targetKeys ?? [],
      ...input,
    }],
  };
}

function conflictEvidenceDigests(conflict: AssetPackConflict): readonly string[] {
  const values = [
    conflict.workspaceBaselineDigest,
    conflict.compatibility.digest,
    conflict.policy.digest,
    ...conflict.baseline.sourceReferenceDigests,
    ...conflict.baseline.creditReferenceDigests,
    ...conflict.baseline.licenseReferenceDigests,
    ...conflict.baseline.provenanceReferenceDigests,
    ...conflict.contenders.flatMap((contender) => [
      contender.pack.contentDigest,
      ...contender.pack.replacementIntentDigests,
      ...contender.sourceReferenceDigests,
      ...contender.creditReferenceDigests,
      ...contender.licenseReferenceDigests,
      ...contender.provenanceReferenceDigests,
      ...contender.d2EvidenceDigests,
      ...contender.d5EvidenceDigests,
    ]),
  ];
  return [...new Set(values)].sort(compareUtf8);
}

function needsAction(
  command: string,
  conflict: AssetPackConflict,
  code: AssetPackConflictDiagnosticCode | string,
  message: string,
  nextAction: AssetPackConflictNextAction | 'import-resolution-candidate',
): CliResponse<unknown> {
  return commandOk(command, {
    schema: ASSET_PACK_CONFLICT_RECEIPT_SCHEMA,
    conflictId: conflict.conflictId,
    status: 'needs-user-action',
    code,
    message,
    mutation: 'none',
    nextAction,
  });
}

function requireWorkspace(workspace: AssetWorkspace | undefined): AssetWorkspace {
  if (workspace === undefined) {
    throw new AssetConflictInputError({
      code: 'asset_workspace_not_found',
      message: 'An asset workspace is required for this conflict command.',
    });
  }
  return workspace;
}

function requireFlag(flags: ParsedArgs['flags'], name: string): string {
  return requireValue(flagString(flags, name), `--${name}`);
}

function requireValue(value: string | undefined, label: string): string {
  if (value === undefined || value.length === 0) {
    throw new AssetConflictInputError({ code: 'missing_argument', message: `${label} is required.` });
  }
  return value;
}

function resolveInputPath(root: string, cwd: string, input: string, label: string): string {
  const fromCwd = path.resolve(cwd, input);
  if (isContainedPath(root, fromCwd)) return fromCwd;
  const fromRoot = path.resolve(root, input);
  if (isContainedPath(root, fromRoot)) return fromRoot;
  throw new AssetConflictInputError({ code: 'conflict_protected_path', message: `${label} must remain inside the allowed root.` });
}

function readJsonFile(filePath: string, limit: number): unknown {
  let stats;
  try {
    stats = lstatSync(filePath);
  } catch {
    throw new AssetConflictInputError({ code: 'asset_conflict_input_missing', message: 'The supplied D6 input file could not be read.' });
  }
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new AssetConflictInputError({ code: 'asset_conflict_protected_path', message: 'D6 input must be a regular file.' });
  }
  const bytes = readFileSync(filePath);
  if (bytes.byteLength > limit) {
    throw new AssetConflictInputError({ code: 'conflict_schema_invalid', message: 'D6 input exceeds the bounded record size.' });
  }
  try {
    return JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new AssetConflictInputError({ code: 'conflict_schema_invalid', message: 'D6 input must contain valid JSON.' });
  }
}

function ensureContainedPath(root: string, candidate: string, label: string): void {
  if (!isContainedPath(root, candidate)) {
    throw new AssetConflictInputError({ code: 'conflict_protected_path', message: `${label} must remain inside the allowed root.` });
  }
}

function isContainedPath(root: string, candidate: string): boolean {
  const absoluteRoot = path.resolve(root);
  const absoluteCandidate = path.resolve(candidate);
  const relative = path.relative(absoluteRoot, absoluteCandidate);
  return relative !== ''
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function ensureOwnedDirectory(root: string, directory: string): void {
  ensureContainedPath(root, directory, 'D6 staging');
  const relative = path.relative(path.resolve(root), path.resolve(directory));
  let current = path.resolve(root);
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component);
    if (existsSync(current)) {
      const stats = lstatSync(current);
      if (stats.isSymbolicLink() || !stats.isDirectory()) throw new AssetConflictInputError({ code: 'conflict_protected_path', message: 'D6 staging contains an unsafe path.' });
    } else {
      mkdirSync(current, { mode: 0o700 });
    }
  }
}

type ExistingFileState = 'missing' | 'same' | 'different';

function readExistingFileState(filePath: string, bytes: Buffer): ExistingFileState {
  try {
    const stats = lstatSync(filePath);
    if (stats.isSymbolicLink() || !stats.isFile()) return 'different';
    return readFileSync(filePath).equals(bytes) ? 'same' : 'different';
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return 'missing';
    return 'different';
  }
}

function writeExclusiveFile(filePath: string, bytes: Buffer): void {
  writeFileSync(filePath, bytes, { flag: 'wx', mode: 0o600 });
}

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function requiredDigestValue(value: unknown): string | undefined {
  return isDigestString(value)
    ? value
    : undefined;
}

function isDigestString(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function isResolutionKind(value: unknown): value is AssetPackResolutionKind {
  return value === 'retain-current'
    || value === 'select-contender'
    || value === 'merge-disjoint'
    || value === 'decline';
}

function isAuditEventName(value: unknown): value is AssetPackConflictAuditEventName {
  return value === 'inspected'
    || value === 'selection-required'
    || value === 'resolved'
    || value === 'declined'
    || value === 'blocked'
    || value === 'stale'
    || value === 'recovered'
    || value === 'discarded';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compareUtf8(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Readonly<Record<string, unknown>>;
  return Object.fromEntries(
    Object.keys(record)
      .sort(compareUtf8)
      .map((key) => [key, canonicalize(record[key])]),
  );
}

class AssetConflictInputError extends Error {
  readonly issue: AssetConflictIssue;

  constructor(issue: AssetConflictIssue) {
    super(issue.message);
    this.name = 'AssetConflictInputError';
    this.issue = issue;
  }
}
