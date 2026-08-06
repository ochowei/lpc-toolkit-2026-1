# D5 — Authoring Intelligence Implementation Plan

**Status:** Proposed implementation plan — review and merge required before
product implementation
**Issue:** [#176](https://github.com/ochowei/lpc-toolkit-2026-1/issues/176)
**Roadmap:** [#153](https://github.com/ochowei/lpc-toolkit-2026-1/issues/153)
**Spec:** [D5 — Authoring Intelligence](../specs/2026-08-06-authoring-intelligence.md)
**Base:** D4 implementation merge commit
`3a3665c84396ed80fb6c4d0c7476fccdebb2913d` ([PR #175](https://github.com/ochowei/lpc-toolkit-2026-1/pull/175))
**Spec/plan branch:** `codex/issue-176-d5-authoring-intelligence`
**Implementation branch:** to be created only after this spec/plan review PR
is merged and the user confirms the review gate

This plan is intentionally limited to the D5 track. It does not implement D6,
modify the D4 publication/trust boundary, or combine the work with another
roadmap PR. The spec and this plan must land in an independent review PR before
any product code, public capability, or public CLI command is added.

## Review gate and non-negotiable boundaries

- [ ] Review D5 spec and this plan with Issue #176 as the source of scope.
- [ ] Merge the independent spec/plan review PR.
- [ ] Obtain explicit confirmation before creating the D5 implementation
  branch or changing product code.
- [ ] Keep all work on `codex/` branches and leave `upstream/` untouched.
- [ ] Do not add dependencies, a model SDK/runtime, provider, backend, auth,
  network service, registry, signing key, marketplace mutation, npm
  publication, or external service mutation.
- [ ] Use local deterministic fixtures/fakes for all tests; no real provider,
  model, registry, marketplace, key, or publication call.
- [ ] Keep TypeScript strict and add no `any`.
- [ ] Preserve attribution, consent, validation, attributed preview, human
  authority, release gates, provenance, trust, and architecture boundaries.
- [ ] Keep `asset-pack.v1` bytes/manifest/install/plugin behavior unchanged;
  prove compatibility with regression tests before handoff.
- [ ] Do not introduce persistent browser authoring state. D3 remains an
  explicit file handoff and recovery boundary.

## Public behavior and mutation boundary

The implementation may expose a read-only route operation and a bounded
session-owned staging operation only after the corresponding contracts and
tests exist. Candidate staging is not import, source mutation, preview
acceptance, release declaration, publication, or installation.

| Action | D5 authority | Required user/authority boundary |
| --- | --- | --- |
| Interpret a request | Core deterministic router | Ambiguity returns a choice or refusal |
| Build an operation plan | Core canonical operation planner | Exact inputs, contract, limits, and digest required |
| Materialize a candidate | CLI session staging | Consent and staging scope required; no canonical write |
| Import a candidate | Existing CLI candidate import | Explicit existing import command only |
| Validate/attribute/preview | Existing authorities | Existing checks and attributed preview remain mandatory |
| Accept/release/publish/install | Existing human/release authorities | No D5 automation or bypass |

Any proposed CLI command must reuse the existing session response envelope,
candidate staging, candidate import, validation, preview, recovery, and
attribution authorities. It must not create a private equivalent path.

## CLI documentation impact matrix

The matrix is evaluated during implementation design and again before
handoff. New public CLI behavior cannot be merged without recording the final
result in the checked-in plan and the PR declaration.

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

The landing surface is an update because it must explain the route/staging
boundary without promising model inference or persistent browser authoring
state. The plugin surface is currently N/A because D5 does not add a plugin
capability; revisit it if the implementation changes that scope.

## Implementation tasks

### 0. Reviewable contract and fixture boundary

- [ ] Confirm the spec, this plan, Issue #176, and the D1–D4 integration
  boundaries agree.
- [ ] Identify existing Core, CLI, Web, and session authorities to extend;
  do not duplicate them.
- [ ] Define checked-in local fixtures for catalog snapshots, palettes,
  drawing contracts, candidate inputs, attribution, explicit geometry, and
  bounded layer graphs.
- [ ] Define the public capability/schema declaration point, but do not
  advertise a reserved D5 identifier before implementation and tests pass.

**TDD evidence:** fixture and contract tests must fail for missing behavior
before implementation, then pass without a provider/model/network dependency.

**Plan record:** record the implementation commit, exact test commands, and
PASS/FAIL result here after completion.

### 1. Implement the deterministic request and routing contracts

- [ ] Add strict request normalization, bounded UTF-8 input handling, and
  canonical request digesting without persisting raw request text in public
  receipts.
- [ ] Add the fixed vocabulary, catalog-first predicates, stable candidate
  ordering, explicit-hint validation, and route outcomes from the spec:
  `compose-existing`, `extend-existing`, `derive-variant`,
  `derive-recolor`, `custom-geometry`, `multi-layer`,
  `needs-user-action`, and `refused`.
- [ ] Return finite choices and concrete next actions for ambiguity, stale
  catalog/contract state, unsupported capability, rights gaps, and resource
  limits.
- [ ] Treat provider or Agent/model hints as untrusted optional input; validate
  them as user-visible structured input and never make them a runtime
  authority.

**TDD evidence:** pure tests cover normalization, digest stability, catalog
ordering, synonym handling, ambiguity, refusal, unsupported capability,
privacy-safe projections, and exact replay.

**Plan record:** record the implementation commit, exact test commands, and
PASS/FAIL result here after completion.

### 2. Implement deterministic candidate operation contracts

- [ ] Add canonical operation records and operation digests that exclude
  timestamps, random IDs, local paths, environment values, credentials, raw
  request text, and provider payloads.
- [ ] Add sorted-DAG validation for input/output identities, duplicate targets,
  cycles, traversal, unsupported operations, and fixed resource limits.
- [ ] Add deterministic variant operations that retain asset identity,
  supported body/animation/layer semantics, source obligations, and credits.
- [ ] Add deterministic recolor operations through existing Core palette and
  recolor authorities, including source/target ramp validation, alpha
  preservation, and explicit user palette maps.
- [ ] Add an explicit versioned custom-geometry extension contract (`v2`) for
  bounded frames/cells/rows/canvas/layer data while leaving v1 unchanged.
- [ ] Add bounded multi-layer candidate-set and layer-graph operations with
  independent target contracts; do not flatten or resolve cross-pack
  conflicts (D6 scope).

**TDD evidence:** Core tests prove byte/digest determinism, v1 compatibility,
variant/recolor correctness, geometry bounds, layer DAG behavior, refusal on
missing/ambiguous input, and resource-limit enforcement.

**Plan record:** record the implementation commit, exact test commands, and
PASS/FAIL result here after completion.

### 3. Add session-owned CLI staging and safe operation execution

- [ ] Add only the smallest public route/stage command surface required by the
  reviewed contract, with stable human and JSON output.
- [ ] Require the existing session scope, exact catalog/contract/input
  digests, explicit consent, and bounded operation limits before staging.
- [ ] Materialize only below the current session-owned candidate staging root;
  store logical relative IDs and operation/contract/input/output digests.
- [ ] Make identical replay a verified no-op and changed input/output a stale
  or conflict response; never overwrite automatically.
- [ ] Ensure receipts exclude raw prompts, credentials, absolute paths,
  provider payloads, and raw candidate bytes.

**TDD evidence:** CLI tests cover consent, staging-root containment, receipt
projection, deterministic replay, stale input, contract/catalog drift,
resource limits, and refusal/recovery output using local fixtures.

**Plan record:** record the implementation commit, exact test commands, and
PASS/FAIL result here after completion.

### 4. Integrate with candidate import, validation, preview, and human review

- [ ] Keep existing `asset authoring import` as the sole candidate import
  authority; D5 staging must produce an explicit next action rather than
  importing.
- [ ] Reuse existing contract-bound import checks, PNG inspection, asset
  identity checks, attribution/credit checks, validation, and attributed
  preview.
- [ ] Keep preview acceptance, declaration, packing, installation, and
  publication behind their existing human/release gates.
- [ ] Preserve sibling layers and untouched source assets when a candidate
  targets one layer or one explicit output identity.
- [ ] Add recovery commands/actions for re-import, discard staged candidate,
  refresh exact inputs, review route, resolve layer scope, and resume only
  from a valid checkpoint.

**TDD evidence:** integration tests prove a staged candidate cannot bypass
import, validation, attribution, preview, human review, or release gates;
recovery is deterministic and stale state is surfaced.

**Plan record:** record the implementation commit, exact test commands, and
PASS/FAIL result here after completion.

### 5. Connect D1 provenance, D2 provider evidence, and D3 handoff boundaries

- [ ] Emit D1-compatible `source-transformation` provenance for deterministic
  operations, binding source identity, operation digest, contract digest,
  output digest, and attribution references.
- [ ] Preserve source credits and license obligations through variants,
  recolors, custom geometry, and multi-layer candidates; missing evidence
  refuses or requires explicit user action.
- [ ] Accept D2 provider results only as optional, validated, user-visible
  hints or candidate inputs; never treat provider output as approval or as a
  source/import authority.
- [ ] Keep D3 transfer receipts file-scoped, explicit, privacy-safe, and
  recoverable; do not add persistent browser authoring state.
- [ ] Leave D4 distribution, signing, trust, provenance verification,
  publication, rollback, and install behavior downstream and unchanged.

**TDD evidence:** cross-boundary tests cover attribution preservation,
provider-result provenance, handoff receipt compatibility, stale transfer
recovery, and no authority escalation.

**Plan record:** record the implementation commit, exact test commands, and
PASS/FAIL result here after completion.

### 6. Advertise capabilities only with complete contract coverage

- [ ] Add the reserved D5 capability/schema identifiers only after their
  implementation, validation, privacy projection, and compatibility tests are
  complete.
- [ ] Make unsupported older integrations return a stable response and fall
  back to the existing manual/external-author workflow.
- [ ] Document route outcomes, consent, staging, explicit import, preview,
  review, refusal, recovery, and compatibility without implying automatic
  authoring or publishing.
- [ ] Update the CLI help and capability output in the same implementation
  change as the public behavior.

**TDD evidence:** packed CLI tests assert the advertised contract, stable
unsupported responses, safe JSON/human output, and absence of raw/private
fields.

**Plan record:** record the implementation commit, exact test commands, and
PASS/FAIL result here after completion.

### 7. Run regression and packed acceptance coverage

- [ ] Run focused Core and CLI TDD suites with real PNG fixtures and local
  fake/session data.
- [ ] Run existing v1 archive, manifest, install, plugin, composition,
  attribution, consent, preview, release-gate, D1, D2, D3, and D4 regression
  suites.
- [ ] Verify no test initializes or reads `upstream/`, writes outside the
  approved session fixture roots, or calls an external service.
- [ ] Verify strict TypeScript and boundary checks; fix violations in the
  implementation rather than weakening the checker.

**Plan record:** record the implementation commit, exact test commands, and
PASS/FAIL result here after completion.

### 8. Complete documentation impact matrix and handoff evidence

- [ ] Reassess every CLI-sensitive surface and record the final matrix:
  `help`, CLI README, root README, landing, architecture, engineering,
  releasing, and plugin contract.
- [ ] Update every surface marked `update`; record a precise N/A reason for
  any surface that remains out of scope.
- [ ] Add examples that show route → consent → staging → explicit import →
  validation → attributed preview → human review, including refusal/recovery.
- [ ] Explain that D5 uses deterministic operations and has no required model,
  provider, backend, auth, network, or persistent browser authoring state.
- [ ] Ensure public docs preserve existing v1 and release compatibility notes.

**Plan record:** record the documentation commit, exact documentation policy
command, and PASS/FAIL result here after completion.

### 9. Final verification and independent PR handoff

- [ ] Run the complete required repository verification from the implementation
  branch:

  ```text
  rtk pnpm verify
  rtk pnpm check:boundaries
  rtk pnpm verify:plugin
  rtk pnpm verify:cli-docs-policy
  rtk git diff --check
  ```

- [ ] Run all focused D5 tests and the packed CLI acceptance command(s),
  recording each exact command and PASS/FAIL result.
- [ ] Update this checked-in plan after every completed implementation step;
  record full commit hashes, not abbreviated hashes.
- [ ] Use an independent D5 implementation commit/branch/PR. Do not merge
  automatically and do not begin D6 until the D5 implementation PR is merged
  and the user confirms it.
- [ ] Report current D5 task, completed work, commit/PR, verification,
  next step, and blockers without claiming completion before CI and merge.

**Final implementation record:**

```text
Implementation branch: pending review gate
Implementation PR: pending review gate
Commits: pending implementation
Verification:
  rtk pnpm verify — pending implementation
  rtk pnpm check:boundaries — pending implementation
  rtk pnpm verify:plugin — pending implementation
  rtk pnpm verify:cli-docs-policy — pending implementation
  rtk git diff --check — pending implementation
```

## Verification strategy before the implementation PR

The current spec/plan review PR is documentation-only. Before opening it,
run the checks that can validate this change without product implementation:

```text
rtk git diff --check
rtk rg -n "natural-language|variants|recolors|custom geometry|multi-layer|consent|refusal|recovery|persistent browser|model|provider|D6" \
  docs/superpowers/specs/2026-08-06-authoring-intelligence.md \
  docs/superpowers/plans/2026-08-06-authoring-intelligence.md
```

The full repository gates belong to the D5 implementation PR and must not be
reported as passing until that implementation exists and CI has passed.

## Review questions

Reviewers should resolve these questions before approving implementation:

1. Are the route outcomes, refusal codes, and recovery actions deterministic
   and specific enough for CLI and future Web/Agent callers?
2. Is the `sprite-drawing-contract.v2` extension limited to explicit geometry
   and layer data, with v1 behavior and archive compatibility preserved?
3. Are the fixed operation/resource limits appropriate for local CLI use and
   testable without a backend or model?
4. Does the variant/recolor scope preserve source identity, credits, license,
   palette ownership, and human approval in every path?
5. Does staging always stop before the existing explicit candidate import,
   validation, attributed preview, and release gates?
6. Does the plan avoid persistent browser authoring state and any opaque
   model/provider dependency?

