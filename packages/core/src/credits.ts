import {
  LICENSE_GROUP_OF,
  LICENSE_GROUP_ORDER,
  LICENSE_VERSION_RANK,
  type LicenseGroup,
} from './constants.js';
import { getSpritePathsForSelections } from './compose.js';
import type {
  Catalog,
  CreditEntry,
  CreditsManifest,
  ItemDefinition,
  ItemId,
  LayerSpec,
  License,
  Selections,
} from './types.js';

export interface GetCreditsOptions {
  readonly layers?: readonly LayerSpec[];
}

const SPRITESHEETS_PREFIX = 'spritesheets/';

/**
 * Strip the `spritesheets/` prefix from a `LayerSpec.path` to get the
 * upstream-style "used path" (e.g., `body/bodies/male/walk.png`). Credits in
 * catalog metadata are keyed by file prefix relative to the `spritesheets/` root.
 */
function stripSpritesheetsPrefix(path: string): string {
  return path.startsWith(SPRITESHEETS_PREFIX)
    ? path.slice(SPRITESHEETS_PREFIX.length)
    : path;
}

/**
 * Upstream prefix-match rule (`utils/credits.ts:72`):
 * Compares a credit's `file` path pattern with the loaded layer's `usedPath`.
 * The credit entry matches if it equals the `usedPath` exactly, or if it is
 * a parent directory prefix of `usedPath` (e.g., credit for `hair/makeup` matches `hair/makeup/red.png`).
 * Returns the matched used path (first hit wins, same as upstream), or null if none match.
 */
function matchCreditUsedPath(
  creditFile: string,
  usedPaths: readonly string[],
 ): string | null {
  for (const usedPath of usedPaths) {
    if (
      usedPath === creditFile ||
      usedPath.startsWith(creditFile + '/')
    ) {
      return usedPath;
    }
  }
  return null;
}

/**
 * Reverse-lookup an item by `(typeName, raw name)` — same scan strategy
 * as `compose.ts:findItem` (kept private to each module to avoid coupling
 * the credit pass to compose's internals).
 */
function findItem(
  catalog: Catalog,
  typeName: string,
  rawName: string,
): { itemId: ItemId; item: ItemDefinition } | undefined {
  for (const [itemId, item] of catalog.byItemId) {
    if (item.type_name === typeName && item.name === rawName) {
      return { itemId, item };
    }
  }
  return undefined;
}

/**
 * Extracts, resolves, and deduplicates the credit attributions for a given character selection set.
 *
 * Attribution Matching & Deduplication Algorithm:
 * 1. Resolves all active sprite sheet layers for the selections via `getSpritePathsForSelections()`.
 * 2. Group the active sprite paths by their corresponding `ItemId`. This ensures that a body credit
 *    doesn't match a hair path simply because they happen to share a folder prefix (folder boundaries are strictly enforced).
 * 3. Walk through each selected item type in the selections (respecting selection order).
 * 4. Iterate over the item's `credits` metadata list.
 * 5. Prefix-match the credit's `file` path against the item's active layer paths via `matchCreditUsedPath`.
 * 6. Deduplication Rules:
 *    - Dedupes credit entries by `credit.file` using `seenFiles = new Set<string>()`. The first encounter wins, which preserves selection-order and catalog declaration-order priority.
 *    - Dedupes licenses using `seenLicenses = new Set<License>()` to aggregate a unique list of licenses required by the composed sheet.
 *
 * @param selections The active Selections object.
 * @param catalog The LPC items Catalog containing metadata.
 * @returns A CreditsManifest object containing unique credit entries, resolved file paths, and active licenses.
 */
export function getCredits(
  selections: Selections,
  catalog: Catalog,
  options: GetCreditsOptions = {},
): CreditsManifest {
  const layers = options.layers ?? getSpritePathsForSelections(selections, catalog);
  const usedPathsByItemId = new Map<ItemId, string[]>();
  for (const layer of layers) {
    const used = stripSpritesheetsPrefix(layer.path);
    const list = usedPathsByItemId.get(layer.itemId);
    if (list) list.push(used);
    else usedPathsByItemId.set(layer.itemId, [used]);
  }

  const entries: CreditEntry[] = [];
  const resolvedPaths: string[] = [];
  const licenses: License[] = [];
  const seenFiles = new Set<string>();
  const seenLicenses = new Set<License>();

  for (const [typeName, sel] of Object.entries(selections.items)) {
    const found = findItem(catalog, typeName, sel.name);
    if (!found) continue;

    const usedPaths = usedPathsByItemId.get(found.itemId);
    if (!usedPaths || usedPaths.length === 0) continue;

    for (const credit of found.item.credits) {
      if (seenFiles.has(credit.file)) continue;
      const matched = matchCreditUsedPath(credit.file, usedPaths);
      if (matched === null) continue;

      seenFiles.add(credit.file);
      entries.push(credit);
      resolvedPaths.push(matched);
      for (const license of credit.licenses) {
        if (seenLicenses.has(license)) continue;
        seenLicenses.add(license);
        licenses.push(license);
      }
    }
  }

  return { entries, resolvedPaths, licenses };
}

/**
 * Picks the most "restrictive" license required by a composed sprite attribution set.
 *
 * Restrictiveness License Sorting Rules:
 * 1. Finds the highest-ranked license group present in the CreditsManifest via `LICENSE_GROUP_OF` and `LICENSE_GROUP_ORDER`.
 *    Groups are ranked in ascending restrictiveness order:
 *    `CC0` (Public Domain) < `CC-BY` (Attribution) < `OGA-BY` (OGA Custom Attribution) < `CC-BY-SA` (Share-alike copyleft) < `GPL` (Strict copyleft).
 *    A composed sprite sheet inherits the license of its most restrictive component (GPL-3.0 inherits all, making it the effective license of the compilation).
 * 2. Within that highest group, picks the highest version rank per `LICENSE_VERSION_RANK`
 *    (e.g., `GPL-3.0` is ranked higher/newer than `GPL-2.0`).
 * 
 * @param credits The CreditsManifest containing all unique licenses.
 * @returns The single License representing the effective license of the entire composition.
 * @throws Error if the manifest contains no licenses.
 */
export function computeEffectiveLicense(credits: CreditsManifest): License {
  if (credits.licenses.length === 0) {
    throw new Error(
      'computeEffectiveLicense: cannot compute a license from an empty CreditsManifest',
    );
  }

  // Find the highest-ranked group present.
  let bestGroup: LicenseGroup | null = null;
  let bestGroupRank = -1;
  for (const license of credits.licenses) {
    const group = LICENSE_GROUP_OF[license];
    const rank = LICENSE_GROUP_ORDER.indexOf(group);
    if (rank > bestGroupRank) {
      bestGroupRank = rank;
      bestGroup = group;
    }
  }

  // Within that group, pick the highest version. `bestGroup` is non-null
  // here because `licenses` is non-empty, but TS can't see that.
  let best: License | null = null;
  let bestVersionRank = -1;
  for (const license of credits.licenses) {
    if (LICENSE_GROUP_OF[license] !== bestGroup) continue;
    const versionRank = LICENSE_VERSION_RANK[license];
    if (versionRank > bestVersionRank) {
      bestVersionRank = versionRank;
      best = license;
    }
  }

  if (!best) {
    // Unreachable: if licenses is non-empty and group lookup succeeded,
    // at least one license will match `bestGroup`. Throw rather than
    // returning a fallback so the bug surfaces loudly.
    throw new Error(
      'computeEffectiveLicense: internal invariant violated (best group has no members)',
    );
  }
  return best;
}
