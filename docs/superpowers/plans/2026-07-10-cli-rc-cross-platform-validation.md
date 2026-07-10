# CLI RC Cross-Platform Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move routine CLI package validation to Ubuntu while reserving macOS and Windows validation for tagged or manually dispatched release-candidate runs that can never publish npm.

**Architecture:** Keep ordinary CI and stable publication in their existing workflows, add one isolated RC workflow, and put exact RC tag semantics in a dependency-free Node verifier. Static Vitest assertions protect the workflow invariants locally, while GitHub-hosted RC runs provide the final macOS and Windows evidence.

**Tech Stack:** GitHub Actions YAML, Node.js 22 ESM scripts, TypeScript strict mode, Vitest, pnpm workspaces.

## Global Constraints

- Use standard RC tags in the exact form `vX.Y.Z-rc.N`; numeric components must not have leading zeroes unless the component is exactly zero.
- Keep `packages/cli/package.json` at the intended stable base version `X.Y.Z`; RC tags do not change the npm package version.
- RC runs never publish npm and never receive `id-token: write`.
- A manually dispatched macOS/Windows run is advisory and does not replace the tagged RC gate.
- Stable publishing remains Ubuntu-only and rejects prerelease tags before the publish job starts.
- Preserve the manual `v0.1.0` bootstrap publish skip.
- Do not create or push tags, publish npm packages, configure npm Trusted Publisher, push the branch, or mutate external release state.
- Do not add dependencies and do not modify `upstream/`.
- Use pnpm and prefix every repository terminal command with `rtk`.
- Use strict TypeScript and do not add `any`.
- After CLI or workflow script changes, run `rtk pnpm check:boundaries` plus the relevant CLI tests, typecheck, build, and packed-package smoke.
- Follow `AGENTS.md`: after each task, update this plan's checkbox, implementation note, commit hash, and verification status.

---

### Task 1: Add RC Tag Verification and Correct the Platform-Aware Path Test

**Files:**
- Create: `packages/cli/scripts/verify-rc-tag.mjs`
- Create: `packages/cli/test/release-tag.test.ts`
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/test/package-metadata.test.ts`
- Modify: `packages/cli/test/context.test.ts`

**Interfaces:**
- Consumes: `process.env.GITHUB_REF_NAME` and `packages/cli/package.json#version`.
- Produces: package script `verify:rc-tag`, implemented by `node scripts/verify-rc-tag.mjs`; exit code `0` means an exact matching RC tag, and exit code `1` means malformed or mismatched input.
- Produces: platform-aware context override assertions using `path.resolve()` rather than a POSIX-only literal.

- [x] **Step 1: Write failing RC verifier and package-script tests**

Create `packages/cli/test/release-tag.test.ts`:

```ts
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const verifierPath = path.resolve(testDir, '../scripts/verify-rc-tag.mjs');
const packageJson = JSON.parse(
  readFileSync(path.resolve(testDir, '../package.json'), 'utf8'),
) as { readonly version?: unknown };
if (typeof packageJson.version !== 'string') {
  throw new Error('CLI package version must be a string.');
}
const packageVersion = packageJson.version;
const matchingTag = `v${packageVersion}-rc.1`;
const mismatchedBase = packageVersion === '0.0.0' ? '0.0.1' : '0.0.0';

function runVerifier(tag: string | undefined) {
  const env = { ...process.env };
  if (tag === undefined) {
    delete env.GITHUB_REF_NAME;
  } else {
    env.GITHUB_REF_NAME = tag;
  }

  return spawnSync(process.execPath, [verifierPath], {
    encoding: 'utf8',
    env,
  });
}

describe('verify RC tag', () => {
  it('accepts a matching release-candidate tag', () => {
    const result = runVerifier(matchingTag);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `RC tag verified: ${matchingTag} targets ${packageVersion}.`,
    );
    expect(result.stderr).toBe('');
  });

  it.each([
    ['stable tag', `v${packageVersion}`],
    ['leading zero', `v${packageVersion}-rc.01`],
    ['missing tag', undefined],
  ])('rejects a malformed %s', (_label, tag) => {
    const result = runVerifier(tag);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'RC tag must match vX.Y.Z-rc.N without leading zeroes;',
    );
  });

  it('rejects an RC tag whose base differs from the package version', () => {
    const result = runVerifier(`v${mismatchedBase}-rc.1`);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `RC tag base mismatch: expected ${packageVersion}, received ${mismatchedBase}.`,
    );
  });
});
```

