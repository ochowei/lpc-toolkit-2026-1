import {
  computeEffectiveLicense,
  type Catalog,
  type CreditsManifest,
  type License,
  type TypeName,
} from '@lpc-toolkit/core';
import {
  itemMatchesAnimationFilter,
  type AnimationFilter,
} from '../../../slice/animation-filter';
import {
  itemMatchesLicenseFilter,
  type LicenseFilter,
} from '../../../slice/license-filter';
import type { SliceState } from '../../../slice/selection';

export interface AttributionManifestRow {
  readonly file: string;
  readonly resolvedPath: string | undefined;
  readonly authors: readonly string[];
  readonly licenses: readonly License[];
  readonly effective: License;
}

export interface AttributionManifestRows {
  readonly rows: readonly AttributionManifestRow[];
  readonly empty: boolean;
  readonly incompatibleTypeNames: readonly TypeName[];
}

/** Build exact composed-credit rows while checking filters against selections. */
export function attributionRows(
  credits: CreditsManifest,
  catalog: Catalog,
  state: SliceState,
  licenseFilter: LicenseFilter,
  animationFilter: AnimationFilter,
): AttributionManifestRows {
  const incompatibleTypeNames: TypeName[] = [];

  for (const [typeName, selection] of Object.entries(state.selections)) {
    const item = (catalog.byTypeName.get(typeName) ?? []).find(
      (candidate) => candidate.name === selection.name,
    );
    if (
      item &&
      (!itemMatchesLicenseFilter(item, licenseFilter) ||
        !itemMatchesAnimationFilter(item, animationFilter))
    ) {
      incompatibleTypeNames.push(typeName);
    }
  }

  if (credits.entries.length === 0) {
    return { rows: [], empty: true, incompatibleTypeNames };
  }

  const effective = computeEffectiveLicense(credits);
  return {
    rows: credits.entries.map((entry, index) => ({
      file: entry.file,
      resolvedPath: credits.resolvedPaths[index],
      authors: entry.authors,
      licenses: entry.licenses,
      effective,
    })),
    empty: false,
    incompatibleTypeNames,
  };
}
