import { describe, expect, it } from 'vitest';
import {
  parseSelectionJson,
  selectionJsonFromCore,
} from '../src/selection-document.js';

describe('selection document', () => {
  const document = {
    schema: 'lpc-toolkit.selection.v1',
    name: 'hero',
    bodyType: 'male',
    items: {
      body: { name: 'Body Color', recolor: 'light' },
      hair: { name: 'Braids', variant: 'long' },
    },
  } as const;

  it('parses the unchanged v1 schema into core selections', () => {
    expect(parseSelectionJson(document)).toEqual({
      metadata: { schema: 'lpc-toolkit.selection.v1', name: 'hero' },
      selections: {
        bodyType: 'male',
        items: {
          body: { typeName: 'body', name: 'Body Color', recolor: 'light' },
          hair: { typeName: 'hair', name: 'Braids', variant: 'long' },
        },
      },
    });
  });

  it('reads v1 but serializes only the canonical v2 shape', () => {
    const parsed = parseSelectionJson(document);
    expect(selectionJsonFromCore(parsed.selections, parsed.metadata.name)).toEqual({
      ...document,
      schema: 'lpc-toolkit.selection.v2',
    });
  });

  it('parses v2 channel recolors without inventing absent secondary defaults', () => {
    expect(parseSelectionJson({
      schema: 'lpc-toolkit.selection.v2',
      name: 'hero',
      bodyType: 'male',
      items: {
        coat: {
          name: 'Coat',
          recolor: 'ulpc.blue',
          channelRecolors: { trim: 'ulpc.gold' },
        },
        body: { name: 'Body Color' },
      },
    })).toEqual({
      metadata: { schema: 'lpc-toolkit.selection.v2', name: 'hero' },
      selections: {
        bodyType: 'male',
        items: {
          coat: {
            typeName: 'coat',
            name: 'Coat',
            recolor: 'ulpc.blue',
            channelRecolors: { trim: 'ulpc.gold' },
          },
          body: { typeName: 'body', name: 'Body Color' },
        },
      },
    });
  });

  it('omits optional metadata name when the property is absent', () => {
    const parsed = parseSelectionJson({
      schema: 'lpc-toolkit.selection.v1',
      bodyType: 'male',
      items: {},
    });

    expect(parsed.metadata).toEqual({ schema: 'lpc-toolkit.selection.v1' });
  });

  it.each([null, 7, { value: 'hero' }])(
    'rejects a present non-string metadata name %#',
    (name) => {
      expect(() => parseSelectionJson({
        schema: 'lpc-toolkit.selection.v1',
        name,
        bodyType: 'male',
        items: {},
      })).toThrow('Selection JSON name must be a string.');
    },
  );

  it.each(['__proto__', 'constructor', 'prototype'])(
    'preserves the dangerous type key %s while parsing canonical JSON',
    (typeName) => {
      const parsed = parseSelectionJson(JSON.parse(JSON.stringify({
        schema: 'lpc-toolkit.selection.v1',
        bodyType: 'male',
        items: Object.fromEntries([[typeName, { name: 'Injected' }]]),
      })) as unknown);

      expect(Object.hasOwn(parsed.selections.items, typeName)).toBe(true);
      expect(parsed.selections.items[typeName]).toEqual({
        typeName,
        name: 'Injected',
      });
    },
  );

  it.each(['__proto__', 'constructor', 'prototype'])(
    'preserves the dangerous type key %s while serializing canonical JSON',
    (typeName) => {
      const selection = { typeName, name: 'Injected' };
      const serialized = selectionJsonFromCore({
        bodyType: 'male',
        items: Object.fromEntries([[typeName, selection]]),
      });

      expect(Object.hasOwn(serialized.items, typeName)).toBe(true);
      expect(serialized.items[typeName]).toEqual({ name: 'Injected' });
      expect(serialized.schema).toBe('lpc-toolkit.selection.v2');
    },
  );

  it.each(['__proto__', 'constructor', 'prototype'])(
    'preserves the dangerous channel key %s in canonical v2',
    (channel) => {
      const parsed = parseSelectionJson(JSON.parse(JSON.stringify({
        schema: 'lpc-toolkit.selection.v2',
        bodyType: 'male',
        items: {
          coat: {
            name: 'Coat',
            channelRecolors: Object.fromEntries([[channel, 'ulpc.gold']]),
          },
        },
      })) as unknown);

      expect(Object.hasOwn(
        parsed.selections.items.coat?.channelRecolors ?? {},
        channel,
      )).toBe(true);
    },
  );

  it.each([
    [
      {
        schema: 'lpc-toolkit.selection.v2',
        bodyType: 'male',
        items: {},
        credits: [],
      },
      '$.credits',
    ],
    [
      {
        schema: 'lpc-toolkit.selection.v2',
        bodyType: 'male',
        items: { coat: { name: 'Coat', color: 'red' } },
      },
      '$.items.coat.color',
    ],
    [
      {
        schema: 'lpc-toolkit.selection.v2',
        bodyType: 'male',
        items: { coat: { name: 'Coat', channelRecolors: [] } },
      },
      '$.items.coat.channelRecolors',
    ],
    [
      {
        schema: 'lpc-toolkit.selection.v2',
        bodyType: 'male',
        items: { coat: { name: 'Coat', channelRecolors: { trim: 7 } } },
      },
      '$.items.coat.channelRecolors.trim',
    ],
    [
      {
        schema: 'lpc-toolkit.selection.v2',
        bodyType: 'male',
        items: { coat: { name: 'Coat', channelRecolors: { primary: 'red' } } },
      },
      '$.items.coat.channelRecolors.primary',
    ],
  ])('rejects strict v2 input at its exact field path %#', (value, path) => {
    expect(() => parseSelectionJson(value)).toThrow(path);
  });

  it.each([
    [{ bodyType: 'male', items: {} }, 'Unsupported selection schema'],
    [{ schema: 'lpc-toolkit.selection.v1', items: {} }, 'bodyType must be a string'],
    [{ schema: 'lpc-toolkit.selection.v1', bodyType: 'male', items: [] }, 'items must be an object'],
    [{ schema: 'lpc-toolkit.selection.v1', bodyType: 'male', items: { hair: { name: 1 } } }, 'must include a string name'],
  ])('rejects malformed canonical input %#', (value, message) => {
    expect(() => parseSelectionJson(value)).toThrow(message);
  });
});
