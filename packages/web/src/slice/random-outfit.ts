import type {
  BodyType,
  Catalog,
  ItemDefinition,
  PaletteMetadata,
  Selection,
  Selections,
  TypeName,
} from '@lpc-toolkit/core';
import { itemSupportsBodyType } from './catalog-tree';
import { CATEGORY_GROUPS, type GroupId } from './category-groups';
import { getColorOptions } from './color-options';
import {
  DEFAULT_RANDOM_SCOPE,
  NORMAL_RANDOM_PROFILE,
  isTypeEnabledByRandomScope,
  preserveDisabledScopeSelections,
  profileTypeNames,
  randomProfileForStyle,
  type RandomProfile,
  type RandomScope,
} from './random-profiles';
import { selectionForItem } from './selection';

/** Inputs for generating a random outfit from the currently loaded catalog. */
export interface PickRandomOutfitArgs {
  readonly catalog: Catalog;
  readonly bodyType: BodyType;
  readonly rng?: () => number;          // defaults to Math.random
  readonly optionalProb?: number;       // defaults to profile optionalProb
  readonly excludeGroups?: readonly GroupId[]; // defaults to profile excludeGroups
  readonly palettes?: PaletteMetadata;  // enables default recolor selection
  readonly profile?: RandomProfile | string;
  readonly scope?: RandomScope;
  readonly currentSelections?: Readonly<Record<TypeName, Selection>>;
}

function resolveProfile(profile: RandomProfile | string | undefined): RandomProfile {
  if (!profile) return NORMAL_RANDOM_PROFILE;
  if (typeof profile === 'string') return randomProfileForStyle(profile);
  return profile;
}

function isRequiredType(profile: RandomProfile, typeName: TypeName): boolean {
  if (profile.requiredTypeNames?.includes(typeName)) return true;

  const requiredGroups = new Set<GroupId>(profile.requiredGroups);
  return CATEGORY_GROUPS.some(
    (group) => requiredGroups.has(group.id) && group.typeNames.includes(typeName),
  );
}

function filterByProfilePool(
  defs: readonly ItemDefinition[],
  allowedNames: readonly string[] | undefined,
): typeof defs {
  if (!allowedNames) return defs;
  const allowed = new Set(allowedNames);
  return defs.filter((item) => allowed.has(item.name));
}

function typeNamesForRandomOutfit(
  profile: RandomProfile,
  excluded: ReadonlySet<GroupId>,
  hasLegacyExcludeOverride: boolean,
): readonly TypeName[] {
  if (!hasLegacyExcludeOverride) return profileTypeNames(profile);
  return CATEGORY_GROUPS
    .filter((group) => !excluded.has(group.id))
    .flatMap((group) => group.typeNames);
}

function selectionSupportsBodyType(
  catalog: Catalog,
  selection: Selection,
  bodyType: BodyType,
): boolean {
  const defs = catalog.byTypeName.get(selection.typeName) ?? [];
  return defs.some(
    (item) => item.name === selection.name && itemSupportsBodyType(item, bodyType),
  );
}

function filterSelectionsByBodyType(
  selections: Readonly<Record<TypeName, Selection>>,
  catalog: Catalog,
  bodyType: BodyType,
): Record<TypeName, Selection> {
  const compatible: Record<TypeName, Selection> = {};
  for (const [typeName, selection] of Object.entries(selections)) {
    if (selectionSupportsBodyType(catalog, selection, bodyType)) {
      compatible[typeName] = selection;
    }
  }
  return compatible;
}

function randomColorFieldsForItem(
  item: ItemDefinition,
  palettes: PaletteMetadata | undefined,
  rng: () => number,
): { variant?: string; recolor?: string } {
  if (!palettes && (!item.variants || item.variants.length === 0)) return {};

  if (palettes) {
    const colors = getColorOptions(item, palettes);
    if (colors.mode === 'recolors') {
      const pick = colors.options[Math.floor(rng() * colors.options.length)];
      return pick ? { recolor: pick.value } : {};
    }
    if (colors.mode === 'variants') {
      const pick = colors.options[Math.floor(rng() * colors.options.length)];
      return pick ? { variant: pick.value } : {};
    }
  }

  const variants = item.variants ?? [];
  const pick = variants[Math.floor(rng() * variants.length)];
  return pick ? { variant: pick } : {};
}

function shouldRandomizeColor(profile: RandomProfile, typeName: TypeName): boolean {
  return profile.randomColorTypeNames?.includes(typeName) ?? false;
}

/**
 * Generate a Feeling Lucky outfit. Required profile groups always get an item
 * when compatible art exists. Optional groups are included with probability
 * `optionalProb`. Disabled random scopes preserve current selections.
 */
export function pickRandomOutfit(args: PickRandomOutfitArgs): Selections {
  const rng = args.rng ?? Math.random;
  const profile = resolveProfile(args.profile);
  const bodyType = profile.bodyType ?? args.bodyType;
  const scope = args.scope ?? DEFAULT_RANDOM_SCOPE;
  const optionalProb = args.optionalProb ?? profile.optionalProb;
  const excluded = new Set<GroupId>(args.excludeGroups ?? profile.excludeGroups);
  const hasLegacyExcludeOverride =
    args.profile === undefined &&
    args.excludeGroups !== undefined &&
    profile === NORMAL_RANDOM_PROFILE;
  const preserved = args.currentSelections
    ? preserveDisabledScopeSelections(args.currentSelections, scope)
    : {};
  const compatiblePreserved =
    profile.bodyType && profile.bodyType !== args.bodyType
      ? filterSelectionsByBodyType(preserved, args.catalog, bodyType)
      : preserved;

  const items: Record<TypeName, Selection> = {
    ...compatiblePreserved,
  };

  for (const typeName of typeNamesForRandomOutfit(
    profile,
    excluded,
    hasLegacyExcludeOverride,
  )) {
    const group = CATEGORY_GROUPS.find((g) => g.typeNames.includes(typeName));
    if (group && excluded.has(group.id)) continue;
    if (args.scope && !isTypeEnabledByRandomScope(typeName, scope)) continue;
    if (Object.prototype.hasOwnProperty.call(items, typeName)) continue;

    const isRequired = isRequiredType(profile, typeName);
    if (!isRequired && rng() > optionalProb) continue;

    const defs = args.catalog.byTypeName.get(typeName) ?? [];
    const pooled = filterByProfilePool(defs, profile.itemPools?.[typeName]);
    const compatible = pooled.filter((d) => itemSupportsBodyType(d, bodyType));
    if (compatible.length === 0) continue;

    const pick = compatible[Math.floor(rng() * compatible.length)]!;
    const selection = selectionForItem(
      typeName,
      pick,
      scope.colors ? args.palettes : undefined,
    );
    items[typeName] =
      scope.colors && shouldRandomizeColor(profile, typeName)
        ? {
            ...selection,
            ...randomColorFieldsForItem(pick, args.palettes, rng),
          }
        : selection;
  }

  return { bodyType, items };
}
