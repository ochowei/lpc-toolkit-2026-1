import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../src/main.js';

function makeCatalogCwd(): string {
  const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-human-'));
  const assetsRoot = path.join(cwd, 'assets');
  const root = path.join(assetsRoot, 'sheet_definitions');
  mkdirSync(path.join(root, 'body'), { recursive: true });
  mkdirSync(path.join(root, 'hair'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'palette_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'spritesheets'), { recursive: true });
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

describe('human-readable CLI output', () => {
  it('prints catalog type data without --json', async () => {
    const output = await runHuman(['catalog', 'types'], makeCatalogCwd());

    expect(output).toContain('Catalog types (2)');
    expect(output).toContain('- body');
    expect(output).toContain('- hair');
  });

  it('prints catalog item summaries without --json', async () => {
    const output = await runHuman(['catalog', 'items', '--type', 'hair'], makeCatalogCwd());

    expect(output).toContain('Catalog items (1)');
    expect(output).toContain('- hair/Braids [braids]');
    expect(output).toContain('variants: brown');
    expect(output).toContain('animations: walk, slash');
  });

  it('prints one catalog item without --json', async () => {
    const output = await runHuman(['catalog', 'item', 'braids'], makeCatalogCwd());

    expect(output).toContain('Catalog item: hair/Braids [braids]');
    expect(output).toContain('variants: brown');
    expect(output).toContain('animations: walk, slash');
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
    expect(await runHuman(['character', 'show', 'hero'], cwd)).toContain('"name": "hero"');
  });
});
