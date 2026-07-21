import { describe, expect, it } from 'vitest';
import { createCatalog } from '../src/catalog.js';
import {
  compileAssetPacks,
  normalizeAssetPack,
  type AssetPackSource,
} from '../src/index.js';
import type { AssetPackBaseline } from '../src/asset-pack-validation.js';

const PACK_CREDITS = {
  authors: ['Alice'],
  licenses: ['CC-BY-SA 4.0'],
  urls: ['https://example.com/alice'],
  notes: 'Base pack credit.',
} as const;

const CLIMB_OVERRIDE = {
  authors: ['Beatrice'],
  licenses: ['CC-BY 4.0'],
  urls: ['https://example.com/beatrice'],
  notes: 'Foreground climb override.',
} as const;

const baseline: AssetPackBaseline = {
  catalog: createCatalog({
    'hair/braid.json': {
      name: 'Braid',
      type_name: 'hair',
      animations: ['walk'],
      credits: [],
      layer_1: { zPos: 50, male: 'hair/braid/', female: 'hair/braid/' },
    },
  }).catalog,
  definitionDigests: new Map([['braid', sha('a')]]),
  creditDigests: new Map([['braid', sha('b')]]),
};

function sha(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

function moonBraidPack(): AssetPackSource {
  return {
    schema: 'lpc-toolkit.asset-pack.v1',
    id: 'acme.fantasy-hair',
    version: '1.0.0',
    displayName: 'ACME Fantasy Hair',
    credits: PACK_CREDITS,
    creditOverrides: {
      'sprites/moon-braid/foreground/climb.png': CLIMB_OVERRIDE,
    },
    assets: [{
      kind: 'new-item',
      localId: 'moon-braid',
      displayName: 'Moon Braid',
      typeName: 'hair',
      bodyTypes: ['teen', 'male', 'female'],
      animations: ['climb', 'walk'],
      recolor: { material: 'hair', palettes: ['ulpc'] },
      layers: [
        {
          id: 'foreground',
          zPos: 120,
          sprites: [
            {
              animation: 'walk',
              source: 'sprites/moon-braid/foreground/walk.png',
            },
            {
              animation: 'climb',
              source: 'sprites/moon-braid/foreground/climb.png',
            },
            {
              animation: 'climb',
              source: 'sprites/moon-braid/foreground/climb.png',
            },
          ],
        },
        {
          id: 'background',
          zPos: 80,
          sprites: [
            {
              animation: 'walk',
              source: 'sprites/moon-braid/background/walk.png',
            },
            {
              animation: 'climb',
              source: 'sprites/moon-braid/background/climb-shared.png',
              bodyTypes: ['male', 'female'],
            },
            {
              animation: 'climb',
              source: 'sprites/moon-braid/background/climb-teen.png',
              bodyTypes: ['teen'],
            },
          ],
        },
      ],
    }],
  };
}

function sunRibbonPack(): AssetPackSource {
  return {
    schema: 'lpc-toolkit.asset-pack.v1',
    id: 'bravo.ribbons',
    version: '1.0.0',
    displayName: 'Bravo Ribbons',
    credits: {
      authors: ['Cass'],
      licenses: ['CC-BY-SA 4.0'],
      urls: ['https://example.com/cass'],
      notes: 'Ribbon pack credit.',
    },
    assets: [{
      kind: 'new-item',
      localId: 'sun-ribbon',
      displayName: 'Sun Ribbon',
      typeName: 'hair',
      bodyTypes: ['female', 'male'],
      animations: ['walk'],
      layers: [{
        id: 'top',
        zPos: 60,
        sprites: [{
          animation: 'walk',
          source: 'sprites/sun-ribbon/top/walk.png',
        }],
      }],
    }],
  };
}

function projectPlan(plan: ReturnType<typeof compileAssetPacks>) {
  return {
    definitions: plan.definitions.map((definition) => ({
      logicalPath: definition.logicalPath,
      basename: definition.basename,
      name: definition.definition.name,
      display_name: definition.definition.display_name,
      type_name: definition.definition.type_name,
      layerKeys: Object.keys(definition.definition).filter((key) => key.startsWith('layer_')),
    })),
    sprites: plan.sprites.map((sprite) => ({
      sourcePath: sprite.sourcePath,
      destinationPath: sprite.destinationPath,
      consumers: sprite.consumers.map((consumer) => ({
        itemId: consumer.itemId,
        layer: consumer.layer,
        bodyTypes: [...consumer.bodyTypes],
        ...(consumer.variant ? { variant: consumer.variant } : {}),
      })),
    })),
    credits: plan.credits.map((credit) => ({
      file: credit.file,
      authors: [...credit.authors],
      licenses: [...credit.licenses],
      urls: [...credit.urls],
      notes: credit.notes,
    })),
    ownership: plan.ownership.map((ownership) => ({
      packId: ownership.packId,
      logicalPaths: [...ownership.logicalPaths],
    })),
    diagnostics: plan.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      assetId: diagnostic.assetId,
      destinationPath: diagnostic.destinationPath,
      sourcePath: diagnostic.sourcePath,
    })),
  };
}

