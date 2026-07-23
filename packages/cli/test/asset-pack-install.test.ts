import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
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
import JSZip from 'jszip';
import {
  ASSET_PACK_SCHEMA,
  assetPackSourceFromNormalized,
  standardAnimationGeometry,
  type AnimationName,
  type AssetPackSource,
  type ItemDefinition,
} from '@lpc-toolkit/core';
import { createAssetPackArchive } from '@lpc-toolkit/asset-pack-format';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDeterministicAssetPackArchive,
  readAssetPackArchive,
} from '../src/asset-pack-archive-format.js';
import {
  ASSET_PACK_INSTALL_RECEIPT_SCHEMA,
  installAssetPack,
  type AssetPackInstallResult,
  type AssetPackInstallSuccess,
} from '../src/asset-pack-install.js';
import type {
  AssetPackLifecycleDiagnostic,
  AssetPackRegistryDocument,
  InstalledAssetPackRegistryEntry,
} from '../src/asset-pack-registry.js';
import { loadActiveAssetPackBaseline } from '../src/asset-pack-validation.js';
import { syncLinkedAssetPack } from '../src/asset-pack-sync.js';
import {
  recoverAssetPackTransaction,
  type AssetTransactionFileOps,
} from '../src/asset-pack-transaction.js';
import {
  ASSET_OUTPUT_MARKER_SCHEMA,
  assetPackInstalledDirectory,
  initializeAssetWorkspace,
  type AssetWorkspace,
} from '../src/asset-workspace.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { createRuntimeContext } from '../src/context.js';
import { nodeAssetPackFormatRuntime } from '../src/asset-pack-node-runtime.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

const temporaryDirectories: string[] = [];
const FIXED_NOW = new Date('2026-07-22T03:04:05.678Z');

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

const PACK_CREDITS = {
  authors: ['Pack Artist'],
  licenses: ['CC-BY-SA 4.0'],
  urls: ['https://example.com/pack-artist'],
  notes: 'Pack contribution.',
} as const;

const BASE_CREDIT = {
  file: 'packages/acme.shared-pack/shared-item/top/male-female/walk',
  authors: ['Shared Artist'],
  licenses: ['GPL 3.0'],
  urls: ['https://example.com/shared'],
  notes: 'Managed package baseline.',
} as const;

interface Fixture {
  readonly root: string;
  readonly assetsRoot: string;
  readonly upstreamRoot: string;
  readonly cacheRoot: string;
  readonly archiveRoot: string;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
}

interface ArchiveFixture {
  readonly path: string;
  readonly bytes: Buffer;
  readonly digest: string;
  readonly source: AssetPackSource;
}

interface InstallReceipt {
  readonly schema: string;
  readonly workspaceId: string;
  readonly packId: string;
  readonly version: string;
  readonly archiveDigest: string;
  readonly contentDigest: string;
  readonly installedAt: string;
  readonly payloadDigests: Readonly<Record<string, string>>;
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

function pngBytes(animation: AnimationName, color: string): Buffer {
  const bounds = geometryBounds(animation);
  const canvas = createCanvas(bounds.width, bounds.height);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, bounds.width, bounds.height);
  return canvas.toBuffer('image/png');
}

function baseDefinition(): ItemDefinition {
  return {
    name: 'acme.shared-pack--shared-item',
    type_name: 'hair',
    animations: ['walk'],
    credits: [BASE_CREDIT],
    layer_1: {
      zPos: 50,
      male: 'packages/acme.shared-pack/shared-item/top/male-female/',
      female: 'packages/acme.shared-pack/shared-item/top/male-female/',
    },
  };
}

function basicHairDefinition(): ItemDefinition {
  return {
    name: 'Braid',
    type_name: 'hair',
    animations: ['walk'],
    credits: [{
      file: 'hair/braid/walk',
      authors: ['Base Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.com/base'],
      notes: 'Base hair fixture.',
    }],
    layer_1: {
      zPos: 50,
      male: 'hair/braid/',
      female: 'hair/braid/',
    },
  };
}

