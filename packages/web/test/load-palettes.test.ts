import { describe, expect, it } from 'vitest';
import { normalizePaletteKey, recordsToPalettes } from '../src/catalog/load-palettes';

describe('recordsToPalettes', () => {
  it('builds palette metadata keyed by material and version', () => {
    const palettes = recordsToPalettes({
      'body/meta_body.json': {
        type: 'material',
        label: 'Skintone',
        default: 'ulpc',
        base: 'light',
      },
      'body/body_ulpc.json': {
        light: ['#aaa', '#bbb'],
        brown: ['#111', '#222'],
      },
    });
    expect(palettes.materials.body?.default).toBe('ulpc');
    expect(palettes.materials.body?.base).toBe('light');
    expect(palettes.materials.body?.palettes.ulpc?.brown).toEqual([
      '#111',
      '#222',
    ]);
  });
});

describe('normalizePaletteKey', () => {
  it('strips the vite glob prefix preceding upstream/palette_definitions/', () => {
    expect(
      normalizePaletteKey(
        '../../../../upstream/palette_definitions/body/body_ulpc.json',
      ),
    ).toBe('body/body_ulpc.json');
  });

  it('returns the path unchanged when the upstream prefix is absent', () => {
    expect(normalizePaletteKey('body/body_ulpc.json')).toBe(
      'body/body_ulpc.json',
    );
  });
});
