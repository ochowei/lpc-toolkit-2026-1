import {
  BODY_TYPES,
  getDefaultColorSelection,
  SELECTION_SCHEMA,
  type BodyType,
  type Catalog,
  type ItemDefinition,
  type ItemId,
  type PaletteMetadata,
  type Selections,
  type SelectionJson,
  type TypeName,
} from '@lpc-toolkit/core';
import {
  discoverItems,
  editDistance,
  toDiscoveryCandidate,
  type DiscoveryCandidate,
  type DiscoveryItemSummary,
  type DiscoveryPagination,
  type DiscoveryResult,
} from './catalog-discovery.js';
import { validateSelections, type ValidationResult } from './validation.js';

export interface CharacterCatalogContext {
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly pathExists: (spritePath: string) => boolean;
}

export interface CharacterSearchInput {
  readonly typeName: TypeName;
  readonly query?: string;
  readonly pagination: DiscoveryPagination;
}

export interface CharacterSearchItem extends DiscoveryItemSummary {
  readonly replacesCurrent: boolean;
  readonly compatibleBodyType: BodyType;
}

export interface CharacterSearchResult extends DiscoveryResult<CharacterSearchItem> {
  readonly count: number;
}

export interface CharacterSetInput {
  readonly typeName: TypeName;
  readonly itemRef: string;
  readonly variant?: string;
  readonly recolor?: string;
}

export interface CharacterEditResult {
  readonly selections: Selections;
  readonly replaced: boolean;
}

export interface CharacterEditErrorDetails {
  readonly suggestions?: readonly string[];
  readonly available?: readonly string[];
}

export class CharacterEditError extends Error {
  readonly code: string;
  readonly path?: string;
  readonly details?: CharacterEditErrorDetails;

  constructor(
    code: string,
    message: string,
    options: { readonly path?: string; readonly details?: CharacterEditErrorDetails } = {},
  ) {
    super(message);
    this.name = 'CharacterEditError';
    this.code = code;
    if (options.path !== undefined) this.path = options.path;
    if (options.details !== undefined) this.details = options.details;
  }
}

function unknownItemError(
  itemRef: string,
  catalog: Catalog,
  typeName: TypeName,
): CharacterEditError {
  const query = itemRef.toLowerCase();
  const suggestions = (catalog.byTypeName.get(typeName) ?? [])
    .filter((item) =>
      item.itemId?.toLowerCase().includes(query) || item.name.toLowerCase().includes(query))
    .map((item) => item.itemId)
    .filter((itemId): itemId is ItemId => itemId !== undefined)
    .sort((left, right) => left.localeCompare(right));
  return new CharacterEditError('unknown_item', `Unknown item: ${itemRef}`, {
    path: `${typeName}/${itemRef}`,
    ...(suggestions.length > 0 ? { details: { suggestions } } : {}),
  });
}

function resolveItem(catalog: Catalog, typeName: TypeName, itemRef: string): ItemDefinition {
  const byId = catalog.byItemId.get(itemRef);
  const exact = byId ?? catalog.byTypeName.get(typeName)?.find(
    (item) => `${typeName}/${item.name}` === itemRef,
  );
  if (!exact) throw unknownItemError(itemRef, catalog, typeName);
  if (exact.type_name !== typeName) {
    throw new CharacterEditError(
      'item_type_mismatch',
      `${itemRef} belongs to ${exact.type_name}.`,
      { path: itemRef },
    );
  }
  return exact;
}

function editErrorFromValidation(
  validation: ValidationResult,
): CharacterEditError {
  const first = validation.errors[0];
  return new CharacterEditError(
    first?.code ?? 'selection_invalid',
    first?.message ?? 'Selection is invalid.',
    {
      ...(first?.path ? { path: first.path } : {}),
      ...(first?.details ? { details: first.details } : {}),
    },
  );
}

export function createEmptyCharacter(name: string, bodyType: BodyType): SelectionJson {
  if (!BODY_TYPES.includes(bodyType as (typeof BODY_TYPES)[number])) {
    throw new CharacterEditError('body_type_invalid', `Unsupported body type: ${bodyType}`, {
      details: { available: [...BODY_TYPES] },
    });
  }
  return { schema: SELECTION_SCHEMA, name, bodyType, items: {} };
}

export function searchCharacterItems(
  selections: Selections,
  input: CharacterSearchInput,
  context: CharacterCatalogContext,
): CharacterSearchResult {
  const typeItems = context.catalog.byTypeName.get(input.typeName);
  if (!typeItems) {
    const ranked = context.catalog.typeNames
      .map((typeName) => ({ typeName, distance: editDistance(input.typeName, typeName) }))
      .sort((left, right) => left.distance - right.distance
        || (left.typeName < right.typeName ? -1 : left.typeName > right.typeName ? 1 : 0));
    throw new CharacterEditError(
      'unknown_type_name',
      `Unknown type name: ${input.typeName}`,
      {
        path: input.typeName,
        details: {
          suggestions: ranked.slice(0, 5).map(({ typeName }) => typeName),
          available: [...context.catalog.typeNames]
            .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
            .slice(0, 10),
        },
      },
    );
  }

  const candidates: DiscoveryCandidate<CharacterSearchItem>[] = typeItems.flatMap((item) => {
    const candidate = toDiscoveryCandidate(item, context.palettes);
    if (!candidate || !candidate.summary.supportedBodyTypes.includes(selections.bodyType)) {
      return [];
    }
    return [{
      internalName: candidate.internalName,
      summary: {
        ...candidate.summary,
        replacesCurrent: selections.items[input.typeName] !== undefined,
        compatibleBodyType: selections.bodyType,
      },
    }];
  });
  const result = discoverItems(candidates, {
    ...(input.query === undefined ? {} : { query: input.query }),
    pagination: input.pagination,
  });
  return { ...result, count: result.page.total };
}

export function setCharacterItem(
  selections: Selections,
  input: CharacterSetInput,
  context: CharacterCatalogContext,
): CharacterEditResult {
  const item = resolveItem(context.catalog, input.typeName, input.itemRef);
  const colorFields = input.variant || input.recolor
    ? {
        ...(input.variant ? { variant: input.variant } : {}),
        ...(input.recolor ? { recolor: input.recolor } : {}),
      }
    : getDefaultColorSelection(item, context.palettes);
  const candidate: Selections = {
    bodyType: selections.bodyType,
    items: {
      ...selections.items,
      [input.typeName]: {
        typeName: input.typeName,
        name: item.name,
        ...colorFields,
      },
    },
  };
  const validation = validateSelections(candidate, context);
  if (!validation.ok) {
    throw editErrorFromValidation(validation);
  }
  return {
    selections: candidate,
    replaced: selections.items[input.typeName] !== undefined,
  };
}

export function removeCharacterItem(
  selections: Selections,
  typeName: TypeName,
): CharacterEditResult {
  if (selections.items[typeName] === undefined) {
    throw new CharacterEditError(
      'selection_type_not_set',
      `No selection is set for type: ${typeName}`,
      { path: typeName },
    );
  }
  const items = { ...selections.items };
  delete items[typeName];
  return { selections: { bodyType: selections.bodyType, items }, replaced: true };
}
