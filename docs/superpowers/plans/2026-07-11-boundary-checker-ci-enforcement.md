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

- [x] **Step 1: Add legal core and table-driven illegal fixtures**

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

- [x] **Step 2: Run focused tests and verify RED**

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/boundary-check.test.ts`

Expected: new presets/CLI package and relative-source cases FAIL because current core rules do not cover them.

- [x] **Step 3: Add package-prefix and directory rules**

Add a boundary-aware helper:

```js
function isPackageImport(specifier, packageName) {
  return specifier === packageName || specifier.startsWith(`${packageName}/`);
}
```

Pass `presetsSrc` and `cliSrc` to `checkCoreFile`. Reject when a specifier matches any forbidden workspace package or its resolved relative target is inside those source directories. Keep existing React, Node built-in, canvas, web, and runtime-global checks intact.

- [x] **Step 4: Run focused tests and checker**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/boundary-check.test.ts
rtk pnpm check:boundaries
rtk git diff --check
```

Expected: PASS; real core source has no new violations.

- [x] **Step 5: Commit Task 1**

```bash
rtk git add scripts/check-boundaries.mjs packages/web/test/boundary-check.test.ts
rtk git commit -m "test(boundaries): enforce complete core isolation"
```

After review, check the task and record implementation note, full commit hash, and verification.

Implementation note: Added boundary-aware workspace package matching for presets,
web, and CLI plus resolved relative-source checks, with legal local-core,
comments/strings, and unrelated-package-name fixtures protecting false positives.

- Commit: `04b11c0ede38ebb4518109ebbb9c288421a0e1f4`
- Verification: RED focused Vitest (`5 failed, 9 passed`); GREEN focused Vitest
  (`14 passed`); repository boundaries PASS; `git diff --check` PASS.
- Review outcome: Clean; no Task 1 review fix was required.

## Task 2: Enforce presets purity

**Files:**
- Modify: `scripts/check-boundaries.mjs`
- Modify: `packages/web/test/boundary-check.test.ts`

**Interfaces:**
- Adds `checkPresetsFile({ issues, root, webSrc, cliSrc, filePath })`.
- Presets may import `@lpc-toolkit/core` and local preset modules.
- Presets reject web/CLI packages and relative source paths, React, browser globals, Node filesystem (`fs`, `fs/promises`, `node:fs`, `node:fs/promises`), and concrete canvas packages.

- [x] **Step 1: Add a legal preset fixture and illegal category fixtures**

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

- [x] **Step 2: Run focused tests and verify RED**

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/boundary-check.test.ts`

Expected: presets illegal fixtures FAIL because presets source is not currently scanned.

- [x] **Step 3: Implement `checkPresetsFile` and scan presets source**

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

- [x] **Step 4: Run focused tests, checker, and typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/boundary-check.test.ts
rtk pnpm check:boundaries
rtk pnpm --filter @lpc-toolkit/presets typecheck
rtk git diff --check
```

Expected: PASS; the existing public core import in presets remains legal.

- [x] **Step 5: Commit Task 2**

```bash
rtk git add scripts/check-boundaries.mjs packages/web/test/boundary-check.test.ts
rtk git commit -m "test(boundaries): enforce presets purity"
```

After review, check the task and record implementation note, full commit hash, and verification.

Implementation note: Added a presets-only import and runtime-global scan that
allows the public core entry, local preset modules, and non-filesystem Node
builtins while rejecting web/CLI packages and sources, React, the exact Node
filesystem family, concrete canvas packages, and browser globals. Fixtures
cover legal imports, legal comments/strings, all four filesystem specifiers,
and every forbidden category.

- Commit: `f27a7d6baf03672d6a9a12adf7a91b3b594b13d4`
- Verification: RED focused Vitest (`11 failed, 16 passed`); GREEN focused
  Vitest (`27 passed`); repository boundaries PASS; presets typecheck PASS;
  `git diff --check` PASS.

Review fix note: Replaced raw-source import regular expressions with a shared
dependency-free lexical tokenizer/parser so core, presets, and web checks ignore
complete import syntax in comments, ordinary strings, and template text while
retaining static, dynamic, export-from, multiline, and template-expression
imports. Removed the unused `presetsSrc` parameter from `checkPresetsFile`.

- Review fix commit: `17108b4605a54a7feb052803505bafb907828d66`
- Review verification: RED focused Vitest (`1 failed, 30 passed`) for lexical
  text; intermediate GREEN (`31 passed`); second RED (`1 failed, 31 passed`)
  for dynamic import in a template expression; final GREEN (`32 passed`);
  repository boundaries PASS; `git diff --check` PASS.

