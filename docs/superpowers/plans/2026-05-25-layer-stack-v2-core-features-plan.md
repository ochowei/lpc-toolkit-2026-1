# Layer Stack v2 Core Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ⌘K AdvancedPalette, real item thumbnails, and AddLayer 5 super-group restructure to v2 web UI(`packages/web/src/components/layer-stack/`).

**Architecture:** Three new web-side modules + four file modifications, no `packages/core/` changes. Thumbnails reuse `composeSelections` pipeline with a module-level LRU cache. AdvancedPalette is an absolute-positioned modal mounted in the harness root (no portal). AddLayer展開態改成依 5 super-group 顯示純文字 pills。

**Tech Stack:** TypeScript strict, React 18, Tailwind, Vitest, pnpm.

**Reference spec:** `docs/superpowers/specs/2026-05-25-layer-stack-v2-core-features-design.md`

---

## File Structure

**Create:**
- `packages/web/src/slice/category-groups.ts` — 5 super-group taxonomy
- `packages/web/src/hooks/thumbnail-cache.ts` — module-level LRU cache (extracted for testability)
- `packages/web/src/hooks/use-item-thumbnail.ts` — async thumbnail compose hook
- `packages/web/src/components/layer-stack/item-thumbnail.tsx` — thin component wrapping the hook
- `packages/web/src/components/layer-stack/palette-search.ts` — pure filter/rank helper
- `packages/web/src/components/layer-stack/palette-trigger.tsx` — top-bar search button
- `packages/web/src/components/layer-stack/advanced-palette.tsx` — modal
- `packages/web/test/category-groups.test.ts`
- `packages/web/test/thumbnail-cache.test.ts`
- `packages/web/test/palette-search.test.ts`

**Modify:**
- `packages/web/src/i18n.ts` — add palette/group keys
- `packages/web/src/components/layer-stack/layer-row.tsx` — replace placeholders with `<ItemThumbnail />`
- `packages/web/src/components/layer-stack/stack-panel.tsx` — thread `assetSource` to LayerRow
- `packages/web/src/components/layer-stack/add-layer.tsx` — 5-group restructure + ⌘K button
- `packages/web/src/components/layer-stack/harness.tsx` — paletteOpen state, global keydown, mount palette, insert PaletteTrigger

---

## Task 1: CATEGORY_GROUPS slice

**Files:**
- Create: `packages/web/src/slice/category-groups.ts`
- Test: `packages/web/test/category-groups.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/category-groups.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CATEGORY_GROUPS, groupForType, type GroupId } from '../src/slice/category-groups';

describe('CATEGORY_GROUPS', () => {
  it('has the five canonical super-groups', () => {
    const ids = CATEGORY_GROUPS.map((g) => g.id);
    expect(ids).toEqual(['body', 'face', 'clothing', 'accessories', 'weapons']);
  });

  it('every group has a non-empty typeNames list', () => {
    for (const g of CATEGORY_GROUPS) {
      expect(g.typeNames.length).toBeGreaterThan(0);
    }
  });

  it('no TypeName appears in more than one group', () => {
    const seen = new Map<string, GroupId>();
    for (const g of CATEGORY_GROUPS) {
      for (const tn of g.typeNames) {
        const prev = seen.get(tn);
        expect(prev, `${tn} appears in ${prev} and ${g.id}`).toBeUndefined();
        seen.set(tn, g.id);
      }
    }
  });
});

describe('groupForType', () => {
  it('returns body for body-part type names', () => {
    expect(groupForType('body')).toBe('body');
    expect(groupForType('head')).toBe('body');
    expect(groupForType('eyes')).toBe('body');
  });

  it('returns face for hair / facial / expression', () => {
    expect(groupForType('hair')).toBe('face');
    expect(groupForType('beard')).toBe('face');
    expect(groupForType('expression')).toBe('face');
  });

  it('returns clothing for torso/legs/feet/etc.', () => {
    expect(groupForType('torso')).toBe('clothing');
    expect(groupForType('legs')).toBe('clothing');
    expect(groupForType('feet')).toBe('clothing');
    expect(groupForType('clothes')).toBe('clothing');
  });

  it('returns accessories for cape/belt/etc.', () => {
    expect(groupForType('cape')).toBe('accessories');
    expect(groupForType('belt')).toBe('accessories');
    expect(groupForType('backpack')).toBe('accessories');
  });

  it('returns weapons for weapon/shield/ammo', () => {
    expect(groupForType('weapon')).toBe('weapons');
    expect(groupForType('shield')).toBe('weapons');
    expect(groupForType('ammo')).toBe('weapons');
  });

  it('returns null for unrecognized TypeName', () => {
    expect(groupForType('completely_made_up_type_xyz')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lpc-toolkit/web test category-groups`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `packages/web/src/slice/category-groups.ts`:

