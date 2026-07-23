import {
  ASSET_PACK_SCHEMA,
  assetPackSourceFromNormalized,
  normalizeAssetPack,
  standardAnimationGeometry,
  type AnimationName,
  type AssetPackAcknowledgement,
  type AssetPackSource,
} from '@lpc-toolkit/core';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
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
import type { AssetPackDirectoryFileOps } from '../src/asset-pack-files.js';
import { initializeAssetWorkspace } from '../src/asset-workspace.js';
import {
  packAssetPack,
  type AssetPackArchivePublicationFileOps,
  type PackAssetPackSuccess,
} from '../src/asset-pack-packaging.js';
import { createRuntimeContext } from '../src/context.js';
import {
  loadActiveAssetPackBaseline,
  validateAssetPackDirectory,
} from '../src/asset-pack-validation.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

const temporaryDirectories: string[] = [];

const PACK_CREDITS = {
  authors: ['Alice'],
  licenses: ['CC-BY-SA 4.0'],
  urls: ['https://example.com/alice'],
  notes: '',
} as const;

const OVERRIDE_CREDITS = {
  authors: ['Béatrice'],
  licenses: ['CC-BY 4.0'],
  urls: ['https://example.com/beatrice'],
  notes: 'Override attribution.',
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

function writeSheetPng(
  filePath: string,
  animation: AnimationName = 'walk',
  color?: string,
): void {
  const geometry = standardAnimationGeometry(animation);
  const maxColumn = Math.max(...geometry.rows.flatMap((row) =>
    row.cells.map((cell) => cell.sourceColumn),
  ));
  const canvas = createCanvas(
    (maxColumn + 1) * geometry.frameSize,
    geometry.rows.length * geometry.frameSize,
  );
  const context = canvas.getContext('2d');
  if (color !== undefined) {
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, canvas.toBuffer('image/png'));
}

function writeWalkPng(filePath: string, color = '#cc5500'): void {
  writeSheetPng(filePath, 'walk', color);
}

function createRuntimeFixture(): { readonly runtime: RuntimeAssets; readonly workspaceRoot: string } {
  const workspaceRoot = createDirectory('lpc-asset-pack-packaging-runtime-');
  const assetsRoot = path.join(workspaceRoot, 'assets');
  writeJson(path.join(assetsRoot, 'sheet_definitions', 'hair', 'braid.json'), {
    name: 'Braid',
    type_name: 'hair',
    animations: ['walk', 'climb'],
    variants: ['dark brown'],
    recolors: { material: 'hair', palettes: ['ulpc'] },
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

function extendSourceFixture(
  digests: { readonly definition: string; readonly credit: string },
  acknowledgements?: readonly AssetPackAcknowledgement[],
): AssetPackSource {
  return {
    schema: ASSET_PACK_SCHEMA,
    id: 'acme.audit-braid',
    version: '1.0.0',
    displayName: 'ACME Audit Braid',
    credits: PACK_CREDITS,
    creditOverrides: {
      'sprites/braid/climb-female.png': OVERRIDE_CREDITS,
    },
    ...(acknowledgements ? { acknowledgements } : {}),
    assets: [{
      kind: 'extend-item',
      itemId: 'braid',
      baseDefinitionDigest: digests.definition,
      baseCreditDigest: digests.credit,
      addAnimations: [{
        animation: 'climb',
        layers: [{
          layer: 'layer_1',
          bodyTypes: ['female'],
          source: 'sprites/braid/climb-female.png',
          variant: 'dark brown',
          destination: {
            path: 'spritesheets/hair/braid/climb/dark_brown.png',
            evidence: 'audit-inferred',
            accepted: true,
          },
        }],
      }],
    }],
  };
}

function createPack(
  workspaceRoot: string,
  source: AssetPackSource = sourceFixture(),
): {
  readonly workspace: ReturnType<typeof initializeAssetWorkspace>;
  readonly packDirectory: string;
  readonly manifestPath: string;
} {
  const workspace = initializeAssetWorkspace(workspaceRoot);
  const packDirectory = path.join(workspace.packsRoot, source.id);
  const manifestPath = path.join(packDirectory, 'asset-pack.json');
  writeJson(manifestPath, source);
  return { workspace, packDirectory, manifestPath };
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function archiveOk(archivePath: string) {
  const archive = await readAssetPackArchive({ archivePath });
  expect(archive.ok).toBe(true);
  if (!archive.ok) throw new Error(`Expected archive: ${JSON.stringify(archive.diagnostics)}`);
  return archive.snapshot;
}

function siblingPublicationPaths(archivePath: string): readonly string[] {
  const prefix = `.${path.basename(archivePath)}.`;
  return readdirSync(path.dirname(archivePath))
    .filter((entry) => entry.startsWith(prefix) && (entry.endsWith('.tmp') || entry.endsWith('.bak')))
    .map((entry) => path.join(path.dirname(archivePath), entry));
}

function defaultFileOps(
  overrides: Partial<AssetPackArchivePublicationFileOps> = {},
): AssetPackArchivePublicationFileOps {
  return {
    lstatSync,
    writeFileSync,
    renameSync,
    rmSync,
    ...overrides,
  };
}

function replacingSourceFileOps(options: {
  readonly targetPath: string;
  readonly replacementBytes: Buffer;
}): {
  readonly fileOps: AssetPackDirectoryFileOps;
  readonly replaced: () => boolean;
} {
  const targetIdentity = lstatSync(options.targetPath);
  const replacementPath = `${options.targetPath}.capture-replacement`;
  writeFileSync(replacementPath, options.replacementBytes);
  let replaced = false;
  const mutatingReadFileSync = ((target: Parameters<typeof readFileSync>[0]) => {
    const bytes = readFileSync(target);
    if (typeof target === 'number' && !replaced) {
      const opened = fstatSync(target);
      if (opened.dev === targetIdentity.dev && opened.ino === targetIdentity.ino) {
        replaced = true;
        renameSync(replacementPath, options.targetPath);
      }
    }
    return bytes;
  }) as typeof readFileSync;
  return {
    fileOps: {
      openSync,
      closeSync,
      fstatSync,
      readFileSync: mutatingReadFileSync,
      lstatSync,
      realpathSync: realpathSync.native,
    },
    replaced: () => replaced,
  };
}

function switchingPackGenerationFileOps(options: {
  readonly triggerPath: string;
  readonly replacements: ReadonlyMap<string, Buffer>;
}): {
  readonly fileOps: AssetPackDirectoryFileOps;
  readonly switched: () => boolean;
} {
  const triggerPath = path.resolve(options.triggerPath);
  let switched = false;
  const switchingLstatSync = ((target: Parameters<typeof lstatSync>[0]) => {
    if (!switched && path.resolve(String(target)) === triggerPath) {
      switched = true;
      for (const [targetPath, bytes] of options.replacements) {
        writeFileSync(targetPath, bytes);
      }
    }
    return lstatSync(target);
  }) as typeof lstatSync;
  return {
    fileOps: {
      openSync,
      closeSync,
      fstatSync,
      readFileSync,
      lstatSync: switchingLstatSync,
      realpathSync: realpathSync.native,
    },
    switched: () => switched,
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
  it('rejects a symlinked supplied pack root before parsing the target manifest', async () => {
    const { runtime, workspaceRoot } = createRuntimeFixture();
    const workspace = initializeAssetWorkspace(workspaceRoot);
    const outsideRoot = createDirectory('lpc-asset-pack-packaging-root-target-');
    writeFileSync(path.join(outsideRoot, 'asset-pack.json'), '{"schema":');
    const packDirectory = path.join(workspace.packsRoot, 'linked-pack');
    symlinkSync(
      outsideRoot,
      packDirectory,
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    const result = await packAssetPack({ packDirectory, workspace, runtime });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected symlinked root packaging to fail.');
    expect(result.diagnostics).toEqual([expect.objectContaining({
      code: 'asset_source_symlink',
      path: packDirectory,
    })]);
  });

  it.each(['manifest', 'source'] as const)(
    'rejects deterministic %s replacement during packaging capture',
    async (targetKind) => {
      const { runtime, workspaceRoot } = createRuntimeFixture();
      const { workspace, packDirectory, manifestPath } = createPack(workspaceRoot);
      const sourcePath = path.join(packDirectory, 'sprites/wind-braid/walk.png');
      writeWalkPng(sourcePath);
      const targetPath = targetKind === 'manifest' ? manifestPath : sourcePath;
      const capture = replacingSourceFileOps({
        targetPath,
        replacementBytes: readFileSync(targetPath),
      });

      const result = await packAssetPack({
        packDirectory,
        workspace,
        runtime,
        sourceFileOps: capture.fileOps,
      });

      expect(capture.replaced()).toBe(true);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected replacement during packaging capture to fail.');
      expect(result.diagnostics).toContainEqual(expect.objectContaining({
        code: 'asset_digest_mismatch',
        path: targetPath,
      }));
    },
  );

  it('rejects a whole-pack generation switch through public packaging', async () => {
    const { runtime, workspaceRoot } = createRuntimeFixture();
    const source = sourceFixture();
    const { workspace, packDirectory, manifestPath } = createPack(workspaceRoot, source);
    const sourcePath = path.join(packDirectory, 'sprites/wind-braid/walk.png');
    writeWalkPng(sourcePath, '#cc5500');
    const replacementPngPath = path.join(workspaceRoot, 'replacement-walk.png');
    writeWalkPng(replacementPngPath, '#3355aa');
    const capture = switchingPackGenerationFileOps({
      triggerPath: path.join(packDirectory, 'sprites'),
      replacements: new Map([
        [manifestPath, Buffer.from(`${JSON.stringify({ ...source, version: '10.0.0' }, null, 2)}\n`)],
        [sourcePath, readFileSync(replacementPngPath)],
      ]),
    });

    const result = await packAssetPack({
      packDirectory,
      workspace,
      runtime,
      sourceFileOps: capture.fileOps,
    });

    expect(capture.switched()).toBe(true);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected mixed-generation packaging to fail.');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_digest_mismatch',
      path: manifestPath,
    }));
  });

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
    const sentinelPaths = [
      path.join(workspace.outputRoot, 'packaging-sentinel.txt'),
      path.join(runtime.context.assetsRoot, 'packaging-sentinel.txt'),
      path.join(workspace.stateRoot, 'cache', 'packaging-sentinel.txt'),
      path.join(workspaceRoot, 'upstream', 'packaging-sentinel.txt'),
    ];
    sentinelPaths.forEach((sentinelPath, index) => {
      mkdirSync(path.dirname(sentinelPath), { recursive: true });
      writeFileSync(sentinelPath, `sentinel-${String(index)}`);
    });
    const sentinelBytes = sentinelPaths.map((sentinelPath) => readFileSync(sentinelPath));
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
    sentinelPaths.forEach((sentinelPath, index) => {
      expect(readFileSync(sentinelPath)).toEqual(sentinelBytes[index]);
    });

    const archive = await archiveOk(first.archivePath);
    expect(archive.manifestBytes).not.toEqual(sourceManifestBytes);
    expect(JSON.parse(archive.manifestBytes.toString('utf8'))).toEqual(
      assetPackSourceFromNormalized(normalizeAssetPack(sourceFixture())),
    );
    expect(JSON.parse(archive.checksumsBytes.toString('utf8'))).toEqual({
      schema: 'lpc-toolkit.asset-pack-checksums.v1',
      files: [
        {
          path: 'asset-pack.json',
          size: archive.manifestBytes.byteLength,
          sha256: sha256(archive.manifestBytes),
        },
        {
          path: 'sprites/wind-braid/walk.png',
          size: sourcePngBytes.byteLength,
          sha256: sha256(sourcePngBytes),
        },
      ],
    });
    expect(first.contentDigest).toBe(archive.payload.contentDigest);
    expect(first.archiveDigest).toBe(archive.archiveDigest);
    expect(first.archiveDigest).toBe(sha256(archive.archiveBytes));
  });

  it('produces identical normalized manifests and archives under conflicting locale orderings', async () => {
    const { runtime, workspaceRoot } = createRuntimeFixture();
    const asciiPath = 'sprites/zeta/walk.png';
    const unicodePath = 'sprites/älg/walk.png';
    const source = sourceFixture({
      creditOverrides: {
        [unicodePath]: { ...OVERRIDE_CREDITS, notes: 'Unicode path.' },
        [asciiPath]: { ...OVERRIDE_CREDITS, notes: 'ASCII path.' },
      },
      assets: [{
        kind: 'new-item',
        localId: 'wind-braid',
        displayName: 'Wind Braid',
        typeName: 'hair',
        bodyTypes: ['female'],
        animations: ['walk'],
        variants: ['älg', 'zeta'],
        layers: [{
          id: 'foreground',
          zPos: 120,
          sprites: [
            { animation: 'walk', source: unicodePath, variant: 'älg' },
            { animation: 'walk', source: asciiPath, variant: 'zeta' },
          ],
        }],
      }],
    });
    const { workspace, packDirectory } = createPack(workspaceRoot, source);
    writeWalkPng(path.join(packDirectory, unicodePath));
    writeWalkPng(path.join(packDirectory, asciiPath));
    const originalLocaleCompare = String.prototype.localeCompare;

    async function packWithLocale(locale: string) {
      const collator = new Intl.Collator(locale);
      String.prototype.localeCompare = function localeCompare(compareString: string): number {
        return collator.compare(String(this), compareString);
      };
      const result = packOk(await packAssetPack({ packDirectory, workspace, runtime }));
      const snapshot = await archiveOk(result.archivePath);
      return { result, snapshot, archiveBytes: readFileSync(result.archivePath) };
    }

    expect(['z', 'ä'].sort(new Intl.Collator('en-US').compare))
      .not.toEqual(['z', 'ä'].sort(new Intl.Collator('sv-SE').compare));

    try {
      const english = await packWithLocale('en-US');
      const swedish = await packWithLocale('sv-SE');

      expect(english.snapshot.manifestBytes).toEqual(swedish.snapshot.manifestBytes);
      expect(english.snapshot.checksumsBytes).toEqual(swedish.snapshot.checksumsBytes);
      expect(english.archiveBytes).toEqual(swedish.archiveBytes);
      expect(english.result.archiveDigest).toBe(swedish.result.archiveDigest);
      expect(english.snapshot.entryCount).toBe(swedish.snapshot.entryCount);
      expect(english.snapshot.totalUncompressedBytes).toBe(
        swedish.snapshot.totalUncompressedBytes,
      );
      expect(english.result.contentDigest).toBe(english.snapshot.payload.contentDigest);
      expect(swedish.result.contentDigest).toBe(swedish.snapshot.payload.contentDigest);

      const manifest = JSON.parse(
        english.snapshot.manifestBytes.toString('utf8'),
      ) as AssetPackSource;
      expect(Object.keys(manifest.creditOverrides ?? {})).toEqual([asciiPath, unicodePath]);
      expect(manifest.assets[0]).toMatchObject({ variants: ['zeta', 'älg'] });
      expect(manifest.assets[0]?.kind === 'new-item'
        ? manifest.assets[0].layers[0]?.sprites.map((sprite) => sprite.source)
        : []).toEqual([asciiPath, unicodePath]);
    } finally {
      String.prototype.localeCompare = originalLocaleCompare;
    }
  });

  it('accepts supported declarations and rejects unsupported declarations through packaging', async () => {
    const { runtime, workspaceRoot } = createRuntimeFixture();
    const supported = sourceFixture({
      compatibility: {
        minimumCliVersion: '0.2.0',
        requiredCapabilities: [...SUPPORTED_ASSET_PACK_CAPABILITIES],
      },
    });
    const { workspace, packDirectory, manifestPath } = createPack(workspaceRoot, supported);
    writeWalkPng(path.join(packDirectory, 'sprites/wind-braid/walk.png'));

    const accepted = packOk(await packAssetPack({ packDirectory, workspace, runtime }));
    const previousArchive = readFileSync(accepted.archivePath);
    writeJson(manifestPath, sourceFixture({
      compatibility: {
        minimumCliVersion: '0.3.0',
        requiredCapabilities: ['lpc-toolkit.asset-pack.future.v1'],
      },
    }));

    const rejected = await packAssetPack({ packDirectory, workspace, runtime });

    expect(rejected.ok).toBe(false);
    if (rejected.ok) throw new Error('Expected incompatible packaging to fail.');
    expect(rejected.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_cli_version_incompatible', severity: 'error' }),
      expect.objectContaining({ code: 'asset_capability_unsupported', severity: 'error' }),
    ]));
    expect(readFileSync(accepted.archivePath)).toEqual(previousArchive);
  });

  it('packages acknowledged extend attribution and rejects unacknowledged or stale warnings', async () => {
    const { runtime, workspaceRoot } = createRuntimeFixture();
    const baseline = loadActiveAssetPackBaseline({ runtime });
    const digests = {
      definition: baseline.definitionDigests.get('braid')!,
      credit: baseline.creditDigests.get('braid')!,
    };
    const unacknowledgedSource = extendSourceFixture(digests);
    const { workspace, packDirectory, manifestPath } = createPack(
      workspaceRoot,
      unacknowledgedSource,
    );
    const sourcePath = path.join(packDirectory, 'sprites/braid/climb-female.png');
    writeSheetPng(sourcePath, 'climb', '#111111');

    const unacknowledged = await packAssetPack({ packDirectory, workspace, runtime });
    expect(unacknowledged.ok).toBe(false);
    if (unacknowledged.ok) throw new Error('Expected unacknowledged warning rejection.');
    expect(unacknowledged.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_path_inferred', severity: 'warning' }),
    ]));

    const report = await validateAssetPackDirectory({ packDirectory, workspace, runtime });
    const acknowledgement = report.acknowledgementRecords.find(
      (record) => record.code === 'asset_path_inferred',
    );
    expect(acknowledgement).toBeDefined();
    if (!acknowledgement) throw new Error('Expected acknowledgement template.');
    const acknowledgedSource = extendSourceFixture(digests, [{
      ...acknowledgement,
      reason: 'Reviewed and accepted the inferred destination.',
    }]);
    writeJson(manifestPath, acknowledgedSource);
    const manifestMtime = new Date(Date.now() - 5_000);
    const sourceMtime = new Date(Date.now() - 4_000);
    utimesSync(manifestPath, manifestMtime, manifestMtime);
    utimesSync(sourcePath, sourceMtime, sourceMtime);
    const expectedManifestMtimeMs = lstatSync(manifestPath).mtimeMs;
    const expectedSourceMtimeMs = lstatSync(sourcePath).mtimeMs;

    const accepted = packOk(await packAssetPack({ packDirectory, workspace, runtime }));
    const acceptedArchiveBytes = readFileSync(accepted.archivePath);
    const archived = await archiveOk(accepted.archivePath);
    const archivedManifest = JSON.parse(archived.manifestBytes.toString('utf8')) as AssetPackSource;
    expect(archivedManifest.credits).toEqual(PACK_CREDITS);
    expect(archivedManifest.creditOverrides).toEqual(
      acknowledgedSource.creditOverrides,
    );
    expect(archivedManifest.acknowledgements).toEqual(
      acknowledgedSource.acknowledgements,
    );
    expect(lstatSync(manifestPath).mtimeMs).toBe(expectedManifestMtimeMs);
    expect(lstatSync(sourcePath).mtimeMs).toBe(expectedSourceMtimeMs);

    writeSheetPng(sourcePath, 'climb', '#222222');
    const stale = await packAssetPack({ packDirectory, workspace, runtime });
    expect(stale.ok).toBe(false);
    if (stale.ok) throw new Error('Expected stale acknowledgement rejection.');
    expect(stale.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_path_inferred', severity: 'warning' }),
    ]));
    expect(readFileSync(accepted.archivePath)).toEqual(acceptedArchiveBytes);
  });

  it('rejects missing and freshly invalid source pixels without publishing', async () => {
    const { runtime, workspaceRoot } = createRuntimeFixture();
    const { workspace, packDirectory } = createPack(workspaceRoot);
    const archivePath = path.join(
      workspace.packsRoot,
      'acme.wind-braid-1.0.0.lpc-assets.zip',
    );

    const missing = await packAssetPack({ packDirectory, workspace, runtime });
    expect(missing.ok).toBe(false);
    if (missing.ok) throw new Error('Expected missing source rejection.');
    expect(missing.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_source_missing' }),
    ]));
    expect(existsSync(archivePath)).toBe(false);

    writeSheetPng(path.join(packDirectory, 'sprites/wind-braid/walk.png'));
    const invalidPixels = await packAssetPack({ packDirectory, workspace, runtime });
    expect(invalidPixels.ok).toBe(false);
    if (invalidPixels.ok) throw new Error('Expected invalid pixel rejection.');
    expect(invalidPixels.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_required_frame_blank', severity: 'error' }),
    ]));
    expect(existsSync(archivePath)).toBe(false);
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
    const foreignTemporaryPath = path.join(
      path.dirname(archivePath),
      `.${path.basename(archivePath)}.foreign.tmp`,
    );
    const foreignBackupPath = path.join(
      path.dirname(archivePath),
      `.${path.basename(archivePath)}.foreign.bak`,
    );
    writeFileSync(foreignTemporaryPath, 'foreign temporary');
    writeFileSync(foreignBackupPath, 'foreign backup');
    let renameCalls = 0;
    let ownedTemporaryPath: string | undefined;
    let ownedBackupPath: string | undefined;

    const result = await packAssetPack({
      packDirectory,
      workspace,
      runtime,
      fileOps: defaultFileOps({
        renameSync(from, to) {
          renameCalls += 1;
          if (renameCalls === 1) ownedBackupPath = String(to);
          if (renameCalls === 2) ownedTemporaryPath = String(from);
          if (renameCalls === 2) throw new Error('injected publication failure');
          renameSync(from, to);
        },
      }),
    });

    expect(result).toMatchObject({ ok: false });
    expect(readFileSync(archivePath)).toEqual(previousBytes);
    expect(renameCalls).toBe(3);
    expect(path.dirname(ownedTemporaryPath ?? '')).toBe(path.dirname(archivePath));
    expect(path.dirname(ownedBackupPath ?? '')).toBe(path.dirname(archivePath));
    expect(ownedTemporaryPath && existsSync(ownedTemporaryPath)).toBe(false);
    expect(ownedBackupPath && existsSync(ownedBackupPath)).toBe(false);
    expect(readFileSync(foreignTemporaryPath, 'utf8')).toBe('foreign temporary');
    expect(readFileSync(foreignBackupPath, 'utf8')).toBe('foreign backup');
    expect([...siblingPublicationPaths(archivePath)].sort()).toEqual(
      [foreignBackupPath, foreignTemporaryPath].sort(),
    );
  });

  it('preserves the previous archive when publication fails before its backup rename', async () => {
    const { runtime, workspaceRoot } = createRuntimeFixture();
    const { workspace, packDirectory } = createPack(workspaceRoot);
    writeWalkPng(path.join(packDirectory, 'sprites/wind-braid/walk.png'));
    const archivePath = path.join(workspace.packsRoot, 'acme.wind-braid-1.0.0.lpc-assets.zip');
    const previousBytes = Buffer.from('previous archive');
    writeFileSync(archivePath, previousBytes);
    let renameCalls = 0;

    const result = await packAssetPack({
      packDirectory,
      workspace,
      runtime,
      fileOps: defaultFileOps({
        renameSync() {
          renameCalls += 1;
          throw new Error('injected pre-backup failure');
        },
      }),
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'asset_pack_publish_failed' })],
    });
    expect(renameCalls).toBe(1);
    expect(readFileSync(archivePath)).toEqual(previousBytes);
    expect(siblingPublicationPaths(archivePath)).toEqual([]);
  });

  it('leaves no target or owned temporary path when first publication fails', async () => {
    const { runtime, workspaceRoot } = createRuntimeFixture();
    const { workspace, packDirectory } = createPack(workspaceRoot);
    writeWalkPng(path.join(packDirectory, 'sprites/wind-braid/walk.png'));
    const archivePath = path.join(workspace.packsRoot, 'acme.wind-braid-1.0.0.lpc-assets.zip');

    const result = await packAssetPack({
      packDirectory,
      workspace,
      runtime,
      fileOps: defaultFileOps({
        renameSync() {
          throw new Error('injected first-publication failure');
        },
      }),
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'asset_pack_publish_failed' })],
    });
    expect(existsSync(archivePath)).toBe(false);
    expect(siblingPublicationPaths(archivePath)).toEqual([]);
  });

  it.each(['directory', 'symlink'] as const)(
    'rejects an existing %s archive target before publication',
    async (targetKind) => {
      const { runtime, workspaceRoot } = createRuntimeFixture();
      const { workspace, packDirectory } = createPack(workspaceRoot);
      writeWalkPng(path.join(packDirectory, 'sprites/wind-braid/walk.png'));
      const archivePath = path.join(
        workspace.packsRoot,
        'acme.wind-braid-1.0.0.lpc-assets.zip',
      );
      if (targetKind === 'directory') {
        mkdirSync(archivePath);
      } else {
        const symlinkTarget = path.join(workspaceRoot, 'outside-archive');
        writeFileSync(symlinkTarget, 'outside archive');
        symlinkSync(symlinkTarget, archivePath, 'file');
      }

      const result = await packAssetPack({ packDirectory, workspace, runtime });

      expect(result).toMatchObject({
        ok: false,
        diagnostics: [expect.objectContaining({ code: 'asset_pack_archive_target_unsafe' })],
      });
      expect(lstatSync(archivePath).isDirectory()).toBe(targetKind === 'directory');
      expect(lstatSync(archivePath).isSymbolicLink()).toBe(targetKind === 'symlink');
      expect(siblingPublicationPaths(archivePath)).toEqual([]);
    },
  );

  it.skipIf(process.platform === 'win32')(
    'rejects an existing special-file archive target before publication',
    async () => {
      const { runtime, workspaceRoot } = createRuntimeFixture();
      const { workspace, packDirectory } = createPack(workspaceRoot);
      writeWalkPng(path.join(packDirectory, 'sprites/wind-braid/walk.png'));
      const archivePath = path.join(
        workspace.packsRoot,
        'acme.wind-braid-1.0.0.lpc-assets.zip',
      );
      const created = spawnSync('mkfifo', [archivePath], { encoding: 'utf8' });
      if (created.status !== 0) {
        throw new Error(`Could not create FIFO fixture: ${created.stderr}`);
      }

      const result = await packAssetPack({ packDirectory, workspace, runtime });

      expect(result).toMatchObject({
        ok: false,
        diagnostics: [expect.objectContaining({ code: 'asset_pack_archive_target_unsafe' })],
      });
      expect(lstatSync(archivePath).isFIFO()).toBe(true);
      expect(siblingPublicationPaths(archivePath)).toEqual([]);
    },
  );
});
