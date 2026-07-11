# Boundary Checker TypeScript AST Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace syntax-sensitive boundary-checker token heuristics with TypeScript AST analysis so valid JavaScript syntax is not falsely rejected and forbidden dependencies cannot hide behind lexer edge cases.

**Architecture:** `scripts/check-boundaries.mjs` will parse every supported source file with the repository's existing TypeScript 5.7 compiler API and walk executable AST nodes. Existing filesystem traversal, package-prefix matching, rule ownership, diagnostics, and CI commands remain unchanged; the handwritten lexer is removed after every consumer migrates.

**Tech Stack:** Node.js ESM, TypeScript compiler API 5.7, Vitest, pnpm workspaces

## Global Constraints

- Do not add a dependency; use the existing root `typescript` dev dependency (`~5.7.0`).
- Do not modify runtime source, assets, dependency manifests, lockfile, or `upstream/`.
- Preserve existing CLI behavior, rule messages, boundary-aware package matching, and CI wiring.
- Parse `.js`, `.jsx`, `.ts`, and `.tsx` using the matching TypeScript `ScriptKind`.
- Parse diagnostics must fail closed with the source path; they must not silently skip enforcement.
- Use `rtk` for every terminal command.
- After each task, update its checkbox, implementation note, commit hash, and verification status in this plan.

---

### Task 1: Prove AST Syntax Requirements with Fixtures

**Files:**
- Modify: `packages/web/test/boundary-check.test.ts`
- Modify: `docs/superpowers/plans/2026-07-11-boundary-checker-typescript-ast.md`

**Interfaces:**
- Consumes: the existing boundary fixture helper that writes a temporary source tree and invokes `scripts/check-boundaries.mjs`.
- Produces: regression fixtures defining the required legal and illegal behavior for the AST migration.

- [x] **Step 1: Add legal regex and unrelated-name fixtures**

Add individual legal fixtures equivalent to:

```ts
function returned(value: string) {
  return /import('react')/.test(value);
}

if (enabled) /import('@lpc-toolkit/web')/.test(value);
else /import('react')/.test(value);
do /import('react')/.test(value); while (false);

import('@lpc-toolkit/core').then(() => {
  const composeSelections = 1;
  return composeSelections;
});
```

Each fixture must assert checker exit status `0` and must live in the narrowest core, presets, or component fixture directory relevant to the rule.

- [x] **Step 2: Add illegal division and dynamic-core ownership fixtures**

Add individual illegal fixtures equivalent to:

```ts
const ratio = 10 / divisor;
import('react');
```

```ts
const compose = (await import('@lpc-toolkit/core')).composeSelections;
```

Assert non-zero exit status and the existing rule-specific diagnostic text. Keep existing direct-property, destructuring, re-export, template-expression, canvas-subpath, and runtime-global fixtures unchanged.

- [x] **Step 3: Run the focused suite and verify RED**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- boundary-check.test.ts package-scripts.test.ts
```

Expected: the newly added regex/control-context and parenthesized awaited-import cases fail for the reviewed lexer defects; all pre-existing fixtures remain green. Record the exact failed/passed counts in the implementation note.

- [x] **Step 4: Commit the RED fixtures**

```bash
rtk git add packages/web/test/boundary-check.test.ts docs/superpowers/plans/2026-07-11-boundary-checker-typescript-ast.md
rtk git commit -m "test(boundaries): cover AST syntax edge cases"
```

Record the commit hash and RED verification status under Task 1.

Implementation note: Added exact return-regex and control-flow regex fixtures in core,
an unrelated local `composeSelections` callback fixture in web components, and a
parenthesized awaited dynamic-core property-access rejection fixture. The existing
division fixture already exercises the required illegal syntax and remains unchanged.
Focused RED verification completed with 2 test files, 72 tests total: 69 passed and
3 failed. The control-flow regex fixture was falsely reported as three forbidden core
imports, the unrelated callback-local name was falsely reported as a forbidden web
component import, and the parenthesized awaited dynamic-core ownership leak was missed.
The exact return-regex fixture and all pre-existing fixtures passed.

- Commit: b26c756a518a587d9f568ae24f49358139a13d12
- Verification: RED as expected — 69 passed, 3 failed

---

### Task 2: Replace Token Scanning with TypeScript AST Analysis

**Files:**
- Modify: `scripts/check-boundaries.mjs`
- Test: `packages/web/test/boundary-check.test.ts`
- Modify: `docs/superpowers/plans/2026-07-11-boundary-checker-typescript-ast.md`

**Interfaces:**
- Consumes: source file path and text already read by the checker.
- Produces: `parseSource(filePath, source): ts.SourceFile`, `walk(node, visitor): void`, module-specifier records for import/export/dynamic-import nodes, executable identifier detection, and core `composeSelections` ownership detection.

- [x] **Step 1: Add TypeScript parsing and fail-closed diagnostics**

Import TypeScript and choose script kind by extension:

```js
import ts from 'typescript';

