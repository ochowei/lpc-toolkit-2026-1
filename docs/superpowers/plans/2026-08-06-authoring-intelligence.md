# D5 — Authoring Intelligence Implementation Plan

**Status:** D5 implementation Draft PR #178 open — CI, merge, and user
confirmation pending
**Issue:** [#176](https://github.com/ochowei/lpc-toolkit-2026-1/issues/176)
**Roadmap:** [#153](https://github.com/ochowei/lpc-toolkit-2026-1/issues/153)
**Spec:** [D5 — Authoring Intelligence](../specs/2026-08-06-authoring-intelligence.md)
**Base:** D4 implementation merge commit
`3a3665c84396ed80fb6c4d0c7476fccdebb2913d` ([PR #175](https://github.com/ochowei/lpc-toolkit-2026-1/pull/175))
**Spec/plan branch:** `codex/issue-176-d5-authoring-intelligence`
**Implementation branch:** `codex/issue-176-d5-authoring-intelligence-implementation`

This plan is intentionally limited to the D5 track. It does not implement D6,
modify the D4 publication/trust boundary, or combine the work with another
roadmap PR. The spec and this plan must land in an independent review PR before
any product code, public capability, or public CLI command is added.

## Review gate and non-negotiable boundaries

- [x] Review D5 spec and this plan with Issue #176 as the source of scope.
  - Verification: PR #177 merged into `origin/main` as `505fafbeaad3366d498334fd26f60bd8f890d640`; CI run #392 PASS.
- [x] Merge the independent spec/plan review PR.
- [x] Obtain explicit confirmation before creating the D5 implementation
  branch or changing product code.
- [x] Keep all work on `codex/` branches and leave `upstream/` untouched.
- [x] Do not add dependencies, a model SDK/runtime, provider, backend, auth,
  network service, registry, signing key, marketplace mutation, npm
  publication, or external service mutation.
- [x] Use local deterministic fixtures/fakes for all tests; no real provider,
  model, registry, marketplace, key, or publication call.
- [x] Keep TypeScript strict and add no `any`.
- [x] Preserve attribution, consent, validation, attributed preview, human
  authority, release gates, provenance, trust, and architecture boundaries.
- [x] Keep `asset-pack.v1` bytes/manifest/install/plugin behavior unchanged;
  prove compatibility with regression tests before handoff.
- [x] Do not introduce persistent browser authoring state. D3 remains an
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

- [x] Confirm the spec, this plan, Issue #176, and the D1–D4 integration
  boundaries agree.
- [x] Identify existing Core, CLI, Web, and session authorities to extend;
  do not duplicate them.
- [x] Define checked-in local fixtures for catalog snapshots, palettes,
  drawing contracts, candidate inputs, attribution, explicit geometry, and
  bounded layer graphs.
- [x] Define the public capability/schema declaration point, but do not
  advertise a reserved D5 identifier before implementation and tests pass.

**TDD evidence:** fixture and contract tests must fail for missing behavior
before implementation, then pass without a provider/model/network dependency.

**Plan record:** record the implementation commit, exact test commands, and
PASS/FAIL result here after completion.

**Implementation record:** The reviewed Core/CLI authority map and deterministic
local fixtures are implemented in
`0ccd3d65d15fecf83ece65f42e9d218b8f2b8452`; the multi-layer fixture type
correction is in `13112a2052122fe31c6fc8dd1114285a7c1c66ee`.

**Verification:** `rtk pnpm --dir packages/core test --
asset-authoring-intelligence.test.ts asset-release-provenance-schema.test.ts
asset-provider-schema.test.ts asset-provider-provenance.test.ts
asset-authoring-web-handoff.test.ts` PASS (40 tests); `rtk pnpm --dir
packages/cli test -- asset-authoring-intelligence.test.ts` PASS (5 tests);
`rtk pnpm --dir packages/core typecheck` PASS; `rtk pnpm --dir packages/cli
typecheck` PASS; `rtk git diff --check` PASS.

### 1. Implement the deterministic request and routing contracts

- [x] Add strict request normalization, bounded UTF-8 input handling, and
  canonical request digesting without persisting raw request text in public
  receipts.
- [x] Add the fixed vocabulary, catalog-first predicates, stable candidate
  ordering, explicit-hint validation, and route outcomes from the spec:
  `compose-existing`, `extend-existing`, `derive-variant`,
  `derive-recolor`, `custom-geometry`, `multi-layer`,
  `needs-user-action`, and `refused`.
- [x] Return finite choices and concrete next actions for ambiguity, stale
  catalog/contract state, unsupported capability, rights gaps, and resource
  limits.
- [x] Treat provider or Agent/model hints as untrusted optional input; validate
  them as user-visible structured input and never make them a runtime
  authority.

**TDD evidence:** pure tests cover normalization, digest stability, catalog
ordering, synonym handling, ambiguity, refusal, unsupported capability,
privacy-safe projections, and exact replay.

**Implementation record:** Core router and request contract are implemented in
`20ce883a041d34ccfa7c37e94182d8b90f233db5`.

**Verification:** `rtk pnpm --dir packages/core test --
asset-authoring-intelligence.test.ts` PASS; `rtk pnpm --dir packages/core
typecheck` PASS; `rtk git diff --check` PASS.

**Plan record:** record the implementation commit, exact test commands, and
PASS/FAIL result here after completion.

### 2. Implement deterministic candidate operation contracts

- [x] Add canonical operation records and operation digests that exclude
  timestamps, random IDs, local paths, environment values, credentials, raw
  request text, and provider payloads.
- [x] Add sorted-DAG validation for input/output identities, duplicate targets,
  cycles, traversal, unsupported operations, and fixed resource limits.
- [x] Add deterministic variant operations that retain asset identity,
  supported body/animation/layer semantics, source obligations, and credits.
- [x] Add deterministic recolor operations through existing Core palette and
  recolor authorities, including source/target ramp validation, alpha
  preservation, and explicit user palette maps.
- [x] Add an explicit versioned custom-geometry extension contract (`v2`) for
  bounded frames/cells/rows/canvas/layer data while leaving v1 unchanged.
- [x] Add bounded multi-layer candidate-set and layer-graph operations with
  independent target contracts; do not flatten or resolve cross-pack
  conflicts (D6 scope).

**TDD evidence:** Core tests prove byte/digest determinism, v1 compatibility,
variant/recolor correctness, geometry bounds, layer DAG behavior, refusal on
missing/ambiguous input, and resource-limit enforcement.

**Implementation record:** Core operation contracts, deterministic recolor
materialization, v2 geometry validation, and layer DAG validation are included
in `20ce883a041d34ccfa7c37e94182d8b90f233db5`; bounded catalog and operation
parsing, including the explicit custom-geometry contract parser, are included
in `5f9b787ac4e664002a551d1d89238d383983d97d`.

**Verification:** `rtk pnpm --dir packages/core test --
asset-authoring-intelligence.test.ts` PASS (10 tests); `rtk pnpm --dir
packages/core typecheck` PASS; `rtk git diff --check` PASS.

**Plan record:** record the implementation commit, exact test commands, and
PASS/FAIL result here after completion.

### 3. Add session-owned CLI staging and safe operation execution

- [x] Add only the smallest public route/stage command surface required by the
  reviewed contract, with stable human and JSON output.
- [x] Require the existing session scope, exact catalog/contract/input
  digests, explicit consent, and bounded operation limits before staging.
- [x] Materialize only below the current session-owned candidate staging root;
  store logical relative IDs and operation/contract/input/output digests.
- [x] Make identical replay a verified no-op and changed input/output a stale
  or conflict response; never overwrite automatically.
- [x] Ensure receipts exclude raw prompts, credentials, absolute paths,
  provider payloads, and raw candidate bytes.

**TDD evidence:** CLI tests cover consent, staging-root containment, receipt
projection, deterministic replay, stale input, contract/catalog drift,
resource limits, and refusal/recovery output using local fixtures.

**Plan record:** record the implementation commit, exact test commands, and
PASS/FAIL result here after completion.

**Implementation record:** `0ccd3d65d15fecf83ece65f42e9d218b8f2b8452` adds the
read-only route, consent-bound stage, digest-bound replay, bounded PNG
materialization, privacy projection, and explicit recovery. The fixture type
correction is recorded in `13112a2052122fe31c6fc8dd1114285a7c1c66ee`.

**Verification:** `rtk pnpm --dir packages/cli test --
asset-authoring-intelligence.test.ts` PASS (5 tests, including consent,
variant, recolor, custom geometry, multi-layer, replay, input drift, and
tampered recovery); `rtk pnpm --dir packages/cli typecheck` PASS; `rtk git
diff --check` PASS.

### 4. Integrate with candidate import, validation, preview, and human review

- [x] Keep existing `asset authoring import` as the sole candidate import
  authority; D5 staging must produce an explicit next action rather than
  importing.
- [x] Reuse existing contract-bound import checks, PNG inspection, asset
  identity checks, attribution/credit checks, validation, and attributed
  preview.
- [x] Keep preview acceptance, declaration, packing, installation, and
  publication behind their existing human/release gates.
- [x] Preserve sibling layers and untouched source assets when a candidate
  targets one layer or one explicit output identity.
- [x] Add recovery commands/actions for re-import, discard staged candidate,
  refresh exact inputs, review route, resolve layer scope, and resume only
  from a valid checkpoint.

**TDD evidence:** integration tests prove a staged candidate cannot bypass
import, validation, attribution, preview, human review, or release gates;
recovery is deterministic and stale state is surfaced.

**Plan record:** record the implementation commit, exact test commands, and
PASS/FAIL result here after completion.

**Implementation record:** `0ccd3d65d15fecf83ece65f42e9d218b8f2b8452` keeps D5
staging before the existing public import authority and adds resume/discard
recovery without touching source, validation, preview, declaration, release,
or install receipts.

**Verification:** `rtk pnpm --dir packages/cli test --
asset-authoring-intelligence.test.ts asset-authoring-import.test.ts
asset-authoring-receipts.test.ts asset-authoring-session-e2e.test.ts` PASS;
`rtk pnpm --dir packages/cli test --
asset-authoring-web-cli-handoff.test.ts d3-web-cli-fixtures.test.ts` PASS; the
focused D5 suite passed 5 tests and the existing import suite remained green.

### 5. Connect D1 provenance, D2 provider evidence, and D3 handoff boundaries

- [x] Emit D1-compatible `source-transformation` provenance for deterministic
  operations, binding source identity, operation digest, contract digest,
  output digest, and attribution references.
- [x] Preserve source credits and license obligations through variants,
  recolors, custom geometry, and multi-layer candidates; missing evidence
  refuses or requires explicit user action.
- [x] Accept D2 provider results only as optional, validated, user-visible
  hints or candidate inputs; never treat provider output as approval or as a
  source/import authority.
- [x] Keep D3 transfer receipts file-scoped, explicit, privacy-safe, and
  recoverable; do not add persistent browser authoring state.
- [x] Leave D4 distribution, signing, trust, provenance verification,
  publication, rollback, and install behavior downstream and unchanged.

**TDD evidence:** cross-boundary tests cover attribution preservation,
provider-result provenance, handoff receipt compatibility, stale transfer
recovery, and no authority escalation.

**Plan record:** record the implementation commit, exact test commands, and
PASS/FAIL result here after completion.

**Implementation record:** `0ccd3d65d15fecf83ece65f42e9d218b8f2b8452` extends
the D1 operation vocabulary for D5 transformations, binds operation/provider
evidence by digest in `referenceDigests`, and leaves D2 session receipts and
D3 handoff sidecars under their existing authorities. D5 never treats a
provider result or Web handoff as approval or import authority.

**Verification:** `rtk pnpm --dir packages/core test --
asset-release-provenance-schema.test.ts asset-provider-schema.test.ts
asset-provider-provenance.test.ts asset-authoring-web-handoff.test.ts` PASS
(39 tests); `rtk pnpm --dir packages/cli test -- asset-provider-commands.test.ts
asset-authoring-web-cli-handoff.test.ts d3-web-cli-fixtures.test.ts` PASS (40
tests); no provider, browser state, network, backend, or external service was
used.

### 6. Advertise capabilities only with complete contract coverage

- [x] Add the reserved D5 capability/schema identifiers only after their
  implementation, validation, privacy projection, and compatibility tests are
  complete.
- [x] Make unsupported older integrations return a stable response and fall
  back to the existing manual/external-author workflow.
- [x] Document route outcomes, consent, staging, explicit import, preview,
  review, refusal, recovery, and compatibility without implying automatic
  authoring or publishing.
- [x] Update the CLI help and capability output in the same implementation
  change as the public behavior.

**TDD evidence:** packed CLI tests assert the advertised contract, stable
unsupported responses, safe JSON/human output, and absence of raw/private
fields.

**Plan record:** record the implementation commit, exact test commands, and
PASS/FAIL result here after completion.

**Implementation record:** `0ccd3d65d15fecf83ece65f42e9d218b8f2b8452` adds the
four D5 capabilities, eight D5 schemas including explicit consent and v2
geometry, and the public route/stage/recover help contract.

**Verification:** `rtk pnpm --dir packages/cli test -- command-spec.test.ts
main-json.test.ts main-assets.test.ts asset-authoring-intelligence.test.ts`
PASS (270 tests); `rtk pnpm --dir packages/cli typecheck` PASS.

### 7. Run regression and packed acceptance coverage

- [x] Run focused Core, CLI, and Web TDD suites with real PNG fixtures and local
  fake/session data.
- [x] Run existing v1 archive, manifest, install, plugin, composition,
  attribution, consent, preview, release-gate, D1, D2, D3, and D4 regression
  suites.
- [x] Verify no test initializes or reads `upstream/`, writes outside the
  approved session fixture roots, or calls an external service.
- [x] Verify strict TypeScript and boundary checks; fix violations in the
  implementation rather than weakening the checker.

**Plan record:** `20ce883a041d34ccfa7c37e94182d8b90f233db5`,
`5f9b787ac4e664002a551d1d89238d383983d97d`,
`0ccd3d65d15fecf83ece65f42e9d218b8f2b8452`, and
`13112a2052122fe31c6fc8dd1114285a7c1c66ee` implement the D5 product slice.
`rtk pnpm --dir packages/core test -- asset-authoring-intelligence.test.ts
asset-release-provenance-schema.test.ts` PASS (24 tests);
`rtk pnpm --dir packages/cli test -- asset-authoring-intelligence.test.ts
asset-authoring-import.test.ts asset-authoring-receipts.test.ts
asset-authoring-session-e2e.test.ts asset-provider-commands.test.ts
asset-authoring-web-cli-handoff.test.ts d3-web-cli-fixtures.test.ts
command-spec.test.ts main-json.test.ts main-assets.test.ts` PASS (303 tests);
`rtk pnpm --dir packages/web test -- landing-page.test.tsx
landing-artifacts.test.ts` PASS (4 tests; required escalated local `tsx` IPC
socket permission). `rtk pnpm --dir packages/core typecheck` PASS;
`rtk pnpm --dir packages/cli typecheck` PASS; `rtk pnpm check:boundaries` PASS;
`rtk git diff --check` PASS. The complete repository regression is recorded in
Task 9 below.

### 8. Complete documentation impact matrix and handoff evidence

- [x] Reassess every CLI-sensitive surface and record the final matrix:
  `help`, CLI README, root README, landing, architecture, engineering,
  releasing, and plugin contract.
- [x] Update every surface marked `update`; record a precise N/A reason for
  any surface that remains out of scope.
- [x] Add examples that show route → consent → staging → explicit import →
  validation → attributed preview → human review, including refusal/recovery.
- [x] Explain that D5 uses deterministic operations and has no required model,
  provider, backend, auth, network, or persistent browser authoring state.
- [x] Ensure public docs preserve existing v1 and release compatibility notes.

**Final documentation impact matrix:**

```text
help: update — route, stage, and recover are public D5 command groups
cli-readme: update — document D5 capabilities, schemas, workflow, and boundaries
root-readme: update — document the deterministic route/stage/import workflow
landing: update — expose route/stage/recover examples and no-provider boundary
architecture: update — record Core/CLI ownership and D1–D4/D6 boundaries
engineering: update — add focused D5 verification and local-only constraints
releasing: update — add D5 capability/schema and pre-import release gates
plugin: N/A — D5 does not change the installed plugin contract or skill surface
```

**Plan record:** Documentation commit is
`e45a2855f9cbffe2585fa47cce1af292c83b9f1b`. Documentation updates are in `README.md`,
`packages/cli/README.md`, `packages/web/src/components/landing-page.tsx`,
`docs/ARCHITECTURE.md`, `docs/ENGINEERING.md`, and `docs/RELEASING.md`; the
final policy result is `rtk pnpm verify:cli-docs-policy` PASS (19 tests).

### 9. Final verification and independent PR handoff

- [x] Run the complete required repository verification from the implementation
  branch:

  ```text
  rtk pnpm verify
  rtk pnpm check:boundaries
  rtk pnpm verify:plugin
  rtk pnpm verify:cli-docs-policy
  rtk git diff --check
  ```

- [x] Run all focused D5 tests and the packed CLI acceptance command(s),
  recording each exact command and PASS/FAIL result.
- [x] Update this checked-in plan after every completed implementation step;
  record full commit hashes, not abbreviated hashes.
- [x] Use an independent D5 implementation commit/branch/PR. Do not merge
  automatically and do not begin D6 until the D5 implementation PR is merged
  and the user confirms it. The independent branch is ready; the Draft PR is
  the remaining handoff action.
- [x] Report current D5 task, completed work, commit/PR, verification,
  next step, and blockers without claiming completion before CI and merge.

**Final implementation record:**

```text
Implementation branch: codex/issue-176-d5-authoring-intelligence-implementation
Implementation PR: [#178](https://github.com/ochowei/lpc-toolkit-2026-1/pull/178)
  (Draft; CI, merge, and user confirmation pending)
Commits:
  20ce883a041d34ccfa7c37e94182d8b90f233db5
  35126c98c3fbacebc9b85e45ce453aae5fd5c3f2
  5f9b787ac4e664002a551d1d89238d383983d97d
  67bd50b6fe36ec0c5901d742d71b18c9e51a1746
  0ccd3d65d15fecf83ece65f42e9d218b8f2b8452
  13112a2052122fe31c6fc8dd1114285a7c1c66ee
  e45a2855f9cbffe2585fa47cce1af292c83b9f1b
  c4d3620de02aa26580eda6266f479458a7ae8c33
  b1a2d748e4aee28443bc301b63a172ccc5ae295e
  e85d2d4e0eb8577f8cb89c876783cab924f180de
  c56cfc6dd8c4aaeeb9bf9648cab7a04b93ce533a
Verification:
  rtk pnpm verify — PASS; Core 450, asset-pack-format 75, presets 8,
    CLI 1282 passed/1 skipped, Web 867; all workspace typechecks PASS
  rtk pnpm check:boundaries — PASS
  rtk pnpm verify:plugin — PASS (40 tests; plugin structure valid)
  rtk pnpm verify:cli-docs-policy — PASS (19 tests)
  rtk git diff --check — PASS
Handoff:
  Draft PR #178 is open and not merged; D6 is blocked until CI passes, PR #178
  is merged, and the user confirms the merge.
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
