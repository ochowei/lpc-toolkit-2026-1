import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../src/args.js';
import { assetCommandRequirements } from '../src/asset-commands.js';
import { AssetCacheError } from '../src/asset-cache.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { initializeAssetWorkspace } from '../src/asset-workspace.js';
import { createRuntimeContext } from '../src/context.js';
import { commandNeedsAssets, resolveWebRoot, runCli } from '../src/main.js';
import { CLI_VERSION } from '../src/package-info.js';
import type {
  PrepareRuntimeAssetsOptions,
  RuntimeAssets,
} from '../src/runtime-assets.js';
import { prepareRuntimeAssets } from '../src/runtime-assets.js';
import type { RunningWebServer } from '../src/web-server.js';

const releaseConfig = {
  tag: 'assets-v1',
  sourceRepository: 'owner/repo',
  sourceSha: 'a'.repeat(40),
  manifestUrl: 'https://example.test/manifest.json',
  manifestSha256: 'b'.repeat(64),
  tarballUrl: 'https://example.test/assets.tar.gz',
  tarballSha256: 'c'.repeat(64),
};

it('resolves the packaged Web bundle beside the emitted CLI module', () => {
  const distRoot = path.join(tmpdir(), 'installed-cli', 'dist');

  expect(resolveWebRoot(pathToFileURL(path.join(distRoot, 'main.js')).href)).toBe(
    path.join(distRoot, 'web'),
  );
});

function failingManagedPreparation(
  cwd: string,
  failure: AssetCacheError,
): {
  readonly prepare: typeof prepareRuntimeAssets;
  readonly releaseRoot: string;
} {
  const cacheRoot = path.join(cwd, 'managed-cache');
  const configPath = path.join(cwd, 'asset-release.json');
  writeFileSync(configPath, JSON.stringify(releaseConfig));
  return {
    releaseRoot: path.join(cacheRoot, releaseConfig.tag),
    prepare: (options) =>
      prepareRuntimeAssets({
        ...options,
        configPath,
        env: { LPC_TOOLKIT_CACHE_DIR: cacheRoot },
        ensureCache: async () => {
          throw failure;
        },
      }),
  };
}

function makeRuntimeAssets(): RuntimeAssets {
  const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-main-assets-'));
  const assetsRoot = path.join(cwd, 'assets');
  mkdirSync(path.join(assetsRoot, 'sheet_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'palette_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'spritesheets'), { recursive: true });
  writeFileSync(path.join(assetsRoot, 'CREDITS.csv'), 'file,authors,licenses\n');
  const store = createDirectoryAssetStore(assetsRoot);
  return {
    context: createRuntimeContext({ cwd, assetsRoot, spritesheetsBaseUrl: store.baseUrl }),
    store,
    source: 'working-directory',
  };
}

function captureIo(cwd: string): {
  readonly io: {
    readonly cwd: string;
    readonly stdout: (text: string) => void;
    readonly stderr: (text: string) => void;
  };
  readonly stdout: string[];
  readonly stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      cwd,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    },
    stdout,
    stderr,
  };
}

