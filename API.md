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
type License =                            // 12 values, verbatim from
  | 'CC0'                                 // upstream LICENSE_CONFIG
  | 'CC-BY'        | 'CC-BY 3.0'
  | 'CC-BY 3.0+'   | 'CC-BY 4.0'
  | 'CC-BY-SA 3.0' | 'CC-BY-SA 4.0'
  | 'OGA-BY 3.0'   | 'OGA-BY 3.0+'
  | 'OGA-BY 4.0'
  | 'GPL 2.0'      | 'GPL 3.0';

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

interface RecolorConfig {
  material: string;                // e.g. 'body'
  palettes: readonly string[];     // palette name IDs, e.g. ['ulpc', 'lpcr']
}

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
  canvas: CanvasLike;       // from adapters.ts
  width: number; height: number;
  selections: Selections;
  credits: CreditsManifest;
  layers: readonly LayerSpec[];
  animations: readonly AnimationName[];
}

interface ComposedAnimation {
  canvas: CanvasLike;
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
- `BodyType` and `AnimationName` are aliases of `string` so the data
  layer (sheet definitions JSON) can add new body types / animations
  without a core code change. `License` is a **closed literal union**
  because the upstream `LICENSE_CONFIG` is hand-curated and we want
  exhaustiveness when computing effective licenses (resolved O.4).
- `ComposedSheet.credits` is **on the result type**, not a separate fetch:
  per hard rule 5 ("credits 跟著合成走"), the caller cannot forget them.
- `ComposedSheet.canvas` is typed `CanvasLike` (resolved O.2) — `types.ts`
  imports from `adapters.ts`. One-way dependency, no cycle.

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

## `constants.ts` 🟢

Pure data lifted verbatim from `upstream/sources/state/constants.ts`. No
logic, no transformation.

```ts
const FRAME_SIZE = 64;
const COMPACT_FRAME_SIZE = 32;
const STANDARD_ANIMATION_FRAMES_PER_ROW = 13;
const SHEET_WIDTH  = 832;   // 13 × FRAME_SIZE
const SHEET_HEIGHT = 3456;

const BODY_TYPES  = ['male','female','teen','child','muscular','pregnant'] as const;
const DIRECTIONS  = ['up','left','down','right'] as const;

interface LicenseGroupConfig {
  key: string; label: string;
  versions: readonly License[];
  url: string; urlLabel?: string;
}
const LICENSE_CONFIG: readonly LicenseGroupConfig[];           // 5 groups
const LICENSE_GROUP_ORDER = ['CC0','CC-BY','OGA-BY','CC-BY-SA','GPL'] as const;
type LicenseGroup = (typeof LICENSE_GROUP_ORDER)[number];
const LICENSE_GROUP_OF: Readonly<Record<License, LicenseGroup>>; // version → group

interface AnimationListEntry {
  value: string; label: string;
  folderName?: string;   // when on-disk folder ≠ value (e.g. 'combat' → 'combat_idle')
  noExport?: boolean;
}
const ANIMATIONS: readonly AnimationListEntry[];               // 17 entries
const ANIMATION_DEFAULTS: readonly string[];                   // 7 default anims

const ANIMATION_OFFSETS = { spellcast: 0, thrust: 256, … } as const; // 15 folder keys
type AnimationFolderName = keyof typeof ANIMATION_OFFSETS;

interface AnimationConfig { row: number; num: 1 | 4; cycle: readonly number[] }
const ANIMATION_CONFIGS: Readonly<Record<string, AnimationConfig>>; // 17 logical names
```

**Rationale.**
- Data, not logic — kept in a leaf module so anything in core can import
  it without circular risk.
- `LICENSE_GROUP_ORDER` + `LICENSE_GROUP_OF` are the data
  `computeEffectiveLicense` needs (resolves O.3 data half; the function
  body still throws until Step 2).
- Two parallel indexes for animations — `ANIMATION_OFFSETS` keyed by
  **folder name** (where the PNG lives on disk), `ANIMATION_CONFIGS`
  keyed by **logical value** (`combat`, `1h_slash`, `1h_backslash`,
  `1h_halfslash`, `watering` all share folders). Preserving this duality
  faithfully avoids translation bugs.
- `BODY_TYPES` is exported as a tuple plus a `StandardBodyType` union —
  callers that want autocomplete can use the union; the `BodyType` type
  alias in `types.ts` stays open (`string`) so JSON-driven additions don't
  require a code change.

**Open: license ordering.** I placed `OGA-BY` between `CC-BY` and
`CC-BY-SA`. OGA-BY is conceptually similar to CC-BY (attribution, no
share-alike); whether it should rank below or equal to CC-BY-SA is a
judgement call. Will revisit when implementing `computeEffectiveLicense`.

---

## `recolor.ts` 🟡

Stub-level (resolves O.8). Implementation in Step 2 per decision D.3 (CPU
recolor in core).

```ts
type ColorHex = string;
type Palette  = readonly ColorHex[];

interface PaletteSwap {
  material: string;     // identifies which material on the sprite is being swapped
  source:   Palette;    // colors present in the source PNG
  target:   Palette;    // colors to substitute in
}

interface RecolorOptions { adapter: CanvasAdapter; }

function recolorImage(
  image:   ImageLike,
  swap:    PaletteSwap,
  options: RecolorOptions
): CanvasLike;

function recolorPixels(
  pixels: Uint8ClampedArray,
  swap:   PaletteSwap
): Uint8ClampedArray;
```

**Rationale.**
- `PaletteSwap` is the "applied" form of the swap — `source`/`target`
  arrays must be the same length and aligned by index. Looking up "which
  named palette resolves to which color array" is the caller's job
  (palette resolution depends on data not yet ingested — see RESEARCH.md
  D.3).
- Two entry points: `recolorImage` is the convenience path (loads image →
  recolor → returns a canvas). `recolorPixels` is the pure inner loop —
  no canvas, no adapter, fully testable. Compose pipeline will call
  `recolorPixels`; CLI / web one-shots will call `recolorImage`.
- `ColorHex` is `string` (not a literal) because we don't yet validate
  hex format at the type level. Will tighten if we add a validator.

---

## Resolved decisions (2026-05-15)

All open questions O.1–O.8 from the original draft were accepted as
proposed. Summary:

| # | Decision |
| --- | --- |
| O.1 | `composeSelections` returns `Promise<ComposedSheet>` (rejects on error). `Result` is not threaded through the headline async API. |
| O.2 | `ComposedSheet.canvas` and `ComposedAnimation.canvas` are typed `CanvasLike`. `types.ts` imports from `adapters.ts`. |
| O.3 | License ranking data shipped in `constants.ts` (`LICENSE_GROUP_ORDER`, `LICENSE_GROUP_OF`). Function body in `credits.ts` still throws — implementation in Step 2. |
| O.4 | `BodyType` and `AnimationName` stay `string` (open data); `License` is a closed literal union (12 values verified against upstream `LICENSE_CONFIG`). |
| O.5 | `parseHash` returns `ParseHashResult` (`{ selections, warnings, unknownKeys }`), not `Selections`. |
| O.6 | `Selection` does not carry `itemId`. Resolution via `catalog` lookup on demand. |
| O.7 | `spritesheetsBaseUrl` lives on `ComposeOptions`, not inside `CanvasAdapter`. |
| O.8 | Recolor API stubs added in `recolor.ts` (`PaletteSwap`, `recolorImage`, `recolorPixels`). Bodies still throw. |

Step 1.3 verified `License` against upstream `LICENSE_CONFIG` directly:
the list expanded from 9 to **12** values (added `CC-BY 3.0+`, `CC-BY`,
`OGA-BY 3.0+`). `types.ts` and `API.md` updated; no further reconciliation
needed before Step 2.

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
