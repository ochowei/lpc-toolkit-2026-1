import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../src/args.js';
import { AssetCacheError } from '../src/asset-cache.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { createRuntimeContext } from '../src/context.js';
import { commandNeedsAssets, resolveWebRoot, runCli } from '../src/main.js';
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
    [['token', 'encode', '--selection', 'selection.json']],
    [['token', 'decode', '--token', 'v1.example']],
    [['preset', 'list']],
    [['catalog', '--help']],
    [['render', '--help']],
    [['preset', 'render', '--help']],
  ])('classifies %j as asset-independent', (argv) => {
    expect(commandNeedsAssets(parseArgs(argv))).toBe(false);
  });

  it.each([
    [['catalog', 'types']],
    [['selection', 'validate', '--selection', 'selection.json']],
    [['preset', 'materialize', 'villager']],
    [['render', '--selection', 'selection.json', '--out', 'out']],
    [['web']],
  ])('classifies %j as asset-dependent', (argv) => {
    expect(commandNeedsAssets(parseArgs(argv))).toBe(true);
  });

  it('does not classify web help as asset-dependent', () => {
    expect(commandNeedsAssets(parseArgs(['web', '--help']))).toBe(false);
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

  it('does not prepare assets for help', async () => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => runtime);
    const capture = captureIo(runtime.context.repoRoot);
    expect(await runCli(['--help'], capture.io, { prepareRuntimeAssets: prepare })).toBe(0);
    expect(prepare).not.toHaveBeenCalled();
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
    expect(capture.stdout.join('')).toContain('Commands:');
    expect(capture.stderr).toEqual([]);
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
