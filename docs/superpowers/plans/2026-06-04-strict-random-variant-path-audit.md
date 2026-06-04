# Strict Random Variant Path Audit Implementation Plan

**Goal:** Make the random-covered variant path audit strict per representative
layer and resolve catalog/path mismatches without touching default recolor
selection.

**Architecture:** Add the strict audit beside the existing random variant audit.
Use the failing output to classify path gaps. Prefer improving representative
path resolution in core when an existing sprite path can be selected from the
current catalog data. Use a documented allowlist only for unresolved copied
asset gaps.

## File Structure

- Modify `packages/web/test/random-outfit-variant-audit.test.ts`
  - Add strict per-layer audit coverage.
  - Keep the previous "at least one representative path" regression test.

- Modify `packages/core/src/compose.ts`
  - If needed, adjust representative path resolution used by
    `getSpritePathsForSelections()` while preserving compose behavior.

- Possibly modify docs follow-up/spec files
  - Record any justified unresolved allowlist entries.

## Tasks

- [x] Read follow-up context, existing audit, resolver, selection, and random
  outfit code.
- [x] Write this design spec and implementation plan.
- [ ] Add a failing strict audit that reproduces the missing representative
  layer paths.
  - Verify: `pnpm --filter @lpc-toolkit/web test -- random-outfit-variant-audit.test.ts`
    fails with the expected missing paths.
- [ ] Classify failures by root cause.
  - Verify: failure notes map each missing path to a fix level.
- [ ] Implement the smallest resolver/catalog fix.
  - Verify: focused strict audit passes.
- [ ] Run broader verification.
  - Verify: `pnpm --filter @lpc-toolkit/web test`
  - Verify: `pnpm -r typecheck`
  - Verify: `pnpm -r test` if practical.
- [ ] Commit changes with clear messages.

## Guardrails

- Do not modify `upstream/`.
- Do not add dependencies.
- Do not introduce default recolor selection in this phase.
- Do not use `any`.
- If a `tsx` command fails in the sandbox with `listen EPERM`, rerun the same
  command with escalated permissions.
