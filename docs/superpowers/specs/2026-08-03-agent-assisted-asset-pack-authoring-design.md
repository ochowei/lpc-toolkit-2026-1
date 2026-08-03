# Agent-Assisted Asset Pack Authoring Product Design

**Status:** Approved product design

**Date:** 2026-08-03

## Summary

Add an Agent-assisted authoring layer to the existing LPC Toolkit character,
animation-audit, asset-pack CLI, and Web Workbench capabilities. A user may
describe a character or source-asset need in natural language. The Agent first
searches the catalog and then explains and selects one of three outcomes:

1. create a character document and compose existing sprites;
2. create a new attributed asset pack; or
3. produce an animation remediation handoff and, after consent, extend an
   existing item with missing animation pixels.

The public CLI remains the cross-platform product contract. It gains
provider-neutral, resumable authoring primitives around the existing leaf
commands. A Codex `lpc-asset-pack-authoring` skill orchestrates those
primitives, while Antigravity and Claude Code integrations can consume the same
CLI capabilities and JSON schemas. Sprite generation is optional: an available
image tool or external author receives a sprite drawing contract and returns a
candidate PNG, but never owns the pack manifest, validation, attribution, or
release lifecycle.

This design extends, and does not replace:

- [Artist Asset Pack Authoring Design](./2026-07-21-artist-asset-pack-authoring-design.md)
- [Artist Asset Pack Web Workbench Design](./2026-07-23-artist-asset-pack-web-workbench-design.md)
- [LPC Animation Asset Audit Skill Design](./2026-07-19-lpc-animation-asset-audit-skill-design.md)
- [LPC Toolkit Codex Plugin Design](./2026-07-14-lpc-toolkit-codex-plugin-design.md)

## Problem

The current product has reliable but disconnected capabilities:

- character authoring can search, select, validate, preview, and render
  existing catalog assets with complete attribution artifacts;
- animation audit can produce structured evidence and bounded drawing
  worklists while remaining read-only;
- asset-pack CLI commands can scaffold, validate, preview, synchronize,
  package, inspect, install, list, remove, and diagnose attributed packs; and
- the Web Asset Pack Workbench can inspect and repair uploaded archives,
  replace PNGs, validate revisions, preview with attribution, acknowledge
  warnings, and download draft or formal archives.

The missing product layer is a safe Agent loop between a natural-language need
and completed sprite pixels. Today a user must translate audit evidence into
scaffold flags, discover geometry and paths, coordinate an image tool, place
complete PNGs, interpret validation, and manually resume after failure. A
plugin skill cannot safely fill those gaps with prompt instructions alone
without duplicating CLI product logic or binding the workflow to one Agent
platform.

## Goals

1. Route natural-language requests through catalog discovery before creating
   new source assets.
2. Add a focused asset-pack authoring workflow without broadening character
   authoring or weakening read-only audit.
3. Make pixel generation optional and replaceable across Codex, Antigravity,
   Claude Code, other Agent integrations, and external artists.
4. Give every provider exact, CLI-derived PNG paths, geometry, frame layout,
   body, layer, variant, alpha, and reference requirements.
5. Preserve authorship, license, source, provenance, acknowledgement,
   workspace ownership, cache integrity, and attribution boundaries.
6. Create a validate, attributed-preview, visual-review, correction, and
   revalidation loop that survives Agent or process interruption.
7. Let a normal user work through concise confirmations rather than directly
   editing an asset-pack manifest.
8. Prove the workflow with real PNGs through the packed public CLI and an
   independent consumer workspace.

## Non-Goals

- Do not put natural-language interpretation or image-model calls in Core.
- Do not make `generate2dsprite`, ImageGen, Codex, Antigravity, or Claude Code a
  required CLI or asset-pack dependency.
- Do not let a generation provider edit a manifest, write directly into final
  pack sources, synchronize, package, install, or acknowledge warnings.
- Do not turn animation audit into a mutating workflow.
- Do not initialize or modify `upstream/`, write into the verified base cache,
  weaken cache checks, or adopt unowned workspace output.
