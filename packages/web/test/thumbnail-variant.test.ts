import { describe, expect, it } from 'vitest';
import type { ItemDefinition } from '@lpc-toolkit/core';
import { effectiveThumbnailVariant } from '../src/hooks/use-item-thumbnail';

function def(variants?: readonly string[]): ItemDefinition {
  return {
    name: 'Stub',
    type_name: 'head',
    animations: [],
    credits: [],
    ...(variants ? { variants } : {}),
  } as ItemDefinition;
}

describe('effectiveThumbnailVariant', () => {
  it("returns the caller's explicit variant when provided", () => {
    expect(effectiveThumbnailVariant('blue', def(['red', 'green']))).toBe('blue');
  });

  it('falls back to variants[0] when caller passes nothing and def has variants', () => {
    expect(effectiveThumbnailVariant(undefined, def(['skeleton']))).toBe('skeleton');
  });

  it('returns undefined when neither side provides a variant', () => {
    expect(effectiveThumbnailVariant(undefined, def())).toBeUndefined();
  });

  it('returns undefined when def is missing entirely', () => {
    expect(effectiveThumbnailVariant(undefined, undefined)).toBeUndefined();
  });

  it("honors caller's empty-string choice over the def fallback", () => {
    // An explicit "" is still explicit — callers that mean "no variant"
    // should not be silently overridden.
    expect(effectiveThumbnailVariant('', def(['skeleton']))).toBe('');
  });
});
