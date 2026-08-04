import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import { standardAnimationGeometry } from '@lpc-toolkit/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assetAuthoringSessionPath,
  createAssetAuthoringSessionStore,
  type AssetAuthoringSession,
} from '../src/asset-authoring-session.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { readAssetPackArchive } from '../src/asset-pack-archive-format.js';
import { initializeAssetWorkspace } from '../src/asset-workspace.js';
import { runCli, type CliDependencies } from '../src/main.js';
import { createRuntimeContext } from '../src/context.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

const temporaryDirectories: string[] = [];

const PLAN = {
  schema: 'lpc-toolkit.asset-authoring-plan.v1',
  goal: 'new-item',
  pack: {
    id: 'acme.draft-recovery',
    version: '1.0.0',
    displayName: 'ACME Draft Recovery',
  },
  asset: {
    kind: 'new-item',
    localId: 'moon-braid',
    displayName: 'Moon Braid',
    typeName: 'hair',
    bodyTypes: ['male'],
    animations: ['walk'],
    layers: [{ id: 'foreground', zPos: 120, bodyTypes: ['male'] }],
  },
  scope: {
    packId: 'acme.draft-recovery',
    assetId: 'moon-braid',
    bodyTypes: ['male'],
    animations: ['walk'],
    paths: ['sprites/moon-braid/foreground/walk.png'],
  },
  consent: {
    approved: true,
    scope: {
      packId: 'acme.draft-recovery',
      assetId: 'moon-braid',
      bodyTypes: ['male'],
      animations: ['walk'],
      paths: ['sprites/moon-braid/foreground/walk.png'],
    },
  },
  provider: {
    id: 'external-artist',
    tool: 'sprite-drawing-workbench',
    model: 'human-authored',
  },
  draftCredits: {
    authors: ['Draft Artist'],
    licenses: ['CC-BY-SA 4.0'],
    urls: ['https://example.test/draft-recovery'],
    notes: 'Draft recovery fixture.',
  },
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

function createDraftFixture(): {
  readonly root: string;
  readonly workspaceRoot: string;
  readonly workspace: ReturnType<typeof initializeAssetWorkspace>;
  readonly packRoot: string;
  readonly sourcePath: string;
  readonly session: AssetAuthoringSession;
} {
  const root = createDirectory('lpc-authoring-draft-');
  const workspaceRoot = path.join(root, 'artist-workspace');
  const workspace = initializeAssetWorkspace(workspaceRoot);
  const packRoot = path.join(workspace.packsRoot, PLAN.pack.id);
  writeJson(path.join(packRoot, 'asset-pack.json'), {
    schema: 'lpc-toolkit.asset-pack.v1',
    id: PLAN.pack.id,
    version: PLAN.pack.version,
    displayName: PLAN.pack.displayName,
    credits: PLAN.draftCredits,
    assets: [{
      kind: 'new-item',
      localId: PLAN.asset.localId,
      displayName: PLAN.asset.displayName,
      typeName: PLAN.asset.typeName,
      bodyTypes: PLAN.asset.bodyTypes,
      animations: PLAN.asset.animations,
      layers: [{
        id: 'foreground',
        zPos: 120,
        sprites: [{
          animation: 'walk',
          source: 'sprites/moon-braid/foreground/walk.png',
        }],
      }],
    }],
  });
  const sourcePath = path.join(packRoot, 'sprites/moon-braid/foreground/walk.png');
  mkdirSync(path.dirname(sourcePath), { recursive: true });
  writeFileSync(sourcePath, Buffer.from('deterministic-draft-source'));
  const session = createAssetAuthoringSessionStore(workspace).create({
    plan: PLAN,
    packRoot,
  });
  return { root, workspaceRoot, workspace, packRoot, sourcePath, session };
}

function createEmptyRuntime(cwd: string): RuntimeAssets {
  const assetsRoot = path.join(cwd, 'runtime-assets');
  mkdirSync(assetsRoot, { recursive: true });
  writeJson(path.join(assetsRoot, 'sheet_definitions', 'hair', 'base.json'), {
    name: 'Base Hair',
    type_name: 'hair',
    animations: ['walk'],
    credits: [{
      file: 'hair/base',
      authors: ['Base Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.test/base'],
      notes: '',
    }],
    layer_1: { zPos: 50, male: 'hair/base/' },
  });
  writeJson(path.join(assetsRoot, 'palette_definitions', 'hair', 'meta_hair.json'), {
    type: 'material',
    default: 'ulpc',
    base: 'black',
  });
  writeJson(path.join(assetsRoot, 'palette_definitions', 'hair', 'hair_ulpc.json'), {
    black: ['#111111', '#222222'],
  });
  writeFileSync(path.join(assetsRoot, 'CREDITS.csv'), 'filename,notes,authors,licenses,urls\n');
  const store = createDirectoryAssetStore(assetsRoot);
  return {
    context: createRuntimeContext({
      cwd,
      assetsRoot,
      spritesheetsBaseUrl: store.baseUrl,
    }),
    store,
    source: 'working-directory',
  };
}

function writeWalkPng(filePath: string): void {
  const geometry = standardAnimationGeometry('walk');
  const maxColumn = Math.max(
    ...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)),
  );
  const canvas = createCanvas(
    (maxColumn + 1) * geometry.frameSize,
    geometry.rows.length * geometry.frameSize,
  );
  const context = canvas.getContext('2d');
  context.fillStyle = '#884422';
  context.fillRect(0, 0, canvas.width, canvas.height);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, canvas.toBuffer('image/png'));
}

