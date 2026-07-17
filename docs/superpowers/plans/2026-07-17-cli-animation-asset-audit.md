# CLI Animation Asset Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `catalog audit-animations` command that turns user-selected standard animation gaps, missing sprite files, and referenced transparent frames into a deterministic drawing worklist.

**Architecture:** Keep animation capability, path planning, and source-frame geometry pure in Core. Add one focused asynchronous CLI audit module that resolves the plan through the existing runtime `AssetStore`, decodes PNGs through the existing canvas adapter, and builds report data; `main.ts` dispatches only the new subcommand to that async path so existing catalog queries stay synchronous.

**Tech Stack:** TypeScript 5.7 strict mode, Node.js 22+, pnpm 9, Vitest 2, existing `@napi-rs/canvas`, existing directory/ZIP `AssetStore` implementations.

**Design:** `docs/superpowers/specs/2026-07-17-cli-animation-asset-audit-design.md`

## Global Constraints

- Add no dependency and no `any` type.
- Accept one or more explicit registered standard `--animation` values; do not add an implicit all-animations mode.
- Preserve existing `catalog items`, `catalog item`, composition, render, preview, export, token, and attribution behavior.
- Read catalog definitions from the active base plus `assets_custom` definition overlay; read sprite bytes only through the runtime `AssetStore` used by rendering.
- Never write, repair, copy, or delete sprite assets; never initialize or modify `upstream/`.
- Treat unsupported animations, missing files, and blank frames as successful audit findings. Only invalid command input or a fatal runtime-asset/catalog load failure returns a failed CLI response.
- Treat referenced fully transparent cells as warnings in report data. Ignore unreferenced padding cells.
- Use a fixed default inspection concurrency of `4`; do not introduce a public concurrency flag.
- Keep Core environment-agnostic: no Node, filesystem, DOM, React, concrete canvas, ZIP, or CLI imports under `packages/core/src/**`.
- Preserve GPL-3.0-or-later licensing and existing credit metadata. The audit creates no pixel artifact and no new attribution export.
- Prefix every repository command with `rtk`.
- After each task's product commit, update this checked-in plan: check completed steps, add a short implementation note, record the full product commit hash, and record each exact verification command with PASS/FAIL. Commit that record separately with `docs(plan): record ...`.

## File Structure

- `packages/core/src/animation-capabilities.ts` — normalize item animation metadata, derive native/compatible/unsupported sets, map audit targets to physical source folders, and centralize folder support aliases.
- `packages/core/src/asset-animation-audit.ts` — pure audit plan types, path expansion, frame geometry, unsupported worklist planning, supported physical requirements, deduplication, and deterministic sorting.
- `packages/core/src/compose.ts` — expose source layer numbers on `ResolvedLayer` and consume the shared folder-support helper without changing output behavior.
- `packages/core/src/validation/asset-validator.ts` — consume the shared folder-support helper without changing validation behavior.
- `packages/core/src/index.ts` — publish the audit planner, capability helpers, and immutable report-plan types.
- `packages/core/test/animation-capabilities.test.ts` — capability normalization, custom-base compatibility, aliases, and virtual source folders.
- `packages/core/test/asset-animation-audit.test.ts` — path/variant/body/layer/recolor expansion, custom geometry, manual review, deduplication, and ordering.
- `packages/core/test/compose.test.ts` — verify additive `ResolvedLayer.layerNumber` metadata does not affect public composition paths.
- `packages/cli/src/animation-audit.ts` — validate audit scope, inspect planned assets with bounded concurrency, scan referenced cells, and return the complete audit report.
- `packages/cli/src/catalog-discovery.ts` — consume the shared Core capability calculator instead of owning a duplicate.
- `packages/cli/src/catalog-commands.ts` — consume the shared Core capability calculator for existing catalog filtering.
- `packages/cli/src/command-spec.ts` — define the new command, options, examples, and help contract.
- `packages/cli/src/main.ts` — preflight the required animation flag and route the new catalog subcommand to its async runner.
- `packages/cli/src/response.ts` — format the deterministic human drawing worklist.
- `packages/cli/test/animation-audit.test.ts` — directory/ZIP-independent inspector tests with injected stores/adapters.
- `packages/cli/test/command-spec.test.ts` — repeatable option and help coverage.
- `packages/cli/test/main-assets.test.ts` — preflight and runtime preparation behavior.
- `packages/cli/test/main-json.test.ts` — standard JSON envelope and complete report contract.
- `packages/cli/test/main-human.test.ts` — grouped human output and manual-review/error presentation.
- `packages/cli/README.md` — public command usage, result categories, exit behavior, and JSON field semantics.

## Stable Interfaces

Later tasks must use these names and shapes exactly unless the plan is amended before implementation:

```ts
// packages/core/src/animation-capabilities.ts
export interface ItemAnimationCapabilities {
  readonly native: readonly AnimationName[];
  readonly compatible: readonly AnimationName[];
  readonly unsupported: readonly AnimationName[];
}

export function itemAnimationCapabilities(item: ItemDefinition): ItemAnimationCapabilities;
export function compatibleAnimationSource(
  item: ItemDefinition,
  target: AnimationName,
): AnimationName | undefined;
export function auditAnimationFolder(target: AnimationName): string | undefined;
export function animationsSupportFolder(
  animations: readonly string[],
  folder: string,
): boolean;

// packages/core/src/asset-animation-audit.ts
export function planAssetAnimationAudit(
  options: PlanAssetAnimationAuditOptions,
): AssetAnimationAuditPlan;

// packages/cli/src/animation-audit.ts
export async function inspectAssetAnimationPlan(
  plan: AssetAnimationAuditPlan,
  options: InspectAssetAnimationPlanOptions,
): Promise<AssetAnimationAuditReport>;

export async function runAnimationAuditCommand(
  parsed: ParsedArgs,
  runtime: RuntimeAssets,
): Promise<CliResponse<AssetAnimationAuditReport>>;
```

## CLI Documentation Impact

```text
help: update
cli-readme: update
root-readme: N/A — specialized asset-authoring audit, not a primary quick start
landing: N/A — no landing-page workflow change
architecture: N/A — existing Core planning and CLI filesystem boundaries remain unchanged
engineering: N/A — repository verification and CI commands do not change
releasing: N/A — no package or publication workflow change
plugin: N/A — character-authoring plugin does not perform asset production audits
```

The implementation pull request must declare:

```text
CLI docs impact: updated
CLI docs surfaces: help, cli-readme
```

Reassess the matrix in Task 6 before handoff. If implementation changes an additional owned contract, update that surface and the declaration instead of retaining an inaccurate `N/A`.

---

### Task 1: Centralize animation capability and folder rules in Core

**Files:**
- Create: `packages/core/src/animation-capabilities.ts`
- Create: `packages/core/test/animation-capabilities.test.ts`
- Modify: `packages/core/src/compose.ts`
- Modify: `packages/core/src/validation/asset-validator.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/catalog-discovery.ts`
- Modify: `packages/cli/src/catalog-commands.ts`
- Test: `packages/cli/test/catalog-commands.test.ts`

**Interfaces:**
- Consumes: `ANIMATIONS`, `ANIMATION_DEFAULTS`, `VIRTUAL_ANIMATION_MAP`, `customAnimations`, and `customAnimationBase` from Core.
- Produces: the four capability/folder functions listed under Stable Interfaces.
- Preserves: current catalog detail arrays and `catalog items --animation` compatibility filtering.

- [x] **Step 1: Write failing Core capability tests**

Create `packages/core/test/animation-capabilities.test.ts` with focused fixtures:

```ts
import { describe, expect, it } from 'vitest';
import {
  animationsSupportFolder,
  auditAnimationFolder,
  compatibleAnimationSource,
  itemAnimationCapabilities,
} from '../src/animation-capabilities.js';
import type { ItemDefinition } from '../src/types.js';

const item = (animations: unknown): ItemDefinition => ({
  name: 'Fixture',
  type_name: 'fixture',
  animations,
  credits: [],
  layer_1: { zPos: 1, male: 'fixture/' },
} as ItemDefinition);

describe('itemAnimationCapabilities', () => {
  it('derives a registered custom base without mutating native names', () => {
    expect(itemAnimationCapabilities(item(['wheelchair']))).toMatchObject({
      native: ['wheelchair'],
      compatible: ['sit'],
    });
    expect(compatibleAnimationSource(item(['wheelchair']), 'sit')).toBe('wheelchair');
  });

  it('defaults malformed metadata but preserves an explicit empty list', () => {
    expect(itemAnimationCapabilities(item('walk')).native).toContain('walk');
    expect(itemAnimationCapabilities(item([])).native).toEqual([]);
  });

  it('maps aliases and virtual audit sources to physical folders', () => {
    expect(auditAnimationFolder('combat')).toBe('combat_idle');
    expect(auditAnimationFolder('1h_backslash')).toBe('backslash');
    expect(auditAnimationFolder('1h_halfslash')).toBe('halfslash');
    expect(auditAnimationFolder('watering')).toBe('thrust');
  });

  it('shares the existing folder support gates', () => {
    expect(animationsSupportFolder(['combat'], 'combat_idle')).toBe(true);
    expect(animationsSupportFolder(['1h_slash'], 'backslash')).toBe(true);
    expect(animationsSupportFolder(['walk'], 'combat_idle')).toBe(false);
  });
});
```

- [x] **Step 2: Run the new test and verify RED**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/core test -- animation-capabilities.test.ts
```

Expected: FAIL because `animation-capabilities.ts` does not exist.

- [x] **Step 3: Implement the shared capability module**

Create the module with strict normalization and deterministic registry ordering:

```ts
import {
  ANIMATIONS,
  ANIMATION_DEFAULTS,
  VIRTUAL_ANIMATION_MAP,
} from './constants.js';
import { customAnimationBase, customAnimations } from './custom-animations.js';
import type { AnimationName, ItemDefinition } from './types.js';

export interface ItemAnimationCapabilities {
  readonly native: readonly AnimationName[];
  readonly compatible: readonly AnimationName[];
  readonly unsupported: readonly AnimationName[];
}

const STANDARD_NAMES = ANIMATIONS.map(({ value }) => value);
const STANDARD_SET = new Set<AnimationName>(STANDARD_NAMES);

function nativeAnimations(item: ItemDefinition): readonly AnimationName[] {
  const raw: unknown = item.animations;
  return Array.isArray(raw) && raw.every((name): name is string => typeof name === 'string')
    ? [...new Set(raw)]
    : [...ANIMATION_DEFAULTS];
}

export function compatibleAnimationSource(
  item: ItemDefinition,
  target: AnimationName,
): AnimationName | undefined {
  return nativeAnimations(item).find((name) => {
    const definition = customAnimations[name];
    return definition !== undefined && customAnimationBase(definition) === target;
  });
}

export function itemAnimationCapabilities(item: ItemDefinition): ItemAnimationCapabilities {
  const native = nativeAnimations(item);
  const nativeSet = new Set(native);
  const compatibleSet = new Set<AnimationName>();
  for (const name of native) {
    const definition = customAnimations[name];
    if (!definition) continue;
    const base = customAnimationBase(definition);
    if (STANDARD_SET.has(base) && !nativeSet.has(base)) compatibleSet.add(base);
  }
  return {
    native,
    compatible: STANDARD_NAMES.filter((name) => compatibleSet.has(name)),
    unsupported: STANDARD_NAMES.filter(
      (name) => !nativeSet.has(name) && !compatibleSet.has(name),
    ),
  };
}

export function auditAnimationFolder(target: AnimationName): string | undefined {
  const virtual = VIRTUAL_ANIMATION_MAP[target as keyof typeof VIRTUAL_ANIMATION_MAP];
  const physical = virtual ?? target;
  const entry = ANIMATIONS.find(({ value }) => value === physical);
  return entry ? entry.folderName ?? entry.value : undefined;
}

export function animationsSupportFolder(
  animations: readonly string[],
  folder: string,
): boolean {
  if (folder === 'combat_idle') return animations.includes('combat');
  if (folder === 'backslash') {
    return animations.includes('1h_slash') || animations.includes('1h_backslash');
  }
  if (folder === 'halfslash') return animations.includes('1h_halfslash');
  return animations.includes(folder);
}
```

Export these functions and `ItemAnimationCapabilities` from `packages/core/src/index.ts`.

- [x] **Step 4: Remove duplicate consumers without changing behavior**

In `compose.ts` and `asset-validator.ts`, import `animationsSupportFolder`, remove their local `supportsFolder` functions, and replace only those calls. Do not replace `compose.ts`'s private `logicalToFolder`; changing `watering` composition is outside this feature.

In `catalog-discovery.ts`, import `itemAnimationCapabilities` and `ItemAnimationCapabilities` from `@lpc-toolkit/core`, delete the local interface/helper/registry sets, and keep existing projections unchanged. In `catalog-commands.ts`, import `itemAnimationCapabilities` from Core instead of `catalog-discovery.ts`.

- [x] **Step 5: Run Core and CLI capability tests and verify GREEN**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/core test -- animation-capabilities.test.ts validation/asset-validator.test.ts compose.test.ts
rtk pnpm --filter @lpc-toolkit/cli test -- catalog-commands.test.ts catalog-discovery.test.ts
```

Expected: PASS; existing catalog JSON capability fields, filters, composition, and validation remain unchanged.

- [x] **Step 6: Commit the shared rules**

```sh
rtk git add packages/core/src/animation-capabilities.ts packages/core/src/compose.ts packages/core/src/validation/asset-validator.ts packages/core/src/index.ts packages/core/test/animation-capabilities.test.ts packages/cli/src/catalog-discovery.ts packages/cli/src/catalog-commands.ts packages/cli/test/catalog-commands.test.ts
rtk git commit -m "refactor(core): share animation capability rules"
rtk git rev-parse HEAD
```

Expected: commit succeeds and the final command prints the full product commit hash.

- [x] **Step 7: Record Task 1 evidence in this plan**

Check Task 1 steps, add `Implementation`, `Commit`, and exact `Verification` PASS lines beneath this task, then commit the plan record:

```sh
rtk git add docs/superpowers/plans/2026-07-17-cli-animation-asset-audit.md
rtk git commit -m "docs(plan): record animation capability rules"
```

Implementation: Added Core animation capability and source-folder helpers, then migrated composition, validation, and CLI catalog consumers to them without changing catalog capability projections or filters.

Commit: dafe79744fa2446a87ff1e27c3a07a742704718d

TDD RED verification: `rtk pnpm --filter @lpc-toolkit/core test -- animation-capabilities.test.ts` FAIL (expected: missing `animation-capabilities.ts`).

Verification: `rtk pnpm --filter @lpc-toolkit/core test -- animation-capabilities.test.ts validation/asset-validator.test.ts compose.test.ts` PASS

Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- catalog-commands.test.ts catalog-discovery.test.ts` PASS

---

### Task 2: Build the pure Core audit planner

**Files:**
- Create: `packages/core/src/asset-animation-audit.ts`
- Create: `packages/core/test/asset-animation-audit.test.ts`
- Modify: `packages/core/src/compose.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/compose.test.ts`

**Interfaces:**
- Consumes: Task 1's capability helpers, `BODY_TYPES`, `DIRECTIONS`, `ANIMATION_CONFIGS`, `FRAME_SIZE`, `customAnimations`, `getRecolorVariants`, `Catalog`, and `PaletteMetadata`.
- Produces: `planAssetAnimationAudit(options): AssetAnimationAuditPlan` and all immutable plan types exported from Core.
- Produces: additive `ResolvedLayer.layerNumber: number` metadata.

- [x] **Step 1: Define failing planner fixtures and assertions**

Create `packages/core/test/asset-animation-audit.test.ts`. Use `createCatalog` and `createPaletteCatalog` to cover a variant/recolor item, shared paths, compatible custom geometry, unsupported custom-only items, and unresolved path substitutions:

```ts
const palettes = createPaletteCatalog({
  'hair/meta_hair.json': { type: 'material', default: 'ulpc', base: 'black' },
  'hair/hair_ulpc.json': {
    black: ['#111111', '#222222'],
    orange: ['#cc5500', '#ee7700'],
  },
}).palettes;

