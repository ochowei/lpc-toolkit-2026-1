import type { AssetPackPngDecoder } from '@lpc-toolkit/asset-pack-format';
import { AssetPackBrowserCapabilityError } from './asset-pack-format-runtime';

interface BrowserAssetPackPngDecoderOptions {
  readonly createImageBitmap?: ((blob: Blob) => Promise<ImageBitmap>) | undefined;
  readonly createOffscreenCanvas?: ((width: number, height: number) => OffscreenCanvas) | undefined;
}

export function browserAssetPackPngDecoder(
  options: BrowserAssetPackPngDecoderOptions = {},
): AssetPackPngDecoder {
  return {
    decode: async (bytes) => {
      const createBitmap = options.createImageBitmap ?? globalThis.createImageBitmap;
      const createCanvas = options.createOffscreenCanvas ?? ((width, height) => {
        if (typeof globalThis.OffscreenCanvas !== 'function') {
          throw new AssetPackBrowserCapabilityError('OffscreenCanvas');
        }
        return new globalThis.OffscreenCanvas(width, height);
      });
      if (!createBitmap) throw new AssetPackBrowserCapabilityError('createImageBitmap');
      let bitmap: ImageBitmap | undefined;
      try {
        bitmap = await createBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = createCanvas(bitmap.width, bitmap.height);
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('OffscreenCanvas 2D context is unavailable.');
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
        return { width: bitmap.width, height: bitmap.height, pixels: new Uint8ClampedArray(pixels) };
      } finally {
        bitmap?.close();
      }
    },
  };
}

export const browserAssetPackPngDecoderDefault = browserAssetPackPngDecoder();
