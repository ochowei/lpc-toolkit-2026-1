import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import {
  ASSET_PACK_SCHEMA,
  standardAnimationGeometry,
  type AnimationName,
  type AssetPackSource,
  type ItemDefinition,
  type SelectionJson,
} from '@lpc-toolkit/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  previewAssetPack,
  previewValidationDirectoryName,
} from '../src/asset-pack-preview.js';
import { syncLinkedAssetPack } from '../src/asset-pack-sync.js';
import { loadActiveAssetPackBaseline } from '../src/asset-pack-validation.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import {
  initializeAssetWorkspace,
  type AssetWorkspace,
} from '../src/asset-workspace.js';
import { createRuntimeContext } from '../src/context.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

const temporaryDirectories: string[] = [];

const PACK_CREDITS = {
  authors: ['Pack Artist'],
  licenses: ['CC-BY-SA 4.0'],
  urls: ['https://example.com/pack-artist'],
  notes: 'Artist pack contribution.',
} as const;

const BASE_HAIR_CREDIT = {
  file: 'hair/braid',
  authors: ['Base Hair Artist'],
  licenses: ['GPL 3.0'],
  urls: ['https://example.com/base-hair'],
  notes: 'Original braid.',
} as const;

interface PreviewFixture {
  readonly cwd: string;
  readonly assetsRoot: string;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
}

function createDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function geometryBounds(animation: AnimationName): { readonly width: number; readonly height: number } {
  const geometry = standardAnimationGeometry(animation);
  const maxColumn = Math.max(
    ...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)),
  );
  return {
    width: (maxColumn + 1) * geometry.frameSize,
    height: geometry.rows.length * geometry.frameSize,
  };
}

function writeSheetPng(filePath: string, animation: AnimationName, color: string): void {
  const bounds = geometryBounds(animation);
  const canvas = createCanvas(bounds.width, bounds.height);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, bounds.width, bounds.height);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, canvas.toBuffer('image/png'));
}

function writeBaseDefinition(
  assetsRoot: string,
  relativePath: string,
  definition: ItemDefinition,
  colors: Readonly<Record<AnimationName, string>>,
): void {
  writeJson(path.join(assetsRoot, 'sheet_definitions', relativePath), definition);
  const basePath = definition.layer_1?.male;
  if (typeof basePath !== 'string') throw new Error('Fixture definition needs a male layer path.');
  for (const [animation, color] of Object.entries(colors) as [AnimationName, string][]) {
    writeSheetPng(
      path.join(assetsRoot, 'spritesheets', basePath, `${animation}.png`),
      animation,
      color,
    );
  }
}

function createPreviewFixture(): PreviewFixture {
  const cwd = createDirectory('lpc-asset-pack-preview-');
  const assetsRoot = path.join(cwd, 'assets');

  writeBaseDefinition(assetsRoot, 'body/body.json', {
    name: 'Body Color',
    type_name: 'body',
    animations: ['walk', 'climb'],
    credits: [{
      file: 'body/base',
      authors: ['Body Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.com/body'],
      notes: '',
    }],
    recolors: { material: 'skin', palettes: ['ulpc'] },
    layer_1: { zPos: 10, male: 'body/base/', female: 'body/base/' },
  }, { walk: '#775533', climb: '#775533' });
  writeBaseDefinition(assetsRoot, 'hair/braid.json', {
    name: 'Braid',
    type_name: 'hair',
    animations: ['walk'],
    credits: [BASE_HAIR_CREDIT],
    layer_1: { zPos: 50, male: 'hair/braid/', female: 'hair/braid/' },
  }, { walk: '#553311' });
  writeBaseDefinition(assetsRoot, 'hat/cap.json', {
    name: 'Cap',
    type_name: 'hat',
    animations: ['walk', 'climb'],
    credits: [{
      file: 'hat/cap',
      authors: ['Hat Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.com/hat'],
      notes: '',
    }],
    layer_1: { zPos: 200, male: 'hat/cap/', female: 'hat/cap/' },
  }, { walk: '#222222', climb: '#222222' });
  writeJson(path.join(assetsRoot, 'palette_definitions/skin/meta_skin.json'), {
    type: 'material',
    default: 'ulpc',
    base: 'light',
  });
  writeJson(path.join(assetsRoot, 'palette_definitions/skin/skin_ulpc.json'), {
    light: ['#775533'],
  });
  writeFileSync(
    path.join(assetsRoot, 'CREDITS.csv'),
    'filename,notes,authors,licenses,urls\n',
  );

  const workspace = initializeAssetWorkspace(cwd);
  const store = createDirectoryAssetStore(assetsRoot);
  const runtime: RuntimeAssets = {
    context: createRuntimeContext({
      cwd,
      assetsRoot,
      customAssetsRoot: workspace.outputRoot,
      spritesheetsBaseUrl: store.baseUrl,
    }),
    store,
    source: 'working-directory',
  };
  return { cwd, assetsRoot, workspace, runtime };
}

