# ZIP-Only Asset Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ZIP archives the only supported web runtime sprite asset source.

**Architecture:** Collapse the web `AssetSource` type to `'zip'`, then remove runtime branches and UI/state that only existed for source switching. The browser adapter always resolves sprite PNGs through `loadFileFromZip`, while URL parsing keeps old deep links harmless by falling back to ZIP.

**Tech Stack:** TypeScript strict mode, React 18, Vite, Vitest, Playwright, JSZip.

---

## File Structure

- Modify `packages/web/src/adapter/asset-source.ts`: keep only the `AssetSource = 'zip'` contract; remove upstream/local candidate helpers.
- Modify `packages/web/src/lib/asset-source-from-url.ts`: validate only `zip`; default to ZIP regardless of dev/prod.
- Modify `packages/web/src/adapter/browser-canvas-adapter.ts`: always load through `loadFileFromZip`; keep fetch throttling.
- Modify `packages/web/src/App.tsx`: remove asset-source state and pass ZIP-only behavior through the app shell, or remove the prop if downstream cleanup makes it unnecessary.
- Modify `packages/web/src/components/layer-stack/settings-collapsible.tsx`: remove the sprite-source selector UI and its props.
- Modify `packages/web/src/components/layer-stack/harness.tsx`, `stack-panel.tsx`, `sidebar-search.tsx`, `layer-row.tsx`, `item-thumbnail.tsx`, `download-popover.tsx`, `use-composed-character.ts`, and `use-item-thumbnail.ts`: remove or fix `assetSource` plumbing so callers no longer switch sources.
- Modify `packages/web/src/i18n.ts`: remove source-switching labels that no longer have UI consumers.
- Modify tests under `packages/web/test/`: update URL parsing, browser adapter, i18n, and any prop type call sites.
- Modify E2E files under `packages/web/e2e/`: use ZIP-only navigation and replace local-vs-ZIP parity with ZIP render smoke coverage.

---

### Task 1: URL and Type Contract

**Files:**
- Modify: `packages/web/test/asset-source-from-url.test.ts`
- Modify: `packages/web/test/asset-source.test.ts`
- Modify: `packages/web/src/adapter/asset-source.ts`
- Modify: `packages/web/src/lib/asset-source-from-url.ts`

- [ ] **Step 1: Replace URL parser tests with ZIP-only expectations**

Replace `packages/web/test/asset-source-from-url.test.ts` with:

```ts
/** Verifies URL parsing for the web asset-source selector. */
import { describe, expect, it } from 'vitest';
import {
  assetSourceFromUrl,
  defaultAssetSourceFromUrl,
} from '../src/lib/asset-source-from-url';

describe('assetSourceFromUrl', () => {
  it('returns zip when assetSource is "zip"', () => {
    expect(assetSourceFromUrl('?assetSource=zip')).toBe('zip');
    expect(assetSourceFromUrl('assetSource=zip')).toBe('zip');
  });

  it('returns undefined when assetSource is absent', () => {
    expect(assetSourceFromUrl('')).toBeUndefined();
    expect(assetSourceFromUrl('?foo=bar')).toBeUndefined();
  });

  it('returns undefined for legacy or invalid assetSource values', () => {
    expect(assetSourceFromUrl('?assetSource=auto')).toBeUndefined();
    expect(assetSourceFromUrl('?assetSource=local')).toBeUndefined();
    expect(assetSourceFromUrl('?assetSource=upstream')).toBeUndefined();
    expect(assetSourceFromUrl('?assetSource=invalid')).toBeUndefined();
    expect(assetSourceFromUrl('?assetSource=')).toBeUndefined();
    expect(assetSourceFromUrl('?assetSource=ZIP')).toBeUndefined();
  });
});

describe('defaultAssetSourceFromUrl', () => {
  it('always resolves to zip for absent, valid, invalid, and legacy values', () => {
    expect(defaultAssetSourceFromUrl('', true)).toBe('zip');
    expect(defaultAssetSourceFromUrl('', false)).toBe('zip');
    expect(defaultAssetSourceFromUrl('?assetSource=zip', true)).toBe('zip');
    expect(defaultAssetSourceFromUrl('?assetSource=zip', false)).toBe('zip');
    expect(defaultAssetSourceFromUrl('?assetSource=local', true)).toBe('zip');
    expect(defaultAssetSourceFromUrl('?assetSource=upstream', false)).toBe('zip');
    expect(defaultAssetSourceFromUrl('?assetSource=auto', true)).toBe('zip');
    expect(defaultAssetSourceFromUrl('?assetSource=nope', false)).toBe('zip');
  });
});
```

