import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { renderSelection } from '../src/render.js';
import type { AssetCacheLayout } from '../src/asset-cache.js';
import {
  createDirectoryAssetStore,
  createZipAssetStore,
} from '../src/asset-store.js';
import { createRuntimeContext } from '../src/context.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

const sheetDefinition = {
  name: 'Body Color',
  type_name: 'body',
  priority: 10,
  layer_1: {
    zPos: 10,
    male: 'body/bodies/male/',
  },
  animations: ['walk'],
  credits: [
    {
      file: 'body/bodies/male',
      authors: ['Fixture Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.com/lpc-fixture'],
    },
  ],
} as const;

const hairDefinition = {
  name: 'Fixture Hair',
  type_name: 'hair',
  priority: 20,
  layer_1: {
    zPos: 20,
    male: 'hair/fixture/male/',
  },
  animations: ['walk'],
  credits: [
    {
      file: 'hair/fixture/male',
      authors: ['Remaining Artist'],
      licenses: ['CC-BY 4.0'],
      urls: ['https://example.com/lpc-remaining-fixture'],
    },
  ],
} as const;

function listFiles(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath).map((file) => path.join(entry.name, file));
    return entry.name;
  });
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function createFixtureRepo(): Promise<string> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'lpc-render-fixture-'));
  writeJson(path.join(cwd, 'assets/sheet_definitions/body/body.json'), sheetDefinition);
  writeJson(path.join(cwd, 'assets/sheet_definitions/hair/hair.json'), hairDefinition);
  mkdirSync(path.join(cwd, 'assets/palette_definitions'), { recursive: true });

  const spritePath = path.join(cwd, 'assets/spritesheets/body/bodies/male/walk.png');
  mkdirSync(path.dirname(spritePath), { recursive: true });
  const canvas = createCanvas(832, 3456);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ff00ff';
  context.fillRect(0, 8 * 64, 64, 64);
  writeFileSync(spritePath, await canvas.encode('png'));

  const hairSpritePath = path.join(cwd, 'assets/spritesheets/hair/fixture/male/walk.png');
  mkdirSync(path.dirname(hairSpritePath), { recursive: true });
  writeFileSync(hairSpritePath, await canvas.encode('png'));

  return cwd;
}

function createRuntime(cwd: string): RuntimeAssets {
  const assetsRoot = path.join(cwd, 'assets');
  const store = createDirectoryAssetStore(assetsRoot);
  return {
    context: createRuntimeContext({
      cwd,
      assetsRoot,
      spritesheetsBaseUrl: store.baseUrl,
    }),
    store,
    source: 'working-directory',
  };
}

async function createManagedRuntime(missingBody = false): Promise<RuntimeAssets> {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'lpc-render-managed-'));
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
  writeJson(path.join(layout.sheetDefinitionsRoot, 'body/body.json'), sheetDefinition);
  writeJson(path.join(layout.sheetDefinitionsRoot, 'hair/hair.json'), hairDefinition);
  mkdirSync(layout.paletteDefinitionsRoot, { recursive: true });
  mkdirSync(layout.zipsRoot, { recursive: true });
  writeFileSync(
    layout.creditsPath,
    'file,authors,licenses\nbody/bodies/male,Fixture Artist,GPL 3.0\n',
  );
  writeFileSync(
    layout.spriteIndexPath,
    `${JSON.stringify([
      'spritesheets/body/bodies/male/walk.png',
      'spritesheets/hair/fixture/male/walk.png',
    ])}\n`,
  );

  const spriteCanvas = createCanvas(832, 4 * 64);
  const spriteContext = spriteCanvas.getContext('2d');
  spriteContext.fillStyle = '#00ff00';
  spriteContext.fillRect(0, 0, 64, 64);
  const zip = new JSZip();
  if (!missingBody) {
    zip.file('bodies/male/walk.png', await spriteCanvas.encode('png'));
  }
  writeFileSync(
    path.join(layout.zipsRoot, 'body.zip'),
    await zip.generateAsync({ type: 'nodebuffer' }),
  );
  const hairZip = new JSZip();
  hairZip.file('fixture/male/walk.png', await spriteCanvas.encode('png'));
  writeFileSync(
    path.join(layout.zipsRoot, 'hair.zip'),
    await hairZip.generateAsync({ type: 'nodebuffer' }),
  );

  const store = createZipAssetStore(layout);
  return {
    context: createRuntimeContext({
      cwd,
      assetsRoot: layout.releaseRoot,
      spritesheetsBaseUrl: store.baseUrl,
    }),
    store,
    source: 'managed-cache',
    releaseTag: 'assets-v1',
  };
}