```ts
import type { TranslationKey } from '../i18n';
import type { TypeName } from '@lpc-toolkit/core';

export type GroupId = 'body' | 'face' | 'clothing' | 'accessories' | 'weapons';

export interface CategoryGroup {
  readonly id: GroupId;
  readonly labelKey: TranslationKey;
  readonly typeNames: readonly TypeName[];
}

/**
 * 5 super-groups consolidating the LPC catalog's many `type_name` values
 * into a smaller taxonomy for AddLayer + AdvancedPalette grouping.
 *
 * TypeNames not listed here return `null` from `groupForType` and are
 * hidden from grouped UI (AddLayer). They remain reachable via ⌘K search.
 */
export const CATEGORY_GROUPS: readonly CategoryGroup[] = [
  {
    id: 'body',
    labelKey: 'group.body',
    typeNames: ['body', 'head', 'eyes', 'eyebrows', 'nose', 'ears', 'ears_inner'],
  },
  {
    id: 'face',
    labelKey: 'group.face',
    typeNames: [
      'hair', 'hair_tie', 'beard', 'facial', 'expression', 'expression_crying',
      'bandana', 'bandana_overlay', 'earrings', 'earring_left', 'earring_right',
    ],
  },
  {
    id: 'clothing',
    labelKey: 'group.clothing',
    typeNames: [
      'torso', 'shoulders', 'arms', 'wrists', 'hands', 'legs', 'feet',
      'neck', 'clothes', 'dress', 'dress_sleeves', 'dress_sleeves_trim',
      'dress_trim', 'shoes', 'overalls', 'apron', 'armour', 'chainmail',
      'bracers', 'bauldron', 'hat', 'hat_secondary', 'hat_accessory_secondary',
    ],
  },
  {
    id: 'accessories',
    labelKey: 'group.accessories',
    typeNames: [
      'cape', 'cape_trim', 'belt', 'backpack', 'backpack_straps', 'quiver',
      'charm', 'accessory', 'buckles', 'leather_armor_belt', 'bandages', 'cargo',
    ],
  },
  {
    id: 'weapons',
    labelKey: 'group.weapons',
    typeNames: ['weapon', 'weapon_magic_crystal', 'shield', 'ammo'],
  },
];

const TYPE_TO_GROUP: ReadonlyMap<TypeName, GroupId> = new Map(
  CATEGORY_GROUPS.flatMap((g) => g.typeNames.map((tn) => [tn, g.id] as const)),
);

export function groupForType(typeName: TypeName): GroupId | null {
  return TYPE_TO_GROUP.get(typeName) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lpc-toolkit/web test category-groups`
Expected: PASS (all 9 tests green).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/slice/category-groups.ts packages/web/test/category-groups.test.ts
git commit -m "feat(web): add CATEGORY_GROUPS taxonomy for 5 super-groups

5-group consolidation (body/face/clothing/accessories/weapons) used
by AddLayer pills + AdvancedPalette grouping. TypeNames not in any
group return null from groupForType.
"
```

---

## Task 2: i18n new keys

**Files:**
- Modify: `packages/web/src/i18n.ts`

- [ ] **Step 1: Add new keys to `en` block**

In `packages/web/src/i18n.ts`, inside the `en:` object (after `'common.close': 'Close',` around line 91), insert:

```ts
    'palette.title': 'Search all assets…',
    'palette.placeholder': 'Search by name, category, author',
    'palette.no_match': 'No matches.',
    'palette.incompatible': 'incompatible',
    'group.body': 'Body & Skin',
    'group.face': 'Hair & Face',
    'group.clothing': 'Clothing',
    'group.accessories': 'Accessories',
    'group.weapons': 'Weapons',
```

- [ ] **Step 2: Add the same keys to `zh-TW` block**

In the same file, inside the `'zh-TW':` object (after `'common.close': '關閉',` around line 177), insert:

```ts
    'palette.title': '搜尋所有素材…',
    'palette.placeholder': '依名稱、分類、作者搜尋',
    'palette.no_match': '找不到符合的項目。',
    'palette.incompatible': '不相容',
    'group.body': '身體',
    'group.face': '髮型與臉部',
    'group.clothing': '服裝',
    'group.accessories': '配件',
    'group.weapons': '武器',
```

- [ ] **Step 3: Verify both blocks have identical key sets**

Run: `pnpm --filter @lpc-toolkit/web test i18n`
Expected: PASS. (Existing `i18n.test.ts` enforces key-set parity between locales.)

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/i18n.ts
git commit -m "feat(web): i18n keys for palette + 5 super-group labels"
```

---

## Task 3: thumbnail LRU cache module

**Files:**
- Create: `packages/web/src/hooks/thumbnail-cache.ts`
- Test: `packages/web/test/thumbnail-cache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/thumbnail-cache.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CACHE_MAX,
  cacheClear,
  cacheGet,
  cacheSet,
  makeCacheKey,
} from '../src/hooks/thumbnail-cache';

function fakeCanvas(label: string): HTMLCanvasElement {
  // Test-only stand-in; the cache treats the value opaquely.
  return { _label: label } as unknown as HTMLCanvasElement;
}

beforeEach(() => cacheClear());

describe('makeCacheKey', () => {
  it('produces stable identical keys for identical inputs', () => {
    const a = makeCacheKey({ bodyType: 'male', typeName: 'hair', name: 'Curly', size: 24 });
    const b = makeCacheKey({ bodyType: 'male', typeName: 'hair', name: 'Curly', size: 24 });
    expect(a).toBe(b);
  });

  it('differs when any input differs', () => {
    const base = { bodyType: 'male' as const, typeName: 'hair', name: 'Curly', size: 24 };
    expect(makeCacheKey({ ...base, name: 'Spiky' })).not.toBe(makeCacheKey(base));
    expect(makeCacheKey({ ...base, size: 28 })).not.toBe(makeCacheKey(base));
    expect(makeCacheKey({ ...base, variant: 'red' })).not.toBe(makeCacheKey(base));
    expect(makeCacheKey({ ...base, recolor: 'pal_a' })).not.toBe(makeCacheKey(base));
    expect(makeCacheKey({ ...base, bodyType: 'female' })).not.toBe(makeCacheKey(base));
  });
});

describe('LRU cache', () => {
  it('returns undefined on miss', () => {
    expect(cacheGet('missing')).toBeUndefined();
  });

  it('returns the cached canvas on hit', () => {
    const c = fakeCanvas('a');
    cacheSet('k', c);
    expect(cacheGet('k')).toBe(c);
  });

  it('evicts the oldest entry when capacity is exceeded', () => {
    for (let i = 0; i < CACHE_MAX + 5; i++) {
      cacheSet(`k${i}`, fakeCanvas(String(i)));
    }
    // First 5 keys should be evicted
    expect(cacheGet('k0')).toBeUndefined();
    expect(cacheGet('k4')).toBeUndefined();
    expect(cacheGet('k5')).not.toBeUndefined();
    expect(cacheGet(`k${CACHE_MAX + 4}`)).not.toBeUndefined();
  });

  it('promotes accessed keys to most-recent (LRU recency)', () => {
    for (let i = 0; i < CACHE_MAX; i++) {
      cacheSet(`k${i}`, fakeCanvas(String(i)));
    }
    // Touch k0 → becomes most recent
    cacheGet('k0');
    // Insert one more → should evict k1 (now oldest), not k0
    cacheSet('new', fakeCanvas('new'));
    expect(cacheGet('k0')).not.toBeUndefined();
    expect(cacheGet('k1')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lpc-toolkit/web test thumbnail-cache`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `packages/web/src/hooks/thumbnail-cache.ts`:

