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
pnpm --filter @lpc-toolkit/cli build
node packages/cli/dist/index.js --help
pnpm --filter @lpc-toolkit/cli test:package
pnpm --filter @lpc-toolkit/cli pack --pack-destination /tmp
```

The CLI build vendors the shared `asset-pack-format` package and the embedded
Web bundle; those are release contents, not separately published packages.
The packed smoke must pass its draft gate: a `status: "draft"` archive is
reported by inspect with exit 1 and refused by install without mutating the
consumer workspace. The browser Workbench may produce that draft while
repairing an existing archive; only a formal archive is a lifecycle input.

Install the resulting tarball into a clean prefix. Verify `lpc-toolkit --help`
and one real asset-dependent command; the package must not require unpublished
workspace dependencies. For a full render, verify the offline `.viewer.html`
beside its sheet, metadata, and TXT/CSV credits, and verify ZIP output contains
the same portable attributed set.

### Capability and schema release gate

When a release includes the authoring foundation or changes its public
capability advertisement, run the built executable before tagging:

```sh
node packages/cli/dist/index.js capabilities --json
node packages/cli/dist/index.js asset authoring --help
node --test scripts/verify-codex-plugin.test.mjs
pnpm verify:plugin
```

The capability response must retain the exact shipped identifiers
`asset-authoring-session.v1`, `sprite-drawing-contract.v1`,
`asset-authoring-candidate-import.v1`, `asset-authoring-recovery.v1`, and
`asset-authoring-release.v1`, plus the six versioned authoring/release schemas.
Check that the CLI help lists `start`, `status`, `resume`, `contract`, `import`,
`validate`, `preview`, `acknowledge`, `declare`, `accept-preview`, and
`reconcile-manifest`, and that the CLI README, root README, landing copy, and
plugin compatibility references describe the same boundary. Plugin `0.2.1`
must continue to document CLI range `>=0.2.0 <0.3.0`; the plugin intentionally
does not claim or invoke the authoring-session release capability.

Phase 1's release boundary is still session evidence, not archive publication.
The packed smoke must show `releaseGates.releaseReady: true` only after the
exact warning acknowledgement, explicit declaration, and exact
`--preview-digest --confirm` acceptance. It must preserve the PNG,
`preview:metadata`, `preview:credits_txt`, and `preview:credits_csv` digests,
and prove that a changed artifact or source makes the downstream receipt stale
without mutating the last valid session bytes. Formal `asset pack`,
`asset inspect`, and `asset install` remain separate later release gates.

The packed CLI smoke remains the release proof for the public contract. In a
clean workspace, it must discover capabilities, create a strict-plan session,
materialize the drawing contract, import a real transparent PNG through the
digest-bound trust boundary, validate, preview with PNG/metadata/TXT/CSV
credits, and recover from interruption and external drift. It must also prove
that checked-in assets, the managed base cache, generated overlay, installed
source, unowned output, and dormant `upstream/` remain untouched. No provider
invocation or Web bridge is part of this release gate.

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
- a full render whose sheet, offline `.viewer.html`, metadata, and TXT/CSV
  credits remain together;
- ZIP render output containing the same portable attributed set after
  extraction;
- independence from unpublished workspace packages; and
- equality between registry version, package version, and release tag.

For a capability release, add these post-publication checks from the clean
prefix:

```sh
lpc-toolkit capabilities --json
lpc-toolkit --help
lpc-toolkit catalog audit-animations --animation walk --json
lpc-toolkit asset workspace init ./authoring-smoke
```

Then run the packed authoring smoke's fixture plan through
`asset authoring start`, `contract`, `import`, `validate`, and `preview`, then
exercise `acknowledge`, `declare`, and `accept-preview` with explicit human
inputs. Check that every returned artifact path stays inside the workspace, the
four preview artifacts retain matching attribution, a correction after
observed PNG drift requires the exact target digest, and release readiness is
reported only after the final preview digest is confirmed. Finally use `asset pack` for formal
archive publication and verify that a separate consumer still needs
`asset inspect` and `asset install`; a session response is not a release
archive. Record the capability JSON, plugin version/range, package version,
published version, commands, and PASS/FAIL results with the workflow URLs.

Record workflow URLs, the published version, commands, and PASS/FAIL results.
Never delete or retarget a pushed tag, overwrite a published npm version,
change registry settings, or introduce an npm token to repair a failure. Stop
and record the immutable external state before proposing recovery.
