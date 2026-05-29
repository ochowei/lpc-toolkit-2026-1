# Random Upstream Parity Test Design

**Date:** 2026-05-30
**Scope:** `packages/web` e2e test design
**Goal:** Add deterministic browser parity coverage for random LPC Toolkit
characters against the upstream Universal LPC Spritesheet Character Generator,
without modifying the read-only `upstream/` submodule.

## Context

The web app already has a Playwright smoke test:
`packages/web/e2e/random-no-console-errors.spec.ts`. It clicks the random
outfit button 20 times and fails on browser errors. That proves the random
render path does not throw, but it does not prove that the generated character
matches upstream behavior.

The desired coverage is parity-oriented: for a deterministic random character,
the toolkit should serialize the same input that upstream understands, resolve
the same render ingredients where observable, and produce the same composed
sprite output for a small set of cases.

Important project constraints:

- `upstream/` is a read-only git submodule. Do not edit it, commit files inside
  it, or install packages inside it.
- Every rendered sprite still needs attribution metadata from upstream credits.
- `packages/core/` remains environment-agnostic; browser and filesystem work
  stays in callers/tests.
- No new dependency is required for the first design. Playwright already exists
  in `packages/web` and is Apache-2.0 licensed, compatible with GPL-3.0.

## Recommendation

Use a hybrid parity test:

1. **Structured parity first**: deterministic selections, canonical hash,
   resolved layer paths/order/recolor metadata where available.
2. **Small pixel smoke second**: a small number of deterministic cases compare
   composed output pixels against upstream output.

This is preferred over pure browser screenshot comparison because screenshots
mix in UI layout, zoom, animation timing, CSS, checkerboards, and viewport
details. It is also preferred over starting with broad full-pixel fuzzing
because structured parity makes failures diagnosable.

## Test Shape

Add a new Playwright spec separate from the existing random console smoke test.
The existing smoke test keeps its current job: random clicks must not create
browser errors. The new spec owns upstream parity.

Proposed files:

| File | Purpose |
|---|---|
| `packages/web/e2e/random-upstream-parity.spec.ts` | Main deterministic parity spec |
| `packages/web/e2e/helpers/seeded-rng.ts` | Tiny deterministic RNG for repeatable random cases |
| `packages/web/e2e/helpers/toolkit-page.ts` | Read toolkit hash, selections, canvas, and diagnostics |
| `packages/web/e2e/helpers/upstream-page.ts` | Read upstream render output and observable runtime diagnostics |
| `packages/web/e2e/helpers/pixel-diff.ts` | Compare two same-sized RGBA buffers and summarize mismatches |

The first implementation should keep this helper set minimal. If a helper is
only used once and remains short, keep it inline in the spec instead of creating
extra files.

## Data Flow

For each fixed seed:

1. Load the toolkit page at `/?assetSource=local`.
2. Use the app's randomization path with a seeded RNG, or generate selections
   in test code with the same `pickRandomOutfit` logic if that is less invasive.
3. Serialize selections to the canonical hash.
4. Open the toolkit page at `/?assetSource=local#<hash>` and wait until compose
   is complete.
5. Open the upstream page at `/#<hash>` using a local upstream Vite server or
   preview server.
6. Wait until upstream finishes rendering.
7. Compare structured output first.
8. Compare pixels for the small smoke subset.

All glue code lives in this repository under `packages/web/e2e`. The test may
use `page.evaluate()` to inspect upstream runtime state, but it must not patch
or write files in `upstream/`.

## Upstream Golden Source

The upstream page is the golden source for render behavior. The parity test
should prefer runtime observation over stored golden PNGs:

- Use the current upstream submodule checkout.
- Do not commit generated golden images in the first version.
- Do not require network access to `liberatedpixelcup.github.io`.
- Prefer local spritesheets copied from the submodule, matching current e2e
  setup.

If upstream exposes stable runtime data for selections, layer paths, draw order,
or renderer state, read it and include it in structured parity. If the runtime
does not expose that data cleanly, do not modify upstream just to get it. In
that case, structured diagnostics should include the toolkit's resolved layers
and upstream render/error state, while pixel parity provides the final render
signal.

## Assertions

First version assertions:

- Fixed seeds produce reproducible cases.
- Toolkit page renders the hash without console errors or page errors.
- Upstream page renders the same hash without console errors or page errors.
- Toolkit output has non-empty credits metadata for rendered selections.
- Toolkit and upstream canvas dimensions match for pixel-checked cases.
- Pixel-checked cases have zero RGBA pixel mismatch.

