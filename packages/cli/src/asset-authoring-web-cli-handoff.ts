import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  ASSET_AUTHORING_WEB_HANDOFF_RECEIPT_SCHEMA,
  assetAuthoringWebHandoffReceiptDigestInput,
  assetPackSourceFromNormalized,
  assetWebCliHandoffDigestInput,
  assetWebCliHandoffStateDigestInput,
  parseAssetAuthoringPlan,
  parseAssetAuthoringWebHandoffReceiptJson,
  parseAssetWebCliHandoffJson,
  type AssetAuthoringPlan,
  type AssetAuthoringWebHandoffReceipt,
  type AssetWebCliHandoff,
  type AssetWebCliHandoffArchiveKind,
  type AssetWebCliHandoffSource,
  type NormalizedAssetPack,
} from '@lpc-toolkit/core';
import { canonicalizeJsonValue } from '@lpc-toolkit/asset-pack-format';
import {
  extractVerifiedAssetPackPayload,
  readAssetPackArchive,
  type AssetPackArchiveSnapshot,
} from './asset-pack-archive-format.js';
import { loadAssetPackFiles } from './asset-pack-files.js';
import { flagBoolean, flagString, type ParsedArgs } from './args.js';
import {
  assetAuthoringSessionPath,
  createAssetAuthoringSessionStore,
} from './asset-authoring-session.js';
import {
  commandError,
  commandOk,
  type CliIssue,
  type CliResponse,
} from './response.js';
import {
  assetAuthoringSessionsRoot,
  createAssetPackInstallStagingRoot,
  removeAssetPackInstallStagingRoot,
  type AssetPackInstallStagingRoot,
  type AssetWorkspace,
} from './asset-workspace.js';

const HANDOFF_JSON_LIMIT = 64 * 1_024;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export type AssetWebCliHandoffInspectionState = 'current' | 'stale';

export interface AssetWebCliHandoffInspectionBinding {
  readonly handoffId: string;
  readonly handoffDigest: string;
  readonly archiveDigest: string;
  readonly byteLength: number;
  readonly packId: string;
  readonly version: string;
  readonly archiveKind: AssetWebCliHandoffArchiveKind;
  readonly manifestDigest: string;
  readonly contentDigest: string;
  readonly releaseFingerprint: string;
  readonly sourceDigests: readonly AssetWebCliHandoffSource[];
  readonly creditDigest: string;
  readonly acknowledgementDigest: string;
}

export interface AssetWebCliHandoffNextAction {
  readonly id:
    | 'import-handoff'
    | 'confirm-handoff-import'
    | 'export-fresh-handoff'
    | 'validate-handoff-session';
  readonly summary: string;
  readonly command: string;
}

export interface AssetWebCliHandoffInspectionData {
  readonly state: AssetWebCliHandoffInspectionState;
  readonly handoffId: string;
  readonly binding: AssetWebCliHandoffInspectionBinding;
  readonly mismatches: readonly string[];
  readonly nextAction: AssetWebCliHandoffNextAction;
}

export interface AssetWebCliHandoffImportData {
  readonly state: 'needs-user-action' | 'imported' | 'stale';
  readonly handoffId: string;
  readonly sessionId: string | null;
  readonly idempotent: boolean;
  readonly binding: AssetWebCliHandoffInspectionBinding;
  readonly mismatches: readonly string[];
  readonly receiptDigest?: string;
  readonly nextAction: AssetWebCliHandoffNextAction;
}

interface HandoffReadResult {
  readonly ok: true;
  readonly handoff: AssetWebCliHandoff;
  readonly handoffDigest: string;
}

interface ArchiveBinding {
  readonly archiveDigest: string;
  readonly byteLength: number;
  readonly packId: string;
  readonly version: string;
  readonly archiveKind: AssetWebCliHandoffArchiveKind;
  readonly manifestDigest: string;
  readonly contentDigest: string;
  readonly releaseFingerprint: string;
  readonly sourceDigests: readonly AssetWebCliHandoffSource[];
  readonly creditDigest: string;
  readonly acknowledgementDigest: string;
}

interface HandoffInspectionSuccess {
  readonly ok: true;
  readonly data: AssetWebCliHandoffInspectionData;
}

interface HandoffInspectionFailure {
  readonly ok: false;
  readonly issue: CliIssue;
}

export type AssetWebCliHandoffInspectionResult =
  | HandoffInspectionSuccess
  | HandoffInspectionFailure;

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(value));
}

function digestJson(value: unknown): string {
  return sha256(Buffer.from(canonicalJson(value), 'utf8'));
}