function newItem(
  localId: string,
  options: {
    readonly animations?: readonly AnimationName[];
    readonly bodyTypes?: readonly ('male' | 'female')[];
  } = {},
): AssetPackSource['assets'][number] {
  const animations = options.animations ?? ['walk'];
  const bodyTypes = options.bodyTypes ?? ['male'];
  return {
    kind: 'new-item',
    localId,
    displayName: localId,
    typeName: 'hair',
    bodyTypes,
    animations,
    layers: [{
      id: 'foreground',
      zPos: 120,
      sprites: animations.flatMap((animation) => bodyTypes.map((bodyType) => ({
        animation,
        bodyTypes: [bodyType],
        source: `sprites/${localId}/${bodyType}/${animation}.png`,
      }))),
    }],
  };
}

function writeNewItemPack(options: {
  readonly root: string;
  readonly version?: string;
  readonly assets: readonly ReturnType<typeof newItem>[];
  readonly colors?: Readonly<Record<string, string>>;
}): void {
  const manifest: AssetPackSource = {
    schema: ASSET_PACK_SCHEMA,
    id: 'acme.preview-hair',
    version: options.version ?? '1.0.0',
    displayName: 'Preview Hair',
    credits: PACK_CREDITS,
    assets: options.assets,
  };
  writeJson(path.join(options.root, 'asset-pack.json'), manifest);
  for (const asset of options.assets) {
    if (asset.kind !== 'new-item') continue;
    for (const layer of asset.layers) {
      for (const sprite of layer.sprites) {
        const bodyType = sprite.bodyTypes?.[0] ?? asset.bodyTypes[0] ?? 'male';
        const color = options.colors?.[`${asset.localId}:${bodyType}:${sprite.animation}`]
          ?? '#cc5500';
        writeSheetPng(path.join(options.root, sprite.source), sprite.animation, color);
      }
    }
  }
}

function snapshotTree(root: string): Readonly<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  if (!existsSync(root)) return snapshot;
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else {
        snapshot[path.relative(root, absolutePath).split(path.sep).join('/')] =
          readFileSync(absolutePath).toString('base64');
      }
    }
  };
  visit(root);
  return snapshot;
}

function validationEntries(workspace: AssetWorkspace): readonly string[] {
  return readdirSync(path.join(workspace.stateRoot, 'validation'));
}

