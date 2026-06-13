import { createCatalog } from '../../src/catalog.js';
import type { Catalog, FilePath, ItemDefinition } from '../../src/types.js';

export function makeCatalog(items: ItemDefinition[]): Catalog {
  const records: Record<FilePath, ItemDefinition> = {};
  for (let i = 0; i < items.length; i++) {
    const name = items[i]!.name.toLowerCase().replaceAll(' ', '_');
    records[`item_${i}_${name}.json`] = items[i]!;
  }
  return createCatalog(records).catalog;
}
