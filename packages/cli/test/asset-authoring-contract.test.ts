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
import {
  standardAnimationGeometry,
  type AnimationAuditGeometry,
} from '@lpc-toolkit/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { initializeAssetWorkspace } from '../src/asset-workspace.js';
import { nodeAssetPackPngDecoder } from '../src/asset-pack-node-runtime.js';
import { createRuntimeContext } from '../src/context.js';
import { runCli } from '../src/main.js';
import type {
  AuthoringArtifact,
  AuthoringResponseData,
  CliResponse,
} from '../src/response.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

const temporaryDirectories: string[] = [];
const WALK_GEOMETRY = standardAnimationGeometry('walk');

interface ArtifactMetadataEntry {
  readonly id: string;
  readonly kind: string;
  readonly path: string;
  readonly digest: string;
  readonly importable: boolean;
  readonly sessionId: string;
  readonly contractDigest: string;
  readonly targetId?: string;
  readonly targetPath?: string;
  readonly source?: {
    readonly logicalPath: string;
    readonly digest: string;
  };
  readonly attribution?: {
    readonly authors: readonly string[];
    readonly licenses: readonly string[];
    readonly urls: readonly string[];
  };
  readonly unchangedCells?: readonly {
    readonly sourceRow: number;
    readonly sourceColumn: number;
    readonly digest: string;
  }[];
}

interface ArtifactMetadataDocument {
  readonly schema: 'lpc-toolkit.asset-authoring-artifact-metadata.v1';
  readonly sessionId: string;
  readonly contractDigest: string;
  readonly artifacts: readonly ArtifactMetadataEntry[];
}

interface JsonRecord {
  readonly [key: string]: unknown;
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

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function writePlan(root: string, name: string, plan: unknown): string {
  const planPath = path.join(root, name);
  writeJson(planPath, plan);
  return planPath;
}

function newItemPlan(): JsonRecord {
  return {
    schema: 'lpc-toolkit.asset-authoring-plan.v1',
    goal: 'new-item',
    pack: {
      id: 'acme.contract-fixture',
      version: '1.0.0',
      displayName: 'ACME Contract Fixture',
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
      packId: 'acme.contract-fixture',
      assetId: 'moon-braid',
      bodyTypes: ['male'],
      animations: ['walk'],
      paths: ['sprites/moon-braid/foreground/walk.png'],
    },
    draftCredits: {
      authors: ['Contract Artist'],
      licenses: ['CC-BY-SA 4.0'],
      urls: ['https://example.test/contract-fixture'],
      notes: 'Attributed contract fixture.',
    },
  };
}

function blankRepairPlan(): JsonRecord {
  const sourceCells = WALK_GEOMETRY.rows.flatMap((row) => row.cells.map((cell) => ({
    sourceRow: row.sourceRow,
    ...(row.direction ? { direction: row.direction } : {}),
    sourceColumn: cell.sourceColumn,
    logicalFrameIndices: [...cell.logicalFrameIndices],
  })));
  return {
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
      geometry: WALK_GEOMETRY,
      sourceCells,
    },
    draftCredits: {
      authors: ['Repair Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.test/blank-repair'],
      notes: 'Repair contribution attribution.',
    },
  };
}

function geometryBounds(geometry: AnimationAuditGeometry): {
  readonly width: number;
  readonly height: number;
} {
  const maxColumn = Math.max(
    ...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)),
  );
  return {
    width: (maxColumn + 1) * geometry.frameSize,
    height: geometry.rows.length * geometry.frameSize,
  };
}

function writeRealSource(filePath: string, colorOffset = 0): Buffer {
  const bounds = geometryBounds(WALK_GEOMETRY);
  const canvas = createCanvas(bounds.width, bounds.height);
  const context = canvas.getContext('2d');
  WALK_GEOMETRY.rows.forEach((row) => {
    row.cells.forEach((cell) => {
      if (row.sourceRow === 2 && cell.sourceColumn === 1) return;
      context.fillStyle = `rgb(${40 + row.sourceRow * 30 + colorOffset}, ${60 + cell.sourceColumn * 30}, 120)`;
      context.fillRect(
        cell.sourceColumn * WALK_GEOMETRY.frameSize + 8,
        row.sourceRow * WALK_GEOMETRY.frameSize + 8,
        WALK_GEOMETRY.frameSize - 16,
        WALK_GEOMETRY.frameSize - 16,
      );
    });
  });
  mkdirSync(path.dirname(filePath), { recursive: true });
  const bytes = canvas.toBuffer('image/png');
  writeFileSync(filePath, bytes);
  return bytes;
}

