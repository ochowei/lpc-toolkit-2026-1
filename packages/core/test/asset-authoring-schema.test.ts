import { describe, expect, it } from 'vitest';
import {
  ASSET_AUTHORING_PLAN_SCHEMA,
  parseAssetAuthoringPlan,
} from '../src/asset-authoring-schema.js';

const DIGEST = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const CONSUMER = {
  itemId: 'hair_messy',
  typeName: 'hair',
  layer: 'layer_1',
  bodyTypes: ['child'],
  variant: 'dark-brown',
  recolors: ['black', 'orange'],
} as const;

const GEOMETRY = {
  kind: 'standard',
  frameSize: 64,
  rows: [
    {
      sourceRow: 2,
      direction: 'down',
      cells: [
        { sourceColumn: 0, logicalFrameIndices: [0] },
        { sourceColumn: 1, logicalFrameIndices: [1, 3] },
      ],
    },
  ],
} as const;

const NEW_ITEM_PLAN = {
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
    layers: [
      { id: 'foreground', zPos: 120, bodyTypes: ['female', 'male'] },
    ],
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
  consent: {
    approved: true,
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
  },
  provider: {
    id: 'external-artist',
    tool: 'sprite-drawing-workbench',
    model: 'human-authored',
  },
  draftCredits: {
    authors: ['Bob', 'Alice'],
    licenses: ['CC-BY-SA 4.0'],
    urls: ['https://example.com/acme/fantasy-hair'],
    notes: 'Draft attribution supplied for review.',
  },
} as const;

const EXTEND_ITEM_PLAN = {
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
    bodyTypes: ['child'],
    animations: ['climb'],
    paths: ['spritesheets/hair/messy/child/climb.png'],
  },
  remediation: {
    reportDigest: DIGEST,
    selectedFinding: {
      category: 'blankFrames',
      path: 'spritesheets/hair/messy/child/climb.png',
      animation: 'climb',
      sourceAnimation: 'climb',
      sourceRow: 2,
      direction: 'down',
      frames: [{ sourceColumn: 1, logicalFrameIndices: [1, 3] }],
      consumers: [CONSUMER],
    },
    consumer: CONSUMER,
    pathConfidence: 'exact',
    geometry: GEOMETRY,
    sourceCells: [{
      sourceRow: 2,
      direction: 'down',
      sourceColumn: 1,
      logicalFrameIndices: [1, 3],
    }],
  },
} as const;

const ATTACH_PACK_PLAN = {
  schema: ASSET_AUTHORING_PLAN_SCHEMA,
  goal: 'attach-pack',
  pack: {
    id: 'acme.existing-pack',
    version: '2.3.0',
    displayName: 'ACME Existing Pack',
  },
  asset: { kind: 'attach-pack' },
  scope: {
    packId: 'acme.existing-pack',
    bodyTypes: [],
    animations: [],
    paths: ['asset-pack.json'],
  },
} as const;

