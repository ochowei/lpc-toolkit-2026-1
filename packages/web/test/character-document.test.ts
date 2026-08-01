import {
  createCatalog,
  type FilePath,
  type ItemDefinition,
  type PaletteMetadata,
  type SelectionDocumentImportContext,
} from '@lpc-toolkit/core';
import { describe, expect, it, vi } from 'vitest';
import {
  importCharacterDocument,
  saveCharacterDocument,
} from '../src/lib/character-document';

const catalogRecords: Record<FilePath, ItemDefinition> = {
  'body/body.json': {
    name: 'Body Color',
    type_name: 'body',
    animations: ['walk'],
    credits: [],
    recolors: { material: 'body', palettes: ['ulpc'] },
    layer_1: { zPos: 0, male: 'body/' },
  },
};

const palettes: PaletteMetadata = {
  materials: {
    body: {
      default: 'lpcr',
      base: 'light',
      palettes: { ulpc: { light: ['#f6d6bd'] } },
    },
  },
  versions: {},
};

const context: SelectionDocumentImportContext = {
  catalog: createCatalog(catalogRecords).catalog,
  palettes,
};

describe('character documents', () => {
  it('downloads the canonical document with the shared CLI shape', async () => {
    const download = vi.fn<(blob: Blob, filename: string) => void>();
    saveCharacterDocument({
      bodyType: 'male',
      items: {
        body: {
          typeName: 'body', name: 'Body Color', recolor: 'ulpc.light',
        },
      },
    }, { download });

    expect(download).toHaveBeenCalledWith(expect.any(Blob), 'character.selection.json');
    const blob = download.mock.calls[0]![0];
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(await blob.text())).toEqual({
      schema: 'lpc-toolkit.selection.v2',
      bodyType: 'male',
      items: { body: { name: 'Body Color', recolor: 'ulpc.light' } },
    });
  });

  it('imports an upstream file through the shared core adapter', async () => {
    const file = {
      text: async () => JSON.stringify({
        version: 2,
        bodyType: 'male',
        selections: { body: { itemId: 'body' } },
      }),
    };

    const imported = await importCharacterDocument(file, context);

    expect(imported.source).toBe('upstream-v2');
    expect(imported.parsed.selections.items.body?.name).toBe('Body Color');
  });

  it('rejects malformed JSON without producing a candidate', async () => {
    await expect(importCharacterDocument({ text: async () => '{' }, context))
      .rejects.toBeInstanceOf(SyntaxError);
  });

  it('rejects canonical JSON when an item is absent from the compiled catalog', async () => {
    const file = {
      text: async () => JSON.stringify({
        schema: 'lpc-toolkit.selection.v1',
        bodyType: 'male',
        items: { body: { name: 'Removed by compiled pack catalog' } },
      }),
    };

    await expect(importCharacterDocument(file, context))
      .rejects.toThrow('Unknown canonical item');
  });
});
