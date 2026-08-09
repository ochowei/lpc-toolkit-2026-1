---
name: backfill-product-spec
description: Create or update one evidence-backed current capability spec under docs/product-specs for intentional, externally observable, implemented LPC Toolkit behavior. Use when the user asks to backfill, document, or align the current contract of one implemented capability, including its Product Direction mappings and evidence pointers. Do not use for proposed or unimplemented features, Product Direction changes, product code or test changes, or repository-wide audits.
---

# Backfill Product Spec

Document one currently supported capability through the traceable chain `Product Direction -> current capability spec -> explanation and execution surfaces + code/tests` without changing product behavior.

## Start safely

1. Resolve the repository root and read `AGENTS.md`, `docs/PRODUCT-DIRECTION.md`, `docs/PRODUCT-OBJECTIVES.md`, and the relevant verification guidance in `docs/ENGINEERING.md`.
2. Record the audited commit, branch, dirty paths, date, and whether evidence includes uncommitted state.
3. Require a completed standalone objective register.
4. Never initialize OpenSpec, add a dependency, modify `upstream/`, change product code or tests, or run `pnpm verify` through this skill.
5. Treat backfill as a documentation write that requires the preview-and-confirm boundary below.

## Select one capability

Use a supplied capability directly. Otherwise scan `docs/PRODUCT-OBJECTIVES.md` and `docs/product-specs/*.md`, then offer candidates grouped as uncovered, partial, or covered. Recommend a required capability with low coverage and sufficient implementation evidence, but let the user choose.

Select a capability domain rather than one isolated objective. Include its related interfaces and cross-cutting guardrails. Narrow an oversized capability only when the slice can be verified independently and will still update the same capability spec.

## Draft the current spec

Read [references/spec-authoring.md](references/spec-authoring.md), [the shared surface-to-execution method](../../references/product-specs/surface-to-execution.md), and [assets/current-spec-template.md](assets/current-spec-template.md) completely before drafting.

Write one file under `docs/product-specs/<capability>.md`. Document only behavior that is externally observable by a user or Agent, intentional and worth a compatibility promise, currently implemented, and supported by implementation evidence.

Before drafting an Agent-facing requirement, inventory its active explanation, launcher, and executable capability surfaces. Backfill the journey only when its intended entry maps to a current executable mechanism and public product contract. Report an unclear or missing mapping as a usability or verification gap; do not turn a prompt-only surface into a capability promise.

Do not promote incidental ordering, exact wording, internal file layout, known bugs, or historical design into a contract. Put uncertain candidates in the review preview. Record direct verification when it exists; otherwise mark a concise `verification gap`.

Map Product Direction at the capability-file level. Let requirements inherit those mappings. Add a requirement-level mapping only for a cross-domain or exceptional guardrail.

For preview and reporting, classify Product Direction objectives as `COVERED`, `PARTIAL`, `UNMAPPED`, or `UNKNOWN`. Score each applicable requirement with fixed functional stages only: `0` absent or contradicted, `1` documentation only, `2` partial implementation, `3` end-to-end implementation without current verification, and `4` verified end to end. Calculate readability, usability, and functional completeness independently; never average them into one score.

## Enforce the write boundary

1. Inspect repository evidence and prepare the complete spec draft without modifying tracked files.
2. Show the target path, objectives, proposed requirements and scenarios, surface-to-execution mappings, evidence, verification gaps, expected coverage and conformance, affected paths, and semantic exclusions.
3. Ask for explicit approval to write that exact scope.
4. After approval, edit only the approved capability spec with `apply_patch`.
5. Run the repository validator and the narrowest relevant documentation checks.

Do not interpret `backfill <capability>` as permission to write immediately. It selects the capability and skips candidate selection; it does not skip review.

## Validate and report

Run from the repository root:

```sh
rtk node .agents/scripts/validate-product-specs.mjs
```

Report the revision and working-tree scope; capability and mapped objectives; Product Direction coverage; inspected surfaces and their execution mappings; readability, usability, and functional completeness separately; spec-to-code conformance and confidence; guardrail/evolution and delivery statuses; strongest evidence and exact gaps; validation commands with PASS/FAIL/SKIPPED; and the smallest next evidence-producing action. Use fixed requirement stages, one decimal place only for rollups, and no combined overall score.

The validator checks IDs, mappings, required spec structure, and local evidence paths. It does not validate semantic correctness or award completion scores.
