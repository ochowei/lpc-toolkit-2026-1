import {
  ASSET_PACK_SCHEMA,
  assetPackSourceFromNormalized,
  normalizeAssetPack,
  standardAnimationGeometry,
  type AssetPackSource,
} from '@lpc-toolkit/core';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkAssetPackCompatibility,
  SUPPORTED_ASSET_PACK_CAPABILITIES,
} from '../src/asset-pack-compatibility.js';
import { readAssetPackArchive } from '../src/asset-pack-archive-format.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { initializeAssetWorkspace } from '../src/asset-workspace.js';
import {
  packAssetPack,
  type PackAssetPackSuccess,
} from '../src/asset-pack-packaging.js';
import { createRuntimeContext } from '../src/context.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

const temporaryDirectories: string[] = [];

const PACK_CREDITS = {
  authors: ['Alice'],
  licenses: ['CC-BY-SA 4.0'],
  urls: ['https://example.com/alice'],
  notes: '',
} as const;

function sourceFixture(overrides: Partial<AssetPackSource> = {}): AssetPackSource {
  return {
    schema: ASSET_PACK_SCHEMA,
    id: 'acme.wind-braid',
    version: '1.0.0',
    displayName: 'ACME Wind Braid',
    credits: PACK_CREDITS,
    assets: [{
      kind: 'new-item',
      localId: 'wind-braid',
      displayName: 'Wind Braid',
      typeName: 'hair',
      bodyTypes: ['female'],
      animations: ['walk'],
      layers: [{
        id: 'foreground',
        zPos: 120,
        sprites: [{ animation: 'walk', source: 'sprites/wind-braid/walk.png' }],
      }],
    }],
    ...overrides,
  };
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

function writeWalkPng(filePath: string): void {
  const geometry = standardAnimationGeometry('walk');
  const maxColumn = Math.max(...geometry.rows.flatMap((row) =>
    row.cells.map((cell) => cell.sourceColumn),
  ));
  const canvas = createCanvas(
    (maxColumn + 1) * geometry.frameSize,
    geometry.rows.length * geometry.frameSize,
  );
  const context = canvas.getContext('2d');
  context.fillStyle = '#cc5500';
  context.fillRect(0, 0, canvas.width, canvas.height);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, canvas.toBuffer('image/png'));
}

function createRuntimeFixture(): { readonly runtime: RuntimeAssets; readonly workspaceRoot: string } {
  const workspaceRoot = createDirectory('lpc-asset-pack-packaging-runtime-');
  const assetsRoot = path.join(workspaceRoot, 'assets');
  writeJson(path.join(assetsRoot, 'sheet_definitions', 'hair', 'braid.json'), {
    name: 'Braid',
    type_name: 'hair',
    animations: ['walk'],
    credits: [{
      file: 'hair/braid',
      authors: ['Base Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.com/base'],
      notes: '',
    }],
    layer_1: { zPos: 50, female: 'hair/braid/' },
  });
  writeJson(path.join(assetsRoot, 'palette_definitions', 'hair', 'meta_hair.json'), {
    type: 'material', default: 'ulpc', base: 'black',
  });
  writeJson(path.join(assetsRoot, 'palette_definitions', 'hair', 'hair_ulpc.json'), {
    black: ['#111111', '#222222'],
  });
  const store = createDirectoryAssetStore(assetsRoot);
  return {
    workspaceRoot,
    runtime: {
      context: createRuntimeContext({ cwd: workspaceRoot, assetsRoot, spritesheetsBaseUrl: store.baseUrl }),
      store,
      source: 'working-directory',
    },
  };
}

