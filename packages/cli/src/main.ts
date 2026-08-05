import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SelectionDocumentError } from '@lpc-toolkit/core';
import {
  flagBoolean,
  flagString,
  flagStrings,
  parseArgs,
  type ParsedArgs,
} from './args.js';
import {
  assetCommandRequirements,
  preflightAssetCommand,
  preflightAssetWorkspaceCommand,
  runAssetCommand,
} from './asset-commands.js';
import { assetCacheErrorIssue } from './asset-cache.js';
import { AssetStoreError } from './asset-store.js';
import {
  findAssetWorkspace,
  initializeAssetWorkspace,
  type AssetWorkspace,
} from './asset-workspace.js';
import { runAnimationAuditCommand } from './animation-audit.js';
import { SelectionOutputError } from './compose-selection.js';
import { runCatalogCommand } from './catalog-commands.js';
import { discoveryPaginationIssue } from './catalog-discovery.js';
import {
  characterCommandNeedsAssets,
  runCharacterCommand,
} from './character-commands.js';
import {
  helpForCommand,
  validateCommandArguments,
  validateCommandOptions,
} from './command-spec.js';
import {
  createCapabilityAdvertisement,
} from './capabilities.js';
import { runAgentIntegrationCommand } from './agent-integration-commands.js';
import { runAssetProviderCommand } from './asset-provider-commands.js';
import { materializePreset, runPresetCommand } from './preset-commands.js';
import { CLI_VERSION } from './package-info.js';
import { renderSelection } from './render.js';
import {
  commandError,
  commandOk,
  formatProgress,
  formatHumanResponse,
  formatJsonResponse,
  type CliIssue,
  type CliResponse,
} from './response.js';
import {
  AssetWorkspaceRuntimeError,
  findRuntimeAssetWorkspace,
  loadRuntimeCatalog,
  loadRuntimePalettes,
  prepareRuntimeAssets,
  withWorkspaceRuntimeAssets,
  type RuntimeAssets,
} from './runtime-assets.js';
import { runSelectionCommand } from './selection-commands.js';
import {
  loadSelectionDocumentContext,
  readSelectionDocumentFile,
} from './selection-document-file.js';
import { runTokenCommand } from './token-commands.js';
import { startWebServer, validateWebOptions } from './web-server.js';

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly cwd: string;
}

export interface CliDependencies {
  readonly prepareRuntimeAssets: typeof prepareRuntimeAssets;
  readonly startWebServer: typeof startWebServer;
  readonly findAssetWorkspace: typeof findAssetWorkspace;
  readonly initializeAssetWorkspace: typeof initializeAssetWorkspace;
}

const DEFAULT_DEPENDENCIES: CliDependencies = {
  findAssetWorkspace,
  initializeAssetWorkspace,
  prepareRuntimeAssets,
  startWebServer,
};

export function resolveWebRoot(moduleUrl: string): string {
  return fileURLToPath(new URL('./web', moduleUrl));
}

function renderErrorIssue(
  error: unknown,
  fallbackMessage: string,
  fallbackPath?: string,
): { readonly code: string; readonly message: string; readonly path?: string } {
  if (error instanceof AssetStoreError) {
    return { code: error.code, message: error.message, path: error.path };
  }
  if (error instanceof SelectionOutputError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.issues[0]?.path === undefined ? {} : { path: error.issues[0].path }),
    };
  }
  if (error instanceof SelectionDocumentError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.path === undefined ? {} : { path: error.path }),
    };
  }
  return {
    code: 'render_failed',
    message: error instanceof Error ? error.message : fallbackMessage,
    ...(fallbackPath === undefined ? {} : { path: fallbackPath }),
  };
}

function writeResponse(
  response: CliResponse<unknown>,
  parsed: ReturnType<typeof parseArgs>,
  io: CliIo,
  humanSuccess: string,
): number {
  const reportFailed = response.ok
    && (
      response.command === 'asset validate'
      || response.command === 'asset inspect'
    )
    && typeof response.data === 'object'
    && response.data !== null
    && 'valid' in response.data
    && response.data.valid === false;
  const doctorFailed = response.ok
    && response.command === 'asset doctor'
    && typeof response.data === 'object'
    && response.data !== null
    && 'healthy' in response.data
    && response.data.healthy === false;
  const exitCode = response.ok && !reportFailed && !doctorFailed ? 0 : 1;
  if (flagBoolean(parsed.flags, 'json')) {
    io.stdout(formatJsonResponse(response));
  } else if (exitCode === 0) {
    io.stdout(formatHumanResponse(response, humanSuccess));
  } else {
    io.stderr(formatHumanResponse(response, humanSuccess));
  }
  return exitCode;
}