- Do not add a terminal interactive wizard in the MVP.
- Do not add a backend, account system, registry, signing system, or new
  dependency as part of this design.
- Do not add new Web Workbench features to the Agent-authoring MVP. The
  existing workbench remains available for browser archive repair and review.
- Do not automatically author variants, recolor contracts, arbitrary custom
  geometry, oversized sprites, mounts, or complex multi-layer assets in the
  MVP.

## Domain Separation

The workflow must preserve these distinct concepts:

| Concept | Product meaning | Must not be reported as |
| --- | --- | --- |
| Character document | A persisted catalog selection for one character | An asset pack or new pixels |
| Sprite composition | Rendering selected existing sprites with attribution | Source-asset creation |
| Asset-pack manifest | The declaration of pack identity, assets, sources, credits, and governance | A spritesheet or character selection |
| Sprite pixels | Authored RGBA content in PNG sources | Metadata, validation, or packaging |
| Animation extension | An attributed delta that supplies animation pixels for an existing item | A new item or character edit |
| Asset validation | Schema, catalog, pixel, attribution, ownership, and governance checks | Visual acceptance or publication |
| Formal asset-pack archive | An immutable installable archive that passed release gates | A draft or merely valid source tree |
| Asset-pack installation | Activation in a consumer workspace | Sync, pack creation, or source authoring |

The canonical definitions live in [`CONTEXT.md`](../../../CONTEXT.md).

## Catalog-First Routing

An Agent integration parses the request into a character concept, desired
selection types, visual traits, body types, and animations, then uses bounded
catalog search and item detail through the public CLI.

The routing order is:

1. If existing assets satisfy the request, use character authoring to create a
   draft character document and attributed preview.
2. If an existing item satisfies the visual request but lacks required
   animation support, run the read-only animation audit and offer an animation
   remediation handoff.
3. If no suitable asset exists, or the user explicitly wants original art,
   offer a new-item authoring plan.

The Agent must disclose materially similar catalog candidates. It may not
treat a failed exact string match as proof that an asset does not exist. Before
either new-item or animation-extension writes, it shows the closest candidates,
why composition is insufficient, the proposed asset kind, the expected write
scope, and the generation plan. The user then approves the bounded authoring
plan.

## Skill and Agent-Integration Boundaries

### Character authoring

`lpc-character-authoring` continues to create and modify character documents,
compose existing sprites, validate selections, preview, render, and verify
metadata and TXT/CSV credits. It does not create asset-pack manifests or sprite
pixels.

### Animation audit

`lpc-animation-asset-audit` continues to gather and explain read-only evidence.
It may preserve a structured animation remediation handoff alongside its full
report, but it may not initialize a workspace, scaffold a pack, generate or
import PNGs, or modify an asset source.

When a user asks to inspect and repair in one task, the upper-level Agent
integration may:

1. run the audit;
2. show the bounded remediation scope;
3. obtain authoring consent; and
4. invoke asset-pack authoring with the immutable handoff.

The audit skill never performs step 4 itself. This boundary is recorded by
[ADR-0008](../../../docs/adr/0008-keep-animation-audit-read-only.md).

### Asset-pack authoring

Add a focused Codex skill named `lpc-asset-pack-authoring`. It owns reliable
workflow sequencing for new-item and animation-extension source work:

- compatibility and capability preflight;
- catalog-first routing evidence;
- artist workspace discovery or initialization;
- authoring-session creation and resume;
- scaffold, drawing-contract, and template requests;
- optional provider handoff;
- candidate import;
- validation, attributed preview, and visual correction loops;
- gated sync, draft recovery archive, formal pack, inspect, and optional
  independent consumer install; and
- final artifact and attribution reporting.

The skill invokes the public CLI and inspects returned artifacts. It does not
parse caches, reproduce schema policy, derive geometry, edit manifest JSON
behind the CLI, or silently install the CLI.

Antigravity and Claude Code integrations implement the same workflow against
the same CLI capabilities. They need not use the Codex skill packaging or
install a Codex-only image skill.

