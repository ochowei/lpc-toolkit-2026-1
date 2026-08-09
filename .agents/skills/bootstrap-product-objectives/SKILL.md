---
name: bootstrap-product-objectives
description: Create the complete standalone register of stable Product Direction objective IDs in docs/PRODUCT-OBJECTIVES.md. Use when objective IDs have not been bootstrapped from the canonical English Product Direction or legacy inline PD-* comments must be migrated into the register. Do not use to audit capability coverage, write capability specs, change Product Direction semantics, or implement product code.
---

# Bootstrap Product Objectives

Create the complete stable identity and English-source mapping register for every normative Product Direction statement while preserving Product Direction prose.

## Start safely

1. Resolve the repository root and read `AGENTS.md`, `docs/PRODUCT-DIRECTION.md`, `docs/PRODUCT-OBJECTIVES.md` when it exists, and the relevant verification guidance in `docs/ENGINEERING.md`.
2. Record the audited commit, branch, dirty paths, date, and whether evidence includes uncommitted state.
3. Never initialize OpenSpec, add a dependency, modify `upstream/`, or run `pnpm verify` through this skill.
4. Treat bootstrap as a documentation write that requires the preview-and-confirm boundary below.

## Build the register

Read [references/objective-register.md](references/objective-register.md) completely and use its register entry shape exactly.

Bootstrap every normative statement in the canonical English Product Direction. Create `docs/PRODUCT-OBJECTIVES.md` as the standalone identity and English-source mapping register. Keep both Product Direction files free of objective IDs and preserve their prose exactly.

If legacy inline `PD-*` comments exist in either Product Direction file, include their exact removal in the bootstrap preview and approval scope. Migrate their identities into the standalone register without reclassifying or renumbering them unless the user separately approves an objective correction.

Classify objectives as `CAP`, `GRD`, `DEL`, `EVO`, or `OPT`. Keep optional objectives outside required denominators. Never reuse a retired ID. Map each objective to exactly one English source locator; keep the canonical English Product Direction as the semantic source of truth. Do not add translated source locators or translated objective text.

## Enforce the write boundary

1. Inspect repository evidence and prepare the complete proposed register without modifying tracked files.
2. Show the proposed IDs, classifications, objectives, source mappings, affected paths, and semantic exclusions.
3. Ask for explicit approval to write that exact scope.
4. After approval, edit only the approved documentation with `apply_patch`.
5. Run the repository validator and the narrowest relevant documentation checks.

Do not interpret a bootstrap request as permission to write immediately. If a completed standalone register already exists and no legacy inline IDs or incomplete migration remain, stop and explain that bootstrap is complete rather than silently rebuilding or renumbering it.

## Validate and report

Run from the repository root:

```sh
rtk node .agents/scripts/validate-product-specs.mjs
```

Report the revision and working-tree scope, registered objective count and classifications, exact changed paths, semantic exclusions, validation commands with PASS/FAIL/SKIPPED, and any remaining mapping or verification gaps. The validator checks IDs, mappings, required spec structure, and local evidence paths; it does not validate semantic correctness.
