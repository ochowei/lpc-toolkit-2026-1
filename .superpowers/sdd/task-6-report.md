# Task 6 Fix-Wave Report — 2026-07-22

Status: complete

Scope:

- Changed only CLI registry/sync production code, their focused tests, and this required report.
- Did not modify checked-in plans/progress, documentation, `upstream/`, assets, cache, web code, dependencies, or use `any`.

Implemented:

- Reject requested and retained linked directories outside `packsRoot` or beneath a symbolic link before source loading, validation, or publication. Regression tests prove requested outside-root and symlink-root attempts leave managed output and registry bytes unchanged.
- Replaced the unconstrained compile digest input with one typed canonical projection. Empty, writer, and reader paths now hash definitions, source-to-destination sprite digests, credits, compiler ownership, and consumers consistently. Independent digest tests cover deterministic ordering and each required field.
- Added strict v2 per-entry sprite ownership metadata and validation: logical destinations exactly match generated sprites, source/destination digests bind to captured/generated records, destination ownership is enforced, and each generated credit must cover an owned destination. Acknowledgement and replacement collections now require normalized sorted uniqueness.
- Preserved read-only v1 data without enrichment, require exact v1 generated-digest coverage, and reject retained v1 version, display-name, source-digest, generated-ownership, and baseline-digest drift before v2 publication. Populated v1 read and rejection tests assert registry/output bytes remain unchanged on failure.

TDD evidence:

- RED: outside-root and symlink-root sync tests initially succeeded incorrectly; canonical digest tests produced a different digest; retained-v1 metadata drift initially migrated successfully.
- GREEN: each regression passed after the minimal shared containment, canonical projection, strict relationship, and retained-v1 comparison changes.

Verification:

- `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-registry.test.ts asset-pack-sync.test.ts asset-workspace.test.ts` — PASS: 3 files, 59 tests.
- `rtk pnpm --filter @lpc-toolkit/cli run typecheck` — PASS: `tsc -p tsconfig.json --noEmit`.
- `rtk git diff --check` — PASS.

CLI documentation impact matrix:

```text
help: N/A — no public command syntax or help text changed.
cli-readme: N/A — internal registry validation does not change documented workflow.
root-readme: N/A — repository quick-start behavior is unchanged.
landing: N/A — no web or landing content changed.
architecture: N/A — existing CLI registry ownership and attribution boundaries are preserved.
engineering: N/A — verification and CI command mapping are unchanged.
releasing: N/A — no release or publication workflow changed.
plugin: N/A — plugin contract and skills are unchanged.
```
