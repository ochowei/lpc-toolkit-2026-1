# CLI Unsupported Animations Design

**Date:** 2026-07-16

## Summary

Extend CLI catalog inspection so a single-item detail reports native animation
metadata, compatible standard animations derived from custom animation bases,
and unsupported standard animations. Keep catalog list responses compact while
making animation filtering use the same compatibility semantics.

## Goals

- Add `compatibleAnimations` and `unsupportedAnimations` to the JSON returned by
  `lpc-toolkit catalog item <item-id-or-type/name> --json`.
- Add matching `compatible standard animations` and
  `unsupported standard animations` lines to the human-readable item detail.
- Preserve the existing `animations` field as the native animation identifiers
  declared by the asset.
- Treat registered custom animations as compatible with their standard base:
  for example, `wheelchair` is compatible with `sit`, `tool_rod` with `thrust`,
  and `slash_oversize` with `slash`.
- Make `catalog items --animation <name>` match either a native animation or a
  compatible standard animation.
- Normalize definitions that omit `animations` to `ANIMATION_DEFAULTS`, matching
  Core composition behavior.

## Non-Goals

- Do not change render, preview, export, frame extraction, or attribution
  behavior.
- Do not rename custom animations or insert derived standard names into the
  existing `animations` field.
- Do not add a new command-line flag or a negative `--not-animation` filter.
- Do not add unsupported-animation lists to catalog list summaries.
- Do not infer compatibility for unknown custom animation names.

## CLI Contract

For a Wheelchair item, the human-readable detail will include:

```text
animations: wheelchair
compatible standard animations: sit
unsupported standard animations: spellcast, thrust, walk, ...
```

The JSON detail will include:

```json
{
  "animations": ["wheelchair"],
  "compatibleAnimations": ["sit"],
  "unsupportedAnimations": ["spellcast", "thrust", "walk"]
}
```

`compatibleAnimations` contains only additional standard capabilities derived
from custom animations; it does not repeat directly declared standard names.
`unsupportedAnimations` contains every registered standard logical animation
that appears in neither the normalized native set nor the compatible set.

Catalog item summaries retain their current field set. Their existing
`animations` field does, however, use the same missing-metadata normalization as
item details so discovery reflects what Core can compose.

## Capability Model

The calculation uses the following ordered sources:

1. Native animations are the item's string-valued `animations` entries. When
   the field is absent, use `ANIMATION_DEFAULTS`; an explicitly empty array stays
   empty.
2. The standard animation universe is the logical values in `ANIMATIONS`, in
   registry order, including entries marked `noExport` because they remain
   addressable CLI animation names.
3. For each native name registered in `customAnimations`, derive its base with
   `customAnimationBase`. Add that base to `compatibleAnimations` only when it is
   in the standard universe and is not already native.
4. Build `unsupportedAnimations` by retaining standard registry entries that
   occur in neither the native standard set nor the compatible set.

All returned arrays are deterministic. Native order follows the definition or
`ANIMATION_DEFAULTS`; compatible and unsupported order follows `ANIMATIONS`.
Unknown custom names remain visible in `animations` but contribute no compatible
standard capability.

## Data Flow and Ownership

The calculation belongs in `packages/cli/src/catalog-discovery.ts` because it is
CLI catalog presentation and filtering logic. It consumes Core's existing
animation registries and custom-animation helpers without changing Core.

`DiscoveryItemSummary.animations` receives normalized native animations.
`DiscoveryItemDetail` adds `compatibleAnimations` and
`unsupportedAnimations`. `toDiscoveryDetail` computes those detail-only fields,
while `toDiscoveryCandidate` keeps list summaries compact.

Catalog filtering and filter-domain validation use the union of native and
compatible animations. Consequently, `catalog items --animation sit` can return
Wheelchair, while the item detail still makes clear that its native identifier
is `wheelchair`.

Human response formatting emits the new lines only when the detail-only fields
are present. JSON serialization follows the existing response path and requires
no separate formatter.

## Error and Edge-Case Behavior

- Missing `animations` uses `ANIMATION_DEFAULTS`; malformed non-array values are
  treated as missing for the same safe fallback.
- An explicit empty animation array yields no native or compatible animations
  and lists the complete standard universe as unsupported.
- Duplicate native or derived names are de-duplicated without changing the
  defined ordering.
- Unknown custom animation names do not throw and do not create guessed
  compatibility.
- Existing unknown-animation errors and suggestion structure remain unchanged;
  their candidate domain expands consistently to normalized native and
  compatible names.

## Testing

Use test-driven development with focused CLI tests that first fail because the
new fields or behavior are absent. Cover:

- a standard-only item with deterministic unsupported animations;
- Wheelchair reporting native `wheelchair`, compatible `sit`, and no unsupported
  `sit`;
- another custom mapping such as `tool_rod` to prove the rule is generic;
- missing, malformed, and explicitly empty `animations` metadata;
- `catalog items --animation sit` matching Wheelchair through compatibility;
- human-readable `catalog item` output;
- JSON item-detail output and unchanged list-summary shape;
- unknown custom animation handling.

Run the focused CLI suite while iterating, then CLI typecheck, CLI tests, plugin
verification, the common `pnpm verify` gate, CLI build, and package smoke test
before handoff.

## Documentation Impact

```text
help: update
cli-readme: update
root-readme: update
landing: N/A — existing command examples remain valid and promise no output schema
architecture: N/A — package boundaries and ownership do not change
engineering: N/A — development and verification commands do not change
releasing: N/A — packaging, versioning, and publication do not change
plugin: update
```

Update the CLI command description/help to mention animation capabilities,
document the new human and JSON fields in the CLI README, note the richer item
inspection in the root README, and update the plugin's CLI workflow reference so
agents interpret native, compatible, and unsupported arrays correctly.

## Constraints

- Add no dependency and no `any` type.
- Preserve strict TypeScript and existing CLI response conventions.
- Preserve mandatory attribution data and complete item credits.
- Do not touch or initialize `upstream/`.
