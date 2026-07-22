import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  contextualizeAssetCacheError,
  ensureAssetCache,
  type AssetCacheProgress,
} from './asset-cache.js';
import {
  bundledAssetReleasePath,
  loadAssetReleaseConfig,
  resolveAssetCacheRoot,
} from './asset-release.js';
import {
  createDirectoryAssetStore,
  createZipAssetStore,
  type AssetStore,
} from './asset-store.js';
import { createOverlayAssetStore } from './asset-overlay-store.js';
import {
  auditPublishedManagedOutput,
  ASSET_WORKSPACE_REGISTRY_SCHEMA,
  assetPackRegistryBytes,
  readAssetPackRegistry,
  type AssetPackLifecycleDiagnostic,
} from './asset-pack-registry.js';
import {
  prepareAssetPackDesiredState,
  type AssetPackDesiredState,
  type AssetPackDesiredStateResult,
} from './asset-pack-state.js';
import { withAssetPackTransactionClaim } from './asset-pack-transaction.js';
import {
  assertManagedAssetOutput,
  findAssetWorkspace,
  type AssetWorkspace,
} from './asset-workspace.js';
import { createRuntimeContext, type RuntimeContext } from './context.js';
import { loadCatalogFromRoots, loadPalettesFromRoot } from './loaders.js';

interface RuntimeCatalogSnapshot {
  readonly catalog: ReturnType<typeof loadCatalogFromRoots>;
  readonly palettes: ReturnType<typeof loadPalettesFromRoot>;
}

export interface RuntimeAssets {
  readonly context: RuntimeContext;
  readonly store: AssetStore;
  readonly source: 'working-directory' | 'managed-cache';
  readonly releaseTag?: string;
  readonly catalogSnapshot?: RuntimeCatalogSnapshot;
}

export interface PrepareRuntimeAssetsOptions {
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly platform?: NodeJS.Platform;
  readonly homeDir?: string;
  readonly configPath?: string;
  readonly ensureCache?: typeof ensureAssetCache;
  readonly onProgress?: (progress: AssetCacheProgress) => void;
  readonly managedCacheOnly?: boolean;
}

export interface OverlayRuntimeAssetsOptions {
  readonly runtime: RuntimeAssets;
  readonly customSheetDefinitionsRoot: string;
  readonly overlayRoot: string;
  readonly logicalPaths: readonly string[];
  readonly fileSnapshot?: ReadonlyMap<string, Buffer>;
  readonly catalogSnapshot?: RuntimeCatalogSnapshot;
}

export class AssetWorkspaceRuntimeError extends Error {
  readonly code: string;
  readonly path: string | undefined;

  constructor(options: {
    readonly code: string;
    readonly message: string;
    readonly path?: string;
  }) {
    super(options.message);
    this.name = 'AssetWorkspaceRuntimeError';
    this.code = options.code;
    this.path = options.path;
  }
}

const WORKSPACE_CONFIG_FILE = 'lpc-asset-workspace.json';
const OUTPUT_MARKER_FILE = '.lpc-toolkit-managed.json';

function isDirectory(pathName: string): boolean {
  try {
    return statSync(pathName).isDirectory();
  } catch {
    return false;
  }
}

function isFile(pathName: string): boolean {
  try {
    return statSync(pathName).isFile();
  } catch {
    return false;
  }
}

