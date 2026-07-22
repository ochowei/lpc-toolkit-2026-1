import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  fsyncSync,
  openSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  assetPackLifecycleReplacementAllows,
  assetPackSourceFromNormalized,
  compareAssetPackVersions,
  compileAssetPacks,
  creditsToCsv,
  type AssetPackCompilePlan,
  type AssetPackDiagnostic,
  type CreditEntry,
  type CreditsManifest,
  type NormalizedAssetPack,
} from '@lpc-toolkit/core';
import { extractVerifiedAssetPackPayload } from './asset-pack-archive-format.js';
import { inspectAssetPackArchive } from './asset-pack-inspection.js';
import { parseAssetPackPayload, type AssetPackPayloadSuccess } from './asset-pack-payload.js';
import {
  ASSET_WORKSPACE_REGISTRY_SCHEMA,
  assetPackCompileDigest,
  assetPackCompileProjectionFromPlan,
  type AssetPackLifecycleDiagnostic,
  type AssetPackRegistryDocument,
  type AssetPackRegistryEntry,
  type InstalledAssetPackRegistryEntry,
} from './asset-pack-registry.js';
import {
  prepareAssetPackDesiredState,
  type AssetPackDesiredState,
  type ValidatedActiveAssetPack,
} from './asset-pack-state.js';
import {
  withAssetPackTransactionClaim,
  type AssetPackClaimedPublisher,
  type AssetTransactionFileOps,
} from './asset-pack-transaction.js';
import { loadActiveAssetPackBaseline } from './asset-pack-validation.js';
import {
  assetPackInstalledDirectory,
  createAssetPackInstallStagingRoot,
  removeAssetPackInstallStagingRoot,
  type AssetPackInstallStagingRoot,
  type AssetWorkspace,
} from './asset-workspace.js';
import type { RuntimeAssets } from './runtime-assets.js';

export const ASSET_PACK_INSTALL_RECEIPT_SCHEMA =
  'lpc-toolkit.asset-pack-install-receipt.v1' as const;

export interface AssetPackInstallReceipt {
  readonly schema: typeof ASSET_PACK_INSTALL_RECEIPT_SCHEMA;
  readonly workspaceId: string;
  readonly packId: string;
  readonly version: string;
  readonly archiveDigest: string;
  readonly contentDigest: string;
  readonly installedAt: string;
  readonly payloadDigests: Readonly<Record<string, string>>;
}

export type AssetPackInstallAction =
  | 'installed'
  | 'unchanged'
  | 'upgraded'
  | 'downgraded';

export interface AssetPackInstallSuccess {
  readonly ok: true;
  readonly action: AssetPackInstallAction;
  readonly packId: string;
  readonly version: string;
  readonly archiveDigest: string;
  readonly installedDirectory: string;
  readonly generatedFileCount: number;
}

export type AssetPackInstallResult =
  | AssetPackInstallSuccess
  | { readonly ok: false; readonly diagnostics: readonly AssetPackLifecycleDiagnostic[] };

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([key, entry]) => [key, canonicalize(entry)] as const),
  );
}

function canonicalJsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(canonicalize(value), null, 2)}\n`);
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function sortedRecord(
  record: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => compareCodeUnits(left, right)),
  );
}

function digestRecord(
  digests: ReadonlyMap<string, string>,
): Readonly<Record<string, string>> {
  return sortedRecord(Object.fromEntries(digests));
}

function failure(
  code: string,
  message: string,
  options: {
    readonly path?: string;
    readonly packId?: string;
    readonly details?: Readonly<Record<string, unknown>>;
  } = {},
): Exclude<AssetPackInstallResult, AssetPackInstallSuccess> {
  return {
    ok: false,
    diagnostics: [{
      code,
      severity: 'error',
      message,
      ...(options.path ? { path: options.path } : {}),
      ...(options.packId ? { packId: options.packId } : {}),
      ...(options.details ? { details: options.details } : {}),
    }],
  };
}

function diagnosticFailure(
  diagnostics: readonly AssetPackLifecycleDiagnostic[],
): Exclude<AssetPackInstallResult, AssetPackInstallSuccess> {
  return { ok: false, diagnostics };
}

function toLifecycleDiagnostic(diagnostic: AssetPackDiagnostic): AssetPackLifecycleDiagnostic {
  const details: Record<string, unknown> = { ...(diagnostic.details ?? {}) };
  if (diagnostic.assetId) details.assetId = diagnostic.assetId;
  if (diagnostic.sourcePath) details.sourcePath = diagnostic.sourcePath;
  if (diagnostic.destinationPath) details.destinationPath = diagnostic.destinationPath;
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    ...(diagnostic.packId ? { packId: diagnostic.packId } : {}),
    ...(Object.keys(details).length > 0 ? { details } : {}),
  };
}

function normalizedManifestBytes(pack: NormalizedAssetPack): Buffer {
  return canonicalJsonBytes(assetPackSourceFromNormalized(pack));
}

function writeExistingRegularFile(filePath: string, bytes: Buffer): void {
  const descriptor = openSync(
    filePath,
    fsConstants.O_WRONLY | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW,
  );
  try {
    if (!fstatSync(descriptor).isFile()) {
      throw new Error(`Installed payload path is not a regular file: ${filePath}`);
    }
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeNewRegularFile(filePath: string, bytes: Buffer): void {
  const descriptor = openSync(
    filePath,
    fsConstants.O_WRONLY
      | fsConstants.O_CREAT
      | fsConstants.O_EXCL
      | fsConstants.O_NOFOLLOW,
    0o600,
  );
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function stageInstalledPayload(options: {
  readonly stagingRoot: AssetPackInstallStagingRoot;
  readonly snapshot: NonNullable<Awaited<ReturnType<typeof inspectAssetPackArchive>>['snapshot']>;
  readonly workspaceId: string;
  readonly now: () => Date;
}): { readonly sourceDirectory: string; readonly loaded: AssetPackPayloadSuccess } {
  const sourceDirectory = path.join(options.stagingRoot.path, 'source');
  const canonicalSourceDirectory = path.join(options.stagingRoot.canonicalPath, 'source');
  extractVerifiedAssetPackPayload({
    snapshot: options.snapshot,
    targetDirectory: canonicalSourceDirectory,
  });

  const manifestBytes = normalizedManifestBytes(options.snapshot.payload.pack);
  const parsed = parseAssetPackPayload({
    manifestBytes,
    sourceBytes: options.snapshot.payload.sourceBytes,
  });
  if (!parsed.ok) {
    throw new Error(
      `Normalized installed asset-pack payload is invalid: ${JSON.stringify(parsed.diagnostics)}`,
    );
  }
  if (parsed.contentDigest !== options.snapshot.payload.contentDigest) {
    throw new Error('Normalized installed asset-pack payload changed its content digest.');
  }
  writeExistingRegularFile(
    path.join(canonicalSourceDirectory, 'asset-pack.json'),
    manifestBytes,
  );

  const installedAt = options.now().toISOString();
  const payloadDigests = sortedRecord({
    'asset-pack.json': sha256(manifestBytes),
    ...digestRecord(parsed.sourceDigests),
  });
  const receipt: AssetPackInstallReceipt = {
    schema: ASSET_PACK_INSTALL_RECEIPT_SCHEMA,
    workspaceId: options.workspaceId,
    packId: parsed.pack.id,
    version: parsed.pack.version,
    archiveDigest: options.snapshot.archiveDigest,
    contentDigest: parsed.contentDigest,
    installedAt,
    payloadDigests,
  };
  writeNewRegularFile(
    path.join(canonicalSourceDirectory, 'install-receipt.json'),
    Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`),
  );
  return { sourceDirectory, loaded: parsed };
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
    .sort(compareCodeUnits) as CreditsManifest['licenses'];
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
      ownership.logicalPaths.filter((logicalPath) =>
        logicalPath.startsWith('sheet_definitions/')),
    );
    const credits = new Map<string, CreditEntry>();
    for (const definition of compilePlan.definitions) {
      if (!ownedDefinitions.has(definition.logicalPath)) continue;
      for (const credit of definition.definition.credits) {
        const existing = credits.get(credit.file);
        if (
          existing
          && JSON.stringify(canonicalize(existing)) !== JSON.stringify(canonicalize(credit))
        ) {
          throw new Error(
            `Compiler definitions disagree on generated credit data: ${credit.file}.`,
          );
        }
        credits.set(credit.file, credit);
      }
    }
    return [
      ownership.packId,
      [...credits.values()].sort((left, right) =>
        compareCodeUnits(left.file, right.file)),
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
  const files = new Map<string, Buffer>([
    ['.lpc-toolkit-managed.json', Buffer.from(options.markerBytes)],
  ]);
  const snapshots = new Map(
    options.active.map((pack) => [pack.loaded.pack.id, pack.loaded.sourceBytes] as const),
  );
  for (const definition of options.compilePlan.definitions) {
    files.set(definition.logicalPath, canonicalJsonBytes(definition.definition));
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
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([logicalPath, bytes]) => [logicalPath, Buffer.from(bytes)] as const),
  );
  const generatedDigests = sortedRecord(Object.fromEntries(
    [...sortedFiles.entries()]
      .filter(([logicalPath]) => logicalPath !== '.lpc-toolkit-managed.json')
      .map(([logicalPath, bytes]) => [logicalPath, sha256(bytes)] as const),
  ));
  return { files: sortedFiles, generatedDigests };
}

