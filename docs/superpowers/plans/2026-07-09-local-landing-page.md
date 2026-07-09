# Local Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default web landing page with CLI usage, move the existing composer to `/compose`, and show a simple 404 for unknown paths locally and on Vercel.

**Architecture:** Keep routing inside the React web app with a tiny pure helper plus `history.pushState`/`popstate`; do not add React Router. Split the current composer initialization into a `ComposerApp` component so `/` can render without loading catalog or palette data. Update the existing web Vercel config to rewrite direct route visits to `index.html`.

**Tech Stack:** React 18, TypeScript strict mode, Vite, Tailwind CSS v4 design tokens, Vitest with `react-dom/server`, existing shadcn-style `Button`.

---

## File Structure

- Create `packages/web/src/lib/app-route.ts`
  - Pure path classification helpers. No DOM access.
- Create `packages/web/test/app-route.test.ts`
  - Unit tests for `/`, `/compose`, and unknown paths.
- Create `packages/web/src/components/landing-page.tsx`
  - Landing page UI. Receives a navigation callback.
- Create `packages/web/src/components/not-found-page.tsx`
  - Simple 404 UI. Receives the same navigation callback.
- Create `packages/web/test/landing-page.test.tsx`
  - Server-render tests for CLI commands and composer CTA.
- Create `packages/web/test/not-found-page.test.tsx`
  - Server-render tests for 404 copy and actions.
- Modify `packages/web/src/App.tsx`
  - Add route state and navigation callback.
  - Move current composer initialization into `ComposerApp`.
  - Render `LandingPage`, `ComposerApp`, or `NotFoundPage` by route.
- Modify `packages/web/vercel.json`
  - Change the SPA fallback destination to `/index.html`.

## Task 1: Add Pure Route Helper

**Files:**
- Create: `packages/web/src/lib/app-route.ts`
- Create: `packages/web/test/app-route.test.ts`

- [ ] **Step 1: Write the failing route tests**

Create `packages/web/test/app-route.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pathForRoute, routeFromPathname } from '../src/lib/app-route';

describe('app route helpers', () => {
  it('classifies the landing route', () => {
    expect(routeFromPathname('/')).toBe('landing');
  });

  it('classifies the composer route', () => {
    expect(routeFromPathname('/compose')).toBe('compose');
  });

  it('classifies unknown paths as not-found', () => {
    expect(routeFromPathname('/missing')).toBe('not-found');
    expect(routeFromPathname('/compose/extra')).toBe('not-found');
  });

  it('returns concrete paths for navigable routes', () => {
    expect(pathForRoute('landing')).toBe('/');
    expect(pathForRoute('compose')).toBe('/compose');
  });
});
```

- [ ] **Step 2: Run the focused route test and verify it fails**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test test/app-route.test.ts
```

Expected: FAIL because `../src/lib/app-route` does not exist.

- [ ] **Step 3: Implement the route helper**

Create `packages/web/src/lib/app-route.ts`:

```ts
export type AppRoute = 'landing' | 'compose' | 'not-found';

export type NavigableAppRoute = Exclude<AppRoute, 'not-found'>;

export type AppPath = '/' | '/compose';

export function routeFromPathname(pathname: string): AppRoute {
  if (pathname === '/') return 'landing';
  if (pathname === '/compose') return 'compose';
  return 'not-found';
}

export function pathForRoute(route: NavigableAppRoute): AppPath {
  return route === 'compose' ? '/compose' : '/';
}
```

- [ ] **Step 4: Run the focused route test and verify it passes**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test test/app-route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
rtk git add packages/web/src/lib/app-route.ts packages/web/test/app-route.test.ts
rtk git commit -m "feat(web): add app route helpers"
```

After commit, update this task checkbox with:

```md
  - Commit: <hash>
  - Verification: route helper test PASS
```

## Task 2: Add Landing and 404 Components

**Files:**
- Create: `packages/web/src/components/landing-page.tsx`
- Create: `packages/web/src/components/not-found-page.tsx`
- Create: `packages/web/test/landing-page.test.tsx`
- Create: `packages/web/test/not-found-page.test.tsx`

- [ ] **Step 1: Write failing component render tests**

