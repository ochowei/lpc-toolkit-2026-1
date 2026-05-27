# Preset Bar With Random Dice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the wrapping horizontal preset chip strip at the top of the sidebar with a compact bar holding a 🎲 random-outfit button next to a single `預設套裝 ▼` dropdown popover. Remove the 🎲 button from the preview-pane toolbar so randomization lives next to presets.

**Architecture:** Create a panel-only `PresetMenuPopover` that follows the existing `usePopover` external-anchor pattern (same shape as `ResetMenuPopover`). Wrap it in a new `PresetBar` component that owns both the 🎲 trigger and the popover's anchor button; mount this in `StackPanel` where `PresetChips` currently lives. Remove the inline 🎲 from `PreviewPane`.

**Tech Stack:** React 18 (functional + hooks), TypeScript strict, Tailwind, existing `Button` (shadcn-style) + `usePopover` hook. No new tests — preserved helpers (`computePresetSelection`, `pickRandomOutfit`) already have coverage; component behavior is verified manually per project convention.

---

## File Structure

**Create**
- `packages/web/src/components/layer-stack/popovers/preset-menu-popover.tsx` — panel-only popover; vertical list of preset rows.
- `packages/web/src/components/layer-stack/preset-bar.tsx` — sidebar top row holding 🎲 + preset trigger button + `PresetMenuPopover`.

**Modify**
- `packages/web/src/components/layer-stack/stack-panel.tsx` — swap `PresetChips` import/usage for `PresetBar`.
- `packages/web/src/components/layer-stack/preview-pane.tsx` — remove the inline 🎲 button and the now-unused `pickRandomOutfit` import.

**Delete**
- `packages/web/src/components/layer-stack/preset-chips.tsx` — replaced by `preset-bar.tsx`.

The `usePopover` hook (`popovers/use-popover.ts`) already supports an optional external anchor ref (introduced in the navbar overflow refactor) — no changes needed there.

---

## Task 1: Create `PresetMenuPopover` (panel-only)

**Files:**
- Create: `packages/web/src/components/layer-stack/popovers/preset-menu-popover.tsx`

- [ ] **Step 1: Write the popover component**

Create `packages/web/src/components/layer-stack/popovers/preset-menu-popover.tsx`:

```tsx
import type { RefObject } from 'react';
import type { Catalog } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../../slice/selection';
import type { Translator } from '../../../i18n';
import { PRESETS, type Preset } from '../../../presets';
import { computePresetSelection } from '../../../presets-apply';
import { usePopover } from './use-popover';

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
  catalog: Catalog;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  t: Translator;
  onApplied: (name: string, skippedCount: number, skippedTypes: string[]) => void;
}

export function PresetMenuPopover({
  open,
  setOpen,
  anchorRef,
  catalog,
  state,
  dispatch,
  t,
  onApplied,
}: Props) {
  const { panelRef, pos } = usePopover(open, () => setOpen(false), anchorRef);

  if (!open || !pos) return null;

  return (
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
      className="w-44 rounded-md border border-border bg-surface p-1 shadow-lg"
      role="menu"
    >
      {PRESETS.map((preset: Preset) => {
        const preview = computePresetSelection(preset, state.selections, state.bodyType, catalog);
        const willSkip = preview.skipped.length;
        const label = t(preset.labelKey);
        return (
          <button
            key={preset.id}
            type="button"
            role="menuitem"
            title={willSkip ? `${label} — ${t('preset.skipPreview').replace('{n}', String(willSkip))}` : label}
            onClick={() => {
              dispatch({
                type: 'apply_selections',
                selections: { bodyType: state.bodyType, items: preview.selections },
              });
              onApplied(
                label,
                willSkip,
                preview.skipped.map((s) => s.typeName),
              );
              setOpen(false);
            }}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-surface-2 ${
              willSkip ? 'opacity-80' : ''
            }`}
          >
            <span>{preset.emoji}</span>
            <span className="flex-1">{label}</span>
            {willSkip > 0 && <span className="text-danger">⚠</span>}
          </button>
        );
      })}
    </div>
  );
}
```

Notes:
- The dispatch payload and `onApplied` arguments are identical to what `PresetChips` does today (verified against `preset-chips.tsx` lines 22–50). Only the visual shell changed.
- `role="menu" / role="menuitem"` mirrors the semantics of `more-menu-popover` so SR users get a list rather than loose buttons.
- The panel is anchor-positioned only (no `right: 12` fallback) because the trigger sits inside the sidebar; the `top/left` from `usePopover` is correct.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS — file uses only existing exports.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/layer-stack/popovers/preset-menu-popover.tsx
git commit -m "feat(web): add PresetMenuPopover panel"
```