function hasCompleteLocalAssets(assetsRoot: string): boolean {
  return (
    isDirectory(path.join(assetsRoot, 'sheet_definitions')) &&
    isDirectory(path.join(assetsRoot, 'palette_definitions')) &&
    isDirectory(path.join(assetsRoot, 'spritesheets')) &&
    isFile(path.join(assetsRoot, 'CREDITS.csv'))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findWorkspaceRoot(start: string): string | undefined {
  let current = path.resolve(start);
  while (true) {
    if (existsSync(path.join(current, WORKSPACE_CONFIG_FILE))) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function workspaceMarker(options: {
  readonly workspace: AssetWorkspace;
}): { readonly bytes: Buffer; readonly workspaceId: string } {
  assertManagedAssetOutput(options.workspace);
  const markerPath = path.join(options.workspace.outputRoot, OUTPUT_MARKER_FILE);
  const bytes = readFileSync(markerPath);
  const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
  if (!isRecord(parsed) || typeof parsed.workspaceId !== 'string') {
    throw new AssetWorkspaceRuntimeError({
      code: 'asset_output_root_unowned',
      message: 'Managed asset output marker does not contain a workspace ID.',
      path: markerPath,
    });
  }
  return { bytes, workspaceId: parsed.workspaceId };
}

function runtimeFailure(
  diagnostic: AssetPackLifecycleDiagnostic | undefined,
): AssetWorkspaceRuntimeError {
  return new AssetWorkspaceRuntimeError({
    code: diagnostic?.code ?? 'asset_digest_mismatch',
    message: diagnostic?.message ?? 'Managed asset-pack runtime activation failed.',
    ...(diagnostic?.path === undefined ? {} : { path: diagnostic.path }),
  });
}

type RuntimeAuthenticationResult =
  | AssetPackDesiredState
  | Exclude<AssetPackDesiredStateResult, AssetPackDesiredState>;

async function authenticateRuntimeGeneration(options: {
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
}): Promise<RuntimeAuthenticationResult> {
  const marker = workspaceMarker({ workspace: options.workspace });
  const registry = readAssetPackRegistry({
    workspace: options.workspace,
    markerWorkspaceId: marker.workspaceId,
  });
  if (!registry.ok) return registry;
  if (registry.document.schema !== ASSET_WORKSPACE_REGISTRY_SCHEMA) {
    return {
      ok: false,
      diagnostics: [{
        code: 'asset_registry_migration_required',
        severity: 'error',
        message: 'Asset-pack registry v1 must be migrated by a lifecycle manager publication before runtime activation.',
        path: options.workspace.registryPath,
      }],
    };
  }
  const outputIssue = auditPublishedManagedOutput({
    workspace: options.workspace,
    markerBytes: marker.bytes,
    generatedDigests: registry.document.generatedDigests,
  });
  if (outputIssue !== undefined) {
    return { ok: false, diagnostics: [outputIssue] };
  }
  const desired = await prepareAssetPackDesiredState({
    workspace: options.workspace,
    runtime: options.runtime,
    mutation: { kind: 'none' },
  });
  if (!desired.ok) return desired;
  if (!assetPackRegistryBytes(registry.document).equals(
    assetPackRegistryBytes(desired.registry),
  )) {
    return {
      ok: false,
      diagnostics: [{
        code: 'asset_desired_state_mismatch',
        severity: 'error',
        message: 'Published asset-pack registry differs from freshly authenticated desired state.',
        path: options.workspace.registryPath,
      }],
    };
  }
  return desired;
}

function capturedCatalogSnapshot(
  runtime: RuntimeAssets,
  desired: AssetPackDesiredState,
): RuntimeCatalogSnapshot {
  const definitionPrefix = 'sheet_definitions/';
  const customRecords = Object.fromEntries(
    desired.compilePlan.definitions.map((definition) => {
      if (!definition.logicalPath.startsWith(definitionPrefix)) {
        throw new Error(
          `Compiled runtime definition has an invalid logical path: ${definition.logicalPath}`,
        );
      }
      return [
        definition.logicalPath.slice(definitionPrefix.length),
        definition.definition,
      ] as const;
    }),
  );
  return {
    catalog: loadCatalogFromRoots(
      runtime.context.sheetDefinitionsRoot,
      runtime.context.customSheetDefinitionsRoot,
      customRecords,
    ),
    palettes: loadPalettesFromRoot(runtime.context.paletteDefinitionsRoot),
  };
}

export async function prepareRuntimeAssets(
  options: PrepareRuntimeAssetsOptions,
): Promise<RuntimeAssets> {
  const cwd = path.resolve(options.cwd);
  const localAssetsRoot = path.join(cwd, 'assets');
  const customAssetsRoot = path.join(cwd, 'assets_custom');

  if (!options.managedCacheOnly && hasCompleteLocalAssets(localAssetsRoot)) {
    const store = createDirectoryAssetStore(localAssetsRoot);
    return {
      context: createRuntimeContext({
        cwd,
        assetsRoot: localAssetsRoot,
        customAssetsRoot,
        spritesheetsBaseUrl: store.baseUrl,
      }),
      store,
      source: 'working-directory',
    };
  }

  const config = loadAssetReleaseConfig(
    options.configPath ?? bundledAssetReleasePath(),
  );
  const cacheRoot = path.resolve(
    resolveAssetCacheRoot({
      env: options.env ?? process.env,
      platform: options.platform ?? process.platform,
      homeDir: options.homeDir ?? homedir(),
    }),
  );
  try {
    const prepared = await (options.ensureCache ?? ensureAssetCache)({
      config,
      cacheRoot,
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    });
    const store = createZipAssetStore(prepared.layout);
    return {
      context: createRuntimeContext({
        cwd,
        assetsRoot: prepared.layout.releaseRoot,
        customAssetsRoot,
        spritesheetsBaseUrl: store.baseUrl,
      }),
      store,
      source: 'managed-cache',
      releaseTag: config.tag,
    };
  } catch (error) {
    throw contextualizeAssetCacheError(error, config.tag, cacheRoot);
  }
}

export function createOverlayRuntimeAssets(
  options: OverlayRuntimeAssetsOptions,
): RuntimeAssets {
  const overlayRoot = path.resolve(options.overlayRoot);
  const customSheetDefinitionsRoot = path.resolve(options.customSheetDefinitionsRoot);
  return {
    ...options.runtime,
    ...(options.catalogSnapshot === undefined
      ? {}
      : { catalogSnapshot: options.catalogSnapshot }),
    context: {
      ...options.runtime.context,
      customAssetsRoot: overlayRoot,
      customSheetDefinitionsRoot,
    },
    store: createOverlayAssetStore({
      base: options.runtime.store,
      overlayRoot,
      logicalPaths: options.logicalPaths,
      ...(options.fileSnapshot === undefined
        ? {}
        : { fileSnapshot: options.fileSnapshot }),
    }),
  };
}

export function findRuntimeAssetWorkspace(cwd: string): AssetWorkspace | undefined {
  const workspaceRoot = findWorkspaceRoot(cwd);
  return workspaceRoot === undefined
    ? undefined
    : findAssetWorkspace(workspaceRoot, '.');
}

export function loadRuntimeCatalog(
  runtime: RuntimeAssets,
): ReturnType<typeof loadCatalogFromRoots> {
  return runtime.catalogSnapshot?.catalog ?? loadCatalogFromRoots(
    runtime.context.sheetDefinitionsRoot,
    runtime.context.customSheetDefinitionsRoot,
  );
}

export function loadRuntimePalettes(
  runtime: RuntimeAssets,
): ReturnType<typeof loadPalettesFromRoot> {
  return runtime.catalogSnapshot?.palettes
    ?? loadPalettesFromRoot(runtime.context.paletteDefinitionsRoot);
}

export async function withWorkspaceRuntimeAssets<T>(options: {
  readonly runtime: RuntimeAssets;
  readonly cwd: string;
  readonly workspace?: AssetWorkspace;
  readonly action: (runtime: RuntimeAssets) => Promise<T>;
}): Promise<T> {
  const workspace = options.workspace ?? findRuntimeAssetWorkspace(options.cwd);
  if (workspace === undefined) return options.action(options.runtime);
  if (options.runtime.source !== 'managed-cache') {
    throw new AssetWorkspaceRuntimeError({
      code: 'asset_runtime_baseline_mismatch',
      message: 'Workspace asset-pack runtime activation requires the authenticated managed-cache baseline.',
      path: options.runtime.context.assetsRoot,
    });
  }

  const claimed = await withAssetPackTransactionClaim({
    workspace,
    action: async () => {
      const authenticated = await authenticateRuntimeGeneration({
        workspace,
        runtime: options.runtime,
      });
      if (!authenticated.ok) return authenticated;
      const runtime = createOverlayRuntimeAssets({
        runtime: options.runtime,
        customSheetDefinitionsRoot: path.join(workspace.outputRoot, 'sheet_definitions'),
        overlayRoot: workspace.outputRoot,
        logicalPaths: authenticated.registry.entries.flatMap((entry) =>
          entry.generatedPaths),
        fileSnapshot: authenticated.outputFiles,
        catalogSnapshot: capturedCatalogSnapshot(options.runtime, authenticated),
      });
      return {
        ok: true as const,
        value: await options.action(runtime),
      };
    },
  });
  if (!claimed.ok) throw runtimeFailure(claimed.diagnostics[0]);
  if (!claimed.value.ok) throw runtimeFailure(claimed.value.diagnostics[0]);
  return claimed.value.value;
}
