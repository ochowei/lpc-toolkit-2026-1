# Inline Selected Slot Replace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make lower selected slot `Replace` entries open their replacement picker inline under the clicked entry while keeping that entry highlighted.

**Architecture:** Keep `expanded` as the selected `LayerRow` detail state and add `expandedSlotType` inside `StackPanel` for lower slot-list detail state. `GroupTypeSlotEntries` renders `TypeItemPicker` when `expandedSlotType === typeName`, regardless of whether the type is selected.

**Tech Stack:** TypeScript strict mode, React 18, Vitest, React DOM server rendering, pnpm workspaces.

---

## File Structure

- Modify `packages/web/src/components/layer-stack/group-type-slot-entries.tsx`
  - Replace the current `expanded`/`setExpanded` slot-entry contract with `expandedSlotType`/`onToggleSlotType`.
  - Render the inline picker for selected and unselected slot entries.
- Modify `packages/web/src/components/layer-stack/stack-panel.tsx`
  - Own `expandedSlotType`.
  - Coordinate row toggles and slot toggles so the same type does not show two pickers.
  - Keep search/add navigation opening lower slot pickers for inactive types.
- Modify `packages/web/test/group-type-slot-entries.test.tsx`
  - Update props for the new slot-entry contract.
  - Add focused tests for selected-slot inline picker rendering and highlighted state.
- Modify `packages/web/test/stack-panel.test.tsx`
  - Update expectations that currently depend on selected slots opening through `expanded`.
  - Add tests for row/slot independence visible from server-rendered markup.
- Modify `docs/superpowers/plans/2026-06-19-inline-selected-slot-replace.md`
  - Update task checkboxes, implementation notes, commit hashes, and verification status after each implementation task.

### Task 1: Group Slot Entry Contract Tests

**Files:**
- Modify: `packages/web/test/group-type-slot-entries.test.tsx`
- Modify: `docs/superpowers/plans/2026-06-19-inline-selected-slot-replace.md`

- [x] **Step 1: Update the test helper props**
  - Implementation note: Updated `renderEntries` to pass `expandedSlotType` and `onToggleSlotType`.
  - Commit: not committed
  - Verification: group-type-slot-entries FAIL as expected before implementation

Replace the current `renderEntries` helper with this version:

```tsx
function renderEntries(args: {
  readonly sectionOpen: boolean;
  readonly expandedSlotType?: TypeName | null;
}): string {
  return renderToStaticMarkup(
    <GroupTypeSlotEntries
      disabled={false}
      sectionOpen={args.sectionOpen}
      onToggleSection={() => {}}
      typeNames={['head', 'expression', 'ears']}
      catalog={catalog}
      palettes={palettes}
      state={state}
      dispatch={() => {}}
      tl={createLabelTranslator('en')}
      t={createTranslator('en')}
      licenseFilter={ALL_LICENSE_GROUPS}
      animationFilter={new Set()}
      expandedSlotType={args.expandedSlotType ?? null}
      onToggleSlotType={() => {}}
      replacementCardDisplayMode="overlay"
      onReplacementCardDisplayModeChange={() => {}}
    />,
  );
}
```

- [x] **Step 2: Update the unselected inline picker test**
  - Implementation note: Renamed the unselected slot inline picker test and switched it to `expandedSlotType`.
  - Commit: not committed
  - Verification: group-type-slot-entries FAIL as expected before implementation

Replace the existing test named `keeps the inline picker visible for the active unselected type` with:

```tsx
it('keeps the inline picker visible for the active unselected slot entry', () => {
  const html = renderEntries({ sectionOpen: true, expandedSlotType: 'head' });

  expect(html).toContain('Swap head');
  expect(html).toContain('Human Male');
});
```

- [x] **Step 3: Add selected slot inline picker coverage**
  - Implementation note: Added coverage for opening the inline picker under the selected `expression` slot entry.
  - Commit: not committed
  - Verification: group-type-slot-entries FAIL as expected before implementation

