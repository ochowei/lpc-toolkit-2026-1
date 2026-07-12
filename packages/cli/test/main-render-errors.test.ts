import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { AssetCacheLayout } from '../src/asset-cache.js';
import { createZipAssetStore } from '../src/asset-store.js';
import { createRuntimeContext } from '../src/context.js';
import { runCli } from '../src/main.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

const logicalSpritePath = 'spritesheets/body/bodies/male/walk.png';

async function createMissingImageRuntime(): Promise<RuntimeAssets> {
  const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-main-render-error-'));
  const releaseRoot = path.join(cwd, 'cache', 'assets-v1');
  const layout: AssetCacheLayout = {
    releaseRoot,
    zipsRoot: path.join(releaseRoot, 'zips'),
    sheetDefinitionsRoot: path.join(releaseRoot, 'sheet_definitions'),
    paletteDefinitionsRoot: path.join(releaseRoot, 'palette_definitions'),
    creditsPath: path.join(releaseRoot, 'CREDITS.csv'),
    manifestPath: path.join(releaseRoot, 'asset-manifest.json'),
    spriteIndexPath: path.join(releaseRoot, 'sprite-index.json'),
    metadataIndexPath: path.join(releaseRoot, 'metadata-index.json'),
  };
  mkdirSync(path.join(layout.sheetDefinitionsRoot, 'body'), { recursive: true });
  mkdirSync(layout.paletteDefinitionsRoot, { recursive: true });
  mkdirSync(layout.zipsRoot, { recursive: true });
  writeFileSync(
    path.join(layout.sheetDefinitionsRoot, 'body', 'body.json'),
    JSON.stringify({
      name: 'Body Color',
      type_name: 'body',
      priority: 10,
      layer_1: { zPos: 10, male: 'body/bodies/male/' },
      match_body_color: true,
      recolors: { material: 'body', palettes: ['ulpc'] },
      animations: ['walk'],
      credits: [
        {
          file: 'body/bodies/male',
          authors: ['Fixture Artist'],
          licenses: ['GPL 3.0'],
          urls: ['https://example.test/fixture'],
        },
      ],
    }),
  );
  writeFileSync(
    path.join(layout.paletteDefinitionsRoot, 'meta_ulpc.json'),
    JSON.stringify({ type: 'version', label: 'Universal LPC' }),
  );
  mkdirSync(path.join(layout.paletteDefinitionsRoot, 'body'), { recursive: true });
  writeFileSync(
    path.join(layout.paletteDefinitionsRoot, 'body', 'meta_body.json'),
    JSON.stringify({
      type: 'material',
      label: 'Skintone',
      default: 'ulpc',
      base: 'light',
    }),
  );
  writeFileSync(
    path.join(layout.paletteDefinitionsRoot, 'body', 'body_ulpc.json'),
    JSON.stringify({ light: ['#000000'] }),
  );
  writeFileSync(layout.creditsPath, 'file,authors,licenses\n');
  writeFileSync(layout.spriteIndexPath, JSON.stringify([logicalSpritePath]));
  const zip = new JSZip();
  zip.file('unrelated.png', 'not requested');
  writeFileSync(
    path.join(layout.zipsRoot, 'body.zip'),
    await zip.generateAsync({ type: 'nodebuffer' }),
  );
  writeFileSync(
    path.join(cwd, 'selection.json'),
    JSON.stringify({
      schema: 'lpc-toolkit.selection.v1',
      name: 'missing-image',
      bodyType: 'male',
      items: { body: { name: 'Body Color' } },
    }),
  );
  mkdirSync(path.join(cwd, 'characters'), { recursive: true });
  writeFileSync(
    path.join(cwd, 'characters', 'missing-image.selection.json'),
    JSON.stringify({
      schema: 'lpc-toolkit.selection.v1',
      name: 'missing-image',
      bodyType: 'male',
      items: { body: { name: 'Body Color' } },
    }),
  );
  const store = createZipAssetStore(layout);
  return {
    context: createRuntimeContext({
      cwd,
      assetsRoot: releaseRoot,
      spritesheetsBaseUrl: store.baseUrl,
    }),
    store,
    source: 'managed-cache',
    releaseTag: 'assets-v1',
  };
}

async function runJson(
  argv: readonly string[],
  runtime: RuntimeAssets,
): Promise<Readonly<Record<string, unknown>>> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(argv, {
    cwd: runtime.context.repoRoot,
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  }, {
    prepareRuntimeAssets: async () => runtime,
  });
  expect(code).toBe(1);
  expect(stderr).toEqual([]);
  return JSON.parse(stdout.join('')) as Readonly<Record<string, unknown>>;
}

describe('render asset-store error responses', () => {
  it.each([
    ['direct render', ['render', '--selection', 'selection.json', '--out', 'out', '--json']],
    ['preset render', ['preset', 'render', 'farmer', '--out', 'preset-out', '--json']],
    ['character render', [
      'character', 'render', 'missing-image', '--out', 'character-out', '--json',
    ]],
  ])('preserves a missing image issue through %s', async (_label, argv) => {
    const runtime = await createMissingImageRuntime();
    const response = await runJson(argv, runtime);

    expect(response.errors).toEqual([
      {
        code: 'asset_image_missing',
        message: `ZIP asset entry is missing: ${logicalSpritePath}`,
        path: logicalSpritePath,
      },
    ]);
  });
});
