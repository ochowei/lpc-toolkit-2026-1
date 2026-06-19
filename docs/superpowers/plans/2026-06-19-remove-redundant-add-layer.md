# Remove Redundant Add Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the redundant bottom-of-sidebar Add layer control while preserving the per-category slot picker as the sole path for adding layers.

**Architecture:** `StackPanel` already derives both the section slot list and Add layer's inactive list from `shownTypeNames`; remove only the duplicate Add layer branch and its state. The existing `GroupTypeSlotEntries` and `TypeItemPicker` remain unchanged, so category membership, selection, compatibility, and attribution are unaffected.

**Tech Stack:** React 18, TypeScript strict mode, Vitest, pnpm

---

### Task 1: Establish the sidebar regression test

**Files:**
- Modify: `packages/web/test/stack-panel.test.tsx`

- [ ] **Step 1: Add the failing assertion to the existing category-rendering test**

  In `renders every upstream group and keeps empty groups visible`, append this assertion after the existing inactive-slot assertions:

  ```ts
  expect(html).not.toContain('Add layer');
  ```

  This test uses the English translator and renders the complete `StackPanel`, so it detects the user-visible duplicate control rather than an implementation detail.

- [ ] **Step 2: Run the targeted test and verify the expected failure**

  Run:

  ```bash
  rtk pnpm --filter @lpc-toolkit/web test test/stack-panel.test.tsx
  ```

  Expected: FAIL because the current `AddLayer` button renders the text `Add layer`.

- [ ] **Step 3: Commit the failing test**

  ```bash
  rtk git add packages/web/test/stack-panel.test.tsx
  rtk git commit -m "test(web): cover absence of redundant add layer control"
  ```

  Record the commit hash and the targeted-test failure in this plan.

### Task 2: Remove the duplicate UI and its unused translations

**Files:**
- Delete: `packages/web/src/components/layer-stack/add-layer.tsx`
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`
- Modify: `packages/web/src/i18n.ts`
- Test: `packages/web/test/stack-panel.test.tsx`

- [ ] **Step 1: Remove AddLayer integration from StackPanel**

  In `packages/web/src/components/layer-stack/stack-panel.tsx`:

  ```ts
  // Delete this import.
  import { AddLayer } from './add-layer';

  // Delete this state declaration.
  const [adding, setAdding] = useState(false);
  ```

  Delete the complete `<AddLayer ... />` block below the mapped category
  sections. Do not change `active`, `inactive`, `sections`, or
  `GroupTypeSlotEntries`: `inactive` remains part of the layer count and the
  per-section slot disclosure continues to add compatible layers.

- [ ] **Step 2: Delete the obsolete component and translations**

  Delete `packages/web/src/components/layer-stack/add-layer.tsx`.

  In `packages/web/src/i18n.ts`, delete these English and Traditional Chinese
  entries, which have no remaining consumer:

  ```ts
  'add.button': 'Add layer',
  'add.available': 'available',
  'add.button': '加圖層',
  'add.available': '可選',
  ```

- [ ] **Step 3: Run the targeted test and verify it passes**

  Run:

  ```bash
  rtk pnpm --filter @lpc-toolkit/web test test/stack-panel.test.tsx
  ```

  Expected: PASS. The test confirms all ten sections still render and that
  the Add layer text is absent.

- [ ] **Step 4: Confirm no obsolete reference remains**

  Run:

  ```bash
  rtk rg -n "AddLayer|'add\\.|add\\.available" packages/web/src packages/web/test
  ```

  Expected: no matches. This check intentionally excludes documentation,
  which may retain historical wording.

- [ ] **Step 5: Commit the implementation**

  ```bash
  rtk git add packages/web/src/components/layer-stack/stack-panel.tsx packages/web/src/components/layer-stack/add-layer.tsx packages/web/src/i18n.ts packages/web/test/stack-panel.test.tsx
  rtk git commit -m "refactor(web): remove redundant add layer control"
  ```

  Record the commit hash and targeted-test result in this plan.

### Task 3: Verify the web package and workspace

**Files:**
- Modify: `docs/superpowers/plans/2026-06-19-remove-redundant-add-layer.md` (checkboxes and verification notes only)

- [ ] **Step 1: Run the web test suite**

  Run:

  ```bash
  rtk pnpm --filter @lpc-toolkit/web test
  ```

  Expected: PASS.

- [ ] **Step 2: Run strict type checking for all workspaces**

  Run:

  ```bash
  rtk pnpm typecheck
  ```

  Expected: PASS.

- [ ] **Step 3: Record verification and commit the plan status**

  Mark each completed checkbox in this plan. Under the completed task,
  record the implementation commit hash and the exact PASS results from
  Steps 1 and 2. Then commit the status update:

  ```bash
  rtk git add docs/superpowers/plans/2026-06-19-remove-redundant-add-layer.md
  rtk git commit -m "docs: record add layer removal verification"
  ```
