import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCanvas, ImageData as NapiImageData } from '@napi-rs/canvas';
import { standardAnimationGeometry } from '@lpc-toolkit/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { nodeAssetPackPngDecoder } from '../src/asset-pack-node-runtime.js';
import { scaffoldNewAssetPack } from '../src/asset-pack-scaffold.js';
import { assetAuthoringSessionPath } from '../src/asset-authoring-session.js';
import { createAssetAuthoringSessionStore } from '../src/asset-authoring-session.js';
import { createRuntimeContext } from '../src/context.js';
import { initializeAssetWorkspace } from '../src/asset-workspace.js';
import { runCli } from '../src/main.js';
import type {
  AuthoringArtifact,
  AuthoringResponseData,
  CliResponse,
} from '../src/response.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

const temporaryDirectories: string[] = [];

interface JsonRecord {
  readonly [key: string]: unknown;
}

interface ContractTarget {
  readonly id: string;
  readonly path: string;
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

interface ContractDocument {
  readonly targets: readonly ContractTarget[];
}

interface ImportFixture {
  readonly root: string;
  readonly workspace: ReturnType<typeof initializeAssetWorkspace>;
  readonly runtime: RuntimeAssets;
  readonly sessionId: string;
  readonly packId: string;
  readonly contractData: AuthoringResponseData;
  readonly contractArtifact: AuthoringArtifact;
  readonly target: ContractTarget;
  readonly candidatePath: string;
}

function createDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writePlan(root: string): string {
  const plan = {
    schema: 'lpc-toolkit.asset-authoring-plan.v1',
    goal: 'new-item',
    pack: {
      id: 'acme.import-fixture',
      version: '1.0.0',
      displayName: 'ACME Import Fixture',
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
      packId: 'acme.import-fixture',
      assetId: 'moon-braid',
      bodyTypes: ['male'],
      animations: ['walk'],
      paths: ['sprites/moon-braid/foreground/walk.png'],
    },
    draftCredits: {
      authors: ['Import Artist'],
      licenses: ['CC-BY-SA 4.0'],
      urls: ['https://example.test/import-fixture'],
      notes: 'Import fixture attribution.',
    },
  } satisfies JsonRecord;
  const planPath = path.join(root, 'import-plan.json');
  writeJson(planPath, plan);
  return planPath;
}

function createRuntime(root: string, workspaceRoot: string): RuntimeAssets {
  const assetsRoot = path.join(root, 'assets');
  mkdirSync(assetsRoot, { recursive: true });
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

function writeBlankRepairPlan(root: string): string {
  const geometry = standardAnimationGeometry('walk');
  const sourceCells = geometry.rows.flatMap((row) => row.cells.map((cell) => ({
    sourceRow: row.sourceRow,
    ...(row.direction === undefined ? {} : { direction: row.direction }),
    sourceColumn: cell.sourceColumn,
    logicalFrameIndices: [...cell.logicalFrameIndices],
  })));
  const plan = {
    schema: 'lpc-toolkit.asset-authoring-plan.v1',
    goal: 'extend-item',
    pack: {
      id: 'acme.blank-repair',
      version: '1.0.0',
      displayName: 'ACME Blank Repair',
    },
    asset: {
      kind: 'extend-item',
      itemId: 'hair_fixture',
      typeName: 'hair',
    },
    scope: {
      packId: 'acme.blank-repair',
      assetId: 'hair_fixture',
      bodyTypes: ['male'],
      animations: ['walk'],
      paths: ['spritesheets/hair/fixture/walk.png'],
    },
    remediation: {
      reportDigest: `sha256:${'b'.repeat(64)}`,
      selectedFinding: {
        category: 'blankFrames',
        path: 'spritesheets/hair/fixture/walk.png',
        animation: 'walk',
        sourceAnimation: 'walk',
        sourceRow: 2,
        direction: 'down',
        frames: [{ sourceColumn: 1, logicalFrameIndices: [0] }],
        consumers: [{
          itemId: 'hair_fixture',
          typeName: 'hair',
          layer: 'layer_1',
          bodyTypes: ['male'],
          recolors: [],
        }],
      },
      consumer: {
        itemId: 'hair_fixture',
        typeName: 'hair',
        layer: 'layer_1',
        bodyTypes: ['male'],
        recolors: [],
      },
      pathConfidence: 'exact',
      geometry: {
        kind: geometry.kind,
        frameSize: geometry.frameSize,
        rows: geometry.rows.map((row) => ({
          sourceRow: row.sourceRow,
          ...(row.direction === undefined ? {} : { direction: row.direction }),
          cells: row.cells.map((cell) => ({
            sourceColumn: cell.sourceColumn,
            logicalFrameIndices: [...cell.logicalFrameIndices],
          })),
        })),
      },
      sourceCells,
    },
    draftCredits: {
      authors: ['Repair Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.test/blank-repair'],
      notes: 'Repair contribution attribution.',
    },
  } satisfies JsonRecord;
  const planPath = path.join(root, 'blank-repair-plan.json');
  writeJson(planPath, plan);
  return planPath;
}

function createBlankRepairRuntime(root: string, workspaceRoot: string): RuntimeAssets {
  const assetsRoot = path.join(root, 'assets');
  const geometry = standardAnimationGeometry('walk');
  const maxColumn = Math.max(...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)));
  const canvas = createCanvas((maxColumn + 1) * geometry.frameSize, geometry.rows.length * geometry.frameSize);
  const context = canvas.getContext('2d');
  geometry.rows.forEach((row) => row.cells.forEach((cell) => {
    if (row.sourceRow === 2 && cell.sourceColumn === 1) return;
    context.fillStyle = `rgb(${40 + row.sourceRow * 30}, ${60 + cell.sourceColumn * 30}, 120)`;
    context.fillRect(
      cell.sourceColumn * geometry.frameSize + 8,
      row.sourceRow * geometry.frameSize + 8,
      geometry.frameSize - 16,
      geometry.frameSize - 16,
    );
  }));
  writeJson(path.join(assetsRoot, 'sheet_definitions/hair/fixture.json'), {
    name: 'Fixture Hair',
    type_name: 'hair',
    animations: ['walk'],
    credits: [{
      file: 'hair/fixture',
      authors: ['Fixture Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.test/fixture-art'],
      notes: 'Import baseline.',
    }],
    layer_1: { zPos: 50, male: 'hair/fixture/' },
  });
  mkdirSync(path.join(assetsRoot, 'spritesheets/hair/fixture'), { recursive: true });
  writeFileSync(path.join(assetsRoot, 'spritesheets/hair/fixture/walk.png'), canvas.toBuffer('image/png'));
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
    'filename,notes,authors,licenses,urls\nhair/fixture/walk.png,Import baseline,Fixture Artist,GPL 3.0,https://example.test/fixture-art\n',
  );
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

