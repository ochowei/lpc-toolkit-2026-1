import {
  BODY_TYPES,
  type AnimationName,
  type BodyType,
  type Catalog,
  type ItemDefinition,
  type PaletteMetadata,
  type TypeName,
} from '@lpc-toolkit/core';
import { flagString, type ParsedArgs } from './args.js';
import {
  discoverItems,
  editDistance,
  hasDiscoveryCredits,
  itemAnimationCapabilities,
  readDiscoveryPagination,
  toDiscoveryCandidate,
  toDiscoveryDetail,
  type DiscoveryItemDetail,
  type DiscoveryItemSummary,
  type DiscoveryPagination,
  type DiscoveryResult,
} from './catalog-discovery.js';
import { loadCatalogFromRoots, loadPalettesFromRoot } from './loaders.js';
import { commandError, commandOk, type CliIssue, type CliResponse } from './response.js';
import type { RuntimeAssets } from './runtime-assets.js';

export interface CatalogTypesData {
  readonly typeNames: readonly TypeName[];
  readonly count: number;
}

export interface CatalogItemsOptions {
  readonly typeName?: TypeName;
  readonly search?: string;
  readonly bodyType?: BodyType;
  readonly animation?: AnimationName;
  readonly license?: string;
  readonly palettes: PaletteMetadata;
  readonly pagination: DiscoveryPagination;
}

export function listCatalogTypes(catalog: Catalog): CatalogTypesData {
  return { typeNames: catalog.typeNames, count: catalog.typeNames.length };
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
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

function itemMatchesAnimation(item: ItemDefinition, animation: AnimationName): boolean {
  const capabilities = itemAnimationCapabilities(item);
  return capabilities.native.includes(animation) || capabilities.compatible.includes(animation);
}

export function listCatalogItems(
  catalog: Catalog,
  options: CatalogItemsOptions,
): DiscoveryResult<DiscoveryItemSummary> {
  const definitions = options.typeName
    ? catalog.byTypeName.get(options.typeName) ?? []
    : [...catalog.byItemId.values()];
  const candidates = definitions.flatMap((item) => {
    if (options.animation && !itemMatchesAnimation(item, options.animation)) return [];
    if (options.license && !itemMatchesLicense(item, options.license)) return [];
    const candidate = toDiscoveryCandidate(item, options.palettes);
    if (!candidate) return [];
    if (options.bodyType && !candidate.summary.supportedBodyTypes.includes(options.bodyType)) return [];
    return [candidate];
  });
  return discoverItems(candidates, {
    ...(options.search === undefined ? {} : { query: options.search }),
    pagination: options.pagination,
  });
}

export function getCatalogItem(
  catalog: Catalog,
  itemIdOrTypeName: string,
  palettes: PaletteMetadata,
): DiscoveryItemDetail | undefined {
  const byItemId = catalog.byItemId.get(itemIdOrTypeName);
  if (byItemId) return toDiscoveryDetail(byItemId, palettes);

  const slash = itemIdOrTypeName.indexOf('/');
  if (slash < 0) return undefined;

  const typeName = itemIdOrTypeName.slice(0, slash);
  const nameOrItemId = itemIdOrTypeName.slice(slash + 1);
  const item = catalog.byTypeName
    .get(typeName)
    ?.find((candidate) => candidate.itemId === nameOrItemId || candidate.name === nameOrItemId);
  return item ? toDiscoveryDetail(item, palettes) : undefined;
}

function domainIssue(
  code: string,
  domainName: string,
  value: string,
  candidates: readonly string[],
): CliIssue {
  const available = [...new Set(candidates)]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
    .slice(0, 10);
  const suggestions = [...new Set(candidates)]
    .map((candidate) => ({ candidate, distance: editDistance(value, candidate) }))
    .sort((left, right) => left.distance - right.distance
      || (left.candidate < right.candidate ? -1 : left.candidate > right.candidate ? 1 : 0))
    .slice(0, 5)
    .map(({ candidate }) => candidate);
  return {
    code,
    message: `Unknown ${domainName}: ${value}`,
    path: value,
    details: { suggestions, available },
  };
}

function filterIssue(
  catalog: Catalog,
  options: Omit<CatalogItemsOptions, 'pagination' | 'palettes'>,
): CliIssue | undefined {
  const domain = <T extends string>(values: readonly T[]) => [...new Set(values)].sort();
  if (options.typeName && !catalog.byTypeName.has(options.typeName)) {
    return domainIssue('unknown_type_name', 'type name', options.typeName, catalog.typeNames);
  }
  if (options.bodyType && !BODY_TYPES.includes(options.bodyType as (typeof BODY_TYPES)[number])) {
    return domainIssue('body_type_invalid', 'body type', options.bodyType, BODY_TYPES);
  }
  const items = [...catalog.byItemId.values()].filter(hasDiscoveryCredits);
  const animations = domain(items.flatMap((item) => {
    const capabilities = itemAnimationCapabilities(item);
    return [...capabilities.native, ...capabilities.compatible];
  }));
  if (options.animation && !animations.includes(options.animation)) {
    return domainIssue('unknown_animation', 'animation', options.animation, animations);
  }
  const licenses = domain(items.flatMap((item) => itemLicenses(item)));
  if (options.license && !items.some((item) => itemMatchesLicense(item, options.license!))) {
    return domainIssue('unknown_license', 'license', options.license, licenses);
  }
  return undefined;
}

function discoveryCreditWarnings(catalog: Catalog): readonly CliIssue[] {
  return [...catalog.byItemId.values()].flatMap((item) => hasDiscoveryCredits(item) ? [] : [{
    code: 'catalog_warning',
    message: 'missing or malformed "credits"; excluded from catalog discovery',
    path: item.sourcePath ?? item.itemId ?? item.name,
  }]);
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
  const warnings = [
    ...catalog.warnings,
    ...palettes.warnings,
    ...discoveryCreditWarnings(catalog.catalog),
  ];

  if (parsed.command[1] === 'types') {
    return commandOk('catalog types', listCatalogTypes(catalog.catalog), warnings);
  }

  if (parsed.command[1] === 'items') {
    const typeName = flagString(parsed.flags, 'type');
    const search = flagString(parsed.flags, 'search');
    const bodyType = flagString(parsed.flags, 'body-type');
    const animation = flagString(parsed.flags, 'animation');
    const license = flagString(parsed.flags, 'license');
    const pagination = readDiscoveryPagination(parsed.flags);
    const options = {
      ...(typeName ? { typeName } : {}),
      ...(search ? { search } : {}),
      ...(bodyType ? { bodyType } : {}),
      ...(animation ? { animation } : {}),
      ...(license ? { license } : {}),
    };
    const issue = filterIssue(catalog.catalog, options);
    if (issue) return commandError('catalog items', issue, warnings);

    return commandOk(
      'catalog items',
      listCatalogItems(catalog.catalog, {
        ...options,
        palettes: palettes.palettes,
        pagination,
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
