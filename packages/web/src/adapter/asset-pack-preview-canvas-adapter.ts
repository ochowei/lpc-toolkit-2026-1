import type {
  CanvasAdapter,
  ImageLike,
} from '@lpc-toolkit/core';
import type { AssetPackPreviewPayload } from '../lib/asset-pack-worker-protocol';

export interface AssetPackPreviewCanvasAdapterOptions {
  readonly payload: AssetPackPreviewPayload;
  readonly fallback: CanvasAdapter;
  readonly isOfficialPath: (path: string) => boolean;
}

export interface AssetPackPreviewCanvasAdapter extends CanvasAdapter {
  /** Close every decoded ImageBitmap owned by the current composition. */
  readonly dispose: () => void;
}

function closeImage(image: ImageLike): void {
  if ('close' in image && typeof image.close === 'function') {
    image.close();
  }
}

/**
 * Build a browser adapter for one Worker preview payload. Pack bytes are
 * addressed by their compiled destination only; source paths never become
 * aliases for destinations and are never sent to the official fallback.
 */
export function createAssetPackPreviewCanvasAdapter(
  options: AssetPackPreviewCanvasAdapterOptions,
): AssetPackPreviewCanvasAdapter {
  const compiledDestinations = new Set(
    options.payload.compilePlan.sprites.map((sprite) => sprite.destinationPath),
  );
  const bytesByDestination = new Map<string, Uint8Array>();
  for (const source of options.payload.sources) {
    if (!compiledDestinations.has(source.destinationPath)) continue;
    if (bytesByDestination.has(source.destinationPath)) {
      throw new Error(`Duplicate preview bytes for destination ${source.destinationPath}.`);
    }
    bytesByDestination.set(source.destinationPath, source.bytes);
  }

  const ownedImages: ImageLike[] = [];
  let disposed = false;

  return {
    createCanvas: (width, height) => options.fallback.createCanvas(width, height),
    async loadImage(path: string): Promise<ImageLike> {
      if (disposed) throw new Error('Preview canvas adapter has been disposed.');
      const bytes = bytesByDestination.get(path);
      if (bytes) {
        const blob = new Blob([bytes], { type: 'image/png' });
        const image = (await createImageBitmap(blob)) as unknown as ImageLike;
        if (disposed) {
          closeImage(image);
          throw new Error('Preview canvas adapter has been disposed.');
        }
        ownedImages.push(image);
        return image;
      }
      if (!options.isOfficialPath(path)) {
        throw new Error(`Preview image path is not authorized: ${path}`);
      }
      const image = await options.fallback.loadImage(path);
      if (disposed) {
        closeImage(image);
        throw new Error('Preview canvas adapter has been disposed.');
      }
      ownedImages.push(image);
      return image;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const image of ownedImages) closeImage(image);
      ownedImages.length = 0;
    },
  };
}
