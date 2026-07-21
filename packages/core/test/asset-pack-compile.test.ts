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

function duplicateOwnerPack(options?: {
  readonly version?: string;
  readonly credits?: typeof PACK_CREDITS;
  readonly creditOverrides?: Readonly<Record<string, typeof PACK_CREDITS>>;
}): AssetPackSource {
  return {
    schema: 'lpc-toolkit.asset-pack.v1',
    id: 'acme.shared-pack',
    version: options?.version ?? '1.0.0',
    displayName: 'ACME Shared Pack',
    credits: options?.credits ?? PACK_CREDITS,
    ...(options?.creditOverrides ? { creditOverrides: options.creditOverrides } : {}),
    assets: [{
      kind: 'new-item',
      localId: 'shared-item',
      displayName: 'Shared Item',
      typeName: 'hair',
      bodyTypes: ['male', 'female'],
      animations: ['walk'],
      layers: [{
        id: 'top',
        zPos: 90,
        sprites: [{
          animation: 'walk',
          source: 'sprites/shared-item/top/walk.png',
        }],
      }],
    }],
  };
}

function baselineWithExistingSharedItem(): AssetPackBaseline {
  return {
    catalog: createCatalog({
      'sheet_definitions/hair/acme.shared-pack--shared-item.json': {
        name: 'acme.shared-pack--shared-item',
        display_name: 'Baseline Shared Item',
        type_name: 'hair',
        animations: ['walk'],
        credits: [{
          file: 'packages/acme.shared-pack/shared-item/top/male-female/walk.png',
          authors: ['Baseline Artist'],
          licenses: ['CC-BY 4.0'],
          urls: ['https://example.com/baseline-artist'],
          notes: 'Baseline compiled credit.',
        }],
        layer_1: {
          zPos: 90,
          male: 'packages/acme.shared-pack/shared-item/top/male-female/',
          female: 'packages/acme.shared-pack/shared-item/top/male-female/',
        },
      },
    }).catalog,
    definitionDigests: new Map([['acme.shared-pack--shared-item', sha('c')]]),
    creditDigests: new Map([['acme.shared-pack--shared-item', sha('d')]]),
  };
}

function baselineWithMultipleManagedItems(): AssetPackBaseline {
  return {
    catalog: createCatalog({
      'sheet_definitions/hair/acme.shared-pack--shared-item.json': {
        name: 'acme.shared-pack--shared-item',
        display_name: 'Baseline Shared Item',
        type_name: 'hair',
        animations: ['walk'],
        credits: [{
          file: 'packages/acme.shared-pack/shared-item/top/male-female/walk.png',
          authors: ['Baseline Artist'],
          licenses: ['CC-BY 4.0'],
          urls: ['https://example.com/baseline-artist'],
          notes: 'Baseline compiled credit.',
        }],
        layer_1: {
          zPos: 90,
          male: 'packages/acme.shared-pack/shared-item/top/male-female/',
          female: 'packages/acme.shared-pack/shared-item/top/male-female/',
        },
      },
      'sheet_definitions/hair/acme.shared-pack--other-item.json': {
        name: 'acme.shared-pack--other-item',
        display_name: 'Baseline Other Item',
        type_name: 'hair',
        animations: ['walk'],
        credits: [{
          file: 'packages/acme.shared-pack/other-item/top/male-female/walk.png',
          authors: ['Other Baseline Artist'],
          licenses: ['CC-BY 4.0'],
          urls: ['https://example.com/other-baseline-artist'],
          notes: 'Other baseline compiled credit.',
        }],
        layer_1: {
          zPos: 95,
          male: 'packages/acme.shared-pack/other-item/top/male-female/',
          female: 'packages/acme.shared-pack/other-item/top/male-female/',
        },
      },
    }).catalog,
    definitionDigests: new Map([
      ['acme.shared-pack--shared-item', sha('c')],
      ['acme.shared-pack--other-item', sha('g')],
    ]),
    creditDigests: new Map([
      ['acme.shared-pack--shared-item', sha('d')],
      ['acme.shared-pack--other-item', sha('h')],
    ]),
  };
}

