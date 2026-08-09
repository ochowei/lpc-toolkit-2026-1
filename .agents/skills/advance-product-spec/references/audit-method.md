# Capability Audit Method

## Evidence order

Rank evidence from strongest to weakest:

1. Relevant verification passes on the audited revision and the owning implementation exists.
2. Focused automated tests and implementation exist but were not run.
3. Implementation exists without focused automated verification.
4. Architecture, README, plan, or release prose claims the behavior.
5. No evidence exists or available evidence contradicts the objective.

Documentation alone never proves implementation or shipment. File presence alone never proves an end-to-end journey. A broad passing gate supports only behavior it actually exercises.

Use this evidence order for functional implementation and delivery. For
explanation readability, direct inspection of the intended active surface
against the walkthrough below is primary evidence. Automated text or DOM tests
prove that content is present; they do not by themselves prove that a reader
can understand the journey or its control model. Passing implementation tests
do not override ambiguous or contradictory guidance.

## Product Direction coverage

Resolve objectives from `docs/PRODUCT-OBJECTIVES.md`. Use mapped required `PD-CAP-*` objectives as the denominator for the selected capability. Report objective states rather than counting spec files:

- `COVERED`: an accepted current capability spec represents the complete objective.
- `PARTIAL`: current specs represent only part of an independently divisible objective.
- `UNMAPPED`: no current spec represents it.
- `UNKNOWN`: ambiguity or missing evidence prevents a mapping decision.

Report raw counts and one-decimal calculated coverage. Do not give extra weight to a large spec or many requirements. Keep `GRD`, `DEL`, `EVO`, and `OPT` outside this percentage.

## Explanation surface walkthrough

Before scoring readability, inventory the active user- and Agent-facing
surfaces owned by the capability. Inspect the relevant guidance or landing
pages, prompt builders and calls to action, CLI help or README sections, plugin
skills and workflow references, expected-result copy, and handoff or recovery
instructions. Use historical plans only to resolve intent; do not score them as
active guidance.

Walk each supported journey through the surfaces and record:

- the intended reader and entry action;
- the visible stages, checkpoints, prompts, commands, and controls;
- what the system or Agent does, what the user decides, and where authority
  changes;
- the evidence or artifact produced at each boundary;
- the stop condition and next action; and
- the relevant failure and recovery path.

Compare the walkthrough with the current spec and across active surfaces. The
wording may differ, but the journey, authority boundaries, outputs, and control
model must remain consistent. When a surface displays multiple stages but
exposes fewer prompts, commands, or controls, require it to say whether those
stages are steps, checkpoints, or separate invocations. A multi-stage journey
started by one control must explain where same-task follow-up questions and
confirmations occur.

Report material mismatches without promoting exact UI wording or incidental
ordering into the current capability spec.

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

## Non-capability objectives

Rate guardrails and evolution as `PASS`, `PARTIAL`, `FAIL`, or `UNKNOWN`. Highlight any `FAIL` before positive capability results.

Rate delivery claims as `VERIFIED`, `PARTIAL`, `CONTRADICTED`, or `UNKNOWN`. Source configuration alone is at most `PARTIAL`; require current release or live evidence for `VERIFIED`.

## Confidence

- `HIGH`: relevant focused or end-to-end verification passed on the audited revision.
- `MEDIUM`: implementation and focused tests exist but were not run.
- `LOW`: evidence is prose-only, partial, contradictory, or absent.

Set a rollup to `HIGH` only when every applicable unit is high, `MEDIUM` when none is low, and otherwise `LOW`.

For readability, a complete recorded walkthrough across every active in-scope
surface is relevant verification. Text-presence tests alone do not raise
readability confidence above the underlying direct inspection.

## Verification budget

For a normal capability audit, run at most three focused commands selected from `docs/ENGINEERING.md`. Never run `pnpm verify`. Report exact PASS, FAIL, BLOCKED, and SKIPPED results and the confidence impact of checks not run.
