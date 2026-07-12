import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { runCharacterCommand } from '../src/character-commands.js';
import { createRuntimeContext } from '../src/context.js';
import { runCli, type CliIo } from '../src/main.js';
import type { CliResponse } from '../src/response.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

function createFixture(): {
  readonly cwd: string;
  readonly io: CliIo;
  readonly runtime: RuntimeAssets;
} {
  const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-character-commands-'));
  const assetsRoot = path.join(cwd, 'assets');
  const definitionsRoot = path.join(assetsRoot, 'sheet_definitions');
  mkdirSync(path.join(definitionsRoot, 'body'), { recursive: true });
  mkdirSync(path.join(definitionsRoot, 'hair'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'palette_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'spritesheets'), { recursive: true });
  writeFileSync(path.join(assetsRoot, 'CREDITS.csv'), 'file,authors,licenses\n');
  writeFileSync(path.join(definitionsRoot, 'body', 'body.json'), JSON.stringify({
    name: 'Body Color',
    type_name: 'body',
    animations: ['walk'],
    credits: [],
    recolors: { material: 'skin', palettes: ['ulpc'] },
    layer_1: { zPos: 10, male: 'body/bodies/male/' },
  }));
  mkdirSync(path.join(assetsRoot, 'palette_definitions', 'skin'), { recursive: true });
  writeFileSync(
    path.join(assetsRoot, 'palette_definitions', 'skin', 'meta_skin.json'),
    JSON.stringify({ type: 'material', default: 'ulpc', base: 'light' }),
  );
  writeFileSync(
    path.join(assetsRoot, 'palette_definitions', 'skin', 'skin_ulpc.json'),
    JSON.stringify({ light: ['#f0c8a0'] }),
  );
  writeFileSync(path.join(definitionsRoot, 'hair', 'braids.json'), JSON.stringify({
    name: 'Braids',
    type_name: 'hair',
    animations: ['walk'],
    credits: [],
    variants: ['brown'],
    layer_1: { zPos: 50, male: 'hair/braids/' },
  }));
  const directoryStore = createDirectoryAssetStore(assetsRoot);
  const runtime: RuntimeAssets = {
    context: createRuntimeContext({ cwd, assetsRoot, spritesheetsBaseUrl: directoryStore.baseUrl }),
    store: { ...directoryStore, has: () => true },
    source: 'working-directory',
  };
  return {
    cwd,
    io: { cwd, stdout: () => undefined, stderr: () => undefined },
    runtime,
  };
}

async function run(
  fixture: ReturnType<typeof createFixture>,
  argv: readonly string[],
): Promise<{ readonly response: CliResponse<unknown> }> {
  return {
    response: await runCharacterCommand(parseArgs(argv), fixture.io, fixture.runtime),
  };
}

describe('character commands', () => {
  it('creates, sets, searches, shows, validates, removes, and lists a named character', async () => {
    const fixture = createFixture();

    expect((await run(fixture, ['character', 'create', 'hero'])).response.ok).toBe(true);
    expect((await run(fixture, [
      'character', 'set', 'hero', '--type', 'body', '--item', 'body',
    ])).response.ok).toBe(true);
    expect((await run(fixture, [
      'character', 'search', 'hero', '--type', 'hair', '--query', 'braid',
    ])).response.data).toMatchObject({ count: 1, items: [{ itemId: 'braids' }] });
    expect((await run(fixture, ['character', 'show', 'hero'])).response.data).toMatchObject({
      selection: { name: 'hero', items: { body: { name: 'Body Color' } } },
      valid: true,
    });
    expect((await run(fixture, ['character', 'validate', 'hero'])).response.ok).toBe(true);
    expect((await run(fixture, [
      'character', 'remove', 'hero', '--type', 'body',
    ])).response.ok).toBe(true);
    expect((await run(fixture, ['character', 'list'])).response.data).toMatchObject({ count: 1 });
  });

  it('does not write an invalid set candidate', async () => {
    const fixture = createFixture();
    const heroPath = path.join(fixture.cwd, 'characters', 'hero.selection.json');
    expect((await run(fixture, [
      'character', 'create', 'hero', '--preset', 'farmer',
    ])).response.ok).toBe(true);
    const before = readFileSync(heroPath, 'utf8');

    const result = await run(fixture, [
      'character', 'set', 'hero', '--type', 'hair', '--item', 'missing',
    ]);

    expect(result.response.ok).toBe(false);
    expect(result.response.errors[0]).toMatchObject({ code: 'unknown_item' });
    expect(readFileSync(heroPath, 'utf8')).toBe(before);
  });

  it('uses create --selection only as the destination and keeps the requested name', async () => {
    const fixture = createFixture();
    const result = await run(fixture, [
      'character', 'create', 'custom-hero', '--selection', 'saved/hero.json',
    ]);

    expect(result.response.data).toMatchObject({
      path: path.join(fixture.cwd, 'saved', 'hero.json'),
      selection: { name: 'custom-hero' },
    });
    expect(JSON.parse(readFileSync(path.join(fixture.cwd, 'saved', 'hero.json'), 'utf8')))
      .toMatchObject({ name: 'custom-hero' });
  });

  it('rejects conflicting and missing existing-character locators', async () => {
    const fixture = createFixture();

    expect((await run(fixture, [
      'character', 'show', 'hero', '--selection', 'hero.json',
    ])).response.errors[0]).toMatchObject({ code: 'character_locator_conflict' });
    expect((await run(fixture, ['character', 'show'])).response.errors[0])
      .toMatchObject({ code: 'missing_argument' });
  });

  it('rejects surplus positionals for named and explicit-path locators', async () => {
    const fixture = createFixture();

    expect((await run(fixture, [
      'character', 'show', 'hero', 'extra',
    ])).response.errors[0]).toMatchObject({ code: 'unexpected_argument' });
    expect((await run(fixture, [
      'character', 'show', 'extra', 'another', '--selection', 'saved/hero.json',
    ])).response.errors[0]).toMatchObject({ code: 'unexpected_argument' });
  });

  it('keeps bytes unchanged when production remove yields an invalid candidate', async () => {
    const fixture = createFixture();
    const heroPath = path.join(fixture.cwd, 'characters', 'hero.selection.json');
    mkdirSync(path.dirname(heroPath), { recursive: true });
    const original = `${JSON.stringify({
      schema: 'lpc-toolkit.selection.v1',
      name: 'hero',
      bodyType: 'male',
      items: {
        body: { name: 'Body Color' },
        hair: { name: 'Missing Hair' },
      },
    }, null, 2)}\n`;
    writeFileSync(heroPath, original);
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runCli(
      ['character', 'remove', 'hero', '--type', 'body', '--json'],
      {
        cwd: fixture.cwd,
        stdout: (text) => stdout.push(text),
        stderr: (text) => stderr.push(text),
      },
    );

    expect(code).toBe(1);
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      ok: false,
      command: 'character remove',
      errors: [{ code: 'unknown_item', path: 'hair/Missing Hair' }],
    });
    expect(stderr).toEqual([]);
    expect(readFileSync(heroPath, 'utf8')).toBe(original);
  });

  it('maps typed store errors directly to CLI issues', async () => {
    const fixture = createFixture();
    const response = (await run(fixture, ['character', 'show', 'missing'])).response;

    expect(response.errors[0]).toMatchObject({
      code: 'character_not_found',
      path: path.join(fixture.cwd, 'characters', 'missing.selection.json'),
    });
  });

  it('validates the metadata name even when create has an explicit destination', async () => {
    const fixture = createFixture();
    const response = (await run(fixture, [
      'character', 'create', '../unsafe', '--selection', 'saved/hero.json',
    ])).response;

    expect(response.errors[0]).toMatchObject({ code: 'character_name_invalid' });
  });

  it('rejects an unsupported body type before preset materialization', async () => {
    const fixture = createFixture();
    const response = (await run(fixture, [
      'character', 'create', 'hero', '--preset', 'farmer', '--body-type', 'centaur',
    ])).response;

    expect(response.errors[0]).toMatchObject({ code: 'body_type_invalid' });
  });
});
