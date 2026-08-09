---
name: advance-product-spec
description: Bootstrap and maintain a standalone register of stable Product Direction objective IDs, select and audit one LPC Toolkit capability against current specs, user or Agent explanation surfaces, implementation, and tests, or backfill an evidence-backed current capability spec. Use when the user asks to choose one product-direction area, compare Product Direction with specs, audit guidance or journey readability, compare visible prompts or stages with product contracts, measure capability coverage or conformance, or create/update docs/product-specs for already implemented behavior. Do not use for a comprehensive repository-wide product-direction audit, redefining product scope, implementing product code, or planning an unimplemented feature.
---

# Advance Product Spec

Build and maintain the traceable chain `Product Direction -> current capability spec -> explanation surfaces + code/tests` one capability at a time. Keep current specs limited to intentional, supported behavior; keep proposed or unimplemented intent outside them.

## Start safely

1. Resolve the repository root and read `AGENTS.md`, `docs/PRODUCT-DIRECTION.md`, `docs/PRODUCT-OBJECTIVES.md` when it exists, and the relevant verification guidance in `docs/ENGINEERING.md`.
2. Record the audited commit, branch, dirty paths, date, and whether evidence includes uncommitted state.
3. Never initialize OpenSpec, add a dependency, modify `upstream/`, or run `pnpm verify` through this skill.
4. Treat `audit` as read-only. Treat `bootstrap` and `backfill` as documentation writes that require the preview-and-confirm boundary below.
5. Use `$audit-product-direction` instead when the user requests a comprehensive repository-wide snapshot.

## Choose a mode

Infer an explicitly named mode. Otherwise ask the user to choose one mode, one question at a time.

- `bootstrap` — create the complete standalone stable objective-ID register. Run once before audit or backfill.
- `audit [capability]` — assess one capability without changing files.
- `backfill <capability>` — create or update one evidence-backed current spec without changing product code.

If a capability is supplied, use it directly. Otherwise scan `docs/PRODUCT-OBJECTIVES.md` and `docs/product-specs/*.md`, then offer capability candidates grouped as uncovered, partial, or covered. Recommend a required capability with low coverage and sufficient implementation evidence, but let the user choose.

Select a capability domain rather than one isolated objective. Include its related interfaces and cross-cutting guardrails in the same assessment. Narrow an oversized capability only when the slice can be verified independently and will still update the same capability spec.

## Enforce the write boundary

For `bootstrap` or `backfill`:

1. Inspect repository evidence and prepare the complete proposed objective register or spec draft without modifying tracked files.
2. Show the proposed IDs or requirements, mappings, evidence, verification gaps, affected paths, and semantic exclusions.
3. Ask for explicit approval to write that exact scope.
4. After approval, edit only the approved documentation with `apply_patch`.
5. Run the bundled validator and the narrowest relevant documentation checks.

Do not interpret a request such as `backfill sprite composition` as permission to write immediately. It selects the capability and skips candidate selection; it does not skip review.

## Bootstrap objective IDs

Read [references/objective-register.md](references/objective-register.md) completely before bootstrapping and use its register entry shape exactly.

Bootstrap every normative statement in the canonical English Product Direction, not only the first selected capability. Create `docs/PRODUCT-OBJECTIVES.md` as the standalone identity and English-source mapping register. Keep both Product Direction files free of objective IDs and preserve their prose exactly.

If legacy inline `PD-*` comments exist in either Product Direction file, include their exact removal in the bootstrap preview and approval scope. Migrate their identities into the standalone register without reclassifying or renumbering them unless the user separately approves an objective correction.

Bootstrap must classify objectives as `CAP`, `GRD`, `DEL`, `EVO`, or `OPT`. Optional objectives remain outside required denominators. Never reuse a retired ID. The register maps each objective to exactly one English source locator; the canonical English Product Direction remains the semantic source of truth. Do not add translated source locators or translated objective text to the register.

## Audit one capability

Read [references/audit-method.md](references/audit-method.md) completely before auditing.

Require a completed standalone objective register. Compare the selected capability in three directions:

1. `Product Direction -> current specs`: which required objectives map to an accepted capability spec, and which are unmapped or only partly represented?
2. `Current specs -> explanation surfaces`: which active user or Agent guidance surfaces explain the supported journey, controls, authority transitions, outputs, and next action without a material mismatch?
3. `Current specs -> code/tests`: which requirements are absent, partial, implemented but not currently verified, or verified end to end?

Inventory the in-scope explanation surfaces before scoring them. Assess explanation readability, usability, and functional completeness independently. Keep guardrails/evolution and delivery claims outside the capability percentage. A mapping proves scope traceability, not implementation, and a text-presence test does not prove reader comprehension.

Run at most three focused verification commands for a normal capability audit. Prefer implementation plus a focused passing check over prose. Report skipped or blocked evidence as confidence limits.

## Backfill one current spec

Read [references/spec-authoring.md](references/spec-authoring.md) completely and use [assets/current-spec-template.md](assets/current-spec-template.md) as the output template.

Require a completed standalone objective register. Write current specs under `docs/product-specs/<capability>.md`, one file per capability. A backfill may document only behavior that is:

- externally observable by a user or Agent;
- intentional and worth a compatibility promise;
- currently implemented; and
- supported by implementation evidence.

Do not promote incidental ordering, exact wording, internal file layout, known bugs, or historical design into a contract. Put uncertain candidates in the review preview, not the current spec. Record direct verification when it exists; otherwise mark a concise `verification gap`.

Map Product Direction at the capability-file level. Requirements inherit those mappings. Add a requirement-level mapping only for a cross-domain or exceptional guardrail.

Backfill never changes product code, tests, Product Direction scope, architecture, release state, or external systems. If evidence reveals a product or test gap, report it separately for a future explicitly requested change.

## Validate structure

After an approved bootstrap or backfill, run from the repository root:

```sh
rtk node .agents/skills/advance-product-spec/scripts/validate-product-specs.mjs
```

The validator checks IDs, mappings, required spec structure, and local evidence paths. It does not validate semantic correctness or award completion scores.

## Report results

For either audit or backfill, report:

1. revision and working-tree scope;
2. selected capability and mapped `PD-*` objectives;
3. Product Direction coverage with raw numerator/denominator;
4. explanation surfaces inspected and exact reader-journey or control-model mismatches;
5. explanation readability, usability, and functional completeness separately;
6. spec-to-code conformance with raw score, state distribution, and confidence;
7. guardrail/evolution statuses and delivery statuses;
8. strongest evidence and exact verification gaps;
9. validation or verification commands with PASS/FAIL/SKIPPED;
10. the smallest next evidence-producing action.

Use fixed stages for individual capability requirements and allow one decimal place only for calculated rollups. Never emit a combined overall score.
