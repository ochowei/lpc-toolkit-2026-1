import {
  createCatalog,
  type Catalog,
  type CreateCatalogResult,
  type FilePath,
  type ItemDefinition,
} from '@lpc-toolkit/core';

export function recordsToCatalog(
  records: Readonly<Record<FilePath, ItemDefinition>>,
): CreateCatalogResult {
  return createCatalog(records);
}

/**
 * Build the catalog from the read-only `upstream/` submodule. The glob is
 * static and relative: from packages/web/src/catalog/ the repo root is four
 * levels up. Vite inlines every matched JSON's default export at build time.
 * If the submodule is not initialized the glob is empty and we throw with a
 * fix instruction (spec §5).
 */
export function loadCatalogFromUpstream(): Catalog {
  // '**/*.json' also matches meta_*.json; createCatalog skips those
  // internally (isMetaFile), so they never become items or warnings.
  const mods = import.meta.glob<ItemDefinition>(
    '../../../../upstream/sheet_definitions/**/*.json',
    { eager: true, import: 'default' },
  );
  const records: Record<FilePath, ItemDefinition> = {};
  for (const [key, def] of Object.entries(mods)) records[key] = def;

  if (Object.keys(records).length === 0) {
    throw new Error(
      'No sheet definitions found. Run: git submodule update --init',
    );
  }

  const { catalog, warnings } = recordsToCatalog(records);
  if (warnings.length > 0) {
    console.warn(`[catalog] ${warnings.length} load warning(s)`, warnings);
  }
  if (catalog.typeNames.length === 0) {
    throw new Error('Catalog is empty after ingest (all records invalid).');
  }
  return catalog;
}
