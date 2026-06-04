# Strict Random Variant Path Audit Design

## Context

The first random-variant audit fixed random outfit selections so
variant-backed items receive their first declared variant. Its real-catalog
test intentionally checked only that each random-covered item resolves at
least one existing representative sprite path.

A stricter audit found 37 missing representative layer paths. Those gaps are
not all caused by random selection. They expose mismatches between
`selectionForItem()`, `getSpritePathsForSelections()`, catalog layer paths, and
the copied `assets/spritesheets` tree.

## Goals

- Add a strict real-catalog audit for random-covered, male-compatible,
  variant-backed items.
- Require every representative layer path emitted by
  `getSpritePathsForSelections()` to exist under `assets/spritesheets`.
- Classify and fix resolver/catalog mismatches without changing random recolor
  behavior.
- Keep `upstream/` read-only and avoid new dependencies.

## Non-Goals

- Do not implement default recolor selection.
- Do not change GPL attribution behavior.
- Do not add backend, auth, database, build-tool, or framework changes.
- Do not edit `upstream/`.

## Known Root Causes

The failing paths are expected to fall into these buckets:

- Default variant is not a concrete sprite filename for every body path, such
  as `facial_glasses_shades` selecting `base` while adult walk assets are flat
  `walk.png` or color-specific files.
- Multi-layer shield items where some layers have `walk/<variant>.png`, while
  other layers only expose a different representative folder such as `idle`.
- Wide/custom ranged weapon layers whose folder layout places standard
  `walk` assets under background/foreground subfolders rather than directly
  below the layer base path.
- Orphan catalog entries whose declared paths do not exist in the copied
  sprite tree, such as the pigface bascinet helmet entries.

## Fix Strategy

Prefer resolver fixes over test allowlists when the asset exists and the
catalog contains enough information to choose it deterministically.

Allowed fix levels, in priority order:

1. `getSpritePathsForSelections()` representative path selection when it is
   choosing a missing path despite an existing representative layer.
2. `selectionForItem()` only if the first-variant contract is proven wrong for
   catalog data, without introducing recolor defaults.
3. Catalog/copied asset mismatch handling only outside `upstream/`.
4. A narrow documented allowlist only for true missing copied assets or
   upstream/catalog orphan entries that cannot be resolved safely in code.

## Implemented Decision

`packages/core` remains environment-agnostic. `getSpritePathsForSelections()`
accepts an optional caller-provided `pathExists` hook. Without that hook it
keeps the previous deterministic representative path contract. With the hook,
it tries the current representative path first, then variant/flat candidates
for supported animation folders, and returns the first existing candidate.

The strict web audit injects a filesystem-backed existence check because tests
run in Node and can inspect `assets/spritesheets`.

Three unresolved catalog/copied asset gaps are allowlisted in the strict audit:

- `hat_helmet_bascinet_pigface`
- `hat_helmet_bascinet_pigface_raised`
- `shield_two_engrailed_trim`

These are not hidden resolver bugs: the assets either live under a different
base path than the catalog declares, or the background-layer filenames do not
match the declared default variant. Fixing them should be handled in a later
catalog/copy phase rather than by adding item-specific path rewrites to core.

## Success Criteria

- The strict audit fails before implementation and reports the current missing
  representative paths.
- After implementation, the strict audit passes without hiding resolvable
  asset-layout mismatches.
- Existing random outfit tests and the previous narrower audit continue to
  pass.
- Workspace typecheck passes.
