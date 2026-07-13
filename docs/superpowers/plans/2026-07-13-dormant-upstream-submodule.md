# Dormant Upstream Submodule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the `upstream` gitlink as an exact provenance pin while making every normal clone, build, test, package, and publish workflow independent of an initialized submodule.

**Architecture:** Replace the two Core real-pixel test paths into `upstream/` with a 17-PNG checked-in fixture bundle carrying minimal credits and per-file SHA-256 provenance. Add Web script tooling to materialize and verify that bundle, then add a repository-only verifier that compares the gitlink, `asset-release.json`, materialized manifest, and fixture source SHA without reading the submodule working tree. Normal CI checks out no submodules; the existing parity job remains the only isolated shallow checkout.

**Tech Stack:** TypeScript strict mode, Node.js built-ins, Vitest, pnpm workspaces, GitHub Actions, `@napi-rs/canvas` (MIT, existing test dependency), GPL-3.0-or-later project assets.

## Global Constraints

- `upstream/` remains a read-only git submodule; never modify it, commit inside it, or install packages inside it.
- Keep `.gitmodules` and the `upstream` gitlink at `212abfd21493e9957bd556250ac538fa40fe1fc9` for this change.
- Do not add dependencies; existing `@napi-rs/canvas` is MIT-licensed.
- Preserve GPL-3.0-or-later licensing and mandatory attribution for every rendered sprite.
- Keep `packages/core/src/**` environment-agnostic; Node filesystem and Git behavior belongs in scripts or tests.
- TypeScript remains strict; do not introduce `any`.
- Use pnpm and prefix repository terminal commands with `rtk`.
- Run `rtk pnpm check:boundaries` after architecture-sensitive changes.
- Preserve the user's existing untracked `.codex/config.toml` and `docs/README-ARCHITECTURE-AUDIT.tmp.md`.
- After every task, update this plan's completed checkboxes and append a concrete implementation note, implementation commit hash, and exact verification result, then commit that plan evidence separately.

---

## File Structure

### New files

- `packages/web/scripts/upstream-test-fixtures.ts` — owns the exact fixture allowlist, fixture provenance schema, explicit materialization, and integrity verification.
- `packages/web/scripts/materialize-upstream-test-fixtures.ts` — maintainer-only CLI wrapper that reads a supplied upstream checkout and writes only the Core fixture target.
- `packages/web/test/upstream-test-fixtures.test.ts` — unit tests for fixture materialization, parsing, credits, exact file set, and hashes.
- `packages/core/test/real-pixel-fixtures.test.ts` — Core-side contract proving the checked-in fixture bundle is present, attributed, and outside `upstream/`.
- `packages/core/test/fixtures/upstream-pixels/provenance.json` — generated source repository/SHA and per-file digest manifest.
- `packages/core/test/fixtures/upstream-pixels/CREDITS.csv` — minimal rows accompanying the body and wheelchair fixtures.
- `packages/core/test/fixtures/upstream-pixels/spritesheets/**` — 17 real PNG fixtures preserving upstream-relative paths.
- `packages/web/scripts/upstream-pin.ts` — reads the gitlink and all three materialized provenance pins, reports mismatches, and invokes fixture integrity verification.
- `packages/web/scripts/verify-upstream-pin.ts` — repository-only CLI wrapper for the pin verifier.
- `packages/web/test/upstream-pin.test.ts` — unit tests for gitlink parsing, four-way pin comparison, errors, and fixture verification delegation.

### Modified files

- `packages/core/test/compose.test.ts:22-25` — point real-pixel composition tests at checked-in fixtures and update test descriptions/credit assertions.
- `packages/core/test/recolor-resolve.test.ts:19-23` — point real-pixel recolor coverage at checked-in fixtures.
- `packages/core/test/helpers/node-canvas-adapter.ts:8-28` — remove the stale submodule-specific comment.
- `packages/web/package.json:7-28` — expose maintainer materialization and pin verification commands; wire verification after asset preparation.
- `package.json:11-16` — expose root pin verification and run it after root asset preparation.
- `packages/web/test/package-scripts.test.ts:7-146` — lock lifecycle order and submodule-free workflow contracts.
- `.github/workflows/ci.yml:38-53` — remove recursive submodule checkout and explicitly prepare/verify pins before unit validation.
- `.github/workflows/publish.yml:17-31` — explicitly prepare assets and verify pins before publish validation.
- `packages/web/test/readme-architecture-docs.test.ts:7-160` — lock current documentation to optional dormant-submodule language.
- `README.md:34-91` — make standard clone/setup submodule-free and document optional reference initialization.
- `AGENTS.md:14-46` — redefine the submodule hard rule as optional provenance that normal workflows must not require.
- `CLAUDE.md:14-46` — mirror the `AGENTS.md` rule exactly.
- `docs/ONBOARDING.md:18-25` — state that onboarding does not initialize the submodule.
- `docs/ARCHITECTURE.md:312-325` — document dormant gitlink ownership, four-way pin verification, fixtures, and isolated parity.
- `packages/web/e2e/helpers/console-collector.ts:45-53` — stop implying that normal execution reads the tracked submodule.

---

### Task 1: Build attributed fixture materialization and integrity tooling

**Files:**
- Create: `packages/web/scripts/upstream-test-fixtures.ts`
- Create: `packages/web/scripts/materialize-upstream-test-fixtures.ts`
- Create: `packages/web/test/upstream-test-fixtures.test.ts`
- Modify: `packages/web/package.json:7-11`

