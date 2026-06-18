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

- [ ] **Step 1: Update group-type-slot-entries.tsx button styling**

Update the toggle button styling in `GroupTypeSlotEntries` to use a transparent background, dashed border, and muted text color. Under hover, transition to `bg-surface-2`, `text-text`, and standard border.

```tsx
      <button
        type="button"
        disabled={isDisabled}
        aria-expanded={sectionOpen}
        onClick={onToggleSection}
        className={[
          'flex w-full items-center justify-between rounded-md bg-transparent border border-dashed border-border px-3 py-2 text-left text-xs font-semibold text-text-mute transition-colors',
          isDisabled
            ? 'cursor-not-allowed opacity-40'
            : 'hover:bg-surface-2 hover:text-text hover:border-border cursor-pointer',
        ].join(' ')}
      >
```

- [ ] **Step 2: Add test assertion for GroupTypeSlotEntries button classes**

In `packages/web/test/group-type-slot-entries.test.tsx`, add an assertion verifying that the toggle button contains `bg-transparent border-dashed text-text-mute`.

```typescript
    expect(html).toContain('bg-transparent');
    expect(html).toContain('border-dashed');
    expect(html).toContain('text-text-mute');
```

- [ ] **Step 3: Run Vitest tests to verify GroupTypeSlotEntries**

Run command to run the group-type-slot-entries test file.
Run: `pnpm --filter web test group-type-slot-entries.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit changes for Task 2**

```bash
git add packages/web/src/components/layer-stack/group-type-slot-entries.tsx packages/web/test/group-type-slot-entries.test.tsx
git commit -m "feat: style collapsible slot toggle button with flat/dashed design"
```

---

### Task 3: Build & Whole Workspace Verification

**Files:**
- None (verification task)

- [ ] **Step 1: Run TypeScript typecheck**

Run: `pnpm typecheck`
Expected: PASS (all workspace packages build successfully without type errors)

- [ ] **Step 2: Run all Vitest tests**

Run: `pnpm --filter web test run`
Expected: PASS (all tests pass successfully)

- [ ] **Step 3: Build production bundle to verify compilation**

Run: `pnpm --filter web build`
Expected: Build passes without bundle errors.