describe('asset preparation dispatch', () => {
  const runtime = makeRuntimeAssets();

  it.each([
    { argv: ['asset', 'workspace', 'init', 'workspace'], workspace: false, runtime: false },
    { argv: ['asset', 'authoring', 'start', '--plan', 'plan.json'], workspace: true, runtime: false },
    { argv: ['asset', 'authoring', 'status', '--session', 'session-id'], workspace: true, runtime: false },
    { argv: ['asset', 'authoring', 'resume', '--session', 'session-id'], workspace: true, runtime: false },
    { argv: ['asset', 'inspect', 'pack.lpc-assets.zip'], workspace: false, runtime: true },
    { argv: ['asset', 'list'], workspace: true, runtime: false },
    { argv: ['asset', 'init', '--new'], workspace: true, runtime: true },
    { argv: ['asset', 'validate', 'pack'], workspace: true, runtime: true },
    { argv: ['asset', 'preview', 'pack'], workspace: true, runtime: true },
    { argv: ['asset', 'sync', 'pack'], workspace: true, runtime: true },
    { argv: ['asset', 'pack', 'pack'], workspace: true, runtime: true },
    { argv: ['asset', 'install', 'pack.lpc-assets.zip'], workspace: true, runtime: true },
    { argv: ['asset', 'remove', 'acme.pack'], workspace: true, runtime: true },
    { argv: ['asset', 'doctor'], workspace: true, runtime: true },
  ])('declares workspace/runtime requirements for $argv', ({ argv, workspace, runtime: needsRuntime }) => {
    expect(assetCommandRequirements(parseArgs(argv))).toEqual({
      workspace,
      runtime: needsRuntime,
    });
  });

  it.each([
    [['token', 'decode', '--token', 'v1.example']],
    [['preset', 'list']],
    [['character', 'list']],
    [['character', 'create', 'hero']],
    [['catalog', '--help']],
    [['render', '--help']],
    [['preset', 'render', '--help']],
  ])('classifies %j as asset-independent', (argv) => {
    expect(commandNeedsAssets(parseArgs(argv))).toBe(false);
  });

  it.each([
    [['catalog', 'types']],
    [['token', 'encode', '--selection', 'selection.json']],
    [['selection', 'validate', '--selection', 'selection.json']],
    [['preset', 'materialize', 'villager']],
    [['render', '--selection', 'selection.json', '--out', 'out']],
    [['web']],
    [['character', 'create', 'hero', '--preset', 'farmer']],
    [['character', 'search', 'hero', '--type', 'hair']],
    [['character', 'set', 'hero', '--type', 'hair', '--item', 'braids']],
    [['character', 'remove', 'hero', '--type', 'hair']],
    [['character', 'show', 'hero']],
    [['character', 'validate', 'hero']],
    [['character', 'preview', 'hero']],
    [['character', 'render', 'hero', '--out', 'out']],
  ])('classifies %j as asset-dependent', (argv) => {
    expect(commandNeedsAssets(parseArgs(argv))).toBe(true);
  });

  it('does not classify web help as asset-dependent', () => {
    expect(commandNeedsAssets(parseArgs(['web', '--help']))).toBe(false);
  });

  it.each([
    ['asset'],
    ['asset', 'workspace'],
    ['asset', 'workspace', 'init', '--help'],
    ['asset', 'init', '--help'],
    ['asset', 'validate', '--help'],
    ['asset', 'preview', '--help'],
    ['asset', 'sync', '--help'],
    ['asset', 'pack', '--help'],
    ['asset', 'inspect', '--help'],
    ['asset', 'install', '--help'],
    ['asset', 'list', '--help'],
    ['asset', 'remove', '--help'],
    ['asset', 'doctor', '--help'],
  ])('shows asset help for %j without preparing runtime assets', async (...argv) => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const capture = captureIo(runtime.context.repoRoot);

    expect(await runCli(argv, capture.io, { prepareRuntimeAssets: prepare })).toBe(0);
    expect(prepare).not.toHaveBeenCalled();
    expect(capture.stdout.join('')).toContain('Usage:');
    expect(capture.stderr).toEqual([]);
  });

  it('initializes an asset workspace without preparing or requiring a cache', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-main-workspace-init-'));
    const target = path.join(cwd, 'artist-workspace');
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const capture = captureIo(cwd);

    expect(await runCli([
      'asset', 'workspace', 'init', './artist-workspace', '--json',
    ], capture.io, { prepareRuntimeAssets: prepare })).toBe(0);

    expect(prepare).not.toHaveBeenCalled();
    expect(existsSync(path.join(target, 'lpc-asset-workspace.json'))).toBe(true);
    expect(JSON.parse(capture.stdout.join(''))).toMatchObject({
      ok: true,
      command: 'asset workspace init',
      data: { root: target },
    });
  });

  it('rejects a scaffold output that escapes artist-packs through a symlink', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lpc-main-asset-symlink-init-'));
    const workspace = initializeAssetWorkspace(root);
    const outside = mkdtempSync(path.join(tmpdir(), 'lpc-main-asset-symlink-outside-'));
    symlinkSync(outside, path.join(workspace.packsRoot, 'linked'), 'dir');
    const escapedOutput = path.join(workspace.packsRoot, 'linked', 'acme.hair');
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const capture = captureIo(root);

    expect(await runCli([
      'asset', 'init', '--new', '--pack-id', 'acme.hair',
      '--display-name', 'ACME Hair', '--asset-id', 'moon-braid', '--type', 'hair',
      '--body-type', 'male', '--animation', 'walk', '--author', 'Alice',
      '--license', 'CC-BY-SA 4.0', '--url', 'https://example.test/acme-hair',
      '--out', escapedOutput, '--json',
    ], capture.io, { prepareRuntimeAssets: prepare })).toBe(1);

    expect(prepare).not.toHaveBeenCalled();
    expect(existsSync(path.join(outside, 'acme.hair'))).toBe(false);
    expect(JSON.parse(capture.stdout.join(''))).toMatchObject({
      ok: false,
      command: 'asset init',
      errors: [{ code: 'invalid_option', path: '--out' }],
    });
  });

  it.each([
    {
      name: 'new scaffold',
      argv: [
        'asset', 'init', '--new', '--pack-id', 'acme.hair',
        '--display-name', 'ACME Hair', '--asset-id', 'moon-braid',
        '--type', 'hair', '--body-type', 'male', '--animation', 'walk',
        '--author', 'Alice', '--license', 'CC-BY-SA 4.0',
        '--url', 'https://example.test/acme-hair',
      ],
    },
    {
      name: 'audit scaffold',
      argv: [
        'asset', 'init', '--from-audit', 'audit.json', '--item', 'hair_braid',
        '--pack-id', 'acme.audit', '--display-name', 'ACME Audit',
        '--author', 'Alice', '--license', 'CC-BY-SA 4.0',
        '--url', 'https://example.test/acme-audit',
      ],
      prepareWorkspace: (root: string) => writeFileSync(path.join(root, 'audit.json'), '{}'),
    },
    {
      name: 'validation',
      argv: ['asset', 'validate', 'artist-packs/invalid'],
      prepareWorkspace: (root: string) => {
        const pack = path.join(root, 'artist-packs', 'invalid');
        mkdirSync(pack, { recursive: true });
        writeFileSync(path.join(pack, 'asset-pack.json'), '{}');
      },
    },
    {
      name: 'preview',
      argv: ['asset', 'preview', 'artist-packs/invalid'],
      prepareWorkspace: (root: string) => {
        const pack = path.join(root, 'artist-packs', 'invalid');
        mkdirSync(pack, { recursive: true });
        writeFileSync(path.join(pack, 'asset-pack.json'), '{}');
      },
    },
    {
      name: 'sync',
      argv: ['asset', 'sync', 'artist-packs/invalid'],
      prepareWorkspace: (root: string) => {
        const pack = path.join(root, 'artist-packs', 'invalid');
        mkdirSync(pack, { recursive: true });
        writeFileSync(path.join(pack, 'asset-pack.json'), '{}');
      },
    },
    {
      name: 'packaging',
      argv: ['asset', 'pack', 'artist-packs/invalid'],
      prepareWorkspace: (root: string) => {
        const pack = path.join(root, 'artist-packs', 'invalid');
        mkdirSync(pack, { recursive: true });
        writeFileSync(path.join(pack, 'asset-pack.json'), '{}');
      },
    },
    {
      name: 'installation',
      argv: ['asset', 'install', 'invalid.lpc-assets.zip'],
      prepareWorkspace: (root: string) => {
        writeFileSync(path.join(root, 'invalid.lpc-assets.zip'), 'not a zip');
      },
    },
    {
      name: 'removal',
      argv: ['asset', 'remove', 'missing.pack'],
    },
    {
      name: 'doctor',
      argv: ['asset', 'doctor'],
    },
  ])('discovers the workspace before preparing assets for $name', async ({
    argv,
    prepareWorkspace,
  }) => {
    const root = mkdtempSync(path.join(tmpdir(), 'lpc-main-asset-command-'));
    initializeAssetWorkspace(root);
    prepareWorkspace?.(root);
    const nestedCwd = path.join(root, 'nested');
    mkdirSync(nestedCwd);
    const prepare = vi.fn(async (options: PrepareRuntimeAssetsOptions) => {
      expect(existsSync(path.join(options.cwd, 'lpc-asset-workspace.json'))).toBe(true);
      return runtime;
    });
    const capture = captureIo(nestedCwd);

    await runCli([...argv, '--workspace', root, '--json'], capture.io, {
      prepareRuntimeAssets: prepare,
    });

    expect(prepare).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({
      cwd: root,
      managedCacheOnly: true,
    }));
  });

  it.each([
    ['asset'],
    ['asset', 'workspace', 'init'],
    ['asset', 'workspace', 'bogus'],
    ['asset', 'init', '--new'],
    ['asset', 'init', '--new', '--from-audit', 'audit.json'],
    ['asset', 'init', '--from-audit', 'audit.json'],
    ['asset', 'validate'],
    ['asset', 'preview'],
    ['asset', 'sync'],
    ['asset', 'pack'],
    ['asset', 'pack', 'one', 'two'],
    ['asset', 'inspect'],
    ['asset', 'inspect', 'one.zip', 'two.zip'],
    ['asset', 'install'],
    ['asset', 'install', 'one.zip', 'two.zip'],
    ['asset', 'list', 'unexpected'],
    ['asset', 'remove'],
    ['asset', 'remove', 'one', 'two'],
    ['asset', 'doctor', 'unexpected'],
    ['asset', 'doctor', '--repair'],
  ])('rejects invalid asset input before preparing assets: %j', async (...argv) => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const findWorkspace = vi.fn(() => {
      throw new Error('invalid preflight must not discover a workspace');
    });
    const capture = captureIo(runtime.context.repoRoot);

    expect(await runCli([...argv, '--json'], capture.io, {
      prepareRuntimeAssets: prepare,
      findAssetWorkspace: findWorkspace,
    })).toBe(1);
    expect(prepare).not.toHaveBeenCalled();
    expect(findWorkspace).not.toHaveBeenCalled();
    expect(JSON.parse(capture.stdout.join(''))).toMatchObject({ ok: false });
  });

  it('inspects at the current cwd with managed cache assets and no workspace discovery', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-main-asset-inspect-'));
    writeFileSync(path.join(cwd, 'invalid.lpc-assets.zip'), 'not a zip');
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const findWorkspace = vi.fn(() => {
      throw new Error('asset inspect must not discover a workspace');
    });
    const capture = captureIo(cwd);

    expect(await runCli([
      'asset', 'inspect', 'invalid.lpc-assets.zip', '--json',
    ], capture.io, {
      prepareRuntimeAssets: prepare,
      findAssetWorkspace: findWorkspace,
    })).toBe(1);

    expect(findWorkspace).not.toHaveBeenCalled();
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({
      cwd,
      managedCacheOnly: true,
    }));
  });

  it('lists and recovers workspace state without preparing base assets', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lpc-main-asset-list-'));
    const workspace = initializeAssetWorkspace(root);
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => {
      throw new Error('asset list must not prepare runtime assets');
    });
    const findWorkspace = vi.fn(() => workspace);
    const capture = captureIo(root);

    expect(await runCli(['asset', 'list', '--json'], capture.io, {
      prepareRuntimeAssets: prepare,
      findAssetWorkspace: findWorkspace,
    })).toBe(0);

    expect(findWorkspace).toHaveBeenCalledOnce();
    expect(prepare).not.toHaveBeenCalled();
    expect(JSON.parse(capture.stdout.join(''))).toMatchObject({
      ok: true,
      command: 'asset list',
      data: { recovery: 'none', entries: [] },
    });
  });

  it('writes non-JSON validation diagnostics to stderr', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lpc-main-asset-human-validation-'));
    initializeAssetWorkspace(root);
    const packRoot = path.join(root, 'artist-packs', 'invalid');
    mkdirSync(packRoot, { recursive: true });
    writeFileSync(path.join(packRoot, 'asset-pack.json'), '{}');
    const capture = captureIo(root);

    expect(await runCli([
      'asset', 'validate', packRoot,
    ], capture.io, { prepareRuntimeAssets: async () => runtime })).toBe(1);

    expect(capture.stdout).toEqual([]);
    expect(capture.stderr.join('')).toContain('Asset pack validation: invalid');
    expect(capture.stderr.join('')).toContain('Errors (');
  });

  it.each([
    {
      name: 'an output outside artist-packs',
      extra: ['--out', '../outside-pack'],
    },
    {
      name: 'an audit-only selector in new mode',
      extra: ['--item', 'hair_braid'],
    },
  ])('rejects $name before preparing assets', async ({ extra }) => {
    const root = mkdtempSync(path.join(tmpdir(), 'lpc-main-asset-invalid-init-'));
    initializeAssetWorkspace(root);
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const capture = captureIo(root);

    expect(await runCli([
      'asset', 'init', '--new', '--pack-id', 'acme.hair',
      '--display-name', 'ACME Hair', '--asset-id', 'moon-braid', '--type', 'hair',
      '--body-type', 'male', '--animation', 'walk', '--author', 'Alice',
      '--license', 'CC-BY-SA 4.0', '--url', 'https://example.test/acme-hair',
      ...extra, '--json',
    ], capture.io, { prepareRuntimeAssets: prepare })).toBe(1);

    expect(prepare).not.toHaveBeenCalled();
    expect(JSON.parse(capture.stdout.join(''))).toMatchObject({
      ok: false,
      command: 'asset init',
      errors: [{ code: 'invalid_option' }],
    });
  });

  it('prepares managed assets, prints the URL, and waits for web server closure', async () => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const running: RunningWebServer = {
      url: 'http://127.0.0.1:45678',
      close: async () => undefined,
      closed: Promise.resolve(),
    };
    const start = vi.fn(async () => running);
    const capture = captureIo(runtime.context.repoRoot);

    expect(await runCli(['web', '--port', '0', '--no-open'], capture.io, {
      prepareRuntimeAssets: prepare,
      startWebServer: start,
    })).toBe(0);

    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ managedCacheOnly: true }));
    expect(start).toHaveBeenCalledOnce();
    expect(capture.stdout.join('')).toContain('http://127.0.0.1:');
  });

  it('warns when an explicitly requested non-loopback host exposes the web UI to the LAN', async () => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const running: RunningWebServer = {
      url: 'http://0.0.0.0:45678',
      close: async () => undefined,
      closed: Promise.resolve(),
    };
    const capture = captureIo(runtime.context.repoRoot);

    expect(await runCli(['web', '--host', '0.0.0.0', '--no-open'], capture.io, {
      prepareRuntimeAssets: prepare,
      startWebServer: async () => running,
    })).toBe(0);

    expect(capture.stderr.join('')).toContain('reachable from other machines on your network');
    expect(capture.stderr.join('')).toContain('trusted network');
  });

  it.each([
    [['web', '--port', '65536']],
    [['web', 'extra']],
    [['web', '--json']],
  ])('rejects invalid web invocation %j without preparing assets', async (argv) => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const capture = captureIo(runtime.context.repoRoot);

    expect(await runCli(argv, capture.io, { prepareRuntimeAssets: prepare })).toBe(1);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('prepares assets exactly once before catalog dispatch', async () => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const capture = captureIo(runtime.context.repoRoot);
    const code = await runCli(['catalog', 'types'], capture.io, {
      prepareRuntimeAssets: prepare,
    });

    expect(code).toBe(0);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('discovers an enclosing asset workspace before choosing a local assets baseline', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lpc-main-workspace-runtime-'));
    initializeAssetWorkspace(root);
    const localAssetsRoot = path.join(root, 'assets');
    mkdirSync(path.join(localAssetsRoot, 'sheet_definitions'), { recursive: true });
    mkdirSync(path.join(localAssetsRoot, 'palette_definitions'), { recursive: true });
    mkdirSync(path.join(localAssetsRoot, 'spritesheets'), { recursive: true });
    writeFileSync(path.join(localAssetsRoot, 'CREDITS.csv'), 'local baseline\n');
    const managedRuntime: RuntimeAssets = {
      ...runtime,
      source: 'managed-cache',
      releaseTag: 'fixture-pinned-release',
    };
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => managedRuntime);
    const capture = captureIo(root);

    expect(await runCli(['catalog', 'types', '--json'], capture.io, {
      prepareRuntimeAssets: prepare,
    })).toBe(0);
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({
      cwd: root,
      managedCacheOnly: true,
    }));
  });

  it('does not prepare assets for help', async () => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const capture = captureIo(runtime.context.repoRoot);
    expect(await runCli(['--help'], capture.io, { prepareRuntimeAssets: prepare })).toBe(0);
    expect(prepare).not.toHaveBeenCalled();
  });

  it('rejects invalid options without preparing assets', async () => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const capture = captureIo(runtime.context.repoRoot);

    expect(await runCli(['catalog', 'items', '--tpye', 'hair'], capture.io, {
      prepareRuntimeAssets: prepare,
    })).toBe(1);
    expect(prepare).not.toHaveBeenCalled();
    expect(capture.stderr.join('')).toContain('Unknown option: --tpye');
  });

  it('preserves catalog item empty-filter rejection before preparing assets', async () => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const capture = captureIo(runtime.context.repoRoot);

    expect(await runCli(['catalog', 'items', '--type', '', '--json'], capture.io, {
      prepareRuntimeAssets: prepare,
    })).toBe(1);
    expect(prepare).not.toHaveBeenCalled();
    expect(JSON.parse(capture.stdout.join(''))).toMatchObject({
      ok: false,
      command: 'catalog items',
      errors: [{ code: 'invalid_option', path: '--type' }],
    });
  });

  it('rejects an animation audit without targets before preparing assets', async () => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const capture = captureIo(runtime.context.repoRoot);

    expect(await runCli(['catalog', 'audit-animations', '--json'], capture.io, {
      prepareRuntimeAssets: prepare,
    })).toBe(1);
    expect(prepare).not.toHaveBeenCalled();
    expect(JSON.parse(capture.stdout.join(''))).toMatchObject({
      ok: false,
      command: 'catalog audit-animations',
      errors: [{
        code: 'missing_argument',
        path: '--animation',
      }],
    });
  });

  it.each([
    ['--animation', '--animation', 'walk'],
    ['--animation', 'walk', '--animation'],
  ])('rejects a malformed repeated animation option before preparing assets: %j', async (...flags) => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const capture = captureIo(runtime.context.repoRoot);

    expect(await runCli(['catalog', 'audit-animations', ...flags, '--json'], capture.io, {
      prepareRuntimeAssets: prepare,
    })).toBe(1);
    expect(prepare).not.toHaveBeenCalled();
    expect(JSON.parse(capture.stdout.join(''))).toMatchObject({
      ok: false,
      command: 'catalog audit-animations',
      errors: [{ code: 'invalid_option', path: '--animation' }],
    });
  });

  it.each([
    ['catalog', 'items', '--limit', '0'],
    ['catalog', 'items', '--limit', '101'],
    ['catalog', 'items', '--offset', '-1'],
    ['catalog', 'items', '--all', '--limit', '10'],
    ['character', 'search', 'hero', '--type', 'hair', '--all', '--offset', '1'],
  ])('rejects invalid discovery pagination before assets: %j', async (...argv) => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const capture = captureIo(runtime.context.repoRoot);
    expect(await runCli([...argv, '--json'], capture.io, {
      prepareRuntimeAssets: prepare,
    })).toBe(1);
    expect(prepare).not.toHaveBeenCalled();
    expect(JSON.parse(capture.stdout.join('')).errors[0]).toMatchObject({
      code: 'invalid_option',
    });
  });

  it('rejects an unsafe numeric offset as structured JSON before assets', async () => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const capture = captureIo(runtime.context.repoRoot);

    expect(await runCli([
      'catalog', 'items', '--offset', '9'.repeat(400), '--json',
    ], capture.io, { prepareRuntimeAssets: prepare })).toBe(1);
    expect(prepare).not.toHaveBeenCalled();
    expect(capture.stderr).toEqual([]);
    expect(JSON.parse(capture.stdout.join(''))).toMatchObject({
      ok: false,
      command: 'catalog items',
      data: null,
      warnings: [],
      errors: [{
        code: 'invalid_option',
        message: '--offset must be a non-negative integer.',
        path: '--offset',
      }],
    });
  });

  it.each([
    ['render', '--selection', 'selection.json', '--out', 'out', '--bundle', 'tar'],
    ['character', 'render', 'hero', '--out', 'out', '--bundle', 'tar'],
  ])('rejects an unsupported bundle value before preparing assets: %j', async (...argv) => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const capture = captureIo(runtime.context.repoRoot);

    expect(await runCli([...argv, '--json'], capture.io, {
      prepareRuntimeAssets: prepare,
    })).toBe(1);
    expect(prepare).not.toHaveBeenCalled();
    expect(JSON.parse(capture.stdout.join('')).errors[0]).toMatchObject({
      code: 'invalid_option',
      path: '--bundle',
      details: { available: ['zip'] },
    });
  });

  it.each(['--version', '-V'])('prints the package version for %s without preparing assets', async (flag) => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const capture = captureIo(runtime.context.repoRoot);

    expect(await runCli([flag], capture.io, { prepareRuntimeAssets: prepare })).toBe(0);
    expect(prepare).not.toHaveBeenCalled();
    expect(capture.stdout).toEqual([`${CLI_VERSION}\n`]);
    expect(capture.stderr).toEqual([]);
  });

  it.each([
    [['catalog', 'bogus'], 'unknown_command'],
    [['catalog', 'item'], 'missing_argument'],
    [['selection', 'bogus'], 'unknown_command'],
    [['selection', 'validate'], 'missing_argument'],
    [['render'], 'missing_argument'],
    [
      ['render', 'bogus', '--selection', 'selection.json', '--out', 'out'],
      'unknown_command',
    ],
    [['preset', 'bogus'], 'unknown_command'],
    [['preset', 'materialize'], 'missing_argument'],
    [['preset', 'render', 'farmer'], 'missing_argument'],
  ])(
    'returns %s as a usage error without preparing assets',
    async (argv, expectedCode) => {
      const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
      const capture = captureIo(runtime.context.repoRoot);

      expect(await runCli([...argv, '--json'], capture.io, {
        prepareRuntimeAssets: prepare,
      })).toBe(1);
      expect(prepare).not.toHaveBeenCalled();
      expect(JSON.parse(capture.stdout.join('')).errors[0]).toMatchObject({
        code: expectedCode,
      });
    },
  );

  it.each([
    [['catalog', '--help']],
    [['render', '--help']],
    [['preset', 'render', '--help']],
  ])('does not prepare assets for nested help: %j', async (argv) => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const capture = captureIo(runtime.context.repoRoot);

    expect(await runCli(argv, capture.io, { prepareRuntimeAssets: prepare })).toBe(0);
    expect(prepare).not.toHaveBeenCalled();
    expect(capture.stdout.join('')).toContain('Usage:');
    expect(capture.stderr).toEqual([]);
  });

  it('prints command-specific nested help', async () => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const capture = captureIo(runtime.context.repoRoot);

    expect(await runCli(['character', 'set', '--help'], capture.io, {
      prepareRuntimeAssets: prepare,
    })).toBe(0);
    expect(prepare).not.toHaveBeenCalled();
    expect(capture.stdout.join('')).toContain(
      'lpc-toolkit character set (<name> | --selection <file>) --type <type> --item <item-id-or-type/name> [options]',
    );
  });

  it('keeps JSON stdout parseable while progress goes to stderr', async () => {
    const prepare = vi.fn(async (options: PrepareRuntimeAssetsOptions) => {
      options.onProgress?.({
        phase: 'manifest-download',
        releaseTag: 'assets-v1',
        message: 'Downloading manifest.',
      });
      return runtime;
    });
    const capture = captureIo(runtime.context.repoRoot);
    expect(await runCli(['catalog', 'types', '--json'], capture.io, {
      prepareRuntimeAssets: prepare,
    })).toBe(0);
    expect(JSON.parse(capture.stdout.join(''))).toMatchObject({ ok: true });
    expect(capture.stderr.join('')).toContain('manifest-download');
  });

  it('formats typed cache failures as JSON', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-main-cache-json-'));
    const { prepare, releaseRoot } = failingManagedPreparation(
      cwd,
      new AssetCacheError(
        'asset_integrity_failed',
        'Checksum mismatch.',
        'https://example.test/assets.tar.gz',
      ),
    );
    const capture = captureIo(cwd);
    expect(await runCli(['catalog', 'types', '--json'], capture.io, {
      prepareRuntimeAssets: prepare,
    })).toBe(1);
    const issue = JSON.parse(capture.stdout.join('')).errors[0] as {
      readonly code: string;
      readonly message: string;
      readonly path: string;
    };
    expect(issue).toMatchObject({
      code: 'asset_integrity_failed',
      path: releaseRoot,
    });
    expect(issue.message).toContain(`pinned asset release ${releaseConfig.tag}`);
    expect(issue.message).toContain(releaseRoot);
    expect(issue.message).toContain(`remove only ${releaseRoot}`);
    expect(issue.message).toContain('do not bypass integrity verification');
  });

  it('formats the same cache failure for humans', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-main-cache-human-'));
    const { prepare, releaseRoot } = failingManagedPreparation(
      cwd,
      new AssetCacheError('asset_download_failed', 'Network unavailable.'),
    );
    const capture = captureIo(cwd);
    expect(await runCli(['catalog', 'types'], capture.io, {
      prepareRuntimeAssets: prepare,
    })).toBe(1);
    expect(capture.stdout).toEqual([]);
    const output = capture.stderr.join('');
    expect(output).toContain('asset_download_failed');
    expect(output).toContain(`pinned asset release ${releaseConfig.tag}`);
    expect(output).toContain(releaseRoot);
    expect(output).toContain(`remove only ${releaseRoot}`);
    expect(output).toContain('do not bypass integrity verification');
  });
});