async function runJson<T>(
  argv: readonly string[],
  cwd: string,
  prepareRuntimeAssets?: (options: { readonly cwd: string; readonly managedCacheOnly?: boolean }) => Promise<RuntimeAssets>,
): Promise<{ readonly code: number; readonly response: CliResponse<T> }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli([...argv, '--json'], {
    cwd,
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  }, prepareRuntimeAssets === undefined ? {} : { prepareRuntimeAssets });
  if (stderr.length > 0 && code !== 0) throw new Error(stderr.join(''));
  return {
    code,
    response: JSON.parse(stdout.join('')) as CliResponse<T>,
  };
}

function dataOf(response: CliResponse<AuthoringResponseData>): AuthoringResponseData {
  if (!response.data) throw new Error('Expected authoring response data.');
  return response.data;
}

function artifact(data: AuthoringResponseData, id: string): AuthoringArtifact {
  const found = data.artifacts.find((entry) => entry.id === id);
  if (!found) throw new Error(`Missing artifact ${id}.`);
  return found;
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function writeValidCandidate(filePath: string, target: ContractTarget): Buffer {
  const canvas = createCanvas(target.geometry.canvasWidth, target.geometry.canvasHeight);
  const context = canvas.getContext('2d');
  target.cells.forEach((cell) => {
    if (cell.policy !== 'required-drawn') return;
    context.fillStyle = `rgb(${48 + cell.sourceRow * 17}, ${90 + cell.sourceColumn * 13}, 160)`;
    context.fillRect(
      cell.sourceColumn * target.geometry.frameWidth + 8,
      cell.sourceRow * target.geometry.frameHeight + 8,
      target.geometry.frameWidth - 16,
      target.geometry.frameHeight - 16,
    );
  });
  mkdirSync(path.dirname(filePath), { recursive: true });
  const bytes = canvas.toBuffer('image/png');
  writeFileSync(filePath, bytes);
  return bytes;
}

function writeCandidate(
  filePath: string,
  target: ContractTarget,
  options: {
    readonly skip?: string;
    readonly fillAll?: boolean;
    readonly colorOffset?: number;
  } = {},
): Buffer {
  const canvas = createCanvas(target.geometry.canvasWidth, target.geometry.canvasHeight);
  const context = canvas.getContext('2d');
  target.cells.forEach((cell) => {
    const key = `${cell.sourceRow}:${cell.sourceColumn}`;
    const shouldDraw = options.fillAll === true
      || (cell.policy === 'required-drawn' && options.skip !== key);
    if (!shouldDraw) return;
    const colorOffset = options.colorOffset ?? 0;
    context.fillStyle = `rgb(${48 + cell.sourceRow * 17 + colorOffset}, ${90 + cell.sourceColumn * 13}, 160)`;
    context.fillRect(
      cell.sourceColumn * target.geometry.frameWidth + 8,
      cell.sourceRow * target.geometry.frameHeight + 8,
      target.geometry.frameWidth - 16,
      target.geometry.frameHeight - 16,
    );
  });
  mkdirSync(path.dirname(filePath), { recursive: true });
  const bytes = canvas.toBuffer('image/png');
  writeFileSync(filePath, bytes);
  return bytes;
}

function corruptIdat(bytes: Buffer): Buffer {
  const corrupted = Buffer.from(bytes);
  let offset = 8;
  while (offset + 12 <= corrupted.byteLength) {
    const length = corrupted.readUInt32BE(offset);
    const type = corrupted.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT' && length > 0) {
      corrupted[offset + 8 + length] = (corrupted[offset + 8 + length] ?? 0) ^ 0xff;
      return corrupted;
    }
    offset += 12 + length;
  }
  throw new Error('Expected an IDAT chunk in the real PNG fixture.');
}

