import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { SelectionJson } from '@lpc-toolkit/core';
import { describe, expect, it } from 'vitest';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { createRuntimeContext } from '../src/context.js';
import {
  renderCharacterPreview,
  type CharacterPreviewOptions,
} from '../src/preview.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function createFixture(items: Readonly<Record<string, { readonly name: string }>> = {
  body: { name: 'Body Color' },
}): Promise<CharacterPreviewOptions> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'lpc-preview-fixture-'));
  const assetsRoot = path.join(cwd, 'assets');
  writeJson(path.join(assetsRoot, 'sheet_definitions/body/body.json'), {
    name: 'Body Color',
    type_name: 'body',
    priority: 10,
    layer_1: { zPos: 10, male: 'body/bodies/male/' },
    animations: ['walk'],
    credits: [{
      file: 'body/bodies/male',
      authors: ['Fixture Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.com/lpc-fixture'],
    }],
  });
  mkdirSync(path.join(assetsRoot, 'palette_definitions'), { recursive: true });
  const spritePath = path.join(assetsRoot, 'spritesheets/body/bodies/male/walk.png');
  mkdirSync(path.dirname(spritePath), { recursive: true });
  const canvas = createCanvas(832, 3456);
  const context = canvas.getContext('2d');
  context.fillStyle = '#00ff00';
  context.fillRect(0, 10 * 64, 64, 64);
  writeFileSync(spritePath, await canvas.encode('png'));

  const selectionPath = path.join(cwd, 'saved', 'custom.selection.json');
  const selectionJson: SelectionJson = {
    schema: 'lpc-toolkit.selection.v1',
    name: 'hero',
    bodyType: 'male',
    items,
  };
  writeJson(selectionPath, selectionJson);
  const store = createDirectoryAssetStore(assetsRoot);
  const runtime: RuntimeAssets = {
    context: createRuntimeContext({ cwd, assetsRoot, spritesheetsBaseUrl: store.baseUrl }),
    store,
    source: 'working-directory',
  };
  return { runtime, cwd, selectionPath, selectionJson };
}

describe('renderCharacterPreview', () => {
  it('writes one down-facing walk frame and exact attribution', async () => {
    const options = await createFixture();
    const outDir = path.join(options.cwd, 'preview-output');
    const result = await renderCharacterPreview({ ...options, outDir });

    expect(result.artifacts.map((artifact) => artifact.type)).toEqual([
      'preview',
      'credits_txt',
      'credits_csv',
      'metadata',
    ]);
    expect(readFileSync(path.join(outDir, 'hero.credits.txt'), 'utf8'))
      .toContain('Fixture Artist');
    expect(readFileSync(path.join(outDir, 'hero.credits.csv'), 'utf8'))
      .toContain('GPL 3.0');
    expect(JSON.parse(readFileSync(path.join(outDir, 'hero.metadata.json'), 'utf8')))
      .toMatchObject({
        animation: 'walk',
        direction: 'down',
        frameIndex: 0,
        effectiveLicense: 'GPL 3.0',
        sourceSelectionPath: options.selectionPath,
        dimensions: { width: 64, height: 64 },
        credits: {
          txt: path.join(outDir, 'hero.credits.txt'),
          csv: path.join(outDir, 'hero.credits.csv'),
          entries: 1,
          resolvedPaths: ['body/bodies/male/walk.png'],
        },
      });
    const image = await loadImage(path.join(outDir, 'hero.preview.png'));
    expect({ width: image.width, height: image.height }).toEqual({ width: 64, height: 64 });
  }, 30000);

  it.each([
    [{ animation: 'idle' }, 'preview_animation_unavailable', 'idle'],
    [{ animation: 'walk', direction: 'sideways' }, 'preview_direction_unavailable', 'sideways'],
    [{ animation: 'walk', direction: 'down', frameIndex: 99 }, 'preview_frame_out_of_range', '99'],
  ] as const)('returns actionable preview error for %o', async (request, code, issuePath) => {
    const options = await createFixture();
    await expect(renderCharacterPreview({ ...options, ...request })).rejects.toMatchObject({
      code,
      path: issuePath,
      details: { available: expect.any(Array) },
    });
  }, 30000);

  it('does not publish a preview for an empty character', async () => {
    const options = await createFixture({});
    const outDir = path.join(options.cwd, 'missing-preview-output');

    await expect(renderCharacterPreview({ ...options, outDir })).rejects.toMatchObject({
      code: 'preview_incomplete_character',
    });
    expect(existsSync(outDir)).toBe(false);
  }, 30000);

  it('defaults an explicit selection beneath its directory using metadata name', async () => {
    const options = await createFixture();
    const result = await renderCharacterPreview(options);

    expect(result.outDir).toBe(path.join(path.dirname(options.selectionPath), 'previews', 'hero'));
    expect(existsSync(path.join(result.outDir, 'hero.preview.png'))).toBe(true);
  }, 30000);

  it('uses the canonical in-memory selection without rereading the source path', async () => {
    const options = await createFixture();
    writeFileSync(options.selectionPath, '{');

    const result = await renderCharacterPreview(options);

    expect(result.outDir).toBe(path.join(path.dirname(options.selectionPath), 'previews', 'hero'));
    expect(existsSync(path.join(result.outDir, 'hero.preview.png'))).toBe(true);
  }, 30000);

  it('defaults a named character beneath characters/previews', async () => {
    const options = await createFixture();
    const result = await renderCharacterPreview({ ...options, characterName: 'named-hero' });

    expect(result.outDir).toBe(path.join(options.cwd, 'characters', 'previews', 'named-hero'));
    expect(existsSync(path.join(result.outDir, 'named-hero.preview.png'))).toBe(true);
  }, 30000);

  it('falls back to the selection file stem when metadata name is empty', async () => {
    const options = await createFixture();

    const result = await renderCharacterPreview({
      ...options,
      selectionJson: { ...options.selectionJson, name: '' },
    });

    expect(result.outDir).toBe(
      path.join(path.dirname(options.selectionPath), 'previews', 'custom.selection'),
    );
    expect(existsSync(path.join(result.outDir, 'custom.selection.preview.png'))).toBe(true);
  }, 30000);

  it('falls back to the selection file stem when metadata name is not a string', async () => {
    const options = await createFixture();

    const result = await renderCharacterPreview({
      ...options,
      selectionJson: { ...options.selectionJson, name: 42 } as unknown as SelectionJson,
    });

    expect(result.outDir).toBe(
      path.join(path.dirname(options.selectionPath), 'previews', 'custom.selection'),
    );
  }, 30000);

  it.each(['..', ' !!! '])(
    'contains every explicit-selection artifact under the safe file-stem fallback for metadata %j',
    async (name) => {
      const options = await createFixture();

      const result = await renderCharacterPreview({
        ...options,
        selectionJson: { ...options.selectionJson, name },
      });
      const expectedOutDir = path.join(
        path.dirname(options.selectionPath),
        'previews',
        'custom.selection',
      );

      expect(result.outDir).toBe(expectedOutDir);
      expect(result.artifacts).toHaveLength(4);
      for (const artifact of result.artifacts) {
        expect(path.dirname(artifact.path)).toBe(expectedOutDir);
        expect(path.relative(expectedOutDir, artifact.path)).not.toMatch(/^\.\.(?:[/\\]|$)/u);
      }
    },
    30000,
  );
});
