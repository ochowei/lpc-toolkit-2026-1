# Thumbnail Visible Bounds Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic offline audit that composes every selectable item across all requested body types and non-color variants, measures the representative frame's visible alpha bounds, and writes CSV and Markdown reports.

**Architecture:** Extract the thumbnail selection-building rules into a browser-safe helper shared by the existing React hook and the audit. Keep alpha scanning, metric calculation, case expansion, and report formatting in a pure TypeScript audit library; keep filesystem access and `@napi-rs/canvas` in a Node-only runner/CLI under `packages/web/scripts`.

**Tech Stack:** TypeScript strict mode, pnpm workspaces, Vitest, `@lpc-toolkit/core`, existing MIT-licensed `@napi-rs/canvas`, Node `fs/path`.

---

## File Structure

- Create `packages/web/src/lib/item-thumbnail-selection.ts`
  - Build the one-item `Selections` shape used by both UI thumbnails and the audit, including sibling path substitutions.
- Modify `packages/web/src/hooks/use-item-thumbnail.ts`
  - Consume the shared helper without changing rendered behavior.
- Create `packages/web/test/item-thumbnail-selection.test.ts`
  - Cover explicit/default variants and synthesized sibling selections.
- Modify `packages/web/test/thumbnail-variant.test.ts`
  - Import the moved pure helper from its new module.
- Create `packages/web/scripts/thumbnail-visible-bounds-audit-lib.ts`
  - Define audit cases/rows, scan alpha bounds, derive metrics, expand cases, aggregate percentiles, and serialize CSV/Markdown.
- Create `packages/web/test/thumbnail-visible-bounds-audit.test.ts`
  - Unit-test alpha scanning, metrics, case expansion, deterministic serialization, and a small real-asset composition sample.
- Create `packages/web/scripts/audit-thumbnail-visible-bounds.ts`
  - Load local assets, compose each case with a tracked Node canvas adapter, and write reports.
- Modify `packages/web/package.json`
  - Add the `audit:thumbnail-bounds` command.
- Modify `.gitignore`
  - Ignore generated audit output.

## Task 1: Share Thumbnail Selection Construction

**Files:**
- Create: `packages/web/src/lib/item-thumbnail-selection.ts`
- Create: `packages/web/test/item-thumbnail-selection.test.ts`
- Modify: `packages/web/src/hooks/use-item-thumbnail.ts`
- Modify: `packages/web/test/thumbnail-variant.test.ts`

- [ ] **Step 1: Write failing tests for the shared helper**

Create `packages/web/test/item-thumbnail-selection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ItemDefinition } from '@lpc-toolkit/core';
import {
  buildItemThumbnailSelections,
  effectiveThumbnailVariant,
} from '../src/lib/item-thumbnail-selection';

function item(overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    name: 'Twists fade',
    type_name: 'hair',
    animations: ['walk'],
    credits: [],
    layer_1: { zPos: 10, male: 'hair/twists/' },
    ...overrides,
  };
}

describe('item thumbnail selections', () => {
  it('uses the explicit variant before the catalog default', () => {
    expect(effectiveThumbnailVariant('short', item({ variants: ['long'] })))
      .toBe('short');
  });

  it('uses the first declared variant when no explicit variant is supplied', () => {
    expect(effectiveThumbnailVariant(undefined, item({ variants: ['long', 'short'] })))
      .toBe('long');
  });

  it('builds one item selection without choosing a recolor', () => {
    expect(buildItemThumbnailSelections({
      item: item({ variants: ['long'] }),
      bodyType: 'female',
      variant: 'long',
    })).toEqual({
      bodyType: 'female',
      items: {
        hair: { typeName: 'hair', name: 'Twists fade', variant: 'long' },
      },
    });
  });

  it('synthesizes sibling selections for replace_in_path placeholders', () => {
    const selections = buildItemThumbnailSelections({
      item: item({
        type_name: 'expression',
        replace_in_path: {
          head: {
            Human_Male: 'male',
            Human_Female: 'female',
          },
        },
      }),
      bodyType: 'female',
    });

    expect(selections.items.head).toEqual({
      typeName: 'head',
      name: 'Human Female',
    });
  });
});
```

