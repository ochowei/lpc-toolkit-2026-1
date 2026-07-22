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
  readlinkSync,
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
import { doctorAssetPacks } from '../src/asset-pack-doctor.js';
import { loadAssetPackFiles } from '../src/asset-pack-files.js';
import {
  assetPackCompileDigest,
  assetPackCompileProjectionFromRegistry,
  assetPackRegistryBytes,
  type AssetPackRegistryDocument,
  type AssetPackRegistryEntry,
  type InstalledAssetPackRegistryEntry,
  type LinkedAssetPackRegistryEntry,
} from '../src/asset-pack-registry.js';
import type { AssetPackDesiredState } from '../src/asset-pack-state.js';
import { syncLinkedAssetPack } from '../src/asset-pack-sync.js';
import {
  publishAssetPackGeneration,
  type AssetPackTransactionJournal,
  type AssetPackTransactionPhase,
  type AssetTransactionFileOps,
} from '../src/asset-pack-transaction.js';
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

const BASE_CREDIT = {
  file: 'hair/braid',
  authors: ['Base Artist'],
  licenses: ['GPL 3.0'],
  urls: ['https://example.com/base'],
  notes: 'Base fixture.',
} as const;

interface Fixture {
  readonly root: string;
  readonly assetsRoot: string;
  readonly upstreamRoot: string;
  readonly cacheRoot: string;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
}

interface GuardSnapshot {
  readonly workspace: Readonly<Record<string, string>>;
  readonly cache: Readonly<Record<string, string>>;
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

function pngBytes(color: string, animation: AnimationName = 'walk'): Buffer {
  const bounds = geometryBounds(animation);
  const canvas = createCanvas(bounds.width, bounds.height);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, bounds.width, bounds.height);
  return canvas.toBuffer('image/png');
}

function baseDefinition(overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    name: 'Braid',
    type_name: 'hair',
    animations: ['walk'],
    credits: [BASE_CREDIT],
    layer_1: {
      zPos: 50,
      male: 'hair/braid/',
      female: 'hair/braid/',
    },
    ...overrides,
  };
}

function createFixture(): Fixture {
  const root = createDirectory('lpc-asset-pack-doctor-workspace-');
  const assetsRoot = path.join(root, 'base-assets');
  mkdirSync(path.join(assetsRoot, 'sheet_definitions/hair'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'palette_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'spritesheets'), { recursive: true });
  writeJson(path.join(assetsRoot, 'sheet_definitions/hair/braid.json'), baseDefinition());
  writeFileSync(
    path.join(assetsRoot, 'CREDITS.csv'),
    'filename,notes,authors,licenses,urls\n',
  );
  writeFileSync(path.join(assetsRoot, 'sentinel.txt'), 'base sentinel\n');

  const upstreamRoot = path.join(root, 'upstream');
  mkdirSync(upstreamRoot);
  writeFileSync(path.join(upstreamRoot, 'sentinel.txt'), 'upstream sentinel\n');

  const cacheRoot = createDirectory('lpc-asset-pack-doctor-cache-');
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
  readonly sourcePath?: string;
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
          source: options.sourcePath ?? `sprites/${options.localId}/walk.png`,
        }],
      }],
    }],
  };
}

