import { randomUUID } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  ASSET_OUTPUT_MARKER_SCHEMA,
  assertManagedAssetOutput,
  type AssetWorkspace,
} from './asset-workspace.js';
import {
  assetPackRegistryBytes,
  type AssetPackLifecycleDiagnostic,
  type InstalledAssetPackRegistryEntry,
} from './asset-pack-registry.js';
import type { AssetPackDesiredState } from './asset-pack-state.js';

export const ASSET_PACK_TRANSACTION_SCHEMA =
  'lpc-toolkit.asset-pack-transaction.v1' as const;

export type AssetPackTransactionPhase =
  | 'prepared'
  | 'output-published'
  | 'sources-published'
  | 'registry-published';

export type AssetPackRecoveryAction = 'none' | 'rolled-back' | 'completed';

export interface AssetPackTransactionJournal {
  readonly schema: typeof ASSET_PACK_TRANSACTION_SCHEMA;
  readonly workspaceId: string;
  readonly operationId: string;
  readonly operation: 'sync' | 'install' | 'remove';
  readonly phase: AssetPackTransactionPhase;
  readonly oldOutputBackup: string;
  readonly oldRegistryBackup?: string;
  readonly stagedOutput: string;
  readonly stagedRegistry: string;
  readonly stagedInstalledSource?: string;
  readonly finalInstalledSource?: string;
  readonly cleanupInstalledSources: readonly string[];
}

export interface AssetTransactionFileOps {
  readonly mkdirSync: typeof mkdirSync;
  readonly writeFileSync: typeof writeFileSync;
  readonly readFileSync: typeof readFileSync;
  readonly renameSync: typeof renameSync;
  readonly rmSync: typeof rmSync;
  readonly openSync: typeof openSync;
  readonly fsyncSync: typeof fsyncSync;
  readonly closeSync: typeof closeSync;
}

export interface PublishAssetPackGenerationOptions {
  readonly operation: 'sync' | 'install' | 'remove';
  readonly workspace: AssetWorkspace;
  readonly desiredState: AssetPackDesiredState;
  readonly stagedInstalledSource?: string;
  readonly finalInstalledSource?: string;
  readonly cleanupInstalledSources: readonly string[];
  readonly fileOps?: AssetTransactionFileOps;
}

export type AssetPackPublicationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly diagnostics: readonly AssetPackLifecycleDiagnostic[] };

export type AssetPackRecoveryResult =
  | { readonly ok: true; readonly action: AssetPackRecoveryAction }
  | { readonly ok: false; readonly diagnostics: readonly AssetPackLifecycleDiagnostic[] };

interface ResolvedJournal {
  readonly journal: AssetPackTransactionJournal;
  readonly transactionPath: string;
  readonly journalTemporaryPath: string;
  readonly transactionRoot: string;
  readonly oldOutputBackup: string;
  readonly oldRegistryBackup?: string;
  readonly stagedOutput: string;
  readonly stagedRegistry: string;
  readonly stagedInstalledSource?: string;
  readonly finalInstalledSource?: string;
  readonly cleanupInstalledSources: readonly string[];
}

const OUTPUT_MARKER_FILE = '.lpc-toolkit-managed.json';
const JOURNAL_FILE = 'transaction.json';
const JOURNAL_REQUIRED_KEYS = [
  'schema',
  'workspaceId',
  'operationId',
  'operation',
  'phase',
  'oldOutputBackup',
  'stagedOutput',
  'stagedRegistry',
  'cleanupInstalledSources',
] as const;
const JOURNAL_OPTIONAL_KEYS = [
  'oldRegistryBackup',
  'stagedInstalledSource',
  'finalInstalledSource',
] as const;
const PHASES: readonly AssetPackTransactionPhase[] = [
  'prepared',
  'output-published',
  'sources-published',
  'registry-published',
];
const OPERATIONS: readonly AssetPackTransactionJournal['operation'][] = [
  'sync',
  'install',
  'remove',
];
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_DIRECTORY = /^[0-9a-f]{64}$/;
const TOLERATED_DIRECTORY_FSYNC_ERRORS = new Set(['EINVAL', 'ENOTSUP', 'EPERM']);

