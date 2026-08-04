import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { standardAnimationGeometry, type AnimationName } from '@lpc-toolkit/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import {
  createAssetAuthoringSessionStore,
  deriveAuthoringInvalidationDecisions,
  assetAuthoringSessionPath,
  type AssetAuthoringEvidence,
} from '../src/asset-authoring-session.js';
import { createRuntimeContext } from '../src/context.js';
import {
  AssetPackPreviewError,
  captureAssetPackPreviewArtifacts,
} from '../src/asset-pack-preview.js';
import { validateAssetPackDirectory } from '../src/asset-pack-validation.js';
import { initializeAssetWorkspace } from '../src/asset-workspace.js';
import { runCli } from '../src/main.js';
import type { AssetPackValidationReport } from '../src/asset-pack-validation.js';
import type { AuthoringResponseData, CliResponse } from '../src/response.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

const temporaryDirectories: string[] = [];
const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const DIGEST_C = `sha256:${'c'.repeat(64)}`;
const DIGEST_D = `sha256:${'d'.repeat(64)}`;

const PLAN = {
  schema: 'lpc-toolkit.asset-authoring-plan.v1',
  goal: 'new-item',
  pack: {
    id: 'acme.receipts-fixture',
    version: '1.0.0',
    displayName: 'ACME Receipts Fixture',
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
    packId: 'acme.receipts-fixture',
    assetId: 'moon-braid',
    bodyTypes: ['male'],
    animations: ['walk'],
    paths: ['sprites/moon-braid/foreground/walk.png'],
  },
  draftCredits: {
    authors: ['Receipt Artist'],
    licenses: ['CC-BY-SA 4.0'],
    urls: ['https://example.test/receipts-fixture'],
    notes: 'Receipt fixture attribution.',
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

function geometryBounds(animation: AnimationName): { readonly width: number; readonly height: number } {
  const geometry = standardAnimationGeometry(animation);
  const maxColumn = Math.max(
    ...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)),
  );
  return {
    width: (maxColumn + 1) * geometry.frameSize,
    height: geometry.rows.length * geometry.frameSize,
  };
}

function writeSheetPng(filePath: string, animation: AnimationName, color: string): void {
  const bounds = geometryBounds(animation);
  const canvas = createCanvas(bounds.width, bounds.height);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, bounds.width, bounds.height);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, canvas.toBuffer('image/png'));
}

function createRuntime(
  root: string,
  workspaceRoot: string,
  prepared = false,
): RuntimeAssets {
  const assetsRoot = path.join(root, 'assets');
  mkdirSync(assetsRoot, { recursive: true });
  if (prepared) {
    writeJson(path.join(assetsRoot, 'sheet_definitions/body/body.json'), {
      name: 'Body Color',
      type_name: 'body',
      animations: ['walk'],
      credits: [{
        file: 'body/base',
        authors: ['Base Body Artist'],
        licenses: ['GPL 3.0'],
        urls: ['https://example.test/base-body'],
        notes: '',
      }],
      recolors: { material: 'skin', palettes: ['ulpc'] },
      layer_1: { zPos: 10, male: 'body/base/' },
    });
    writeSheetPng(path.join(assetsRoot, 'spritesheets/body/base/walk.png'), 'walk', '#775533');
    writeJson(path.join(assetsRoot, 'sheet_definitions/hair/hair_messy.json'), {
      name: 'Messy',
      type_name: 'hair',
      animations: ['walk'],
      credits: [{
        file: 'hair/messy',
        authors: ['Base Hair Artist'],
        licenses: ['GPL 3.0'],
        urls: ['https://example.test/base-hair'],
        notes: '',
      }],
      layer_1: { zPos: 50, male: 'hair/messy/' },
    });
    writeSheetPng(path.join(assetsRoot, 'spritesheets/hair/messy/walk.png'), 'walk', '#553311');
    writeJson(path.join(assetsRoot, 'palette_definitions/skin/meta_skin.json'), {
      type: 'material',
      default: 'ulpc',
      base: 'light',
    });
    writeJson(path.join(assetsRoot, 'palette_definitions/skin/skin_ulpc.json'), {
      light: ['#775533'],
    });
    writeFileSync(
      path.join(assetsRoot, 'CREDITS.csv'),
      'filename,notes,authors,licenses,urls\n',
    );
  }
  const store = createDirectoryAssetStore(assetsRoot);
  return {
    context: createRuntimeContext({
      cwd: workspaceRoot,
      assetsRoot,
      customAssetsRoot: path.join(workspaceRoot, 'assets_custom'),
      spritesheetsBaseUrl: store.baseUrl,
    }),
    store,
    source: 'working-directory',
  };
}