function packOk(result: Awaited<ReturnType<typeof packAssetPack>>): PackAssetPackSuccess {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Expected asset pack success: ${JSON.stringify(result.diagnostics)}`);
  return result;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('checkAssetPackCompatibility', () => {
  it('accepts the lifecycle contract supported by this CLI', () => {
    const pack = normalizeAssetPack(sourceFixture({
      compatibility: {
        minimumCliVersion: '0.2.0',
        requiredCapabilities: [...SUPPORTED_ASSET_PACK_CAPABILITIES],
      },
    }));

    expect(checkAssetPackCompatibility(pack, '0.2.0')).toEqual([]);
  });

  it('reports stable version and capability diagnostics', () => {
    const pack = normalizeAssetPack(sourceFixture({
      compatibility: {
        minimumCliVersion: '0.3.0',
        requiredCapabilities: ['lpc-toolkit.asset-pack.future.v1'],
      },
    }));

    expect(checkAssetPackCompatibility(pack, '0.2.0')).toEqual([
      expect.objectContaining({
        code: 'asset_cli_version_incompatible',
        severity: 'error',
      }),
      expect.objectContaining({
        code: 'asset_capability_unsupported',
        severity: 'error',
      }),
    ]);
  });
});

describe('packAssetPack', () => {
  it('packages one immutable validated snapshot as a normalized deterministic sibling archive', async () => {
    const { runtime, workspaceRoot } = createRuntimeFixture();
    const workspace = initializeAssetWorkspace(workspaceRoot);
    const packDirectory = path.join(workspace.packsRoot, 'acme.wind-braid');
    const manifestPath = path.join(packDirectory, 'asset-pack.json');
    const sourcePath = path.join(packDirectory, 'sprites/wind-braid/walk.png');
    const artistManifest = `{"version":"1.0.0","assets":[{"layers":[{"sprites":[{"source":"sprites/wind-braid/walk.png","animation":"walk"}],"zPos":120,"id":"foreground"}],"animations":["walk"],"bodyTypes":["female"],"typeName":"hair","displayName":"Wind Braid","localId":"wind-braid","kind":"new-item"}],"credits":{"urls":["https://example.com/alice"],"notes":"","licenses":["CC-BY-SA 4.0"],"authors":["Alice"]},"displayName":"ACME Wind Braid","id":"acme.wind-braid","schema":"lpc-toolkit.asset-pack.v1"}`;
    mkdirSync(packDirectory, { recursive: true });
    writeFileSync(manifestPath, artistManifest);
    writeWalkPng(sourcePath);
    const sourceManifestBytes = readFileSync(manifestPath);
    const sourcePngBytes = readFileSync(sourcePath);
    const manifestMtimeMs = lstatSync(manifestPath).mtimeMs;
    const sourceMtimeMs = lstatSync(sourcePath).mtimeMs;

    const first = packOk(await packAssetPack({ packDirectory, workspace, runtime }));
    const second = packOk(await packAssetPack({ packDirectory, workspace, runtime }));

    expect(first).toMatchObject({
      packId: 'acme.wind-braid',
      version: '1.0.0',
      archivePath: path.join(workspace.packsRoot, 'acme.wind-braid-1.0.0.lpc-assets.zip'),
      entryCount: 3,
    });
    expect(readFileSync(first.archivePath)).toEqual(readFileSync(second.archivePath));
    expect(readFileSync(manifestPath)).toEqual(sourceManifestBytes);
    expect(readFileSync(sourcePath)).toEqual(sourcePngBytes);
    expect(lstatSync(manifestPath).mtimeMs).toBe(manifestMtimeMs);
    expect(lstatSync(sourcePath).mtimeMs).toBe(sourceMtimeMs);

    const archive = readAssetPackArchive({ archivePath: first.archivePath });
    expect(archive.ok).toBe(true);
    if (!archive.ok) throw new Error(`Expected archive: ${JSON.stringify(archive.diagnostics)}`);
    expect(archive.snapshot.manifestBytes).not.toEqual(sourceManifestBytes);
    expect(JSON.parse(archive.snapshot.manifestBytes.toString('utf8'))).toEqual(
      assetPackSourceFromNormalized(normalizeAssetPack(sourceFixture())),
    );
    expect(archive.snapshot.checksums.map((entry) => entry.path)).toEqual([
      'asset-pack.json',
      'sprites/wind-braid/walk.png',
    ]);
  });

  it('restores the previous archive when publication fails after the backup rename', async () => {
    const { runtime, workspaceRoot } = createRuntimeFixture();
    const workspace = initializeAssetWorkspace(workspaceRoot);
    const packDirectory = path.join(workspace.packsRoot, 'acme.wind-braid');
    mkdirSync(packDirectory, { recursive: true });
    writeJson(path.join(packDirectory, 'asset-pack.json'), sourceFixture());
    writeWalkPng(path.join(packDirectory, 'sprites/wind-braid/walk.png'));
    const archivePath = path.join(workspace.packsRoot, 'acme.wind-braid-1.0.0.lpc-assets.zip');
    const previousBytes = Buffer.from('previous archive');
    writeFileSync(archivePath, previousBytes);
    let renameCalls = 0;

    const result = await packAssetPack({
      packDirectory,
      workspace,
      runtime,
      fileOps: {
        lstatSync,
        writeFileSync,
        renameSync(from, to) {
          renameCalls += 1;
          if (renameCalls === 2) throw new Error('injected publication failure');
          renameSync(from, to);
        },
        rmSync,
      },
    });

    expect(result).toMatchObject({ ok: false });
    expect(readFileSync(archivePath)).toEqual(previousBytes);
    expect(renameCalls).toBe(3);
  });
});
