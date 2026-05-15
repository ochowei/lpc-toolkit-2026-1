import type {
  AliasEntry,
  Catalog,
  FilePath,
  ItemDefinition,
  ItemId,
  TypeName,
} from './types.js';

export interface CatalogLoadWarning {
  readonly path: FilePath;
  readonly message: string;
}

export interface CreateCatalogResult {
  readonly catalog: Catalog;
  readonly warnings: readonly CatalogLoadWarning[];
}

function basename(p: string): string {
  let i = p.length;
  while (i > 0) {
    const ch = p.charCodeAt(i - 1);
    if (ch === 47 || ch === 92) break; // '/' or '\\'
    i--;
  }
  return p.slice(i);
}

function deriveItemId(filePath: FilePath): ItemId {
  return basename(filePath).replace(/\.json$/i, '');
}

function isMetaFile(filePath: FilePath): boolean {
  return basename(filePath).startsWith('meta_');
}

/**
 * Port of upstream `getAliasVariants` from `scripts/generateSources/aliases.js`.
 * Reads only `meta.variants` — the recolor-variant fallback requires palette-
 * driven normalisation that core doesn't ingest in Step 2 (see API.md Q2).
 * Aliases that target recolor-only items will not resolve here and the alias
 * entry is silently dropped (matches upstream's `null` return).
 */
function getAliasVariants(meta: ItemDefinition): readonly string[] | null {
  if (meta.variants && meta.variants.length > 0) return meta.variants;
  return null;
}

interface ResolvedAliasTarget {
  readonly targetName: string;
  readonly targetVariant: string;
  readonly typeName: TypeName;
}

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
    if (isMetaFile(filePath)) continue;
    if (def.ignore === true) continue;

    if (!def.name || !def.type_name) {
      warnings.push({
        path: filePath,
        message: `missing required field${!def.name ? ' "name"' : ''}${!def.type_name ? ' "type_name"' : ''}`,
      });
      continue;
    }

    const itemId = deriveItemId(filePath);
    if (!itemId) {
      warnings.push({
        path: filePath,
        message: `could not derive itemId from file path`,
      });
      continue;
    }

    if (byItemId.has(itemId)) {
      warnings.push({
        path: filePath,
        message: `duplicate itemId "${itemId}" (first seen at "${itemIdSource.get(itemId) ?? '?'}"); last-write-wins`,
      });
      // Last-write-wins: replace the byTypeName entry too.
      const prev = byItemId.get(itemId)!;
      const prevList = byTypeName.get(prev.type_name);
      if (prevList) {
        const idx = prevList.indexOf(prev);
        if (idx >= 0) prevList.splice(idx, 1);
        if (prevList.length === 0) byTypeName.delete(prev.type_name);
      }
    }

    byItemId.set(itemId, def);
    itemIdSource.set(itemId, filePath);

    const typeList = byTypeName.get(def.type_name);
    if (typeList) {
      typeList.push(def);
    } else {
      byTypeName.set(def.type_name, [def]);
    }

    processItemAliases(def, aliasMap, warnings, filePath);
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
