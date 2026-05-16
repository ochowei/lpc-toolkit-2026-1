import type { CanvasAdapter, CanvasLike, ImageLike } from './adapters.js';
import { ANIMATIONS, ANIMATION_OFFSETS, SHEET_HEIGHT, SHEET_WIDTH } from './constants.js';
import { getCredits } from './credits.js';
import {
  customAnimationBase,
  customAnimations,
  type CustomAnimationDefinition,
} from './custom-animations.js';
import { drawFramesToCustomAnimation } from './custom-frames.js';
import { recolorImage, type PaletteSwap } from './recolor.js';
import type {
  AnimationName,
  Catalog,
  ComposedSheet,
  CustomAnimationRegion,
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

/** A custom-animation sprite layer (e.g. the wheelchair body PNG). */
interface CustomLayerEntry {
  readonly customAnim: string;
  readonly path: string;
  readonly zPos: number;
  readonly selection: Selection;
  readonly item: ItemDefinition;
}

/** A laid-out custom-animation block below the standard sheet. */
interface CustomRegionInternal {
  readonly def: CustomAnimationDefinition;
  readonly offsetY: number;
  readonly frameSize: number;
  readonly rows: number;
  readonly cols: number;
  readonly height: number;
  readonly width: number;
}

type Sprite = ImageLike | CanvasLike;

/**
 * Compose the selected character into a master sheet.
 *
 * For every surviving standard layer, each supported `ANIMATION_OFFSETS`
 * folder is drawn at its vertical offset, in global `zPos` order (stable
 * on ties, matching upstream draw order). If `options.resolvePalette`
 * yields a swap for a layer's selection, the loaded sprite is recolored
 * via `recolorImage` before being drawn.
 *
 * Custom-animation layers (wheelchair / `tool_rod` / …) are composed into
 * variable-height blocks **below** the standard 832×3456 region, mirroring
 * upstream `runRenderCharacter` (API.md Step 3.4). The canvas is therefore
 * `max(832, …) × (3456 + Σ block heights)` — a standard-only selection is
 * still exactly 832×3456 (Step 3.2 H revisited). Within each block the
 * custom-sprite PNG is drawn directly at `(0, offsetY)`; the custom
 * animation's base-animation frames (e.g. body `sit` → wheelchair) are
 * re-laid via `drawFramesToCustomAnimation`; both honour `resolvePalette`
 * (Q4) and are drawn in `zPos` order. `ComposedSheet.customAnimations`
 * exposes each block's geometry for `extractAnimation` (Q3).
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
  // Custom-animation sprite layers + their encounter-order set (Q6).
  const customLayers: CustomLayerEntry[] = [];
  const addedCustomAnimations = new Set<string>();

  for (const layer of resolved) {
    const selection = selections.items[layer.typeName];
    if (!selection) continue;

    const variantFile = layer.variant ? variantToFilename(layer.variant) : '';

    if (layer.customAnimation) {
      // Direct path, no anim segment (C1). No-variant custom layers are
      // skipped, mirroring `getSpritePathsForSelections` so `.layers`
      // stays the single source of truth (N6).
      if (!variantFile) continue;
      customLayers.push({
        customAnim: layer.customAnimation,
        path: `spritesheets/${layer.basePath}${variantFile}.png`,
        zPos: layer.zPos,
        selection,
        item: layer.item,
      });
      addedCustomAnimations.add(layer.customAnimation);
      continue;
    }

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

  // Lay out custom-animation blocks below the standard sheet (Q2). Unknown
  // names (no def in the lifted table) are skipped (N7).
  const customRegions = new Map<string, CustomRegionInternal>();
  let totalWidth: number = SHEET_WIDTH;
  let currentY = SHEET_HEIGHT;
  for (const name of addedCustomAnimations) {
    const def = customAnimations[name];
    if (!def) continue;
    const rows = def.frames.length;
    const cols = def.frames[0]?.length ?? 0;
    const frameSize = def.frameSize;
    const height = frameSize * rows;
    const width = frameSize * cols;
    customRegions.set(name, {
      def,
      offsetY: currentY,
      frameSize,
      rows,
      cols,
      height,
      width,
    });
    currentY += height;
    totalWidth = Math.max(totalWidth, width);
  }
  const totalHeight = currentY;

  // Stable sort by zPos: lower drawn first (behind). Push order (selection
  // → layer → ANIMATION_OFFSETS) is preserved on ties, matching upstream.
  drawItems.sort((a, b) => a.zPos - b.zPos);

  let loaded = 0;
  const total = drawItems.length + customLayers.length;
  const onSettle = (): void => {
    loaded++;
    options.onProgress?.(loaded, total);
  };

  const settled = await Promise.all(
    drawItems.map(
      async (d): Promise<{ d: DrawItem; img: Sprite | null }> => {
        try {
          const img = await adapter.loadImage(
            joinUrl(spritesheetsBaseUrl, d.path),
          );
          return { d, img };
        } catch {
          return { d, img: null };
        } finally {
          onSettle();
        }
      },
    ),
  );

  const canvas = adapter.createCanvas(totalWidth, totalHeight);
  const ctx = canvas.getContext('2d');

  const drawnFolders = new Set<string>();
  for (const { d, img } of settled) {
    if (!img) continue;
    const swap = options.resolvePalette?.(d.selection, d.item);
    const sprite = swap ? recolorImage(img, swap, { adapter }) : img;
    ctx.drawImage(sprite, 0, d.yPos);
    drawnFolders.add(d.folder);
  }

  // Custom-animation blocks. Load every custom-sprite PNG in parallel
  // (these are the only *new* loads — extracted base-anim frames reuse the
  // already-loaded standard sprites, Q5), then per block draw custom
  // sprites + re-laid base-anim frames in `zPos` order.
  if (customRegions.size > 0) {
    const loadedCustom = await Promise.all(
      customLayers.map(
        async (c): Promise<{ c: CustomLayerEntry; img: Sprite | null }> => {
          try {
            const img = await adapter.loadImage(
              joinUrl(spritesheetsBaseUrl, c.path),
            );
            return { c, img };
          } catch {
            return { c, img: null };
          } finally {
            onSettle();
          }
        },
      ),
    );

    interface AreaItem {
      readonly zPos: number;
      readonly draw: () => void;
    }

    for (const [name, region] of customRegions) {
      const baseAnim = customAnimationBase(region.def);
      const areaItems: AreaItem[] = [];

      // 1. Custom-sprite layers (wheelchair background / foreground).
      for (const { c, img } of loadedCustom) {
        if (c.customAnim !== name || !img) continue;
        const swap = options.resolvePalette?.(c.selection, c.item);
        const sprite = swap ? recolorImage(img, swap, { adapter }) : img;
        areaItems.push({
          zPos: c.zPos,
          draw: () => ctx.drawImage(sprite, 0, region.offsetY),
        });
      }

      // 2. Standard items whose folder is this block's base animation
      // (e.g. body `sit` → wheelchair) get re-laid into the block. Source
      // is the already-loaded standard sprite (Q5); if the base anim was
      // filtered out / undeclared there simply are none (N5).
      for (const { d, img } of settled) {
        if (d.folder !== baseAnim || !img) continue;
        const swap = options.resolvePalette?.(d.selection, d.item);
        const sprite = swap ? recolorImage(img, swap, { adapter }) : img;
        areaItems.push({
          zPos: d.zPos,
          draw: () =>
            drawFramesToCustomAnimation(
              ctx,
              region.def,
              region.offsetY,
              sprite,
            ),
        });
      }

      // Stable sort by zPos (push order preserved on ties), matching
      // upstream's custom-area draw order.
      areaItems.sort((a, b) => a.zPos - b.zPos);
      for (const item of areaItems) item.draw();
    }
  }

  // Output animations: logical names (input/UI namespace, symmetric with
  // `options.animations`) whose folder was actually drawn and that a
  // composed item declares. Folder→logical is one-to-many (`backslash` ←
  // `1h_slash` / `1h_backslash`), so report every matching declared name.
  // Custom-animation names are a separate axis (`customAnimations` map),
  // not standard `sheet.animations`.
  const declaredLogical = new Set<AnimationName>();
  for (const layer of resolved) {
    if (layer.customAnimation) continue;
    for (const a of layer.animations) declaredLogical.add(a);
  }
  const composedAnimations = ANIMATIONS.filter(
    (a) =>
      drawnFolders.has(a.folderName ?? a.value) && declaredLogical.has(a.value),
  ).map((a) => a.value);

  const customAnimationsMeta = new Map<string, CustomAnimationRegion>();
  for (const [name, region] of customRegions) {
    customAnimationsMeta.set(name, {
      offsetY: region.offsetY,
      frameSize: region.frameSize,
      rows: region.rows,
      cols: region.cols,
    });
  }

  return {
    canvas,
    width: totalWidth,
    height: totalHeight,
    selections,
    credits: getCredits(selections, catalog),
    layers: getSpritePathsForSelections(selections, catalog),
    animations: composedAnimations,
    ...(customAnimationsMeta.size > 0
      ? { customAnimations: customAnimationsMeta }
      : {}),
  };
}