Extend the existing release-script assertion in
`packages/cli/test/package-metadata.test.ts` to require the new command:

```ts
expect(packageJson.scripts).toMatchObject({
  'test:assets:real': 'node scripts/smoke-real-assets.mjs',
  'verify:rc-tag': 'node scripts/verify-rc-tag.mjs',
  'verify:release-tag': 'node scripts/verify-release-tag.mjs',
});
```

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/release-tag.test.ts test/package-metadata.test.ts
```

Expected: FAIL because `scripts/verify-rc-tag.mjs` and the
`verify:rc-tag` package script do not exist.

- [x] **Step 3: Implement the minimal RC verifier and package command**

Create `packages/cli/scripts/verify-rc-tag.mjs`:

```js
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(
  readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
);
const tag = process.env.GITHUB_REF_NAME;
const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-rc\.(0|[1-9]\d*)$/u.exec(
  tag ?? '',
);

if (!match) {
  console.error(
    `RC tag must match vX.Y.Z-rc.N without leading zeroes; received ${tag ?? 'unset'}.`,
  );
  process.exitCode = 1;
} else {
  const baseVersion = `${match[1]}.${match[2]}.${match[3]}`;
  if (baseVersion !== packageJson.version) {
    console.error(
      `RC tag base mismatch: expected ${packageJson.version}, received ${baseVersion}.`,
    );
    process.exitCode = 1;
  } else {
    console.log(`RC tag verified: ${tag} targets ${baseVersion}.`);
  }
}
```

Add this exact script entry to `packages/cli/package.json` next to the stable
tag verifier:

```json
"verify:rc-tag": "node scripts/verify-rc-tag.mjs",
"verify:release-tag": "node scripts/verify-release-tag.mjs"
```

- [x] **Step 4: Replace the POSIX-only context expectation**

Replace the `accepts asset root override` test in
`packages/cli/test/context.test.ts` with:

```ts
it('accepts asset root override', () => {
  const assetsRoot = path.resolve('/game/lpc-assets');
  const context = createRuntimeContext({
    cwd: path.resolve('/repo'),
    assetsRoot,
  });

  expect(context.assetsRoot).toBe(assetsRoot);
  expect(context.spritesheetsBaseUrl).toBe(assetsRoot);
});
```

This change uses the observed Windows CI failure as the RED evidence:
Windows correctly resolved the literal to a drive-letter path while the old
test incorrectly expected the POSIX source string.

- [x] **Step 5: Run focused and full CLI verification**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/release-tag.test.ts test/package-metadata.test.ts test/context.test.ts
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: all focused tests PASS, the full CLI suite PASS with only its existing
documented skips, and TypeScript exits `0`.

- [x] **Step 6: Commit Task 1**

```bash
rtk git add packages/cli/package.json packages/cli/scripts/verify-rc-tag.mjs packages/cli/test/release-tag.test.ts packages/cli/test/package-metadata.test.ts packages/cli/test/context.test.ts
rtk git commit -m "test(cli): add release candidate tag verification"
```

Expected: one focused implementation commit. After task review passes, update
this task checkbox with an implementation note, the commit hash, and the exact
verification result, then commit that plan record separately.

**Implementation record:**

- Implementation: Added the exact RC tag verifier/package command and real
  subprocess coverage, then made the asset-root override expectation use
  platform-resolved paths.
- Commit: `22642c01670bd6769c6df3dbc128bdf3233456ae`
- Verification: focused tests 23/23 PASS; full CLI tests 136 PASS with 1
  existing skip; CLI typecheck PASS; task review spec compliant and task
  quality approved with no findings.

---

### Task 2: Split Routine and RC Platform Workflows and Document the Gate

**Files:**
- Create: `.github/workflows/cli-release-candidate.yml`
- Create: `packages/cli/test/release-workflows.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/publish.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1 package script `verify:rc-tag`.
- Produces: routine `CLI package (ubuntu-latest)` CI job.
- Produces: `CLI Release Candidate` workflow triggered by `v*.*.*-rc.*` or `workflow_dispatch`, with `CLI RC (macos-latest)` and `CLI RC (windows-latest)` jobs.
- Produces: stable publish tag filters that include `v*` and exclude `v*-*`.

