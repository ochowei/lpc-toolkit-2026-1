import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ASSET_AUTHORING_PLAN_SCHEMA,
  parseAssetAuthoringPlan,
  planSpriteDrawingContract,
  spriteDrawingContractDigestInput,
  spriteDrawingContractProjection,
  standardAnimationGeometry,
  type AssetAuthoringPlan,
  type SpriteDrawingBaselineReference,
  type SpriteDrawingCellPolicy,
  type SpriteDrawingContract,
  type SpriteDrawingTargetInput,
} from '../src/index.js';

const REPORT_DIGEST = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const BASELINE_DIGEST = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BASELINE_DIGEST_2 = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const NEW_ITEM_INPUT = {
  schema: ASSET_AUTHORING_PLAN_SCHEMA,
  goal: 'new-item',
  pack: {
    id: 'acme.fantasy-hair',
    version: '1.0.0',
    displayName: 'ACME Fantasy Hair',
  },
  asset: {
    kind: 'new-item',
    localId: 'moon-braid',
    displayName: 'Moon Braid',
    typeName: 'hair',
    bodyTypes: ['female', 'male'],
    animations: ['idle', 'walk'],
    layers: [{ id: 'foreground', zPos: 120, bodyTypes: ['female', 'male'] }],
  },
  scope: {
    packId: 'acme.fantasy-hair',
    assetId: 'moon-braid',
    bodyTypes: ['female', 'male'],
    animations: ['idle', 'walk'],
    paths: [
      'sprites/moon-braid/foreground/walk.png',
      'sprites/moon-braid/foreground/idle.png',
    ],
  },
  provider: {
    id: 'external-artist',
    tool: 'sprite-drawing-workbench',
    model: 'human-authored',
  },
} as const;

const EXTEND_ITEM_INPUT = {
  schema: ASSET_AUTHORING_PLAN_SCHEMA,
  goal: 'extend-item',
  pack: {
    id: 'acme.animation-fixes',
    version: '1.0.0',
    displayName: 'ACME Animation Fixes',
  },
  asset: {
    kind: 'extend-item',
    itemId: 'hair_messy',
    typeName: 'hair',
  },
  scope: {
    packId: 'acme.animation-fixes',
    assetId: 'hair_messy',
    bodyTypes: ['female'],
    animations: ['climb'],
    paths: ['spritesheets/hair/messy/climb.png'],
  },
  remediation: {
    reportDigest: REPORT_DIGEST,
    selectedFinding: {
      category: 'blankFrames',
      path: 'spritesheets/hair/messy/climb.png',
      animation: 'climb',
      sourceAnimation: 'climb',
      sourceRow: 0,
      direction: 'up',
      frames: [{ sourceColumn: 1, logicalFrameIndices: [1] }],
      consumers: [{
        itemId: 'hair_messy',
        typeName: 'hair',
        layer: 'layer_1',
        bodyTypes: ['female'],
        recolors: ['black'],
      }],
    },
    consumer: {
      itemId: 'hair_messy',
      typeName: 'hair',
      layer: 'layer_1',
      bodyTypes: ['female'],
      recolors: ['black'],
    },
    pathConfidence: 'exact',
    geometry: standardAnimationGeometry('climb'),
    sourceCells: [{
      sourceRow: 0,
      direction: 'up',
      sourceColumn: 1,
      logicalFrameIndices: [1],
    }],
  },
} as const;

function parsedPlan(input: unknown): AssetAuthoringPlan {
  const result = parseAssetAuthoringPlan(input);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.plan;
}

const NEW_PLAN = parsedPlan(NEW_ITEM_INPUT);
const EXTEND_PLAN = parsedPlan(EXTEND_ITEM_INPUT);

const NEW_CONSUMER = {
  itemId: 'acme.fantasy-hair--moon-braid',
  typeName: 'hair',
  layer: 'layer_1',
  bodyTypes: ['female', 'male'],
  recolors: [],
} as const;