function buildRegistryEntries(options: {
  readonly active: readonly ValidatedActiveAssetPack[];
  readonly compilePlan: AssetPackCompilePlan;
}): readonly AssetPackRegistryEntry[] {
  const sourceDigestsByPackId = new Map(
    options.active.map((pack) => [pack.loaded.pack.id, pack.loaded.sourceDigests] as const),
  );
  const projection = assetPackCompileProjectionFromPlan({
    compilePlan: options.compilePlan,
    sourceDigestsByPackId,
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
      .sort((left, right) =>
        compareCodeUnits(left.destinationPath, right.destinationPath)
        || compareCodeUnits(left.sourcePath, right.sourcePath));
    const base = {
      packId: pack.id,
      version: pack.version,
      displayName: pack.displayName,
      contentDigest: active.loaded.contentDigest,
      acknowledgements: pack.acknowledgements,
      sourceDigests: digestRecord(active.loaded.sourceDigests),
      generatedPaths: [...(ownershipByPackId.get(pack.id) ?? [])].sort(compareCodeUnits),
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
      throw new Error(`Installed candidate is missing archive digest: ${pack.id}.`);
    }
    return {
      ...base,
      kind: 'installed',
      installedDirectory: active.sourceDirectory,
      archiveDigest: active.archiveDigest,
    };
  }).sort((left, right) => compareCodeUnits(left.packId, right.packId));
}

function normalizeCompilePlanCredits(plan: AssetPackCompilePlan): AssetPackCompilePlan {
  return {
    ...plan,
    definitions: plan.definitions.map((entry) => ({
      ...entry,
      definition: {
        ...entry.definition,
        credits: [...entry.definition.credits].sort((left, right) =>
          compareCodeUnits(left.file, right.file)),
      },
    })),
  };
}

function prepareInstallDesiredState(options: {
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly current: AssetPackDesiredState;
  readonly incoming: ValidatedActiveAssetPack;
}): AssetPackDesiredState | Exclude<AssetPackInstallResult, AssetPackInstallSuccess> {
  const active = options.current.active
    .filter((entry) => entry.loaded.pack.id !== options.incoming.loaded.pack.id)
    .concat(options.incoming)
    .sort((left, right) =>
      compareCodeUnits(left.loaded.pack.id, right.loaded.pack.id));
  const compiled = compileAssetPacks({
    baseline: loadActiveAssetPackBaseline({
      runtime: options.runtime,
      workspace: options.workspace,
    }),
    packs: active.map((entry) => entry.loaded.pack),
  });
  const errors = compiled.diagnostics.filter((diagnostic) =>
    diagnostic.severity === 'error');
  if (errors.length > 0) {
    return diagnosticFailure(errors.map(toLifecycleDiagnostic));
  }
  const compilePlan = normalizeCompilePlanCredits(compiled);
  const markerBytes = options.current.outputFiles.get('.lpc-toolkit-managed.json');
  if (!markerBytes) {
    return failure(
      'asset_output_root_unowned',
      'Managed asset output marker is missing from the current desired state.',
      { path: options.workspace.outputRoot },
    );
  }
  try {
    const output = materializeOutputFiles({ markerBytes, active, compilePlan });
    const entries = buildRegistryEntries({ active, compilePlan });
    const sourceDigestsByPackId = new Map(
      active.map((entry) => [entry.loaded.pack.id, entry.loaded.sourceDigests] as const),
    );
    const registry: AssetPackRegistryDocument = {
      schema: ASSET_WORKSPACE_REGISTRY_SCHEMA,
      workspaceId: options.current.registry.workspaceId,
      entries,
      generatedDigests: output.generatedDigests,
      compileDigest: assetPackCompileDigest(
        assetPackCompileProjectionFromPlan({ compilePlan, sourceDigestsByPackId }),
      ),
    };
    return {
      ok: true,
      active,
      compilePlan,
      outputFiles: output.files,
      registry,
      warnings: [
        ...active.flatMap((entry) => entry.diagnostics),
        ...compilePlan.diagnostics
          .filter((diagnostic) => diagnostic.severity === 'warning')
          .map(toLifecycleDiagnostic),
      ],
    };
  } catch (error) {
    return failure(
      'asset_digest_mismatch',
      error instanceof Error ? error.message : String(error),
      { path: options.workspace.registryPath },
    );
  }
}

