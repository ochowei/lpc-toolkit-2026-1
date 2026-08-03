import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import {
  standardAnimationGeometry,
  type AnimationName,
} from '@lpc-toolkit/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { createRuntimeContext } from '../src/context.js';
import { runCli } from '../src/main.js';
import type {
  AuthoringResponseData,
  CliResponse,
} from '../src/response.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

const temporaryDirectories: string[] = [];
const WALK_GEOMETRY = standardAnimationGeometry('walk');

interface ContractTarget {
  readonly id: string;
  readonly path: string;
  readonly geometry: {
    readonly canvasWidth: number;
    readonly canvasHeight: number;
    readonly frameWidth: number;
    readonly frameHeight: number;
  };
  readonly bodyTypes: readonly string[];
  readonly cells: readonly {
    readonly policy: string;
    readonly sourceColumn: number;
    readonly sourceRow: number;
  }[];
}

interface ContractDocument {
  readonly targets: readonly ContractTarget[];
}

interface CapabilityData {
  readonly capabilities: readonly string[];
  readonly schemaVersions: readonly string[];
}

interface CommandResult<T> {
  readonly code: number;
  readonly response: CliResponse<T>;
  readonly stderr: string;
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

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
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

function writeDefinition(
  assetsRoot: string,
  relativePath: string,
  value: unknown,
  colors: Readonly<Record<AnimationName, string>>,
  spriteRoot: string,
): void {
  writeJson(path.join(assetsRoot, 'sheet_definitions', relativePath), value);
  for (const [animation, color] of Object.entries(colors) as [AnimationName, string][]) {
    writeSheetPng(
      path.join(assetsRoot, 'spritesheets', spriteRoot, `${animation}.png`),
      animation,
      color,
    );
  }
}

function createRuntime(root: string, workspaceRoot: string): RuntimeAssets {
  const assetsRoot = path.join(root, 'assets');
  writeDefinition(
    assetsRoot,
    'body/body.json',
    {
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
      layer_1: { zPos: 10, male: 'body/base/', female: 'body/base/' },
    },
    { walk: '#775533' },
    'body/base',
  );
  writeDefinition(
    assetsRoot,
    'hair/hair_messy.json',
    {
      name: 'Messy',
      type_name: 'hair',
      animations: ['walk'],
      credits: [{
        file: 'hair/messy',
        authors: ['Base Hair Artist'],
        licenses: ['GPL 3.0'],
        urls: ['https://example.test/base-hair'],
        notes: 'Original messy hair.',
      }],
      layer_1: { zPos: 50, male: 'hair/messy/', female: 'hair/messy/' },
    },
    { walk: '#553311' },
    'hair/messy',
  );
  writeJson(path.join(assetsRoot, 'palette_definitions/skin/meta_skin.json'), {
    type: 'material',
    default: 'ulpc',
    base: 'light',
  });
  writeJson(path.join(assetsRoot, 'palette_definitions/skin/skin_ulpc.json'), {
    light: ['#775533'],
  });
  writeFileSync(path.join(assetsRoot, 'CREDITS.csv'), 'filename,notes,authors,licenses,urls\n');
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

function createBlankRepairRuntime(root: string, workspaceRoot: string): RuntimeAssets {
  const assetsRoot = path.join(root, 'assets');
  const geometry = standardAnimationGeometry('walk');
  const maxColumn = Math.max(...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)));
  const canvas = createCanvas(
    (maxColumn + 1) * geometry.frameSize,
    geometry.rows.length * geometry.frameSize,
  );
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
      notes: 'Blank-frame repair baseline.',
    }],
    layer_1: { zPos: 50, male: 'hair/fixture/' },
  });
  const sourcePath = path.join(assetsRoot, 'spritesheets/hair/fixture/walk.png');
  mkdirSync(path.dirname(sourcePath), { recursive: true });
  writeFileSync(sourcePath, canvas.toBuffer('image/png'));
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
    'filename,notes,authors,licenses,urls\nhair/fixture/walk.png,Repair baseline,Fixture Artist,GPL 3.0,https://example.test/fixture-art\n',
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

