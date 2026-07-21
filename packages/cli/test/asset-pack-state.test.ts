import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
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
  type NormalizedAssetPackReplacement,
} from '@lpc-toolkit/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assetPackRegistryBytes,
  type AssetPackRegistryDocument,
  type AssetPackRegistryEntry,
  type InstalledAssetPackRegistryEntry,
  type LinkedAssetPackRegistryEntry,
} from '../src/asset-pack-registry.js';
import { loadAssetPackFiles } from '../src/asset-pack-files.js';
import {
  prepareAssetPackDesiredState,
  type ValidatedActiveAssetPack,
} from '../src/asset-pack-state.js';
import { syncLinkedAssetPack } from '../src/asset-pack-sync.js';
import { loadActiveAssetPackBaseline } from '../src/asset-pack-validation.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { initializeAssetWorkspace, type AssetWorkspace } from '../src/asset-workspace.js';
import { createRuntimeContext } from '../src/context.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

const temporaryDirectories: string[] = [];

interface StateFixture {
  readonly root: string;
  readonly assetsRoot: string;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
}

const BASE_CREDIT = {
  file: 'hair/braid',
  authors: ['Base Artist'],
  licenses: ['GPL 3.0'],
  urls: ['https://example.com/base'],
  notes: 'Base attribution.',
} as const;

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

function pngBytes(animation: AnimationName, color: string): Buffer {
  const bounds = geometryBounds(animation);
  const canvas = createCanvas(bounds.width, bounds.height);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, bounds.width, bounds.height);
  return canvas.toBuffer('image/png');
}

function writePng(filePath: string, animation: AnimationName, color: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, pngBytes(animation, color));
}

function baseDefinition(overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    name: 'Braid',
    type_name: 'hair',
    animations: ['walk'],
    credits: [BASE_CREDIT],
    layer_1: { zPos: 50, male: 'hair/braid/', female: 'hair/braid/', teen: 'hair/braid/' },
    ...overrides,
  };
}

