# Dormant Upstream Submodule Design

**Date:** 2026-07-13

**Status:** Approved design

## Summary

Keep `upstream` as a read-only gitlink that records the exact source commit,
but remove every normal workflow's need to initialize or read the submodule.
Core tests that currently load real pixels from `upstream/spritesheets` will
instead use a minimal, checked-in, attributed fixture bundle. The existing
upstream parity job remains the sole exception: it continues to shallow-check
out the pinned source into an isolated temporary directory and never uses the
tracked submodule working tree.

The result preserves an inspectable Git provenance pin without imposing the
roughly 925 MB submodule checkout on normal clones or CI jobs.

## Goals

- Retain `.gitmodules` and the `upstream` gitlink as provenance metadata.
- Make an uninitialized `upstream/` valid for normal development and CI.
- Remove submodule checkout from unit, build, ordinary E2E, CLI, and publish
  workflows.
- Preserve Core coverage against a minimal set of real upstream pixels.
- Preserve required attribution and source metadata for those test pixels.
- Verify, without reading the submodule working tree, that the gitlink,
  runtime asset release, materialized asset manifest, and Core fixture bundle
  all identify the same upstream commit.
- Keep the current isolated, pinned upstream parity comparison.

## Non-goals

- Deleting the `upstream` gitlink or `.gitmodules`.
- Updating the pinned upstream commit or current asset release.
- Modifying, installing dependencies in, or generating files inside
  `upstream/`.
- Changing parity comparison semantics.
- Changing runtime composition, selection, export, or attribution behavior.
- Adding a dependency.
- Rewriting historical research, specs, or plans that accurately describe
  their original implementation context.

## Terminology

### Normal workflows

Normal workflows are repository clone, dependency installation, boundary
checks, typecheck, unit and integration tests, build, ordinary Web E2E, CLI
build/package/smoke, and publish validation. They must work without an
initialized submodule.

### Parity workflow

Parity is the explicit, higher-cost E2E gate that runs the toolkit and the
upstream application side by side. It is not part of ordinary local tests.
On pushes to `main` it runs after the unit job; on pull requests it runs when
Web, Core, or the workspace lockfile changes. It may materialize an isolated
upstream checkout because exercising the pinned upstream application is the
purpose of the job.

### Dormant submodule

The tracked tree retains the `upstream` gitlink and `.gitmodules`, but normal
clones do not initialize it. Developers may initialize it explicitly for
read-only research. Its presence or absence must not affect normal results.

## Architecture and Ownership

### Provenance pins

The design retains several representations of the upstream revision because
they serve different consumers:

- The `upstream` gitlink is the repository-level provenance pin.
- `asset-release.json.sourceSha` is the operational runtime asset pin.
- `assets/asset-manifest.json` records the source of materialized runtime
  assets.
- The Core fixture provenance file records the source of checked-in test
  pixels.

No representation silently overrides another. Repository validation requires
all four values to match. An upstream revision update is one coordinated
maintenance operation: the tracked gitlink, release configuration, and fixture
provenance change together, while the ignored materialized manifest is
regenerated from the updated release and verified in the same operation.

### Runtime assets

Production Web and CLI asset behavior remains unchanged. Runtime metadata,
sprites, and credits come from the local or pinned/cache-backed asset release
flow. No runtime fallback may read `upstream/`.

### Core test fixtures

Add a focused fixture bundle under:

```text
packages/core/test/fixtures/upstream-pixels/
  provenance.json
  CREDITS.csv
  spritesheets/...
```

The bundle contains only PNGs actually loaded by the existing real-pixel
compose and recolor tests. It preserves each PNG's path below `spritesheets/`
so the existing `CanvasAdapter` path behavior remains representative. It must
not become a general asset mirror.

`provenance.json` contains:

- the upstream repository identifier;
- the full 40-character source SHA;
- an entry for every fixture PNG with its upstream-relative path and SHA-256;
- the source path used to derive its credit metadata.

`CREDITS.csv` is the minimal attributed credit data accompanying the included
pixels and is derived from the pinned upstream/runtime credit source. The
real-pixel composition tests continue to assert that `ComposedSheet.credits`
is non-empty and corresponds to the selected layers. These fixtures remain
test-only and are excluded from Web and CLI publication outputs.

Core test metadata inputs continue to use the existing prepared `assets/`
flow. This change only replaces the direct real-pixel dependency on
`upstream/spritesheets`; it does not duplicate the full catalog or palette
snapshot into Core.

### Repository-only pin verifier

Add a repository validation command implemented with Node built-ins and Git;
it must not add a dependency. The verifier:

1. Runs `git ls-tree HEAD upstream` to obtain the gitlink SHA without
   initializing the submodule.
2. Reads `asset-release.json.sourceSha`.
3. Reads `assets/asset-manifest.json` after asset preparation.
4. Reads the Core fixture `provenance.json`.
5. Verifies that all source SHAs match.
6. Enumerates the fixture `spritesheets/` tree and requires an exact match with
   the provenance entries.
7. Recomputes every fixture SHA-256 and compares it with provenance.
8. Requires the fixture credit file to exist and be non-empty.

The verifier is source-repository tooling. It is not called by published CLI
runtime code and does not make npm packages depend on `.git`.

## Data Flow

### Normal CI and local validation

```text
toolkit checkout without submodules
  -> pnpm install
  -> prepare pinned runtime assets
  -> verify gitlink/release/manifest/fixture provenance
  -> boundary check
  -> typecheck
  -> unit and integration tests
```

