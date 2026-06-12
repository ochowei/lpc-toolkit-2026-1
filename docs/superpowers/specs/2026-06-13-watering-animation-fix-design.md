# Watering Animation Fix Design

Introduce a clean mechanism to map virtual animations (e.g. `watering`) to their physical row animations (e.g. `thrust`), fixing the fallback playback bug (playing `spellcast` instead of `watering`) and restoring full ZIP export parity with the upstream repository.

## Problem Context

In standard LPC spritesheet layouts, `watering` is a virtual/un-composed animation that shares the physical rows of the `thrust` animation (row 4 of the sheet). It has no unique row or folder offset in `ANIMATION_OFFSETS`.

1. **Preview Bug**: When the user selects `watering` in the UI, `resolveAnim` checks if it exists in `sheet.animations` (the composed animations list). Since it is not in the list, it falls back to `sheet.animations[0] ?? 'walk'`, which resolves to `'spellcast'`.
2. **ZIP Export Bug**: When exporting character packs, the ZIP generators only iterate over `sheet.animations`, resulting in `watering.png` and `watering/` frame directories being omitted from the ZIP, violating upstream parity.

## Proposed Changes

### Core Library

#### [MODIFY] [constants.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/core/src/constants.ts)
- Add and export `VIRTUAL_ANIMATION_MAP` mapping virtual standard animations to their physical counterparts:
```typescript
/**
 * Maps virtual/shared standard animations that do not have their own folder in ANIMATION_OFFSETS
 * to the physical standard animation row they share/depend on.
 */
export const VIRTUAL_ANIMATION_MAP = {
  watering: 'thrust',
} as const satisfies Readonly<Record<string, string>>;
```

#### [MODIFY] [index.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/core/src/index.ts)
- Export `VIRTUAL_ANIMATION_MAP` from `@lpc-toolkit/core`.

---

### Web Client

#### [MODIFY] [use-composed-character.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/hooks/use-composed-character.ts)
- Update `resolveAnim` to check `VIRTUAL_ANIMATION_MAP`. If a virtual animation maps to a composed physical animation (e.g., `thrust`), allow resolving to it instead of falling back:
```typescript
import { VIRTUAL_ANIMATION_MAP } from '@lpc-toolkit/core';

function resolveAnim(sheet: ComposedSheet, anim: string): string {
  if (sheet.animations.includes(anim)) return anim;
  if (sheet.customAnimations?.has(anim)) return anim;

  // Resolve virtual/shared animations using the map
  const physical = VIRTUAL_ANIMATION_MAP[anim as keyof typeof VIRTUAL_ANIMATION_MAP];
  if (physical && sheet.animations.includes(physical)) {
    return anim;
  }

  return sheet.animations[0] ?? 'walk';
}
```

#### [MODIFY] [zip-export.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/lib/zip-export.ts)
- Define a helper to retrieve all exportable standard animations (including composed virtual ones):
```typescript
import { VIRTUAL_ANIMATION_MAP } from '@lpc-toolkit/core';

/** Get all standard animations to export, including composed virtual animations. */
function getExportableStandardAnimations(sheet: ComposedSheet): string[] {
  const anims = [...sheet.animations];
  for (const [virt, phys] of Object.entries(VIRTUAL_ANIMATION_MAP)) {
    if (sheet.animations.includes(phys) && !anims.includes(virt)) {
      anims.push(virt);
    }
  }
  return anims;
}
```
- Replace direct `sheet.animations` (or `ctx.sheet.animations`) access with `getExportableStandardAnimations(sheet)` in `exportByAnimationZip`, `exportByAnimItemZip`, and `exportByFrameZip`.

---

## Verification Plan

### Automated Tests
- Add a test in `packages/web/test/zip-export.test.ts` verifying that `watering` is included in the exported ZIP folders when `thrust` is composed.
- Run `pnpm test` and verify that all tests pass.

### Manual Verification
- Run the web app locally using `pnpm dev`.
- Select a standard character (e.g. Body Type: Male, Body Color: Light).
- Select `watering` from the animation dropdown.
- Verify that the preview player animates the character doing the thrust action (watering cycle) instead of the spellcast action.
