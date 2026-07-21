import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import {
  LICENSE_GROUP_OF,
  type AssetPackCreditSource,
  type License,
} from '@lpc-toolkit/core';
import {
  flagBoolean,
  flagString,
  flagStrings,
  type ParsedArgs,
} from './args.js';
import {
  scaffoldAuditAssetPack,
  scaffoldNewAssetPack,
} from './asset-pack-scaffold.js';
import {
  AssetPackPreviewError,
  previewAssetPack,
} from './asset-pack-preview.js';
import { syncLinkedAssetPack } from './asset-pack-sync.js';
import {
  loadActiveAssetPackBaseline,
  validateAssetPackDirectory,
} from './asset-pack-validation.js';
import type { AssetWorkspace } from './asset-workspace.js';
import {
  commandError,
  commandOk,
  type CliIssue,
  type CliResponse,
} from './response.js';
import type { RuntimeAssets } from './runtime-assets.js';

const DEFAULT_PACK_VERSION = '0.1.0';
const PACK_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;
const LOCAL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

interface AssetCommandContext {
  readonly parsed: ParsedArgs;
  readonly cwd: string;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
}

function issue(
  code: string,
  message: string,
  issuePath?: string,
  details?: CliIssue['details'],
): CliIssue {
  return {
    code,
    message,
    ...(issuePath === undefined ? {} : { path: issuePath }),
    ...(details === undefined ? {} : { details }),
  };
}

function compatibleIssueDetails(
  details: Readonly<Record<string, unknown>> | undefined,
): CliIssue['details'] | undefined {
  if (details === undefined) return undefined;
  const suggestions = details.suggestions;
  const available = details.available;
  const compatibleSuggestions = Array.isArray(suggestions)
    && suggestions.every((value): value is string => typeof value === 'string')
    ? suggestions
    : undefined;
  const compatibleAvailable = Array.isArray(available)
    && available.every((value): value is string => typeof value === 'string')
    ? available
    : undefined;
  return compatibleSuggestions === undefined && compatibleAvailable === undefined
    ? undefined
    : {
      ...(compatibleSuggestions === undefined ? {} : { suggestions: compatibleSuggestions }),
      ...(compatibleAvailable === undefined ? {} : { available: compatibleAvailable }),
    };
}

function missingFlag(name: string): CliIssue {
  return issue('missing_argument', `--${name} is required.`, `--${name}`);
}

function commandFailure(
  command: string,
  diagnostics: readonly {
    readonly code: string;
    readonly message: string;
    readonly path?: string;
    readonly severity?: 'error' | 'warning';
    readonly details?: Readonly<Record<string, unknown>>;
  }[],
): CliResponse<null> {
  const toIssue = (diagnostic: (typeof diagnostics)[number]): CliIssue => {
    const details = compatibleIssueDetails(diagnostic.details);
    return {
      code: diagnostic.code,
      message: diagnostic.message,
      ...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
      ...(details === undefined ? {} : { details }),
    };
  };
  const warnings = diagnostics
    .filter((diagnostic) => diagnostic.severity === 'warning')
    .map(toIssue);
  const errors = diagnostics
    .filter((diagnostic) => diagnostic.severity !== 'warning')
    .map(toIssue);
  return {
    ok: false,
    command,
    data: null,
    warnings,
    errors: errors.length > 0 || warnings.length > 0
      ? errors
      : [issue('asset_command_failed', 'Asset command failed.')],
  };
}

function isSupportedLicense(value: string): value is License {
  return Object.prototype.hasOwnProperty.call(LICENSE_GROUP_OF, value);
}

