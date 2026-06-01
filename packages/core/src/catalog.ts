import type {
  AliasEntry,
  Catalog,
  FilePath,
  ItemDefinition,
  ItemId,
  TypeName,
} from './types.js';

/**
 * Represents a warning encountered during the validation and loading of LPC catalog items.
 */
export interface CatalogLoadWarning {
  /** The source file path where the issue was identified. */
  readonly path: FilePath;
  /** A descriptive message explaining the validation failure or mismatch. */
  readonly message: string;
}

/**
 * The outcome of the catalog creation process, packaging the generated Catalog
 * along with any validation warnings collected.
 */
export interface CreateCatalogResult {
  /** The successfully constructed and indexed LPC asset catalog. */
  readonly catalog: Catalog;
  /** List of warning messages generated during validation, duplicate resolution, and alias matching. */
  readonly warnings: readonly CatalogLoadWarning[];
}

/**
 * Extracts the file name portion of a given path string.
 * Supports both POSIX ('/') and Windows ('\\') path separators.
 * 
 * @param p - The raw file path string.
 * @returns The base name of the file (including file extension).
 */
function basename(p: string): string {
  let i = p.length;
  while (i > 0) {
    const ch = p.charCodeAt(i - 1);
    if (ch === 47 || ch === 92) break; // '/' or '\\'
    i--;
  }
  return p.slice(i);
}

/**
 * Derives a unique ItemId from an item file path by extracting its base name
 * and stripping the `.json` extension (case-insensitive).
 * 
 * @param filePath - The file path of the item definition.
 * @returns The derived ItemId (e.g. 'hair_messy1').
 */
function deriveItemId(filePath: FilePath): ItemId {
  return basename(filePath).replace(/\.json$/i, '');
}

/**
 * Determines whether a file path refers to a catalog meta definition file.
 * Meta files are designated with a `meta_` prefix (e.g., `meta_hair.json`).
 * 
 * @param filePath - The file path to evaluate.
 * @returns `true` if the file is a metadata descriptor file, `false` otherwise.
 */
function isMetaFile(filePath: FilePath): boolean {
  return basename(filePath).startsWith('meta_');
}

/**
 * Port of upstream `getAliasVariants` from `scripts/generateSources/aliases.js`.
 * Reads only `meta.variants` — the recolor-variant fallback requires palette-
 * driven normalisation that core doesn't ingest in Step 2 (see API.md Q2).
 * Aliases that target recolor-only items will not resolve here and the alias
 * entry is silently dropped (matches upstream's `null` return).
 * 
 * @param meta - The item definition containing variants list.
 * @returns The read-only array of variant names, or null if no variants exist.
 */
function getAliasVariants(meta: ItemDefinition): readonly string[] | null {
  if (meta.variants && meta.variants.length > 0) return meta.variants;
  return null;
}

/**
 * Output of a resolved alias mapping containing target details.
 */
interface ResolvedAliasTarget {
  /** The target item name (spaces replaced by underscores). */
  readonly targetName: string;
  /** The matching variant identifier on the target item. */
  readonly targetVariant: string;
  /** The target item category type name. */
  readonly typeName: TypeName;
}

/**
 * Resolves a segmented alias target matching process.
 * Progressively splits the alias variant string on underscores `_` from the left,
 * searching for a match where the remaining suffix corresponds to a valid target variant.
 * 
 * @param variants - The allowed target variants.
 * @param aliasVariant - The incoming variant identifier to resolve.
 * @returns An object containing the targetName (rebuilt prefix) and targetVariant.
 */
function resolveSegmentedTarget(
  variants: readonly string[],
  aliasVariant: string,
): { targetName: string; targetVariant: string } {
  const parts = aliasVariant.split('_');
  let targetName = '';
  let targetVariant = '';
  while (parts.length > 1) {
    const head = parts.shift()!;
    targetName += (targetName !== '' ? '_' : '') + head;
    targetVariant = parts.join('_');
    if (variants.indexOf(targetVariant) !== -1) break;
  }
  return { targetName, targetVariant };
}

