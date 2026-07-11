# Boundary Checker and CI Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the approved core, presets, and web-component dependency boundaries with import-aware fixtures and run the checker in the main CI unit job.

**Architecture:** Extend the existing dependency-free Node scanner instead of adding a TypeScript parser or brittle repository-wide word searches. Keep checks scoped by source directory: core and presets inspect import specifiers plus explicit runtime globals; web components inspect named imports and resolved workflow-module paths; all web source retains the public-core-entry rule. Each policy category receives a legal and illegal temporary-repository fixture.

**Tech Stack:** Node.js ESM, JavaScript regular-expression import parsing, TypeScript fixture source, Vitest, GitHub Actions, pnpm.

## Global Constraints

- Prefix every local terminal command with `rtk`; use pnpm for this monorepo.
- Do not add dependencies or modify, install into, start a server from, or create generated files under `upstream/`.
- Do not modify runtime product behavior, public core APIs, selection/hash/token semantics, attribution, exports, or UI.
- `packages/core/src/**` must not depend on presets, web, CLI, React, browser runtime, Node runtime, or concrete canvas packages.
- `packages/presets/src/**` may depend on the public core entry point but must not depend on web, CLI, React, browser runtime, Node filesystem, or concrete canvas packages.
- `packages/web/src/components/**` must not directly import `composeSelections`, the concrete browser canvas adapter, or ZIP/export workflow implementations owned by approved hooks/libs.
- All `packages/web/src/**` core imports must continue through `@lpc-toolkit/core`, never core subpaths or source-relative paths.
- Checks must use import specifiers, imported names, resolved relative paths, and scoped source directories; do not add file-size, hook-name, subjective responsibility, or generic-word rules.
- Every enforced policy category needs at least one legal and one illegal fixture.
- Add `pnpm check:boundaries` to the main CI `unit` job while retaining it in `.github/workflows/publish.yml`.
- Do not add `any`; preserve the checker's stable success/failure output format.

---

## File Structure

- `scripts/check-boundaries.mjs` — import-aware package and component rules; remains the only checker implementation.
- `packages/web/test/boundary-check.test.ts` — temporary repository fixtures for all legal and illegal rules.
- `.github/workflows/ci.yml` — runs `pnpm check:boundaries` in the always-on unit job.
- `packages/web/test/package-scripts.test.ts` — protects CI placement and existing release enforcement.
- `docs/superpowers/plans/2026-07-11-boundary-checker-ci-enforcement.md` — task checkboxes, implementation notes, commits, review outcomes, and verification.

## Task 1: Complete core dependency enforcement

**Files:**
- Modify: `scripts/check-boundaries.mjs`
- Modify: `packages/web/test/boundary-check.test.ts`

**Interfaces:**
- `checkCoreFile` rejects bare or relative imports into presets, web, and CLI in addition to its existing React, Node, canvas, and browser-global rules.
- Package matching is boundary-aware: `@lpc-toolkit/presets` and `@lpc-toolkit/presets/...` match, while unrelated names containing that text do not.
- Existing exported `checkBoundaries(root): string[]` and CLI output remain unchanged.

- [ ] **Step 1: Add legal core and table-driven illegal fixtures**

Extend `makeRepoFixture` to create `packages/presets/src/index.ts` and `packages/cli/src/index.ts`. Add a legal core file importing a local core type. Add table tests for public and relative package leaks:

```ts
it.each([
  ['presets package', "import '@lpc-toolkit/presets';", '@lpc-toolkit/presets'],
  ['presets source', "import '../../presets/src/index';", '../../presets/src/index'],
  ['web package', "import '@lpc-toolkit/web';", '@lpc-toolkit/web'],
  ['web source', "import '../../web/src/lib/download';", '../../web/src/lib/download'],
  ['CLI package', "import '@lpc-toolkit/cli';", '@lpc-toolkit/cli'],
  ['CLI source', "import '../../cli/src/index';", '../../cli/src/index'],
  ['React', "import React from 'react';", 'react'],
  ['concrete canvas', "import { createCanvas } from '@napi-rs/canvas';", '@napi-rs/canvas'],
])('rejects core imports from %s', (_name, source, expected) => {
  const root = makeRepoFixture();
  writeFixtureFile(root, 'packages/core/src/leak.ts', source);
  expectBoundaryFailure(root, 'forbidden core import', expected);
});
```

