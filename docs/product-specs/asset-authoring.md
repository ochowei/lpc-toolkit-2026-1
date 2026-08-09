---
capability: asset-authoring
title: Asset authoring
status: current
direction_objectives:
  - PD-CAP-INTERFACE-PRODUCT-001
  - PD-CAP-CONTRACT-CLI-001
  - PD-CAP-AUTHOR-PRODUCT-001
  - PD-CAP-GOVERNANCE-PRODUCT-001
  - PD-CAP-GUIDANCE-AGENT-001
  - PD-CAP-OPERATIONS-CLI-001
  - PD-CAP-DISCOVERY-PRODUCT-001
  - PD-CAP-ROUTING-PRODUCT-001
  - PD-CAP-ROUTING-PRODUCT-002
  - PD-CAP-AUTHOR-PRODUCT-002
  - PD-CAP-DISCOVERY-AGENT-001
  - PD-CAP-PROVIDER-AGENT-002
  - PD-CAP-AUTHOR-CLI-001
  - PD-CAP-CONTRACT-CLI-002
  - PD-CAP-IMPORT-CLI-001
  - PD-CAP-IMPORT-CLI-002
  - PD-CAP-RESUME-PRODUCT-001
  - PD-CAP-LIFECYCLE-AGENT-001
  - PD-CAP-LIFECYCLE-PRODUCT-001
  - PD-CAP-PACKAGE-PRODUCT-001
  - PD-CAP-INSTALL-PRODUCT-001
  - PD-OPT-AUTHOR-WEB-001
  - PD-OPT-AUTHOR-WEB-002
  - PD-OPT-PROVIDER-AGENT-001
  - PD-GRD-GENERATION-PRODUCT-001
  - PD-GRD-LIFECYCLE-PRODUCT-001
  - PD-GRD-INDEPENDENCE-WEB-001
  - PD-GRD-ROUTING-PRODUCT-001
  - PD-GRD-AUTHOR-PRODUCT-001
  - PD-GRD-CONSENT-AGENT-002
  - PD-GRD-INDEPENDENCE-PRODUCT-001
  - PD-GRD-AUTHORITY-WEB-001
  - PD-GRD-PROVIDER-PRODUCT-001
  - PD-GRD-PROVIDER-PRODUCT-002
  - PD-GRD-CONSENT-AGENT-003
  - PD-GRD-CONSENT-AGENT-004
  - PD-GRD-PROVIDER-PRODUCT-003
  - PD-GRD-PROVIDER-PRODUCT-004
  - PD-GRD-LIFECYCLE-PRODUCT-002
  - PD-GRD-LIFECYCLE-PROVIDER-001
  - PD-GRD-ATTR-PRODUCT-001
  - PD-GRD-RELEASE-PRODUCT-001
  - PD-GRD-AUTHORITY-PRODUCT-001
  - PD-GRD-RELEASE-PRODUCT-002
  - PD-GRD-LIFECYCLE-PRODUCT-003
  - PD-GRD-PACKAGE-PRODUCT-001
  - PD-GRD-INDEPENDENCE-PRODUCT-002
  - PD-GRD-LIFECYCLE-PRODUCT-004
  - PD-GRD-AUTOMATION-PRODUCT-001
  - PD-GRD-IP-PRODUCT-001
  - PD-GRD-OFFLINE-PRODUCT-001
  - PD-GRD-NETWORK-PRODUCT-001
  - PD-GRD-ATTR-PRODUCT-002
  - PD-GRD-ATTR-PRODUCT-003
  - PD-GRD-AUTHORITY-AGENT-001
  - PD-GRD-AUTHORITY-AGENT-002
  - PD-GRD-AUTHORITY-AGENT-003
  - PD-GRD-AUTHORITY-AGENT-004
  - PD-GRD-AUTHORITY-AGENT-005
  - PD-GRD-ATTR-PROVIDER-001
  - PD-GRD-PROVIDER-PRODUCT-005
  - PD-GRD-PROVIDER-CLI-001
  - PD-GRD-CLOUD-PRODUCT-001
  - PD-GRD-AUTOMATION-PRODUCT-002
  - PD-EVO-CONTRIB-PRODUCT-001
  - PD-EVO-TRANSPORT-AGENT-001
---

# Asset authoring

## Purpose

Asset authoring lets humans and Agents create one genuinely new attributed LPC
catalog asset after first checking whether an existing asset or animation
remediation can satisfy the request.

After explicit authoring consent, the public CLI manages a bounded local
workspace, provider-neutral drawing contract, strict candidate import,
validation, attributed preview, and separately authorized release lifecycle.
LPC Toolkit governs the contract and lifecycle but does not generate sprite
pixels.

