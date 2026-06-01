import type { PaletteSwap } from './recolor.js';
import type {
  Catalog,
  ItemDefinition,
  PaletteMaterialMeta,
  PaletteMetadata,
  RecolorConfig,
  Selection,
  Selections,
  TypeName,
} from './types.js';

/**
 * Options for configuring the palette resolution process.
 */
export interface MakeResolvePaletteOptions {
  /** 
   * Optional callback triggered when a recolor configuration or color option 
   * cannot be correctly resolved against the palette catalog. 
   */
  readonly onWarn?: (message: string) => void;
}

/**
 * Signature of the function that resolves color maps for a specific selection and item.
 * 
 * @param selection - The selection configuration containing the chosen recolor key.
 * @param item - The item definition containing the graphic layering rules.
 * @returns A `PaletteSwap` object if a recolor is resolved, otherwise `undefined` to draw raw.
 */
export type ResolvePalette = (
  selection: Selection,
  item: ItemDefinition,
) => PaletteSwap | undefined;

type Materials = PaletteMetadata['materials'];

/**
 * Cleaned, fully expanded representation of an item's recolor configuration parameters.
 */
interface NormalizedRecolor {
  /** The physical material class identifier (e.g. 'hair', 'cloth', 'metal'). */
  readonly material: string;
  /** Optional override for the target item category type. */
  readonly typeName: TypeName | null;
  /** The fallback/default version ID defined in the material's metadata. */
  readonly defaultVersion: string;
  /** The base color ramp reference string (formatted as 'version.recolor'). */
  readonly base: string;
  /** Optional array of raw source hex colors present in the uncolored PNG. */
  readonly source: readonly string[] | undefined;
  /** Complete list of expanded, fully-qualified variant color keys allowed for selection. */
  readonly variants: readonly string[];
}

/**
 * Port of upstream `collectRecolorEntries`
 * (`scripts/generateSources/item-helper.js`): `color_1`..`color_9` if
 * present, else the object itself as a single entry. Upstream breaks at
 * the first missing `color_N`, so a gap collapses to the single form —
 * replicated faithfully.
 * 
 * @param rc - Raw recolors config from the item definition.
 * @returns An array of normalized individual RecolorConfigs.
 */
function collectRecolorEntries(
  rc: ItemDefinition['recolors'],
): RecolorConfig[] {
  if (!rc) return [];
  const out: RecolorConfig[] = [];
  const multi = rc as { [k: `color_${number}`]: RecolorConfig | undefined };
  for (let n = 1; n < 10; n++) {
    const c = multi[`color_${n}`];
    if (c) out.push(c);
    else break;
  }
  if (out.length === 0) out.push(rc as RecolorConfig);
  return out;
}

/**
 * Port of upstream `resolvePaletteToken`.
 * Resolves a palette token reference (e.g. 'ulpc', 'metal.iron') to its respective
 * material class and version. If the token lacks a dot separator, it is assumed to represent
 * a version identifier, and the specified fallback material is used.
 * 
 * @param token - The raw palette string token.
 * @param fallbackMaterial - Default material to inherit if none is specified in the token.
 * @returns An object containing the resolved material and version name.
 */
function resolvePaletteToken(
  token: string,
  fallbackMaterial: string,
): { material: string; version: string } {
  const parts = token.split('.');
  let material = parts[0] ?? '';
  let version = parts[1] ?? '';
  if (!version) {
    version = material;
    material = fallbackMaterial;
  }
  return { material, version };
}

interface RecolorKeyContext {
  readonly material?: string;
  readonly default?: string;
  readonly base?: string;
}

/**
 * Port of upstream `parseRecolorKey`. Accepts `material.version.recolor`,
 * `version.recolor`, or bare `recolor` (QI), falling back to the context
 * palette's `material` / `default` / `base`.
 * 
 * Parses composite key strings into their discrete material, version, and color components.
 * 
 * @param recolorKey - The raw, potentially qualified recolor option selected by the user.
 * @param ctx - Fallback context extracted from the material's metadata.
 * @param materials - The active materials metadata dictionary.
 * @returns A tuple of [material, version, recolorKey].
 */
