# Random Button Browser Smoke Test — Design

**Date**: 2026-05-27
**Scope**: `packages/web`
**Goal**: Add browser-based smoke tests that launch the web UI in a real browser, click the random-outfit button many times, and fail if any "red" errors appear in the browser console.

---

## 1. Motivation

The web app's random-outfit button (`PresetBar` in
`packages/web/src/components/layer-stack/preset-bar.tsx`) wires
`pickRandomOutfit` to an `apply_selections` dispatch. Existing unit
tests cover the pure picker logic (`test/random-outfit.test.ts`) but
nothing exercises the full render-and-apply path in a browser.

A regression here typically manifests as a thrown error during render
(missing sprite, bad selection key, undefined catalog entry) — exactly
the kind of failure a browser-console smoke test catches and a Node
unit test does not.

## 2. Requirements (from brainstorming)

| Decision | Choice |
|---|---|
| Browser automation tool | `@playwright/test` (Apache-2.0, GPL-3.0 compatible) |
| Errors that count as failures | `console.error`, `console.warn`, `pageerror` (uncaught), HTTP `4xx`/`5xx` responses |
| Interaction depth | Click random button 20 times |
| Local execution | Yes, primary use case |
| CI execution | Yes, with path-based filtering |
| Touch `pnpm test` default? | **No.** Vitest stays unit-only. E2E gets its own scripts. |

## 3. File Layout

```
packages/web/
├── e2e/
│   ├── random-no-console-errors.spec.ts   # main spec
│   └── helpers/
│       └── console-collector.ts            # captures the 4 error kinds
├── playwright.config.ts                    # config + webServer
└── package.json                            # +test:e2e scripts
.github/
└── workflows/
    └── ci.yml                              # new: unit + e2e (path-filtered)
.gitignore                                  # +playwright artifacts
```

Vitest config (`packages/web/vitest.config.ts`) already restricts
`include: ['test/**/*.test.ts']`, so files under `e2e/` will never
be picked up by `pnpm test`. No vitest change needed.

## 4. Dependencies

Add to `packages/web/package.json` devDependencies:

- `@playwright/test` — Apache-2.0, GPL-3.0 compatible ✅

After install, run once per machine:

```bash
pnpm --filter @lpc-toolkit/web exec playwright install chromium
```

Only Chromium is installed (saves disk; cross-browser is out of scope).

## 5. Playwright Config

`packages/web/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
```

**Why these settings:**
- `workers: 1` + `fullyParallel: false`: one shared dev server, no race.
- `retries: 0`: e2e failures should be inspected, not retried into green.
- `reuseExistingServer: !process.env.CI`: locally, if `pnpm dev` is
  already running on :5173, reuse it; CI always spins fresh.
- `trace: 'on-first-retry'`: cheap; useful when iterating.
- `video: 'retain-on-failure'`: critical for debugging random-induced bugs.

## 6. Error Collector

`packages/web/e2e/helpers/console-collector.ts`:

```ts
import type { Page } from '@playwright/test';

export type CapturedError = {
  kind: 'console.error' | 'console.warn' | 'pageerror' | 'response';
  text: string;
  location?: string;
};

export function attachConsoleCollector(page: Page): CapturedError[] {
  const errors: CapturedError[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push({
        kind: 'console.error',
        text: msg.text(),
        location: formatLocation(msg.location()),
      });
    } else if (msg.type() === 'warning') {
      errors.push({
        kind: 'console.warn',
        text: msg.text(),
        location: formatLocation(msg.location()),
      });
    }
  });

  page.on('pageerror', (err) => {
    errors.push({
      kind: 'pageerror',
      text: `${err.name}: ${err.message}`,
      location: err.stack?.split('\n')[1]?.trim(),
    });
  });

  page.on('response', (res) => {
    const status = res.status();
    if (status >= 400 && status < 600) {
      errors.push({
        kind: 'response',
        text: `HTTP ${status}`,
        location: res.url(),
      });
    }
  });

  return errors;
}

function formatLocation(loc: {
  url: string;
  lineNumber: number;
  columnNumber: number;
}): string | undefined {
  return loc.url ? `${loc.url}:${loc.lineNumber}:${loc.columnNumber}` : undefined;
}
```

**No allowlist** in v1. Real noise found on first run will inform
which (if any) entries deserve filtering — pre-filtering would mask
genuine bugs.

## 7. The Spec

