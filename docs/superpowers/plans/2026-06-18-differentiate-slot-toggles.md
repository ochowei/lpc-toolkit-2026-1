# Differentiate Slot Toggles vs Active Layer Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish clear visual distinction in the left sidebar between active, selected layers (which will have a left accent border highlight) and secondary collapsible slot toggles (which will have a dashed border, transparent background, and muted text flat style).

**Architecture:** Update CSS styling classes in React components using Tailwind CSS utility classes and write test assertions to verify classes.

**Tech Stack:** React 18, Tailwind CSS v4, Vitest, testing-library.

---

### Task 1: Highlight Active Layers with Accent Left Border

**Files:**
- Modify: `packages/web/src/components/layer-stack/layer-row.tsx:54-56`
- Modify: `packages/web/test/layer-row.test.tsx:70-87`

- [x] **Step 1: Update layer-row.tsx wrapper styling**
  - Note: Added border-l-4, border-l-accent, and pl-2 classes.
  - Commit: 8b14a7eca
  - Verification: Checked render wrapper class name.

- [x] **Step 2: Add test assertion for LayerRow classes**
  - Note: Added expect statements for the new classes in layer-row.test.tsx.
  - Commit: 8b14a7eca
  - Verification: Checked test assertions in test file.

- [x] **Step 3: Run Vitest tests to verify LayerRow**
  - Note: Ran vitest for layer-row.test.tsx.
  - Commit: 8b14a7eca
  - Verification: `rtk pnpm --filter web test layer-row.test.tsx` PASS.

- [x] **Step 4: Commit changes for Task 1**
  - Note: Committed staged files with appropriate message.
  - Commit: 8b14a7eca
  - Verification: `git log -n 1` shows the commit.

```bash
git add packages/web/src/components/layer-stack/layer-row.tsx packages/web/test/layer-row.test.tsx
git commit -m "feat: highlight active layer row with left accent border"
```

---

### Task 2: Style Collapsible Slot Toggles with Flat/Dashed Style

**Files:**
- Modify: `packages/web/src/components/layer-stack/group-type-slot-entries.tsx:105-110`
- Modify: `packages/web/test/group-type-slot-entries.test.tsx:47-68`

- [x] **Step 1: Update group-type-slot-entries.tsx button styling**
  - Note: Styling updated to transparent background, dashed border, and muted text.
  - Commit: f18f39f87
  - Verification: Checked rendered classes.

- [x] **Step 2: Add test assertion for GroupTypeSlotEntries button classes**
  - Note: Added assertions for bg-transparent, border-dashed, text-text-mute in test file.
  - Commit: f18f39f87
  - Verification: Checked test file assertions.

- [x] **Step 3: Run Vitest tests to verify GroupTypeSlotEntries**
  - Note: Ran vitest command for group-type-slot-entries.test.tsx.
  - Commit: f18f39f87
  - Verification: `rtk pnpm --filter web test group-type-slot-entries.test.tsx` PASS.

- [x] **Step 4: Commit changes for Task 2**
  - Note: Committed staged files.
  - Commit: f18f39f87
  - Verification: Commit is present in git log.

```bash
git add packages/web/src/components/layer-stack/group-type-slot-entries.tsx packages/web/test/group-type-slot-entries.test.tsx
git commit -m "feat: style collapsible slot toggle button with flat/dashed design"
```

---

### Task 3: Build & Whole Workspace Verification

**Files:**
- None (verification task)

- [x] **Step 1: Run TypeScript typecheck**
  - Note: Checked recursive workspace typechecking.
  - Commit: N/A
  - Verification: `rtk pnpm -r typecheck` PASS.

- [x] **Step 2: Run all Vitest tests**
  - Note: Ran the entire workspace test suite.
  - Commit: N/A
  - Verification: `rtk pnpm --filter @lpc-toolkit/web test` PASS (all 426 tests passed).

- [x] **Step 3: Build production bundle to verify compilation**
  - Note: Built production Vite bundle.
  - Commit: N/A
  - Verification: `rtk pnpm --filter @lpc-toolkit/web build` PASS.
