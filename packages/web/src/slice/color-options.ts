import {
  getDefaultColorSelection,
  getColorChannels,
  getRecolorSwatches,
  primaryColorFollowsBody,
  type ItemDefinition,
  type PaletteMetadata,
  type Selection,
  type TypeName,
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

interface ColorChannelOptionBase {
  readonly id: 'primary' | TypeName;
  readonly typeName: TypeName;
  readonly primary: boolean;
  readonly label?: string;
  readonly defaultSwatch?: string;
}

export type ColorChannelOptions =
  | (ColorChannelOptionBase & {
      readonly mode: 'recolors';
      readonly options: readonly RecolorColorOption[];
    })
  | (ColorChannelOptionBase & {
      readonly mode: 'linked-recolor';
      readonly recolor?: string;
      readonly swatch?: string;
    });

export interface ColorSummarySwatch {
  readonly channelId: 'primary' | TypeName;
  readonly recolor?: string;
  readonly colors: readonly string[];
}

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

function recolorOptions(
  swatches: ReturnType<typeof getColorChannels>[number]['swatches'],
): readonly RecolorColorOption[] {
  const options = new Map<string, RecolorColorOption>();
  for (const swatch of swatches) {
    if (options.has(swatch.recolor)) continue;
    options.set(swatch.recolor, {
      kind: 'recolor',
      value: swatch.recolor,
      swatch: representative(swatch.colors),
      label: humanize(swatch.recolor),
    });
  }
  return [...options.values()];
}

/** Ordered UI groups for every valid color channel owned by one asset. */
export function getColorChannelOptions(
  item: ItemDefinition,
  palettes: PaletteMetadata,
  context: ColorOptionContext = {},
): readonly ColorChannelOptions[] {
  return getColorChannels(item, palettes).map((channel) => {
    const base = {
      id: channel.id,
      typeName: channel.typeName,
      primary: channel.primary,
      ...(channel.label !== undefined ? { label: channel.label } : {}),
      ...(channel.defaultColors.length > 0
        ? { defaultSwatch: representative(channel.defaultColors) }
        : {}),
    };
    const linked = channel.linkedTo
      || (channel.primary && primaryColorFollowsBody(item));
    if (linked) {
      const selected = channel.swatches.find(
        (swatch) => swatch.recolor === context.bodyRecolor,
      );
      return {
        ...base,
        mode: 'linked-recolor' as const,
        ...(context.bodyRecolor !== undefined
          ? { recolor: context.bodyRecolor }
          : {}),
        ...(selected
          ? { swatch: representative(selected.colors) }
          : base.defaultSwatch
            ? { swatch: base.defaultSwatch }
            : {}),
      };
    }
    return {
      ...base,
      mode: 'recolors' as const,
      options: recolorOptions(channel.swatches),
    };
  });
}

/** Primary plus explicit independent-secondary swatches for a collapsed row. */
export function getColorSummarySwatches(
  item: ItemDefinition,
  selection: Selection,
  palettes: PaletteMetadata,
  context: ColorOptionContext = {},
): readonly ColorSummarySwatch[] {
  const summary: ColorSummarySwatch[] = [];
  for (const channel of getColorChannels(item, palettes)) {
    if (!channel.primary && channel.linkedTo) continue;
    const recolor = channel.primary
      ? (channel.linkedTo || primaryColorFollowsBody(item)
          ? context.bodyRecolor
          : selection.recolor)
      : selection.channelRecolors?.[channel.id];
    if (!channel.primary && recolor === undefined) continue;
    const colors = recolor === undefined
      ? channel.defaultColors
      : channel.swatches.find((swatch) => swatch.recolor === recolor)?.colors;
    if (!colors || colors.length === 0) continue;
    summary.push({
      channelId: channel.id,
      ...(recolor !== undefined ? { recolor } : {}),
      colors,
    });
  }
  return summary;
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
    if (primaryColorFollowsBody(item)) {
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
 * independent recolor items default to their first color so the swatch row has
 * an active choice. Linked primary channels store no local value. Returns
 * `{}` for an item with no colors or a missing item.
 */
export function pickDefaults(
  item: ItemDefinition | undefined,
  palettes: PaletteMetadata,
): { variant?: string; recolor?: string } {
  const defaults = getDefaultColorSelection(item, palettes);
  if (!item || !defaults.recolor || !primaryColorFollowsBody(item)) {
    return defaults;
  }
  return {};
}

/** Keep only replacement channel values accepted by same-name independent channels. */
export function transferChannelRecolors(
  previous: Selection | undefined,
  replacement: ItemDefinition,
  palettes: PaletteMetadata,
): Readonly<Record<TypeName, string>> | undefined {
  if (!previous?.channelRecolors) return undefined;
  const entries: Array<readonly [TypeName, string]> = [];
  for (const channel of getColorChannels(replacement, palettes)) {
    if (channel.primary || channel.linkedTo) continue;
    const recolor = previous.channelRecolors[channel.id];
    if (
      recolor
      && channel.swatches.some((swatch) => swatch.recolor === recolor)
    ) {
      entries.push([channel.id, recolor]);
    }
  }
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