function createPreparedSyncFixture(): ReturnType<typeof createDraftFixture> & {
  readonly runtime: RuntimeAssets;
} {
  const fixture = createDraftFixture();
  writeWalkPng(fixture.sourcePath);
  const store = createAssetAuthoringSessionStore(fixture.workspace);
  const created = store.create({ plan: PLAN, packRoot: fixture.packRoot });
  const sourceDigest = `sha256:${createHash('sha256').update(readFileSync(fixture.sourcePath)).digest('hex')}`;
  const session = store.replace(created.sessionId, {
    state: 'needs-user-action',
    reason: 'imported',
    phase: 'imported',
    checkpointFreshness: 'current',
    checkpoints: [{
      targetId: PLAN.scope.paths[0],
      freshness: 'current',
      checkpoint: {
        id: 'source',
        phase: 'imported',
        digest: sourceDigest,
        freshness: 'current',
      },
    }],
  });
  return { ...fixture, session, runtime: createEmptyRuntime(fixture.workspaceRoot) };
}

function runJson<T>(
  argv: readonly string[],
  cwd: string,
  dependencies: Partial<CliDependencies> = {},
): Promise<{
  readonly code: number;
  readonly response: { readonly data: T | null; readonly errors: readonly unknown[] };
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return runCli([...argv, '--json'], {
    cwd,
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  }, dependencies).then((code) => ({
    code,
    response: JSON.parse(stdout.join('')) as {
      readonly data: T | null;
      readonly errors: readonly unknown[];
    },
  }));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('session-aware release boundaries', () => {
  it('validates the draft command through its public argv seam', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runCli([
      'asset', 'authoring', 'draft', '--json',
    ], {
      cwd: process.cwd(),
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });

    expect(exitCode).toBe(1);
    expect(stderr.join('')).toBe('');
    const response = JSON.parse(stdout.join('')) as {
      readonly errors: readonly { readonly code: string; readonly path?: string }[];
    };
    expect(response.errors[0]).toEqual({
      code: 'missing_argument',
      message: '--session is required.',
      path: '--session',
    });
  });

  it('writes a deterministic draft archive and persists its receipt', async () => {
    const fixture = createDraftFixture();
    const { workspaceRoot, sourcePath, session } = fixture;

    const first = await runJson<{
      readonly draftReceipt: {
        readonly archivePath: string;
        readonly archiveDigest: string;
        readonly manifestDigest: string;
        readonly contentDigest: string;
      } | null;
    }>([
      'asset', 'authoring', 'draft', '--session', session.sessionId,
    ], workspaceRoot);

    expect(first.code).toBe(0);
    expect(first.response.errors).toEqual([]);
    expect(first.response.data?.draftReceipt).toMatchObject({
      archivePath: expect.stringContaining('.draft.lpc-assets.zip'),
      archiveDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      manifestDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      contentDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    });
    const firstReceipt = first.response.data?.draftReceipt;
    if (firstReceipt === null || firstReceipt === undefined) {
      throw new Error('Expected a draft receipt.');
    }
    expect(existsSync(firstReceipt.archivePath)).toBe(true);
    const inspected = await readAssetPackArchive({ archivePath: firstReceipt.archivePath });
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) throw new Error('Expected the draft archive to be readable.');
    expect(inspected.snapshot.payload.pack.status).toBe('draft');
    const checksums = JSON.parse(inspected.snapshot.checksumsBytes.toString('utf8')) as {
      readonly files: readonly { readonly path: string }[];
    };
    expect(checksums.files.map((file) => file.path)).toEqual([
      'asset-pack.json',
      'sprites/moon-braid/foreground/walk.png',
    ]);
    const firstBytes = readFileSync(firstReceipt.archivePath);

    const second = await runJson<{
      readonly draftReceipt: typeof firstReceipt;
    }>([
      'asset', 'authoring', 'draft', '--session', session.sessionId,
    ], workspaceRoot);
    expect(second.code).toBe(0);
    expect(second.response.data?.draftReceipt).toEqual(firstReceipt);
    expect(readFileSync(firstReceipt.archivePath)).toEqual(firstBytes);
    expect(readFileSync(sourcePath)).toEqual(Buffer.from('deterministic-draft-source'));
  });

  it('preserves a prior receipt when source evidence becomes stale', async () => {
    const fixture = createDraftFixture();
    const { workspaceRoot, sourcePath, session } = fixture;
    const first = await runJson<{
      readonly draftReceipt: { readonly archivePath: string; readonly archiveDigest: string } | null;
    }>(['asset', 'authoring', 'draft', '--session', session.sessionId], workspaceRoot);
    const firstReceipt = first.response.data?.draftReceipt;
    if (firstReceipt === null || firstReceipt === undefined) {
      throw new Error('Expected a draft receipt.');
    }

    writeFileSync(sourcePath, Buffer.from('changed-draft-source'));
    const stale = await runJson<{
      readonly state: string;
      readonly reason: string;
      readonly checkpointFreshness: string;
      readonly draftReceipt: typeof firstReceipt;
      readonly nextActions: readonly { readonly id: string }[];
    }>(['asset', 'authoring', 'draft', '--session', session.sessionId], workspaceRoot);

    expect(stale.code).toBe(0);
    expect(stale.response.data).toMatchObject({
      state: 'needs-user-action',
      reason: 'draft-archive-stale',
      checkpointFreshness: 'stale',
      draftReceipt: firstReceipt,
      nextActions: [{ id: 'recreate-draft-archive' }],
    });
    expect(readFileSync(firstReceipt.archivePath)).not.toEqual(Buffer.from('changed-draft-source'));
  });

  it('rejects traversal and conflicting draft archive destinations without mutation', async () => {
    const fixture = createDraftFixture();
    const { root, workspaceRoot, workspace, session } = fixture;
    const outsidePath = path.join(root, 'escaped.lpc-assets.zip');
    const traversal = await runJson<null>([
      'asset', 'authoring', 'draft', '--session', session.sessionId, '--output', '../escaped.lpc-assets.zip',
    ], workspaceRoot);
    expect(traversal.code).toBe(1);
    expect(traversal.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_authoring_draft_path_invalid' }),
    ]);
    expect(existsSync(outsidePath)).toBe(false);

    const sessionPath = assetAuthoringSessionPath(workspace, session.sessionId);
    const conflictPath = path.join(
      path.dirname(sessionPath),
      'release-artifacts',
      'conflict.draft.lpc-assets.zip',
    );
    mkdirSync(path.dirname(conflictPath), { recursive: true });
    const conflictingBytes = Buffer.from('external-archive-bytes');
    writeFileSync(conflictPath, conflictingBytes);
    const sessionBefore = readFileSync(sessionPath);
    const conflict = await runJson<null>([
      'asset', 'authoring', 'draft', '--session', session.sessionId,
      '--output', conflictPath,
    ], workspaceRoot);
    expect(conflict.code).toBe(1);
    expect(conflict.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_authoring_draft_archive_conflict' }),
    ]);
    expect(readFileSync(conflictPath)).toEqual(conflictingBytes);
    expect(readFileSync(sessionPath)).toEqual(sessionBefore);
  });

  it('keeps draft inspect and install behavior on the existing public lifecycle seams', async () => {
    const fixture = createDraftFixture();
    const { workspaceRoot, session } = fixture;
    const draft = await runJson<{
      readonly draftReceipt: { readonly archivePath: string } | null;
    }>(['asset', 'authoring', 'draft', '--session', session.sessionId], workspaceRoot);
    const archivePath = draft.response.data?.draftReceipt?.archivePath;
    if (archivePath === undefined) throw new Error('Expected a draft archive path.');

    const consumerRoot = createDirectory('lpc-authoring-consumer-');
    const consumerWorkspace = initializeAssetWorkspace(consumerRoot);
    const outputBefore = readdirSync(consumerWorkspace.outputRoot).sort();
    const runtime = createEmptyRuntime(consumerRoot);
    const inspect = await runJson<{
      readonly status?: string;
      readonly valid: boolean;
      readonly diagnostics: readonly { readonly code: string }[];
    }>(['asset', 'inspect', archivePath], consumerRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(inspect.code).toBe(1);
    expect(inspect.response.errors).toEqual([]);
    expect(inspect.response.data).toMatchObject({
      status: 'draft',
      valid: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'asset_pack_draft' }),
      ]),
    });

    const install = await runJson<null>(['asset', 'install', archivePath], consumerRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(install.code).toBe(1);
    expect(install.response.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_pack_draft' }),
    ]));
    expect(readdirSync(consumerWorkspace.outputRoot).sort()).toEqual(outputBefore);
  });

  it('requires sync confirmation and records the committed manager generation', async () => {
    const fixture = createPreparedSyncFixture();
    const { workspaceRoot, workspace, runtime } = fixture;
    const { session: preparedSession } = fixture;
    const sessionBefore = readFileSync(assetAuthoringSessionPath(workspace, preparedSession.sessionId));
    const outputBefore = readdirSync(workspace.outputRoot).sort();

    const pending = await runJson<{
      readonly state: string;
      readonly reason: string;
      readonly syncReceipt: null;
      readonly nextActions: readonly {
        readonly id: string;
        readonly command: string;
        readonly safety: string;
      }[];
    }>(['asset', 'authoring', 'sync', '--session', preparedSession.sessionId], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(pending.code, JSON.stringify(pending.response, null, 2)).toBe(0);
    expect(pending.response.data).toMatchObject({
      state: 'needs-user-action',
      reason: 'sync-confirmation-required',
      syncReceipt: null,
      nextActions: [{
        id: 'confirm-sync',
        command: `asset authoring sync --session ${preparedSession.sessionId} --confirm`,
        safety: 'requires-confirmation',
      }],
    });
    expect(readdirSync(workspace.outputRoot).sort()).toEqual(outputBefore);
    expect(readFileSync(assetAuthoringSessionPath(workspace, preparedSession.sessionId))).not.toEqual(sessionBefore);
    expect(createAssetAuthoringSessionStore(workspace).read(preparedSession.sessionId).receipts.sync).toBeNull();

    const confirmed = await runJson<{
      readonly state: string;
      readonly reason: string;
      readonly syncReceipt: {
        readonly id: string;
        readonly packId: string;
        readonly version: string;
        readonly manifestDigest: string;
        readonly contentDigest: string;
        readonly sourceDigests: readonly { readonly path: string; readonly digest: string }[];
        readonly workspaceId: string;
        readonly outputRoot: string;
        readonly registryDigest: string;
        readonly compileDigest: string;
        readonly generatedDigests: Readonly<Record<string, string>>;
        readonly recordedAt: string;
      } | null;
    }>(['asset', 'authoring', 'sync', '--session', preparedSession.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(confirmed.code, JSON.stringify(confirmed.response, null, 2)).toBe(0);
    expect(confirmed.response.data).toMatchObject({
      state: 'completed',
      reason: 'sync-current',
      syncReceipt: {
        id: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        packId: PLAN.pack.id,
        version: PLAN.pack.version,
        manifestDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        contentDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        workspaceId: expect.any(String),
        outputRoot: workspace.outputRoot,
        registryDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        compileDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        generatedDigests: expect.objectContaining({}),
        recordedAt: expect.stringMatching(/^2026-/u),
      },
    });
    const firstReceipt = confirmed.response.data?.syncReceipt;
    if (firstReceipt === null || firstReceipt === undefined) {
      throw new Error('Expected a sync receipt.');
    }
    expect(firstReceipt.sourceDigests).toEqual([{
      path: PLAN.scope.paths[0],
      digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    }]);
    expect(Object.keys(firstReceipt.generatedDigests)).toEqual(
      [...Object.keys(firstReceipt.generatedDigests)].sort(),
    );
    expect(existsSync(workspace.registryPath)).toBe(true);

    const humanStdout: string[] = [];
    const humanStderr: string[] = [];
    const humanCode = await runCli([
      'asset', 'authoring', 'status', '--session', preparedSession.sessionId,
    ], {
      cwd: workspaceRoot,
      stdout: (text) => humanStdout.push(text),
      stderr: (text) => humanStderr.push(text),
    });
    expect(humanCode).toBe(0);
    expect(humanStderr).toEqual([]);
    expect(humanStdout.join('')).toContain(`Synchronized overlay: ${workspace.outputRoot}`);
    expect(humanStdout.join('')).toContain('Registry receipt:');

    const second = await runJson<{
      readonly syncReceipt: typeof firstReceipt;
    }>(['asset', 'authoring', 'sync', '--session', preparedSession.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(second.code, JSON.stringify(second.response, null, 2)).toBe(0);
    expect(second.response.data?.syncReceipt).toEqual(firstReceipt);
  });

  it('preserves the last sync receipt and published bytes after managed output drift', async () => {
    const fixture = createPreparedSyncFixture();
    const { workspaceRoot, workspace, runtime, session } = fixture;
    const first = await runJson<{
      readonly syncReceipt: {
        readonly generatedDigests: Readonly<Record<string, string>>;
      } | null;
    }>(['asset', 'authoring', 'sync', '--session', session.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(first.code, JSON.stringify(first.response, null, 2)).toBe(0);
    const firstReceipt = first.response.data?.syncReceipt;
    if (firstReceipt === null || firstReceipt === undefined) {
      throw new Error('Expected a sync receipt.');
    }
    const generatedPath = Object.keys(firstReceipt.generatedDigests)[0];
    if (generatedPath === undefined) throw new Error('Expected a generated output path.');
    const outputPath = path.join(workspace.outputRoot, ...generatedPath.split('/'));
    const tamperedOutput = Buffer.from('tampered-managed-output');
    writeFileSync(outputPath, tamperedOutput);

    const failed = await runJson<null>([
      'asset', 'authoring', 'sync', '--session', session.sessionId, '--confirm',
    ], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(failed.code).toBe(1);
    expect(failed.response.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_digest_mismatch' }),
    ]));
    expect(readFileSync(outputPath)).toEqual(tamperedOutput);
    expect(createAssetAuthoringSessionStore(workspace).read(session.sessionId).receipts.sync)
      .toEqual(firstReceipt);

    const status = await runJson<{
      readonly reason: string;
      readonly syncReceipt: typeof firstReceipt;
      readonly nextActions: readonly { readonly id: string }[];
    }>(['asset', 'authoring', 'status', '--session', session.sessionId], workspaceRoot);
    expect(status.code).toBe(0);
    expect(status.response.data).toMatchObject({
      reason: 'sync-receipt-stale',
      syncReceipt: firstReceipt,
      nextActions: [{ id: 'confirm-sync' }],
    });
  });
});
