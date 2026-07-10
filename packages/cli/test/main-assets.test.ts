import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../src/args.js';
import { AssetCacheError } from '../src/asset-cache.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { createRuntimeContext } from '../src/context.js';
import { commandNeedsAssets, runCli } from '../src/main.js';
import type {
  PrepareRuntimeAssetsOptions,
  RuntimeAssets,
} from '../src/runtime-assets.js';

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
  ])('classifies %j as asset-independent', (argv) => {
    expect(commandNeedsAssets(parseArgs(argv))).toBe(false);
  });

  it.each([
    [['catalog', 'types']],
    [['selection', 'validate', '--selection', 'selection.json']],
    [['preset', 'materialize', 'villager']],
    [['render', '--selection', 'selection.json', '--out', 'out']],
  ])('classifies %j as asset-dependent', (argv) => {
    expect(commandNeedsAssets(parseArgs(argv))).toBe(true);
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
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions): Promise<RuntimeAssets> => {
      throw new AssetCacheError('asset_integrity_failed', 'Checksum mismatch.', '/cache/assets-v1');
    });
    const capture = captureIo(runtime.context.repoRoot);
    expect(await runCli(['catalog', 'types', '--json'], capture.io, {
      prepareRuntimeAssets: prepare,
    })).toBe(1);
    expect(JSON.parse(capture.stdout.join('')).errors[0]).toMatchObject({
      code: 'asset_integrity_failed',
      path: '/cache/assets-v1',
    });
  });

  it('formats the same cache failure for humans', async () => {
    const prepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions): Promise<RuntimeAssets> => {
      throw new AssetCacheError('asset_download_failed', 'Network unavailable.');
    });
    const capture = captureIo(runtime.context.repoRoot);
    expect(await runCli(['catalog', 'types'], capture.io, {
      prepareRuntimeAssets: prepare,
    })).toBe(1);
    expect(capture.stdout).toEqual([]);
    expect(capture.stderr.join('')).toContain('asset_download_failed');
  });
});