Create `packages/web/test/landing-page.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LandingPage } from '../src/components/landing-page';

describe('LandingPage', () => {
  it('renders CLI usage and the composer entry action', () => {
    const html = renderToStaticMarkup(<LandingPage onNavigate={() => {}} />);

    expect(html).toContain('LPC Toolkit');
    expect(html).toContain('CLI quick start');
    expect(html).toContain('pnpm --filter @lpc-toolkit/cli build');
    expect(html).toContain('node packages/cli/dist/index.js --help');
    expect(html).toContain('lpc-toolkit catalog types');
    expect(html).toContain('lpc-toolkit render --selection &lt;file&gt; --out &lt;dir&gt;');
    expect(html).toContain('lpc-toolkit preset render &lt;preset-id&gt; --out &lt;dir&gt;');
    expect(html).toContain('Open Composer');
  });
});
```

Create `packages/web/test/not-found-page.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NotFoundPage } from '../src/components/not-found-page';

describe('NotFoundPage', () => {
  it('renders a simple 404 with home and composer actions', () => {
    const html = renderToStaticMarkup(<NotFoundPage onNavigate={() => {}} />);

    expect(html).toContain('Page not found');
    expect(html).toContain('Back to Home');
    expect(html).toContain('Open Composer');
  });
});
```

- [ ] **Step 2: Run the focused component tests and verify they fail**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test test/landing-page.test.tsx test/not-found-page.test.tsx
```

Expected: FAIL because both components do not exist.

- [ ] **Step 3: Implement `LandingPage`**

Create `packages/web/src/components/landing-page.tsx`:

```tsx
import { Button } from './ui/button';
import type { NavigableAppRoute } from '../lib/app-route';

interface LandingPageProps {
  readonly onNavigate: (route: NavigableAppRoute) => void;
}

const installCommands = [
  'pnpm --filter @lpc-toolkit/cli build',
  'node packages/cli/dist/index.js --help',
] as const;

