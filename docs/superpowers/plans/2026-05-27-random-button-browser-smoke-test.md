# Random Button Browser Smoke Test — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Playwright-driven browser smoke test that opens the web UI, clicks the random-outfit button 20 times, and fails if any `console.error` / `console.warn` / uncaught error / HTTP 4xx-5xx response occurs.

**Architecture:** A standalone Playwright test runner inside `packages/web/`, independent from the existing Vitest unit suite. Playwright's built-in `webServer` config auto-starts `pnpm dev` (Vite) before tests and tears it down after. A single helper attaches four listeners to the browser `Page` and collects all error kinds into one array; the spec fails the test with a formatted report if the array is non-empty after the click loop. A new GitHub Actions workflow runs unit tests on every PR/push and the e2e job only when `packages/web/**`, `packages/core/**`, or `pnpm-lock.yaml` changed.

**Tech Stack:** `@playwright/test` (Apache-2.0), TypeScript, pnpm workspaces, GitHub Actions, `dorny/paths-filter@v3`.

**Reference spec:** `docs/superpowers/specs/2026-05-27-random-button-browser-smoke-test-design.md`

---

## File Structure

Files this plan creates or modifies:

| Path | Status | Responsibility |
|---|---|---|
| `packages/web/package.json` | Modify | Add `@playwright/test` devDep, add 4 scripts |
| `packages/web/tsconfig.json` | Modify | Extend `include` to cover `e2e` and `playwright.config.ts` |
| `packages/web/playwright.config.ts` | Create | Playwright config: testDir, webServer, reporter, project |
| `packages/web/e2e/helpers/console-collector.ts` | Create | Attaches 4 listeners to a `Page` and collects errors |
| `packages/web/e2e/random-no-console-errors.spec.ts` | Create | The actual smoke test |
| `.gitignore` | Modify | Add Playwright artifacts dirs |
| `.github/workflows/ci.yml` | Create | New unit + e2e CI |
| `pnpm-lock.yaml` | Modify (auto) | Lockfile after `pnpm add` |

---

## Task 1: Add `@playwright/test` dependency and install Chromium

**Files:**
- Modify: `packages/web/package.json` (auto, via pnpm)
- Modify: `pnpm-lock.yaml` (auto)

- [ ] **Step 1: Add devDependency**

Run from repo root:

```bash
pnpm add -D -F @lpc-toolkit/web @playwright/test
```

Expected: pnpm resolves and installs `@playwright/test`. `packages/web/package.json` gains a new entry in `devDependencies`. `pnpm-lock.yaml` is updated.

- [ ] **Step 2: Verify the dependency was added**

Run:

```bash
grep '"@playwright/test"' packages/web/package.json
```

Expected output: a single line showing `"@playwright/test": "^X.Y.Z"` inside `devDependencies`. The exact version comes from pnpm; do not hand-pin.

- [ ] **Step 3: Install Chromium browser binary**

Run:

```bash
pnpm --filter @lpc-toolkit/web exec playwright install chromium
```

Expected: Playwright downloads Chromium into `~/.cache/ms-playwright/`. Final line will be similar to "Chromium X.Y.Z (playwright build vNNNN) downloaded".

Note: this affects the developer's machine only — not the repo. CI installs separately.

- [ ] **Step 4: Commit**

```bash
git add packages/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add @playwright/test devDependency"
```

---

## Task 2: Add .gitignore entries and extend tsconfig

**Files:**
- Modify: `.gitignore`
- Modify: `packages/web/tsconfig.json`

- [ ] **Step 1: Append Playwright artifact directories to `.gitignore`**

Add these two lines to the bottom of `/Users/william/gitRepo/lpc-toolkit-2026-1/.gitignore`:

```
# Playwright e2e artifacts
packages/web/test-results/
packages/web/playwright-report/
```

- [ ] **Step 2: Extend `packages/web/tsconfig.json` `include`**

Current `include` (line 14):

```json
"include": ["src", "test", "scripts", "vite.config.ts", "vitest.config.ts"],
```

Change to:

```json
"include": ["src", "test", "scripts", "e2e", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"],
```

No other tsconfig change.

