# Landing Page CLI Examples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the repository-oriented CLI summary on the web landing page with concise, copyable public-package examples for preset and custom-selection rendering.

**Architecture:** Keep the feature as static presentation in the existing `LandingPage` component. Store command and JSON examples as module constants, render them with the existing responsive card/code-block styles, and verify the public-facing contract through the focused server-rendered component test.

**Tech Stack:** TypeScript strict mode, React 18, Tailwind CSS v4, Vitest, pnpm workspaces

## Global Constraints

- Target published-package users with `npm install -g @lpc-toolkit/cli` and an `npx @lpc-toolkit/cli --help` alternative.
- State that Node.js 22 or newer is required.
- Show both the built-in `farmer` preset workflow and a valid `lpc-toolkit.selection.v1` custom-selection workflow.
- State that `.credits.txt` and `.credits.csv` attribution files must remain with exported sprites.
- Keep the existing Web UI card and composer navigation actions.
- Add no dependency, interactivity, CLI behavior, or composer-route changes.
- Do not modify `upstream/`.
- Run all terminal commands with the `rtk` prefix.

## File Structure

- Modify `packages/web/src/components/landing-page.tsx`: own static landing-page copy, CLI examples, output guidance, and responsive presentation.
- Modify `packages/web/test/landing-page.test.tsx`: assert the published-package onboarding contract and preserve the composer entry action.

---

### Task 1: Add Public CLI Workflows to the Landing Page

**Files:**
- Modify: `packages/web/src/components/landing-page.tsx`
- Test: `packages/web/test/landing-page.test.tsx`

**Interfaces:**
- Consumes: `LandingPageProps.onNavigate(route: NavigableAppRoute): void` and the existing `Button` component.
- Produces: unchanged `LandingPage({ onNavigate }: LandingPageProps): JSX.Element`; no new exported API.

- [ ] **Step 1: Replace the focused test with the public-package expectations**

Use this complete test file:

```tsx
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LandingPage } from '../src/components/landing-page';

describe('LandingPage', () => {
  it('renders public CLI workflows and the composer entry action', () => {
    const html = renderToStaticMarkup(<LandingPage onNavigate={() => {}} />);

    expect(html).toContain('LPC Toolkit');
    expect(html).toContain('CLI quick start');
    expect(html).toContain('npm install -g @lpc-toolkit/cli');
    expect(html).toContain('npx @lpc-toolkit/cli --help');
    expect(html).toContain('Node.js 22 or newer');
    expect(html).toContain('Render a preset');
    expect(html).toContain(
      'lpc-toolkit preset render farmer --out ./farmer --animation walk',
    );
    expect(html).toContain('Render a custom selection');
    expect(html).toContain('lpc-toolkit.selection.v1');
    expect(html).toContain(
      'lpc-toolkit selection validate --selection selection.json',
    );
    expect(html).toContain(
      'lpc-toolkit render --selection selection.json --out ./rendered --animation walk --frames all --bundle zip',
    );
    expect(html).toContain('.credits.txt');
    expect(html).toContain('.credits.csv');
    expect(html).toContain('Keep both attribution files with exported sprites.');
    expect(html).toContain('Open Composer');
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx
```

Expected: FAIL because the existing page does not contain
`npm install -g @lpc-toolkit/cli` and the two concrete workflows. Record the
failing assertion in the implementation note before continuing.

- [ ] **Step 3: Implement the static workflows and attribution guidance**

Replace `packages/web/src/components/landing-page.tsx` with:

```tsx
import { Button } from './ui/button';
import type { NavigableAppRoute } from '../lib/app-route';

interface LandingPageProps {
  readonly onNavigate: (route: NavigableAppRoute) => void;
}

const installCommands = [
  'npm install -g @lpc-toolkit/cli',
  'npx @lpc-toolkit/cli --help',
] as const;

const selectionExample = `{
  "schema": "lpc-toolkit.selection.v1",
  "name": "hero",
  "bodyType": "male",
  "items": {
    "body": { "name": "Body Color", "recolor": "light" }
  }
}`;

const customSelectionCommands = [
  'lpc-toolkit selection validate --selection selection.json',
  'lpc-toolkit render --selection selection.json --out ./rendered --animation walk --frames all --bundle zip',
] as const;

const cliCommands = [
  'lpc-toolkit catalog types',
  'lpc-toolkit catalog items --type hair',
  'lpc-toolkit token encode --selection selection.json',
  'lpc-toolkit web',
] as const;

const codeClassName =
  'block overflow-x-auto rounded-md bg-[var(--bg-deep)] px-3 py-2 font-mono text-sm text-text';

export function LandingPage({ onNavigate }: LandingPageProps) {
  return (
    <main className="min-h-screen bg-app text-text">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-mute">
              Local sprite composition toolkit
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-text sm:text-4xl">
              LPC Toolkit
            </h1>
          </div>
          <Button variant="primary" onClick={() => onNavigate('compose')}>
            Open Composer
          </Button>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="rounded-md border border-border bg-surface p-5">
            <h2 className="text-xl font-semibold text-text">CLI quick start</h2>
            <p className="mt-2 max-w-2xl text-sm text-text-2">
              Install the published CLI globally, or try it once with npx.
              Node.js 22 or newer is required.
            </p>
            <div className="mt-5 space-y-3">
              {installCommands.map((command) => (
                <code key={command} className={codeClassName}>
                  {command}
                </code>
              ))}
            </div>
          </div>

          <aside className="rounded-md border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text">Web UI</h2>
            <p className="mt-2 text-sm text-text-2">
              Prefer visual composition? Open the browser composer and build a
              character with live preview, export controls, and attribution.
            </p>
            <Button
              className="mt-5 w-full"
              variant="primary"
              onClick={() => onNavigate('compose')}
            >
              Open Composer
            </Button>
          </aside>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text">CLI examples</h2>
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <article className="rounded-md border border-border bg-surface p-5">
              <h3 className="text-lg font-semibold text-text">Render a preset</h3>
              <p className="mt-2 text-sm text-text-2">
                Generate the built-in farmer and its walking animation in one
                command.
              </p>
              <code className={`${codeClassName} mt-4`}>
                lpc-toolkit preset render farmer --out ./farmer --animation walk
              </code>
            </article>

            <article className="rounded-md border border-border bg-surface p-5">
              <h3 className="text-lg font-semibold text-text">
                Render a custom selection
              </h3>
              <p className="mt-2 text-sm text-text-2">
                Save this as <code>selection.json</code>, validate it, then render
                the sheet, frames, and ZIP bundle.
              </p>
              <pre className={`${codeClassName} mt-4`}>
                <code>{selectionExample}</code>
              </pre>
              <div className="mt-3 space-y-3">
                {customSelectionCommands.map((command) => (
                  <code key={command} className={codeClassName}>
                    {command}
                  </code>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="rounded-md border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold text-text">What render creates</h2>
          <p className="mt-2 text-sm text-text-2">
            Every render includes the composed sprite sheet, metadata JSON,
            <code className="mx-1">.credits.txt</code> and
            <code className="mx-1">.credits.csv</code>. Keep both attribution
            files with exported sprites.
          </p>
        </section>

        <section className="rounded-md border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold text-text">Common commands</h2>
          <div className="mt-4 grid gap-2">
            {cliCommands.map((command) => (
              <code key={command} className="block overflow-x-auto rounded-md bg-surface-2 px-3 py-2 font-mono text-sm text-text">
                {command}
              </code>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx
```

Expected: PASS for `packages/web/test/landing-page.test.tsx` with no warnings or
errors.

- [ ] **Step 5: Run architecture-sensitive verification**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web typecheck
rtk pnpm check:boundaries
rtk git diff --check
```

Expected: all commands exit `0`; typecheck reports no TypeScript errors,
boundary verification reports no violations, and diff check prints no errors.

- [ ] **Step 6: Commit the implementation**

Run:

```bash
rtk git add packages/web/src/components/landing-page.tsx packages/web/test/landing-page.test.tsx
rtk git commit -m "feat(web): add CLI usage examples to landing page"
```

Expected: one commit containing only the component and its focused test.

- [ ] **Step 7: Record task completion in this plan**

Read the implementation commit hash with `rtk git rev-parse --short HEAD`, mark
Steps 1–7 complete, and append an implementation note, that exact hash, and the
four verification results beneath Task 1. The completed record must use this
form with the command's real output rather than an angle-bracket marker:

```markdown
- Implementation note: Added public install guidance, preset and custom-selection examples, and mandatory attribution output guidance.
- Commit: the exact short hash printed by `rtk git rev-parse --short HEAD`
- Verification: focused landing-page test PASS; web typecheck PASS; boundary check PASS; diff check PASS.
```

Commit only this plan update with:

```bash
rtk git add docs/superpowers/plans/2026-07-12-landing-page-cli-examples.md
rtk git commit -m "docs(web): record landing CLI examples verification"
```
