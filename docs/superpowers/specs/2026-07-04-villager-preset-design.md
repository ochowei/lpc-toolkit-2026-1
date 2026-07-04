# Villager Preset Design

## Goal

Add a new everyday `villager` preset to the web preset menu. The preset should
feel like a plain town NPC or starting character, distinct from the existing
Farmer preset's farming outfit.

## Scope

This is a web-only data and test change. It should not modify `upstream/`, add
dependencies, or change core composition behavior.

In scope:

- Add a fixed `villager` preset.
- Add English and Traditional Chinese preset labels.
- Add a matching `villager` random profile for the preset menu's Random action.
- Update focused preset and random-profile tests.

Out of scope:

- Migrating or creating new art assets.
- Changing preset application semantics.
- Changing attribution generation.
- Adding new UI controls.

## Fixed Preset Behavior

The fixed `villager` preset should be clothing-only. It should not set
`bodyType`, body, head, expression, hair, or other personal appearance slots.
Applying it should preserve the user's current character appearance while
replacing the outfit slots already cleared by preset application.

Recommended fixed items:

- `clothes`: `Longsleeve`, with a muted cloth recolor.
- `legs`: `Pants`, with a muted cloth recolor.
- `shoes`: `Basic Shoes`, with a subdued variant such as `brown` or `tan`.

This gives the preset full torso, legs, and feet coverage while avoiding the
Farmer preset's `Overalls` identity.

## Random Profile Behavior

Add `VILLAGER_RANDOM_PROFILE` in `packages/web/src/slice/random-profiles.ts`.
It should use `id: 'villager'` and `labelKey: 'preset.villager'`.

The profile should keep the same broad appearance randomization shape used by
other preset random actions, but constrain clothing to mundane village items:

- `typeNames`: `body`, `head`, `expression`, `hair`, `clothes`, `legs`, `shoes`
- `itemPools.clothes`: `Longsleeve`, `Shortsleeve`
- `itemPools.legs`: `Pants`
- `itemPools.shoes`: `Basic Shoes`, `Basic Boots`

The random profile belongs in web slice logic, not in `packages/core/`.

## Data And I18n

Add the new preset to `PRESETS` in `packages/web/src/presets.ts` with a clear
village-themed emoji and `labelKey: 'preset.villager'`.

Add translations:

- English: `Villager`
- Traditional Chinese: `村民`

## Tests

Update focused web tests so they cover the new preset:

- `PRESETS` has six unique ids.
- Every preset label key exists.
- Every preset remains a complete outfit.
- Catalog validation resolves all fixed villager items and variants.
- Random-profile coverage confirms every preset id resolves to a non-normal
  profile, including `villager`.

## Verification

Run the narrowest relevant checks after implementation:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/presets.test.ts
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
rtk pnpm --dir packages/web typecheck
rtk pnpm check:boundaries
```

Boundary verification is included because the implementation will touch
`packages/web/src/slice/` and `packages/web/src/`.
