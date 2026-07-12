# Composer Back-to-Home Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit localized action in the composer top bar that navigates to the landing page without reloading the browser.

**Architecture:** Keep SPA navigation owned by `App`, pass an `onNavigateHome: () => void` callback through `ComposerApp` and `LayerStackHarness`, and let `TopBar` render the localized action. The component emits user intent only; it does not access `window.history` or route paths.

**Tech Stack:** TypeScript strict mode, React 18, Vitest, Tailwind CSS v4, existing shadcn-style `Button` component.

## Global Constraints

- Show `← Back to home` in English and `← 返回首頁` in Traditional Chinese.
- Keep the complete label visible on desktop and mobile.
- Make the home action the first interactive element at the far left of the
  top bar, followed by a vertical divider and then the LPC Toolkit brand.
- Style only the home action with accent text, an `accent/10` background, an
  `accent/50` border, and an `accent/20` hover background; do not add or change
  a shared `Button` variant.
- Navigate to `/` through the existing SPA routing callback, without a full page reload.
- Add no dependencies and do not modify `upstream/`.
- Preserve composition, attribution, catalog, export, and selection behavior.
- Run repository commands with the `rtk` prefix.

---

## File Structure

- Create `packages/web/test/top-bar.test.tsx`: verifies the visible label and click callback at the presentation boundary.
- Modify `packages/web/src/components/layer-stack/top-bar.tsx`: renders the explicit ghost-style home action.
- Modify `packages/web/src/components/layer-stack/harness.tsx`: accepts and forwards navigation intent without owning routing.
- Modify `packages/web/src/App.tsx`: binds the home action to the existing `landing` route navigation.
- Modify `packages/web/src/i18n.ts`: provides the English and Traditional Chinese action labels.

### Task 1: Add the Composer Back-to-Home Action

**Files:**

- Create: `packages/web/test/top-bar.test.tsx`
- Modify: `packages/web/src/components/layer-stack/top-bar.tsx`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/i18n.ts`

**Interfaces:**

- Consumes: existing `navigateToRoute(routeName: NavigableAppRoute): void`, `Translator`, and shared `Button`.
- Produces: `LayerStackHarnessProps.onNavigateHome: () => void` and `TopBar` prop `onNavigateHome: () => void`.

- [x] **Step 1: Write the failing top-bar test**

  - Implementation: Added the focused TopBar presentation-boundary test.
  - Commit: 031a5f3b1
  - Verification: test created; RED run pending.

Create `packages/web/test/top-bar.test.tsx`:

```tsx
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TopBar } from '../src/components/layer-stack/top-bar';
import { createTranslator } from '../src/i18n';

interface ActionProps {
  readonly 'aria-label'?: string;
  readonly children?: ReactNode;
  readonly onClick?: () => void;
}

function findAction(
  node: ReactNode,
  ariaLabel: string,
): ReactElement<ActionProps> | undefined {
  if (!isValidElement<ActionProps>(node)) return undefined;
  if (node.props['aria-label'] === ariaLabel) return node;

  for (const child of Children.toArray(node.props.children)) {
    const match = findAction(child, ariaLabel);
    if (match) return match;
  }

  return undefined;
}

describe('TopBar', () => {
  it('renders an explicit back-to-home action and emits navigation intent', () => {
    const onNavigateHome = vi.fn();
    const tree = TopBar({
      t: createTranslator('en'),
      loadingProgress: null,
      upstreamHref: 'https://example.com/upstream',
      onNavigateHome,
    });
    const html = renderToStaticMarkup(tree);

    expect(html).toContain('← Back to home');

    const action = findAction(tree, '← Back to home');
    expect(action).toBeDefined();
    action?.props.onClick?.();
    expect(onNavigateHome).toHaveBeenCalledOnce();
  });
});
```

- [x] **Step 2: Run the focused test and verify RED**

  - Implementation: Ran the focused TopBar test before production changes.
  - Commit: 031a5f3b1
  - Verification: RED confirmed; 1 test failed because rendered markup omitted `← Back to home`.

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/top-bar.test.tsx
```

Expected: FAIL because `TopBar` does not render `← Back to home`; no navigation callback is invoked.

