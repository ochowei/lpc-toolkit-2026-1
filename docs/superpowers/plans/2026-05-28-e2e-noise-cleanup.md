# E2E Random-Click Noise Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `pnpm --filter @lpc-toolkit/web test:e2e` exit 0 in local dev mode by fixing root causes for each noise class (URL-driven `assetSource=local`, fetch concurrency throttle, collector listener overhaul, catalog emit-once + narrow allowlist).

**Architecture:** Five surgical changes to the web package: one small new helper for URL-driven asset source, one semaphore inside `browser-canvas-adapter.ts`, one module-level flag in `load-catalog.ts`, a four-channel rewrite of `console-collector.ts` (response + requestfailed split, browser-auto filter, narrow allowlists), and a one-line URL change in the e2e spec. No upstream/, no new dependencies, no CI changes.

**Tech Stack:** TypeScript strict (incl. `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`), React 18, Vite 6, Vitest 1.x (node environment), Playwright 1.60.

**Reference spec:** `docs/superpowers/specs/2026-05-28-e2e-noise-cleanup-design.md`

---

## File Structure

Files this plan creates or modifies:

| Path | Status | Responsibility |
|---|---|---|
| `packages/web/src/lib/asset-source-from-url.ts` | Create | Validate and parse `?assetSource=` query param |
| `packages/web/test/asset-source-from-url.test.ts` | Create | Unit tests for the helper |
| `packages/web/src/App.tsx` | Modify | Use the helper in `useState` initializer |
| `packages/web/src/adapter/browser-canvas-adapter.ts` | Modify | Per-adapter fetch semaphore; export `createFetchSemaphore` for tests |
| `packages/web/test/browser-canvas-adapter.test.ts` | Modify | Add concurrency-limit assertion |
| `packages/web/src/catalog/load-catalog.ts` | Modify | Extract `emitCatalogWarningsOnce` + module-level flag + reset hook |
| `packages/web/test/load-catalog.test.ts` | Modify | Add emit-once tests using `console.warn` spy |
| `packages/web/e2e/helpers/console-collector.ts` | Rewrite | Four-channel architecture, browser-auto filter, narrow allowlist, sprite-path skip |
| `packages/web/test/console-collector-filters.test.ts` | Create | Unit tests for the pure filter predicates |
| `packages/web/e2e/random-no-console-errors.spec.ts` | Modify | Visit `/?assetSource=local` |

No upstream/, package.json, lockfile, vite.config.ts, vitest.config.ts, tsconfig.json, or CI workflow changes.

---

## Task 1: `assetSourceFromUrl` helper

**Files:**
- Create: `packages/web/src/lib/asset-source-from-url.ts`
- Test: `packages/web/test/asset-source-from-url.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/web/test/asset-source-from-url.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assetSourceFromUrl } from '../src/lib/asset-source-from-url';

describe('assetSourceFromUrl', () => {
  it('returns the parsed value when assetSource is "local"', () => {
    expect(assetSourceFromUrl('?assetSource=local')).toBe('local');
  });

  it('returns the parsed value when assetSource is "upstream"', () => {
    expect(assetSourceFromUrl('?assetSource=upstream')).toBe('upstream');
  });

  it('returns the parsed value when assetSource is "auto"', () => {
    expect(assetSourceFromUrl('?assetSource=auto')).toBe('auto');
  });

  it('returns undefined when assetSource is absent', () => {
    expect(assetSourceFromUrl('')).toBeUndefined();
    expect(assetSourceFromUrl('?foo=bar')).toBeUndefined();
  });

  it('returns undefined when assetSource is not a valid value', () => {
    expect(assetSourceFromUrl('?assetSource=invalid')).toBeUndefined();
    expect(assetSourceFromUrl('?assetSource=')).toBeUndefined();
    expect(assetSourceFromUrl('?assetSource=LOCAL')).toBeUndefined();
  });

  it('accepts a leading ? or no leading ?', () => {
    expect(assetSourceFromUrl('?assetSource=local')).toBe('local');
    expect(assetSourceFromUrl('assetSource=local')).toBe('local');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @lpc-toolkit/web test asset-source-from-url
```