## Scope

### Supported

- Catalog-first routing between existing-asset composition, animation
  remediation, and one genuinely new asset.
- One new attributed asset within supported LPC types, body types, animations,
  geometry, layers, and transparency rules.
- A strict authoring plan containing an exact execution scope and human-provided
  draft attribution.
- Explicit consent before creating an authoring workspace, source revision, or
  provider handoff.
- A managed local session and deterministic provider-neutral drawing contract.
- Optional, separately disclosed and consented external provider coordination.
- Strict candidate import, validation, attributed preview, drift reconciliation,
  and resumable local work.
- A review-ready endpoint followed by separately authorized acceptance,
  synchronization, packaging, inspection, and installation.
- CLI and Agent-guided authoring without depending on a hosted Web application.

### Excluded

- Creating a new item before searching the existing catalog.
- Replacing an existing item when composition or animation remediation satisfies
  the request.
- Custom skeletons, unsupported sheet layouts, unsupported geometry, or
  unsupported transparency behavior.
- Creating multiple unrelated assets in one authoring plan.
- Inventing author, source, license, permission, or warning-acceptance
  declarations.
- Bundled pixel generation, a CLI-owned provider registry or executor, provider
  credentials, or hidden network access.
- Treating provider provenance as attribution authorship, license authority,
  human acceptance, or release approval.
- Treating review-ready output as formal acceptance, release, installation,
  publication, or contribution.
- Automatic repository mutation, pull requests, uploads, publication, or asset
  sharing.
- A required Web application, repository clone, initialized `upstream/`, account,
  backend, cloud asset store, or synchronization service.
- Exact CLI wording, command ordering, temporary paths, internal module layout,
  or current delivery and publication channels.

## Requirements

### REQ-AUTH-001 — Search and route catalog-first

Before proposing a new asset, an Agent-guided workflow MUST search the existing
catalog. If existing catalog assets satisfy the request, it MUST offer sprite
composition. If an existing item only lacks required animation support, it MUST
offer animation remediation.

Crossing from new-asset discovery into another journey, or returning to new
authoring, MUST require explicit human confirmation.

#### Scenario: Route an existing catalog match away from new authoring

- GIVEN a request that may be satisfied by catalog assets
- WHEN the Agent searches and inspects the relevant catalog scope
- THEN it offers composition for a complete match or animation remediation for
  an animation-only gap and does not begin new-item mutation without explicit
  confirmation

##### Evidence

- Owner: `plugins/lpc-toolkit/skills/asset-authoring/SKILL.md`
- Owner: `plugins/lpc-toolkit/skills/asset-authoring/references/authoring-workflow.md`
- Owner: `packages/cli/src/catalog-commands.ts`
- Verification: `packages/cli/test/catalog-commands.test.ts` — `filters items by search, body type, animation, and license family`
- Verification: `packages/cli/test/plugin-contract.test.ts` — `uses one bounded asset-authoring contract through attributed preview`
- Verification: gap — No focused end-to-end test currently begins with catalog discovery and exercises all three consent-bound routing outcomes.

### REQ-AUTH-002 — Define one supported attributed new asset

A new-item plan MUST define one new asset identity and one pack identity with
exact supported type, body type, animation, source-path, geometry, layer, and
transparency scope. It MUST contain human-provided draft attribution or stop for
the missing author, source, and compatible-license decisions.

The plan MUST NOT invent credits or accept unsupported custom layouts.

#### Scenario: Normalize one bounded new-item plan

- GIVEN a concise creative brief, supported LPC scope, and human-provided draft
  credits
- WHEN the authoring plan is parsed
- THEN it contains one exact new-item execution scope and preserves the supplied
  attribution without inventing omitted identities

##### Evidence

- Owner: `packages/core/src/asset-authoring-schema.ts`
- Verification: `packages/core/test/asset-authoring-schema.test.ts` — `accepts the strict schema identity and normalizes a new-item plan`
- Verification: `packages/core/test/asset-authoring-schema.test.ts` — `does not invent draft credits when they are omitted`
- Verification: `packages/core/test/asset-authoring-schema.test.ts` — `reports all missing required intent while returning no normalized plan`
- Verification: `packages/core/test/asset-authoring-schema.test.ts` — `rejects unknown fields at every strict plan boundary`

### REQ-AUTH-003 — Require consent before authoring mutation

Before creating a workspace, authoring session, source PNG, or provider handoff,
an Agent MUST show the proposed new-item scope, attribution inputs, and authority
transition and MUST obtain explicit human confirmation.