Template-specifier review follow-up: Added no-substitution template literal
specifier tokens for dynamic imports without treating templates containing
`${...}` as one static specifier. Core, presets, and web bypass fixtures now
cover this form while inert and computed template cases remain legal.

- Follow-up commit: `f745b36627b1f6ae4583572e280f0e3a20e3b505`
- Follow-up verification: RED focused Vitest (`3 failed, 33 passed`); GREEN
  focused Vitest (`36 passed`); repository boundaries PASS;
  `git diff --check` PASS.

Computed-template review follow-up: Preserved a structural marker for computed
templates and made dynamic-import parsing terminal, preventing the first quoted
expression token from being misclassified as the outer static specifier while
retaining recursive nested-import detection.

- Follow-up commit: `b49c35e551008eb08c53f7c45b9ae0947fd730dd`
- Follow-up verification: RED focused Vitest (`1 failed, 37 passed`); GREEN
  focused Vitest (`38 passed`); repository boundaries PASS;
  `git diff --check` PASS.
- Review outcome: Import parsing bypasses were fixed in
  `17108b4605a54a7feb052803505bafb907828d66`,
  `f745b36627b1f6ae4583572e280f0e3a20e3b505`, and
  `b49c35e551008eb08c53f7c45b9ae0947fd730dd`; final re-review clean.

## Task 3: Enforce component ownership and public core imports

**Files:**
- Modify: `scripts/check-boundaries.mjs`
- Modify: `packages/web/test/boundary-check.test.ts`

**Interfaces:**
- Adds named static-import extraction sufficient for `import { composeSelections as compose } from '@lpc-toolkit/core'` and multiline imports.
- `checkWebComponentFile` rejects named `composeSelections` imports from the public core entry and any direct import resolving to `adapter/browser-canvas-adapter`, `lib/character-export`, `lib/spritesheet-export`, or `lib/zip-export`.
- Existing `checkWebFile` continues enforcing public core entry usage for every web source file.

- [x] **Step 1: Add legal component fixtures and each illegal ownership fixture**

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

- [x] **Step 2: Run focused tests and verify RED**

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/boundary-check.test.ts`

Expected: all new component illegal fixtures FAIL because components currently receive only the generic web core-entry check.

- [x] **Step 3: Implement named-import and resolved-workflow checks**

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

- [x] **Step 4: Run focused tests and real-repository scans**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/boundary-check.test.ts
rtk pnpm check:boundaries
rtk rg -n "composeSelections|browser-canvas-adapter|character-export|spritesheet-export|zip-export" packages/web/src/components
rtk git diff --check
```

Expected: tests/checker PASS. The `rg` command may find explanatory test-independent text only if present; every actual component import must satisfy the new checker.

- [x] **Step 5: Commit Task 3**

```bash
rtk git add scripts/check-boundaries.mjs packages/web/test/boundary-check.test.ts
rtk git commit -m "test(boundaries): enforce web component ownership"
```

After review, check the task and record implementation note, full commit hash, and verification.

Implementation note: Reused the shared lexical tokenizer to extract static
named imports without matching comments, strings, or template text. Component
files now reject aliased or multiline `composeSelections` imports from the
public core entry and relative imports resolving to the browser canvas adapter
or character, spritesheet, and ZIP export workflows. Hook/UI imports and public
core type imports remain legal, while the all-web public-core-entry check is
unchanged.

- Commit: `88e39a35e58ce543d52dfd75cbfdb0f31fed26c9`
- Verification: RED focused Vitest (`6 failed, 40 passed`); GREEN focused
  Vitest (`46 passed`); repository boundaries PASS; component import scan found
  only approved `use-character-export` hook imports; `git diff --check` PASS.

Review fix note: Routed prohibited component module paths through the shared
`importSpecifiers` stream, closing dynamic-import and export-from bypasses while
retaining static named-import analysis for `composeSelections` aliases.

- Review fix commit: `69e5ca07c78e4c7d18f54b2ba0a6b7df06dfe8ff`
- Review verification: RED focused Vitest (`2 failed, 48 passed`); GREEN focused
  Vitest (`50 passed`); repository boundaries PASS; diff checks PASS; re-review
  clean.
- Review outcome: Dynamic-import and export-from bypasses were fixed in
  `69e5ca07c78e4c7d18f54b2ba0a6b7df06dfe8ff`; final re-review clean.

## Task 4: Run boundaries in the main CI unit job

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `packages/web/test/package-scripts.test.ts`

**Interfaces:**
- Main `unit` job runs `pnpm check:boundaries` after frozen install and before typecheck/tests.
- `.github/workflows/publish.yml` retains its existing boundary command.
- Static workflow test uses bounded `unit` job markers and verifies command ordering.

