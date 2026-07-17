import { describe, expect, it } from 'vitest';
import {
  createCatalog,
  importSelectionDocument,
  type FilePath,
  type ItemDefinition,
  type PaletteMetadata,
  type SelectionDocumentImportContext,
} from '../src/index.js';

const catalogRecords: Record<FilePath, ItemDefinition> = {
  'body/body.json': {
    name: 'Body Color',
    type_name: 'body',
    animations: ['walk'],
    credits: [],
    recolors: { material: 'body', palettes: ['ulpc'] },
    layer_1: { zPos: 0, male: 'body/' },
  },
  'torso/coat.json': {
    name: 'Coat',
    type_name: 'coat',
    animations: ['walk'],
    credits: [],
    variants: ['long'],
    recolors: {
      color_1: { material: 'cloth', palettes: ['ulpc'] },
      color_2: {
        material: 'metal',
        palettes: ['ulpc'],
        type_name: 'trim',
      },
    },
    layer_1: { zPos: 10, male: 'torso/coat/' },
  },
  'hair/hair.json': {
    name: 'Hair',
    type_name: 'hair',
    animations: ['walk'],
    credits: [],
    variants: ['short'],
    layer_1: { zPos: 20, female: 'hair/' },
  },
};

const palettes: PaletteMetadata = {
  materials: {
    body: {
      default: 'lpcr',
      base: 'light',
      palettes: {
        ulpc: {
          light: ['#f6d6bd'],
          dark: ['#6f4436'],
        },
      },
    },
    cloth: {
      default: 'lpcr',
      base: 'blue',
      palettes: {
        ulpc: {
          blue: ['#2255aa'],
          red: ['#aa2233'],
        },
      },
    },
    metal: {
      default: 'lpcr',
      base: 'iron',
      palettes: {
        ulpc: {
          iron: ['#777777'],
          gold: ['#d4af37'],
        },
      },
    },
  },
  versions: {},
};

const context: SelectionDocumentImportContext = {
  catalog: createCatalog(catalogRecords).catalog,
  palettes,
};

describe('importSelectionDocument', () => {
  it('imports upstream v2 and ignores editor-only metadata', () => {
    const result = importSelectionDocument({
      version: 2,
      bodyType: 'male',
      selections: {
        body: {
          itemId: 'body',
          name: 'Untrusted label',
          recolor: 'ulpc.light',
        },
      },
      selectedAnimation: 'walk',
      layers: [{ itemId: 'stale' }],
      credits: { stale: ['credit'] },
    }, context);

    expect(result.source).toBe('upstream-v2');
    expect(result.selection).toEqual({
      schema: 'lpc-toolkit.selection.v1',
      bodyType: 'male',
      items: { body: { name: 'Body Color', recolor: 'ulpc.light' } },
    });
    expect(JSON.stringify(result.selection)).not.toMatch(
      /layers|credits|selectedAnimation/,
    );
  });

  it('imports an upstream recolor sub-selection by its outer type key', () => {
    const result = importSelectionDocument({
      version: 2,
      bodyType: 'male',
      selections: {
        coat: { itemId: 'coat', recolor: 'ulpc.blue' },
        trim: { itemId: 'coat', subId: 1, recolor: 'ulpc.gold' },
      },
    }, context);

    expect(result.selection.items).toEqual({
      coat: { name: 'Coat', recolor: 'ulpc.blue' },
      trim: { name: 'Coat', recolor: 'ulpc.gold' },
    });
  });

  it('imports upstream v1 through its absolute URL hash', () => {
    const result = importSelectionDocument({
      version: 1,
      url: 'https://example.test/generator/#sex=male&body=Body_Color',
    }, context);
    expect(result.source).toBe('upstream-v1');
    expect(result.selection.items.body?.name).toBe('Body Color');
  });

  it('normalizes null and empty upstream optional fields to omitted fields', () => {
    const result = importSelectionDocument({
      version: 2,
      bodyType: 'male',
      selections: {
        body: { itemId: 'body', variant: null, recolor: '' },
      },
    }, context);

    expect(result.selection.items.body).toEqual({ name: 'Body Color' });
    expect(result.parsed.selections.items.body).toEqual({
      typeName: 'body',
      name: 'Body Color',
    });
  });

  it('normalizes and validates canonical input against the active catalog', () => {
    const result = importSelectionDocument({
      schema: 'lpc-toolkit.selection.v1',
      name: 'hero',
      bodyType: 'male',
      items: {
        coat: { name: 'Coat', variant: 'long', recolor: 'ulpc.blue' },
        trim: { name: 'Coat', recolor: 'ulpc.gold' },
      },
      credits: ['untrusted'],
    }, context);

    expect(result.source).toBe('canonical');
    expect(result.selection).toEqual({
      schema: 'lpc-toolkit.selection.v1',
      name: 'hero',
      bodyType: 'male',
      items: {
        coat: { name: 'Coat', variant: 'long', recolor: 'ulpc.blue' },
        trim: { name: 'Coat', recolor: 'ulpc.gold' },
      },
    });
  });

  it.each([
    [
      { schema: 'lpc-toolkit.selection.v1', version: 2 },
      'ambiguous_selection_format',
    ],
    [{ value: 1 }, 'unsupported_selection_format'],
    [{ version: 3 }, 'unsupported_upstream_version'],
    [
      {
        version: 2,
        bodyType: 'male',
        selections: { hair: { itemId: 'missing' } },
      },
      'unknown_upstream_item',
    ],
  ])('rejects invalid interchange input %#', (value, code) => {
    expect(() => importSelectionDocument(value, context)).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it.each([
    [
      {
        schema: 'another.selection.v1',
        bodyType: 'male',
        items: {},
      },
      'unsupported_selection_schema',
    ],
    [
      {
        schema: 'lpc-toolkit.selection.v1',
        bodyType: 'male',
        items: [],
      },
      'invalid_selection_json',
    ],
    [
      {
        version: 2,
        bodyType: 'male',
        selections: { coat: { itemId: 'coat', variant: 'missing' } },
      },
      'invalid_selection_variant',
    ],
    [
      {
        version: 2,
        bodyType: 'male',
        selections: { trim: { itemId: 'coat', recolor: 'ulpc.silver' } },
      },
      'invalid_selection_recolor',
    ],
    [
      {
        version: 2,
        bodyType: 'male',
        selections: { hair: { itemId: 'hair', variant: 'short' } },
      },
      'invalid_upstream_selection',
    ],
    [
      {
        version: 2,
        bodyType: 'male',
        selections: { body: { itemId: 'body', recolor: 1 } },
      },
      'invalid_upstream_selection',
    ],
  ])('rejects catalog-invalid selection input %#', (value, code) => {
    expect(() => importSelectionDocument(value, context)).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it.each([
    [{ version: 1, url: '/generator/#body=Body_Color' }, 'url'],
    [{ version: 1, url: 'ftp://example.test/#body=Body_Color' }, 'url'],
    [{ version: 1, url: 'https://example.test/generator/' }, 'url'],
    [
      {
        version: 1,
        url: 'https://example.test/generator/#body=Missing',
      },
      'url',
    ],
  ])('rejects invalid or unresolved upstream v1 URL %#', (value, path) => {
    expect(() => importSelectionDocument(value, context)).toThrowError(
      expect.objectContaining({ code: 'invalid_upstream_selection', path }),
    );
  });
});
