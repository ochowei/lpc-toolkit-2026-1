---
capability: animation-remediation
title: Animation remediation
status: current
direction_objectives:
  - PD-CAP-INTERFACE-PRODUCT-001
  - PD-CAP-CONTRACT-CLI-001
  - PD-CAP-AUTHOR-PRODUCT-001
  - PD-CAP-GOVERNANCE-PRODUCT-001
  - PD-CAP-GUIDANCE-AGENT-001
  - PD-CAP-OPERATIONS-CLI-001
  - PD-CAP-AUDIT-PRODUCT-001
  - PD-CAP-AUDIT-AGENT-001
  - PD-CAP-PROVIDER-AGENT-001
  - PD-CAP-REMEDIATION-CLI-001
  - PD-CAP-CONTRACT-CLI-002
  - PD-CAP-IMPORT-CLI-001
  - PD-CAP-IMPORT-CLI-002
  - PD-CAP-RESUME-PRODUCT-001
  - PD-CAP-LIFECYCLE-AGENT-001
  - PD-CAP-LIFECYCLE-PRODUCT-001
  - PD-CAP-PACKAGE-PRODUCT-001
  - PD-CAP-INSTALL-PRODUCT-001
  - PD-OPT-AUDIT-PRODUCT-001
  - PD-OPT-REMEDIATION-WEB-001
  - PD-OPT-PROVIDER-AGENT-001
  - PD-GRD-GENERATION-PRODUCT-001
  - PD-GRD-LIFECYCLE-PRODUCT-001
  - PD-GRD-INDEPENDENCE-WEB-001
  - PD-GRD-AUDIT-PRODUCT-001
  - PD-GRD-REMEDIATION-PRODUCT-001
  - PD-GRD-REMEDIATION-PRODUCT-002
  - PD-GRD-REMEDIATION-PRODUCT-003
  - PD-GRD-CONSENT-AGENT-001
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
  - PD-GRD-OFFLINE-PRODUCT-001
  - PD-GRD-NETWORK-PRODUCT-001
  - PD-GRD-ATTR-PRODUCT-002
  - PD-GRD-ATTR-PRODUCT-003
  - PD-GRD-AUTHORITY-AGENT-001
  - PD-GRD-AUTHORITY-AGENT-002
  - PD-GRD-AUTHORITY-AGENT-004
  - PD-GRD-AUTHORITY-AGENT-005
  - PD-GRD-ATTR-PROVIDER-001
  - PD-GRD-PROVIDER-PRODUCT-005
  - PD-GRD-PROVIDER-CLI-001
  - PD-GRD-CLOUD-PRODUCT-001
  - PD-EVO-TRANSPORT-AGENT-001
---

# Animation remediation

## Purpose

Animation remediation lets humans and Agents identify bounded missing or
incomplete animation support for existing LPC catalog items and, after explicit
consent, extend only the approved animation scope while retaining the existing
catalog identity and inherited attribution.

The journey begins with a read-only audit. Source-authoring operations belong to
a separately confirmed `extend-item` transition and remain governed by the
public CLI lifecycle.

## Scope

### Supported

- Read-only audits for explicit animations and optional item-type or body-type
  scope.
- Distinct unsupported-animation, missing-file, blank-frame, and inspection
  error findings.
- A bounded remediation worklist and structured handoff that retain complete
  finding evidence.
- An explicit transition from audit evidence into one existing-item extension.
- A provider-neutral drawing contract and optional, separately consented
  external provider discovery.
- Strict candidate import, validation, attributed preview, resumable local
  sessions, and same-scope closure verification.
- A review-ready result followed by separately authorized acceptance, release,
  packaging, inspection, and installation actions.
- CLI and Agent-guided remediation without depending on a hosted Web
  application.

### Excluded

- Workspace, source-pixel, or catalog mutation during the audit stage.
- Assuming that every catalog item requires every known animation.
- Treating manual-review findings as exact repair instructions.
- Redesigning or replacing an existing item rather than extending it.
- Adding animations, body types, variants, consumers, or source paths outside
  the approved audit evidence.
