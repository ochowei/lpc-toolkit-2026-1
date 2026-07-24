# Composer Asset Editor Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the `Repair an Asset Pack` entry point from the landing page to the Composer top bar while preserving the existing `/asset-packs` route and workbench behavior.

**Architecture:** Keep `App` as the SPA navigation owner. Thread an `onNavigateAssetPacks` callback through `ComposerApp` and `LayerStackHarness` into `TopBar`; the button emits intent and never owns route paths or browser history. Remove only the landing-page button and leave the Asset Pack Workbench route unchanged.

**Tech Stack:** TypeScript, React, existing `Button` component, Vitest, React server-side static markup tests, pnpm workspace scripts.

## Global Constraints

- Preserve the existing visible label exactly: `Repair an Asset Pack`.
- Place the action immediately to the right of `Back to home` in the Composer `TopBar`.
- Keep `App` as the sole route/navigation owner; do not add a router or navigation abstraction.
- Do not change Asset Pack Workbench behavior, Composer editing, composition, attribution, export logic, dependencies, or localization contracts.
- Do not modify `upstream/` or require it for verification.
- Prefix repository commands with `rtk` and use pnpm for workspace development.
- No CLI documentation-impact matrix is needed because no CLI-sensitive path changes.

---

## File Map

- Modify `packages/web/test/landing-page.test.tsx`: assert the landing page no longer renders the asset-pack entry while preserving the existing onboarding contract.
- Modify `packages/web/test/top-bar.test.tsx`: add the red test for the new TopBar navigation action and its placement.
- Modify `packages/web/src/components/landing-page.tsx`: remove the old asset-pack button from the landing header.
- Modify `packages/web/src/components/layer-stack/top-bar.tsx`: add the `onNavigateAssetPacks` prop and render the adjacent button.
- Modify `packages/web/src/components/layer-stack/harness.tsx`: extend `LayerStackHarnessProps` and pass the callback to `TopBar`.
- Modify `packages/web/src/App.tsx`: extend `ComposerApp` and pass the existing route-owned callback to `LayerStackHarness`.
- Modify `docs/superpowers/plans/2026-07-24-composer-asset-editor-link.md`: record task implementation notes, commit hashes, and exact verification results during execution.

## Task 1: Specify the new navigation contract in tests

**Files:**

- Modify: `packages/web/test/landing-page.test.tsx`
- Modify: `packages/web/test/top-bar.test.tsx`

**Interfaces:**

- `TopBar` will accept `onNavigateAssetPacks: () => void`.
- The TopBar test will locate the action by `aria-label="Repair an Asset Pack"` and invoke its `onClick` callback.

- [x] **Step 1: Change the landing test expectation**

In `packages/web/test/landing-page.test.tsx`, replace the existing positive assertion:

```ts
expect(html).toContain('Repair an Asset Pack');
```

with:

```ts
expect(html).not.toContain('Repair an Asset Pack');
```

Keep the rest of the test unchanged so the CLI artist workflow and other landing content remain covered.

- [x] **Step 2: Add the failing TopBar action test**

In `packages/web/test/top-bar.test.tsx`, add a second test after the existing home-action test:

Extend the local `ActionProps` test interface with the two Button variant props
used by the new assertions:

```ts
readonly variant?: string;
readonly size?: string;
```

```ts
it('renders an asset-pack editor action and emits navigation intent', () => {
  const onNavigateAssetPacks = vi.fn();
  const tree = TopBar({
    t: createTranslator('en'),
    loadingProgress: null,
    upstreamHref: 'https://example.com/upstream',
    onNavigateHome: vi.fn(),
    onNavigateAssetPacks,
  });
  const html = renderToStaticMarkup(tree);

  const homeActionIndex = html.indexOf('← Back to home');
  const assetPackActionIndex = html.indexOf('Repair an Asset Pack');
  const brandIndex = html.indexOf('LPC');

  expect(assetPackActionIndex).toBeGreaterThan(homeActionIndex);
  expect(brandIndex).toBeGreaterThan(assetPackActionIndex);

  const action = findAction(tree, 'Repair an Asset Pack');
  expect(action).toBeDefined();
  expect(action?.props.variant).toBe('ghost');
  expect(action?.props.size).toBe('sm');
  action?.props.onClick?.();
  expect(onNavigateAssetPacks).toHaveBeenCalledOnce();
});
```

