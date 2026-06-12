import type {
  BodyType,
  ItemDefinition,
  Selection,
  Selections,
  TypeName,
} from '@lpc-toolkit/core';

export function effectiveThumbnailVariant(
  explicit: string | undefined,
  item: ItemDefinition | undefined,
): string | undefined {
  if (explicit !== undefined) return explicit;
  return item?.variants?.[0];
}

function siblingSelectionsFor(
  item: ItemDefinition,
  bodyType: BodyType,
): Record<TypeName, Selection> {
  const out: Record<TypeName, Selection> = {};
  for (const [siblingType, mapping] of Object.entries(item.replace_in_path ?? {})) {
    const entries = Object.entries(mapping);
    if (entries.length === 0) continue;
    const [siblingKey] =
      entries.find(([, mappedBodyType]) => mappedBodyType === bodyType)
      ?? entries[0]!;
    out[siblingType] = {
      typeName: siblingType,
      name: siblingKey.replaceAll('_', ' '),
    };
  }
  return out;
}

export interface BuildItemThumbnailSelectionsArgs {
  readonly item: ItemDefinition;
  readonly bodyType: BodyType;
  readonly variant?: string;
  readonly recolor?: string;
}

export function buildItemThumbnailSelections(
  args: BuildItemThumbnailSelectionsArgs,
): Selections {
  const variant = effectiveThumbnailVariant(args.variant, args.item);
  return {
    bodyType: args.bodyType,
    items: {
      ...siblingSelectionsFor(args.item, args.bodyType),
      [args.item.type_name]: {
        typeName: args.item.type_name,
        name: args.item.name,
        ...(variant ? { variant } : {}),
        ...(args.recolor ? { recolor: args.recolor } : {}),
      },
    },
  };
}
