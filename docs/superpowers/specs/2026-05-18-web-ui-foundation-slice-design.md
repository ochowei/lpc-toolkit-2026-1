# Web UI — Foundation Vertical Slice (design)

**Date:** 2026-05-18
**Status:** Approved (design); pending written-spec review
**Scope:** First sub-project of the `packages/web` build-out.

## Context

The monorepo ships `@lpc-toolkit/core` (implemented, tested) and a build-free
design prototype in `reference/LPC-Tool-Web_UI/`. The prototype uses mock
fixtures and a procedural pixel-art renderer — it is reference material only,
not code to port. `packages/web` does not exist yet. The `upstream/` git
submodule (source of `spritesheets/` PNGs and `sheet_definitions/` JSON) is
currently **not initialized**.

"Build the web UI" decomposes into four independent sub-projects:

1. **Foundation vertical slice** (this spec) — scaffold + core integration.
2. Full desktop editor UI (3-column layout, panels, full state model).
3. Export + attribution depth + URL hash state.
4. Mobile responsive layout.

This spec covers **only sub-project 1**. Its purpose is to de-risk the
unknown: does `@lpc-toolkit/core` run in the browser end-to-end, and what is
the asset-sourcing shape? Sub-projects 2–4 each get their own spec → plan →
implementation cycle later.

## Goal

A minimal but fully reusable foundation that proves, end-to-end in the
browser: catalog load → layer selection → `composeSelections` →
`extractAnimation` → animated canvas playback → attribution / effective
license display.

## Decisions (locked during brainstorming)

- **Asset sourcing:** local submodule, production strategy deferred. A Node
  script copies only the spritesheet PNGs referenced by the slice's chosen
  layers from `upstream/spritesheets/` into `packages/web/public/spritesheets/`
  (Vite static dir). `sheet_definitions` are read at build time via
  `import.meta.glob`. `spritesheetsBaseUrl = '/spritesheets'`. This models the
  real deploy boundary; the copy script is the seed of the deferred full-asset
  strategy sub-project.
- **Verification depth:** core pipeline + attribution. Recolor
  (`createPaletteCatalog` / `makeResolvePalette`) and URL hash
  (`parseHash` / `serializeHash`) are deferred.
- **Design-system investment:** full reusable scaffold + design tokens,
  minimal UI. Sub-project 2 builds directly on this foundation.
- **Stack:** React 18 + Vite + TypeScript (strict) + Tailwind CSS +
  shadcn/ui + pnpm. Mandated by `CLAUDE.md`; not re-litigated.

## Prerequisite

`upstream/` submodule must be initialized before the slice can run:
`git submodule update --init`. README documents this as the standard step.
This is a setup prerequisite, not part of the deliverable.

## §1 — Package structure & stack

```
packages/web/
  package.json          @lpc-toolkit/web; depends on @lpc-toolkit/core (workspace:*)
  vite.config.ts        React plugin; build outDir=dist
  tailwind.config.ts    design tokens wired into theme.extend
  postcss.config.js
  tsconfig.json         extends tsconfig.base.json; strict
  index.html
  scripts/
    copy-spritesheets.mjs   copies the PNG subset for slice layers into public/
  public/
    spritesheets/...        (copy-script output; gitignored)
  src/
    main.tsx
    index.css             @tailwind layers + design-token CSS variables
                          (ported from reference/LPC-Tool-Web_UI/styles.css)
    adapter/
      browser-canvas-adapter.ts   implements core CanvasAdapter
    catalog/
      load-catalog.ts       import.meta.glob sheet_definitions -> createCatalog
    state/
      editor-state.ts       minimal reducer + toSelections bridge
    components/
      slice-harness.tsx     minimal UI: layer selects + canvas + credits
    App.tsx
```

- `@lpc-toolkit/core` consumed as `workspace:*`. pnpm only — no npm/yarn/bun.
- TypeScript strict; no `any` without a documented reason (hard rule 5).
- Tailwind theme ported from `reference/LPC-Tool-Web_UI/styles.css` design
  tokens: dark/light themes, spacing scale, radii, type scale, license badge
  colors (`--lic-*`).
- No non-essential dependencies beyond core + the mandated stack. shadcn/ui is
  initialized but used minimally in the slice.
- The file tree above is indicative, not exhaustive: shadcn/ui init also
  generates `components.json` and a `src/lib/utils.ts` (`cn` helper); those are
  expected and not called out individually.

## §2 — Core integration data flow

**Startup (once):**

1. `import.meta.glob` over the upstream `sheet_definitions/**/*.json` tree
   (eager) → `Record<FilePath, ItemDefinition>` → `createCatalog(records)` →
   `{ catalog, warnings }`. Warnings logged to console; only an empty catalog
   is fatal (full-page error).
2. Build `browserCanvasAdapter`:
   - `createCanvas(w, h)` → `Object.assign(document.createElement('canvas'),
     { width: w, height: h })`.
   - `loadImage(path)` → `fetch(path)` → `blob()` → `createImageBitmap(blob)`.
     The result structurally satisfies `ImageLike`; `drawImage` accepts
     `ImageBitmap`.
   - `spritesheetsBaseUrl = '/spritesheets'`; `loadImage` joins the catalog's
     relative path onto this base.

**Interaction (per selection change):**

3. UI change → reducer updates minimal state → `toSelections` bridge produces
   core `Selections`.
4. `composeSelections(selections, { catalog, adapter, spritesheetsBaseUrl,
   onProgress })` → `ComposedSheet` (832×3456 master canvas). `onProgress`
   drives a load-progress indicator.
