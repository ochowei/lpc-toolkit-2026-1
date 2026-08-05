# D2 — Provider-Neutral Invocation, Discovery, and Agent Integration Packaging

**Status:** Proposed track specification  
**Date:** 2026-08-05  
**Successor issue:** [Issue #159](https://github.com/ochowei/lpc-toolkit-2026-1/issues/159)  
**Roadmap:** [Issue #153](https://github.com/ochowei/lpc-toolkit-2026-1/issues/153)  
**Predecessor design:** [Agent-Assisted Asset Pack Authoring Product Design](./2026-08-03-agent-assisted-asset-pack-authoring-design.md)  
**Provider-neutrality decision:** [ADR-0007](../../../docs/adr/0007-keep-sprite-generation-provider-neutral.md)  
**D1 dependency:** [Release-safe generation provenance projection](./2026-08-05-release-safe-generation-provenance-projection.md), implemented by PR #158

## Summary

This specification defines the next deferred D2 boundary: provider-neutral
discovery and invocation contracts, plus optional packaging contracts for
Codex, Antigravity, Claude Code, and other Agent integrations.

It is a contract and trust-boundary specification only. It does not add a
provider call, provider SDK, provider discovery runtime, Agent skill, plugin
entry, Web bridge, backend, credential store, or new dependency. A separate
implementation plan and reviewed implementation PR are required before any
production behavior changes.

The existing CLI remains the cross-platform product authority. An Agent
integration may coordinate a user conversation and an available generation
provider, but it must use the public CLI capabilities, drawing contract,
authoring session, candidate import, validation, and release gates. A provider
never owns the manifest, source pixels, attribution, human consent, or release
approval.

## Current boundary and dependency order

The shipped path is:

```text
authoring session -> sprite drawing contract -> external candidate -> CLI import
                  -> validation/preview/human gates -> formal archive
                  -> D1 release-provenance companion
```

D2 adds a bounded optional handoff around the contract and candidate stages:

```text
CLI capabilities/session/contract
        -> Agent integration discovers an available provider
        -> explicit consent and provider preflight
        -> provider receives the contract and approved scope
        -> candidate staging + provider result envelope
        -> CLI contract-bound import and existing lifecycle gates
```

The split is deliberate:

- the CLI owns product capabilities, contract geometry, session state, paths,
  candidate inspection, import, provenance binding, validation, attribution,
  and release/installation policy;
- the Agent integration owns conversational presentation, provider adapter
  selection, consent presentation, and translation to public CLI commands;
- the provider owns only its generation operation and returns candidate pixels
  plus bounded result metadata through the integration boundary; and
- Core owns only environment-agnostic values, parsers, predicates, and digest
  projections. Core does not discover, authenticate, invoke, or sandbox a
  provider.

This track depends on the D1 vocabulary for `Generation provider`, `Candidate
sprite`, `Generation provenance`, and `Release provenance projection`. It does
not reopen the D1 archive/manifest boundary or change the completed #150
release lifecycle.

## Domain terms

The terms below use the repository glossary in `CONTEXT.md`:

| Term | Meaning in this track | Must not be confused with |
| --- | --- | --- |
| Generation provider | An optional tool or delivery path that produces candidate sprite pixels from a sprite drawing contract. | Attribution author, release authority, or Agent integration. |
| Agent integration | A platform-specific adapter that uses the public CLI workflow, such as a future Codex, Antigravity, or Claude Code integration. | Provider, plugin, or human consent. |
| Skill package | An optional distribution of Agent instructions, compatibility metadata, and public-CLI workflow references. | A provider binary, credential store, or release receipt. |
| Provider descriptor | A bounded declaration of provider identity, supported contract/capabilities, limits, network requirements, and adapter version. | Proof that the provider is trusted or approved. |
| Provider invocation | One consent-scoped attempt to produce a candidate from one exact contract and declared provider descriptor. | CLI import, validation, preview acceptance, or formal release. |
| Provider result | A bounded result envelope binding the provider, contract, candidate digest, inputs, and operation status. | Human authorship, license authority, or release approval. |
| Candidate sprite | A generated or externally supplied PNG held outside canonical pack source until CLI import validation succeeds. | Published or installed asset. |

## Goals

1. Define exact versioned discovery, preflight, invocation-handoff, result,
   refusal, and Agent-package contracts without provider-specific behavior in
   Core.
2. Make optional versus required capabilities and compatibility failures
   explicit and stable.
3. Require explicit consent for provider selection, provider changes,
   external references, network access, and any scope that materially changes
   the approved authoring plan.
4. Keep provider output inside the existing session-owned candidate boundary and
   route every accepted candidate through the existing public CLI import seam.
5. Bind provider results to the D1 generation-provenance projection without
   treating provider identity as attribution, human identity, or consent.
6. Define optional Agent skill-package metadata and compatibility rules without
   adding a new skill to the current plugin.
7. Specify privacy, secret, sandbox, path, size, timeout, cancellation, stale,
   and recovery behavior that can be tested through public seams.

## Non-goals

- Calling ImageGen, `generate2dsprite`, a model SDK, or any external provider.
- Discovering providers through a remote registry, marketplace, account system,
  browser session, or implicit operating-system integration.
- Adding or shipping a Codex, Antigravity, Claude Code, or other Agent skill.
- Adding provider credentials, a secret manager, backend, authentication
  service, network proxy, sandbox runtime, or new dependency.
- Adding natural-language routing, automatic variants/recolors, custom geometry,
  complex multi-layer authoring, or cross-pack conflict resolution.
- Adding Web-to-CLI session bridging or persistent browser authoring state.
- Changing formal archive bytes, the strict v1 manifest, D1 receipt placement,
  attribution/credits, human declarations, preview acceptance, or ordinary
  inspect/install semantics.
- Allowing a provider or Agent to edit manifests, final source PNGs, credits,
  acknowledgement reasons, release declarations, or registry state directly.
- Inferring identity, authorship, license/source authority, consent, or release
  approval from a provider, Agent, skill, Git, or the operating system.

## Ownership and trust boundaries

### CLI and Core

The CLI is the only owner of the public authoring application boundary. A later
implementation may add provider preflight and handoff commands, but those
commands must delegate to existing session and candidate-import authorities.
They must not create a second manifest parser, geometry engine, attribution
engine, archive writer, or release gate.

Core may own pure D2 schema parsing, normalized provider descriptors, digest
binding predicates, capability compatibility predicates, and refusal
diagnostics. Core must not import Node, browser APIs, a provider SDK, network
clients, plugin code, or secret handling.

The CLI may read and write only the existing session-owned staging and receipt
roots. Provider output is not accepted as canonical source until the public
candidate inspection/import path succeeds. A provider handoff may materialize a
contract-bound artifact, but it must not mutate the manifest or release gates.

### Agent integrations

An Agent integration may:

- read CLI capabilities, session state, contract metadata, and structured next
  actions;
- discover provider descriptors from its explicitly configured environment;
- present similar candidates, provider limits, network requirements, and consent
  scope to the user;
- invoke a selected provider through a provider-specific adapter after consent;
- stage a candidate only below the session-owned staging root; and
- call the public CLI result/import path and report returned evidence.

It must not read asset caches or private session files directly, derive LPC
geometry, edit manifest JSON, write final source pixels, invent attribution or
acknowledgement evidence, silently install the CLI, or turn a provider result
into release approval.

Natural-language routing remains a later D5 concern. D2 integrations may accept
an already bounded authoring plan or session scope; they must not introduce an
automatic route from an open-ended character concept to source mutation.

### Generation providers

A provider receives only the exact drawing contract, the approved scope, and
references that the user explicitly allowed. The provider returns candidate
pixels through the integration adapter and a bounded result envelope. The
provider has no authority over:

- `asset-pack.json`, credits, source ownership, or registry state;
- final artist-pack paths outside session staging;
- warning acknowledgement, author/license declaration, preview acceptance, or
  formal release; or
- the decision to retry with a different contract, provider, reference, or
  network scope.

When no provider is available, the workflow must return a durable external-
author handoff or `needs-user-action`; it must not silently choose another
provider or claim completion.

### Existing plugin

The current `plugins/lpc-toolkit/` remains limited to its shipped character and
animation-audit workflows. This spec does not add an asset-authoring skill,
provider adapter, capability claim, or plugin command. A future skill package
must pass a separate plugin contract review and use only the implemented public
CLI capabilities.

## Capability and compatibility contract

The following identifiers are reserved by this spec and must not be advertised
by the shipped CLI or plugin until a later implementation is reviewed:

Capabilities:

- `asset-authoring-provider-discovery.v1` — validates and reports bounded
  provider descriptors; it does not call a provider.
- `asset-authoring-provider-invocation.v1` — exchanges one exact contract,
  consent scope, candidate staging request, and bounded result/refusal envelope.
- `agent-integration-packaging.v1` — describes an optional Agent adapter's
  public-CLI compatibility and required/optional capability set.

Schemas:

- `lpc-toolkit.asset-provider-descriptor.v1`
- `lpc-toolkit.asset-provider-discovery.v1`
- `lpc-toolkit.asset-provider-invocation.v1`
- `lpc-toolkit.asset-provider-result.v1`
- `lpc-toolkit.asset-provider-refusal.v1`
- `lpc-toolkit.agent-integration-manifest.v1`

An integration must declare a compatible CLI SemVer range and its required and
optional capabilities. Required capability absence is a stable refusal with
upgrade guidance. Optional provider absence falls back to an external-author
handoff. An older CLI must ignore no unknown required field silently; it must
refuse the D2 operation before staging or mutation.

The existing `lpc-toolkit.asset-authoring-response.v1` envelope remains the
session authority. D2 responses may be projected into it only through an
additive, versioned field after implementation; they must not replace existing
`state`, `reason`, `checkpoint`, `nextActions`, or release-gate semantics.

## Public contract shapes

These shapes are the required semantic contract. Exact JSON key ordering and
resource limits must be fixed by the later implementation plan and Core tests.

### Provider descriptor

```json
{
  "schema": "lpc-toolkit.asset-provider-descriptor.v1",
  "id": "provider.example",
  "adapter": {
    "id": "agent-adapter.example",
    "version": "1.0.0",
    "cliRange": ">=0.3.0 <0.4.0"
  },
  "capabilities": [
    "sprite-candidate.v1"
  ],
  "contractVersions": [
    "sprite-drawing-contract.v1"
  ],
  "limits": {
    "maxCandidateBytes": 67108864,
    "timeoutSeconds": 600,
    "maxReferences": 8
  },
  "network": {
    "required": false,
    "declaredHosts": []
  },
  "credentials": {
    "required": true,
    "handledOutsideCli": true
  }
}
```

The descriptor contains identifiers, versions, bounded limits, and declared
requirements only. It never contains a credential, token, secret, raw prompt,
provider payload, absolute path, or claim of trust. `declaredHosts` is an
explicit requirement for consent and policy review, not an authorization to
connect.

### Discovery and preflight

Discovery is a bounded split, not a remote CLI registry:

1. The CLI advertises its own public capabilities and contract versions.
2. The Agent integration discovers available provider descriptors from its
   explicitly configured environment.
3. The integration passes one descriptor to a CLI-owned preflight seam.
4. The CLI checks the descriptor against the exact session contract, scope,
   limits, and required capability set without invoking the provider.

The discovery response sorts descriptors by stable `id`, reports supported,
unsupported, unavailable, and consent-required states, and never chooses a
provider silently. It must not enumerate or download providers from a remote
registry.

### Invocation handoff

The invocation envelope binds:

- `sessionId` and exact `contractDigest`;
- target IDs and the contract version;
- provider and adapter IDs/versions;
- consent scope digest and confirmation state;
- approved reference digests and input digests;
- candidate staging requirements and resource limits; and
- the requested operation, which is one bounded provider operation identifier.

It contains no raw prompt or provider payload. The provider may keep private
execution details in its own system, but the Agent integration must return only
the bounded result data required to continue the CLI workflow.

### Result and refusal

A successful result binds the provider and adapter identity, contract digest,
candidate result digest, optional input/reference digests, operation ID, and
the session-owned candidate staging path. The CLI re-digests the candidate and
does not trust a provider-reported digest by itself.

A refusal binds the same session/contract/provider scope and one stable code.
Required refusal codes are:

- `asset_provider_unavailable`
- `asset_provider_capability_unsupported`
- `asset_provider_contract_mismatch`
- `asset_provider_consent_required`
- `asset_provider_scope_violation`
- `asset_provider_network_denied`
- `asset_provider_secret_input`
- `asset_provider_result_invalid`
- `asset_provider_result_stale`
- `asset_provider_cancelled`
- `asset_provider_timeout`
- `agent_integration_capability_unsupported`

Refusal is not a failed release and must preserve the last valid authoring
checkpoint. A stale, cancelled, timed-out, or invalid result cannot be imported
and must expose one safe next action: re-materialize the current contract,
provide a new external candidate, or retry only after the stated precondition
is satisfied.

## Consent, privacy, and sandbox policy

Read-only capability inspection, contract materialization, descriptor parsing,
and result schema validation do not require additional provider consent.

Explicit user confirmation is required for:

- first provider selection when the user did not name one;
- every provider change or adapter change;
- adding an external reference or changing the reference set;
- network access or a declared host outside the current approval;
- any candidate write, replacement, or source path outside the session staging
  root; and
- any operation that expands the approved pack, target, body, animation, or
  resource-limit scope.

One consent scope may cover bounded retries only while provider, adapter,
contract digest, references, path root, limits, and network policy remain
unchanged. The integration must request new consent when any of those bindings
changes. An Agent may draft the consent explanation, but only a human or
explicitly authorized reviewer supplies the confirmation evidence.

Provider and integration boundaries must enforce:

- session-root containment, regular-file checks, no symlink traversal, and no
  writes to checked-in `assets/`, the verified base cache, unowned output, or
  `upstream/`;
- exact PNG, geometry, alpha, byte, entry, reference, timeout, and cancellation
  limits before CLI import;
- no credentials, raw prompts, provider payloads, environment values, private
  URLs, home/repository paths, or human identity in public D2 envelopes or D1
  release projections;
- declared network requirements as consent inputs, with network disabled by
  default at the CLI boundary and no hidden fallback; and
- durable refusal and checkpoint preservation when the provider or integration
  disappears, is cancelled, times out, or returns a stale result.

## Agent integration and skill-package contract

An optional integration manifest is a compatibility document, not a provider
installer or release receipt:

```json
{
  "schema": "lpc-toolkit.agent-integration-manifest.v1",
  "id": "agent.example.lpc-authoring",
  "version": "1.0.0",
  "cliRange": ">=0.3.0 <0.4.0",
  "requiredCapabilities": [
    "asset-authoring-session.v1",
    "sprite-drawing-contract.v1",
    "asset-authoring-candidate-import.v1"
  ],
  "optionalCapabilities": [
    "asset-authoring-provider-discovery.v1",
    "asset-authoring-provider-invocation.v1"
  ],
  "supportedGoals": [
    "new-item",
    "extend-item"
  ],
  "providerAdapters": []
}
```

The package contract requires:

- public CLI invocation and documented JSON response parsing only;
- a checker that validates CLI SemVer and required capabilities before any
  authoring operation;
- explicit fallback to external-author handoff when optional provider
  capabilities are absent;
- no CLI source imports, cache reads, direct manifest edits, silent CLI
  installation, credential collection, or hidden network calls;
- independently versioned package and CLI compatibility metadata; and
- no claim that an Agent integration or skill is an attribution author,
  rights declarant, warning reviewer, or release approver.

Codex, Antigravity, and Claude Code may package these instructions differently,
but they must consume the same public capability and schema contract. A future
plugin implementation requires its own plugin contract update, compatibility
fixtures, documentation matrix, and release review. This spec does not add a
new skill to `plugins/lpc-toolkit/`.

## Compatibility, recovery, and release behavior

- Existing D1 sessions and formal archives remain readable without D2 fields.
- An implementation must advertise D2 capabilities only when the corresponding
  public seams are shipped and tested.
- Unknown required D2 capability/schema versions fail closed before provider
  invocation or candidate mutation.
- Missing optional provider capability falls back to a durable external-author
  handoff; it is not a CLI failure and not evidence of completed authoring.
- Provider result/source/contract drift invalidates the dependent checkpoint and
  preserves the previous valid evidence.
- D2 result records feed the existing D1 `provider-output`, `external-input`,
  or `source-transformation` projection; D2 does not add a ZIP member or
  manifest field.
- Human declaration, warning acknowledgement, preview acceptance, formal pack,
  inspect, and installation remain separate existing gates.
- A provider or Agent integration cannot publish a formal archive, install a
  consumer workspace, or claim release readiness without the existing CLI
  authorities and human gates.

## Focused acceptance and verification

The implementation plan must use public seams and real temporary roots. It must
not mock private Core/CLI collaborators or call a real provider.

### Core and format

- strict schema identity, exact keys, canonical property ordering, bounded
  identifiers, digest syntax, limits, and privacy rejection;
- descriptor capability/version compatibility and stable refusal codes;
- invocation/result binding to session, contract, provider, candidate, input,
  and reference digests;
- no raw prompt, provider payload, credential, private path, environment value,
  or human approval claim in D2 or D1 projections; and
- no archive member, manifest field, attribution regression, or ordinary v1
  install change.

### CLI public seams

- capability/preflight refuses unsupported or mismatched providers without
  invoking anything or mutating the session;
- explicit consent is required at each scope expansion and unchanged scoped
  retry is idempotent;
- valid fake-provider result plus real fixture PNG enters the existing
  candidate-import path and produces normal stale/validation/preview evidence;
- stale, cancelled, timed-out, invalid, private, unsafe-path, and over-limit
  results preserve previous session bytes and expose one safe next action; and
- provider result metadata binds to D1 provenance without changing formal archive
  bytes or ordinary installation.

### Agent package and packed acceptance

- an installed-package checker accepts a compatible manifest and refuses older
  CLI versions, missing required capabilities, malformed metadata, and direct
  private-source/cache access;
- a clean packed CLI can materialize a contract, run a deterministic fake
  provider adapter through the handoff/result seam, import a real PNG, and
  continue through existing validation/preview gates;
- no real provider, network, credential, new plugin skill, Web bridge, backend,
  or remote registry is needed;
- provider absence falls back to external-author handoff; and
- checked-in assets, base cache, artist source, unowned output, formal archive,
  receipt, and `upstream/` sentinels remain unchanged except for the intended
  session-owned candidate/import paths.

Tests must run against the public packaged CLI for packed acceptance and must
record JSON responses, refusal diagnostics, filesystem snapshots, exact digests,
and attribution evidence rather than only exit codes.

## Documentation impact for the later implementation

The implementation plan must carry and reassess the complete CLI-sensitive
matrix:

```text
help: update — provider capabilities, preflight/handoff/result commands, consent, refusal, and next actions
cli-readme: update — provider-neutral integration contract, result boundaries, and external-author fallback
root-readme: update — distinguish Agent integration/provider generation from composition, attribution, and release authority
landing: update — explain optional provider/Agent integration without implying built-in providers or approval
architecture: update — Core/CLI/Agent/provider/package ownership and no-private-source boundary
engineering: update — schema, privacy, sandbox, fake-provider, packed, compatibility, and protected-path verification
releasing: update — capability/version/package compatibility and release-gate separation
plugin: update — only after a separately reviewed skill-package implementation; this spec adds no plugin capability
```

The spec itself does not change production documentation or claim that these
capabilities are shipped. A later implementation PR must not advertise a
capability before its public seam, tests, package compatibility, and refusal
behavior are complete.

## Delivery protocol

1. Review and merge this track-specific spec and link it from Issue #159 and
   roadmap Issue #153.
2. Create a separate implementation plan with exact schemas, public argv,
   capability identifiers, red/green seams, documentation matrix, and full
   verification commands.
3. Implement only the approved provider-neutral and Agent-package contract.
4. Keep real provider adapters, credentials, network services, Web bridging,
   and new skills outside the implementation until each receives explicit
   scope and review.

No production code, provider call, Agent skill, Web bridge, dependency,
manifest change, archive member, or release behavior is introduced by this
specification.
