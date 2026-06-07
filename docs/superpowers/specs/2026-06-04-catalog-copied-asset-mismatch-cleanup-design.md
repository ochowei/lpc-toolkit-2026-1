# Catalog/Copied Asset Mismatch Cleanup Design

## Context

The strict random variant path audit now validates random-covered,
male-compatible, variant-backed items against the local `assets/spritesheets`
tree. After the representative resolver fixes, three documented gaps remained:

- `hat_helmet_bascinet_pigface`
- `hat_helmet_bascinet_pigface_raised`
- `shield_two_engrailed_trim`

These are local catalog/copied asset mismatches, not core path selection
issues. `upstream/` is read-only and is not initialized in this worktree, so
the cleanup is limited to tracked local `assets/` data and tests.

## Goals

- Remove the strict audit allowlist for the three remaining gaps.
- Ensure each declared representative catalog layer resolves to an existing
  local copied sprite path.
- Keep `packages/core` environment-agnostic and avoid item-specific resolver
  rewrites.
- Preserve attribution metadata from `assets/CREDITS.csv`.
- Avoid default recolor selection changes.

## Non-Goals

- Do not edit `upstream/`.
- Do not add dependencies.
- Do not change random outfit recolor defaults.
- Do not broaden this cleanup to unrelated catalog/data issues.

## Findings

### Pigface Bascinet Items

The two hat catalog entries point at:

- `hat/helmet/bascinet_pigface/adult/`
- `hat/helmet/bascinet_pigface_raised/adult/`

Their JSON declares metal names as `variants`, which makes compose try paths
such as `walk/steel.png`. The local spritesheet layout for comparable helmets
uses flat animation PNGs plus a `recolors.material = "metal"` definition. The
only tracked local pigface PNGs currently live under:

- `hat/visor/pigface/adult/*.png`
- `hat/visor/pigface_raised/adult/*.png`

`assets/CREDITS.csv` has rows for both the helmet/bascinet paths and the visor
paths, with the same attribution metadata. The local sheet definitions should
match the flat recolor layout, and the missing copied helmet/bascinet
directories should be restored locally instead of teaching core to rewrite hat
paths into visor paths.

### Two Engrailed Shield Trim

The catalog declares bg and fg layers under:

- `shield/two_engrailed/trim/bg/`
- `shield/two_engrailed/trim/fg/<body>/`

The fg layer has `two_engrailed_trim.png` files, but the bg layer at that path
contains base filenames such as `two_engrailed.png`. A complete normalized trim
tree already exists under:

- `shield/two_engrailed_trim/bg/`
- `shield/two_engrailed_trim/fg/<body>/`

The sheet definition should point both layers at the normalized trim tree so
the declared variant filename and asset path agree.

## Success Criteria

- The focused audit fails before the cleanup with the three documented target
  gaps.
- The strict audit has no unresolved allowlist entries.
- The focused random outfit variant audit passes.
- `pnpm --filter @lpc-toolkit/web test`, `pnpm -r typecheck`, and practical
  workspace tests pass.
