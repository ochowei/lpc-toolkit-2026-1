# Catalog → URL Resolution Can Produce 404 Sprite Paths

**Date observed:** 2026-05-28 (during e2e noise cleanup investigation)
**Status:** Pre-existing bug, deferred. Filtered in e2e via `/spritesheets/` response/requestfailed skip (see `docs/superpowers/specs/2026-05-28-e2e-noise-cleanup-design.md` §3.3).

## Finding

While running the random-click e2e smoke test, **1,701** HTTP 404 responses were captured per 20-click session, all from `https://liberatedpixelcup.github.io/...` (the auto-fallback target). Spot-checking the failing paths shows the upstream submodule itself does **not** contain those files either.

Example:
- Requested: `facial/glasses/shades/adult/idle/base.png`
- Reality: `upstream/spritesheets/facial/glasses/shades/adult/idle/` contains `black.png`, `blue.png`, …, `white.png` — **no `base.png`**.

The catalog item or compose URL resolution must be producing the `base.png` form when the item lacks any "base" recolor variant — i.e. for items whose sheet definition has no `match_body_color: false` (or whichever flag signals a no-recolor base) but the random outfit picker still emits an empty `recolor` slot that the compose layer translates to `base`.

## Why this matters

- In production this manifests as silent grey-placeholder layers when the user picks the affected items. The app's `useItemThumbnail` and main preview both fall back to placeholders on load failure — no exception, but the user loses a sprite.
- In dev with `assetSource='auto'` the 404 was masked by the upstream-fallback noise (CORS + INSUFFICIENT_RESOURCES) so it was previously invisible.
- Currently invisible in `pnpm test` because Vitest uses a Node adapter with file-system lookups and our test harness doesn't randomize-into the affected items.

## Suggested next steps

1. Identify which catalog items resolve to non-existent paths. A scripted catalog walk that simulates `pickRandomOutfit` across many seeds and records all compose URLs against `existsSync(upstream/spritesheets/X)` would enumerate the failure set.
2. Trace one failing item through `pickRandomOutfit` → `composeSelections` → sprite URL builder to find where the `base.png` filename is being generated.
3. Decide between:
   - **Data fix**: add or rename `recolor` defaults in the affected sheet definitions (would require an upstream PR — `upstream/` is read-only here).
   - **Code fix in compose**: when a default recolor doesn't exist on disk, fall back to the first available variant or skip the layer entirely. Pure code change inside `packages/core/`.
4. After the fix, remove the `/spritesheets/` skip from `console-collector.ts` and re-run the e2e smoke test to verify zero remaining noise.

## Scope decision

Excluded from `docs/superpowers/specs/2026-05-28-e2e-noise-cleanup-design.md` because:
- The cleanup PR has a narrow goal: make the e2e smoke test pass cleanly.
- This bug spans catalog data, the random-outfit picker, and the compose URL builder. Investigation and fix touch `packages/core/` and possibly `packages/web/src/slice/`, with risk of regressing the main render path.
- The smoke test's primary signal is `pageerror === 0` (uncaught render exceptions), which is already true. Sprite 404s manifest as graceful placeholders, not exceptions.