Consent to author an asset MUST NOT imply consent to disclose data to a provider
or to accept, release, install, publish, or contribute the result.

#### Scenario: Stop before creating an authoring workspace

- GIVEN a catalog-first new-item proposal
- WHEN the human has not yet confirmed the proposed authoring scope
- THEN no workspace, session, source PNG, or provider handoff is created

##### Evidence

- Owner: `plugins/lpc-toolkit/skills/asset-authoring/SKILL.md`
- Owner: `plugins/lpc-toolkit/skills/asset-authoring/references/authoring-workflow.md`
- Verification: `plugins/lpc-toolkit/test/animation-asset-audit.test.mjs` — `routes mutating asset work through one consent-bound skill`
- Verification: `packages/cli/test/plugin-contract.test.ts` — `keeps authoring out of read-only and composition skills`

### REQ-AUTH-004 — Start one contained local authoring session

The CLI MUST start a managed local session from a strict new-item plan. It MUST
bind the session to one managed workspace and exact declared pack scope,
preserve actionable missing-human-input state, and reuse an unchanged scaffold
without silently replacing it.

Session or pack paths MUST NOT escape manager-owned roots.

#### Scenario: Start and rediscover a credited new-item session

- GIVEN a confirmed strict new-item plan and selected local workspace
- WHEN authoring is started or repeated without plan drift
- THEN the CLI creates or reuses the same bounded scaffold and exposes the
  session through status and discovery operations

##### Evidence

- Owner: `packages/cli/src/asset-authoring-commands.ts`
- Owner: `packages/cli/src/asset-authoring-session.ts`
- Verification: `packages/cli/test/asset-authoring-commands.test.ts` — `starts a credited new-item session, reuses the existing scaffold, and discovers its workspace`
- Verification: `packages/cli/test/asset-authoring-commands.test.ts` — `persists a needs-user-action session before missing author and license data`
- Verification: `packages/cli/test/asset-authoring-commands.test.ts` — `rejects a plan whose execution scope names more than its declared pack`
- Verification: `packages/cli/test/asset-authoring-session.test.ts` — `rejects session and pack paths that escape their manager-owned roots`

### REQ-AUTH-005 — Produce a provider-neutral drawing contract

The CLI MUST materialize a deterministic provider-neutral drawing contract for
the current plan. It MUST identify exact target IDs, supported geometry,
directions, source mappings, required and forbidden cells, transparent
templates, and non-importable guides.

The semantic contract binding MUST exclude provider runtime concerns and MUST
change when material geometry, source, baseline, or reference evidence changes.

#### Scenario: Materialize a new-item drawing contract

- GIVEN a current bounded new-item session
- WHEN its drawing contract is requested
- THEN the workspace receives deterministic contract JSON, exact transparent
  targets, and non-importable reference guides bound to the current plan

##### Evidence

- Owner: `packages/core/src/sprite-drawing-contract.ts`
- Owner: `packages/cli/src/asset-authoring-contract.ts`
- Verification: `packages/core/test/sprite-drawing-contract.test.ts` — `creates stable IDs and complete walk/idle PNG geometry with direction and source mappings`
- Verification: `packages/core/test/sprite-drawing-contract.test.ts` — `canonicalizes JSON property ordering and excludes provider/artifact runtime concerns`
- Verification: `packages/core/test/sprite-drawing-contract.test.ts` — `changes semantic digest input for geometry, source, baseline, and reference changes`
- Verification: `packages/cli/test/asset-authoring-contract.test.ts` — `publishes deterministic contract JSON, exact targets, transparent templates, and non-importable guides`

### REQ-AUTH-006 — Keep pixel production optional and separately consent-bound

The public CLI MUST NOT select, install, or execute a pixel-generation provider.
An Agent MAY coordinate an explicitly configured provider only after disclosing
its identity, exact scope, network or local execution, credentials, prompt,
references, assets, and metadata that would be shared, and obtaining separate
human consent.

Provider availability MUST NOT imply invocation permission. A provider result
MUST remain an untrusted candidate, and the session MUST remain resumable for an
external artist or another tool when no provider is used.

#### Scenario: Stage an explicitly consented provider result

- GIVEN a current drawing contract and an explicitly configured provider
- WHEN the human consents to the disclosed bounded handoff
- THEN the result is staged as a candidate without provider execution by the CLI
  or mutation of canonical source bytes

##### Evidence

