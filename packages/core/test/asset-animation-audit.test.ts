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

  it('plans native and custom walk sources together for the normal bow', () => {
    const catalog = createCatalog({
      'weapon/ranged/bow/normal.json': {
        name: 'Normal',
        type_name: 'weapon',
        animations: ['walk', 'shoot', 'hurt', 'walk_128'],
        variants: ['light'],
        credits: [],
        layer_1: {
          zPos: -1,
          male: 'weapon/ranged/bow/normal/universal/background/',
        },
        layer_2: {
          zPos: 140,
          male: 'weapon/ranged/bow/normal/universal/foreground/',
        },
        layer_3: {
          zPos: -1,
          custom_animation: 'walk_128',
          male: 'weapon/ranged/bow/normal/walk/background/',
        },
        layer_4: {
          zPos: 141,
          custom_animation: 'walk_128',
          male: 'weapon/ranged/bow/normal/walk/foreground/',
        },
      },
    }).catalog;

    const plan = planAssetAnimationAudit({ catalog, palettes, targets: ['walk'] });

    expect(plan.unsupported).toEqual([]);
    expect(plan.assets.map(({ path, sourceAnimation, consumers }) => ({
      path,
      sourceAnimation,
      layer: consumers[0]?.layer,
    }))).toEqual([
      {
        path: 'spritesheets/weapon/ranged/bow/normal/universal/background/walk/light.png',
        sourceAnimation: 'walk',
        layer: 'layer_1',
      },
      {
        path: 'spritesheets/weapon/ranged/bow/normal/universal/foreground/walk/light.png',
        sourceAnimation: 'walk',
        layer: 'layer_2',
      },
      {
        path: 'spritesheets/weapon/ranged/bow/normal/walk/background/light.png',
        sourceAnimation: 'walk_128',
        layer: 'layer_3',
      },
      {
        path: 'spritesheets/weapon/ranged/bow/normal/walk/foreground/light.png',
        sourceAnimation: 'walk_128',
        layer: 'layer_4',
      },
    ]);
  });

  it('plans every compatible custom source for the longsword slash target', () => {
    const catalog = createCatalog({
      'weapon/sword/longsword.json': {
        name: 'Longsword',
        type_name: 'weapon',
        animations: ['slash_oversize', 'slash_reverse_oversize'],
        variants: ['longsword'],
        credits: [],
        layer_1: {
          zPos: -1,
          custom_animation: 'slash_oversize',
          male: 'weapon/sword/longsword/attack_slash/behind/',
        },
        layer_2: {
          zPos: 150,
          custom_animation: 'slash_oversize',
          male: 'weapon/sword/longsword/attack_slash/',
        },
        layer_3: {
          zPos: -1,
          custom_animation: 'slash_reverse_oversize',
          male: 'weapon/sword/longsword/attack_slash_reverse/behind/',
        },
        layer_4: {
          zPos: 150,
          custom_animation: 'slash_reverse_oversize',
          male: 'weapon/sword/longsword/attack_slash_reverse/',
        },
      },
    }).catalog;

    const plan = planAssetAnimationAudit({ catalog, palettes, targets: ['slash'] });

    expect(plan.unsupported).toEqual([]);
    expect(plan.assets.map(({ path, sourceAnimation, consumers }) => ({
      path,
      sourceAnimation,
      layer: consumers[0]?.layer,
    }))).toEqual([
      {
        path: 'spritesheets/weapon/sword/longsword/attack_slash_reverse/behind/longsword.png',
        sourceAnimation: 'slash_reverse_oversize',
        layer: 'layer_3',
      },
      {
        path: 'spritesheets/weapon/sword/longsword/attack_slash_reverse/longsword.png',
        sourceAnimation: 'slash_reverse_oversize',
        layer: 'layer_4',
      },
      {
        path: 'spritesheets/weapon/sword/longsword/attack_slash/behind/longsword.png',
        sourceAnimation: 'slash_oversize',
        layer: 'layer_1',
      },
      {
        path: 'spritesheets/weapon/sword/longsword/attack_slash/longsword.png',
        sourceAnimation: 'slash_oversize',
        layer: 'layer_2',
      },
    ]);
  });

  it('maps backslash and halfslash custom bases to their registered logical targets', () => {
    const catalog = createCatalog({
      'weapon/sword/arming.json': {
        name: 'Arming Sword',
        type_name: 'weapon',
        animations: ['slash_128', 'backslash_128', 'halfslash_128'],
        variants: ['steel'],
        credits: [],
        layer_1: {
          zPos: 8,
          custom_animation: 'slash_128',
          male: 'weapon/sword/arming/attack_slash/bg/',
        },
        layer_2: {
          zPos: 8,
          custom_animation: 'backslash_128',
          male: 'weapon/sword/arming/attack_backslash/bg/',
        },
        layer_3: {
          zPos: 8,
          custom_animation: 'halfslash_128',
          male: 'weapon/sword/arming/attack_halfslash/bg/',
        },
      },
    }).catalog;

    const plan = planAssetAnimationAudit({
      catalog,
      palettes,
      targets: ['1h_slash', '1h_backslash', '1h_halfslash'],
    });

    expect(plan.unsupported).toEqual([]);
    expect(plan.assets.map(({ animation, sourceAnimation, path }) => ({
      animation,
      sourceAnimation,
      path,
    }))).toEqual([
      {
        animation: '1h_backslash',
        sourceAnimation: 'backslash_128',
        path: 'spritesheets/weapon/sword/arming/attack_backslash/bg/steel.png',
      },
      {
        animation: '1h_slash',
        sourceAnimation: 'backslash_128',
        path: 'spritesheets/weapon/sword/arming/attack_backslash/bg/steel.png',
      },
      {
        animation: '1h_halfslash',
        sourceAnimation: 'halfslash_128',
        path: 'spritesheets/weapon/sword/arming/attack_halfslash/bg/steel.png',
      },
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

  it('sorts nested requirements and planning errors by their canonical consumer fields', () => {
    const requirementCatalog = createCatalog({
      'hair/reversed-variants.json': {
        name: 'Reversed Variants', type_name: 'hair', animations: ['walk'],
        variants: ['z', 'a'], credits: [],
        layer_1: { zPos: 10, male: 'hair/reversed/' },
      },
    }).catalog;
    const requirements = planAssetAnimationAudit({
      catalog: requirementCatalog,
      palettes,
      targets: ['run'],
    }).unsupported[0]?.requirements;

    expect(requirements?.map((requirement) => requirement.expectedPath)).toEqual([
      'spritesheets/hair/reversed/run/a.png',
      'spritesheets/hair/reversed/run/z.png',
    ]);

    const errorCatalog = createCatalog({
      'alpha.json': {
        name: 'Alpha', type_name: 'zeta', animations: ['walk'], credits: [],
        layer_1: { zPos: 10, male: 'hair/${head}/alpha/' },
      },
      'beta.json': {
        name: 'Beta', type_name: 'alpha', animations: ['walk'], credits: [],
        layer_1: { zPos: 10, male: 'hair/${head}/beta/' },
      },
    }).catalog;
    const errors = planAssetAnimationAudit({
      catalog: errorCatalog,
      palettes,
      targets: ['walk'],
    }).errors;

    expect(errors.map((error) => `${error.consumer.typeName}/${error.consumer.itemId}`)).toEqual([
      'alpha/beta',
      'zeta/alpha',
    ]);
  });
});