### Generation providers

Generation is a separate capability, not necessarily a separate LPC Toolkit
skill. A provider may be `generate2dsprite`, ImageGen, another Agent-visible
image tool, or an external artist. It receives a sprite drawing contract and
produces candidate pixels in a session staging location.

The authoring workflow always materializes the provider-neutral contract first.
If the user names a provider, the Agent uses it when available. Otherwise the
Agent recommends an available provider and obtains consent before the first
pixel generation. The same provider may perform bounded corrective iterations
within the approved authoring session without repeated consent. Switching
providers or adding a new external reference requires new consent.

When no provider is available, the session returns `needs-user-action` with a
durable handoff for an external author. Absence of an image tool is not a
failed authoring product.

This separation is recorded by
[ADR-0007](../../../docs/adr/0007-keep-sprite-generation-provider-neutral.md).

## CLI-Owned Authoring Application Model

Prompt-only orchestration is insufficient for cross-Agent recovery. The CLI
therefore owns a versioned authoring session as a formal, non-published
application concept. Existing leaf commands remain independently usable and
remain the authorities for their current validation and lifecycle behavior.
New primitives coordinate them without duplicating Core or CLI policy.

The design requires capabilities for:

- creating or discovering an authoring session;
- recording a bounded plan and its consent scope;
- returning session status and safe next actions;
- creating or refreshing a sprite drawing contract and templates;
- importing a contract-bound candidate PNG;
- invalidating stale checkpoints after source changes;
- recording provider provenance and human declarations;
- resuming from the latest valid checkpoint; and
- reporting release readiness.

Exact command names and argv remain a `/to-spec` decision. The MVP does not add
a terminal question-and-answer wizard. Human output may explain the current
state and next command, while Agent integrations consume JSON.

### Session state

Every workflow response has one top-level state:

- `completed`: the requested bounded outcome and all required release gates
  are complete;
- `needs-user-action`: the session is safely paused for consent, external art,
  identity/license input, manifest conflict, acknowledgement, or visual review;
  or
- `failed`: the attempted action failed, with the last valid checkpoint and
  structured recovery evidence preserved when safe.

The response also carries a reason, phase, and checkpoint. Waiting for an
installed generation provider and waiting for an external artist use different
reasons but the same top-level `needs-user-action` state.

### Session versus manifest

The asset-pack manifest remains the canonical publishable source declaration.
The authoring session records workflow progress, consent, provenance,
artifacts, and checkpoint freshness. It is not part of the asset's identity and
is not silently embedded in a formal archive. A release-safe projection of
generation provenance may enter the archive only through an explicitly
versioned provenance contract.

External PNG edits are accepted as new candidate evidence: the CLI recomputes
digests, records the event, and invalidates downstream validation and preview
checkpoints. External manifest edits are not merged or overwritten
automatically. The user must choose the external manifest or the session-known
revision, after which the CLI revalidates from the appropriate checkpoint.

### Structured recovery response

Agent-consumed responses include at least:

```text
sessionId
state
reason
phase
checkpoint
diagnostics[]
artifacts[]
nextActions[]
retrySafety
inputsNeeded[]
manifestDigest
sourceDigests
cliVersion
capabilities
schemaVersions
```

Each next action is structured and identifies whether it is safe, requires
confirmation, or is blocked. Retrying an idempotent action cannot duplicate a
scaffold, import, acknowledgement, registry entry, or archive publication.
Users should not need to inspect or hand-edit manifest JSON to recover.

## Sprite Drawing Contract and Templates

Core animation and custom-layout definitions remain the only source of LPC
geometry. The CLI derives, versions, and binds each drawing contract with a
digest. Agent instructions and providers may not infer geometry from LPC
conventions such as a remembered frame size or column count.

For every required complete PNG, the contract contains:

- the exact candidate identity and final target path;
- canvas width and height;
- frame width and height;
- animation and source-animation identity;
- direction, logical frame, source row, and source column mappings;
- cells that must contain pixels, may remain transparent, or must remain
  unchanged;
