# Sidebar Slot List Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the lower grouped slot list collapse independently while a selected layer row, such as Fin, keeps its style/replacement panel open.

**Architecture:** Keep `expanded: TypeName | null` as the single open type detail picker. Make `expandedSectionId: string | null` the only source of truth for grouped slot-list visibility, and explicitly open the containing group only when search/add navigation targets an unselected type.

**Tech Stack:** TypeScript strict mode, React 18, Vitest with `react-dom/server`, pnpm workspaces, existing `@lpc-toolkit/core` catalog helpers.

---

## File Structure

- Create `packages/web/src/components/layer-stack/sidebar-slot-section.ts`
  - Hold tiny pure helpers for mapping a type to its containing section and
    deciding whether type navigation should open a slot section.
- Create `packages/web/test/sidebar-slot-section.test.ts`
  - Verify active type navigation does not force a slot section open while
    inactive type navigation does.
- Modify `packages/web/src/components/layer-stack/stack-panel.tsx`
  - Own the separation between active type expansion and grouped slot-list expansion.
  - Use the pure helpers for search/add navigation.
- Modify `packages/web/test/stack-panel.test.tsx`
  - Update server-render expectations for selected vs unselected expanded types.
- No changes to `GroupTypeSlotEntries`, `LayerRow`, or `TypeItemPicker` are required unless tests reveal a direct prop contract issue.

## Task 1: Update StackPanel Tests For Independent Collapse

**Files:**
- Modify: `packages/web/test/stack-panel.test.tsx`

- [ ] **Step 1: Replace the stale expanded-inactive render expectation**

In `packages/web/test/stack-panel.test.tsx`, replace the current test named:

```ts
it('opens the containing group when an unselected type picker is active', () => {
  const html = renderPanel({ expanded: 'clothes' });

  expect(html).toContain('Hide 1 slot');
  expect(html).toContain('+ clothes');
  expect(html).toContain('Swap clothes');
  expect(html).toContain('Long Sleeve');
  expect(html).toContain('Short Sleeve');
  expect(html).not.toContain('+ head');
  expect(html).not.toContain('+ hair');
});
```

with:

```ts
it('does not force a collapsed slot group open for an expanded selected type', () => {
  const html = renderPanel({ expanded: 'body' });

  expect(html).toContain('Body Color');
  expect(html).toContain('Swap body');
  expect(html).toContain('Show 1 slot');
  expect(html).not.toContain('body: Body Color - Replace');
});

it('does not reveal an expanded unselected type unless its slot group is open', () => {
  const html = renderPanel({ expanded: 'clothes' });

  expect(html).toContain('Show 1 slot');
  expect(html).not.toContain('+ clothes');
  expect(html).not.toContain('Swap clothes');
  expect(html).not.toContain('Long Sleeve');
  expect(html).not.toContain('Short Sleeve');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- stack-panel.test.tsx
```

Expected: FAIL. The stale implementation still computes `sectionOpen` from `expandedSectionId === section.id || sectionHasExpandedType`, so `renderPanel({ expanded: 'body' })` includes the replace entry and does not keep the slot list collapsed.

- [ ] **Step 3: Commit the failing test**

```bash
rtk git add packages/web/test/stack-panel.test.tsx
rtk git commit -m "test: cover independent sidebar slot collapse"
```

Update this plan item with:

```md
  - Commit: <hash>
  - Verification: focused stack-panel test FAILS as expected before implementation
```

## Task 2: Decouple Slot Section Visibility From Active Expansion

**Files:**
- Create: `packages/web/src/components/layer-stack/sidebar-slot-section.ts`
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`
- Modify: `packages/web/test/stack-panel.test.tsx`

- [ ] **Step 1: Create pure section navigation helpers**

Create `packages/web/src/components/layer-stack/sidebar-slot-section.ts`:

```ts
import type { TypeName } from '@lpc-toolkit/core';
import type { SliceState } from '../../slice/selection';

export interface SidebarTypeSection {
  readonly id: string;
  readonly typeNames: readonly TypeName[];
}

export function sectionIdForType(
  sections: readonly SidebarTypeSection[],
  typeName: TypeName,
): string | null {
  return sections.find((section) => section.typeNames.includes(typeName))?.id ?? null;
}

export function sectionIdForTypeNavigation(args: {
  readonly sections: readonly SidebarTypeSection[];
  readonly state: SliceState;
  readonly typeName: TypeName;
}): string | null | undefined {
  if (args.state.selections[args.typeName]) return undefined;
  return sectionIdForType(args.sections, args.typeName);
}
```

`undefined` means "leave the existing section state alone"; `null` means "the
target is inactive but no containing section exists."

- [ ] **Step 2: Import the helper in StackPanel**

Add this import:

```ts
import { sectionIdForTypeNavigation } from './sidebar-slot-section';
```

- [ ] **Step 3: Add local navigation helper in StackPanel**

In `StackPanel`, after the `sections` `useMemo`, add:

```ts
  const expandType = (typeName: TypeName) => {
    setExpanded(typeName);
    const nextSectionId = sectionIdForTypeNavigation({
      sections,
      state,
      typeName,
    });
    if (nextSectionId !== undefined) {
      setExpandedSectionId(nextSectionId);
    }
  };