- [x] **Step 1: Write failing workflow-contract tests**

Create `packages/cli/test/release-workflows.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '../../..');

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('CLI release workflows', () => {
  it('keeps routine CLI package validation on Ubuntu only', () => {
    const ci = readRepoFile('.github/workflows/ci.yml');
    const cliJob = ci.slice(ci.indexOf('  cli-package:'), ci.indexOf('  e2e:'));

    expect(cliJob).toContain('name: CLI package (ubuntu-latest)');
    expect(cliJob).toContain('runs-on: ubuntu-latest');
    expect(cliJob).not.toContain('matrix:');
    expect(cliJob).not.toContain('macos-latest');
    expect(cliJob).not.toContain('windows-latest');
  });

  it('defines tagged and manually dispatched macOS and Windows RC checks', () => {
    const rc = readRepoFile('.github/workflows/cli-release-candidate.yml');

    expect(rc).toContain("tags: ['v*.*.*-rc.*']");
    expect(rc).toContain('workflow_dispatch:');
    expect(rc).toContain('fail-fast: false');
    expect(rc).toContain('os: [macos-latest, windows-latest]');
    expect(rc).toContain("if: github.event_name == 'push'");
    expect(rc).toContain('pnpm --filter @lpc-toolkit/cli verify:rc-tag');
    for (const command of [
      'pnpm install --frozen-lockfile',
      'pnpm --filter @lpc-toolkit/cli typecheck',
      'pnpm --filter @lpc-toolkit/cli test',
      'pnpm --filter @lpc-toolkit/cli build',
      'pnpm --filter @lpc-toolkit/cli test:package',
    ]) {
      expect(rc).toContain(command);
    }
    expect(rc).toContain('contents: read');
    expect(rc).not.toContain('id-token: write');
    expect(rc).not.toContain('npm publish');
  });

  it('keeps prerelease tags out of stable publishing and verifies early', () => {
    const publish = readRepoFile('.github/workflows/publish.yml');
    const verifyIndex = publish.indexOf(
      'pnpm --filter @lpc-toolkit/cli verify:release-tag',
    );
    const installIndex = publish.indexOf('pnpm install --frozen-lockfile');

    expect(publish).toContain("- 'v*'");
    expect(publish).toContain("- '!v*-*'");
    expect(verifyIndex).toBeGreaterThan(-1);
    expect(verifyIndex).toBeLessThan(installIndex);
    expect(publish).toContain("if: github.ref_name != 'v0.1.0'");
  });

  it('documents tagged RC gates and advisory manual checks', () => {
    const readme = readRepoFile('README.md');

    expect(readme).toContain('v<version>-rc.<number>');
    expect(readme).toContain('macos-latest');
    expect(readme).toContain('windows-latest');
    expect(readme).toContain('advisory');
    expect(readme).toContain('does not publish npm');
  });
});
```

