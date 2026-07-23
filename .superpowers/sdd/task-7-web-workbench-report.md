# Task 7 Web Workbench Report

## Result

Implemented Task 7 from HEAD `115bff64cfc71613aab3de7ae676bca1a027d6ea` on the existing branch. No worktree or branch was created, and no Task 8 work was performed.

## RED

Command:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-format-runtime.test.ts asset-pack-format-conformance.test.ts asset-pack-png-decoder.test.ts asset-pack-baseline.test.ts
```

The first sandboxed invocation stopped in the existing `pretest` `tsx` hook with `listen EPERM` before Vitest could start. The same exact command was rerun with the required IPC permission and produced the intended RED: all four new suites failed during module loading because the requested browser adapter/baseline modules and workspace alias did not exist (`4 failed suites`, `0 tests`). The pretest run was cache-hit and verified the checked-in asset pin; it did not initialize or modify `upstream/`.

## GREEN

Focused tests:

```text
4 passed files, 7 passed tests
```

Exact command:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-format-runtime.test.ts asset-pack-format-conformance.test.ts asset-pack-png-decoder.test.ts asset-pack-baseline.test.ts
```

Additional required checks:

```text
rtk pnpm --filter @lpc-toolkit/web run typecheck   PASS
rtk pnpm check:boundaries                           PASS
```

## Files

- Added browser Web Crypto, strict UTF-8, bounded raw-DEFLATE, and typed capability-error runtime adapter.
- Added worker-safe `createImageBitmap`/`OffscreenCanvas` PNG decoder with bitmap cleanup.
- Added official baseline loader using canonical Core projections, Web Crypto digests, release tag, palettes, and build-time CLI version.
- Added the four requested Web tests.
- Added the asset-pack-format workspace dependency and Vite/Vitest/TypeScript aliases.
- Added Vite CLI version define and its `string` declaration.

## Self-review

- `git diff --check`: PASS.
- No `document`, `HTMLImageElement`, object URLs, or `any` in the new adapter/baseline sources or tests.
- Boundary check passed.
- No changes under `upstream/`, `assets/`, cache locations, or artist workspaces.
- Trust decisions remain in the shared asset-pack-format package; the browser runtime only supplies crypto, UTF-8, and bounded inflation behavior.
- Reader cancellation occurs before an over-limit chunk is retained; exact compressed-input/trailing-input policy remains owned by shared `inspectRawDeflate` as required.

## Commit

Feature commit: `7772ae85b46e5e87f7c5edd0d2371534a4d720c2` (`feat(web): add safe asset pack browser adapters`)

## Concerns

- The Web conformance test exercises the shared formal archive inspector and round-trip digest parity, but does not duplicate the full large frozen archive-hex literal from the CLI conformance fixture. The implementation uses the same shared archive writer/inspector and browser runtime; the existing shared fixture remains the byte-level source of truth.
- Vitest requires a test-time CLI version define because Vite's production `define` is not applied to Vitest config; both resolve to the current CLI package version (`0.2.0`) in this checkout.

## Review Fix Report

### Scope

Fixed the Important findings from review commit `e2da51281e5069d1bd59c18839976c0e796e157f` against the Task 7 product commit `7772ae85b46e5e87f7c5edd0d2371534a4d720c2`. No Task 8 work was performed. No changes were made to `upstream/`, `assets/`, caches, or artist workspaces.

### TDD evidence

RED command:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-format-runtime.test.ts asset-pack-format-conformance.test.ts asset-pack-png-decoder.test.ts asset-pack-baseline.test.ts package-scripts.test.ts
```

After the existing cache-hit asset preparation hook, the new tests failed 3 assertions: the Vitest config still contained the literal CLI version, the missing-crypto capability vector resolved instead of reporting `asset_browser_capability_missing`, and the browser baseline per-item digests differed from Node's expected compact-JSON projection hashes. The newly added archive fixture/vector tests exposed the required parity surface, while the separately added Chromium E2E initially timed out with no probe result.

Root cause of the E2E RED: the browser adapter wrote and closed `DecompressionStream` before consuming its readable side, which deadlocked under Chromium backpressure without producing a page error.

### Fixes

- Copied the frozen Task 3 archive hex into the Web conformance suite and asserted byte-identical formal assembly, archive/content/source digests, normalized manifest, empty diagnostics, and unsafe, repairable, stored/no-inflater, and declared-size vectors.
- Added capability-absence assertions for Web Crypto and decompression.
- Added `packages/web/e2e/asset-pack-format-conformance.spec.ts` to the existing Playwright `test:e2e` convention. It runs in Chromium without a capability skip and verifies the browser archive digest/content/source projection.
- Changed browser DEFLATE consumption to read concurrently with writer backpressure and retain one bounded cancellation.
- Changed browser baseline projection hashing to match Node's shared Core projection and compact JSON digest contract, with literal per-item definition/credit expected hashes.
- Derived the Vitest CLI version define from `packages/cli/package.json`, matching Vite's build-time metadata source.
- Added the missing `@lpc-toolkit/asset-pack-format` Web importer entry to `pnpm-lock.yaml`; `rtk pnpm install --frozen-lockfile` passed after the update.

### GREEN and verification

```text
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-format-runtime.test.ts asset-pack-format-conformance.test.ts asset-pack-png-decoder.test.ts asset-pack-baseline.test.ts package-scripts.test.ts
PASS — 5 files, 19 tests

rtk pnpm --filter @lpc-toolkit/web run typecheck
PASS

rtk pnpm check:boundaries
PASS — Architecture boundary check passed.

rtk env CI=1 pnpm --filter @lpc-toolkit/web test:e2e -- asset-pack-format-conformance.spec.ts
PASS — 1 Chromium test, no skip

rtk pnpm install --frozen-lockfile
PASS — lockfile up to date; 146 packages restored

rtk git diff --check
PASS
```

### Self-review

- Archive conformance assertions use independent frozen bytes and fixed expected values rather than deriving expectations from the same browser call.
- Browser E2E uses the real Vite/Playwright path and real Chromium Web Crypto/raw `DecompressionStream`; capability absence is not skipped there.
- No new third-party dependency or `any` was added.
- Attribution, Core boundaries, and existing Web E2E conventions remain unchanged.
- Final fix commit: `bd30d3e0e6f66dc21091a34711d3c183b80256c9` (`fix(web): complete asset pack adapter parity`).

## Follow-up capability-skip fix

- TDD RED: with `NODE_OPTIONS=--no-experimental-global-webcrypto`, the focused conformance suite failed both tests with `asset_browser_capability_missing` from `crypto.subtle`.
- Product fix: `247d2c783a26d99bd60f436717696cbce82f2ff1` (`fix(web): skip unsupported archive conformance`), explicitly skips the Vitest conformance suite when `globalThis.crypto?.subtle` or `DecompressionStream` is unavailable.
- Verification: normal focused runtime/conformance tests PASS (2 files, 5 tests); simulated missing Web Crypto and missing `DecompressionStream` each report 2 skipped tests; Web typecheck PASS; `rtk pnpm check:boundaries` PASS; Chromium E2E PASS (1 test, no skip); `rtk git diff --check` PASS.