export function commandNeedsAssets(parsed: ParsedArgs): boolean {
  if (parsed.flags.has('help')) return false;
  if (
    parsed.command[0] === 'asset'
    && parsed.command[1] === 'authoring'
    && parsed.command[2] === 'provider'
  ) return false;
  if (parsed.command[0] === 'asset') {
    return assetCommandRequirements(parsed)?.runtime ?? false;
  }
  if (parsed.command[0] === 'catalog') return true;
  if (parsed.command[0] === 'selection') return true;
  if (parsed.command[0] === 'render') return true;
  if (parsed.command[0] === 'token') return parsed.command[1] === 'encode';
  if (parsed.command[0] === 'preset') return parsed.command[1] !== 'list';
  if (parsed.command[0] === 'character') return characterCommandNeedsAssets(parsed);
  if (parsed.command[0] === 'web') return true;
  if (parsed.command[0] === 'agent') return false;
  return false;
}

function webOptionInput(
  parsed: ParsedArgs,
): Parameters<typeof validateWebOptions>[0] {
  const host = flagString(parsed.flags, 'host');
  const port = flagString(parsed.flags, 'port');
  return {
    ...(host === undefined ? {} : { host }),
    ...(port === undefined ? {} : { port }),
    noOpen: flagBoolean(parsed.flags, 'no-open'),
  };
}

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host);
}