const DEFAULT_FILE_OPS: AssetTransactionFileOps = {
  mkdirSync,
  writeFileSync,
  readFileSync,
  renameSync,
  rmSync,
  openSync,
  fsyncSync,
  closeSync,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function pathEntryExists(target: string): boolean {
  try {
    lstatSync(target);
    return true;
  } catch (error) {
    if (isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return false;
    }
    throw error;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function diagnostic(
  code: 'asset_transaction_unsafe' | 'asset_publish_failed',
  message: string,
  target: string,
  details?: Readonly<Record<string, unknown>>,
): AssetPackLifecycleDiagnostic {
  return {
    code,
    severity: 'error',
    message,
    path: target,
    ...(details ? { details } : {}),
  };
}

function publicationFailure(
  error: unknown,
  workspace: AssetWorkspace,
): AssetPackPublicationResult {
  return {
    ok: false,
    diagnostics: [diagnostic(
      'asset_publish_failed',
      errorMessage(error),
      workspace.outputRoot,
    )],
  };
}

function recoveryFailure(
  code: 'asset_transaction_unsafe' | 'asset_publish_failed',
  error: unknown,
  workspace: AssetWorkspace,
): AssetPackRecoveryResult {
  return {
    ok: false,
    diagnostics: [diagnostic(
      code,
      errorMessage(error),
      path.join(workspace.stateRoot, JOURNAL_FILE),
    )],
  };
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

function assertNoExistingSymlink(root: string, target: string, label: string): void {
  const absoluteRoot = path.resolve(root);
  const absoluteTarget = path.resolve(target);
  if (!isInside(absoluteRoot, absoluteTarget)) {
    throw new Error(`${label} escapes its manager-owned root.`);
  }
  const relative = path.relative(absoluteRoot, absoluteTarget);
  let current = absoluteRoot;
  const candidates = [absoluteRoot];
  if (relative !== '') {
    for (const segment of relative.split(path.sep)) {
      current = path.join(current, segment);
      candidates.push(current);
    }
  }
  for (const candidate of candidates) {
    if (!pathEntryExists(candidate)) continue;
    if (lstatSync(candidate).isSymbolicLink()) {
      throw new Error(`${label} traverses a symlink: ${candidate}`);
    }
  }
}

function assertRegularFileIfPresent(target: string, label: string): void {
  if (!pathEntryExists(target)) return;
  const stats = lstatSync(target);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`${label} must be a regular file: ${target}`);
  }
}

function assertDirectoryIfPresent(target: string, label: string): void {
  if (!pathEntryExists(target)) return;
  const stats = lstatSync(target);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${label} must be a directory: ${target}`);
  }
}

function canonicalRelativePath(workspace: AssetWorkspace, target: string): string {
  const absolute = path.resolve(target);
  if (!isInside(workspace.root, absolute)) {
    throw new Error(`Manager-owned transaction path escapes the workspace: ${target}`);
  }
  const relative = path.relative(workspace.root, absolute).split(path.sep).join('/');
  if (relative === '' || relative.startsWith('../')) {
    throw new Error(`Manager-owned transaction path is not a child path: ${target}`);
  }
  return relative;
}

function resolveRelativePath(workspace: AssetWorkspace, value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty relative path.`);
  }
  if (
    value.includes('\\')
    || path.posix.isAbsolute(value)
    || path.win32.isAbsolute(value)
    || path.posix.normalize(value) !== value
    || value === '.'
    || value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error(`${label} must be a canonical relative path.`);
  }
  const resolved = path.resolve(workspace.root, ...value.split('/'));
  if (!isInside(workspace.root, resolved)) {
    throw new Error(`${label} escapes the workspace.`);
  }
  return resolved;
}

function assertExactPath(actual: string, expected: string, label: string): void {
  if (path.resolve(actual) !== path.resolve(expected)) {
    throw new Error(`${label} is not the expected manager-owned path.`);
  }
}

function assertContainedChild(root: string, target: string, label: string): void {
  if (path.resolve(root) === path.resolve(target) || !isInside(root, target)) {
    throw new Error(`${label} is outside its manager-owned root.`);
  }
  assertNoExistingSymlink(root, target, label);
}

function assertInstalledGenerationPath(
  installedRoot: string,
  target: string,
  label: string,
): void {
  assertContainedChild(installedRoot, target, label);
  const segments = path.relative(installedRoot, target).split(path.sep);
  if (
    segments.length !== 3
    || segments.some((segment) => segment.length === 0)
    || !SHA256_DIRECTORY.test(segments[2] ?? '')
  ) {
    throw new Error(
      `${label} must use installed/<pack-id>/<version>/<archive-sha256>.`,
    );
  }
}

function exactKeys(record: Record<string, unknown>): void {
  const allowed = new Set<string>([
    ...JOURNAL_REQUIRED_KEYS,
    ...JOURNAL_OPTIONAL_KEYS,
  ]);
  const keys = Object.keys(record);
  const unknown = keys.filter((key) => !allowed.has(key));
  const missing = JOURNAL_REQUIRED_KEYS.filter((key) => !keys.includes(key));
  if (unknown.length > 0 || missing.length > 0) {
    throw new Error(
      `Asset transaction journal keys are invalid${
        unknown.length > 0 ? `; unknown: ${unknown.join(', ')}` : ''
      }${missing.length > 0 ? `; missing: ${missing.join(', ')}` : ''}.`,
    );
  }
}

