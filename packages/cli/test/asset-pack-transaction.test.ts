import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
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
import { afterEach, describe, expect, it } from 'vitest';
import {
  ASSET_OUTPUT_MARKER_SCHEMA,
  initializeAssetWorkspace,
  type AssetWorkspace,
} from '../src/asset-workspace.js';
import type { AssetPackDesiredState } from '../src/asset-pack-state.js';
import {
  assetPackCompileDigest,
  assetPackRegistryBytes,
  type AssetPackRegistryDocument,
  type InstalledAssetPackRegistryEntry,
} from '../src/asset-pack-registry.js';
import {
  ASSET_PACK_TRANSACTION_SCHEMA,
  publishAssetPackGeneration,
  recoverAssetPackTransaction,
  type AssetPackTransactionJournal,
  type AssetPackTransactionPhase,
  type AssetTransactionFileOps,
} from '../src/asset-pack-transaction.js';

const temporaryDirectories: string[] = [];
const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const ARCHIVE_DIGEST = 'a'.repeat(64);

const REAL_FILE_OPS: AssetTransactionFileOps = {
  mkdirSync,
  writeFileSync,
  readFileSync,
  renameSync,
  rmSync,
  openSync,
  fsyncSync,
  closeSync,
};

interface Fixture {
  readonly root: string;
  readonly workspace: AssetWorkspace;
  readonly workspaceId: string;
  oldRegistryBytes: Buffer;
  readonly oldMarkerBytes: Buffer;
  readonly newMarkerBytes: Buffer;
}

function createDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function createFixture(): Fixture {
  const root = createDirectory('lpc-asset-pack-transaction-');
  const workspace = initializeAssetWorkspace(root);
  const marker = JSON.parse(
    readFileSync(path.join(workspace.outputRoot, '.lpc-toolkit-managed.json'), 'utf8'),
  ) as { readonly schema: string; readonly workspaceId: string };
  expect(marker.schema).toBe(ASSET_OUTPUT_MARKER_SCHEMA);
  const oldMarkerBytes = readFileSync(
    path.join(workspace.outputRoot, '.lpc-toolkit-managed.json'),
  );
  const newMarkerBytes = Buffer.from(`${JSON.stringify({
    schema: ASSET_OUTPUT_MARKER_SCHEMA,
    workspaceId: marker.workspaceId,
  })}\n`);
  const oldRegistryBytes = assetPackRegistryBytes({
    schema: 'lpc-toolkit.asset-workspace-registry.v2',
    workspaceId: marker.workspaceId,
    entries: [],
    generatedDigests: {},
    compileDigest: assetPackCompileDigest({
      definitions: [],
      sprites: [],
      credits: [],
      ownership: [],
    }),
  });
  writeFileSync(workspace.registryPath, oldRegistryBytes);
  return {
    root,
    workspace,
    workspaceId: marker.workspaceId,
    oldRegistryBytes,
    oldMarkerBytes,
    newMarkerBytes,
  };
}

function relativeToWorkspace(workspace: AssetWorkspace, target: string): string {
  return path.relative(workspace.root, target).split(path.sep).join('/');
}