describe('asset-pack compile', () => {
  it('compiles deterministic namespaced definitions, sprites, credits, and ownership for new items', () => {
    const plan = compileAssetPacks({
      baseline,
      packs: [normalizeAssetPack(moonBraidPack())],
    });

    expect(plan.diagnostics).toEqual([]);
    expect(plan.definitions).toHaveLength(1);
    expect(plan.definitions[0]).toMatchObject({
      logicalPath: 'sheet_definitions/hair/acme.fantasy-hair--moon-braid.json',
      basename: 'acme.fantasy-hair--moon-braid.json',
      definition: {
        name: 'acme.fantasy-hair--moon-braid',
        display_name: 'Moon Braid',
        type_name: 'hair',
        animations: ['climb', 'walk'],
        recolors: { material: 'hair', palettes: ['ulpc'] },
        layer_1: {
          zPos: 80,
          male: 'packages/acme.fantasy-hair/moon-braid/background/male-female/',
          female: 'packages/acme.fantasy-hair/moon-braid/background/male-female/',
          teen: 'packages/acme.fantasy-hair/moon-braid/background/teen/',
        },
        layer_2: {
          zPos: 120,
          male: 'packages/acme.fantasy-hair/moon-braid/foreground/male-female-teen/',
          female: 'packages/acme.fantasy-hair/moon-braid/foreground/male-female-teen/',
          teen: 'packages/acme.fantasy-hair/moon-braid/foreground/male-female-teen/',
        },
      },
    });

    expect(plan.sprites.map((sprite) => sprite.destinationPath)).toEqual([
      'spritesheets/packages/acme.fantasy-hair/moon-braid/background/male-female/climb.png',
      'spritesheets/packages/acme.fantasy-hair/moon-braid/background/male-female/walk.png',
      'spritesheets/packages/acme.fantasy-hair/moon-braid/background/teen/climb.png',
      'spritesheets/packages/acme.fantasy-hair/moon-braid/background/teen/walk.png',
      'spritesheets/packages/acme.fantasy-hair/moon-braid/foreground/male-female-teen/climb.png',
      'spritesheets/packages/acme.fantasy-hair/moon-braid/foreground/male-female-teen/walk.png',
    ]);

    expect(plan.sprites[4]).toMatchObject({
      sourcePath: 'sprites/moon-braid/foreground/climb.png',
      destinationPath: 'spritesheets/packages/acme.fantasy-hair/moon-braid/foreground/male-female-teen/climb.png',
      consumers: [
        {
          itemId: 'acme.fantasy-hair--moon-braid',
          layer: 'layer_2',
          bodyTypes: ['male', 'female', 'teen'],
        },
      ],
    });

    expect(plan.credits).toContainEqual({
      file: 'packages/acme.fantasy-hair/moon-braid/foreground/male-female-teen/climb.png',
      authors: ['Beatrice'],
      licenses: ['CC-BY 4.0'],
      urls: ['https://example.com/beatrice'],
      notes: 'Foreground climb override.',
    });

    expect(plan.definitions[0]?.definition.credits).toContainEqual({
      file: 'packages/acme.fantasy-hair/moon-braid/foreground/male-female-teen/climb.png',
      authors: ['Beatrice'],
      licenses: ['CC-BY 4.0'],
      urls: ['https://example.com/beatrice'],
      notes: 'Foreground climb override.',
    });

    expect(plan.ownership).toEqual([{
      packId: 'acme.fantasy-hair',
      logicalPaths: [
        'sheet_definitions/hair/acme.fantasy-hair--moon-braid.json',
        'spritesheets/packages/acme.fantasy-hair/moon-braid/background/male-female/climb.png',
        'spritesheets/packages/acme.fantasy-hair/moon-braid/background/male-female/walk.png',
        'spritesheets/packages/acme.fantasy-hair/moon-braid/background/teen/climb.png',
        'spritesheets/packages/acme.fantasy-hair/moon-braid/background/teen/walk.png',
        'spritesheets/packages/acme.fantasy-hair/moon-braid/foreground/male-female-teen/climb.png',
        'spritesheets/packages/acme.fantasy-hair/moon-braid/foreground/male-female-teen/walk.png',
      ],
    }]);
  });

  it('is deterministic across input pack order and coalesces duplicate physical sprite outputs', () => {
    const alpha = normalizeAssetPack(moonBraidPack());
    const beta = normalizeAssetPack(sunRibbonPack());

    const forward = compileAssetPacks({
      baseline,
      packs: [beta, alpha],
    });
    const reverse = compileAssetPacks({
      baseline,
      packs: [alpha, beta],
    });

    expect(projectPlan(forward)).toEqual(projectPlan(reverse));
    expect(forward.sprites.filter((sprite) =>
      sprite.destinationPath === 'spritesheets/packages/acme.fantasy-hair/moon-braid/foreground/male-female-teen/climb.png',
    )).toHaveLength(1);
    expect(forward.definitions.map((definition) => definition.logicalPath)).toEqual([
      'sheet_definitions/hair/acme.fantasy-hair--moon-braid.json',
      'sheet_definitions/hair/bravo.ribbons--sun-ribbon.json',
    ]);
  });
});
