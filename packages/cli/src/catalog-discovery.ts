import {
  BODY_TYPES,
  LICENSE_GROUP_OF,
  LICENSE_GROUP_ORDER,
  getRecolorVariants,
  type AnimationName,
  type BodyType,
  type CreditEntry,
  type ItemDefinition,
  type ItemId,
  type LicenseGroup,
  type PaletteMetadata,
  type TypeName,
} from '@lpc-toolkit/core';
import { flagBoolean, flagString, type FlagValue } from './args.js';
import type { CliIssue } from './response.js';

export const DEFAULT_DISCOVERY_LIMIT = 20;
export const MAX_DISCOVERY_LIMIT = 100;

export interface DiscoveryPagination {
  readonly all: boolean;
  readonly limit: number;
  readonly offset: number;
}

export interface DiscoveryPage {
  readonly limit: number | null;
  readonly offset: number;
  readonly returned: number;
  readonly total: number;
  readonly hasMore: boolean;
  readonly nextOffset: number | null;
}

export interface DiscoveryItemSummary {
  readonly itemId: ItemId;
  readonly typeName: TypeName;
  readonly name: string;
  readonly supportedBodyTypes: readonly BodyType[];
  readonly variants: readonly string[];
  readonly recolors: readonly string[];
  readonly animations: readonly AnimationName[];
  readonly licenses: readonly LicenseGroup[];
  readonly creditCount: number;
}

export interface DiscoveryItemDetail extends DiscoveryItemSummary {
  readonly credits: readonly CreditEntry[];
}

export interface DiscoveryCandidate<T extends DiscoveryItemSummary> {
  readonly summary: T;
  readonly internalName: string;
}

export interface DiscoverySuggestion {
  readonly itemId: ItemId;
  readonly typeName: TypeName;
  readonly name: string;
}