function extensionSource(options: {
  readonly packId: string;
  readonly displayName: string;
  readonly definitionDigest: string;
  readonly creditDigest: string;
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly bodyTypes: readonly ('male' | 'female')[];
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
          bodyTypes: options.bodyTypes,
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
  fixture: Fixture,
  source: AssetPackSource,
  color: string,
): string {
  const root = path.join(fixture.workspace.packsRoot, source.id);
  writeJson(path.join(root, 'asset-pack.json'), source);
  for (const asset of source.assets) {
    if (asset.kind === 'new-item') {
      for (const layer of asset.layers) {
        for (const sprite of layer.sprites) {
          const target = path.join(root, ...sprite.source.split('/'));
          mkdirSync(path.dirname(target), { recursive: true });
          writeFileSync(target, pngBytes(color, sprite.animation));
        }
      }
    } else {
      for (const animation of asset.addAnimations) {
        for (const layer of animation.layers) {
          const target = path.join(root, ...layer.source.split('/'));
          mkdirSync(path.dirname(target), { recursive: true });
          writeFileSync(target, pngBytes(color, animation.animation));
        }
      }
    }
  }
  return root;
}

async function linkPack(
  fixture: Fixture,
  source: AssetPackSource,
  color: string,
): Promise<string> {
  const packRoot = writePack(fixture, source, color);
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

async function linkNewPack(fixture: Fixture, options: {
  readonly packId: string;
  readonly localId: string;
  readonly color: string;
  readonly displayName?: string;
  readonly sourcePath?: string;
}): Promise<string> {
  return linkPack(fixture, packSource({
    packId: options.packId,
    displayName: options.displayName ?? options.packId,
    localId: options.localId,
    ...(options.sourcePath ? { sourcePath: options.sourcePath } : {}),
  }), options.color);
}

async function linkExtensionPack(fixture: Fixture, options: {
  readonly packId: string;
  readonly destinationPath: string;
  readonly bodyTypes: readonly ('male' | 'female')[];
  readonly color: string;
}): Promise<string> {
  const baseline = loadActiveAssetPackBaseline({
    runtime: fixture.runtime,
    workspace: fixture.workspace,
  });
  const definitionDigest = baseline.definitionDigests.get('braid');
  const creditDigest = baseline.creditDigests.get('braid');
  if (!definitionDigest || !creditDigest) throw new Error('Missing braid baseline digests.');
  return linkPack(fixture, extensionSource({
    packId: options.packId,
    displayName: options.packId,
    definitionDigest,
    creditDigest,
    sourcePath: `sprites/${options.packId}/climb.png`,
    destinationPath: options.destinationPath,
    bodyTypes: options.bodyTypes,
  }), options.color);
}

function readRegistry(workspace: AssetWorkspace): AssetPackRegistryDocument {
  return readJson<AssetPackRegistryDocument>(workspace.registryPath);
}

function writeRegistry(workspace: AssetWorkspace, document: AssetPackRegistryDocument): void {
  writeFileSync(workspace.registryPath, assetPackRegistryBytes(document));
}

function refreshLinkedSourceSnapshot(workspace: AssetWorkspace, packId: string): void {
  const document = readRegistry(workspace);
  const linked = document.entries.find(
    (entry): entry is LinkedAssetPackRegistryEntry =>
      entry.kind === 'linked' && entry.packId === packId,
  );
  if (!linked) throw new Error(`Missing linked registry entry: ${packId}`);
  const loaded = loadAssetPackFiles(linked.sourceDirectory);
  if (!loaded.ok) throw new Error(loaded.diagnostics.map((entry) => entry.message).join(' | '));
  const entries = document.entries.map((entry): AssetPackRegistryEntry =>
    entry.packId === packId
      ? {
          ...linked,
          contentDigest: loaded.contentDigest,
          sourceDigests: Object.fromEntries(
            [...loaded.sourceDigests].sort(([left], [right]) => left.localeCompare(right)),
          ),
          acknowledgements: loaded.pack.acknowledgements,
          replacements: loaded.pack.replacements,
        }
      : entry);
  writeRegistry(workspace, { ...document, entries });
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
  if (!linked) throw new Error(`Missing linked registry entry: ${packId}`);
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
  mkdirSync(installedDirectory, { recursive: true });
  writeFileSync(path.join(installedDirectory, 'asset-pack.json'), manifestBytes);
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
  const entries = document.entries.map((entry): AssetPackRegistryEntry =>
    entry.packId === packId ? installed : entry);
  writeRegistry(workspace, { ...document, entries });
  return installed;
}

function snapshotTree(root: string): Readonly<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  if (!existsSync(root) && !lstatExists(root)) return snapshot;
  const visit = (current: string): void => {
    for (const name of readdirSync(current).sort((left, right) => left.localeCompare(right))) {
      const target = path.join(current, name);
      const relative = path.relative(root, target).split(path.sep).join('/');
      const stats = lstatSync(target);
      if (stats.isSymbolicLink()) {
        snapshot[relative] = `<symlink:${readFileLink(target)}>`;
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

function lstatExists(target: string): boolean {
  try {
    lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

function readFileLink(target: string): string {
  return path.resolve(path.dirname(target), readlinkSync(target));
}

function guardSnapshot(fixture: Fixture): GuardSnapshot {
  return {
    workspace: snapshotTree(fixture.root),
    cache: snapshotTree(fixture.cacheRoot),
  };
}

function expectGuardsUnchanged(fixture: Fixture, before: GuardSnapshot): void {
  expect(snapshotTree(fixture.root)).toEqual(before.workspace);
  expect(snapshotTree(fixture.cacheRoot)).toEqual(before.cache);
  expect(readFileSync(path.join(fixture.assetsRoot, 'sentinel.txt'), 'utf8'))
    .toBe('base sentinel\n');
  expect(readFileSync(path.join(fixture.upstreamRoot, 'sentinel.txt'), 'utf8'))
    .toBe('upstream sentinel\n');
}

function expectSortedChecks(checks: readonly {
  readonly code: string;
  readonly status: 'pass' | 'warning' | 'error';
  readonly path?: string;
  readonly packId?: string;
}[]): void {
  const severity = { error: 0, warning: 1, pass: 2 } as const;
  const sorted = [...checks].sort((left, right) =>
    severity[left.status] - severity[right.status]
      || left.code.localeCompare(right.code)
      || (left.packId ?? '').localeCompare(right.packId ?? '')
      || (left.path ?? '').localeCompare(right.path ?? ''));
  expect(checks).toEqual(sorted);
}

function emptyDesiredState(fixture: Fixture): AssetPackDesiredState {
  const markerBytes = readFileSync(
    path.join(fixture.workspace.outputRoot, '.lpc-toolkit-managed.json'),
  );
  const marker = JSON.parse(markerBytes.toString('utf8')) as {
    readonly schema: string;
    readonly workspaceId: string;
  };
  expect(marker.schema).toBe(ASSET_OUTPUT_MARKER_SCHEMA);
  const projection = { definitions: [], sprites: [], credits: [], ownership: [] };
  return {
    ok: true,
    active: [],
    compilePlan: { ...projection, diagnostics: [] },
    outputFiles: new Map([['.lpc-toolkit-managed.json', markerBytes]]),
    registry: {
      schema: 'lpc-toolkit.asset-workspace-registry.v2',
      workspaceId: marker.workspaceId,
      entries: [],
      generatedDigests: {},
      compileDigest: assetPackCompileDigest(projection),
    },
    warnings: [],
  };
}

function transactionPath(workspace: AssetWorkspace): string {
  return path.join(workspace.stateRoot, 'transaction.json');
}

async function seedCrashedPhase(
  fixture: Fixture,
  crashPoint: 'journal-durable' | 'output-swap' | 'source-phase' | 'registry-swap',
): Promise<AssetPackTransactionPhase> {
  let journalWriteCount = 0;
  const crashingOps: AssetTransactionFileOps = {
    ...REAL_FILE_OPS,
    writeFileSync(target, data, writeOptions) {
      if (String(target).includes('transaction.json.')) {
        journalWriteCount += 1;
        if (
          (crashPoint === 'output-swap' && journalWriteCount === 3)
          || (crashPoint === 'source-phase' && journalWriteCount === 4)
        ) {
          throw new Error(`injected crash after ${crashPoint}`);
        }
      }
      writeFileSync(target, data, writeOptions);
    },
    afterMutationValidationSync(operation, targets) {
      if (
        crashPoint === 'journal-durable'
        && operation === 'rename'
        && path.resolve(targets[0] ?? '') === fixture.workspace.outputRoot
      ) {
        throw new Error(`injected crash after ${crashPoint}`);
      }
      if (
        crashPoint === 'registry-swap'
        && operation === 'remove'
        && targets.some((target) =>
          path.dirname(target) === path.dirname(fixture.workspace.outputRoot)
          && path.basename(target).endsWith('.backup'))
      ) {
        throw new Error(`injected crash after ${crashPoint}`);
      }
    },
  };
  const publication = await publishAssetPackGeneration({
    operation: 'sync',
    workspace: fixture.workspace,
    desiredState: emptyDesiredState(fixture),
    cleanupInstalledSources: [],
    fileOps: crashingOps,
  });
  expect(publication.ok).toBe(false);
  return readJson<AssetPackTransactionJournal>(transactionPath(fixture.workspace)).phase;
}

async function expectDoctorReadOnlyFailure(
  fixture: Fixture,
  expectedCode?: string,
): Promise<void> {
  const before = guardSnapshot(fixture);
  const report = await doctorAssetPacks({
    workspace: fixture.workspace,
    runtime: fixture.runtime,
  });
  expect(report.healthy).toBe(false);
  expect(report.checks.some((check) => check.status === 'error')).toBe(true);
  if (expectedCode) {
    expect(report.checks.map((check) => check.code)).toContain(expectedCode);
  }
  expectSortedChecks(report.checks);
  expectGuardsUnchanged(fixture, before);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('doctorAssetPacks healthy and recovery reports', () => {
  it.each(['empty', 'linked-only', 'installed-only', 'mixed'] as const)(
    'reports a healthy %s workspace without mutation',
    async (scenario) => {
      const fixture = createFixture();
      if (scenario !== 'empty') {
        await linkNewPack(fixture, {
          packId: 'alpha.pack',
          localId: 'alpha',
          color: '#aa3300',
        });
      }
      if (scenario === 'installed-only') {
        convertLinkedToInstalled(fixture.workspace, 'alpha.pack');
      }
      if (scenario === 'mixed') {
        await linkNewPack(fixture, {
          packId: 'bravo.pack',
          localId: 'bravo',
          color: '#0033aa',
        });
        convertLinkedToInstalled(fixture.workspace, 'alpha.pack');
      }
      const before = guardSnapshot(fixture);

      const report = await doctorAssetPacks({
        workspace: fixture.workspace,
        runtime: fixture.runtime,
      });

      expect(report).toMatchObject({
        schema: 'lpc-toolkit.asset-pack-doctor.v1',
        healthy: true,
        recovery: 'none',
      });
      expect(report.packs.map((entry) => [entry.packId, entry.kind])).toEqual(
        scenario === 'empty'
          ? []
          : scenario === 'linked-only'
            ? [['alpha.pack', 'linked']]
            : scenario === 'installed-only'
              ? [['alpha.pack', 'installed']]
              : [['alpha.pack', 'installed'], ['bravo.pack', 'linked']],
      );
      expect(report.checks.length).toBeGreaterThan(0);
      expect(report.checks.every((check) => check.status === 'pass')).toBe(true);
      expectSortedChecks(report.checks);
      expectGuardsUnchanged(fixture, before);
    },
  );

  it.each([
    ['journal-durable', 'prepared', 'rolled-back'],
    ['output-swap', 'prepared', 'rolled-back'],
    ['source-phase', 'output-published', 'rolled-back'],
    ['registry-swap', 'registry-published', 'completed'],
  ] as const)(
    'recovers %s transaction state, audits it, and is idempotent',
    async (crashPoint, expectedPhase, expectedRecovery) => {
      const fixture = createFixture();
      expect(await seedCrashedPhase(fixture, crashPoint)).toBe(expectedPhase);

      const report = await doctorAssetPacks({
        workspace: fixture.workspace,
        runtime: fixture.runtime,
      });

      expect(report).toMatchObject({
        schema: 'lpc-toolkit.asset-pack-doctor.v1',
        healthy: true,
        recovery: expectedRecovery,
        packs: [],
      });
      expect(existsSync(transactionPath(fixture.workspace))).toBe(false);
      const recovered = guardSnapshot(fixture);

      const repeated = await doctorAssetPacks({
        workspace: fixture.workspace,
        runtime: fixture.runtime,
      });
      expect(repeated).toMatchObject({ healthy: true, recovery: 'none', packs: [] });
      expectGuardsUnchanged(fixture, recovered);
    },
  );
});

describe('doctorAssetPacks registry, source, output, compiler, and attribution audits', () => {
  it('reports a marker/workspace mismatch without repair', async () => {
    const fixture = createFixture();
    await linkNewPack(fixture, { packId: 'alpha.pack', localId: 'alpha', color: '#aa3300' });
    writeJson(path.join(fixture.workspace.outputRoot, '.lpc-toolkit-managed.json'), {
      schema: ASSET_OUTPUT_MARKER_SCHEMA,
      workspaceId: 'wrong-workspace',
    });
    await expectDoctorReadOnlyFailure(fixture, 'asset_output_root_unowned');
  });

  it.each(['unknown-field', 'digest-tamper'] as const)(
    'reports registry %s without rewriting it',
    async (scenario) => {
      const fixture = createFixture();
      await linkNewPack(fixture, { packId: 'alpha.pack', localId: 'alpha', color: '#aa3300' });
      const registry = readRegistry(fixture.workspace);
      if (scenario === 'unknown-field') {
        writeJson(fixture.workspace.registryPath, { ...registry, unexpected: true });
      } else {
        const generatedPath = Object.keys(registry.generatedDigests)
          .find((entry) => entry.startsWith('spritesheets/'));
        if (!generatedPath) throw new Error('Missing generated sprite digest.');
        writeRegistry(fixture.workspace, {
          ...registry,
          generatedDigests: {
            ...registry.generatedDigests,
            [generatedPath]: `sha256:${'0'.repeat(64)}`,
          },
        });
      }
      await expectDoctorReadOnlyFailure(fixture, 'asset_digest_mismatch');
    },
  );

  it.each(['missing', 'content-drift'] as const)(
    'reports linked source %s without changing artist source',
    async (scenario) => {
      const fixture = createFixture();
      const packRoot = await linkNewPack(fixture, {
        packId: 'alpha.pack', localId: 'alpha', color: '#aa3300',
      });
      if (scenario === 'missing') {
        rmSync(packRoot, { recursive: true, force: true });
      } else {
        writeFileSync(path.join(packRoot, 'sprites/alpha/walk.png'), pngBytes('#0033aa'));
      }
      await expectDoctorReadOnlyFailure(
        fixture,
        scenario === 'missing' ? 'asset_source_missing' : 'asset_digest_mismatch',
      );
    },
  );

  it.each(['escape', 'symlink', 'missing-receipt', 'receipt-drift', 'source-drift'] as const)(
    'reports installed source %s without repair',
    async (scenario) => {
      const fixture = createFixture();
      await linkNewPack(fixture, {
        packId: 'alpha.pack', localId: 'alpha', color: '#aa3300',
      });
      const installed = convertLinkedToInstalled(fixture.workspace, 'alpha.pack');
      if (scenario === 'escape') {
        const registry = readRegistry(fixture.workspace);
        const entries = registry.entries.map((entry): AssetPackRegistryEntry =>
          entry.packId === installed.packId && entry.kind === 'installed'
            ? { ...entry, installedDirectory: fixture.cacheRoot }
            : entry);
        writeRegistry(fixture.workspace, { ...registry, entries });
      } else if (scenario === 'symlink') {
        const outside = createDirectory('lpc-asset-pack-doctor-installed-symlink-');
        writeFileSync(path.join(outside, 'sentinel.txt'), 'outside sentinel\n');
        rmSync(installed.installedDirectory, { recursive: true, force: true });
        symlinkSync(
          outside,
          installed.installedDirectory,
          process.platform === 'win32' ? 'junction' : 'dir',
        );
      } else if (scenario === 'missing-receipt') {
        rmSync(path.join(installed.installedDirectory, 'install-receipt.json'));
      } else if (scenario === 'receipt-drift') {
        const receiptPath = path.join(installed.installedDirectory, 'install-receipt.json');
        writeJson(receiptPath, { ...readJson<Record<string, unknown>>(receiptPath), packId: 'wrong.pack' });
      } else {
        writeFileSync(
          path.join(installed.installedDirectory, 'sprites/alpha/walk.png'),
          pngBytes('#0033aa'),
        );
      }
      await expectDoctorReadOnlyFailure(fixture, 'asset_digest_mismatch');
    },
  );

  it.each(['missing', 'extra', 'digest-drift'] as const)(
    'reports generated output %s without recreating or deleting output',
    async (scenario) => {
      const fixture = createFixture();
      await linkNewPack(fixture, { packId: 'alpha.pack', localId: 'alpha', color: '#aa3300' });
      const registry = readRegistry(fixture.workspace);
      const generatedPath = Object.keys(registry.generatedDigests)
        .find((entry) => entry.startsWith('spritesheets/'));
      if (!generatedPath) throw new Error('Missing generated sprite path.');
      const target = path.join(fixture.workspace.outputRoot, ...generatedPath.split('/'));
      if (scenario === 'missing') {
        rmSync(target);
      } else if (scenario === 'extra') {
        writeFileSync(path.join(fixture.workspace.outputRoot, 'unknown.bin'), 'unknown\n');
      } else {
        writeFileSync(target, Buffer.from('tampered output\n'));
      }
      await expectDoctorReadOnlyFailure(
        fixture,
        scenario === 'extra' ? 'asset_output_root_unowned' : 'asset_digest_mismatch',
      );
    },
  );

  it('reports a compile digest mismatch without rewriting the registry', async () => {
    const fixture = createFixture();
    await linkNewPack(fixture, { packId: 'alpha.pack', localId: 'alpha', color: '#aa3300' });
    const registry = readRegistry(fixture.workspace);
    writeRegistry(fixture.workspace, {
      ...registry,
      compileDigest: `sha256:${'0'.repeat(64)}`,
    });
    await expectDoctorReadOnlyFailure(fixture, 'asset_digest_mismatch');
  });

  it('reports self-consistent ownership drift against freshly compiled desired state', async () => {
    const fixture = createFixture();
    await linkNewPack(fixture, {
      packId: 'alpha.pack',
      localId: 'alpha',
      sourcePath: 'sprites/shared/walk.png',
      color: '#aa3300',
    });
    await linkNewPack(fixture, {
      packId: 'bravo.pack',
      localId: 'bravo',
      sourcePath: 'sprites/shared/walk.png',
      color: '#aa3300',
    });
    const registry = readRegistry(fixture.workspace);
    const [alpha, bravo] = registry.entries;
    if (!alpha || !bravo) throw new Error('Missing ownership fixtures.');
    const swapGeneratedState = (
      entry: AssetPackRegistryEntry,
      source: AssetPackRegistryEntry,
    ): AssetPackRegistryEntry => ({
      ...entry,
      generatedPaths: source.generatedPaths,
      logicalDestinations: source.logicalDestinations,
      generatedSprites: source.generatedSprites,
      generatedCredits: source.generatedCredits,
    });
    const entries = [
      swapGeneratedState(alpha, bravo),
      swapGeneratedState(bravo, alpha),
    ];
    const compileDigest = assetPackCompileDigest(assetPackCompileProjectionFromRegistry({
      workspace: fixture.workspace,
      entries,
    }));
    writeRegistry(fixture.workspace, { ...registry, entries, compileDigest });

    await expectDoctorReadOnlyFailure(fixture, 'asset_desired_state_mismatch');
  });

  it('reports a freshly introduced replacement conflict without publishing a winner', async () => {
    const fixture = createFixture();
    await linkExtensionPack(fixture, {
      packId: 'alpha.extension',
      destinationPath: 'spritesheets/hair/braid/alpha/climb.png',
      bodyTypes: ['male'],
      color: '#aa3300',
    });
    const bravoRoot = await linkExtensionPack(fixture, {
      packId: 'bravo.extension',
      destinationPath: 'spritesheets/hair/braid/bravo/climb.png',
      bodyTypes: ['female'],
      color: '#0033aa',
    });
    const bravo = readJson<AssetPackSource>(path.join(bravoRoot, 'asset-pack.json'));
    const asset = bravo.assets[0];
    if (!asset || asset.kind !== 'extend-item') throw new Error('Missing extension fixture.');
    writeJson(path.join(bravoRoot, 'asset-pack.json'), {
      ...bravo,
      assets: [{
        ...asset,
        addAnimations: asset.addAnimations.map((animation) => ({
          ...animation,
          layers: animation.layers.map((layer) => ({
            ...layer,
            bodyTypes: ['male'],
            destination: {
              ...layer.destination,
              path: 'spritesheets/hair/braid/alpha/climb.png',
            },
          })),
        })),
      }],
    });
    refreshLinkedSourceSnapshot(fixture.workspace, 'bravo.extension');

    await expectDoctorReadOnlyFailure(fixture, 'asset_path_conflict');
  });

  it('reports a stale base definition without changing the base source', async () => {
    const fixture = createFixture();
    await linkExtensionPack(fixture, {
      packId: 'alpha.extension',
      destinationPath: 'spritesheets/hair/braid/alpha/climb.png',
      bodyTypes: ['male'],
      color: '#aa3300',
    });
    writeJson(
      path.join(fixture.assetsRoot, 'sheet_definitions/hair/braid.json'),
      baseDefinition({ display_name: 'Changed baseline' }),
    );
    await expectDoctorReadOnlyFailure(fixture, 'asset_base_definition_changed');
  });

  it('reports a generated definition with missing compiler-derived credit', async () => {
    const fixture = createFixture();
    await linkNewPack(fixture, { packId: 'alpha.pack', localId: 'alpha', color: '#aa3300' });
    const registry = readRegistry(fixture.workspace);
    const definitionPath = registry.entries[0]?.generatedPaths
      .find((entry) => entry.startsWith('sheet_definitions/'));
    if (!definitionPath) throw new Error('Missing generated definition path.');
    const target = path.join(fixture.workspace.outputRoot, ...definitionPath.split('/'));
    const definition = readJson<ItemDefinition>(target);
    writeJson(target, { ...definition, credits: [] });
    await expectDoctorReadOnlyFailure(fixture, 'asset_digest_mismatch');
  });

  it('reports incomplete generated CREDITS.csv coverage even when its stored digest agrees', async () => {
    const fixture = createFixture();
    await linkNewPack(fixture, { packId: 'alpha.pack', localId: 'alpha', color: '#aa3300' });
    const creditsPath = path.join(fixture.workspace.outputRoot, 'CREDITS.csv');
    const incomplete = Buffer.from('filename,notes,authors,licenses,urls\n');
    writeFileSync(creditsPath, incomplete);
    const registry = readRegistry(fixture.workspace);
    writeRegistry(fixture.workspace, {
      ...registry,
      generatedDigests: { ...registry.generatedDigests, 'CREDITS.csv': sha256(incomplete) },
    });
    await expectDoctorReadOnlyFailure(fixture, 'asset_desired_state_mismatch');
  });
});

describe('doctorAssetPacks non-repair boundary', () => {
  it('does not adopt unregistered installed content or delete orphan installed/staging content', async () => {
    const fixture = createFixture();
    const unregistered = path.join(
      fixture.workspace.installedRoot,
      'unknown.pack',
      '1.0.0',
      'a'.repeat(64),
    );
    const orphanStaging = path.join(fixture.workspace.stagingRoot, 'orphan-operation');
    mkdirSync(unregistered, { recursive: true });
    mkdirSync(orphanStaging, { recursive: true });
    writeFileSync(path.join(unregistered, 'sentinel.txt'), 'unregistered\n');
    writeFileSync(path.join(orphanStaging, 'sentinel.txt'), 'orphan staging\n');
    const before = guardSnapshot(fixture);

    const report = await doctorAssetPacks({
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    });

    expect(report.packs).toEqual([]);
    expectGuardsUnchanged(fixture, before);
  });

  it('reports a malformed unsafe journal and leaves all bytes untouched', async () => {
    const fixture = createFixture();
    writeFileSync(transactionPath(fixture.workspace), '{not-json\n');
    await expectDoctorReadOnlyFailure(fixture, 'asset_transaction_unsafe');
  });
});
