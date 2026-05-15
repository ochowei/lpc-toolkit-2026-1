import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createPaletteCatalog } from '../src/palettes.js';
import type { FilePath } from '../src/types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const paletteRoot = path.join(here, '../../../upstream/palette_definitions');

/** Recursively load every palette JSON, keyed by repo-relative path. */
function loadRealRecords(): Record<FilePath, unknown> {
  const out: Record<FilePath, unknown> = {};
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(abs, relPath);
      } else if (entry.name.endsWith('.json')) {
        out[`palette_definitions/${relPath}`] = JSON.parse(
          readFileSync(abs, 'utf8'),
        );
      }
    }
  };
  walk(paletteRoot, '');
  return out;
}

describe('createPaletteCatalog', () => {
  describe('with real upstream palette_definitions', () => {
    const { palettes, warnings } = createPaletteCatalog(loadRealRecords());

    it('ingests cleanly with no warnings', () => {
      expect(warnings).toEqual([]);
    });

    it('indexes all material groups and versions', () => {
      expect(Object.keys(palettes.materials).sort()).toEqual([
        'all',
        'body',
        'cloth',
        'eye',
        'hair',
        'metal',
      ]);
      expect(Object.keys(palettes.versions).sort()).toEqual(['lpcr', 'ulpc']);
    });

    it('reads material meta (default version + base recolor)', () => {
      const body = palettes.materials.body;
      expect(body?.type).toBe('material');
      expect(body?.label).toBe('Skintone');
      expect(body?.default).toBe('ulpc');
      expect(body?.base).toBe('light');
    });

    it('reads version meta', () => {
      const ulpc = palettes.versions.ulpc;
      expect(ulpc?.type).toBe('version');
      expect(ulpc?.label).toBe('Universal LPC');
      expect(typeof ulpc?.desc).toBe('string');
    });

    it('maps material → version → recolor → color ramp', () => {
      const bodyUlpc = palettes.materials.body?.palettes.ulpc;
      expect(bodyUlpc?.light).toEqual([
        '#271920',
        '#99423c',
        '#cc8665',
        '#E4A47C',
        '#F9D5BA',
        '#FAECE7',
      ]);
      // lpcr is a separate version on the same material.
      expect(palettes.materials.body?.palettes.lpcr?.ivory).toHaveLength(6);
      expect(palettes.materials.metal?.palettes.lpcr?.brass).toBeDefined();
    });
  });

  describe('synthetic', () => {
    it('merges order-independently (data file before its meta_)', () => {
      // Data file first, material meta afterwards: palettes must survive
      // and the meta fields must be applied (mirrors upstream merge).
      const { palettes, warnings } = createPaletteCatalog({
        'p/body_ulpc.json': { light: ['#000000'], tan: ['#ffffff'] },
        'p/meta_body.json': {
          type: 'material',
          label: 'Skintone',
          default: 'ulpc',
          base: 'light',
        },
        'meta_ulpc.json': { type: 'version', label: 'Universal LPC' },
      });

      expect(warnings).toEqual([]);
      const body = palettes.materials.body;
      expect(body?.default).toBe('ulpc');
      expect(body?.base).toBe('light');
      expect(body?.label).toBe('Skintone');
      expect(body?.palettes.ulpc?.light).toEqual(['#000000']);
      expect(body?.palettes.ulpc?.tan).toEqual(['#ffffff']);
      expect(palettes.versions.ulpc?.type).toBe('version');
    });

    it('derives material/version from the basename, not the directory', () => {
      const { palettes } = createPaletteCatalog({
        'any/where/deep/metal_lpcr.json': { iron: ['#888888'] },
      });
      expect(palettes.materials.metal?.palettes.lpcr?.iron).toEqual([
        '#888888',
      ]);
    });

    it('warns and skips a non-object record but keeps the rest', () => {
      const { palettes, warnings } = createPaletteCatalog({
        'p/broken_ulpc.json': 'not json',
        'p/cloth_ulpc.json': { red: ['#ff0000'] },
      });
      expect(palettes.materials.cloth?.palettes.ulpc?.red).toEqual([
        '#ff0000',
      ]);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.path).toBe('p/broken_ulpc.json');
    });

    it('drops a malformed recolor entry (non-array) with a warning', () => {
      const { palettes, warnings } = createPaletteCatalog({
        'eye_ulpc.json': { blue: ['#0000ff'], bad: 'nope', worse: [1, 2] },
      });
      const eye = palettes.materials.eye?.palettes.ulpc;
      expect(eye?.blue).toEqual(['#0000ff']);
      expect(eye?.bad).toBeUndefined();
      expect(eye?.worse).toBeUndefined();
      expect(warnings.map((w) => w.message).sort()).toEqual([
        'recolor "bad" is not an array of color strings; skipped',
        'recolor "worse" is not an array of color strings; skipped',
      ]);
    });

    it('warns when a data filename has no version token', () => {
      const { palettes, warnings } = createPaletteCatalog({
        'bodyonly.json': { light: ['#000'] },
      });
      expect(Object.keys(palettes.materials)).toEqual([]);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.message).toMatch(/could not derive material\/version/);
    });

    it('returns empty metadata for empty input (no throw)', () => {
      const { palettes, warnings } = createPaletteCatalog({});
      expect(palettes).toEqual({ materials: {}, versions: {} });
      expect(warnings).toEqual([]);
    });
  });
});
