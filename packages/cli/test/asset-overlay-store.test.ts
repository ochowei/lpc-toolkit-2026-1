import {
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { AssetCacheLayout } from '../src/asset-cache.js';
import { createOverlayAssetStore } from '../src/asset-overlay-store.js';
import {
  createDirectoryAssetStore,
  createZipAssetStore,
} from '../src/asset-store.js';
import { createRuntimeContext } from '../src/context.js';
import {
  createOverlayRuntimeAssets,
  type RuntimeAssets,
} from '../src/runtime-assets.js';

const logicalSpritePath = 'spritesheets/packages/acme/hair/foreground/male/climb.png';

function createLayout(releaseRoot: string): AssetCacheLayout {
  return {
    releaseRoot,
    zipsRoot: path.join(releaseRoot, 'zips'),
    sheetDefinitionsRoot: path.join(releaseRoot, 'sheet_definitions'),
    paletteDefinitionsRoot: path.join(releaseRoot, 'palette_definitions'),
    creditsPath: path.join(releaseRoot, 'CREDITS.csv'),
    manifestPath: path.join(releaseRoot, 'asset-manifest.json'),
    spriteIndexPath: path.join(releaseRoot, 'sprite-index.json'),
    metadataIndexPath: path.join(releaseRoot, 'metadata-index.json'),
  };
}

async function createPng(fillStyle = '#ff00ff'): Promise<Buffer> {
  const canvas = createCanvas(64, 64);
  const context = canvas.getContext('2d');
  context.fillStyle = fillStyle;
  context.fillRect(0, 0, 64, 64);
  return canvas.encode('png');
}

async function createZipStore(): Promise<ReturnType<typeof createZipAssetStore>> {
  const layout = createLayout(mkdtempSync(path.join(os.tmpdir(), 'lpc-overlay-zip-')));
  mkdirSync(layout.zipsRoot, { recursive: true });
  const zip = new JSZip();
  zip.file('packages/acme/hair/foreground/male/climb.png', await createPng());
  writeFileSync(
    path.join(layout.zipsRoot, 'packages.zip'),
    await zip.generateAsync({ type: 'nodebuffer' }),
  );
  writeFileSync(layout.spriteIndexPath, JSON.stringify([logicalSpritePath]));
  return createZipAssetStore(layout);
}

function createDirectoryRuntime(): {
  readonly runtime: RuntimeAssets;
  readonly assetsRoot: string;
  readonly baseSpritePath: string;
} {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'lpc-overlay-runtime-'));
  const assetsRoot = path.join(cwd, 'assets');
  const baseSpritePath = path.join(assetsRoot, logicalSpritePath);
  mkdirSync(path.dirname(baseSpritePath), { recursive: true });
  writeFileSync(baseSpritePath, 'base');
  const store = createDirectoryAssetStore(assetsRoot);
  return {
    runtime: {
      context: createRuntimeContext({
        cwd,
        assetsRoot,
        customAssetsRoot: path.join(cwd, 'assets_custom'),
        spritesheetsBaseUrl: store.baseUrl,
      }),
      store,
      source: 'working-directory',
    },
    assetsRoot,
    baseSpritePath,
  };
}