- Owner: `packages/core/src/asset-provider-schema.ts`
- Owner: `packages/cli/src/asset-provider-commands.ts`
- Verification: `packages/core/test/asset-provider-schema.test.ts` — `projects deterministic discovery statuses without selecting a provider`
- Verification: `packages/cli/test/asset-provider-commands.test.ts` — `discovers explicitly supplied providers in stable order without preparing assets`
- Verification: `packages/cli/test/asset-provider-commands.test.ts` — `requires the consent file and explicit confirmation without mutating the session`
- Verification: `packages/cli/test/asset-provider-commands.test.ts` — `requires new consent for provider changes and refuses expanded scopes`
- Verification: `packages/cli/test/asset-provider-commands.test.ts` — `stages a valid provider result without importing canonical source bytes`

### REQ-AUTH-007 — Import only a current contract-compatible candidate

Candidate import MUST require an explicit target and current contract digest.
The CLI MUST inspect the actual candidate PNG and reject unknown or stale
targets, incompatible geometry or transparency, blank required cells, drawn
forbidden cells, and unauthorized replacement.

A failed import or correction MUST NOT replace the prior accepted target or
receipt.

#### Scenario: Reject a candidate outside its drawing contract

- GIVEN a current new-item contract
- WHEN a candidate has a stale digest, blank required cell, drawn forbidden
  cell, or unauthorized replacement
- THEN import fails with actionable evidence and preserves any prior accepted
  target and receipt

##### Evidence

- Owner: `packages/cli/src/asset-authoring-import.ts`
- Verification: `packages/cli/test/asset-authoring-import.test.ts` — `imports a valid real PNG through the public application seam`
- Verification: `packages/cli/test/asset-authoring-import.test.ts` — `rejects an unknown target and a digest that is not the current contract`
- Verification: `packages/cli/test/asset-authoring-import.test.ts` — `rejects blank required cells and drawn forbidden cells`
- Verification: `packages/cli/test/asset-authoring-import.test.ts` — `requires explicit replacement and an exact expected digest for a pre-existing target`
- Verification: `packages/cli/test/asset-authoring-import.test.ts` — `leaves the prior target and receipt exact when a correction candidate fails inspection`

### REQ-AUTH-008 — Validate current source and supported LPC constraints

Validation MUST inspect the current manifest and source PNG bytes for decoding,
geometry, required and forbidden cells, transparency, configured recolor rules,
catalog compatibility, scope, and attribution. It MUST reject whole-pack
generation switches and paths outside the owned input boundary.

Validation MUST NOT publish or change runtime assets.

#### Scenario: Report incompatible current source evidence

- GIVEN an imported candidate with a missing, corrupt, blank, or
  geometry-incompatible PNG
- WHEN the current pack is validated
- THEN validation returns deterministic actionable diagnostics without writing
  runtime assets

##### Evidence

- Owner: `packages/cli/src/asset-pack-validation.ts`
- Verification: `packages/cli/test/asset-pack-validation.test.ts` — `reports geometry, blank-cell, decode, missing, and incompatible-geometry diagnostics from inspected PNGs`
- Verification: `packages/cli/test/asset-pack-validation.test.ts` — `enforces configured recolor source ramps identically for directory and captured payloads`
- Verification: `packages/cli/test/asset-pack-validation.test.ts` — `rejects a whole-pack generation switch through public directory validation`
- Verification: `packages/cli/test/asset-pack-validation.test.ts` — `uses active baseline digests, emits acknowledgement templates, accepts matching acknowledgements, and does not write runtime assets`

### REQ-AUTH-009 — Produce an attributed review-ready preview

A review-ready new asset MUST have imported source, current validation, and a
current preview containing preview pixels, metadata, and matching TXT and CSV
credits.

Preview MUST validate current source again and MUST NOT publish the candidate
into active runtime state. Review-ready status MUST NOT claim human visual
acceptance or formal release.

#### Scenario: Reach the default Agent-guided endpoint

- GIVEN a contract-compatible imported new asset with current validation
- WHEN preview succeeds
- THEN the session exposes current preview pixels, metadata, TXT credits, and CSV
  credits and stops for human review without release claims

##### Evidence

- Owner: `packages/cli/src/asset-pack-preview.ts`
- Owner: `packages/cli/src/asset-authoring-session.ts`
- Verification: `packages/cli/test/asset-pack-preview.test.ts` — `freshly compiles the stable first local asset over linked state and publishes a default attributed preview`
- Verification: `packages/cli/test/asset-pack-preview.test.ts` — `validates the current source again before previewing`
- Verification: `packages/cli/test/asset-pack-preview.test.ts` — `writes preview credit CSV with escaped artist-controlled quotes and newlines`
- Verification: `packages/cli/test/asset-authoring-session-e2e.test.ts` — `completes a clean-workspace new-item session through drift, correction, and current preview`
- Verification: `packages/cli/test/plugin-contract.test.ts` — `documents the review-ready boundary and separate human release actions`