If real browser behavior shows deterministic but insignificant canvas
differences, a later design can introduce a tiny threshold. The first version
should start strict so differences are visible.

## Known Missing Sprite Paths

There is a known deferred bug documented in
`docs/superpowers/notes/2026-05-28-catalog-sprite-404-investigation.md`: some
catalog selections can resolve to sprite paths that do not exist in either the
toolkit's local copy or upstream itself.

The parity test should not report these as toolkit-vs-upstream mismatches. For
the first version:

- Detect missing sprite paths before pixel comparison where practical.
- Mark affected seeds as diagnostic skips, or emit a targeted failure category
  that says the seed hit known missing upstream/catalog data.
- Include seed, hash, selected items, and missing paths in the output.

This keeps the parity test focused on behavior differences rather than already
known upstream/catalog data holes.

## Case Count And Scripts

Default case count: **5 fixed seeds**.

Also include one explicit regression case from an observed toolkit-vs-upstream
visual mismatch:

```text
sex=male&body=Body_Color&head=Human_Female&eyes=Cyclops_Eyes&eyebrows=Thin_Eyebrows&nose=Large_nose&ears=Big_ears&ears_inner=Side_Wolf_Ears_Skintone&beard=Medium_Beard&expression=Happy_Alt&expression_crying=Tears&bandana=Bordered_Bandana&bandana_overlay=Skull_Bandana_Overlay&updo=High_Bun&hairextr=Right_Long_Straight&hairtie_rune=Hair_Tie_Rune&facial_mask=Plain_Mask&facial_right=Right_Monocle&facial_right_trim=Right_Monocle_Frame_Color&visor=Narrow_slit_visor&arms=Armour&clothes=Shortsleeve&overalls=Overalls&armour=Legion&chainmail=Chainmail&bracers=Bracers&bauldron=Bauldron&hat=Hood&jacket=Frock_coat&jacket_collar=Frock_collar&jacket_trim=Frock_coat_lapel&vest=Vest&hat_buckle=Wizard_Hat_Buckle&hat_overlay=Bicorne_Athwart_Skull&shoes_toe=Plated_Toe&cape_trim=Cape_Trim&quiver=Quiver&charm=Pearl_Gem&bandages=Bandages&cargo=Wood&gloves=Gloves&necklace=Simple_Necklace&sash=Obi&weapon_magic_crystal=Crystal&shield_paint=Revised_Heater_Shield_Paint&wings=Bat_Wings&wings_dots=Monarch_Wings_Dots&wings_edge=Monarch_Wings_Edge&fins=Fin&furry_ears=Cat_Ears&furry_ears_skin=Cat_Ears_Skintone&tail=Wolf_Tail
```

This case is not random fuzzing; it is a fixed regression fixture. It should
run even if one of the seeded random cases changes later, and its failure output
should make it clear that the source was an observed deployed-page mismatch.

The test should be available through an explicit script such as:

```bash
pnpm --filter @lpc-toolkit/web test:e2e:parity
```

It should not be folded into `pnpm test`. Keeping it explicit prevents normal
unit test runs from depending on two browser apps and a heavier parity workflow.
Whether it is also included in the broader `test:e2e` script can be decided
during implementation after measuring runtime and flake risk.

Large random fuzzing is out of scope for the first version. A future opt-in
script can run many seeds once the deterministic parity path is stable.

## Failure Output

Every failing case should print enough data to reproduce and diagnose it:

- seed
- canonical hash
- body type
- selected item list
- toolkit resolved layer paths and order
- upstream render status and any observable runtime state
- missing sprite paths, if any
- canvas dimensions
- pixel mismatch count and a small sample of mismatch coordinates

If artifact generation is cheap, save diff images under Playwright's test
artifacts on failure. Do not commit those images.

## Non-Goals

- No edits inside `upstream/`.
- No new dependencies.
- No committed golden PNG fixtures in the first version.
- No broad fuzzing.
- No UI screenshot comparison as the primary signal.
- No changes to `packages/core/` environment boundaries.
- No skipping attribution checks.

## Success Criteria

- A deterministic upstream parity Playwright test exists.
- It can be run locally with an explicit pnpm script.
- It compares a small fixed seed set and the observed fixed regression hash
  against upstream.
- It produces actionable diagnostics for mismatches.
- It handles known missing upstream/catalog sprite paths separately from true
  toolkit-vs-upstream mismatches.
- Existing unit and e2e tests remain conceptually separate from the parity test.
