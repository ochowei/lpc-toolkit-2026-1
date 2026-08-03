import path from 'node:path';
import { CLI_VERSION } from './package-info.js';
import {
  AUTHORING_CAPABILITIES,
  AUTHORING_SCHEMA_VERSIONS,
} from './capabilities.js';

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

export type AuthoringGoal = 'new-item' | 'extend-item' | 'attach-pack';
export type AuthoringState = 'completed' | 'needs-user-action' | 'failed';
export type AuthoringPhase =
  | 'planned'
  | 'scaffolded'
  | 'contract-ready'
  | 'awaiting-candidate'
  | 'imported'
  | 'validated'
  | 'previewed'
  | 'blocked';
export type AuthoringCheckpointFreshness = 'missing' | 'current' | 'stale' | 'blocked';
export type AuthoringActionSafety = 'safe' | 'requires-confirmation' | 'blocked';

export interface AuthoringCheckpoint {
  readonly id: string;
  readonly digest: string;
}

export interface AuthoringArtifact {
  readonly id: string;
  readonly path: string;
  readonly digest: string;
}

export interface AuthoringInputNeeded {
  readonly id: string;
  readonly summary: string;
}

export interface AuthoringNextAction {
  readonly id: string;
  readonly summary: string;
  readonly command: string;
  readonly safety: AuthoringActionSafety;
  readonly requiredInputs: readonly string[];
  readonly preconditionDigests: readonly string[];
  readonly expectedCheckpoint: AuthoringCheckpoint | null;
}

export interface AuthoringResponseProjectionInput {
  readonly sessionId: string;
  readonly goal: AuthoringGoal;
  readonly state: AuthoringState;
  readonly reason: string;
  readonly phase: AuthoringPhase;
  readonly checkpoint: AuthoringCheckpoint | null;
  readonly checkpointFreshness: AuthoringCheckpointFreshness;
  readonly diagnostics: readonly CliIssue[];
  readonly artifacts: readonly AuthoringArtifact[];
  readonly inputsNeeded: readonly AuthoringInputNeeded[];
  readonly nextActions: readonly AuthoringNextAction[];
  readonly retrySafety: AuthoringActionSafety;
  readonly manifestDigest: string | null;
  readonly sourceDigests: readonly string[];
}

export interface AuthoringResponseData extends AuthoringResponseProjectionInput {
  readonly schema: 'lpc-toolkit.asset-authoring-response.v1';
  readonly cliVersion: string;
  readonly capabilities: readonly string[];
  readonly schemaVersions: readonly string[];
}

