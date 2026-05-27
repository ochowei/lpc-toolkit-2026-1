# E2E Random-Click Noise Cleanup — Design

**Date:** 2026-05-28
**Scope:** `packages/web`
**Goal:** Make `pnpm --filter @lpc-toolkit/web test:e2e` pass cleanly in local dev mode (exit 0, "Captured 0 console error(s)"), by fixing root causes for each noise class rather than masking with broad allowlists.

**Reference note:** `docs/superpowers/notes/2026-05-27-e2e-random-smoke-known-noise.md`
**Built on:** `docs/superpowers/specs/2026-05-27-random-button-browser-smoke-test-design.md`

---

## 1. Motivation

The smoke test `packages/web/e2e/random-no-console-errors.spec.ts` was merged with the understanding that it would fail on first run due to pre-existing dev-mode noise. A live run on 2026-05-28 captured **26,466** console errors over 20 random clicks. Detailed breakdown:

| Class | Count | Root location |
|---|---|---|
| `console.error: net::ERR_INSUFFICIENT_RESOURCES` | 22,618 | `browser-canvas-adapter.ts` — unbounded parallel `fetch()` saturates Chromium HTTP/1.1 per-origin pool |
| `console.error: 404` (Chromium auto-emit) | 1,701 | `console-collector.ts` — double-counts the same 4xx that the `response` listener already captures |
| `response: HTTP 404` | 1,701 | (the deduplicated half of the above) |
| `console.error: net::ERR_FAILED` (CORS) | 222 | `browser-canvas-adapter.ts` — `assetSource='auto'` falls back to `liberatedpixelcup.github.io`, which serves no CORS headers for `fetch()` |
| `console.error: Access to fetch... blocked by CORS policy` | 222 | Chromium auto-emits a second console.error per CORS rejection with the detailed reason. Pairs 1:1 with `ERR_FAILED`. |
| `console.warn: [catalog] N load warning(s)` | 2 | `load-catalog.ts:52` — `console.warn` emitted on every catalog construction; React StrictMode double-mounts the App, producing 2 emissions at boot |
| `pageerror` (uncaught JS) | **0** | — no actual render bugs found |

Sum: 22,618 + 1,701 + 1,701 + 222 + 222 + 2 + 0 = 26,466 ✓

The note's original observation of "35 warnings × 20 clicks" was inaccurate: `console.warn(text, array)` emits **one** message whose `text` happens to mention `35`. The catalog warning fires twice (boot only), not per click.

A finding the original note also missed: **the 1,701 HTTP 404s come from `liberatedpixelcup.github.io`** (the auto-fallback target), but spot-checking confirms the paths don't exist in the read-only `upstream/` submodule either (e.g. `facial/glasses/shades/adult/idle/base.png` — the directory has `black.png`, `blue.png`, … recolor variants but no `base.png`). The catalog's URL resolution can produce paths for files that don't exist anywhere. This is a **pre-existing data/compose bug independent of this PR's scope**, tracked in a follow-up note (see §6).

The smoke test was designed to catch **render exceptions during random-outfit changes**. With `pageerror === 0` we have direct evidence the test's target signal is currently green. Everything else is environmental noise.

## 2. Strategy

User policy: **fix root causes; allowlist only where the root is outside our control.**

Maps to the noise classes from §1:

| Class | Approach | Where the fix lives |
|---|---|---|
| github.io fallback noise | Force `assetSource='local'` in the test via URL param | `App.tsx` + new helper |
| localhost connection saturation | Add a concurrency limit (semaphore = 6) to `loadImage` | `browser-canvas-adapter.ts` |
| Collector 4xx double-count and unreliable net error capture | Replace browser-auto console.error capture for resource failures; route 4xx/5xx via `response`, net errors via `requestfailed` | `console-collector.ts` |
| Catalog warning | Module-level emit-once guard + tightly scoped exact-match allowlist (root is `upstream/`, a read-only submodule) | `load-catalog.ts` + `console-collector.ts` |
| Sprite-path 4xx/network failures | Skip the `response`/`requestfailed` events for URLs under `/spritesheets/` | `console-collector.ts` |

