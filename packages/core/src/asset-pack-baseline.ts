import type { ItemDefinition } from './types.js';

export function assetPackDefinitionProjection(item: ItemDefinition): unknown {
  const {
    credits: _credits,
    itemId: _itemId,
    sourcePath: _sourcePath,
    ...definition
  } = item;
  return recursivelySortedProjection(definition);
}

export function assetPackCreditProjection(item: ItemDefinition): unknown {
  return recursivelySortedProjection(item.credits);
}

function recursivelySortedProjection(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => recursivelySortedProjection(entry));
  }
  if (!isRecord(value)) {
    return value;
  }

  const sortedEntries = Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, recursivelySortedProjection(entry)] as const);

  return Object.fromEntries(sortedEntries);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