function parseRecolorKey(
  recolorKey: string | null,
  ctx: RecolorKeyContext | undefined,
  materials: Materials,
): [string | undefined, string | undefined, string] {
  let key = recolorKey;
  if (!key) key = ctx?.base ?? '';
  const reversed = key.split('.').reverse();
  const recolor = reversed[0] ?? '';
  let version: string | undefined = reversed[1];
  let material: string | undefined = reversed[2];

  if (!material) {
    if (version && materials[version]) {
      material = version;
      version = undefined;
    } else {
      material = ctx?.material;
    }
  }
  if (!version) version = ctx?.default;
  return [material, version, recolor];
}

/**
 * Constructs a fallback context object using the metadata descriptors of a material.
 * 
 * @param material - The material identifier.
 * @param mm - Metadata specifications of the material.
 * @returns A consolidated `RecolorKeyContext` helper.
 */
function materialCtx(
  material: string,
  mm: PaletteMaterialMeta | undefined,
): RecolorKeyContext {
  return {
    material,
    ...(mm?.default !== undefined ? { default: mm.default } : {}),
    ...(mm?.base !== undefined ? { base: mm.base } : {}),
  };
}

/**
 * Port of upstream `getBasePalette` — the *source* ramp present in the
 * PNG. Explicit `source` wins; otherwise `base` ("version.recolor") or the
 * material's `default`/`base`.
 * 
 * Resolves the source/base color ramp colors that represent the original colors
 * in the template graphic sheet.
 * 
 * @param nr - The normalized recolor specification.
 * @param materials - Active materials metadata catalog.
 * @returns Read-only array of source hex colors, or null if unresolvable.
 */
function getBasePalette(
  nr: NormalizedRecolor,
  materials: Materials,
): readonly string[] | null {
  if (nr.source) return nr.source;
  const mm = materials[nr.material];
  if (!mm) return null;
  const [version, recolor] = nr.base.split('.');
  if (version === undefined || recolor === undefined) return null;
  return mm.palettes[version]?.[recolor] ?? null;
}

/**
 * Port of upstream `getTargetPalette` — the chosen recolor's ramp.
 * 
 * Resolves the target color ramp representing the user's selected recolor option.
 * 
 * @param material - The primary material class.
 * @param targetColor - The selected target color key.
 * @param materials - Active materials metadata catalog.
 * @returns Read-only array of target hex colors, or null if unresolvable.
 */
function getTargetPalette(
  material: string,
  targetColor: string,
  materials: Materials,
): readonly string[] | null {
  let mm = materials[material];
  if (!mm) return null;
  const [newMat, version, recolor] = parseRecolorKey(
    targetColor,
    materialCtx(material, mm),
    materials,
  );
  if (newMat && materials[newMat]) mm = materials[newMat];
  if (version === undefined) return null;
  return mm.palettes[version]?.[recolor] ?? null;
}

/**
 * Port of upstream `applyRecolorDefaults` + `expandRecolorPalettes`.
 * Returns null when the material is unknown (warn-and-skip, QH).
 * 
 * Processes a raw `RecolorConfig`, resolving its baseline references and expanding
 * its declared palette tokens into a single flat Set of fully qualified, selectable
 * variant color identifier strings.
 * 
 * @param entry - The raw recolor configuration object.
 * @param materials - The active materials metadata catalog.
 * @returns The populated `NormalizedRecolor` definition, or null if the material class is unknown.
 */