The new test must fail before implementation because `TopBar` does not yet accept or render `onNavigateAssetPacks`.

- [x] **Step 3: Run the focused tests and confirm RED**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx top-bar.test.tsx
```

Expected: FAIL in the new TopBar test because the new action is absent and the required prop is not yet implemented. The landing assertion should also fail until the old Landing button is removed.

- [x] **Step 4: Commit the failing test specification**

Implementation note: tightened the landing-page assertion to forbid the asset-pack entry and added a TopBar navigation test that specified the exact button label, placement, and click intent before implementation.
Commit: `73ef4da729d38c99a8cc482a6f8cd6aeb989757c`
Verification: `rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx top-bar.test.tsx` FAIL (expected RED: the landing assertion failed while the old header action remained, and the new TopBar action test failed before the button existed)
Task review: review clean

Run:

```sh
rtk git add packages/web/test/landing-page.test.tsx packages/web/test/top-bar.test.tsx
rtk git commit -m "test(web): move asset editor entry to composer"
```

## Task 2: Move the action into the Composer TopBar

**Files:**

- Modify: `packages/web/src/components/layer-stack/top-bar.tsx`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/components/landing-page.tsx`
- Modify: `packages/web/test/landing-page.test.tsx`

**Interfaces:**

- `TopBar` receives `onNavigateAssetPacks: () => void` and invokes it from the new button.
- `LayerStackHarnessProps` exposes `onNavigateAssetPacks: () => void`.
- `ComposerApp` accepts `onNavigateAssetPacks: () => void` and passes it to `LayerStackHarness`.
- `App` passes `() => navigateToRoute('asset-packs')` to `ComposerApp`.

- [x] **Step 1: Remove the landing-page action**

In `packages/web/src/components/landing-page.tsx`, remove only this button from the header action group:

```tsx
<Button onClick={() => onNavigate('asset-packs')}>
  Repair an Asset Pack
</Button>
```

Leave `Open Composer` and `Use the CLI` in their current positions and keep the `onNavigate` prop for the remaining Composer action.

- [x] **Step 2: Extend the TopBar props and render the adjacent action**

In `packages/web/src/components/layer-stack/top-bar.tsx`, add the callback to `Props`:

```ts
onNavigateAssetPacks: () => void;
```

Destructure it in `TopBar`, then insert this button immediately after the existing home button and before the divider:

```tsx
<Button
  size="sm"
  variant="ghost"
  onClick={onNavigateAssetPacks}
  aria-label="Repair an Asset Pack"
>
  Repair an Asset Pack
</Button>
```

Keep the existing home action, divider, brand, children, loading status, and right slot unchanged.

- [x] **Step 3: Thread the callback through the Composer boundaries**

In `packages/web/src/components/layer-stack/harness.tsx`, add this property to `LayerStackHarnessProps` next to `onNavigateHome`:

```ts
onNavigateAssetPacks: () => void;
```

Pass it to `TopBar` beside `onNavigateHome`:

```tsx
onNavigateAssetPacks={props.onNavigateAssetPacks}
```

In `packages/web/src/App.tsx`, extend `ComposerApp`:

```ts
function ComposerApp({
  onNavigateHome,
  onNavigateAssetPacks,
}: {
  readonly onNavigateHome: () => void;
  readonly onNavigateAssetPacks: () => void;
}) {
```

Pass the callback into `LayerStackHarness`:

```tsx
onNavigateAssetPacks={onNavigateAssetPacks}
```

Update the Composer route branch in `App`:

```tsx
if (route === 'compose') {
  return (
    <ComposerApp
      onNavigateHome={() => navigateToRoute('landing')}
      onNavigateAssetPacks={() => navigateToRoute('asset-packs')}
    />
  );
}
```

