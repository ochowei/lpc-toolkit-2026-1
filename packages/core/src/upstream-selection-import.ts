import { parseHash } from './hash.js';
import {
  getRecolorVariantsForType,
  itemSupportsSelectionType,
} from './recolor-resolve.js';
import {
  parseSelectionJson,
  SELECTION_SCHEMA,
  selectionJsonFromCore,
  type ParsedSelectionJson,
  type SelectionJson,
} from './selection-document.js';
import type {
  Catalog,
  ItemDefinition,
  PaletteMetadata,
  Selection,
  Selections,
  TypeName,
} from './types.js';

export type SelectionDocumentSource =
  | 'canonical'
  | 'upstream-v1'
  | 'upstream-v2';

export interface SelectionDocumentImportContext {
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
}

export interface ImportedSelectionDocument {
  readonly source: SelectionDocumentSource;
  readonly selection: SelectionJson;
  readonly parsed: ParsedSelectionJson;
}

export type SelectionDocumentErrorCode =
  | 'invalid_selection_json'
  | 'unsupported_selection_format'
  | 'ambiguous_selection_format'
  | 'unsupported_selection_schema'
  | 'unsupported_upstream_version'
  | 'invalid_upstream_selection'
  | 'unknown_upstream_item'
  | 'invalid_selection_variant'
  | 'invalid_selection_recolor';

export class SelectionDocumentError extends Error {
  constructor(
    readonly code: SelectionDocumentErrorCode,
    message: string,
    readonly path?: string,
  ) {
    super(message);
    this.name = 'SelectionDocumentError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizedOptionalString(
  value: unknown,
  path: string,
): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new SelectionDocumentError(
      'invalid_upstream_selection',
      `${path} must be a string, null, or omitted.`,
      path,
    );
  }
  return value;
}

function resolveByName(
  typeName: TypeName,
  name: string,
  catalog: Catalog,
): ItemDefinition | undefined {
  for (const item of catalog.byItemId.values()) {
    if (
      item.name === name &&
      itemSupportsSelectionType(item, typeName)
    ) {
      return item;
    }
  }
  return undefined;
}

function itemSupportsBodyType(
  item: ItemDefinition,
  bodyType: string,
): boolean {
  for (let layerNumber = 1; layerNumber < 10; layerNumber++) {
    const layer = item[`layer_${layerNumber}`];
    if (!layer) break;
    if (typeof layer[bodyType] === 'string') return true;
  }
  return false;
}

function selectionPath(
  source: SelectionDocumentSource,
  typeName: TypeName,
): string {
  if (source === 'canonical') return `items.${typeName}`;
  if (source === 'upstream-v1') return 'url';
  return `selections.${typeName}`;
}

function validateSelection(
  typeName: TypeName,
  selection: Selection,
  bodyType: string,
  context: SelectionDocumentImportContext,
  source: SelectionDocumentSource,
): void {
  const path = selectionPath(source, typeName);
  const item = resolveByName(typeName, selection.name, context.catalog);
  if (!item) {
    throw new SelectionDocumentError(
      'unknown_upstream_item',
      `Unknown ${source} item "${selection.name}" for type "${typeName}".`,
      path,
    );
  }

  if (
    selection.variant &&
    (item.type_name !== typeName || !item.variants?.includes(selection.variant))
  ) {
    throw new SelectionDocumentError(
      'invalid_selection_variant',
      `Invalid variant "${selection.variant}" for "${typeName}/${item.name}".`,
      `${path}.variant`,
    );
  }

  if (selection.recolor) {
    const recolors = getRecolorVariantsForType(
      item,
      context.palettes,
      typeName,
    );
    if (!recolors.includes(selection.recolor)) {
      throw new SelectionDocumentError(
        'invalid_selection_recolor',
        `Invalid recolor "${selection.recolor}" for "${typeName}/${item.name}".`,
        `${path}.recolor`,
      );
    }
  }

  if (
    item.type_name === typeName &&
    !itemSupportsBodyType(item, bodyType)
  ) {
    throw new SelectionDocumentError(
      'invalid_upstream_selection',
      `Item "${typeName}/${item.name}" is not compatible with body type "${bodyType}".`,
      path,
    );
  }
}

function validateSelections(
  selections: Selections,
  context: SelectionDocumentImportContext,
  source: SelectionDocumentSource,
): void {
  for (const [typeName, selection] of Object.entries(selections.items)) {
    validateSelection(
      typeName,
      selection,
      selections.bodyType,
      context,
      source,
    );
  }
}

function importedDocument(
  source: SelectionDocumentSource,
  selections: Selections,
  context: SelectionDocumentImportContext,
  name?: string,
): ImportedSelectionDocument {
  validateSelections(selections, context, source);
  const selection = selectionJsonFromCore(selections, name);
  return {
    source,
    selection,
    parsed: parseSelectionJson(selection),
  };
}