- Bundled pixel generation, provider execution by the CLI, provider credentials,
  or hidden network access.
- Treating provider provenance as authorship, license, attribution, visual
  acceptance, or release evidence.
- Treating a review-ready preview as human acceptance or formal release.
- A required Web application, repository clone, initialized `upstream/`, user
  account, hosted backend, cloud store, or automatic synchronization service.
- Exact CLI wording, command order, temporary paths, internal module layout, or
  current delivery and publication channels.

## Requirements

### REQ-REMED-001 — Audit an explicitly bounded animation scope

The audit workflow MUST require an explicit animation target and MAY narrow the
scan by supported item type and body type. It MUST inspect the active runtime
asset source without inferring that every item requires the target animation.

#### Scenario: Audit one animation for one supported catalog slice

- GIVEN an active LPC asset source and an explicit animation target
- WHEN a human or Agent optionally limits the audit by item type or body type
- THEN only the matching catalog items and physical consumers are scanned and
  the requested bounds remain visible in the report

##### Evidence

- Owner: `packages/core/src/asset-animation-audit.ts`
- Owner: `packages/cli/src/animation-audit.ts`
- Verification: `packages/core/test/asset-animation-audit.test.ts` — `filters scanned items and consumers by type and body type`
- Verification: `packages/cli/test/animation-audit.test.ts` — `validates requested type and body type filters`

### REQ-REMED-002 — Preserve distinct finding semantics

The audit result MUST distinguish unsupported animation declarations, missing
files, blank frames, and inspection errors. Findings MUST retain their physical
path, relevant geometry, catalog consumers, body type, variant or recolor
context, and confidence or manual-review status when available.

A manual-review finding MUST NOT be presented as an exact source-cell repair.

#### Scenario: Report mixed incompleteness without flattening evidence

- GIVEN an audit scope containing unsupported declarations, missing paths, blank
  source cells, and unreadable image data
- WHEN the audit completes
- THEN each condition appears in its distinct category with the evidence needed
  to decide whether and how it may be remediated

##### Evidence

- Owner: `packages/core/src/asset-animation-audit.ts`
- Owner: `packages/cli/src/animation-audit.ts`
- Verification: `packages/cli/test/animation-audit.test.ts` — `separates missing, blank, and unreadable files and keeps findings successful`
- Verification: `packages/cli/test/animation-audit.test.ts` — `reports AssetStore load failures separately from image decode failures`
- Verification: `plugins/lpc-toolkit/test/animation-asset-audit.test.mjs` — `preserves manual review, shared consumers, recolors, and blank source cells`

### REQ-REMED-003 — Provide a bounded remediation worklist

An Agent-facing audit reader MUST preserve the complete structured audit while
presenting bounded deterministic pages. It MUST retain nested category evidence
and MUST NOT require an audit rerun merely because the human-facing response is
truncated.

Findings that share one physical source path MUST remain identifiable as one
physical remediation task with all affected consumers.

#### Scenario: Review a large audit without losing repair context

- GIVEN an audit report containing more findings than one response can safely
  present
- WHEN an Agent reads the report
- THEN it returns deterministic continuation pages while preserving categories,
  shared consumers, and the complete stored report

##### Evidence

- Owner: `plugins/lpc-toolkit/skills/animation-asset-audit/scripts/read-audit-report.mjs`
- Verification: `plugins/lpc-toolkit/test/animation-asset-audit.test.mjs` — `bounds more than 100 findings with deterministic continuation pages`
- Verification: `plugins/lpc-toolkit/test/animation-asset-audit.test.mjs` — `pages categories without flattening nested evidence`

### REQ-REMED-004 — Keep audit and authoring authority separate

The audit stage MUST remain read-only: it MUST NOT create an authoring workspace,
change source pixels, or mutate catalog files. Before any source-authoring
transition, an Agent MUST show the selected finding and obtain explicit human
confirmation for the bounded remediation scope.

