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
const assetContractPath = path.resolve(
  here,
  '../../../plugins/lpc-toolkit/skills/asset-authoring/references/cli-contract.json',
);
const assetContract = JSON.parse(readFileSync(assetContractPath, 'utf8')) as PluginContract;
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
const assetWorkflowPath = path.resolve(
  here,
  '../../../plugins/lpc-toolkit/skills/asset-authoring/references/authoring-workflow.md',
);
const assetWorkflow = readFileSync(assetWorkflowPath, 'utf8');
const compatibilityPath = path.resolve(
  here,
  '../../../plugins/lpc-toolkit/references/compatibility.md',
);
const compatibility = readFileSync(compatibilityPath, 'utf8');

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

  it('uses one bounded asset-authoring contract through attributed preview', () => {
    expect(assetContract.schema).toBe('lpc-toolkit.codex-plugin.cli-contract.v1');
    expect(assetContract.commands.map(({ id }) => id)).toEqual([
      'version',
      'asset-init-from-audit',
      'authoring-start',
      'authoring-status',
      'authoring-resume',
      'authoring-contract',
      'provider-discover',
      'provider-preflight',
      'provider-handoff',
      'provider-result',
      'authoring-import',
      'authoring-validate',
      'authoring-preview',
    ]);
  });

  it.each(
    [...characterContract.commands, ...auditContract.commands, ...assetContract.commands]
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

  it('keeps authoring out of read-only and composition skills', () => {
    const nonAuthoringCommands = [...characterContract.commands, ...auditContract.commands];
    expect(nonAuthoringCommands.every(({ argv }) =>
      !(argv[0] === 'asset' && argv[1] === 'authoring'))).toBe(true);
    expect(workflow).not.toContain('asset authoring');
    expect(auditWorkflow).not.toContain('asset authoring');
  });

  it('documents the review-ready boundary and separate human release actions', () => {
    expect(assetWorkflow).toContain('Review-ready means');
    expect(assetWorkflow).toContain('does not mean formally released');
    expect(assetWorkflow).toContain('explicit consent');
    expect(compatibility).toContain('lpc-toolkit.asset-authoring-install-receipt.v1');
    expect(compatibility).toContain('asset-authoring-consumer-install.v1');
    expect(compatibility).toContain('human-confirmed follow-up actions');
    for (const forbiddenId of [
      'authoring-acknowledge', 'authoring-declare', 'authoring-accept-preview',
      'authoring-sync', 'authoring-pack', 'authoring-inspect', 'authoring-install',
    ]) expect(assetContract.commands.map(({ id }) => id)).not.toContain(forbiddenId);
  });
});
