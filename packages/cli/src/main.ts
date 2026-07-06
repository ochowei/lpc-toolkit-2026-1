import path from 'node:path';
import { flagBoolean, flagString, flagStrings, parseArgs } from './args.js';
import { runCatalogCommand } from './catalog-commands.js';
import { createRuntimeContext } from './context.js';
import { loadCatalogFromRoots, loadPalettesFromRoot } from './loaders.js';
import { materializePreset, runPresetCommand } from './preset-commands.js';
import { readSelectionJsonFile, renderSelection } from './render.js';
import {
  commandError,
  commandOk,
  formatJsonResponse,
  humanIssue,
  type CliResponse,
} from './response.js';
import { runSelectionCommand } from './selection-commands.js';
import { runTokenCommand } from './token-commands.js';

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly cwd: string;
}

const HELP = `lpc-toolkit CLI

Commands:
  lpc catalog types
  lpc catalog items --type <typeName>
  lpc catalog item <item-id-or-type/name>
  lpc selection validate --selection <file>
  lpc render --selection <file> --out <dir>
  lpc token decode --token <hash-or-token> --out <file>
  lpc token encode --selection <file>
  lpc preset list
  lpc preset materialize <preset-id> --out <file>
  lpc preset render <preset-id> --out <dir>
`;

function writeResponse(
  response: CliResponse<unknown>,
  parsed: ReturnType<typeof parseArgs>,
  io: CliIo,
  humanSuccess: string,
): number {
  if (flagBoolean(parsed.flags, 'json')) {
    io.stdout(formatJsonResponse(response));
  } else if (response.ok) {
    io.stdout(humanSuccess);
  } else {
    io.stderr(`${response.errors.map(humanIssue).join('\n')}\n`);
  }
  return response.ok ? 0 : 1;
}

export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    io.stdout(HELP);
    return 0;
  }

  const parsed = parseArgs(argv);
  if (parsed.command[0] === 'catalog') {
    return writeResponse(
      runCatalogCommand(parsed, io.cwd),
      parsed,
      io,
      'Catalog command completed.\n',
    );
  }

  if (parsed.command[0] === 'selection') {
    return writeResponse(
      runSelectionCommand(parsed, io.cwd),
      parsed,
      io,
      'Selection is valid.\n',
    );
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
        commandError('render', {
          code: 'render_failed',
          message: error instanceof Error ? error.message : 'Render failed.',
          path: selectionPath,
        }),
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
      const context = createRuntimeContext({ cwd: io.cwd });
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
        commandError('preset render', {
          code: 'render_failed',
          message: error instanceof Error ? error.message : 'Preset render failed.',
        }),
        parsed,
        io,
        '',
      );
    }
  }

  if (parsed.command[0] === 'preset') {
    return writeResponse(
      runPresetCommand(parsed, io.cwd),
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
