import { describe, expect, it, vi } from 'vitest';
import { browserAssetPackPngDecoder } from '../src/adapter/asset-pack-png-decoder';

describe('browser asset-pack PNG decoder', () => {
  it('decodes pixels through createImageBitmap and OffscreenCanvas and closes the bitmap', async () => {
    const close = vi.fn();
    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 128]) })),
    };
    const canvas = { width: 0, height: 0, getContext: () => context };
    const decoder = browserAssetPackPngDecoder({
      createImageBitmap: async () => ({ width: 2, height: 1, close }),
      createOffscreenCanvas: () => canvas as unknown as OffscreenCanvas,
    });
    const decoded = await decoder.decode(Uint8Array.from([9, 8]));
    expect(decoded).toEqual({ width: 2, height: 1, pixels: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 128]) });
    expect(canvas.width).toBe(2);
    expect(canvas.height).toBe(1);
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('reports deterministic capability diagnostics', async () => {
    await expect(browserAssetPackPngDecoder({ createImageBitmap: undefined, createOffscreenCanvas: undefined }).decode(new Uint8Array())).rejects.toMatchObject({
      code: 'asset_browser_capability_missing',
    });
  });
});
