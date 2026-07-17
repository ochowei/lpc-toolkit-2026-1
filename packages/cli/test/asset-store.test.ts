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
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetCacheLayout } from '../src/asset-cache.js';
import {
  createDirectoryAssetStore,
  createZipAssetStore,
} from '../src/asset-store.js';
import { createNodeCanvasAdapter } from '../src/node-canvas-adapter.js';

const logicalSpritePath = 'spritesheets/body/bodies/male/walk.png';

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

async function createPng(): Promise<Buffer> {
  const canvas = createCanvas(64, 64);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ff00ff';
  context.fillRect(0, 0, 64, 64);
  return canvas.encode('png');
}

async function createZipFixture(): Promise<AssetCacheLayout> {
  const layout = createLayout(mkdtempSync(path.join(os.tmpdir(), 'lpc-zip-store-')));
  mkdirSync(layout.zipsRoot, { recursive: true });

  const zip = new JSZip();
  zip.file('bodies/male/walk.png', await createPng());
  writeFileSync(
    path.join(layout.zipsRoot, 'body.zip'),
    await zip.generateAsync({ type: 'nodebuffer' }),
  );
  writeFileSync(
    layout.spriteIndexPath,
    JSON.stringify([
      logicalSpritePath,
      'spritesheets/body/bodies/male/missing.png',
      'spritesheets/hair/hair/male/walk.png',
    ]),
  );
  return layout;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('directory asset store', () => {
  it('resolves logical paths only when their files exist inside the asset root', () => {
    const assetsRoot = mkdtempSync(path.join(os.tmpdir(), 'lpc-directory-store-'));
    const spritePath = path.join(assetsRoot, logicalSpritePath);
    mkdirSync(path.dirname(spritePath), { recursive: true });
    writeFileSync(spritePath, 'fixture');

    const store = createDirectoryAssetStore(assetsRoot);

    expect(store.kind).toBe('directory');
    expect(store.baseUrl).toBe(path.resolve(assetsRoot));
    expect(store.has(logicalSpritePath)).toBe(true);
    expect(store.has('spritesheets/body/bodies/male/missing.png')).toBe(false);
    expect(store.has('../outside.png')).toBe(false);
    expect(store.has('https://example.test/sprite.png')).toBe(false);
  });

  it('returns absolute core-composed source paths and rejects paths outside the root', async () => {
    const assetsRoot = mkdtempSync(path.join(os.tmpdir(), 'lpc-directory-store-'));
    const spritePath = path.join(assetsRoot, logicalSpritePath);
    mkdirSync(path.dirname(spritePath), { recursive: true });
    writeFileSync(spritePath, 'fixture');
    const store = createDirectoryAssetStore(assetsRoot);

    await expect(store.load(spritePath)).resolves.toBe(spritePath);
    await expect(store.load(path.join(assetsRoot, '..', 'outside.png'))).rejects.toThrow();
    await expect(store.load('lpc-zip:/spritesheets/body/walk.png')).rejects.toThrow();
  });

  it('preserves a directory read ENOENT through the canvas adapter', async () => {
    const assetsRoot = mkdtempSync(path.join(os.tmpdir(), 'lpc-directory-store-'));
    const missingPath = path.join(assetsRoot, logicalSpritePath);
    const store = createDirectoryAssetStore(assetsRoot);
    const adapter = createNodeCanvasAdapter({ assetStore: store });

    await expect(adapter.loadImage(missingPath)).rejects.toMatchObject({ systemCode: 'ENOENT' });
  });

  it('propagates non-ENOENT directory preflight failures', () => {
    const assetsRoot = mkdtempSync(path.join(os.tmpdir(), 'lpc-directory-store-'));
    const loopLogicalPath = 'spritesheets/body/loop.png';
    const loopPath = path.join(assetsRoot, loopLogicalPath);
    mkdirSync(path.dirname(loopPath), { recursive: true });
    symlinkSync('loop.png', loopPath, 'file');
    const store = createDirectoryAssetStore(assetsRoot);

    let failure: unknown;
    try {
      store.has(loopLogicalPath);
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ code: 'ELOOP' });
  });

  it.skipIf(process.platform !== 'win32')(
    'loads absolute Windows drive paths instead of treating the drive as a URI scheme',
    async () => {
      const assetsRoot = mkdtempSync(path.join(os.tmpdir(), 'lpc-directory-store-'));
      const spritePath = path.join(assetsRoot, logicalSpritePath);
      mkdirSync(path.dirname(spritePath), { recursive: true });
      writeFileSync(spritePath, 'fixture');
      const store = createDirectoryAssetStore(assetsRoot);

      expect(path.win32.isAbsolute(spritePath)).toBe(true);
      await expect(store.load(spritePath)).resolves.toBe(spritePath);
    },
  );

  it('rejects symlinked files that resolve outside the asset root', async () => {
    const assetsRoot = mkdtempSync(path.join(os.tmpdir(), 'lpc-directory-store-'));
    const outsideRoot = mkdtempSync(path.join(os.tmpdir(), 'lpc-outside-store-'));
    const outsideSpritePath = path.join(outsideRoot, 'outside.png');
    writeFileSync(outsideSpritePath, 'fixture');
    const linkedLogicalPath = 'spritesheets/body/linked.png';
    const linkedSpritePath = path.join(assetsRoot, linkedLogicalPath);
    mkdirSync(path.dirname(linkedSpritePath), { recursive: true });
    symlinkSync(outsideSpritePath, linkedSpritePath, 'file');
    const store = createDirectoryAssetStore(assetsRoot);

    expect(store.has(linkedLogicalPath)).toBe(false);
    await expect(store.load(linkedSpritePath)).rejects.toThrow();
  });

  it('rejects directories that occupy an image asset path', async () => {
    const assetsRoot = mkdtempSync(path.join(os.tmpdir(), 'lpc-directory-store-'));
    const directoryLogicalPath = 'spritesheets/body/not-an-image.png';
    const directoryPath = path.join(assetsRoot, directoryLogicalPath);
    mkdirSync(directoryPath, { recursive: true });
    const store = createDirectoryAssetStore(assetsRoot);

    expect(store.has(directoryLogicalPath)).toBe(false);
    await expect(store.load(directoryPath)).rejects.toThrow();
  });
});