Expected: tests fail with "Cannot find module '../src/lib/asset-source-from-url'" or similar.

- [ ] **Step 3: Implement the helper**

Create `packages/web/src/lib/asset-source-from-url.ts`:

```ts
import type { AssetSource } from '../adapter/asset-source';

const VALID_VALUES: readonly AssetSource[] = ['auto', 'local', 'upstream'];

/**
 * Parse a URL search-string and return the validated `assetSource` value
 * if present, or undefined if absent / invalid. Intended for e2e tests
 * (and any future opt-in deep-link); not exposed in the UI.
 */
export function assetSourceFromUrl(search: string): AssetSource | undefined {
  const value = new URLSearchParams(search).get('assetSource');
  if (value === null) return undefined;
  return (VALID_VALUES as readonly string[]).includes(value)
    ? (value as AssetSource)
    : undefined;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm --filter @lpc-toolkit/web test asset-source-from-url
```

Expected: 6 tests pass.

- [ ] **Step 5: Typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/lib/asset-source-from-url.ts packages/web/test/asset-source-from-url.test.ts
git commit -m "feat(web): add assetSourceFromUrl helper for URL-driven override"
```

---

## Task 2: Wire helper into `App.tsx`

**Files:**
- Modify: `packages/web/src/App.tsx`

- [ ] **Step 1: Edit App.tsx**

In `packages/web/src/App.tsx`, find the existing `useState<AssetSource>('auto')` line (around line 24) and modify to read from URL first.

**Add import** (after line 14 `import type { AssetSource } from './adapter/asset-source';`):

```ts
import { assetSourceFromUrl } from './lib/asset-source-from-url';
```

**Change** the `useState` initializer from:

```ts
const [assetSource, setAssetSource] = useState<AssetSource>('auto');
```

to:

```ts
const [assetSource, setAssetSource] = useState<AssetSource>(
  () => assetSourceFromUrl(window.location.search) ?? 'auto',
);
```

- [ ] **Step 2: Typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: exits 0.

- [ ] **Step 3: Run unit tests to confirm nothing else broke**

Run:

```bash
pnpm --filter @lpc-toolkit/web test
```

Expected: all tests pass (no test directly covers App.tsx, this is a smoke check).

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/App.tsx
git commit -m "feat(web): read assetSource from URL search param on App init"
```

---

## Task 3: Concurrency-limited `loadImage`

**Files:**
- Modify: `packages/web/src/adapter/browser-canvas-adapter.ts`
- Test: `packages/web/test/browser-canvas-adapter.test.ts`

- [ ] **Step 1: Write the failing concurrency test**

Open `packages/web/test/browser-canvas-adapter.test.ts`. After the existing `describe('createBrowserCanvasAdapter', ...)` test, add a new test inside the same `describe`:

```ts
  it('limits concurrent fetches to 6 in-flight calls', async () => {
    let active = 0;
    let peakActive = 0;
    const totalRequests = 20;
    const releaseControllers: Array<() => void> = [];

    const blob = new Blob(['image']);
    const bitmap = { width: 1, height: 1 };
    const documentStub = { baseURI: 'http://x/' } satisfies Pick<
      Document,
      'baseURI'
    >;

    const fetchMock = vi.fn<(url: string) => Promise<Response>>().mockImplementation(
      async () => {
        active++;
        if (active > peakActive) peakActive = active;
        await new Promise<void>((resolve) => releaseControllers.push(resolve));
        active--;
        return new Response(blob);
      },
    );
    const createImageBitmapMock = vi
      .fn<(image: Blob) => Promise<ImageBitmap>>()
      .mockResolvedValue(bitmap as ImageBitmap);

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);
    vi.stubGlobal('document', documentStub);

    try {
      const adapter = createBrowserCanvasAdapter('local');
      const pending = Array.from({ length: totalRequests }, (_, i) =>
        adapter.loadImage(`spritesheets/img-${i}.png`),
      );
      // Give microtasks a chance to schedule.
      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      expect(peakActive).toBeLessThanOrEqual(6);
      expect(peakActive).toBeGreaterThan(0);
      expect(releaseControllers.length).toBeLessThanOrEqual(6);

      // Drain: release all queued fetches one by one.
      while (releaseControllers.length > 0) {
        const next = releaseControllers.shift();
        if (next) next();
        await new Promise<void>((resolve) => setTimeout(resolve, 1));
      }
      await Promise.all(pending);

      expect(fetchMock).toHaveBeenCalledTimes(totalRequests);
      expect(peakActive).toBeLessThanOrEqual(6);
    } finally {
      vi.unstubAllGlobals();
    }
  });
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
pnpm --filter @lpc-toolkit/web test browser-canvas-adapter
```

