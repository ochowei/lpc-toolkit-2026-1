# RESEARCH — upstream LPC reconnaissance

Read-only investigation of `upstream/` (commit
`5734bee822ff2285b9fd513f972987c4976543b5` of
`LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator`) and a quick
look at `tylerlong/liberated-pixel-cup`. No code was written, no packages
installed, no `packages/` directory created, nothing in `upstream/` was
modified. The submodule was initialised so the files could be read.

---

## 1. Upstream build tooling and entry point

- `upstream/package.json`: type `module`, name
  `universal-lpc-spritesheet-character-generator`, private, **GPL implied via
  upstream LICENSE (we already inherit GPL-3.0)**. Build is **Vite 8 +
  TypeScript 6**; dev with `npm run dev` (port 5173), build with
  `npm run build`, preview with `npm run preview` (port 4173).
- Entry HTML: `upstream/index.html`. Application bootstrap is
  `upstream/sources/main.ts`; UI framework is **Mithril 2** (`mithril` is a
  runtime dependency).
- `vite.config.js` registers a chain of custom plugins from `upstream/vite/`
  that pre-generate **5 metadata modules** into `dist/` at build time:
  `index-`, `palette-`, `item-`, `credits-`, `layers-metadata.js`. These are
  registered in `sources/state/catalog.ts` via dynamic import chunks. The
  `dist/` tree is gitignored — generated, not committed.
- Other runtime dependencies of note: `jszip` (zip export), `neverthrow`
  (Result types throughout), `bulma` + `classnames` (CSS), `tinygesture`
  (touch). All MIT-compatible with GPL-3.0.

## 2. `sheet_definitions/` JSON schema

Reviewed: `body/body.json`, `head/faces/face_blush.json`,
`hair/afro/hair_afro.json`, `weapons/magic/weapon_magic_wand.json`, plus the
near-empty `body/meta_body.json` (category-level config).

**Common fields**

- `name` (string, human label)
- `type_name` (string, selection group key — same as the URL hash key)
- `layer_1`, `layer_2`, … (object per layer; the renderer iterates
  `layer_1`..`layer_9` and stops on the first missing one)
- Inside each `layer_N`:
  - `zPos` (number — global z-order, lower drawn first / behind)
  - One key per **body type** (`male`, `female`, `muscular`, `teen`, `child`,
    `pregnant`, etc.) whose value is a folder path under `spritesheets/`. Not
    all body types appear — items only declare the bodies they support.
  - Optionally `custom_animation` (string, e.g. `"wheelchair"`, `"tool_rod"`)
    — flags this layer as belonging to an oversize/non-standard animation,
    rendered in a separate area below the universal sheet.
- `animations` (string[] — which named animations this item provides)
- `credits` (array of `{file, notes, authors[], licenses[], urls[]}` — used
  for attribution, see §4)
- `recolors` (optional, palette recolor config: `{material, palettes}`)

**Z-position**

- Authored on each layer as the `zPos` integer literal.
- Lower zPos draws first (behind). Example values: shadow 0, body 10, head
  ~100, hair 120, weapon 140, face expressions 101.
- There is also a *generated* zPos override layer — see
  `scripts/zPositioning/parse_zpos.js` and `update_zpos.js` (CSV produced by
  `npm run z-positions`). At runtime `getZPos(itemId, layerNum)` (in
  `canvas/canvas-utils.ts`) reads from the merged catalog, so the runtime
  source of truth is the catalog, not the raw JSON.

**Variants, sub-categories, tags**

- `variants` (string[], present on weapons/clothing — e.g. wand has
  `["wand"]`; body items have e.g. `["light", "dark", "tanned2"]`). Files in
  `spritesheets/.../<anim>/<variant>.png` follow `variant -> filename` via
  `variantToFilename()`.
- `tags` and `required_tags` (string[]; see `face_blush.json` which declares
  `tags: ["expression"]` and `required_tags: ["human"]`). Used by the filters
  UI and to enforce compatibility (e.g. only show human expressions when a
  human head is selected).
- `recolors` is a parallel system: a single base PNG plus per-palette colour
  swaps performed in WebGL (`canvas/webgl-palette-recolor.ts`) or as a CPU
  fallback (`canvas/palette-recolor.ts`).

