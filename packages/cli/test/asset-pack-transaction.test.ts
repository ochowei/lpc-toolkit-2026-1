import { createHash, randomUUID } from 'node:crypto';
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
  realpathSync,
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
  fstatSync,
  linkSync,
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

function recoveryMutationKey(
  workspace: AssetWorkspace,
  operation: 'mkdir' | 'write' | 'rename' | 'remove',
  targets: readonly string[],
  boundary: 'mutation' | 'fsync',
): string | undefined {
  if (targets.some((target) => target.includes('transaction.lock'))) return undefined;
  if (
    operation !== 'remove'
    && targets.some((target) => path.basename(target).startsWith('transaction.json'))
  ) {
    return undefined;
  }
  let journal: AssetPackTransactionJournal | undefined;
  try {
    journal = JSON.parse(
      readFileSync(transactionPath(workspace), 'utf8'),
    ) as AssetPackTransactionJournal;
  } catch {
    return undefined;
  }
  if (journal.recoveryMode === undefined) return undefined;
  const relativeTargets = targets.map((target) =>
    path.relative(workspace.root, target).split(path.sep).join('/'));
  return `${journal.recoveryMode}:${operation}:${boundary}:${relativeTargets.join('->')}`;
}

function installedPath(workspace: AssetWorkspace, suffix = ARCHIVE_DIGEST): string {
  return path.join(workspace.stateRoot, 'installed', 'acme.pack', '1.0.0', suffix);
}

