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
  ASSET_WORKSPACE_REGISTRY_SCHEMA,
  auditPublishedManagedOutput,
  assetPackRegistryBytes,
  readAssetPackRegistry,
  type AssetPackLifecycleDiagnostic,
  type AssetPackRegistryDocument,
  type AssetPackRegistryV1Read,
  type InstalledAssetPackRegistryEntry,
} from './asset-pack-registry.js';
import type { AssetPackDesiredState } from './asset-pack-state.js';

export const ASSET_PACK_TRANSACTION_SCHEMA =
  'lpc-toolkit.asset-pack-transaction.v1' as const;

export type AssetPackTransactionPhase =
  | 'prepared'
  | 'output-published'
  | 'sources-published'
  | 'registry-commit-intent'
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
  readonly lstatSync?: typeof lstatSync;
  readonly beforeMutationSync?: (
    operation: 'mkdir' | 'write' | 'rename' | 'remove',
    paths: readonly string[],
  ) => void;
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

interface DirectoryIdentity {
  readonly device: string;
  readonly inode: string;
}

interface MutationGuard {
  readonly workspaceRoot: string;
  readonly roots: Map<string, DirectoryIdentity>;
  readonly fileOps: AssetTransactionFileOps;
}

interface AuthenticatedGeneration {
  readonly registry: AssetPackRegistryDocument | AssetPackRegistryV1Read;
}

const OUTPUT_MARKER_FILE = '.lpc-toolkit-managed.json';
const JOURNAL_FILE = 'transaction.json';
const CLAIM_FILE = 'transaction.lock';
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
  'registry-commit-intent',
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

function transactionLstat(
  target: string,
  fileOps: AssetTransactionFileOps,
): ReturnType<typeof lstatSync> & object {
  const stats = (fileOps.lstatSync ?? lstatSync)(target);
  if (!stats) throw new Error(`Asset transaction path disappeared: ${target}`);
  return stats;
}

function directoryIdentity(
  target: string,
  fileOps: AssetTransactionFileOps,
): DirectoryIdentity {
  const stats = transactionLstat(target, fileOps);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`Asset transaction directory is not a real directory: ${target}`);
  }
  return { device: String(stats.dev), inode: String(stats.ino) };
}

function sameIdentity(left: DirectoryIdentity, right: DirectoryIdentity): boolean {
  return left.device === right.device && left.inode === right.inode;
}

function rememberDirectory(guard: MutationGuard, target: string): void {
  guard.roots.set(path.resolve(target), directoryIdentity(target, guard.fileOps));
}

function forgetPath(guard: MutationGuard, target: string): void {
  const absolute = path.resolve(target);
  for (const candidate of [...guard.roots.keys()]) {
    if (candidate === absolute || isInside(absolute, candidate)) {
      guard.roots.delete(candidate);
    }
  }
}

function assertPinnedDirectories(guard: MutationGuard): void {
  for (const [target, expected] of guard.roots) {
    let actual: DirectoryIdentity;
    try {
      actual = directoryIdentity(target, guard.fileOps);
    } catch (error) {
      throw new Error(
        `Asset transaction directory identity changed: ${target}; ${errorMessage(error)}`,
      );
    }
    if (!sameIdentity(actual, expected)) {
      throw new Error(`Asset transaction directory identity changed: ${target}`);
    }
  }
}

function beforeGuardedMutation(
  guard: MutationGuard,
  operation: 'mkdir' | 'write' | 'rename' | 'remove',
  paths: readonly string[],
): void {
  guard.fileOps.beforeMutationSync?.(operation, paths);
  assertPinnedDirectories(guard);
}

function createMutationGuard(
  workspace: AssetWorkspace,
  fileOps: AssetTransactionFileOps,
): MutationGuard {
  const guard: MutationGuard = {
    workspaceRoot: path.resolve(workspace.root),
    roots: new Map(),
    fileOps,
  };
  const candidates = [
    workspace.root,
    workspace.stateRoot,
    path.join(workspace.stateRoot, 'staging'),
    path.join(workspace.stateRoot, 'transactions'),
    path.join(workspace.stateRoot, 'installed'),
  ];
  for (const candidate of candidates) {
    if (pathEntryExists(candidate)) rememberDirectory(guard, candidate);
  }
  return guard;
}

function rememberExistingAncestors(
  guard: MutationGuard,
  root: string,
  target: string,
): void {
  const absoluteRoot = path.resolve(root);
  const absoluteTarget = path.resolve(target);
  if (!isInside(absoluteRoot, absoluteTarget)) {
    throw new Error(`Asset transaction mutation escapes its pinned root: ${target}`);
  }
  if (!guard.roots.has(absoluteRoot)) rememberDirectory(guard, absoluteRoot);
  const relative = path.relative(absoluteRoot, absoluteTarget);
  if (relative === '') return;
  let current = absoluteRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    if (!pathEntryExists(current)) break;
    const stats = transactionLstat(current, guard.fileOps);
    if (stats.isSymbolicLink()) {
      throw new Error(`Asset transaction mutation traverses a symlink: ${current}`);
    }
    if (stats.isDirectory()) rememberDirectory(guard, current);
  }
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
  const journalTemporaryPath = `${transactionPath}.${journal.operationId}.tmp`;
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
  assertNoExistingSymlink(
    workspace.stateRoot,
    journalTemporaryPath,
    'Asset transaction journal temp',
  );
  assertRegularFileIfPresent(journalTemporaryPath, 'Asset transaction journal temp');
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
    journalTemporaryPath,
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