export interface DiscoveryResult<T extends DiscoveryItemSummary> {
  readonly items: readonly T[];
  readonly page: DiscoveryPage;
  readonly suggestions?: readonly DiscoverySuggestion[];
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function editDistance(leftInput: string, rightInput: string): number {
  const left = normalized(leftInput);
  const right = normalized(rightInput);
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let diagonal = previous[0]!;
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const above = previous[rightIndex]!;
      previous[rightIndex] = Math.min(
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length]!;
}

function supportedBodyTypes(item: ItemDefinition): readonly BodyType[] {
  return BODY_TYPES.filter((bodyType) => {
    for (let layerNumber = 1; layerNumber < 10; layerNumber++) {
      const layer = item[`layer_${layerNumber}`];
      if (!layer) break;
      if (typeof layer[bodyType] === 'string') return true;
    }
    return false;
  });
}

function licenseGroups(item: ItemDefinition): readonly LicenseGroup[] {
  const present = new Set<LicenseGroup>();
  for (const credit of item.credits) {
    for (const license of credit.licenses) present.add(LICENSE_GROUP_OF[license]);
  }
  return LICENSE_GROUP_ORDER.filter((group) => present.has(group));
}

export function toDiscoveryCandidate(
  item: ItemDefinition,
  palettes: PaletteMetadata,
): DiscoveryCandidate<DiscoveryItemSummary> | undefined {
  if (!item.itemId) return undefined;
  return {
    internalName: item.name,
    summary: {
      itemId: item.itemId,
      typeName: item.type_name,
      name: item.display_name ?? item.name,
      supportedBodyTypes: supportedBodyTypes(item),
      variants: item.variants ?? [],
      recolors: getRecolorVariants(item, palettes),
      animations: item.animations,
      licenses: licenseGroups(item),
      creditCount: item.credits.length,
    },
  };
}

export function toDiscoveryDetail(
  item: ItemDefinition,
  palettes: PaletteMetadata,
): DiscoveryItemDetail | undefined {
  const candidate = toDiscoveryCandidate(item, palettes);
  return candidate ? { ...candidate.summary, credits: item.credits } : undefined;
}

function integerIssue(
  flags: ReadonlyMap<string, FlagValue>,
  name: 'limit' | 'offset',
): CliIssue | undefined {
  if (!flags.has(name)) return undefined;
  const value = flagString(flags, name);
  const valid = name === 'limit'
    ? value !== undefined && /^[1-9]\d*$/u.test(value) && Number(value) <= MAX_DISCOVERY_LIMIT
    : value !== undefined && /^(?:0|[1-9]\d*)$/u.test(value);
  return valid ? undefined : {
    code: 'invalid_option',
    message: name === 'limit'
      ? `--limit must be an integer from 1 to ${MAX_DISCOVERY_LIMIT}.`
      : '--offset must be a non-negative integer.',
    path: `--${name}`,
  };
}

export function discoveryPaginationIssue(
  flags: ReadonlyMap<string, FlagValue>,
): CliIssue | undefined {
  if (flagBoolean(flags, 'all') && (flags.has('limit') || flags.has('offset'))) {
    return {
      code: 'invalid_option',
      message: '--all cannot be combined with --limit or --offset.',
      path: '--all',
    };
  }
  return integerIssue(flags, 'limit') ?? integerIssue(flags, 'offset');
}

export function readDiscoveryPagination(
  flags: ReadonlyMap<string, FlagValue>,
): DiscoveryPagination {
  return {
    all: flagBoolean(flags, 'all'),
    limit: Number(flagString(flags, 'limit') ?? DEFAULT_DISCOVERY_LIMIT),
    offset: Number(flagString(flags, 'offset') ?? 0),
  };
}

function candidateSort<T extends DiscoveryItemSummary>(
  left: DiscoveryCandidate<T>,
  right: DiscoveryCandidate<T>,
): number {
  return compareText(normalized(left.summary.typeName), normalized(right.summary.typeName))
    || compareText(normalized(left.summary.name), normalized(right.summary.name))
    || compareText(normalized(left.summary.itemId), normalized(right.summary.itemId));
}

function suggestionDistance<T extends DiscoveryItemSummary>(
  query: string,
  candidate: DiscoveryCandidate<T>,
): number {
  return Math.min(
    editDistance(query, candidate.summary.itemId),
    editDistance(query, candidate.internalName),
    editDistance(query, candidate.summary.name),
  );
}

export function discoverItems<T extends DiscoveryItemSummary>(
  candidates: readonly DiscoveryCandidate<T>[],
  options: { readonly query?: string; readonly pagination: DiscoveryPagination },
): DiscoveryResult<T> {
  const query = normalized(options.query ?? '');
  const sorted = [...candidates].sort(candidateSort);
  const matches = query
    ? sorted.filter((candidate) => [
        candidate.summary.itemId,
        candidate.internalName,
        candidate.summary.name,
      ].some((value) => normalized(value).includes(query)))
    : sorted;
  const offset = options.pagination.all ? 0 : options.pagination.offset;
  const selected = options.pagination.all
    ? matches
    : matches.slice(offset, offset + options.pagination.limit);
  const hasMore = !options.pagination.all && offset + selected.length < matches.length;
  const suggestions = query && matches.length === 0
    ? sorted
        .map((candidate) => ({ candidate, distance: suggestionDistance(query, candidate) }))
        .sort((left, right) => left.distance - right.distance || candidateSort(left.candidate, right.candidate))
        .slice(0, 5)
        .map(({ candidate }) => ({
          itemId: candidate.summary.itemId,
          typeName: candidate.summary.typeName,
          name: candidate.summary.name,
        }))
    : [];
  return {
    items: selected.map((candidate) => candidate.summary),
    page: {
      limit: options.pagination.all ? null : options.pagination.limit,
      offset,
      returned: selected.length,
      total: matches.length,
      hasMore,
      nextOffset: hasMore ? offset + selected.length : null,
    },
    ...(suggestions.length > 0 ? { suggestions } : {}),
  };
}
