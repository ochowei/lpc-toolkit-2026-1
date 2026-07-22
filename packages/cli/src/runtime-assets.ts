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
  readAssetPackRegistry,
  type AssetPackRegistryDocument,
  type AssetPackRegistryV1Read,
} from './asset-pack-registry.js';
import { readAssetPackTransactionSnapshot } from './asset-pack-transaction.js';
import {
  assertManagedAssetOutput,
  findAssetWorkspace,
  type AssetWorkspace,
} from './asset-workspace.js';
import { createRuntimeContext, type RuntimeContext } from './context.js';

export interface RuntimeAssets {
  readonly context: RuntimeContext;
  readonly store: AssetStore;
  readonly source: 'working-directory' | 'managed-cache';
  readonly releaseTag?: string;
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

type ActiveRegistry = AssetPackRegistryDocument | AssetPackRegistryV1Read;

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

function activeRegistry(workspace: AssetWorkspace): ActiveRegistry {
  const snapshot = readAssetPackTransactionSnapshot({
    workspace,
    read: () => {
      const marker = workspaceMarker({ workspace });
      const registry = readAssetPackRegistry({
        workspace,
        markerWorkspaceId: marker.workspaceId,
      });
      if (!registry.ok) return registry;
      const outputIssue = auditPublishedManagedOutput({
        workspace,
        markerBytes: marker.bytes,
        generatedDigests: registry.document.generatedDigests,
      });
      if (outputIssue !== undefined) {
        return { ok: false as const, diagnostics: [outputIssue] };
      }
      return { ok: true as const, value: registry.document };
    },
  });
  if (!snapshot.ok) {
    const diagnostic = snapshot.diagnostics[0];
    throw new AssetWorkspaceRuntimeError({
      code: diagnostic?.code ?? 'asset_digest_mismatch',
      message: diagnostic?.message ?? 'Managed asset-pack runtime activation failed.',
      ...(diagnostic?.path === undefined ? {} : { path: diagnostic.path }),
    });
  }
  return snapshot.value.snapshot;
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
    context: {
      ...options.runtime.context,
      customAssetsRoot: overlayRoot,
      customSheetDefinitionsRoot,
    },
    store: createOverlayAssetStore({
      base: options.runtime.store,
      overlayRoot,
      logicalPaths: options.logicalPaths,
    }),
  };
}

export function activateWorkspaceRuntimeAssets(options: {
  readonly runtime: RuntimeAssets;
  readonly cwd: string;
}): RuntimeAssets {
  const workspaceRoot = findWorkspaceRoot(options.cwd);
  if (workspaceRoot === undefined) return options.runtime;
  const workspace = findAssetWorkspace(workspaceRoot, '.');
  const registry = activeRegistry(workspace);
  return createOverlayRuntimeAssets({
    runtime: options.runtime,
    customSheetDefinitionsRoot: path.join(workspace.outputRoot, 'sheet_definitions'),
    overlayRoot: workspace.outputRoot,
    logicalPaths: registry.entries.flatMap((entry) => entry.generatedPaths),
  });
}