describe('ZIP asset store', () => {
  it('checks indexed paths synchronously and caches one parsed category ZIP', async () => {
    const layout = await createZipFixture();
    const loadAsync = vi.spyOn(JSZip, 'loadAsync');

    const store = createZipAssetStore(layout);
    expect(store.has('spritesheets/body/bodies/male/walk.png')).toBe(true);
    const source = await store.load('lpc-zip:/spritesheets/body/bodies/male/walk.png');
    expect(Buffer.isBuffer(source)).toBe(true);
    const adapter = createNodeCanvasAdapter({ assetStore: store });
    const image = await adapter.loadImage('lpc-zip:/spritesheets/body/bodies/male/walk.png');
    expect({ width: image.width, height: image.height }).toEqual({ width: 64, height: 64 });
    expect(loadAsync).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid schemes, traversal, absent categories, and missing entries', async () => {
    const layout = await createZipFixture();
    const store = createZipAssetStore(layout);

    expect(store.has('../body/walk.png')).toBe(false);
    expect(store.has('https://example.test/walk.png')).toBe(false);
    expect(store.has('spritesheets/body/bodies/male/not-indexed.png')).toBe(false);
    await expect(store.load('https://example.test/walk.png')).rejects.toThrow();
    await expect(
      store.load('lpc-zip:/spritesheets/body/../body/bodies/male/walk.png'),
    ).rejects.toThrow();
    await expect(
      store.load('lpc-zip:/spritesheets/hair/hair/male/walk.png'),
    ).rejects.toThrow();
    await expect(
      store.load('lpc-zip:/spritesheets/body/bodies/male/missing.png'),
    ).rejects.toThrow();
  });

  it.each([
    'spritesheets/body/bodies/male/missing.png',
    'spritesheets/hair/hair/male/walk.png',
  ])('identifies an unreadable indexed image as %s', async (logicalPath) => {
    const layout = await createZipFixture();
    const store = createZipAssetStore(layout);

    await expect(store.load(`lpc-zip:/${logicalPath}`)).rejects.toMatchObject({
      name: 'AssetStoreError',
      code: 'asset_image_missing',
      path: logicalPath,
    });
  });
});