**Interfaces:**
- Consumes: a read-only upstream source directory, target fixture directory, `sourceRepository`, and full `sourceSha`.
- Produces: `FIXTURE_SPRITE_PATHS`, `UpstreamFixtureProvenance`, `materializeUpstreamTestFixtures(options): UpstreamFixtureProvenance`, `parseUpstreamFixtureProvenance(json): UpstreamFixtureProvenance`, and `verifyUpstreamFixtureIntegrity(fixtureRoot, provenance): void`.

- [x] **Step 1: Write failing fixture-tool tests**

Create `packages/web/test/upstream-test-fixtures.test.ts` with temporary directories and these concrete cases:

```ts
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FIXTURE_SPRITE_PATHS,
  materializeUpstreamTestFixtures,
  parseUpstreamFixtureProvenance,
  verifyUpstreamFixtureIntegrity,
} from '../scripts/upstream-test-fixtures';

const SOURCE_SHA = '212abfd21493e9957bd556250ac538fa40fe1fc9';
const SOURCE_REPOSITORY =
  'ochowei/Universal-LPC-Spritesheet-Character-Generator';

function write(root: string, relativePath: string, data: string | Buffer): void {
  const fullPath = path.join(root, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, data);
}

function makeSource(): string {
  const sourceRoot = mkdtempSync(path.join(tmpdir(), 'lpc-upstream-source-'));
  for (const relativePath of FIXTURE_SPRITE_PATHS) {
    write(sourceRoot, relativePath, Buffer.from(`fixture:${relativePath}`));
  }
  write(
    sourceRoot,
    'CREDITS.csv',
    [
      'file,notes,authors,licenses,urls',
      '"body/bodies/male/walk.png","body","Author","GPL 3.0","https://example.com/body"',
      '"body/wheelchair/adult/background/wheelchair.png","wheelchair","Author","CC-BY 3.0","https://example.com/wheelchair"',
      '"unrelated/item.png","skip","Other","GPL 3.0","https://example.com/skip"',
      '',
    ].join('\n'),
  );
  return sourceRoot;
}

function materialize(): { fixtureRoot: string; provenance: ReturnType<typeof materializeUpstreamTestFixtures> } {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'lpc-core-fixtures-'));
  const provenance = materializeUpstreamTestFixtures({
    sourceRoot: makeSource(),
    fixtureRoot,
    sourceRepository: SOURCE_REPOSITORY,
    sourceSha: SOURCE_SHA,
  });
  return { fixtureRoot, provenance };
}

describe('upstream real-pixel fixtures', () => {
  it('materializes the exact allowlist with minimal credits and hashes', () => {
    const { fixtureRoot, provenance } = materialize();

    expect(provenance.sourceRepository).toBe(SOURCE_REPOSITORY);
    expect(provenance.sourceSha).toBe(SOURCE_SHA);
    expect(provenance.files.map(({ path: filePath }) => filePath)).toEqual(
      FIXTURE_SPRITE_PATHS,
    );
    expect(provenance.files.every(({ sha256 }) => /^[0-9a-f]{64}$/.test(sha256))).toBe(true);
    const credits = readFileSync(path.join(fixtureRoot, 'CREDITS.csv'), 'utf8');
    expect(credits).toContain('body/bodies/male/walk.png');
    expect(credits).toContain('body/wheelchair/adult/background/wheelchair.png');
    expect(credits).not.toContain('unrelated/item.png');
    expect(() => verifyUpstreamFixtureIntegrity(fixtureRoot, provenance)).not.toThrow();
  });

  it('rejects malformed provenance', () => {
    expect(() => parseUpstreamFixtureProvenance('{}')).toThrow(/sourceRepository/);
  });

  it('rejects a missing fixture file', () => {
    const { fixtureRoot, provenance } = materialize();
    rmSync(path.join(fixtureRoot, FIXTURE_SPRITE_PATHS[0]));
    expect(() => verifyUpstreamFixtureIntegrity(fixtureRoot, provenance)).toThrow(/Missing fixture file/);
  });

  it('rejects an unexpected fixture file', () => {
    const { fixtureRoot, provenance } = materialize();
    write(fixtureRoot, 'spritesheets/unexpected.png', 'unexpected');
    expect(() => verifyUpstreamFixtureIntegrity(fixtureRoot, provenance)).toThrow(/Unexpected fixture file/);
  });

  it('rejects a fixture hash mismatch', () => {
    const { fixtureRoot, provenance } = materialize();
    writeFileSync(path.join(fixtureRoot, FIXTURE_SPRITE_PATHS[0]), 'changed');
    expect(() => verifyUpstreamFixtureIntegrity(fixtureRoot, provenance)).toThrow(/SHA-256 mismatch/);
  });

  it('rejects empty fixture credits', () => {
    const { fixtureRoot, provenance } = materialize();
    writeFileSync(path.join(fixtureRoot, 'CREDITS.csv'), '');
    expect(() => verifyUpstreamFixtureIntegrity(fixtureRoot, provenance)).toThrow(/CREDITS.csv must be non-empty/);
  });
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/upstream-test-fixtures.test.ts
```

Expected: FAIL because `../scripts/upstream-test-fixtures` does not exist.

- [x] **Step 3: Implement the fixture module with the exact 17-file allowlist**

Create `packages/web/scripts/upstream-test-fixtures.ts`. The allowlist must be exactly:

```ts
export const FIXTURE_SPRITE_PATHS = [
  'spritesheets/body/bodies/male/backslash.png',
  'spritesheets/body/bodies/male/climb.png',
  'spritesheets/body/bodies/male/combat_idle.png',
  'spritesheets/body/bodies/male/emote.png',
  'spritesheets/body/bodies/male/halfslash.png',
  'spritesheets/body/bodies/male/hurt.png',
  'spritesheets/body/bodies/male/idle.png',
  'spritesheets/body/bodies/male/jump.png',
  'spritesheets/body/bodies/male/run.png',
  'spritesheets/body/bodies/male/shoot.png',
  'spritesheets/body/bodies/male/sit.png',
  'spritesheets/body/bodies/male/slash.png',
  'spritesheets/body/bodies/male/spellcast.png',
  'spritesheets/body/bodies/male/thrust.png',
  'spritesheets/body/bodies/male/walk.png',
  'spritesheets/body/wheelchair/adult/background/black.png',
  'spritesheets/body/wheelchair/adult/foreground/black.png',
] as const;
```

Implement the following schema and functions using only `node:crypto`, `node:fs`, and `node:path`:

```ts
export interface UpstreamFixtureFile {
  readonly path: string;
  readonly sha256: string;
  readonly creditsSource: 'CREDITS.csv';
}

export interface UpstreamFixtureProvenance {
  readonly sourceRepository: string;
  readonly sourceSha: string;
  readonly files: readonly UpstreamFixtureFile[];
}

export interface MaterializeUpstreamTestFixturesOptions {
  readonly sourceRoot: string;
  readonly fixtureRoot: string;
  readonly sourceRepository: string;
  readonly sourceSha: string;
}

export function materializeUpstreamTestFixtures(
  options: MaterializeUpstreamTestFixturesOptions,
): UpstreamFixtureProvenance;

export function parseUpstreamFixtureProvenance(
  json: string,
): UpstreamFixtureProvenance;

export function verifyUpstreamFixtureIntegrity(
  fixtureRoot: string,
  provenance: UpstreamFixtureProvenance,
): void;
```

Implementation requirements:

- Validate repository is non-empty and SHA matches `/^[0-9a-f]{40}$/`.
- Remove and recreate only the supplied `fixtureRoot`; never write below `sourceRoot`.
- Copy every allowlisted path while preserving its relative path.
- Create minimal credits from the original header plus lines beginning with `"body/bodies/male/` or `"body/wheelchair/adult/`.
- Require at least one selected body row and one wheelchair row.
- Write `provenance.json` with two-space indentation and a trailing newline.
- Enumerate actual files below `spritesheets/`, reject missing or unexpected paths, verify all SHA-256 values, and require non-empty `CREDITS.csv`.
- Error messages must name the offending path.

- [x] **Step 4: Add the explicit maintainer CLI**

Create `packages/web/scripts/materialize-upstream-test-fixtures.ts`:

```ts
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadReleaseConfig } from './asset-release';
import { materializeUpstreamTestFixtures } from './upstream-test-fixtures';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const sourceFlagIndex = process.argv.indexOf('--source');
const sourceValue = sourceFlagIndex >= 0 ? process.argv[sourceFlagIndex + 1] : undefined;
if (!sourceValue) {
  throw new Error('Usage: materialize-upstream-test-fixtures --source <absolute-or-relative-path>');
}

const sourceRoot = path.resolve(sourceValue);
const config = loadReleaseConfig(repoRoot);
const sourceHead = execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
if (sourceHead !== config.sourceSha) {
  throw new Error(
    `Fixture source HEAD mismatch: expected ${config.sourceSha}, actual ${sourceHead}`,
  );
}

const fixtureRoot = path.join(
  repoRoot,
  'packages/core/test/fixtures/upstream-pixels',
);
const provenance = materializeUpstreamTestFixtures({
  sourceRoot,
  fixtureRoot,
  sourceRepository: config.sourceRepository,
  sourceSha: config.sourceSha,
});
console.log(
  `[materialize-upstream-test-fixtures] wrote ${provenance.files.length} attributed PNG fixtures from ${provenance.sourceSha}`,
);
```

Add this Web package script:

```json
"materialize-upstream-test-fixtures": "tsx scripts/materialize-upstream-test-fixtures.ts"
```

- [x] **Step 5: Run fixture-tool tests and typecheck**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/upstream-test-fixtures.test.ts
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: all fixture-tool tests PASS and Web typecheck PASS.

- [x] **Step 6: Commit Task 1 implementation**

```bash
rtk git add packages/web/scripts/upstream-test-fixtures.ts packages/web/scripts/materialize-upstream-test-fixtures.ts packages/web/test/upstream-test-fixtures.test.ts packages/web/package.json
rtk git commit -m "test(web): add attributed upstream fixture tooling"
```

- [x] **Step 7: Record Task 1 evidence in this plan**

Mark Task 1 checkboxes complete and append an execution record containing the concrete implementation summary, the Task 1 implementation commit from `rtk git rev-parse --short HEAD`, and both exact PASS commands. Commit only the plan update with:

```bash
rtk git add docs/superpowers/plans/2026-07-13-dormant-upstream-submodule.md
rtk git commit -m "docs(plan): record upstream fixture tooling"
```

#### Task 1 execution record

