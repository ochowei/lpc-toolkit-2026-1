import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  linkSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { createAssetPackArchive } from '@lpc-toolkit/asset-pack-format';
import {
  assetAuthoringSessionPath,
  type AssetAuthoringDraftArchiveReceipt,
  type AssetAuthoringSession,
  type AssetAuthoringSourceDigest,
  type AssetAuthoringSyncReceipt,
} from './asset-authoring-session.js';
import { loadAssetPackFiles } from './asset-pack-files.js';
import { nodeAssetPackFormatRuntime } from './asset-pack-node-runtime.js';
import {
  auditPublishedManagedOutput,
  readAssetPackRegistry,
  type AssetPackRegistryDocument,
} from './asset-pack-registry.js';
import { readAssetPackManagedFile } from './asset-pack-managed-file.js';
import type { AssetPackSyncSuccess } from './asset-pack-sync.js';
import {
  ASSET_OUTPUT_MARKER_SCHEMA,
  type AssetWorkspace,
} from './asset-workspace.js';

const RELEASE_ARTIFACT_DIRECTORY = 'release-artifacts' as const;
const OUTPUT_MARKER_FILE = '.lpc-toolkit-managed.json' as const;

export class AssetAuthoringReleaseLifecycleError extends Error {
  readonly code: string;
  readonly path: string | undefined;

  constructor(code: string, message: string, targetPath?: string) {
    super(message);
    this.name = 'AssetAuthoringReleaseLifecycleError';
    this.code = code;
    this.path = targetPath;
  }
}

export interface DraftArchiveOptions {
  readonly cwd: string;
  readonly workspace: AssetWorkspace;
  readonly session: AssetAuthoringSession;
  readonly outputPath?: string;
  readonly now?: () => string;
}

export interface DraftArchiveResult {
  readonly receipt: AssetAuthoringDraftArchiveReceipt;
  readonly archiveBytes: Buffer;
  readonly reusedExistingArchive: boolean;
}

