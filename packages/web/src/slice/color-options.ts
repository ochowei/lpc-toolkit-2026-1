import {
  getDefaultColorSelection,
  getRecolorSwatches,
  type ItemDefinition,
  type PaletteMetadata,
} from '@lpc-toolkit/core';

/** Swatch-backed color option that writes to `Selection.recolor`. */
export interface RecolorColorOption {
  readonly kind: 'recolor';
  readonly value: string; // goes into Selection.recolor
  readonly swatch: string; // hex color for the swatch square
  readonly label: string; // display text + tooltip
}

/** Named variant option that writes to `Selection.variant`. */
export interface VariantColorOption {
  readonly kind: 'variant';
  readonly value: string; // goes into Selection.variant
  readonly label: string; // display text
}

/** Selection context used to resolve read-only followed colors. */
export interface ColorOptionContext {
  readonly bodyRecolor?: string;
}

/** UI-ready color choices for an item: editable, linked, variant, or none. */
export type ColorOptions =
  | { readonly mode: 'recolors'; readonly options: readonly RecolorColorOption[] }
  | {
      readonly mode: 'linked-recolor';
      readonly recolor?: string;
      readonly swatch?: string;
    }
  | { readonly mode: 'variants'; readonly options: readonly VariantColorOption[] }
  | { readonly mode: 'none' };

/**
 * Display label for a color key: "fur_black" -> "Fur black"; "lpcr.tan" ->
 * "Tan". The material/version prefix is intentionally dropped for brevity,
 * so two cross-version keys with the same bare name would render the same
 * label — harmless, since the option's `value` keeps the full prefixed key.
 */
function humanize(raw: string): string {
  const tail = raw.includes('.') ? raw.slice(raw.lastIndexOf('.') + 1) : raw;
  const spaced = tail.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A recognizable single color from a dark-to-light ramp: the entry at floor(len/2) (upper-mid). */
function representative(colors: readonly string[]): string {
  return colors[Math.floor(colors.length / 2)] ?? colors[0] ?? '#000000';
}

/**
 * The color choices for an item. A `recolors` item yields real color
 * swatches; a `variants` item yields named chips (variant folders carry no
 * color value); an item with neither yields `mode: 'none'`. Upstream data
 * never sets both, so `recolors` is checked first.
 * If an item's recolors resolve to no swatches, it falls through to the variants check.
 */
export function getColorOptions(
  item: ItemDefinition,
  palettes: PaletteMetadata,
  context: ColorOptionContext = {},
): ColorOptions {
  const swatches = getRecolorSwatches(item, palettes);
  if (swatches.length > 0) {
    const options = swatches.map((s) => ({
      kind: 'recolor' as const,
      value: s.recolor,
      swatch: representative(s.colors),
      label: humanize(s.recolor),
    }));
    if (item.match_body_color && item.type_name !== 'body') {
      const selected = options.find(
        (option) => option.value === context.bodyRecolor,
      );
      return {
        mode: 'linked-recolor',
        ...(context.bodyRecolor !== undefined
          ? { recolor: context.bodyRecolor }
          : {}),
        ...(selected ? { swatch: selected.swatch } : {}),
      };
    }
    return {
      mode: 'recolors',
      options,
    };
  }
  if (item.variants && item.variants.length > 0) {
    return {
      mode: 'variants',
      options: item.variants.map((v) => ({
        kind: 'variant',
        value: v,
        label: humanize(v),
      })),
    };
  }
  return { mode: 'none' };
}

/**
 * The color fields to set when an item is freshly picked: variant items
 * need `variants[0]` (the sprite path requires a variant folder); recolor
 * items default to their first color so the swatch row has an active
 * choice. Returns `{}` for an item with no colors or a missing item.
 */
export function pickDefaults(
  item: ItemDefinition | undefined,
  palettes: PaletteMetadata,
): { variant?: string; recolor?: string } {
  return getDefaultColorSelection(item, palettes);
}
