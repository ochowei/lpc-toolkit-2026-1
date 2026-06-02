import type { BodyType, Catalog, Selection, TypeName } from '@lpc-toolkit/core';
import { itemSupportsBodyType } from './slice/catalog-tree';
import { CLOTHING_TYPES, type Preset, type PresetItem } from './presets';

/** Result of applying a clothing preset to the current character selections. */
export interface PresetApplyResult {
  /** Full new selections: personal categories kept, clothing replaced. */
  readonly selections: Record<TypeName, Selection>;
  /** Preset items dropped — catalog miss or unsupported body type. */
  readonly skipped: readonly PresetItem[];
}

/**
 * Compute the selections after applying `preset`:
 * - every CLOTHING_TYPES entry is removed from `current` (clean slate);
 * - personal-appearance categories are kept untouched;
 * - each preset item that resolves in the catalog AND supports `bodyType`
 *   is added; the rest are returned in `skipped`.
 */
export function computePresetSelection(
  preset: Preset,
  current: Readonly<Record<TypeName, Selection>>,
  bodyType: BodyType,
  catalog: Catalog,
): PresetApplyResult {
  const selections: Record<TypeName, Selection> = {};
  for (const [typeName, selection] of Object.entries(current)) {
    if (!CLOTHING_TYPES.has(typeName)) selections[typeName] = selection;
  }

  const skipped: PresetItem[] = [];
  for (const item of preset.items) {
    const def = (catalog.byTypeName.get(item.typeName) ?? []).find(
      (d) => d.name === item.name,
    );
    if (!def || !itemSupportsBodyType(def, bodyType)) {
      skipped.push(item);
      continue;
    }
    selections[item.typeName] = {
      typeName: item.typeName,
      name: item.name,
      ...(item.variant ? { variant: item.variant } : {}),
    };
  }

  return { selections, skipped };
}