- [x] **Step 3: Add localized copy and render the action**

  - Implementation: Added English and Traditional Chinese copy and rendered the shared ghost Button after the brand block.
  - Commit: 031a5f3b1
  - Verification: focused GREEN run pending callback threading.

In both locale maps in `packages/web/src/i18n.ts`, add the same key:

```ts
// en
'topBar.backHome': '← Back to home',

// zh-TW
'topBar.backHome': '← 返回首頁',
```

In `packages/web/src/components/layer-stack/top-bar.tsx`, import the shared button:

```ts
import { Button } from '../ui/button';
```

Extend `Props`:

```ts
onNavigateHome: () => void;
```

Destructure `onNavigateHome`, then place this action immediately after the brand block:

```tsx
<Button
  size="sm"
  variant="ghost"
  onClick={onNavigateHome}
  aria-label={t('topBar.backHome')}
>
  {t('topBar.backHome')}
</Button>
```

- [x] **Step 4: Thread the callback from App to TopBar**

  - Implementation: Threaded `onNavigateHome` from App through ComposerApp and LayerStackHarness into TopBar.
  - Commit: 031a5f3b1
  - Verification: focused GREEN run pending.

Change the `ComposerApp` signature in `packages/web/src/App.tsx`:

```tsx
function ComposerApp({ onNavigateHome }: { onNavigateHome: () => void }) {
```

Pass it to `LayerStackHarness`:

```tsx
onNavigateHome={onNavigateHome}
```

Bind it when rendering the compose route:

```tsx
return <ComposerApp onNavigateHome={() => navigateToRoute('landing')} />;
```

In `packages/web/src/components/layer-stack/harness.tsx`, extend `LayerStackHarnessProps`:

```ts
onNavigateHome: () => void;
```

Pass the callback into `TopBar`:

```tsx
onNavigateHome={props.onNavigateHome}
```

- [x] **Step 5: Run the focused test and verify GREEN**

  - Implementation: Re-ran the focused TopBar test after the minimal callback and UI implementation.
  - Commit: 031a5f3b1
  - Verification: GREEN confirmed; 1 test passed.

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/top-bar.test.tsx
```

Expected: PASS with one passing test.

- [x] **Step 6: Run scoped and architectural verification**

  - Implementation: Ran web typecheck, the complete web test suite, and the architecture boundary checker.
  - Commit: 031a5f3b1
  - Verification: web typecheck PASS; 73 files / 648 tests PASS; boundary check PASS.

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web typecheck
rtk pnpm --filter @lpc-toolkit/web test
rtk pnpm check:boundaries
```

Expected: all three commands exit successfully with no TypeScript, test, or boundary failures.

- [x] **Step 7: Commit the verified implementation and current plan state**

  - Implementation: Staged the scoped implementation, test, and current plan evidence for the implementation commit.
  - Commit: 031a5f3b1
  - Verification: scoped diff review PASS; `git diff --check` PASS.

- Implementation: Added a localized explicit home action and threaded SPA navigation ownership from App through the composer presentation boundary.
- Verification: focused TopBar test PASS; web typecheck PASS; web test PASS; boundary check PASS.

Check Steps 1–7 and append this note beneath Task 1:

```markdown
- Implementation: Added a localized explicit home action and threaded SPA navigation ownership from App through the composer presentation boundary.
- Verification: focused TopBar test PASS; web typecheck PASS; web test PASS; boundary check PASS.
```

```bash
rtk git add packages/web/test/top-bar.test.tsx packages/web/src/components/layer-stack/top-bar.tsx packages/web/src/components/layer-stack/harness.tsx packages/web/src/App.tsx packages/web/src/i18n.ts docs/superpowers/plans/2026-07-12-composer-back-home-link.md
rtk git commit -m "feat(web): add composer home link"
```

Expected: one commit containing only the scoped implementation, test, and updated plan state.

- [x] **Step 8: Record the implementation commit hash**

  - Implementation: Recorded the exact implementation commit hash in the Task 1 plan evidence.
  - Commit: 031a5f3b1
  - Verification: `rtk git rev-parse --short HEAD` printed `031a5f3b1` before this documentation-only commit.

