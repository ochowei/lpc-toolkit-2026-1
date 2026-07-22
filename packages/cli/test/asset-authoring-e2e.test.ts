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
import { createCanvas } from '@napi-rs/canvas';
import {
  planAssetAnimationAudit,
  standardAnimationGeometry,
  type AnimationName,
  type AssetPackSource,
  type ItemDefinition,
  type SelectionJson,
} from '@lpc-toolkit/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  inspectAssetAnimationPlan,
  type AssetAnimationAuditReport,
} from '../src/animation-audit.js';
import type { AssetPackPreviewResult } from '../src/asset-pack-preview.js';
import type { AssetPackSyncSuccess } from '../src/asset-pack-sync.js';
import type { AssetPackValidationReport } from '../src/asset-pack-validation.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import type { AssetWorkspace } from '../src/asset-workspace.js';
import { createRuntimeContext } from '../src/context.js';
import { loadCatalogFromRoots, loadPalettesFromRoot } from '../src/loaders.js';
import { runCli } from '../src/main.js';
import { createNodeCanvasAdapter } from '../src/node-canvas-adapter.js';
import type { CliResponse } from '../src/response.js';
import {
  createOverlayRuntimeAssets,
  type PrepareRuntimeAssetsOptions,
  type RuntimeAssets,
} from '../src/runtime-assets.js';

const temporaryDirectories: string[] = [];

interface CommandResult<T> {
  readonly code: number;
  readonly response: CliResponse<T>;
  readonly stderr: string;
}