---

## Task 2: Create `PresetBar` (dice + dropdown trigger)

**Files:**
- Create: `packages/web/src/components/layer-stack/preset-bar.tsx`

- [ ] **Step 1: Write the component**

Create `packages/web/src/components/layer-stack/preset-bar.tsx`:

```tsx
import { useRef, useState } from 'react';
import type { Catalog } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { Translator } from '../../i18n';
import { pickRandomOutfit } from '../../slice/random-outfit';
import { PresetMenuPopover } from './popovers/preset-menu-popover';

interface Props {
  catalog: Catalog;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  t: Translator;
  onApplied: (name: string, skippedCount: number, skippedTypes: string[]) => void;
}

export function PresetBar({ catalog, state, dispatch, t, onApplied }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="border-b border-border bg-app px-3 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() =>
            dispatch({
              type: 'apply_selections',
              selections: pickRandomOutfit({ catalog, bodyType: state.bodyType }),
            })
          }
          title={t('randomize.title')}
          className="rounded border border-border bg-surface-2 px-2 py-1 text-[12px] hover:bg-surface-3"
        >
          🎲
        </button>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-2 py-1 text-[12px] hover:bg-surface-3"
        >
          <span>{t('preset.title')}</span>
          <span aria-hidden>▼</span>
        </button>
      </div>
      <PresetMenuPopover
        open={open}
        setOpen={setOpen}
        anchorRef={triggerRef}
        catalog={catalog}
        state={state}
        dispatch={dispatch}
        t={t}
        onApplied={onApplied}
      />
    </div>
  );
}
```

Notes:
- The container keeps the same `border-b border-border bg-app px-3 py-2` chrome `PresetChips` used, so the row's outer dimensions match what was there before — no visual jump in the sidebar.
- The uppercase `預設套裝 / Presets` micro-title from `PresetChips` is intentionally removed; the dropdown trigger carries the same label via `t('preset.title')`.
- 🎲 dispatches `pickRandomOutfit(...)` directly as the `selections` payload, exactly as `preview-pane.tsx` does today (lines 144–154). No toast on randomize — keeps current behavior.
- `triggerRef` is owned here and passed to the popover as its external anchor, so positioning anchors to the dropdown button (not the dice).

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/layer-stack/preset-bar.tsx
git commit -m "feat(web): add PresetBar combining random dice and preset dropdown"
```

---

## Task 3: Wire `PresetBar` into `StackPanel`, retire `PresetChips`

**Files:**
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`
- Delete: `packages/web/src/components/layer-stack/preset-chips.tsx`

- [ ] **Step 1: Swap the import in `stack-panel.tsx`**

In `packages/web/src/components/layer-stack/stack-panel.tsx`, change line 11 from:

```ts
import { PresetChips } from './preset-chips';
```

to:

```ts
import { PresetBar } from './preset-bar';
```

- [ ] **Step 2: Swap the usage in `stack-panel.tsx`**

In the same file, replace the `<PresetChips ... />` block (currently lines 108–114) with:

```tsx
      <PresetBar
        catalog={catalog}
        state={state}
        dispatch={dispatch}
        t={t}
        onApplied={onPresetApplied}
      />
```

Props are identical to the previous `PresetChips` usage — no parent-side changes needed.

- [ ] **Step 3: Delete the obsolete file**

Run: `rm packages/web/src/components/layer-stack/preset-chips.tsx`

- [ ] **Step 4: Verify nothing else imports the old module**

Run: `grep -rn "preset-chips\|PresetChips" packages/web/src`
Expected: no matches.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/layer-stack/stack-panel.tsx \
        packages/web/src/components/layer-stack/preset-chips.tsx
