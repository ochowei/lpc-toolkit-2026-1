import type {
  BodyType,
  Catalog,
  ItemDefinition,
  TypeName,
} from '@lpc-toolkit/core';
import { itemSupportsBodyType } from '../../slice/catalog-tree';

/** Search inputs for flattening the catalog into the sidebar palette. */
export interface PaletteSearchArgs {
  readonly catalog: Catalog;
  readonly bodyType: BodyType;
  readonly query: string;
  readonly shownTypeNames: readonly TypeName[];
  readonly itemLabel?: (item: ItemDefinition) => string;
}

/** One searchable catalog row plus compatibility for the active body type. */
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
      const label = args.itemLabel?.(item) ?? item.display_name ?? item.name;
      const matches =
        !term ||
        label.toLowerCase().includes(term) ||
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
    const labelA = args.itemLabel?.(a.item) ?? a.item.display_name ?? a.item.name;
    const labelB = args.itemLabel?.(b.item) ?? b.item.display_name ?? b.item.name;
    return labelA.localeCompare(labelB);
  });

  return out;
}
