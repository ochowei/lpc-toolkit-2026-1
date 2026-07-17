import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { runCli } from '../src/main.js';
import { formatHumanResponse } from '../src/response.js';

function makeCatalogCwd(): string {
  const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-human-'));
  const assetsRoot = path.join(cwd, 'assets');
  const root = path.join(assetsRoot, 'sheet_definitions');
  mkdirSync(path.join(root, 'body'), { recursive: true });
  mkdirSync(path.join(root, 'hair'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'palette_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'spritesheets'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'spritesheets', 'hair', 'braids'), { recursive: true });
  writeFileSync(path.join(assetsRoot, 'spritesheets', 'hair', 'braids', 'walk.png'), 'fixture');
  writeFileSync(path.join(assetsRoot, 'CREDITS.csv'), 'file,authors,licenses\n');
  writeFileSync(
    path.join(root, 'body', 'body.json'),
    JSON.stringify({
      name: 'Body Color',
      type_name: 'body',
      animations: ['walk'],
      credits: [],
      layer_1: { zPos: 10, male: 'body/bodies/male/' },
    }),
  );
  writeFileSync(
    path.join(root, 'hair', 'braids.json'),
    JSON.stringify({
      name: 'Braids',
      type_name: 'hair',
      animations: ['walk', 'slash'],
      credits: [
        {
          file: 'hair/braids',
          notes: '',
          authors: ['Artist'],
          licenses: ['GPL 3.0'],
          urls: [],
        },
      ],
      variants: ['brown'],
      layer_1: { zPos: 50, male: 'hair/braids/' },
    }),
  );
  writeFileSync(
    path.join(root, 'hair', 'bob.json'),
    JSON.stringify({
      name: 'Bob',
      type_name: 'hair',
      animations: ['walk'],
      credits: [
        {
          file: 'hair/bob',
          notes: '',
          authors: ['Artist'],
          licenses: ['GPL 3.0'],
          urls: [],
        },
      ],
      layer_1: { zPos: 50, male: 'hair/bob/' },
    }),
  );
  return cwd;
}

async function makeAnimationAuditCwd(options: { readonly decodeError?: boolean } = {}): Promise<string> {
  const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-human-audit-'));
  const assetsRoot = path.join(cwd, 'assets');
  const definitionsRoot = path.join(assetsRoot, 'sheet_definitions', 'hair');
  mkdirSync(definitionsRoot, { recursive: true });
  mkdirSync(path.join(assetsRoot, 'palette_definitions'), { recursive: true });
  writeFileSync(path.join(assetsRoot, 'CREDITS.csv'), 'file,authors,licenses\n');
  writeFileSync(
    path.join(definitionsRoot, 'hair_braid.json'),
    JSON.stringify({
      name: 'Hair Braid',
      type_name: 'hair',
      animations: ['walk'],
      credits: [],
      variants: ['brown'],
      layer_1: { zPos: 50, male: 'hair/braid/' },
    }),
  );
  writeFileSync(
    path.join(definitionsRoot, 'hair_bob.json'),
    JSON.stringify({
      name: 'Hair Bob',
      type_name: 'hair',
      animations: [],
      credits: [],
      layer_1: { zPos: 50, male: 'hair/bob/' },
    }),
  );

  const blankPath = path.join(assetsRoot, 'spritesheets', 'hair', 'braid', 'walk', 'brown.png');
  mkdirSync(path.dirname(blankPath), { recursive: true });
  writeFileSync(blankPath, await createCanvas(832, 3456).encode('png'));

  if (options.decodeError) {
    writeFileSync(
      path.join(definitionsRoot, 'hair_corrupt.json'),
      JSON.stringify({
        name: 'Hair Corrupt',
        type_name: 'hair',
        animations: ['walk'],
        credits: [],
        layer_1: { zPos: 50, male: 'hair/corrupt/' },
      }),
    );
    const corruptPath = path.join(assetsRoot, 'spritesheets', 'hair', 'corrupt', 'walk.png');
    mkdirSync(path.dirname(corruptPath), { recursive: true });
    writeFileSync(corruptPath, 'not a PNG');
  }

  return cwd;
}

function makeManualReviewAuditCwd(): string {
  const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-human-audit-review-'));
  const assetsRoot = path.join(cwd, 'assets');
  const definitionsRoot = path.join(assetsRoot, 'sheet_definitions', 'hair');
  mkdirSync(definitionsRoot, { recursive: true });
  mkdirSync(path.join(assetsRoot, 'palette_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'spritesheets'), { recursive: true });
  writeFileSync(path.join(assetsRoot, 'CREDITS.csv'), 'file,authors,licenses\n');
  writeFileSync(
    path.join(definitionsRoot, 'hair_custom.json'),
    JSON.stringify({
      name: 'Hair Custom',
      type_name: 'hair',
      animations: [],
      credits: [],
      layer_1: { zPos: 50, male: 'hair/custom/', custom_animation: 'wheelchair' },
    }),
  );
  return cwd;
}

async function runHuman(argv: readonly string[], cwd: string): Promise<string> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(argv, {
    cwd,
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  });

  expect(code).toBe(0);
  expect(stderr).toEqual([]);
  return stdout.join('');
}

async function runHumanError(argv: readonly string[], cwd: string): Promise<string> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(argv, {
    cwd,
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  });

  expect(code).toBe(1);
  expect(stdout).toEqual([]);
  return stderr.join('');
}

describe('human-readable CLI output', () => {
  it('uses singular item summary labels for a one-item animation audit', () => {
    const output = formatHumanResponse({
      ok: true,
      command: 'catalog audit-animations',
      data: {
        targets: ['walk'],
        summary: {
          itemsScanned: 1,
          incompleteItems: 1,
          unsupported: 0,
          missingFiles: 0,
          blankFrames: 0,
          errors: 0,
        },
        unsupported: [],
        missingFiles: [],
        blankFrames: [],
        errors: [],
      },
      warnings: [],
      errors: [],
    }, 'fallback\n');

    expect(output).toContain('Scanned: 1 item\n');
    expect(output).toContain('Incomplete: 1 item\n');
  });

  it('prints catalog type data without --json', async () => {
    const output = await runHuman(['catalog', 'types'], makeCatalogCwd());

    expect(output).toContain('Catalog types (2)');
    expect(output).toContain('- body');
    expect(output).toContain('- hair');
  });

  it('prints catalog item summaries without --json', async () => {
    const output = await runHuman(['catalog', 'items', '--type', 'hair'], makeCatalogCwd());

    expect(output).toContain('Catalog items (2 of 2)');
    expect(output).toContain('- hair/Braids [braids]');
    expect(output).toContain('variants: brown');
    expect(output).toContain('animations: walk, slash');
    expect(output).toContain('supported body types: male');
    expect(output).toContain('licenses: GPL');
    expect(output).toContain('credit count: 1');
  });

  it('prints the next discovery offset when another catalog page is available', async () => {
    const output = await runHuman([
      'catalog', 'items', '--type', 'hair', '--limit', '1',
    ], makeCatalogCwd());

    expect(output).toContain('Catalog items (1 of 2)');
    expect(output).toContain('More results available; rerun with --offset 1.');
  });

  it('prints one catalog item without --json', async () => {
    const output = await runHuman(['catalog', 'item', 'braids'], makeCatalogCwd());

    expect(output).toContain('Catalog item: hair/Braids [braids]');
    expect(output).toContain('variants: brown');
    expect(output).toContain('animations: walk, slash');
    expect(output).toContain('compatible standard animations: none');
    expect(output).toContain('unsupported standard animations: spellcast, thrust');
  });

  it('keeps animation capability fields out of catalog item summaries', async () => {
    const output = await runHuman(['catalog', 'items', '--type', 'hair'], makeCatalogCwd());

    expect(output).not.toContain('compatible standard animations:');
    expect(output).not.toContain('unsupported standard animations:');
  });

  it('prints an actionable animation drawing worklist without --json', async () => {
    const output = await runHuman([
      'catalog', 'audit-animations', '--animation', 'walk', '--animation', 'run', '--body-type', 'male',
    ], await makeAnimationAuditCwd());

    expect(output).toContain('Animation audit: walk, run');
    expect(output).toContain('Scanned: 2 items');
    expect(output).toContain('Incomplete: 2 items');
    expect(output).toContain('hair_braid');
    expect(output).toContain('unsupported: run');
    expect(output).toContain('expected: spritesheets/hair/braid/run/brown.png');
    expect(output).toContain('layer: layer_1');
    expect(output).toContain('body types: male');
    expect(output).toContain('walk/down: source column 3');
  });

  it('prints manual-review reasons without inventing a sprite path', async () => {
    const output = await runHuman([
      'catalog', 'audit-animations', '--animation', 'run', '--body-type', 'male',
    ], makeManualReviewAuditCwd());

    expect(output).toContain('Item has only custom-animation layers; choose a standard layout before drawing.');
    expect(output).not.toContain('expected:');
  });

  it('prints decode failures after drawing findings', async () => {
    const output = await runHuman([
      'catalog', 'audit-animations', '--animation', 'walk', '--animation', 'run', '--body-type', 'male',
    ], await makeAnimationAuditCwd({ decodeError: true }));

    expect(output).toContain('Inspection errors (1)');
    expect(output).toContain('image_decode_failed');
    expect(output.indexOf('walk/down: source column 3')).toBeLessThan(
      output.indexOf('Inspection errors (1)'),
    );
  });

  it('prints encoded tokens without --json', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-human-token-'));
    writeFileSync(
      path.join(cwd, 'selection.json'),
      JSON.stringify({
        schema: 'lpc-toolkit.selection.v1',
        name: 'hero',
        bodyType: 'male',
        items: { body: { name: 'Body Color' } },
      }),
    );

    const output = await runHuman(['token', 'encode', '--selection', 'selection.json'], cwd);

    expect(output).toMatch(/^v1\./);
  });

  it('prints decoded selections without --json when no output file is requested', async () => {
    const cwd = makeCatalogCwd();
    const output = await runHuman(['token', 'decode', '--token', 'sex=male&hair=Braids'], cwd);

    expect(output).toContain('"schema": "lpc-toolkit.selection.v1"');
    expect(output).toContain('"hair"');
    expect(output).toContain('"Braids"');
  });

  it('prints preset lists and materialized selections without --json', async () => {
    const listOutput = await runHuman(['preset', 'list'], makeCatalogCwd());
    expect(listOutput).toContain('Presets (');
    expect(listOutput).toContain('- farmer');

    const materializeOutput = await runHuman(
      ['preset', 'materialize', 'farmer'],
      makeCatalogCwd(),
    );
    expect(materializeOutput).toContain('"schema": "lpc-toolkit.selection.v1"');
    expect(materializeOutput).toContain('"name": "farmer"');
  });

  it('prints character list and show data without --json', async () => {
    const cwd = makeCatalogCwd();
    await runHuman(['character', 'create', 'hero'], cwd);

    expect(await runHuman(['character', 'list'], cwd)).toContain('- hero');
    const output = await runHuman(['character', 'show', 'hero'], cwd);
    expect(output).toContain('"name": "hero"');
    expect(output).toContain(path.join(cwd, 'characters', 'hero.selection.json'));
    expect(output).toContain('Status: valid');
  });

  it('prints invalid character status and validation issues without --json', async () => {
    const cwd = makeCatalogCwd();
    const selectionPath = path.join(cwd, 'saved', 'invalid.selection.json');
    mkdirSync(path.dirname(selectionPath), { recursive: true });
    writeFileSync(selectionPath, JSON.stringify({
      schema: 'lpc-toolkit.selection.v1',
      name: 'invalid',
      bodyType: 'male',
      items: { hair: { name: 'Missing Hair' } },
    }));

    const output = await runHuman([
      'character', 'show', '--selection', selectionPath,
    ], cwd);

    expect(output).toContain(selectionPath);
    expect(output).toContain('Status: invalid');
    expect(output).toContain('unknown_item');
    expect(output).toContain('hair/Missing Hair');
  });

  it('prints actionable character mutation and search output without --json', async () => {
    const cwd = makeCatalogCwd();

    expect(await runHuman(['character', 'create', 'hero'], cwd))
      .toContain('Created hero:');
    expect(await runHuman([
      'character', 'search', 'hero', '--type', 'hair', '--query', 'braid',
    ], cwd)).toContain('hair/Braids [braids]');
    expect(await runHuman([
      'character', 'set', 'hero', '--type', 'hair', '--item', 'braids',
    ], cwd)).toContain('Updated hero: hair = Braids');
    expect(await runHuman(['character', 'validate', 'hero'], cwd))
      .toContain('Character hero is valid.');
    expect(await runHuman(['character', 'remove', 'hero', '--type', 'hair'], cwd))
      .toContain('Updated hero: removed hair');
  });

  it.each([
    {
      command: ['set', '--type', 'hair', '--item', 'braids'],
      items: {},
      expected: 'Updated custom.selection: hair = Braids',
    },
    {
      command: ['validate'],
      items: {},
      expected: 'Character custom.selection is valid.',
    },
    {
      command: ['remove', '--type', 'hair'],
      items: { hair: { name: 'Braids', variant: 'brown' } },
      expected: 'Updated custom.selection: removed hair',
    },
  ])('prints explicit character $command.0 output for an unnamed selection', async ({
    command,
    items,
    expected,
  }) => {
    const cwd = makeCatalogCwd();
    const selectionPath = path.join(cwd, 'saved', 'custom.selection.json');
    mkdirSync(path.dirname(selectionPath), { recursive: true });
    writeFileSync(selectionPath, JSON.stringify({
      schema: 'lpc-toolkit.selection.v1',
      bodyType: 'male',
      items,
    }));

    expect(await runHuman([
      'character', ...command, '--selection', selectionPath,
    ], cwd)).toContain(expected);
  });

  it('prints structured character suggestions and available values', async () => {
    const cwd = makeCatalogCwd();
    await runHuman(['character', 'create', 'hero'], cwd);

    expect(await runHumanError([
      'character', 'set', 'hero', '--type', 'hair', '--item', 'braid',
    ], cwd)).toContain('Did you mean: braids');
    expect(await runHumanError([
      'character', 'create', 'other', '--body-type', 'centaur',
    ], cwd)).toContain('Available: male, female, teen, child, muscular, pregnant');
  });
});