- [ ] **Step 3: Verify the web package still typechecks**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: exits 0. Adding `e2e` to `include` is harmless even though the directory doesn't exist yet — tsc tolerates empty globs as long as other inputs exist.

- [ ] **Step 4: Commit**

```bash
git add .gitignore packages/web/tsconfig.json
git commit -m "chore(web): wire e2e/ and playwright.config.ts into tsconfig + gitignore"
```

---

## Task 3: Create the console-collector helper

**Files:**
- Create: `packages/web/e2e/helpers/console-collector.ts`

- [ ] **Step 1: Create the helper file**

Create `packages/web/e2e/helpers/console-collector.ts` with this exact content:

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

- [ ] **Step 2: Verify typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: exits 0. The `@playwright/test` types installed in Task 1 resolve `Page`.

- [ ] **Step 3: Commit**

```bash
git add packages/web/e2e/helpers/console-collector.ts
git commit -m "feat(web): add console-collector helper for e2e tests"
```

---

## Task 4: Create the Playwright config

**Files:**
- Create: `packages/web/playwright.config.ts`

- [ ] **Step 1: Create the config file**

Create `packages/web/playwright.config.ts` with this exact content:

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

- [ ] **Step 2: Verify typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add packages/web/playwright.config.ts
git commit -m "feat(web): add Playwright config with auto-managed dev server"
```

---

## Task 5: Create the e2e spec

**Files:**
- Create: `packages/web/e2e/random-no-console-errors.spec.ts`

- [ ] **Step 1: Create the spec file**

Create `packages/web/e2e/random-no-console-errors.spec.ts` with this exact content:

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

- [ ] **Step 2: Verify typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add packages/web/e2e/random-no-console-errors.spec.ts
git commit -m "test(web): add random-button browser smoke spec"
```

---

## Task 6: Wire up package.json scripts

**Files:**
- Modify: `packages/web/package.json`

- [ ] **Step 1: Add four new scripts**

In `packages/web/package.json`, in the `"scripts"` object, add these four entries (location: after the existing `"test": "vitest run"` line):

```json
"pretest:e2e": "tsx scripts/copy-spritesheets.ts",
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"test:e2e:headed": "playwright test --headed"
```

**Why `pretest:e2e`:** the existing `pretest` script copies sprite sheets into `public/spritesheets/` (ignored by git). Without that copy, the dev server serves 404s for sprite URLs, and the `response` listener would flag every one of them. Reusing the existing `tsx scripts/copy-spritesheets.ts` keeps parity with the unit-test entry path.

The resulting `scripts` section should look like:

```json
"scripts": {
  "dev": "vite",
  "prebuild": "pnpm --filter @lpc-toolkit/core build && tsx scripts/copy-spritesheets.ts",
  "build": "vite build",
  "preview": "vite preview",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "copy-sprites": "tsx scripts/copy-spritesheets.ts",
  "gen-i18n": "tsx scripts/gen-i18n-data.ts",
  "pretest": "tsx scripts/copy-spritesheets.ts",
  "test": "vitest run",
  "pretest:e2e": "tsx scripts/copy-spritesheets.ts",
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test:e2e:headed": "playwright test --headed"
}
```

- [ ] **Step 2: Verify scripts are registered**

Run:

```bash
pnpm --filter @lpc-toolkit/web run 2>&1 | grep -E '^  test:e2e'
```

