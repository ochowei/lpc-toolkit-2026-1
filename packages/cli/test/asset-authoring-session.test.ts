import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetAuthoringPlan } from '@lpc-toolkit/core';
import {
  ASSET_AUTHORING_SESSION_SCHEMA,
  assetAuthoringSessionPath,
  createAssetAuthoringSessionStore,
  deriveAuthoringInvalidationDecisions,
  type AssetAuthoringArchiveInspectionReceipt,
  type AssetAuthoringEvidence,
  type AssetAuthoringFormalArchiveReceipt,
  type AssetAuthoringInstallationReceipt,
} from '../src/asset-authoring-session.js';
import {
  assetAuthoringSessionsRoot,
  initializeAssetWorkspace,
} from '../src/asset-workspace.js';

const temporaryDirectories: string[] = [];
const NOW = '2026-08-03T12:00:00.000Z';
const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const DIGEST_C = `sha256:${'c'.repeat(64)}`;
const DIGEST_D = `sha256:${'d'.repeat(64)}`;

const PLAN: AssetAuthoringPlan = {
  schema: 'lpc-toolkit.asset-authoring-plan.v1',
  goal: 'new-item',
  pack: {
    id: 'acme.fantasy-hair',
    version: '1.0.0',
    displayName: 'ACME Fantasy Hair',
  },
  asset: {
    kind: 'new-item',
    localId: 'moon-braid',
    displayName: 'Moon Braid',
    typeName: 'hair',
    bodyTypes: ['female', 'male'],
    animations: ['idle', 'walk'],
    layers: [{ id: 'foreground', zPos: 120, bodyTypes: ['female', 'male'] }],
  },
  scope: {
    packId: 'acme.fantasy-hair',
    assetId: 'moon-braid',
    bodyTypes: ['female', 'male'],
    animations: ['idle', 'walk'],
    paths: [
      'sprites/moon-braid/foreground/walk.png',
      'sprites/moon-braid/foreground/idle.png',
    ],
  },
  consent: {
    approved: true,
    scope: {
      packId: 'acme.fantasy-hair',
      assetId: 'moon-braid',
      bodyTypes: ['female', 'male'],
      animations: ['idle', 'walk'],
      paths: [
        'sprites/moon-braid/foreground/walk.png',
        'sprites/moon-braid/foreground/idle.png',
      ],
    },
  },
  provider: {
    id: 'external-artist',
    tool: 'sprite-drawing-workbench',
    model: 'human-authored',
  },
};

function createDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function createWorkspace(): ReturnType<typeof initializeAssetWorkspace> {
  return initializeAssetWorkspace(path.join(createDirectory('lpc-authoring-parent-'), 'workspace'));
}

function createStore(workspace: ReturnType<typeof initializeAssetWorkspace>) {
  return createAssetAuthoringSessionStore(workspace, {
    now: () => NOW,
  });
}

function packRoot(workspace: ReturnType<typeof initializeAssetWorkspace>): string {
  return path.join(workspace.packsRoot, 'acme.fantasy-hair');
}

function evidence(overrides: Partial<AssetAuthoringEvidence> = {}): AssetAuthoringEvidence {
  return {
    manifestDigest: DIGEST_A,
    contractDigest: DIGEST_B,
    sourceDigests: [{ path: 'sprites/moon-braid/foreground/walk.png', digest: DIGEST_C }],
    validationReceipt: {
      id: 'validation-1',
      manifestDigest: DIGEST_A,
      sourceDigests: [{ path: 'sprites/moon-braid/foreground/walk.png', digest: DIGEST_C }],
    },
    previewReceipt: {
      id: 'preview-1',
      manifestDigest: DIGEST_A,
      sourceDigests: [{ path: 'sprites/moon-braid/foreground/walk.png', digest: DIGEST_C }],
      validationReceiptId: 'validation-1',
      inputDigest: DIGEST_D,
      artifacts: null,
    },
    ...overrides,
  };
}

