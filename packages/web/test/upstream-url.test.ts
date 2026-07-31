import { describe, expect, it } from 'vitest';
import { createCatalog, createPaletteCatalog } from '@lpc-toolkit/core';
import { UPSTREAM_URL, buildUpstreamUrl } from '../src/lib/upstream-url';

describe('buildUpstreamUrl', () => {
  const catalog = createCatalog({}).catalog;
  const palettes = createPaletteCatalog({}).palettes;

  it('builds an upstream-compatible legacy hash from selections', () => {
    expect(
      buildUpstreamUrl(
        { bodyType: 'male', items: {} },
        catalog,
        palettes,
      ),
    ).toEqual({
      hash: 'sex=male',
      href: `${UPSTREAM_URL}#sex=male`,
      losses: [],
    });
  });

  it('never forwards canonical v2 fields', () => {
    const result = buildUpstreamUrl(
      {
        bodyType: 'male',
        items: {
          hair: {
            typeName: 'hair',
            name: 'Plain',
            variant: 'v01',
            recolor: 'black',
            channelRecolors: { tie: 'red' },
          },
        },
      },
      catalog,
      palettes,
    );

    expect(result.href).toBe(
      `${UPSTREAM_URL}#sex=male&hair=Plain_v01%7Cblack`,
    );
    expect(result.hash).toBe('sex=male&hair=Plain_v01%7Cblack');
    expect(result.hash).not.toContain('v=2');
    expect(result.hash).not.toContain('color.');
    expect(result.href).not.toContain('v=2');
    expect(result.href).not.toContain('color.');
  });

  it('points at the canonical upstream URL', () => {
    expect(UPSTREAM_URL).toBe(
      'https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/',
    );
  });
});