**Cross-file dependencies**

- `replace_in_path` (object) maps another `type_name` value to a path
  fragment. `face_blush.json` has
  `"replace_in_path": { "head": { "Human_Male": "male", ... } }` and its
  layer path is `head/faces/${head}/blush/`. At render time
  `replaceInPath()` in `state/path.ts` substitutes the currently selected
  `head` item's name through this map. So a face layer depends on which head
  is selected, but only via name → path-fragment lookup.
- `priority` (number, e.g. body=10) drives selection-list ordering /
  defaulting.
- `meta_<category>.json` files (e.g. `body/meta_body.json`) carry
  category-level defaults like `{"priority": 10}`.

**Fields present on some files but not others**

- `match_body_color` (body, expressions): tells the recolor system to mirror
  body palette
- `preview_row`, `preview_column` (weapons): chooses a thumbnail
- `required_tags` (expressions, jewellery): compatibility gate
- `tags` (expressions, body markings): filter facets
- `replace_in_path` (anything dependent on another selection)
- `custom_animation` on a layer (wheelchair, oversize tools)
- `recolors` (anything that supports palette swap)
- `variants` (anything with multiple file-level variants)

## 3. Core composition logic — where it lives, how DOM-bound

The composition pipeline lives in **`upstream/sources/canvas/`** (rendering
plumbing) and **`upstream/sources/state/`** (catalog, selections, paths).
The relevant files and how DOM-coupled each one is:

| File | Pure? | DOM dependency |
| --- | --- | --- |
| `state/path.ts` (`getSpritePath`, `replaceInPath`, `getNameWithoutVariant`) | **Pure** | none |
| `state/meta.ts` (`getSortedLayers`, `getSortedLayersByAnim`, `getLayersToLoad`) | **Pure** | none |
| `state/hash.ts` (URL hash ↔ selections) | **Mostly pure** | reads/writes `window.location.hash`, calls `m.redraw()` |
| `state/constants.ts` (animations, offsets, frame size, license list) | **Pure** | none |
| `state/catalog.ts` (Result-returning registry) | **Pure** | none — but loads via dynamic `import()` of generated chunks |
| `state/palettes.ts`, `state/filters.ts`, `state/resolve-hash-param.ts` | **Pure** | none (not read in full, named in imports) |
| `utils/helpers.ts` (`variantToFilename`, `es6DynamicTemplate`) | **Pure** | none |
| `custom-animations.ts` (wheelchair/tool_rod frame layouts) | **Pure data** | none |
| `canvas/canvas-utils.ts` | Mixed | `getContext("2d")`, `getImageData`, `toBlob` |
| `canvas/load-image.ts` | DOM | `new Image()`, sets `img.src` to a URL string |
| `canvas/renderer.ts` (`renderCharacter`, `renderSingleItem`, `extractAnimationFromCanvas`) | DOM | `document.createElement("canvas")`, `drawImage`, also `m.redraw()` and writes back into an app-state singleton |
| `canvas/palette-recolor.ts` + `webgl-palette-recolor.ts` | DOM/WebGL | `OffscreenCanvas` / `WebGL2RenderingContext` |
| `canvas/draw-frames.ts`, `mask.ts`, `preview-animation.ts`, `preview-canvas.ts`, `download.ts` | DOM | canvas + DOM events |

**Obstacles to lifting to `packages/core/`**

1. `renderer.ts` allocates the canvas with `document.createElement("canvas")`
   and reads `window.profiler`. Also imports the **Mithril `m.redraw()`** to
   poke the UI when rendering starts/ends, and mutates a global
   `appState.renderCharacter.isRendering`.
2. `load-image.ts` uses `new Image()` and the `window.profiler`. In Node we
   would need a `loadImage(url) -> ImageBitmap | Image-like` injected.
3. `canvas-utils.ts` uses `HTMLCanvasElement.toBlob`, `getImageData`.
4. The catalog reads metadata via dynamic `import()` of code-split chunks
   (`install-item-metadata.ts`). That is browser-friendly but for a pure-core
   library we want it to take pre-parsed JSON, not loaded JS modules.