The catalog warning and the sprite-path 4xx skip are the only allowlist entries; both have explicit, narrow scope and a follow-up to fix the underlying cause. Everything else is removed at the source.

## 3. Architecture changes

### 3.1 Asset-source override via URL query param

`AssetSource` is currently set only by the in-UI toggle (`App.tsx:24`, default `'auto'`). E2E cannot click that control without coupling to UI internals.

Add a tiny init helper that reads `?assetSource=local|upstream|auto` from `window.location.search` and validates it. If absent or invalid → keep current default.

**New file:** `packages/web/src/lib/asset-source-from-url.ts`

```ts
import type { AssetSource } from '../adapter/asset-source';

const VALID: readonly AssetSource[] = ['auto', 'local', 'upstream'];

export function assetSourceFromUrl(search: string): AssetSource | undefined {
  const value = new URLSearchParams(search).get('assetSource');
  return value && (VALID as readonly string[]).includes(value)
    ? (value as AssetSource)
    : undefined;
}
```

**Modify:** `packages/web/src/App.tsx`

```ts
// before
const [assetSource, setAssetSource] = useState<AssetSource>('auto');

// after
const [assetSource, setAssetSource] = useState<AssetSource>(
  () => assetSourceFromUrl(window.location.search) ?? 'auto',
);
```

