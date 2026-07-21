import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import {
  ASSET_PACK_SCHEMA,
  standardAnimationGeometry,
  type AnimationName,
  type AssetPackAcknowledgement,
  type AssetPackSource,
  type ItemDefinition,
} from '@lpc-toolkit/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ASSET_OUTPUT_MARKER_SCHEMA,
  ASSET_WORKSPACE_REGISTRY_SCHEMA,
  initializeAssetWorkspace,
  type AssetWorkspace,
} from '../src/asset-workspace.js';
import { loadActiveAssetPackBaseline } from '../src/asset-pack-validation.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { createRuntimeContext } from '../src/context.js';
import {
  syncLinkedAssetPack,
  type AssetPackSyncDiagnostic,
  type AssetPackSyncFailure,
  type AssetPackSyncResult,
  type AssetPackSyncSuccess,
  type AssetPublicationFileOps,
  type LinkedAssetPackRegistryEntry,
} from '../src/asset-pack-sync.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

const temporaryDirectories: string[] = [];

const PACK_CREDITS = {
  authors: ['Alice'],
  licenses: ['CC-BY-SA 4.0'],
  urls: ['https://example.com/alice'],
  notes: '',
} as const;

const BASE_CREDIT = {
  file: 'hair/braid',
  authors: ['Base Artist'],
  licenses: ['GPL 3.0'],
  urls: ['https://example.com/base'],
  notes: 'Original braid baseline.',
} as const;

interface WorkspaceFixture {
  readonly cwd: string;
  readonly assetsRoot: string;
  readonly upstreamRoot: string;
  readonly cacheSentinelRoot: string;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
}

interface RegistryDocument {
  readonly schema: typeof ASSET_WORKSPACE_REGISTRY_SCHEMA;
  readonly workspaceId: string;
  readonly entries: readonly LinkedAssetPackRegistryEntry[];
  readonly generatedDigests: Readonly<Record<string, string>>;
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

function geometryBounds(animation: AnimationName): { width: number; height: number } {
  const geometry = standardAnimationGeometry(animation);
  const maxColumn = Math.max(
    ...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)),
  );
  return {
    width: (maxColumn + 1) * geometry.frameSize,
    height: geometry.rows.length * geometry.frameSize,
  };
}

function writeSheetPng(
  filePath: string,
  animation: AnimationName,
  color: string,
): void {
  const bounds = geometryBounds(animation);
  const canvas = createCanvas(bounds.width, bounds.height);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, bounds.width, bounds.height);

  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, canvas.toBuffer('image/png'));
}

function baseDefinition(overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    name: 'Braid',
    type_name: 'hair',
    animations: ['walk', 'climb'],
    credits: [BASE_CREDIT],
    variants: ['dark brown'],
    recolors: { material: 'hair', palettes: ['ulpc'] },
    layer_1: { zPos: 50, male: 'hair/braid/', female: 'hair/braid/', teen: 'hair/braid/' },
    ...overrides,
  };
}

function writePaletteFixtures(assetsRoot: string): void {
  writeJson(path.join(assetsRoot, 'palette_definitions', 'hair', 'meta_hair.json'), {
    type: 'material',
    default: 'ulpc',
    base: 'black',
  });
  writeJson(path.join(assetsRoot, 'palette_definitions', 'hair', 'hair_ulpc.json'), {
    black: ['#111111', '#222222'],
    orange: ['#cc5500', '#ee7700'],
    blue: ['#3355aa', '#5577cc'],
  });
}

function createWorkspaceFixture(): WorkspaceFixture {
  const cwd = createDirectory('lpc-asset-pack-sync-workspace-');
  const assetsRoot = path.join(cwd, 'assets');
  writeJson(path.join(assetsRoot, 'sheet_definitions', 'hair', 'braid.json'), baseDefinition());
  writePaletteFixtures(assetsRoot);
  writeFileSync(path.join(assetsRoot, 'CREDITS.csv'), 'filename,notes,authors,licenses,urls\n');
  writeFileSync(path.join(assetsRoot, 'sentinel.txt'), 'base sentinel\n');

  const upstreamRoot = path.join(cwd, 'upstream');
  mkdirSync(upstreamRoot, { recursive: true });
  writeFileSync(path.join(upstreamRoot, 'sentinel.txt'), 'upstream sentinel\n');

  const cacheSentinelRoot = createDirectory('lpc-asset-pack-sync-cache-');
  writeFileSync(path.join(cacheSentinelRoot, 'sentinel.txt'), 'cache sentinel\n');

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

  return {
    cwd,
    assetsRoot,
    upstreamRoot,
    cacheSentinelRoot,
    workspace,
    runtime,
  };
}

function newItemSource(options: {
  readonly packId: string;
  readonly version?: string;
  readonly displayName: string;
  readonly localId: string;
  readonly animation?: AnimationName;
  readonly sourcePath?: string;
}): AssetPackSource {
  const animation = options.animation ?? 'walk';
  const sourcePath = options.sourcePath ?? `sprites/${options.localId}/foreground/${animation}.png`;
  return {
    schema: ASSET_PACK_SCHEMA,
    id: options.packId,
    version: options.version ?? '1.0.0',
    displayName: options.displayName,
    credits: PACK_CREDITS,
    assets: [{
      kind: 'new-item',
      localId: options.localId,
      displayName: options.displayName,
      typeName: 'hair',
      bodyTypes: ['male', 'female'],
      animations: [animation],
      variants: ['orange'],
      recolor: { material: 'hair', palettes: ['ulpc'] },
      layers: [{
        id: 'foreground',
        zPos: 120,
        sprites: [{ animation, source: sourcePath }],
      }],
    }],
  };
}