function normalizeRecolor(
  entry: RecolorConfig,
  materials: Materials,
): NormalizedRecolor | null {
  const mm = materials[entry.material];
  if (!mm) return null;
  const defaultVersion = mm.default ?? '';
  const matBase = mm.base ?? '';

  let base = entry.base;
  if (!base) base = `${defaultVersion}.${matBase}`;
  else if (!base.includes('.')) base = `${defaultVersion}.${base}`;

  const variants = new Set<string>();
  for (const token of entry.palettes) {
    const { material: tMat, version: tVer } = resolvePaletteToken(
      token,
      entry.material,
    );
    const verMap = materials[tMat]?.palettes[tVer];
    if (!verMap) continue;
    for (const colorKey of Object.keys(verMap)) {
      const matPart = entry.material !== tMat ? `${tMat}.` : '';
      const verPart = defaultVersion !== tVer ? `${tVer}.` : '';
      variants.add(`${matPart}${verPart}${colorKey}`);
    }
  }

  return {
    material: entry.material,
    typeName: entry.type_name ?? null,
    defaultVersion,
    base,
    source: entry.source,
    variants: [...variants],
  };
}

/**
 * Port of upstream `fixMissingRecolor`: the chosen key as-is if it's a
 * known variant, else match its trailing color against the expanded
 * variants. Returns null when nothing matches.
 * 
 * Variant Swatch Matching Algorithm:
 * 1. Checks if the chosen `recolor` string is an exact match inside the expanded list of variants.
 * 2. If no exact match is found, extract the bare color identifier name (the last token, e.g., 'blue') using `parseRecolorKey`.
 * 3. Loop through the expanded list of allowed variants:
 *    - Tokenize each variant on `.` (e.g. 'metal.iron.blue').
 *    - If the tokens contain the target bare color string, or the target bare color string is an exact match to the entire variant, return this variant key as the resolved match.
 * 4. Returns `null` if no matching variant is found.
 * 
 * @param recolor - The selected recolor identifier string.
 * @param nr - The normalized recolor context.
 * @param materials - The active materials metadata catalog.
 * @returns The resolved matching variant key, or null if unmatched.
 */
function fixMissingRecolor(
  recolor: string,
  nr: NormalizedRecolor,
  materials: Materials,
): string | null {
  if (nr.variants.includes(recolor)) return recolor;
  const mm = materials[nr.material];
  const [, , parsed] = parseRecolorKey(
    recolor,
    materialCtx(nr.material, mm),
    materials,
  );
  for (const variant of nr.variants) {
    const parts = variant.split('.');
    if (parts.length > 1 && parts.includes(parsed)) return variant;
    if (parsed === variant) return variant;
  }
  return null;
}

/**
 * Helper to locate an ItemDefinition by its category type name and raw name.
 * 
 * @param catalog - The compiled asset Catalog.
 * @param typeName - The item category type name.
 * @param rawName - The human-readable name of the item.
 * @returns The matching ItemDefinition, or undefined if not found.
 */
function findItem(
  catalog: Catalog,
  typeName: TypeName,
  rawName: string,
): ItemDefinition | undefined {
  for (const item of catalog.byItemId.values()) {
    if (item.type_name === typeName && item.name === rawName) return item;
  }
  return undefined;
}

/**
 * Port of upstream `getBodyColor`: the recolor chosen on whichever
 * selected item is itself `match_body_color` (the body skin tone all
 * other body-colored accessories inherit).
 * 
 * Crawls through the active selections to retrieve the skin tone chosen for
 * the character's base body archetype.
 * 
 * @param catalog - The compiled asset Catalog.
 * @param selections - Currently selected items configuration.
 * @returns The body skin tone recolor string, or null if none is selected.
 */
function getBodyColor(
  catalog: Catalog,
  selections: Selections,
): string | null {
  for (const sel of Object.values(selections.items)) {
    const def = findItem(catalog, sel.typeName, sel.name);
    if (def?.match_body_color && sel.recolor) return sel.recolor;
  }
  return null;
}

