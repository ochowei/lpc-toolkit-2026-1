import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { afterEach, describe, expect, it } from 'vitest';
import { scaffoldNewAssetPack } from '../src/asset-pack-scaffold.js';
import {
  assetAuthoringSessionPath,
  createAssetAuthoringSessionStore,
} from '../src/asset-authoring-session.js';
import { initializeAssetWorkspace } from '../src/asset-workspace.js';
import { runCli } from '../src/main.js';

type JsonRecord = Record<string, unknown>;

const DIGEST = `sha256:${'a'.repeat(64)}`;
const temporaryDirectories: string[] = [];

const NEW_ITEM_PLAN = {
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
  draftCredits: {
    authors: ['Alice'],
    licenses: ['CC-BY-SA 4.0'],
    urls: ['https://example.test/acme/fantasy-hair'],
    notes: 'Draft attribution supplied for review.',
  },
} as const;

const EXTEND_ITEM_PLAN = {
  schema: 'lpc-toolkit.asset-authoring-plan.v1',
  goal: 'extend-item',
  pack: {
    id: 'acme.animation-fixes',
    version: '1.0.0',
    displayName: 'ACME Animation Fixes',
  },
  asset: {
    kind: 'extend-item',
    itemId: 'hair_messy',
    typeName: 'hair',
  },
  scope: {
    packId: 'acme.animation-fixes',
    assetId: 'hair_messy',
    bodyTypes: ['child'],
    animations: ['climb'],
    paths: ['spritesheets/hair/messy/child/climb.png'],
  },
  consent: {
    approved: true,
    scope: {
      packId: 'acme.animation-fixes',
      assetId: 'hair_messy',
      bodyTypes: ['child'],
      animations: ['climb'],
      paths: ['spritesheets/hair/messy/child/climb.png'],
    },
  },
  remediation: {
    reportDigest: DIGEST,
    selectedFinding: {
      category: 'missingFiles',
      path: 'spritesheets/hair/messy/child/climb.png',
      animation: 'climb',
      sourceAnimation: 'climb',
      consumers: [{
        itemId: 'hair_messy',
        typeName: 'hair',
        layer: 'layer_1',
        bodyTypes: ['child'],
        recolors: [],
      }],
    },
    consumer: {
      itemId: 'hair_messy',
      typeName: 'hair',
      layer: 'layer_1',
      bodyTypes: ['child'],
      recolors: [],
    },
    pathConfidence: 'exact',
    geometry: {
      kind: 'standard',
      frameSize: 64,
      rows: [{
        sourceRow: 2,
        direction: 'down',
        cells: [{ sourceColumn: 0, logicalFrameIndices: [0] }],
      }],
    },
    sourceCells: [{
      sourceRow: 2,
      direction: 'down',
      sourceColumn: 0,
      logicalFrameIndices: [0],
    }],
  },
  draftCredits: {
    authors: ['Alice'],
    licenses: ['CC-BY-SA 4.0'],
    urls: ['https://example.test/acme/animation-fixes'],
    notes: 'Draft attribution supplied for review.',
  },
} as const;

const ATTACH_PACK_PLAN = {
  schema: 'lpc-toolkit.asset-authoring-plan.v1',
  goal: 'attach-pack',
  pack: {
    id: 'acme.existing-pack',
    version: '2.3.0',
    displayName: 'ACME Existing Pack',
  },
  asset: { kind: 'attach-pack' },
  scope: {
    packId: 'acme.existing-pack',
    bodyTypes: [],
    animations: [],
    paths: ['asset-pack.json'],
  },
} as const;

function createDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function createWorkspace(prefix = 'lpc-authoring-command-workspace-') {
  return initializeAssetWorkspace(path.join(createDirectory(prefix), 'workspace'));
}

function writePlan(root: string, name: string, plan: unknown): string {
  const planPath = path.join(root, name);
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return planPath;
}

function withoutDraftCredits(): JsonRecord {
  const plan = JSON.parse(JSON.stringify(NEW_ITEM_PLAN)) as JsonRecord;
  delete plan.draftCredits;
  return plan;
}