function createFixture(options: { readonly managedBase?: boolean } = {}): Fixture {
  const root = createDirectory('lpc-asset-pack-install-workspace-');
  const assetsRoot = path.join(root, 'base-assets');
  mkdirSync(path.join(assetsRoot, 'sheet_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'palette_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'spritesheets'), { recursive: true });
  writeFileSync(
    path.join(assetsRoot, 'CREDITS.csv'),
    'filename,notes,authors,licenses,urls\n',
  );
  writeFileSync(path.join(assetsRoot, 'sentinel.txt'), 'base sentinel\n');
  if (options.managedBase) {
    writeJson(
      path.join(
        assetsRoot,
        'sheet_definitions/hair/acme.shared-pack--shared-item.json',
      ),
      baseDefinition(),
    );
  } else {
    writeJson(
      path.join(assetsRoot, 'sheet_definitions/hair/braid.json'),
      basicHairDefinition(),
    );
  }

  const upstreamRoot = path.join(root, 'upstream');
  mkdirSync(upstreamRoot, { recursive: true });
  writeFileSync(path.join(upstreamRoot, 'sentinel.txt'), 'upstream sentinel\n');

  const cacheRoot = createDirectory('lpc-asset-pack-install-cache-');
  writeFileSync(path.join(cacheRoot, 'sentinel.txt'), 'cache sentinel\n');
  const archiveRoot = createDirectory('lpc-asset-pack-install-archives-');

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
  return {
    root,
    assetsRoot,
    upstreamRoot,
    cacheRoot,
    archiveRoot,
    workspace,
    runtime,
  };
}

function newItemSource(options: {
  readonly packId: string;
  readonly version: string;
  readonly localIds?: readonly string[];
  readonly displayName?: string;
  readonly replacements?: AssetPackSource['replaces'];
  readonly status?: AssetPackSource['status'];
}): AssetPackSource {
  const localIds = options.localIds ?? ['moon-braid'];
  return {
    schema: ASSET_PACK_SCHEMA,
    id: options.packId,
    version: options.version,
    displayName: options.displayName ?? `Pack ${options.version}`,
    credits: PACK_CREDITS,
    ...(options.status ? { status: options.status } : {}),
    ...(options.replacements ? { replaces: options.replacements } : {}),
    assets: localIds.map((localId) => ({
      kind: 'new-item' as const,
      localId,
      displayName: localId,
      typeName: 'hair',
      bodyTypes: ['male', 'female'] as const,
      animations: ['walk'] as const,
      layers: [{
        id: 'foreground',
        zPos: 120,
        sprites: [{
          animation: 'walk' as const,
          source: `sprites/${localId}/foreground/walk.png`,
        }],
      }],
    })),
  };
}

function extensionSource(options: {
  readonly packId: string;
  readonly definitionDigest: string;
  readonly creditDigest: string;
  readonly replacements?: AssetPackSource['replaces'];
}): AssetPackSource {
  return {
    schema: ASSET_PACK_SCHEMA,
    id: options.packId,
    version: '1.0.0',
    displayName: options.packId,
    credits: PACK_CREDITS,
    ...(options.replacements ? { replaces: options.replacements } : {}),
    assets: [{
      kind: 'extend-item',
      itemId: 'acme.shared-pack--shared-item',
      baseDefinitionDigest: options.definitionDigest,
      baseCreditDigest: options.creditDigest,
      addAnimations: [{
        animation: 'climb',
        layers: [{
          layer: 'layer_1',
          bodyTypes: ['male', 'female'],
          source: `sprites/${options.packId}/climb.png`,
          destination: {
            path: 'spritesheets/packages/acme.shared-pack/shared-item/top/male-female/climb.png',
            evidence: 'artist-specified',
            accepted: true,
          },
        }],
      }],
    }],
  };
}

function payloadFiles(source: AssetPackSource): ReadonlyMap<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (const asset of source.assets) {
    if (asset.kind === 'new-item') {
      for (const layer of asset.layers) {
        for (const sprite of layer.sprites) {
          files.set(sprite.source, pngBytes(sprite.animation, '#aa5500'));
        }
      }
    } else {
      for (const animation of asset.addAnimations) {
        for (const layer of animation.layers) {
          files.set(layer.source, pngBytes(animation.animation, '#3355aa'));
        }
      }
    }
  }
  return files;
}

async function createArchive(
  fixture: Fixture,
  source: AssetPackSource,
  name: string,
  manifestBytes = Buffer.from(`${JSON.stringify(source, null, 2)}\n`),
): Promise<ArchiveFixture> {
  const bytes = source.status === 'draft'
    ? Buffer.from((await createAssetPackArchive({
      kind: 'draft',
      manifestDocument: source as unknown as Readonly<Record<string, unknown>>,
      sourceBytes: payloadFiles(source),
      runtime: nodeAssetPackFormatRuntime,
    })).archiveBytes)
    : await createDeterministicAssetPackArchive({
      manifestBytes,
      sourceBytes: payloadFiles(source),
    });
  const archivePath = path.join(fixture.archiveRoot, `${name}.lpc-assets.zip`);
  writeFileSync(archivePath, bytes);
  return { path: archivePath, bytes, digest: sha256(bytes), source };
}

