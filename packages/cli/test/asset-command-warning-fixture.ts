import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import {
  ASSET_PACK_SCHEMA,
  standardAnimationGeometry,
  type AssetPackAcknowledgement,
  type AssetPackSource,
  type ItemDefinition,
} from '@lpc-toolkit/core';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import {
  initializeAssetWorkspace,
  type AssetWorkspace,
} from '../src/asset-workspace.js';
import {
  loadActiveAssetPackBaseline,
  validateAssetPackDirectory,
} from '../src/asset-pack-validation.js';
import { createRuntimeContext } from '../src/context.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

export interface WarningAssetCommandFixture {
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly packRoot: string;
  readonly manifest: AssetPackSource;
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function createWarningAssetCommandFixture(): WarningAssetCommandFixture {
  const root = mkdtempSync(path.join(tmpdir(), 'lpc-main-warning-preview-'));
  const assetsRoot = path.join(root, 'assets');
  const definition: ItemDefinition = {
    name: 'Braid',
    type_name: 'hair',
    animations: ['walk'],
    credits: [{
      file: 'hair/braid',
      authors: ['Base Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.test/base-artist'],
      notes: '',
    }],
    layer_1: { zPos: 50, male: 'hair/braid/' },
  };
  writeJson(
    path.join(assetsRoot, 'sheet_definitions', 'hair', 'braid.json'),
    definition,
  );
  mkdirSync(path.join(assetsRoot, 'palette_definitions'), { recursive: true });
  writeFileSync(
    path.join(assetsRoot, 'CREDITS.csv'),
    'filename,notes,authors,licenses,urls\n',
  );

  const workspace = initializeAssetWorkspace(root);
  const store = createDirectoryAssetStore(assetsRoot);
  const runtime: RuntimeAssets = {
    context: createRuntimeContext({
      cwd: root,
      assetsRoot,
      customAssetsRoot: workspace.outputRoot,
      spritesheetsBaseUrl: store.baseUrl,
    }),
    store,
    source: 'working-directory',
  };
  const baseline = loadActiveAssetPackBaseline({ runtime, workspace });
  const manifest: AssetPackSource = {
    schema: ASSET_PACK_SCHEMA,
    id: 'acme.warning-preview',
    version: '1.0.0',
    displayName: 'Warning Preview',
    credits: {
      authors: ['Pack Artist'],
      licenses: ['CC-BY-SA 4.0'],
      urls: ['https://example.test/pack-artist'],
      notes: '',
    },
    assets: [{
      kind: 'extend-item',
      itemId: 'braid',
      baseDefinitionDigest: baseline.definitionDigests.get('braid')!,
      baseCreditDigest: baseline.creditDigests.get('braid')!,
      addAnimations: [{
        animation: 'climb',
        layers: [{
          layer: 'layer_1',
          bodyTypes: ['male'],
          source: 'sprites/braid/climb.png',
          destination: {
            path: 'spritesheets/hair/braid/climb.png',
            evidence: 'audit-inferred',
            accepted: true,
          },
        }],
      }],
    }],
  };
  const packRoot = path.join(workspace.packsRoot, manifest.id);
  writeJson(path.join(packRoot, 'asset-pack.json'), manifest);

  const geometry = standardAnimationGeometry('climb');
  const maxColumn = Math.max(
    ...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)),
  );
  const canvas = createCanvas(
    (maxColumn + 1) * geometry.frameSize,
    geometry.rows.length * geometry.frameSize,
  );
  const context = canvas.getContext('2d');
  context.fillStyle = '#aa3377';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const sourcePath = path.join(packRoot, 'sprites', 'braid', 'climb.png');
  mkdirSync(path.dirname(sourcePath), { recursive: true });
  writeFileSync(sourcePath, canvas.toBuffer('image/png'));

  return { workspace, runtime, packRoot, manifest };
}

export async function acknowledgeWarning(
  fixture: WarningAssetCommandFixture,
): Promise<AssetPackAcknowledgement> {
  const report = await validateAssetPackDirectory({
    packDirectory: fixture.packRoot,
    workspace: fixture.workspace,
    runtime: fixture.runtime,
  });
  const template = report.acknowledgementRecords.find(
    (record) => record.code === 'asset_path_inferred',
  );
  if (!template) throw new Error('Expected an asset_path_inferred acknowledgement template.');
  const acknowledgement = { ...template, reason: 'Reviewed inferred destination.' };
  writeJson(path.join(fixture.packRoot, 'asset-pack.json'), {
    ...fixture.manifest,
    acknowledgements: [acknowledgement],
  });
  return acknowledgement;
}
