# Incompatible Asset Thumbnails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a fallback thumbnail for assets that do not support the active body type, while keeping them disabled and explaining the body-type mismatch on hover or focus.

**Architecture:** Keep compatibility as the sole authority for whether an asset can be selected. Resolve a display-only thumbnail body type inside the existing thumbnail hook: use the active type when possible, otherwise the first primary-layer body type with a spritesheet path. The sidebar wraps only body-incompatible disabled result rows in a local CSS tooltip trigger; no new dependency or shared tooltip framework is introduced.

**Tech Stack:** TypeScript strict mode, React 18, Tailwind CSS v4, Vitest, pnpm workspaces.

---

## Constraints

- Do not modify `upstream/`, `packages/core/`, assets, attribution, or selection-token behavior.
- Do not add dependencies or `any` types.
- Run commands with the `rtk` prefix.
- Preserve `itemSupportsBodyType` as the selection gate and keep incompatible result buttons disabled.
- After each task, mark every completed step, append an implementation note, commit hash, and verification status to this file, then commit that progress update as required by `AGENTS.md`.

## File Map

- Modify: `packages/web/src/lib/item-thumbnail-selection.ts`
  - Pure resolver for the active or fallback thumbnail body type.
- Modify: `packages/web/src/hooks/use-item-thumbnail.ts`
  - Resolve the display body type before cache lookup and thumbnail composition.
- Modify: `packages/web/src/components/layer-stack/sidebar-search.tsx`
  - Add an accessible hover/focus explanation around body-incompatible result rows.
- Modify: `packages/web/src/i18n.ts`
  - Add English and Traditional Chinese interpolation text for the incompatible active body type.
- Modify: `packages/web/test/item-thumbnail-selection.test.ts`
  - Unit-test active and fallback body-type resolution.
- Modify: `packages/web/test/thumbnail-cache.test.ts`
  - Assert different preview body types produce different cache keys.
- Create: `packages/web/test/sidebar-search-incompatibility.test.tsx`
  - Render the extracted incompatible result wrapper and verify disabled state, fallback thumbnail input, and tooltip text.

### Task 1: Resolve a display-only fallback body type

**Files:**
- Modify: `packages/web/src/lib/item-thumbnail-selection.ts`
- Modify: `packages/web/test/item-thumbnail-selection.test.ts`

- [x] **Step 1: Write the failing resolver tests**

Add this import and cases to `packages/web/test/item-thumbnail-selection.test.ts`:

```ts
import {
  buildItemThumbnailSelections,
  effectiveThumbnailVariant,
  previewBodyTypeForItem,
} from '../src/lib/item-thumbnail-selection';

it('uses the active body type when the item supports it', () => {
  expect(previewBodyTypeForItem(item({
    layer_1: { zPos: 10, male: 'hair/male/', female: 'hair/female/' },
  }), 'male')).toBe('male');
});

it('falls back to the first primary-layer body type with a path', () => {
  expect(previewBodyTypeForItem(item({
    layer_1: { zPos: 10, female: 'clothes/tanktop/' },
  }), 'male')).toBe('female');
});

it('returns null when the primary layer has no body-type spritesheet path', () => {
  expect(previewBodyTypeForItem(item({
    layer_1: { zPos: 10 },
  }), 'male')).toBeNull();
});
```