/**
 * Build the per-`type_name` chosen-recolor map for an item across the
 * selections — the adapted port of upstream `getMultiRecolors`. Our
 * `Selection` has no `subId`; sub-entries bind by `type_name` to the
 * matching selection's `recolor` (semantically what upstream's
 * `recolors[typeName]` keying expresses). `match_body_color` forces the
 * body color (QD).
 * 
 * Maps each sub-category to its chosen color option, resolving multi-material
 * color overrides and applying body-color synchronization where applicable.
 * 
 * @param item - The ItemDefinition being rendered.
 * @param primarySelection - The main selection object for this specific item.
 * @param entries - List of recolor configurations for this item's layers.
 * @param catalog - Compiled asset Catalog.
 * @param selections - Complete character selections record.
 * @returns A dictionary mapping slot type names to their selected recolor string keys.
 */
function getMultiRecolors(
  item: ItemDefinition,
  primarySelection: Selection,
  entries: readonly RecolorConfig[],
  catalog: Catalog,
  selections: Selections,
): Record<string, string> {
  const recolors: Record<string, string> = {};

  const primaryKey = item.type_name;
  if (primarySelection.recolor) {
    recolors[primaryKey] = primarySelection.recolor;
  }

  for (const entry of entries) {
    if (!entry.type_name || entry.type_name === primaryKey) continue;
    const sub = selections.items[entry.type_name];
    if (sub?.recolor) recolors[entry.type_name] = sub.recolor;
  }

  if (item.match_body_color) {
    const bodyColor = getBodyColor(catalog, selections);
    if (bodyColor) recolors[primaryKey] = bodyColor;
  }

  return recolors;
}

/**
 * Aligns and appends corresponding color values from source and target ramps into
 * two parallel output arrays.
 * 
 * Note on Safety:
 * Upstream's `buildColorMap` iterates min(source,target) implicitly.
 * However, our canvas engine's `recolorPixels` throws on a source/target length mismatch.
 * This helper truncates the ramps to their common minimum length, avoiding out-of-bounds mismatches.
 * 
 * @param source - The source color ramp array.
 * @param target - The target color ramp array.
 * @param outSource - Array accumulating final aligned source hex values.
 * @param outTarget - Array accumulating final aligned target hex values.
 */
function alignedPush(
  source: readonly string[],
  target: readonly string[],
  outSource: string[],
  outTarget: string[],
): void {
  const len = Math.min(source.length, target.length);
  for (let i = 0; i < len; i++) {
    const s = source[i];
    const t = target[i];
    if (s !== undefined && t !== undefined) {
      outSource.push(s);
      outTarget.push(t);
    }
  }
}

/**
 * Build the `ComposeOptions.resolvePalette` callback from ingested data
 * (Step 4.2 / QB). Closes over `catalog` + `palettes` + `selections`; the
 * returned function is exactly the existing A2 seam — `composeSelections`
 * is unchanged. Multiple recolor entries are flattened into one
 * `PaletteSwap` (source/target concatenated, index-aligned), matching
 * upstream's single-pass `recolorImageCPU` over all mappings.
 *
 * Returns `undefined` for a layer with no applicable recolor (the seam's
 * "draw raw" contract). Unresolvable entries are skipped with an optional
 * `onWarn` (QH); a hard material/palette miss never throws.
 * 
 * @param catalog - Compiled asset Catalog.
 * @param palettes - Compiled PaletteMetadata database.
 * @param selections - The active user selection configuration.
 * @param options - Optional configuration including warning callbacks.
 * @returns The closed-over `ResolvePalette` function.
 */