- layer, z-position, body types, physical variant, and dependent consumers;
- alpha and background rules;
- baseline/reference identities and digests;
- schema, Core geometry capability, and contract versions; and
- the complete contract digest.

The CLI also emits transparent template PNGs and separate visual guide and
reference-overlay artifacts. Guides show frame boundaries, directions, body
alignment, and anchors but are never imported as formal sprites. Templates and
references share the contract digest. A provider result for an older contract
is rejected rather than reinterpreted.

Structural validation checks PNG signature and decoding, dimensions, alpha,
cell bounds, required non-transparent cells, allowed transparent cells, and
unchanged-cell requirements. The formal sprite background must remain alpha
transparent; a white, checkerboard, chroma-key, or guide background is not a
valid substitute.

Visual validation remains distinct. Attributed previews are inspected for body
alignment, occlusion, direction consistency, animation continuity, stray
background pixels, and layer behavior. Pure geometry validation does not claim
to prove artistic correctness.

## Candidate Pixel Ingestion

Providers and external artists write only to a session-owned candidate staging
area. The supported ingestion path is:

```text
sprite drawing contract
-> provider or external author
-> candidate staging
-> CLI contract-bound inspection
-> exact import plan
-> atomic import into pack source
-> stale-checkpoint invalidation
```

Import rejects non-PNG content, decode or dimension bombs, unsafe or
out-of-root paths, symlinks, unexpected files, stale contracts, digest
mismatches, and geometry or alpha failures. If the final source was created by
the current session, an approved authoring plan may allow atomic replacement.
Replacing a pre-existing user source requires separate confirmation.

For an exact blank-frame repair, the CLI first materializes an attributed,
digest-bound working copy of the existing complete source into artist-owned
staging. The provider may change only the contract-authorized cells; unchanged
cell digests and baseline credits are verified during import. The active base
cache, checked-in assets, generated overlay, and `upstream/` are never edited.

## Provenance, Authorship, License, and Attribution

Generation provenance records the provider, tool or model identifier when
available, generation time, prompt and drawing-contract digest, reference
identities and digests, candidate digest, and import result. It supports
traceability but does not establish authorship or license authority.

The attribution author is a person or organization willing to take
responsibility for the claimed contribution and release declaration. An
automated generation provider is recorded in provenance and never inserted
into the author field merely because it produced candidate pixels. A human
external artist may separately be an attribution author when the rights
declarant confirms that contribution. Baseline and reference contributors
retain their existing authors, URLs, licenses, notes, and digests wherever
their pixels or derivative contribution requires it.

The Agent may detect provider terms, inherited source obligations, and
supported license candidates. It may not choose a license on behalf of the
rights declarant. A workspace author profile may prefill a previously confirmed
display identity and common license, but operating-system, Git, or Agent
identity values are suggestions only until the user confirms them.

Draft generation and preview may proceed before final license confirmation.
An anonymous user may retain a draft or handoff, but no formal archive is
released without a confirmed attribution author and license/source
declaration. The normal first-use flow asks only for the intended attribution
identity, while detailed provenance is collected automatically. The complete
license and source summary is presented at sync or formal-release readiness.

## Acknowledgement and Human Review

The CLI produces exact warning evidence and acknowledgement templates. An
Agent may explain the warning, recommend a deterministic fix, or draft a
reason for review, but it may not claim that a warning was reviewed. A user or
explicitly authorized workspace reviewer supplies and confirms the real,
non-empty reason.

There is no first-version workspace policy to auto-accept warning classes and
no acknowledge-all behavior. Deterministically repairable warnings should be
fixed and revalidated instead of acknowledged away. Acknowledgement remains
bound to diagnostic code, structured subject, relevant digests, and reviewer
declaration, and becomes stale when its evidence changes.

Formal release also requires human acceptance of the final attributed preview.
The acceptance binds the preview and source digests. If pixels do not change,
re-running formal packaging does not require another visual confirmation. This
boundary is recorded by
[ADR-0009](../../../docs/adr/0009-require-human-asset-release-declarations.md).