#### Scenario: Stop at an actionable handoff

- GIVEN a completed read-only audit with one candidate remediation finding
- WHEN an Agent proposes an existing-item extension
- THEN the audit remains unchanged and authoring begins only after the human
  explicitly confirms the selected target and scope

##### Evidence

- Owner: `plugins/lpc-toolkit/skills/animation-asset-audit/SKILL.md`
- Owner: `plugins/lpc-toolkit/skills/asset-authoring/SKILL.md`
- Verification: `plugins/lpc-toolkit/test/animation-asset-audit.test.mjs` — `routes audit requests to a focused non-mutating skill`
- Verification: `plugins/lpc-toolkit/test/animation-asset-audit.test.mjs` — `routes mutating asset work through one consent-bound skill`
- Verification: `packages/cli/test/plugin-contract.test.ts` — `keeps authoring out of read-only and composition skills`

### REQ-REMED-005 — Bind an extension to audit evidence

An `extend-item` plan MUST identify one existing catalog item and MUST retain the
selected audit finding, physical source path, affected consumers, confidence,
source-cell evidence, and approved remediation scope. The plan MUST limit work
to the confirmed body type, animations, cells, variants, and paths.

#### Scenario: Create a bounded existing-item extension

- GIVEN a confirmed audit finding for an existing item
- WHEN an extension plan is created
- THEN the plan carries the exact evidence and limits required to prevent work
  from expanding beyond the confirmed remediation

##### Evidence

- Owner: `packages/core/src/asset-authoring-schema.ts`
- Verification: `packages/core/test/asset-authoring-schema.test.ts` — `retains complete audit/remediation evidence for an extension`
- Verification: `packages/core/test/asset-authoring-schema.test.ts` — `requires remediation evidence for an extend-item plan`

### REQ-REMED-006 — Preserve identity, inherited credits, and unaffected animation scope

An existing-item extension MUST retain the catalog item identity and inherited
base credits. It MUST add only the approved missing animation or source-cell
evidence and MUST preserve unaffected source cells and animation scope.

The workflow MUST NOT silently convert remediation into an item replacement or
redesign.

#### Scenario: Repair blank frames without changing existing art

- GIVEN an existing attributed item with exact blank source cells
- WHEN a compatible candidate is prepared for the approved cells
- THEN the contract and review artifacts preserve inherited attribution and
  prove that unchanged baseline cells remain unchanged

##### Evidence

- Owner: `packages/core/src/sprite-drawing-contract.ts`
- Owner: `packages/cli/src/asset-authoring-contract.ts`
- Owner: `packages/cli/src/asset-pack-preview.ts`
- Verification: `packages/core/test/sprite-drawing-contract.test.ts` — `represents exact blank-frame repair with required cells and unchanged baseline digests`
- Verification: `packages/core/test/sprite-drawing-contract.test.ts` — `preserves layer, body, variant, consumer, and exact missing-file extension context`
- Verification: `packages/cli/test/asset-pack-preview.test.ts` — `includes inherited base attribution for an existing-item extension`

### REQ-REMED-007 — Produce a provider-neutral drawing contract

The CLI MUST materialize a deterministic provider-neutral drawing contract for
the approved extension. It MUST identify exact targets, geometry, required
cells, source evidence, unchanged baseline evidence, transparent templates, and
non-importable visual guides.

Changing geometry, source evidence, baseline evidence, or references MUST change
the semantic contract binding.

#### Scenario: Materialize an exact repair contract

- GIVEN an approved extension plan and current source evidence
- WHEN the drawing contract is produced
- THEN the workspace contains deterministic contract JSON, exact target
  templates, and reference guides bound to the current remediation evidence

##### Evidence

