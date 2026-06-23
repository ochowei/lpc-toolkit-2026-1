# Asset Display-Name Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display meaningful, locale-specific asset names without changing the legacy names that identify selections, shared URLs, presets, rendering, exports, or credits.

**Architecture:** Extend catalog definitions with optional English `display_name` metadata and expose the catalog-derived `itemId` on loaded definitions. Keep `Selection.name` unchanged. Add an item-aware localization API keyed by `itemId`, then migrate every user-visible catalog label to it. The search and ZIP export paths receive the same display-label function so their text matches the UI while raw names remain searchable and remain the identity used for asset resolution.

**Tech Stack:** TypeScript strict mode, React 18, Vitest, pnpm workspaces.

---

## File structure

- Modify: `packages/core/src/types.ts` — declare optional source display metadata and catalog-assigned item ID.
- Modify: `packages/core/src/catalog.ts` — attach the derived item ID to every compiled definition.
- Modify: `packages/core/test/catalog.test.ts` — prove metadata and item IDs survive catalog compilation.
- Modify: seven JSON files under `assets/sheet_definitions/` — add English `display_name` only; do not change `name`, `type_name`, paths, or credits.
- Create: `packages/web/src/i18n-item-display-names.ts` — Chinese labels keyed by item ID.
- Modify: `packages/web/src/i18n.ts` — add an item-aware catalog-label method with safe fallbacks.
- Modify: `packages/web/test/i18n.test.ts` — cover English, Chinese, item-ID isolation, and fallback behavior.
- Modify: `packages/web/src/components/layer-stack/{type-item-picker,layer-row,group-type-slot-entries,sidebar-search,palette-search}.tsx` — show and search display labels.
- Modify: `packages/web/src/components/{selected-items-panel.tsx}` and `packages/web/src/components/layer-stack/popovers/attribution-popover.tsx` — label resolved selected items by definition.
- Modify: `packages/web/src/lib/zip-export.ts` and `packages/web/src/components/layer-stack/popovers/download-popover.tsx` — inject localized names into ZIP filenames without changing item lookup.
- Modify: `packages/web/test/{palette-search,zip-export}.test.ts` — verify display-label search/sort and ZIP filename behavior.

