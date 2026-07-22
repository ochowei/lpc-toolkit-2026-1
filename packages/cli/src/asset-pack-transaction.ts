import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
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
  ASSET_WORKSPACE_REGISTRY_V1_SCHEMA,
  auditPublishedManagedOutput,
  assetPackRegistryBytes,
  readAssetPackRegistry,
  verifyInstalledAssetPackDirectory,
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
  | 'registry-published';

export type AssetPackRecoveryAction = 'none' | 'rolled-back' | 'completed';

export type AssetPackRecoveryRoleEvidence =
  | {
    readonly role:
      | 'cleanup-installed-source'
      | 'created-installed-parent'
      | 'incoming-installed-source'
      | 'published-installed-source';
    readonly path: string;
    readonly present: false;
  }
  | {
    readonly role:
      | 'cleanup-installed-source'
      | 'created-installed-parent'
      | 'incoming-installed-source'
      | 'published-installed-source';
    readonly path: string;
    readonly present: true;
    readonly initialPath: string;
    readonly device: string;
    readonly inode: string;
    readonly type: 'directory';
    readonly contentDigest: string;
  };

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
  readonly incomingInstalledSource?: string;
  readonly stagedInstalledSource?: string;
  readonly finalInstalledSource?: string;
  readonly cleanupInstalledSources: readonly string[];
  readonly createdInstalledParents?: readonly string[];
  readonly recoveryMode?: 'rollback' | 'cleanup';
  readonly recoveryCursor?: number;
  readonly oldRegistryDigest?: string;
  readonly newRegistryDigest?: string;
  readonly recoveryRoleEvidence?: readonly AssetPackRecoveryRoleEvidence[];
}

export interface AssetTransactionFileOps {
  readonly mkdirSync: typeof mkdirSync;
  readonly writeFileSync: typeof writeFileSync;
  readonly readFileSync: typeof readFileSync;
  readonly renameSync: typeof renameSync;
  readonly rmdirSync?: typeof rmdirSync;
  readonly rmSync: typeof rmSync;
  readonly openSync: typeof openSync;
  readonly fsyncSync: typeof fsyncSync;
  readonly closeSync: typeof closeSync;
  readonly fstatSync: typeof fstatSync;
  readonly linkSync: typeof linkSync;
  readonly lstatSync?: typeof lstatSync;
  readonly beforeMutationSync?: (
    operation: 'mkdir' | 'write' | 'rename' | 'remove',
    paths: readonly string[],
  ) => void;
  readonly afterMutationValidationSync?: (
    operation: 'mkdir' | 'write' | 'rename' | 'remove',
    paths: readonly string[],
  ) => void;
  readonly afterMutationSync?: (
    operation: 'mkdir' | 'write' | 'rename' | 'remove',
    paths: readonly string[],
    boundary: 'mutation' | 'fsync',
  ) => void;
  readonly afterClaimAcquiredSync?: () => void;
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

export type AssetPackClaimedLifecycleResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly AssetPackLifecycleDiagnostic[] };

export interface AssetPackClaimedPublisher {
  publish(
    options: Omit<PublishAssetPackGenerationOptions, 'workspace' | 'fileOps'>,
  ): Promise<AssetPackPublicationResult>;
  recover(): AssetPackRecoveryResult;
}

interface ResolvedJournal {
  readonly journal: AssetPackTransactionJournal;
  readonly transactionPath: string;
  readonly journalTemporaryPath: string;
  readonly transactionRoot: string;
  readonly oldOutputBackup: string;
  readonly oldRegistryBackup?: string;
  readonly stagedOutput: string;
  readonly stagedRegistry: string;
  readonly incomingInstalledSource?: string;
  readonly stagedInstalledSource?: string;
  readonly finalInstalledSource?: string;
  readonly cleanupInstalledSources: readonly string[];
  readonly createdInstalledParents: readonly string[];
}

interface DirectoryIdentity {
  readonly device: string;
  readonly inode: string;
}

type PathEntryIdentity =
  | { readonly present: false }
  | {
    readonly present: true;
    readonly device: string;
    readonly inode: string;
    readonly type: 'directory' | 'file' | 'symlink' | 'other';
  };

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
  'createdInstalledParents',
  'incomingInstalledSource',
  'stagedInstalledSource',
  'finalInstalledSource',
  'recoveryMode',
  'recoveryCursor',
  'oldRegistryDigest',
  'newRegistryDigest',
  'recoveryRoleEvidence',
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
const RECOVERY_ROLES: readonly AssetPackRecoveryRoleEvidence['role'][] = [
  'cleanup-installed-source',
  'created-installed-parent',
  'incoming-installed-source',
  'published-installed-source',
];
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_DIRECTORY = /^[0-9a-f]{64}$/;
const TOLERATED_DIRECTORY_FSYNC_ERRORS = new Set(['EINVAL', 'ENOTSUP', 'EPERM']);

