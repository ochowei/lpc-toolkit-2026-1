---
name: audit-product-direction
description: Assess how fully LPC Toolkit implements and conforms to docs/PRODUCT-DIRECTION.md using repository and verification evidence, with separate analysis of explanation readability, usability, and functional completeness. Use when asked for product-direction progress, goal completion, journey coverage, alignment, readiness, delivery-claim verification, or prioritized implementation gaps. Do not use to redefine product scope or implement a known fix.
---

# Audit Product Direction

Produce a read-only, evidence-backed snapshot against the live product direction.
Analyze explanation readability, usability, and functional completeness as
three independent views. Keep guardrail compliance separate so a strong score
cannot hide an authority, attribution, lifecycle, or non-goal violation.

## Establish the audit target

1. Resolve the repository root and read `AGENTS.md`,
   `docs/PRODUCT-DIRECTION.md`, and the verification guidance in
   `docs/ENGINEERING.md`.
2. Default to the current working tree. Record the commit, branch, dirty paths,
   audit date, and whether evidence describes `HEAD` or uncommitted state.
3. Use a user-specified commit, tag, release, or comparison baseline instead
   when provided. Never mix evidence from different revisions without labeling
   it.
4. Default to a local audit. Verify live npm, hosted Web, or installed-plugin
   delivery only when current external evidence is available; otherwise mark
   the claim `UNKNOWN`, not complete.
5. Default to `snapshot` depth: build the complete objective register, inspect
   directly relevant evidence for every row, run at most three focused
   verification commands, and never run `pnpm verify`. Use `comprehensive`
   depth only when the user requests it; then follow the full relevant gate map
   in `docs/ENGINEERING.md`. Do not silently expand depth—mark additional checks
   `SKIPPED` and explain the resulting confidence limit. Choose snapshot checks
   that collectively strengthen evidence across the three report dimensions;
   explain when a material risk justifies spending multiple checks on one.

## Build the objective register

Derive the register from the current `docs/PRODUCT-DIRECTION.md`; do not copy an
old checklist from a prior audit. Paraphrase each objective and cite its source
line.

Classify every normative statement exactly once:

- `CAPABILITY`: required interface, journey, or end-to-end outcome.
- `GUARDRAIL`: attribution, human authority, local-first lifecycle,
  provider-neutrality, mutation, or responsibility boundary.
- `DELIVERY`: a current package, plugin, or hosted-channel claim.
- `EVOLUTION`: a rule for keeping direction and related documentation aligned.
- `OPTIONAL`: a permitted enhancement or future possibility; exclude it from
  required completion scoring.

Treat current non-goals as guardrails. Exclude background, examples,
definitions, and explicitly optional or future possibilities from the required
completion denominator. Score every required current-scope obligation even when
the document warns that it may not be shipped yet; do not treat a merely
permitted future possibility as an incomplete objective.

At minimum, register:

- every required cell in the interface-by-journey responsibility table;
- the requirement that Agent integrations and CLI support all three journeys
  without the hosted Web application;
- pixel-generation, local artifact, attribution, and human-authority rules;
- current delivery claims and current non-goals; and
- evolution and documentation-consistency rules.

Split objectives when one clause can succeed while another fails. Merge
duplicate wording only when it represents the same observable outcome and cite
all source lines.

## Gather evidence

Inspect the narrowest owning surfaces before running checks:

| Objective area | Primary evidence |
| --- | --- |
| Composition and attribution | `packages/core/`, `packages/presets/`, their tests, and `assets/CREDITS.csv` |
| CLI journeys and lifecycle | `packages/cli/src/`, `packages/cli/test/`, command help/specs, and `packages/cli/README.md` |
| Agent integration | `plugins/lpc-toolkit/`, plugin contract tests, and `pnpm verify:plugin` |
| Web Composer | `packages/web/src/`, Web tests/e2e, and checked-in landing artifacts |
| Boundaries and governance | `docs/ARCHITECTURE.md`, boundary/policy scripts, tests, and release configuration |
| Delivery claims | package metadata, release workflows/evidence, installed plugin metadata, and the live public endpoint when checked |