function commonScaffoldIssue(parsed: ParsedArgs): CliIssue | undefined {
  const required = ['pack-id', 'display-name'] as const;
  for (const name of required) {
    if (!flagString(parsed.flags, name)) return missingFlag(name);
  }
  if (flagStrings(parsed.flags, 'author').length === 0) return missingFlag('author');
  if (flagStrings(parsed.flags, 'license').length === 0) return missingFlag('license');
  if (
    flagStrings(parsed.flags, 'url').length === 0
    && !flagString(parsed.flags, 'notes')?.trim()
  ) {
    return issue(
      'missing_argument',
      'At least one --url or non-empty --notes value is required.',
      '--url',
    );
  }

  const packId = flagString(parsed.flags, 'pack-id')!;
  if (!PACK_ID_PATTERN.test(packId)) {
    return issue('invalid_option', `Invalid pack id: ${packId}`, '--pack-id');
  }
  const version = flagString(parsed.flags, 'version') ?? DEFAULT_PACK_VERSION;
  if (!SEMVER_PATTERN.test(version)) {
    return issue('invalid_option', `Invalid semantic version: ${version}`, '--version');
  }
  const unsupportedLicense = flagStrings(parsed.flags, 'license')
    .find((license) => !isSupportedLicense(license));
  if (unsupportedLicense !== undefined) {
    return issue(
      'invalid_option',
      `Unsupported license: ${unsupportedLicense}`,
      '--license',
    );
  }
  return undefined;
}

function initIssue(parsed: ParsedArgs): CliIssue | undefined {
  if (parsed.positionals.length > 0) {
    return issue(
      'unexpected_argument',
      'asset init does not accept positional arguments.',
      parsed.positionals[0],
    );
  }

  const isNew = flagBoolean(parsed.flags, 'new');
  const auditReport = flagString(parsed.flags, 'from-audit');
  if (isNew === (auditReport !== undefined)) {
    return issue(
      'invalid_option',
      'Choose exactly one scaffold mode: --new or --from-audit <report>.',
    );
  }

  const commonIssue = commonScaffoldIssue(parsed);
  if (commonIssue) return commonIssue;

  if (isNew) {
    for (const name of ['asset-id', 'type'] as const) {
      if (!flagString(parsed.flags, name)) return missingFlag(name);
    }
    if (flagStrings(parsed.flags, 'body-type').length === 0) return missingFlag('body-type');
    if (flagStrings(parsed.flags, 'animation').length === 0) return missingFlag('animation');
    if (flagStrings(parsed.flags, 'type').length > 1) {
      return issue('invalid_option', '--type may be supplied only once with --new.', '--type');
    }
    if (flagStrings(parsed.flags, 'item').length > 0) {
      return issue('invalid_option', '--item is supported only with --from-audit.', '--item');
    }
    const assetId = flagString(parsed.flags, 'asset-id')!;
    if (!LOCAL_ID_PATTERN.test(assetId)) {
      return issue('invalid_option', `Invalid local asset id: ${assetId}`, '--asset-id');
    }
    return undefined;
  }

  if (flagBoolean(parsed.flags, 'advanced')) {
    return issue('invalid_option', '--advanced is supported only with --new.', '--advanced');
  }
  if (flagString(parsed.flags, 'asset-id')) {
    return issue('invalid_option', '--asset-id is supported only with --new.', '--asset-id');
  }
  if (
    flagStrings(parsed.flags, 'item').length === 0
    && flagStrings(parsed.flags, 'type').length === 0
  ) {
    return issue(
      'missing_argument',
      '--from-audit requires at least one --item or --type selector.',
    );
  }
  return undefined;
}

function positionalPackIssue(parsed: ParsedArgs): CliIssue | undefined {
  if (!parsed.positionals[0]) {
    return issue(
      'missing_argument',
      `${parsed.command.join(' ')} requires a pack directory.`,
    );
  }
  if (parsed.positionals.length > 1) {
    return issue(
      'unexpected_argument',
      `${parsed.command.join(' ')} accepts only one pack directory.`,
      parsed.positionals[1],
    );
  }
  return undefined;
}