- [x] **Step 2: Run the focused test and verify it fails**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- item-thumbnail-selection.test.ts
```

Expected: FAIL because `previewBodyTypeForItem` is not exported.

- [x] **Step 3: Implement the pure resolver**

Add this function to `packages/web/src/lib/item-thumbnail-selection.ts` after `effectiveThumbnailVariant`:

```ts
export function previewBodyTypeForItem(
  item: ItemDefinition,
  activeBodyType: BodyType,
): BodyType | null {
  if (typeof item.layer_1?.[activeBodyType] === 'string') {
    return activeBodyType;
  }

  for (const [bodyType, path] of Object.entries(item.layer_1 ?? {})) {
    if (typeof path === 'string') return bodyType;
  }

  return null;
}
```

The `typeof path === 'string'` guard excludes layer metadata such as numeric
`zPos`; insertion order preserves the asset definition's first available body
type for the fallback.

- [x] **Step 4: Run the focused test and typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- item-thumbnail-selection.test.ts
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: both commands PASS.

- [x] **Step 5: Commit and record Task 1**

```bash
rtk git add packages/web/src/lib/item-thumbnail-selection.ts packages/web/test/item-thumbnail-selection.test.ts docs/superpowers/plans/2026-06-19-incompatible-asset-thumbnails.md
rtk git commit -m "feat(web): resolve fallback thumbnail body type"
```

Append the actual commit SHA and command results below this task, then commit
the plan progress update separately.

- **Commit**: 1391ad12d
- **Verification**:
  - `rtk pnpm --filter @lpc-toolkit/web test -- item-thumbnail-selection.test.ts` PASS
  - `rtk pnpm -r typecheck` PASS
  - `rtk pnpm --filter @lpc-toolkit/web test` PASS
- **Implementation Note**:
  - Implemented `previewBodyTypeForItem` in `packages/web/src/lib/item-thumbnail-selection.ts` which uses the active body type if supported, or falls back to the first primary-layer body type with a path, or returns null.
  - Added unit test cases in `packages/web/test/item-thumbnail-selection.test.ts` to verify active body type use, fallback behavior, and null return behavior, all of which pass successfully.

### Task 2: Compose and cache using the resolved display body type

**Files:**
- Modify: `packages/web/src/hooks/use-item-thumbnail.ts`
- Modify: `packages/web/test/thumbnail-cache.test.ts`

- [x] **Step 1: Write the cache separation assertion**

Add this case to the `makeCacheKey` suite in `packages/web/test/thumbnail-cache.test.ts`:

```ts
it('separates canvases rendered for different preview body types', () => {
  const base = { typeName: 'clothes', name: 'Tanktop', size: 20 } as const;
  expect(makeCacheKey({ ...base, bodyType: 'male' }))
    .not.toBe(makeCacheKey({ ...base, bodyType: 'female' }));
});
```

- [x] **Step 2: Run the focused cache test and record the baseline**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- thumbnail-cache.test.ts
```

Expected: PASS; the test documents the existing cache-key invariant needed by
the hook change.

- [x] **Step 3: Use the resolver before cache lookup and composition**

In `packages/web/src/hooks/use-item-thumbnail.ts`, import
`previewBodyTypeForItem`, find the definition before constructing `key`, and
derive the body type used only by thumbnail work:

```ts
const def = findItemDef(args.catalog, args.typeName, args.name);
const previewBodyType = def
  ? previewBodyTypeForItem(def, args.bodyType)
  : args.bodyType;

const key = makeCacheKey({
  bodyType: previewBodyType ?? args.bodyType,
  typeName: args.typeName,
  name: args.name,
  ...(args.variant !== undefined ? { variant: args.variant } : {}),
  ...(args.recolor !== undefined ? { recolor: args.recolor } : {}),
  size: args.size,
});
```

Use `previewBodyType ?? args.bodyType` in both branches that create
`selections`. This keeps an unknown definition on the current behavior and
lets an item with no usable primary-layer path complete as the existing blank
or error placeholder. Do not change the hook's public arguments: callers
continue passing the active character body type, and the hook makes the
display-only decision locally.

- [x] **Step 4: Run focused tests and typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- item-thumbnail-selection.test.ts thumbnail-cache.test.ts thumbnail-frame-rect.test.ts
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: all focused tests and typecheck PASS.

- [x] **Step 5: Commit and record Task 2**

```bash
rtk git add packages/web/src/hooks/use-item-thumbnail.ts packages/web/test/thumbnail-cache.test.ts docs/superpowers/plans/2026-06-19-incompatible-asset-thumbnails.md
rtk git commit -m "feat(web): render incompatible asset thumbnails"
```

Append the actual commit SHA and command results below this task, then commit
the plan progress update separately.

- **Commit**: 1baed4083
- **Verification**:
  - `rtk pnpm --filter @lpc-toolkit/web test -- item-thumbnail-selection.test.ts thumbnail-cache.test.ts thumbnail-frame-rect.test.ts` PASS
  - `rtk pnpm -r typecheck` PASS
- **Implementation Note**:
  - Imported `previewBodyTypeForItem` in `packages/web/src/hooks/use-item-thumbnail.ts`.
  - Resolved `previewBodyType` using the resolver before constructing the cache `key` and before building the selections in both selection branches.
  - Added cache key separation assertion to `packages/web/test/thumbnail-cache.test.ts`, verifying distinct keys are built for different body types.
  - Verified focused tests pass and project typechecks successfully.

