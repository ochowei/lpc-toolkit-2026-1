# Sidebar Layout Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the left asset sidebar layout to match the user's screenshot reference, creating a card-based active selection view and cleaner full-width inactive slot expanders.

**Architecture:** We will modify `LayerRow.tsx` to style active rows as rounded cards with integrated category metadata and right-aligned actions, adjust `GroupTypeSlotEntries.tsx` to use full-width sleek slot toggles, and verify everything with tests.

**Tech Stack:** React, Tailwind CSS v4, TypeScript, Vitest

---

### Task 1: Re-style Active Layer Card (LayerRow)

**Files:**
- Modify: `packages/web/src/components/layer-stack/layer-row.tsx`
- Test: `packages/web/test/layer-row.test.tsx`

- [x] **Step 1: Modify LayerRow.tsx implementation**
  Update the main wrapper and button inside `LayerRow` to use card styling:
  - Add card classes: `mb-2 rounded-lg border border-border bg-surface-2 p-2.5 transition hover:bg-surface-3 shadow-sm`
  - Re-align the title and subtitle metadata vertically. Put the uppercase category label (`tl.category(typeName)`) and variant/swatches on the same line.
  - Position the clear button `✕` and the collapse/expand state arrow `▶` / `▼` on the right side using a flex row.
  - Keep thumbnail size at 28px (`size={28}`) to maintain compatibility with existing tests.
  - Commit: 87701177f
  - Verification: Manual review of styled code

- [x] **Step 2: Run unit tests to verify LayerRow**
  Run: `rtk pnpm --filter @lpc-toolkit/web test packages/web/test/layer-row.test.tsx`
  Expected: PASS
  - Commit: 87701177f
  - Verification: `rtk pnpm --filter @lpc-toolkit/web test test/layer-row.test.tsx` PASS

- [x] **Step 3: Commit changes**
  ```bash
  rtk git add packages/web/src/components/layer-stack/layer-row.tsx
  rtk git commit -m "feat: redesign active layer row to card layout"
  ```
  - Commit: 87701177f, refactored in 49c822426, e44771c2c, and 256b501f8 (vertical flex layout, nested caret, and clear button hover improvements)

---

### Task 2: Re-style Inactive Slot Expanders (GroupTypeSlotEntries)

**Files:**
- Modify: `packages/web/src/components/layer-stack/group-type-slot-entries.tsx`
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`
- Test: `packages/web/test/group-type-slot-entries.test.tsx`
- Test: `packages/web/test/stack-panel.test.tsx`

- [ ] **Step 1: Modify GroupTypeSlotEntries.tsx**
  Update the slot toggle button to be full-width and clean:
  - Add classes: `flex w-full items-center justify-between rounded-md bg-surface-2 border border-border px-3 py-2 text-left text-xs font-semibold text-text-2 hover:bg-surface-3 cursor-pointer`
  - Replace `▸` / `▾` with `▶` / `▼` (or appropriate orientation matching the design).
  - Style the expanded slot placeholder buttons: make them clean, full-width or inline buttons that match the card aesthetic.

- [ ] **Step 2: Modify StackPanel.tsx placeholder**
  - Locate the "No layer selected" text placeholder rendering in `StackPanel.tsx` (around lines 154-156) and style it to match the screenshot: a subtle, italic text placeholder `italic text-text-mute text-xs px-3 py-2`.

- [ ] **Step 3: Run unit tests to verify slot entries and stack panel**
  Run: `rtk pnpm --filter @lpc-toolkit/web test packages/web/test/group-type-slot-entries.test.tsx packages/web/test/stack-panel.test.tsx`
  Expected: PASS

- [ ] **Step 4: Commit changes**
  ```bash
  rtk git add packages/web/src/components/layer-stack/group-type-slot-entries.tsx packages/web/src/components/layer-stack/stack-panel.tsx
  rtk git commit -m "feat: style slot expanders and empty placeholders"
  ```

---

### Task 3: Comprehensive Verification and Linting

**Files:**
- Test: All web tests

- [ ] **Step 1: Run complete test suite and type checking**
  Run: `rtk pnpm --filter @lpc-toolkit/web typecheck`
  Expected: PASS
  Run: `rtk pnpm --filter @lpc-toolkit/web test`
  Expected: PASS

- [ ] **Step 2: Verify in browser**
  Check the UI changes in the browser dev environment to ensure pixel-perfect rendering matching the screenshot.

- [ ] **Step 3: Commit final changes**
  ```bash
  rtk git commit --allow-empty -m "chore: verify layout design and testing success"
  ```
