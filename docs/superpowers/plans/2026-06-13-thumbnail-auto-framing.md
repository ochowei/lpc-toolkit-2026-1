# Thumbnail Auto-Framing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make small asset-selection thumbnails easier to identify by applying a generated, type-level scale while centering each rendered item from its runtime alpha bounds.

**Architecture:** A browser-safe utility owns alpha-bound scanning and framing geometry. The existing audit aggregates successful rows into a deterministic type-scale policy, constrained by the largest successful case at the smallest supported thumbnail size. `useItemThumbnail` consumes that policy without changing composition, character previews, exports, assets, attribution, or `packages/core/`.

**Tech Stack:** TypeScript strict mode, React 18 hooks, Canvas 2D, Vitest, `@napi-rs/canvas` for Node-side image tests, pnpm workspaces.

---

## Constraints

- Do not modify `upstream/`.
- Do not add dependencies.
- Run project commands with the `rtk` prefix.
- Do not add `any`; existing `any` usage is outside this feature's scope.
- Keep all runtime browser behavior in `packages/web/`.
- Auto-framing affects asset-selection thumbnails only.
- After each task, update its checkboxes and append an implementation note,
  implementation commit hash, and verification result as required by
  `AGENTS.md`. Commit that progress update separately so the recorded
  implementation hash remains accurate.

## File Map

- Create: `packages/web/src/lib/thumbnail-framing.ts`
  - Browser-safe alpha-bound scanning, frame-centering geometry, and constants.
- Create: `packages/web/src/generated/thumbnail-framing-policy.ts`
  - Deterministic generated type scales and policy version.
- Create: `packages/web/scripts/thumbnail-bounds-overrides.ts`
  - Explicit, reviewed bounds overrides for confirmed source-data anomalies.
- Modify: `packages/web/scripts/thumbnail-visible-bounds-audit-lib.ts`
  - Reuse shared bounds logic and aggregate successful rows into type scales.
- Modify: `packages/web/scripts/audit-thumbnail-visible-bounds.ts`
  - Generate the committed policy alongside diagnostic reports.
- Modify: `packages/web/src/hooks/use-item-thumbnail.ts`
  - Extract the representative frame, scan runtime bounds, and apply policy.
- Modify: `packages/web/src/hooks/thumbnail-cache.ts`
  - Include the generated policy version in cache keys.
- Create: `packages/web/test/thumbnail-framing.test.ts`
  - Shared bounds and geometry unit tests.
- Modify: `packages/web/test/thumbnail-visible-bounds-audit.test.ts`
  - Aggregation, safe-limit, override, and serialization tests.
- Modify: `packages/web/test/thumbnail-cache.test.ts`
  - Policy-version cache invalidation test.
- Modify: `packages/web/test/thumbnail-frame-rect.test.ts`
  - Runtime draw-plan and full-frame fallback tests.

### Task 1: Extract Browser-Safe Bounds And Geometry

**Files:**
- Create: `packages/web/src/lib/thumbnail-framing.ts`
- Create: `packages/web/test/thumbnail-framing.test.ts`
- Modify: `packages/web/scripts/thumbnail-visible-bounds-audit-lib.ts`
- Modify: `packages/web/test/thumbnail-visible-bounds-audit.test.ts`

- [x] **Step 1: Write failing tests for alpha bounds and centered draw geometry**

