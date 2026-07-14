# Documentation Guidance Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give public users, human contributors, maintainers, and AI agents separate, current documentation entry points backed by one shared local/CI verification command and focused contract tests.

**Architecture:** Keep stable runtime ownership and dependency rules in `docs/ARCHITECTURE.md`, move command/CI policy to `docs/ENGINEERING.md`, and move maintainer publication procedures to `docs/RELEASING.md`. Keep `README.md` public-facing, make `AGENTS.md` and `CLAUDE.md` identical compact indexes, and enforce document placement, relative links, executable examples, and the shared `pnpm verify` gate with existing Vitest suites.

**Tech Stack:** Markdown, TypeScript strict mode, Vitest, pnpm 9 workspaces, GitHub Actions, RTK command proxy.

## Global Constraints

- Do not add dependencies, backends, databases, authentication, build tools, or frameworks.
- Do not modify or install packages inside the optional read-only `upstream/` gitlink.
- Do not change product behavior, composition output, selection/hash/token compatibility, export semantics, or attribution requirements.
- Preserve `packages/core/` environment independence and `packages/presets/` purity.
- Keep the project license identifier aligned with package metadata as `GPL-3.0-or-later`; upstream remains GPL-3.0.
- Derive rendered-output credits from the active asset source's `CREDITS.csv`; ordinary workflows must not require `upstream/CREDITS.csv`.
- Use pnpm for repository development and prefix every terminal command with `rtk`.
- Do not use `any`.
- Work only on `codex/docs-guidance-restructure` in the current checkout; the user requested a branch rather than another worktree.
- Keep `AGENTS.md` and `CLAUDE.md` byte-for-byte identical.
- After every completed checkbox, update this plan with a short implementation or verification note; after each task commit, record its full commit hash.
- Stage only the files named by the active task so plan-record edits cannot leak into implementation commits.

---

## File Structure

- Create `CONTRIBUTING.md`: human contribution entry and links to detailed setup and verification guidance.
- Create `docs/ENGINEERING.md`: canonical command matrix, common gate, conditional gates, and local-to-CI mapping.
- Create `docs/RELEASING.md`: maintainer-only CLI RC, tag, package, npm OIDC, and post-publication runbook.
- Modify `README.md`: focused public project entry, quick starts, package overview, and documentation navigation.
- Modify `packages/core/README.md`: core usage, adapter boundary, executable composition example, and API link.
- Modify `AGENTS.md`: concise AI repository index, current hard rules, command entry points, and local change guidance.
- Modify `CLAUDE.md`: exact mirror of `AGENTS.md`.
- Modify `docs/ONBOARDING.md`: executable first-day setup and task-oriented codebase tour.
- Modify `docs/ARCHITECTURE.md`: retain stable ownership/invariants while linking engineering and agent change guidance.
- Modify `package.json`: expose the shared `verify` script.
- Modify `.github/workflows/ci.yml`: call `pnpm verify` in the unit job.
- Modify `packages/core/test/readme-example.test.ts`: execute the example from the core package README.
- Modify `packages/web/test/package-scripts.test.ts`: enforce the shared root/CI verification entry point.
- Modify `packages/web/test/readme-architecture-docs.test.ts`: enforce document responsibilities, current status, synchronization, license consistency, and local links.
- Modify `docs/superpowers/specs/2026-07-14-documentation-guidance-restructure-design.md`: record written approval status.
- Modify `docs/superpowers/plans/2026-07-14-documentation-guidance-restructure.md`: checkbox, implementation, commit, and verification record.

---

### Task 1: Add the Shared Verification Gate and Engineering Guide