5. There is module-level mutable state (`canvas`, `ctx`, `layers`,
   `itemsToDraw`, `addedCustomAnimations`, `customAreaItems` all exported as
   `let`s from `renderer.ts`). This is the singleton renderer pattern — it
   needs to become a class or a function that returns its own state.

The encouraging news: the heavy lifting (which layers, what z-order, what
file paths, what animation rows, what palette to apply) is in `state/` and
**already pure**. The DOM-touching surface is small and well-isolated to
`canvas/renderer.ts` + `canvas/load-image.ts` + `canvas/canvas-utils.ts`.

## 4. `CREDITS.csv` structure

- Header: `filename,notes,authors,licenses,urls` (CSV with quoted fields;
  internal commas inside `authors`, `licenses`, `urls` are comma-separated
  inside the quoted cell — i.e. **inner CSV inside CSV**, must split on `,`
  after parsing the outer quoted cell).
- `filename` is the path relative to `spritesheets/` including the animation
  PNG, e.g. `body/bodies/male/spellcast.png`. So credits are keyed by **PNG
  file**, not by item or directory.
- One row per `(category-folder × animation)` pair (e.g.
  `body/bodies/male/walk.png`, then `body/bodies/male/slash.png`, …).
- The same data lives in each sheet definition's `credits[]` array — the CSV
  is generated from those by `scripts/generate_credits.js`. So our `core`
  can derive credits directly from the sheet definitions and we do not need
  to parse the CSV at all (the CSV is the distribution artefact, not the
  source of truth).
- Observed licenses across the sample: `CC0`, `CC-BY 3.0/4.0`,
  `CC-BY-SA 3.0/4.0`, `OGA-BY 3.0/4.0`, `GPL 2.0/3.0`. The canonical list
  lives in `state/constants.ts` → `LICENSE_CONFIG`.

## 5. URL hash ↔ sheet definition mapping

Worked example:
`#sex=male&body=Body_color_light&head=Human_male_light&expression=Neutral_light`

- The key is the item's `type_name` (`body`, `head`, `expression`, … — i.e.
  the **selection group**, not the directory). `sex` is a backwards-compat
  alias for `bodyType` (see `state/hash.ts` → `loadSelectionsFromHash`, lines
  300–308).
- The value is `Name_variant[|recolor]` where:
  - `Name` is the item's `name` field with spaces → underscores
    (`"Body color"` → `Body_color`).
  - `variant` matches against the item's `variants[]` (or
    `recolors[0].variants[]`) using a longest-suffix scan in
    `state/path.ts` → `getNameWithoutVariant` (because both `name` and
    `variant` may contain underscores, e.g. `Human_female_light`).
  - `recolor` after `|` (if present) picks a palette swap target.
- Resolution flow (`loadSelectionsFromHash`):
  1. Check alias table from generated `alias-metadata` (`getAliasMetadata()`)
     for shortcut keys like `sash` → `waistband`.
  2. Look up by `(typeName, nameAndVariant)` via `resolveHashParam` against
     the generated **`itemsByTypeName` index** in
     `state/resolve-hash-param.ts`.
  3. If still unresolved, retry as a sub-item (a recolor target of another
     selected item).
  4. Build a `Selection` via `buildNewSelection`.

**Is there a single metadata file describing this?** Yes, but it is
**generated at build time** into `dist/`:

- `dist/index-metadata.js` and `dist/item-metadata.js` carry the
  `itemsByTypeName` lookup (`typeName -> array of {name, variants, recolors,
  required_tags, …}` rows).
- `dist/credits-metadata.js`, `dist/palette-metadata.js`,
  `dist/layers-metadata.js` are the other four chunks.

These are produced by the Vite plugins under `upstream/vite/` from the JSON
files in `sheet_definitions/`. We can either (a) reproduce the plugin to
emit similar JSON, or (b) write a smaller equivalent that walks
`sheet_definitions/` at build time and produces one JSON manifest. Option
(b) is much cheaper than recreating Vite plugins.

## 6. Animations and spritesheet layout