function formalArchiveReceipt(
  overrides: Partial<AssetAuthoringFormalArchiveReceipt> = {},
): AssetAuthoringFormalArchiveReceipt {
  return {
    schema: 'lpc-toolkit.asset-authoring-formal-archive-receipt.v1',
    packId: PLAN.pack.id,
    version: PLAN.pack.version,
    archivePath: '/workspace/release-artifacts/acme.fantasy-hair-1.0.0.lpc-assets.zip',
    archiveDigest: DIGEST_A,
    manifestDigest: DIGEST_A,
    contentDigest: DIGEST_B,
    sourceDigests: [{ path: PLAN.scope.paths[0]!, digest: DIGEST_C }],
    validationReceiptId: 'validation-1',
    declarationReceiptDigest: DIGEST_D,
    previewAcceptanceReceiptDigest: DIGEST_A,
    previewInputDigest: DIGEST_B,
    previewArtifacts: [
      { id: 'preview:preview', path: '/workspace/release-preview/preview.png', digest: DIGEST_A },
      { id: 'preview:metadata', path: '/workspace/release-preview/metadata.json', digest: DIGEST_B },
      { id: 'preview:credits_txt', path: '/workspace/release-preview/credits.txt', digest: DIGEST_C },
      { id: 'preview:credits_csv', path: '/workspace/release-preview/credits.csv', digest: DIGEST_D },
    ],
    recordedAt: NOW,
    ...overrides,
  };
}

function archiveInspectionReceipt(
  formal: AssetAuthoringFormalArchiveReceipt,
  overrides: Partial<AssetAuthoringArchiveInspectionReceipt> = {},
): AssetAuthoringArchiveInspectionReceipt {
  return {
    schema: 'lpc-toolkit.asset-authoring-archive-inspection-receipt.v1',
    packId: formal.packId,
    version: formal.version,
    archivePath: formal.archivePath,
    archiveDigest: formal.archiveDigest,
    formalArchiveDigest: formal.archiveDigest,
    manifestDigest: formal.manifestDigest,
    contentDigest: formal.contentDigest,
    sourceDigests: formal.sourceDigests,
    entryCount: 2,
    totalUncompressedBytes: 128,
    recordedAt: NOW,
    ...overrides,
  };
}

