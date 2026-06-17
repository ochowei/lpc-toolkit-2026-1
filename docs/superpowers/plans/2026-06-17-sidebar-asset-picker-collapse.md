# Sidebar Asset Picker Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the left sidebar's per-group available slot chips while keeping selected layer rows visible and improving section readability.

**Architecture:** `StackPanel` continues to own the active `expanded: TypeName | null` picker state and adds one sidebar-level `expandedSectionId` state for group slot visibility. `GroupTypeSlotEntries` becomes the focused component for collapsed/expanded slot controls, while `LayerRow` and `TypeItemPicker` keep their existing picker responsibilities.

**Tech Stack:** TypeScript strict, React 18, Vite/Vitest, Tailwind CSS v4 utility classes, pnpm via `rtk`.

---

## File Structure

- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`
  - Owns `expandedSectionId`.
  - Derives whether each upstream group is open from `expandedSectionId` or the current active `expanded` type.
  - Passes group open/toggle props to `GroupTypeSlotEntries`.
- Modify: `packages/web/src/components/layer-stack/group-type-slot-entries.tsx`
  - Renders the show/hide group slot control.
  - Renders type slot chips only when the group is open.
  - Keeps existing disabled/body-compatibility and inline picker behavior.
- Modify: `packages/web/src/i18n.ts`
  - Adds English and Traditional Chinese fixed-copy keys for show/hide slot controls.
- Modify: `packages/web/test/stack-panel.test.tsx`
  - Updates existing expectations for collapsed default state.
  - Adds coverage that an active type expands its containing group.
- Create: `packages/web/test/group-type-slot-entries.test.tsx`
  - Unit-covers collapsed and expanded rendering for `GroupTypeSlotEntries`.
- No changes: `packages/core/`, `upstream/`, attribution/export logic, package dependencies.

Follow the project workflow note while executing tasks: after completing each task, update this plan checkbox, add a short implementation note, record the commit hash, and record verification status.

---

### Task 1: Add Failing Tests For Collapsed Group Slots

**Files:**
- Modify: `packages/web/test/stack-panel.test.tsx`
- Create: `packages/web/test/group-type-slot-entries.test.tsx`

- [x] **Step 1: Update `stack-panel.test.tsx` default rendering expectations**

In `packages/web/test/stack-panel.test.tsx`, inside `renders every upstream group and keeps empty groups visible`, replace the slot-chip assertions:

```ts
expect(html).toContain('+ head');
expect(html).toContain('+ hair');
expect(html).toContain('+ hat');
expect(html).toContain('+ gloves');
expect(html).toContain('+ clothes');
expect(html).toContain('+ legs');
expect(html).toContain('+ shoes');
expect(html).toContain('+ tools');
```

with:

```ts
expect(html).toContain('Show 2 slots');
expect(html).toContain('Show 1 slot');
expect(html).toContain('Body Color');
expect(html).toContain('Sword A');
expect(html).not.toContain('+ head');
expect(html).not.toContain('+ hair');
expect(html).not.toContain('+ hat');
expect(html).not.toContain('+ gloves');
expect(html).not.toContain('+ clothes');
expect(html).not.toContain('+ legs');
expect(html).not.toContain('+ shoes');
expect(html).not.toContain('+ tools');
```

- [x] **Step 2: Add an active-type auto-open test**

In the same `describe('StackPanel upstream selected-layer groups', () => { ... })` block, append:

```tsx
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

- [x] **Step 3: Add a focused component test file**

Create `packages/web/test/group-type-slot-entries.test.tsx` with:

```tsx
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createCatalog,
  createPaletteCatalog,
  type ItemDefinition,
  type TypeName,
} from '@lpc-toolkit/core';
import { GroupTypeSlotEntries } from '../src/components/layer-stack/group-type-slot-entries';
import { createLabelTranslator, createTranslator } from '../src/i18n';
import { ALL_LICENSE_GROUPS } from '../src/slice/license-filter';
import type { SliceState } from '../src/slice/selection';

function defn(name: string, type_name: string): ItemDefinition {
  return {
    name,
    type_name,
    animations: ['walk'],
    credits: [],
    layer_1: { zPos: 10, male: `${type_name}/${name}/` },
  } as unknown as ItemDefinition;
}

const { catalog } = createCatalog({
  'head/heads_human_male.json': defn('Human Male', 'head'),
  'head/neutral.json': defn('Neutral', 'expression'),
  'head/ears.json': defn('Pointed Ears', 'ears'),
});

const palettes = createPaletteCatalog({}).palettes;

const state: SliceState = {
  bodyType: 'male',
  selections: {
    expression: { typeName: 'expression', name: 'Neutral' },
  },
  anim: 'walk',
  dir: 'down',
  playing: true,
  zoom: 4,
  layout: 'single',
};

function renderEntries(args: {
  readonly sectionOpen: boolean;
  readonly expanded?: TypeName | null;
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
      expanded={args.expanded ?? null}
      setExpanded={() => {}}
      replacementCardDisplayMode="overlay"
      onReplacementCardDisplayModeChange={() => {}}
    />,
  );
}

describe('GroupTypeSlotEntries collapsed groups', () => {
  it('shows a compact group control and hides slot chips when closed', () => {
    const html = renderEntries({ sectionOpen: false });

    expect(html).toContain('Show 3 slots');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('+ head');
    expect(html).not.toContain('expression: Neutral');
    expect(html).not.toContain('+ ears');
  });

  it('shows slot chips and selected replacement entries when open', () => {
    const html = renderEntries({ sectionOpen: true });

    expect(html).toContain('Hide 3 slots');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('+ head');
    expect(html).toContain('expression: Neutral - Replace');
    expect(html).toContain('+ ears');
  });

  it('keeps the inline picker visible for the active unselected type', () => {
    const html = renderEntries({ sectionOpen: true, expanded: 'head' });

    expect(html).toContain('Swap head');
    expect(html).toContain('Human Male');
  });
});
```

- [x] **Step 4: Run the focused tests and verify they fail**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- stack-panel.test.tsx group-type-slot-entries.test.tsx
```

Expected: FAIL because `GroupTypeSlotEntries` does not yet accept `sectionOpen` / `onToggleSection`, and `StackPanel` still renders all slot chips by default.

- [x] **Step 5: Commit the failing tests**

Run:

```sh
rtk git add packages/web/test/stack-panel.test.tsx packages/web/test/group-type-slot-entries.test.tsx docs/superpowers/plans/2026-06-17-sidebar-asset-picker-collapse.md
rtk git commit -m "test(web): cover collapsed sidebar slot groups"
```

Implementation note:
Added red tests for default-collapsed slot groups, active-type auto-open, and focused `GroupTypeSlotEntries` collapsed/open rendering.

Commit:
843f1e6ef

Verification:
`rtk pnpm --filter @lpc-toolkit/web test -- stack-panel.test.tsx group-type-slot-entries.test.tsx` FAIL as expected: missing `Show/Hide` toggle copy/rendering and default collapsed behavior.

---

### Task 2: Add Localized Slot Toggle Copy

**Files:**
- Modify: `packages/web/src/i18n.ts`
- Modify: `packages/web/test/i18n.test.ts`

- [x] **Step 1: Add failing i18n coverage**

In `packages/web/test/i18n.test.ts`, add assertions to the existing translation key coverage test, or add this test if there is no direct copy lookup test:

```ts
it('translates sidebar slot group toggle copy', () => {
  const en = createTranslator('en');
  const zh = createTranslator('zh-TW');

  expect(en('groupSlots.show')).toBe('Show {n} {slotLabel}');
  expect(en('groupSlots.hide')).toBe('Hide {n} {slotLabel}');
  expect(en('groupSlots.slotSingular')).toBe('slot');
  expect(en('groupSlots.slotPlural')).toBe('slots');
  expect(zh('groupSlots.show')).toBe('顯示 {n} 個欄位');
  expect(zh('groupSlots.hide')).toBe('隱藏 {n} 個欄位');
  expect(zh('groupSlots.slotSingular')).toBe('欄位');
  expect(zh('groupSlots.slotPlural')).toBe('欄位');
});
```

Make sure the file imports `createTranslator` if it does not already:

```ts
import { createTranslator } from '../src/i18n';
```

- [x] **Step 2: Run the i18n test and verify it fails**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- i18n.test.ts
```

Expected: FAIL because the new translation keys do not exist.

- [x] **Step 3: Add English keys**

In `packages/web/src/i18n.ts`, in the `en` translation object near `layers.on` / `layers.off`, add:

```ts
'groupSlots.show': 'Show {n} {slotLabel}',
'groupSlots.hide': 'Hide {n} {slotLabel}',
'groupSlots.slotSingular': 'slot',
'groupSlots.slotPlural': 'slots',
```

- [x] **Step 4: Add Traditional Chinese keys**

In the `zh-TW` translation object near `layers.on` / `layers.off`, add:

```ts
'groupSlots.show': '顯示 {n} 個欄位',
'groupSlots.hide': '隱藏 {n} 個欄位',
'groupSlots.slotSingular': '欄位',
'groupSlots.slotPlural': '欄位',
```

- [x] **Step 5: Run the i18n test and verify it passes**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- i18n.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit localized copy**

Run:

```sh
rtk git add packages/web/src/i18n.ts packages/web/test/i18n.test.ts docs/superpowers/plans/2026-06-17-sidebar-asset-picker-collapse.md
rtk git commit -m "feat(web): add sidebar slot toggle copy"
```

Implementation note:
Added English and Traditional Chinese copy for sidebar slot group show/hide labels and covered the keys in i18n tests.

Commit:
cf62c8078

Verification:
`rtk pnpm --filter @lpc-toolkit/web test -- i18n.test.ts` PASS: 17 tests passed.

---

### Task 3: Implement Collapsed Rendering In `GroupTypeSlotEntries`

**Files:**
- Modify: `packages/web/src/components/layer-stack/group-type-slot-entries.tsx`
- Modify: `packages/web/test/group-type-slot-entries.test.tsx`

- [x] **Step 1: Update component props**

In `packages/web/src/components/layer-stack/group-type-slot-entries.tsx`, extend `Props` with:

```ts
  sectionOpen: boolean;
  onToggleSection: () => void;
```

Update the function parameter list to destructure:

```ts
  sectionOpen,
  onToggleSection,
```

- [x] **Step 2: Add a localized toggle label helper**

Below `hasBodyCompatibleItem`, add:

```ts
function slotToggleLabel(args: {
  readonly open: boolean;
  readonly count: number;
  readonly t: Translator;
}) {
  const slotLabel = args.t(
    args.count === 1 ? 'groupSlots.slotSingular' : 'groupSlots.slotPlural',
  );
  return args
    .t(args.open ? 'groupSlots.hide' : 'groupSlots.show')
    .replace('{n}', String(args.count))
    .replace('{slotLabel}', slotLabel);
}
```

- [x] **Step 3: Compute compatible slot count**

At the top of `GroupTypeSlotEntries`, after the empty-type guard, add:

```ts
  const compatibleTypeNames = typeNames.filter((typeName) =>
    hasBodyCompatibleItem({ catalog, state, typeName }),
  );
  const toggleLabel = slotToggleLabel({
    open: sectionOpen,
    count: compatibleTypeNames.length,
    t,
  });
```

- [x] **Step 4: Render the compact toggle control**

Replace the outer returned `<div className="mt-1 space-y-1 px-1">` opening and its immediate child structure with:

```tsx
    <div className="mt-1 space-y-1 px-1">
      <button
        type="button"
        disabled={disabled || compatibleTypeNames.length === 0}
        aria-expanded={sectionOpen}
        onClick={onToggleSection}
        className={[
          'flex w-full items-center justify-between rounded-md border px-2.5 py-1.5',
          'text-left text-[12px] font-medium',
          sectionOpen
            ? 'border-accent bg-accent/10 text-text'
            : 'border-border bg-surface-2 text-text-2',
          disabled || compatibleTypeNames.length === 0
            ? 'cursor-not-allowed opacity-40'
            : 'hover:bg-surface-3 cursor-pointer',
        ].join(' ')}
      >
        <span>{toggleLabel}</span>
        <span aria-hidden>{sectionOpen ? '▾' : '▸'}</span>
      </button>

      {sectionOpen && (
        <div className="flex flex-wrap gap-1.5">
```

Keep the existing `{typeNames.map(...)}` block inside that new inner `<div>`.

- [x] **Step 5: Increase slot chip readability**

Inside each slot chip button class list, change:

```ts
'rounded-full border px-2.5 py-1 text-[11px]',
```

to:

```ts
'rounded-full border px-3 py-1.5 text-[12px]',
```

- [x] **Step 6: Close the conditional wrapper**

After the existing `</div>` that closes the flex-wrap chip list, add the conditional close so the picker remains after the slot-chip list:

```tsx
        </div>
      )}
```

The inline picker block that starts with:

```tsx
      {expanded && typeNames.includes(expanded) && !state.selections[expanded] && (
```

must remain after the conditional chip wrapper, so an active picker is visible whenever `StackPanel` marks the section open.

- [x] **Step 7: Run focused component tests**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- group-type-slot-entries.test.tsx
```

Expected: PASS for `group-type-slot-entries.test.tsx`; `stack-panel.test.tsx` may still fail until `StackPanel` passes the new props.

- [x] **Step 8: Commit component rendering**

Run:

```sh
rtk git add packages/web/src/components/layer-stack/group-type-slot-entries.tsx packages/web/test/group-type-slot-entries.test.tsx docs/superpowers/plans/2026-06-17-sidebar-asset-picker-collapse.md
rtk git commit -m "feat(web): collapse group slot entries"
```

Implementation note:
`GroupTypeSlotEntries` now accepts section open/toggle props, renders localized show/hide controls, hides slot chips when closed, and keeps the inline picker outside the chip wrapper.

Commit:
e54459848

Verification:
`rtk pnpm --filter @lpc-toolkit/web test -- group-type-slot-entries.test.tsx` PASS: 3 tests passed.

---

### Task 4: Wire Group Open State Through `StackPanel`

**Files:**
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`
- Modify: `packages/web/test/stack-panel.test.tsx`

