import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  compileAssetPacks,
  creditsToCsv,
  type AssetPackCompilePlan,
  type AssetPackDiagnostic,
  type CreditEntry,
  type CreditsManifest,
  type NormalizedAssetPack,
} from '@lpc-toolkit/core';
import {
  ASSET_OUTPUT_MARKER_SCHEMA,
  assertManagedAssetOutput,
  type AssetWorkspace,
} from './asset-workspace.js';
import {
  ASSET_WORKSPACE_REGISTRY_SCHEMA,
  assetPackCompileDigest,
  assetPackCompileProjectionFromPlan,
  auditPublishedManagedOutput,
  readAssetPackRegistry,
  resolveLinkedAssetPackDirectory,
  verifyInstalledAssetPackDirectory,
  type AssetPackLifecycleDiagnostic,
  type AssetPackRegistryDocument,
  type AssetPackRegistryEntry,
  type AssetPackRegistryV1Read,
  type LinkedAssetPackRegistryEntryV1,
} from './asset-pack-registry.js';
import {
  loadAssetPackFiles,
  type AssetPackDirectoryFileOps,
  type AssetPackFileDiagnostic,
} from './asset-pack-files.js';
import type { AssetPackPayloadSuccess } from './asset-pack-payload.js';
import {
  loadActiveAssetPackBaseline,
  validateAssetPackPayload,
} from './asset-pack-validation.js';
import type { RuntimeAssets } from './runtime-assets.js';

const OUTPUT_MARKER_FILE = '.lpc-toolkit-managed.json';
const OUTPUT_MARKER_KEYS = ['schema', 'workspaceId'] as const;

type RegistrySourceEntry = AssetPackRegistryEntry | LinkedAssetPackRegistryEntryV1;

interface AssetPackSourceSnapshot {
  readonly packId: string;
  readonly version: string;
  readonly displayName: string;
  readonly contentDigest: string;
  readonly sourceDigests: Readonly<Record<string, string>>;
}

export interface ValidatedActiveAssetPack {
  readonly kind: 'linked' | 'installed';
  readonly sourceDirectory: string;
  readonly archiveDigest?: string;
  readonly loaded: AssetPackPayloadSuccess;
  readonly diagnostics: readonly AssetPackLifecycleDiagnostic[];
}

export type AssetPackStateMutation =
  | { readonly kind: 'upsert'; readonly candidate: ValidatedActiveAssetPack }
  | { readonly kind: 'remove'; readonly packId: string }
  | { readonly kind: 'none' };

export interface AssetPackDesiredState {
  readonly ok: true;
  readonly active: readonly ValidatedActiveAssetPack[];
  readonly compilePlan: AssetPackCompilePlan;
  readonly outputFiles: ReadonlyMap<string, Buffer>;
  readonly registry: AssetPackRegistryDocument;
  readonly warnings: readonly AssetPackLifecycleDiagnostic[];
}

export type AssetPackDesiredStateResult =
  | AssetPackDesiredState
  | { readonly ok: false; readonly diagnostics: readonly AssetPackLifecycleDiagnostic[] };