Retain existing illegal browser-global and Node-import tests as the illegal fixtures for those categories. Add a passing fixture containing the words `document`, `react`, and `node:fs` only in comments/strings to prove they do not trigger generic-word checks.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/boundary-check.test.ts`

Expected: new presets/CLI package and relative-source cases FAIL because current core rules do not cover them.

- [ ] **Step 3: Add package-prefix and directory rules**

Add a boundary-aware helper:

```js
function isPackageImport(specifier, packageName) {
  return specifier === packageName || specifier.startsWith(`${packageName}/`);
}
```

Pass `presetsSrc` and `cliSrc` to `checkCoreFile`. Reject when a specifier matches any forbidden workspace package or its resolved relative target is inside those source directories. Keep existing React, Node built-in, canvas, web, and runtime-global checks intact.

- [ ] **Step 4: Run focused tests and checker**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/boundary-check.test.ts
rtk pnpm check:boundaries
rtk git diff --check
```

Expected: PASS; real core source has no new violations.

- [ ] **Step 5: Commit Task 1**

```bash
rtk git add scripts/check-boundaries.mjs packages/web/test/boundary-check.test.ts
rtk git commit -m "test(boundaries): enforce complete core isolation"
```

After review, check the task and record implementation note, full commit hash, and verification.

## Task 2: Enforce presets purity

**Files:**
- Modify: `scripts/check-boundaries.mjs`
- Modify: `packages/web/test/boundary-check.test.ts`

**Interfaces:**
- Adds `checkPresetsFile({ issues, root, presetsSrc, webSrc, cliSrc, filePath })`.
- Presets may import `@lpc-toolkit/core` and local preset modules.
- Presets reject web/CLI packages and relative source paths, React, browser globals, Node filesystem (`fs`, `fs/promises`, `node:fs`, `node:fs/promises`), and concrete canvas packages.

- [ ] **Step 1: Add a legal preset fixture and illegal category fixtures**

The legal fixture imports a type from the public core entry and a local preset module. Add table cases:

```ts
it.each([
  ['web package', "import '@lpc-toolkit/web';", '@lpc-toolkit/web'],
  ['web source', "import '../../web/src/lib/download';", '../../web/src/lib/download'],
  ['CLI package', "import '@lpc-toolkit/cli';", '@lpc-toolkit/cli'],
  ['CLI source', "import '../../cli/src/index';", '../../cli/src/index'],
  ['React', "import React from 'react';", 'react'],
  ['Node filesystem', "import { readFileSync } from 'node:fs';", 'node:fs'],
  ['concrete canvas', "import { createCanvas } from '@napi-rs/canvas';", '@napi-rs/canvas'],
])('rejects presets dependency on %s', (_name, source, expected) => {
  const root = makeRepoFixture();
  writeFixtureFile(root, 'packages/presets/src/leak.ts', source);
  expectBoundaryFailure(root, 'forbidden presets import', expected);
});
```

Add one illegal browser-global fixture using `window.localStorage`; add a passing comments/strings fixture.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/boundary-check.test.ts`

Expected: presets illegal fixtures FAIL because presets source is not currently scanned.

- [ ] **Step 3: Implement `checkPresetsFile` and scan presets source**

Add:

```js
const nodeFilesystemImports = new Set([
  'fs',
  'fs/promises',
  'node:fs',
  'node:fs/promises',
]);
```

For each presets source file, inspect import specifiers with the exact package/path rules above and inspect stripped runtime source with the existing browser-global list. Do not forbid all Node built-ins; Batch E specifically requires Node filesystem for presets.

- [ ] **Step 4: Run focused tests, checker, and typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/boundary-check.test.ts
rtk pnpm check:boundaries
rtk pnpm --filter @lpc-toolkit/presets typecheck
rtk git diff --check
```

Expected: PASS; the existing public core import in presets remains legal.

- [ ] **Step 5: Commit Task 2**

