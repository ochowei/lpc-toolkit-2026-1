import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  readdirSync,
  type Stats,
} from 'node:fs';
import path from 'node:path';
import {
  ASSET_WORKSPACE_REGISTRY_SCHEMA,
  assetPackRegistryBytes,
  readAssetPackRegistry,
  type AssetPackLifecycleDiagnostic,
  type AssetPackRegistryEntry,
  type AssetPackRegistryV1Read,
  type LinkedAssetPackRegistryEntryV1,
} from './asset-pack-registry.js';
import type { AssetPackListEntry } from './asset-pack-remove.js';
import { prepareAssetPackDesiredState } from './asset-pack-state.js';
import {
  recoverAssetPackTransaction,
  type AssetPackRecoveryAction,
  type AssetTransactionFileOps,
} from './asset-pack-transaction.js';
import {
  ASSET_OUTPUT_MARKER_SCHEMA,
  assertManagedAssetOutput,
  type AssetWorkspace,
} from './asset-workspace.js';
import type { RuntimeAssets } from './runtime-assets.js';

export const ASSET_PACK_DOCTOR_SCHEMA =
  'lpc-toolkit.asset-pack-doctor.v1' as const;

export interface AssetPackDoctorCheck {
  readonly code: string;
  readonly status: 'pass' | 'warning' | 'error';
  readonly message: string;
  readonly path?: string;
  readonly packId?: string;
}

export interface AssetPackDoctorReport {
  readonly schema: typeof ASSET_PACK_DOCTOR_SCHEMA;
  readonly healthy: boolean;
  readonly recovery: AssetPackRecoveryAction;
  readonly checks: readonly AssetPackDoctorCheck[];
  readonly packs: readonly AssetPackListEntry[];
}

const STATUS_ORDER: Readonly<Record<AssetPackDoctorCheck['status'], number>> = {
  error: 0,
  warning: 1,
  pass: 2,
};
const OUTPUT_MARKER_FILE = '.lpc-toolkit-managed.json';
const JOURNAL_FILE = 'transaction.json';
const CLAIM_FILE = 'transaction.lock';
const SNAPSHOT_ATTEMPTS = 8;

type ListedRegistryEntry = AssetPackRegistryEntry | LinkedAssetPackRegistryEntryV1;

interface GenerationStamp {
  readonly registryDigest: string;
  readonly outputDigest: string;
  readonly sourceRolesDigest: string;
}

type GenerationStampResult =
  | { readonly status: 'idle'; readonly stamp: GenerationStamp }
  | { readonly status: 'busy' };

type TransactionInspection =
  | { readonly status: 'idle' }
  | { readonly status: 'busy' }
  | { readonly status: 'recoverable' }
  | {
    readonly status: 'unsafe';
    readonly diagnostic: AssetPackLifecycleDiagnostic;
  };

type GenerationAudit = {
  readonly checks: readonly AssetPackDoctorCheck[];
  readonly packs: readonly AssetPackListEntry[];
};

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortChecks(
  checks: readonly AssetPackDoctorCheck[],
): readonly AssetPackDoctorCheck[] {
  return [...checks].sort((left, right) =>
    STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
      || compareCodeUnits(left.code, right.code)
      || compareCodeUnits(left.packId ?? '', right.packId ?? '')
      || compareCodeUnits(left.path ?? '', right.path ?? ''));
}