describe('asset authoring plan schema', () => {
  it('accepts the strict schema identity and normalizes a new-item plan', () => {
    const result = parseAssetAuthoringPlan(NEW_ITEM_PLAN);

    expect(result).toEqual({
      ok: true,
      plan: {
        ...NEW_ITEM_PLAN,
        asset: {
          ...NEW_ITEM_PLAN.asset,
          bodyTypes: ['male', 'female'],
          animations: ['walk', 'idle'],
          layers: [{
            id: 'foreground',
            zPos: 120,
            bodyTypes: ['male', 'female'],
          }],
        },
        scope: {
          ...NEW_ITEM_PLAN.scope,
          bodyTypes: ['male', 'female'],
          animations: ['walk', 'idle'],
          paths: [
            'sprites/moon-braid/foreground/idle.png',
            'sprites/moon-braid/foreground/walk.png',
          ],
        },
        consent: {
          ...NEW_ITEM_PLAN.consent,
          scope: {
            ...NEW_ITEM_PLAN.consent.scope,
            bodyTypes: ['male', 'female'],
            animations: ['walk', 'idle'],
            paths: [
              'sprites/moon-braid/foreground/idle.png',
              'sprites/moon-braid/foreground/walk.png',
            ],
          },
        },
        draftCredits: {
          ...NEW_ITEM_PLAN.draftCredits,
          authors: ['Alice', 'Bob'],
        },
      },
    });
  });

  it.each([
    ['extend-item', EXTEND_ITEM_PLAN],
    ['attach-pack', ATTACH_PACK_PLAN],
  ] as const)('accepts the %s plan goal', (_goal, input) => {
    const result = parseAssetAuthoringPlan(input);

    expect(result).toMatchObject({ ok: true, plan: { goal: input.goal } });
  });

  it('retains complete audit/remediation evidence for an extension', () => {
    const result = parseAssetAuthoringPlan(EXTEND_ITEM_PLAN);

    expect(result).toMatchObject({
      ok: true,
      plan: {
        remediation: {
          reportDigest: DIGEST,
          selectedFinding: EXTEND_ITEM_PLAN.remediation.selectedFinding,
          consumer: CONSUMER,
          pathConfidence: 'exact',
          geometry: GEOMETRY,
          sourceCells: EXTEND_ITEM_PLAN.remediation.sourceCells,
        },
      },
    });
  });

  it('rejects unknown fields at every strict plan boundary', () => {
    const result = parseAssetAuthoringPlan({
      ...NEW_ITEM_PLAN,
      unexpected: true,
      asset: { ...NEW_ITEM_PLAN.asset, unexpected: true },
      scope: { ...NEW_ITEM_PLAN.scope, unexpected: true },
      consent: {
        ...NEW_ITEM_PLAN.consent,
        scope: { ...NEW_ITEM_PLAN.consent.scope, unexpected: true },
      },
      provider: { ...NEW_ITEM_PLAN.provider, unexpected: true },
      draftCredits: { ...NEW_ITEM_PLAN.draftCredits, unexpected: true },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected strict parsing to fail.');
    expect(result.diagnostics.map(({ details }) => details?.path)).toEqual([
      '$.asset.unexpected',
      '$.consent.scope.unexpected',
      '$.draftCredits.unexpected',
      '$.provider.unexpected',
      '$.scope.unexpected',
      '$.unexpected',
    ]);
  });

  it.each([
    { ...NEW_ITEM_PLAN, schema: 'lpc-toolkit.asset-authoring-plan.v2' },
    { ...NEW_ITEM_PLAN, goal: 'unknown-goal' },
    { ...NEW_ITEM_PLAN, asset: { ...NEW_ITEM_PLAN.asset, localId: '' } },
    { ...NEW_ITEM_PLAN, scope: { ...NEW_ITEM_PLAN.scope, assetId: 'other-item' } },
  ])('rejects invalid schema or required intent without a partial plan', (input) => {
    const result = parseAssetAuthoringPlan(input);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected parsing to fail.');
    expect(result).not.toHaveProperty('plan');
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('does not invent draft credits when they are omitted', () => {
    const input = { ...NEW_ITEM_PLAN };
    delete (input as { draftCredits?: unknown }).draftCredits;

    const result = parseAssetAuthoringPlan(input);

    expect(result).toMatchObject({ ok: true, plan: { goal: 'new-item' } });
    if (!result.ok) throw new Error('Expected the plan to parse.');
    expect(result.plan).not.toHaveProperty('draftCredits');
  });

  it('reports all missing required intent while returning no normalized plan', () => {
    const input = { ...NEW_ITEM_PLAN };
    delete (input as { pack?: unknown }).pack;
    delete (input as { asset?: unknown }).asset;
    delete (input as { scope?: unknown }).scope;

    const result = parseAssetAuthoringPlan(input);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected missing intent to fail.');
    expect(result).not.toHaveProperty('plan');
    expect(result.diagnostics.map(({ details }) => details?.path)).toEqual([
      '$.asset',
      '$.pack',
      '$.scope',
    ]);
  });

  it('requires remediation evidence for an extend-item plan', () => {
    const input = { ...EXTEND_ITEM_PLAN };
    delete (input as { remediation?: unknown }).remediation;

    const result = parseAssetAuthoringPlan(input);

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: 'asset_authoring_required_intent_missing',
        details: { path: '$.remediation' },
      })],
    });
    expect(result).not.toHaveProperty('plan');
  });
});
