import type { BodyType, Selection, Selections, TypeName } from '@lpc-toolkit/core';

export const SELECTION_SCHEMA = 'lpc-toolkit.selection.v1';

export interface SelectionJsonItem {
  readonly name: string;
  readonly variant?: string;
  readonly recolor?: string;
}

export interface SelectionJson {
  readonly schema: typeof SELECTION_SCHEMA;
  readonly name?: string;
  readonly bodyType: BodyType;
  readonly items: Readonly<Record<TypeName, SelectionJsonItem>>;
}

export interface ParsedSelectionJson {
  readonly metadata: {
    readonly schema: typeof SELECTION_SCHEMA;
    readonly name?: string;
  };
  readonly selections: Selections;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseSelectionJson(value: unknown): ParsedSelectionJson {
  if (!isRecord(value)) throw new Error('Selection JSON must be an object.');
  if (value.schema !== SELECTION_SCHEMA) {
    throw new Error(`Unsupported selection schema: ${String(value.schema)}`);
  }
  if (typeof value.bodyType !== 'string') {
    throw new Error('Selection JSON bodyType must be a string.');
  }
  if (!isRecord(value.items)) {
    throw new Error('Selection JSON items must be an object.');
  }

  const items: Record<TypeName, Selection> = {};
  for (const [typeName, raw] of Object.entries(value.items)) {
    if (!isRecord(raw) || typeof raw.name !== 'string') {
      throw new Error(`Selection item ${typeName} must include a string name.`);
    }
    items[typeName] = {
      typeName,
      name: raw.name,
      ...(typeof raw.variant === 'string' ? { variant: raw.variant } : {}),
      ...(typeof raw.recolor === 'string' ? { recolor: raw.recolor } : {}),
    };
  }

  return {
    metadata: {
      schema: SELECTION_SCHEMA,
      ...(typeof value.name === 'string' ? { name: value.name } : {}),
    },
    selections: {
      bodyType: value.bodyType,
      items,
    },
  };
}

export function selectionJsonFromCore(
  selections: Selections,
  name?: string,
): SelectionJson {
  const items: Record<TypeName, SelectionJsonItem> = {};
  for (const [typeName, selection] of Object.entries(selections.items)) {
    items[typeName] = {
      name: selection.name,
      ...(selection.variant ? { variant: selection.variant } : {}),
      ...(selection.recolor ? { recolor: selection.recolor } : {}),
    };
  }
  return {
    schema: SELECTION_SCHEMA,
    ...(name ? { name } : {}),
    bodyType: selections.bodyType,
    items,
  };
}