- Implementation: Added the exact 17-path attributed fixture allowlist, provenance parsing and SHA-256 integrity verification, source-root overlap protection including symlink aliases, and the explicit maintainer materialization CLI. Added regression coverage for missing/unexpected/hash-mismatched files, empty credits, duplicate provenance paths, ancestor overlap, and symlinked-parent overlap.
- Implementation commits: `6d1b24715` (`test(web): add attributed upstream fixture tooling`), `15e0b55a7` (`fix(web): harden fixture provenance validation`), `5932c1051` (`fix(web): guard symlinked fixture overlap`).
- Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/upstream-test-fixtures.test.ts` GREEN, 9/9 tests; `rtk proxy pnpm --filter @lpc-toolkit/web typecheck` PASS; `rtk pnpm check:boundaries` PASS. The exact `rtk pnpm --filter @lpc-toolkit/web typecheck` emitted `TypeScript: No errors found` but returned non-zero because the RTK wrapper does not support filtered `pnpm tsc`; the proxy command is the passing package-scoped verification.
- Review: Task-scoped spec-compliance and code-quality review approved after the symlink-overlap fix.

---

### Task 2: Materialize fixtures and decouple Core real-pixel tests

**Files:**
- Create: `packages/core/test/real-pixel-fixtures.test.ts`
- Create: `packages/core/test/fixtures/upstream-pixels/provenance.json`
- Create: `packages/core/test/fixtures/upstream-pixels/CREDITS.csv`
- Create: the 17 allowlisted PNGs below `packages/core/test/fixtures/upstream-pixels/spritesheets/`
- Modify: `packages/core/test/compose.test.ts:22-25, 524-584, 962-1020`
- Modify: `packages/core/test/recolor-resolve.test.ts:19-23, 143-166`
- Modify: `packages/core/test/helpers/node-canvas-adapter.ts:8-28`

**Interfaces:**
- Consumes: Task 1 `materialize-upstream-test-fixtures` command and generated fixture layout.
- Produces: `REAL_PIXEL_FIXTURE_ROOT` local test constant and Core tests that never resolve into tracked `upstream/`.

- [x] **Step 1: Write the failing Core fixture contract**

Create `packages/core/test/real-pixel-fixtures.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface FixtureProvenance {
  readonly sourceSha: string;
  readonly files: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly creditsSource: string;
  }[];
}

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, 'fixtures/upstream-pixels');

describe('real-pixel fixture bundle', () => {
  it('is checked in outside upstream with attributed files', () => {
    expect(fixtureRoot).not.toContain(`${path.sep}upstream${path.sep}`);
    const provenance = JSON.parse(
      readFileSync(path.join(fixtureRoot, 'provenance.json'), 'utf8'),
    ) as FixtureProvenance;
    expect(provenance.sourceSha).toMatch(/^[0-9a-f]{40}$/);
    expect(provenance.files).toHaveLength(17);
    for (const file of provenance.files) {
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(file.creditsSource).toBe('CREDITS.csv');
      expect(existsSync(path.join(fixtureRoot, file.path))).toBe(true);
    }
    expect(readFileSync(path.join(fixtureRoot, 'CREDITS.csv'), 'utf8').trim()).not.toBe('');
  });
});
```

- [x] **Step 2: Run the Core fixture contract and verify RED**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/core exec vitest run test/real-pixel-fixtures.test.ts
```

Expected: FAIL with `ENOENT` for `provenance.json`.

- [x] **Step 3: Materialize the checked-in fixture bundle from the pinned read-only source**

Run the Task 1 command against the already initialized, read-only source checkout:

```bash
rtk pnpm --filter @lpc-toolkit/web materialize-upstream-test-fixtures --source upstream
```

Expected: `wrote 17 attributed PNG fixtures from 212abfd21493e9957bd556250ac538fa40fe1fc9`. Confirm `rtk git status --short upstream` prints nothing.

- [x] **Step 4: Point Core composition and recolor tests at fixtures**

In both `compose.test.ts` and `recolor-resolve.test.ts`, replace the direct submodule base with:

```ts
const realPixelFixtureBase = path.join(
  here,
  'fixtures/upstream-pixels',
);
```

Replace every `spritesheetsBaseUrl: upstreamBase` and the recolor test's `upstreamBase` variable use with `realPixelFixtureBase`. Rename descriptions from “real upstream spritesheets/data” to “real attributed fixtures” where the test is now fixture-backed. In the wheelchair test, retain the existing canvas assertions and add:

```ts
expect(sheet.credits.entries.length).toBeGreaterThan(0);
```

Update `node-canvas-adapter.ts` to say the caller supplies either a fixture filesystem root or another concrete path; remove the claim that tests point at `upstream/`.

- [x] **Step 5: Prove Core no longer references the tracked submodule**

Run:

```bash
rtk rg -n "\.\./\.\./\.\./upstream|spritesheetsBaseUrl.*upstream|upstreamBase" packages/core/test
```

Expected: no matches. Historical comments saying behavior was lifted from upstream are allowed when they do not resolve a filesystem path.

- [x] **Step 6: Run focused Core verification**

```bash
rtk pnpm --filter @lpc-toolkit/core exec vitest run test/real-pixel-fixtures.test.ts test/compose.test.ts test/recolor-resolve.test.ts
rtk pnpm --filter @lpc-toolkit/core typecheck
rtk pnpm check:boundaries
```

Expected: all focused tests PASS, Core typecheck PASS, boundaries PASS.

- [x] **Step 7: Commit Task 2 implementation**

```bash
rtk git add packages/core/test/fixtures/upstream-pixels packages/core/test/real-pixel-fixtures.test.ts packages/core/test/compose.test.ts packages/core/test/recolor-resolve.test.ts packages/core/test/helpers/node-canvas-adapter.ts
rtk git commit -m "test(core): replace submodule pixels with fixtures"
```

- [x] **Step 8: Record Task 2 evidence in this plan**

Mark Task 2 complete and append the concrete implementation note, implementation commit hash, fixture count/size, and exact PASS results. Commit the plan record:

```bash
rtk git add docs/superpowers/plans/2026-07-13-dormant-upstream-submodule.md
rtk git commit -m "docs(plan): record core fixture migration"
```

#### Task 2 execution record

