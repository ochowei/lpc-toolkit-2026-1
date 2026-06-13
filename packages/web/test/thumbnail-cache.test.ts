import { beforeEach, describe, expect, it } from 'vitest';
import {
  CACHE_MAX,
  cacheClear,
  cacheGet,
  cacheSet,
  makeCacheKey,
} from '../src/hooks/thumbnail-cache';
import { THUMBNAIL_FRAMING_POLICY_VERSION } from '../src/generated/thumbnail-framing-policy';

function fakeCanvas(label: string): HTMLCanvasElement {
  // Test-only stand-in; the cache treats the value opaquely.
  return { _label: label } as unknown as HTMLCanvasElement;
}

beforeEach(() => cacheClear());

describe('makeCacheKey', () => {
  it('produces stable identical keys for identical inputs', () => {
    const a = makeCacheKey({ bodyType: 'male', typeName: 'hair', name: 'Curly', size: 24 });
    const b = makeCacheKey({ bodyType: 'male', typeName: 'hair', name: 'Curly', size: 24 });
    expect(a).toBe(b);
  });

  it('differs when any input differs', () => {
    const base = { bodyType: 'male' as const, typeName: 'hair', name: 'Curly', size: 24 };
    expect(makeCacheKey({ ...base, name: 'Spiky' })).not.toBe(makeCacheKey(base));
    expect(makeCacheKey({ ...base, size: 28 })).not.toBe(makeCacheKey(base));
    expect(makeCacheKey({ ...base, variant: 'red' })).not.toBe(makeCacheKey(base));
    expect(makeCacheKey({ ...base, recolor: 'pal_a' })).not.toBe(makeCacheKey(base));
    expect(makeCacheKey({ ...base, bodyType: 'female' })).not.toBe(makeCacheKey(base));
  });

  it('includes the framing policy version', () => {
    const key = makeCacheKey({
      bodyType: 'male',
      typeName: 'ring',
      name: 'Stud Ring',
      size: 24,
    });
    expect(key).toContain(THUMBNAIL_FRAMING_POLICY_VERSION);
  });
});

describe('LRU cache', () => {
  it('returns undefined on miss', () => {
    expect(cacheGet('missing')).toBeUndefined();
  });

  it('returns the cached canvas on hit', () => {
    const c = fakeCanvas('a');
    cacheSet('k', c);
    expect(cacheGet('k')).toBe(c);
  });

  it('evicts the oldest entry when capacity is exceeded', () => {
    for (let i = 0; i < CACHE_MAX + 5; i++) {
      cacheSet(`k${i}`, fakeCanvas(String(i)));
    }
    // First 5 keys should be evicted
    expect(cacheGet('k0')).toBeUndefined();
    expect(cacheGet('k4')).toBeUndefined();
    expect(cacheGet('k5')).not.toBeUndefined();
    expect(cacheGet(`k${CACHE_MAX + 4}`)).not.toBeUndefined();
  });

  it('promotes accessed keys to most-recent (LRU recency)', () => {
    for (let i = 0; i < CACHE_MAX; i++) {
      cacheSet(`k${i}`, fakeCanvas(String(i)));
    }
    // Touch k0 → becomes most recent
    cacheGet('k0');
    // Insert one more → should evict k1 (now oldest), not k0
    cacheSet('new', fakeCanvas('new'));
    expect(cacheGet('k0')).not.toBeUndefined();
    expect(cacheGet('k1')).toBeUndefined();
  });
});
