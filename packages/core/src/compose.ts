import type { CanvasAdapter } from './adapters.js';
import type {
  AnimationName,
  Catalog,
  ComposedSheet,
  ItemDefinition,
  ItemId,
  LayerSpec,
  Selections,
  TypeName,
} from './types.js';

export interface ComposeOptions {
  readonly catalog: Catalog;
  readonly adapter: CanvasAdapter;
  readonly spritesheetsBaseUrl: string;
  readonly animations?: readonly AnimationName[];
  readonly onProgress?: (loaded: number, total: number) => void;
}

export function composeSelections(
  selections: Selections,
  options: ComposeOptions,
): Promise<ComposedSheet> {
  void selections;
  void options;
  throw new Error('not implemented');
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
 * Resolve which sprite-sheet PNGs are referenced by the given selections.
 *
 * For each `(typeName, Selection)` pair:
 *   1. Reverse-lookup the `ItemDefinition` + `itemId` from `catalog`.
 *   2. Walk `layer_1` .. first missing `layer_N`.
 *   3. Skip layers whose `bodyType` path is absent (Q10).
 *   4. Filter by `custom_animation` to match `layer_1`'s mode
 *      (custom-only if layer_1 has one, standard-only otherwise — same
 *      rule upstream's `getLayersToLoad` uses).
 *   5. Substitute `${typeName}` placeholders via `replaceInPath`.
 *   6. Append the default-animation segment (`walk` if available, else
 *      `animations[0]`) plus the optional variant filename — matching
 *      upstream `getLayersToLoad`. See API.md Q7.
 *
 * Selections that fail any of these steps are skipped silently (Q9 / Q10).
 * The returned `LayerSpec[]` is sorted by `zPos` ascending across all items
 * so callers can draw in order.
 */
export function getSpritePathsForSelections(
  selections: Selections,
  catalog: Catalog,
): readonly LayerSpec[] {
  const out: LayerSpec[] = [];

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

      const variantFile = sel.variant ? variantToFilename(sel.variant) : '';

      let path: string;
      if (layer.custom_animation) {
        if (!variantFile) continue;
        path = `spritesheets/${basePath}${variantFile}.png`;
      } else {
        const defaultAnim = item.animations.includes('walk')
          ? 'walk'
          : item.animations[0];
        if (!defaultAnim) continue;
        const tail = variantFile ? `/${variantFile}` : '';
        path = `spritesheets/${basePath}${defaultAnim}${tail}.png`;
      }

      out.push({
        itemId,
        typeName,
        path,
        zPos: layer.zPos,
        ...(layer.custom_animation
          ? { customAnimation: layer.custom_animation }
          : {}),
      });
    }
  }

  // Stable sort by zPos ascending. Array.prototype.sort is stable in
  // modern JS engines (ES2019), so insertion order is preserved on ties.
  out.sort((a, b) => a.zPos - b.zPos);
  return out;
}