Pure function, side-effect-free in `useState` initializer (matches React's lazy-init pattern). No dependency added.

This is a small user-visible feature (URL-driven asset source) and worth a short mention in commit message but does not need a UI design — it parallels the existing hash-based selection state.

### 3.2 Concurrency-limited `loadImage`

`browser-canvas-adapter.ts:32-52` currently calls `fetch()` immediately for every requested sprite. Random-outfit changes trigger hundreds of concurrent fetches; Chromium per-origin HTTP/1.1 limit is 6, the excess fail with `ERR_INSUFFICIENT_RESOURCES`.

Add a per-adapter-instance simple semaphore that gates `fetch()` to at most 6 in-flight calls. The implementation is a tiny FIFO queue — no third-party dependency.

```ts
// new internal helper used by createBrowserCanvasAdapter
function createSemaphore(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return {
    async acquire(): Promise<() => void> {
      if (active < limit) {
        active++;
      } else {
        await new Promise<void>((resolve) => queue.push(resolve));
        active++;
      }
      return () => {
        active--;
        queue.shift()?.();
      };
    },
  };
}
```

`loadImage` wraps its `fetch()` body:

```ts
const release = await semaphore.acquire();
try {
  const res = await fetch(url);
  // ...existing logic...
} finally {
  release();
}
```

**Limit = 6** matches the HTTP/1.1 per-origin connection limit Chromium enforces. Going higher reintroduces saturation; going lower serializes unnecessarily. The constant is documented inline.

**Production safety:** HTTP/2 multiplexing makes the limit irrelevant for Cloudflare-served traffic — fetches share one TCP connection, so 6 vs 60 simultaneous reads cost the same. The throttle is invisible to prod users.

**Lifecycle:** the semaphore is per-adapter-instance, not module-singleton. `composeSelections` constructs a new adapter per call (`harness.tsx:157`), so each compose pass has its own queue. This is intentional: different compose calls are independent batches and shouldn't share queue state.

### 3.3 Collector listener overhaul

Today's collector wires four listeners and counts errors. The problems:

1. `console.error: Failed to load resource: the server responded with a status of 404 ()` is auto-emitted by Chromium for any failed `<img>` / `fetch` response and **duplicates** the `response: HTTP 404` event from `page.on('response')`.
2. Network failures (DNS, CORS preflight reject, `ERR_INSUFFICIENT_RESOURCES`) surface only as Chromium-auto console.error, which mixes legitimate `console.error` calls from app code with browser-engine noise.
3. There's no observable distinction between "404 returned by the server" and "request never reached the server."

Replacement design — four orthogonal channels:

| Channel | Captures | Listener |
|---|---|---|
| Application `console` | App-code `console.error` / `console.warn` only | `page.on('console')` with filter for browser-auto resource-load text |
| Uncaught JS | `pageerror` | `page.on('pageerror')` (unchanged) |
| Server-error responses | HTTP 4xx/5xx returned by server | `page.on('response')` (unchanged) |
| Network failures | DNS, abort, CORS, connection pool, etc. | `page.on('requestfailed')` (new) |

Filter rule in `console` listener: drop any `console.error` whose text matches one of the **three** browser-auto resource-load patterns:

```ts
const BROWSER_AUTO_RESOURCE_PATTERNS = [
  // HTTP 4xx/5xx — covered by response listener
  /^Failed to load resource: the server responded with a status of \d{3}/,
  // Network-layer failures — covered by requestfailed listener
  /^Failed to load resource: net::ERR_/,
  // CORS preflight / response rejected — paired 1:1 with the ERR_FAILED above
  /^Access to fetch at .* has been blocked by CORS policy/,
];
```

These are emitted by Chromium itself when an `<img>` or `fetch` fails — never by application code. The `response` and `requestfailed` listeners cover the same events with structured detail. Filtering here is a deduplication, not a feature mask.

Tightly scoped allowlist (two entries; both narrowly anchored):

```ts
const APP_CONSOLE_ALLOWLIST = [
  {
    // Reason: upstream/ is a read-only submodule (CLAUDE.md hard rule);
    // data-quality warnings from createCatalog can only be fixed by an
    // upstream PR. See docs/superpowers/notes/2026-05-27-e2e-random-smoke-known-noise.md
    // and docs/superpowers/specs/2026-05-28-e2e-noise-cleanup-design.md.
    kind: 'console.warn' as const,
    textPattern: /^\[catalog\] \d+ load warning\(s\)$/,
    locationPattern: /\/catalog\/load-catalog\.ts/,
  },
];

// Skip RESPONSE / REQUESTFAILED events whose URL is a sprite asset under
// /spritesheets/. The catalog can resolve to paths that don't exist in the
// read-only upstream submodule (see follow-up note). The app handles missing
// sprites with a grey placeholder, not an exception. Tracked separately for
// root-cause investigation; not in this PR's scope.
function isSpriteAssetUrl(url: string): boolean {
  return /\/spritesheets\//.test(url);
}
```

Both filters are narrowly anchored. The catalog filter requires exact whole-text shape **and** location. If a future catalog message reads `[catalog] palette X missing`, it does **not** match and the test fails — by design. The sprite-asset filter applies only to **HTTP responses and network failures** for URLs that contain `/spritesheets/`; it does **not** filter `console.error` or `pageerror` — so if app code throws or logs while loading a sprite, the test still fails.

If we ever add new catalog message shapes that are legitimately benign, this allowlist must be extended deliberately, not by widening the regex.

### 3.4 Catalog emit-once guard

`load-catalog.ts:52` runs each time `loadCatalogFromUpstream()` is called. React StrictMode mounts → unmounts → re-mounts in dev, so the App's `useMemo([])` factory runs twice, emitting the warning twice. The warning content is identical both times because the catalog is built from a static glob.

Add a module-scope flag:

```ts
let warningsEmitted = false;

export function loadCatalogFromUpstream(): Catalog {
  // ... existing logic up to `const { catalog, warnings } = recordsToCatalog(records);` ...
  if (warnings.length > 0 && !warningsEmitted) {
    console.warn(`[catalog] ${warnings.length} load warning(s)`, warnings);
    warningsEmitted = true;
  }
  // ... rest unchanged ...
}
```

**Effect:** Even if the function is called multiple times in one session (StrictMode, hot-reload), the warning emits once. The collector's allowlist still ignores that one emission because it's an upstream data-quality issue we cannot fix.

**Why not just remove the warning?** The maintainer needs the data-quality signal when adding new upstream submodule snapshots. Emit-once preserves that signal while avoiding noise.

**Test impact:** existing unit tests that call `loadCatalogFromUpstream()` more than once in the same Vitest worker may observe only the first emission. Implementation must either (a) export a `__resetCatalogWarningOnce()` test hook, or (b) restructure the tests to construct the catalog directly via `recordsToCatalog()` (which doesn't gate emissions). Verified during planning: the existing per-emission assertions live in `packages/web/test/` and use `recordsToCatalog`, so option (b) is preferred — no production code reaches the gate during unit tests.

## 4. New / changed files

| Path | Status | Purpose |
|---|---|---|
| `packages/web/src/lib/asset-source-from-url.ts` | Create | URL-search-param → `AssetSource` helper (validated) |
| `packages/web/src/App.tsx` | Modify | Use the helper in `useState` initializer |
| `packages/web/src/adapter/browser-canvas-adapter.ts` | Modify | Add per-adapter semaphore wrapping `fetch()` |
| `packages/web/src/catalog/load-catalog.ts` | Modify | Module-level emit-once flag |
| `packages/web/e2e/helpers/console-collector.ts` | Modify | 4-channel architecture, browser-auto filter, exact-match allowlist |
| `packages/web/e2e/random-no-console-errors.spec.ts` | Modify | Visit `/?assetSource=local` |
| `packages/web/test/asset-source-from-url.test.ts` | Create | Unit tests for the helper (valid / invalid / absent) |
| `packages/web/test/browser-canvas-adapter.test.ts` | Modify | Add concurrency-limit assertion |
| `packages/web/test/load-catalog.test.ts` | Create or modify | Cover emit-once behavior |
| `docs/superpowers/notes/2026-05-27-e2e-random-smoke-known-noise.md` | Modify | Append "Resolved by ..." pointer (done as part of this design) |
| `docs/superpowers/notes/2026-05-28-catalog-sprite-404-investigation.md` | Create | Track the catalog/compose 404 bug found during investigation (done as part of this design) |

No upstream/, package.json, lockfile, or CI workflow changes. No new dependencies.

## 5. Verification

1. `pnpm --filter @lpc-toolkit/web typecheck` exits 0
2. `pnpm --filter @lpc-toolkit/web test` (vitest) exits 0 — covers helper + adapter + catalog unit tests
3. `pnpm --filter @lpc-toolkit/web test:e2e` exits 0, reporter shows "1 passed"
4. The "Captured N console error(s)" path in the spec is not hit (N === 0 throughout)
5. Manual: launch `pnpm --filter @lpc-toolkit/web dev` and click random a few times in a browser — console should show **at most one** `[catalog] N load warning(s)` and no `ERR_INSUFFICIENT_RESOURCES` flood

The note file gets a final-status footer pointing at this design once verification passes.

## 6. Out of scope

- **Catalog/compose data bug producing 404 sprite paths** (1,701 entries currently masked by ERR_INSUFFICIENT_RESOURCES). A new follow-up note at `docs/superpowers/notes/2026-05-28-catalog-sprite-404-investigation.md` captures the finding for separate investigation. The /spritesheets/ response filter in this PR is the bridge until that's fixed.
- Upstream-data PR to fix catalog warnings at the data layer — out of band; tracked separately if at all
- A compose-layer image cache to deduplicate fetches across `composeSelections` calls — large surface, separate design if pursued
- Cross-browser e2e (Firefox / WebKit) — Chromium-only stays
- Required-status-check enforcement on the CI `e2e` job — defer until proven stable
- UI control for the new URL-driven asset source override — the param exists as a developer/test affordance; not promoted to user-visible UI in this PR

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Throttle `limit=6` too aggressive, e2e gets slow | Time the e2e run after the fix; if > 60s, raise to 12 or add a per-host pool |
| `URLSearchParams` adds an init-time DOM read that breaks in SSR — but this project is SPA-only, so N/A | — |
| Catalog emit-once defeats a future scenario where warnings change between calls (e.g., hot-reload of definitions) | The flag is module-scoped; HMR replaces the module, naturally resets. Acceptable. |
| Removing browser-auto `console.error` filtering hides a real app `console.error` someday | The patterns are anchored and known to be browser-engine strings. Application code emitting matching strings is implausible. If it does, fix the app's emission, not the filter. |
| `requestfailed` events outpace `response` events and produce duplicates for the same request | Per Playwright docs, `requestfailed` fires only when a request was aborted before any response; `response` fires only on a received response. They are mutually exclusive per request. |

## 8. Open questions

None. The design is ready to be turned into an implementation plan.