function authenticateGeneration(
  workspace: AssetWorkspace,
  outputRoot: string,
  registryPath: string,
  fileOps: AssetTransactionFileOps,
  allowV1 = false,
): AuthenticatedGeneration {
  assertDirectoryIfPresent(outputRoot, 'Asset transaction generation output');
  if (!pathEntryExists(outputRoot)) {
    throw new Error(`Asset transaction generation output is missing: ${outputRoot}`);
  }
  assertNoExistingSymlink(workspace.root, outputRoot, 'Asset transaction generation output');
  assertNoExistingSymlink(workspace.stateRoot, registryPath, 'Asset transaction generation registry');
  assertRegularFileIfPresent(registryPath, 'Asset transaction generation registry');
  const markerPath = path.join(outputRoot, OUTPUT_MARKER_FILE);
  const markerBytes = fileOps.readFileSync(markerPath);
  const markerWorkspaceId = readOutputWorkspaceId(outputRoot, fileOps);
  if (!markerWorkspaceId) throw new Error('Asset transaction generation marker is missing.');
  const generationWorkspace: AssetWorkspace = {
    ...workspace,
    outputRoot,
    registryPath,
  };
  const registryResult = readAssetPackRegistry({
    workspace: generationWorkspace,
    markerWorkspaceId,
  });
  if (!registryResult.ok) {
    throw new Error(registryResult.diagnostics.map((entry) => entry.message).join('; '));
  }
  if (
    !allowV1
    && (
      registryResult.needsMigration
      || registryResult.document.schema !== ASSET_WORKSPACE_REGISTRY_SCHEMA
    )
  ) {
    throw new Error('Asset transaction generation registry must use schema v2.');
  }
  const audit = auditPublishedManagedOutput({
    workspace: generationWorkspace,
    markerBytes,
    generatedDigests: registryResult.document.generatedDigests,
  });
  if (audit) throw new Error(audit.message);
  return { registry: registryResult.document };
}

function installedDirectories(
  generation: AuthenticatedGeneration,
): readonly string[] {
  return generation.registry.entries
    .flatMap((entry) => (
      entry.kind === 'installed' && 'installedDirectory' in entry
        ? [path.resolve(entry.installedDirectory)]
        : []
    ))
    .sort();
}

function setDifference(left: readonly string[], right: readonly string[]): readonly string[] {
  const excluded = new Set(right);
  return left.filter((entry) => !excluded.has(entry));
}

function assertInstalledPathDelta(
  cleanupInstalledSources: readonly string[],
  finalInstalledSource: string | undefined,
  oldInstalled: readonly string[],
  newInstalled: readonly string[],
): void {
  const removals = [...setDifference(oldInstalled, newInstalled)].sort();
  const additions = [...setDifference(newInstalled, oldInstalled)].sort();
  const listedCleanup = cleanupInstalledSources.map((entry) => path.resolve(entry)).sort();
  if (JSON.stringify(removals) !== JSON.stringify(listedCleanup)) {
    throw new Error('Asset transaction cleanup sources do not match the old-to-new registry delta.');
  }
  const final = finalInstalledSource
    ? [path.resolve(finalInstalledSource)]
    : [];
  if (JSON.stringify(additions) !== JSON.stringify(final)) {
    throw new Error('Asset transaction final installed source does not match the old-to-new registry delta.');
  }
}

function assertInstalledDeltaPaths(
  cleanupInstalledSources: readonly string[],
  finalInstalledSource: string | undefined,
  oldGeneration: AuthenticatedGeneration,
  newGeneration: AuthenticatedGeneration,
): void {
  const oldInstalled = installedDirectories(oldGeneration);
  const newInstalled = installedDirectories(newGeneration);
  assertInstalledPathDelta(
    cleanupInstalledSources,
    finalInstalledSource,
    oldInstalled,
    newInstalled,
  );
}