async function createImportFixture(prefix = 'lpc-authoring-import-'): Promise<ImportFixture> {
  const root = createDirectory(prefix);
  const workspace = initializeAssetWorkspace(path.join(root, 'workspace'));
  const runtime = createRuntime(path.join(root, 'runtime'), workspace.root);
  const planPath = writePlan(root);
  const started = await runJson<AuthoringResponseData>([
    'asset', 'authoring', 'start', '--plan', planPath,
  ], workspace.root);
  expect(started.code).toBe(0);
  const sessionId = dataOf(started.response).sessionId;
  const contractResult = await runJson<AuthoringResponseData>([
    'asset', 'authoring', 'contract', '--session', sessionId,
  ], workspace.root, async () => runtime);
  expect(contractResult.code).toBe(0);
  const contractData = dataOf(contractResult.response);
  const contractArtifact = artifact(contractData, 'contract');
  const contract = JSON.parse(readFileSync(contractArtifact.path, 'utf8')) as ContractDocument;
  const target = contract.targets[0];
  if (target === undefined) throw new Error('Expected one contract target.');
  return {
    root,
    workspace,
    runtime,
    sessionId,
    packId: 'acme.import-fixture',
    contractData,
    contractArtifact,
    target,
    candidatePath: path.join(workspace.root, 'candidate.png'),
  };
}