**Files:**
- Modify: `packages/web/test/package-scripts.test.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Create: `docs/ENGINEERING.md`
- Modify: `docs/superpowers/plans/2026-07-14-documentation-guidance-restructure.md`

**Interfaces:**
- Consumes: existing root scripts `verify:upstream-pin`, `check:boundaries`, and `typecheck`; existing package `pretest` lifecycles.
- Produces: root script `verify: string` and CI unit command `pnpm verify`; `docs/ENGINEERING.md` becomes the command/quality-gate source of truth.

- [ ] **Step 1: Add the failing package-script and CI contract**

In `packages/web/test/package-scripts.test.ts`, add this constant after `rootPackageJson` is parsed:

```ts
const expectedVerifyScript = [
  'pnpm --filter @lpc-toolkit/web prepare-assets',
  'pnpm verify:upstream-pin',
  'pnpm check:boundaries',
  'pnpm typecheck',
  'pnpm -r test',
].join(' && ');
```

Add this test inside `describe('package scripts', ...)`:

```ts
  it('shares the main verification gate between local development and CI', () => {
    expect(rootPackageJson.scripts?.verify).toBe(expectedVerifyScript);
    expect(unitJob).toContain('- run: pnpm verify');
    expect(unitJob).not.toContain('- run: pnpm check:boundaries');
    expect(unitJob).not.toContain('- run: pnpm typecheck');
    expect(unitJob).not.toContain('- run: pnpm test');
  });
```

Update the existing architecture-boundary CI test so its unit-job assertions inspect `expectedVerifyScript` for this exact order:

```ts
    expect(expectedVerifyScript.indexOf('prepare-assets')).toBeLessThan(
      expectedVerifyScript.indexOf('verify:upstream-pin'),
    );
    expect(expectedVerifyScript.indexOf('verify:upstream-pin')).toBeLessThan(
      expectedVerifyScript.indexOf('check:boundaries'),
    );
    expect(expectedVerifyScript.indexOf('check:boundaries')).toBeLessThan(
      expectedVerifyScript.indexOf('typecheck'),
    );
    expect(expectedVerifyScript.indexOf('typecheck')).toBeLessThan(
      expectedVerifyScript.indexOf('-r test'),
    );
```

Remove only the obsolete assertions that require separate prepare, pin, and boundary commands inside `unitJob`. Keep publish-workflow assertions unchanged. Record the edit in this plan before running RED.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- package-scripts.test.ts
```

Expected: FAIL because `rootPackageJson.scripts.verify` is undefined and the CI unit job does not contain `pnpm verify`. Record the failing assertion count and message.

- [ ] **Step 3: Implement the shared command and CI call**

Add this exact script to root `package.json` after `typecheck`:

```json
"verify": "pnpm --filter @lpc-toolkit/web prepare-assets && pnpm verify:upstream-pin && pnpm check:boundaries && pnpm typecheck && pnpm -r test"
```

In `.github/workflows/ci.yml`, keep checkout, pnpm setup, Node setup, and install unchanged. Replace these five unit-job commands:

```yaml
      - run: pnpm --filter @lpc-toolkit/web prepare-assets
      - run: pnpm verify:upstream-pin
      - run: pnpm check:boundaries
      - run: pnpm typecheck
      - run: pnpm test
```

with:

```yaml
      - run: pnpm verify
```

Create `docs/ENGINEERING.md` with these exact top-level sections:

```markdown
# Engineering Guide

## Prerequisites
## Common Verification Gate
## Canonical Commands
## Change-Specific Checks
## CI Mapping
## Asset and Upstream Rules
## Release-Only Checks
```

Under `Common Verification Gate`, document `rtk pnpm verify` and enumerate its five ordered stages: web asset preparation, source-pin verification, architecture boundaries, workspace typecheck, and workspace tests. Explicitly state that it does not include build, browser E2E, isolated upstream parity, cross-platform CLI packaging, or publication.

Under `Canonical Commands`, include these runnable commands and purposes:

```sh
rtk pnpm install --frozen-lockfile
rtk pnpm verify
rtk pnpm build
rtk pnpm check:boundaries
rtk pnpm typecheck
rtk pnpm test
```

Under `Change-Specific Checks`, include package-scoped core, presets, web, and CLI test/typecheck commands plus web `test:e2e`, CLI `test:package`, web `validate-assets`, and web `audit:thumbnail-bounds` commands. Label `test:e2e:parity` as requiring `LPC_UPSTREAM_PARITY_DIR` pointing to a separate isolated checkout.

