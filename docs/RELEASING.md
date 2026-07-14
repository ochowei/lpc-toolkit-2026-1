# CLI Release Guide

This is the maintainer runbook for release-candidate validation and publication
of `@lpc-toolkit/cli`.

## Authority and Scope

Creating or pushing tags, publishing to npm, changing registry configuration,
and configuring npm Trusted Publisher are external mutations. Perform them only
with explicit maintainer authorization. Ordinary implementation verification
must not create a release or change registry state.

Repository development uses pnpm. npm is used here only because npm is the
publication registry and because a clean public install must be verified from
that registry.

## Local Package and Tarball Verification

Exercise the unpublished workspace package before any release-candidate tag:

```sh
rtk pnpm --filter @lpc-toolkit/cli build
rtk node packages/cli/dist/index.js --help
rtk pnpm --filter @lpc-toolkit/cli test:package
rtk pnpm --filter @lpc-toolkit/cli pack --pack-destination /tmp
```

Install the resulting `/tmp/lpc-toolkit-cli-<version>.tgz` into a clean prefix
and verify `lpc-toolkit --help` plus one real asset-dependent command. The CLI
build vendors the local core and presets runtime output into `dist/`, so the
tarball does not require those workspace packages to be published separately.

## Release Candidate Validation

Before an RC run:

1. Set `packages/cli/package.json` to the intended release version, including
   any prerelease suffix.
2. Create a matching `v<version>-rc.<number>` tag. For example, package version
   `0.1.3-alpha-1` uses tag `v0.1.3-alpha-1-rc.1`.
3. Push the RC tag only after the version/tag verifier passes.
4. Wait for the **CLI Release Candidate** workflow on both `macos-latest` and
   `windows-latest`.

The workflow validates the full CLI package flow but never publishes npm. Both
platform jobs must pass before creating the corresponding stable tag.

Maintainers may launch **CLI Release Candidate** manually for a selected ref.
That run is advisory; it does not replace a successful run triggered by the
matching RC tag.

## One-Time npm Bootstrap

The first `v0.1.0` publication is a deliberate manual gate. After the tagged
`v0.1.0-rc.<number>` validation passes and publication is explicitly
authorized:

1. Create and push stable tag `v0.1.0`.
2. Confirm **Publish CLI** passes every verification step and skips only its
   publication step for `v0.1.0`.
3. From `packages/cli`, use the npm owner account with 2FA:

   ```sh
   rtk npm publish --access public
   ```

4. Install `@lpc-toolkit/cli@0.1.0` from the public registry into a clean
   prefix and verify help plus a real asset-dependent command.
5. Configure npm Trusted Publisher for repository
   `ochowei/lpc-toolkit-2026-1`, workflow `publish.yml`, with `npm publish` as
   the allowed action.

## Later OIDC Releases

For a later release:

1. Push the matching RC tag and wait for both platform jobs.
2. Manually push stable tag `v<version>` only after the RC succeeds.
3. Let **Publish CLI** verify the version, architecture boundaries, types,
   tests, packed install, and real assets.
4. Let the stable-tag workflow publish through npm OIDC.

After one later npm OIDC release succeeds, restrict traditional token-based
publication. Do not weaken the RC gate or use the read-only submodule as a
package or asset source to repair a release failure.

## Post-Publication Verification

Install the exact published version from the public registry into a clean
prefix. Verify:

- `lpc-toolkit --help` reports the expected package version and commands;
- a catalog or render command prepares or reuses the pinned verified asset
  cache;
- render output includes metadata and both TXT and CSV credit files;
- the package does not require unpublished workspace dependencies;
- the registry entry and release tag identify the same version.

Record the workflow URLs, published version, clean-install commands, and
results in the release notes or maintainer release record.