function snapshotTree(root: string): Readonly<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  if (!existsSync(root)) return snapshot;
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else {
        snapshot[path.relative(root, absolutePath).split(path.sep).join('/')] =
          readFileSync(absolutePath).toString('base64');
      }
    }
  };
  visit(root);
  return snapshot;
}

const NEW_ITEM_PLAN = {
  schema: 'lpc-toolkit.asset-authoring-plan.v1',
  goal: 'new-item',
  pack: {
    id: 'acme.session-e2e',
    version: '1.0.0',
    displayName: 'ACME Session E2E',
  },
  asset: {
    kind: 'new-item',
    localId: 'moon-braid',
    displayName: 'Moon Braid',
    typeName: 'hair',
    bodyTypes: ['male', 'female'],
    animations: ['walk'],
    layers: [{ id: 'foreground', zPos: 120, bodyTypes: ['male', 'female'] }],
  },
  scope: {
    packId: 'acme.session-e2e',
    assetId: 'moon-braid',
    bodyTypes: ['male', 'female'],
    animations: ['walk'],
    paths: [
      'sprites/moon-braid/foreground/walk.png',
    ],
  },
  draftCredits: {
    authors: ['Session E2E Artist'],
    licenses: ['CC-BY-SA 4.0'],
    urls: ['https://example.test/session-e2e'],
    notes: 'Public session E2E attribution.',
  },
} as const;

