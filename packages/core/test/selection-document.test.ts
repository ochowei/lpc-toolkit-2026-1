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

  it('serializes a parsed document back to the canonical shape', () => {
    const parsed = parseSelectionJson(document);
    expect(selectionJsonFromCore(parsed.selections, parsed.metadata.name)).toEqual(document);
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
