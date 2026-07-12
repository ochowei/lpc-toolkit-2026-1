import type { ParsedArgs } from './args.js';
import type { CliIssue } from './response.js';

type OptionKind = 'boolean' | 'value' | 'repeatable';

interface CommandOptionSpec {
  readonly name: string;
  readonly kind: OptionKind;
  readonly valueLabel?: string;
  readonly allowedValues?: readonly string[];
  readonly description: string;
}

interface CommandSpec {
  readonly command: readonly string[];
  readonly usage: string;
  readonly description: string;
  readonly options: readonly CommandOptionSpec[];
  readonly examples: readonly string[];
}

const HELP_OPTION: CommandOptionSpec = {
  name: 'help',
  kind: 'boolean',
  description: 'Show help for this command.',
};

const JSON_OPTION: CommandOptionSpec = {
  name: 'json',
  kind: 'boolean',
  description: 'Write a structured JSON response.',
};

const SELECTION_OPTION: CommandOptionSpec = {
  name: 'selection',
  kind: 'value',
  valueLabel: 'file',
  description: 'Use an explicit selection JSON file.',
};

const RENDER_OPTIONS: readonly CommandOptionSpec[] = [
  { name: 'out', kind: 'value', valueLabel: 'directory', description: 'Write artifacts to this directory.' },
  { name: 'animation', kind: 'repeatable', valueLabel: 'name', description: 'Render an animation; may be repeated.' },
  { name: 'frames', kind: 'repeatable', valueLabel: 'name|all', description: 'Select frames; may be repeated.' },
  {
    name: 'bundle',
    kind: 'value',
    valueLabel: 'zip',
    allowedValues: ['zip'],
    description: 'Bundle artifacts as a ZIP file.',
  },
  { name: 'allow-partial', kind: 'boolean', description: 'Allow partial animation output.' },
];

