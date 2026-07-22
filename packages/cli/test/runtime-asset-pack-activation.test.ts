import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import {
  ASSET_PACK_SCHEMA,
  standardAnimationGeometry,
  type AssetPackSource,
} from '@lpc-toolkit/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ASSET_WORKSPACE_REGISTRY_V1_SCHEMA,
  assetPackRegistryBytes,
  type AssetPackRegistryDocument,
  type AssetPackRegistryEntry,
  type AssetPackRegistryV1Read,
  type InstalledAssetPackRegistryEntry,
  type LinkedAssetPackRegistryEntry,
} from '../src/asset-pack-registry.js';
import { syncLinkedAssetPack } from '../src/asset-pack-sync.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import {
  initializeAssetWorkspace,
  type AssetWorkspace,
} from '../src/asset-workspace.js';
import { createRuntimeContext } from '../src/context.js';
import {
  loadRuntimeCatalog,
  withWorkspaceRuntimeAssets,
  type RuntimeAssets,
} from '../src/runtime-assets.js';

const temporaryDirectories: string[] = [];

interface RuntimeFixture {
  readonly root: string;
  readonly baseRoot: string;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly packRoot: string;
  readonly manifestPath: string;
  readonly sourceSpritePath: string;
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

function walkPng(color: string): Buffer {
  const geometry = standardAnimationGeometry('walk');
  const maxColumn = Math.max(
    ...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)),
  );
  const canvas = createCanvas(
    (maxColumn + 1) * geometry.frameSize,
    geometry.rows.length * geometry.frameSize,
  );
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toBuffer('image/png');
}

function source(version = '1.0.0'): AssetPackSource {
  return {
    schema: ASSET_PACK_SCHEMA,
    id: 'acme.runtime',
    version,
    displayName: 'Runtime Hair',
    credits: {
      authors: ['Runtime Artist'],
      licenses: ['CC-BY-SA 4.0'],
      urls: ['https://example.test/runtime-hair'],
      notes: 'Runtime activation fixture.',
    },
    assets: [{
      kind: 'new-item',
      localId: 'hair',
      displayName: 'Runtime Hair',
      typeName: 'hair',
      bodyTypes: ['male', 'female'],
      animations: ['walk'],
      layers: [{
        id: 'foreground',
        zPos: 120,
        sprites: [{
          animation: 'walk',
          source: 'sprites/hair/walk.png',
        }],
      }],
    }],
  };
}

function createFixture(): RuntimeFixture {
  const root = createDirectory('lpc-runtime-asset-pack-');
  const baseRoot = path.join(root, 'managed-cache');
  writeJson(path.join(baseRoot, 'sheet_definitions/hair/base.json'), {
    name: 'Base Hair',
    type_name: 'hair',
    animations: ['walk'],
    credits: [{
      file: 'hair/base',
      authors: ['Base Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.test/base-hair'],
      notes: '',
    }],
    layer_1: {
      zPos: 50,
      male: 'hair/base/',
      female: 'hair/base/',
    },
  });
  mkdirSync(path.join(baseRoot, 'palette_definitions'), { recursive: true });
  mkdirSync(path.join(baseRoot, 'spritesheets'), { recursive: true });
  writeFileSync(
    path.join(baseRoot, 'CREDITS.csv'),
    'filename,notes,authors,licenses,urls\n',
  );
  const workspace = initializeAssetWorkspace(root);
  const store = createDirectoryAssetStore(baseRoot);
  const runtime: RuntimeAssets = {
    context: createRuntimeContext({
      cwd: root,
      assetsRoot: baseRoot,
      customAssetsRoot: workspace.outputRoot,
      spritesheetsBaseUrl: store.baseUrl,
    }),
    store,
    source: 'managed-cache',
    releaseTag: 'fixture-pinned-release',
  };
  const packRoot = path.join(workspace.packsRoot, 'acme-runtime');
  const manifestPath = path.join(packRoot, 'asset-pack.json');
  const sourceSpritePath = path.join(packRoot, 'sprites/hair/walk.png');
  writeJson(manifestPath, source());
  mkdirSync(path.dirname(sourceSpritePath), { recursive: true });
  writeFileSync(sourceSpritePath, walkPng('#aa5500'));
  return {
    root,
    baseRoot,
    workspace,
    runtime,
    packRoot,
    manifestPath,
    sourceSpritePath,
  };
}

