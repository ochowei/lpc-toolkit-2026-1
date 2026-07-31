import { BODY_TYPES } from './constants.js';
import type { BodyType, Selection, Selections, TypeName } from './types.js';

export const SELECTION_SCHEMA_V1 = 'lpc-toolkit.selection.v1' as const;
export const SELECTION_SCHEMA_V2 = 'lpc-toolkit.selection.v2' as const;
/** Canonical schema emitted by all current writers. */
export const SELECTION_SCHEMA = SELECTION_SCHEMA_V2;
const BODY_TYPE_SET: ReadonlySet<string> = new Set(BODY_TYPES);

export type SelectionSchema =
  | typeof SELECTION_SCHEMA_V1
  | typeof SELECTION_SCHEMA_V2;

export interface SelectionJsonItem {
  readonly name: string;
  readonly variant?: string;
  readonly recolor?: string;
  readonly channelRecolors?: Readonly<Record<TypeName, string>>;
}

export interface SelectionJson {
  readonly schema: typeof SELECTION_SCHEMA_V2;
  readonly name?: string;
  readonly bodyType: BodyType;
  readonly items: Readonly<Record<TypeName, SelectionJsonItem>>;
}

export interface ParsedSelectionJson {
  readonly metadata: {
    readonly schema: SelectionSchema;
    readonly name?: string;
  };
  readonly selections: Selections;
}

export class SelectionJsonError extends Error {
  constructor(message: string, readonly path?: string) {
    super(message);
    this.name = 'SelectionJsonError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  record: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record).sort()) {
    if (!allowedSet.has(key)) {
      const fieldPath = `${path}.${key}`;
      throw new SelectionJsonError(`Unknown selection field at ${fieldPath}.`, fieldPath);
    }
  }
}

function parseChannelRecolors(
  value: unknown,
  path: string,
): Readonly<Record<TypeName, string>> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new SelectionJsonError(
      `Selection channel recolors at ${path} must be an object.`,
      path,
    );
  }

  const entries: Array<readonly [TypeName, string]> = [];
  for (const [channelId, recolor] of Object.entries(value)) {
    const entryPath = `${path}.${channelId}`;
    if (channelId.length === 0 || channelId === 'primary') {
      throw new SelectionJsonError(`Invalid secondary channel id at ${entryPath}.`, entryPath);
    }
    if (typeof recolor !== 'string' || recolor.length === 0) {
      throw new SelectionJsonError(
        `Selection channel recolor at ${entryPath} must be a non-empty string.`,
        entryPath,
      );
    }
    entries.push([channelId, recolor]);
  }
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function parseSelectionJson(value: unknown): ParsedSelectionJson {
  if (!isRecord(value)) throw new SelectionJsonError('Selection JSON must be an object.', '$');
  const schema = value.schema;
  if (schema !== SELECTION_SCHEMA_V1 && schema !== SELECTION_SCHEMA_V2) {
    throw new SelectionJsonError(
      `Unsupported selection schema: ${String(schema)}`,
      '$.schema',
    );
  }
  const strictV2 = schema === SELECTION_SCHEMA_V2;
  if (strictV2) {
    assertExactKeys(value, ['schema', 'name', 'bodyType', 'items'], '$');
  }
  if (
    Object.prototype.hasOwnProperty.call(value, 'name')
    && typeof value.name !== 'string'
  ) {
    throw new SelectionJsonError('Selection JSON name must be a string.', '$.name');
  }
  if (typeof value.bodyType !== 'string') {
    throw new SelectionJsonError('Selection JSON bodyType must be a string.', '$.bodyType');
  }
  if (strictV2 && !BODY_TYPE_SET.has(value.bodyType)) {
    throw new SelectionJsonError(
      'Selection JSON bodyType at $.bodyType is unsupported.',
      '$.bodyType',
    );
  }
  if (!isRecord(value.items)) {
    throw new SelectionJsonError('Selection JSON items must be an object.', '$.items');
  }

  const itemEntries: Array<readonly [TypeName, Selection]> = [];
  for (const [typeName, raw] of Object.entries(value.items)) {
    const itemPath = `$.items.${typeName}`;
    if (!isRecord(raw) || typeof raw.name !== 'string') {
      throw new SelectionJsonError(
        `Selection item ${typeName} must include a string name.`,
        `${itemPath}.name`,
      );
    }
    if (strictV2) {
      if (typeName.length === 0) {
        throw new SelectionJsonError(
          `Selection item type must be non-empty at ${itemPath}.`,
          itemPath,
        );
      }
      assertExactKeys(
        raw,
        ['name', 'variant', 'recolor', 'channelRecolors'],
        itemPath,
      );
    }
    if (raw.variant !== undefined && typeof raw.variant !== 'string') {
      throw new SelectionJsonError(
        `Selection item ${typeName} variant must be a string.`,
        `${itemPath}.variant`,
      );
    }
    if (raw.recolor !== undefined && typeof raw.recolor !== 'string') {
      throw new SelectionJsonError(
        `Selection item ${typeName} recolor must be a string.`,
        `${itemPath}.recolor`,
      );
    }
    const channelRecolors = strictV2
      ? parseChannelRecolors(raw.channelRecolors, `${itemPath}.channelRecolors`)
      : undefined;
    itemEntries.push([typeName, {
      typeName,
      name: raw.name,
      ...(typeof raw.variant === 'string' ? { variant: raw.variant } : {}),
      ...(typeof raw.recolor === 'string' ? { recolor: raw.recolor } : {}),
      ...(channelRecolors ? { channelRecolors } : {}),
    }]);
  }

  const items = Object.fromEntries(itemEntries);
  return {
    metadata: {
      schema,
      ...(typeof value.name === 'string' ? { name: value.name } : {}),
    },
    selections: { bodyType: value.bodyType, items },
  };
}

export function selectionJsonFromCore(
  selections: Selections,
  name?: string,
): SelectionJson {
  const itemEntries: Array<readonly [TypeName, SelectionJsonItem]> = [];
  for (const [typeName, selection] of Object.entries(selections.items)) {
    const channelRecolors = parseChannelRecolors(
      selection.channelRecolors,
      `$.items.${typeName}.channelRecolors`,
    );
    itemEntries.push([typeName, {
      name: selection.name,
      ...(selection.variant ? { variant: selection.variant } : {}),
      ...(selection.recolor ? { recolor: selection.recolor } : {}),
      ...(channelRecolors ? { channelRecolors } : {}),
    }]);
  }
  const items = Object.fromEntries(itemEntries);
  return {
    schema: SELECTION_SCHEMA_V2,
    ...(name ? { name } : {}),
    bodyType: selections.bodyType,
    items,
  };
}