function readInstalledPathsFromRegistry(
  workspace: AssetWorkspace,
  registryPath: string,
  workspaceId: string,
  fileOps: AssetTransactionFileOps,
): readonly string[] {
  assertNoExistingSymlink(workspace.stateRoot, registryPath, 'Asset transaction staged registry');
  assertRegularFileIfPresent(registryPath, 'Asset transaction staged registry');
  const parsed = JSON.parse(fileOps.readFileSync(registryPath).toString('utf8')) as unknown;
  if (!isRecord(parsed)) throw new Error('Asset transaction staged registry must be an object.');
  if (parsed.schema !== ASSET_WORKSPACE_REGISTRY_SCHEMA || parsed.workspaceId !== workspaceId) {
    throw new Error('Asset transaction staged registry identity is invalid.');
  }
  if (!Array.isArray(parsed.entries)) {
    throw new Error('Asset transaction staged registry entries must be an array.');
  }
  const installedRoot = path.join(workspace.stateRoot, 'installed');
  const installed: string[] = [];
  for (const value of parsed.entries) {
    if (!isRecord(value)) throw new Error('Asset transaction staged registry entry is invalid.');
    if (value.kind === 'linked') continue;
    if (value.kind !== 'installed') {
      throw new Error('Asset transaction staged registry entry kind is invalid.');
    }
    if (typeof value.installedDirectory !== 'string') {
      throw new Error('Asset transaction staged installedDirectory is invalid.');
    }
    const installedDirectory = path.resolve(value.installedDirectory);
    assertInstalledGenerationPath(
      installedRoot,
      installedDirectory,
      'Asset transaction staged registry installedDirectory',
    );
    if (value.archiveDigest !== `sha256:${path.basename(installedDirectory)}`) {
      throw new Error('Asset transaction staged registry archive digest is invalid.');
    }
    installed.push(installedDirectory);
  }
  if (new Set(installed).size !== installed.length) {
    throw new Error('Asset transaction staged registry repeats an installed directory.');
  }
  return installed.sort();
}

function assertInstalledDelta(
  resolved: ResolvedJournal,
  oldGeneration: AuthenticatedGeneration,
  newGeneration: AuthenticatedGeneration,
): void {
  assertInstalledDeltaPaths(
    resolved.cleanupInstalledSources,
    resolved.finalInstalledSource,
    oldGeneration,
    newGeneration,
  );
}

interface RecoveryState {
  readonly oldGeneration: AuthenticatedGeneration;
  readonly newGeneration?: AuthenticatedGeneration;
}

function validateRecoveryState(
  resolved: ResolvedJournal,
  workspace: AssetWorkspace,
  fileOps: AssetTransactionFileOps,
): RecoveryState {
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

  if (hasStagedSource && hasFinalSource) {
    throw new Error('Transaction has both staged and final installed sources present.');
  }

  const committed = resolved.journal.phase === 'registry-commit-intent'
    || resolved.journal.phase === 'registry-published';
  if (committed) {
    if (!hasOutputBackup || !hasActiveOutput || hasStagedOutput) {
      throw new Error('Committed transaction output layout is incomplete or ambiguous.');
    }
    if (resolved.oldRegistryBackup) {
      const validRegistryLayout = (
        hasActiveRegistry && hasStagedRegistry && !hasRegistryBackup
      ) || (
        !hasActiveRegistry && hasStagedRegistry && hasRegistryBackup
      ) || (
        hasActiveRegistry && !hasStagedRegistry && hasRegistryBackup
      );
      if (!validRegistryLayout) {
        throw new Error('Committed transaction registry layout is incomplete or ambiguous.');
      }
    } else if (hasRegistryBackup || hasActiveRegistry === hasStagedRegistry) {
      throw new Error('Committed transaction registry layout is incomplete or ambiguous.');
    }
    if (resolved.finalInstalledSource && (!hasFinalSource || hasStagedSource)) {
      throw new Error('Committed installed source state is incomplete or ambiguous.');
    }
    if (
      resolved.journal.phase === 'registry-published'
      && (!hasActiveRegistry || hasStagedRegistry)
    ) {
      throw new Error('Registry-published transaction does not have its active registry.');
    }
    const oldRegistry = hasRegistryBackup
      ? resolved.oldRegistryBackup!
      : hasActiveRegistry && hasStagedRegistry
        ? workspace.registryPath
        : resolved.oldRegistryBackup
          ? (() => { throw new Error('Committed transaction old registry is missing.'); })()
          : path.join(resolved.transactionRoot, 'old-registry-absent');
    const oldGeneration = authenticateGeneration(
      workspace,
      resolved.oldOutputBackup,
      oldRegistry,
      fileOps,
      true,
    );
    const newRegistry = hasStagedRegistry ? resolved.stagedRegistry : workspace.registryPath;
    const newGeneration = authenticateGeneration(
      workspace,
      workspace.outputRoot,
      newRegistry,
      fileOps,
    );
    assertInstalledDelta(resolved, oldGeneration, newGeneration);
    return { oldGeneration, newGeneration };
  }

  if (hasRegistryBackup) {
    throw new Error('Pre-commit transaction unexpectedly contains an old registry backup.');
  }
  if (hasOutputBackup) {
    if (hasActiveOutput === hasStagedOutput) {
      throw new Error('Pre-commit output swap state is incomplete or ambiguous.');
    }
  } else if (!hasActiveOutput) {
    throw new Error('Rollback transaction has no coherent active old output generation.');
  }
  const oldGeneration = authenticateGeneration(
    workspace,
    hasOutputBackup ? resolved.oldOutputBackup : workspace.outputRoot,
    workspace.registryPath,
    fileOps,
    true,
  );
  if (hasStagedRegistry) {
    assertInstalledPathDelta(
      resolved.cleanupInstalledSources,
      resolved.finalInstalledSource,
      installedDirectories(oldGeneration),
      readInstalledPathsFromRegistry(
        workspace,
        resolved.stagedRegistry,
        resolved.journal.workspaceId,
        fileOps,
      ),
    );
  }
  if (hasFinalSource) {
    if (!hasStagedRegistry || !hasActiveOutput || !hasOutputBackup) {
      throw new Error('Published source cannot be authenticated against a staged new generation.');
    }
    const newGeneration = authenticateGeneration(
      workspace,
      workspace.outputRoot,
      resolved.stagedRegistry,
      fileOps,
    );
    assertInstalledDelta(resolved, oldGeneration, newGeneration);
    return { oldGeneration, newGeneration };
  }
  return { oldGeneration };
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

interface TransactionClaim {
  readonly operationId: string;
  readonly path: string;
  readonly stateRoot: string;
  readonly workspace: AssetWorkspace;
  readonly workspaceId: string;
  readonly identity: DirectoryIdentity;
  readonly guard: MutationGuard;
}

interface TransactionClaimRecord {
  readonly schema: typeof ASSET_PACK_TRANSACTION_SCHEMA;
  readonly workspaceId: string;
  readonly operationId: string;
  readonly pid: number;
}

function claimIdentity(
  target: string,
  fileOps: AssetTransactionFileOps,
): DirectoryIdentity {
  const stats = transactionLstat(target, fileOps);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`Asset transaction claim is not a regular file: ${target}`);
  }
  return { device: String(stats.dev), inode: String(stats.ino) };
}