function extendItemSource(
  options: {
    readonly packId: string;
    readonly displayName: string;
    readonly definitionDigest: string;
    readonly creditDigest: string;
    readonly destinationPath: string;
    readonly layer: `layer_${number}`;
    readonly bodyTypes: readonly ('male' | 'female' | 'teen')[];
    readonly evidence?: 'audit-inferred' | 'artist-specified';
    readonly acknowledgements?: readonly AssetPackAcknowledgement[];
    readonly sourcePath?: string;
  },
): AssetPackSource {
  return {
    schema: ASSET_PACK_SCHEMA,
    id: options.packId,
    version: '1.0.0',
    displayName: options.displayName,
    credits: PACK_CREDITS,
    ...(options.acknowledgements ? { acknowledgements: options.acknowledgements } : {}),
    assets: [{
      kind: 'extend-item',
      itemId: 'braid',
      baseDefinitionDigest: options.definitionDigest,
      baseCreditDigest: options.creditDigest,
      addAnimations: [{
        animation: 'climb',
        layers: [{
          layer: options.layer,
          bodyTypes: options.bodyTypes,
          source: options.sourcePath ?? `sprites/${options.packId}/climb.png`,
          variant: 'dark brown',
          destination: {
            path: options.destinationPath,
            evidence: options.evidence ?? 'artist-specified',
            accepted: true,
          },
        }],
      }],
    }],
  };
}

function writePack(
  root: string,
  manifest: AssetPackSource,
  sources: Readonly<Record<string, Buffer | string>>,
): void {
  writeJson(path.join(root, 'asset-pack.json'), manifest);
  for (const [relativePath, contents] of Object.entries(sources)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
}

function writeNewItemPack(
  root: string,
  options: {
    readonly packId: string;
    readonly version?: string;
    readonly displayName: string;
    readonly localId: string;
    readonly color: string;
  },
): AssetPackSource {
  const source = newItemSource(options);
  writePack(root, source, {});
  writeSheetPng(path.join(root, `sprites/${options.localId}/foreground/walk.png`), 'walk', options.color);
  return source;
}

function baselineDigests(fixture: WorkspaceFixture): {
  readonly definition: string;
  readonly credit: string;
} {
  const baseline = loadActiveAssetPackBaseline({
    runtime: fixture.runtime,
    workspace: fixture.workspace,
  });
  return {
    definition: baseline.definitionDigests.get('braid')!,
    credit: baseline.creditDigests.get('braid')!,
  };
}

function snapshotTree(root: string): Readonly<Record<string, string>> {
  const snapshot: Record<string, string> = {};

  if (!existsSync(root)) return snapshot;

  function visit(current: string): void {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      snapshot[relativePath] = readFileSync(absolutePath).toString('base64');
    }
  }

  visit(root);
  return snapshot;
}

function snapshotTreeWithoutMarker(root: string): Readonly<Record<string, string>> {
  const snapshot = { ...snapshotTree(root) };
  delete snapshot['.lpc-toolkit-managed.json'];
  return snapshot;
}

function snapshotFile(filePath: string): string | undefined {
  return existsSync(filePath) ? readFileSync(filePath).toString('base64') : undefined;
}

function outputMarkerPath(workspace: AssetWorkspace): string {
  return path.join(workspace.outputRoot, '.lpc-toolkit-managed.json');
}

function readRegistry(workspace: AssetWorkspace): RegistryDocument {
  return readJson<RegistryDocument>(workspace.registryPath);
}

function expectSuccess(result: AssetPackSyncResult): AssetPackSyncSuccess {
  if (!result.ok) {
    throw new Error(
      `Expected sync success but saw ${result.diagnostics.map((d) => `${d.code}:${d.message}`).join(' | ')}`,
    );
  }
  expect(result.ok).toBe(true);
  return result;
}

function expectFailure(result: AssetPackSyncResult): AssetPackSyncFailure {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error('Expected sync failure.');
  }
  return result;
}

function diagnosticCodes(diagnostics: readonly AssetPackSyncDiagnostic[]): readonly string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

function createFileOpsRecorder(options: {
  readonly failAt?: number;
  readonly failAtIndices?: readonly number[];
} = {}): {
  readonly actions: string[];
  readonly fileOps: AssetPublicationFileOps;
} {
  const actions: string[] = [];
  let writeRenameCount = 0;
  const shouldFail = (): boolean => {
    writeRenameCount += 1;
    if (options.failAt !== undefined) {
      return writeRenameCount === options.failAt;
    }
    return options.failAtIndices?.includes(writeRenameCount) ?? false;
  };

  const fileOps: AssetPublicationFileOps = {
    mkdirSync(target, optionsArg) {
      mkdirSync(target, optionsArg);
    },
    writeFileSync(target, data, optionsArg) {
      actions.push(`write:${path.basename(String(target))}`);
      if (shouldFail()) {
        throw new Error(`Injected failure at ${actions.at(-1)}`);
      }
      writeFileSync(target, data, optionsArg);
    },
    renameSync(source, destination) {
      actions.push(`rename:${path.basename(String(source))}->${path.basename(String(destination))}`);
      if (shouldFail()) {
        throw new Error(`Injected failure at ${actions.at(-1)}`);
      }
      renameSync(source, destination);
    },
    rmSync(target, optionsArg) {
      rmSync(target, optionsArg);
    },
  };

  return { actions, fileOps };
}