Under `CI Mapping`, map `Unit tests` to `pnpm verify`, `CLI package` to CLI typecheck/test/build/package smoke, `E2E (web)` to ordinary Playwright, `E2E parity (web)` to the isolated checkout workflow, and release workflows to `docs/RELEASING.md`.

Under `Asset and Upstream Rules`, state that ordinary install, verify, build, package, and non-parity E2E must not initialize `upstream/`; only the separate pinned parity checkout may install upstream dependencies.

- [ ] **Step 4: Verify GREEN and execute the shared gate**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- package-scripts.test.ts
rtk pnpm verify
```

Expected: package-script tests PASS; the shared gate prepares or reuses assets, verifies the pin, passes boundaries, typecheck, and all workspace tests. If `tsx` hits sandbox IPC `EPERM`, rerun the affected command with the approved escalation and record both results.

- [ ] **Step 5: Commit Task 1 and record its hash**

Run:

```sh
rtk git add package.json .github/workflows/ci.yml packages/web/test/package-scripts.test.ts docs/ENGINEERING.md
rtk git commit -m "ci: share workspace verification gate"
rtk git log -1 --format=%H
```

Expected: one commit containing the executable gate, CI wiring, its contract test, and the guide that documents it. Record the full hash, implementation summary, and exact verification results under Task 1.

---

### Task 2: Create the Human and Maintainer Entry Documents

**Files:**
- Modify: `packages/web/test/readme-architecture-docs.test.ts`
- Create: `CONTRIBUTING.md`
- Create: `docs/RELEASING.md`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-14-documentation-guidance-restructure.md`

**Interfaces:**
- Consumes: `docs/ENGINEERING.md` and the existing CLI release instructions in `README.md`.
- Produces: public navigation from `README.md`, contributor entry in `CONTRIBUTING.md`, and maintainer release ownership in `docs/RELEASING.md`.

- [ ] **Step 1: Add failing document-ownership and link assertions**

In `packages/web/test/readme-architecture-docs.test.ts`, load the new documents:

```ts
const contributing = readRepoFile('CONTRIBUTING.md');
const engineering = readRepoFile('docs/ENGINEERING.md');
const releasing = readRepoFile('docs/RELEASING.md');
```

Replace the current README release-contract test with:

```ts
  it('routes contributor and maintainer workflows to focused documents', () => {
    expect(readme).toContain('[`CONTRIBUTING.md`](CONTRIBUTING.md)');
    expect(readme).toContain(
      '[`docs/ENGINEERING.md`](docs/ENGINEERING.md)',
    );
    expect(readme).toContain('[`docs/RELEASING.md`](docs/RELEASING.md)');
    expect(contributing).toContain('[Engineering guide](docs/ENGINEERING.md)');
    expect(contributing).toContain('[onboarding guide](docs/ONBOARDING.md)');
    expect(engineering).toContain('`rtk pnpm verify`');
    expect(releasing).toContain('CLI Release Candidate');
    expect(releasing).toContain('npm OIDC');
    expect(readme).not.toContain('Maintainers: RC validation');
    expect(readme).not.toContain('Trusted Publisher');
  });
```

Add a helper and contract for maintained local Markdown links:

```ts
const maintainedDocuments = new Map([
  ['README.md', readme],
  ['CONTRIBUTING.md', contributing],
  ['AGENTS.md', agents],
  ['CLAUDE.md', claude],
  ['docs/ARCHITECTURE.md', architecture],
  ['docs/ENGINEERING.md', engineering],
  ['docs/ONBOARDING.md', onboarding],
  ['docs/RELEASING.md', releasing],
  ['packages/cli/README.md', cliReadme],
]);

function localMarkdownTargets(filePath: string, source: string): string[] {
  return [...source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)]
    .map((match) => match[1]?.replace(/^<|>$/g, '').split('#')[0] ?? '')
    .filter((target) => target !== '' && !/^[a-z]+:/i.test(target))
    .map((target) => path.resolve(repoRoot, path.dirname(filePath), target));
}
```