- [x] **Step 2: Run the workflow-contract tests and verify RED**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/release-workflows.test.ts
```

Expected: FAIL because the RC workflow does not exist, routine CI still has a
three-OS matrix, stable publishing accepts all `v*` tags, and the README lacks
the RC gate.

- [x] **Step 3: Make routine CLI CI Ubuntu-only**

Replace the existing `cli-package` job in `.github/workflows/ci.yml` with:

```yaml
  cli-package:
    name: CLI package (ubuntu-latest)
    needs: [unit, changes]
    if: needs.changes.outputs.cli == 'true' || github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @lpc-toolkit/cli typecheck
      - run: pnpm --filter @lpc-toolkit/cli test
      - run: pnpm --filter @lpc-toolkit/cli build
      - run: pnpm --filter @lpc-toolkit/cli test:package
```

Add the new workflow and stable publish workflow to the existing `cli` paths
filter so future workflow-only changes still exercise the Ubuntu CLI package
job:

```yaml
              - '.github/workflows/ci.yml'
              - '.github/workflows/cli-release-candidate.yml'
              - '.github/workflows/publish.yml'
```

- [x] **Step 4: Add the isolated RC workflow**

Create `.github/workflows/cli-release-candidate.yml`:

```yaml
name: CLI Release Candidate

on:
  push:
    tags: ['v*.*.*-rc.*']
  workflow_dispatch:

permissions:
  contents: read