Core real-pixel tests resolve image paths against the checked-in fixture root.
Nothing in this flow reads `upstream/`, invokes `git submodule update`, or
requires a populated submodule directory.

### Parity CI

```text
toolkit checkout without submodules
  -> read sourceRepository and sourceSha from asset-release.json
  -> shallow-check out that SHA into a runner temporary directory
  -> verify the temporary checkout HEAD
  -> install upstream dependencies in the temporary checkout
  -> start toolkit and upstream servers
  -> run Playwright parity comparison
```

The parity source helper continues to reject the tracked `upstream/` path. No
package installation or generated output is allowed inside the submodule.

### Optional maintainer research

A maintainer may explicitly initialize `upstream/` to inspect the pinned
source. This is optional and read-only. Documentation must not present it as a
setup prerequisite, test repair step, or runtime asset source.

## CI and Workflow Changes

- Remove `submodules: recursive` from the unit checkout.
- Keep ordinary E2E, CLI, and publish checkouts submodule-free.
- Run asset preparation before the repository pin verifier because the
  materialized manifest is one of its inputs.
- Run the pin verifier before validation that consumes prepared assets.
- Keep the parity job's isolated shallow checkout and existing HEAD check.
- Extend workflow tests so they assert that every normal job avoids recursive
  submodule checkout and that parity still uses the isolated directory.

The submodule-free CI checkout is the authoritative proof that normal flows do
not require `upstream/`. The implementation must not deinitialize or otherwise
mutate the developer's existing submodule working tree to simulate this state.

## Error Handling

### Normal workflows

Missing `upstream/` content is not an error. Normal code and tests must not
emit instructions to initialize the submodule. Existing missing-asset errors
continue to direct users to the pinned `prepare-assets` workflow.

### Pin mismatch

When provenance differs, the verifier reports each relevant label and actual
SHA: gitlink, release configuration, materialized manifest, and fixture
provenance. It exits unsuccessfully without modifying any file or gitlink.

### Fixture integrity

A missing, extra, or hash-mismatched fixture file fails verification before
real-pixel tests run. The error identifies the exact relative path and whether
it was missing, unexpected, or had a different digest. Missing or empty fixture
credits are also fatal.

Fixture regeneration is an explicit maintainer operation performed from a
read-only checkout of the newly pinned upstream source. The verifier never
downloads or rewrites fixtures automatically.

### Parity failures

CI retains separate named steps for upstream materialization, upstream
dependency installation, server startup, and Playwright comparison. Fetch or
environment failures therefore remain distinguishable from genuine parity
pixel mismatches.

## Documentation Changes

Update current contributor-facing and architecture documentation, including
README, `AGENTS.md`, its maintained `CLAUDE.md` mirror, onboarding, and
architecture guidance:

- Remove recursive clone and mandatory submodule initialization instructions.
- Define `upstream/` as optional, read-only provenance and reference material.
- State that normal workflows must work with an uninitialized submodule.
- Retain the prohibition on modification or dependency installation inside
  `upstream/`.
- Explain that parity uses a separate temporary checkout.
- Replace current source comments that incorrectly say Core tests read the
  submodule.

Historical documents remain unchanged unless they are used as current setup
instructions.

## Verification Strategy

### Verifier tests

Cover:

- all pins and fixture hashes matching;
- gitlink versus release SHA mismatch;
- release versus materialized manifest mismatch;
- release versus fixture provenance mismatch;
- missing materialized manifest;
- missing, unexpected, and hash-mismatched fixture PNGs;
- missing or empty fixture credits;
- malformed gitlink output.

Tests use temporary fixture repositories/data and do not modify `upstream/`.

### Core tests

- Preserve current real-pixel standard-sheet composition coverage.
- Preserve custom-animation/wheelchair real-pixel coverage.
- Preserve end-to-end real-pixel recolor coverage.
- Assert non-empty composition credits for selected real fixture layers.
- Confirm no Core test path resolves into the tracked `upstream/` directory.

### Workflow tests

- Assert the unit job checkout has no recursive submodule setting.
- Assert ordinary E2E, CLI, and publish workflows do not initialize
  submodules.
- Assert parity requires `LPC_UPSTREAM_PARITY_DIR` outside tracked
  `upstream/` and still verifies the isolated HEAD.

### Repository verification

Run the narrowest checks while implementing, followed by:

```bash
rtk pnpm check:boundaries
rtk pnpm typecheck
rtk pnpm test
rtk pnpm build
rtk pnpm --filter @lpc-toolkit/web test:e2e
```

Run the parity E2E suite with an isolated checkout of the pinned source. CI on
a checkout that does not initialize submodules must pass every normal job.

## Success Criteria

- A fresh non-recursive clone can install, typecheck, test, build, run ordinary
  E2E, package the CLI, and perform publish validation.
- Unit CI no longer downloads the tracked submodule.
- No normal source or test reads files below `upstream/`.
- Core retains its selected real-pixel compose/recolor coverage using minimal
  checked-in fixtures.
- Fixture pixels carry provenance, integrity hashes, and credit metadata.
- Gitlink, runtime release, materialized manifest, and fixture source SHA are
  checked for equality without initializing the submodule.
- Parity continues comparing against an isolated checkout of the same pinned
  commit.
- Existing runtime pixels, public selection behavior, and attribution/export
  semantics do not change.
