import { describe, expect, it } from 'vitest';
import {
  authoringIntelligenceOperationDigestInput,
  createAuthoringIntelligenceOperationPlan,
  createAuthoringIntelligenceRequest,
  materializeAuthoringIntelligenceRecolor,
  parseAuthoringIntelligenceCatalogSnapshot,
  parseAuthoringIntelligenceOperationPlan,
  routeAuthoringIntelligence,
  validateAuthoringIntelligenceOperationPlan,
  validateSpriteDrawingContractV2,
  type Catalog,
  type ItemDefinition,
  type SpriteDrawingContractV2,
} from '../src/index.js';

const REQUEST_DIGEST = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CATALOG_DIGEST = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function catalogWith(item: ItemDefinition): Catalog {
  return {
    byItemId: new Map([[item.itemId ?? `${item.type_name}/${item.name}`, item]]),
    byTypeName: new Map([[item.type_name, [item]]]),
    typeNames: [item.type_name],
    aliases: new Map(),
  };
}

function validGeometryContract(): SpriteDrawingContractV2 {
  return {
    schema: 'lpc-toolkit.sprite-drawing-contract.v2',
    goal: 'new-item',
    pack: { id: 'acme.hair', version: '1.0.0' },
    assetId: 'hair/moon-braid',
    typeName: 'hair',
    transparency: { encoding: 'png', colorModel: 'rgba', background: 'transparent' },
    canvas: { width: 128, height: 64 },
    frame: { width: 64, height: 64, count: 2 },
    cells: [
      { id: 'cell-0', row: 0, frame: 0, x: 0, y: 0, width: 64, height: 64, policy: 'required-drawn' },
      { id: 'cell-1', row: 0, frame: 1, x: 64, y: 0, width: 64, height: 64, policy: 'required-drawn' },
    ],
    targets: [{
      id: 'target-walk',
      path: 'sprites/moon-braid/foreground/walk.png',
      animation: 'walk',
      bodyTypes: ['male'],
      layerId: 'foreground',
      cellIds: ['cell-0', 'cell-1'],
      inputDigests: [],
    }],
    layers: [{
      id: 'foreground',
      zPos: 120,
      targetIds: ['target-walk'],
      dependencies: [],
    }],
  };
}