function diagnosticCheck(
  diagnostic: AssetPackLifecycleDiagnostic,
): AssetPackDoctorCheck {
  return {
    code: diagnostic.code,
    status: diagnostic.severity,
    message: diagnostic.message,
    ...(diagnostic.path ? { path: diagnostic.path } : {}),
    ...(diagnostic.packId ? { packId: diagnostic.packId } : {}),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function pathEntryExists(
  target: string,
  stat: typeof lstatSync,
): boolean {
  try {
    stat(target);
    return true;
  } catch (error) {
    if (
      error instanceof Error
      && 'code' in error
      && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
    ) {
      return false;
    }
    throw error;
  }
}

function pathEntryStats(
  target: string,
  stat: typeof lstatSync,
): Stats | undefined {
  try {
    return stat(target);
  } catch (error) {
    if (
      error instanceof Error
      && 'code' in error
      && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
    ) {
      return undefined;
    }
    throw error;
  }
}

function sameEntryIdentity(left: Stats, right: Stats): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.ctimeMs === right.ctimeMs
    && left.birthtimeMs === right.birthtimeMs;
}

function transactionArtifactsPresent(
  workspace: AssetWorkspace,
  stat: typeof lstatSync,
): boolean {
  return pathEntryExists(path.join(workspace.stateRoot, JOURNAL_FILE), stat)
    || pathEntryExists(path.join(workspace.stateRoot, CLAIM_FILE), stat);
}

function hashTree(options: {
  readonly root: string;
  readonly readFile: typeof readFileSync;
  readonly stat: typeof lstatSync;
}): string {
  const hash = createHash('sha256');
  const visit = (target: string, relativePath: string): void => {
    let stats: Stats;
    try {
      stats = options.stat(target);
    } catch (error) {
      hash.update(`${JSON.stringify([relativePath, 'unreadable', errorMessage(error)])}\n`);
      return;
    }
    const kind = stats.isDirectory()
      ? 'directory'
      : stats.isFile()
        ? 'file'
        : stats.isSymbolicLink()
          ? 'symlink'
          : 'other';
    hash.update(`${JSON.stringify([
      relativePath,
      kind,
      String(stats.dev),
      String(stats.ino),
      stats.mode,
      stats.size,
      stats.mtimeMs,
      stats.ctimeMs,
      stats.birthtimeMs,
    ])}\n`);
    if (kind === 'directory') {
      let names: string[];
      try {
        names = readdirSync(target).sort(compareCodeUnits);
      } catch (error) {
        hash.update(`${JSON.stringify([relativePath, 'unreadable', errorMessage(error)])}\n`);
        return;
      }
      for (const name of names) {
        visit(path.join(target, name), relativePath === '' ? name : `${relativePath}/${name}`);
      }
    } else if (kind === 'file') {
      try {
        const bytes = options.readFile(target);
        hash.update(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
      } catch (error) {
        hash.update(`${JSON.stringify([relativePath, 'unreadable', errorMessage(error)])}\n`);
      }
    }
  };
  visit(options.root, '');
  return `sha256:${hash.digest('hex')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function registrySourceRoles(options: {
  readonly registryPath: string;
  readonly readFile: typeof readFileSync;
}): readonly {
  readonly kind: 'linked' | 'installed';
  readonly packId: string;
  readonly sourceRoot: string;
}[] {
  try {
    const bytes = options.readFile(options.registryPath);
    const parsed = JSON.parse(
      Buffer.isBuffer(bytes) ? bytes.toString('utf8') : bytes,
    ) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.entries)) return [];
    const roles: Array<{
      readonly kind: 'linked' | 'installed';
      readonly packId: string;
      readonly sourceRoot: string;
    }> = [];
    for (const entry of parsed.entries) {
      if (!isRecord(entry) || typeof entry.packId !== 'string') continue;
      if (entry.kind === 'linked' && typeof entry.sourceDirectory === 'string') {
        roles.push({
          kind: 'linked',
          packId: entry.packId,
          sourceRoot: path.resolve(entry.sourceDirectory),
        });
      } else if (
        entry.kind === 'installed'
        && typeof entry.installedDirectory === 'string'
      ) {
        roles.push({
          kind: 'installed',
          packId: entry.packId,
          sourceRoot: path.resolve(entry.installedDirectory),
        });
      }
    }
    return roles.sort((left, right) =>
      compareCodeUnits(left.kind, right.kind)
        || compareCodeUnits(left.packId, right.packId)
        || compareCodeUnits(left.sourceRoot, right.sourceRoot));
  } catch {
    return [];
  }
}

function sourceRolesDigest(options: {
  readonly workspace: AssetWorkspace;
  readonly readFile: typeof readFileSync;
  readonly stat: typeof lstatSync;
}): string {
  const hash = createHash('sha256');
  for (const role of registrySourceRoles({
    registryPath: options.workspace.registryPath,
    readFile: options.readFile,
  })) {
    hash.update(`${JSON.stringify([
      role.kind,
      role.packId,
      role.sourceRoot,
      hashTree({
        root: role.sourceRoot,
        readFile: options.readFile,
        stat: options.stat,
      }),
    ])}\n`);
  }
  return `sha256:${hash.digest('hex')}`;
}

function readGenerationStamp(options: {
  readonly workspace: AssetWorkspace;
  readonly fileOps?: AssetTransactionFileOps;
}): GenerationStampResult {
  const stat = options.fileOps?.lstatSync ?? lstatSync;
  if (transactionArtifactsPresent(options.workspace, stat)) return { status: 'busy' };
  const readFile = options.fileOps?.readFileSync ?? readFileSync;
  const registryDigest = hashTree({
    root: options.workspace.registryPath,
    readFile,
    stat,
  });
  const outputDigest = hashTree({
    root: options.workspace.outputRoot,
    readFile,
    stat,
  });
  const sourceDigest = sourceRolesDigest({
    workspace: options.workspace,
    readFile,
    stat,
  });
  if (transactionArtifactsPresent(options.workspace, stat)) return { status: 'busy' };
  return {
    status: 'idle',
    stamp: {
      registryDigest,
      outputDigest,
      sourceRolesDigest: sourceDigest,
    },
  };
}

function sameGeneration(left: GenerationStamp, right: GenerationStamp): boolean {
  return left.registryDigest === right.registryDigest
    && left.outputDigest === right.outputDigest
    && left.sourceRolesDigest === right.sourceRolesDigest;
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(
      error instanceof Error
      && 'code' in error
      && error.code === 'ESRCH'
    );
  }
}

function liveClaimPresent(options: {
  readonly claimPath: string;
  readonly readFile: typeof readFileSync;
  readonly stat: typeof lstatSync;
}): boolean {
  const before = pathEntryStats(options.claimPath, options.stat);
  if (!before) return false;
  try {
    const bytes = options.readFile(options.claimPath);
    const parsed = JSON.parse(
      Buffer.isBuffer(bytes) ? bytes.toString('utf8') : bytes,
    ) as unknown;
    const after = pathEntryStats(options.claimPath, options.stat);
    if (!after || !sameEntryIdentity(before, after)) return true;
    return isRecord(parsed)
      && Number.isSafeInteger(parsed.pid)
      && (parsed.pid as number) > 0
      && processIsAlive(parsed.pid as number);
  } catch {
    return true;
  }
}

function journalLooksRecoverable(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return value.schema === 'lpc-toolkit.asset-pack-transaction.v1'
    && typeof value.workspaceId === 'string'
    && value.workspaceId.length > 0
    && typeof value.operationId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value.operationId,
    )
    && (value.operation === 'sync'
      || value.operation === 'install'
      || value.operation === 'remove')
    && (value.phase === 'prepared'
      || value.phase === 'output-published'
      || value.phase === 'sources-published'
      || value.phase === 'registry-published')
    && typeof value.oldOutputBackup === 'string'
    && typeof value.stagedOutput === 'string'
    && typeof value.stagedRegistry === 'string'
    && Array.isArray(value.cleanupInstalledSources)
    && value.cleanupInstalledSources.every((entry) => typeof entry === 'string');
}

function inspectTransaction(options: {
  readonly workspace: AssetWorkspace;
  readonly fileOps?: AssetTransactionFileOps;
}): TransactionInspection {
  const stat = options.fileOps?.lstatSync ?? lstatSync;
  const readFile = options.fileOps?.readFileSync ?? readFileSync;
  const journalPath = path.join(options.workspace.stateRoot, JOURNAL_FILE);
  const claimPath = path.join(options.workspace.stateRoot, CLAIM_FILE);
  const journalStats = pathEntryStats(journalPath, stat);
  const claimStats = pathEntryStats(claimPath, stat);

  if (claimStats && liveClaimPresent({ claimPath, readFile, stat })) {
    return { status: 'busy' };
  }
  if (!journalStats) {
    return claimStats ? { status: 'busy' } : { status: 'idle' };
  }
  if (journalStats.isSymbolicLink() || !journalStats.isFile()) {
    return {
      status: 'unsafe',
      diagnostic: {
        code: 'asset_transaction_unsafe',
        severity: 'error',
        message: 'Asset transaction journal is not a regular file.',
        path: journalPath,
      },
    };
  }
  try {
    const bytes = readFile(journalPath);
    const parsed = JSON.parse(
      Buffer.isBuffer(bytes) ? bytes.toString('utf8') : bytes,
    ) as unknown;
    const after = pathEntryStats(journalPath, stat);
    if (!after || !sameEntryIdentity(journalStats, after)) return { status: 'busy' };
    if (!journalLooksRecoverable(parsed)) {
      throw new Error('Asset transaction journal is malformed or incomplete.');
    }
    return { status: 'recoverable' };
  } catch (error) {
    return {
      status: 'unsafe',
      diagnostic: {
        code: 'asset_transaction_unsafe',
        severity: 'error',
        message: errorMessage(error),
        path: journalPath,
      },
    };
  }
}

function listEntry(entry: ListedRegistryEntry): AssetPackListEntry {
  if (entry.kind === 'installed') {
    return {
      packId: entry.packId,
      version: entry.version,
      displayName: entry.displayName,
      kind: entry.kind,
      sourcePath: entry.installedDirectory,
      contentDigest: entry.contentDigest,
      archiveDigest: entry.archiveDigest,
    };
  }
  return {
    packId: entry.packId,
    version: entry.version,
    displayName: entry.displayName,
    kind: entry.kind,
    sourcePath: entry.sourceDirectory,
    contentDigest: entry.contentDigest,
  };
}

function markerWorkspaceId(options: {
  readonly workspace: AssetWorkspace;
  readonly fileOps?: AssetTransactionFileOps;
}):
  | { readonly ok: true; readonly workspaceId: string }
  | { readonly ok: false; readonly diagnostics: readonly AssetPackLifecycleDiagnostic[] } {
  const markerPath = path.join(options.workspace.outputRoot, OUTPUT_MARKER_FILE);
  try {
    assertManagedAssetOutput(options.workspace);
    const readFile = options.fileOps?.readFileSync ?? readFileSync;
    const parsed = JSON.parse(readFile(markerPath).toString('utf8')) as unknown;
    if (
      typeof parsed !== 'object'
      || parsed === null
      || Array.isArray(parsed)
      || !('schema' in parsed)
      || parsed.schema !== ASSET_OUTPUT_MARKER_SCHEMA
      || !('workspaceId' in parsed)
      || typeof parsed.workspaceId !== 'string'
      || parsed.workspaceId.length === 0
    ) {
      throw new Error('Asset output marker is invalid.');
    }
    return { ok: true, workspaceId: parsed.workspaceId };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{
        code: 'asset_output_root_unowned',
        severity: 'error',
        message: errorMessage(error),
        path: markerPath,
      }],
    };
  }
}

function registryEntries(
  document: AssetPackRegistryV1Read | { readonly entries: readonly AssetPackRegistryEntry[] },
): readonly AssetPackListEntry[] {
  return document.entries.map((entry) => listEntry(entry));
}

async function auditGeneration(options: {
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly fileOps?: AssetTransactionFileOps;
}): Promise<GenerationAudit> {
  const marker = markerWorkspaceId(options);
  if (!marker.ok) {
    return { checks: marker.diagnostics.map(diagnosticCheck), packs: [] };
  }
  const initialRegistry = readAssetPackRegistry({
    workspace: options.workspace,
    markerWorkspaceId: marker.workspaceId,
  });
  if (!initialRegistry.ok) {
    return { checks: initialRegistry.diagnostics.map(diagnosticCheck), packs: [] };
  }
  const packs = registryEntries(initialRegistry.document);
  const desired = await prepareAssetPackDesiredState({
    workspace: options.workspace,
    runtime: options.runtime,
    mutation: { kind: 'none' },
  });
  if (!desired.ok) {
    return {
      checks: desired.diagnostics.map(diagnosticCheck),
      packs,
    };
  }

  const checks: AssetPackDoctorCheck[] = desired.warnings.map(diagnosticCheck);
  const registry = readAssetPackRegistry({
    workspace: options.workspace,
    markerWorkspaceId: desired.registry.workspaceId,
  });
  if (!registry.ok) {
    checks.push(...registry.diagnostics.map(diagnosticCheck));
  } else if (registry.document.schema !== ASSET_WORKSPACE_REGISTRY_SCHEMA) {
    checks.push({
      code: 'asset_registry_migration_required',
      status: 'warning',
      message: 'Asset-pack registry v1 is valid but will be migrated by the next publication.',
      path: options.workspace.registryPath,
    });
  } else if (
    !assetPackRegistryBytes(registry.document).equals(
      assetPackRegistryBytes(desired.registry),
    )
  ) {
    checks.push({
      code: 'asset_desired_state_mismatch',
      status: 'error',
      message: 'Published asset-pack registry differs from freshly compiled desired state.',
      path: options.workspace.registryPath,
    });
  } else {
    checks.push({
      code: 'asset_lifecycle_integrity',
      status: 'pass',
      message: 'Registry, sources, generated output, ownership, and attribution are valid.',
    });
  }
  return { checks, packs };
}

async function yieldToLifecyclePublisher(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function recoveryCheck(action: AssetPackRecoveryAction): AssetPackDoctorCheck {
  const message = action === 'none'
    ? 'No pending asset-pack transaction required recovery.'
    : action === 'rolled-back'
      ? 'Rolled back the pending asset-pack transaction before auditing.'
      : 'Completed the pending asset-pack transaction before auditing.';
  return {
    code: 'asset_transaction_recovery',
    status: 'pass',
    message,
  };
}

function report(options: {
  readonly recovery: AssetPackRecoveryAction;
  readonly checks: readonly AssetPackDoctorCheck[];
  readonly packs: readonly AssetPackListEntry[];
}): AssetPackDoctorReport {
  const checks = sortChecks(options.checks);
  return {
    schema: ASSET_PACK_DOCTOR_SCHEMA,
    healthy: !checks.some((check) => check.status === 'error'),
    recovery: options.recovery,
    checks,
    packs: options.packs,
  };
}

export async function doctorAssetPacks(options: {
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly fileOps?: AssetTransactionFileOps;
}): Promise<AssetPackDoctorReport> {
  let recoveryAction: AssetPackRecoveryAction = 'none';
  for (let attempt = 0; attempt < SNAPSHOT_ATTEMPTS; attempt += 1) {
    const transaction = inspectTransaction(options);
    if (transaction.status === 'busy') {
      await yieldToLifecyclePublisher();
      continue;
    }
    if (transaction.status === 'unsafe') {
      return report({
        recovery: recoveryAction,
        checks: [diagnosticCheck(transaction.diagnostic)],
        packs: [],
      });
    }
    if (transaction.status === 'recoverable') {
      const recovery = recoverAssetPackTransaction({
        workspace: options.workspace,
        ...(options.fileOps ? { fileOps: options.fileOps } : {}),
      });
      if (!recovery.ok) {
        return report({
          recovery: recoveryAction,
          checks: recovery.diagnostics.map(diagnosticCheck),
          packs: [],
        });
      }
      if (recovery.action !== 'none') recoveryAction = recovery.action;
    }
    const before = readGenerationStamp(options);
    if (before.status === 'busy') {
      await yieldToLifecyclePublisher();
      continue;
    }
    const audit = await auditGeneration(options);
    const after = readGenerationStamp(options);
    if (after.status === 'idle' && sameGeneration(before.stamp, after.stamp)) {
      return report({
        recovery: recoveryAction,
        checks: [recoveryCheck(recoveryAction), ...audit.checks],
        packs: audit.packs,
      });
    }
    await yieldToLifecyclePublisher();
  }

  return report({
    recovery: recoveryAction,
    checks: [
      recoveryCheck(recoveryAction),
      {
        code: 'asset_doctor_snapshot_unstable',
        status: 'error',
        message: 'Asset lifecycle changed while doctor was auditing; retry after the active command completes.',
        path: options.workspace.stateRoot,
      },
    ],
    packs: [],
  });
}
