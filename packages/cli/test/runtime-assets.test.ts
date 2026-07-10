import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  AssetCacheError,
  type AssetCacheLayout,
  type EnsureAssetCacheOptions,
} from '../src/asset-cache.js';
import { prepareRuntimeAssets } from '../src/runtime-assets.js';

const releaseConfig = {
  tag: 'assets-v1',
  sourceRepository: 'owner/repo',
  sourceSha: 'a'.repeat(40),
  manifestUrl: 'https://example.test/manifest.json',
  manifestSha256: 'b'.repeat(64),
  tarballUrl: 'https://example.test/assets.tar.gz',
  tarballSha256: 'c'.repeat(64),
};

function createConfig(root: string): string {
  const configPath = path.join(root, 'asset-release.json');
  writeFileSync(configPath, JSON.stringify(releaseConfig));
  return configPath;
}

function createLayout(root: string): AssetCacheLayout {
  const releaseRoot = path.join(root, releaseConfig.tag);
  const layout = {
    releaseRoot,
    zipsRoot: path.join(releaseRoot, 'zips'),
    sheetDefinitionsRoot: path.join(releaseRoot, 'sheet_definitions'),
    paletteDefinitionsRoot: path.join(releaseRoot, 'palette_definitions'),
    creditsPath: path.join(releaseRoot, 'CREDITS.csv'),
    manifestPath: path.join(releaseRoot, 'asset-manifest.json'),
    spriteIndexPath: path.join(releaseRoot, 'sprite-index.json'),
    metadataIndexPath: path.join(releaseRoot, 'metadata-index.json'),
  };
  mkdirSync(layout.zipsRoot, { recursive: true });
  mkdirSync(layout.sheetDefinitionsRoot, { recursive: true });
  mkdirSync(layout.paletteDefinitionsRoot, { recursive: true });
  writeFileSync(layout.creditsPath, 'file,authors,licenses\n');
  writeFileSync(layout.spriteIndexPath, '[]\n');
  return layout;
}

function createCompleteLocalAssets(cwd: string): string {
  const assetsRoot = path.join(cwd, 'assets');
  mkdirSync(path.join(assetsRoot, 'sheet_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'palette_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'spritesheets'), { recursive: true });
  writeFileSync(path.join(assetsRoot, 'CREDITS.csv'), 'file,authors,licenses\n');
  return assetsRoot;
}

describe('prepareRuntimeAssets', () => {
  it('prefers a complete current-directory tree without preparing the cache', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-runtime-local-'));
    const assetsRoot = createCompleteLocalAssets(cwd);
    const ensureCache = vi.fn();

    const runtime = await prepareRuntimeAssets({ cwd, ensureCache });

    expect(runtime.source).toBe('working-directory');
    expect(runtime.store.kind).toBe('directory');
    expect(runtime.context.assetsRoot).toBe(assetsRoot);
    expect(ensureCache).not.toHaveBeenCalled();
  });

  it('falls back to the pinned managed cache outside the repository', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-runtime-managed-'));
    const cacheRoot = path.join(cwd, 'managed-cache');
    const layout = createLayout(cacheRoot);
    const configPath = createConfig(cwd);
    const ensureCache = vi.fn(async (_options: EnsureAssetCacheOptions) => ({
      status: 'cache-hit' as const,
      layout,
    }));

    const runtime = await prepareRuntimeAssets({
      cwd,
      configPath,
      env: { LPC_TOOLKIT_CACHE_DIR: cacheRoot },
      ensureCache,
    });

    expect(runtime.source).toBe('managed-cache');
    expect(runtime.releaseTag).toBe(releaseConfig.tag);
    expect(runtime.store.kind).toBe('zip');
    expect(ensureCache).toHaveBeenCalledTimes(1);
    expect(ensureCache).toHaveBeenCalledWith(
      expect.objectContaining({ cacheRoot: path.resolve(cacheRoot) }),
    );
  });

  it('does not select an incomplete current-directory asset tree', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-runtime-incomplete-'));
    const localAssetsRoot = path.join(cwd, 'assets');
    mkdirSync(path.join(localAssetsRoot, 'sheet_definitions'), { recursive: true });
    mkdirSync(path.join(localAssetsRoot, 'palette_definitions'), { recursive: true });
    mkdirSync(path.join(localAssetsRoot, 'spritesheets'), { recursive: true });
    const cacheRoot = path.join(cwd, 'cache');
    const layout = createLayout(cacheRoot);
    const ensureCache = vi.fn(async (_options: EnsureAssetCacheOptions) => ({
      status: 'cache-hit' as const,
      layout,
    }));

    const runtime = await prepareRuntimeAssets({
      cwd,
      configPath: createConfig(cwd),
      env: { LPC_TOOLKIT_CACHE_DIR: cacheRoot },
      ensureCache,
    });

    expect(runtime.source).toBe('managed-cache');
    expect(ensureCache).toHaveBeenCalledTimes(1);
  });

  it('keeps current-directory assets_custom as an overlay on a managed base', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-runtime-overlay-'));
    const customAssetsRoot = path.join(cwd, 'assets_custom');
    mkdirSync(path.join(customAssetsRoot, 'sheet_definitions'), { recursive: true });
    const cacheRoot = path.join(cwd, 'cache');
    const layout = createLayout(cacheRoot);
    const ensureCache = vi.fn(async (_options: EnsureAssetCacheOptions) => ({
      status: 'cache-hit' as const,
      layout,
    }));

    const runtime = await prepareRuntimeAssets({
      cwd,
      configPath: createConfig(cwd),
      env: { LPC_TOOLKIT_CACHE_DIR: cacheRoot },
      ensureCache,
    });

    expect(runtime.context.assetsRoot).toBe(layout.releaseRoot);
    expect(runtime.context.customAssetsRoot).toBe(customAssetsRoot);
    expect(runtime.context.customSheetDefinitionsRoot).toBe(
      path.join(customAssetsRoot, 'sheet_definitions'),
    );
  });

  it('honors LPC_TOOLKIT_CACHE_DIR', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-runtime-env-'));
    const configuredCacheRoot = path.join(cwd, 'configured-cache');
    const layout = createLayout(configuredCacheRoot);
    const ensureCache = vi.fn(async (_options: EnsureAssetCacheOptions) => ({
      status: 'cache-hit' as const,
      layout,
    }));

    await prepareRuntimeAssets({
      cwd,
      configPath: createConfig(cwd),
      env: { LPC_TOOLKIT_CACHE_DIR: configuredCacheRoot },
      ensureCache,
    });

    expect(ensureCache).toHaveBeenCalledWith(
      expect.objectContaining({ cacheRoot: path.resolve(configuredCacheRoot) }),
    );
  });

  it('propagates typed cache failures without creating a runtime', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-runtime-failure-'));
    const failure = new AssetCacheError(
      'asset_integrity_failed',
      'Checksum mismatch.',
      '/cache/assets-v1',
    );
    const ensureCache = vi.fn(async (_options: EnsureAssetCacheOptions) => {
      throw failure;
    });

    await expect(
      prepareRuntimeAssets({
        cwd,
        configPath: createConfig(cwd),
        env: { LPC_TOOLKIT_CACHE_DIR: path.join(cwd, 'cache') },
        ensureCache,
      }),
    ).rejects.toBe(failure);
    expect(ensureCache).toHaveBeenCalledTimes(1);
  });
});
