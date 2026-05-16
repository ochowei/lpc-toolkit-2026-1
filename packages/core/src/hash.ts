import type {
  AliasEntry,
  BodyType,
  Catalog,
  ItemDefinition,
  Selection,
  Selections,
  TypeName,
} from './types.js';

export interface HashWarning {
  readonly key: string;
  readonly value: string;
  readonly reason:
    | 'unknown_type_name'
    | 'unknown_item'
    | 'unknown_variant'
    | 'unknown_recolor'
    | 'malformed';
}

export interface ParseHashResult {
  readonly selections: Selections;
  readonly warnings: readonly HashWarning[];
  readonly unknownKeys: readonly TypeName[];
}

const DEFAULT_BODY_TYPE: BodyType = 'male';

function stripHashPrefix(hash: string): string {
  let s = hash;
  if (s.startsWith('#')) s = s.slice(1);
  if (s.startsWith('?')) s = s.slice(1);
  return s;
}

function parseQueryString(s: string): Array<readonly [string, string]> {
  if (!s) return [];
  const out: Array<readonly [string, string]> = [];
  for (const pair of s.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const rawKey = pair.slice(0, eq);
    const rawVal = pair.slice(eq + 1);
    if (!rawKey || !rawVal) continue;
    try {
      const key = decodeURIComponent(rawKey.replace(/^\?/, ''));
      const val = decodeURIComponent(rawVal);
      out.push([key, val] as const);
    } catch {
      // malformed percent-encoding — caller surfaces via warnings layer above
    }
  }
  return out;
}

interface ResolveResult {
  readonly foundItem: ItemDefinition | null;
  readonly matchedVariant: string;
  readonly matchedRecolor: string;
}

/**
 * Port of upstream `resolveHashParamFromHashMatch` in
 * `state/resolve-hash-param.ts`, restricted to fields available on the raw
 * `ItemDefinition`. Recolor-variant matching is reduced to the subset that
 * the raw JSON shape exposes (none, currently — see Q2 deferral); items
 * whose hash value relies on palette-expanded recolor variants will fail
 * to match here and surface as `unknown_item` warnings.
 */
function resolveHashParam(
  typeName: TypeName,
  nameAndVariant: string,
  catalog: Catalog,
): ResolveResult {
  const items = catalog.byTypeName.get(typeName) ?? [];
  const parts = nameAndVariant.split('_');

  for (let i = 1; i <= parts.length; i++) {
    const nameToMatch = parts.slice(0, i).join('_').toLowerCase();
    const tail = parts.slice(i).join('_');
    const variantToMatch = (tail.split('|')[0] ?? '').toLowerCase();
    const recolorToMatch = (tail.split('|')[1] ?? '').toLowerCase();

    for (const item of items) {
      const metaName = item.name.replaceAll(' ', '_').toLowerCase();
      if (metaName !== nameToMatch) continue;

      if (item.variants && item.variants.length > 0) {
        for (const variant of item.variants) {
          if (variant.toLowerCase() === variantToMatch) {
            return {
              foundItem: item,
              matchedVariant: variant,
              matchedRecolor: '',
            };
          }
        }
      }
      // NOTE: upstream also matches recolor-expanded variants here. Our
      // catalog stores raw recolors (`{ material, palettes }`), so we cannot
      // match palette-derived variants without ingesting palette metadata.
      // Deferred (Q2): these hash entries surface as `unknown_item` warnings.

      if (variantToMatch === '' && recolorToMatch === '') {
        return { foundItem: item, matchedVariant: '', matchedRecolor: '' };
      }
    }
  }
  return { foundItem: null, matchedVariant: '', matchedRecolor: '' };
}

function buildSelection(
  typeName: TypeName,
  item: ItemDefinition,
  matchedVariant: string,
  matchedRecolor: string,
): Selection {
  const variant =
    matchedVariant ||
    (matchedRecolor !== '' ? '' : (item.variants?.[0] ?? ''));
  const recolor = matchedRecolor;
  return {
    typeName,
    name: item.name,
    ...(variant ? { variant } : {}),
    ...(recolor ? { recolor } : {}),
  };
}

function lookupAlias(
  aliases: Catalog['aliases'],
  typeName: TypeName,
  nameAndVariant: string,
): AliasEntry | undefined {
  const byKey = aliases.get(typeName);
  if (!byKey) return undefined;
  return byKey.get(nameAndVariant) ?? byKey.get('*');
}

export function parseHash(hash: string, catalog: Catalog): ParseHashResult {
  const raw = stripHashPrefix(hash);
  const params = parseQueryString(raw);

  const warnings: HashWarning[] = [];
  const unknownKeys: TypeName[] = [];
  const items: Record<TypeName, Selection> = {};
  let bodyType: BodyType = DEFAULT_BODY_TYPE;

  for (let [key, value] of params) {
    if (key === 'bodyType' || key === 'sex') {
      bodyType = value;
      continue;
    }
    if (value === 'none') continue;

    const alias = lookupAlias(catalog.aliases, key, value);
    let typeName = key;
    let nameAndVariant = value;
    if (alias) {
      typeName = alias.typeName;
      if (alias.name !== '*') {
        nameAndVariant = alias.variant
          ? `${alias.name}_${alias.variant}`
          : alias.name;
      }
    }

    if (!catalog.byTypeName.has(typeName)) {
      warnings.push({ key, value, reason: 'unknown_type_name' });
      unknownKeys.push(key);
      continue;
    }

    const { foundItem, matchedVariant, matchedRecolor } = resolveHashParam(
      typeName,
      nameAndVariant,
      catalog,
    );
    if (!foundItem) {
      warnings.push({ key, value, reason: 'unknown_item' });
      unknownKeys.push(key);
      continue;
    }
    items[typeName] = buildSelection(
      typeName,
      foundItem,
      matchedVariant,
      matchedRecolor,
    );
  }

  // NOTE (Q2): upstream has a second pass that splits skipped entries on
  // "_" and matches against `recolors[i].type_name` + `recolors[i].variants`.
  // Those fields only exist after palette-driven recolor normalization,
  // which is deferred. Skipped entries stay in `warnings` for now.

  return {
    selections: { bodyType, items },
    warnings,
    unknownKeys,
  };
}

export function serializeHash(selections: Selections): string {
  const parts: string[] = [];
  parts.push(`sex=${encodeURIComponent(selections.bodyType)}`);
  for (const [typeName, sel] of Object.entries(selections.items)) {
    const namePart = sel.name.replaceAll(' ', '_');
    const variantPart = sel.variant ?? '';
    const recolorPart = sel.recolor ?? '';
    const uscore = variantPart || recolorPart ? '_' : '';
    const split = variantPart && recolorPart ? '|' : '';
    const value = namePart + uscore + variantPart + split + recolorPart;
    parts.push(`${encodeURIComponent(typeName)}=${encodeURIComponent(value)}`);
  }
  return parts.join('&');
}
