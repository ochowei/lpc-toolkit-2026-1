import type {
  BodyType,
  Catalog,
  ItemDefinition,
  TypeName,
} from '@lpc-toolkit/core';
import { itemSupportsBodyType } from '../../slice/catalog-tree';

export interface PaletteSearchArgs {
  readonly catalog: Catalog;
  readonly bodyType: BodyType;
  readonly query: string;
  readonly shownTypeNames: readonly TypeName[];
}

export interface PaletteResult {
  readonly typeName: TypeName;
  readonly item: ItemDefinition;
  readonly supports: boolean;
}

/**
 * Flatten the catalog across `shownTypeNames`, filter by query (matches
 * item name / typeName / author), and sort: supported-first → typeName →
 * item name. Top-N slicing is the caller's job.
 */
export function filterAndRankPaletteItems(args: PaletteSearchArgs): PaletteResult[] {
  const term = args.query.trim().toLowerCase();
  const out: PaletteResult[] = [];

  for (const typeName of args.shownTypeNames) {
    const defs = args.catalog.byTypeName.get(typeName) ?? [];
    for (const item of defs) {
      const matches =
        !term ||
        item.name.toLowerCase().includes(term) ||
        typeName.toLowerCase().includes(term) ||
        item.credits.some((c) =>
          c.authors.some((a) => a.toLowerCase().includes(term)),
        );
      if (!matches) continue;
      out.push({
        typeName,
        item,
        supports: itemSupportsBodyType(item, args.bodyType),
      });
    }
  }

  out.sort((a, b) => {
    if (a.supports !== b.supports) return a.supports ? -1 : 1;
    if (a.typeName !== b.typeName) return a.typeName.localeCompare(b.typeName);
    return a.item.name.localeCompare(b.item.name);
  });

  return out;
}