```ts
import type { BodyType, TypeName } from '@lpc-toolkit/core';

export const CACHE_MAX = 200;

export interface CacheKeyArgs {
  readonly bodyType: BodyType;
  readonly typeName: TypeName;
  readonly name: string;
  readonly size: number;
  readonly variant?: string;
  readonly recolor?: string;
}

export function makeCacheKey(args: CacheKeyArgs): string {
  return [
    args.bodyType,
    args.typeName,
    args.name,
    args.variant ?? '_',
    args.recolor ?? '_',
    args.size,
  ].join('|');
}

// JS Map preserves insertion order. To implement LRU we delete & re-insert
// on access so the touched key becomes "most recent" (last). On overflow
// we drop entries from the front (`keys().next().value`), which is the
// oldest insertion / least-recently-used entry.
const cache = new Map<string, HTMLCanvasElement>();

export function cacheGet(key: string): HTMLCanvasElement | undefined {
  const v = cache.get(key);
  if (v === undefined) return undefined;
  cache.delete(key);
  cache.set(key, v);
  return v;
}

export function cacheSet(key: string, canvas: HTMLCanvasElement): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, canvas);
  while (cache.size > CACHE_MAX) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

export function cacheClear(): void {
  cache.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lpc-toolkit/web test thumbnail-cache`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/thumbnail-cache.ts packages/web/test/thumbnail-cache.test.ts
git commit -m "feat(web): LRU thumbnail cache (200 entries, insertion-order LRU)"
```

---

## Task 4: useItemThumbnail hook

**Files:**
- Create: `packages/web/src/hooks/use-item-thumbnail.ts`

(No test — async / canvas-dependent hook follows project convention of UI-not-tested. Cache logic is covered by Task 3.)

- [ ] **Step 1: Write the hook**

Create `packages/web/src/hooks/use-item-thumbnail.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import {
  ANIMATION_CONFIGS,
  composeSelections,
  extractAnimation,
  makeResolvePalette,
  type BodyType,
  type Catalog,
  type Direction,
  type PaletteMetadata,
  type Selections,
  type TypeName,
} from '@lpc-toolkit/core';
import { createBrowserCanvasAdapter } from '../adapter/browser-canvas-adapter';
import type { AssetSource } from '../adapter/asset-source';
import { frameRect } from '../slice/frame-rect';
import { cacheGet, cacheSet, makeCacheKey } from './thumbnail-cache';

export interface UseItemThumbnailArgs {
  readonly typeName: TypeName;
  readonly name: string;
  readonly variant?: string;
  readonly recolor?: string;
  readonly bodyType: BodyType;
  readonly size: number;
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly assetSource: AssetSource;
}

export interface UseItemThumbnailResult {
  readonly canvas: HTMLCanvasElement | null;
  readonly status: 'loading' | 'ready' | 'error';
}

/**
 * Renders a single catalog item to a `size×size` offscreen canvas (first
 * frame of `walk` facing south) and caches by item identity. Reuses the
 * project's `composeSelections` pipeline — single-item Selections produce
 * the layer in isolation.
 */
