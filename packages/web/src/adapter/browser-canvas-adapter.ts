import type {
  CanvasAdapter,
  CanvasLike,
  ImageLike,
} from '@lpc-toolkit/core';

/**
 * Core hands us paths like `spritesheets/body/bodies/male/walk.png` (it
 * prepends `spritesheets/` itself — see compose.ts). We serve the copied
 * subset from Vite's `public/`, so resolve relative to the document base.
 * Pure + DOM-free so it is unit-testable.
 */
export function resolveSpriteUrl(path: string, baseHref: string): string {
  return new URL(path, baseHref).href;
}

export function createBrowserCanvasAdapter(): CanvasAdapter {
  return {
    createCanvas(width: number, height: number): CanvasLike {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      return c as unknown as CanvasLike;
    },
    async loadImage(path: string): Promise<ImageLike> {
      const url = resolveSpriteUrl(path, document.baseURI);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`loadImage ${url}: HTTP ${res.status}`);
      const blob = await res.blob();
      return (await createImageBitmap(blob)) as unknown as ImageLike;
    },
  };
}
