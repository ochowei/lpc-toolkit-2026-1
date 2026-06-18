# Indent Unselected Slots and Nested Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visual indentation to the unselected slots toggle button and nested slot items in the left sidebar for improved category nesting hierarchy.

**Architecture:** Modify wrapper and inner list class names in the React component `GroupTypeSlotEntries` using Tailwind CSS utility classes and write test assertions.

**Tech Stack:** React 18, Tailwind CSS v4, Vitest.

---

### Task 1: Add Indentation to GroupTypeSlotEntries and Nested Slots

**Files:**
- Modify: `packages/web/src/components/layer-stack/group-type-slot-entries.tsx:99-117`
- Modify: `packages/web/test/group-type-slot-entries.test.tsx:70-90`

- [x] **Step 1: Indent toggle button and slots list in group-type-slot-entries.tsx**
  - Note: Indented wrapper to pl-2 pr-1 and nested slots list to pl-2.
  - Commit: 051403f1e
  - Verification: Checked rendered classes.

- [x] **Step 2: Add test assertion for indentation classes**
  - Note: Added assertions verifying pl-2 pr-1 and mt-1.5 pl-2 classes.
  - Commit: 051403f1e
  - Verification: Verified assertions in test file.

- [x] **Step 3: Run Vitest tests to verify changes**
  - Note: Ran group-type-slot-entries.test.tsx vitest.
  - Commit: 051403f1e
  - Verification: `rtk pnpm --filter web test group-type-slot-entries.test.tsx` PASS.

- [x] **Step 4: Commit changes for Task 1**
  - Note: Staged and committed changes.
  - Commit: 051403f1e
  - Verification: Checked commit log.

```bash
git add packages/web/src/components/layer-stack/group-type-slot-entries.tsx packages/web/test/group-type-slot-entries.test.tsx
git commit -m "feat: indent unselected slots toggle button and nested slot items"
```

---

### Task 2: Build & Whole Workspace Verification

**Files:**
- None (verification task)

- [x] **Step 1: Run TypeScript typecheck**
  - Note: Ran tsc compile on workspace.
  - Commit: N/A
  - Verification: `rtk pnpm -r typecheck` PASS.

- [x] **Step 2: Run all Vitest tests**
  - Note: Ran full vitest suite.
  - Commit: N/A
  - Verification: `rtk pnpm --filter @lpc-toolkit/web test` PASS (all 426 tests passed).

- [x] **Step 3: Build production bundle to verify compilation**
  - Note: Vite production build successful.
  - Commit: N/A
  - Verification: `rtk pnpm --filter @lpc-toolkit/web build` PASS.