function createRollbackFixture(): {
  readonly fixture: WorkspaceFixture;
  readonly packRoot: string;
  readonly initialOutput: Readonly<Record<string, string>>;
  readonly initialRegistry: string | undefined;
  readonly initialSource: Readonly<Record<string, string>>;
} {
  const fixture = createWorkspaceFixture();
  const packRoot = path.join(fixture.workspace.packsRoot, 'acme.wind-braid');
  writeNewItemPack(packRoot, {
    packId: 'acme.wind-braid',
    displayName: 'Wind Braid',
    localId: 'wind-braid',
    color: '#aa5500',
  });
  return syncLinkedAssetPack({
    packDirectory: packRoot,
    workspace: fixture.workspace,
    runtime: fixture.runtime,
  }).then((result) => {
    expectSuccess(result);
    writeNewItemPack(packRoot, {
      packId: 'acme.wind-braid',
      version: '1.1.0',
      displayName: 'Wind Braid',
      localId: 'wind-braid',
      color: '#3355aa',
    });
    return {
      fixture,
      packRoot,
      initialOutput: snapshotTree(fixture.workspace.outputRoot),
      initialRegistry: snapshotFile(fixture.workspace.registryPath),
      initialSource: snapshotTree(packRoot),
    };
  }) as unknown as {
    readonly fixture: WorkspaceFixture;
    readonly packRoot: string;
    readonly initialOutput: Readonly<Record<string, string>>;
    readonly initialRegistry: string | undefined;
    readonly initialSource: Readonly<Record<string, string>>;
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('syncLinkedAssetPack', () => {
  it('syncs the first linked pack, writes overlay credits and registry, and leaves sentinels untouched', async () => {
    const fixture = createWorkspaceFixture();
    const baseSnapshot = snapshotTree(fixture.assetsRoot);
    const upstreamSnapshot = snapshotTree(fixture.upstreamRoot);
    const cacheSnapshot = snapshotTree(fixture.cacheSentinelRoot);
    const packRoot = path.join(fixture.workspace.packsRoot, 'acme.wind-braid');
    writeNewItemPack(packRoot, {
      packId: 'acme.wind-braid',
      displayName: 'Wind Braid',
      localId: 'wind-braid',
      color: '#aa5500',
    });

    const result = expectSuccess(await syncLinkedAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(result.linked).toMatchObject({
      kind: 'linked',
      packId: 'acme.wind-braid',
      version: '1.0.0',
      displayName: 'Wind Braid',
      sourceDirectory: path.resolve(packRoot),
      generatedPaths: [
        'sheet_definitions/hair/acme.wind-braid--wind-braid.json',
        'spritesheets/packages/acme.wind-braid/wind-braid/foreground/male-female/walk.png',
      ],
      baselineDefinitionDigests: {},
      baselineCreditDigests: {},
    });
    expect(result.linked.contentDigest).toMatch(/^sha256:/);
    expect(result.linked.sourceDigests).toEqual({
      'sprites/wind-braid/foreground/walk.png': expect.stringMatching(/^sha256:/),
    });

    const marker = readJson<{ schema: string; workspaceId: string }>(outputMarkerPath(fixture.workspace));
    expect(marker.schema).toBe(ASSET_OUTPUT_MARKER_SCHEMA);
    expect(readRegistry(fixture.workspace)).toEqual({
      schema: ASSET_WORKSPACE_REGISTRY_SCHEMA,
      workspaceId: marker.workspaceId,
      entries: [result.linked],
      generatedDigests: {
        'CREDITS.csv': expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        'sheet_definitions/hair/acme.wind-braid--wind-braid.json': expect.stringMatching(
          /^sha256:[0-9a-f]{64}$/,
        ),
        'spritesheets/packages/acme.wind-braid/wind-braid/foreground/male-female/walk.png':
          expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      },
    });

    expect(snapshotTree(fixture.workspace.outputRoot)).toMatchObject({
      '.lpc-toolkit-managed.json': expect.any(String),
      'CREDITS.csv': expect.any(String),
      'sheet_definitions/hair/acme.wind-braid--wind-braid.json': expect.any(String),
      'spritesheets/packages/acme.wind-braid/wind-braid/foreground/male-female/walk.png': expect.any(String),
    });
    expect(readFileSync(path.join(fixture.workspace.outputRoot, 'CREDITS.csv'), 'utf8')).toContain(
      'spritesheets/packages/acme.wind-braid/wind-braid/foreground/male-female/walk.png',
    );

    expect(snapshotTree(fixture.assetsRoot)).toEqual(baseSnapshot);
    expect(snapshotTree(fixture.upstreamRoot)).toEqual(upstreamSnapshot);
    expect(snapshotTree(fixture.cacheSentinelRoot)).toEqual(cacheSnapshot);
  });

  it('escapes artist-controlled quotes and newlines in generated overlay credits', async () => {
    const fixture = createWorkspaceFixture();
    const packRoot = path.join(fixture.workspace.packsRoot, 'acme.quoted-credit');
    const source = newItemSource({
      packId: 'acme.quoted-credit',
      displayName: 'Quoted Credit',
      localId: 'quoted-credit',
    });
    writePack(packRoot, {
      ...source,
      credits: {
        authors: ['Alice "Ace"', 'Bob\nBuilder'],
        licenses: ['CC-BY-SA 4.0'],
        urls: ['https://example.com/?q="hair"'],
        notes: 'First "quoted" line\nSecond line',
      },
    }, {});
    writeSheetPng(
      path.join(packRoot, 'sprites/quoted-credit/foreground/walk.png'),
      'walk',
      '#aa5500',
    );

    expectSuccess(await syncLinkedAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    const csv = readFileSync(path.join(fixture.workspace.outputRoot, 'CREDITS.csv'), 'utf8');
    expect(csv).toContain('"First ""quoted"" line\nSecond line"');
    expect(csv).toContain('"Alice ""Ace"", Bob\nBuilder"');
    expect(csv).toContain('"https://example.com/?q=""hair"""');
  });

  it('preserves the first linked pack when syncing a second linked pack', async () => {
    const fixture = createWorkspaceFixture();
    const firstRoot = path.join(fixture.workspace.packsRoot, 'acme.wind-braid');
    const secondRoot = path.join(fixture.workspace.packsRoot, 'bravo.ribbon-braid');
    writeNewItemPack(firstRoot, {
      packId: 'acme.wind-braid',
      displayName: 'Wind Braid',
      localId: 'wind-braid',
      color: '#aa5500',
    });
    writeNewItemPack(secondRoot, {
      packId: 'bravo.ribbon-braid',
      displayName: 'Ribbon Braid',
      localId: 'ribbon-braid',
      color: '#00aa55',
    });

    expectSuccess(await syncLinkedAssetPack({
      packDirectory: firstRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));
    const second = expectSuccess(await syncLinkedAssetPack({
      packDirectory: secondRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(second.registry.map((entry) => entry.packId)).toEqual([
      'acme.wind-braid',
      'bravo.ribbon-braid',
    ]);
    expect(snapshotTree(fixture.workspace.outputRoot)).toMatchObject({
      'sheet_definitions/hair/acme.wind-braid--wind-braid.json': expect.any(String),
      'sheet_definitions/hair/bravo.ribbon-braid--ribbon-braid.json': expect.any(String),
      'spritesheets/packages/acme.wind-braid/wind-braid/foreground/male-female/walk.png': expect.any(String),
      'spritesheets/packages/bravo.ribbon-braid/ribbon-braid/foreground/male-female/walk.png': expect.any(String),
    });
  });

  it('re-syncs after source changes and publishes the new bytes', async () => {
    const fixture = createWorkspaceFixture();
    const packRoot = path.join(fixture.workspace.packsRoot, 'acme.wind-braid');
    writeNewItemPack(packRoot, {
      packId: 'acme.wind-braid',
      displayName: 'Wind Braid',
      localId: 'wind-braid',
      color: '#aa5500',
    });

    const first = expectSuccess(await syncLinkedAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));
    const firstOutput = snapshotTree(fixture.workspace.outputRoot);

    writeNewItemPack(packRoot, {
      packId: 'acme.wind-braid',
      version: '1.1.0',
      displayName: 'Wind Braid',
      localId: 'wind-braid',
      color: '#3355aa',
    });

    const second = expectSuccess(await syncLinkedAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(second.linked.version).toBe('1.1.0');
    expect(second.linked.contentDigest).not.toBe(first.linked.contentDigest);
    expect(snapshotTree(fixture.workspace.outputRoot)).not.toEqual(firstOutput);
  });

  it('publishes the immutable source bytes that were validated even if the source changes during staging', async () => {
    const fixture = createWorkspaceFixture();
    const packRoot = path.join(fixture.workspace.packsRoot, 'acme.snapshot-braid');
    writeNewItemPack(packRoot, {
      packId: 'acme.snapshot-braid',
      displayName: 'Snapshot Braid',
      localId: 'snapshot-braid',
      color: '#aa5500',
    });
    const sourcePath = path.join(packRoot, 'sprites/snapshot-braid/foreground/walk.png');
    const validatedBytes = readFileSync(sourcePath);
    const mutationPath = path.join(fixture.cwd, 'mutated-walk.png');
    writeSheetPng(mutationPath, 'walk', '#3355aa');
    const mutatedBytes = readFileSync(mutationPath);
    let sourceMutated = false;
    const recorder = createFileOpsRecorder();
    const fileOps: AssetPublicationFileOps = {
      ...recorder.fileOps,
      writeFileSync(target, data, optionsArg) {
        recorder.fileOps.writeFileSync(target, data, optionsArg);
        if (!sourceMutated && path.basename(String(target)) === '.lpc-toolkit-managed.json') {
          writeFileSync(sourcePath, mutatedBytes);
          sourceMutated = true;
        }
      },
    };

    expectSuccess(await syncLinkedAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      fileOps,
    }));

    const outputPath = path.join(
      fixture.workspace.outputRoot,
      'spritesheets/packages/acme.snapshot-braid/snapshot-braid/foreground/male-female/walk.png',
    );
    expect(sourceMutated).toBe(true);
    expect(readFileSync(sourcePath)).toEqual(mutatedBytes);
    expect(readFileSync(outputPath)).toEqual(validatedBytes);
  });

  it('refuses source-change re-sync when an existing managed generated file was tampered', async () => {
    const fixture = createWorkspaceFixture();
    const packRoot = path.join(fixture.workspace.packsRoot, 'acme.wind-braid');
    writeNewItemPack(packRoot, {
      packId: 'acme.wind-braid',
      displayName: 'Wind Braid',
      localId: 'wind-braid',
      color: '#aa5500',
    });

    expectSuccess(await syncLinkedAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    writeNewItemPack(packRoot, {
      packId: 'acme.wind-braid',
      version: '1.1.0',
      displayName: 'Wind Braid',
      localId: 'wind-braid',
      color: '#3355aa',
    });
    writeFileSync(
      path.join(
        fixture.workspace.outputRoot,
        'spritesheets/packages/acme.wind-braid/wind-braid/foreground/male-female/walk.png',
      ),
      'not-a-real-png\n',
    );
    const beforeOutput = snapshotTree(fixture.workspace.outputRoot);
    const beforeRegistry = snapshotFile(fixture.workspace.registryPath);

    const failed = expectFailure(await syncLinkedAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(diagnosticCodes(failed.diagnostics)).toContain('asset_digest_mismatch');
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(beforeOutput);
    expect(snapshotFile(fixture.workspace.registryPath)).toEqual(beforeRegistry);
  });

  it('refuses source-change re-sync when the generated definition was tampered', async () => {
    const fixture = createWorkspaceFixture();
    const packRoot = path.join(fixture.workspace.packsRoot, 'acme.wind-braid');
    writeNewItemPack(packRoot, {
      packId: 'acme.wind-braid',
      displayName: 'Wind Braid',
      localId: 'wind-braid',
      color: '#aa5500',
    });

    expectSuccess(await syncLinkedAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    writeNewItemPack(packRoot, {
      packId: 'acme.wind-braid',
      version: '1.1.0',
      displayName: 'Wind Braid',
      localId: 'wind-braid',
      color: '#3355aa',
    });
    writeFileSync(
      path.join(
        fixture.workspace.outputRoot,
        'sheet_definitions/hair/acme.wind-braid--wind-braid.json',
      ),
      '{"tampered":true}\n',
    );
    const beforeOutput = snapshotTree(fixture.workspace.outputRoot);
    const beforeRegistry = snapshotFile(fixture.workspace.registryPath);

    const failed = expectFailure(await syncLinkedAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(diagnosticCodes(failed.diagnostics)).toContain('asset_digest_mismatch');
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(beforeOutput);
    expect(snapshotFile(fixture.workspace.registryPath)).toEqual(beforeRegistry);
  });

  it('refuses source-change re-sync when generated credits were tampered', async () => {
    const fixture = createWorkspaceFixture();
    const packRoot = path.join(fixture.workspace.packsRoot, 'acme.wind-braid');
    writeNewItemPack(packRoot, {
      packId: 'acme.wind-braid',
      displayName: 'Wind Braid',
      localId: 'wind-braid',
      color: '#aa5500',
    });

    expectSuccess(await syncLinkedAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    writeNewItemPack(packRoot, {
      packId: 'acme.wind-braid',
      version: '1.1.0',
      displayName: 'Wind Braid',
      localId: 'wind-braid',
      color: '#3355aa',
    });
    writeFileSync(path.join(fixture.workspace.outputRoot, 'CREDITS.csv'), 'tampered\n');
    const beforeOutput = snapshotTree(fixture.workspace.outputRoot);
    const beforeRegistry = snapshotFile(fixture.workspace.registryPath);

    const failed = expectFailure(await syncLinkedAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(diagnosticCodes(failed.diagnostics)).toContain('asset_digest_mismatch');
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(beforeOutput);
    expect(snapshotFile(fixture.workspace.registryPath)).toEqual(beforeRegistry);
  });

  it('refuses source-change re-sync when a tampered prior sprite path leaves the new generation', async () => {
    const fixture = createWorkspaceFixture();
    const packRoot = path.join(fixture.workspace.packsRoot, 'acme.shared-braid');
    writeNewItemPack(packRoot, {
      packId: 'acme.shared-braid',
      displayName: 'Shared Braid',
      localId: 'old-braid',
      color: '#aa5500',
    });

    expectSuccess(await syncLinkedAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    writeNewItemPack(packRoot, {
      packId: 'acme.shared-braid',
      version: '1.1.0',
      displayName: 'Shared Braid',
      localId: 'new-braid',
      color: '#3355aa',
    });
    writeFileSync(
      path.join(
        fixture.workspace.outputRoot,
        'spritesheets/packages/acme.shared-braid/old-braid/foreground/male-female/walk.png',
      ),
      'not-a-real-png\n',
    );
    const beforeOutput = snapshotTree(fixture.workspace.outputRoot);
    const beforeRegistry = snapshotFile(fixture.workspace.registryPath);

    const failed = expectFailure(await syncLinkedAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(diagnosticCodes(failed.diagnostics)).toContain('asset_digest_mismatch');
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(beforeOutput);
    expect(snapshotFile(fixture.workspace.registryPath)).toEqual(beforeRegistry);
  });

  it('replaces a same-pack-id link target instead of incrementally keeping old generated files', async () => {
    const fixture = createWorkspaceFixture();
    const oldRoot = path.join(fixture.workspace.packsRoot, 'old-shared');
    const newRoot = path.join(fixture.workspace.packsRoot, 'new-shared');
    writeNewItemPack(oldRoot, {
      packId: 'acme.shared-braid',
      displayName: 'Shared Braid',
      localId: 'old-braid',
      color: '#aa5500',
    });
    writeNewItemPack(newRoot, {
      packId: 'acme.shared-braid',
      displayName: 'Shared Braid',
      localId: 'new-braid',
      color: '#3355aa',
    });

    expectSuccess(await syncLinkedAssetPack({
      packDirectory: oldRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));
    const replaced = expectSuccess(await syncLinkedAssetPack({
      packDirectory: newRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(replaced.registry).toHaveLength(1);
    expect(replaced.linked.sourceDirectory).toBe(path.resolve(newRoot));
    const output = snapshotTree(fixture.workspace.outputRoot);
    expect(output).toMatchObject({
      'sheet_definitions/hair/acme.shared-braid--new-braid.json': expect.any(String),
      'spritesheets/packages/acme.shared-braid/new-braid/foreground/male-female/walk.png': expect.any(String),
    });
    expect(output['sheet_definitions/hair/acme.shared-braid--old-braid.json']).toBeUndefined();
  });

  it('fails when a previously linked source disappears and leaves published output unchanged', async () => {
    const fixture = createWorkspaceFixture();
    const firstRoot = path.join(fixture.workspace.packsRoot, 'acme.wind-braid');
    const secondRoot = path.join(fixture.workspace.packsRoot, 'bravo.ribbon-braid');
    writeNewItemPack(firstRoot, {
      packId: 'acme.wind-braid',
      displayName: 'Wind Braid',
      localId: 'wind-braid',
      color: '#aa5500',
    });
    writeNewItemPack(secondRoot, {
      packId: 'bravo.ribbon-braid',
      displayName: 'Ribbon Braid',
      localId: 'ribbon-braid',
      color: '#00aa55',
    });

    expectSuccess(await syncLinkedAssetPack({
      packDirectory: firstRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));
    const beforeOutput = snapshotTree(fixture.workspace.outputRoot);
    const beforeRegistry = snapshotFile(fixture.workspace.registryPath);
    rmSync(firstRoot, { recursive: true, force: true });

    const failed = expectFailure(await syncLinkedAssetPack({
      packDirectory: secondRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(diagnosticCodes(failed.diagnostics)).toContain('asset_source_missing');
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(beforeOutput);
    expect(snapshotFile(fixture.workspace.registryPath)).toEqual(beforeRegistry);
  });

  it('produces deterministic registry and output regardless of sync order', async () => {
    const left = createWorkspaceFixture();
    const right = createWorkspaceFixture();
    const leftFirst = path.join(left.workspace.packsRoot, 'acme.wind-braid');
    const leftSecond = path.join(left.workspace.packsRoot, 'bravo.ribbon-braid');
    const rightFirst = path.join(right.workspace.packsRoot, 'acme.wind-braid');
    const rightSecond = path.join(right.workspace.packsRoot, 'bravo.ribbon-braid');
    writeNewItemPack(leftFirst, {
      packId: 'acme.wind-braid',
      displayName: 'Wind Braid',
      localId: 'wind-braid',
      color: '#aa5500',
    });
    writeNewItemPack(leftSecond, {
      packId: 'bravo.ribbon-braid',
      displayName: 'Ribbon Braid',
      localId: 'ribbon-braid',
      color: '#00aa55',
    });
    writeNewItemPack(rightFirst, {
      packId: 'acme.wind-braid',
      displayName: 'Wind Braid',
      localId: 'wind-braid',
      color: '#aa5500',
    });
    writeNewItemPack(rightSecond, {
      packId: 'bravo.ribbon-braid',
      displayName: 'Ribbon Braid',
      localId: 'ribbon-braid',
      color: '#00aa55',
    });

    expectSuccess(await syncLinkedAssetPack({
      packDirectory: leftFirst,
      workspace: left.workspace,
      runtime: left.runtime,
    }));
    expectSuccess(await syncLinkedAssetPack({
      packDirectory: leftSecond,
      workspace: left.workspace,
      runtime: left.runtime,
    }));
    expectSuccess(await syncLinkedAssetPack({
      packDirectory: rightSecond,
      workspace: right.workspace,
      runtime: right.runtime,
    }));
    expectSuccess(await syncLinkedAssetPack({
      packDirectory: rightFirst,
      workspace: right.workspace,
      runtime: right.runtime,
    }));

    expect(snapshotTreeWithoutMarker(left.workspace.outputRoot)).toEqual(
      snapshotTreeWithoutMarker(right.workspace.outputRoot),
    );
    expect(
      readRegistry(left.workspace).entries.map((entry) => ({
        ...entry,
        sourceDirectory: path.basename(entry.sourceDirectory),
      })),
    ).toEqual(
      readRegistry(right.workspace).entries.map((entry) => ({
        ...entry,
        sourceDirectory: path.basename(entry.sourceDirectory),
      })),
    );
  });

  it('merges disjoint linked extensions into one deterministic generated definition', async () => {
    const fixture = createWorkspaceFixture();
    const digests = baselineDigests(fixture);
    const childRoot = path.join(fixture.workspace.packsRoot, 'acme.child-climb');
    const adultRoot = path.join(fixture.workspace.packsRoot, 'bravo.adult-climb');
    const child = extendItemSource({
      packId: 'acme.child-climb',
      displayName: 'Child Climb',
      definitionDigest: digests.definition,
      creditDigest: digests.credit,
      layer: 'layer_1',
      bodyTypes: ['teen'],
      destinationPath: 'spritesheets/hair/braid/front/climb/dark_brown.png',
      sourcePath: 'sprites/braid/front-climb-teen.png',
    });
    const adult = extendItemSource({
      packId: 'bravo.adult-climb',
      displayName: 'Adult Climb',
      definitionDigest: digests.definition,
      creditDigest: digests.credit,
      layer: 'layer_1',
      bodyTypes: ['female'],
      destinationPath: 'spritesheets/hair/braid/front-female/climb/dark_brown.png',
      sourcePath: 'sprites/braid/trim-climb-female.png',
    });
    writePack(childRoot, child, {});
    writePack(adultRoot, adult, {});
    writeSheetPng(path.join(childRoot, 'sprites/braid/front-climb-teen.png'), 'climb', '#aa5500');
    writeSheetPng(path.join(adultRoot, 'sprites/braid/trim-climb-female.png'), 'climb', '#3355aa');

    expectSuccess(await syncLinkedAssetPack({
      packDirectory: childRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));
    expectSuccess(await syncLinkedAssetPack({
      packDirectory: adultRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    const compiled = readJson<ItemDefinition>(
      path.join(fixture.workspace.outputRoot, 'sheet_definitions', 'hair', 'braid.json'),
    );
    expect(compiled.layer_1).toMatchObject({
      teen: 'hair/braid/front/',
    });
    expect(compiled.layer_1).toMatchObject({
      female: 'hair/braid/front-female/',
      teen: 'hair/braid/front/',
    });
  });

  it('validates and re-syncs an extension against the base snapshot after generated output exists', async () => {
    const fixture = createWorkspaceFixture();
    const digests = baselineDigests(fixture);
    const packRoot = path.join(fixture.workspace.packsRoot, 'acme.base-snapshot-climb');
    const source = extendItemSource({
      packId: 'acme.base-snapshot-climb',
      displayName: 'Base Snapshot Climb',
      definitionDigest: digests.definition,
      creditDigest: digests.credit,
      layer: 'layer_1',
      bodyTypes: ['teen'],
      destinationPath: 'spritesheets/hair/braid/front/climb/dark_brown.png',
      sourcePath: 'sprites/braid/front-climb-teen.png',
    });
    writePack(packRoot, source, {});
    const sourcePath = path.join(packRoot, 'sprites/braid/front-climb-teen.png');
    writeSheetPng(sourcePath, 'climb', '#aa5500');

    const first = expectSuccess(await syncLinkedAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));
    const activeBaseline = loadActiveAssetPackBaseline({
      runtime: fixture.runtime,
      workspace: fixture.workspace,
    });
    expect(activeBaseline.catalog.byItemId.get('braid')?.layer_1?.teen).toBe('hair/braid/');
    expect(activeBaseline.definitionDigests.get('braid')).toBe(digests.definition);
    expect(activeBaseline.creditDigests.get('braid')).toBe(digests.credit);

    writeSheetPng(sourcePath, 'climb', '#3355aa');
    const second = expectSuccess(await syncLinkedAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(second.linked.contentDigest).not.toBe(first.linked.contentDigest);
    expect(readFileSync(path.join(
      fixture.workspace.outputRoot,
      'spritesheets/hair/braid/front/climb/dark_brown.png',
    ))).toEqual(readFileSync(sourcePath));
  });

  it('rejects true conflicts across linked packs without changing the published state', async () => {
    const fixture = createWorkspaceFixture();
    const digests = baselineDigests(fixture);
    const childRoot = path.join(fixture.workspace.packsRoot, 'acme.child-climb');
    const conflictRoot = path.join(fixture.workspace.packsRoot, 'charlie.child-climb');
    const child = extendItemSource({
      packId: 'acme.child-climb',
      displayName: 'Child Climb',
      definitionDigest: digests.definition,
      creditDigest: digests.credit,
      layer: 'layer_1',
      bodyTypes: ['teen'],
      destinationPath: 'spritesheets/hair/braid/front/climb/dark_brown.png',
      sourcePath: 'sprites/braid/front-climb-teen.png',
    });
    const conflict = extendItemSource({
      packId: 'charlie.child-climb',
      displayName: 'Other Child Climb',
      definitionDigest: digests.definition,
      creditDigest: digests.credit,
      layer: 'layer_1',
      bodyTypes: ['teen'],
      destinationPath: 'spritesheets/hair/braid/front-alt/climb/dark_brown.png',
      sourcePath: 'sprites/braid/alternate-teen.png',
    });
    writePack(childRoot, child, {});
    writePack(conflictRoot, conflict, {});
    writeSheetPng(path.join(childRoot, 'sprites/braid/front-climb-teen.png'), 'climb', '#aa5500');
    writeSheetPng(path.join(conflictRoot, 'sprites/braid/alternate-teen.png'), 'climb', '#3355aa');

    expectSuccess(await syncLinkedAssetPack({
      packDirectory: childRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));
    const beforeOutput = snapshotTree(fixture.workspace.outputRoot);
    const beforeRegistry = snapshotFile(fixture.workspace.registryPath);

    const failed = expectFailure(await syncLinkedAssetPack({
      packDirectory: conflictRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(diagnosticCodes(failed.diagnostics)).toContain('asset_path_conflict');
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(beforeOutput);
    expect(snapshotFile(fixture.workspace.registryPath)).toEqual(beforeRegistry);
  });

  it('refuses to sync a linked pack with an unacknowledged warning', async () => {
    const fixture = createWorkspaceFixture();
    const digests = baselineDigests(fixture);
    const packRoot = path.join(fixture.workspace.packsRoot, 'acme.audit-braid');
    const source = extendItemSource({
      packId: 'acme.audit-braid',
      displayName: 'Audit Braid',
      definitionDigest: digests.definition,
      creditDigest: digests.credit,
      layer: 'layer_1',
      bodyTypes: ['female'],
      destinationPath: 'spritesheets/hair/braid/front/climb/dark_brown.png',
      evidence: 'audit-inferred',
      sourcePath: 'sprites/braid/climb-female.png',
    });
    writePack(packRoot, source, {});
    writeSheetPng(path.join(packRoot, 'sprites/braid/climb-female.png'), 'climb', '#aa5500');
    const beforeOutput = snapshotTree(fixture.workspace.outputRoot);

    const failed = expectFailure(await syncLinkedAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(diagnosticCodes(failed.diagnostics)).toContain('asset_path_inferred');
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(beforeOutput);
    expect(existsSync(fixture.workspace.registryPath)).toBe(false);
  });

  it('refuses to sync into an unowned output root', async () => {
    const fixture = createWorkspaceFixture();
    const packRoot = path.join(fixture.workspace.packsRoot, 'acme.wind-braid');
    writeNewItemPack(packRoot, {
      packId: 'acme.wind-braid',
      displayName: 'Wind Braid',
      localId: 'wind-braid',
      color: '#aa5500',
    });
    unlinkSync(outputMarkerPath(fixture.workspace));

    const failed = expectFailure(await syncLinkedAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(diagnosticCodes(failed.diagnostics)).toContain('asset_output_root_unowned');
  });

  it('refuses to sync when the registry workspace marker mismatches the managed output marker', async () => {
    const fixture = createWorkspaceFixture();
    const firstRoot = path.join(fixture.workspace.packsRoot, 'acme.wind-braid');
    const secondRoot = path.join(fixture.workspace.packsRoot, 'bravo.ribbon-braid');
    writeNewItemPack(firstRoot, {
      packId: 'acme.wind-braid',
      displayName: 'Wind Braid',
      localId: 'wind-braid',
      color: '#aa5500',
    });
    writeNewItemPack(secondRoot, {
      packId: 'bravo.ribbon-braid',
      displayName: 'Ribbon Braid',
      localId: 'ribbon-braid',
      color: '#00aa55',
    });

    expectSuccess(await syncLinkedAssetPack({
      packDirectory: firstRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));
    const registry = readRegistry(fixture.workspace);
    writeJson(fixture.workspace.registryPath, {
      ...registry,
      workspaceId: 'different-workspace-id',
    });
    const beforeOutput = snapshotTree(fixture.workspace.outputRoot);
    const beforeRegistry = snapshotFile(fixture.workspace.registryPath);

    const failed = expectFailure(await syncLinkedAssetPack({
      packDirectory: secondRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(diagnosticCodes(failed.diagnostics)).toContain('asset_output_root_unowned');
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(beforeOutput);
    expect(snapshotFile(fixture.workspace.registryPath)).toEqual(beforeRegistry);
  });

  it('refuses registry generated digests that do not exactly cover owned output paths', async () => {
    const fixture = createWorkspaceFixture();
    const packRoot = path.join(fixture.workspace.packsRoot, 'acme.wind-braid');
    writeNewItemPack(packRoot, {
      packId: 'acme.wind-braid',
      displayName: 'Wind Braid',
      localId: 'wind-braid',
      color: '#aa5500',
    });

    expectSuccess(await syncLinkedAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));
    const registry = readRegistry(fixture.workspace);
    writeJson(fixture.workspace.registryPath, {
      ...registry,
      generatedDigests: {
        ...registry.generatedDigests,
        'rogue.txt': `sha256:${'0'.repeat(64)}`,
      },
    });
    const beforeOutput = snapshotTree(fixture.workspace.outputRoot);
    const beforeRegistry = snapshotFile(fixture.workspace.registryPath);

    const failed = expectFailure(await syncLinkedAssetPack({
      packDirectory: packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(diagnosticCodes(failed.diagnostics)).toContain('asset_digest_mismatch');
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(beforeOutput);
    expect(snapshotFile(fixture.workspace.registryPath)).toEqual(beforeRegistry);
  });

  it('refuses to sync when managed output is non-empty but the registry is missing', async () => {
    const fixture = createWorkspaceFixture();
    const firstRoot = path.join(fixture.workspace.packsRoot, 'acme.wind-braid');
    const secondRoot = path.join(fixture.workspace.packsRoot, 'bravo.ribbon-braid');
    writeNewItemPack(firstRoot, {
      packId: 'acme.wind-braid',
      displayName: 'Wind Braid',
      localId: 'wind-braid',
      color: '#aa5500',
    });
    writeNewItemPack(secondRoot, {
      packId: 'bravo.ribbon-braid',
      displayName: 'Ribbon Braid',
      localId: 'ribbon-braid',
      color: '#00aa55',
    });

    expectSuccess(await syncLinkedAssetPack({
      packDirectory: firstRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));
    rmSync(fixture.workspace.registryPath, { force: true });
    const beforeOutput = snapshotTree(fixture.workspace.outputRoot);
    const beforeRegistry = snapshotFile(fixture.workspace.registryPath);

    const failed = expectFailure(await syncLinkedAssetPack({
      packDirectory: secondRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(diagnosticCodes(failed.diagnostics)).toContain('asset_output_root_unowned');
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(beforeOutput);
    expect(snapshotFile(fixture.workspace.registryPath)).toEqual(beforeRegistry);
  });

  it('refuses to sync when managed output contains stray files outside the registry-owned generation', async () => {
    const fixture = createWorkspaceFixture();
    const firstRoot = path.join(fixture.workspace.packsRoot, 'acme.wind-braid');
    const secondRoot = path.join(fixture.workspace.packsRoot, 'bravo.ribbon-braid');
    writeNewItemPack(firstRoot, {
      packId: 'acme.wind-braid',
      displayName: 'Wind Braid',
      localId: 'wind-braid',
      color: '#aa5500',
    });
    writeNewItemPack(secondRoot, {
      packId: 'bravo.ribbon-braid',
      displayName: 'Ribbon Braid',
      localId: 'ribbon-braid',
      color: '#00aa55',
    });

    expectSuccess(await syncLinkedAssetPack({
      packDirectory: firstRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));
    writeFileSync(path.join(fixture.workspace.outputRoot, 'rogue.txt'), 'tampered\n');
    const beforeOutput = snapshotTree(fixture.workspace.outputRoot);
    const beforeRegistry = snapshotFile(fixture.workspace.registryPath);

    const failed = expectFailure(await syncLinkedAssetPack({
      packDirectory: secondRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(diagnosticCodes(failed.diagnostics)).toContain('asset_output_root_unowned');
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(beforeOutput);
    expect(snapshotFile(fixture.workspace.registryPath)).toEqual(beforeRegistry);
  });

  it('refuses to sync when an existing managed generated file has been modified', async () => {
    const fixture = createWorkspaceFixture();
    const firstRoot = path.join(fixture.workspace.packsRoot, 'acme.wind-braid');
    const secondRoot = path.join(fixture.workspace.packsRoot, 'bravo.ribbon-braid');
    writeNewItemPack(firstRoot, {
      packId: 'acme.wind-braid',
      displayName: 'Wind Braid',
      localId: 'wind-braid',
      color: '#aa5500',
    });
    writeNewItemPack(secondRoot, {
      packId: 'bravo.ribbon-braid',
      displayName: 'Ribbon Braid',
      localId: 'ribbon-braid',
      color: '#00aa55',
    });

    expectSuccess(await syncLinkedAssetPack({
      packDirectory: firstRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));
    writeFileSync(
      path.join(
        fixture.workspace.outputRoot,
        'spritesheets/packages/acme.wind-braid/wind-braid/foreground/male-female/walk.png',
      ),
      'not-a-real-png\n',
    );
    const beforeOutput = snapshotTree(fixture.workspace.outputRoot);
    const beforeRegistry = snapshotFile(fixture.workspace.registryPath);

    const failed = expectFailure(await syncLinkedAssetPack({
      packDirectory: secondRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(diagnosticCodes(failed.diagnostics)).toContain('asset_digest_mismatch');
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(beforeOutput);
    expect(snapshotFile(fixture.workspace.registryPath)).toEqual(beforeRegistry);
  });

  it('rolls back every injected publish write or rename failure and preserves the previous bytes', async () => {
    const discoveryFixture = await createRollbackFixture();
    const discovery = createFileOpsRecorder();
    const discoveryResult = await syncLinkedAssetPack({
      packDirectory: discoveryFixture.packRoot,
      workspace: discoveryFixture.fixture.workspace,
      runtime: discoveryFixture.fixture.runtime,
      fileOps: discovery.fileOps,
    });
    expectSuccess(discoveryResult);
    const actionCount = discovery.actions.length;
    expect(actionCount).toBeGreaterThan(0);

    for (let failAt = 1; failAt <= actionCount; failAt += 1) {
      const scenario = await createRollbackFixture();
      const failing = createFileOpsRecorder({ failAt });

      const failed = expectFailure(await syncLinkedAssetPack({
        packDirectory: scenario.packRoot,
        workspace: scenario.fixture.workspace,
        runtime: scenario.fixture.runtime,
        fileOps: failing.fileOps,
      }));

      expect(diagnosticCodes(failed.diagnostics)).toContain('asset_publish_failed');
      expect(snapshotTree(scenario.fixture.workspace.outputRoot)).toEqual(scenario.initialOutput);
      expect(snapshotFile(scenario.fixture.workspace.registryPath)).toEqual(scenario.initialRegistry);
      expect(snapshotTree(scenario.packRoot)).toEqual(scenario.initialSource);
    }
  });
});
