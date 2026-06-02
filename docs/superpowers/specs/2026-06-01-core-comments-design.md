# Core Package Documentation Specification

This specification outlines the plan to add comprehensive JSDoc/TSDoc and inline comments to the `@lpc-toolkit/core` package within `packages/core`.

## Objective
Enhance the maintainability of the core sprite composition codebase by providing:
1. **TSDoc / JSDoc Comments** on all public exports (types, interfaces, utility functions).
2. **Inline Algorithmic Explanations** inside low-level rendering, catalog processing, and pixel recoloring procedures.

All code modifications will be environment-agnostic, preserving full functionality, strict TypeScript compliance, and keeping all 420 unit tests green.

---

## Batch-by-Batch Plan

### Batch 1: Foundations & Types
*   **`src/types.ts`**: Document public domain entities including `ItemDefinition`, `Selections`, `ComposedSheet`, `Catalog`, `PaletteMetadata`, and `License`.
*   **`src/adapters.ts`**: Define the abstract requirement of the environment-agnostic canvas wrapper.
*   **`src/result.ts`**: Add comments and examples of how `Result<T, E>` should be used in code (monadic-like control flow).
*   **`src/constants.ts`**: Document standard dimensions (`FRAME_SIZE`, `SHEET_WIDTH`, `SHEET_HEIGHT`), animation structures, license matrices, and rendering limits.

### Batch 2: Data Parsing & Synchronization
*   **`src/catalog.ts`**: Describe the validation, tagging, and aliasing algorithms applied to raw sprite sheets.
*   **`src/palettes.ts`**: Detail color ramps, material catalogs, and order-independent version metadata loading.
*   **`src/recolor-resolve.ts`**: Explain how variants resolve to correct color palettes, including memoization strategies.
*   **`src/hash.ts`**: Describe the Base64/url-safe serialization format of user selection states, including how parsing errors and legacy inputs are handled.

### Batch 3: Composition, Animations, & Attribution
*   **`src/compose.ts`**: Document `composeSelections`, including z-index sorting, custom animation offset mapping, and pixel coordinate calculations.
*   **`src/recolor.ts`**: Detail the low-level pixel manipulation mechanism, demonstrating color-swapping directly on canvas `ImageData`.
*   **`src/frames.ts` & `src/animation.ts`**: Document row slicing logic and frame interval crops.
*   **`src/custom-animations.ts` & `src/custom-frames.ts`**: Detail wheelchair/riding structures and vertical sheet resizing algorithms.
*   **`src/credits.ts` & `src/credits-format.ts`**: Describe licensing rules, author attribution extraction from submodules, and serialization to CSV or TXT manifests.

---

## Verification Criteria
Each batch will be executed and verified before moving onto the next:
1. **Typecheck Verification**: `pnpm typecheck` must run without any TS errors.
2. **Test Baseline Verification**: `pnpm test` must run with 420 tests passing (0 failures).
