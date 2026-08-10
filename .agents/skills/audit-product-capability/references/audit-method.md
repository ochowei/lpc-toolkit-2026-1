# Capability Audit Method

## Contents

- [Evidence order](#evidence-order)
- [Start from the real user question](#start-from-the-real-user-question)
- [Stop when the evidence is sufficient](#stop-when-the-evidence-is-sufficient)
- [Product Direction coverage](#product-direction-coverage)
- [Three independent dimensions](#three-independent-dimensions)
- [Non-capability objectives](#non-capability-objectives)
- [Confidence](#confidence)
- [Verification budget](#verification-budget)

## Evidence order

Rank evidence from strongest to weakest:

1. Relevant verification passes on the audited revision and the owning implementation exists.
2. Focused automated tests and implementation exist but were not run.
3. Implementation exists without focused automated verification.
4. Architecture, README, plan, or release prose claims the behavior.
5. No evidence exists or available evidence contradicts the objective.

Documentation alone never proves implementation or shipment. File presence alone never proves an end-to-end journey. A broad passing gate supports only behavior it actually exercises.

Use this evidence order for functional implementation and delivery. For explanation readability, direct inspection of the intended active surface against the shared surface-to-execution method is primary evidence. Automated text or DOM tests prove that content is present; they do not by themselves prove that a reader can understand the journey or its control model. Passing implementation tests do not override ambiguous or contradictory guidance.

For a cross-surface launcher, rank handoff evidence separately:

1. A transport-level deterministic binding verified at the destination.
2. The exact emitted artifact contains the platform's direct executor selector.
3. Destination-local guidance identifies and invokes the executor.
4. Origin-only adjacent guidance names the executor.
5. Implicit-invocation or discovery metadata may match the request.

The fourth and fifth levels can explain intent or fallback routing, but they do
not prove that a product-owned launcher reaches a named executor after the
artifact leaves its origin.

## Start from the real user question

Before collecting broad evidence, write one sentence for each of these:

- what the user is trying to accomplish;
- where the product tells them to start;
- where each copied, opened, exported, or forwarded handoff lands;
- exactly what context travels and what origin context disappears;
- which mechanism actually performs the work;
- which emitted bytes, fields, selector, or transport metadata bind that
  mechanism;
- what the user must decide; and
- what observable result proves completion.

Use these sentences as the expected journey. Test the visible surfaces against
that journey before scoring implementation. This prevents a large body of
passing code evidence from hiding a broken explanation or handoff.

For every material finding, state only:

1. **What the user sees** — the current visible behavior or wording.
2. **What actually happens** — the real executor, contract, or missing step.
3. **Why it matters** — the concrete confusion, blocked action, or false claim.
4. **Evidence** — the smallest set of paths, tests, or command results that proves it.
5. **Next proof** — the smallest test or inspection that would prove the gap is closed.

Do not report a finding when it has no user, Agent, governance, or delivery
impact. Do not repeat the same cause as separate findings for each affected
objective; list those objective IDs together in the evidence appendix.

## Stop when the evidence is sufficient

For a capability audit, support a material surface mismatch with the smallest
complete evidence set: one intended visible entry, the real executor or missing
executor, the owning public contract, and one focused test or verification
result when available. When the entry crosses surfaces, also capture the exact
emitted artifact and its destination context. Stop collecting same-boundary
examples once this set proves the finding. Gather another path only when it
could change the finding, score, or confidence.

Do not read unrelated implementation areas to make the report look complete.
Do not spend a verification command on evidence that cannot change a score or
resolve an `UNKNOWN`.

## Product Direction coverage

Resolve objectives from `docs/PRODUCT-OBJECTIVES.md`. Use mapped required `PD-CAP-*` objectives as the denominator for the selected capability. Report objective states rather than counting spec files:

- `COVERED`: an accepted current capability spec represents the complete objective.
- `PARTIAL`: current specs represent only part of an independently divisible objective.
- `UNMAPPED`: no current spec represents it.
- `UNKNOWN`: ambiguity or missing evidence prevents a mapping decision.

Report raw counts and one-decimal calculated coverage. Do not give extra weight to a large spec or many requirements. Keep `GRD`, `DEL`, `EVO`, and `OPT` outside this percentage.

## Three independent dimensions

Score each applicable required capability unit independently.

### Explanation readability

Assess whether the intended reader can understand the purpose, prerequisites, supported scope, ordered path, choices and authority, outputs, failures, recovery, and next action. Check progressive disclosure and cross-surface consistency.

Use the following readability interpretation of the `0..4` scale:

| Score | Meaning |
| ---: | --- |
| 0 | No active explanation exists, or it contradicts the supported journey. |
| 1 | Fragments exist, but the reader cannot reconstruct the journey. |
| 2 | A material ambiguity remains in the ordered path, control model, authority, output, or recovery. |
| 3 | The journey is understandable with only a non-blocking clarity gap, or direct current surface verification is incomplete. |
| 4 | Every in-scope active surface passes the recorded walkthrough without a material mismatch. |

A content-presence test alone cannot award a readability score of `4`.

### Usability

Assess whether the intended human or Agent can discover, perform, verify, resume, and recover the journey without unsupported dependencies or hidden state changes.

### Functional completeness

Use fixed stages; do not interpolate within one unit:

| Score | Percent | Meaning |
| ---: | ---: | --- |
| 0 | 0% | Absent or contradicted |
| 1 | 25% | Direction, design, or documentation only |
| 2 | 50% | Partial implementation; a required step or interface is missing |
| 3 | 75% | End-to-end implementation exists, but current relevant verification is missing |
| 4 | 100% | End-to-end behavior is verified on the audited revision |

Use the same `0..4` scale for readability and usability with dimension-specific evidence: absent, fragments, material gap, complete with non-blocking gap or missing current verification, and verified complete.

Calculate each rollup independently:

```text
sum(scores) / (4 * applicable units) * 100
```

Show the raw numerator and denominator, state distribution, one decimal place, and confidence. Never average the dimensions into one score.

Scores summarize evidence; they are not the headline. Explain the material
gap in ordinary language before showing its score. Avoid restating every score
in prose when a compact table already contains it.

## Non-capability objectives

Rate guardrails and evolution as `PASS`, `PARTIAL`, `FAIL`, or `UNKNOWN`. Highlight any `FAIL` before positive capability results.

Rate delivery claims as `VERIFIED`, `PARTIAL`, `CONTRADICTED`, or `UNKNOWN`. Source configuration alone is at most `PARTIAL`; require current release or live evidence for `VERIFIED`.

## Confidence

- `HIGH`: relevant focused or end-to-end verification passed on the audited revision.
- `MEDIUM`: implementation and focused tests exist but were not run.
- `LOW`: evidence is prose-only, partial, contradictory, or absent.

Set a rollup to `HIGH` only when every applicable unit is high, `MEDIUM` when none is low, and otherwise `LOW`.

For readability, a complete recorded walkthrough across every active in-scope surface is relevant verification. Text-presence tests alone do not raise readability confidence above the underlying direct inspection.

## Verification budget

For a normal capability audit, run at most three focused commands selected from `docs/ENGINEERING.md`. Never run `pnpm verify`. Report exact PASS, FAIL, BLOCKED, and SKIPPED results and the confidence impact of checks not run.