const COMMAND_SPECS: readonly CommandSpec[] = [
  {
    command: [],
    usage: 'lpc-toolkit <command> [options]',
    description: 'Compose, inspect, and render attributed LPC character sprites.',
    options: [HELP_OPTION],
    examples: [
      'lpc-toolkit --version',
      'lpc-toolkit -V',
      'lpc-toolkit catalog types',
      'lpc-toolkit character create hero',
    ],
  },
  {
    command: ['catalog'],
    usage: 'lpc-toolkit catalog <command>',
    description: 'Inspect the LPC asset catalog.',
    options: [HELP_OPTION],
    examples: ['lpc-toolkit catalog types', 'lpc-toolkit catalog items --type hair', 'lpc-toolkit catalog item hair/braid'],
  },
  {
    command: ['catalog', 'types'],
    usage: 'lpc-toolkit catalog types',
    description: 'List catalog type names.',
    options: [HELP_OPTION, JSON_OPTION],
    examples: ['lpc-toolkit catalog types'],
  },
  {
    command: ['catalog', 'items'],
    usage: 'lpc-toolkit catalog items [options]',
    description: 'List and filter catalog items.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      { name: 'type', kind: 'value', valueLabel: 'typeName', description: 'Filter by item type.' },
      { name: 'search', kind: 'value', valueLabel: 'text', description: 'Filter by matching text.' },
      { name: 'body-type', kind: 'value', valueLabel: 'type', description: 'Filter by body type.' },
      { name: 'animation', kind: 'value', valueLabel: 'name', description: 'Filter by animation.' },
      { name: 'license', kind: 'value', valueLabel: 'license', description: 'Filter by license.' },
    ],
    examples: ['lpc-toolkit catalog items --type hair'],
  },
  {
    command: ['catalog', 'item'],
    usage: 'lpc-toolkit catalog item <item-id-or-type/name>',
    description: 'Show one catalog item.',
    options: [HELP_OPTION, JSON_OPTION],
    examples: ['lpc-toolkit catalog item hair/braid'],
  },
  {
    command: ['selection'],
    usage: 'lpc-toolkit selection <command>',
    description: 'Work with selection documents.',
    options: [HELP_OPTION],
    examples: ['lpc-toolkit selection validate --selection hero.json'],
  },
  {
    command: ['selection', 'validate'],
    usage: 'lpc-toolkit selection validate --selection <file>',
    description: 'Validate a selection document.',
    options: [HELP_OPTION, JSON_OPTION, SELECTION_OPTION],
    examples: ['lpc-toolkit selection validate --selection hero.json'],
  },
  {
    command: ['render'],
    usage: 'lpc-toolkit render --selection <file> --out <directory> [options]',
    description: 'Render an attributed selection.',
    options: [HELP_OPTION, JSON_OPTION, SELECTION_OPTION, ...RENDER_OPTIONS],
    examples: ['lpc-toolkit render --selection hero.json --out rendered'],
  },
  {
    command: ['token'],
    usage: 'lpc-toolkit token <command>',
    description: 'Encode or decode selection tokens.',
    options: [HELP_OPTION],
    examples: ['lpc-toolkit token encode --selection hero.json', 'lpc-toolkit token decode --token v1.example'],
  },
  {
    command: ['token', 'encode'],
    usage: 'lpc-toolkit token encode --selection <file>',
    description: 'Encode a selection as a token.',
    options: [HELP_OPTION, JSON_OPTION, SELECTION_OPTION],
    examples: ['lpc-toolkit token encode --selection hero.json'],
  },
  {
    command: ['token', 'decode'],
    usage: 'lpc-toolkit token decode --token <hash-or-token> [--out <file>]',
    description: 'Decode a token to a selection.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      { name: 'token', kind: 'value', valueLabel: 'hash-or-token', description: 'Token to decode.' },
      { name: 'out', kind: 'value', valueLabel: 'file', description: 'Write the decoded selection to a file.' },
    ],
    examples: ['lpc-toolkit token decode --token v1.example --out hero.json'],
  },
  {
    command: ['preset'],
    usage: 'lpc-toolkit preset <command>',
    description: 'List, materialize, or render shared presets.',
    options: [HELP_OPTION],
    examples: ['lpc-toolkit preset list', 'lpc-toolkit preset materialize farmer --out farmer.json'],
  },
  {
    command: ['preset', 'list'],
    usage: 'lpc-toolkit preset list',
    description: 'List shared presets.',
    options: [HELP_OPTION, JSON_OPTION],
    examples: ['lpc-toolkit preset list'],
  },
  {
    command: ['preset', 'materialize'],
    usage: 'lpc-toolkit preset materialize <preset-id> [--out <file>]',
    description: 'Materialize a shared preset as a selection.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      { name: 'out', kind: 'value', valueLabel: 'file', description: 'Write the selection to a file.' },
    ],
    examples: ['lpc-toolkit preset materialize farmer --out farmer.json'],
  },
  {
    command: ['preset', 'render'],
    usage: 'lpc-toolkit preset render <preset-id> --out <directory> [options]',
    description: 'Render an attributed shared preset.',
    options: [HELP_OPTION, JSON_OPTION, ...RENDER_OPTIONS],
    examples: ['lpc-toolkit preset render farmer --out rendered'],
  },
  {
    command: ['web'],
    usage: 'lpc-toolkit web [options]',
    description: 'Start the local LPC Toolkit Web UI.',
    options: [
      HELP_OPTION,
      { name: 'host', kind: 'value', valueLabel: 'host', description: 'Host interface to bind.' },
      { name: 'port', kind: 'value', valueLabel: 'port', description: 'Port to listen on.' },
      { name: 'no-open', kind: 'boolean', description: 'Do not open a browser.' },
    ],
    examples: ['lpc-toolkit web --port 4173 --no-open'],
  },
  {
    command: ['character'],
    usage: 'lpc-toolkit character <command>',
    description: 'Create, edit, inspect, preview, and render named characters.',
    options: [HELP_OPTION],
    examples: ['lpc-toolkit character create hero', 'lpc-toolkit character show hero'],
  },
  {
    command: ['character', 'create'],
    usage: 'lpc-toolkit character create <name> [options]',
    description: 'Create a named character selection.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      SELECTION_OPTION,
      { name: 'preset', kind: 'value', valueLabel: 'id', description: 'Start from a shared preset.' },
      { name: 'body-type', kind: 'value', valueLabel: 'type', description: 'Set the initial body type. Default: male.' },
    ],
    examples: ['lpc-toolkit character create hero --body-type male'],
  },
  {
    command: ['character', 'list'],
    usage: 'lpc-toolkit character list',
    description: 'List named character selections.',
    options: [HELP_OPTION, JSON_OPTION],
    examples: ['lpc-toolkit character list'],
  },
  {
    command: ['character', 'show'],
    usage: 'lpc-toolkit character show (<name> | --selection <file>)',
    description: 'Show a character selection.',
    options: [HELP_OPTION, JSON_OPTION, SELECTION_OPTION],
    examples: ['lpc-toolkit character show hero'],
  },
  {
    command: ['character', 'search'],
    usage: 'lpc-toolkit character search (<name> | --selection <file>) --type <type> [options]',
    description: 'Search compatible items for a character type.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      SELECTION_OPTION,
      { name: 'type', kind: 'value', valueLabel: 'type', description: 'Selection type to search.' },
      { name: 'query', kind: 'value', valueLabel: 'text', description: 'Filter matching items.' },
    ],
    examples: ['lpc-toolkit character search hero --type hair --query braid'],
  },
  {
    command: ['character', 'set'],
    usage: 'lpc-toolkit character set (<name> | --selection <file>) --type <type> --item <item-id-or-type/name> [options]',
    description: 'Set or replace one selected character type.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      SELECTION_OPTION,
      { name: 'type', kind: 'value', valueLabel: 'type', description: 'Selection type to set.' },
      { name: 'item', kind: 'value', valueLabel: 'item-id-or-type/name', description: 'Catalog item to select.' },
      { name: 'variant', kind: 'value', valueLabel: 'id', description: 'Item variant to select.' },
      { name: 'recolor', kind: 'value', valueLabel: 'id', description: 'Item recolor to select.' },
    ],
    examples: [
      'lpc-toolkit character set hero --type hair --item hair_braid --recolor lpcr.brown',
    ],
  },
  {
    command: ['character', 'remove'],
    usage: 'lpc-toolkit character remove (<name> | --selection <file>) --type <type> [options]',
    description: 'Remove one selected character type.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      SELECTION_OPTION,
      { name: 'type', kind: 'value', valueLabel: 'type', description: 'Selection type to remove.' },
    ],
    examples: ['lpc-toolkit character remove hero --type hair'],
  },
  {
    command: ['character', 'validate'],
    usage: 'lpc-toolkit character validate (<name> | --selection <file>)',
    description: 'Validate a character selection.',
    options: [HELP_OPTION, JSON_OPTION, SELECTION_OPTION],
    examples: ['lpc-toolkit character validate hero'],
  },
  {
    command: ['character', 'preview'],
    usage: 'lpc-toolkit character preview (<name> | --selection <file>) [options]',
    description: 'Render one attributed preview frame.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      SELECTION_OPTION,
      { name: 'animation', kind: 'value', valueLabel: 'name', description: 'Animation to preview. Default: walk.' },
      { name: 'direction', kind: 'value', valueLabel: 'id', description: 'Direction to preview. Default: down.' },
      { name: 'frame', kind: 'value', valueLabel: 'index', description: 'Frame index to preview. Default: 0.' },
      { name: 'out', kind: 'value', valueLabel: 'directory', description: 'Write preview artifacts to this directory.' },
    ],
    examples: ['lpc-toolkit character preview hero --animation walk --direction down --frame 0'],
  },
  {
    command: ['character', 'render'],
    usage: 'lpc-toolkit character render (<name> | --selection <file>) --out <directory> [options]',
    description: 'Render an attributed character selection.',
    options: [HELP_OPTION, JSON_OPTION, SELECTION_OPTION, ...RENDER_OPTIONS],
    examples: ['lpc-toolkit character render hero --out rendered --animation walk'],
  },
];

