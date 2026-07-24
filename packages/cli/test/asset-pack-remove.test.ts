import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import {
  ASSET_PACK_SCHEMA,
  standardAnimationGeometry,
  type AnimationName,
  type AssetPackSource,
  type ItemDefinition,
} from '@lpc-toolkit/core';
import { afterEach, describe, expect, it } from 'vitest';
import { loadAssetPackFiles } from '../src/asset-pack-files.js';
import {
  listAssetPacks,
  removeAssetPack,
  type AssetPackListResult,
  type AssetPackRemoveResult,
} from '../src/asset-pack-remove.js';
import {
  ASSET_WORKSPACE_REGISTRY_SCHEMA,
  assetPackRegistryBytes,
  type AssetPackRegistryDocument,
  type AssetPackRegistryEntry,
  type InstalledAssetPackRegistryEntry,
  type LinkedAssetPackRegistryEntry,
} from '../src/asset-pack-registry.js';
import { syncLinkedAssetPack } from '../src/asset-pack-sync.js';
import type { AssetTransactionFileOps } from '../src/asset-pack-transaction.js';
import { loadActiveAssetPackBaseline } from '../src/asset-pack-validation.js';
import {
  ASSET_OUTPUT_MARKER_SCHEMA,
  initializeAssetWorkspace,
  type AssetWorkspace,
} from '../src/asset-workspace.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { createRuntimeContext } from '../src/context.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

const temporaryDirectories: string[] = [];

const REAL_FILE_OPS: AssetTransactionFileOps = {
  mkdirSync,
  writeFileSync,
  readFileSync,
  renameSync,
  rmSync,
  openSync,
  fsyncSync,
  closeSync,
  fstatSync,
  linkSync,
};

interface Fixture {
  readonly root: string;
  readonly assetsRoot: string;
  readonly upstreamRoot: string;
  readonly cacheRoot: string;
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

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function sha256(bytes: Buffer | string): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
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

function pngBytes(color: string, animation: AnimationName = 'walk'): Buffer {
  const bounds = geometryBounds(animation);
  const canvas = createCanvas(bounds.width, bounds.height);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, bounds.width, bounds.height);
  return canvas.toBuffer('image/png');
}

function extensionSource(options: {
  readonly packId: string;
  readonly displayName: string;
  readonly definitionDigest: string;
  readonly creditDigest: string;
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly bodyTypes?: readonly ('male' | 'female')[];
}): AssetPackSource {
  return {
    schema: ASSET_PACK_SCHEMA,
    id: options.packId,
    version: '1.0.0',
    displayName: options.displayName,
    credits: {
      authors: [`${options.displayName} Artist`],
      licenses: ['CC-BY-SA 4.0'],
      urls: [`https://example.com/${options.packId}`],
      notes: `${options.displayName} contribution.`,
    },
    assets: [{
      kind: 'extend-item',
      itemId: 'braid',
      baseDefinitionDigest: options.definitionDigest,
      baseCreditDigest: options.creditDigest,
      addAnimations: [{
        animation: 'climb',
        layers: [{
          layer: 'layer_1',
          bodyTypes: options.bodyTypes ?? ['male'],
          source: options.sourcePath,
          destination: {
            path: options.destinationPath,
            evidence: 'artist-specified',
            accepted: true,
          },
        }],
      }],
    }],
  };
}

function baseDefinition(): ItemDefinition {
  return {
    name: 'Braid',
    type_name: 'hair',
    animations: ['walk'],
    credits: [{
      file: 'hair/braid/walk',
      authors: ['Base Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.com/base'],
      notes: 'Base fixture.',
    }],
    layer_1: {
      zPos: 50,
      male: 'hair/braid/',
      female: 'hair/braid/',
    },
  };
}

