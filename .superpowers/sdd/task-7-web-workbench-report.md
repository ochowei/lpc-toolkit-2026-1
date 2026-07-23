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
