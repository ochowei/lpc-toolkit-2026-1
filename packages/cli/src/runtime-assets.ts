import { statSync } from 'node:fs';
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
