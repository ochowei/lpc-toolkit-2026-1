import { createHash } from 'node:crypto';
import {
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
  ASSET_PACK_SCHEMA,
  normalizeAssetPack,
  standardAnimationGeometry,
  type AnimationName,
  type AssetPackAcknowledgement,
  type AssetPackSource,
  type ItemDefinition,
} from '@lpc-toolkit/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createRuntimeContext } from '../src/context.js';
import {
  initializeAssetWorkspace,
  type AssetWorkspace,
} from '../src/asset-workspace.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import {
  inspectAssetPackSources,
  loadActiveAssetPackBaseline,
  validateAssetPackDirectory,
} from '../src/asset-pack-validation.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

const temporaryDirectories: string[] = [];

const PACK_CREDITS = {
  authors: ['Alice'],
  licenses: ['CC-BY-SA 4.0'],
  urls: ['https://example.com/alice'],
  notes: '',
} as const;

const BASE_CREDIT = {
  file: 'hair/braid',
  authors: ['Base Artist'],
  licenses: ['GPL 3.0'],
  urls: ['https://example.com/base'],
  notes: 'Original braid baseline.',
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

function sha256Json(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)] as const);
    return Object.fromEntries(entries);
  }
  return value;
}

function expectedDefinitionDigest(item: ItemDefinition): string {
  const { credits: _credits, itemId: _itemId, sourcePath: _sourcePath, ...rest } = item;
  return sha256Json(canonicalize(rest));
}

function expectedCreditDigest(item: ItemDefinition): string {
  return sha256Json(canonicalize(item.credits));
}

function geometryBounds(animation: AnimationName): { width: number; height: number } {
  const geometry = standardAnimationGeometry(animation);
  const maxColumn = Math.max(
    ...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)),
  );
  return {
    width: (maxColumn + 1) * geometry.frameSize,
    height: geometry.rows.length * geometry.frameSize,
  };
}

function requiredCells(animation: AnimationName): readonly string[] {
  return standardAnimationGeometry(animation).rows.flatMap((row) =>
    row.cells.map((cell) => `${row.sourceRow}:${cell.sourceColumn}`),
  );
}

function writeSheetPng(
  filePath: string,
  animation: AnimationName,
  options: {
    readonly filledCells?: Readonly<Record<string, string>>;
    readonly width?: number;
    readonly height?: number;
  } = {},
): void {
  const bounds = geometryBounds(animation);
  const width = options.width ?? bounds.width;
  const height = options.height ?? bounds.height;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const cellColors = options.filledCells ?? {};
  const frameSize = standardAnimationGeometry(animation).frameSize;

  for (const [cell, color] of Object.entries(cellColors)) {
    const [rowText, columnText] = cell.split(':');
    const row = Number(rowText);
    const column = Number(columnText);
    context.fillStyle = color;
    context.fillRect(column * frameSize, row * frameSize, frameSize, frameSize);
  }

  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, canvas.toBuffer('image/png'));
}

function baseDefinition(overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    name: 'Braid',
    type_name: 'hair',
    animations: ['walk', 'climb'],
    credits: [BASE_CREDIT],
    variants: ['dark brown'],
    recolors: { material: 'hair', palettes: ['ulpc'] },
    layer_1: { zPos: 50, male: 'hair/braid/', female: 'hair/braid/' },
    ...overrides,
  };
}

function writePaletteFixtures(assetsRoot: string): void {
  writeJson(path.join(assetsRoot, 'palette_definitions', 'hair', 'meta_hair.json'), {
    type: 'material',
    default: 'ulpc',
    base: 'black',
  });
  writeJson(path.join(assetsRoot, 'palette_definitions', 'hair', 'hair_ulpc.json'), {
    black: ['#111111', '#222222'],
    orange: ['#cc5500', '#ee7700'],
  });
}

function createRuntimeFixture(options: {
  readonly ownedWorkspace?: boolean;
  readonly customDefinition?: ItemDefinition;
  readonly customDefinitionName?: string;
} = {}): {
  readonly cwd: string;
  readonly runtime: RuntimeAssets;
  readonly workspace?: AssetWorkspace;
} {
  const cwd = createDirectory('lpc-asset-pack-validation-runtime-');
  const assetsRoot = path.join(cwd, 'assets');
  writeJson(path.join(assetsRoot, 'sheet_definitions', 'hair', 'braid.json'), baseDefinition());
  writePaletteFixtures(assetsRoot);
  const store = createDirectoryAssetStore(assetsRoot);
  const runtime: RuntimeAssets = {
    context: createRuntimeContext({ cwd, assetsRoot, spritesheetsBaseUrl: store.baseUrl }),
    store,
    source: 'working-directory',
  };

  const workspace = options.ownedWorkspace ? initializeAssetWorkspace(cwd) : undefined;
  if (options.customDefinition) {
    const customRoot = workspace?.outputRoot ?? path.join(cwd, 'assets_custom');
    writeJson(
      path.join(
        customRoot,
        'sheet_definitions',
        'hair',
        `${options.customDefinitionName ?? 'braid'}.json`,
      ),
      options.customDefinition,
    );
  }

  return { cwd, runtime, ...(workspace ? { workspace } : {}) };
}

