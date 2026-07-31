import { describe, expect, it } from 'vitest';
import {
  createCatalog,
  importSelectionDocument,
  parseHash,
  parseSelectionJson,
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
    match_body_color: true,
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
      schema: 'lpc-toolkit.selection.v2',
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
      coat: {
        name: 'Coat',
        recolor: 'ulpc.blue',
        channelRecolors: { trim: 'ulpc.gold' },
      },
    });
  });

  it('round-trips imported multi-recolor selections through canonical v2', () => {
    const imported = importSelectionDocument({
      version: 2,
      bodyType: 'male',
      selections: {
        coat: { itemId: 'coat', recolor: 'ulpc.blue' },
        trim: { itemId: 'coat', subId: 1, recolor: 'ulpc.gold' },
      },
    }, context);
    expect(parseSelectionJson(imported.selection).selections).toEqual(
      imported.parsed.selections,
    );
  });

  it.each([
    ['invalid sub-recolor', 'ulpc.silver'],
    ['primary variant on a sub-selection', 'long'],
  ])('rejects %s while decoding a hash', (_label, value) => {
    const decoded = parseHash(
      `sex=male&trim=Coat_${value}`,
      context.catalog,
      context.palettes,
    );

    expect(decoded.selections.items).toEqual({});
    expect(decoded.warnings).toEqual([
      { key: 'trim', value: `Coat_${value}`, reason: 'unknown_item' },
    ]);
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
      schema: 'lpc-toolkit.selection.v2',
      name: 'hero',
      bodyType: 'male',
      items: {
        coat: {
          name: 'Coat',
          variant: 'long',
          recolor: 'ulpc.blue',
          channelRecolors: { trim: 'ulpc.gold' },
        },
      },
    });
  });

  it('validates canonical v2 channel IDs and colors at exact paths', () => {
    expect(() => importSelectionDocument({
      schema: 'lpc-toolkit.selection.v2',
      bodyType: 'male',
      items: {
        coat: {
          name: 'Coat',
          channelRecolors: { missing: 'ulpc.gold' },
        },
      },
    }, context)).toThrowError(expect.objectContaining({
      code: 'invalid_selection_channel',
      path: 'items.coat.channelRecolors.missing',
    }));

    expect(() => importSelectionDocument({
      schema: 'lpc-toolkit.selection.v2',
      bodyType: 'male',
      items: {
        coat: {
          name: 'Coat',
          channelRecolors: { trim: 'ulpc.silver' },
        },
      },
    }, context)).toThrowError(expect.objectContaining({
      code: 'invalid_selection_channel_recolor',
      path: 'items.coat.channelRecolors.trim',
    }));
  });

  it('rejects linked channel values and legacy secondary item paths in canonical v2', () => {
    const linkedContext: SelectionDocumentImportContext = {
      catalog: createCatalog({
        ...catalogRecords,
        'torso/linked-coat.json': {
          ...catalogRecords['torso/coat.json']!,
          name: 'Linked Coat',
          recolors: {
            color_1: { material: 'cloth', palettes: ['ulpc'] },
            color_2: {
              material: 'metal',
              palettes: ['ulpc'],
              type_name: 'trim',
              linked_to: { selection: 'body', channel: 'primary' },
            },
          },
        },
        'face/expression.json': {
          name: 'Expression',
          type_name: 'expression',
          animations: ['walk'],
          credits: [],
          match_body_color: true,
          recolors: { material: 'body', palettes: ['ulpc'] },
          layer_1: { zPos: 30, male: 'face/expression/' },
        },
      }).catalog,
      palettes,
    };

    expect(() => importSelectionDocument({
      schema: 'lpc-toolkit.selection.v2',
      bodyType: 'male',
      items: {
        coat: {
          name: 'Linked Coat',
          channelRecolors: { trim: 'ulpc.gold' },
        },
      },
    }, linkedContext)).toThrowError(expect.objectContaining({
      code: 'linked_selection_channel_value',
      path: 'items.coat.channelRecolors.trim',
    }));

    expect(importSelectionDocument({
      schema: 'lpc-toolkit.selection.v1',
      bodyType: 'male',
      items: {
        expression: { name: 'Expression', recolor: 'ulpc.light' },
      },
    }, linkedContext).selection.items.expression).toEqual({
      name: 'Expression',
    });

    expect(() => importSelectionDocument({
      schema: 'lpc-toolkit.selection.v2',
      bodyType: 'male',
      items: {
        expression: { name: 'Expression', recolor: 'ulpc.light' },
      },
    }, linkedContext)).toThrowError(expect.objectContaining({
      code: 'linked_selection_channel_value',
      path: 'items.expression.recolor',
    }));

    expect(() => importSelectionDocument({
      schema: 'lpc-toolkit.selection.v2',
      bodyType: 'male',
      items: {
        coat: { name: 'Coat' },
        trim: { name: 'Coat', recolor: 'ulpc.gold' },
      },
    }, context)).toThrowError(expect.objectContaining({
      code: 'invalid_selection_channel',
      path: 'items.trim',
    }));
  });

  it('maps a present non-string canonical name to invalid_selection_json', () => {
    expect(() => importSelectionDocument({
      schema: 'lpc-toolkit.selection.v1',
      name: 7,
      bodyType: 'male',
      items: {},
    }, context)).toThrowError(
      expect.objectContaining({ code: 'invalid_selection_json' }),
    );
  });

  it('maps strict canonical v2 shape errors to their exact document path', () => {
    expect(() => importSelectionDocument({
      schema: 'lpc-toolkit.selection.v2',
      bodyType: 'male',
      items: {},
      credits: [],
    }, context)).toThrowError(expect.objectContaining({
      code: 'invalid_selection_json',
      path: 'credits',
    }));
  });

  it('rejects a canonical __proto__ type instead of importing a partial candidate', () => {
    const value = JSON.parse(`{
      "schema": "lpc-toolkit.selection.v1",
      "bodyType": "male",
      "items": {
        "body": { "name": "Body Color", "recolor": "ulpc.light" },
        "__proto__": { "name": "Coat" }
      }
    }`) as unknown;

    expect(() => importSelectionDocument(value, context)).toThrowError(
      expect.objectContaining({
        code: 'unknown_upstream_item',
        path: 'items.__proto__',
      }),
    );
  });

  it('preserves an upstream v2 __proto__ selection through catalog validation', () => {
    const protoContext: SelectionDocumentImportContext = {
      catalog: createCatalog({
        ...catalogRecords,
        'torso/proto.json': {
          name: 'Proto Coat',
          type_name: 'coat',
          animations: ['walk'],
          credits: [],
          recolors: {
            color_1: { material: 'cloth', palettes: ['ulpc'] },
            color_2: {
              material: 'metal',
              palettes: ['ulpc'],
              type_name: '__proto__',
            },
          },
          layer_1: { zPos: 10, male: 'torso/proto/' },
        },
      }).catalog,
      palettes,
    };
    const value = JSON.parse(`{
      "version": 2,
      "bodyType": "male",
      "selections": {
        "body": { "itemId": "body", "recolor": "ulpc.light" },
        "__proto__": { "itemId": "proto", "recolor": "ulpc.missing" }
      }
    }`) as unknown;

    expect(() => importSelectionDocument(value, protoContext)).toThrowError(
      expect.objectContaining({
        code: 'invalid_selection_recolor',
        path: 'selections.__proto__.recolor',
      }),
    );
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

  it.each([
    'body=Body_Color&coat',
    'body=Body_Color&=Coat',
    'body=Body_Color&coat=',
    'body=Body_Color&&coat=Coat',
    'body=Body_Color&coat=%ZZ',
    'body=Body_Color&%ZZ=Coat',
  ])(
    'rejects the complete upstream v1 import when hash component %s is malformed',
    (hash) => {
      expect(() =>
        importSelectionDocument(
          {
            version: 1,
            url: `https://example.test/generator/#${hash}`,
          },
          context,
        ),
      ).toThrowError(
        expect.objectContaining({
          code: 'invalid_upstream_selection',
          path: 'url',
        }),
      );
    },
  );

  it.each([
    'https://example.test:bogus/#sex=male&body=Body_Color',
    'https://example.test:65536/#sex=male&body=Body_Color',
    'https://example.test:/#sex=male&body=Body_Color',
    'https:///generator/#sex=male&body=Body_Color',
    'https://[::1/generator/#sex=male&body=Body_Color',
    'https://example.test/%ZZ/#sex=male&body=Body_Color',
  ])('rejects syntactically invalid absolute upstream v1 URL %s', (url) => {
    expect(() => importSelectionDocument({ version: 1, url }, context))
      .toThrowError(
        expect.objectContaining({
          code: 'invalid_upstream_selection',
          path: 'url',
        }),
      );
  });
});