function extensionBaseline(): AssetPackBaseline {
  return {
    catalog: createCatalog({
      'hair/braid.json': {
        name: 'braid',
        display_name: 'Braid',
        type_name: 'hair',
        animations: ['walk'],
        variants: ['dark brown'],
        credits: [
          {
            file: 'hair/braid/front/walk/dark_brown.png',
            authors: ['Baseline Artist'],
            licenses: ['CC-BY-SA 4.0'],
            urls: ['https://example.com/baseline'],
            notes: 'Baseline walk credit.',
          },
          {
            file: 'hair/braid/front/climb/dark_brown.png',
            authors: ['Baseline Artist'],
            licenses: ['CC-BY-SA 4.0'],
            urls: ['https://example.com/baseline'],
            notes: 'Inherited climb credit.',
          },
        ],
        layer_1: {
          zPos: 50,
          male: 'hair/braid/front/',
          female: 'hair/braid/front/',
          teen: 'hair/braid/front/',
        },
        layer_2: {
          zPos: 80,
          male: 'hair/braid/trim/',
        },
      },
    }).catalog,
    definitionDigests: new Map([['braid', sha('e')]]),
    creditDigests: new Map([['braid', sha('f')]]),
  };
}

function extensionPack(overrides?: {
  readonly id?: string;
  readonly version?: string;
  readonly credits?: typeof PACK_CREDITS;
  readonly creditOverrides?: Readonly<Record<string, typeof PACK_CREDITS | typeof CLIMB_OVERRIDE>>;
  readonly replaces?: readonly {
    readonly packId: string;
    readonly versions: string;
    readonly assets: readonly string[];
  }[];
  readonly assets?: AssetPackSource['assets'];
}): AssetPackSource {
  return {
    schema: 'lpc-toolkit.asset-pack.v1',
    id: overrides?.id ?? 'acme.braid-extensions',
    version: overrides?.version ?? '1.0.0',
    displayName: 'ACME Braid Extensions',
    credits: overrides?.credits ?? PACK_CREDITS,
    ...(overrides?.creditOverrides ? { creditOverrides: overrides.creditOverrides } : {}),
    ...(overrides?.replaces ? { replaces: overrides.replaces } : {}),
    assets: overrides?.assets ?? [{
      kind: 'extend-item',
      itemId: 'braid',
      baseDefinitionDigest: sha('e'),
      baseCreditDigest: sha('f'),
      addAnimations: [{
        animation: 'climb',
        layers: [
          {
            layer: 'layer_1',
            bodyTypes: ['female'],
            source: 'sprites/braid/front-climb-female.png',
            variant: 'dark brown',
            destination: {
              path: 'spritesheets/hair/braid/front/climb/dark_brown.png',
              evidence: 'audit-exact',
              accepted: true,
            },
          },
          {
            layer: 'layer_1',
            bodyTypes: ['teen'],
            source: 'sprites/braid/front-climb-teen.png',
            destination: {
              path: 'spritesheets/hair/braid/front/climb.png',
              evidence: 'audit-inferred',
              accepted: true,
            },
          },
          {
            layer: 'layer_2',
            bodyTypes: ['female'],
            source: 'sprites/braid/trim-climb-female.png',
            destination: {
              path: 'spritesheets/hair/braid/trim-female/climb.png',
              evidence: 'artist-specified',
              accepted: true,
            },
          },
          {
            layer: 'layer_1',
            bodyTypes: ['male'],
            source: 'sprites/braid/front-climb-manual.png',
            destination: {
              path: 'spritesheets/hair/braid/manual-review/climb.png',
              evidence: 'manual-review',
              accepted: false,
            },
          },
        ],
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

  it('rejects a new-item identity already present in an unmanaged baseline catalog', () => {
    const plan = compileAssetPacks({
      baseline: baselineWithExistingSharedItem(),
      packs: [normalizeAssetPack(duplicateOwnerPack())],
    });

    expect(plan.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_path_conflict',
      severity: 'error',
      assetId: 'acme.shared-pack--shared-item',
      destinationPath: 'sheet_definitions/hair/acme.shared-pack--shared-item.json',
    }));
    expect(plan.definitions).toEqual([]);
    expect(plan.sprites).toEqual([]);
    expect(plan.credits).toEqual([]);
    expect(plan.ownership).toEqual([]);
  });

  it('rejects an extension destination that cannot resolve to the declared variant path', () => {
    const invalid = extensionPack({
      assets: [{
        kind: 'extend-item',
        itemId: 'braid',
        baseDefinitionDigest: sha('e'),
        baseCreditDigest: sha('f'),
        addAnimations: [{
          animation: 'climb',
          layers: [{
            layer: 'layer_1',
            bodyTypes: ['female'],
            source: 'sprites/braid/front-climb-female.png',
            variant: 'dark brown',
            destination: {
              path: 'spritesheets/hair/braid/front/climb/custom.png',
              evidence: 'artist-specified',
              accepted: true,
            },
          }],
        }],
      }],
    });

    const plan = compileAssetPacks({
      baseline: extensionBaseline(),
      packs: [normalizeAssetPack(invalid)],
    });

    expect(plan.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_pack_schema_invalid',
      severity: 'error',
      assetId: 'braid',
      destinationPath: 'spritesheets/hair/braid/front/climb/custom.png',
    }));
    expect(plan.definitions).toEqual([]);
    expect(plan.sprites).toEqual([]);
    expect(plan.credits).toEqual([]);
  });

  it('reports duplicate generated ownership instead of silently coalescing identical outputs', () => {
    const plan = compileAssetPacks({
      baseline,
      packs: [
        normalizeAssetPack(duplicateOwnerPack({ version: '1.0.0' })),
        normalizeAssetPack(duplicateOwnerPack({ version: '2.0.0' })),
      ],
    });

    expect(plan.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'asset_path_conflict',
        severity: 'error',
        assetId: 'acme.shared-pack--shared-item',
        destinationPath: 'sheet_definitions/hair/acme.shared-pack--shared-item.json',
      }),
      expect.objectContaining({
        code: 'asset_path_conflict',
        severity: 'error',
        assetId: 'acme.shared-pack--shared-item',
        sourcePath: 'sprites/shared-item/top/walk.png',
        destinationPath: 'spritesheets/packages/acme.shared-pack/shared-item/top/male-female/walk.png',
      }),
      expect.objectContaining({
        code: 'asset_path_conflict',
        severity: 'error',
        assetId: 'acme.shared-pack--shared-item',
        destinationPath: 'packages/acme.shared-pack/shared-item/top/male-female/walk.png',
      }),
    ]));
    expect(plan.definitions).toEqual([]);
    expect(plan.sprites).toEqual([]);
    expect(plan.credits).toEqual([]);
    expect(plan.ownership).toEqual([]);
  });

  it('reports conflicting generated credit ownership for the same compiled file', () => {
    const plan = compileAssetPacks({
      baseline,
      packs: [
        normalizeAssetPack(duplicateOwnerPack({
          version: '1.0.0',
          creditOverrides: {
            'sprites/shared-item/top/walk.png': PACK_CREDITS,
          },
        })),
        normalizeAssetPack(duplicateOwnerPack({
          version: '2.0.0',
          creditOverrides: {
            'sprites/shared-item/top/walk.png': CLIMB_OVERRIDE,
          },
        })),
      ],
    });

    expect(plan.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'asset_path_conflict',
        severity: 'error',
        assetId: 'acme.shared-pack--shared-item',
        destinationPath: 'packages/acme.shared-pack/shared-item/top/male-female/walk.png',
      }),
    ]));
    expect(plan.credits).toEqual([]);
  });

  it('compiles accepted existing-item patches, unions inherited credits, and skips manual-review destinations', () => {
    const plan = compileAssetPacks({
      baseline: extensionBaseline(),
      packs: [normalizeAssetPack(extensionPack({
        creditOverrides: {
          'sprites/braid/front-climb-female.png': CLIMB_OVERRIDE,
        },
      }))],
    });

    expect(plan.diagnostics).toEqual([]);
    expect(plan.definitions).toHaveLength(1);
    expect(plan.definitions[0]).toMatchObject({
      logicalPath: 'sheet_definitions/hair/braid.json',
      basename: 'braid.json',
      definition: {
        name: 'braid',
        display_name: 'Braid',
        type_name: 'hair',
        animations: ['walk', 'climb'],
        layer_1: {
          zPos: 50,
          male: 'hair/braid/front/',
          female: 'hair/braid/front/',
          teen: 'hair/braid/front/',
        },
        layer_2: {
          zPos: 80,
          male: 'hair/braid/trim/',
          female: 'hair/braid/trim-female/',
        },
      },
    });

    expect(plan.sprites.map((sprite) => sprite.destinationPath)).toEqual([
      'spritesheets/hair/braid/front/climb.png',
      'spritesheets/hair/braid/front/climb/dark_brown.png',
      'spritesheets/hair/braid/trim-female/climb.png',
    ]);

    expect(plan.sprites).not.toContainEqual(expect.objectContaining({
      destinationPath: 'spritesheets/hair/braid/manual-review/climb.png',
    }));

    expect(plan.credits).toContainEqual({
      file: 'hair/braid/front/climb/dark_brown.png',
      authors: ['Baseline Artist', 'Beatrice'],
      licenses: ['CC-BY-SA 4.0', 'CC-BY 4.0'],
      urls: ['https://example.com/baseline', 'https://example.com/beatrice'],
      notes: 'Inherited climb credit.\n\nForeground climb override.',
    });

    expect(plan.definitions[0]?.definition.credits).toContainEqual({
      file: 'hair/braid/front/climb/dark_brown.png',
      authors: ['Baseline Artist', 'Beatrice'],
      licenses: ['CC-BY-SA 4.0', 'CC-BY 4.0'],
      urls: ['https://example.com/baseline', 'https://example.com/beatrice'],
      notes: 'Inherited climb credit.\n\nForeground climb override.',
    });
  });

  it('reports baseline definition and credit drift before applying an existing-item delta', () => {
    const definitionDrift = compileAssetPacks({
      baseline: extensionBaseline(),
      packs: [normalizeAssetPack(extensionPack({
        assets: [{
          kind: 'extend-item',
          itemId: 'braid',
          baseDefinitionDigest: sha('a'),
          baseCreditDigest: sha('f'),
          addAnimations: [{
            animation: 'climb',
            layers: [{
              layer: 'layer_1',
              bodyTypes: ['female'],
              source: 'sprites/braid/front-climb-female.png',
              variant: 'dark brown',
              destination: {
                path: 'spritesheets/hair/braid/front/climb/dark_brown.png',
                evidence: 'audit-exact',
                accepted: true,
              },
            }],
          }],
        }],
      }))],
    });

    expect(definitionDrift.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_base_definition_changed',
      severity: 'error',
      assetId: 'braid',
    }));
    expect(definitionDrift.definitions).toEqual([]);
    expect(definitionDrift.sprites).toEqual([]);
    expect(definitionDrift.credits).toEqual([]);

    const creditDrift = compileAssetPacks({
      baseline: extensionBaseline(),
      packs: [normalizeAssetPack(extensionPack({
        assets: [{
          kind: 'extend-item',
          itemId: 'braid',
          baseDefinitionDigest: sha('e'),
          baseCreditDigest: sha('a'),
          addAnimations: [{
            animation: 'climb',
            layers: [{
              layer: 'layer_1',
              bodyTypes: ['female'],
              source: 'sprites/braid/front-climb-female.png',
              variant: 'dark brown',
              destination: {
                path: 'spritesheets/hair/braid/front/climb/dark_brown.png',
                evidence: 'audit-exact',
                accepted: true,
              },
            }],
          }],
        }],
      }))],
    });

    expect(creditDrift.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_base_credit_changed',
      severity: 'error',
      assetId: 'braid',
    }));
    expect(creditDrift.definitions).toEqual([]);
    expect(creditDrift.sprites).toEqual([]);
    expect(creditDrift.credits).toEqual([]);
  });

  it('merges disjoint patches but rejects same semantic field conflicts', () => {
    const baseline = extensionBaseline();
    const childClimb = normalizeAssetPack(extensionPack({
      id: 'acme.child-climb',
      assets: [{
        kind: 'extend-item',
        itemId: 'braid',
        baseDefinitionDigest: sha('e'),
        baseCreditDigest: sha('f'),
        addAnimations: [{
          animation: 'climb',
          layers: [{
            layer: 'layer_1',
            bodyTypes: ['teen'],
            source: 'sprites/braid/front-climb-teen.png',
            destination: {
              path: 'spritesheets/hair/braid/front/climb.png',
              evidence: 'audit-inferred',
              accepted: true,
            },
          }],
        }],
      }],
    }));
    const adultClimb = normalizeAssetPack(extensionPack({
      id: 'bravo.adult-climb',
      assets: [{
        kind: 'extend-item',
        itemId: 'braid',
        baseDefinitionDigest: sha('e'),
        baseCreditDigest: sha('f'),
        addAnimations: [{
          animation: 'climb',
          layers: [{
            layer: 'layer_2',
            bodyTypes: ['female'],
            source: 'sprites/braid/trim-climb-female.png',
            destination: {
              path: 'spritesheets/hair/braid/trim-female/climb.png',
              evidence: 'artist-specified',
              accepted: true,
            },
          }],
        }],
      }],
    }));

    const merged = compileAssetPacks({ baseline, packs: [childClimb, adultClimb] });
    expect(merged.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: 'asset_path_conflict' }),
    );
    expect(merged.definitions[0]?.definition.layer_2).toMatchObject({
      female: 'hair/braid/trim-female/',
    });

    const otherChildClimb = normalizeAssetPack(extensionPack({
      id: 'charlie.child-climb',
      assets: [{
        kind: 'extend-item',
        itemId: 'braid',
        baseDefinitionDigest: sha('e'),
        baseCreditDigest: sha('f'),
        addAnimations: [{
          animation: 'climb',
          layers: [{
            layer: 'layer_1',
            bodyTypes: ['teen'],
            source: 'sprites/braid/alternate-teen.png',
            destination: {
              path: 'spritesheets/hair/braid/front-alt/climb.png',
              evidence: 'artist-specified',
              accepted: true,
            },
          }],
        }],
      }],
    }));

    const conflicted = compileAssetPacks({ baseline, packs: [childClimb, otherChildClimb] });
    expect(conflicted.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'asset_path_conflict', severity: 'error' }),
    );
  });

  it('rejects two owners of one destination even when their semantic targets differ', () => {
    const conflicted = compileAssetPacks({
      baseline: extensionBaseline(),
      packs: [
        normalizeAssetPack(extensionPack({
          id: 'acme.child-climb',
          assets: [{
            kind: 'extend-item',
            itemId: 'braid',
            baseDefinitionDigest: sha('e'),
            baseCreditDigest: sha('f'),
            addAnimations: [{
              animation: 'climb',
              layers: [{
                layer: 'layer_1',
                bodyTypes: ['teen'],
                source: 'sprites/braid/front-climb-teen.png',
                destination: {
                  path: 'spritesheets/hair/braid/shared/climb.png',
                  evidence: 'audit-inferred',
                  accepted: true,
                },
              }],
            }],
          }],
        })),
        normalizeAssetPack(extensionPack({
          id: 'bravo.adult-climb',
          assets: [{
            kind: 'extend-item',
            itemId: 'braid',
            baseDefinitionDigest: sha('e'),
            baseCreditDigest: sha('f'),
            addAnimations: [{
              animation: 'climb',
              layers: [{
                layer: 'layer_2',
                bodyTypes: ['female'],
                source: 'sprites/braid/trim-climb-female.png',
                destination: {
                  path: 'spritesheets/hair/braid/shared/climb.png',
                  evidence: 'artist-specified',
                  accepted: true,
                },
              }],
            }],
          }],
        })),
      ],
    });

    expect(conflicted.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'asset_path_conflict',
        severity: 'error',
        destinationPath: 'spritesheets/hair/braid/shared/climb.png',
      }),
    );
  });

  it('allows exact authorized cross-pack replacement of manager-owned outputs', () => {
    const plan = compileAssetPacks({
      baseline: baselineWithExistingSharedItem(),
      packs: [normalizeAssetPack(extensionPack({
        id: 'omega.shared-replacer',
        replaces: [{
          packId: 'acme.shared-pack',
          versions: '>=1.0.0 <1.1.0',
          assets: ['shared-item'],
        }],
        assets: [{
          kind: 'extend-item',
          itemId: 'acme.shared-pack--shared-item',
          baseDefinitionDigest: sha('c'),
          baseCreditDigest: sha('d'),
          addAnimations: [{
            animation: 'climb',
            layers: [{
              layer: 'layer_1',
              bodyTypes: ['male', 'female'],
              source: 'sprites/shared-item/top/climb.png',
              destination: {
                path: 'spritesheets/packages/acme.shared-pack/shared-item/top/male-female/climb.png',
                evidence: 'audit-exact',
                accepted: true,
              },
            }],
          }],
        }],
      }))],
    });

    expect(plan.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: 'asset_replacement_unauthorized' }),
    );
    expect(plan.definitions[0]).toMatchObject({
      logicalPath: 'sheet_definitions/hair/acme.shared-pack--shared-item.json',
      definition: expect.objectContaining({
        name: 'acme.shared-pack--shared-item',
        animations: ['walk', 'climb'],
      }),
    });
    expect(plan.sprites).toContainEqual(expect.objectContaining({
      destinationPath: 'spritesheets/packages/acme.shared-pack/shared-item/top/male-female/climb.png',
    }));
  });

  it('rejects authorized replacement attempts into another managed asset destination', () => {
    const plan = compileAssetPacks({
      baseline: baselineWithMultipleManagedItems(),
      packs: [normalizeAssetPack(extensionPack({
        id: 'omega.shared-replacer',
        replaces: [{
          packId: 'acme.shared-pack',
          versions: '=1.0.0',
          assets: ['shared-item'],
        }],
        assets: [{
          kind: 'extend-item',
          itemId: 'acme.shared-pack--shared-item',
          baseDefinitionDigest: sha('c'),
          baseCreditDigest: sha('d'),
          addAnimations: [{
            animation: 'climb',
            layers: [{
              layer: 'layer_1',
              bodyTypes: ['male', 'female'],
              source: 'sprites/shared-item/top/climb.png',
              destination: {
                path: 'spritesheets/packages/acme.shared-pack/other-item/top/male-female/climb.png',
                evidence: 'audit-exact',
                accepted: true,
              },
            }],
          }],
        }],
      }))],
    });

    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'asset_replacement_unauthorized',
        severity: 'error',
        assetId: 'acme.shared-pack--shared-item',
        destinationPath: 'spritesheets/packages/acme.shared-pack/other-item/top/male-female/climb.png',
      }),
    );
    expect(plan.definitions).toEqual([]);
    expect(plan.sprites).toEqual([]);
    expect(plan.credits).toEqual([]);
  });

  it('rejects unauthorized replacement into manager-owned base paths', () => {
    const plan = compileAssetPacks({
      baseline: baselineWithExistingSharedItem(),
      packs: [normalizeAssetPack(extensionPack({
        id: 'zeta.unauthorized-replacer',
        assets: [{
          kind: 'extend-item',
          itemId: 'acme.shared-pack--shared-item',
          baseDefinitionDigest: sha('c'),
          baseCreditDigest: sha('d'),
          addAnimations: [{
            animation: 'climb',
            layers: [{
              layer: 'layer_1',
              bodyTypes: ['male', 'female'],
              source: 'sprites/shared-item/top/climb.png',
              destination: {
                path: 'spritesheets/packages/acme.shared-pack/shared-item/top/male-female/climb.png',
                evidence: 'audit-exact',
                accepted: true,
              },
            }],
          }],
        }],
      }))],
    });

    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'asset_replacement_unauthorized',
        severity: 'error',
        assetId: 'acme.shared-pack--shared-item',
        destinationPath: 'spritesheets/packages/acme.shared-pack/shared-item/top/male-female/climb.png',
      }),
    );
    expect(plan.definitions).toEqual([]);
    expect(plan.sprites).toEqual([]);
    expect(plan.credits).toEqual([]);
  });
});
