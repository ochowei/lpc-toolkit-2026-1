export interface CliIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly details?: {
    readonly suggestions?: readonly string[];
    readonly available?: readonly string[];
  };
}

export interface CliResponse<T> {
  readonly ok: boolean;
  readonly command: string;
  readonly data: T | null;
  readonly warnings: readonly CliIssue[];
  readonly errors: readonly CliIssue[];
}

export function commandOk<T>(
  command: string,
  data: T,
  warnings: readonly CliIssue[] = [],
): CliResponse<T> {
  return { ok: true, command, data, warnings, errors: [] };
}

export function commandError(
  command: string,
  error: CliIssue,
  warnings: readonly CliIssue[] = [],
): CliResponse<null> {
  return { ok: false, command, data: null, warnings, errors: [error] };
}

export function formatJsonResponse(response: CliResponse<unknown>): string {
  return `${JSON.stringify(response, null, 2)}\n`;
}

export function humanIssue(issue: CliIssue): string {
  return issue.path
    ? `${issue.code}: ${issue.message} (${issue.path})`
    : `${issue.code}: ${issue.message}`;
}

export function formatProgress(phase: string, message: string): string {
  return `${phase}: ${message}\n`;
}

type JsonRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function nullableStringValue(record: JsonRecord, key: string): string | null | undefined {
  const value = record[key];
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

function numberValue(record: JsonRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' ? value : undefined;
}

function stringArrayValue(record: JsonRecord, key: string): readonly string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === 'string');
  return strings.length === value.length ? strings : undefined;
}

function recordArrayValue(record: JsonRecord, key: string): readonly JsonRecord[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) return undefined;
  const records = value.filter(isRecord);
  return records.length === value.length ? records : undefined;
}

function formatCsv(values: readonly string[] | undefined): string {
  return values && values.length > 0 ? values.join(', ') : 'none';
}

function formatWarnings(warnings: readonly CliIssue[]): string {
  if (warnings.length === 0) return '';
  const lines = warnings.map((warning) => `- ${humanIssue(warning)}`);
  return `\nWarnings (${warnings.length}):\n${lines.join('\n')}\n`;
}

function catalogItemLabel(item: JsonRecord): string | undefined {
  const typeName = stringValue(item, 'typeName');
  const name = stringValue(item, 'name');
  const itemId = stringValue(item, 'itemId');
  if (!typeName || !name || !itemId) return undefined;
  return `${typeName}/${name} [${itemId}]`;
}

function formatCatalogItemDetails(item: JsonRecord, indent: string): readonly string[] {
  return [
    `${indent}variants: ${formatCsv(stringArrayValue(item, 'variants'))}`,
    `${indent}recolors: ${formatCsv(stringArrayValue(item, 'recolors'))}`,
    `${indent}animations: ${formatCsv(stringArrayValue(item, 'animations'))}`,
  ];
}

function formatCatalogTypes(data: JsonRecord): string | undefined {
  const typeNames = stringArrayValue(data, 'typeNames');
  const count = numberValue(data, 'count') ?? typeNames?.length;
  if (!typeNames || typeof count !== 'number') return undefined;
  const lines = typeNames.map((typeName) => `- ${typeName}`);
  return `Catalog types (${count})\n${lines.join('\n')}\n`;
}

function formatCatalogItems(data: JsonRecord): string | undefined {
  const items = recordArrayValue(data, 'items');
  if (!items) return undefined;
  const lines = items.flatMap((item) => {
    const label = catalogItemLabel(item);
    if (!label) return [];
    return [`- ${label}`, ...formatCatalogItemDetails(item, '  ')];
  });
  return `Catalog items (${items.length})\n${lines.join('\n')}\n`;
}

function formatCatalogItem(data: JsonRecord): string | undefined {
  const item = data['item'];
  if (!isRecord(item)) return undefined;
  const label = catalogItemLabel(item);
  if (!label) return undefined;
  return `Catalog item: ${label}\n${formatCatalogItemDetails(item, '').join('\n')}\n`;
}

function formatTokenEncode(data: JsonRecord): string | undefined {
  const token = stringValue(data, 'token');
  return token ? `${token}\n` : undefined;
}

function formatSelectionOrOut(data: JsonRecord, writtenLabel: string): string | undefined {
  const out = nullableStringValue(data, 'out');
  if (typeof out === 'string') return `${writtenLabel} ${out}\n`;
  const selection = data['selection'];
  if (!isRecord(selection)) return undefined;
  return `${JSON.stringify(selection, null, 2)}\n`;
}

function formatPresetList(data: JsonRecord): string | undefined {
  const presets = recordArrayValue(data, 'presets');
  if (!presets) return undefined;
  const lines = presets.flatMap((preset) => {
    const id = stringValue(preset, 'id');
    if (!id) return [];
    const labelKey = stringValue(preset, 'labelKey');
    const emoji = stringValue(preset, 'emoji');
    const suffix = [labelKey, emoji].filter((part): part is string => Boolean(part)).join(' ');
    return suffix ? [`- ${id} (${suffix})`] : [`- ${id}`];
  });
  return `Presets (${presets.length})\n${lines.join('\n')}\n`;
}

function formatRender(data: JsonRecord): string | undefined {
  const artifacts = recordArrayValue(data, 'artifacts');
  const metadataPath = stringValue(data, 'metadataPath');
  if (!artifacts || !metadataPath) return undefined;
  const lines = artifacts.flatMap((artifact) => {
    const type = stringValue(artifact, 'type');
    const artifactPath = stringValue(artifact, 'path');
    return type && artifactPath ? [`- ${type}: ${artifactPath}`] : [];
  });
  return `Render complete. Artifacts (${artifacts.length})\n${lines.join('\n')}\nMetadata: ${metadataPath}\n`;
}

function formatHumanData(response: CliResponse<unknown>): string | undefined {
  const data = response.data;
  if (!isRecord(data)) return undefined;

  switch (response.command) {
    case 'catalog types':
      return formatCatalogTypes(data);
    case 'catalog items':
      return formatCatalogItems(data);
    case 'catalog item':
      return formatCatalogItem(data);
    case 'token encode':
      return formatTokenEncode(data);
    case 'token decode':
      return formatSelectionOrOut(data, 'Selection written to');
    case 'preset list':
      return formatPresetList(data);
    case 'preset materialize':
      return formatSelectionOrOut(data, 'Preset selection written to');
    case 'render':
    case 'preset render':
      return formatRender(data);
    case 'selection validate':
      return 'Selection is valid.\n';
    default:
      return undefined;
  }
}

export function formatHumanResponse(
  response: CliResponse<unknown>,
  fallbackSuccess: string,
): string {
  if (!response.ok) {
    return `${response.errors.map(humanIssue).join('\n')}\n`;
  }

  return `${formatHumanData(response) ?? fallbackSuccess}${formatWarnings(response.warnings)}`;
}
