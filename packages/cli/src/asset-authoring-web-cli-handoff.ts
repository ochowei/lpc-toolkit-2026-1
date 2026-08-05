import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  openSync,
  readSync,
} from 'node:fs';
import path from 'node:path';
import {
  assetPackSourceFromNormalized,
  assetWebCliHandoffDigestInput,
  assetWebCliHandoffStateDigestInput,
  parseAssetWebCliHandoffJson,
  type AssetWebCliHandoff,
  type AssetWebCliHandoffArchiveKind,
  type AssetWebCliHandoffSource,
} from '@lpc-toolkit/core';
import { canonicalizeJsonValue } from '@lpc-toolkit/asset-pack-format';
import {
  readAssetPackArchive,
  type AssetPackArchiveSnapshot,
} from './asset-pack-archive-format.js';
import { flagString, type ParsedArgs } from './args.js';
import {
  commandError,
  commandOk,
  type CliIssue,
  type CliResponse,
} from './response.js';

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
  readonly id: 'import-handoff' | 'export-fresh-handoff';
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

function releaseFingerprint(snapshot: AssetPackArchiveSnapshot): string {
  const source = assetPackSourceFromNormalized(snapshot.payload.pack);
  const { version: _version, status: _status, ...releaseManifest } = source;
  return digestJson({
    manifest: releaseManifest,
    sources: [...snapshot.payload.sourceDigests]
      .map(([sourcePath, digest]) => ({ sourcePath, digest })),
  });
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
  const creditOverrides = Object.fromEntries(
    [...pack.creditOverrides.entries()]
      .sort(([left], [right]) => left.localeCompare(right)),
  );
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
    creditDigest: digestJson({ credits: pack.credits, creditOverrides }),
    acknowledgementDigest: digestJson(pack.acknowledgements),
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

export async function inspectAssetWebCliHandoff(options: {
  readonly handoffPath: string;
  readonly archivePath: string;
}): Promise<AssetWebCliHandoffInspectionResult> {
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
    data: {
      state,
      handoffId: readHandoffResult.handoff.handoffId,
      binding: publicBinding,
      mismatches,
      nextAction: state === 'current' ? currentNextAction() : staleNextAction(),
    },
  };
}

export async function runAssetAuthoringWebCliHandoffCommand(options: {
  readonly parsed: ParsedArgs;
  readonly cwd: string;
}): Promise<CliResponse<AssetWebCliHandoffInspectionData | null>> {
  const subcommand = options.parsed.command[3];
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
  if (!response.ok || response.command !== 'asset authoring handoff inspect') return false;
  const data = response.data;
  return typeof data === 'object'
    && data !== null
    && !Array.isArray(data)
    && 'state' in data
    && data.state === 'stale';
}