- [x] **Step 1: Add group-level state**

In `StackPanel`, after:

```ts
  const [adding, setAdding] = useState(false);
```

add:

```ts
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);
```

- [x] **Step 2: Add a helper for active type containment**

Inside the `sections.map((section) => { ... })` callback, after `activeTypeNames`, add:

```ts
          const sectionHasExpandedType = expanded
            ? section.typeNames.includes(expanded)
            : false;
          const sectionOpen = expandedSectionId === section.id || sectionHasExpandedType;
```

- [x] **Step 3: Pass collapse props to `GroupTypeSlotEntries`**

Update the `GroupTypeSlotEntries` usage to include:

```tsx
                sectionOpen={sectionOpen}
                onToggleSection={() => {
                  setExpandedSectionId(sectionOpen ? null : section.id);
                }}
```

The full opening should look like:

```tsx
              <GroupTypeSlotEntries
                disabled={disabled}
                sectionOpen={sectionOpen}
                onToggleSection={() => {
                  setExpandedSectionId(sectionOpen ? null : section.id);
                }}
                typeNames={section.typeNames}
                catalog={catalog}
```

- [x] **Step 4: Strengthen group visual separation and label size**

Change the group `<section>` class from:

```tsx
<section key={section.id} className="border-b border-border/60 py-2 last:border-b-0">
```

to:

```tsx
<section key={section.id} className="border-b border-border-strong/60 py-3 last:border-b-0">
```

Change the group label `<div>` class from:

```tsx
className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-text-mute"
```

to:

```tsx
className="mb-1 rounded-md bg-surface px-2 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-text-2"
```

- [x] **Step 5: Run StackPanel tests**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- stack-panel.test.tsx group-type-slot-entries.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit StackPanel wiring**

Run:

```sh
rtk git add packages/web/src/components/layer-stack/stack-panel.tsx packages/web/test/stack-panel.test.tsx docs/superpowers/plans/2026-06-17-sidebar-asset-picker-collapse.md
rtk git commit -m "feat(web): wire sidebar group slot collapse state"
```

Implementation note:
`StackPanel` now owns one `expandedSectionId`, derives section open state from that or the active `expanded` type, passes collapse props down, and uses stronger section borders/header typography. StackPanel tests were aligned to assert selected rows remain visible while replacement slot chips are collapsed by default.

Commit:
Pending.

Verification:
`rtk pnpm --filter @lpc-toolkit/web test -- stack-panel.test.tsx group-type-slot-entries.test.tsx` PASS: 9 tests passed.

---

### Task 5: Full Verification And Manual UI Check

**Files:**
- Modify: `docs/superpowers/plans/2026-06-17-sidebar-asset-picker-collapse.md`

- [ ] **Step 1: Run focused tests**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- stack-panel.test.tsx group-type-slot-entries.test.tsx i18n.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```sh
rtk pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Run the web test suite**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test
```

Expected: PASS.

- [ ] **Step 4: Start the web dev server for visual verification**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL.

- [ ] **Step 5: Manually verify the sidebar**

In the browser, verify:

- Body, Head, Hair, and other groups are visually easier to distinguish.
- Available slot chips are collapsed by default.
- Selected layer rows remain visible while slot chips are collapsed.
- Opening Head closes Body's slot chips.
- Search or add flows still open the correct group and type picker.
- Replacement card display modes still work.
- Dark and light themes remain legible.

- [ ] **Step 6: Record final verification and commit plan updates**

After filling in task notes, commit the final plan status update:

```sh
rtk git add docs/superpowers/plans/2026-06-17-sidebar-asset-picker-collapse.md
rtk git commit -m "docs: record sidebar collapse verification"
```

Implementation note:

Commit:

Verification:

---

## Self-Review

Spec coverage:

- Collapsed available slots by default: Task 1 and Task 3.
- Selected rows remain visible: Task 1 default assertions and Task 5 manual verification.
- Active type auto-opens containing group: Task 1 and Task 4.
- Clearer group boundaries and larger text: Task 4.
- Existing picker behavior preserved: Task 3, Task 4, and Task 5.
- No dependency/core/upstream changes: file structure and Task 5 verification.

Placeholder scan:

- No placeholder markers or unspecified implementation steps.
- Every code-changing step names exact files and includes concrete code.

Type consistency:

- `expandedSectionId` is `string | null`.
- `sectionOpen` is `boolean`.
- `onToggleSection` is `() => void`.
- Translation keys are added before component usage.