function transactionSiblingPathForTest(
  target: string,
  operationId: string,
  role: 'staged' | 'backup',
): string {
  return path.join(
    path.dirname(target),
    `.${path.basename(target)}.${operationId}.${role}`,
  );
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
  const stagingRoot = path.join(fixture.workspace.stateRoot, 'staging', OPERATION_ID);
  const finalInstalledSource = installedPath(fixture.workspace);
  return {
    schema: ASSET_PACK_TRANSACTION_SCHEMA,
    workspaceId: fixture.workspaceId,
    operationId: OPERATION_ID,
    operation: 'install',
    phase,
    oldOutputBackup: relativeToWorkspace(
      fixture.workspace,
      transactionSiblingPathForTest(fixture.workspace.outputRoot, OPERATION_ID, 'backup'),
    ),
    oldRegistryBackup: relativeToWorkspace(
      fixture.workspace,
      transactionSiblingPathForTest(fixture.workspace.registryPath, OPERATION_ID, 'backup'),
    ),
    stagedOutput: relativeToWorkspace(
      fixture.workspace,
      transactionSiblingPathForTest(fixture.workspace.outputRoot, OPERATION_ID, 'staged'),
    ),
    stagedRegistry: relativeToWorkspace(
      fixture.workspace,
      transactionSiblingPathForTest(fixture.workspace.registryPath, OPERATION_ID, 'staged'),
    ),
    incomingInstalledSource: relativeToWorkspace(
      fixture.workspace,
      path.join(stagingRoot, 'incoming-installed-source'),
    ),
    stagedInstalledSource: relativeToWorkspace(
      fixture.workspace,
      transactionSiblingPathForTest(finalInstalledSource, OPERATION_ID, 'staged'),
    ),
    finalInstalledSource: relativeToWorkspace(
      fixture.workspace,
      finalInstalledSource,
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

function readJournal(fixture: Fixture): AssetPackTransactionJournal {
  return JSON.parse(
    readFileSync(transactionPath(fixture.workspace), 'utf8'),
  ) as AssetPackTransactionJournal;
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
  const incomingSource = path.resolve(fixture.workspace.root, journal.incomingInstalledSource!);
  const stagedSource = path.resolve(fixture.workspace.root, journal.stagedInstalledSource!);
  const finalSource = path.resolve(fixture.workspace.root, journal.finalInstalledSource!);
  const cleanupSource = path.resolve(fixture.workspace.root, journal.cleanupInstalledSources[0]!);

  mkdirSync(path.dirname(stagedOutput), { recursive: true });
  mkdirSync(path.dirname(stagedSource), { recursive: true });
  mkdirSync(path.dirname(incomingSource), { recursive: true });
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
    writeInstalledSource(fixture, incomingSource, '1.0.0', ARCHIVE_DIGEST);
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
    writeInstalledSource(fixture, incomingSource, '1.0.0', ARCHIVE_DIGEST);
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
      afterMutationValidationSync(operation, targets) {
        if (
          operation === 'rename'
          && path.resolve(targets[0] ?? '') === fixture.workspace.outputRoot
        ) {
          throw new Error('stop after durable journal');
        }
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
      'newRegistryDigest',
      'oldOutputBackup',
      'oldRegistryBackup',
      'oldRegistryDigest',
      'operation',
      'operationId',
      'phase',
      'recoveryCursor',
      'recoveryMode',
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
      recoveryMode: 'rollback',
      recoveryCursor: 0,
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

  it('reclaims dead, empty, and partial claims but rejects a well-formed live foreign claim', () => {
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

    for (const contents of ['', '{not-json\n']) {
      const corrupt = createFixture();
      const beforeOutput = snapshotTree(corrupt.workspace.outputRoot);
      const beforeRegistry = readFileSync(corrupt.workspace.registryPath);
      writeFileSync(transactionClaimPath(corrupt.workspace), contents);
      expect(recoverAssetPackTransaction({ workspace: corrupt.workspace })).toEqual({
        ok: true,
        action: 'none',
      });
      expect(existsSync(transactionClaimPath(corrupt.workspace))).toBe(false);
      expect(snapshotTree(corrupt.workspace.outputRoot)).toEqual(beforeOutput);
      expect(readFileSync(corrupt.workspace.registryPath)).toEqual(beforeRegistry);
    }

    const foreign = createFixture();
    writeFileSync(transactionClaimPath(foreign.workspace), `${JSON.stringify({
      schema: ASSET_PACK_TRANSACTION_SCHEMA,
      workspaceId: 'foreign-workspace',
      operationId: OPERATION_ID,
      pid: process.pid,
    })}\n`);
    const before = snapshotTree(foreign.root);
    expect(recoverAssetPackTransaction({ workspace: foreign.workspace }).ok).toBe(false);
    expect(snapshotTree(foreign.root)).toEqual(before);
  });

  it.each(['after-old-output-rename', 'after-new-output-rename'] as const)(
    'reclaims a dead claim with the active marker absent or replaced %s',
    (boundary) => {
      const fixture = createFixture();
      const seeded = seedPhase(
        fixture,
        boundary === 'after-old-output-rename' ? 'prepared' : 'output-published',
      );
      if (boundary === 'after-old-output-rename') {
        renameSync(
          fixture.workspace.outputRoot,
          path.resolve(fixture.workspace.root, seeded.journal.oldOutputBackup),
        );
      }
      writeFileSync(transactionClaimPath(fixture.workspace), `${JSON.stringify({
        schema: ASSET_PACK_TRANSACTION_SCHEMA,
        workspaceId: fixture.workspaceId,
        operationId: OPERATION_ID,
        pid: 2_147_483_647,
      })}\n`);

      expect(recoverAssetPackTransaction({ workspace: fixture.workspace })).toEqual({
        ok: true,
        action: 'rolled-back',
      });
      expect(readFileSync(
        path.join(fixture.workspace.outputRoot, '.lpc-toolkit-managed.json'),
      )).toEqual(fixture.oldMarkerBytes);
      expect(existsSync(transactionClaimPath(fixture.workspace))).toBe(false);
    },
  );
});

describe('asset-pack transaction recovery', () => {
  it.each([
    ['output root', false],
    ['nested output directory', true],
  ] as const)(
    'publishes successfully when invoked from the %s without changing cwd',
    async (_label, nested) => {
      const fixture = createFixture();
      const callerWorkingDirectory = process.cwd();
      const invocationDirectory = nested
        ? path.join(fixture.workspace.outputRoot, 'nested', 'working')
        : fixture.workspace.outputRoot;
      if (nested) mkdirSync(invocationDirectory, { recursive: true });
      let preparedNestedOutput = false;
      const fileOps: AssetTransactionFileOps = {
        ...REAL_FILE_OPS,
        afterMutationValidationSync(operation, targets) {
          if (
            nested
            && !preparedNestedOutput
            && operation === 'rename'
            && path.resolve(targets[0] ?? '') === fixture.workspace.outputRoot
          ) {
            const stagedOutputName = readdirSync(path.dirname(fixture.workspace.outputRoot))
              .find((name) => name.endsWith('.staged'));
            expect(stagedOutputName).toBeDefined();
            mkdirSync(
              path.join(
                path.dirname(fixture.workspace.outputRoot),
                stagedOutputName!,
                'nested',
                'working',
              ),
              { recursive: true },
            );
            preparedNestedOutput = true;
          }
        },
      };

      try {
        process.chdir(invocationDirectory);
        const expectedWorkingDirectory = process.cwd();
        expect(await publishAssetPackGeneration({
          operation: 'sync',
          workspace: fixture.workspace,
          desiredState: desiredState(fixture),
          cleanupInstalledSources: [],
          fileOps,
        })).toEqual({ ok: true });
        expect(process.cwd()).toBe(expectedWorkingDirectory);
        expect(existsSync(transactionPath(fixture.workspace))).toBe(false);
      } finally {
        process.chdir(callerWorkingDirectory);
      }
    },
  );

  it.each([
    ['output root', false],
    ['nested output directory', true],
  ] as const)(
    'rolls back successfully when invoked from the %s without changing cwd',
    (_label, nested) => {
      const fixture = createFixture();
      const callerWorkingDirectory = process.cwd();
      const nestedRelative = path.join('nested', 'working');
      if (nested) {
        mkdirSync(path.join(fixture.workspace.outputRoot, nestedRelative), { recursive: true });
      }
      seedPhase(fixture, 'output-published');
      if (nested) {
        mkdirSync(path.join(fixture.workspace.outputRoot, nestedRelative), { recursive: true });
      }
      const invocationDirectory = nested
        ? path.join(fixture.workspace.outputRoot, nestedRelative)
        : fixture.workspace.outputRoot;

      try {
        process.chdir(invocationDirectory);
        const expectedWorkingDirectory = process.cwd();
        expect(recoverAssetPackTransaction({ workspace: fixture.workspace })).toEqual({
          ok: true,
          action: 'rolled-back',
        });
        expect(process.cwd()).toBe(expectedWorkingDirectory);
        expect(recoverAssetPackTransaction({ workspace: fixture.workspace })).toEqual({
          ok: true,
          action: 'none',
        });
      } finally {
        process.chdir(callerWorkingDirectory);
      }
    },
  );

  it('completes cleanup from the removed installed directory and keeps cwd stable', () => {
    const fixture = createFixture();
    const seeded = seedPhase(fixture, 'registry-published');
    const callerWorkingDirectory = process.cwd();

    try {
      process.chdir(seeded.cleanupSource);
      expect(recoverAssetPackTransaction({ workspace: fixture.workspace })).toEqual({
        ok: true,
        action: 'completed',
      });
      expect(existsSync(seeded.cleanupSource)).toBe(false);
      expect(process.cwd()).toBe(realpathSync(fixture.workspace.root));
      expect(recoverAssetPackTransaction({ workspace: fixture.workspace })).toEqual({
        ok: true,
        action: 'none',
      });
    } finally {
      process.chdir(callerWorkingDirectory);
    }
  });

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
              (crashPoint === 'output swap' && journalWriteCount === 3)
              || (crashPoint === 'source publication' && journalWriteCount === 4)
            ) {
              throw new Error(`injected crash after ${crashPoint}`);
            }
          }
          writeFileSync(target, data, writeOptions);
        },
        afterMutationValidationSync(operation, targets) {
          if (
            crashPoint === 'journal durable write'
            && operation === 'rename'
            && path.resolve(targets[0] ?? '') === fixture.workspace.outputRoot
          ) {
            throw new Error(`injected crash after ${crashPoint}`);
          }
          if (
            crashPoint === 'registry swap'
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

  it('journals the destination-local installed stage before copying into it', async () => {
    const fixture = createFixture();
    const stagedSource = path.join(
      fixture.workspace.stateRoot,
      'staging',
      'incoming-install',
    );
    const finalSource = installedPath(fixture.workspace);
    writeInstalledSource(fixture, stagedSource, '1.0.0', ARCHIVE_DIGEST);
    let injected = false;
    const crashingOps: AssetTransactionFileOps = {
      ...REAL_FILE_OPS,
      afterMutationSync(operation, targets, boundary) {
        if (
          !injected
          && operation === 'write'
          && boundary === 'mutation'
          && targets.some((target) =>
            isPathWithinForTest(
              path.join(fixture.workspace.stateRoot, 'installed'),
              target,
            ))
        ) {
          injected = true;
          throw new Error('crash during destination-local installed staging');
        }
      },
    };

    expect((await publishAssetPackGeneration({
      operation: 'install',
      workspace: fixture.workspace,
      desiredState: installedDesiredState(fixture, finalSource),
      stagedInstalledSource: stagedSource,
      finalInstalledSource: finalSource,
      cleanupInstalledSources: [],
      fileOps: crashingOps,
    })).ok).toBe(false);
    expect(injected).toBe(true);
    expect(existsSync(transactionPath(fixture.workspace))).toBe(true);
    expect(recoverAssetPackTransaction({ workspace: fixture.workspace })).toEqual({
      ok: true,
      action: 'rolled-back',
    });
    expect(existsSync(stagedSource)).toBe(false);
    expect(existsSync(finalSource)).toBe(false);
    expect(readFileSync(fixture.workspace.registryPath)).toEqual(fixture.oldRegistryBytes);
  });

  it.each(['receipt', 'payload-coverage', 'payload-bytes'] as const)(
    'rolls back when destination-local installed %s changes before output publication',
    async (mutation) => {
      const fixture = createFixture();
      const stagedSource = path.join(
        fixture.workspace.stateRoot,
        'staging',
        'incoming-install',
      );
      const finalSource = installedPath(fixture.workspace);
      writeInstalledSource(fixture, stagedSource, '1.0.0', ARCHIVE_DIGEST);
      const beforeOutput = snapshotTree(fixture.workspace.outputRoot);
      const beforeRegistry = readFileSync(fixture.workspace.registryPath);
      let injected = false;
      const mutatingOps: AssetTransactionFileOps = {
        ...REAL_FILE_OPS,
        afterMutationValidationSync(operation, targets) {
          if (
            injected
            || operation !== 'rename'
            || path.resolve(targets[0] ?? '') !== fixture.workspace.outputRoot
          ) return;
          const localSourceName = readdirSync(path.dirname(finalSource)).find((name) =>
            name.startsWith(`.${path.basename(finalSource)}.`) && name.endsWith('.staged'));
          expect(localSourceName).toBeDefined();
          const localSource = path.join(path.dirname(finalSource), localSourceName!);
          if (mutation === 'payload-bytes') {
            writeFileSync(path.join(localSource, 'asset-pack.json'), '{"changed":true}\n');
          } else {
            const receiptPath = path.join(localSource, 'install-receipt.json');
            const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as {
              version: string;
              payloadDigests: Record<string, string>;
            };
            if (mutation === 'receipt') {
              receipt.version = '9.9.9';
            } else {
              receipt.payloadDigests['unexpected.txt'] = digestBytes(Buffer.from('unexpected\n'));
            }
            writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
          }
          injected = true;
        },
      };

      expect((await publishAssetPackGeneration({
        operation: 'install',
        workspace: fixture.workspace,
        desiredState: installedDesiredState(fixture, finalSource),
        stagedInstalledSource: stagedSource,
        finalInstalledSource: finalSource,
        cleanupInstalledSources: [],
        fileOps: mutatingOps,
      })).ok).toBe(false);
      expect(injected).toBe(true);
      const journal = JSON.parse(
        readFileSync(transactionPath(fixture.workspace), 'utf8'),
      ) as AssetPackTransactionJournal;
      expect(journal.phase).toBe('sources-published');
      expect(journal.recoveryMode).toBe('rollback');
      expect(readFileSync(fixture.workspace.registryPath)).toEqual(beforeRegistry);

      expect(recoverAssetPackTransaction({ workspace: fixture.workspace })).toEqual({
        ok: true,
        action: 'rolled-back',
      });
      expect(snapshotTree(fixture.workspace.outputRoot)).toEqual(beforeOutput);
      expect(readFileSync(fixture.workspace.registryPath)).toEqual(beforeRegistry);
      expect(existsSync(finalSource)).toBe(false);
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
      afterMutationValidationSync(operation, targets) {
        if (
          !failed
          && operation === 'remove'
          && targets.some((target) => path.resolve(target) === transactionPath(fixture.workspace))
        ) {
          failed = true;
          throw new Error('injected recovery interruption');
        }
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

  it('restarts rollback after every remove, rename, and parent-fsync boundary', () => {
    const discovery = createFixture();
    seedPhase(discovery, 'sources-published');
    const boundaries: string[] = [];
    expect(recoverAssetPackTransaction({
      workspace: discovery.workspace,
      fileOps: {
        ...REAL_FILE_OPS,
        afterMutationSync(operation, targets, boundary) {
          const key = recoveryMutationKey(
            discovery.workspace,
            operation,
            targets,
            boundary,
          );
          if (key) boundaries.push(key);
        },
      },
    })).toEqual({ ok: true, action: 'rolled-back' });
    expect(boundaries.length).toBeGreaterThan(0);

    for (let boundaryIndex = 0; boundaryIndex < boundaries.length; boundaryIndex += 1) {
      const fixture = createFixture();
      const seeded = seedPhase(fixture, 'sources-published');
      const sibling = path.join(
        fixture.workspace.stateRoot,
        'installed',
        `rollback-sibling-${boundaryIndex}`,
      );
      writeTreeFile(sibling, 'sentinel.txt', 'outside rollback\n');
      let eventIndex = 0;
      let interrupted = false;
      const result = recoverAssetPackTransaction({
        workspace: fixture.workspace,
        fileOps: {
          ...REAL_FILE_OPS,
          afterMutationSync(operation, targets, boundary) {
            const key = recoveryMutationKey(
              fixture.workspace,
              operation,
              targets,
              boundary,
            );
            if (!key) return;
            if (!interrupted && eventIndex === boundaryIndex) {
              interrupted = true;
              throw new Error(`rollback interruption at ${key}`);
            }
            eventIndex += 1;
          },
        },
      });
      expect(result.ok).toBe(false);
      expect(interrupted).toBe(true);
      const resumed = recoverAssetPackTransaction({ workspace: fixture.workspace });
      expect(resumed.ok).toBe(true);
      if (resumed.ok) expect(['rolled-back', 'none']).toContain(resumed.action);
      expect(readFileSync(
        path.join(fixture.workspace.outputRoot, '.lpc-toolkit-managed.json'),
      )).toEqual(fixture.oldMarkerBytes);
      expect(readFileSync(fixture.workspace.registryPath)).toEqual(fixture.oldRegistryBytes);
      expect(existsSync(seeded.finalSource)).toBe(false);
      expect(existsSync(seeded.cleanupSource)).toBe(true);
      expect(readFileSync(path.join(sibling, 'sentinel.txt'), 'utf8'))
        .toBe('outside rollback\n');
    }
  }, 20_000);

  it('restarts authenticated committed cleanup after every deletion and fsync boundary', () => {
    const discovery = createFixture();
    seedPhase(discovery, 'registry-published');
    const boundaries: string[] = [];
    expect(recoverAssetPackTransaction({
      workspace: discovery.workspace,
      fileOps: {
        ...REAL_FILE_OPS,
        afterMutationSync(operation, targets, boundary) {
          const key = recoveryMutationKey(
            discovery.workspace,
            operation,
            targets,
            boundary,
          );
          if (key) boundaries.push(key);
        },
      },
    })).toEqual({ ok: true, action: 'completed' });
    expect(boundaries.some((entry) => entry.includes('.backup'))).toBe(true);
    expect(boundaries.some((entry) => entry.includes('installed/'))).toBe(true);
    expect(boundaries.some((entry) => entry.includes('staging/'))).toBe(true);

    for (let boundaryIndex = 0; boundaryIndex < boundaries.length; boundaryIndex += 1) {
      const fixture = createFixture();
      const seeded = seedPhase(fixture, 'registry-published');
      const sibling = path.join(
        fixture.workspace.stateRoot,
        'installed',
        `cleanup-sibling-${boundaryIndex}`,
      );
      writeTreeFile(sibling, 'sentinel.txt', 'outside cleanup\n');
      let eventIndex = 0;
      let interrupted = false;
      const result = recoverAssetPackTransaction({
        workspace: fixture.workspace,
        fileOps: {
          ...REAL_FILE_OPS,
          afterMutationSync(operation, targets, boundary) {
            const key = recoveryMutationKey(
              fixture.workspace,
              operation,
              targets,
              boundary,
            );
            if (!key) return;
            if (!interrupted && eventIndex === boundaryIndex) {
              interrupted = true;
              throw new Error(`cleanup interruption at ${key}`);
            }
            eventIndex += 1;
          },
        },
      });
      expect(result.ok).toBe(false);
      expect(interrupted).toBe(true);
      const resumed = recoverAssetPackTransaction({ workspace: fixture.workspace });
      expect(resumed.ok).toBe(true);
      if (resumed.ok) expect(['completed', 'none']).toContain(resumed.action);
      expect(readFileSync(
        path.join(fixture.workspace.outputRoot, '.lpc-toolkit-managed.json'),
      )).toEqual(fixture.newMarkerBytes);
      expect(existsSync(seeded.finalSource)).toBe(true);
      expect(existsSync(seeded.cleanupSource)).toBe(false);
      expect(existsSync(transactionPath(fixture.workspace))).toBe(false);
      expect(readFileSync(path.join(sibling, 'sentinel.txt'), 'utf8'))
        .toBe('outside cleanup\n');
    }
  }, 20_000);

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

  it.each(['unmarked', 'substituted'] as const)(
    'rejects a %s staged output role without deleting it',
    (kind) => {
      const fixture = createFixture();
      const seeded = seedPhase(fixture, 'prepared');
      const stagedOutput = path.resolve(fixture.workspace.root, seeded.journal.stagedOutput);
      if (kind === 'unmarked') {
        rmSync(path.join(stagedOutput, '.lpc-toolkit-managed.json'));
      } else {
        writeFileSync(path.join(stagedOutput, 'CREDITS.csv'), 'substituted\n');
      }
      writeTreeFile(stagedOutput, 'role-sentinel.txt', `${kind}\n`);

      expectUnsafe(fixture, seeded.journal);
      expect(readFileSync(path.join(stagedOutput, 'role-sentinel.txt'), 'utf8'))
        .toBe(`${kind}\n`);
    },
  );

  it('rejects an unmarked output backup role without deleting it', () => {
    const fixture = createFixture();
    const seeded = seedPhase(fixture, 'registry-published');
    const outputBackup = path.resolve(
      fixture.workspace.root,
      seeded.journal.oldOutputBackup,
    );
    rmSync(path.join(outputBackup, '.lpc-toolkit-managed.json'));
    writeTreeFile(outputBackup, 'role-sentinel.txt', 'backup\n');

    expectUnsafe(fixture, seeded.journal);
    expect(readFileSync(path.join(outputBackup, 'role-sentinel.txt'), 'utf8'))
      .toBe('backup\n');
  });

  it.each([3, 4, 5, 6, 7, 8, 9, 10])(
    'rejects forged rollback recovery cursor %i without mutation',
    (cursor) => {
      const fixture = createFixture();
      seedPhase(fixture, 'sources-published');
      let interrupted = false;
      const authorizationOnly: AssetTransactionFileOps = {
        ...REAL_FILE_OPS,
        afterMutationValidationSync(operation, targets) {
          if (
            !interrupted
            && operation === 'remove'
            && targets.some((target) => path.resolve(target) === fixture.workspace.outputRoot)
          ) {
            interrupted = true;
            throw new Error('stop after rollback authorization');
          }
        },
      };
      expect(recoverAssetPackTransaction({
        workspace: fixture.workspace,
        fileOps: authorizationOnly,
      }).ok).toBe(false);
      expect(interrupted).toBe(true);
      const authorized = readJournal(fixture);
      expect(authorized.recoveryMode).toBe('rollback');

      expectUnsafe(fixture, { ...authorized, recoveryCursor: cursor });
    },
  );

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'rejects forged cleanup recovery cursor %i without mutation',
    (cursor) => {
      const fixture = createFixture();
      const seeded = seedPhase(fixture, 'registry-published');
      let interrupted = false;
      const authorizationOnly: AssetTransactionFileOps = {
        ...REAL_FILE_OPS,
        afterMutationValidationSync(operation, targets) {
          if (
            !interrupted
            && operation === 'remove'
            && targets.some((target) => path.resolve(target) === path.resolve(seeded.cleanupSource))
          ) {
            interrupted = true;
            throw new Error('stop after cleanup authorization');
          }
        },
      };
      expect(recoverAssetPackTransaction({
        workspace: fixture.workspace,
        fileOps: authorizationOnly,
      }).ok).toBe(false);
      expect(interrupted).toBe(true);
      const authorized = readJournal(fixture);
      expect(authorized.recoveryMode).toBe('cleanup');

      expectUnsafe(fixture, { ...authorized, recoveryCursor: cursor });
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
          events.push(`mkdir:${path.resolve(String(target))}`);
          return mkdirSync(target, mkdirOptions);
        },
        writeFileSync(target, data, writeOptions) {
          events.push(`write:${typeof target === 'number' ? target : path.resolve(String(target))}`);
          writeFileSync(target, data, writeOptions);
        },
        openSync(target, flags, mode) {
          const descriptor = openSync(target, flags, mode);
          const resolvedTarget = path.resolve(String(target));
          descriptors.set(descriptor, resolvedTarget);
          events.push(`open:${resolvedTarget}`);
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
          events.push(`rename:${path.resolve(String(source))}->${path.resolve(String(destination))}`);
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

  it('surfaces direct recovery claim unlink failure instead of reporting success', () => {
    const fixture = createFixture();
    seedPhase(fixture, 'prepared');
    let releaseAttempted = false;
    const releaseFailure: AssetTransactionFileOps = {
      ...REAL_FILE_OPS,
      rmSync(target, options) {
        if (path.basename(String(target)) === 'transaction.lock') {
          releaseAttempted = true;
          throw Object.assign(new Error('claim release unlink failed'), { code: 'EIO' });
        }
        return rmSync(target, options);
      },
    };

    const result = recoverAssetPackTransaction({
      workspace: fixture.workspace,
      fileOps: releaseFailure,
    });
    expect(releaseAttempted).toBe(true);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected direct recovery release failure.');
    expect(result.diagnostics.map((entry) => entry.code)).toEqual(['asset_publish_failed']);
    expect(result.diagnostics[0]?.message).toContain('claim release unlink failed');
    expect(existsSync(transactionClaimPath(fixture.workspace))).toBe(true);
  });

  it('preserves an unsafe recovery result when claim-release fsync also fails', () => {
    const fixture = createFixture();
    writeJournal(fixture, { unsafe: true });
    let claimRemoved = false;
    let releaseFsyncFailed = false;
    const releaseFailure: AssetTransactionFileOps = {
      ...REAL_FILE_OPS,
      rmSync(target, options) {
        const result = rmSync(target, options);
        if (path.basename(String(target)) === 'transaction.lock') claimRemoved = true;
        return result;
      },
      fsyncSync(descriptor) {
        if (claimRemoved && !releaseFsyncFailed) {
          releaseFsyncFailed = true;
          throw Object.assign(new Error('claim release fsync failed'), { code: 'EIO' });
        }
        fsyncSync(descriptor);
      },
    };

    const result = recoverAssetPackTransaction({
      workspace: fixture.workspace,
      fileOps: releaseFailure,
    });
    expect(releaseFsyncFailed).toBe(true);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected unsafe recovery and release failure.');
    expect(result.diagnostics.map((entry) => entry.code)).toEqual([
      'asset_transaction_unsafe',
      'asset_publish_failed',
    ]);
    expect(result.diagnostics[1]?.message).toContain('claim release fsync failed');
    expect(existsSync(transactionClaimPath(fixture.workspace))).toBe(false);
  });

  it('fsyncs the parent of every newly created nested output and installed directory', async () => {
    const fixture = createFixture();
    const recorder = recordingFileOps();
    const state = desiredState(fixture);
    const stopAfterMaterialization: AssetTransactionFileOps = {
      ...recorder.fileOps,
      afterMutationValidationSync(operation, targets) {
        if (
          operation === 'rename'
          && path.resolve(targets[0] ?? '') === fixture.workspace.outputRoot
        ) {
          throw new Error('stop after durable materialization');
        }
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
      const canonicalDirectory = path.join(
        realpathSync(path.dirname(directory)),
        path.basename(directory),
      );
      expect(recorder.events).toContain(`mkdir:${canonicalDirectory}`);
      expect(recorder.events).toContain(`fsync:${realpathSync(path.dirname(directory))}`);
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
      afterClaimAcquiredSync() {
        if (!injected) {
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
      afterMutationValidationSync(operation, targets) {
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
    'does not traverse a publication parent replaced immediately before %s',
    async (boundary) => {
      const fixture = createFixture();
      const outside = createDirectory(`lpc-asset-pack-transaction-${boundary}-race-`);
      let outsideSentinel: string | undefined;
      let replacedParent: string | undefined;
      let heldParent: string | undefined;
      const racingOps: AssetTransactionFileOps = {
        ...REAL_FILE_OPS,
        afterMutationValidationSync(operation, targets) {
          const source = targets[0];
          const destination = targets[1];
          if (!source || replacedParent || operation !== boundary) return;
          const isTargetBoundary = boundary === 'write'
            ? path.basename(source) === '.lpc-toolkit-managed.json'
              && path.basename(path.dirname(source)).endsWith('.staged')
            : destination !== undefined
              && path.resolve(destination) === path.resolve(fixture.workspace.outputRoot)
              && path.basename(source).endsWith('.staged');
          if (!isTargetBoundary) return;
          replacedParent = path.dirname(source);
          heldParent = `${replacedParent}.held`;
          const relativeTarget = boundary === 'write'
            ? path.basename(source)
            : path.join(path.basename(source), '.lpc-toolkit-managed.json');
          outsideSentinel = path.join(outside, relativeTarget);
          writeTreeFile(outside, relativeTarget, 'outside\n');
          renameSync(replacedParent, heldParent);
          symlinkSync(
            outside,
            replacedParent,
            process.platform === 'win32' ? 'junction' : 'dir',
          );
        },
      };

      try {
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
      } finally {
        if (replacedParent && heldParent) {
          rmSync(replacedParent, { recursive: true, force: true });
          renameSync(heldParent, replacedParent);
        }
      }
    },
  );

  it.each(['output', 'registry', 'installed-source'] as const)(
    'does not traverse a %s publication destination parent replaced after validation',
    async (boundary) => {
      const fixture = createFixture();
      const outside = createDirectory(`lpc-asset-pack-transaction-${boundary}-destination-race-`);
      const sentinel = path.join(outside, 'sentinel.txt');
      writeFileSync(sentinel, 'outside\n');
      const stagedSource = path.join(fixture.workspace.stateRoot, 'staging', 'incoming-install');
      const finalSource = installedPath(fixture.workspace);
      if (boundary === 'installed-source') {
        writeInstalledSource(fixture, stagedSource, '1.0.0', ARCHIVE_DIGEST);
      }

      let replacedParent: string | undefined;
      let heldParent: string | undefined;
      let outsideDestination: string | undefined;
      const racingOps: AssetTransactionFileOps = {
        ...REAL_FILE_OPS,
        afterMutationValidationSync(operation, targets) {
          if (operation !== 'rename' || replacedParent !== undefined) return;
          const source = path.resolve(targets[0] ?? '');
          const destination = path.resolve(targets[1] ?? '');
          const matches = boundary === 'output'
            ? source === path.resolve(fixture.workspace.outputRoot)
            : boundary === 'registry'
              ? source === path.resolve(fixture.workspace.registryPath)
              : destination === path.resolve(finalSource);
          if (!matches) return;
          replacedParent = path.dirname(destination);
          heldParent = `${replacedParent}.held`;
          outsideDestination = path.join(outside, path.basename(destination));
          renameSync(replacedParent, heldParent);
          symlinkSync(outside, replacedParent, process.platform === 'win32' ? 'junction' : 'dir');
        },
      };

      try {
        const result = await publishAssetPackGeneration({
          operation: boundary === 'installed-source' ? 'install' : 'sync',
          workspace: fixture.workspace,
          desiredState: boundary === 'installed-source'
            ? installedDesiredState(fixture, finalSource)
            : desiredState(fixture),
          ...(boundary === 'installed-source'
            ? { stagedInstalledSource: stagedSource, finalInstalledSource: finalSource }
            : {}),
          cleanupInstalledSources: [],
          fileOps: racingOps,
        });
        expect(result.ok).toBe(false);
        expect(replacedParent).toBeDefined();
        expect(heldParent).toBeDefined();
        expect(outsideDestination).toBeDefined();
        expect(readFileSync(sentinel, 'utf8')).toBe('outside\n');
        expect(existsSync(outsideDestination!)).toBe(false);
      } finally {
        if (replacedParent && heldParent) {
          rmSync(replacedParent, { recursive: true, force: true });
          renameSync(heldParent, replacedParent);
        }
      }
    },
  );

  it.each(['output', 'registry', 'installed-source'] as const)(
    'rejects a substituted %s publication child at the mutation boundary',
    async (boundary) => {
      const fixture = createFixture();
      const stagedSource = path.join(fixture.workspace.stateRoot, 'staging', 'incoming-install');
      const finalSource = installedPath(fixture.workspace);
      if (boundary === 'installed-source') {
        writeInstalledSource(fixture, stagedSource, '1.0.0', ARCHIVE_DIGEST);
      }
      let substitutedSource: string | undefined;
      let heldSource: string | undefined;
      const racingOps: AssetTransactionFileOps = {
        ...REAL_FILE_OPS,
        afterMutationValidationSync(operation, targets) {
          if (operation !== 'rename' || substitutedSource !== undefined) return;
          const source = path.resolve(targets[0] ?? '');
          const destination = path.resolve(targets[1] ?? '');
          const matches = boundary === 'output'
            ? source === path.resolve(fixture.workspace.outputRoot)
            : boundary === 'registry'
              ? source === path.resolve(fixture.workspace.registryPath)
              : destination === path.resolve(finalSource);
          if (!matches) return;
          substitutedSource = source;
          heldSource = `${source}.held-child`;
          renameSync(source, heldSource);
          if (boundary === 'registry') {
            writeFileSync(source, 'substituted registry child\n');
          } else {
            writeTreeFile(source, 'child-sentinel.txt', `${boundary}\n`);
          }
        },
      };

      const result = await publishAssetPackGeneration({
        operation: boundary === 'installed-source' ? 'install' : 'sync',
        workspace: fixture.workspace,
        desiredState: boundary === 'installed-source'
          ? installedDesiredState(fixture, finalSource)
          : desiredState(fixture),
        ...(boundary === 'installed-source'
          ? { stagedInstalledSource: stagedSource, finalInstalledSource: finalSource }
          : {}),
        cleanupInstalledSources: [],
        fileOps: racingOps,
      });

      expect(result.ok).toBe(false);
      expect(substitutedSource).toBeDefined();
      expect(heldSource).toBeDefined();
      expect(existsSync(heldSource!)).toBe(true);
      if (boundary === 'registry') {
        expect(readFileSync(substitutedSource!, 'utf8')).toBe('substituted registry child\n');
      } else {
        expect(readFileSync(path.join(substitutedSource!, 'child-sentinel.txt'), 'utf8'))
          .toBe(`${boundary}\n`);
      }
    },
  );

  it('rejects a substituted rollback rename child at the mutation boundary', () => {
    const fixture = createFixture();
    const seeded = seedPhase(fixture, 'output-published');
    const outputBackup = path.resolve(fixture.workspace.root, seeded.journal.oldOutputBackup);
    const heldBackup = `${outputBackup}.held-child`;
    let substituted = false;
    const racingOps: AssetTransactionFileOps = {
      ...REAL_FILE_OPS,
      afterMutationValidationSync(operation, targets) {
        if (
          substituted
          || operation !== 'rename'
          || path.resolve(targets[0] ?? '') !== outputBackup
          || path.resolve(targets[1] ?? '') !== path.resolve(fixture.workspace.outputRoot)
        ) return;
        substituted = true;
        renameSync(outputBackup, heldBackup);
        writeTreeFile(outputBackup, 'child-sentinel.txt', 'rollback\n');
      },
    };

    const result = recoverAssetPackTransaction({
      workspace: fixture.workspace,
      fileOps: racingOps,
    });
    expect(result.ok).toBe(false);
    expect(substituted).toBe(true);
    expect(existsSync(heldBackup)).toBe(true);
    expect(readFileSync(path.join(outputBackup, 'child-sentinel.txt'), 'utf8'))
      .toBe('rollback\n');
  });

  it('rejects a substituted cleanup child before recursive removal', () => {
    const fixture = createFixture();
    const seeded = seedPhase(fixture, 'registry-published');
    const heldCleanup = `${seeded.cleanupSource}.held-child`;
    const sibling = path.join(path.dirname(seeded.cleanupSource), 'd'.repeat(64));
    writeTreeFile(sibling, 'child-sentinel.txt', 'cleanup sibling\n');
    let substituted = false;
    const racingOps: AssetTransactionFileOps = {
      ...REAL_FILE_OPS,
      afterMutationValidationSync(operation, targets) {
        if (
          substituted
          || operation !== 'remove'
          || !targets.some((target) => path.resolve(target) === path.resolve(seeded.cleanupSource))
        ) return;
        substituted = true;
        renameSync(seeded.cleanupSource, heldCleanup);
        renameSync(sibling, seeded.cleanupSource);
      },
    };

    const result = recoverAssetPackTransaction({
      workspace: fixture.workspace,
      fileOps: racingOps,
    });
    expect(result.ok).toBe(false);
    expect(substituted).toBe(true);
    expect(existsSync(heldCleanup)).toBe(true);
    expect(readFileSync(path.join(seeded.cleanupSource, 'child-sentinel.txt'), 'utf8'))
      .toBe('cleanup sibling\n');
  });

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
        afterMutationValidationSync(operation, targets) {
          if (
            boundary === 'after-old-registry-backup'
            && !injected
            && operation === 'rename'
            && path.basename(targets[0] ?? '').endsWith('.staged')
            && path.resolve(targets[1] ?? '') === fixture.workspace.registryPath
          ) {
            injected = true;
            throw new Error('crash after old registry backup');
          }
        },
        afterMutationSync(operation, targets, mutationBoundary) {
          if (
            boundary === 'after-new-registry-rename'
            && !injected
            && operation === 'rename'
            && mutationBoundary === 'mutation'
            && path.basename(targets[0] ?? '').endsWith('.staged')
            && path.resolve(targets[1] ?? '') === fixture.workspace.registryPath
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
    const transactionsRoot = path.join(fixture.workspace.stateRoot, 'transactions');
    expect(existsSync(transactionsRoot) ? readdirSync(transactionsRoot) : []).toEqual([]);
  });
});
