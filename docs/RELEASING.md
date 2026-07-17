# CLI Release Guide

This is the repository-owned maintainer runbook for releasing
`@lpc-toolkit/cli`. The workflows and tag-verifier scripts are the executable
source of truth; this guide records the required gates and human decisions.

## Authority

Creating or pushing tags, publishing to npm, and changing registry or Trusted
Publisher settings require explicit maintainer authorization. Repository work
uses pnpm; npm is used only for authorized registry publication and public
install verification.

## Pre-Release Verification

Before creating an RC tag, exercise the unpublished package:

```sh
rtk pnpm --filter @lpc-toolkit/cli build
rtk node packages/cli/dist/index.js --help
rtk pnpm --filter @lpc-toolkit/cli test:package
rtk pnpm --filter @lpc-toolkit/cli pack --pack-destination /tmp
```

Install the resulting tarball into a clean prefix. Verify `lpc-toolkit --help`
and one real asset-dependent command; the package must not require unpublished
workspace dependencies.

## Release Candidate

1. Set `packages/cli/package.json` to the intended version, including any
   prerelease suffix.
2. Verify a matching `v<version>-rc.<number>` tag with the repository RC tag
   verifier before pushing it.
3. Push the authorized RC tag and wait for the tag-triggered
   **CLI Release Candidate** workflow on both `macos-latest` and
   `windows-latest`.

The RC workflow validates the package but never publishes npm. A manually
dispatched run is advisory and does not replace a successful tagged run.

## Stable Publication

After the tagged RC passes, obtain separate authorization and push the matching
stable `v<version>` tag. The **Publish CLI** workflow verifies the release tag,
boundaries, types, tests, packed install, and real assets before publishing
through npm OIDC.

`v0.1.0` used a one-time manual bootstrap and remains excluded from the OIDC
publish step for historical compatibility. Current releases must not repeat
that bootstrap.

## Public Verification and Failure Handling

Install the exact published version into a clean prefix and verify:

- help and version output;
- a real catalog or render command using the pinned verified asset cache;
- metadata plus TXT and CSV credit files;
- independence from unpublished workspace packages; and
- equality between registry version, package version, and release tag.

Record workflow URLs, the published version, commands, and PASS/FAIL results.
Never delete or retarget a pushed tag, overwrite a published npm version,
change registry settings, or introduce an npm token to repair a failure. Stop
and record the immutable external state before proposing recovery.