async function syncFixture(fixture: RuntimeFixture): Promise<LinkedAssetPackRegistryEntry> {
  const result = await syncLinkedAssetPack({
    packDirectory: fixture.packRoot,
    workspace: fixture.workspace,
    runtime: fixture.runtime,
  });
  if (!result.ok) {
    throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join(' | '));
  }
  return result.linked;
}

function workspaceId(workspace: AssetWorkspace): string {
  return readJson<{ readonly workspaceId: string }>(
    path.join(workspace.outputRoot, '.lpc-toolkit-managed.json'),
  ).workspaceId;
}

function writeFileAt(root: string, relativePath: string, bytes: Buffer): void {
  const target = path.join(root, ...relativePath.split('/'));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
}

function convertLinkedToInstalled(
  workspace: AssetWorkspace,
  linked: LinkedAssetPackRegistryEntry,
): InstalledAssetPackRegistryEntry {
  const document = readJson<AssetPackRegistryDocument>(workspace.registryPath);
  const archiveDigest = sha256(`archive:${linked.packId}:${linked.version}`);
  const installedDirectory = path.join(
    workspace.installedRoot,
    linked.packId,
    linked.version,
    archiveDigest.slice('sha256:'.length),
  );
  const manifestBytes = readFileSync(path.join(linked.sourceDirectory, 'asset-pack.json'));
  writeFileAt(installedDirectory, 'asset-pack.json', manifestBytes);
  for (const sourcePath of Object.keys(linked.sourceDigests)) {
    writeFileAt(
      installedDirectory,
      sourcePath,
      readFileSync(path.join(linked.sourceDirectory, ...sourcePath.split('/'))),
    );
  }
  const payloadDigests = Object.fromEntries([
    ['asset-pack.json', sha256(manifestBytes)] as const,
    ...Object.entries(linked.sourceDigests),
  ].sort(([left], [right]) => left.localeCompare(right)));
  writeJson(path.join(installedDirectory, 'install-receipt.json'), {
    schema: 'lpc-toolkit.asset-pack-install-receipt.v1',
    workspaceId: workspaceId(workspace),
    packId: linked.packId,
    version: linked.version,
    archiveDigest,
    contentDigest: linked.contentDigest,
    installedAt: '2026-07-22T00:00:00.000Z',
    payloadDigests,
  });
  const { sourceDirectory: _sourceDirectory, ...base } = linked;
  const installed: InstalledAssetPackRegistryEntry = {
    ...base,
    kind: 'installed',
    installedDirectory,
    archiveDigest,
  };
  const entries = document.entries.map((entry): AssetPackRegistryEntry =>
    entry.packId === installed.packId ? installed : entry);
  writeFileSync(
    workspace.registryPath,
    assetPackRegistryBytes({ ...document, entries }),
  );
  return installed;
}

