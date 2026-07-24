# Composer Asset Editor More Menu Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the `Repair an Asset Pack` action from the Composer TopBar into the More (`⋯`) menu while preserving App-owned navigation to `/asset-packs`.

**Architecture:** Keep `App` and `ComposerApp` as the route owners and retain `onNavigateAssetPacks` on `LayerStackHarnessProps`. Remove the callback from `TopBar`; pass it directly to `MoreMenuPopover`, which closes its menu and emits the callback. Keep `MoreMenuTarget` limited to Share and Attribution popovers.

**Tech Stack:** TypeScript, React, existing `Button` and `MoreMenuPopover` components, Vitest, React server-side static markup tests, pnpm workspace scripts.

## Global Constraints

- Preserve the existing visible label exactly: `Repair an Asset Pack`.
- Place the action in More immediately below Attribution and above the Preferences divider.
- Keep `App` as the sole route/navigation owner; do not add a router or navigation abstraction.
- Do not change Asset Pack Workbench behavior, Composer editing, composition, attribution, export logic, dependencies, or localization contracts.
- Do not modify `upstream/` or require it for verification.
- Prefix repository commands with `rtk` and use pnpm for workspace development.
- Do not add `asset-packs` to `MoreMenuTarget`; route navigation is a separate callback.
- No CLI documentation-impact matrix is needed because this is a web-only navigation change.

---

## File Map

- Modify `packages/web/test/top-bar.test.tsx`: remove the old TopBar asset-editor expectation and assert the TopBar no longer renders it.
- Create `packages/web/test/more-menu-popover.test.tsx`: cover menu placement, label, and the close-then-navigate handler.
- Modify `packages/web/test/app-shell.test.tsx`: keep the existing App-owned `/asset-packs` callback regression coverage unchanged and rerun it as part of the focused suite.
- Modify `packages/web/src/components/layer-stack/top-bar.tsx`: remove the asset-pack callback prop and always-visible button.
- Modify `packages/web/src/components/layer-stack/popovers/more-menu-popover.tsx`: accept the callback, add the menu item, and expose a pure close-then-navigate helper for focused testing.
- Modify `packages/web/src/components/layer-stack/harness.tsx`: pass the existing App-owned callback to MoreMenuPopover instead of TopBar.
- Modify `docs/superpowers/plans/2026-07-24-composer-asset-editor-more-menu.md`: record implementation notes, commit hashes, and exact verification results.

## Task 1: Specify the More menu contract in tests

**Files:**

- Modify: `packages/web/test/top-bar.test.tsx`
- Create: `packages/web/test/more-menu-popover.test.tsx`

**Interfaces:**

- `TopBar` no longer accepts `onNavigateAssetPacks`.
- `MoreMenuPopover` accepts `onNavigateAssetPacks: () => void`.
- `navigateToAssetPacksFromMoreMenu(setOpen, onNavigateAssetPacks)` closes the menu before emitting navigation.

- [x] **Step 1: Replace the TopBar asset-editor test with an absence assertion**

In `packages/web/test/top-bar.test.tsx`:

1. Remove `onNavigateAssetPacks: vi.fn()` from the existing home-action test props.
2. Delete the test named `renders an asset-pack editor action and emits navigation intent`.
3. Add this test after the home-action test:

```ts
it('does not render the asset-pack editor action', () => {
  const tree = TopBar({
    t: createTranslator('en'),
    loadingProgress: null,
    upstreamHref: 'https://example.com/upstream',
    onNavigateHome: vi.fn(),
  });
  const html = renderToStaticMarkup(tree);

  expect(html).not.toContain('Repair an Asset Pack');
});
```

- [x] **Step 2: Add the failing More menu test**

Create `packages/web/test/more-menu-popover.test.tsx` with this test setup and cases:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  MoreMenuPopover,
  navigateToAssetPacksFromMoreMenu,
} from '../src/components/layer-stack/popovers/more-menu-popover';
import { createTranslator } from '../src/i18n';

vi.mock('../src/components/layer-stack/popovers/use-popover', () => ({
  usePopover: () => ({
    panelRef: { current: null },
    pos: { top: 0, left: 0 },
  }),
}));

