import type { Catalog, Selections, TypeName } from './types.js';

export interface HashWarning {
  readonly key: string;
  readonly value: string;
  readonly reason:
    | 'unknown_type_name'
    | 'unknown_item'
    | 'unknown_variant'
    | 'unknown_recolor'
    | 'malformed';
}

export interface ParseHashResult {
  readonly selections: Selections;
  readonly warnings: readonly HashWarning[];
  readonly unknownKeys: readonly TypeName[];
}

export function parseHash(hash: string, catalog: Catalog): ParseHashResult {
  void hash;
  void catalog;
  throw new Error('not implemented');
}

export function serializeHash(selections: Selections): string {
  void selections;
  throw new Error('not implemented');
}
