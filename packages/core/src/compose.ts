import type { CanvasAdapter } from './adapters.js';
import { ANIMATIONS, ANIMATION_OFFSETS, SHEET_HEIGHT, SHEET_WIDTH } from './constants.js';
import { getCredits } from './credits.js';
import { recolorImage, type PaletteSwap } from './recolor.js';
import type {
  AnimationName,
  Catalog,
  ComposedSheet,
  ItemDefinition,
  ItemId,
  LayerSpec,
  Selection,
  Selections,
  TypeName,
} from './types.js';

export interface ComposeOptions {
  readonly catalog: Catalog;
  readonly adapter: CanvasAdapter;
  readonly spritesheetsBaseUrl: string;
  readonly animations?: readonly AnimationName[];
  readonly onProgress?: (loaded: number, total: number) => void;
  /**
   * Resolves a per-layer `PaletteSwap` for recoloring (A2). Core has no
   * palette color data — `RecolorConfig` carries palette *names* and
   * palette-JSON ingestion is deferred (API.md Step 2.1 Q2) — so the
   * caller injects the swap, mirroring the `CanvasAdapter` / catalog DI
   * seam. When omitted, or when it returns `undefined`, the layer is
   * drawn without recoloring.
   */
  readonly resolvePalette?: (
    selection: Selection,
    item: ItemDefinition,
  ) => PaletteSwap | undefined;
}

function variantToFilename(variant: string): string {
  return variant.replaceAll(' ', '_');
}

/**
 * Reverse-lookup an item by (typeName, raw name). Selection does not carry
 * `itemId` (decision O.6), so we scan `byItemId` for the matching pair.
 * Returns the first match — duplicate `(type_name, name)` pairs across
 * different itemIds are allowed (Q4) and the first wins.
 */
function findItem(
  catalog: Catalog,
  typeName: TypeName,
  rawName: string,
): { itemId: ItemId; item: ItemDefinition } | undefined {
  for (const [itemId, item] of catalog.byItemId) {
    if (item.type_name === typeName && item.name === rawName) {
      return { itemId, item };
    }
  }
  return undefined;
}

/**
 * Resolve `${typeName}` placeholders in a layer path using the current
 * selections and the item's `replace_in_path` map. Mirrors upstream
 * `replaceInPath` from `state/path.ts`, simplified because our `Selection`
 * already has `name` and `variant` separated (Q8): the lookup key is just
 * `sel.name.replaceAll(' ', '_')`. Placeholders with no replacement are
 * left as-is, matching upstream's `${g}` fallback in `es6DynamicTemplate`.
 */
function replaceInPath(
  path: string,
  selections: Selections,
  item: ItemDefinition,
): string {
  return path.replace(/\$\{([^}]*)\}/g, (_, key: string) => {
    const otherSel = selections.items[key];
    if (!otherSel) return `\${${key}}`;
    const nameKey = otherSel.name.replaceAll(' ', '_');
    const replacement = item.replace_in_path?.[key]?.[nameKey];
    return replacement ?? `\${${key}}`;
  });
}

/**
 * A single sprite layer that survived selection / bodyType / custom-anim
 * filtering, with its `${...}`-resolved base path. The shared resolution
 * step (C1) behind both `getSpritePathsForSelections` (default-anim view)
 * and `composeSelections` (per-animation view), so the layer walk has one
 * source of truth and cannot drift.
 */
interface ResolvedLayer {
  readonly itemId: ItemId;
  readonly typeName: TypeName;
  readonly item: ItemDefinition;
  readonly basePath: string;
  readonly zPos: number;
  readonly animations: readonly AnimationName[];
  readonly variant?: string;
  readonly customAnimation?: string;
}

/**
 * Walk the selected items' layers, applying the same filters upstream
 * `getLayersToLoad` / `runRenderCharacter` use:
 *   1. Reverse-lookup the `ItemDefinition` from `catalog` (skip if absent).
 *   2. Walk `layer_1` .. first missing `layer_N`.
 *   3. Skip layers whose `bodyType` path is absent.
 *   4. Filter by `custom_animation` to match `layer_1`'s mode.
 *   5. Substitute `${typeName}` placeholders via `replaceInPath`.
 * Yields in selection-iteration → layer-number order (callers stable-sort
 * by `zPos` afterwards).
 */
