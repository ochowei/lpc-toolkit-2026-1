import { getRecolorSwatches } from './recolor-resolve.js';
import type { ItemDefinition, PaletteMetadata } from './types.js';

export function getDefaultColorSelection(
  item: ItemDefinition | undefined,
  palettes: PaletteMetadata,
): { readonly variant?: string; readonly recolor?: string } {
  if (!item) return {};
  const firstRecolor = getRecolorSwatches(item, palettes)[0];
  if (firstRecolor) return { recolor: firstRecolor.recolor };
  const firstVariant = item.variants?.[0];
  return firstVariant ? { variant: firstVariant } : {};
}
