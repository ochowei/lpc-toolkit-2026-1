import { describe, expect, it } from 'vitest';
import { createCatalog } from '../src/catalog.js';
import { planAssetAnimationAudit } from '../src/asset-animation-audit.js';
import { createPaletteCatalog } from '../src/palettes.js';

const palettes = createPaletteCatalog({
  'hair/meta_hair.json': { type: 'material', default: 'ulpc', base: 'black' },
  'hair/hair_ulpc.json': {
    black: ['#111111', '#222222'],
    orange: ['#cc5500', '#ee7700'],
  },
}).palettes;

function createAuditCatalog() {
  return createCatalog({
    'hair/braid.json': {
      name: 'Braid',
      type_name: 'hair',
      animations: ['walk'],
      variants: ['dark brown'],
      recolors: { material: 'hair', palettes: ['ulpc'] },
      credits: [],
      layer_1: { zPos: 50, male: 'hair/braid/', female: 'hair/braid/' },
    },
  }).catalog;
}

describe('planAssetAnimationAudit', () => {
  it('plans exact supported files and inferred unsupported work by layer and variant', () => {
    const plan = planAssetAnimationAudit({
      catalog: createAuditCatalog(),
      palettes,
      targets: ['walk', 'run'],
    });

    expect(plan.itemsScanned).toBe(1);
    expect(plan.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'spritesheets/hair/braid/walk/dark_brown.png',
        animation: 'walk',
        consumers: [expect.objectContaining({
          layer: 'layer_1',
          bodyTypes: ['male', 'female'],
          variant: 'dark brown',
          recolors: ['black', 'orange'],
        })],
      }),
    ]));
    expect(plan.unsupported).toEqual([
      expect.objectContaining({
        itemId: 'braid',
        animation: 'run',
        requirements: [expect.objectContaining({
          expectedPath: 'spritesheets/hair/braid/run/dark_brown.png',
          pathConfidence: 'inferred',
        })],
      }),
    ]);
  });

  it('uses registry target order and removes duplicate target inputs', () => {
    const plan = planAssetAnimationAudit({
      catalog: createAuditCatalog(),
      palettes,
      targets: ['run', 'walk', 'run', 'missing'],
    });

    expect(plan.targets).toEqual(['walk', 'run']);
  });

  it('plans compatible custom geometry from the custom source animation', () => {
    const catalog = createCatalog({
      'chairs/wheelchair.json': {
        name: 'Wheelchair',
        type_name: 'chair',
        animations: ['wheelchair'],
        variants: ['oak'],
        credits: [],
        layer_1: {
          zPos: 20,
          custom_animation: 'wheelchair',
          male: 'chairs/wheelchair/',
        },
      },
    }).catalog;

    const plan = planAssetAnimationAudit({ catalog, palettes, targets: ['sit'] });

    expect(plan.unsupported).toEqual([]);
    expect(plan.assets).toEqual([
      expect.objectContaining({
        path: 'spritesheets/chairs/wheelchair/oak.png',
        animation: 'sit',
        sourceAnimation: 'wheelchair',
        geometry: expect.objectContaining({
          kind: 'custom',
          frameSize: 64,
          rows: expect.arrayContaining([
            expect.objectContaining({
              direction: 'up',
              cells: [
                { sourceColumn: 0, logicalFrameIndices: [0] },
                { sourceColumn: 1, logicalFrameIndices: [1] },
              ],
            }),
          ]),
        }),
      }),
    ]);
  });

  it('emits one manual-review requirement when an unsupported item has only custom layers', () => {
    const catalog = createCatalog({
      'chairs/wheelchair.json': {
        name: 'Wheelchair',
        type_name: 'chair',
        animations: ['wheelchair'],
        credits: [],
        layer_1: {
          zPos: 20,
          custom_animation: 'wheelchair',
          male: 'chairs/wheelchair/',
        },
      },
    }).catalog;

    const plan = planAssetAnimationAudit({ catalog, palettes, targets: ['walk'] });

    expect(plan.unsupported[0]?.requirements).toEqual([
      expect.objectContaining({
        pathConfidence: 'manual-review',
        manualReviewReason:
          'Item has only custom-animation layers; choose a standard layout before drawing.',
      }),
    ]);
    expect(plan.unsupported[0]?.requirements[0]).not.toHaveProperty('expectedPath');
  });

  it('marks unresolved substitutions for manual review', () => {
    const catalog = createCatalog({
      'hair/dependent.json': {
        name: 'Dependent',
        type_name: 'hair',
        animations: ['walk'],
        credits: [],
        layer_1: { zPos: 50, male: 'hair/${head}/dependent/' },
      },
    }).catalog;

    const plan = planAssetAnimationAudit({ catalog, palettes, targets: ['run'] });

    expect(plan.unsupported[0]?.requirements).toEqual([
      expect.objectContaining({
        pathConfidence: 'manual-review',
        manualReviewReason:
          'Layer path depends on an unresolved ${head} selection.',
      }),
    ]);
  });

  it('filters scanned items and consumers by type and body type', () => {
    const catalog = createCatalog({
      'hair/braid.json': {
        name: 'Braid', type_name: 'hair', animations: ['walk'], credits: [],
        layer_1: { zPos: 50, male: 'hair/braid/male/', female: 'hair/braid/female/' },
      },
      'hat/cap.json': {
        name: 'Cap', type_name: 'hat', animations: ['walk'], credits: [],
        layer_1: { zPos: 60, male: 'hat/cap/' },
      },
    }).catalog;

    const plan = planAssetAnimationAudit({
      catalog,
      palettes,
      targets: ['walk'],
      typeName: 'hair',
      bodyType: 'female',
    });

    expect(plan.itemsScanned).toBe(1);
    expect(plan.assets[0]?.consumers[0]?.bodyTypes).toEqual(['female']);
  });

  it('sorts asset and unsupported findings deterministically', () => {
    const catalog = createCatalog({
      'hat/zeta.json': {
        name: 'Zeta', type_name: 'hat', animations: ['walk'], credits: [],
        layer_1: { zPos: 20, male: 'hat/zeta/' },
      },
      'hair/alpha.json': {
        name: 'Alpha', type_name: 'hair', animations: ['walk'], credits: [],
        layer_1: { zPos: 10, male: 'hair/alpha/' },
      },
    }).catalog;

    const plan = planAssetAnimationAudit({ catalog, palettes, targets: ['walk', 'run'] });

    expect(plan.assets.map((asset) => asset.path)).toEqual([
      'spritesheets/hair/alpha/walk.png',
      'spritesheets/hat/zeta/walk.png',
    ]);
    expect(plan.unsupported.map((finding) => finding.itemId)).toEqual(['alpha', 'zeta']);
  });
});