function stringValue(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Asset transaction journal ${key} must be a non-empty string.`);
  }
  return value;
}

function optionalStringValue(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  if (!(key in record)) return undefined;
  return stringValue(record, key);
}

function stringArrayValue(record: Record<string, unknown>, key: string): readonly string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`Asset transaction journal ${key} must be a string array.`);
  }
  if (new Set(value).size !== value.length) {
    throw new Error(`Asset transaction journal ${key} contains duplicate paths.`);
  }
  return value;
}

function parseJournalRecord(value: unknown): AssetPackTransactionJournal {
  if (!isRecord(value)) throw new Error('Asset transaction journal must be a JSON object.');
  exactKeys(value);
  const schema = stringValue(value, 'schema');
  if (schema !== ASSET_PACK_TRANSACTION_SCHEMA) {
    throw new Error(`Unknown asset transaction journal schema: ${schema}.`);
  }
  const operationId = stringValue(value, 'operationId');
  if (!UUID_V4.test(operationId)) {
    throw new Error('Asset transaction journal operationId must be a UUID v4.');
  }
  const operation = stringValue(value, 'operation');
  if (!OPERATIONS.includes(operation as AssetPackTransactionJournal['operation'])) {
    throw new Error(`Unknown asset transaction operation: ${operation}.`);
  }
  const phase = stringValue(value, 'phase');
  if (!PHASES.includes(phase as AssetPackTransactionPhase)) {
    throw new Error(`Unknown asset transaction phase: ${phase}.`);
  }
  const oldRegistryBackup = optionalStringValue(value, 'oldRegistryBackup');
  const stagedInstalledSource = optionalStringValue(value, 'stagedInstalledSource');
  const finalInstalledSource = optionalStringValue(value, 'finalInstalledSource');
  if ((stagedInstalledSource === undefined) !== (finalInstalledSource === undefined)) {
    throw new Error(
      'Asset transaction stagedInstalledSource and finalInstalledSource must appear together.',
    );
  }
  if (operation === 'sync' && (
    stagedInstalledSource !== undefined
    || finalInstalledSource !== undefined
    || stringArrayValue(value, 'cleanupInstalledSources').length > 0
  )) {
    throw new Error('Sync transactions cannot publish or clean installed sources.');
  }
  if (operation === 'remove' && stagedInstalledSource !== undefined) {
    throw new Error('Remove transactions cannot publish an installed source.');
  }
  if (operation === 'install' && stagedInstalledSource === undefined) {
    throw new Error('Install transactions must publish an installed source.');
  }
  return {
    schema: ASSET_PACK_TRANSACTION_SCHEMA,
    workspaceId: stringValue(value, 'workspaceId'),
    operationId,
    operation: operation as AssetPackTransactionJournal['operation'],
    phase: phase as AssetPackTransactionPhase,
    oldOutputBackup: stringValue(value, 'oldOutputBackup'),
    ...(oldRegistryBackup ? { oldRegistryBackup } : {}),
    stagedOutput: stringValue(value, 'stagedOutput'),
    stagedRegistry: stringValue(value, 'stagedRegistry'),
    ...(stagedInstalledSource ? { stagedInstalledSource } : {}),
    ...(finalInstalledSource ? { finalInstalledSource } : {}),
    cleanupInstalledSources: stringArrayValue(value, 'cleanupInstalledSources'),
  };
}

function readOutputWorkspaceId(
  outputRoot: string,
  fileOps: AssetTransactionFileOps,
): string | undefined {
  const markerPath = path.join(outputRoot, OUTPUT_MARKER_FILE);
  if (!pathEntryExists(markerPath)) return undefined;
  assertNoExistingSymlink(outputRoot, markerPath, 'Asset output marker');
  assertRegularFileIfPresent(markerPath, 'Asset output marker');
  const parsed = JSON.parse(fileOps.readFileSync(markerPath).toString('utf8')) as unknown;
  if (!isRecord(parsed)) throw new Error('Asset output marker must be a JSON object.');
  const keys = Object.keys(parsed).sort();
  if (keys.length !== 2 || keys[0] !== 'schema' || keys[1] !== 'workspaceId') {
    throw new Error('Asset output marker must contain exactly schema and workspaceId.');
  }
  if (parsed.schema !== ASSET_OUTPUT_MARKER_SCHEMA) {
    throw new Error(`Unknown asset output marker schema: ${String(parsed.schema)}.`);
  }
  if (typeof parsed.workspaceId !== 'string' || parsed.workspaceId.length === 0) {
    throw new Error('Asset output marker must include a string workspaceId.');
  }
  return parsed.workspaceId;
}

function resolveJournal(
  workspace: AssetWorkspace,
  journal: AssetPackTransactionJournal,
  fileOps: AssetTransactionFileOps,
): ResolvedJournal {
  const transactionPath = path.join(workspace.stateRoot, JOURNAL_FILE);
  const transactionRoot = path.join(
    workspace.stateRoot,
    'transactions',
    journal.operationId,
  );
  const operationStagingRoot = path.join(
    workspace.stateRoot,
    'staging',
    journal.operationId,
  );
  const installedRoot = path.join(workspace.stateRoot, 'installed');
  const oldOutputBackup = resolveRelativePath(
    workspace,
    journal.oldOutputBackup,
    'Asset transaction oldOutputBackup',
  );
  const oldRegistryBackup = journal.oldRegistryBackup === undefined
    ? undefined
    : resolveRelativePath(
      workspace,
      journal.oldRegistryBackup,
      'Asset transaction oldRegistryBackup',
    );
  const stagedOutput = resolveRelativePath(
    workspace,
    journal.stagedOutput,
    'Asset transaction stagedOutput',
  );
  const stagedRegistry = resolveRelativePath(
    workspace,
    journal.stagedRegistry,
    'Asset transaction stagedRegistry',
  );
  const stagedInstalledSource = journal.stagedInstalledSource === undefined
    ? undefined
    : resolveRelativePath(
      workspace,
      journal.stagedInstalledSource,
      'Asset transaction stagedInstalledSource',
    );
  const finalInstalledSource = journal.finalInstalledSource === undefined
    ? undefined
    : resolveRelativePath(
      workspace,
      journal.finalInstalledSource,
      'Asset transaction finalInstalledSource',
    );
  const cleanupInstalledSources = journal.cleanupInstalledSources.map((entry) =>
    resolveRelativePath(workspace, entry, 'Asset transaction cleanupInstalledSources entry'));

  assertExactPath(
    oldOutputBackup,
    path.join(transactionRoot, 'old-output'),
    'Asset transaction oldOutputBackup',
  );
  if (oldRegistryBackup) {
    assertExactPath(
      oldRegistryBackup,
      path.join(transactionRoot, 'old-registry.json'),
      'Asset transaction oldRegistryBackup',
    );
  }
  assertExactPath(
    stagedOutput,
    path.join(operationStagingRoot, 'output'),
    'Asset transaction stagedOutput',
  );
  assertExactPath(
    stagedRegistry,
    path.join(operationStagingRoot, 'registry.json'),
    'Asset transaction stagedRegistry',
  );
  assertContainedChild(path.join(workspace.stateRoot, 'transactions'), transactionRoot, 'Asset transaction data');
  assertContainedChild(path.join(workspace.stateRoot, 'staging'), stagedOutput, 'Asset transaction stagedOutput');
  assertContainedChild(path.join(workspace.stateRoot, 'staging'), stagedRegistry, 'Asset transaction stagedRegistry');
  if (stagedInstalledSource) {
    assertContainedChild(
      path.join(workspace.stateRoot, 'staging'),
      stagedInstalledSource,
      'Asset transaction stagedInstalledSource',
    );
  }
  if (finalInstalledSource) {
    assertInstalledGenerationPath(
      installedRoot,
      finalInstalledSource,
      'Asset transaction finalInstalledSource',
    );
  }
  for (const cleanupSource of cleanupInstalledSources) {
    assertInstalledGenerationPath(
      installedRoot,
      cleanupSource,
      'Asset transaction cleanupInstalledSources entry',
    );
  }
  if (
    finalInstalledSource
    && cleanupInstalledSources.some((entry) => path.resolve(entry) === path.resolve(finalInstalledSource))
  ) {
    throw new Error('Asset transaction cannot clean its final installed source.');
  }

  assertNoExistingSymlink(workspace.stateRoot, transactionPath, 'Asset transaction journal');
  assertRegularFileIfPresent(transactionPath, 'Asset transaction journal');
  assertDirectoryIfPresent(oldOutputBackup, 'Asset transaction old output backup');
  if (oldRegistryBackup) {
    assertRegularFileIfPresent(oldRegistryBackup, 'Asset transaction old registry backup');
  }
  assertDirectoryIfPresent(stagedOutput, 'Asset transaction staged output');
  assertRegularFileIfPresent(stagedRegistry, 'Asset transaction staged registry');
  if (stagedInstalledSource) {
    assertDirectoryIfPresent(stagedInstalledSource, 'Asset transaction staged installed source');
  }
  if (finalInstalledSource) {
    assertDirectoryIfPresent(finalInstalledSource, 'Asset transaction final installed source');
  }
  cleanupInstalledSources.forEach((entry) =>
    assertDirectoryIfPresent(entry, 'Asset transaction cleanup installed source'));

  const markerIds = [workspace.outputRoot, oldOutputBackup, stagedOutput]
    .map((root) => readOutputWorkspaceId(root, fileOps))
    .filter((entry): entry is string => entry !== undefined);
  if (markerIds.length === 0 || markerIds.some((entry) => entry !== journal.workspaceId)) {
    throw new Error('Asset transaction workspaceId does not match its managed output markers.');
  }

  return {
    journal,
    transactionPath,
    journalTemporaryPath: `${transactionPath}.${journal.operationId}.tmp`,
    transactionRoot,
    oldOutputBackup,
    ...(oldRegistryBackup ? { oldRegistryBackup } : {}),
    stagedOutput,
    stagedRegistry,
    ...(stagedInstalledSource ? { stagedInstalledSource } : {}),
    ...(finalInstalledSource ? { finalInstalledSource } : {}),
    cleanupInstalledSources,
  };
}

function validateRecoveryState(
  resolved: ResolvedJournal,
  workspace: AssetWorkspace,
): void {
  const hasActiveOutput = pathEntryExists(workspace.outputRoot);
  const hasOutputBackup = pathEntryExists(resolved.oldOutputBackup);
  const hasStagedOutput = pathEntryExists(resolved.stagedOutput);
  const hasActiveRegistry = pathEntryExists(workspace.registryPath);
  const hasRegistryBackup = resolved.oldRegistryBackup !== undefined
    && pathEntryExists(resolved.oldRegistryBackup);
  const hasStagedRegistry = pathEntryExists(resolved.stagedRegistry);
  const hasStagedSource = resolved.stagedInstalledSource !== undefined
    && pathEntryExists(resolved.stagedInstalledSource);
  const hasFinalSource = resolved.finalInstalledSource !== undefined
    && pathEntryExists(resolved.finalInstalledSource);

  if (resolved.journal.phase === 'registry-published') {
    if (!hasActiveOutput || hasStagedOutput || !hasActiveRegistry || hasStagedRegistry) {
      throw new Error('Registry-published transaction state is incomplete or ambiguous.');
    }
    if (resolved.finalInstalledSource && (!hasFinalSource || hasStagedSource)) {
      throw new Error('Registry-published installed source state is incomplete or ambiguous.');
    }
    return;
  }

  if (!hasActiveOutput && !hasOutputBackup && !hasStagedOutput) {
    throw new Error('Rollback transaction has no recoverable output generation.');
  }
  if (resolved.oldRegistryBackup && !hasActiveRegistry && !hasRegistryBackup) {
    throw new Error('Rollback transaction cannot recover the old registry.');
  }
  if (resolved.journal.phase === 'prepared' && hasFinalSource) {
    throw new Error('Prepared transaction unexpectedly names a published installed source.');
  }
  if (hasStagedSource && hasFinalSource) {
    throw new Error('Transaction has both staged and final installed sources present.');
  }
}

function closeAfter<T>(
  descriptor: number,
  fileOps: AssetTransactionFileOps,
  action: () => T,
): T {
  let actionError: unknown;
  try {
    return action();
  } catch (error) {
    actionError = error;
    throw error;
  } finally {
    try {
      fileOps.closeSync(descriptor);
    } catch (closeError) {
      if (actionError === undefined) throw closeError;
    }
  }
}

function fsyncFile(target: string, fileOps: AssetTransactionFileOps): void {
  const descriptor = fileOps.openSync(target, 'r');
  closeAfter(descriptor, fileOps, () => fileOps.fsyncSync(descriptor));
}

function fsyncDirectory(target: string, fileOps: AssetTransactionFileOps): void {
  let descriptor: number;
  try {
    descriptor = fileOps.openSync(target, 'r');
  } catch (error) {
    if (
      isNodeError(error)
      && error.code !== undefined
      && TOLERATED_DIRECTORY_FSYNC_ERRORS.has(error.code)
    ) {
      return;
    }
    throw error;
  }
  closeAfter(descriptor, fileOps, () => {
    try {
      fileOps.fsyncSync(descriptor);
    } catch (error) {
      if (
        isNodeError(error)
        && error.code !== undefined
        && TOLERATED_DIRECTORY_FSYNC_ERRORS.has(error.code)
      ) {
        return;
      }
      throw error;
    }
  });
}

function durableWrite(
  target: string,
  bytes: Buffer,
  fileOps: AssetTransactionFileOps,
): void {
  assertNoExistingSymlink(path.dirname(target), target, 'Durable transaction file');
  assertRegularFileIfPresent(target, 'Durable transaction file');
  fileOps.mkdirSync(path.dirname(target), { recursive: true });
  fileOps.writeFileSync(target, bytes);
  fsyncFile(target, fileOps);
  fsyncDirectory(path.dirname(target), fileOps);
}

function durableRename(
  source: string,
  destination: string,
  fileOps: AssetTransactionFileOps,
): void {
  fileOps.renameSync(source, destination);
  fsyncDirectory(path.dirname(source), fileOps);
  if (path.resolve(path.dirname(destination)) !== path.resolve(path.dirname(source))) {
    fsyncDirectory(path.dirname(destination), fileOps);
  }
}

function journalBytes(journal: AssetPackTransactionJournal): Buffer {
  return Buffer.from(`${JSON.stringify(journal, null, 2)}\n`);
}

function writeJournalDurably(
  workspace: AssetWorkspace,
  journal: AssetPackTransactionJournal,
  fileOps: AssetTransactionFileOps,
): void {
  const transactionPath = path.join(workspace.stateRoot, JOURNAL_FILE);
  const temporaryPath = `${transactionPath}.${journal.operationId}.tmp`;
  assertNoExistingSymlink(workspace.stateRoot, temporaryPath, 'Asset transaction journal temp');
  durableWrite(temporaryPath, journalBytes(journal), fileOps);
  durableRename(temporaryPath, transactionPath, fileOps);
}

function removeListedPath(
  root: string,
  target: string,
  recursive: boolean,
  fileOps: AssetTransactionFileOps,
): void {
  if (!pathEntryExists(target)) return;
  assertNoExistingSymlink(root, target, 'Asset transaction cleanup path');
  fileOps.rmSync(target, { recursive, force: true });
  fsyncDirectory(path.dirname(target), fileOps);
}

function restoreListedPath(
  backupRoot: string,
  backup: string,
  activeRoot: string,
  active: string,
  recursiveActive: boolean,
  fileOps: AssetTransactionFileOps,
): void {
  if (!pathEntryExists(backup)) return;
  assertNoExistingSymlink(backupRoot, backup, 'Asset transaction backup');
  if (pathEntryExists(active)) {
    assertNoExistingSymlink(activeRoot, active, 'Asset transaction active path');
    fileOps.rmSync(active, { recursive: recursiveActive, force: true });
    fsyncDirectory(path.dirname(active), fileOps);
  }
  durableRename(backup, active, fileOps);
}

function finishJournal(
  resolved: ResolvedJournal,
  workspace: AssetWorkspace,
  fileOps: AssetTransactionFileOps,
): void {
  removeListedPath(
    path.join(workspace.stateRoot, 'transactions'),
    resolved.oldOutputBackup,
    true,
    fileOps,
  );
  if (resolved.oldRegistryBackup) {
    removeListedPath(
      path.join(workspace.stateRoot, 'transactions'),
      resolved.oldRegistryBackup,
      false,
      fileOps,
    );
  }
  removeListedPath(
    path.join(workspace.stateRoot, 'staging'),
    resolved.stagedOutput,
    true,
    fileOps,
  );
  removeListedPath(
    path.join(workspace.stateRoot, 'staging'),
    resolved.stagedRegistry,
    false,
    fileOps,
  );
  if (resolved.stagedInstalledSource) {
    removeListedPath(
      path.join(workspace.stateRoot, 'staging'),
      resolved.stagedInstalledSource,
      true,
      fileOps,
    );
  }
  for (const cleanupSource of resolved.cleanupInstalledSources) {
    removeListedPath(
      path.join(workspace.stateRoot, 'installed'),
      cleanupSource,
      true,
      fileOps,
    );
  }
  removeListedPath(
    workspace.stateRoot,
    resolved.journalTemporaryPath,
    false,
    fileOps,
  );
  removeListedPath(
    workspace.stateRoot,
    resolved.transactionPath,
    false,
    fileOps,
  );
}

function rollBackJournal(
  resolved: ResolvedJournal,
  workspace: AssetWorkspace,
  fileOps: AssetTransactionFileOps,
): void {
  if (resolved.oldRegistryBackup) {
    restoreListedPath(
      path.join(workspace.stateRoot, 'transactions'),
      resolved.oldRegistryBackup,
      workspace.stateRoot,
      workspace.registryPath,
      false,
      fileOps,
    );
  } else if (!pathEntryExists(resolved.stagedRegistry) && pathEntryExists(workspace.registryPath)) {
    removeListedPath(workspace.stateRoot, workspace.registryPath, false, fileOps);
  }
  restoreListedPath(
    path.join(workspace.stateRoot, 'transactions'),
    resolved.oldOutputBackup,
    workspace.root,
    workspace.outputRoot,
    true,
    fileOps,
  );
  if (resolved.finalInstalledSource && pathEntryExists(resolved.finalInstalledSource)) {
    if (resolved.stagedInstalledSource && pathEntryExists(resolved.stagedInstalledSource)) {
      throw new Error(
        'Asset transaction names both staged and final installed sources as present.',
      );
    }
    removeListedPath(
      path.join(workspace.stateRoot, 'installed'),
      resolved.finalInstalledSource,
      true,
      fileOps,
    );
  }
  removeListedPath(
    path.join(workspace.stateRoot, 'staging'),
    resolved.stagedOutput,
    true,
    fileOps,
  );
  removeListedPath(
    path.join(workspace.stateRoot, 'staging'),
    resolved.stagedRegistry,
    false,
    fileOps,
  );
  if (resolved.stagedInstalledSource) {
    removeListedPath(
      path.join(workspace.stateRoot, 'staging'),
      resolved.stagedInstalledSource,
      true,
      fileOps,
    );
  }
  removeListedPath(
    workspace.stateRoot,
    resolved.journalTemporaryPath,
    false,
    fileOps,
  );
  removeListedPath(workspace.stateRoot, resolved.transactionPath, false, fileOps);
}

export function recoverAssetPackTransaction(options: {
  readonly workspace: AssetWorkspace;
  readonly fileOps?: AssetTransactionFileOps;
}): AssetPackRecoveryResult {
  const fileOps = options.fileOps ?? DEFAULT_FILE_OPS;
  const transactionPath = path.join(options.workspace.stateRoot, JOURNAL_FILE);
  if (!pathEntryExists(transactionPath)) return { ok: true, action: 'none' };

  let resolved: ResolvedJournal;
  try {
    assertNoExistingSymlink(options.workspace.stateRoot, transactionPath, 'Asset transaction journal');
    assertRegularFileIfPresent(transactionPath, 'Asset transaction journal');
    const parsed = JSON.parse(fileOps.readFileSync(transactionPath).toString('utf8')) as unknown;
    const journal = parseJournalRecord(parsed);
    resolved = resolveJournal(options.workspace, journal, fileOps);
    validateRecoveryState(resolved, options.workspace);
  } catch (error) {
    return recoveryFailure('asset_transaction_unsafe', error, options.workspace);
  }

  try {
    if (resolved.journal.phase === 'registry-published') {
      finishJournal(resolved, options.workspace, fileOps);
      return { ok: true, action: 'completed' };
    }
    rollBackJournal(resolved, options.workspace, fileOps);
    return { ok: true, action: 'rolled-back' };
  } catch (error) {
    return recoveryFailure('asset_publish_failed', error, options.workspace);
  }
}

function safeOutputDestination(stagedOutput: string, logicalPath: string): string {
  if (
    logicalPath.length === 0
    || logicalPath.includes('\\')
    || path.posix.isAbsolute(logicalPath)
    || path.win32.isAbsolute(logicalPath)
    || path.posix.normalize(logicalPath) !== logicalPath
    || logicalPath.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error(`Desired asset output path is unsafe: ${logicalPath}`);
  }
  const destination = path.resolve(stagedOutput, ...logicalPath.split('/'));
  if (!isInside(stagedOutput, destination) || path.resolve(destination) === path.resolve(stagedOutput)) {
    throw new Error(`Desired asset output path escapes staging: ${logicalPath}`);
  }
  return destination;
}

function validatePublicationSources(options: PublishAssetPackGenerationOptions): void {
  const installedRoot = path.join(options.workspace.stateRoot, 'installed');
  const stagingRoot = path.join(options.workspace.stateRoot, 'staging');
  if ((options.stagedInstalledSource === undefined) !== (options.finalInstalledSource === undefined)) {
    throw new Error('stagedInstalledSource and finalInstalledSource must appear together.');
  }
  if (options.operation === 'sync' && (
    options.stagedInstalledSource !== undefined
    || options.cleanupInstalledSources.length > 0
  )) {
    throw new Error('Sync publication cannot publish or clean installed sources.');
  }
  if (options.operation === 'remove' && options.stagedInstalledSource !== undefined) {
    throw new Error('Remove publication cannot publish an installed source.');
  }
  if (options.operation === 'install' && options.stagedInstalledSource === undefined) {
    throw new Error('Install publication requires a staged installed source.');
  }
  if (options.stagedInstalledSource) {
    assertContainedChild(stagingRoot, options.stagedInstalledSource, 'Staged installed source');
    if (
      !pathEntryExists(options.stagedInstalledSource)
      || !lstatSync(options.stagedInstalledSource).isDirectory()
    ) {
      throw new Error(`Staged installed source is not a directory: ${options.stagedInstalledSource}`);
    }
  }
  if (options.finalInstalledSource) {
    assertInstalledGenerationPath(installedRoot, options.finalInstalledSource, 'Final installed source');
    if (pathEntryExists(options.finalInstalledSource)) {
      throw new Error(`Final installed source already exists: ${options.finalInstalledSource}`);
    }
    const matchingEntries = options.desiredState.registry.entries.filter(
      (entry): entry is InstalledAssetPackRegistryEntry =>
      entry.kind === 'installed'
      && path.resolve(entry.installedDirectory) === path.resolve(options.finalInstalledSource!),
    );
    const digestDirectory = path.basename(options.finalInstalledSource);
    if (
      matchingEntries.length !== 1
      || matchingEntries[0]!.archiveDigest !== `sha256:${digestDirectory}`
    ) {
      throw new Error(
        'Final installed source path and archive digest must match one desired registry entry.',
      );
    }
  }
  for (const cleanupSource of options.cleanupInstalledSources) {
    assertInstalledGenerationPath(installedRoot, cleanupSource, 'Installed cleanup source');
    if (
      options.finalInstalledSource
      && path.resolve(cleanupSource) === path.resolve(options.finalInstalledSource)
    ) {
      throw new Error('Final installed source cannot also be a cleanup source.');
    }
  }
}

function materializeDesiredState(options: {
  readonly desiredState: AssetPackDesiredState;
  readonly stagedOutput: string;
  readonly stagedRegistry: string;
  readonly fileOps: AssetTransactionFileOps;
}): void {
  options.fileOps.mkdirSync(options.stagedOutput, { recursive: true });
  fsyncDirectory(path.dirname(options.stagedOutput), options.fileOps);
  for (const [logicalPath, bytes] of options.desiredState.outputFiles) {
    const destination = safeOutputDestination(options.stagedOutput, logicalPath);
    durableWrite(destination, Buffer.from(bytes), options.fileOps);
  }
  durableWrite(
    options.stagedRegistry,
    assetPackRegistryBytes(options.desiredState.registry),
    options.fileOps,
  );
}

function updatePhase(
  journal: AssetPackTransactionJournal,
  phase: AssetPackTransactionPhase,
  workspace: AssetWorkspace,
  fileOps: AssetTransactionFileOps,
): AssetPackTransactionJournal {
  const updated: AssetPackTransactionJournal = { ...journal, phase };
  writeJournalDurably(workspace, updated, fileOps);
  return updated;
}

export async function publishAssetPackGeneration(
  options: PublishAssetPackGenerationOptions,
): Promise<AssetPackPublicationResult> {
  const fileOps = options.fileOps ?? DEFAULT_FILE_OPS;
  const pending = recoverAssetPackTransaction({ workspace: options.workspace, fileOps });
  if (!pending.ok) return pending;

  const operationId = randomUUID();
  const stagingRoot = path.join(options.workspace.stateRoot, 'staging', operationId);
  const stagedOutput = path.join(stagingRoot, 'output');
  const stagedRegistry = path.join(stagingRoot, 'registry.json');
  const transactionRoot = path.join(
    options.workspace.stateRoot,
    'transactions',
    operationId,
  );
  const oldOutputBackup = path.join(transactionRoot, 'old-output');
  const oldRegistryBackup = path.join(transactionRoot, 'old-registry.json');
  let journalWritten = false;

  try {
    if (pathEntryExists(stagingRoot) || pathEntryExists(transactionRoot)) {
      throw new Error(`Asset transaction operation path already exists: ${operationId}`);
    }
    assertManagedAssetOutput(options.workspace);
    assertNoExistingSymlink(options.workspace.root, options.workspace.outputRoot, 'Managed asset output');
    assertNoExistingSymlink(options.workspace.root, options.workspace.stateRoot, 'Asset transaction state');
    assertNoExistingSymlink(options.workspace.stateRoot, options.workspace.registryPath, 'Asset-pack registry');
    assertRegularFileIfPresent(options.workspace.registryPath, 'Asset-pack registry');
    validatePublicationSources(options);

    const workspaceId = readOutputWorkspaceId(options.workspace.outputRoot, fileOps);
    if (!workspaceId) throw new Error('Managed asset output marker is missing.');
    if (options.desiredState.registry.workspaceId !== workspaceId) {
      throw new Error('Desired asset-pack registry workspaceId does not match the workspace.');
    }

    fileOps.mkdirSync(stagingRoot, { recursive: true });
    fileOps.mkdirSync(transactionRoot, { recursive: true });
    fsyncDirectory(path.join(options.workspace.stateRoot, 'staging'), fileOps);
    fsyncDirectory(path.join(options.workspace.stateRoot, 'transactions'), fileOps);
    materializeDesiredState({
      desiredState: options.desiredState,
      stagedOutput,
      stagedRegistry,
      fileOps,
    });
    if (readOutputWorkspaceId(stagedOutput, fileOps) !== workspaceId) {
      throw new Error('Desired asset output marker does not match the workspace.');
    }

    let journal: AssetPackTransactionJournal = {
      schema: ASSET_PACK_TRANSACTION_SCHEMA,
      workspaceId,
      operationId,
      operation: options.operation,
      phase: 'prepared',
      oldOutputBackup: canonicalRelativePath(options.workspace, oldOutputBackup),
      ...(pathEntryExists(options.workspace.registryPath)
        ? { oldRegistryBackup: canonicalRelativePath(options.workspace, oldRegistryBackup) }
        : {}),
      stagedOutput: canonicalRelativePath(options.workspace, stagedOutput),
      stagedRegistry: canonicalRelativePath(options.workspace, stagedRegistry),
      ...(options.stagedInstalledSource
        ? { stagedInstalledSource: canonicalRelativePath(
          options.workspace,
          options.stagedInstalledSource,
        ) }
        : {}),
      ...(options.finalInstalledSource
        ? { finalInstalledSource: canonicalRelativePath(
          options.workspace,
          options.finalInstalledSource,
        ) }
        : {}),
      cleanupInstalledSources: options.cleanupInstalledSources.map((entry) =>
        canonicalRelativePath(options.workspace, entry)),
    };
    resolveJournal(options.workspace, journal, fileOps);
    writeJournalDurably(options.workspace, journal, fileOps);
    journalWritten = true;

    durableRename(options.workspace.outputRoot, oldOutputBackup, fileOps);
    durableRename(stagedOutput, options.workspace.outputRoot, fileOps);
    journal = updatePhase(journal, 'output-published', options.workspace, fileOps);

    if (options.stagedInstalledSource && options.finalInstalledSource) {
      fileOps.mkdirSync(path.dirname(options.finalInstalledSource), { recursive: true });
      fsyncDirectory(path.dirname(path.dirname(options.finalInstalledSource)), fileOps);
      durableRename(options.stagedInstalledSource, options.finalInstalledSource, fileOps);
    }
    journal = updatePhase(journal, 'sources-published', options.workspace, fileOps);

    if (journal.oldRegistryBackup) {
      durableRename(options.workspace.registryPath, oldRegistryBackup, fileOps);
    }
    durableRename(stagedRegistry, options.workspace.registryPath, fileOps);
    journal = updatePhase(journal, 'registry-published', options.workspace, fileOps);

    const resolved = resolveJournal(options.workspace, journal, fileOps);
    finishJournal(resolved, options.workspace, fileOps);
    return { ok: true };
  } catch (error) {
    if (!journalWritten) {
      try {
        removeListedPath(
          path.join(options.workspace.stateRoot, 'staging'),
          stagingRoot,
          true,
          fileOps,
        );
        removeListedPath(
          options.workspace.stateRoot,
          `${path.join(options.workspace.stateRoot, JOURNAL_FILE)}.${operationId}.tmp`,
          false,
          fileOps,
        );
      } catch {
        // The publication diagnostic remains the primary failure. No active state moved.
      }
    }
    return publicationFailure(error, options.workspace);
  }
}