const scriptKinds = new Map([
  ['.js', ts.ScriptKind.JS],
  ['.jsx', ts.ScriptKind.JSX],
  ['.ts', ts.ScriptKind.TS],
  ['.tsx', ts.ScriptKind.TSX],
]);

function parseSource(filePath, source) {
  const parsed = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKinds.get(path.extname(filePath)),
  );
  if (parsed.parseDiagnostics.length > 0) {
    const message = ts.flattenDiagnosticMessageText(
      parsed.parseDiagnostics[0].messageText,
      '\n',
    );
    throw new Error(`${filePath}: unable to parse source: ${message}`);
  }
  return parsed;
}
```

Use the checker entry point's existing error path so parse failures produce a non-zero exit and include the file path.

- [x] **Step 2: Collect real module references from AST nodes**

Walk the source file and collect only:

```js
ts.isImportDeclaration(node)
ts.isExportDeclaration(node) && node.moduleSpecifier
ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
```

Accept only string-literal-like module specifiers. Preserve the current output shape consumed by core, presets, all-web public-core, component, and canvas rules. Comments, strings, regex literals, and inert template text must not generate records; a dynamic import inside `${...}` must generate one.

- [x] **Step 3: Detect executable runtime globals**

Walk `Identifier` nodes and ignore non-reference positions: import/export specifiers, property names in `obj.document`, object-literal keys, declarations, labels, and type-only nodes. Treat shorthand properties and executable identifiers inside template substitutions as references. Replace `runtimeWords(source)` consumers with this AST-derived set.

- [x] **Step 4: Tie `composeSelections` to core module values**

Reject only these relationships:

```ts
import { composeSelections } from '@lpc-toolkit/core';
export { composeSelections } from '@lpc-toolkit/core';
const { composeSelections } = await import('@lpc-toolkit/core');
(await import('@lpc-toolkit/core')).composeSelections;
import('@lpc-toolkit/core').then((core) => core.composeSelections);
import('@lpc-toolkit/core').then(({ composeSelections }) => composeSelections);
```

Implement this structurally by unwrapping parenthesized/await expressions around a dynamic import, inspecting property-access parents, binding patterns initialized from that value, and `.then()` callback parameters tied to that promise. Do not search callback text for a generic word. An unrelated local `composeSelections` remains legal.

- [x] **Step 5: Remove obsolete lexer helpers**

Delete `sourceTokens`, `canStartRegex`, punctuation-range scans, and any unused token-based helpers. Keep package matching and filesystem resolution helpers unchanged.

- [x] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- boundary-check.test.ts package-scripts.test.ts
```

Expected: all focused fixtures pass, including every pre-existing fixture and Task 1 regression case.

- [x] **Step 7: Run checker and typecheck**

Run separately:

```bash
rtk pnpm check:boundaries
rtk pnpm -r typecheck
rtk git diff --check
```

Expected: each exits `0`. Record exact results.

- [x] **Step 8: Commit the AST implementation**

```bash
rtk git add scripts/check-boundaries.mjs docs/superpowers/plans/2026-07-11-boundary-checker-typescript-ast.md
rtk git commit -m "fix(boundaries): analyze source with TypeScript AST"
```

Record the commit hash and verification status under Task 2.

Implementation note: Replaced the handwritten lexer with the repository's
TypeScript 5.7 parser, fail-closed parse diagnostics, AST module-reference
collection, executable-identifier filtering, and structural ownership tracking
for `composeSelections` values from `@lpc-toolkit/core`. The obsolete token,
regex-context, and punctuation-range helpers were removed while package and path
matching remained unchanged. With user approval, corrected the legal control-flow
regex fixture to escape the `/` in `@lpc-toolkit/web`; the original fixture was
invalid TypeScript and correctly triggered the new fail-closed diagnostic.

- Commit: 01b54f188bc615cedf40da70e8dc440753eb8d83
- Verification: focused tests PASS (2 files, 72 tests); boundary checker PASS;
  recursive workspace typecheck PASS (4 projects); `git diff --check` PASS

Review-fix note: Added RED fixtures for nested callback-parameter shadowing,
rejection callbacks, type-only composition imports/re-exports, and noncomputed
destructuring keys. RED was 4 failed and 72 passed; after making callback ownership
scope-aware, limiting `.then()` analysis to its fulfillment callback, honoring
TypeScript `isTypeOnly` flags, and excluding binding property keys from executable
global references, GREEN was 76 passed.

