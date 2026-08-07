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
`asset-authoring-release-provenance.v1`, `asset-authoring-web-cli-handoff.v1`,
and `asset-authoring-web-cli-recovery.v1`, and must advertise the D2 contract
identifiers `asset-authoring-provider-discovery.v1`,
`asset-authoring-provider-invocation.v1`, and
`agent-integration-packaging.v1` only when their public seams and packed tests
are complete. The schema response must retain the existing authoring/release
schemas, including
`lpc-toolkit.asset-authoring-formal-archive-receipt.v1` and
`lpc-toolkit.asset-authoring-archive-inspection-receipt.v1` and
`lpc-toolkit.asset-authoring-install-receipt.v1`,
`lpc-toolkit.asset-release-provenance.v1`, and
`lpc-toolkit.asset-release-provenance-verification.v1`, and must include
`lpc-toolkit.web-cli-handoff.v1` and
`lpc-toolkit.asset-authoring-web-handoff-receipt.v1`, plus
`lpc-toolkit.asset-provider-descriptor.v1`,
`lpc-toolkit.asset-provider-discovery.v1`,
`lpc-toolkit.asset-provider-invocation.v1`,
`lpc-toolkit.asset-provider-result.v1`,
`lpc-toolkit.asset-provider-refusal.v1`, and
`lpc-toolkit.agent-integration-manifest.v1`.
The D4 local distribution contract additionally advertises
`asset-pack-remote-distribution.v1`, `asset-pack-signature-verification.v1`,
`asset-pack-global-install.v1`, and `asset-pack-npm-publication.v1`, plus
`lpc-toolkit.asset-distribution-release.v1`,
`lpc-toolkit.asset-distribution-verification.v1`, and
`lpc-toolkit.asset-distribution-trust-policy.v1`, only when the local fake
adapter, refusal, response, and packed acceptance tests are complete.
The D5 deterministic authoring-intelligence contract additionally advertises
`asset-authoring-intelligence-routing.v1`,
`asset-authoring-deterministic-operations.v1`,
`asset-authoring-custom-geometry.v1`, and
`asset-authoring-multi-layer-candidates.v1`, plus
`lpc-toolkit.asset-authoring-intelligence-request.v1`,
`lpc-toolkit.asset-authoring-intelligence-route.v1`,
`lpc-toolkit.asset-authoring-operation-plan.v1`,
`lpc-toolkit.asset-authoring-candidate-operation.v1`,
`lpc-toolkit.asset-authoring-candidate-set.v1`,
`lpc-toolkit.asset-authoring-intelligence-receipt.v1`,
`lpc-toolkit.asset-authoring-intelligence-consent.v1`, and
`lpc-toolkit.sprite-drawing-contract.v2`, only when the deterministic route,
consent, staging, receipt, recovery, and compatibility tests are complete.
Check that the CLI help lists `start`, `status`, `resume`, `contract`, `import`,
`validate`, `preview`, `acknowledge`, `declare`, `accept-preview`, and
`reconcile-manifest`, `draft`, `sync`, `pack`, `inspect`, `provenance`, and
`install`, plus the `handoff inspect`, `handoff import`, and `handoff recover`
commands and the provider `discover`, `preflight`, `handoff`, and `result`
commands, `agent integration check`, public `asset provenance verify`, and
`intelligence route`, `intelligence stage`, and `intelligence recover`.
Help must explain explicit consent, stable refusal/recovery actions, logical
session candidate staging, the two-file Web-to-CLI handoff, and the existing
`asset authoring import`, validation, preview, and release boundary. The CLI
README, root README, landing copy, architecture, engineering, and this runbook
must describe the same provider-neutral, deterministic D5, and one-way local-file
boundaries. D5 documentation must not imply model invocation, automatic import,
automatic publication, or persistent browser authoring state.
The D6 cross-pack conflict contract additionally advertises
`asset-pack-conflict-resolution.v1` and the schemas
`lpc-toolkit.asset-pack-conflict.v1`,
`lpc-toolkit.asset-pack-conflict-selection.v1`,
`lpc-toolkit.asset-pack-conflict-policy.v1`,
`lpc-toolkit.asset-pack-resolution.v1`, and
`lpc-toolkit.asset-pack-conflict-audit.v1` only when the local conflict parser,
eligibility/refusal, explicit selection, attribution, protected-root recovery,
receipt tamper, and CLI acceptance tests are complete. The help must list
`asset conflict inspect`, `asset conflict resolve`, and
`asset conflict recover`, and must say that inspect is read-only, no automatic
winner is inferred, resolve requires explicit selection and `--confirm`, and
existing import/validation/preview/human-review/release gates remain
downstream. D6 evidence is session/workspace evidence until a separately
versioned D1 `cross-pack-merge` contract is approved; the current D1 parser is
not extended by a release. No D6 release check may contact a registry or
marketplace, create a key, call `npm publish`, use a backend/auth service, or
write persistent browser authoring state. The plugin deliberately has no D6
skill or command contract.
Plugin `0.3.0` must continue to document CLI range `>=0.2.0 <0.3.0`. Read the
plugin version from `.codex-plugin/plugin.json` and the CLI range from
`plugins/lpc-toolkit/compatibility.json`; the shared checker, README surfaces,
and tests must project those values. The asset-authoring skill may coordinate
D2 preflight and a consent-bound handoff, but it does not make the CLI a
provider, bypass candidate import, or turn a review-ready preview into release
approval. D3 Web handoff remains outside the plugin workflow.

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

