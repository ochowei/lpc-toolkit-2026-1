import {
  getRecolorVariants,
  type AnimationName,
  type BodyType,
  type Catalog,
  type ItemDefinition,
  type ItemId,
  type PaletteMetadata,
  type TypeName,
} from '@lpc-toolkit/core';
import { flagString, type ParsedArgs } from './args.js';
import { createRuntimeContext } from './context.js';
import { loadCatalogFromRoots, loadPalettesFromRoot } from './loaders.js';
import { commandError, commandOk, type CliResponse } from './response.js';

export interface CatalogTypesData {
  readonly typeNames: readonly TypeName[];
  readonly count: number;
}

export interface CatalogItemSummary {
  readonly itemId: ItemId;
  readonly typeName: TypeName;
  readonly name: string;
  readonly variants: readonly string[];
  readonly recolors: readonly string[];
  readonly animations: readonly AnimationName[];
}

export interface CatalogItemsOptions {
  readonly typeName?: TypeName;
  readonly search?: string;
  readonly bodyType?: BodyType;
  readonly animation?: AnimationName;
  readonly palettes?: PaletteMetadata;
}

export function listCatalogTypes(catalog: Catalog): CatalogTypesData {
  return { typeNames: catalog.typeNames, count: catalog.typeNames.length };
}

function itemSupportsBodyType(item: ItemDefinition, bodyType: BodyType): boolean {
  for (let n = 1; n < 10; n++) {
    const layer = item[`layer_${n}`];
    if (!layer) break;
    if (typeof layer[bodyType] === 'string') return true;
  }
  return false;
}

export function listCatalogItems(
  catalog: Catalog,
  options: CatalogItemsOptions,
): { readonly items: readonly CatalogItemSummary[] } {
  const haystack = options.typeName
    ? catalog.byTypeName.get(options.typeName) ?? []
    : [...catalog.byItemId.values()];
  const search = options.search?.toLowerCase();
  const items: CatalogItemSummary[] = [];

  for (const item of haystack) {
    if (search && !item.name.toLowerCase().includes(search)) continue;
    if (options.bodyType && !itemSupportsBodyType(item, options.bodyType)) continue;
    if (options.animation && !item.animations.includes(options.animation)) continue;
    if (!item.itemId) continue;

    items.push({
      itemId: item.itemId,
      typeName: item.type_name,
      name: item.name,
      variants: item.variants ?? [],
      recolors: options.palettes ? getRecolorVariants(item, options.palettes) : [],
      animations: item.animations,
    });
  }

  return { items };
}

export function runCatalogCommand(
  parsed: ParsedArgs,
  cwd: string,
): CliResponse<unknown> {
  const context = createRuntimeContext({ cwd });
  const catalog = loadCatalogFromRoots(
    context.sheetDefinitionsRoot,
    context.customSheetDefinitionsRoot,
  );
  const palettes = loadPalettesFromRoot(context.paletteDefinitionsRoot);
  const warnings = [...catalog.warnings, ...palettes.warnings];

  if (parsed.command[1] === 'types') {
    return commandOk('catalog types', listCatalogTypes(catalog.catalog), warnings);
  }

  if (parsed.command[1] === 'items') {
    const typeName = flagString(parsed.flags, 'type');
    const search = flagString(parsed.flags, 'search');
    const bodyType = flagString(parsed.flags, 'body-type');
    const animation = flagString(parsed.flags, 'animation');

    return commandOk(
      'catalog items',
      listCatalogItems(catalog.catalog, {
        ...(typeName ? { typeName } : {}),
        ...(search ? { search } : {}),
        ...(bodyType ? { bodyType } : {}),
        ...(animation ? { animation } : {}),
        palettes: palettes.palettes,
      }),
      warnings,
    );
  }

  return commandError(
    parsed.command.join(' '),
    {
      code: 'unknown_command',
      message: `Unknown catalog command: ${parsed.command.join(' ')}`,
    },
    warnings,
  );
}