git commit -m "feat(web): mount PresetBar in StackPanel, drop PresetChips"
```

---

## Task 4: Remove inline 🎲 from `PreviewPane`

**Files:**
- Modify: `packages/web/src/components/layer-stack/preview-pane.tsx`

- [ ] **Step 1: Delete the random-outfit import**

In `packages/web/src/components/layer-stack/preview-pane.tsx`, delete line 13:

```ts
import { pickRandomOutfit } from '../../slice/random-outfit';
```

- [ ] **Step 2: Delete the inline 🎲 button**

In the same file, delete the entire block currently at lines 144–154:

```tsx
        <button
          type="button"
          onClick={() => dispatch({
            type: 'apply_selections',
            selections: pickRandomOutfit({ catalog, bodyType: state.bodyType }),
          })}
          title={t('randomize.title')}
          className="rounded px-2 py-1 text-text-mute hover:bg-surface-2"
        >
          🎲
        </button>
```

The surrounding action-bar `<div>` keeps its `ml-auto` frame counter on the left of where the button used to be and the Full Sheet `<Button>` on the right; nothing else in that block needs to move.

- [ ] **Step 3: Verify the action bar still typechecks**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS — `pickRandomOutfit` is the only thing removed and it has no remaining references in the file.

- [ ] **Step 4: Confirm no stray references**

Run: `grep -n "pickRandomOutfit\|🎲" packages/web/src/components/layer-stack/preview-pane.tsx`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/layer-stack/preview-pane.tsx
git commit -m "feat(web): remove inline dice button from PreviewPane toolbar"
```

---

## Task 5: Run the full check suite

**Files:**
- (no edits)

- [ ] **Step 1: Typecheck the workspace**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS.

- [ ] **Step 2: Lint**

Run: `pnpm --filter @lpc-toolkit/web lint`
Expected: PASS (no new warnings introduced).

- [ ] **Step 3: Existing tests**

Run: `pnpm --filter @lpc-toolkit/web test`
Expected: PASS — preset and random-outfit suites still cover the unchanged pure logic.

If lint or test scripts don't exist for the web package, skip that step (verify with `pnpm --filter @lpc-toolkit/web run` to list available scripts) and note it in the manual-verification step instead.

---

## Task 6: Manual verification in the dev server

**Files:**
- (no edits)

- [ ] **Step 1: Start the dev server**

Run: `pnpm --filter @lpc-toolkit/web dev`
Expected: Vite reports a local URL (usually `http://localhost:5173`).

- [ ] **Step 2: Sidebar layout check**

Open the URL. Verify the sidebar top row shows `[🎲] [預設套裝 ▼]` as a single line and no longer shows a wrapping grid of six emoji chips.

- [ ] **Step 3: Dropdown open / dismiss**

Click `預設套裝 ▼`. Verify the popover appears anchored under the trigger button and lists six rows (🌾 農民 / 🔮 魔法師 / ⚔️ 騎士 / 🏹 遊俠 / 👑 貴族 / 🗡️ 盜賊). Verify each dismissal path closes it: clicking outside the popover, pressing `Esc`, and clicking the trigger again.

- [ ] **Step 4: Apply each preset**

Open the dropdown and click each of the six rows in turn. Verify the outfit changes and the existing `StatusToast` line (`已套用 X (略過: …)` if anything was skipped) appears, matching the pre-change behavior.

- [ ] **Step 5: Skipped-slot warning**

In the navbar, switch body type to one where presets skip slots (e.g. `teen`). Open `預設套裝 ▼` again. Verify at least one row shows a trailing red `⚠` and that hovering the row shows the `會略過 N 項` (or `Skips {n}` in English) tooltip.

- [ ] **Step 6: Random dice**

Click 🎲 in the sidebar. Verify the outfit changes randomly and no toast is shown (consistent with previous behavior). Click it several times — different outfits should appear.

- [ ] **Step 7: Preview-pane toolbar regression**

Confirm the preview-pane toolbar no longer shows 🎲 and that all remaining controls in that bar work as before (direction arrows, animation select, play/pause, frame counter, Full Sheet toggle).

- [ ] **Step 8: Stop the dev server**

Stop with `Ctrl+C` once verification is complete.

---

## Notes for the implementer

- The `Translator` type comes from `../../i18n` (one `..` deeper from inside `popovers/`). All four i18n keys used here (`preset.title`, `preset.farmer..rogue`, `preset.skipPreview`, `randomize.title`) already exist in both `en` and `zh-TW`; no string changes required.
- `usePopover`'s external-anchor mode returns the same `pos` shape (`{ top, left }`) regardless of which anchor was passed in — see `popovers/use-popover.ts`.
- Frequent commits per task are the project convention (see `2026-05-27-navbar-overflow-menu.md` for prior art).
