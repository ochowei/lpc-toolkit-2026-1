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
  type AssetPackSource,
  type ItemDefinition,
  type SelectionJson,
} from '@lpc-toolkit/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetAnimationAuditReport } from '../src/animation-audit.js';
import type { AssetPackDoctorReport } from '../src/asset-pack-doctor.js';
import type { AssetPackInspectionReport } from '../src/asset-pack-inspection.js';
import type { AssetPackListEntry } from '../src/asset-pack-remove.js';
import type { AssetPackPreviewResult } from '../src/asset-pack-preview.js';
import type { AssetPackValidationReport } from '../src/asset-pack-validation.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import type { AssetWorkspace } from '../src/asset-workspace.js';
import { createRuntimeContext } from '../src/context.js';
import { runCli } from '../src/main.js';
import type { CliResponse } from '../src/response.js';
import type {
  PrepareRuntimeAssetsOptions,
  RuntimeAssets,
} from '../src/runtime-assets.js';

const temporaryDirectories: string[] = [];

interface CommandResult<T> {
  readonly code: number;
  readonly response: CliResponse<T>;
  readonly stderr: string;
}

interface ScaffoldResult {
  readonly packRoot: string;
  readonly manifestPath: string;
}

interface PackResult {
  readonly packId: string;
  readonly version: string;
  readonly contentDigest: string;
  readonly archiveDigest: string;
  readonly archivePath: string;
  readonly entryCount: number;
}

interface InstallResult {
  readonly action: 'installed' | 'unchanged' | 'upgraded' | 'downgraded';
  readonly packId: string;
  readonly version: string;
  readonly archiveDigest: string;
  readonly installedDirectory: string;
  readonly outputPath: string;
  readonly generatedFileCount: number;
}

interface ListResult {
  readonly recovery: 'none' | 'rolled-back' | 'completed';
  readonly entries: readonly AssetPackListEntry[];
}

interface RemoveResult {
  readonly packId: string;
  readonly removedKind: 'linked' | 'installed';
  readonly remainingPackIds: readonly string[];
  readonly remainingCount: number;
  readonly generatedFileCount: number;
}