function readJson(text: string): JsonRecord {
  return JSON.parse(text) as JsonRecord;
}

function dataOf(response: JsonRecord): JsonRecord {
  const data = response.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Expected authoring response data.');
  }
  return data as JsonRecord;
}

async function runJson(
  argv: readonly string[],
  cwd: string,
): Promise<{ readonly code: number; readonly response: JsonRecord; readonly stderr: readonly string[] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli([...argv, '--json'], {
    cwd,
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  });
  return { code, response: readJson(stdout.join('')), stderr };
}

function sessionIdFrom(response: JsonRecord): string {
  const sessionId = dataOf(response).sessionId;
  if (typeof sessionId !== 'string') throw new Error('Authoring response has no session id.');
  return sessionId;
}

function sha256(value: Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('asset authoring command application', () => {
  it('starts a credited new-item session, reuses the existing scaffold, and discovers its workspace', async () => {
    const workspace = createWorkspace();
    const planPath = writePlan(workspace.root, 'new-item-plan.json', NEW_ITEM_PLAN);
    const nested = path.join(workspace.root, 'agent', 'run');
    mkdirSync(nested, { recursive: true });

    const result = await runJson([
      'asset', 'authoring', 'start', '--plan', planPath,
    ], nested);

    expect(result.code).toBe(0);
    expect(result.stderr).toEqual([]);
    const data = dataOf(result.response);
    expect(data).toMatchObject({
      schema: 'lpc-toolkit.asset-authoring-response.v1',
      goal: 'new-item',
      state: 'needs-user-action',
      phase: 'scaffolded',
      reason: 'scaffolded',
    });
    expect(data.nextActions).toEqual([
      expect.objectContaining({
        id: 'create-contract',
        safety: 'safe',
        command: expect.stringContaining('asset authoring contract'),
      }),
    ]);

    const packRoot = path.join(workspace.packsRoot, NEW_ITEM_PLAN.pack.id);
    expect(readJson(readFileSync(path.join(packRoot, 'asset-pack.json'), 'utf8'))).toMatchObject({
      id: NEW_ITEM_PLAN.pack.id,
      credits: NEW_ITEM_PLAN.draftCredits,
    });
    expect(data.artifacts).toEqual([
      expect.objectContaining({ id: 'pack', path: packRoot }),
    ]);
  });

  it('persists a needs-user-action session before missing author and license data', async () => {
    const workspace = createWorkspace();
    const planPath = writePlan(workspace.root, 'missing-credits-plan.json', withoutDraftCredits());

    const result = await runJson([
      'asset', 'authoring', 'start', '--plan', planPath,
    ], workspace.root);

    expect(result.code).toBe(0);
    const data = dataOf(result.response);
    expect(data).toMatchObject({
      state: 'needs-user-action',
      phase: 'planned',
      reason: 'missing-draft-credits',
    });
    expect(data.inputsNeeded).toEqual([
      { id: 'author', summary: 'Provide the human attribution author.' },
      { id: 'license', summary: 'Provide the human attribution license.' },
    ]);
    const sessionId = sessionIdFrom(result.response);
    expect(existsSync(assetAuthoringSessionPath(workspace, sessionId))).toBe(true);
    expect(existsSync(path.join(workspace.packsRoot, NEW_ITEM_PLAN.pack.id))).toBe(false);
  });

  it('honors an explicit workspace override and preserves exact audit-derived extension evidence', async () => {
    const workspace = createWorkspace('lpc-authoring-command-override-');
    const outside = createDirectory('lpc-authoring-command-cwd-');
    const planPath = writePlan(outside, 'extension-plan.json', EXTEND_ITEM_PLAN);

    const result = await runJson([
      'asset', 'authoring', 'start', '--plan', planPath,
      '--workspace', workspace.root,
    ], outside);

    expect(result.code).toBe(0);
    expect(dataOf(result.response)).toMatchObject({
      goal: 'extend-item',
      state: 'needs-user-action',
      phase: 'planned',
      reason: 'awaiting-contract',
    });
    const sessionId = sessionIdFrom(result.response);
    const session = createAssetAuthoringSessionStore(workspace).read(sessionId);
    expect(session.workspaceRoot).toBe(workspace.root);
    expect(session.goal).toBe('extend-item');
    if (session.plan.goal !== 'extend-item') throw new Error('Expected extension plan.');
    expect(session.plan.remediation.selectedFinding).toEqual(
      EXTEND_ITEM_PLAN.remediation.selectedFinding,
    );
    expect(session.plan.remediation.pathConfidence).toBe('exact');
  });

  it('attaches an existing pack without regenerating its manifest', async () => {
    const workspace = createWorkspace('lpc-authoring-command-attach-');
    const scaffold = scaffoldNewAssetPack({
      packId: ATTACH_PACK_PLAN.pack.id,
      version: ATTACH_PACK_PLAN.pack.version,
      displayName: ATTACH_PACK_PLAN.pack.displayName,
      localId: 'attached-item',
      typeName: 'hair',
      bodyTypes: ['male'],
      animations: ['walk'],
      credits: {
        authors: ['Existing Artist'],
        licenses: ['CC-BY-SA 4.0'],
        urls: ['https://example.test/existing'],
        notes: 'Existing pack.',
      },
      advanced: false,
      outputDirectory: path.join(workspace.packsRoot, ATTACH_PACK_PLAN.pack.id),
    });
    if (!scaffold.ok) throw new Error('Could not create attach fixture.');
    const manifestPath = path.join(scaffold.packRoot, 'asset-pack.json');
    const before = readFileSync(manifestPath, 'utf8');
    const planPath = writePlan(workspace.root, 'attach-plan.json', ATTACH_PACK_PLAN);

    const result = await runJson([
      'asset', 'authoring', 'start', '--plan', planPath,
    ], workspace.root);

    expect(result.code).toBe(0);
    expect(dataOf(result.response)).toMatchObject({
      goal: 'attach-pack',
      phase: 'scaffolded',
      reason: 'pack-attached',
    });
    expect(readFileSync(manifestPath, 'utf8')).toBe(before);
  });

  it('keeps status read-only and makes unchanged resume idempotent', async () => {
    const workspace = createWorkspace('lpc-authoring-command-status-');
    const planPath = writePlan(workspace.root, 'status-plan.json', withoutDraftCredits());
    const started = await runJson([
      'asset', 'authoring', 'start', '--plan', planPath,
    ], workspace.root);
    const sessionId = sessionIdFrom(started.response);
    const sessionPath = assetAuthoringSessionPath(workspace, sessionId);
    const before = readFileSync(sessionPath, 'utf8');

    const status = await runJson([
      'asset', 'authoring', 'status', '--session', sessionId,
      '--workspace', workspace.root,
    ], createDirectory('lpc-authoring-command-status-cwd-'));
    const resumed = await runJson([
      'asset', 'authoring', 'resume', '--session', sessionId,
      '--workspace', workspace.root,
    ], createDirectory('lpc-authoring-command-resume-cwd-'));

    expect(status.code).toBe(0);
    expect(resumed.code).toBe(0);
    const statusData = dataOf(status.response);
    const { webHandoff, ...statusDataWithoutHandoff } = statusData;
    expect(webHandoff).toBeNull();
    expect(dataOf(resumed.response)).toEqual(statusDataWithoutHandoff);
    expect(readFileSync(sessionPath, 'utf8')).toBe(before);
  });

  it('records external PNG evidence without overwriting the source', async () => {
    const workspace = createWorkspace('lpc-authoring-command-png-');
    const planPath = writePlan(workspace.root, 'png-plan.json', NEW_ITEM_PLAN);
    const started = await runJson([
      'asset', 'authoring', 'start', '--plan', planPath,
    ], workspace.root);
    const sessionId = sessionIdFrom(started.response);
    const sourcePath = path.join(
      workspace.packsRoot,
      NEW_ITEM_PLAN.pack.id,
      'sprites/moon-braid/foreground/walk.png',
    );
    const png = createCanvas(64, 64).toBuffer('image/png');
    writeFileSync(sourcePath, png);

    const resumed = await runJson([
      'asset', 'authoring', 'resume', '--session', sessionId,
    ], workspace.root);
    const session = createAssetAuthoringSessionStore(workspace).read(sessionId);

    expect(resumed.code).toBe(0);
    expect(dataOf(resumed.response)).toMatchObject({
      state: 'needs-user-action',
      reason: 'external-png-drift',
    });
    expect(session.provenance).toEqual([
      expect.objectContaining({ kind: 'session-created' }),
      expect.objectContaining({ kind: 'external-png-observed', digest: sha256(png) }),
    ]);
    expect(readFileSync(sourcePath)).toEqual(png);
  });

  it('turns manifest byte drift into a conflict and reconciles external or session state by digest', async () => {
    const workspace = createWorkspace('lpc-authoring-command-manifest-');
    const planPath = writePlan(workspace.root, 'manifest-plan.json', NEW_ITEM_PLAN);
    const started = await runJson([
      'asset', 'authoring', 'start', '--plan', planPath,
    ], workspace.root);
    const sessionId = sessionIdFrom(started.response);
    const manifestPath = path.join(workspace.packsRoot, NEW_ITEM_PLAN.pack.id, 'asset-pack.json');
    const original = readFileSync(manifestPath);
    const external = Buffer.from(`${original.toString('utf8')}\n`);
    writeFileSync(manifestPath, external);
    const externalDigest = sha256(external);

    const conflicted = await runJson([
      'asset', 'authoring', 'resume', '--session', sessionId,
    ], workspace.root);
    const conflictSession = createAssetAuthoringSessionStore(workspace).read(sessionId);
    expect(conflicted.code).toBe(0);
    expect(dataOf(conflicted.response)).toMatchObject({
      state: 'needs-user-action',
      phase: 'blocked',
      reason: 'manifest-conflict',
    });
    expect(conflictSession.conflict).toMatchObject({
      expectedDigest: expect.stringMatching(/^sha256:/u),
      actualDigest: externalDigest,
      resolution: 'unresolved',
    });

    const adopted = await runJson([
      'asset', 'authoring', 'reconcile-manifest', '--session', sessionId,
      '--use', 'external', '--expected-external-digest', externalDigest,
    ], workspace.root);
    const adoptedSession = createAssetAuthoringSessionStore(workspace).read(sessionId);
    expect(adopted.code).toBe(0);
    expect(adoptedSession.conflict).toBeNull();
    expect(adoptedSession.manifestDigest).toBe(externalDigest);

    writeFileSync(manifestPath, Buffer.from(`${external.toString('utf8')}changed`));
    const secondExternal = readFileSync(manifestPath);
    const secondDigest = sha256(secondExternal);
    await runJson(['asset', 'authoring', 'resume', '--session', sessionId], workspace.root);
    const restored = await runJson([
      'asset', 'authoring', 'reconcile-manifest', '--session', sessionId,
      '--use', 'session', '--expected-external-digest', secondDigest,
    ], workspace.root);

    expect(restored.code).toBe(0);
    expect(readFileSync(manifestPath)).toEqual(external);
  });

  it('rejects a plan whose execution scope names more than its declared pack', async () => {
    const workspace = createWorkspace('lpc-authoring-command-scope-');
    const invalidPlan = JSON.parse(JSON.stringify(NEW_ITEM_PLAN)) as JsonRecord;
    const scope = invalidPlan.scope as JsonRecord;
    scope.packId = 'other.pack';
    const planPath = writePlan(workspace.root, 'invalid-scope-plan.json', invalidPlan);

    const result = await runJson([
      'asset', 'authoring', 'start', '--plan', planPath,
    ], workspace.root);

    expect(result.code).toBe(1);
    expect(result.response).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: 'asset_authoring_plan_invalid' })],
    });
    expect(existsSync(path.join(workspace.stateRoot, 'authoring-sessions'))).toBe(false);
  });
});