function createRuntime(root: string, workspaceRoot: string): RuntimeAssets {
  const assetsRoot = path.join(root, 'assets');
  writeJson(path.join(assetsRoot, 'sheet_definitions/hair/fixture.json'), {
    name: 'Fixture Hair',
    type_name: 'hair',
    animations: ['walk'],
    credits: [{
      file: 'hair/fixture',
      authors: ['Fixture Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.test/fixture-art'],
      notes: 'Legally attributed CLI authoring reference fixture.',
    }],
    layer_1: { zPos: 50, male: 'hair/fixture/' },
  });
  writeRealSource(path.join(assetsRoot, 'spritesheets/hair/fixture/walk.png'));
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
    'filename,notes,authors,licenses,urls\nhair/fixture/walk.png,Fixture,Fixture Artist,GPL 3.0,https://example.test/fixture-art\n',
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
  if (stderr.length > 0 && code !== 0) {
    throw new Error(stderr.join(''));
  }
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

function metadataFor(
  data: AuthoringResponseData,
): ArtifactMetadataDocument {
  return readJson<ArtifactMetadataDocument>(artifact(data, 'metadata').path);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('asset authoring contract artifacts', () => {
  it('publishes deterministic contract JSON, exact targets, transparent templates, and non-importable guides', async () => {
    const root = createDirectory('lpc-authoring-contract-new-');
    const workspace = initializeAssetWorkspace(path.join(root, 'workspace'));
    const runtime = createRuntime(path.join(root, 'runtime'), workspace.root);
    const planPath = writePlan(root, 'new-item-plan.json', newItemPlan());

    const started = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'start', '--plan', planPath,
    ], workspace.root);
    expect(started.code).toBe(0);
    const sessionId = dataOf(started.response).sessionId;

    const prepare = async (options: { readonly cwd: string }): Promise<RuntimeAssets> => {
      expect(options.cwd).toBe(workspace.root);
      return runtime;
    };
    const first = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'contract', '--session', sessionId,
    ], workspace.root, prepare);
    const firstData = dataOf(first.response);
    expect(first.code).toBe(0);
    expect(firstData.phase).toBe('contract-ready');
    expect(firstData.checkpoint?.id).toBe('contract');
    expect(firstData.checkpoint?.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);

    const contractArtifact = artifact(firstData, 'contract');
    const contractBytes = readFileSync(contractArtifact.path);
    const contract = JSON.parse(contractBytes.toString('utf8')) as {
      readonly targets: readonly [{ readonly id: string; readonly path: string }];
    };
    expect(contract.targets[0]?.path).toBe('sprites/moon-braid/foreground/walk.png');
    expect(contractArtifact.digest).toBe(sha256(contractBytes));
    expect(firstData.checkpoint?.digest).toBe(contractArtifact.digest);

    const template = artifact(firstData, `template:${contract.targets[0]!.id}`);
    const guide = artifact(firstData, `guide:${contract.targets[0]!.id}`);
    const allPaths = firstData.artifacts.map((entry) => entry.path);
    expect(allPaths.every((entry) => path.isAbsolute(entry))).toBe(true);
    expect(template.path).not.toBe(guide.path);
    expect(existsSync(template.path)).toBe(true);
    expect(existsSync(guide.path)).toBe(true);

    const templateDecoded = await nodeAssetPackPngDecoder.decode(readFileSync(template.path));
    const expectedBounds = geometryBounds(WALK_GEOMETRY);
    expect(templateDecoded.width).toBe(expectedBounds.width);
    expect(templateDecoded.height).toBe(expectedBounds.height);
    expect([...templateDecoded.pixels].every((value, index) => index % 4 !== 3 || value === 0))
      .toBe(true);

    const metadata = metadataFor(firstData);
    expect(metadata).toMatchObject({
      schema: 'lpc-toolkit.asset-authoring-artifact-metadata.v1',
      sessionId,
      contractDigest: firstData.checkpoint?.digest,
    });
    expect(metadata.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `template:${contract.targets[0]!.id}`,
        kind: 'template',
        targetPath: 'sprites/moon-braid/foreground/walk.png',
        importable: false,
        sessionId,
        contractDigest: firstData.checkpoint?.digest,
      }),
      expect.objectContaining({
        id: `guide:${contract.targets[0]!.id}`,
        kind: 'guide',
        importable: false,
        sessionId,
        contractDigest: firstData.checkpoint?.digest,
      }),
    ]));
    expect(metadata.artifacts.find((entry) => entry.kind === 'guide')?.path)
      .toBe(guide.path);

    const second = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'contract', '--session', sessionId,
    ], workspace.root, prepare);
    const secondData = dataOf(second.response);
    expect(second.code).toBe(0);
    expect(readFileSync(artifact(secondData, 'contract').path)).toEqual(contractBytes);
    expect(secondData.artifacts).toEqual(firstData.artifacts);
    expect(secondData.checkpoint).toEqual(firstData.checkpoint);
  });

  it('materializes an attributed blank-frame working copy and reference overlay without changing the base source', async () => {
    const root = createDirectory('lpc-authoring-contract-repair-');
    const workspace = initializeAssetWorkspace(path.join(root, 'workspace'));
    const runtime = createRuntime(path.join(root, 'runtime'), workspace.root);
    const sourcePath = path.join(
      runtime.context.assetsRoot,
      'spritesheets/hair/fixture/walk.png',
    );
    const sourceBefore = readFileSync(sourcePath);
    const planPath = writePlan(root, 'blank-repair-plan.json', blankRepairPlan());

    const started = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'start', '--plan', planPath,
    ], workspace.root);
    const sessionId = dataOf(started.response).sessionId;
    const contractResult = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'contract', '--session', sessionId,
    ], workspace.root, async () => runtime);
    const data = dataOf(contractResult.response);
    expect(contractResult.code).toBe(0);

    const contract = JSON.parse(readFileSync(artifact(data, 'contract').path, 'utf8')) as {
      readonly targets: readonly [{
        readonly id: string;
        readonly path: string;
        readonly cells: readonly { readonly policy: string; readonly sourceRow: number; readonly sourceColumn: number }[];
      }];
    };
    const target = contract.targets[0]!;
    expect(target.path).toBe('spritesheets/hair/fixture/walk.png');
    expect(target.cells.some((cell) => cell.policy === 'unchanged')).toBe(true);
    expect(target.cells).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceRow: 2, sourceColumn: 1, policy: 'required-drawn' }),
    ]));

    const workingCopy = artifact(data, `working-copy:${target.id}`);
    const reference = artifact(data, `reference:${target.id}`);
    expect(readFileSync(workingCopy.path)).toEqual(sourceBefore);
    expect(readFileSync(workingCopy.path)).toEqual(readFileSync(sourcePath));
    expect(readFileSync(reference.path)).not.toEqual(sourceBefore);
    expect(readFileSync(sourcePath)).toEqual(sourceBefore);

    const metadata = metadataFor(data);
    const referenceMetadata = metadata.artifacts.find((entry) => entry.id === reference.id);
    expect(referenceMetadata).toMatchObject({
      kind: 'reference-overlay',
      importable: false,
      targetId: target.id,
      targetPath: target.path,
      source: { logicalPath: target.path, digest: sha256(sourceBefore) },
      attribution: {
        authors: ['Fixture Artist'],
        licenses: ['GPL 3.0'],
      },
    });
    expect(referenceMetadata?.unchangedCells?.length).toBeGreaterThan(0);
    expect(metadata.artifacts.some((entry) => entry.kind === 'guide' && entry.importable))
      .toBe(false);
    expect(metadata.artifacts.some((entry) => entry.kind === 'reference-overlay' && entry.importable))
      .toBe(false);

    writeRealSource(sourcePath, 1);
    const stale = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'contract', '--session', sessionId,
    ], workspace.root, async () => runtime);
    expect(stale.code).toBe(1);
    expect(stale.response.errors[0]?.code).toBe('asset_authoring_planning_stale');

    const refreshed = await runJson<AuthoringResponseData>([
      'asset', 'authoring', 'contract', '--session', sessionId, '--refresh',
    ], workspace.root, async () => runtime);
    const refreshedData = dataOf(refreshed.response);
    expect(refreshed.code).toBe(0);
    expect(refreshedData.checkpoint?.digest).not.toBe(data.checkpoint?.digest);
  });
});