function createFixture(): Fixture {
  const root = createDirectory('lpc-asset-pack-remove-workspace-');
  const assetsRoot = path.join(root, 'base-assets');
  mkdirSync(path.join(assetsRoot, 'sheet_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'palette_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'spritesheets'), { recursive: true });
  writeJson(path.join(assetsRoot, 'sheet_definitions/hair/braid.json'), baseDefinition());
  writeFileSync(path.join(assetsRoot, 'CREDITS.csv'), 'filename,notes,authors,licenses,urls\n');
  writeFileSync(path.join(assetsRoot, 'sentinel.txt'), 'base sentinel\n');

  const upstreamRoot = path.join(root, 'upstream');
  mkdirSync(upstreamRoot);
  writeFileSync(path.join(upstreamRoot, 'sentinel.txt'), 'upstream sentinel\n');
  const cacheRoot = createDirectory('lpc-asset-pack-remove-cache-');
  writeFileSync(path.join(cacheRoot, 'sentinel.txt'), 'cache sentinel\n');

  const workspace = initializeAssetWorkspace(root);
  const store = createDirectoryAssetStore(assetsRoot);
  const runtime: RuntimeAssets = {
    context: createRuntimeContext({
      cwd: root,
      assetsRoot,
      customAssetsRoot: workspace.outputRoot,
      spritesheetsBaseUrl: store.baseUrl,
    }),
    store,
    source: 'working-directory',
  };
  return { root, assetsRoot, upstreamRoot, cacheRoot, workspace, runtime };
}

function packSource(options: {
  readonly packId: string;
  readonly version?: string;
  readonly displayName: string;
  readonly localId: string;
}): AssetPackSource {
  return {
    schema: ASSET_PACK_SCHEMA,
    id: options.packId,
    version: options.version ?? '1.0.0',
    displayName: options.displayName,
    credits: {
      authors: [`${options.displayName} Artist`],
      licenses: ['CC-BY-SA 4.0'],
      urls: [`https://example.com/${options.packId}`],
      notes: `${options.displayName} contribution.`,
    },
    assets: [{
      kind: 'new-item',
      localId: options.localId,
      displayName: options.displayName,
      typeName: 'hair',
      bodyTypes: ['male', 'female'],
      animations: ['walk'],
      layers: [{
        id: 'foreground',
        zPos: 120,
        sprites: [{
          animation: 'walk',
          source: `sprites/${options.localId}/foreground/walk.png`,
        }],
      }],
    }],
  };
}

function writePack(
  fixture: Fixture,
  options: {
    readonly packId: string;
    readonly version?: string;
    readonly displayName: string;
    readonly localId: string;
    readonly color: string;
  },
): string {
  const root = path.join(fixture.workspace.packsRoot, options.packId);
  const source = packSource(options);
  writeJson(path.join(root, 'asset-pack.json'), source);
  const spritePath = path.join(root, `sprites/${options.localId}/foreground/walk.png`);
  mkdirSync(path.dirname(spritePath), { recursive: true });
  writeFileSync(spritePath, pngBytes(options.color));
  return root;
}

async function linkPack(
  fixture: Fixture,
  options: {
    readonly packId: string;
    readonly version?: string;
    readonly displayName: string;
    readonly localId: string;
    readonly color: string;
  },
): Promise<string> {
  const packRoot = writePack(fixture, options);
  const result = await syncLinkedAssetPack({
    packDirectory: packRoot,
    workspace: fixture.workspace,
    runtime: fixture.runtime,
  });
  if (!result.ok) {
    throw new Error(result.diagnostics.map((entry) => `${entry.code}:${entry.message}`).join(' | '));
  }
  return packRoot;
}

async function linkExtensionPack(
  fixture: Fixture,
  options: {
    readonly packId: string;
    readonly displayName: string;
    readonly sourcePath: string;
    readonly destinationPath: string;
    readonly color: string;
    readonly bodyTypes?: readonly ('male' | 'female')[];
  },
): Promise<string> {
  const baseline = loadActiveAssetPackBaseline({
    runtime: fixture.runtime,
    workspace: fixture.workspace,
  });
  const definitionDigest = baseline.definitionDigests.get('braid');
  const creditDigest = baseline.creditDigests.get('braid');
  if (!definitionDigest || !creditDigest) throw new Error('Missing braid baseline digests.');
  const root = path.join(fixture.workspace.packsRoot, options.packId);
  writeJson(path.join(root, 'asset-pack.json'), extensionSource({
    ...options,
    definitionDigest,
    creditDigest,
  }));
  const spritePath = path.join(root, ...options.sourcePath.split('/'));
  mkdirSync(path.dirname(spritePath), { recursive: true });
  writeFileSync(spritePath, pngBytes(options.color, 'climb'));
  const result = await syncLinkedAssetPack({
    packDirectory: root,
    workspace: fixture.workspace,
    runtime: fixture.runtime,
  });
  if (!result.ok) {
    throw new Error(result.diagnostics.map((entry) => `${entry.code}:${entry.message}`).join(' | '));
  }
  return root;
}