function importV2(
  record: Record<string, unknown>,
  context: SelectionDocumentImportContext,
): ImportedSelectionDocument {
  if (typeof record.bodyType !== 'string' || record.bodyType.length === 0) {
    throw new SelectionDocumentError(
      'invalid_upstream_selection',
      'Upstream version 2 bodyType must be a non-empty string.',
      'bodyType',
    );
  }
  if (!isRecord(record.selections)) {
    throw new SelectionDocumentError(
      'invalid_upstream_selection',
      'Upstream version 2 selections must be an object.',
      'selections',
    );
  }

  const items: Record<TypeName, Selection> = {};
  for (const [typeName, rawSelection] of Object.entries(record.selections)) {
    const path = `selections.${typeName}`;
    if (!isRecord(rawSelection)) {
      throw new SelectionDocumentError(
        'invalid_upstream_selection',
        `${path} must be an object.`,
        path,
      );
    }
    if (
      typeof rawSelection.itemId !== 'string' ||
      rawSelection.itemId.length === 0
    ) {
      throw new SelectionDocumentError(
        'invalid_upstream_selection',
        `${path}.itemId must be a non-empty string.`,
        `${path}.itemId`,
      );
    }

    const item = context.catalog.byItemId.get(rawSelection.itemId);
    if (!item || !itemSupportsSelectionType(item, typeName)) {
      throw new SelectionDocumentError(
        'unknown_upstream_item',
        `Unknown upstream item "${rawSelection.itemId}" for type "${typeName}".`,
        `${path}.itemId`,
      );
    }

    const variant = normalizedOptionalString(
      rawSelection.variant,
      `${path}.variant`,
    );
    const recolor = normalizedOptionalString(
      rawSelection.recolor,
      `${path}.recolor`,
    );
    items[typeName] = {
      typeName,
      name: item.name,
      ...(variant ? { variant } : {}),
      ...(recolor ? { recolor } : {}),
    };
  }

  return importedDocument(
    'upstream-v2',
    { bodyType: record.bodyType, items },
    context,
  );
}

function hasValidPercentEncoding(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    if (value[index] !== '%') continue;
    const escape = value.slice(index + 1, index + 3);
    if (!/^[0-9a-f]{2}$/i.test(escape)) return false;
    index += 2;
  }
  return true;
}

function isValidIpv4(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => {
    if (!/^(?:0|[1-9][0-9]{0,2})$/.test(part)) return false;
    return Number(part) <= 255;
  });
}

function isValidIpv6(value: string): boolean {
  if (!value.includes(':') || value.includes(':::')) return false;
  const compression = value.indexOf('::');
  if (compression !== value.lastIndexOf('::')) return false;

  const tokens = value
    .split('::')
    .flatMap((side) => side === '' ? [] : side.split(':'));
  let groupCount = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index] ?? '';
    if (token.includes('.')) {
      if (index !== tokens.length - 1 || !isValidIpv4(token)) return false;
      groupCount += 2;
    } else {
      if (!/^[0-9a-f]{1,4}$/i.test(token)) return false;
      groupCount += 1;
    }
  }
  return compression >= 0 ? groupCount < 8 : groupCount === 8;
}