5. `extractAnimation(sheet, animName, { adapter })` → `ComposedAnimation`.
6. `requestAnimationFrame` loop draws successive frames of that animation onto
   the on-screen `<canvas>` (`image-rendering: pixelated`).
7. In parallel: `getCredits(selections, catalog)` → `CreditsManifest`;
   `computeEffectiveLicense(credits)` → `License`. Rendered as a credits list
   plus an effective-license badge (hard rule 3: always shown, never hidden).

**Recompute strategy:** `composeSelections` is async and image-heavy. The
slice debounces selection changes and uses a monotonically increasing request
id to discard stale results (race-safe). No caching (deferred to sub-project
2).

## §3 — Minimal state model & core Selections bridge

The slice does **not** reproduce the reference `editor.jsx` reducer (that is
sub-project 2). Minimal state only:

```ts
interface SliceState {
  bodyType: BodyType;                    // core type
  selections: Record<TypeName, ItemId>;  // chosen item per category
  anim: AnimationName;                   // default 'walk'
  dir: Direction;                        // default 'S'
  playing: boolean;                      // default true
}
```

- Reducer actions only: `set_body_type`, `pick(typeName, itemId)`,
  `clear(typeName)`, `set_anim`, `set_dir`, `toggle_play`. No
  zoom/fps/variant/recolor.
- **Bridge:** a pure function `toSelections(state): Selections` converts the
  shape above into core's `Selections` type. This is the only coupling point
  between slice and core; it lives in its own file and is unit-tested.
- Initial state: a fixed, known-good preset (body + a few layers) chosen to
  span multiple licenses so `computeEffectiveLicense` visibly resolves
  "strictest wins" (e.g. include a CC-BY layer and a GPL layer).
- Layer set is deliberately small (~5–8 categories, e.g. body / head / hair /
  torso / legs / feet plus one clearly non-CC0-licensed layer): enough for the
  copy script to derive the PNG subset and to demonstrate multi-layer
  compositing and credit aggregation.

## §4 — Minimal UI (slice harness)

Not the 3-column panels — a single page that drives the pipeline and applies
design tokens:

- **Header:** wordmark + dark/light theme toggle (default dark; reference
  states dark is the default for pixel work). Uses design tokens.
- **Left column:** one native `<select>` (or shadcn `Select`) per category
  listing that category's items; a body-type selector; an animation selector;
  a 4-direction control; play/pause.
- **Center:** checkerboard-backed `<canvas>` at a fixed 4× integer zoom
  (`image-rendering: pixelated`) running the extracted animation; shows
  `onProgress` while loading. Zoom is not adjustable in the slice (the zoom
  stepper is sub-project 2).
- **Right:** credits list (per active layer: name / author / license badge)
  topped by an effective-license badge. Badge colors use the `--lic-*` design
  tokens.

Styling uses Tailwind utilities + design-token CSS variables; shadcn/ui used
sparingly (Select/Button) to verify shadcn + Tailwind + design tokens
coexist. No search, accordion, variant, recolor, zoom stepper, frame
scrubber, export, or mobile (sub-projects 2/3/4).

## §5 — Error handling (only what the slice actually hits)

- **Catalog:** `createCatalog` warnings → console. Empty catalog is fatal →
  full-page error message.
- **Missing image / `loadImage` failure:** on a single layer's load failure,
  show an inline "failed to load" marker next to that layer in the credits
  area (the minimal version of the reference `errors` concept); other layers
  still compose; no full-page crash.
- **Stale compose result:** discarded via the §2 request id; no error shown.
- **Submodule not initialized:** `import.meta.glob` finds no sheet
  definitions → startup fails with an explicit message instructing
  `git submodule update --init`.
- No offline / retry / timeout / CDN-fallback handling — those belong to the
  deferred asset-strategy sub-project (YAGNI).

## §6 — Testing (Vitest, workspace standard)

- **Unit:** `toSelections` bridge (state → core `Selections` mapping).
- **Unit:** `browserCanvasAdapter` pure logic (base-url + relative-path
  joining); canvas/Image stubbed or via jsdom.
- **Integration (happy path):** fixed preset state → `toSelections` →
  `composeSelections` (adapter backed by `@napi-rs/canvas` or a stub fed
  fixture PNGs) → assert `ComposedSheet` dimensions, `extractAnimation`
  output, `getCredits` contains expected authors, `computeEffectiveLicense`
  returns the strictest license.
- No pixel-level testing of the RAF animation loop (high cost, low value).
- Success gate: `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r build` all green.

## §7 — Scope boundary & success criteria

**Definition of done:**

1. `pnpm --filter @lpc-toolkit/web dev` starts; the page shows an animated
   character composed from real LPC sprites.
2. Changing layer / body type / animation / direction updates the preview
   live.
3. The credits list and effective-license badge correctly reflect the current
   selection (hard rule 3).
4. `pnpm -r typecheck && pnpm -r test && pnpm -r build` all green.
5. `pnpm --filter @lpc-toolkit/web build && preview` works locally.

**Explicitly out of scope** (each a later sub-project): full 3-column editor,
search/accordion, variant, recolor, zoom/fps/scrubber, export
(PNG/strip/GIF), URL hash sync, mobile layout, production deployment of the
full asset set to Cloudflare Pages (including file-count/size handling for the
complete spritesheet set). The slice is verified **locally only**; Cloudflare
deployment and the full asset strategy are deferred sub-projects.
