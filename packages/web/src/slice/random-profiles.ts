import type { Selection, TypeName } from '@lpc-toolkit/core';
import type { TranslationKey } from '../i18n';
import {
  CATEGORY_GROUPS,
  groupForType,
  type GroupId,
} from './category-groups';

export interface RandomProfile {
  readonly id: string;
  readonly labelKey: TranslationKey;
  readonly requiredGroups: readonly GroupId[];
  readonly optionalGroups: readonly GroupId[];
  readonly excludeGroups: readonly GroupId[];
  readonly optionalProb: number;
  readonly typeNames?: readonly TypeName[];
  readonly itemPools?: Partial<Record<TypeName, readonly string[]>>;
}

export interface RandomScope {
  readonly appearance: boolean;
  readonly clothing: boolean;
  readonly equipment: boolean;
  readonly colors: boolean;
}

export const DEFAULT_RANDOM_SCOPE: RandomScope = {
  appearance: true,
  clothing: true,
  equipment: true,
  colors: true,
};

export const NORMAL_RANDOM_PROFILE: RandomProfile = {
  id: 'normal',
  labelKey: 'randomProfile.normal',
  requiredGroups: ['body'],
  optionalGroups: ['face', 'clothing', 'accessories', 'weapons', 'fantasy'],
  excludeGroups: ['fx'],
  optionalProb: 0.5,
};

export const FARMER_RANDOM_PROFILE: RandomProfile = {
  id: 'farmer',
  labelKey: 'preset.farmer',
  requiredGroups: ['body'],
  optionalGroups: ['face', 'clothing', 'accessories'],
  excludeGroups: ['fantasy', 'weapons', 'fx'],
  optionalProb: 0.5,
  typeNames: ['body', 'head', 'expression', 'hair', 'clothes', 'overalls', 'shoes'],
  itemPools: {
    clothes: ['Shortsleeve'],
    overalls: ['Overalls'],
    shoes: ['Basic Boots'],
  },
};

export const RANDOM_PROFILES: readonly RandomProfile[] = [
  NORMAL_RANDOM_PROFILE,
  FARMER_RANDOM_PROFILE,
];

const RANDOM_PROFILE_BY_ID: ReadonlyMap<string, RandomProfile> = new Map(
  RANDOM_PROFILES.map((profile) => [profile.id, profile]),
);

const APPEARANCE_GROUPS: ReadonlySet<GroupId> = new Set(['body', 'face', 'fantasy']);
const CLOTHING_GROUPS: ReadonlySet<GroupId> = new Set(['clothing', 'accessories']);
const EQUIPMENT_GROUPS: ReadonlySet<GroupId> = new Set(['weapons']);

export function randomProfileForStyle(styleId: string | null | undefined): RandomProfile {
  if (!styleId) return NORMAL_RANDOM_PROFILE;
  return RANDOM_PROFILE_BY_ID.get(styleId) ?? NORMAL_RANDOM_PROFILE;
}

export function profileTypeNames(profile: RandomProfile): readonly TypeName[] {
  if (profile.typeNames) return profile.typeNames;

  const included = new Set<GroupId>([
    ...profile.requiredGroups,
    ...profile.optionalGroups,
  ]);
  const excluded = new Set<GroupId>(profile.excludeGroups);
  return CATEGORY_GROUPS
    .filter((group) => included.has(group.id) && !excluded.has(group.id))
    .flatMap((group) => group.typeNames);
}

export function isTypeEnabledByRandomScope(
  typeName: TypeName,
  scope: RandomScope,
): boolean {
  const group = groupForType(typeName);
  if (!group) return false;
  if (APPEARANCE_GROUPS.has(group)) return scope.appearance;
  if (CLOTHING_GROUPS.has(group)) return scope.clothing;
  if (EQUIPMENT_GROUPS.has(group)) return scope.equipment;
  return false;
}

function isTypeInDisabledRandomScope(
  typeName: TypeName,
  scope: RandomScope,
): boolean {
  const group = groupForType(typeName);
  if (!group) return false;
  if (APPEARANCE_GROUPS.has(group)) return !scope.appearance;
  if (CLOTHING_GROUPS.has(group)) return !scope.clothing;
  if (EQUIPMENT_GROUPS.has(group)) return !scope.equipment;
  return false;
}

export function preserveDisabledScopeSelections(
  currentSelections: Readonly<Record<TypeName, Selection>>,
  scope: RandomScope,
): Record<TypeName, Selection> {
  const preserved: Record<TypeName, Selection> = {};
  for (const [typeName, selection] of Object.entries(currentSelections)) {
    if (isTypeInDisabledRandomScope(typeName, scope)) {
      preserved[typeName] = selection;
    }
  }
  return preserved;
}