function newTarget(
  animation: 'walk' | 'idle',
  overrides: Partial<SpriteDrawingTargetInput> = {},
): SpriteDrawingTargetInput {
  return {
    path: `spritesheets/packages/acme.fantasy-hair/moon-braid/foreground/male-female/${animation}.png`,
    source: {
      logicalPath: `sprites/moon-braid/foreground/${animation}.png`,
      digest: REPORT_DIGEST,
    },
    animation,
    sourceAnimation: animation,
    layer: { id: 'foreground', zPos: 120 },
    bodyTypes: ['female', 'male'],
    consumers: [NEW_CONSUMER],
    work: 'new-item',
    ...overrides,
  };
}

function extensionTarget(
  overrides: Partial<SpriteDrawingTargetInput> = {},
): SpriteDrawingTargetInput {
  return {
    path: 'spritesheets/hair/messy/climb.png',
    source: {
      logicalPath: 'sprites/hair-messy/climb.png',
      digest: REPORT_DIGEST,
    },
    animation: 'climb',
    sourceAnimation: 'climb',
    layer: { id: 'layer_1', zPos: 50 },
    bodyTypes: ['female'],
    consumers: [EXTEND_PLAN.remediation.consumer],
    work: 'blank-frame-repair',
    defaultCellPolicy: 'unchanged',
    baseline: baselineReference(),
    policyOverrides: [{
      sourceRow: 0,
      sourceColumn: 1,
      policy: 'required-drawn',
    }],
    ...overrides,
  };
}

function baselineReference(): SpriteDrawingBaselineReference {
  return {
    id: 'hair-messy-climb-baseline',
    digest: BASELINE_DIGEST,
    cells: Array.from({ length: 6 }, (_, sourceColumn) => (
      sourceColumn === 1
        ? undefined
        : { sourceRow: 0, sourceColumn, digest: `${BASELINE_DIGEST}:${sourceColumn}` }
    )).filter((cell): cell is NonNullable<typeof cell> => cell !== undefined),
  };
}

function digest(contract: SpriteDrawingContract): string {
  return createHash('sha256')
    .update(spriteDrawingContractDigestInput(contract))
    .digest('hex');
}

function cellAt(
  contract: SpriteDrawingContract,
  targetIndex: number,
  sourceRow: number,
  sourceColumn: number,
) {
  const target = contract.targets[targetIndex];
  if (!target) throw new Error(`Missing target ${targetIndex}.`);
  const row = target.geometry.rows.find((candidate) => candidate.sourceRow === sourceRow);
  if (!row) throw new Error(`Missing row ${sourceRow}.`);
  const cell = row.cells.find((candidate) => candidate.sourceColumn === sourceColumn);
  if (!cell) throw new Error(`Missing cell ${sourceRow}:${sourceColumn}.`);
  return cell;
}

