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
const auditWorkflowPath = path.resolve(
  here,
  '../../../plugins/lpc-toolkit/skills/animation-asset-audit/references/audit-workflow.md',
);
const auditWorkflow = readFileSync(auditWorkflowPath, 'utf8');
const characterCompatibilityPath = path.resolve(
  here,
  '../../../plugins/lpc-toolkit/skills/character-authoring/references/compatibility.md',
);
const characterCompatibility = readFileSync(characterCompatibilityPath, 'utf8');
const auditCompatibilityPath = path.resolve(
  here,
  '../../../plugins/lpc-toolkit/skills/animation-asset-audit/references/compatibility.md',
);
const auditCompatibility = readFileSync(auditCompatibilityPath, 'utf8');

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
      'character-set-color',
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

  it('documents the CLI and Web handoff for audited asset work', () => {
    expect(auditWorkflow).toContain('asset init --from-audit');
    expect(auditWorkflow).toContain('Web Asset Pack Workbench');
    expect(auditWorkflow).toContain('status: "draft"');
    expect(auditWorkflow).toContain('cannot be installed by the CLI');
  });

  it('does not claim the newer asset-authoring session capability', () => {
    const pluginCommands = [...characterContract.commands, ...auditContract.commands];
    expect(pluginCommands.some(({ argv }) => argv.slice(0, 2).join(' ') === 'asset authoring'))
      .toBe(false);
    expect(pluginCommands.every(({ argv }) =>
      !(argv[0] === 'asset' && argv[1] === 'authoring'))).toBe(true);
    expect(workflow).not.toContain('asset authoring');
    expect(auditWorkflow).not.toContain('asset authoring');

    const unsupportedAuthoringCommand = parseArgs([
      'asset', 'authoring', 'start', '--plan', 'plan.json', '--json',
    ]);
    expect(
      pluginCommands.some(({ argv }) =>
        argv.slice(0, unsupportedAuthoringCommand.command.length).join(' ') ===
        unsupportedAuthoringCommand.command.join(' ')),
    ).toBe(false);
  });

  it('documents the plugin boundary for newer authoring capabilities', () => {
    for (const compatibility of [characterCompatibility, auditCompatibility]) {
      expect(compatibility).toContain('asset-authoring-session.v1');
      expect(compatibility).toContain('must not claim or invoke');
      expect(compatibility).toContain('sprite-drawing-contract.v1');
      expect(compatibility).toContain('asset-authoring-release.v1');
      expect(compatibility).toContain('lpc-toolkit.asset-release-declaration.v1');
      expect(compatibility).toContain('lpc-toolkit.asset-authoring-release-receipt.v1');
      expect(compatibility).toContain('lpc-toolkit.asset-authoring-install-receipt.v1');
      expect(compatibility).toContain('asset-authoring-consumer-install.v1');
      expect(compatibility).toContain('asset authoring acknowledge');
      expect(compatibility).toContain('accept-preview');
    }
  });
});
