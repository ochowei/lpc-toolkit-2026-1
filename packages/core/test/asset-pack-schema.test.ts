import { describe, expect, it } from 'vitest';
import type { AssetPackSource } from '../src/asset-pack-schema.js';
import {
  ASSET_PACK_SCHEMA,
  parseAssetPackSource,
} from '../src/asset-pack-schema.js';
import {
  assetPackContentProjection,
  assetPackItemId,
  normalizeAssetPack,
} from '../src/asset-pack-model.js';

const PACK_CREDITS = {
  authors: ['Alice'],
  licenses: ['CC-BY-SA 4.0'],
  urls: ['https://example.com/acme/fantasy-hair'],
  notes: '',
} as const;

const CREDIT_OVERRIDE = {
  authors: ['Alice', 'Bob'],
  licenses: ['CC-BY-SA 4.0'],
  urls: ['https://example.com/bob/climb-contribution'],
  notes: 'Climb animation contributed by Bob.',
} as const;

const ACKNOWLEDGEMENT = {
  code: 'asset_path_inferred',
  subject: {
    assetId: 'hair_messy',
    animation: 'climb',
    bodyTypes: ['child'],
  },
  contentDigest: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  reason: 'Accepted the inferred destination after review.',
} as const;

const validPack: AssetPackSource = {
  schema: ASSET_PACK_SCHEMA,
  id: 'acme.fantasy-hair',
  version: '1.0.0',
  displayName: 'ACME Fantasy Hair',
  credits: PACK_CREDITS,
  creditOverrides: {
    'sprites/moon-braid/foreground/climb.png': CREDIT_OVERRIDE,
  },
  replaces: [{
    packId: 'acme.fantasy-hair',
    versions: '>=1.0.0 <1.1.0',
    assets: ['moon-braid'],
  }],
  acknowledgements: [ACKNOWLEDGEMENT],
  assets: [
    {
      kind: 'new-item',
      localId: 'moon-braid',
      displayName: 'Moon Braid',
      typeName: 'hair',
      bodyTypes: ['male', 'female', 'teen'],
      animations: ['walk', 'climb'],
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
          ],
        },
      ],
      recolor: {
        material: 'hair',
        palettes: ['ulpc', 'lpcr', 'all.lpcr'],
      },
    },
    {
      kind: 'extend-item',
      itemId: 'hair_messy',
      baseDefinitionDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      baseCreditDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      addAnimations: [
        {
          animation: 'climb',
          layers: [
            {
              layer: 'layer_1',
              bodyTypes: ['child'],
              source: 'sprites/hair-messy-child-climb.png',
              destination: {
                path: 'spritesheets/hair/messy/child/climb.png',
                evidence: 'audit-inferred',
                accepted: true,
              },
            },
          ],
        },
      ],
    },
  ],
};

function requireNewItemFixture() {
  const firstAsset = validPack.assets[0];
  if (!firstAsset || firstAsset.kind !== 'new-item') {
    throw new Error('Expected the first fixture asset to be a new item.');
  }

  return firstAsset;
}

function requireDiagnosticPaths(
  result: ReturnType<typeof parseAssetPackSource>,
): string[] {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error('Expected parsing to fail.');
  }

  return result.diagnostics.map((diagnostic) => {
    const path = diagnostic.details?.path;
    return typeof path === 'string' ? path : '<missing-path>';
  });
}

function expectEquivalentDiagnosticPaths(
  inputs: readonly unknown[],
  expectedPaths: readonly string[],
) {
  inputs.forEach((input) => {
    expect(requireDiagnosticPaths(parseAssetPackSource(input))).toEqual(expectedPaths);
  });
}

