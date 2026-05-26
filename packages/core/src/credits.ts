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
  License,
  Selections,
} from './types.js';

const SPRITESHEETS_PREFIX = 'spritesheets/';

/**
 * Strip the `spritesheets/` prefix from a `LayerSpec.path` to get the
 * upstream-style "used path" (`body/bodies/male/walk.png`). Credits are
 * keyed by folder prefix without the `spritesheets/` root.
 */
function stripSpritesheetsPrefix(path: string): string {
  return path.startsWith(SPRITESHEETS_PREFIX)
    ? path.slice(SPRITESHEETS_PREFIX.length)
    : path;
}

/**
 * Upstream prefix-match rule (`utils/credits.ts:72`): the credit row's
 * `file` field is a folder prefix, the layer's `usedPath` is the full PNG
 * path. Returns the matched used path (first hit wins, same as upstream),
 * or null if no used path matches.
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
 * Walk the selections and produce a deduped list of credit entries plus
 * the union of their licenses.
 *
 * Algorithm (mirrors upstream `getAllCredits` in `utils/credits.ts`):
 *   1. Resolve the full set of used PNG paths via
 *      `getSpritePathsForSelections`, stripped of the `spritesheets/`
 *      prefix to match the credit-file convention.
 *   2. For each selected item (in selection iteration order), iterate
 *      its `credits[]`. Keep entries whose `file` is a prefix of any
 *      used path.
 *   3. Dedupe by `credit.file` across all items — first occurrence wins,
 *      preserving (selection-order, item-credit-order).
 *   4. Aggregate `licenses` across kept entries; dedupe preserving first
 *      appearance.
 */
export function getCredits(
  selections: Selections,
  catalog: Catalog,
): CreditsManifest {
  // Group used paths by itemId so each item only matches against its own
  // sprite paths — a body credit shouldn't be accidentally promoted by a
  // hair layer that happens to share a folder prefix.
  const layers = getSpritePathsForSelections(selections, catalog);
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
 * Pick the most "restrictive" license required by an attribution set:
 * the highest group per `LICENSE_GROUP_ORDER` (CC0 < CC-BY < OGA-BY <
 * CC-BY-SA < GPL), then the highest version per `LICENSE_VERSION_RANK`
 * inside that group.
 *
 * Throws on empty input — there's no sensible "License of nothing".
 * Callers should check `manifest.licenses.length` first if the empty
 * case is reachable.
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
