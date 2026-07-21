import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, existsSync, statSync } from 'node:fs';
import {
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
  ASSET_WORKSPACE_REGISTRY_SCHEMA,
  assertManagedAssetOutput,
  type AssetWorkspace,
} from './asset-workspace.js';
import {
  assetPackCompileDigest,
  assetPackCompileProjectionFromPlan,
  assetPackRegistryBytes,
  auditPublishedManagedOutput,
  readAssetPackRegistry,
  resolveLinkedAssetPackDirectory,
  type AssetPackRegistryDocument,
  type AssetPackCompileProjection,
  type LinkedAssetPackRegistryEntry,
} from './asset-pack-registry.js';
import {
  loadAssetPackFiles,
  type AssetPackFileDiagnostic,
  type AssetPackFilesSuccess,
} from './asset-pack-files.js';
import {
  loadActiveAssetPackBaseline,
  validateAssetPackDirectory,
} from './asset-pack-validation.js';
import type { RuntimeAssets } from './runtime-assets.js';

const OUTPUT_MARKER_FILE = '.lpc-toolkit-managed.json';
const OUTPUT_MARKER_KEYS = ['schema', 'workspaceId'] as const;

export type { LinkedAssetPackRegistryEntry } from './asset-pack-registry.js';

export interface AssetPackSyncDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
  readonly path?: string;
  readonly packId?: string;
  readonly assetId?: string;
  readonly sourcePath?: string;
  readonly destinationPath?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AssetPackSyncSuccess {
  readonly ok: true;
  readonly linked: LinkedAssetPackRegistryEntry;
  readonly registry: readonly LinkedAssetPackRegistryEntry[];
}

export interface AssetPackSyncFailure {
  readonly ok: false;
  readonly diagnostics: readonly AssetPackSyncDiagnostic[];
}

export type AssetPackSyncResult = AssetPackSyncSuccess | AssetPackSyncFailure;

export interface AssetPublicationFileOps {
  readonly mkdirSync: typeof mkdirSync;
  readonly writeFileSync: typeof writeFileSync;
  readonly renameSync: typeof renameSync;
  readonly rmSync: typeof rmSync;
}

interface ManagedOutputMarker {
  readonly schema: typeof ASSET_OUTPUT_MARKER_SCHEMA;
  readonly workspaceId: string;
}

export interface ValidatedLinkedAssetPack {
  readonly sourceDirectory: string;
  readonly loaded: AssetPackFilesSuccess;
  readonly diagnostics: readonly AssetPackSyncDiagnostic[];
}

export interface LinkedAssetPackDesiredState {
  readonly ok: true;
  readonly requested: ValidatedLinkedAssetPack;
  readonly packs: readonly ValidatedLinkedAssetPack[];
  readonly compilePlan: AssetPackCompilePlan;
  readonly compileProjection: AssetPackCompileProjection;
  readonly registry: readonly LinkedAssetPackRegistryEntry[];
  readonly warnings: readonly AssetPackSyncDiagnostic[];
  readonly workspaceId: string;
  readonly markerBytes: Buffer;
}

export type LinkedAssetPackDesiredStateResult =
  | LinkedAssetPackDesiredState
  | AssetPackSyncFailure;

const DEFAULT_FILE_OPS: AssetPublicationFileOps = {
  mkdirSync,
  writeFileSync,
  renameSync,
  rmSync,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function exactKeys(
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const expected = new Set(expectedKeys);
  const unknown = Object.keys(record).filter((key) => !expected.has(key));
  if (unknown.length > 0) {
    throw new Error(`${label} contains unknown keys: ${unknown.join(', ')}`);
  }
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  message: string,
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(message);
  }
  return value;
}

function sortRecord(record: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  ) as Readonly<Record<string, string>>;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)] as const),
    );
  }
  return value;
}