- **Frame size:** 64 × 64 px (`FRAME_SIZE = 64` in `state/constants.ts`).
- **Per-animation PNG layout:** each PNG is `4 rows × N columns × 64px`,
  where 4 rows = directions `up, left, down, right` (`DIRECTIONS` constant)
  and N is the frame count for that animation. Confirmed by inspecting
  actual PNGs:
  - `body/bodies/male/walk.png` → 576 × 256 → 9 cols × 4 rows
  - `body/bodies/male/idle.png` → 128 × 256 → 2 cols × 4 rows
  - `body/bodies/male/jump.png` → 320 × 256 → 5 cols × 4 rows
- **Universal compositing sheet:** `SHEET_WIDTH = 832` (13 × 64),
  `SHEET_HEIGHT = 3456`. The renderer creates this big canvas, then draws
  each animation's per-animation PNG at the y-offset given by
  `ANIMATION_OFFSETS`:

| Animation | y-row offset | y-pixels | rows |
| --- | --- | --- | --- |
| spellcast | 0 | 0 | 4 |
| thrust | 4 | 256 | 4 |
| walk | 8 | 512 | 4 |
| slash | 12 | 768 | 4 |
| shoot | 16 | 1024 | 4 |
| hurt | 20 | 1280 | 1 |
| climb | 21 | 1344 | 1 |
| idle | 22 | 1408 | 4 |
| jump | 26 | 1664 | 4 |
| sit | 30 | 1920 | 4 |
| emote | 34 | 2176 | 4 |
| run | 38 | 2432 | 4 |
| combat_idle | 42 | 2688 | 4 |
| backslash | 46 | 2944 | 4 |
| halfslash | 50 | 3200 | 4 |

  (Full table in `state/constants.ts` → `ANIMATION_OFFSETS`.) The cycle
  arrays in `ANIMATION_CONFIGS` tell consumers which frame indexes to play
  back, e.g. `walk: cycle [1,2,3,4,5,6,7,8]`,
  `shoot: cycle [0..12]` (13 frames), `idle: cycle [0,0,1]`.
- **Names of animations** are defined in `state/constants.ts` → `ANIMATIONS`
  (the array of `{value, label, folderName?, noExport?}`) and copied into
  each item's `animations[]` field in its JSON.
- **Custom animations** (oversize) are defined in
  `sources/custom-animations.ts` as `{ frameSize, frames[][] }` keyed by
  name (`wheelchair`, `tool_rod`, …). Their compositing area is appended
  below `SHEET_HEIGHT` at runtime (see `renderer.ts` lines ~404–445).

## 7. UI ↔ logic coupling in upstream

`upstream/sources/components/` is **Mithril 2** (`m.Component`).
`App.ts` (read first ~40 lines) keeps `prevSelections` / `prevBodyType` in
component state and on `onupdate` calls
`syncSelectionsToHash()` then `window.canvasRenderer.renderCharacter(…)`.
That is a textbook "redraw on every change" pattern.

The separation is **better than I expected**:

- All composition logic is in `state/*` (pure) and `canvas/*` (DOM but
  framework-agnostic — no Mithril imports except `m.redraw()` calls in
  `renderer.ts` and a Mithril import in `hash.ts` to trigger redraw).
- `components/*` only orchestrates selections (`selections/*`), filters
  (`FiltersPanel.ts`, `filters/*`), preview (`preview/AnimationPreview.ts`,
  `preview/FullSpritesheetPreview.ts`, etc.), and download/zip
  (`download/*`).
- The one real coupling is that `renderer.ts` calls `m.redraw()` and writes
  into `state.state.renderCharacter.isRendering`. That is a "tell the UI we
  are busy" side-effect — easy to remove or hide behind a callback.

Anti-patterns to be aware of:

- Module-level mutable singletons in `renderer.ts` (`canvas`, `ctx`,
  `layers`, …) and `state/state.ts`. Acceptable in the existing app, but we
  must not import those globals from React components.
- The selections object is keyed by `type_name`, so two items with the same
  `type_name` are mutually exclusive at the data model level (that is the
  feature, not a bug, but it surprises newcomers).

## 8. `tylerlong/liberated-pixel-cup` quick read

Public mirror of a Node + TypeScript composition library at
<https://github.com/tylerlong/liberated-pixel-cup>. From its README and
`src/index.ts`:

```ts
const lpc = new LPC('/local/path/to/sprite/sheet/folder');
const buffer = await lpc.overlay(
  lpc.body().male().dark(),
  lpc.hair().male().long().blue(),
);

const animations = await Animations.fromBuffer(buffer);
animations.saveToFile(path.join(__dirname, 'animations'));
```

- 100% TypeScript, Jest-tested, Yarn-managed.
- Top-level class `LPC` extends a `Root` class which imports from
  `'./generated'` — the catalog is **code-generated** from the upstream
  asset tree, not driven by the JSON files at runtime.
- Uses Node `fs` and `Buffer`; no DOM. Splits the composed sheet into
  per-animation PNGs via a second class `Animations`.
- License not explicitly visible on the landing page; would need to be
  verified before vendoring any code.

## Section A — Logic that can be lifted verbatim into `packages/core/`

These files are already pure TypeScript with no DOM dependency. They are
the obvious first port of call when we scaffold `packages/core/src/`.

| Upstream file | Core role |
| --- | --- |
| `sources/state/constants.ts` | Animation names, frame size, animation offsets, animation cycles, body types, license config |
| `sources/state/path.ts` | `getSpritePath`, `replaceInPath`, `getNameWithoutVariant` — selection → file path resolution |
| `sources/state/meta.ts` | `getSortedLayers`, `getSortedLayersByAnim`, `getLayersToLoad`, `getSortedLayersWithCustomFallback` |
| `sources/state/catalog.ts` (types and getters only, **without** the dynamic-import side-effect) | `ItemMerged`, `ItemLite`, `PaletteRecolor`, `MetadataIndexes`, `LoadError` types and Result-returning getters |
| `sources/state/resolve-hash-param.ts` | Generic hash-param resolution against the `itemsByTypeName` index |
| `sources/state/hash.ts` *parsing only* (`getHashParamsFromString`, `createHashStringFromParams`, `getHashParamsforSelections`, `buildNewSelection`) | URL hash ↔ selection structure conversion |
| `sources/utils/helpers.ts` (`variantToFilename`, `es6DynamicTemplate`) | String utilities used by path resolution |
| `sources/custom-animations.ts` | Wheelchair / tool_rod frame layouts |
| `sources/state/filters.ts`, `state/palettes.ts` | Filters and palette config (not read in full but imports only pure deps) |

The corresponding `neverthrow` Result API is small; we can either keep
`neverthrow` or replace with a tiny in-house tagged-union if we want zero
runtime deps in core.

## Section B — DOM-bound code we must refactor to dependency injection

These need a small injection seam before they can live in environment-
agnostic core:

| Upstream file | What is DOM-bound | DI strategy |
| --- | --- | --- |
| `sources/canvas/renderer.ts` (`renderCharacter`, `renderSingleItem`, `renderSingleItemAnimation`) | `document.createElement("canvas")`, `getContext("2d")`, `drawImage`, `m.redraw()`, module-level singletons, `window.profiler` | Pass a `{ createCanvas(w,h), loadImage(url) }` adapter; remove `m.redraw` (replace with optional `onProgress` callback or remove); have function **return** the canvas/result instead of mutating a singleton |
| `sources/canvas/load-image.ts` (`loadImage`, `loadImagesInParallel`) | `new Image()`, `img.src = src`, `window.profiler` | Replace with injected `loadImage: (path: string) => Promise<CanvasImageSource>` — browser supplies `HTMLImageElement`/`createImageBitmap`, Node CLI supplies `node-canvas` `loadImage`, both satisfy `drawImage` signature |
| `sources/canvas/canvas-utils.ts` (`canvasToBlob`, `get2DContext`, `getZPos`, `hasContentInRegion`, `drawTransparencyBackground`) | `HTMLCanvasElement.toBlob`, `getContext`, `getImageData` | Move `getZPos` to core (pure — depends only on catalog). The canvas helpers stay in an adapter package or move to a `canvas/` subpath that depends on the DI primitives |
| `sources/canvas/palette-recolor.ts`, `webgl-palette-recolor.ts` | `OffscreenCanvas`, `WebGL2RenderingContext` | Defer. WebGL path stays browser-only; CPU path could be made env-agnostic by using a `getImageData`-style API on whatever the injected canvas is |
| `sources/canvas/draw-frames.ts`, `mask.ts`, `preview-animation.ts`, `preview-canvas.ts`, `download.ts` | DOM canvas | `draw-frames.ts` likely portable behind the same canvas-adapter; the preview/download files are app-specific and we will re-implement in React |