export function makeResolvePalette(
  catalog: Catalog,
  palettes: PaletteMetadata,
  selections: Selections,
  options: MakeResolvePaletteOptions = {},
): ResolvePalette {
  const materials = palettes.materials;
  const warn = options.onWarn;

  return (selection, item): PaletteSwap | undefined => {
    const entries = collectRecolorEntries(item.recolors);
    if (entries.length === 0) return undefined;

    const chosen = getMultiRecolors(
      item,
      selection,
      entries,
      catalog,
      selections,
    );

    const source: string[] = [];
    const target: string[] = [];
    const usedMaterials: string[] = [];

    for (const entry of entries) {
      const nr = normalizeRecolor(entry, materials);
      if (!nr) {
        warn?.(`recolor: unknown material "${entry.material}" on "${item.name}"`);
        continue;
      }

      const key = chosen[nr.typeName ?? item.type_name];
      if (!key) continue; // no recolor picked for this entry

      const verified = fixMissingRecolor(key, nr, materials);
      if (!verified) {
        warn?.(
          `recolor: "${key}" is not a valid ${nr.material} color for "${item.name}"`,
        );
        continue;
      }

      const sourceRamp = getBasePalette(nr, materials);
      const targetRamp = getTargetPalette(nr.material, verified, materials);
      if (!sourceRamp || !targetRamp) {
        warn?.(
          `recolor: could not resolve ${nr.material} ramp "${verified}" for "${item.name}"`,
        );
        continue;
      }

      alignedPush(sourceRamp, targetRamp, source, target);
      if (!usedMaterials.includes(nr.material)) usedMaterials.push(nr.material);
    }

    if (source.length === 0) return undefined;
    return {
      material: usedMaterials.join('+'),
      source,
      target,
    };
  };
}

/**
 * The first recolor entry's palette-expanded variant names (upstream
 * `recolors[0].variants`). This is the data `parseHash`'s recolor-variant
 * pass needs to resolve recolor-only hash values (Step 4.3 / closes the
 * Step 2.1 Q2 deferral). Returns `[]` when the item has no recolors or
 * the material is unknown. The single expansion path
 * (`collectRecolorEntries` + `normalizeRecolor`) is shared with
 * `makeResolvePalette` — no drift.
 * 
 * Resolves the global set of variant names allowed for an item based on its primary recolor specification.
 * 
 * @param item - The item definition under analysis.
 * @param palettes - Compiled PaletteMetadata catalog.
 * @returns Flat array of allowed variant string identifiers.
 */
export function getRecolorVariants(
  item: ItemDefinition,
  palettes: PaletteMetadata,
): readonly string[] {
  const first = collectRecolorEntries(item.recolors)[0];
  if (!first) return [];
  const nr = normalizeRecolor(first, palettes.materials);
  return nr ? nr.variants : [];
}

/** One recolor option plus the hex ramp behind it — what a swatch UI draws. */
export interface RecolorSwatch {
  /** The fully-qualified recolor identifier. */
  readonly recolor: string;
  /** Array of hex colors representing the swatched palette ramp. */
  readonly colors: readonly string[];
}

/**
 * The first recolor entry's palette-expanded variants paired with their
 * resolved color ramps. Shares the expansion path with `getRecolorVariants`
 * (`collectRecolorEntries` + `normalizeRecolor`); each variant's ramp is
 * resolved through `getTargetPalette`. Returns `[]` when the item has no
 * recolors or the material is unknown. Lets a UI draw real color swatches
 * without re-implementing core's recolor-key resolution. Like
 * `getRecolorVariants`, only the first recolor entry is exposed —
 * multi-material items show their primary material's swatches.
 * 
 * @param item - The item definition under analysis.
 * @param palettes - Compiled PaletteMetadata catalog.
 * @returns Array of swatches matching variants to their resolved visual ramps.
 */
export function getRecolorSwatches(
  item: ItemDefinition,
  palettes: PaletteMetadata,
): readonly RecolorSwatch[] {
  const first = collectRecolorEntries(item.recolors)[0];
  if (!first) return [];
  const nr = normalizeRecolor(first, palettes.materials);
  if (!nr) return [];
  const out: RecolorSwatch[] = [];
  for (const recolor of nr.variants) {
    const colors = getTargetPalette(nr.material, recolor, palettes.materials);
    if (colors && colors.length > 0) out.push({ recolor, colors });
  }
  return out;
}