### D2 provider-neutral release gate

D2 release verification covers only the public contract and session trust
boundary. In a clean packed install, run `agent integration check` against a
local compatible manifest, pass explicitly supplied descriptors through
discovery and read-only preflight, verify that missing `--confirm` returns one
consent action, and persist a handoff only for an unchanged explicit scope.
Use a deterministic fake adapter and real fixture PNG in tests to exercise
result re-digestion, refusal recovery, session-owned candidate staging, and
the next `asset authoring import` action. Verify that subsequent validation,
attributed preview, human declaration, preview acceptance, formal pack,
inspection, and installation still use their existing authorities.

The release gate must also prove required capability/CLI-range refusal,
optional external-author fallback, network/credential/protected-root refusal,
stale/cancelled/timed-out result recovery, additive provider session receipts,
and D1 `provider-output` projection without private paths or payloads. No real
provider, provider registry, credential, network service, Agent skill, Web
bridge, persistent browser state, archive member, manifest field, or npm
publication is part of D2. The plugin remains on its separately reviewed
character and animation-audit contract.

The packed CLI smoke remains the release proof for the public contract. In a
clean workspace, it must discover capabilities, create a strict-plan session,
materialize the drawing contract, import a real transparent PNG through the
digest-bound trust boundary, validate, preview with PNG/metadata/TXT/CSV
credits, and recover from interruption and external drift. It must also prove
that checked-in assets, the managed base cache, generated overlay, installed
source, unowned output, and dormant `upstream/` remain untouched. No real
provider invocation, credential, network service, or Web bridge is part of this
release gate; provider result coverage uses only a deterministic local fixture.
It also runs formal pack,
exact inspect, provenance generation, copied-archive verification from a clean
consumer root, missing-receipt refusal, and ordinary-install compatibility.

### D3 Web-to-CLI release gate

D3 release verification uses only local archive, sidecar, attach-plan, and
workspace fixtures. The Web export must prove that one unchanged in-memory
revision produces the existing archive and strict
`lpc-toolkit.web-cli-handoff.v1` sidecar, with no browser persistence, upload,
backend, or reverse live session. The CLI smoke must then prove read-only
`handoff inspect`, stale/blocked refusal before mutation, explicit plan and
`--confirm` import, separate
`lpc-toolkit.asset-authoring-web-handoff-receipt.v1` creation, repeat-import
idempotency, and exact `recover resume|discard` ownership.

The smoke must assert that the handoff does not alter the existing v1 session
file or D1 provenance, D2 provider, validation, preview, candidate-import,
attribution, or release authority. `asset authoring status` may project only
bounded optional `webHandoff` data; old sessions without the sidecar remain
readable, malformed sidecars are blocked, and stale handoff evidence cannot
make `releaseGates.releaseReady` true or replace candidate import. Use the
focused local test map before the packed CLI smoke:

```sh
pnpm --filter @lpc-toolkit/core test -- asset-authoring-web-handoff.test.ts
pnpm --filter @lpc-toolkit/web test -- asset-pack-download.test.ts asset-pack-download-bar.test.tsx asset-pack-web-cli-handoff.test.ts asset-pack-workbench-shell.test.tsx
pnpm --filter @lpc-toolkit/cli test -- asset-authoring-web-cli-handoff.test.ts d3-web-cli-fixtures.test.ts command-spec.test.ts main-json.test.ts main-human.test.ts response.test.ts
```

No real registry, marketplace, auth service, key, signing operation, npm
publication, provider, or external service is part of D3 verification.

### D4 local distribution and trust gate

D4's public `asset distribution` commands are intentionally limited to
caller-supplied local fixtures in this release cycle. Before any future
external publication is considered, verify the exact record/archive capture,
detached signature projection, local trust policy, namespace/key lifecycle,
matching credits/license evidence, optional D1/D2/D3 bindings, and the
existing archive inspection/release gates. Then exercise the public response
contract:

```sh
pnpm --filter @lpc-toolkit/cli test -- asset-distribution-command.test.ts asset-distribution-transport.test.ts asset-distribution-release-evidence.test.ts asset-distribution-global-install.test.ts asset-distribution-package.test.ts asset-distribution-audit.test.ts command-spec.test.ts main-json.test.ts main-human.test.ts
pnpm --filter @lpc-toolkit/cli run typecheck
pnpm --filter @lpc-toolkit/cli build
pnpm check:boundaries
pnpm verify:cli-docs-policy
pnpm verify:plugin
pnpm verify
```

`asset distribution inspect|verify|fetch` reads only explicit local record and
archive fixtures. `install` without `--confirm` must return
`needs-user-action`; confirmation may delegate only to the existing installer
for an explicitly named `temporary-consumer-prefix`, while
`system-wide-prefix` is refused. `rollback` is an explicit prior verified
selection with `mutation: none`. `post-publication` verifies only a fake npm or
fake marketplace receipt and reports `fake-receipt-verified`, never real
publication. No D4 verification may call `npm publish`, create/enroll a key,
contact a registry/marketplace, use credentials, or mutate a system-wide
prefix. The existing v1 archive/manifest/install behavior and all attribution,
consent, validation, preview, release, provenance, provider, and handoff gates
remain unchanged.

### D5 deterministic authoring intelligence release gate

D5 is a pre-import candidate preparation boundary. A release candidate may use
the route output and consent-bound staged bytes only as inputs to the existing
public `asset authoring import` command. Validation, attributed preview, human
review, release declaration, provenance, archive, distribution, and installation
remain downstream gates. Identical operation/input/output bytes are a verified
no-op; stale contracts, changed bytes, missing attribution evidence, and
tampered receipts must refuse or return an explicit recovery action. Multi-layer
outputs remain independently digest-bound and D6 conflict resolution is out of
scope.

Run the local D5 acceptance map:

```sh
pnpm --filter @lpc-toolkit/core test -- asset-authoring-intelligence.test.ts asset-release-provenance-schema.test.ts
pnpm --filter @lpc-toolkit/cli test -- asset-authoring-intelligence.test.ts asset-authoring-import.test.ts asset-authoring-receipts.test.ts asset-authoring-session-e2e.test.ts command-spec.test.ts main-json.test.ts main-assets.test.ts
pnpm --filter @lpc-toolkit/cli run typecheck
pnpm check:boundaries
pnpm verify:cli-docs-policy
pnpm verify:plugin
pnpm verify
```

These tests use only checked-in/local fixtures and fake session evidence. They
must not invoke a model or provider, contact a backend, use auth or network
access, create signing keys, contact a registry or marketplace, call
`npm publish`, mutate a system-wide prefix, or create persistent browser
authoring state. The existing v1 archive, manifest, install, plugin,
attribution, consent, preview, release, and D1–D4 trust boundaries remain
unchanged.

### D6 cross-pack conflict resolution release gate

D6 is a review-and-staging boundary, not a publication or installation step.
The release candidate must exercise the bounded Core conflict and selection
parsers, canonical identity independent of discovery order, equivalent and
incompatible contenders, explicit `retain-current`, `select-contender`,
`merge-disjoint`, and `decline` outcomes, stale baseline refusal, complete
attribution evidence, D2/D4/D5 evidence retention, protected-root containment,
receipt tamper detection, and exact resume/discard recovery:

```sh
pnpm --filter @lpc-toolkit/core test -- asset-pack-conflict.test.ts
pnpm --filter @lpc-toolkit/core run typecheck
pnpm --filter @lpc-toolkit/cli test -- asset-pack-conflict.test.ts command-spec.test.ts main-json.test.ts
pnpm --filter @lpc-toolkit/cli run typecheck
pnpm check:boundaries
pnpm verify:cli-docs-policy
pnpm verify:plugin
```

The CLI acceptance must prove `asset conflict inspect` is read-only,
`resolve` requires a complete user selection and `--confirm`, and `recover`
can mutate only the owned D6 staging receipt. It must not import a candidate,
rewrite source or `CREDITS.csv`, publish an archive, modify a registry, install
output, accept a preview, declare a release, sign, contact a registry or
marketplace, create a key, call `npm publish`, use backend/auth/network state,
or persist browser authoring state. Existing v1 archive/manifest/install/plugin
behavior, D1 parser, D2 provider evidence, D4 trust evidence, D5 candidate
import, attribution, consent, validation, preview, human review, and release
gates remain authoritative. Until a separately reviewed D1 capability accepts
`cross-pack-merge`, the D6 receipt is not a formal release input.

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

For a D2-capable release, also run the offline Agent manifest checker and
provider discovery/preflight with checked-in local JSON fixtures. Confirm that
the checker reports optional capability fallback, discovery does not enumerate
or invoke anything, and preflight leaves the session unchanged. Do not supply
credentials or enable network access in post-publication verification.

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
