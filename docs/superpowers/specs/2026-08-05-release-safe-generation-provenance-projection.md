# Release-Safe Generation Provenance Projection

**Status:** Proposed D1 contract spec  
**Date:** 2026-08-05  
**Issue:** [#155](https://github.com/ochowei/lpc-toolkit-2026-1/issues/155)  
**Roadmap:** [#153](https://github.com/ochowei/lpc-toolkit-2026-1/issues/153)  
**Baseline:** [Release lifecycle follow-up](2026-08-04-agent-assisted-asset-pack-release-lifecycle-follow-up.md), completed through [PR #152](https://github.com/ochowei/lpc-toolkit-2026-1/pull/152)  
**Successor roadmap:** [Deferred release lifecycle roadmap](2026-08-04-agent-assisted-asset-pack-release-lifecycle-deferred-roadmap.md)

## Summary

The completed release lifecycle records session evidence, human release
declarations, preview acceptance, formal archive bytes, and installation
receipts. It deliberately does not publish generation provenance. The existing
domain model already distinguishes generation provenance from attribution and
license declarations, but consumers currently have no release-bound contract
for carrying a safe subset of that evidence.

This spec defines the D1 boundary. Version 1 uses an optional, deterministic
companion receipt for a formal archive. It does not add a member to the current
`asset-pack.v1` archive, extend the strict v1 manifest, invoke a provider, or
change installation behavior. A future embedded archive representation would
require a separately versioned archive contract.

## Decision summary

### Selected boundary: an optional companion receipt

The v1 release-provenance artifact is a UTF-8 canonical JSON document stored
next to the session-owned formal archive, for example:

```text
release-artifacts/<pack-id>-<version>.release-provenance.json
```

It is not an archive member and is not copied into a consumer workspace by
ordinary `asset install`. The receipt binds to the exact formal archive digest,
manifest bytes, content projection, source digest set, human release evidence,
and attributed preview artifacts. A provenance-aware tool can verify the
receipt independently without changing existing archive bytes.

This boundary is selected because:

- `asset-pack.v1` and its manifest use strict schemas and exact formal fixture
  bytes;
- the current archive checksum table covers every payload entry, so adding a
  provenance member requires an explicit archive-format version rather than an
  optional unknown file;
- adding provenance to `asset-pack.json` would change the v1 manifest digest and
  the existing content-digest projection, and would expose optional production
  evidence to every archive consumer; and
- an external receipt can bind the complete ZIP digest without creating a
  self-referential archive checksum problem.

An embedded provenance member, manifest extension, or signed remote receipt is
out of scope for this v1 contract. Those alternatives remain possible only
through a later versioned decision that preserves old-consumer refusal and
formal-fixture compatibility.

## Domain terms

The repository glossary now defines these terms in [`CONTEXT.md`](../../../CONTEXT.md):

- **Generation provenance:** traceable evidence about how candidate pixels were
  produced, distinct from authorship and license declarations.
- **Release provenance projection:** the bounded deterministic subset of that
  evidence admitted into one formal release receipt.

The projection is evidence, not authority:

| Evidence | It may prove | It must never become |
| --- | --- | --- |
| Provider/tool/model/reference identifiers | Which production inputs were reported | Attribution author or license authority |
| Contract, candidate, input, reference, and result digests | Which bytes and drawing contract were connected | Human visual acceptance |
| Release declaration and preview-acceptance receipt digests | Which human-governed receipts were bound | A replacement for those receipts |
| Archive, manifest, content, source, and artifact digests | Which exact release was reviewed | A signature or remote trust decision |

## Goals

1. Define a strict public schema for a release provenance projection and its
   exact digest bindings.
2. Make the projection deterministic under JSON property reordering and
   independent of local filesystem paths, process time, and map iteration.
3. Bound public evidence so secrets, private prompts, raw references, absolute
   paths, and uncontrolled payloads cannot enter the receipt.
4. Preserve the separation between provider provenance, credits, human release
   declarations, preview acceptance, and future signing.
5. Let unsupported provenance-aware consumers refuse clearly while preserving
   ordinary v1 archive inspection and installation behavior.
6. Define focused contract and integration acceptance for a later implementation
   plan without changing production code in this spec PR.

## Non-goals

- provider invocation, discovery, authentication, or generation;
- Codex, Antigravity, Claude Code, or other Agent skill packaging;
- natural-language routing, automatic variants/recolors, geometry, or
  multi-layer authoring;
- Web-to-CLI session bridging or persistent browser state;
- remote registries, signing, marketplaces, global installation, or npm
  publication;
- putting raw prompts, source/reference bytes, credentials, or private URLs in
  the receipt;
- adding `release-provenance.json` to the current formal ZIP;
- changing `lpc-toolkit.asset-pack.v1`, existing formal archive bytes, the
  existing content-digest projection, or `asset install` semantics; and
- treating a missing provenance receipt as a failed ordinary install.

## Public identifiers and compatibility

The later implementation may advertise these additive identifiers:

```text
capability: asset-authoring-release-provenance.v1
schema:     lpc-toolkit.asset-release-provenance.v1
```

The existing archive remains:

```text
archive payload: lpc-toolkit.asset-pack.v1
required archive entries: asset-pack.json, checksums.json, sprites/...
```

Compatibility rules:

1. A v1 archive consumer that does not advertise
   `asset-authoring-release-provenance.v1` may ignore an optional companion
   receipt when performing ordinary archive inspection or installation.
2. A provenance-required operation must reject a missing, malformed, stale, or
   unsupported receipt with a stable diagnostic instead of silently treating
   the release as provenance-complete.
3. A receipt never upgrades an archive, manifest, or install capability. The
   archive's own `compatibility.requiredCapabilities` remains authoritative.
4. A future embedded representation must use a new archive/manifest capability
   and explicit versioned parser behavior. It may not rely on unknown-field or
   unknown-entry tolerance in v1.
5. Existing formal archives and their byte/digest fixtures remain unchanged.

Suggested diagnostic identifiers for the later implementation are:

```text
asset_release_provenance_invalid
asset_release_provenance_unsupported
asset_release_provenance_stale
asset_release_provenance_digest_mismatch
asset_release_provenance_private_data
asset_release_provenance_limit_exceeded
```

## Receipt contract

The receipt is strict: unknown fields, duplicate logical records, invalid
digests, unsorted arrays, absolute paths, and values outside the limits below
are errors. The complete document is canonical JSON encoded as UTF-8.

```json
{
  "schema": "lpc-toolkit.asset-release-provenance.v1",
  "projection": {
    "pack": {
      "id": "example-pack",
      "version": "1.2.3"
    },
    "releaseBindings": {
      "archiveDigest": "sha256:...",
      "manifestDigest": "sha256:...",
      "contentDigest": "sha256:...",
      "sourceDigests": [
        { "path": "sprites/item/walk.png", "digest": "sha256:..." }
      ],
      "releaseDeclarationReceiptDigest": "sha256:...",
      "previewAcceptanceReceiptDigest": "sha256:...",
      "previewArtifacts": [
        { "id": "preview:preview", "digest": "sha256:..." },
        { "id": "preview:metadata", "digest": "sha256:..." },
        { "id": "preview:credits_txt", "digest": "sha256:..." },
        { "id": "preview:credits_csv", "digest": "sha256:..." }
      ]
    },
    "records": [
      {
        "kind": "provider-output",
        "targetId": "item-animation-layer",
        "contractDigest": "sha256:...",
        "provider": {
          "id": "provider.example",
          "tool": "tool-name",
          "model": "model-name"
        },
        "inputDigests": ["sha256:..."],
        "referenceDigests": ["sha256:..."],
        "promptDigest": "sha256:...",
        "resultDigest": "sha256:..."
      }
    ]
  },
  "projectionDigest": "sha256:..."
}
```

### Required and derived fields

- `schema` is the exact schema identifier above.
- `projection.pack.id` and `.version` must equal the normalized formal
  manifest identity.
- `releaseBindings.archiveDigest` is the SHA-256 of the exact formal ZIP
  bytes. It is external to the ZIP and therefore not self-referential.
- `manifestDigest` is the SHA-256 of the exact `asset-pack.json` bytes inside
  the archive.
- `contentDigest` is the existing shared asset-pack content digest; the D1
  implementation must call the existing authority rather than create a second
  projection.
- `sourceDigests` contains only normalized pack-relative logical source paths,
  sorted by path, with the exact PNG digest used by the formal archive.
- `releaseDeclarationReceiptDigest` and
  `previewAcceptanceReceiptDigest` reference the existing session receipts;
  they do not copy declarant identity or approval text into provenance.
- `previewArtifacts` uses the existing bounded artifact IDs and is sorted by
  artifact ID.
- `records` contains only production-history evidence. Records are sorted by
  the canonical UTF-8 JSON bytes of each record, so object-property order and
  source-map iteration cannot change the projection digest.
- `projectionDigest` is `sha256(canonicalJson(projection))`; it does not include
  itself. The later session receipt records the companion file's exact bytes
  and path under the existing session-owned release-artifact root.

### Record kinds

Version 1 permits only these record kinds:

| Kind | Meaning | Required evidence |
| --- | --- | --- |
| `provider-output` | A provider-reported candidate result | contract, provider identifier, result digest, and any input/reference digests |
| `external-input` | A candidate supplied by an external author or tool without a provider invocation in this workflow | target, result digest, and optional contract/reference digests |
| `source-transformation` | A recorded transformation of an already digest-bound candidate | target, predecessor/input digests, operation identifier, and result digest |

`provider` is an identifier object only. It never grants authority, invokes a
service, or supplies a credit. `promptDigest` is permitted; raw prompt text is
not. `referenceDigests` identify exact reference bytes without embedding them.
An operation identifier must be a bounded public enum in the implementation
plan; D1 does not add automatic authoring operations.

Every record must identify a logical `targetId` and a final `resultDigest`.
The result digest must be present in `releaseBindings.sourceDigests` or in a
predecessor chain that is itself bound to a release source. Records may not
refer to an unbound external byte set.

## Determinism and digest binding

The canonicalization contract is:

1. Encode objects with the repository's existing canonical JSON authority.
2. Use exact schema keys only; reject unknown keys rather than dropping them.
3. Sort `sourceDigests`, `previewArtifacts`, `inputDigests`, and
   `referenceDigests` by their specified logical keys.
4. Sort `records` by their canonical UTF-8 record bytes.
5. Encode strings as UTF-8 and calculate every digest over exact bytes.
6. Exclude process timestamps, random IDs, local absolute paths, environment
   values, and map iteration order from the projection.

The receipt becomes stale when any of these changes:

- formal archive bytes, manifest bytes, content digest, or source bytes;
- release declaration or acknowledgement evidence;
- preview input or any attributed preview artifact; or
- any provenance record, provider identifier, reference digest, contract
  digest, input digest, or result digest.

Stale evidence is preserved for diagnosis, but a new receipt must not silently
adopt a changed archive, copied receipt, newer source, or external provenance
file. The later implementation must reuse the existing session freshness and
digest-mismatch authorities.

## Privacy and resource limits

The v1 companion receipt is intended to be shareable release evidence. It must
not contain:

- API keys, bearer tokens, cookies, credentials, environment variables, or
  request headers;
- raw prompt text, raw source/reference bytes, model payloads, or generated
  images;
- absolute filesystem paths, home-directory paths, repository paths, or
  session-private paths;
- private URLs, URLs with query/fragment credentials, or unreviewed user data;
- arbitrary nested JSON supplied by a provider; or
- human identity, credit text, license authority, acknowledgement reasons, or
  free-form approval claims.

The later implementation must enforce these bounds before publication:

```text
maximum canonical receipt bytes: 256 KiB
maximum provenance records: 128
maximum input/reference digests per record: 64 each
maximum provider/tool/model identifier length: 256 UTF-8 bytes each
maximum target and operation identifier length: 256 UTF-8 bytes each
```

Values outside the allowlist are rejected; they are not truncated or silently
redacted after the digest is calculated. A future contract may add a reviewed
public reference URI field, but v1 uses digests only.

## Release and installation behavior

The provenance receipt is generated only from a current formal archive and
current release evidence. It may be copied with that archive, but it is not
part of the archive payload and is not installed into the consumer workspace by
ordinary `asset install`.

Provenance-aware review may verify:

1. the archive digest and manifest bytes;
2. the existing content/source digests;
3. the current declaration and preview-acceptance receipt digests; and
4. the projection digest and all bounded records.

If any check fails, the tool reports stale or mismatch evidence and leaves the
archive, source, registry, and consumer workspace unchanged. A normal v1
install remains governed by the existing archive inspection, attribution, and
installation authorities; presence of a companion receipt does not weaken or
strengthen those gates unless a future explicit provenance-required command is
added.

## Acceptance and testing strategy

The later implementation plan must use public seams and red/green tests for:

### Pure contract tests

- exact schema and unknown-field rejection;
- all digest formats and strict pack/version identity;
- canonical equality under JSON property reordering;
- stable record/source/artifact ordering;
- projection and receipt digest calculations;
- duplicate-record and unbound-result rejection;
- every privacy/resource limit and forbidden value class; and
- no timestamps, random IDs, absolute paths, provider calls, or environment
  values in the pure projection.

### Archive/session integration tests

- binding to an exact formal archive, raw manifest, content digest, source set,
  declaration receipt, preview acceptance receipt, and preview artifacts;
- stale receipt preservation after archive, source, manifest, declaration,
  preview, or provenance drift;
- copied archive acceptance only when its exact bytes match `archiveDigest`;
- malformed/unsupported companion receipt refusal without mutation;
- ordinary v1 formal archive inspect/install behavior unchanged; and
- protected sentinel checks for `upstream/`, checked-in assets, base cache,
  artist source, formal archive, and unowned output.

### Packed acceptance

The packed public CLI acceptance must prove that a clean authoring workspace can
produce an exact formal archive and a companion provenance receipt, and that a
separate clean consumer can verify the receipt without receiving or mutating
session-private files. The acceptance must also show that an unsupported
provenance-aware request fails closed while ordinary archive installation stays
compatible.

## Documentation impact

This PR is spec/glossary-only. No public CLI behavior or release workflow is
changed yet:

```text
help: N/A — no command is shipped by the D1 spec
cli-readme: N/A — no public CLI behavior changes
root-readme: N/A — no user-facing product behavior changes
landing: N/A — no Web UI behavior changes
architecture: N/A — proposed boundary is not yet an accepted implementation
engineering: N/A — no verification command or package boundary changes
releasing: N/A — no release artifact or publication workflow changes
plugin: N/A — no skill or plugin contract changes
```

Any later implementation PR must reassess the complete matrix and update every
owned surface or record a concrete not-applicable reason.

## Implementation boundary

This spec PR must contain only `CONTEXT.md` terminology and this contract
document. It must not add a dependency, capability implementation, archive
member, manifest field, CLI command, provider call, remote service, or `any`.

The next implementation plan, if approved, must separately record:

1. the exact Core/asset-pack-format/CLI ownership split;
2. public parser and session receipt seams;
3. focused red/green tests for the contract and stale evidence;
4. the final CLI documentation matrix; and
5. exact verification commands and protected-path evidence.

## D1 acceptance criteria

This D1 spec is complete when:

1. `CONTEXT.md` distinguishes generation provenance, release provenance
   projection, attribution author, and human release authority.
2. The v1 companion-receipt boundary and rejected archive/manifest alternatives
   are explicit.
3. The schema, digest bindings, record kinds, deterministic ordering, privacy
   limits, compatibility behavior, and stale rules are testable.
4. Existing formal archive bytes and v1 installation semantics are explicitly
   protected.
5. The later implementation boundary is separate from this spec and contains
   no provider or production mutation.