const bodyOnlySelection = {
  schema: 'lpc-toolkit.selection.v1',
  name: 'body-only',
  bodyType: 'male',
  items: {
    body: { name: 'Body Color' },
  },
} as const;

const bodyAndHairSelection = {
  ...bodyOnlySelection,
  name: 'partial-character',
  items: {
    ...bodyOnlySelection.items,
    hair: { name: 'Fixture Hair' },
  },
} as const;

async function expectPartialMissingImageOutput(
  runtime: RuntimeAssets,
  outDir: string,
): Promise<void> {
  const result = await renderSelection({
    runtime,
    cwd: runtime.context.repoRoot,
    outDir,
    selectionName: 'partial-character',
    selectionJson: bodyAndHairSelection,
    animations: [],
    frames: [],
    bundleZip: false,
    allowPartial: true,
  });

  expect(existsSync(path.join(outDir, 'partial-character.sheet.png'))).toBe(true);
  expect(result.warnings).toEqual(expect.arrayContaining([
    expect.objectContaining({
      code: 'missing_sprite_path',
      path: 'spritesheets/body/bodies/male/walk.png',
    }),
  ]));
  expect(readFileSync(path.join(outDir, 'partial-character.credits.txt'), 'utf8'))
    .toContain('Remaining Artist');
  expect(readFileSync(path.join(outDir, 'partial-character.credits.txt'), 'utf8'))
    .not.toContain('Fixture Artist');
  expect(readFileSync(path.join(outDir, 'partial-character.credits.csv'), 'utf8'))
    .not.toContain('GPL 3.0');
  const metadata = JSON.parse(
    readFileSync(path.join(outDir, 'partial-character.metadata.json'), 'utf8'),
  ) as {
    readonly credits: {
      readonly resolvedPaths: readonly string[];
      readonly licenses: readonly string[];
      readonly entries: number;
    };
    readonly effectiveLicense: string;
    readonly skippedLayers: readonly { readonly code: string; readonly path?: string }[];
  };
  expect(metadata.credits.resolvedPaths).toContain('hair/fixture/male/walk.png');
  expect(metadata.credits.resolvedPaths).not.toContain('body/bodies/male/walk.png');
  expect(metadata.credits).toMatchObject({ entries: 1, licenses: ['CC-BY 4.0'] });
  expect(metadata.effectiveLicense).toBe('CC-BY 4.0');
  expect(metadata.skippedLayers).toEqual(expect.arrayContaining([
    expect.objectContaining({
      code: 'missing_sprite_path',
      path: 'spritesheets/body/bodies/male/walk.png',
    }),
  ]));
}

