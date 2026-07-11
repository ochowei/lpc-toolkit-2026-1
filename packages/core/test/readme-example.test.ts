import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  composeSelections,
  createCatalog,
  createPaletteCatalog,
  extractAnimation,
  makeResolvePalette,
  type CanvasAdapter,
  type FilePath,
  type ItemDefinition,
  type Selections,
} from '../src/index.js';
import {
  createNodeCanvasAdapter,
  solidImage,
} from './helpers/node-canvas-adapter.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const readmePath = path.resolve(here, '../../../README.md');
const walkOffsetY = 8 * 64;

const records: Readonly<Record<FilePath, ItemDefinition>> = {
  'body/body.json': {
    name: 'Body Color',
    type_name: 'body',
    animations: ['walk'],
    credits: [
      {
        file: 'body/bodies/male',
        notes: '',
        authors: ['Body Artist'],
        licenses: ['CC0'],
        urls: [],
      },
    ],
    recolors: { material: 'body', palettes: ['ulpc'] },
    layer_1: { zPos: 10, male: 'body/bodies/male/' },
  },
  'hair/afro/hair_afro.json': {
    name: 'Afro',
    type_name: 'hair',
    animations: ['walk'],
    credits: [
      {
        file: 'hair/afro',
        notes: '',
        authors: ['Hair Artist'],
        licenses: ['CC0'],
        urls: [],
      },
    ],
    recolors: { material: 'hair', palettes: ['ulpc'] },
    layer_1: { zPos: 120, male: 'hair/afro/adult/' },
  },
};

const paletteRecords: Readonly<Record<FilePath, unknown>> = {
  'palette_definitions/meta_ulpc.json': {
    type: 'version',
    label: 'ULPC',
  },
  'palette_definitions/body/meta_body.json': {
    type: 'material',
    default: 'ulpc',
    base: 'light',
  },
  'palette_definitions/body/body_ulpc.json': {
    light: ['#ff0000'],
    brown: ['#804000'],
  },
  'palette_definitions/hair/meta_hair.json': {
    type: 'material',
    default: 'ulpc',
    base: 'orange',
  },
  'palette_definitions/hair/hair_ulpc.json': {
    orange: ['#00ff00'],
    black: ['#111111'],
  },
};

const selections: Selections = {
  bodyType: 'male',
  items: {
    body: { typeName: 'body', name: 'Body Color', recolor: 'brown' },
    hair: { typeName: 'hair', name: 'Afro', recolor: 'black' },
  },
};

function readReadmeExample(): string {
  const readme = readFileSync(readmePath, 'utf8');
  const match = readme.match(/### Example\n\n```ts\n([\s\S]*?)\n```/);
  if (!match?.[1]) {
    throw new Error('README core TypeScript example block was not found.');
  }
  return match[1];
}

function createFixtureAdapter(): {
  readonly adapter: CanvasAdapter;
  readonly loadCalls: string[];
} {
  const base = createNodeCanvasAdapter();
  const loadCalls: string[] = [];

  return {
    loadCalls,
    adapter: {
      createCanvas: base.createCanvas,
      async loadImage(spritePath: string) {
        loadCalls.push(spritePath);
        if (spritePath.endsWith('/body/bodies/male/walk.png')) {
          return solidImage(8, 8, '#ff0000');
        }
        if (spritePath.endsWith('/hair/afro/adult/walk.png')) {
          return solidImage(8, 8, '#00ff00');
        }
        throw new Error(`Unexpected README fixture path: ${spritePath}`);
      },
    },
  };
}

describe('README core example', () => {
  it('documents the palette-aware recolor wiring', () => {
    const example = readReadmeExample();

    expect(example).toContain('createPaletteCatalog');
    expect(example).toContain('makeResolvePalette');
    expect(example).toContain('createPaletteCatalog(paletteRecords)');
    expect(example).toContain(
      "body: { typeName: 'body', name: 'Body Color', recolor: 'brown' }",
    );
    expect(example).toContain(
      "hair: { typeName: 'hair', name: 'Afro', recolor: 'black' }",
    );
    expect(example).toContain(
      'resolvePalette: makeResolvePalette(catalog, palettes, selections)',
    );
    expect(example).not.toContain("variant: 'light'");
    expect(example).not.toContain("variant: 'black'");
    expect(example).not.toContain('upstream checkout');
  });

  it('renders visible recolored pixels and precise credits through public APIs', async () => {
    const { catalog, warnings: catalogWarnings } = createCatalog(records);
    const { palettes, warnings: paletteWarnings } =
      createPaletteCatalog(paletteRecords);
    const { adapter, loadCalls } = createFixtureAdapter();

    expect(catalogWarnings).toEqual([]);
    expect(paletteWarnings).toEqual([]);

    const sheet = await composeSelections(selections, {
      catalog,
      adapter,
      spritesheetsBaseUrl: '/assets',
      resolvePalette: makeResolvePalette(catalog, palettes, selections),
    });
    const walk = extractAnimation(sheet, 'walk', { adapter });

    expect(loadCalls).toEqual([
      '/assets/spritesheets/body/bodies/male/walk.png',
      '/assets/spritesheets/hair/afro/adult/walk.png',
    ]);
    expect(sheet.layers.map((layer) => layer.path)).toEqual([
      'spritesheets/body/bodies/male/walk.png',
      'spritesheets/hair/afro/adult/walk.png',
    ]);
    expect(sheet.credits.entries.map((entry) => entry.file)).toEqual([
      'body/bodies/male',
      'hair/afro',
    ]);
    expect(sheet.credits.resolvedPaths).toEqual([
      'body/bodies/male/walk.png',
      'hair/afro/adult/walk.png',
    ]);

    const sheetPixel = sheet.canvas
      .getContext('2d')
      .getImageData(0, walkOffsetY, 1, 1).data;
    const walkPixel = walk.canvas
      .getContext('2d')
      .getImageData(0, 0, 1, 1).data;

    expect(Array.from(sheetPixel)).toEqual([17, 17, 17, 255]);
    expect(Array.from(walkPixel)).toEqual([17, 17, 17, 255]);
  });
});