```

- [ ] **Step 4: Clear stale section ids when shown types change**

After the existing `useEffect` that clears invalid `expanded`, add:

```ts
  useEffect(() => {
    if (
      expandedSectionId &&
      !sections.some((section) => section.id === expandedSectionId)
    ) {
      setExpandedSectionId(null);
    }
  }, [expandedSectionId, sections]);
```

This keeps `expandedSectionId` from pointing at a removed section after body-type or visibility changes.

- [ ] **Step 5: Route search picks through the helper**

Change:

```tsx
        onPicked={(tn) => setExpanded(tn)}
```

to:

```tsx
        onPicked={expandType}
```

- [ ] **Step 6: Make sectionOpen depend only on expandedSectionId**

Inside `sections.map`, replace:

```ts
          const sectionHasExpandedType = expanded
            ? section.typeNames.includes(expanded)
            : false;
          const sectionOpen = expandedSectionId === section.id || sectionHasExpandedType;
```

with:

```ts
          const sectionOpen = expandedSectionId === section.id;
```

- [ ] **Step 7: Keep manual section toggles independent from expanded**

Leave the existing toggle body as:

```tsx
                onToggleSection={() => {
                  setExpandedSectionId(sectionOpen ? null : section.id);
                }}
```

Do not call `setExpanded(null)` here. This preserves the selected layer row's open picker while hiding the lower slot list.

- [ ] **Step 8: Route add-layer completion through the helper**

Change:

```tsx
          onAdded={(tn) => setExpanded(tn)}
```

to:

```tsx
          onAdded={expandType}
```

- [ ] **Step 9: Run the focused StackPanel test**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- stack-panel.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Run TypeScript check**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [ ] **Step 11: Commit the implementation**

```bash
rtk git add packages/web/src/components/layer-stack/sidebar-slot-section.ts packages/web/src/components/layer-stack/stack-panel.tsx packages/web/test/stack-panel.test.tsx
rtk git commit -m "fix: decouple sidebar slot list collapse"
```

Update this plan item with:

```md
  - Commit: <hash>
  - Verification: stack-panel focused test PASS; web typecheck PASS
```

## Task 3: Add Unit Coverage For Search/Add Navigation Logic

**Files:**
- Create: `packages/web/test/sidebar-slot-section.test.ts`

- [ ] **Step 1: Create helper tests**

Create `packages/web/test/sidebar-slot-section.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { TypeName } from '@lpc-toolkit/core';
import type { SliceState } from '../src/slice/selection';
import {
  sectionIdForType,
  sectionIdForTypeNavigation,
  type SidebarTypeSection,
} from '../src/components/layer-stack/sidebar-slot-section';

const sections: readonly SidebarTypeSection[] = [
  { id: 'body', typeNames: ['body' as TypeName] },
  { id: 'torso', typeNames: ['clothes' as TypeName, 'belt' as TypeName] },
];

const state: SliceState = {
  bodyType: 'male',
  selections: {
    body: { typeName: 'body', name: 'Body Color' },
  },
  anim: 'walk',
  dir: 'down',
  playing: true,
  zoom: 4,
  layout: 'single',
};

describe('sidebar slot section helpers', () => {
  it('finds the section containing a type', () => {
    expect(sectionIdForType(sections, 'clothes' as TypeName)).toBe('torso');
    expect(sectionIdForType(sections, 'hair' as TypeName)).toBeNull();
  });

  it('leaves section state unchanged for an already selected type', () => {
    expect(
      sectionIdForTypeNavigation({
        sections,
        state,
        typeName: 'body' as TypeName,
      }),
    ).toBeUndefined();
  });

  it('opens the containing section for an unselected type', () => {
    expect(
      sectionIdForTypeNavigation({
        sections,
        state,
        typeName: 'clothes' as TypeName,
      }),
    ).toBe('torso');
  });
});
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- stack-panel.test.tsx sidebar-slot-section.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit helper test coverage**

```bash
rtk git add packages/web/test/sidebar-slot-section.test.ts
rtk git commit -m "test: cover sidebar slot navigation behavior"
```

Update this plan item with:

```md
  - Commit: <hash>
  - Verification: focused sidebar tests PASS
```

## Task 4: Final Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-18-sidebar-slot-list-collapse.md`

- [ ] **Step 1: Run all web unit tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test
```

Expected: PASS.

- [ ] **Step 2: Run web typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [ ] **Step 3: Inspect git diff**

Run:

```bash
rtk git diff --stat HEAD
rtk git status --short
```

Expected: only the implementation/test files and this plan file have intended changes before final commit; no changes under `upstream/`.

- [ ] **Step 4: Update this plan with final notes**

For each completed task, ensure this plan has:

```md
  - Commit: <hash>
  - Verification: <command> PASS
```

- [ ] **Step 5: Commit the updated plan**

```bash
rtk git add docs/superpowers/plans/2026-06-18-sidebar-slot-list-collapse.md
rtk git commit -m "docs: update sidebar slot collapse plan status"
```

Expected: commit succeeds on branch `fix/sidebar-slot-list-collapse`.

## Self-Review

- Spec coverage: The plan covers independent collapse, preserving selected row expansion, explicit inactive navigation, stale section cleanup, focused tests, typecheck, and final web tests.
- Placeholder scan: No placeholder markers are intentionally left.
- Type consistency: The plan uses existing `TypeName`, `SliceState`, `expanded`, `setExpanded`, `expandedSectionId`, and `sections` names from `StackPanel`, plus a new `SidebarTypeSection` helper interface.
