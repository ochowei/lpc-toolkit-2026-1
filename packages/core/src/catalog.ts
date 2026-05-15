import type { Catalog, FilePath, ItemDefinition } from './types.js';

export interface CatalogLoadWarning {
  readonly path: FilePath;
  readonly message: string;
}

export interface CreateCatalogResult {
  readonly catalog: Catalog;
  readonly warnings: readonly CatalogLoadWarning[];
}

export function createCatalog(
  records: Readonly<Record<FilePath, ItemDefinition>>,
): CreateCatalogResult {
  void records;
  throw new Error('not implemented');
}
