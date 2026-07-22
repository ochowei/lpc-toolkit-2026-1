import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import {
  ASSET_PACK_SCHEMA,
  standardAnimationGeometry,
  type AssetPackSource,
} from '@lpc-toolkit/core';
import { describe, expect, it } from 'vitest';
import { createDeterministicAssetPackArchive } from '../src/asset-pack-archive-format.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { initializeAssetWorkspace } from '../src/asset-workspace.js';
import { createRuntimeContext } from '../src/context.js';
import { runCli } from '../src/main.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';
import {
  acknowledgeWarning,
  createWarningAssetCommandFixture,
} from './asset-command-warning-fixture.js';

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
  writeFileSync(
    path.join(assetsRoot, 'CREDITS.csv'),
    'filename,notes,authors,licenses,urls\n',
  );
  const store = createDirectoryAssetStore(assetsRoot);
  return {
    context: createRuntimeContext({ cwd, assetsRoot, spritesheetsBaseUrl: store.baseUrl }),
    store,
    source: 'working-directory',
  };
}

function createLifecycleRuntime(workspaceRoot: string): RuntimeAssets {
  const assetsRoot = path.join(workspaceRoot, 'base-assets');
  mkdirSync(path.join(assetsRoot, 'sheet_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'palette_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'spritesheets'), { recursive: true });
  writeFileSync(
    path.join(assetsRoot, 'CREDITS.csv'),
    'filename,notes,authors,licenses,urls\n',
  );
  const hairDefinitionPath = path.join(
    assetsRoot,
    'sheet_definitions',
    'hair',
    'braid.json',
  );
  mkdirSync(path.dirname(hairDefinitionPath), { recursive: true });
  writeFileSync(hairDefinitionPath, JSON.stringify({
    name: 'Braid',
    type_name: 'hair',
    animations: ['walk'],
    credits: [],
    layer_1: { zPos: 50, male: 'hair/braid/', female: 'hair/braid/' },
  }));
  const store = createDirectoryAssetStore(assetsRoot);
  return {
    context: createRuntimeContext({
      cwd: workspaceRoot,
      assetsRoot,
      customAssetsRoot: path.join(workspaceRoot, 'assets_custom'),
      spritesheetsBaseUrl: store.baseUrl,
    }),
    store,
    source: 'managed-cache',
  };
}