function sha256Buffer(buffer: Buffer): string {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function sortedJsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(canonicalize(value), null, 2)}\n`);
}

function toSyncDiagnostic(
  diagnostic: AssetPackDiagnostic | AssetPackFileDiagnostic,
): AssetPackSyncDiagnostic {
  return {
    code: diagnostic.code,
    message: diagnostic.message,
    severity: 'severity' in diagnostic ? diagnostic.severity : 'error',
    ...('path' in diagnostic && diagnostic.path ? { path: diagnostic.path } : {}),
    ...('packId' in diagnostic && diagnostic.packId ? { packId: diagnostic.packId } : {}),
    ...('assetId' in diagnostic && diagnostic.assetId ? { assetId: diagnostic.assetId } : {}),
    ...('sourcePath' in diagnostic && diagnostic.sourcePath ? { sourcePath: diagnostic.sourcePath } : {}),
    ...('destinationPath' in diagnostic && diagnostic.destinationPath
      ? { destinationPath: diagnostic.destinationPath }
      : {}),
    ...(diagnostic.details ? { details: diagnostic.details } : {}),
  };
}

function syncFailure(
  diagnostics: readonly AssetPackSyncDiagnostic[],
): AssetPackSyncFailure {
  return { ok: false, diagnostics };
}

function outputMarkerPath(workspace: AssetWorkspace): string {
  return path.join(workspace.outputRoot, OUTPUT_MARKER_FILE);
}

function readManagedOutputMarker(workspace: AssetWorkspace): {
  readonly marker: ManagedOutputMarker;
  readonly bytes: Buffer;
} {
  const markerPath = outputMarkerPath(workspace);
  const bytes = readFileSync(markerPath);
  const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
  if (!isRecord(parsed)) {
    throw new Error('Asset output marker must be a JSON object.');
  }
  exactKeys(parsed, OUTPUT_MARKER_KEYS, 'Asset output marker');
  const schema = requireString(
    parsed,
    'schema',
    'Asset output marker must include a string schema.',
  );
  if (schema !== ASSET_OUTPUT_MARKER_SCHEMA) {
    throw new Error(`Unknown asset output marker schema: ${schema}`);
  }
  return {
    marker: {
      schema: ASSET_OUTPUT_MARKER_SCHEMA,
      workspaceId: requireString(
        parsed,
        'workspaceId',
        'Asset output marker must include a string workspaceId.',
      ),
    },
    bytes,
  };
}

function collectBaselineDefinitionDigests(
  pack: NormalizedAssetPack,
): Readonly<Record<string, string>> {
  const entries: Array<readonly [string, string]> = [];
  pack.assets.forEach((asset) => {
    if (asset.kind === 'extend-item') {
      entries.push([asset.itemId, asset.baseDefinitionDigest]);
    }
  });
  return Object.fromEntries(
    entries.sort(([left], [right]) => left.localeCompare(right)),
  ) as Readonly<Record<string, string>>;
}

function collectBaselineCreditDigests(
  pack: NormalizedAssetPack,
): Readonly<Record<string, string>> {
  const entries: Array<readonly [string, string]> = [];
  pack.assets.forEach((asset) => {
    if (asset.kind === 'extend-item') {
      entries.push([asset.itemId, asset.baseCreditDigest]);
    }
  });
  return Object.fromEntries(
    entries.sort(([left], [right]) => left.localeCompare(right)),
  ) as Readonly<Record<string, string>>;
}

async function validateLinkedPack(
  packDirectory: string,
  runtime: RuntimeAssets,
  workspace: AssetWorkspace,
  expectedPackId?: string,
): Promise<AssetPackSyncFailure | {
  readonly ok: true;
  readonly validated: ValidatedLinkedAssetPack;
}> {
  let sourceDirectory: string;
  try {
    sourceDirectory = resolveLinkedAssetPackDirectory(workspace, packDirectory);
  } catch (error) {
    return syncFailure([{
      code: 'asset_digest_mismatch',
      severity: 'error',
      message: errorMessage(error),
      path: path.resolve(packDirectory),
    }]);
  }

  let loaded: ReturnType<typeof loadAssetPackFiles>;
  try {
    loaded = loadAssetPackFiles(sourceDirectory);
  } catch (error) {
    const missing = isNodeError(error) && ['ENOENT', 'ENOTDIR'].includes(error.code ?? '');
    return syncFailure([{
      code: missing ? 'asset_source_missing' : 'asset_publish_failed',
      severity: 'error',
      message: missing
        ? `Linked asset-pack source is missing: ${sourceDirectory}`
        : errorMessage(error),
      path: sourceDirectory,
    }]);
  }

  if (!loaded.ok) {
    return syncFailure(loaded.diagnostics.map((diagnostic) => toSyncDiagnostic(diagnostic)));
  }
  if (expectedPackId !== undefined && loaded.pack.id !== expectedPackId) {
    return syncFailure([{
      code: 'asset_digest_mismatch',
      severity: 'error',
      message: `Linked asset-pack source changed pack ID from ${expectedPackId} to ${loaded.pack.id}.`,
      path: sourceDirectory,
      details: {
        expectedPackId,
        actualPackId: loaded.pack.id,
      },
    }]);
  }

  const report = await validateAssetPackDirectory({
    packDirectory: sourceDirectory,
    runtime,
    workspace,
    snapshot: loaded,
  });
  if (!report.valid) {
    return syncFailure(report.diagnostics.map((diagnostic) => toSyncDiagnostic(diagnostic)));
  }
  if (report.contentDigest !== loaded.contentDigest) {
    return syncFailure([{
      code: 'asset_digest_mismatch',
      severity: 'error',
      message: `Linked asset-pack source changed while it was being validated: ${path.resolve(packDirectory)}`,
      path: sourceDirectory,
      details: {
        validatedContentDigest: report.contentDigest,
        capturedContentDigest: loaded.contentDigest,
      },
    }]);
  }

  return {
    ok: true,
    validated: {
      sourceDirectory,
      loaded,
      diagnostics: report.diagnostics.map((diagnostic) => toSyncDiagnostic(diagnostic)),
    },
  };
}

function uniqueLicenses(credits: readonly CreditEntry[]): CreditsManifest['licenses'] {
  const seen = new Set<string>();
  const licenses: string[] = [];
  credits.forEach((credit) => {
    credit.licenses.forEach((license) => {
      if (!seen.has(license)) {
        seen.add(license);
        licenses.push(license);
      }
    });
  });
  return licenses.sort((left, right) => left.localeCompare(right)) as CreditsManifest['licenses'];
}

function creditsManifest(credits: readonly CreditEntry[]): CreditsManifest {
  return {
    entries: credits,
    resolvedPaths: credits.map((credit) => `spritesheets/${credit.file}`),
    licenses: uniqueLicenses(credits),
  };
}

function preflightPublish(workspace: AssetWorkspace): AssetPackSyncFailure | undefined {
  try {
    assertManagedAssetOutput(workspace);
    if (!statSync(workspace.outputRoot).isDirectory()) {
      throw new Error(`Managed asset output directory does not exist: ${workspace.outputRoot}`);
    }
    if (existsSync(workspace.registryPath) && statSync(workspace.registryPath).isDirectory()) {
      return syncFailure([{
        code: 'asset_publish_failed',
        severity: 'error',
        message: `Cannot publish linked asset-pack registry over directory: ${workspace.registryPath}`,
        path: workspace.registryPath,
      }]);
    }
    return undefined;
  } catch (error) {
    return syncFailure([{
      code: 'asset_output_root_unowned',
      severity: 'error',
      message: errorMessage(error),
      path: workspace.outputRoot,
    }]);
  }
}

function publishStagedGeneration(options: {
  readonly fileOps: AssetPublicationFileOps;
  readonly generationRoot: string;
  readonly stagedOutputRoot: string;
  readonly stagedRegistryPath: string;
  readonly workspace: AssetWorkspace;
}): {
  readonly failure?: AssetPackSyncFailure;
  readonly retainGenerationRoot: boolean;
} {
  const backupRoot = path.join(options.generationRoot, '.backup');
  const backupOutputRoot = path.join(backupRoot, 'assets_custom');
  const backupRegistryPath = path.join(backupRoot, 'registry.json');
  let movedCurrentOutput = false;
  let movedCurrentRegistry = false;
  let publishedOutput = false;
  let publishedRegistry = false;

  try {
    options.fileOps.mkdirSync(backupRoot, { recursive: true });
    options.fileOps.renameSync(options.workspace.outputRoot, backupOutputRoot);
    movedCurrentOutput = true;

    if (existsSync(options.workspace.registryPath)) {
      options.fileOps.renameSync(options.workspace.registryPath, backupRegistryPath);
      movedCurrentRegistry = true;
    }

    options.fileOps.renameSync(options.stagedOutputRoot, options.workspace.outputRoot);
    publishedOutput = true;
    options.fileOps.renameSync(options.stagedRegistryPath, options.workspace.registryPath);
    publishedRegistry = true;
    options.fileOps.rmSync(backupRoot, { recursive: true, force: true });
    return { retainGenerationRoot: false };
  } catch (error) {
    try {
      if (publishedRegistry && existsSync(options.workspace.registryPath)) {
        options.fileOps.rmSync(options.workspace.registryPath, { force: true });
      }
      if (publishedOutput && existsSync(options.workspace.outputRoot)) {
        options.fileOps.rmSync(options.workspace.outputRoot, { recursive: true, force: true });
      }
      if (movedCurrentRegistry && existsSync(backupRegistryPath)) {
        options.fileOps.renameSync(backupRegistryPath, options.workspace.registryPath);
      }
      if (movedCurrentOutput && existsSync(backupOutputRoot)) {
        options.fileOps.renameSync(backupOutputRoot, options.workspace.outputRoot);
      }
      return {
        retainGenerationRoot: false,
        failure: syncFailure([{
          code: 'asset_publish_failed',
          severity: 'error',
          message: errorMessage(error),
          path: options.workspace.outputRoot,
        }]),
      };
    } catch (rollbackError) {
      return {
        retainGenerationRoot: true,
        failure: syncFailure([{
          code: 'asset_publish_failed',
          severity: 'error',
          message: errorMessage(error),
          path: options.workspace.outputRoot,
          details: {
            rollbackError: errorMessage(rollbackError),
            recoveryPaths: [
              backupOutputRoot,
              backupRegistryPath,
              options.stagedOutputRoot,
              options.stagedRegistryPath,
            ].filter((candidate) => existsSync(candidate)),
          },
        }]),
      };
    }
  }
}

export async function prepareLinkedAssetPackDesiredState(options: {
  readonly packDirectory: string;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
}): Promise<LinkedAssetPackDesiredStateResult> {
  const publishFailure = preflightPublish(options.workspace);
  if (publishFailure) return publishFailure;

  let marker: ManagedOutputMarker;
  let markerBytes: Buffer;
  try {
    const read = readManagedOutputMarker(options.workspace);
    marker = read.marker;
    markerBytes = read.bytes;
  } catch (error) {
    return syncFailure([{
      code: 'asset_output_root_unowned',
      severity: 'error',
      message: errorMessage(error),
      path: options.workspace.outputRoot,
    }]);
  }

  const requestedResult = await validateLinkedPack(
    options.packDirectory,
    options.runtime,
    options.workspace,
  );
  if (!requestedResult.ok) return requestedResult;
  const requested = requestedResult.validated;

  const registryResult = readAssetPackRegistry({
    workspace: options.workspace,
    markerWorkspaceId: marker.workspaceId,
  });
  if (!registryResult.ok) return syncFailure(registryResult.diagnostics);
  const retainedEntries = registryResult.document.entries
    .filter((entry) => entry.packId !== requested.loaded.pack.id)
    .sort((left, right) => left.packId.localeCompare(right.packId));

  const retainedValidated: ValidatedLinkedAssetPack[] = [];
  for (const entry of retainedEntries) {
    if (entry.kind !== 'linked') {
      return syncFailure([{
        code: 'asset_publish_failed',
        severity: 'error',
        message: `Phase 1 sync cannot publish an installed registry entry: ${entry.packId}.`,
        path: options.workspace.registryPath,
        packId: entry.packId,
      }]);
    }
    const validated = await validateLinkedPack(
      entry.sourceDirectory,
      options.runtime,
      options.workspace,
      entry.packId,
    );
    if (!validated.ok) return validated;
    if (
      validated.validated.loaded.contentDigest !== entry.contentDigest ||
      JSON.stringify(sortRecord(Object.fromEntries(validated.validated.loaded.sourceDigests))) !==
        JSON.stringify(entry.sourceDigests)
    ) {
      return syncFailure([{
        code: 'asset_digest_mismatch',
        severity: 'error',
        message: `Linked asset-pack source differs from the registry snapshot: ${entry.packId}.`,
        path: entry.sourceDirectory,
        packId: entry.packId,
      }]);
    }
    retainedValidated.push(validated.validated);
  }

  const publishedOutputFailure = auditPublishedManagedOutput({
    workspace: options.workspace,
    markerBytes,
    generatedDigests: registryResult.document.generatedDigests,
  });
  if (publishedOutputFailure) return syncFailure([publishedOutputFailure]);

  const validatedPacks = [
    ...retainedValidated,
    requested,
  ].sort((left, right) => left.loaded.pack.id.localeCompare(right.loaded.pack.id));

  const baseline = loadActiveAssetPackBaseline({
    runtime: options.runtime,
    workspace: options.workspace,
  });
  const compilePlan = compileAssetPacks({
    baseline,
    packs: validatedPacks.map((pack) => pack.loaded.pack),
  });
  const compileErrors = compilePlan.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (compileErrors.length > 0) {
    return syncFailure(compileErrors.map((diagnostic) => toSyncDiagnostic(diagnostic)));
  }

  let compileProjection: AssetPackCompileProjection;
  try {
    compileProjection = assetPackCompileProjectionFromPlan({
      compilePlan,
      sourceDigestsByPackId: new Map(
        validatedPacks.map((pack) => [pack.loaded.pack.id, pack.loaded.sourceDigests] as const),
      ),
    });
  } catch (error) {
    return syncFailure([{
      code: 'asset_digest_mismatch',
      severity: 'error',
      message: errorMessage(error),
      path: path.resolve(options.packDirectory),
    }]);
  }

  const generatedPathsByPackId = new Map(
    compilePlan.ownership.map((ownership) => [ownership.packId, ownership.logicalPaths] as const),
  );
  const generatedSpritesByPackId = new Map(
    validatedPacks.map((pack) => [
      pack.loaded.pack.id,
      compileProjection.sprites
        .filter((sprite) => sprite.packId === pack.loaded.pack.id)
        .map(({ packId: _packId, ...sprite }) => sprite),
    ] as const),
  );
  const logicalDestinationsByPackId = new Map(
    validatedPacks.map((pack) => [
      pack.loaded.pack.id,
      compilePlan.sprites
        .filter((sprite) => sprite.packId === pack.loaded.pack.id)
        .map((sprite) => sprite.destinationPath)
        .sort((left, right) => left.localeCompare(right)),
    ] as const),
  );
  const registryEntries = validatedPacks.map((pack): LinkedAssetPackRegistryEntry => ({
    kind: 'linked',
    packId: pack.loaded.pack.id,
    version: pack.loaded.pack.version,
    displayName: pack.loaded.pack.displayName,
    sourceDirectory: pack.sourceDirectory,
    contentDigest: pack.loaded.contentDigest,
    sourceDigests: sortRecord(Object.fromEntries(
      [...pack.loaded.sourceDigests.entries()].sort(([left], [right]) => left.localeCompare(right)),
    )),
    generatedPaths: [...(generatedPathsByPackId.get(pack.loaded.pack.id) ?? [])]
      .sort((left, right) => left.localeCompare(right)),
    logicalDestinations: logicalDestinationsByPackId.get(pack.loaded.pack.id) ?? [],
    generatedSprites: generatedSpritesByPackId.get(pack.loaded.pack.id) ?? [],
    replacements: pack.loaded.pack.replacements,
    acknowledgements: pack.loaded.pack.acknowledgements,
    baselineDefinitionDigests: collectBaselineDefinitionDigests(pack.loaded.pack),
    baselineCreditDigests: collectBaselineCreditDigests(pack.loaded.pack),
    generatedCredits: compilePlan.credits
      .filter((credit) => (logicalDestinationsByPackId.get(pack.loaded.pack.id) ?? [])
        .some((destination) => destination === `spritesheets/${credit.file}` || destination.startsWith(`spritesheets/${credit.file}/`)))
      .sort((left, right) => left.file.localeCompare(right.file)),
  })).sort((left, right) => left.packId.localeCompare(right.packId));

  const linked = registryEntries.find((entry) => entry.packId === requested.loaded.pack.id);
  if (!linked) {
    return syncFailure([{
      code: 'asset_publish_failed',
      severity: 'error',
      message: 'Requested linked asset-pack registry entry was not generated.',
      path: path.resolve(options.packDirectory),
    }]);
  }

  if (registryResult.document.schema === 'lpc-toolkit.asset-workspace-registry.v1') {
    for (const retained of retainedEntries) {
      const compiled = registryEntries.find((entry) => entry.packId === retained.packId);
      if (
        compiled === undefined
        || retained.kind !== 'linked'
        || retained.packId !== compiled.packId
        || retained.version !== compiled.version
        || retained.displayName !== compiled.displayName
        || path.resolve(retained.sourceDirectory) !== compiled.sourceDirectory
        || retained.contentDigest !== compiled.contentDigest
        || JSON.stringify(retained.sourceDigests) !== JSON.stringify(compiled.sourceDigests)
        || JSON.stringify(retained.generatedPaths) !== JSON.stringify(compiled.generatedPaths)
        || JSON.stringify(retained.baselineDefinitionDigests)
          !== JSON.stringify(compiled.baselineDefinitionDigests)
        || JSON.stringify(retained.baselineCreditDigests)
          !== JSON.stringify(compiled.baselineCreditDigests)
      ) {
        return syncFailure([{
          code: 'asset_digest_mismatch',
          severity: 'error',
          message: `Retained v1 linked asset-pack registry entry does not match the validated compile state: ${retained.packId}.`,
          path: options.workspace.registryPath,
          packId: retained.packId,
        }]);
      }
    }
  }

  return {
    ok: true,
    requested,
    packs: validatedPacks,
    compilePlan,
    compileProjection,
    registry: registryEntries,
    warnings: [
      ...validatedPacks.flatMap((pack) => pack.diagnostics),
      ...compilePlan.diagnostics
        .filter((diagnostic) => diagnostic.severity === 'warning')
        .map((diagnostic) => toSyncDiagnostic(diagnostic)),
    ],
    workspaceId: marker.workspaceId,
    markerBytes,
  };
}

export async function syncLinkedAssetPack(options: {
  readonly packDirectory: string;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly fileOps?: AssetPublicationFileOps;
}): Promise<AssetPackSyncResult> {
  const fileOps = options.fileOps ?? DEFAULT_FILE_OPS;
  const desiredState = await prepareLinkedAssetPackDesiredState(options);
  if (!desiredState.ok) return desiredState;
  const {
    compilePlan,
    compileProjection,
    markerBytes,
    packs: validatedPacks,
    registry: registryEntries,
    requested,
    workspaceId,
  } = desiredState;
  const linked = registryEntries.find((entry) => entry.packId === requested.loaded.pack.id);
  if (!linked) {
    return syncFailure([{
      code: 'asset_publish_failed',
      severity: 'error',
      message: 'Requested linked asset-pack registry entry was not generated.',
      path: path.resolve(options.packDirectory),
    }]);
  }

  const generationRoot = mkdtempSync(
    path.join(options.workspace.stateRoot, 'staging', 'sync-'),
  );
  const stagedOutputRoot = path.join(generationRoot, 'assets_custom');
  const stagedRegistryPath = path.join(generationRoot, 'registry.json');
  let keepGenerationRoot = false;

  try {
    fileOps.mkdirSync(stagedOutputRoot, { recursive: true });
    fileOps.writeFileSync(path.join(stagedOutputRoot, OUTPUT_MARKER_FILE), markerBytes);
    const generatedDigests = new Map<string, string>();

    for (const definition of compilePlan.definitions) {
      const definitionBytes = sortedJsonBytes(definition.definition);
      const definitionPath = path.join(stagedOutputRoot, definition.logicalPath);
      fileOps.mkdirSync(path.dirname(definitionPath), { recursive: true });
      fileOps.writeFileSync(definitionPath, definitionBytes);
      generatedDigests.set(definition.logicalPath, sha256Buffer(definitionBytes));
    }

    const packSnapshots = new Map(
      validatedPacks.map((pack) => [pack.loaded.pack.id, pack.loaded.sourceBytes] as const),
    );
    for (const sprite of compilePlan.sprites) {
      const sourceBytes = packSnapshots.get(sprite.packId)?.get(sprite.sourcePath);
      if (!sourceBytes) {
        return syncFailure([{
          code: 'asset_publish_failed',
          severity: 'error',
          message: `No validated source snapshot found for compiled sprite owner ${sprite.packId}.`,
          path: path.resolve(options.packDirectory),
        }]);
      }
      const destinationPath = path.join(stagedOutputRoot, sprite.destinationPath);
      fileOps.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fileOps.writeFileSync(destinationPath, sourceBytes);
      generatedDigests.set(sprite.destinationPath, sha256Buffer(sourceBytes));
    }

    const creditsBytes = Buffer.from(creditsToCsv(creditsManifest(compilePlan.credits), 'walk'));
    fileOps.writeFileSync(path.join(stagedOutputRoot, 'CREDITS.csv'), creditsBytes);
    generatedDigests.set('CREDITS.csv', sha256Buffer(creditsBytes));
    const registryDocument: AssetPackRegistryDocument = {
      schema: ASSET_WORKSPACE_REGISTRY_SCHEMA,
      workspaceId,
      entries: registryEntries,
      generatedDigests: sortRecord(Object.fromEntries(generatedDigests)),
      compileDigest: assetPackCompileDigest(compileProjection),
    };
    fileOps.writeFileSync(stagedRegistryPath, assetPackRegistryBytes(registryDocument));

    const publishResult = publishStagedGeneration({
      fileOps,
      generationRoot,
      stagedOutputRoot,
      stagedRegistryPath,
      workspace: options.workspace,
    });
    keepGenerationRoot = publishResult.retainGenerationRoot;
    if (publishResult.failure) return publishResult.failure;

    return {
      ok: true,
      linked,
      registry: registryEntries,
    };
  } catch (error) {
    return syncFailure([{
      code: 'asset_publish_failed',
      severity: 'error',
      message: errorMessage(error),
      path: options.workspace.outputRoot,
    }]);
  } finally {
    if (!keepGenerationRoot) {
      rmSync(generationRoot, { recursive: true, force: true });
    }
  }
}
