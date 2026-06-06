# Release asset snapshot

## Status

- Date: 2026-06-05
- Status: Approved

## Problem

The repository currently tracks the full LPC runtime asset tree under
`assets/`. That tree is about 610 MB and contains roughly 146,000 files, most
of them PNG spritesheets. This makes normal Git operations heavier over time
and pushes static deploys toward large file-count and upload costs.

The web app already has a ZIP asset source that can load category ZIP archives
from `packages/web/public/zips/`. The missing piece is a clean source of truth
for those ZIP archives and the metadata required to build the catalog and
produce attribution.

## Decision

Use the GitHub release
`assets-v2026.06.05-initial` from
`ochowei/Universal-LPC-Spritesheet-Character-Generator` as the complete asset
snapshot for this repo.

The release snapshot contains:

- `zips/*.zip` for browser runtime spritesheet loading.
- `sheet_definitions/` for catalog construction.
- `palette_definitions/` for recolor palette data.
- `CREDITS.csv` for mandatory attribution.
- `asset-manifest.json` with `sourceSha`, file sizes, and SHA-256 digests.

The repo will stop tracking generated asset contents. It will keep only the
scripts and pinned release configuration needed to reproduce the local asset
workspace.

## Pinned Release

Add a small checked-in config file, such as `asset-release.json`, with:

- Release tag.
- Manifest URL.
- Manifest SHA-256.
- Tarball URL.
- Tarball SHA-256.
- Source repository.
- Source SHA.

For the approved initial release:

- Tag: `assets-v2026.06.05-initial`
- Source repository:
  `ochowei/Universal-LPC-Spritesheet-Character-Generator`
- Source SHA: `212abfd21493e9957bd556250ac538fa40fe1fc9`
- Tarball SHA-256:
  `dd603191c7185323013153b9b35f8d9b4987637d15d7e3195b9d320d9fbac6e7`
- Manifest SHA-256:
  `1cce0f4a5fd9b7ac72ae732f04bda39cf9096518ad067ad6009757fe83b9e72c`

## Asset Preparation

Add a `prepare-assets` script that is safe to run repeatedly.

The script first validates existing files. If all expected files exist and
match the manifest hashes, it exits without downloading. If any file is missing
or has a mismatched digest, it downloads the pinned manifest and tarball,
verifies both, then extracts the needed files.

Extraction targets:

- Verified `zips/sheet_definitions.zip` contents to
  `assets/sheet_definitions/`
- Verified `zips/palette_definitions.zip` contents to
  `assets/palette_definitions/`
- `CREDITS.csv` to `assets/CREDITS.csv`
- Runtime spritesheet `zips/*.zip` to `packages/web/public/zips/`, excluding
  metadata ZIPs that are only used to materialize `assets/`

The script must fail closed:

- The downloaded manifest hash must match the pinned manifest hash.
- The downloaded tarball hash must match the pinned tarball hash.
- The manifest `sourceSha` must match `asset-release.json.sourceSha`.
- Every extracted file listed in the manifest must match its manifest digest.
- `sheet_definitions.zip` and `palette_definitions.zip` must be verified before
  their JSON contents are expanded into `assets/`.
- Missing `CREDITS.csv` is a hard failure.

This keeps local development and CI fast when assets are already present while
still making stale or corrupt assets visible.

## Git Tracking

Generated asset contents must not be committed.

Ignore:

- `assets/`
- `packages/web/public/zips/`
- `packages/web/public/spritesheets/`

Remove tracked asset files from Git with non-destructive index removal during
implementation. Do not delete or modify `upstream/`.

## Build and Test Integration

`packages/web` build and test scripts should prepare assets before reading
catalog metadata or serving ZIP archives.

Update:

- `prebuild` to run `prepare-assets` and core build, then `vite build`.
- `pretest` to run `prepare-assets` before Vitest.
- `pretest:e2e` to run `prepare-assets` before Playwright.
- `pretest:e2e:parity` to run `prepare-assets` and the upstream parity baseline
  check before Playwright.

The existing `copy-spritesheets.ts` and `zip-assets.ts` scripts should no
longer be part of build or test paths. They may remain temporarily as reference
scripts if that keeps the implementation smaller.

Production should continue defaulting to `assetSource='zip'`.

## Upstream Submodule Role

Keep `upstream/` as a read-only parity baseline. It is not the runtime asset
source.

The upstream submodule commit must match the asset release source SHA whenever
parity tests run. Add a verification step for parity that checks:

- `asset-release.json.sourceSha`
- downloaded `asset-manifest.json.sourceSha`
- `git -C upstream rev-parse HEAD`

All three must be identical. If `upstream/` is missing or at a different commit,
the parity precheck fails with a clear message. The script must not update the
submodule automatically because `upstream/` is read-only by project rule.

Normal build and non-parity tests should not require `upstream/` to be checked
out.

## Data Flow

At build/test time:

1. `prepare-assets` reads the pinned release config.
2. It validates or downloads the release snapshot.
3. It materializes local generated assets under ignored paths.
4. Vite loads `assets/sheet_definitions/**/*.json` with the existing catalog
   glob.
5. Recolor code reads `assets/palette_definitions`.
6. Core attribution reads `assets/CREDITS.csv`.
7. Browser composition loads spritesheet PNGs from `packages/web/public/zips/`
   through the existing ZIP asset source.

## Error Handling

Errors should be specific and actionable:

- Network download failure: report the URL and suggest rerunning
  `prepare-assets`.
- Manifest hash mismatch: report expected and actual SHA-256.
- Tarball hash mismatch: report expected and actual SHA-256.
- Extracted file mismatch: report the manifest path and both hashes.
- Metadata ZIP extraction failure: report the ZIP path and target directory.
- Missing attribution file: report that `CREDITS.csv` is required for GPL and
  CC attribution compliance.
- Parity baseline mismatch: report the expected release `sourceSha` and the
  actual submodule HEAD.

Do not silently fall back to old local assets when verification fails.

## Testing

Unit tests should cover:

- Asset manifest validation.
- Cache-hit behavior where existing files are verified without download.
- Missing-file behavior that triggers download/extraction.
- SHA mismatch failure for manifest, tarball, and extracted files.
- Parity baseline check success and mismatch failure.

Integration verification:

- Remove generated `assets/` and `packages/web/public/zips/`.
- Run `pnpm --filter @lpc-toolkit/web prepare-assets`.
- Run `pnpm --filter @lpc-toolkit/web typecheck`.
- Run `pnpm --filter @lpc-toolkit/core test`.
- Run `pnpm --filter @lpc-toolkit/web test`.
- Run `pnpm --filter @lpc-toolkit/web build`.
- Run `pnpm --filter @lpc-toolkit/web test:e2e:parity` when `upstream/` is
  checked out at `212abfd21493e9957bd556250ac538fa40fe1fc9`.

Git verification:

- `git status --short` must show no generated asset files.
- `git ls-files assets` should be empty after tracked asset removal.
- `git ls-files packages/web/public/zips` should be empty.

## Out of Scope

- Changing the GPL-3.0-or-later license.
- Adding a backend, database, auth, or new hosting service.
- Runtime fetching of catalog definitions from GitHub.
- Automatically updating or modifying `upstream/`.
- Replacing the parity test baseline with remote upstream pages.