function resolveLayers(
  selections: Selections,
  catalog: Catalog,
): ResolvedLayer[] {
  const out: ResolvedLayer[] = [];

  for (const [typeName, sel] of Object.entries(selections.items)) {
    const found = findItem(catalog, typeName, sel.name);
    if (!found) continue;
    const { itemId, item } = found;

    const layer1 = item.layer_1;
    if (!layer1) continue;
    const layer1Custom = layer1.custom_animation;

    for (let n = 1; n < 10; n++) {
      const layer = item[`layer_${n}`];
      if (!layer) break;

      const baseRaw = layer[selections.bodyType];
      if (typeof baseRaw !== 'string') continue;

      if (layer1Custom) {
        if (layer.custom_animation !== layer1Custom) continue;
      } else if (layer.custom_animation) {
        continue;
      }

      const basePath = baseRaw.includes('${')
        ? replaceInPath(baseRaw, selections, item)
        : baseRaw;

      out.push({
        itemId,
        typeName,
        item,
        basePath,
        zPos: layer.zPos,
        animations: item.animations,
        ...(sel.variant ? { variant: sel.variant } : {}),
        ...(layer.custom_animation
          ? { customAnimation: layer.custom_animation }
          : {}),
      });
    }
  }

  return out;
}

/**
 * Resolve which sprite-sheet PNGs are referenced by the given selections.
 *
 * Each surviving layer maps to one `LayerSpec` whose `path` points at the
 * item's default animation (`walk` if declared, else `animations[0]`) plus
 * the optional variant filename — see API.md Q7. Step 3 compose iterates
 * the full animation list itself via the shared `resolveLayers` walk.
 *
 * Selections that fail resolution are skipped silently (Q9 / Q10). The
 * returned `LayerSpec[]` is sorted by `zPos` ascending across all items.
 */
export function getSpritePathsForSelections(
  selections: Selections,
  catalog: Catalog,
): readonly LayerSpec[] {
  const out: LayerSpec[] = [];

  for (const layer of resolveLayers(selections, catalog)) {
    const variantFile = layer.variant ? variantToFilename(layer.variant) : '';

    let path: string;
    if (layer.customAnimation) {
      if (!variantFile) continue;
      path = `spritesheets/${layer.basePath}${variantFile}.png`;
    } else {
      const defaultAnim = layer.animations.includes('walk')
        ? 'walk'
        : layer.animations[0];
      if (!defaultAnim) continue;
      const tail = variantFile ? `/${variantFile}` : '';
      path = `spritesheets/${layer.basePath}${defaultAnim}${tail}.png`;
    }

    out.push({
      itemId: layer.itemId,
      typeName: layer.typeName,
      path,
      zPos: layer.zPos,
      ...(layer.customAnimation
        ? { customAnimation: layer.customAnimation }
        : {}),
    });
  }

  // Stable sort by zPos ascending. Array.prototype.sort is stable in
  // modern JS engines (ES2019), so insertion order is preserved on ties.
  out.sort((a, b) => a.zPos - b.zPos);
  return out;
}

/**
 * Does an item's declared `animations` support a given `ANIMATION_OFFSETS`
 * folder key? Mirrors upstream `runRenderCharacter`'s folder→logical gate:
 * `combat_idle` needs `combat`; `backslash` needs `1h_slash` OR
 * `1h_backslash`; `halfslash` needs `1h_halfslash`; everything else is a
 * direct match.
 */
function supportsFolder(
  animations: readonly string[],
  folder: string,
): boolean {
  if (folder === 'combat_idle') return animations.includes('combat');
  if (folder === 'backslash') {
    return (
      animations.includes('1h_slash') || animations.includes('1h_backslash')
    );
  }
  if (folder === 'halfslash') return animations.includes('1h_halfslash');
  return animations.includes(folder);
}

/** Map a logical animation name (UI / hash namespace) to its on-disk folder. */
function logicalToFolder(logical: string): string | undefined {
  const entry = ANIMATIONS.find((a) => a.value === logical);
  if (!entry) return undefined;
  return entry.folderName ?? entry.value;
}

function joinUrl(base: string, path: string): string {
  if (!base) return path;
  return base.endsWith('/') ? `${base}${path}` : `${base}/${path}`;
}

