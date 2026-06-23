# Relocate Asset Customizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relocate the 7 customized asset sheet definition JSON files from the ignored `assets/` directory to a new Git-tracked directory `assets_custom/sheet_definitions/`, and update the loading logic (Vite glob and Node script walking) to merge/override them at load time. Revert the Git operations from `packages/web/scripts/asset-release.ts`.

**Architecture:** 
1. Create `assets_custom/sheet_definitions/` maintaining the same directory layout. Copy the 7 customized JSON files to it. Remove the customized versions from `assets/` tracking.
2. Revert the git operations in `packages/web/scripts/asset-release.ts` that revert modifications under `assets/`.
3. Update `packages/web/src/catalog/load-catalog.ts` to eager-glob both `assets/` and `assets_custom/` sheet definitions and merge them (so custom definitions override standard ones). Update `load-catalog.test.ts` to test key normalization for custom paths.
4. Update `walkJson` catalog loaders in Node scripts (`validate-assets.ts`, `copy-spritesheets.ts`, `gen-i18n-data.ts`, `audit-thumbnail-visible-bounds.ts`) and tests (`presets.test.ts`, `category-groups.test.ts`, `i18n.test.ts`, `integration.test.ts`, `random-outfit-variant-audit.test.ts`, `thumbnail-visible-bounds-audit.test.ts`) to merge `assets_custom/sheet_definitions` if it exists.
5. In `packages/core/test/catalog.test.ts`, load fixtures from `assets_custom/` if they exist, otherwise fall back to `assets/`.

**Tech Stack:** TypeScript strict mode, React 18, Vite, Vitest, pnpm workspaces.

---

### Task 1: Revert Git Operations and Relocate JSON Files

**Files:**
- Modify: `packages/web/scripts/asset-release.ts` (Revert Git commands)
- Create: `assets_custom/sheet_definitions/weapons/ranged/bow/weapon_ranged_bow_normal.json`
- Create: `assets_custom/sheet_definitions/weapons/ranged/bow/weapon_ranged_bow_great.json`
- Create: `assets_custom/sheet_definitions/weapons/ranged/bow/weapon_ranged_bow_recurve.json`
- Create: `assets_custom/sheet_definitions/weapons/ranged/bow/weapon_ranged_bow_arrow.json`
- Create: `assets_custom/sheet_definitions/hair/afro/hair_natural.json`
- Create: `assets_custom/sheet_definitions/hair/short/hair_plain.json`
- Create: `assets_custom/sheet_definitions/head/faces/face_neutral.json`

- [x] **Step 1: Copy customized files to `assets_custom/sheet_definitions/`**
  Copy the 7 files from `assets/sheet_definitions/` to `assets_custom/sheet_definitions/` maintaining their paths.
  Commit them to Git.

- [x] **Step 2: Revert git checkout blocks in `packages/web/scripts/asset-release.ts`**
  Remove the `git checkout -- assets/sheet_definitions` and `git checkout -- assets/palette_definitions` try-catch blocks.

- [x] **Step 3: Remove custom definitions from `assets/` git tracking**
  Run: `git rm -r --cached assets/sheet_definitions/` (and then re-run prepare-assets to restore un-customized release versions under `assets/`).
  Verify `git status` shows the files deleted from tracking.

- [x] **Step 4: Commit relocations and reverts**
  Commit the files relocation and `asset-release.ts` changes.

---

### Task 2: Update Web Catalog Loader and Vite Globbing

**Files:**
- Modify: `packages/web/src/catalog/load-catalog.ts`
- Modify: `packages/web/test/load-catalog.test.ts`

- [x] **Step 1: Update `normalizeUpstreamKey` and add custom glob**
  In `packages/web/src/catalog/load-catalog.ts`, add `ASSETS_CUSTOM_PREFIX = 'assets_custom/sheet_definitions/'` and support it in `normalizeUpstreamKey`.
  In `loadCatalogFromUpstream`, add `modsCustom` glob for `../../../../assets_custom/sheet_definitions/**/*.json`.
  Iterate over `modsCustom` to overwrite keys in `records`.

- [x] **Step 2: Add key-normalization test for custom path**
  In `packages/web/test/load-catalog.test.ts`, add a test case checking that `normalizeUpstreamKey` strips the glob prefix for `assets_custom/sheet_definitions/`.

- [x] **Step 3: Run web catalog loader tests**
  Run: `pnpm --filter @lpc-toolkit/web test -- load-catalog.test.ts`
  Expected: PASS

- [x] **Step 4: Commit loader changes**
  Commit.

---

### Task 3: Update Core Catalog Tests

**Files:**
- Modify: `packages/core/test/catalog.test.ts`

- [x] **Step 1: Update `loadFixture` in `packages/core/test/catalog.test.ts`**
  Import `existsSync` from `'node:fs'`.
  Define `customRoot = path.join(here, '../../../assets_custom/sheet_definitions')`.
  In `loadFixture`, check if the file exists under `customRoot`. If yes, read from `customRoot`, else read from `upstreamRoot`.

- [x] **Step 2: Run core catalog tests**
  Run: `pnpm --filter @lpc-toolkit/core test -- catalog.test.ts`
  Expected: PASS

- [x] **Step 3: Commit core catalog test updates**
  Commit.

---

### Task 4: Update Script Walkers and Helper Walkers

**Files:**
- Modify: `packages/web/scripts/validate-assets.ts`
- Modify: `packages/web/scripts/copy-spritesheets.ts`
- Modify: `packages/web/scripts/gen-i18n-data.ts`
- Modify: `packages/web/scripts/audit-thumbnail-visible-bounds.ts`
- Modify: `packages/web/test/presets.test.ts`
- Modify: `packages/web/test/category-groups.test.ts`
- Modify: `packages/web/test/i18n.test.ts`
- Modify: `packages/web/test/integration.test.ts`
- Modify: `packages/web/test/random-outfit-variant-audit.test.ts`
- Modify: `packages/web/test/thumbnail-visible-bounds-audit.test.ts`

- [x] **Step 1: Update `walkJson` execution patterns**
  For each file above that executes `walkJson` or readdir on `sheetDefsDir`, import `existsSync` if not present.
  Define `customDefsDir = path.join(repoRoot, 'assets_custom/sheet_definitions')` (or relative path appropriately).
  If `existsSync(customDefsDir)`, run `walkJson` on it and merge it using `Object.assign(records, walkJson(customDefsDir))`.

- [x] **Step 2: Run all web tests and verify typecheck**
  Run: `pnpm --filter @lpc-toolkit/web test && pnpm --filter @lpc-toolkit/web typecheck`
  Expected: PASS

- [x] **Step 3: Commit all script walker updates**
  Commit.

---

### Task 5: Run Full Suite Verification

- [x] **Step 1: Run complete build and test suite**
  Run: `pnpm typecheck && pnpm test`
  Expected: PASS

- [x] **Step 2: Commit plan status update**
  Commit the plan with updated checkboxes.
