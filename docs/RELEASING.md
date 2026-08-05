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
`asset-authoring-release.v1`, `asset-authoring-draft-recovery.v1`, and
`asset-authoring-consumer-install.v1`, and
`asset-authoring-release-provenance.v1`, plus the twelve versioned authoring/release
schemas, including
`lpc-toolkit.asset-authoring-formal-archive-receipt.v1` and
`lpc-toolkit.asset-authoring-archive-inspection-receipt.v1` and
`lpc-toolkit.asset-authoring-install-receipt.v1`,
`lpc-toolkit.asset-release-provenance.v1`, and
`lpc-toolkit.asset-release-provenance-verification.v1`.
Check that the CLI help lists `start`, `status`, `resume`, `contract`, `import`,
`validate`, `preview`, `acknowledge`, `declare`, `accept-preview`, and
`reconcile-manifest`, `draft`, `sync`, `pack`, `inspect`, `provenance`, and
`install`, plus public `asset provenance verify`, and that the CLI README, root README, landing copy, and
plugin compatibility references describe the same boundary. Plugin `0.2.1`
must continue to document CLI range `>=0.2.0 <0.3.0`; the plugin intentionally
does not claim or invoke the authoring-session release, draft-recovery,
formal-pack, formal-inspect, manager-sync, consumer-install, or release-provenance
capabilities.

Phase 1's release boundary is still session evidence, not archive publication.
The packed smoke must show `releaseGates.releaseReady: true` only after the
exact warning acknowledgement, explicit declaration, and exact
`--preview-digest --confirm` acceptance. It must preserve the PNG,
`preview:metadata`, `preview:credits_txt`, and `preview:credits_csv` digests,
and prove that a changed artifact or source makes the downstream receipt stale
without mutating the last valid session bytes. Formal `asset pack`,
`asset inspect`, and `asset install` remain separate later release gates.

Phase 2 adds two additional packed-smoke assertions. `asset authoring draft`
must produce deterministic, session-contained bytes with a digest-bound
`draftArchive` receipt; the existing public inspect command must report
`status: "draft"` and `asset_pack_draft`, while install must reject before any
consumer staging or registry mutation. `asset authoring sync` must return one
confirmation action without `--confirm`, then call the existing linked-sync
transaction only with explicit confirmation and record the committed registry,
compile, marker, and generated-output digests in `syncReceipt`. Repeating an
unchanged sync is a no-op. Source, manifest, registry, marker, output, or
transaction drift must preserve the previous receipt as stale evidence and
exercise the existing doctor/recovery path. These receipts are not formal pack,
inspect, or consumer-install receipts.

Phase 3 adds the formal session boundary to the packed release proof. After
the validation, declaration, preview-acceptance, and source gates are current,
`asset authoring pack --session <id> --confirm` must publish a deterministic
non-draft archive only below the session-owned `release-artifacts/` root and
record `formalArchiveReceipt` after digest re-verification. The no-confirm path
must return one confirmation action without writing the archive. The following
`asset authoring inspect --session <id> --archive <archive>` call must use the
existing inspection authority, remain read-only, and record `inspectionReceipt`
only for the exact formal archive digest. Mutated archive bytes and valid
copied archives must preserve the prior receipt and expose stale/mismatch
recovery; a new contained output is the explicit recovery path. Formal pack and
inspect never perform consumer installation.

Phase 4 adds the optional consumer activation gate. The packed smoke must use
the exact archive digest recorded by session inspection, refuse an uninitialized
or protected consumer path, return a confirmation action without `--confirm`,
and record `installationReceipt` only after the existing transactional install
commits and verifies the installed payload, registry, generated output, and
matching `CREDITS.csv`. Repeating an unchanged install must preserve the
receipt and artist/archive bytes; consumer output drift must become stale
evidence and remain available to the existing doctor/recovery policy.

D1 adds an optional external generation-provenance gate after exact formal pack
and inspect. `asset authoring provenance --session <id> --confirm` may publish a
canonical companion receipt beside the archive, optionally from a strict
`--records` array. The default output and any explicit `--output` must remain
inside the session `release-artifacts/` root; unchanged publication is
idempotent, while changed projections require a new contained path and preserve
the previous receipt. `asset provenance verify --archive <archive>
--provenance <receipt>` verifies copied exact archive, manifest, content, source,
and projection bytes without a workspace or session mutation. It reports
declaration/preview digests as bound evidence rather than recreated human
approval. A missing companion does not affect ordinary inspect/install, and the
receipt is never an archive member or installed input.

The packed CLI smoke remains the release proof for the public contract. In a
clean workspace, it must discover capabilities, create a strict-plan session,
materialize the drawing contract, import a real transparent PNG through the
digest-bound trust boundary, validate, preview with PNG/metadata/TXT/CSV
credits, and recover from interruption and external drift. It must also prove
that checked-in assets, the managed base cache, generated overlay, installed
source, unowned output, and dormant `upstream/` remain untouched. No provider
invocation or Web bridge is part of this release gate. It also runs formal pack,
exact inspect, provenance generation, copied-archive verification from a clean
consumer root, missing-receipt refusal, and ordinary-install compatibility.

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
archive publication, exact session inspection, and the optional explicit
`asset authoring install --session <id> --archive <archive>
--consumer-workspace <directory> --confirm` flow. Verify the consumer receipt,
installed catalog/render attribution, matching `CREDITS.csv`, doctor health,
idempotent retry, and that artist/archive/protected sentinel bytes are
unchanged. A session response is not a release archive. Record the capability JSON, plugin version/range, package version,
published version, commands, and PASS/FAIL results with the workflow URLs.

For a release that publishes generation provenance, copy the exact formal
archive and its companion receipt into a clean consumer root and run:

```sh
lpc-toolkit asset provenance verify --archive ./release.lpc-assets.zip --provenance ./release-provenance.json --json
```

Record the verification response and confirm that ordinary install still
consumes only the formal archive.

Record workflow URLs, the published version, commands, and PASS/FAIL results.
Never delete or retarget a pushed tag, overwrite a published npm version,
change registry settings, or introduce an npm token to repair a failure. Stop
and record the immutable external state before proposing recovery.
