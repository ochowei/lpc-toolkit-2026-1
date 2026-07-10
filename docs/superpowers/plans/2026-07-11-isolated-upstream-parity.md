# Isolated Upstream Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run ordinary web E2E without upstream and run pixel-parity E2E only against a SHA-validated isolated upstream checkout outside the tracked submodule.

**Architecture:** Introduce one small Node-only parity-source contract that requires an absolute `LPC_UPSTREAM_PARITY_DIR` and rejects the repository's tracked `upstream/` tree. General Playwright starts only the toolkit and excludes the parity spec; the dedicated parity config starts upstream from the validated environment path. CI materializes the repository and SHA from `asset-release.json` into `$RUNNER_TEMP`, installs the isolated checkout with its own `package-lock.json`, verifies `HEAD`, and runs parity in a separate job.

**Tech Stack:** TypeScript strict mode, Vitest, Playwright, GitHub Actions, pnpm for this monorepo, npm only for the isolated upstream checkout's committed `package-lock.json`.

## Global Constraints

- Prefix every local terminal command with `rtk`; use pnpm for this monorepo.
- Do not modify, install into, start a server from, or create generated files under `upstream/`.
- Do not add dependencies.
- `asset-release.json.sourceRepository` and `asset-release.json.sourceSha` remain the source of truth for the isolated parity checkout.
- General E2E must neither start upstream nor reference `../../upstream`, and it must not collect `random-upstream-parity.spec.ts`.
- Dedicated parity E2E must fail when `LPC_UPSTREAM_PARITY_DIR` is missing, relative, or resolves to the tracked `upstream/` directory or one of its descendants.
- The parity preflight must verify the materialized toolkit manifest and the isolated checkout's actual `HEAD` against the pinned `sourceSha` before Playwright starts either server.
- Checkout, SHA validation, lockfile installation, and server startup failures must fail the parity job; there is no fallback to the submodule.
- Preserve random parity cases, pixel comparison behavior, ports `5173` and `5174`, and toolkit asset preparation.

---

## File Structure

- `packages/web/scripts/parity-source.ts` — pure path contract for the required isolated parity checkout.
- `packages/web/scripts/verify-upstream-parity.ts` — reads `HEAD` only from the validated isolated directory and reuses existing manifest/SHA verification.
- `packages/web/test/parity-source.test.ts` — unit coverage for missing, relative, tracked-submodule, descendant, and valid isolated paths.
- `packages/web/playwright.config.ts` — ordinary E2E config with only the toolkit server and an explicit parity-spec exclusion.
- `packages/web/playwright.parity.config.ts` — parity-only config that starts upstream from `LPC_UPSTREAM_PARITY_DIR`.
- `packages/web/test/package-scripts.test.ts` — static configuration and CI workflow contract tests.
- `packages/web/package.json` — retains asset preparation plus parity preflight in the parity lifecycle.
- `.github/workflows/ci.yml` — separates ordinary E2E from isolated parity checkout/install/run steps.
- `docs/superpowers/plans/2026-07-11-isolated-upstream-parity.md` — task checkboxes, implementation notes, commit hashes, and verification evidence.

## Task 1: Require and validate an isolated parity source

**Files:**
- Create: `packages/web/scripts/parity-source.ts`
- Create: `packages/web/test/parity-source.test.ts`
- Modify: `packages/web/scripts/verify-upstream-parity.ts`

**Interfaces:**
- Produces `requireIsolatedParityDir(repoRoot: string, value?: string): string`.
- The function returns a normalized absolute path only when `value` is non-empty, already absolute, and outside `path.join(repoRoot, 'upstream')`.
- `verify-upstream-parity.ts` consumes `process.env.LPC_UPSTREAM_PARITY_DIR`, resolves it through the helper, reads `git -C <isolatedDir> rev-parse HEAD`, then passes that SHA to existing `verifyUpstreamParity`.

- [x] **Step 1: Write the failing path-contract tests**

Create `packages/web/test/parity-source.test.ts` with the exact behavioral cases:

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { requireIsolatedParityDir } from '../scripts/parity-source';