Expected: the new concurrency test FAILS (peakActive would be 20, not ≤ 6 — current adapter has no throttle).

- [ ] **Step 3: Implement the semaphore**

Open `packages/web/src/adapter/browser-canvas-adapter.ts`. Replace its current contents with:

```ts
import type {
  CanvasAdapter,
  CanvasLike,
  ImageLike,
} from '@lpc-toolkit/core';
import {
  resolveLocalSpriteUrl,
  resolveSpriteUrlCandidates,
  type AssetSource,
} from './asset-source';

/**
 * Core hands us paths like `spritesheets/body/bodies/male/walk.png` (it
 * prepends `spritesheets/` itself — see compose.ts). We serve the copied
 * subset from Vite's `public/`, so resolve relative to the document base.
 * Pure + DOM-free so it is unit-testable.
 */
export function resolveSpriteUrl(path: string, baseHref: string): string {
  return resolveLocalSpriteUrl(path, baseHref);
}

// Chromium enforces a per-origin HTTP/1.1 limit of 6 simultaneous connections.
// In Vite dev (HTTP/1.1) a random-outfit render fires hundreds of `fetch()`
// calls; without a throttle the excess get `net::ERR_INSUFFICIENT_RESOURCES`.
// Production runs over HTTP/2 multiplexing where this limit is irrelevant.
const FETCH_CONCURRENCY = 6;

interface FetchSemaphore {
  acquire(): Promise<() => void>;
}

export function createFetchSemaphore(limit: number): FetchSemaphore {
  let active = 0;
  const queue: Array<() => void> = [];
  return {
    async acquire(): Promise<() => void> {
      if (active >= limit) {
        await new Promise<void>((resolve) => queue.push(resolve));
      }
      active++;
      return () => {
        active--;
        const next = queue.shift();
        if (next) next();
      };
    },
  };
}

export function createBrowserCanvasAdapter(
  source: AssetSource = 'local',
): CanvasAdapter {
  const semaphore = createFetchSemaphore(FETCH_CONCURRENCY);

  return {
    createCanvas(width: number, height: number): CanvasLike {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      return c as unknown as CanvasLike;
    },
    async loadImage(path: string): Promise<ImageLike> {
      const urls = resolveSpriteUrlCandidates(path, document.baseURI, source);
      const errors: string[] = [];

      for (const url of urls) {
        const release = await semaphore.acquire();
        try {
          const res = await fetch(url);
          if (!res.ok) {
            errors.push(`${url}: HTTP ${res.status}`);
            continue;
          }
          const blob = await res.blob();
          return (await createImageBitmap(blob)) as unknown as ImageLike;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${url}: ${message}`);
        } finally {
          release();
        }
      }

      throw new Error(`loadImage failed for ${path}: ${errors.join('; ')}`);
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm --filter @lpc-toolkit/web test browser-canvas-adapter
```

Expected: both tests pass (the original "tries the local sprite URL before the upstream URL in auto mode" and the new concurrency test).

- [ ] **Step 5: Typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/adapter/browser-canvas-adapter.ts packages/web/test/browser-canvas-adapter.test.ts
git commit -m "feat(web): throttle adapter loadImage fetch to 6 concurrent in-flight"
```

---

## Task 4: Catalog warning emit-once guard