Run:

```bash
rtk git rev-parse --short HEAD
```

Copy the exact printed hash into a `Commit:` implementation note beneath Task 1, check Step 8, then commit that evidence:

```bash
rtk git add docs/superpowers/plans/2026-07-12-composer-back-home-link.md
rtk git commit -m "docs(web): record composer home link verification"
```

Expected: a documentation-only commit that records the exact implementation commit hash.

### Task 2: Move the Home Action Before the Brand

**Files:**

- Modify: `packages/web/test/top-bar.test.tsx`
- Modify: `packages/web/src/components/layer-stack/top-bar.tsx`

**Interfaces:**

- Consumes: the existing `TopBar` prop `onNavigateHome: () => void` and
  translation key `topBar.backHome` from Task 1.
- Produces: unchanged public component interfaces; only the rendered order and
  divider presentation change.

- [x] **Step 1: Add the failing rendered-order assertion**

In `packages/web/test/top-bar.test.tsx`, replace the current label assertion:

```tsx
expect(html).toContain('← Back to home');
```

with:

```tsx
const homeActionIndex = html.indexOf('← Back to home');
const brandIndex = html.indexOf('LPC');

expect(homeActionIndex).toBeGreaterThanOrEqual(0);
expect(brandIndex).toBeGreaterThan(homeActionIndex);
```

Keep the existing `findAction` and callback assertions unchanged so this test
continues to cover visible copy and emitted navigation intent.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/top-bar.test.tsx
```

Expected: FAIL at `expect(brandIndex).toBeGreaterThan(homeActionIndex)` because
the current TopBar renders the LPC brand before the home action.

- [x] **Step 3: Move the action and add the divider**

In `packages/web/src/components/layer-stack/top-bar.tsx`, move the existing
home `Button` so it is the first child inside `<header>`, immediately before
the brand block. Render the divider between the button and brand:

```tsx
<Button
  size="sm"
  variant="ghost"
  onClick={onNavigateHome}
  aria-label={t('topBar.backHome')}
>
  {t('topBar.backHome')}
</Button>
<div aria-hidden="true" className="h-6 w-px shrink-0 bg-border" />
<div className="mr-1 flex min-w-0 flex-col leading-none">
  <span className="text-[13px] font-bold tracking-tight">
    LPC<span className="font-medium text-text-mute">·Toolkit</span>
  </span>
  <span className="hidden font-mono text-[9px] text-text-dim sm:inline">
    {t('app.subtitle')}
    {' · '}
    <a
      href={upstreamHref}
      target="_blank"
      rel="noopener noreferrer"
      className="underline-offset-2 hover:text-text-mute hover:underline"
      title={t('topBar.upstreamLink')}
    >
      upstream
    </a>
  </span>
</div>
```

Remove the old copy of the button after the brand block. Do not change its
copy, callback, responsive visibility, or shared `Button` styling.

- [x] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/top-bar.test.tsx
```

Expected: PASS with one passing test.

- [x] **Step 5: Run scoped and architectural verification**

Run:

```bash
rtk proxy pnpm --filter @lpc-toolkit/web typecheck
rtk pnpm --filter @lpc-toolkit/web test
rtk pnpm check:boundaries
```

Expected: web typecheck exits successfully; 73 web test files and 648 tests
pass; the architecture boundary check passes.

- [x] **Step 6: Commit the verified placement revision and current plan state**

Check Steps 1–6 and append this note beneath Task 2:

```markdown
- Implementation: Moved the localized home action to the far-left position before the brand and added an aria-hidden vertical divider.
- Verification: focused TopBar test PASS; web typecheck PASS; web test PASS; boundary check PASS.
```

Then commit the implementation and plan state:

```bash
rtk git add packages/web/test/top-bar.test.tsx packages/web/src/components/layer-stack/top-bar.tsx docs/superpowers/plans/2026-07-12-composer-back-home-link.md
rtk git commit -m "fix(web): move composer home link before brand"
```

Expected: one commit containing only the revised test, TopBar placement, and
Task 2 plan state.

