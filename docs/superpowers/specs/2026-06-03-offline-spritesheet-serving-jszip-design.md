# Spec: Offline Spritesheet Serving - JSZip Category Packages

## Status
- **Date**: 2026-06-03
- **Author**: Antigravity
- **Status**: Approved

## 1. Problem Statement
Currently, the LPC character composer loads only a small 28.8 MB subset of spritesheets locally to avoid Vercel and Git deployment size/file-count limitations. When a user randomizes outfits, missing assets trigger a fallback to `https://liberatedpixelcup.github.io/...` (the upstream CDN).

To make the app completely independent of the upstream server in development and production (on Vercel), we want to serve spritesheets locally:
- **In Development**: Access the full `/assets/spritesheets/` directory instantly without copying files via a Vite Dev Server local proxy plugin.
- **In Production (ZIP Mode)**: Package spritesheets into category ZIP archives and dynamically extract files in the browser on-demand using JSZip. This avoids Vercel's static file count limits (combining 145,000 PNG files into ~20 zip files) and makes the production build 100% self-contained on Vercel.

## 2. Proposed Architecture

### 2.1 Developer Experience: Vite Local Proxy
A custom Vite Dev Server plugin (`localSpritesheetsPlugin`) will intercept any request for `/spritesheets/*` in development. If the requested file exists in `/assets/spritesheets/` at the repository root, it will serve it directly.

### 2.2 Production: JSZip Category ZIP Mode
We will add a new `'zip'` option to `AssetSource`.
- **Build Step**: A script (`packages/web/scripts/zip-assets.ts`) will compress directories under `/assets/spritesheets/` into corresponding zip files in `packages/web/public/zips/` (e.g. `feet.zip`, `hair.zip`).
- **Runtime Step**: When the client requests an image (e.g. `spritesheets/feet/male/walk.png`) in `'zip'` mode:
  1. Identify the category (`feet`) and sub-path (`male/walk.png`).
  2. Download `public/zips/feet.zip` via `fetch` on first access.
  3. Load and parse the zip in-memory using `JSZip`.
  4. Extract the file as a Blob, create a Blob URL (`URL.createObjectURL`), and resolve it.
  5. Cache the parsed JSZip instance in memory for subsequent requests.

## 3. Detailed Changes

### 3.1 Vite Configurations
- **`packages/web/vite.config.ts`**:
  - Add `localSpritesheetsPlugin` middleware.

### 3.2 Assets Packaging Script
- **`packages/web/scripts/zip-assets.ts`**:
  - Create script to package categories from `../../assets/spritesheets` into `public/zips/`.
- **`packages/web/package.json`**:
  - Add `"zip-assets"` scripts and modify build chains to execute `pnpm zip-assets` after `pnpm copy-sprites`.

### 3.3 Web App Source Files
- **`packages/web/src/adapter/asset-source.ts`**:
  - Update `AssetSource` type definition to include `'zip'`.
- **`packages/web/src/adapter/zip-loader.ts`**:
  - Implement on-demand category ZIP download, JSZip parsing, and Blob URL extraction.
- **`packages/web/src/adapter/browser-canvas-adapter.ts`**:
  - Update `loadImage` to use `loadFileFromZip` when `source === 'zip'`, and revoke Blob URLs after the images finish loading.
- **`packages/web/src/components/layer-stack/settings-collapsible.tsx`**:
  - Update UI selectors to show the `'zip'` option.
- **`packages/web/src/i18n.ts`**:
  - Add `'assetSource.zip'` and `'assetSource.zipHelp'` key translations in English and Chinese.

## 4. Verification Plan

### 4.1 Development Verification
1. Run `pnpm dev`.
2. Open settings and select "Auto" mode.
3. Click "Random" to verify that all assets load from `/assets/spritesheets/` via the dev server middleware with no 404 errors or remote requests.

### 4.2 ZIP Mode Verification
1. Run `pnpm zip-assets`.
2. Verify that zip files are generated in `packages/web/public/zips/` (e.g. `feet.zip`, `hair.zip`).
3. Run `pnpm dev`, open settings, and select "ZIP Archive" mode.
4. Click "Random" and verify in the Network tab that category zips are downloaded on-demand (once per category), and the sprite layers are rendered from blob URLs (`blob:http://...`).