describe('overlay asset store', () => {
  it('loads an authorized overlay file before the base directory store', async () => {
    const { runtime } = createDirectoryRuntime();
    const overlayRoot = mkdtempSync(path.join(os.tmpdir(), 'lpc-overlay-root-'));
    const overlaySpritePath = path.join(overlayRoot, logicalSpritePath);
    mkdirSync(path.dirname(overlaySpritePath), { recursive: true });
    writeFileSync(overlaySpritePath, 'overlay');

    const overlay = createOverlayAssetStore({
      base: runtime.store,
      overlayRoot,
      logicalPaths: [logicalSpritePath],
    });

    const sourcePath = `${runtime.store.baseUrl}/${logicalSpritePath}`;
    expect(overlay.kind).toBe('overlay');
    expect(overlay.baseUrl).toBe(runtime.store.baseUrl);
    expect(overlay.logicalPath(sourcePath)).toBe(logicalSpritePath);
    await expect(overlay.load(sourcePath)).resolves.toBe(overlaySpritePath);
  });

  it('ignores unauthorized overlay files and falls back to the base store', async () => {
    const { runtime, baseSpritePath } = createDirectoryRuntime();
    const overlayRoot = mkdtempSync(path.join(os.tmpdir(), 'lpc-overlay-root-'));
    const overlaySpritePath = path.join(overlayRoot, logicalSpritePath);
    mkdirSync(path.dirname(overlaySpritePath), { recursive: true });
    writeFileSync(overlaySpritePath, 'overlay');

    const overlay = createOverlayAssetStore({
      base: runtime.store,
      overlayRoot,
      logicalPaths: [],
    });

    await expect(
      overlay.load(`${runtime.store.baseUrl}/${logicalSpritePath}`),
    ).resolves.toBe(baseSpritePath);
  });

  it('falls back to the base store when an authorized overlay path is missing', async () => {
    const { runtime, baseSpritePath } = createDirectoryRuntime();
    const overlay = createOverlayAssetStore({
      base: runtime.store,
      overlayRoot: mkdtempSync(path.join(os.tmpdir(), 'lpc-overlay-root-')),
      logicalPaths: [logicalSpritePath],
    });

    await expect(
      overlay.load(`${runtime.store.baseUrl}/${logicalSpritePath}`),
    ).resolves.toBe(baseSpritePath);
  });

  it('does not allow unauthorized overlay-only files to shadow the base namespace', async () => {
    const { runtime } = createDirectoryRuntime();
    const overlayRoot = mkdtempSync(path.join(os.tmpdir(), 'lpc-overlay-root-'));
    const overlayOnlyLogicalPath = 'spritesheets/packages/acme/hair/foreground/male/extra.png';
    const overlayOnlyPath = path.join(overlayRoot, overlayOnlyLogicalPath);
    mkdirSync(path.dirname(overlayOnlyPath), { recursive: true });
    writeFileSync(overlayOnlyPath, 'overlay');

    const overlay = createOverlayAssetStore({
      base: runtime.store,
      overlayRoot,
      logicalPaths: [logicalSpritePath],
    });

    expect(overlay.has(overlayOnlyLogicalPath)).toBe(false);
    await expect(
      overlay.load(`${runtime.store.baseUrl}/${overlayOnlyLogicalPath}`),
    ).rejects.toMatchObject({ code: 'asset_image_missing' });
  });

  it('rejects authorized overlay symlinks that escape the overlay root', async () => {
    const { runtime } = createDirectoryRuntime();
    const overlayRoot = mkdtempSync(path.join(os.tmpdir(), 'lpc-overlay-root-'));
    const outsideRoot = mkdtempSync(path.join(os.tmpdir(), 'lpc-overlay-outside-'));
    const outsideSpritePath = path.join(outsideRoot, 'escape.png');
    writeFileSync(outsideSpritePath, 'escape');
    const overlaySpritePath = path.join(overlayRoot, logicalSpritePath);
    mkdirSync(path.dirname(overlaySpritePath), { recursive: true });
    symlinkSync(outsideSpritePath, overlaySpritePath, 'file');

    const overlay = createOverlayAssetStore({
      base: runtime.store,
      overlayRoot,
      logicalPaths: [logicalSpritePath],
    });

    await expect(
      overlay.load(`${runtime.store.baseUrl}/${logicalSpritePath}`),
    ).rejects.toThrow(/outside the asset root/u);
  });

  it('supports authorized overlays on top of a ZIP base store', async () => {
    const base = await createZipStore();
    const overlayRoot = mkdtempSync(path.join(os.tmpdir(), 'lpc-overlay-root-'));
    const overlaySpritePath = path.join(overlayRoot, logicalSpritePath);
    mkdirSync(path.dirname(overlaySpritePath), { recursive: true });
    writeFileSync(overlaySpritePath, await createPng('#00ff00'));
    const overlay = createOverlayAssetStore({
      base,
      overlayRoot,
      logicalPaths: [logicalSpritePath],
    });

    expect(overlay.logicalPath(`lpc-zip:/${logicalSpritePath}`)).toBe(logicalSpritePath);
    await expect(overlay.load(`lpc-zip:/${logicalSpritePath}`)).resolves.toBe(overlaySpritePath);
  });
});

describe('createOverlayRuntimeAssets', () => {
  it('wraps prepared runtime assets without mutating the original runtime', () => {
    const { runtime } = createDirectoryRuntime();
    const overlayRoot = mkdtempSync(path.join(os.tmpdir(), 'lpc-overlay-root-'));
    const customSheetDefinitionsRoot = path.join(overlayRoot, 'sheet_definitions');
    mkdirSync(customSheetDefinitionsRoot, { recursive: true });

    const wrapped = createOverlayRuntimeAssets({
      runtime,
      customSheetDefinitionsRoot,
      overlayRoot,
      logicalPaths: [logicalSpritePath],
    });

    expect(wrapped).not.toBe(runtime);
    expect(wrapped.store.kind).toBe('overlay');
    expect(wrapped.store.baseUrl).toBe(runtime.store.baseUrl);
    expect(wrapped.context.customAssetsRoot).toBe(path.resolve(overlayRoot));
    expect(wrapped.context.customSheetDefinitionsRoot).toBe(
      path.resolve(customSheetDefinitionsRoot),
    );
    expect(runtime.store.kind).toBe('directory');
    expect(runtime.context.customAssetsRoot).not.toBe(path.resolve(overlayRoot));
  });
});
