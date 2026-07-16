import {
  ANIMATION_DEFAULTS,
  createCatalog,
  createPaletteCatalog,
  type ItemDefinition,
} from '@lpc-toolkit/core';
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

function createLicenseRuntime(): RuntimeAssets {
  const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-catalog-licenses-'));
  const definitions = [
    {
      path: 'hair/curly/hair_curls_large.json',
      definition: {
        name: 'Large Curls',
        type_name: 'hair',
        credits: [{
          file: 'hair/curls_large',
          notes: '',
          authors: ['JaidynReiman'],
          licenses: ['OGA-BY 3.0+', 'CC-BY 3.0+', 'GPL 3.0+'],
          urls: ['https://opengameart.org/content/lpc-expanded-xlong-hair'],
        }],
        layer_1: { zPos: 50, male: 'hair/curls_large/' },
      },
    },
    {
      path: 'hair/curly/hair_curls_large_xlong.json',
      definition: {
        name: 'Large Curls Xlong',
        type_name: 'hair',
        credits: [{
          file: 'hair/curls_large_xlong',
          notes: '',
          authors: ['JaidynReiman'],
          licenses: ['OGA-BY 3.0+', 'CC-BY 3.0+', 'GPL 3.0+'],
          urls: ['https://opengameart.org/content/lpc-expanded-xlong-hair'],
        }],
        layer_1: { zPos: 50, male: 'hair/curls_large_xlong/' },
      },
    },
    {
      path: 'head/neck/neck_scarf.json',
      definition: {
        name: 'Scarf',
        type_name: 'neck',
        credits: [{
          file: 'neck/scarf',
          notes: '',
          authors: ['Nila122'],
          licenses: ['OGA-SA 3.0', 'CC-BY-SA 3.0', 'GPL 2.0', 'GPL 3.0'],
          urls: ['https://opengameart.org/content/more-lpc-clothes-and-hair'],
        }],
        layer_1: { zPos: 55, male: 'neck/scarf/' },
      },
    },
  ] as const;

  for (const record of definitions) {
    const definitionPath = path.join(cwd, 'assets', 'sheet_definitions', record.path);
    mkdirSync(path.dirname(definitionPath), { recursive: true });
    writeFileSync(definitionPath, JSON.stringify(record.definition));
  }

  return createRuntime(cwd);
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

const palettes = createPaletteCatalog({}).palettes;
const licenses = [
  'CC0',
  'CC-BY',
  'CC-BY 3.0',
  'CC-BY 3.0+',
  'CC-BY 4.0',
  'CC-BY-SA 3.0',
  'CC-BY-SA 4.0',
  'OGA-BY 3.0',
  'OGA-BY 3.0+',
  'OGA-BY 4.0',
  'GPL 2.0',
  'GPL 3.0',
] as const;

function createDomainRuntime(): RuntimeAssets {
  const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-catalog-'));
  const definitionsRoot = path.join(cwd, 'assets', 'sheet_definitions', 'hair');
  mkdirSync(definitionsRoot, { recursive: true });
  const animations = [
    ...Array.from({ length: 10 }, (_, index) => `animation-${index}`),
    'zz-target',
  ];
  animations.forEach((animation, index) => {
    writeFileSync(
      path.join(definitionsRoot, `item-${index}.json`),
      JSON.stringify({
        name: `Item ${index}`,
        type_name: 'hair',
        animations: [animation],
        credits: [{
          file: `hair/item-${index}`,
          notes: '',
          authors: ['Artist'],
          licenses: index === 0 ? licenses : ['GPL 3.0'],
          urls: [],
        }],
        layer_1: { zPos: 50, male: `hair/item-${index}/` },
      }),
    );
  });
  return createRuntime(cwd);
}

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
        pagination: { all: false, limit: 20, offset: 0 },
        palettes,
      }).items,
    ).toEqual([
      {
        itemId: 'braids',
        typeName: 'hair',
        name: 'Braids',
        supportedBodyTypes: ['male'],
        variants: ['brown'],
        recolors: [],
        animations: ['walk'],
        licenses: ['GPL'],
        creditCount: 1,
      },
    ]);
  });

  it('gets one catalog item by item id or type/name', () => {
    expect(getCatalogItem(catalog, 'braids', palettes)?.itemId).toBe('braids');
    expect(getCatalogItem(catalog, 'hair/Braids', palettes)?.itemId).toBe('braids');
  });

  it('reports native, compatible, and unsupported animations', () => {
    const wheelchair: ItemDefinition = {
      ...hair,
      name: 'Wheelchair',
      type_name: 'wheelchair',
      animations: ['wheelchair'],
    };
    const detail = getCatalogItem(
      createCatalog({ 'body/wheelchair.json': wheelchair }).catalog,
      'wheelchair',
      palettes,
    );

    expect(detail).toMatchObject({
      animations: ['wheelchair'],
      compatibleAnimations: ['sit'],
    });
    expect(detail?.unsupportedAnimations).not.toContain('sit');
    expect(detail?.unsupportedAnimations).toContain('walk');
  });

  it.each([
    ['tool_rod', 'thrust'],
    ['slash_oversize', 'slash'],
  ])('derives the registered base for %s', (customName, baseName) => {
    const item = { ...hair, name: customName, animations: [customName] } as ItemDefinition;
    const detail = getCatalogItem(
      createCatalog({ [`hair/${customName}.json`]: item }).catalog,
      customName,
      palettes,
    );

    expect(detail).toMatchObject({
      animations: [customName],
      compatibleAnimations: [baseName],
    });
    expect(detail?.unsupportedAnimations).not.toContain(baseName);
  });

  it('normalizes missing and malformed animations but preserves an empty array', () => {
    const missing = {
      name: 'Missing',
      type_name: 'hair',
      credits: hair.credits,
      layer_1: hair.layer_1,
    } as unknown as ItemDefinition;
    const malformed = { ...hair, animations: 'walk' } as unknown as ItemDefinition;
    const empty = { ...hair, animations: [] };
    const catalog = createCatalog({
      'hair/missing.json': missing,
      'hair/malformed.json': malformed,
      'hair/empty.json': empty,
    }).catalog;

    expect(getCatalogItem(catalog, 'missing', palettes)?.animations).toEqual(ANIMATION_DEFAULTS);
    expect(getCatalogItem(catalog, 'malformed', palettes)?.animations).toEqual(ANIMATION_DEFAULTS);
    expect(getCatalogItem(catalog, 'empty', palettes)).toMatchObject({
      animations: [],
      compatibleAnimations: [],
    });
  });

  it('does not infer compatibility for an unknown custom animation', () => {
    const item = { ...hair, name: 'Unknown', animations: ['unknown_custom'] };
    const detail = getCatalogItem(
      createCatalog({ 'hair/unknown.json': item }).catalog,
      'unknown',
      palettes,
    );

    expect(detail).toMatchObject({
      animations: ['unknown_custom'],
      compatibleAnimations: [],
    });
    expect(detail?.unsupportedAnimations).toContain('sit');
  });

  it('defaults broad discovery to twenty items', () => {
    const largeCatalog = createCatalog(Object.fromEntries(
      Array.from({ length: 22 }, (_, index) => [
        `hair/item-${index}.json`,
        { ...hair, name: `Hair ${index}` },
      ]),
    )).catalog;
    const result = listCatalogItems(largeCatalog, {
      pagination: { all: false, limit: 20, offset: 0 },
      palettes,
    });

    expect(result.items).toHaveLength(20);
    expect(result.page).toMatchObject({ total: 22, nextOffset: 20 });
  });

  it('returns a bounded first page and a non-overlapping second page', () => {
    const first = listCatalogItems(catalog, {
      pagination: { all: false, limit: 1, offset: 0 },
      palettes,
    });
    const second = listCatalogItems(catalog, {
      pagination: { all: false, limit: 1, offset: 1 },
      palettes,
    });

    expect(first.items).toHaveLength(1);
    expect(first.page.nextOffset).toBe(1);
    expect(second.items[0]?.itemId).not.toBe(first.items[0]?.itemId);
    expect(second.page.total).toBe(first.page.total);
  });

  it('returns summary licenses and complete item credits', () => {
    const summary = listCatalogItems(catalog, {
      typeName: 'hair',
      pagination: { all: false, limit: 20, offset: 0 },
      palettes,
    }).items[0];

    expect(summary).toMatchObject({
      supportedBodyTypes: ['male'],
      licenses: ['GPL'],
      creditCount: 1,
    });
    expect(getCatalogItem(catalog, 'braids', palettes)?.credits).toEqual(hair.credits);
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
    writeFileSync(
      path.join(definitionsRoot, 'malformed_credits.json'),
      JSON.stringify({
        name: 'Malformed Credits',
        type_name: 'hair',
        animations: ['walk'],
        credits: [{ authors: 'Artist' }],
        layer_1: { zPos: 50, male: 'hair/malformed-credits/' },
      }),
    );

    const run = () => runCatalogCommand(parseArgs(['catalog', 'items']), createRuntime(cwd));

    expect(run).not.toThrow();
    const response = run();
    expect(response.ok).toBe(true);
    expect(response.command).toBe('catalog items');
    expect(response).toMatchObject({
      data: {
        items: [{
          itemId: 'missing_animations',
          animations: ANIMATION_DEFAULTS,
          creditCount: 1,
        }],
      },
      warnings: expect.arrayContaining([
        expect.objectContaining({
          code: 'catalog_warning',
          path: 'hair/missing_credits.json',
        }),
        expect.objectContaining({
          code: 'catalog_warning',
          path: 'hair/malformed_credits.json',
        }),
      ]),
    });
  });

  it('validates animations against the complete domain before bounding guidance', () => {
    const response = runCatalogCommand(
      parseArgs(['catalog', 'items', '--animation', 'zz-target']),
      createDomainRuntime(),
    );

    expect(response).toMatchObject({
      ok: true,
      data: { items: [{ animations: ['zz-target'] }] },
      errors: [],
    });
  });

  it('filters custom animations by their compatible standard base', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-catalog-custom-'));
    const definitionPath = path.join(
      cwd,
      'assets',
      'sheet_definitions',
      'body',
      'wheelchair.json',
    );
    mkdirSync(path.dirname(definitionPath), { recursive: true });
    writeFileSync(definitionPath, JSON.stringify({
      ...hair,
      name: 'Wheelchair',
      type_name: 'wheelchair',
      animations: ['wheelchair'],
    }));

    const response = runCatalogCommand(
      parseArgs(['catalog', 'items', '--animation', 'sit']),
      createRuntime(cwd),
    );

    expect(response).toMatchObject({
      ok: true,
      data: { items: [{ itemId: 'wheelchair', animations: ['wheelchair'] }] },
      errors: [],
    });
  });

  it('computes animation and license suggestions from the complete domains', () => {
    const runtime = createDomainRuntime();

    const animationResponse = runCatalogCommand(
      parseArgs(['catalog', 'items', '--animation', 'zz-targat']),
      runtime,
    );
    const licenseResponse = runCatalogCommand(
      parseArgs(['catalog', 'items', '--license', 'OGA-BY 4.x']),
      runtime,
    );

    expect(animationResponse.errors[0]?.details?.suggestions?.[0]).toBe('zz-target');
    expect(animationResponse.errors[0]?.details?.available).toHaveLength(10);
    expect(licenseResponse.errors[0]?.details?.suggestions?.[0]).toBe('OGA-BY 4.0');
    expect(licenseResponse.errors[0]?.details?.available).toHaveLength(10);
  });

  it('preserves active GPL 3.0+ credits in filtered summaries and item detail', () => {
    const runtime = createLicenseRuntime();
    const listResponse = runCatalogCommand(
      parseArgs([
        'catalog', 'items', '--type', 'hair', '--search', 'Large Curls',
        '--license', 'GPL', '--all',
      ]),
      runtime,
    );
    const detailResponse = runCatalogCommand(
      parseArgs(['catalog', 'item', 'hair_curls_large']),
      runtime,
    );

    expect(listResponse).toMatchObject({
      ok: true,
      data: {
        items: [
          {
            itemId: 'hair_curls_large',
            licenses: ['CC-BY', 'OGA-BY', 'GPL'],
          },
          {
            itemId: 'hair_curls_large_xlong',
            licenses: ['CC-BY', 'OGA-BY', 'GPL'],
          },
        ],
      },
      errors: [],
    });
    expect(detailResponse).toMatchObject({
      ok: true,
      data: {
        item: {
          itemId: 'hair_curls_large',
          licenses: ['CC-BY', 'OGA-BY', 'GPL'],
          credits: [{
            file: 'hair/curls_large',
            notes: '',
            authors: ['JaidynReiman'],
            licenses: ['OGA-BY 3.0+', 'CC-BY 3.0+', 'GPL 3.0+'],
            urls: ['https://opengameart.org/content/lpc-expanded-xlong-hair'],
          }],
        },
      },
      errors: [],
    });
  });

  it('preserves unmapped active raw licenses without inventing summary groups', () => {
    const response = runCatalogCommand(
      parseArgs(['catalog', 'item', 'neck_scarf']),
      createLicenseRuntime(),
    );

    expect(response).toMatchObject({
      ok: true,
      data: {
        item: {
          itemId: 'neck_scarf',
          licenses: ['CC-BY-SA', 'GPL'],
          credits: [{
            licenses: ['OGA-SA 3.0', 'CC-BY-SA 3.0', 'GPL 2.0', 'GPL 3.0'],
          }],
        },
      },
      errors: [],
    });
  });

  it.each([
    ['type', 'haair', 'unknown_type_name'],
    ['body-type', 'centaur', 'body_type_invalid'],
    ['animation', 'wolk', 'unknown_animation'],
    ['license', 'GQP', 'unknown_license'],
  ])('returns bounded filter guidance for unknown --%s', (flag, value, code) => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-catalog-'));
    const response = runCatalogCommand(
      parseArgs(['catalog', 'items', `--${flag}`, value, '--json']),
      createRuntime(cwd),
    );

    expect(response.errors[0]).toMatchObject({ code });
    expect(response.errors[0]?.details?.suggestions?.length ?? 0).toBeLessThanOrEqual(5);
    expect(response.errors[0]?.details?.available?.length ?? 0).toBeLessThanOrEqual(10);
  });
});
