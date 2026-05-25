import { describe, expect, it } from 'vitest';
import { shouldUseV1 } from '../src/lib/should-use-v1';

describe('shouldUseV1', () => {
  it('returns true only when ui=v1', () => {
    expect(shouldUseV1('?ui=v1')).toBe(true);
    expect(shouldUseV1('ui=v1')).toBe(true);
  });

  it('treats anything else as v2 (new default)', () => {
    expect(shouldUseV1('')).toBe(false);
    expect(shouldUseV1('?ui=v2')).toBe(false);
    expect(shouldUseV1('?ui=anything')).toBe(false);
    expect(shouldUseV1('?other=v1')).toBe(false);
  });

  it('is case-sensitive on the value', () => {
    expect(shouldUseV1('?ui=V1')).toBe(false);
  });
});
