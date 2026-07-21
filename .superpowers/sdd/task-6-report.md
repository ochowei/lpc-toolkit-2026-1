# Task 6 Report — 2026-07-21

Status: complete

Product commit:

- `9bd367099bab9e3fcb0cb618c5cec1e695d3d686` — `feat(cli): scaffold artist asset pack sources`

Scope followed:

- Worked only in:
  - `packages/cli/src/asset-pack-files.ts`
  - `packages/cli/src/asset-pack-scaffold.ts`
  - `packages/cli/test/asset-pack-files.test.ts`
  - `packages/cli/test/asset-pack-scaffold.test.ts`
- Did not modify the checked-in Phase 1 plan, `.superpowers/sdd/progress.md`, `upstream/`, `assets/`, managed cache, or unrelated tracked report files
- Did not add dependencies or `any`
- Did not implement PNG decode/geometry validation, command wiring, sync/preview, or archive lifecycle work owned by later tasks

Files changed:

- `packages/cli/src/asset-pack-files.ts`
- `packages/cli/src/asset-pack-scaffold.ts`
- `packages/cli/test/asset-pack-files.test.ts`
- `packages/cli/test/asset-pack-scaffold.test.ts`

What changed:

- Added safe asset-pack source loading in `asset-pack-files.ts`
  - reads `asset-pack.json` without rewriting it
  - surfaces JSON parse failures and core schema diagnostics
  - canonicalizes source paths under the pack root
  - rejects missing sources, symlink escapes, non-regular files, and duplicate canonical source targets
  - computes per-source SHA-256 digests
  - computes the Task 6 content digest from the core content projection plus sorted `{ sourcePath, digest }` pairs
  - keeps acknowledgement-only manifest edits out of the content projection
- Added atomic scaffold publication in `asset-pack-scaffold.ts`
  - publishes simple new-item pack scaffolds with a single `foreground` layer
  - publishes advanced scaffolds with documentation in sibling `README.md` only while keeping `asset-pack.json` strict JSON
  - creates referenced sprite parent directories without emitting blank PNG files
  - stages output in a sibling temporary directory and renames into a destination that must not already exist
  - scaffolds audit-derived extend-item packs from successful `catalog audit-animations` JSON reports
  - maps exact missing-file findings to `audit-exact` accepted destinations
  - maps inferred unsupported requirements to `audit-inferred` unaccepted destinations
  - preserves grouped consumers on shared source/destination tasks
  - copies active baseline definition and credit digests into extend-item entries
  - aborts publication and returns `finding_not_scaffoldable_v1` diagnostics when selected findings need manual review or contain blank frames

RED evidence:

1. Wrote `packages/cli/test/asset-pack-files.test.ts` before creating `packages/cli/src/asset-pack-files.ts`.
   - Covered manifest JSON errors
   - Covered core schema errors
   - Covered missing source files
   - Covered symlink escape detection
   - Covered non-regular source paths
   - Covered duplicate canonical source paths
   - Covered stable digest behavior across manifest property order changes
   - Covered digest changes for substantive manifest/source changes
   - Covered acknowledgement-only digest stability
   - Covered read-only manifest bytes and mtime preservation

2. Wrote `packages/cli/test/asset-pack-scaffold.test.ts` before creating `packages/cli/src/asset-pack-scaffold.ts`.
   - Covered simple new scaffolds
   - Covered advanced README-only documentation behavior
   - Covered atomic refusal to publish over an existing destination
   - Covered audit-derived exact and inferred scaffold tasks
   - Covered preservation of consumers and baseline digests
   - Covered non-scaffoldable manual-review and blank-frame aborts
   - Covered required successful audit envelope / exact command / selector validation

3. Ran the exact focused RED command from the brief before production edits:

   - Command: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-files.test.ts asset-pack-scaffold.test.ts`
   - Result: FAIL
   - Evidence:
     - `Failed to load url ../src/asset-pack-files.js`
     - `Failed to load url ../src/asset-pack-scaffold.js`

GREEN evidence:

1. Re-ran the exact focused suite after implementation:

   - Command: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-files.test.ts asset-pack-scaffold.test.ts`
   - Result: PASS
   - Evidence:
     - `✓ test/asset-pack-scaffold.test.ts (6 tests)`
     - `✓ test/asset-pack-files.test.ts (6 tests)`
     - `Tests 12 passed (12)`

2. Ran the exact required CLI typecheck:

   - Command: `rtk pnpm --filter @lpc-toolkit/cli run typecheck`
   - Result: PASS
   - Evidence:
     - `tsc -p tsconfig.json --noEmit`

CLI documentation impact matrix:

```text
help: N/A — Task 6 adds internal modules only and does not wire or change a public command surface yet.
cli-readme: N/A — no documented CLI workflow, path, or output contract changed in this task alone.
root-readme: N/A — repository quick-start behavior is unchanged.
landing: N/A — no web landing behavior or copy changed.
architecture: N/A — package boundaries are unchanged; new logic stays inside the CLI package.
engineering: N/A — verification commands and CI mapping are unchanged.
releasing: N/A — no release or publication flow changed.
plugin: N/A — plugin contract and skills are unchanged.
```

