import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  flagBoolean,
  flagString,
  flagStrings,
  parseArgs,
  type ParsedArgs,
} from './args.js';
import { assetCacheErrorIssue } from './asset-cache.js';
import { AssetStoreError } from './asset-store.js';
import { runCatalogCommand } from './catalog-commands.js';
import { loadCatalogFromRoots, loadPalettesFromRoot } from './loaders.js';
import { materializePreset, runPresetCommand } from './preset-commands.js';
import { CLI_VERSION } from './package-info.js';
import { readSelectionJsonFile, renderSelection } from './render.js';
import {
  commandError,
  commandOk,
  formatProgress,
  formatHumanResponse,
  formatJsonResponse,
  type CliResponse,
} from './response.js';
import {
  prepareRuntimeAssets,
  type RuntimeAssets,
} from './runtime-assets.js';
import { runSelectionCommand } from './selection-commands.js';
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
}

const DEFAULT_DEPENDENCIES: CliDependencies = { prepareRuntimeAssets, startWebServer };

export function resolveWebRoot(moduleUrl: string): string {
  return fileURLToPath(new URL('./web', moduleUrl));
}

const HELP = `lpc-toolkit CLI

Commands:
  lpc-toolkit --version
  lpc-toolkit -V
  lpc-toolkit catalog types
  lpc-toolkit catalog items --type <typeName>
  lpc-toolkit catalog item <item-id-or-type/name>
  lpc-toolkit selection validate --selection <file>
  lpc-toolkit render --selection <file> --out <dir>
  lpc-toolkit token decode --token <hash-or-token> --out <file>
  lpc-toolkit token encode --selection <file>
  lpc-toolkit preset list
  lpc-toolkit preset materialize <preset-id> --out <file>
  lpc-toolkit preset render <preset-id> --out <dir>
  lpc-toolkit web [--host <host>] [--port <port>] [--no-open]
`;

function renderErrorIssue(
  error: unknown,
  fallbackMessage: string,
  fallbackPath?: string,
): { readonly code: string; readonly message: string; readonly path?: string } {
  if (error instanceof AssetStoreError) {
    return { code: error.code, message: error.message, path: error.path };
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
  if (flagBoolean(parsed.flags, 'json')) {
    io.stdout(formatJsonResponse(response));
  } else if (response.ok) {
    io.stdout(formatHumanResponse(response, humanSuccess));
  } else {
    io.stderr(formatHumanResponse(response, humanSuccess));
  }
  return response.ok ? 0 : 1;
}

export function commandNeedsAssets(parsed: ParsedArgs): boolean {
  if (parsed.flags.has('help')) return false;
  if (parsed.command[0] === 'catalog') return true;
  if (parsed.command[0] === 'selection') return true;
  if (parsed.command[0] === 'render') return true;
  if (parsed.command[0] === 'preset') return parsed.command[1] !== 'list';
  if (parsed.command[0] === 'web') return true;
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

function preflightAssetCommand(parsed: ParsedArgs): CliResponse<null> | undefined {
  const command = parsed.command[0];
  const subcommand = parsed.command[1];

  if (command === 'catalog') {
    if (subcommand !== 'types' && subcommand !== 'items' && subcommand !== 'item') {
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
  const resolvedDependencies: CliDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    io.stdout(HELP);
    return 0;
  }
  if (argv[0] === '--version' || argv[0] === '-V') {
    io.stdout(`${CLI_VERSION}\n`);
    return 0;
  }

  const parsed = parseArgs(argv);
  if (parsed.flags.has('help')) {
    io.stdout(HELP);
    return 0;
  }

  const preflightResponse = preflightAssetCommand(parsed);
  if (preflightResponse !== undefined) {
    return writeResponse(preflightResponse, parsed, io, '');
  }

  let runtime: RuntimeAssets | undefined;
  if (commandNeedsAssets(parsed)) {
    try {
      runtime = await resolvedDependencies.prepareRuntimeAssets({
        cwd: io.cwd,
        ...(parsed.command[0] === 'web' ? { managedCacheOnly: true } : {}),
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

  if (parsed.command[0] === 'catalog') {
    return writeResponse(
      runCatalogCommand(parsed, runtime!),
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
      runTokenCommand(parsed, io.cwd),
      parsed,
      io,
      'Token command completed.\n',
    );
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

    try {
      const selectionJson = readSelectionJsonFile(io.cwd, selectionPath);
      const result = await renderSelection({
        runtime: runtime!,
        cwd: io.cwd,
        outDir: path.resolve(io.cwd, outDir),
        selectionName: selectionJson.name ?? 'sprite',
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
      const context = runtime!.context;
      const catalog = loadCatalogFromRoots(
        context.sheetDefinitionsRoot,
        context.customSheetDefinitionsRoot,
      );
      const palettes = loadPalettesFromRoot(context.paletteDefinitionsRoot);
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
