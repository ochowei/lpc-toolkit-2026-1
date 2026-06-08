import type {
  CanvasAdapter,
  CanvasLike,
  ImageLike,
} from '@lpc-toolkit/core';
import { loadFileFromZip } from './zip-loader';

export async function resolveSpriteUrl(
  path: string,
  baseHref: string,
): Promise<string> {
  return loadFileFromZip(path, baseHref);
}

// Chromium enforces a per-origin HTTP/1.1 limit of 6 simultaneous connections.
// In Vite dev (HTTP/1.1) a random-outfit render fires hundreds of `fetch()`
// calls; without a throttle the excess get `net::ERR_INSUFFICIENT_RESOURCES`.
// Production runs over HTTP/2 multiplexing where this limit is irrelevant.
const FETCH_CONCURRENCY = 6;

interface FetchSemaphore {
  acquire(): Promise<() => void>;
}

/** Small FIFO semaphore used to throttle image fetches in Vite dev. */
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

/** Browser implementation of core's environment-agnostic CanvasAdapter. */
export function createBrowserCanvasAdapter(): CanvasAdapter {
  return {
    createCanvas(width: number, height: number): CanvasLike {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      return c as unknown as CanvasLike;
    },
    async loadImage(path: string): Promise<ImageLike> {
      const url = await loadFileFromZip(path, document.baseURI);
      const release = await sharedFetchSemaphore.acquire();
      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Failed to fetch local blob URL: ${url} (HTTP ${res.status})`);
        }
        const blob = await res.blob();
        return (await createImageBitmap(blob)) as unknown as ImageLike;
      } finally {
        URL.revokeObjectURL(url);
        release();
      }
    },
  };
}