function newItemSource(
  sources: readonly {
    readonly animation: AnimationName;
    readonly source: string;
    readonly bodyTypes?: readonly ('male' | 'female')[];
  }[],
  overrides?: Partial<AssetPackSource>,
): AssetPackSource {
  return {
    schema: ASSET_PACK_SCHEMA,
    id: 'acme.wind-braid',
    version: '1.0.0',
    displayName: 'ACME Wind Braid',
    credits: PACK_CREDITS,
    assets: [{
      kind: 'new-item',
      localId: 'wind-braid',
      displayName: 'Wind Braid',
      typeName: 'hair',
      bodyTypes: ['male', 'female'],
      animations: [...new Set(sources.map((source) => source.animation))],
      variants: ['orange'],
      recolor: { material: 'hair', palettes: ['ulpc'] },
      layers: [{
        id: 'foreground',
        zPos: 120,
        sprites: sources.map((source) => ({
          animation: source.animation,
          source: source.source,
          ...(source.bodyTypes ? { bodyTypes: source.bodyTypes } : {}),
          variant: 'orange',
        })),
      }],
    }],
    ...overrides,
  };
}

function extendItemSource(
  digests: { readonly definition: string; readonly credit: string },
  acknowledgements?: readonly AssetPackAcknowledgement[],
): AssetPackSource {
  return {
    schema: ASSET_PACK_SCHEMA,
    id: 'acme.audit-braid',
    version: '1.0.0',
    displayName: 'ACME Audit Braid',
    credits: PACK_CREDITS,
    ...(acknowledgements ? { acknowledgements } : {}),
    assets: [{
      kind: 'extend-item',
      itemId: 'braid',
      baseDefinitionDigest: digests.definition,
      baseCreditDigest: digests.credit,
      addAnimations: [{
        animation: 'climb',
        layers: [{
          layer: 'layer_1',
          bodyTypes: ['female'],
          source: 'sprites/braid/climb-female.png',
          variant: 'dark brown',
          destination: {
            path: 'spritesheets/hair/braid/climb/dark_brown.png',
            evidence: 'audit-inferred',
            accepted: true,
          },
        }],
      }],
    }],
  };
}