function writeV1Registry(workspace: AssetWorkspace): void {
  const document = readJson<AssetPackRegistryDocument>(workspace.registryPath);
  const v1: AssetPackRegistryV1Read = {
    schema: ASSET_WORKSPACE_REGISTRY_V1_SCHEMA,
    workspaceId: document.workspaceId,
    entries: document.entries.map((entry) => {
      if (entry.kind !== 'linked') throw new Error('Fixture requires linked entries.');
      return {
        kind: 'linked',
        packId: entry.packId,
        version: entry.version,
        displayName: entry.displayName,
        sourceDirectory: entry.sourceDirectory,
        contentDigest: entry.contentDigest,
        sourceDigests: entry.sourceDigests,
        generatedPaths: entry.generatedPaths,
        baselineDefinitionDigests: entry.baselineDefinitionDigests,
        baselineCreditDigests: entry.baselineCreditDigests,
      };
    }),
    generatedDigests: document.generatedDigests,
  };
  writeJson(workspace.registryPath, v1);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('workspace runtime asset-pack activation', () => {
  it('rejects a valid registry reached through an external symbolic link before activation', async () => {
    const fixture = createFixture();
    await syncFixture(fixture);
    const outside = createDirectory('lpc-runtime-registry-link-');
    const outsideRegistry = path.join(outside, 'registry.json');
    renameSync(fixture.workspace.registryPath, outsideRegistry);
    symlinkSync(outsideRegistry, fixture.workspace.registryPath, 'file');

    let activated = false;
    await expect(withWorkspaceRuntimeAssets({
      runtime: fixture.runtime,
      cwd: fixture.root,
      action: async () => {
        activated = true;
      },
    })).rejects.toMatchObject({
      code: 'asset_digest_mismatch',
      path: fixture.workspace.registryPath,
    });
    expect(activated).toBe(false);
  });

  it('rejects an external linked manifest symlink during sync and runtime activation', async () => {
    const fixture = createFixture();
    const manifestBytes = readFileSync(fixture.manifestPath);
    const outsideManifestPath = path.join(fixture.root, 'external-valid-asset-pack.json');
    writeFileSync(outsideManifestPath, manifestBytes);
    unlinkSync(fixture.manifestPath);
    symlinkSync(outsideManifestPath, fixture.manifestPath);

    const failedSync = await syncLinkedAssetPack({
      packDirectory: fixture.packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    });
    expect(failedSync).toMatchObject({
      ok: false,
      diagnostics: [{
        code: 'asset_source_symlink',
        path: fixture.manifestPath,
      }],
    });
    expect(existsSync(fixture.workspace.registryPath)).toBe(false);

    unlinkSync(fixture.manifestPath);
    writeFileSync(fixture.manifestPath, manifestBytes);
    await syncFixture(fixture);
    unlinkSync(fixture.manifestPath);
    symlinkSync(outsideManifestPath, fixture.manifestPath);

    let activated = false;
    await expect(withWorkspaceRuntimeAssets({
      runtime: fixture.runtime,
      cwd: fixture.root,
      action: async () => {
        activated = true;
      },
    })).rejects.toMatchObject({
      code: 'asset_source_symlink',
      path: fixture.manifestPath,
    });
    expect(activated).toBe(false);
  });

  it('rejects linked source bytes that no longer match authenticated registry v2 state', async () => {
    const fixture = createFixture();
    await syncFixture(fixture);
    writeFileSync(fixture.sourceSpritePath, walkPng('#3355aa'));

    await expect(withWorkspaceRuntimeAssets({
      runtime: fixture.runtime,
      cwd: fixture.root,
      action: async () => undefined,
    })).rejects.toMatchObject({ code: 'asset_digest_mismatch' });
  });

  it('rejects installed payload bytes that no longer match their receipt and registry identity', async () => {
    const fixture = createFixture();
    const linked = await syncFixture(fixture);
    const installed = convertLinkedToInstalled(fixture.workspace, linked);
    writeFileSync(
      path.join(installed.installedDirectory, 'sprites/hair/walk.png'),
      walkPng('#3355aa'),
    );

    await expect(withWorkspaceRuntimeAssets({
      runtime: fixture.runtime,
      cwd: fixture.root,
      action: async () => undefined,
    })).rejects.toMatchObject({ code: 'asset_digest_mismatch' });
  });

  it('rejects a receipt-valid installed source outside its exact content-addressed path', async () => {
    const fixture = createFixture();
    const linked = await syncFixture(fixture);
    const installed = convertLinkedToInstalled(fixture.workspace, linked);
    const mislocatedDirectory = path.join(
      fixture.workspace.installedRoot,
      installed.packId,
      installed.version,
      'mislocated',
    );
    renameSync(installed.installedDirectory, mislocatedDirectory);
    const document = readJson<AssetPackRegistryDocument>(fixture.workspace.registryPath);
    writeFileSync(
      fixture.workspace.registryPath,
      assetPackRegistryBytes({
        ...document,
        entries: document.entries.map((entry): AssetPackRegistryEntry =>
          entry.packId === installed.packId && entry.kind === 'installed'
            ? { ...entry, installedDirectory: mislocatedDirectory }
            : entry),
      }),
    );

    await expect(withWorkspaceRuntimeAssets({
      runtime: fixture.runtime,
      cwd: fixture.root,
      action: async () => undefined,
    })).rejects.toMatchObject({ code: 'asset_digest_mismatch' });
  });

  it('refuses to activate a valid v1 registry until a lifecycle manager publication migrates it', async () => {
    const fixture = createFixture();
    await syncFixture(fixture);
    writeV1Registry(fixture.workspace);

    await expect(withWorkspaceRuntimeAssets({
      runtime: fixture.runtime,
      cwd: fixture.root,
      action: async () => undefined,
    })).rejects.toMatchObject({ code: 'asset_registry_migration_required' });
  });

  it('refuses a workspace overlay over a non-managed compilation baseline', async () => {
    const fixture = createFixture();
    await syncFixture(fixture);

    await expect(withWorkspaceRuntimeAssets({
      runtime: { ...fixture.runtime, source: 'working-directory' },
      cwd: fixture.root,
      action: async () => undefined,
    })).rejects.toMatchObject({ code: 'asset_runtime_baseline_mismatch' });
  });

  it('serves one captured definition and sprite generation after live output is replaced', async () => {
    const fixture = createFixture();
    const linked = await syncFixture(fixture);
    const definitionLogicalPath = linked.generatedPaths.find((logicalPath) =>
      logicalPath.startsWith('sheet_definitions/'));
    const spriteLogicalPath = linked.logicalDestinations[0];
    if (!definitionLogicalPath || !spriteLogicalPath) {
      throw new Error('Fixture registry is missing generated definition or sprite output.');
    }
    const definitionPath = path.join(fixture.workspace.outputRoot, definitionLogicalPath);
    const spritePath = path.join(fixture.workspace.outputRoot, spriteLogicalPath);
    const originalSprite = readFileSync(spritePath);
    const displacedOutputRoot = `${fixture.workspace.outputRoot}.captured-generation`;

    await withWorkspaceRuntimeAssets({
      runtime: fixture.runtime,
      cwd: fixture.root,
      action: async (activeRuntime) => {
        renameSync(fixture.workspace.outputRoot, displacedOutputRoot);
        mkdirSync(fixture.workspace.outputRoot, { recursive: true });
        try {
          const tamperedDefinition = {
            ...readJson<Record<string, unknown>>(
              path.join(displacedOutputRoot, definitionLogicalPath),
            ),
            display_name: 'Swapped Definition',
          };
          writeJson(definitionPath, tamperedDefinition);
          writeFileAt(fixture.workspace.outputRoot, spriteLogicalPath, walkPng('#00aa55'));
          writeFileSync(
            path.join(fixture.workspace.outputRoot, 'CREDITS.csv'),
            'filename,notes,authors,licenses,urls\n"swapped","","Wrong Artist","GPL 3.0",""\n',
          );

          const capturedDefinition = loadRuntimeCatalog(activeRuntime).catalog.byItemId
            .get('acme.runtime--hair');
          expect(capturedDefinition?.display_name).toBe('Runtime Hair');
          expect(capturedDefinition?.credits).toContainEqual(expect.objectContaining({
            authors: ['Runtime Artist'],
          }));
          const loaded = await activeRuntime.store.load(
            path.join(fixture.baseRoot, spriteLogicalPath),
          );
          expect(Buffer.isBuffer(loaded)).toBe(true);
          expect(loaded).toEqual(originalSprite);
        } finally {
          rmSync(fixture.workspace.outputRoot, { recursive: true, force: true });
          renameSync(displacedOutputRoot, fixture.workspace.outputRoot);
        }
      },
    });
  });

  it('holds the lifecycle claim until lazy runtime consumption finishes', async () => {
    const fixture = createFixture();
    const linked = await syncFixture(fixture);
    const spriteLogicalPath = linked.logicalDestinations[0];
    if (!spriteLogicalPath) throw new Error('Fixture registry is missing generated sprite output.');
    const outputBefore = readFileSync(
      path.join(fixture.workspace.outputRoot, spriteLogicalPath),
    );
    const manifestBefore = readFileSync(fixture.manifestPath);
    const sourceBefore = readFileSync(fixture.sourceSpritePath);

    await withWorkspaceRuntimeAssets({
      runtime: fixture.runtime,
      cwd: fixture.root,
      action: async (activeRuntime) => {
        try {
          writeJson(fixture.manifestPath, source('2.0.0'));
          writeFileSync(fixture.sourceSpritePath, walkPng('#3355aa'));
          const concurrent = await syncLinkedAssetPack({
            packDirectory: fixture.packRoot,
            workspace: fixture.workspace,
            runtime: fixture.runtime,
          });
          expect(concurrent.ok).toBe(false);
          if (concurrent.ok) throw new Error('Concurrent publication unexpectedly succeeded.');
          expect(concurrent.diagnostics[0]?.message).toContain(
            'already owns this workspace',
          );
          expect(readFileSync(
            path.join(fixture.workspace.outputRoot, spriteLogicalPath),
          )).toEqual(outputBefore);
          await expect(activeRuntime.store.load(
            path.join(fixture.baseRoot, spriteLogicalPath),
          )).resolves.toEqual(outputBefore);
        } finally {
          writeFileSync(fixture.manifestPath, manifestBefore);
          writeFileSync(fixture.sourceSpritePath, sourceBefore);
        }
      },
    });
  });
});