describe('isolated upstream parity source', () => {
  const repoRoot = path.resolve('/workspace/lpc-toolkit');

  it('requires LPC_UPSTREAM_PARITY_DIR', () => {
    expect(() => requireIsolatedParityDir(repoRoot, undefined)).toThrow(
      /LPC_UPSTREAM_PARITY_DIR is required/,
    );
  });

  it('requires an absolute path', () => {
    expect(() => requireIsolatedParityDir(repoRoot, '../parity')).toThrow(
      /must be an absolute path/,
    );
  });

  it.each([
    path.join(repoRoot, 'upstream'),
    path.join(repoRoot, 'upstream', 'nested'),
  ])('rejects the tracked submodule tree: %s', (candidate) => {
    expect(() => requireIsolatedParityDir(repoRoot, candidate)).toThrow(
      /must be outside the tracked upstream\/ submodule/,
    );
  });

  it('accepts and normalizes an isolated absolute checkout', () => {
    const candidate = path.resolve('/runner-temp/lpc-toolkit-upstream-parity');
    expect(requireIsolatedParityDir(repoRoot, candidate)).toBe(candidate);
  });
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/parity-source.test.ts`

Expected: FAIL because `scripts/parity-source.ts` does not exist.

- [x] **Step 3: Implement the minimal path contract**

Create `packages/web/scripts/parity-source.ts`:

```ts
import path from 'node:path';

export const PARITY_DIR_ENV = 'LPC_UPSTREAM_PARITY_DIR';

export function requireIsolatedParityDir(
  repoRoot: string,
  value = process.env[PARITY_DIR_ENV],
): string {
  if (!value?.trim()) {
    throw new Error(`${PARITY_DIR_ENV} is required for upstream parity.`);
  }
  if (!path.isAbsolute(value)) {
    throw new Error(`${PARITY_DIR_ENV} must be an absolute path.`);
  }

  const resolved = path.resolve(value);
  const trackedUpstream = path.resolve(repoRoot, 'upstream');
  if (
    resolved === trackedUpstream ||
    resolved.startsWith(`${trackedUpstream}${path.sep}`)
  ) {
    throw new Error(
      `${PARITY_DIR_ENV} must be outside the tracked upstream/ submodule.`,
    );
  }
  return resolved;
}
```

Update `verify-upstream-parity.ts` to replace `path.join(repoRoot, 'upstream')` with:

```ts
const parityDir = requireIsolatedParityDir(repoRoot);
const upstreamHead = execFileSync(
  'git',
  ['-C', parityDir, 'rev-parse', 'HEAD'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
).trim();
```

Its failure message must name `LPC_UPSTREAM_PARITY_DIR`, `parityDir`, and the expected `config.sourceSha`; it must not suggest checking out or installing into `upstream/`.

- [x] **Step 4: Run focused and existing parity validation tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/parity-source.test.ts test/asset-release.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
```

Expected: PASS.

- [x] **Step 5: Commit the isolated-source contract**

```bash
rtk git add packages/web/scripts/parity-source.ts packages/web/scripts/verify-upstream-parity.ts packages/web/test/parity-source.test.ts
rtk git commit -m "fix(web): require isolated upstream parity source"
```

After committing, mark this task complete and add its implementation note, commit hash, and focused verification result below the checkbox list.

Implementation note: Added the isolated parity-directory path contract, required the
parity preflight to resolve `LPC_UPSTREAM_PARITY_DIR`, and read the upstream HEAD only
from that validated checkout.

- Commit: `91c26e0065ad58e6e04f25d5881de0c61ddd5a07`
- Verification: focused Vitest (`24 passed`), web typecheck PASS, architecture boundary check PASS.

## Task 2: Separate ordinary and parity Playwright configurations

**Files:**
- Modify: `packages/web/playwright.config.ts`
- Modify: `packages/web/playwright.parity.config.ts`
- Modify: `packages/web/test/package-scripts.test.ts`

**Interfaces:**
- General config has `testIgnore: /random-upstream-parity\.spec\.ts/` and exactly one toolkit `webServer` entry.
- Parity config retains `testMatch: /random-upstream-parity\.spec\.ts/`, resolves the source through `requireIsolatedParityDir`, and starts upstream with its npm script from that absolute directory.
- Both configs retain the current browser project, timeouts, reporter, trace, screenshot, video, and ports.

- [x] **Step 1: Add failing static configuration contracts**

Extend `packages/web/test/package-scripts.test.ts` to read both config files and assert:

```ts
expect(generalPlaywrightConfig).toContain(
  "testIgnore: /random-upstream-parity\\.spec\\.ts/",
);
expect(generalPlaywrightConfig).not.toContain('../../upstream');
expect(generalPlaywrightConfig).not.toContain('5174');
expect(parityPlaywrightConfig).toContain('requireIsolatedParityDir(repoRoot)');
expect(parityPlaywrightConfig).toContain('LPC_UPSTREAM_PARITY_DIR');
expect(parityPlaywrightConfig).not.toContain('../../upstream');
```

Also assert the ordinary config contains only one `command:` occurrence and the parity config contains two.

- [x] **Step 2: Run the package-script test and verify RED**

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/package-scripts.test.ts`

Expected: FAIL because the general config still starts `../../upstream` and does not ignore the parity spec.

- [x] **Step 3: Make general E2E toolkit-only**

In `playwright.config.ts`, add:

```ts
testIgnore: /random-upstream-parity\.spec\.ts/,
```

Replace the `webServer` array with the existing toolkit server as a single object. Do not change the toolkit command or port.

- [x] **Step 4: Point parity E2E at the isolated directory**

In `playwright.parity.config.ts`, compute `repoRoot` from `import.meta.url`, call `requireIsolatedParityDir(repoRoot)`, and construct the upstream entry as:

```ts
{
  command: `npm run dev --prefix ${JSON.stringify(parityDir)} -- --host 127.0.0.1 --port 5174`,
  url: 'http://127.0.0.1:5174',
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
  stdout: 'ignore',
  stderr: 'pipe',
}
```

Include a nearby comment containing `LPC_UPSTREAM_PARITY_DIR` so the config's required source is discoverable. Do not weaken `testMatch`.

- [x] **Step 5: Run focused tests, typecheck, and ordinary E2E**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/package-scripts.test.ts test/parity-source.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm --filter @lpc-toolkit/web test:e2e
```

Expected: PASS; ordinary E2E starts only port `5173` and does not run `random-upstream-parity.spec.ts`.

- [x] **Step 6: Commit the Playwright split**

```bash
rtk git add packages/web/playwright.config.ts packages/web/playwright.parity.config.ts packages/web/test/package-scripts.test.ts
rtk git commit -m "test(web): isolate upstream parity config"
```

After committing, mark this task complete and add its implementation note, commit hash, and focused verification result below the checkbox list.

Implementation note: Split ordinary Playwright execution from upstream parity so the
default config starts only the toolkit server and ignores the parity spec, while the
parity config validates and starts the isolated `LPC_UPSTREAM_PARITY_DIR` checkout.

- Commit: `71a3192e16bb0ddc5ac725fa6bab4a2dad797c7d`
- Verification: focused Vitest (`11 passed`), web typecheck PASS, ordinary Playwright E2E (`24 passed`) with no parity spec executed.

## Task 3: Materialize and run isolated parity in CI

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `packages/web/test/package-scripts.test.ts`
- Verify: `packages/web/package.json`

**Interfaces:**
- The ordinary `e2e` job performs no recursive submodule checkout, upstream install, or parity execution.
- A separate `e2e-parity` job sets `LPC_UPSTREAM_PARITY_DIR: ${{ runner.temp }}/lpc-toolkit-upstream-parity`.
- The parity job reads `sourceRepository` and `sourceSha` from `asset-release.json`, fetches that exact commit into the environment directory, asserts actual `HEAD` equality, runs `npm ci --prefix "$LPC_UPSTREAM_PARITY_DIR"`, then invokes `pnpm --filter @lpc-toolkit/web test:e2e:parity`.
- `pretest:e2e:parity` remains `pnpm prepare-assets && pnpm verify-upstream-parity`, so Playwright cannot start before the isolated source and materialized asset manifest pass SHA verification.

- [x] **Step 1: Add failing workflow contract assertions**

Extend `packages/web/test/package-scripts.test.ts` with slices for `e2e` and `e2e-parity`. Assert:

```ts
expect(e2eJob).not.toContain('submodules: recursive');
expect(e2eJob).not.toContain('working-directory: upstream');
expect(e2eJob).not.toContain('npm ci');
expect(e2eJob).not.toContain('test:e2e:parity');

expect(parityJob).toContain(
  'LPC_UPSTREAM_PARITY_DIR: ${{ runner.temp }}/lpc-toolkit-upstream-parity',
);
expect(parityJob).toContain("require('./asset-release.json').sourceRepository");
expect(parityJob).toContain("require('./asset-release.json').sourceSha");
expect(parityJob).toContain('npm ci --prefix "$LPC_UPSTREAM_PARITY_DIR"');
expect(parityJob).toContain(
  'pnpm --filter @lpc-toolkit/web test:e2e:parity',
);
expect(ciWorkflow).not.toContain('working-directory: upstream');
expect(ciWorkflow).not.toContain('../../upstream');
```

- [x] **Step 2: Run the workflow contract and verify RED**

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/package-scripts.test.ts`

Expected: FAIL because the current ordinary E2E job checks out submodules and installs in `upstream/`, and no isolated parity job exists.

- [x] **Step 3: Remove upstream from the ordinary E2E job**

In `.github/workflows/ci.yml`, remove `submodules: recursive` from the `e2e` checkout and delete:

```yaml
- run: npm ci
  working-directory: upstream
```

Keep the ordinary Playwright browser cache, install, test, and failure artifact upload intact.

- [x] **Step 4: Add the isolated parity job**

Add `e2e-parity` with the same `needs`, change filter, Node/pnpm setup, browser cache strategy, and failure report behavior as ordinary E2E. Set the job-level environment and materialize the exact source with:

```yaml
env:
  LPC_UPSTREAM_PARITY_DIR: ${{ runner.temp }}/lpc-toolkit-upstream-parity

steps:
  - uses: actions/checkout@v4
  - uses: pnpm/action-setup@v4
  - uses: actions/setup-node@v4
    with:
      node-version: 22
      cache: pnpm
  - run: pnpm install --frozen-lockfile
  - name: Materialize pinned upstream parity checkout
    shell: bash
    run: |
      SOURCE_REPOSITORY="$(node -p "require('./asset-release.json').sourceRepository")"
      SOURCE_SHA="$(node -p "require('./asset-release.json').sourceSha")"
      git init "$LPC_UPSTREAM_PARITY_DIR"
      git -C "$LPC_UPSTREAM_PARITY_DIR" remote add origin "https://github.com/${SOURCE_REPOSITORY}.git"
      git -C "$LPC_UPSTREAM_PARITY_DIR" fetch --depth=1 origin "$SOURCE_SHA"
      git -C "$LPC_UPSTREAM_PARITY_DIR" checkout --detach FETCH_HEAD
      ACTUAL_SHA="$(git -C "$LPC_UPSTREAM_PARITY_DIR" rev-parse HEAD)"
      test "$ACTUAL_SHA" = "$SOURCE_SHA"
  - name: Install isolated upstream dependencies from lockfile
    run: npm ci --prefix "$LPC_UPSTREAM_PARITY_DIR"
  - run: pnpm --filter @lpc-toolkit/web test:e2e:parity
```

This npm command is limited to the isolated upstream repository because its committed lockfile is `package-lock.json`; all toolkit installation and scripts remain pnpm-based.

- [x] **Step 5: Run workflow/package contracts and inspect forbidden references**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/package-scripts.test.ts test/parity-source.test.ts test/asset-release.test.ts
rtk rg -n "working-directory: upstream|\.\./\.\./upstream|--prefix ../../upstream|--dir ../../upstream" .github/workflows/ci.yml packages/web/playwright.config.ts packages/web/playwright.parity.config.ts packages/web/scripts/verify-upstream-parity.ts
```

Expected: tests PASS; `rg` exits with status 1 and prints no matches.

- [x] **Step 6: Commit the CI isolation**

```bash
rtk git add .github/workflows/ci.yml packages/web/test/package-scripts.test.ts
rtk git commit -m "ci: run parity from isolated upstream checkout"
```

After committing, mark this task complete and add its implementation note, commit hash, and focused verification result below the checkbox list.

Implementation note: Removed recursive submodule checkout and upstream installation from
ordinary web E2E, and added a dedicated parity job that materializes the repository and
exact SHA from `asset-release.json` under runner temp, verifies `HEAD`, installs from the
isolated lockfile, and runs the parity-only Playwright lifecycle.

- Commit: `45e1b6b9236befde1e1e6a5aa23dcb25673304e7`
- Verification: workflow/package Vitest (`31 passed`), forbidden-reference scan returned no matches, and `git diff --check` PASS.

## Task 4: Verify Plan 3 and record evidence

**Files:**
- Modify: `docs/superpowers/plans/2026-07-11-isolated-upstream-parity.md`

**Interfaces:**
- Produces a completed Plan 3 record with checked tasks, implementation notes, exact commit hashes, and final verification results.
- Does not alter production code, test behavior, `asset-release.json`, or `upstream/`.

- [ ] **Step 1: Run the full relevant verification suite**

Run:

```bash
rtk pnpm check:boundaries
rtk pnpm typecheck
rtk pnpm test
rtk pnpm --filter @lpc-toolkit/web test:e2e
rtk git diff --check
rtk git status --short
```

Expected: all checks PASS; status contains only intentional Plan 3 changes plus the pre-existing untracked `docs/README-ARCHITECTURE-AUDIT.tmp.md`.

- [ ] **Step 2: Verify parity against an isolated checkout**

Use an existing absolute isolated checkout at the pinned SHA, or materialize one outside the repository using the same CI sequence. Do not initialize dependencies in `upstream/`. Then run:

```bash
rtk env LPC_UPSTREAM_PARITY_DIR=/absolute/path/outside/the/repository/upstream pnpm --filter @lpc-toolkit/web test:e2e:parity
```

Expected: parity preflight reports the pinned SHA and all random parity cases PASS. If network access or isolated dependency installation is unavailable, record that parity execution as blocked with the exact reason; do not substitute the tracked submodule.

- [ ] **Step 3: Review the final diff against Batch C**

Run:

```bash
rtk git diff main...HEAD -- .github/workflows/ci.yml packages/web/playwright.config.ts packages/web/playwright.parity.config.ts packages/web/scripts/parity-source.ts packages/web/scripts/verify-upstream-parity.ts packages/web/test/parity-source.test.ts packages/web/test/package-scripts.test.ts packages/web/package.json
rtk rg -n "LPC_UPSTREAM_PARITY_DIR|random-upstream-parity|sourceSha|npm ci" .github/workflows/ci.yml packages/web/playwright.parity.config.ts packages/web/scripts packages/web/test/package-scripts.test.ts
```

Confirm every Batch C requirement has direct code/test/workflow evidence and no command targets the tracked submodule.

- [ ] **Step 4: Record completion and commit plan evidence**

Update every completed task with a short implementation note, commit hash, and verification status, then run:

```bash
rtk git add docs/superpowers/plans/2026-07-11-isolated-upstream-parity.md
rtk git commit -m "docs(plan): record isolated parity completion"
```

## Final Acceptance Criteria

- Ordinary `test:e2e` starts only the toolkit and excludes random upstream parity.
- Dedicated parity refuses a missing, relative, or tracked-submodule source path.
- Toolkit asset manifest SHA, isolated checkout `HEAD`, and `asset-release.json.sourceSha` must match before parity servers start.
- CI reads repository/SHA provenance from `asset-release.json`, installs only in `$RUNNER_TEMP/lpc-toolkit-upstream-parity`, and never falls back to `upstream/`.
- Package/config/workflow tests prevent reintroducing `../../upstream` or `working-directory: upstream`.
- General E2E, isolated parity E2E, web/workspace tests, typecheck, boundaries, and diff checks pass or carry an explicit external-environment blocker for only the isolated parity run.
- The tracked `upstream/` submodule remains byte-for-byte untouched.