### REQ-AUTH-010 — Keep local authoring resumable and drift-aware

The selected managed local workspace MUST remain the formal source of truth.
Status and resume MUST reconcile manifest, contract, candidate, validation,
preview, provider, and lifecycle evidence without rewriting unchanged files.

Material drift MUST invalidate the affected downstream evidence while preserving
the last valid artifacts and receipts where safe. Normal outputs MUST remain
inside managed or explicitly selected destinations and MUST NOT use the
repository or `upstream/` as authoring output.

#### Scenario: Resume after candidate or preview drift

- GIVEN an existing new-item session
- WHEN current files differ from recorded evidence
- THEN status reports deterministic current, stale, conflict, or
  needs-user-action decisions and invalidates only affected downstream evidence

##### Evidence

- Owner: `packages/cli/src/asset-authoring-session.ts`
- Owner: `packages/cli/src/asset-authoring-commands.ts`
- Verification: `packages/cli/test/asset-authoring-session.test.ts` — `keeps status read-only and repeated resume idempotent when files are unchanged`
- Verification: `packages/cli/test/asset-authoring-session.test.ts` — `returns stable decisions for manifest, contract, PNG, validation, and preview drift`
- Verification: `packages/cli/test/asset-authoring-session.test.ts` — `invalidates a preview when its validation revision changes`
- Verification: `packages/cli/test/asset-authoring-commands.test.ts` — `turns manifest byte drift into a conflict and reconciles external or session state by digest`

### REQ-AUTH-011 — Keep human declarations and lifecycle gates separate

Warning acknowledgement, author and source declaration, license declaration,
preview acceptance, synchronization, formal packaging, archive inspection, and
installation MUST remain distinct current lifecycle gates.

An Agent MUST NOT invent a human identity, attribution author, source or license
authority, warning-acceptance reason, visual acceptance, or formal lifecycle
consent. Provider provenance MUST NOT satisfy any of those gates.

#### Scenario: Refuse formal packaging before human gates are current

- GIVEN a review-ready new asset without every required human declaration and
  acceptance receipt
- WHEN formal packaging is requested
- THEN the CLI refuses packaging and identifies the missing or stale lifecycle
  evidence

##### Evidence

- Owner: `packages/cli/src/asset-authoring-release-lifecycle.ts`
- Owner: `plugins/lpc-toolkit/skills/asset-authoring/SKILL.md`
- Verification: `packages/cli/test/asset-authoring-release.test.ts` — `refuses formal packaging before all release gates are current`
- Verification: `packages/cli/test/asset-authoring-release.test.ts` — `requires sync confirmation and records the committed manager generation`
- Verification: `packages/cli/test/plugin-contract.test.ts` — `documents the review-ready boundary and separate human release actions`

### REQ-AUTH-012 — Package and install exact attributed artifacts explicitly

After all separately confirmed release gates are current, the CLI MUST create an
immutable attributed formal archive and MUST inspect its exact bytes before it
can be installed into a local consumer workspace.

Installation MUST require separate explicit confirmation, copy the exact
inspected archive, preserve matching attribution, and record a verifiable
receipt. Packaging MUST NOT imply installation, upload, publication,
contribution, or automatic repository mutation, and the portable archive MUST
NOT replace the original authoring workspace.

#### Scenario: Install an exact inspected attributed archive

- GIVEN a formally packaged archive with current inspection evidence
- WHEN the human explicitly confirms installation into an initialized consumer
  workspace
- THEN the exact inspected bytes and matching attribution are installed and a
  byte-verifiable receipt is recorded

##### Evidence

- Owner: `packages/cli/src/asset-authoring-release-lifecycle.ts`
- Owner: `packages/cli/src/asset-release.ts`
- Verification: `packages/cli/test/asset-authoring-release.test.ts` — `publishes and inspects the exact formal archive after explicit confirmation`
- Verification: `packages/cli/test/asset-authoring-release.test.ts` — `requires explicit confirmation before installing the inspected archive into a consumer workspace`
- Verification: `packages/cli/test/asset-authoring-release.test.ts` — `installs the exact inspected archive, records verified attribution, and is byte-idempotent`
- Verification: `packages/cli/test/asset-authoring-release.test.ts` — `verifies copied archive and provenance bytes from a separate consumer root`
