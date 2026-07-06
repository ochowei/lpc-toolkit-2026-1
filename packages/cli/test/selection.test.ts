import { describe, expect, it } from 'vitest';
import { parseSelectionJson, selectionJsonFromCore } from '../src/selection.js';

describe('selection json', () => {
  it('parses v1 selection json into core selections', () => {
    const parsed = parseSelectionJson({
      schema: 'lpc-toolkit.selection.v1',
      name: 'hero',
      bodyType: 'male',
      items: {
        body: { name: 'Body Color', recolor: 'light' },
      },
    });

    expect(parsed).toEqual({
      metadata: { schema: 'lpc-toolkit.selection.v1', name: 'hero' },
      selections: {
        bodyType: 'male',
        items: {
          body: { typeName: 'body', name: 'Body Color', recolor: 'light' },
        },
      },
    });
  });

  it('serializes core selections with metadata', () => {
    expect(
      selectionJsonFromCore(
        {
          bodyType: 'male',
          items: { body: { typeName: 'body', name: 'Body Color' } },
        },
        'hero',
      ),
    ).toEqual({
      schema: 'lpc-toolkit.selection.v1',
      name: 'hero',
      bodyType: 'male',
      items: { body: { name: 'Body Color' } },
    });
  });
});
