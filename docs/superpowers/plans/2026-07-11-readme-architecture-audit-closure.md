# README Architecture Alignment and Audit Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align README and architecture documentation with the stabilized runtime, then close audit findings 1–15 with specific commit and verification evidence.

**Architecture:** Treat documentation as a tested product contract. A focused Vitest file asserts current versions, routes, ownership, asset lifecycle, attribution, build behavior, repository-relative links, and closure-table completeness; README and architecture prose are then updated to satisfy those contracts before the full acceptance suite runs.

**Tech Stack:** Markdown, TypeScript, Vitest, pnpm workspaces, Playwright, existing boundary checker

## Global Constraints

- `upstream/` is read-only; never modify it or install packages inside it.
- Use `rtk` for every terminal command and `pnpm` for project commands.
- Do not add dependencies or modify manifests/lockfiles unless the user separately approves it.
- Preserve GPL-3.0 attribution requirements and the documented thumbnail-preview exception.
- Use repository-relative Markdown links only; remove all `file://` and machine-specific absolute paths.
- `API.md` at the repository root remains the signature source of truth.
- The temporary `docs/README-ARCHITECTURE-AUDIT.tmp.md` remains untracked and must not be committed.
- A finding closes only when its row records disposition, implementation/documentation commit, specific verification command, and result.
- After each step, update its checkbox and add an implementation note, commit hash, and verification status.

---

### Task 1: Lock and Update the Public README Contract

**Files:**
- Create: `packages/web/test/readme-architecture-docs.test.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-11-readme-architecture-audit-closure.md`

**Interfaces:**
- Consumes: `packages/cli/package.json`, root `API.md`, web routes/components, package scripts, and current release workflows.
- Produces: tested public documentation for CLI release guidance, web layout/routes, core API categories, sheet dimensions, assets, builds, and links.

- [x] **Step 1: Add failing README contract tests**
  - Implementation: Added five public README contract cases.
  - Commit: `0a8140e97`
  - Verification: RED confirmed, 5 failed / 5 total.

Create a Vitest suite that reads repository files and asserts exact current facts:

```ts
const repoRoot = path.resolve(import.meta.dirname, '../../..');
const readme = readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
const cliPackage = JSON.parse(
  readFileSync(path.join(repoRoot, 'packages/cli/package.json'), 'utf8'),
) as { version: string };

expect(cliPackage.version).toBe('0.1.0');
expect(readme).toContain('`@lpc-toolkit/cli` version `0.1.0`');
expect(readme).toMatch(/`\/`, `\/compose`, and the not-found route/);
expect(readme).toContain('[`API.md`](API.md)');
expect(readme).not.toMatch(/file:\/\/|\/Users\/|[A-Z]:\\/);
```

Also assert named sections or phrases for sidebar/splitter/preview/top-bar popovers/responsive layout; categorized core API; standard and custom-animation sheet dimensions; first preparation/pinned download/cache reuse/offline behavior; core/presets/web/CLI build behavior; read-only submodule and isolated parity checkout.

- [x] **Step 2: Run the focused test and verify RED**
  - Implementation: Ran the focused web documentation suite outside the sandbox because `tsx` requires IPC.
  - Commit: `0a8140e97`
  - Verification: Expected RED, 5 failed / 5 total.

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
```

Expected: FAIL on stale/missing README facts, including the machine-specific `file://` design link. Record exact failures.

- [x] **Step 3: Update CLI and release documentation**
  - Implementation: Anchored the CLI contract at 0.1.0 and retained current RC, stable-tag, npm OIDC, and external publishing gates.
  - Commit: `0a8140e97`
  - Verification: README contract PASS.

Replace historical/bootstrap language with current guidance anchored to version `0.1.0`: RC tags use `v<version>-rc.<number>`, stable tags use `v<version>`, tagged RC jobs are required gates, the manual workflow is advisory, npm OIDC/trusted-publisher configuration is external, and no instruction installs inside `upstream/`.

- [x] **Step 4: Update web, API, sheet, asset, and build documentation**
  - Implementation: Documented routes, responsive editor regions, categorized core APIs, sheet sizing, asset preparation/cache behavior, package builds, and repository-relative design links.
  - Commit: `0a8140e97`
  - Verification: README contract PASS; no machine-specific link remains.

Document:

```md
- Routes: `/`, `/compose`, and the not-found route.
- Editor: sidebar + splitter, preview, top-bar popovers, responsive collapse.
- Core API: catalog/palettes, selections/tokens, composition/animation,
  recoloring, credits/validation; full signatures in [`API.md`](API.md).
- Sheets: standard animation atlas dimensions versus custom-animation source sheets.
- Assets: first preparation, pinned release download, verified cache reuse,
  offline cache behavior, working-directory precedence, custom overlays.
- Builds: what root `pnpm build` runs for core, presets, web, and CLI.
```