export function authoringResponseProjection(
  input: AuthoringResponseProjectionInput,
): AuthoringResponseData {
  return {
    schema: 'lpc-toolkit.asset-authoring-response.v1',
    ...input,
    diagnostics: [...input.diagnostics],
    artifacts: [...input.artifacts],
    inputsNeeded: [...input.inputsNeeded],
    nextActions: [...input.nextActions],
    sourceDigests: [...input.sourceDigests],
    cliVersion: CLI_VERSION,
    capabilities: [...AUTHORING_CAPABILITIES],
    schemaVersions: [...AUTHORING_SCHEMA_VERSIONS],
  };
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

function formatAuthoringResponse(
  command: string,
  data: JsonRecord,
): string | undefined {
  if (stringValue(data, 'schema') !== 'lpc-toolkit.asset-authoring-response.v1') {
    return undefined;
  }
  const state = stringValue(data, 'state');
  const phase = stringValue(data, 'phase');
  const reason = stringValue(data, 'reason');
  const checkpointFreshness = stringValue(data, 'checkpointFreshness');
  if (!state || !phase || !reason || !checkpointFreshness) return undefined;

  const lines = [
    `Command succeeded: ${command}`,
    `Workflow state: ${state}`,
    `Phase: ${phase}`,
    `Reason: ${reason}`,
    `Checkpoint: ${checkpointFreshness}`,
  ];
  const inputs = recordArrayValue(data, 'inputsNeeded') ?? [];
  if (inputs.length > 0) {
    lines.push('Inputs needed:');
    for (const input of inputs) {
      const summary = stringValue(input, 'summary');
      if (summary) lines.push(`- ${summary}`);
    }
  }
  const actions = recordArrayValue(data, 'nextActions') ?? [];
  for (const action of actions) {
    const summary = stringValue(action, 'summary');
    const actionCommand = stringValue(action, 'command');
    if (!summary) continue;
    const safety = stringValue(action, 'safety');
    if (safety === 'requires-confirmation') {
      lines.push(`Confirmation required: ${summary}`);
    } else {
      lines.push(`Next action: ${summary}`);
    }
    if (actionCommand) lines.push(`Next command: ${actionCommand}`);
  }
  return `${lines.join('\n')}\n`;
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

function formatCharacterSetColor(data: JsonRecord): string | undefined {
  const name = characterDisplayName(data);
  const typeName = stringValue(data, 'typeName');
  const channel = stringValue(data, 'channel');
  const color = data['color'];
  if (!name || !typeName || !channel) return undefined;
  if (color === null) return `Updated ${name}: ${typeName}.${channel} = asset default\n`;
  return typeof color === 'string'
    ? `Updated ${name}: ${typeName}.${channel} = ${color}\n`
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

function formatAssetWorkspaceInit(data: JsonRecord): string | undefined {
  const root = stringValue(data, 'root');
  const configPath = stringValue(data, 'configPath');
  if (!root || !configPath) return undefined;
  return `Asset workspace initialized: ${root}\nConfig: ${configPath}\n`;
}

function formatAssetInit(data: JsonRecord): string | undefined {
  const packRoot = stringValue(data, 'packRoot');
  const manifestPath = stringValue(data, 'manifestPath');
  if (!packRoot || !manifestPath) return undefined;
  return `Asset pack scaffolded: ${packRoot}\nManifest: ${manifestPath}\n`;
}

function assetDiagnosticPath(diagnostic: JsonRecord): string | undefined {
  return stringValue(diagnostic, 'path')
    ?? stringValue(diagnostic, 'sourcePath')
    ?? stringValue(diagnostic, 'destinationPath');
}

function formatAssetDiagnostic(diagnostic: JsonRecord): string {
  const code = stringValue(diagnostic, 'code') ?? 'asset_pack_diagnostic';
  const message = stringValue(diagnostic, 'message') ?? 'Asset-pack diagnostic.';
  const diagnosticPath = assetDiagnosticPath(diagnostic);
  return `- ${code}: ${message}${diagnosticPath ? ` (${diagnosticPath})` : ''}`;
}

function formatAssetValidation(data: JsonRecord): string | undefined {
  const valid = data['valid'];
  const diagnostics = recordArrayValue(data, 'diagnostics');
  const acknowledgements = recordArrayValue(data, 'acknowledgementRecords');
  if (typeof valid !== 'boolean' || !diagnostics || !acknowledgements) return undefined;
  const errors = diagnostics.filter((diagnostic) => diagnostic['severity'] === 'error');
  const warnings = diagnostics.filter((diagnostic) => diagnostic['severity'] === 'warning');
  const lines = [`Asset pack validation: ${valid ? 'valid' : 'invalid'}`];
  const packDirectory = stringValue(data, 'packDirectory');
  const contentDigest = stringValue(data, 'contentDigest');
  if (packDirectory) lines.push(`Pack: ${packDirectory}`);
  if (contentDigest) lines.push(`Content digest: ${contentDigest}`);
  if (errors.length > 0) {
    lines.push(`Errors (${errors.length}):`, ...errors.map(formatAssetDiagnostic));
  }
  if (warnings.length > 0) {
    lines.push(`Warnings (${warnings.length}):`, ...warnings.map(formatAssetDiagnostic));
  }
  if (acknowledgements.length > 0) {
    lines.push(
      'Acknowledgements (copy exact JSON and add a non-empty reason):',
      JSON.stringify(acknowledgements, null, 2),
    );
  }
  return `${lines.join('\n')}\n`;
}

function previewArtifactLabel(type: string): string {
  switch (type) {
    case 'preview':
      return 'Preview';
    case 'credits_txt':
      return 'Credits TXT';
    case 'credits_csv':
      return 'Credits CSV';
    case 'metadata':
      return 'Metadata';
    default:
      return type;
  }
}

function formatAssetPreview(data: JsonRecord): string | undefined {
  const packId = stringValue(data, 'packId');
  const assetId = stringValue(data, 'assetId');
  const artifacts = recordArrayValue(data, 'artifacts');
  if (!packId || !assetId || !artifacts) return undefined;
  const lines = artifacts.flatMap((artifact) => {
    const type = stringValue(artifact, 'type');
    const artifactPath = stringValue(artifact, 'path');
    return type && artifactPath
      ? [`${previewArtifactLabel(type)}: ${artifactPath}`]
      : [];
  });
  return `Asset preview: ${packId} / ${assetId}\n${lines.join('\n')}\n`;
}

function formatAssetSync(data: JsonRecord): string | undefined {
  const packId = stringValue(data, 'packId');
  const contentDigest = stringValue(data, 'contentDigest');
  const generatedFileCount = numberValue(data, 'generatedFileCount');
  const outputPath = stringValue(data, 'outputPath');
  if (!packId || !contentDigest || generatedFileCount === undefined || !outputPath) {
    return undefined;
  }
  return [
    `Asset pack synced: ${packId}`,
    `Content digest: ${contentDigest}`,
    `Generated files: ${generatedFileCount}`,
    `Workspace output: ${outputPath}`,
    '',
  ].join('\n');
}

function formatAssetPack(data: JsonRecord): string | undefined {
  const packId = stringValue(data, 'packId');
  const version = stringValue(data, 'version');
  const archivePath = stringValue(data, 'archivePath');
  const archiveDigest = stringValue(data, 'archiveDigest');
  const contentDigest = stringValue(data, 'contentDigest');
  const entryCount = numberValue(data, 'entryCount');
  if (
    !packId
    || !version
    || !archivePath
    || !archiveDigest
    || !contentDigest
    || entryCount === undefined
  ) {
    return undefined;
  }
  return [
    `Asset pack archived: ${packId} ${version}`,
    `Archive: ${archivePath}`,
    `Archive digest: ${archiveDigest}`,
    `Content digest: ${contentDigest}`,
    `Entries: ${entryCount}`,
    '',
  ].join('\n');
}

type InspectionDiagnosticGroup =
  | 'Archive'
  | 'Compatibility'
  | 'Pixel'
  | 'Credit'
  | 'Validation';

function inspectionDiagnosticGroup(diagnostic: JsonRecord): InspectionDiagnosticGroup {
  const code = stringValue(diagnostic, 'code') ?? '';
  if (
    code.startsWith('asset_archive_')
    || code.startsWith('asset_checksum_')
    || code.startsWith('asset_digest_')
  ) {
    return 'Archive';
  }
  if (code === 'asset_cli_version_incompatible' || code === 'asset_capability_unsupported') {
    return 'Compatibility';
  }
  if (code.includes('credit') || code.includes('attribution') || code.includes('license')) {
    return 'Credit';
  }
  if (
    code.includes('png')
    || code.includes('frame')
    || code.includes('pixel')
    || code.includes('palette')
    || code.includes('recolor')
  ) {
    return 'Pixel';
  }
  return 'Validation';
}

function formatAssetInspect(data: JsonRecord): string | undefined {
  const valid = data['valid'];
  const archivePath = stringValue(data, 'archivePath');
  const entryCount = numberValue(data, 'entryCount');
  const totalUncompressedBytes = numberValue(data, 'totalUncompressedBytes');
  const status = stringValue(data, 'status');
  const diagnostics = recordArrayValue(data, 'diagnostics');
  const acknowledgements = recordArrayValue(data, 'acknowledgementRecords');
  if (
    typeof valid !== 'boolean'
    || !archivePath
    || entryCount === undefined
    || totalUncompressedBytes === undefined
    || !diagnostics
    || !acknowledgements
  ) {
    return undefined;
  }

  const lines = [
    `Asset pack inspection: ${valid ? 'valid' : 'invalid'}`,
    `Archive: ${archivePath}`,
  ];
  const packId = stringValue(data, 'packId');
  const version = stringValue(data, 'version');
  const archiveDigest = stringValue(data, 'archiveDigest');
  const contentDigest = stringValue(data, 'contentDigest');
  if (packId) {
    lines.push(
      `Pack: ${packId}${version ? ` ${version}` : ''}${status === 'draft' ? ' (DRAFT)' : ''}`,
    );
  }
  if (archiveDigest) lines.push(`Archive digest: ${archiveDigest}`);
  if (contentDigest) lines.push(`Content digest: ${contentDigest}`);
  lines.push(
    `Entries: ${entryCount}`,
    `Uncompressed bytes: ${totalUncompressedBytes}`,
  );

  for (const group of [
    'Archive',
    'Compatibility',
    'Pixel',
    'Credit',
    'Validation',
  ] as const) {
    const grouped = diagnostics.filter(
      (diagnostic) => inspectionDiagnosticGroup(diagnostic) === group,
    );
    if (grouped.length > 0) {
      lines.push(
        `${group} diagnostics (${grouped.length}):`,
        ...grouped.map(formatAssetDiagnostic),
      );
    }
  }
  if (acknowledgements.length > 0) {
    lines.push(
      'Acknowledgements (copy exact JSON and add a non-empty reason):',
      JSON.stringify(acknowledgements, null, 2),
    );
  }
  return `${lines.join('\n')}\n`;
}

function formatAssetInstall(data: JsonRecord): string | undefined {
  const action = stringValue(data, 'action');
  const packId = stringValue(data, 'packId');
  const version = stringValue(data, 'version');
  const installedDirectory = stringValue(data, 'installedDirectory');
  const outputPath = stringValue(data, 'outputPath');
  const archiveDigest = stringValue(data, 'archiveDigest');
  const generatedFileCount = numberValue(data, 'generatedFileCount');
  if (
    !action
    || !packId
    || !version
    || !installedDirectory
    || !outputPath
    || !archiveDigest
    || generatedFileCount === undefined
  ) {
    return undefined;
  }
  return [
    `Asset pack install: ${action} ${packId} ${version}`,
    `Source: ${installedDirectory}`,
    `Workspace output: ${outputPath}`,
    `Archive digest: ${archiveDigest}`,
    `Generated files: ${generatedFileCount}`,
    '',
  ].join('\n');
}

function formatAssetList(data: JsonRecord): string | undefined {
  const recovery = stringValue(data, 'recovery');
  const entries = recordArrayValue(data, 'entries');
  if (!recovery || !entries) return undefined;
  const headers = ['PACK ID', 'VERSION', 'KIND', 'SOURCE'] as const;
  const rows = entries.flatMap((entry) => {
    const packId = stringValue(entry, 'packId');
    const version = stringValue(entry, 'version');
    const kind = stringValue(entry, 'kind');
    const sourcePath = stringValue(entry, 'sourcePath');
    return packId && version && kind && sourcePath
      ? [[packId, version, kind, sourcePath] as const]
      : [];
  });
  if (rows.length !== entries.length) return undefined;
  const widths = headers.map((header, index) => Math.max(
    header.length,
    ...rows.map((row) => row[index]!.length),
  ));
  const formatRow = (row: readonly string[]): string => row
    .map((cell, index) => index === row.length - 1
      ? cell
      : cell.padEnd(widths[index] ?? cell.length))
    .join('  ');
  return [
    `Asset packs (${rows.length})`,
    `Recovery: ${recovery}`,
    formatRow(headers),
    ...rows.map(formatRow),
    '',
  ].join('\n');
}

function formatAssetRemove(data: JsonRecord): string | undefined {
  const packId = stringValue(data, 'packId');
  const removedKind = stringValue(data, 'removedKind');
  const remainingPackIds = stringArrayValue(data, 'remainingPackIds');
  const remainingCount = numberValue(data, 'remainingCount') ?? remainingPackIds?.length;
  const generatedFileCount = numberValue(data, 'generatedFileCount');
  if (
    !packId
    || !removedKind
    || !remainingPackIds
    || remainingCount === undefined
    || generatedFileCount === undefined
  ) {
    return undefined;
  }
  return [
    `Asset pack removed: ${packId} (${removedKind})`,
    `Remaining packs: ${remainingCount}`,
    `Generated files: ${generatedFileCount}`,
    '',
  ].join('\n');
}

function formatDoctorCheck(check: JsonRecord): string {
  const code = stringValue(check, 'code') ?? 'asset_doctor_check';
  const message = stringValue(check, 'message') ?? 'Asset lifecycle check.';
  const checkPath = stringValue(check, 'path');
  const packId = stringValue(check, 'packId');
  const context = checkPath ?? packId;
  return `- ${code}: ${message}${context ? ` (${context})` : ''}`;
}

function formatAssetDoctor(data: JsonRecord): string | undefined {
  const healthy = data['healthy'];
  const recovery = stringValue(data, 'recovery');
  const checks = recordArrayValue(data, 'checks');
  if (typeof healthy !== 'boolean' || !recovery || !checks) return undefined;
  const lines = [
    `Asset pack doctor: ${healthy ? 'healthy' : 'unhealthy'}`,
    `Recovery: ${recovery}`,
  ];
  for (const [status, label] of [
    ['error', 'Errors'],
    ['warning', 'Warnings'],
    ['pass', 'Passed checks'],
  ] as const) {
    const grouped = checks.filter((check) => check['status'] === status);
    if (grouped.length > 0) {
      lines.push(`${label} (${grouped.length}):`, ...grouped.map(formatDoctorCheck));
    }
  }
  return `${lines.join('\n')}\n`;
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
    `Scanned: ${itemsScanned} ${itemsScanned === 1 ? 'item' : 'items'}`,
    `Incomplete: ${incompleteItems} ${incompleteItems === 1 ? 'item' : 'items'}`,
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

  const authoring = formatAuthoringResponse(response.command, data);
  if (authoring) return authoring;

  switch (response.command) {
    case 'asset workspace init':
      return formatAssetWorkspaceInit(data);
    case 'asset init':
      return formatAssetInit(data);
    case 'asset validate':
      return formatAssetValidation(data);
    case 'asset preview':
      return formatAssetPreview(data);
    case 'asset sync':
      return formatAssetSync(data);
    case 'asset pack':
      return formatAssetPack(data);
    case 'asset inspect':
      return formatAssetInspect(data);
    case 'asset install':
      return formatAssetInstall(data);
    case 'asset list':
      return formatAssetList(data);
    case 'asset remove':
      return formatAssetRemove(data);
    case 'asset doctor':
      return formatAssetDoctor(data);
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
    case 'character set-color':
      return formatCharacterSetColor(data);
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
    const errors = response.errors.map(humanIssue).join('\n');
    const warnings = formatWarnings(response.warnings);
    if (errors && warnings) return `${errors}\n${warnings.slice(1)}`;
    if (warnings) return warnings.slice(1);
    return `${errors}\n`;
  }

  return `${formatHumanData(response) ?? fallbackSuccess}${formatWarnings(response.warnings)}`;
}
