/** Verifies media-query reading without depending on a real browser viewport. */
import { describe, expect, it, vi } from 'vitest';
import { readMediaQuery } from '../src/hooks/use-media-query';

describe('readMediaQuery', () => {
  it('returns false when matchMedia is unavailable', () => {
    expect(readMediaQuery('(min-width: 768px)', undefined)).toBe(false);
  });

  it('reads the current media query match', () => {
    const matchMedia = vi.fn<(query: string) => MediaQueryList>((query) => ({
      matches: query === '(min-width: 768px)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(readMediaQuery('(min-width: 768px)', matchMedia)).toBe(true);
    expect(readMediaQuery('(min-width: 1024px)', matchMedia)).toBe(false);
  });
});