- [x] **Step 1: Add the failing CI contract test**

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

- [x] **Step 2: Run the package-script test and verify RED**

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/package-scripts.test.ts`

Expected: FAIL because the main unit job does not run the boundary checker.

- [x] **Step 3: Add the boundary step to CI**

In `.github/workflows/ci.yml`, make the unit sequence exactly:

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm check:boundaries
- run: pnpm typecheck
- run: pnpm test
```

Do not move or remove the publish workflow's existing boundary command.

- [x] **Step 4: Run workflow and checker tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/package-scripts.test.ts test/boundary-check.test.ts
rtk pnpm check:boundaries
rtk git diff --check
```

Expected: PASS.

- [x] **Step 5: Commit Task 4**

```bash
rtk git add .github/workflows/ci.yml packages/web/test/package-scripts.test.ts
rtk git commit -m "ci: enforce architecture boundaries in unit job"
```

After review, check the task and record implementation note, full commit hash, and verification.

- Implementation: Added the root boundary checker to the main CI `unit` job
  between frozen install and typecheck, with a bounded static workflow contract
  that also preserves the publish workflow boundary command.
- Commit: `de963e282670ba4a1e77331d1def75fe824f2079`
- Verification: RED package-script test (`1 failed, 7 passed`); GREEN focused
  workflow and boundary tests (`58 passed`); repository boundary checker PASS;
  diff check PASS.
- Review fix: Strengthened the bounded `unit` contract to require the exact
  four consecutive install, boundary, typecheck, and test command lines.
- Review fix commit: `7ff1976ea7ea372ef2b8911766e0029d7158cc48`
- Review verification: Focused workflow and boundary tests (`58 passed`);
  repository boundary checker PASS; diff check PASS. No additional RED was
  available because the committed workflow already had the required sequence.
- Review outcome: The exact consecutive workflow contract was strengthened in
  `7ff1976ea7ea372ef2b8911766e0029d7158cc48`; final re-review clean.

## Task 5: Verify Plan 5 and record evidence

**Files:**
- Modify: `docs/superpowers/plans/2026-07-11-boundary-checker-ci-enforcement.md`

**Interfaces:**
- Produces a completed Plan 5 record with every task checked, exact commits, reviewer outcomes, fixture counts, and fresh verification.
- Makes no runtime, dependency, asset, or submodule change.

- [x] **Step 1: Run focused boundary and workflow verification**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/boundary-check.test.ts test/package-scripts.test.ts
rtk pnpm check:boundaries
rtk rg -n "pnpm check:boundaries" .github/workflows/ci.yml .github/workflows/publish.yml package.json
```

Expected: tests and checker PASS; command appears at workspace root, main CI, and publish verification.

Implementation note: Focused Vitest passed `58/58` tests (`50` boundary
fixtures and `8` workflow/package contracts). The repository checker passed.
The root command is `package.json`'s `check:boundaries` script, and both the
main CI unit job and publish verification invoke `pnpm check:boundaries`.

- [x] **Step 2: Run full workspace verification**

Run:

```bash
rtk pnpm typecheck
rtk pnpm test
rtk git diff --check
rtk git status --short
```

Expected: PASS; status shows only intentional Plan 5 changes and preserved `docs/README-ARCHITECTURE-AUDIT.tmp.md`.

Implementation note: Recursive workspace typecheck passed for core, presets,
web, and CLI. The full suite passed `108` test files with `911` tests passed
and `1` skipped. `git diff --check` passed. The untracked
`docs/README-ARCHITECTURE-AUDIT.tmp.md` audit file remained preserved.

- [x] **Step 3: Audit objective scope and unchanged areas**

Inspect the final diff. Confirm every Batch E rule has legal/illegal fixture evidence, checker messages identify file/rule/specifier or global, and no subjective/file-size/naming rule was added. Confirm no diff under `packages/core/`, `packages/presets/`, runtime web source, dependency files, assets, or `upstream/`.

Implementation note: Audited `50` boundary fixtures: `10` legal cases and `40`
illegal cases. They cover every core, presets, all-web public-core-entry, and
component-ownership policy category, including static, dynamic, export-from,
template, lexical-text, package-prefix, and relative-resolution behavior.
Illegal expectations identify the fixture file, rule text, and offending
specifier or runtime global. No generic-word, subjective responsibility,
file-size, hook-name, or naming rule was added. Against the pre-Plan-5 baseline
`ca8db2668da164e47a1fd7650b354fbc658cddeb`, changes are limited to
`.github/workflows/ci.yml`, `scripts/check-boundaries.mjs`, the two boundary
contract test files, and this plan. There are no diffs under `packages/core/`,
`packages/presets/`, runtime `packages/web/src/`, dependency manifests or
lockfiles, `assets/`, or tracked `upstream/` content.