function readClaimRecord(
  workspace: AssetWorkspace,
  claimPath: string,
  fileOps: AssetTransactionFileOps,
  expectedWorkspaceId?: string,
): TransactionClaimRecord {
  assertNoExistingSymlink(workspace.stateRoot, claimPath, 'Asset transaction claim');
  assertRegularFileIfPresent(claimPath, 'Asset transaction claim');
  const parsed = JSON.parse(fileOps.readFileSync(claimPath).toString('utf8')) as unknown;
  if (!isRecord(parsed)) throw new Error('Asset transaction claim must be a JSON object.');
  const keys = Object.keys(parsed).sort();
  if (JSON.stringify(keys) !== JSON.stringify(['operationId', 'pid', 'schema', 'workspaceId'])) {
    throw new Error('Asset transaction claim keys are invalid.');
  }
  if (parsed.schema !== ASSET_PACK_TRANSACTION_SCHEMA) {
    throw new Error('Asset transaction claim schema is invalid.');
  }
  if (typeof parsed.workspaceId !== 'string' || parsed.workspaceId.length === 0) {
    throw new Error('Asset transaction claim workspaceId is invalid.');
  }
  if (
    parsed.workspaceId
    !== (expectedWorkspaceId ?? readOutputWorkspaceId(workspace.outputRoot, fileOps))
  ) {
    throw new Error('Asset transaction claim workspaceId does not match the workspace.');
  }
  if (typeof parsed.operationId !== 'string' || !UUID_V4.test(parsed.operationId)) {
    throw new Error('Asset transaction claim operationId is invalid.');
  }
  if (!Number.isSafeInteger(parsed.pid) || (parsed.pid as number) <= 0) {
    throw new Error('Asset transaction claim pid is invalid.');
  }
  return {
    schema: ASSET_PACK_TRANSACTION_SCHEMA,
    workspaceId: parsed.workspaceId,
    operationId: parsed.operationId,
    pid: parsed.pid as number,
  };
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ESRCH') return false;
    return true;
  }
}

function workspaceIdForClaim(
  workspace: AssetWorkspace,
  fileOps: AssetTransactionFileOps,
): string {
  const active = readOutputWorkspaceId(workspace.outputRoot, fileOps);
  if (active) return active;
  const journalPath = path.join(workspace.stateRoot, JOURNAL_FILE);
  assertNoExistingSymlink(workspace.stateRoot, journalPath, 'Asset transaction journal');
  assertRegularFileIfPresent(journalPath, 'Asset transaction journal');
  if (!pathEntryExists(journalPath)) {
    throw new Error('Managed asset output marker and recovery journal are missing.');
  }
  const parsed = JSON.parse(fileOps.readFileSync(journalPath).toString('utf8')) as unknown;
  if (!isRecord(parsed) || typeof parsed.workspaceId !== 'string' || parsed.workspaceId.length === 0) {
    throw new Error('Asset transaction recovery journal workspaceId is invalid.');
  }
  return parsed.workspaceId;
}

