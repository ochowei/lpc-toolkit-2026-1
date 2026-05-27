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

// Chromium enforces a per-origin HTTP/1.1 limit of 6 simultaneous connections.
// In Vite dev (HTTP/1.1) a random-outfit render fires hundreds of `fetch()`
// calls; without a throttle the excess get `net::ERR_INSUFFICIENT_RESOURCES`.
// Production runs over HTTP/2 multiplexing where this limit is irrelevant.
const FETCH_CONCURRENCY = 6;

interface FetchSemaphore {
  acquire(): Promise<() => void>;
}

export function createFetchSemaphore(limit: number): FetchSemaphore {
  let active = 0;
  const queue: Array<() => void> = [];
  return {
    async acquire(): Promise<() => void> {
      if (active >= limit) {
        await new Promise<void>((resolve) => queue.push(resolve));
        // Slot ownership transferred to us by the releaser; active stays the same.
      } else {
        active++;
      }
      return () => {
        const next = queue.shift();
        if (next) {
          next();
          // Slot ownership transferred to the next waiter; active stays the same.
        } else {
          active--;
        }
      };
    },
  };
}

const sharedFetchSemaphore = createFetchSemaphore(FETCH_CONCURRENCY);

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
        const release = await sharedFetchSemaphore.acquire();
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
        } finally {
          release();
        }
      }

      throw new Error(`loadImage failed for ${path}: ${errors.join('; ')}`);
    },
  };
}
