# Wings and Weapons Render Investigation

Date: 2026-06-03
Branch: `feature/issue-40-jszip`
Context: PR #44, JSZip offline spritesheet serving

## Problem Statement

User-visible symptom:

> 目前看起來, toolkit 的翅膀跟武器沒有 render

This was reported after the ZIP asset-source fix was pushed. Because production preview defaults to `assetSource=zip`, the first suspicion was that ZIP mode was still dropping some layer images.

## Relevant Prior Fix

Commit `a18929a3e fix(web): retry failed ZIP asset downloads` fixed one confirmed ZIP-mode failure:

- `packages/web/src/adapter/zip-loader.ts` cached a rejected ZIP download promise.
- If the first request for a category ZIP failed, later requests reused the same rejected promise.
- `composeSelections` intentionally swallows per-image load failures, so a rejected category could appear as missing layers.
- The fix clears `downloadPromises[category]` on failed ZIP download/parse so later renders can retry.

That fix is valid, but it does not fully explain the current wings/weapons report.

## Investigation Performed

### 1. Catalog and Asset Resolution

For the observed complex hash from the existing parity case:

```text
...&weapon_magic_crystal=Crystal&...&wings=Bat_Wings&wings_dots=Monarch_Wings_Dots&wings_edge=Monarch_Wings_Edge...
```

Core hash parsing resolves the relevant selections as:

```json
{
  "weapon_magic_crystal": {
    "typeName": "weapon_magic_crystal",
    "name": "Crystal",
    "variant": "blue"
  },
  "wings": {
    "typeName": "wings",
    "name": "Bat Wings",
    "variant": "blonde"
  },
  "wings_dots": {
    "typeName": "wings_dots",
    "name": "Monarch Wings Dots",
    "variant": "amber"
  },
  "wings_edge": {
    "typeName": "wings_edge",
    "name": "Monarch Wings Edge",
    "variant": "amber"
  }
}
```

The relevant resolved layer paths include:

```text
spritesheets/body/wings/bat/adult/bg/walk/blonde.png
spritesheets/body/wings/bat/adult/fg/walk/blonde.png
spritesheets/body/wings/monarch/dots/bg/walk/amber.png
spritesheets/body/wings/monarch/dots/fg/walk/amber.png
spritesheets/body/wings/monarch/edge/bg/walk/amber.png
spritesheets/body/wings/monarch/edge/fg/walk/amber.png
spritesheets/weapon/magic/crystal/universal/background/walk/blue.png
spritesheets/weapon/magic/crystal/universal/foreground/walk/blue.png
spritesheets/weapon/magic/crystal/thrust/background/blue.png
spritesheets/weapon/magic/crystal/thrust/foreground/blue.png
```

All of those files exist under `assets/`.

### 2. Core Compose Pixel Difference

A Node-side diagnostic used the real core compose pipeline with `@napi-rs/canvas` and real `assets/` images.

Three renders were compared:

- full observed selection
- same selection with all `wings*` items removed
- same selection with all `weapon*` items removed

Result:

```json
{
  "noWingsDiff": {
    "mismatch": 31574,
    "alphaMismatch": 26909
  },
  "noWeaponDiff": {
    "mismatch": 3761552,
    "alphaMismatch": 3761552
  }
}
```

Interpretation:

- Core is not completely skipping wings.
- Core is not completely skipping the selected weapon layer.
- The full canvas differs from versions with those selections removed, so at least some wing/weapon pixels are being drawn.

### 3. Existing E2E Coverage

The existing full web e2e suite passed after the ZIP retry fix:

```text
pnpm --filter @lpc-toolkit/web test:e2e
12 passed
```

This includes:

- random upstream parity cases
- `observed-deployed-mismatch-2026-05-30`
- ZIP-vs-local rendering parity test

This means current tests do not catch the user-visible issue. The issue is likely more specific than "all wings/weapons are absent from the composed sheet."

## Current Leading Hypothesis

The strongest current hypothesis is a preview/UI animation limitation, especially for weapons.

Many weapon assets define oversized or custom attack animations, for example:

- `slash_oversize`
- `slash_reverse_oversize`
- `thrust_oversize`
- `slash_128`
- `backslash_128`
- `halfslash_128`

Core composes custom animation regions below the standard LPC sheet and exposes them via `sheet.customAnimations`.

However, the preview UI currently has two limitations:

1. `PreviewPane` only lists `Object.keys(ANIMATION_CONFIGS)` in the animation dropdown.
2. `useAnimationPlayer` only reads `ANIMATION_CONFIGS[animation.animation]`.

Therefore:

- Standard animations such as `walk` can show some weapon pixels.
- Custom/oversized weapon animations may exist in the composed sheet but cannot be selected or played in the preview.
- When the user expects to see the weapon during its attack animation, it can look like the weapon did not render.

Wings are less clearly explained by custom animation support because the tested wing layers affect the standard `walk` canvas. The visual symptom may be due to occlusion, z-order expectations, selected direction/frame, or a different wing selection than the observed hash.

## Red Test Added Before Pause

A focused red test was added but no production code was changed after the user asked to pause:

```text
packages/web/test/use-animation-player.test.ts
```

The test asserts that a custom animation frame rect can be calculated from extracted animation geometry.

Current failure:

```text
animationFrameRect is not a function
```

This is intentional red-state evidence for the next implementation step. The test is currently uncommitted.

## Not Yet Proven

These have not been proven yet:

- That the user-visible wings issue is the same root cause as custom weapon animations.
- That production ZIP mode fails to load any specific wing or weapon PNG after commit `a18929a3e`.
- That z-order differs from upstream for wings/weapons in the reported view.
- That the layer picker thumbnails are affected. The investigation so far focused on main composition and preview behavior.

## Suggested Next Steps

1. Finish the custom-animation preview fix:
   - Add a small helper in `use-animation-player.ts` that supports both standard and custom `ComposedAnimation` geometry.
   - Extend the preview animation dropdown to include `result.sheet.customAnimations` keys.
   - Keep standard animation behavior unchanged.

2. Add e2e coverage:
   - Select a known weapon with a custom animation, such as `Longsword` or `Crystal`.
   - Verify the custom animation option appears in the preview dropdown.
   - Verify the preview canvas becomes non-empty for the custom animation.

3. Investigate wings separately if still reported:
   - Reproduce with the exact user-selected wing item, variant, direction, and animation.
   - Compare full canvas against a no-wings render in browser ZIP mode.
   - If pixels differ but the user cannot see them, inspect z-order, occlusion, and current frame/direction.

## Files Involved

Primary code paths:

- `packages/core/src/compose.ts`
- `packages/core/src/animation.ts`
- `packages/web/src/hooks/use-composed-character.ts`
- `packages/web/src/hooks/use-animation-player.ts`
- `packages/web/src/components/layer-stack/preview-pane.tsx`
- `packages/web/src/adapter/zip-loader.ts`

Related tests:

- `packages/web/e2e/zip-asset-source.spec.ts`
- `packages/web/e2e/random-upstream-parity.spec.ts`
- `packages/web/test/use-animation-player.test.ts`