function removeClaimWithIdentity(
  claimPath: string,
  expected: DirectoryIdentity,
  guard: MutationGuard,
): void {
  beforeGuardedMutation(guard, 'remove', [claimPath]);
  const actual = claimIdentity(claimPath, guard.fileOps);
  if (!sameIdentity(actual, expected)) {
    throw new Error('Asset transaction claim identity changed before release.');
  }
  guard.fileOps.rmSync(claimPath, { force: false });
  fsyncDirectory(path.dirname(claimPath), guard.fileOps);
}

function acquireTransactionClaim(
  workspace: AssetWorkspace,
  fileOps: AssetTransactionFileOps,
  operationId = randomUUID(),
): TransactionClaim {
  const guard = createMutationGuard(workspace, fileOps);
  const claimPath = path.join(workspace.stateRoot, CLAIM_FILE);
  const workspaceId = workspaceIdForClaim(workspace, fileOps);
  assertNoExistingSymlink(workspace.stateRoot, claimPath, 'Asset transaction claim');
  beforeGuardedMutation(guard, 'write', [claimPath]);
  let descriptor: number;
  try {
    descriptor = fileOps.openSync(claimPath, 'wx', 0o600);
  } catch (error) {
    if (isNodeError(error) && error.code === 'EEXIST') {
      const existingIdentity = claimIdentity(claimPath, fileOps);
      const existing = readClaimRecord(workspace, claimPath, fileOps);
      if (processIsAlive(existing.pid)) {
        throw new Error('Another asset lifecycle transaction already owns this workspace.');
      }
      removeClaimWithIdentity(claimPath, existingIdentity, guard);
      return acquireTransactionClaim(workspace, fileOps, operationId);
    }
    throw error;
  }
  try {
    closeAfter(descriptor, fileOps, () => {
      fileOps.writeFileSync(descriptor, Buffer.from(`${JSON.stringify({
        schema: ASSET_PACK_TRANSACTION_SCHEMA,
        workspaceId,
        operationId,
        pid: process.pid,
      })}\n`));
      fileOps.fsyncSync(descriptor);
    });
    fsyncDirectory(workspace.stateRoot, fileOps);
    return {
      operationId,
      path: claimPath,
      stateRoot: workspace.stateRoot,
      workspace,
      workspaceId,
      identity: claimIdentity(claimPath, fileOps),
      guard,
    };
  } catch (error) {
    if (pathEntryExists(claimPath)) {
      try {
        removeClaimWithIdentity(claimPath, claimIdentity(claimPath, fileOps), guard);
      } catch {
        // The claim durability error remains primary.
      }
    }
    throw error;
  }
}

function releaseTransactionClaim(claim: TransactionClaim): void {
  const record = readClaimRecord(
    claim.workspace,
    claim.path,
    claim.guard.fileOps,
    claim.workspaceId,
  );
  if (record.operationId !== claim.operationId || record.pid !== process.pid) {
    throw new Error('Asset transaction claim ownership changed before release.');
  }
  const releaseGuard = createMutationGuard(claim.workspace, claim.guard.fileOps);
  removeClaimWithIdentity(claim.path, claim.identity, releaseGuard);
}

function createDirectoriesDurably(
  root: string,
  target: string,
  guard: MutationGuard,
): void {
  const absoluteRoot = path.resolve(root);
  const absoluteTarget = path.resolve(target);
  if (!isInside(absoluteRoot, absoluteTarget)) {
    throw new Error(`Asset transaction directory escapes its durable root: ${target}`);
  }
  if (!guard.roots.has(absoluteRoot)) rememberDirectory(guard, absoluteRoot);
  const relative = path.relative(absoluteRoot, absoluteTarget);
  if (relative === '') return;
  let current = absoluteRoot;
  for (const segment of relative.split(path.sep)) {
    const parent = current;
    current = path.join(parent, segment);
    if (pathEntryExists(current)) {
      rememberDirectory(guard, current);
      continue;
    }
    beforeGuardedMutation(guard, 'mkdir', [current]);
    guard.fileOps.mkdirSync(current);
    rememberDirectory(guard, current);
    fsyncDirectory(parent, guard.fileOps);
  }
}

function durableWrite(
  root: string,
  target: string,
  bytes: Buffer,
  guard: MutationGuard,
): void {
  createDirectoriesDurably(root, path.dirname(target), guard);
  assertNoExistingSymlink(root, target, 'Durable transaction file');
  if (pathEntryExists(target)) {
    throw new Error(`Durable transaction file already exists: ${target}`);
  }
  rememberExistingAncestors(guard, root, path.dirname(target));
  beforeGuardedMutation(guard, 'write', [target]);
  guard.fileOps.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
  fsyncFile(target, guard.fileOps);
  fsyncDirectory(path.dirname(target), guard.fileOps);
}