- Implementation: Materialized exactly 17 real PNG fixtures (124K total) under `packages/core/test/fixtures/upstream-pixels`, with source SHA `212abfd21493e9957bd556250ac538fa40fe1fc9`, exact SHA-256 provenance, minimal credits, and per-row credit payload hashes. Redirected Core compose, wheelchair, recolor, and hash test paths away from `upstream/`; preserved the real-pixel attribution assertions and added a checked-in fixture contract.
- Implementation commits: `6ca9c0925` (`test(core): replace submodule pixels with fixtures`), `2e3ada4bb` (`test(fixtures): enforce exact fixture credit rows`), `1236c5303` (`fix(fixtures): enforce exact credit payload contract`).
- Verification: Core focused real-pixel suite `test/real-pixel-fixtures.test.ts test/compose.test.ts test/recolor-resolve.test.ts` PASS (51/51 before the contract-only fix; rerun PASS after the fix); Core typecheck PASS; `rtk pnpm check:boundaries` PASS; Core grep audit found no tracked `upstream` path references; Web fixture-tool tests PASS including exact credit payload regression. The materialization command used the absolute read-only `upstream` path because the filtered package wrapper resolves a relative `--source` from `packages/web`; no files in `upstream/` changed.
- Review: Task-scoped spec-compliance and code-quality review approved after correcting five legacy credit filename aliases and enforcing exact credit payload hashes.

---

### Task 3: Add four-way upstream pin verification

**Files:**
- Create: `packages/web/scripts/upstream-pin.ts`
- Create: `packages/web/scripts/verify-upstream-pin.ts`
- Create: `packages/web/test/upstream-pin.test.ts`
- Modify: `packages/web/package.json:7-12`

**Interfaces:**
- Consumes: Task 1 `parseUpstreamFixtureProvenance` and `verifyUpstreamFixtureIntegrity`, repository gitlink, `asset-release.json`, generated `assets/asset-manifest.json`, and Task 2 fixture provenance.
- Produces: `parseUpstreamGitlink(output): string`, `readUpstreamGitlink(repoRoot): string`, `verifyUpstreamPin({ repoRoot, gitlinkSha? }): UpstreamPinVerification`, and Web command `verify-upstream-pin`.

- [x] **Step 1: Write failing pin-verifier tests**

Create `packages/web/test/upstream-pin.test.ts` with a temp repository fixture that writes:

```ts
const SHA = '212abfd21493e9957bd556250ac538fa40fe1fc9';
const OTHER_SHA = '0'.repeat(40);

expect(parseUpstreamGitlink(`160000 commit ${SHA}\tupstream\n`)).toBe(SHA);
expect(() => parseUpstreamGitlink('')).toThrow(/Unable to read upstream gitlink/);
```

The temp fixture must contain a valid `asset-release.json`,
`assets/asset-manifest.json`, and copied fixture provenance/files. Add cases that:

```ts
expect(verifyUpstreamPin({ repoRoot, gitlinkSha: SHA })).toEqual({
  sourceSha: SHA,
  fixtureFileCount: 17,
});

expect(() =>
  verifyUpstreamPin({ repoRoot, gitlinkSha: OTHER_SHA }),
).toThrow(/gitlink: 0000000000000000000000000000000000000000/);
```

Also mutate manifest and fixture `sourceSha` separately and assert the error
lists all four labels: `gitlink`, `asset-release.json`, `asset manifest`, and
`fixture provenance`. Change fixture `sourceRepository` and require an error
that shows both repository identifiers. Add missing-manifest and
malformed-gitlink cases. Reuse Task 1 helpers to generate the fixture tree; do
not create an actual submodule in tests.

- [x] **Step 2: Run the focused pin test and verify RED**

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/upstream-pin.test.ts
```

Expected: FAIL because `../scripts/upstream-pin` does not exist.

- [x] **Step 3: Implement the verifier module**

Create `packages/web/scripts/upstream-pin.ts` with these exact public interfaces:

```ts
export interface VerifyUpstreamPinOptions {
  readonly repoRoot: string;
  readonly gitlinkSha?: string;
}

export interface UpstreamPinVerification {
  readonly sourceSha: string;
  readonly fixtureFileCount: number;
}

export function parseUpstreamGitlink(output: string): string;
export function readUpstreamGitlink(repoRoot: string): string;
export function verifyUpstreamPin(
  options: VerifyUpstreamPinOptions,
): UpstreamPinVerification;
```

Implementation rules:

- `readUpstreamGitlink` uses `execFileSync('git', ['ls-tree', 'HEAD', 'upstream'])`; it never reads `upstream/`.
- Parse only `160000 commit <40 lowercase hex><tab>upstream`.
- Read the release repository/SHA, raw manifest `sourceSha`, and fixture provenance.
- Validate every SHA before comparing.
- If any SHA differs, throw one error containing all four labeled actual values.
- Require fixture `sourceRepository` to equal `asset-release.json.sourceRepository` and report both values on mismatch.
- If pins match, run `verifyUpstreamFixtureIntegrity`.
- Return the shared SHA and provenance file count.
- Missing files name the exact file and do not suggest submodule initialization.

The central comparison should have this shape:

```ts
const pins = [
  ['gitlink', gitlinkSha],
  ['asset-release.json', releaseSha],
  ['asset manifest', manifestSha],
  ['fixture provenance', provenance.sourceSha],
] as const;
if (pins.some(([, value]) => value !== releaseSha)) {
  throw new Error(
    `Upstream source SHA mismatch:\n${pins
      .map(([label, value]) => `- ${label}: ${value}`)
      .join('\n')}`,
  );
}
```

- [x] **Step 4: Add the repository-only CLI wrapper**

Create `packages/web/scripts/verify-upstream-pin.ts`:

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyUpstreamPin } from './upstream-pin';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const result = verifyUpstreamPin({ repoRoot });
console.log(
  `[verify-upstream-pin] ${result.fixtureFileCount} fixture files and all source pins match ${result.sourceSha}`,
);
```

