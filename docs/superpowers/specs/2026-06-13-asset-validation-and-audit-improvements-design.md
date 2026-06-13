# Spec: Asset Validation and Audit Improvements

- **Date**: 2026-06-13
- **Status**: Proposed
- **Author**: Antigravity (AI Coding Assistant)

---

## 1. Overview & Goals

During the visible bounds audit for item thumbnails (`audit:thumbnail-bounds`), several issues were identified that lead to false `empty` or `error` results:
1. **Backpacks & Back-worn Items**: Labeled as `empty` because they are physically invisible in the default `down` (front-facing) direction.
2. **Custom Animations**: Items like `wheelchair` and `tool_rod` trigger a `"No composed animation"` error because custom animations are skipped by standard animation meta extraction.
3. **Missing Spritesheets**: Legacy catalog entries define items/variants for which PNG files do not exist, causing compose failures.
4. **Placeholder PNGs**: Assets like the child cat ears exist in the filesystem but are fully transparent/blank templates, yielding `empty` bounds.

### Goals:
- **Build-Time Prevention (Static Validator)**: Scan all catalog entries and verify their physical assets. Distinguish between critical missing assets (e.g., body layers) and optional accessory warnings to protect CI builds.
- **Runtime Resilience (Runtime Guard)**: Gracefully handle missing/unloaded optional layers during composition instead of raising fatal errors.
- **Audit Robustness**: Upgrade the audit runner to fallback to alternate directions (for back-worn items) and support custom animation geometries (for wheelchair, tool_rod).

---

## 2. Architecture & Component Design

### 2.1 Static Asset Validator
A new validator module will be introduced in the core package:
- **Location**: `packages/core/src/validation/asset-validator.ts`
- **Functionality**:
  - Iterate through all items in the catalog.
  - Resolve the spritesheet path declarations for all supported body types and variants.
  - Check physical file existence.
  - Identify blank placeholder files (files `< 1KB` with fully transparent pixel data).
  - Categorize failures:
    - **Critical Error**: Base body layers (`type_name === 'body'`) missing or blank.
    - **Warning**: Accessory, clothing, hair, or tool layers missing or blank.
  - **CLI Runner**: Add a script `packages/web/scripts/validate-assets.ts` (mapped to `pnpm validate-assets`) that runs after `prepare-assets`. If a `Critical Error` is found, exit with status `1` to block the CI build. If only `Warnings` are found, print details and exit with status `0`.

### 2.2 Runtime Guard in Compose Engine
Modify the image loading inside `composeSelections`:
- **Location**: `packages/core/src/compose.ts`
- **Behavior**:
  - When loading standard layers or custom layers, if `adapter.loadImage` throws (indicating a missing file), log a warning to the console, register the missing path in the sheet meta metadata (e.g. `missingPaths`), but do not let the exception reject the composition promise.
  - Skip rendering that layer and proceed with compiling the rest of the sheet.

### 2.3 Audit Runner Upgrades
Modify the audit runner and library:
- **Location**: `packages/web/scripts/thumbnail-visible-bounds-audit-lib.ts`
- **Behavior**:
  - **Custom Animation support**: If `sheet.animations` is empty, check `sheet.customAnimations`. If a custom animation exists, extract it and compute its bounds using the custom region's `frameSize` (e.g. 128px or 192px) and direction layout row.
  - **Multi-directional Fallback**: Instead of hardcoding `direction: 'down'`, iterate over `['down', 'up', 'left', 'right']`. Use the first direction that yields non-empty alpha bounds. Record the final chosen direction in the audit result.

---

## 3. Classification & Empty Rules

### 3.1 Severity Levels
| Type Name (`type_name`) | Failure Type | Severity Level | CI Behavior |
| --- | --- | --- | --- |
| `body` | Missing PNG file | **Critical Error** | Blocks Build (Exit Code 1) |
| `body` | Fully transparent PNG | **Critical Error** | Blocks Build (Exit Code 1) |
| Any other type (e.g. `clothes`, `hair`, `hat`, `weapon`) | Missing PNG file | **Warning** | Log Warning (Exit Code 0) |
| Any other type (e.g. `clothes`, `hair`, `hat`, `weapon`) | Fully transparent PNG | **Warning** | Log Warning (Exit Code 0) |

### 3.2 Blank Placeholder Check
A PNG file is flagged as an empty placeholder if:
1. File size is `< 1024` bytes, AND
2. Decoding the image (using the canvas adapter) reveals that all pixels in the image have an alpha channel value of `0`.

---

## 4. Testing Plan

### 4.1 Unit Tests
- **Asset Validator**: Verify critical errors are thrown for missing body sheets, and warnings are logged for missing shirts. Test empty placeholder detection with a mock transparent PNG.
- **Runtime Guard**: Unit-test `composeSelections` with a mock adapter that fails to load an optional accessory. Verify the final composed sheet is produced successfully (excluding that accessory) and console logs a warning.
- **Audit Runner**: Test `runAuditCase` against a mock backpack selection (verifying it falls back to `up` direction) and a mock wheelchair selection (verifying it successfully parses the 64px custom animation block).