```bash
rtk git add scripts/check-boundaries.mjs packages/web/test/boundary-check.test.ts
rtk git commit -m "test(boundaries): enforce presets purity"
```

After review, check the task and record implementation note, full commit hash, and verification.

## Task 3: Enforce component ownership and public core imports

**Files:**
- Modify: `scripts/check-boundaries.mjs`
- Modify: `packages/web/test/boundary-check.test.ts`

**Interfaces:**
- Adds named static-import extraction sufficient for `import { composeSelections as compose } from '@lpc-toolkit/core'` and multiline imports.
- `checkWebComponentFile` rejects named `composeSelections` imports from the public core entry and any direct import resolving to `adapter/browser-canvas-adapter`, `lib/character-export`, `lib/spritesheet-export`, or `lib/zip-export`.
- Existing `checkWebFile` continues enforcing public core entry usage for every web source file.

- [ ] **Step 1: Add legal component fixtures and each illegal ownership fixture**

Create legal component imports from a hook, UI component, and public core type. Add:

```ts
it.each([
  [
    'core composition',
    "import { composeSelections as compose } from '@lpc-toolkit/core';\nexport { compose };",
    'composeSelections',
  ],
  [
    'browser adapter',
    "import { createBrowserCanvasAdapter } from '../adapter/browser-canvas-adapter';",
    'browser-canvas-adapter',
  ],
  [
    'character export workflow',
    "import { exportCharacterArtifact } from '../lib/character-export';",
    'character-export',
  ],
  [
    'spritesheet export workflow',
    "import { exportSpritesheetBundle } from '../lib/spritesheet-export';",
    'spritesheet-export',
  ],
  [
    'ZIP export workflow',
    "import { exportByFrameZip } from '../lib/zip-export';",
    'zip-export',
  ],
])('rejects component-owned %s', (_name, source, expected) => {
  const root = makeRepoFixture();
  writeFixtureFile(root, 'packages/web/src/components/leak.tsx', source);
  expectBoundaryFailure(root, 'forbidden web component import', expected);
});
```

Keep/add explicit legal and illegal fixtures for the all-web public-core-entry rule. Add a component comment/string containing `composeSelections` to prove named-import parsing is used.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/boundary-check.test.ts`

Expected: all new component illegal fixtures FAIL because components currently receive only the generic web core-entry check.

- [ ] **Step 3: Implement named-import and resolved-workflow checks**

Add a helper returning named bindings and source specifier from static imports. It must normalize aliases to the imported name:

```js
function namedImports(source) {
  const imports = [];
  const pattern = /\bimport\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) {
    const names = match[1]
      .split(',')
      .map((entry) => entry.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0])
      .filter(Boolean);
    imports.push({ specifier: match[2], names });
  }
  return imports;
}
```

Run this only against component files. Resolve relative specifiers and compare normalized extensionless paths to the four prohibited implementation modules. Do not forbid hook imports or public core type imports.

- [ ] **Step 4: Run focused tests and real-repository scans**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/boundary-check.test.ts
rtk pnpm check:boundaries
rtk rg -n "composeSelections|browser-canvas-adapter|character-export|spritesheet-export|zip-export" packages/web/src/components
rtk git diff --check
```

Expected: tests/checker PASS. The `rg` command may find explanatory test-independent text only if present; every actual component import must satisfy the new checker.

- [ ] **Step 5: Commit Task 3**

```bash
rtk git add scripts/check-boundaries.mjs packages/web/test/boundary-check.test.ts
rtk git commit -m "test(boundaries): enforce web component ownership"
```

After review, check the task and record implementation note, full commit hash, and verification.

## Task 4: Run boundaries in the main CI unit job

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `packages/web/test/package-scripts.test.ts`

**Interfaces:**
- Main `unit` job runs `pnpm check:boundaries` after frozen install and before typecheck/tests.
- `.github/workflows/publish.yml` retains its existing boundary command.
- Static workflow test uses bounded `unit` job markers and verifies command ordering.

- [ ] **Step 1: Add the failing CI contract test**

Create a bounded unit-job slice and assert marker validity plus ordering:

```ts
const unitJobStart = ciWorkflow.indexOf('  unit:');
const cliJobStart = ciWorkflow.indexOf('  cli-package:');

expect(unitJobStart).toBeGreaterThanOrEqual(0);
expect(cliJobStart).toBeGreaterThan(unitJobStart);

const unitJob = ciWorkflow.slice(unitJobStart, cliJobStart);
expect(unitJob).toContain('- run: pnpm check:boundaries');
expect(unitJob.indexOf('pnpm install --frozen-lockfile')).toBeLessThan(
  unitJob.indexOf('pnpm check:boundaries'),
);
expect(unitJob.indexOf('pnpm check:boundaries')).toBeLessThan(
  unitJob.indexOf('pnpm typecheck'),
);
```

Read `.github/workflows/publish.yml` and assert it still contains `- run: pnpm check:boundaries`.

- [ ] **Step 2: Run the package-script test and verify RED**

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/package-scripts.test.ts`

Expected: FAIL because the main unit job does not run the boundary checker.

- [ ] **Step 3: Add the boundary step to CI**

In `.github/workflows/ci.yml`, make the unit sequence exactly:

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm check:boundaries
- run: pnpm typecheck
- run: pnpm test
```

Do not move or remove the publish workflow's existing boundary command.

- [ ] **Step 4: Run workflow and checker tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/package-scripts.test.ts test/boundary-check.test.ts
rtk pnpm check:boundaries
rtk git diff --check
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
rtk git add .github/workflows/ci.yml packages/web/test/package-scripts.test.ts
rtk git commit -m "ci: enforce architecture boundaries in unit job"
```

After review, check the task and record implementation note, full commit hash, and verification.

## Task 5: Verify Plan 5 and record evidence

**Files:**
- Modify: `docs/superpowers/plans/2026-07-11-boundary-checker-ci-enforcement.md`

**Interfaces:**
- Produces a completed Plan 5 record with every task checked, exact commits, reviewer outcomes, fixture counts, and fresh verification.
- Makes no runtime, dependency, asset, or submodule change.

- [ ] **Step 1: Run focused boundary and workflow verification**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/boundary-check.test.ts test/package-scripts.test.ts
rtk pnpm check:boundaries
rtk rg -n "pnpm check:boundaries" .github/workflows/ci.yml .github/workflows/publish.yml package.json
```

Expected: tests and checker PASS; command appears at workspace root, main CI, and publish verification.

- [ ] **Step 2: Run full workspace verification**

Run:

```bash
rtk pnpm typecheck
rtk pnpm test
rtk git diff --check
rtk git status --short
```

Expected: PASS; status shows only intentional Plan 5 changes and preserved `docs/README-ARCHITECTURE-AUDIT.tmp.md`.

- [ ] **Step 3: Audit objective scope and unchanged areas**

Inspect the final diff. Confirm every Batch E rule has legal/illegal fixture evidence, checker messages identify file/rule/specifier or global, and no subjective/file-size/naming rule was added. Confirm no diff under `packages/core/`, `packages/presets/`, runtime web source, dependency files, assets, or `upstream/`.

- [ ] **Step 4: Record completion and commit plan evidence**

Update all task notes, exact commit hashes, review outcomes, fixture/test counts, and verification results, then run:

```bash
rtk git add docs/superpowers/plans/2026-07-11-boundary-checker-ci-enforcement.md
rtk git commit -m "docs(plan): record boundary enforcement completion"
```

## Final Acceptance Criteria

- Core imports from presets, web, CLI, React, Node runtime, and concrete canvas fail; core browser globals fail.
- Presets public-core/local imports pass; web, CLI, React, Node filesystem, concrete canvas, and browser runtime dependencies fail.
- Web components cannot import `composeSelections`, the concrete browser adapter, or the three approved export workflow modules directly.
- All web source still imports core only through `@lpc-toolkit/core`.
- Every policy category has legal and illegal fixture coverage without generic-word or subjective checks.
- `pnpm check:boundaries` passes locally and runs in both main CI unit verification and publish verification.
- Focused tests, workspace typecheck/tests, diff checks, and final review pass.
- Runtime source, dependencies, assets, and tracked `upstream/` remain unchanged.
