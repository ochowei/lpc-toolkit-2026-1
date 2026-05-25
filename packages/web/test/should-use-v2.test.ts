import { describe, expect, it } from 'vitest';
import { shouldUseV2 } from '../src/lib/should-use-v2';

describe('shouldUseV2', () => {
  it('returns true only when ui=v2', () => {
    expect(shouldUseV2('?ui=v2')).toBe(true);
    expect(shouldUseV2('ui=v2')).toBe(true);
  });

  it('treats anything else as v1 (safe default)', () => {
    expect(shouldUseV2('')).toBe(false);
    expect(shouldUseV2('?ui=v1')).toBe(false);
    expect(shouldUseV2('?ui=anything')).toBe(false);
    expect(shouldUseV2('?other=v2')).toBe(false);
  });

  it('is case-sensitive on the value', () => {
    expect(shouldUseV2('?ui=V2')).toBe(false);
  });
});