- [ ] **Step 2: Run the tests and verify the new module is missing**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- item-thumbnail-selection.test.ts
```

Expected: FAIL because `../src/lib/item-thumbnail-selection` does not exist.

- [ ] **Step 3: Implement the shared selection helper**

Create `packages/web/src/lib/item-thumbnail-selection.ts`:

```ts
import type {
  BodyType,
  ItemDefinition,
  Selection,
  Selections,
  TypeName,
} from '@lpc-toolkit/core';

export function effectiveThumbnailVariant(
  explicit: string | undefined,
  item: ItemDefinition | undefined,
): string | undefined {
  if (explicit !== undefined) return explicit;
  return item?.variants?.[0];
}

function siblingSelectionsFor(
  item: ItemDefinition,
  bodyType: BodyType,
): Record<TypeName, Selection> {
  const out: Record<TypeName, Selection> = {};
  for (const [siblingType, mapping] of Object.entries(item.replace_in_path ?? {})) {
    const entries = Object.entries(mapping);
    if (entries.length === 0) continue;
    const [siblingKey] =
      entries.find(([, mappedBodyType]) => mappedBodyType === bodyType)
      ?? entries[0]!;
    out[siblingType] = {
      typeName: siblingType,
      name: siblingKey.replaceAll('_', ' '),
    };
  }
  return out;
}

export interface BuildItemThumbnailSelectionsArgs {
  readonly item: ItemDefinition;
  readonly bodyType: BodyType;
  readonly variant?: string;
  readonly recolor?: string;
}

export function buildItemThumbnailSelections(
  args: BuildItemThumbnailSelectionsArgs,
): Selections {
  const variant = effectiveThumbnailVariant(args.variant, args.item);
  return {
    bodyType: args.bodyType,
    items: {
      ...siblingSelectionsFor(args.item, args.bodyType),
      [args.item.type_name]: {
        typeName: args.item.type_name,
        name: args.item.name,
        ...(variant ? { variant } : {}),
        ...(args.recolor ? { recolor: args.recolor } : {}),
      },
    },
  };
}
```

- [ ] **Step 4: Replace duplicated hook logic**

In `packages/web/src/hooks/use-item-thumbnail.ts`:

- remove `Selection`, `Selections`, and the local `effectiveThumbnailVariant` / `siblingSelectionsFor` functions;
- import `buildItemThumbnailSelections` from `../lib/item-thumbnail-selection`;
- replace construction of `siblings`, `variant`, and `selections` with:

```ts
    const selections = def
      ? buildItemThumbnailSelections({
          item: def,
          bodyType: args.bodyType,
          ...(args.variant !== undefined ? { variant: args.variant } : {}),
          ...(args.recolor !== undefined ? { recolor: args.recolor } : {}),
        })
      : {
          bodyType: args.bodyType,
          items: {
            [args.typeName]: {
              typeName: args.typeName,
              name: args.name,
              ...(args.variant ? { variant: args.variant } : {}),
              ...(args.recolor ? { recolor: args.recolor } : {}),
            },
          },
        };
```

Update `packages/web/test/thumbnail-variant.test.ts` to import
`effectiveThumbnailVariant` from `../src/lib/item-thumbnail-selection`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- item-thumbnail-selection.test.ts thumbnail-variant.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the shared helper**

```bash
git add packages/web/src/lib/item-thumbnail-selection.ts packages/web/src/hooks/use-item-thumbnail.ts packages/web/test/item-thumbnail-selection.test.ts packages/web/test/thumbnail-variant.test.ts
git commit -m "refactor(web): share thumbnail selection construction"
```

## Task 2: Add Pure Alpha Bounds And Metric Calculations

**Files:**
- Create: `packages/web/scripts/thumbnail-visible-bounds-audit-lib.ts`
- Create: `packages/web/test/thumbnail-visible-bounds-audit.test.ts`

- [ ] **Step 1: Write failing alpha-bound and metric tests**

Create `packages/web/test/thumbnail-visible-bounds-audit.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import {
  deriveThumbnailMetrics,
  findAlphaBounds,
} from '../scripts/thumbnail-visible-bounds-audit-lib';

function rgba(width: number, height: number, visible: readonly [number, number][]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of visible) data[(y * width + x) * 4 + 3] = 255;
  return data;
}