## Consent and Automation Policy

### Read-only operations without additional consent

- bounded catalog search and item detail;
- animation audit;
- workspace discovery;
- archive inspect;
- asset-pack list and read-only doctor diagnostics;
- geometry, compatibility, license, and attribution inspection; and
- plugin/CLI capability preflight.

### Operations covered by one scoped authoring-plan consent

Inside the displayed artist workspace, pack, asset, body-type, animation,
provider, and path scope, the Agent may:

- initialize the workspace and draft scaffold;
- create drawing contracts, templates, and references;
- call the approved provider;
- stage and import session-produced candidates;
- validate and create attributed previews;
- visually inspect and perform bounded corrective iterations;
- update automatically collected provenance;
- follow safe structured recovery actions; and
- revalidate invalidated checkpoints.

The plan may pre-authorize automatic sync and a deterministic draft recovery
archive after all applicable technical and attribution gates pass. A CLI draft
archive uses the existing non-installable draft archive contract; it is not the
output of the formal `asset pack` lifecycle and is never reported as published.

### Operations requiring specific confirmation

- first provider selection when the user did not name one;
- changing provider or adding an external reference;
- author and license/source declaration;
- every acknowledgement reason;
- overwriting a source that predates the session;
- resolving an externally changed manifest;
- formal archive release;
- consumer-workspace installation;
- asset-pack removal; and
- any network, download, or workspace-external action not already approved by
  the current Agent environment.

## End-to-End Authoring Flow

```text
natural-language need
-> bounded catalog search and similar-candidate disclosure
-> compose existing | new-item plan | read-only audit
-> authoring consent for new-item or animation extension
-> discover or create artist workspace
-> create authoring session and scaffold
-> create drawing contract, templates, and references
-> approved provider or external-author handoff
-> stage candidate PNG
-> validated atomic import
-> validate
-> attributed preview
-> Agent visual inspection and bounded correction loop
-> human preview acceptance
-> author, license, source, and acknowledgement gates
-> optional sync and draft recovery archive
-> formal pack
-> inspect exact archive
-> optional independent consumer install
-> report archive, preview, provenance, and attribution artifacts
```

A session stops with `needs-user-action`, not `completed`, while waiting for a
provider, external author, declaration, acknowledgement, manifest conflict,
or final preview acceptance.

## MVP Capability Policy

MVP automation supports:

- one new-item or one audit-derived animation extension per authoring session;
- simple, single visual-layer wearable assets such as a hat, simple hair
  accessory, shirt, or accessory;
- `male` and `female` body types;
- `walk` as the required new-item animation baseline;
- optional `idle` for new items;
- audit-derived standard animation extensions with exact CLI geometry and no
  `manualReviewReason`;
- exact missing-file work; and
- exact blank required-cell repair with unchanged-pixel preservation.

MVP automation does not support:

- body/base sprites, mounts, oversized assets, or custom geometry;
- complex foreground/background or more general multi-layer authoring;
- weapon-specific action design;
- automatic body-type transformation beyond separately authored male and
  female sources;
- automatic variant design;
- creating or changing palette/recolor contracts;
- resolving manual-review audit paths;
- arbitrary replacement of existing pixels; or
- cross-pack conflict resolution.

Existing manifest capabilities remain available to expert/manual workflows.
These restrictions are advertised as CLI capability policy, not encoded as
permanent limitations of `lpc-toolkit.asset-pack.v1` or the authoring-session
schema. Future integrations discover supported capabilities from the CLI. An
older integration safely falls back to external-author handoff or refuses an
unknown capability rather than producing guessed output.

## Completion Model

The workflow exposes three cumulative milestones:

1. **Technically valid:** schema, geometry, pixels, attribution, ownership,
   digests, and applicable acknowledgements pass.
2. **Visually accepted:** Agent inspection passes and a human reviewer accepts
   the exact attributed preview digest.
3. **Release ready:** author, license, sources, provenance, warnings, version,
   sync when requested, formal pack, and inspect gates pass for the exact
   source digests.

