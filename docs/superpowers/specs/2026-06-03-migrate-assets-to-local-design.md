# Spec: Migrate LPC Assets to Local Repository

## Status
- **Date**: 2026-06-03
- **Author**: Antigravity
- **Status**: Approved

## 1. Problem Statement
Currently, sheet definitions (JSON), palette definitions (JSON), spritesheets (PNG), and attribution metadata (`CREDITS.csv`) are loaded directly from the read-only `upstream/` Git submodule. 
To make the toolkit fully self-contained, independent of submodule state for runtime and compilation, and to store all assets locally in the project's repository, we want to migrate these assets to a local directory tracked in Git.

However, to maintain the integrity of our pixel-by-pixel Playwright E2E parity tests (`test:e2e:parity`), we must still be able to start the reference upstream server.

## 2. Proposed Architecture

### 2.1 Asset Directory Layout
We will copy the required assets from the `upstream/` submodule into a new root-level `/assets/` directory:

```
/ (repository root)
├── assets/
│   ├── sheet_definitions/       # Copy of upstream/sheet_definitions/
│   ├── palette_definitions/     # Copy of upstream/palette_definitions/
│   ├── spritesheets/           # Copy of upstream/spritesheets/
│   └── CREDITS.csv             # Copy of upstream/CREDITS.csv
├── upstream/                   # Kept as Git submodule (used ONLY for E2E parity server)
├── packages/
│   ├── core/
│   └── web/
```

### 2.2 Git Configuration
- The `/assets/` directory will be added to Git tracking (this will add ~606 MB of JSON, PNG, and CSV files).
- The `upstream/` submodule will remain in the repository, but will only be used in the test suite and CI workflows.

## 3. Detailed Changes

### 3.1 Packages & Source Files
1. **`packages/web/src/catalog/load-catalog.ts`**
   - Update Vite glob to target `../../../../assets/sheet_definitions/**/*.json`.
   - Update prefix constant: `const ASSETS_PREFIX = 'assets/sheet_definitions/';`.
2. **`packages/web/src/catalog/load-palettes.ts`**
   - Update Vite glob to target `../../../../assets/palette_definitions/**/*.json`.
   - Update prefix constant: `const ASSETS_PREFIX = 'assets/palette_definitions/';`.

### 3.2 Script Updates
1. **`packages/web/scripts/copy-spritesheets.ts`**
   - Update `sheetDefsDir` to `assets/sheet_definitions`.
   - Update `spritesSrc` to `assets/spritesheets`.
   - Update checks to reference `assets/` instead of `upstream/`.
2. **`packages/web/scripts/gen-i18n-data.ts`**
   - Update `sheetDefsDir` to `assets/sheet_definitions`.
   - Update checks to reference `assets/` instead of `upstream/`.

### 3.3 Core Test Updates
Update path joins pointing to `../../../upstream/...` to reference `../../../assets/...` in the following files:
- `packages/core/test/catalog.test.ts`
- `packages/core/test/compose.test.ts`
- `packages/core/test/credits.test.ts`
- `packages/core/test/hash.test.ts`
- `packages/core/test/palettes.test.ts`
- `packages/core/test/recolor-resolve.test.ts`
- `packages/core/test/helpers/node-canvas-adapter.ts`

### 3.4 Playwright Parity Tests & CI
- `packages/web/playwright.parity.config.ts` will continue to start the upstream dev server via `pnpm --dir ../../upstream dev` on port 5174.
- GitHub Actions workflow (`ci.yml`) will continue checking out submodules and running `npm ci` in `upstream/` to boot the dev server.

## 4. Verification Plan

### 4.1 Setup & Execution
1. Copy all assets from `upstream/` to `/assets/` locally.
2. Verify `/assets/` directory size and contents (~606 MB).
3. Apply code and test changes.
4. Run scripts to verify they use `/assets/`:
   - `pnpm --filter @lpc-toolkit/web gen-i18n`
   - `pnpm --filter @lpc-toolkit/web copy-sprites`
5. Run core unit tests to verify behavior:
   - `pnpm --filter @lpc-toolkit/core test`
6. Run integration and E2E tests:
   - `pnpm --filter @lpc-toolkit/web test`
   - `pnpm --filter @lpc-toolkit/web test:e2e`
   - `pnpm --filter @lpc-toolkit/web test:e2e:parity`
