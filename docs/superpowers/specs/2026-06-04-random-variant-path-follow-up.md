# Random Variant Path Follow-Up

## Context

The random variant audit originally expected every representative layer path
from `getSpritePathsForSelections()` to exist under `assets/spritesheets`.
Running that strict audit against the current real catalog found existing
catalog/path issues outside the random outfit default-variant fix.

## Findings

The strict per-layer audit reported 37 missing representative paths:

- Some first variants are not concrete sprite filenames for every body path.
  Example: `facial_glasses_shades` selects `base`, while adult sprites have
  `walk.png` and color-specific `walk/<color>.png` files, but no
  `walk/base.png`.
- Some multi-layer items have one representative layer present and another
  absent for the default `walk` animation. Example: heater shield foreground
  layers have `walk/<variant>.png`, while related background layers may only
  have other representative folders such as `idle`.
- Some custom/wide animation items expose standard and custom layers whose
  folder layout differs from the current representative path resolver.
  Example: ranged bows have `walk/background/<variant>.png` and
  `walk/foreground/<variant>.png`, while `universal/.../walk/<variant>.png`
  is not present.
- Two catalog entries appear orphaned in the copied sprite tree:
  `hat_helmet_bascinet_pigface` and
  `hat_helmet_bascinet_pigface_raised`. Their sheet definitions point at
  `hat/helmet/bascinet_pigface...`, but `assets/spritesheets` contains
  `hat/visor/pigface...` assets instead.

## Decision

This phase keeps the regression audit scoped to the random outfit bug: random
variant-backed items should not disappear completely when selected with
`selectionForItem()`. The committed audit therefore checks that each
random-covered male-compatible variant-backed item resolves at least one
existing representative sprite path, while explicitly excluding the known
default-variant path gaps:

- `facial_glasses_shades`
- `hat_helmet_bascinet_pigface`
- `hat_helmet_bascinet_pigface_raised`

The stricter per-layer path audit should be handled as a separate core/catalog
path-resolution phase. It may require changes to representative animation
selection, custom animation layer handling, or catalog generation data, and
should not be bundled into the random outfit selection fix.