export interface SyncReceiptOptions {
  readonly workspace: AssetWorkspace;
  readonly session: AssetAuthoringSession;
  readonly synced: AssetPackSyncSuccess;
  readonly now?: () => string;
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function sortedRecord(record: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOutputMarker(workspace: AssetWorkspace): {
  readonly workspaceId: string;
  readonly bytes: Buffer;
} {
  const markerPath = path.join(workspace.outputRoot, OUTPUT_MARKER_FILE);
  const snapshot = readAssetPackManagedFile({
    filePath: markerPath,
    label: 'Managed asset output marker',
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshot.bytes.toString('utf8')) as unknown;
  } catch (error) {
    throw new AssetAuthoringReleaseLifecycleError(
      'asset_authoring_sync_evidence_invalid',
      `Managed asset output marker is invalid: ${error instanceof Error ? error.message : String(error)}.`,
      markerPath,
    );
  }
  if (!isRecord(parsed)) {
    throw new AssetAuthoringReleaseLifecycleError(
      'asset_authoring_sync_evidence_invalid',
      'Managed asset output marker must be a JSON object.',
      markerPath,
    );
  }
  const keys = Object.keys(parsed).sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(keys) !== JSON.stringify(['schema', 'workspaceId'].sort())) {
    throw new AssetAuthoringReleaseLifecycleError(
      'asset_authoring_sync_evidence_invalid',
      'Managed asset output marker contains unexpected fields.',
      markerPath,
    );
  }
  if (parsed.schema !== ASSET_OUTPUT_MARKER_SCHEMA || typeof parsed.workspaceId !== 'string') {
    throw new AssetAuthoringReleaseLifecycleError(
      'asset_authoring_sync_evidence_invalid',
      'Managed asset output marker has an invalid schema or workspace identity.',
      markerPath,
    );
  }
  return { workspaceId: parsed.workspaceId, bytes: snapshot.bytes };
}

function requireV2Registry(
  workspace: AssetWorkspace,
  markerWorkspaceId: string,
): { readonly document: AssetPackRegistryDocument; readonly bytes: Buffer } {
  const registryPath = workspace.registryPath;
  const registrySnapshot = readAssetPackManagedFile({
    filePath: registryPath,
    label: 'Asset workspace registry',
  });
  const read = readAssetPackRegistry({
    workspace,
    markerWorkspaceId,
    registryBytes: registrySnapshot.bytes,
  });
  if (!read.ok) {
    const diagnostic = read.diagnostics[0];
    throw new AssetAuthoringReleaseLifecycleError(
      diagnostic?.code ?? 'asset_authoring_sync_evidence_invalid',
      diagnostic?.message ?? 'Asset workspace registry could not be read.',
      diagnostic?.path ?? registryPath,
    );
  }
  if (read.document.schema !== 'lpc-toolkit.asset-workspace-registry.v2') {
    throw new AssetAuthoringReleaseLifecycleError(
      'asset_authoring_sync_evidence_invalid',
      'Confirmed authoring sync did not produce a v2 manager registry.',
      registryPath,
    );
  }
  return { document: read.document, bytes: registrySnapshot.bytes };
}

function canonicalSyncEvidence(value: Readonly<Record<string, unknown>>): Buffer {
  return Buffer.from(JSON.stringify(value));
}

export function captureSyncReceipt(options: SyncReceiptOptions): AssetAuthoringSyncReceipt {
  const marker = readOutputMarker(options.workspace);
  const registry = requireV2Registry(options.workspace, marker.workspaceId);
  const outputFailure = auditPublishedManagedOutput({
    workspace: options.workspace,
    markerBytes: marker.bytes,
    generatedDigests: registry.document.generatedDigests,
  });
  if (outputFailure) {
    throw new AssetAuthoringReleaseLifecycleError(
      outputFailure.code,
      outputFailure.message,
      outputFailure.path,
    );
  }

  const linked = registry.document.entries.find((entry) =>
    entry.packId === options.synced.linked.packId);
  if (
    linked === undefined
    || linked.kind !== 'linked'
    || linked.version !== options.synced.linked.version
    || linked.contentDigest !== options.synced.linked.contentDigest
    || JSON.stringify(linked.sourceDigests) !== JSON.stringify(options.synced.linked.sourceDigests)
  ) {
    throw new AssetAuthoringReleaseLifecycleError(
      'asset_authoring_sync_evidence_invalid',
      'The committed manager registry does not match the confirmed linked pack.',
      options.workspace.registryPath,
    );
  }
  if (
    options.synced.linked.packId !== options.session.plan.pack.id
    || options.synced.linked.version !== options.session.plan.pack.version
  ) {
    throw new AssetAuthoringReleaseLifecycleError(
      'asset_authoring_sync_identity_mismatch',
      'The confirmed linked pack does not match the authoring session plan.',
      options.session.packRoot,
    );
  }

  const sourceDigests: readonly AssetAuthoringSourceDigest[] = Object.entries(
    options.synced.linked.sourceDigests,
  )
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourcePath, digest]) => ({ path: sourcePath, digest }));
  const generatedDigests = sortedRecord(registry.document.generatedDigests);
  const recordedAtInput = options.now?.() ?? new Date().toISOString();
  const recordedAtDate = new Date(recordedAtInput);
  if (Number.isNaN(recordedAtDate.getTime())) {
    throw new AssetAuthoringReleaseLifecycleError(
      'asset_authoring_sync_receipt_invalid',
      'Sync receipt timestamp is invalid.',
    );
  }
  const recordedAt = recordedAtDate.toISOString();
  const evidence = {
    packId: options.synced.linked.packId,
    version: options.synced.linked.version,
    manifestDigest: options.synced.manifestDigest,
    contentDigest: options.synced.linked.contentDigest,
    sourceDigests,
    workspaceId: marker.workspaceId,
    outputRoot: path.resolve(options.workspace.outputRoot),
    registryDigest: sha256(registry.bytes),
    compileDigest: registry.document.compileDigest,
    generatedDigests,
  } as const;
  return {
    id: sha256(canonicalSyncEvidence(evidence)),
    ...evidence,
    recordedAt,
  };
}

function sameSourceDigests(
  left: readonly AssetAuthoringSourceDigest[],
  right: readonly AssetAuthoringSourceDigest[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    return other !== undefined && entry.path === other.path && entry.digest === other.digest;
  });
}

function sourceDigestsFromMap(
  sourceDigests: ReadonlyMap<string, string>,
): readonly AssetAuthoringSourceDigest[] {
  return [...sourceDigests]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourcePath, digest]) => ({ path: sourcePath, digest }));
}