describe('MoreMenuPopover asset editor action', () => {
  it('places the action below attribution and above preferences', () => {
    const html = renderToStaticMarkup(
      <MoreMenuPopover
        open
        setOpen={vi.fn()}
        t={createTranslator('en')}
        locale="en"
        theme="dark"
        attributionCount={0}
        attributionIncompatible={false}
        onSelect={vi.fn()}
        onNavigateAssetPacks={vi.fn()}
        onToggleLocale={vi.fn()}
        onToggleTheme={vi.fn()}
      />,
    );

    expect(html).toContain('Repair an Asset Pack');
    expect(html.indexOf('Repair an Asset Pack')).toBeGreaterThan(html.indexOf('Attribution'));
    expect(html.indexOf('Repair an Asset Pack')).toBeLessThan(html.indexOf('Preferences'));
  });

  it('closes the menu before navigating to the asset editor', () => {
    const setOpen = vi.fn();
    const onNavigateAssetPacks = vi.fn();

    navigateToAssetPacksFromMoreMenu(setOpen, onNavigateAssetPacks);

    expect(setOpen).toHaveBeenCalledWith(false);
    expect(onNavigateAssetPacks).toHaveBeenCalledOnce();
    expect(setOpen.mock.invocationCallOrder[0]).toBeLessThan(
      onNavigateAssetPacks.mock.invocationCallOrder[0],
    );
  });
});
```

- [x] **Step 3: Run the focused tests and confirm RED**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- top-bar.test.tsx more-menu-popover.test.tsx app-shell.test.tsx
```

Expected: FAIL because `TopBar` still requires the old callback and
`MoreMenuPopover` does not yet expose the new callback/helper. The existing App
shell route test should remain passing.

- [x] **Step 4: Commit the failing test specification**

Run:

```sh
rtk git add packages/web/test/top-bar.test.tsx packages/web/test/more-menu-popover.test.tsx
rtk git commit -m "test(web): move asset editor into more menu"
```

Implementation note: Removed the persistent TopBar assertion, added a dedicated More menu placement/ordering helper test, and left the App-owned `/asset-packs` route coverage in the focused suite.

Commit: `27ee3f3fbcbe5ff6009b54423c01d7c5d1ae647b`

Expected RED result: `rtk pnpm --filter @lpc-toolkit/web test -- top-bar.test.tsx more-menu-popover.test.tsx app-shell.test.tsx` FAIL because `TopBar` still required the old callback and `MoreMenuPopover` did not yet expose `onNavigateAssetPacks` or `navigateToAssetPacksFromMoreMenu`.

Review: clean

## Task 2: Relocate the action into MoreMenuPopover

**Files:**

- Modify: `packages/web/src/components/layer-stack/top-bar.tsx`
- Modify: `packages/web/src/components/layer-stack/popovers/more-menu-popover.tsx`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

**Interfaces:**

- `TopBar` removes `onNavigateAssetPacks` from its props.
- `MoreMenuPopover` adds `onNavigateAssetPacks: () => void`.
- `navigateToAssetPacksFromMoreMenu(setOpen, onNavigateAssetPacks): void` calls `setOpen(false)` before `onNavigateAssetPacks()`.
- `LayerStackHarnessProps.onNavigateAssetPacks` remains unchanged.

- [x] **Step 1: Remove the persistent TopBar action**

In `packages/web/src/components/layer-stack/top-bar.tsx`:

1. Remove `onNavigateAssetPacks: () => void;` from `Props`.
2. Remove `onNavigateAssetPacks` from the destructured function parameters.
3. Remove the button whose `aria-label` and text are `Repair an Asset Pack`.
4. Keep the home button, divider, brand, children, loading indicator, and right slot unchanged.

- [x] **Step 2: Add the More menu callback and helper**

In `packages/web/src/components/layer-stack/popovers/more-menu-popover.tsx`, add this prop:

```ts
onNavigateAssetPacks: () => void;
```

Add this exported pure helper before the component:

```ts
export function navigateToAssetPacksFromMoreMenu(
  setOpen: (v: boolean) => void,
  onNavigateAssetPacks: () => void,
): void {
  setOpen(false);
  onNavigateAssetPacks();
}
```

Destructure the callback, then insert this item immediately after the
Attribution `MenuItem` and before the existing divider:

```tsx
<MenuItem
  onClick={() =>
    navigateToAssetPacksFromMoreMenu(setOpen, onNavigateAssetPacks)
  }
>
  <span>Repair an Asset Pack</span>
</MenuItem>
```

Do not add `asset-packs` to `MoreMenuTarget`; do not change Share,
Attribution, language, or theme handlers.

- [x] **Step 3: Pass the callback to MoreMenuPopover**

In `packages/web/src/components/layer-stack/harness.tsx`, remove:

```tsx
onNavigateAssetPacks={props.onNavigateAssetPacks}
```

from `<TopBar>`, and add the same prop to `<MoreMenuPopover>`:

```tsx
onNavigateAssetPacks={props.onNavigateAssetPacks}
```

Do not change `App`, `ComposerApp`, or the `/asset-packs` route branch.

