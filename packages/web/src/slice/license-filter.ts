import {
  LICENSE_GROUP_OF,
  LICENSE_GROUP_ORDER,
  type Catalog,
  type ItemDefinition,
  type LicenseGroup,
  type TypeName,
} from '@lpc-toolkit/core';
import type { SliceState } from './selection';

/** Set of license groups allowed by the Settings filter. */
export type LicenseFilter = ReadonlySet<LicenseGroup>;

/** Default filter state: every known license group is allowed. */
export const ALL_LICENSE_GROUPS: LicenseFilter = new Set(LICENSE_GROUP_ORDER);

/** Whether an item has at least one allowed license group. */
export function itemMatchesLicenseFilter(
  item: ItemDefinition,
  enabledGroups: LicenseFilter,
): boolean {
  if (item.credits.length === 0) return true;
  if (enabledGroups.size === 0) return false;
  return item.credits.some((credit) =>
    credit.licenses.some((license) =>
      enabledGroups.has(LICENSE_GROUP_OF[license]),
    ),
  );
}

/** Selected type names that would become invalid under the proposed license filter. */
export function incompatibleTypeNamesFor(
  state: SliceState,
  catalog: Catalog,
  enabledGroups: LicenseFilter,
): TypeName[] {
  const out: TypeName[] = [];
  for (const [tn, sel] of Object.entries(state.selections)) {
    const item = (catalog.byTypeName.get(tn) ?? []).find(
      (d) => d.name === sel.name,
    );
    if (item && !itemMatchesLicenseFilter(item, enabledGroups)) {
      out.push(tn);
    }
  }
  return out;
}
