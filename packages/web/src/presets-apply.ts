import type {
  BodyType,
  Catalog,
  PaletteMetadata,
  Selection,
  TypeName,
} from '@lpc-toolkit/core';
import { itemSupportsBodyType } from './slice/catalog-tree';
import { pickDefaults } from './slice/color-options';
import { CLOTHING_TYPES, type Preset, type PresetItem } from './presets';

/** Result of applying a clothing preset to the current character selections. */
export interface PresetApplyResult {
  /** Target body type resolved from the preset (falling back to current). */
  readonly bodyType: BodyType;
  /** Full new selections: personal categories kept, clothing replaced. */
  readonly selections: Record<TypeName, Selection>;
  /** Preset items dropped — catalog miss or unsupported body type. */
  readonly skipped: readonly PresetItem[];
}

/**
 * Compute the selections after applying `preset`:
 * - every CLOTHING_TYPES entry is removed from `current` (clean slate);
 * - personal-appearance categories are kept untouched;
 * - each preset item that resolves in the catalog AND supports the resolved
 *   bodyType is added; the rest are returned in `skipped`.
 */
export function computePresetSelection(
  preset: Preset,
  current: Readonly<Record<TypeName, Selection>>,
  bodyType: BodyType,
  catalog: Catalog,
  palettes: PaletteMetadata,
): PresetApplyResult {
  const targetBodyType = preset.bodyType ?? bodyType;
  const selections: Record<TypeName, Selection> = {};
  for (const [typeName, selection] of Object.entries(current)) {
    if (!CLOTHING_TYPES.has(typeName)) selections[typeName] = selection;
  }

  const skipped: PresetItem[] = [];
  for (const item of preset.items) {
    const def = (catalog.byTypeName.get(item.typeName) ?? []).find(
      (d) => d.name === item.name,
    );
    if (!def || !itemSupportsBodyType(def, targetBodyType)) {
      skipped.push(item);
      continue;
    }
    const colorFields =
      item.variant || item.recolor
        ? {
            ...(item.variant ? { variant: item.variant } : {}),
            ...(item.recolor ? { recolor: item.recolor } : {}),
          }
        : pickDefaults(def, palettes);
    selections[item.typeName] = {
      typeName: item.typeName,
      name: item.name,
      ...colorFields,
    };
  }

  return { bodyType: targetBodyType, selections, skipped };
}
