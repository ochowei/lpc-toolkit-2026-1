import type { Catalog, TypeName } from '@lpc-toolkit/core';

export type UpstreamCategoryGroupId =
  | 'body'
  | 'head'
  | 'hair'
  | 'headwear'
  | 'arms'
  | 'torso'
  | 'legs'
  | 'feet'
  | 'tools'
  | 'weapons';

export interface UpstreamCategoryGroup {
  readonly id: UpstreamCategoryGroupId;
  readonly label: string;
}

export interface UpstreamCategorySection extends UpstreamCategoryGroup {
  readonly typeNames: readonly TypeName[];
}

export const UPSTREAM_CATEGORY_GROUPS: readonly UpstreamCategoryGroup[] = [
  { id: 'body', label: 'Body' },
  { id: 'head', label: 'Head' },
  { id: 'hair', label: 'Hair' },
  { id: 'headwear', label: 'Headwear' },
  { id: 'arms', label: 'Arms' },
  { id: 'torso', label: 'Torso' },
  { id: 'legs', label: 'Legs' },
  { id: 'feet', label: 'Feet' },
  { id: 'tools', label: 'Tools' },
  { id: 'weapons', label: 'Weapons' },
];

const UPSTREAM_GROUP_IDS = new Set<UpstreamCategoryGroupId>(
  UPSTREAM_CATEGORY_GROUPS.map((g) => g.id),
);

function sourceGroupForType(
  catalog: Catalog,
  typeName: TypeName,
): UpstreamCategoryGroupId | null {
  for (const item of catalog.byTypeName.get(typeName) ?? []) {
    const first = item.sourcePath?.split('/').find(Boolean);
    if (first && UPSTREAM_GROUP_IDS.has(first as UpstreamCategoryGroupId)) {
      return first as UpstreamCategoryGroupId;
    }
  }
  return null;
}

export function buildShownTypeNamesFromUpstreamGroups(
  catalog: Catalog,
): TypeName[] {
  const byGroup = new Map<UpstreamCategoryGroupId, TypeName[]>(
    UPSTREAM_CATEGORY_GROUPS.map((g) => [g.id, []]),
  );

  for (const typeName of catalog.typeNames) {
    const groupId = sourceGroupForType(catalog, typeName);
    if (!groupId) continue;
    byGroup.get(groupId)?.push(typeName);
  }

  return UPSTREAM_CATEGORY_GROUPS.flatMap((g) => byGroup.get(g.id) ?? []);
}

export function buildUpstreamCategoryGroups(
  catalog: Catalog,
  shownTypeNames: readonly TypeName[],
): UpstreamCategorySection[] {
  const byGroup = new Map<UpstreamCategoryGroupId, TypeName[]>(
    UPSTREAM_CATEGORY_GROUPS.map((g) => [g.id, []]),
  );

  for (const typeName of shownTypeNames) {
    const groupId = sourceGroupForType(catalog, typeName);
    if (!groupId) continue;
    byGroup.get(groupId)?.push(typeName);
  }

  return UPSTREAM_CATEGORY_GROUPS.map((g) => ({
    ...g,
    typeNames: byGroup.get(g.id) ?? [],
  }));
}
