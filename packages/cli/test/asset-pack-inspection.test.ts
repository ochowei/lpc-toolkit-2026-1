import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import {
  ASSET_PACK_SCHEMA,
  standardAnimationGeometry,
  type AnimationName,
  type AssetPackAcknowledgement,
  type AssetPackSource,
  type ItemDefinition,
} from '@lpc-toolkit/core';
import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ASSET_PACK_CHECKSUMS_SCHEMA,
  createDeterministicAssetPackArchive,
} from '../src/asset-pack-archive-format.js';
import {
  SUPPORTED_ASSET_PACK_CAPABILITIES,
} from '../src/asset-pack-compatibility.js';
import { inspectAssetPackArchive } from '../src/asset-pack-inspection.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { createRuntimeContext } from '../src/context.js';
import { CLI_VERSION } from '../src/package-info.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

const temporaryDirectories: string[] = [];
const SOURCE_PATH = 'sprites/wind-braid/climb.png';
const ARCHIVE_PATH = '/fixtures/acme.wind-braid.lpc-assets.zip';
const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PACK_CREDITS = {
  authors: ['Alice'],
  licenses: ['CC-BY-SA 4.0'],
  urls: ['https://example.com/alice'],
  notes: 'Archive attribution fixture.',
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

function baseDefinition(): ItemDefinition {
  return {
    name: 'Braid',
    type_name: 'hair',
    animations: ['walk', 'climb'],
    credits: [{
      file: 'hair/braid',
      authors: ['Base Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.com/base'],
      notes: 'Baseline attribution fixture.',
    }],
    variants: ['black'],
    recolors: { material: 'hair', palettes: ['ulpc'] },
    layer_1: { zPos: 50, male: 'hair/braid/', female: 'hair/braid/' },
  };
}

function createRuntimeFixture(): RuntimeAssets {
  const cwd = createDirectory('lpc-asset-pack-inspection-runtime-');
  const assetsRoot = path.join(cwd, 'assets');
  writeJson(path.join(assetsRoot, 'sheet_definitions', 'hair', 'braid.json'), baseDefinition());
  writeJson(path.join(assetsRoot, 'palette_definitions', 'hair', 'meta_hair.json'), {
    type: 'material',
    default: 'ulpc',
    base: 'black',
  });
  writeJson(path.join(assetsRoot, 'palette_definitions', 'hair', 'hair_ulpc.json'), {
    black: ['#111111', '#222222'],
  });
  const store = createDirectoryAssetStore(assetsRoot);
  return {
    context: createRuntimeContext({ cwd, assetsRoot, spritesheetsBaseUrl: store.baseUrl }),
    store,
    source: 'working-directory',
  };
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

function sheetPng(
  animation: AnimationName,
  filledCells: Readonly<Record<string, string>>,
): Buffer {
  const bounds = geometryBounds(animation);
  const geometry = standardAnimationGeometry(animation);
  const canvas = createCanvas(bounds.width, bounds.height);
  const context = canvas.getContext('2d');

  for (const [cell, color] of Object.entries(filledCells)) {
    const [rowText, columnText] = cell.split(':');
    context.fillStyle = color;
    context.fillRect(
      Number(columnText) * geometry.frameSize,
      Number(rowText) * geometry.frameSize,
      geometry.frameSize,
      geometry.frameSize,
    );
  }

  return canvas.toBuffer('image/png');
}

function filledRequiredCells(animation: AnimationName): Readonly<Record<string, string>> {
  return Object.fromEntries(requiredCells(animation).map((cell, index) => [
    cell,
    index % 2 === 0 ? '#111111' : '#222222',
  ]));
}

function newItemSource(options: {
  readonly animation?: AnimationName;
  readonly sourcePath?: string;
  readonly compatibility?: AssetPackSource['compatibility'];
  readonly acknowledgements?: readonly AssetPackAcknowledgement[];
  readonly sprites?: readonly {
    readonly animation: AnimationName;
    readonly source: string;
    readonly bodyTypes?: readonly ('male' | 'female')[];
  }[];
  readonly recolorPalettes?: readonly string[];
} = {}): AssetPackSource {
  const animation = options.animation ?? 'climb';
  const sourcePath = options.sourcePath ?? SOURCE_PATH;
  return {
    schema: ASSET_PACK_SCHEMA,
    id: 'acme.wind-braid',
    version: '1.0.0',
    displayName: 'ACME Wind Braid',
    credits: PACK_CREDITS,
    ...(options.compatibility ? { compatibility: options.compatibility } : {}),
    ...(options.acknowledgements ? { acknowledgements: options.acknowledgements } : {}),
    assets: [{
      kind: 'new-item',
      localId: 'wind-braid',
      displayName: 'Wind Braid',
      typeName: 'hair',
      bodyTypes: ['male', 'female'],
      animations: [animation],
      variants: ['black'],
      recolor: { material: 'hair', palettes: options.recolorPalettes ?? ['ulpc'] },
      layers: [{
        id: 'foreground',
        zPos: 120,
        sprites: options.sprites ?? [{ animation, source: sourcePath, variant: 'black' }],
      }],
    }],
  };
}

function extensionSource(): AssetPackSource {
  return {
    schema: ASSET_PACK_SCHEMA,
    id: 'acme.audit-braid',
    version: '1.0.0',
    displayName: 'ACME Audit Braid',
    credits: PACK_CREDITS,
    assets: [{
      kind: 'extend-item',
      itemId: 'braid',
      baseDefinitionDigest: `sha256:${'a'.repeat(64)}`,
      baseCreditDigest: `sha256:${'b'.repeat(64)}`,
      addAnimations: [{
        animation: 'climb',
        layers: [{
          layer: 'layer_1',
          bodyTypes: ['female'],
          source: SOURCE_PATH,
          variant: 'black',
          destination: {
            path: 'spritesheets/hair/braid/climb/black.png',
            evidence: 'artist-specified',
            accepted: true,
          },
        }],
      }],
    }],
  };
}

async function archiveFor(
  source: AssetPackSource,
  sourceBytes: ReadonlyMap<string, Buffer> = new Map([[
    SOURCE_PATH,
    sheetPng('climb', filledRequiredCells('climb')),
  ]]),
): Promise<Buffer> {
  return createDeterministicAssetPackArchive({
    manifestBytes: Buffer.from(`${JSON.stringify(source, null, 2)}\n`),
    sourceBytes,
  });
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function uncheckedArchive(
  manifestBytes: Buffer,
  sourceBytes: ReadonlyMap<string, Buffer> = new Map(),
): Promise<Buffer> {
  const payloadFiles = new Map<string, Buffer>([
    ['asset-pack.json', manifestBytes],
    ...sourceBytes,
  ]);
  const checksumsBytes = Buffer.from(`${JSON.stringify({
    schema: ASSET_PACK_CHECKSUMS_SCHEMA,
    files: [...payloadFiles]
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([entryPath, bytes]) => ({
        path: entryPath,
        size: bytes.byteLength,
        sha256: sha256(bytes),
      })),
  }, null, 2)}\n`);
  const zip = new JSZip();
  for (const [entryPath, bytes] of [...payloadFiles, ['checksums.json', checksumsBytes] as const]) {
    zip.file(entryPath, bytes, {
      binary: true,
      date: new Date(Date.UTC(1980, 0, 1, 0, 0, 0)),
      createFolders: false,
      unixPermissions: 0o100644,
    });
  }
  return zip.generateAsync({
    type: 'nodebuffer',
    platform: 'UNIX',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    streamFiles: false,
  });
}

function inspectArchiveInIsolatedProcess(
  archivePath: string,
  assetsRoot: string,
): ReturnType<typeof spawnSync> {
  const inspectionUrl = new URL('../src/asset-pack-inspection.ts', import.meta.url).href;
  const assetStoreUrl = new URL('../src/asset-store.ts', import.meta.url).href;
  const contextUrl = new URL('../src/context.ts', import.meta.url).href;
  const probe = `
    import { readFileSync } from 'node:fs';
    import path from 'node:path';
    import { inspectAssetPackArchive } from ${JSON.stringify(inspectionUrl)};
    import { createDirectoryAssetStore } from ${JSON.stringify(assetStoreUrl)};
    import { createRuntimeContext } from ${JSON.stringify(contextUrl)};

    const [archivePath, assetsRoot] = process.argv.slice(1);
    if (!archivePath || !assetsRoot) throw new Error('Missing probe paths.');
    const store = createDirectoryAssetStore(assetsRoot);
    const result = await inspectAssetPackArchive({
      archivePath,
      archiveBytes: readFileSync(archivePath),
      runtime: {
        context: createRuntimeContext({
          cwd: path.dirname(assetsRoot),
          assetsRoot,
          spritesheetsBaseUrl: store.baseUrl,
        }),
        store,
        source: 'working-directory',
      },
    });
    process.stdout.write(JSON.stringify({
      report: result.report,
      hasSnapshot: result.snapshot !== undefined,
    }));
  `;

  return spawnSync(process.execPath, [
    '--import',
    'tsx',
    '--input-type=module',
    '--eval',
    probe,
    archivePath,
    assetsRoot,
  ], {
    cwd: CLI_ROOT,
    encoding: 'utf8',
    timeout: 15_000,
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('inspectAssetPackArchive compatibility and archive validation', () => {
  it.each([
    { label: 'absent compatibility', compatibility: undefined },
    { label: 'a lower minimum CLI', compatibility: { minimumCliVersion: '0.0.0' } },
    { label: 'the running CLI version', compatibility: { minimumCliVersion: CLI_VERSION } },
  ])('accepts $label', async ({ compatibility }) => {
    const source = newItemSource({
      ...(compatibility ? { compatibility } : {}),
    });
    const result = await inspectAssetPackArchive({
      archivePath: ARCHIVE_PATH,
      archiveBytes: await archiveFor(source),
      runtime: createRuntimeFixture(),
    });

    expect(result.report.valid).toBe(true);
    expect(result.report.diagnostics).toEqual([]);
    expect(result.snapshot).toBeDefined();
  });

  it('accepts the exact supported capability set', async () => {
    expect(SUPPORTED_ASSET_PACK_CAPABILITIES).toEqual([
      'lpc-toolkit.asset-pack.v1',
      'lpc-toolkit.asset-pack.lifecycle.v1',
    ]);
    const result = await inspectAssetPackArchive({
      archivePath: ARCHIVE_PATH,
      archiveBytes: await archiveFor(newItemSource({
        compatibility: { requiredCapabilities: [...SUPPORTED_ASSET_PACK_CAPABILITIES] },
      })),
      runtime: createRuntimeFixture(),
    });

    expect(result.report.valid).toBe(true);
    expect(result.snapshot).toBeDefined();
  });

  it('rejects a higher minimum CLI and an unknown capability deterministically', async () => {
    const archiveBytes = await archiveFor(newItemSource({
      compatibility: {
        minimumCliVersion: '999.0.0',
        requiredCapabilities: ['lpc-toolkit.asset-pack.future.v1'],
      },
    }));
    const options = {
      archivePath: ARCHIVE_PATH,
      archiveBytes,
      runtime: createRuntimeFixture(),
    } as const;
    const first = await inspectAssetPackArchive(options);
    const second = await inspectAssetPackArchive({ ...options, runtime: createRuntimeFixture() });

    expect(first.report.valid).toBe(false);
    expect(first.report.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'asset_cli_version_incompatible',
      'asset_capability_unsupported',
    ]);
    expect(second.report.diagnostics).toEqual(first.report.diagnostics);
    expect(first).not.toHaveProperty('snapshot');
  });

  it('returns a JSON-safe invalid report for a malformed archive', async () => {
    const result = await inspectAssetPackArchive({
      archivePath: ARCHIVE_PATH,
      archiveBytes: Buffer.from('not a ZIP archive'),
      runtime: createRuntimeFixture(),
    });

    expect(result).not.toHaveProperty('snapshot');
    expect(result.report).toEqual({
      schema: 'lpc-toolkit.asset-pack-inspection.v1',
      archivePath: ARCHIVE_PATH,
      valid: false,
      entryCount: 0,
      totalUncompressedBytes: 0,
      diagnostics: [expect.objectContaining({
        code: 'asset_archive_invalid',
        severity: 'error',
      })],
      acknowledgementRecords: [],
    });
    expect(JSON.parse(JSON.stringify(result.report))).toEqual(result.report);
  });

  it('preserves manifest schema diagnostics for a structurally valid archive', async () => {
    const result = await inspectAssetPackArchive({
      archivePath: ARCHIVE_PATH,
      archiveBytes: await uncheckedArchive(Buffer.from('{}\n')),
      runtime: createRuntimeFixture(),
    });

    expect(result.report.valid).toBe(false);
    expect(result.report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_archive_invalid',
      severity: 'error',
      details: expect.objectContaining({
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: 'asset_pack_schema_invalid' }),
        ]),
      }),
    }));
    expect(result).not.toHaveProperty('snapshot');
  });
});

