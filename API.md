# `@lpc-toolkit/core` — public API surface

This document captures the **proposed** public API of `packages/core/` after
Step 1.2. Every function is a stub (`throw new Error('not implemented')`); the
goal of this round is to lock the shape of the API before any logic is written.

Cross-references: `RESEARCH.md` Section A (logic to lift), Section B (DI
seams), Section D (Decisions D.1–D.4).

Tags used below:
- **🟢 stable** — I am confident in this shape; please review and confirm.
- **🟡 uncertain** — Reasonable defaults chosen; flagged questions below.
- **🔴 deferred** — Stubbed at the simplest viable shape; will revisit.

---

## `result.ts` 🟢

```ts
type Result<T, E> =
  | { readonly ok: true;  readonly value: T }
  | { readonly ok: false; readonly error: E };

const ok:       <T>(value: T) => Result<T, never>;
const err:      <E>(error: E) => Result<never, E>;
const isOk:     <T, E>(r: Result<T, E>) => r is { ok: true;  value: T };
const isErr:    <T, E>(r: Result<T, E>) => r is { ok: false; error: E };
const unwrapOr: <T, E>(r: Result<T, E>, fallback: T) => T;
```

**Rationale.** Decision D.2: we use only the smallest surface of
`neverthrow`, so a 20-line discriminated union avoids the dependency. The
shape `{ ok, value | error }` is intentionally identical to `neverthrow`'s
public field names so future contributors recognise it.

**Note.** Most public functions in this API do **not** currently return
`Result` — they throw on programmer error and reject on async failure (see
"Open question O.1" below). `Result` is exported as a primitive available
to callers and for internal use where partial failure is meaningful.

---

## `types.ts` — shared types 🟡

```ts
type TypeName      = string;   // selection group key, e.g. 'body', 'head'
type ItemId        = string;   // unique key in Catalog.byItemId
type BodyType      = string;   // 'male', 'female', 'muscular', …
type AnimationName = string;   // 'walk', 'idle', 'wheelchair', …
type FilePath      = string;
type License       = string;   // 'CC0', 'CC-BY 4.0', 'GPL 3.0', …

interface RawLayer {
  zPos: number;
  custom_animation?: string;
  [bodyType: string]: number | string | undefined; // body-type → folder path
}

interface CreditEntry {
  file: FilePath; notes: string;
  authors: readonly string[];
  licenses: readonly License[];
  urls: readonly string[];
}

interface RecolorConfig { material: string; palettes: unknown /* TODO */ }

interface ItemDefinition {
  name: string;
  type_name: TypeName;
  animations: readonly AnimationName[];
  credits: readonly CreditEntry[];
  recolors?: readonly RecolorConfig[];
  variants?: readonly string[];
  tags?: readonly string[];
  required_tags?: readonly string[];
  replace_in_path?: …;
  priority?: number;
  match_body_color?: boolean;
  preview_row?: number; preview_column?: number;
  [layerKey: `layer_${number}`]: RawLayer | undefined; // layer_1..layer_N
}

interface Catalog {
  byItemId:    ReadonlyMap<ItemId, ItemDefinition>;
  byTypeName:  ReadonlyMap<TypeName, readonly ItemDefinition[]>;
  typeNames:   readonly TypeName[];
  aliases:     ReadonlyMap<TypeName, TypeName>; // e.g. sash → waistband
}

interface Selection {
  typeName: TypeName;
  name: string;
  variant?: string;
  recolor?: string;
}

interface Selections {
  bodyType: BodyType;
  items: Readonly<Record<TypeName, Selection>>;
}

interface LayerSpec {
  itemId: ItemId; typeName: TypeName;
  path: FilePath; zPos: number;
  customAnimation?: string;
}

interface CreditsManifest {
  entries:  readonly CreditEntry[];
  licenses: readonly License[];
}

interface ComposedSheet {
  canvas: unknown;          // CanvasLike — see adapters.ts (TODO: refine)
  width: number; height: number;
  selections: Selections;
  credits: CreditsManifest;
  layers: readonly LayerSpec[];
  animations: readonly AnimationName[];
}

interface ComposedAnimation {
  canvas: unknown;          // CanvasLike (TODO: refine)
  width: number; height: number;
  animation: AnimationName;
  frameCount: number;
  directions: 1 | 4;
  credits: CreditsManifest;
}
```

**Rationale.**
- `ItemDefinition` mirrors the **raw JSON shape** from `sheet_definitions/`
  so callers can do `JSON.parse(fileText)` (cli) or
  `import.meta.glob(..., { eager: true })` (web) and feed straight in. No
  normalisation step before reaching core (D.1).
- Tagged-template index signature `[layerKey: \`layer_${number}\`]` keeps
  `layer_1`..`layer_9` strongly typed without enumerating each one
  individually.
- `BodyType`, `AnimationName`, `License` are aliases of `string` rather
  than literal unions, so adding a new body type or animation upstream
  doesn't require a core code change. The trade-off is no autocomplete /
  exhaustiveness for these — flagged as O.4 below.
