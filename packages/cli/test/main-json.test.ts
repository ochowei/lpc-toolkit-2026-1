import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { createRuntimeContext } from '../src/context.js';
import { runCli } from '../src/main.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

function createRuntime(): RuntimeAssets {
  const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-main-json-'));
  const assetsRoot = path.join(cwd, 'assets');
  mkdirSync(path.join(assetsRoot, 'sheet_definitions', 'body'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'palette_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'spritesheets', 'body', 'bodies', 'male'), {
    recursive: true,
  });
  writeFileSync(
    path.join(assetsRoot, 'sheet_definitions', 'body', 'body.json'),
    JSON.stringify({
      name: 'Body Color',
      type_name: 'body',
      animations: ['walk'],
      credits: [],
      layer_1: { zPos: 10, male: 'body/bodies/male/' },
    }),
  );
  writeFileSync(path.join(assetsRoot, 'spritesheets', 'body', 'bodies', 'male', 'walk.png'), '');
  const store = createDirectoryAssetStore(assetsRoot);
  return {
    context: createRuntimeContext({ cwd, assetsRoot, spritesheetsBaseUrl: store.baseUrl }),
    store,
    source: 'working-directory',
  };
}

describe('main json behavior', () => {
  it('reports normalization in the JSON envelope after an upstream character mutation', async () => {
    const runtime = createRuntime();
    const selectionPath = path.join(runtime.context.repoRoot, 'upstream.json');
    writeFileSync(selectionPath, JSON.stringify({
      version: 2,
      bodyType: 'male',
      selections: { body: { itemId: 'body' } },
    }));
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runCli([
      'character', 'remove', '--selection', selectionPath, '--type', 'body', '--json',
    ], {
      cwd: runtime.context.repoRoot,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    }, {
      prepareRuntimeAssets: async () => runtime,
    });

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      ok: true,
      command: 'character remove',
      warnings: [{
        code: 'selection_format_normalized',
        path: selectionPath,
      }],
      errors: [],
    });
  });

  it('writes machine-readable unknown command errors to stdout', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runCli(['nope', '--json'], {
      cwd: process.cwd(),
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });

    expect(code).toBe(1);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      ok: false,
      command: 'nope',
      errors: [{ code: 'unknown_command' }],
    });
  });

  it('preserves the standard envelope for bounded catalog items', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const runtime = createRuntime();

    const code = await runCli(['catalog', 'items', '--limit', '1', '--json'], {
      cwd: runtime.context.repoRoot,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    }, {
      prepareRuntimeAssets: async () => runtime,
    });

    expect(JSON.parse(stdout.join(''))).toMatchObject({
      ok: true,
      command: 'catalog items',
      data: { page: { limit: 1 } },
      warnings: [],
      errors: [],
    });
    expect(code).toBe(0);
  });

  it('validates upstream v2 without rewriting it and preserves the response envelope', async () => {
    const runtime = createRuntime();
    const selectionPath = path.join(runtime.context.repoRoot, 'upstream.json');
    const source = `${JSON.stringify({
      version: 2,
      bodyType: 'male',
      selections: { body: { itemId: 'body' } },
    }, null, 2)}\n`;
    writeFileSync(selectionPath, source);
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runCli([
      'selection', 'validate', '--selection', 'upstream.json', '--json',
    ], {
      cwd: runtime.context.repoRoot,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    }, {
      prepareRuntimeAssets: async () => runtime,
    });

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(''))).toEqual({
      ok: true,
      command: 'selection validate',
      data: { valid: true },
      warnings: [],
      errors: [],
    });
    expect(readFileSync(selectionPath, 'utf8')).toBe(source);
  });

  it('preserves selection import error codes and paths in the response envelope', async () => {
    const runtime = createRuntime();
    writeFileSync(
      path.join(runtime.context.repoRoot, 'upstream.json'),
      JSON.stringify({ version: 3 }),
    );
    const stdout: string[] = [];

    const code = await runCli([
      'selection', 'validate', '--selection', 'upstream.json', '--json',
    ], {
      cwd: runtime.context.repoRoot,
      stdout: (text) => stdout.push(text),
      stderr: () => undefined,
    }, {
      prepareRuntimeAssets: async () => runtime,
    });

    expect(code).toBe(1);
    expect(JSON.parse(stdout.join('')).errors[0]).toEqual(expect.objectContaining({
      code: 'unsupported_upstream_version',
      path: 'version',
    }));
  });
});