describe('authoring intelligence routing', () => {
  it('normalizes bounded request text while keeping the digest input explicit', () => {
    const request = createAuthoringIntelligenceRequest({
      requestText: '  Use   hair   braid.  ',
      requestDigest: REQUEST_DIGEST,
      catalogSnapshotDigest: CATALOG_DIGEST,
    });

    expect(request.requestText).toBe('Use hair braid.');
    expect(request).toMatchObject({
      schema: 'lpc-toolkit.asset-authoring-intelligence-request.v1',
      requestDigest: REQUEST_DIGEST,
      catalogSnapshotDigest: CATALOG_DIGEST,
    });
  });

  it('routes an exact catalog request to existing composition without exposing request text', () => {
    const item: ItemDefinition = {
      itemId: 'hair/braid',
      name: 'braid',
      display_name: 'Moon Braid',
      type_name: 'hair',
      animations: ['walk'],
      credits: [],
    };
    const route = routeAuthoringIntelligence({
      request: createAuthoringIntelligenceRequest({
        requestText: 'Use the hair braid asset.',
        requestDigest: REQUEST_DIGEST,
        catalogSnapshotDigest: CATALOG_DIGEST,
      }),
      catalog: catalogWith(item),
    });

    expect(route.outcome).toBe('compose-existing');
    expect(route.operationKind).toBe('compose-existing');
    expect(route.candidates.map((candidate) => candidate.itemId)).toEqual(['hair/braid']);
    expect(route.refusal).toBeNull();
    expect(route).not.toHaveProperty('requestText');
  });

  it('returns a stable user-action route when two catalog candidates are equally plausible', () => {
    const first: ItemDefinition = {
      itemId: 'hair/braid-a',
      name: 'braid',
      type_name: 'hair',
      animations: ['walk'],
      credits: [],
    };
    const second: ItemDefinition = {
      itemId: 'hair/braid-b',
      name: 'braid',
      type_name: 'hair',
      animations: ['walk'],
      credits: [],
    };
    const route = routeAuthoringIntelligence({
      request: createAuthoringIntelligenceRequest({
        requestText: 'Use the hair braid.',
        requestDigest: REQUEST_DIGEST,
        catalogSnapshotDigest: CATALOG_DIGEST,
      }),
      catalog: {
        byItemId: new Map([
          ['hair/braid-b', second],
          ['hair/braid-a', first],
        ]),
        byTypeName: new Map([['hair', [second, first]]]),
        typeNames: ['hair'],
        aliases: new Map(),
      },
    });

    expect(route.outcome).toBe('needs-user-action');
    expect(route.operationKind).toBeNull();
    expect(route.candidates.map((candidate) => candidate.itemId)).toEqual([
      'hair/braid-a',
      'hair/braid-b',
    ]);
    expect(route.refusal).toEqual({
      code: 'asset_authoring_intelligence_request_ambiguous',
      message: 'The request does not identify one safe catalog route.',
      nextAction: 'review-route',
    });
    expect(route.nextActions).toEqual(['review-route']);
  });

  it('validates explicit v2 geometry and rejects overlapping cells', () => {
    const contract = validGeometryContract();

    expect(validateSpriteDrawingContractV2(contract)).toEqual([]);
    expect(validateSpriteDrawingContractV2({
      ...contract,
      cells: [
        contract.cells[0]!,
        { ...contract.cells[1]!, x: 32 },
      ],
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_authoring_intelligence_geometry_unsupported' }),
    ]));
  });

  it('creates a digest-bound recolor operation with canonical inputs', () => {
    const plan = createAuthoringIntelligenceOperationPlan({
      operationId: 'hair-moon-braid-recolor',
      operationKind: 'derive-recolor',
      inputAssetIdentities: ['hair/braid'],
      inputCandidateDigests: [REQUEST_DIGEST],
      contractDigests: [CATALOG_DIGEST],
      catalogSnapshotDigest: CATALOG_DIGEST,
      normalizedParameters: {
        kind: 'derive-recolor',
        material: 'hair',
        sourceRamp: ['#000000', '#ffffff'],
        targetRamp: ['#112233', '#ddeeff'],
      },
      outputTargetIdentities: ['hair/moon-braid'],
      operationDigest: REQUEST_DIGEST,
    });

    expect(validateAuthoringIntelligenceOperationPlan(plan)).toEqual([]);
    const digestInput = authoringIntelligenceOperationDigestInput(plan);
    expect(digestInput).not.toContain('operationDigest');
    expect(digestInput).not.toContain('requestText');
    expect(digestInput).toContain('hair/moon-braid');
  });

  it('routes an explicit variant hint to deterministic variant derivation', () => {
    const item: ItemDefinition = {
      itemId: 'hair/braid',
      name: 'braid',
      type_name: 'hair',
      animations: ['walk'],
      variants: ['long', 'short'],
      credits: [],
    };
    const route = routeAuthoringIntelligence({
      request: createAuthoringIntelligenceRequest({
        requestText: 'Make the long variant of hair braid.',
        requestDigest: REQUEST_DIGEST,
        catalogSnapshotDigest: CATALOG_DIGEST,
        explicitHints: { variant: 'long' },
      }),
      catalog: catalogWith(item),
    });

    expect(route.outcome).toBe('derive-variant');
    expect(route.operationKind).toBe('derive-variant');
    expect(route.refusal).toBeNull();
  });

  it('rejects a cyclic multi-layer operation before staging', () => {
    const plan = {
      schema: 'lpc-toolkit.asset-authoring-operation-plan.v1' as const,
      operationId: 'layered-hair',
      operationKind: 'multi-layer' as const,
      inputAssetIdentities: ['hair/base'],
      inputCandidateDigests: [REQUEST_DIGEST],
      contractDigests: [CATALOG_DIGEST],
      catalogSnapshotDigest: CATALOG_DIGEST,
      normalizedParameters: {
        kind: 'multi-layer' as const,
        layers: [
          {
            id: 'foreground',
            targetIdentity: 'hair/foreground',
            zPos: 120,
            contractDigest: CATALOG_DIGEST,
            inputDigest: REQUEST_DIGEST,
            dependencies: ['background'],
          },
          {
            id: 'background',
            targetIdentity: 'hair/background',
            zPos: 10,
            contractDigest: CATALOG_DIGEST,
            inputDigest: REQUEST_DIGEST,
            dependencies: ['foreground'],
          },
        ],
      },
      outputTargetIdentities: ['hair/background', 'hair/foreground'],
      operationDigest: REQUEST_DIGEST,
    };

    expect(validateAuthoringIntelligenceOperationPlan(plan)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_authoring_intelligence_layer_conflict' }),
    ]));
  });

  it('uses the existing Core recolor authority for deterministic RGBA operation bytes', () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 128]);
    const output = materializeAuthoringIntelligenceRecolor(pixels, {
      kind: 'derive-recolor',
      material: 'hair',
      sourceRamp: ['#000000', '#ffffff'],
      targetRamp: ['#112233', '#ddeeff'],
    });

    expect(Array.from(output)).toEqual([17, 34, 51, 255, 221, 238, 255, 128]);
    expect(Array.from(pixels)).toEqual([0, 0, 0, 255, 255, 255, 255, 128]);
  });

  it('parses only bounded catalog and operation records before a CLI can stage them', () => {
    const snapshot = parseAuthoringIntelligenceCatalogSnapshot({
      schema: 'lpc-toolkit.asset-authoring-intelligence-catalog-snapshot.v1',
      items: [{
        itemId: 'hair/braid',
        typeName: 'hair',
        name: 'braid',
        displayName: 'Braid',
        animations: ['walk'],
        variants: [],
        recolorMaterials: ['hair'],
        hasAttribution: true,
        licenses: ['CC-BY-SA 4.0'],
      }],
    });
    expect(snapshot.ok).toBe(true);

    const operation = createAuthoringIntelligenceOperationPlan({
      operationId: 'hair-braid-variant',
      operationKind: 'derive-variant',
      inputAssetIdentities: ['hair/braid'],
      inputCandidateDigests: [REQUEST_DIGEST],
      contractDigests: [CATALOG_DIGEST],
      catalogSnapshotDigest: CATALOG_DIGEST,
      normalizedParameters: {
        kind: 'derive-variant',
        sourceAssetIdentity: 'hair/braid',
        variant: 'long',
      },
      outputTargetIdentities: ['hair/braid-long'],
      operationDigest: REQUEST_DIGEST,
    });
    const parsed = parseAuthoringIntelligenceOperationPlan(JSON.parse(JSON.stringify(operation)) as unknown);
    expect(parsed).toMatchObject({ ok: true, value: { operationKind: 'derive-variant' } });
  });

  it('parses an explicit custom-geometry operation with its v2 contract', () => {
    const operation = createAuthoringIntelligenceOperationPlan({
      operationId: 'hair-moon-braid-geometry',
      operationKind: 'custom-geometry',
      inputAssetIdentities: ['hair/braid'],
      inputCandidateDigests: [REQUEST_DIGEST],
      contractDigests: [CATALOG_DIGEST],
      catalogSnapshotDigest: CATALOG_DIGEST,
      normalizedParameters: {
        kind: 'custom-geometry',
        contract: validGeometryContract(),
      },
      outputTargetIdentities: ['hair/moon-braid'],
      operationDigest: REQUEST_DIGEST,
    });

    const parsed = parseAuthoringIntelligenceOperationPlan(JSON.parse(JSON.stringify(operation)) as unknown);
    expect(parsed).toMatchObject({ ok: true, value: { operationKind: 'custom-geometry' } });
  });
});
