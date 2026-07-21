import { describe, expect, it } from 'vitest';
import { createCatalog } from '../src/catalog.js';
import {
  standardAnimationGeometry,
} from '../src/asset-animation-audit.js';
import {
  assetPackContentProjection,
  normalizeAssetPack,
} from '../src/asset-pack-model.js';
import {
  ASSET_PACK_SCHEMA,
  type AssetPackAcknowledgement,
  type AssetPackSource,
} from '../src/asset-pack-schema.js';
import {
  type AssetPackBaseline,
  type AssetPackSourceInspection,
  validateAssetPack,
} from '../src/asset-pack-validation.js';
import { createPaletteCatalog } from '../src/palettes.js';

const PACK_CREDITS = {
  authors: ['Alice'],
  licenses: ['CC-BY-SA 4.0'],
  urls: ['https://example.com/alice'],
  notes: '',
} as const;

const palettes = createPaletteCatalog({
  'hair/meta_hair.json': { type: 'material', default: 'ulpc', base: 'black' },
  'hair/hair_ulpc.json': {
    black: ['#111111', '#222222'],
    orange: ['#cc5500', '#ee7700'],
  },
}).palettes;

const baselineCatalog = createCatalog({
  'hair/braid.json': {
    name: 'Braid',
    type_name: 'hair',
    animations: ['walk', 'climb'],
    variants: ['dark brown'],
    recolors: { material: 'hair', palettes: ['ulpc'] },
    credits: [],
    layer_1: { zPos: 50, male: 'hair/braid/', female: 'hair/braid/' },
  },
}).catalog;

const baseline: AssetPackBaseline = {
  catalog: baselineCatalog,
  definitionDigests: new Map([['braid', sha('a')]]),
  creditDigests: new Map([['braid', sha('b')]]),
};

function sha(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

function geometryBounds(animation: 'walk' | 'climb'): { width: number; height: number } {
  const geometry = standardAnimationGeometry(animation);
  const maxColumn = Math.max(
    ...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)),
  );

  return {
    width: (maxColumn + 1) * geometry.frameSize,
    height: geometry.rows.length * geometry.frameSize,
  };
}

function requiredCells(animation: 'walk' | 'climb'): readonly string[] {
  return standardAnimationGeometry(animation).rows.flatMap((row) =>
    row.cells.map((cell) => `${row.sourceRow}:${cell.sourceColumn}`),
  );
}

function allCells(animation: 'walk' | 'climb'): readonly string[] {
  const geometry = standardAnimationGeometry(animation);
  const maxColumn = Math.max(
    ...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)),
  );
  return geometry.rows.flatMap((row) =>
    Array.from({ length: maxColumn + 1 }, (_, column) => `${row.sourceRow}:${column}`),
  );
}

function newItemSource(overrides?: Partial<AssetPackSource>): AssetPackSource {
  return {
    schema: ASSET_PACK_SCHEMA,
    id: 'acme.wind-braid',
    version: '1.0.0',
    displayName: 'ACME Wind Braid',
    credits: PACK_CREDITS,
    assets: [{
      kind: 'new-item',
      localId: 'wind-braid',
      displayName: 'Wind Braid',
      typeName: 'hair',
      bodyTypes: ['male', 'female'],
      animations: ['walk', 'climb'],
      variants: ['blue'],
      recolor: { material: 'hair', palettes: ['ulpc'] },
      layers: [{
        id: 'foreground',
        zPos: 120,
        sprites: [
          {
            animation: 'walk',
            source: 'sprites/wind-braid/foreground/walk.png',
            variant: 'blue',
          },
          {
            animation: 'climb',
            source: 'sprites/wind-braid/foreground/climb.png',
            variant: 'blue',
          },
        ],
      }],
    }],
    ...overrides,
  };
}

function extendItemSource(
  overrides?: Partial<AssetPackSource>,
  acknowledgements?: readonly AssetPackAcknowledgement[],
): AssetPackSource {
  return {
    schema: ASSET_PACK_SCHEMA,
    id: 'acme.audit-braid',
    version: '1.0.0',
    displayName: 'ACME Audit Braid',
    credits: PACK_CREDITS,
    ...(acknowledgements ? { acknowledgements } : {}),
    assets: [{
      kind: 'extend-item',
      itemId: 'braid',
      baseDefinitionDigest: sha('a'),
      baseCreditDigest: sha('b'),
      addAnimations: [{
        animation: 'climb',
        layers: [{
          layer: 'layer_1',
          bodyTypes: ['female'],
          source: 'sprites/braid/climb-female.png',
          variant: 'dark brown',
          destination: {
            path: 'spritesheets/hair/braid/climb/dark_brown.png',
            evidence: 'audit-inferred',
            accepted: true,
          },
        }],
      }],
    }],
    ...overrides,
  };
}