interface RegistryDocument {
  readonly entries: readonly {
    readonly packId: string;
    readonly generatedPaths: readonly string[];
  }[];
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

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function geometryBounds(animation: AnimationName): {
  readonly width: number;
  readonly height: number;
} {
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
  animations: Readonly<Record<string, string>>,
): void {
  writeJson(path.join(assetsRoot, 'sheet_definitions', relativePath), definition);
  const spriteRoot = definition.layer_1?.male;
  if (typeof spriteRoot !== 'string') throw new Error('Fixture requires a male layer path.');
  for (const [animation, color] of Object.entries(animations)) {
    writeSheetPng(
      path.join(assetsRoot, 'spritesheets', spriteRoot, `${animation}.png`),
      animation as AnimationName,
      color,
    );
  }
}

function createPreparedRuntime(root: string, workspaceRoot: string): RuntimeAssets {
  const assetsRoot = path.join(root, 'assets');
  writeBaseDefinition(assetsRoot, 'body/body.json', {
    name: 'Body Color',
    type_name: 'body',
    animations: ['walk', 'climb'],
    credits: [{
      file: 'body/base',
      authors: ['Base Body Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.test/base-body'],
      notes: '',
    }],
    recolors: { material: 'skin', palettes: ['ulpc'] },
    layer_1: { zPos: 10, male: 'body/base/', female: 'body/base/' },
  }, { walk: '#775533', climb: '#775533' });
  writeBaseDefinition(assetsRoot, 'hair/hair_messy.json', {
    name: 'Messy',
    type_name: 'hair',
    animations: ['walk', 'climb'],
    credits: [{
      file: 'hair/messy',
      authors: ['Base Hair Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.test/base-hair'],
      notes: 'Original messy hair.',
    }],
    layer_1: { zPos: 50, male: 'hair/messy/', female: 'hair/messy/' },
  }, { walk: '#553311' });
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

function sourceAnimations(pack: AssetPackSource): readonly {
  readonly source: string;
  readonly animation: AnimationName;
}[] {
  return pack.assets.flatMap((asset) => asset.kind === 'new-item'
    ? asset.layers.flatMap((layer) => layer.sprites.map((sprite) => ({
      source: sprite.source,
      animation: sprite.animation,
    })))
    : asset.addAnimations.flatMap((animation) => animation.layers.map((layer) => ({
      source: layer.source,
      animation: animation.animation,
    }))));
}

async function runJson<T>(
  argv: readonly string[],
  cwd: string,
  prepareRuntimeAssets: (options: PrepareRuntimeAssetsOptions) => Promise<RuntimeAssets>,
): Promise<CommandResult<T>> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli([...argv, '--json'], {
    cwd,
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  }, { prepareRuntimeAssets });
  return {
    code,
    response: JSON.parse(stdout.join('')) as CliResponse<T>,
    stderr: stderr.join(''),
  };
}

function expectSuccessfulData<T>(result: CommandResult<T>): T {
  expect(result.code, result.stderr).toBe(0);
  expect(result.response.ok).toBe(true);
  expect(result.response.errors).toEqual([]);
  if (result.response.data === null) throw new Error('Expected successful command data.');
  return result.response.data;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('public CLI no-repository artist workflow', () => {
  it('scaffolds, validates, previews, syncs, audits, and renders attributed packs inside one workspace', async () => {
    const consumerRoot = createDirectory('lpc-asset-authoring-e2e-');
    const workspaceRoot = path.join(consumerRoot, 'artist-workspace');
    const preparedRoot = path.join(consumerRoot, 'prepared-runtime');
    const runtime = createPreparedRuntime(preparedRoot, workspaceRoot);
    const preparedBefore = snapshotTree(preparedRoot);

    const forbiddenPrepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => {
      throw new Error('workspace init reached runtime preparation');
    });
    const initialized = await runJson<AssetWorkspace>([
      'asset', 'workspace', 'init', './artist-workspace',
    ], consumerRoot, forbiddenPrepare);
    const workspace = expectSuccessfulData(initialized);
    expect(forbiddenPrepare).not.toHaveBeenCalled();
    expect(workspace.root).toBe(workspaceRoot);
    expect(existsSync(path.join(workspaceRoot, '.git'))).toBe(false);
    expect(existsSync(path.join(workspaceRoot, 'assets'))).toBe(false);

    const prepare = vi.fn(async (options: PrepareRuntimeAssetsOptions) => {
      expect(options).toMatchObject({ cwd: workspaceRoot, managedCacheOnly: true });
      return runtime;
    });
    const newPackResult = await runJson<{ readonly packRoot: string; readonly manifestPath: string }>([
      'asset', 'init', '--new',
      '--pack-id', 'acme.fantasy-hair',
      '--asset-id', 'moon-braid',
      '--display-name', 'Moon Braid',
      '--type', 'hair',
      '--body-type', 'male',
      '--body-type', 'female',
      '--animation', 'walk',
      '--animation', 'climb',
      '--author', 'New Hair Artist',
      '--license', 'CC-BY-SA 4.0',
      '--url', 'https://example.test/acme/fantasy-hair',
    ], workspaceRoot, prepare);
    const newPack = expectSuccessfulData(newPackResult);

    const auditPath = path.join(workspaceRoot, 'hair-messy-climb-audit.json');
    const auditReport: CliResponse<AssetAnimationAuditReport> = {
      ok: true,
      command: 'catalog audit-animations',
      data: {
        targets: ['climb'],
        scope: { typeName: 'hair', bodyType: 'male' },
        summary: {
          itemsScanned: 1,
          incompleteItems: 1,
          unsupported: 0,
          missingFiles: 1,
          blankFrames: 0,
          errors: 0,
        },
        unsupported: [],
        missingFiles: [{
          path: 'spritesheets/hair/messy/climb.png',
          animation: 'climb',
          sourceAnimation: 'climb',
          consumers: [{
            itemId: 'hair_messy',
            typeName: 'hair',
            layer: 'layer_1',
            bodyTypes: ['male', 'female'],
            recolors: [],
          }],
        }],
        blankFrames: [],
        errors: [],
      },
      warnings: [],
      errors: [],
    };
    writeJson(auditPath, auditReport);
    const extensionPackResult = await runJson<{
      readonly packRoot: string;
      readonly manifestPath: string;
    }>([
      'asset', 'init', '--from-audit', auditPath,
      '--item', 'hair_messy',
      '--animation', 'climb',
      '--pack-id', 'acme.messy-climb',
      '--display-name', 'Messy Hair Climb',
      '--author', 'Extension Artist',
      '--license', 'CC-BY-SA 4.0',
      '--url', 'https://example.test/acme/messy-climb',
    ], workspaceRoot, prepare);
    const extensionPack = expectSuccessfulData(extensionPackResult);

    const newManifest = readJson<AssetPackSource>(newPack.manifestPath);
    for (const [index, sprite] of sourceAnimations(newManifest).entries()) {
      writeSheetPng(
        path.join(newPack.packRoot, sprite.source),
        sprite.animation,
        index === 0 ? '#9955cc' : '#aa66dd',
      );
    }
    const extensionManifest = readJson<AssetPackSource>(extensionPack.manifestPath);
    for (const sprite of sourceAnimations(extensionManifest)) {
      writeSheetPng(path.join(extensionPack.packRoot, sprite.source), sprite.animation, '#2277aa');
    }

    const newValidation = expectSuccessfulData(await runJson<AssetPackValidationReport>([
      'asset', 'validate', newPack.packRoot,
    ], workspaceRoot, prepare));
    const extensionValidation = expectSuccessfulData(await runJson<AssetPackValidationReport>([
      'asset', 'validate', extensionPack.packRoot,
    ], workspaceRoot, prepare));
    expect(newValidation.valid).toBe(true);
    expect(extensionValidation.valid).toBe(true);

    const defaultPreview = expectSuccessfulData(await runJson<AssetPackPreviewResult>([
      'asset', 'preview', newPack.packRoot, '--asset', 'moon-braid',
    ], workspaceRoot, prepare));
    expect(defaultPreview.outDir).toBe(
      path.join(newPack.packRoot, 'previews', 'moon-braid'),
    );
    expect(defaultPreview.artifacts.every(({ path: artifactPath }) =>
      artifactPath.startsWith(`${defaultPreview.outDir}${path.sep}`))).toBe(true);
    expect(readFileSync(
      path.join(defaultPreview.outDir, 'moon-braid.credits.txt'),
      'utf8',
    )).toContain('New Hair Artist');

    const characterPath = path.join(workspaceRoot, 'artist-character.json');
    const character: SelectionJson = {
      schema: 'lpc-toolkit.selection.v1',
      name: 'artist-character',
      bodyType: 'male',
      items: {
        body: { name: 'Body Color', recolor: 'light' },
        hair: { name: 'Messy' },
      },
    };
    writeJson(characterPath, character);
    const characterPreview = expectSuccessfulData(await runJson<AssetPackPreviewResult>([
      'asset', 'preview', extensionPack.packRoot,
      '--animation', 'climb',
      '--character', characterPath,
    ], workspaceRoot, prepare));
    expect(characterPreview.outDir).toBe(
      path.join(extensionPack.packRoot, 'previews', 'hair_messy'),
    );
    expect(characterPreview.artifacts.every(({ path: artifactPath }) =>
      artifactPath.startsWith(`${characterPreview.outDir}${path.sep}`))).toBe(true);
    const characterPreviewCredits = readFileSync(
      path.join(characterPreview.outDir, 'artist-character.credits.txt'),
      'utf8',
    );
    expect(characterPreviewCredits).toContain('Base Hair Artist');
    expect(characterPreviewCredits).toContain('Extension Artist');

    expectSuccessfulData(await runJson<AssetPackSyncSuccess>([
      'asset', 'sync', newPack.packRoot,
    ], workspaceRoot, prepare));
    const firstRegistry = readJson<RegistryDocument>(workspace.registryPath);
    const firstPackEntry = firstRegistry.entries.find(
      ({ packId }) => packId === 'acme.fantasy-hair',
    );
    expect(firstPackEntry).toBeDefined();
    if (!firstPackEntry) throw new Error('Expected first linked pack registry entry.');
    const firstPackClimbPath =
      'spritesheets/packages/acme.fantasy-hair/moon-braid/foreground/male-female/climb.png';
    expect(firstPackEntry.generatedPaths).toEqual([
      'sheet_definitions/hair/acme.fantasy-hair--moon-braid.json',
      firstPackClimbPath,
      'spritesheets/packages/acme.fantasy-hair/moon-braid/foreground/male-female/walk.png',
    ]);
    const firstPackGeneratedBytes = new Map(firstPackEntry.generatedPaths.map(
      (generatedPath) => [
        generatedPath,
        readFileSync(path.join(workspace.outputRoot, generatedPath)),
      ] as const,
    ));
    const firstCreditsPath = path.join(workspace.outputRoot, 'CREDITS.csv');
    const firstPackCreditEntry = readFileSync(firstCreditsPath, 'utf8')
      .split('\n')
      .find((line) => line.startsWith(`"${firstPackClimbPath}"`));
    expect(firstPackCreditEntry).toBe(
      `"${firstPackClimbPath}","","New Hair Artist","CC-BY-SA 4.0","https://example.test/acme/fantasy-hair"`,
    );
    if (!firstPackCreditEntry) throw new Error('Expected first pack credit entry.');

    expectSuccessfulData(await runJson<AssetPackSyncSuccess>([
      'asset', 'sync', extensionPack.packRoot,
    ], workspaceRoot, prepare));
    for (const [generatedPath, expectedBytes] of firstPackGeneratedBytes) {
      expect(
        readFileSync(path.join(workspace.outputRoot, generatedPath)),
        `second sync changed first-pack output ${generatedPath}`,
      ).toEqual(expectedBytes);
    }
    expect(readFileSync(firstCreditsPath, 'utf8').split('\n')).toContain(firstPackCreditEntry);

    const registry = readJson<RegistryDocument>(workspace.registryPath);
    expect(registry.entries.map(({ packId }) => packId)).toEqual([
      'acme.fantasy-hair',
      'acme.messy-climb',
    ]);
    const overlayRuntime = createOverlayRuntimeAssets({
      runtime,
      customSheetDefinitionsRoot: path.join(workspace.outputRoot, 'sheet_definitions'),
      overlayRoot: workspace.outputRoot,
      logicalPaths: registry.entries.flatMap(({ generatedPaths }) => generatedPaths),
    });

    const renderSelectionPath = path.join(workspaceRoot, 'render-selection.json');
    writeJson(renderSelectionPath, character);
    const renderResult = expectSuccessfulData(await runJson<{
      readonly artifacts: readonly { readonly type: string; readonly path: string }[];
    }>([
      'render', '--selection', renderSelectionPath,
      '--out', path.join(workspaceRoot, 'rendered'),
      '--animation', 'climb',
    ], workspaceRoot, async () => overlayRuntime));
    expect(renderResult.artifacts.every(({ path: artifactPath }) =>
      artifactPath.startsWith(`${workspaceRoot}${path.sep}`))).toBe(true);
    const renderCreditsPath = renderResult.artifacts.find(({ type }) => type === 'credits_txt')?.path;
    expect(renderCreditsPath).toBeDefined();
    const renderCredits = readFileSync(renderCreditsPath!, 'utf8');
    expect(renderCredits).toContain('Base Body Artist');
    expect(renderCredits).toContain('Base Hair Artist');
    expect(renderCredits).toContain('Extension Artist');

    const loadedCatalog = loadCatalogFromRoots(
      overlayRuntime.context.sheetDefinitionsRoot,
      overlayRuntime.context.customSheetDefinitionsRoot,
    );
    const palettes = loadPalettesFromRoot(overlayRuntime.context.paletteDefinitionsRoot);
    const auditPlan = planAssetAnimationAudit({
      catalog: loadedCatalog.catalog,
      palettes: palettes.palettes,
      targets: ['climb'],
      typeName: 'hair',
      bodyType: 'male',
    });
    const audited = await inspectAssetAnimationPlan(auditPlan, {
      store: overlayRuntime.store,
      adapter: createNodeCanvasAdapter({ assetStore: overlayRuntime.store }),
      scope: { typeName: 'hair', bodyType: 'male' },
    });
    expect(audited.unsupported).not.toContainEqual(expect.objectContaining({
      itemId: 'hair_messy',
      animation: 'climb',
    }));
    expect(audited.missingFiles).not.toContainEqual(expect.objectContaining({
      path: 'spritesheets/hair/messy/climb.png',
    }));

    expect(prepare).toHaveBeenCalled();
    expect(snapshotTree(preparedRoot)).toEqual(preparedBefore);
    expect(readdirSync(consumerRoot).sort()).toEqual(['artist-workspace', 'prepared-runtime']);
    expect(existsSync(path.join(workspaceRoot, '.git'))).toBe(false);
    expect(existsSync(path.join(workspaceRoot, 'assets'))).toBe(false);
  }, 30000);
});
