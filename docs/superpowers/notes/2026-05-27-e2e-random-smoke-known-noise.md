# E2E Random-Button Smoke Test — Known Console Noise

**Date observed:** 2026-05-27
**Test:** `packages/web/e2e/random-no-console-errors.spec.ts`
**State:** Test currently **fails** in dev mode with the noise listed below. Not introduced by this PR; deferred to follow-up work.

## Run summary

- Pretest copied 24.5 MB of spritesheets — OK.
- Playwright dev server started on :5173 — OK.
- The spec drove 20 random-outfit clicks — OK.
- Collector captured **30,731** console messages over the 20 clicks.

The infrastructure works as designed; the noise is real and pre-existing.

## Noise categories

### A. Catalog format warnings (`console.warn`)

```
[catalog] 35 load warning(s) [Object, Object, ...]
    @ http://localhost:5173/src/catalog/load-catalog.ts:27
```

- One emission per random click, ~35 warnings each.
- The same warnings appear during `pnpm test` baseline (e.g.
  `'alias target "metal.silver" does not match any variant on item "Pauldrons"'`).
- Source: data quality issues in the upstream LPC submodule.
- Side observation: the catalog appears to be re-validated on every random
  click (35 warnings × 20 clicks). If it's loaded once and held in state, the
  re-emission may indicate React-strict-mode double invocation or unnecessary
  re-parse. Worth a separate look but not required for this PR.

### B. Spritesheet load failures (`console.error`)

```
Failed to load resource: net::ERR_INSUFFICIENT_RESOURCES
    @ http://localhost:5173/spritesheets/...
```

- Hundreds per random click; the bulk of the 30,731 total.
- Affected paths: `facial/monocle/`, `facial/masks/plain/`, `feet/socks/ankle/`,
  `hat/pirate/kerchief/`, `cape/solid_behind/`, `cape/solid/female/`,
  `cape/trim/female/`, etc.
- Cause: random outfit change preloads many sprite variants; Chromium's
  per-origin connection pool runs out on HTTP/1.1 (Vite dev). Production
  serves via Cloudflare Pages over HTTP/2 with multiplexing — this artifact
  does not happen there.

## Decisions

- **No allowlist added in this PR.** The collector remains strict.
- **No source-side fixes in this PR.** Catalog re-emission and aggressive
  image preload are pre-existing behaviors.
- **CI implication (Task 8):** the e2e job will fail on first run with the
  same noise. That is the accurate signal — the test reports what the dev
  build does. Fixing it (allowlist or source) is the next PR.

## Suggested follow-ups (out of scope here)

1. **Allowlist in collector** — once we agree which warnings are "expected
   dev-mode artifacts" we can filter them in `console-collector.ts` with
   regex patterns plus a comment naming this note.
2. **Catalog one-shot init** — investigate `load-catalog.ts:27`; if the
   warning is data-quality and immutable per session, emit it once and
   suppress on subsequent loads, or move it behind a single startup check.
3. **Sprite preload throttling** — limit concurrent image requests in dev
   mode (e.g. small queue / `requestIdleCallback` batching), or rely on
   intersection observer / lazy load patterns.
4. **Upstream data PR** — file the `alias target ... does not match`
   warnings against the LPC upstream catalog files.

---

## Follow-up status (2026-05-28)

Re-measured under live conditions and superseded by a focused cleanup design:
- **Resolved by:** `docs/superpowers/specs/2026-05-28-e2e-noise-cleanup-design.md` — fixes the four noise classes here at the root (URL-param-driven `assetSource=local` for tests, `fetch()` concurrency throttle, collector listener overhaul, catalog emit-once + exact-match allowlist).
- **Spun off as separate investigation:** `docs/superpowers/notes/2026-05-28-catalog-sprite-404-investigation.md` — the 1,701 HTTP 404s turned out to be a pre-existing catalog/compose data bug (paths like `…/idle/base.png` don't exist in upstream either), not a copy-script gap. Filtered in e2e via a `/spritesheets/` response skip; root-cause fix tracked separately.
- **Corrected observation:** "35 warnings × 20 clicks" was a misread. `console.warn(text, array)` is a single emission; the catalog warning fires only twice total (StrictMode double-mount at boot), not per click.
