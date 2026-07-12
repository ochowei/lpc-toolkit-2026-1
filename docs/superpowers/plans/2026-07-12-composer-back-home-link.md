# Composer Back-to-Home Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit localized action in the composer top bar that navigates to the landing page without reloading the browser.

**Architecture:** Keep SPA navigation owned by `App`, pass an `onNavigateHome: () => void` callback through `ComposerApp` and `LayerStackHarness`, and let `TopBar` render the localized action. The component emits user intent only; it does not access `window.history` or route paths.

**Tech Stack:** TypeScript strict mode, React 18, Vitest, Tailwind CSS v4, existing shadcn-style `Button` component.

## Global Constraints

- Show `← Back to home` in English and `← 返回首頁` in Traditional Chinese.
- Keep the complete label visible on desktop and mobile.
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
  - Commit: pending Task 1 implementation commit.
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
  - Commit: pending Task 1 implementation commit.
  - Verification: RED confirmed; 1 test failed because rendered markup omitted `← Back to home`.

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/top-bar.test.tsx
```

Expected: FAIL because `TopBar` does not render `← Back to home`; no navigation callback is invoked.

- [x] **Step 3: Add localized copy and render the action**

  - Implementation: Added English and Traditional Chinese copy and rendered the shared ghost Button after the brand block.
  - Commit: pending Task 1 implementation commit.
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
  - Commit: pending Task 1 implementation commit.
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
  - Commit: pending Task 1 implementation commit.
  - Verification: GREEN confirmed; 1 test passed.

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/top-bar.test.tsx
```

Expected: PASS with one passing test.

- [x] **Step 6: Run scoped and architectural verification**

  - Implementation: Ran web typecheck, the complete web test suite, and the architecture boundary checker.
  - Commit: pending Task 1 implementation commit.
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
  - Commit: pending Task 1 implementation commit.
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

- [ ] **Step 8: Record the implementation commit hash**

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