Add the Web package script:

```json
"verify-upstream-pin": "tsx scripts/verify-upstream-pin.ts"
```

- [x] **Step 5: Run verifier tests, real verifier, and Web typecheck**

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/upstream-pin.test.ts test/upstream-test-fixtures.test.ts
rtk pnpm --filter @lpc-toolkit/web verify-upstream-pin
rtk pnpm --filter @lpc-toolkit/web typecheck
```

Expected: tests PASS; CLI reports 17 fixture files and SHA `212abfd...`; typecheck PASS.

- [x] **Step 6: Commit Task 3 implementation**

```bash
rtk git add packages/web/scripts/upstream-pin.ts packages/web/scripts/verify-upstream-pin.ts packages/web/test/upstream-pin.test.ts packages/web/package.json
rtk git commit -m "feat(web): verify dormant upstream pins"
```

- [x] **Step 7: Record Task 3 evidence in this plan**

Mark Task 3 complete and append concrete implementation, commit, and verification records. Commit the plan record:

```bash
rtk git add docs/superpowers/plans/2026-07-13-dormant-upstream-submodule.md
rtk git commit -m "docs(plan): record upstream pin verifier"
```

#### Task 3 execution record

- Implementation: Added repository-only four-way pin verification using `git ls-tree HEAD upstream`, release config, prepared asset manifest, and Core fixture provenance; aggregated labeled SHA mismatch errors, source repository mismatch reporting, integrity delegation, and the `verify-upstream-pin` CLI/package script. No verifier path reads `upstream/`.
- Implementation commit: `15f481221` (`feat(web): verify dormant upstream pins`).
- Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/upstream-pin.test.ts test/upstream-test-fixtures.test.ts` PASS, 21/21; `rtk pnpm --filter @lpc-toolkit/web verify-upstream-pin` PASS on elevated rerun, reporting 17 fixture files and SHA `212abfd21493e9957bd556250ac538fa40fe1fc9`; Web typecheck underlying `tsc --noEmit` PASS with the RTK filtered-command wrapper caveat; `rtk pnpm check:boundaries` PASS.
- Review: Task-scoped spec-compliance and code-quality review approved with no findings.

---

### Task 4: Make normal lifecycle and CI submodule-free

**Files:**
- Modify: `package.json:11-16`
- Modify: `packages/web/package.json:7-24`
- Modify: `.github/workflows/ci.yml:38-53`
- Modify: `.github/workflows/publish.yml:17-31`
- Modify: `packages/web/test/package-scripts.test.ts:7-146`

**Interfaces:**
- Consumes: Task 3 `verify-upstream-pin` command and Task 2 checked-in fixtures.
- Produces: root `verify:upstream-pin` command; lifecycle ordering `prepare-assets -> verify-upstream-pin -> consuming validation`; submodule-free normal GitHub Actions jobs.

- [x] **Step 1: Tighten workflow/lifecycle tests first**

In `package-scripts.test.ts`, derive `unitJob` once and update expectations to require:

```ts
expect(rootPackageJson.scripts?.['verify:upstream-pin']).toBe(
  'pnpm --filter @lpc-toolkit/web verify-upstream-pin',
);
expect(rootPackageJson.scripts?.pretest).toBe(
  'pnpm --filter @lpc-toolkit/web prepare-assets && pnpm verify:upstream-pin',
);
expect(packageJson.scripts?.prebuild).toContain(
  'pnpm prepare-assets && pnpm verify-upstream-pin',
);
expect(packageJson.scripts?.pretest).toBe(
  'pnpm prepare-assets && pnpm verify-upstream-pin',
);
expect(packageJson.scripts?.['pretest:e2e']).toBe(
  'pnpm prepare-assets && pnpm verify-upstream-pin',
);
expect(packageJson.scripts?.['pretest:e2e:parity']).toBe(
  'pnpm prepare-assets && pnpm verify-upstream-pin && pnpm verify-upstream-parity',
);
```

Require the unit job to omit recursive submodules and run preparation/verifier before boundaries:

```ts
expect(unitJob).not.toContain('submodules: recursive');
expect(unitJob.indexOf('pnpm --filter @lpc-toolkit/web prepare-assets')).toBeLessThan(
  unitJob.indexOf('pnpm verify:upstream-pin'),
);
expect(unitJob.indexOf('pnpm verify:upstream-pin')).toBeLessThan(
  unitJob.indexOf('pnpm check:boundaries'),
);
expect(publishWorkflow).not.toContain('submodules: recursive');
expect(publishWorkflow).toContain(
  '- run: pnpm --filter @lpc-toolkit/web prepare-assets',
);
expect(publishWorkflow).toContain('- run: pnpm verify:upstream-pin');
```

Keep the existing assertions that parity uses its isolated checkout and rejects `../../upstream`.