Self-review:

- Re-checked the safe-read path handling against the Task 5 workspace hardening so the implementation rejects source escapes but still accepts the macOS top-level `/var` alias used by temp-backed tests.
- Confirmed the content digest uses the core projection and therefore stays stable across manifest property ordering and acknowledgement-only edits.
- Confirmed the loader reads manifest bytes and mtime without normalization writes or timestamp churn.
- Confirmed new scaffolds create source directories only and never pre-populate blank PNG placeholders.
- Confirmed audit scaffolding keeps runtime recolor names only in consumer metadata and never bakes them into source filenames.
- Confirmed grouped audit findings retain all consumers when they share one destination/source task.
- Confirmed any selected manual-review or blank-frame finding aborts publication before creating a partial pack.
- Confirmed the implementation remains CLI-independent and does not wire commands or later-task sync/archive behavior.

Concerns:

- Task 6 intentionally trusts audit report contents beyond envelope/selection validation and destination projection; real PNG decode, frame-blank validation, and deeper source inspection remain deferred to Task 7.
- The audit scaffold source-path naming is deterministic and collision-safe for the tested cases, but later command wiring may still want a user-facing preview step before publication when many inferred tasks collapse into one generated filename.

---

## Important Task 6 reviewer fixes — 2026-07-21

Status: complete

Fix commit:

- `dc2ece375f8dc2a52c8a8a11c577e766576277bb` — `fix(cli): harden asset pack audit inputs`

Files:

- `packages/cli/src/asset-pack-files.ts`
- `packages/cli/src/asset-pack-scaffold.ts`
- `packages/cli/test/asset-pack-files.test.ts`
- `packages/cli/test/asset-pack-scaffold.test.ts`

RED:

1. Added an in-pack symlink regression in `packages/cli/test/asset-pack-files.test.ts`.
   - Command: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-files.test.ts asset-pack-scaffold.test.ts`
   - Result: FAIL
   - Output:
     - `× loadAssetPackFiles > rejects in-pack symlink source entries even when they resolve to regular files inside the pack`
     - `expected true to be false`

2. Added a malformed-successful-audit regression in `packages/cli/test/asset-pack-scaffold.test.ts`.
   - Command: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-files.test.ts asset-pack-scaffold.test.ts`
   - Result: FAIL
   - Output:
     - `× scaffoldAuditAssetPack > rejects malformed successful audit findings with invalid pathConfidence and publishes no partial pack`
     - `expected { ok: true, … } to deeply equal { ok: false, diagnostics: [ … ] }`

Implementation:

- `loadAssetPackFiles` now rejects every symlink source entry from the pack manifest based on `lstatSync` before any `realpath` resolution, while leaving regular-file containment, missing-file handling, and digest behavior unchanged.
- `readAuditEnvelope` now validates the successful `catalog audit-animations` envelope deeply before scaffolding:
  - non-empty valid `targets`
  - valid `scope`
  - numeric `summary`
  - exact finding shapes for `unsupported`, `missingFiles`, `blankFrames`, and `errors`
  - valid consumer/body-type/layer/direction semantics
  - valid `pathConfidence` rules (`inferred` requires `expectedPath`; `manual-review` requires `manualReviewReason` and forbids `expectedPath`)
  - summary counts must match the corresponding finding-array lengths
- Malformed nested findings now return stable `audit_report_invalid_v1` diagnostics with JSON-style field paths and publish no partial pack.

GREEN:

1. Focused CLI regressions:
   - Command: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-files.test.ts asset-pack-scaffold.test.ts`
   - Result: PASS
   - Output:
     - `✓ test/asset-pack-scaffold.test.ts (7 tests)`
     - `✓ test/asset-pack-files.test.ts (7 tests)`
     - `Tests 14 passed (14)`

2. CLI typecheck:
   - Command: `rtk pnpm --filter @lpc-toolkit/cli run typecheck`
   - Result: PASS
   - Output:
     - `tsc -p tsconfig.json --noEmit`

Self-review:

- Re-checked that the new symlink rejection happens at the source entry itself, so even in-root symlinks to regular files are rejected before canonical-path resolution.
- Confirmed the earlier mixed safety regression still covers missing files and non-regular directories, while symlink cases now intentionally resolve to the new symlink diagnostic instead of escape/duplicate follow-on errors.
- Confirmed malformed nested audit findings fail in `readAuditEnvelope` before `buildDrafts`, so a report that mixes valid and invalid selected findings still publishes nothing.
- Confirmed valid supported behavior remains intact for exact missing-file scaffolds, inferred unsupported scaffolds, manual-review blockers, blank-frame blockers, grouped consumers, and recolor metadata passthrough.
