import {
  getRecolorVariantsForType,
  getSpritePathsForSelections,
  itemSupportsSelectionType,
  type Catalog,
  type ItemDefinition,
  type PaletteMetadata,
  type Selection,
  type Selections,
  type TypeName,
} from '@lpc-toolkit/core';
import type { CliIssue } from './response.js';

export interface ValidateSelectionsOptions {
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly pathExists: (spritePath: string) => boolean;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly warnings: readonly CliIssue[];
  readonly errors: readonly CliIssue[];
}

function selectionPath(selection: Selection): string {
  return `${selection.typeName}/${selection.name}`;
}

function findItem(
  catalog: Catalog,
  typeName: TypeName,
  name: string,
): ItemDefinition | undefined {
  return catalog.byTypeName.get(typeName)?.find((item) => item.name === name)
    ?? [...catalog.byItemId.values()].find(
      (item) => item.name === name && itemSupportsSelectionType(item, typeName),
    );
}

function isBodyTypeCompatible(item: ItemDefinition, bodyType: string): boolean {
  for (let n = 1; n < 10; n++) {
    const layer = item[`layer_${n}`];
    if (!layer) break;
    if (typeof layer[bodyType] === 'string') return true;
  }
  return false;
}

function validateSelection(
  selection: Selection,
  options: ValidateSelectionsOptions,
  bodyType: string,
): { readonly item?: ItemDefinition; readonly errors: readonly CliIssue[] } {
  const errors: CliIssue[] = [];
  const item = findItem(options.catalog, selection.typeName, selection.name);
  if (!options.catalog.byTypeName.has(selection.typeName) && !item) {
    errors.push({
      code: 'unknown_type_name',
      message: `Unknown item type: ${selection.typeName}`,
      path: selection.typeName,
    });
    return { errors };
  }

  if (!item) {
    errors.push({
      code: 'unknown_item',
      message: `Unknown item: ${selection.name}`,
      path: selectionPath(selection),
    });
    return { errors };
  }

  if (
    selection.variant &&
    (item.type_name !== selection.typeName || !item.variants?.includes(selection.variant))
  ) {
    errors.push({
      code: 'unknown_variant',
      message: `Unknown variant: ${selection.variant}`,
      path: selectionPath(selection),
    });
  }

  if (selection.recolor) {
    const recolors = getRecolorVariantsForType(
      item,
      options.palettes,
      selection.typeName,
    );
    if (!recolors.includes(selection.recolor)) {
      errors.push({
        code: 'unknown_recolor',
        message: `Unknown recolor: ${selection.recolor}`,
        path: selectionPath(selection),
      });
    }
  }

  if (item.type_name === selection.typeName && !isBodyTypeCompatible(item, bodyType)) {
    errors.push({
      code: 'body_type_incompatible',
      message: `Item is not compatible with body type: ${bodyType}`,
      path: selectionPath(selection),
    });
  }

  return { item, errors };
}

export function validateSelections(
  selections: Selections,
  options: ValidateSelectionsOptions,
): ValidationResult {
  const errors: CliIssue[] = [];
  const warnings: CliIssue[] = [];
  const validSelections = new Set<TypeName>();

  for (const selection of Object.values(selections.items)) {
    const result = validateSelection(selection, options, selections.bodyType);
    errors.push(...result.errors);
    if (
      result.item &&
      result.item.type_name === selection.typeName &&
      result.errors.length === 0
    ) {
      validSelections.add(selection.typeName);
    }
  }

  if (errors.length === 0) {
    const spritePaths = getSpritePathsForSelections(selections, options.catalog, {
      pathExists: options.pathExists,
    });
    const resolvedTypes = new Set(spritePaths.map((layer) => layer.typeName));

    for (const selection of Object.values(selections.items)) {
      if (validSelections.has(selection.typeName) && !resolvedTypes.has(selection.typeName)) {
        errors.push({
          code: 'missing_sprite_path',
          message: 'No sprite path exists for selection.',
          path: selectionPath(selection),
        });
      }
    }
  }

  return { ok: errors.length === 0, warnings, errors };
}