- [x] **Step 2: Run package script tests and verify RED**

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/package-scripts.test.ts
```

Expected: FAIL on old root lifecycle and `unit` job's `submodules: recursive`.

- [x] **Step 3: Wire package lifecycle commands**

Set root scripts to:

```json
"verify:upstream-pin": "pnpm --filter @lpc-toolkit/web verify-upstream-pin",
"pretest": "pnpm --filter @lpc-toolkit/web prepare-assets && pnpm verify:upstream-pin"
```

Set Web lifecycle prefixes to:

```json
"prebuild": "pnpm prepare-assets && pnpm verify-upstream-pin && pnpm --filter @lpc-toolkit/core build && pnpm --filter @lpc-toolkit/presets build",
"pretest": "pnpm prepare-assets && pnpm verify-upstream-pin",
"pretest:e2e": "pnpm prepare-assets && pnpm verify-upstream-pin",
"pretest:e2e:parity": "pnpm prepare-assets && pnpm verify-upstream-pin && pnpm verify-upstream-parity"
```

- [x] **Step 4: Remove normal CI submodule checkout and order verification**

Change the unit checkout to plain:

```yaml
- uses: actions/checkout@v4
```

After `pnpm install --frozen-lockfile`, add:

```yaml
- run: pnpm --filter @lpc-toolkit/web prepare-assets
- run: pnpm verify:upstream-pin
```

In `.github/workflows/publish.yml`, add the same two commands after install and before `pnpm check:boundaries`. Do not change the parity job's isolated checkout or its `npm ci --prefix "$LPC_UPSTREAM_PARITY_DIR"` command.

- [x] **Step 5: Run lifecycle and focused verifier tests**

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/package-scripts.test.ts test/upstream-pin.test.ts test/parity-source.test.ts
rtk pnpm verify:upstream-pin
rtk pnpm check:boundaries
```

Expected: all focused tests PASS, root pin verification PASS, boundaries PASS.

- [x] **Step 6: Commit Task 4 implementation**

```bash
rtk git add package.json packages/web/package.json .github/workflows/ci.yml .github/workflows/publish.yml packages/web/test/package-scripts.test.ts
rtk git commit -m "ci: keep upstream submodule dormant"
```

- [x] **Step 7: Record Task 4 evidence in this plan**

Mark Task 4 complete and append concrete implementation, commit, and PASS records. Commit the plan record:

```bash
rtk git add docs/superpowers/plans/2026-07-13-dormant-upstream-submodule.md
rtk git commit -m "docs(plan): record submodule-free workflows"
```

#### Task 4 execution record

- Implementation: Added root `verify:upstream-pin`, ordered root/Web lifecycle preparation and pin verification, removed recursive submodule checkout from normal unit/publish workflows, and preserved isolated parity checkout plus its upstream dependency install.
- Implementation commit: `843824b0c` (`ci: keep upstream submodule dormant`).
- Verification: package lifecycle/workflow tests GREEN, 23 focused tests; `rtk pnpm verify:upstream-pin` PASS on elevated rerun; `rtk pnpm check:boundaries` PASS. RED had the expected four old-contract failures before implementation. No dependency, lockfile, or `upstream/` changes.
- Review: Task-scoped spec-compliance and code-quality review approved with no findings.

---

### Task 5: Align current documentation and contributor contracts

**Files:**
- Modify: `packages/web/test/readme-architecture-docs.test.ts:7-160`
- Modify: `README.md:34-91`
- Modify: `AGENTS.md:14-46`
- Modify: `CLAUDE.md:14-46`
- Modify: `docs/ONBOARDING.md:18-25`
- Modify: `docs/ARCHITECTURE.md:312-325`
- Modify: `packages/web/e2e/helpers/console-collector.ts:45-53`

**Interfaces:**
- Consumes: Task 4 lifecycle and CI behavior.
- Produces: one current documentation contract: `upstream/` is optional read-only provenance, normal workflows require no checkout, parity alone uses a separate checkout.

- [x] **Step 1: Write failing documentation assertions**

Extend `readme-architecture-docs.test.ts` to read `AGENTS.md`, `CLAUDE.md`, and onboarding, then assert:

```ts
for (const document of [readme, architecture, agents, claude, onboarding]) {
  expect(document).toContain('optional');
  expect(document).toContain('read-only');
}
expect(readme).toContain('standard clone does not initialize the submodule');
expect(readme).not.toContain('git clone --recurse-submodules');
expect(readme).not.toContain('git submodule update --init');
expect(architecture).toContain('dormant gitlink');
expect(architecture).toContain('fixture provenance');
expect(architecture).toContain('separate isolated checkout');
expect(agents).toContain('Normal workflows must not require it to be initialized.');
expect(claude).toContain('Normal workflows must not require it to be initialized.');
expect(onboarding).toContain('Do not initialize `upstream/` for normal setup.');
```

Use variables loaded through the existing `readRepoFile` helper; do not assert against historical specs/plans.

- [x] **Step 2: Run the documentation contract and verify RED**

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/readme-architecture-docs.test.ts
```

Expected: FAIL because README still requires recursive clone and current governance docs do not define dormant behavior.

- [x] **Step 3: Update README setup and provenance language**

Replace recursive setup with an ordinary clone example and this explicit contract:

```text
The standard clone does not initialize the submodule. Install, typecheck,
tests, builds, ordinary E2E, CLI packaging, and publish validation use pinned
local/cache assets and checked-in test fixtures instead. `upstream/` is an
optional read-only reference; initialize it only for deliberate source
research. Parity uses a separate isolated checkout of the same pinned commit.
```

Keep the existing GPL, attribution, runtime asset, and parity descriptions.

- [x] **Step 4: Update governance and architecture docs**

In both `AGENTS.md` and `CLAUDE.md`, use the same hard rule:

```text
`upstream/` is an optional, read-only git submodule retained as a provenance
gitlink. Never modify or commit inside it, and never install packages inside
it. Normal workflows must not require it to be initialized. Active assets use
the pinned local/cache-backed `assets/` flow; parity uses a separate isolated
checkout.
```

Update their layout entries to “optional read-only provenance/reference”. Add onboarding's exact sentence `Do not initialize \`upstream/\` for normal setup.`

