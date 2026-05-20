import {
  LICENSE_GROUP_OF,
  LICENSE_GROUP_ORDER,
  LICENSE_VERSION_RANK,
  type ItemDefinition,
  type License,
} from '@lpc-toolkit/core';

export type LicenseFilter = License | null;

export function itemMatchesLicenseFilter(
  item: ItemDefinition,
  filter: LicenseFilter,
): boolean {
  if (!filter) return true;
  return item.credits.some((credit) => credit.licenses.includes(filter));
}

export function licenseExceedsFilter(
  effective: License,
  filter: LicenseFilter,
): boolean {
  if (!filter) return false;

  const effectiveGroup = LICENSE_GROUP_OF[effective];
  const filterGroup = LICENSE_GROUP_OF[filter];
  const effectiveGroupRank = LICENSE_GROUP_ORDER.indexOf(effectiveGroup);
  const filterGroupRank = LICENSE_GROUP_ORDER.indexOf(filterGroup);

  if (effectiveGroupRank !== filterGroupRank) {
    return effectiveGroupRank > filterGroupRank;
  }

  return LICENSE_VERSION_RANK[effective] > LICENSE_VERSION_RANK[filter];
}