function durableRename(
  source: string,
  destination: string,
  guard: MutationGuard,
): void {
  rememberExistingAncestors(guard, guard.workspaceRoot, source);
  rememberExistingAncestors(guard, guard.workspaceRoot, path.dirname(destination));
  beforeGuardedMutation(guard, 'rename', [source, destination]);
  forgetPath(guard, source);
  guard.fileOps.renameSync(source, destination);
  fsyncDirectory(path.dirname(source), guard.fileOps);
  if (path.resolve(path.dirname(destination)) !== path.resolve(path.dirname(source))) {
    fsyncDirectory(path.dirname(destination), guard.fileOps);
  }
}

function journalBytes(journal: AssetPackTransactionJournal): Buffer {
  return Buffer.from(`${JSON.stringify(journal, null, 2)}\n`);
}

function writeJournalDurably(
  workspace: AssetWorkspace,
  journal: AssetPackTransactionJournal,
  guard: MutationGuard,
): void {
  const transactionPath = path.join(workspace.stateRoot, JOURNAL_FILE);
  const temporaryPath = `${transactionPath}.${journal.operationId}.tmp`;
  assertNoExistingSymlink(workspace.stateRoot, temporaryPath, 'Asset transaction journal temp');
  durableWrite(workspace.stateRoot, temporaryPath, journalBytes(journal), guard);
  durableRename(temporaryPath, transactionPath, guard);
}

function removeListedPath(
  root: string,
  target: string,
  recursive: boolean,
  guard: MutationGuard,
): void {
  if (!pathEntryExists(target)) return;
  assertNoExistingSymlink(root, target, 'Asset transaction cleanup path');
  rememberExistingAncestors(guard, root, target);
  beforeGuardedMutation(guard, 'remove', [target]);
  forgetPath(guard, target);
  guard.fileOps.rmSync(target, { recursive, force: true });
  fsyncDirectory(path.dirname(target), guard.fileOps);
}

function restoreListedPath(
  backupRoot: string,
  backup: string,
  activeRoot: string,
  active: string,
  recursiveActive: boolean,
  guard: MutationGuard,
): void {
  if (!pathEntryExists(backup)) return;
  assertNoExistingSymlink(backupRoot, backup, 'Asset transaction backup');
  if (pathEntryExists(active)) {
    assertNoExistingSymlink(activeRoot, active, 'Asset transaction active path');
    rememberExistingAncestors(guard, activeRoot, active);
    beforeGuardedMutation(guard, 'remove', [active]);
    forgetPath(guard, active);
    guard.fileOps.rmSync(active, { recursive: recursiveActive, force: true });
    fsyncDirectory(path.dirname(active), guard.fileOps);
  }
  durableRename(backup, active, guard);
}

function finishJournal(
  resolved: ResolvedJournal,
  workspace: AssetWorkspace,
  guard: MutationGuard,
): void {
  removeListedPath(
    path.join(workspace.stateRoot, 'transactions'),
    resolved.oldOutputBackup,
    true,
    guard,
  );
  if (resolved.oldRegistryBackup) {
    removeListedPath(
      path.join(workspace.stateRoot, 'transactions'),
      resolved.oldRegistryBackup,
      false,
      guard,
    );
  }
  removeListedPath(
    path.join(workspace.stateRoot, 'staging'),
    resolved.stagedOutput,
    true,
    guard,
  );
  removeListedPath(
    path.join(workspace.stateRoot, 'staging'),
    resolved.stagedRegistry,
    false,
    guard,
  );
  if (resolved.stagedInstalledSource) {
    removeListedPath(
      path.join(workspace.stateRoot, 'staging'),
      resolved.stagedInstalledSource,
      true,
      guard,
    );
  }
  for (const cleanupSource of resolved.cleanupInstalledSources) {
    removeListedPath(
      path.join(workspace.stateRoot, 'installed'),
      cleanupSource,
      true,
      guard,
    );
  }
  removeListedPath(
    workspace.stateRoot,
    resolved.journalTemporaryPath,
    false,
    guard,
  );
  removeListedPath(
    workspace.stateRoot,
    resolved.transactionPath,
    false,
    guard,
  );
  removeListedPath(
    path.join(workspace.stateRoot, 'staging'),
    path.dirname(resolved.stagedOutput),
    true,
    guard,
  );
  removeListedPath(
    path.join(workspace.stateRoot, 'transactions'),
    resolved.transactionRoot,
    true,
    guard,
  );
}

