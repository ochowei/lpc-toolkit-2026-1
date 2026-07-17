import path from 'node:path';

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
  const summary = issue.path
    ? `${issue.code}: ${issue.message} (${issue.path})`
    : `${issue.code}: ${issue.message}`;
  const suggestions = issue.details?.suggestions;
  const available = issue.details?.available;
  return [
    summary,
    ...(suggestions && suggestions.length > 0
      ? [`Did you mean: ${suggestions.join(', ')}`]
      : []),
    ...(available && available.length > 0
      ? [`Available: ${available.join(', ')}`]
      : []),
  ].join('\n');
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
  const compatibleAnimations = stringArrayValue(item, 'compatibleAnimations');
  const unsupportedAnimations = stringArrayValue(item, 'unsupportedAnimations');
  return [
    `${indent}supported body types: ${formatCsv(stringArrayValue(item, 'supportedBodyTypes'))}`,
    `${indent}variants: ${formatCsv(stringArrayValue(item, 'variants'))}`,
    `${indent}recolors: ${formatCsv(stringArrayValue(item, 'recolors'))}`,
    `${indent}animations: ${formatCsv(stringArrayValue(item, 'animations'))}`,
    ...(compatibleAnimations === undefined ? [] : [
      `${indent}compatible standard animations: ${formatCsv(compatibleAnimations)}`,
    ]),
    ...(unsupportedAnimations === undefined ? [] : [
      `${indent}unsupported standard animations: ${formatCsv(unsupportedAnimations)}`,
    ]),
    `${indent}licenses: ${formatCsv(stringArrayValue(item, 'licenses'))}`,
    `${indent}credit count: ${numberValue(item, 'creditCount') ?? 0}`,
  ];
}

function formatDiscoverySuffix(data: JsonRecord): string {
  const page = data['page'];
  if (!isRecord(page)) return '';
  const hasMore = page['hasMore'];
  const nextOffset = page['nextOffset'];
  if (hasMore !== true || typeof nextOffset !== 'number') return '';
  return `More results available; rerun with --offset ${nextOffset}.\n`;
}

function formatDiscoveryCount(
  label: string,
  data: JsonRecord,
  fallbackReturned: number,
): string {
  const page = data['page'];
  if (!isRecord(page)) return `${label} (${fallbackReturned})`;
  const returned = numberValue(page, 'returned');
  const total = numberValue(page, 'total');
  return typeof returned === 'number' && typeof total === 'number'
    ? `${label} (${returned} of ${total})`
    : `${label} (${fallbackReturned})`;
}

