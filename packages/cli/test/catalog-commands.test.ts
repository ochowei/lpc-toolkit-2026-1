import { createCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getCatalogItem,
  listCatalogItems,
  listCatalogTypes,
  runCatalogCommand,
} from '../src/catalog-commands.js';
import { parseArgs } from '../src/args.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { createRuntimeContext } from '../src/context.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

function createRuntime(cwd: string): RuntimeAssets {
  const assetsRoot = path.join(cwd, 'assets');
  mkdirSync(assetsRoot, { recursive: true });
  const store = createDirectoryAssetStore(assetsRoot);
  return {
    context: createRuntimeContext({
      cwd,
      assetsRoot,
      spritesheetsBaseUrl: store.baseUrl,
    }),
    store,
    source: 'working-directory',
  };
}

const body: ItemDefinition = {
  name: 'Body Color',
  type_name: 'body',
  animations: ['walk'],
  credits: [],
  layer_1: { zPos: 10, male: 'body/bodies/male/' },
};

const hair: ItemDefinition = {
  name: 'Braids',
  type_name: 'hair',
  animations: ['walk'],
  credits: [
    {
      file: 'hair/braids',
      notes: '',
      authors: ['Artist'],
      licenses: ['GPL 3.0'],
      urls: [],
    },
  ],
  variants: ['brown'],
  layer_1: { zPos: 50, male: 'hair/braids/' },
};

const hat: ItemDefinition = {
  name: 'Cap',
  type_name: 'hat',
  animations: ['walk'],
  credits: [
    {
      file: 'hat/cap',
      notes: '',
      authors: ['Artist'],
      licenses: ['CC0'],
      urls: [],
    },
  ],
  layer_1: { zPos: 60, male: 'hat/cap/' },
};

describe('catalog commands', () => {
  const catalog = createCatalog({
    'body/body.json': body,
    'hair/braids.json': hair,
    'hat/cap.json': hat,
  }).catalog;

  it('lists types', () => {
    expect(listCatalogTypes(catalog).typeNames).toEqual(['body', 'hair', 'hat']);
    expect(listCatalogTypes(catalog).count).toBe(3);
  });

  it('filters items by search, body type, animation, and license family', () => {
    expect(
      listCatalogItems(catalog, {
        search: 'a',
        bodyType: 'male',
        animation: 'walk',
        license: 'GPL',
      }).items,
    ).toEqual([
      {
        itemId: 'braids',
        typeName: 'hair',
        name: 'Braids',
        variants: ['brown'],
        recolors: [],
        animations: ['walk'],
      },
    ]);
  });

  it('gets one catalog item by item id or type/name', () => {
    expect(getCatalogItem(catalog, 'braids')?.itemId).toBe('braids');
    expect(getCatalogItem(catalog, 'hair/Braids')?.itemId).toBe('braids');
  });

  it('returns catalog item command responses', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-catalog-'));
    const response = runCatalogCommand(
      parseArgs(['catalog', 'item', 'missing']),
      createRuntime(cwd),
    );

    expect(response.ok).toBe(false);
    expect(response.command).toBe('catalog item');
    expect(response.errors[0]?.code).toBe('unknown_item');
  });

  it('returns a catalog items response for malformed loadable records', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-catalog-'));
    const definitionsRoot = path.join(cwd, 'assets', 'sheet_definitions', 'hair');
    mkdirSync(definitionsRoot, { recursive: true });
    writeFileSync(
      path.join(definitionsRoot, 'missing_credits.json'),
      JSON.stringify({
        name: 'Missing Credits',
        type_name: 'hair',
        animations: ['walk'],
        layer_1: { zPos: 50, male: 'hair/missing-credits/' },
      }),
    );
    writeFileSync(
      path.join(definitionsRoot, 'missing_animations.json'),
      JSON.stringify({
        name: 'Missing Animations',
        type_name: 'hair',
        credits: [
          {
            file: 'hair/missing-animations',
            notes: '',
            authors: ['Artist'],
            licenses: ['GPL 3.0'],
            urls: [],
          },
        ],
        layer_1: { zPos: 50, male: 'hair/missing-animations/' },
      }),
    );

    const response = runCatalogCommand(
      parseArgs(['catalog', 'items', '--license', 'GPL', '--animation', 'walk']),
      createRuntime(cwd),
    );

    expect(response.ok).toBe(true);
    expect(response.command).toBe('catalog items');
  });
});