function rollBackJournal(
  resolved: ResolvedJournal,
  workspace: AssetWorkspace,
  guard: MutationGuard,
): void {
  if (resolved.oldRegistryBackup) {
    restoreListedPath(
      path.join(workspace.stateRoot, 'transactions'),
      resolved.oldRegistryBackup,
      workspace.stateRoot,
      workspace.registryPath,
      false,
      guard,
    );
  } else if (!pathEntryExists(resolved.stagedRegistry) && pathEntryExists(workspace.registryPath)) {
    removeListedPath(workspace.stateRoot, workspace.registryPath, false, guard);
  }
  restoreListedPath(
    path.join(workspace.stateRoot, 'transactions'),
    resolved.oldOutputBackup,
    workspace.root,
    workspace.outputRoot,
    true,
    guard,
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
      guard,
    );
  }
  removeListedPath(
    path.join(workspace.stateRoot, 'staging'),
    resolved.stagedOutput,
    true,
    guard,
  );
  removeListedPath(
    path.join(workspace.stateRoot, 'staging'),
    resolved.stagedRegistry,
    false,
    guard,
  );
  if (resolved.stagedInstalledSource) {
    removeListedPath(
      path.join(workspace.stateRoot, 'staging'),
      resolved.stagedInstalledSource,
      true,
      guard,
    );
  }
  removeListedPath(
    workspace.stateRoot,
    resolved.journalTemporaryPath,
    false,
    guard,
  );
  removeListedPath(workspace.stateRoot, resolved.transactionPath, false, guard);
  removeListedPath(
    path.join(workspace.stateRoot, 'staging'),
    path.dirname(resolved.stagedOutput),
    true,
    guard,
  );
  removeListedPath(
    path.join(workspace.stateRoot, 'transactions'),
    resolved.transactionRoot,
    true,
    guard,
  );
}

function recoverAssetPackTransactionUnderClaim(options: {
  readonly workspace: AssetWorkspace;
  readonly fileOps: AssetTransactionFileOps;
  readonly claim: TransactionClaim;
}): AssetPackRecoveryResult {
  const transactionPath = path.join(options.workspace.stateRoot, JOURNAL_FILE);
  if (!pathEntryExists(transactionPath)) return { ok: true, action: 'none' };
  let resolved: ResolvedJournal;
  try {
    assertNoExistingSymlink(options.workspace.stateRoot, transactionPath, 'Asset transaction journal');
    assertRegularFileIfPresent(transactionPath, 'Asset transaction journal');
    const parsed = JSON.parse(options.fileOps.readFileSync(transactionPath).toString('utf8')) as unknown;
    const journal = parseJournalRecord(parsed);
    resolved = resolveJournal(options.workspace, journal, options.fileOps);
    validateRecoveryState(resolved, options.workspace, options.fileOps);
  } catch (error) {
    return recoveryFailure('asset_transaction_unsafe', error, options.workspace);
  }

  try {
    removeListedPath(
      options.workspace.stateRoot,
      resolved.journalTemporaryPath,
      false,
      options.claim.guard,
    );
    if (
      resolved.journal.phase === 'registry-commit-intent'
      || resolved.journal.phase === 'registry-published'
    ) {
      if (resolved.journal.phase === 'registry-commit-intent') {
        if (pathEntryExists(resolved.stagedRegistry)) {
          if (
            resolved.oldRegistryBackup
            && pathEntryExists(options.workspace.registryPath)
            && !pathEntryExists(resolved.oldRegistryBackup)
          ) {
            durableRename(
              options.workspace.registryPath,
              resolved.oldRegistryBackup,
              options.claim.guard,
            );
          }
          durableRename(
            resolved.stagedRegistry,
            options.workspace.registryPath,
            options.claim.guard,
          );
        }
        const committedJournal = updatePhase(
          resolved.journal,
          'registry-published',
          options.workspace,
          options.claim.guard,
        );
        resolved = resolveJournal(options.workspace, committedJournal, options.fileOps);
        validateRecoveryState(resolved, options.workspace, options.fileOps);
      }
      finishJournal(resolved, options.workspace, options.claim.guard);
      return { ok: true, action: 'completed' };
    }
    rollBackJournal(resolved, options.workspace, options.claim.guard);
    return { ok: true, action: 'rolled-back' };
  } catch (error) {
    return recoveryFailure('asset_publish_failed', error, options.workspace);
  }
}

export function recoverAssetPackTransaction(options: {
  readonly workspace: AssetWorkspace;
  readonly fileOps?: AssetTransactionFileOps;
}): AssetPackRecoveryResult {
  const fileOps = options.fileOps ?? DEFAULT_FILE_OPS;
  const transactionPath = path.join(options.workspace.stateRoot, JOURNAL_FILE);
  const claimPath = path.join(options.workspace.stateRoot, CLAIM_FILE);
  if (!pathEntryExists(transactionPath) && !pathEntryExists(claimPath)) {
    return { ok: true, action: 'none' };
  }
  let claim: TransactionClaim;
  try {
    claim = acquireTransactionClaim(options.workspace, fileOps);
  } catch (error) {
    return recoveryFailure('asset_publish_failed', error, options.workspace);
  }
  try {
    return recoverAssetPackTransactionUnderClaim({
      workspace: options.workspace,
      fileOps,
      claim,
    });
  } finally {
    try {
      releaseTransactionClaim(claim);
    } catch {
      // The recovery result remains primary; a stale claim fails closed later.
    }
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
  readonly workspace: AssetWorkspace;
  readonly guard: MutationGuard;
}): void {
  createDirectoriesDurably(
    path.join(options.workspace.stateRoot, 'staging'),
    options.stagedOutput,
    options.guard,
  );
  for (const [logicalPath, bytes] of options.desiredState.outputFiles) {
    const destination = safeOutputDestination(options.stagedOutput, logicalPath);
    durableWrite(options.stagedOutput, destination, Buffer.from(bytes), options.guard);
  }
  durableWrite(
    path.join(options.workspace.stateRoot, 'staging'),
    options.stagedRegistry,
    assetPackRegistryBytes(options.desiredState.registry),
    options.guard,
  );
}

