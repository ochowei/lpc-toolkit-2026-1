# Spec: Offline Spritesheet Serving - Cloudflare R2 Fallback Integration

## Status
- **Date**: 2026-06-03
- **Author**: Antigravity
- **Status**: Approved

## 1. Problem Statement
Currently, when a user randomizes outfits, missing assets in the local 28.8 MB subset trigger a fallback to `https://liberatedpixelcup.github.io/...` (the upstream CDN). We want to completely decouple from the upstream project in production.

To achieve this on Vercel while keeping assets size-friendly, we can host the full 600 MB of spritesheets and definitions on a private **Cloudflare R2 bucket** (which has free bandwidth and a generous 10M reads/month free tier) and update the app to fallback to this custom endpoint.

## 2. Proposed Architecture
We will configure the app to read a custom spritesheet base URL from an environment variable. If configured, any fallback request (triggered by a local 404 in `'auto'` or `'upstream'` asset source modes) will resolve to your private R2 bucket endpoint instead of the upstream project domain.

## 3. Detailed Changes

### 3.1 Web App Source Files
- **`packages/web/src/adapter/asset-source.ts`**:
  - Update `UPSTREAM_SPRITESHEET_BASE_URL` to check for `import.meta.env.VITE_SPRITESHEETS_BASE_URL` at compile/build time:
    ```typescript
    /** Public spritesheet domain (defaults to R2 or custom CDN, falls back to upstream) */
    export const UPSTREAM_SPRITESHEET_BASE_URL =
      import.meta.env.VITE_SPRITESHEETS_BASE_URL ||
      'https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/';
    ```

## 4. Operational Instructions: Cloudflare R2 Upload
To set up your R2 bucket:
1. Create an R2 bucket in your Cloudflare dashboard (e.g. `lpc-assets`).
2. Configure bucket access to "Public" or set up a custom domain to obtain your public bucket base URL (e.g. `https://pub-xxxx.r2.dev/`).
3. Upload the folders `/assets/spritesheets/` and `/assets/sheet_definitions/` directly to R2:
   - Drag and drop them into the Cloudflare browser dashboard.
   - Or use AWS CLI synchronized command:
     ```bash
     aws s3 sync assets/ s3://lpc-assets/ --endpoint-url https://<cloudflare-account-id>.r2.cloudflarestorage.com
     ```
4. Set the Vercel environment variable `VITE_SPRITESHEETS_BASE_URL` to your public R2 bucket URL (with a trailing slash) in the Vercel project dashboard.

## 5. Verification Plan
1. Set the environment variable locally in a `.env.local` file:
   ```env
   VITE_SPRITESHEETS_BASE_URL=https://my-r2-test-endpoint.dev/
   ```
2. Build or start the application.
3. Verify that `resolveUpstreamSpriteUrl('spritesheets/a.png')` returns `https://my-r2-test-endpoint.dev/spritesheets/a.png` in unit tests.
