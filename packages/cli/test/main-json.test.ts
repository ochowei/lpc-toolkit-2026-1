import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
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
  mkdirSync(assetsRoot, { recursive: true });
  const store = createDirectoryAssetStore(assetsRoot);
  return {
    context: createRuntimeContext({ cwd, assetsRoot, spritesheetsBaseUrl: store.baseUrl }),
    store,
    source: 'working-directory',
  };
}

function writeAuditDefinition(
  runtime: RuntimeAssets,
  root: 'assets' | 'assets_custom',
  definition: Record<string, unknown>,
): void {
  const file = path.join(
    runtime.context.repoRoot,
    root,
    'sheet_definitions',
    'hair',
    'braid.json',
  );
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(definition));
}

function auditDefinition(animations: readonly string[]): Record<string, unknown> {
  return {
    name: 'Braid',
    type_name: 'hair',
    animations,
    credits: [],
    layer_1: { zPos: 50, male: 'hair/braid/' },
  };
}

describe('main json behavior', () => {
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

  it('writes successful animation audit findings as stable JSON', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const runtime = createRuntime();
    writeAuditDefinition(runtime, 'assets', auditDefinition(['walk']));

    const code = await runCli([
      'catalog',
      'audit-animations',
      '--animation',
      'walk',
      '--animation',
      'run',
      '--json',
    ], {
      cwd: runtime.context.repoRoot,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    }, {
      prepareRuntimeAssets: async () => runtime,
    });

    expect(JSON.parse(stdout.join(''))).toMatchObject({
      ok: true,
      command: 'catalog audit-animations',
      data: {
        targets: ['walk', 'run'],
        summary: { itemsScanned: 1, incompleteItems: 1, unsupported: 1 },
        unsupported: [{ itemId: 'braid', animation: 'run' }],
      },
      errors: [],
    });
    expect(stderr).toEqual([]);
    expect(code).toBe(0);
  });

  it.each([
    [['--animation', 'wlak'], 'unknown_animation', 'wlak'],
    [['--animation', 'walk', '--type', 'hat'], 'unknown_type_name', 'hat'],
    [['--animation', 'walk', '--body-type', 'robot'], 'body_type_invalid', 'robot'],
  ])('returns structured animation audit validation errors for %j', async (flags, code, pathValue) => {
    const stdout: string[] = [];
    const runtime = createRuntime();
    writeAuditDefinition(runtime, 'assets', auditDefinition(['walk']));

    const exitCode = await runCli(['catalog', 'audit-animations', ...flags, '--json'], {
      cwd: runtime.context.repoRoot,
      stdout: (text) => stdout.push(text),
      stderr: () => undefined,
    }, {
      prepareRuntimeAssets: async () => runtime,
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      ok: false,
      command: 'catalog audit-animations',
      errors: [{ code, path: pathValue }],
    });
  });

  it('uses a matching custom sheet definition instead of the base definition', async () => {
    const stdout: string[] = [];
    const runtime = createRuntime();
    writeAuditDefinition(runtime, 'assets', auditDefinition(['walk']));
    writeAuditDefinition(runtime, 'assets_custom', auditDefinition(['run']));

    const exitCode = await runCli([
      'catalog', 'audit-animations', '--animation', 'walk', '--json',
    ], {
      cwd: runtime.context.repoRoot,
      stdout: (text) => stdout.push(text),
      stderr: () => undefined,
    }, {
      prepareRuntimeAssets: async () => runtime,
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      ok: true,
      data: {
        summary: { itemsScanned: 1, unsupported: 1 },
        unsupported: [{ itemId: 'braid', animation: 'walk', nativeAnimations: ['run'] }],
      },
    });
  });
});
