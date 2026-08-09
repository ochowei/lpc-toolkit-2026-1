---
name: audit-product-capability
description: Audit one LPC Toolkit capability against Product Direction objectives, accepted current specs, explanation and execution surfaces, implementation, and tests. Use when the user asks for capability-level coverage, conformance, journey readability, usability, functional completeness, or a trace from a visible entry point to its executable Agent mechanism and public contract. Keep the audit read-only. Do not use for a comprehensive repository-wide product-direction snapshot, spec authoring, product changes, or unimplemented feature planning.
---

# Audit Product Capability

Assess one capability through the traceable chain `Product Direction -> current capability spec -> explanation and execution surfaces + code/tests` without changing files.

## Start safely

1. Resolve the repository root and read `AGENTS.md`, `docs/PRODUCT-DIRECTION.md`, `docs/PRODUCT-OBJECTIVES.md`, and the relevant verification guidance in `docs/ENGINEERING.md`.
2. Record the audited commit, branch, dirty paths, date, and whether evidence includes uncommitted state.
3. Require a completed standalone objective register.
4. Never initialize OpenSpec, add a dependency, modify `upstream/`, change files, or run `pnpm verify` through this skill.
5. Use `$audit-product-direction` instead for a comprehensive repository-wide snapshot.

## Select one capability

Use a supplied capability directly. Otherwise scan `docs/PRODUCT-OBJECTIVES.md` and `docs/product-specs/*.md`, then offer candidates grouped as uncovered, partial, or covered. Recommend a required capability with low coverage and sufficient implementation evidence, but let the user choose.

Select a capability domain rather than one isolated objective. Include its related interfaces and cross-cutting guardrails. Narrow an oversized capability only when the slice can be verified independently and will still map to the same capability spec.

## Audit the capability

Read [references/audit-method.md](references/audit-method.md) and [the shared surface-to-execution method](../../references/product-specs/surface-to-execution.md) completely before auditing.

Compare the capability in three directions:

1. `Product Direction -> current specs`: determine which required objectives map to an accepted capability spec and which are unmapped or partial.
2. `Current specs -> explanation and execution surfaces`: determine whether active guidance and entry controls explain the supported journey and map to an available executable integration mechanism without a material responsibility, authority, output, or next-action mismatch.
3. `Current specs -> code/tests`: determine which requirements are absent, partial, implemented but not currently verified, or verified end to end.

Inventory explanation, launcher, and executable capability surfaces before scoring. Trace every intended entry through the Agent mechanism to the public product contract and observable evidence. Assess explanation readability, usability, and functional completeness independently. Keep guardrail/evolution and delivery claims outside the capability percentage.

Run at most three focused verification commands for a normal audit. Prefer implementation plus a focused passing check over prose. Report skipped or blocked evidence as confidence limits.

## Report results

Report:

1. revision and working-tree scope;
2. selected capability and mapped `PD-*` objectives;
3. Product Direction coverage with raw numerator/denominator;
4. explanation, launcher, and executable surfaces inspected, their surface-to-execution mappings, and exact reader-journey, responsibility, or control-model mismatches;
5. explanation readability, usability, and functional completeness separately;
6. spec-to-code conformance with raw score, state distribution, and confidence;
7. guardrail/evolution statuses and delivery statuses;
8. strongest evidence and exact verification gaps;
9. verification commands with PASS/FAIL/SKIPPED; and
10. the smallest next evidence-producing action.

Use fixed stages for individual capability requirements and allow one decimal place only for calculated rollups. Never emit a combined overall score.