function readRegistry(workspace: AssetWorkspace): AssetPackRegistryDocument {
  return readJson<AssetPackRegistryDocument>(workspace.registryPath);
}

async function refreshLinkedRegistrySnapshot(workspace: AssetWorkspace, packId: string): Promise<void> {
  const document = readRegistry(workspace);
  const entry = document.entries.find(
    (candidate): candidate is LinkedAssetPackRegistryEntry =>
      candidate.kind === 'linked' && candidate.packId === packId,
  );
  if (!entry) throw new Error(`Missing linked registry entry: ${packId}`);
  const loaded = await loadAssetPackFiles(entry.sourceDirectory);
  if (!loaded.ok) {
    throw new Error(loaded.diagnostics.map((diagnostic) => diagnostic.message).join(' | '));
  }
  const entries = document.entries.map((candidate): AssetPackRegistryEntry =>
    candidate.packId === packId
      ? {
        ...entry,
        contentDigest: loaded.contentDigest,
        sourceDigests: Object.fromEntries(
          [...loaded.sourceDigests].sort(([left], [right]) => left.localeCompare(right)),
        ),
      }
      : candidate);
  writeFileSync(workspace.registryPath, assetPackRegistryBytes({ ...document, entries }));
}

function convertLinkedToInstalled(
  workspace: AssetWorkspace,
  packId: string,
): InstalledAssetPackRegistryEntry {
  const document = readRegistry(workspace);
  const linked = document.entries.find(
    (entry): entry is LinkedAssetPackRegistryEntry =>
      entry.kind === 'linked' && entry.packId === packId,
  );
  if (!linked) throw new Error(`Missing linked fixture entry: ${packId}`);
  const archiveDigest = sha256(`archive:${linked.packId}:${linked.version}`);
  const installedDirectory = path.join(
    workspace.installedRoot,
    linked.packId,
    linked.version,
    archiveDigest.slice('sha256:'.length),
  );
  const manifestBytes = readFileSync(path.join(linked.sourceDirectory, 'asset-pack.json'));
  const payloadDigests: Array<readonly [string, string]> = [
    ['asset-pack.json', sha256(manifestBytes)],
  ];
  writeJson(path.join(installedDirectory, 'asset-pack.json'), JSON.parse(manifestBytes.toString('utf8')));
  for (const [sourcePath, sourceDigest] of Object.entries(linked.sourceDigests)) {
    const bytes = readFileSync(path.join(linked.sourceDirectory, ...sourcePath.split('/')));
    const target = path.join(installedDirectory, ...sourcePath.split('/'));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    payloadDigests.push([sourcePath, sourceDigest]);
  }
  writeJson(path.join(installedDirectory, 'install-receipt.json'), {
    schema: 'lpc-toolkit.asset-pack-install-receipt.v1',
    workspaceId: document.workspaceId,
    packId: linked.packId,
    version: linked.version,
    archiveDigest,
    contentDigest: linked.contentDigest,
    installedAt: '2026-07-22T00:00:00.000Z',
    payloadDigests: Object.fromEntries(
      payloadDigests.sort(([left], [right]) => left.localeCompare(right)),
    ),
  });
  const { sourceDirectory: _sourceDirectory, ...base } = linked;
  const installed: InstalledAssetPackRegistryEntry = {
    ...base,
    kind: 'installed',
    installedDirectory,
    archiveDigest,
  };
  const entries = document.entries
    .map((entry): AssetPackRegistryEntry => entry.packId === packId ? installed : entry)
    .sort((left, right) => left.packId.localeCompare(right.packId));
  writeFileSync(workspace.registryPath, assetPackRegistryBytes({ ...document, entries }));
  return installed;
}

function snapshotTree(root: string): Readonly<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  if (!existsSync(root)) return snapshot;
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(target);
      } else {
        snapshot[path.relative(root, target).split(path.sep).join('/')] =
          readFileSync(target).toString('base64');
      }
    }
  };
  visit(root);
  return snapshot;
}

function expectListSuccess(result: AssetPackListResult): Extract<AssetPackListResult, { ok: true }> {
  if (!result.ok) {
    throw new Error(result.diagnostics.map((entry) => `${entry.code}:${entry.message}`).join(' | '));
  }
  return result;
}

