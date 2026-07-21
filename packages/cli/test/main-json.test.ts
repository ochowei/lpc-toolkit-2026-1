import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { initializeAssetWorkspace } from '../src/asset-workspace.js';
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

function createAuditRuntime(): RuntimeAssets {
  const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-main-json-audit-'));
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
  it('returns the standard workspace-init JSON envelope without runtime assets', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-main-json-workspace-'));
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runCli([
      'asset', 'workspace', 'init', 'artist-workspace', '--json',
    ], {
      cwd,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    }, {
      prepareRuntimeAssets: async () => {
        throw new Error('workspace init must not prepare runtime assets');
      },
    });

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(''))).toEqual({
      ok: true,
      command: 'asset workspace init',
      data: expect.objectContaining({
        root: path.join(cwd, 'artist-workspace'),
        packsRoot: path.join(cwd, 'artist-workspace', 'artist-packs'),
        outputRoot: path.join(cwd, 'artist-workspace', 'assets_custom'),
      }),
      warnings: [],
      errors: [],
    });
  });

  it('returns the standard scaffold JSON envelope with the default version', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'lpc-main-json-scaffold-'));
    initializeAssetWorkspace(workspaceRoot);
    const runtime = createRuntime();
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runCli([
      'asset', 'init', '--new', '--pack-id', 'acme.hair',
      '--display-name', 'ACME Hair', '--asset-id', 'moon-braid', '--type', 'hair',
      '--body-type', 'male', '--animation', 'walk', '--author', 'Alice',
      '--license', 'CC-BY-SA 4.0', '--url', 'https://example.test/acme-hair',
      '--workspace', workspaceRoot, '--json',
    ], {
      cwd: workspaceRoot,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    }, {
      prepareRuntimeAssets: async () => runtime,
    });

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(''))).toEqual({
      ok: true,
      command: 'asset init',
      data: {
        packRoot: path.join(workspaceRoot, 'artist-packs', 'acme.hair'),
        manifestPath: path.join(
          workspaceRoot,
          'artist-packs',
          'acme.hair',
          'asset-pack.json',
        ),
      },
      warnings: [],
      errors: [],
    });
    expect(JSON.parse(readFileSync(path.join(
      workspaceRoot,
      'artist-packs',
      'acme.hair',
      'asset-pack.json',
    ), 'utf8'))).toMatchObject({ version: '0.1.0' });
  });

  it('keeps validation findings in a completed response while exiting one', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'lpc-main-json-validate-'));
    initializeAssetWorkspace(workspaceRoot);
    const packRoot = path.join(workspaceRoot, 'artist-packs', 'invalid');
    mkdirSync(packRoot, { recursive: true });
    writeFileSync(path.join(packRoot, 'asset-pack.json'), '{}');
    const stdout: string[] = [];
    const stderr: string[] = [];
    const runtime = createRuntime();

    const code = await runCli([
      'asset', 'validate', packRoot, '--workspace', workspaceRoot, '--json',
    ], {
      cwd: workspaceRoot,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    }, {
      prepareRuntimeAssets: async () => runtime,
    });

    expect(code).toBe(1);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      ok: true,
      command: 'asset validate',
      data: {
        packDirectory: packRoot,
        valid: false,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ severity: 'error' }),
        ]),
        acknowledgementRecords: [],
      },
      warnings: [],
      errors: [],
    });
  });

  it.each(['preview', 'sync'])('uses a fatal envelope for asset %s failures', async (command) => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), `lpc-main-json-${command}-`));
    initializeAssetWorkspace(workspaceRoot);
    const packRoot = path.join(workspaceRoot, 'artist-packs', 'invalid');
    mkdirSync(packRoot, { recursive: true });
    writeFileSync(path.join(packRoot, 'asset-pack.json'), '{}');
    const stdout: string[] = [];
    const stderr: string[] = [];
    const runtime = createRuntime();

    const code = await runCli([
      'asset', command, packRoot, '--workspace', workspaceRoot, '--json',
    ], {
      cwd: workspaceRoot,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    }, {
      prepareRuntimeAssets: async () => runtime,
    });

    expect(code).toBe(1);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      ok: false,
      command: `asset ${command}`,
      data: null,
      warnings: [],
      errors: expect.arrayContaining([
        expect.objectContaining({ code: expect.any(String) }),
      ]),
    });
  });

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

  it('writes successful animation audit findings as stable JSON', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const runtime = createAuditRuntime();
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
    [['--animation', 'walk', '--type', ''], 'unknown_type_name', ''],
    [['--animation', 'walk', '--body-type', ''], 'body_type_invalid', ''],
  ])('returns structured animation audit validation errors for %j', async (flags, code, pathValue) => {
    const stdout: string[] = [];
    const runtime = createAuditRuntime();
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
    const runtime = createAuditRuntime();
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

  it('reports the generated viewer in a successful render response', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const runtime = createRuntime();
    writeFileSync(path.join(runtime.context.repoRoot, 'selection.json'), JSON.stringify({
      schema: 'lpc-toolkit.selection.v1',
      name: 'empty-fixture',
      bodyType: 'male',
      items: {},
    }));

    const code = await runCli([
      'render', '--selection', 'selection.json', '--out', 'out', '--json',
    ], {
      cwd: runtime.context.repoRoot,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    }, {
      prepareRuntimeAssets: async () => runtime,
    });

    const response = JSON.parse(stdout.join('')) as {
      readonly data: {
        readonly artifacts: readonly { readonly type: string; readonly path: string }[];
      };
    };
    const viewer = response.data.artifacts.find((artifact) => artifact.type === 'viewer');
    expect(viewer).toEqual({
      type: 'viewer',
      path: path.join(runtime.context.repoRoot, 'out', 'empty-fixture.viewer.html'),
    });
    expect(existsSync(viewer!.path)).toBe(true);
    expect(code).toBe(0);
    expect(stderr).toEqual([]);
  }, 30000);
});