export async function syncReceiptStaleReason(options: {
  readonly workspace: AssetWorkspace;
  readonly session: AssetAuthoringSession;
  readonly receipt: AssetAuthoringSyncReceipt;
}): Promise<string | undefined> {
  const loaded = await loadAssetPackFiles(options.session.packRoot);
  if (!loaded.ok) return 'the session pack can no longer be captured';
  if (
    loaded.pack.id !== options.receipt.packId
    || loaded.pack.version !== options.receipt.version
    || sha256(loaded.manifestBytes) !== options.receipt.manifestDigest
    || loaded.contentDigest !== options.receipt.contentDigest
    || !sameSourceDigests(
      sourceDigestsFromMap(loaded.sourceDigests),
      options.receipt.sourceDigests,
    )
  ) {
    return 'the session manifest or source evidence changed externally';
  }

  try {
    const marker = readOutputMarker(options.workspace);
    const registry = requireV2Registry(options.workspace, marker.workspaceId);
    const outputFailure = auditPublishedManagedOutput({
      workspace: options.workspace,
      markerBytes: marker.bytes,
      generatedDigests: registry.document.generatedDigests,
    });
    if (outputFailure) return outputFailure.message;
    if (
      marker.workspaceId !== options.receipt.workspaceId
      || path.resolve(options.workspace.outputRoot) !== options.receipt.outputRoot
      || sha256(registry.bytes) !== options.receipt.registryDigest
      || registry.document.compileDigest !== options.receipt.compileDigest
      || JSON.stringify(sortedRecord(registry.document.generatedDigests))
        !== JSON.stringify(options.receipt.generatedDigests)
    ) {
      return 'the manager registry or generated output generation changed externally';
    }
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return undefined;
}

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === ''
    || (
      relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative)
    );
}

function assertDirectory(target: string, label: string): void {
  let stats: ReturnType<typeof lstatSync>;
  try {
    stats = lstatSync(target);
  } catch (error) {
    throw new AssetAuthoringReleaseLifecycleError(
      'asset_authoring_draft_path_invalid',
      `${label} is unavailable: ${target}. ${error instanceof Error ? error.message : String(error)}`,
      target,
    );
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new AssetAuthoringReleaseLifecycleError(
      'asset_authoring_draft_path_invalid',
      `${label} must be a real directory: ${target}.`,
      target,
    );
  }
}

function ensureContainedDirectory(root: string, target: string, label: string): void {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (!isInsideRoot(resolvedRoot, resolvedTarget)) {
    throw new AssetAuthoringReleaseLifecycleError(
      'asset_authoring_draft_path_invalid',
      `${label} must stay inside the session-owned release-artifact root: ${target}.`,
      target,
    );
  }

  if (resolvedTarget === resolvedRoot) {
    assertDirectory(resolvedRoot, label);
    return;
  }

  let current = resolvedRoot;
  for (const segment of path.relative(resolvedRoot, resolvedTarget).split(path.sep)) {
    if (segment.length === 0) continue;
    current = path.join(current, segment);
    if (!existsSync(current)) {
      mkdirSync(current, { mode: 0o700 });
    }
    assertDirectory(current, label);
  }
}

export function assetAuthoringReleaseArtifactRoot(
  workspace: AssetWorkspace,
  sessionId: string,
): string {
  const sessionDirectory = path.dirname(assetAuthoringSessionPath(workspace, sessionId));
  assertDirectory(sessionDirectory, 'Authoring session directory');
  const artifactRoot = path.join(sessionDirectory, RELEASE_ARTIFACT_DIRECTORY);
  if (!existsSync(artifactRoot)) {
    mkdirSync(artifactRoot, { mode: 0o700 });
  }
  assertDirectory(artifactRoot, 'Authoring release-artifact root');
  return artifactRoot;
}

function resolveDraftArchivePath(options: DraftArchiveOptions): string {
  const artifactRoot = assetAuthoringReleaseArtifactRoot(
    options.workspace,
    options.session.sessionId,
  );
  const requested = options.outputPath === undefined
    ? path.join(
      artifactRoot,
      `${options.session.plan.pack.id}-${options.session.plan.pack.version}.draft.lpc-assets.zip`,
    )
    : path.resolve(options.cwd, options.outputPath);
  if (
    requested === artifactRoot
    || !isInsideRoot(artifactRoot, requested)
  ) {
    throw new AssetAuthoringReleaseLifecycleError(
      'asset_authoring_draft_path_invalid',
      `Draft archive output must stay inside the session-owned release-artifact root: ${requested}.`,
      requested,
    );
  }
  ensureContainedDirectory(artifactRoot, path.dirname(requested), 'Draft archive parent');
  return requested;
}