function writePlan(root: string): string {
  const planPath = path.join(root, 'plan.json');
  writeFileSync(planPath, `${JSON.stringify(PLAN, null, 2)}\n`);
  return planPath;
}

async function runJson<T>(
  argv: readonly string[],
  cwd: string,
  prepareRuntimeAssets?: (options: {
    readonly cwd: string;
    readonly managedCacheOnly?: boolean;
  }) => Promise<RuntimeAssets>,
): Promise<{ readonly code: number; readonly response: CliResponse<T> }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli([...argv, '--json'], {
    cwd,
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  }, prepareRuntimeAssets === undefined ? {} : { prepareRuntimeAssets });
  expect(stderr).toEqual([]);
  return {
    code,
    response: JSON.parse(stdout.join('')) as CliResponse<T>,
  };
}

function dataOf(response: CliResponse<AuthoringResponseData>): AuthoringResponseData {
  if (!response.data) throw new Error('Expected authoring response data.');
  return response.data;
}

interface ContractDocument {
  readonly targets: readonly [{
    readonly id: string;
    readonly geometry: {
      readonly canvasWidth: number;
      readonly canvasHeight: number;
      readonly frameWidth: number;
      readonly frameHeight: number;
    };
    readonly path: string;
    readonly cells: readonly {
      readonly policy: string;
      readonly sourceRow: number;
      readonly sourceColumn: number;
    }[];
  }];
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)] as const),
  );
}

function creditDigest(manifest: Record<string, unknown>): string {
  return sha256(Buffer.from(JSON.stringify(canonicalize({
    credits: manifest.credits,
    creditOverrides: manifest.creditOverrides ?? {},
  }))));
}

function writeCandidate(filePath: string, target: ContractDocument['targets'][number]): Buffer {
  const canvas = createCanvas(target.geometry.canvasWidth, target.geometry.canvasHeight);
  const context = canvas.getContext('2d');
  target.cells.forEach((cell) => {
    if (cell.policy === 'required-transparent') return;
    context.fillStyle = `rgb(${40 + cell.sourceRow * 17}, ${80 + cell.sourceColumn * 13}, 150)`;
    context.fillRect(
      cell.sourceColumn * target.geometry.frameWidth + 8,
      cell.sourceRow * target.geometry.frameHeight + 8,
      target.geometry.frameWidth - 16,
      target.geometry.frameHeight - 16,
    );
  });
  const bytes = canvas.toBuffer('image/png');
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, bytes);
  return bytes;
}

