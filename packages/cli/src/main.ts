import { flagBoolean, parseArgs } from './args.js';
import { runCatalogCommand } from './catalog-commands.js';
import {
  commandError,
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