Add this test after the unselected inline picker test:

```tsx
it('opens the inline picker under a selected slot entry', () => {
  const html = renderEntries({
    sectionOpen: true,
    expandedSlotType: 'expression',
  });

  expect(html).toContain('expression: Neutral - Replace');
  expect(html).toContain('Swap expression');
  expect(html).toContain('Neutral');
  expect(html).toContain('border-accent bg-accent/10 text-text');
  expect(html).toContain('aria-expanded="true"');
});
```

- [x] **Step 4: Run the focused test and verify it fails**
  - Implementation note: Focused test run verifies the red state before component implementation.
  - Commit: not committed
  - Verification: group-type-slot-entries FAIL as expected before implementation

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- group-type-slot-entries
```

Expected: FAIL because `GroupTypeSlotEntries` does not yet accept `expandedSlotType` or `onToggleSlotType`.

- [x] **Step 5: Update the plan file**
  - Implementation note: Recorded Task 1 completion state without committing.
  - Commit: not committed
  - Verification: group-type-slot-entries FAIL as expected before implementation

Update this task checkbox block with:

```markdown
  - Verification: group-type-slot-entries FAIL as expected before implementation
```

Do not commit yet.

### Task 2: Implement Inline Slot Expansion

**Files:**
- Modify: `packages/web/src/components/layer-stack/group-type-slot-entries.tsx`
- Modify: `docs/superpowers/plans/2026-06-19-inline-selected-slot-replace.md`

- [x] **Step 1: Change the component props**
  - Implementation note: Replaced the slot-entry expansion props with `expandedSlotType` and `onToggleSlotType`.
  - Commit: bb0190e97
  - Verification: rtk pnpm --filter @lpc-toolkit/web test -- group-type-slot-entries PASS

In `Props`, replace:

```ts
  expanded: TypeName | null;
  setExpanded: (v: TypeName | null) => void;
```

with:

```ts
  expandedSlotType: TypeName | null;
  onToggleSlotType: (typeName: TypeName) => void;
```

- [x] **Step 2: Update destructuring**
  - Implementation note: Updated `GroupTypeSlotEntries` destructuring to use the new slot expansion props.
  - Commit: bb0190e97
  - Verification: rtk pnpm --filter @lpc-toolkit/web test -- group-type-slot-entries PASS

In the `GroupTypeSlotEntries` function parameter destructuring, replace:

```ts
  expanded,
  setExpanded,
```

with:

```ts
  expandedSlotType,
  onToggleSlotType,
```

- [x] **Step 3: Update slot selected state and click handler**
  - Implementation note: Derived selected slot state from `expandedSlotType` and delegated clicks through `onToggleSlotType`.
  - Commit: bb0190e97
  - Verification: rtk pnpm --filter @lpc-toolkit/web test -- group-type-slot-entries PASS

Inside the `typeNames.map` callback, replace:

```tsx
            const selected = expanded === typeName;
```

with:

```tsx
            const selected = expandedSlotType === typeName;
```

Then replace the slot button `onClick`:

```tsx
                  onClick={() => setExpanded(selected ? null : typeName)}
```

with:

```tsx
                  onClick={() => onToggleSlotType(typeName)}
