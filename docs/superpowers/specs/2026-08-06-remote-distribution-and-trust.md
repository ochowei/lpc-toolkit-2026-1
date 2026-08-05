# D4 — Remote Distribution and Trust

**Status:** Proposed track specification — review required before implementation  
**Date:** 2026-08-06  
**Issue:** [#173](https://github.com/ochowei/lpc-toolkit-2026-1/issues/173)  
**Roadmap:** [#153](https://github.com/ochowei/lpc-toolkit-2026-1/issues/153)  
**Base:** D3 implementation merged by [PR #172](https://github.com/ochowei/lpc-toolkit-2026-1/pull/172)  
**Dependencies:** D1 release provenance, D2 provider/session receipts, D3 local Web-to-CLI handoff, formal `asset-pack.v1` archive compatibility

## Review gate and authorization boundary

D4 is a trust-model and distribution-contract track. This specification and
its separate implementation plan must be reviewed before product-code
implementation begins. A merged spec/plan review PR authorizes only the
public TDD seams described here; it does not authorize a real registry,
marketplace, key, tag, global installation, npm publication, or external
service mutation.

The implementation and verification cycle uses local fixtures, temporary
consumer prefixes, fake registry/marketplace/publisher adapters, and
deterministic test-only signer/verifier adapters. No test creates, stores,
registers, rotates, or publishes a real key. No test connects to a remote
service or runs `npm publish`.

## Summary

D4 defines how a formal LPC asset-pack archive can be represented, signed,
verified, distributed, installed, and audited across remote registries,
marketplaces, global prefixes, and npm publication without changing the
existing local archive or lifecycle authorities.

The remote surface is an untrusted transport and metadata source. Trust comes
from an explicit local trust policy, a namespace/key authorization record, and
a signature over a canonical release projection that binds the exact formal
archive bytes, manifest/content/source evidence, D1 provenance when present,
and explicit license/credit evidence. A registry URL, marketplace listing,
npm authentication state, provider identity, or package download alone never
creates trust.

D4 does not embed a signature in the current `asset-pack.v1` archive, add
unknown fields to its strict manifest, or replace the existing local asset
manager registry. A detached distribution record and local verification
receipt carry the new evidence. Existing `inspect`, `install`, transaction,
attribution, validation, preview, release-gate, D1, D2, and D3 behavior
remain authoritative and compatible.

## Decision at a glance

| Decision | D4 contract |
| --- | --- |
| Remote registry | An untrusted source of immutable release records and exact archive bytes. It cannot change identity, trust, credits, license, provenance, or local install state. |
| Immutable identity | `namespace + pack.id + pack.version + archiveDigest` is the release identity. The same identity may never point to different bytes. |
| Signature placement | A detached signature in the strict distribution record; the existing formal archive remains byte-compatible and signature-free. |
| Trust root | An explicit local trust policy maps namespace ownership to approved public-key fingerprints and allowed algorithms. Remote discovery never adds a trust root. |
| Key lifecycle | Key creation, registration, rotation, revocation, expiry, and compromise response are explicit policy events. The product does not silently create or fetch keys. |
| Marketplace | A presentation and approval reference to an immutable release record. It is not a signing authority, license authority, or alternate archive source. |
| Global installation | An explicit, digest-bound install into a selected prefix that delegates payload publication to the existing transactional install authority. No implicit system mutation or downgrade. |
| npm publication | A separately authorized publication of the CLI package tarball. npm integrity and metadata are transport evidence; they do not replace the D4 release signature or LPC archive verification. |
| Post-publication verification | A clean-prefix, read-only verification of the exact record, archive, signature, provenance, license/credit evidence, package metadata, and marketplace references. |
| Rollback | Non-destructive withdrawal/quarantine and explicit selection of a previously verified immutable version. Never delete, overwrite, retag, or mutate a published artifact to repair trust. |

## Goals

1. Define strict, deterministic public records for an immutable remote asset
   release, its detached signature, and a local verification receipt.
2. Separate transport, namespace authorization, cryptographic verification,
   human release authorization, attribution, license evidence, provenance, and
   installation authority.
3. Define compatible remote registry, marketplace, global-prefix, and npm
   publication boundaries without changing formal v1 archive bytes.
4. Detect archive, metadata, signature, key-policy, namespace, provenance,
   license, version, and transport tampering before install or publication.
5. Define key rotation/revocation, downgrade/replacement, withdrawal,
   rollback, recovery, and audit evidence as explicit deterministic decisions.
6. Prove all behavior with public seams and local fake adapters before any
   external mutation is considered.
7. Preserve matching `CREDITS.csv`, explicit human consent, validation,
   preview acceptance, release declaration, D1 provenance, D2 provider
   evidence, and D3 handoff boundaries.

## Non-goals

- Creating or managing production private keys, hardware-backed keys, signing
  accounts, OIDC credentials, npm tokens, registry tokens, or marketplace
  accounts.
- Publishing to a real registry, marketplace, npm, global system prefix, tag,
  GitHub Release, or other external service.
- Adding a backend, account service, authentication/authorization service,
  remote key discovery, key server, network client, or dependency without a
  separately approved decision.
- Replacing the local asset-pack manager registry, archive inspector,
  transactional installer, release gates, D1 provenance, D2 provider result,
  or D3 local handoff.
- Adding a signature member, provenance member, license member, or unknown
  field to the strict `asset-pack.v1` archive or manifest.
- Treating a signer, registry, marketplace, npm account, provider, Agent,
  GitHub identity, or local OS account as the human attribution author,
  license authority, visual approver, or release declarant.
- Automatically selecting a namespace, key, version, source, marketplace,
  registry, package, or rollback target by discovery order or network response.
- Silently downgrading, replacing same-version bytes, deleting a withdrawn
  release, or accepting an unverified/draft/tampered archive.

## Terms and trust boundaries

| Term | D4 meaning | Must not be confused with |
| --- | --- | --- |
| Remote registry | A transport/index adapter that returns a release record and exact archive bytes. | A trust root, namespace owner, license authority, or local install registry. |
| Distribution record | A strict signed/unsigned metadata document binding release identity and digests. | The formal archive or a publication receipt. |
| Release signature | A cryptographic proof that an approved key signed one canonical release projection. | Human authorship, consent, visual acceptance, or license grant. |
| Trust policy | Local explicit rules for allowed algorithms, key fingerprints, namespaces, validity, and revocation. | Remote metadata or inferred account ownership. |
| Namespace owner | An explicit policy subject authorized to release under a namespace. | The person listed in `CREDITS.csv` or a provider. |
| Marketplace listing | A listing that references an immutable distribution record and may carry review status. | A new package identity or a signature. |
| Global prefix | A user-selected consumer installation root used by an explicit install operation. | An implicit operating-system-wide mutation. |
| npm publication | Distribution of the CLI package tarball through npm under separate release authorization. | Publication of an asset archive or proof of LPC asset trust. |
| Withdrawal | A non-destructive policy/index state that prevents new selection while retaining evidence. | Deletion, byte replacement, or proof that an artifact was never published. |

## Ownership and permission model

| Boundary | Owner | Allowed D4 behavior | Forbidden behavior |
| --- | --- | --- | --- |
| Formal archive and `CREDITS.csv` | Existing archive/release authorities | Capture exact bytes and digests after existing validation, preview, declaration, and formal-pack gates | Rewriting bytes, inferring licenses, or bypassing release gates because a signature exists |
| D1 provenance receipt | D1 release-provenance authority | Bind its exact digest as optional signed evidence and verify it when declared | Treating provider/provenance fields as authorship, approval, or a signature |
| D2 provider evidence | D2 session/provider receipt authority | Preserve bounded provider/result digests as provenance references | Treating provider identity or result as namespace ownership, license, or release consent |
| D3 handoff | Local Web/CLI file-transfer authority | Keep handoff local and verify it before a user-selected CLI import | Turning a handoff or Web status into remote publication or trust |
| Remote registry | Injected registry adapter | Fetch or stage records/bytes in local fixtures; report immutable identity and transport metadata | Mutating local workspaces, adding trust roots, changing versions, or deciding install authority |
| Trust policy/key store | Explicit local maintainer/user policy | Read an allowlisted policy and evaluate key lifecycle state | Auto-enrolling keys, reading private keys, trusting remote key discovery, or inferring ownership |
| Marketplace | Injected listing adapter | Read a listing that references an exact verified release record | Rewriting release identity/digests, replacing credits/license evidence, or signing on behalf of a namespace |
| CLI installer/global prefix | Existing transactional install authority | Stage, verify, and install a user-selected exact release after explicit confirmation | Writing before verification, overwriting same-version bytes, implicit global mutation, or unsafe downgrade |
| npm publisher | Release workflow/maintainer | Verify a locally packed CLI tarball and fake publication receipt | Calling `npm publish`, changing OIDC/Trusted Publisher settings, or treating npm auth as archive trust |
| Audit evidence | Read-only verification command | Write a contained, bounded local receipt with exact observed digests and decisions | Claiming publication, trust, authorship, or license from an incomplete verification |

## Public identifiers and compatibility

The implementation may advertise these additive identifiers only after the
related public seams, refusal behavior, and tests are complete:

```text
capability: asset-pack-remote-distribution.v1
capability: asset-pack-signature-verification.v1
capability: asset-pack-global-install.v1
capability: asset-pack-npm-publication.v1

schema:     lpc-toolkit.asset-distribution-release.v1
schema:     lpc-toolkit.asset-distribution-verification.v1
schema:     lpc-toolkit.asset-distribution-trust-policy.v1
```

The existing identifiers remain authoritative:

```text
archive:    lpc-toolkit.asset-pack.v1
manifest:   asset-pack.json in its existing strict v1 shape
provenance: lpc-toolkit.asset-release-provenance.v1
provider:   lpc-toolkit.asset-provider-result.v1 / refusal.v1
handoff:    lpc-toolkit.web-cli-handoff.v1
```

Compatibility rules:

1. Ordinary local archive inspection and installation do not require D4
   records or signatures and retain current v1 behavior.
2. A D4-aware remote fetch, verification, global install, marketplace
   verification, or npm post-publication check must refuse a missing,
   malformed, unsupported, untrusted, stale, withdrawn, or mismatched record
   before mutation.
3. A consumer that does not advertise a D4 capability must not guess unknown
   remote fields or silently install a remote artifact as trusted. It may
   continue ordinary local v1 behavior when the user supplies a local archive
   through the existing path.
4. A D4 signature never upgrades an archive, manifest, local registry, or
   release gate. Formal archive status, exact inspect receipts, human release
   evidence, and existing install policy remain required.
5. A future embedded signature or remote metadata member requires a new
   archive/manifest version. Unknown v1 members are not an extension point.
6. D1/D2/D3 evidence remains optional only where those contracts say it is
   optional; if a distribution policy requires it, its exact digest must be
   present and verified rather than silently omitted.

## Immutable release identity

The canonical identity of one release is:

```text
namespace + pack.id + pack.version + archiveDigest
```

The normalized `pack.id` and `pack.version` must match the formal archive
manifest. `archiveDigest` is SHA-256 of the exact formal archive bytes and
`byteLength` must match the fetched bytes. The release is not eligible for D4
trust unless archive inspection proves the formal, non-draft status and the
existing checksum/attribution rules pass.

The same `namespace/pack.id@pack.version` may not be associated with a second
archive digest. A different digest is a same-version replacement conflict,
not an upgrade. A greater version still requires a new signed release record;
a lower version requires explicit user-selected downgrade policy and must
never be chosen automatically.

The following values are bound when present and are not re-created from
untrusted metadata:

- exact `manifestDigest`, existing `contentDigest`, and sorted source digests;
- exact `archiveDigest` and byte length;
- D1 release-provenance receipt digest and projection digest, if declared;
- exact attributed `CREDITS.csv` digest and a bounded license-evidence digest;
- required capability/compatibility range;
- namespace, pack identity, version, and formal archive status; and
- the release authorization evidence digest, never the private approval text.

## Distribution record and signed release projection

The distribution record is canonical UTF-8 JSON with strict keys, bounded
strings/arrays, normalized IDs, sorted digest sets, no absolute paths, and no
credentials or raw payloads. A conceptual v1 record is:

```json
{
  "schema": "lpc-toolkit.asset-distribution-release.v1",
  "release": {
    "namespace": "example",
    "packId": "example.hair",
    "version": "1.2.3",
    "archiveKind": "formal",
    "archiveDigest": "sha256:...",
    "byteLength": 12345,
    "manifestDigest": "sha256:...",
    "contentDigest": "sha256:...",
    "sourceDigests": [{"path": "sprites/item/walk.png", "digest": "sha256:..."}],
    "creditsDigest": "sha256:...",
    "licenseEvidenceDigest": "sha256:...",
    "provenanceDigest": "sha256:...",
    "requiredCapabilities": []
  },
  "authorization": {
    "namespacePolicyId": "example-policy-v1",
    "releaseEvidenceDigest": "sha256:..."
  },
  "signature": {
    "keyId": "sha256:public-key-fingerprint",
    "algorithm": "ed25519",
    "payloadDigest": "sha256:...",
    "value": "base64url:..."
  }
}
```

The exact final field limits and algorithm allowlist must be fixed in the
implementation contract before public capabilities are advertised. The
signature covers only a canonical `signedProjection` containing release
identity, all exact digests, compatibility, authorization evidence digest,
and the namespace policy identifier. Mutable registry URLs, mirror order,
observed verification time, marketplace ranking, download counters, and npm
transport metadata are not signed release identity.

The implementation must expose the canonical bytes or their digest to the
verifier adapter, never a parsed object whose property order can vary. A
signature verifies bytes; it does not assert that the signer is the human
artist, license owner, visual approver, or release declarant.

## Trust and key policy

Trust is local and explicit. A strict trust policy contains:

- a policy identifier and version;
- allowed signature algorithms and canonicalization version;
- namespace-to-key authorization entries;
- public-key fingerprints and stable key IDs, never private key material;
- `validFrom`, optional `validUntil`, and revocation/compromise state;
- permitted release capabilities and replacement/downgrade policy; and
- a policy digest that is recorded in local verification evidence.

The policy evaluator must reject:

- unknown namespaces or keys;
- key IDs whose fingerprint does not match the supplied public key;
- disallowed algorithms or canonicalization versions;
- keys outside their validity window when policy requires time validation;
- revoked or compromised keys for releases not explicitly grandfathered by
  the policy; and
- a key that is not authorized for the release namespace.

Rotation is additive: a new key may be authorized before signing new
releases, while old releases remain verifiable only according to the recorded
validity and revocation policy. Revocation does not rewrite old bytes or
silently make a previously verified audit disappear; it changes the trust
decision for operations whose policy does not permit grandfathering.

The product must not infer namespace ownership from a registry account,
marketplace account, npm account, GitHub identity, DNS, or key comment. Key
creation, private-key custody, policy distribution, registration, rotation,
and emergency revocation are maintainer-operated concerns. D4 may verify a
policy supplied by the user or test fixture but must not create or enroll one
automatically.

## Registry contract

A registry adapter is an injected transport seam. It may return:

1. an immutable release record;
2. the exact archive bytes identified by that record; and
3. bounded transport metadata such as source/mirror identity and observed
   HTTP-like status in a fake fixture.

The adapter cannot decide trust. Verification must occur after capture and
before local install or publication. Mirror or URL changes are transport
changes, not identity changes. A registry response that serves a different
record or archive for the same immutable identity is tampered or conflicting
and must be quarantined without overwriting the prior bytes.

The local asset manager registry remains the authority for installed sources,
generated output, receipts, and transaction recovery. D4 remote records must
not be copied into that registry until the existing exact archive inspection
and install transaction has committed.

## Marketplace contract

A marketplace listing is a bounded reference:

```text
listing -> namespace/pack.id@version -> archiveDigest -> distribution record
```

It may include a display name, review state, category, supported platforms,
license display, and a link to the immutable record. It must not replace the
record's namespace, digest, signature, provenance, or `CREDITS.csv` evidence.
Marketplace review is a separate human decision and does not satisfy the
release declaration, visual preview acceptance, attribution, or signature
verification gate. A listing that points to a different digest, changes
license/credit text without a matching evidence digest, or hides a withdrawn
or tampered record is refused.

No marketplace API or listing mutation is part of the local D4 test cycle.

## Global installation and compatibility

Global installation is an explicit consumer operation, not a side effect of
verification or publication. The later CLI contract must require:

- an exact distribution record and archive selection;
- a local trust policy and successful signature/provenance/license/credit
  verification;
- a selected, initialized consumer prefix or the existing managed workspace
  authority;
- an explicit user confirmation for the mutation; and
- the existing transactional install policy for staging, payload, registry,
  generated output, receipt, idempotency, and recovery.

The operation must refuse drafts, unknown capabilities, missing credits,
untrusted keys, signature mismatches, same-version digest conflicts, unsafe
paths/symlinks, withdrawn releases, and incompatible pack versions before
writing the consumer prefix. A repeated exact install is a verified no-op.
An older version is never selected by automatic fallback; a downgrade must be
an explicit user choice permitted by the local policy and still pass all
trust and compatibility checks.

The implementation tests a temporary local prefix only. It must not mutate a
real system-wide prefix or claim that a fake prefix proves OS-level global
installation.

## npm publication boundary

D4 treats npm publication as a distinct, externally authorized distribution
of the CLI package, not as publication of an LPC asset archive. Before any
future publication, the local release workflow must bind:

- package name and version;
- exact locally packed tarball digest and npm integrity value;
- package entrypoint/help/version behavior;
- the release commit/tag and CI verification evidence; and
- the D4 release record or an explicit reason why the package is not an asset
  release.

The npm registry, account, OIDC identity, package metadata, and `dist` fields
are transport/authentication evidence. They do not replace the LPC archive
signature, namespace policy, attribution, license evidence, or D1
provenance. A package may not silently download or publish an asset pack.

Local D4 acceptance uses `pnpm pack`/existing package smoke against a local
tarball and a fake publication receipt. It never calls `npm publish`, edits
Trusted Publisher settings, creates a token, or verifies a real npm listing.

## Provenance, attribution, and license evidence

The exact `CREDITS.csv` inside the formal archive remains product logic. D4
must re-inspect the archive and bind its digest; a distribution record cannot
replace, shorten, or synthesize credit rows. The signer, namespace owner,
provider, marketplace, npm account, or Agent is never automatically added as
an author.

If D1 provenance is included, D4 binds the exact D1 receipt/projection digest
and verifies that its archive, manifest, content, source, preview, and release
evidence bindings match the exact archive under distribution. D4 does not
copy raw provider payloads, prompts, private paths, or approval text into the
public record.

License evidence is explicit and bounded. It may contain normalized license
identifiers, source/credit references, and a digest of the exact license
projection used for review. It must not infer a license from a key, package
registry, marketplace category, provider, or URL. A missing, contradictory,
unsupported, or changed license/credit evidence blocks distribution and
installation. The repository's GPL-3.0-or-later dependency rule remains
unchanged; individual asset licenses remain the explicit asset/source
authority.

## Verification, post-publication checks, and audit evidence

A D4 verification must be read-only with respect to the source archive,
formal session, remote fixture, and consumer workspace. It must:

1. capture the record and exact archive bytes without trusting filenames or
   URLs;
2. validate strict schema, identity, byte length, archive status, checksums,
   manifest/content/source digests, credits, and license evidence;
3. build the canonical signed projection and verify the signature through an
   injected verifier;
4. evaluate the supplied trust policy, namespace authorization, key lifecycle,
   capabilities, and replacement/downgrade policy;
5. verify D1 provenance and any marketplace/npm references against exact
   digests when those records are declared; and
6. emit one bounded JSON/human decision with safe recovery guidance.

The local receipt may record the exact record/archive/policy/signature/key
fingerprint/provenance/license digests, decision, verification adapter
version, and observed transport source. It must not contain private keys,
tokens, absolute paths, raw prompts, provider payloads, archive bytes, or a
claim of external publication unless an independently supplied publication
record was verified.

Post-publication verification is a separate read-only operation from a clean
consumer prefix. It compares the exact immutable release record served by a
registry, marketplace listing, or npm package metadata with the locally
verified release. A successful local fixture check is not evidence that a
real external publication occurred.

## Tamper, rollback, and recovery policy

The following conditions are distinct and stable:

| Condition | Decision | Recovery |
| --- | --- | --- |
| Record schema/identity invalid | `blocked` | Obtain a fresh record from an authorized source; do not use its archive. |
| Record and archive digest/length mismatch | `tampered` | Preserve both inputs as evidence and re-fetch/select the exact matching pair. |
| Signature invalid or key untrusted/revoked | `untrusted` | Use an explicitly authorized key/policy; never bypass verification. |
| Namespace/version already maps to another digest | `conflict` | Select the existing immutable release or a greater version after explicit review. |
| D1 provenance, credits, or license evidence mismatch | `blocked` | Re-run the authoritative release workflow; do not rewrite the remote record. |
| Remote listing points to another digest | `tampered` | Quarantine listing evidence and select the exact immutable record. |
| Publish/fetch/install interrupted | `recoverable` | Resume or discard only the exact local staging claim through its owner. |
| Release withdrawn or compromised | `withdrawn` | Stop new installs and explicitly select a previously verified release. |

Rollback never means deleting or mutating a published archive, replacing a
same-version digest, retagging history, or erasing verification receipts. A
registry/marketplace may expose a non-destructive withdrawal or pointer change
only through an explicitly authorized external operation. Local rollback
selects an existing exact release and delegates filesystem cleanup to the
existing transactional recovery authority. Every refusal and recovery action
must preserve audit evidence and identify the exact expected digest.

## Human approval and authorization

The following authorities stay separate:

| Evidence/action | May prove | Must not prove |
| --- | --- | --- |
| Existing release declaration and preview acceptance | Human-governed release evidence | Signature, namespace ownership, or marketplace approval |
| Namespace/key policy | Which key may sign for which namespace | Human authorship, asset license, or visual acceptance |
| Signature verification | Exact bytes were signed by an authorized key | That the signer owns the pixels or consented to the license |
| Marketplace review | Listing/review decision | Archive identity, signature, or attribution |
| npm authentication/integrity | Package transport/account publication evidence | LPC asset trust or license authority |
| `--confirm` | One explicit user decision for the requested mutation | A blanket permission for future publication or bypass |

Every mutating operation must return a confirmation action before writing and
must require an exact `--confirm` for that operation. Missing confirmation is
an `ok: true` `needs-user-action` response with no mutation. A failed or stale
confirmation cannot be reused for a different record, version, key, prefix,
marketplace, or publication target.

## Privacy and protected paths

Distribution records, signatures, verification receipts, fake publication
receipts, and JSON/human responses must not contain:

- private keys, key seeds, tokens, credentials, cookies, or auth headers;
- absolute paths, home/repository paths, OS ownership, environment variables,
  or unbounded registry/cache paths;
- raw prompts, provider payloads, source/reference bytes, archive bytes, or
  unreviewed user data;
- inferred human identities, license authority, or private marketplace data.

Every local acceptance test must assert that `upstream/`, checked-in assets,
the verified base cache, source packs, generated overlays, formal archives,
unowned output, existing local registries, protected sentinels, and prior
receipts remain unchanged unless the exact explicit install/recovery seam owns
the mutation.

## Stable refusal identifiers

The implementation should use stable public diagnostics for at least:

```text
asset_distribution_invalid
asset_distribution_unsupported
asset_distribution_record_mismatch
asset_distribution_archive_tampered
asset_distribution_signature_invalid
asset_distribution_key_untrusted
asset_distribution_key_revoked
asset_distribution_namespace_unauthorized
asset_distribution_provenance_mismatch
asset_distribution_license_mismatch
asset_distribution_credit_mismatch
asset_distribution_version_conflict
asset_distribution_withdrawn
asset_distribution_downgrade_requires_confirmation
asset_distribution_external_mutation_blocked
asset_distribution_recovery_required
```

The exact error-to-state mapping and response fields belong in the reviewed
implementation plan and must be tested through public CLI seams.

## Architecture boundary

`packages/core/` may own only environment-agnostic distribution record types,
strict parsing, canonical signed projection, digest comparison, compatibility
predicates, and bounded trust decisions. Core must not import crypto runtime
APIs, filesystem, network, registry, marketplace, npm, key stores, or
provider/plugin code.

The CLI owns filesystem/archive capture, injected registry and signer/verifier
adapters, trust-policy loading, local verification receipts, public command
responses, and delegation to existing install/recovery authorities. Network,
publication, npm, and marketplace behavior must be adapter interfaces backed
by local fakes in the implementation cycle. Release workflows remain the
maintainer authorization boundary.

The Web Workbench and D3 handoff remain local and unchanged. D4 does not add a
Web distribution UI, browser persistence, remote upload, or reverse session
bridge unless a later spec explicitly reopens that boundary.

## Acceptance criteria for the implementation plan

The later D4 implementation may be considered complete only when local
fixtures prove:

1. canonical record/signature payloads are strict, deterministic, bounded,
   and independent of property order;
2. exact archive, manifest, content, source, credits, license, and D1
   provenance bindings are verified before any install/publication seam;
3. trust policy rejects unknown, unauthorized, disallowed, expired, rotated,
   revoked, and compromised keys according to explicit policy;
4. fake registry, marketplace, signer/verifier, global-prefix, and npm
   publisher adapters expose transport tampering and never become trust
   authorities;
5. same-version replacement, downgrade, withdrawal, incompatible capability,
   and draft/untrusted/tampered release behavior is deterministic;
6. existing local install transactions, attribution, v1 archives, D1/D2/D3
   receipts, validation, preview, release gates, and protected paths remain
   compatible;
7. post-publication verification is read-only and produces bounded audit
   evidence without claiming real external publication;
8. rollback and interrupted staging preserve prior immutable evidence and use
   explicit recovery rather than deletion or overwrite; and
9. no real registry, marketplace, key, signing operation, global install,
   npm publication, tag, auth credential, external service, new dependency,
   backend, or `upstream/` mutation occurs without a later explicit approval.