interface ArtifactResult {
  readonly artifacts: readonly {
    readonly type: string;
    readonly path: string;
  }[];
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

function geometryBounds(animation: AnimationName): {
  readonly width: number;
  readonly height: number;
} {
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

function writeBaseDefinition(
  cacheRoot: string,
  relativePath: string,
  definition: ItemDefinition,
  animations: Readonly<Record<string, string>>,
): void {
  writeJson(path.join(cacheRoot, 'sheet_definitions', relativePath), definition);
  const spriteRoot = definition.layer_1?.male;
  if (typeof spriteRoot !== 'string') throw new Error('Fixture requires a male layer path.');
  for (const [animation, color] of Object.entries(animations)) {
    writeSheetPng(
      path.join(cacheRoot, 'spritesheets', spriteRoot, `${animation}.png`),
      animation as AnimationName,
      color,
    );
  }
}

function createPreparedCache(cacheRoot: string): void {
  writeBaseDefinition(cacheRoot, 'body/body.json', {
    name: 'Body Color',
    type_name: 'body',
    animations: ['walk', 'climb'],
    credits: [{
      file: 'body/base',
      authors: ['Base Body Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.test/base-body'],
      notes: '',
    }],
    recolors: { material: 'skin', palettes: ['ulpc'] },
    layer_1: { zPos: 10, male: 'body/base/', female: 'body/base/' },
  }, { walk: '#775533', climb: '#775533' });
  writeBaseDefinition(cacheRoot, 'hair/hair_messy.json', {
    name: 'Messy',
    type_name: 'hair',
    animations: ['walk', 'climb'],
    credits: [{
      file: 'hair/messy',
      authors: ['Base Hair Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.test/base-hair'],
      notes: 'Original messy hair.',
    }],
    layer_1: { zPos: 50, male: 'hair/messy/', female: 'hair/messy/' },
  }, { walk: '#553311' });
  writeJson(path.join(cacheRoot, 'palette_definitions/skin/meta_skin.json'), {
    type: 'material',
    default: 'ulpc',
    base: 'light',
  });
  writeJson(path.join(cacheRoot, 'palette_definitions/skin/skin_ulpc.json'), {
    light: ['#775533'],
  });
  writeFileSync(
    path.join(cacheRoot, 'CREDITS.csv'),
    'filename,notes,authors,licenses,urls\n',
  );
  writeFileSync(path.join(cacheRoot, 'sentinel.txt'), 'prepared cache must stay unchanged\n');
}

function createRuntime(cacheRoot: string, cwd: string): RuntimeAssets {
  const store = createDirectoryAssetStore(cacheRoot);
  return {
    context: createRuntimeContext({
      cwd,
      assetsRoot: cacheRoot,
      customAssetsRoot: path.join(cwd, 'assets_custom'),
      spritesheetsBaseUrl: store.baseUrl,
    }),
    store,
    source: 'managed-cache',
    releaseTag: 'test-pinned-release',
  };
}

function snapshotTree(root: string): Readonly<Record<string, string>> {
  const snapshot: Record<string, string> = {};
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

function sourceAnimations(pack: AssetPackSource): readonly {
  readonly source: string;
  readonly animation: AnimationName;
}[] {
  return pack.assets.flatMap((asset) => asset.kind === 'new-item'
    ? asset.layers.flatMap((layer) => layer.sprites.map((sprite) => ({
      source: sprite.source,
      animation: sprite.animation,
    })))
    : asset.addAnimations.flatMap((animation) => animation.layers.map((layer) => ({
      source: layer.source,
      animation: animation.animation,
    }))));
}

async function runJson<T>(
  argv: readonly string[],
  cwd: string,
  prepareRuntimeAssets: (
    options: PrepareRuntimeAssetsOptions,
  ) => Promise<RuntimeAssets>,
): Promise<CommandResult<T>> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli([...argv, '--json'], {
    cwd,
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  }, { prepareRuntimeAssets });
  return {
    code,
    response: JSON.parse(stdout.join('')) as CliResponse<T>,
    stderr: stderr.join(''),
  };
}

function successfulData<T>(result: CommandResult<T>): T {
  expect(
    result.code,
    `${result.stderr}\n${JSON.stringify(result.response)}`,
  ).toBe(0);
  expect(result.response.ok).toBe(true);
  expect(result.response.errors).toEqual([]);
  if (result.response.data === null) throw new Error('Expected successful command data.');
  return result.response.data;
}

function artifactPath(result: ArtifactResult, type: string): string {
  const artifact = result.artifacts.find((candidate) => candidate.type === type);
  if (!artifact) throw new Error(`Missing ${type} artifact.`);
  return artifact.path;
}

function expectContained(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  expect(relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  )).toBe(true);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('public CLI two-workspace asset-pack lifecycle', () => {
  it('packs in one clean workspace and installs, upgrades, renders, removes, and diagnoses in another', async () => {
    const consumerRoot = createDirectory('lpc-asset-lifecycle-e2e-');
    const authorRoot = path.join(consumerRoot, 'workspace-a');
    const consumerWorkspaceRoot = path.join(consumerRoot, 'workspace-b');
    const cacheRoot = path.join(consumerRoot, 'prepared-cache');
    mkdirSync(cacheRoot, { recursive: true });
    createPreparedCache(cacheRoot);
    const cacheBefore = snapshotTree(cacheRoot);

    const prepare = vi.fn(async (options: PrepareRuntimeAssetsOptions) => {
      expect([authorRoot, consumerWorkspaceRoot]).toContain(path.resolve(options.cwd));
      return createRuntime(cacheRoot, options.cwd);
    });
    const forbiddenPrepare = vi.fn(async (_options: PrepareRuntimeAssetsOptions) => {
      throw new Error('workspace init reached runtime preparation');
    });

    const authorWorkspace = successfulData(await runJson<AssetWorkspace>([
      'asset', 'workspace', 'init', authorRoot,
    ], consumerRoot, forbiddenPrepare));
    const consumerWorkspace = successfulData(await runJson<AssetWorkspace>([
      'asset', 'workspace', 'init', consumerWorkspaceRoot,
    ], consumerRoot, forbiddenPrepare));
    expect(forbiddenPrepare).not.toHaveBeenCalled();

    const newPack = successfulData(await runJson<ScaffoldResult>([
      'asset', 'init', '--new',
      '--pack-id', 'acme.fantasy-hair',
      '--version', '1.0.0',
      '--asset-id', 'moon-braid',
      '--display-name', 'Moon Braid',
      '--type', 'hair',
      '--body-type', 'male',
      '--body-type', 'female',
      '--animation', 'walk',
      '--animation', 'climb',
      '--author', 'New Hair Artist',
      '--license', 'CC-BY-SA 4.0',
      '--url', 'https://example.test/acme/fantasy-hair',
    ], authorRoot, prepare));

    const auditPath = path.join(authorRoot, 'hair-messy-climb-audit.json');
    const auditFixture: CliResponse<AssetAnimationAuditReport> = {
      ok: true,
      command: 'catalog audit-animations',
      data: {
        targets: ['climb'],
        scope: { typeName: 'hair', bodyType: 'male' },
        summary: {
          itemsScanned: 1,
          incompleteItems: 1,
          unsupported: 0,
          missingFiles: 1,
          blankFrames: 0,
          errors: 0,
        },
        unsupported: [],
        missingFiles: [{
          path: 'spritesheets/hair/messy/climb.png',
          animation: 'climb',
          sourceAnimation: 'climb',
          consumers: [{
            itemId: 'hair_messy',
            typeName: 'hair',
            layer: 'layer_1',
            bodyTypes: ['male', 'female'],
            recolors: [],
          }],
        }],
        blankFrames: [],
        errors: [],
      },
      warnings: [],
      errors: [],
    };
    writeJson(auditPath, auditFixture);
    const extensionPack = successfulData(await runJson<ScaffoldResult>([
      'asset', 'init', '--from-audit', auditPath,
      '--item', 'hair_messy',
      '--animation', 'climb',
      '--pack-id', 'acme.messy-climb',
      '--version', '1.0.0',
      '--display-name', 'Messy Hair Climb',
      '--author', 'Extension Artist',
      '--license', 'CC-BY-SA 4.0',
      '--url', 'https://example.test/acme/messy-climb',
    ], authorRoot, prepare));

    for (const [index, sprite] of sourceAnimations(
      readJson<AssetPackSource>(newPack.manifestPath),
    ).entries()) {
      writeSheetPng(
        path.join(newPack.packRoot, sprite.source),
        sprite.animation,
        index === 0 ? '#9955cc' : '#aa66dd',
      );
    }
    for (const sprite of sourceAnimations(
      readJson<AssetPackSource>(extensionPack.manifestPath),
    )) {
      writeSheetPng(
        path.join(extensionPack.packRoot, sprite.source),
        sprite.animation,
        '#2277aa',
      );
    }

    for (const packRoot of [newPack.packRoot, extensionPack.packRoot]) {
      const validation = successfulData(await runJson<AssetPackValidationReport>([
        'asset', 'validate', packRoot,
      ], authorRoot, prepare));
      expect(validation.valid).toBe(true);
    }
    const preview = successfulData(await runJson<AssetPackPreviewResult>([
      'asset', 'preview', newPack.packRoot,
      '--asset', 'moon-braid',
      '--animation', 'climb',
    ], authorRoot, prepare));
    expect(readFileSync(path.join(preview.outDir, 'moon-braid.credits.txt'), 'utf8'))
      .toContain('New Hair Artist');

    for (const packRoot of [newPack.packRoot, extensionPack.packRoot]) {
      successfulData(await runJson([
        'asset', 'sync', packRoot,
      ], authorRoot, prepare));
    }
    const moonV1 = successfulData(await runJson<PackResult>([
      'asset', 'pack', newPack.packRoot,
    ], authorRoot, prepare));
    const messyV1 = successfulData(await runJson<PackResult>([
      'asset', 'pack', extensionPack.packRoot,
    ], authorRoot, prepare));
    expect(moonV1.version).toBe('1.0.0');
    expect(messyV1.version).toBe('1.0.0');
    expectContained(authorRoot, moonV1.archivePath);
    expectContained(authorRoot, messyV1.archivePath);

    for (const packed of [moonV1, messyV1]) {
      const inspection = successfulData(await runJson<AssetPackInspectionReport>([
        'asset', 'inspect', packed.archivePath,
      ], consumerWorkspaceRoot, prepare));
      expect(inspection).toMatchObject({
        valid: true,
        archiveDigest: packed.archiveDigest,
        packId: packed.packId,
        version: packed.version,
      });
      expect(inspection.diagnostics).toEqual([]);
    }

    const moonInstall = successfulData(await runJson<InstallResult>([
      'asset', 'install', moonV1.archivePath,
    ], consumerWorkspaceRoot, prepare));
    const messyInstall = successfulData(await runJson<InstallResult>([
      'asset', 'install', messyV1.archivePath,
    ], consumerWorkspaceRoot, prepare));
    expect(moonInstall.action).toBe('installed');
    expect(messyInstall.action).toBe('installed');
    expectContained(consumerWorkspaceRoot, moonInstall.installedDirectory);
    expectContained(consumerWorkspaceRoot, messyInstall.installedDirectory);

    const installedList = successfulData(await runJson<ListResult>([
      'asset', 'list',
    ], consumerWorkspaceRoot, prepare));
    expect(installedList).toMatchObject({ recovery: 'none' });
    expect(installedList.entries.map(({ packId, version, kind }) => [
      packId,
      version,
      kind,
    ])).toEqual([
      ['acme.fantasy-hair', '1.0.0', 'installed'],
      ['acme.messy-climb', '1.0.0', 'installed'],
    ]);

    const installedAudit = successfulData(await runJson<AssetAnimationAuditReport>([
      'catalog', 'audit-animations',
      '--animation', 'climb',
      '--type', 'hair',
      '--body-type', 'male',
    ], consumerWorkspaceRoot, prepare));
    expect(installedAudit.summary).toMatchObject({
      itemsScanned: 2,
      incompleteItems: 0,
      missingFiles: 0,
      unsupported: 0,
      blankFrames: 0,
      errors: 0,
    });

    const stableHairIdentity = 'acme.fantasy-hair--moon-braid';
    const installedSelection: SelectionJson = {
      schema: 'lpc-toolkit.selection.v1',
      name: 'installed-hero',
      bodyType: 'male',
      items: {
        body: { name: 'Body Color', recolor: 'light' },
        hair: { name: stableHairIdentity },
      },
    };
    const installedSelectionPath = path.join(
      consumerWorkspaceRoot,
      'characters',
      'installed-hero.selection.json',
    );
    writeJson(installedSelectionPath, installedSelection);
    const selectionBeforeUpgrade = readFileSync(installedSelectionPath);

    const installedPreview = successfulData(await runJson<ArtifactResult>([
      'character', 'preview', 'installed-hero',
      '--animation', 'climb',
      '--direction', 'up',
    ], consumerWorkspaceRoot, prepare));
    const previewTxt = artifactPath(installedPreview, 'credits_txt');
    const previewCsv = artifactPath(installedPreview, 'credits_csv');
    expect(readFileSync(previewTxt, 'utf8')).toContain('Base Body Artist');
    expect(readFileSync(previewTxt, 'utf8')).toContain('New Hair Artist');
    expect(readFileSync(previewCsv, 'utf8')).toContain('Base Body Artist');
    expect(readFileSync(previewCsv, 'utf8')).toContain('New Hair Artist');

    const installedRender = successfulData(await runJson<ArtifactResult>([
      'character', 'render', 'installed-hero',
      '--out', path.join(consumerWorkspaceRoot, 'rendered-installed-hero'),
      '--animation', 'climb',
    ], consumerWorkspaceRoot, prepare));
    const renderTxt = artifactPath(installedRender, 'credits_txt');
    const renderCsv = artifactPath(installedRender, 'credits_csv');
    expect(readFileSync(renderTxt, 'utf8')).toContain('Base Body Artist');
    expect(readFileSync(renderTxt, 'utf8')).toContain('New Hair Artist');
    expect(readFileSync(renderCsv, 'utf8')).toContain('Base Body Artist');
    expect(readFileSync(renderCsv, 'utf8')).toContain('New Hair Artist');
    for (const artifact of [...installedPreview.artifacts, ...installedRender.artifacts]) {
      expectContained(consumerWorkspaceRoot, artifact.path);
    }

    const upgradedSource = {
      ...readJson<AssetPackSource>(newPack.manifestPath),
      version: '2.0.0',
    } satisfies AssetPackSource;
    writeJson(newPack.manifestPath, upgradedSource);
    for (const sprite of sourceAnimations(upgradedSource)) {
      writeSheetPng(
        path.join(newPack.packRoot, sprite.source),
        sprite.animation,
        '#cc77ee',
      );
    }
    successfulData(await runJson([
      'asset', 'sync', newPack.packRoot,
    ], authorRoot, prepare));
    const moonV2 = successfulData(await runJson<PackResult>([
      'asset', 'pack', newPack.packRoot,
    ], authorRoot, prepare));
    expect(moonV2.version).toBe('2.0.0');
    const upgraded = successfulData(await runJson<InstallResult>([
      'asset', 'install', moonV2.archivePath,
    ], consumerWorkspaceRoot, prepare));
    expect(upgraded.action).toBe('upgraded');
    expect(readFileSync(installedSelectionPath)).toEqual(selectionBeforeUpgrade);
    const installedDefinition = readJson<ItemDefinition>(path.join(
      consumerWorkspace.outputRoot,
      'sheet_definitions',
      'hair',
      `${stableHairIdentity}.json`,
    ));
    expect(installedDefinition.name).toBe(stableHairIdentity);
    expect(installedDefinition.display_name).toBe('Moon Braid');

    const upgradedList = successfulData(await runJson<ListResult>([
      'asset', 'list',
    ], consumerWorkspaceRoot, prepare));
    expect(upgradedList.entries.map(({ packId, version }) => [packId, version])).toEqual([
      ['acme.fantasy-hair', '2.0.0'],
      ['acme.messy-climb', '1.0.0'],
    ]);

    const removed = successfulData(await runJson<RemoveResult>([
      'asset', 'remove', 'acme.fantasy-hair',
    ], consumerWorkspaceRoot, prepare));
    expect(removed).toMatchObject({
      packId: 'acme.fantasy-hair',
      removedKind: 'installed',
      remainingPackIds: ['acme.messy-climb'],
      remainingCount: 1,
    });
    expect(existsSync(upgraded.installedDirectory)).toBe(false);
    expect(existsSync(messyInstall.installedDirectory)).toBe(true);

    const remainingAudit = successfulData(await runJson<AssetAnimationAuditReport>([
      'catalog', 'audit-animations',
      '--animation', 'climb',
      '--type', 'hair',
      '--body-type', 'male',
    ], consumerWorkspaceRoot, prepare));
    expect(remainingAudit.summary).toMatchObject({
      itemsScanned: 1,
      incompleteItems: 0,
      missingFiles: 0,
      unsupported: 0,
      blankFrames: 0,
      errors: 0,
    });
    expect(remainingAudit.missingFiles).not.toContainEqual(expect.objectContaining({
      path: 'spritesheets/hair/messy/climb.png',
    }));

    const extensionSelection: SelectionJson = {
      ...installedSelection,
      name: 'extension-hero',
      items: {
        ...installedSelection.items,
        hair: { name: 'Messy' },
      },
    };
    const extensionSelectionPath = path.join(
      consumerWorkspaceRoot,
      'characters',
      'extension-hero.selection.json',
    );
    writeJson(extensionSelectionPath, extensionSelection);
    const remainingRender = successfulData(await runJson<ArtifactResult>([
      'character', 'render', 'extension-hero',
      '--out', path.join(consumerWorkspaceRoot, 'rendered-extension-hero'),
      '--animation', 'climb',
    ], consumerWorkspaceRoot, prepare));
    const remainingTxt = readFileSync(artifactPath(remainingRender, 'credits_txt'), 'utf8');
    const remainingCsv = readFileSync(artifactPath(remainingRender, 'credits_csv'), 'utf8');
    expect(remainingTxt).toContain('Base Body Artist');
    expect(remainingTxt).toContain('Base Hair Artist');
    expect(remainingTxt).toContain('Extension Artist');
    expect(remainingCsv).toContain('Base Body Artist');
    expect(remainingCsv).toContain('Base Hair Artist');
    expect(remainingCsv).toContain('Extension Artist');

    const doctor = successfulData(await runJson<AssetPackDoctorReport>([
      'asset', 'doctor',
    ], consumerWorkspaceRoot, prepare));
    expect(doctor).toMatchObject({
      schema: 'lpc-toolkit.asset-pack-doctor.v1',
      healthy: true,
      recovery: 'none',
    });
    expect(doctor.packs.map(({ packId, kind }) => [packId, kind])).toEqual([
      ['acme.messy-climb', 'installed'],
    ]);
    expect(doctor.checks.every(({ status }) => status === 'pass')).toBe(true);

    expect(snapshotTree(cacheRoot)).toEqual(cacheBefore);
    expect(readFileSync(path.join(cacheRoot, 'sentinel.txt'), 'utf8'))
      .toBe('prepared cache must stay unchanged\n');
    expect(readdirSync(consumerRoot).sort()).toEqual([
      'prepared-cache',
      'workspace-a',
      'workspace-b',
    ]);
    expect(authorWorkspace.root).toBe(authorRoot);
    expect(consumerWorkspace.root).toBe(consumerWorkspaceRoot);
    for (const workspaceRoot of [authorRoot, consumerWorkspaceRoot]) {
      expect(existsSync(path.join(workspaceRoot, '.git'))).toBe(false);
      expect(existsSync(path.join(workspaceRoot, 'assets'))).toBe(false);
    }
    expect(prepare).toHaveBeenCalled();
  }, 60_000);
});
