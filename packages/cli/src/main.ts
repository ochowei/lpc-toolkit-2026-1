import { flagBoolean, parseArgs } from './args.js';
import { commandError, formatJsonResponse } from './response.js';

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

export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    io.stdout(HELP);
    return 0;
  }

  const parsed = parseArgs(argv);
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