- [x] **Step 4: Record completion and commit plan evidence**

Update all task notes, exact commit hashes, review outcomes, fixture/test counts, and verification results, then run:

```bash
rtk git add docs/superpowers/plans/2026-07-11-boundary-checker-ci-enforcement.md
rtk git commit -m "docs(plan): record boundary enforcement completion"
```

Final-review fix note: Replaced the runtime-global regex sanitizer with the
shared lexical token stream so executable template substitutions and code after
URL strings remain visible while comments, strings, and regex literals remain
inert. Concrete canvas package matching now includes package subpaths. Component
ownership now rejects public-core `composeSelections` re-exports and dynamic
import access/destructuring.

- Final-review fix commit: `68361ad1fe27b6839691836f68acbf0d7ae7e9aa`
- Final-review RED verification: focused boundary Vitest failed the new
  regressions (`9 failed, 50 passed`): one regex-literal false positive, two
  duplicated canvas-subpath cases subsequently consolidated, three
  runtime-global bypasses, and three component-ownership bypasses.
- Final-review GREEN verification: focused boundary Vitest (`59 passed`);
  focused boundary/workflow Vitest (`67 passed`); repository boundary checker
  PASS; web TypeScript check reported no errors; `git diff --check` PASS.

Second final-review fix note: Refined lexical slash context so expression-prefix
keywords such as `return` permit regex literals while numbers and completed
literals imply division, preventing division from consuming later code. Dynamic
core-import ownership checks are now bounded to direct property access, the
matching `.then(...)` callback, or a destructuring declaration on the import's
left-hand side instead of scanning until the next semicolon.

- Second final-review fix commit: `669e64f4b349b9e0369d8812e110917b3350acbc`
- Second final-review RED verification: focused boundary Vitest failed exactly
  the three new regressions (`3 failed, 59 passed`): returned regex text was a
  false positive, division hid a later forbidden import, and a semicolonless
  unrelated declaration after dynamic import was a false positive.
- Second final-review GREEN verification: focused boundary Vitest (`62 passed`);
  focused boundary/workflow Vitest (`70 passed`); repository boundary checker
  PASS; recursive workspace typecheck PASS; `git diff --check` PASS.

AST correction closure note: The TypeScript-AST replacement and its review
fixes are complete through `a4d181ff40960b7c44db5c94d44cf101b7b0cf98`.
Fresh focused verification passed `79/79` tests (`71` boundary and `8`
workflow/package tests). Full workspace verification passed `108` files with
`932` tests passed and `1` intentional skip; the boundary checker, recursive
four-project typecheck, and `git diff --check` all passed. The scope audit from
`894277f67` found only checker, boundary-test, and plan/evidence changes, with
no manifest, lockfile, runtime source, asset, or `upstream/` changes. Independent
final AST review remains pending and is not recorded as PASS.

- AST closure evidence commit: `b8b636c9f7ee41bf054a37be893c248e4eb6a289`

Final branch-review correction `caddd1fa5569f1698bc67119f3977d3e1351dd05`
expanded AST binding and module ownership coverage. Focused tests pass 89/89;
full workspace tests pass 942 with 1 intentional skip; checker, recursive
typecheck, and diff check pass. Independent final review remains pending.
Namespace identity follow-up `1d3dfe8824853eacafe371355142b0d97cd5f7a4`
passes 90 focused tests and 943 full-suite tests with 1 intentional skip.
Second final-review implementation `bd4a578d8ddd250654aefd79a59898f48b263124`
passes 95 focused and 948 full-suite tests with 1 intentional skip, including
loop-RHS globals, function-scoped `var`, and dynamic-core element ownership.

## Final Acceptance Criteria

- Core imports from presets, web, CLI, React, Node runtime, and concrete canvas fail; core browser globals fail.
- Presets public-core/local imports pass; web, CLI, React, Node filesystem, concrete canvas, and browser runtime dependencies fail.
- Web components cannot import `composeSelections`, the concrete browser adapter, or the three approved export workflow modules directly.
- All web source still imports core only through `@lpc-toolkit/core`.
- Every policy category has legal and illegal fixture coverage without generic-word or subjective checks.
- `pnpm check:boundaries` passes locally and runs in both main CI unit verification and publish verification.
- Focused tests, workspace typecheck/tests, diff checks, and final review pass.
- Runtime source, dependencies, assets, and tracked `upstream/` remain unchanged.
