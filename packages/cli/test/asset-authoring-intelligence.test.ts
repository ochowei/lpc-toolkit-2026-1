import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import {
  authoringIntelligenceOperationDigestInput,
  createAuthoringIntelligenceOperationPlan,
  spriteDrawingContractV2DigestInput,
  type AuthoringIntelligenceOperationPlan,
  type SpriteDrawingContractV2,
} from '@lpc-toolkit/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/main.js';
import { nodeAssetPackPngDecoder } from '../src/asset-pack-node-runtime.js';
import { initializeAssetWorkspace } from '../src/asset-workspace.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

const temporaryDirectories: string[] = [];

function writeCatalog(root: string): string {
  const catalogPath = path.join(root, 'catalog.json');
  writeFileSync(catalogPath, JSON.stringify({
    schema: 'lpc-toolkit.asset-authoring-intelligence-catalog-snapshot.v1',
    items: [{
      itemId: 'hair/braid',
      typeName: 'hair',
      name: 'braid',
      displayName: 'Moon Braid',
      animations: ['walk'],
      variants: ['long'],
      recolorMaterials: ['hair'],
      hasAttribution: true,
      licenses: ['CC-BY-SA 4.0'],
    }],
  }, null, 2));
  return catalogPath;
}

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;

function digest(value: Uint8Array | string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function stableConsentScopeDigest(input: {
  readonly sessionId: string;
  readonly operationDigest: string;
  readonly targetIds: readonly string[];
  readonly inputCandidateDigests: readonly string[];
}): string {
  const scope = JSON.stringify({
    inputCandidateDigests: input.inputCandidateDigests,
    network: { enabled: false, hosts: [] },
    operationDigest: input.operationDigest,
    pathRoot: 'session-owned-candidate-staging',
    resourceLimits: { candidates: 32, inputBytes: 64 * 1024 * 1024, outputBytes: 64 * 1024 * 1024 },
    schema: 'lpc-toolkit.asset-authoring-intelligence-consent.v1',
    sessionId: input.sessionId,
    targetIds: input.targetIds,
  });
  return digest(scope);
}

function writeOperation(root: string, plan: AuthoringIntelligenceOperationPlan): string {
  const operationPath = path.join(root, 'operation.json');
  writeFileSync(operationPath, `${JSON.stringify(plan, null, 2)}\n`);
  return operationPath;
}

function writeConsent(
  root: string,
  input: {
    readonly sessionId: string;
    readonly operationDigest: string;
    readonly targetIds: readonly string[];
    readonly inputCandidateDigests: readonly string[];
  },
): string {
  const consentPath = path.join(root, 'consent.json');
  writeFileSync(consentPath, `${JSON.stringify({
    schema: 'lpc-toolkit.asset-authoring-intelligence-consent.v1',
    approved: true,
    sessionId: input.sessionId,
    operationDigest: input.operationDigest,
    scopeDigest: stableConsentScopeDigest(input),
    targetIds: input.targetIds,
    inputCandidateDigests: input.inputCandidateDigests,
    pathRoot: 'session-owned-candidate-staging',
    resourceLimits: { candidates: 32, inputBytes: 64 * 1024 * 1024, outputBytes: 64 * 1024 * 1024 },
    network: { enabled: false, hosts: [] },
  }, null, 2)}\n`);
  return consentPath;
}

interface FixtureTarget {
  readonly geometry: {
    readonly canvasWidth: number;
    readonly canvasHeight: number;
    readonly frameWidth: number;
    readonly frameHeight: number;
  };
  readonly cells: readonly {
    readonly sourceRow: number;
    readonly sourceColumn: number;
    readonly policy: string;
  }[];
}

function writeCandidate(
  root: string,
  target: FixtureTarget,
  fileName = 'candidate.png',
  fillStyle = 'rgba(80, 120, 160, 1)',
): { readonly path: string; readonly bytes: Buffer } {
  const candidatePath = path.join(root, fileName);
  const canvas = createCanvas(target.geometry.canvasWidth, target.geometry.canvasHeight);
  const context = canvas.getContext('2d');
  context.fillStyle = fillStyle;
  for (const cell of target.cells) {
    if (cell.policy === 'required-drawn') {
      context.fillRect(
        cell.sourceColumn * target.geometry.frameWidth,
        cell.sourceRow * target.geometry.frameHeight,
        target.geometry.frameWidth,
        target.geometry.frameHeight,
      );
    }
  }
  const bytes = canvas.toBuffer('image/png');
  writeFileSync(candidatePath, bytes);
  return { path: candidatePath, bytes };
}

async function createStageFixture(root: string, multiLayer = false): Promise<{
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly targetId: string;
  readonly contractDigest: string;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly target: FixtureTarget;
  readonly targets: readonly (FixtureTarget & { readonly id: string })[];
}> {
  const workspace = initializeAssetWorkspace(path.join(root, 'workspace'));
  const planPath = path.join(root, 'authoring-plan.json');
  writeFileSync(planPath, `${JSON.stringify({
    schema: 'lpc-toolkit.asset-authoring-plan.v1',
    goal: 'new-item',
    pack: { id: 'acme.d5-fixture', version: '1.0.0', displayName: 'ACME D5 Fixture' },
    asset: {
      kind: 'new-item',
      localId: 'moon-braid',
      displayName: 'Moon Braid',
      typeName: 'hair',
      bodyTypes: ['male'],
      animations: ['walk'],
      layers: [
        ...(multiLayer ? [{ id: 'background', zPos: 10, bodyTypes: ['male'] }] : []),
        { id: 'foreground', zPos: 120, bodyTypes: ['male'] },
      ],
    },
    scope: {
      packId: 'acme.d5-fixture',
      assetId: 'moon-braid',
      bodyTypes: ['male'],
      animations: ['walk'],
      paths: [
        ...(multiLayer ? ['sprites/moon-braid/background/walk.png'] : []),
        'sprites/moon-braid/foreground/walk.png',
      ],
    },
    consent: {
      approved: true,
      scope: {
        packId: 'acme.d5-fixture',
        assetId: 'moon-braid',
        bodyTypes: ['male'],
        animations: ['walk'],
        paths: [
          ...(multiLayer ? ['sprites/moon-braid/background/walk.png'] : []),
          'sprites/moon-braid/foreground/walk.png',
        ],
      },
    },
    provider: { id: 'human-fixture', tool: 'local-fixture', model: 'human-authored' },
    draftCredits: {
      authors: ['D5 Fixture Artist'],
      licenses: ['CC-BY-SA 4.0'],
      urls: ['https://example.test/d5-fixture'],
      notes: 'Local D5 staging fixture.',
    },
  }, null, 2)}\n`);
  const startStdout: string[] = [];
  const startCode = await runCli([
    'asset', 'authoring', 'start', '--plan', planPath, '--workspace', workspace.root, '--json',
  ], {
    cwd: root,
    stdout: (text) => startStdout.push(text),
    stderr: () => undefined,
  });
  expect(startCode).toBe(0);
  const started = JSON.parse(startStdout.join('')) as { readonly data: { readonly sessionId: string } };
  const sessionId = started.data.sessionId;
  const runtime = vi.fn(async () => ({} as RuntimeAssets));
  const contractStdout: string[] = [];
  const contractCode = await runCli([
    'asset', 'authoring', 'contract', '--session', sessionId, '--workspace', workspace.root, '--json',
  ], {
    cwd: root,
    stdout: (text) => contractStdout.push(text),
    stderr: () => undefined,
  }, { prepareRuntimeAssets: runtime });
  expect(contractCode).toBe(0);
  const contractResponse = JSON.parse(contractStdout.join('')) as {
    readonly data: {
      readonly checkpoint: { readonly digest: string };
      readonly artifacts: readonly { readonly id: string; readonly path: string }[];
    };
  };
  const contractArtifact = contractResponse.data.artifacts.find((artifact) => artifact.id === 'contract');
  expect(contractArtifact).toBeDefined();
  const contract = JSON.parse(readFileSync(contractArtifact!.path, 'utf8')) as {
    readonly targets: readonly (FixtureTarget & { readonly id: string })[];
  };
  return {
    workspaceRoot: workspace.root,
    sessionId,
    targetId: contract.targets[0]!.id,
    contractDigest: contractResponse.data.checkpoint.digest,
    canvasWidth: contract.targets[0]!.geometry.canvasWidth,
    canvasHeight: contract.targets[0]!.geometry.canvasHeight,
    target: contract.targets[0]!,
    targets: contract.targets,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('asset authoring intelligence CLI', () => {
  it('routes a catalog snapshot read-only without preparing workspace assets', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-d5-intelligence-route-'));
    const catalogPath = writeCatalog(cwd);
    const stdout: string[] = [];
    const stderr: string[] = [];
    const prepareRuntimeAssets = vi.fn(async () => {
      throw new Error('D5 route must not prepare runtime assets.');
    });

    const exitCode = await runCli([
      'asset', 'authoring', 'intelligence', 'route',
      '--request', 'Use the hair braid asset.',
      '--catalog', catalogPath,
      '--json',
    ], {
      cwd,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    }, { prepareRuntimeAssets });

    expect(exitCode).toBe(0);
    expect(prepareRuntimeAssets).not.toHaveBeenCalled();
    expect(stderr).toEqual([]);
    const response = JSON.parse(stdout.join('')) as {
      readonly data: {
        readonly route: {
          readonly outcome: string;
          readonly candidates: readonly { readonly itemId: string }[];
        };
      };
    };
    expect(response.data.route.outcome).toBe('compose-existing');
    expect(response.data.route.candidates.map((candidate) => candidate.itemId)).toEqual(['hair/braid']);
    expect(stdout.join('')).not.toContain('Use the hair braid asset.');
  });

  it('stages a digest-bound variant only after consent and leaves import/source mutation pending', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lpc-d5-intelligence-stage-'));
    temporaryDirectories.push(root);
    const fixture = await createStageFixture(root);
    const candidate = writeCandidate(root, fixture.target);
    const candidateDigest = digest(candidate.bytes);
    const draftPlan = createAuthoringIntelligenceOperationPlan({
      operationId: 'hair-moon-braid-long',
      operationKind: 'derive-variant',
      inputAssetIdentities: ['hair/moon-braid'],
      inputCandidateDigests: [candidateDigest],
      contractDigests: [fixture.contractDigest],
      catalogSnapshotDigest: DIGEST_B,
      normalizedParameters: {
        kind: 'derive-variant',
        sourceAssetIdentity: 'hair/moon-braid',
        variant: 'long',
      },
      outputTargetIdentities: [fixture.targetId],
      operationDigest: DIGEST_A,
    });
    const plan: AuthoringIntelligenceOperationPlan = {
      ...draftPlan,
      operationDigest: digest(authoringIntelligenceOperationDigestInput(draftPlan)),
    };
    const operationPath = writeOperation(root, plan);
    const consentPath = writeConsent(root, {
      sessionId: fixture.sessionId,
      operationDigest: plan.operationDigest,
      targetIds: plan.outputTargetIdentities,
      inputCandidateDigests: plan.inputCandidateDigests,
    });
    const stageArguments = [
      'asset', 'authoring', 'intelligence', 'stage',
      '--session', fixture.sessionId,
      '--operation', operationPath,
      '--candidate', candidate.path,
      '--consent', consentPath,
      '--workspace', fixture.workspaceRoot,
      '--json',
    ] as const;
    const pendingStdout: string[] = [];
    const pendingCode = await runCli(stageArguments, {
      cwd: root,
      stdout: (text) => pendingStdout.push(text),
      stderr: () => undefined,
    });
    expect(pendingCode).toBe(0);
    expect(JSON.parse(pendingStdout.join('')).data.status).toBe('needs-user-action');
    expect(existsSync(path.join(fixture.workspaceRoot, '.lpc-toolkit', 'asset-packs', 'authoring-sessions', fixture.sessionId, 'provider-candidates'))).toBe(false);
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runCli([...stageArguments.slice(0, -1), '--confirm', '--json'], {
      cwd: root,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    const response = JSON.parse(stdout.join('')) as {
      readonly data: {
        readonly status: string;
        readonly sourceMutation: boolean;
        readonly candidates: readonly [{ readonly relativePath: string }];
        readonly nextActions: readonly string[];
        readonly provenanceRecords: readonly [{ readonly kind: string; readonly operation: string; readonly resultDigest: string }];
      };
    };
    expect(response.data.status).toBe('staged');
    expect(response.data.sourceMutation).toBe(false);
    expect(response.data.nextActions).toEqual(['re-import-candidate']);
    expect(response.data.provenanceRecords[0]).toMatchObject({
      kind: 'source-transformation',
      operation: 'variant',
      resultDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    });
    expect(path.isAbsolute(response.data.candidates[0]!.relativePath)).toBe(false);
    expect(readFileSync(path.resolve(root, response.data.candidates[0]!.relativePath))).toEqual(candidate.bytes);
    expect(stdout.join('')).not.toContain(candidate.path);

    const replayStdout: string[] = [];
    const replayCode = await runCli([...stageArguments.slice(0, -1), '--confirm', '--json'], {
      cwd: root,
      stdout: (text) => replayStdout.push(text),
      stderr: () => undefined,
    });
    expect(replayCode).toBe(0);
    expect(JSON.parse(replayStdout.join('')).data.status).toBe('reused');

    writeFileSync(candidate.path, Buffer.from('changed candidate input'));
    const staleStdout: string[] = [];
    const staleCode = await runCli([...stageArguments.slice(0, -1), '--confirm', '--json'], {
      cwd: root,
      stdout: (text) => staleStdout.push(text),
      stderr: () => undefined,
    });
    expect(staleCode).toBe(0);
    expect(JSON.parse(staleStdout.join('')).data.refusal.code).toBe('asset_authoring_intelligence_input_drift');

    const recoverStdout: string[] = [];
    const recoverCode = await runCli([
      'asset', 'authoring', 'intelligence', 'recover',
      '--session', fixture.sessionId,
      '--operation-digest', plan.operationDigest,
      '--action', 'resume',
      '--workspace', fixture.workspaceRoot,
      '--json',
    ], {
      cwd: root,
      stdout: (text) => recoverStdout.push(text),
      stderr: () => undefined,
    });
    expect(recoverCode).toBe(0);
    expect(JSON.parse(recoverStdout.join('')).data.candidateCount).toBe(1);

    const stagedCandidatePath = path.resolve(root, response.data.candidates[0]!.relativePath);
    const stagedCandidateBytes = readFileSync(stagedCandidatePath);
    writeFileSync(stagedCandidatePath, Buffer.from('tampered staged candidate'));
    const tamperedRecoverStdout: string[] = [];
    const tamperedRecoverCode = await runCli([
      'asset', 'authoring', 'intelligence', 'recover',
      '--session', fixture.sessionId,
      '--operation-digest', plan.operationDigest,
      '--action', 'resume',
      '--workspace', fixture.workspaceRoot,
      '--json',
    ], {
      cwd: root,
      stdout: (text) => tamperedRecoverStdout.push(text),
      stderr: () => undefined,
    });
    expect(tamperedRecoverCode).toBe(1);
    expect(JSON.parse(tamperedRecoverStdout.join('')).errors[0].code).toBe('asset_authoring_intelligence_candidate_stale');
    writeFileSync(stagedCandidatePath, stagedCandidateBytes);

    const importStdout: string[] = [];
    const importCode = await runCli([
      'asset', 'authoring', 'import',
      '--session', fixture.sessionId,
      '--target', fixture.targetId,
      '--candidate', stagedCandidatePath,
      '--contract-digest', fixture.contractDigest,
      '--workspace', fixture.workspaceRoot,
      '--json',
    ], {
      cwd: root,
      stdout: (text) => importStdout.push(text),
      stderr: () => undefined,
    });
    expect(importCode, importStdout.join('')).toBe(0);
    expect(JSON.parse(importStdout.join('')).data.phase).toBe('imported');
    expect(existsSync(path.join(fixture.workspaceRoot, 'artist-packs', 'acme.d5-fixture', 'sprites', 'moon-braid', 'foreground', 'walk.png'))).toBe(true);

    const discardStdout: string[] = [];
    const discardCode = await runCli([
      'asset', 'authoring', 'intelligence', 'recover',
      '--session', fixture.sessionId,
      '--operation-digest', plan.operationDigest,
      '--action', 'discard',
      '--workspace', fixture.workspaceRoot,
      '--confirm',
      '--json',
    ], {
      cwd: root,
      stdout: (text) => discardStdout.push(text),
      stderr: () => undefined,
    });
    expect(discardCode).toBe(0);
    expect(JSON.parse(discardStdout.join('')).data.status).toBe('discarded');
    expect(existsSync(path.resolve(root, response.data.candidates[0]!.relativePath))).toBe(false);
  });

  it('materializes recolor bytes through the existing Core palette authority and preserves PNG alpha', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lpc-d5-intelligence-recolor-'));
    temporaryDirectories.push(root);
    const fixture = await createStageFixture(root);
    const candidate = writeCandidate(root, fixture.target);
    const candidateDigest = digest(candidate.bytes);
    const draftPlan = createAuthoringIntelligenceOperationPlan({
      operationId: 'hair-moon-braid-recolor',
      operationKind: 'derive-recolor',
      inputAssetIdentities: ['hair/moon-braid'],
      inputCandidateDigests: [candidateDigest],
      contractDigests: [fixture.contractDigest],
      catalogSnapshotDigest: DIGEST_B,
      normalizedParameters: {
        kind: 'derive-recolor',
        material: 'hair',
        sourceRamp: ['#5078a0'],
        targetRamp: ['#102030'],
      },
      outputTargetIdentities: [fixture.targetId],
      operationDigest: DIGEST_A,
    });
    const plan: AuthoringIntelligenceOperationPlan = {
      ...draftPlan,
      operationDigest: digest(authoringIntelligenceOperationDigestInput(draftPlan)),
    };
    const operationPath = writeOperation(root, plan);
    const consentPath = writeConsent(root, {
      sessionId: fixture.sessionId,
      operationDigest: plan.operationDigest,
      targetIds: plan.outputTargetIdentities,
      inputCandidateDigests: plan.inputCandidateDigests,
    });
    const stdout: string[] = [];
    const exitCode = await runCli([
      'asset', 'authoring', 'intelligence', 'stage',
      '--session', fixture.sessionId,
      '--operation', operationPath,
      '--candidate', candidate.path,
      '--consent', consentPath,
      '--workspace', fixture.workspaceRoot,
      '--confirm',
      '--json',
    ], {
      cwd: root,
      stdout: (text) => stdout.push(text),
      stderr: () => undefined,
    });
    expect(exitCode).toBe(0);
    const response = JSON.parse(stdout.join('')) as {
      readonly data: { readonly candidates: readonly [{ readonly relativePath: string }] };
    };
    const stagedBytes = readFileSync(path.resolve(root, response.data.candidates[0]!.relativePath));
    const decoded = await nodeAssetPackPngDecoder.decode(stagedBytes);
    const firstDrawnPixel = [...decoded.pixels].findIndex((value, index) => index % 4 === 3 && value > 0);
    expect(firstDrawnPixel).toBeGreaterThanOrEqual(3);
    const pixelStart = firstDrawnPixel - (firstDrawnPixel % 4);
    expect(Array.from(decoded.pixels.slice(pixelStart, pixelStart + 4))).toEqual([16, 32, 48, 255]);
  });

  it('stages custom geometry only when the explicit v2 contract remains compatible with the current v1 target', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lpc-d5-intelligence-geometry-'));
    temporaryDirectories.push(root);
    const fixture = await createStageFixture(root);
    const candidate = writeCandidate(root, fixture.target);
    const candidateDigest = digest(candidate.bytes);
    const geometryContract: SpriteDrawingContractV2 = {
      schema: 'lpc-toolkit.sprite-drawing-contract.v2',
      goal: 'extend-item',
      pack: { id: 'acme.d5-fixture', version: '1.0.0' },
      assetId: 'hair/moon-braid',
      typeName: 'hair',
      transparency: { encoding: 'png', colorModel: 'rgba', background: 'transparent' },
      canvas: {
        width: fixture.target.geometry.canvasWidth,
        height: fixture.target.geometry.canvasHeight,
      },
      frame: {
        width: fixture.target.geometry.frameWidth,
        height: fixture.target.geometry.frameHeight,
        count: 1,
      },
      cells: [{
        id: 'whole-canvas',
        row: 0,
        frame: 0,
        x: 0,
        y: 0,
        width: fixture.target.geometry.canvasWidth,
        height: fixture.target.geometry.canvasHeight,
        policy: 'optional-transparent',
      }],
      targets: [{
        id: fixture.targetId,
        path: 'sprites/moon-braid/foreground/walk.png',
        animation: 'walk',
        bodyTypes: ['male'],
        layerId: 'foreground',
        cellIds: ['whole-canvas'],
        inputDigests: [candidateDigest],
      }],
      layers: [{ id: 'foreground', zPos: 120, targetIds: [fixture.targetId], dependencies: [] }],
    };
    const geometryDigest = digest(spriteDrawingContractV2DigestInput(geometryContract));
    const draftPlan = createAuthoringIntelligenceOperationPlan({
      operationId: 'hair-moon-braid-geometry',
      operationKind: 'custom-geometry',
      inputAssetIdentities: ['hair/moon-braid'],
      inputCandidateDigests: [candidateDigest],
      contractDigests: [fixture.contractDigest, geometryDigest],
      catalogSnapshotDigest: DIGEST_B,
      normalizedParameters: { kind: 'custom-geometry', contract: geometryContract },
      outputTargetIdentities: [fixture.targetId],
      operationDigest: DIGEST_A,
    });
    const plan: AuthoringIntelligenceOperationPlan = {
      ...draftPlan,
      operationDigest: digest(authoringIntelligenceOperationDigestInput(draftPlan)),
    };
    const operationPath = writeOperation(root, plan);
    const consentPath = writeConsent(root, {
      sessionId: fixture.sessionId,
      operationDigest: plan.operationDigest,
      targetIds: plan.outputTargetIdentities,
      inputCandidateDigests: plan.inputCandidateDigests,
    });
    const stdout: string[] = [];
    const exitCode = await runCli([
      'asset', 'authoring', 'intelligence', 'stage',
      '--session', fixture.sessionId,
      '--operation', operationPath,
      '--candidate', candidate.path,
      '--consent', consentPath,
      '--workspace', fixture.workspaceRoot,
      '--confirm',
      '--json',
    ], {
      cwd: root,
      stdout: (text) => stdout.push(text),
      stderr: () => undefined,
    });
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.join('')).data.provenanceRecords[0].operation).toBe('custom-geometry');
  });

  it('stages multi-layer candidates independently and leaves each import explicit', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lpc-d5-intelligence-multi-layer-'));
    temporaryDirectories.push(root);
    const fixture = await createStageFixture(root, true);
    for (const target of fixture.targets) {
      mkdirSync(
        path.dirname(path.join(fixture.workspaceRoot, 'artist-packs', 'acme.d5-fixture', target.path)),
        { recursive: true },
      );
    }
    const backgroundTarget = fixture.targets.find((target) => target.path.includes('/background/'))!;
    const foregroundTarget = fixture.targets.find((target) => target.path.includes('/foreground/'))!;
    const backgroundCandidate = writeCandidate(root, backgroundTarget, 'candidate-background.png');
    const foregroundCandidate = writeCandidate(root, foregroundTarget, 'candidate-foreground.png', 'rgba(90, 120, 160, 1)');
    const backgroundDigest = digest(backgroundCandidate.bytes);
    const foregroundDigest = digest(foregroundCandidate.bytes);
    const draftPlan = createAuthoringIntelligenceOperationPlan({
      operationId: 'hair-moon-braid-layers',
      operationKind: 'multi-layer',
      inputAssetIdentities: ['hair/moon-braid'],
      inputCandidateDigests: [backgroundDigest, foregroundDigest],
      contractDigests: [fixture.contractDigest],
      catalogSnapshotDigest: DIGEST_B,
      normalizedParameters: {
        kind: 'multi-layer',
        layers: [
          {
            id: 'background',
            targetIdentity: backgroundTarget.id,
            zPos: 10,
            contractDigest: fixture.contractDigest,
            inputDigest: backgroundDigest,
            dependencies: [],
          },
          {
            id: 'foreground',
            targetIdentity: foregroundTarget.id,
            zPos: 120,
            contractDigest: fixture.contractDigest,
            inputDigest: foregroundDigest,
            dependencies: ['background'],
          },
        ],
      },
      outputTargetIdentities: [backgroundTarget.id, foregroundTarget.id],
      operationDigest: DIGEST_A,
    });
    const plan: AuthoringIntelligenceOperationPlan = {
      ...draftPlan,
      operationDigest: digest(authoringIntelligenceOperationDigestInput(draftPlan)),
    };
    const operationPath = writeOperation(root, plan);
    const consentPath = writeConsent(root, {
      sessionId: fixture.sessionId,
      operationDigest: plan.operationDigest,
      targetIds: plan.outputTargetIdentities,
      inputCandidateDigests: plan.inputCandidateDigests,
    });
    const candidates = [backgroundCandidate, foregroundCandidate].sort((left, right) =>
      digest(left.bytes).localeCompare(digest(right.bytes)));
    const stdout: string[] = [];
    const exitCode = await runCli([
      'asset', 'authoring', 'intelligence', 'stage',
      '--session', fixture.sessionId,
      '--operation', operationPath,
      '--candidate', candidates[0]!.path,
      '--candidate', candidates[1]!.path,
      '--consent', consentPath,
      '--workspace', fixture.workspaceRoot,
      '--confirm',
      '--json',
    ], {
      cwd: root,
      stdout: (text) => stdout.push(text),
      stderr: () => undefined,
    });
    expect(exitCode).toBe(0);
    const response = JSON.parse(stdout.join('')) as {
      readonly data: {
        readonly candidates: readonly { readonly targetId: string; readonly digest: string; readonly relativePath: string }[];
        readonly provenanceRecords: readonly { readonly targetId: string; readonly operation: string; readonly referenceDigests: readonly string[] }[];
      };
    };
    expect(response.data.candidates.map((candidate) => candidate.targetId)).toEqual(
      [backgroundTarget.id, foregroundTarget.id].sort((left, right) => left.localeCompare(right)),
    );
    expect(response.data.provenanceRecords).toHaveLength(2);
    for (const record of response.data.provenanceRecords) {
      expect(record.operation).toBe('multi-layer');
      expect(record.referenceDigests).toContain(plan.operationDigest);
    }

    for (const staged of response.data.candidates) {
      const importStdout: string[] = [];
      const importCode = await runCli([
        'asset', 'authoring', 'import',
        '--session', fixture.sessionId,
        '--target', staged.targetId,
        '--candidate', path.resolve(root, staged.relativePath),
        '--contract-digest', fixture.contractDigest,
        '--workspace', fixture.workspaceRoot,
        '--json',
      ], {
        cwd: root,
        stdout: (text) => importStdout.push(text),
        stderr: () => undefined,
      });
      expect(importCode, importStdout.join('')).toBe(0);
    }
  });
});