async function pixelAt(filePath: string): Promise<readonly [number, number, number, number]> {
  const image = await loadImage(filePath);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const pixel = context.getImageData(0, 0, 1, 1).data;
  return [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0, pixel[3] ?? 0];
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('previewAssetPack', () => {
  it('uses a Windows-safe validation directory component', () => {
    const hex = 'a'.repeat(64);

    expect(previewValidationDirectoryName(`sha256:${hex}`)).toBe(`sha256-${hex}`);
    expect(previewValidationDirectoryName(`sha256:${hex}`)).not.toMatch(/[<>:"/\\|?*]/u);
  });

  it('freshly compiles the stable first local asset over linked state and publishes a default attributed preview', async () => {
    const fixture = createPreviewFixture();
    const packRoot = path.join(fixture.workspace.packsRoot, 'acme.preview-hair');
    writeNewItemPack({
      root: packRoot,
      assets: [newItem('zulu'), newItem('alpha')],
    });
    const synced = await syncLinkedAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    });
    expect(synced.ok).toBe(true);

    writeNewItemPack({
      root: packRoot,
      version: '1.1.0',
      assets: [newItem('zulu'), newItem('alpha')],
      colors: { 'alpha:male:walk': '#00aa44' },
    });
    const outputBefore = snapshotTree(fixture.workspace.outputRoot);
    const registryBefore = readFileSync(fixture.workspace.registryPath);

    const result = await previewAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    });

    expect(result.assetId).toBe('alpha');
    expect(result.packId).toBe('acme.preview-hair');
    expect(result.artifacts.map((artifact) => artifact.type)).toEqual([
      'preview',
      'credits_txt',
      'credits_csv',
      'metadata',
    ]);
    const outDir = path.join(packRoot, 'previews', 'alpha');
    expect(result.outDir).toBe(outDir);
    expect(result.artifacts.every((artifact) => path.dirname(artifact.path) === outDir)).toBe(true);
    const creditsTxt = readFileSync(path.join(outDir, 'alpha.credits.txt'), 'utf8');
    expect(creditsTxt).toContain('Body Artist');
    expect(creditsTxt).toContain('Pack Artist');
    expect(readFileSync(path.join(outDir, 'alpha.credits.csv'), 'utf8')).toContain('Pack Artist');
    expect(JSON.parse(readFileSync(path.join(outDir, 'alpha.metadata.json'), 'utf8'))).toMatchObject({
      animation: 'walk',
      credits: {
        resolvedPaths: expect.arrayContaining([
          'packages/acme.preview-hair/alpha/foreground/male/walk.png',
        ]),
      },
    });
    expect(await pixelAt(path.join(outDir, 'alpha.preview.png'))).toEqual([0, 170, 68, 255]);
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(outputBefore);
    expect(readFileSync(fixture.workspace.registryPath)).toEqual(registryBefore);
    expect(validationEntries(fixture.workspace)).toEqual([]);
  }, 30000);

  it('keeps supplied slots except the target type and honors requested asset, body, and animation', async () => {
    const fixture = createPreviewFixture();
    const packRoot = path.join(fixture.workspace.packsRoot, 'acme.preview-hair');
    writeNewItemPack({
      root: packRoot,
      assets: [
        newItem('alpha'),
        newItem('beta', { animations: ['walk', 'climb'], bodyTypes: ['male', 'female'] }),
      ],
      colors: { 'beta:female:climb': '#3355aa' },
    });
    const characterPath = path.join(fixture.cwd, 'selection.json');
    const selection: SelectionJson = {
      schema: 'lpc-toolkit.selection.v1',
      name: 'layer-test',
      bodyType: 'male',
      items: {
        body: { name: 'Body Color', recolor: 'light' },
        hair: { name: 'Braid' },
        hat: { name: 'Cap' },
      },
    };
    writeJson(characterPath, selection);
    const outputBefore = snapshotTree(fixture.workspace.outputRoot);
    const registryBefore = existsSync(fixture.workspace.registryPath)
      ? readFileSync(fixture.workspace.registryPath)
      : undefined;

    const result = await previewAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      assetId: 'beta',
      animation: 'climb',
      bodyType: 'female',
      characterPath,
    });

    const credits = readFileSync(path.join(result.outDir, 'layer-test.credits.txt'), 'utf8');
    expect(credits).toContain('Body Artist');
    expect(credits).toContain('Hat Artist');
    expect(credits).toContain('Pack Artist');
    expect(credits).not.toContain('Base Hair Artist');
    expect(JSON.parse(readFileSync(result.metadataPath, 'utf8'))).toMatchObject({
      sourceSelectionPath: characterPath,
      animation: 'climb',
      credits: {
        resolvedPaths: expect.arrayContaining([
          'packages/acme.preview-hair/beta/foreground/female/climb.png',
        ]),
      },
    });
    expect(await pixelAt(path.join(result.outDir, 'layer-test.preview.png'))).toEqual([
      34,
      34,
      34,
      255,
    ]);
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(outputBefore);
    expect(existsSync(fixture.workspace.registryPath)).toBe(registryBefore !== undefined);
    if (registryBefore) expect(readFileSync(fixture.workspace.registryPath)).toEqual(registryBefore);
    expect(validationEntries(fixture.workspace)).toEqual([]);
  }, 30000);

  it('includes inherited base attribution for an existing-item extension', async () => {
    const fixture = createPreviewFixture();
    const baseline = loadActiveAssetPackBaseline({
      runtime: fixture.runtime,
      workspace: fixture.workspace,
    });
    const packRoot = path.join(fixture.workspace.packsRoot, 'acme.preview-extension');
    const manifest: AssetPackSource = {
      schema: ASSET_PACK_SCHEMA,
      id: 'acme.preview-extension',
      version: '1.0.0',
      displayName: 'Preview Extension',
      credits: PACK_CREDITS,
      assets: [{
        kind: 'extend-item',
        itemId: 'braid',
        baseDefinitionDigest: baseline.definitionDigests.get('braid')!,
        baseCreditDigest: baseline.creditDigests.get('braid')!,
        addAnimations: [{
          animation: 'climb',
          layers: [{
            layer: 'layer_1',
            bodyTypes: ['male', 'female'],
            source: 'sprites/braid/climb.png',
            destination: {
              path: 'spritesheets/hair/braid/climb.png',
              evidence: 'artist-specified',
              accepted: true,
            },
          }],
        }],
      }],
    };
    writeJson(path.join(packRoot, 'asset-pack.json'), manifest);
    writeSheetPng(path.join(packRoot, 'sprites/braid/climb.png'), 'climb', '#aa3377');

    const result = await previewAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      animation: 'climb',
    });

    const txt = readFileSync(path.join(result.outDir, 'braid.credits.txt'), 'utf8');
    const csv = readFileSync(path.join(result.outDir, 'braid.credits.csv'), 'utf8');
    for (const attribution of [
      'Base Hair Artist',
      'https://example.com/base-hair',
      'Original braid.',
      'Pack Artist',
      'https://example.com/pack-artist',
      'Artist pack contribution.',
    ]) {
      expect(txt).toContain(attribution);
      expect(csv).toContain(attribution);
    }
    expect(JSON.parse(readFileSync(result.metadataPath, 'utf8'))).toMatchObject({
      credits: {
        creditEntries: expect.arrayContaining([
          expect.objectContaining({
            authors: BASE_HAIR_CREDIT.authors,
            urls: BASE_HAIR_CREDIT.urls,
            notes: BASE_HAIR_CREDIT.notes,
          }),
          expect.objectContaining({
            authors: PACK_CREDITS.authors,
            urls: PACK_CREDITS.urls,
            notes: PACK_CREDITS.notes,
          }),
        ]),
        resolvedPaths: expect.arrayContaining(['hair/braid/climb.png']),
      },
    });
    expect(validationEntries(fixture.workspace)).toEqual([]);
  }, 30000);

  it.each(['missing', 'invalid'] as const)(
    'previews a valid same-ID replacement without validating the %s old source',
    async (oldSourceState) => {
      const fixture = createPreviewFixture();
      const oldRoot = path.join(fixture.workspace.packsRoot, 'old-preview-hair');
      const newRoot = path.join(fixture.workspace.packsRoot, 'new-preview-hair');
      writeNewItemPack({ root: oldRoot, assets: [newItem('old-braid')] });
      writeNewItemPack({ root: newRoot, version: '1.1.0', assets: [newItem('new-braid')] });

      const synced = await syncLinkedAssetPack({
        packDirectory: oldRoot,
        workspace: fixture.workspace,
        runtime: fixture.runtime,
      });
      expect(synced.ok).toBe(true);
      const outputBefore = snapshotTree(fixture.workspace.outputRoot);
      const registryBefore = readFileSync(fixture.workspace.registryPath);
      if (oldSourceState === 'missing') {
        rmSync(oldRoot, { recursive: true, force: true });
      } else {
        writeFileSync(path.join(oldRoot, 'asset-pack.json'), '{');
      }

      const result = await previewAssetPack({
        packDirectory: newRoot,
        workspace: fixture.workspace,
        runtime: fixture.runtime,
      });

      expect(result.assetId).toBe('new-braid');
      expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(outputBefore);
      expect(readFileSync(fixture.workspace.registryPath)).toEqual(registryBefore);
      expect(validationEntries(fixture.workspace)).toEqual([]);
    },
    30000,
  );

  it('validates the current source again before previewing', async () => {
    const fixture = createPreviewFixture();
    const packRoot = path.join(fixture.workspace.packsRoot, 'acme.preview-hair');
    writeNewItemPack({ root: packRoot, assets: [newItem('alpha')] });
    const sourcePath = path.join(packRoot, 'sprites/alpha/male/walk.png');
    const bounds = geometryBounds('walk');
    writeFileSync(sourcePath, createCanvas(bounds.width, bounds.height).toBuffer('image/png'));

    await expect(previewAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    })).rejects.toMatchObject({ code: 'asset_required_frame_blank' });
    expect(validationEntries(fixture.workspace)).toEqual([]);
  }, 30000);

  it.each([
    [{ bodyType: 'female' }, 'selection_output_invalid'],
    [{ animation: 'climb' }, 'preview_animation_unavailable'],
  ] as const)('reports incompatible preview options and cleans temporary state for %o', async (
    request,
    code,
  ) => {
    const fixture = createPreviewFixture();
    const packRoot = path.join(fixture.workspace.packsRoot, 'acme.preview-hair');
    writeNewItemPack({ root: packRoot, assets: [newItem('alpha')] });
    const synced = await syncLinkedAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    });
    expect(synced.ok).toBe(true);
    const outputBefore = snapshotTree(fixture.workspace.outputRoot);
    const registryBefore = readFileSync(fixture.workspace.registryPath);

    await expect(previewAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      ...request,
    })).rejects.toMatchObject({ code });
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(outputBefore);
    expect(readFileSync(fixture.workspace.registryPath)).toEqual(registryBefore);
    expect(validationEntries(fixture.workspace)).toEqual([]);
  }, 30000);
});