describe('renderSelection', () => {
  it('keeps default directory rendering for a body-only selection', async () => {
    const cwd = await createFixtureRepo();
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'lpc-render-'));
    const runtime = createRuntime(cwd);
    const result = await renderSelection({
      runtime,
      cwd,
      outDir,
      selectionName: 'body-only',
      selectionJson: bodyOnlySelection,
      animations: ['walk'],
      frames: [],
      bundleZip: false,
      allowPartial: false,
    });

    expect(result.artifacts.map((artifact) => artifact.type)).toContain('sheet');
    expect(existsSync(path.join(outDir, 'body-only.sheet.png'))).toBe(true);
    expect(existsSync(path.join(outDir, 'body-only.metadata.json'))).toBe(true);
    expect(existsSync(path.join(outDir, 'body-only.credits.txt'))).toBe(true);
    expect(existsSync(path.join(outDir, 'body-only.credits.csv'))).toBe(true);
    const metadata = JSON.parse(
      readFileSync(path.join(outDir, 'body-only.metadata.json'), 'utf8'),
    ) as {
      readonly selection: { readonly name: string };
      readonly source: Readonly<Record<string, unknown>>;
    };
    expect(metadata.selection.name).toBe('body-only');
    expect(metadata.source).toEqual({
      runtimeSource: 'working-directory',
      description: runtime.store.description,
      releaseTag: null,
      baseDefinitionsRoot: runtime.context.sheetDefinitionsRoot,
      customOverlayRoot: runtime.context.customAssetsRoot,
      spritesheetsBaseUrl: runtime.store.baseUrl,
    });
  }, 30000);

  it('renders and attributes a managed ZIP runtime through core composition', async () => {
    const runtime = await createManagedRuntime();
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'lpc-render-zip-'));

    await renderSelection({
      runtime,
      cwd: runtime.context.repoRoot,
      outDir,
      selectionName: 'managed-body',
      selectionJson: bodyOnlySelection,
      animations: [],
      frames: [],
      bundleZip: false,
      allowPartial: false,
    });

    const sheetPath = path.join(outDir, 'managed-body.sheet.png');
    const sheetImage = await loadImage(sheetPath);
    const pixelCanvas = createCanvas(sheetImage.width, sheetImage.height);
    const pixelContext = pixelCanvas.getContext('2d');
    pixelContext.drawImage(sheetImage, 0, 0);
    expect(pixelContext.getImageData(0, 8 * 64, 1, 1).data[3]).toBeGreaterThan(0);

    expect(readFileSync(path.join(outDir, 'managed-body.credits.txt'), 'utf8')).toContain(
      'Fixture Artist',
    );
    expect(readFileSync(path.join(outDir, 'managed-body.credits.csv'), 'utf8')).toContain(
      'GPL 3.0',
    );
    const metadata = JSON.parse(
      readFileSync(path.join(outDir, 'managed-body.metadata.json'), 'utf8'),
    ) as {
      readonly effectiveLicense: string;
      readonly credits: {
        readonly entries: number;
        readonly licenses: readonly string[];
      };
      readonly source: Readonly<Record<string, unknown>>;
    };
    expect(metadata.effectiveLicense).toBe('GPL 3.0');
    expect(metadata.credits).toMatchObject({ entries: 1, licenses: ['GPL 3.0'] });
    expect(metadata.source).toEqual({
      runtimeSource: 'managed-cache',
      description: runtime.store.description,
      releaseTag: 'assets-v1',
      baseDefinitionsRoot: runtime.context.sheetDefinitionsRoot,
      customOverlayRoot: runtime.context.customAssetsRoot,
      spritesheetsBaseUrl: 'lpc-zip:',
    });
  }, 30000);

  it('does not leave artifacts when a requested animation is invalid', async () => {
    const cwd = await createFixtureRepo();
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'lpc-render-'));

    await expect(
      renderSelection({
        runtime: createRuntime(cwd),
        cwd,
        outDir,
        selectionName: 'body-only',
        selectionJson: bodyOnlySelection,
        animations: ['not-real'],
        frames: [],
        bundleZip: false,
        allowPartial: false,
      }),
    ).rejects.toThrow(/not-real/);

    expect(listFiles(outDir)).toEqual([]);
  }, 30000);

  it('does not leave artifacts when a requested frame animation is invalid', async () => {
    const cwd = await createFixtureRepo();
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'lpc-render-'));

    await expect(
      renderSelection({
        runtime: createRuntime(cwd),
        cwd,
        outDir,
        selectionName: 'body-only',
        selectionJson: bodyOnlySelection,
        animations: [],
        frames: ['not-real'],
        bundleZip: false,
        allowPartial: false,
      }),
    ).rejects.toThrow(/not-real/);

    expect(listFiles(outDir)).toEqual([]);
  }, 30000);

  it('does not leave partial artifacts when an output path collides with a file', async () => {
    const cwd = await createFixtureRepo();
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'lpc-render-'));
    writeFileSync(path.join(outDir, 'animations'), 'not a directory');

    await expect(
      renderSelection({
        runtime: createRuntime(cwd),
        cwd,
        outDir,
        selectionName: 'body-only',
        selectionJson: bodyOnlySelection,
        animations: ['walk'],
        frames: [],
        bundleZip: false,
        allowPartial: false,
      }),
    ).rejects.toThrow(/animations/);

    expect(listFiles(outDir)).toEqual(['animations']);
    expect(readFileSync(path.join(outDir, 'animations'), 'utf8')).toBe('not a directory');
  }, 30000);

  it('reports skipped validation errors as warnings when partial render is allowed', async () => {
    const cwd = await createFixtureRepo();
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'lpc-render-'));
    const result = await renderSelection({
      runtime: createRuntime(cwd),
      cwd,
      outDir,
      selectionName: 'body-only',
      selectionJson: {
        ...bodyOnlySelection,
        items: {
          ...bodyOnlySelection.items,
          missing_type: { name: 'Missing Item' },
        },
      },
      animations: [],
      frames: [],
      bundleZip: false,
      allowPartial: true,
    });

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unknown_type_name',
          path: 'missing_type',
        }),
      ]),
    );
    const metadata = JSON.parse(
      readFileSync(path.join(outDir, 'body-only.metadata.json'), 'utf8'),
    ) as {
      readonly warnings: readonly { readonly code: string; readonly path?: string }[];
      readonly skippedLayers: readonly { readonly code: string; readonly path?: string }[];
    };
    expect(metadata.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unknown_type_name',
          path: 'missing_type',
        }),
      ]),
    );
    expect(metadata.skippedLayers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unknown_type_name',
          path: 'missing_type',
        }),
      ]),
    );
  }, 30000);

  it('keeps attributed directory output when a selected image is missing in partial mode', async () => {
    const cwd = await createFixtureRepo();
    rmSync(path.join(cwd, 'assets/spritesheets/body/bodies/male/walk.png'));

    await expectPartialMissingImageOutput(
      createRuntime(cwd),
      mkdtempSync(path.join(os.tmpdir(), 'lpc-render-partial-directory-')),
    );
  }, 30000);

  it('keeps attributed ZIP output when an indexed selected image is missing in partial mode', async () => {
    const runtime = await createManagedRuntime(true);

    await expectPartialMissingImageOutput(
      runtime,
      mkdtempSync(path.join(os.tmpdir(), 'lpc-render-partial-zip-')),
    );
  }, 30000);

  it('keeps direct partial render compatibility when every selected image is missing', async () => {
    const cwd = await createFixtureRepo();
    rmSync(path.join(cwd, 'assets/spritesheets/body/bodies/male/walk.png'));
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'lpc-render-all-missing-direct-'));

    await renderSelection({
      runtime: createRuntime(cwd),
      cwd,
      outDir,
      selectionName: 'body-only',
      selectionJson: bodyOnlySelection,
      animations: [],
      frames: [],
      bundleZip: false,
      allowPartial: true,
    });

    expect(existsSync(path.join(outDir, 'body-only.sheet.png'))).toBe(true);
    const metadata = JSON.parse(
      readFileSync(path.join(outDir, 'body-only.metadata.json'), 'utf8'),
    ) as {
      readonly effectiveLicense: string | null;
      readonly credits: { readonly entries: number; readonly resolvedPaths: readonly string[] };
    };
    expect(metadata.effectiveLicense).toBeNull();
    expect(metadata.credits).toMatchObject({ entries: 0, resolvedPaths: [] });
  }, 30000);
});