describe('findAlphaBounds', () => {
  it('returns null for a transparent frame', () => {
    expect(findAlphaBounds(rgba(4, 4, []), 4, 4)).toBeNull();
  });

  it('returns inclusive bounds for visible pixels touching frame edges', () => {
    expect(findAlphaBounds(rgba(4, 4, [[0, 1], [3, 2]]), 4, 4)).toEqual({
      x: 0,
      y: 1,
      width: 4,
      height: 2,
    });
  });
});

describe('deriveThumbnailMetrics', () => {
  it('calculates current visible size and two-pixel-margin fit scale', () => {
    expect(deriveThumbnailMetrics({ x: 10, y: 8, width: 16, height: 8 }, 64))
      .toEqual({
        widthRatio: 0.25,
        heightRatio: 0.125,
        visibleWidthAt24: 6,
        visibleHeightAt24: 3,
        fitScalePxPerSourcePixel: 1.25,
        additionalScaleOverCurrent: 10 / 3,
      });
  });
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- thumbnail-visible-bounds-audit.test.ts
```

Expected: FAIL because the audit library does not exist.

- [ ] **Step 3: Implement bounds and metrics**

Start `packages/web/scripts/thumbnail-visible-bounds-audit-lib.ts` with:

```ts
export interface AlphaBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ThumbnailMetrics {
  readonly widthRatio: number;
  readonly heightRatio: number;
  readonly visibleWidthAt24: number;
  readonly visibleHeightAt24: number;
  readonly fitScalePxPerSourcePixel: number;
  readonly additionalScaleOverCurrent: number;
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

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
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

export function deriveThumbnailMetrics(
  bounds: AlphaBounds,
  frameSize: number,
): ThumbnailMetrics {
  const currentScale = 24 / frameSize;
  const fitScalePxPerSourcePixel = Math.min(
    20 / bounds.width,
    20 / bounds.height,
  );
  return {
    widthRatio: bounds.width / frameSize,
    heightRatio: bounds.height / frameSize,
    visibleWidthAt24: bounds.width * currentScale,
    visibleHeightAt24: bounds.height * currentScale,
    fitScalePxPerSourcePixel,
    additionalScaleOverCurrent: fitScalePxPerSourcePixel / currentScale,
  };
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- thumbnail-visible-bounds-audit.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the calculation layer**

```bash
git add packages/web/scripts/thumbnail-visible-bounds-audit-lib.ts packages/web/test/thumbnail-visible-bounds-audit.test.ts
git commit -m "feat(web): calculate thumbnail alpha bounds"
```

## Task 3: Expand Audit Cases And Serialize Reports

**Files:**
- Modify: `packages/web/scripts/thumbnail-visible-bounds-audit-lib.ts`
- Modify: `packages/web/test/thumbnail-visible-bounds-audit.test.ts`

- [ ] **Step 1: Add failing case-expansion and serialization tests**

Append tests that construct a synthetic catalog with one variant-backed item,
one non-variant item, and incompatible body types. Assert:

```ts
expect(expandAuditCases(catalog, ['male', 'female'])).toEqual([
  expect.objectContaining({ itemId: 'hair/twists', bodyType: 'male', variant: 'long' }),
  expect.objectContaining({ itemId: 'hair/twists', bodyType: 'male', variant: 'short' }),
  expect.objectContaining({ itemId: 'hat/crown', bodyType: 'female', variant: undefined }),
]);
```

Add one `ok`, one `empty`, and one `error` row, then assert:

```ts
expect(rowsToCsv(rows)).toContain(
  'itemId,typeName,itemName,bodyType,variant,animation,direction,frameIndex,frameSize,status',
);
expect(rowsToCsv(rows)).toContain('"Hair, Long"');
expect(summaryToMarkdown(rows)).toContain('| ok | 1 |');
expect(summaryToMarkdown(rows)).toContain('## By Type');
```

- [ ] **Step 2: Run the test and verify missing exports**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- thumbnail-visible-bounds-audit.test.ts
```

Expected: FAIL for missing `expandAuditCases`, `rowsToCsv`, and
`summaryToMarkdown`.

- [ ] **Step 3: Add audit case and row types**

Add to the audit library:

```ts
import type {
  BodyType,
  Catalog,
  Direction,
  ItemDefinition,
} from '@lpc-toolkit/core';
import { itemSupportsBodyType } from '../src/slice/catalog-tree';

export const AUDIT_BODY_TYPES = [
  'male',
  'female',
  'teen',
  'child',
  'elderly',
  'muscular',
  'pregnant',
] as const satisfies readonly BodyType[];

export interface ThumbnailAuditCase {
  readonly itemId: string;
  readonly item: ItemDefinition;
  readonly bodyType: BodyType;
  readonly variant?: string;
}

export type ThumbnailAuditStatus = 'ok' | 'empty' | 'error';

export interface ThumbnailAuditRow {
  readonly itemId: string;
  readonly typeName: string;
  readonly itemName: string;
  readonly bodyType: BodyType;
  readonly variant?: string;
  readonly animation?: string;
  readonly direction: Direction;
  readonly frameIndex: number;
  readonly frameSize?: number;
  readonly status: ThumbnailAuditStatus;
  readonly bounds?: AlphaBounds;
  readonly metrics?: ThumbnailMetrics;
  readonly missingPaths: readonly string[];
  readonly error?: string;
}
```

- [ ] **Step 4: Implement deterministic case expansion**

```ts
export function expandAuditCases(
  catalog: Catalog,
  bodyTypes: readonly BodyType[] = AUDIT_BODY_TYPES,
): ThumbnailAuditCase[] {
  const cases: ThumbnailAuditCase[] = [];
  const items = [...catalog.byItemId.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en'));

  for (const [itemId, item] of items) {
    for (const bodyType of bodyTypes) {
      if (!itemSupportsBodyType(item, bodyType)) continue;
      const variants = item.variants?.length ? item.variants : [undefined];
      for (const variant of variants) {
        cases.push({
          itemId,
          item,
          bodyType,
          ...(variant !== undefined ? { variant } : {}),
        });
      }
    }
  }
  return cases;
}
```

- [ ] **Step 5: Implement deterministic CSV and Markdown output**

Add:

```ts
function csvCell(value: string | number | undefined): string {
  const text = value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function decimal(value: number | undefined): string {
  return value === undefined ? '' : value.toFixed(4);
}

export function rowsToCsv(rows: readonly ThumbnailAuditRow[]): string {
  const header = [
    'itemId', 'typeName', 'itemName', 'bodyType', 'variant', 'animation',
    'direction', 'frameIndex', 'frameSize', 'status',
    'boundsX', 'boundsY', 'boundsWidth', 'boundsHeight',
    'widthRatio', 'heightRatio', 'visibleWidthAt24', 'visibleHeightAt24',
    'fitScalePxPerSourcePixel', 'additionalScaleOverCurrent',
    'missingPaths', 'error',
  ];
  const lines = rows.map((row) => [
    row.itemId, row.typeName, row.itemName, row.bodyType, row.variant,
    row.animation, row.direction, row.frameIndex, row.frameSize, row.status,
    row.bounds?.x, row.bounds?.y, row.bounds?.width, row.bounds?.height,
    decimal(row.metrics?.widthRatio),
    decimal(row.metrics?.heightRatio),
    decimal(row.metrics?.visibleWidthAt24),
    decimal(row.metrics?.visibleHeightAt24),
    decimal(row.metrics?.fitScalePxPerSourcePixel),
    decimal(row.metrics?.additionalScaleOverCurrent),
    row.missingPaths.join(' | '),
    row.error,
  ].map(csvCell).join(','));
  return `${header.join(',')}\n${lines.join('\n')}\n`;
}
```

Implement `percentile(values, p)` with sorted linear interpolation, then
`summaryToMarkdown(rows)` with these deterministic sections:

1. `# Thumbnail Visible Bounds Audit`
2. totals table for `ok`, `empty`, and `error`
3. overall min/median/P90/P95/max table for visible width, visible height, and
   additional scale
4. `## By Type` table with count, median, P90, and maximum additional scale
5. ten smallest and ten largest successful cases
6. all empty/error cases and all rows with `missingPaths`

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- thumbnail-visible-bounds-audit.test.ts
```

Expected: PASS with stable case ordering and escaped CSV.

- [ ] **Step 7: Commit expansion and reporting**

```bash
git add packages/web/scripts/thumbnail-visible-bounds-audit-lib.ts packages/web/test/thumbnail-visible-bounds-audit.test.ts
git commit -m "feat(web): format thumbnail bounds audit reports"
```

## Task 4: Add Node Composition Runner

**Files:**
- Modify: `packages/web/scripts/thumbnail-visible-bounds-audit-lib.ts`
- Modify: `packages/web/test/thumbnail-visible-bounds-audit.test.ts`
- Create: `packages/web/scripts/audit-thumbnail-visible-bounds.ts`

- [ ] **Step 1: Add a failing real-asset integration test**

In the audit test, load sorted records from `assets/sheet_definitions` and
palette records from `assets/palette_definitions`. Select:

- `hair/hairstyles/twists_fade` or the catalog entry whose name is
  `Twists fade`;
- one item with more than one layer;
- one item with at least two variants.

Run only three cases through `runAuditCase`. Assert every returned row keeps the
requested item/body/variant identity, has direction `down` and frame index `0`,
and is either:

```ts
expect(row.status).toBe('ok');
expect(row.bounds?.width).toBeGreaterThan(0);
expect(row.metrics?.visibleWidthAt24).toBeGreaterThan(0);
```

or explicitly records missing paths/errors with a non-empty diagnostic. Skip
the test only when local `assets/` is absent.

- [ ] **Step 2: Run the integration test and verify `runAuditCase` is missing**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- thumbnail-visible-bounds-audit.test.ts
```

Expected: FAIL for missing runner exports.

- [ ] **Step 3: Define runner dependencies in the library**

Add:

```ts
import {
  ANIMATION_CONFIGS,
  composeSelections,
  extractAnimation,
  makeResolvePalette,
  type CanvasAdapter,
  type Catalog,
  type PaletteMetadata,
} from '@lpc-toolkit/core';
import { buildItemThumbnailSelections } from '../src/lib/item-thumbnail-selection';
import { frameRect } from '../src/slice/frame-rect';

export interface RunAuditCaseDeps {
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly adapter: CanvasAdapter;
  readonly failedPaths: readonly string[];
}
```

Implement `runAuditCase(auditCase, deps)`:

```ts
export async function runAuditCase(
  auditCase: ThumbnailAuditCase,
  deps: RunAuditCaseDeps,
): Promise<ThumbnailAuditRow> {
  const base = {
    itemId: auditCase.itemId,
    typeName: auditCase.item.type_name,
    itemName: auditCase.item.name,
    bodyType: auditCase.bodyType,
    ...(auditCase.variant !== undefined ? { variant: auditCase.variant } : {}),
    direction: 'down' as const,
    frameIndex: 0,
  };

  try {
    const selections = buildItemThumbnailSelections({
      item: auditCase.item,
      bodyType: auditCase.bodyType,
      ...(auditCase.variant !== undefined ? { variant: auditCase.variant } : {}),
    });
    const sheet = await composeSelections(selections, {
      catalog: deps.catalog,
      adapter: deps.adapter,
      spritesheetsBaseUrl: '',
      resolvePalette: makeResolvePalette(deps.catalog, deps.palettes, selections),
    });
    const animationName =
      sheet.animations.includes('walk') ? 'walk' : sheet.animations[0];
    if (!animationName) {
      return { ...base, status: 'error', missingPaths: [...deps.failedPaths], error: 'No composed animation' };
    }
    const animation = extractAnimation(sheet, animationName, { adapter: deps.adapter });
    const config = ANIMATION_CONFIGS[animation.animation];
    if (!config) {
      return { ...base, animation: animationName, status: 'error', missingPaths: [...deps.failedPaths], error: 'Representative animation has no standard frame config' };
    }
    const rect = frameRect(config, animation.directions, 'down', 0);
    const pixels = animation.canvas.getContext('2d')
      .getImageData(rect.sx, rect.sy, rect.size, rect.size);
    const bounds = findAlphaBounds(pixels.data, rect.size, rect.size);
    if (!bounds) {
      return { ...base, animation: animationName, frameSize: rect.size, status: 'empty', missingPaths: [...deps.failedPaths] };
    }
    return {
      ...base,
      animation: animationName,
      frameSize: rect.size,
      status: 'ok',
      bounds,
      metrics: deriveThumbnailMetrics(bounds, rect.size),
      missingPaths: [...deps.failedPaths],
    };
  } catch (error) {
    return {
      ...base,
      status: 'error',
      missingPaths: [...deps.failedPaths],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

- [ ] **Step 4: Implement asset loading and tracked Node adapters in the CLI**

Create `packages/web/scripts/audit-thumbnail-visible-bounds.ts`. It must:

1. resolve repo paths from `import.meta.url`;
2. recursively read and sort JSON records;
3. call `createCatalog` and `createPaletteCatalog`;
4. call `expandAuditCases`;
5. create a fresh adapter and mutable `failedPaths` array per case;
6. map `spritesheets/...` to `assets/spritesheets/...`;
7. catch `napiLoadImage` failures, append the logical path, then rethrow so
   core retains its existing missing-layer behavior;
8. run cases sequentially to bound canvas memory;
9. log progress every 100 cases;
10. write CSV and Markdown with `mkdirSync(..., { recursive: true })` and
    `writeFileSync`.

Use this adapter:

```ts
function trackedNodeAdapter(
  spritesheetsDir: string,
  failedPaths: string[],
): CanvasAdapter {
  return {
    createCanvas: (width, height) =>
      createCanvas(width, height) as unknown as CanvasLike,
    loadImage: async (logicalPath): Promise<ImageLike> => {
      const rel = logicalPath.replace(/^spritesheets\//, '');
      try {
        return await napiLoadImage(path.join(spritesheetsDir, rel))
          as unknown as ImageLike;
      } catch (error) {
        failedPaths.push(logicalPath);
        throw error;
      }
    },
  };
}
```

Parse only the optional form `--output-dir <path>`. Reject unknown or missing
arguments with a usage message and exit code `1`. Default to
`packages/web/.audit-output/thumbnail-visible-bounds/`.

- [ ] **Step 5: Run the focused integration test**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- thumbnail-visible-bounds-audit.test.ts
```

Expected: PASS for unit and three-case real-asset integration coverage.

- [ ] **Step 6: Commit the runner**

```bash
git add packages/web/scripts/thumbnail-visible-bounds-audit-lib.ts packages/web/scripts/audit-thumbnail-visible-bounds.ts packages/web/test/thumbnail-visible-bounds-audit.test.ts
git commit -m "feat(web): compose thumbnail bounds audit cases"
```

## Task 5: Wire The Command And Run The Full Audit

**Files:**
- Modify: `packages/web/package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Add the command and ignored output**

Add to `packages/web/package.json` scripts:

```json
"audit:thumbnail-bounds": "tsx scripts/audit-thumbnail-visible-bounds.ts"
```

Add to `.gitignore`:

```gitignore
# Generated local analysis reports
packages/web/.audit-output/
```

- [ ] **Step 2: Run typechecking before the expensive audit**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run all focused tests**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- item-thumbnail-selection.test.ts thumbnail-variant.test.ts thumbnail-visible-bounds-audit.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run the complete audit**

Run:

```bash
pnpm --filter @lpc-toolkit/web audit:thumbnail-bounds
```

Expected:

- progress logs advance through every expanded combination;
- command exits `0`;
- files exist at:
  - `packages/web/.audit-output/thumbnail-visible-bounds/thumbnail-visible-bounds.csv`
  - `packages/web/.audit-output/thumbnail-visible-bounds/thumbnail-visible-bounds-summary.md`

- [ ] **Step 5: Validate report completeness**

Check that:

```bash
wc -l packages/web/.audit-output/thumbnail-visible-bounds/thumbnail-visible-bounds.csv
rg -n "^## (Overall Distribution|By Type|Smallest|Largest|Empty And Error Cases)" packages/web/.audit-output/thumbnail-visible-bounds/thumbnail-visible-bounds-summary.md
```

Expected: CSV line count equals expanded case count plus one header line; every
required summary section is present. Inspect the summary totals and confirm
`ok + empty + error = total combinations`.

- [ ] **Step 6: Run workspace verification**

Run:

```bash
pnpm -r typecheck
pnpm --filter @lpc-toolkit/web test
```

Expected: PASS. The web test command may run asset preparation first.

- [ ] **Step 7: Commit command wiring**

```bash
git add .gitignore packages/web/package.json
git commit -m "chore(web): add thumbnail bounds audit command"
```

- [ ] **Step 8: Report measured findings**

Summarize from the generated Markdown report:

- total item and combination counts;
- `ok`, `empty`, and `error` counts;
- median/P90/P95 visible dimensions at 24 pixels;
- median/P90/P95 additional scale;
- categories and concrete items at the smallest/largest extremes;
- missing-path diagnostics that could bias card-size decisions.

Do not commit generated files under `.audit-output/`.
