# CLI RC Cross-Platform Validation Design

## Context

The CLI package job currently runs its full validation matrix on Ubuntu, macOS,
and Windows for every CLI-affecting pull request and every push to `main`. This
provides broad platform coverage, but macOS and Windows runners are only needed
as release-candidate gates. Ordinary development should retain the faster
Ubuntu validation while preserving deliberate cross-platform checks before a
stable npm release.

The existing publish workflow also reacts to every `v*` tag. Release-candidate
tags must never reach its npm publish path.

## Goals

- Run ordinary CLI CI only on Ubuntu.
- Run the complete CLI package checks on macOS and Windows for release
  candidates.
- Support both automatic RC-tag runs and advisory manual cross-platform runs.
- Keep npm publication limited to exact stable-version tags.
- Preserve the manual `v0.1.0` bootstrap gate.

## Non-Goals

- Publishing RC packages to npm or assigning an npm prerelease dist-tag.
- Automatically creating RC or stable Git tags.
- Automatically proving that a stable release has a successful matching RC
  run. The release owner remains responsible for that manual gate.
- Changing npm Trusted Publisher configuration.
- Adding dependencies.

## Version and Release Model

The package keeps the intended stable version in `packages/cli/package.json`.
For example, an RC tag `v1.2.3-rc.1` validates a package whose version is
`1.2.3`; the package version is not temporarily changed to a prerelease
version.

An RC tag must use the exact form `vX.Y.Z-rc.N`, where every component is a
non-negative decimal integer with no leading zero unless the component is
exactly zero. Its `X.Y.Z` base must equal the CLI package version. After a
tag-triggered RC run succeeds on both macOS and Windows, the release owner may
manually create the matching stable tag, such as `v1.2.3`.

Manual workflow runs are advisory. They validate the selected ref on macOS and
Windows, but they do not count as the formal tagged RC gate.

## Workflow Design

### Ordinary CI

The existing `cli-package` job in `.github/workflows/ci.yml` stops using an OS
matrix and runs on `ubuntu-latest` only. It retains the existing change filter,
dependencies on the unit and change-detection jobs, and the full command
sequence:

1. Install the frozen pnpm workspace.
2. Typecheck `@lpc-toolkit/cli`.
3. Run CLI unit tests.
4. Build the CLI package.
5. Run the packed-package smoke test.

### Release-Candidate Validation

A separate `.github/workflows/cli-release-candidate.yml` workflow supports two
events:

- Tags matching the broad RC shape `v*.*.*-rc.*`; a verifier enforces the exact
  format and package-version match.
- `workflow_dispatch`; the operator chooses the ref through GitHub Actions.

The workflow uses a `macos-latest` and `windows-latest` matrix with
`fail-fast: false`, so a failure on one platform does not hide the other
platform's result. Each platform runs the same frozen install, typecheck, unit
test, build, and packed-package smoke sequence as ordinary CLI CI.

Only tag-triggered runs execute the RC tag verifier. Manual runs skip tag
validation and are identified as advisory by their event type. The workflow
has read-only repository permissions, no npm OIDC permission, and no publish
step.

### Stable Publishing

The publish workflow excludes tags containing a prerelease suffix before its
job can run. The existing stable tag verifier remains an independent defense:
the tag must exactly equal `v${packageJson.version}`.

Stable publication remains Ubuntu-only. Its existing boundary checks,
typecheck, tests, build, package smoke, real-asset smoke, npm OIDC publication,
and special `v0.1.0` publish skip remain unchanged. The exact stable tag
verifier runs after checkout and Node setup but before dependency installation,
so a stable tag mismatch fails early.

## Validation Components

Add a small Node script for RC tag validation and expose it through the CLI
package scripts. It reads `GITHUB_REF_NAME` and the CLI package version, accepts
only the exact `vX.Y.Z-rc.N` form, and fails with a specific message for either
malformed tags or base-version mismatches. It uses only Node built-ins.

Add unit coverage for:

- a valid RC tag whose base matches the package version;
- a malformed RC tag;
- an RC tag whose base does not match the package version;
- a stable tag passed to the RC verifier.

The existing context override test must compute its expected absolute path with
Node's platform-aware path utilities instead of hard-coding a POSIX absolute
path. This preserves the behavior assertion while allowing Windows drive-letter
and separator semantics.

## Failure Behavior

- An invalid or mismatched RC tag fails before cross-platform package checks.
- A macOS or Windows command failure fails that matrix job; the other job keeps
  running because `fail-fast` is disabled.
- A manual run never performs tag validation and never publishes.
- A prerelease tag never enters the stable publish job.
- A stable tag mismatch fails before npm publication.

## Verification

Implementation verification must include:

- CLI tests covering RC tag validation and the platform-aware context path.
- CLI typecheck, unit tests, build, and packed-package smoke locally.
- `pnpm check:boundaries` because CLI and workflow scripts are affected.
- Workflow review confirming ordinary CI is Ubuntu-only, RC validation is
  macOS/Windows, manual dispatch is enabled, and no RC path has publish or
  `id-token: write` permissions.

The first real macOS and Windows confirmation occurs when the RC workflow runs
on GitHub-hosted runners. Until then, local verification cannot prove those
runner-specific paths.

## Acceptance Criteria

- CLI-affecting pull requests no longer create macOS or Windows CLI package
  jobs.
- `vX.Y.Z-rc.N` produces macOS and Windows RC jobs and never publishes npm.
- A manually dispatched RC workflow produces the same two platform jobs but is
  treated as advisory.
- RC tags with malformed or mismatched versions fail clearly.
- Stable tags continue to use the existing publish pipeline, while prerelease
  tags cannot enter it.
- The current Windows context-path assertion is platform-correct.