function isPathWithinForTest(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function desiredState(fixture: Fixture): AssetPackDesiredState {
  return {
    ok: true,
    active: [],
    compilePlan: {
      definitions: [],
      sprites: [],
      credits: [],
      ownership: [],
      diagnostics: [],
    },
    outputFiles: new Map([
      ['.lpc-toolkit-managed.json', fixture.newMarkerBytes],
    ]),
    registry: {
      schema: 'lpc-toolkit.asset-workspace-registry.v2',
      workspaceId: fixture.workspaceId,
      entries: [],
      generatedDigests: {},
      compileDigest: assetPackCompileDigest({
        definitions: [],
        sprites: [],
        credits: [],
        ownership: [],
      }),
    },
    warnings: [],
  };
}

function installedDesiredState(
  fixture: Fixture,
  finalInstalledSource: string,
): AssetPackDesiredState {
  const desired = desiredState(fixture);
  const entry = installedRegistryEntry(finalInstalledSource, '1.0.0');
  return {
    ...desired,
    outputFiles: new Map([
      ...desired.outputFiles,
      ['CREDITS.csv', Buffer.alloc(0)],
    ]),
    registry: {
      ...desired.registry,
      entries: [entry],
      generatedDigests: {
        'CREDITS.csv': digestBytes(Buffer.alloc(0)),
      },
      compileDigest: assetPackCompileDigest({
        definitions: [],
        sprites: [],
        credits: [],
        ownership: [{ packId: entry.packId, logicalPaths: [] }],
      }),
    },
  };
}

function digestBytes(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function installedRegistryEntry(
  installedDirectory: string,
  version: string,
): InstalledAssetPackRegistryEntry {
  return {
    kind: 'installed',
    packId: 'acme.pack',
    version,
    displayName: 'Acme Pack',
    installedDirectory,
    archiveDigest: `sha256:${path.basename(installedDirectory)}`,
    contentDigest: `sha256:${'c'.repeat(64)}`,
    acknowledgements: [],
    sourceDigests: {},
    generatedPaths: [],
    logicalDestinations: [],
    generatedSprites: [],
    replacements: [],
    baselineDefinitionDigests: {},
    baselineCreditDigests: {},
    generatedCredits: [],
  };
}

function registryWithInstalledEntry(
  fixture: Fixture,
  entry: InstalledAssetPackRegistryEntry,
): AssetPackRegistryDocument {
  return {
    schema: 'lpc-toolkit.asset-workspace-registry.v2',
    workspaceId: fixture.workspaceId,
    entries: [entry],
    generatedDigests: { 'CREDITS.csv': digestBytes(Buffer.alloc(0)) },
    compileDigest: assetPackCompileDigest({
      definitions: [],
      sprites: [],
      credits: [],
      ownership: [{ packId: entry.packId, logicalPaths: [] }],
    }),
  };
}

function writeInstalledSource(
  fixture: Fixture,
  directory: string,
  version: string,
  archiveDigest = path.basename(directory),
): void {
  const payload = Buffer.from('{}\n');
  writeTreeFile(directory, 'asset-pack.json', payload.toString('utf8'));
  writeTreeFile(directory, 'install-receipt.json', `${JSON.stringify({
    schema: 'lpc-toolkit.asset-pack-install-receipt.v1',
    workspaceId: fixture.workspaceId,
    packId: 'acme.pack',
    version,
    archiveDigest: `sha256:${archiveDigest}`,
    contentDigest: `sha256:${'c'.repeat(64)}`,
    installedAt: '2026-07-22T00:00:00.000Z',
    payloadDigests: { 'asset-pack.json': digestBytes(payload) },
  }, null, 2)}\n`);
}

function installOldRegistryGeneration(
  fixture: Fixture,
  directory: string,
  version: string,
): void {
  writeInstalledSource(fixture, directory, version);
  writeFileSync(path.join(fixture.workspace.outputRoot, 'CREDITS.csv'), Buffer.alloc(0));
  const registry = registryWithInstalledEntry(
    fixture,
    installedRegistryEntry(directory, version),
  );
  fixture.oldRegistryBytes = assetPackRegistryBytes(registry);
  writeFileSync(fixture.workspace.registryPath, fixture.oldRegistryBytes);
}

function transactionPath(workspace: AssetWorkspace): string {
  return path.join(workspace.stateRoot, 'transaction.json');
}

function transactionClaimPath(workspace: AssetWorkspace): string {
  return path.join(workspace.stateRoot, 'transaction.lock');
}

function installedPath(workspace: AssetWorkspace, suffix = ARCHIVE_DIGEST): string {
  return path.join(workspace.stateRoot, 'installed', 'acme.pack', '1.0.0', suffix);
}

function writeTreeFile(root: string, relativePath: string, contents: string): void {
  const target = path.join(root, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
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

function baseJournal(
  fixture: Fixture,
  phase: AssetPackTransactionPhase,
): AssetPackTransactionJournal {
  const transactionRoot = path.join(
    fixture.workspace.stateRoot,
    'transactions',
    OPERATION_ID,
  );
  const stagingRoot = path.join(fixture.workspace.stateRoot, 'staging', OPERATION_ID);
  return {
    schema: ASSET_PACK_TRANSACTION_SCHEMA,
    workspaceId: fixture.workspaceId,
    operationId: OPERATION_ID,
    operation: 'install',
    phase,
    oldOutputBackup: relativeToWorkspace(
      fixture.workspace,
      path.join(transactionRoot, 'old-output'),
    ),
    oldRegistryBackup: relativeToWorkspace(
      fixture.workspace,
      path.join(transactionRoot, 'old-registry.json'),
    ),
    stagedOutput: relativeToWorkspace(fixture.workspace, path.join(stagingRoot, 'output')),
    stagedRegistry: relativeToWorkspace(
      fixture.workspace,
      path.join(stagingRoot, 'registry.json'),
    ),
    stagedInstalledSource: relativeToWorkspace(
      fixture.workspace,
      path.join(stagingRoot, 'installed-source'),
    ),
    finalInstalledSource: relativeToWorkspace(
      fixture.workspace,
      installedPath(fixture.workspace),
    ),
    cleanupInstalledSources: [
      relativeToWorkspace(
        fixture.workspace,
        path.join(
          fixture.workspace.stateRoot,
          'installed',
          'acme.pack',
          '0.9.0',
          'b'.repeat(64),
        ),
      ),
    ],
  };
}

function writeJournal(fixture: Fixture, journal: unknown): void {
  writeFileSync(transactionPath(fixture.workspace), `${JSON.stringify(journal, null, 2)}\n`);
}

function seedPhase(fixture: Fixture, phase: AssetPackTransactionPhase): {
  readonly journal: AssetPackTransactionJournal;
  readonly cleanupSource: string;
  readonly finalSource: string;
} {
  const journal = baseJournal(fixture, phase);
  const oldOutput = path.resolve(fixture.workspace.root, journal.oldOutputBackup);
  const oldRegistry = path.resolve(fixture.workspace.root, journal.oldRegistryBackup!);
  const stagedOutput = path.resolve(fixture.workspace.root, journal.stagedOutput);
  const stagedRegistry = path.resolve(fixture.workspace.root, journal.stagedRegistry);
  const stagedSource = path.resolve(fixture.workspace.root, journal.stagedInstalledSource!);
  const finalSource = path.resolve(fixture.workspace.root, journal.finalInstalledSource!);
  const cleanupSource = path.resolve(fixture.workspace.root, journal.cleanupInstalledSources[0]!);

  mkdirSync(path.dirname(oldOutput), { recursive: true });
  mkdirSync(path.dirname(stagedOutput), { recursive: true });
  installOldRegistryGeneration(fixture, cleanupSource, '0.9.0');
  const nextState = installedDesiredState(fixture, finalSource);
  if (phase === 'prepared') {
    writeTreeFile(
      stagedOutput,
      '.lpc-toolkit-managed.json',
      fixture.newMarkerBytes.toString('utf8'),
    );
    writeFileSync(path.join(stagedOutput, 'CREDITS.csv'), Buffer.alloc(0));
    writeFileSync(stagedRegistry, assetPackRegistryBytes(nextState.registry));
    writeInstalledSource(fixture, stagedSource, '1.0.0', ARCHIVE_DIGEST);
  } else {
    renameSync(fixture.workspace.outputRoot, oldOutput);
    mkdirSync(fixture.workspace.outputRoot, { recursive: true });
    writeFileSync(
      path.join(fixture.workspace.outputRoot, '.lpc-toolkit-managed.json'),
      fixture.newMarkerBytes,
    );
    writeFileSync(path.join(fixture.workspace.outputRoot, 'CREDITS.csv'), Buffer.alloc(0));
    writeFileSync(stagedRegistry, assetPackRegistryBytes(nextState.registry));
    writeInstalledSource(fixture, stagedSource, '1.0.0', ARCHIVE_DIGEST);

    if (phase === 'sources-published' || phase === 'registry-published') {
      mkdirSync(path.dirname(finalSource), { recursive: true });
      renameSync(stagedSource, finalSource);
    }
    if (phase === 'registry-published') {
      renameSync(fixture.workspace.registryPath, oldRegistry);
      renameSync(stagedRegistry, fixture.workspace.registryPath);
    }
  }

  writeJournal(fixture, journal);
  return { journal, cleanupSource, finalSource };
}

function expectUnsafe(fixture: Fixture, journal: unknown): void {
  writeJournal(fixture, journal);
  const before = snapshotTree(fixture.root);
  const result = recoverAssetPackTransaction({ workspace: fixture.workspace });
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Expected unsafe transaction recovery failure.');
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
    'asset_transaction_unsafe',
  ]);
  expect(snapshotTree(fixture.root)).toEqual(before);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('asset-pack transaction journal safety', () => {
  it('writes the exact schema, identity, operation, phase, UUID, and relative allowlisted paths', async () => {
    const fixture = createFixture();
    const failBeforeOutputMutation: AssetTransactionFileOps = {
      ...REAL_FILE_OPS,
      renameSync(source, destination) {
        if (path.resolve(String(source)) === fixture.workspace.outputRoot) {
          throw new Error('stop after durable journal');
        }
        renameSync(source, destination);
      },
    };

    const result = await publishAssetPackGeneration({
      operation: 'sync',
      workspace: fixture.workspace,
      desiredState: desiredState(fixture),
      cleanupInstalledSources: [],
      fileOps: failBeforeOutputMutation,
    });
    expect(result.ok).toBe(false);

    const journal = JSON.parse(
      readFileSync(transactionPath(fixture.workspace), 'utf8'),
    ) as AssetPackTransactionJournal;
    expect(Object.keys(journal).sort()).toEqual([
      'cleanupInstalledSources',
      'oldOutputBackup',
      'oldRegistryBackup',
      'operation',
      'operationId',
      'phase',
      'schema',
      'stagedOutput',
      'stagedRegistry',
      'workspaceId',
    ]);
    expect(journal).toMatchObject({
      schema: ASSET_PACK_TRANSACTION_SCHEMA,
      workspaceId: fixture.workspaceId,
      operation: 'sync',
      phase: 'prepared',
      cleanupInstalledSources: [],
    });
    expect(journal.operationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    for (const journalPath of [
      journal.oldOutputBackup,
      journal.oldRegistryBackup!,
      journal.stagedOutput,
      journal.stagedRegistry,
    ]) {
      expect(path.isAbsolute(journalPath)).toBe(false);
      expect(journalPath).not.toContain('..');
      expect(journalPath).not.toContain('artist-packs');
      expect(journalPath).not.toContain('upstream');
    }

    expect(recoverAssetPackTransaction({ workspace: fixture.workspace })).toEqual({
      ok: true,
      action: 'rolled-back',
    });
  });

  it('rejects malformed keys, identities, enums, paths, and installed digest directories without mutation', () => {
    const mutations: readonly ((journal: AssetPackTransactionJournal) => unknown)[] = [
      (journal) => ({ ...journal, unexpected: true }),
      (journal) => ({ ...journal, schema: 'lpc-toolkit.asset-pack-transaction.v2' }),
      (journal) => ({ ...journal, workspaceId: randomUUID() }),
      (journal) => ({ ...journal, operationId: 'not-a-uuid' }),
      (journal) => ({ ...journal, operation: 'adopt' }),
      (journal) => ({ ...journal, phase: 'cleaned' }),
      (journal) => ({ ...journal, stagedOutput: '/tmp/host-output' }),
      (journal) => ({ ...journal, stagedOutput: '../assets' }),
      (journal) => ({ ...journal, stagedOutput: 'artist-packs/acme.pack' }),
      (journal) => ({ ...journal, stagedRegistry: 'upstream/registry.json' }),
      (journal) => ({ ...journal, oldOutputBackup: 'assets/backup' }),
      (journal) => ({ ...journal, finalInstalledSource: relativeToWorkspace(
        fixtureForMutation.workspace,
        installedPath(fixtureForMutation.workspace, 'not-a-sha256'),
      ) }),
    ];
    const fixtureForMutation = createFixture();
    const journal = baseJournal(fixtureForMutation, 'prepared');
    for (const mutate of mutations) {
      expectUnsafe(fixtureForMutation, mutate(journal));
    }
  });

  it.each(['transactions', 'staging', 'installed'] as const)(
    'rejects a symlink beneath the %s role root without mutation',
    (role) => {
      const fixture = createFixture();
      const outside = createDirectory('lpc-asset-pack-transaction-outside-');
      const journal = baseJournal(fixture, 'prepared');
      if (role === 'installed') {
        const installedRoot = path.join(fixture.workspace.stateRoot, 'installed');
        symlinkSync(outside, path.join(installedRoot, 'acme.pack'));
      } else {
        const roleRoot = path.join(fixture.workspace.stateRoot, role);
        mkdirSync(roleRoot, { recursive: true });
        symlinkSync(outside, path.join(roleRoot, OPERATION_ID));
      }
      expectUnsafe(fixture, journal);
    },
  );

  it('rejects a dangling active-journal symlink without following or replacing it', () => {
    const fixture = createFixture();
    const outside = createDirectory('lpc-asset-pack-transaction-dangling-');
    symlinkSync(path.join(outside, 'missing.json'), transactionPath(fixture.workspace));
    const before = snapshotTree(fixture.root);
    const result = recoverAssetPackTransaction({ workspace: fixture.workspace });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected unsafe dangling journal failure.');
    expect(result.diagnostics.map((entry) => entry.code)).toEqual(['asset_transaction_unsafe']);
    expect(snapshotTree(fixture.root)).toEqual(before);
    expect(existsSync(path.join(outside, 'missing.json'))).toBe(false);
  });

  it('reclaims a well-formed dead-process claim and rejects a corrupt claim without mutation', () => {
    const reclaimable = createFixture();
    writeFileSync(transactionClaimPath(reclaimable.workspace), `${JSON.stringify({
      schema: ASSET_PACK_TRANSACTION_SCHEMA,
      workspaceId: reclaimable.workspaceId,
      operationId: OPERATION_ID,
      pid: 2_147_483_647,
    })}\n`);
    expect(recoverAssetPackTransaction({ workspace: reclaimable.workspace })).toEqual({
      ok: true,
      action: 'none',
    });
    expect(existsSync(transactionClaimPath(reclaimable.workspace))).toBe(false);

    const corrupt = createFixture();
    writeFileSync(transactionClaimPath(corrupt.workspace), '{not-json\n');
    const before = snapshotTree(corrupt.root);
    const result = recoverAssetPackTransaction({ workspace: corrupt.workspace });
    expect(result.ok).toBe(false);
    expect(snapshotTree(corrupt.root)).toEqual(before);
  });
});

describe('asset-pack transaction recovery', () => {
  for (const phase of ['prepared', 'output-published', 'sources-published'] as const) {
    it(`rolls back ${phase} exactly and is idempotent`, () => {
      const fixture = createFixture();
      const seeded = seedPhase(fixture, phase);
      const sibling = path.join(fixture.workspace.stateRoot, 'installed', 'unlisted-sibling');
      writeTreeFile(sibling, 'sentinel.txt', 'do not delete\n');

      expect(recoverAssetPackTransaction({ workspace: fixture.workspace })).toEqual({
        ok: true,
        action: 'rolled-back',
      });
      expect(readFileSync(
        path.join(fixture.workspace.outputRoot, '.lpc-toolkit-managed.json'),
      )).toEqual(fixture.oldMarkerBytes);
      expect(readFileSync(fixture.workspace.registryPath)).toEqual(fixture.oldRegistryBytes);
      expect(existsSync(seeded.finalSource)).toBe(false);
      expect(existsSync(seeded.cleanupSource)).toBe(true);
      expect(readFileSync(path.join(sibling, 'sentinel.txt'), 'utf8')).toBe('do not delete\n');
      expect(existsSync(transactionPath(fixture.workspace))).toBe(false);
      expect(recoverAssetPackTransaction({ workspace: fixture.workspace })).toEqual({
        ok: true,
        action: 'none',
      });
    });
  }

  it('completes registry-published cleanup exactly and is idempotent', () => {
    const fixture = createFixture();
    const seeded = seedPhase(fixture, 'registry-published');
    const sibling = path.join(fixture.workspace.stateRoot, 'installed', 'unlisted-sibling');
    writeTreeFile(sibling, 'sentinel.txt', 'do not delete\n');

    expect(recoverAssetPackTransaction({ workspace: fixture.workspace })).toEqual({
      ok: true,
      action: 'completed',
    });
    expect(readFileSync(
      path.join(fixture.workspace.outputRoot, '.lpc-toolkit-managed.json'),
    )).toEqual(fixture.newMarkerBytes);
    expect(readFileSync(fixture.workspace.registryPath)).toEqual(
      assetPackRegistryBytes(installedDesiredState(fixture, seeded.finalSource).registry),
    );
    expect(existsSync(seeded.finalSource)).toBe(true);
    expect(existsSync(seeded.cleanupSource)).toBe(false);
    expect(readFileSync(path.join(sibling, 'sentinel.txt'), 'utf8')).toBe('do not delete\n');
    expect(existsSync(transactionPath(fixture.workspace))).toBe(false);
    expect(recoverAssetPackTransaction({ workspace: fixture.workspace })).toEqual({
      ok: true,
      action: 'none',
    });
  });

  it.each([
    ['journal durable write', 'prepared', 'rolled-back'],
    ['output swap', 'prepared', 'rolled-back'],
    ['source publication', 'output-published', 'rolled-back'],
    ['registry swap', 'registry-published', 'completed'],
  ] as const)(
    'recovers an injected crash after %s and repeats idempotently',
    async (crashPoint, expectedPhase, expectedAction) => {
      const fixture = createFixture();
      const stagedSource = path.join(
        fixture.workspace.stateRoot,
        'staging',
        'incoming-install',
      );
      const finalSource = installedPath(fixture.workspace);
      const obsoleteSource = path.join(
        fixture.workspace.stateRoot,
        'installed',
        'acme.pack',
        '0.9.0',
        'b'.repeat(64),
      );
      writeInstalledSource(fixture, stagedSource, '1.0.0', ARCHIVE_DIGEST);
      installOldRegistryGeneration(fixture, obsoleteSource, '0.9.0');
      let journalWriteCount = 0;
      const crashingOps: AssetTransactionFileOps = {
        ...REAL_FILE_OPS,
        writeFileSync(target, data, writeOptions) {
          if (String(target).includes('transaction.json.')) {
            journalWriteCount += 1;
            if (
              (crashPoint === 'output swap' && journalWriteCount === 2)
              || (crashPoint === 'source publication' && journalWriteCount === 3)
            ) {
              throw new Error(`injected crash after ${crashPoint}`);
            }
          }
          writeFileSync(target, data, writeOptions);
        },
        renameSync(source, destination) {
          if (
            crashPoint === 'journal durable write'
            && path.resolve(String(source)) === fixture.workspace.outputRoot
          ) {
            throw new Error(`injected crash after ${crashPoint}`);
          }
          renameSync(source, destination);
        },
        rmSync(target, removeOptions) {
          if (
            crashPoint === 'registry swap'
            && String(target).includes(`${path.sep}transactions${path.sep}`)
            && path.basename(String(target)) === 'old-output'
          ) {
            throw new Error(`injected crash after ${crashPoint}`);
          }
          rmSync(target, removeOptions);
        },
      };

      const publication = await publishAssetPackGeneration({
        operation: 'install',
        workspace: fixture.workspace,
        desiredState: installedDesiredState(fixture, finalSource),
        stagedInstalledSource: stagedSource,
        finalInstalledSource: finalSource,
        cleanupInstalledSources: [obsoleteSource],
        fileOps: crashingOps,
      });
      expect(publication.ok).toBe(false);
      const journal = JSON.parse(
        readFileSync(transactionPath(fixture.workspace), 'utf8'),
      ) as AssetPackTransactionJournal;
      expect(journal.phase).toBe(expectedPhase);

      expect(recoverAssetPackTransaction({ workspace: fixture.workspace })).toEqual({
        ok: true,
        action: expectedAction,
      });
      if (expectedAction === 'rolled-back') {
        expect(readFileSync(
          path.join(fixture.workspace.outputRoot, '.lpc-toolkit-managed.json'),
        )).toEqual(fixture.oldMarkerBytes);
        expect(readFileSync(fixture.workspace.registryPath)).toEqual(fixture.oldRegistryBytes);
        expect(existsSync(finalSource)).toBe(false);
        expect(existsSync(obsoleteSource)).toBe(true);
      } else {
        expect(readFileSync(
          path.join(fixture.workspace.outputRoot, '.lpc-toolkit-managed.json'),
        )).toEqual(fixture.newMarkerBytes);
        expect(existsSync(finalSource)).toBe(true);
        expect(existsSync(obsoleteSource)).toBe(false);
      }
      expect(recoverAssetPackTransaction({ workspace: fixture.workspace })).toEqual({
        ok: true,
        action: 'none',
      });
    },
  );

  it('resumes an interrupted rollback without deleting unlisted state', () => {
    const fixture = createFixture();
    seedPhase(fixture, 'sources-published');
    const sibling = path.join(fixture.workspace.stateRoot, 'installed', 'unlisted-sibling');
    writeTreeFile(sibling, 'sentinel.txt', 'do not delete\n');
    let failed = false;
    const interruptedRecovery: AssetTransactionFileOps = {
      ...REAL_FILE_OPS,
      rmSync(target, removeOptions) {
        if (!failed && path.resolve(String(target)) === transactionPath(fixture.workspace)) {
          failed = true;
          throw new Error('injected recovery interruption');
        }
        rmSync(target, removeOptions);
      },
    };

    const first = recoverAssetPackTransaction({
      workspace: fixture.workspace,
      fileOps: interruptedRecovery,
    });
    expect(first.ok).toBe(false);
    expect(readFileSync(
      path.join(fixture.workspace.outputRoot, '.lpc-toolkit-managed.json'),
    )).toEqual(fixture.oldMarkerBytes);
    expect(readFileSync(fixture.workspace.registryPath)).toEqual(fixture.oldRegistryBytes);

    expect(recoverAssetPackTransaction({ workspace: fixture.workspace })).toEqual({
      ok: true,
      action: 'rolled-back',
    });
    expect(readFileSync(path.join(sibling, 'sentinel.txt'), 'utf8')).toBe('do not delete\n');
    expect(recoverAssetPackTransaction({ workspace: fixture.workspace })).toEqual({
      ok: true,
      action: 'none',
    });
  });

  it.each([
    ['only staged output remains', (fixture: Fixture, _seeded: ReturnType<typeof seedPhase>) => {
      rmSync(fixture.workspace.outputRoot, { recursive: true });
    }],
    ['active old generation is corrupt with no backup', (
      fixture: Fixture,
      seeded: ReturnType<typeof seedPhase>,
    ) => {
      rmSync(path.resolve(fixture.workspace.root, seeded.journal.oldOutputBackup), {
        recursive: true,
      });
      writeFileSync(path.join(fixture.workspace.outputRoot, 'CREDITS.csv'), 'tampered\n');
    }],
    ['active and staged output both remain after the old backup exists', (
      fixture: Fixture,
      seeded: ReturnType<typeof seedPhase>,
    ) => {
      const stagedOutput = path.resolve(fixture.workspace.root, seeded.journal.stagedOutput);
      writeTreeFile(
        stagedOutput,
        '.lpc-toolkit-managed.json',
        fixture.newMarkerBytes.toString('utf8'),
      );
      writeFileSync(path.join(stagedOutput, 'CREDITS.csv'), Buffer.alloc(0));
    }],
  ] as const)(
    'rejects impossible rollback layout when %s',
    (_label, mutate) => {
      const fixture = createFixture();
      const seeded = seedPhase(fixture, 'output-published');
      mutate(fixture, seeded);
      expectUnsafe(fixture, seeded.journal);
    },
  );
});

describe('asset-pack transaction durability', () => {
  function recordingFileOps(options: {
    readonly directoryFsyncError?: NodeJS.ErrnoException;
    readonly failFirstFsync?: boolean;
  } = {}): { readonly events: string[]; readonly fileOps: AssetTransactionFileOps } {
    const events: string[] = [];
    const descriptors = new Map<number, string>();
    let fsyncCount = 0;
    return {
      events,
      fileOps: {
        ...REAL_FILE_OPS,
        mkdirSync(target, mkdirOptions) {
          events.push(`mkdir:${String(target)}`);
          return mkdirSync(target, mkdirOptions);
        },
        writeFileSync(target, data, writeOptions) {
          events.push(`write:${String(target)}`);
          writeFileSync(target, data, writeOptions);
        },
        openSync(target, flags, mode) {
          const descriptor = openSync(target, flags, mode);
          descriptors.set(descriptor, String(target));
          events.push(`open:${String(target)}`);
          return descriptor;
        },
        fsyncSync(descriptor) {
          fsyncCount += 1;
          const target = descriptors.get(descriptor) ?? '<unknown>';
          events.push(`fsync:${target}`);
          if (options.failFirstFsync && fsyncCount === 1) {
            throw Object.assign(new Error('injected file fsync failure'), { code: 'EIO' });
          }
          if (options.directoryFsyncError && lstatSync(target).isDirectory()) {
            throw options.directoryFsyncError;
          }
          fsyncSync(descriptor);
        },
        closeSync(descriptor) {
          const target = descriptors.get(descriptor) ?? '<unknown>';
          events.push(`close:${target}`);
          descriptors.delete(descriptor);
          closeSync(descriptor);
        },
        renameSync(source, destination) {
          events.push(`rename:${String(source)}->${String(destination)}`);
          renameSync(source, destination);
        },
      },
    };
  }

  it('closes and fsyncs staged files and each journal temp before rename, then attempts parent-directory fsync', async () => {
    const fixture = createFixture();
    const recorder = recordingFileOps();
    const result = await publishAssetPackGeneration({
      operation: 'sync',
      workspace: fixture.workspace,
      desiredState: desiredState(fixture),
      cleanupInstalledSources: [],
      fileOps: recorder.fileOps,
    });
    expect(result).toEqual({ ok: true });

    const fileWrites = recorder.events.filter((event) =>
      event.startsWith('write:')
      && path.isAbsolute(event.slice('write:'.length))
      && !event.includes('transaction.json.'));
    for (const writeEvent of fileWrites) {
      const target = writeEvent.slice('write:'.length);
      const fsyncIndex = recorder.events.indexOf(`fsync:${target}`);
      const closeIndex = recorder.events.indexOf(`close:${target}`);
      const firstRenameIndex = recorder.events.findIndex((event) => event.startsWith('rename:'));
      expect(fsyncIndex).toBeGreaterThan(recorder.events.indexOf(writeEvent));
      expect(closeIndex).toBeGreaterThan(fsyncIndex);
      expect(firstRenameIndex).toBeGreaterThan(closeIndex);
    }

    const journalWrites = recorder.events.filter((event) =>
      event.startsWith('write:') && event.includes('transaction.json.'));
    expect(journalWrites.length).toBeGreaterThanOrEqual(4);
    let journalSearchIndex = 0;
    for (const writeEvent of journalWrites) {
      const target = writeEvent.slice('write:'.length);
      const writeIndex = recorder.events.indexOf(writeEvent, journalSearchIndex);
      const fsyncIndex = recorder.events.indexOf(`fsync:${target}`, writeIndex);
      const closeIndex = recorder.events.indexOf(`close:${target}`, fsyncIndex);
      const renameIndex = recorder.events.findIndex((event, index) =>
        index > closeIndex && event.startsWith(`rename:${target}->`));
      expect(fsyncIndex).toBeGreaterThan(writeIndex);
      expect(closeIndex).toBeGreaterThan(fsyncIndex);
      expect(renameIndex).toBeGreaterThan(closeIndex);
      journalSearchIndex = renameIndex + 1;
    }
    expect(recorder.events.some((event) =>
      event === `fsync:${fixture.workspace.stateRoot}`)).toBe(true);
  });

  it.each(['EINVAL', 'ENOTSUP', 'EPERM'] as const)(
    'tolerates only %s from directory fsync',
    async (code) => {
      const fixture = createFixture();
      const recorder = recordingFileOps({
        directoryFsyncError: Object.assign(new Error(code), { code }),
      });
      expect(await publishAssetPackGeneration({
        operation: 'sync',
        workspace: fixture.workspace,
        desiredState: desiredState(fixture),
        cleanupInstalledSources: [],
        fileOps: recorder.fileOps,
      })).toEqual({ ok: true });
    },
  );

  it('aborts before active-state mutation for file or unsupported directory fsync failure', async () => {
    for (const recorderOptions of [
      { failFirstFsync: true },
      { directoryFsyncError: Object.assign(new Error('EIO'), { code: 'EIO' }) },
    ]) {
      const fixture = createFixture();
      const beforeOutput = snapshotTree(fixture.workspace.outputRoot);
      const beforeRegistry = readFileSync(fixture.workspace.registryPath);
      const recorder = recordingFileOps(recorderOptions);
      const result = await publishAssetPackGeneration({
        operation: 'sync',
        workspace: fixture.workspace,
        desiredState: desiredState(fixture),
        cleanupInstalledSources: [],
        fileOps: recorder.fileOps,
      });
      expect(result.ok).toBe(false);
      expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(beforeOutput);
      expect(readFileSync(fixture.workspace.registryPath)).toEqual(beforeRegistry);
    }
  });

  it('does not strand the exclusive claim when claim durability fails', async () => {
    const fixture = createFixture();
    let failed = false;
    const claimFailure: AssetTransactionFileOps = {
      ...REAL_FILE_OPS,
      fsyncSync(descriptor) {
        if (!failed) {
          failed = true;
          throw Object.assign(new Error('claim fsync failed'), { code: 'EIO' });
        }
        fsyncSync(descriptor);
      },
    };
    expect((await publishAssetPackGeneration({
      operation: 'sync',
      workspace: fixture.workspace,
      desiredState: desiredState(fixture),
      cleanupInstalledSources: [],
      fileOps: claimFailure,
    })).ok).toBe(false);
    expect(await publishAssetPackGeneration({
      operation: 'sync',
      workspace: fixture.workspace,
      desiredState: desiredState(fixture),
      cleanupInstalledSources: [],
    })).toEqual({ ok: true });
  });

  it('fsyncs the parent of every newly created nested output and installed directory', async () => {
    const fixture = createFixture();
    const recorder = recordingFileOps();
    const state = desiredState(fixture);
    const stopAfterMaterialization: AssetTransactionFileOps = {
      ...recorder.fileOps,
      renameSync(source, destination) {
        if (path.resolve(String(source)) === fixture.workspace.outputRoot) {
          throw new Error('stop after durable materialization');
        }
        recorder.fileOps.renameSync(source, destination);
      },
    };
    const result = await publishAssetPackGeneration({
      operation: 'sync',
      workspace: fixture.workspace,
      desiredState: {
        ...state,
        outputFiles: new Map([
          ...state.outputFiles,
          ['nested/one/two/generated.txt', Buffer.from('durable\n')],
        ]),
      },
      cleanupInstalledSources: [],
      fileOps: stopAfterMaterialization,
    });
    expect(result.ok).toBe(false);

    const createdDirectories = recorder.events
      .filter((event) => event.startsWith('mkdir:'))
      .map((event) => event.slice('mkdir:'.length));
    for (const directory of createdDirectories) {
      expect(recorder.events).toContain(`fsync:${path.dirname(directory)}`);
    }
  });

  it('fsyncs every new installed pack and version directory component', async () => {
    const fixture = createFixture();
    const recorder = recordingFileOps();
    const stagedSource = path.join(fixture.workspace.stateRoot, 'staging', 'incoming-install');
    const finalSource = installedPath(fixture.workspace);
    writeInstalledSource(fixture, stagedSource, '1.0.0', ARCHIVE_DIGEST);
    expect(await publishAssetPackGeneration({
      operation: 'install',
      workspace: fixture.workspace,
      desiredState: installedDesiredState(fixture, finalSource),
      stagedInstalledSource: stagedSource,
      finalInstalledSource: finalSource,
      cleanupInstalledSources: [],
      fileOps: recorder.fileOps,
    })).toEqual({ ok: true });
    for (const directory of [
      path.join(fixture.workspace.stateRoot, 'installed', 'acme.pack'),
      path.join(fixture.workspace.stateRoot, 'installed', 'acme.pack', '1.0.0'),
    ]) {
      expect(recorder.events).toContain(`mkdir:${directory}`);
      expect(recorder.events).toContain(`fsync:${path.dirname(directory)}`);
    }
  });
});

describe('asset-pack transaction adversarial recovery', () => {
  it('claims the workspace exclusively before preparing and the concurrent loser mutates no active state', async () => {
    const fixture = createFixture();
    let loser: Promise<Awaited<ReturnType<typeof publishAssetPackGeneration>>> | undefined;
    let activeBeforeLoser: Readonly<Record<string, string>> | undefined;
    let registryBeforeLoser: Buffer | undefined;
    let activeAfterLoser: Readonly<Record<string, string>> | undefined;
    let registryAfterLoser: Buffer | undefined;
    let injected = false;
    const interleavingOps: AssetTransactionFileOps = {
      ...REAL_FILE_OPS,
      mkdirSync(target, mkdirOptions) {
        if (!injected && String(target).includes(`${path.sep}transactions${path.sep}`)) {
          injected = true;
          activeBeforeLoser = snapshotTree(fixture.workspace.outputRoot);
          registryBeforeLoser = readFileSync(fixture.workspace.registryPath);
          loser = publishAssetPackGeneration({
            operation: 'sync',
            workspace: fixture.workspace,
            desiredState: desiredState(fixture),
            cleanupInstalledSources: [],
          });
          activeAfterLoser = snapshotTree(fixture.workspace.outputRoot);
          registryAfterLoser = readFileSync(fixture.workspace.registryPath);
        }
        return mkdirSync(target, mkdirOptions);
      },
    };

    const winner = await publishAssetPackGeneration({
      operation: 'sync',
      workspace: fixture.workspace,
      desiredState: desiredState(fixture),
      cleanupInstalledSources: [],
      fileOps: interleavingOps,
    });
    expect(winner).toEqual({ ok: true });
    expect(loser).toBeDefined();
    expect(await loser!).toMatchObject({ ok: false });
    expect(activeAfterLoser).toEqual(activeBeforeLoser);
    expect(registryAfterLoser).toEqual(registryBeforeLoser);
  });

  it('does not traverse a cleanup parent replaced after validation', () => {
    const fixture = createFixture();
    const seeded = seedPhase(fixture, 'registry-published');
    const cleanupParent = path.dirname(seeded.cleanupSource);
    const heldParent = `${cleanupParent}-held`;
    const outside = createDirectory('lpc-asset-pack-transaction-race-');
    const outsideTarget = path.join(outside, path.basename(seeded.cleanupSource));
    writeTreeFile(outsideTarget, 'sentinel.txt', 'outside\n');
    let interleaved = false;
    const racingOps: AssetTransactionFileOps = {
      ...REAL_FILE_OPS,
      beforeMutationSync(operation, targets) {
        if (
          !interleaved
          && operation === 'remove'
          && targets.some((target) => path.resolve(target) === path.resolve(seeded.cleanupSource))
        ) {
          interleaved = true;
          renameSync(cleanupParent, heldParent);
          symlinkSync(outside, cleanupParent);
        }
      },
    };

    const result = recoverAssetPackTransaction({
      workspace: fixture.workspace,
      fileOps: racingOps,
    });
    expect(result.ok).toBe(false);
    expect(readFileSync(path.join(outsideTarget, 'sentinel.txt'), 'utf8')).toBe('outside\n');
  });

  it.each(['write', 'rename'] as const)(
    'does not traverse a staging parent replaced immediately before %s',
    async (boundary) => {
      const fixture = createFixture();
      const outside = createDirectory(`lpc-asset-pack-transaction-${boundary}-race-`);
      let outsideSentinel: string | undefined;
      let interleaved = false;
      const racingOps: AssetTransactionFileOps = {
        ...REAL_FILE_OPS,
        beforeMutationSync(operation, targets) {
          const source = targets[0];
          if (!source || interleaved || operation !== boundary) return;
          const stagingRoot = path.join(fixture.workspace.stateRoot, 'staging');
          if (!isPathWithinForTest(stagingRoot, source)) return;
          const relative = path.relative(stagingRoot, source);
          const operationId = relative.split(path.sep)[0];
          if (!operationId) return;
          const operationRoot = path.join(stagingRoot, operationId);
          const isTargetBoundary = boundary === 'write'
            ? path.basename(source) === '.lpc-toolkit-managed.json'
            : path.basename(source) === 'output';
          if (!isTargetBoundary) return;
          interleaved = true;
          const relativeTarget = boundary === 'write'
            ? path.relative(operationRoot, source)
            : path.join('output', '.lpc-toolkit-managed.json');
          outsideSentinel = path.join(outside, relativeTarget);
          writeTreeFile(outside, relativeTarget, 'outside\n');
          renameSync(operationRoot, `${operationRoot}-held`);
          symlinkSync(outside, operationRoot);
        },
      };

      const result = await publishAssetPackGeneration({
        operation: 'sync',
        workspace: fixture.workspace,
        desiredState: desiredState(fixture),
        cleanupInstalledSources: [],
        fileOps: racingOps,
      });
      expect(result.ok).toBe(false);
      expect(outsideSentinel).toBeDefined();
      expect(readFileSync(outsideSentinel!, 'utf8')).toBe('outside\n');
      expect(existsSync(transactionClaimPath(fixture.workspace))).toBe(false);
    },
  );

  it('rejects a cleanup path for an active sibling without mutation', () => {
    const fixture = createFixture();
    const seeded = seedPhase(fixture, 'registry-published');
    const sibling = path.join(
      fixture.workspace.stateRoot,
      'installed',
      'sibling.pack',
      '2.0.0',
      'd'.repeat(64),
    );
    writeTreeFile(sibling, 'sentinel.txt', 'active sibling\n');
    const tampered = {
      ...seeded.journal,
      cleanupInstalledSources: [relativeToWorkspace(fixture.workspace, sibling)],
    };
    expectUnsafe(fixture, tampered);
    expect(readFileSync(path.join(sibling, 'sentinel.txt'), 'utf8')).toBe('active sibling\n');
  });

  it('rejects a pre-commit cleanup path that is not the staged registry delta', () => {
    const fixture = createFixture();
    const seeded = seedPhase(fixture, 'prepared');
    const sibling = path.join(
      fixture.workspace.stateRoot,
      'installed',
      'sibling.pack',
      '2.0.0',
      'd'.repeat(64),
    );
    writeTreeFile(sibling, 'sentinel.txt', 'active sibling\n');
    expectUnsafe(fixture, {
      ...seeded.journal,
      cleanupInstalledSources: [relativeToWorkspace(fixture.workspace, sibling)],
    });
  });

  it.each(['symlink', 'corrupt'] as const)(
    'rejects a %s active registry before completion without mutation',
    (kind) => {
      const fixture = createFixture();
      seedPhase(fixture, 'registry-published');
      rmSync(fixture.workspace.registryPath);
      if (kind === 'symlink') {
        const outside = createDirectory('lpc-asset-pack-transaction-registry-');
        const target = path.join(outside, 'registry.json');
        writeFileSync(target, 'outside registry\n');
        symlinkSync(target, fixture.workspace.registryPath);
      } else {
        writeFileSync(fixture.workspace.registryPath, '{not-json\n');
      }
      const before = snapshotTree(fixture.root);
      const result = recoverAssetPackTransaction({ workspace: fixture.workspace });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected unsafe registry recovery failure.');
      expect(result.diagnostics.map((entry) => entry.code)).toEqual(['asset_transaction_unsafe']);
      expect(snapshotTree(fixture.root)).toEqual(before);
    },
  );

  it.each(['after-old-registry-backup', 'after-new-registry-rename'] as const)(
    'completes deterministically after a crash %s',
    async (boundary) => {
      const fixture = createFixture();
      let injected = false;
      const crashingOps: AssetTransactionFileOps = {
        ...REAL_FILE_OPS,
        renameSync(source, destination) {
          const sourcePath = path.resolve(String(source));
          const destinationPath = path.resolve(String(destination));
          if (
            boundary === 'after-old-registry-backup'
            && !injected
            && sourcePath.includes(`${path.sep}staging${path.sep}`)
            && destinationPath === fixture.workspace.registryPath
          ) {
            injected = true;
            throw new Error('crash after old registry backup');
          }
          renameSync(source, destination);
          if (
            boundary === 'after-new-registry-rename'
            && !injected
            && destinationPath === fixture.workspace.registryPath
          ) {
            injected = true;
            throw new Error('crash after new registry rename');
          }
        },
      };
      const publication = await publishAssetPackGeneration({
        operation: 'sync',
        workspace: fixture.workspace,
        desiredState: desiredState(fixture),
        cleanupInstalledSources: [],
        fileOps: crashingOps,
      });
      expect(publication.ok).toBe(false);
      expect(recoverAssetPackTransaction({ workspace: fixture.workspace })).toEqual({
        ok: true,
        action: 'completed',
      });
    },
  );

  it.each(['write', 'fsync'] as const)(
    'rolls back when the durable commit-intent journal %s fails before registry mutation',
    async (boundary) => {
      const fixture = createFixture();
      const descriptors = new Map<number, string>();
      let journalWrites = 0;
      let failIntentFsync = false;
      const crashingOps: AssetTransactionFileOps = {
        ...REAL_FILE_OPS,
        writeFileSync(target, data, writeOptions) {
          if (String(target).includes('transaction.json.')) {
            journalWrites += 1;
            if (journalWrites === 4) {
              if (boundary === 'write') throw new Error('commit-intent write boundary');
              failIntentFsync = true;
            }
          }
          writeFileSync(target, data, writeOptions);
        },
        openSync(target, flags, mode) {
          const descriptor = openSync(target, flags, mode);
          descriptors.set(descriptor, String(target));
          return descriptor;
        },
        fsyncSync(descriptor) {
          const target = descriptors.get(descriptor) ?? '';
          if (failIntentFsync && target.includes('transaction.json.')) {
            failIntentFsync = false;
            throw new Error('commit-intent fsync boundary');
          }
          fsyncSync(descriptor);
        },
        closeSync(descriptor) {
          descriptors.delete(descriptor);
          closeSync(descriptor);
        },
      };
      const publication = await publishAssetPackGeneration({
        operation: 'sync',
        workspace: fixture.workspace,
        desiredState: desiredState(fixture),
        cleanupInstalledSources: [],
        fileOps: crashingOps,
      });
      expect(publication.ok).toBe(false);
      expect(recoverAssetPackTransaction({ workspace: fixture.workspace })).toEqual({
        ok: true,
        action: 'rolled-back',
      });
    },
  );

  it('rejects a prepared layout with only the staged output generation', () => {
    const fixture = createFixture();
    const seeded = seedPhase(fixture, 'prepared');
    writeTreeFile(
      path.resolve(fixture.workspace.root, seeded.journal.stagedOutput),
      '.lpc-toolkit-managed.json',
      JSON.stringify({ schema: ASSET_OUTPUT_MARKER_SCHEMA, workspaceId: fixture.workspaceId }),
    );
    rmSync(fixture.workspace.outputRoot, { recursive: true });
    expectUnsafe(fixture, seeded.journal);
  });

  it('removes empty per-operation staging and transaction roots after success', async () => {
    const fixture = createFixture();
    expect(await publishAssetPackGeneration({
      operation: 'sync',
      workspace: fixture.workspace,
      desiredState: desiredState(fixture),
      cleanupInstalledSources: [],
    })).toEqual({ ok: true });
    expect(readdirSync(path.join(fixture.workspace.stateRoot, 'staging'))).toEqual([]);
    expect(readdirSync(path.join(fixture.workspace.stateRoot, 'transactions'))).toEqual([]);
  });
});