describe('inspectAssetPackArchive report and captured-byte validation', () => {
  it('returns archive identity and byte totals in a JSON-safe report only alongside a valid snapshot', async () => {
    const archiveBytes = await archiveFor(newItemSource());
    const result = await inspectAssetPackArchive({
      archivePath: ARCHIVE_PATH,
      archiveBytes,
      runtime: createRuntimeFixture(),
    });

    expect(result.snapshot).toBeDefined();
    if (!result.snapshot) throw new Error('Expected a verified archive snapshot.');
    expect(result.report).toEqual({
      schema: 'lpc-toolkit.asset-pack-inspection.v1',
      archivePath: ARCHIVE_PATH,
      archiveDigest: sha256(archiveBytes),
      packId: 'acme.wind-braid',
      version: '1.0.0',
      contentDigest: result.snapshot.payload.contentDigest,
      valid: true,
      entryCount: result.snapshot.entryCount,
      totalUncompressedBytes: result.snapshot.totalUncompressedBytes,
      diagnostics: [],
      acknowledgementRecords: [],
    });
    const serialized = JSON.stringify(result.report);
    expect(serialized).not.toContain('archiveBytes');
    expect(serialized).not.toContain('manifestBytes');
    expect(JSON.parse(serialized)).toEqual(result.report);
  });

  it('rejects a corrupt IHDR CRC without entering the native decoder process', async () => {
    const runtime = createRuntimeFixture();
    const corruptIhdr = Buffer.from(sheetPng('climb', filledRequiredCells('climb')));
    corruptIhdr[29] = (corruptIhdr[29] ?? 0) ^ 0xff;
    const archiveBytes = await archiveFor(
      newItemSource(),
      new Map([[SOURCE_PATH, corruptIhdr]]),
    );
    const archivePath = path.join(
      createDirectory('lpc-asset-pack-corrupt-ihdr-'),
      'corrupt-ihdr.lpc-assets.zip',
    );
    writeFileSync(archivePath, archiveBytes);

    const probe = inspectArchiveInIsolatedProcess(
      archivePath,
      runtime.context.assetsRoot,
    );

    const stderr = probe.stderr?.toString() ?? '';
    expect(probe.signal, stderr).toBeNull();
    expect(probe.status, stderr).toBe(0);
    const result = JSON.parse(probe.stdout?.toString() ?? '') as {
      readonly report: { readonly valid: boolean; readonly diagnostics: readonly { readonly code: string }[] };
      readonly hasSnapshot: boolean;
    };
    expect(result.report.valid).toBe(false);
    expect(result.report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_png_decode_failed',
    }));
    expect(result.hasSnapshot).toBe(false);
  });

  it('requires the configured runtime recolor source ramp in captured PNG colors', async () => {
    const matching = await inspectAssetPackArchive({
      archivePath: ARCHIVE_PATH,
      archiveBytes: await archiveFor(newItemSource()),
      runtime: createRuntimeFixture(),
    });
    expect(matching.report.valid).toBe(true);
    expect(matching.snapshot).toBeDefined();

    const missingRampArchive = await archiveFor(
      newItemSource(),
      new Map([[SOURCE_PATH, sheetPng(
        'climb',
        Object.fromEntries(requiredCells('climb').map((cell) => [cell, '#333333'])),
      )]]),
    );
    const missing = await inspectAssetPackArchive({
      archivePath: ARCHIVE_PATH,
      archiveBytes: missingRampArchive,
      runtime: createRuntimeFixture(),
    });
    const repeated = await inspectAssetPackArchive({
      archivePath: ARCHIVE_PATH,
      archiveBytes: missingRampArchive,
      runtime: createRuntimeFixture(),
    });

    expect(missing.report.valid).toBe(false);
    expect(missing.report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_pack_schema_invalid',
      sourcePath: SOURCE_PATH,
      message: `Configured recolor source ramp is not present in ${SOURCE_PATH}.`,
      details: expect.objectContaining({
        path: '$.assets[0].recolor',
        requiredColors: ['#111111', '#222222'],
        missingColors: ['#111111', '#222222'],
      }),
    }));
    expect(repeated.report.diagnostics).toEqual(missing.report.diagnostics);
    expect(missing).not.toHaveProperty('snapshot');
  });

  it('validates required cells and runtime recolor palettes from captured PNG bytes', async () => {
    const blank = await inspectAssetPackArchive({
      archivePath: ARCHIVE_PATH,
      archiveBytes: await archiveFor(
        newItemSource(),
        new Map([[SOURCE_PATH, sheetPng('climb', {})]]),
      ),
      runtime: createRuntimeFixture(),
    });
    expect(blank.report.valid).toBe(false);
    expect(blank.report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_required_frame_blank',
      sourcePath: SOURCE_PATH,
    }));
    expect(blank).not.toHaveProperty('snapshot');

    const unknownPalette = await inspectAssetPackArchive({
      archivePath: ARCHIVE_PATH,
      archiveBytes: await archiveFor(newItemSource({ recolorPalettes: ['future'] })),
      runtime: createRuntimeFixture(),
    });
    expect(unknownPalette.report.valid).toBe(false);
    expect(unknownPalette.report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_pack_schema_invalid',
      message: 'Unknown palette token "future".',
    }));
  });

  it('preserves optional-cell acknowledgement semantics for archive content digests', async () => {
    const sourcePath = 'sprites/wind-braid/walk.png';
    const png = sheetPng('walk', filledRequiredCells('walk'));
    const sourceBytes = new Map([[sourcePath, png]]);
    const first = await inspectAssetPackArchive({
      archivePath: ARCHIVE_PATH,
      archiveBytes: await archiveFor(
        newItemSource({ animation: 'walk', sourcePath }),
        sourceBytes,
      ),
      runtime: createRuntimeFixture(),
    });

    expect(first.report.valid).toBe(false);
    expect(first.report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_optional_frame_blank',
      severity: 'warning',
    }));
    expect(first.report.acknowledgementRecords).toHaveLength(1);
    const acknowledgements = first.report.acknowledgementRecords.map((record) => ({
      ...record,
      reason: 'Reviewed and accepted the blank padding cells.',
    }));

    const accepted = await inspectAssetPackArchive({
      archivePath: ARCHIVE_PATH,
      archiveBytes: await archiveFor(
        newItemSource({ animation: 'walk', sourcePath, acknowledgements }),
        sourceBytes,
      ),
      runtime: createRuntimeFixture(),
    });
    expect(accepted.report.valid).toBe(true);
    expect(accepted.report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_optional_frame_blank',
      severity: 'warning',
    }));
    expect(accepted.snapshot).toBeDefined();
  });

  it('decodes one captured source shared by multiple compatible consumers', async () => {
    const source = newItemSource({
      sprites: [
        { animation: 'climb', source: SOURCE_PATH, bodyTypes: ['male'] },
        { animation: 'climb', source: SOURCE_PATH, bodyTypes: ['female'] },
      ],
    });
    const result = await inspectAssetPackArchive({
      archivePath: ARCHIVE_PATH,
      archiveBytes: await archiveFor(source),
      runtime: createRuntimeFixture(),
    });

    expect(result.report.valid).toBe(true);
    expect(result.snapshot?.payload.sourceBytes.size).toBe(1);
  });

  it('preserves baseline definition and credit digest diagnostics for extensions', async () => {
    const result = await inspectAssetPackArchive({
      archivePath: ARCHIVE_PATH,
      archiveBytes: await archiveFor(extensionSource()),
      runtime: createRuntimeFixture(),
    });

    expect(result.report.valid).toBe(false);
    expect(result.report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_base_definition_changed' }),
      expect.objectContaining({ code: 'asset_base_credit_changed' }),
    ]));
    expect(result).not.toHaveProperty('snapshot');
  });
});