const DEFAULT_FILE_OPS: AssetTransactionFileOps = {
  mkdirSync,
  writeFileSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  openSync,
  fsyncSync,
  closeSync,
  fstatSync,
  linkSync,
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

function pathEntryIdentity(
  target: string,
  fileOps: AssetTransactionFileOps,
): PathEntryIdentity {
  try {
    const stats = (fileOps.lstatSync ?? lstatSync)(target);
    if (!stats) throw new Error(`Asset transaction path disappeared: ${target}`);
    const type = stats.isDirectory()
      ? 'directory'
      : stats.isFile()
        ? 'file'
        : stats.isSymbolicLink()
          ? 'symlink'
          : 'other';
    return {
      present: true,
      device: String(stats.dev),
      inode: String(stats.ino),
      type,
    };
  } catch (error) {
    if (isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return { present: false };
    }
    throw error;
  }
}

function samePathEntryIdentity(
  left: PathEntryIdentity,
  right: PathEntryIdentity,
): boolean {
  if (!left.present || !right.present) return left.present === right.present;
  return left.device === right.device
    && left.inode === right.inode
    && left.type === right.type;
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

function withPinnedWorkingDirectory<T>(options: {
  readonly guard: MutationGuard;
  readonly parent: string;
  readonly operation: 'mkdir' | 'write' | 'rename' | 'remove';
  readonly paths: readonly string[];
  readonly childPaths?: readonly string[];
  readonly action: () => T;
}): T {
  const absoluteParent = path.resolve(options.parent);
  if (!options.guard.roots.has(absoluteParent)) {
    rememberDirectory(options.guard, absoluteParent);
  }
  beforeGuardedMutation(options.guard, options.operation, options.paths);
  const expected = options.guard.roots.get(absoluteParent);
  if (!expected) throw new Error(`Asset transaction parent is not pinned: ${absoluteParent}`);
  const previousWorkingDirectory = process.cwd();
  process.chdir(absoluteParent);
  try {
    const actual = directoryIdentity('.', options.guard.fileOps);
    if (!sameIdentity(actual, expected)) {
      throw new Error(`Asset transaction directory identity changed: ${absoluteParent}`);
    }
    const childIdentities = (options.childPaths ?? []).map((target) => {
      if (path.resolve(path.dirname(target)) !== absoluteParent) {
        throw new Error(`Asset transaction child is outside its pinned parent: ${target}`);
      }
      const basename = path.basename(target);
      return {
        target,
        basename,
        identity: pathEntryIdentity(basename, options.guard.fileOps),
      };
    });
    options.guard.fileOps.afterMutationValidationSync?.(
      options.operation,
      options.paths,
    );
    for (const child of childIdentities) {
      const actualChild = pathEntryIdentity(child.basename, options.guard.fileOps);
      if (!samePathEntryIdentity(actualChild, child.identity)) {
        throw new Error(
          `Asset transaction child identity changed before mutation: ${child.target}`,
        );
      }
    }
    return options.action();
  } finally {
    process.chdir(previousWorkingDirectory);
  }
}

function withStableWorkspaceWorkingDirectory<T>(options: {
  readonly workspace: AssetWorkspace;
  readonly fileOps: AssetTransactionFileOps;
  readonly action: () => T;
}): T {
  const stableWorkingDirectory = path.resolve(options.workspace.root);
  const expectedIdentity = directoryIdentity(stableWorkingDirectory, options.fileOps);
  const previousWorkingDirectory = process.cwd();
  process.chdir(stableWorkingDirectory);
  const actualIdentity = directoryIdentity('.', options.fileOps);
  if (!sameIdentity(actualIdentity, expectedIdentity)) {
    process.chdir(previousWorkingDirectory);
    throw new Error(
      `Asset transaction stable working directory identity changed: ${stableWorkingDirectory}`,
    );
  }

  let actionError: unknown;
  try {
    return options.action();
  } catch (error) {
    actionError = error;
    throw error;
  } finally {
    try {
      process.chdir(previousWorkingDirectory);
    } catch (restoreError) {
      process.chdir(stableWorkingDirectory);
      if (actionError === undefined && pathEntryExists(previousWorkingDirectory)) {
        throw restoreError;
      }
    }
  }
}

function fsyncCurrentDirectory(fileOps: AssetTransactionFileOps): void {
  fsyncDirectory('.', fileOps);
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

function transactionSiblingPath(
  target: string,
  operationId: string,
  role: 'staged' | 'backup',
): string {
  return path.join(
    path.dirname(target),
    `.${path.basename(target)}.${operationId}.${role}`,
  );
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
): Extract<AssetPackPublicationResult, { readonly ok: false }> {
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
): Extract<AssetPackRecoveryResult, { readonly ok: false }> {
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

function optionalIntegerValue(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  if (!(key in record)) return undefined;
  const value = record[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`Asset transaction journal ${key} must be a non-negative integer.`);
  }
  return value as number;
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

function optionalStringArrayValue(
  record: Record<string, unknown>,
  key: string,
): readonly string[] | undefined {
  if (!(key in record)) return undefined;
  return stringArrayValue(record, key);
}

function optionalRecoveryRoleEvidenceValue(
  record: Record<string, unknown>,
): readonly AssetPackRecoveryRoleEvidence[] | undefined {
  if (!('recoveryRoleEvidence' in record)) return undefined;
  const value = record.recoveryRoleEvidence;
  if (!Array.isArray(value)) {
    throw new Error('Asset transaction journal recoveryRoleEvidence must be an array.');
  }
  const evidence = value.map((entry, index): AssetPackRecoveryRoleEvidence => {
    if (!isRecord(entry)) {
      throw new Error(`Asset transaction recovery role evidence ${index} must be an object.`);
    }
    const role = stringValue(entry, 'role');
    if (!RECOVERY_ROLES.includes(role as AssetPackRecoveryRoleEvidence['role'])) {
      throw new Error(`Unknown asset transaction recovery role: ${role}.`);
    }
    const recoveryRole = role as AssetPackRecoveryRoleEvidence['role'];
    const rolePath = stringValue(entry, 'path');
    if (entry.present === false) {
      const keys = Object.keys(entry).sort();
      if (JSON.stringify(keys) !== JSON.stringify(['path', 'present', 'role'])) {
        throw new Error(`Asset transaction absent recovery role evidence ${index} has invalid keys.`);
      }
      return { role: recoveryRole, path: rolePath, present: false };
    }
    if (entry.present !== true) {
      throw new Error(`Asset transaction recovery role evidence ${index} present must be boolean.`);
    }
    const keys = Object.keys(entry).sort();
    const expectedKeys = [
      'contentDigest',
      'device',
      'initialPath',
      'inode',
      'path',
      'present',
      'role',
      'type',
    ];
    if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
      throw new Error(`Asset transaction present recovery role evidence ${index} has invalid keys.`);
    }
    if (entry.type !== 'directory') {
      throw new Error(`Asset transaction recovery role evidence ${index} type must be directory.`);
    }
    const contentDigest = stringValue(entry, 'contentDigest');
    if (!/^sha256:[0-9a-f]{64}$/.test(contentDigest)) {
      throw new Error(`Asset transaction recovery role evidence ${index} digest is invalid.`);
    }
    return {
      role: recoveryRole,
      path: rolePath,
      present: true,
      initialPath: stringValue(entry, 'initialPath'),
      device: stringValue(entry, 'device'),
      inode: stringValue(entry, 'inode'),
      type: 'directory',
      contentDigest,
    };
  });
  const keys = evidence.map((entry) => `${entry.role}:${entry.path}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error('Asset transaction recovery role evidence contains duplicates.');
  }
  return evidence;
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
  const incomingInstalledSource = optionalStringValue(value, 'incomingInstalledSource');
  const stagedInstalledSource = optionalStringValue(value, 'stagedInstalledSource');
  const finalInstalledSource = optionalStringValue(value, 'finalInstalledSource');
  const createdInstalledParents = optionalStringArrayValue(value, 'createdInstalledParents');
  const recoveryMode = optionalStringValue(value, 'recoveryMode');
  const recoveryCursor = optionalIntegerValue(value, 'recoveryCursor');
  const oldRegistryDigest = optionalStringValue(value, 'oldRegistryDigest');
  const newRegistryDigest = optionalStringValue(value, 'newRegistryDigest');
  const recoveryRoleEvidence = optionalRecoveryRoleEvidenceValue(value);
  const recoveryValues = [
    recoveryMode,
    recoveryCursor,
    oldRegistryDigest,
    newRegistryDigest,
    recoveryRoleEvidence,
  ];
  if (
    recoveryValues.some((entry) => entry !== undefined)
    && recoveryValues.some((entry) => entry === undefined)
  ) {
    throw new Error('Asset transaction recovery authorization fields must appear together.');
  }
  if (recoveryMode !== undefined && recoveryMode !== 'rollback' && recoveryMode !== 'cleanup') {
    throw new Error(`Unknown asset transaction recovery mode: ${recoveryMode}.`);
  }
  if (
    (recoveryMode === 'cleanup' && phase !== 'registry-published')
    || (recoveryMode === 'rollback' && phase === 'registry-published')
  ) {
    throw new Error('Asset transaction recovery mode does not match its durable phase.');
  }
  for (const [label, digest] of [
    ['oldRegistryDigest', oldRegistryDigest],
    ['newRegistryDigest', newRegistryDigest],
  ] as const) {
    if (digest !== undefined && digest !== 'absent' && !/^sha256:[0-9a-f]{64}$/.test(digest)) {
      throw new Error(`Asset transaction journal ${label} is invalid.`);
    }
  }
  if (
    (incomingInstalledSource === undefined) !== (stagedInstalledSource === undefined)
    || (stagedInstalledSource === undefined) !== (finalInstalledSource === undefined)
  ) {
    throw new Error(
      'Asset transaction incomingInstalledSource, stagedInstalledSource, and finalInstalledSource must appear together.',
    );
  }
  if (operation === 'sync' && (
    incomingInstalledSource !== undefined
    || stagedInstalledSource !== undefined
    || finalInstalledSource !== undefined
    || (createdInstalledParents?.length ?? 0) > 0
    || stringArrayValue(value, 'cleanupInstalledSources').length > 0
  )) {
    throw new Error('Sync transactions cannot publish or clean installed sources.');
  }
  if (operation === 'remove' && incomingInstalledSource !== undefined) {
    throw new Error('Remove transactions cannot publish an installed source.');
  }
  if (operation !== 'install' && (createdInstalledParents?.length ?? 0) > 0) {
    throw new Error('Only install transactions can create installed parent directories.');
  }
  if ((createdInstalledParents?.length ?? 0) > 0 && finalInstalledSource === undefined) {
    throw new Error('Created installed parents require a final installed source.');
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
    ...(incomingInstalledSource ? { incomingInstalledSource } : {}),
    ...(stagedInstalledSource ? { stagedInstalledSource } : {}),
    ...(finalInstalledSource ? { finalInstalledSource } : {}),
    cleanupInstalledSources: stringArrayValue(value, 'cleanupInstalledSources'),
    ...(createdInstalledParents ? { createdInstalledParents } : {}),
    ...(recoveryMode !== undefined
      ? {
        recoveryMode: recoveryMode as 'rollback' | 'cleanup',
        recoveryCursor: recoveryCursor!,
        oldRegistryDigest: oldRegistryDigest!,
        newRegistryDigest: newRegistryDigest!,
        recoveryRoleEvidence: recoveryRoleEvidence!,
      }
      : {}),
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

function validateRecoveryRoleEvidencePaths(
  workspace: AssetWorkspace,
  journal: AssetPackTransactionJournal,
): void {
  if (journal.recoveryMode === undefined) return;
  const evidence = journal.recoveryRoleEvidence;
  if (evidence === undefined) {
    throw new Error('Asset transaction recovery role evidence is missing.');
  }
  const expected = journal.recoveryMode === 'rollback'
    ? [
      ...(journal.finalInstalledSource
        ? [`published-installed-source:${journal.finalInstalledSource}`]
        : []),
      ...(journal.incomingInstalledSource
        ? [`incoming-installed-source:${journal.incomingInstalledSource}`]
        : []),
      ...(journal.createdInstalledParents ?? []).map((entry) =>
        `created-installed-parent:${entry}`),
    ]
    : [
      ...journal.cleanupInstalledSources.map((entry) =>
        `cleanup-installed-source:${entry}`),
      ...(journal.incomingInstalledSource
        ? [`incoming-installed-source:${journal.incomingInstalledSource}`]
        : []),
    ];
  const actual = evidence.map((entry) => `${entry.role}:${entry.path}`);
  if (JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error('Asset transaction recovery role evidence does not match its mutation roles.');
  }
  for (const entry of evidence) {
    resolveRelativePath(
      workspace,
      entry.path,
      'Asset transaction recovery role evidence path',
    );
    if (!entry.present) continue;
    resolveRelativePath(
      workspace,
      entry.initialPath,
      'Asset transaction recovery role evidence initialPath',
    );
    if (entry.role === 'published-installed-source') {
      if (
        entry.initialPath !== journal.stagedInstalledSource
        && entry.initialPath !== journal.finalInstalledSource
      ) {
        throw new Error(
          'Asset transaction published installed-source evidence has an invalid initial path.',
        );
      }
    } else if (entry.initialPath !== entry.path) {
      throw new Error('Asset transaction recovery role evidence initial path is invalid.');
    }
  }
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
  const incomingInstalledSource = journal.incomingInstalledSource === undefined
    ? undefined
    : resolveRelativePath(
      workspace,
      journal.incomingInstalledSource,
      'Asset transaction incomingInstalledSource',
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
  const createdInstalledParents = (journal.createdInstalledParents ?? []).map((entry) =>
    resolveRelativePath(workspace, entry, 'Asset transaction createdInstalledParents entry'));

  assertExactPath(
    oldOutputBackup,
    transactionSiblingPath(workspace.outputRoot, journal.operationId, 'backup'),
    'Asset transaction oldOutputBackup',
  );
  if (oldRegistryBackup) {
    assertExactPath(
      oldRegistryBackup,
      transactionSiblingPath(workspace.registryPath, journal.operationId, 'backup'),
      'Asset transaction oldRegistryBackup',
    );
  }
  assertExactPath(
    stagedOutput,
    transactionSiblingPath(workspace.outputRoot, journal.operationId, 'staged'),
    'Asset transaction stagedOutput',
  );
  assertExactPath(
    stagedRegistry,
    transactionSiblingPath(workspace.registryPath, journal.operationId, 'staged'),
    'Asset transaction stagedRegistry',
  );
  assertContainedChild(path.join(workspace.stateRoot, 'transactions'), transactionRoot, 'Asset transaction data');
  assertContainedChild(workspace.root, stagedOutput, 'Asset transaction stagedOutput');
  assertContainedChild(workspace.root, oldOutputBackup, 'Asset transaction oldOutputBackup');
  assertContainedChild(workspace.stateRoot, stagedRegistry, 'Asset transaction stagedRegistry');
  if (oldRegistryBackup) {
    assertContainedChild(
      workspace.stateRoot,
      oldRegistryBackup,
      'Asset transaction oldRegistryBackup',
    );
  }
  if (incomingInstalledSource) {
    assertContainedChild(
      path.join(workspace.stateRoot, 'staging'),
      incomingInstalledSource,
      'Asset transaction incomingInstalledSource',
    );
  }
  if (stagedInstalledSource) {
    if (!finalInstalledSource) {
      throw new Error('Asset transaction staged installed source has no final path.');
    }
    assertExactPath(
      stagedInstalledSource,
      transactionSiblingPath(finalInstalledSource, journal.operationId, 'staged'),
      'Asset transaction stagedInstalledSource',
    );
    assertContainedChild(
      installedRoot,
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
    const allowedCreatedParents = [
      path.dirname(finalInstalledSource),
      path.dirname(path.dirname(finalInstalledSource)),
    ];
    if (
      JSON.stringify(createdInstalledParents)
      !== JSON.stringify(allowedCreatedParents.slice(0, createdInstalledParents.length))
    ) {
      throw new Error(
        'Asset transaction created installed parents must be exact deepest-first final-source ancestors.',
      );
    }
  } else if (createdInstalledParents.length > 0) {
    throw new Error('Asset transaction created installed parents have no final source.');
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
  validateRecoveryRoleEvidencePaths(workspace, journal);

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
  if (incomingInstalledSource) {
    assertDirectoryIfPresent(
      incomingInstalledSource,
      'Asset transaction incoming installed source',
    );
  }
  if (stagedInstalledSource) {
    assertDirectoryIfPresent(stagedInstalledSource, 'Asset transaction staged installed source');
  }
  if (finalInstalledSource) {
    assertDirectoryIfPresent(finalInstalledSource, 'Asset transaction final installed source');
  }
  cleanupInstalledSources.forEach((entry) =>
    assertDirectoryIfPresent(entry, 'Asset transaction cleanup installed source'));
  createdInstalledParents.forEach((entry) =>
    assertDirectoryIfPresent(entry, 'Asset transaction created installed parent'));

  const outputRoles = [workspace.outputRoot, oldOutputBackup, stagedOutput];
  const presentOutputRoles = outputRoles.filter((root) => pathEntryExists(root));
  if (presentOutputRoles.length === 0) {
    throw new Error('Asset transaction has no managed output role present.');
  }
  for (const root of presentOutputRoles) {
    const markerId = readOutputWorkspaceId(root, fileOps);
    if (markerId === undefined || markerId !== journal.workspaceId) {
      throw new Error(
        `Asset transaction output role is not owned by this workspace: ${root}`,
      );
    }
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
    ...(incomingInstalledSource ? { incomingInstalledSource } : {}),
    ...(stagedInstalledSource ? { stagedInstalledSource } : {}),
    ...(finalInstalledSource ? { finalInstalledSource } : {}),
    cleanupInstalledSources,
    createdInstalledParents,
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

function authenticatePendingOutput(
  workspace: AssetWorkspace,
  outputRoot: string,
  registryPath: string,
  workspaceId: string,
  fileOps: AssetTransactionFileOps,
): void {
  assertDirectoryIfPresent(outputRoot, 'Asset transaction pending output');
  if (!pathEntryExists(outputRoot)) {
    throw new Error(`Asset transaction pending output is missing: ${outputRoot}`);
  }
  assertNoExistingSymlink(workspace.root, outputRoot, 'Asset transaction pending output');
  assertNoExistingSymlink(workspace.stateRoot, registryPath, 'Asset transaction pending registry');
  assertRegularFileIfPresent(registryPath, 'Asset transaction pending registry');
  const parsed = JSON.parse(fileOps.readFileSync(registryPath).toString('utf8')) as unknown;
  if (!isRecord(parsed)
    || (
      parsed.schema !== ASSET_WORKSPACE_REGISTRY_SCHEMA
      && parsed.schema !== ASSET_WORKSPACE_REGISTRY_V1_SCHEMA
    )
    || parsed.workspaceId !== workspaceId
    || !isRecord(parsed.generatedDigests)) {
    throw new Error('Asset transaction pending registry identity is invalid.');
  }
  const generatedDigests: Record<string, string> = {};
  for (const [logicalPath, digest] of Object.entries(parsed.generatedDigests)) {
    if (typeof digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(digest)) {
      throw new Error(
        `Asset transaction pending registry generated digest is invalid: ${logicalPath}`,
      );
    }
    generatedDigests[logicalPath] = digest;
  }
  const markerPath = path.join(outputRoot, OUTPUT_MARKER_FILE);
  const markerBytes = fileOps.readFileSync(markerPath);
  if (readOutputWorkspaceId(outputRoot, fileOps) !== workspaceId) {
    throw new Error('Asset transaction pending output marker is invalid.');
  }
  const audit = auditPublishedManagedOutput({
    workspace: { ...workspace, outputRoot, registryPath },
    markerBytes,
    generatedDigests,
  });
  if (audit) throw new Error(audit.message);
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
  readonly oldRegistryPath: string;
  readonly newRegistryPath?: string;
  readonly registryPublished: boolean;
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

  let registryPublished: boolean;
  let oldRegistryPath: string;
  let newRegistryPath: string;
  if (resolved.oldRegistryBackup) {
    if (hasActiveRegistry && !hasStagedRegistry && hasRegistryBackup) {
      registryPublished = true;
      oldRegistryPath = resolved.oldRegistryBackup;
      newRegistryPath = workspace.registryPath;
    } else if (hasActiveRegistry && hasStagedRegistry && !hasRegistryBackup) {
      registryPublished = false;
      oldRegistryPath = workspace.registryPath;
      newRegistryPath = resolved.stagedRegistry;
    } else if (!hasActiveRegistry && hasStagedRegistry && hasRegistryBackup) {
      registryPublished = false;
      oldRegistryPath = resolved.oldRegistryBackup;
      newRegistryPath = resolved.stagedRegistry;
    } else {
      throw new Error('Transaction registry layout is incomplete or ambiguous.');
    }
  } else if (hasActiveRegistry && !hasStagedRegistry && !hasRegistryBackup) {
    registryPublished = true;
    oldRegistryPath = path.join(resolved.transactionRoot, 'old-registry-absent');
    newRegistryPath = workspace.registryPath;
  } else if (!hasActiveRegistry && hasStagedRegistry && !hasRegistryBackup) {
    registryPublished = false;
    oldRegistryPath = workspace.registryPath;
    newRegistryPath = resolved.stagedRegistry;
  } else {
    throw new Error('Transaction registry layout is incomplete or ambiguous.');
  }

  if (resolved.journal.phase === 'registry-published' && !registryPublished) {
    throw new Error('Registry-published transaction does not have its active registry.');
  }

  if (registryPublished) {
    if (!hasOutputBackup || !hasActiveOutput || hasStagedOutput) {
      throw new Error('Committed transaction output layout is incomplete or ambiguous.');
    }
    if (resolved.finalInstalledSource && (!hasFinalSource || hasStagedSource)) {
      throw new Error('Committed installed source state is incomplete or ambiguous.');
    }
    const oldGeneration = authenticateGeneration(
      workspace,
      resolved.oldOutputBackup,
      oldRegistryPath,
      fileOps,
      true,
    );
    const newGeneration = authenticateGeneration(
      workspace,
      workspace.outputRoot,
      newRegistryPath,
      fileOps,
    );
    assertInstalledDelta(resolved, oldGeneration, newGeneration);
    return {
      oldGeneration,
      newGeneration,
      oldRegistryPath,
      newRegistryPath,
      registryPublished: true,
    };
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
    oldRegistryPath,
    fileOps,
    true,
  );
  let newGeneration: AuthenticatedGeneration | undefined;
  if (hasStagedRegistry) {
    const newOutputPath = hasStagedOutput
      ? resolved.stagedOutput
      : hasOutputBackup && hasActiveOutput
        ? workspace.outputRoot
        : undefined;
    if (newOutputPath) {
      if (hasFinalSource) {
        newGeneration = authenticateGeneration(
          workspace,
          newOutputPath,
          resolved.stagedRegistry,
          fileOps,
        );
        assertInstalledDelta(resolved, oldGeneration, newGeneration);
      } else {
        authenticatePendingOutput(
          workspace,
          newOutputPath,
          resolved.stagedRegistry,
          resolved.journal.workspaceId,
          fileOps,
        );
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
    } else {
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
  }
  if (hasFinalSource) {
    if (!hasStagedRegistry || !hasActiveOutput || !hasOutputBackup) {
      throw new Error('Published source cannot be authenticated against a staged new generation.');
    }
    newGeneration ??= authenticateGeneration(
      workspace,
      workspace.outputRoot,
      resolved.stagedRegistry,
      fileOps,
    );
    assertInstalledDelta(resolved, oldGeneration, newGeneration);
    return {
      oldGeneration,
      newGeneration,
      oldRegistryPath,
      newRegistryPath,
      registryPublished: false,
    };
  }
  return {
    oldGeneration,
    ...(newGeneration ? { newGeneration } : {}),
    oldRegistryPath,
    newRegistryPath,
    registryPublished: false,
  };
}

function digestFileOrAbsent(
  target: string | undefined,
  fileOps: AssetTransactionFileOps,
): string {
  if (target === undefined || !pathEntryExists(target)) return 'absent';
  return `sha256:${createHash('sha256').update(fileOps.readFileSync(target)).digest('hex')}`;
}

function authenticatedDirectoryDigest(
  root: string,
  fileOps: AssetTransactionFileOps,
): string {
  const rootIdentity = pathEntryIdentity(root, fileOps);
  if (!rootIdentity.present || rootIdentity.type !== 'directory') {
    throw new Error(`Asset transaction recovery role is not a directory: ${root}`);
  }
  const digest = createHash('sha256');
  const visit = (directory: string, relativeDirectory: string): void => {
    const directoryEntry = pathEntryIdentity(directory, fileOps);
    if (!directoryEntry.present || directoryEntry.type !== 'directory') {
      throw new Error(`Asset transaction recovery role contains an unsafe directory: ${directory}`);
    }
    digest.update('directory\0');
    digest.update(relativeDirectory);
    digest.update('\0');
    for (const name of readdirSync(directory).sort()) {
      const target = path.join(directory, name);
      const relative = relativeDirectory.length === 0
        ? name
        : `${relativeDirectory}/${name}`;
      const before = pathEntryIdentity(target, fileOps);
      if (!before.present || before.type === 'symlink' || before.type === 'other') {
        throw new Error(`Asset transaction recovery role contains an unsafe entry: ${target}`);
      }
      if (before.type === 'directory') {
        visit(target, relative);
      } else {
        const bytes = Buffer.from(fileOps.readFileSync(target));
        const after = pathEntryIdentity(target, fileOps);
        if (!samePathEntryIdentity(before, after)) {
          throw new Error(`Asset transaction recovery role entry changed during authentication: ${target}`);
        }
        digest.update('file\0');
        digest.update(relative);
        digest.update('\0');
        digest.update(String(bytes.length));
        digest.update('\0');
        digest.update(bytes);
      }
    }
  };
  visit(root, '');
  if (!samePathEntryIdentity(rootIdentity, pathEntryIdentity(root, fileOps))) {
    throw new Error(`Asset transaction recovery role changed during authentication: ${root}`);
  }
  return `sha256:${digest.digest('hex')}`;
}

function captureRecoveryRoleEvidence(options: {
  readonly role: AssetPackRecoveryRoleEvidence['role'];
  readonly path: string;
  readonly candidates: readonly {
    readonly relativePath: string;
    readonly absolutePath: string;
  }[];
  readonly fileOps: AssetTransactionFileOps;
}): AssetPackRecoveryRoleEvidence {
  const present = options.candidates.filter((candidate) => pathEntryExists(candidate.absolutePath));
  if (present.length > 1) {
    throw new Error(`Asset transaction recovery role has multiple active paths: ${options.path}`);
  }
  const candidate = present[0];
  if (!candidate) {
    return { role: options.role, path: options.path, present: false };
  }
  const identity = pathEntryIdentity(candidate.absolutePath, options.fileOps);
  if (!identity.present || identity.type !== 'directory') {
    throw new Error(`Asset transaction recovery role is not a directory: ${candidate.absolutePath}`);
  }
  const contentDigest = authenticatedDirectoryDigest(candidate.absolutePath, options.fileOps);
  if (!samePathEntryIdentity(identity, pathEntryIdentity(candidate.absolutePath, options.fileOps))) {
    throw new Error(
      `Asset transaction recovery role changed while authorization was recorded: ${candidate.absolutePath}`,
    );
  }
  return {
    role: options.role,
    path: options.path,
    present: true,
    initialPath: candidate.relativePath,
    device: identity.device,
    inode: identity.inode,
    type: 'directory',
    contentDigest,
  };
}

function recoveryRoleEvidenceForAuthorization(
  resolved: ResolvedJournal,
  mode: 'rollback' | 'cleanup',
  fileOps: AssetTransactionFileOps,
): readonly AssetPackRecoveryRoleEvidence[] {
  const evidence: AssetPackRecoveryRoleEvidence[] = [];
  if (
    mode === 'rollback'
    && resolved.journal.finalInstalledSource
    && resolved.finalInstalledSource
    && resolved.journal.stagedInstalledSource
    && resolved.stagedInstalledSource
  ) {
    evidence.push(captureRecoveryRoleEvidence({
      role: 'published-installed-source',
      path: resolved.journal.finalInstalledSource,
      candidates: [
        {
          relativePath: resolved.journal.stagedInstalledSource,
          absolutePath: resolved.stagedInstalledSource,
        },
        {
          relativePath: resolved.journal.finalInstalledSource,
          absolutePath: resolved.finalInstalledSource,
        },
      ],
      fileOps,
    }));
  }
  if (
    resolved.journal.incomingInstalledSource
    && resolved.incomingInstalledSource
  ) {
    evidence.push(captureRecoveryRoleEvidence({
      role: 'incoming-installed-source',
      path: resolved.journal.incomingInstalledSource,
      candidates: [{
        relativePath: resolved.journal.incomingInstalledSource,
        absolutePath: resolved.incomingInstalledSource,
      }],
      fileOps,
    }));
  }
  if (mode === 'rollback') {
    resolved.createdInstalledParents.forEach((absolutePath, index) => {
      const relativePath = resolved.journal.createdInstalledParents?.[index];
      if (!relativePath) {
        throw new Error('Asset transaction created installed parent path is missing.');
      }
      evidence.push(captureRecoveryRoleEvidence({
        role: 'created-installed-parent',
        path: relativePath,
        candidates: [{ relativePath, absolutePath }],
        fileOps,
      }));
    });
  }
  if (mode === 'cleanup') {
    resolved.cleanupInstalledSources.forEach((absolutePath, index) => {
      const relativePath = resolved.journal.cleanupInstalledSources[index]!;
      evidence.push(captureRecoveryRoleEvidence({
        role: 'cleanup-installed-source',
        path: relativePath,
        candidates: [{ relativePath, absolutePath }],
        fileOps,
      }));
    });
  }
  return evidence;
}

function assertDigestIfPresent(
  target: string,
  expected: string,
  fileOps: AssetTransactionFileOps,
  label: string,
): void {
  if (!pathEntryExists(target)) return;
  const actual = digestFileOrAbsent(target, fileOps);
  if (actual !== expected) throw new Error(`${label} digest changed during recovery.`);
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

function livePidFromMalformedClaim(
  claimPath: string,
  fileOps: AssetTransactionFileOps,
): number | undefined {
  try {
    const parsed = JSON.parse(fileOps.readFileSync(claimPath).toString('utf8')) as unknown;
    if (
      isRecord(parsed)
      && Number.isSafeInteger(parsed.pid)
      && (parsed.pid as number) > 0
    ) {
      return parsed.pid as number;
    }
  } catch {
    // Empty and partial legacy claims do not identify a live owner.
  }
  return undefined;
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
  withPinnedWorkingDirectory({
    guard,
    parent: path.dirname(claimPath),
    operation: 'remove',
    paths: [claimPath],
    action: () => {
      const relativeClaim = path.basename(claimPath);
      const actual = claimIdentity(relativeClaim, guard.fileOps);
      if (!sameIdentity(actual, expected)) {
        throw new Error('Asset transaction claim identity changed before release.');
      }
      guard.fileOps.rmSync(relativeClaim, { force: false });
      guard.fileOps.afterMutationSync?.('remove', [claimPath], 'mutation');
      fsyncCurrentDirectory(guard.fileOps);
      guard.fileOps.afterMutationSync?.('remove', [claimPath], 'fsync');
    },
  });
}

function acquireTransactionClaim(
  workspace: AssetWorkspace,
  fileOps: AssetTransactionFileOps,
  operationId = randomUUID(),
): TransactionClaim {
  const guard = createMutationGuard(workspace, fileOps);
  const claimPath = path.join(workspace.stateRoot, CLAIM_FILE);
  const claimTemporaryPath = `${claimPath}.${operationId}.tmp`;
  const workspaceId = workspaceIdForClaim(workspace, fileOps);
  assertNoExistingSymlink(workspace.stateRoot, claimPath, 'Asset transaction claim');
  assertNoExistingSymlink(
    workspace.stateRoot,
    claimTemporaryPath,
    'Asset transaction claim temp',
  );
  const claimBytes = Buffer.from(`${JSON.stringify({
    schema: ASSET_PACK_TRANSACTION_SCHEMA,
    workspaceId,
    operationId,
    pid: process.pid,
  })}\n`);
  durableWrite(workspace.stateRoot, claimTemporaryPath, claimBytes, guard);
  let claimPublished = false;
  try {
    withPinnedWorkingDirectory({
      guard,
      parent: workspace.stateRoot,
      operation: 'write',
      paths: [claimTemporaryPath, claimPath],
      action: () => {
        fileOps.linkSync(path.basename(claimTemporaryPath), path.basename(claimPath));
        claimPublished = true;
        fileOps.afterMutationSync?.(
          'write',
          [claimTemporaryPath, claimPath],
          'mutation',
        );
        fsyncCurrentDirectory(fileOps);
        fileOps.afterMutationSync?.(
          'write',
          [claimTemporaryPath, claimPath],
          'fsync',
        );
      },
    });
  } catch (error) {
    if (isNodeError(error) && error.code === 'EEXIST') {
      const existingIdentity = claimIdentity(claimPath, fileOps);
      let existing: TransactionClaimRecord | undefined;
      try {
        existing = readClaimRecord(workspace, claimPath, fileOps, workspaceId);
      } catch (claimError) {
        const pid = livePidFromMalformedClaim(claimPath, fileOps);
        if (pid !== undefined && processIsAlive(pid)) {
          try {
            removeListedPath(workspace.stateRoot, claimTemporaryPath, false, guard);
          } catch {
            // The live foreign claim diagnostic remains primary.
          }
          throw new Error(
            `Another asset lifecycle transaction owns this workspace: ${errorMessage(claimError)}`,
          );
        }
      }
      if (existing && processIsAlive(existing.pid)) {
        try {
          removeListedPath(workspace.stateRoot, claimTemporaryPath, false, guard);
        } catch {
          // The live claim diagnostic remains primary.
        }
        throw new Error('Another asset lifecycle transaction already owns this workspace.');
      }
      removeClaimWithIdentity(claimPath, existingIdentity, guard);
      removeListedPath(workspace.stateRoot, claimTemporaryPath, false, guard);
      return acquireTransactionClaim(workspace, fileOps, operationId);
    }
    try {
      removeListedPath(workspace.stateRoot, claimTemporaryPath, false, guard);
    } catch {
      // The claim publication diagnostic remains primary.
    }
    if (claimPublished && pathEntryExists(claimPath)) {
      try {
        removeClaimWithIdentity(claimPath, claimIdentity(claimPath, fileOps), guard);
      } catch {
        // The claim publication diagnostic remains primary.
      }
    }
    throw error;
  }
  try {
    removeListedPath(workspace.stateRoot, claimTemporaryPath, false, guard);
    const claim: TransactionClaim = {
      operationId,
      path: claimPath,
      stateRoot: workspace.stateRoot,
      workspace,
      workspaceId,
      identity: claimIdentity(claimPath, fileOps),
      guard,
    };
    fileOps.afterClaimAcquiredSync?.();
    return claim;
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
    withPinnedWorkingDirectory({
      guard,
      parent,
      operation: 'mkdir',
      paths: [current],
      action: () => {
        guard.fileOps.mkdirSync(path.basename(current));
        guard.fileOps.afterMutationSync?.('mkdir', [current], 'mutation');
        fsyncCurrentDirectory(guard.fileOps);
        guard.fileOps.afterMutationSync?.('mkdir', [current], 'fsync');
      },
    });
    rememberDirectory(guard, current);
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
  withPinnedWorkingDirectory({
    guard,
    parent: path.dirname(target),
    operation: 'write',
    paths: [target],
    action: () => {
      const relativeTarget = path.basename(target);
      guard.fileOps.writeFileSync(relativeTarget, bytes, { flag: 'wx', mode: 0o600 });
      guard.fileOps.afterMutationSync?.('write', [target], 'mutation');
      fsyncFile(relativeTarget, guard.fileOps);
      fsyncCurrentDirectory(guard.fileOps);
      guard.fileOps.afterMutationSync?.('write', [target], 'fsync');
    },
  });
}

function durableRename(
  source: string,
  destination: string,
  guard: MutationGuard,
): void {
  const sourceParent = path.dirname(source);
  const destinationParent = path.dirname(destination);
  if (path.resolve(sourceParent) !== path.resolve(destinationParent)) {
    throw new Error(
      `Asset transaction rename must stay within one authenticated directory: ${source} -> ${destination}`,
    );
  }
  rememberExistingAncestors(guard, guard.workspaceRoot, sourceParent);
  withPinnedWorkingDirectory({
    guard,
    parent: sourceParent,
    operation: 'rename',
    paths: [source, destination],
    childPaths: [source, destination],
    action: () => {
      guard.fileOps.renameSync(path.basename(source), path.basename(destination));
      guard.fileOps.afterMutationSync?.('rename', [source, destination], 'mutation');
      fsyncCurrentDirectory(guard.fileOps);
    },
  });
  forgetPath(guard, source);
  guard.fileOps.afterMutationSync?.('rename', [source, destination], 'fsync');
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
  if (!pathEntryExists(target)) {
    if (pathEntryExists(path.dirname(target))) {
      fsyncDirectory(path.dirname(target), guard.fileOps);
    }
    return;
  }
  assertNoExistingSymlink(root, target, 'Asset transaction cleanup path');
  rememberExistingAncestors(guard, root, target);
  withPinnedWorkingDirectory({
    guard,
    parent: path.dirname(target),
    operation: 'remove',
    paths: [target],
    childPaths: [target],
    action: () => {
      const name = path.basename(target);
      const stats = transactionLstat(name, guard.fileOps);
      if (!recursive && stats.isDirectory()) {
        (guard.fileOps.rmdirSync ?? rmdirSync)(name);
      } else {
        guard.fileOps.rmSync(name, { recursive, force: true });
      }
      guard.fileOps.afterMutationSync?.('remove', [target], 'mutation');
      fsyncCurrentDirectory(guard.fileOps);
      guard.fileOps.afterMutationSync?.('remove', [target], 'fsync');
    },
  });
  forgetPath(guard, target);
}

interface RemoveRecoveryMutation {
  readonly kind: 'remove';
  readonly root: string;
  readonly target: string;
  readonly recursive: boolean;
  readonly onlyWhenPresent?: string;
}

interface RenameRecoveryMutation {
  readonly kind: 'rename';
  readonly source: string;
  readonly destination: string;
}

type RecoveryMutation = RemoveRecoveryMutation | RenameRecoveryMutation;

function rollbackMutations(
  resolved: ResolvedJournal,
  workspace: AssetWorkspace,
): readonly RecoveryMutation[] {
  return [
    ...(resolved.oldRegistryBackup
      ? [
        {
          kind: 'remove',
          root: workspace.stateRoot,
          target: workspace.registryPath,
          recursive: false,
          onlyWhenPresent: resolved.oldRegistryBackup,
        },
        { kind: 'rename', source: resolved.oldRegistryBackup, destination: workspace.registryPath },
      ] as const
      : []),
    {
      kind: 'remove',
      root: workspace.root,
      target: workspace.outputRoot,
      recursive: true,
      onlyWhenPresent: resolved.oldOutputBackup,
    },
    { kind: 'rename', source: resolved.oldOutputBackup, destination: workspace.outputRoot },
    ...(resolved.finalInstalledSource
      ? [{
        kind: 'remove',
        root: path.join(workspace.stateRoot, 'installed'),
        target: resolved.finalInstalledSource,
        recursive: true,
      }] as const
      : []),
    {
      kind: 'remove',
      root: workspace.root,
      target: resolved.stagedOutput,
      recursive: true,
    },
    {
      kind: 'remove',
      root: workspace.stateRoot,
      target: resolved.stagedRegistry,
      recursive: false,
    },
    ...(resolved.stagedInstalledSource
      ? [{
        kind: 'remove',
        root: path.join(workspace.stateRoot, 'installed'),
        target: resolved.stagedInstalledSource,
        recursive: true,
      }] as const
      : []),
    ...(resolved.incomingInstalledSource
      ? [{
        kind: 'remove',
        root: path.join(workspace.stateRoot, 'staging'),
        target: resolved.incomingInstalledSource,
        recursive: true,
      }] as const
      : []),
    ...resolved.createdInstalledParents.map((target): RecoveryMutation => ({
      kind: 'remove',
      root: path.join(workspace.stateRoot, 'installed'),
      target,
      recursive: false,
    })),
    {
      kind: 'remove',
      root: workspace.stateRoot,
      target: resolved.journalTemporaryPath,
      recursive: false,
    },
  ];
}

function cleanupMutations(
  resolved: ResolvedJournal,
  workspace: AssetWorkspace,
): readonly RecoveryMutation[] {
  return [
    ...resolved.cleanupInstalledSources.map((target): RecoveryMutation => ({
      kind: 'remove',
      root: path.join(workspace.stateRoot, 'installed'),
      target,
      recursive: true,
    })),
    {
      kind: 'remove',
      root: workspace.root,
      target: resolved.stagedOutput,
      recursive: true,
    },
    {
      kind: 'remove',
      root: workspace.stateRoot,
      target: resolved.stagedRegistry,
      recursive: false,
    },
    ...(resolved.stagedInstalledSource
      ? [{
        kind: 'remove',
        root: path.join(workspace.stateRoot, 'installed'),
        target: resolved.stagedInstalledSource,
        recursive: true,
      }] as const
      : []),
    ...(resolved.incomingInstalledSource
      ? [{
        kind: 'remove',
        root: path.join(workspace.stateRoot, 'staging'),
        target: resolved.incomingInstalledSource,
        recursive: true,
      }] as const
      : []),
    {
      kind: 'remove',
      root: workspace.root,
      target: resolved.oldOutputBackup,
      recursive: true,
    },
    ...(resolved.oldRegistryBackup
      ? [{
        kind: 'remove',
        root: workspace.stateRoot,
        target: resolved.oldRegistryBackup,
        recursive: false,
      }] as const
      : []),
    {
      kind: 'remove',
      root: workspace.stateRoot,
      target: resolved.journalTemporaryPath,
      recursive: false,
    },
  ];
}

type RecoveryPresence = ReadonlyMap<string, boolean>;

function recoveryPathKey(target: string): string {
  return path.resolve(target);
}

function setRecoveryPresence(
  presence: Map<string, boolean>,
  target: string | undefined,
  present: boolean,
): void {
  if (target !== undefined) presence.set(recoveryPathKey(target), present);
}

function recoveryRoleEvidenceEntry(
  journal: AssetPackTransactionJournal,
  role: AssetPackRecoveryRoleEvidence['role'],
  rolePath: string,
): AssetPackRecoveryRoleEvidence {
  const evidence = journal.recoveryRoleEvidence?.find((entry) =>
    entry.role === role && entry.path === rolePath);
  if (!evidence) {
    throw new Error(`Asset transaction recovery role evidence is missing: ${role}:${rolePath}`);
  }
  return evidence;
}

function initialRecoveryPresences(
  resolved: ResolvedJournal,
  workspace: AssetWorkspace,
  mutations: readonly RecoveryMutation[],
): readonly Map<string, boolean>[] {
  const base = new Map<string, boolean>();
  for (const mutation of mutations) {
    if (mutation.kind === 'remove') {
      setRecoveryPresence(base, mutation.target, false);
      setRecoveryPresence(base, mutation.onlyWhenPresent, false);
    } else {
      setRecoveryPresence(base, mutation.source, false);
      setRecoveryPresence(base, mutation.destination, false);
    }
  }

  if (resolved.journal.recoveryMode === 'cleanup') {
    const presence = new Map(base);
    setRecoveryPresence(presence, workspace.outputRoot, true);
    setRecoveryPresence(presence, resolved.oldOutputBackup, true);
    setRecoveryPresence(presence, resolved.stagedOutput, false);
    setRecoveryPresence(presence, workspace.registryPath, true);
    setRecoveryPresence(presence, resolved.oldRegistryBackup, true);
    setRecoveryPresence(presence, resolved.stagedRegistry, false);
    setRecoveryPresence(presence, resolved.finalInstalledSource, true);
    setRecoveryPresence(presence, resolved.stagedInstalledSource, false);
    if (resolved.journal.incomingInstalledSource) {
      const incoming = recoveryRoleEvidenceEntry(
        resolved.journal,
        'incoming-installed-source',
        resolved.journal.incomingInstalledSource,
      );
      setRecoveryPresence(presence, resolved.incomingInstalledSource, incoming.present);
    }
    resolved.cleanupInstalledSources.forEach((cleanupSource, index) => {
      const cleanup = recoveryRoleEvidenceEntry(
        resolved.journal,
        'cleanup-installed-source',
        resolved.journal.cleanupInstalledSources[index]!,
      );
      setRecoveryPresence(presence, cleanupSource, cleanup.present);
    });
    setRecoveryPresence(presence, resolved.journalTemporaryPath, false);
    return [presence];
  }

  setRecoveryPresence(base, resolved.journalTemporaryPath, false);

  const registryLayouts = resolved.oldRegistryBackup
    ? [
      { active: true, backup: false, staged: true },
      { active: false, backup: true, staged: true },
    ] as const
    : [{ active: false, backup: false, staged: true }] as const;

  const outputLayouts = [
    { active: true, backup: false, staged: true },
    { active: false, backup: true, staged: true },
    { active: true, backup: true, staged: false },
  ] as const;
  const installedLayouts = resolved.finalInstalledSource
    && resolved.journal.finalInstalledSource
    && resolved.journal.stagedInstalledSource
    ? (() => {
      const published = recoveryRoleEvidenceEntry(
        resolved.journal,
        'published-installed-source',
        resolved.journal.finalInstalledSource!,
      );
      if (!published.present) return [{ final: false, staged: false }] as const;
      if (published.initialPath === resolved.journal.finalInstalledSource) {
        return [{ final: true, staged: false }] as const;
      }
      return [
        { final: false, staged: true },
        { final: true, staged: false },
      ] as const;
    })()
    : [{ final: false, staged: false }] as const;
  const incomingPresent = resolved.incomingInstalledSource
    && resolved.journal.incomingInstalledSource
    ? recoveryRoleEvidenceEntry(
      resolved.journal,
      'incoming-installed-source',
      resolved.journal.incomingInstalledSource,
    ).present
    : false;
  const createdParentPresences = resolved.createdInstalledParents.map((parent, index) => {
    const relativePath = resolved.journal.createdInstalledParents?.[index];
    if (!relativePath) {
      throw new Error('Asset transaction created installed parent path is missing.');
    }
    return {
      parent,
      present: recoveryRoleEvidenceEntry(
        resolved.journal,
        'created-installed-parent',
        relativePath,
      ).present,
    };
  });
  const variants: Map<string, boolean>[] = [];
  for (const registryLayout of registryLayouts) {
    for (const outputLayout of outputLayouts) {
      for (const installedLayout of installedLayouts) {
        const presence = new Map(base);
        setRecoveryPresence(presence, workspace.registryPath, registryLayout.active);
        setRecoveryPresence(presence, resolved.oldRegistryBackup, registryLayout.backup);
        setRecoveryPresence(presence, resolved.stagedRegistry, registryLayout.staged);
        setRecoveryPresence(presence, workspace.outputRoot, outputLayout.active);
        setRecoveryPresence(presence, resolved.oldOutputBackup, outputLayout.backup);
        setRecoveryPresence(presence, resolved.stagedOutput, outputLayout.staged);
        setRecoveryPresence(
          presence,
          resolved.finalInstalledSource,
          installedLayout.final,
        );
        setRecoveryPresence(
          presence,
          resolved.stagedInstalledSource,
          installedLayout.staged,
        );
        setRecoveryPresence(
          presence,
          resolved.incomingInstalledSource,
          incomingPresent,
        );
        for (const parent of createdParentPresences) {
          setRecoveryPresence(presence, parent.parent, parent.present);
        }
        variants.push(presence);
      }
    }
  }
  return variants;
}

function applyRecoveryPresenceMutation(
  current: RecoveryPresence,
  mutation: RecoveryMutation,
): Map<string, boolean> {
  const next = new Map(current);
  if (mutation.kind === 'remove') {
    if (
      mutation.onlyWhenPresent
      && next.get(recoveryPathKey(mutation.onlyWhenPresent)) !== true
    ) {
      return next;
    }
    next.set(recoveryPathKey(mutation.target), false);
    return next;
  }
  const source = recoveryPathKey(mutation.source);
  const destination = recoveryPathKey(mutation.destination);
  const hasSource = next.get(source) === true;
  const hasDestination = next.get(destination) === true;
  if (hasSource && !hasDestination) {
    next.set(source, false);
    next.set(destination, true);
    return next;
  }
  if (!hasSource && hasDestination) return next;
  throw new Error('Asset transaction recovery transition table is internally inconsistent.');
}

function recoveryPresenceMatches(
  expected: RecoveryPresence,
  resolved: ResolvedJournal,
): boolean {
  for (const [target, present] of expected) {
    if (target === recoveryPathKey(resolved.journalTemporaryPath)) continue;
    if (pathEntryExists(target) !== present) return false;
  }
  return true;
}

function validateRecoveryCursorState(
  resolved: ResolvedJournal,
  workspace: AssetWorkspace,
  mutations: readonly RecoveryMutation[],
): void {
  const cursor = resolved.journal.recoveryCursor;
  if (cursor === undefined || cursor > mutations.length) {
    throw new Error('Asset transaction recovery cursor is outside its transition table.');
  }
  for (const initial of initialRecoveryPresences(resolved, workspace, mutations)) {
    const states: Map<string, boolean>[] = [initial];
    for (const mutation of mutations) {
      states.push(applyRecoveryPresenceMutation(states.at(-1)!, mutation));
    }
    const current = states[cursor]!;
    const afterCurrent = cursor < mutations.length ? states[cursor + 1] : undefined;
    if (
      recoveryPresenceMatches(current, resolved)
      || (afterCurrent !== undefined && recoveryPresenceMatches(afterCurrent, resolved))
    ) {
      return;
    }
  }
  throw new Error(
    'Asset transaction recovery cursor does not match its exact filesystem state.',
  );
}

function executeRecoveryMutation(
  mutation: RecoveryMutation,
  guard: MutationGuard,
): void {
  if (mutation.kind === 'remove') {
    if (mutation.onlyWhenPresent && !pathEntryExists(mutation.onlyWhenPresent)) {
      fsyncDirectory(path.dirname(mutation.target), guard.fileOps);
      return;
    }
    removeListedPath(
      mutation.root,
      mutation.target,
      mutation.recursive,
      guard,
    );
    return;
  }
  const hasSource = pathEntryExists(mutation.source);
  const hasDestination = pathEntryExists(mutation.destination);
  if (hasSource && hasDestination) {
    throw new Error('Asset transaction recovery rename has both source and destination present.');
  }
  if (!hasSource) {
    if (!hasDestination) {
      throw new Error('Asset transaction recovery rename has neither source nor destination present.');
    }
    fsyncDirectory(path.dirname(mutation.source), guard.fileOps);
    fsyncDirectory(path.dirname(mutation.destination), guard.fileOps);
    return;
  }
  durableRename(mutation.source, mutation.destination, guard);
}

function authorizeRecovery(
  resolved: ResolvedJournal,
  workspace: AssetWorkspace,
  state: RecoveryState,
  mode: 'rollback' | 'cleanup',
  guard: MutationGuard,
): AssetPackTransactionJournal {
  const authorized: AssetPackTransactionJournal = {
    ...resolved.journal,
    recoveryMode: mode,
    recoveryCursor: 0,
    oldRegistryDigest: digestFileOrAbsent(state.oldRegistryPath, guard.fileOps),
    newRegistryDigest: digestFileOrAbsent(state.newRegistryPath, guard.fileOps),
    recoveryRoleEvidence: recoveryRoleEvidenceForAuthorization(
      resolved,
      mode,
      guard.fileOps,
    ),
  };
  writeJournalDurably(workspace, authorized, guard);
  return authorized;
}

function recoveryRoleCandidatePaths(
  resolved: ResolvedJournal,
  evidence: AssetPackRecoveryRoleEvidence,
): readonly string[] {
  if (evidence.role === 'published-installed-source') {
    return [resolved.stagedInstalledSource, resolved.finalInstalledSource]
      .filter((entry): entry is string => entry !== undefined);
  }
  if (evidence.role === 'incoming-installed-source') {
    return resolved.incomingInstalledSource ? [resolved.incomingInstalledSource] : [];
  }
  if (evidence.role === 'created-installed-parent') {
    const index = resolved.journal.createdInstalledParents?.indexOf(evidence.path) ?? -1;
    return index === -1 ? [] : [resolved.createdInstalledParents[index]!];
  }
  const index = resolved.journal.cleanupInstalledSources.indexOf(evidence.path);
  return index === -1 ? [] : [resolved.cleanupInstalledSources[index]!];
}

function authenticateAuthorizedRecoveryRoles(
  resolved: ResolvedJournal,
  fileOps: AssetTransactionFileOps,
): void {
  for (const evidence of resolved.journal.recoveryRoleEvidence ?? []) {
    const candidates = recoveryRoleCandidatePaths(resolved, evidence);
    const present = candidates.filter((candidate) => pathEntryExists(candidate));
    if (!evidence.present) {
      if (present.length > 0) {
        throw new Error(
          `Asset transaction absent recovery role appeared after authorization: ${evidence.path}`,
        );
      }
      continue;
    }
    if (present.length > 1) {
      throw new Error(
        `Asset transaction recovery role has multiple paths after authorization: ${evidence.path}`,
      );
    }
    const target = present[0];
    if (!target) continue;
    const identity = pathEntryIdentity(target, fileOps);
    if (
      !identity.present
      || identity.type !== evidence.type
      || identity.device !== evidence.device
      || identity.inode !== evidence.inode
    ) {
      throw new Error(
        `Asset transaction recovery role identity changed after authorization: ${evidence.path}`,
      );
    }
    // Rollback changes these parents by removing the transaction-owned child first.
    // Their pinned identity plus a non-recursive removal still protects unrelated contents.
    if (
      evidence.role !== 'created-installed-parent'
      && authenticatedDirectoryDigest(target, fileOps) !== evidence.contentDigest
    ) {
      throw new Error(
        `Asset transaction recovery role contents changed after authorization: ${evidence.path}`,
      );
    }
    if (!samePathEntryIdentity(identity, pathEntryIdentity(target, fileOps))) {
      throw new Error(
        `Asset transaction recovery role changed during reauthentication: ${evidence.path}`,
      );
    }
  }
}

function authenticateAuthorizedRecoveryOutputs(
  resolved: ResolvedJournal,
  workspace: AssetWorkspace,
  fileOps: AssetTransactionFileOps,
): void {
  const hasActiveOutput = pathEntryExists(workspace.outputRoot);
  const hasOutputBackup = pathEntryExists(resolved.oldOutputBackup);
  const hasStagedOutput = pathEntryExists(resolved.stagedOutput);
  const hasActiveRegistry = pathEntryExists(workspace.registryPath);
  const hasOldRegistryBackup = resolved.oldRegistryBackup !== undefined
    && pathEntryExists(resolved.oldRegistryBackup);
  const hasStagedRegistry = pathEntryExists(resolved.stagedRegistry);

  if (resolved.journal.recoveryMode === 'cleanup') {
    if (!hasActiveOutput || !hasActiveRegistry) {
      throw new Error('Committed recovery lost its active generation.');
    }
    authenticateGeneration(
      workspace,
      workspace.outputRoot,
      workspace.registryPath,
      fileOps,
    );
    if (hasOutputBackup) {
      if (resolved.oldRegistryBackup && hasOldRegistryBackup) {
        authenticatePendingOutput(
          workspace,
          resolved.oldOutputBackup,
          resolved.oldRegistryBackup,
          resolved.journal.workspaceId,
          fileOps,
        );
      } else if (resolved.journal.oldRegistryDigest === 'absent') {
        const markerPath = path.join(resolved.oldOutputBackup, OUTPUT_MARKER_FILE);
        const markerBytes = fileOps.readFileSync(markerPath);
        const audit = auditPublishedManagedOutput({
          workspace: { ...workspace, outputRoot: resolved.oldOutputBackup },
          markerBytes,
          generatedDigests: {},
        });
        if (audit) throw new Error(audit.message);
      } else {
        throw new Error('Committed recovery output backup has no authenticated registry.');
      }
    }
    if (hasStagedOutput) {
      throw new Error('Committed recovery contains an unexpected staged output role.');
    }
    return;
  }

  const oldRegistryPath = hasOldRegistryBackup
    ? resolved.oldRegistryBackup
    : hasActiveRegistry
      ? workspace.registryPath
      : resolved.oldRegistryBackup === undefined
          && resolved.journal.oldRegistryDigest === 'absent'
        ? workspace.registryPath
        : undefined;
  const oldOutputPath = hasOutputBackup
    ? resolved.oldOutputBackup
    : hasActiveOutput
      ? workspace.outputRoot
      : undefined;
  if (!oldRegistryPath || !oldOutputPath) {
    throw new Error('Rollback recovery lost its authenticated old generation.');
  }
  authenticateGeneration(
    workspace,
    oldOutputPath,
    oldRegistryPath,
    fileOps,
    true,
  );

  const newOutputPath = hasStagedOutput
    ? resolved.stagedOutput
    : hasOutputBackup && hasActiveOutput
      ? workspace.outputRoot
      : undefined;
  if (newOutputPath) {
    if (!hasStagedRegistry) {
      throw new Error('Rollback recovery output role has no authenticated staged registry.');
    }
    authenticatePendingOutput(
      workspace,
      newOutputPath,
      resolved.stagedRegistry,
      resolved.journal.workspaceId,
      fileOps,
    );
  }
}

function validateAuthorizedRecovery(
  resolved: ResolvedJournal,
  workspace: AssetWorkspace,
  fileOps: AssetTransactionFileOps,
): void {
  const journal = resolved.journal;
  if (
    journal.recoveryMode === undefined
    || journal.recoveryCursor === undefined
    || journal.oldRegistryDigest === undefined
    || journal.newRegistryDigest === undefined
  ) {
    throw new Error('Asset transaction recovery authorization is incomplete.');
  }
  const mutations = journal.recoveryMode === 'cleanup'
    ? cleanupMutations(resolved, workspace)
    : rollbackMutations(resolved, workspace);
  validateRecoveryCursorState(resolved, workspace, mutations);
  authenticateAuthorizedRecoveryRoles(resolved, fileOps);
  if (journal.recoveryMode === 'cleanup') {
    assertDigestIfPresent(
      workspace.registryPath,
      journal.newRegistryDigest,
      fileOps,
      'Published registry',
    );
    authenticateGeneration(
      workspace,
      workspace.outputRoot,
      workspace.registryPath,
      fileOps,
    );
    if (resolved.oldRegistryBackup) {
      assertDigestIfPresent(
        resolved.oldRegistryBackup,
        journal.oldRegistryDigest,
        fileOps,
        'Old registry backup',
      );
    }
    authenticateAuthorizedRecoveryOutputs(resolved, workspace, fileOps);
    return;
  }
  if (resolved.oldRegistryBackup) {
    assertDigestIfPresent(
      resolved.oldRegistryBackup,
      journal.oldRegistryDigest,
      fileOps,
      'Rollback registry backup',
    );
  }
  assertDigestIfPresent(
    workspace.registryPath,
    journal.oldRegistryDigest,
    fileOps,
    'Rollback active registry',
  );
  assertDigestIfPresent(
    resolved.stagedRegistry,
    journal.newRegistryDigest,
    fileOps,
    'Rollback staged registry',
  );
  authenticateAuthorizedRecoveryOutputs(resolved, workspace, fileOps);
}

function runAuthorizedRecovery(
  resolved: ResolvedJournal,
  workspace: AssetWorkspace,
  guard: MutationGuard,
): void {
  let current = resolved;
  while (true) {
    validateAuthorizedRecovery(current, workspace, guard.fileOps);
    const journal = current.journal;
    const mutations = journal.recoveryMode === 'cleanup'
      ? cleanupMutations(current, workspace)
      : rollbackMutations(current, workspace);
    const cursor = journal.recoveryCursor!;
    if (cursor === mutations.length) {
      removeListedPath(workspace.stateRoot, current.transactionPath, false, guard);
      return;
    }
    executeRecoveryMutation(mutations[cursor]!, guard);
    const advanced: AssetPackTransactionJournal = {
      ...journal,
      recoveryCursor: cursor + 1,
    };
    writeJournalDurably(workspace, advanced, guard);
    current = resolveJournal(workspace, advanced, guard.fileOps);
  }
}

function recoverAssetPackTransactionUnderClaim(options: {
  readonly workspace: AssetWorkspace;
  readonly fileOps: AssetTransactionFileOps;
  readonly claim: TransactionClaim;
}): AssetPackRecoveryResult {
  return withStableWorkspaceWorkingDirectory({
    workspace: options.workspace,
    fileOps: options.fileOps,
    action: () => recoverAssetPackTransactionUnderClaimFromStableDirectory(options),
  });
}

function recoverAssetPackTransactionUnderClaimFromStableDirectory(options: {
  readonly workspace: AssetWorkspace;
  readonly fileOps: AssetTransactionFileOps;
  readonly claim: TransactionClaim;
}): AssetPackRecoveryResult {
  const transactionPath = path.join(options.workspace.stateRoot, JOURNAL_FILE);
  if (!pathEntryExists(transactionPath)) return { ok: true, action: 'none' };
  let resolved: ResolvedJournal;
  let recoveryState: RecoveryState | undefined;
  try {
    assertNoExistingSymlink(options.workspace.stateRoot, transactionPath, 'Asset transaction journal');
    assertRegularFileIfPresent(transactionPath, 'Asset transaction journal');
    const parsed = JSON.parse(options.fileOps.readFileSync(transactionPath).toString('utf8')) as unknown;
    const journal = parseJournalRecord(parsed);
    resolved = resolveJournal(options.workspace, journal, options.fileOps);
    if (journal.recoveryMode === undefined) {
      recoveryState = validateRecoveryState(resolved, options.workspace, options.fileOps);
    } else {
      validateAuthorizedRecovery(resolved, options.workspace, options.fileOps);
    }
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
    if (resolved.journal.recoveryMode !== undefined) {
      const action = resolved.journal.recoveryMode === 'cleanup'
        ? 'completed'
        : 'rolled-back';
      runAuthorizedRecovery(resolved, options.workspace, options.claim.guard);
      return { ok: true, action };
    }
    if (recoveryState!.registryPublished) {
      if (resolved.journal.phase !== 'registry-published') {
        const committedJournal = updatePhase(
          resolved.journal,
          'registry-published',
          options.workspace,
          options.claim.guard,
        );
        resolved = resolveJournal(options.workspace, committedJournal, options.fileOps);
        recoveryState = validateRecoveryState(resolved, options.workspace, options.fileOps);
      }
      const authorized = authorizeRecovery(
        resolved,
        options.workspace,
        recoveryState!,
        'cleanup',
        options.claim.guard,
      );
      resolved = resolveJournal(options.workspace, authorized, options.fileOps);
      runAuthorizedRecovery(resolved, options.workspace, options.claim.guard);
      return { ok: true, action: 'completed' };
    }
    const authorized = authorizeRecovery(
      resolved,
      options.workspace,
      recoveryState!,
      'rollback',
      options.claim.guard,
    );
    resolved = resolveJournal(options.workspace, authorized, options.fileOps);
    runAuthorizedRecovery(resolved, options.workspace, options.claim.guard);
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
  let result: AssetPackRecoveryResult;
  try {
    result = recoverAssetPackTransactionUnderClaim({
      workspace: options.workspace,
      fileOps,
      claim,
    });
  } catch (error) {
    result = recoveryFailure('asset_publish_failed', error, options.workspace);
  }
  try {
    releaseTransactionClaim(claim);
  } catch (error) {
    const releaseFailure = recoveryFailure(
      'asset_publish_failed',
      error,
      options.workspace,
    );
    if (result.ok) return releaseFailure;
    return {
      ok: false,
      diagnostics: [...result.diagnostics, ...releaseFailure.diagnostics],
    };
  }
  return result;
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

function absentInstalledParents(
  finalInstalledSource: string | undefined,
): readonly string[] {
  if (!finalInstalledSource) return [];
  return [
    path.dirname(finalInstalledSource),
    path.dirname(path.dirname(finalInstalledSource)),
  ].filter((entry) => !pathEntryExists(entry));
}

function materializeDesiredState(options: {
  readonly desiredState: AssetPackDesiredState;
  readonly stagedOutput: string;
  readonly stagedRegistry: string;
  readonly workspace: AssetWorkspace;
  readonly guard: MutationGuard;
}): void {
  createDirectoriesDurably(
    options.workspace.root,
    options.stagedOutput,
    options.guard,
  );
  for (const [logicalPath, bytes] of options.desiredState.outputFiles) {
    const destination = safeOutputDestination(options.stagedOutput, logicalPath);
    durableWrite(options.stagedOutput, destination, Buffer.from(bytes), options.guard);
  }
  durableWrite(
    options.workspace.stateRoot,
    options.stagedRegistry,
    assetPackRegistryBytes(options.desiredState.registry),
    options.guard,
  );
}

function copyInstalledSourceDurably(options: {
  readonly source: string;
  readonly destination: string;
  readonly workspace: AssetWorkspace;
  readonly guard: MutationGuard;
}): void {
  const sourceRoot = path.join(options.workspace.stateRoot, 'staging');
  const installedRoot = path.join(options.workspace.stateRoot, 'installed');
  assertContainedChild(sourceRoot, options.source, 'Incoming installed source');
  assertContainedChild(installedRoot, options.destination, 'Local installed staging source');
  rememberExistingAncestors(options.guard, sourceRoot, options.source);

  const visit = (sourceDirectory: string, destinationDirectory: string): void => {
    const sourceStats = transactionLstat(sourceDirectory, options.guard.fileOps);
    if (sourceStats.isSymbolicLink() || !sourceStats.isDirectory()) {
      throw new Error(`Installed source copy encountered an unsafe directory: ${sourceDirectory}`);
    }
    createDirectoriesDurably(installedRoot, destinationDirectory, options.guard);
    for (const name of readdirSync(sourceDirectory).sort()) {
      const sourceEntry = path.join(sourceDirectory, name);
      const destinationEntry = path.join(destinationDirectory, name);
      assertNoExistingSymlink(sourceRoot, sourceEntry, 'Incoming installed source entry');
      const stats = transactionLstat(sourceEntry, options.guard.fileOps);
      if (stats.isDirectory()) {
        visit(sourceEntry, destinationEntry);
      } else if (stats.isFile()) {
        durableWrite(
          installedRoot,
          destinationEntry,
          Buffer.from(options.guard.fileOps.readFileSync(sourceEntry)),
          options.guard,
        );
      } else {
        throw new Error(`Installed source copy encountered a non-file entry: ${sourceEntry}`);
      }
    }
  };

  visit(options.source, options.destination);
}

function authenticateDestinationLocalInstalledSource(options: {
  readonly workspace: AssetWorkspace;
  readonly desiredState: AssetPackDesiredState;
  readonly localInstalledSource: string | undefined;
  readonly finalInstalledSource: string | undefined;
}): void {
  if (!options.localInstalledSource || !options.finalInstalledSource) return;
  const matchingEntries = options.desiredState.registry.entries.filter(
    (entry): entry is InstalledAssetPackRegistryEntry => (
      entry.kind === 'installed'
      && path.resolve(entry.installedDirectory) === path.resolve(options.finalInstalledSource!)
    ),
  );
  if (matchingEntries.length !== 1) {
    throw new Error(
      'Destination-local installed source must match exactly one desired registry entry.',
    );
  }
  const entry = matchingEntries[0]!;
  verifyInstalledAssetPackDirectory({
    workspace: options.workspace,
    workspaceId: options.desiredState.registry.workspaceId,
    installedDirectory: options.localInstalledSource,
    entry,
    archiveDigest: entry.archiveDigest,
  });
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

function clearRecoveryAuthorization(
  journal: AssetPackTransactionJournal,
  workspace: AssetWorkspace,
  guard: MutationGuard,
): AssetPackTransactionJournal {
  const updated = { ...journal };
  delete updated.recoveryMode;
  delete updated.recoveryCursor;
  delete updated.oldRegistryDigest;
  delete updated.newRegistryDigest;
  delete updated.recoveryRoleEvidence;
  writeJournalDurably(workspace, updated, guard);
  return updated;
}

async function publishAssetPackGenerationUnderClaim(
  options: PublishAssetPackGenerationOptions,
  claim: TransactionClaim,
): Promise<AssetPackPublicationResult> {
  return withStableWorkspaceWorkingDirectory({
    workspace: options.workspace,
    fileOps: options.fileOps ?? DEFAULT_FILE_OPS,
    action: () => publishAssetPackGenerationUnderClaimFromStableDirectory(options, claim),
  });
}

function publishAssetPackGenerationUnderClaimFromStableDirectory(
  options: PublishAssetPackGenerationOptions,
  claim: TransactionClaim,
): AssetPackPublicationResult {
  const fileOps = options.fileOps ?? DEFAULT_FILE_OPS;
  const operationId = claim.operationId;
  const stagedOutput = transactionSiblingPath(
    options.workspace.outputRoot,
    operationId,
    'staged',
  );
  const oldOutputBackup = transactionSiblingPath(
    options.workspace.outputRoot,
    operationId,
    'backup',
  );
  const stagedRegistry = transactionSiblingPath(
    options.workspace.registryPath,
    operationId,
    'staged',
  );
  const oldRegistryBackup = transactionSiblingPath(
    options.workspace.registryPath,
    operationId,
    'backup',
  );
  const localInstalledSource = options.finalInstalledSource
    ? transactionSiblingPath(options.finalInstalledSource, operationId, 'staged')
    : undefined;
  const createdInstalledParents = absentInstalledParents(
    options.finalInstalledSource,
  );
  let journalWritten = false;
  let result: AssetPackPublicationResult;

  try {
    for (const artifact of [
      stagedOutput,
      oldOutputBackup,
      stagedRegistry,
      oldRegistryBackup,
      ...(localInstalledSource ? [localInstalledSource] : []),
    ]) {
      if (pathEntryExists(artifact)) {
        throw new Error(`Asset transaction operation path already exists: ${artifact}`);
      }
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
        ? { incomingInstalledSource: canonicalRelativePath(
          options.workspace,
          options.stagedInstalledSource,
        ) }
        : {}),
      ...(localInstalledSource
        ? { stagedInstalledSource: canonicalRelativePath(
          options.workspace,
          localInstalledSource,
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
      ...(createdInstalledParents.length > 0
        ? { createdInstalledParents: createdInstalledParents.map((entry) =>
          canonicalRelativePath(options.workspace, entry)) }
        : {}),
    };
    resolveJournal(options.workspace, journal, fileOps);
    writeJournalDurably(options.workspace, journal, claim.guard);
    journalWritten = true;

    if (options.stagedInstalledSource && localInstalledSource) {
      copyInstalledSourceDurably({
        source: options.stagedInstalledSource,
        destination: localInstalledSource,
        workspace: options.workspace,
        guard: claim.guard,
      });
    }
    authenticateDestinationLocalInstalledSource({
      workspace: options.workspace,
      desiredState: options.desiredState,
      localInstalledSource,
      finalInstalledSource: options.finalInstalledSource,
    });
    const prepared = resolveJournal(options.workspace, journal, fileOps);
    journal = authorizeRecovery(
      prepared,
      options.workspace,
      validateRecoveryState(prepared, options.workspace, fileOps),
      'rollback',
      claim.guard,
    );

    durableRename(options.workspace.outputRoot, oldOutputBackup, claim.guard);
    durableRename(stagedOutput, options.workspace.outputRoot, claim.guard);
    journal = updatePhase(journal, 'output-published', options.workspace, claim.guard);

    if (localInstalledSource && options.finalInstalledSource) {
      durableRename(
        localInstalledSource,
        options.finalInstalledSource,
        claim.guard,
      );
    }
    journal = updatePhase(journal, 'sources-published', options.workspace, claim.guard);

    validateRecoveryState(
      resolveJournal(options.workspace, journal, fileOps),
      options.workspace,
      fileOps,
    );
    journal = clearRecoveryAuthorization(journal, options.workspace, claim.guard);

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
    const recoveryState = validateRecoveryState(resolved, options.workspace, fileOps);
    const authorized = authorizeRecovery(
      resolved,
      options.workspace,
      recoveryState,
      'cleanup',
      claim.guard,
    );
    runAuthorizedRecovery(
      resolveJournal(options.workspace, authorized, fileOps),
      options.workspace,
      claim.guard,
    );
    result = { ok: true };
  } catch (error) {
    if (!journalWritten) {
      try {
        removeListedPath(
          options.workspace.root,
          stagedOutput,
          true,
          claim.guard,
        );
        removeListedPath(
          options.workspace.stateRoot,
          stagedRegistry,
          false,
          claim.guard,
        );
        if (localInstalledSource) {
          removeListedPath(
            path.join(options.workspace.stateRoot, 'installed'),
            localInstalledSource,
            true,
            claim.guard,
          );
        }
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
  return result;
}

export async function withAssetPackTransactionClaim<T>(options: {
  readonly workspace: AssetWorkspace;
  readonly fileOps?: AssetTransactionFileOps;
  readonly action: (publisher: AssetPackClaimedPublisher) => Promise<T>;
}): Promise<AssetPackClaimedLifecycleResult<T>> {
  const fileOps = options.fileOps ?? DEFAULT_FILE_OPS;
  let claim: TransactionClaim;
  try {
    claim = acquireTransactionClaim(options.workspace, fileOps);
  } catch (error) {
    return {
      ok: false,
      diagnostics: publicationFailure(error, options.workspace).diagnostics,
    };
  }
  let result: AssetPackClaimedLifecycleResult<T>;
  const pending = recoverAssetPackTransactionUnderClaim({
    workspace: options.workspace,
    fileOps,
    claim,
  });
  if (!pending.ok) {
    result = pending;
  } else {
    try {
      const value = await options.action({
        publish: (publicationOptions) => publishAssetPackGenerationUnderClaim({
          ...publicationOptions,
          workspace: options.workspace,
          fileOps,
        }, claim),
        recover: () => recoverAssetPackTransactionUnderClaim({
          workspace: options.workspace,
          fileOps,
          claim,
        }),
      });
      result = { ok: true, value };
    } catch (error) {
      result = {
        ok: false,
        diagnostics: publicationFailure(error, options.workspace).diagnostics,
      };
    }
  }
  try {
    releaseTransactionClaim(claim);
  } catch (error) {
    const releaseFailure = publicationFailure(error, options.workspace);
    result = result.ok
      ? releaseFailure
      : {
        ok: false,
        diagnostics: [...result.diagnostics, ...releaseFailure.diagnostics],
      };
  }
  return result;
}

export async function publishAssetPackGeneration(
  options: PublishAssetPackGenerationOptions,
): Promise<AssetPackPublicationResult> {
  const claimed = await withAssetPackTransactionClaim({
    workspace: options.workspace,
    ...(options.fileOps ? { fileOps: options.fileOps } : {}),
    action: (publisher) => publisher.publish({
      operation: options.operation,
      desiredState: options.desiredState,
      cleanupInstalledSources: options.cleanupInstalledSources,
      ...(options.stagedInstalledSource
        ? { stagedInstalledSource: options.stagedInstalledSource }
        : {}),
      ...(options.finalInstalledSource
        ? { finalInstalledSource: options.finalInstalledSource }
        : {}),
    }),
  });
  return claimed.ok ? claimed.value : claimed;
}
