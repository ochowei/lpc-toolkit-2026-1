import {
  existsSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import {
  standardAnimationGeometry,
  type AssetReleaseProvenanceProjection,
} from '@lpc-toolkit/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assetAuthoringSessionPath,
  createAssetAuthoringSessionStore,
  type AssetAuthoringSession,
} from '../src/asset-authoring-session.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { readAssetPackArchive } from '../src/asset-pack-archive-format.js';
import { packAssetPack } from '../src/asset-pack-packaging.js';
import { validateAssetPackDirectory } from '../src/asset-pack-validation.js';
import { initializeAssetWorkspace } from '../src/asset-workspace.js';
import { encodeAssetReleaseProvenance } from '../src/asset-release-provenance.js';
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

function writeWalkPng(filePath: string, fillStyle = '#884422'): void {
  const geometry = standardAnimationGeometry('walk');
  const maxColumn = Math.max(
    ...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)),
  );
  const canvas = createCanvas(
    (maxColumn + 1) * geometry.frameSize,
    geometry.rows.length * geometry.frameSize,
  );
  const context = canvas.getContext('2d');
  context.fillStyle = fillStyle;
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

function digest(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function encodeProvenanceProjection(
  projection: unknown,
): Buffer {
  return encodeAssetReleaseProvenance(
    projection as AssetReleaseProvenanceProjection,
    (value) => new TextEncoder().encode(value),
  ).bytes;
}

async function createFormalReadyFixture(): Promise<ReturnType<typeof createPreparedSyncFixture>> {
  const fixture = createPreparedSyncFixture();
  const report = await validateAssetPackDirectory({
    packDirectory: fixture.packRoot,
    workspace: fixture.workspace,
    runtime: fixture.runtime,
  });
  if (!report.valid || report.contentDigest === undefined || report.manifestDigest === undefined
    || report.sourceDigests === undefined) {
    throw new Error(`Expected a formal-ready validation report: ${JSON.stringify(report)}`);
  }
  const previewRoot = path.join(fixture.packRoot, 'release-preview');
  const previewPng = path.join(previewRoot, 'preview.png');
  writeWalkPng(previewPng);
  const metadataPath = path.join(previewRoot, 'metadata.json');
  const creditsTxtPath = path.join(previewRoot, 'credits.txt');
  const creditsCsvPath = path.join(previewRoot, 'credits.csv');
  writeJson(metadataPath, { asset: PLAN.asset.localId, animation: 'walk' });
  writeFileSync(creditsTxtPath, 'Draft Artist — CC-BY-SA 4.0\n');
  writeFileSync(creditsCsvPath, 'filename,authors,licenses\n');
  const artifacts = [
    { id: 'preview:preview' as const, path: previewPng },
    { id: 'preview:metadata' as const, path: metadataPath },
    { id: 'preview:credits_txt' as const, path: creditsTxtPath },
    { id: 'preview:credits_csv' as const, path: creditsCsvPath },
  ].map((artifact) => ({ ...artifact, digest: digest(readFileSync(artifact.path)) }));
  const manifestDigest = report.manifestDigest;
  const sourceDigests = report.sourceDigests.map((source) => ({
    path: source.path,
    digest: source.digest,
  }));
  const validationReceipt = {
    id: report.contentDigest,
    manifestDigest,
    sourceDigests,
  };
  const declarationDigest = digest(Buffer.from('formal-declaration'));
  const declaration = {
    schema: 'lpc-toolkit.asset-authoring-release-receipt.v1' as const,
    kind: 'declaration' as const,
    sessionId: fixture.session.sessionId,
    cliVersion: '0.2.0',
    recordedAt: '2026-08-04T00:00:00.000Z',
    declarant: {
      displayName: 'Release Artist',
      kind: 'person' as const,
      role: 'authorized-release-declarant' as const,
    },
    declarationDigest,
    manifestDigest,
    sourceDigests,
    validationReceiptId: report.contentDigest,
    validationReceiptRevision: report.contentDigest,
    creditDigests: {
      authorAndSource: digest(Buffer.from('credits')),
      licenseAuthority: digest(Buffer.from('credits')),
    },
    acknowledgements: {
      contentDigest: report.contentDigest,
      recordDigests: [],
    },
  };
  const previewAcceptance = {
    schema: 'lpc-toolkit.asset-authoring-release-receipt.v1' as const,
    kind: 'preview-acceptance' as const,
    sessionId: fixture.session.sessionId,
    cliVersion: '0.2.0',
    recordedAt: '2026-08-04T00:00:01.000Z',
    declarant: declaration.declarant,
    declarationReceiptDigest: declarationDigest,
    manifestDigest,
    sourceDigests,
    validationReceiptId: report.contentDigest,
    validationReceiptRevision: report.contentDigest,
    previewReceiptId: digest(Buffer.from('preview-input')),
    previewInputDigest: digest(Buffer.from('preview-input')),
    artifacts,
  };
  const store = createAssetAuthoringSessionStore(fixture.workspace);
  const session = store.replace(fixture.session.sessionId, {
    state: 'completed',
    reason: 'preview-acceptance-current',
    phase: 'previewed',
    checkpoint: {
      id: 'previewAcceptance',
      phase: 'previewed',
      digest: previewAcceptance.previewInputDigest,
      freshness: 'current',
    },
    checkpointFreshness: 'current',
    manifestDigest,
    receipts: {
      validation: validationReceipt,
      preview: {
        id: previewAcceptance.previewReceiptId,
        manifestDigest,
        sourceDigests,
        validationReceiptId: report.contentDigest,
        inputDigest: previewAcceptance.previewInputDigest,
        artifacts,
      },
      acknowledgements: null,
      releaseDeclaration: declaration,
      previewAcceptance,
      draftArchive: null,
      sync: null,
      formalArchive: null,
      archiveInspection: null,
    },
  });
  return { ...fixture, session };
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
  it('refuses release provenance before a formal archive and inspection exist', async () => {
    const fixture = await createFormalReadyFixture();
    const sessionPath = assetAuthoringSessionPath(fixture.workspace, fixture.session.sessionId);
    const sessionBefore = readFileSync(sessionPath);
    const missingFormal = await runJson<null>([
      'asset', 'authoring', 'provenance', '--session', fixture.session.sessionId, '--confirm',
    ], fixture.workspaceRoot, {
      prepareRuntimeAssets: async () => fixture.runtime,
    });
    expect(missingFormal.code).toBe(1);
    expect(missingFormal.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_release_provenance_stale' }),
    ]);
    expect(readFileSync(sessionPath)).toEqual(sessionBefore);

    const packed = await runJson<{
      readonly formalArchiveReceipt: { readonly archivePath: string } | null;
    }>(['asset', 'authoring', 'pack', '--session', fixture.session.sessionId, '--confirm'], fixture.workspaceRoot, {
      prepareRuntimeAssets: async () => fixture.runtime,
    });
    const archivePath = packed.response.data?.formalArchiveReceipt?.archivePath;
    if (archivePath === undefined) throw new Error('Expected a formal archive.');
    const missingInspection = await runJson<null>([
      'asset', 'authoring', 'provenance', '--session', fixture.session.sessionId, '--confirm',
    ], fixture.workspaceRoot, {
      prepareRuntimeAssets: async () => fixture.runtime,
    });
    expect(missingInspection.code).toBe(1);
    expect(missingInspection.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_release_provenance_stale' }),
    ]);
    expect(existsSync(archivePath)).toBe(true);
  });

  it('refuses a formal release provenance request after declaration evidence becomes stale', async () => {
    const fixture = await createFormalReadyFixture();
    const { workspaceRoot, workspace, runtime, session } = fixture;
    const packed = await runJson<{
      readonly formalArchiveReceipt: { readonly archivePath: string } | null;
    }>(['asset', 'authoring', 'pack', '--session', session.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    const archivePath = packed.response.data?.formalArchiveReceipt?.archivePath;
    if (archivePath === undefined) throw new Error('Expected a formal archive.');
    expect((await runJson<null>([
      'asset', 'authoring', 'inspect', '--session', session.sessionId, '--archive', archivePath,
    ], workspaceRoot, { prepareRuntimeAssets: async () => runtime })).code).toBe(0);
    const stored = createAssetAuthoringSessionStore(workspace).read(session.sessionId);
    createAssetAuthoringSessionStore(workspace).replace(session.sessionId, {
      receipts: {
        ...stored.receipts,
        releaseDeclaration: null,
      },
    });
    const result = await runJson<null>([
      'asset', 'authoring', 'provenance', '--session', session.sessionId, '--confirm',
    ], workspaceRoot, { prepareRuntimeAssets: async () => runtime });
    expect(result.code).toBe(1);
    expect(result.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_release_provenance_stale' }),
    ]);
    expect(existsSync(archivePath)).toBe(true);
  });

  it('requires an exact archive for public consumer installation', async () => {
    const fixture = createDraftFixture();
    const response = await runJson<null>([
      'asset', 'authoring', 'install',
      '--session', fixture.session.sessionId,
      '--consumer-workspace', path.join(fixture.root, 'consumer-workspace'),
      '--confirm',
    ], fixture.workspaceRoot);

    expect(response.code).toBe(1);
    expect(response.response.errors).toEqual([
      expect.objectContaining({ code: 'missing_argument', path: '--archive' }),
    ]);
  });

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

  it('refuses formal packaging before all release gates are current', async () => {
    const fixture = createPreparedSyncFixture();
    const sessionPath = assetAuthoringSessionPath(fixture.workspace, fixture.session.sessionId);
    const sessionBefore = readFileSync(sessionPath);

    const result = await runJson<{
      readonly state: string;
      readonly reason: string;
      readonly formalArchiveReceipt: null;
      readonly nextActions: readonly { readonly id: string }[];
    }>([
      'asset', 'authoring', 'pack', '--session', fixture.session.sessionId, '--confirm',
    ], fixture.workspaceRoot, {
      prepareRuntimeAssets: async () => fixture.runtime,
    });

    expect(result.code).toBe(0);
    expect(result.response.errors).toEqual([]);
    expect(result.response.data).toMatchObject({
      state: 'needs-user-action',
      reason: 'release-gates-incomplete',
      formalArchiveReceipt: null,
      nextActions: [{ id: 'validate-session' }],
    });
    expect(readFileSync(sessionPath)).toEqual(sessionBefore);
    expect(existsSync(path.join(
      path.dirname(sessionPath),
      'release-artifacts',
      `${PLAN.pack.id}-${PLAN.pack.version}.lpc-assets.zip`,
    ))).toBe(false);
  });

  it('publishes and inspects the exact formal archive after explicit confirmation', async () => {
    const fixture = await createFormalReadyFixture();
    const { workspaceRoot, workspace, runtime, session } = fixture;
    const pending = await runJson<{
      readonly state: string;
      readonly reason: string;
      readonly formalArchiveReceipt: null;
      readonly nextActions: readonly { readonly id: string; readonly safety: string }[];
    }>(['asset', 'authoring', 'pack', '--session', session.sessionId], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(pending.code).toBe(0);
    expect(pending.response.data).toMatchObject({
      state: 'needs-user-action',
      reason: 'formal-pack-confirmation-required',
      formalArchiveReceipt: null,
      nextActions: [{ id: 'pack-formal-archive', safety: 'requires-confirmation' }],
    });

    const packed = await runJson<{
      readonly state: string;
      readonly reason: string;
      readonly formalArchiveReceipt: {
        readonly schema: string;
        readonly archivePath: string;
        readonly archiveDigest: string;
        readonly manifestDigest: string;
        readonly contentDigest: string;
        readonly sourceDigests: readonly { readonly path: string; readonly digest: string }[];
        readonly validationReceiptId: string;
        readonly declarationReceiptDigest: string;
        readonly previewAcceptanceReceiptDigest: string;
        readonly previewInputDigest: string;
        readonly previewArtifacts: readonly { readonly id: string; readonly digest: string }[];
      } | null;
      readonly inspectionReceipt: null;
    }>(['asset', 'authoring', 'pack', '--session', session.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(packed.code, JSON.stringify(packed.response, null, 2)).toBe(0);
    expect(packed.response.data).toMatchObject({
      state: 'needs-user-action',
      reason: 'formal-archive-current',
      formalArchiveReceipt: {
        schema: 'lpc-toolkit.asset-authoring-formal-archive-receipt.v1',
        archivePath: expect.stringContaining('/release-artifacts/'),
        archiveDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        manifestDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        contentDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        validationReceiptId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        declarationReceiptDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        previewAcceptanceReceiptDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        previewInputDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      },
      inspectionReceipt: null,
      nextActions: [{ id: 'inspect-formal-archive' }],
    });
    const formalReceipt = packed.response.data?.formalArchiveReceipt;
    if (formalReceipt === null || formalReceipt === undefined) {
      throw new Error('Expected a formal archive receipt.');
    }
    expect(path.dirname(formalReceipt.archivePath)).toBe(
      path.join(path.dirname(assetAuthoringSessionPath(workspace, session.sessionId)), 'release-artifacts'),
    );
    expect(existsSync(path.join(
      path.dirname(fixture.packRoot),
      `${PLAN.pack.id}-${PLAN.pack.version}.lpc-assets.zip`,
    ))).toBe(false);
    const archive = await readAssetPackArchive({ archivePath: formalReceipt.archivePath });
    expect(archive.ok).toBe(true);
    if (!archive.ok) throw new Error('Expected formal archive bytes to be readable.');
    expect(archive.snapshot.payload.pack.status).toBeUndefined();

    const inspected = await runJson<{
      readonly state: string;
      readonly reason: string;
      readonly formalArchiveReceipt: typeof formalReceipt;
      readonly inspectionReceipt: {
        readonly archivePath: string;
        readonly archiveDigest: string;
        readonly formalArchiveDigest: string;
        readonly entryCount: number;
        readonly totalUncompressedBytes: number;
      } | null;
    }>([
      'asset', 'authoring', 'inspect', '--session', session.sessionId,
      '--archive', formalReceipt.archivePath,
    ], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(inspected.code, JSON.stringify(inspected.response, null, 2)).toBe(0);
    expect(inspected.response.data).toMatchObject({
      state: 'completed',
      reason: 'archive-inspection-current',
      formalArchiveReceipt: formalReceipt,
      inspectionReceipt: {
        archivePath: formalReceipt.archivePath,
        archiveDigest: formalReceipt.archiveDigest,
        formalArchiveDigest: formalReceipt.archiveDigest,
        entryCount: expect.any(Number),
        totalUncompressedBytes: expect.any(Number),
      },
    });
    const inspectionReceipt = inspected.response.data?.inspectionReceipt;
    if (inspectionReceipt === null || inspectionReceipt === undefined) {
      throw new Error('Expected an archive inspection receipt.');
    }
    const sessionPath = assetAuthoringSessionPath(workspace, session.sessionId);
    const afterInspection = readFileSync(sessionPath);
    const repeated = await runJson<{
      readonly inspectionReceipt: typeof inspectionReceipt;
    }>([
      'asset', 'authoring', 'inspect', '--session', session.sessionId,
      '--archive', formalReceipt.archivePath,
    ], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(repeated.code).toBe(0);
    expect(repeated.response.data?.inspectionReceipt).toEqual(inspectionReceipt);
    expect(readFileSync(sessionPath)).toEqual(afterInspection);

    const humanStdout: string[] = [];
    const humanStderr: string[] = [];
    const humanCode = await runCli([
      'asset', 'authoring', 'status', '--session', session.sessionId,
    ], {
      cwd: workspaceRoot,
      stdout: (text) => humanStdout.push(text),
      stderr: (text) => humanStderr.push(text),
    });
    expect(humanCode).toBe(0);
    expect(humanStderr).toEqual([]);
    expect(humanStdout.join('')).toContain(`Formal archive: ${formalReceipt.archivePath}`);
    expect(humanStdout.join('')).toContain(`Archive inspection: ${inspectionReceipt.archivePath}`);
  });

  it('requires explicit confirmation before publishing release provenance', async () => {
    const fixture = await createFormalReadyFixture();
    const { workspaceRoot, runtime, session } = fixture;
    const packed = await runJson<{
      readonly formalArchiveReceipt: { readonly archivePath: string } | null;
    }>(['asset', 'authoring', 'pack', '--session', session.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    const archivePath = packed.response.data?.formalArchiveReceipt?.archivePath;
    if (archivePath === undefined) throw new Error('Expected a formal archive.');
    const inspected = await runJson<null>([
      'asset', 'authoring', 'inspect', '--session', session.sessionId, '--archive', archivePath,
    ], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(inspected.code).toBe(0);

    const pending = await runJson<{
      readonly state: string;
      readonly reason: string;
      readonly releaseProvenanceReceipt: null;
      readonly nextActions: readonly { readonly id: string; readonly safety: string }[];
    }>(['asset', 'authoring', 'provenance', '--session', session.sessionId], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(pending.code).toBe(0);
    expect(pending.response.errors).toEqual([]);
    expect(pending.response.data).toMatchObject({
      state: 'needs-user-action',
      reason: 'release-provenance-confirmation-required',
      releaseProvenanceReceipt: null,
      nextActions: [{ id: 'publish-release-provenance', safety: 'requires-confirmation' }],
    });
  });

  it('publishes an exact release provenance companion receipt and is idempotent', async () => {
    const fixture = await createFormalReadyFixture();
    const { workspaceRoot, workspace, runtime, session } = fixture;
    const packed = await runJson<{
      readonly formalArchiveReceipt: { readonly archivePath: string; readonly archiveDigest: string } | null;
    }>(['asset', 'authoring', 'pack', '--session', session.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    const formalReceipt = packed.response.data?.formalArchiveReceipt;
    if (formalReceipt === null || formalReceipt === undefined) {
      throw new Error('Expected a formal archive.');
    }
    const inspected = await runJson<null>([
      'asset', 'authoring', 'inspect', '--session', session.sessionId,
      '--archive', formalReceipt.archivePath,
    ], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(inspected.code).toBe(0);
    const sessionPath = assetAuthoringSessionPath(workspace, session.sessionId);
    const archiveBefore = readFileSync(formalReceipt.archivePath);

    const published = await runJson<{
      readonly reason: string;
      readonly releaseProvenanceReceipt: {
        readonly schema: string;
        readonly provenancePath: string;
        readonly provenanceDigest: string;
        readonly projectionDigest: string;
        readonly formalArchiveDigest: string;
      } | null;
    }>([
      'asset', 'authoring', 'provenance', '--session', session.sessionId, '--confirm',
    ], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(published.code, JSON.stringify(published.response, null, 2)).toBe(0);
    expect(published.response.data).toMatchObject({
      reason: 'release-provenance-current',
      releaseProvenanceReceipt: {
        schema: 'lpc-toolkit.asset-authoring-release-provenance-receipt.v1',
        provenancePath: expect.stringContaining('.release-provenance.json'),
        provenanceDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        projectionDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        formalArchiveDigest: formalReceipt.archiveDigest,
      },
    });
    const provenanceReceipt = published.response.data?.releaseProvenanceReceipt;
    if (provenanceReceipt === null || provenanceReceipt === undefined) {
      throw new Error('Expected a release provenance receipt.');
    }
    expect(provenanceReceipt.provenancePath).toBe(
      path.join(path.dirname(formalReceipt.archivePath), `${PLAN.pack.id}-${PLAN.pack.version}.release-provenance.json`),
    );
    expect(createAssetAuthoringSessionStore(workspace).read(session.sessionId).receipts.releaseProvenance)
      .toEqual(provenanceReceipt);
    const provenanceBytes = readFileSync(provenanceReceipt.provenancePath);
    const document = JSON.parse(provenanceBytes.toString('utf8')) as {
      readonly schema: string;
      readonly projection: {
        readonly pack: { readonly id: string; readonly version: string };
        readonly releaseBindings: {
          readonly archiveDigest: string;
          readonly manifestDigest: string;
          readonly contentDigest: string;
          readonly sourceDigests: readonly { readonly path: string; readonly digest: string }[];
          readonly releaseDeclarationReceiptDigest: string;
          readonly previewAcceptanceReceiptDigest: string;
          readonly previewArtifacts: readonly { readonly id: string; readonly digest: string }[];
        };
        readonly records: readonly unknown[];
      };
      readonly projectionDigest: string;
    };
    expect(document).toMatchObject({
      schema: 'lpc-toolkit.asset-release-provenance.v1',
      projection: {
        pack: { id: PLAN.pack.id, version: PLAN.pack.version },
        releaseBindings: {
          archiveDigest: formalReceipt.archiveDigest,
          manifestDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
          contentDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
          sourceDigests: expect.any(Array),
          releaseDeclarationReceiptDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
          previewAcceptanceReceiptDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
          previewArtifacts: [
            { id: 'preview:credits_csv' },
            { id: 'preview:credits_txt' },
            { id: 'preview:metadata' },
            { id: 'preview:preview' },
          ],
        },
        records: [],
      },
      projectionDigest: provenanceReceipt.projectionDigest,
    });
    const sessionAfterPublish = readFileSync(sessionPath);
    const repeated = await runJson<{
      readonly releaseProvenanceReceipt: typeof provenanceReceipt;
    }>(['asset', 'authoring', 'provenance', '--session', session.sessionId], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(repeated.code).toBe(0);
    expect(repeated.response.data?.releaseProvenanceReceipt).toEqual(provenanceReceipt);
    expect(readFileSync(sessionPath)).toEqual(sessionAfterPublish);
    expect(readFileSync(formalReceipt.archivePath)).toEqual(archiveBefore);
  });

  it('accepts only release-bound optional provenance records and never copies the input path', async () => {
    const fixture = await createFormalReadyFixture();
    const { workspaceRoot, workspace, runtime, session } = fixture;
    const packed = await runJson<{
      readonly formalArchiveReceipt: {
        readonly archivePath: string;
        readonly sourceDigests: readonly { readonly path: string; readonly digest: string }[];
      } | null;
    }>(['asset', 'authoring', 'pack', '--session', session.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    const formalReceipt = packed.response.data?.formalArchiveReceipt;
    if (formalReceipt === null || formalReceipt === undefined) {
      throw new Error('Expected a formal archive.');
    }
    const inspected = await runJson<null>([
      'asset', 'authoring', 'inspect', '--session', session.sessionId,
      '--archive', formalReceipt.archivePath,
    ], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(inspected.code).toBe(0);
    const recordsPath = path.join(fixture.root, 'records.json');
    writeJson(recordsPath, [{
      kind: 'external-input',
      targetId: 'moon-braid/foreground/walk',
      resultDigest: formalReceipt.sourceDigests[0]?.digest,
    }]);
    const outputPath = path.join(
      path.dirname(assetAuthoringSessionPath(workspace, session.sessionId)),
      'release-artifacts',
      'with-records.release-provenance.json',
    );
    const published = await runJson<{
      readonly releaseProvenanceReceipt: { readonly provenancePath: string } | null;
    }>([
      'asset', 'authoring', 'provenance', '--session', session.sessionId,
      '--records', recordsPath, '--output', outputPath, '--confirm',
    ], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(published.code, JSON.stringify(published.response, null, 2)).toBe(0);
    const provenancePath = published.response.data?.releaseProvenanceReceipt?.provenancePath;
    if (provenancePath === undefined) throw new Error('Expected a provenance receipt.');
    const receiptText = readFileSync(provenancePath, 'utf8');
    expect(receiptText).toContain('external-input');
    expect(receiptText).not.toContain(recordsPath);
    expect(JSON.parse(receiptText)).toMatchObject({
      projection: { records: [{ kind: 'external-input' }] },
    });
  });

  it('verifies copied archive and provenance bytes from a separate consumer root', async () => {
    const fixture = await createFormalReadyFixture();
    const { workspaceRoot, runtime, session } = fixture;
    const packed = await runJson<{
      readonly formalArchiveReceipt: { readonly archivePath: string } | null;
    }>(['asset', 'authoring', 'pack', '--session', session.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    const archivePath = packed.response.data?.formalArchiveReceipt?.archivePath;
    if (archivePath === undefined) throw new Error('Expected a formal archive.');
    expect((await runJson<null>([
      'asset', 'authoring', 'inspect', '--session', session.sessionId, '--archive', archivePath,
    ], workspaceRoot, { prepareRuntimeAssets: async () => runtime })).code).toBe(0);
    const generated = await runJson<{
      readonly releaseProvenanceReceipt: { readonly provenancePath: string } | null;
    }>(['asset', 'authoring', 'provenance', '--session', session.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    const provenancePath = generated.response.data?.releaseProvenanceReceipt?.provenancePath;
    if (provenancePath === undefined) throw new Error('Expected a provenance receipt.');
    const consumerRoot = path.join(fixture.root, 'consumer-copy');
    mkdirSync(consumerRoot, { recursive: true });
    const copiedArchive = path.join(consumerRoot, 'release.lpc-assets.zip');
    const copiedProvenance = path.join(consumerRoot, 'release-provenance.json');
    copyFileSync(archivePath, copiedArchive);
    copyFileSync(provenancePath, copiedProvenance);
    const before = readdirSync(consumerRoot).sort();
    const verified = await runJson<{
      readonly schema: string;
      readonly verified: boolean;
      readonly archivePath: string;
      readonly provenancePath: string;
      readonly recordCount: number;
      readonly releaseDeclarationReceiptDigest: string;
      readonly previewAcceptanceReceiptDigest: string;
    }>([
      'asset', 'provenance', 'verify', '--archive', copiedArchive, '--provenance', copiedProvenance,
    ], consumerRoot, { prepareRuntimeAssets: async () => runtime });
    expect(verified.code, JSON.stringify(verified.response, null, 2)).toBe(0);
    expect(verified.response.data).toMatchObject({
      schema: 'lpc-toolkit.asset-release-provenance-verification.v1',
      verified: true,
      archivePath: copiedArchive,
      provenancePath: copiedProvenance,
      recordCount: 0,
      releaseDeclarationReceiptDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      previewAcceptanceReceiptDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    });
    expect(readdirSync(consumerRoot).sort()).toEqual(before);

    const ordinaryConsumerRoot = path.join(fixture.root, 'ordinary-consumer');
    const ordinaryConsumerWorkspace = initializeAssetWorkspace(ordinaryConsumerRoot);
    const inspected = await runJson<{ readonly valid: boolean }>([
      'asset', 'inspect', copiedArchive,
    ], ordinaryConsumerRoot, { prepareRuntimeAssets: async () => runtime });
    expect(inspected.code).toBe(0);
    expect(inspected.response.data).toMatchObject({ valid: true });
    const installed = await runJson<{
      readonly installedDirectory: string;
    }>([
      'asset', 'install', copiedArchive, '--workspace', ordinaryConsumerRoot,
    ], ordinaryConsumerRoot, { prepareRuntimeAssets: async () => runtime });
    expect(installed.code, JSON.stringify(installed.response, null, 2)).toBe(0);
    const installedDirectory = installed.response.data?.installedDirectory;
    if (installedDirectory === undefined) throw new Error('Expected an installed directory.');
    expect(readdirSync(installedDirectory)).not.toContain('release-provenance.json');
    expect(readdirSync(ordinaryConsumerWorkspace.outputRoot)).not.toContain('release-provenance.json');
  });

  it('rejects malformed, unsupported, and stale bindings without mutating copied inputs', async () => {
    const fixture = await createFormalReadyFixture();
    const { workspaceRoot, runtime, session } = fixture;
    const packed = await runJson<{
      readonly formalArchiveReceipt: { readonly archivePath: string } | null;
    }>(['asset', 'authoring', 'pack', '--session', session.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    const archivePath = packed.response.data?.formalArchiveReceipt?.archivePath;
    if (archivePath === undefined) throw new Error('Expected a formal archive.');
    expect((await runJson<null>([
      'asset', 'authoring', 'inspect', '--session', session.sessionId, '--archive', archivePath,
    ], workspaceRoot, { prepareRuntimeAssets: async () => runtime })).code).toBe(0);
    const generated = await runJson<{
      readonly releaseProvenanceReceipt: { readonly provenancePath: string } | null;
    }>(['asset', 'authoring', 'provenance', '--session', session.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    const provenancePath = generated.response.data?.releaseProvenanceReceipt?.provenancePath;
    if (provenancePath === undefined) throw new Error('Expected a provenance receipt.');

    const consumerRoot = path.join(fixture.root, 'consumer-failure-copy');
    mkdirSync(consumerRoot, { recursive: true });
    const copiedArchive = path.join(consumerRoot, 'release.lpc-assets.zip');
    const copiedProvenance = path.join(consumerRoot, 'release-provenance.json');
    copyFileSync(archivePath, copiedArchive);
    copyFileSync(provenancePath, copiedProvenance);
    const archiveBefore = readFileSync(copiedArchive);
    const originalProvenance = readFileSync(copiedProvenance);
    const directoryBefore = readdirSync(consumerRoot).sort();

    const verify = async () => runJson<null>([
      'asset', 'provenance', 'verify', '--archive', copiedArchive, '--provenance', copiedProvenance,
    ], consumerRoot, { prepareRuntimeAssets: async () => runtime });

    writeFileSync(copiedProvenance, Buffer.from('{not-json}\n'));
    const malformed = await verify();
    expect(malformed.code).toBe(1);
    expect(malformed.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_release_provenance_invalid' }),
    ]);

    writeFileSync(copiedProvenance, Buffer.from(
      originalProvenance.toString('utf8').replace(
        'lpc-toolkit.asset-release-provenance.v1',
        'lpc-toolkit.asset-release-provenance.v2',
      ),
    ));
    const unsupported = await verify();
    expect(unsupported.code).toBe(1);
    expect(unsupported.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_release_provenance_unsupported' }),
    ]);

    writeFileSync(copiedProvenance, Buffer.from(originalProvenance));
    const original = JSON.parse(originalProvenance.toString('utf8')) as {
      readonly projection: {
        readonly pack: { readonly id: string; readonly version: string };
        readonly releaseBindings: {
          readonly archiveDigest: string;
          readonly manifestDigest: string;
          readonly contentDigest: string;
          readonly sourceDigests: readonly { readonly path: string; readonly digest: string }[];
          readonly releaseDeclarationReceiptDigest: string;
          readonly previewAcceptanceReceiptDigest: string;
          readonly previewArtifacts: readonly { readonly id: string; readonly digest: string }[];
        };
        readonly records: readonly unknown[];
      };
    };
    const wrongDigest = `sha256:${'f'.repeat(64)}`;
    const mismatched = [
      'archiveDigest',
      'manifestDigest',
      'contentDigest',
    ] as const;
    for (const field of mismatched) {
      const bindings = {
        ...original.projection.releaseBindings,
        [field]: wrongDigest,
      };
      writeFileSync(copiedProvenance, encodeProvenanceProjection({
        ...original.projection,
        releaseBindings: bindings,
      }));
      const result = await verify();
      expect(result.code, field).toBe(1);
      expect(result.response.errors).toEqual([
        expect.objectContaining({ code: 'asset_release_provenance_digest_mismatch' }),
      ]);
      writeFileSync(copiedProvenance, Buffer.from(originalProvenance));
    }

    writeFileSync(copiedProvenance, encodeProvenanceProjection({
      ...original.projection,
      pack: { ...original.projection.pack, version: '9.9.9' },
    }));
    const stale = await verify();
    expect(stale.code).toBe(1);
    expect(stale.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_release_provenance_stale' }),
    ]);

    writeFileSync(copiedProvenance, encodeProvenanceProjection({
      ...original.projection,
      releaseBindings: {
        ...original.projection.releaseBindings,
        sourceDigests: original.projection.releaseBindings.sourceDigests.map((entry) => ({
          ...entry,
          digest: wrongDigest,
        })),
      },
    }));
    const sourceMismatch = await verify();
    expect(sourceMismatch.code).toBe(1);
    expect(sourceMismatch.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_release_provenance_digest_mismatch' }),
    ]);

    writeFileSync(copiedProvenance, Buffer.from(originalProvenance));
    writeFileSync(copiedArchive, Buffer.from('not-an-archive'));
    const copiedArchiveMismatch = await verify();
    expect(copiedArchiveMismatch.code).toBe(1);
    expect(copiedArchiveMismatch.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_release_provenance_invalid' }),
    ]);

    expect(readFileSync(copiedArchive)).not.toEqual(archiveBefore);
    expect(readFileSync(copiedProvenance)).toEqual(originalProvenance);
    expect(readdirSync(consumerRoot).sort()).toEqual(directoryBefore);
  });

  it('rejects private or unsupported provenance record payloads before publication', async () => {
    const fixture = await createFormalReadyFixture();
    const { workspaceRoot, runtime, session } = fixture;
    const packed = await runJson<{
      readonly formalArchiveReceipt: {
        readonly archivePath: string;
        readonly sourceDigests: readonly { readonly digest: string }[];
      } | null;
    }>(['asset', 'authoring', 'pack', '--session', session.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    const formalReceipt = packed.response.data?.formalArchiveReceipt;
    if (formalReceipt === null || formalReceipt === undefined) throw new Error('Expected a formal archive.');
    expect((await runJson<null>([
      'asset', 'authoring', 'inspect', '--session', session.sessionId, '--archive', formalReceipt.archivePath,
    ], workspaceRoot, { prepareRuntimeAssets: async () => runtime })).code).toBe(0);
    const recordsPath = path.join(fixture.root, 'private-records.json');
    writeJson(recordsPath, [{
      kind: 'provider-output',
      targetId: 'moon-braid/foreground/walk',
      contractDigest: `sha256:${'a'.repeat(64)}`,
      provider: {
        id: 'https://provider.example/api?token=secret',
        tool: 'sprite-tool',
      },
      resultDigest: formalReceipt.sourceDigests[0]?.digest,
    }]);
    const result = await runJson<null>([
      'asset', 'authoring', 'provenance', '--session', session.sessionId,
      '--records', recordsPath, '--confirm',
    ], workspaceRoot, { prepareRuntimeAssets: async () => runtime });
    expect(result.code).toBe(1);
    expect(result.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_release_provenance_private_data' }),
    ]);
  });

  it('rejects an unsafe provenance output without mutating the session or escaped path', async () => {
    const fixture = await createFormalReadyFixture();
    const { workspaceRoot, workspace, runtime, session } = fixture;
    const packed = await runJson<{
      readonly formalArchiveReceipt: { readonly archivePath: string } | null;
    }>(['asset', 'authoring', 'pack', '--session', session.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    const archivePath = packed.response.data?.formalArchiveReceipt?.archivePath;
    if (archivePath === undefined) throw new Error('Expected a formal archive.');
    expect((await runJson<null>([
      'asset', 'authoring', 'inspect', '--session', session.sessionId, '--archive', archivePath,
    ], workspaceRoot, { prepareRuntimeAssets: async () => runtime })).code).toBe(0);
    const sessionPath = assetAuthoringSessionPath(workspace, session.sessionId);
    const sessionBefore = readFileSync(sessionPath);
    const escapedPath = path.join(fixture.root, 'escaped.release-provenance.json');
    const result = await runJson<null>([
      'asset', 'authoring', 'provenance', '--session', session.sessionId,
      '--output', escapedPath, '--confirm',
    ], workspaceRoot, { prepareRuntimeAssets: async () => runtime });
    expect(result.code).toBe(1);
    expect(result.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_authoring_release_provenance_path_invalid' }),
    ]);
    expect(existsSync(escapedPath)).toBe(false);
    expect(readFileSync(sessionPath)).toEqual(sessionBefore);
  });

  it('preserves a published provenance receipt when a changed projection targets the default path', async () => {
    const fixture = await createFormalReadyFixture();
    const { workspaceRoot, workspace, runtime, session } = fixture;
    const packed = await runJson<{
      readonly formalArchiveReceipt: {
        readonly archivePath: string;
        readonly sourceDigests: readonly { readonly path: string; readonly digest: string }[];
      } | null;
    }>(['asset', 'authoring', 'pack', '--session', session.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    const formalReceipt = packed.response.data?.formalArchiveReceipt;
    if (formalReceipt === null || formalReceipt === undefined) throw new Error('Expected a formal archive.');
    expect((await runJson<null>([
      'asset', 'authoring', 'inspect', '--session', session.sessionId, '--archive', formalReceipt.archivePath,
    ], workspaceRoot, { prepareRuntimeAssets: async () => runtime })).code).toBe(0);
    const first = await runJson<{
      readonly releaseProvenanceReceipt: { readonly provenancePath: string } | null;
    }>(['asset', 'authoring', 'provenance', '--session', session.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    const firstPath = first.response.data?.releaseProvenanceReceipt?.provenancePath;
    if (firstPath === undefined) throw new Error('Expected a provenance receipt.');
    const firstBytes = readFileSync(firstPath);
    const sessionPath = assetAuthoringSessionPath(workspace, session.sessionId);
    const sessionBefore = readFileSync(sessionPath);
    const recordsPath = path.join(fixture.root, 'changed-records.json');
    writeJson(recordsPath, [{
      kind: 'external-input',
      targetId: 'moon-braid/foreground/walk',
      resultDigest: formalReceipt.sourceDigests[0]?.digest,
    }]);
    const conflict = await runJson<null>([
      'asset', 'authoring', 'provenance', '--session', session.sessionId,
      '--records', recordsPath, '--confirm',
    ], workspaceRoot, { prepareRuntimeAssets: async () => runtime });
    expect(conflict.code).toBe(1);
    expect(conflict.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_release_provenance_conflict' }),
    ]);
    expect(readFileSync(firstPath)).toEqual(firstBytes);
    expect(readFileSync(sessionPath)).toEqual(sessionBefore);
  });

  it('requires a new contained output path to recover a stale provenance receipt', async () => {
    const fixture = await createFormalReadyFixture();
    const { workspaceRoot, runtime, session } = fixture;
    const packed = await runJson<{
      readonly formalArchiveReceipt: { readonly archivePath: string } | null;
    }>(['asset', 'authoring', 'pack', '--session', session.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    const archivePath = packed.response.data?.formalArchiveReceipt?.archivePath;
    if (archivePath === undefined) throw new Error('Expected a formal archive.');
    expect((await runJson<null>([
      'asset', 'authoring', 'inspect', '--session', session.sessionId, '--archive', archivePath,
    ], workspaceRoot, { prepareRuntimeAssets: async () => runtime })).code).toBe(0);
    const first = await runJson<{
      readonly releaseProvenanceReceipt: { readonly provenancePath: string } | null;
    }>(['asset', 'authoring', 'provenance', '--session', session.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    const firstPath = first.response.data?.releaseProvenanceReceipt?.provenancePath;
    if (firstPath === undefined) throw new Error('Expected a provenance receipt.');
    const tampered = Buffer.from('tampered-release-provenance');
    writeFileSync(firstPath, tampered);
    const stale = await runJson<null>([
      'asset', 'authoring', 'provenance', '--session', session.sessionId,
    ], workspaceRoot, { prepareRuntimeAssets: async () => runtime });
    expect(stale.code).toBe(1);
    expect(stale.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_release_provenance_stale' }),
    ]);
    const recoveredPath = path.join(path.dirname(firstPath), 'recovered.release-provenance.json');
    const recovered = await runJson<{
      readonly releaseProvenanceReceipt: { readonly provenancePath: string } | null;
    }>([
      'asset', 'authoring', 'provenance', '--session', session.sessionId,
      '--output', recoveredPath, '--confirm',
    ], workspaceRoot, { prepareRuntimeAssets: async () => runtime });
    expect(recovered.code, JSON.stringify(recovered.response, null, 2)).toBe(0);
    expect(recovered.response.data?.releaseProvenanceReceipt?.provenancePath).toBe(recoveredPath);
    expect(readFileSync(firstPath)).toEqual(tampered);
    expect(existsSync(recoveredPath)).toBe(true);
  });

  it('requires explicit confirmation before installing the inspected archive into a consumer workspace', async () => {
    const fixture = await createFormalReadyFixture();
    const { workspaceRoot, runtime, session } = fixture;
    const packed = await runJson<{
      readonly formalArchiveReceipt: { readonly archivePath: string } | null;
    }>(['asset', 'authoring', 'pack', '--session', session.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    const archivePath = packed.response.data?.formalArchiveReceipt?.archivePath;
    if (archivePath === undefined) throw new Error('Expected a formal archive.');
    const inspected = await runJson<null>([
      'asset', 'authoring', 'inspect', '--session', session.sessionId, '--archive', archivePath,
    ], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(inspected.code).toBe(0);

    const consumer = initializeAssetWorkspace(
      path.join(createDirectory('lpc-authoring-consumer-'), 'workspace'),
    );
    const sessionPath = assetAuthoringSessionPath(fixture.workspace, session.sessionId);
    const sessionBefore = readFileSync(sessionPath);
    const pending = await runJson<{
      readonly state: string;
      readonly reason: string;
      readonly installationReceipt: null;
      readonly nextActions: readonly { readonly id: string; readonly safety: string }[];
    }>([
      'asset', 'authoring', 'install', '--session', session.sessionId,
      '--archive', archivePath, '--consumer-workspace', consumer.root,
    ], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });

    expect(pending.code).toBe(0);
    expect(pending.response.data).toMatchObject({
      state: 'needs-user-action',
      reason: 'installation-confirmation-required',
      installationReceipt: null,
      nextActions: [{ id: 'install-consumer-archive', safety: 'requires-confirmation' }],
    });
    expect(readFileSync(sessionPath)).toEqual(sessionBefore);
    expect(readdirSync(consumer.outputRoot)).toEqual(['.lpc-toolkit-managed.json']);
  });

  it('requires current archive inspection before consumer installation', async () => {
    const fixture = await createFormalReadyFixture();
    const { workspaceRoot, workspace, runtime, session } = fixture;
    const packed = await runJson<{
      readonly formalArchiveReceipt: { readonly archivePath: string } | null;
    }>(['asset', 'authoring', 'pack', '--session', session.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    const archivePath = packed.response.data?.formalArchiveReceipt?.archivePath;
    if (archivePath === undefined) throw new Error('Expected a formal archive.');
    const sessionPath = assetAuthoringSessionPath(workspace, session.sessionId);
    const sessionBefore = readFileSync(sessionPath);
    const consumerRoot = path.join(createDirectory('lpc-authoring-uninspected-consumer-'), 'workspace');
    const result = await runJson<{
      readonly state: string;
      readonly reason: string;
      readonly installationReceipt: null;
      readonly nextActions: readonly { readonly id: string }[];
    }>([
      'asset', 'authoring', 'install', '--session', session.sessionId,
      '--archive', archivePath, '--consumer-workspace', consumerRoot, '--confirm',
    ], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });

    expect(result.code).toBe(0);
    expect(result.response.data).toMatchObject({
      state: 'needs-user-action',
      reason: 'formal-archive-current',
      installationReceipt: null,
      nextActions: [{ id: 'inspect-formal-archive' }],
    });
    expect(readFileSync(sessionPath)).toEqual(sessionBefore);
    expect(existsSync(consumerRoot)).toBe(false);
  });

  it('rejects an archive whose bytes do not match the current inspection receipt', async () => {
    const fixture = await createFormalReadyFixture();
    const { workspaceRoot, workspace, runtime, session } = fixture;
    const packed = await runJson<{
      readonly formalArchiveReceipt: { readonly archivePath: string } | null;
    }>(['asset', 'authoring', 'pack', '--session', session.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    const archivePath = packed.response.data?.formalArchiveReceipt?.archivePath;
    if (archivePath === undefined) throw new Error('Expected a formal archive.');
    const inspected = await runJson<null>([
      'asset', 'authoring', 'inspect', '--session', session.sessionId, '--archive', archivePath,
    ], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(inspected.code).toBe(0);

    const mismatchedArchivePath = path.join(createDirectory('lpc-authoring-mismatch-'), 'archive.zip');
    writeFileSync(mismatchedArchivePath, Buffer.concat([
      readFileSync(archivePath),
      Buffer.from('external byte mutation'),
    ]));
    const consumer = initializeAssetWorkspace(
      path.join(createDirectory('lpc-authoring-mismatch-consumer-'), 'workspace'),
    );
    const sessionPath = assetAuthoringSessionPath(workspace, session.sessionId);
    const sessionBefore = readFileSync(sessionPath);
    const archiveBefore = readFileSync(mismatchedArchivePath);
    const consumerRegistryBefore = existsSync(consumer.registryPath)
      ? readFileSync(consumer.registryPath)
      : undefined;
    const result = await runJson<null>([
      'asset', 'authoring', 'install', '--session', session.sessionId,
      '--archive', mismatchedArchivePath,
      '--consumer-workspace', consumer.root, '--confirm',
    ], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });

    expect(result.code).toBe(1);
    expect(result.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_authoring_install_archive_mismatch' }),
    ]);
    expect(readFileSync(sessionPath)).toEqual(sessionBefore);
    expect(readFileSync(mismatchedArchivePath)).toEqual(archiveBefore);
    expect(existsSync(consumer.registryPath)).toBe(consumerRegistryBefore !== undefined);
    if (consumerRegistryBefore !== undefined) {
      expect(readFileSync(consumer.registryPath)).toEqual(consumerRegistryBefore);
    }
    expect(readdirSync(consumer.outputRoot)).toEqual(['.lpc-toolkit-managed.json']);
  });

  it('installs the exact inspected archive, records verified attribution, and is byte-idempotent', async () => {
    const fixture = await createFormalReadyFixture();
    const { workspaceRoot, workspace, runtime, session } = fixture;
    const packed = await runJson<{
      readonly formalArchiveReceipt: { readonly archivePath: string } | null;
    }>(['asset', 'authoring', 'pack', '--session', session.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    const archivePath = packed.response.data?.formalArchiveReceipt?.archivePath;
    if (archivePath === undefined) throw new Error('Expected a formal archive.');
    const inspected = await runJson<null>([
      'asset', 'authoring', 'inspect', '--session', session.sessionId, '--archive', archivePath,
    ], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(inspected.code).toBe(0);

    const consumer = initializeAssetWorkspace(
      path.join(createDirectory('lpc-authoring-consumer-'), 'workspace'),
    );
    const consumerRoot = realpathSync.native(consumer.root);
    const consumerOutputRoot = path.join(consumerRoot, 'assets_custom');
    const consumerRegistryPath = path.join(
      consumerRoot,
      '.lpc-toolkit',
      'asset-packs',
      'registry.json',
    );
    const archiveBefore = readFileSync(archivePath);
    const first = await runJson<{
      readonly state: string;
      readonly reason: string;
      readonly installationReceipt: {
        readonly schema: string;
        readonly workspaceRoot: string;
        readonly packId: string;
        readonly version: string;
        readonly archivePath: string;
        readonly archiveDigest: string;
        readonly installedDirectory: string;
        readonly registryPath: string;
        readonly registryDigest: string;
        readonly outputRoot: string;
        readonly generatedDigests: Readonly<Record<string, string>>;
        readonly creditsDigest: string;
      } | null;
    }>([
      'asset', 'authoring', 'install', '--session', session.sessionId,
      '--archive', archivePath, '--consumer-workspace', consumerRoot, '--confirm',
    ], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(first.code, JSON.stringify(first.response, null, 2)).toBe(0);
    expect(first.response.data).toMatchObject({
      state: 'completed',
      reason: 'installation-current',
      installationReceipt: {
        schema: 'lpc-toolkit.asset-authoring-install-receipt.v1',
        workspaceRoot: consumerRoot,
        packId: PLAN.pack.id,
        version: PLAN.pack.version,
        archivePath,
        archiveDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        installedDirectory: expect.stringContaining(path.join('.lpc-toolkit', 'asset-packs', 'installed')),
        registryPath: consumerRegistryPath,
        registryDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        outputRoot: consumerOutputRoot,
        generatedDigests: expect.objectContaining({ 'CREDITS.csv': expect.any(String) }),
        creditsDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      },
      nextActions: [],
    });
    const receipt = first.response.data?.installationReceipt;
    if (receipt === null || receipt === undefined) throw new Error('Expected an installation receipt.');
    expect(receipt.generatedDigests['CREDITS.csv']).toBe(receipt.creditsDigest);
    expect(existsSync(path.join(consumerOutputRoot, 'CREDITS.csv'))).toBe(true);
    const consumerRuntime: RuntimeAssets = {
      ...createEmptyRuntime(consumerRoot),
      source: 'managed-cache',
      releaseTag: 'test-pinned-release',
    };
    writeJson(path.join(
      consumerRuntime.context.assetsRoot,
      'sheet_definitions',
      'body',
      'body.json',
    ), {
      name: 'Body',
      type_name: 'body',
      animations: ['walk'],
      credits: [],
      layer_1: { zPos: 10, male: 'body/base/' },
    });
    writeWalkPng(path.join(
      consumerRuntime.context.assetsRoot,
      'spritesheets',
      'body',
      'base',
      'walk.png',
    ), '#224466');
    const selectionPath = path.join(consumerRoot, 'consumer-hero.selection.json');
    writeJson(selectionPath, {
      schema: 'lpc-toolkit.selection.v2',
      name: 'consumer-hero',
      bodyType: 'male',
      items: {
        body: { name: 'Body' },
        hair: { name: `${PLAN.pack.id}--${PLAN.asset.localId}` },
      },
    });
    const consumerPreview = await runJson<{
      readonly artifacts: readonly { readonly type: string; readonly path: string }[];
    }>([
      'character', 'preview', '--selection', selectionPath,
      '--animation', 'walk', '--direction', 'down',
    ], consumerRoot, {
      prepareRuntimeAssets: async () => consumerRuntime,
    });
    expect(consumerPreview.code, JSON.stringify(consumerPreview.response, null, 2)).toBe(0);
    const consumerCredits = consumerPreview.response.data?.artifacts.find(
      (artifact) => artifact.type === 'credits_txt',
    );
    if (consumerCredits === undefined) throw new Error('Expected consumer preview credits.');
    expect(readFileSync(consumerCredits.path, 'utf8')).toContain('Draft Artist');
    const sessionPath = assetAuthoringSessionPath(workspace, session.sessionId);
    const sessionAfterInstall = readFileSync(sessionPath);

    const repeatPending = await runJson<{
      readonly state: string;
      readonly reason: string;
      readonly installationReceipt: typeof receipt;
    }>([
      'asset', 'authoring', 'install', '--session', session.sessionId,
      '--archive', archivePath, '--consumer-workspace', consumerRoot,
    ], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(repeatPending.code).toBe(0);
    expect(repeatPending.response.data).toMatchObject({
      state: 'needs-user-action',
      reason: 'installation-confirmation-required',
      installationReceipt: receipt,
    });
    expect(readFileSync(sessionPath)).toEqual(sessionAfterInstall);

    const second = await runJson<{
      readonly installationReceipt: typeof receipt;
    }>([
      'asset', 'authoring', 'install', '--session', session.sessionId,
      '--archive', archivePath, '--consumer-workspace', consumerRoot, '--confirm',
    ], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(second.code, JSON.stringify(second.response, null, 2)).toBe(0);
    expect(second.response.data?.installationReceipt).toEqual(receipt);
    expect(readFileSync(sessionPath)).toEqual(sessionAfterInstall);
    expect(readFileSync(archivePath)).toEqual(archiveBefore);

    writeFileSync(path.join(consumerOutputRoot, 'CREDITS.csv'), 'tampered credits\n');
    const stale = await runJson<{
      readonly state: string;
      readonly reason: string;
      readonly installationReceipt: typeof receipt;
      readonly nextActions: readonly { readonly id: string }[];
    }>(['asset', 'authoring', 'status', '--session', session.sessionId], workspaceRoot);
    expect(stale.code).toBe(0);
    expect(stale.response.data).toMatchObject({
      state: 'needs-user-action',
      reason: 'installation-stale',
      installationReceipt: receipt,
      nextActions: [{ id: 'install-consumer-archive' }],
    });
  });

  it('refuses unsafe or uninitialized consumer workspaces before installation', async () => {
    const fixture = await createFormalReadyFixture();
    const { workspaceRoot, workspace, runtime, session } = fixture;
    const packed = await runJson<{
      readonly formalArchiveReceipt: { readonly archivePath: string } | null;
    }>(['asset', 'authoring', 'pack', '--session', session.sessionId, '--confirm'], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    const archivePath = packed.response.data?.formalArchiveReceipt?.archivePath;
    if (archivePath === undefined) throw new Error('Expected a formal archive.');
    const inspected = await runJson<null>([
      'asset', 'authoring', 'inspect', '--session', session.sessionId, '--archive', archivePath,
    ], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(inspected.code).toBe(0);
    const sessionPath = assetAuthoringSessionPath(workspace, session.sessionId);
    const sessionBefore = readFileSync(sessionPath);

    const artistRoot = await runJson<null>([
      'asset', 'authoring', 'install', '--session', session.sessionId,
      '--archive', archivePath, '--consumer-workspace', workspace.root, '--confirm',
    ], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(artistRoot.code).toBe(1);
    expect(artistRoot.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_authoring_consumer_workspace_unsafe' }),
    ]);
    expect(readFileSync(sessionPath)).toEqual(sessionBefore);

    const uninitialized = path.join(fixture.root, 'uninitialized-consumer');
    const missingWorkspace = await runJson<null>([
      'asset', 'authoring', 'install', '--session', session.sessionId,
      '--archive', archivePath, '--consumer-workspace', uninitialized, '--confirm',
    ], workspaceRoot, {
      prepareRuntimeAssets: async () => runtime,
    });
    expect(missingWorkspace.code).toBe(1);
    expect(missingWorkspace.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_authoring_consumer_workspace_invalid' }),
    ]);
    expect(existsSync(uninitialized)).toBe(false);
    expect(readFileSync(sessionPath)).toEqual(sessionBefore);
  });

  it('rejects a traversal formal archive destination without changing session or filesystem state', async () => {
    const fixture = await createFormalReadyFixture();
    const sessionPath = assetAuthoringSessionPath(fixture.workspace, fixture.session.sessionId);
    const sessionBefore = readFileSync(sessionPath);
    const escapedPath = path.join(fixture.root, 'escaped-formal.lpc-assets.zip');

    const result = await runJson<null>([
      'asset', 'authoring', 'pack', '--session', fixture.session.sessionId,
      '--output', '../escaped-formal.lpc-assets.zip', '--confirm',
    ], fixture.workspaceRoot, {
      prepareRuntimeAssets: async () => fixture.runtime,
    });

    expect(result.code).toBe(1);
    expect(result.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_authoring_formal_path_invalid' }),
    ]);
    expect(existsSync(escapedPath)).toBe(false);
    expect(readFileSync(sessionPath)).toEqual(sessionBefore);
  });

  it('preserves a formal receipt and refuses to overwrite externally changed archive bytes', async () => {
    const fixture = await createFormalReadyFixture();
    const packed = await runJson<{
      readonly formalArchiveReceipt: { readonly archivePath: string; readonly archiveDigest: string } | null;
    }>(['asset', 'authoring', 'pack', '--session', fixture.session.sessionId, '--confirm'], fixture.workspaceRoot, {
      prepareRuntimeAssets: async () => fixture.runtime,
    });
    const formalReceipt = packed.response.data?.formalArchiveReceipt;
    if (formalReceipt === null || formalReceipt === undefined) {
      throw new Error('Expected a formal archive receipt.');
    }
    const tamperedBytes = Buffer.from('tampered-formal-archive');
    writeFileSync(formalReceipt.archivePath, tamperedBytes);

    const status = await runJson<{
      readonly state: string;
      readonly reason: string;
      readonly formalArchiveReceipt: typeof formalReceipt;
      readonly nextActions: readonly { readonly id: string }[];
    }>(['asset', 'authoring', 'status', '--session', fixture.session.sessionId], fixture.workspaceRoot);
    expect(status.code).toBe(0);
    expect(status.response.data).toMatchObject({
      state: 'needs-user-action',
      reason: 'formal-archive-stale',
      formalArchiveReceipt: formalReceipt,
      nextActions: [{ id: 'pack-formal-archive' }],
    });

    const retry = await runJson<{
      readonly reason: string;
      readonly formalArchiveReceipt: typeof formalReceipt;
    }>(['asset', 'authoring', 'pack', '--session', fixture.session.sessionId, '--confirm'], fixture.workspaceRoot, {
      prepareRuntimeAssets: async () => fixture.runtime,
    });
    expect(retry.code).toBe(0);
    expect(retry.response.data).toMatchObject({
      reason: 'formal-archive-stale',
      formalArchiveReceipt: formalReceipt,
    });
    expect(readFileSync(formalReceipt.archivePath)).toEqual(tamperedBytes);

    const recoveryPath = path.join(
      path.dirname(formalReceipt.archivePath),
      'recovered-formal.lpc-assets.zip',
    );
    const recovered = await runJson<{
      readonly reason: string;
      readonly formalArchiveReceipt: {
        readonly archivePath: string;
        readonly archiveDigest: string;
      } | null;
    }>([
      'asset', 'authoring', 'pack', '--session', fixture.session.sessionId,
      '--output', recoveryPath, '--confirm',
    ], fixture.workspaceRoot, {
      prepareRuntimeAssets: async () => fixture.runtime,
    });
    expect(recovered.code, JSON.stringify(recovered.response, null, 2)).toBe(0);
    expect(recovered.response.data).toMatchObject({
      reason: 'formal-archive-current',
      formalArchiveReceipt: {
        archivePath: recoveryPath,
        archiveDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      },
    });
    expect(readFileSync(formalReceipt.archivePath)).toEqual(tamperedBytes);
    expect(existsSync(recoveryPath)).toBe(true);
  });

  it('does not adopt a valid but different archive during session inspection', async () => {
    const fixture = await createFormalReadyFixture();
    const packed = await runJson<{
      readonly formalArchiveReceipt: {
        readonly archivePath: string;
        readonly archiveDigest: string;
        readonly contentDigest: string;
      } | null;
    }>(['asset', 'authoring', 'pack', '--session', fixture.session.sessionId, '--confirm'], fixture.workspaceRoot, {
      prepareRuntimeAssets: async () => fixture.runtime,
    });
    const formalReceipt = packed.response.data?.formalArchiveReceipt;
    if (formalReceipt === null || formalReceipt === undefined) {
      throw new Error('Expected a formal archive receipt.');
    }

    const originalSource = readFileSync(fixture.sourcePath);
    const alternatePath = path.join(fixture.root, 'alternate-formal.lpc-assets.zip');
    writeWalkPng(fixture.sourcePath, '#224488');
    const alternate = await packAssetPack({
      packDirectory: fixture.packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      archivePath: alternatePath,
    });
    expect(alternate.ok).toBe(true);
    if (!alternate.ok) throw new Error('Expected the alternate formal archive to be valid.');
    expect(alternate.archiveDigest).not.toBe(formalReceipt.archiveDigest);
    expect(alternate.contentDigest).not.toBe(formalReceipt.contentDigest);
    writeFileSync(fixture.sourcePath, originalSource);

    const sessionBefore = readFileSync(assetAuthoringSessionPath(fixture.workspace, fixture.session.sessionId));
    const inspected = await runJson<{
      readonly state: string;
      readonly reason: string;
      readonly formalArchiveReceipt: typeof formalReceipt;
      readonly inspectionReceipt: null;
    }>([
      'asset', 'authoring', 'inspect', '--session', fixture.session.sessionId,
      '--archive', alternatePath,
    ], fixture.workspaceRoot, {
      prepareRuntimeAssets: async () => fixture.runtime,
    });
    expect(inspected.code).toBe(0);
    expect(inspected.response.data).toMatchObject({
      state: 'needs-user-action',
      reason: 'archive-inspection-mismatch',
      formalArchiveReceipt: formalReceipt,
      inspectionReceipt: null,
    });
    expect(readFileSync(assetAuthoringSessionPath(fixture.workspace, fixture.session.sessionId)))
      .toEqual(sessionBefore);
  });
});