function inspectionFor(
  sourcePath: string,
  animation: 'walk' | 'climb',
  overrides?: Partial<AssetPackSourceInspection>,
): AssetPackSourceInspection {
  const bounds = geometryBounds(animation);
  return {
    sourcePath,
    digest: sha('c'),
    regularFile: true,
    decoded: {
      width: bounds.width,
      height: bounds.height,
      nonTransparentCells: allCells(animation),
      paletteColors: ['#111111', '#222222'],
    },
    ...overrides,
  };
}

function validateSource(
  source: AssetPackSource,
  inspections: readonly AssetPackSourceInspection[],
  contentDigest = sha('d'),
) {
  return validateAssetPack({
    pack: normalizeAssetPack(source),
    baseline,
    palettes,
    inspections,
    contentDigest,
  });
}

function diagnosticPaths(result: ReturnType<typeof validateAssetPack>): string[] {
  return result.diagnostics.map((diagnostic) => {
    const path = diagnostic.details?.path;
    return typeof path === 'string' ? path : '<missing-path>';
  });
}

describe('asset-pack validation', () => {
  it('keeps an acknowledgement stable when only acknowledgements change', () => {
    const acknowledgement: AssetPackAcknowledgement = {
      code: 'asset_path_inferred',
      subject: {
        itemId: 'braid',
        animation: 'climb',
        layer: 'layer_1',
        bodyTypes: ['female'],
      },
      contentDigest: sha('d'),
      reason: 'Reviewed the inferred destination.',
    };

    const before = assetPackContentProjection(normalizeAssetPack(extendItemSource()));
    const after = assetPackContentProjection(normalizeAssetPack(extendItemSource(
      undefined,
      [acknowledgement],
    )));

    expect(after).toEqual(before);
  });

  it('exports standard walk and climb geometry for cropped validation', () => {
    expect(standardAnimationGeometry('walk')).toEqual(expect.objectContaining({
      frameSize: 64,
      rows: expect.arrayContaining([
        expect.objectContaining({
          sourceRow: 0,
          cells: [
            { sourceColumn: 1, logicalFrameIndices: [0] },
            { sourceColumn: 2, logicalFrameIndices: [1] },
            { sourceColumn: 3, logicalFrameIndices: [2] },
            { sourceColumn: 4, logicalFrameIndices: [3] },
            { sourceColumn: 5, logicalFrameIndices: [4] },
            { sourceColumn: 6, logicalFrameIndices: [5] },
            { sourceColumn: 7, logicalFrameIndices: [6] },
            { sourceColumn: 8, logicalFrameIndices: [7] },
          ],
        }),
      ]),
    }));

    expect(geometryBounds('walk')).toEqual({ width: 576, height: 256 });
    expect(geometryBounds('climb')).toEqual({ width: 384, height: 64 });
  });

  it('rejects unregistered new-item type, animation, material, and palette references', () => {
    const invalid = newItemSource({
      assets: [{
        kind: 'new-item',
        localId: 'wind-braid',
        displayName: 'Wind Braid',
        typeName: 'cape',
        bodyTypes: ['male', 'female'],
        animations: ['moonwalk'],
        variants: ['blue'],
        recolor: { material: 'cloth', palettes: ['missing'] },
        layers: [{
          id: 'foreground',
          zPos: 120,
          sprites: [{
            animation: 'moonwalk',
            source: 'sprites/wind-braid/foreground/moonwalk.png',
            variant: 'blue',
          }],
        }],
      }],
    });

    const result = validateSource(invalid, [
      inspectionFor('sprites/wind-braid/foreground/moonwalk.png', 'walk'),
    ]);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['asset_pack_schema_invalid']),
    );
    expect(diagnosticPaths(result)).toEqual(expect.arrayContaining([
      '$.assets[0].animations[0]',
      '$.assets[0].recolor.material',
      '$.assets[0].recolor.palettes[0]',
      '$.assets[0].typeName',
      '$.assets[0].layers[0].sprites[0].animation',
    ]));
  });

  it('rejects a new-item identity that already exists in the baseline catalog', () => {
    const collidingBaseline: AssetPackBaseline = {
      ...baseline,
      catalog: createCatalog({
        'hair/braid.json': baselineCatalog.byItemId.get('braid')!,
        'hair/acme.wind-braid--wind-braid.json': {
          name: 'Unmanaged Existing Item',
          type_name: 'hair',
          animations: ['walk'],
          credits: [],
          layer_1: { zPos: 70, male: 'hair/existing/', female: 'hair/existing/' },
        },
      }).catalog,
    };
    const source = newItemSource();
    const result = validateAssetPack({
      pack: normalizeAssetPack(source),
      baseline: collidingBaseline,
      palettes,
      inspections: [
        inspectionFor('sprites/wind-braid/foreground/walk.png', 'walk'),
        inspectionFor('sprites/wind-braid/foreground/climb.png', 'climb'),
      ],
      contentDigest: sha('d'),
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_path_conflict',
      severity: 'error',
      assetId: 'acme.wind-braid--wind-braid',
      details: expect.objectContaining({ path: '$.assets[0].localId' }),
    }));
  });

  it('rejects unregistered extension animation, body, and variant references', () => {
    const invalid = extendItemSource({
      assets: [{
        kind: 'extend-item',
        itemId: 'braid',
        baseDefinitionDigest: sha('a'),
        baseCreditDigest: sha('b'),
        addAnimations: [{
          animation: 'moonwalk',
          layers: [{
            layer: 'layer_1',
            bodyTypes: ['child'],
            source: 'sprites/braid/moonwalk-child.png',
            variant: 'blue',
            destination: {
              path: 'spritesheets/hair/braid/moonwalk/blue.png',
              evidence: 'artist-specified',
              accepted: true,
            },
          }],
        }],
      }],
    });

    const result = validateSource(invalid, [
      inspectionFor('sprites/braid/moonwalk-child.png', 'walk'),
    ]);

    expect(result.ok).toBe(false);
    expect(diagnosticPaths(result)).toEqual(expect.arrayContaining([
      '$.assets[0].addAnimations[0].animation',
      '$.assets[0].addAnimations[0].layers[0].bodyTypes[0]',
      '$.assets[0].addAnimations[0].layers[0].variant',
    ]));
  });

  it('rejects an extension destination whose filename does not match its animation and variant', () => {
    const invalid = extendItemSource({
      assets: [{
        kind: 'extend-item',
        itemId: 'braid',
        baseDefinitionDigest: sha('a'),
        baseCreditDigest: sha('b'),
        addAnimations: [{
          animation: 'climb',
          layers: [{
            layer: 'layer_1',
            bodyTypes: ['female'],
            source: 'sprites/braid/climb-female.png',
            variant: 'dark brown',
            destination: {
              path: 'spritesheets/hair/braid/climb/custom.png',
              evidence: 'artist-specified',
              accepted: true,
            },
          }],
        }],
      }],
    });

    const result = validateSource(invalid, [
      inspectionFor('sprites/braid/climb-female.png', 'climb'),
    ]);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'asset_pack_schema_invalid',
      severity: 'error',
      assetId: 'braid',
      destinationPath: 'spritesheets/hair/braid/climb/custom.png',
      details: {
        path: '$.assets[0].addAnimations[0].layers[0].destination.path',
      },
    }));
  });

  it('maps missing and decode-failed inspections to source diagnostics', () => {
    const result = validateSource(newItemSource(), [
      {
        sourcePath: 'sprites/wind-braid/foreground/walk.png',
        regularFile: false,
        error: 'missing',
      },
      {
        sourcePath: 'sprites/wind-braid/foreground/climb.png',
        regularFile: true,
        error: 'decode-failed',
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_source_missing', sourcePath: 'sprites/wind-braid/foreground/walk.png' }),
      expect.objectContaining({ code: 'asset_png_decode_failed', sourcePath: 'sprites/wind-braid/foreground/climb.png' }),
    ]));
  });

  it('rejects wrong dimensions and conflicting geometry reuse', () => {
    const wrongDimensions = validateSource(newItemSource(), [
      inspectionFor('sprites/wind-braid/foreground/walk.png', 'walk', {
        decoded: {
          width: 512,
          height: 256,
          nonTransparentCells: allCells('walk'),
          paletteColors: ['#111111'],
        },
      }),
      inspectionFor('sprites/wind-braid/foreground/climb.png', 'climb'),
    ]);

    expect(wrongDimensions.ok).toBe(false);
    expect(wrongDimensions.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'asset_geometry_mismatch',
        sourcePath: 'sprites/wind-braid/foreground/walk.png',
      }),
    );

    const reused = validateSource(newItemSource({
      assets: [{
        kind: 'new-item',
        localId: 'wind-braid',
        displayName: 'Wind Braid',
        typeName: 'hair',
        bodyTypes: ['male', 'female'],
        animations: ['walk', 'climb'],
        layers: [{
          id: 'foreground',
          zPos: 120,
          sprites: [
            { animation: 'walk', source: 'sprites/wind-braid/shared.png' },
            { animation: 'climb', source: 'sprites/wind-braid/shared.png' },
          ],
        }],
      }],
    }), [
      inspectionFor('sprites/wind-braid/shared.png', 'walk'),
    ]);

    expect(reused.ok).toBe(false);
    expect(reused.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'asset_geometry_mismatch',
        sourcePath: 'sprites/wind-braid/shared.png',
      }),
    );
  });

  it('treats blank required cells as errors and blank optional cells as warnings', () => {
    const missingRequired = validateSource(newItemSource({
      assets: [{
        kind: 'new-item',
        localId: 'wind-braid',
        displayName: 'Wind Braid',
        typeName: 'hair',
        bodyTypes: ['male', 'female'],
        animations: ['walk'],
        layers: [{
          id: 'foreground',
          zPos: 120,
          sprites: [{ animation: 'walk', source: 'sprites/wind-braid/foreground/walk.png' }],
        }],
      }],
    }), [
      inspectionFor('sprites/wind-braid/foreground/walk.png', 'walk', {
        decoded: {
          width: 576,
          height: 256,
          nonTransparentCells: allCells('walk').filter((cell) => cell !== '0:1'),
          paletteColors: ['#111111'],
        },
      }),
    ]);

    expect(missingRequired.ok).toBe(false);
    expect(missingRequired.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'asset_required_frame_blank',
        sourcePath: 'sprites/wind-braid/foreground/walk.png',
      }),
    );

    const optionalBlank = validateSource(newItemSource({
      assets: [{
        kind: 'new-item',
        localId: 'wind-braid',
        displayName: 'Wind Braid',
        typeName: 'hair',
        bodyTypes: ['male', 'female'],
        animations: ['walk'],
        layers: [{
          id: 'foreground',
          zPos: 120,
          sprites: [{ animation: 'walk', source: 'sprites/wind-braid/foreground/walk.png' }],
        }],
      }],
    }), [
      inspectionFor('sprites/wind-braid/foreground/walk.png', 'walk', {
        decoded: {
          width: 576,
          height: 256,
          nonTransparentCells: requiredCells('walk'),
          paletteColors: ['#111111'],
        },
      }),
    ]);

    expect(optionalBlank.ok).toBe(false);
    expect(optionalBlank.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'asset_optional_frame_blank',
        sourcePath: 'sprites/wind-braid/foreground/walk.png',
        severity: 'warning',
      }),
    );
    expect(optionalBlank.acknowledgementRecords).toContainEqual(
      expect.objectContaining({ code: 'asset_optional_frame_blank' }),
    );
  });

  it('emits partial body and animation coverage warnings', () => {
    const result = validateSource(newItemSource({
      assets: [{
        kind: 'new-item',
        localId: 'wind-braid',
        displayName: 'Wind Braid',
        typeName: 'hair',
        bodyTypes: ['male', 'female'],
        animations: ['walk', 'climb'],
        layers: [{
          id: 'foreground',
          zPos: 120,
          sprites: [{
            animation: 'walk',
            source: 'sprites/wind-braid/foreground/walk.png',
            bodyTypes: ['male'],
          }],
        }],
      }],
    }), [
      inspectionFor('sprites/wind-braid/foreground/walk.png', 'walk'),
    ]);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_partial_body_coverage', severity: 'warning' }),
      expect.objectContaining({ code: 'asset_partial_animation_coverage', severity: 'warning' }),
    ]));
  });

  it('accepts a matching inferred-path acknowledgement and invalidates it after a digest change', () => {
    const source = extendItemSource();
    const firstPass = validateSource(source, [
      inspectionFor('sprites/braid/climb-female.png', 'climb'),
    ]);

    expect(firstPass.ok).toBe(false);
    const acknowledgement = firstPass.acknowledgementRecords.find(
      (record) => record.code === 'asset_path_inferred',
    );
    expect(acknowledgement).toBeDefined();
    if (!acknowledgement) {
      throw new Error('Expected an inferred-path acknowledgement template.');
    }

    const accepted = validateSource(extendItemSource(undefined, [{
      ...acknowledgement,
      reason: 'Reviewed and accepted the inferred destination.',
    }]), [
      inspectionFor('sprites/braid/climb-female.png', 'climb'),
    ]);

    expect(accepted.ok).toBe(true);
    expect(accepted.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'asset_path_inferred', severity: 'warning' }),
    );

    const changed = validateSource(extendItemSource(undefined, [{
      ...acknowledgement,
      reason: 'Reviewed and accepted the inferred destination.',
    }]), [
      inspectionFor('sprites/braid/climb-female.png', 'climb'),
    ], sha('e'));

    expect(changed.ok).toBe(false);
    expect(changed.acknowledgementRecords).toContainEqual(
      expect.objectContaining({ code: 'asset_path_inferred', contentDigest: sha('e') }),
    );
  });
});