function preflightCommand(parsed: ParsedArgs): CliResponse<null> | undefined {
  const command = parsed.command[0];
  const subcommand = parsed.command[1];

  if (command === 'capabilities') {
    if (subcommand !== undefined) {
      return commandError(parsed.command.join(' '), {
        code: 'unknown_command',
        message: `Unknown capabilities command: ${parsed.command.join(' ')}`,
      });
    }
  }

  if (command === 'agent') {
    const commandName = parsed.command.join(' ');
    if (
      parsed.command.length !== 3
      || subcommand !== 'integration'
      || parsed.command[2] !== 'check'
    ) {
      return commandError(commandName, {
        code: 'unknown_command',
        message: `Unknown Agent command: ${commandName}`,
      });
    }
    if (!flagString(parsed.flags, 'manifest')) {
      return commandError(commandName, {
        code: 'missing_argument',
        message: '--manifest is required.',
        path: '--manifest',
      });
    }
  }

  if (
    command === 'asset'
    && subcommand === 'authoring'
    && parsed.command[2] === 'provider'
  ) {
    const commandName = parsed.command.join(' ');
    const providerCommand = parsed.command[3];
    if (
      parsed.command.length !== 4
      || (providerCommand !== 'discover' && providerCommand !== 'preflight')
    ) {
      return commandError(commandName, {
        code: 'unknown_command',
        message: `Unknown asset provider command: ${commandName}`,
      });
    }
    const requiredStringFlag = (name: string): CliResponse<null> | undefined => {
      if (flagString(parsed.flags, name)) return undefined;
      return commandError(commandName, {
        code: 'missing_argument',
        message: `--${name} is required.`,
        path: `--${name}`,
      });
    };
    for (const name of providerCommand === 'discover'
      ? ['session', 'contract-digest', 'descriptors']
      : ['session', 'contract-digest', 'descriptor']) {
      const issue = requiredStringFlag(name);
      if (issue) return issue;
    }
  }

  if (command === 'asset' && subcommand === 'authoring') {
    const authoringCommand = parsed.command[2];
    const commandName = parsed.command.join(' ');
    if (
      authoringCommand !== 'start'
      && authoringCommand !== 'status'
      && authoringCommand !== 'resume'
      && authoringCommand !== 'contract'
      && authoringCommand !== 'import'
      && authoringCommand !== 'validate'
      && authoringCommand !== 'acknowledge'
      && authoringCommand !== 'declare'
      && authoringCommand !== 'accept-preview'
      && authoringCommand !== 'draft'
      && authoringCommand !== 'pack'
      && authoringCommand !== 'provenance'
      && authoringCommand !== 'inspect'
      && authoringCommand !== 'install'
      && authoringCommand !== 'sync'
      && authoringCommand !== 'preview'
      && authoringCommand !== 'reconcile-manifest'
      && authoringCommand !== 'provider'
    ) {
      return commandError(commandName, {
        code: 'unknown_command',
        message: `Unknown asset authoring command: ${commandName}`,
      });
    }

    const requiredStringFlag = (name: string): CliResponse<null> | undefined => {
      if (flagString(parsed.flags, name)) return undefined;
      return commandError(commandName, {
        code: 'missing_argument',
        message: `--${name} is required.`,
        path: `--${name}`,
      });
    };

    if (authoringCommand === 'start') return requiredStringFlag('plan');
    if (
      authoringCommand === 'status'
      || authoringCommand === 'resume'
      || authoringCommand === 'contract'
      || authoringCommand === 'validate'
      || authoringCommand === 'draft'
      || authoringCommand === 'pack'
      || authoringCommand === 'provenance'
      || authoringCommand === 'sync'
      || authoringCommand === 'preview'
    ) {
      return requiredStringFlag('session');
    }
    if (authoringCommand === 'acknowledge') {
      const sessionIssue = requiredStringFlag('session');
      return sessionIssue ?? requiredStringFlag('acknowledgement');
    }
    if (authoringCommand === 'declare') {
      const sessionIssue = requiredStringFlag('session');
      return sessionIssue ?? requiredStringFlag('declaration');
    }
    if (authoringCommand === 'accept-preview') {
      const sessionIssue = requiredStringFlag('session');
      return sessionIssue ?? requiredStringFlag('preview-digest');
    }
    if (authoringCommand === 'inspect') {
      const sessionIssue = requiredStringFlag('session');
      return sessionIssue ?? requiredStringFlag('archive');
    }
    if (authoringCommand === 'install') {
      const sessionIssue = requiredStringFlag('session');
      const archiveIssue = sessionIssue ?? requiredStringFlag('archive');
      return archiveIssue ?? requiredStringFlag('consumer-workspace');
    }
    if (authoringCommand === 'import') {
      for (const name of ['session', 'target', 'candidate', 'contract-digest']) {
        const issue = requiredStringFlag(name);
        if (issue) return issue;
      }
      const expectedTargetDigest = flagString(parsed.flags, 'expected-target-digest');
      if (flagBoolean(parsed.flags, 'replace-existing') && !expectedTargetDigest) {
        return commandError(commandName, {
          code: 'missing_argument',
          message: '--expected-target-digest is required with --replace-existing.',
          path: '--expected-target-digest',
        });
      }
      if (!flagBoolean(parsed.flags, 'replace-existing') && expectedTargetDigest !== undefined) {
        return commandError(commandName, {
          code: 'invalid_option',
          message: '--expected-target-digest requires --replace-existing.',
          path: '--expected-target-digest',
        });
      }
      return undefined;
    }
    if (authoringCommand === 'reconcile-manifest') {
      for (const name of ['session', 'use', 'expected-external-digest']) {
        const issue = requiredStringFlag(name);
        if (issue) return issue;
      }
    }
  }

  if (
    (command === 'catalog' && subcommand === 'items')
    || (command === 'character' && subcommand === 'search')
  ) {
    const issue = discoveryPaginationIssue(parsed.flags);
    if (issue) return commandError(parsed.command.join(' '), issue);
  }

  if (command === 'catalog') {
    if (
      subcommand !== 'types'
      && subcommand !== 'items'
      && subcommand !== 'item'
      && subcommand !== 'audit-animations'
    ) {
      return commandError(parsed.command.join(' '), {
        code: 'unknown_command',
        message: `Unknown catalog command: ${parsed.command.join(' ')}`,
      });
    }
    if (subcommand === 'item' && !parsed.positionals[0]) {
      return commandError('catalog item', {
        code: 'missing_argument',
        message: 'catalog item requires an item id or type/name.',
      });
    }
    if (subcommand === 'audit-animations' && flagStrings(parsed.flags, 'animation').length === 0) {
      return commandError('catalog audit-animations', {
        code: 'missing_argument',
        message: '--animation is required and may be repeated.',
        path: '--animation',
      });
    }
  }

  if (command === 'selection') {
    if (subcommand !== 'validate') {
      return commandError(parsed.command.join(' '), {
        code: 'unknown_command',
        message: `Unknown selection command: ${parsed.command.join(' ')}`,
      });
    }
    if (!flagString(parsed.flags, 'selection')) {
      return commandError('selection validate', {
        code: 'missing_argument',
        message: '--selection is required.',
      });
    }
  }

  if (command === 'render') {
    if (subcommand !== undefined) {
      return commandError(parsed.command.join(' '), {
        code: 'unknown_command',
        message: `Unknown render command: ${parsed.command.join(' ')}`,
      });
    }
    if (!flagString(parsed.flags, 'selection') || !flagString(parsed.flags, 'out')) {
      return commandError('render', {
        code: 'missing_argument',
        message: '--selection and --out are required.',
      });
    }
  }

  if (command === 'preset') {
    if (subcommand !== 'list' && subcommand !== 'materialize' && subcommand !== 'render') {
      return commandError(parsed.command.join(' '), {
        code: 'unknown_command',
        message: `Unknown preset command: ${parsed.command.join(' ')}`,
      });
    }
    if (subcommand === 'materialize' && !parsed.positionals[0]) {
      return commandError('preset materialize', {
        code: 'missing_argument',
        message: 'Preset id is required.',
      });
    }
    if (
      subcommand === 'render' &&
      (!parsed.positionals[0] || !flagString(parsed.flags, 'out'))
    ) {
      return commandError('preset render', {
        code: 'missing_argument',
        message: 'Preset id and --out are required.',
      });
    }
  }

  if (command === 'web') {
    if (subcommand !== undefined) {
      return commandError(parsed.command.join(' '), {
        code: 'unknown_command',
        message: `Unknown web command: ${parsed.command.join(' ')}`,
      });
    }
    if (parsed.positionals.length > 0) {
      return commandError('web', {
        code: 'unexpected_argument',
        message: 'web does not accept positional arguments.',
      });
    }
    if (flagBoolean(parsed.flags, 'json')) {
      return commandError('web', {
        code: 'invalid_option',
        message: '--json is not supported by the web command.',
      });
    }
    for (const [name, value] of parsed.flags) {
      if (name !== 'host' && name !== 'port' && name !== 'no-open') {
        return commandError('web', {
          code: 'unknown_option',
          message: `Unknown web option: --${name}`,
        });
      }
      if ((name === 'host' || name === 'port') && typeof value !== 'string') {
        return commandError('web', {
          code: 'invalid_option',
          message: `--${name} requires a value.`,
        });
      }
    }
    try {
      validateWebOptions(webOptionInput(parsed));
    } catch (error) {
      return commandError('web', {
        code: 'invalid_option',
        message: error instanceof Error ? error.message : 'Invalid web options.',
      });
    }
  }

  return undefined;
}