- [x] **Step 4: Run focused tests and typecheck**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- top-bar.test.tsx more-menu-popover.test.tsx app-shell.test.tsx
rtk pnpm --filter @lpc-toolkit/web run typecheck
```

Expected: all selected tests PASS and web typecheck exits successfully.

- [x] **Step 5: Commit the implementation**

Run:

```sh
rtk git add packages/web/src/components/layer-stack/top-bar.tsx packages/web/src/components/layer-stack/popovers/more-menu-popover.tsx packages/web/src/components/layer-stack/harness.tsx packages/web/test/top-bar.test.tsx packages/web/test/more-menu-popover.test.tsx
rtk git commit -m "feat(web): move asset editor into more menu"
```

Implementation note: Removed the TopBar asset-pack action, added a dedicated More menu callback/helper that closes before navigation, and routed the existing harness callback directly into `MoreMenuPopover`.

Commit: `1d47b420c60adc06855edacb23431748f25b799f`

Focused tests: `rtk pnpm --filter @lpc-toolkit/web test -- top-bar.test.tsx more-menu-popover.test.tsx app-shell.test.tsx` PASS on rerun outside the sandbox after `tsx` IPC `EPERM` during `prepare-assets`

Web typecheck: `rtk pnpm --filter @lpc-toolkit/web run typecheck` PASS

Review: clean

## Task 3: Complete verification and handoff evidence

**Files:**

- Modify: `docs/superpowers/plans/2026-07-24-composer-asset-editor-more-menu.md`

**Interfaces:**

- No additional runtime interfaces change in this task.
- The plan records the implementation commit and exact verification commands/results.

- [x] **Step 1: Run the repository verification gate**

Run:

```sh
rtk pnpm verify
```

Expected: PASS for asset preparation, source pins, boundaries, CLI docs
policy, plugin validation, all workspace typechecks, and all workspace tests.

- [x] **Step 2: Check the final diff and working tree**

Run:

```sh
rtk git diff --check
rtk git status --short
```

Expected: `git diff --check` exits successfully and the working tree is clean
after the plan evidence commit.

- [x] **Step 3: Record evidence in this plan**

Mark completed steps with `- [x]`. Under each task, record the implementation
note, full commit hash, exact verification command/result, and task-review
result. Record the final acceptance criteria as satisfied only after the full
verification gate passes.

- [x] **Step 4: Commit plan evidence**

Run:

```sh
rtk git add docs/superpowers/plans/2026-07-24-composer-asset-editor-more-menu.md
rtk git commit -m "docs(plan): record more menu asset editor verification"
```

Full verify: `rtk pnpm verify` first failed in-sandbox with `Error: listen EPERM: operation not permitted .../tsx-501/...pipe` during `packages/web` `prepare-assets`; reran the same command with approved escalation and it PASSed. Clean logged rerun result: `[prepare-assets] cache-hit`, `[verify-upstream-pin] 17 fixture files and all source pins match 212abfd21493e9957bd556250ac538fa40fe1fc9`, `Architecture boundary check passed.`, CLI docs policy PASS, plugin validation PASS, workspace typecheck PASS, `packages/web test: Test Files 105 passed (105) / Tests 830 passed (830)`, `packages/cli test: Test Files 55 passed (55) / Tests 1033 passed | 1 skipped (1034)`.

Diff check: `rtk git diff --check` PASS

Status before plan-evidence commit: `rtk git status --short` -> `?? docs/superpowers/plans/2026-07-24-composer-asset-editor-more-menu.md`

## Final acceptance criteria

- [x] TopBar no longer renders `Repair an Asset Pack`.
- [x] More menu renders `Repair an Asset Pack` immediately below Attribution and above Preferences.
- [x] Clicking the menu item closes More and invokes App-owned navigation to `/asset-packs`.
- [x] App shell continues to prove the callback pushes `/asset-packs`.
- [x] Asset Pack Workbench behavior and all other More menu actions remain unchanged.
- [x] Focused tests, web typecheck, and `rtk pnpm verify` all PASS.

Acceptance evidence: `packages/web/test/top-bar.test.tsx` asserts the TopBar no longer contains `Repair an Asset Pack`; `packages/web/test/more-menu-popover.test.tsx` asserts the menu item is ordered after Attribution and before Preferences and that `setOpen(false)` occurs before `onNavigateAssetPacks()`; `packages/web/test/app-shell.test.tsx` remains in the focused PASS suite proving the App-owned callback still pushes `/asset-packs`; the implementation confines runtime changes to `TopBar`, `MoreMenuPopover`, and `LayerStackHarness`, leaving the rest of the menu/workbench behavior unchanged.