async function createInstallArchive(workspaceRoot: string): Promise<string> {
  const sourcePath = 'sprites/moon-braid/foreground/walk.png';
  const geometry = standardAnimationGeometry('walk');
  const maxColumn = Math.max(
    ...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)),
  );
  const canvas = createCanvas(
    (maxColumn + 1) * geometry.frameSize,
    geometry.rows.length * geometry.frameSize,
  );
  const context = canvas.getContext('2d');
  context.fillStyle = '#884422';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const source: AssetPackSource = {
    schema: ASSET_PACK_SCHEMA,
    id: 'acme.lifecycle',
    version: '1.0.0',
    displayName: 'ACME Lifecycle',
    credits: {
      authors: ['Pack Artist'],
      licenses: ['CC-BY-SA 4.0'],
      urls: ['https://example.test/pack-artist'],
      notes: 'Task 12 CLI fixture.',
    },
    assets: [{
      kind: 'new-item',
      localId: 'moon-braid',
      displayName: 'Moon Braid',
      typeName: 'hair',
      bodyTypes: ['male', 'female'],
      animations: ['walk'],
      layers: [{
        id: 'foreground',
        zPos: 120,
        sprites: [{ animation: 'walk', source: sourcePath }],
      }],
    }],
  };
  const bytes = await createDeterministicAssetPackArchive({
    manifestBytes: Buffer.from(`${JSON.stringify(source, null, 2)}\n`),
    sourceBytes: new Map([[sourcePath, canvas.toBuffer('image/png')]]),
  });
  const archivePath = path.join(workspaceRoot, 'acme.lifecycle-1.0.0.lpc-assets.zip');
  writeFileSync(archivePath, bytes);
  return archivePath;
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
  it('keeps preview warning blocks in warnings and preserves typed details after acknowledgement', async () => {
    const fixture = createWarningAssetCommandFixture();
    const runAssetJson = async (command: 'preview' | 'sync') => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const code = await runCli([
        'asset', command, fixture.packRoot,
        ...(command === 'preview' ? ['--asset', 'missing'] : []),
        '--workspace', fixture.workspace.root,
        '--json',
      ], {
        cwd: fixture.workspace.root,
        stdout: (text) => stdout.push(text),
        stderr: (text) => stderr.push(text),
      }, {
        prepareRuntimeAssets: async () => fixture.runtime,
      });
      return { code, response: JSON.parse(stdout.join('')), stderr };
    };

    const previewBlocked = await runAssetJson('preview');
    const syncBlocked = await runAssetJson('sync');

    expect(previewBlocked.code).toBe(1);
    expect(previewBlocked.stderr).toEqual([]);
    expect(previewBlocked.response).toMatchObject({
      ok: false,
      command: 'asset preview',
      data: null,
      warnings: [expect.objectContaining({ code: 'asset_path_inferred' })],
      errors: [],
    });
    expect(syncBlocked.code).toBe(1);
    expect(syncBlocked.response).toMatchObject({
      ok: false,
      command: 'asset sync',
      data: null,
      warnings: [expect.objectContaining({ code: 'asset_path_inferred' })],
      errors: [],
    });

    await acknowledgeWarning(fixture);
    const acknowledgedPreview = await runAssetJson('preview');

    expect(acknowledgedPreview.code).toBe(1);
    expect(acknowledgedPreview.response).toMatchObject({
      ok: false,
      command: 'asset preview',
      warnings: [],
      errors: [{
        code: 'asset_preview_asset_not_found',
        path: 'missing',
        details: { available: ['braid'] },
      }],
    });
  });

  it('preserves unavailable asset preview animation errors in the JSON envelope', async () => {
    const fixture = createWarningAssetCommandFixture();
    await acknowledgeWarning(fixture);
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runCli([
      'asset', 'preview', fixture.packRoot,
      '--animation', 'run',
      '--workspace', fixture.workspace.root,
      '--json',
    ], {
      cwd: fixture.workspace.root,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    }, {
      prepareRuntimeAssets: async () => fixture.runtime,
    });

    expect(code).toBe(1);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(''))).toEqual({
      ok: false,
      command: 'asset preview',
      data: null,
      warnings: [],
      errors: [{
        code: 'preview_animation_unavailable',
        message: 'The requested preview animation is unavailable.',
        path: 'run',
        details: { available: ['walk', 'climb'] },
      }],
    });
  });

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

  it('keeps invalid archive inspection data in a completed response and omits its snapshot', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-main-json-inspect-'));
    const archivePath = path.join(cwd, 'invalid.lpc-assets.zip');
    writeFileSync(archivePath, 'not a zip');
    const runtime = createLifecycleRuntime(cwd);
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runCli([
      'asset', 'inspect', archivePath, '--json',
    ], {
      cwd,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    }, {
      prepareRuntimeAssets: async () => runtime,
      findAssetWorkspace: () => {
        throw new Error('asset inspect must not discover a workspace');
      },
    });

    const response = JSON.parse(stdout.join('')) as {
      readonly data: Readonly<Record<string, unknown>>;
    };
    expect(code).toBe(1);
    expect(stderr).toEqual([]);
    expect(response).toMatchObject({
      ok: true,
      command: 'asset inspect',
      data: {
        archivePath,
        valid: false,
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: 'asset_archive_invalid' }),
        ]),
      },
      warnings: [],
      errors: [],
    });
    expect(response.data).not.toHaveProperty('snapshot');
  });

  it('keeps unhealthy doctor data in a completed response while exiting one', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'lpc-main-json-doctor-'));
    const workspace = initializeAssetWorkspace(workspaceRoot);
    writeFileSync(path.join(workspace.outputRoot, '.lpc-toolkit-managed.json'), '{}');
    const runtime = createLifecycleRuntime(workspaceRoot);
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runCli([
      'asset', 'doctor', '--workspace', workspaceRoot, '--json',
    ], {
      cwd: workspaceRoot,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    }, { prepareRuntimeAssets: async () => runtime });

    expect(code).toBe(1);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      ok: true,
      command: 'asset doctor',
      data: {
        healthy: false,
        recovery: 'none',
        checks: expect.arrayContaining([
          expect.objectContaining({ status: 'error' }),
        ]),
      },
      warnings: [],
      errors: [],
    });
  });

  it.each([
    ['pack', 'missing-pack'],
    ['install', 'invalid.lpc-assets.zip'],
    ['remove', 'missing.pack'],
  ])('uses a fatal envelope for asset %s lifecycle failures', async (command, positional) => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), `lpc-main-json-${command}-`));
    initializeAssetWorkspace(workspaceRoot);
    writeFileSync(path.join(workspaceRoot, 'invalid.lpc-assets.zip'), 'not a zip');
    const runtime = createLifecycleRuntime(workspaceRoot);
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runCli([
      'asset', command, positional, '--workspace', workspaceRoot, '--json',
    ], {
      cwd: workspaceRoot,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    }, { prepareRuntimeAssets: async () => runtime });

    expect(code).toBe(1);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      ok: false,
      command: `asset ${command}`,
      data: null,
      errors: expect.arrayContaining([
        expect.objectContaining({ code: expect.any(String) }),
      ]),
    });
  });

  it('returns an empty list as a successful no-op', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'lpc-main-json-list-'));
    initializeAssetWorkspace(workspaceRoot);
    const stdout: string[] = [];

    const code = await runCli([
      'asset', 'list', '--workspace', workspaceRoot, '--json',
    ], {
      cwd: workspaceRoot,
      stdout: (text) => stdout.push(text),
      stderr: () => undefined,
    }, {
      prepareRuntimeAssets: async () => {
        throw new Error('asset list must not prepare runtime assets');
      },
    });

    expect(code).toBe(0);
    expect(JSON.parse(stdout.join(''))).toEqual({
      ok: true,
      command: 'asset list',
      data: { recovery: 'none', entries: [] },
      warnings: [],
      errors: [],
    });
  });

  it('returns an identical install as a successful no-op without exposing archive snapshots', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'lpc-main-json-install-noop-'));
    initializeAssetWorkspace(workspaceRoot);
    const runtime = createLifecycleRuntime(workspaceRoot);
    const archivePath = await createInstallArchive(workspaceRoot);
    const runInstall = async () => {
      const stdout: string[] = [];
      const code = await runCli([
        'asset', 'install', archivePath, '--workspace', workspaceRoot, '--json',
      ], {
        cwd: workspaceRoot,
        stdout: (text) => stdout.push(text),
        stderr: () => undefined,
      }, { prepareRuntimeAssets: async () => runtime });
      return { code, response: JSON.parse(stdout.join('')) as Readonly<Record<string, unknown>> };
    };

    const first = await runInstall();
    expect(first.code, JSON.stringify(first.response, null, 2)).toBe(0);
    const second = await runInstall();
    expect(second.code).toBe(0);
    expect(second.response).toMatchObject({
      ok: true,
      command: 'asset install',
      data: { action: 'unchanged', packId: 'acme.lifecycle', version: '1.0.0' },
      warnings: [],
      errors: [],
    });
    expect(second.response.data).not.toHaveProperty('snapshot');
  }, 30000);

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
