import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAssetAuthoringPlan } from '@lpc-toolkit/core';
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
const cliExtendItemTemplatePath = path.resolve(
  here,
  '../examples/extend-item-plan.v1.json',
);
const pluginExtendItemTemplatePath = path.resolve(
  here,
  '../../../plugins/lpc-toolkit/skills/asset-authoring/references/extend-item-plan.v1.json',
);
const compatibilityPath = path.resolve(
  here,
  '../../../plugins/lpc-toolkit/references/compatibility.md',
);
const compatibility = readFileSync(compatibilityPath, 'utf8');

function markdownSection(source: string, heading: string): string {
  const start = source.indexOf(heading);
  if (start < 0) return '';
  const next = source.indexOf('\n## ', start + heading.length);
  return source.slice(start, next < 0 ? undefined : next);
}

const semanticText = (source: string) => source.replace(/\s+/gu, ' ');

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

  it('documents the strict Skill handoff for audited asset work', () => {
    expect(auditWorkflow).toContain('lpc-asset-authoring');
    expect(auditWorkflow).toContain('`extend-item`');
    expect(auditWorkflow).not.toContain('asset init --from-audit');
    expect(assetWorkflow).toContain('asset authoring start');
    expect(assetWorkflow).toContain('asset authoring contract');
    expect(assetWorkflow).toContain('asset authoring import');
    expect(
      [...markdownSection(assetWorkflow, '## `extend-item`')
        .matchAll(/asset authoring start/gu)],
    ).toHaveLength(1);
    expect(auditWorkflow).not.toContain('asset workspace init');
    expect(auditWorkflow).not.toContain('asset authoring start');
  });

  it('ships one complete, parseable extend-item plan template with CLI and plugin artifacts', () => {
    const cliTemplate = readFileSync(cliExtendItemTemplatePath, 'utf8');
    const pluginTemplate = readFileSync(pluginExtendItemTemplatePath, 'utf8');
    const parsed = parseAssetAuthoringPlan(JSON.parse(cliTemplate) as unknown);

    expect(pluginTemplate).toBe(cliTemplate);
    expect(parsed).toMatchObject({
      ok: true,
      plan: {
        schema: 'lpc-toolkit.asset-authoring-plan.v1',
        goal: 'extend-item',
        consent: { approved: true },
        remediation: {
          selectedFinding: { category: 'blankFrames' },
          pathConfidence: 'exact',
          sourceCells: expect.any(Array),
        },
        draftCredits: {
          authors: expect.any(Array),
          licenses: expect.any(Array),
          urls: expect.any(Array),
          notes: expect.any(String),
        },
      },
    });
    if (parsed.ok && parsed.plan.goal === 'extend-item') {
      expect(parsed.plan.remediation.sourceCells).toHaveLength(6);
    }
    expect(assetWorkflow).toContain('references/extend-item-plan.v1.json');
    expect(assetWorkflow).toContain('replace every example value');
    expect(assetWorkflow).toContain('never infer audit evidence, consent, authorship, or license');
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

  it('packages the conditional same-scope closure handback', () => {
    const authoringClosure = semanticText(markdownSection(
      assetWorkflow, '## Conditional post-install closure',
    ));
    const auditClosure = semanticText(markdownSection(
      auditWorkflow, '## Conditional closure re-entry',
    ));

    for (const phrase of [
      'review-ready endpoint remains the default',
      'separately requests and confirms',
      'successful exact installation',
      'lpc-toolkit.asset-authoring-install-receipt.v1',
      'next executor is `$lpc-animation-asset-audit`',
      'same Codex task',
      'original target animation',
      'optional type',
      'optional body type',
      'complete report identity and digest',
      'selected finding',
    ]) expect(authoringClosure).toContain(phrase);

    for (const phrase of [
      'unsupported',
      'missingFiles',
      'blankFrames',
      'errors',
      'Exit code zero',
      'not closure evidence',
      'absent, remaining, or inspection-error',
      'Do not expand scope',
    ]) expect(auditClosure).toContain(phrase);
  });
});
