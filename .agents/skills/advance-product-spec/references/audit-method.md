# Capability Audit Method

## Evidence order

Rank evidence from strongest to weakest:

1. Relevant verification passes on the audited revision and the owning implementation exists.
2. Focused automated tests and implementation exist but were not run.
3. Implementation exists without focused automated verification.
4. Architecture, README, plan, or release prose claims the behavior.
5. No evidence exists or available evidence contradicts the objective.

Documentation alone never proves implementation or shipment. File presence alone never proves an end-to-end journey. A broad passing gate supports only behavior it actually exercises.

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

## Non-capability objectives

Rate guardrails and evolution as `PASS`, `PARTIAL`, `FAIL`, or `UNKNOWN`. Highlight any `FAIL` before positive capability results.

Rate delivery claims as `VERIFIED`, `PARTIAL`, `CONTRADICTED`, or `UNKNOWN`. Source configuration alone is at most `PARTIAL`; require current release or live evidence for `VERIFIED`.

## Confidence

- `HIGH`: relevant focused or end-to-end verification passed on the audited revision.
- `MEDIUM`: implementation and focused tests exist but were not run.
- `LOW`: evidence is prose-only, partial, contradictory, or absent.

Set a rollup to `HIGH` only when every applicable unit is high, `MEDIUM` when none is low, and otherwise `LOW`.

## Verification budget

For a normal capability audit, run at most three focused commands selected from `docs/ENGINEERING.md`. Never run `pnpm verify`. Report exact PASS, FAIL, BLOCKED, and SKIPPED results and the confidence impact of checks not run.