async function createBlankRepairFixture(): Promise<ImportFixture> {
  const root = createDirectory('lpc-authoring-import-unchanged-');
  const workspace = initializeAssetWorkspace(path.join(root, 'workspace'));
  const runtime = createBlankRepairRuntime(path.join(root, 'runtime'), workspace.root);
  const planPath = writeBlankRepairPlan(root);
  const started = await runJson<AuthoringResponseData>([
    'asset', 'authoring', 'start', '--plan', planPath,
  ], workspace.root);
  expect(started.code).toBe(0);
  const sessionId = dataOf(started.response).sessionId;
  const scaffold = scaffoldNewAssetPack({
    packId: 'acme.blank-repair',
    version: '1.0.0',
    displayName: 'ACME Blank Repair',
    localId: 'fixture',
    typeName: 'hair',
    bodyTypes: ['male'],
    animations: ['walk'],
    credits: {
      authors: ['Repair Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.test/blank-repair'],
      notes: 'Repair contribution attribution.',
    },
    advanced: false,
    outputDirectory: path.join(workspace.packsRoot, 'acme.blank-repair'),
  });
  if (!scaffold.ok) throw new Error('Could not create the extension import pack fixture.');
  const manifestBytes = readFileSync(scaffold.manifestPath);
  const store = createAssetAuthoringSessionStore(workspace);
  store.replace(sessionId, {
    state: 'needs-user-action',
    reason: 'scaffolded',
    phase: 'scaffolded',
    checkpointFreshness: 'current',
    checkpoint: {
      id: 'manifest',
      phase: 'scaffolded',
      digest: sha256(manifestBytes),
      freshness: 'current',
    },
    manifestDigest: sha256(manifestBytes),
  });
  const contractResult = await runJson<AuthoringResponseData>([
    'asset', 'authoring', 'contract', '--session', sessionId,
  ], workspace.root, async () => runtime);
  expect(contractResult.code).toBe(0);
  const contractData = dataOf(contractResult.response);
  const contractArtifact = artifact(contractData, 'contract');
  const contract = JSON.parse(readFileSync(contractArtifact.path, 'utf8')) as ContractDocument;
  const target = contract.targets[0];
  if (target === undefined) throw new Error('Expected one blank-repair contract target.');
  const fixture: ImportFixture = {
    root,
    workspace,
    runtime,
    sessionId,
    packId: 'acme.blank-repair',
    contractData,
    contractArtifact,
    target,
    candidatePath: path.join(workspace.root, 'candidate.png'),
  };
  mkdirSync(path.dirname(targetPath(fixture)), { recursive: true });
  return fixture;
}

async function writeCandidateFromWorking(
  fixture: ImportFixture,
  cellsToDraw: readonly { readonly sourceRow: number; readonly sourceColumn: number }[],
): Promise<Buffer> {
  const working = fixture.contractData.artifacts.find((entry) => entry.id.startsWith('working-copy:'));
  if (working === undefined) throw new Error('Expected an attributed working copy.');
  const decoded = await nodeAssetPackPngDecoder.decode(readFileSync(working.path));
  const canvas = createCanvas(fixture.target.geometry.canvasWidth, fixture.target.geometry.canvasHeight);
  const context = canvas.getContext('2d');
  context.putImageData(
    new NapiImageData(decoded.pixels, decoded.width, decoded.height),
    0,
    0,
  );
  cellsToDraw.forEach((cell, index) => {
    context.fillStyle = index === 0 ? 'rgb(30, 220, 90)' : 'rgb(220, 30, 90)';
    context.fillRect(
      cell.sourceColumn * fixture.target.geometry.frameWidth + 8,
      cell.sourceRow * fixture.target.geometry.frameHeight + 8,
      fixture.target.geometry.frameWidth - 16,
      fixture.target.geometry.frameHeight - 16,
    );
  });
  const bytes = canvas.toBuffer('image/png');
  writeFileSync(fixture.candidatePath, bytes);
  return bytes;
}

function targetPath(fixture: ImportFixture): string {
  return path.join(fixture.workspace.packsRoot, fixture.packId, fixture.target.path);
}

function sessionSnapshot(fixture: ImportFixture): Buffer {
  return readFileSync(assetAuthoringSessionPath(fixture.workspace, fixture.sessionId));
}