it('plans exact supported files and inferred unsupported work by layer and variant', () => {
  const catalog = createCatalog({
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

  const plan = planAssetAnimationAudit({
    catalog,
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
```

Add assertions that:

- male/female consumers sharing a base path collapse into one requirement with ordered `bodyTypes`;
- `targets` follow registry order and duplicate inputs disappear;
- a Wheelchair-style `custom_animation: 'wheelchair'` with a physical variant supplies target `sit`, uses the custom definition's frame size/grid, and is not unsupported;
- an unsupported item with only custom layers emits one `manual-review` requirement without `expectedPath`;
- a raw path containing an unmapped `${head}` emits a specific `manualReviewReason`;
- `typeName` and `bodyType` options narrow `itemsScanned` and consumers;
- assets and unsupported findings sort deterministically.

- [x] **Step 2: Run the planner test and verify RED**

  - RED verification: `rtk pnpm --filter @lpc-toolkit/core test -- asset-animation-audit.test.ts` FAIL (the planner module did not exist).

```sh
rtk pnpm --filter @lpc-toolkit/core test -- asset-animation-audit.test.ts
```

Expected: FAIL because the planner and its types do not exist.

- [x] **Step 3: Add the immutable plan model**

  - Added all public immutable audit-plan types and the planner export.

Create these public shapes in `asset-animation-audit.ts`:

```ts
export type AuditLayerName = `layer_${number}`;

export interface AnimationAuditFrameCell {
  readonly sourceColumn: number;
  readonly logicalFrameIndices: readonly number[];
}

export interface AnimationAuditFrameRow {
  readonly sourceRow: number;
  readonly direction?: Direction;
  readonly cells: readonly AnimationAuditFrameCell[];
}

export interface AnimationAuditGeometry {
  readonly kind: 'standard' | 'custom';
  readonly frameSize: number;
  readonly rows: readonly AnimationAuditFrameRow[];
}

export interface AnimationAuditConsumer {
  readonly itemId: ItemId;
  readonly typeName: TypeName;
  readonly layer: AuditLayerName;
  readonly bodyTypes: readonly BodyType[];
  readonly variant?: string;
  readonly recolors: readonly string[];
}

export interface PlannedAnimationAsset {
  readonly path: string;
  readonly animation: AnimationName;
  readonly sourceAnimation: AnimationName;
  readonly geometry: AnimationAuditGeometry;
  readonly consumers: readonly AnimationAuditConsumer[];
}

export interface UnsupportedAnimationRequirement extends AnimationAuditConsumer {
  readonly expectedPath?: string;
  readonly pathConfidence: 'inferred' | 'manual-review';
  readonly manualReviewReason?: string;
}

export interface UnsupportedAnimationFinding {
  readonly itemId: ItemId;
  readonly typeName: TypeName;
  readonly animation: AnimationName;
  readonly nativeAnimations: readonly AnimationName[];
  readonly compatibleAnimations: readonly AnimationName[];
  readonly requirements: readonly UnsupportedAnimationRequirement[];
}

export interface AnimationAuditPlanningError {
  readonly kind: 'path_resolution_requires_selection';
  readonly message: string;
  readonly consumer: AnimationAuditConsumer;
}

export interface AssetAnimationAuditPlan {
  readonly targets: readonly AnimationName[];
  readonly itemsScanned: number;
  readonly assets: readonly PlannedAnimationAsset[];
  readonly unsupported: readonly UnsupportedAnimationFinding[];
  readonly errors: readonly AnimationAuditPlanningError[];
}

export interface PlanAssetAnimationAuditOptions {
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly targets: readonly AnimationName[];
  readonly typeName?: TypeName;
  readonly bodyType?: BodyType;
}
```

- [x] **Step 4: Implement geometry and path planning**

  - Implemented registry-ordered target planning, geometry, path expansion, consumer merging, unsupported findings, and deterministic ordering.

Implement `standardGeometry(target)` by converting every unique source column in `ANIMATION_CONFIGS[target].cycle` into a cell whose `logicalFrameIndices` are the matching zero-based cycle positions. Use source rows `0..num-1` because each physical animation PNG begins at its own row zero, and use `DIRECTIONS[row]` when present.

Implement `customGeometry(sourceAnimation)` from `customAnimations[sourceAnimation]`: one row per definition row, one cell per column, `logicalFrameIndices: [column]`, the definition's `frameSize`, and `DIRECTIONS[row]` when present.

Use the following exact path rules:

```ts
const variantFile = variant?.replaceAll(' ', '_');
const standardPath = `spritesheets/${basePath}${folder}${
  variantFile ? `/${variantFile}` : ''
}.png`;
const customPath = `spritesheets/${basePath}${variantFile}.png`;
```

For ordinary native layers, use `auditAnimationFolder(target)` and standard geometry. Set `sourceAnimation` to `VIRTUAL_ANIMATION_MAP[target] ?? target`, so `watering` inspects the physical `thrust` file without changing its logical target geometry. For compatible targets, use `compatibleAnimationSource(item, target)`, include only layers whose `custom_animation` equals that source, and use custom geometry. For unsupported targets, infer standard paths only for ordinary layers. When every applicable layer is custom-only, emit a manual-review requirement with reason `Item has only custom-animation layers; choose a standard layout before drawing.`

Expand raw `${name}` paths over all distinct values in `item.replace_in_path?.[name]`. If any token has no non-empty replacement map, omit `expectedPath` and use reason `Layer path depends on an unresolved ${name} selection.`

Group body types that resolve to the same base path, expand physical `item.variants` or `[undefined]`, attach `getRecolorVariants(item, palettes)`, then deduplicate supported assets by `path + animation + sourceAnimation + geometry`. Merge consumers rather than duplicating physical work.

- [x] **Step 5: Add layer numbers without changing public composition paths**

  - Added additive `ResolvedLayer.layerNumber` metadata with coverage for two source layers.

Extend `ResolvedLayer` and its constructor in `compose.ts`:

```ts
export interface ResolvedLayer {
  readonly layerNumber: number;
  // retain every existing field unchanged
}

// inside resolveLayers output
out.push({
  layerNumber: n,
  itemId,
  typeName,
  item,
  basePath,
  zPos: layer.zPos,
  animations: item.animations ?? ANIMATION_DEFAULTS,
  // retain existing optional fields
});
```

Add a `resolveLayers` assertion in `compose.test.ts` that two synthetic layers return `[1, 2]`, while existing `getSpritePathsForSelections` expected objects remain unchanged.

Export the planner, options, and all plan types from `index.ts`.

- [x] **Step 6: Run focused Core tests and verify GREEN**

  - Verification: `rtk pnpm --filter @lpc-toolkit/core test -- asset-animation-audit.test.ts animation-capabilities.test.ts compose.test.ts validation/asset-validator.test.ts` PASS
  - Verification: `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS
  - Additional verification: `rtk pnpm check:boundaries` PASS

```sh
rtk pnpm --filter @lpc-toolkit/core test -- asset-animation-audit.test.ts animation-capabilities.test.ts compose.test.ts validation/asset-validator.test.ts
rtk pnpm --filter @lpc-toolkit/core run typecheck
```

Expected: PASS; no boundary or strict-type errors.

- [x] **Step 7: Commit the Core planner**

  - Product commit: `1fe99826cd94ed5b4ef6a64876e49c6fe9a92876`

```sh
rtk git add packages/core/src/asset-animation-audit.ts packages/core/src/compose.ts packages/core/src/index.ts packages/core/test/asset-animation-audit.test.ts packages/core/test/compose.test.ts
rtk git commit -m "feat(core): plan animation asset audits"
rtk git rev-parse HEAD
```

- [x] **Step 8: Record Task 2 evidence in this plan**

  - Implementation: Added the pure Core asset-animation audit planner with immutable public types, standard/custom geometry, path expansion, recolor-aware consumer grouping, deterministic findings, and additive `ResolvedLayer.layerNumber` metadata.
  - Commit: `1fe99826cd94ed5b4ef6a64876e49c6fe9a92876`
  - Follow-up deterministic-ordering fix: `a46a2ed25c9e2e389ab12cc36ae8d19a2232e142`
  - Verification: `rtk pnpm --filter @lpc-toolkit/core test -- asset-animation-audit.test.ts animation-capabilities.test.ts compose.test.ts validation/asset-validator.test.ts` PASS
  - Verification: `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS
  - Verification: `rtk pnpm check:boundaries` PASS

Record the implementation note, full product commit hash, and both exact PASS commands, then:

```sh
rtk git add docs/superpowers/plans/2026-07-17-cli-animation-asset-audit.md
rtk git commit -m "docs(plan): record Core animation audit planner"
```

---

### Task 3: Inspect planned PNGs and build report data in CLI

**Files:**
- Create: `packages/cli/src/animation-audit.ts`
- Create: `packages/cli/test/animation-audit.test.ts`

**Interfaces:**
- Consumes: `AssetAnimationAuditPlan`, `AnimationAuditGeometry`, `CanvasAdapter`, and `RuntimeAssets.store`.
- Produces: `inspectAssetAnimationPlan(plan, options): Promise<AssetAnimationAuditReport>`.
- Preserves: report findings as successful data, including per-path read/decode errors.

- [x] **Step 1: Write failing inspector tests**

Create injected store and canvas-adapter fixtures. Use an in-memory canvas for opaque/transparent cells and make `store.has()` independent from `adapter.loadImage()` so missing and corrupt cases differ:

```ts
const store: AssetStore = {
  kind: 'directory',
  baseUrl: '/fixture-assets',
  description: 'fixture',
  has: (logicalPath) => present.has(logicalPath),
  load: async (sourcePath) => sourcePath,
};

it('separates missing, blank, and unreadable files and keeps findings successful', async () => {
  const report = await inspectAssetAnimationPlan(plan, {
    store,
    adapter,
    concurrency: 2,
  });

  expect(report.missingFiles).toEqual([
    expect.objectContaining({ path: 'spritesheets/hair/missing/walk.png' }),
  ]);
  expect(report.blankFrames).toEqual([
    expect.objectContaining({
      path: 'spritesheets/hair/blank/walk.png',
      sourceRow: 2,
      direction: 'down',
      frames: [expect.objectContaining({ sourceColumn: 3 })],
    }),
  ]);
  expect(report.errors).toEqual([
    expect.objectContaining({ kind: 'image_decode_failed' }),
  ]);
});
```

Also test that unreferenced transparent columns are ignored, repeated cycle columns are scanned once but retain every logical frame index, shared physical paths are loaded once, maximum concurrent `loadImage` calls never exceeds the injected limit, and output order remains plan order despite out-of-order promise completion.

Implementation note: Added in-memory adapter/store coverage for missing, blank,
decode, read, shared-path, cell-selection, bounded-concurrency, and plan-order
outcomes; review follow-up adds adapter-thrown `ENOENT` and `EACCES` cases.

- [x] **Step 2: Run the inspector test and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- animation-audit.test.ts
```

Expected: FAIL because `animation-audit.ts` does not exist.

Verification note: `rtk pnpm --filter @lpc-toolkit/cli test -- animation-audit.test.ts`
was observed FAIL before the original implementation because the module did not
exist; the review follow-up was observed FAIL for the new `ENOENT` missing-file
and `EACCES` asset-read expectations.

- [x] **Step 3: Define report types and bounded inspection options**

Use these report shapes in `animation-audit.ts`:

```ts
export interface MissingAnimationFileFinding {
  readonly path: string;
  readonly animation: AnimationName;
  readonly sourceAnimation: AnimationName;
  readonly consumers: readonly AnimationAuditConsumer[];
}

export interface BlankAnimationFrame {
  readonly sourceColumn: number;
  readonly logicalFrameIndices: readonly number[];
}

export interface BlankAnimationFramesFinding {
  readonly path: string;
  readonly animation: AnimationName;
  readonly sourceAnimation: AnimationName;
  readonly sourceRow: number;
  readonly direction?: Direction;
  readonly frames: readonly BlankAnimationFrame[];
  readonly consumers: readonly AnimationAuditConsumer[];
}

export interface AnimationAuditInspectionError {
  readonly kind:
    | 'asset_read_failed'
    | 'image_decode_failed'
    | 'path_resolution_requires_selection';
  readonly message: string;
  readonly path?: string;
  readonly consumers: readonly AnimationAuditConsumer[];
}

export interface AssetAnimationAuditReport {
  readonly targets: readonly AnimationName[];
  readonly scope: { readonly typeName?: TypeName; readonly bodyType?: BodyType };
  readonly summary: {
    readonly itemsScanned: number;
    readonly incompleteItems: number;
    readonly unsupported: number;
    readonly missingFiles: number;
    readonly blankFrames: number;
    readonly errors: number;
  };
  readonly unsupported: readonly UnsupportedAnimationFinding[];
  readonly missingFiles: readonly MissingAnimationFileFinding[];
  readonly blankFrames: readonly BlankAnimationFramesFinding[];
  readonly errors: readonly AnimationAuditInspectionError[];
}

export interface InspectAssetAnimationPlanOptions {
  readonly store: AssetStore;
  readonly adapter: CanvasAdapter;
  readonly scope?: { readonly typeName?: TypeName; readonly bodyType?: BodyType };
  readonly concurrency?: number;
}
```

Implementation note: Defined immutable report finding/error/summary types and
the injected store, canvas-adapter, scope, and bounded-concurrency options.

- [x] **Step 4: Implement cell scanning and concurrency**

Join a logical path to a store source with:

```ts
function storeSource(store: AssetStore, logicalPath: string): string {
  return `${store.baseUrl.replace(/\/$/u, '')}/${logicalPath}`;
}
```

For each present asset, call `adapter.loadImage(storeSource(...))`, draw it once to a same-size canvas, and call `getImageData` only for planned cells. A cell is blank when every alpha byte is zero. If a requested cell lies outside the decoded image, record it as blank because the physical sprite cannot supply that referenced frame. Classify an `AssetStoreError` thrown during loading as `asset_read_failed`; classify another image-load or decode exception as `image_decode_failed`.

Implement a local ordered worker pool that launches at most `options.concurrency ?? 4` workers over indexed assets. Store each result by input index, then flatten in index order. Do not use `Promise.all(plan.assets.map(...))`.

Map each `plan.errors` record into report `errors` with `consumers: [error.consumer]`, compute missing/blank/decode findings, and derive `incompleteItems` from distinct item IDs appearing in unsupported findings or consumers of missing/blank findings. Do not count inspection errors as proven incomplete items.

Implementation note: Implemented path-grouped inspection, referenced-cell alpha
scanning, stable output restoration, and filesystem-aware load classification;
directory-store and Node-canvas boundaries now retain `ENOENT`/filesystem codes
so missing files remain findings and read failures are not decode failures.
The final review correction makes directory `has()` suppress only verified
`ENOENT`, routes other preflight filesystem failures into the inspector, and
recognizes all non-`ERR_*` `E...` system codes as asset-read failures.

- [x] **Step 5: Run inspector tests and verify GREEN**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- animation-audit.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS, including the maximum-concurrency assertion.

Verification note:

- `rtk pnpm --filter @lpc-toolkit/cli test -- animation-audit.test.ts` PASS
  (original GREEN: 4 tests; review follow-up: 6 tests).
- `rtk pnpm --filter @lpc-toolkit/cli test -- asset-store.test.ts` PASS
  (9 tests plus one platform skip; verifies directory adapter preserves
  load-time `ENOENT`).
- `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
- Final review correction: `rtk pnpm --filter @lpc-toolkit/cli test -- animation-audit.test.ts asset-store.test.ts`
  PASS (18 tests, one existing platform skip); `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.

- [x] **Step 6: Commit the inspector**

```sh
rtk git add packages/cli/src/animation-audit.ts packages/cli/test/animation-audit.test.ts
rtk git commit -m "feat(cli): inspect animation audit assets"
rtk git rev-parse HEAD
```

Commit note:

- Original inspector: `faa676e359a2300db772b229962f7b3eb1bd48f5`
  (`feat(cli): inspect animation audit assets`).
- Review correction: `a667a4fd5878c239533f69489799c84642e42ddc`
  (`fix(cli): classify animation audit read failures`).
- Final preflight correction: `c5046f7c9bd615180d4ebb35fea290e3932da2a4`
  (`fix(cli): preserve animation audit preflight errors`).

- [x] **Step 7: Record Task 3 evidence in this plan**

Record implementation, full product commit hash, and both PASS commands, then commit the plan update:

```sh
rtk git add docs/superpowers/plans/2026-07-17-cli-animation-asset-audit.md
rtk git commit -m "docs(plan): record CLI animation inspection"
```

Plan-record commit: `c4c4cdcb27dbc15e2634545e7745dcb7fa50826c`
(`docs(plan): record CLI animation inspection`).

Implementation note: Added the CLI-only asynchronous inspector with injected
asset-store/canvas seams, per-path read/decode failures as successful report
data, referenced-cell alpha scanning, and path-grouped bounded loading that
preserves plan-order findings.

Commit: `faa676e359a2300db772b229962f7b3eb1bd48f5`

Verification:

- `rtk pnpm --filter @lpc-toolkit/cli test -- animation-audit.test.ts` PASS
  (RED before implementation: FAIL because `animation-audit.ts` did not exist;
  GREEN: 4 tests passed, including bounded concurrency and shared-path loading).
- `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS

Review-fix verification:

- `rtk pnpm --filter @lpc-toolkit/cli test -- animation-audit.test.ts asset-store.test.ts` PASS
  (15 tests, one existing platform skip).
- `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.

Final preflight-fix verification:

- RED: `rtk pnpm --filter @lpc-toolkit/cli test -- animation-audit.test.ts asset-store.test.ts`
  FAIL (preflight `EACCES` escaped, directory `ELOOP` was suppressed, and
  `EOVERFLOW` was labeled `image_decode_failed`).
- GREEN: `rtk pnpm --filter @lpc-toolkit/cli test -- animation-audit.test.ts asset-store.test.ts`
  PASS (18 tests, one existing platform skip).
- `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.

CLI documentation impact reassessment for Task 3:

```text
help: N/A — no command is wired until Task 4
cli-readme: N/A — no public command contract exists yet
root-readme: N/A — no primary workflow changes
landing: N/A — no landing-page workflow changes
architecture: N/A — established Core-plan/CLI-runtime boundary is preserved
engineering: N/A — verification and CI commands are unchanged
releasing: N/A — package and publication flows are unchanged
plugin: N/A — plugin behavior is unchanged
```

---

### Task 4: Wire the audit command and JSON contract

**Files:**
- Modify: `packages/cli/src/animation-audit.ts`
- Modify: `packages/cli/src/command-spec.ts`
- Modify: `packages/cli/src/main.ts`
- Modify: `packages/cli/test/animation-audit.test.ts`
- Modify: `packages/cli/test/command-spec.test.ts`
- Modify: `packages/cli/test/main-assets.test.ts`
- Modify: `packages/cli/test/main-json.test.ts`

**Interfaces:**
- Consumes: Task 2's planner, Task 3's inspector, existing catalog/palette loaders, `flagString`, `flagStrings`, `commandOk`, and `commandError`.
- Produces: `runAnimationAuditCommand(parsed, runtime)` and public `catalog audit-animations` JSON behavior.
- Preserves: synchronous `runCatalogCommand` for `types`, `items`, and `item`.

- [x] **Step 1: Write failing help, preflight, and JSON tests**
  - Added focused help, repeatable-target, no-asset preflight, validation, JSON-envelope, and custom-definition-overlay coverage.

Add command-spec assertions:

```ts
it('documents animation audit options without discovery pagination', () => {
  const help = helpForCommand(['catalog', 'audit-animations']);
  expect(help).toContain('lpc-toolkit catalog audit-animations --animation <name>');
  expect(help).toContain('--animation <name>');
  expect(help).toContain('--type <typeName>');
  expect(help).toContain('--body-type <type>');
  expect(help).not.toContain('--limit');
  expect(help).not.toContain('--all');
});
```

Add a `main-assets.test.ts` case proving `catalog audit-animations --json` returns `missing_argument` without calling `prepareRuntimeAssets`. Add a command-spec case proving repeated `--animation walk --animation run` is accepted.

Add a `main-json.test.ts` fixture with one unsupported item and assert:

```ts
expect(JSON.parse(stdout.join(''))).toMatchObject({
  ok: true,
  command: 'catalog audit-animations',
  data: {
    targets: ['walk', 'run'],
    summary: { itemsScanned: 1, incompleteItems: 1, unsupported: 1 },
    unsupported: [{ itemId: 'braid', animation: 'run' }],
  },
  errors: [],
});
expect(code).toBe(0);
```

Also test unknown animation suggestions, unknown type, invalid body type, and base definition overridden by a matching `assets_custom/sheet_definitions` record.

- [x] **Step 2: Run command tests and verify RED**
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts main-assets.test.ts main-json.test.ts animation-audit.test.ts` FAIL as expected (9 missing-command/runner assertions).

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts main-assets.test.ts main-json.test.ts animation-audit.test.ts
```

Expected: FAIL because the command spec, dispatch, preflight, and runner are absent.

- [x] **Step 3: Add the command specification**
  - Added the repeatable `--animation` command contract and catalog-group example without discovery pagination options.

Add this `COMMAND_SPECS` entry and include the command in catalog-group examples:

```ts
{
  command: ['catalog', 'audit-animations'],
  usage: 'lpc-toolkit catalog audit-animations --animation <name> [options]',
  description: 'Audit selected standard animations and report drawing work.',
  options: [
    HELP_OPTION,
    JSON_OPTION,
    {
      name: 'animation',
      kind: 'repeatable',
      valueLabel: 'name',
      description: 'Audit a standard animation; may be repeated.',
    },
    { name: 'type', kind: 'value', valueLabel: 'typeName', description: 'Filter by item type.' },
    { name: 'body-type', kind: 'value', valueLabel: 'type', description: 'Filter by body type.' },
  ],
  examples: [
    'lpc-toolkit catalog audit-animations --animation walk --animation run --json',
  ],
},
```

- [x] **Step 4: Implement validation and the async runner**
  - Added bounded deterministic input diagnostics and an async runner using merged base/custom definitions, palette loading, the active runtime `AssetStore`, and the Node canvas adapter.

In `animation-audit.ts`, validate targets against `ANIMATIONS.map(({ value }) => value)`, type against `catalog.typeNames`, and body type against `BODY_TYPES`. Return the established codes `unknown_animation`, `unknown_type_name`, and `body_type_invalid`, with at most ten sorted `available` values and five edit-distance `suggestions`.

Implement the runner in this order:

```ts
export async function runAnimationAuditCommand(
  parsed: ParsedArgs,
  runtime: RuntimeAssets,
): Promise<CliResponse<AssetAnimationAuditReport>> {
  const targets = flagStrings(parsed.flags, 'animation');
  const typeName = flagString(parsed.flags, 'type');
  const bodyType = flagString(parsed.flags, 'body-type');
  const loaded = loadCatalogFromRoots(
    runtime.context.sheetDefinitionsRoot,
    runtime.context.customSheetDefinitionsRoot,
  );
  const palettes = loadPalettesFromRoot(runtime.context.paletteDefinitionsRoot);
  const issue = auditInputIssue(loaded.catalog, { targets, typeName, bodyType });
  if (issue) {
    return commandError('catalog audit-animations', issue, [
      ...loaded.warnings,
      ...palettes.warnings,
    ]);
  }
  const plan = planAssetAnimationAudit({
    catalog: loaded.catalog,
    palettes: palettes.palettes,
    targets,
    ...(typeName ? { typeName } : {}),
    ...(bodyType ? { bodyType } : {}),
  });
  const report = await inspectAssetAnimationPlan(plan, {
    store: runtime.store,
    adapter: createNodeCanvasAdapter({ assetStore: runtime.store }),
    scope: {
      ...(typeName ? { typeName } : {}),
      ...(bodyType ? { bodyType } : {}),
    },
  });
  return commandOk('catalog audit-animations', report, [
    ...loaded.warnings,
    ...palettes.warnings,
  ]);
}
```

Wrap the body in `try/catch`. The catch must return a failed response rather than throw through `runCli`:

```ts
return commandError('catalog audit-animations', {
  code: 'animation_audit_failed',
  message: error instanceof Error ? error.message : 'Animation audit failed.',
});
```

- [x] **Step 5: Add preflight and dispatch without making existing catalog commands async**
  - Missing `--animation` now fails before asset preparation; only `catalog audit-animations` uses the async runner.

In `preflightAssetCommand`, accept `audit-animations` as a known catalog subcommand and add:

```ts
if (
  command === 'catalog'
  && subcommand === 'audit-animations'
  && flagStrings(parsed.flags, 'animation').length === 0
) {
  return commandError('catalog audit-animations', {
    code: 'missing_argument',
    message: '--animation is required and may be repeated.',
    path: '--animation',
  });
}
```

In the catalog dispatch block, select only the new async runner:

```ts
const response = parsed.command[1] === 'audit-animations'
  ? await runAnimationAuditCommand(parsed, runtime!)
  : runCatalogCommand(parsed, runtime!);
return writeResponse(response, parsed, io, 'Catalog command completed.\n');
```

- [x] **Step 6: Run command tests and verify GREEN**
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts main-assets.test.ts main-json.test.ts animation-audit.test.ts catalog-commands.test.ts` PASS (119 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts main-assets.test.ts main-json.test.ts animation-audit.test.ts catalog-commands.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS; findings return code `0`, invalid input returns code `1`, and existing catalog tests remain green.

- [x] **Step 7: Commit command wiring**
  - Commit: `f7fb847f6321caeaefcd9d636ef0b058d10158d0` — `feat(cli): add animation asset audit command`.

```sh
rtk git add packages/cli/src/animation-audit.ts packages/cli/src/command-spec.ts packages/cli/src/main.ts packages/cli/test/animation-audit.test.ts packages/cli/test/command-spec.test.ts packages/cli/test/main-assets.test.ts packages/cli/test/main-json.test.ts
rtk git commit -m "feat(cli): add animation asset audit command"
rtk git rev-parse HEAD
```

- [x] **Step 8: Record Task 4 evidence in this plan**
  - Recorded the full product commit and exact RED/GREEN verification evidence.
  - CLI documentation impact reassessment: help: update; cli-readme: N/A — Task 5 owns the public command documentation; root-readme: N/A — specialized audit is not a primary quick start; landing: N/A — no landing workflow; architecture: N/A — boundaries unchanged; engineering: N/A — commands and CI unchanged; releasing: N/A — release flow unchanged; plugin: N/A — plugin workflow unchanged.

Record implementation, full commit hash, and both PASS commands, then:

```sh
rtk git add docs/superpowers/plans/2026-07-17-cli-animation-asset-audit.md
rtk git commit -m "docs(plan): record animation audit command"
```

#### Task 4 review follow-up

Two parser/validation findings were corrected after review.

- RED: `rtk pnpm --filter @lpc-toolkit/cli test -- main-assets.test.ts main-json.test.ts` FAIL — explicit empty filters returned `invalid_option` instead of their domain errors, and leading/trailing valueless repeated `--animation` occurrences reached asset preparation.
- GREEN: `rtk pnpm --filter @lpc-toolkit/cli test -- main-assets.test.ts main-json.test.ts command-spec.test.ts animation-audit.test.ts catalog-commands.test.ts` PASS (123 tests).
- GREEN: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
- Commit: `6953b5c6e111716b3601045ab201ae9c1ff1d783` — `fix(cli): validate empty and repeated audit options`.
- The parser now preserves valueless repeated occurrences for option validation, and explicit empty `--type`/`--body-type` values are forwarded to the required domain checks.

#### Task 4 review follow-up 2

The audit empty-value parser support was contained after it regressed existing catalog discovery parsing.

- RED: `rtk pnpm --filter @lpc-toolkit/cli test -- main-assets.test.ts` FAIL — `catalog items --type "" --json` returned an unfiltered success instead of rejecting the valueless option before asset preparation.
- GREEN: `rtk pnpm --filter @lpc-toolkit/cli test -- args.test.ts catalog-commands.test.ts command-spec.test.ts animation-audit.test.ts main-assets.test.ts main-json.test.ts` PASS (129 tests).
- GREEN: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
- Commit: `fbf91dca7a3ff7132378dcf1f426d8e2bfef9d30` — `fix(cli): preserve catalog empty option handling`.
- Explicit empty string values are now accepted only while parsing `catalog audit-animations`; all existing catalog commands retain their prior valueless-option rejection.

---

### Task 5: Add the human worklist and public CLI documentation

**Files:**
- Modify: `packages/cli/src/response.ts`
- Modify: `packages/cli/test/main-human.test.ts`
- Modify: `packages/cli/README.md`

**Interfaces:**
- Consumes: Task 4's stable report JSON fields.
- Produces: item-grouped human output with summary, expected paths, blank cells, manual-review reasons, and inspection errors.
- Documents: successful findings, filters, read-only behavior, and no-pagination contract.

- [x] **Step 1: Write failing human-output tests**

  - Added deterministic CLI fixtures for unsupported paths, blank referenced cells, manual-review requirements, and PNG decode failures.

Add one fixture that yields unsupported and blank findings and one with a decode error. Assert exact stable labels rather than the fallback success text:

```ts
expect(output).toContain('Animation audit: walk, run');
expect(output).toContain('Scanned: 2 items');
expect(output).toContain('Incomplete: 2 items');
expect(output).toContain('hair_braid');
expect(output).toContain('unsupported: run');
expect(output).toContain('expected: spritesheets/hair/braid/run/brown.png');
expect(output).toContain('layer: layer_1');
expect(output).toContain('body types: male');
expect(output).toContain('walk/down: source column 3');
```

Add assertions that a manual-review finding prints its reason and omits `expected:`, while decode failures print under `Inspection errors` after drawing findings.

- [x] **Step 2: Run the human test and verify RED**

  - RED: `rtk pnpm --filter @lpc-toolkit/cli test -- main-human.test.ts` FAIL — the new cases received `Catalog command completed.` because no audit human formatter existed.

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- main-human.test.ts
```

Expected: FAIL because `formatHumanData` has no `catalog audit-animations` formatter.

- [x] **Step 3: Implement deterministic human formatting**

  - Added safe report parsing and ordered worklist output for unsupported paths/manual review, missing files, blank cells, and inspection errors without changing JSON responses or exit behavior.

Add `formatAnimationAudit(data: JsonRecord): string | undefined` to `response.ts`. Parse `targets`, `summary`, `unsupported`, `missingFiles`, `blankFrames`, and `errors` with existing safe record helpers. Return `undefined` if required summary fields are malformed.

Build output in this order:

1. `Animation audit: ...`, `Scanned: ... items`, `Incomplete: ... items`.
2. Unsupported findings grouped in their existing deterministic order, including each requirement's path or manual-review reason, layer, body types, variant, and derived recolors.
3. Missing files with consumer context.
4. Blank rows with direction when present, source columns, and logical frame indices.
5. `Inspection errors (N)` after all drawing findings.

Add the switch case:

```ts
case 'catalog audit-animations':
  return formatAnimationAudit(data);
```

- [x] **Step 4: Document the public command**

  - Documented the repeatable scope flags, complete unpaginated report, category meanings, successful findings, recolor dependents, and read-only runtime-store/overlay behavior.

Add an `Animation asset audit` subsection near catalog discovery in `packages/cli/README.md` containing:

```sh
lpc-toolkit catalog audit-animations \
  --animation walk \
  --animation run \
  --type weapon \
  --body-type male \
  --json
```

State explicitly:

- at least one repeatable standard animation is required;
- the report is complete and unpaginated for the chosen scope;
- `unsupported`, `missingFiles`, `blankFrames`, and `errors` have distinct meanings;
- findings exit successfully, while invalid input or fatal asset preparation fails;
- runtime recolors are dependents, not extra PNG files;
- the command reads the current runtime store and catalog definition overlay and writes nothing.

- [x] **Step 5: Run human and documentation-adjacent tests and verify GREEN**

  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- main-human.test.ts command-spec.test.ts main-json.test.ts` PASS (49 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- main-human.test.ts command-spec.test.ts main-json.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: PASS with stable human labels and unchanged existing formatters.

- [x] **Step 6: Commit human output and docs**

  - Commit: `b1cf6f39c923d1ce0d99f0fd3ca2161c0bbc4298` — `feat(cli): format animation audit reports`.

```sh
rtk git add packages/cli/src/response.ts packages/cli/test/main-human.test.ts packages/cli/README.md
rtk git commit -m "feat(cli): format animation audit reports"
rtk git rev-parse HEAD
```

- [x] **Step 7: Record Task 5 evidence in this plan**

  - CLI documentation impact reassessment: help: N/A — Task 4 already updated the owned command help; cli-readme: update; root-readme: N/A — specialized asset-authoring audit is not a primary quick start; landing: N/A — no landing-page workflow change; architecture: N/A — existing Core planning and CLI runtime boundaries remain unchanged; engineering: N/A — repository verification and CI commands do not change; releasing: N/A — no package or publication workflow change; plugin: N/A — character-authoring plugin does not perform asset production audits.

#### Task 5 review follow-up — singular summary grammar

- RED: `rtk pnpm --filter @lpc-toolkit/cli test -- main-human.test.ts` FAIL — the new one-item assertion received `Scanned: 1 items` and `Incomplete: 1 items`.
- GREEN: `rtk pnpm --filter @lpc-toolkit/cli test -- main-human.test.ts` PASS (19 tests).
- GREEN: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
- Commit: `e7e63fed9f1f7f5cfdcebfa44575c60e4b00e7da` — `fix(cli): singular audit summary labels`.

Record implementation, full commit hash, and both PASS commands, then:

```sh
rtk git add docs/superpowers/plans/2026-07-17-cli-animation-asset-audit.md
rtk git commit -m "docs(plan): record animation audit output"
```

---

### Task 6: Reassess documentation impact and run the complete verification gates

**Files:**
- Modify if evidence changes: `docs/superpowers/plans/2026-07-17-cli-animation-asset-audit.md`
- Reassess only: `README.md`
- Reassess only: `packages/web/src/components/landing-page.tsx`
- Reassess only: `docs/ARCHITECTURE.md`
- Reassess only: `docs/ENGINEERING.md`
- Reassess only: `docs/RELEASING.md`
- Reassess only: `plugins/lpc-toolkit/skills/**`

**Interfaces:**
- Consumes: all previous task commits.
- Produces: verified package output, an accurate final documentation-impact matrix, and complete plan evidence.

- [x] **Step 1: Reassess all eight CLI documentation surfaces**

Compare the implementation diff with the matrix near the top of this plan. Keep the planned result only if each statement remains true:

```text
help: update
cli-readme: update
root-readme: N/A — specialized asset-authoring audit, not a primary quick start
landing: N/A — no landing-page workflow change
architecture: N/A — existing Core planning and CLI filesystem boundaries remain unchanged
engineering: N/A — repository verification and CI commands do not change
releasing: N/A — no package or publication workflow change
plugin: N/A — character-authoring plugin does not perform asset production audits
```

If a surface's owned contract changed, update that document, change its matrix entry to `update`, and include its token in `CLI docs surfaces`.

- [x] **Step 2: Run focused package verification**

```sh
rtk pnpm --filter @lpc-toolkit/core run typecheck
rtk pnpm --filter @lpc-toolkit/core test
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm --filter @lpc-toolkit/cli build
rtk pnpm --filter @lpc-toolkit/cli test:package
rtk pnpm check:boundaries
```

Expected: every command exits `0`. The package smoke must recognize the new help entry without requiring network access or an initialized `upstream/` gitlink.

- [x] **Step 3: Run the repository handoff gate**

```sh
rtk pnpm verify
```

Expected: PASS across asset preparation, source-pin verification, boundaries, CLI docs policy, plugin verification, workspace typechecks, and all unit tests.

- [x] **Step 4: Review the final diff for scope and safety**

```sh
rtk git status --short
rtk git diff --stat HEAD~10..HEAD
rtk git log --oneline -12
```

Expected: only the planned Core, CLI, tests, CLI README, design spec, and plan records appear; no asset PNG, dependency, lockfile, `upstream/`, root README, landing, release, or plugin changes appear unless Task 6 explicitly reclassified and documented them.

- [x] **Step 5: Record final verification evidence**

Update this task with the final documentation matrix, exact PASS commands, and any justified surface reclassification. Commit the plan record:

```sh
rtk git add docs/superpowers/plans/2026-07-17-cli-animation-asset-audit.md
rtk git commit -m "docs(plan): record animation audit verification"
rtk git rev-parse HEAD
```

Expected: commit succeeds, and the plan contains no unchecked implementation or verification step.

#### Task 6 final documentation-impact matrix

```text
help: update — `packages/cli/src/command-spec.ts` adds `catalog audit-animations` help, options, and examples.
cli-readme: update — `packages/cli/README.md` documents usage, scope, findings, exit behavior, and read-only behavior.
root-readme: N/A — specialized asset-authoring audit is not a primary quick start.
landing: N/A — no landing-page workflow change.
architecture: N/A — existing Core planning and CLI filesystem/runtime boundaries remain unchanged.
engineering: N/A — repository verification and CI commands do not change.
releasing: N/A — no package or publication workflow change.
plugin: N/A — the character-authoring plugin does not perform asset production audits.
```

CLI docs impact: updated

CLI docs surfaces: help, cli-readme

Final scope inspection: `rtk git diff --name-only dafe79744fa2446a87ff1e27c3a07a742704718d^..HEAD` showed only the planned Core/CLI implementation and tests, CLI README, and plan records. It showed no root README, landing page, architecture, engineering, releasing, plugin, asset, lockfile, dependency, or `upstream/` changes. `rtk git diff --check dafe79744fa2446a87ff1e27c3a07a742704718d^..HEAD` PASS.

Verification:

- `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS.
- `rtk pnpm --filter @lpc-toolkit/core test` PASS (17 files, 184 tests).
- `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
- `rtk pnpm --filter @lpc-toolkit/cli test` PASS outside the sandbox (33 files, 384 tests passed, 1 skipped). The initial sandboxed invocation failed only with the known `listen EPERM` restriction in loopback web-server tests; no product failure was found.
- `rtk pnpm --filter @lpc-toolkit/cli build` PASS.
- `rtk pnpm --filter @lpc-toolkit/cli test:package` PASS outside the sandbox; the packed install smoke printed `Packed CLI install smoke test passed.` The sandboxed attempt was stopped after it stalled at the script's loopback/cache stage.
- `rtk pnpm check:boundaries` PASS.
- `rtk pnpm verify` PASS outside the sandbox: asset preparation, source-pin verification, boundaries, CLI docs policy, plugin verification, workspace typechecks, and all workspace tests passed.
- `rtk git status --short`, `rtk git diff --stat HEAD~10..HEAD`, and `rtk git log --oneline -12` reviewed before this plan-record commit; the worktree was clean and the committed range contained only planned changes.

#### Task 6 durable verification transcript (review follow-up)

Fresh execution completed at `2026-07-17T11:02:29Z`. Each command below exited `0`; the command output was inspected at execution and the concise result is retained here instead of committing bulky raw test logs.

```text
$ rtk pnpm --filter @lpc-toolkit/core run typecheck
exit=0; tsc -p tsconfig.json --noEmit

$ rtk pnpm --filter @lpc-toolkit/core test
exit=0; Test Files 17 passed; Tests 184 passed

$ rtk pnpm --filter @lpc-toolkit/cli run typecheck
exit=0; tsc -p tsconfig.json --noEmit

$ rtk pnpm --filter @lpc-toolkit/cli test       # elevated loopback IPC
exit=0; Test Files 33 passed; Tests 384 passed, 1 skipped

$ rtk pnpm --filter @lpc-toolkit/cli build
exit=0; core, presets, embedded web, and CLI build completed

$ rtk pnpm --filter @lpc-toolkit/cli test:package  # elevated loopback IPC
exit=0; local tarball installed; "Packed CLI install smoke test passed."

$ rtk node packages/cli/dist/index.js catalog --help
exit=0; output includes "lpc-toolkit catalog audit-animations --animation <name> [options]"

$ rtk git submodule status upstream
exit=0; output "-212abfd21493e9957bd556250ac538fa40fe1fc9 upstream" (leading '-' confirms uninitialized)

$ rtk pnpm check:boundaries
exit=0; "Architecture boundary check passed."

$ rtk pnpm verify                              # elevated loopback IPC
exit=0; cache-hit preparation, source-pin verification, boundaries, CLI docs policy,
        plugin verification, workspace typechecks, and recursive tests completed

$ rtk git status --short
exit=0; output <empty>

$ rtk git diff --stat HEAD~10..HEAD && rtk git log --oneline -12 && rtk git diff --check HEAD~10..HEAD
exit=0; planned range only; diff check output <empty>
```

The elevated CLI gates are intentional: their local web-server checks need loopback IPC. The direct built-CLI help check is asset-free and passed while the optional `upstream/` gitlink remained uninitialized; together with the successful packed-local-install smoke, this verifies the requested help behavior without initializing `upstream/`.

#### Task 6 Step 5 commit evidence (review follow-up)

The initial Task 6 plan-record command sequence completed successfully:

```text
$ rtk git add docs/superpowers/plans/2026-07-17-cli-animation-asset-audit.md
exit=0
$ rtk git commit -m "docs(plan): record animation audit verification"
exit=0; 1 file changed, 36 insertions(+), 5 deletions(-)
$ rtk git rev-parse HEAD
exit=0; 8a62e08454a44838e9822b1e8b354649c811227b
$ rtk git status --short
exit=0; output <empty>
```

`8a62e08454a44838e9822b1e8b354649c811227b` is the prior Task 6 plan-record commit. This follow-up plan-record commit deliberately records that hash, resolving the self-reference limitation of the initial commit.

---

## Final-review fixes — 2026-07-17

- [x] **Fix both Important final-review findings**
  - Implementation: Core now resolves every custom source compatible with a logical target, preserves the legacy single-source helper for existing consumers, and expands one physical requirement per matching source geometry. `backslash` explicitly supplies `1h_slash` and `1h_backslash`; `halfslash` supplies `1h_halfslash`. Virtual animation compatibility remains unchanged.
  - Regression coverage: Core uses active longsword and arming-sword shapes; CLI inspection verifies missing reverse-slash longsword PNGs are reported.
  - Product commit: `32ea2722a57c3463bb3c59e2d64745ec8416ace1` — `fix(core): audit every compatible animation source`.
  - TDD RED: `rtk pnpm --filter @lpc-toolkit/core test -- asset-animation-audit.test.ts` FAIL (two new cases: reverse-slash sources omitted; one-handed aliases unsupported).
  - TDD RED: `rtk pnpm --filter @lpc-toolkit/cli test -- animation-audit.test.ts` FAIL (reverse-slash PNGs omitted from missing-file findings).
  - GREEN: `rtk pnpm --filter @lpc-toolkit/core test -- asset-animation-audit.test.ts animation-capabilities.test.ts` PASS (14 tests).
  - GREEN: `rtk pnpm --filter @lpc-toolkit/cli test -- animation-audit.test.ts catalog-commands.test.ts catalog-discovery.test.ts` PASS (40 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/core test` PASS (17 files, 186 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test` PASS outside the sandbox for loopback web-server tests (33 files, 385 tests passed, 1 skipped).
  - Verification: `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS.
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
  - Verification: `rtk pnpm check:boundaries` PASS.
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test:package` PASS outside the sandbox; packed install smoke passed.
  - Verification: `rtk pnpm verify` PASS outside the sandbox; full asset, pin, boundary, plugin, typecheck, and recursive-test gate completed.

### Final-review-fix documentation impact

```text
help: N/A — existing command help and option contract are unchanged.
cli-readme: N/A — existing command documentation remains accurate.
root-readme: N/A — no primary workflow change.
landing: N/A — no landing-page workflow change.
architecture: N/A — Core remains pure and package boundaries are unchanged.
engineering: N/A — verification and CI commands are unchanged.
releasing: N/A — package and publication workflows are unchanged.
plugin: N/A — plugin behavior and contracts are unchanged.
```

---

## Final-review follow-up — coexisting native and custom sources

- [x] **Audit native and compatible custom layers together**
  - Implementation: unsupported capability classification remains `!native && compatibleSources.length === 0`; physical planning now adds ordinary native layers and every compatible custom source independently. This matches active composition without altering composition behavior or asset-key deduplication.
  - Regression coverage: an active normal-bow-shaped fixture declares native `walk` plus `walk_128` background/foreground layers and asserts exactly four distinct planned PNGs.
  - Product commit: `227cb4be2c69dcd22ed790d8fa227114226c6e43` — `fix(core): audit native and custom animation layers`.
  - TDD RED: `rtk pnpm --filter @lpc-toolkit/core test -- asset-animation-audit.test.ts` FAIL (the two `walk_128` bow PNGs were omitted).
  - GREEN: `rtk pnpm --filter @lpc-toolkit/core test -- asset-animation-audit.test.ts` PASS (11 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- animation-audit.test.ts catalog-commands.test.ts catalog-discovery.test.ts` PASS (40 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS.
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
  - Verification: `rtk pnpm check:boundaries` PASS.
  - Verification: `rtk pnpm --filter @lpc-toolkit/core test` PASS (17 files, 187 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test` PASS outside the sandbox for loopback web-server tests (33 files, 385 tests passed, 1 skipped).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test:package` PASS outside the sandbox; packed install smoke passed.
  - Verification: `rtk pnpm verify` PASS outside the sandbox; full asset, pin, boundary, plugin, typecheck, and recursive-test gate completed.
  - Documentation impact: N/A — no public CLI command, output, help, README, package, architecture, engineering, release, landing, or plugin contract changed.