Create `packages/web/test/thumbnail-framing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  computeThumbnailDrawRect,
  findAlphaBounds,
} from '../src/lib/thumbnail-framing';

function rgba(
  width: number,
  height: number,
  visible: readonly (readonly [number, number])[],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of visible) {
    data[(y * width + x) * 4 + 3] = 255;
  }
  return data;
}

describe('findAlphaBounds', () => {
  it('returns null for a transparent frame', () => {
    expect(findAlphaBounds(rgba(4, 4, []), 4, 4)).toBeNull();
  });

  it('includes disconnected alpha-positive pixels', () => {
    expect(findAlphaBounds(rgba(4, 4, [[0, 1], [3, 2]]), 4, 4)).toEqual({
      x: 0,
      y: 1,
      width: 4,
      height: 2,
    });
  });
});

describe('computeThumbnailDrawRect', () => {
  it('centers the visible bounds while preserving the type scale', () => {
    expect(computeThumbnailDrawRect(
      { x: 24, y: 28, width: 16, height: 8 },
      64,
      24,
      2,
    )).toEqual({
      dx: -12,
      dy: -12,
      dWidth: 48,
      dHeight: 48,
    });
  });
});
```

- [x] **Step 2: Run the new test and verify it fails**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- thumbnail-framing.test.ts
```

Expected: FAIL because `../src/lib/thumbnail-framing` does not exist.

- [x] **Step 3: Implement the shared strict TypeScript utility**

Create `packages/web/src/lib/thumbnail-framing.ts`:

```ts
export const MIN_THUMBNAIL_SIZE = 20;
export const THUMBNAIL_MARGIN = 2;
export const MIN_AUTO_FRAME_SCALE = 1.5;
export const MAX_AUTO_FRAME_SCALE = 4;

export interface AlphaBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ThumbnailDrawRect {
  readonly dx: number;
  readonly dy: number;
  readonly dWidth: number;
  readonly dHeight: number;
}

export function findAlphaBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): AlphaBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return maxX < 0
    ? null
    : {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      };
}

export function computeThumbnailDrawRect(
  bounds: AlphaBounds,
  frameSize: number,
  outputSize: number,
  scale: number,
): ThumbnailDrawRect {
  const destinationFrameSize = outputSize * scale;
  const sourceToDestination = destinationFrameSize / frameSize;
  const boundsCenterX = (bounds.x + bounds.width / 2) * sourceToDestination;
  const boundsCenterY = (bounds.y + bounds.height / 2) * sourceToDestination;

  return {
    dx: outputSize / 2 - boundsCenterX,
    dy: outputSize / 2 - boundsCenterY,
    dWidth: destinationFrameSize,
    dHeight: destinationFrameSize,
  };
}
```

Remove the local `AlphaBounds` interface and `findAlphaBounds` implementation
from `packages/web/scripts/thumbnail-visible-bounds-audit-lib.ts`, then import
them:

```ts
import {
  findAlphaBounds,
  type AlphaBounds,
} from '../src/lib/thumbnail-framing';

