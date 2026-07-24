import { describe, expect, it, vi } from 'vitest';
import type { AssetPackPreviewPayload } from '../src/lib/asset-pack-worker-protocol';
import { createAssetPackPreviewCanvasAdapter } from '../src/adapter/asset-pack-preview-canvas-adapter';

function payload(): AssetPackPreviewPayload {
  return {
    revision: 4,
    packId: 'acme.demo',
    compilePlan: {
      definitions: [],
      sprites: [{
        packId: 'acme.demo',
        assetId: 'acme.demo--hair',
        sourcePath: 'sprites/hair/walk.png',
        destinationPath: 'spritesheets/packages/acme.demo/hair/walk.png',
        animation: 'walk',
        consumers: [],
      }],
      credits: [],
      ownership: [],
      diagnostics: [],
    },
    sources: [{
      sourcePath: 'sprites/hair/walk.png',
      destinationPath: 'spritesheets/packages/acme.demo/hair/walk.png',
      bytes: new Uint8Array([1, 2, 3, 4]),
    }],
  };
}

describe('asset-pack preview canvas adapter', () => {
  it('decodes exact compiled destination bytes and falls back only for official paths', async () => {
    const fallback = {
      createCanvas: vi.fn(() => ({}) as never),
      loadImage: vi.fn(async (path: string) => ({ path }) as never),
    };
    const packBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const createImageBitmapMock = vi.fn(async (blob: Blob) => {
      expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
      return packBitmap;
    });
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);

    try {
      const adapter = createAssetPackPreviewCanvasAdapter({
        payload: payload(),
        fallback,
        isOfficialPath: (path) => path === 'spritesheets/body/male/walk.png',
      });

      await expect(adapter.loadImage('spritesheets/packages/acme.demo/hair/walk.png'))
        .resolves.toBe(packBitmap);
      await expect(adapter.loadImage('spritesheets/body/male/walk.png'))
        .resolves.toEqual({ path: 'spritesheets/body/male/walk.png' });
      await expect(adapter.loadImage('sprites/hair/walk.png'))
        .rejects.toThrow('not authorized');
      expect(packBitmap.close).not.toHaveBeenCalled();
      adapter.dispose();
      expect(packBitmap.close).toHaveBeenCalledTimes(1);
      expect(fallback.loadImage).toHaveBeenCalledTimes(1);
      expect(createImageBitmapMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('closes official fallback ImageBitmaps when the composition-owned adapter is disposed', async () => {
    const officialBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const fallback = {
      createCanvas: vi.fn(() => ({}) as never),
      loadImage: vi.fn(async () => officialBitmap),
    };
    const adapter = createAssetPackPreviewCanvasAdapter({
      payload: payload(),
      fallback,
      isOfficialPath: (path) => path === 'spritesheets/body/male/walk.png',
    });

    await expect(adapter.loadImage('spritesheets/body/male/walk.png'))
      .resolves.toBe(officialBitmap);
    expect(officialBitmap.close).not.toHaveBeenCalled();
    adapter.dispose();
    expect(officialBitmap.close).toHaveBeenCalledTimes(1);
  });

  it('ignores payload source paths that are not compile-plan destinations', async () => {
    const fallback = {
      createCanvas: vi.fn(() => ({}) as never),
      loadImage: vi.fn(async () => ({}) as never),
    };
    const adapter = createAssetPackPreviewCanvasAdapter({
      payload: {
        ...payload(),
        sources: [{
          sourcePath: 'sprites/hair/walk.png',
          destinationPath: 'spritesheets/unowned/shadow.png',
          bytes: new Uint8Array([9]),
        }],
      },
      fallback,
      isOfficialPath: () => false,
    });

    await expect(adapter.loadImage('spritesheets/unowned/shadow.png'))
      .rejects.toThrow('not authorized');
    expect(fallback.loadImage).not.toHaveBeenCalled();
  });
});
