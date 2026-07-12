import {
  BODY_TYPES,
  getDefaultColorSelection,
  getRecolorVariants,
  LICENSE_GROUP_OF,
  type AnimationName,
  type BodyType,
  type Catalog,
  type ItemDefinition,
  type ItemId,
  type LicenseGroup,
  type PaletteMetadata,
  type Selections,
  type TypeName,
} from '@lpc-toolkit/core';
import { SELECTION_SCHEMA, type SelectionJson } from './selection.js';
import { validateSelections, type ValidationResult } from './validation.js';

export interface CharacterCatalogContext {
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly pathExists: (spritePath: string) => boolean;
}

export interface CharacterSearchInput {
  readonly typeName: TypeName;
  readonly query?: string;
}

export interface CharacterSearchItem {
  readonly itemId: ItemId;
  readonly typeName: TypeName;
  readonly name: string;
  readonly variants: readonly string[];
  readonly recolors: readonly string[];
  readonly animations: readonly AnimationName[];
  readonly licenses: readonly LicenseGroup[];
  readonly replacesCurrent: boolean;
}

export interface CharacterSearchResult {
  readonly items: readonly CharacterSearchItem[];
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

function itemSupportsBodyType(item: ItemDefinition, bodyType: BodyType): boolean {
  for (let n = 1; n < 10; n++) {
    const layer = item[`layer_${n}`];
    if (!layer) break;
    if (typeof layer[bodyType] === 'string') return true;
  }
  return false;
}

function itemLicenseFamilies(item: ItemDefinition): readonly LicenseGroup[] {
  const families = new Set<LicenseGroup>();
  for (const credit of item.credits) {
    for (const license of credit.licenses) families.add(LICENSE_GROUP_OF[license]);
  }
  return [...families];
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
  const query = input.query?.trim().toLowerCase();
  const items: CharacterSearchItem[] = [];

  for (const item of context.catalog.byTypeName.get(input.typeName) ?? []) {
    if (!item.itemId || !itemSupportsBodyType(item, selections.bodyType)) continue;
    const displayName = item.display_name ?? item.name;
    if (
      query &&
      !item.itemId.toLowerCase().includes(query) &&
      !item.name.toLowerCase().includes(query) &&
      !displayName.toLowerCase().includes(query)
    ) continue;

    items.push({
      itemId: item.itemId,
      typeName: item.type_name,
      name: displayName,
      variants: item.variants ?? [],
      recolors: getRecolorVariants(item, context.palettes),
      animations: item.animations,
      licenses: itemLicenseFamilies(item),
      replacesCurrent: selections.items[input.typeName] !== undefined,
    });
  }

  items.sort((left, right) => left.itemId.localeCompare(right.itemId));
  return { items, count: items.length };
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