export type { AlphaBounds } from '../src/lib/thumbnail-framing';
```

Remove the duplicated `findAlphaBounds` tests and local `rgba` helper from
`packages/web/test/thumbnail-visible-bounds-audit.test.ts`; the new focused
test owns that behavior.

- [x] **Step 4: Run focused tests and typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- thumbnail-framing.test.ts thumbnail-visible-bounds-audit.test.ts
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: both commands PASS.

- [x] **Step 5: Commit the shared utility**

```bash
rtk git add packages/web/src/lib/thumbnail-framing.ts packages/web/test/thumbnail-framing.test.ts packages/web/scripts/thumbnail-visible-bounds-audit-lib.ts packages/web/test/thumbnail-visible-bounds-audit.test.ts
rtk git commit -m "refactor(web): share thumbnail bounds geometry"
```

- [x] **Step 6: Record task completion in this plan**

**Implementation note:** Shared alpha-bound scanning and draw geometry now serve both audit and browser code.
**Commit:** 54cba27
**Verification:** focused thumbnail tests (3 pass) and audit tests (7 pass) and web typecheck PASS

### Task 2: Generate Safe Type-Level Scale Policy

**Files:**
- Create: `packages/web/scripts/thumbnail-bounds-overrides.ts`
- Modify: `packages/web/scripts/thumbnail-visible-bounds-audit-lib.ts`
- Modify: `packages/web/test/thumbnail-visible-bounds-audit.test.ts`

- [x] **Step 1: Write failing aggregation and serialization tests**

Add imports:

```ts
import {
  applyThumbnailBoundsOverrides,
  deriveThumbnailTypeScales,
  serializeThumbnailFramingPolicy,
  type ThumbnailBoundsOverrides,
} from '../scripts/thumbnail-visible-bounds-audit-lib';
```

Add tests using complete `ThumbnailAuditRow` values:

```ts
describe('thumbnail framing policy generation', () => {
  const okRow = (
    typeName: string,
    additionalScaleOverCurrent: number,
    width: number,
    height: number,
  ): ThumbnailAuditRow => ({
    itemId: `${typeName}_${width}_${height}`,
    typeName,
    itemName: typeName,
    bodyType: 'male',
    animation: 'walk',
    direction: 'down',
    frameIndex: 0,
    frameSize: 64,
    status: 'ok',
    bounds: { x: 0, y: 0, width, height },
    metrics: {
      widthRatio: width / 64,
      heightRatio: height / 64,
      visibleWidthAt24: width * 24 / 64,
      visibleHeightAt24: height * 24 / 64,
      fitScalePxPerSourcePixel: Math.min(20 / width, 20 / height),
      additionalScaleOverCurrent,
    },
    missingPaths: [],
  });

  it('uses the median target and omits scales below 1.5', () => {
    expect(deriveThumbnailTypeScales([
      okRow('ring', 2, 8, 8),
      okRow('ring', 3, 8, 8),
      okRow('ring', 4, 8, 8),
      okRow('body', 1.2, 40, 40),
    ])).toEqual({ ring: 3 });
  });

  it('caps at 4 and at the largest-case 20px safe multiplier', () => {
    expect(deriveThumbnailTypeScales([
      okRow('charm', 8, 8, 8),
      okRow('charm', 8, 32, 16),
    ])).toEqual({ charm: 1.6 });
  });

  it('ignores empty and error rows when deriving scale', () => {
    const failed: ThumbnailAuditRow[] = [
      {
        itemId: 'ring_empty',
        typeName: 'ring',
        itemName: 'Empty',
        bodyType: 'male',
        status: 'empty',
      },
      {
        itemId: 'ring_error',
        typeName: 'ring',
        itemName: 'Error',
        bodyType: 'female',
        status: 'error',
        errorMessage: 'missing',
      },
    ];
    expect(deriveThumbnailTypeScales([
      okRow('ring', 3, 8, 8),
      ...failed,
    ])).toEqual({ ring: 3 });
  });

  it('applies only explicit case-keyed bounds overrides', () => {
    const rows = [okRow('ring', 3, 8, 8)];
    const overrides: ThumbnailBoundsOverrides = {
      'ring_8_8|male|_': { x: 1, y: 1, width: 6, height: 6 },
    };
    expect(applyThumbnailBoundsOverrides(rows, overrides)[0]?.bounds)
      .toEqual({ x: 1, y: 1, width: 6, height: 6 });
  });

  it('serializes sorted deterministic TypeScript', () => {
    expect(serializeThumbnailFramingPolicy({ ring: 3, charm: 2 }))
      .toContain(`export const THUMBNAIL_TYPE_SCALES = {\n  "charm": 2,\n  "ring": 3,\n} as const;`);
  });
});
```

- [x] **Step 2: Run the audit unit test and verify it fails**

```bash
rtk pnpm --filter @lpc-toolkit/web test -- thumbnail-visible-bounds-audit.test.ts
```

Expected: FAIL because the policy functions and override type do not exist.

- [x] **Step 3: Implement pure aggregation and serialization**

Add to `thumbnail-visible-bounds-audit-lib.ts`:

```ts
import {
  MAX_AUTO_FRAME_SCALE,
  MIN_AUTO_FRAME_SCALE,
  MIN_THUMBNAIL_SIZE,
  THUMBNAIL_MARGIN,
  type AlphaBounds,
} from '../src/lib/thumbnail-framing';