function publishDraftArchive(
  archivePath: string,
  archiveBytes: Buffer,
): boolean {
  const expectedDigest = sha256(archiveBytes);
  const existing = lstatSync(archivePath, { throwIfNoEntry: false });
  if (existing !== undefined) {
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new AssetAuthoringReleaseLifecycleError(
        'asset_authoring_draft_path_invalid',
        `Draft archive output must be a regular file: ${archivePath}.`,
        archivePath,
      );
    }
    const existingBytes = readFileSync(archivePath);
    if (sha256(existingBytes) === expectedDigest) return true;
    throw new AssetAuthoringReleaseLifecycleError(
      'asset_authoring_draft_archive_conflict',
      `Draft archive output already contains different bytes: ${archivePath}.`,
      archivePath,
    );
  }

  const temporaryPath = `${archivePath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, archiveBytes, { flag: 'wx', mode: 0o600 });
    const writtenBytes = readFileSync(temporaryPath);
    if (sha256(writtenBytes) !== expectedDigest) {
      throw new AssetAuthoringReleaseLifecycleError(
        'asset_authoring_draft_archive_failed',
        `Draft archive temporary bytes did not match the generated digest: ${archivePath}.`,
        archivePath,
      );
    }
    linkSync(temporaryPath, archivePath);
    return false;
  } catch (error) {
    if (error instanceof AssetAuthoringReleaseLifecycleError) throw error;
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      const raced = lstatSync(archivePath, { throwIfNoEntry: false });
      if (raced?.isFile() && sha256(readFileSync(archivePath)) === expectedDigest) {
        return true;
      }
      throw new AssetAuthoringReleaseLifecycleError(
        'asset_authoring_draft_archive_conflict',
        `Draft archive output already contains different bytes: ${archivePath}.`,
        archivePath,
      );
    }
    throw new AssetAuthoringReleaseLifecycleError(
      'asset_authoring_draft_publish_failed',
      `Could not publish draft archive: ${error instanceof Error ? error.message : String(error)}.`,
      archivePath,
    );
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function sourceDigestsFrom(
  sourceDigests: ReadonlyMap<string, string>,
): readonly AssetAuthoringSourceDigest[] {
  return [...sourceDigests]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourcePath, digest]) => ({ path: sourcePath, digest }));
}

export async function createDraftArchive(
  options: DraftArchiveOptions,
): Promise<DraftArchiveResult> {
  const archivePath = resolveDraftArchivePath(options);
  const loaded = await loadAssetPackFiles(options.session.packRoot);
  if (!loaded.ok) {
    const diagnostic = loaded.diagnostics[0];
    throw new AssetAuthoringReleaseLifecycleError(
      diagnostic?.code ?? 'asset_authoring_draft_source_invalid',
      diagnostic?.message ?? 'The session pack could not be captured for draft recovery.',
      diagnostic?.path,
    );
  }

  let manifestDocument: Readonly<Record<string, unknown>>;
  try {
    const parsed = JSON.parse(loaded.manifestBytes.toString('utf8')) as unknown;
    if (!isRecord(parsed)) throw new Error('Asset-pack manifest must be a JSON object.');
    manifestDocument = parsed;
  } catch (error) {
    throw new AssetAuthoringReleaseLifecycleError(
      'asset_authoring_draft_source_invalid',
      error instanceof Error ? error.message : 'The session manifest is invalid.',
      loaded.manifestPath,
    );
  }

  if (
    loaded.pack.id !== options.session.plan.pack.id
    || loaded.pack.version !== options.session.plan.pack.version
  ) {
    throw new AssetAuthoringReleaseLifecycleError(
      'asset_authoring_draft_identity_mismatch',
      'The session pack identity does not match its authoring plan.',
      loaded.manifestPath,
    );
  }

  let archive;
  try {
    archive = await createAssetPackArchive({
      kind: 'draft',
      manifestDocument,
      sourceBytes: loaded.sourceBytes,
      runtime: nodeAssetPackFormatRuntime,
    });
  } catch (error) {
    throw new AssetAuthoringReleaseLifecycleError(
      'asset_authoring_draft_archive_failed',
      error instanceof Error ? error.message : 'Could not create the draft archive.',
      archivePath,
    );
  }

  const archiveBytes = Buffer.from(archive.archiveBytes);
  const requestedRecordedAt = options.now?.() ?? new Date().toISOString();
  const recordedAtDate = new Date(requestedRecordedAt);
  if (Number.isNaN(recordedAtDate.getTime())) {
    throw new AssetAuthoringReleaseLifecycleError(
      'asset_authoring_draft_receipt_invalid',
      'Draft receipt timestamp is invalid.',
    );
  }
  const recordedAt = recordedAtDate.toISOString();
  const receipt: AssetAuthoringDraftArchiveReceipt = {
    schema: 'lpc-toolkit.asset-authoring-draft-receipt.v1',
    packId: loaded.pack.id,
    version: loaded.pack.version,
    archivePath,
    archiveDigest: sha256(archiveBytes),
    manifestDigest: sha256(loaded.manifestBytes),
    contentDigest: loaded.contentDigest,
    sourceDigests: sourceDigestsFrom(loaded.sourceDigests),
    recordedAt,
  };
  const reusedExistingArchive = publishDraftArchive(archivePath, archiveBytes);
  return { receipt, archiveBytes, reusedExistingArchive };
}