function writePack(
  root: string,
  manifest: AssetPackSource,
  sources: Readonly<Record<string, Buffer | string>>,
): void {
  writeJson(path.join(root, 'asset-pack.json'), manifest);
  for (const [relativePath, contents] of Object.entries(sources)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
}

function snapshotTree(root: string): Readonly<Record<string, string>> {
  const snapshot: Record<string, string> = {};

  function visit(current: string): void {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      snapshot[relativePath] = readFileSync(absolutePath, 'utf8');
    }
  }

  visit(root);
  return snapshot;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('inspectAssetPackSources', () => {
  it('decodes bounded climb cells and records lowercase opaque palette colors when present or absent', async () => {
    const packRoot = createDirectory('lpc-asset-pack-validation-pack-');
    const source = newItemSource([
      { animation: 'climb', source: 'sprites/a-climb-colored.png' },
      { animation: 'climb', source: 'sprites/b-climb-transparent.png', bodyTypes: ['female'] },
    ]);
    writePack(packRoot, source, {});

    writeSheetPng(path.join(packRoot, 'sprites/a-climb-colored.png'), 'climb', {
      filledCells: Object.fromEntries(
        requiredCells('climb').map((cell, index) => [
          cell,
          index % 2 === 0 ? '#FF00AA' : '#00FF00',
        ]),
      ),
    });
    writeSheetPng(path.join(packRoot, 'sprites/b-climb-transparent.png'), 'climb');

    const inspections = await inspectAssetPackSources(packRoot, normalizeAssetPack(source));

    expect(inspections).toEqual([
      expect.objectContaining({
        sourcePath: 'sprites/a-climb-colored.png',
        regularFile: true,
        decoded: {
          width: 384,
          height: 64,
          nonTransparentCells: requiredCells('climb'),
          paletteColors: ['#00ff00', '#ff00aa'],
        },
      }),
      expect.objectContaining({
        sourcePath: 'sprites/b-climb-transparent.png',
        regularFile: true,
        decoded: {
          width: 384,
          height: 64,
          nonTransparentCells: [],
          paletteColors: [],
        },
      }),
    ]);
  });

  it('reports missing and corrupt source PNGs in deterministic source-path order', async () => {
    const packRoot = createDirectory('lpc-asset-pack-validation-pack-');
    const source = newItemSource([
      { animation: 'walk', source: 'sprites/b-corrupt.png' },
      { animation: 'climb', source: 'sprites/a-missing.png' },
    ]);
    writePack(packRoot, source, {
      'sprites/b-corrupt.png': 'not-a-png',
    });

    const inspections = await inspectAssetPackSources(packRoot, normalizeAssetPack(source));

    expect(inspections).toEqual([
      expect.objectContaining({
        sourcePath: 'sprites/a-missing.png',
        regularFile: false,
        error: 'missing',
      }),
      expect.objectContaining({
        sourcePath: 'sprites/b-corrupt.png',
        regularFile: true,
        error: 'decode-failed',
      }),
    ]);
  });
});

describe('loadActiveAssetPackBaseline', () => {
  it('ignores an unowned custom root, loads palettes, and excludes owned managed output digests', () => {
    const unmanaged = createRuntimeFixture({
      customDefinition: baseDefinition({ animations: ['run'], credits: [] }),
    });
    const unmanagedBaseline = loadActiveAssetPackBaseline({ runtime: unmanaged.runtime });

    expect(unmanagedBaseline.catalog.byItemId.get('braid')?.animations).toEqual(['walk', 'climb']);
    expect(unmanagedBaseline.palettes.materials.hair?.default).toBe('ulpc');

    const managed = createRuntimeFixture({
      ownedWorkspace: true,
      customDefinitionName: 'acme.wind-braid--wind-braid',
      customDefinition: baseDefinition({
        name: 'Managed Wind Braid',
        credits: [{
          file: 'hair/acme.wind-braid--wind-braid',
          authors: ['Pack Artist'],
          licenses: ['GPL 3.0'],
          urls: [],
          notes: 'Generated output.',
        }],
      }),
    });
    const managedBaseline = loadActiveAssetPackBaseline({
      runtime: managed.runtime,
      ...(managed.workspace ? { workspace: managed.workspace } : {}),
    });
    const braid = managedBaseline.catalog.byItemId.get('braid');

    expect(braid).toBeDefined();
    if (!braid) throw new Error('Expected baseline braid item.');

    expect(managedBaseline.definitionDigests.get('braid')).toBe(expectedDefinitionDigest(braid));
    expect(managedBaseline.creditDigests.get('braid')).toBe(expectedCreditDigest(braid));
    expect(managedBaseline.catalog.byItemId.has('acme.wind-braid--wind-braid')).toBe(true);
    expect(managedBaseline.definitionDigests.has('acme.wind-braid--wind-braid')).toBe(false);
    expect(managedBaseline.creditDigests.has('acme.wind-braid--wind-braid')).toBe(false);
  });
});

describe('validateAssetPackDirectory', () => {
  it('reports geometry, blank-cell, decode, missing, and incompatible-geometry diagnostics from inspected PNGs', async () => {
    const runtime = createRuntimeFixture().runtime;
    const packRoot = createDirectory('lpc-asset-pack-validation-pack-');
    const source = newItemSource([
      { animation: 'walk', source: 'sprites/a-wrong-dimensions.png' },
      { animation: 'walk', source: 'sprites/b-required-blank.png', bodyTypes: ['female'] },
      { animation: 'walk', source: 'sprites/c-optional-padding.png', bodyTypes: ['male'] },
      { animation: 'walk', source: 'sprites/d-missing.png' },
      { animation: 'climb', source: 'sprites/e-corrupt.png' },
    ], {
      assets: [{
        kind: 'new-item',
        localId: 'wind-braid',
        displayName: 'Wind Braid',
        typeName: 'hair',
        bodyTypes: ['male', 'female'],
        animations: ['walk', 'climb'],
        recolor: { material: 'hair', palettes: ['ulpc'] },
        layers: [{
          id: 'foreground',
          zPos: 120,
          sprites: [
            { animation: 'walk', source: 'sprites/a-wrong-dimensions.png', bodyTypes: ['male'] },
            { animation: 'walk', source: 'sprites/b-required-blank.png', bodyTypes: ['female'] },
            { animation: 'walk', source: 'sprites/c-optional-padding.png' },
            { animation: 'walk', source: 'sprites/d-missing.png' },
            { animation: 'climb', source: 'sprites/e-corrupt.png' },
            { animation: 'walk', source: 'sprites/shared.png' },
            { animation: 'climb', source: 'sprites/shared.png' },
          ],
        }],
      }],
    });
    writePack(packRoot, source, {
      'sprites/e-corrupt.png': 'not-a-png',
    });
    writeSheetPng(path.join(packRoot, 'sprites/a-wrong-dimensions.png'), 'walk', {
      width: 512,
      height: 256,
      filledCells: Object.fromEntries(requiredCells('walk').map((cell) => [cell, '#111111'])),
    });
    writeSheetPng(path.join(packRoot, 'sprites/b-required-blank.png'), 'walk', {
      filledCells: Object.fromEntries(
        requiredCells('walk')
          .filter((cell) => cell !== '0:1')
          .map((cell) => [cell, '#111111']),
      ),
    });
    writeSheetPng(path.join(packRoot, 'sprites/c-optional-padding.png'), 'walk', {
      filledCells: Object.fromEntries(requiredCells('walk').map((cell) => [cell, '#111111'])),
    });
    writeSheetPng(path.join(packRoot, 'sprites/shared.png'), 'walk', {
      filledCells: Object.fromEntries(requiredCells('walk').map((cell) => [cell, '#111111'])),
    });

    const report = await validateAssetPackDirectory({ packDirectory: packRoot, runtime });
    const codes = report.diagnostics.map((diagnostic) => diagnostic.code);

    expect(report.valid).toBe(false);
    expect(codes).toEqual(expect.arrayContaining([
      'asset_geometry_mismatch',
      'asset_required_frame_blank',
      'asset_optional_frame_blank',
      'asset_source_missing',
      'asset_png_decode_failed',
    ]));
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'asset_geometry_mismatch',
        sourcePath: 'sprites/shared.png',
      }),
    );

    const jsonSafe = JSON.parse(JSON.stringify(report)) as typeof report;
    expect(jsonSafe.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'asset_required_frame_blank',
        details: expect.objectContaining({ cells: expect.arrayContaining(['0:1']) }),
      }),
    ]));
  });

  it('uses active baseline digests, emits acknowledgement templates, accepts matching acknowledgements, and does not write runtime assets', async () => {
    const fixture = createRuntimeFixture();
    const baseline = loadActiveAssetPackBaseline({ runtime: fixture.runtime });
    const braid = baseline.catalog.byItemId.get('braid');

    expect(braid).toBeDefined();
    if (!braid) throw new Error('Expected braid baseline item.');

    const packRoot = createDirectory('lpc-asset-pack-validation-pack-');
    writePack(packRoot, extendItemSource({
      definition: baseline.definitionDigests.get('braid')!,
      credit: baseline.creditDigests.get('braid')!,
    }), {});
    writeSheetPng(path.join(packRoot, 'sprites/braid/climb-female.png'), 'climb', {
      filledCells: Object.fromEntries(requiredCells('climb').map((cell) => [cell, '#111111'])),
    });

    const beforeAssets = snapshotTree(fixture.runtime.context.assetsRoot);
    const firstPass = await validateAssetPackDirectory({
      packDirectory: packRoot,
      runtime: fixture.runtime,
    });
    const afterAssets = snapshotTree(fixture.runtime.context.assetsRoot);

    expect(beforeAssets).toEqual(afterAssets);
    expect(firstPass.valid).toBe(false);
    expect(firstPass.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_path_inferred', severity: 'warning' }),
    ]));
    const acknowledgement = firstPass.acknowledgementRecords.find(
      (record) => record.code === 'asset_path_inferred',
    );
    expect(acknowledgement).toBeDefined();
    if (!acknowledgement) {
      throw new Error('Expected an acknowledgement template.');
    }

    writePack(
      packRoot,
      extendItemSource({
        definition: baseline.definitionDigests.get('braid')!,
        credit: baseline.creditDigests.get('braid')!,
      }, [{
        ...acknowledgement,
        reason: 'Reviewed and accepted the inferred path.',
      }]),
      {
        'sprites/braid/climb-female.png': readFileSync(path.join(packRoot, 'sprites/braid/climb-female.png')),
      },
    );

    const accepted = await validateAssetPackDirectory({
      packDirectory: packRoot,
      runtime: fixture.runtime,
    });
    expect(accepted.valid).toBe(true);

    writePack(packRoot, extendItemSource({
      definition: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      credit: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    }), {
      'sprites/braid/climb-female.png': readFileSync(path.join(packRoot, 'sprites/braid/climb-female.png')),
    });

    const drifted = await validateAssetPackDirectory({
      packDirectory: packRoot,
      runtime: fixture.runtime,
    });
    expect(drifted.valid).toBe(false);
    expect(drifted.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_base_definition_changed' }),
      expect.objectContaining({ code: 'asset_base_credit_changed' }),
    ]));
  });
});