async function createRawRepackedArchive(
  fixture: Fixture,
  source: AssetPackSource,
  name: string,
): Promise<ArchiveFixture> {
  const manifestBytes = Buffer.from(JSON.stringify(source));
  const files = new Map<string, Buffer>([
    ['asset-pack.json', manifestBytes],
    ...payloadFiles(source),
  ]);
  const checksumsBytes = Buffer.from(JSON.stringify({
    schema: 'lpc-toolkit.asset-pack-checksums.v1',
    files: [...files]
      .map(([filePath, bytes]) => ({
        path: filePath,
        size: bytes.byteLength,
        sha256: sha256(bytes),
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  }));
  const zip = new JSZip();
  zip.file('asset-pack.json', manifestBytes, { date: FIXED_NOW, unixPermissions: 0o100644, createFolders: false });
  zip.file('checksums.json', checksumsBytes, { date: FIXED_NOW, unixPermissions: 0o100644, createFolders: false });
  for (const [filePath, bytes] of payloadFiles(source)) {
    zip.file(filePath, bytes, { date: FIXED_NOW, unixPermissions: 0o100644, createFolders: false });
  }
  const bytes = Buffer.from(await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 1 },
    platform: 'UNIX',
  }));
  const archivePath = path.join(fixture.archiveRoot, `${name}.lpc-assets.zip`);
  writeFileSync(archivePath, bytes);
  return { path: archivePath, bytes, digest: sha256(bytes), source };
}

function writeLinkedPack(root: string, source: AssetPackSource): void {
  writeJson(path.join(root, 'asset-pack.json'), source);
  for (const [sourcePath, bytes] of payloadFiles(source)) {
    const target = path.join(root, ...sourcePath.split('/'));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
}

function expectSuccess(result: AssetPackInstallResult): AssetPackInstallSuccess {
  expect(result.ok, result.ok ? undefined : JSON.stringify(result.diagnostics, null, 2)).toBe(true);
  if (!result.ok) throw new Error(result.diagnostics[0]?.message);
  return result;
}

function expectFailure(result: AssetPackInstallResult): readonly AssetPackLifecycleDiagnostic[] {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Expected asset-pack install failure.');
  return result.diagnostics;
}

function workspaceId(workspace: AssetWorkspace): string {
  const marker = readJson<{ readonly schema: string; readonly workspaceId: string }>(
    path.join(workspace.outputRoot, '.lpc-toolkit-managed.json'),
  );
  expect(marker.schema).toBe(ASSET_OUTPUT_MARKER_SCHEMA);
  return marker.workspaceId;
}

function readRegistry(workspace: AssetWorkspace): AssetPackRegistryDocument {
  return readJson<AssetPackRegistryDocument>(workspace.registryPath);
}

function installedEntry(
  workspace: AssetWorkspace,
  packId: string,
): InstalledAssetPackRegistryEntry {
  const entry = readRegistry(workspace).entries.find(
    (candidate): candidate is InstalledAssetPackRegistryEntry =>
      candidate.kind === 'installed' && candidate.packId === packId,
  );
  if (!entry) throw new Error(`Missing installed registry entry: ${packId}`);
  return entry;
}

function snapshotTree(root: string): Readonly<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  if (!existsSync(root)) return snapshot;
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const target = path.join(directory, name);
      const relative = path.relative(root, target).split(path.sep).join('/');
      const stats = lstatSync(target);
      if (stats.isSymbolicLink()) {
        snapshot[relative] = '<symlink>';
      } else if (stats.isDirectory()) {
        snapshot[`${relative}/`] = '<directory>';
        visit(target);
      } else {
        snapshot[relative] = readFileSync(target).toString('base64');
      }
    }
  };
  visit(root);
  return snapshot;
}

function immutableSentinels(fixture: Fixture): Readonly<Record<string, Buffer>> {
  return {
    base: readFileSync(path.join(fixture.assetsRoot, 'sentinel.txt')),
    upstream: readFileSync(path.join(fixture.upstreamRoot, 'sentinel.txt')),
    cache: readFileSync(path.join(fixture.cacheRoot, 'sentinel.txt')),
  };
}

function expectSentinelsUnchanged(
  fixture: Fixture,
  before: Readonly<Record<string, Buffer>>,
): void {
  expect(readFileSync(path.join(fixture.assetsRoot, 'sentinel.txt'))).toEqual(before.base);
  expect(readFileSync(path.join(fixture.upstreamRoot, 'sentinel.txt'))).toEqual(before.upstream);
  expect(readFileSync(path.join(fixture.cacheRoot, 'sentinel.txt'))).toEqual(before.cache);
}