function lifecycleAction(options: {
  readonly current: AssetPackDesiredState;
  readonly incoming: AssetPackPayloadSuccess;
  readonly archiveDigest: string;
  readonly archivePath: string;
}): AssetPackInstallAction | Exclude<AssetPackInstallResult, AssetPackInstallSuccess> {
  const pack = options.incoming.pack;
  const currentEntry = options.current.registry.entries.find((entry) =>
    entry.packId === pack.id);
  if (!currentEntry) return 'installed';
  if (currentEntry.kind === 'linked') {
    return failure(
      'asset_source_kind_conflict',
      `Asset-pack ${pack.id} is active as linked source and cannot be replaced by install.`,
      {
        path: currentEntry.sourceDirectory,
        packId: pack.id,
        details: { currentKind: 'linked', candidateKind: 'installed' },
      },
    );
  }

  const comparison = compareAssetPackVersions(pack.version, currentEntry.version);
  if (comparison === 0) {
    if (options.archiveDigest !== currentEntry.archiveDigest) {
      return failure(
        'asset_pack_version_conflict',
        `Asset-pack ${pack.id} version ${pack.version} is installed from different archive bytes.`,
        {
          path: options.archivePath,
          packId: pack.id,
          details: {
            installedArchiveDigest: currentEntry.archiveDigest,
            incomingArchiveDigest: options.archiveDigest,
          },
        },
      );
    }
    return 'unchanged';
  }
  if (comparison > 0) return 'upgraded';

  const installed = options.current.active.find((entry) =>
    entry.kind === 'installed' && entry.loaded.pack.id === pack.id);
  if (!installed || !assetPackLifecycleReplacementAllows(pack, installed.loaded.pack)) {
    return failure(
      'asset_pack_downgrade_unauthorized',
      `Asset-pack ${pack.id} ${pack.version} does not authorize replacing installed version ${currentEntry.version}.`,
      {
        path: options.archivePath,
        packId: pack.id,
        details: {
          installedVersion: currentEntry.version,
          incomingVersion: pack.version,
        },
      },
    );
  }
  return 'downgraded';
}

function installSuccess(options: {
  readonly action: AssetPackInstallAction;
  readonly packId: string;
  readonly version: string;
  readonly archiveDigest: string;
  readonly installedDirectory: string;
  readonly desiredState: AssetPackDesiredState;
}): AssetPackInstallSuccess {
  return {
    ok: true,
    action: options.action,
    packId: options.packId,
    version: options.version,
    archiveDigest: options.archiveDigest,
    installedDirectory: options.installedDirectory,
    generatedFileCount: Object.keys(options.desiredState.registry.generatedDigests).length,
  };
}