function expectRemoveSuccess(
  result: AssetPackRemoveResult,
): Extract<AssetPackRemoveResult, { ok: true }> {
  if (!result.ok) {
    throw new Error(result.diagnostics.map((entry) => `${entry.code}:${entry.message}`).join(' | '));
  }
  return result;
}

function crashingFileOps(
  workspace: AssetWorkspace,
  crashPoint: 'before-registry' | 'after-registry',
): AssetTransactionFileOps {
  let crashed = false;
  return {
    ...REAL_FILE_OPS,
    afterMutationSync(operation, targets, boundary) {
      if (crashed || operation !== 'rename' || boundary !== 'fsync') return;
      const destination = targets[1];
      if (
        (crashPoint === 'before-registry' && destination === workspace.outputRoot)
        || (crashPoint === 'after-registry' && destination === workspace.registryPath)
      ) {
        crashed = true;
        throw new Error(`injected ${crashPoint} crash`);
      }
    },
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('listAssetPacks', () => {
  it('returns the approved synchronous result without runtime preparation', () => {
    const fixture = createFixture();

    const directResult: AssetPackListResult = listAssetPacks({ workspace: fixture.workspace });
    const result = expectListSuccess(directResult);

    expect(result).toEqual({ ok: true, recovery: 'none', entries: [] });
    expect(existsSync(fixture.workspace.registryPath)).toBe(false);
  });

  it('lists a linked-only registry with its artist source path', async () => {
    const fixture = createFixture();
    const sourcePath = await linkPack(fixture, {
      packId: 'alpha.linked',
      version: '1.2.3',
      displayName: 'Alpha Linked',
      localId: 'alpha-hair',
      color: '#aa3300',
    });
    const entry = readRegistry(fixture.workspace).entries[0]!;

    const result = expectListSuccess(listAssetPacks({ workspace: fixture.workspace }));

    expect(result.entries).toEqual([{
      packId: 'alpha.linked',
      version: '1.2.3',
      displayName: 'Alpha Linked',
      kind: 'linked',
      sourcePath,
      contentDigest: entry.contentDigest,
    }]);
  });

  it('lists an installed-only registry with archive and installed paths', async () => {
    const fixture = createFixture();
    await linkPack(fixture, {
      packId: 'alpha.installed',
      version: '2.0.0',
      displayName: 'Alpha Installed',
      localId: 'alpha-hair',
      color: '#0033aa',
    });
    const installed = convertLinkedToInstalled(fixture.workspace, 'alpha.installed');

    const result = expectListSuccess(listAssetPacks({ workspace: fixture.workspace }));

    expect(result.entries).toEqual([{
      packId: 'alpha.installed',
      version: '2.0.0',
      displayName: 'Alpha Installed',
      kind: 'installed',
      sourcePath: installed.installedDirectory,
      contentDigest: installed.contentDigest,
      archiveDigest: installed.archiveDigest,
    }]);
  });

  it('lists linked and installed registry entries in stable pack-ID order', async () => {
    const fixture = createFixture();
    const zuluSource = await linkPack(fixture, {
      packId: 'zulu.linked',
      version: '2.3.4',
      displayName: 'Zulu Linked',
      localId: 'zulu-hair',
      color: '#aa3300',
    });
    await linkPack(fixture, {
      packId: 'alpha.installed',
      version: '1.2.0',
      displayName: 'Alpha Installed',
      localId: 'alpha-hair',
      color: '#0033aa',
    });
    const installed = convertLinkedToInstalled(fixture.workspace, 'alpha.installed');
    const registry = readRegistry(fixture.workspace);

    const result = expectListSuccess(listAssetPacks({ workspace: fixture.workspace }));

    expect(result.recovery).toBe('none');
    expect(result.entries).toEqual([
      {
        packId: 'alpha.installed',
        version: '1.2.0',
        displayName: 'Alpha Installed',
        kind: 'installed',
        sourcePath: installed.installedDirectory,
        contentDigest: installed.contentDigest,
        archiveDigest: installed.archiveDigest,
      },
      {
        packId: 'zulu.linked',
        version: '2.3.4',
        displayName: 'Zulu Linked',
        kind: 'linked',
        sourcePath: zuluSource,
        contentDigest: registry.entries.find((entry) => entry.packId === 'zulu.linked')!.contentDigest,
      },
    ]);
  });

  it('fails closed on a malformed registry', () => {
    const fixture = createFixture();
    writeJson(fixture.workspace.registryPath, {
      schema: ASSET_WORKSPACE_REGISTRY_SCHEMA,
      workspaceId: 'wrong-workspace',
      entries: [],
      generatedDigests: {},
      compileDigest: `sha256:${'0'.repeat(64)}`,
    });

    const result = listAssetPacks({ workspace: fixture.workspace });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected strict registry failure.');
    expect(result.diagnostics.map((entry) => entry.code)).toContain('asset_output_root_unowned');
  });

  it('fails closed on a valid registry reached through an external symbolic link', async () => {
    const fixture = createFixture();
    await linkPack(fixture, {
      packId: 'alpha.linked-registry',
      version: '1.0.0',
      displayName: 'Alpha Linked Registry',
      localId: 'alpha-hair',
      color: '#aa3300',
    });
    const outside = createDirectory('lpc-asset-pack-list-registry-link-');
    const outsideRegistry = path.join(outside, 'registry.json');
    renameSync(fixture.workspace.registryPath, outsideRegistry);
    symlinkSync(outsideRegistry, fixture.workspace.registryPath, 'file');

    const result = listAssetPacks({ workspace: fixture.workspace });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{
        code: 'asset_digest_mismatch',
        message: expect.stringMatching(/regular file|symbolic link/iu),
        path: fixture.workspace.registryPath,
      }],
    });
  });

  it('holds the transaction claim through the complete registry projection', async () => {
    const fixture = createFixture();
    await linkPack(fixture, {
      packId: 'alpha.linked',
      displayName: 'Alpha Linked',
      localId: 'alpha-hair',
      color: '#aa3300',
    });
    const outputBefore = snapshotTree(fixture.workspace.outputRoot);
    const registryBefore = readFileSync(fixture.workspace.registryPath);
    let concurrentRemoval: ReturnType<typeof removeAssetPack> | undefined;

    const listed = listAssetPacks({
      workspace: fixture.workspace,
      fileOps: {
        ...REAL_FILE_OPS,
        afterClaimAcquiredSync() {
          concurrentRemoval = removeAssetPack({
            packId: 'alpha.linked',
            workspace: fixture.workspace,
            runtime: fixture.runtime,
          });
        },
      },
    });

    expect(expectListSuccess(listed).entries.map((entry) => entry.packId))
      .toEqual(['alpha.linked']);
    expect(concurrentRemoval).toBeDefined();
    const blocked = await concurrentRemoval!;
    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error('Expected concurrent lifecycle claim conflict.');
    expect(blocked.diagnostics.map((entry) => entry.code)).toEqual(['asset_publish_failed']);
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(outputBefore);
    expect(readFileSync(fixture.workspace.registryPath)).toEqual(registryBefore);
  });
});

