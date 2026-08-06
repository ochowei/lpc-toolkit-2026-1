# D5 — Authoring Intelligence

**Status:** Proposed track specification — review required before implementation  
**Date:** 2026-08-06  
**Issue:** [#176](https://github.com/ochowei/lpc-toolkit-2026-1/issues/176)  
**Roadmap:** [#153](https://github.com/ochowei/lpc-toolkit-2026-1/issues/153)  
**Base:** D4 implementation merged by [PR #175](https://github.com/ochowei/lpc-toolkit-2026-1/pull/175), merge commit `3a3665c84396ed80fb6c4d0c7476fccdebb2913d`  
**Predecessors:** D1 provenance, D2 provider-neutral invocation, D3 Web-to-CLI handoff, and D4 distribution/trust  
**Implementation rule:** This specification and its separate implementation plan must be reviewed and merged before D5 product implementation begins.

## Summary

D5 adds a deterministic authoring-intelligence layer above the existing LPC
catalog, authoring session, drawing contract, candidate staging, candidate
import, validation, preview, attribution, provenance, and release authorities.
It accepts a bounded natural-language request, explains the catalog-first
route, and can materialize explicit candidate operations for:

- a new or derived variant;
- an existing recolor or a user-supplied palette transformation;
- an explicitly described custom geometry contract; and
- a bounded complex multi-layer candidate set.

The word *intelligence* describes routing, planning, and deterministic
operation composition. D5 does not require an AI model, model SDK, provider
runtime, network service, or opaque inference. A request that cannot be
resolved by the bounded deterministic router returns `needs-user-action` or a
stable refusal with a concrete next action. An external Agent or model may
offer an untrusted structured hint in a future integration, but that hint is
validated, displayed, and confirmed as user input; it is never a D5 runtime
dependency or an authority.

D5 never imports a candidate, changes canonical pack source, acknowledges a
warning, accepts a preview, declares a release, packages an archive, installs
an asset, or publishes anything automatically. Every proposed output remains
in session-owned candidate staging until the existing explicit candidate
import path is invoked, followed by the existing validation, attributed
preview, human review, and release gates.

## Relationship to earlier tracks

D2 explicitly deferred natural-language routing, automatic variants/recolors,
custom geometry, and complex multi-layer authoring. D5 is the reviewed,
bounded successor for those capabilities. D2 provider discovery and invocation
remain optional inputs only; D5 must work with no provider. D3 remains a file
handoff boundary and does not gain persistent browser state. D4 trust and
distribution remain downstream release boundaries and are not replaced by a
candidate operation receipt.

The following existing authorities remain unchanged:

```text
catalog and geometry authorities
  -> D5 route and deterministic operation plan
  -> session-owned candidate staging
  -> existing contract-bound candidate import
  -> existing validation and attribution checks
  -> existing attributed preview
  -> human review / explicit release gates
  -> existing archive, provenance, distribution, and install authorities
```

## Goals

1. Route bounded natural-language requests through catalog discovery before
   proposing new pixels or derived operations.
2. Produce deterministic, digest-bound candidate operation plans that can be
   replayed, inspected, rejected, and recovered without a model or provider.
3. Support bounded automatic variant and recolor operations while preserving
   source identity, palette ownership, attribution, and provenance.
4. Support explicit custom geometry supplied through a strict versioned
   contract; never infer geometry from remembered LPC conventions or prose.
5. Support bounded complex multi-layer authoring as a set of independently
   contract-bound candidate targets with a deterministic layer graph.
6. Make candidate proposal, staging, import, validation, preview, visual
   review, and release readiness separate observable states.
7. Preserve consent, attribution, D1 generation provenance, D2 provider
   evidence, D3 handoff evidence, refusal, and recovery semantics.
8. Provide public JSON/human responses and capability/schema declarations that
   older integrations can reject safely.

## Non-goals and hard limits

- No model SDK, model file, prompt execution service, provider runtime,
  network call, backend, authentication, credential store, or new dependency.
- No automatic publication, signing, registry/marketplace mutation, npm
  publication, consumer installation, or release declaration.
- No direct candidate-to-source write. The existing `asset authoring import`
  authority remains the only candidate import boundary.
- No direct manifest, credit, acknowledgement, release-receipt, registry, or
  installed-source mutation by D5 operations.
- No natural-language guessing when the catalog, target, operation, geometry,
  layer graph, or rights evidence is ambiguous.
- No arbitrary geometry, unbounded canvas size, unrestricted layer count,
  unsupported body types, implicit animation invention, or hidden fallback to
  a different asset.
- No use or initialization of `upstream/`, checked-in source assets, the
  verified base cache, unowned output, or browser persistent authoring state.
- No weakening of attribution, consent, validation, preview, release,
  provenance, trust, or architecture gates.
- Existing `asset-pack.v1` archive bytes, manifest shape, install behavior,
  plugin behavior, and ordinary character composition remain backward
  compatible unless a reviewed D5 schema explicitly adds a new optional
  candidate contract and regression tests prove the old path unchanged.

## Domain terms and authority

| Term | D5 meaning | Must not be confused with |
| --- | --- | --- |
| Request | A bounded user-provided natural-language input plus an optional explicit structured hint | an approved operation or consent record |
| Route | A deterministic explanation of which existing workflow or authoring goal fits the request | a source mutation or release decision |
| Candidate operation | A pure, digest-bound transformation description with exact inputs and outputs | a candidate import or canonical source write |
| Candidate set | One or more staged PNG candidates and their operation receipts | a formal archive or installed asset |
| Custom geometry | Explicit user/contract-provided frame, cell, row, and canvas geometry | inferred dimensions or visual-model output |
| Layer graph | A bounded deterministic set of layer targets, z-order, dependencies, and compositing references | a flattened replacement for the manifest/compiler |
| Human review | A user or explicitly authorized reviewer inspecting the exact attributed preview and confirming the applicable gate | Agent/model/provider output |
| Operation provenance | D1 `source-transformation` evidence for a deterministic operation and its inputs | authorship, license authority, or human consent |

Core owns pure request normalization, route decisions, operation schemas,
canonical projections, geometry/layer predicates, and deterministic pixel
operation descriptions. CLI owns session filesystem staging, existing PNG
inspection/import, receipts, validation/preview orchestration, and recovery.
Web and Agent integrations may present the route and candidates but may not
become an alternate source or release authority.

## Public identifiers and compatibility

The following identifiers are reserved by this specification and must not be
advertised until their implementation and tests are complete:

Capabilities:

- `asset-authoring-intelligence-routing.v1`
- `asset-authoring-deterministic-operations.v1`
- `asset-authoring-custom-geometry.v1`
- `asset-authoring-multi-layer-candidates.v1`

Schemas:

- `lpc-toolkit.asset-authoring-intelligence-request.v1`
- `lpc-toolkit.asset-authoring-intelligence-route.v1`
- `lpc-toolkit.asset-authoring-operation-plan.v1`
- `lpc-toolkit.asset-authoring-candidate-operation.v1`
- `lpc-toolkit.asset-authoring-candidate-set.v1`
- `lpc-toolkit.asset-authoring-intelligence-receipt.v1`
- `lpc-toolkit.sprite-drawing-contract.v2` for explicit D5 geometry/layer
  extensions; `sprite-drawing-contract.v1` remains unchanged and valid.

The existing `lpc-toolkit.asset-authoring-response.v1` remains the outer
session response authority. D5 responses add bounded fields only; they do not
replace `state`, `reason`, `checkpoint`, `nextActions`, or existing release
gate semantics. An older CLI or integration that lacks a required D5
capability must return a stable unsupported-capability response before
staging or mutation. Optional D5 support falls back to the existing manual or
external-author workflow.

## Natural-language routing contract

The route operation is read-only. It receives:

```text
requestText: bounded UTF-8 text, not persisted in a public receipt
requestDigest: sha256 of the exact normalized input
catalogSnapshotDigest: exact catalog/palette/geometry snapshot used
sessionScope: optional existing session/pack/target scope
explicitHints: optional user-confirmed structured constraints
```

The deterministic router uses a fixed, checked-in vocabulary and explicit
catalog predicates. It may normalize synonyms, classify requested asset kind,
body, animation, variant/recolor intent, geometry intent, and layer intent,
but it must not invent a missing asset, license, author, geometry, palette,
layer relationship, or provider. The route result contains:

- the normalized intent and its digest;
- exact catalog candidates and materially similar candidates, sorted by stable
  identity;
- why composition, recolor, extension, or new authoring is proposed;
- the required capabilities and missing optional capabilities;
- the proposed operation kind and bounded scope; and
- one of `compose-existing`, `extend-existing`, `derive-variant`,
  `derive-recolor`, `custom-geometry`, `multi-layer`, `needs-user-action`, or
  `refused`.

If multiple routes are equally plausible, the router returns
`needs-user-action` with a finite choice list. If no safe route exists, it
returns `refused` and preserves the current session. A failed exact string
match is never proof that no catalog candidate exists.

The route response never includes raw cache paths, absolute paths, candidate
pixels, credentials, provider payloads, or approval text. It may include
portable logical identities, bounded summaries, digests, and safe CLI next
actions.

## Deterministic candidate operation contract

Every operation is a pure record with:

```text
operationId
operationKind
inputCandidateDigests / inputAssetIdentities
contractDigest(s)
catalogSnapshotDigest
normalizedParameters
outputTargetIdentities
operationDigest
```

The canonical operation digest excludes timestamps, random IDs, local paths,
environment values, credentials, raw request text, and provider payloads. The
same exact inputs, contract, catalog snapshot, and parameters produce the
same operation digest and candidate bytes. A replay with the same operation
and output already present is a verified no-op; a changed input or output is a
stale/conflict state, never an automatic overwrite.

The operation engine is bounded by fixed limits for input count, output count,
PNG byte size, canvas dimensions, frame count, layer count, dependency depth,
and recolor map size. Operations are represented as a sorted DAG. Cycles,
duplicate target identities, traversal paths, unsupported operations, and
resource-limit violations fail before candidate staging.

An operation may materialize bytes only under the current session-owned
candidate staging root. The materialization receipt binds the operation,
contract, inputs, output digest, byte length, and staging-relative logical ID.
The receipt is evidence for the next explicit import; it is not a source or
release receipt.

## Variants and recolors

### Variants

A variant operation derives a candidate from an exact existing candidate or
catalog asset identity. It must state whether it is:

- an asset-defined physical variant already present in the catalog;
- a deterministic structural variant using an explicit operation template; or
- an external candidate transformation supplied by the user.

The operation cannot silently change the asset identity, body support,
animation contract, layer, z-position, or source license. Existing baseline
credits and source obligations remain attached. A variant that requires a new
human-authored source or a missing reference returns `needs-user-action`.

### Recolors

A recolor operation uses the existing Core palette/recolor authorities and
produces a new candidate operation receipt. A palette may come from an exact
catalog palette identity or from an explicit user-supplied, validated palette
map. The operation must verify channel length, source ramp identity, target
ramp identity, alpha preservation, and deterministic pixel output. It may not
invent a license, alter `CREDITS.csv`, mutate a source pack, or treat a color
preview as human approval.

Palette selection is an operation input, not a rights declaration. Asset-owned
secondary color channels and existing primary recolor compatibility remain
unchanged. A recolor that cannot be resolved to a known palette or explicit
user map refuses rather than approximating nearest colors.

## Custom geometry

Custom geometry is supported only through `sprite-drawing-contract.v2` and an
explicit geometry object. The object must provide exact canvas size, frame
size, row/direction mapping, logical frame mapping, cell policies, alpha
rules, layer context, body support, and all target paths. It must be bound to a
contract digest and a user-confirmed operation plan.

The D5 geometry validator enforces:

- integer dimensions and fixed maximum canvas/frame/resource limits;
- complete, non-overlapping cell coordinates within the canvas;
- explicit `required-drawn`, `optional-transparent`, `required-transparent`,
  and `unchanged` policies;
- transparent RGBA PNG output with no guide/background pixels;
- explicit source/reference digests for repairs or transformations; and
- compatibility with the target asset, animation, body types, layer graph,
  and existing compiler inputs.

Natural-language text may request custom geometry but may not supply implicit
geometry. Missing or contradictory values return a bounded choice/refusal
response. D5 must not reinterpret a v1 contract as v2 or silently coerce a
v2 contract into remembered LPC defaults.

## Complex multi-layer authoring

A multi-layer candidate set contains a strict layer graph:

```text
layerId, zPos, target identity, body/animation scope,
input/reference digests, dependency IDs, operation digest
```

The graph is sorted by stable layer ID and z-position, has bounded node and
edge counts, forbids cycles and duplicate target ownership, and declares the
visibility/occlusion relationship required for preview. Each layer produces an
independent contract-bound candidate target. A composite preview uses the
existing composition/preview authority; it is never itself imported as a
replacement for the independent source layers unless an explicit contract
declares that flattened target.

Complex layering requires an explicit human scope confirmation covering every
layer, target, body type, animation, path, reference, and output limit. Missing
layer attribution, unresolved z-order, cross-pack source ownership, or a
dependency that is not digest-bound returns refusal/recovery evidence. D5 does
not resolve cross-pack conflicts; that remains D6.

## Candidate, import, preview, and human-review lifecycle

The only accepted D5 lifecycle is:

```text
route request
-> disclose candidates and operation plan
-> explicit scope/consent confirmation
-> deterministic operation materialization in candidate staging
-> explicit existing candidate import
-> existing validation and attribution checks
-> existing attributed preview
-> explicit human visual review/preview acceptance
-> existing acknowledgement, author/license, declaration, pack, inspect,
   distribution, and install gates
```

`route` and operation inspection are read-only. Materializing staged
candidates requires a bounded authoring-plan consent. `asset authoring import`
remains explicit and must receive the exact candidate path, target, contract
digest, and any required replacement digest. D5 may not call a private import
helper or bypass the public import command. The existing preview is the only
preview accepted by the release lifecycle; a route thumbnail or operation
preview is informative only.

An operation result can be `staged`, `needs-user-action`, `stale`, `refused`,
or `failed`. None of these states claims that a source was imported, a preview
was accepted, or a release is ready. A final `completed` state is available
only when the existing release lifecycle reaches its own release-ready state.

## Attribution, provenance, consent, and human authority

Attribution rules:

- Existing source and reference credits are preserved by exact identity and
  digest; D5 never synthesizes author, URL, license, or credit rows.
- A provider, Agent, model, operation engine, or palette name is provenance,
  not an attribution author or license authority.
- A human rights declarant must confirm new author/license/source evidence
  before formal release. Suggestions from a route or operation are not proof.
- Multi-layer candidates preserve attribution per source/layer and include
  inherited-credit evidence in the existing preview/release authorities.

Consent rules:

- Catalog routing, candidate disclosure, capability checks, and operation
  inspection are read-only.
- Staging requires a scope covering session, pack, targets, operation kind,
  input/reference digests, path root, resource limits, and any external
  network/provider declaration. D5 defaults network to disabled.
- Changing a contract, catalog snapshot, input, palette, layer graph, target,
  provider, reference, or replacement scope requires fresh confirmation.
- Existing-source replacement, custom geometry, multi-layer staging, source
  import, warning acknowledgement, preview acceptance, release declaration,
  packaging, and installation retain their existing specific confirmations.

Human review is required for the exact attributed preview after all candidate
operations and imports are current. D5 may explain visual checks and prepare a
review checklist; it may not mark visual acceptance or acknowledgements as
complete.

## Refusal, stale-state detection, and recovery

D5 must distinguish at least:

- `asset_authoring_intelligence_request_ambiguous`
- `asset_authoring_intelligence_catalog_stale`
- `asset_authoring_intelligence_capability_unsupported`
- `asset_authoring_intelligence_operation_invalid`
- `asset_authoring_intelligence_input_drift`
- `asset_authoring_intelligence_contract_stale`
- `asset_authoring_intelligence_geometry_unsupported`
- `asset_authoring_intelligence_layer_conflict`
- `asset_authoring_intelligence_attribution_incomplete`
- `asset_authoring_intelligence_consent_required`
- `asset_authoring_intelligence_candidate_stale`
- `asset_authoring_intelligence_resource_limit`
- `asset_authoring_intelligence_protected_path`

Every refusal identifies the stable state, the exact invalidated digest or
scope (without private paths or raw pixels), and one safe next action chosen
from `review-route`, `refresh-catalog`, `refresh-contract`, `recompute-from-
exact-inputs`, `provide-explicit-geometry`, `resolve-layer-scope`,
`confirm-attribution`, `re-import-candidate`, `discard-staged-candidate`, or
`resume-session`.

Recovery is explicit and digest-bound. A changed input never causes D5 to
adopt the new bytes automatically; a changed session never causes it to
overwrite a newer operation; and a failed multi-layer operation preserves
valid sibling candidates. Discard is limited to the exact session-owned
staging operation and does not delete user source, formal archives, receipts,
or external evidence.

## Privacy and resource policy

Public D5 responses and receipts may include bounded logical identities,
operation/contract/input/output digests, stable diagnostic codes, capability
IDs, and safe next actions. They must not include raw request text, prompts,
provider payloads, credentials, environment values, absolute paths, home
paths, private URLs, raw PNG bytes, or approval text. Request text may be read
for routing but is represented in durable evidence only by its digest and
normalized intent summary.

The implementation fixes maximum request bytes, candidate bytes, operation
nodes, graph depth, layer count, target count, canvas dimensions, frame count,
palette entries, and total staging bytes. It must reject before decoding or
materializing content that exceeds a limit.

## Architecture and compatibility boundary

- Core remains environment-agnostic: no Node filesystem, browser APIs, model
  SDKs, provider calls, network, or image decoder dependency.
- CLI owns deterministic materialization, filesystem containment, candidate
  staging, and orchestration through existing public authorities.
- Web may display route/candidate evidence only through an explicit future
  surface; D5 does not introduce persistent browser authoring state or a
  Web-to-CLI runtime bridge.
- D1 provenance receives bounded `source-transformation` records for D5
  operations and preserves D2 provider records as optional inputs. D3
  handoff evidence remains a local transfer receipt. D4 trust/distribution
  sees only the existing release artifacts after all D5 gates.
- No v1 archive member or manifest field is added. D5 candidate contracts and
  receipts are session-owned sidecars/records unless a later reviewed release
  provenance projection binds their digests.

## Acceptance and testing strategy

Tests must be TDD-first and use public seams plus independent expected
fixtures:

1. Pure routing fixtures cover exact matches, similar candidates, variants,
   recolors, extension, custom geometry, multi-layer intent, ambiguity,
   unsupported requests, bounded text, privacy, and deterministic route
   digests.
2. Core operation fixtures cover replay identity, property/order
   normalization, palette swaps, alpha preservation, explicit geometry,
   layer DAG ordering, cycle/duplicate rejection, resource limits, and no
   random/model/provider calls.
3. CLI tests cover session scope, staging containment, candidate receipt
   binding, stale input/contract/catalog detection, replacement confirmation,
   preserved sibling layers, D1/D2/D3 evidence projection, refusal/recovery,
   JSON/human parity, and unchanged source/manifest/credits before import.
4. Public end-to-end tests invoke the packed CLI with real non-trivial PNG
   fixtures: route a request, stage a recolor/variant, stage an explicit
   custom-geometry target, stage a multi-layer set, import explicitly,
   validate, preview with attribution, require human review, and prove that
   release gates remain closed before approval.
5. Regression tests prove ordinary v1 archive, character, preview, import,
   plugin, D1, D2, D3, and D4 behavior is unchanged.
6. Full boundary, strict TypeScript, docs policy, plugin policy, packed CLI,
   and full repository verification remain required.

No test may invoke a real provider, model, network, backend, credential,
registry, marketplace, npm publication, key operation, or browser persistence.

## Documentation impact matrix

D5 adds public CLI authoring-intelligence behavior and must reassess every
owned documentation surface before implementation and before handoff:

```text
help: update
cli-readme: update
root-readme: update
landing: update
architecture: update
engineering: update
releasing: update
plugin: N/A — D5 does not add or modify a plugin capability or skill
```

The implementation PR must carry the matching machine-checked declaration for
changed surfaces. The landing update documents the workflow boundary; it does
not imply that a browser model, persistent browser session, or Web authoring
surface was added. The plugin remains N/A unless the reviewed scope changes,
in which case the spec and plan must be amended before implementation.

## Review questions

The spec/plan review must explicitly confirm:

- the deterministic router's supported vocabulary and refusal behavior;
- the exact v2 geometry/layer contract versus preserving v1;
- resource limits for operations and multi-layer candidate sets;
- the scope of automatic variant/recolor transformations;
- whether D5 staging requires a separate confirmation from existing session
  plan consent; and
- that no implementation task can be satisfied by an opaque model dependency,
  automatic import, preview bypass, or release automation.