export function useItemThumbnail(args: UseItemThumbnailArgs): UseItemThumbnailResult {
  const key = makeCacheKey({
    bodyType: args.bodyType,
    typeName: args.typeName,
    name: args.name,
    variant: args.variant,
    recolor: args.recolor,
    size: args.size,
  });

  const [state, setState] = useState<UseItemThumbnailResult>(() => {
    const cached = cacheGet(key);
    return cached
      ? { canvas: cached, status: 'ready' }
      : { canvas: null, status: 'loading' };
  });

  const reqIdRef = useRef(0);

  useEffect(() => {
    const cached = cacheGet(key);
    if (cached) {
      setState({ canvas: cached, status: 'ready' });
      return;
    }
    const reqId = ++reqIdRef.current;
    setState({ canvas: null, status: 'loading' });

    const adapter = createBrowserCanvasAdapter(args.assetSource);
    const selections: Selections = {
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

    composeSelections(selections, {
      catalog: args.catalog,
      adapter,
      spritesheetsBaseUrl: '',
      resolvePalette: makeResolvePalette(args.catalog, args.palettes, selections),
    })
      .then((sheet) => {
        if (reqId !== reqIdRef.current) return;
        const animName =
          sheet.animations.includes('walk') ? 'walk' : (sheet.animations[0] ?? 'walk');
        const animation = extractAnimation(sheet, animName, { adapter });
        if (!animation) {
          setState({ canvas: null, status: 'error' });
          return;
        }
        const config = ANIMATION_CONFIGS[animation.animation];
        if (!config) {
          setState({ canvas: null, status: 'error' });
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = args.size;
        canvas.height = args.size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setState({ canvas: null, status: 'error' });
          return;
        }
        ctx.imageSmoothingEnabled = false;
        const dir: Direction = 'down';
        const r = frameRect(config, animation.directions, dir, 0);
        ctx.drawImage(
          animation.canvas as unknown as CanvasImageSource,
          r.sx, r.sy, r.size, r.size,
          0, 0, args.size, args.size,
        );
        cacheSet(key, canvas);
        setState({ canvas, status: 'ready' });
      })
      .catch(() => {
        if (reqId !== reqIdRef.current) return;
        setState({ canvas: null, status: 'error' });
      });
  }, [key, args.catalog, args.palettes, args.assetSource]);

  return state;
}
```

- [ ] **Step 2: Type-check passes**

Run: `pnpm --filter @lpc-toolkit/web exec tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/hooks/use-item-thumbnail.ts
git commit -m "feat(web): useItemThumbnail hook backed by LRU cache

Reuses composeSelections to render a single item's first south-facing
walk frame onto a size×size offscreen canvas. Cached by item identity."
```

---

## Task 5: ItemThumbnail component + integrate into LayerRow

**Files:**
- Create: `packages/web/src/components/layer-stack/item-thumbnail.tsx`
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx` (thread `assetSource` to LayerRow)
- Modify: `packages/web/src/components/layer-stack/layer-row.tsx` (replace placeholders)

- [ ] **Step 1: Create ItemThumbnail component**

Create `packages/web/src/components/layer-stack/item-thumbnail.tsx`:

```tsx
import type {
  BodyType,
  Catalog,
  PaletteMetadata,
  TypeName,
} from '@lpc-toolkit/core';
import type { AssetSource } from '../../adapter/asset-source';
import { useItemThumbnail } from '../../hooks/use-item-thumbnail';

interface Props {
  typeName: TypeName;
  name: string;
  variant?: string;
  recolor?: string;
  size: 24 | 28;
  bodyType: BodyType;
  catalog: Catalog;
  palettes: PaletteMetadata;
  assetSource: AssetSource;
}

export function ItemThumbnail({
  typeName, name, variant, recolor, size,
  bodyType, catalog, palettes, assetSource,
}: Props) {
  const { canvas, status } = useItemThumbnail({
    typeName, name, variant, recolor, size,
    bodyType, catalog, palettes, assetSource,
  });

  if (status !== 'ready' || !canvas) {
    // Loading / error → reuse existing grey placeholder style.
    return (
      <div
        className="shrink-0 rounded bg-surface-2"
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  return (
    <canvas
      ref={(el) => {
        if (!el) return;
        el.width = size;
        el.height = size;
        const ctx = el.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(canvas, 0, 0);
      }}
      width={size}
      height={size}
      className="shrink-0 rounded"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
```

- [ ] **Step 2: Thread `assetSource` through stack-panel**

In `packages/web/src/components/layer-stack/stack-panel.tsx`, add `assetSource` to the `LayerRow` invocation. Locate the LayerRow JSX (around `lines 88-101`) and add `assetSource={assetSource}`:

```tsx
          active.map((tn) => (
            <LayerRow
              key={tn}
              typeName={tn}
              catalog={catalog}
              palettes={palettes}
              state={state}
              dispatch={dispatch}
              tl={tl}
              licenseFilter={licenseFilter}
              assetSource={assetSource}
              expanded={expanded === tn}
              onToggle={() => setExpanded(expanded === tn ? null : tn)}
            />
          ))
```

(`stack-panel.tsx` already receives `assetSource` in its Props since `harness.tsx:124` passes it.)

- [ ] **Step 3: Update LayerRow Props + replace placeholders**

In `packages/web/src/components/layer-stack/layer-row.tsx`:

(a) Add to imports at top:
```tsx
import { ItemThumbnail } from './item-thumbnail';
import type { AssetSource } from '../../adapter/asset-source';
```

(b) Modify the `Props` interface to add `assetSource: AssetSource` after `licenseFilter`:
```tsx
interface Props {
  typeName: TypeName;
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  tl: LabelTranslator;
  licenseFilter: LicenseFilter;
  assetSource: AssetSource;
  expanded: boolean;
  onToggle: () => void;
}
```

(c) Destructure `assetSource` in the function signature (`line 20`):
```tsx
export function LayerRow({
  typeName, catalog, palettes, state, dispatch, tl,
  licenseFilter, assetSource, expanded, onToggle,
}: Props) {
```

(d) Replace the main-row placeholder at `line 39`:
```tsx
        {item ? (
          <ItemThumbnail
            typeName={typeName}
            name={item.name}
            variant={selection.variant}
            recolor={selection.recolor}
            size={28}
            bodyType={state.bodyType}
            catalog={catalog}
            palettes={palettes}
            assetSource={assetSource}
          />
        ) : (
          <div className="h-7 w-7 shrink-0 rounded bg-surface-2" aria-hidden />
        )}
```

(e) Replace the swap-grid placeholder at `line 100`. Find the button body for swap items and change:
```tsx
// before:
<div className="h-7 w-7 rounded bg-surface" aria-hidden />
// after:
<ItemThumbnail
  typeName={typeName}
  name={it.name}
  size={24}
  bodyType={state.bodyType}
  catalog={catalog}
  palettes={palettes}
  assetSource={assetSource}
/>
```

(Note: swap-grid intentionally omits `variant`/`recolor` to display each item's default appearance and maximize cache hits.)

- [ ] **Step 4: Type-check + tests**

Run: `pnpm --filter @lpc-toolkit/web exec tsc --noEmit && pnpm --filter @lpc-toolkit/web test`
Expected: PASS (no type errors, all existing tests still green).

- [ ] **Step 5: Smoke-test in dev server**

Run: `pnpm --filter @lpc-toolkit/web dev`
Open `http://localhost:5173/?ui=v2`. Expand a layer. Confirm:
- LayerRow main thumbnail shows actual sprite (not grey block)
- Swap grid items show actual sprites
- No console errors

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/layer-stack/item-thumbnail.tsx \
  packages/web/src/components/layer-stack/layer-row.tsx \
  packages/web/src/components/layer-stack/stack-panel.tsx
git commit -m "feat(web): real item thumbnails in LayerRow + swap grid

Wraps useItemThumbnail in a small <ItemThumbnail/> component used in
both the active-layer row (28px, with user's variant/recolor) and the
swap grid (24px, default appearance for cache reuse). Threads
assetSource down from harness via stack-panel."
```

---

## Task 6: AddLayer 5-group restructure

**Files:**
- Modify: `packages/web/src/components/layer-stack/add-layer.tsx`

(No test — UI restructure follows project convention.)

- [ ] **Step 1: Rewrite add-layer.tsx**

Replace the full contents of `packages/web/src/components/layer-stack/add-layer.tsx` with:

```tsx
import type { BodyType, Catalog, TypeName } from '@lpc-toolkit/core';
import type { SliceAction } from '../../slice/selection';
import type { LabelTranslator, Translator } from '../../i18n';
import { itemSupportsBodyType } from '../../slice/catalog-tree';
import { CATEGORY_GROUPS } from '../../slice/category-groups';

interface Props {
  catalog: Catalog;
  dispatch: (a: SliceAction) => void;
  inactive: TypeName[];
  bodyType: BodyType;
  t: Translator;
  tl: LabelTranslator;
  adding: boolean;
  setAdding: (v: boolean) => void;
  onAdded: (tn: TypeName) => void;
  onOpenPalette: () => void;
}

export function AddLayer({
  catalog, dispatch, inactive, bodyType, t, tl,
  adding, setAdding, onAdded, onOpenPalette,
}: Props) {
  if (!adding) {
    return (
      <div className="mt-2 mb-2 flex gap-1">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex flex-1 items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-[12px] text-text-mute hover:bg-surface-2"
        >
          <span>＋</span>
          <span>{t('add.button')}</span>
          <span className="ml-auto font-mono text-[10px]">
            {inactive.length} {t('add.available')}
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenPalette}
          title={t('add.search')}
          className="flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-2 text-[12px] text-text-mute hover:bg-surface-2"
        >
          <span>🔍</span>
          <span className="font-mono text-[10px]">⌘K</span>
        </button>
      </div>
    );
  }

  // Build per-group inactive type lists (intersection of group typeNames and inactive)
  const inactiveSet = new Set(inactive);
  const sections = CATEGORY_GROUPS
    .map((g) => ({
      group: g,
      types: g.typeNames.filter((tn) => inactiveSet.has(tn)),
    }))
    .filter((s) => s.types.length > 0);

  return (
    <div className="mt-2 mb-2 rounded-md border border-border bg-app p-2">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-mute">
          {t('add.button')}
        </span>
        <button
          type="button"
          onClick={() => setAdding(false)}
          className="ml-auto rounded px-2 py-1 text-[11px] text-text-mute hover:bg-surface-2"
        >
          {t('common.close')}
        </button>
      </div>

      {sections.map(({ group, types }) => (
        <div key={group.id} className="mb-2 last:mb-0">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
            {t(group.labelKey)}
          </div>
          <div className="flex flex-wrap gap-1">
            {types.map((tn) => {
              const items = catalog.byTypeName.get(tn) ?? [];
              const firstCompatible = items.find((it) => itemSupportsBodyType(it, bodyType));
              const disabled = !firstCompatible;
              return (
                <button
                  key={tn}
                  type="button"
                  disabled={disabled}
                  title={disabled ? t('palette.incompatible') : tl.category(tn)}
                  onClick={() => {
                    if (!firstCompatible) return;
                    dispatch({ type: 'pick', typeName: tn, name: firstCompatible.name });
                    setAdding(false);
                    onAdded(tn);
                  }}
                  className={[
                    'rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px]',
                    disabled
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:bg-surface-3 cursor-pointer',
                  ].join(' ')}
                >
                  + {tl.category(tn)}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {sections.length === 0 && (
        <div className="px-2 py-2 text-[11px] text-text-mute">
          All categories already added.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update stack-panel.tsx to pass `bodyType` and noop `onOpenPalette`**

In `packages/web/src/components/layer-stack/stack-panel.tsx`, locate the `<AddLayer />` invocation (around `lines 105-114`) and add the new required props:

```tsx
        <AddLayer
          catalog={catalog}
          dispatch={dispatch}
          inactive={inactive}
          bodyType={state.bodyType}
          t={t}
          tl={tl}
          adding={adding}
          setAdding={setAdding}
          onAdded={(tn) => setExpanded(tn)}
          onOpenPalette={onOpenPalette}
        />
```

Add `onOpenPalette: () => void` to `stack-panel.tsx`'s `Props` interface and destructure it. Search for the `Props` interface (around `lines 13-27`) and append:

```ts
  onOpenPalette: () => void;
```

Destructure in function signature (around `line 29-43`):

```tsx
export function StackPanel({
  // ... existing
  onOpenPalette,
}: Props) {
```

- [ ] **Step 3: Update harness.tsx to pass a noop for now**

In `packages/web/src/components/layer-stack/harness.tsx`, find the `<StackPanel />` invocation (around `lines 116-130`) and add at the end of its props:

```tsx
            onOpenPalette={() => {}}
```

(This is a no-op stub; Task 10 wires it to actually open the palette.)

- [ ] **Step 4: Type-check + tests**

Run: `pnpm --filter @lpc-toolkit/web exec tsc --noEmit && pnpm --filter @lpc-toolkit/web test`
Expected: PASS.

- [ ] **Step 5: Smoke-test in dev server**

Run: `pnpm --filter @lpc-toolkit/web dev`
Open `?ui=v2`. Click "Add layer" to expand. Confirm:
- Pills are grouped under 5 super-group headers (Body & Skin / Hair & Face / etc.)
- No filter input present
- Click a pill → adds the first compatible item + the group section collapses if empty after
- Collapsed view shows two buttons: "+ Add layer" and "⌘K"
- ⌘K button click does nothing (wired in Task 10)

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/layer-stack/add-layer.tsx \
  packages/web/src/components/layer-stack/stack-panel.tsx \
  packages/web/src/components/layer-stack/harness.tsx
git commit -m "refactor(web): AddLayer to 5 super-group pills + ⌘K trigger

Replaces flat filter+list with grouped pills (Body & Skin /
Hair & Face / Clothing / Accessories / Weapons). Adds a secondary
⌘K trigger button in the collapsed state — currently wired to a
no-op, to be activated in the palette integration task."
```

---

## Task 7: palette-search pure helper

**Files:**
- Create: `packages/web/src/components/layer-stack/palette-search.ts`
- Test: `packages/web/test/palette-search.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/palette-search.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import { filterAndRankPaletteItems } from '../src/components/layer-stack/palette-search';

function makeItem(name: string, typeName: string, author = 'Anon'): ItemDefinition {
  return {
    name,
    type_name: typeName,
    animations: ['walk'],
    credits: [{ file: '', notes: '', authors: [author], licenses: ['CC-BY 3.0'], urls: [] }],
    layer_1: { zPos: 10, male: `${typeName}/${name}/` },
  } as unknown as ItemDefinition;
}

describe('filterAndRankPaletteItems', () => {
  const { catalog } = createCatalog({
    'hair/curly.json': makeItem('Curly', 'hair'),
    'hair/spiky.json': makeItem('Spiky', 'hair', 'AltAuthor'),
    'weapon/sword.json': makeItem('Sword', 'weapon'),
    'body/light.json': makeItem('Light', 'body'),
  });
  const shownTypeNames = ['body', 'hair', 'weapon'];

  it('returns all items when query is empty', () => {
    const r = filterAndRankPaletteItems({
      catalog, bodyType: 'male', query: '', shownTypeNames,
    });
    expect(r).toHaveLength(4);
  });

  it('filters by item name substring (case-insensitive)', () => {
    const r = filterAndRankPaletteItems({
      catalog, bodyType: 'male', query: 'cur', shownTypeNames,
    });
    expect(r.map((x) => x.item.name)).toEqual(['Curly']);
  });

  it('filters by typeName substring', () => {
    const r = filterAndRankPaletteItems({
      catalog, bodyType: 'male', query: 'weapon', shownTypeNames,
    });
    expect(r.map((x) => x.item.name)).toEqual(['Sword']);
  });

  it('filters by author', () => {
    const r = filterAndRankPaletteItems({
      catalog, bodyType: 'male', query: 'altauthor', shownTypeNames,
    });
    expect(r.map((x) => x.item.name)).toEqual(['Spiky']);
  });

  it('sorts by typeName then item name (compat is uniform here)', () => {
    const r = filterAndRankPaletteItems({
      catalog, bodyType: 'male', query: '', shownTypeNames,
    });
    expect(r.map((x) => `${x.typeName}:${x.item.name}`)).toEqual([
      'body:Light', 'hair:Curly', 'hair:Spiky', 'weapon:Sword',
    ]);
  });

  it('puts body-type-incompatible items after compatible ones', () => {
    // Build a catalog where one item supports only female
    const femaleOnly: ItemDefinition = {
      ...makeItem('FemaleHair', 'hair'),
      layer_1: { zPos: 10, female: 'hair/femalehair/' },
    } as unknown as ItemDefinition;
    const { catalog: c2 } = createCatalog({
      'hair/curly.json': makeItem('Curly', 'hair'),
      'hair/femalehair.json': femaleOnly,
    });
    const r = filterAndRankPaletteItems({
      catalog: c2, bodyType: 'male', query: '', shownTypeNames: ['hair'],
    });
    expect(r[0].item.name).toBe('Curly');           // compatible first
    expect(r[1].item.name).toBe('FemaleHair');      // incompatible after
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lpc-toolkit/web test palette-search`
Expected: FAIL (module not found).

- [ ] **Step 3: Write implementation**

Create `packages/web/src/components/layer-stack/palette-search.ts`:

```ts
import type {
  BodyType,
  Catalog,
  ItemDefinition,
  TypeName,
} from '@lpc-toolkit/core';
import { itemSupportsBodyType } from '../../slice/catalog-tree';

export interface PaletteSearchArgs {
  readonly catalog: Catalog;
  readonly bodyType: BodyType;
  readonly query: string;
  readonly shownTypeNames: readonly TypeName[];
}

export interface PaletteResult {
  readonly typeName: TypeName;
  readonly item: ItemDefinition;
  readonly supports: boolean;
}

/**
 * Flatten the catalog across `shownTypeNames`, filter by query (matches
 * item name / typeName / author), and sort: supported-first → typeName →
 * item name. Top-N slicing is the caller's job.
 */
export function filterAndRankPaletteItems(args: PaletteSearchArgs): PaletteResult[] {
  const term = args.query.trim().toLowerCase();
  const out: PaletteResult[] = [];

  for (const typeName of args.shownTypeNames) {
    const defs = args.catalog.byTypeName.get(typeName) ?? [];
    for (const item of defs) {
      const matches =
        !term ||
        item.name.toLowerCase().includes(term) ||
        typeName.toLowerCase().includes(term) ||
        item.credits.some((c) =>
          c.authors.some((a) => a.toLowerCase().includes(term)),
        );
      if (!matches) continue;
      out.push({
        typeName,
        item,
        supports: itemSupportsBodyType(item, args.bodyType),
      });
    }
  }

  out.sort((a, b) => {
    if (a.supports !== b.supports) return a.supports ? -1 : 1;
    if (a.typeName !== b.typeName) return a.typeName.localeCompare(b.typeName);
    return a.item.name.localeCompare(b.item.name);
  });

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lpc-toolkit/web test palette-search`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/layer-stack/palette-search.ts \
  packages/web/test/palette-search.test.ts
git commit -m "feat(web): filterAndRankPaletteItems pure helper for ⌘K palette

Matches by name/typeName/author, sorts supported items first then by
typeName then item name. Caller does top-N slicing."
```

---

## Task 8: AdvancedPalette modal component

**Files:**
- Create: `packages/web/src/components/layer-stack/advanced-palette.tsx`

- [ ] **Step 1: Write the component**

Create `packages/web/src/components/layer-stack/advanced-palette.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BodyType,
  Catalog,
  PaletteMetadata,
  TypeName,
} from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { AssetSource } from '../../adapter/asset-source';
import type { LabelTranslator, Translator } from '../../i18n';
import {
  itemMatchesLicenseFilter,
  licenseExceedsFilter,
  type LicenseFilter,
} from '../../slice/license-filter';
import { filterAndRankPaletteItems } from './palette-search';
import { ItemThumbnail } from './item-thumbnail';

const RESULT_LIMIT = 60;

interface Props {
  open: boolean;
  onClose: () => void;
  onPicked: (typeName: TypeName) => void;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  catalog: Catalog;
  palettes: PaletteMetadata;
  assetSource: AssetSource;
  shownTypeNames: TypeName[];
  licenseFilter: LicenseFilter;
  t: Translator;
  tl: LabelTranslator;
}

export function AdvancedPalette({
  open, onClose, onPicked, state, dispatch, catalog, palettes,
  assetSource, shownTypeNames, licenseFilter, t, tl,
}: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when opening
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(id);
  }, [open]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const results = useMemo(
    () => filterAndRankPaletteItems({
      catalog, bodyType: state.bodyType, query, shownTypeNames,
    }),
    [catalog, state.bodyType, query, shownTypeNames],
  );
  const shown = results.slice(0, RESULT_LIMIT);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="absolute inset-0 z-50 flex justify-center bg-black/55 pt-16 backdrop-blur-md"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[520px] w-[640px] max-w-[90vw] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="text-text-mute">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('palette.placeholder')}
            className="flex-1 bg-transparent text-sm text-text outline-none"
          />
          {licenseFilter && (
            <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-[10px] text-accent">
              ≤ {licenseFilter}
            </span>
          )}
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-text-dim">
            ESC
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {shown.length === 0 ? (
            <div className="px-3 py-6 text-center text-[13px] text-text-mute">
              {t('palette.no_match')}
            </div>
          ) : (
            shown.map(({ typeName, item, supports }, i) => {
              const matchesFilter = itemMatchesLicenseFilter(item, licenseFilter);
              const exceeded = !matchesFilter;
              const active = state.selections[typeName]?.name === item.name;
              const itemLicense = item.credits[0]?.licenses[0];
              const isExceededByLicense =
                exceeded && itemLicense && licenseExceedsFilter(itemLicense, licenseFilter);
              return (
                <button
                  key={`${typeName}:${item.name}`}
                  type="button"
                  disabled={!supports}
                  title={!supports ? t('palette.incompatible') : item.name}
                  onClick={() => {
                    if (!supports) return;
                    dispatch({ type: 'pick', typeName, name: item.name });
                    onPicked(typeName);
                  }}
                  className={[
                    'flex w-full items-center gap-3 px-3 py-2 text-left',
                    i > 0 ? 'border-t border-border' : '',
                    !supports
                      ? 'cursor-not-allowed opacity-35'
                      : exceeded
                        ? 'opacity-65 hover:bg-surface-2'
                        : 'hover:bg-surface-2',
                  ].join(' ')}
                >
                  <ItemThumbnail
                    typeName={typeName}
                    name={item.name}
                    size={24}
                    bodyType={state.bodyType}
                    catalog={catalog}
                    palettes={palettes}
                    assetSource={assetSource}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[13px] font-semibold">
                      {tl.itemName(item.name)}
                      {!supports && (
                        <span className="rounded bg-warning/15 px-1 text-[9px] uppercase tracking-wide text-warning">
                          {t('palette.incompatible')}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-text-mute">
                      {tl.category(typeName)}
                      {itemLicense && <> · {itemLicense}</>}
                    </div>
                  </div>
                  {isExceededByLicense && <span className="text-danger">⚠</span>}
                  {active && <span className="text-accent">✓</span>}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-[10px] text-text-dim">
          <span><span className="font-mono">esc</span> close</span>
          <span className="ml-auto">{shown.length} of {results.length}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @lpc-toolkit/web exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/layer-stack/advanced-palette.tsx
git commit -m "feat(web): AdvancedPalette modal (⌘K search across full catalog)

Absolute-positioned modal with backdrop blur. Filters via
filterAndRankPaletteItems, shows top 60 results. Esc closes;
clicking an item dispatches pick + triggers onPicked. Honors
body-type compatibility (disabled+dim) and license filter (dim+warn)."
```

---

## Task 9: PaletteTrigger button

**Files:**
- Create: `packages/web/src/components/layer-stack/palette-trigger.tsx`

- [ ] **Step 1: Write the component**

Create `packages/web/src/components/layer-stack/palette-trigger.tsx`:

```tsx
import type { Translator } from '../../i18n';

interface Props {
  onOpen: () => void;
  t: Translator;
}

export function PaletteTrigger({ onOpen, t }: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-[220px] items-center gap-2 rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] text-text-mute hover:bg-surface-3"
      title={t('palette.title')}
    >
      <span>🔍</span>
      <span className="flex-1 truncate text-left">{t('palette.title')}</span>
      <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-text-dim">
        ⌘K
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/layer-stack/palette-trigger.tsx
git commit -m "feat(web): PaletteTrigger button (top-bar search affordance)"
```

---

## Task 10: Integrate palette into harness

**Files:**
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

(This task wires together everything from Tasks 6-9: paletteOpen state, global keydown, PaletteTrigger in TopBar children, AdvancedPalette mount, AddLayer's onOpenPalette callback.)

- [ ] **Step 1: Modify harness.tsx**

In `packages/web/src/components/layer-stack/harness.tsx`:

(a) Add to imports near the top:
```tsx
import { useState, useEffect } from 'react';
import { PaletteTrigger } from './palette-trigger';
import { AdvancedPalette } from './advanced-palette';
```

(Note: `useState` and `useEffect` should already be imported from `react` — if not, ensure both are present.)

(b) Inside the `LayerStackHarness` function body, after the existing `useState` declarations (around `lines 34-36`), add:

```tsx
  const [paletteOpen, setPaletteOpen] = useState(false);
```

(c) After the existing `useEffect` for status auto-clear (around `lines 38-42`), add the global ⌘K handler:

```tsx
  // Global ⌘K / Ctrl+K toggles the advanced palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
```

(d) Inside the `<TopBar>` children, after the existing popovers (around `line 112`, after `<AttributionPopover />`), add:

```tsx
        <PaletteTrigger onOpen={() => setPaletteOpen(true)} t={t} />
```

(e) Update the existing `onOpenPalette={() => {}}` no-op stub on `<StackPanel />` (added in Task 6 Step 3) to actually open the palette. Find the `<StackPanel />` invocation and change:

```tsx
            onOpenPalette={() => setPaletteOpen(true)}
```

(f) Change the grid container (`<div className="grid min-h-0 flex-1 grid-cols-[340px_1fr]">` at `line 114`) to add `relative` for the absolutely-positioned modal:

```tsx
      <div className="relative grid min-h-0 flex-1 grid-cols-[340px_1fr]">
```

(g) **Lift `expanded` state from stack-panel to harness** (so the palette's `onPicked` can expand the picked layer per spec).

In `harness.tsx`, add a new state declaration alongside `paletteOpen`:

```tsx
  const [expanded, setExpanded] = useState<TypeName | null>(null);
```

(Add `import type { TypeName } from '@lpc-toolkit/core';` to harness imports if not already present.)

In the `<StackPanel />` invocation, pass these as props:

```tsx
            expanded={expanded}
            setExpanded={setExpanded}
```

In `stack-panel.tsx`:

- Add to the `Props` interface:
  ```ts
    expanded: TypeName | null;
    setExpanded: (v: TypeName | null) => void;
  ```
- Destructure them in the function signature.
- Remove the existing `const [expanded, setExpanded] = useState<TypeName | null>(null);` line (around `line 44`) — these now come from props.

`stack-panel.tsx` still owns the `useEffect` that resets `expanded` when body-type change removes a layer (`lines 58-60`); that effect now calls `props.setExpanded` instead of the local setter (since the destructured `setExpanded` from props has the same name, no other code change needed).

(h) At the very end of the grid container, just before its closing `</div>`, mount the modal:

```tsx
        <AdvancedPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onPicked={(tn) => {
            setPaletteOpen(false);
            setExpanded(tn);
          }}
          state={props.state}
          dispatch={props.dispatch}
          catalog={props.catalog}
          palettes={props.palettes}
          assetSource={props.assetSource}
          shownTypeNames={props.shownTypeNames}
          licenseFilter={licenseFilter}
          t={t}
          tl={props.tl}
        />
```

- [ ] **Step 2: Type-check + tests**

Run: `pnpm --filter @lpc-toolkit/web exec tsc --noEmit && pnpm --filter @lpc-toolkit/web test`
Expected: PASS.

- [ ] **Step 3: Smoke-test in dev server**

Run: `pnpm --filter @lpc-toolkit/web dev`
Open `?ui=v2`. Verify all of:
- Top bar shows `🔍 Search all assets…  ⌘K` button after attribution popover
- Press `⌘K` (Mac) or `Ctrl+K` (Win/Linux) → modal opens with input focused
- Type "hair" → filtered results visible
- Click a result → dispatches pick, modal closes
- Press ESC → modal closes
- Click backdrop → modal closes
- AddLayer collapsed view → ⌘K button (right side) also opens the palette
- License filter active → palette shows `≤ {filter}` chip; items exceeding filter dim with ⚠
- Body-type incompatible items → disabled + dim + "incompatible" badge

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/layer-stack/harness.tsx
git commit -m "feat(web): wire ⌘K AdvancedPalette into harness

Adds paletteOpen state, global ⌘K/Ctrl+K keydown toggle,
PaletteTrigger in top bar, modal mount on the grid container,
and connects AddLayer's secondary ⌘K button to setPaletteOpen.
This activates the entire Spec 1 feature set."
```

---

## Self-Review Notes

After all 10 tasks pass:

**Spec coverage check:**
- F1 ⌘K Palette: Tasks 7 (search) + 8 (modal) + 9 (trigger) + 10 (integration) ✓
- F2 Real thumbnails: Tasks 3 (cache) + 4 (hook) + 5 (component + LayerRow integration) ✓
- F3 AddLayer 5 groups: Tasks 1 (GROUPS) + 6 (restructure) ✓
- i18n: Task 2 ✓
- Tests: category-groups (Task 1), thumbnail-cache (Task 3), palette-search (Task 7) ✓

**Open items intentionally deferred** (per spec Open Questions):
- GROUPS TypeName coverage may need iteration after looking at full real catalog — spec accepts null fallback for unknown TypeNames
- Thumbnail compose detail (does it need a body underlay?) — implementation may discover edge cases when running against real catalog
- i18n 文案 — initial English/Chinese provided in Task 2, refine in PR review

**Confirmed working sequence:** Tasks 1-4 are dependency-only foundation. Task 5 is the first user-visible change (real thumbnails). Task 6 visibly restructures AddLayer (but ⌘K button is dead). Tasks 7-9 build the palette pieces in isolation. Task 10 activates everything end-to-end.

Each task ends in a green build + green tests + commit. The repo is shippable at every intermediate commit.

---

## Execution

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task with two-stage review
2. **Inline Execution** — execute tasks in this session with checkpoints