Expand `docs/ARCHITECTURE.md` to name:

- dormant gitlink ownership;
- checked-in Core real-pixel fixtures with credits;
- four-way gitlink/release/manifest/fixture provenance verification;
- isolated parity checkout as the only executable upstream source checkout.

Update the console collector comment so it describes an upstream data-quality issue at the pinned source revision, not a normal dependency on the tracked submodule.

- [x] **Step 5: Run documentation, workflow, and boundary verification**

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/readme-architecture-docs.test.ts test/package-scripts.test.ts
rtk pnpm check:boundaries
rtk git diff --check
```

Expected: documentation and workflow tests PASS, boundaries PASS, no whitespace errors.

- [x] **Step 6: Commit Task 5 implementation**

```bash
rtk git add README.md AGENTS.md CLAUDE.md docs/ONBOARDING.md docs/ARCHITECTURE.md packages/web/e2e/helpers/console-collector.ts packages/web/test/readme-architecture-docs.test.ts
rtk git commit -m "docs: make upstream checkout optional"
```

- [x] **Step 7: Record Task 5 evidence in this plan**

Mark Task 5 complete and append concrete implementation, commit, and PASS records. Commit the plan record:

```bash
rtk git add docs/superpowers/plans/2026-07-13-dormant-upstream-submodule.md
rtk git commit -m "docs(plan): record dormant submodule guidance"
```

#### Task 5 execution record

- Implementation: Updated current README, AGENTS/CLAUDE, onboarding, architecture, console guidance, and documentation contract tests to define `upstream/` as optional read-only provenance; normal workflows do not initialize it, and parity alone uses a separate isolated checkout.
- Implementation commit: `5be3c4131` (`docs: make upstream checkout optional`).
- Verification: documentation and workflow tests PASS, 20/20; `rtk pnpm check:boundaries` PASS; `rtk git diff --check` PASS. No historical specs/plans, dependency manifests, lockfiles, or `upstream/` changed.
- Review: Task-scoped spec-compliance and code-quality review approved with no findings.

---

### Task 6: Run final submodule-free and parity verification

**Files:**
- Modify: `docs/superpowers/plans/2026-07-13-dormant-upstream-submodule.md` (final evidence only)

**Interfaces:**
- Consumes: all previous tasks.
- Produces: final evidence that normal flows have no tracked-submodule dependency and parity still uses the isolated source.

- [ ] **Step 1: Audit live source references and retained gitlink**

```bash
rtk git ls-files -s upstream
rtk git ls-tree HEAD upstream
rtk rg -n "\.\./\.\./upstream|\.\./\.\./\.\./upstream|git submodule update|recurse-submodules|submodules: recursive" packages scripts .github README.md AGENTS.md CLAUDE.md docs/ONBOARDING.md docs/ARCHITECTURE.md
```

Expected: both Git commands report mode `160000` and SHA `212abfd...`. The search finds no normal source/test path or setup/CI initialization instruction; optional-reference prose is allowed only when it does not instruct normal initialization.

- [ ] **Step 2: Run complete normal verification**

```bash
rtk pnpm verify:upstream-pin
rtk pnpm check:boundaries
rtk pnpm typecheck
rtk pnpm test
rtk pnpm build
rtk pnpm --filter @lpc-toolkit/web test:e2e
```

Expected: every command PASS. The unit/workflow tests are the executable proof that CI's plain checkout does not initialize `upstream/`.

- [ ] **Step 3: Run parity from an isolated temporary checkout**

Prepare `/private/tmp/lpc-toolkit-upstream-parity` outside the repository and
outside tracked `upstream/`, at the pinned source SHA, using the same
shallow-checkout procedure as CI. Install from the upstream lockfile only in
that isolated path, then run:

```bash
LPC_UPSTREAM_PARITY_DIR=/private/tmp/lpc-toolkit-upstream-parity rtk pnpm --filter @lpc-toolkit/web test:e2e:parity
```

Expected: parity PASS; `packages/web/scripts/parity-source.ts` accepts the isolated absolute path and continues rejecting tracked `upstream/`.

- [ ] **Step 4: Confirm scope and worktree cleanliness**

```bash
rtk git status --short
rtk git diff --check
rtk git diff --stat f76dd4a5c..HEAD
```

Expected: only this plan's final evidence remains uncommitted; the two pre-existing untracked user files remain untouched; no changes exist inside `upstream/`; no dependency manifest or lockfile change exists beyond the planned package script edits.

- [ ] **Step 5: Record and commit final verification evidence**

Mark Task 6 complete and append the exact PASS results, isolated parity path/source SHA, implementation commit range, retained gitlink SHA, and final scope audit. Commit only the plan:

```bash
rtk git add docs/superpowers/plans/2026-07-13-dormant-upstream-submodule.md
rtk git commit -m "docs(plan): record dormant submodule verification"
```

---

## Completion Criteria

- `upstream` remains a gitlink at the pinned SHA, but no normal workflow checks it out or reads it.
- The 17 checked-in Core PNG fixtures have exact hashes, minimal credits, and source provenance.
- Core real-pixel compose, wheelchair, and recolor tests pass against fixtures.
- Gitlink, release config, materialized manifest, and fixture provenance match without submodule initialization.
- Unit and publish workflows explicitly prepare assets and verify pins without recursive checkout.
- README and current governance/architecture docs describe optional dormant-submodule behavior.
- Full boundaries, typecheck, tests, build, ordinary E2E, and isolated parity all pass.