export async function runCli(
  argv: readonly string[],
  io: CliIo,
  dependencies: Partial<CliDependencies> = {},
): Promise<number> {
  return runCliWithRuntime(argv, io, dependencies);
}

async function runCliWithRuntime(
  argv: readonly string[],
  io: CliIo,
  dependencies: Partial<CliDependencies>,
  activeRuntime?: RuntimeAssets,
): Promise<number> {
  const resolvedDependencies: CliDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    io.stdout(helpForCommand([]));
    return 0;
  }
  if (argv[0] === '--version' || argv[0] === '-V') {
    io.stdout(`${CLI_VERSION}\n`);
    return 0;
  }

  const parsed = parseArgs(argv);
  if (
    parsed.flags.size === 0
    && (
      (parsed.command.length === 1 && parsed.command[0] === 'asset')
      || (parsed.command.length === 1 && parsed.command[0] === 'agent')
      || (
        parsed.command.length === 2
        && parsed.command[0] === 'asset'
        && (
          parsed.command[1] === 'workspace'
          || parsed.command[1] === 'authoring'
          || parsed.command[1] === 'provenance'
        )
      )
      || (
        parsed.command.length === 2
        && parsed.command[0] === 'agent'
        && parsed.command[1] === 'integration'
      )
      || (
        parsed.command.length === 3
        && parsed.command[0] === 'asset'
        && parsed.command[1] === 'authoring'
        && parsed.command[2] === 'provider'
      )
    )
  ) {
    io.stdout(helpForCommand(parsed.command));
    return 0;
  }
  if (parsed.flags.has('help')) {
    io.stdout(helpForCommand(parsed.command));
    return 0;
  }

  const optionIssue = validateCommandOptions(parsed);
  if (optionIssue) {
    return writeResponse(
      commandError(parsed.command.join(' '), optionIssue),
      parsed,
      io,
      '',
    );
  }

  const argumentIssue = validateCommandArguments(parsed);
  if (argumentIssue) {
    return writeResponse(
      commandError(parsed.command.join(' '), argumentIssue),
      parsed,
      io,
      '',
    );
  }

  const preflightResponse = preflightCommand(parsed)
    ?? ((parsed.command[0] === 'asset' && parsed.command[1] === 'authoring')
      || parsed.command[0] === 'agent'
      ? undefined
      : preflightAssetCommand(parsed));
  if (preflightResponse !== undefined) {
    return writeResponse(preflightResponse, parsed, io, '');
  }

  if (parsed.command[0] === 'capabilities') {
    return writeResponse(
      commandOk('capabilities', createCapabilityAdvertisement()),
      parsed,
      io,
      'Capabilities advertised.\n',
    );
  }

  if (
    parsed.command[0] === 'agent'
    && parsed.command[1] === 'integration'
    && parsed.command[2] === 'check'
  ) {
    return writeResponse(
      runAgentIntegrationCommand(parsed, io.cwd),
      parsed,
      io,
      'Agent integration is compatible.\n',
    );
  }

  if (
    parsed.command[0] === 'asset'
    && parsed.command[1] === 'authoring'
    && parsed.command[2] === 'provider'
  ) {
    let workspace: AssetWorkspace | undefined;
    if (parsed.command[3] === 'preflight') {
      try {
        workspace = resolvedDependencies.findAssetWorkspace(
          io.cwd,
          flagString(parsed.flags, 'workspace'),
        );
      } catch {
        return writeResponse(
          commandError('asset authoring provider preflight', {
            code: 'asset_workspace_not_found',
            message: 'An asset workspace is required for provider preflight.',
            path: '--workspace',
          }),
          parsed,
          io,
          '',
        );
      }
    }
    return writeResponse(
      runAssetProviderCommand({ parsed, cwd: io.cwd, ...(workspace === undefined ? {} : { workspace }) }),
      parsed,
      io,
      'Provider command completed.\n',
    );
  }

  if (
    parsed.command[0] === 'asset'
    && parsed.command[1] === 'workspace'
    && parsed.command[2] === 'init'
  ) {
    try {
      const workspace = resolvedDependencies.initializeAssetWorkspace(
        path.resolve(io.cwd, parsed.positionals[0]!),
      );
      return writeResponse(
        commandOk('asset workspace init', workspace),
        parsed,
        io,
        'Asset workspace initialized.\n',
      );
    } catch (error) {
      return writeResponse(
        commandError('asset workspace init', {
          code: 'asset_workspace_init_failed',
          message: error instanceof Error
            ? error.message
            : 'Asset workspace initialization failed.',
          path: path.resolve(io.cwd, parsed.positionals[0]!),
        }),
        parsed,
        io,
        '',
      );
    }
  }

  if (parsed.command[0] === 'asset') {
    const requirements = assetCommandRequirements(parsed);
    if (requirements === undefined) {
      return writeResponse(
        commandError(parsed.command.join(' '), {
          code: 'unknown_command',
          message: `Unknown asset command: ${parsed.command.join(' ')}`,
        }),
        parsed,
        io,
        '',
      );
    }

    let workspace: AssetWorkspace | undefined;
    if (requirements.workspace) {
      try {
        workspace = resolvedDependencies.findAssetWorkspace(
          io.cwd,
          flagString(parsed.flags, 'workspace'),
        );
      } catch (error) {
        return writeResponse(
          commandError(parsed.command.join(' '), {
            code: 'asset_workspace_not_found',
            message: error instanceof Error ? error.message : 'Asset workspace not found.',
            path: flagString(parsed.flags, 'workspace') ?? io.cwd,
          }),
          parsed,
          io,
          '',
        );
      }

      const workspacePreflightResponse = preflightAssetWorkspaceCommand(
        parsed,
        io.cwd,
        workspace,
      );
      if (workspacePreflightResponse !== undefined) {
        return writeResponse(workspacePreflightResponse, parsed, io, '');
      }
    }

    let assetRuntime: RuntimeAssets | undefined;
    if (requirements.runtime) {
      try {
        assetRuntime = await resolvedDependencies.prepareRuntimeAssets({
          cwd: workspace?.root ?? io.cwd,
          managedCacheOnly: true,
          onProgress: (progress) =>
            io.stderr(formatProgress(progress.phase, progress.message)),
        });
      } catch (error) {
        return writeResponse(
          commandError(parsed.command.join(' '), assetCacheErrorIssue(error)),
          parsed,
          io,
          '',
        );
      }
    }

    const response = await runAssetCommand({
      parsed,
      cwd: io.cwd,
      ...(workspace === undefined ? {} : { workspace }),
      ...(assetRuntime === undefined ? {} : { runtime: assetRuntime }),
    });
    return writeResponse(response, parsed, io, 'Asset command completed.\n');
  }

  let runtime: RuntimeAssets | undefined = activeRuntime;
  if (runtime === undefined && commandNeedsAssets(parsed)) {
    try {
      const workspace = findRuntimeAssetWorkspace(io.cwd);
      const preparedRuntime = await resolvedDependencies.prepareRuntimeAssets({
        cwd: io.cwd,
        ...(parsed.command[0] === 'web' || workspace !== undefined
          ? { managedCacheOnly: true }
          : {}),
        onProgress: (progress) =>
          io.stderr(formatProgress(progress.phase, progress.message)),
      });
      return await withWorkspaceRuntimeAssets({
        runtime: preparedRuntime,
        cwd: io.cwd,
        ...(workspace === undefined ? {} : { workspace }),
        action: (workspaceRuntime) => runCliWithRuntime(
          argv,
          io,
          resolvedDependencies,
          workspaceRuntime,
        ),
      });
    } catch (error) {
      return writeResponse(
        commandError(
          parsed.command.join(' '),
          error instanceof AssetWorkspaceRuntimeError
            ? {
              code: error.code,
              message: error.message,
              ...(error.path === undefined ? {} : { path: error.path }),
            }
            : assetCacheErrorIssue(error),
        ),
        parsed,
        io,
        '',
      );
    }
  }

  if (parsed.command[0] === 'catalog') {
    const response = parsed.command[1] === 'audit-animations'
      ? await runAnimationAuditCommand(parsed, runtime!)
      : runCatalogCommand(parsed, runtime!);
    return writeResponse(
      response,
      parsed,
      io,
      'Catalog command completed.\n',
    );
  }

  if (parsed.command[0] === 'selection') {
    return writeResponse(
      runSelectionCommand(parsed, runtime!),
      parsed,
      io,
      'Selection is valid.\n',
    );
  }

  if (parsed.command[0] === 'web') {
    const options = validateWebOptions(webOptionInput(parsed));
    try {
      const running = await resolvedDependencies.startWebServer({
        ...options,
        webRoot: resolveWebRoot(import.meta.url),
        assetsRoot: runtime!.context.assetsRoot,
      });
      io.stdout(`${running.url}\n`);
      const requestedHost = flagString(parsed.flags, 'host');
      if (requestedHost !== undefined && !isLoopbackHost(requestedHost)) {
        io.stderr('Warning: The web UI is reachable from other machines on your network; use only on a trusted network.\n');
      }
      await running.closed;
      return 0;
    } catch (error) {
      return writeResponse(
        commandError('web', renderErrorIssue(error, 'Web server failed.')),
        parsed,
        io,
        '',
      );
    }
  }

  if (parsed.command[0] === 'token') {
    return writeResponse(
      runTokenCommand(parsed, io.cwd, runtime),
      parsed,
      io,
      'Token command completed.\n',
    );
  }

  if (parsed.command[0] === 'character') {
    const response = await runCharacterCommand(parsed, io, runtime);
    return writeResponse(response, parsed, io, 'Character command completed.\n');
  }

  if (parsed.command[0] === 'render') {
    const selectionPath = flagString(parsed.flags, 'selection');
    const outDir = flagString(parsed.flags, 'out');
    if (!selectionPath || !outDir) {
      return writeResponse(
        commandError('render', {
          code: 'missing_argument',
          message: '--selection and --out are required.',
        }),
        parsed,
        io,
        '',
      );
    }

    let documentWarnings: readonly CliIssue[] = [];
    try {
      const documentContext = loadSelectionDocumentContext(runtime!);
      documentWarnings = documentContext.warnings;
      const loaded = readSelectionDocumentFile(
        io.cwd,
        selectionPath,
        documentContext.importContext,
      );
      const result = await renderSelection({
        runtime: runtime!,
        cwd: io.cwd,
        outDir: path.resolve(io.cwd, outDir),
        selectionName: loaded.selection.name ?? 'sprite',
        selectionJson: loaded.selection,
        animations: flagStrings(parsed.flags, 'animation'),
        frames:
          flagString(parsed.flags, 'frames') === 'all'
            ? 'all'
            : flagStrings(parsed.flags, 'frames'),
        bundleZip: flagString(parsed.flags, 'bundle') === 'zip',
        allowPartial: flagBoolean(parsed.flags, 'allow-partial'),
      });
      return writeResponse(
        commandOk('render', result, result.warnings),
        parsed,
        io,
        'Render complete.\n',
      );
    } catch (error) {
      return writeResponse(
        commandError(
          'render',
          renderErrorIssue(error, 'Render failed.', selectionPath),
          documentWarnings,
        ),
        parsed,
        io,
        '',
      );
    }
  }

  if (parsed.command[0] === 'preset' && parsed.command[1] === 'render') {
    const presetId = parsed.positionals[0];
    const outDir = flagString(parsed.flags, 'out');
    if (!presetId || !outDir) {
      return writeResponse(
        commandError('preset render', {
          code: 'missing_argument',
          message: 'Preset id and --out are required.',
        }),
        parsed,
        io,
        '',
      );
    }

    try {
      const catalog = loadRuntimeCatalog(runtime!);
      const palettes = loadRuntimePalettes(runtime!);
      const selectionJson = materializePreset(presetId, {
        catalog: catalog.catalog,
        palettes: palettes.palettes,
      });
      const result = await renderSelection({
        runtime: runtime!,
        cwd: io.cwd,
        outDir: path.resolve(io.cwd, outDir),
        selectionName: selectionJson.name ?? presetId,
        selectionJson,
        animations: flagStrings(parsed.flags, 'animation'),
        frames:
          flagString(parsed.flags, 'frames') === 'all'
            ? 'all'
            : flagStrings(parsed.flags, 'frames'),
        bundleZip: flagString(parsed.flags, 'bundle') === 'zip',
        allowPartial: flagBoolean(parsed.flags, 'allow-partial'),
      });
      return writeResponse(
        commandOk('preset render', result, result.warnings),
        parsed,
        io,
        'Render complete.\n',
      );
    } catch (error) {
      return writeResponse(
        commandError(
          'preset render',
          renderErrorIssue(error, 'Preset render failed.'),
        ),
        parsed,
        io,
        '',
      );
    }
  }

  if (parsed.command[0] === 'preset') {
    return writeResponse(
      runPresetCommand(parsed, io.cwd, runtime),
      parsed,
      io,
      'Preset command completed.\n',
    );
  }

  const commandName = parsed.command.join(' ');
  const error = commandError(commandName || 'unknown', {
    code: 'unknown_command',
    message: `Unknown command: ${argv.join(' ')}`,
  });

  if (flagBoolean(parsed.flags, 'json')) {
    io.stdout(formatJsonResponse(error));
  } else {
    io.stderr(`${error.errors[0]!.message}\n`);
  }
  return 1;
}