function blankRepairPlan(): unknown {
  const sourceCells = WALK_GEOMETRY.rows.flatMap((row) => row.cells.map((cell) => ({
    sourceRow: row.sourceRow,
    ...(row.direction === undefined ? {} : { direction: row.direction }),
    sourceColumn: cell.sourceColumn,
    logicalFrameIndices: [...cell.logicalFrameIndices],
  })));
  return {
    schema: 'lpc-toolkit.asset-authoring-plan.v1',
    goal: 'extend-item',
    pack: {
      id: 'acme.session-blank-repair',
      version: '1.0.0',
      displayName: 'ACME Session Blank Repair',
    },
    asset: {
      kind: 'extend-item',
      itemId: 'hair_fixture',
      typeName: 'hair',
    },
    scope: {
      packId: 'acme.session-blank-repair',
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
        kind: WALK_GEOMETRY.kind,
        frameSize: WALK_GEOMETRY.frameSize,
        rows: WALK_GEOMETRY.rows.map((row) => ({
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
      urls: ['https://example.test/session-blank-repair'],
      notes: 'Blank repair attribution.',
    },
  };
}

function writePlan(root: string, name: string, plan: unknown): string {
  const planPath = path.join(root, name);
  writeJson(planPath, plan);
  return planPath;
}

async function runJson<T>(
  argv: readonly string[],
  cwd: string,
  prepareRuntimeAssets?: (options: {
    readonly cwd: string;
    readonly managedCacheOnly?: boolean;
  }) => Promise<RuntimeAssets>,
): Promise<CommandResult<T>> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli([...argv, '--json'], {
    cwd,
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  }, prepareRuntimeAssets === undefined ? {} : { prepareRuntimeAssets });
  return {
    code,
    response: JSON.parse(stdout.join('')) as CliResponse<T>,
    stderr: stderr.join(''),
  };
}

function dataOf(response: CliResponse<AuthoringResponseData>): AuthoringResponseData {
  if (response.data === null) throw new Error('Expected authoring response data.');
  return response.data;
}

function contractArtifact(data: AuthoringResponseData): { readonly path: string; readonly digest: string } {
  const artifact = data.artifacts.find((entry) => entry.id === 'contract');
  if (!artifact) throw new Error('Expected contract artifact.');
  return artifact;
}

function writeCandidate(
  filePath: string,
  target: ContractTarget,
  colorOffset = 0,
): Buffer {
  const canvas = createCanvas(target.geometry.canvasWidth, target.geometry.canvasHeight);
  const context = canvas.getContext('2d');
  target.cells.forEach((cell) => {
    if (cell.policy !== 'required-drawn') return;
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

async function validateWithAcknowledgements(options: {
  readonly workspaceRoot: string;
  readonly packRoot: string;
  readonly sessionId: string;
  readonly runtime: RuntimeAssets;
}): Promise<AuthoringResponseData> {
  const first = await runJson<AuthoringResponseData>([
    'asset', 'authoring', 'validate', '--session', options.sessionId,
  ], options.workspaceRoot, async () => options.runtime);
  const firstData = dataOf(first.response);
  const report = firstData.validation;
  if (report === undefined) throw new Error('Expected validation report.');
  if (!report.valid) {
    expect(report.acknowledgementRecords.length).toBeGreaterThan(0);
    const manifestPath = path.join(options.packRoot, 'asset-pack.json');
    const manifest = readJson<Record<string, unknown>>(manifestPath);
    writeJson(manifestPath, {
      ...manifest,
      acknowledgements: report.acknowledgementRecords.map((record) => ({
        ...record,
        reason: 'Reviewed the public session validation evidence.',
      })),
    });
    const manifestDigest = sha256(readFileSync(manifestPath));
    const resumed = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'resume', '--session', options.sessionId,
    ], options.workspaceRoot);
    expect(resumed.code).toBe(0);
    expect(dataOf(resumed.response).reason).toBe('manifest-conflict');
    const reconciled = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'reconcile-manifest',
      '--session', options.sessionId,
      '--use', 'external',
      '--expected-external-digest', manifestDigest,
    ], options.workspaceRoot);
    expect(reconciled.code).toBe(0);
    return dataOf((await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'validate', '--session', options.sessionId,
    ], options.workspaceRoot, async () => options.runtime)).response);
  }
  return firstData;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('public authoring session foundation', () => {
  it('completes a clean-workspace new-item session through drift, correction, and current preview', async () => {
    const root = createDirectory('lpc-authoring-session-e2e-');
    const workspaceRoot = path.join(root, 'artist-workspace');
    const runtime = createRuntime(path.join(root, 'prepared-runtime'), workspaceRoot);
    const runtimeBefore = snapshotTree(runtime.context.assetsRoot);
    const initialized = await runJson<unknown>([
      'asset', 'workspace', 'init', workspaceRoot,
    ], root);
    expect(initialized.code).toBe(0);
    expect(existsSync(path.join(root, '.git'))).toBe(false);
    expect(existsSync(path.join(root, 'assets'))).toBe(false);
    const capabilities = await runJson<CapabilityData>(['capabilities'], root);
    expect(capabilities.code).toBe(0);
    expect(capabilities.response.ok).toBe(true);
    const capabilityData = capabilities.response.data;
    if (capabilityData === null) throw new Error('Expected capability advertisement.');
    expect(capabilityData.capabilities).toContain('asset-authoring-session.v1');
    expect(capabilityData.schemaVersions).toContain('lpc-toolkit.asset-authoring-plan.v1');

    const planPath = writePlan(root, 'session-plan.json', NEW_ITEM_PLAN);
    const started = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'start', '--plan', planPath,
    ], workspaceRoot);
    expect(started.code).toBe(0);
    const sessionId = dataOf(started.response).sessionId;
    const packRoot = path.join(workspaceRoot, 'artist-packs', NEW_ITEM_PLAN.pack.id);

    const contractResult = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'contract', '--session', sessionId,
    ], workspaceRoot, async () => runtime);
    expect(contractResult.code).toBe(0);
    const contractData = dataOf(contractResult.response);
    const contract = readJson<ContractDocument>(contractArtifact(contractData).path);
    expect(contract.targets).toHaveLength(1);
    expect(contract.targets[0]?.bodyTypes).toEqual(['male', 'female']);
    const contractDigest = contractArtifact(contractData).digest;
    const candidatePaths = new Map<string, string>();
    for (const [index, target] of contract.targets.entries()) {
      const candidatePath = path.join(workspaceRoot, 'candidates', `${index}.png`);
      writeCandidate(candidatePath, target);
      candidatePaths.set(target.id, candidatePath);
      const imported = await runJson<AuthoringResponseData>([
        'asset', 'authoring', 'import',
        '--session', sessionId,
        '--target', target.id,
        '--candidate', candidatePath,
        '--contract-digest', contractDigest,
      ], workspaceRoot);
      expect(imported.code, `${imported.stderr}${JSON.stringify(imported.response)}`).toBe(0);
      expect(dataOf(imported.response).phase).toBe('imported');
    }

    const firstValidation = await validateWithAcknowledgements({
      workspaceRoot,
      packRoot,
      sessionId,
      runtime,
    });
    expect(firstValidation.validation?.valid).toBe(true);
    expect(firstValidation.validation?.manifestDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(firstValidation.validation?.sourceDigests).toHaveLength(1);

    const firstPreview = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'preview',
      '--session', sessionId,
      '--body-type', 'male',
      '--animation', 'walk',
    ], workspaceRoot, async () => runtime);
    expect(firstPreview.code).toBe(0);
    const firstPreviewData = dataOf(firstPreview.response);
    expect(firstPreviewData.phase).toBe('previewed');
    expect(firstPreviewData.preview?.artifacts).toHaveLength(4);
    expect(firstPreviewData.preview?.artifacts.every((artifact) =>
      path.resolve(artifact.path).startsWith(`${path.resolve(packRoot)}${path.sep}`))).toBe(true);
    expect(firstPreviewData.preview?.validationRevision).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(firstPreview.response.warnings).toEqual(firstPreviewData.preview?.warnings);

    const interrupted = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'status', '--session', sessionId,
    ], workspaceRoot);
    expect(dataOf(interrupted.response)).toMatchObject({
      phase: 'previewed',
      reason: 'preview-current',
    });
    const resumedWithoutChange = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'resume', '--session', sessionId,
    ], workspaceRoot);
    expect(dataOf(resumedWithoutChange.response)).toMatchObject({
      phase: 'previewed',
      reason: 'preview-current',
      checkpointFreshness: 'current',
    });

    const target = contract.targets[0];
    if (!target) throw new Error('Expected the male/female walk target.');
    const destination = path.join(packRoot, ...target.path.split('/'));
    const externalBytes = writeCandidate(path.join(workspaceRoot, 'external.png'), target, 7);
    writeFileSync(destination, externalBytes);
    const externalDigest = sha256(externalBytes);
    const drift = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'resume', '--session', sessionId,
    ], workspaceRoot);
    expect(dataOf(drift.response)).toMatchObject({
      phase: 'blocked',
      reason: 'external-png-drift',
      checkpointFreshness: 'stale',
      nextActions: [expect.objectContaining({ id: 'review-external-png', safety: 'safe' })],
    });
    expect(dataOf(drift.response).nextActions).toHaveLength(1);
    expect(dataOf(drift.response).sourceDigests).toContain(externalDigest);

    const correctionPath = path.join(workspaceRoot, 'candidates', 'male-correction.png');
    writeCandidate(correctionPath, target, 13);
    const correction = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'import',
      '--session', sessionId,
      '--target', target.id,
      '--candidate', correctionPath,
      '--contract-digest', contractDigest,
      '--replace-existing',
      '--expected-target-digest', externalDigest,
    ], workspaceRoot);
    expect(correction.code, `${correction.stderr}${JSON.stringify(correction.response)}`).toBe(0);
    expect(dataOf(correction.response)).toMatchObject({
      phase: 'imported',
      reason: 'candidate-imported',
    });
    expect(dataOf(correction.response).nextActions.map(({ id }) => id)).toEqual(['validate-session']);

    const currentValidation = await validateWithAcknowledgements({
      workspaceRoot,
      packRoot,
      sessionId,
      runtime,
    });
    expect(currentValidation.validation?.valid).toBe(true);
    const currentPreview = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'preview',
      '--session', sessionId,
      '--body-type', 'male',
      '--animation', 'walk',
    ], workspaceRoot, async () => runtime);
    expect(currentPreview.code).toBe(0);
    expect(dataOf(currentPreview.response)).toMatchObject({
      phase: 'previewed',
      reason: 'preview-current',
      preview: {
        input: { bodyType: 'male', animation: 'walk' },
        artifacts: expect.arrayContaining([
          expect.objectContaining({ id: 'preview:preview', digest: expect.stringMatching(/^sha256:/u) }),
          expect.objectContaining({ id: 'preview:metadata', digest: expect.stringMatching(/^sha256:/u) }),
          expect.objectContaining({ id: 'preview:credits_txt', digest: expect.stringMatching(/^sha256:/u) }),
          expect.objectContaining({ id: 'preview:credits_csv', digest: expect.stringMatching(/^sha256:/u) }),
        ]),
      },
    });
    expect(snapshotTree(runtime.context.assetsRoot)).toEqual(runtimeBefore);
    expect(existsSync(path.join(workspaceRoot, '.git'))).toBe(false);
    expect(existsSync(path.join(workspaceRoot, 'assets'))).toBe(false);
    expect(existsSync(path.join(root, 'upstream'))).toBe(false);
    expect(candidatePaths.size).toBe(1);
  }, 60_000);

  it('publishes blank-frame unchanged-cell and inherited-credit evidence through public contract argv', async () => {
    const root = createDirectory('lpc-authoring-session-blank-e2e-');
    const workspaceRoot = path.join(root, 'artist-workspace');
    const runtime = createBlankRepairRuntime(path.join(root, 'prepared-runtime'), workspaceRoot);
    const sourcePath = path.join(runtime.context.assetsRoot, 'spritesheets/hair/fixture/walk.png');
    const sourceBefore = readFileSync(sourcePath);
    expect((await runJson<unknown>(['asset', 'workspace', 'init', workspaceRoot], root)).code).toBe(0);
    const planPath = writePlan(root, 'blank-repair-plan.json', blankRepairPlan());
    const started = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'start', '--plan', planPath,
    ], workspaceRoot);
    const sessionId = dataOf(started.response).sessionId;
    const contract = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'contract', '--session', sessionId,
    ], workspaceRoot, async () => runtime);
    expect(contract.code).toBe(0);
    const data = dataOf(contract.response);
    const contractDocument = readJson<ContractDocument>(contractArtifact(data).path);
    const target = contractDocument.targets[0];
    if (!target) throw new Error('Expected blank-repair target.');
    expect(target.path).toBe('spritesheets/hair/fixture/walk.png');
    expect(target.cells.filter((cell) => cell.policy === 'unchanged').length).toBeGreaterThan(0);
    expect(readFileSync(sourcePath)).toEqual(sourceBefore);
    const metadataArtifact = data.artifacts.find((artifact) => artifact.id === 'metadata');
    if (!metadataArtifact) throw new Error('Expected contract metadata artifact.');
    const metadata = readJson<{
      readonly artifacts: readonly {
        readonly id: string;
        readonly kind: string;
        readonly importable: boolean;
        readonly targetPath?: string;
        readonly source?: { readonly logicalPath: string; readonly digest: string };
        readonly attribution?: { readonly authors: readonly string[]; readonly licenses: readonly string[] };
        readonly unchangedCells?: readonly unknown[];
      }[];
    }>(metadataArtifact.path);
    const reference = metadata.artifacts.find((artifact) => artifact.kind === 'reference-overlay');
    expect(reference).toMatchObject({
      importable: false,
      targetPath: target.path,
      source: { logicalPath: target.path, digest: sha256(sourceBefore) },
      attribution: { authors: ['Fixture Artist'], licenses: ['GPL 3.0'] },
    });
    expect(reference?.unchangedCells?.length).toBeGreaterThan(0);
    expect(readFileSync(sourcePath)).toEqual(sourceBefore);
  });
});
