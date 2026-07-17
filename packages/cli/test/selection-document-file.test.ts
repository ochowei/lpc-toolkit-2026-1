import {
  createCatalog,
  type SelectionDocumentImportContext,
} from '@lpc-toolkit/core';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSelectionDocumentFile } from '../src/selection-document-file.js';

describe('selection document files', () => {
  const context: SelectionDocumentImportContext = {
    catalog: createCatalog({
      'body/body.json': {
        name: 'Body Color',
        type_name: 'body',
        animations: ['walk'],
        credits: [],
        layer_1: { zPos: 10, male: 'body/bodies/male/' },
      },
    }).catalog,
    palettes: { materials: {}, versions: {} },
  };

  it('reads upstream v2 as a canonical in-memory document without rewriting', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-selection-document-'));
    const selectionPath = path.join(cwd, 'upstream.json');
    const source = `${JSON.stringify({
      version: 2,
      bodyType: 'male',
      selections: { body: { itemId: 'body' } },
    }, null, 2)}\n`;
    writeFileSync(selectionPath, source);

    const loaded = readSelectionDocumentFile(cwd, 'upstream.json', context);

    expect(loaded.source).toBe('upstream-v2');
    expect(loaded.selection).toEqual({
      schema: 'lpc-toolkit.selection.v1',
      bodyType: 'male',
      items: { body: { name: 'Body Color' } },
    });
    expect(readFileSync(selectionPath, 'utf8')).toBe(source);
  });

  it('preserves core error codes and paths', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-selection-document-'));
    const selectionPath = path.join(cwd, 'upstream.json');
    writeFileSync(selectionPath, JSON.stringify({ version: 3 }));

    expect(() => readSelectionDocumentFile(cwd, 'upstream.json', context)).toThrowError(
      expect.objectContaining({ code: 'unsupported_upstream_version', path: 'version' }),
    );
  });
});