const cliCommands = [
  'lpc-toolkit catalog types',
  'lpc-toolkit catalog items --type <typeName>',
  'lpc-toolkit selection validate --selection <file>',
  'lpc-toolkit render --selection <file> --out <dir>',
  'lpc-toolkit token encode --selection <file>',
  'lpc-toolkit token decode --token <hash-or-token> --out <file>',
  'lpc-toolkit preset list',
  'lpc-toolkit preset materialize <preset-id> --out <file>',
  'lpc-toolkit preset render <preset-id> --out <dir>',
] as const;

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
              Build the local CLI, inspect the available commands, then render
              selections or presets with required metadata and credits.
            </p>

            <div className="mt-5 space-y-3">
              {installCommands.map((command) => (
                <code
                  key={command}
                  className="block overflow-x-auto rounded-md border border-border bg-[var(--bg-deep)] px-3 py-2 font-mono text-sm text-text"
                >
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

        <section className="rounded-md border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold text-text">Common commands</h2>
          <div className="mt-4 grid gap-2">
            {cliCommands.map((command) => (
              <code
                key={command}
                className="block overflow-x-auto rounded-md bg-surface-2 px-3 py-2 font-mono text-sm text-text"
              >
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

- [ ] **Step 4: Implement `NotFoundPage`**

Create `packages/web/src/components/not-found-page.tsx`:

```tsx
import { Button } from './ui/button';
import type { AppPath } from '../lib/app-route';

interface NotFoundPageProps {
  readonly onNavigate: (path: AppPath) => void;
}

export function NotFoundPage({ onNavigate }: NotFoundPageProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-app px-5 text-text">
      <section className="w-full max-w-md rounded-md border border-border bg-surface p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-text-mute">
          404
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-text">Page not found</h1>
        <p className="mt-3 text-sm text-text-2">
          This route is not part of the local LPC Toolkit web app.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="default" onClick={() => onNavigate('/')}>
            Back to Home
          </Button>
          <Button variant="primary" onClick={() => onNavigate('/compose')}>
            Open Composer
          </Button>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Run the focused component tests and verify they pass**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test test/landing-page.test.tsx test/not-found-page.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
rtk git add packages/web/src/components/landing-page.tsx packages/web/src/components/not-found-page.tsx packages/web/test/landing-page.test.tsx packages/web/test/not-found-page.test.tsx
rtk git commit -m "feat(web): add landing and not found pages"
```

After commit, update this task checkbox with:

```md
  - Commit: <hash>
  - Verification: landing and 404 component tests PASS
```

## Task 3: Wire Routes in App and Update Vercel Fallback

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/vercel.json`

- [ ] **Step 1: Update `App.tsx` route wiring**

Replace `packages/web/src/App.tsx` with:

```tsx
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { loadCatalogFromUpstream } from './catalog/load-catalog';
import { loadPalettesFromUpstream } from './catalog/load-palettes';
import {
  pickInitialSelections,
  sliceReducer,
} from './slice/selection';
import {
  DEFAULT_LOCALE,
  createLabelTranslator,
  createTranslator,
  type Locale,
} from './i18n';
import { LayerStackHarness } from './components/layer-stack/harness';
import { LandingPage } from './components/landing-page';
import { NotFoundPage } from './components/not-found-page';
import {
  bootstrapStateFromHash,
  readWindowHash,
} from './lib/url-hash-sync';
import {
  pathForRoute,
  routeFromPathname,
  type AppPath,
  type NavigableAppRoute,
} from './lib/app-route';

function useAppPathname(): [string, (path: AppPath) => void] {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((path: AppPath) => {
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
    setPathname(window.location.pathname);
  }, []);

  return [pathname, navigate];
}

function ComposerApp() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  const init = useMemo(() => {
    const catalog = loadCatalogFromUpstream();
    const palettes = loadPalettesFromUpstream();
    const defaults = pickInitialSelections(catalog);
    const boot = bootstrapStateFromHash({
      rawHash: readWindowHash(),
      catalog,
      palettes,
      defaults: defaults.state,
    });
    return {
      catalog,
      palettes,
      state: boot.state,
      defaults: defaults.state,
      warnings: boot.warnings,
      shownTypeNames: defaults.shownTypeNames,
    };
  }, []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const tl = useMemo(() => createLabelTranslator(locale), [locale]);

  const [state, dispatch] = useReducer(sliceReducer, init.state);

  document.documentElement.className = `lpc ${theme}`;

  return (
    <LayerStackHarness
      catalog={init.catalog}
      palettes={init.palettes}
      shownTypeNames={init.shownTypeNames}
      initialHashWarnings={init.warnings}
      defaults={init.defaults}
      state={state}
      dispatch={dispatch}
      theme={theme}
      locale={locale}
      t={t}
      tl={tl}
      onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      onToggleLocale={() =>
        setLocale((current) => (current === 'en' ? 'zh-TW' : 'en'))
      }
    />
  );
}

/** Root application shell that routes between landing, composer, and 404 pages. */
export default function App() {
  const [pathname, navigate] = useAppPathname();
  const route = routeFromPathname(pathname);

  document.documentElement.className = 'lpc dark';

  const navigateToRoute = (routeName: NavigableAppRoute) => {
    navigate(pathForRoute(routeName));
  };

  if (route === 'compose') {
    return <ComposerApp />;
  }

  if (route === 'not-found') {
    return <NotFoundPage onNavigate={navigate} />;
  }

  return <LandingPage onNavigate={navigateToRoute} />;
}
```

- [ ] **Step 2: Update Vercel fallback destination**

Modify `packages/web/vercel.json` so it reads:

```json
{
  "framework": "vite",
  "buildCommand": "pnpm build",
  "outputDirectory": "dist",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

- [ ] **Step 3: Run focused tests for route and page wiring**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test test/app-route.test.ts test/landing-page.test.tsx test/not-found-page.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run web typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
rtk git add packages/web/src/App.tsx packages/web/src/components/landing-page.tsx packages/web/test/landing-page.test.tsx packages/web/vercel.json
rtk git commit -m "feat(web): route landing and composer pages"
```

After commit, update this task checkbox with:

```md
  - Commit: <hash>
  - Verification: focused route/page tests PASS; web typecheck PASS
```

## Task 4: Full Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-07-09-local-landing-page.md`

- [ ] **Step 1: Run web build**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web build
```

Expected: PASS and Vite emits `dist/`.

- [ ] **Step 2: Run architecture boundary check**

Run:

```bash
rtk pnpm check:boundaries
```

Expected: PASS with `Architecture boundary check passed.`

- [ ] **Step 3: Run final git status**

Run:

```bash
rtk git status --short
```

Expected: only this plan file is modified if task notes were added; no
unstaged product-code changes remain.

- [ ] **Step 4: Commit verification notes**

Update each completed task in this plan with its commit hash and verification
status. Then run:

```bash
rtk git add docs/superpowers/plans/2026-07-09-local-landing-page.md
rtk git commit -m "docs: record landing page implementation verification"
```

After commit, update this task checkbox with:

```md
  - Commit: <hash>
  - Verification: web build PASS; boundary check PASS
```

## Self-Review

- Spec coverage: Tasks cover `/` landing, `/compose` composer, unknown-path
  404, no router dependency, no catalog initialization on landing, and Vercel
  SPA fallback.
- Red-flag scan: This plan contains no deferred-work markers. Every code step
  includes concrete file content or concrete replacements.
- Type consistency: `AppRoute`, `NavigableAppRoute`, and `AppPath` are defined
  in Task 1 and used consistently by Tasks 2 and 3.
