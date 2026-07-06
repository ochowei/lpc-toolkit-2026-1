import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadCatalogFromRoots,
  loadJsonRecords,
  loadPalettesFromRoot,
} from '../src/loaders.js';

describe('loadJsonRecords', () => {
  it('loads nested json records with normalized keys', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'lpc-loader-'));
    const dir = path.join(root, 'sheet_definitions', 'hair', 'short');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, 'hair_plain.json'),
      JSON.stringify({ name: 'Plain', type_name: 'hair' }),
    );

    const result = loadJsonRecords(path.join(root, 'sheet_definitions'));

    expect(result.warnings).toEqual([]);
    expect(result.records).toEqual({
      'hair/short/hair_plain.json': { name: 'Plain', type_name: 'hair' },
    });
  });

  it('reports invalid json as warnings', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'lpc-loader-'));
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, 'broken.json'), '{');

    const result = loadJsonRecords(root);

    expect(result.records).toEqual({});
    expect(result.warnings[0]?.code).toBe('invalid_json');
  });
});

describe('loadCatalogFromRoots', () => {
  it('reports malformed valid json records as warnings', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'lpc-loader-'));
    const customRoot = path.join(root, 'custom');
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, 'null.json'), 'null');
    writeFileSync(path.join(root, 'array.json'), '[]');

    const result = loadCatalogFromRoots(root, customRoot);

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'catalog_warning',
          path: 'null.json',
        }),
        expect.objectContaining({
          code: 'catalog_warning',
          path: 'array.json',
        }),
      ]),
    );
  });
});

describe('loadPalettesFromRoot', () => {
  it('reports malformed valid json records as warnings', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'lpc-loader-'));
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, 'null.json'), 'null');
    writeFileSync(path.join(root, 'array.json'), '[]');

    const result = loadPalettesFromRoot(root);

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'palette_warning',
          path: 'null.json',
        }),
        expect.objectContaining({
          code: 'palette_warning',
          path: 'array.json',
        }),
      ]),
    );
  });
});
