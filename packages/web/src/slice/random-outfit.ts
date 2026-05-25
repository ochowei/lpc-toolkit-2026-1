import type {
  BodyType,
  Catalog,
  Selection,
  Selections,
  TypeName,
} from '@lpc-toolkit/core';
import { itemSupportsBodyType } from './catalog-tree';
import { CATEGORY_GROUPS } from './category-groups';

export interface PickRandomOutfitArgs {
  readonly catalog: Catalog;
  readonly bodyType: BodyType;
  readonly rng?: () => number;          // defaults to Math.random
  readonly optionalProb?: number;       // defaults to 0.5
}

// The `body` super-group's typeNames are treated as required (always
// included if a compatible item exists). All other typeNames are
// optional (included with probability `optionalProb`).
const REQUIRED_GROUP_ID = 'body';

/**
 * Generate a Feeling Lucky outfit. Required categories (body-part group)
 * always get an item; optional categories are included with probability
 * `optionalProb`. Compatible items only.
 */
export function pickRandomOutfit(args: PickRandomOutfitArgs): Selections {
  const rng = args.rng ?? Math.random;
  const optionalProb = args.optionalProb ?? 0.5;

  const requiredGroup = CATEGORY_GROUPS.find((g) => g.id === REQUIRED_GROUP_ID);
  const requiredTypes = new Set<TypeName>(requiredGroup?.typeNames ?? []);
  const allGroupedTypes = new Set<TypeName>(
    CATEGORY_GROUPS.flatMap((g) => g.typeNames),
  );

  const items: Record<TypeName, Selection> = {};
  for (const typeName of allGroupedTypes) {
    const isRequired = requiredTypes.has(typeName);
    if (!isRequired && rng() > optionalProb) continue;

    const defs = args.catalog.byTypeName.get(typeName) ?? [];
    const compatible = defs.filter((d) => itemSupportsBodyType(d, args.bodyType));
    if (compatible.length === 0) continue;

    const pick = compatible[Math.floor(rng() * compatible.length)]!;
    items[typeName] = { typeName, name: pick.name };
  }

  return { bodyType: args.bodyType, items };
}
