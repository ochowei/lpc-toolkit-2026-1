import { describe, expect, it } from 'vitest';
import type { ItemDefinition } from '@lpc-toolkit/core';
import { recordsToCatalog } from '../src/catalog/load-catalog';

const item: ItemDefinition = {
  name: 'Plain',
  type_name: 'hair',
  animations: ['walk'],
  credits: [],
  layer_1: { zPos: 100, male: 'hair/plain/' },
} as unknown as ItemDefinition;

describe('recordsToCatalog', () => {
  it('builds a catalog and surfaces it with warnings', () => {
    const { catalog, warnings } = recordsToCatalog({
      'hair_plain.json': item,
    });
    expect(catalog.byTypeName.get('hair')?.[0]?.name).toBe('Plain');
    expect(warnings).toEqual([]);
  });
});