async function installUnderClaim(options: {
  readonly archivePath: string;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly now: () => Date;
  readonly publisher: AssetPackClaimedPublisher;
}): Promise<AssetPackInstallResult> {
  const inspected = await inspectAssetPackArchive({
    archivePath: options.archivePath,
    runtime: options.runtime,
    workspace: options.workspace,
  });
  if (!inspected.report.valid || !inspected.snapshot) {
    return diagnosticFailure(inspected.report.diagnostics);
  }

  const preparedCurrent = await prepareAssetPackDesiredState({
    workspace: options.workspace,
    runtime: options.runtime,
    mutation: { kind: 'none' },
  });
  if (!preparedCurrent.ok) return diagnosticFailure(preparedCurrent.diagnostics);
  let current: AssetPackDesiredState = preparedCurrent;
  if (!existsSync(options.workspace.registryPath)) {
    const migration = await options.publisher.publish({
      operation: 'sync',
      desiredState: current,
      cleanupInstalledSources: [],
    });
    if (!migration.ok) return migration;
    const migrated = await prepareAssetPackDesiredState({
      workspace: options.workspace,
      runtime: options.runtime,
      mutation: { kind: 'none' },
    });
    if (!migrated.ok) return diagnosticFailure(migrated.diagnostics);
    current = migrated;
  }

  const action = lifecycleAction({
    current,
    incoming: inspected.snapshot.payload,
    archiveDigest: inspected.snapshot.archiveDigest,
    archivePath: options.archivePath,
  });
  if (typeof action !== 'string') return action;

  const pack = inspected.snapshot.payload.pack;
  const finalInstalledSource = assetPackInstalledDirectory({
    workspace: options.workspace,
    packId: pack.id,
    version: pack.version,
    archiveDigest: inspected.snapshot.archiveDigest,
  });
  if (action === 'unchanged') {
    return installSuccess({
      action,
      packId: pack.id,
      version: pack.version,
      archiveDigest: inspected.snapshot.archiveDigest,
      installedDirectory: finalInstalledSource,
      desiredState: current,
    });
  }

  const stagingRoot = createAssetPackInstallStagingRoot(options.workspace);
  let preserveForRecovery = false;
  try {
    const staged = stageInstalledPayload({
      stagingRoot,
      snapshot: inspected.snapshot,
      workspaceId: current.registry.workspaceId,
      now: options.now,
    });
    const candidate: ValidatedActiveAssetPack = {
      kind: 'installed',
      sourceDirectory: finalInstalledSource,
      archiveDigest: inspected.snapshot.archiveDigest,
      loaded: staged.loaded,
      diagnostics: inspected.report.diagnostics,
    };
    const desired = prepareInstallDesiredState({
      workspace: options.workspace,
      runtime: options.runtime,
      current,
      incoming: candidate,
    });
    if (!desired.ok) return desired;

    const currentInstalled = current.registry.entries.find(
      (entry): entry is InstalledAssetPackRegistryEntry =>
        entry.kind === 'installed' && entry.packId === pack.id,
    );
    const publication = await options.publisher.publish({
      operation: 'install',
      desiredState: desired,
      stagedInstalledSource: staged.sourceDirectory,
      finalInstalledSource,
      cleanupInstalledSources: currentInstalled
        ? [currentInstalled.installedDirectory]
        : [],
    });
    if (!publication.ok) {
      preserveForRecovery = existsSync(
        path.join(options.workspace.stateRoot, 'transaction.json'),
      );
      return publication;
    }
    return installSuccess({
      action,
      packId: pack.id,
      version: pack.version,
      archiveDigest: inspected.snapshot.archiveDigest,
      installedDirectory: finalInstalledSource,
      desiredState: desired,
    });
  } finally {
    if (!preserveForRecovery) {
      try {
        removeAssetPackInstallStagingRoot(options.workspace, stagingRoot);
      } catch {
        // Fail closed on an identity change; never remove a substituted path.
      }
    }
  }
}

export async function installAssetPack(options: {
  readonly archivePath: string;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly now?: () => Date;
  readonly fileOps?: AssetTransactionFileOps;
}): Promise<AssetPackInstallResult> {
  const claimed = await withAssetPackTransactionClaim({
    workspace: options.workspace,
    ...(options.fileOps ? { fileOps: options.fileOps } : {}),
    action: (publisher) => installUnderClaim({
      archivePath: options.archivePath,
      workspace: options.workspace,
      runtime: options.runtime,
      now: options.now ?? (() => new Date()),
      publisher,
    }),
  });
  return claimed.ok ? claimed.value : claimed;
}