async function runImport(
  fixture: ImportFixture,
  options: {
    readonly targetId?: string;
    readonly candidatePath?: string;
    readonly contractDigest?: string;
    readonly replaceExisting?: boolean;
    readonly expectedTargetDigest?: string;
  } = {},
): Promise<{ readonly code: number; readonly response: CliResponse<AuthoringResponseData> }> {
  const argv = [
    'asset', 'authoring', 'import',
    '--session', fixture.sessionId,
    '--target', options.targetId ?? fixture.target.id,
    '--candidate', options.candidatePath ?? fixture.candidatePath,
    '--contract-digest', options.contractDigest ?? fixture.contractArtifact.digest,
  ];
  if (options.replaceExisting === true) argv.push('--replace-existing');
  if (options.expectedTargetDigest !== undefined) {
    argv.push('--expected-target-digest', options.expectedTargetDigest);
  }
  return runJson<AuthoringResponseData>(argv, fixture.workspace.root);
}

async function expectFailurePreserves(
  fixture: ImportFixture,
  options: Parameters<typeof runImport>[1] = {},
): Promise<CliResponse<AuthoringResponseData>> {
  const beforeSession = sessionSnapshot(fixture);
  const destination = targetPath(fixture);
  const beforeTarget = existsSync(destination) ? readFileSync(destination) : undefined;
  const result = await runImport(fixture, options);
  expect(result.code).toBe(1);
  expect(readFileSync(assetAuthoringSessionPath(fixture.workspace, fixture.sessionId))).toEqual(beforeSession);
  if (beforeTarget === undefined) {
    expect(existsSync(destination)).toBe(false);
  } else {
    expect(readFileSync(destination)).toEqual(beforeTarget);
  }
  return result.response;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('asset authoring candidate import', () => {
  it('imports a valid real PNG through the public application seam', async () => {
    const root = createDirectory('lpc-authoring-import-red-');
    const workspace = initializeAssetWorkspace(path.join(root, 'workspace'));
    const runtime = createRuntime(path.join(root, 'runtime'), workspace.root);
    const planPath = writePlan(root);

    const started = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'start', '--plan', planPath,
    ], workspace.root);
    expect(started.code).toBe(0);
    const sessionId = dataOf(started.response).sessionId;

    const contractResult = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'contract', '--session', sessionId,
    ], workspace.root, async () => runtime);
    expect(contractResult.code).toBe(0);
    const contractData = dataOf(contractResult.response);
    const contractArtifact = artifact(contractData, 'contract');
    const contract = JSON.parse(readFileSync(contractArtifact.path, 'utf8')) as ContractDocument;
    const target = contract.targets[0];
    if (target === undefined) throw new Error('Expected one contract target.');

    const candidatePath = path.join(workspace.root, 'candidate.png');
    const candidateBytes = writeValidCandidate(candidatePath, target);
    const imported = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'import',
      '--session', sessionId,
      '--target', target.id,
      '--candidate', candidatePath,
      '--contract-digest', contractArtifact.digest,
    ], workspace.root);

    expect(imported.code).toBe(0);
    expect(imported.response.ok).toBe(true);
    const importedData = dataOf(imported.response);
    expect(importedData).toMatchObject({
      phase: 'imported',
      reason: 'candidate-imported',
      checkpoint: { id: 'import', digest: sha256(candidateBytes) },
    });
    expect(readFileSync(candidatePath)).toEqual(candidateBytes);
    expect(readFileSync(path.join(workspace.packsRoot, 'acme.import-fixture', target.path)))
      .toEqual(candidateBytes);
  });

  it('rejects an unknown target and a digest that is not the current contract', async () => {
    const fixture = await createImportFixture();
    writeValidCandidate(fixture.candidatePath, fixture.target);

    const unknownTarget = await expectFailurePreserves(fixture, {
      targetId: `${fixture.target.id}-other`,
    });
    expect(unknownTarget.errors[0]?.code).toBe('asset_authoring_target_invalid');

    const wrongDigest = await expectFailurePreserves(fixture, {
      contractDigest: `sha256:${'f'.repeat(64)}`,
    });
    expect(wrongDigest.errors[0]?.code).toBe('asset_authoring_contract_stale');
  });

  it('rejects a stale contract after an explicit contract refresh', async () => {
    const fixture = await createImportFixture('lpc-authoring-import-stale-');
    writeValidCandidate(fixture.candidatePath, fixture.target);
    const oldDigest = fixture.contractArtifact.digest;
    writeFileSync(fixture.contractArtifact.path, Buffer.concat([
      readFileSync(fixture.contractArtifact.path),
      Buffer.from('tampered'),
    ]));

    const response = await expectFailurePreserves(fixture, { contractDigest: oldDigest });
    expect(response.errors[0]?.code).toBe('asset_authoring_contract_stale');
  });

  it.each([
    ['malformed PNG', (fixture: ImportFixture) => writeFileSync(fixture.candidatePath, Buffer.from('not a PNG')), 'asset_authoring_candidate_png_invalid'],
    ['corrupt IHDR CRC', (fixture: ImportFixture) => {
      const bytes = writeValidCandidate(fixture.candidatePath, fixture.target);
      bytes.writeUInt32BE((bytes.readUInt32BE(29) ^ 0xffff_ffff) >>> 0, 29);
      writeFileSync(fixture.candidatePath, bytes);
    }, 'asset_authoring_candidate_png_invalid'],
    ['corrupt IDAT', (fixture: ImportFixture) => {
      const bytes = writeValidCandidate(fixture.candidatePath, fixture.target);
      writeFileSync(fixture.candidatePath, corruptIdat(bytes));
    }, 'asset_authoring_candidate_png_invalid'],
    ['wrong dimensions', (fixture: ImportFixture) => {
      const canvas = createCanvas(fixture.target.geometry.canvasWidth + fixture.target.geometry.frameWidth, fixture.target.geometry.canvasHeight);
      writeFileSync(fixture.candidatePath, canvas.toBuffer('image/png'));
    }, 'asset_authoring_candidate_geometry_mismatch'],
    ['resource bound', (fixture: ImportFixture) => {
      writeFileSync(fixture.candidatePath, Buffer.alloc(64 * 1024 * 1024 + 1));
    }, 'asset_authoring_candidate_too_large'],
  ])('rejects %s before publication', async (_label, writeInvalid, expectedCode) => {
    const fixture = await createImportFixture('lpc-authoring-import-png-');
    writeInvalid(fixture);
    const response = await expectFailurePreserves(fixture);
    expect(response.errors[0]?.code).toBe(expectedCode);
  });

  it('rejects blank required cells and drawn forbidden cells', async () => {
    const blankFixture = await createImportFixture('lpc-authoring-import-blank-');
    const required = blankFixture.target.cells.find((cell) => cell.policy === 'required-drawn');
    if (required === undefined) throw new Error('Expected a required-drawn cell.');
    writeCandidate(blankFixture.candidatePath, blankFixture.target, {
      skip: `${required.sourceRow}:${required.sourceColumn}`,
    });
    const blank = await expectFailurePreserves(blankFixture);
    expect(blank.errors[0]?.code).toBe('asset_authoring_cell_blank');

    const forbiddenFixture = await createImportFixture('lpc-authoring-import-forbidden-');
    const forbidden = forbiddenFixture.target.cells.find((cell) => cell.policy === 'required-transparent');
    if (forbidden === undefined) throw new Error('Expected a required-transparent cell.');
    writeCandidate(forbiddenFixture.candidatePath, forbiddenFixture.target, { fillAll: true });
    const forbiddenResponse = await expectFailurePreserves(forbiddenFixture);
    expect(forbiddenResponse.errors[0]?.code).toBe('asset_authoring_cell_forbidden');
  });

  it.each(['template', 'guide'])('rejects a non-importable %s artifact as a candidate', async (kind) => {
    const fixture = await createImportFixture(`lpc-authoring-import-${kind}-`);
    const artifactEntry = fixture.contractData.artifacts.find((entry) => entry.id.startsWith(`${kind}:`));
    if (artifactEntry === undefined) throw new Error(`Expected a ${kind} artifact.`);
    writeFileSync(fixture.candidatePath, readFileSync(artifactEntry.path));
    const response = await expectFailurePreserves(fixture);
    expect(response.errors[0]?.code).toBe('asset_authoring_candidate_artifact_confusion');
  });

  it.each([
    ['traversal', () => path.join('..', 'outside.png'), undefined],
    ['symlink', (fixture: ImportFixture) => {
      const outside = path.join(fixture.root, 'outside.png');
      writeValidCandidate(outside, fixture.target);
      rmSync(fixture.candidatePath, { force: true });
      symlinkSync(outside, fixture.candidatePath);
      return fixture.candidatePath;
    }, 'asset_authoring_candidate_symlink'],
    ['non-file', (fixture: ImportFixture) => {
      rmSync(fixture.candidatePath, { force: true });
      mkdirSync(fixture.candidatePath);
      return fixture.candidatePath;
    }, 'asset_authoring_candidate_not_regular'],
  ])('rejects candidate %s without changing the session', async (_label, candidate, expectedCode) => {
    const fixture = await createImportFixture('lpc-authoring-import-path-');
    const candidatePath = candidate(fixture);
    const response = await expectFailurePreserves(fixture, { candidatePath });
    if (expectedCode === undefined) {
      expect(response.errors[0]?.code).toBe('asset_authoring_candidate_outside_workspace');
    } else {
      expect(response.errors[0]?.code).toBe(expectedCode);
    }
  });

  it('requires explicit replacement and an exact expected digest for a pre-existing target', async () => {
    const fixture = await createImportFixture('lpc-authoring-import-replace-');
    const destination = targetPath(fixture);
    const existing = writeValidCandidate(destination, fixture.target);
    writeCandidate(fixture.candidatePath, fixture.target, { colorOffset: 3 });

    const missingAuthorization = await expectFailurePreserves(fixture);
    expect(missingAuthorization.errors[0]?.code).toBe('asset_authoring_replacement_required');

    const wrongAuthorization = await expectFailurePreserves(fixture, {
      replaceExisting: true,
      expectedTargetDigest: `sha256:${'0'.repeat(64)}`,
    });
    expect(wrongAuthorization.errors[0]?.code).toBe('asset_authoring_target_digest_mismatch');

    const imported = await runImport(fixture, {
      replaceExisting: true,
      expectedTargetDigest: sha256(existing),
    });
    expect(imported.code).toBe(0);
    expect(readFileSync(destination)).not.toEqual(existing);
  });

  it('allows a correction only when the current target matches the prior import receipt', async () => {
    const fixture = await createImportFixture('lpc-authoring-import-correction-');
    const firstBytes = writeValidCandidate(fixture.candidatePath, fixture.target);
    const first = await runImport(fixture);
    expect(first.code).toBe(0);
    const secondBytes = writeCandidate(fixture.candidatePath, fixture.target, { colorOffset: 3 });
    const correction = await runImport(fixture);
    expect(correction.code).toBe(0);
    expect(readFileSync(targetPath(fixture))).toEqual(secondBytes);
    expect(readFileSync(fixture.candidatePath)).toEqual(secondBytes);
    expect(secondBytes).not.toEqual(firstBytes);
  });

  it('leaves the prior target and receipt exact when a correction candidate fails inspection', async () => {
    const fixture = await createImportFixture('lpc-authoring-import-receipt-');
    writeValidCandidate(fixture.candidatePath, fixture.target);
    const first = await runImport(fixture);
    expect(first.code).toBe(0);
    writeFileSync(fixture.candidatePath, Buffer.from('invalid correction PNG'));
    const response = await expectFailurePreserves(fixture, {
      candidatePath: fixture.candidatePath,
    });
    expect(response.errors[0]?.code).toBe('asset_authoring_candidate_png_invalid');
  });

  it('rejects a candidate that changes an unchanged baseline cell', async () => {
    const fixture = await createBlankRepairFixture();
    const required = fixture.target.cells.find((cell) => cell.policy === 'required-drawn');
    const unchanged = fixture.target.cells.find((cell) => cell.policy === 'unchanged');
    if (required === undefined || unchanged === undefined) {
      throw new Error('Expected required-drawn and unchanged cells in the repair contract.');
    }
    await writeCandidateFromWorking(fixture, [
      { sourceRow: required.sourceRow, sourceColumn: required.sourceColumn },
      { sourceRow: unchanged.sourceRow, sourceColumn: unchanged.sourceColumn },
    ]);
    const response = await expectFailurePreserves(fixture);
    expect(response.errors[0]?.code).toBe('asset_authoring_unchanged_cell_changed');
  });
});