function readRegularFile(filePath: string, maximumBytes: number):
  | { readonly ok: true; readonly bytes: Buffer }
  | { readonly ok: false; readonly message: string } {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      filePath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    const initial = fstatSync(descriptor);
    if (!initial.isFile()) {
      return { ok: false, message: 'Input must be a regular file.' };
    }
    if (initial.size > maximumBytes) {
      return { ok: false, message: `Input exceeds the ${String(maximumBytes)}-byte limit.` };
    }
    const bytes = Buffer.alloc(initial.size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = readSync(descriptor, bytes, offset, bytes.byteLength - offset, null);
      if (count === 0) break;
      offset += count;
    }
    const final = fstatSync(descriptor);
    if (final.size !== initial.size || offset !== initial.size) {
      return { ok: false, message: 'Input changed while it was being read.' };
    }
    return { ok: true, bytes };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Input could not be read.',
    };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function blockedIssue(message: string, issuePath?: string): HandoffInspectionFailure {
  return {
    ok: false,
    issue: {
      code: 'asset_web_cli_handoff_blocked',
      message,
      ...(issuePath === undefined ? {} : { path: issuePath }),
    },
  };
}

function readHandoff(handoffPath: string): HandoffReadResult | HandoffInspectionFailure {
  const read = readRegularFile(handoffPath, HANDOFF_JSON_LIMIT);
  if (!read.ok) return blockedIssue(`Web-to-CLI handoff could not be read: ${read.message}`, handoffPath);
  const parsed = parseAssetWebCliHandoffJson(read.bytes.toString('utf8'));
  if (!parsed.ok) {
    const details = parsed.diagnostics.map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`).join(' ');
    return blockedIssue(`Web-to-CLI handoff is invalid: ${details}`, handoffPath);
  }
  return {
    ok: true,
    handoff: parsed.handoff,
    handoffDigest: sha256(Buffer.from(assetWebCliHandoffDigestInput(parsed.handoff), 'utf8')),
  };
}

function releaseFingerprintFor(
  pack: NormalizedAssetPack,
  sourceDigests: ReadonlyMap<string, string>,
): string {
  const source = assetPackSourceFromNormalized(pack);
  const { version: _version, status: _status, ...releaseManifest } = source;
  return digestJson({
    manifest: releaseManifest,
    sources: [...sourceDigests]
      .map(([sourcePath, digest]) => ({ sourcePath, digest })),
  });
}

function releaseFingerprint(snapshot: AssetPackArchiveSnapshot): string {
  return releaseFingerprintFor(snapshot.payload.pack, snapshot.payload.sourceDigests);
}

function creditDigestFor(pack: NormalizedAssetPack): string {
  const creditOverrides = Object.fromEntries(
    [...pack.creditOverrides.entries()]
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  return digestJson({ credits: pack.credits, creditOverrides });
}

function acknowledgementDigestFor(pack: NormalizedAssetPack): string {
  return digestJson(pack.acknowledgements);
}

function sourceDigests(snapshot: AssetPackArchiveSnapshot): readonly AssetWebCliHandoffSource[] {
  return [...snapshot.payload.sourceDigests]
    .map(([path, digest]) => ({ path, digest }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function archiveBinding(snapshot: AssetPackArchiveSnapshot): ArchiveBinding | HandoffInspectionFailure {
  const pack = snapshot.payload.pack;
  if (pack.credits.authors.length === 0 || pack.credits.licenses.length === 0) {
    return blockedIssue('The selected archive does not contain required author and license credits.');
  }
  return {
    archiveDigest: snapshot.archiveDigest,
    byteLength: snapshot.archiveBytes.byteLength,
    packId: pack.id,
    version: pack.version,
    archiveKind: pack.status === 'draft' ? 'draft' : 'formal',
    manifestDigest: sha256(snapshot.manifestBytes),
    contentDigest: snapshot.payload.contentDigest,
    releaseFingerprint: releaseFingerprint(snapshot),
    sourceDigests: sourceDigests(snapshot),
    creditDigest: creditDigestFor(pack),
    acknowledgementDigest: acknowledgementDigestFor(pack),
  };
}

function isInspectionFailure(
  value: ArchiveBinding | HandoffInspectionFailure,
): value is HandoffInspectionFailure {
  return 'ok' in value && value.ok === false;
}

function equalSources(
  left: readonly AssetWebCliHandoffSource[],
  right: readonly AssetWebCliHandoffSource[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((source, index) => {
    const other = right[index];
    return other !== undefined && source.path === other.path && source.digest === other.digest;
  });
}

function mismatchesFor(
  handoff: AssetWebCliHandoff,
  handoffDigest: string,
  archive: ArchiveBinding,
): readonly string[] {
  const mismatches: string[] = [];
  const expectedStateDigest = sha256(
    Buffer.from(assetWebCliHandoffStateDigestInput(handoff), 'utf8'),
  );
  if (handoff.web.stateDigest !== expectedStateDigest) mismatches.push('stateDigest');
  if (handoffDigest.length === 0 || !DIGEST_PATTERN.test(handoffDigest)) mismatches.push('handoffDigest');
  if (handoff.payload.archiveDigest !== archive.archiveDigest) mismatches.push('archiveDigest');
  if (handoff.payload.byteLength !== archive.byteLength) mismatches.push('byteLength');
  if (handoff.pack.id !== archive.packId) mismatches.push('packId');
  if (handoff.pack.version !== archive.version) mismatches.push('version');
  if (handoff.pack.archiveKind !== archive.archiveKind) mismatches.push('archiveKind');
  if (handoff.pack.manifestDigest !== archive.manifestDigest) mismatches.push('manifestDigest');
  if (handoff.pack.contentDigest !== archive.contentDigest) mismatches.push('contentDigest');
  if (handoff.pack.releaseFingerprint !== archive.releaseFingerprint) mismatches.push('releaseFingerprint');
  if (!equalSources(handoff.sources, archive.sourceDigests)) mismatches.push('sourceDigests');
  if (handoff.attribution.creditDigest !== archive.creditDigest) mismatches.push('creditDigest');
  if (handoff.attribution.acknowledgementDigest !== archive.acknowledgementDigest) mismatches.push('acknowledgementDigest');
  return mismatches;
}

function currentNextAction(): AssetWebCliHandoffNextAction {
  return {
    id: 'import-handoff',
    summary: 'Import only after reviewing the pair and selecting an attach-pack plan.',
    command: 'asset authoring handoff import --handoff <handoff.json> --archive <pack.lpc-assets.zip> --plan <attach-pack-plan.json> --confirm',
  };
}

function staleNextAction(): AssetWebCliHandoffNextAction {
  return {
    id: 'export-fresh-handoff',
    summary: 'Export a fresh Web-to-CLI archive and handoff sidecar from one revision.',
    command: 'Web export for CLI',
  };
}

function confirmImportNextAction(): AssetWebCliHandoffNextAction {
  return {
    id: 'confirm-handoff-import',
    summary: 'Review the exact handoff, archive, and attach-pack plan before confirming this CLI import.',
    command: 'asset authoring handoff import --handoff <handoff.json> --archive <pack.lpc-assets.zip> --plan <attach-pack-plan.json> --confirm',
  };
}

function validateImportedSessionNextAction(): AssetWebCliHandoffNextAction {
  return {
    id: 'validate-handoff-session',
    summary: 'Run the existing CLI validation workflow; this handoff is not release approval.',
    command: 'asset authoring validate --session <session-id> --workspace <directory>',
  };
}

interface HandoffInspectionPair {
  readonly handoff: AssetWebCliHandoff;
  readonly handoffDigest: string;
  readonly snapshot: AssetPackArchiveSnapshot;
  readonly binding: ArchiveBinding;
  readonly data: AssetWebCliHandoffInspectionData;
}

interface HandoffInspectionPairSuccess {
  readonly ok: true;
  readonly pair: HandoffInspectionPair;
}

type HandoffInspectionPairResult =
  | HandoffInspectionPairSuccess
  | HandoffInspectionFailure;

async function inspectHandoffPair(options: {
  readonly handoffPath: string;
  readonly archivePath: string;
}): Promise<HandoffInspectionPairResult> {
  const readHandoffResult = readHandoff(options.handoffPath);
  if (!readHandoffResult.ok) return readHandoffResult;
  const archive = await readAssetPackArchive({ archivePath: options.archivePath });
  if (!archive.ok) {
    const details = archive.diagnostics.map((diagnostic) => diagnostic.message).join(' ');
    return blockedIssue(`The selected asset-pack archive is blocked: ${details}`, options.archivePath);
  }
  const binding = archiveBinding(archive.snapshot);
  if (isInspectionFailure(binding)) return binding;
  const mismatches = mismatchesFor(
    readHandoffResult.handoff,
    readHandoffResult.handoffDigest,
    binding,
  );
  const state: AssetWebCliHandoffInspectionState = mismatches.length === 0 ? 'current' : 'stale';
  const publicBinding: AssetWebCliHandoffInspectionBinding = {
    handoffId: readHandoffResult.handoff.handoffId,
    handoffDigest: readHandoffResult.handoffDigest,
    archiveDigest: binding.archiveDigest,
    byteLength: binding.byteLength,
    packId: binding.packId,
    version: binding.version,
    archiveKind: binding.archiveKind,
    manifestDigest: binding.manifestDigest,
    contentDigest: binding.contentDigest,
    releaseFingerprint: binding.releaseFingerprint,
    sourceDigests: binding.sourceDigests,
    creditDigest: binding.creditDigest,
    acknowledgementDigest: binding.acknowledgementDigest,
  };
  return {
    ok: true,
    pair: {
      handoff: readHandoffResult.handoff,
      handoffDigest: readHandoffResult.handoffDigest,
      snapshot: archive.snapshot,
      binding,
      data: {
        state,
        handoffId: readHandoffResult.handoff.handoffId,
        binding: publicBinding,
        mismatches,
        nextAction: state === 'current' ? currentNextAction() : staleNextAction(),
      },
    },
  };
}

export async function inspectAssetWebCliHandoff(options: {
  readonly handoffPath: string;
  readonly archivePath: string;
}): Promise<AssetWebCliHandoffInspectionResult> {
  const inspected = await inspectHandoffPair(options);
  if (!inspected.ok) return inspected;
  return { ok: true, data: inspected.pair.data };
}

function importBlockedIssue(message: string, issuePath?: string): HandoffInspectionFailure {
  return {
    ok: false,
    issue: {
      code: 'asset_web_cli_handoff_import_blocked',
      message,
      ...(issuePath === undefined ? {} : { path: issuePath }),
    },
  };
}

function importConflictIssue(message: string, issuePath?: string): HandoffInspectionFailure {
  return {
    ok: false,
    issue: {
      code: 'asset_web_cli_handoff_import_conflict',
      message,
      ...(issuePath === undefined ? {} : { path: issuePath }),
    },
  };
}

function readAttachPlan(planPath: string):
  | { readonly ok: true; readonly plan: AssetAuthoringPlan; readonly planDigest: string }
  | HandoffInspectionFailure {
  const read = readRegularFile(planPath, HANDOFF_JSON_LIMIT);
  if (!read.ok) {
    return importBlockedIssue(`Attach-pack plan could not be read: ${read.message}`, planPath);
  }
  let input: unknown;
  try {
    input = JSON.parse(read.bytes.toString('utf8')) as unknown;
  } catch {
    return importBlockedIssue('Attach-pack plan must be valid JSON.', planPath);
  }
  const parsed = parseAssetAuthoringPlan(input);
  if (!parsed.ok) {
    const details = parsed.diagnostics
      .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
      .join(' ');
    return importBlockedIssue(`Attach-pack plan is invalid: ${details}`, planPath);
  }
  return {
    ok: true,
    plan: parsed.plan,
    planDigest: digestJson(parsed.plan),
  };
}

function validateAttachPlan(
  plan: AssetAuthoringPlan,
  binding: ArchiveBinding,
  planPath: string,
): HandoffInspectionFailure | undefined {
  if (plan.goal !== 'attach-pack') {
    return importBlockedIssue('The selected plan must use goal: attach-pack.', planPath);
  }
  if (plan.pack.id !== binding.packId || plan.pack.version !== binding.version) {
    return importBlockedIssue(
      `Attach-pack plan identity ${plan.pack.id}@${plan.pack.version} does not match the inspected archive ${binding.packId}@${binding.version}.`,
      planPath,
    );
  }
  if (plan.scope.packId !== binding.packId || plan.scope.assetId !== undefined) {
    return importBlockedIssue(
      'Attach-pack plan scope must select the inspected pack and must not select an individual asset.',
      planPath,
    );
  }
  if (!plan.scope.paths.includes('asset-pack.json')) {
    return importBlockedIssue(
      'Attach-pack plan scope must include asset-pack.json.',
      planPath,
    );
  }
  return undefined;
}

function publicBindingFor(
  handoffId: string,
  handoffDigest: string,
  binding: ArchiveBinding,
): AssetWebCliHandoffInspectionBinding {
  return {
    handoffId,
    handoffDigest,
    archiveDigest: binding.archiveDigest,
    byteLength: binding.byteLength,
    packId: binding.packId,
    version: binding.version,
    archiveKind: binding.archiveKind,
    manifestDigest: binding.manifestDigest,
    contentDigest: binding.contentDigest,
    releaseFingerprint: binding.releaseFingerprint,
    sourceDigests: binding.sourceDigests,
    creditDigest: binding.creditDigest,
    acknowledgementDigest: binding.acknowledgementDigest,
  };
}

function importDataFor(
  pair: HandoffInspectionPair,
  state: AssetWebCliHandoffImportData['state'],
  nextAction: AssetWebCliHandoffNextAction,
  options: {
    readonly sessionId?: string | null;
    readonly idempotent?: boolean;
    readonly mismatches?: readonly string[];
    readonly receiptDigest?: string;
  } = {},
): AssetWebCliHandoffImportData {
  return {
    state,
    handoffId: pair.handoff.handoffId,
    sessionId: options.sessionId ?? null,
    idempotent: options.idempotent ?? false,
    binding: publicBindingFor(pair.handoff.handoffId, pair.handoffDigest, pair.binding),
    mismatches: options.mismatches ?? [],
    ...(options.receiptDigest === undefined ? {} : { receiptDigest: options.receiptDigest }),
    nextAction,
  };
}

function sourceDigestsFromMap(
  sourceDigestMap: ReadonlyMap<string, string>,
): readonly AssetWebCliHandoffSource[] {
  return [...sourceDigestMap]
    .map(([sourcePath, digest]) => ({ path: sourcePath, digest }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function stagedMismatches(
  loaded: Awaited<ReturnType<typeof loadAssetPackFiles>> & { readonly ok: true },
  binding: ArchiveBinding,
): readonly string[] {
  const mismatches: string[] = [];
  if (sha256(loaded.manifestBytes) !== binding.manifestDigest) mismatches.push('manifestDigest');
  if (loaded.contentDigest !== binding.contentDigest) mismatches.push('contentDigest');
  if (loaded.pack.id !== binding.packId) mismatches.push('packId');
  if (loaded.pack.version !== binding.version) mismatches.push('version');
  const archiveKind = loaded.pack.status === 'draft' ? 'draft' : 'formal';
  if (archiveKind !== binding.archiveKind) mismatches.push('archiveKind');
  if (releaseFingerprintFor(loaded.pack, loaded.sourceDigests) !== binding.releaseFingerprint) {
    mismatches.push('releaseFingerprint');
  }
  if (!equalSources(sourceDigestsFromMap(loaded.sourceDigests), binding.sourceDigests)) {
    mismatches.push('sourceDigests');
  }
  if (creditDigestFor(loaded.pack) !== binding.creditDigest) mismatches.push('creditDigest');
  if (acknowledgementDigestFor(loaded.pack) !== binding.acknowledgementDigest) {
    mismatches.push('acknowledgementDigest');
  }
  return mismatches;
}

interface OwnedDirectory {
  readonly path: string;
  readonly device: number;
  readonly inode: number;
}

function captureOwnedDirectory(directory: string): OwnedDirectory {
  const status = lstatSync(directory, { throwIfNoEntry: false });
  if (!status || status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(`Expected a newly created directory: ${directory}`);
  }
  return { path: directory, device: status.dev, inode: status.ino };
}

function removeOwnedDirectory(directory: OwnedDirectory | undefined): void {
  if (directory === undefined) return;
  const status = lstatSync(directory.path, { throwIfNoEntry: false });
  if (
    !status
    || status.isSymbolicLink()
    || !status.isDirectory()
    || status.dev !== directory.device
    || status.ino !== directory.inode
  ) {
    return;
  }
  rmSync(directory.path, { recursive: true, force: true });
}

function writeNewFileAtomically(filePath: string, bytes: Buffer): void {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, bytes, { flag: 'wx', mode: 0o600 });
    if (lstatSync(filePath, { throwIfNoEntry: false }) !== undefined) {
      throw new Error(`Refusing to replace an existing file: ${filePath}`);
    }
    renameSync(temporaryPath, filePath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function receiptDigest(receipt: AssetAuthoringWebHandoffReceipt): string {
  return sha256(Buffer.from(assetAuthoringWebHandoffReceiptDigestInput(receipt), 'utf8'));
}

function receiptMatches(
  receipt: AssetAuthoringWebHandoffReceipt,
  pair: HandoffInspectionPair,
): boolean {
  return receipt.handoffId === pair.handoff.handoffId
    && receipt.handoffDigest === pair.handoffDigest
    && receipt.archiveDigest === pair.binding.archiveDigest
    && receipt.manifestDigest === pair.binding.manifestDigest
    && receipt.contentDigest === pair.binding.contentDigest
    && receipt.creditDigest === pair.binding.creditDigest
    && equalSources(receipt.sourceDigests, pair.binding.sourceDigests);
}

interface ExistingImportMatch {
  readonly sessionId: string;
  readonly receiptDigest: string;
}

async function findExistingImport(options: {
  readonly workspace: AssetWorkspace;
  readonly packRoot: string;
  readonly pair: HandoffInspectionPair;
  readonly planDigest: string;
}): Promise<ExistingImportMatch | HandoffInspectionFailure | undefined> {
  const sessionsRoot = assetAuthoringSessionsRoot(options.workspace);
  const rootStatus = lstatSync(sessionsRoot, { throwIfNoEntry: false });
  if (rootStatus === undefined) return undefined;
  if (rootStatus.isSymbolicLink() || !rootStatus.isDirectory()) {
    return importBlockedIssue('The authoring session root is not a safe directory.', sessionsRoot);
  }

  let entries: readonly string[];
  try {
    entries = readdirSync(sessionsRoot);
  } catch (error) {
    return importBlockedIssue(
      `Authoring sessions could not be inspected: ${error instanceof Error ? error.message : String(error)}.`,
      sessionsRoot,
    );
  }

  const store = createAssetAuthoringSessionStore(options.workspace);
  for (const entry of [...entries].sort()) {
    const sessionDirectory = path.join(sessionsRoot, entry);
    const sessionStatus = lstatSync(sessionDirectory, { throwIfNoEntry: false });
    if (sessionStatus === undefined) continue;
    if (sessionStatus.isSymbolicLink()) {
      return importBlockedIssue('The authoring session root contains a symbolic link.', sessionDirectory);
    }
    if (!sessionStatus.isDirectory()) continue;
    const receiptPath = path.join(sessionDirectory, 'web-handoff-receipt.json');
    const receiptStatus = lstatSync(receiptPath, { throwIfNoEntry: false });
    if (receiptStatus === undefined) continue;
    if (receiptStatus.isSymbolicLink() || !receiptStatus.isFile()) {
      return importBlockedIssue('The existing Web-handoff receipt is not a regular file.', receiptPath);
    }
    const read = readRegularFile(receiptPath, HANDOFF_JSON_LIMIT);
    if (!read.ok) return importBlockedIssue(`Web-handoff receipt could not be read: ${read.message}`, receiptPath);
    const parsed = parseAssetAuthoringWebHandoffReceiptJson(read.bytes.toString('utf8'));
    if (!parsed.ok) {
      return importBlockedIssue('The existing Web-handoff receipt is invalid.', receiptPath);
    }
    if (!receiptMatches(parsed.receipt, options.pair)) continue;
    if (parsed.receipt.sessionId !== entry) {
      return importConflictIssue('The matching Web-handoff receipt does not belong to its session directory.', receiptPath);
    }
    let session;
    try {
      session = store.read(parsed.receipt.sessionId);
    } catch (error) {
      return importConflictIssue(
        `The matching authoring session could not be read: ${error instanceof Error ? error.message : String(error)}.`,
        assetAuthoringSessionPath(options.workspace, parsed.receipt.sessionId),
      );
    }
    if (session.packRoot !== options.packRoot || digestJson(session.plan) !== options.planDigest) {
      return importConflictIssue('The existing Web-handoff import has a conflicting plan or destination.');
    }
    const loaded = await loadAssetPackFiles(options.packRoot);
    if (!loaded.ok) {
      return importConflictIssue('The existing Web-handoff import pack no longer passes pack-file validation.');
    }
    if (stagedMismatches(loaded, options.pair.binding).length > 0) {
      return importConflictIssue('The existing Web-handoff import pack no longer matches its receipt bindings.');
    }
    return {
      sessionId: parsed.receipt.sessionId,
      receiptDigest: receiptDigest(parsed.receipt),
    };
  }
  return undefined;
}

function destinationPackRoot(
  workspace: AssetWorkspace,
  packId: string,
): string | HandoffInspectionFailure {
  const packsRoot = path.resolve(workspace.packsRoot);
  const packRoot = path.resolve(packsRoot, packId);
  if (path.dirname(packRoot) !== packsRoot) {
    return importBlockedIssue('The inspected pack identity cannot be contained in the selected workspace.');
  }
  const rootStatus = lstatSync(packsRoot, { throwIfNoEntry: false });
  if (rootStatus === undefined || rootStatus.isSymbolicLink() || !rootStatus.isDirectory()) {
    return importBlockedIssue('The selected workspace pack root is not a safe directory.', packsRoot);
  }
  return packRoot;
}

function staleImportData(
  pair: HandoffInspectionPair,
  mismatches: readonly string[],
): CliResponse<AssetWebCliHandoffImportData> {
  return commandOk(
    'asset authoring handoff import',
    importDataFor(pair, 'stale', staleNextAction(), { mismatches }),
  );
}

async function importAssetWebCliHandoff(options: {
  readonly handoffPath: string;
  readonly archivePath: string;
  readonly planPath: string;
  readonly confirm: boolean;
  readonly workspace: AssetWorkspace;
}): Promise<CliResponse<AssetWebCliHandoffImportData | null>> {
  const initial = await inspectHandoffPair({
    handoffPath: options.handoffPath,
    archivePath: options.archivePath,
  });
  if (!initial.ok) return commandError('asset authoring handoff import', initial.issue);
  const initialPlan = readAttachPlan(options.planPath);
  if (!initialPlan.ok) return commandError('asset authoring handoff import', initialPlan.issue);
  const initialPlanIssue = validateAttachPlan(initialPlan.plan, initial.pair.binding, options.planPath);
  if (initialPlanIssue) return commandError('asset authoring handoff import', initialPlanIssue.issue);
  if (initial.pair.data.state === 'stale') {
    return staleImportData(initial.pair, initial.pair.data.mismatches);
  }
  if (!options.confirm) {
    return commandOk(
      'asset authoring handoff import',
      importDataFor(initial.pair, 'needs-user-action', confirmImportNextAction()),
    );
  }

  const latest = await inspectHandoffPair({
    handoffPath: options.handoffPath,
    archivePath: options.archivePath,
  });
  if (!latest.ok) return commandError('asset authoring handoff import', latest.issue);
  if (latest.pair.data.state === 'stale') {
    return staleImportData(latest.pair, latest.pair.data.mismatches);
  }
  const latestPlan = readAttachPlan(options.planPath);
  if (!latestPlan.ok) return commandError('asset authoring handoff import', latestPlan.issue);
  const latestPlanIssue = validateAttachPlan(latestPlan.plan, latest.pair.binding, options.planPath);
  if (latestPlanIssue) return commandError('asset authoring handoff import', latestPlanIssue.issue);
  if (latestPlan.planDigest !== initialPlan.planDigest) {
    return staleImportData(latest.pair, ['planDigest']);
  }

  const packRoot = destinationPackRoot(options.workspace, latest.pair.binding.packId);
  if (typeof packRoot !== 'string') return commandError('asset authoring handoff import', packRoot.issue);
  const existing = await findExistingImport({
    workspace: options.workspace,
    packRoot,
    pair: latest.pair,
    planDigest: latestPlan.planDigest,
  });
  if (existing !== undefined && 'ok' in existing && existing.ok === false) {
    return commandError('asset authoring handoff import', existing.issue);
  }
  if (existing !== undefined && !('ok' in existing)) {
    return commandOk(
      'asset authoring handoff import',
      importDataFor(latest.pair, 'imported', validateImportedSessionNextAction(), {
        sessionId: existing.sessionId,
        idempotent: true,
        receiptDigest: existing.receiptDigest,
      }),
    );
  }
  const destinationStatus = lstatSync(packRoot, { throwIfNoEntry: false });
  if (destinationStatus !== undefined) {
    return commandError(
      'asset authoring handoff import',
      importConflictIssue('The selected workspace already contains the target pack; import will not overwrite it.', packRoot).issue,
    );
  }

  let staging: AssetPackInstallStagingRoot | undefined;
  let stagingPublished = false;
  let publishedPack: OwnedDirectory | undefined;
  let createdSession: OwnedDirectory | undefined;
  let completed = false;
  try {
    staging = createAssetPackInstallStagingRoot(
      options.workspace,
      (targetDirectory) => extractVerifiedAssetPackPayload({
        snapshot: latest.pair.snapshot,
        targetDirectory,
      }),
    );
    const staged = await loadAssetPackFiles(staging.path);
    if (!staged.ok) {
      const details = staged.diagnostics.map((diagnostic) => diagnostic.message).join(' ');
      return commandError(
        'asset authoring handoff import',
        importBlockedIssue(`The staged archive payload is invalid: ${details}`).issue,
      );
    }
    const stagedMismatchList = stagedMismatches(staged, latest.pair.binding);
    if (stagedMismatchList.length > 0) {
      return commandError(
        'asset authoring handoff import',
        importBlockedIssue(`The staged archive payload changed during import: ${stagedMismatchList.join(', ')}.`).issue,
      );
    }
    if (lstatSync(packRoot, { throwIfNoEntry: false }) !== undefined) {
      return commandError(
        'asset authoring handoff import',
        importConflictIssue('The target pack appeared during staging; import will not overwrite it.', packRoot).issue,
      );
    }
    renameSync(staging.path, packRoot);
    stagingPublished = true;
    publishedPack = captureOwnedDirectory(packRoot);

    const store = createAssetAuthoringSessionStore(options.workspace);
    let session = store.create({ plan: latestPlan.plan, packRoot });
    const sessionDirectory = path.dirname(assetAuthoringSessionPath(options.workspace, session.sessionId));
    createdSession = captureOwnedDirectory(sessionDirectory);
    const manifestDigest = sha256(staged.manifestBytes);
    writeNewFileAtomically(path.join(sessionDirectory, 'manifest.snapshot.json'), staged.manifestBytes);
    session = store.replace(session.sessionId, {
      state: 'needs-user-action',
      reason: 'pack-attached',
      phase: 'scaffolded',
      checkpointFreshness: 'current',
      checkpoint: {
        id: 'manifest',
        phase: 'scaffolded',
        digest: manifestDigest,
        freshness: 'current',
      },
      manifestDigest,
    });
    const receipt: AssetAuthoringWebHandoffReceipt = {
      schema: ASSET_AUTHORING_WEB_HANDOFF_RECEIPT_SCHEMA,
      handoffId: latest.pair.handoff.handoffId,
      handoffDigest: latest.pair.handoffDigest,
      archiveDigest: latest.pair.binding.archiveDigest,
      sessionId: session.sessionId,
      manifestDigest,
      contentDigest: staged.contentDigest,
      sourceDigests: sourceDigestsFromMap(staged.sourceDigests),
      creditDigest: creditDigestFor(staged.pack),
      status: 'imported',
      recordedAt: new Date().toISOString(),
    };
    writeNewFileAtomically(
      path.join(sessionDirectory, 'web-handoff-receipt.json'),
      Buffer.from(`${JSON.stringify(receipt)}\n`, 'utf8'),
    );
    completed = true;
    return commandOk(
      'asset authoring handoff import',
      importDataFor(latest.pair, 'imported', validateImportedSessionNextAction(), {
        sessionId: session.sessionId,
        receiptDigest: receiptDigest(receipt),
      }),
    );
  } catch (error) {
    return commandError(
      'asset authoring handoff import',
      importBlockedIssue(`Web-to-CLI handoff import could not be completed: ${error instanceof Error ? error.message : String(error)}.`).issue,
    );
  } finally {
    if (!completed) {
      removeOwnedDirectory(createdSession);
      removeOwnedDirectory(publishedPack);
      if (staging !== undefined && !stagingPublished) {
        try {
          removeAssetPackInstallStagingRoot(options.workspace, staging);
        } catch {
          // Preserve a staging root whose identity no longer matches for explicit recovery.
        }
      }
    }
  }
}

export async function runAssetAuthoringWebCliHandoffCommand(options: {
  readonly parsed: ParsedArgs;
  readonly cwd: string;
  readonly workspace?: AssetWorkspace;
}): Promise<CliResponse<AssetWebCliHandoffInspectionData | AssetWebCliHandoffImportData | null>> {
  const subcommand = options.parsed.command[3];
  if (subcommand === 'import') {
    const handoffPath = flagString(options.parsed.flags, 'handoff');
    const archivePath = flagString(options.parsed.flags, 'archive');
    const planPath = flagString(options.parsed.flags, 'plan');
    if (handoffPath === undefined || archivePath === undefined || planPath === undefined) {
      return commandError('asset authoring handoff import', {
        code: 'missing_argument',
        message: '--handoff, --archive, and --plan are required.',
      });
    }
    if (options.workspace === undefined) {
      return commandError('asset authoring handoff import', {
        code: 'asset_workspace_not_found',
        message: 'An asset workspace is required for Web-to-CLI handoff import.',
        path: '--workspace',
      });
    }
    return importAssetWebCliHandoff({
      handoffPath: path.resolve(options.cwd, handoffPath),
      archivePath: path.resolve(options.cwd, archivePath),
      planPath: path.resolve(options.cwd, planPath),
      confirm: flagBoolean(options.parsed.flags, 'confirm'),
      workspace: options.workspace,
    });
  }
  if (subcommand !== 'inspect') {
    return commandError(options.parsed.command.join(' '), {
      code: 'asset_authoring_web_cli_handoff_deferred',
      message: `Web-to-CLI handoff command is deferred to a later task: ${options.parsed.command.join(' ')}.`,
    });
  }
  const handoffPath = flagString(options.parsed.flags, 'handoff');
  const archivePath = flagString(options.parsed.flags, 'archive');
  if (handoffPath === undefined || archivePath === undefined) {
    return commandError('asset authoring handoff inspect', {
      code: 'missing_argument',
      message: '--handoff and --archive are required.',
    });
  }
  const result = await inspectAssetWebCliHandoff({
    handoffPath: path.resolve(options.cwd, handoffPath),
    archivePath: path.resolve(options.cwd, archivePath),
  });
  if (!result.ok) return commandError('asset authoring handoff inspect', result.issue);
  return commandOk('asset authoring handoff inspect', result.data);
}

export function isStaleAssetWebCliHandoffResponse(
  response: CliResponse<unknown>,
): boolean {
  if (
    !response.ok
    || (
      response.command !== 'asset authoring handoff inspect'
      && response.command !== 'asset authoring handoff import'
    )
  ) return false;
  const data = response.data;
  return typeof data === 'object'
    && data !== null
    && !Array.isArray(data)
    && 'state' in data
    && data.state === 'stale';
}