- `ComposedSheet.credits` is **on the result type**, not a separate fetch:
  per hard rule 5 ("credits 跟著合成走"), the caller cannot forget them.
- `ComposedSheet.canvas` is typed `unknown` (with a TODO) because typing
  it as `CanvasLike` from `adapters.ts` creates an awkward cross-file
  coupling for what is essentially an opaque handle. See O.2 below.

---

## `adapters.ts` 🟢

```ts
interface ImageLike     { width: number; height: number; }
interface ImageDataLike { data: Uint8ClampedArray; width: number; height: number; }

interface Context2DLike {
  drawImage(image, dx, dy): void;
  drawImage(image, dx, dy, dw, dh): void;
  drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh): void;
  getImageData(sx, sy, sw, sh): ImageDataLike;
  putImageData(imageData, dx, dy): void;
  clearRect(x, y, w, h): void;
}

interface CanvasLike {
  width: number; height: number;
  getContext(contextId: '2d'): Context2DLike;
}

interface CanvasAdapter {
  createCanvas(width: number, height: number): CanvasLike;
  loadImage(path: string): Promise<ImageLike>;
}
```

**Rationale.** Hard rule 4: core must be environment-agnostic. The shapes
above are the **minimal subset** of the browser's `HTMLCanvasElement` /
`CanvasRenderingContext2D` / `HTMLImageElement` actually used by the
upstream renderer (see RESEARCH.md Section B). Both browser DOM types and
`node-canvas` already satisfy these structurally, so adapters are zero-cost
wrappers (browser: `{ createCanvas: (w,h) => Object.assign(document.createElement('canvas'), {width:w,height:h}), loadImage: ... }`).

`loadImage` takes a `string` URL/path; the adapter decides whether that
means a URL, a `file://` URI, or a filesystem path.

---

## `catalog.ts` 🟢

```ts
interface CatalogLoadWarning { path: FilePath; message: string; }
interface CreateCatalogResult {
  catalog: Catalog;
  warnings: readonly CatalogLoadWarning[];
}

function createCatalog(
  records: Readonly<Record<FilePath, ItemDefinition>>
): CreateCatalogResult;
```

**Rationale.** Decision D.1: catalog ingestion is source-agnostic. Caller
hands core a plain object keyed by file path (web supplies
`import.meta.glob` output; cli supplies the result of walking
`sheet_definitions/`). Core builds the `byItemId` / `byTypeName` / alias
indexes once at startup.

Returning `{ catalog, warnings }` instead of `Result<Catalog, …>` because
partial failures are non-fatal — a single malformed JSON file should not
prevent the rest of the catalog from loading. Hard failures (no items at
all, totally empty input) will throw.

---

## `compose.ts` 🟡

```ts
interface ComposeOptions {
  catalog: Catalog;
  adapter: CanvasAdapter;
  spritesheetsBaseUrl: string;            // resolved by adapter.loadImage
  animations?: readonly AnimationName[];  // default: all 15 standard names
  onProgress?: (loaded: number, total: number) => void;
}

function composeSelections(
  selections: Selections,
  options: ComposeOptions
): Promise<ComposedSheet>;

function getSpritePathsForSelections(
  selections: Selections,
  catalog: Catalog
): readonly LayerSpec[];
```

**Rationale.**
- `composeSelections` is the headline function: hand it `Selections` + an
  adapter, get back a canvas-like with credits attached. Hard rule 3: it
  **returns** a canvas, it does not write a file. Callers decide what to
  do with the output (web: render to DOM; cli: encode to PNG via adapter).
- `getSpritePathsForSelections` exposes the resolution step on its own so
  callers can preview which PNGs *would* load before paying for I/O, and
  so tests can assert path resolution without touching a canvas.
- `spritesheetsBaseUrl` is a string the adapter interprets — separates
  "what catalog says the relative path is" (`body/bodies/male/walk.png`)
  from "where the files actually live" (a CDN URL, a local folder).
- `onProgress` replaces the upstream Mithril `m.redraw()` poke (RESEARCH.md
  §3.5). Optional — callers that don't care can ignore it.

---

## `credits.ts` 🟡

```ts
function getCredits(selections: Selections, catalog: Catalog): CreditsManifest;
function computeEffectiveLicense(credits: CreditsManifest): License;
```

**Rationale.** Decision D.4: credits come from each item's `credits[]`
array (already in the sheet definition JSON); we don't parse
`CREDITS.csv`. `getCredits` walks the selected items, collects credit rows
that match the PNGs actually used, and dedupes.

`computeEffectiveLicense` exists because LPC assets mix CC0, CC-BY-X.X,
CC-BY-SA-X.X, OGA-BY-X.X, GPL-2.0, GPL-3.0 — the union is governed by
license compatibility rules (CC0 + CC-BY → CC-BY; +GPL → GPL; etc.). We
need a single canonical answer for attribution UI. **Implementation
flagged as O.3: license compatibility matrix needs spec.**

---

## `hash.ts` 🟡