`packages/web/e2e/random-no-console-errors.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { attachConsoleCollector } from './helpers/console-collector';

const RANDOM_CLICKS = 20;

test('clicking random 20 times produces no console errors', async ({ page }) => {
  const errors = attachConsoleCollector(page);

  await page.goto('/');

  const randomBtn = page.getByTitle('Randomize outfit');
  await expect(randomBtn).toBeVisible({ timeout: 30_000 });

  for (let i = 0; i < RANDOM_CLICKS; i++) {
    await randomBtn.click();
    await page.waitForTimeout(150);
  }

  await page.waitForTimeout(1_000);

  if (errors.length > 0) {
    const report = errors
      .map(
        (e, i) =>
          `[${i}] ${e.kind}: ${e.text}${e.location ? `\n    @ ${e.location}` : ''}`,
      )
      .join('\n');
    throw new Error(
      `Captured ${errors.length} console error(s) during 20 random clicks:\n${report}`,
    );
  }
});
```

**Selector choice:** `getByTitle('Randomize outfit')` — the button has
only an emoji label, but `title={t('randomize.title')}` is stable.
The default locale is `'en'` (`packages/web/src/i18n.ts`), and the
English `randomize.title` value is `"Randomize outfit"`. If the
default locale or that English string ever changes, this selector
must follow.

**Why `waitForTimeout` (not anti-pattern here):** we are not waiting
for a specific DOM mutation; we are giving React + image load a window
to settle so latent errors surface. Race-free `waitFor*` would not buy
anything for this assertion shape.

**Final 1s buffer:** sprite image load failures arrive as `response`
events that may trail the last click.

## 8. package.json Scripts

Add to `packages/web/package.json`:

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"test:e2e:headed": "playwright test --headed"
```

`pnpm test` (which runs vitest) is **not** modified.

**Local usage:**

```bash
pnpm --filter @lpc-toolkit/web exec playwright install chromium   # once
pnpm --filter @lpc-toolkit/web test:e2e                           # headless
pnpm --filter @lpc-toolkit/web test:e2e:headed                    # see browser
pnpm --filter @lpc-toolkit/web test:e2e:ui                        # UI mode
pnpm --filter @lpc-toolkit/web exec playwright show-report        # last report
```

## 9. .gitignore Additions

```
packages/web/test-results/
packages/web/playwright-report/
```

## 10. CI Workflow

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  changes:
    name: Detect changes
    runs-on: ubuntu-latest
    outputs:
      web: ${{ steps.filter.outputs.web }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            web:
              - 'packages/web/**'
              - 'packages/core/**'
              - 'pnpm-lock.yaml'

  unit:
    name: Unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test

  e2e:
    name: E2E (web)
    needs: [unit, changes]
    if: needs.changes.outputs.web == 'true' || github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile

      - uses: actions/cache@v4
        id: playwright-cache
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
      - if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: pnpm --filter @lpc-toolkit/web exec playwright install --with-deps chromium

      - run: pnpm --filter @lpc-toolkit/web test:e2e

      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: packages/web/playwright-report/
          retention-days: 7
```

**CI design notes:**

- **`submodules: recursive`** is mandatory: `upstream/` (read-only
  submodule) supplies `spritesheets/` that the web build consumes.
- **`changes` job** uses `dorny/paths-filter@v3` to compute whether
  web-relevant files changed; e2e job conditions on that output.
- **Push to `main`** always runs e2e (post-merge canary).
- **PR** runs e2e only when `packages/web/**`, `packages/core/**`, or
  `pnpm-lock.yaml` changed. Pure docs changes skip e2e cleanly (job
  shows as skipped, not failed).
- **Playwright browser cache** keyed on `pnpm-lock.yaml` hash — avoids
  re-downloading Chromium on every run (~30s saved per run).
- **`--with-deps`** on first install pulls Linux runtime libs.
- **Failure artifact**: HTML report uploaded for 7 days; download from
  the Actions run page to inspect failures remotely.
- **No `needs.changes` for `unit`**: unit tests are cheap and should
  always run.

## 11. Out of Scope (v1)

- Cross-browser (Firefox / WebKit) — Chromium only.
- Multiple body types — single default body type for the smoke test.
- Visual regression / screenshot diffing.
- Console allowlist — added only if/when real noise demands it.
- Required status checks on the `e2e` job — defer until the test has
  proven stable on `main`.

## 12. Risk & Mitigation

| Risk | Mitigation |
|---|---|
| Flaky due to async image loads | Final 1s buffer + retries:0 to surface flakes early |
| Selector breaks if English title changes | Single grep target; rename is mechanical |
| Dev server port collision locally | `reuseExistingServer: true` reuses your running dev |
| CI minutes consumption | Path filter + browser cache keeps e2e job ≲ 1 min on hit |
| Chromium auto-update breaks tests | Pinned via Playwright version in pnpm-lock |

## 13. Open Questions

None at design time. First-run output may reveal:
- Whether any existing dev-only `console.warn` (e.g., React strict-mode
  double-invoke warnings) needs an allowlist — decided after we see it.