- Owner: `packages/core/src/sprite-drawing-contract.ts`
- Owner: `packages/cli/src/asset-authoring-contract.ts`
- Verification: `packages/core/test/sprite-drawing-contract.test.ts` — `changes semantic digest input for geometry, source, baseline, and reference changes`
- Verification: `packages/cli/test/asset-authoring-contract.test.ts` — `materializes an attributed blank-frame working copy and reference overlay without changing the base source`
- Verification: `packages/cli/test/asset-authoring-contract.test.ts` — `publishes deterministic contract JSON, exact targets, transparent templates, and non-importable guides`

### REQ-REMED-008 — Keep external pixel production optional and consent-bound

The public CLI MUST NOT select, install, or invoke an external pixel provider.
An Agent MAY discover an explicitly configured provider only after disclosing
the provider, intended data flow, network or local execution behavior, and
credential handling, and after obtaining separate explicit human consent.

A provider result MUST remain an untrusted candidate for the normal import
boundary. The local authoring session MUST remain resumable without a provider.

#### Scenario: Stage a provider result without granting source authority

- GIVEN an approved drawing contract and an explicitly configured provider
- WHEN the human separately consents to the disclosed provider operation
- THEN the provider result is staged as a candidate without changing canonical
  source bytes or bypassing contract-compatible import

##### Evidence

- Owner: `packages/core/src/asset-provider-schema.ts`
- Owner: `packages/cli/src/asset-provider-commands.ts`
- Verification: `packages/core/test/asset-provider-schema.test.ts` — `discovers explicitly supplied providers in stable order without preparing assets`
- Verification: `packages/cli/test/asset-provider-commands.test.ts` — `requires the consent file and explicit confirmation without mutating the session`
- Verification: `packages/cli/test/asset-provider-commands.test.ts` — `stages a valid provider result without importing canonical source bytes`

### REQ-REMED-009 — Import only a current contract-compatible candidate

Candidate import MUST require an explicit contract target and the current
contract digest. It MUST reject an unknown or stale target, incompatible
geometry or transparency, missing required cells, or changes to protected
baseline cells.

A rejected candidate MUST NOT replace the last accepted target or receipt.

#### Scenario: Reject a candidate that alters unaffected cells

- GIVEN a current extension contract with protected baseline cells
- WHEN a candidate changes a cell outside the approved repair scope
- THEN import fails with actionable inspection evidence and preserves the prior
  accepted target and receipt

##### Evidence

- Owner: `packages/cli/src/asset-authoring-import.ts`
- Verification: `packages/cli/test/asset-authoring-import.test.ts` — `imports a valid real PNG through the public application seam`
- Verification: `packages/cli/test/asset-authoring-import.test.ts` — `rejects an unknown target and a digest that is not the current contract`
- Verification: `packages/cli/test/asset-authoring-import.test.ts` — `rejects a candidate that changes an unchanged baseline cell`
- Verification: `packages/cli/test/asset-authoring-import.test.ts` — `leaves the prior target and receipt exact when a correction candidate fails inspection`

### REQ-REMED-010 — Validate and preview the current extension

Validation MUST inspect the current manifest and current PNG source, including
geometry, decoding, required-cell, blank-cell, compatibility, attribution, and
scope constraints. A successful review-ready preview MUST publish current
preview pixels, metadata, and matching TXT and CSV credits including inherited
base attribution.

If the contract, imported candidate, validation evidence, or preview input
drifts, the affected downstream evidence MUST become stale.

#### Scenario: Reach a current attributed review-ready preview

- GIVEN a contract-compatible imported extension candidate
- WHEN validation and preview complete against the current workspace
- THEN the session exposes current validation evidence and attributed preview
  artifacts, and later source drift invalidates the affected evidence

##### Evidence

