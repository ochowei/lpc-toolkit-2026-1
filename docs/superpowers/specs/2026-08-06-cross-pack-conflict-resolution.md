# D6 — Cross-pack Conflict Resolution

**Status:** Proposed contract — review and merge required before product implementation  
**Issue:** [#179](https://github.com/ochowei/lpc-toolkit-2026-1/issues/179)  
**Roadmap:** [#153](https://github.com/ochowei/lpc-toolkit-2026-1/issues/153)  
**Predecessor:** D5 Authoring Intelligence, [PR #178](https://github.com/ochowei/lpc-toolkit-2026-1/pull/178), merged as `a7442dd85cfc6ac07bf218032b7fb73e3ecf717f`  
**Scope:** Contract, compatibility, UX/CLI, and verification design only. No product implementation is authorized by this document.

## Purpose

D6 defines how the toolkit reports and resolves incompatible contributions from
multiple asset packs or pack versions when they address the same logical asset,
definition, generated destination, credit record, or replacement scope. The
system must make the competing evidence inspectable, require a user-selected
resolution, produce the same result from the same inputs, and preserve the
attribution and audit trail of every retained contribution.

The existing compiler, registry, validation, preview, release, distribution,
and installation authorities remain authoritative. D6 adds a conflict model and
resolution evidence around those authorities; it does not create a second
manifest, archive, source, registry, or release implementation.

## Goals

1. Give every conflict a stable identity independent of filesystem enumeration,
   discovery order, timestamps, temporary paths, or Agent/provider preference.
2. Represent all eligible contenders with exact pack/version/content/source,
   compatibility, trust, attribution, and provenance evidence.
3. Make precedence an explicit policy and make the selected resolution an
   explicit user action. No default winner is inferred.
4. Merge only disjoint, digest-bound semantic changes; require a selected
   contender or a refusal for incompatible output bytes or ownership.
5. Preserve source credits, licenses, acknowledgements, D1 provenance, D2
   evidence, D4 verification evidence, and D5 candidate-operation evidence.
6. Make stale, refused, recovered, and discarded resolutions durable and
   inspectable without mutating protected source or release state.
7. Leave `asset-pack.v1` archive bytes, manifest behavior, install behavior,
   plugin behavior, and existing human/release gates unchanged unless a later
   approved implementation explicitly adds a versioned compatibility contract.

## Non-goals and hard boundaries

- No silent “latest version wins”, filesystem-order winner, discovery-order
  winner, provider preference, Git merge, or Agent-selected winner.
- No automatic conflict resolution, automatic consent, inferred identity,
  inferred license authority, inferred authorship, or inferred visual approval.
- No remote registry, marketplace, signing, key creation, npm publication,
  backend, authentication, authorization service, network call, new dependency,
  or external service mutation. Tests use local fixtures and fakes only.
- No bypass of existing candidate import, validation, attributed preview,
  acknowledgement, human declaration, release, provenance, trust, archive,
  distribution, or installation gates.
- No mutation of `upstream/`, checked-in assets, the managed base cache, an
  unowned output root, or another pack’s source directory.
- No persistent browser authoring state or browser-to-CLI session authority.
  A future Web caller may exchange a file-scoped conflict receipt only through
  an explicitly reviewed handoff contract.

## Domain model

### Pack snapshot

A pack snapshot is the immutable evidence used for one conflict evaluation:

```text
packId, version, contentDigest, sourceDigestSet, manifestDigest,
archiveDigest?, registryEntryDigest?, trustReceiptDigest?, compatibility,
generated ownership, credits, acknowledgements, provenance references
```

`packId` and `version` identify the declared pack. `contentDigest` identifies
the normalized pack content. Source, manifest, archive, registry, trust, and
provenance digests identify the evidence actually read; they are not inferred
from a path or display name. An installed archive and a linked source are
distinct snapshots even when their pack identity is equal.

### Conflict target

A conflict target is the smallest stable semantic scope that can have competing
values. Its key is one of:

```text
generated-destination: logical destination path + asset identity + animation/body/layer scope
definition: logical definition path + item identity
credit: logical credit file/path + affected asset scope
replacement: replaced pack identity + version range + asset scope
compatibility: pack identity + required capability/version rule
```

The key contains portable logical values only. Absolute paths, temporary
workspace IDs, user names, timestamps, and raw provider payloads are excluded.
Two outputs with the same bytes and compatible attribution are equivalent
contenders, not a conflict. Different bytes, incompatible semantic fields,
ownership reassignment, incompatible credits/licenses, or incompatible
replacement claims remain a conflict even when one contender looks newer.

### Contender

Each contender is a bounded, digest-bound record containing:

```text
contenderId, pack snapshot, target key, result digest, base snapshot digest,
source/credit/provenance reference digests, compatibility evidence,
trust/verification evidence, origin kind, and candidate-operation evidence?
```

`origin kind` is one of `pack-source`, `installed-archive`, `d5-candidate`,
or `explicit-user-edit`. A D2 provider result is evidence attached to a
candidate; it is never itself a contender author or a resolution choice.

## Conflict identity and schema contract

D6 introduces the versioned conflict record
`lpc-toolkit.asset-pack-conflict.v1`. Its canonical digest is:

```text
sha256(canonical-json({
  schema,
  workspaceBaselineDigest,
  targetKey,
  contenders sorted by contenderId,
  compatibilityDigest,
  policyDigest
}))
```

The canonical form sorts object keys, contender IDs, digest arrays, logical
paths, and diagnostic codes. It excludes timestamps, local paths, random IDs,
raw prompts, credentials, and discovery order. `conflictId` is the digest of
the canonical conflict projection. Any changed baseline, contender, target,
compatibility evidence, or policy creates a new identity or makes the stored
resolution stale; it must never reuse a prior success receipt.

The record must contain bounded `target`, `baseline`, `contenders`,
`compatibility`, `attribution`, `policy`, `status`, and `diagnostics` sections.
It must not contain raw PNG bytes, full provider payloads, secrets, absolute
paths, or unbounded diagnostic text. A parser rejects unknown fields, duplicate
contenders, malformed digests, unsupported schema versions, incompatible pack
versions, and records over fixed count/byte limits.

## Precedence and resolution policy

Precedence is a declared policy, not an implicit algorithm. The policy is
versioned as part of the conflict digest and can allow only these choices:

| Resolution | Meaning | Automatic? |
| --- | --- | --- |
| `retain-current` | Keep the current verified baseline unchanged | Never; user selects it |
| `select-contender` | Select exactly one eligible pack/version/target contender | Never; user selects it |
| `merge-disjoint` | Merge non-overlapping digest-bound semantic patches | Never; user selects it |
| `decline` | Refuse the conflict and preserve all current state | Safe default outcome |

Trust, signature, provenance, compatibility, and D4 verification evidence are
eligibility gates. They may disqualify a contender or require review, but they
do not rank eligible contenders. D1 provenance, D2 provider evidence, and D5
operation order do not create precedence. Pack `replaces` declarations are
explicit author intent evidence, not permission to overwrite an active source
without the D6 selection and existing release gates.

If the policy permits multiple selections, the user must supply a complete,
unambiguous selection for every conflict target. An omitted target, duplicate
selection, incompatible selection, stale baseline, or ineligible contender
returns refusal/recovery evidence and performs no publication.

## User authority, ownership, and permissions

`inspect` is read-only and may read only explicitly supplied pack/archive,
registry, manifest, credit, trust, and provenance fixtures within allowed
roots. It reports ownership and permission boundaries without adopting claims.

`resolve` requires:

1. the exact `conflictId` and current baseline digest;
2. a canonical selection record naming every chosen contender or explicit
   `decline` outcome;
3. compatibility and attribution review evidence for the selected result; and
4. explicit `--confirm` from the user at the final resolution boundary.

The selection record is user intent evidence, not an inferred person identity.
The CLI may record a bounded user-supplied review label or confirmation reason,
but may not infer identity from Git, the operating system, a provider, an Agent,
or a file owner. The command may write only a session/workspace-owned staging
area after confirmation. Source publication, managed-output publication,
archive creation, distribution, and install remain their existing commands and
gates.

`recover` can resume only an exact current resolution receipt or discard only
the D6 staging/receipt evidence after explicit confirmation. It cannot delete
pack source, restore a prior source by path, or silently roll back a release.

## Deterministic merge behavior

The merge projection is `lpc-toolkit.asset-pack-resolution.v1`. It contains a
sorted target result for every conflict and a digest of the complete selection
and output projection.

| Input relationship | D6 result |
| --- | --- |
| Same target and same result digest | Coalesce the bytes; retain every compatible credit/provenance reference |
| Disjoint definition/credit/ownership fields with the same verified baseline | Merge in canonical key/path order |
| Same target with different result bytes | Require `select-contender` or `decline` |
| Different license/credit authority for one output | Retain all compatible evidence or refuse; never silently choose one |
| Changed baseline or missing source/credit evidence | `stale`/`needs-user-action`; no merge |
| Incompatible pack/version/capability or trust evidence | `blocked`; no merge |
| D5 candidate not imported/validated through existing authority | Candidate remains evidence only; no release merge |

Disjoint merge is legal only when every patch is bound to the same base
snapshot and changing fields do not overlap. The canonical output sorts pack
IDs, versions, logical paths, asset IDs, consumers, credits, licenses, and
provenance references. It must not use `readdir`, registry enumeration, input
argument order, or timestamps as a tie-breaker. A merge result is a staged
candidate/plan until the existing import, validation, attributed preview,
human review, and release flow accepts it.

## Attribution, provenance, and audit evidence

Every resolution target retains a mapping from output field/result digest to
all contributing pack snapshot, source, credit, license, acknowledgement, and
provenance reference digests. A D6 result cannot claim attribution solely from a
provider, Agent, pack display name, or selected precedence.

D1 integration is explicit: a released cross-pack result must carry a
versioned D6 resolution receipt digest and a `cross-pack-merge` source-
transformation operation in the next approved D1 provenance capability/schema
revision. D6 must not silently add that operation to the existing D1 parser;
older D1 consumers must refuse or safely ignore the new capability according to
the compatibility contract. Until that D1 revision is implemented, the D6
receipt remains session/workspace evidence and cannot be projected into a
formal release as if it were a known D1 operation.

D2 provider result/refusal evidence is optional and remains user-visible
evidence. It can explain a D5 contender but never satisfies attribution, trust,
human approval, or precedence. D5 operation, contract, candidate, and provider
evidence are referenced by digest; D6 never re-runs or mutates a D5 operation.
D4 record, archive, signature, trust-policy, and post-publication evidence is
read-only eligibility evidence in local tests; D6 does not contact a real
registry or create a key.

The audit schema is `lpc-toolkit.asset-pack-conflict-audit.v1` and records
bounded events:

```text
inspected -> selection-required -> resolved | declined | blocked | stale
                    \-> recovered | discarded
```

Each event binds `conflictId`, baseline digest, selection/resolution digest when
present, affected target IDs, result status, next action, and evidence digests.
Audit entries are append-only session/workspace evidence. They exclude raw
candidate bytes, secrets, absolute paths, and unbounded payloads.

## Refusal, stale state, and recovery

Stable outcomes are:

```text
current | equivalent | selection-required | resolved | declined |
stale | blocked | tampered | recoverable
```

The command returns exactly one safe next action for a refusal. Examples:

- `conflict_identity_changed` → `reinspect-conflict`;
- `conflict_baseline_stale` → `refresh-conflict`;
- `conflict_selection_incomplete` → `select-all-targets`;
- `conflict_incompatible_pack` → `remove-incompatible-contender`;
- `conflict_attribution_incomplete` → `review-attribution`;
- `conflict_resolution_tampered` → `discard-resolution`;
- `conflict_requires_confirmation` → `confirm-resolution`.

Resume re-reads every bound pack, registry, archive, source, credit, trust,
provenance, and D5 evidence digest before accepting a receipt. Any drift
preserves the last valid audit evidence and refuses to publish. Discard removes
only exact D6 staging and receipt files after confirmation and leaves all pack
source, current managed output, archive, registry, and release receipts intact.

## Proposed public UX/CLI contract

The implementation plan may add the smallest public command group needed for
the reviewed contract:

```text
asset conflict inspect
  -> read-only conflict identity, contenders, compatibility, attribution,
     policy, and one safe next action

asset conflict resolve
  -> validate an exact selection, require --confirm, and stage a deterministic
     resolution/merge candidate without importing or releasing it

asset conflict recover
  -> resume or explicitly discard one exact conflict resolution receipt
```

JSON and human output must use stable status/error codes, bounded evidence,
portable logical identities, and explicit `mutation`/`nextAction` fields. Help
must explain that inspect is read-only, resolve is user-selected, D6 does not
choose a winner, and existing import/validation/preview/release authorities
remain downstream.

## Compatibility and release boundaries

- `asset-pack.v1` remains the canonical pack/archive/manifest contract.
- Existing v1 registry entries remain readable; D6 must not rewrite them merely
  to inspect a conflict.
- A D6-capable CLI advertises a versioned conflict-resolution capability only
  after parser, compatibility, privacy, attribution, recovery, and public CLI
  acceptance tests pass.
- An older CLI or consumer that cannot understand a D6 resolution receipt must
  return a stable unsupported/refusal response and leave bytes unchanged.
- D6 resolution evidence is not a formal archive member unless a later,
  separately reviewed archive compatibility contract explicitly adds it.
- No resolution implies a release, publication, signature, trust decision,
  or consumer installation.

## Privacy and bounded resources

Conflict and resolution records use fixed limits for contender count, target
count, digest references, logical identifier bytes, diagnostic bytes, audit
events, and serialized receipt bytes. They retain digests and logical IDs rather
than raw prompts, PNG bytes, credentials, absolute paths, or full provider
payloads. All paths crossing a filesystem boundary are re-read, contained, and
verified by the existing CLI authorities.

## CLI documentation impact

```text
help: update
cli-readme: update
root-readme: update
landing: update
architecture: update
engineering: update
releasing: update
plugin: N/A — D6 adds no plugin skill or plugin command contract
```

The implementation plan must reassess this matrix before handoff and record
each exact surface as `update` or a concrete N/A reason.

## Acceptance criteria for the spec review

Reviewers must agree that:

1. conflict identity cannot change with discovery or filesystem order;
2. precedence cannot silently select a pack, version, provider, or source;
3. every resolution is user-selected, digest-bound, compatibility-checked, and
   recoverable;
4. disjoint merge behavior and incompatible-byte refusal are deterministic;
5. attribution, license, D1/D2/D4/D5 evidence, and audit records are preserved;
6. existing v1 archive/manifest/install/plugin and release gates remain intact;
7. the public CLI/UX contract is bounded and does not authorize external
   distribution mutation; and
8. the implementation plan can prove all of the above with local fixtures/fakes
   and strict TypeScript without a new dependency.
