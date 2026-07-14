import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.js';
import { helpForCommand, validateCommandOptions } from '../src/command-spec.js';

interface PluginCommand {
  readonly id: string;
  readonly argv: readonly string[];
  readonly machineReadable: boolean;
}

interface PluginContract {
  readonly schema: string;
  readonly commands: readonly PluginCommand[];
}

const here = path.dirname(fileURLToPath(import.meta.url));
const contractPath = path.resolve(
  here,
  '../../../plugins/lpc-toolkit/skills/character-authoring/references/cli-contract.json',
);
const contract = JSON.parse(readFileSync(contractPath, 'utf8')) as PluginContract;

describe('Codex plugin CLI contract', () => {
  it('uses the versioned contract schema', () => {
    expect(contract.schema).toBe('lpc-toolkit.codex-plugin.cli-contract.v1');
    expect(contract.commands.map(({ id }) => id)).toEqual([
      'version',
      'preset-list',
      'character-create',
      'character-show',
      'character-search',
      'character-set',
      'character-remove',
      'character-validate',
      'character-preview',
      'character-render',
    ]);
  });

  it.each(contract.commands.filter(({ id }) => id !== 'version'))(
    'keeps $id aligned with generated CLI options',
    ({ argv, machineReadable }) => {
      const parsed = parseArgs(argv);
      expect(validateCommandOptions(parsed)).toBeUndefined();
      expect(helpForCommand(parsed.command)).toContain(
        `lpc-toolkit ${parsed.command.join(' ')}`,
      );
      if (machineReadable) expect(parsed.flags.get('json')).toBe(true);
    },
  );
});
