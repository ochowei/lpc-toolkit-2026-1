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
import { loadCatalogFromRoots, loadPalettesFromRoot } from './loaders.js';
import { commandError, commandOk, type CliResponse } from './response.js';
import type { RuntimeAssets } from './runtime-assets.js';

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
  readonly license?: string;
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

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function itemAnimations(item: ItemDefinition): readonly AnimationName[] {
  return stringArray(item.animations);
}

function itemLicenses(item: ItemDefinition): readonly string[] {
  const credits: unknown = item.credits;
  if (!Array.isArray(credits)) return [];

  return credits.flatMap((credit) => {
    if (typeof credit !== 'object' || credit === null) return [];
    if (!('licenses' in credit)) return [];
    return stringArray(credit.licenses);
  });
}

function itemMatchesLicense(item: ItemDefinition, licenseFilter: string): boolean {
  const normalizedFilter = licenseFilter.trim().toLowerCase();
  if (!normalizedFilter) return true;

  return itemLicenses(item).some((license) => {
      const normalizedLicense = license.toLowerCase();
      return (
        normalizedLicense === normalizedFilter ||
        normalizedLicense.startsWith(`${normalizedFilter} `)
      );
    });
}

function toCatalogItemSummary(
  item: ItemDefinition,
  palettes?: PaletteMetadata,
): CatalogItemSummary | undefined {
  if (!item.itemId) return undefined;
  return {
    itemId: item.itemId,
    typeName: item.type_name,
    name: item.name,
    variants: stringArray(item.variants),
    recolors: palettes ? getRecolorVariants(item, palettes) : [],
    animations: itemAnimations(item),
  };
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
    if (options.animation && !itemAnimations(item).includes(options.animation)) continue;
    if (options.license && !itemMatchesLicense(item, options.license)) continue;

    const summary = toCatalogItemSummary(item, options.palettes);
    if (summary) items.push(summary);
  }

  return { items };
}

export function getCatalogItem(
  catalog: Catalog,
  itemIdOrTypeName: string,
  palettes?: PaletteMetadata,
): CatalogItemSummary | undefined {
  const byItemId = catalog.byItemId.get(itemIdOrTypeName);
  if (byItemId) return toCatalogItemSummary(byItemId, palettes);

  const slash = itemIdOrTypeName.indexOf('/');
  if (slash < 0) return undefined;

  const typeName = itemIdOrTypeName.slice(0, slash);
  const nameOrItemId = itemIdOrTypeName.slice(slash + 1);
  const item = catalog.byTypeName
    .get(typeName)
    ?.find((candidate) => candidate.itemId === nameOrItemId || candidate.name === nameOrItemId);
  return item ? toCatalogItemSummary(item, palettes) : undefined;
}

export function runCatalogCommand(
  parsed: ParsedArgs,
  runtime: RuntimeAssets,
): CliResponse<unknown> {
  const context = runtime.context;
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
    const license = flagString(parsed.flags, 'license');

    return commandOk(
      'catalog items',
      listCatalogItems(catalog.catalog, {
        ...(typeName ? { typeName } : {}),
        ...(search ? { search } : {}),
        ...(bodyType ? { bodyType } : {}),
        ...(animation ? { animation } : {}),
        ...(license ? { license } : {}),
        palettes: palettes.palettes,
      }),
      warnings,
    );
  }

  if (parsed.command[1] === 'item') {
    const itemIdOrTypeName = parsed.positionals[0];
    if (!itemIdOrTypeName) {
      return commandError(
        'catalog item',
        {
          code: 'missing_argument',
          message: 'catalog item requires an item id or type/name.',
        },
        warnings,
      );
    }

    const item = getCatalogItem(catalog.catalog, itemIdOrTypeName, palettes.palettes);
    if (!item) {
      return commandError(
        'catalog item',
        {
          code: 'unknown_item',
          message: `Unknown catalog item: ${itemIdOrTypeName}`,
          path: itemIdOrTypeName,
        },
        warnings,
      );
    }

    return commandOk('catalog item', { item }, warnings);
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