interface DrawItem {
  readonly path: string;
  readonly zPos: number;
  readonly yPos: number;
  readonly folder: string;
  readonly selection: Selection;
  readonly item: ItemDefinition;
}

/**
 * Compose the selected character into a single 832×3456 master sheet.
 *
 * For every surviving standard layer (custom-animation layers are routed
 * separately upstream and are out of scope here — B1), each supported
 * `ANIMATION_OFFSETS` folder is drawn at its vertical offset, in global
 * `zPos` order (stable on ties, matching upstream draw order). If
 * `options.resolvePalette` yields a swap for a layer's selection, the
 * loaded sprite is recolored via `recolorImage` before being drawn.
 *
 * Per-image load failures are swallowed (that layer simply isn't drawn),
 * mirroring upstream `loadImagesInParallel`. Rejects only on a hard
 * failure (e.g. the adapter cannot create a canvas).
 */
export async function composeSelections(
  selections: Selections,
  options: ComposeOptions,
): Promise<ComposedSheet> {
  const { catalog, adapter, spritesheetsBaseUrl } = options;

  const allowedFolders = options.animations
    ? new Set(
        options.animations
          .map(logicalToFolder)
          .filter((f): f is string => f !== undefined),
      )
    : null;

  const resolved = resolveLayers(selections, catalog);

  const drawItems: DrawItem[] = [];
  for (const layer of resolved) {
    if (layer.customAnimation) continue; // B1: standard sheet only.

    const selection = selections.items[layer.typeName];
    if (!selection) continue;

    const variantFile = layer.variant ? variantToFilename(layer.variant) : '';
    const tail = variantFile ? `/${variantFile}` : '';

    for (const [folder, yPos] of Object.entries(ANIMATION_OFFSETS)) {
      if (!supportsFolder(layer.animations, folder)) continue;
      if (allowedFolders && !allowedFolders.has(folder)) continue;

      drawItems.push({
        path: `spritesheets/${layer.basePath}${folder}${tail}.png`,
        zPos: layer.zPos,
        yPos,
        folder,
        selection,
        item: layer.item,
      });
    }
  }

  // Stable sort by zPos: lower drawn first (behind). Push order (selection
  // → layer → ANIMATION_OFFSETS) is preserved on ties, matching upstream.
  drawItems.sort((a, b) => a.zPos - b.zPos);

  let loaded = 0;
  const total = drawItems.length;
  const settled = await Promise.all(
    drawItems.map(async (d) => {
      try {
        const img = await adapter.loadImage(
          joinUrl(spritesheetsBaseUrl, d.path),
        );
        return { d, img };
      } catch {
        return { d, img: null };
      } finally {
        loaded++;
        options.onProgress?.(loaded, total);
      }
    }),
  );

  const canvas = adapter.createCanvas(SHEET_WIDTH, SHEET_HEIGHT);
  const ctx = canvas.getContext('2d');

  const drawnFolders = new Set<string>();
  for (const { d, img } of settled) {
    if (!img) continue;
    const swap = options.resolvePalette?.(d.selection, d.item);
    const sprite = swap ? recolorImage(img, swap, { adapter }) : img;
    ctx.drawImage(sprite, 0, d.yPos);
    drawnFolders.add(d.folder);
  }

  // Output animations: logical names (input/UI namespace, symmetric with
  // `options.animations`) whose folder was actually drawn and that a
  // composed item declares. Folder→logical is one-to-many (`backslash` ←
  // `1h_slash` / `1h_backslash`), so report every matching declared name.
  const declaredLogical = new Set<AnimationName>();
  for (const layer of resolved) {
    if (layer.customAnimation) continue;
    for (const a of layer.animations) declaredLogical.add(a);
  }
  const composedAnimations = ANIMATIONS.filter(
    (a) =>
      drawnFolders.has(a.folderName ?? a.value) && declaredLogical.has(a.value),
  ).map((a) => a.value);

  return {
    canvas,
    width: SHEET_WIDTH,
    height: SHEET_HEIGHT,
    selections,
    credits: getCredits(selections, catalog),
    layers: getSpritePathsForSelections(selections, catalog),
    animations: composedAnimations,
  };
}