**Files:**
- Modify: `packages/web/src/catalog/load-catalog.ts`
- Test: `packages/web/test/load-catalog.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `packages/web/test/load-catalog.test.ts`. Replace the imports line and add a new describe block:

**Existing import (line 3-6):**

```ts
import {
  normalizeUpstreamKey,
  recordsToCatalog,
} from '../src/catalog/load-catalog';
```

Change to:

```ts
import {
  __resetCatalogWarningOnceForTests,
  emitCatalogWarningsOnce,
  normalizeUpstreamKey,
  recordsToCatalog,
} from '../src/catalog/load-catalog';
```

Then add a new describe block at the bottom of the file (after the `normalizeUpstreamKey` describe):

```ts
describe('emitCatalogWarningsOnce', () => {
  beforeEach(() => {
    __resetCatalogWarningOnceForTests();
  });

  it('emits one console.warn with the count and the array when first called', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const warnings = [{ kind: 'x' }, { kind: 'y' }] as const;

    emitCatalogWarningsOnce(warnings);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('[catalog] 2 load warning(s)', warnings);
    spy.mockRestore();
  });

  it('does not emit on subsequent calls within the same module load', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    emitCatalogWarningsOnce([{ kind: 'x' }] as const);
    emitCatalogWarningsOnce([{ kind: 'y' }] as const);
    emitCatalogWarningsOnce([{ kind: 'z' }] as const);

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('does not emit when given an empty warnings list', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    emitCatalogWarningsOnce([]);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('emits after __resetCatalogWarningOnceForTests is called', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    emitCatalogWarningsOnce([{ kind: 'x' }] as const);
    expect(spy).toHaveBeenCalledTimes(1);

    __resetCatalogWarningOnceForTests();
    emitCatalogWarningsOnce([{ kind: 'y' }] as const);

    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
```

Also at the top of the file, add the missing imports — change:

```ts
import { describe, expect, it } from 'vitest';
```

to:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @lpc-toolkit/web test load-catalog
```

Expected: import errors for `__resetCatalogWarningOnceForTests` and `emitCatalogWarningsOnce` — these don't exist yet.

- [ ] **Step 3: Implement emit-once in load-catalog.ts**

Open `packages/web/src/catalog/load-catalog.ts`. Replace its entire contents with:

```ts
import {
  createCatalog,
  type Catalog,
  type CatalogLoadWarning,
  type CreateCatalogResult,
  type FilePath,
  type ItemDefinition,
} from '@lpc-toolkit/core';

export function recordsToCatalog(
  records: Readonly<Record<FilePath, ItemDefinition>>,
): CreateCatalogResult {
  return createCatalog(records);
}

const UPSTREAM_PREFIX = 'upstream/sheet_definitions/';

// Vite's `import.meta.glob` keys are relative to this file
// (e.g. `../../../../upstream/sheet_definitions/headwear/...`). Strip that
// leading noise so `sourcePath` reflects the path inside the upstream root.
export function normalizeUpstreamKey(key: string): string {
  const idx = key.lastIndexOf(UPSTREAM_PREFIX);
  return idx >= 0 ? key.slice(idx + UPSTREAM_PREFIX.length) : key;
}

// Module-level gate: React StrictMode mounts → unmounts → re-mounts the App
// in dev, calling `loadCatalogFromUpstream` twice with identical results.
// Emit upstream data-quality warnings once per session; HMR replacing this
// module naturally resets the flag.
let warningsEmitted = false;

export function emitCatalogWarningsOnce(
  warnings: readonly CatalogLoadWarning[],
): void {
  if (warnings.length === 0 || warningsEmitted) return;
  console.warn(`[catalog] ${warnings.length} load warning(s)`, warnings);
  warningsEmitted = true;
}

/** Test-only hook to reset the emit-once gate between specs. */
export function __resetCatalogWarningOnceForTests(): void {
  warningsEmitted = false;
}

/**
 * Build the catalog from the read-only `upstream/` submodule. The glob is
 * static and relative: from packages/web/src/catalog/ the repo root is four
 * levels up. Vite inlines every matched JSON's default export at build time.
 * If the submodule is not initialized the glob is empty and we throw with a
 * fix instruction (spec §5).
 */
export function loadCatalogFromUpstream(): Catalog {
  // '**/*.json' also matches meta_*.json; createCatalog skips those
  // internally (isMetaFile), so they never become items or warnings.
  const mods = import.meta.glob<ItemDefinition>(
    '../../../../upstream/sheet_definitions/**/*.json',
    { eager: true, import: 'default' },
  );
  const records: Record<FilePath, ItemDefinition> = {};
  for (const [key, def] of Object.entries(mods)) {
    records[normalizeUpstreamKey(key)] = def;
  }

  if (Object.keys(records).length === 0) {
    throw new Error(
      'No sheet definitions found. Run: git submodule update --init',
    );
  }

  const { catalog, warnings } = recordsToCatalog(records);
  emitCatalogWarningsOnce(warnings);
  if (catalog.typeNames.length === 0) {
    throw new Error('Catalog is empty after ingest (all records invalid).');
  }
  return catalog;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @lpc-toolkit/web test load-catalog
```

Expected: all 4 new tests pass plus the existing `recordsToCatalog` and `normalizeUpstreamKey` tests.

- [ ] **Step 5: Typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/catalog/load-catalog.ts packages/web/test/load-catalog.test.ts
git commit -m "feat(web): emit catalog load warnings only once per session"
```

---

## Task 5: Console-collector overhaul

**Files:**
- Rewrite: `packages/web/e2e/helpers/console-collector.ts`
- Create: `packages/web/test/console-collector-filters.test.ts`

- [ ] **Step 1: Write the failing predicate tests**

Create `packages/web/test/console-collector-filters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  isAllowlistedConsoleEntry,
  isBrowserAutoConsoleText,
  isSpriteAssetUrl,
} from '../e2e/helpers/console-collector';

describe('isBrowserAutoConsoleText', () => {
  it('matches HTTP 4xx/5xx auto-emit', () => {
    expect(
      isBrowserAutoConsoleText(
        'Failed to load resource: the server responded with a status of 404 ()',
      ),
    ).toBe(true);
    expect(
      isBrowserAutoConsoleText(
        'Failed to load resource: the server responded with a status of 503 ()',
      ),
    ).toBe(true);
  });

  it('matches net::ERR_* auto-emit', () => {
    expect(
      isBrowserAutoConsoleText('Failed to load resource: net::ERR_FAILED'),
    ).toBe(true);
    expect(
      isBrowserAutoConsoleText(
        'Failed to load resource: net::ERR_INSUFFICIENT_RESOURCES',
      ),
    ).toBe(true);
  });

  it('matches the CORS-policy auto-emit', () => {
    expect(
      isBrowserAutoConsoleText(
        "Access to fetch at 'https://example.com/a.png' from origin 'http://localhost:5173' has been blocked by CORS policy: ...",
      ),
    ).toBe(true);
  });

  it('does not match application-level error text', () => {
    expect(isBrowserAutoConsoleText('TypeError: foo is undefined')).toBe(false);
    expect(isBrowserAutoConsoleText('[catalog] 3 load warning(s)')).toBe(false);
    expect(isBrowserAutoConsoleText('Failed to load resource')).toBe(false);
  });
});

describe('isAllowlistedConsoleEntry', () => {
  it('matches the catalog warning with the canonical text shape and location', () => {
    expect(
      isAllowlistedConsoleEntry({
        kind: 'console.warn',
        text: '[catalog] 35 load warning(s)',
        location: 'http://localhost:5173/src/catalog/load-catalog.ts:50:12',
      }),
    ).toBe(true);
  });

  it('rejects the catalog text with extra trailing content', () => {
    expect(
      isAllowlistedConsoleEntry({
        kind: 'console.warn',
        text: '[catalog] 35 load warning(s) extra',
        location: 'http://localhost:5173/src/catalog/load-catalog.ts:50:12',
      }),
    ).toBe(false);
  });

  it('rejects a different catalog warning shape', () => {
    expect(
      isAllowlistedConsoleEntry({
        kind: 'console.warn',
        text: '[catalog] palette X missing',
        location: 'http://localhost:5173/src/catalog/load-catalog.ts:50:12',
      }),
    ).toBe(false);
  });

  it('rejects matching text from a different location', () => {
    expect(
      isAllowlistedConsoleEntry({
        kind: 'console.warn',
        text: '[catalog] 35 load warning(s)',
        location: 'http://localhost:5173/src/some-other-file.ts:1:1',
      }),
    ).toBe(false);
  });

  it('rejects console.error even when text shape matches', () => {
    expect(
      isAllowlistedConsoleEntry({
        kind: 'console.error',
        text: '[catalog] 35 load warning(s)',
        location: 'http://localhost:5173/src/catalog/load-catalog.ts:50:12',
      }),
    ).toBe(false);
  });

  it('rejects when location is missing', () => {
    expect(
      isAllowlistedConsoleEntry({
        kind: 'console.warn',
        text: '[catalog] 35 load warning(s)',
      }),
    ).toBe(false);
  });
});

describe('isSpriteAssetUrl', () => {
  it('matches paths containing /spritesheets/', () => {
    expect(isSpriteAssetUrl('http://localhost:5173/spritesheets/body/x.png')).toBe(true);
    expect(
      isSpriteAssetUrl(
        'https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/spritesheets/hat/y.png',
      ),
    ).toBe(true);
  });

  it('does not match non-sprite URLs', () => {
    expect(isSpriteAssetUrl('http://localhost:5173/src/catalog/load-catalog.ts')).toBe(false);
    expect(isSpriteAssetUrl('http://localhost:5173/index.html')).toBe(false);
    expect(isSpriteAssetUrl('http://localhost:5173/api/data.json')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @lpc-toolkit/web test console-collector-filters
```

Expected: import errors — the named exports don't exist yet.

- [ ] **Step 3: Rewrite the collector**

Replace the entire contents of `packages/web/e2e/helpers/console-collector.ts` with:

```ts
import type { ConsoleMessage, Page, Request, Response } from '@playwright/test';

export type CapturedErrorKind =
  | 'console.error'
  | 'console.warn'
  | 'pageerror'
  | 'response'
  | 'requestfailed';

export type CapturedError = {
  kind: CapturedErrorKind;
  text: string;
  location?: string;
};

/**
 * Chromium auto-emits a `console.error` for every failed resource load
 * (4xx/5xx status, net::ERR_*, CORS rejection). These duplicate the
 * structured events delivered to the `response` and `requestfailed`
 * listeners. Filter them here so the application-`console` channel
 * carries only app-code emissions.
 */
const BROWSER_AUTO_RESOURCE_PATTERNS: readonly RegExp[] = [
  /^Failed to load resource: the server responded with a status of \d{3}/,
  /^Failed to load resource: net::ERR_/,
  /^Access to fetch at .* has been blocked by CORS policy/,
];

export function isBrowserAutoConsoleText(text: string): boolean {
  return BROWSER_AUTO_RESOURCE_PATTERNS.some((re) => re.test(text));
}

/**
 * Narrowly anchored allowlist. The only entry today is the catalog
 * data-quality warning; the root cause is in `upstream/` (a read-only
 * git submodule — see CLAUDE.md hard rule). See
 * docs/superpowers/specs/2026-05-28-e2e-noise-cleanup-design.md §3.3.
 */
interface ConsoleAllowlistEntry {
  kind: 'console.warn' | 'console.error';
  textPattern: RegExp;
  locationPattern: RegExp;
}

const APP_CONSOLE_ALLOWLIST: readonly ConsoleAllowlistEntry[] = [
  {
    kind: 'console.warn',
    textPattern: /^\[catalog\] \d+ load warning\(s\)$/,
    locationPattern: /\/catalog\/load-catalog\.ts/,
  },
];

export function isAllowlistedConsoleEntry(entry: {
  kind: CapturedErrorKind;
  text: string;
  location?: string;
}): boolean {
  if (entry.kind !== 'console.warn' && entry.kind !== 'console.error') {
    return false;
  }
  if (entry.location === undefined) return false;
  const location = entry.location;
  return APP_CONSOLE_ALLOWLIST.some(
    (rule) =>
      rule.kind === entry.kind &&
      rule.textPattern.test(entry.text) &&
      rule.locationPattern.test(location),
  );
}

/**
 * Sprite-asset URLs map to the `/spritesheets/` path segment in both local
 * (Vite dev) and upstream-mirror URLs. The catalog/compose layer can resolve
 * to paths that don't exist (tracked in
 * docs/superpowers/notes/2026-05-28-catalog-sprite-404-investigation.md);
 * the app handles missing sprites with a grey placeholder, not an exception,
 * so these are out-of-scope for this smoke test.
 */
export function isSpriteAssetUrl(url: string): boolean {
  return /\/spritesheets\//.test(url);
}

export function attachConsoleCollector(page: Page): CapturedError[] {
  const errors: CapturedError[] = [];

  page.on('console', (msg: ConsoleMessage) => {
    const type = msg.type();
    if (type !== 'error' && type !== 'warning') return;
    const text = msg.text();
    if (isBrowserAutoConsoleText(text)) return;
    const kind: 'console.error' | 'console.warn' =
      type === 'error' ? 'console.error' : 'console.warn';
    const location = formatLocation(msg.location());
    const entry: CapturedError = {
      kind,
      text,
      ...(location !== undefined && { location }),
    };
    if (isAllowlistedConsoleEntry(entry)) return;
    errors.push(entry);
  });

  page.on('pageerror', (err: Error) => {
    const location = err.stack?.split('\n')[1]?.trim();
    errors.push({
      kind: 'pageerror',
      text: `${err.name}: ${err.message}`,
      ...(location !== undefined && { location }),
    });
  });

  page.on('response', (res: Response) => {
    const status = res.status();
    if (status < 400 || status >= 600) return;
    const url = res.url();
    if (isSpriteAssetUrl(url)) return;
    errors.push({
      kind: 'response',
      text: `HTTP ${status}`,
      location: url,
    });
  });

  page.on('requestfailed', (req: Request) => {
    const url = req.url();
    if (isSpriteAssetUrl(url)) return;
    const failure = req.failure();
    errors.push({
      kind: 'requestfailed',
      text: failure ? failure.errorText : 'request failed',
      location: url,
    });
  });

  return errors;
}

function formatLocation(loc: {
  url: string;
  lineNumber: number;
  columnNumber: number;
}): string | undefined {
  return loc.url ? `${loc.url}:${loc.lineNumber}:${loc.columnNumber}` : undefined;
}
```

- [ ] **Step 4: Run the predicate tests to verify they pass**

Run:

```bash
pnpm --filter @lpc-toolkit/web test console-collector-filters
```

Expected: all 16 tests pass.

- [ ] **Step 5: Typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/web/e2e/helpers/console-collector.ts packages/web/test/console-collector-filters.test.ts
git commit -m "feat(web): overhaul e2e collector with 4-channel split + narrow allowlist"
```

---

## Task 6: Spec visits `/?assetSource=local`

**Files:**
- Modify: `packages/web/e2e/random-no-console-errors.spec.ts`

- [ ] **Step 1: Update the URL the spec navigates to**

Open `packages/web/e2e/random-no-console-errors.spec.ts`. Change line 9 from:

```ts
  await page.goto('/');
```

to:

```ts
  // Force assetSource=local: avoids the auto-fallback to liberatedpixelcup.github.io
  // (CORS-rejected fetches add ~24k noise events). See docs/superpowers/specs/
  // 2026-05-28-e2e-noise-cleanup-design.md §3.1.
  await page.goto('/?assetSource=local');
```

No other changes.

- [ ] **Step 2: Typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add packages/web/e2e/random-no-console-errors.spec.ts
git commit -m "test(web): drive e2e smoke against assetSource=local"
```

---

## Task 7: Full verification — typecheck + vitest + e2e

**Files:** none modified (verification only).

- [ ] **Step 1: Run typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: exits 0.

- [ ] **Step 2: Run all unit tests**

Run:

```bash
pnpm --filter @lpc-toolkit/web test
```

Expected: all tests pass. Verify that the count includes the new tests (asset-source-from-url, the load-catalog emit-once block, console-collector-filters, and the new browser-canvas-adapter concurrency test).

- [ ] **Step 3: Run the e2e smoke test**

Run:

```bash
pnpm --filter @lpc-toolkit/web test:e2e
```

Expected outcomes:

**(A) PASS.** Output ends with `1 passed`. Proceed to Step 4.

**(B) FAIL with the formatted error report.** This indicates either a remaining noise source not covered by the design, or a real bug. Read the report:

- If the new noise is a **console.error / console.warn / pageerror** from app code → real bug, **do not** widen the allowlist; surface to the user.
- If the new noise is a **response / requestfailed** for a URL NOT under `/spritesheets/` → real bug; surface to the user.
- If you see `Failed to load resource:` or `Access to fetch at ... CORS policy` text leaking through the console filter → the regex didn't match; update `BROWSER_AUTO_RESOURCE_PATTERNS` and re-run.

**(C) ERROR before assertions** — webServer didn't start, Playwright config issue. Re-run `pnpm --filter @lpc-toolkit/web exec playwright install chromium` if Chromium is missing, and check `packages/web/playwright-report/`.

- [ ] **Step 4: (If e2e green) Measure runtime**

The reporter output shows the test's wall-clock time on its `[chromium] › … (Ns)` line. If `N > 60`:

- The throttle limit may be too low. Consider raising `FETCH_CONCURRENCY` in `browser-canvas-adapter.ts` from 6 to 12 (still well below HTTP/2 stream limits) and re-run.

If `N ≤ 60`, no action.

- [ ] **Step 5: No commit (verification only)**

There is nothing to commit from this task unless Step 3 outcome B required iterative tightening of the patterns or Step 4 required a throttle bump — in which case the corresponding earlier task's commit message should be amended (re-stage and commit normally; do not `--amend` the earlier commit).

---

## Task 8: Manual dev-mode sanity check

**Files:** none modified.

The unit + e2e tests cover the automated surface. This task confirms the production developer experience (dev mode without the URL param) is also improved.

- [ ] **Step 1: Start the dev server**

Run:

```bash
pnpm --filter @lpc-toolkit/web dev
```

Wait for the "Local: http://localhost:5173/" line.

- [ ] **Step 2: Open browser DevTools and load the app**

In a real browser, open `http://localhost:5173/` with the Console tab open and "Preserve log" enabled.

- [ ] **Step 3: Verify catalog warning emits at most once**

Look for `[catalog] N load warning(s)` in the Console. There should be **at most one** such line at boot (even though StrictMode would otherwise double-emit).

- [ ] **Step 4: Click the random outfit button 10–20 times**

Watch the console. There should be **substantially fewer** `ERR_INSUFFICIENT_RESOURCES` errors than before — ideally zero on localhost (some auto-fallback noise to github.io may still appear because the default UI session uses `assetSource='auto'`; that's separate from the e2e test's `?assetSource=local` path).

- [ ] **Step 5: Stop the dev server (Ctrl-C) — no code change required**

No commit from this step.

---

## Verification Summary

After all tasks complete:

| Check | Command |
|---|---|
| Type strictness | `pnpm --filter @lpc-toolkit/web typecheck` exits 0 |
| Unit tests | `pnpm --filter @lpc-toolkit/web test` exits 0 with new tests counted |
| E2E smoke | `pnpm --filter @lpc-toolkit/web test:e2e` exits 0, reporter "1 passed" |
| Dev console | Manual: at most one catalog warn per session, no ERR_INSUFFICIENT_RESOURCES flood |
| Untouched surfaces | `git diff main -- upstream/ packages/web/package.json pnpm-lock.yaml .github/` produces no output |

When all rows green, the cleanup PR is ready.