export type LinkedAssetPackCandidateResult =
  | { readonly ok: true; readonly candidate: ValidatedActiveAssetPack }
  | { readonly ok: false; readonly diagnostics: readonly AssetPackLifecycleDiagnostic[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function failure(
  diagnostics: readonly AssetPackLifecycleDiagnostic[],
): Exclude<AssetPackDesiredStateResult, AssetPackDesiredState> {
  return { ok: false, diagnostics };
}

function candidateFailure(
  diagnostics: readonly AssetPackLifecycleDiagnostic[],
): Exclude<LinkedAssetPackCandidateResult, { readonly ok: true }> {
  return { ok: false, diagnostics };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)] as const),
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sortedJsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(canonicalize(value), null, 2)}\n`);
}

function sha256Buffer(buffer: Buffer): string {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function sortedRecord(
  record: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function digestRecord(
  digests: ReadonlyMap<string, string>,
): Readonly<Record<string, string>> {
  return sortedRecord(Object.fromEntries(digests));
}

function toLifecycleDiagnostic(
  diagnostic: AssetPackDiagnostic | AssetPackFileDiagnostic,
  fallbackPackId?: string,
): AssetPackLifecycleDiagnostic {
  const details: Record<string, unknown> = {
    ...(diagnostic.details ?? {}),
  };
  if ('assetId' in diagnostic && diagnostic.assetId) details.assetId = diagnostic.assetId;
  if ('sourcePath' in diagnostic && diagnostic.sourcePath) details.sourcePath = diagnostic.sourcePath;
  if ('destinationPath' in diagnostic && diagnostic.destinationPath) {
    details.destinationPath = diagnostic.destinationPath;
  }
  return {
    code: diagnostic.code,
    severity: 'severity' in diagnostic ? diagnostic.severity : 'error',
    message: diagnostic.message,
    ...('path' in diagnostic && diagnostic.path ? { path: diagnostic.path } : {}),
    ...('packId' in diagnostic && diagnostic.packId
      ? { packId: diagnostic.packId }
      : fallbackPackId
        ? { packId: fallbackPackId }
        : {}),
    ...(Object.keys(details).length > 0 ? { details } : {}),
  };
}

function readOutputMarker(workspace: AssetWorkspace): {
  readonly workspaceId: string;
  readonly bytes: Buffer;
} {
  assertManagedAssetOutput(workspace);
  if (!statSync(workspace.outputRoot).isDirectory()) {
    throw new Error(`Managed asset output directory does not exist: ${workspace.outputRoot}`);
  }
  if (existsSync(workspace.registryPath) && statSync(workspace.registryPath).isDirectory()) {
    throw new Error(`Cannot read asset-pack registry from a directory: ${workspace.registryPath}`);
  }
  const markerPath = path.join(workspace.outputRoot, OUTPUT_MARKER_FILE);
  const bytes = readFileSync(markerPath);
  const marker = JSON.parse(bytes.toString('utf8')) as unknown;
  if (!isRecord(marker)) throw new Error('Asset output marker must be a JSON object.');
  const keys = Object.keys(marker).sort((left, right) => left.localeCompare(right));
  const expected = [...OUTPUT_MARKER_KEYS].sort((left, right) => left.localeCompare(right));
  if (canonicalJson(keys) !== canonicalJson(expected)) {
    throw new Error(`Asset output marker must contain exactly: ${OUTPUT_MARKER_KEYS.join(', ')}.`);
  }
  if (marker.schema !== ASSET_OUTPUT_MARKER_SCHEMA) {
    throw new Error(`Unknown asset output marker schema: ${String(marker.schema)}`);
  }
  if (typeof marker.workspaceId !== 'string' || marker.workspaceId.length === 0) {
    throw new Error('Asset output marker must include a string workspaceId.');
  }
  return { workspaceId: marker.workspaceId, bytes: Buffer.from(bytes) };
}

function sourceSnapshotMatches(
  loaded: AssetPackPayloadSuccess,
  entry: AssetPackSourceSnapshot,
): boolean {
  return loaded.pack.id === entry.packId
    && loaded.pack.version === entry.version
    && loaded.pack.displayName === entry.displayName
    && loaded.contentDigest === entry.contentDigest
    && canonicalJson(digestRecord(loaded.sourceDigests)) === canonicalJson(entry.sourceDigests);
}

function sourceMetadataMatches(
  loaded: AssetPackPayloadSuccess,
  entry: AssetPackRegistryEntry,
): boolean {
  return canonicalJson(loaded.pack.acknowledgements) === canonicalJson(entry.acknowledgements)
    && canonicalJson(loaded.pack.replacements) === canonicalJson(entry.replacements)
    && canonicalJson(collectBaselineDefinitionDigests(loaded.pack))
      === canonicalJson(entry.baselineDefinitionDigests)
    && canonicalJson(collectBaselineCreditDigests(loaded.pack))
      === canonicalJson(entry.baselineCreditDigests);
}

async function validateSnapshot(options: {
  readonly active: ValidatedActiveAssetPack;
  readonly runtime: RuntimeAssets;
  readonly workspace: AssetWorkspace;
  readonly expected?: RegistrySourceEntry;
}): Promise<LinkedAssetPackCandidateResult> {
  const report = await validateAssetPackPayload({
    payload: options.active.loaded,
    runtime: options.runtime,
    workspace: options.workspace,
    origin: options.active.sourceDirectory,
  });
  const diagnostics = report.diagnostics.map((diagnostic) =>
    toLifecycleDiagnostic(diagnostic, options.active.loaded.pack.id));
  if (!report.valid) return candidateFailure(diagnostics);
  if (report.contentDigest !== options.active.loaded.contentDigest) {
    return candidateFailure([{
      code: 'asset_digest_mismatch',
      severity: 'error',
      message: `Asset-pack source changed while it was being validated: ${options.active.sourceDirectory}`,
      path: options.active.sourceDirectory,
      packId: options.active.loaded.pack.id,
    }]);
  }
  if (options.expected && !sourceSnapshotMatches(options.active.loaded, options.expected)) {
    return candidateFailure([{
      code: 'asset_digest_mismatch',
      severity: 'error',
      message: `Asset-pack source differs from the registry snapshot: ${options.expected.packId}.`,
      path: options.active.sourceDirectory,
      packId: options.expected.packId,
    }]);
  }
  if (
    options.expected
    && 'logicalDestinations' in options.expected
    && !sourceMetadataMatches(options.active.loaded, options.expected)
  ) {
    return candidateFailure([{
      code: 'asset_digest_mismatch',
      severity: 'error',
      message: `Asset-pack source metadata differs from the registry snapshot: ${options.expected.packId}.`,
      path: options.active.sourceDirectory,
      packId: options.expected.packId,
    }]);
  }
  return {
    ok: true,
    candidate: {
      ...options.active,
      diagnostics,
    },
  };
}

function loadPayloadDirectory(options: {
  readonly kind: 'linked' | 'installed';
  readonly sourceDirectory: string;
  readonly archiveDigest?: string;
  readonly entry?: RegistrySourceEntry;
  readonly sourceFileOps?: AssetPackDirectoryFileOps;
}): LinkedAssetPackCandidateResult {
  let loaded: ReturnType<typeof loadAssetPackFiles>;
  try {
    loaded = loadAssetPackFiles(options.sourceDirectory, options.sourceFileOps);
  } catch (error) {
    const missing = isNodeError(error) && ['ENOENT', 'ENOTDIR'].includes(error.code ?? '');
    return candidateFailure([{
      code: missing ? 'asset_source_missing' : 'asset_digest_mismatch',
      severity: 'error',
      message: missing
        ? `Asset-pack source is missing: ${options.sourceDirectory}`
        : errorMessage(error),
      path: options.sourceDirectory,
      ...(options.entry ? { packId: options.entry.packId } : {}),
    }]);
  }
  if (!loaded.ok) {
    return candidateFailure(loaded.diagnostics.map((diagnostic) =>
      toLifecycleDiagnostic(diagnostic, options.entry?.packId)));
  }
  return {
    ok: true,
    candidate: {
      kind: options.kind,
      sourceDirectory: options.sourceDirectory,
      ...(options.archiveDigest ? { archiveDigest: options.archiveDigest } : {}),
      loaded,
      diagnostics: [],
    },
  };
}

export async function loadLinkedAssetPackCandidate(options: {
  readonly packDirectory: string;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly sourceFileOps?: AssetPackDirectoryFileOps;
}): Promise<LinkedAssetPackCandidateResult> {
  let sourceDirectory: string;
  try {
    sourceDirectory = resolveLinkedAssetPackDirectory(options.workspace, options.packDirectory);
  } catch (error) {
    return candidateFailure([{
      code: 'asset_digest_mismatch',
      severity: 'error',
      message: errorMessage(error),
      path: path.resolve(options.packDirectory),
    }]);
  }
  const loaded = loadPayloadDirectory({
    kind: 'linked',
    sourceDirectory,
    ...(options.sourceFileOps ? { sourceFileOps: options.sourceFileOps } : {}),
  });
  if (!loaded.ok) return loaded;
  return validateSnapshot({
    active: loaded.candidate,
    runtime: options.runtime,
    workspace: options.workspace,
  });
}

async function loadRegistryEntry(options: {
  readonly entry: RegistrySourceEntry;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
}): Promise<LinkedAssetPackCandidateResult> {
  let sourceDirectory: string;
  try {
    sourceDirectory = options.entry.kind === 'linked'
      ? resolveLinkedAssetPackDirectory(options.workspace, options.entry.sourceDirectory)
      : options.entry.installedDirectory;
  } catch (error) {
    return candidateFailure([{
      code: 'asset_digest_mismatch',
      severity: 'error',
      message: errorMessage(error),
      path: options.entry.kind === 'linked'
        ? options.entry.sourceDirectory
        : options.entry.installedDirectory,
      packId: options.entry.packId,
    }]);
  }
  const loaded = loadPayloadDirectory({
    kind: options.entry.kind,
    sourceDirectory,
    ...(options.entry.kind === 'installed' ? { archiveDigest: options.entry.archiveDigest } : {}),
    entry: options.entry,
  });
  if (!loaded.ok) return loaded;
  return validateSnapshot({
    active: loaded.candidate,
    runtime: options.runtime,
    workspace: options.workspace,
    expected: options.entry,
  });
}

async function loadInstalledCandidate(options: {
  readonly candidate: ValidatedActiveAssetPack;
  readonly workspace: AssetWorkspace;
  readonly workspaceId: string;
  readonly runtime: RuntimeAssets;
}): Promise<LinkedAssetPackCandidateResult> {
  const { candidate } = options;
  if (!candidate.archiveDigest) {
    return candidateFailure([{
      code: 'asset_digest_mismatch',
      severity: 'error',
      message: `Installed asset-pack candidate is missing archive digest: ${candidate.loaded.pack.id}.`,
      path: candidate.sourceDirectory,
      packId: candidate.loaded.pack.id,
    }]);
  }

  let sourceDirectory: string;
  try {
    sourceDirectory = verifyInstalledAssetPackDirectory({
      workspace: options.workspace,
      workspaceId: options.workspaceId,
      installedDirectory: candidate.sourceDirectory,
      archiveDigest: candidate.archiveDigest,
      entry: {
        packId: candidate.loaded.pack.id,
        version: candidate.loaded.pack.version,
        contentDigest: candidate.loaded.contentDigest,
        sourceDigests: digestRecord(candidate.loaded.sourceDigests),
      },
    });
  } catch (error) {
    return candidateFailure([{
      code: 'asset_digest_mismatch',
      severity: 'error',
      message: errorMessage(error),
      path: candidate.sourceDirectory,
      packId: candidate.loaded.pack.id,
    }]);
  }

  const loaded = loadPayloadDirectory({
    kind: 'installed',
    sourceDirectory,
    archiveDigest: candidate.archiveDigest,
  });
  if (!loaded.ok) return loaded;
  const expected: AssetPackSourceSnapshot = {
    packId: candidate.loaded.pack.id,
    version: candidate.loaded.pack.version,
    displayName: candidate.loaded.pack.displayName,
    contentDigest: candidate.loaded.contentDigest,
    sourceDigests: digestRecord(candidate.loaded.sourceDigests),
  };
  if (!sourceSnapshotMatches(loaded.candidate.loaded, expected)) {
    return candidateFailure([{
      code: 'asset_digest_mismatch',
      severity: 'error',
      message: `Installed asset-pack source differs from the candidate snapshot: ${expected.packId}.`,
      path: sourceDirectory,
      packId: expected.packId,
    }]);
  }
  return validateSnapshot({
    active: {
      ...loaded.candidate,
      diagnostics: candidate.diagnostics,
    },
    runtime: options.runtime,
    workspace: options.workspace,
  });
}

function collectBaselineDefinitionDigests(
  pack: NormalizedAssetPack,
): Readonly<Record<string, string>> {
  return sortedRecord(Object.fromEntries(
    pack.assets
      .filter((asset) => asset.kind === 'extend-item')
      .map((asset) => [asset.itemId, asset.baseDefinitionDigest] as const),
  ));
}

function collectBaselineCreditDigests(
  pack: NormalizedAssetPack,
): Readonly<Record<string, string>> {
  return sortedRecord(Object.fromEntries(
    pack.assets
      .filter((asset) => asset.kind === 'extend-item')
      .map((asset) => [asset.itemId, asset.baseCreditDigest] as const),
  ));
}

function uniqueLicenses(credits: readonly CreditEntry[]): CreditsManifest['licenses'] {
  return [...new Set(credits.flatMap((credit) => credit.licenses))]
    .sort((left, right) => left.localeCompare(right)) as CreditsManifest['licenses'];
}

function creditsManifest(credits: readonly CreditEntry[]): CreditsManifest {
  return {
    entries: credits,
    resolvedPaths: credits.map((credit) => `spritesheets/${credit.file}`),
    licenses: uniqueLicenses(credits),
  };
}

function generatedCreditsByPack(
  compilePlan: AssetPackCompilePlan,
): ReadonlyMap<string, readonly CreditEntry[]> {
  return new Map(compilePlan.ownership.map((ownership) => {
    const ownedDefinitions = new Set(
      ownership.logicalPaths.filter((logicalPath) => logicalPath.startsWith('sheet_definitions/')),
    );
    const credits = new Map<string, CreditEntry>();
    for (const definition of compilePlan.definitions) {
      if (!ownedDefinitions.has(definition.logicalPath)) continue;
      for (const credit of definition.definition.credits) {
        const existing = credits.get(credit.file);
        if (existing && canonicalJson(existing) !== canonicalJson(credit)) {
          throw new Error(`Compiler definitions disagree on generated credit data: ${credit.file}.`);
        }
        credits.set(credit.file, credit);
      }
    }
    return [
      ownership.packId,
      [...credits.values()].sort((left, right) => left.file.localeCompare(right.file)),
    ] as const;
  }));
}

function materializeOutputFiles(options: {
  readonly markerBytes: Buffer;
  readonly active: readonly ValidatedActiveAssetPack[];
  readonly compilePlan: AssetPackCompilePlan;
}): {
  readonly files: ReadonlyMap<string, Buffer>;
  readonly generatedDigests: Readonly<Record<string, string>>;
} {
  const files = new Map<string, Buffer>([[OUTPUT_MARKER_FILE, Buffer.from(options.markerBytes)]]);
  const snapshots = new Map(
    options.active.map((pack) => [pack.loaded.pack.id, pack.loaded.sourceBytes] as const),
  );
  for (const definition of options.compilePlan.definitions) {
    files.set(definition.logicalPath, sortedJsonBytes(definition.definition));
  }
  for (const sprite of options.compilePlan.sprites) {
    const bytes = snapshots.get(sprite.packId)?.get(sprite.sourcePath);
    if (!bytes) {
      throw new Error(`No validated source snapshot for ${sprite.packId}:${sprite.sourcePath}.`);
    }
    files.set(sprite.destinationPath, Buffer.from(bytes));
  }
  if (options.active.length > 0) {
    files.set(
      'CREDITS.csv',
      Buffer.from(creditsToCsv(creditsManifest(options.compilePlan.credits), 'walk')),
    );
  }
  const sortedFiles = new Map(
    [...files.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([logicalPath, bytes]) => [logicalPath, Buffer.from(bytes)] as const),
  );
  const generatedDigests = sortedRecord(Object.fromEntries(
    [...sortedFiles.entries()]
      .filter(([logicalPath]) => logicalPath !== OUTPUT_MARKER_FILE)
      .map(([logicalPath, bytes]) => [logicalPath, sha256Buffer(bytes)] as const),
  ));
  return { files: sortedFiles, generatedDigests };
}

function buildRegistryEntries(options: {
  readonly active: readonly ValidatedActiveAssetPack[];
  readonly compilePlan: AssetPackCompilePlan;
  readonly sourceDigestsByPackId: ReadonlyMap<string, ReadonlyMap<string, string>>;
}): readonly AssetPackRegistryEntry[] {
  const projection = assetPackCompileProjectionFromPlan({
    compilePlan: options.compilePlan,
    sourceDigestsByPackId: options.sourceDigestsByPackId,
  });
  const ownershipByPackId = new Map(
    options.compilePlan.ownership.map((entry) => [entry.packId, entry.logicalPaths] as const),
  );
  const creditsByPackId = generatedCreditsByPack(options.compilePlan);
  return options.active.map((active): AssetPackRegistryEntry => {
    const pack = active.loaded.pack;
    const generatedSprites = projection.sprites
      .filter((sprite) => sprite.packId === pack.id)
      .map(({ packId: _packId, ...sprite }) => sprite)
      .sort((left, right) => left.destinationPath.localeCompare(right.destinationPath)
        || left.sourcePath.localeCompare(right.sourcePath));
    const base = {
      packId: pack.id,
      version: pack.version,
      displayName: pack.displayName,
      contentDigest: active.loaded.contentDigest,
      acknowledgements: pack.acknowledgements,
      sourceDigests: digestRecord(active.loaded.sourceDigests),
      generatedPaths: [...(ownershipByPackId.get(pack.id) ?? [])]
        .sort((left, right) => left.localeCompare(right)),
      logicalDestinations: generatedSprites.map((sprite) => sprite.destinationPath),
      generatedSprites,
      replacements: pack.replacements,
      baselineDefinitionDigests: collectBaselineDefinitionDigests(pack),
      baselineCreditDigests: collectBaselineCreditDigests(pack),
      generatedCredits: creditsByPackId.get(pack.id) ?? [],
    };
    if (active.kind === 'linked') {
      return { ...base, kind: 'linked', sourceDirectory: active.sourceDirectory };
    }
    if (!active.archiveDigest) {
      throw new Error(`Installed asset-pack candidate is missing archive digest: ${pack.id}.`);
    }
    return {
      ...base,
      kind: 'installed',
      installedDirectory: active.sourceDirectory,
      archiveDigest: active.archiveDigest,
    };
  }).sort((left, right) => left.packId.localeCompare(right.packId));
}

function retainedV1EntriesMatch(options: {
  readonly retained: readonly RegistrySourceEntry[];
  readonly original: AssetPackRegistryV1Read;
  readonly compiled: readonly AssetPackRegistryEntry[];
}): AssetPackLifecycleDiagnostic | undefined {
  const retainedIds = new Set(options.retained.map((entry) => entry.packId));
  for (const entry of options.original.entries.filter((candidate) => retainedIds.has(candidate.packId))) {
    const compiled = options.compiled.find((candidate) => candidate.packId === entry.packId);
    if (
      !compiled
      || compiled.kind !== 'linked'
      || entry.version !== compiled.version
      || entry.displayName !== compiled.displayName
      || path.resolve(entry.sourceDirectory) !== compiled.sourceDirectory
      || entry.contentDigest !== compiled.contentDigest
      || canonicalJson(entry.sourceDigests) !== canonicalJson(compiled.sourceDigests)
      || canonicalJson(entry.generatedPaths) !== canonicalJson(compiled.generatedPaths)
      || canonicalJson(entry.baselineDefinitionDigests)
        !== canonicalJson(compiled.baselineDefinitionDigests)
      || canonicalJson(entry.baselineCreditDigests)
        !== canonicalJson(compiled.baselineCreditDigests)
    ) {
      return {
        code: 'asset_digest_mismatch',
        severity: 'error',
        message: `Retained v1 linked asset-pack registry entry does not match the validated compile state: ${entry.packId}.`,
        packId: entry.packId,
      };
    }
  }
  return undefined;
}

export async function prepareAssetPackDesiredState(options: {
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly mutation: AssetPackStateMutation;
}): Promise<AssetPackDesiredStateResult> {
  let marker: { readonly workspaceId: string; readonly bytes: Buffer };
  try {
    marker = readOutputMarker(options.workspace);
  } catch (error) {
    return failure([{
      code: 'asset_output_root_unowned',
      severity: 'error',
      message: errorMessage(error),
      path: options.workspace.outputRoot,
    }]);
  }

  const registryResult = readAssetPackRegistry({
    workspace: options.workspace,
    markerWorkspaceId: marker.workspaceId,
  });
  if (!registryResult.ok) return failure(registryResult.diagnostics);

  const auditFailure = auditPublishedManagedOutput({
    workspace: options.workspace,
    markerBytes: marker.bytes,
    generatedDigests: registryResult.document.generatedDigests,
  });
  if (auditFailure) return failure([auditFailure]);

  const { mutation } = options;
  const registryEntries: readonly RegistrySourceEntry[] = registryResult.document.entries;
  let retainedEntries = [...registryEntries];
  let candidate: ValidatedActiveAssetPack | undefined;
  if (mutation.kind === 'remove') {
    retainedEntries = retainedEntries.filter((entry) => entry.packId !== mutation.packId);
  } else if (mutation.kind === 'upsert') {
    candidate = mutation.candidate;
    const candidateId = candidate.loaded.pack.id;
    const current = retainedEntries.find((entry) => entry.packId === candidateId);
    if (current && current.kind !== candidate.kind) {
      return failure([{
        code: 'asset_source_kind_conflict',
        severity: 'error',
        message: `Asset-pack ${candidateId} is already active as ${current.kind}, not ${candidate.kind}.`,
        path: options.workspace.registryPath,
        packId: candidateId,
        details: { currentKind: current.kind, candidateKind: candidate.kind },
      }]);
    }
    retainedEntries = retainedEntries.filter((entry) => entry.packId !== candidateId);
  }

  const active: ValidatedActiveAssetPack[] = [];
  for (const entry of retainedEntries.sort((left, right) => left.packId.localeCompare(right.packId))) {
    const loaded = await loadRegistryEntry({
      entry,
      workspace: options.workspace,
      runtime: options.runtime,
    });
    if (!loaded.ok) return failure(loaded.diagnostics);
    active.push(loaded.candidate);
  }

  if (candidate) {
    if (candidate.kind === 'installed') {
      const installed = await loadInstalledCandidate({
        candidate,
        workspace: options.workspace,
        workspaceId: marker.workspaceId,
        runtime: options.runtime,
      });
      if (!installed.ok) return failure(installed.diagnostics);
      active.push(installed.candidate);
    } else {
      let resolved: string;
      try {
        resolved = resolveLinkedAssetPackDirectory(options.workspace, candidate.sourceDirectory);
      } catch (error) {
        return failure([{
          code: 'asset_digest_mismatch',
          severity: 'error',
          message: errorMessage(error),
          path: candidate.sourceDirectory,
          packId: candidate.loaded.pack.id,
        }]);
      }
      if (resolved !== candidate.sourceDirectory) {
        return failure([{
          code: 'asset_digest_mismatch',
          severity: 'error',
          message: `Linked asset-pack candidate source is not canonical: ${candidate.sourceDirectory}.`,
          path: candidate.sourceDirectory,
          packId: candidate.loaded.pack.id,
        }]);
      }
      const validated = await validateSnapshot({
        active: candidate,
        runtime: options.runtime,
        workspace: options.workspace,
      });
      if (!validated.ok) return failure(validated.diagnostics);
      active.push(validated.candidate);
    }
  }

  active.sort((left, right) => left.loaded.pack.id.localeCompare(right.loaded.pack.id));
  if (new Set(active.map((pack) => pack.loaded.pack.id)).size !== active.length) {
    return failure([{
      code: 'asset_pack_duplicate',
      severity: 'error',
      message: 'Active asset-pack state contains duplicate pack IDs.',
      path: options.workspace.registryPath,
    }]);
  }

  const compilePlan = compileAssetPacks({
    baseline: loadActiveAssetPackBaseline({
      runtime: options.runtime,
      workspace: options.workspace,
    }),
    packs: active.map((pack) => pack.loaded.pack),
  });
  const compileErrors = compilePlan.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (compileErrors.length > 0) {
    return failure(compileErrors.map((diagnostic) => toLifecycleDiagnostic(diagnostic)));
  }

  try {
    const sourceDigestsByPackId = new Map(
      active.map((pack) => [pack.loaded.pack.id, pack.loaded.sourceDigests] as const),
    );
    const projection = assetPackCompileProjectionFromPlan({ compilePlan, sourceDigestsByPackId });
    const output = materializeOutputFiles({
      markerBytes: marker.bytes,
      active,
      compilePlan,
    });
    const entries = buildRegistryEntries({ active, compilePlan, sourceDigestsByPackId });
    if (registryResult.document.schema !== ASSET_WORKSPACE_REGISTRY_SCHEMA) {
      const mismatch = retainedV1EntriesMatch({
        retained: retainedEntries,
        original: registryResult.document,
        compiled: entries,
      });
      if (mismatch) return failure([mismatch]);
    }
    const registry: AssetPackRegistryDocument = {
      schema: ASSET_WORKSPACE_REGISTRY_SCHEMA,
      workspaceId: marker.workspaceId,
      entries,
      generatedDigests: output.generatedDigests,
      compileDigest: assetPackCompileDigest(projection),
    };
    return {
      ok: true,
      active,
      compilePlan,
      outputFiles: output.files,
      registry,
      warnings: [
        ...active.flatMap((pack) => pack.diagnostics),
        ...compilePlan.diagnostics
          .filter((diagnostic) => diagnostic.severity === 'warning')
          .map((diagnostic) => toLifecycleDiagnostic(diagnostic)),
      ],
    };
  } catch (error) {
    return failure([{
      code: 'asset_digest_mismatch',
      severity: 'error',
      message: errorMessage(error),
      path: options.workspace.registryPath,
    }]);
  }
}