The overall formal-authoring request is `completed` only at release ready. A
technically valid pack awaiting review is `needs-user-action`.

## Web Asset Pack Workbench Responsibility

The existing Web Asset Pack Workbench remains the browser-only upload,
inspection, repair, attribution, acknowledgement, preview, draft-download, and
formal-download surface described in its approved design. It is not removed or
redesigned by this MVP.

The CLI remains responsible for filesystem artist workspaces, authoring
sessions, drawing contracts and templates, candidate import, linked sync,
registry and cache ownership, formal pack inspection, installation, removal,
and recovery. The Web workbench consumes the same Core and archive contracts
and must not create another manifest or drawing-contract schema.

Future Web work may visualize a CLI-produced authoring bundle, template grid,
body overlay, onion skin, and session state, but browser-to-local-workspace
bridging requires a separate security design. The Agent-authoring MVP does not
add a partial bridge, a backend, or browser generation controls.

## Compatibility and Release Contract

SemVer range checks remain the first compatibility gate. The public CLI also
advertises machine-readable schema and capability identifiers, including
equivalents of:

- `asset-authoring-session.v1`;
- `sprite-drawing-contract.v1`;
- `animation-remediation-handoff.v1`; and
- `asset-pack-provenance.v1`.

Names are illustrative until `/to-spec`; their semantic responsibilities are
approved. Every Agent integration declares required and optional capabilities.
A missing required capability stops safely with upgrade guidance. A missing
optional generation capability falls back to an external-author handoff.

Codex, Antigravity, and Claude Code integrations share public CLI contract
fixtures and cross-platform acceptance cases. Platform packaging may differ,
but an integration may not reinterpret CLI response schemas. Plugin and CLI
versions remain independent and are updated together only when their tested
compatibility declaration changes.

The current CLI README says plugin `0.2.0`, while the installed plugin
compatibility references and tests say `0.2.1`. Follow-up implementation must
correct the README to `0.2.1` and add or retain a documentation-contract test
that prevents this version from drifting again.

## End-to-End Acceptance

Acceptance uses legally distributable, visibly non-trivial PNG fixtures. A
one-pixel or fully transparent placeholder cannot prove the workflow.

The packed/public CLI entrypoint must, in clean temporary directories:

1. initialize an independent artist workspace without a repository checkout;
2. create a new-item authoring session and scaffold;
3. emit a drawing contract, transparent template, guide, and reference overlay;
4. simulate a provider by staging a real fixture PNG;
5. import through the contract-bound CLI path;
6. validate and create an attributed preview;
7. prove human declaration and preview gates before formal release;
8. sync when authorized and create a non-installable draft recovery archive;
9. create and inspect the formal archive after gates pass;
10. install it in a separate clean consumer workspace;
11. find and select the new item through public character commands;
12. render spritesheet, viewer, metadata, TXT/CSV credits, and ZIP output;
13. verify archive, content, contract, source, preview, and attribution digests;
14. replace a candidate PNG and prove validation/preview checkpoints become
    stale and resume safely;
15. run audit, preserve its immutable remediation handoff, obtain authoring
    consent, and complete one exact animation extension;
16. cover an exact blank-frame repair with unchanged-cell and inherited-credit
    evidence; and
17. prove no workflow initializes or modifies `upstream/`, writes to the base
    cache, adopts unowned output, or bypasses attribution.

Tests invoke the public packaged binary, not CLI source modules. They verify
structured JSON recovery and real artifacts, not only command exit status.

## CLI Documentation Impact

The `/to-spec` output and later implementation plan must carry and reassess
this matrix before implementation and before handoff:

```text
help: update
cli-readme: update
root-readme: update
landing: update
architecture: update
engineering: update
releasing: update
plugin: update
```

- Help documents every new public primitive, JSON state, capability, consent
  boundary, draft/formal distinction, and exact next-action behavior.
- CLI README documents the natural Agent workflow, authoring-session recovery,
  drawing contract, candidate import, provenance, and public entrypoint.