### Task 1: Preserve a separate display label in catalog metadata

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/catalog.ts`
- Modify: `packages/core/test/catalog.test.ts`

- [x] **Step 1: Add a failing catalog compilation test**

  In `packages/core/test/catalog.test.ts`, add a catalog record with `name: 'Normal'`, `display_name: 'Normal Bow'`, and source path `weapons/ranged/bow/weapon_ranged_bow_normal.json`. Assert that the compiled entry is found by `catalog.byItemId.get('weapon_ranged_bow_normal')` and equals:

  ```ts
  expect(catalog.byItemId.get('weapon_ranged_bow_normal')).toMatchObject({
    name: 'Normal',
    display_name: 'Normal Bow',
    itemId: 'weapon_ranged_bow_normal',
  });
  ```

- [x] **Step 2: Run the focused test and confirm failure**

  Run: `rtk pnpm --filter @lpc-toolkit/core test -- catalog.test.ts`

  Expected: FAIL because `display_name` and `itemId` are not yet declared/preserved.

- [x] **Step 3: Extend the definition type and compiled catalog entry**

  In `packages/core/src/types.ts`, add these optional fields to `ItemDefinition` next to `name` and `sourcePath`:

  ```ts
  /** Optional standalone English label for presentation; identity remains `name`. */
  readonly display_name?: string;
  /** Stable ID derived from the definition filename by `createCatalog`. */
  readonly itemId?: ItemId;
  ```

  In `packages/core/src/catalog.ts`, retain the existing raw definition values and attach the derived ID during compilation:

  ```ts
  const item: ItemDefinition = { ...def, itemId, sourcePath: filePath };
  ```

  Do not alter `deriveItemId`, aliases, `Selection`, hash parsing, or composition lookups.

- [x] **Step 4: Run the focused core test and typecheck**

  Run: `rtk pnpm --filter @lpc-toolkit/core test -- catalog.test.ts && rtk pnpm --filter @lpc-toolkit/core typecheck`

  Expected: PASS.

- [x] **Step 5: Commit the catalog metadata boundary**

  ```bash
  rtk git add packages/core/src/types.ts packages/core/src/catalog.ts packages/core/test/catalog.test.ts
  rtk git commit -m "feat(core): preserve catalog display names"
  ```

  - Commit: `6c832fddb456ac2b16daa0b8c1a9ed9c7e447313`
  - Verification: `rtk pnpm --filter @lpc-toolkit/core test -- catalog.test.ts && rtk pnpm --filter @lpc-toolkit/core typecheck` PASS

### Task 2: Define the first standalone names in asset metadata

**Files:**
- Modify: `assets/sheet_definitions/weapons/ranged/bow/weapon_ranged_bow_normal.json`
- Modify: `assets/sheet_definitions/weapons/ranged/bow/weapon_ranged_bow_great.json`
- Modify: `assets/sheet_definitions/weapons/ranged/bow/weapon_ranged_bow_recurve.json`
- Modify: `assets/sheet_definitions/weapons/ranged/bow/weapon_ranged_bow_arrow.json`
- Modify: `assets/sheet_definitions/hair/afro/hair_natural.json`
- Modify: `assets/sheet_definitions/hair/short/hair_plain.json`
- Modify: `assets/sheet_definitions/head/faces/face_neutral.json`
- Test: `packages/core/test/catalog.test.ts`

- [x] **Step 1: Add assertions for all seven compiled display names**

  Add a table-driven test that loads the seven definitions and expects these pairs:

  ```ts
  const expected = [
    ['weapon_ranged_bow_normal', 'Normal Bow'],
    ['weapon_ranged_bow_great', 'Great Bow'],
    ['weapon_ranged_bow_recurve', 'Recurve Bow'],
    ['weapon_ranged_bow_arrow', 'Arrow'],
    ['hair_natural', 'Natural Hair'],
    ['hair_plain', 'Plain Hair'],
    ['face_neutral', 'Neutral Expression'],
  ] as const;
  ```

- [x] **Step 2: Run the test and confirm it fails on missing metadata**

  Run: `rtk pnpm --filter @lpc-toolkit/core test -- catalog.test.ts`

  Expected: FAIL because the definitions still have no `display_name`.

- [x] **Step 3: Add only the approved `display_name` fields**

  Insert the following immediately after each existing `name` property:

  ```json
  "display_name": "Normal Bow"
  ```

  Use the exact values from Step 1 for the other six files. Keep every existing legacy `name` unchanged (`Normal`, `Great`, `Recurve`, `Ammo`, `Natural`, `Plain`, `Neutral`).

- [x] **Step 4: Run catalog validation tests**

  Run: `rtk pnpm --filter @lpc-toolkit/core test -- catalog.test.ts`

  Expected: PASS; no catalog-load warnings are introduced.

- [x] **Step 5: Commit the asset-label metadata**

  ```bash
  rtk git add assets/sheet_definitions packages/core/test/catalog.test.ts
  rtk git commit -m "feat(assets): add standalone display names"
  ```

  - Commit: `8c765417d3b48ed939749aaf0c389677fa5abcda`
  - Verification: `rtk pnpm --filter @lpc-toolkit/core test -- catalog.test.ts` PASS

### Task 3: Add item-ID-specific localization with safe fallbacks

**Files:**
- Create: `packages/web/src/i18n-item-display-names.ts`
- Modify: `packages/web/src/i18n.ts`
- Modify: `packages/web/test/i18n.test.ts`

- [x] **Step 1: Write failing item-aware label tests**

  In `packages/web/test/i18n.test.ts`, construct catalog-like definitions and assert:

  ```ts
  expect(en.catalogItemName({ name: 'Normal', display_name: 'Normal Bow', itemId: 'weapon_ranged_bow_normal' })).toBe('Normal Bow');
  expect(zh.catalogItemName({ name: 'Normal', display_name: 'Normal Bow', itemId: 'weapon_ranged_bow_normal' })).toBe('普通弓');
  expect(zh.catalogItemName({ name: 'Great', display_name: 'Great Bow', itemId: 'weapon_ranged_bow_great' })).toBe('大弓');
  expect(zh.catalogItemName({ name: 'Normal', itemId: 'unmapped_normal' })).toBe('正常');
  expect(en.catalogItemName({ name: 'Unknown' })).toBe('Unknown');
  ```

  Use `as ItemDefinition` only after supplying the minimum fields the test helper requires; do not introduce `any`.

- [x] **Step 2: Run the focused test and confirm failure**

  Run: `rtk pnpm --filter @lpc-toolkit/web test -- i18n.test.ts`

  Expected: FAIL because `catalogItemName` and the item-ID map do not exist.

- [x] **Step 3: Add the localized item-ID map and translator method**

  Create `packages/web/src/i18n-item-display-names.ts`:

  ```ts
  export const ITEM_DISPLAY_NAMES_ZH: Readonly<Record<string, string>> = {
    weapon_ranged_bow_normal: '普通弓',
    weapon_ranged_bow_great: '大弓',
    weapon_ranged_bow_recurve: '反曲弓',
    weapon_ranged_bow_arrow: '箭矢',
    hair_natural: '自然髮型',
    hair_plain: '樸素髮型',
    face_neutral: '中性表情',
  };
  ```

  In `packages/web/src/i18n.ts`, import `ItemDefinition` as a type and add to `LabelTranslator`:

  ```ts
  catalogItemName(item: Pick<ItemDefinition, 'name' | 'display_name' | 'itemId'>): string;
  ```

  Implement it so English returns `item.display_name ?? item.name`; Chinese returns `ITEM_DISPLAY_NAMES_ZH[item.itemId ?? ''] ?? ITEM_NAME_LABELS_ZH[item.name] ?? item.display_name ?? item.name`. Retain `itemName(value)` unchanged as the raw-name fallback API for callers that cannot resolve a catalog item.

- [x] **Step 4: Run i18n tests and web typecheck**

  Run: `rtk pnpm --filter @lpc-toolkit/web test -- i18n.test.ts && rtk pnpm --filter @lpc-toolkit/web typecheck`

  Expected: PASS.

- [x] **Step 5: Commit the presentation API**

  ```bash
  rtk git add packages/web/src/i18n.ts packages/web/src/i18n-item-display-names.ts packages/web/test/i18n.test.ts
  rtk git commit -m "feat(web): localize catalog display names by item ID"
  ```

  Record the resulting commit hash and PASS verification in this plan under this task.

  - Commit: `76a6d9df67afb8fc9f74b58241e4385432b2c85e`
  - Verification: `rtk pnpm --filter @lpc-toolkit/web test -- i18n.test.ts && rtk pnpm --filter @lpc-toolkit/web typecheck` PASS

### Task 4: Migrate all resolved catalog labels in the UI

**Files:**
- Modify: `packages/web/src/components/layer-stack/type-item-picker.tsx`
- Modify: `packages/web/src/components/layer-stack/layer-row.tsx`
- Modify: `packages/web/src/components/layer-stack/group-type-slot-entries.tsx`
- Modify: `packages/web/src/components/layer-stack/sidebar-search.tsx`
- Modify: `packages/web/src/components/layer-stack/popovers/attribution-popover.tsx`
- Modify: `packages/web/src/components/selected-items-panel.tsx`

- [x] **Step 1: Add a failing UI label rendering test**

  Extend the existing component test closest to `TypeItemPicker` (or create `packages/web/test/type-item-picker.test.tsx`) with a catalog item `{ name: 'Normal', display_name: 'Normal Bow', itemId: 'weapon_ranged_bow_normal' }`. Render under `createLabelTranslator('zh-TW')` and assert that the visible card label and ARIA label are `普通弓`, not `正常`.

- [x] **Step 2: Run the focused UI test and confirm failure**

  Run: `rtk pnpm --filter @lpc-toolkit/web test -- type-item-picker.test.tsx`

  Expected: FAIL because cards currently call `tl.itemName(it.name)`.

- [x] **Step 3: Replace raw-name presentation only where a definition is resolved**

  Apply this exact substitution pattern:

  ```tsx
  // before
  tl.itemName(item.name)

  // after
  tl.catalogItemName(item)
  ```

  In `group-type-slot-entries.tsx`, change `selectedItemName` to return the resolved `ItemDefinition | undefined` rather than a raw string, then compose the button label with `tl.catalogItemName(item)`. In `selected-items-panel.tsx`, add a `catalog: Catalog` prop, resolve each selection against `catalog.byTypeName`, and use `catalogItemName` when found; keep `sel.name` as the defensive fallback. In the attribution popover, render `tl.catalogItemName(r.item)`.

  Do not alter `ItemThumbnail`, selection comparison, dispatch actions, or any lookup predicate using `item.name`.

- [x] **Step 4: Run component tests and typecheck**

  Run: `rtk pnpm --filter @lpc-toolkit/web test -- type-item-picker.test.tsx stack-panel.test.tsx && rtk pnpm --filter @lpc-toolkit/web typecheck`

  Expected: PASS.

- [x] **Step 5: Commit UI label migration**

  ```bash
  rtk git add packages/web/src/components packages/web/test
  rtk git commit -m "feat(web): render catalog display names in UI"
  ```

  - Commit: `061d107296618f400e16996f3cb8d37c1b8751f0`
  - Verification: `rtk pnpm --filter @lpc-toolkit/web test -- type-item-picker.test.tsx stack-panel.test.tsx && rtk pnpm --filter @lpc-toolkit/web typecheck` PASS

### Task 5: Make search, sort, and ZIP filenames use the same display labels

**Files:**
- Modify: `packages/web/src/components/layer-stack/palette-search.ts`
- Modify: `packages/web/src/components/layer-stack/sidebar-search.tsx`
- Modify: `packages/web/test/palette-search.test.ts`
- Modify: `packages/web/src/lib/zip-export.ts`
- Modify: `packages/web/src/components/layer-stack/popovers/download-popover.tsx`
- Modify: `packages/web/test/zip-export.test.ts`

- [x] **Step 1: Add failing search and ZIP tests**

  In `packages/web/test/palette-search.test.ts`, add a palette-search test that passes an item labelled `Normal Bow` with legacy name `Normal`, injects `itemLabel: (item) => item.display_name ?? item.name`, and verifies both queries match:

  ```ts
  expect(resultsFor('normal bow').map((r) => r.item.name)).toContain('Normal');
  expect(resultsFor('normal').map((r) => r.item.name)).toContain('Normal');
  ```

  Also add an `itemFileName` expectation for a provided display label:

  ```ts
  expect(itemFileName({ name: 'Normal Bow', zPos: 100 })).toBe('100 normal_bow.png');
  ```

- [x] **Step 2: Run the focused tests and confirm failure**

  Run: `rtk pnpm --filter @lpc-toolkit/web test -- palette-search.test.ts zip-export.test.ts`

  Expected: FAIL because palette search does not accept a label function and ZIP metadata uses `sel.name`.

- [x] **Step 3: Inject display labels without changing identity lookups**

  Add this optional argument to `PaletteSearchArgs`:

  ```ts
  readonly itemLabel?: (item: ItemDefinition) => string;
  ```

  Use `const label = args.itemLabel?.(item) ?? item.display_name ?? item.name;` for matching and final item-name sorting, while retaining the raw `item.name` match as a second condition. Pass `(item) => tl.catalogItemName(item)` from `SidebarSearch`, and render the same label in each result row.

  Add an optional `itemLabel?: (item: ItemDefinition) => string` to `ExportContext`. In `lookupItemMetas`, after locating the definition by legacy `(typeName, name)`, set metadata `name` to `ctx.itemLabel?.(item) ?? item.display_name ?? item.name`. Pass `tl.catalogItemName` from `download-popover.tsx` into the export context. Do not change `itemId`, selection names, credit files, or error identifiers.

- [x] **Step 4: Run focused tests and typecheck**

  Run: `rtk pnpm --filter @lpc-toolkit/web test -- palette-search.test.ts zip-export.test.ts && rtk pnpm --filter @lpc-toolkit/web typecheck`

  Expected: PASS.

- [x] **Step 5: Commit search and export label behavior**

  ```bash
  rtk git add packages/web/src/components/layer-stack/sidebar-search.tsx packages/web/src/components/layer-stack/palette-search.ts packages/web/src/components/layer-stack/popovers/download-popover.tsx packages/web/src/lib/zip-export.ts packages/web/test/palette-search.test.ts packages/web/test/zip-export.test.ts
  rtk git commit -m "feat(web): use display names in search and exports"
  ```

  - Commit: `a1db3244c017992c6cc262423fe5848bb2082ceb`
  - Verification: `rtk pnpm --filter @lpc-toolkit/web test -- palette-search.test.ts zip-export.test.ts && rtk pnpm --filter @lpc-toolkit/web typecheck` PASS

### Task 6: Verify compatibility and the complete workspace

**Files:**
- Modify: `docs/superpowers/plans/2026-06-22-asset-display-name-separation.md`

- [x] **Step 1: Add explicit legacy compatibility tests**

  In the existing URL-hash and preset tests, assert the legacy identity remains valid:

  ```ts
  expect(parseHash('sex=male&weapon=Normal_dark', catalog, palettes).selections.items.weapon).toMatchObject({
    typeName: 'weapon', name: 'Normal', variant: 'dark',
  });
  expect(serializeHash({ bodyType: 'male', items: { weapon: { typeName: 'weapon', name: 'Normal', variant: 'dark' } } }))
    .toContain('weapon=Normal_dark');
  ```

  Keep the existing Ranger preset expectation as `name: 'Normal'`.

- [x] **Step 2: Run targeted compatibility tests**

  Run: `rtk pnpm --filter @lpc-toolkit/core test -- hash.test.ts credits.test.ts compose.test.ts && rtk pnpm --filter @lpc-toolkit/web test -- presets.test.ts url-hash-sync.test.ts`

  Expected: PASS, proving display labels do not alter identity, composition, or credit generation.

- [x] **Step 3: Run full verification**

  Run: `rtk pnpm typecheck && rtk pnpm test && rtk git diff --check`

  Expected: every command exits 0.

- [x] **Step 4: Record final verification and commit plan status**

  Mark every completed checkbox in this plan. Under each task, add the actual commit hash and verification result. Commit the plan-status update:

  ```bash
  rtk git add docs/superpowers/plans/2026-06-22-asset-display-name-separation.md
  rtk git commit -m "docs: record display-name implementation verification"
  ```

  Expected: a clean worktree after the commit.

  - Commit for tests: `a5df41c8e87348923512b805650c82de6d182fa4`
  - Verification: `rtk pnpm typecheck && rtk pnpm test && rtk git diff --check` PASS (all checks, typecheck, and 441/441 web + 74/74 core tests passed)