jobs:
  validate:
    name: CLI RC (${{ matrix.os }})
    strategy:
      fail-fast: false
      matrix:
        os: [macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - name: Verify tagged release candidate
        if: github.event_name == 'push'
        run: pnpm --filter @lpc-toolkit/cli verify:rc-tag
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @lpc-toolkit/cli typecheck
      - run: pnpm --filter @lpc-toolkit/cli test
      - run: pnpm --filter @lpc-toolkit/cli build
      - run: pnpm --filter @lpc-toolkit/cli test:package
```

- [x] **Step 5: Exclude prerelease tags from stable publishing and fail mismatches early**

Replace the publish trigger in `.github/workflows/publish.yml` with:

```yaml
on:
  push:
    tags:
      - 'v*'
      - '!v*-*'
```

Move the existing stable verifier command to immediately after
`actions/setup-node@v4`, before global npm installation and the frozen pnpm
install:

```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 22.14.0
          registry-url: https://registry.npmjs.org
      - run: pnpm --filter @lpc-toolkit/cli verify:release-tag
      - run: npm install --global npm@11.5.1
      - run: pnpm install --frozen-lockfile
```

Keep `permissions: id-token: write`, real-asset verification, npm OIDC publish,
and the `v0.1.0` publish skip only in this stable workflow.

- [x] **Step 6: Document the tagged gate and advisory manual workflow**

Replace the `Maintainers: npm bootstrap and later releases` subsection in
`README.md` with:

```markdown
### Maintainers: RC validation, npm bootstrap, and later releases

Before any stable release, update `packages/cli/package.json` to the intended
stable version and push a matching `v<version>-rc.<number>` tag. The **CLI
Release Candidate** workflow verifies the full CLI package flow on
`macos-latest` and `windows-latest`; it does not publish npm. Both jobs must pass
before the matching stable tag is created.

Maintainers may also launch **CLI Release Candidate** manually for any selected
ref. A manual run performs the same macOS and Windows checks, but it is advisory
and does not replace a successful tagged RC run.

The first publication is a deliberate manual gate. After the tagged
`v0.1.0-rc.<number>` validation passes and the release is explicitly authorized:

1. Create and push stable tag `v0.1.0`.
2. Confirm the **Publish CLI** workflow passes all verification and skips only
   its publish step for `v0.1.0`.
3. From `packages/cli`, use the npm owner account and 2FA to run
   `npm publish --access public`.
4. Install `@lpc-toolkit/cli@0.1.0` from the public npm registry into a clean
   prefix and verify `lpc-toolkit --help` and a real asset-dependent command.
5. Configure npm Trusted Publisher for repository
   `ochowei/lpc-toolkit-2026-1`, workflow `publish.yml`, with `npm publish` as
   the allowed action.

For later releases, push the matching RC tag and wait for both platform jobs,
then manually push stable tag `v<version>`. The stable tag workflow verifies the
version, boundaries, types, tests, packed install, and real assets before
publishing via npm OIDC. After one later OIDC release succeeds, restrict
traditional token publishing. Creating tags, publishing, registry verification,
and Trusted Publisher configuration are external release operations and must
not be run as ordinary implementation verification.
```

- [x] **Step 7: Run focused workflow tests and required repository verification**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/release-workflows.test.ts test/release-tag.test.ts test/context.test.ts test/package-metadata.test.ts
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm --filter @lpc-toolkit/cli build
rtk pnpm --filter @lpc-toolkit/cli test:package
rtk pnpm check:boundaries
rtk pnpm run typecheck
rtk pnpm test
rtk git diff --check
```

Expected: all focused and full tests PASS with only existing documented skips;
CLI and workspace typechecks exit `0`; CLI build and packed-package smoke PASS;
boundary checks PASS; `git diff --check` reports no errors. The first real
macOS/Windows evidence remains intentionally deferred to a GitHub-hosted RC or
manual workflow run.

- [x] **Step 8: Commit Task 2**

```bash
rtk git add .github/workflows/ci.yml .github/workflows/cli-release-candidate.yml .github/workflows/publish.yml packages/cli/test/release-workflows.test.ts README.md
rtk git commit -m "ci(cli): gate macos and windows checks on release candidates"
```

Expected: one focused workflow/documentation commit. After task review passes,
update this task checkbox with an implementation note, the commit hash, and the
exact verification result, then commit that plan record separately.

**Implementation record:**

- Implementation: Made routine CLI package CI Ubuntu-only; added read-only,
  non-publishing tagged/manual RC validation on macOS and Windows; excluded
  prerelease tags from stable publishing; documented the manual gate; and
  added workflow contract tests.
- Commit: `ebe1fe3e90bd4e201149faf709c0417eec347d9f`
- Verification: workflow RED 4/4 as expected, then GREEN 4/4; focused tests
  27/27 PASS; full CLI tests 140 PASS with 1 existing skip; CLI and workspace
  typechecks, CLI build/package smoke, boundaries, and workspace tests (803
  PASS with 2 existing skips) PASS; task review spec compliant and task quality
  approved with no findings. Package smoke and workspace tests passed on exact
  sandbox-permission retries. Hosted macOS/Windows evidence remains the
  authorized post-merge RC/manual gate.

---

## Final Review and Delivery

After both task records are complete:

1. Run a whole-branch review against
   `docs/superpowers/specs/2026-07-10-cli-rc-cross-platform-validation-design.md`.
2. Fix every Critical or Important finding and repeat review.
3. Re-run the complete Task 2 verification list.
4. Push only if the user explicitly requests it. Do not create RC/stable tags,
   publish npm, or configure Trusted Publisher.
5. Record that GitHub-hosted macOS and Windows validation remains pending until
   an authorized manual workflow run or RC tag is created after merge.

**Final review record:**

- Initial whole-branch review found two Important runtime error-contract gaps
  and one Minor pre-download validation gap.
- Fix commit: `0e509e474898afc4be63038d162432839fd46ce0`
  adds release/cache/retry diagnostic context, preserves typed
  `asset_image_missing` issues through direct and preset renders, and preflights
  invalid asset commands before preparation.
- Fix verification: CLI tests 153 PASS with 1 existing skip; CLI and workspace
  typechecks, CLI build/package smoke, boundaries, and workspace tests PASS;
  focused TDD evidence is recorded in `.superpowers/sdd/cli-rc-final-fix-report.md`.
- Re-review verdict: `Ready to merge? Yes`; no Critical, Important, or Minor
  findings remain. Hosted macOS/Windows validation remains the authorized
  post-merge RC/manual gate and was not dispatched.
