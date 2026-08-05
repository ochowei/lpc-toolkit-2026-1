# Agent-Assisted Asset Pack Release Lifecycle — Deferred Roadmap

**Status:** Proposed roadmap spec  
**Date:** 2026-08-04  
**Successor issue:** [Issue #153](https://github.com/ochowei/lpc-toolkit-2026-1/issues/153)  
**Completed baseline:** [Issue #150](https://github.com/ochowei/lpc-toolkit-2026-1/issues/150), [PR #152](https://github.com/ochowei/lpc-toolkit-2026-1/pull/152)  
**Predecessor:** [Agent-Assisted Asset Pack Release Lifecycle Follow-Up](2026-08-04-agent-assisted-asset-pack-release-lifecycle-follow-up.md)

## Summary

The four-phase release lifecycle in Issue #150 is complete. PR #152 added
declarations and final preview acceptance, draft recovery and sync, formal pack
and inspect, and optional installation in an independent consumer workspace.

The completed follow-up deliberately deferred several capabilities that require
new contracts, trust decisions, or separate product boundaries. This roadmap
records those deferred tracks, their dependencies, and the conditions for
opening focused implementation work. It does not implement any deferred
capability and must not be read as a Phase 5 implementation plan.

## Current boundary

```text
#149 authoring foundation
-> #150 governed release lifecycle (complete through #152)
-> #153 deferred roadmap (this document)
-> track-specific Issue/spec/plan
```

Issue #150 remains the source of truth for the completed release lifecycle.
This document owns only the work explicitly listed under “Deferred after this
follow-up” in that specification. Every implementation track below requires a
new, separately scoped Issue and spec before production code is changed.

## Deferred tracks

| Track | Scope | Proposed next artifact | Dependencies |
| --- | --- | --- | --- |
| D1. Release provenance | A versioned, deterministic, bounded projection of generation provenance into or alongside formal release artifacts, with capability and compatibility rules. | Focused provenance contract spec and implementation Issue. | Existing session receipts, formal archive bytes, capability negotiation. |
| D2. Provider and Agent integration | Provider discovery/invocation contracts plus optional Codex, Antigravity, Claude Code, and other Agent skill packaging. | Provider-neutral integration design and separate skill-package contract. | D1 provenance vocabulary; explicit human attribution and consent rules. |
| D3. Web-to-CLI bridge | Explicit transfer of an authoring session or review handoff between Web and CLI, including stale-state and ownership behavior. | Session-transfer contract spec. | Stable session/receipt schemas and capability negotiation. |
| D4. Remote distribution and trust | Remote registries, signing, marketplaces, global installation, npm publication, key/trust policy, and post-publication verification. | Distribution and trust model spec, separate from local asset lifecycle. | D1 provenance, formal archive compatibility, release authorization. |
| D5. Authoring intelligence | Natural-language routing, automatic variants/recolors, custom geometry, and complex multi-layer authoring. | Candidate-operation and human-review contract spec. | Explicit candidate import, preview acceptance, attribution, and consent. |
| D6. Cross-pack conflict resolution | Conflict identity, precedence, user-selected resolution, deterministic merge behavior, and attribution preservation across packs. | Conflict model and resolution UX/CLI contract spec. | Stable pack/registry semantics; likely D5-generated candidates. |

## Proposed order

The order is a planning recommendation, not permission to implement all tracks
as one release:

1. **D1 — release provenance.** Define what provenance may be released, how it
   is bounded and redacted, how it binds to archive bytes, and how older
   consumers refuse or safely ignore the new capability.
2. **D2 — provider and Agent integration.** Keep provider/tool/model/reference
   records as provenance; never treat them as the attribution author or as
   human consent. Keep skill packaging optional and capability-gated.
3. **D3 — Web-to-CLI bridge.** Design an explicit, inspectable handoff only
   after session and receipt compatibility is stable. Do not assume a backend,
   browser persistence, or shared authentication model.
4. **D4 — remote distribution and trust.** Treat signing, remote registries,
   marketplaces, global installation, and npm publication as a separate trust
   boundary with explicit maintainer authorization and post-publication gates.
5. **D5 — authoring intelligence.** Define deterministic candidate operations
   and human review before any natural-language or automatic authoring path can
   mutate a session.
6. **D6 — cross-pack conflict resolution.** Define conflict identity and
   resolution evidence before allowing any automatic merge or precedence rule.

The first executable follow-up should be a focused D1 Issue/spec, not provider
invocation, Agent skill packaging, Web bridging, or remote publication.

## Track contracts and boundaries

### D1. Release-safe generation provenance

The contract must decide, with explicit versioning:

- which provider, tool, model, reference, prompt-digest, candidate, import,
  and transformation fields are release-safe;
- whether the projection is an archive member, a manifest extension, or a
  separately addressed receipt, without silently changing existing formal
  archive bytes;
- how provenance binds to the exact source, manifest, preview, credits, and
  formal archive digests;
- which values are redacted or bounded to prevent secrets, private paths, or
  unreviewed user data from entering a release; and
- how capabilities and older consumers handle a formal artifact carrying the
  new projection.

It must not turn provenance into attribution, infer a human declarant, or
introduce a provider call. Deterministic serialization, attribution parity,
and old formal-fixture compatibility remain required.

### D2. Provider invocation, discovery, and Agent skills

This track may define provider-neutral discovery and invocation seams and
optional skill packages, but it must keep these concepts separate:

- a provider is a source of generation provenance, not an attribution author;
- a skill is an integration surface, not consent or release approval;
- an Agent may propose a candidate, but may not invent acknowledgement reasons,
  license authority, source authority, or human identity; and
- unsupported capabilities must stop with a stable refusal instead of silently
  falling back to a provider or a different workflow.

The track must state dependency, licensing, capability, sandbox, and secret
handling decisions before adding any package or integration.

### D3. Web-to-CLI session bridging

The bridge must define an explicit handoff format and ownership model for
session IDs, source references, receipts, artifacts, and stale evidence. It
must preserve the separation between Web browser state and CLI filesystem
state, reject ambiguous or tampered handoffs, and expose one safe recovery
action. A backend, account system, persistent browser store, or implicit
browser-to-filesystem authority is not assumed by this roadmap.

### D4. Remote registries, signing, marketplaces, global installation, and npm

Distribution work requires a dedicated trust model covering immutable identity,
signing keys, verification, rotation/revocation, namespace ownership,
provenance, authorization, downgrade/replacement policy, and post-publication
checks. Local archive inspection and consumer installation are not sufficient
to imply remote trust.

No tag creation, registry change, marketplace publication, global install, or
npm publication is authorized by this roadmap. Those actions remain subject to
the repository release rules and explicit maintainer authorization.

### D5. Natural-language and automatic authoring

Any routing, variant, recolor, geometry, or multi-layer operation must first
produce a bounded candidate operation or diff. The user must be able to inspect
the affected cells, source/credit impact, warnings, and exact preview before
confirmation. Operations must be deterministic, resumable, attribution-aware,
and safe under stale or conflicting source state. Natural-language intent must
never become implicit release consent.

### D6. Cross-pack conflict resolution

Conflict work must define the identity of a conflict, the evidence required to
resolve it, the allowed precedence or merge choices, and the resulting
attribution/registry receipt. A resolution must be explicit and reproducible;
the system must not silently choose a provider, pack, version, or source based
on discovery order, filesystem order, or Agent preference.

## Shared invariants

Every deferred track must preserve the completed lifecycle guarantees:

- attribution and matching `CREDITS.csv` metadata remain product logic;
- human identity, source authority, license authority, acknowledgement reasons,
  and visual acceptance are explicit and never inferred;
- existing manifest, archive, inspection, installation, registry, and
  transaction authorities remain authoritative;
- formal archive compatibility is versioned and capability-gated;
- `packages/core/` remains environment-agnostic;
- `upstream/`, checked-in assets, the verified base cache, and unowned output
  remain protected;
- strict TypeScript remains in force and no unapproved `any` is introduced;
- provider, skill, Web, remote, and publication boundaries are tested through
  public seams; and
- every CLI-sensitive implementation carries and reassesses the complete
  documentation-impact matrix.

## Delivery protocol for each track

Before implementation begins for a track:

1. Open a focused GitHub Issue linked to #153 and this roadmap.
2. Check in a track-specific spec with explicit goals, non-goals, boundaries,
   public contracts, compatibility, attribution, and acceptance criteria.
3. Write a separate implementation plan with focused red/green tests,
   documentation-impact assessment, exact verification commands, and the
   repository plan-record fields.
4. Implement only that track and preserve all deferred boundaries.
5. Run the narrowest checks first, then the required repository verification and
   packed acceptance before handoff.

For CLI-sensitive work, reassess this matrix in the implementation plan and
before handoff:

```text
help: update | N/A — <reason>
cli-readme: update | N/A — <reason>
root-readme: update | N/A — <reason>
landing: update | N/A — <reason>
architecture: update | N/A — <reason>
engineering: update | N/A — <reason>
releasing: update | N/A — <reason>
plugin: update | N/A — <reason>
```

## Roadmap acceptance

This roadmap is complete when:

1. All six deferred categories from the completed follow-up spec are listed
   without silently broadening their scope.
2. The proposed dependency order and first D1 follow-up are explicit.
3. Each track has a clear boundary, non-goals, trust/attribution constraints,
   and required next artifact.
4. The successor Issue and this checked-in spec are linked and reviewable.
5. No production provider, skill, browser bridge, remote registry, signing,
   marketplace, global-install, npm-publication, natural-language, or conflict
   resolution behavior is introduced by this roadmap.

The completed #150 lifecycle remains closed only after this successor tracking
surface is available. Closing #150 does not close or imply completion of any
deferred track.
