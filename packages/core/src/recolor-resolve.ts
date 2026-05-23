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

export interface MakeResolvePaletteOptions {
  /** Called (warn-and-skip, QH) when a recolor entry can't be resolved. */
  readonly onWarn?: (message: string) => void;
}

export type ResolvePalette = (
  selection: Selection,
  item: ItemDefinition,
) => PaletteSwap | undefined;

type Materials = PaletteMetadata['materials'];

interface NormalizedRecolor {
  readonly material: string;
  readonly typeName: TypeName | null;
  readonly defaultVersion: string;
  readonly base: string;
  readonly source: readonly string[] | undefined;
  readonly variants: readonly string[];
}

/**
 * Port of upstream `collectRecolorEntries`
 * (`scripts/generateSources/item-helper.js`): `color_1`..`color_9` if
 * present, else the object itself as a single entry. Upstream breaks at
 * the first missing `color_N`, so a gap collapses to the single form —
 * replicated faithfully.
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

/** Port of upstream `resolvePaletteToken`. */
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

/** Port of upstream `getTargetPalette` — the chosen recolor's ramp. */
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

/** Reverse-lookup an `ItemDefinition` by (typeName, raw name). */
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

function alignedPush(
  source: readonly string[],
  target: readonly string[],
  outSource: string[],
  outTarget: string[],
): void {
  // Upstream `buildColorMap` iterates min(source,target) implicitly
  // (pairs only where both exist). Our `recolorPixels` *throws* on a
  // source/target length mismatch, so truncate to the common length.
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
  readonly recolor: string;
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