## Section C — UI code we will not reuse (we rewrite in React)

Everything under `upstream/sources/components/` and any module that imports
`mithril`. We will **not** copy this code; we will instead model the same
state — selections, filters, body type, animation choice, custom uploaded
image — using React + a single `useReducer` (or Zustand if it grows). The
Mithril `m.redraw()` plumbing in `renderer.ts` / `hash.ts` is dropped
entirely; React re-renders on state change.

Specifically discarded:

- `components/App.ts`, `components/CollapsibleSection.ts`,
  `components/FiltersPanel.ts`
- `components/preview/*` (we will write our own `<CharacterPreview />`,
  `<AnimationPreview />`, scroll/zoom containers in React)
- `components/selections/*` (selection lists — replace with shadcn/ui
  combobox / accordion)
- `components/tree/*`, `components/filters/*`, `components/advanced/*`,
  `components/download/*` (Bulma-styled, redo with Tailwind + shadcn/ui)
- `styles/`, `index.html`, `lang/`, `playwright.config.js`, `testem.cjs`
- Bulma + `classnames` dependencies do not come with us
- `m.redraw()` calls in `renderer.ts:223,571` and the Mithril import in
  `state/hash.ts` are removed in our fork-in-core

## Section D — Uncertain / needs further research

1. **Generated metadata structure.** I have not yet inspected the actual
   shape of `dist/index-metadata.js`, `dist/item-metadata.js`,
   `dist/palette-metadata.js`, `dist/credits-metadata.js`,
   `dist/layers-metadata.js`. The catalog reads them as ES modules. To
   reproduce them we need either to (a) study
   `upstream/vite/vite-plugin-item-metadata.js` and the wiring in
   `upstream/vite/wiring.js`, or (b) write our own much-smaller manifest
   builder. **Recommendation:** option (b) — walk `sheet_definitions/` at
   `core` build time and emit a single typed JSON manifest. Defer to the
   build-tooling task.
2. **`scripts/zPositioning/`** — generates a CSV of z-position overrides.
   We need to decide whether to consume that CSV or re-derive zPos from
   each layer's `zPos` field. The runtime path is
   `getZPos(itemId, layerNum)` → catalog → `layer.zPos`, which suggests the
   CSV is informational/validation only. Worth a 10-minute confirmation
   before we commit.
3. **Palette recolor pipeline** (`palette-recolor.ts`,
   `webgl-palette-recolor.ts`, `state/palettes.ts`). Not read in detail.
   Needed for "Body color" and any items with `recolors`. Decision needed:
   ship recoloring in v1 of the web app (much nicer UX) or skip it and
   only allow files that exist on disk (faster shipping). The latter
   sacrifices many of the body colours.
4. **`upstream/sources/install-item-metadata.ts`** dynamic import plumbing.
   Currently `state/catalog.ts` imports it as a side-effect. In core we
   must replace it with a sync "register this pre-loaded JSON" entry point.
5. **Sub-items / recolors as separate selections.** `loadSelectionsFromHash`
   has a second pass that splits a hash entry into a sub-item selection
   based on a separator `' '`. The exact rules are subtle (see lines
   354–399 of `state/hash.ts`) and warrant a focused test before we copy
   them.
6. **`replace_in_path` template completeness.** Are there cases where a
   path uses `${typeName}` but the target item has no `replace_in_path`
   entry? `state/path.ts:replaceInPath` emits a `debugLog` warning in that
   case — we should grep production data to know if it actually happens.
7. **`tylerlong/liberated-pixel-cup` license** — page did not show one. If
   we want to vendor anything from it (we probably do not), we must check.

### Decisions (2026-05-15)

Resolutions to questions D.1–D.4 above. Items D.5–D.7 remain open and will
be revisited as they arise.