Use `rg` for discovery and prefix repository terminal commands with `rtk`.
Follow `docs/ENGINEERING.md` to select focused checks. Run broader gates only
when the requested audit depth justifies them. Do not edit files, install
dependencies, initialize `upstream/`, invoke an image provider, package,
publish, deploy, or change external state. Report every skipped, blocked, or
failed check.

Rank evidence from strongest to weakest:

1. A relevant check passes against the audited revision and the implementation
   path is present.
2. Focused automated tests and implementation are present but were not run.
3. Implementation is present without focused verification.
4. Architecture, README, plan, or release prose claims the behavior.
5. No evidence exists, or evidence contradicts the objective.

Documentation alone never proves implementation or shipment. File presence
alone never proves an end-to-end journey. A passing broad test supports only
objectives actually exercised by that test.

Treat user-facing documentation and help as direct evidence for explanation
readability, but never as proof of functional implementation or shipment.

## Analyze the three dimensions

Use every required interface-by-journey responsibility as a shared assessment
unit. Add a cross-cutting unit only when a required product-level explanation,
workflow, or capability cannot be assigned to one table cell. Score all three
dimensions for each unit. Exclude an inapplicable dimension only with a precise
reason, and keep optional units outside required rollups.

Keep the dimensions orthogonal. A capability may be functionally complete yet
poorly explained or difficult to use; do not copy one dimension's score into
another without dimension-specific evidence.

### Explanation readability

Assess whether the intended reader can understand:

- the journey's purpose, audience, prerequisites, and supported scope;
- the entry point and ordered happy-path steps;
- choices, consent, authority, attribution, and provider boundaries;
- produced artifacts and how to inspect them; and
- failure, recovery, resume, and next-step guidance.

Inspect the owned user-facing surfaces: CLI help and README, root README, Web
landing or guidance, Agent skill instructions, and relevant release or
architecture explanations. Do not penalize a surface for details owned by a
clearly linked canonical source.

| Score | Percent | Meaning |
| ---: | ---: | --- |
| 0 | 0% | Required explanation is absent or materially contradictory |
| 1 | 25% | Terms or fragments exist, but no coherent journey can be followed |
| 2 | 50% | The main path is described, but a material prerequisite, decision, output, or recovery step is unclear |
| 3 | 75% | The complete path is clear and consistent, with only non-blocking ambiguity or unverified synchronization |
| 4 | 100% | The explanation is clear, complete, cross-surface consistent, and its relevant documentation contract check passes |

### Usability

Assess whether the intended human or Agent can discover, perform, verify,
resume, and recover the journey without unsupported dependencies or hidden
state changes. Consider entry-point discoverability, number and clarity of
steps, bounded inputs, machine-readable outputs where appropriate, actionable
errors, explicit confirmations, local artifact paths, preview/verification,
and recovery behavior.

| Score | Percent | Meaning |
| ---: | ---: | --- |
| 0 | 0% | No usable path exists, or current behavior blocks the journey |
| 1 | 25% | Building blocks exist, but users must reconstruct the workflow or rely on an unsupported path |
| 2 | 50% | A path is usable only with material friction, an unclear decision, a hidden dependency, or missing recovery |
| 3 | 75% | The journey is usable end to end, with non-blocking friction or missing current usability verification |
| 4 | 100% | The journey is verified end to end with discoverable entry, bounded actions, actionable errors, evidence outputs, and resume/recovery where applicable |

### Functional completeness

Assign each `CAPABILITY` one stage. Do not interpolate between stages.