```ts
interface HashWarning {
  key: string; value: string;
  reason: 'unknown_type_name' | 'unknown_item' | 'unknown_variant'
        | 'unknown_recolor' | 'malformed';
}

interface ParseHashResult {
  selections: Selections;
  warnings:    readonly HashWarning[];
  unknownKeys: readonly TypeName[];
}

function parseHash(hash: string, catalog: Catalog): ParseHashResult;
function serializeHash(selections: Selections): string;
```

**Rationale.** Hash parsing is permissive (upstream `loadSelectionsFromHash`
silently skips unresolvable keys). Rather than `Result<Selections, …>`,
we return both the best-effort `Selections` and a list of `warnings` for
the UI to display ("we couldn't load `head=Banana_yellow` — was that
removed?"). This is **a deviation from the user-stated signature
`Selections` directly**; flagged as O.5 below.

`serializeHash` produces the exact format upstream emits
(`sex=…&body=…&head=…`) so existing bookmarks keep working.

---

## `animation.ts` 🟡

```ts
interface ExtractAnimationOptions {
  adapter: CanvasAdapter;
}

function extractAnimation(
  sheet: ComposedSheet,
  name: AnimationName,
  options: ExtractAnimationOptions
): ComposedAnimation;
```

**Rationale.** Mirrors `liberated-pixel-cup`'s two-step output (RESEARCH.md
Section E). `composeSelections` produces the 832×3456 master sheet;
`extractAnimation` crops one animation's row group out and returns a
smaller canvas. `directions: 1 | 4` reflects that `hurt` and `climb` are
single-row animations while everything else is 4-row.

---

## Open questions for review

**O.1 — Should `composeSelections` return `Promise<Result<…>>` instead of `Promise<ComposedSheet>`?**
Currently it rejects on error. Result-wrapped would be more consistent
with D.2 and avoid try/catch at call sites, at the cost of one indirection.
My weak preference is the current shape — Promise rejection is idiomatic
for I/O errors and we don't have many "semantic" error cases in compose.
Confirm or flip?

**O.2 — `canvas: unknown` on `ComposedSheet` / `ComposedAnimation`.**
Should it be `CanvasLike` (cross-module dep from `types.ts` →
`adapters.ts`) or stay `unknown` so callers cast to their concrete type?
I lean `CanvasLike`; if you agree I'll thread the dep.

**O.3 — License compatibility matrix.**
`computeEffectiveLicense` needs a definition of "most restrictive
compatible license". Options:
(a) Hard-code a small matrix in core (CC0 < CC-BY < CC-BY-SA < GPL).
(b) Caller supplies the matrix as a parameter.
(c) Return the multiset and let the caller format it (drop the function).
My pick: (a). Confirm?

**O.4 — `BodyType` / `AnimationName` / `License` as `string` vs literal unions.**
Currently aliases of `string` (no autocomplete, no exhaustiveness).
Trade-off: harder to evolve via JSON-only additions if we make them unions.
Recommend keeping `string` for `BodyType`/`AnimationName` (open data) and
making `License` a literal union (closed list per `state/constants.ts`).
OK?

**O.5 — `parseHash` returns `ParseHashResult` not `Selections`.**
This deviates from your stated signature. Reason: hash parsing has
expected partial failure (old bookmarks pointing at items that have been
renamed). Returning warnings keeps the API honest. Revert if you want a
strict `Selections` return.

**O.6 — `Selection` does not carry `itemId`.**
We can re-derive `itemId` via `catalog.byTypeName` lookups whenever
needed. Including it makes `Selection` non-serializable without a
catalog and risks getting stale. Keeping it out feels right; confirm?

**O.7 — `spritesheetsBaseUrl` on `ComposeOptions` vs. inside `CanvasAdapter`.**
Currently on `ComposeOptions`. Alternative: bake into `loadImage` (the
adapter knows the base). Slight preference for the current shape because
it keeps the adapter generic. Confirm?

**O.8 — Recolor pipeline shape.**
Decision D.3 says CPU recolor lives in core for v1. I have **not** added
an API for it in this round (no `recolorImage(...)` or
`applyPaletteToLayer(...)` yet) because I want to confirm the rest of the
surface first. Likely shape:
```ts
function recolorImage(image: ImageLike, recolor: RecolorSpec): ImageLike;
```
…where `RecolorSpec` resolves a `material → palette` swap against the
item's `recolors[]`. Add it in Step 1.3 once the rest is locked.

---

## What I did *not* add (deliberate)

- No filesystem helpers, no URL helpers, no `fetch` calls. All I/O
  goes through `CanvasAdapter`.
- No exported globals or singletons. Compose is a pure function plus an
  injected adapter.
- No `palette.ts` / recolor API (deferred, see O.8).
- No filters / tags API. Filtering is UI-side; core just exposes the
  underlying `tags` and `required_tags` fields on `ItemDefinition`.
- No upstream Mithril `m.redraw()` callbacks. `onProgress` replaces them
  in a framework-agnostic way (RESEARCH.md §C).
