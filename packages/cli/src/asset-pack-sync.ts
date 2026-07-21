import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
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
const REGISTRY_KEYS = ['schema', 'workspaceId', 'entries', 'generatedDigests'] as const;
const REGISTRY_ENTRY_KEYS = [
  'kind',
  'packId',
  'version',
  'displayName',
  'sourceDirectory',
  'contentDigest',
  'sourceDigests',
  'generatedPaths',
  'baselineDefinitionDigests',
  'baselineCreditDigests',
] as const;

export interface LinkedAssetPackRegistryEntry {
  readonly kind: 'linked';
  readonly packId: string;
  readonly version: string;
  readonly displayName: string;
  readonly sourceDirectory: string;
  readonly contentDigest: string;
  readonly sourceDigests: Readonly<Record<string, string>>;
  readonly generatedPaths: readonly string[];
  readonly baselineDefinitionDigests: Readonly<Record<string, string>>;
  readonly baselineCreditDigests: Readonly<Record<string, string>>;
}

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

interface RegistryDocument {
  readonly schema: typeof ASSET_WORKSPACE_REGISTRY_SCHEMA;
  readonly workspaceId: string;
  readonly entries: readonly LinkedAssetPackRegistryEntry[];
  readonly generatedDigests: Readonly<Record<string, string>>;
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

function requireStringRecord(
  record: Record<string, unknown>,
  key: string,
  message: string,
): Readonly<Record<string, string>> {
  const value = record[key];
  if (!isRecord(value)) {
    throw new Error(message);
  }
  const entries = Object.entries(value);
  if (entries.some(([, entry]) => typeof entry !== 'string')) {
    throw new Error(message);
  }
  return Object.fromEntries(
    entries.sort(([left], [right]) => left.localeCompare(right)),
  ) as Readonly<Record<string, string>>;
}

function requireStringArray(
  record: Record<string, unknown>,
  key: string,
  message: string,
): readonly string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(message);
  }
  return [...value];
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