export function preflightAssetCommand(
  parsed: ParsedArgs,
): CliResponse<null> | undefined {
  if (parsed.command[0] !== 'asset') return undefined;
  const subcommand = parsed.command[1];

  if (subcommand === 'workspace') {
    if (parsed.command[2] !== 'init') {
      return commandError(parsed.command.join(' '), issue(
        'unknown_command',
        `Unknown asset workspace command: ${parsed.command.join(' ')}`,
      ));
    }
    if (parsed.positionals.length !== 1) {
      return commandError('asset workspace init', issue(
        parsed.positionals.length === 0 ? 'missing_argument' : 'unexpected_argument',
        'asset workspace init requires exactly one directory.',
      ));
    }
    return undefined;
  }

  if (subcommand === 'init') {
    const initInputIssue = initIssue(parsed);
    return initInputIssue ? commandError('asset init', initInputIssue) : undefined;
  }

  if (subcommand === 'validate' || subcommand === 'preview' || subcommand === 'sync') {
    const packIssue = positionalPackIssue(parsed);
    return packIssue
      ? commandError(`asset ${subcommand}`, packIssue)
      : undefined;
  }

  return commandError(parsed.command.join(' ') || 'asset', issue(
    'unknown_command',
    `Unknown asset command: ${parsed.command.join(' ')}`,
  ));
}

function credits(parsed: ParsedArgs): AssetPackCreditSource {
  return {
    authors: flagStrings(parsed.flags, 'author'),
    licenses: flagStrings(parsed.flags, 'license').filter(isSupportedLicense),
    urls: flagStrings(parsed.flags, 'url'),
    notes: flagString(parsed.flags, 'notes') ?? '',
  };
}

function insidePacksRoot(packsRoot: string, candidate: string): boolean {
  const relative = path.relative(packsRoot, candidate);
  const lexicallyInside = relative.length > 0
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
  if (!lexicallyInside) return false;

  let existingAncestor = candidate;
  while (!existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) return false;
    existingAncestor = parent;
  }
  try {
    const realPacksRoot = realpathSync(packsRoot);
    const realAncestor = realpathSync(existingAncestor);
    const realRelative = path.relative(realPacksRoot, realAncestor);
    return realRelative === ''
      || (
        realRelative !== '..'
        && !realRelative.startsWith(`..${path.sep}`)
        && !path.isAbsolute(realRelative)
      );
  } catch {
    return false;
  }
}

function scaffoldOutputDirectory(
  parsed: ParsedArgs,
  cwd: string,
  workspace: AssetWorkspace,
): string | CliIssue {
  const packId = flagString(parsed.flags, 'pack-id')!;
  const out = flagString(parsed.flags, 'out');
  const outputDirectory = out === undefined
    ? path.join(workspace.packsRoot, packId)
    : path.resolve(cwd, out);
  if (!insidePacksRoot(workspace.packsRoot, outputDirectory)) {
    return issue(
      'invalid_option',
      '--out must resolve to a pack directory inside the workspace artist-packs directory.',
      '--out',
    );
  }
  return outputDirectory;
}

export function preflightAssetWorkspaceCommand(
  parsed: ParsedArgs,
  cwd: string,
  workspace: AssetWorkspace,
): CliResponse<null> | undefined {
  if (parsed.command[0] !== 'asset' || parsed.command[1] !== 'init') {
    return undefined;
  }
  const outputDirectory = scaffoldOutputDirectory(parsed, cwd, workspace);
  return typeof outputDirectory === 'string'
    ? undefined
    : commandError('asset init', outputDirectory);
}

function packDirectory(parsed: ParsedArgs, cwd: string): string {
  return path.resolve(cwd, parsed.positionals[0]!);
}