async function createImportedFixture(): Promise<{
  readonly workspace: ReturnType<typeof initializeAssetWorkspace>;
  readonly runtime: RuntimeAssets;
  readonly sessionId: string;
  readonly packRoot: string;
}> {
  const root = createDirectory('lpc-authoring-receipts-imported-');
  const workspace = initializeAssetWorkspace(path.join(root, 'workspace'));
  const runtime = createRuntime(path.join(root, 'runtime'), workspace.root, true);
  const started = await runJson<AuthoringResponseData>([
    'asset', 'authoring', 'start', '--plan', writePlan(root),
  ], workspace.root);
  const sessionId = dataOf(started.response).sessionId;
  const contract = await runJson<AuthoringResponseData>([
    'asset', 'authoring', 'contract', '--session', sessionId,
  ], workspace.root, async () => runtime);
  const contractData = dataOf(contract.response);
  const contractArtifact = contractData.artifacts.find((artifact) => artifact.id === 'contract');
  if (!contractArtifact) throw new Error('Expected contract artifact.');
  const contractDocument = JSON.parse(readFileSync(contractArtifact.path, 'utf8')) as ContractDocument;
  const target = contractDocument.targets[0];
  const candidatePath = path.join(workspace.root, 'candidate.png');
  const candidateBytes = writeCandidate(candidatePath, target);
  const imported = await runJson<AuthoringResponseData>([
    'asset', 'authoring', 'import',
    '--session', sessionId,
    '--target', target.id,
    '--candidate', candidatePath,
    '--contract-digest', sha256(readFileSync(contractArtifact.path)),
  ], workspace.root);
  expect(imported.code).toBe(0);
  expect(readFileSync(candidatePath)).toEqual(candidateBytes);
  return {
    workspace,
    runtime,
    sessionId,
    packRoot: path.join(workspace.packsRoot, PLAN.pack.id),
  };
}

