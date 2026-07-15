export type FlagValue = true | string | readonly string[];

export interface ParsedArgs {
  readonly command: readonly string[];
  readonly flags: ReadonlyMap<string, FlagValue>;
  readonly positionals: readonly string[];
}

const BOOLEAN_FLAGS = new Set(['all', 'allow-partial', 'help', 'json', 'no-open']);

function addFlag(
  flags: Map<string, FlagValue>,
  key: string,
  value: true | string,
): void {
  const previous = flags.get(key);
  if (previous === undefined) {
    flags.set(key, value);
    return;
  }
  if (Array.isArray(previous)) {
    flags.set(key, [...previous, String(value)]);
    return;
  }
  flags.set(key, [String(previous), String(value)]);
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const command: string[] = [];
  const positionals: string[] = [];
  const flags = new Map<string, FlagValue>();
  let seenFlag = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token.startsWith('--')) {
      seenFlag = true;
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!BOOLEAN_FLAGS.has(key) && next && !next.startsWith('--')) {
        addFlag(flags, key, next);
        i++;
      } else {
        addFlag(flags, key, true);
      }
      continue;
    }

    if (!seenFlag && command.length < 2) {
      command.push(token);
    } else {
      positionals.push(token);
    }
  }

  return { command, flags, positionals };
}

export function flagString(
  flags: ReadonlyMap<string, FlagValue>,
  key: string,
): string | undefined {
  const value = flags.get(key);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

export function flagStrings(
  flags: ReadonlyMap<string, FlagValue>,
  key: string,
): readonly string[] {
  const value = flags.get(key);
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value;
  return [];
}

export function flagBoolean(
  flags: ReadonlyMap<string, FlagValue>,
  key: string,
): boolean {
  return flags.get(key) === true;
}
