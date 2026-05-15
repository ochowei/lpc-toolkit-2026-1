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

interface AliasEntry {
  typeName: TypeName;
  name: string;     // item's `name` with spaces → underscores, or "*" for wildcards
  variant: string;  // matched variant on the target item, or "*" for wildcards
}

interface Catalog {
  byItemId:    ReadonlyMap<ItemId, ItemDefinition>;
  byTypeName:  ReadonlyMap<TypeName, readonly ItemDefinition[]>;
  typeNames:   readonly TypeName[];
  // Outer key: source typeName ("sash"). Inner key: nameAndVariant
  // ("Waistband_rose") or "*" for type-name-wildcard aliases.
  aliases:     ReadonlyMap<TypeName, ReadonlyMap<string, AliasEntry>>;
}

interface Selection {
  typeName: TypeName;
  name: string;       // raw item name from the JSON (e.g. "Body Color"), no display suffix
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

### Step 2.1 follow-ups (2026-05-15)

Implementation of `parseHash` / `serializeHash` / `recolorPixels` surfaced
six adjustments. All accepted; resolutions below.

| # | Decision |
| --- | --- |
| Q1 | `Catalog.aliases` widened to `ReadonlyMap<TypeName, ReadonlyMap<string, AliasEntry>>` (outer key: source typeName; inner key: `name_variant` or `"*"`; value: `{ typeName, name, variant }`). The original `Map<TypeName, TypeName>` could not express the backwards-compat redirects upstream relies on (e.g. `sash=Waistband_rose` → `waistband=Waistband_rose`). `AliasEntry` exported from `index.ts`. |
| Q2 | `parseHash` sub-item second pass deferred. Upstream's second pass matches skipped entries against `recolors[i].type_name` + `recolors[i].variants`, which only exist after palette-driven normalisation. Core ingests raw `recolors` (`{ material, palettes }`) in Step 2, so entries that depend on recolor-expanded variants surface as `{ reason: 'unknown_item' }` warnings rather than silently-wrong selections. Revisit when palette metadata is wired up. |
| Q3 | `computeEffectiveLicense` intra-group ranking pushed to Step 2.4. Plan: add `LICENSE_VERSION_RANK: Record<License, number>` to `constants.ts` so within-group ordering is explicit (bare ≤ 3.0 ≤ 3.0+ ≤ 4.0, GPL 2.0 < GPL 3.0). |
| Q4 | `createCatalog` (Step 2.2) will dedupe by `itemId`; duplicate `(type_name, name)` pairs across different `itemId`s are allowed and not flagged. Duplicate `itemId` → warning, last-write-wins. |
| Q5 | `Selection.name` stores the raw item name from the JSON (`"Body Color"`), not upstream's display-format suffix (`"Body Color (light)"`). Variant/recolor are already separate fields; display formatting is a UI concern. |
| Q6 | Added `vitest@^2.1.0` (MIT — compatible with GPL-3.0) as the workspace's test framework. Root script `pnpm test` fans out via `pnpm -r test`; each package owns its own `vitest run`. Tests live in `packages/core/test/`. |

Step 2.1 deliverables: `recolorPixels` (CPU tolerance=1 pixel swap, alpha-0
skip), `parseHash` / `serializeHash` (with Q2 deferral noted in code), and
the type widening above. 26 vitest cases pass; `pnpm -r typecheck` clean.

### Step 2.3 follow-ups (2026-05-15)

Implementation of `getSpritePathsForSelections` surfaced eight small
decisions; all accepted as proposed.

| # | Decision |
| --- | --- |
| Q7  | `LayerSpec.path` is a fully-baked PNG path: `spritesheets/${basePath}${defaultAnim}[/${variantFile}].png`. Default anim is `walk` if the item declares it, else `animations[0]`. Mirrors upstream `getLayersToLoad` and makes the output usable for thumbnails / debug / Step 2.4 credits filtering. Step 3 compose will iterate the full `animations` list itself. |
| Q8  | `getNameWithoutVariant` is **not** lifted. Our `Selection.name` / `Selection.variant` are already separated, so `replace_in_path` lookups use `sel.name.replaceAll(' ', '_')` directly. Upstream's longest-suffix scan only exists because hash params are concatenated. |
| Q9  | Selection whose `(typeName, name)` does not resolve in `catalog.byItemId` is **skipped silently**, matching upstream's stop-rendering-that-layer behaviour. Surface warnings only when a real consumer needs them. |
| Q10 | Layer with no `bodyType` path entry is **skipped** (`continue`), matching upstream. Sibling layers and other items are unaffected. |
| Q11 | If an item's `animations` is missing or empty and `walk` isn't declared, the affected layer is **skipped silently**. Real upstream merges `animations` from `meta_*.json`; we don't, so this is the cheapest safe behaviour until a Step 2.x catalog-merging pass lands. |
| Q12 | `LayerSpec.customAnimation` is populated verbatim from `layer.custom_animation` whenever present. The custom-only / standard-only filter is driven by `layer_1.custom_animation` (matches upstream `getLayersToLoad`). `exactOptionalPropertyTypes` requires we omit the field entirely on standard layers rather than set it to `undefined`. |
| Q13 | Output is sorted by `zPos` **ascending across all items**. `Array.prototype.sort` is stable in ES2019+, so insertion order is preserved on `zPos` ties. |
| Q14 | Empty `selections.items` returns `[]` — no throw, no warning. |

Step 2.3 deliverables: `getSpritePathsForSelections` plus a private
`replaceInPath` helper (port of upstream `state/path.ts:replaceInPath`
without the longest-suffix scan). 15 new vitest cases (52 total);
`pnpm -r typecheck` clean.

### Step 2.4 follow-ups (2026-05-15)

`getCredits` and `computeEffectiveLicense` implemented; five small
decisions resolved.

| # | Decision |
| --- | --- |
| A   | Credit-file matching mirrors upstream `utils/credits.ts:72` exactly: `usedPath === credit.file || usedPath.startsWith(credit.file + "/")`. Folder-prefix, case-sensitive. `usedPath` is `LayerSpec.path` with the `spritesheets/` prefix stripped, so the comparison sits in the same namespace as `credit.file` (which is upstream's relative path). |
| B   | `LICENSE_VERSION_RANK` added to `constants.ts` (intra-group ranks). CC-BY: bare=0, 3.0=1, 3.0+=2, 4.0=3. OGA-BY: 3.0=1, 3.0+=2, 4.0=3. CC-BY-SA: 3.0=1, 4.0=3. GPL: 2.0=2, 3.0=3. CC0: 0. Numbers are only compared inside a single `LicenseGroup` (use `LICENSE_GROUP_OF` first); cross-group ordering is `LICENSE_GROUP_ORDER`. |
| C   | `computeEffectiveLicense` **throws** on an empty `CreditsManifest.licenses` rather than returning `null` or a fallback. The API.md signature returns `License` (non-nullable) and "license of nothing" has no sensible answer. Callers check `manifest.licenses.length` first when the empty case is reachable. |
| D   | `getCredits` calls `getSpritePathsForSelections` internally and derives used paths by stripping `spritesheets/` from each `LayerSpec.path`. Avoids duplicating the layer-walk + `replaceInPath` logic. Trade-off: callers using both pay O(items × layers) twice — neither is hot, drift risk is the bigger concern. Used paths are grouped by `itemId` so an item only matches its own credits (a body credit can't be promoted by a hair layer that shares a folder prefix). |
| E   | `CreditsManifest.entries` is deduped by `credit.file` across all items, ordered by selection iteration then by per-item credit-array order. `licenses` is deduped (insertion order preserved) across all kept entries. |

Step 2.4 deliverables: `getCredits` (selections → resolved sprite paths
→ prefix-matched credit rows → deduped manifest), `computeEffectiveLicense`
(highest group per `LICENSE_GROUP_ORDER`, then highest version per
`LICENSE_VERSION_RANK`), and the new `LICENSE_VERSION_RANK` constant
exported from `constants.ts` / `index.ts`. 16 new vitest cases (68 total);
`pnpm -r typecheck` clean.

### Step 3.1 follow-ups (2026-05-15)

`recolorImage` implemented and the `CanvasAdapter` contract validated
against a real Node canvas. Eight decisions; all accepted as proposed.

| # | Decision |
| --- | --- |
| Q1 | Test adapter lives at `packages/core/test/helpers/node-canvas-adapter.ts`, not a new `packages/test-utils/` workspace package. A ~50-line helper used by one test file doesn't justify the tooling/project-reference overhead. Step 3.2's compose tests import it via relative path; promote to a package only if web/cli e2e later need it. |
| Q2 | `@napi-rs/canvas@^1.0.0` added to **`packages/core/devDependencies`** (MIT — GPL-3.0 compatible). Prebuilt binaries (no Cairo / node-gyp / native build). devDep-only, so it never reaches the published bundle and hard rule 4 (core env-agnostic) holds. |
| Q3 | `recolorImage` does **not** add `createImageData` to `CanvasAdapter`. `ImageDataLike.data` is `readonly` only at the field level; the backing `Uint8ClampedArray` is mutable. So: `getImageData` → `recolorPixels` (non-mutating, fresh buffer) → `imageData.data.set(newPixels)` → `putImageData(imageData, 0, 0)`. Adapter surface stays minimal. |
| Q4 | Test adapter's `loadImage` is implemented as a rejecting stub (`Promise.reject(Error('…arrives in Step 3.2'))`), not omitted. Keeps the `CanvasAdapter` interface satisfied (no type churn when 3.2 fills it in) and fails loud if a 3.1 test accidentally calls it. Step 3.1 uses synthetic fixtures only. |
| Q5 | Fixtures are painted via the concrete `@napi-rs/canvas` API (`fillStyle`/`fillRect`), which `Context2DLike` deliberately does not expose. Allowed: the helper is under `test/`, not `core/src/` — the "no canvas lib in core src" rule is unaffected. Helper exports `createNodeCanvasAdapter`, `makeImage(w,h,paint)`, `solidImage(w,h,hex)`. |
| Q6 | `recolorImage(image: ImageLike, …)` is fed a `Canvas` fixture at runtime (a `Canvas` satisfies `ImageLike`; `Context2DLike.drawImage` accepts `ImageLike \| CanvasLike`). No type change needed. |
| Q7 | `@napi-rs/canvas`'s `Canvas` / `SKRSContext2D` are a structural superset of `CanvasLike` / `Context2DLike`, so the adapter returns them directly with **no wrapper objects and no casts**. Verified by a standalone strict `tsc` pass over the helper (the workspace `typecheck` only covers `src/**/*`). |
| Q8 | `recolorImage` is synchronous (image already loaded), matching upstream and the API.md signature. Step 3.2 `composeSelections` will own the async `loadImage` per layer and call `recolorImage` synchronously per layer. |

Step 3.1 deliverables: `recolorImage` (createCanvas → drawImage →
getImageData → `recolorPixels` → in-place `data.set` → putImageData →
return canvas) and `test/helpers/node-canvas-adapter.ts` (real
`@napi-rs/canvas` `CanvasAdapter` + synthetic-image fixtures). 5 new
vitest cases (73 total): 8×8 red→blue full-canvas swap, alpha=0
untouched, non-palette untouched, mixed-region selective recolor,
fresh-canvas / source-not-mutated. `pnpm -r typecheck` and
`pnpm -r test` clean. WebGL recolor remains deferred (D.3, Step 4+).

### Step 3.2 follow-ups (2026-05-15)

`composeSelections` implemented (standard 832×3456 master sheet). Nine
decisions; all accepted as proposed.

| # | Decision |
| --- | --- |
| A2 | Recolor in compose is driven by an injected resolver. Core has no palette color data (`RecolorConfig` is palette *names*; palette-JSON ingestion deferred — Step 2.1 Q2), so `ComposeOptions` gains `resolvePalette?: (selection, item) => PaletteSwap \| undefined`. compose calls `recolorImage` only when it yields a swap. Same DI philosophy as `CanvasAdapter` / `createCatalog` records; keeps core palette-agnostic and unblocks recolor without palette ingestion. When omitted, sprites are drawn raw. |
| B1 | Custom-animation compositing (wheelchair / `tool_rod` / …) is **out of scope for 3.2**. Porting `upstream/custom-animations.ts` (572 lines) + `drawFramesToCustomAnimation` + variable-height canvas + the extracted-frames pass roughly doubles the surface. 3.2 composes only the standard sheet; layers whose `layer_1.custom_animation` is set are skipped (upstream routes them separately anyway and they never land on the 0..3456 standard sheet). Tracked as a follow-up step. |
| C1 | Extracted a shared internal `resolveLayers(selections, catalog)` (selection → layer walk → bodyType filter → custom-anim filter → `replaceInPath`). `getSpritePathsForSelections` is now a thin default-anim view over it; `composeSelections` iterates `ANIMATION_OFFSETS` per resolved layer. One source of truth for the layer walk — no drift. All 15 Step 2.3 cases stay green byte-for-byte. |
| D | Per-animation path uses the `ANIMATION_OFFSETS` folder key directly (`spritesheets/${basePath}${folder}${variantTail}.png`), matching upstream `getSpritePath` (whose folder→logical remap is a no-op because `ANIMATION_OFFSETS` keys aren't `ANIMATIONS[].value`s). Folder support gate mirrors `runRenderCharacter`: `combat_idle`←`combat`, `backslash`←`1h_slash`/`1h_backslash`, `halfslash`←`1h_halfslash`, else direct. |
| D' | `options.animations` (input filter) and `ComposedSheet.animations` (output) both use **logical** names (the `ANIMATIONS[].value` / hash namespace). Input logical→folder via `folderName ?? value`; output is the declared logical names whose folder was actually drawn (one-to-many: `backslash` → `1h_slash` and/or `1h_backslash`). `watering` has no `ANIMATION_OFFSETS` folder (shares the thrust row) so it is never independently composed even when declared — verified by test. |
| E | Per-image load failure is swallowed (that layer isn't drawn), matching upstream `loadImagesInParallel`. `composeSelections` rejects only on a hard failure. `spritesheetsBaseUrl` + `LayerSpec`-style path (with `spritesheets/` prefix) are single-slash joined and handed to `adapter.loadImage`, which interprets URL vs filesystem path. |
| F | `onProgress(loaded, total)`: `total` = planned image-load count (surviving layer × supported/filtered folder); `loaded` increments once per settled load (success **or** failure) and fires after each. |
| G | The Step 3.1 test adapter's `loadImage` stub is now real, backed by `@napi-rs/canvas`'s `loadImage` (accepts a filesystem path). Compose tests point `spritesheetsBaseUrl` at the read-only `upstream/` checkout (reading spritesheets is their intended use; submodule untouched). |
| H | `ComposedSheet` is always `832 × 3456` (B1 — no custom-anim height). `.layers` reuses `getSpritePathsForSelections` (the documented default-anim representative, API.md `compose.ts`); `.credits` reuses `getCredits` (Step 2.4). Fresh adapter canvas is transparent, so no `clearRect` (upstream clears only because it reuses a persistent offscreen canvas). |

Step 3.2 deliverables: `composeSelections` (resolveLayers → per-folder
draw items → stable zPos sort → parallel load w/ swallowed failures →
optional `recolorImage` → draw at `ANIMATION_OFFSETS` y-offset →
`ComposedSheet` with credits/layers/animations), the `resolveLayers`
refactor (C1), the new `ComposeOptions.resolvePalette` seam, and the
now-real test adapter `loadImage`. 6 new vitest cases (79 total): real
upstream body compose (dims/credits/animations/walk-region), logical
`animations` filter, synthetic raw draw + `onProgress`, synthetic
recolor via `resolvePalette`, swallowed load failure, custom-anim layer
skipped. `pnpm -r typecheck` and `pnpm -r test` clean. Custom-animation
compositing and palette-JSON ingestion remain deferred.

### Step 3.3 follow-ups (2026-05-15)

`extractAnimation` implemented. Six decisions; all accepted as proposed.

| # | Decision |
| --- | --- |
| Q1 | `name` is a **logical** animation name, looked up in `ANIMATION_CONFIGS` (same namespace as `ComposedSheet.animations` / `composeSelections`'s `options.animations`). |
| Q2 | `frameCount = config.cycle.length` — the playback-cycle length (one loop, including repeated columns: `walk` → 8, `idle` → 3, `hurt` → 6). Chosen over "distinct frame columns" or "full 13-wide row": `cycle` is upstream's only authoritative play sequence, and it pairs naturally with `directions` (row count) as "steps per loop". |
| Q3 | Unknown `name` (not in `ANIMATION_CONFIGS`) **throws** (message lists known names), consistent with API.md's non-nullable return and the Step 2.4-C "no sensible answer → throw" precedent. Upstream returns `null`; we don't thread null through this surface. |
| Q4 | A *known but un-composed* animation returns a valid, fully-transparent crop (no throw). Extract keys purely off `ANIMATION_CONFIGS` and is independent of `sheet.animations`, mirroring upstream `extractAnimationFromCanvas`. Consequence: `watering` (shares the thrust rows: `ANIMATION_CONFIGS.watering.row === thrust`) is extractable even though 3.2 never lists it in `sheet.animations`. |
| Q5 | `ComposedAnimation.credits` is `sheet.credits` passed through **by reference** — an extracted clip is a sub-region of the same composed character, so attribution is identical. |
| Q6 | Crop geometry mirrors upstream exactly: `srcY = row*64`, `srcHeight = num*64`, output canvas `832 × srcHeight`, single `drawImage(sheet.canvas, 0, srcY, 832, srcHeight, 0,0, 832, srcHeight)`. Full sheet width — columns are **not** tight-cropped (unused frame columns stay transparent). `extractAnimation` is synchronous (canvas crop only, no I/O). Test helper gains `makeCanvas(w,h,paint): CanvasLike` (symmetric with `makeImage`) for hand-painting a `ComposedSheet.canvas`. |

Step 3.3 deliverables: `extractAnimation` (`ANIMATION_CONFIGS` lookup →
row-group crop → `ComposedAnimation` with `frameCount`/`directions`/
passed-through credits) and the `makeCanvas` test helper. 6 new vitest
cases (85 total): walk crop (832×256, 4 dir, frameCount 8), hurt crop
(832×64, 1 dir, frameCount 6), transparent crop for un-composed anim,
credits-by-reference, unknown-name throw, end-to-end on a
`composeSelections` output. `pnpm -r typecheck` and `pnpm -r test`
clean.

This closes the originally-scoped Step 3 (3.1 recolor, 3.2 compose,
3.3 extract). Still deferred: custom-animation compositing (B1) and
palette-JSON ingestion (Step 2.1 Q2) — both independent follow-ups,
neither blocks the standard compose→extract pipeline.

### Step 3.4 follow-ups (2026-05-15)

Custom-animation compositing implemented — this **closes the B1
deferral** from Step 3.2. `composeSelections` no longer skips custom
layers; it composes each custom-animation block (wheelchair / `tool_rod`
/ …) below the standard sheet, mirroring upstream `runRenderCharacter`.
Pre-approved questions Q1–Q7 and follow-on N1–N7; all accepted as
proposed.

| # | Decision |
| --- | --- |
| Q1 | Custom-animation **data** lifted to a new leaf module `packages/core/src/custom-animations.ts` (`animationRowsLayout`, `CustomAnimationDefinition`, `customAnimations`, `customAnimationSize`, `customAnimationBase`), re-exported from `index.ts`. Same precedent as `constants.ts`. *Data* is verbatim; the two helper *functions* are a faithful port — see N1. |
| Q2 | `composeSelections` returns a **variable-size** canvas: `height = 3456 + Σ(block heights)`, `width = max(832, max block width)`. `ComposedSheet.width/height` were already `number` — no type change. This **revisits Step 3.2 decision H** ("always 832×3456"): H now holds only for selections with no custom-animation layers (a standard-only sheet is still byte-for-byte 832×3456, so all Step 3.2/3.3 tests stay green). |
| Q3 | `ComposedSheet` gains an optional `customAnimations?: ReadonlyMap<string, CustomAnimationRegion>` (`{ offsetY; frameSize; rows; cols }`). `extractAnimation` looks up `ANIMATION_CONFIGS` **first**, then this sheet's custom blocks; a name in neither throws. This **refines (does not overturn) Step 3.3 Q3**: unknown-name-throws still holds — the known set is just widened by the sheet's own custom blocks. Custom `ComposedAnimation` semantics: `directions = rows` (= `frames.length`; all 13 known custom defs have 4 → the `1 \| 4` type holds), `frameCount = cols` (= `frames[0].length`, frames per direction), `width = cols·frameSize`, `height = rows·frameSize`, `credits` by reference (consistent with Step 3.3 Q5). |
| Q4 | `options.resolvePalette` (Step 3.2 A2 seam) is applied to **both** custom-sprite layers and re-laid base-anim frames, matching upstream running `getImageToDraw` in both branches. |
| Q5 | Re-laid frames' source is the **already-loaded standard per-anim PNG** whose `ANIMATION_OFFSETS` folder equals `customAnimationBase(def)` (e.g. wheelchair → `sit`), reused — not reloaded. Verified: `body/bodies/male/sit.png` is 192×256 (≤256) → `drawFramesToCustomAnimation`'s single-animation **direction-map** branch (`n/w/s/e → rows 0/1/2/3`), never `animationRowsLayout`. |
| Q6 | Multiple custom blocks are ordered by `Set` insertion = `resolveLayers` encounter order (selection iteration → layer number). Offsets accrue in that order from `y=3456`. Deterministic, matches upstream `addedCustomAnimations`. |
| Q7 | Tests as proposed plus the N-driven additions (see Deliverables). |
| N1 | `customAnimationSize` / `customAnimationBase` are a **faithful port, not byte-verbatim**: upstream's `frames[0][0]` indexing fails under our `noUncheckedIndexedAccess`, so they use strict-safe access (and `customAnimationBase` throws on a frame-less def). Identical observable behaviour on the verbatim literal data. Import extensions adapted to `.js`; `FRAME_SIZE` sourced from our `constants.ts`. Same treatment philosophy as the `constants.ts` lift. |
| N2 | `drawFrameToFrame` / `drawFramesToCustomAnimation` ported to a **core-internal** module `packages/core/src/custom-frames.ts`, typed against `Context2DLike` / `ImageLike \| CanvasLike` only (hard rule 4). **Not** re-exported from `index.ts` — it is a `composeSelections` implementation detail, kept separate from the pure-data `custom-animations.ts` (data vs. logic split). |
| N3 | `ComposedSheet.customAnimations` is **omitted entirely** (not an empty map) when the selection has no custom layers (`exactOptionalPropertyTypes`), so a standard-only sheet's shape is unchanged ("standard ↔ custom must not pollute each other"). New exported type `CustomAnimationRegion`. |
| N4 | `extractAnimation` on a custom block is a **tight crop** (`cols·frameSize × rows·frameSize` at `(0, offsetY)`), unlike a standard animation's full-832-width crop. The block is laid out tightly at compose time, so a tight crop is its natural extent (no letterboxing). |
| N5 | Re-laid base-anim frames come from the same (`options.animations`-filtered) standard draw list as the standard sheet. If the base anim is filtered out or undeclared, the block simply has no body frames — faithfully mirroring upstream, which pulls from the same `itemsToDraw`. The default (no filter) composes `sit`, so the common case works. |
| N6 | A custom layer with **no variant** is skipped (not drawn as `${basePath}.png`), matching `getSpritePathsForSelections` (Step 2.3 Q12) so `ComposedSheet.layers` stays the single source of truth and "listed" ≡ "drawn". All real custom items (wheelchair, `tool_rod`, …) declare variants. |
| N7 | A `custom_animation` string with no entry in the lifted `customAnimations` table is skipped (no block added; its custom-sprite layers are not drawn), matching upstream `if (!customAnimDef) continue`. |

`onProgress` (Step 3.2 F) extended: `total` now includes custom-sprite
loads (the only *new* I/O — re-laid frames reuse already-counted
standard loads); `loaded` still increments once per settled load. A
standard-only selection is unaffected (custom count 0).

Step 3.4 deliverables: `custom-animations.ts` (verbatim data + faithful
helper port, N1), core-internal `custom-frames.ts` (N2), the
`CustomAnimationRegion` type + optional `ComposedSheet.customAnimations`
(Q3/N3), `composeSelections` custom-block compositing (variable canvas,
custom-sprite + re-laid base-anim frames, `zPos`-ordered, `resolvePalette`
on both — Q2/Q4/Q5/Q6), and `extractAnimation` custom-block lookup
(Q3/N4). The Step 3.2 "skips custom layers (B1)" test was **repurposed**
to assert the now-correct composited behaviour (the other 84 baseline
cases are byte-for-byte unchanged). 6 new cases (91 total): synthetic
direction-map / `zPos` landing, `resolvePalette` on custom-sprite +
re-laid frames, real-upstream wheelchair-below-body (dims / metadata /
block content / sit re-lay proven by with-vs-without diff), custom
tight-crop extract (rows/cols semantics, credits-by-ref), standard
extract still works on a variable-size sheet, and unknown-name still
throws (refined known set). `pnpm -r typecheck` and `pnpm -r test`
clean; `upstream/` untouched; no new dependencies.

### Step 4 plan + Step 4.1 follow-ups (2026-05-15)

Palette-JSON ingestion / recolor resolution (the long-deferred Step 2.1
Q2 / Step 3.2 A2 piece) is split into three sub-steps; pre-approved
direction (QA–QI) below.

| # | Decision |
| --- | --- |
| QE | **Phased**: 4.1 palette ingestion (this step) → 4.2 recolor resolution (`parseRecolorKey` / base+target palette / `getMultiRecolors` / `fixMissingRecolor` / `match_body_color` + `body-body`) shipped as a `makeResolvePalette(catalog, palettes)` factory → 4.3 close hash Q2 (parseHash recolor-variant 2nd pass using palette-expanded variants). Each independently typechecked / tested. |
| QA | Palette ingestion is a **separate** `createPaletteCatalog(records)` (not folded into `createCatalog`) — palettes are a distinct data source; keeps `createCatalog` palette-agnostic. Mirrors the D.1 DI contract (`{ result, warnings }`, source-agnostic `Record<path, json>`). |
| QB | Integration point (4.2) will be a `makeResolvePalette` **factory** returning the existing `ComposeOptions.resolvePalette` callback — `composeSelections` / `ComposedSheet` shapes do **not** change; the Step 3.2 A2 seam is the only touch point. |
| QC | The normalised per-item recolor view (upstream `ItemLite.recolors` with `variants` / `base` / `source` / `default` / `matchBodyColor`) will be derived **lazily in the 4.2 resolver**, not at catalog-build time, so `createCatalog` stays palette-agnostic. |
| QD | `match_body_color` / the `body-body` special case lands in 4.2 (required for `getMultiRecolors` correctness on common accessories). |
| QF | `getPaletteOptions` / UI palette-picker data is **out of scope** (a `packages/web/` concern). |
| QG | WebGL recolor stays deferred per RESEARCH.md D.3 (CPU recolor in core for v1). |
| QH | Unknown / malformed material / version / recolor → **warn-and-skip** (mirrors `createCatalog` / `parseHash` warnings and upstream's `unwrapOr(null)` + `console.error`), never throws on bad data. |
| QI | `Selection.recolor` parsing (4.2) will faithfully port `parseRecolorKey`: accepts `material.version.recolor`, `version.recolor`, and bare `recolor`. |

**`palettes.ts` (Step 4.1).** `createPaletteCatalog(records)` is a
faithful port of upstream `scripts/generateSources/palettes.js`
(`parsePalette` / `loadPaletteMetadata`): material / version are derived
from the **filename** (not the directory) — `meta_<name>.json` is a
material (`type:'material'`) or version (`type:'version'`) entry,
`<material>_<version>.json` fills `materials[material].palettes[version]`.
The merge is order-independent (a data file may precede its `meta_`).
New `types.ts` data types: `PaletteColors`, `PaletteVersionColors`,
`PaletteMap`, `PaletteMaterialMeta`, `PaletteVersionMeta`,
`PaletteMetadata` (faithful to upstream `state/catalog.ts`, but the
material descriptive fields are optional to support the order-independent
merge). `palettes` is always present; `type`/`label`/`desc`/`default`/
`base` are set only when seen (`exactOptionalPropertyTypes`). Result
shape `{ palettes, warnings }` mirrors `createCatalog`; empty input →
empty metadata, no throw (matches the actual `createCatalog`, not the
API.md aspirational "throw on empty" text). Exported from `index.ts`
(`createPaletteCatalog`, `CreatePaletteCatalogResult`,
`PaletteLoadWarning`, + the six data types).

Step 4.1 deliverables: `src/palettes.ts`, the palette data types in
`types.ts`, `index.ts` re-exports, and `test/palettes.test.ts` — 11 new
cases (102 total): real `upstream/palette_definitions` ingest (6
materials / 2 versions / material+version meta / material→version→recolor
ramp, zero warnings), order-independent merge, basename-not-directory
derivation, non-object warn-skip, malformed-recolor drop-with-warning,
missing-version-token warn, empty-input. `pnpm -r typecheck` and
`pnpm -r test` clean; `upstream/` untouched; no new dependencies. 4.2 /
4.3 still pending.

### Step 4.2 follow-ups (2026-05-15)

Recolor resolution implemented as `makeResolvePalette(catalog,
palettes, selections, opts?)` → the existing `ComposeOptions.resolvePalette`
callback (QB). `composeSelections` / `ComposedSheet` are **unchanged** —
the Step 3.2 A2 seam is the sole integration point. End-to-end recolor
now works without the caller hand-injecting palettes.

| # | Decision |
| --- | --- |
| QC | Confirmed: the normalised per-item recolor view is derived **lazily in the resolver** (`normalizeRecolor` = port of upstream `applyRecolorDefaults` + `expandRecolorPalettes`). `createCatalog` stays palette-agnostic; no catalog-build coupling. |
| Raw shape | `ItemDefinition.recolors` retyped from `readonly RecolorConfig[]` to `RawRecolors` (a single `RecolorConfig` **object** or the `color_N` `MultiRecolorConfig`). The old array type never matched the source JSON and was **read nowhere** in core, so this is a type-only correction (102 prior tests byte-unchanged). `RecolorConfig` gained the optional `type_name` / `base` / `source` / `label` fields the raw JSON may carry. |
| Ports | `collectRecolorEntries`, `resolvePaletteToken`, `parseRecolorKey` (QI: `material.version.recolor` / `version.recolor` / bare `recolor`), `getBasePalette` (source ramp = explicit `source`, else `base`, else material `default`.`base`), `getTargetPalette`, `fixMissingRecolor`, `getBodyColor`, `getMultiRecolors` — faithful to upstream `state/palettes.ts` + `scripts/generateSources/item-helper.js`. |
| subId → type_name | Upstream's UI `subId` (multi-color sub-picker index) has no analogue in our `Selection` (no `subId`). Sub-recolor entries instead bind by `type_name` to the matching selection's `recolor` — semantically exactly upstream's `recolors[typeName]` keying. Real upstream data has zero `color_N` / `type_name` recolors, so this only affects the synthetic multi-color path. |
| QD | `match_body_color` / body-color propagation ported (`getBodyColor` + the `getMultiRecolors` tail): a `match_body_color` item with no recolor of its own inherits the skin tone chosen on whichever selected item is itself `match_body_color`. The upstream `itemId === "body-body" && variant !== "light"` `needsRecolor` flag is a *render-time hint*, not part of palette resolution — the `match_body_color` port is the faithful recolor mechanism (body.json carries `match_body_color: true`). |
| Multi → one swap | Multiple recolor entries are flattened into a **single** `PaletteSwap` (source/target concatenated, index-aligned), matching upstream `recolorImageCPU` which flattens all mappings into one per-pixel pass. Each (source,target) pair is truncated to the common length before concat because our `recolorPixels` *throws* on a length mismatch (Step 2.1) whereas upstream's `buildColorMap` silently uses the shorter — same observable result. `PaletteSwap.material` (descriptive only; unused by `recolorPixels`) is the `+`-joined contributing materials. |
| QH | Unresolvable entry (unknown material / invalid color / missing ramp) → skipped with an optional `onWarn` (warn-and-skip); a layer with no applicable recolor returns `undefined` (the seam's "draw raw" contract). Never throws on bad data. |

Step 4.2 deliverables: `src/recolor-resolve.ts` (`makeResolvePalette` +
the ported helpers), the `RawRecolors` / `MultiRecolorConfig` type
correction in `types.ts`, `index.ts` re-exports
(`makeResolvePalette`, `MakeResolvePaletteOptions`, `ResolvePalette`,
`RawRecolors`, `MultiRecolorConfig`), and `test/recolor-resolve.test.ts`
— 12 new cases (114 total): real body skin recolor (ulpc base→target
ramps), real cross-version key (`lpcr.tan` on a ulpc-default material),
real `match_body_color` propagation (lizard tail inherits body skin),
no-recolor → undefined, end-to-end pixel change through
`composeSelections`, the three `parseRecolorKey` key forms (QI),
unknown-material / unknown-color warn-skip, no-recolors → undefined, and
the synthetic `color_N` multi → one concatenated swap. `pnpm -r
typecheck` and `pnpm -r test` clean; `upstream/` untouched; no new
dependencies. 4.3 (close hash Q2 — parseHash recolor-variant 2nd pass)
still pending.

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
