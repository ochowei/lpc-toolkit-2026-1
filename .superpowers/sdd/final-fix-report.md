# CLI Character Authoring Final Review Fix Report

## Status

All three Important and three Minor final-review findings were fixed together.
Direct render and direct preset materialize/render behavior remain compatible;
the new strict preset and productive-output rules apply only to character
commands. No dependency, `any`, core environment dependency, attribution
bypass, or `upstream/` change was introduced.

Implementation commit:
`98d81c02ac78667b2a36e5fd36f86400fe00db52`
(`fix(cli): close character authoring review findings`).

## Root Causes and Fixes

1. Character preset creation reused the shared preset rule that prefers a
   preset-declared body type and discarded `skipped` items. Character creation
   now explicitly overrides the preset body type and rejects any skipped preset
   item with `preset_body_type_incompatible` before `writeCharacter`.
2. The CLI composition callback rethrew ZIP `AssetStoreError` values even in
   partial mode. It now preserves that typed error only in strict mode and lets
   core record `missingPaths` in partial mode. Render metadata includes those
   paths in `skippedLayers` as well as warnings.
3. Character render had no preview-equivalent productive composition check.
   Character render now opts into a pre-staging check for layers, credit
   entries, and resolved paths and returns stable `incomplete_character`
   errors. Direct render does not opt in.
4. Human `character show` formatted only the selection. It now prints the
   resolved path, valid/invalid status, selection, and invalid-selection issues.
5. Character-set help used invalid shorthand identifiers. It now uses the
   installed-smoke values `hair_braid` and `lpcr.brown`.
6. Command option metadata described but did not enforce closed domains. It now
   supports optional `allowedValues`; direct and character `--bundle` reject
   values other than `zip` before runtime asset preparation.

## TDD Evidence

### RED

Command:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- character-commands.test.ts render.test.ts main-render-errors.test.ts main-human.test.ts command-spec.test.ts main-assets.test.ts preset-commands.test.ts
```

Result: expected FAIL, 13 failed and 100 passed across the focused files.

- Preset/body: partial explicit-female creation succeeded and wrote; the fully
  incompatible case returned `unknown_type_name` rather than the required
  preset/body error.
- Partial image loads: the ZIP case threw `asset_image_missing`; directory/ZIP
  metadata did not satisfy the remaining-output/skipped-layer attribution
  assertions.
- Empty character: human and JSON returned generic
  `character_command_failed` from empty-license computation.
- Human show: path and status were absent for valid and invalid selections.
- Help: the invalid `hair/braid` / `brown` example remained.
- Allowed values: `--bundle tar` returned no option issue and prepared assets
  for both direct and character render.

The preset package test was then retained as the direct-behavior compatibility
gate; no shared preset semantic change was made.

### GREEN

- Focused CLI command above: PASS, 7 files and 113 tests.
- `rtk pnpm --filter @lpc-toolkit/presets test -- presets.test.ts`: PASS,
  1 file and 3 tests.

The directory and ZIP partial regressions both produce the remaining sheet,
credit TXT, `missing_sprite_path` warning, missing-path `skippedLayers`, and
remaining resolved attribution. Existing strict direct, preset, and character
missing-ZIP tests continue to return typed `asset_image_missing`.

## Final Verification

- Focused CLI regression matrix: PASS, 113 tests.
- Presets focused suite: PASS, 3 tests.
- `rtk pnpm --dir packages/cli run typecheck`: PASS, no diagnostics.
- `rtk pnpm --dir packages/presets run typecheck`: PASS, no diagnostics.
- `rtk pnpm --filter @lpc-toolkit/cli test`: PASS, 30 files,
  290 passed and 1 platform-specific skip. The sandboxed attempt failed only
  13 localhost-binding tests with `listen EPERM`; the approved rerun passed.
- `rtk pnpm --filter @lpc-toolkit/core test`: PASS, 14 files and 167 tests.
- `rtk pnpm --filter @lpc-toolkit/web test -- color-options.test.ts`: PASS,
  1 file and 8 tests. The sandboxed pretest failed only because tsx could not
  bind its IPC socket; the approved rerun passed.
- `rtk pnpm check:boundaries`: PASS, architecture boundary check passed.
- `rtk pnpm --filter @lpc-toolkit/cli test:package`: PASS and printed
  `Packed CLI install smoke test passed.` The sandboxed attempt failed only
  npm DNS resolution; the approved network rerun installed 16 packages and
  passed the installed workflow.
- `rtk git diff --check`: PASS.

## Scope and Concerns

The pre-existing untracked `docs/README-ARCHITECTURE-AUDIT.tmp.md` remains
untouched. No blocking concern remains. Core composition still logs its
existing optional-missing-spritesheet diagnostic to stderr during the two new
partial render tests; both tests and all required output assertions pass.

## Second Final Re-review Follow-up

Implementation commit:
`31fc1820fc10bea70a01b4c700c68202da4e5ced`
(`fix(core): attribute only composed sprite layers`).

### Root Causes and Changes

- Core collected `missingPaths` during image loading but rebuilt
  `ComposedSheet.layers` and `credits` from every requested selection. It now
  records one representative `LayerSpec` per catalog layer only after an image
  is successfully drawn. `getCredits` accepts that environment-agnostic layer
  set, so missing pixels no longer contribute artists, paths, licenses, or the
  effective license.
- Character productiveness is therefore evaluated against successfully drawn,
  attributed layers. An all-missing `character render --allow-partial` returns
  `incomplete_character` in human and JSON modes before staging. Direct partial
  render remains compatible and publishes its blank sheet with empty credit
  sidecars and `effectiveLicense: null`.
- Character create now retains raw `--body-type` presence separately. Omitted
  body type preserves the preset default; only an explicit flag enables the
  preset body-type override.

### RED Evidence

- `rtk pnpm --filter @lpc-toolkit/core test -- compose.test.ts credits.test.ts`
  - Expected FAIL: 2 failed and 48 passed. Missing layers remained in
    `ComposedSheet.layers`, and `getCredits` ignored the supplied successful
    layer set and included `Missing Artist`.
- `rtk pnpm --filter @lpc-toolkit/cli test -- render.test.ts
  main-render-errors.test.ts character-commands.test.ts`
  - Expected FAIL: 6 failed and 31 passed. Directory and ZIP mixed renders
    retained the missing fixture artist/GPL license, all-missing character
    partial renders exited successfully, direct partial metadata retained GPL,
    and the injected non-male preset default was not used.

### GREEN and Final Verification

- Focused core composition/credits: PASS, 2 files and 50 tests.
- Focused CLI render/character integration: PASS, 3 files and 37 tests.
- Core, CLI, presets, and Web typechecks: PASS with no diagnostics.
- Full core: PASS, 14 files and 168 tests.
- Presets focused compatibility: PASS, 1 file and 3 tests.
- Full CLI: PASS, 30 files, 294 passed and 1 platform-specific skip.
- Full Web: PASS, 73 files and 649 tests.
- `rtk pnpm check:boundaries`: PASS.
- `rtk pnpm --filter @lpc-toolkit/cli test:package`: PASS; installed smoke
  printed `Packed CLI install smoke test passed.`
- `rtk git diff --check`: PASS.

Expected existing missing-image diagnostics were printed during focused and
full tests. No assertion failed, no dependency or `any` was added, core remains
environment-agnostic, and the unrelated audit temp file remains untouched.
