---
name: audit-product-capability
description: Audit LPC Toolkit at one-capability or repository-wide scope against Product Direction, accepted specs, visible guidance, executable Agent mechanisms, implementation, and tests. Use for coverage, conformance, readability, usability, functional completeness, Agent Integration launcher-versus-Skill gaps, readiness, delivery claims, or a prioritized gap report. Produce a plain-language Markdown or standalone HTML report while keeping product and source files read-only. Do not use for spec authoring, product changes, or unimplemented feature planning.
---

# Audit Product Capability and Direction

Assess either one capability or the complete repository through the traceable
chain `Product Direction -> current capability specs -> visible entry -> real
executor -> public contract -> code/tests`. Lead with the user-visible truth,
then preserve the detailed evidence in a report artifact.

## Start safely

1. Resolve the repository root and read `AGENTS.md`, `docs/PRODUCT-DIRECTION.md`, `docs/PRODUCT-OBJECTIVES.md`, and the relevant verification guidance in `docs/ENGINEERING.md`.
2. Record the audited commit, branch, dirty paths, date, and whether evidence includes uncommitted state.
3. Require a completed standalone objective register.
4. Never initialize OpenSpec, add a dependency, modify `upstream/`, change product or source files, or run `pnpm verify` through this skill. The only permitted write is the requested audit report artifact.

## Choose the audit scope

- Use `capability` scope when the user names one capability or asks for a focused
  trace, coverage, conformance, readability, usability, or completeness audit.
- Use `repository` scope when the user asks for the complete repository, all
  Product Direction objectives or journeys, overall progress, alignment,
  readiness, delivery claims, or a prioritized product-wide gap snapshot.
- Default an ambiguous request to `capability` scope. Select a capability with
  the user as described below rather than silently expanding to the repository.

For either scope, read [references/audit-method.md](references/audit-method.md)
and [the shared surface-to-execution method](../../references/product-specs/surface-to-execution.md)
completely before auditing. Read [references/report-format.md](references/report-format.md)
before producing the result. When Agent Integration is in scope, also read
[references/agent-integration-audit.md](references/agent-integration-audit.md)
completely and apply its mandatory executor-discovery gate. For `repository`
scope, also read
[references/repository-audit-method.md](references/repository-audit-method.md)
completely and follow its target, coverage, evidence, and report requirements.

## Select one capability (`capability` scope)

Use a supplied capability directly. Otherwise scan `docs/PRODUCT-OBJECTIVES.md` and `docs/product-specs/*.md`, then offer candidates grouped as uncovered, partial, or covered. Recommend a required capability with low coverage and sufficient implementation evidence, but let the user choose.

Select a capability domain rather than one isolated objective. Include its related interfaces and cross-cutting guardrails. Narrow an oversized capability only when the slice can be verified independently and will still map to the same capability spec.

## Audit the capability (`capability` scope)

Compare the capability in three directions:

1. `Product Direction -> current specs`: determine which required objectives map to an accepted capability spec and which are unmapped or partial.
2. `Current specs -> explanation and execution surfaces`: determine whether active guidance and entry controls explain the supported journey and map to an available executable integration mechanism without a material responsibility, authority, output, or next-action mismatch.
3. `Current specs -> code/tests`: determine which requirements are absent, partial, implemented but not currently verified, or verified end to end.

Inventory explanation, launcher, and executable capability surfaces before scoring. Trace every intended entry through the Agent mechanism to the public product contract and observable evidence. Assess explanation readability, usability, and functional completeness independently. Keep guardrail/evolution and delivery claims outside the capability percentage.

For any Agent-facing journey, do not stop at prompt copy, setup prose, or a
manifest. Identify the executable Skill, MCP tool, or equivalent mechanism and
prove that the intended entry explains or reaches it. Treat a Prompt Builder as
a launcher only. If an executor exists but the active surface presents the
launcher as the integration, report a material presentation mismatch even when
implementation tests pass.

Run at most three focused verification commands for a normal audit. Prefer implementation plus a focused passing check over prose. Report skipped or blocked evidence as confidence limits.

## Audit the repository

Follow the repository audit method and assess every required objective in the
standalone register. Group findings by capability, interface, and journey for
readability, but do not sample objectives or hide unassessed rows inside a
rollup. Keep capability dimensions, guardrails and evolution, and delivery
claims separate.

## Report results

For `capability` scope, preserve this evidence in the report artifact:

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

Use fixed stages for individual capability requirements and allow one decimal place only for calculated rollups. Never emit a combined overall score. Put the plain-language verdict and user impact before scores, IDs, paths, or command logs. Keep the main findings to the material gaps; move exhaustive objective and requirement accounting to the appendix.

For `repository` scope, use the report order and complete objective accounting
defined by the repository audit method. Never emit a combined overall score.

Create a Markdown report by default, or a standalone HTML report when the user
requests HTML. Use the user's path when supplied; otherwise write below the
ignored `.audit-output/product-audits/` directory. After writing it, return a
short chat handoff in the user's language with the verdict, at most three key
findings, the smallest next action, and a clickable report link. Do not repeat
the report body in chat.