/**
 * Resolves a specific alias descriptor to its physical item target.
 * Resolves three distinct cases:
 * 1. Wildcard mapping (`*` to custom or inherited type).
 * 2. Exact variant match inside target item variants list.
 * 3. Segmented token search (matching prefix + variant suffix).
 * 
 * @param meta - The target item definition.
 * @param aliasVariant - The incoming variant identifier.
 * @param aliasType - Optional typeName override specified in the alias string.
 * @returns The resolved alias target details, or null if unable to resolve.
 */
function resolveAliasTarget(
  meta: ItemDefinition,
  aliasVariant: string,
  aliasType: string | undefined,
): ResolvedAliasTarget | null {
  // Wildcard target: "originType=*" → "targetType=*"
  if (aliasVariant === '*' && aliasType) {
    return {
      targetName: aliasVariant,
      targetVariant: aliasVariant,
      typeName: aliasType,
    };
  }

  const variants = getAliasVariants(meta);
  if (!variants) return null;

  // Exact variant match.
  if (variants.indexOf(aliasVariant) !== -1) {
    return {
      targetName: meta.name.replaceAll(' ', '_'),
      targetVariant: aliasVariant,
      typeName: aliasType ?? meta.type_name,
    };
  }

  // Segmented match: tokenise on "_" until the suffix matches a variant.
  const segmented = resolveSegmentedTarget(variants, aliasVariant);
  if (!segmented.targetName || !segmented.targetVariant) return null;
  return {
    targetName: segmented.targetName,
    targetVariant: segmented.targetVariant,
    typeName: aliasType ?? meta.type_name,
  };
}

/**
 * Port of upstream `writeAliases`. Mutates the passed alias map.
 * Each entry in `meta.aliases` has the form `"[originType=]originVariant":
 * "[aliasType=]aliasVariant"`. Skipping (unresolvable target) matches
 * upstream's `debugWarn` + continue behaviour.
 * 
 * Parses composite keys and values to extract source/target variants and potential
 * type overrides, then updates the bidirectional catalog alias maps.
 * 
 * @param meta - The item definition being processed.
 * @param aliasMap - The nested map accumulating resolved aliases by TypeName.
 * @param warnings - Warning queue for recording unresolvable targets.
 * @param filePath - Current file path being processed (used for warning attribution).
 */
function processItemAliases(
  meta: ItemDefinition,
  aliasMap: Map<TypeName, Map<string, AliasEntry>>,
  warnings: CatalogLoadWarning[],
  filePath: FilePath,
): void {
  const aliases = meta.aliases;
  if (!aliases) return;

  for (const [original, alias] of Object.entries(aliases)) {
    const aliasReversed = alias.split('=').reverse();
    const aliasVariant = aliasReversed[0]!;
    const aliasType = aliasReversed[1];

    const target = resolveAliasTarget(meta, aliasVariant, aliasType);
    if (!target) {
      warnings.push({
        path: filePath,
        message: `alias target "${alias}" does not match any variant on item "${meta.name}"`,
      });
      continue;
    }

    const originReversed = original.split('=').reverse();
    const originVariant = originReversed[0]!;
    const originType = originReversed[1];
    const typeName = originType ?? meta.type_name;

    let inner = aliasMap.get(typeName);
    if (!inner) {
      inner = new Map<string, AliasEntry>();
      aliasMap.set(typeName, inner);
    }
    inner.set(originVariant, {
      typeName: target.typeName,
      name: target.targetName,
      variant: target.targetVariant,
    });
  }
}