async function acknowledgeOptionalFrameWarning(fixture: Awaited<ReturnType<typeof createImportedFixture>>): Promise<void> {
  const validation = await runJson<AuthoringResponseData>([
    'asset', 'authoring', 'validate', '--session', fixture.sessionId,
  ], fixture.workspace.root, async () => fixture.runtime);
  const report = dataOf(validation.response).validation;
  if (!report || report.acknowledgementRecords.length === 0) {
    throw new Error('Expected an acknowledgement template before preview.');
  }
  const manifestPath = path.join(fixture.packRoot, 'asset-pack.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  writeJson(manifestPath, {
    ...manifest,
    acknowledgements: report.acknowledgementRecords.map((record) => ({
      ...record,
      reason: 'Reviewed the optional padding frame evidence.',
    })),
  });
  const manifestDigest = sha256(readFileSync(manifestPath));
  const resumed = await runJson<AuthoringResponseData>([
    'asset', 'authoring', 'resume', '--session', fixture.sessionId,
  ], fixture.workspace.root);
  expect(resumed.code).toBe(0);
  expect(dataOf(resumed.response).reason).toBe('manifest-conflict');
  const reconciled = await runJson<AuthoringResponseData>([
    'asset', 'authoring', 'reconcile-manifest',
    '--session', fixture.sessionId,
    '--use', 'external',
    '--expected-external-digest', manifestDigest,
  ], fixture.workspace.root);
  expect(reconciled.code).toBe(0);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('asset authoring validation and preview receipts', () => {
  it('returns the leaf validation report, warnings, and acknowledgement templates', async () => {
    const root = createDirectory('lpc-authoring-receipts-validation-');
    const workspace = initializeAssetWorkspace(path.join(root, 'workspace'));
    const runtime = createRuntime(path.join(root, 'runtime'), workspace.root);
    const planPath = writePlan(root);

    const started = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'start', '--plan', planPath,
    ], workspace.root);
    expect(started.code).toBe(0);
    const sessionId = dataOf(started.response).sessionId;
    const packRoot = path.join(workspace.packsRoot, PLAN.pack.id);

    const leaf = await validateAssetPackDirectory({
      packDirectory: packRoot,
      workspace,
      runtime,
    });
    const authoring = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'validate', '--session', sessionId,
    ], workspace.root, async () => runtime);

    expect(authoring.code).toBe(0);
    const data = dataOf(authoring.response);
    expect(data).toMatchObject({
      phase: 'validated',
      validation: {
        schema: leaf.schema,
        packDirectory: leaf.packDirectory,
        contentDigest: leaf.contentDigest,
        valid: leaf.valid,
        diagnostics: leaf.diagnostics,
        acknowledgementRecords: leaf.acknowledgementRecords,
      },
    });
    expect(data.validation).toEqual(leaf);
    expect(authoring.response.warnings).toEqual([]);
    expect((data.validation as AssetPackValidationReport).acknowledgementRecords)
      .toEqual(leaf.acknowledgementRecords);
    expect(createAssetAuthoringSessionStore(workspace).read(sessionId).receipts.validation)
      .toBeNull();
    expect(readFileSync(path.join(packRoot, 'asset-pack.json'))).toBeTruthy();
  });

  it('records a validation receipt only after capturing the exact manifest and all sources', async () => {
    const fixture = await createImportedFixture();
    const leaf = await validateAssetPackDirectory({
      packDirectory: fixture.packRoot,
      workspace: fixture.workspace,
      runtime: fixture.runtime,
    });
    expect(leaf.valid).toBe(false);
    expect(leaf.acknowledgementRecords).toHaveLength(1);
    expect(leaf.manifestDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(leaf.sourceDigests).toHaveLength(1);

    const result = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'validate', '--session', fixture.sessionId,
    ], fixture.workspace.root, async () => fixture.runtime);
    const data = dataOf(result.response);
    const session = createAssetAuthoringSessionStore(fixture.workspace).read(fixture.sessionId);

    expect(result.code).toBe(0);
    expect(data.validation).toEqual(leaf);
    expect(session.receipts.validation).toEqual({
      id: leaf.contentDigest,
      manifestDigest: leaf.manifestDigest,
      sourceDigests: leaf.sourceDigests,
    });
    expect(data.nextActions).toEqual([
      expect.objectContaining({ id: 'validate-session', safety: 'safe' }),
    ]);
  });

  it('requires confirmation and persists one exact acknowledgement atomically and idempotently', async () => {
    const fixture = await createImportedFixture();
    const validation = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'validate', '--session', fixture.sessionId,
    ], fixture.workspace.root, async () => fixture.runtime);
    const validationData = dataOf(validation.response);
    const template = validationData.validation?.acknowledgementRecords[0];
    if (!template) throw new Error('Expected one acknowledgement template.');

    const acknowledgementPath = path.join(fixture.workspace.root, 'acknowledgement.json');
    const acknowledgement = {
      ...template,
      reason: 'Reviewed the optional padding frame evidence and accept the destination.',
    };
    writeJson(acknowledgementPath, acknowledgement);
    const manifestPath = path.join(fixture.packRoot, 'asset-pack.json');
    const sessionPath = assetAuthoringSessionPath(fixture.workspace, fixture.sessionId);
    const beforeManifest = readFileSync(manifestPath);
    const beforeSession = readFileSync(sessionPath);

    const pending = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'acknowledge',
      '--session', fixture.sessionId,
      '--acknowledgement', acknowledgementPath,
    ], fixture.workspace.root, async () => fixture.runtime);
    expect(pending.code).toBe(0);
    expect(dataOf(pending.response)).toMatchObject({
      state: 'needs-user-action',
      reason: 'acknowledgement-confirmation-required',
      nextActions: [expect.objectContaining({
        id: 'acknowledge-session',
        safety: 'requires-confirmation',
      })],
    });
    expect(readFileSync(manifestPath)).toEqual(beforeManifest);
    expect(readFileSync(sessionPath)).toEqual(beforeSession);

    const accepted = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'acknowledge',
      '--session', fixture.sessionId,
      '--acknowledgement', acknowledgementPath,
      '--confirm',
    ], fixture.workspace.root, async () => fixture.runtime);
    expect(accepted.code).toBe(0);
    const acceptedData = dataOf(accepted.response);
    expect(acceptedData).toMatchObject({
      state: 'needs-user-action',
      reason: 'acknowledgement-current',
      phase: 'validated',
      validation: { valid: true },
    });
    const persistedManifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      readonly acknowledgements?: readonly Record<string, unknown>[];
    };
    expect(persistedManifest.acknowledgements).toEqual([acknowledgement]);
    const stored = createAssetAuthoringSessionStore(fixture.workspace).read(fixture.sessionId);
    expect(stored.receipts.acknowledgements).toMatchObject({
      id: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      manifestDigest: sha256(readFileSync(manifestPath)),
      sourceDigests: acceptedData.validation?.sourceDigests,
      recordDigests: [expect.stringMatching(/^sha256:[0-9a-f]{64}$/u)],
    });

    const afterManifest = readFileSync(manifestPath);
    const afterSession = readFileSync(sessionPath);
    const repeated = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'acknowledge',
      '--session', fixture.sessionId,
      '--acknowledgement', acknowledgementPath,
      '--confirm',
    ], fixture.workspace.root, async () => fixture.runtime);
    expect(repeated.code).toBe(0);
    expect(readFileSync(manifestPath)).toEqual(afterManifest);
    expect(readFileSync(sessionPath)).toEqual(afterSession);
  }, 30000);

  it('refuses malformed or out-of-scope acknowledgement records without changing bytes', async () => {
    const fixture = await createImportedFixture();
    const validation = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'validate', '--session', fixture.sessionId,
    ], fixture.workspace.root, async () => fixture.runtime);
    const template = dataOf(validation.response).validation?.acknowledgementRecords[0];
    if (!template) throw new Error('Expected one acknowledgement template.');

    const acknowledgementPath = path.join(fixture.workspace.root, 'acknowledgement.json');
    const manifestPath = path.join(fixture.packRoot, 'asset-pack.json');
    const sessionPath = assetAuthoringSessionPath(fixture.workspace, fixture.sessionId);
    const beforeManifest = readFileSync(manifestPath);
    const beforeSession = readFileSync(sessionPath);

    writeJson(acknowledgementPath, { ...template, reason: '   ' });
    const malformed = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'acknowledge',
      '--session', fixture.sessionId,
      '--acknowledgement', acknowledgementPath,
      '--confirm',
    ], fixture.workspace.root, async () => fixture.runtime);
    expect(malformed.code).toBe(1);
    expect(malformed.response.errors[0]?.code).toBe('asset_authoring_acknowledgement_invalid');
    expect(readFileSync(manifestPath)).toEqual(beforeManifest);
    expect(readFileSync(sessionPath)).toEqual(beforeSession);

    writeJson(acknowledgementPath, {
      ...template,
      reason: 'Reviewed the current warning.',
      ambientIdentity: 'must-not-be-inferred',
    });
    const unknownField = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'acknowledge',
      '--session', fixture.sessionId,
      '--acknowledgement', acknowledgementPath,
      '--confirm',
    ], fixture.workspace.root, async () => fixture.runtime);
    expect(unknownField.code).toBe(1);
    expect(unknownField.response.errors[0]?.code).toBe('asset_authoring_acknowledgement_invalid');
    expect(readFileSync(manifestPath)).toEqual(beforeManifest);
    expect(readFileSync(sessionPath)).toEqual(beforeSession);

    writeJson(acknowledgementPath, {
      ...template,
      contentDigest: DIGEST_A,
      reason: 'This digest is not for the current warning.',
    });
    const outOfScope = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'acknowledge',
      '--session', fixture.sessionId,
      '--acknowledgement', acknowledgementPath,
      '--confirm',
    ], fixture.workspace.root, async () => fixture.runtime);
    expect(outOfScope.code).toBe(1);
    expect(outOfScope.response.errors[0]?.code).toBe(
      'asset_authoring_acknowledgement_out_of_scope',
    );
    expect(readFileSync(manifestPath)).toEqual(beforeManifest);
    expect(readFileSync(sessionPath)).toEqual(beforeSession);
  }, 30000);

  it('requires an explicit declaration file through the public argv seam', async () => {
    const fixture = await createImportedFixture();
    const result = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'declare', '--session', fixture.sessionId,
    ], fixture.workspace.root, async () => fixture.runtime);

    expect(result.code).toBe(1);
    expect(result.response.errors).toEqual([expect.objectContaining({
      code: 'missing_argument',
      path: '--declaration',
    })]);
  });

  it('pauses declaration until fresh validation and exact acknowledgement evidence exist', async () => {
    const fixture = await createImportedFixture();
    const manifestPath = path.join(fixture.packRoot, 'asset-pack.json');
    const manifestBytes = readFileSync(manifestPath);
    const manifest = JSON.parse(manifestBytes.toString('utf8')) as Record<string, unknown>;
    const declarationPath = path.join(fixture.workspace.root, 'declaration.json');
    writeJson(declarationPath, {
      schema: 'lpc-toolkit.asset-release-declaration.v1',
      expectedManifestDigest: sha256(manifestBytes),
      declarant: {
        displayName: 'Alice Example',
        kind: 'person',
        role: 'authorized-release-declarant',
      },
      authorAndSource: { confirmed: true, creditDigest: creditDigest(manifest) },
      licenseAuthority: { confirmed: true, creditDigest: creditDigest(manifest) },
      acknowledgements: {
        confirmed: true,
        contentDigest: DIGEST_A,
        recordDigests: [DIGEST_B],
      },
    });
    const sessionPath = assetAuthoringSessionPath(fixture.workspace, fixture.sessionId);
    const before = readFileSync(sessionPath);

    const result = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'declare',
      '--session', fixture.sessionId,
      '--declaration', declarationPath,
      '--confirm',
    ], fixture.workspace.root, async () => fixture.runtime);
    const data = dataOf(result.response);

    expect(result.code).toBe(0);
    expect(data).toMatchObject({
      state: 'needs-user-action',
      reason: 'validation-receipt-stale',
      releaseDeclaration: null,
      nextActions: [expect.objectContaining({ id: 'validate-session' })],
    });
    expect(readFileSync(sessionPath)).toEqual(before);
  }, 30000);

  it('requires confirmation and records an attributed human declaration idempotently', async () => {
    const fixture = await createImportedFixture();
    const validation = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'validate', '--session', fixture.sessionId,
    ], fixture.workspace.root, async () => fixture.runtime);
    const validationData = dataOf(validation.response);
    const validationReport = validationData.validation;
    if (!validationReport || validationReport.acknowledgementRecords.length === 0) {
      throw new Error('Expected a warning template before declaration.');
    }

    const acknowledgementPath = path.join(fixture.workspace.root, 'acknowledgement.json');
    writeJson(acknowledgementPath, {
      ...validationReport.acknowledgementRecords[0],
      reason: 'Reviewed the optional padding frame evidence and accept the destination.',
    });
    const acknowledged = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'acknowledge',
      '--session', fixture.sessionId,
      '--acknowledgement', acknowledgementPath,
      '--confirm',
    ], fixture.workspace.root, async () => fixture.runtime);
    expect(acknowledged.code).toBe(0);

    const manifestPath = path.join(fixture.packRoot, 'asset-pack.json');
    const manifestBytes = readFileSync(manifestPath);
    const manifest = JSON.parse(manifestBytes.toString('utf8')) as Record<string, unknown>;
    const storedSession = createAssetAuthoringSessionStore(fixture.workspace).read(fixture.sessionId);
    const acknowledgementReceipt = storedSession.receipts.acknowledgements;
    const currentValidation = dataOf(acknowledged.response).validation;
    if (!currentValidation || !acknowledgementReceipt) {
      throw new Error('Expected current validation and acknowledgement receipts.');
    }
    const declarationPath = path.join(fixture.workspace.root, 'declaration.json');
    writeJson(declarationPath, {
      schema: 'lpc-toolkit.asset-release-declaration.v1',
      expectedManifestDigest: sha256(manifestBytes),
      declarant: {
        displayName: 'Alice Example',
        kind: 'person',
        role: 'authorized-release-declarant',
      },
      authorAndSource: {
        confirmed: true,
        creditDigest: creditDigest(manifest),
      },
      licenseAuthority: {
        confirmed: true,
        creditDigest: creditDigest(manifest),
      },
      acknowledgements: {
        confirmed: true,
        contentDigest: currentValidation.contentDigest,
        recordDigests: acknowledgementReceipt.recordDigests,
      },
    });

    const sessionPath = assetAuthoringSessionPath(fixture.workspace, fixture.sessionId);
    const beforePending = readFileSync(sessionPath);
    const pending = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'declare',
      '--session', fixture.sessionId,
      '--declaration', declarationPath,
    ], fixture.workspace.root, async () => fixture.runtime);
    const pendingData = dataOf(pending.response);
    expect(pending.code).toBe(0);
    expect(pendingData).toMatchObject({
      state: 'needs-user-action',
      reason: 'release-declaration-confirmation-required',
      releaseDeclaration: null,
      nextActions: [expect.objectContaining({
        id: 'declare-release',
        safety: 'requires-confirmation',
      })],
    });
    expect(pendingData.releaseGates.gates).toContainEqual({
      id: 'releaseDeclaration',
      freshness: 'missing',
    });
    expect(readFileSync(sessionPath)).toEqual(beforePending);

    const accepted = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'declare',
      '--session', fixture.sessionId,
      '--declaration', declarationPath,
      '--confirm',
    ], fixture.workspace.root, async () => fixture.runtime);
    const acceptedData = dataOf(accepted.response);
    expect(accepted.code).toBe(0);
    expect(acceptedData).toMatchObject({
      state: 'needs-user-action',
      reason: 'release-declaration-current',
      releaseDeclaration: {
        kind: 'declaration',
        declarant: { displayName: 'Alice Example' },
        manifestDigest: sha256(manifestBytes),
        validationReceiptId: storedSession.receipts.validation?.id,
      },
    });
    expect(acceptedData.releaseGates.gates).toContainEqual({
      id: 'releaseDeclaration',
      freshness: 'current',
    });
    const persistedSession = readFileSync(sessionPath);
    const persisted = createAssetAuthoringSessionStore(fixture.workspace).read(fixture.sessionId);
    expect(persisted.receipts.releaseDeclaration).toEqual(acceptedData.releaseDeclaration);

    const repeated = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'declare',
      '--session', fixture.sessionId,
      '--declaration', declarationPath,
      '--confirm',
    ], fixture.workspace.root, async () => fixture.runtime);
    expect(repeated.code).toBe(0);
    expect(readFileSync(sessionPath)).toEqual(persistedSession);

    const declaration = JSON.parse(readFileSync(declarationPath, 'utf8')) as Record<string, unknown>;
    writeJson(declarationPath, {
      ...declaration,
      expectedManifestDigest: DIGEST_A,
    });
    const beforeStale = readFileSync(sessionPath);
    const stale = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'declare',
      '--session', fixture.sessionId,
      '--declaration', declarationPath,
      '--confirm',
    ], fixture.workspace.root, async () => fixture.runtime);
    expect(stale.code).toBe(1);
    expect(stale.response.errors[0]?.code).toBe('asset_authoring_declaration_stale');
    expect(readFileSync(sessionPath)).toEqual(beforeStale);

    writeJson(declarationPath, {
      ...declaration,
      licenseAuthority: {
        confirmed: true,
        creditDigest: DIGEST_A,
      },
    });
    const beforeCreditMismatch = readFileSync(sessionPath);
    const creditMismatch = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'declare',
      '--session', fixture.sessionId,
      '--declaration', declarationPath,
      '--confirm',
    ], fixture.workspace.root, async () => fixture.runtime);
    expect(creditMismatch.code).toBe(1);
    expect(creditMismatch.response.errors[0]?.code).toBe('asset_authoring_credit_digest_mismatch');
    expect(readFileSync(sessionPath)).toEqual(beforeCreditMismatch);
  }, 30000);

  it('records attributed preview paths and digests from the current validation receipt', async () => {
    const fixture = await createImportedFixture();
    await acknowledgeOptionalFrameWarning(fixture);

    const result = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'preview', '--session', fixture.sessionId,
    ], fixture.workspace.root, async () => fixture.runtime);
    const data = dataOf(result.response);
    const preview = data.preview;
    const session = createAssetAuthoringSessionStore(fixture.workspace).read(fixture.sessionId);

    expect(result.code).toBe(0);
    expect(data).toMatchObject({
      phase: 'previewed',
      reason: 'preview-current',
      validation: { valid: true },
    });
    expect(preview).toBeDefined();
    if (!preview) throw new Error('Expected a preview receipt projection.');
    expect(preview.input).toMatchObject({
      assetId: null,
      animation: null,
      bodyType: null,
      characterPath: null,
      digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    });
    expect(preview.validationRevision).toBe(session.receipts.validation?.id);
    expect(preview.manifestDigest).toBe(session.receipts.validation?.manifestDigest);
    expect(preview.sourceDigests).toEqual(session.receipts.validation?.sourceDigests);
    expect(preview.artifacts.map((artifact) => artifact.id)).toEqual([
      'preview:preview',
      'preview:credits_txt',
      'preview:credits_csv',
      'preview:metadata',
    ]);
    for (const artifact of preview.artifacts) {
      expect(readFileSync(artifact.path)).toBeTruthy();
      expect(artifact.digest).toBe(sha256(readFileSync(artifact.path)));
    }
    expect(result.response.warnings).toEqual(preview.warnings);
    expect(session.receipts.preview).toEqual({
      id: preview.input.digest,
      manifestDigest: preview.manifestDigest,
      sourceDigests: preview.sourceDigests,
      inputDigest: preview.input.digest,
    });
    expect(data).not.toHaveProperty('plan');
    expect(data).not.toHaveProperty('provenance');
  }, 30000);

  it('fails the preview checkpoint when a required attributed artifact is missing', () => {
    const root = createDirectory('lpc-authoring-receipts-artifact-');
    const previewPath = path.join(root, 'preview.png');
    writeFileSync(previewPath, Buffer.from('png-placeholder'));
    const result = {
      packId: 'acme.receipts-fixture',
      assetId: 'moon-braid',
      artifacts: [{ type: 'preview' as const, path: previewPath }],
      warnings: [],
      metadataPath: path.join(root, 'metadata.json'),
      outDir: root,
    };

    let failure: unknown;
    try {
      captureAssetPackPreviewArtifacts(result);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AssetPackPreviewError);
    expect(failure).toMatchObject({ code: 'asset_preview_artifacts_incomplete' });
  });

  it('marks manifest, source, validation, and preview-input drift with one safe recovery action', async () => {
    const evidence: AssetAuthoringEvidence = {
      manifestDigest: DIGEST_A,
      contractDigest: DIGEST_A,
      sourceDigests: [{ path: 'sprites/source.png', digest: DIGEST_A }],
      validationReceipt: {
        id: 'validation-1',
        manifestDigest: DIGEST_A,
        sourceDigests: [{ path: 'sprites/source.png', digest: DIGEST_A }],
      },
      previewReceipt: {
        id: 'preview-1',
        manifestDigest: DIGEST_A,
        sourceDigests: [{ path: 'sprites/source.png', digest: DIGEST_A }],
        inputDigest: DIGEST_C,
      },
    };
    const current: AssetAuthoringEvidence = {
      ...evidence,
      manifestDigest: DIGEST_B,
      sourceDigests: [{ path: 'sprites/source.png', digest: DIGEST_B }],
      validationReceipt: {
        ...evidence.validationReceipt!,
      },
      previewReceipt: {
        ...evidence.previewReceipt!,
      },
      previewInputDigest: DIGEST_D,
    };

    expect(deriveAuthoringInvalidationDecisions(evidence, current)).toEqual([
      { checkpoint: 'manifest', reason: 'manifest-semantic-drift' },
      { checkpoint: 'source', reason: 'png-drift' },
      { checkpoint: 'validation', reason: 'validation-receipt-stale' },
      { checkpoint: 'preview', reason: 'preview-receipt-stale' },
    ]);

    const fixture = await createImportedFixture();
    const store = createAssetAuthoringSessionStore(fixture.workspace);
    store.replace(fixture.sessionId, {
      state: 'needs-user-action',
      reason: 'preview-receipt-stale',
      phase: 'blocked',
      checkpointFreshness: 'stale',
    });
    const status = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'status', '--session', fixture.sessionId,
    ], fixture.workspace.root);
    expect(dataOf(status.response).nextActions).toEqual([
      expect.objectContaining({ id: 'preview-session', safety: 'safe' }),
    ]);
  });
});