function isValidIpLiteral(value: string): boolean {
  if (/^v[0-9a-f]+\.[a-z0-9._~!$&'()*+,;=:-]+$/i.test(value)) {
    return true;
  }
  return isValidIpv6(value);
}

function isValidPort(value: string): boolean {
  if (!/^[0-9]+$/.test(value)) return false;
  return Number(value) <= 65_535;
}

function isValidAuthority(value: string): boolean {
  const atIndex = value.lastIndexOf('@');
  if (atIndex >= 0) {
    if (atIndex === 0 || value.indexOf('@') !== atIndex) return false;
    const userInfo = value.slice(0, atIndex);
    if (!/^[a-z0-9._~!$&'()*+,;=:%-]+$/i.test(userInfo)) return false;
    value = value.slice(atIndex + 1);
  }
  if (value.length === 0) return false;

  if (value.startsWith('[')) {
    const closeIndex = value.indexOf(']');
    if (closeIndex < 0 || !isValidIpLiteral(value.slice(1, closeIndex))) {
      return false;
    }
    const suffix = value.slice(closeIndex + 1);
    if (suffix === '') return true;
    return suffix.startsWith(':') && isValidPort(suffix.slice(1));
  }

  const colonIndex = value.lastIndexOf(':');
  let host = value;
  if (colonIndex >= 0) {
    if (value.indexOf(':') !== colonIndex) return false;
    host = value.slice(0, colonIndex);
    if (!isValidPort(value.slice(colonIndex + 1))) return false;
  }
  return (
    host.length > 0 &&
    /^[a-z0-9._~!$&'()*+,;=%-]+$/i.test(host)
  );
}

function hasValidHashComponents(hash: string): boolean {
  const components = hash.slice(1).split('&');
  for (let index = 0; index < components.length; index++) {
    const component = components[index] ?? '';
    const equalsIndex = component.indexOf('=');
    if (
      component.length === 0 ||
      equalsIndex <= 0 ||
      equalsIndex === component.length - 1
    ) {
      return false;
    }
    let rawKey = component.slice(0, equalsIndex);
    if (index === 0 && rawKey.startsWith('?')) rawKey = rawKey.slice(1);
    const rawValue = component.slice(equalsIndex + 1);
    if (rawKey.length === 0) return false;
    try {
      if (
        decodeURIComponent(rawKey).length === 0 ||
        decodeURIComponent(rawValue).length === 0
      ) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

function absoluteHttpHash(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (
    /[\u0000-\u0020\u007f-\uffff\\]/.test(value) ||
    !hasValidPercentEncoding(value)
  ) {
    return undefined;
  }
  const scheme = value.match(/^https?:\/\//i)?.[0];
  if (!scheme) return undefined;

  const authorityStart = scheme.length;
  const authorityEndOffset = value
    .slice(authorityStart)
    .search(/[/?#]/);
  const authorityEnd = authorityEndOffset < 0
    ? value.length
    : authorityStart + authorityEndOffset;
  if (!isValidAuthority(value.slice(authorityStart, authorityEnd))) {
    return undefined;
  }

  const suffix = value.slice(authorityEnd);
  if (!/^[a-z0-9\-._~!$&'()*+,;=:@/?%#]*$/i.test(suffix)) {
    return undefined;
  }
  const hashIndex = value.indexOf('#', authorityEnd);
  if (
    hashIndex < 0 ||
    hashIndex === value.length - 1 ||
    hashIndex !== value.lastIndexOf('#')
  ) {
    return undefined;
  }
  const hash = value.slice(hashIndex);
  return hasValidHashComponents(hash) ? hash : undefined;
}

function importV1(
  record: Record<string, unknown>,
  context: SelectionDocumentImportContext,
): ImportedSelectionDocument {
  const hash = absoluteHttpHash(record.url);
  if (!hash) {
    throw new SelectionDocumentError(
      'invalid_upstream_selection',
      'Upstream version 1 url must be an absolute http or https URL with a non-empty hash.',
      'url',
    );
  }

  const result = parseHash(hash, context.catalog, context.palettes);
  const warning = result.warnings[0];
  if (warning) {
    throw new SelectionDocumentError(
      'invalid_upstream_selection',
      `Could not resolve URL hash selection "${warning.key}=${warning.value}": ${warning.reason}.`,
      'url',
    );
  }
  return importedDocument('upstream-v1', result.selections, context);
}

function importCanonical(
  record: Record<string, unknown>,
  context: SelectionDocumentImportContext,
): ImportedSelectionDocument {
  if (record.schema !== SELECTION_SCHEMA) {
    throw new SelectionDocumentError(
      'unsupported_selection_schema',
      `Unsupported selection schema: ${String(record.schema)}`,
      'schema',
    );
  }

  let parsed: ParsedSelectionJson;
  try {
    parsed = parseSelectionJson(record);
  } catch (error) {
    throw new SelectionDocumentError(
      'invalid_selection_json',
      error instanceof Error ? error.message : String(error),
    );
  }
  return importedDocument(
    'canonical',
    parsed.selections,
    context,
    parsed.metadata.name,
  );
}

export function importSelectionDocument(
  value: unknown,
  context: SelectionDocumentImportContext,
): ImportedSelectionDocument {
  if (!isRecord(value)) {
    throw new SelectionDocumentError(
      'unsupported_selection_format',
      'Selection document must be a JSON object.',
    );
  }
  const hasSchema = Object.prototype.hasOwnProperty.call(value, 'schema');
  const hasVersion = Object.prototype.hasOwnProperty.call(value, 'version');
  if (hasSchema && hasVersion) {
    throw new SelectionDocumentError(
      'ambiguous_selection_format',
      'Selection document cannot contain both schema and version.',
    );
  }
  if (hasSchema) return importCanonical(value, context);
  if (value.version === 1) return importV1(value, context);
  if (value.version === 2) return importV2(value, context);
  if (hasVersion) {
    throw new SelectionDocumentError(
      'unsupported_upstream_version',
      `Unsupported upstream selection version: ${String(value.version)}`,
      'version',
    );
  }
  throw new SelectionDocumentError(
    'unsupported_selection_format',
    'Selection document must contain schema or version.',
  );
}