- Implementation: Moved the localized home action to the far-left position before the brand and added an aria-hidden vertical divider.
- Commit: 88742b16b
- Verification: focused TopBar test PASS; web typecheck PASS; web test PASS; boundary check PASS.

- [x] **Step 7: Record the Task 2 implementation commit hash**

Run:

```bash
rtk git rev-parse --short HEAD
```

Copy the exact printed hash into a `Commit:` implementation note beneath Task
2, check Step 7, then commit that evidence:

```bash
rtk git add docs/superpowers/plans/2026-07-12-composer-back-home-link.md
rtk git commit -m "docs(web): record composer home link placement verification"
```

Expected: a documentation-only commit that records the exact Task 2
implementation commit hash.

### Task 3: Distinguish the Home Action with Accent Styling

**Files:**

- Modify: `packages/web/test/top-bar.test.tsx`
- Modify: `packages/web/src/components/layer-stack/top-bar.tsx`

**Interfaces:**

- Consumes: the existing home `Button`, `topBar.backHome` label, and
  theme-aware Tailwind `accent` color token.
- Produces: unchanged public component interfaces and shared `Button`
  variants; only this TopBar action receives a one-off `className`.

- [ ] **Step 1: Add the failing accent-style assertions**

In `packages/web/test/top-bar.test.tsx`, add `className` to `ActionProps`:

```tsx
interface ActionProps {
  readonly 'aria-label'?: string;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly onClick?: () => void;
}
```

After the existing `expect(action).toBeDefined()` assertion, add:

```tsx
expect(action?.props.className).toContain('border-accent/50');
expect(action?.props.className).toContain('bg-accent/10');
expect(action?.props.className).toContain('text-accent');
expect(action?.props.className).toContain('hover:bg-accent/20');
```

Keep the existing visible-copy, rendered-order, and callback assertions
unchanged.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/top-bar.test.tsx
```

Expected: FAIL because the current home action has no one-off `className`, so
the received value is `undefined` rather than containing
`border-accent/50`.

- [ ] **Step 3: Add the approved one-off accent treatment**

In `packages/web/src/components/layer-stack/top-bar.tsx`, update only the
existing home action:

```tsx
<Button
  size="sm"
  variant="ghost"
  className="border border-accent/50 bg-accent/10 text-accent hover:bg-accent/20"
  onClick={onNavigateHome}
  aria-label={t('topBar.backHome')}
>
  {t('topBar.backHome')}
</Button>
```

Do not modify `packages/web/src/components/ui/button.tsx`; its shared variants
and focus outline remain unchanged.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/top-bar.test.tsx
```

Expected: PASS with one passing test.

- [ ] **Step 5: Run scoped and architectural verification**

Run:

```bash
rtk proxy pnpm --filter @lpc-toolkit/web typecheck
rtk pnpm --filter @lpc-toolkit/web test
rtk pnpm check:boundaries
```

Expected: web typecheck exits successfully; 73 web test files and 648 tests
pass; the architecture boundary check passes.

- [ ] **Step 6: Commit the verified color revision and current plan state**

Check Steps 1–6 and append this note beneath Task 3:

```markdown
- Implementation: Added the approved accent tint, border, text, and hover treatment to only the TopBar home action.
- Verification: focused TopBar test PASS; web typecheck PASS; web test PASS; boundary check PASS.
```

Then commit the implementation and plan state:

```bash
rtk git add packages/web/test/top-bar.test.tsx packages/web/src/components/layer-stack/top-bar.tsx docs/superpowers/plans/2026-07-12-composer-back-home-link.md
rtk git commit -m "style(web): distinguish composer home link"
```

Expected: one commit containing only the revised test, TopBar styling, and
Task 3 plan state.

- [ ] **Step 7: Record the Task 3 implementation commit hash**

Run:

```bash
rtk git rev-parse --short HEAD
```

Copy the exact printed hash into a `Commit:` implementation note beneath Task
3, check Step 7, then commit that evidence:

```bash
rtk git add docs/superpowers/plans/2026-07-12-composer-back-home-link.md
rtk git commit -m "docs(web): record composer home link color verification"
```

Expected: a documentation-only commit that records the exact Task 3
implementation commit hash.
