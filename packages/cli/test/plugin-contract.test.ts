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
const characterContractPath = path.resolve(
  here,
  '../../../plugins/lpc-toolkit/skills/character-authoring/references/cli-contract.json',
);
const characterContract = JSON.parse(
  readFileSync(characterContractPath, 'utf8'),
) as PluginContract;
const auditContractPath = path.resolve(
  here,
  '../../../plugins/lpc-toolkit/skills/animation-asset-audit/references/cli-contract.json',
);
const auditContract = JSON.parse(readFileSync(auditContractPath, 'utf8')) as PluginContract;
const workflowPath = path.resolve(
  here,
  '../../../plugins/lpc-toolkit/skills/character-authoring/references/cli-workflow.md',
);
const workflow = readFileSync(workflowPath, 'utf8');

describe('Codex plugin CLI contract', () => {
  it('uses the versioned character contract schema', () => {
    expect(characterContract.schema).toBe('lpc-toolkit.codex-plugin.cli-contract.v1');
    expect(characterContract.commands.map(({ id }) => id)).toEqual([
      'version',
      'preset-list',
      'character-create',
      'character-show',
      'character-search',
      'catalog-item',
      'character-set',
      'character-remove',
      'character-validate',
      'character-preview',
      'character-render',
    ]);
    expect(characterContract.commands.map(({ id }) => id)).toContain('catalog-item');
    expect(characterContract.commands.find(({ id }) => id === 'character-search')?.argv)
      .toContain('20');
  });

  it('uses the versioned audit contract schema', () => {
    expect(auditContract.schema).toBe('lpc-toolkit.codex-plugin.cli-contract.v1');
    expect(auditContract.commands.map(({ id }) => id)).toEqual([
      'version',
      'catalog-types',
      'catalog-items',
      'catalog-item',
      'catalog-audit-animations',
    ]);
  });

  it.each(
    [...characterContract.commands, ...auditContract.commands]
      .filter(({ id }) => id !== 'version'),
  )(
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

  it('documents the viewer without relying on commands outside the contract', () => {
    const contractCommands = new Set(
      characterContract.commands
        .map(({ argv }) => argv.filter((argument) => !argument.startsWith('--')).slice(0, 2))
        .filter((command) => command.length > 0)
        .map((command) => command.join(' ')),
    );
    const workflowCommands = [...workflow.matchAll(/^lpc-toolkit ([^\n]+)$/gmu)]
      .map(([, argv]) => argv!.split(/\s+/u).slice(0, 2).join(' '));

    expect(workflow).toContain('.viewer.html');
    expect(workflowCommands.length).toBeGreaterThan(0);
    expect(workflowCommands.every((command) => contractCommands.has(command))).toBe(true);
  });
});