export type ThumbnailBoundsOverrides = Readonly<Record<string, AlphaBounds>>;

function auditCaseKey(row: ThumbnailAuditRow): string {
  return `${row.itemId}|${row.bodyType}|${row.variant ?? '_'}`;
}

export function applyThumbnailBoundsOverrides(
  rows: readonly ThumbnailAuditRow[],
  overrides: ThumbnailBoundsOverrides,
): readonly ThumbnailAuditRow[] {
  return rows.map((row) => {
    const bounds = overrides[auditCaseKey(row)];
    return bounds && row.status === 'ok' && row.frameSize
      ? {
          ...row,
          bounds,
          metrics: deriveThumbnailMetrics(bounds, row.frameSize),
        }
      : row;
  });
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function roundScale(value: number): number {
  return Number(value.toFixed(6));
}

export function deriveThumbnailTypeScales(
  rows: readonly ThumbnailAuditRow[],
): Readonly<Record<string, number>> {
  const byType = new Map<string, ThumbnailAuditRow[]>();
  for (const row of rows) {
    if (row.status !== 'ok' || !row.bounds || !row.metrics || !row.frameSize) continue;
    const group = byType.get(row.typeName) ?? [];
    group.push(row);
    byType.set(row.typeName, group);
  }

  const result: Record<string, number> = {};
  for (const typeName of [...byType.keys()].sort()) {
    const group = byType.get(typeName) ?? [];
    const targetScale = median(
      group.map((row) => row.metrics?.additionalScaleOverCurrent ?? 0),
    );
    const innerSize = MIN_THUMBNAIL_SIZE - THUMBNAIL_MARGIN * 2;
    const safeScale = Math.min(...group.map((row) => {
      const bounds = row.bounds!;
      const frameSize = row.frameSize!;
      return Math.min(
        innerSize * frameSize / (MIN_THUMBNAIL_SIZE * bounds.width),
        innerSize * frameSize / (MIN_THUMBNAIL_SIZE * bounds.height),
      );
    }));
    const scale = roundScale(Math.min(targetScale, safeScale, MAX_AUTO_FRAME_SCALE));
    if (scale >= MIN_AUTO_FRAME_SCALE) result[typeName] = scale;
  }
  return result;
}

export function serializeThumbnailFramingPolicy(
  scales: Readonly<Record<string, number>>,
): string {
  const entries = Object.entries(scales).sort(([a], [b]) => a.localeCompare(b));
  const body = entries.map(([typeName, scale]) => `  ${JSON.stringify(typeName)}: ${scale},`).join('\n');
  const version = `v1:${entries.map(([typeName, scale]) => `${typeName}=${scale}`).join(',')}`;
  return [
    '// AUTO-GENERATED by scripts/audit-thumbnail-visible-bounds.ts.',
    '// Do not edit by hand. Regenerate with pnpm audit:thumbnail-bounds.',
    '',
    `export const THUMBNAIL_FRAMING_POLICY_VERSION = ${JSON.stringify(version)};`,
    '',
    'export const THUMBNAIL_TYPE_SCALES = {',
    body,
    '} as const;',
    '',
  ].join('\n');
}
```

Create `packages/web/scripts/thumbnail-bounds-overrides.ts`:

```ts
import type { ThumbnailBoundsOverrides } from './thumbnail-visible-bounds-audit-lib';

/**
 * Confirmed source-data anomalies only. Keys are itemId|bodyType|variant.
 * The default policy includes every alpha-positive pixel.
 */
export const THUMBNAIL_BOUNDS_OVERRIDES: ThumbnailBoundsOverrides = {};
```

- [x] **Step 4: Run focused tests and typecheck**

```bash
rtk pnpm --filter @lpc-toolkit/web test -- thumbnail-visible-bounds-audit.test.ts thumbnail-framing.test.ts
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [x] **Step 5: Commit policy derivation**

```bash
rtk git add packages/web/scripts/thumbnail-bounds-overrides.ts packages/web/scripts/thumbnail-visible-bounds-audit-lib.ts packages/web/test/thumbnail-visible-bounds-audit.test.ts
rtk git commit -m "feat(web): derive thumbnail framing policy"
```

- [x] **Step 6: Record task completion in this plan**

**Implementation note:** Successful audit rows now produce deterministic type-level scales constrained by median demand, the smallest-thumbnail margin, and the maximum scale; explicit case overrides recompute metrics.
**Commit:** ae4d45199
**Verification:** focused thumbnail tests (15 pass) and web typecheck PASS

### Task 3: Generate And Commit The Real Policy

**Files:**
- Create: `packages/web/src/generated/thumbnail-framing-policy.ts`
- Modify: `packages/web/scripts/audit-thumbnail-visible-bounds.ts`
- Modify: `packages/web/test/thumbnail-visible-bounds-audit.test.ts`

- [x] **Step 1: Write deterministic generation contract tests**

Add a test that writes the serializer result twice and compares exact strings:

```ts
it('produces byte-identical policy output for identical rows', () => {
  const scales = deriveThumbnailTypeScales([
    okRow('ring', 3, 8, 8),
    okRow('charm', 2, 10, 10),
  ]);
  expect(serializeThumbnailFramingPolicy(scales))
    .toBe(serializeThumbnailFramingPolicy(scales));
});
```

Also assert the header names exactly match the runtime imports:

```ts
const output = serializeThumbnailFramingPolicy({ ring: 3 });
expect(output).toContain('THUMBNAIL_FRAMING_POLICY_VERSION');
expect(output).toContain('THUMBNAIL_TYPE_SCALES');
```

- [x] **Step 2: Run the focused test**

```bash
rtk pnpm --filter @lpc-toolkit/web test -- thumbnail-visible-bounds-audit.test.ts
```

Expected: PASS for the pure serializer baseline. This establishes the output
contract before wiring filesystem generation.

- [x] **Step 3: Wire the audit command to generate the policy**

In `audit-thumbnail-visible-bounds.ts`, add:

```ts
import {
  applyThumbnailBoundsOverrides,
  deriveThumbnailTypeScales,
  serializeThumbnailFramingPolicy,
} from './thumbnail-visible-bounds-audit-lib';
import { THUMBNAIL_BOUNDS_OVERRIDES } from './thumbnail-bounds-overrides';

const policyOutputPath = path.join(
  repoRoot,
  'packages/web/src/generated/thumbnail-framing-policy.ts',
);
```

After collecting rows:

```ts
const policyRows = applyThumbnailBoundsOverrides(
  rows,
  THUMBNAIL_BOUNDS_OVERRIDES,
);
const policyContent = serializeThumbnailFramingPolicy(
  deriveThumbnailTypeScales(policyRows),
);

mkdirSync(path.dirname(policyOutputPath), { recursive: true });
writeFileSync(policyOutputPath, policyContent, 'utf8');
```

Keep CSV and Markdown output based on the original audit rows so diagnostic
reports remain factual. Log the generated policy path separately.

- [x] **Step 4: Run the full audit to create the policy**

```bash
rtk pnpm --filter @lpc-toolkit/web audit:thumbnail-bounds
```

Expected:

- audit completes;
- reports remain under `packages/web/.audit-output/thumbnail-visible-bounds/`;
- `packages/web/src/generated/thumbnail-framing-policy.ts` exists;
- entries are sorted by type name;
- no scale is below `1.5` or above `4`.

- [x] **Step 5: Verify regeneration is deterministic**

```bash
rtk cp packages/web/src/generated/thumbnail-framing-policy.ts /tmp/thumbnail-framing-policy.ts
rtk pnpm --filter @lpc-toolkit/web audit:thumbnail-bounds
rtk diff -u /tmp/thumbnail-framing-policy.ts packages/web/src/generated/thumbnail-framing-policy.ts
```

Expected: `diff` exits successfully with no output.

- [x] **Step 6: Run tests and typecheck**

```bash
rtk pnpm --filter @lpc-toolkit/web test -- thumbnail-visible-bounds-audit.test.ts
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [x] **Step 7: Commit generator wiring and generated policy**

```bash
rtk git add packages/web/scripts/audit-thumbnail-visible-bounds.ts packages/web/test/thumbnail-visible-bounds-audit.test.ts packages/web/src/generated/thumbnail-framing-policy.ts
rtk git commit -m "feat(web): generate thumbnail type scales"
```

- [x] **Step 8: Record task completion in this plan**

Append the Task 3 implementation note, implementation commit hash, audit
summary, deterministic diff result, and PASS verification. Commit the plan-only
progress update.

**Implementation note:** The audit now writes a committed framing policy from override-adjusted rows while preserving factual CSV and Markdown reports from the original rows. The full audit processed 29,995 cases (29,883 ok, 5 empty, 107 error) and generated 93 sorted type scales ranging from 1.505882 to 4.
**Commit:** 9bb282885
**Verification:** policy regeneration diff PASS (byte-identical); focused audit tests (14 pass); web typecheck PASS

### Task 4: Version Thumbnail Cache Entries

**Files:**
- Modify: `packages/web/src/hooks/thumbnail-cache.ts`
- Modify: `packages/web/test/thumbnail-cache.test.ts`

- [x] **Step 1: Write a failing cache-version test**

Add:

```ts
import { THUMBNAIL_FRAMING_POLICY_VERSION } from '../src/generated/thumbnail-framing-policy';

it('includes the framing policy version', () => {
  const key = makeCacheKey({
    bodyType: 'male',
    typeName: 'ring',
    name: 'Stud Ring',
    size: 24,
  });
  expect(key).toContain(THUMBNAIL_FRAMING_POLICY_VERSION);
});
```

- [x] **Step 2: Run the cache test and verify it fails**

```bash
rtk pnpm --filter @lpc-toolkit/web test -- thumbnail-cache.test.ts
```

Expected: FAIL because the cache key does not contain the policy version.

- [x] **Step 3: Add the generated version to cache keys**

In `thumbnail-cache.ts`:

```ts
import { THUMBNAIL_FRAMING_POLICY_VERSION } from '../generated/thumbnail-framing-policy';
```

Append `THUMBNAIL_FRAMING_POLICY_VERSION` to the array returned by
`makeCacheKey`.

- [x] **Step 4: Run cache tests and typecheck**

```bash
rtk pnpm --filter @lpc-toolkit/web test -- thumbnail-cache.test.ts
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [x] **Step 5: Commit cache invalidation**

```bash
rtk git add packages/web/src/hooks/thumbnail-cache.ts packages/web/test/thumbnail-cache.test.ts
rtk git commit -m "fix(web): version thumbnail cache policy"
```

- [x] **Step 6: Record task completion in this plan**

Append the Task 4 implementation note, implementation commit hash, and PASS
verification. Commit the plan-only progress update.

**Implementation note:** Thumbnail cache keys now include the generated framing policy version so regenerated type scales invalidate stale in-memory canvases.
**Commit:** 476501436
**Verification:** cache-version test verified RED before implementation; focused cache tests (7 pass) and web typecheck PASS

### Task 5: Apply Runtime Bounds And Type Scale In The Hook

**Files:**
- Modify: `packages/web/src/hooks/use-item-thumbnail.ts`
- Modify: `packages/web/src/lib/thumbnail-framing.ts`
- Modify: `packages/web/test/thumbnail-framing.test.ts`
- Modify: `packages/web/test/thumbnail-frame-rect.test.ts`

- [x] **Step 1: Write failing draw-plan tests for configured and fallback cases**

Add to `thumbnail-framing.ts`'s test imports:

```ts
import { createThumbnailDrawPlan } from '../src/lib/thumbnail-framing';
```

Add:

```ts
describe('createThumbnailDrawPlan', () => {
  it('uses runtime bounds and the configured type scale', () => {
    expect(createThumbnailDrawPlan({
      bounds: { x: 24, y: 28, width: 16, height: 8 },
      frameSize: 64,
      outputSize: 24,
      scale: 2,
    })).toEqual({
      dx: -12,
      dy: -12,
      dWidth: 48,
      dHeight: 48,
    });
  });

  it('falls back to full-frame drawing without usable bounds', () => {
    expect(createThumbnailDrawPlan({
      bounds: null,
      frameSize: 64,
      outputSize: 24,
      scale: 3,
    })).toEqual({
      dx: 0,
      dy: 0,
      dWidth: 24,
      dHeight: 24,
    });
  });
});
```

In `thumbnail-frame-rect.test.ts`, add an assertion that the existing source
crop remains unchanged for a representative item. The framing feature must
change destination geometry only, not `sx`, `sy`, or source frame size.

- [x] **Step 2: Run focused tests and verify the new API test fails**

```bash
rtk pnpm --filter @lpc-toolkit/web test -- thumbnail-framing.test.ts thumbnail-frame-rect.test.ts
```

Expected: FAIL because `createThumbnailDrawPlan` does not exist.

- [x] **Step 3: Implement the fallback-aware draw-plan helper**

Add:

```ts
export interface CreateThumbnailDrawPlanArgs {
  readonly bounds: AlphaBounds | null;
  readonly frameSize: number;
  readonly outputSize: number;
  readonly scale: number | undefined;
}

export function createThumbnailDrawPlan(
  args: CreateThumbnailDrawPlanArgs,
): ThumbnailDrawRect {
  if (!args.bounds || args.scale === undefined) {
    return {
      dx: 0,
      dy: 0,
      dWidth: args.outputSize,
      dHeight: args.outputSize,
    };
  }
  return computeThumbnailDrawRect(
    args.bounds,
    args.frameSize,
    args.outputSize,
    args.scale,
  );
}
```

- [x] **Step 4: Update `useItemThumbnail` to scan and center the source frame**

Add imports:

```ts
import {
  createThumbnailDrawPlan,
  findAlphaBounds,
} from '../lib/thumbnail-framing';
import { THUMBNAIL_TYPE_SCALES } from '../generated/thumbnail-framing-policy';
```

After `getThumbnailCropRect`, create a source-frame canvas:

```ts
const frameCanvas = document.createElement('canvas');
frameCanvas.width = r.size;
frameCanvas.height = r.size;
const frameCtx = frameCanvas.getContext('2d');
if (!frameCtx) {
  setState({ canvas: null, status: 'error' });
  return;
}
frameCtx.imageSmoothingEnabled = false;
frameCtx.drawImage(
  sheet.canvas as unknown as CanvasImageSource,
  r.sx,
  r.sy,
  r.size,
  r.size,
  0,
  0,
  r.size,
  r.size,
);

const pixels = frameCtx.getImageData(0, 0, r.size, r.size);
const bounds = findAlphaBounds(pixels.data, r.size, r.size);
const scale = THUMBNAIL_TYPE_SCALES[
  args.typeName as keyof typeof THUMBNAIL_TYPE_SCALES
];
const draw = createThumbnailDrawPlan({
  bounds,
  frameSize: r.size,
  outputSize: args.size,
  scale,
});
```

Replace the existing destination draw with:

```ts
ctx.drawImage(
  frameCanvas,
  0,
  0,
  r.size,
  r.size,
  draw.dx,
  draw.dy,
  draw.dWidth,
  draw.dHeight,
);
```

This makes audit `empty/error` types inherit their type scale whenever runtime
composition produces bounds. Empty runtime frames fall back to full-frame
drawing; composition failures retain the existing placeholder.

- [x] **Step 5: Run focused tests and web typecheck**

```bash
rtk pnpm --filter @lpc-toolkit/web test -- thumbnail-framing.test.ts thumbnail-frame-rect.test.ts thumbnail-cache.test.ts
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [x] **Step 6: Run the complete web unit suite**

```bash
rtk pnpm --filter @lpc-toolkit/web test
```

Expected: PASS.

- [x] **Step 7: Commit runtime auto-framing**

```bash
rtk git add packages/web/src/hooks/use-item-thumbnail.ts packages/web/src/lib/thumbnail-framing.ts packages/web/test/thumbnail-framing.test.ts packages/web/test/thumbnail-frame-rect.test.ts
rtk git commit -m "feat(web): auto-frame asset thumbnails"
```

- [x] **Step 8: Record task completion in this plan**

**Implementation note:** Runtime bounds detection and policy-based framing scale are now applied in `useItemThumbnail`, falling back to full-frame drawing for empty or error frames.
**Commit:** 1066c68fa
**Verification:** focused tests PASS, web unit suite PASS, web typecheck PASS.

### Task 6: Visual And Final Verification

**Files:**
- Modify only when a verified defect requires it:
  `packages/web/src/lib/thumbnail-framing.ts`,
  `packages/web/src/hooks/use-item-thumbnail.ts`,
  `packages/web/scripts/thumbnail-visible-bounds-audit-lib.ts`,
  or their focused tests
- Modify: `docs/superpowers/plans/2026-06-13-thumbnail-auto-framing.md`

- [x] **Step 1: Start the web app**

```bash
rtk pnpm --filter @lpc-toolkit/web dev --host 127.0.0.1
```

Expected: Vite reports a local URL.

- [x] **Step 2: Inspect representative asset types in the Browser plugin**

Use `browser:control-in-app-browser` to inspect:

- `ring`;
- `eyebrows`;
- `charm`;
- `backpack`;
- `weapon`;
- at least one renderable item corresponding to an audit `empty` or `error`
  row.

Verify:

- small types are materially easier to identify;
- all variants within a type use the same scale;
- large variants retain every visible pixel;
- normal types are not unnecessarily enlarged;
- thumbnail canvases remain pixelated;
- character preview and export behavior are unchanged.

- [x] **Step 3: Fix only verified framing defects**

For any defect, first add a failing focused test to
`thumbnail-framing.test.ts` or
`thumbnail-visible-bounds-audit.test.ts`, run it to confirm failure, make the
smallest implementation correction, and rerun the focused test. Do not add an
override unless a specific disconnected source pixel is confirmed to be
unintentional.

- [x] **Step 4: Run final automated verification**

```bash
rtk pnpm --filter @lpc-toolkit/web test
rtk pnpm --filter @lpc-toolkit/web typecheck
rtk pnpm --filter @lpc-toolkit/web build
rtk git diff --check
```

Expected: all commands PASS.

- [x] **Step 5: Verify generated policy remains current**

```bash
rtk cp packages/web/src/generated/thumbnail-framing-policy.ts /tmp/thumbnail-framing-policy-final.ts
rtk pnpm --filter @lpc-toolkit/web audit:thumbnail-bounds
rtk diff -u /tmp/thumbnail-framing-policy-final.ts packages/web/src/generated/thumbnail-framing-policy.ts
```

Expected: no diff.

- [x] **Step 6: Commit any verification-driven corrections**

If Step 3 changed code:

```bash
rtk git add packages/web/src packages/web/scripts packages/web/test packages/web/src/generated/thumbnail-framing-policy.ts
rtk git commit -m "fix(web): refine thumbnail auto-framing"
```

If no code changed, do not create an empty implementation commit.

- [x] **Step 7: Record final completion in this plan**

**Implementation note:** Thumbnail auto-framing passed representative visual inspection without changing composition or export behavior.
**Commit:** No correction commit
**Verification:** web test PASS; typecheck PASS; build PASS; generated policy deterministic; visual checks PASS