Replace the absolute `file://` design reference with a repository-relative link under `reference/v2/`.

- [x] **Step 5: Run README contracts and existing README example test**
  - Implementation: Ran both focused suites and whitespace validation.
  - Commit: `0a8140e97`
  - Verification: README docs 5/5 PASS; README core example 2/2 PASS; `git diff --check` PASS.

Run separately:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
rtk pnpm --filter @lpc-toolkit/core test -- readme-example.test.ts
rtk git diff --check
```

Expected: all PASS; no machine-specific link remains in tracked Markdown.

- [x] **Step 6: Commit Task 1**
  - Implementation: Committed the tested README and contract suite.
  - Commit: `0a8140e97`
  - Verification: Commit created; plan evidence recorded in the following documentation commit.

```bash
rtk git add README.md packages/web/test/readme-architecture-docs.test.ts docs/superpowers/plans/2026-07-11-readme-architecture-audit-closure.md
rtk git commit -m "docs: align public README with current runtime"
```

Record commit and verification under Task 1.

---

### Task 2: Align Architecture Ownership and Runtime Lifecycle

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `packages/web/test/readme-architecture-docs.test.ts`
- Modify: `docs/superpowers/plans/2026-07-11-readme-architecture-audit-closure.md`

**Interfaces:**
- Consumes: CLI release configuration/cache/AssetStore code, web catalog/assets/export code, `assets/CREDITS.csv`, and `scripts/check-boundaries.mjs`.
- Produces: tested architecture ownership and data-flow documentation.

- [ ] **Step 1: Extend the contract test with architecture assertions**

Assert `docs/ARCHITECTURE.md` names all required owners and flows:

```ts
for (const phrase of [
  'pinned manifest',
  'checksum',
  'platform cache',
  'assets_custom/',
  'DirectoryAssetStore',
  'ZipAssetStore',
  'packages/web/src/catalog/',
  'ComposedSheet.credits',
  'pnpm check:boundaries',
]) {
  expect(architecture).toContain(phrase);
}
```

Add assertions for working-directory `assets/` precedence; custom overlays; cache creation/reuse/failure behavior; thumbnail exception versus export sidecars; CI boundary role; production pinned/local-cache assets versus read-only provenance submodule and separate parity checkout.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
```

Expected: FAIL only for missing/incomplete architecture facts.

- [ ] **Step 3: Document CLI asset lifecycle and stores**

Add an architecture section describing pinned manifest/tarball configuration, checksum verification before extraction, platform cache creation and atomic reuse, offline behavior and failures, working-directory `assets/` precedence, `assets_custom/` overlays, and directory/ZIP `AssetStore` ownership.

- [ ] **Step 4: Document web catalog, attribution, boundary, and submodule ownership**

State that `packages/web/src/catalog/` owns browser catalog loading/normalization; picker thumbnails are editor-internal previews without individual sidecars; active composition/export uses `ComposedSheet.credits` and PNG/TXT/CSV bundles; `rtk pnpm check:boundaries` runs in CI; production assets use pinned local/cache materialization while `upstream/` remains read-only provenance/reference and parity uses a separate checkout.

- [ ] **Step 5: Verify and commit Task 2**

Run separately:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
rtk pnpm check:boundaries
rtk git diff --check
```

Expected: PASS.

```bash
rtk git add docs/ARCHITECTURE.md packages/web/test/readme-architecture-docs.test.ts docs/superpowers/plans/2026-07-11-readme-architecture-audit-closure.md
rtk git commit -m "docs: align architecture ownership and assets"
```

Record commit and verification under Task 2.

---

### Task 3: Create the Findings 1–15 Closure Matrix

**Files:**
- Create: `docs/README-ARCHITECTURE-AUDIT-CLOSURE.md`
- Modify: `packages/web/test/readme-architecture-docs.test.ts`
- Modify: `docs/superpowers/plans/2026-07-11-readme-architecture-audit-closure.md`

**Interfaces:**
- Consumes: completed Plans 1–5 and their recorded commits/verification, plus Tasks 1–2 of this plan.
- Produces: the permanent audit closure record outside the temporary audit file.

- [ ] **Step 1: Add a failing closure-table contract**

Parse Markdown table rows and require findings `1` through `15` exactly once. Every row must contain:

```ts
type ClosureRow = {
  finding: number;
  disposition: 'fixed' | 'documented approved exception';
  commits: string;
  verification: string;
  result: 'PASS';
};
```

Reject placeholders (`TBD`, `TODO`, `pending`), empty commit cells, broad verification-only text, and any tracked reference to `docs/README-ARCHITECTURE-AUDIT.tmp.md` as the closure source.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
```

