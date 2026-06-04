# Catalog/Copied Asset Mismatch Cleanup Implementation Plan

**Goal:** Resolve the three documented catalog/copied asset mismatches and
remove the strict audit allowlist without changing upstream or default recolor
selection.

**Architecture:** Strengthen the web audit so skipped catalog layers are
reported, then fix local `assets/sheet_definitions` and copied
`assets/spritesheets` data. Keep core resolver behavior generic.

## Tasks

- [x] Read prior strict-audit spec/plan, focused audit, core compose resolver,
  copy script, and local asset definitions.
- [x] Remove the strict unresolved allowlist and add a targeted cleanup
  regression for the three documented itemIds.
  - Verify: focused audit fails with the three target gaps.
- [x] Classify root causes.
  - Pigface bascinet: catalog declares variant files but local copied layout is
    flat metal recolor spritesheets; helmet/bascinet copied directories are
    missing.
  - Two engrailed shield trim: bg layer points at the old tree whose filenames
    do not match the trim variant; normalized trim tree exists.
- [x] Apply the smallest local asset/catalog cleanup.
  - Pigface: align sheet definitions to flat metal recolor layout and restore
    local copied helmet/bascinet directories.
  - Shield trim: point bg/fg layers at the normalized
    `shield/two_engrailed_trim` tree.
- [x] Run focused verification.
  - Verify: `pnpm --filter @lpc-toolkit/web test -- random-outfit-variant-audit.test.ts`
- [x] Run broader verification.
  - Verify: `pnpm --filter @lpc-toolkit/web test`
  - Verify: `pnpm -r typecheck`
  - Verify: `pnpm -r test` if practical.
- [x] Commit and push to `origin feature/random-variant-audit`.

## Guardrails

- Do not modify `upstream/`.
- Do not add dependencies.
- Do not change default recolor selection.
- Do not introduce `any`.
- If `tsx` fails with sandbox `listen EPERM`, rerun the same pnpm command with
  escalated permissions.
