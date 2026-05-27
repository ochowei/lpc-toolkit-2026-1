import { describe, expect, it } from 'vitest';
import { UPSTREAM_URL, buildUpstreamUrl } from '../src/lib/upstream-url';

describe('buildUpstreamUrl', () => {
  it('returns the bare upstream URL when hash is empty', () => {
    expect(buildUpstreamUrl('')).toBe(UPSTREAM_URL);
  });

  it('appends #<hash> when hash is non-empty', () => {
    expect(buildUpstreamUrl('sex=male')).toBe(`${UPSTREAM_URL}#sex=male`);
  });

  it('does not re-encode an already-encoded hash', () => {
    // serializeHash already percent-encodes values; verify pass-through.
    const hash = 'sex=male&hair=Plain_v01%7Cblack';
    expect(buildUpstreamUrl(hash)).toBe(`${UPSTREAM_URL}#${hash}`);
  });

  it('points at the canonical upstream URL', () => {
    expect(UPSTREAM_URL).toBe(
      'https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/',
    );
  });
});