**D.1 / D.4 Catalog ingestion → hybrid, core stays source-agnostic.**
Core accepts a `Record<path, ItemDefinition>` and builds its own indexes
(`byTypeName`, `byItemId`, alias map) at module load. Web feeds it via
`import.meta.glob('../../upstream/sheet_definitions/**/*.json',
{ eager: true })`; CLI feeds it via a small `fs.readdirSync(..., {
recursive: true })` walker. No self-authored Vite plugins; no dynamic
chunk loading. Trade-off: all JSON in memory at startup (~ a few hundred
KB; acceptable).

**D.3 Palette recolor → CPU recolor in core for v1; WebGL deferred.**
CPU recolor is pure `Uint8ClampedArray` pixel replacement — no canvas
required, lives in core, works in both Node and browser. Upstream
measures ~ 190–230 ms per sheet on CPU, acceptable for v1. A WebGL
accelerator can be added later as an optional adapter inside
`packages/web/` (environment-specific optimisations live outside core).

**D.2 (neverthrow) → roll a ~20-line in-house `Result<T, E>`.**
We only use `ok` / `err` / `isOk` / `isErr` / `unwrapOr` — the rest of
`neverthrow`'s surface (`andThen`, `mapErr`, `match`, etc.) is not
needed. Implementation as a discriminated union
`{ ok: true, value } | { ok: false, error }` keeps core dependency-free
and easy to read. Search-replace work during the upstream lift is
contained.

**D.bonus zPos → use the JSON `zPos` field; ignore the generated CSV.**
The runtime path (`getZPos` → catalog → `layer.zPos`) never reads the
CSV; the `scripts/zPositioning/` CSV is a dev-tooling validation
artefact for upstream maintainers. If any item JSON turns out to be
missing `zPos` and only the CSV has it, revisit — risk looks low based
on the four sampled JSON files.

## Section E — What to borrow / avoid from `tylerlong/liberated-pixel-cup`

**Borrow / take as inspiration**

- **Fluent builder for CLI.** `lpc.body().male().dark()` is a clean idiom
  for the CLI. Our `packages/cli/` could expose a thin fluent wrapper on
  top of the pure selection objects from core. Good ergonomics, optional.
- **Two-step output.** `overlay(...) → Buffer` then
  `Animations.fromBuffer(buffer)` cleanly separates "compose master sheet"
  from "split into per-animation PNGs". This matches our likely API split:
  `composeSheet(selections) → Canvas` then
  `extractAnimation(canvas, anim) → Canvas` (and on CLI: write to disk).
- **Returning the composed result instead of writing it into a singleton.**
  Upstream's `renderCharacter` writes into a shared canvas and exports
  module-level state. We should return the canvas from the function and
  let the caller place it where it belongs (React effect → state, CLI →
  `fs.writeFile`).

**Avoid**

- **Code-generated catalog.** The `Root extends from './generated'`
  pattern bakes the asset tree into TS at build time. Upstream's
  JSON-driven model is more flexible (adding a new item is just a JSON
  file) and we already inherit a richer catalog from it. Our core should
  consume the parsed `sheet_definitions/` JSON, not a generated TS
  hierarchy.
- **No animation cycle data.** From the README it is not obvious whether
  `tylerlong/liberated-pixel-cup` carries `ANIMATION_CONFIGS` cycle
  metadata. Upstream has the right data; we use upstream's `constants.ts`.
- **Node-only dependencies.** It is built for Node — we want core to be
  environment-agnostic, so its `Buffer` / `fs` choices are not directly
  reusable.

---

## Suggested next concrete steps

D.1–D.4 resolved (see "Decisions" inside Section D). Remaining:

1. Sketch the `packages/core/` public surface based on Sections A and B
   and the D-decisions — roughly `composeSelections(selections, opts)`,
   `getSpritePathsForSelections(...)`, `getCredits(selections)`,
   `parseHash(string)` / `serializeHash(selections)`, the canvas adapter
   interface (`createCanvas`, `loadImage`), and the catalog-ingestion
   entry point (`createCatalog(records: Record<path, ItemDefinition>)`).
2. Once the API is reviewed, scaffold the pnpm workspace and start
   porting the pure logic from Section A.