function updatePhase(
  journal: AssetPackTransactionJournal,
  phase: AssetPackTransactionPhase,
  workspace: AssetWorkspace,
  guard: MutationGuard,
): AssetPackTransactionJournal {
  const updated: AssetPackTransactionJournal = { ...journal, phase };
  writeJournalDurably(workspace, updated, guard);
  return updated;
}

export async function publishAssetPackGeneration(
  options: PublishAssetPackGenerationOptions,
): Promise<AssetPackPublicationResult> {
  const fileOps = options.fileOps ?? DEFAULT_FILE_OPS;
  let claim: TransactionClaim;
  try {
    claim = acquireTransactionClaim(options.workspace, fileOps);
  } catch (error) {
    return publicationFailure(error, options.workspace);
  }
  const pending = recoverAssetPackTransactionUnderClaim({
    workspace: options.workspace,
    fileOps,
    claim,
  });
  if (!pending.ok) {
    try {
      releaseTransactionClaim(claim);
    } catch {
      // The recovery diagnostic remains primary.
    }
    return pending;
  }

  const operationId = claim.operationId;
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
  let result: AssetPackPublicationResult;

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
    const oldGeneration = authenticateGeneration(
      options.workspace,
      options.workspace.outputRoot,
      options.workspace.registryPath,
      fileOps,
      true,
    );
    assertInstalledDeltaPaths(
      options.cleanupInstalledSources,
      options.finalInstalledSource,
      oldGeneration,
      { registry: options.desiredState.registry },
    );

    createDirectoriesDurably(
      path.join(options.workspace.stateRoot, 'staging'),
      stagingRoot,
      claim.guard,
    );
    createDirectoriesDurably(
      options.workspace.stateRoot,
      path.join(options.workspace.stateRoot, 'transactions'),
      claim.guard,
    );
    createDirectoriesDurably(
      path.join(options.workspace.stateRoot, 'transactions'),
      transactionRoot,
      claim.guard,
    );
    materializeDesiredState({
      desiredState: options.desiredState,
      stagedOutput,
      stagedRegistry,
      workspace: options.workspace,
      guard: claim.guard,
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
    writeJournalDurably(options.workspace, journal, claim.guard);
    journalWritten = true;

    durableRename(options.workspace.outputRoot, oldOutputBackup, claim.guard);
    durableRename(stagedOutput, options.workspace.outputRoot, claim.guard);
    journal = updatePhase(journal, 'output-published', options.workspace, claim.guard);

    if (options.stagedInstalledSource && options.finalInstalledSource) {
      createDirectoriesDurably(
        path.join(options.workspace.stateRoot, 'installed'),
        path.dirname(options.finalInstalledSource),
        claim.guard,
      );
      durableRename(
        options.stagedInstalledSource,
        options.finalInstalledSource,
        claim.guard,
      );
    }
    journal = updatePhase(journal, 'sources-published', options.workspace, claim.guard);

    journal = updatePhase(
      journal,
      'registry-commit-intent',
      options.workspace,
      claim.guard,
    );

    if (journal.oldRegistryBackup) {
      durableRename(options.workspace.registryPath, oldRegistryBackup, claim.guard);
    }
    durableRename(stagedRegistry, options.workspace.registryPath, claim.guard);
    journal = updatePhase(
      journal,
      'registry-published',
      options.workspace,
      claim.guard,
    );

    const resolved = resolveJournal(options.workspace, journal, fileOps);
    validateRecoveryState(resolved, options.workspace, fileOps);
    finishJournal(resolved, options.workspace, claim.guard);
    result = { ok: true };
  } catch (error) {
    if (!journalWritten) {
      try {
        removeListedPath(
          path.join(options.workspace.stateRoot, 'staging'),
          stagingRoot,
          true,
          claim.guard,
        );
        removeListedPath(
          path.join(options.workspace.stateRoot, 'transactions'),
          transactionRoot,
          true,
          claim.guard,
        );
        removeListedPath(
          options.workspace.stateRoot,
          `${path.join(options.workspace.stateRoot, JOURNAL_FILE)}.${operationId}.tmp`,
          false,
          claim.guard,
        );
      } catch {
        // The publication diagnostic remains the primary failure. No active state moved.
      }
    }
    result = publicationFailure(error, options.workspace);
  }
  try {
    releaseTransactionClaim(claim);
  } catch (error) {
    if (result.ok) result = publicationFailure(error, options.workspace);
  }
  return result;
}