function findCommandSpec(command: readonly string[]): CommandSpec | undefined {
  return COMMAND_SPECS.find(
    (spec) =>
      spec.command.length === command.length &&
      spec.command.every((part, index) => part === command[index]),
  );
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let diagonal = previous[0]!;
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const above = previous[rightIndex]!;
      previous[rightIndex] = Math.min(
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length]!;
}

function suggestOption(
  name: string,
  options: readonly CommandOptionSpec[],
): readonly string[] {
  const candidates = options
    .map((option) => ({ name: option.name, distance: editDistance(name, option.name) }))
    .sort((left, right) => left.distance - right.distance || left.name.localeCompare(right.name));
  const bestDistance = candidates[0]?.distance;
  if (bestDistance === undefined || bestDistance > 3) return [];
  return candidates
    .filter((candidate) => candidate.distance === bestDistance)
    .map((candidate) => `--${candidate.name}`);
}

function renderCommandSpec(spec: CommandSpec): string {
  const lines = [spec.description, '', 'Usage:', `  ${spec.usage}`];
  const children = COMMAND_SPECS.filter(
    (candidate) =>
      candidate.command.length === spec.command.length + 1 &&
      spec.command.every((part, index) => candidate.command[index] === part),
  );
  if (children.length > 0) {
    lines.push('', 'Commands:', ...children.map((child) => `  ${child.usage}`));
  }
  if (spec.options.length > 0) {
    lines.push(
      '',
      'Options:',
      ...spec.options.map((option) => {
        const value = option.kind === 'boolean' ? '' : ` <${option.valueLabel ?? 'value'}>`;
        return `  --${option.name}${value}  ${option.description}`;
      }),
    );
  }
  if (spec.examples.length > 0) {
    lines.push('', 'Examples:', ...spec.examples.map((example) => `  ${example}`));
  }
  return `${lines.join('\n')}\n`;
}

export function helpForCommand(command: readonly string[]): string {
  return renderCommandSpec(findCommandSpec(command) ?? COMMAND_SPECS[0]!);
}

export function validateCommandOptions(parsed: ParsedArgs): CliIssue | undefined {
  const spec = findCommandSpec(parsed.command);
  if (!spec) return undefined;
  for (const [name, value] of parsed.flags) {
    const option = spec.options.find((candidate) => candidate.name === name);
    if (!option) {
      return {
        code: 'unknown_option',
        message: `Unknown option: --${name}`,
        path: `--${name}`,
        details: { suggestions: suggestOption(name, spec.options) },
      };
    }
    if (option.kind !== 'boolean' && value === true) {
      return {
        code: 'invalid_option',
        message: `--${name} requires a value.`,
        path: `--${name}`,
      };
    }
    if (option.kind !== 'repeatable' && Array.isArray(value)) {
      return {
        code: 'invalid_option',
        message: `--${name} may be supplied only once.`,
        path: `--${name}`,
      };
    }
    if (
      option.allowedValues &&
      typeof value === 'string' &&
      !option.allowedValues.includes(value)
    ) {
      return {
        code: 'invalid_option',
        message: `Unsupported value for --${name}: ${value}`,
        path: `--${name}`,
        details: { available: option.allowedValues },
      };
    }
  }
  return undefined;
}