describe('planSpriteDrawingContract', () => {
  it('creates stable IDs and complete walk/idle PNG geometry with direction and source mappings', () => {
    const contract = planSpriteDrawingContract({
      plan: NEW_PLAN,
      targets: [newTarget('walk'), newTarget('idle')],
    });

    expect(contract.targets.map((target) => target.animation)).toEqual(['idle', 'walk']);
    expect(contract.targets.map((target) => target.id)).toEqual([
      'acme.fantasy-hair/acme.fantasy-hair--moon-braid/foreground/male-female/idle/idle/default',
      'acme.fantasy-hair/acme.fantasy-hair--moon-braid/foreground/male-female/walk/walk/default',
    ]);

    const idle = contract.targets[0];
    const walk = contract.targets[1];
    expect(idle?.geometry).toMatchObject({
      kind: 'standard',
      frameWidth: 64,
      frameHeight: 64,
      canvasWidth: 128,
      canvasHeight: 256,
    });
    expect(walk?.geometry).toMatchObject({
      kind: 'standard',
      frameWidth: 64,
      frameHeight: 64,
      canvasWidth: 576,
      canvasHeight: 256,
    });
    expect(walk?.geometry.rows.map((row) => row.direction)).toEqual([
      'up', 'left', 'down', 'right',
    ]);
    expect(walk?.geometry.rows[0]?.cells).toHaveLength(9);
    expect(cellAt(contract, 1, 0, 0)).toMatchObject({
      logicalFrameIndices: [],
      policy: 'required-transparent',
    });
    expect(cellAt(contract, 1, 0, 1)).toMatchObject({
      logicalFrameIndices: [0],
      policy: 'required-drawn',
    });
    expect(cellAt(contract, 1, 0, 8)).toMatchObject({ logicalFrameIndices: [7] });
  });

  it('preserves layer, body, variant, consumer, and exact missing-file extension context', () => {
    const plan = planSpriteDrawingContract({
      plan: {
        ...EXTEND_PLAN,
        remediation: {
          ...EXTEND_PLAN.remediation,
          selectedFinding: {
            ...EXTEND_PLAN.remediation.selectedFinding,
            category: 'missingFiles',
          },
        },
      },
      targets: [extensionTarget({
        variant: 'dark brown',
        work: 'missing-file',
        pathConfidence: 'exact',
        defaultCellPolicy: 'required-drawn',
        baseline: undefined,
      })],
    });

    expect(plan.targets).toEqual([expect.objectContaining({
      path: 'spritesheets/hair/messy/climb.png',
      sourceAnimation: 'climb',
      layer: { id: 'layer_1', zPos: 50 },
      bodyTypes: ['female'],
      variant: 'dark brown',
      pathConfidence: 'exact',
      consumers: [expect.objectContaining({
        itemId: 'hair_messy',
        typeName: 'hair',
        layer: 'layer_1',
        bodyTypes: ['female'],
      })],
    })]);
    expect(plan.targets[0]?.geometry.canvasWidth).toBe(384);
    expect(plan.targets[0]?.geometry.canvasHeight).toBe(64);
    expect(plan.targets[0]?.geometry.rows[0]?.cells.every(({ policy }) => policy === 'required-drawn'))
      .toBe(true);
  });

  it('uses the registered custom source geometry without copying LPC layout constants', () => {
    const contract = planSpriteDrawingContract({
      plan: NEW_PLAN,
      targets: [newTarget('walk', {
        source: {
          logicalPath: 'sprites/moon-braid/foreground/walk-128.png',
          digest: REPORT_DIGEST,
        },
        sourceAnimation: 'walk_128',
      })],
    });

    expect(contract.targets[0]?.geometry).toMatchObject({
      kind: 'custom',
      frameSize: 128,
      frameWidth: 128,
      frameHeight: 128,
      canvasWidth: 1152,
      canvasHeight: 512,
    });
    expect(contract.targets[0]?.geometry.rows.map((row) => row.direction)).toEqual([
      'up', 'left', 'down', 'right',
    ]);
    expect(contract.targets[0]?.geometry.rows[0]?.cells.map(({ logicalFrameIndices }) =>
      logicalFrameIndices,
    )).toEqual([[0], [1], [2], [3], [4], [5], [6], [7], [8]]);
  });

  it('represents exact blank-frame repair with required cells and unchanged baseline digests', () => {
    const contract = planSpriteDrawingContract({
      plan: EXTEND_PLAN,
      targets: [extensionTarget()],
    });

    expect(contract.targets[0]?.references).toEqual([
      { id: 'animation-audit-report', digest: REPORT_DIGEST },
      { id: 'hair-messy-climb-baseline', digest: BASELINE_DIGEST },
    ]);
    expect(cellAt(contract, 0, 0, 1)).toEqual({
      sourceRow: 0,
      direction: 'up',
      sourceColumn: 1,
      logicalFrameIndices: [1],
      policy: 'required-drawn',
    });
    expect(cellAt(contract, 0, 0, 0)).toMatchObject({
      policy: 'unchanged',
      baselineDigest: `${BASELINE_DIGEST}:0`,
    });
    expect(cellAt(contract, 0, 0, 5)).toMatchObject({
      policy: 'unchanged',
      baselineDigest: `${BASELINE_DIGEST}:5`,
    });
  });

  it('supports all four cell policies without dropping complete physical cells', () => {
    const policies: readonly SpriteDrawingCellPolicy[] = [
      'required-drawn',
      'optional-transparent',
      'required-transparent',
      'unchanged',
    ];
    const contract = planSpriteDrawingContract({
      plan: NEW_PLAN,
      targets: [newTarget('idle', {
        policyOverrides: policies.map((policy, index) => ({
          sourceRow: Math.floor(index / 2),
          sourceColumn: index % 2,
          policy,
          ...(policy === 'unchanged' ? { baselineDigest: `${BASELINE_DIGEST}:idle` } : {}),
        })),
        baseline: {
          id: 'idle-baseline',
          digest: BASELINE_DIGEST,
          cells: [{ sourceRow: 0, sourceColumn: 1, digest: `${BASELINE_DIGEST}:idle` }],
        },
      })],
    });

    expect(new Set(contract.targets[0]?.geometry.rows.flatMap((row) =>
      row.cells.map(({ policy }) => policy),
    ))).toEqual(new Set(policies));
    expect(cellAt(contract, 0, 0, 0).policy).toBe('required-drawn');
    expect(cellAt(contract, 0, 0, 1).policy).toBe('optional-transparent');
    expect(cellAt(contract, 0, 1, 0).policy).toBe('required-transparent');
    expect(cellAt(contract, 0, 1, 1)).toMatchObject({
      policy: 'unchanged',
      baselineDigest: `${BASELINE_DIGEST}:idle`,
    });
  });

  it('changes semantic digest input for geometry, source, baseline, and reference changes', () => {
    const baseTarget = newTarget('walk', {
      references: [{ id: 'artist-reference', digest: REPORT_DIGEST }],
    });
    const base = planSpriteDrawingContract({ plan: NEW_PLAN, targets: [baseTarget] });
    const baseDigest = digest(base);

    const geometryChanged = planSpriteDrawingContract({
      plan: NEW_PLAN,
      targets: [newTarget('walk', { sourceAnimation: 'idle' })],
    });
    const sourceChanged = planSpriteDrawingContract({
      plan: NEW_PLAN,
      targets: [newTarget('walk', {
        source: { logicalPath: 'sprites/moon-braid/foreground/walk-v2.png', digest: REPORT_DIGEST },
      })],
    });
    const referenceChanged = planSpriteDrawingContract({
      plan: NEW_PLAN,
      targets: [newTarget('walk', {
        references: [{ id: 'artist-reference', digest: BASELINE_DIGEST_2 }],
      })],
    });
    const baselineChanged = planSpriteDrawingContract({
      plan: EXTEND_PLAN,
      targets: [extensionTarget({
        baseline: { ...baselineReference(), digest: BASELINE_DIGEST_2 },
      })],
    });

    expect(digest(geometryChanged)).not.toBe(baseDigest);
    expect(digest(sourceChanged)).not.toBe(baseDigest);
    expect(digest(referenceChanged)).not.toBe(baseDigest);
    expect(digest(baselineChanged)).not.toBe(baseDigest);
  });

  it('canonicalizes JSON property ordering and excludes provider/artifact runtime concerns', () => {
    const contract = planSpriteDrawingContract({
      plan: NEW_PLAN,
      targets: [newTarget('walk')],
    });
    const target = contract.targets[0];
    if (!target) throw new Error('Expected one target.');

    const reordered: SpriteDrawingContract = {
      targets: [{
        consumers: target.consumers,
        references: target.references,
        geometry: target.geometry,
        source: target.source,
        cells: target.cells,
        pathConfidence: target.pathConfidence,
        variant: target.variant,
        bodyTypes: target.bodyTypes,
        layer: target.layer,
        sourceAnimation: target.sourceAnimation,
        animation: target.animation,
        path: target.path,
        id: target.id,
      }],
      transparency: contract.transparency,
      assetId: contract.assetId,
      typeName: contract.typeName,
      pack: contract.pack,
      goal: contract.goal,
      schema: contract.schema,
    };

    expect(spriteDrawingContractDigestInput(reordered)).toBe(
      spriteDrawingContractDigestInput(contract),
    );
    expect(spriteDrawingContractProjection(contract)).not.toHaveProperty('provider');
    expect(spriteDrawingContractDigestInput(contract)).not.toContain('external-artist');
    expect(spriteDrawingContractDigestInput(contract)).not.toContain('/tmp/');
  });
});
