# D2 — Provider-Neutral Invocation, Discovery, and Agent Integration Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with focused red →
> green loops. Do not begin a later task until the current task's focused
> checks pass and its implementation record is committed. This plan is the
> implementation companion to the merged D2 specification; it is not
> permission to add a real provider, skill, network service, or Web bridge.

**Goal:** Implement the provider-neutral D2 contract from GitHub Issue [#159](https://github.com/ochowei/lpc-toolkit-2026-1/issues/159), under roadmap [#153](https://github.com/ochowei/lpc-toolkit-2026-1/issues/153): strict provider descriptor discovery, CLI-owned compatibility/preflight, explicit-consent invocation handoff, bounded result/refusal recovery, D1 provenance projection, and an optional Agent-integration manifest checker.

**Base:** Start from the `main` merge commit containing spec PR [#160](https://github.com/ochowei/lpc-toolkit-2026-1/pull/160), `3fc0fa8d0a301de66d9c96a8b673c8c211cf9125`. The normative specification is [`2026-08-05-provider-neutral-invocation-discovery-agent-integration.md`](../specs/2026-08-05-provider-neutral-invocation-discovery-agent-integration.md). [ADR-0007](../../adr/0007-keep-sprite-generation-provider-neutral.md) remains normative for provider neutrality. D1 release-provenance projection from PR #158 remains a dependency and is not reopened.

**Architecture:** Core owns pure D2 schema parsing, canonical projections, bounded SemVer compatibility, capability predicates, refusal diagnostics, and the pure projection from a normalized provider result to the existing D1 `provider-output` record. The CLI owns session-root filesystem checks, descriptor input, consent boundaries, preflight/handoff/result commands, candidate staging, receipt persistence, invalidation, and JSON/human responses. Agent integrations may coordinate a conversation and an external provider, but consume only public CLI commands and structured responses. No provider is invoked by the CLI, Core, or the shipped plugin.

**Tech stack:** Strict TypeScript, Node.js 22+, pnpm 9, Vitest, Node built-ins, existing `@lpc-toolkit/core`, `@lpc-toolkit/asset-pack-format`, and existing CLI filesystem/runtime adapters. Add no dependency and no `any`.

## Global constraints

- Implement only this D2 track: provider-neutral descriptor discovery, preflight, consent-scoped handoff, result/refusal handling, D1 projection, and optional Agent-package compatibility metadata/checking.
- Do not call ImageGen, `generate2dsprite`, a model SDK, an external provider, or a network service. The production CLI has no provider registry, provider adapter loader, credential store, network client, or provider process execution.
- Do not add or ship a Codex, Antigravity, Claude Code, or other Agent skill in this implementation. The existing `plugins/lpc-toolkit/` remains limited to its two reviewed skills. A later skill-package PR requires a separate plugin contract review.
- Do not add natural-language routing, automatic variants/recolors, custom geometry, complex multi-layer authoring, cross-pack conflict resolution, Web-to-CLI state bridging, persistent browser state, remote registries, signing, marketplaces, global installation, npm publication, a backend, authentication, or a new dependency.
- Do not change formal archive bytes, the strict v1 asset-pack manifest, attribution/credits, human declarations, warning acknowledgement, preview acceptance, ordinary inspect/install behavior, or D1 receipt placement. D2 provider records remain session evidence until the existing D1 release-provenance command projects them.
- Reuse the existing Core drawing contract, CLI session store, candidate-import authority, validation, attributed preview, response envelope, release gates, and D1 provenance parser. Do not create a second geometry engine, manifest parser, attribution engine, candidate importer, archive writer, or release gate.
- Keep `packages/core/` environment-agnostic. Core must not import Node, filesystem, DOM, React, Vite, concrete canvas, ZIP, CLI, Agent, provider, network, or secret-handling code.
- Keep every D2 JSON envelope free of raw prompts, provider payloads, credentials, environment values, private URLs, absolute paths, home/repository paths, or human identity claims. Use logical target IDs, digest bindings, bounded host names, and session-relative candidate IDs.
- Provider descriptors declare requirements; `declaredHosts` never authorize a connection. Network is disabled by default at the CLI boundary. A descriptor with credentials not handled outside the CLI is refused before handoff.
- `--confirm` is an explicit consent boundary, not a bypass for missing evidence, stale contract/session state, unsafe paths, limits, or invalid PNGs. A missing confirmation returns `ok: true`, `state: "needs-user-action"`, and one structured next action without writing an invocation.
- A provider result never writes the manifest or final source directly. Candidate bytes enter the existing contract-bound candidate-import path only after the CLI re-digests and stages them below the session-owned root.
- Provider absence, cancellation, timeout, stale contract, unsupported capability, or denied scope is a durable refusal/handoff, not a failed release and not evidence of completed authoring. Preserve the last valid authoring checkpoint.
- Never infer authorship, license/source authority, acknowledgement reasons, consent, release approval, or human identity from a provider, Agent, skill, Git, operating system, or account.
- Never initialize, modify, install packages inside, or commit inside `upstream/`. Do not write checked-in `assets/`, the verified base cache, generated `assets_custom/`, installed snapshots, unowned output, or a formal archive during provider handoff/result tests.
- Prefix every repository terminal command with `rtk`; use pnpm for repository development. Use `apply_patch` for plan edits.
- After each completed implementation task, check its boxes, add a short implementation note, record the full related product commit hash, and record exact PASS/FAIL verification commands in this plan. Commit the plan record separately when the implementation workflow requires it.

## Observable success

- `lpc-toolkit capabilities --json` advertises the three D2 capabilities and six D2 schema identifiers only after their public seams, tests, refusal behavior, and package checker are complete.
- `asset authoring provider discover` deterministically sorts bounded Agent-supplied descriptors and reports `supported`, `unsupported`, `unavailable`, or `consent-required` without enumerating, downloading, or invoking anything.
- `asset authoring provider preflight` validates one descriptor against the current session contract, CLI SemVer, required capabilities, limits, consent scope, protected paths, and network policy without mutating session or pack bytes.
- `asset authoring provider handoff` requires the exact current contract and explicit consent, persists one invocation envelope only after `--confirm`, and remains idempotent for unchanged provider/adapter/contract/reference/path/limit/network bindings.
- `asset authoring provider result` accepts a bounded result/refusal envelope plus a real fixture PNG, re-digests the candidate, stages it under the session-owned root, and exposes the existing `asset authoring import` action without importing or publishing source bytes itself.
- Stale, cancelled, timed-out, invalid, private-data, unsafe-path, over-limit, scope-changing, and digest-mismatched results preserve previous session bytes and expose one safe next action.
- The existing D1 `provider-output` projection can be derived from a normalized successful result without including raw prompts, provider payloads, credentials, absolute paths, private URLs, or human approval claims. Formal archive bytes and ordinary installation remain unchanged.
- `agent integration check` accepts a compatible manifest, refuses an older/incompatible CLI or missing required capability, and explicitly identifies optional-capability fallback without installing or executing a package.
- Clean packed CLI acceptance uses a deterministic fake provider adapter in the test fixture only; no real provider, network, credential, skill, backend, registry, or Web bridge is required.
- Human and JSON responses retain `{ ok, command, data, warnings, errors }`, preserve all existing `asset-authoring-response.v1` fields, and add only versioned provider data. No provider envelope exposes an absolute path.

## Public TDD seams for the implementation PR

The implementation PR must confirm these seams in review before its first
product-code test commit. Tests observe behavior through public boundaries and
must not mock private Core/CLI collaborators or call a real provider.

1. **Core schema seam:** exports from `@lpc-toolkit/core` for descriptor,
   discovery, invocation, result, refusal, and Agent-manifest parsing,
   canonical projection/digest, SemVer compatibility, and D1 provider-output
   projection. Expected digests are fixed literals or checked-in fixtures, not
   recomputed in the test by calling the same helper under test.
2. **CLI capability/manifest seam:** `runCli(['capabilities', '--json'])` and
   `runCli(['agent', 'integration', 'check', '--manifest', ... , '--json'])`
   with real temporary manifest files and no prepared asset runtime.
3. **CLI authoring seam:** `runCli` with the exact public argv for `provider
   discover`, `preflight`, `handoff`, and `result`, real temporary asset
   workspaces, the existing session/contract materialization path, a real
   contract PNG fixture, and an in-process deterministic fake adapter that
   never calls a provider.
4. **Session persistence seam:**
   `createAssetAuthoringSessionStore(...).read/status/resume/replace` plus the
   persisted `session.json`; inject only clock, UUID, filesystem, or atomic
   rename failures at system boundaries.
5. **Response seam:** `authoringResponseProjection`, `formatJsonResponse`, and
   `formatHumanResponse`; assert the public envelope, additive provider field,
   refusal codes, safety, precondition digests, and next action rather than
   helper call order or private file layout.
6. **Packed CLI seam:** `packages/cli/test:package` from a clean consumer
   directory, invoking the built package's public executable and checking
   capabilities, manifest compatibility, preflight, fake result staging,
   existing import/validate/preview, and protected-path sentinels.

## Fixed D2 contract

### Capability and schema identifiers

The implementation must use these exact identifiers and must not advertise
them before the relevant command/checker is complete:

```text
Capabilities:
asset-authoring-provider-discovery.v1
asset-authoring-provider-invocation.v1
agent-integration-packaging.v1

Schemas:
lpc-toolkit.asset-provider-descriptor.v1
lpc-toolkit.asset-provider-discovery.v1
lpc-toolkit.asset-provider-invocation.v1
lpc-toolkit.asset-provider-result.v1
lpc-toolkit.asset-provider-refusal.v1
lpc-toolkit.agent-integration-manifest.v1
```

The only provider operation implemented by this track is
`sprite-candidate.v1`. It is a bounded operation over an already materialized
`lpc-toolkit.sprite-drawing-contract.v1`; it does not interpret a character
concept, prompt, or natural-language request.

The supported CLI SemVer range grammar is intentionally small and pure:

```text
range := comparator (SP comparator)*
comparator := (">=" | ">" | "<=" | "<" | "=") semver
```

Only `>=`, `>`, `<`, `<=`, and `=` comparators joined by one or more spaces are
accepted. No wildcard, caret, tilde, `||`, prerelease coercion, or ambient
package-manager lookup is allowed. The parser compares the exact shipped
`CLI_VERSION` using numeric SemVer components and prerelease ordering.

The fixed D2 resource limits are:

```text
descriptorBytes:       64 KiB
discoveryDescriptors:   32
identifierBytes:        256 UTF-8 bytes
capabilities:           32 per descriptor
contractVersions:       32 per descriptor
declaredHosts:          16 per descriptor
references:              8 per invocation
targetIds:              64 per invocation
timeoutSeconds:          1..600
candidateBytes:         ASSET_PACK_ARCHIVE_LIMITS.entryBytes (64 MiB)
decodedCandidatePixels: 16 * 1024 * 1024
```

All arrays are duplicate-free and canonically sorted where their meaning is a
set. All identifiers are trimmed, non-empty, bounded, and restricted to the
documented portable grammar. Host values are host names only; URLs, paths,
query strings, fragments, credentials, and control characters are rejected.

### Provider descriptor

`lpc-toolkit.asset-provider-descriptor.v1` has this exact semantic shape. The
canonical projection sorts set-like arrays and emits keys in schema order.

```json
{
  "schema": "lpc-toolkit.asset-provider-descriptor.v1",
  "id": "provider.example",
  "adapter": {
    "id": "agent-adapter.example",
    "version": "1.0.0",
    "cliRange": ">=0.3.0 <0.4.0"
  },
  "capabilities": ["sprite-candidate.v1"],
  "contractVersions": ["lpc-toolkit.sprite-drawing-contract.v1"],
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

The descriptor contains identity, versions, bounded limits, and declared
requirements only. It never contains a credential, token, raw prompt, provider
payload, absolute path, URL, or trust/approval claim. A descriptor that asks
the CLI to collect or handle a secret is rejected with
`asset_provider_secret_input` before preflight succeeds.

### Discovery and preflight

`provider discover` accepts a CLI-only JSON array of bounded discovery inputs:

```json
[
  {
    "availability": "available",
    "descriptor": { "...": "the exact descriptor above" }
  }
]
```

`availability` is either `available` or `unavailable`; it is an observation
from the explicitly configured Agent environment, not an instruction for the
CLI to enumerate the machine. The output is
`lpc-toolkit.asset-provider-discovery.v1`:

```json
{
  "schema": "lpc-toolkit.asset-provider-discovery.v1",
  "sessionId": "00000000-0000-4000-8000-000000000000",
  "contractDigest": "sha256:...",
  "cliVersion": "0.3.0",
  "entries": [
    {
      "descriptorDigest": "sha256:...",
      "id": "provider.example",
      "adapter": { "id": "agent-adapter.example", "version": "1.0.0" },
      "status": "supported",
      "missingCapabilities": [],
      "refusal": null
    }
  ]
}
```

Entries sort by provider `id`, adapter `id`, and adapter `version`. Status is
one of `supported`, `unsupported`, `unavailable`, or `consent-required`.
Discovery never selects a provider, creates consent, invokes a provider, or
writes a session. Invalid descriptor input returns the normal CLI error
envelope rather than a partially normalized entry.

`provider preflight` accepts one descriptor and returns the same public CLI
response envelope with a bounded D2 preflight result. It checks the current
session contract digest, CLI range, required contract/capability versions,
provider limits, target/reference scope, credentials policy, protected roots,
and declared network requirements. It does not persist a receipt or stage a
candidate. If consent is missing, it returns `consent-required` with
`asset_provider_consent_required` and the exact scope that must be confirmed.

### Invocation handoff

The handoff command is:

```text
lpc-toolkit asset authoring provider handoff \
  --session <session-id> \
  --descriptor <descriptor.json> \
  --consent <consent.json> \
  [--confirm] [--workspace <directory>] [--json]
```

The consent file contains only the bounded scope selected by the user or
authorized reviewer: target IDs, contract digest, reference digests, network
enabled/host names, candidate limits, and an explicit `confirmed` boolean. It
contains no name, account, prompt, secret, path, URL, or provider payload.

After a successful preflight and explicit `--confirm`, the CLI creates the
normalized `lpc-toolkit.asset-provider-invocation.v1` envelope and persists it
as the optional session `receipts.providerInvocation` value:

```json
{
  "schema": "lpc-toolkit.asset-provider-invocation.v1",
  "sessionId": "00000000-0000-4000-8000-000000000000",
  "contractDigest": "sha256:...",
  "operation": "sprite-candidate.v1",
  "provider": {
    "id": "provider.example",
    "adapter": { "id": "agent-adapter.example", "version": "1.0.0" }
  },
  "targetIds": ["sprites/hair/acme/walk.png"],
  "consent": {
    "confirmed": true,
    "scopeDigest": "sha256:...",
    "network": { "enabled": false, "hosts": [] },
    "referenceDigests": ["sha256:..."]
  },
  "limits": {
    "maxCandidateBytes": 67108864,
    "timeoutSeconds": 600,
    "maxReferences": 8
  },
  "candidate": {
    "stagingId": "provider.example/00000000-0000-4000-8000-000000000000",
    "targetIds": ["sprites/hair/acme/walk.png"]
  }
}
```

The invocation envelope has no raw prompt, provider payload, credential,
absolute path, or trust claim. The CLI does not execute the operation. A
provider/Agent may use the exact contract and the session-relative staging
identifier, then return a result through the public result command.

### Result and refusal

The result command is:

```text
lpc-toolkit asset authoring provider result \
  --session <session-id> \
  --invocation <invocation.json> \
  --result <result.json> \
  [--candidate <candidate.png>] \
  [--workspace <directory>] [--json]
```

`--candidate` is a CLI locator, not a field inside a D2 envelope. The CLI
requires it to resolve to a regular file within the configured workspace and
then copies it into the session-owned provider-candidate root after PNG,
geometry, alpha, byte, decoded-pixel, target, and contract checks. It never
writes the canonical pack source in this command; the existing `import`
command remains the only candidate-to-source mutation authority.

A normalized successful `lpc-toolkit.asset-provider-result.v1` binds the
session, invocation, contract, provider/adapter, operation, exact target,
input/reference digests, candidate identity, and the CLI-computed candidate
digest. A provider-reported digest may be supplied, but the CLI must compare
it to the re-digested bytes and refuse a mismatch. The stored result contains
only the candidate ID and digest, not an absolute candidate path.

`lpc-toolkit.asset-provider-refusal.v1` binds the same session/contract/
provider scope and exactly one stable code from this list:

```text
asset_provider_unavailable
asset_provider_capability_unsupported
asset_provider_contract_mismatch
asset_provider_consent_required
asset_provider_scope_violation
asset_provider_network_denied
asset_provider_secret_input
asset_provider_result_invalid
asset_provider_result_stale
asset_provider_cancelled
asset_provider_timeout
agent_integration_capability_unsupported
```

Every refusal returns one safe next action: re-materialize the current
contract, provide a new external candidate, retry within the unchanged
consent scope, or resolve the stated user/configuration precondition. A
refusal does not clear the previous valid checkpoint or publish a release.

### Agent integration manifest and checker

`lpc-toolkit.agent-integration-manifest.v1` is a declarative compatibility
document, not an installer, provider descriptor, credential store, or release
receipt:

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
  "supportedGoals": ["new-item", "extend-item"],
  "providerAdapters": []
}
```

The checker command is:

```text
lpc-toolkit agent integration check \
  --manifest <manifest.json> [--json]
```

It validates strict fields, CLI range, required/optional capability sets,
supported goals, provider-adapter metadata, and the absence of private paths,
URLs, credentials, source imports, or cache locators in the declarative
manifest. It reports optional capability absence as an explicit external-
author fallback. It never installs, executes, imports, or discovers package
code. Runtime behavior of a future third-party package remains subject to its
own separately reviewed integration/plugin contract.

### Session, response, and D1 bindings

The existing `lpc-toolkit.asset-authoring-session.v1` remains backward
readable. Older sessions read missing D2 values as `null`; unknown fields still
fail closed. The additive session receipt slots are:

```text
receipts.providerInvocation: lpc-toolkit.asset-provider-invocation.v1 | null
receipts.providerResult: lpc-toolkit.asset-provider-result.v1
  | lpc-toolkit.asset-provider-refusal.v1 | null
```

Provider/contract/reference/scope drift invalidates these slots and appends a
`provider` provenance event with the normalized digest. Add the minimum
provider invalidation checkpoint/reason needed by the existing session
invalidation model; do not add a second session file or a formal archive field.

`asset-authoring-response.v1` gains one additive `provider` projection with
status, descriptor/invocation/result digests, bounded refusal data, candidate
ID/digest, and safe next actions. It must not expose an absolute path or any
private provider input. Existing `state`, `reason`, `phase`, `checkpoint`,
`nextActions`, and release-gate fields remain authoritative.

The pure D1 projection maps a successful result to the existing
`AssetReleaseProvenanceProviderOutput` fields: provider ID/tool/optional model,
contract digest, input/reference digests, target ID, and result digest. It
never adds a prompt digest unless an already-bounded public digest is supplied,
and it never maps provider identity to an attribution author or human release
declaration. Existing `asset authoring provenance` publication and formal
archive behavior remain unchanged.

## Intended file structure

Adjust only when existing ownership makes a smaller placement clearly better;
record any deviation in this plan before implementation.

### Core

- Create `packages/core/src/asset-provider-schema.ts` for strict descriptor,
  discovery-entry, invocation, result, refusal, Agent-manifest types/parsers,
  refusal codes, exact resource limits, SemVer compatibility, and canonical
  projections/digest inputs.
- Create `packages/core/src/asset-provider-provenance.ts` for the pure adapter
  from a normalized successful D2 result to the existing D1 provider-output
  record; do not alter the D1 schema or archive format.
- Modify `packages/core/src/index.ts` to export only the approved D2 pure
  contract surface.
- Create `packages/core/test/asset-provider-schema.test.ts` for strict fields,
  privacy/limit rejection, sorting, SemVer ranges, refusal codes, and stable
  projections.
- Create `packages/core/test/asset-provider-provenance.test.ts` for D1 binding,
  no-private-data projection, and provider/result digest coverage.

### CLI application layer

- Create `packages/cli/src/asset-provider-commands.ts` for strict user-file
  loading, discovery/preflight/handoff/result orchestration, consent checks,
  staging-root containment, result re-digestion, and public response mapping.
  It must not execute a provider or duplicate PNG/geometry/import policy.
- Modify `packages/cli/src/asset-authoring-session.ts` to add the two additive
  provider receipt slots, strict old-session-compatible parsing, provider
  invalidation evidence, and session-root/provider-candidate containment.
- Modify `packages/cli/src/asset-authoring-commands.ts` only at its existing
  response/next-action/provenance integration seams; keep validation, preview,
  release gates, archive, and installation authorities in their existing
  modules.
- Modify `packages/cli/src/response.ts` to add the additive provider response
  projection without exposing private paths or replacing the v1 envelope.
- Modify `packages/cli/src/capabilities.ts`, `packages/cli/src/command-spec.ts`,
  and `packages/cli/src/main.ts` at their existing advertisement, help,
  preflight, and dispatch seams for the five fixed commands.
- Extend `packages/cli/src/asset-release-provenance.ts` only if the existing
  public command needs a shared D2-to-D1 projection adapter; do not duplicate
  D1 parsing, canonical encoding, or release binding.

### Tests and packed acceptance

- Create `packages/cli/test/asset-provider-commands.test.ts` for exact
  discovery/preflight/handoff/result argv, real temp roots, consent,
  idempotency, refusal/recovery, protected paths, and no-provider execution.
- Extend `packages/cli/test/asset-authoring-session.test.ts` for old-session
  compatibility, additive provider receipt parsing, atomic provider updates,
  and provider invalidation.
- Extend `packages/cli/test/asset-authoring-session-e2e.test.ts` or add
  `packages/cli/test/asset-provider-session-e2e.test.ts` for a real contract,
  deterministic fake result PNG, existing import/validate/preview, and source
  byte preservation on refusal.
- Extend `packages/cli/test/command-spec.test.ts`, `main-json.test.ts`,
  `main-human.test.ts`, and `response.test.ts` for help, missing options,
  capability advertisement, additive provider output, stable refusal codes,
  and human/JSON parity.
- Extend `packages/cli/test/asset-release-provenance.test.ts` for normalized
  D2 result projection and unchanged ordinary D1 behavior.
- Extend the packed CLI smoke acceptance in
  `packages/cli/scripts/smoke-packed-cli.mjs` or a focused companion script,
  using only a deterministic fake adapter and real temporary workspaces.
- Do not add provider commands to either existing plugin contract fixture or
  existing shipped skill. A future skill-package implementation gets a
  separate plugin contract test and plan.

### Documentation

The implementation PR must update only the owned surfaces whose contracts
change, but this track requires the following initial matrix and a final
reassessment before handoff:

```text
help: update — provider discover/preflight/handoff/result and agent integration check usage, consent, refusal, and safe next actions
cli-readme: update — public D2 commands, JSON schemas, provider-neutral boundary, candidate import handoff, and external-author fallback
root-readme: update — distinguish optional Agent/provider integration from composition, attribution, and release authority
landing: update — explain that provider/Agent integration is optional and no provider is built in or trusted by default
architecture: update — Core/CLI/Agent/provider/package ownership, session receipts, no-private-source boundary, and D1 projection
engineering: update — focused Core/CLI tests, fake-provider packed acceptance, protected-path sentinels, and CI mapping
releasing: update — capability/version/package compatibility and continued separation from formal release/archive gates
plugin: N/A — D2 adds no bundled skill, plugin capability, or plugin command; a future skill package requires a separate reviewed PR
```

The PR body for the later CLI-sensitive implementation must also contain the
repository-required fields:

```text
CLI docs impact: updated
CLI docs surfaces: help, cli-readme, root-readme, landing, architecture, engineering, releasing
CLI docs reason: D2 adds public provider-neutral CLI commands and additive Agent integration compatibility responses.
```

If implementation scope changes the plugin surface, update the matrix and PR
body before implementation continues; do not silently broaden the plan.

## Implementation sequence

### Task 1 — Lock pure D2 schemas, limits, compatibility, and refusal codes

**Files:** Core files listed above.

- [x] Write failing Core tests through the public export seam for exact schema
  identities, unknown-field rejection, canonical ordering, identifier/digest
  syntax, privacy rejection, all resource limits, duplicate set members,
  bounded host names, credential policy, and the exact refusal-code union.
- [x] Add failing tests for the fixed SemVer comparator grammar, required and
  optional capability comparison, contract-version matching, and deterministic
  discovery status projections.
- [x] Add failing tests for invocation/result binding to session, contract,
  provider, adapter, operation, target, reference, input, candidate, and
  consent-scope digests.
- [x] Implement the minimum pure parsers, normalized models, projections, and
  digest inputs in `asset-provider-schema.ts`; keep all I/O outside Core.
- [x] Implement the D2-to-D1 provider-output adapter in
  `asset-provider-provenance.ts`; reject any attempt to project a private path,
  prompt, payload, credential, or human approval claim.
- [x] Export only the approved types/functions from `packages/core/src/index.ts`.
- [x] Run the focused Core test and typecheck; record RED and GREEN evidence.
- [x] Commit the product slice with a conventional message such as
  `feat(core): add provider-neutral integration contracts`.

  - Implementation: Added strict provider descriptor/discovery/invocation/result/refusal and Agent-manifest parsers, bounded SemVer and capability compatibility, canonical digest inputs, binding diagnostics, and the pure D1 provider-output projection. No I/O or provider execution enters Core.
  - RED: `rtk pnpm --filter @lpc-toolkit/core test -- asset-provider-schema.test.ts` FAIL — `parseAssetProviderDescriptor is not a function`.
  - RED: `rtk pnpm --filter @lpc-toolkit/core test -- asset-provider-provenance.test.ts` FAIL — `assetProviderResultToReleaseProvenanceRecord is not a function`.
  - Commit: a1f54c1e4e386fe35e84be08bb577c9a419758c6
  - Verification: `rtk pnpm --filter @lpc-toolkit/core test -- asset-provider-schema.test.ts asset-provider-provenance.test.ts` PASS — 2 files, 10 tests.
  - Verification: `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS.
  - Verification: `rtk pnpm --filter @lpc-toolkit/core test` PASS — 31 files, 422 tests.
  - Verification: `rtk git diff --check` PASS.
  - Verification: `rtk pnpm verify` FAIL — sandboxed `tsx prepare-assets` could not create its IPC pipe (`listen EPERM`).
  - Verification: `rtk pnpm verify` (escalated rerun) FAIL — all pre-test gates and typechecks passed, then an existing CLI Vitest worker exited unexpectedly after 1,138 passed tests and 1 skipped test.

### Task 2 — Add capability advertisement and Agent manifest compatibility

**Files:** `packages/cli/src/capabilities.ts`, `response.ts`, `main.ts`,
`command-spec.ts`, new/extended CLI tests.

- [ ] Write RED tests proving the three D2 capabilities/six schemas are absent
  before the feature slice and then advertised in deterministic order only
  after implementation is complete.
- [ ] Add the exact `agent integration check --manifest <manifest.json>`
  preflight path without loading asset runtime, workspace state, provider code,
  or a network.
- [ ] Return required-capability failure as
  `agent_integration_capability_unsupported`; return optional capability
  absence as an explicit fallback, not as a failed command.
- [ ] Refuse manifest private paths, URLs, credentials, unknown fields,
  unsupported goals, invalid SemVer, duplicate capabilities, and required /
  optional overlap.
- [ ] Assert JSON/human output parity and keep the existing generic CLI response
  envelope unchanged.
- [ ] Run focused CLI tests and typecheck; commit as
  `feat(cli): validate Agent integration compatibility`.

### Task 3 — Add discovery and read-only session preflight

**Files:** new `asset-provider-commands.ts`, `main.ts`, `command-spec.ts`,
`asset-authoring-session.ts` only where current-contract evidence is needed,
and focused CLI tests.

- [x] Write RED public `runCli` tests for `provider discover` with stable
  sorting, all four statuses, duplicate descriptor handling, invalid input,
  32-descriptor limit, and no filesystem mutation.
- [x] Write RED tests for `provider preflight` with current/stale/missing
  contract, CLI range mismatch, missing capability, limit mismatch, declared
  network, credential policy, target/reference scope, and protected-root
  refusal.
- [x] Read the current contract and its existing artifact metadata through the
  existing session/contract authorities; do not rederive geometry or read
  caches directly.
- [x] Implement discovery as a bounded normalization of explicitly supplied
  descriptors. It must not enumerate processes, directories, registries, or
  remote services.
- [x] Implement preflight as read-only. It must not write `session.json`,
  contract artifacts, candidate bytes, manifests, receipts, or provenance.
- [x] Run focused tests, CLI typecheck, and `rtk pnpm check:boundaries`; commit
  as `feat(cli): add provider discovery and preflight`.

### Task 4 — Persist explicit-consent invocation handoff

**Files:** `asset-provider-commands.ts`, `asset-authoring-session.ts`,
`asset-authoring-commands.ts`, `response.ts`, and focused tests.

- [x] Write RED tests for missing consent, missing `--confirm`, changed
  provider/adapter, changed contract, added reference, network expansion,
  target expansion, limit expansion, and unchanged-scope retry.
- [x] Extend the additive session receipt parser to accept
  `providerInvocation` and `providerResult` as `null` for older sessions while
  rejecting malformed or out-of-scope values.
- [x] Implement `provider handoff` only after read-only preflight and exact
  explicit consent. Persist the invocation atomically below the session root;
  never modify `asset-pack.json`, source PNGs, archives, credits, or release
  receipts.
- [x] Bind retry idempotency to provider ID, adapter ID/version, CLI range,
  contract digest, target IDs, reference digests, network hosts, and limits.
  Changing any binding requires new consent and a new invocation.
- [x] Add a bounded provider response projection containing only IDs, digests,
  status, safety, and next actions. Do not expose invocation file absolute
  paths in the D2 field.
- [x] Run focused session/command/response tests and record atomic failure
  evidence; commit as `feat(cli): persist consent-scoped provider handoffs`.

### Task 5 — Validate result/refusal and stage candidate bytes

**Files:** `asset-provider-commands.ts`, the smallest reusable candidate-PNG
preflight seam in `asset-authoring-import.ts` if required, session/response
integration, and focused/e2e tests.

- [ ] Write RED tests for a valid deterministic fake-provider result, reported
  digest mismatch, stale invocation, wrong target, wrong contract, invalid
  PNG, geometry/alpha mismatch, byte/pixel limit, symlink/out-of-root path,
  cancellation, timeout, unavailable provider, and network denial.
- [ ] Reuse the existing candidate inspection and `ASSET_PACK_ARCHIVE_LIMITS`
  authorities. If a non-mutating helper must be extracted, preserve the
  existing import behavior and test it through the public candidate boundary.
- [ ] Implement `provider result` to validate the stored invocation, re-read
  the exact session contract, inspect the candidate, re-digest bytes, and stage
  only below a session-owned provider-candidate root. The normalized result
  stores candidate ID/digest, not an absolute path.
- [ ] Persist a success result or one refusal envelope atomically. A refusal
  must preserve the previous valid checkpoint and expose exactly one safe next
  action. The result command must not call `importAssetAuthoringCandidate` to
  mutate canonical source; existing `asset authoring import` remains the next
  action.
- [ ] Verify unchanged source, manifest, credit, release, and `upstream/`
  sentinels after every refusal and candidate-staging failure.
- [ ] Run focused CLI tests and the real temporary-root authoring E2E; commit
  as `feat(cli): stage provider results through candidate trust boundary`.

### Task 6 — Bind D2 results to recovery, response, and D1 provenance

**Files:** `asset-authoring-session.ts`, `asset-authoring-commands.ts`,
`response.ts`, `asset-release-provenance.ts` only where delegation requires it,
Core projection tests, and CLI tests.

- [ ] Write RED tests for contract/source/manifest drift after handoff, result
  drift after staging, provider switch, result refusal, resume, and status.
- [ ] Extend `deriveAuthoringInvalidationDecisions` and the existing resume
  path with the minimum provider checkpoint/reason so provider evidence becomes
  stale without erasing unrelated valid release evidence.
- [ ] Add a provider next-action path that leads to existing contract,
  external-candidate, import, validation, preview, and release commands; do
  not create a second lifecycle state machine.
- [ ] Project a successful result through the pure D1 adapter and keep existing
  `asset authoring provenance` publication, formal archive, inspect, and install
  semantics unchanged. Verify no D2 field enters `asset-pack.json` or a ZIP.
- [ ] Assert that D1 output excludes prompt/payload/credential/private-path/
  human-approval data and that provider identity is never an attribution author.
- [ ] Run focused Core/CLI provenance, session, response, JSON, and human tests;
  commit as `feat(cli): bind provider evidence to provenance recovery`.

### Task 7 — Prove the packed public CLI and Agent manifest boundary

**Files:** `packages/cli/scripts/smoke-packed-cli.mjs` or a focused companion,
packed acceptance fixtures/tests, and no plugin skill files.

- [ ] Write RED packed acceptance for capabilities, compatible/incompatible
  Agent manifests, discovery, preflight, consent handoff, fake result staging,
  existing import/validate/preview, refusal recovery, and D1 projection.
- [ ] Build/install the packed CLI in a clean temporary consumer directory and
  invoke only its public executable. The fake adapter must be deterministic and
  local; no real provider, network, credential, skill, backend, or registry is
  permitted.
- [ ] Snapshot and assert unchanged checked-in assets, base cache, artist source
  before import, formal archive, D1 receipt placement, unowned output, and
  `upstream/`; only intended session-owned candidate/import paths may change.
- [ ] Confirm older v1 sessions, ordinary character commands, ordinary asset
  validation, archive inspect/install, and the existing two plugin skills remain
  compatible and do not claim D2 capabilities.
- [ ] Run `rtk pnpm --filter @lpc-toolkit/cli test:package`, focused packed tests,
  `rtk pnpm verify:plugin`, and `rtk pnpm check:boundaries`; commit as
  `test(cli): cover packed provider handoff boundary`.

### Task 8 — Update owned documentation and complete verification

**Files:** `packages/cli/src/command-spec.ts`, `packages/cli/README.md`,
`README.md`, `packages/web/src/components/landing-page.tsx`,
`docs/ARCHITECTURE.md`, `docs/ENGINEERING.md`, `docs/RELEASING.md`, and
documentation tests as needed. Do not modify `plugins/lpc-toolkit/` for this
track.

- [ ] Update help with exact D2 commands, consent/refusal behavior, logical
  candidate staging, and the existing import/release boundary.
- [ ] Update CLI/root/landing copy to distinguish optional Agent/provider
  integration from sprite composition, attribution, authorship, and release
  authority. Do not imply that a provider is built in, trusted, or required.
- [ ] Update architecture with Core/CLI/Agent/provider/package ownership,
  session receipt/invalidation, protected-root behavior, and D1 projection.
- [ ] Update engineering with focused commands, fake-provider packed checks,
  protected sentinels, response contracts, and CI mapping.
- [ ] Update releasing with capability/version/package compatibility and the
  unchanged formal archive/release gates; no provider publication or plugin
  release is added.
- [ ] Reassess the full CLI documentation matrix and update the PR body fields
  before handoff. Keep `plugin` as N/A unless a separately reviewed skill
  package is explicitly added.
- [ ] Run the complete verification set below, record every exact PASS/FAIL
  result, then commit the final plan record separately if implementation tasks
  changed this file.

## Verification commands

Use the narrowest command while iterating, then run the complete set before
implementation handoff. Every command below must be run with `rtk` in the
repository workflow.

### Core D2 contract

```sh
rtk pnpm --filter @lpc-toolkit/core test -- asset-provider-schema.test.ts asset-provider-provenance.test.ts
rtk pnpm --filter @lpc-toolkit/core run typecheck
```

### CLI D2 public seams

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-provider-commands.test.ts asset-authoring-session.test.ts asset-authoring-session-e2e.test.ts asset-release-provenance.test.ts command-spec.test.ts main-json.test.ts main-human.test.ts response.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm check:boundaries
```

### Documentation and plugin boundary

```sh
rtk pnpm verify:cli-docs-policy
rtk pnpm verify:plugin
```

### Packed acceptance

```sh
rtk pnpm --filter @lpc-toolkit/cli test:package
```

### Final repository gate

```sh
rtk pnpm verify
```

No verification command may initialize or use the repository's `upstream/`
gitlink. Parity verification remains a separate isolated-checkout workflow.

## Implementation record

Update this section after each completed implementation task. Record full
commit hashes, not abbreviated hashes, and exact command results.

- [x] Task 1 — Core D2 schemas, limits, compatibility, and refusal codes
  - Commit: a1f54c1e4e386fe35e84be08bb577c9a419758c6
  - Verification: focused Core tests, Core typecheck, full Core regression, and `rtk git diff --check` all PASS; repository verify failure evidence and RED evidence are recorded above.
- [x] Task 2 — Capability advertisement and Agent manifest compatibility
  - Commit: c706db442493219c64b1e5f752968f747447c291
  - Implementation: Advertised the three D2 capabilities and six schema versions in deterministic order; added the offline `agent integration check --manifest <manifest.json>` public CLI seam with strict Core parsing, compatibility refusal, optional fallback, privacy rejection, and JSON/human response parity. The checker does not prepare runtime assets, load workspace state, execute providers, or use a network.
  - RED: `rtk pnpm exec vitest run packages/cli/test/main-json.test.ts -t "advertises stable authoring capabilities"` FAIL — the pre-feature capability advertisement ended with the existing release capabilities instead of the three D2 capability IDs.
  - RED: `rtk pnpm exec vitest run packages/cli/test/agent-integration.test.ts` FAIL — the pre-feature command returned exit code 1 instead of the expected successful compatibility check.
  - Verification: `rtk pnpm exec vitest run test/agent-integration.test.ts` PASS — 13 tests from `packages/cli`.
  - Verification: `rtk pnpm exec vitest run test/command-spec.test.ts -t "fixed capability and asset authoring command surface"` PASS — 1 test from `packages/cli`.
  - Verification: `rtk pnpm exec vitest run test/main-json.test.ts -t "advertises stable authoring capabilities"` PASS — 1 test from `packages/cli`.
  - Verification: `rtk pnpm exec vitest run test/main-human.test.ts -t "human-readable CLI output"` PASS — 39 tests from `packages/cli`.
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli typecheck` PASS.
  - Verification: `rtk git diff --check` PASS.
  - Verification: `rtk pnpm test` FAIL in the sandbox — 13 existing `web-server` tests could not bind `127.0.0.1` (`EPERM`); no Task 2 test failed.
  - Verification: `rtk pnpm test` PASS in a loopback-enabled rerun — 64 files, 1,182 tests passed, 1 skipped.
  - Documentation impact reassessment: `help: update` in `command-spec.ts`; `cli-readme`, `root-readme`, `landing`, `architecture`, `engineering`, and `releasing` remain owned by Task 8's complete D2 documentation pass; `plugin: N/A` because no bundled skill or plugin command was added.
- [x] Task 3 — Discovery and read-only session preflight
  - Implementation: Added the public `asset authoring provider discover` and `preflight` seams. Discovery reads only an explicitly supplied bounded descriptor array, normalizes all four Core statuses with stable ordering, rejects duplicate/invalid/over-limit input, and never prepares runtime assets. Preflight reads the current session contract and artifact metadata through the existing bounded import authority, checks CLI range, operation capability, contract version, candidate/reference limits, target/reference scope, credential/network policy, and session-owned protected staging roots, and returns a bounded refusal result without writing session, contract, pack, receipt, manifest, or provenance bytes. The current-contract helper in `asset-authoring-import.ts` is read-only and shares the existing validation authority.
  - RED: `rtk pnpm exec vitest run test/asset-provider-commands.test.ts` FAIL — the pre-feature CLI returned exit code 1 because the provider command route and public discovery seam were absent.
  - Commit: ddabb4ca6449a10848acb16681a1d923154f37ab
  - Verification: `rtk pnpm exec vitest run test/asset-provider-commands.test.ts` PASS — 1 file, 4 tests.
  - Verification: `rtk pnpm exec vitest run test/command-spec.test.ts test/main-json.test.ts test/main-human.test.ts test/response.test.ts` PASS — 4 files, 138 tests.
  - Verification: `rtk pnpm exec tsc -p tsconfig.json --noEmit` PASS from `packages/cli`.
  - Verification: `rtk pnpm check:boundaries` PASS.
  - Verification: `rtk git diff --check` PASS.
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test` FAIL in the sandbox — 64 files and 1,175 tests passed with 1 skipped; 13 existing `web-server` tests could not bind `127.0.0.1` (`EPERM`).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test` PASS in a loopback-enabled rerun — 65 files, 1,188 tests passed, 1 skipped.
  - Documentation impact reassessment: `help: update` in `command-spec.ts`; `cli-readme`, `root-readme`, `landing`, `architecture`, `engineering`, and `releasing` remain owned by Task 8's complete D2 documentation pass; `plugin: N/A` because no provider skill or plugin command was added.
- [x] Task 4 — Consent-scoped invocation handoff
  - Implementation: Added strict consent-file parsing, read-only contract-bound handoff preflight, explicit `--confirm` gating, atomic session receipt persistence, unchanged-scope idempotent reuse, new-consent enforcement for provider/adapter/contract/reference/network/target/limit changes, additive provider response projection, human formatting, and old-session receipt compatibility. Handoff records only the bounded invocation and never executes a provider or mutates pack source, archives, credits, or release receipts.
  - RED: `rtk pnpm exec vitest run test/asset-provider-commands.test.ts test/asset-authoring-session.test.ts test/main-json.test.ts` FAIL before implementation — 6 expected failures covering the absent handoff route, missing additive receipt slots, and provider response projection.
  - Commit: 5b74e9213420ea0af965d1028c1f6df0652d246d
  - Verification: `rtk pnpm exec vitest run test/asset-provider-commands.test.ts test/asset-authoring-session.test.ts test/main-json.test.ts test/response.test.ts test/command-spec.test.ts test/main-human.test.ts test/args.test.ts` PASS — 7 files, 174 tests.
  - Verification: `rtk pnpm exec tsc -p tsconfig.json --noEmit` PASS from `packages/cli`.
  - Verification: `rtk pnpm check:boundaries` PASS.
  - Verification: `rtk git diff --check` PASS.
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test` FAIL in the sandbox — 64 files passed and 1 failed; 1,181 tests passed, 1 skipped, and 13 existing `web-server` tests could not bind `127.0.0.1` (`EPERM`).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test` PASS in a loopback-enabled rerun — 65 files, 1,194 tests passed, 1 skipped.
  - Documentation impact reassessment:
    ```text
    help: update — provider handoff command, consent, confirmation, refusal, and next-action help added in command-spec.ts
    cli-readme: N/A — Task 8 owns the complete D2 CLI documentation pass
    root-readme: N/A — Task 8 owns the complete D2 CLI documentation pass
    landing: N/A — Task 8 owns the complete D2 CLI documentation pass
    architecture: N/A — Task 8 owns the complete D2 CLI documentation pass
    engineering: N/A — Task 8 owns the complete D2 CLI documentation and verification pass
    releasing: N/A — Task 8 owns the complete D2 release documentation pass
    plugin: N/A — no provider skill or plugin command was added
    ```
- [ ] Task 5 — Result/refusal validation and candidate staging
  - Commit: pending
  - Verification: pending
- [ ] Task 6 — Recovery, response, and D1 provenance binding
  - Commit: pending
  - Verification: pending
- [ ] Task 7 — Packed public CLI and Agent manifest boundary
  - Commit: pending
  - Verification: pending
- [ ] Task 8 — Documentation and final verification
  - Commit: pending
  - Verification: pending

## Delivery protocol

1. Review and merge this implementation plan as a separate PR.
2. Create the implementation branch from the merged plan/base and execute one
   focused task at a time with red → green evidence.
3. Keep real providers, credentials, network, Web bridging, remote registries,
   and new skills outside the implementation unless a separate approved scope
   explicitly changes this plan.
4. Do not claim a D2 capability in help, README, landing, plugin metadata, or
   `capabilities --json` before the public seam, refusal behavior, tests, and
   packed acceptance for that capability are complete.
5. Preserve the existing D1 release lifecycle and human release authority.