async function runInitCommand(
  context: AssetCommandContext,
): Promise<CliResponse<unknown>> {
  const { parsed, cwd, workspace, runtime } = context;
  const outputDirectory = scaffoldOutputDirectory(parsed, cwd, workspace);
  if (typeof outputDirectory !== 'string') {
    return commandError('asset init', outputDirectory);
  }

  const common = {
    packId: flagString(parsed.flags, 'pack-id')!,
    version: flagString(parsed.flags, 'version') ?? DEFAULT_PACK_VERSION,
    displayName: flagString(parsed.flags, 'display-name')!,
    credits: credits(parsed),
    outputDirectory,
  };
  const result = flagBoolean(parsed.flags, 'new')
    ? scaffoldNewAssetPack({
      ...common,
      localId: flagString(parsed.flags, 'asset-id')!,
      typeName: flagString(parsed.flags, 'type')!,
      bodyTypes: flagStrings(parsed.flags, 'body-type'),
      animations: flagStrings(parsed.flags, 'animation'),
      advanced: flagBoolean(parsed.flags, 'advanced'),
    })
    : scaffoldAuditAssetPack({
      reportPath: path.resolve(cwd, flagString(parsed.flags, 'from-audit')!),
      itemIds: flagStrings(parsed.flags, 'item'),
      typeNames: flagStrings(parsed.flags, 'type'),
      animations: flagStrings(parsed.flags, 'animation'),
      bodyTypes: flagStrings(parsed.flags, 'body-type'),
      pack: common,
    }, loadActiveAssetPackBaseline({ runtime, workspace }));

  return result.ok
    ? commandOk('asset init', {
      packRoot: result.packRoot,
      manifestPath: result.manifestPath,
    })
    : commandFailure('asset init', result.diagnostics);
}

function previewErrorResponse(error: unknown): CliResponse<null> {
  if (error instanceof AssetPackPreviewError) {
    if (error.diagnostics.length > 0) {
      return commandFailure('asset preview', error.diagnostics);
    }
    return commandError('asset preview', issue(
      error.code,
      error.message,
      error.path,
      compatibleIssueDetails(error.details),
    ));
  }
  return commandError('asset preview', issue(
    'asset_preview_failed',
    error instanceof Error ? error.message : 'Asset-pack preview failed.',
  ));
}

export async function runAssetCommand(
  context: AssetCommandContext,
): Promise<CliResponse<unknown>> {
  const { parsed, cwd, workspace, runtime } = context;
  const subcommand = parsed.command[1];
  try {
    if (subcommand === 'init') return await runInitCommand(context);
    if (subcommand === 'validate') {
      const report = await validateAssetPackDirectory({
        packDirectory: packDirectory(parsed, cwd),
        workspace,
        runtime,
      });
      return commandOk('asset validate', report);
    }
    if (subcommand === 'preview') {
      const result = await previewAssetPack({
        packDirectory: packDirectory(parsed, cwd),
        workspace,
        runtime,
        ...(flagString(parsed.flags, 'asset') === undefined
          ? {}
          : { assetId: flagString(parsed.flags, 'asset')! }),
        ...(flagString(parsed.flags, 'animation') === undefined
          ? {}
          : { animation: flagString(parsed.flags, 'animation')! }),
        ...(flagString(parsed.flags, 'body-type') === undefined
          ? {}
          : { bodyType: flagString(parsed.flags, 'body-type')! }),
        ...(flagString(parsed.flags, 'character') === undefined
          ? {}
          : { characterPath: path.resolve(cwd, flagString(parsed.flags, 'character')!) }),
      });
      return commandOk('asset preview', result, result.warnings);
    }
    if (subcommand === 'sync') {
      const result = await syncLinkedAssetPack({
        packDirectory: packDirectory(parsed, cwd),
        workspace,
        runtime,
      });
      if (!result.ok) return commandFailure('asset sync', result.diagnostics);
      return commandOk('asset sync', {
        packId: result.linked.packId,
        contentDigest: result.linked.contentDigest,
        generatedFileCount: result.linked.generatedPaths.length,
        outputPath: workspace.outputRoot,
      });
    }
  } catch (error) {
    if (subcommand === 'preview') return previewErrorResponse(error);
    return commandError(`asset ${subcommand ?? ''}`.trim(), issue(
      `asset_${subcommand ?? 'command'}_failed`,
      error instanceof Error ? error.message : 'Asset command failed.',
    ));
  }

  return commandError(parsed.command.join(' '), issue(
    'unknown_command',
    `Unknown asset command: ${parsed.command.join(' ')}`,
  ));
}