```ts
  it('keeps maintained local Markdown links relative and resolvable', () => {
    for (const [filePath, source] of maintainedDocuments) {
      expect(source).not.toMatch(/file:\/\/|\/Users\/|[A-Z]:\\/);
      for (const target of localMarkdownTargets(filePath, source)) {
        expect(existsSync(target), `${filePath} -> ${target}`).toBe(true);
      }
    }
  });
```

Record the edit in this plan before running RED.

- [ ] **Step 2: Run the documentation contract and verify RED**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
```

Expected: FAIL while loading missing `CONTRIBUTING.md` or `docs/RELEASING.md`, proving the new hierarchy is not yet present.

- [ ] **Step 3: Add contribution and release guides and slim the root README**

Create `CONTRIBUTING.md` with these top-level sections and concrete policies:

```markdown
# Contributing to lpc-toolkit

## Before You Start
## Development Setup
## Making a Change
## Verification
## Pull Requests
## Dependencies, Licensing, and Attribution
## Repository Package Manager
```

State that large architecture, dependency, backend, auth, framework, license,
or attribution changes require prior discussion; normal repository development
uses pnpm, while npm/npx examples are only public CLI consumer or explicitly
authorized publication workflows. Link to the onboarding, engineering, and
architecture documents. Require a focused branch/PR, `rtk pnpm verify`, and the
change-specific checks from the engineering guide. Repeat the hard prohibition
on modifying or installing inside `upstream/`.

Create `docs/RELEASING.md` by moving, without weakening, the root README's
existing `Maintainers: local package and tarball verification` and
`Maintainers: RC validation, npm bootstrap, and later releases` content. Use
these top-level sections:

```markdown
# CLI Release Guide

## Authority and Scope
## Local Package and Tarball Verification
## Release Candidate Validation
## One-Time npm Bootstrap
## Later OIDC Releases
## Post-Publication Verification
```

Keep the exact version/tag relationship, macOS and Windows RC workflow,
`v0.1.0` bootstrap exception, npm OIDC behavior, and Trusted Publisher details.
State at the top that tags, publication, registry changes, and Trusted
Publisher configuration require explicit maintainer authorization.

Rewrite `README.md` into these top-level sections:

```markdown
# lpc-toolkit
## Status
## What Is Included
## Getting Started
## Web Editor
## Command-Line Interface
## Core Library
## Architecture and Contributing
## Design Reference
## License
```

Preserve the project explanation, four-package status table, standard clone
without submodule initialization, Node.js 22/pnpm workspace setup, web dev
command, character-authoring CLI quick start, mandatory attribution, active
asset/cache lifecycle summary, repository-relative design reference, and
GPL-3.0-or-later notice. Remove the complete release runbook, hard-coded current
CLI package version, repeated CLI README paragraph, and detailed UI
token/component inventory. Keep links to `packages/cli/README.md`,
`packages/core/README.md`, `API.md`, `CONTRIBUTING.md`, `docs/ARCHITECTURE.md`,
`docs/ENGINEERING.md`, `docs/ONBOARDING.md`, and `docs/RELEASING.md`.
Temporarily retain the existing complete `### Example` block and root public
API categories so the executable README test remains green until Task 3 moves
the example and its contract atomically.

- [ ] **Step 4: Verify the hierarchy and links are GREEN**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
```

Expected: the focused documentation suite PASS, including ownership and local-link assertions. Inspect the test output for zero missing-link failures.

- [ ] **Step 5: Commit Task 2 and record its hash**

Run:

```sh
rtk git add README.md CONTRIBUTING.md docs/RELEASING.md packages/web/test/readme-architecture-docs.test.ts
rtk git commit -m "docs: separate contributor and release guidance"
rtk git log -1 --format=%H
```

Expected: one documentation hierarchy commit plus its focused contract changes. Record the full hash, implementation summary, and verification result under Task 2.

---

### Task 3: Move the Executable Core Example to the Package README

**Files:**
- Modify: `packages/core/test/readme-example.test.ts`
- Modify: `packages/core/README.md`
- Modify: `packages/web/test/readme-architecture-docs.test.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-14-documentation-guidance-restructure.md`

**Interfaces:**
- Consumes: the existing public core imports, fixture records, palette records, `CanvasAdapter`, and precise-credit assertions in `readme-example.test.ts`.
- Produces: a `## Example` TypeScript block in `packages/core/README.md` executed by the existing regression test.