- Owner: `packages/cli/src/asset-pack-validation.ts`
- Owner: `packages/cli/src/asset-pack-preview.ts`
- Owner: `packages/cli/src/asset-authoring-session.ts`
- Verification: `packages/cli/test/asset-pack-validation.test.ts` — `reports geometry, blank-cell, decode, missing, and incompatible-geometry diagnostics from inspected PNGs`
- Verification: `packages/cli/test/asset-pack-preview.test.ts` — `validates the current source again before previewing`
- Verification: `packages/cli/test/asset-pack-preview.test.ts` — `includes inherited base attribution for an existing-item extension`
- Verification: `packages/cli/test/asset-authoring-session-e2e.test.ts` — `publishes blank-frame unchanged-cell and inherited-credit evidence through public contract argv`

### REQ-REMED-011 — Keep review-ready and formal lifecycle authority separate

Review-ready status MUST mean that the current candidate has current import,
validation, and attributed preview evidence. It MUST NOT mean that a human has
visually accepted the art or authorized release.

Formal acceptance, release preparation, packaging, archive inspection, and
installation MUST remain distinct, current, explicitly confirmed lifecycle
actions. Packaging MUST NOT imply downstream installation or publication.

#### Scenario: Stop after review-ready until the human authorizes release

- GIVEN a current attributed review-ready extension
- WHEN no human has recorded visual acceptance or release confirmation
- THEN formal packaging and installation remain unavailable and no release claim
  is made

##### Evidence

- Owner: `packages/cli/src/asset-authoring-release-lifecycle.ts`
- Owner: `packages/cli/src/asset-release.ts`
- Owner: `plugins/lpc-toolkit/skills/asset-authoring/references/authoring-workflow.md`
- Verification: `packages/cli/test/plugin-contract.test.ts` — `documents the review-ready boundary and separate human release actions`
- Verification: `packages/cli/test/asset-authoring-release.test.ts` — `refuses formal packaging before all release gates are current`
- Verification: `packages/cli/test/asset-authoring-release.test.ts` — `requires explicit confirmation before installing the inspected archive into a consumer workspace`

### REQ-REMED-012 — Keep remediation local, contained, and resumable

The local managed authoring workspace MUST remain the source of truth for the
session. Status and resume operations MUST reconcile current files and evidence
without broadening the approved remediation scope or rewriting unchanged
artifacts.

Normal remediation outputs MUST remain inside their supported managed or
explicit destinations and MUST NOT require or modify a repository clone or the
optional `upstream/` gitlink.

#### Scenario: Resume a contained remediation session

- GIVEN a previously created local extension session
- WHEN the human resumes it after changing or leaving workspace files unchanged
- THEN status deterministically identifies current and stale stages without
  escaping managed roots or expanding the approved scope

##### Evidence

- Owner: `packages/cli/src/asset-authoring-session.ts`
- Verification: `packages/cli/test/asset-authoring-session.test.ts` — `keeps status read-only and repeated resume idempotent when files are unchanged`
- Verification: `packages/cli/test/asset-authoring-session.test.ts` — `rejects session and pack paths that escape their manager-owned roots`
- Verification: `packages/cli/test/asset-authoring-session.test.ts` — `returns stable decisions for manifest, contract, PNG, validation, and preview drift`

### REQ-REMED-013 — Verify closure against the original audit scope

After an extension reaches the intended accepted lifecycle state, the audit MUST
be rerun with the original animation target and the same item-type and body-type
bounds. Closure MUST be determined from the resulting finding categories and
scope, not from process exit status alone.

#### Scenario: Prove that the bounded animation finding is closed

- GIVEN a completed existing-item extension and its original audit scope
- WHEN the same bounded audit is rerun against the active installed source
- THEN the original unsupported, missing-file, blank-frame, or inspection-error
  finding is absent or explicitly remains for further review

##### Evidence

- Owner: `packages/cli/src/animation-audit.ts`
- Owner: `plugins/lpc-toolkit/skills/asset-authoring/references/authoring-workflow.md`
- Verification: `packages/cli/test/animation-audit.test.ts` — `separates missing, blank, and unreadable files and keeps findings successful`
- Verification: `packages/cli/test/asset-authoring-e2e.test.ts` — `scaffolds, validates, previews, syncs, audits, and renders attributed packs inside one workspace`
