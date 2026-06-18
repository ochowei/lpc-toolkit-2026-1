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

- [ ] **Step 1: Indent toggle button and slots list in group-type-slot-entries.tsx**

Update the outermost container `div` padding to `pl-2 pr-1` and the expanded inner container `div` to include `pl-2`.

```tsx
  return (
    <div className="mt-1 space-y-1 pl-2 pr-1">
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
        <span>{toggleLabel}</span>
        <span aria-hidden>{sectionOpen ? '▼' : '▶'}</span>
      </button>

      {sectionOpen && (
        <div className="flex flex-col gap-1.5 mt-1.5 pl-2">
```

- [ ] **Step 2: Add test assertion for indentation classes**

In `packages/web/test/group-type-slot-entries.test.tsx`, add assertions verifying that the rendered HTML contains the new indentation class `pl-2 pr-1` and the nested list container has `pl-2`.

```typescript
    expect(html).toContain('pl-2 pr-1');
    expect(html).toContain('mt-1.5 pl-2');
```

- [ ] **Step 3: Run Vitest tests to verify changes**

Run command to run the group-type-slot-entries test file.
Run: `pnpm --filter web test group-type-slot-entries.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit changes for Task 1**

```bash
git add packages/web/src/components/layer-stack/group-type-slot-entries.tsx packages/web/test/group-type-slot-entries.test.tsx
git commit -m "feat: indent unselected slots toggle button and nested slot items"
```

---

### Task 2: Build & Whole Workspace Verification

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