function transactionJournal(workspace: AssetWorkspace): {
  readonly phase: string;
  readonly finalInstalledSource?: string;
  readonly cleanupInstalledSources: readonly string[];
} {
  return readJson(path.join(workspace.stateRoot, 'transaction.json'));
}

function crashingFileOps(
  workspace: AssetWorkspace,
  crashPoint: 'before-journal' | 'before-source' | 'after-source' | 'after-registry',
): AssetTransactionFileOps {
  let journalWriteCount = 0;
  let installJournalSeen = false;
  return {
    ...REAL_FILE_OPS,
    writeFileSync(target, data, writeOptions) {
      if (
        crashPoint === 'before-journal'
        && path.basename(String(target)).startsWith('.registry.json.')
        && path.basename(String(target)).endsWith('.staged')
      ) {
        throw new Error('injected before-journal crash');
      }
      if (String(target).includes('transaction.json.')) {
        const journalText = typeof data === 'string'
          ? data
          : Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
        let operation: string | undefined;
        try {
          operation = (JSON.parse(journalText) as { readonly operation?: string }).operation;
        } catch {
          operation = undefined;
        }
        if (operation === 'install') {
          installJournalSeen = true;
          journalWriteCount += 1;
          if (
            (crashPoint === 'before-source' && journalWriteCount === 3)
            || (crashPoint === 'after-source' && journalWriteCount === 4)
          ) {
            throw new Error(`injected ${crashPoint} crash`);
          }
        }
      }
      writeFileSync(target, data, writeOptions);
    },
    afterMutationSync(operation, targets, boundary) {
      if (
        crashPoint === 'after-registry'
        && installJournalSeen
        && operation === 'rename'
        && boundary === 'mutation'
        && path.basename(targets[0] ?? '').endsWith('.staged')
        && path.resolve(targets[1] ?? '') === workspace.registryPath
      ) {
        throw new Error('injected after-registry crash');
      }
    },
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('installAssetPack lifecycle policy', () => {
  it('installs once, then returns an identical-archive no-op without changing managed state', async () => {
    const fixture = createFixture();
    const archive = await createArchive(
      fixture,
      newItemSource({ packId: 'acme.moon-hair', version: '1.0.0' }),
      'first',
    );

    const first = expectSuccess(await installAssetPack({
      archivePath: archive.path,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      now: () => FIXED_NOW,
    }));
    expect(first.action).toBe('installed');
    const beforeOutput = snapshotTree(fixture.workspace.outputRoot);
    const beforeState = snapshotTree(fixture.workspace.stateRoot);

    const second = expectSuccess(await installAssetPack({
      archivePath: archive.path,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      now: () => new Date('2030-01-01T00:00:00.000Z'),
    }));

    expect(second.action).toBe('unchanged');
    const authenticatedCurrent = installedEntry(fixture.workspace, 'acme.moon-hair');
    expect(second.installedDirectory).toBe(authenticatedCurrent.installedDirectory);
    const { action: _firstAction, ...firstIdentity } = first;
    const { action: _secondAction, ...secondIdentity } = second;
    expect(secondIdentity).toEqual(firstIdentity);
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(beforeOutput);
    expect(snapshotTree(fixture.workspace.stateRoot)).toEqual(beforeState);
  });

  it('rejects the same version with different archive bytes and upgrades a greater version', async () => {
    const fixture = createFixture();
    const source = newItemSource({ packId: 'acme.moon-hair', version: '1.0.0' });
    const first = await createArchive(fixture, source, 'first');
    expect(expectSuccess(await installAssetPack({
      archivePath: first.path,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    })).action).toBe('installed');

    const repacked = await createRawRepackedArchive(fixture, source, 'repacked');
    expect(repacked.digest).not.toBe(first.digest);
    const firstRead = await readAssetPackArchive({ archivePath: first.path, archiveBytes: first.bytes });
    const repackedRead = await readAssetPackArchive({ archivePath: repacked.path, archiveBytes: repacked.bytes });
    expect(firstRead.ok).toBe(true);
    expect(repackedRead.ok).toBe(true);
    if (!firstRead.ok || !repackedRead.ok) throw new Error('Expected raw repacked archive to verify.');
    expect(repackedRead.snapshot.payload.contentDigest).toBe(firstRead.snapshot.payload.contentDigest);
    const before = snapshotTree(fixture.workspace.stateRoot);
    const diagnostics = expectFailure(await installAssetPack({
      archivePath: repacked.path,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));
    expect(diagnostics[0]?.code).toBe('asset_pack_version_conflict');
    expect(snapshotTree(fixture.workspace.stateRoot)).toEqual(before);

    const upgrade = await createArchive(
      fixture,
      newItemSource({ packId: 'acme.moon-hair', version: '1.1.0' }),
      'upgrade',
    );
    const upgraded = expectSuccess(await installAssetPack({
      archivePath: upgrade.path,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));
    expect(upgraded.action).toBe('upgraded');
    expect(existsSync(firstInstallPath(fixture.workspace, first, 'acme.moon-hair', '1.0.0')))
      .toBe(false);
  });

  it('requires exact self pack, range, and all installed asset keys for a downgrade', async () => {
    const fixture = createFixture();
    const installedSource = newItemSource({
      packId: 'acme.moon-hair',
      version: '2.0.0',
      localIds: ['moon-braid', 'star-braid'],
    });
    const installedArchive = await createArchive(fixture, installedSource, 'installed-v2');
    expectSuccess(await installAssetPack({
      archivePath: installedArchive.path,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    for (const [label, replacements] of [
      ['incomplete', [{
        packId: 'acme.moon-hair', versions: '=2.0.0', assets: ['moon-braid'],
      }]],
      ['wrong-range', [{
        packId: 'acme.moon-hair', versions: '=3.0.0', assets: ['moon-braid', 'star-braid'],
      }]],
      ['wrong-pack', [{
        packId: 'other.moon-hair', versions: '=2.0.0', assets: ['moon-braid', 'star-braid'],
      }]],
    ] as const) {
      const rejected = await createArchive(fixture, newItemSource({
        packId: 'acme.moon-hair',
        version: '1.0.0',
        localIds: ['moon-braid', 'star-braid'],
        replacements,
      }), `downgrade-${label}`);
      expect(expectFailure(await installAssetPack({
        archivePath: rejected.path,
        workspace: fixture.workspace,
        runtime: fixture.runtime,
      }))[0]?.code).toBe('asset_pack_downgrade_unauthorized');
    }

    const authorized = await createArchive(fixture, newItemSource({
      packId: 'acme.moon-hair',
      version: '1.0.0',
      localIds: ['moon-braid', 'star-braid'],
      replacements: [{
        packId: 'acme.moon-hair',
        versions: '=2.0.0',
        assets: ['star-braid', 'moon-braid'],
      }],
    }), 'downgrade-authorized');
    expect(expectSuccess(await installAssetPack({
      archivePath: authorized.path,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    })).action).toBe('downgraded');
  });

  it('rejects installation over an active linked pack with the same ID', async () => {
    const fixture = createFixture();
    const source = newItemSource({ packId: 'acme.linked', version: '1.0.0' });
    const linkedRoot = path.join(fixture.workspace.packsRoot, 'acme.linked');
    writeLinkedPack(linkedRoot, source);
    const linked = await syncLinkedAssetPack({
      packDirectory: linkedRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    });
    expect(linked.ok).toBe(true);
    const archive = await createArchive(fixture, source, 'linked-conflict');
    const before = snapshotTree(linkedRoot);

    const diagnostics = expectFailure(await installAssetPack({
      archivePath: archive.path,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(diagnostics[0]?.code).toBe('asset_source_kind_conflict');
    expect(snapshotTree(linkedRoot)).toEqual(before);
  });

  it('rejects draft archives before staging or managed-state mutation', async () => {
    const fixture = createFixture();
    const archive = await createArchive(fixture, newItemSource({
      packId: 'acme.draft-hair',
      version: '1.0.0',
      status: 'draft',
    }), 'draft-pack');
    const beforeOutput = snapshotTree(fixture.workspace.outputRoot);
    const beforeState = snapshotTree(fixture.workspace.stateRoot);

    const diagnostics = expectFailure(await installAssetPack({
      archivePath: archive.path,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(diagnostics).toEqual([expect.objectContaining({
      code: 'asset_pack_draft',
      severity: 'error',
      packId: 'acme.draft-hair',
      details: { status: 'draft' },
    })]);
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(beforeOutput);
    expect(snapshotTree(fixture.workspace.stateRoot)).toEqual(beforeState);
    expect(existsSync(assetPackInstalledDirectory({
      workspace: fixture.workspace,
      packId: 'acme.draft-hair',
      version: '1.0.0',
      archiveDigest: archive.digest,
    }))).toBe(false);
  });

  it('accepts and rejects cross-package replacement according to compiler authorization', async () => {
    const fixture = createFixture({ managedBase: true });
    const baseline = loadActiveAssetPackBaseline({
      runtime: fixture.runtime,
      workspace: fixture.workspace,
    });
    const definitionDigest = baseline.definitionDigests.get('acme.shared-pack--shared-item')!;
    const creditDigest = baseline.creditDigests.get('acme.shared-pack--shared-item')!;
    const authorized = await createArchive(fixture, extensionSource({
      packId: 'omega.replacement',
      definitionDigest,
      creditDigest,
      replacements: [{
        packId: 'acme.shared-pack',
        versions: '>=1.0.0 <2.0.0',
        assets: ['shared-item'],
      }],
    }), 'authorized-replacement');
    expect(expectSuccess(await installAssetPack({
      archivePath: authorized.path,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    })).action).toBe('installed');

    const unauthorized = await createArchive(fixture, extensionSource({
      packId: 'zulu.unauthorized',
      definitionDigest,
      creditDigest,
    }), 'unauthorized-replacement');
    expect(expectFailure(await installAssetPack({
      archivePath: unauthorized.path,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }))).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_replacement_unauthorized' }),
    ]));
  });
});

function firstInstallPath(
  workspace: AssetWorkspace,
  archive: ArchiveFixture,
  packId: string,
  version: string,
): string {
  return path.join(
    workspace.stateRoot,
    'installed',
    packId,
    version,
    archive.digest.slice('sha256:'.length),
  );
}

describe('installAssetPack staging and receipts', () => {
  it('restores an absent registry and the exact managed trees when receipt timestamp creation fails', async () => {
    const fixture = createFixture();
    const archive = await createArchive(
      fixture,
      newItemSource({ packId: 'acme.receipt-failure', version: '1.0.0' }),
      'receipt-failure',
    );
    const outputBefore = snapshotTree(fixture.workspace.outputRoot);
    const stateBefore = snapshotTree(fixture.workspace.stateRoot);

    const diagnostics = expectFailure(await installAssetPack({
      archivePath: archive.path,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      now: () => {
        throw new Error('injected receipt timestamp failure');
      },
    }));

    expect(diagnostics[0]?.code).toBe('asset_publish_failed');
    expect(existsSync(fixture.workspace.registryPath)).toBe(false);
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(outputBefore);
    expect(snapshotTree(fixture.workspace.stateRoot)).toEqual(stateBefore);
  });

  it('restores an absent registry and the exact managed trees on pre-journal publication failure', async () => {
    const fixture = createFixture();
    const archive = await createArchive(
      fixture,
      newItemSource({ packId: 'acme.pre-journal-failure', version: '1.0.0' }),
      'pre-journal-failure',
    );
    const outputBefore = snapshotTree(fixture.workspace.outputRoot);
    const stateBefore = snapshotTree(fixture.workspace.stateRoot);

    const diagnostics = expectFailure(await installAssetPack({
      archivePath: archive.path,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      fileOps: crashingFileOps(fixture.workspace, 'before-journal'),
    }));

    expect(diagnostics[0]?.code).toBe('asset_publish_failed');
    expect(existsSync(fixture.workspace.registryPath)).toBe(false);
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(outputBefore);
    expect(snapshotTree(fixture.workspace.stateRoot)).toEqual(stateBefore);
  });

  it('installs normalized verified bytes at the full digest path with an exact receipt', async () => {
    const fixture = createFixture();
    const source = newItemSource({ packId: 'acme.receipt', version: '1.0.0' });
    const rawManifest = Buffer.from(JSON.stringify({
      assets: source.assets,
      credits: source.credits,
      displayName: source.displayName,
      version: source.version,
      id: source.id,
      schema: source.schema,
    }));
    const archive = await createArchive(fixture, source, 'receipt', rawManifest);
    const archiveBefore = readFileSync(archive.path);
    const sentinels = immutableSentinels(fixture);
    const inspected = await readAssetPackArchive({
      archivePath: archive.path,
      archiveBytes: archive.bytes,
    });
    if (!inspected.ok) throw new Error(inspected.diagnostics[0]?.message);

    const result = expectSuccess(await installAssetPack({
      archivePath: archive.path,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      now: () => FIXED_NOW,
    }));

    const expectedDirectory = firstInstallPath(
      fixture.workspace,
      archive,
      source.id,
      source.version,
    );
    expect(result.installedDirectory).toBe(expectedDirectory);
    expect(path.basename(expectedDirectory)).toHaveLength(64);
    expect(readFileSync(archive.path)).toEqual(archiveBefore);
    expectSentinelsUnchanged(fixture, sentinels);

    const manifestPath = path.join(expectedDirectory, 'asset-pack.json');
    expect(readJson(manifestPath)).toEqual(
      assetPackSourceFromNormalized(inspected.snapshot.payload.pack),
    );
    for (const [sourcePath, bytes] of inspected.snapshot.payload.sourceBytes) {
      expect(readFileSync(path.join(expectedDirectory, ...sourcePath.split('/')))).toEqual(bytes);
    }

    const receipt = readJson<InstallReceipt>(
      path.join(expectedDirectory, 'install-receipt.json'),
    );
    expect(Object.keys(receipt)).toEqual([
      'schema',
      'workspaceId',
      'packId',
      'version',
      'archiveDigest',
      'contentDigest',
      'installedAt',
      'payloadDigests',
    ]);
    expect(receipt).toMatchObject({
      schema: ASSET_PACK_INSTALL_RECEIPT_SCHEMA,
      workspaceId: workspaceId(fixture.workspace),
      packId: source.id,
      version: source.version,
      archiveDigest: archive.digest,
      contentDigest: inspected.snapshot.payload.contentDigest,
      installedAt: FIXED_NOW.toISOString(),
    });
    expect(receipt.payloadDigests).toEqual(Object.fromEntries([
      ['asset-pack.json', sha256(readFileSync(manifestPath))] as const,
      ...inspected.snapshot.payload.sourceDigests,
    ].sort(([left], [right]) => left.localeCompare(right))));

    const entry = installedEntry(fixture.workspace, source.id);
    expect(entry.installedDirectory).toBe(expectedDirectory);
    expect(entry.archiveDigest).toBe(archive.digest);
    expect(path.relative(path.join(fixture.workspace.stateRoot, 'installed'), entry.installedDirectory))
      .not.toMatch(/^\.\.(?:[/\\]|$)/);
    expect(result.generatedFileCount).toBe(Object.keys(readRegistry(
      fixture.workspace,
    ).generatedDigests).length);
  });

  it('extracts only beneath a private install staging root and refuses a symlinked staging root', async () => {
    const fixture = createFixture();
    const archive = await createArchive(
      fixture,
      newItemSource({ packId: 'acme.staging', version: '1.0.0' }),
      'staging',
    );
    const stagingRoot = path.join(fixture.workspace.stateRoot, 'staging');
    rmSync(stagingRoot, { recursive: true });
    const outside = createDirectory('lpc-asset-pack-install-staging-outside-');
    writeFileSync(path.join(outside, 'sentinel.txt'), 'outside sentinel\n');
    symlinkSync(outside, stagingRoot, 'dir');
    const outputBefore = snapshotTree(fixture.workspace.outputRoot);
    const stateBefore = snapshotTree(fixture.workspace.stateRoot);

    const diagnostics = expectFailure(await installAssetPack({
      archivePath: archive.path,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));

    expect(diagnostics[0]?.code).toBe('asset_publish_failed');
    expect(readFileSync(path.join(outside, 'sentinel.txt'), 'utf8')).toBe('outside sentinel\n');
    expect(readdirSync(outside)).toEqual(['sentinel.txt']);
    expect(existsSync(fixture.workspace.registryPath)).toBe(false);
    expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(outputBefore);
    expect(snapshotTree(fixture.workspace.stateRoot)).toEqual(stateBefore);
  });

  it.each([
    'CON',
    'prn.txt',
    'aux.',
    'nul ',
    'COM1.json',
    'lpt9...',
  ])('rejects the portable Windows device-name segment %s on every host', (packId) => {
    expect(() => assetPackInstalledDirectory({
      workspace: createFixture().workspace,
      packId,
      version: '1.0.0',
      archiveDigest: `sha256:${'a'.repeat(64)}`,
    })).toThrow(/unsafe path segment/iu);
  });

  it.each(['acme.conifer', 'com10', 'lpt10', 'prnter'])(
    'preserves the valid portable pack ID %s and the full archive digest path',
    (packId) => {
      const fixture = createFixture();
      const digest = '0123456789abcdef'.repeat(4);

      const installedDirectory = assetPackInstalledDirectory({
        workspace: fixture.workspace,
        packId,
        version: '1.2.3-beta.1',
        archiveDigest: `sha256:${digest}`,
      });

      expect(installedDirectory).toBe(path.join(
        fixture.workspace.installedRoot,
        packId,
        '1.2.3-beta.1',
        digest,
      ));
      expect(path.basename(installedDirectory)).toHaveLength(64);
    },
  );
});

describe('installAssetPack transaction boundaries', () => {
  it.each([
    ['before-source', 'rolled-back'] as const,
    ['after-source', 'rolled-back'] as const,
  ])(
    'recovers a crash %s and removes only the unreferenced new installed directory',
    async (crashPoint, recoveryAction) => {
      const fixture = createFixture();
      const archive = await createArchive(
        fixture,
        newItemSource({ packId: 'acme.crash', version: '1.0.0' }),
        crashPoint,
      );
      const artistRoot = path.join(fixture.workspace.packsRoot, 'artist-source');
      mkdirSync(artistRoot, { recursive: true });
      writeFileSync(path.join(artistRoot, 'sentinel.txt'), 'artist sentinel\n');
      const artistBefore = snapshotTree(artistRoot);
      const stagingSibling = path.join(fixture.workspace.stagingRoot, 'unlisted-sibling');
      mkdirSync(stagingSibling);
      writeFileSync(path.join(stagingSibling, 'sentinel.txt'), 'staging sibling\n');
      const outputBefore = snapshotTree(fixture.workspace.outputRoot);
      const stateBefore = snapshotTree(fixture.workspace.stateRoot);

      expectFailure(await installAssetPack({
        archivePath: archive.path,
        workspace: fixture.workspace,
        runtime: fixture.runtime,
        fileOps: crashingFileOps(fixture.workspace, crashPoint),
      }));
      const journal = transactionJournal(fixture.workspace);
      expect(journal.finalInstalledSource).toBeDefined();
      expect(journal.finalInstalledSource).toContain(
        `${path.sep}installed${path.sep}acme.crash${path.sep}1.0.0${path.sep}`,
      );
      expect(journal.finalInstalledSource).toMatch(/[0-9a-f]{64}$/);
      expect(readJson<{ readonly incomingInstalledSource?: string }>(
        path.join(fixture.workspace.stateRoot, 'transaction.json'),
      ).incomingInstalledSource).toMatch(/^\.lpc-toolkit\/asset-packs\/staging\/install-/);

      const recovered = recoverAssetPackTransaction({ workspace: fixture.workspace });
      expect(recovered).toEqual({ ok: true, action: recoveryAction });
      expect(existsSync(firstInstallPath(
        fixture.workspace,
        archive,
        'acme.crash',
        '1.0.0',
      ))).toBe(false);
      expect(readdirSync(fixture.workspace.stagingRoot)).toEqual(['unlisted-sibling']);
      expect(existsSync(fixture.workspace.registryPath)).toBe(false);
      expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(outputBefore);
      expect(snapshotTree(fixture.workspace.stateRoot)).toEqual(stateBefore);
      expect(readFileSync(path.join(stagingSibling, 'sentinel.txt'), 'utf8'))
        .toBe('staging sibling\n');
      expect(snapshotTree(artistRoot)).toEqual(artistBefore);
    },
  );

  it('completes after registry publication and deletes the prior version only during committed cleanup', async () => {
    const fixture = createFixture();
    const other = await createArchive(
      fixture,
      newItemSource({ packId: 'bravo.other', version: '1.0.0' }),
      'other',
    );
    expectSuccess(await installAssetPack({
      archivePath: other.path,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));
    const otherDirectory = installedEntry(fixture.workspace, 'bravo.other').installedDirectory;
    const otherBefore = snapshotTree(otherDirectory);

    const oldArchive = await createArchive(
      fixture,
      newItemSource({ packId: 'acme.crash-upgrade', version: '1.0.0' }),
      'upgrade-old',
    );
    expectSuccess(await installAssetPack({
      archivePath: oldArchive.path,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    }));
    const oldDirectory = installedEntry(
      fixture.workspace,
      'acme.crash-upgrade',
    ).installedDirectory;
    const newArchive = await createArchive(
      fixture,
      newItemSource({ packId: 'acme.crash-upgrade', version: '2.0.0' }),
      'upgrade-new',
    );

    expectFailure(await installAssetPack({
      archivePath: newArchive.path,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      fileOps: crashingFileOps(fixture.workspace, 'after-registry'),
    }));
    expect(existsSync(oldDirectory)).toBe(true);
    expect(transactionJournal(fixture.workspace).phase).toBe('sources-published');
    expect(installedEntry(fixture.workspace, 'acme.crash-upgrade').version).toBe('2.0.0');

    expect(recoverAssetPackTransaction({ workspace: fixture.workspace })).toEqual({
      ok: true,
      action: 'completed',
    });
    expect(existsSync(oldDirectory)).toBe(false);
    expect(existsSync(firstInstallPath(
      fixture.workspace,
      newArchive,
      'acme.crash-upgrade',
      '2.0.0',
    ))).toBe(true);
    expect(snapshotTree(otherDirectory)).toEqual(otherBefore);
  });
});
