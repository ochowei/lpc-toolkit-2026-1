# Core Package Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add comprehensive JSDoc/TSDoc and inline algorithmic comments to all 17 source files in `@lpc-toolkit/core` without breaking functional behavior, strict type-safety, or unit tests.

**Architecture:** We group the 17 source files into 3 distinct logical layers. For each layer, we will add extensive public-facing API headers and explanatory inline blocks for complex algorithmic loops. Every task will be followed by compilation and test verification to ensure regressions are not introduced.

**Tech Stack:** TypeScript (strict mode), pnpm (workspaces), Vitest (testing)

---

### Task 1: Batch 1 — Foundations & Types

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/adapters.ts`
- Modify: `packages/core/src/result.ts`
- Modify: `packages/core/src/constants.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Document `packages/core/src/types.ts`**
  Add JSDoc headers to exported domain interfaces. Specifically document the structure and validation constraints of `ItemDefinition`, `Selections`, `Catalog`, `ComposedSheet`, `PaletteMetadata`, and `License`.
  
  *Example JSDoc for `ItemDefinition`:*
  ```typescript
  /**
   * Represents a single parsed item definition from sheet JSON.
   * Includes metadata, required tags, recolor configurations, and layers.
   */
  export interface ItemDefinition { ... }
  ```

- [ ] **Step 2: Document `packages/core/src/adapters.ts`**
  Add JSDoc to `CanvasAdapter`, `CanvasLike`, `Context2DLike`, `ImageDataLike`, and `ImageLike`. Explain that this adapter is the environment-agnostic bridge letting web (browser canvas) and cli (Node canvas) call the exact same rendering core.

- [ ] **Step 3: Document `packages/core/src/result.ts`**
  Add TSDoc headers to `Result`, `ok`, `err`, `isOk`, `isErr`, and `unwrapOr` explaining standard monadic-like success and failure handling, including typical patterns.

- [ ] **Step 4: Document `packages/core/src/constants.ts`**
  Document `FRAME_SIZE`, `SHEET_WIDTH`, `SHEET_HEIGHT`, `COMPACT_FRAME_SIZE`, `ANIMATIONS`, `DIRECTIONS`, and `LICENSE_CONFIG`. Clarify the offset indexing layout and standard 2D layout rules of standard sheets.

- [ ] **Step 5: Document `packages/core/src/index.ts`**
  Add a high-level module overview JSDoc explaining the entry point exports.

- [ ] **Step 6: Run Typecheck and Tests**
  Run: `pnpm typecheck`
  Expected: Success, no TypeScript compile errors.
  Run: `pnpm test`
  Expected: Success, 420 tests passing (0 failures).

- [ ] **Step 7: Commit Batch 1**
  Run:
  ```bash
  git add packages/core/src/types.ts packages/core/src/adapters.ts packages/core/src/result.ts packages/core/src/constants.ts packages/core/src/index.ts
  git commit -m "docs: document batch 1 foundation types and constants in core"
  ```

---

### Task 2: Batch 2 — Data Parsing & Synchronization

**Files:**
- Modify: `packages/core/src/catalog.ts`
- Modify: `packages/core/src/palettes.ts`
- Modify: `packages/core/src/recolor-resolve.ts`
- Modify: `packages/core/src/hash.ts`

- [ ] **Step 1: Document `packages/core/src/catalog.ts`**
  Document `createCatalog` and the validation loops checking required tags, priority weights, aliases, and replacement rules. Add inline comments inside the indexing logic explaining how lookup maps are built.

- [ ] **Step 2: Document `packages/core/src/palettes.ts`**
  Add JSDoc to `createPaletteCatalog`. Explain how palette metadata (materials and versions) are merged order-independently and how base/default materials are matched.

- [ ] **Step 3: Document `packages/core/src/recolor-resolve.ts`**
  Add JSDoc to `getRecolorSwatches`, `getRecolorVariants`, and `makeResolvePalette`. Document the lookup and resolution algorithm where active sheet configs override default palette values.

- [ ] **Step 4: Document `packages/core/src/hash.ts`**
  Add descriptions to `parseHash` and `serializeHash`. Add detailed inline comments explaining the Base64 bit-packing encoding scheme used to represent the full visual customization state in a compact URL token.

- [ ] **Step 5: Run Typecheck and Tests**
  Run: `pnpm typecheck`
  Expected: Success, no TypeScript compile errors.
  Run: `pnpm test`
  Expected: Success, 420 tests passing (0 failures).

- [ ] **Step 6: Commit Batch 2**
  Run:
  ```bash
  git add packages/core/src/catalog.ts packages/core/src/palettes.ts packages/core/src/recolor-resolve.ts packages/core/src/hash.ts
  git commit -m "docs: document batch 2 catalog parsing and palette resolve in core"
  ```

---

### Task 3: Batch 3 — Composition, Animations, & Attribution

**Files:**
- Modify: `packages/core/src/compose.ts`
- Modify: `packages/core/src/recolor.ts`
- Modify: `packages/core/src/frames.ts`
- Modify: `packages/core/src/animation.ts`
- Modify: `packages/core/src/custom-animations.ts`
- Modify: `packages/core/src/custom-frames.ts`
- Modify: `packages/core/src/credits.ts`
- Modify: `packages/core/src/credits-format.ts`

- [ ] **Step 1: Document `packages/core/src/compose.ts`**
  Add JSDoc and extensive inline explanations to `composeSelections` and `getSpritePathsForSelections`. Document the z-index sorting pipeline, custom animation region allocation, and the context coordinate math for image slices.

- [ ] **Step 2: Document `packages/core/src/recolor.ts`**
  Add inline comments to `recolorImage` and `recolorPixels`. Explain how color ramps are aligned and how image pixel Uint8ClampedArray coordinates are indexed to execute fast color swaps environment-agnostically.

- [ ] **Step 3: Document `packages/core/src/frames.ts` & `packages/core/src/animation.ts`**
  Explain row calculations, framing intervals, and crops.

- [ ] **Step 4: Document `packages/core/src/custom-animations.ts` & `packages/core/src/custom-frames.ts`**
  Explain non-standard animations (riding, wheelchair), custom height mappings, and specific offsets needed for correct composite positioning.

- [ ] **Step 5: Document `packages/core/src/credits.ts` & `packages/core/src/credits-format.ts`**
  Detail `getCredits`, `computeEffectiveLicense`, and output formatter serializers. Explain deduplication rules, path-mapping credit lookups, and attribution requirements.

- [ ] **Step 6: Run Typecheck and Tests**
  Run: `pnpm typecheck`
  Expected: Success, no TypeScript compile errors.
  Run: `pnpm test`
  Expected: Success, 420 tests passing (0 failures).

- [ ] **Step 7: Commit Batch 3**
  Run:
  ```bash
  git add packages/core/src/compose.ts packages/core/src/recolor.ts packages/core/src/frames.ts packages/core/src/animation.ts packages/core/src/custom-animations.ts packages/core/src/custom-frames.ts packages/core/src/credits.ts packages/core/src/credits-format.ts
  git commit -m "docs: document batch 3 sprite composition and rendering algorithms"
  ```