function formatDiscoverySuggestions(data: JsonRecord): string {
  const suggestions = recordArrayValue(data, 'suggestions');
  if (!suggestions || suggestions.length === 0) return '';
  const lines = suggestions.flatMap((suggestion) => {
    const itemId = stringValue(suggestion, 'itemId');
    const typeName = stringValue(suggestion, 'typeName');
    const name = stringValue(suggestion, 'name');
    return itemId && typeName && name ? [`- ${typeName}/${name} [${itemId}]`] : [];
  });
  return lines.length > 0 ? `Suggestions:\n${lines.join('\n')}\n` : '';
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
  return `${formatDiscoveryCount('Catalog items', data, items.length)}\n${lines.join('\n')}\n${formatDiscoverySuggestions(data)}${formatDiscoverySuffix(data)}`;
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

function formatCharacterList(data: JsonRecord): string | undefined {
  const characters = recordArrayValue(data, 'characters');
  if (!characters) return undefined;
  const lines = characters.flatMap((character) => {
    const name = stringValue(character, 'name');
    return name ? [`- ${name}`] : [];
  });
  return `Characters (${characters.length})\n${lines.join('\n')}\n`;
}

function formatCharacterShow(data: JsonRecord): string | undefined {
  const selection = data['selection'];
  const characterPath = stringValue(data, 'path');
  const valid = data['valid'];
  if (!isRecord(selection) || !characterPath || typeof valid !== 'boolean') return undefined;
  const lines = [
    `Path: ${characterPath}`,
    `Status: ${valid ? 'valid' : 'invalid'}`,
    'Selection:',
    JSON.stringify(selection, null, 2),
  ];
  const validation = data['validation'];
  const errors = isRecord(validation) ? recordArrayValue(validation, 'errors') : undefined;
  if (!valid && errors && errors.length > 0) {
    lines.push(
      `Validation issues (${errors.length}):`,
      ...errors.map((error) => {
        const code = stringValue(error, 'code') ?? 'validation_error';
        const message = stringValue(error, 'message') ?? 'Invalid selection.';
        const issuePath = stringValue(error, 'path');
        return `- ${code}: ${message}${issuePath ? ` (${issuePath})` : ''}`;
      }),
    );
  }
  return `${lines.join('\n')}\n`;
}

function characterDisplayName(data: JsonRecord): string | undefined {
  const selection = data['selection'];
  const metadataName = isRecord(selection) ? stringValue(selection, 'name') : undefined;
  if (metadataName) return metadataName;
  const characterPath = stringValue(data, 'path');
  return characterPath ? path.parse(characterPath).name : undefined;
}

function formatCharacterCreate(data: JsonRecord): string | undefined {
  const name = characterDisplayName(data);
  const characterPath = stringValue(data, 'path');
  return name && characterPath ? `Created ${name}: ${characterPath}\n` : undefined;
}

function formatCharacterSearch(data: JsonRecord): string | undefined {
  const items = recordArrayValue(data, 'items');
  if (!items) return undefined;
  const lines = items.flatMap((item) => {
    const label = catalogItemLabel(item);
    if (!label) return [];
    return [`- ${label}`, ...formatCatalogItemDetails(item, '  ')];
  });
  return `${formatDiscoveryCount('Compatible items', data, items.length)}\n${lines.join('\n')}\n${formatDiscoverySuggestions(data)}${formatDiscoverySuffix(data)}`;
}

function formatCharacterSet(data: JsonRecord): string | undefined {
  const name = characterDisplayName(data);
  const typeName = stringValue(data, 'typeName');
  const item = data['item'];
  const itemName = isRecord(item) ? stringValue(item, 'name') : undefined;
  return name && typeName && itemName
    ? `Updated ${name}: ${typeName} = ${itemName}\n`
    : undefined;
}

function formatCharacterRemove(data: JsonRecord): string | undefined {
  const name = characterDisplayName(data);
  const typeName = stringValue(data, 'typeName');
  return name && typeName ? `Updated ${name}: removed ${typeName}\n` : undefined;
}

function formatCharacterValidate(data: JsonRecord): string | undefined {
  const name = characterDisplayName(data);
  return name ? `Character ${name} is valid.\n` : undefined;
}

function formatRender(data: JsonRecord, label = 'Render'): string | undefined {
  const artifacts = recordArrayValue(data, 'artifacts');
  const metadataPath = stringValue(data, 'metadataPath');
  if (!artifacts || !metadataPath) return undefined;
  const lines = artifacts.flatMap((artifact) => {
    const type = stringValue(artifact, 'type');
    const artifactPath = stringValue(artifact, 'path');
    return type && artifactPath ? [`- ${type}: ${artifactPath}`] : [];
  });
  return `${label} complete. Artifacts (${artifacts.length})\n${lines.join('\n')}\nMetadata: ${metadataPath}\n`;
}

function formatAnimationAuditConsumer(consumer: JsonRecord, indent: string): readonly string[] {
  const itemId = stringValue(consumer, 'itemId');
  const typeName = stringValue(consumer, 'typeName');
  const layer = stringValue(consumer, 'layer');
  const bodyTypes = stringArrayValue(consumer, 'bodyTypes');
  const variant = nullableStringValue(consumer, 'variant');
  const recolors = stringArrayValue(consumer, 'recolors');
  if (!itemId || !typeName || !layer || !bodyTypes || !recolors) return [];
  return [
    `${indent}item: ${typeName}/${itemId}`,
    `${indent}layer: ${layer}`,
    `${indent}body types: ${formatCsv(bodyTypes)}`,
    `${indent}variant: ${variant ?? 'default'}`,
    `${indent}derived recolors: ${formatCsv(recolors)}`,
  ];
}

function formatAnimationAuditUnsupported(finding: JsonRecord): readonly string[] {
  const itemId = stringValue(finding, 'itemId');
  const typeName = stringValue(finding, 'typeName');
  const animation = stringValue(finding, 'animation');
  const requirements = recordArrayValue(finding, 'requirements');
  if (!itemId || !typeName || !animation || !requirements) return [];
  const nativeAnimations = stringArrayValue(finding, 'nativeAnimations');
  const compatibleAnimations = stringArrayValue(finding, 'compatibleAnimations');
  return [
    `- ${typeName}/${itemId}`,
    `  unsupported: ${animation}`,
    ...(nativeAnimations ? [`  native animations: ${formatCsv(nativeAnimations)}`] : []),
    ...(compatibleAnimations ? [`  compatible animations: ${formatCsv(compatibleAnimations)}`] : []),
    ...requirements.flatMap((requirement) => {
      const expectedPath = stringValue(requirement, 'expectedPath');
      const reason = stringValue(requirement, 'manualReviewReason');
      const consumer = formatAnimationAuditConsumer(requirement, '    ');
      return [
        ...(expectedPath ? [`  expected: ${expectedPath}`] : []),
        ...(!expectedPath && reason ? [`  manual review: ${reason}`] : []),
        ...consumer,
      ];
    }),
  ];
}

function formatAnimationAuditConsumers(consumers: readonly JsonRecord[], indent: string): readonly string[] {
  return consumers.flatMap((consumer) => formatAnimationAuditConsumer(consumer, indent));
}

function formatAnimationAudit(data: JsonRecord): string | undefined {
  const targets = stringArrayValue(data, 'targets');
  const summary = data['summary'];
  const unsupported = recordArrayValue(data, 'unsupported');
  const missingFiles = recordArrayValue(data, 'missingFiles');
  const blankFrames = recordArrayValue(data, 'blankFrames');
  const errors = recordArrayValue(data, 'errors');
  if (!targets || !isRecord(summary) || !unsupported || !missingFiles || !blankFrames || !errors) {
    return undefined;
  }
  const itemsScanned = numberValue(summary, 'itemsScanned');
  const incompleteItems = numberValue(summary, 'incompleteItems');
  const unsupportedCount = numberValue(summary, 'unsupported');
  const missingFilesCount = numberValue(summary, 'missingFiles');
  const blankFramesCount = numberValue(summary, 'blankFrames');
  const errorsCount = numberValue(summary, 'errors');
  if ([
    itemsScanned,
    incompleteItems,
    unsupportedCount,
    missingFilesCount,
    blankFramesCount,
    errorsCount,
  ].some((value) => value === undefined)) {
    return undefined;
  }

  const lines = [
    `Animation audit: ${targets.join(', ')}`,
    `Scanned: ${itemsScanned} items`,
    `Incomplete: ${incompleteItems} items`,
  ];
  if (unsupported.length > 0) {
    lines.push(`Unsupported animations (${unsupportedCount}):`);
    lines.push(...unsupported.flatMap(formatAnimationAuditUnsupported));
  }
  if (missingFiles.length > 0) {
    lines.push(`Missing files (${missingFilesCount}):`);
    lines.push(...missingFiles.flatMap((finding) => {
      const path = stringValue(finding, 'path');
      const animation = stringValue(finding, 'animation');
      const sourceAnimation = stringValue(finding, 'sourceAnimation');
      const consumers = recordArrayValue(finding, 'consumers');
      if (!path || !animation || !sourceAnimation || !consumers) return [];
      return [
        `- ${path}`,
        `  animation: ${animation}`,
        ...(sourceAnimation !== animation ? [`  source animation: ${sourceAnimation}`] : []),
        ...formatAnimationAuditConsumers(consumers, '  '),
      ];
    }));
  }
  if (blankFrames.length > 0) {
    lines.push(`Blank frames (${blankFramesCount}):`);
    lines.push(...blankFrames.flatMap((finding) => {
      const path = stringValue(finding, 'path');
      const animation = stringValue(finding, 'animation');
      const sourceAnimation = stringValue(finding, 'sourceAnimation');
      const sourceRow = numberValue(finding, 'sourceRow');
      const direction = stringValue(finding, 'direction');
      const frames = recordArrayValue(finding, 'frames');
      const consumers = recordArrayValue(finding, 'consumers');
      if (!path || !animation || !sourceAnimation || sourceRow === undefined || !frames || !consumers) {
        return [];
      }
      const frameLines = frames.flatMap((frame) => {
        const sourceColumn = numberValue(frame, 'sourceColumn');
        const logicalFrameIndices = frame['logicalFrameIndices'];
        if (sourceColumn === undefined || !Array.isArray(logicalFrameIndices)) return [];
        const indices = logicalFrameIndices.filter((index): index is number => typeof index === 'number');
        if (indices.length !== logicalFrameIndices.length) return [];
        return [
          `  ${animation}/${direction ?? `row ${sourceRow}`}: source column ${sourceColumn}; logical frames: ${indices.join(', ')}`,
        ];
      });
      return [
        `- ${path}`,
        ...(sourceAnimation !== animation ? [`  source animation: ${sourceAnimation}`] : []),
        ...frameLines,
        ...formatAnimationAuditConsumers(consumers, '  '),
      ];
    }));
  }
  if (errors.length > 0) {
    lines.push(`Inspection errors (${errorsCount}):`);
    lines.push(...errors.flatMap((error) => {
      const kind = stringValue(error, 'kind');
      const message = stringValue(error, 'message');
      const errorPath = stringValue(error, 'path');
      const consumers = recordArrayValue(error, 'consumers');
      if (!kind || !message || !consumers) return [];
      return [
        `- ${kind}: ${message}`,
        ...(errorPath ? [`  path: ${errorPath}`] : []),
        ...formatAnimationAuditConsumers(consumers, '  '),
      ];
    }));
  }
  return `${lines.join('\n')}\n`;
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
    case 'catalog audit-animations':
      return formatAnimationAudit(data);
    case 'token encode':
      return formatTokenEncode(data);
    case 'token decode':
      return formatSelectionOrOut(data, 'Selection written to');
    case 'preset list':
      return formatPresetList(data);
    case 'preset materialize':
      return formatSelectionOrOut(data, 'Preset selection written to');
    case 'character list':
      return formatCharacterList(data);
    case 'character show':
      return formatCharacterShow(data);
    case 'character create':
      return formatCharacterCreate(data);
    case 'character search':
      return formatCharacterSearch(data);
    case 'character set':
      return formatCharacterSet(data);
    case 'character remove':
      return formatCharacterRemove(data);
    case 'character validate':
      return formatCharacterValidate(data);
    case 'character preview':
      return formatRender(data, 'Preview');
    case 'character render':
      return formatRender(data);
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