- Root README and landing distinguish character composition, asset creation,
  animation extension, Web repair, publication, and installation.
- Architecture records CLI ownership, provider adapters, Agent integration
  boundaries, and Web reuse without describing future behavior as already
  shipped.
- Engineering maps focused contract, security, real-PNG, packed-CLI,
  cross-platform, boundary, and full verification gates.
- Releasing defines CLI capability/schema and plugin compatibility updates,
  public-package smoke evidence, and release-note requirements.
- Plugin contracts add asset-pack authoring, audit handoff, capability checks,
  compatibility fixtures, and safe routing across the three workflows.

## Confirmed Decisions

- Add one focused asset-pack authoring skill; keep generation provider-neutral
  and optional.
- Preserve animation audit as read-only and cross its boundary only through
  upper-level orchestration after consent.
- Make CLI/Core the sole authority for drawing geometry, templates,
  validation, and resumable authoring state.
- Use `completed`, `needs-user-action`, and `failed` as top-level session result
  states, with reason, phase, and checkpoint detail.
- Record providers as provenance, not authors; require accountable human author
  and license declarations for formal release.
- Require human acknowledgement reasons and final attributed-preview
  acceptance; do not add warning auto-accept policy.
- Use progressive disclosure and workspace profiles to minimize routine input
  without silently inferring identity.
- Allow one bounded authoring-plan consent for safe workspace-local iteration,
  with separate gates for material external state and risk acceptance.
- Add non-interactive Agent-first CLI workflow primitives instead of a terminal
  wizard or prompt-only orchestration.
- Accept external PNG changes through re-digest and revalidation, but require
  human resolution for external manifest changes.
- Keep the MVP narrow through capability policy while leaving the manifest and
  session contracts extensible.
- Require real-PNG, packed-CLI, new-item, animation-extension, and independent
  consumer acceptance evidence.
- Keep current Web Workbench behavior outside the Agent-authoring MVP while
  preserving its existing shared contracts and responsibility.
- Use SemVer ranges plus capability/schema handshake.
- Correct the plugin `0.2.0` versus `0.2.1` CLI README drift in implementation.

## Open Questions for `/to-spec`

These questions do not change the approved responsibility boundaries:

1. What are the exact command names, argv, and response-envelope extensions
   for authoring session creation, status, resume, contract generation,
   candidate import, declarations, and readiness?
2. Which exact fields are mandatory in each versioned session, drawing
   contract, remediation handoff, provenance, and visual-acceptance record?
3. Which existing catalog `typeName` values form the MVP allowlist for simple
   single-layer wearables, and which fixture proves each supported shape?
4. How is an existing complete source safely materialized for exact blank-frame
   repair while preserving unchanged pixels and inherited attribution?
5. Does the CLI draft recovery archive reuse the shared Web draft writer
   directly, and what command owns it without changing formal `asset pack`
   semantics?
6. Which visual checks can be deterministic, which are Agent heuristics, and
   how is the final human preview-acceptance artifact represented?
7. What is the release-safe provenance projection, and which provider fields
   are optional when an external artist supplies pixels?
8. How do Codex, Antigravity, and Claude Code advertise generation capability
   without coupling the CLI to platform-specific discovery APIs?
9. Which plugin and CLI release versions first carry the required capabilities,
   and what backward-compatibility fixtures cover safe refusal?
10. Which legally distributable real PNG fixtures and attribution author will
    support packed-CLI acceptance?

## Prototype Assessment and Next Step

A throwaway `/prototype` is not required before specification. The primary
decisions concern durable responsibility, safety, compatibility, consent, and
artifact contracts rather than an uncertain UI interaction or isolated state
algorithm. If `/to-spec` cannot make session invalidation and recovery
transitions unambiguous, create a narrow state-machine prototype at that point;
do not prototype the full product or Web UI.

The requirements are sufficiently clear for `/to-spec`. That next step should
turn this product design into exact public schemas, state transitions, command
contracts, capability negotiation, migration/release behavior, and testable
acceptance criteria before any product-code implementation begins.