function installationReceipt(
  overrides: Partial<AssetAuthoringInstallationReceipt> = {},
): AssetAuthoringInstallationReceipt {
  return {
    schema: 'lpc-toolkit.asset-authoring-install-receipt.v1',
    workspaceId: 'consumer-workspace-id',
    workspaceRoot: '/consumer-workspace',
    packId: PLAN.pack.id,
    version: PLAN.pack.version,
    archivePath: '/artist-workspace/release-artifacts/acme.fantasy-hair-1.0.0.lpc-assets.zip',
    archiveDigest: DIGEST_A,
    installedDirectory: '/consumer-workspace/.lpc-toolkit/asset-packs/installed/acme.fantasy-hair/1.0.0/sha256-archive',
    payloadDigests: {
      'asset-pack.json': DIGEST_A,
      'sprites/moon-braid/foreground/walk.png': DIGEST_B,
    },
    registryPath: '/consumer-workspace/assets_custom/asset-pack-registry.json',
    registryDigest: DIGEST_C,
    outputRoot: '/consumer-workspace/assets_custom',
    generatedDigests: { 'CREDITS.csv': DIGEST_D },
    creditsDigest: DIGEST_D,
    recordedAt: NOW,
    ...overrides,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('asset authoring session persistence', () => {
  it('creates UUID-bound sessions under manager-owned workspace state', () => {
    const workspace = createWorkspace();
    const store = createStore(workspace);

    const first = store.create({ plan: PLAN, packRoot: packRoot(workspace) });
    const second = store.create({ plan: PLAN, packRoot: packRoot(workspace) });

    expect(first.schema).toBe(ASSET_AUTHORING_SESSION_SCHEMA);
    expect(first.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(second.sessionId).not.toBe(first.sessionId);
    expect(first.workspaceRoot).toBe(workspace.root);
    expect(first.phase).toBe('planned');
    expect(first.checkpointFreshness).toBe('missing');
    expect(first.checkpoints.map((checkpoint) => checkpoint.targetId)).toEqual([
      'sprites/moon-braid/foreground/idle.png',
      'sprites/moon-braid/foreground/walk.png',
    ]);

    const sessionsRoot = assetAuthoringSessionsRoot(workspace);
    expect(sessionsRoot).toBe(
      path.join(workspace.stateRoot, 'authoring-sessions'),
    );
    expect(assetAuthoringSessionPath(workspace, first.sessionId)).toBe(
      path.join(sessionsRoot, first.sessionId, 'session.json'),
    );
    expect(sessionsRoot.startsWith(workspace.packsRoot)).toBe(false);
    expect(sessionsRoot.startsWith(workspace.outputRoot)).toBe(false);
    expect(sessionsRoot.startsWith(workspace.installedRoot)).toBe(false);
    expect(existsSync(assetAuthoringSessionPath(workspace, first.sessionId))).toBe(true);
  });

  it('persists strict phases, receipts, provenance, conflict, and timestamps', () => {
    const workspace = createWorkspace();
    const session = createStore(workspace).create({
      plan: PLAN,
      packRoot: packRoot(workspace),
    });

    expect(session).toMatchObject({
      schema: ASSET_AUTHORING_SESSION_SCHEMA,
      goal: 'new-item',
      state: 'needs-user-action',
      reason: 'session-created',
      phase: 'planned',
      checkpoint: null,
      checkpointFreshness: 'missing',
      receipts: { validation: null, preview: null },
      conflict: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(session.provenance).toEqual([
      expect.objectContaining({
        kind: 'session-created',
        occurredAt: NOW,
      }),
    ]);
    expect(session.checkpoints).toEqual([
      { targetId: 'sprites/moon-braid/foreground/idle.png', freshness: 'missing' },
      { targetId: 'sprites/moon-braid/foreground/walk.png', freshness: 'missing' },
    ]);
  });

  it('backward-reads old receipt slots and persists a strict acknowledgement receipt', () => {
    const workspace = createWorkspace();
    const store = createStore(workspace);
    const session = store.create({ plan: PLAN, packRoot: packRoot(workspace) });
    const sessionPath = assetAuthoringSessionPath(workspace, session.sessionId);
    const oldDocument = JSON.parse(readFileSync(sessionPath, 'utf8')) as {
      readonly receipts: Record<string, unknown>;
    };
    delete oldDocument.receipts.acknowledgements;
    delete oldDocument.receipts.releaseDeclaration;
    delete oldDocument.receipts.previewAcceptance;
    delete oldDocument.receipts.draftArchive;
    delete oldDocument.receipts.sync;
    delete oldDocument.receipts.releaseProvenance;
    delete oldDocument.receipts.providerInvocation;
    delete oldDocument.receipts.providerResult;
    writeFileSync(sessionPath, `${JSON.stringify(oldDocument, null, 2)}\n`);

    expect(store.read(session.sessionId).receipts.acknowledgements).toBeNull();
    expect(store.read(session.sessionId).receipts.releaseDeclaration).toBeNull();
    expect(store.read(session.sessionId).receipts.previewAcceptance).toBeNull();
    expect(store.read(session.sessionId).receipts.draftArchive).toBeNull();
    expect(store.read(session.sessionId).receipts.sync).toBeNull();
    expect(store.read(session.sessionId).receipts.releaseProvenance).toBeNull();
    expect(store.read(session.sessionId).receipts.providerInvocation).toBeNull();
    expect(store.read(session.sessionId).receipts.providerResult).toBeNull();
    const replaced = store.replace(session.sessionId, {
      receipts: {
        validation: null,
        preview: null,
        acknowledgements: {
          id: DIGEST_A,
          manifestDigest: DIGEST_B,
          sourceDigests: [{
            path: 'sprites/moon-braid/foreground/walk.png',
            digest: DIGEST_C,
          }],
          recordDigests: [DIGEST_C, DIGEST_D],
        },
        releaseDeclaration: null,
        previewAcceptance: null,
      },
    });

    expect(replaced.receipts.acknowledgements).toEqual({
      id: DIGEST_A,
      manifestDigest: DIGEST_B,
      sourceDigests: [{
        path: 'sprites/moon-braid/foreground/walk.png',
        digest: DIGEST_C,
      }],
      recordDigests: [DIGEST_C, DIGEST_D],
    });
  });

  it('persists only session-bound provider invocation evidence and rejects private staging values', () => {
    const workspace = createWorkspace();
    const store = createStore(workspace);
    const session = store.create({ plan: PLAN, packRoot: packRoot(workspace) });
    const targetId = PLAN.scope.paths[0]!;
    const invocation = {
      schema: 'lpc-toolkit.asset-provider-invocation.v1',
      sessionId: session.sessionId,
      contractDigest: DIGEST_A,
      operation: 'sprite-candidate.v1',
      provider: {
        id: 'provider.example',
        adapter: { id: 'agent-adapter.example', version: '1.0.0' },
      },
      targetIds: [targetId],
      consent: {
        confirmed: true,
        scopeDigest: DIGEST_B,
        network: { enabled: false, hosts: [] },
        referenceDigests: [],
      },
      limits: {
        maxCandidateBytes: 67108864,
        timeoutSeconds: 600,
        maxReferences: 8,
      },
      candidate: {
        stagingId: `provider.example/${session.sessionId}`,
        targetIds: [targetId],
      },
    } as const;
    const replaced = store.replace(session.sessionId, {
      receipts: {
        ...session.receipts,
        providerInvocation: invocation,
        providerResult: null,
      },
    });
    expect(replaced.receipts.providerInvocation).toEqual(invocation);
    expect(store.read(session.sessionId).receipts.providerInvocation).toEqual(invocation);

    const sessionPath = assetAuthoringSessionPath(workspace, session.sessionId);
    const document = JSON.parse(readFileSync(sessionPath, 'utf8')) as {
      readonly receipts: Record<string, unknown>;
    };
    document.receipts.providerInvocation = {
      ...invocation,
      candidate: {
        ...invocation.candidate,
        stagingId: '/private/provider-candidate',
      },
    };
    writeFileSync(sessionPath, `${JSON.stringify(document, null, 2)}\n`);
    expect(() => store.read(session.sessionId)).toThrow(/provider invocation|private|staging/i);
  });

  it('persists and reads the bounded consumer installation receipt', () => {
    const workspace = createWorkspace();
    const consumer = initializeAssetWorkspace(
      path.join(createDirectory('lpc-authoring-consumer-'), 'workspace'),
    );
    const store = createStore(workspace);
    const session = store.create({ plan: PLAN, packRoot: packRoot(workspace) });
    const receipt = installationReceipt({
      workspaceId: 'consumer-workspace-id',
      workspaceRoot: consumer.root,
      installedDirectory: path.join(consumer.stateRoot, 'installed', 'acme.fantasy-hair', '1.0.0', 'sha256-archive'),
      registryPath: consumer.registryPath,
      outputRoot: consumer.outputRoot,
    });

    const next = store.replace(session.sessionId, {
      receipts: { ...session.receipts, installation: receipt },
    });

    expect(next.receipts.installation).toEqual(receipt);
    expect(store.read(session.sessionId).receipts.installation).toEqual(receipt);
  });

  it('persists strict draft and sync receipts and rejects out-of-scope receipt paths', () => {
    const workspace = createWorkspace();
    const store = createStore(workspace);
    const session = store.create({ plan: PLAN, packRoot: packRoot(workspace) });
    const sessionDirectory = path.dirname(assetAuthoringSessionPath(workspace, session.sessionId));
    const draftArchivePath = path.join(
      sessionDirectory,
      'release-artifacts',
      'acme.fantasy-hair-1.0.0.draft.lpc-assets.zip',
    );
    const sourceDigests = [{
      path: 'sprites/moon-braid/foreground/walk.png',
      digest: DIGEST_C,
    }];
    const replaced = store.replace(session.sessionId, {
      receipts: {
        validation: null,
        preview: null,
        acknowledgements: null,
        releaseDeclaration: null,
        previewAcceptance: null,
        draftArchive: {
          schema: 'lpc-toolkit.asset-authoring-draft-receipt.v1',
          packId: PLAN.pack.id,
          version: PLAN.pack.version,
          archivePath: draftArchivePath,
          archiveDigest: DIGEST_A,
          manifestDigest: DIGEST_B,
          contentDigest: DIGEST_C,
          sourceDigests,
          recordedAt: NOW,
        },
        sync: {
          id: DIGEST_A,
          packId: PLAN.pack.id,
          version: PLAN.pack.version,
          manifestDigest: DIGEST_B,
          contentDigest: DIGEST_C,
          sourceDigests,
          workspaceId: 'workspace-id',
          outputRoot: workspace.outputRoot,
          registryDigest: DIGEST_D,
          compileDigest: DIGEST_A,
          generatedDigests: {
            'sheet_definitions/hair/moon-braid.json': DIGEST_B,
          },
          recordedAt: NOW,
        },
      },
    });

    expect(replaced.receipts.draftArchive).toMatchObject({
      schema: 'lpc-toolkit.asset-authoring-draft-receipt.v1',
      archivePath: draftArchivePath,
    });
    expect(replaced.receipts.sync).toMatchObject({
      outputRoot: workspace.outputRoot,
      generatedDigests: { 'sheet_definitions/hair/moon-braid.json': DIGEST_B },
    });
    expect(store.read(session.sessionId).receipts).toEqual(replaced.receipts);

    const sessionPath = assetAuthoringSessionPath(workspace, session.sessionId);
    const document = JSON.parse(readFileSync(sessionPath, 'utf8')) as {
      readonly receipts: Record<string, unknown>;
    };
    document.receipts.draftArchive = {
      ...document.receipts.draftArchive as Record<string, unknown>,
      archivePath: path.join(workspace.root, 'outside.draft.lpc-assets.zip'),
    };
    writeFileSync(sessionPath, `${JSON.stringify(document, null, 2)}\n`);
    expect(() => store.read(session.sessionId)).toThrow(
      'must stay inside the session release-artifact root',
    );
  });

  it('persists canonical preview artifact bindings and reads old previews without them', () => {
    const workspace = createWorkspace();
    const store = createStore(workspace);
    const session = store.create({ plan: PLAN, packRoot: packRoot(workspace) });
    const previewArtifacts = [
      { id: 'preview:preview' as const, path: path.join(session.packRoot, 'previews/preview.png'), digest: DIGEST_A },
      { id: 'preview:metadata' as const, path: path.join(session.packRoot, 'previews/metadata.json'), digest: DIGEST_B },
      { id: 'preview:credits_txt' as const, path: path.join(session.packRoot, 'previews/credits.txt'), digest: DIGEST_C },
      { id: 'preview:credits_csv' as const, path: path.join(session.packRoot, 'previews/credits.csv'), digest: DIGEST_D },
    ];
    const replaced = store.replace(session.sessionId, {
      receipts: {
        validation: null,
        preview: {
          id: DIGEST_A,
          manifestDigest: DIGEST_B,
          sourceDigests: [{
            path: 'sprites/moon-braid/foreground/walk.png',
            digest: DIGEST_C,
          }],
          validationReceiptId: DIGEST_A,
          inputDigest: DIGEST_D,
          artifacts: previewArtifacts,
        },
        acknowledgements: null,
        releaseDeclaration: null,
        previewAcceptance: null,
      },
    });

    expect(replaced.receipts.preview?.artifacts).toEqual(previewArtifacts);
    const sessionPath = assetAuthoringSessionPath(workspace, session.sessionId);
    const document = JSON.parse(readFileSync(sessionPath, 'utf8')) as {
      readonly receipts: { readonly preview: Record<string, unknown> };
    };
    delete document.receipts.preview.artifacts;
    writeFileSync(sessionPath, `${JSON.stringify(document, null, 2)}\n`);
    expect(store.read(session.sessionId).receipts.preview?.artifacts).toBeNull();
  });

  it('replaces one session atomically while preserving the prior state after a failed rename', () => {
    const workspace = createWorkspace();
    const store = createStore(workspace);
    const session = store.create({ plan: PLAN, packRoot: packRoot(workspace) });
    const sessionPath = assetAuthoringSessionPath(workspace, session.sessionId);
    const before = readFileSync(sessionPath, 'utf8');

    const renameFailure = vi.fn<typeof renameSync>(() => {
      throw new Error('injected session rename failure');
    });
    const failingStore = createAssetAuthoringSessionStore(workspace, {
      now: () => NOW,
      fileOps: { renameSync: renameFailure },
    });

    expect(() => failingStore.replace(session.sessionId, {
      phase: 'scaffolded',
      reason: 'scaffolded',
    })).toThrow('injected session rename failure');
    expect(readFileSync(sessionPath, 'utf8')).toBe(before);

    const replaced = store.replace(session.sessionId, {
      phase: 'scaffolded',
      reason: 'scaffolded',
    });
    expect(replaced.phase).toBe('scaffolded');
    expect(replaced.reason).toBe('scaffolded');
    expect(store.read(session.sessionId).updatedAt).toBe(NOW);
  });

  it('rejects foreign workspaces, unknown schema versions, and tampered fields', () => {
    const workspace = createWorkspace();
    const foreignWorkspace = createWorkspace();
    const session = createStore(workspace).create({
      plan: PLAN,
      packRoot: packRoot(workspace),
    });
    const source = assetAuthoringSessionPath(workspace, session.sessionId);
    const foreignPath = assetAuthoringSessionPath(foreignWorkspace, session.sessionId);
    mkdirSync(path.dirname(foreignPath), { recursive: true });
    writeFileSync(foreignPath, readFileSync(source));

    expect(() => createStore(foreignWorkspace).read(session.sessionId)).toThrow(
      'does not belong to this workspace',
    );

    writeFileSync(source, `${JSON.stringify({ ...session, schema: 'lpc-toolkit.asset-authoring-session.v2' })}\n`);
    expect(() => createStore(workspace).read(session.sessionId)).toThrow(
      'Unknown asset authoring session schema',
    );

    writeFileSync(source, `${JSON.stringify({ ...session, unknownField: true })}\n`);
    expect(() => createStore(workspace).read(session.sessionId)).toThrow(
      'contains unknown fields',
    );
  });

  it('rejects session and pack paths that escape their manager-owned roots', () => {
    const workspace = createWorkspace();
    const outside = createDirectory('lpc-authoring-outside-');
    const store = createStore(workspace);

    expect(() => store.create({ plan: PLAN, packRoot: outside })).toThrow(
      'pack root must stay inside the workspace packs root',
    );
    expect(() => store.read('../outside')).toThrow(
      'session id must be a UUIDv4',
    );
  });

  it('keeps status read-only and repeated resume idempotent when files are unchanged', () => {
    const workspace = createWorkspace();
    const store = createStore(workspace);
    const session = store.create({ plan: PLAN, packRoot: packRoot(workspace) });
    const sessionPath = assetAuthoringSessionPath(workspace, session.sessionId);
    const before = readFileSync(sessionPath, 'utf8');

    expect(store.status(session.sessionId)).toEqual(session);
    expect(store.resume(session.sessionId)).toEqual(session);
    expect(store.resume(session.sessionId)).toEqual(session);
    expect(readFileSync(sessionPath, 'utf8')).toBe(before);
  });
});

describe('asset authoring checkpoint invalidation', () => {
  it('returns stable decisions for manifest, contract, PNG, validation, and preview drift', () => {
    const current = evidence({
      manifestDigest: DIGEST_B,
      contractDigest: DIGEST_C,
      sourceDigests: [{ path: 'sprites/moon-braid/foreground/walk.png', digest: DIGEST_D }],
      validationReceipt: {
        id: 'validation-1',
        manifestDigest: DIGEST_A,
        sourceDigests: [{ path: 'sprites/moon-braid/foreground/walk.png', digest: DIGEST_C }],
      },
      previewReceipt: {
        id: 'preview-1',
        manifestDigest: DIGEST_A,
        sourceDigests: [{ path: 'sprites/moon-braid/foreground/walk.png', digest: DIGEST_C }],
        validationReceiptId: 'validation-1',
        inputDigest: DIGEST_A,
        artifacts: null,
      },
    });

    expect(deriveAuthoringInvalidationDecisions(evidence(), current)).toEqual([
      { checkpoint: 'manifest', reason: 'manifest-semantic-drift' },
      { checkpoint: 'contract', reason: 'contract-replaced' },
      { checkpoint: 'source', reason: 'png-drift' },
      { checkpoint: 'validation', reason: 'validation-receipt-stale' },
      { checkpoint: 'preview', reason: 'preview-receipt-stale' },
    ]);
  });

  it('does not invalidate current receipts when all evidence digests remain unchanged', () => {
    const baseline = evidence();

    expect(deriveAuthoringInvalidationDecisions(baseline, {
      ...baseline,
      sourceDigests: [...baseline.sourceDigests],
      validationReceipt: { ...baseline.validationReceipt! },
      previewReceipt: { ...baseline.previewReceipt! },
    })).toEqual([]);
  });

  it('invalidates a preview when its validation revision changes', () => {
    const baseline = evidence();
    const current = {
      ...baseline,
      validationReceipt: {
        ...baseline.validationReceipt!,
        id: 'validation-2',
      },
    };

    expect(deriveAuthoringInvalidationDecisions(baseline, current)).toEqual([
      { checkpoint: 'preview', reason: 'preview-receipt-stale' },
    ]);
  });

  it('invalidates the preview artifact checkpoint when one bound artifact changes', () => {
    const artifacts = [
      { id: 'preview:preview' as const, path: '/workspace/preview.png', digest: DIGEST_A },
      { id: 'preview:metadata' as const, path: '/workspace/metadata.json', digest: DIGEST_B },
      { id: 'preview:credits_txt' as const, path: '/workspace/credits.txt', digest: DIGEST_C },
      { id: 'preview:credits_csv' as const, path: '/workspace/credits.csv', digest: DIGEST_D },
    ];
    const baseline = evidence();
    const previous = {
      ...baseline,
      previewReceipt: {
        ...baseline.previewReceipt!,
        artifacts,
      },
    };
    const current = {
      ...baseline,
      previewReceipt: {
        ...baseline.previewReceipt!,
        artifacts: artifacts.map((artifact, index) => index === 2
          ? { ...artifact, digest: DIGEST_A }
          : artifact),
      },
    };

    expect(deriveAuthoringInvalidationDecisions(previous, current)).toEqual([
      { checkpoint: 'previewArtifacts', reason: 'preview-artifact-stale' },
    ]);
  });

  it('invalidates the acknowledgement receipt after manifest or source drift', () => {
    const baseline = evidence({
      acknowledgementsReceipt: {
        id: DIGEST_A,
        manifestDigest: DIGEST_A,
        sourceDigests: [{
          path: 'sprites/moon-braid/foreground/walk.png',
          digest: DIGEST_C,
        }],
        recordDigests: [DIGEST_D],
      },
    });
    const current = {
      ...baseline,
      manifestDigest: DIGEST_B,
      sourceDigests: [{
        path: 'sprites/moon-braid/foreground/walk.png',
        digest: DIGEST_D,
      }],
    };

    expect(deriveAuthoringInvalidationDecisions(baseline, current)).toEqual([
      { checkpoint: 'manifest', reason: 'manifest-semantic-drift' },
      { checkpoint: 'source', reason: 'png-drift' },
      { checkpoint: 'acknowledgements', reason: 'acknowledgement-receipt-stale' },
      { checkpoint: 'validation', reason: 'validation-receipt-stale' },
      { checkpoint: 'preview', reason: 'preview-receipt-stale' },
    ]);
  });

  it('invalidates formal archive and inspection receipts after bound evidence drifts', () => {
    const formal = formalArchiveReceipt();
    const installation = installationReceipt();
    const current = evidence({
      manifestDigest: DIGEST_B,
      formalArchiveReceipt: formal,
      archiveInspectionReceipt: archiveInspectionReceipt(formal),
      installationReceipt: installation,
    });

    expect(deriveAuthoringInvalidationDecisions({
      ...evidence(),
      formalArchiveReceipt: formal,
      archiveInspectionReceipt: archiveInspectionReceipt(formal),
      installationReceipt: installation,
    }, current)).toEqual([
      { checkpoint: 'manifest', reason: 'manifest-semantic-drift' },
      { checkpoint: 'validation', reason: 'validation-receipt-stale' },
      { checkpoint: 'preview', reason: 'preview-receipt-stale' },
      { checkpoint: 'formalArchive', reason: 'formal-archive-stale' },
      { checkpoint: 'archiveInspection', reason: 'archive-inspection-stale' },
      { checkpoint: 'installation', reason: 'installation-stale' },
    ]);
  });
});
