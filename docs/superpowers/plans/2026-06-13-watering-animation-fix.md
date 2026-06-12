# Watering Animation Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the watering animation bug in the toolkit where selecting `watering` plays `spellcast` instead of `watering`, and ensure `watering` is correctly exported to the ZIP archives.

**Architecture:** We will define a constant `VIRTUAL_ANIMATION_MAP` mapping virtual standard animations to their physical counterparts in the core constants. Then, the web package will use this map to resolve `watering` during character preview resolution and ZIP exports.

**Tech Stack:** TypeScript, React, JSZip, Vitest

---

### Task 1: Core Library Constants Expansion

**Files:**
- Modify: [constants.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/core/src/constants.ts)
- Modify: [index.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/core/src/index.ts)

- [x] **Step 1: Update constants.ts**
  Add the `VIRTUAL_ANIMATION_MAP` export mapping virtual standard animations (`watering`) to their physical counterparts (`thrust`).
  - *Implementation:* Added `VIRTUAL_ANIMATION_MAP` to constants.ts.

- [x] **Step 2: Update index.ts**
  Export `VIRTUAL_ANIMATION_MAP` so the web client can import it.
  - *Implementation:* Added export to index.ts.

- [x] **Step 3: Run core tests to ensure no regressions**
  Run: `pnpm --filter @lpc-toolkit/core test`
  - *Verification:* `pnpm --filter @lpc-toolkit/core test` PASS (154 tests passed)

- [x] **Step 4: Commit**
  - *Commit:* `31c70d6ef`
  - *Verification:* Committed successfully.


---

### Task 2: Web Character Active Animation Resolution

**Files:**
- Modify: [use-composed-character.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/hooks/use-composed-character.ts)
- Modify: [use-composed-character.test.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/test/use-composed-character.test.ts)

- [x] **Step 1: Write tests for resolveAnim**
  Export `resolveAnim` and add tests in `use-composed-character.test.ts` to verify resolution of standard, fallback, and virtual/shared animations using `VIRTUAL_ANIMATION_MAP`.
  
  In `use-composed-character.test.ts`:
  ```typescript
  import { resolveAnim } from '../src/hooks/use-composed-character';
  
  describe('resolveAnim', () => {
    it('resolves standard composed animations directly', () => {
      const sheet = {
        animations: ['walk', 'spellcast'],
        customAnimations: new Map(),
      } as unknown as ComposedSheet;
      expect(resolveAnim(sheet, 'walk')).toBe('walk');
      expect(resolveAnim(sheet, 'spellcast')).toBe('spellcast');
    });
  
    it('falls back to the first composed animation when requesting an uncomposed animation', () => {
      const sheet = {
        animations: ['walk', 'spellcast'],
        customAnimations: new Map(),
      } as unknown as ComposedSheet;
      expect(resolveAnim(sheet, 'slash')).toBe('walk');
    });
  
    it('resolves virtual animations (watering) when their physical row animation (thrust) is composed', () => {
      const sheet = {
        animations: ['walk', 'thrust'],
        customAnimations: new Map(),
      } as unknown as ComposedSheet;
      expect(resolveAnim(sheet, 'watering')).toBe('watering');
    });
  
    it('falls back when the physical row animation for a virtual animation is not composed', () => {
      const sheet = {
        animations: ['walk', 'spellcast'],
        customAnimations: new Map(),
      } as unknown as ComposedSheet;
      expect(resolveAnim(sheet, 'watering')).toBe('walk');
    });
  });
  ```
  - *Implementation:* Added test suite in `packages/web/test/use-composed-character.test.ts`.

- [x] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @lpc-toolkit/web test use-composed-character.test.ts`
  Expected: FAIL (resolveAnim not exported / tests for virtual mapping fail)
  - *Verification:* Verified tests failed with "TypeError: resolveAnim is not a function" as expected.

- [x] **Step 3: Implement resolveAnim virtual mapping**
  Modify `resolveAnim` in `use-composed-character.ts` to export it, import `VIRTUAL_ANIMATION_MAP`, and check the map to allow virtual animations whose physical counterparts are composed.
  
  ```typescript
  import {
    composeSelections,
    extractAnimation,
    makeResolvePalette,
    VIRTUAL_ANIMATION_MAP,
    type Catalog,
    type ComposedAnimation,
    type ComposedSheet,
    type PaletteMetadata,
  } from '@lpc-toolkit/core';
  
  // ...
  
  export function resolveAnim(sheet: ComposedSheet, anim: string): string {
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
  - *Implementation:* Updated `packages/web/src/hooks/use-composed-character.ts` to export and implement virtual mapping for `resolveAnim`.

- [x] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @lpc-toolkit/web test use-composed-character.test.ts`
  Expected: PASS
  - *Verification:* Verified tests pass with `pnpm --filter @lpc-toolkit/web test use-composed-character.test.ts` (9/9 passed).

- [x] **Step 5: Commit**
  ```bash
  git add packages/web/src/hooks/use-composed-character.ts packages/web/test/use-composed-character.test.ts
  git commit -m "feat(web): support virtual animation resolution in resolveAnim"
  ```
  - *Commit:* `d85be334b`
  - *Verification:* Committed staged changes successfully.

---

### Task 3: Web Character ZIP Export Parity

**Files:**
- Modify: [zip-export.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/lib/zip-export.ts)
- Modify: [zip-export.test.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/test/zip-export.test.ts)

- [x] **Step 1: Write test for zip export virtual animations**
  Add a test in `packages/web/test/zip-export.test.ts` inside `describe('exportByAnimationZip (F4)')` to verify that `watering.png` is exported to the ZIP when `walk` and `thrust` are composed.
  - *Implementation:* Added test in `packages/web/test/zip-export.test.ts`.

- [x] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @lpc-toolkit/web test zip-export.test.ts`
  Expected: FAIL (standard/watering.png is missing from the list of files)
  - *Verification:* Verified test failed with missing `standard/watering.png`.

- [x] **Step 3: Implement getExportableStandardAnimations**
  In `zip-export.ts`, import `VIRTUAL_ANIMATION_MAP` and define the `getExportableStandardAnimations` helper. Use it to retrieve standard animations in `exportByAnimationZip`, `exportByAnimItemZip`, and `exportByFrameZip`.
  - *Implementation:* Created helper `getExportableStandardAnimations` and updated the three ZIP export functions in `zip-export.ts`.

- [x] **Step 4: Run test to verify it passes**
  Run: `pnpm --filter @lpc-toolkit/web test zip-export.test.ts`
  Expected: PASS
  - *Verification:* Verified tests pass with `pnpm --filter @lpc-toolkit/web test zip-export.test.ts` (20/20 passed).

- [x] **Step 5: Run the entire test suite**
  Run: `pnpm test`
  Expected: PASS
  - *Verification:* Verified workspace tests pass (`pnpm test` PASS) and typecheck is clean (`pnpm typecheck` PASS).

- [x] **Step 6: Commit**
  - *Commit:* `849db3767`
  - *Verification:* Staged and committed changes successfully.