| Score | Percent | Meaning |
| ---: | ---: | --- |
| 0 | 0% | Absent or contradicted |
| 1 | 25% | Direction, design, or documentation only |
| 2 | 50% | Partial implementation; a required step or interface is missing |
| 3 | 75% | End-to-end implementation exists, but current relevant verification is missing |
| 4 | 100% | End-to-end behavior is verified on the audited revision, including attribution and authority gates where applicable |

### Dimension rollups

Compute each required dimension score independently as:

`sum(dimension scores) / (4 * number of applicable required units) * 100`

Weight required units equally unless the user supplies weights. Show every raw
numerator and denominator. Never average the three dimension scores into one
overall score. Never include `OPTIONAL`, `GUARDRAIL`, `DELIVERY`, or
`EVOLUTION` rows in a dimension percentage.

## Assess non-capability objectives

Rate `GUARDRAIL` and `EVOLUTION` rows as:

- `PASS`: current evidence shows the rule is enforced or consistently obeyed.
- `PARTIAL`: some relevant paths are protected but a material path or check is
  missing.
- `FAIL`: a concrete current violation exists.
- `UNKNOWN`: available evidence cannot decide.

Rate `DELIVERY` rows as `VERIFIED`, `PARTIAL`, `CONTRADICTED`, or `UNKNOWN`.
Require live or release evidence for `VERIFIED`; source and workflow
configuration alone are at most `PARTIAL`.

Report counts for these categories instead of blending them into the capability
percentage. Highlight any guardrail `FAIL` before celebrating a high capability
score.

Assign evidence confidence separately for each dimension:

- Explanation readability is `HIGH` when all owned surfaces were inspected and
  the relevant documentation consistency check passed; `MEDIUM` when surfaces
  were inspected but the check was not run; otherwise it is `LOW`.
- Usability is `HIGH` when a relevant end-to-end or smoke path passed;
  `MEDIUM` when the usable path and focused tests exist but were not run;
  otherwise it is `LOW`.
- Functional completeness is `HIGH` when relevant verification passed;
  `MEDIUM` when implementation and focused tests exist but were not run;
  otherwise it is `LOW`.

Set each dimension's rollup confidence to `HIGH` only when every applicable
required row is `HIGH`; set it to `MEDIUM` when no row is `LOW`; otherwise set
it to `LOW`. Keep guardrail and delivery unknowns visible rather than folding
them into any dimension label.

## Report the result

Return the report in the user's language unless requested otherwise. Do not
return scores without analysis: every dimension must state what works, the
evidence-backed gaps, their impact on the intended user, and the smallest next
evidence or improvement. Return the report in chat unless the user requests a
file. Use this order:

1. **Audit scope** — revision, working-tree state, local/full mode, and date.
2. **Three-direction dashboard** — use one row per dimension with percentage,
   raw score, confidence, and top finding; then show guardrail/evolution and
   delivery counts. Do not show a combined score.
3. **Explanation readability analysis** — per interface and journey, identify
   clear explanations, contradictions or ambiguity, reader impact, score,
   confidence, and evidence.
4. **Usability analysis** — per interface and journey, identify entry points,
   workflow friction, verification and recovery quality, user impact, score,
   confidence, and evidence.
5. **Functional completeness analysis** — list every required capability with
   ID, objective, direction source, score, confidence, strongest evidence, and
   exact missing condition.
6. **Guardrails and evolution** — status, evidence, and any violation.
7. **Delivery claims** — verification status and what was or was not checked.
8. **Prioritized gaps** — label each gap by dimension; order by guardrail
   violation, blocked required journey, usability blocker, material explanation
   ambiguity, missing verification, then delivery uncertainty.
9. **Verification log and limitations** — exact commands with PASS/FAIL/SKIPPED
   and unresolved unknowns.

Cite concrete `path:line`, test names, command results, artifacts, and public
URLs when used. Keep plans and prose as context rather than primary evidence.
For comparisons, preserve both registers and explain score changes objective by
objective; do not attribute a delta to code unless the diff supports it.

End with the smallest evidence-producing next actions. Do not implement them
unless the user separately asks for changes.
