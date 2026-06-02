import type { BodyType, TypeName } from '@lpc-toolkit/core';

/** Maximum number of thumbnail canvases kept in the in-memory LRU cache. */
export const CACHE_MAX = 200;

/** Values that uniquely affect the pixels of a rendered thumbnail. */
export interface CacheKeyArgs {
  readonly bodyType: BodyType;
  readonly typeName: TypeName;
  readonly name: string;
  readonly size: number;
  readonly variant?: string;
  readonly recolor?: string;
}

/** Stable delimiter-based cache key for thumbnail canvases. */
export function makeCacheKey(args: CacheKeyArgs): string {
  return [
    args.bodyType,
    args.typeName,
    args.name,
    args.variant ?? '_',
    args.recolor ?? '_',
    args.size,
  ].join('|');
}

// JS Map preserves insertion order. To implement LRU we delete & re-insert
// on access so the touched key becomes "most recent" (last). On overflow
// we drop entries from the front (`keys().next().value`), which is the
// oldest insertion / least-recently-used entry.
const cache = new Map<string, HTMLCanvasElement>();

/** Read a cached thumbnail and refresh its LRU position. */
export function cacheGet(key: string): HTMLCanvasElement | undefined {
  const v = cache.get(key);
  if (v === undefined) return undefined;
  cache.delete(key);
  cache.set(key, v);
  return v;
}

/** Store a rendered thumbnail canvas and evict oldest entries over CACHE_MAX. */
export function cacheSet(key: string, canvas: HTMLCanvasElement): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, canvas);
  while (cache.size > CACHE_MAX) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

/** Clear thumbnail cache state between tests or hard catalog resets. */
export function cacheClear(): void {
  cache.clear();
}