function createStateFixture(options: {
  readonly managedBase?: boolean;
} = {}): StateFixture {
  const root = createDirectory('lpc-asset-pack-state-');
  const assetsRoot = path.join(root, 'assets');
  if (options.managedBase) {
    writeJson(
      path.join(
        assetsRoot,
        'sheet_definitions/hair/acme.shared-pack--shared-item.json',
      ),
      baseDefinition({
        name: 'acme.shared-pack--shared-item',
        credits: [{
          file: 'packages/acme.shared-pack/shared-item/top/male-female/walk',
          authors: ['Shared Artist'],
          licenses: ['GPL 3.0'],
          urls: ['https://example.com/shared'],
          notes: 'Managed package baseline.',
        }],
        layer_1: {
          zPos: 50,
          male: 'packages/acme.shared-pack/shared-item/top/male-female/',
          female: 'packages/acme.shared-pack/shared-item/top/male-female/',
        },
      }),
    );
  } else {
    writeJson(path.join(assetsRoot, 'sheet_definitions/hair/braid.json'), baseDefinition());
  }
  mkdirSync(path.join(assetsRoot, 'palette_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'spritesheets'), { recursive: true });
  writeFileSync(
    path.join(assetsRoot, 'CREDITS.csv'),
    'filename,notes,authors,licenses,urls\n',
  );

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
  return { root, assetsRoot, workspace, runtime };
}

function packCredits(author: string): AssetPackSource['credits'] {
  return {
    authors: [author],
    licenses: ['CC-BY-SA 4.0'],
    urls: [`https://example.com/${author.toLowerCase().replaceAll(' ', '-')}`],
    notes: `${author} contribution.`,
  };
}

function newItemSource(options: {
  readonly packId: string;
  readonly version?: string;
  readonly localId: string;
  readonly author: string;
  readonly color: string;
}): AssetPackSource {
  return {
    schema: ASSET_PACK_SCHEMA,
    id: options.packId,
    version: options.version ?? '1.0.0',
    displayName: options.localId,
    credits: packCredits(options.author),
    assets: [{
      kind: 'new-item',
      localId: options.localId,
      displayName: options.localId,
      typeName: 'hair',
      bodyTypes: ['male', 'female'],
      animations: ['walk'],
      layers: [{
        id: 'foreground',
        zPos: 120,
        sprites: [{
          animation: 'walk',
          source: `sprites/${options.localId}/walk.png`,
        }],
      }],
    }],
  };
}

function extensionSource(options: {
  readonly packId: string;
  readonly itemId?: string;
  readonly author: string;
  readonly definitionDigest: string;
  readonly creditDigest: string;
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly layer?: `layer_${number}`;
  readonly bodyTypes?: readonly ('male' | 'female' | 'teen')[];
  readonly replaces?: readonly NormalizedAssetPackReplacement[];
}): AssetPackSource {
  return {
    schema: ASSET_PACK_SCHEMA,
    id: options.packId,
    version: '1.0.0',
    displayName: options.packId,
    credits: packCredits(options.author),
    ...(options.replaces ? { replaces: options.replaces } : {}),
    assets: [{
      kind: 'extend-item',
      itemId: options.itemId ?? 'braid',
      baseDefinitionDigest: options.definitionDigest,
      baseCreditDigest: options.creditDigest,
      addAnimations: [{
        animation: 'climb',
        layers: [{
          layer: options.layer ?? 'layer_1',
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

function writePack(
  root: string,
  source: AssetPackSource,
  colors: Readonly<Record<string, string>>,
): void {
  writeJson(path.join(root, 'asset-pack.json'), source);
  for (const asset of source.assets) {
    if (asset.kind === 'new-item') {
      for (const layer of asset.layers) {
        for (const sprite of layer.sprites) {
          writePng(rootPath(root, sprite.source), sprite.animation, colors[sprite.source] ?? '#aa5500');
        }
      }
      continue;
    }
    for (const animation of asset.addAnimations) {
      for (const layer of animation.layers) {
        writePng(rootPath(root, layer.source), animation.animation, colors[layer.source] ?? '#aa5500');
      }
    }
  }
}

function rootPath(root: string, relativePath: string): string {
  return path.join(root, ...relativePath.split('/'));
}

async function syncPack(
  fixture: StateFixture,
  packRoot: string,
): Promise<void> {
  const result = await syncLinkedAssetPack({
    packDirectory: packRoot,
    workspace: fixture.workspace,
    runtime: fixture.runtime,
  });
  if (!result.ok) {
    throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join(' | '));
  }
}

function workspaceId(workspace: AssetWorkspace): string {
  return readJson<{ readonly workspaceId: string }>(
    path.join(workspace.outputRoot, '.lpc-toolkit-managed.json'),
  ).workspaceId;
}

function installLinkedRegistryEntry(
  workspace: AssetWorkspace,
  packId: string,
): InstalledAssetPackRegistryEntry {
  const document = readJson<AssetPackRegistryDocument>(workspace.registryPath);
  const entry = document.entries.find(
    (candidate): candidate is LinkedAssetPackRegistryEntry =>
      candidate.kind === 'linked' && candidate.packId === packId,
  );
  if (!entry) throw new Error(`Missing linked fixture entry: ${packId}`);
  const archiveDigest = sha256(`archive:${packId}:${entry.version}`);
  const installedDirectory = path.join(
    workspace.stateRoot,
    'installed',
    entry.packId,
    entry.version,
    archiveDigest.slice('sha256:'.length),
  );
  const manifestBytes = readFileSync(path.join(entry.sourceDirectory, 'asset-pack.json'));
  writeFileAt(installedDirectory, 'asset-pack.json', manifestBytes);
  for (const sourcePath of Object.keys(entry.sourceDigests)) {
    writeFileAt(installedDirectory, sourcePath, readFileSync(rootPath(entry.sourceDirectory, sourcePath)));
  }
  const payloadDigests = Object.fromEntries(
    [
      ['asset-pack.json', sha256(manifestBytes)] as const,
      ...Object.entries(entry.sourceDigests),
    ].sort(([left], [right]) => left.localeCompare(right)),
  );
  writeJson(path.join(installedDirectory, 'install-receipt.json'), {
    schema: 'lpc-toolkit.asset-pack-install-receipt.v1',
    workspaceId: workspaceId(workspace),
    packId: entry.packId,
    version: entry.version,
    archiveDigest,
    contentDigest: entry.contentDigest,
    installedAt: '2026-07-22T00:00:00.000Z',
    payloadDigests,
  });
  const { sourceDirectory: _sourceDirectory, ...base } = entry;
  const installed: InstalledAssetPackRegistryEntry = {
    ...base,
    kind: 'installed',
    installedDirectory,
    archiveDigest,
  };
  const entries = document.entries
    .map((candidate): AssetPackRegistryEntry => candidate.packId === packId ? installed : candidate)
    .sort((left, right) => left.packId.localeCompare(right.packId));
  writeFileSync(workspace.registryPath, assetPackRegistryBytes({ ...document, entries }));
  return installed;
}

function writeFileAt(root: string, relativePath: string, bytes: Buffer): void {
  const target = rootPath(root, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
}

async function linkedCandidate(
  _fixture: StateFixture,
  packRoot: string,
): Promise<ValidatedActiveAssetPack> {
  const loaded = loadAssetPackFiles(packRoot);
  if (!loaded.ok) throw new Error(loaded.diagnostics.map((diagnostic) => diagnostic.message).join(' | '));
  return {
    kind: 'linked',
    sourceDirectory: path.resolve(packRoot),
    loaded,
    diagnostics: [],
  };
}

function outputSnapshot(files: ReadonlyMap<string, Buffer>): Readonly<Record<string, string>> {
  return Object.fromEntries(
    [...files.entries()]
      .filter(([logicalPath]) => logicalPath !== '.lpc-toolkit-managed.json')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([logicalPath, bytes]) => [logicalPath, bytes.toString('base64')]),
  );
}

function withoutSourceLocations(document: AssetPackRegistryDocument): unknown {
  return {
    ...document,
    workspaceId: '<workspace>',
    entries: document.entries.map((entry) => {
      if (entry.kind === 'linked') {
        return { ...entry, sourceDirectory: path.basename(entry.sourceDirectory) };
      }
      return { ...entry, installedDirectory: path.basename(entry.installedDirectory) };
    }),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('prepareAssetPackDesiredState', () => {
  it('loads mixed linked and installed state and applies exactly one deterministic mutation', async () => {
    const fixture = createStateFixture();
    const installedRoot = path.join(fixture.workspace.packsRoot, 'acme-installed');
    const linkedRoot = path.join(fixture.workspace.packsRoot, 'bravo-linked');
    writePack(installedRoot, newItemSource({
      packId: 'acme.installed', localId: 'installed-hair', author: 'Installed Artist', color: '#aa5500',
    }), {});
    writePack(linkedRoot, newItemSource({
      packId: 'bravo.linked', localId: 'linked-hair', author: 'Linked Artist', color: '#00aa55',
    }), {});
    await syncPack(fixture, installedRoot);
    await syncPack(fixture, linkedRoot);
    installLinkedRegistryEntry(fixture.workspace, 'acme.installed');
    rmSync(installedRoot, { recursive: true, force: true });

    const preserved = await prepareAssetPackDesiredState({
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      mutation: { kind: 'none' },
    });
    expect(preserved.ok).toBe(true);
    if (!preserved.ok) throw new Error(preserved.diagnostics[0]?.message);
    expect(preserved.active.map((pack) => [pack.loaded.pack.id, pack.kind])).toEqual([
      ['acme.installed', 'installed'],
      ['bravo.linked', 'linked'],
    ]);

    const installedOnly = await prepareAssetPackDesiredState({
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      mutation: { kind: 'remove', packId: 'bravo.linked' },
    });
    expect(installedOnly.ok).toBe(true);
    if (!installedOnly.ok) throw new Error(installedOnly.diagnostics[0]?.message);
    expect(installedOnly.active.map((pack) => pack.loaded.pack.id)).toEqual(['acme.installed']);
    expect([...installedOnly.outputFiles.keys()]).not.toContain(
      'sheet_definitions/hair/bravo.linked--linked-hair.json',
    );

    const replacementRoot = path.join(fixture.workspace.packsRoot, 'bravo-replacement');
    writePack(replacementRoot, newItemSource({
      packId: 'bravo.linked',
      version: '1.1.0',
      localId: 'replacement-hair',
      author: 'Replacement Artist',
      color: '#3355aa',
    }), {});
    const candidate = await linkedCandidate(fixture, replacementRoot);
    rmSync(linkedRoot, { recursive: true, force: true });
    const replaced = await prepareAssetPackDesiredState({
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      mutation: { kind: 'upsert', candidate },
    });
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) throw new Error(replaced.diagnostics[0]?.message);
    expect(replaced.active.map((pack) => [pack.loaded.pack.id, pack.loaded.pack.version])).toEqual([
      ['acme.installed', '1.0.0'],
      ['bravo.linked', '1.1.0'],
    ]);
    expect([...replaced.outputFiles.keys()]).toContain(
      'sheet_definitions/hair/bravo.linked--replacement-hair.json',
    );
    expect([...replaced.outputFiles.keys()]).not.toContain(
      'sheet_definitions/hair/bravo.linked--linked-hair.json',
    );

    const ambiguousRoot = path.join(fixture.workspace.packsRoot, 'acme-linked-replacement');
    writePack(ambiguousRoot, newItemSource({
      packId: 'acme.installed',
      version: '1.1.0',
      localId: 'ambiguous',
      author: 'Ambiguous Artist',
      color: '#663399',
    }), {});
    const ambiguous = await prepareAssetPackDesiredState({
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      mutation: { kind: 'upsert', candidate: await linkedCandidate(fixture, ambiguousRoot) },
    });
    expect(ambiguous).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_source_kind_conflict', packId: 'acme.installed' }],
    });
  });

  it('freshly verifies linked bytes and installed receipt payloads before compiling', async () => {
    const linked = createStateFixture();
    const linkedRoot = path.join(linked.workspace.packsRoot, 'acme-linked');
    const linkedSource = newItemSource({
      packId: 'acme.linked', localId: 'linked', author: 'Linked Artist', color: '#aa5500',
    });
    writePack(linkedRoot, linkedSource, {});
    await syncPack(linked, linkedRoot);
    writePng(path.join(linkedRoot, 'sprites/linked/walk.png'), 'walk', '#3355aa');

    const linkedResult = await prepareAssetPackDesiredState({
      workspace: linked.workspace,
      runtime: linked.runtime,
      mutation: { kind: 'none' },
    });
    expect(linkedResult).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_digest_mismatch', packId: 'acme.linked' }],
    });

    const installed = createStateFixture();
    const installedRoot = path.join(installed.workspace.packsRoot, 'acme-installed');
    writePack(installedRoot, newItemSource({
      packId: 'acme.installed', localId: 'installed', author: 'Installed Artist', color: '#aa5500',
    }), {});
    await syncPack(installed, installedRoot);
    const installedEntry = installLinkedRegistryEntry(installed.workspace, 'acme.installed');
    writePng(path.join(installedEntry.installedDirectory, 'sprites/installed/walk.png'), 'walk', '#3355aa');

    const installedResult = await prepareAssetPackDesiredState({
      workspace: installed.workspace,
      runtime: installed.runtime,
      mutation: { kind: 'none' },
    });
    expect(installedResult).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_digest_mismatch' }],
    });
  });

  it('materializes deterministic immutable output, v2 registry metadata, ownership, and attribution', async () => {
    const left = createStateFixture();
    const right = createStateFixture();
    for (const fixture of [left, right]) {
      writePack(
        path.join(fixture.workspace.packsRoot, 'acme-pack'),
        newItemSource({
          packId: 'acme.pack', localId: 'alpha', author: 'Alpha Artist', color: '#aa5500',
        }),
        {},
      );
      writePack(
        path.join(fixture.workspace.packsRoot, 'bravo-pack'),
        newItemSource({
          packId: 'bravo.pack', localId: 'beta', author: 'Beta Artist', color: '#00aa55',
        }),
        {},
      );
    }
    await syncPack(left, path.join(left.workspace.packsRoot, 'acme-pack'));
    await syncPack(left, path.join(left.workspace.packsRoot, 'bravo-pack'));
    await syncPack(right, path.join(right.workspace.packsRoot, 'bravo-pack'));
    await syncPack(right, path.join(right.workspace.packsRoot, 'acme-pack'));

    const leftState = await prepareAssetPackDesiredState({
      workspace: left.workspace,
      runtime: left.runtime,
      mutation: { kind: 'none' },
    });
    const rightState = await prepareAssetPackDesiredState({
      workspace: right.workspace,
      runtime: right.runtime,
      mutation: { kind: 'none' },
    });
    expect(leftState.ok).toBe(true);
    expect(rightState.ok).toBe(true);
    if (!leftState.ok || !rightState.ok) throw new Error('Expected deterministic states.');

    expect(outputSnapshot(leftState.outputFiles)).toEqual(outputSnapshot(rightState.outputFiles));
    expect(withoutSourceLocations(leftState.registry)).toEqual(withoutSourceLocations(rightState.registry));
    expect(leftState.registry.compileDigest).toBe(rightState.registry.compileDigest);
    expect(leftState.registry.entries.map((entry) => entry.packId)).toEqual([
      'acme.pack',
      'bravo.pack',
    ]);
    expect(leftState.registry.entries.every((entry) =>
      entry.generatedPaths.length === 2
      && entry.logicalDestinations.length === 1
      && entry.generatedSprites.length === 1
      && entry.generatedCredits.length === 1,
    )).toBe(true);
    expect(Object.keys(leftState.registry.generatedDigests)).toEqual(
      [...leftState.outputFiles.keys()]
        .filter((logicalPath) => logicalPath !== '.lpc-toolkit-managed.json')
        .sort((a, b) => a.localeCompare(b)),
    );
    expect(leftState.outputFiles.has('.lpc-toolkit-managed.json')).toBe(true);
    expect(leftState.registry.generatedDigests).not.toHaveProperty('.lpc-toolkit-managed.json');
    const credits = leftState.outputFiles.get('CREDITS.csv')?.toString('utf8') ?? '';
    expect(credits).toContain('Alpha Artist');
    expect(credits).toContain('Beta Artist');

    const registryBytes = assetPackRegistryBytes(leftState.registry);
    const repeated = await prepareAssetPackDesiredState({
      workspace: left.workspace,
      runtime: left.runtime,
      mutation: { kind: 'none' },
    });
    expect(repeated.ok).toBe(true);
    if (!repeated.ok) throw new Error(repeated.diagnostics[0]?.message);
    expect(assetPackRegistryBytes(repeated.registry)).toEqual(registryBytes);

    const spritePath = 'spritesheets/packages/acme.pack/alpha/foreground/male-female/walk.png';
    const captured = Buffer.from(leftState.outputFiles.get(spritePath) ?? Buffer.alloc(0));
    writePng(
      path.join(left.workspace.packsRoot, 'acme-pack/sprites/alpha/walk.png'),
      'walk',
      '#3355aa',
    );
    expect(leftState.outputFiles.get(spritePath)).toEqual(captured);
  });

  it('merges disjoint patches with attribution and rejects true conflicts and stale baselines', async () => {
    const fixture = createStateFixture();
    const baseline = loadActiveAssetPackBaseline({
      runtime: fixture.runtime,
      workspace: fixture.workspace,
    });
    const firstRoot = path.join(fixture.workspace.packsRoot, 'acme-extension');
    const secondRoot = path.join(fixture.workspace.packsRoot, 'bravo-extension');
    writePack(firstRoot, extensionSource({
      packId: 'acme.extension',
      author: 'First Artist',
      definitionDigest: baseline.definitionDigests.get('braid')!,
      creditDigest: baseline.creditDigests.get('braid')!,
      sourcePath: 'sprites/first/climb.png',
      destinationPath: 'spritesheets/hair/braid/front/climb.png',
      layer: 'layer_1',
      bodyTypes: ['male'],
    }), {});
    writePack(secondRoot, extensionSource({
      packId: 'bravo.extension',
      author: 'Second Artist',
      definitionDigest: baseline.definitionDigests.get('braid')!,
      creditDigest: baseline.creditDigests.get('braid')!,
      sourcePath: 'sprites/second/climb.png',
      destinationPath: 'spritesheets/hair/braid/trim/climb.png',
      layer: 'layer_1',
      bodyTypes: ['female'],
    }), {});
    await syncPack(fixture, firstRoot);

    const merged = await prepareAssetPackDesiredState({
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      mutation: { kind: 'upsert', candidate: await linkedCandidate(fixture, secondRoot) },
    });
    expect(
      merged.ok,
      merged.ok ? undefined : JSON.stringify(merged.diagnostics, null, 2),
    ).toBe(true);
    if (!merged.ok) throw new Error(merged.diagnostics[0]?.message);
    const mergedDefinition = merged.compilePlan.definitions.find(
      (definition) => definition.assetId === 'braid',
    )?.definition;
    expect(mergedDefinition).toMatchObject({
      animations: ['walk', 'climb'],
      credits: expect.arrayContaining([
        expect.objectContaining({ authors: BASE_CREDIT.authors }),
        expect.objectContaining({ authors: ['First Artist'] }),
        expect.objectContaining({ authors: ['Second Artist'] }),
      ]),
    });

    const conflictRoot = path.join(fixture.workspace.packsRoot, 'charlie-conflict');
    writePack(conflictRoot, extensionSource({
      packId: 'charlie.conflict',
      author: 'Conflict Artist',
      definitionDigest: baseline.definitionDigests.get('braid')!,
      creditDigest: baseline.creditDigests.get('braid')!,
      sourcePath: 'sprites/conflict/climb.png',
      destinationPath: 'spritesheets/hair/braid/front/climb.png',
      layer: 'layer_1',
      bodyTypes: ['male'],
    }), {});
    const conflicted = await prepareAssetPackDesiredState({
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      mutation: { kind: 'upsert', candidate: await linkedCandidate(fixture, conflictRoot) },
    });
    expect(conflicted).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'asset_path_conflict' })]),
    });

    writeJson(
      path.join(fixture.assetsRoot, 'sheet_definitions/hair/braid.json'),
      baseDefinition({ display_name: 'Changed baseline' }),
    );
    const stale = await prepareAssetPackDesiredState({
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      mutation: { kind: 'none' },
    });
    expect(stale).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'asset_base_definition_changed' }),
      ]),
    });
  });

  it('delegates exact cross-package replacement authorization to the compiler', async () => {
    const fixture = createStateFixture({ managedBase: true });
    const baseline = loadActiveAssetPackBaseline({
      runtime: fixture.runtime,
      workspace: fixture.workspace,
    });
    const itemId = 'acme.shared-pack--shared-item';
    const replacementRoot = path.join(fixture.workspace.packsRoot, 'omega-replacement');
    writePack(replacementRoot, extensionSource({
      packId: 'omega.replacement',
      itemId,
      author: 'Replacement Artist',
      definitionDigest: baseline.definitionDigests.get(itemId)!,
      creditDigest: baseline.creditDigests.get(itemId)!,
      sourcePath: 'sprites/shared/climb.png',
      destinationPath: 'spritesheets/packages/acme.shared-pack/shared-item/top/male-female/climb.png',
      bodyTypes: ['male', 'female'],
      replaces: [{
        packId: 'acme.shared-pack',
        versions: '>=1.0.0 <2.0.0',
        assets: ['shared-item'],
      }],
    }), {});

    const authorized = await prepareAssetPackDesiredState({
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      mutation: { kind: 'upsert', candidate: await linkedCandidate(fixture, replacementRoot) },
    });
    expect(authorized.ok).toBe(true);
    if (!authorized.ok) throw new Error(authorized.diagnostics[0]?.message);
    expect(authorized.compilePlan.sprites).toContainEqual(expect.objectContaining({
      packId: 'omega.replacement',
      destinationPath: 'spritesheets/packages/acme.shared-pack/shared-item/top/male-female/climb.png',
    }));

    const unauthorizedRoot = path.join(fixture.workspace.packsRoot, 'zulu-unauthorized');
    writePack(unauthorizedRoot, extensionSource({
      packId: 'zulu.unauthorized',
      itemId,
      author: 'Unauthorized Artist',
      definitionDigest: baseline.definitionDigests.get(itemId)!,
      creditDigest: baseline.creditDigests.get(itemId)!,
      sourcePath: 'sprites/shared/unauthorized-climb.png',
      destinationPath: 'spritesheets/packages/acme.shared-pack/shared-item/top/male-female/climb.png',
      bodyTypes: ['male', 'female'],
    }), {});
    const unauthorized = await prepareAssetPackDesiredState({
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      mutation: { kind: 'upsert', candidate: await linkedCandidate(fixture, unauthorizedRoot) },
    });
    expect(unauthorized).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'asset_replacement_unauthorized' }),
      ]),
    });
  });
});
