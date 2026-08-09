# Repository Product Direction Audit Method

Use this method only for a complete repository-wide Product Direction audit.
Apply the shared capability audit method for evidence ranking, dimension
scoring, non-capability statuses, confidence, and verification reporting.

## Establish the target and depth

1. Default to the current working tree. Use a user-specified commit, tag,
   release, or baseline when provided, and never mix revision evidence without
   labeling it.
2. Default to a local `snapshot`: inspect evidence for every required objective
   and run at most three focused verification commands. Never run `pnpm verify`.
3. Use `comprehensive` depth only when the user explicitly requests it. Follow
   the full relevant gate map in `docs/ENGINEERING.md`, except the forbidden
   `pnpm verify` aggregate. Mark omitted checks `SKIPPED` with their confidence
   impact.
4. Verify npm, hosted Web, installed-plugin, or other live delivery only when
   current external evidence is available. Otherwise rate the delivery claim
   `UNKNOWN` rather than complete.

## Account for every objective

Treat `docs/PRODUCT-OBJECTIVES.md` as the stable identity and English-source
mapping register and `docs/PRODUCT-DIRECTION.md` as the semantic authority.
Run the product-spec validator as one focused check when register completeness
or current-spec mappings are material to the audit.

- Assess every required `PD-CAP-*` objective exactly once. Group related rows
  by capability, interface, and journey only for presentation.
- Score explanation readability, usability, and functional completeness
  independently for every applicable capability objective using the shared
  method. State a precise reason for any inapplicable dimension.
- Rate every `PD-GRD-*` and `PD-EVO-*` objective separately with the shared
  guardrail/evolution statuses. Treat current non-goals as guardrails.
- Rate every `PD-DEL-*` objective separately with the shared delivery statuses.
- List `PD-OPT-*` objectives outside required denominators and do not score them
  as incomplete current scope.
- If the register is absent, incomplete, invalid, or materially inconsistent
  with Product Direction, stop the scored audit and report the register blocker.
  Do not bootstrap or repair it through this read-only skill.

For a revision comparison, preserve the objective register used by each
revision. Explain changes objective by objective, and attribute a score change
to code only when the revision diff supports it.

## Gather repository evidence

Inspect the narrowest owning surfaces before running checks:

| Objective area | Primary evidence |
| --- | --- |
| Composition and attribution | `packages/core/`, `packages/presets/`, focused tests, and `assets/CREDITS.csv` |
| CLI journeys and lifecycle | `packages/cli/src/`, `packages/cli/test/`, command help/specs, and `packages/cli/README.md` |
| Agent integration | `plugins/lpc-toolkit/`, plugin contract tests, and focused plugin verification |
| Web Composer | `packages/web/src/`, Web tests/e2e, and checked-in landing artifacts |
| Boundaries and governance | `docs/ARCHITECTURE.md`, policy and boundary scripts, tests, and release configuration |
| Delivery claims | Package metadata, release workflows or evidence, installed plugin metadata, and checked live endpoints |

Use `rg` for discovery and prefix repository terminal commands with `rtk`.
Do not edit files, install dependencies, initialize `upstream/`, invoke an
image provider, package, publish, deploy, or otherwise change external state.

Inventory the owned user-facing surfaces: root and CLI READMEs, CLI help, Web
landing and guidance, Agent skill instructions, and relevant release or
architecture explanations. For every general-user surface containing advanced
or developer-only material, record the intended audience, the material, why it
is or is not necessary, the reader impact, and the appropriate developer
destination when it should move.

## Produce the repository report

Return the report in the user's language and in this order:

1. **Audit scope** — revision, branch, working-tree state, date, local or live
   evidence, and snapshot or comprehensive depth.
2. **Three-dimension dashboard** — separate readability, usability, and
   functional-completeness percentages with raw numerators and denominators,
   confidence, and top finding. Then show guardrail/evolution and delivery
   status counts. Never show a combined score.
3. **Explanation readability** — findings by interface and journey, including
   audience fit, progressive disclosure, reader impact, score, confidence, and
   concrete evidence.
4. **Usability** — entry points, workflow friction, verification, recovery,
   user impact, score, confidence, and concrete evidence by interface and
   journey.
5. **Functional completeness** — every required capability objective with ID,
   objective, Product Direction source, score, confidence, strongest evidence,
   and exact missing condition.
6. **Guardrails and evolution** — every required status with evidence and any
   violation highlighted before positive completion claims.
7. **Delivery claims** — every delivery status and what current external
   evidence was or was not checked.
8. **Optional objectives** — list them explicitly outside required rollups.
9. **Prioritized gaps** — order guardrail violations, blocked required
   journeys, usability blockers, material explanation ambiguity, missing
   verification, and delivery uncertainty.
10. **Verification log and limitations** — exact `PASS`, `FAIL`, `BLOCKED`, and
    `SKIPPED` commands or checks and unresolved unknowns.

Cite concrete `path:line`, test names, command results, artifacts, and public
URLs when used. For every dimension, explain what works, the evidence-backed
gap, its user impact, and the smallest next evidence-producing action. Do not
implement the action through this skill.