- [ ] **Step 1: Redirect the example test to the package README**

In `packages/core/test/readme-example.test.ts`, replace the root path:

```ts
const readmePath = path.resolve(here, '../../../README.md');
```

with:

```ts
const readmePath = path.resolve(here, '../README.md');
```

Change the extractor to target the package heading and update its error:

````ts
function readReadmeExample(): string {
  const readme = readFileSync(readmePath, 'utf8');
  const match = readme.match(/## Example\n\n```ts\n([\s\S]*?)\n```/);
  if (!match?.[1]) {
    throw new Error('Core package README TypeScript example block was not found.');
  }
  return match[1];
}
````

In `packages/web/test/readme-architecture-docs.test.ts`, load the package guide:

```ts
const coreReadme = readRepoFile('packages/core/README.md');
```

Change the public core API contract so the root README links the package guide
while the package guide owns the API signature link and categories:

```ts
  it('routes the public core API to its package guide', () => {
    expect(readme).toContain(
      '[`packages/core/README.md`](packages/core/README.md)',
    );
    expect(coreReadme).toContain('[`API.md`](../../API.md)');
    for (const category of [
      'Catalog and palettes',
      'Selections and tokens',
      'Composition and animation',
      'Recoloring',
      'Credits and validation',
    ]) {
      expect(coreReadme).toContain(category);
    }
  });
```

Add `['packages/core/README.md', coreReadme]` to `maintainedDocuments` so its
relative API link joins the maintained-link contract.

Record the edit in this plan before running RED.

- [ ] **Step 2: Run the core example test and verify RED**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/core test -- readme-example.test.ts
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
```

Expected: the core test FAILS with `Core package README TypeScript example
block was not found.` and the documentation contract FAILS because the package
guide does not yet contain the API categories or root API link target.

- [ ] **Step 3: Expand the core package README with the executable example**

Replace `packages/core/README.md` with these sections:

```markdown
# @lpc-toolkit/core
## Runtime Boundary
## Example
## Public API
## Attribution Contract
```

Under `Runtime Boundary`, state that callers inject canvas creation and image
loading through `CanvasAdapter`; browser callers use DOM implementations and
Node tests/CLI currently use `@napi-rs/canvas` (MIT), but core runtime source
imports neither concrete implementation nor filesystem/browser globals. Link
to [`../../API.md`](../../API.md).

Under `## Example`, move the existing root README TypeScript example without
changing its imports, `createCatalog`, `createPaletteCatalog`, `Selections`,
`composeSelections`, `makeResolvePalette`, `extractAnimation`, or credits
logging. Keep `spritesheetsBaseUrl` described as the directory containing
`spritesheets/`; do not mention using the upstream submodule as a runtime base.

Under `Public API`, retain the five category names checked by the documentation
contract: Catalog and palettes, Selections and tokens, Composition and
animation, Recoloring, Credits and validation. Under `Attribution Contract`,
state that every composition/extraction result carries the matched credit
manifest and callers must preserve it with rendered output.

Ensure the old complete example no longer exists in root `README.md`.

- [ ] **Step 4: Verify GREEN in core and documentation contracts**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/core test -- readme-example.test.ts
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
```

Expected: core example tests PASS with visible recolored pixels and precise credits; documentation contracts PASS with the API categories and package link in their authoritative locations.

- [ ] **Step 5: Commit Task 3 and record its hash**

Run:

```sh
rtk git add packages/core/README.md packages/core/test/readme-example.test.ts packages/web/test/readme-architecture-docs.test.ts README.md
rtk git commit -m "docs(core): own executable package example"
rtk git log -1 --format=%H
```

Record the full hash, implementation summary, and both focused verification results under Task 3.

---

### Task 4: Make the Agent Entry Points Current and Self-Synchronizing

**Files:**
- Modify: `packages/web/test/readme-architecture-docs.test.ts`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/plans/2026-07-14-documentation-guidance-restructure.md`

**Interfaces:**
- Consumes: root package `license`, the common `verify` script, architecture/engineering/onboarding paths, and existing project hard rules.
- Produces: byte-identical agent entry files with current package status and exact project policy.

- [ ] **Step 1: Add failing synchronization, status, and license contracts**

In `packages/web/test/readme-architecture-docs.test.ts`, parse the root package:

```ts
const rootPackage = JSON.parse(readRepoFile('package.json')) as {
  license: string;
};
```

Add this describe block:

```ts
describe('agent guidance contract', () => {
  it('keeps Codex and Claude guidance identical and current', () => {
    expect(claude).toBe(agents);
    expect(agents).toContain(`**License is ${rootPackage.license}.**`);
    expect(agents).toContain('`packages/presets/`');
    expect(agents).toContain('`packages/cli/`');
    expect(agents).toContain('`rtk pnpm verify`');
    expect(agents).toContain('docs/ENGINEERING.md');
    expect(agents).not.toContain('built later');
    expect(agents).not.toContain('planned CLI');
  });
});
```

Record the edit in this plan before running RED.

- [ ] **Step 2: Run the documentation contract and verify RED**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
```

Expected: FAIL because the current agent files say `GPL-3.0`, omit presets from the layout, describe the CLI as `built later`, and do not expose `rtk pnpm verify` or the engineering guide.

- [ ] **Step 3: Rewrite `AGENTS.md` and apply the exact same content to `CLAUDE.md`**

Use these top-level sections in both files:

```markdown
# lpc-toolkit
## Start Here
## Common Commands
## Hard Rules
## Repository Layout
## Architecture Summary
## Change Guidance
## Ask Before Proceeding
## Style
## Plan Record Requirement
## Working Principles
```

Under `Common Commands`, show only RTK-prefixed repository commands:

```sh
rtk pnpm install --frozen-lockfile
rtk pnpm verify
rtk pnpm build
rtk pnpm --filter @lpc-toolkit/web dev
```

Under `Hard Rules`, preserve and clarify:

1. `upstream/` is an optional read-only dormant provenance gitlink; ordinary workflows do not initialize it, and no package installation or modification is allowed inside it.
2. **License is GPL-3.0-or-later.** Dependencies must be compatible and dependency suggestions must state their license.
3. Attribution comes from the active asset source's `CREDITS.csv`; all rendered/exported web and CLI output preserves matching credit metadata without requiring the submodule.
4. Core imports no React, DOM/browser runtime, Node filesystem/runtime, Vite-only, concrete canvas, ZIP, presets, web, or CLI implementation.
5. Strict TypeScript; no undocumented `any`.
6. Use pnpm for repository development.
7. Prefix terminal commands with RTK.

Under `Repository Layout`, list `assets/`, `upstream/`, core, presets, web, and
CLI with current responsibilities. Under `Architecture Summary`, link to
`docs/ARCHITECTURE.md`, `docs/ENGINEERING.md`, and `docs/ONBOARDING.md`; retain
the slice/hooks/components/adapter/lib ownership summary and boundary-check
requirement. Under `Change Guidance`, retain the local `harness.tsx` and
`layer-row.tsx` extraction rules. Under `Plan Record Requirement`, preserve the
checkbox, implementation note, commit hash, and verification recording rule.
Condense the existing four generic behavioral sections into short bullets under
`Working Principles` without changing their think-first, simplicity,
surgical-change, and goal-driven meaning.

Apply the resulting content to both files in one patch; do not use a symlink or
tool-specific import directive.

- [ ] **Step 4: Verify GREEN and exact equality**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
rtk cmp AGENTS.md CLAUDE.md
```

Expected: documentation contracts PASS and `cmp` exits 0 with no output.

- [ ] **Step 5: Commit Task 4 and record its hash**

Run:

```sh
rtk git add AGENTS.md CLAUDE.md packages/web/test/readme-architecture-docs.test.ts
rtk git commit -m "docs(agent): index current repository guidance"
rtk git log -1 --format=%H
```

Expected: one synchronized agent-guidance commit with its contract test. Record the full hash, implementation summary, and focused verification under Task 4.

---

### Task 5: Rewrite Onboarding and Complete the Architecture Split

**Files:**
- Modify: `packages/web/test/readme-architecture-docs.test.ts`
- Modify: `docs/ONBOARDING.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/superpowers/plans/2026-07-14-documentation-guidance-restructure.md`

**Interfaces:**
- Consumes: current four-package layout, `rtk pnpm verify`, existing architecture ownership/attribution/asset-store sections, and agent change guidance from Task 4.
- Produces: runnable first-day onboarding and architecture focused on stable boundaries with links to engineering and agent guidance.

- [ ] **Step 1: Add failing onboarding and ownership-location contracts**

Add this test to `packages/web/test/readme-architecture-docs.test.ts`:

```ts
describe('onboarding and engineering ownership contract', () => {
  it('provides a runnable first-day path for all active packages', () => {
    for (const phrase of [
      'Node.js 22',
      '`rtk pnpm install --frozen-lockfile`',
      '`rtk pnpm verify`',
      '`packages/core/`',
      '`packages/presets/`',
      '`packages/web/`',
      '`packages/cli/`',
      'Where Does This Change Belong?',
    ]) {
      expect(onboarding).toContain(phrase);
    }
    expect(onboarding).not.toContain('planned CLI');
  });

  it('keeps command policy in engineering and stable boundaries in architecture', () => {
    expect(architecture).toContain('## Executable Architecture Gate');
    expect(architecture).toContain('[Engineering guide](ENGINEERING.md)');
    expect(architecture).not.toContain('## Testing and Verification Expectations');
    expect(architecture).not.toContain('## Local Extraction Guidance');
    expect(engineering).toContain('## CI Mapping');
    expect(engineering).toContain('CI unit job');
  });
});
```

Update the existing boundary-CI architecture test so it still requires
`rtk pnpm check:boundaries` and isolated parity ownership in architecture, but
requires the detailed `CI unit job` wording from `engineering` rather than
`architecture`.

Record the edit in this plan before running RED.

- [ ] **Step 2: Run the documentation contract and verify RED**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
```

Expected: FAIL because onboarding still calls the CLI planned, omits presets/CLI from the guided quality path, has no runnable install/verify commands, and architecture still owns the moved detailed sections.

- [ ] **Step 3: Rewrite onboarding around an executable path**

Replace `docs/ONBOARDING.md` with these top-level sections:

```markdown
# lpc-toolkit Onboarding Guide
## Prerequisites
## First-Time Setup
## Start the Web Editor
## Try the Local CLI
## Package Tour
## Where Does This Change Belong?
## Verification by Change Type
## First Contributions
## Common Pitfalls
## Next References
```

Under `Prerequisites`, require Node.js 22 and pnpm 9 from root
`packageManager`; describe RTK as required for repository Agent commands. Under
`First-Time Setup`, show a standard clone without submodules followed by:

```sh
rtk pnpm install --frozen-lockfile
rtk pnpm verify
```

Under `Start the Web Editor`, show
`rtk pnpm --filter @lpc-toolkit/web dev`. Under `Try the Local CLI`, show the
workspace build and local binary help commands, clearly separating them from
public npm installation:

```sh
rtk pnpm --filter @lpc-toolkit/cli build
rtk node packages/cli/dist/index.js --help
```

Under `Package Tour`, cover core, presets, web, CLI, assets, and tests with no
exhaustive per-file inventory. Under `Where Does This Change Belong?`, provide a
table routing reusable composition/credits to core, shared preset rules to
presets, pure browser selection decisions to `slice/`, effects to hooks,
presentation to components, browser bridges to adapter/lib, Node commands and
persistence to CLI, and asset generation to web scripts. Under verification,
link to `ENGINEERING.md` and include package-scoped examples. Preserve first
contribution cautions around attribution, adapter contracts, `upstream/`, and
broad hotspot refactors.

- [ ] **Step 4: Trim moved workflow guidance from architecture**

In `docs/ARCHITECTURE.md`:

- keep Architecture Shape, Dependency Direction, package rules, React Data
  Flow, Attribution and Licensing, CLI Asset Lifecycle, Web Catalog Ownership,
  Browser and Asset Boundary, and Anti-Patterns;
- replace `## Testing and Verification Expectations` with:

```markdown
## Executable Architecture Gate

`rtk pnpm check:boundaries` enforces core isolation, presets purity,
public-core import ownership, and component workflow boundaries. The main CI
unit gate invokes it through `pnpm verify`; the publish workflow also runs it
before packaging or publication.

See the [Engineering guide](ENGINEERING.md) for the canonical command matrix,
package-scoped checks, CI mapping, and isolated parity procedure.
```

- remove `## Local Extraction Guidance`; the identical agent entry points now
  own those change-specific rules;
- update the governance description to identify `CONTRIBUTING.md`,
  `docs/ENGINEERING.md`, and `docs/RELEASING.md` without making architecture
  the source of their workflows;
- preserve the phrases and invariants still exercised by asset lifecycle,
  attribution, catalog ownership, character persistence, and parity contract
  tests.

- [ ] **Step 5: Verify GREEN and the executable boundary gate**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
rtk pnpm check:boundaries
```

Expected: documentation contracts PASS; the boundary checker reports success without runtime changes.

- [ ] **Step 6: Commit Task 5 and record its hash**

Run:

```sh
rtk git add docs/ONBOARDING.md docs/ARCHITECTURE.md packages/web/test/readme-architecture-docs.test.ts
rtk git commit -m "docs: separate onboarding and architecture roles"
rtk git log -1 --format=%H
```

Expected: one onboarding/architecture responsibility commit plus its contract changes. Record the full hash, implementation summary, and focused verification under Task 5.

---

### Task 6: Run the Repository Acceptance Gate and Close the Plan

**Files:**
- Modify: `docs/superpowers/plans/2026-07-14-documentation-guidance-restructure.md`

**Interfaces:**
- Consumes: all five task commits and their focused verification records.
- Produces: complete acceptance evidence and a clean branch with an auditable plan record.

- [ ] **Step 1: Run focused documentation and executable-example suites**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/core test -- readme-example.test.ts
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts package-scripts.test.ts
rtk cmp AGENTS.md CLAUDE.md
```

Expected: all focused tests PASS and agent files compare equal. Record exact file/test counts.

- [ ] **Step 2: Run architecture and type verification**

Run:

```sh
rtk pnpm check:boundaries
rtk pnpm typecheck
```

Expected: both commands exit 0. Record package/typecheck results and the boundary-check success message.

- [ ] **Step 3: Run the shared repository gate**

Run:

```sh
rtk pnpm verify
```

Expected: asset preparation/pin, boundaries, typecheck, and all workspace tests PASS. Record exact test totals and existing skips/warnings separately from failures.

- [ ] **Step 4: Build every workspace package**

Run:

```sh
rtk pnpm build
```

Expected: core, presets, web asset preparation/Vite build, and CLI vendoring/build all PASS without initializing `upstream/`.

- [ ] **Step 5: Inspect scope and documentation drift**

Run:

```sh
rtk git diff --check main...HEAD
rtk git diff --stat main...HEAD
rtk rg -n 'planned CLI|built later|Maintainers: RC validation|Trusted Publisher' README.md AGENTS.md CLAUDE.md docs/ONBOARDING.md
rtk git status --short --branch
```

Expected: no whitespace errors; changed files match this plan; stale package-status phrases are absent from maintained entry docs; release-only `Trusted Publisher` wording is absent from root/agent/onboarding entry points; only this plan record is uncommitted before the closing commit.

- [ ] **Step 6: Commit the completed plan record**

After every task and acceptance step contains its implementation note, full commit hash, and verification result, run:

```sh
rtk git add docs/superpowers/plans/2026-07-14-documentation-guidance-restructure.md
rtk git commit -m "docs(plan): record guidance restructure verification"
rtk git log -1 --format=%H
rtk git status --short --branch
```

Expected: one plan/status record commit and a clean `codex/docs-guidance-restructure` branch. Record the closing commit hash and final verification summary before checking this step.