- Review-fix commit: 3b65c6a95a9f81071248cc5c9df72377a299eb89
- Review-fix verification: focused tests PASS (2 files, 76 tests); boundary checker
  PASS; recursive workspace typecheck PASS (4 projects); `git diff --check` PASS

Second review-fix note: Added fixtures for catch-parameter shadowing, `for...of`,
`for...in`, and classic `for` initializer shadowing, plus an illegal computed
binding key that must remain an executable runtime-global reference. RED was 2
failed and 77 passed, with the computed-key rejection already green. Replaced the
partial callback scope special cases with ancestor-owned binding resolution for
parameters, variable declarations, catch bindings, loop initializers, and nested
function/class scopes. GREEN was 79 passed.

- Second review-fix commit: a4d181ff40960b7c44db5c94d44cf101b7b0cf98
- Second review-fix verification: focused tests PASS (2 files, 79 tests); boundary
  checker PASS; recursive workspace typecheck PASS (4 projects); `git diff --check` PASS

---

### Task 3: Full Verification and Plan 5 Closure Evidence

**Files:**
- Modify: `docs/superpowers/plans/2026-07-11-boundary-checker-typescript-ast.md`
- Modify: `docs/superpowers/plans/2026-07-11-boundary-checker-ci-enforcement.md`
- Create: `.superpowers/sdd/plan5-ast-final-report.md`

**Interfaces:**
- Consumes: the completed AST checker and all workspace test suites.
- Produces: objective completion evidence for the AST correction and Plan 5 final review.

- [x] **Step 1: Run the full project verification**

Run separately:

```bash
rtk pnpm test
rtk pnpm check:boundaries
rtk pnpm -r typecheck
rtk git diff --check
```

Expected: every command exits `0`; the full test output has no failed test files or tests. Preserve known intentional skips as reported rather than converting them to passes.

Implementation note: Fresh full verification passed `108` test files with
`932` tests passed and `1` intentional CLI asset-store test skipped. The first
sandboxed test attempt was denied when `tsx` tried to create its IPC socket;
the required out-of-sandbox rerun exited `0`. The boundary checker passed,
recursive typecheck passed for all four projects, and `git diff --check` passed.

- [x] **Step 2: Audit scope**

Run:

```bash
rtk git diff --name-only 894277f67..HEAD
rtk git status --short
```

Expected: implementation changes are limited to the checker, boundary tests, plan/evidence files; no manifest, lockfile, runtime source, asset, or `upstream/` changes. Preserve `docs/README-ARCHITECTURE-AUDIT.tmp.md` as an untracked user file.

Implementation note: The `894277f67..HEAD` audit listed only
`.superpowers/sdd/plan5-ast-task-2-report.md`, this AST plan,
`packages/web/test/boundary-check.test.ts`, and
`scripts/check-boundaries.mjs`. No manifest, lockfile, runtime source, asset,
or `upstream/` path changed. The untracked user audit file remained untouched.

- [x] **Step 3: Record closure evidence**

In `.superpowers/sdd/plan5-ast-final-report.md`, record:

```md
# Plan 5 AST Final Report

- Focused boundary/workflow tests: PASS (<exact count>)
- Full tests: PASS (<files/tests/skips>)
- Boundary checker: PASS
- Recursive workspace typecheck: PASS
- Diff check: PASS
- Scope audit: PASS
- Final review: <pending until reviewer response>
```

Update both plan documents with implementation notes, commit hashes, and verification status. Do not claim final review PASS until the independent reviewer returns no Critical or Important issues.

Implementation note: Fresh focused verification passed `2` files and all
`79` tests (`71` boundary fixtures and `8` workflow/package contracts). Closure
evidence is recorded in `.superpowers/sdd/plan5-ast-final-report.md`. Final
review remains pending.

- [ ] **Step 4: Commit verification evidence**

```bash
rtk git add .superpowers/sdd/plan5-ast-final-report.md docs/superpowers/plans/2026-07-11-boundary-checker-typescript-ast.md docs/superpowers/plans/2026-07-11-boundary-checker-ci-enforcement.md
rtk git commit -m "docs(plan): record AST boundary verification"
```

Record the evidence commit hash and exact verification results under Task 3.

- [ ] **Step 5: Request final read-only review**

Give the reviewer the design, this plan, the Plan 5 plan, the exact base/head range, and the final report. Require explicit inspection of AST parse diagnostics, runtime-identifier reference filtering, import/export/dynamic-import coverage, parenthesized awaited imports, `.then()` parameter ownership, package subpaths, and absence of generic identifier false positives.

Expected: no Critical or Important issues before branch completion options are offered.