Do not move route logic into any component below `App`.

- [x] **Step 4: Run the focused tests and typecheck**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx top-bar.test.tsx app-shell.test.tsx
rtk pnpm --filter @lpc-toolkit/web run typecheck
```

Expected: all selected tests PASS and the web typecheck exits successfully. The App shell test must continue to prove `/compose` initializes the Composer and `/asset-packs` initializes only its baseline.

- [x] **Step 5: Commit the implementation**

Implementation note: removed the landing-page asset-pack button, added the adjacent Composer TopBar action, and threaded the App-owned asset-pack navigation callback through ComposerApp and LayerStackHarness without changing route ownership.
Commit: `0678241df620015db3f21bc4966c3925c1f5cf63`
Verification: `rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx top-bar.test.tsx app-shell.test.tsx` PASS
Verification: `rtk pnpm --filter @lpc-toolkit/web run typecheck` PASS
Task review: review clean

Run:

```sh
rtk git add packages/web/src/App.tsx packages/web/src/components/landing-page.tsx packages/web/src/components/layer-stack/harness.tsx packages/web/src/components/layer-stack/top-bar.tsx packages/web/test/landing-page.test.tsx packages/web/test/top-bar.test.tsx
rtk git commit -m "feat(web): link composer to asset editor"
```

## Task 3: Complete verification and handoff evidence

**Files:**

- Modify: `docs/superpowers/plans/2026-07-24-composer-asset-editor-link.md`

**Interfaces:**

- No runtime interfaces change in this task.
- The plan records the implementation commit and exact PASS/FAIL output for each verification command.

- [x] **Step 1: Run the repository verification gate**

Run:

```sh
rtk pnpm verify
```

Expected: PASS for asset preparation, source pins, boundary checks, CLI documentation policy, plugin validation, workspace typechecks, and all workspace Vitest suites.

- [x] **Step 2: Check the final diff and working tree**

Run:

```sh
rtk git diff --check
rtk git status --short
```

Expected: `git diff --check` exits successfully and `git status --short` prints no uncommitted changes after the plan evidence update is committed.

- [x] **Step 3: Record implementation and verification evidence in this plan**

Under each completed task, add a short implementation note, the full commit hash, and the exact verification command with `PASS` or `FAIL`, following the repository's Plan Record Requirement. Do not claim completion until the final verification result is recorded.

- [x] **Step 4: Commit the plan evidence**

Implementation note: recorded durable evidence for Tasks 1-3 only; no runtime source, route behavior, or workbench logic changed in this task.
Verification: `rtk pnpm verify` PASS
Verification: `rtk git diff --check` PASS
Verification: `rtk git status --short` PASS (`rtk git status --short` completed successfully; pre-commit output was the expected uncommitted plan file, and post-commit output was clean)

Run:

```sh
rtk git add docs/superpowers/plans/2026-07-24-composer-asset-editor-link.md
rtk git commit -m "docs(plan): record composer asset editor link verification"
```

## Final acceptance criteria

- Landing no longer renders `Repair an Asset Pack`.
- Composer TopBar renders `Repair an Asset Pack` immediately after `Back to home`.
- Clicking the TopBar action uses the App-owned SPA navigation and reaches `/asset-packs`.
- `/asset-packs` workbench behavior and safeguards remain unchanged.
- Focused web tests, web typecheck, and `rtk pnpm verify` all PASS.

Acceptance evidence: satisfied. The `/asset-packs` route remains App-owned, the Asset Pack Workbench baseline and safeguards were preserved, and this Task 3 update did not change workbench behavior.

Final review correction: added an `app-shell.test.tsx` regression test that captures the first `LayerStackHarness` props and proves `onNavigateAssetPacks()` pushes the App-owned `/asset-packs` route; corrected the Task 1 RED evidence and the Task 3 git-status evidence; focused verification to rerun before handoff is `rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx top-bar.test.tsx app-shell.test.tsx` plus `rtk pnpm --filter @lpc-toolkit/web run typecheck`; the final fix commit hash is recorded in `.superpowers/sdd/final-fix-report.md`.