/**
 * Consolidates a batch of raw file paths and item definitions into an indexed,
 * validated, and read-only LPC asset Catalog.
 * 
 * Validation and Processing Workflow:
 * 1. Skip system/metadata definitions (e.g., files beginning with `meta_`).
 * 2. Honor explicit item exclusion via the `ignore` flag.
 * 3. Validate existence of mandatory fields (`name`, `type_name`). If missing, log a warning and skip the record.
 * 4. Derive the unique ItemId from the file path. Fail and log a warning if unable to determine a base name.
 * 5. Handle duplicate ItemId collisions:
 *    - Use a **last-write-wins** resolution strategy.
 *    - Remove the previous item from all internal classification structures (e.g. `byTypeName`).
 *    - Record a detailed warning showing both the duplicate source path and the first-seen source path.
 * 6. Populate lookup maps (`byItemId` and group items by `type_name` under `byTypeName`).
 * 7. Process item aliases to build redirect maps.
 * 8. Expose frozen maps matching the narrow `ReadonlyMap` and `Catalog` signatures for compile-time safety.
 * 
 * @param records - Dictionary mapping absolute or relative FilePath strings to raw ItemDefinitions.
 * @returns An object containing the populated Catalog and an array of CatalogLoadWarning objects.
 */
export function createCatalog(
  records: Readonly<Record<FilePath, ItemDefinition>>,
): CreateCatalogResult {
  const warnings: CatalogLoadWarning[] = [];
  const byItemId = new Map<ItemId, ItemDefinition>();
  const byTypeName = new Map<TypeName, ItemDefinition[]>();
  const aliasMap = new Map<TypeName, Map<string, AliasEntry>>();

  // Track the first file path for each itemId so duplicate warnings can
  // point both sources.
  const itemIdSource = new Map<ItemId, FilePath>();

  for (const [filePath, def] of Object.entries(records)) {
    // Validation Step 1: Skip metadata structures (e.g., color palettes description files starting with meta_)
    if (isMetaFile(filePath)) continue;
    // Validation Step 2: Skip explicitly ignored/hidden elements
    if (def.ignore === true) continue;

    // Validation Step 3: Enforce strict presence of core identification variables
    if (!def.name || !def.type_name) {
      warnings.push({
        path: filePath,
        message: `missing required field${!def.name ? ' "name"' : ''}${!def.type_name ? ' "type_name"' : ''}`,
      });
      continue;
    }

    // Validation Step 4: Extract base ItemId
    const itemId = deriveItemId(filePath);
    if (!itemId) {
      warnings.push({
        path: filePath,
        message: `could not derive itemId from file path`,
      });
      continue;
    }

    // Validation Step 5: Resolve duplicate ItemId collisions with last-write-wins
    if (byItemId.has(itemId)) {
      warnings.push({
        path: filePath,
        message: `duplicate itemId "${itemId}" (first seen at "${itemIdSource.get(itemId) ?? '?'}"); last-write-wins`,
      });
      // Last-write-wins: splice out the previous entry from its type list to maintain consistency
      const prev = byItemId.get(itemId)!;
      const prevList = byTypeName.get(prev.type_name);
      if (prevList) {
        const idx = prevList.indexOf(prev);
        if (idx >= 0) prevList.splice(idx, 1);
        if (prevList.length === 0) byTypeName.delete(prev.type_name);
      }
    }

    // Capture file path provenance within the resolved item definition
    const item: ItemDefinition = { ...def, sourcePath: filePath };

    // Register primary mappings
    byItemId.set(itemId, item);
    itemIdSource.set(itemId, filePath);

    // Group items by category (type_name)
    const typeList = byTypeName.get(item.type_name);
    if (typeList) {
      typeList.push(item);
    } else {
      byTypeName.set(item.type_name, [item]);
    }

    // Process aliases belonging to this specific item
    processItemAliases(item, aliasMap, warnings, filePath);
  }

  // Freeze the inner alias maps to match the `ReadonlyMap` shape of the
  // Catalog interface. JS doesn't enforce readonly, but consumers see the
  // narrower type.
  const aliases: ReadonlyMap<TypeName, ReadonlyMap<string, AliasEntry>> =
    aliasMap as ReadonlyMap<TypeName, ReadonlyMap<string, AliasEntry>>;

  const catalog: Catalog = {
    byItemId,
    byTypeName: byTypeName as ReadonlyMap<
      TypeName,
      readonly ItemDefinition[]
    >,
    typeNames: Array.from(byTypeName.keys()),
    aliases,
  };

  return { catalog, warnings };
}