describe('asset pack schema', () => {
  it('parses the approved v1 examples for new and extended items', () => {
    const result = parseAssetPackSource(validPack);
    expect(result).toEqual({ ok: true, source: validPack });
  });

  it('rejects misspelled v1 fields instead of ignoring them', () => {
    const result = parseAssetPackSource({ ...validPack, displayNmae: 'typo' });
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_pack_schema_invalid', severity: 'error' }],
    });
  });

  it('rejects unknown nested v1 fields instead of ignoring them', () => {
    const firstAsset = requireNewItemFixture();
    const firstLayer = firstAsset.layers[0];
    if (!firstLayer) {
      throw new Error('Expected the new-item fixture to define a first layer.');
    }

    const result = parseAssetPackSource({
      ...validPack,
      assets: [{
        ...firstAsset,
        layers: [{
          ...firstLayer,
          spritez: [],
        }],
      }],
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_pack_schema_invalid', severity: 'error' }],
    });
  });

  it('rejects an extension destination that does not encode its animation and variant exactly', () => {
    const extension = validPack.assets[1];
    if (!extension || extension.kind !== 'extend-item') {
      throw new Error('Expected the second fixture asset to be an extension.');
    }
    const animation = extension.addAnimations[0];
    const layer = animation?.layers[0];
    if (!animation || !layer) {
      throw new Error('Expected the extension fixture to define a layer.');
    }

    const result = parseAssetPackSource({
      ...validPack,
      assets: [{
        ...extension,
        addAnimations: [{
          ...animation,
          layers: [{
            ...layer,
            variant: 'dark brown',
            destination: {
              ...layer.destination,
              path: 'spritesheets/hair/messy/child/climb/custom.png',
            },
          }],
        }],
      }],
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: 'asset_pack_schema_invalid',
        severity: 'error',
        destinationPath: 'spritesheets/hair/messy/child/climb/custom.png',
        details: expect.objectContaining({
          path: '$.assets[0].addAnimations[0].layers[0].destination.path',
        }),
      })],
    });
  });

  it('rejects unknown major schema versions', () => {
    const result = parseAssetPackSource({
      ...validPack,
      schema: 'lpc-toolkit.asset-pack.v2',
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_pack_schema_invalid', severity: 'error' }],
    });
  });

  it('rejects missing credits, unsupported licenses, and URL-less credits without notes', () => {
    const missingCredits = parseAssetPackSource({
      ...validPack,
      credits: undefined,
    });
    expect(missingCredits).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_credit_missing', severity: 'error' }],
    });

    const unsupportedLicense = parseAssetPackSource({
      ...validPack,
      credits: {
        ...PACK_CREDITS,
        licenses: ['MIT'],
      },
    });
    expect(unsupportedLicense).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_license_invalid', severity: 'error' }],
    });

    const missingCreditNotes = parseAssetPackSource({
      ...validPack,
      credits: {
        ...PACK_CREDITS,
        urls: [],
        notes: '',
      },
    });
    expect(missingCreditNotes).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_credit_missing', severity: 'error' }],
    });
  });

  it('rejects invalid pack ids, local ids, and versions', () => {
    const firstAsset = requireNewItemFixture();

    expect(parseAssetPackSource({
      ...validPack,
      id: 'Acme.Fantasy-Hair',
    })).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_pack_id_invalid', severity: 'error' }],
    });

    expect(parseAssetPackSource({
      ...validPack,
      assets: [{ ...firstAsset, localId: 'Moon-braid' }],
    })).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_pack_id_invalid', severity: 'error' }],
    });

    expect(parseAssetPackSource({
      ...validPack,
      version: '1.0',
    })).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_pack_schema_invalid', severity: 'error' }],
    });
  });

  it.each([
    '^1.0.0',
    '>= 1.0.0',
    '1.0.0',
    '>=1.0',
    '>=1.0.0 || <2.0.0',
  ])('rejects malformed replacement version ranges: %s', (versions) => {
    const result = parseAssetPackSource({
      ...validPack,
      replaces: [{
        packId: 'acme.fantasy-hair',
        versions,
        assets: ['moon-braid'],
      }],
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: 'asset_pack_schema_invalid',
        severity: 'error',
      })],
    });
  });

  it('reports diagnostics in global JSON-path order', () => {
    const firstAsset = requireNewItemFixture();
    const firstLayer = firstAsset.layers[0];
    if (!firstLayer) {
      throw new Error('Expected the new-item fixture to define a first layer.');
    }

    const result = parseAssetPackSource({
      ...validPack,
      schema: 'lpc-toolkit.asset-pack.v2',
      id: 'Acme.Fantasy-Hair',
      version: '1.0',
      credits: {
        ...PACK_CREDITS,
        licenses: ['MIT'],
      },
      assets: [{
        ...firstAsset,
        layers: [{
          ...firstLayer,
          sprites: [{
            ...firstLayer.sprites[0]!,
            source: 'images/moon-braid/foreground/walk.png',
          }],
        }],
      }],
    });

    expect(requireDiagnosticPaths(result)).toEqual([
      '$.assets[0].layers[0].sprites[0].source',
      '$.credits.licenses[0]',
      '$.id',
      '$.schema',
      '$.version',
    ]);
  });

  it('reports unknown fields in sorted path order', () => {
    const result = parseAssetPackSource({
      ...validPack,
      zulu: true,
      alpha: true,
      middle: true,
    });

    expect(requireDiagnosticPaths(result)).toEqual([
      '$.alpha',
      '$.middle',
      '$.zulu',
    ]);
  });

  it('reports typed sibling diagnostics before later unknown sibling paths', () => {
    const result = parseAssetPackSource({
      ...validPack,
      displayName: false,
      zulu: true,
    });

    expect(requireDiagnosticPaths(result)).toEqual([
      '$.displayName',
      '$.zulu',
    ]);
  });

  it('reports credit override diagnostics in sorted path order regardless of source key order', () => {
    expectEquivalentDiagnosticPaths(
      [
        {
          ...validPack,
          creditOverrides: {
            'sprites/zeta/credits.png': 'bad-credit',
            'images/middle/credits.png': PACK_CREDITS,
            'sprites/alpha/credits.png': false,
          },
        },
        {
          ...validPack,
          creditOverrides: {
            'sprites/alpha/credits.png': false,
            'sprites/zeta/credits.png': 'bad-credit',
            'images/middle/credits.png': PACK_CREDITS,
          },
        },
      ],
      [
        '$.creditOverrides.images/middle/credits.png',
        '$.creditOverrides.sprites/alpha/credits.png',
        '$.creditOverrides.sprites/zeta/credits.png',
      ],
    );
  });

  it('reports acknowledgement subject diagnostics in sorted path order regardless of source key order', () => {
    expectEquivalentDiagnosticPaths(
      [
        {
          ...validPack,
          acknowledgements: [{
            ...ACKNOWLEDGEMENT,
            subject: {
              zulu: 1,
              alpha: false,
              middle: [1],
            },
          }],
        },
        {
          ...validPack,
          acknowledgements: [{
            ...ACKNOWLEDGEMENT,
            subject: {
              middle: [1],
              zulu: 1,
              alpha: false,
            },
          }],
        },
      ],
      [
        '$.acknowledgements[0].subject.alpha',
        '$.acknowledgements[0].subject.middle',
        '$.acknowledgements[0].subject.zulu',
      ],
    );
  });

  it('reports multi-recolor diagnostics in sorted path order regardless of source key order', () => {
    const firstAsset = requireNewItemFixture();

    expectEquivalentDiagnosticPaths(
      [
        {
          ...validPack,
          assets: [{
            ...firstAsset,
            recolor: {
              color_2: false,
              zulu: { material: 'hair', palettes: ['ulpc'] },
              color_1: 'bad-recolor',
            },
          }],
        },
        {
          ...validPack,
          assets: [{
            ...firstAsset,
            recolor: {
              color_1: 'bad-recolor',
              color_2: false,
              zulu: { material: 'hair', palettes: ['ulpc'] },
            },
          }],
        },
      ],
      [
        '$.assets[0].recolor.color_1',
        '$.assets[0].recolor.color_2',
        '$.assets[0].recolor.zulu',
      ],
    );
  });

  it.each([
    'sprites\\moon-braid\\foreground\\walk.png',
    '/sprites/moon-braid/foreground/walk.png',
    './sprites/moon-braid/foreground/walk.png',
    'sprites/../moon-braid/foreground/walk.png',
    'images/moon-braid/foreground/walk.png',
  ])('rejects unsafe source path %s', (source) => {
    const firstAsset = requireNewItemFixture();
    const firstLayer = firstAsset.layers[0];
    if (!firstLayer) {
      throw new Error('Expected the new-item fixture to define a first layer.');
    }

    const result = parseAssetPackSource({
      ...validPack,
      assets: [{
        ...firstAsset,
        layers: [{
          ...firstLayer,
          sprites: [{
            ...firstLayer.sprites[0]!,
            source,
          }],
        }],
      }],
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_pack_schema_invalid', severity: 'error' }],
    });
  });

  it('rejects duplicate local ids and duplicate semantic layer ids', () => {
    const firstAsset = requireNewItemFixture();
    const firstLayer = firstAsset.layers[0];
    if (!firstLayer) {
      throw new Error('Expected the new-item fixture to define a first layer.');
    }

    const duplicateLocalId = parseAssetPackSource({
      ...validPack,
      assets: [firstAsset, { ...firstAsset, displayName: 'Moon Braid Copy' }],
    });
    expect(duplicateLocalId).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_pack_id_invalid', severity: 'error' }],
    });

    const duplicateLayerId = parseAssetPackSource({
      ...validPack,
      assets: [{
        ...firstAsset,
        layers: [
          firstLayer,
          {
            ...firstLayer,
            zPos: 121,
          },
        ],
      }],
    });
    expect(duplicateLayerId).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_pack_schema_invalid', severity: 'error' }],
    });
  });

  it('rejects child body types that broaden their parent body coverage', () => {
    const firstAsset = requireNewItemFixture();
    const firstLayer = firstAsset.layers[0];
    if (!firstLayer) {
      throw new Error('Expected the new-item fixture to define a first layer.');
    }

    const result = parseAssetPackSource({
      ...validPack,
      assets: [{
        ...firstAsset,
        bodyTypes: ['male'],
        layers: [{
          ...firstLayer,
          bodyTypes: ['male'],
          sprites: [{
            ...firstLayer.sprites[0]!,
            bodyTypes: ['male', 'female'],
          }],
        }],
      }],
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_pack_schema_invalid', severity: 'error' }],
    });
  });

  it('uses pack plus local id for both catalog and selection identity', () => {
    expect(assetPackItemId('acme.fantasy-hair', 'moon-braid'))
      .toBe('acme.fantasy-hair--moon-braid');
  });

  it('normalizes inherited body types, credits, and deterministic content projection', () => {
    const parsed = parseAssetPackSource({
      ...validPack,
      acknowledgements: [ACKNOWLEDGEMENT],
      creditOverrides: {
        'sprites/moon-braid/foreground/climb.png': CREDIT_OVERRIDE,
        'sprites/moon-braid/background/walk.png': PACK_CREDITS,
      },
      assets: [{
        kind: 'new-item',
        localId: 'ordered-braid',
        displayName: 'Ordered Braid',
        typeName: 'hair',
        bodyTypes: ['teen', 'male', 'female'],
        animations: ['climb', 'walk'],
        variants: ['blue', 'amber'],
        layers: [
          {
            id: 'foreground',
            zPos: 120,
            sprites: [
              {
                animation: 'walk',
                source: 'sprites/ordered-braid/foreground/walk.png',
                bodyTypes: ['female'],
              },
            ],
          },
          {
            id: 'background',
            zPos: 80,
            bodyTypes: ['female', 'male'],
            sprites: [
              {
                animation: 'climb',
                source: 'sprites/ordered-braid/background/climb.png',
              },
            ],
          },
        ],
      }],
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error('Expected the normalized-pack fixture to parse.');
    }

    const normalized = normalizeAssetPack(parsed.source);
    expect(normalized.credits).toEqual(PACK_CREDITS);
    expect(normalized.creditOverrides.get('sprites/moon-braid/foreground/climb.png'))
      .toEqual(CREDIT_OVERRIDE);
    expect(normalized.acknowledgements).toEqual([ACKNOWLEDGEMENT]);

    const newItem = normalized.assets.find((asset) => asset.kind === 'new-item');
    expect(newItem).toBeDefined();
    if (!newItem || newItem.kind !== 'new-item') {
      throw new Error('Expected a normalized new-item asset.');
    }

    expect(newItem.itemId).toBe('acme.fantasy-hair--ordered-braid');
    expect(newItem.bodyTypes).toEqual(['male', 'female', 'teen']);
    expect(newItem.layers.map((layer) => layer.id)).toEqual(['background', 'foreground']);
    expect(newItem.layers[0]!.bodyTypes).toEqual(['male', 'female']);
    expect(newItem.layers[0]!.sprites[0]!.bodyTypes).toEqual(['male', 'female']);
    expect(newItem.layers[1]!.sprites[0]!.bodyTypes).toEqual(['female']);

    const projection = assetPackContentProjection(normalized) as Readonly<Record<string, unknown>>;
    expect(Object.keys(projection)).toEqual([
      'assets',
      'creditOverrides',
      'credits',
      'displayName',
      'id',
      'replacements',
      'schema',
      'version',
    ]);
    expect(projection).not.toHaveProperty('acknowledgements');

    const projectionOverrides = projection.creditOverrides as Readonly<Record<string, unknown>>;
    expect(Object.keys(projectionOverrides)).toEqual([
      'sprites/moon-braid/background/walk.png',
      'sprites/moon-braid/foreground/climb.png',
    ]);
  });
});
