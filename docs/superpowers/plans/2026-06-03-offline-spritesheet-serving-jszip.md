# Offline Spritesheet Serving - JSZip Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement offline serving of spritesheets using local dev server middleware in development and dynamic category-level ZIP archive loaders (JSZip) in production to run 100% independent of upstream on Vercel.

**Architecture:** Inject local proxy middleware in `vite.config.ts` to map `/spritesheets/` to root `/assets/spritesheets/`. Create a build script to package `/assets/spritesheets/` folders into zip files inside `public/zips/`. Implement a browser on-demand downloader and cache in `zip-loader.ts` to extract PNGs as Blob URLs in the browser.

---

### Task 1: Vite Dev Server Local Proxy Middleware

**Files:**
- Modify: `packages/web/vite.config.ts`

- [ ] **Step 1: Implement localSpritesheetsPlugin in Vite config**

Modify [packages/web/vite.config.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/vite.config.ts):
Add the `localSpritesheetsPlugin` middleware inside the Vite config to serve `/spritesheets/*` requests from `/assets/spritesheets/*` during development:

```typescript
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function localSpritesheetsPlugin() {
  return {
    name: 'local-spritesheets-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/spritesheets/')) {
          const pathname = req.url.split('?')[0];
          const filePath = join(__dirname, '../../assets', pathname);
          
          if (existsSync(filePath)) {
            res.setHeader('Content-Type', 'image/png');
            res.end(readFileSync(filePath));
            return;
          }
        }
        next();
      });
    }
  };
}

// Inside defineConfig:
export default defineConfig({
  plugins: [react(), tailwindcss(), localSpritesheetsPlugin()],
  // ...
```

- [ ] **Step 2: Verify local server fallback**

1. Start the dev server: `pnpm --filter @lpc-toolkit/web dev`
2. Open a browser and fetch a file not present in `public/spritesheets/` but present in `assets/spritesheets/` (e.g. `http://localhost:5173/spritesheets/neck/necklace/beaded_small/male/walk.png`).
3. Expected: The image loads successfully in the browser (returns HTTP 200 instead of 404).

- [ ] **Step 3: Commit changes**

Run:
```bash
git add packages/web/vite.config.ts
git commit -m "feat: serve full assets directory via Vite dev server proxy"
```

---

### Task 2: Assets Packaging Script (zip-assets.ts)

**Files:**
- Create: `packages/web/scripts/zip-assets.ts`
- Modify: `packages/web/package.json`

- [ ] **Step 1: Write zip-assets script**

Create `packages/web/scripts/zip-assets.ts` to zip directories under `assets/spritesheets/` using `jszip` and write them to `packages/web/public/zips/`:

```typescript
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const srcDir = path.join(repoRoot, 'assets/spritesheets');
const destDir = path.join(here, '../public/zips');

if (!existsSync(srcDir)) {
  console.error('[zip-assets] assets/spritesheets not found.');
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });

function walkFiles(dir: string, base = dir): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full, base));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

const categories = readdirSync(srcDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

console.log(`[zip-assets] Packaging ${categories.length} categories to public/zips/...`);

for (const cat of categories) {
  const catDir = path.join(srcDir, cat);
  const zip = new JSZip();
  const files = walkFiles(catDir);

  for (const f of files) {
    const relPath = path.relative(catDir, f).split(path.sep).join('/');
    zip.file(relPath, readFileSync(f));
  }

  const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const outFile = path.join(destDir, `${cat}.zip`);
  writeFileSync(outFile, content);
  console.log(`  - wrote ${cat}.zip (~${(content.length / 1e6).toFixed(2)} MB)`);
}

console.log('[zip-assets] Done!');
```

- [ ] **Step 2: Add script command to package.json**

Modify [packages/web/package.json](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/package.json) to add `"zip-assets"` and modify build chains:
```json
  "scripts": {
    "zip-assets": "tsx scripts/zip-assets.ts",
    "prebuild": "pnpm --filter @lpc-toolkit/core build && tsx scripts/copy-spritesheets.ts && pnpm zip-assets",
    "pretest": "tsx scripts/copy-spritesheets.ts && pnpm zip-assets",
    "pretest:e2e": "tsx scripts/copy-spritesheets.ts && pnpm zip-assets",
    "pretest:e2e:parity": "tsx scripts/copy-spritesheets.ts && pnpm zip-assets"
  }
```

- [ ] **Step 3: Run zip-assets script**

Run:
```bash
pnpm --filter @lpc-toolkit/web zip-assets
```
Expected: Output lists zip generation. Verify `packages/web/public/zips/` exists and contains category files (e.g. `feet.zip` and `hair.zip`).

- [ ] **Step 4: Commit changes**

Run:
```bash
git add packages/web/scripts/zip-assets.ts packages/web/package.json
git commit -m "chore: add zip-assets script and package assets for production"
```

---

### Task 3: Browser ZIP Loading Engine

**Files:**
- Create: `packages/web/src/adapter/zip-loader.ts`

- [ ] **Step 1: Write browser zip-loader module**

Create `packages/web/src/adapter/zip-loader.ts` to fetch and parse category archives on demand, and extract individual images:

```typescript
import JSZip from 'jszip';

const zipCache = new Map<string, JSZip>();
const downloadPromises = new Map<string, Promise<JSZip>>();

export function clearZipCacheForTests(): void {
  zipCache.clear();
  downloadPromises.clear();
}

export async function loadFileFromZip(path: string, baseHref: string): Promise<string> {
  const cleanPath = path.replace(/^spritesheets\//, '');
  const parts = cleanPath.split('/');
  const category = parts[0];
  const subPath = parts.slice(1).join('/');

  let zip = zipCache.get(category);
  if (!zip) {
    let promise = downloadPromises.get(category);
    if (!promise) {
      promise = (async () => {
        const zipUrl = new URL(`zips/${category}.zip`, baseHref).href;
        const res = await fetch(zipUrl);
        if (!res.ok) {
          throw new Error(`Failed to download ZIP: ${zipUrl} (HTTP ${res.status})`);
        }
        const buffer = await res.arrayBuffer();
        const newZip = await JSZip.loadAsync(buffer);
        zipCache.set(category, newZip);
        return newZip;
      })();
      downloadPromises.set(category, promise);
    }
    zip = await promise;
  }

  const file = zip.file(subPath);
  if (!file) {
    throw new Error(`File ${subPath} not found in zip archive ${category}.zip`);
  }

  const blob = await file.async('blob');
  return URL.createObjectURL(blob);
}
```

- [ ] **Step 2: Commit changes**

Run:
```bash
git add packages/web/src/adapter/zip-loader.ts
git commit -m "feat: add browser zip-loader engine for dynamic sprite extraction"
```

---

### Task 4: Adapter & UI Settings Integration

**Files:**
- Modify: `packages/web/src/adapter/asset-source.ts`
- Modify: `packages/web/src/adapter/browser-canvas-adapter.ts`
- Modify: `packages/web/src/components/layer-stack/settings-collapsible.tsx`
- Modify: `packages/web/src/i18n.ts`

- [ ] **Step 1: Extend AssetSource type and translations**

In `packages/web/src/adapter/asset-source.ts`, add `'zip'` to the type:
```typescript
export type AssetSource = 'auto' | 'local' | 'upstream' | 'zip';
```

In `packages/web/src/i18n.ts`, add English and Chinese keys for `'assetSource.zip'` and `'assetSource.zipHelp'`:
- Under `en`:
  ```typescript
      'assetSource.zip': 'ZIP Archive',
      'assetSource.zipHelp': 'Loads all assets on-demand from local category ZIP archives.',
  ```
- Under `zh-TW`:
  ```typescript
      'assetSource.zip': 'ZIP 壓縮包',
      'assetSource.zipHelp': '按需從本地的分類 ZIP 檔案中動態載入（完全本地化）。',
  ```

- [ ] **Step 2: Integrate ZIP mode in settings UI**

Modify `packages/web/src/components/layer-stack/settings-collapsible.tsx` line 192 to render `'zip'`:
```typescript
            <div className="flex gap-1">
              {(['auto', 'local', 'upstream', 'zip'] as const).map((src) => (
                <Button
```

- [ ] **Step 3: Update browser-canvas-adapter to route to zip-loader**

Modify `packages/web/src/adapter/browser-canvas-adapter.ts` to call `loadFileFromZip` for zip source:

Import the loader:
```typescript
import { loadFileFromZip } from './zip-loader';
```

And in `loadImage`:
```typescript
    async loadImage(path: string): Promise<ImageLike> {
      if (source === 'zip') {
        const url = await loadFileFromZip(path, document.baseURI);
        const release = await sharedFetchSemaphore.acquire();
        return new Promise<ImageLike>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            release();
            URL.revokeObjectURL(url); // Clean up Blob URL to prevent memory leak
            resolve(img as unknown as ImageLike);
          };
          img.onerror = (e) => {
            release();
            URL.revokeObjectURL(url);
            reject(new Error(`Failed to load image from ZIP Blob URL: ${url} (Error: ${String(e)})`));
          };
          img.src = url;
        });
      }
      
      const urls = resolveSpriteUrlCandidates(path, document.baseURI, source);
      // Existing local/fallback fetch logic...
```

- [ ] **Step 4: Verify ZIP mode works locally**

1. Run `pnpm dev`.
2. Open settings collapsible panel.
3. Select "ZIP 壓縮包" source.
4. Click "Random" several times.
5. In the Network tab, verify that `.zip` files (e.g. `hair.zip`, `legs.zip`) are downloaded on-demand and cached in memory.
6. Verify that character renders perfectly from blob URLs (`blob:http://...`).

- [ ] **Step 5: Run web unit tests**

Run:
```bash
pnpm --filter @lpc-toolkit/web test
```
Expected: All tests pass.

- [ ] **Step 6: Commit changes**

Run:
```bash
git add packages/web/src/adapter/asset-source.ts packages/web/src/adapter/browser-canvas-adapter.ts packages/web/src/components/layer-stack/settings-collapsible.tsx packages/web/src/i18n.ts
git commit -m "feat: integrate ZIP mode into browser adapter, UI settings, and translations"
```
