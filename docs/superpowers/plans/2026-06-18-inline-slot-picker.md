# Inline Inactive Slot Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the style/item picker for inactive slots to render inline directly beneath their clicked placeholder buttons, avoiding scroll displacement in long slot groups.

**Architecture:** Wrap the slot list map in `GroupTypeSlotEntries.tsx` in a column flex wrapper, place the `TypeItemPicker` inside that wrapper conditionally, and remove the bottom-level picker block.

**Tech Stack:** React, TypeScript, Vitest

---

### Task 1: Refactor GroupTypeSlotEntries Inlining

**Files:**
- Modify: `packages/web/src/components/layer-stack/group-type-slot-entries.tsx`
- Test: `packages/web/test/group-type-slot-entries.test.tsx`

- [ ] **Step 1: Modify GroupTypeSlotEntries.tsx**
  Refactor the list map return value to wrap the button in a column `div` and render `TypeItemPicker` inside it:
  - Add wrapper: `<div key={typeName} className="w-full flex flex-col gap-1">`
  - Render `TypeItemPicker` underneath the button: `{selected && !state.selections[typeName] && ( <div className="rounded-md border border-border bg-app pt-2 mt-1"> <TypeItemPicker ... /> </div> )}`
  - Remove the duplicate rendering of `TypeItemPicker` at the end of `GroupTypeSlotEntries.tsx` (lines 153-170).

- [ ] **Step 2: Run unit tests to verify changes**
  Run: `rtk pnpm --filter @lpc-toolkit/web test packages/web/test/group-type-slot-entries.test.tsx`
  Expected: PASS

- [ ] **Step 3: Verify entire test suite**
  Run: `rtk pnpm --filter @lpc-toolkit/web test`
  Expected: PASS

- [ ] **Step 4: Commit changes**
  ```bash
  rtk git add packages/web/src/components/layer-stack/group-type-slot-entries.tsx
  rtk git commit -m "feat: inline inactive slot picker under its trigger button"
  ```