```

- [x] **Step 4: Render the picker for selected and unselected expanded slots**
  - Implementation note: Removed the selection guard so expanded selected slots render their inline replacement picker.
  - Commit: bb0190e97
  - Verification: rtk pnpm --filter @lpc-toolkit/web test -- group-type-slot-entries PASS

Replace:

```tsx
                {selected && !state.selections[typeName] && (
```

with:

```tsx
                {selected && (
```

- [x] **Step 5: Run the focused test and verify it passes**
  - Implementation note: Ran the focused web test target after implementation.
  - Commit: bb0190e97
  - Verification: rtk pnpm --filter @lpc-toolkit/web test -- group-type-slot-entries PASS

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- group-type-slot-entries
```

Expected: PASS.

- [x] **Step 6: Commit the component and test changes**
  - Implementation note: Committed the component implementation with the Task 1 focused test updates.
  - Commit: bb0190e97
  - Verification: rtk pnpm --filter @lpc-toolkit/web test -- group-type-slot-entries PASS

Run:

```bash
rtk git add packages/web/src/components/layer-stack/group-type-slot-entries.tsx packages/web/test/group-type-slot-entries.test.tsx
rtk git commit -m "fix: render selected slot replacement inline"
```

- [x] **Step 7: Update the plan file**
  - Implementation note: Recorded Task 2 implementation notes, commit hash, and focused verification status.
  - Commit: bb0190e97
  - Verification: rtk pnpm --filter @lpc-toolkit/web test -- group-type-slot-entries PASS

Run:

```bash
rtk git rev-parse --short HEAD
```

Then update this task with the returned commit hash and:

```markdown
  - Verification: rtk pnpm --filter @lpc-toolkit/web test -- group-type-slot-entries PASS
```

- [x] **Step 8: Commit the plan status update**
  - Implementation note: Prepared the Task 2 plan status update for the docs-only commit.
  - Commit: bb0190e97
  - Verification: rtk pnpm --filter @lpc-toolkit/web test -- group-type-slot-entries PASS

Run:

```bash
rtk git add docs/superpowers/plans/2026-06-19-inline-selected-slot-replace.md
rtk git commit -m "docs: record inline slot render status"
```

### Task 3: StackPanel State Coordination Tests

**Files:**
- Modify: `packages/web/test/stack-panel.test.tsx`
- Modify: `docs/superpowers/plans/2026-06-19-inline-selected-slot-replace.md`

- [ ] **Step 1: Update current selected-slot expectation**

Replace the test named `opens an inline picker for a selected type with the current item marked selected` with:

```tsx
it('does not open a lower selected slot picker from selected row expansion alone', () => {
  const selectedClothesState: SliceState = {
    ...state,
    selections: {
      ...state.selections,
      clothes: { typeName: 'clothes', name: 'Long Sleeve' },
    },
  };

  const html = renderPanel({ state: selectedClothesState, expanded: 'clothes' });

  expect(html).toContain('Long Sleeve');
  expect(html).toContain('Swap clothes');
  expect(html).toContain('Short Sleeve');
  expect(html).not.toContain('clothes: Long Sleeve - Replace');
});
```

- [ ] **Step 2: Add a server-rendered selected row control test**

Add this test after the replacement from Step 1:

```tsx
it('keeps the selected row picker available from selected row expansion', () => {
  const selectedClothesState: SliceState = {
    ...state,
    selections: {
      ...state.selections,
      clothes: { typeName: 'clothes', name: 'Long Sleeve' },
    },
  };

  const html = renderPanel({ state: selectedClothesState, expanded: 'clothes' });

  expect(html).toContain('Swap clothes');
  expect(html).toContain('Short Sleeve');
  expect(html).toContain('border-accent bg-accent/10 text-text');
});
```

- [ ] **Step 3: Run the focused StackPanel test and verify it fails**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- stack-panel
```

Expected: FAIL because `StackPanel` still passes the old `expanded`/`setExpanded` props to `GroupTypeSlotEntries`.

- [ ] **Step 4: Update the plan file**

Update this task checkbox block with:

```markdown
  - Verification: stack-panel FAIL as expected before StackPanel implementation
```

Do not commit yet.

### Task 4: Implement StackPanel Slot State

**Files:**
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`
- Modify: `docs/superpowers/plans/2026-06-19-inline-selected-slot-replace.md`

- [ ] **Step 1: Add slot expansion state**

After:

```ts
  const [adding, setAdding] = useState(false);
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);
```

add:

```ts
  const [expandedSlotType, setExpandedSlotType] = useState<TypeName | null>(null);
```

- [ ] **Step 2: Add row and slot toggle helpers**

After the `sections` memo, add:

```ts
  const toggleRowType = (typeName: TypeName) => {
    setExpanded(expanded === typeName ? null : typeName);
    if (expandedSlotType === typeName) {
      setExpandedSlotType(null);
    }
  };

  const toggleSlotType = (typeName: TypeName) => {
    setExpandedSlotType(expandedSlotType === typeName ? null : typeName);
    if (expanded === typeName) {
      setExpanded(null);
    }
  };
```

- [ ] **Step 3: Update search/add navigation**

Replace the current `expandType` helper with:

```ts
  const expandType = (typeName: TypeName) => {
    const nextSectionId = sectionIdForTypeNavigation({
      sections,
      state,
      typeName,
    });
    if (nextSectionId === undefined) {
      setExpanded(typeName);
      if (expandedSlotType === typeName) {
        setExpandedSlotType(null);
      }
      return;
    }

    setExpanded(null);
    setExpandedSlotType(typeName);
    setExpandedSectionId(nextSectionId);
  };
```

- [ ] **Step 4: Clear invalid slot expansion**

After the existing effect that clears invalid `expanded`, add:

```ts
  useEffect(() => {
    if (expandedSlotType && !shownTypeNames.includes(expandedSlotType)) {
      setExpandedSlotType(null);
    }
  }, [expandedSlotType, shownTypeNames]);
```

- [ ] **Step 5: Wire row toggles through the helper**

Replace:

```tsx
                    onToggle={() => setExpanded(expanded === tn ? null : tn)}
```

with:

```tsx
                    onToggle={() => toggleRowType(tn)}
```

- [ ] **Step 6: Wire slot entries through the new props**

Replace the `GroupTypeSlotEntries` props:

```tsx
                expanded={expanded}
                setExpanded={setExpanded}
```

with:

```tsx
                expandedSlotType={expandedSlotType}
                onToggleSlotType={toggleSlotType}
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- group-type-slot-entries stack-panel sidebar-slot-section
```

Expected: PASS.

- [ ] **Step 8: Commit StackPanel coordination**

Run:

```bash
rtk git add packages/web/src/components/layer-stack/stack-panel.tsx packages/web/test/stack-panel.test.tsx
rtk git commit -m "fix: separate slot and row replacement expansion"
```

- [ ] **Step 9: Update the plan file**

Run:

```bash
rtk git rev-parse --short HEAD
```

Then update this task with the returned commit hash and:

```markdown
  - Verification: rtk pnpm --filter @lpc-toolkit/web test -- group-type-slot-entries stack-panel sidebar-slot-section PASS
```

- [ ] **Step 10: Commit the plan status update**

Run:

```bash
rtk git add docs/superpowers/plans/2026-06-19-inline-selected-slot-replace.md
rtk git commit -m "docs: record slot expansion coordination status"
```

### Task 5: Final Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-19-inline-selected-slot-replace.md`

- [ ] **Step 1: Run typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [ ] **Step 2: Run focused test suite**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- group-type-slot-entries stack-panel sidebar-slot-section
```

Expected: PASS.

- [ ] **Step 3: Inspect final diff**

Run:

```bash
rtk git diff --stat origin/main...HEAD
rtk git diff --check origin/main...HEAD
```

Expected: the stat includes only the spec, plan, two component files, and two test files. `git diff --check` exits cleanly.

- [ ] **Step 4: Update the plan file**

Update this task with:

```markdown
  - Commit: no code commit, verification only
  - Verification: typecheck PASS; focused tests PASS; diff check PASS
```

- [ ] **Step 5: Commit the final plan status**

Run:

```bash
rtk git add docs/superpowers/plans/2026-06-19-inline-selected-slot-replace.md
rtk git commit -m "docs: record inline selected slot verification"
```
