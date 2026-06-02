import {
  computeEffectiveLicense,
  type Catalog,
  type License,
} from '@lpc-toolkit/core';
import {
  itemMatchesLicenseFilter,
  type LicenseFilter,
} from '../../../slice/license-filter';
import {
  itemMatchesAnimationFilter,
  type AnimationFilter,
} from '../../../slice/animation-filter';
import type { SliceState } from '../../../slice/selection';

/** Compact attribution badge state shown in the top bar. */
export interface AttributionSummary {
  sourceCount: number;
  incompatibleAny: boolean;
}

/** Count distinct effective source buckets and detect filter incompatibilities. */
export function summarizeAttribution(
  catalog: Catalog,
  state: SliceState,
  licenseFilter: LicenseFilter,
  animationFilter: AnimationFilter,
): AttributionSummary {
  const buckets = new Set<string>();
  let incompatibleAny = false;

  for (const [tn, sel] of Object.entries(state.selections)) {
    const item = (catalog.byTypeName.get(tn) ?? []).find((d) => d.name === sel.name);
    if (!item) continue;

    const seenLicenses = new Set<License>();
    const allLicenses: License[] = [];
    const seenAuthors = new Set<string>();
    const allAuthors: string[] = [];
    for (const credit of item.credits) {
      for (const license of credit.licenses) {
        if (!seenLicenses.has(license)) {
          seenLicenses.add(license);
          allLicenses.push(license);
        }
      }
      for (const author of credit.authors) {
        if (!seenAuthors.has(author)) {
          seenAuthors.add(author);
          allAuthors.push(author);
        }
      }
    }
    if (allLicenses.length === 0) continue;

    const effective = computeEffectiveLicense({
      entries: item.credits,
      licenses: allLicenses,
      resolvedPaths: [],
    });
    buckets.add(`${allAuthors.join(',')}|${effective}`);

    if (!itemMatchesLicenseFilter(item, licenseFilter)) incompatibleAny = true;
    if (!itemMatchesAnimationFilter(item, animationFilter)) incompatibleAny = true;
  }

  return { sourceCount: buckets.size, incompatibleAny };
}
