import type {
  CanvasAdapter,
  CanvasLike,
  ImageLike,
} from '@lpc-toolkit/core';
import {
  resolveLocalSpriteUrl,
  resolveSpriteUrlCandidates,
  type AssetSource,
} from './asset-source';

/**
 * Core hands us paths like `spritesheets/body/bodies/male/walk.png` (it
 * prepends `spritesheets/` itself — see compose.ts). We serve the copied
 * subset from Vite's `public/`, so resolve relative to the document base.
 * Pure + DOM-free so it is unit-testable.
 */
export function resolveSpriteUrl(path: string, baseHref: string): string {
  return resolveLocalSpriteUrl(path, baseHref);
}

export function createBrowserCanvasAdapter(
  source: AssetSource = 'local',
): CanvasAdapter {
  return {
    createCanvas(width: number, height: number): CanvasLike {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      return c as unknown as CanvasLike;
    },
    async loadImage(path: string): Promise<ImageLike> {
      const urls = resolveSpriteUrlCandidates(path, document.baseURI, source);
      const errors: string[] = [];

      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (!res.ok) {
            errors.push(`${url}: HTTP ${res.status}`);
            continue;
          }
          const blob = await res.blob();
          return (await createImageBitmap(blob)) as unknown as ImageLike;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${url}: ${message}`);
        }
      }

      throw new Error(`loadImage failed for ${path}: ${errors.join('; ')}`);
    },
  };
}