- [ ] **Step 2: Replace asset-source helper tests with ZIP type contract coverage**

Replace `packages/web/test/asset-source.test.ts` with:

```ts
import { describe, expectTypeOf, it } from 'vitest';
import type { AssetSource } from '../src/adapter/asset-source';

describe('AssetSource', () => {
  it('only allows zip', () => {
    expectTypeOf<'zip'>().toEqualTypeOf<AssetSource>();
  });
});
```

- [ ] **Step 3: Run focused tests and verify they fail**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- asset-source-from-url asset-source
```

Expected: FAIL because `assetSourceFromUrl` still accepts legacy values and `AssetSource` still includes `auto`, `local`, and `upstream`.

- [ ] **Step 4: Collapse `AssetSource` to ZIP**

Replace `packages/web/src/adapter/asset-source.ts` with:

```ts
/** Where the browser should load LPC spritesheet PNGs from. */
export type AssetSource = 'zip';
```

- [ ] **Step 5: Update URL parser implementation**

Replace `packages/web/src/lib/asset-source-from-url.ts` with:

```ts
import type { AssetSource } from '../adapter/asset-source';

/**
 * Parse a URL search-string and return the validated `assetSource` value
 * if present, or undefined if absent / invalid. Only ZIP is supported.
 */
export function assetSourceFromUrl(search: string): AssetSource | undefined {
  const value = new URLSearchParams(search).get('assetSource');
  return value === 'zip' ? 'zip' : undefined;
}

/** Choose the runtime asset source. ZIP is the only supported source. */
export function defaultAssetSourceFromUrl(
  search: string,
  _isDev: boolean,
): AssetSource {
  return assetSourceFromUrl(search) ?? 'zip';
}
```

- [ ] **Step 6: Run focused tests and verify they pass**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- asset-source-from-url asset-source
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/adapter/asset-source.ts packages/web/src/lib/asset-source-from-url.ts packages/web/test/asset-source-from-url.test.ts packages/web/test/asset-source.test.ts
git commit -m "refactor(web): collapse asset source to zip"
```

---

### Task 2: Browser Adapter ZIP-Only Loading

**Files:**
- Modify: `packages/web/test/browser-canvas-adapter.test.ts`
- Modify: `packages/web/src/adapter/browser-canvas-adapter.ts`

- [ ] **Step 1: Remove non-ZIP adapter tests and keep ZIP/concurrency coverage**

Edit `packages/web/test/browser-canvas-adapter.test.ts`:

- Change the Vitest import to include `beforeEach`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
```

- Add the ZIP cache helper import:

```ts
import { clearZipCacheForTests } from '../src/adapter/zip-loader';
```

- Add this before the `describe` blocks so each test downloads its own mocked
  archive:

```ts
beforeEach(() => {
  clearZipCacheForTests();
});
```

- Delete the test named `tries the local sprite URL before the upstream URL in auto mode`.
- Delete the test named `keeps the concurrency limit when auto mode falls back through 404s`.
- In the remaining concurrency tests, construct the adapter without a source argument:

```ts
const adapter = createBrowserCanvasAdapter();
```

and:

```ts
const adapters = Array.from({ length: totalRequests }, () =>
  createBrowserCanvasAdapter(),
);
```

- [ ] **Step 2: Strengthen the ZIP-mode test to use the default adapter**

In the test named `loads from ZIP in zip mode`, rename it to `loads from ZIP by default` and change the adapter call to:

```ts
const image = await createBrowserCanvasAdapter().loadImage(
  'spritesheets/body/male/walk.png',
);
```

Keep these assertions:

```ts
expect(image).toBe(bitmap);
expect(fetchMock).toHaveBeenCalledWith('http://x/app/zips/body.zip');
expect(fetchMock).toHaveBeenCalledWith('blob:mock-url');
expect(createImageBitmapMock).toHaveBeenCalled();
expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
```

- [ ] **Step 3: Run focused adapter test and verify it fails**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- browser-canvas-adapter
```

Expected: FAIL because `createBrowserCanvasAdapter()` still defaults to local loading and imports removed asset-source helpers.

- [ ] **Step 4: Replace adapter source branching with ZIP-only loading**

In `packages/web/src/adapter/browser-canvas-adapter.ts`, remove the imports of `resolveLocalSpriteUrl`, `resolveSpriteUrlCandidates`, and `type AssetSource`. Keep only:

```ts
import type {
  CanvasAdapter,
  CanvasLike,
  ImageLike,
} from '@lpc-toolkit/core';
import { loadFileFromZip } from './zip-loader';
```

Replace `resolveSpriteUrl` with:

```ts
export async function resolveSpriteUrl(
  path: string,
  baseHref: string,
): Promise<string> {
  return loadFileFromZip(path, baseHref);
}
```

Replace `createBrowserCanvasAdapter` with:

```ts
/** Browser implementation of core's environment-agnostic CanvasAdapter. */
export function createBrowserCanvasAdapter(): CanvasAdapter {
  return {
    createCanvas(width: number, height: number): CanvasLike {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      return c as unknown as CanvasLike;
    },
    async loadImage(path: string): Promise<ImageLike> {
      const url = await loadFileFromZip(path, document.baseURI);
      const release = await sharedFetchSemaphore.acquire();
      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Failed to fetch local blob URL: ${url} (HTTP ${res.status})`);
        }
        const blob = await res.blob();
        return (await createImageBitmap(blob)) as unknown as ImageLike;
      } finally {
        URL.revokeObjectURL(url);
        release();
      }
    },
  };
}
```

- [ ] **Step 5: Update `resolveSpriteUrl` tests for async ZIP resolution**

In `packages/web/test/browser-canvas-adapter.test.ts`, replace the `resolveSpriteUrl` describe block with:

```ts
describe('resolveSpriteUrl', () => {
  it('resolves a core sprite path through the category ZIP archive', async () => {
    const zip = new JSZip();
    zip.file('male/walk.png', 'fake-png-content');
    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });

    const fetchMock = vi.fn().mockResolvedValue(new Response(zipBuffer));
    const originalURL = globalThis.URL;
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    class MockURL extends originalURL {
      static override createObjectURL = createObjectURLMock;
    }

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', MockURL);

    try {
      await expect(
        resolveSpriteUrl('spritesheets/body/male/walk.png', 'http://x/app/'),
      ).resolves.toBe('blob:mock-url');
      expect(fetchMock).toHaveBeenCalledWith('http://x/app/zips/body.zip');
      expect(createObjectURLMock).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
```

- [ ] **Step 6: Run focused adapter test and verify it passes**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- browser-canvas-adapter
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/adapter/browser-canvas-adapter.ts packages/web/test/browser-canvas-adapter.test.ts
git commit -m "refactor(web): load sprites from zip only"
```

---

### Task 3: Remove Source Selector UI and Prop Plumbing

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/hooks/use-composed-character.ts`
- Modify: `packages/web/src/hooks/use-item-thumbnail.ts`
- Modify: `packages/web/src/components/layer-stack/settings-collapsible.tsx`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`
- Modify: `packages/web/src/components/layer-stack/sidebar-search.tsx`
- Modify: `packages/web/src/components/layer-stack/layer-row.tsx`
- Modify: `packages/web/src/components/layer-stack/item-thumbnail.tsx`
- Modify: `packages/web/src/components/layer-stack/popovers/download-popover.tsx`
- Modify: `packages/web/src/i18n.ts`
- Modify: `packages/web/test/i18n.test.ts`

- [ ] **Step 1: Update i18n tests to remove source-switching labels**

In `packages/web/test/i18n.test.ts`, remove expectations for:

```ts
assetSource.title
assetSource.auto
assetSource.local
assetSource.upstream
assetSource.zip
```

for both English and `zh-TW`.

- [ ] **Step 2: Run typecheck and i18n test to expose remaining plumbing**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- i18n
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: `i18n` may still pass before code cleanup, while typecheck FAILS because non-ZIP source values and adapter arguments remain.

- [ ] **Step 3: Remove app-level asset source state**

In `packages/web/src/App.tsx`:

- Remove `useState<AssetSource>` for `assetSource`.
- Remove imports of `type AssetSource` and `defaultAssetSourceFromUrl`.
- Remove `assetSource={assetSource}` and `onAssetSourceChange={setAssetSource}` from `LayerStackHarness`.

The top import should start as:

```ts
import { useMemo, useReducer, useState } from 'react';
```

and retain `useState` only for theme and locale.

- [ ] **Step 4: Remove asset source props from hooks**

In `packages/web/src/hooks/use-composed-character.ts`:

- Remove `import type { AssetSource } from '../adapter/asset-source';`.
- Remove the `assetSource: AssetSource` parameter.
- Change adapter memoization to:

```ts
const adapter = useMemo(() => createBrowserCanvasAdapter(), []);
```

In `packages/web/src/hooks/use-item-thumbnail.ts`:

- Remove `import type { AssetSource } from '../adapter/asset-source';`.
- Remove `readonly assetSource: AssetSource;` from the args interface.
- Change adapter creation to:

```ts
const adapter = createBrowserCanvasAdapter();
```

- Remove `args.assetSource` from hook dependency arrays.

- [ ] **Step 5: Remove asset source props from component interfaces and calls**

Apply these direct removals:

- `packages/web/src/components/layer-stack/harness.tsx`: remove `assetSource` and `onAssetSourceChange` from `Props`, remove every `props.assetSource` argument, and change `createBrowserCanvasAdapter(props.assetSource)` to `createBrowserCanvasAdapter()`.
- `packages/web/src/components/layer-stack/stack-panel.tsx`: remove `assetSource` and `setAssetSource` props and downstream pass-through.
- `packages/web/src/components/layer-stack/settings-collapsible.tsx`: remove the `AssetSource` import, `assetSource` prop, `setAssetSource` prop, and the entire `<div>` block that renders `t('assetSource.title')` and maps `['auto', 'local', 'upstream', 'zip']`.
- `packages/web/src/components/layer-stack/sidebar-search.tsx`: remove `assetSource` prop and remove `assetSource={assetSource}` from `ItemThumbnail`.
- `packages/web/src/components/layer-stack/layer-row.tsx`: remove `assetSource` prop and remove `assetSource={assetSource}` from thumbnail calls.
- `packages/web/src/components/layer-stack/item-thumbnail.tsx`: remove `AssetSource` import and `assetSource` prop; call `useItemThumbnail` without `assetSource`.
- `packages/web/src/components/layer-stack/popovers/download-popover.tsx`: remove `AssetSource` import and prop; change `createBrowserCanvasAdapter(assetSource)` to `createBrowserCanvasAdapter()`.

- [ ] **Step 6: Remove unused source-selector translations**

In `packages/web/src/i18n.ts`, delete these keys from both locales:

```ts
'assetSource.title'
'assetSource.auto'
'assetSource.local'
'assetSource.upstream'
'assetSource.autoHelp'
'assetSource.localHelp'
'assetSource.upstreamHelp'
'assetSource.zip'
'assetSource.zipHelp'
```

- [ ] **Step 7: Run source search to catch leftovers**

Run:

```bash
rg -n "assetSource|AssetSource|createBrowserCanvasAdapter\\(|auto|upstream|local" packages/web/src packages/web/test --glob '!**/zip-export.test.ts' --glob '!**/asset-release.test.ts' --glob '!**/upstream-url.test.ts'
```

Expected: no asset-source plumbing remains except `asset-source.ts`, `asset-source-from-url.ts`, and tests for those files. Matches for unrelated words such as `localStorage` or prose are acceptable only if they are not source-switching code.

- [ ] **Step 8: Run typecheck and i18n test**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- i18n
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/hooks/use-composed-character.ts packages/web/src/hooks/use-item-thumbnail.ts packages/web/src/components/layer-stack/settings-collapsible.tsx packages/web/src/components/layer-stack/harness.tsx packages/web/src/components/layer-stack/stack-panel.tsx packages/web/src/components/layer-stack/sidebar-search.tsx packages/web/src/components/layer-stack/layer-row.tsx packages/web/src/components/layer-stack/item-thumbnail.tsx packages/web/src/components/layer-stack/popovers/download-popover.tsx packages/web/src/i18n.ts packages/web/test/i18n.test.ts
git commit -m "refactor(web): remove asset source selector"
```

---

### Task 4: E2E ZIP-Only Coverage

**Files:**
- Modify: `packages/web/e2e/helpers/parity-pages.ts`
- Modify: `packages/web/e2e/random-no-console-errors.spec.ts`
- Modify: `packages/web/e2e/responsive-layout.spec.ts`
- Modify: `packages/web/e2e/random-upstream-parity.spec.ts`
- Modify: `packages/web/e2e/zip-asset-source.spec.ts`
- Modify: `packages/web/test/e2e-probe-from-url.test.ts`

- [ ] **Step 1: Update E2E probe URL test**

In `packages/web/test/e2e-probe-from-url.test.ts`, replace `assetSource=local` examples with `assetSource=zip`:

```ts
expect(e2eProbeFromUrl('?assetSource=zip&e2eProbe=1')).toBe(true);
expect(e2eProbeFromUrl('?assetSource=zip')).toBe(false);
```

- [ ] **Step 2: Update parity helper to remove local source option**

In `packages/web/e2e/helpers/parity-pages.ts`, change `openToolkitCase` signature to:

```ts
export async function openToolkitCase(
  context: BrowserContext,
  hash: string,
): Promise<ToolkitCase> {
```

and change navigation to:

```ts
await page.goto(`/?assetSource=zip&e2eProbe=1#${hash}`);
```

- [ ] **Step 3: Update E2E specs that force local**

Replace these navigations:

```ts
await page.goto('/?assetSource=local');
await page.goto('/?assetSource=local&e2eProbe=1');
```

with:

```ts
await page.goto('/?assetSource=zip');
await page.goto('/?assetSource=zip&e2eProbe=1');
```

in:

- `packages/web/e2e/random-no-console-errors.spec.ts`
- `packages/web/e2e/responsive-layout.spec.ts`
- `packages/web/e2e/random-upstream-parity.spec.ts`

Also remove comments that mention avoiding auto fallback or local mode.

- [ ] **Step 4: Replace local-vs-ZIP E2E with ZIP smoke**

Replace `packages/web/e2e/zip-asset-source.spec.ts` with:

```ts
import { test, expect } from '@playwright/test';
import { OBSERVED_REGRESSION_CASE } from './helpers/seeded-rng';
import {
  formatErrors,
  openToolkitCase,
  type ToolkitProbeSnapshot,
} from './helpers/parity-pages';

test.describe('ZIP asset source', () => {
  test('renders a complex outfit without significant errors', async ({
    context,
  }) => {
    const result = await openToolkitCase(
      context,
      OBSERVED_REGRESSION_CASE.hash,
    );

    try {
      const errors = significantErrors(result.errors);
      expect(
        errors.length,
        `captured errors:\n${formatErrorPreview(errors)}`,
      ).toBe(0);
      expect(result.snapshot.status).toBe('ready');
      expect(result.snapshot.layers.length).toBeGreaterThan(0);
      expect(
        `${result.snapshot.rgba.width}x${result.snapshot.rgba.height}`,
        diagnostic(result.snapshot),
      ).not.toBe('0x0');
    } finally {
      await result.page.close();
    }
  });
});

function formatErrorPreview(
  errors: Parameters<typeof formatErrors>[0],
): string {
  const previewLimit = 20;
  const preview = formatErrors(errors.slice(0, previewLimit));
  if (errors.length <= previewLimit) return preview;
  return `${preview}\n... ${errors.length - previewLimit} more error(s)`;
}

function significantErrors(
  errors: Parameters<typeof formatErrors>[0],
): Parameters<typeof formatErrors>[0] {
  return errors.filter(
    (error) =>
      !(
        error.kind === 'console.warn' &&
        /^\[catalog\] \d+ load warning\(s\)(?: \[Object(?:, Object)*\])?$/.test(
          error.text,
        )
      ),
  );
}

function diagnostic(snapshot: ToolkitProbeSnapshot): string {
  return [
    `case=${OBSERVED_REGRESSION_CASE.name}`,
    `hash=${OBSERVED_REGRESSION_CASE.hash}`,
    `status=${snapshot.status}`,
    `layers=${JSON.stringify(snapshot.layers)}`,
  ].join('\n');
}
```

- [ ] **Step 5: Run unit test for E2E probe parser**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- e2e-probe-from-url
```

Expected: PASS.

- [ ] **Step 6: Run TypeScript check**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/web/e2e/helpers/parity-pages.ts packages/web/e2e/random-no-console-errors.spec.ts packages/web/e2e/responsive-layout.spec.ts packages/web/e2e/random-upstream-parity.spec.ts packages/web/e2e/zip-asset-source.spec.ts packages/web/test/e2e-probe-from-url.test.ts
git commit -m "test(web): run e2e with zip asset source"
```

---

### Task 5: Final Verification

**Files:**
- Read-only verification across `packages/web`

- [ ] **Step 1: Run full web unit test suite**

Run:

```bash
pnpm --filter @lpc-toolkit/web test
```

Expected: PASS.

- [ ] **Step 2: Run web typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [ ] **Step 3: Run ZIP E2E smoke**

Run:

```bash
pnpm --filter @lpc-toolkit/web exec playwright test e2e/zip-asset-source.spec.ts
```

Expected: PASS. If browsers are not installed or the command cannot run in the environment, record the exact failure and run the closest available unit/type verification.

- [ ] **Step 4: Confirm no source-switching runtime paths remain**

Run:

```bash
rg -n "assetSource|AssetSource|resolveSpriteUrlCandidates|resolveUpstreamSpriteUrl|UPSTREAM_SPRITESHEET_BASE_URL|createBrowserCanvasAdapter\\(" packages/web/src packages/web/test packages/web/e2e
```

Expected: remaining matches are limited to ZIP-only parser/type files, ZIP-only tests, and no calls pass a non-ZIP source.

- [ ] **Step 5: Confirm protected areas were not touched**

Run:

```bash
git diff --stat HEAD~4..HEAD -- packages/core upstream
```

Expected: no output.

- [ ] **Step 6: Commit final verification note if needed**

If no code changes are needed after verification, do not create an empty commit. If verification requires a small fix, commit only that fix:

```bash
git add <fixed-files>
git commit -m "fix(web): complete zip-only asset source cleanup"
```