### Task 3: Expose the disabled reason in sidebar search

**Files:**
- Modify: `packages/web/src/components/layer-stack/sidebar-search.tsx`
- Modify: `packages/web/src/i18n.ts`
- Create: `packages/web/test/sidebar-search-incompatibility.test.tsx`

- [ ] **Step 1: Write a static component test for an incompatible row**

Extract the body-incompatible result row from `SidebarSearch` as an exported
`SidebarSearchResultRow` component so it can be rendered without manipulating
the search input state. Create `packages/web/test/sidebar-search-incompatibility.test.tsx`
with a female-only `Tanktop` definition, a male `SliceState`, and these
assertions after rendering with `renderToStaticMarkup`:

```ts
expect(html).toContain('disabled=""');
expect(html).toContain('role="tooltip"');
expect(html).toContain('Not available for current body type: Male');
expect(html).toContain('tabindex="0"');
```

Pass the row the same `catalog`, empty palettes, all license groups, empty
animation filter, English translators, and `onPick={() => {}}` used by the
production sidebar. The rendered `ItemThumbnail` is expected to begin as its
existing placeholder during SSR; this test verifies the row's accessible
structure, not Canvas composition.

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- sidebar-search-incompatibility.test.tsx
```

Expected: FAIL because `SidebarSearchResultRow` and the formatted translation
do not exist.

- [ ] **Step 3: Add localized concrete body-type copy and a CSS tooltip wrapper**

Add this key in both language maps in `packages/web/src/i18n.ts`:

```ts
// en
'picker.incompatibleBodyTypeDetail': 'Not available for current body type: {bodyType}',

// zh-TW
'picker.incompatibleBodyTypeDetail': '不支援目前身形：{bodyType}',
```

Move the mapped result-row JSX into `SidebarSearchResultRow`. For
`!result.supports`, wrap its disabled button in a full-width focusable span:

```tsx
<span className="group relative block w-full" tabIndex={0}>
  {button}
  <span
    role="tooltip"
    className="pointer-events-none absolute left-3 top-full z-40 mt-1 hidden max-w-56 rounded bg-surface px-2 py-1 text-xs text-text shadow group-hover:block group-focus:block"
  >
    {t('picker.incompatibleBodyTypeDetail')
      .replace('{bodyType}', tl.bodyType(state.bodyType))}
  </span>
</span>
```

Return the button directly for supported results. Keep `disabled={disabled ||
!result.supports}`, `onPick`'s `!result.supports` guard, and all existing
license/animation indicators unchanged. The wrapper must not be added while
the whole sidebar is composition-disabled; that state already has a distinct
global cause and must not claim a body-type mismatch.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- sidebar-search-incompatibility.test.tsx sidebar-search-keyboard.test.ts item-thumbnail-selection.test.ts thumbnail-cache.test.ts
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: all focused tests and typecheck PASS.

- [ ] **Step 5: Commit and record Task 3**

```bash
rtk git add packages/web/src/components/layer-stack/sidebar-search.tsx packages/web/src/i18n.ts packages/web/test/sidebar-search-incompatibility.test.tsx docs/superpowers/plans/2026-06-19-incompatible-asset-thumbnails.md
rtk git commit -m "feat(web): explain incompatible asset choices"
```

Append the actual commit SHA and command results below this task, then commit
the plan progress update separately.

### Task 4: Full web verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-19-incompatible-asset-thumbnails.md`

- [ ] **Step 1: Run the complete web test suite**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: both commands PASS.

- [ ] **Step 2: Inspect the completed diff**

Run:

```bash
rtk git diff --check main...HEAD
rtk git status --short
```

Expected: no whitespace errors and no uncommitted changes except the required
Task 4 plan-record update.

- [ ] **Step 3: Record Task 4 completion**

Mark every completed checkbox in this plan. Append an implementation note
stating that incompatible assets remain disabled, render from a fallback
primary-layer body type when available, and expose the active-body mismatch on
hover or focus. Record the actual Task 3 implementation commit SHA and the
observed passing results of the complete web test suite, typecheck, and
`git diff --check`.

- [ ] **Step 4: Commit the final plan record**

```bash
rtk git add docs/superpowers/plans/2026-06-19-incompatible-asset-thumbnails.md
rtk git commit -m "docs: record incompatible thumbnail verification"
```