function writeSortedJson(
  fileOps: AssetPublicationFileOps,
  filePath: string,
  value: unknown,
): void {
  fileOps.mkdirSync(path.dirname(filePath), { recursive: true });
  fileOps.writeFileSync(filePath, sortedJsonBytes(value));
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

function relativeOutputPath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function snapshotManagedOutputFiles(root: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();

  function visit(current: string): void {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      files.set(relativeOutputPath(root, absolutePath), readFileSync(absolutePath));
    }
  }

  if (existsSync(root)) {
    visit(root);
  }

  return files;
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

function readRegistryDocument(
  workspace: AssetWorkspace,
  markerWorkspaceId: string,
): AssetPackSyncFailure | {
  readonly ok: true;
  readonly document: RegistryDocument;
} {
  if (!existsSync(workspace.registryPath)) {
    const managedFiles = snapshotManagedOutputFiles(workspace.outputRoot);
    managedFiles.delete(OUTPUT_MARKER_FILE);
    if (managedFiles.size > 0) {
      return syncFailure([{
        code: 'asset_output_root_unowned',
        severity: 'error',
        message: 'Managed asset output contains files but the linked-pack registry is missing.',
        path: workspace.outputRoot,
      }]);
    }
    return {
      ok: true,
      document: {
        schema: ASSET_WORKSPACE_REGISTRY_SCHEMA,
        workspaceId: markerWorkspaceId,
        entries: [],
        generatedDigests: {},
      },
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(workspace.registryPath, 'utf8')) as unknown;
    if (!isRecord(parsed)) {
      throw new Error('Asset workspace registry must be a JSON object.');
    }
    exactKeys(parsed, REGISTRY_KEYS, 'Asset workspace registry');
    const schema = requireString(
      parsed,
      'schema',
      'Asset workspace registry must include a string schema.',
    );
    if (schema !== ASSET_WORKSPACE_REGISTRY_SCHEMA) {
      throw new Error(`Unknown asset workspace registry schema: ${schema}`);
    }
    const workspaceId = requireString(
      parsed,
      'workspaceId',
      'Asset workspace registry must include a string workspaceId.',
    );
    if (workspaceId !== markerWorkspaceId) {
      return syncFailure([{
        code: 'asset_output_root_unowned',
        severity: 'error',
        message: 'Managed asset output marker does not match the linked-pack registry.',
        path: workspace.registryPath,
      }]);
    }
    const rawEntries = parsed['entries'];
    if (!Array.isArray(rawEntries)) {
      throw new Error('Asset workspace registry must include an entries array.');
    }
    const entries = rawEntries.map((entry): LinkedAssetPackRegistryEntry => {
      if (!isRecord(entry)) {
        throw new Error('Linked asset-pack registry entry must be a JSON object.');
      }
      exactKeys(entry, REGISTRY_ENTRY_KEYS, 'Linked asset-pack registry entry');
      const kind = requireString(entry, 'kind', 'Linked asset-pack registry entry must include a kind.');
      if (kind !== 'linked') {
        throw new Error(`Unknown linked asset-pack registry entry kind: ${kind}`);
      }
      return {
        kind: 'linked',
        packId: requireString(entry, 'packId', 'Linked asset-pack registry entry must include a packId.'),
        version: requireString(entry, 'version', 'Linked asset-pack registry entry must include a version.'),
        displayName: requireString(
          entry,
          'displayName',
          'Linked asset-pack registry entry must include a displayName.',
        ),
        sourceDirectory: path.resolve(
          requireString(
            entry,
            'sourceDirectory',
            'Linked asset-pack registry entry must include a sourceDirectory.',
          ),
        ),
        contentDigest: requireString(
          entry,
          'contentDigest',
          'Linked asset-pack registry entry must include a contentDigest.',
        ),
        sourceDigests: sortRecord(requireStringRecord(
          entry,
          'sourceDigests',
          'Linked asset-pack registry entry must include a sourceDigests object.',
        )),
        generatedPaths: [...requireStringArray(
          entry,
          'generatedPaths',
          'Linked asset-pack registry entry must include a generatedPaths array.',
        )].sort((left: string, right: string) => left.localeCompare(right)),
        baselineDefinitionDigests: sortRecord(requireStringRecord(
          entry,
          'baselineDefinitionDigests',
          'Linked asset-pack registry entry must include a baselineDefinitionDigests object.',
        )),
        baselineCreditDigests: sortRecord(requireStringRecord(
          entry,
          'baselineCreditDigests',
          'Linked asset-pack registry entry must include a baselineCreditDigests object.',
        )),
      };
    });
    const generatedDigests = sortRecord(requireStringRecord(
      parsed,
      'generatedDigests',
      'Asset workspace registry must include a generatedDigests object.',
    ));
    const malformedDigestPath = Object.entries(generatedDigests)
      .find(([, digest]) => !/^sha256:[0-9a-f]{64}$/.test(digest))?.[0];
    if (malformedDigestPath) {
      throw new Error(
        `Asset workspace registry contains an invalid generated digest: ${malformedDigestPath}`,
      );
    }
    const expectedGeneratedPaths = new Set<string>();
    entries.forEach((entry) => {
      entry.generatedPaths.forEach((generatedPath) => {
        expectedGeneratedPaths.add(generatedPath);
      });
    });
    if (entries.length > 0) {
      expectedGeneratedPaths.add('CREDITS.csv');
    }
    const expectedDigestPaths = [...expectedGeneratedPaths]
      .sort((left, right) => left.localeCompare(right));
    const actualDigestPaths = Object.keys(generatedDigests);
    if (JSON.stringify(actualDigestPaths) !== JSON.stringify(expectedDigestPaths)) {
      throw new Error('Asset workspace registry generatedDigests must exactly cover generated output paths.');
    }

    return {
      ok: true,
      document: {
        schema: ASSET_WORKSPACE_REGISTRY_SCHEMA,
        workspaceId,
        entries: [...entries].sort((left, right) => left.packId.localeCompare(right.packId)),
        generatedDigests,
      },
    };
  } catch (error) {
    return syncFailure([{
      code: 'asset_digest_mismatch',
      severity: 'error',
      message: errorMessage(error),
      path: workspace.registryPath,
    }]);
  }
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
  let loaded: ReturnType<typeof loadAssetPackFiles>;
  try {
    loaded = loadAssetPackFiles(packDirectory);
  } catch (error) {
    const missing = isNodeError(error) && ['ENOENT', 'ENOTDIR'].includes(error.code ?? '');
    return syncFailure([{
      code: missing ? 'asset_source_missing' : 'asset_publish_failed',
      severity: 'error',
      message: missing
        ? `Linked asset-pack source is missing: ${path.resolve(packDirectory)}`
        : errorMessage(error),
      path: path.resolve(packDirectory),
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
      path: path.resolve(packDirectory),
      details: {
        expectedPackId,
        actualPackId: loaded.pack.id,
      },
    }]);
  }

  const report = await validateAssetPackDirectory({
    packDirectory,
    runtime,
    workspace,
  });
  if (!report.valid) {
    return syncFailure(report.diagnostics.map((diagnostic) => toSyncDiagnostic(diagnostic)));
  }

  return {
    ok: true,
    validated: {
      sourceDirectory: path.resolve(packDirectory),
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

function auditPublishedManagedOutput(options: {
  readonly workspace: AssetWorkspace;
  readonly markerBytes: Buffer;
  readonly generatedDigests: Readonly<Record<string, string>>;
}): AssetPackSyncFailure | undefined {
  const actualFiles = snapshotManagedOutputFiles(options.workspace.outputRoot);
  const expectedPathSet = new Set<string>([OUTPUT_MARKER_FILE]);
  Object.keys(options.generatedDigests).forEach((generatedPath) => {
    expectedPathSet.add(generatedPath);
  });

  const strayPath = [...actualFiles.keys()]
    .sort((left, right) => left.localeCompare(right))
    .find((filePath) => !expectedPathSet.has(filePath));
  if (strayPath) {
    return syncFailure([{
      code: 'asset_output_root_unowned',
      severity: 'error',
      message: `Managed asset output contains an unowned file: ${strayPath}`,
      path: path.join(options.workspace.outputRoot, strayPath),
    }]);
  }

  const missingPath = [...expectedPathSet]
    .sort((left, right) => left.localeCompare(right))
    .find((filePath) => !actualFiles.has(filePath));
  if (missingPath) {
    return syncFailure([{
      code: 'asset_digest_mismatch',
      severity: 'error',
      message: `Managed asset output is missing a registry-owned file: ${missingPath}`,
      path: path.join(options.workspace.outputRoot, missingPath),
    }]);
  }

  const markerBytes = actualFiles.get(OUTPUT_MARKER_FILE);
  const mismatchedPath = markerBytes === undefined || !markerBytes.equals(options.markerBytes)
    ? OUTPUT_MARKER_FILE
    : Object.entries(options.generatedDigests)
      .find(([filePath, digest]) => {
        const actual = actualFiles.get(filePath);
        return actual === undefined || sha256Buffer(actual) !== digest;
      })?.[0];
  if (mismatchedPath) {
    return syncFailure([{
      code: 'asset_digest_mismatch',
      severity: 'error',
      message: `Managed asset output differs from the registry-owned generated file: ${mismatchedPath}`,
      path: path.join(options.workspace.outputRoot, mismatchedPath),
    }]);
  }

  return undefined;
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

  const registryResult = readRegistryDocument(options.workspace, marker.workspaceId);
  if (!registryResult.ok) return registryResult;

  const requestedResult = await validateLinkedPack(
    options.packDirectory,
    options.runtime,
    options.workspace,
  );
  if (!requestedResult.ok) return requestedResult;
  const requested = requestedResult.validated;
  const retainedEntries = registryResult.document.entries
    .filter((entry) => entry.packId !== requested.loaded.pack.id)
    .sort((left, right) => left.packId.localeCompare(right.packId));

  const retainedValidated: ValidatedLinkedAssetPack[] = [];
  for (const entry of retainedEntries) {
    const validated = await validateLinkedPack(
      entry.sourceDirectory,
      options.runtime,
      options.workspace,
      entry.packId,
    );
    if (!validated.ok) return validated;
    retainedValidated.push(validated.validated);
  }

  const publishedOutputFailure = auditPublishedManagedOutput({
    workspace: options.workspace,
    markerBytes,
    generatedDigests: registryResult.document.generatedDigests,
  });
  if (publishedOutputFailure) return publishedOutputFailure;

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

  const generatedPathsByPackId = new Map(
    compilePlan.ownership.map((ownership) => [ownership.packId, ownership.logicalPaths] as const),
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
    baselineDefinitionDigests: collectBaselineDefinitionDigests(pack.loaded.pack),
    baselineCreditDigests: collectBaselineCreditDigests(pack.loaded.pack),
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

  return {
    ok: true,
    requested,
    packs: validatedPacks,
    compilePlan,
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

    const packRoots = new Map(
      validatedPacks.map((pack) => [pack.loaded.pack.id, pack.sourceDirectory] as const),
    );
    for (const sprite of compilePlan.sprites) {
      const sourceDirectory = packRoots.get(sprite.packId);
      if (!sourceDirectory) {
        return syncFailure([{
          code: 'asset_publish_failed',
          severity: 'error',
          message: `No linked source directory found for compiled sprite owner ${sprite.packId}.`,
          path: path.resolve(options.packDirectory),
        }]);
      }
      const sourcePath = path.join(sourceDirectory, sprite.sourcePath);
      const destinationPath = path.join(stagedOutputRoot, sprite.destinationPath);
      const spriteBytes = readFileSync(sourcePath);
      fileOps.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fileOps.writeFileSync(destinationPath, spriteBytes);
      generatedDigests.set(sprite.destinationPath, sha256Buffer(spriteBytes));
    }

    const creditsBytes = Buffer.from(creditsToCsv(creditsManifest(compilePlan.credits), 'walk'));
    fileOps.writeFileSync(path.join(stagedOutputRoot, 'CREDITS.csv'), creditsBytes);
    generatedDigests.set('CREDITS.csv', sha256Buffer(creditsBytes));
    writeSortedJson(fileOps, stagedRegistryPath, {
      schema: ASSET_WORKSPACE_REGISTRY_SCHEMA,
      workspaceId,
      entries: registryEntries,
      generatedDigests: sortRecord(Object.fromEntries(generatedDigests)),
    });

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