describe('removeAssetPack', () => {
  it('removes a linked pack from mixed state while preserving artist bytes and remaining credits', async () => {
    const fixture = createFixture();
    const linkedRoot = await linkPack(fixture, {
      packId: 'alpha.linked',
      displayName: 'Alpha Linked',
      localId: 'alpha-hair',
      color: '#aa3300',
    });
    await linkPack(fixture, {
      packId: 'bravo.installed',
      displayName: 'Bravo Installed',
      localId: 'bravo-hair',
      color: '#0033aa',
    });
    const installed = convertLinkedToInstalled(fixture.workspace, 'bravo.installed');
    const artistBefore = snapshotTree(linkedRoot);
    const installedBefore = snapshotTree(installed.installedDirectory);

    const removed = expectRemoveSuccess(await removeAssetPack({
      packId: 'alpha.linked',
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(removed).toMatchObject({
      packId: 'alpha.linked',
      removedKind: 'linked',
      remainingPackIds: ['bravo.installed'],
    });
    expect(snapshotTree(linkedRoot)).toEqual(artistBefore);
    expect(snapshotTree(installed.installedDirectory)).toEqual(installedBefore);
    expect(readFileSync(path.join(fixture.workspace.outputRoot, 'CREDITS.csv'), 'utf8'))
      .toContain('Bravo Installed Artist');
    expect(readFileSync(path.join(fixture.workspace.outputRoot, 'CREDITS.csv'), 'utf8'))
      .not.toContain('Alpha Linked Artist');
    expect(Object.keys(readRegistry(fixture.workspace).generatedDigests)).toHaveLength(
      removed.generatedFileCount,
    );

    const repeated = await removeAssetPack({
      packId: 'alpha.linked',
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    });
    expect(repeated.ok).toBe(false);
    if (repeated.ok) throw new Error('Expected repeated removal failure.');
    expect(repeated.diagnostics.map((entry) => entry.code)).toEqual(['asset_pack_not_installed']);
    expect(snapshotTree(linkedRoot)).toEqual(artistBefore);
  });

  it('rejects a true retained compiler conflict without mutating active state', async () => {
    const fixture = createFixture();
    await linkPack(fixture, {
      packId: 'alpha.remove',
      displayName: 'Alpha Remove',
      localId: 'alpha-hair',
      color: '#aa3300',
    });
    await linkExtensionPack(fixture, {
      packId: 'bravo.retained',
      displayName: 'Bravo Retained',
      sourcePath: 'sprites/bravo/climb.png',
      destinationPath: 'spritesheets/hair/braid/zz-bravo/climb.png',
      color: '#0033aa',
    });
    const conflictingRoot = await linkExtensionPack(fixture, {
      packId: 'charlie.retained',
      displayName: 'Charlie Retained',
      sourcePath: 'sprites/charlie/climb.png',
      destinationPath: 'spritesheets/hair/braid/zz-charlie/climb.png',
      color: '#00aa33',
      bodyTypes: ['female'],
    });
    const baseline = loadActiveAssetPackBaseline({
      runtime: fixture.runtime,
      workspace: fixture.workspace,
    });
    writeJson(path.join(conflictingRoot, 'asset-pack.json'), extensionSource({
      packId: 'charlie.retained',
      displayName: 'Charlie Retained',
      definitionDigest: baseline.definitionDigests.get('braid')!,
      creditDigest: baseline.creditDigests.get('braid')!,
      sourcePath: 'sprites/charlie/climb.png',
      destinationPath: 'spritesheets/hair/braid/zz-bravo/climb.png',
    }));
    await refreshLinkedRegistrySnapshot(fixture.workspace, 'charlie.retained');
    const outputBefore = snapshotTree(fixture.workspace.outputRoot);
    const registryBefore = readFileSync(fixture.workspace.registryPath);

    const failed = await removeAssetPack({
      packId: 'alpha.remove',
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    });

    expect(failed.ok).toBe(false);
    if (failed.ok) throw new Error('Expected retained compiler conflict.');
    expect(failed.diagnostics.map((entry) => entry.code)).toContain('asset_path_conflict');
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(outputBefore);
    expect(readFileSync(fixture.workspace.registryPath)).toEqual(registryBefore);
  });

  it('removes one installed pack after registry publication and preserves a registered near-name sibling', async () => {
    const fixture = createFixture();
    await linkPack(fixture, {
      packId: 'alpha.pack',
      displayName: 'Alpha Pack',
      localId: 'alpha-hair',
      color: '#aa3300',
    });
    await linkPack(fixture, {
      packId: 'alpha.pack-extra',
      displayName: 'Alpha Pack Extra',
      localId: 'alpha-extra-hair',
      color: '#0033aa',
    });
    const removedEntry = convertLinkedToInstalled(fixture.workspace, 'alpha.pack');
    const retainedEntry = convertLinkedToInstalled(fixture.workspace, 'alpha.pack-extra');
    const retainedBefore = snapshotTree(retainedEntry.installedDirectory);
    let observedAfterRegistryPublication = false;
    const observingFileOps: AssetTransactionFileOps = {
      ...REAL_FILE_OPS,
      afterMutationSync(operation, targets, boundary) {
        if (
          observedAfterRegistryPublication
          || operation !== 'rename'
          || boundary !== 'fsync'
          || targets[1] !== fixture.workspace.registryPath
        ) return;
        observedAfterRegistryPublication = true;
        expect(readRegistry(fixture.workspace).entries.map((entry) => entry.packId))
          .toEqual(['alpha.pack-extra']);
        expect(existsSync(removedEntry.installedDirectory)).toBe(true);
        expect(snapshotTree(retainedEntry.installedDirectory)).toEqual(retainedBefore);
      },
    };

    const removed = expectRemoveSuccess(await removeAssetPack({
      packId: 'alpha.pack',
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      fileOps: observingFileOps,
    }));

    expect(removed.remainingPackIds).toEqual(['alpha.pack-extra']);
    expect(observedAfterRegistryPublication).toBe(true);
    expect(existsSync(removedEntry.installedDirectory)).toBe(false);
    expect(snapshotTree(retainedEntry.installedDirectory)).toEqual(retainedBefore);
    expect(readRegistry(fixture.workspace).entries.map((entry) => entry.packId))
      .toEqual(['alpha.pack-extra']);
  });

  it('removes the final installed pack and leaves only marker plus empty v2 registry state', async () => {
    const fixture = createFixture();
    const artistRoot = await linkPack(fixture, {
      packId: 'alpha.installed',
      displayName: 'Alpha Installed',
      localId: 'alpha-hair',
      color: '#aa3300',
    });
    const installed = convertLinkedToInstalled(fixture.workspace, 'alpha.installed');
    const siblingDirectory = path.join(fixture.workspace.installedRoot, 'unlisted-sibling');
    mkdirSync(siblingDirectory);
    writeFileSync(path.join(siblingDirectory, 'sentinel.txt'), 'installed sibling\n');
    const artistBefore = snapshotTree(artistRoot);
    const baseBefore = snapshotTree(fixture.assetsRoot);
    const cacheBefore = snapshotTree(fixture.cacheRoot);
    const upstreamBefore = snapshotTree(fixture.upstreamRoot);

    const removed = expectRemoveSuccess(await removeAssetPack({
      packId: 'alpha.installed',
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(removed).toMatchObject({
      packId: 'alpha.installed',
      removedKind: 'installed',
      remainingPackIds: [],
      generatedFileCount: 0,
    });
    expect(existsSync(installed.installedDirectory)).toBe(false);
    expect(readFileSync(path.join(siblingDirectory, 'sentinel.txt'), 'utf8'))
      .toBe('installed sibling\n');
    expect(readdirSync(fixture.workspace.outputRoot)).toEqual(['.lpc-toolkit-managed.json']);
    expect(readJson(fixture.workspace.registryPath)).toMatchObject({
      schema: ASSET_WORKSPACE_REGISTRY_SCHEMA,
      entries: [],
      generatedDigests: {},
    });
    expect(snapshotTree(artistRoot)).toEqual(artistBefore);
    expect(snapshotTree(fixture.assetsRoot)).toEqual(baseBefore);
    expect(snapshotTree(fixture.cacheRoot)).toEqual(cacheBefore);
    expect(snapshotTree(fixture.upstreamRoot)).toEqual(upstreamBefore);
    expect(readJson(path.join(fixture.workspace.outputRoot, '.lpc-toolkit-managed.json')))
      .toMatchObject({ schema: ASSET_OUTPUT_MARKER_SCHEMA });
  });

  it.each([
    ['before-registry', 'rolled-back', true] as const,
    ['after-registry', 'completed', false] as const,
  ])(
    'recovers an installed removal crash %s before listing',
    async (crashPoint, recoveryAction, installedRemains) => {
      const fixture = createFixture();
      const artistRoot = await linkPack(fixture, {
        packId: 'alpha.crash',
        displayName: 'Alpha Crash',
        localId: 'alpha-hair',
        color: '#aa3300',
      });
      const installed = convertLinkedToInstalled(fixture.workspace, 'alpha.crash');
      const installedBefore = snapshotTree(installed.installedDirectory);
      const artistBefore = snapshotTree(artistRoot);

      const interrupted = await removeAssetPack({
        packId: 'alpha.crash',
        workspace: fixture.workspace,
        runtime: fixture.runtime,
        fileOps: crashingFileOps(fixture.workspace, crashPoint),
      });
      expect(interrupted.ok).toBe(false);
      expect(existsSync(path.join(fixture.workspace.stateRoot, 'transaction.json'))).toBe(true);
      if (crashPoint === 'before-registry') {
        expect(snapshotTree(installed.installedDirectory)).toEqual(installedBefore);
      }

      const listed = expectListSuccess(listAssetPacks({ workspace: fixture.workspace }));

      expect(listed.recovery).toBe(recoveryAction);
      expect(listed.entries.map((entry) => entry.packId)).toEqual(
        installedRemains ? ['alpha.crash'] : [],
      );
      expect(existsSync(installed.installedDirectory)).toBe(installedRemains);
      expect(snapshotTree(artistRoot)).toEqual(artistBefore);
      expect(existsSync(path.join(fixture.workspace.stateRoot, 'transaction.json'))).toBe(false);
    },
  );
});