Expected output: three lines, one each for `test:e2e`, `test:e2e:ui`, `test:e2e:headed`. (`pretest:e2e` is a lifecycle hook and may not be listed by `pnpm run` — that's fine.)

- [ ] **Step 3: Commit**

```bash
git add packages/web/package.json
git commit -m "feat(web): add test:e2e scripts"
```

---

## Task 7: Run the e2e test locally and verify

**Files:** none modified — this is the verification step.

This is **the core verification**: does the smoke test actually run, drive Random, and report clean (or report real bugs we should know about)?

- [ ] **Step 1: Stop any locally-running dev server**

If you have `pnpm dev` running in another terminal, leave it — `reuseExistingServer: true` will use it. If you'd rather have Playwright manage it from scratch, kill it first.

- [ ] **Step 2: Run the e2e test**

```bash
pnpm --filter @lpc-toolkit/web test:e2e
```

Expected outcomes (three possibilities, handle each):

**(A) Test passes.** Output ends with `1 passed`. Done — proceed to Step 4.

**(B) Test fails with the formatted error report** ("Captured N console error(s) ..."). This means the smoke test is working as designed and has found a real issue (or unavoidable browser noise). Read the report carefully:

- If the noise is **genuine application bugs** (e.g., `pageerror: TypeError: Cannot read properties of undefined`), capture the report, **do not commit any allowlist**, and surface the findings to the user before continuing. Bug-fixing those is a separate task.
- If the noise is **known benign** (e.g., React strict-mode dev warning, a 404 for an optional asset), and only after user confirmation, add an allowlist in the helper — see Step 3.

**(C) Test errors before assertions** (Playwright setup failure, dev server didn't start, selector timed out). This is an infrastructure problem. Most common cause: missing sprite sheets (Task 6's `pretest:e2e` should prevent this — verify it ran). Check the trace under `packages/web/test-results/.../trace.zip` or the HTML report with:

```bash
pnpm --filter @lpc-toolkit/web exec playwright show-report
```

- [ ] **Step 3: (Conditional, only if outcome B with benign noise) Add allowlist**

Only do this step if Step 2 outcome (B) yielded **known-benign** noise and the user has confirmed which entries to ignore.

Edit `packages/web/e2e/helpers/console-collector.ts` and add an allowlist filter. Example skeleton — adapt the patterns to the actual noise:

```ts
const IGNORE_PATTERNS: RegExp[] = [
  // /react.*dev.*strict-mode/i,   // example: dev-only warning
];

function shouldIgnore(text: string): boolean {
  return IGNORE_PATTERNS.some((re) => re.test(text));
}
```

And wrap each `errors.push(...)` with `if (!shouldIgnore(text)) errors.push(...)`.

Re-run Step 2. Iterate until clean.

Commit when done:

```bash
git add packages/web/e2e/helpers/console-collector.ts
git commit -m "test(web): allowlist known-benign console noise"
```

- [ ] **Step 4: Confirm the report directory is git-ignored**

After a test run, these directories exist:

```bash
ls packages/web/test-results/ packages/web/playwright-report/ 2>&1
```

Verify they appear in `git status` as untracked-and-ignored (they should NOT show up at all because `.gitignore` excludes them):

```bash
git status --short
```

Expected: no `packages/web/test-results/` or `packages/web/playwright-report/` lines.

- [ ] **Step 5: No commit unless Step 3 applied**

If Task 7 only ran the test and confirmed it passes (or surfaced real bugs to discuss), there is nothing to commit from this task itself.

---

## Task 8: Add the GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow directory and file**

Create `.github/workflows/ci.yml` with this exact content:

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

- [ ] **Step 2: Lint the YAML (syntactic sanity)**

Run:

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK
```

Expected output: `OK`. (If python3 / PyYAML unavailable, skip — GitHub will validate on push.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add unit + e2e workflow with path-filtered e2e"
```

- [ ] **Step 4: (Optional) Push and watch first CI run**

The first run is the real verification:

```bash
git push
```

Then open the repo on GitHub → Actions tab → verify:
- `unit` job runs and passes
- `changes` job runs and sets `web=true` (since this commit touches `.github/workflows/ci.yml`, not `packages/web/**` — so on PR `e2e` would skip; on direct push to `main` the `|| github.event_name == 'push'` clause makes it run)
- `e2e` job runs successfully (or, if it fails, the `playwright-report` artifact is uploaded — download it from the run page)

---

## Verification Summary

After all tasks complete, the system should satisfy:

| Check | How |
|---|---|
| `@playwright/test` listed in web devDeps | `grep @playwright/test packages/web/package.json` |
| Chromium binary installed locally | `ls ~/.cache/ms-playwright/` |
| `pnpm --filter @lpc-toolkit/web typecheck` exits 0 | run it |
| `pnpm --filter @lpc-toolkit/web test:e2e` exits 0 | run it |
| `pnpm test` (root) still runs only vitest | run it; should not invoke playwright |
| `.gitignore` excludes test artifacts | `git status` after a test run shows no playwright artifacts |
| CI workflow valid | first push triggers a green Actions run |