Expected: FAIL because the permanent closure document does not yet exist.

- [ ] **Step 3: Build the closure matrix from plan evidence**

Create `docs/README-ARCHITECTURE-AUDIT-CLOSURE.md` with one row per finding:

```md
| Finding | Disposition | Commits | Specific verification | Result |
| --- | --- | --- | --- | --- |
| 1 | fixed | `<README implementation/evidence commits>` | `rtk pnpm --filter @lpc-toolkit/core test -- readme-example.test.ts` | PASS |
```

Use `documented approved exception` only for finding 15. Findings 1–14 use `fixed`. Cite the narrowest command proving each acceptance criterion, not only `rtk pnpm test`.

- [ ] **Step 4: Cross-check every row against git and source**

Run:

```bash
rtk git log --oneline --all
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
rtk rg -n 'TBD|TODO|pending|file://|/Users/|[A-Z]:\\' README.md docs/ARCHITECTURE.md docs/README-ARCHITECTURE-AUDIT-CLOSURE.md
```

Expected: commits resolve; contract PASS; `rg` returns no forbidden placeholders or machine paths.

- [ ] **Step 5: Commit Task 3**

```bash
rtk git add docs/README-ARCHITECTURE-AUDIT-CLOSURE.md packages/web/test/readme-architecture-docs.test.ts docs/superpowers/plans/2026-07-11-readme-architecture-audit-closure.md
rtk git commit -m "docs(audit): record findings closure matrix"
```

Record commit and verification under Task 3.

---

### Task 4: Execute the Final Acceptance Gate

**Files:**
- Create: `.superpowers/sdd/plan6-final-report.md`
- Modify: `docs/README-ARCHITECTURE-AUDIT-CLOSURE.md`
- Modify: `docs/superpowers/plans/2026-07-11-readme-architecture-audit-closure.md`

**Interfaces:**
- Consumes: completed documentation, closure matrix, ordinary web environment, and an isolated parity checkout supplied through `LPC_UPSTREAM_PARITY_DIR`.
- Produces: final Plan 6 evidence and a fully verified findings matrix.

- [ ] **Step 1: Run static, type, unit, build, and README gates**

Run separately:

```bash
rtk pnpm check:boundaries
rtk pnpm typecheck
rtk pnpm test
rtk pnpm build
rtk pnpm --filter @lpc-toolkit/core test -- readme-example.test.ts
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
```

Expected: all exit `0`. If the root `rtk pnpm typecheck` wrapper reports a non-zero status after printing success, run `rtk pnpm -r typecheck`, record both results accurately, and do not mislabel the wrapper result.

- [ ] **Step 2: Run ordinary web E2E**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test:e2e
```

Expected: toolkit-only Playwright suite PASS without using `upstream/`.

- [ ] **Step 3: Run isolated upstream parity E2E**

Use a separate read-only checkout outside `upstream/`:

```bash
LPC_UPSTREAM_PARITY_DIR=/absolute/path/to/isolated/lpc-character-generator \
  rtk pnpm --filter @lpc-toolkit/web test:e2e:parity
```

Expected: parity suite PASS without modifying or installing inside the submodule. If network/external checkout access blocks execution, record the exact blocker and leave affected closure rows open; do not convert the block into PASS.

- [ ] **Step 4: Verify links, versions, public exports, and scope**

Run separately:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
rtk pnpm --filter @lpc-toolkit/core test -- readme-example.test.ts
rtk git diff --check
rtk git status --short
```

Inspect `README.md` API categories against root `API.md` and `packages/core/src/index.ts`; inspect documented CLI version against `packages/cli/package.json`. Expected: no uncommitted task files, and only the preserved audit temp file remains untracked.

- [ ] **Step 5: Record final evidence and commit**

Write `.superpowers/sdd/plan6-final-report.md` with exact commands, exit statuses, test/build/E2E counts, isolated parity source SHA/path, scope audit, and any intentional skips. Update closure rows with final command results and the plan with per-step commits/verifications.

```bash
rtk git add -f .superpowers/sdd/plan6-final-report.md
rtk git add docs/README-ARCHITECTURE-AUDIT-CLOSURE.md docs/superpowers/plans/2026-07-11-readme-architecture-audit-closure.md
rtk git commit -m "docs(plan): record audit remediation closure"
```

- [ ] **Step 6: Request final read-only review**

Give the reviewer the original remediation design, this plan, closure matrix, final report, and exact merge-base-to-HEAD diff package. Require separate verdicts for documentation accuracy, finding-by-finding evidence, verification completeness, unchanged `upstream/`, and readiness to close the audit.

Expected: no Critical or Important issues before branch completion options are offered.
