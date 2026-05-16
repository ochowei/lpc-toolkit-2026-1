import { getRecolorVariants } from './recolor-resolve.js';
import type {
  AliasEntry,
  BodyType,
  Catalog,
  ItemDefinition,
  PaletteMetadata,
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
 * `state/resolve-hash-param.ts`. Match precedence within a name match
 * mirrors upstream exactly: explicit `variants` first, then (when
 * `palettes` is supplied) the first recolor entry's palette-expanded
 * variants — which **override** a variant match, faithfully replicating
 * upstream's later-assignment-wins (so an explicit `name_v|recolor` or a
 * bare recolor token resolves to a recolor, not a variant) — then the
 * empty-name fallback.
 *
 * `palettes` closes the Step 2.1 Q2 deferral: without it, recolor-only
 * items still fall through to `unknown_item` (backward-compatible). The
 * no-`palettes` path is byte-identical to the previous behaviour.
 */
function resolveHashParam(
  typeName: TypeName,
  nameAndVariant: string,
  catalog: Catalog,
  palettes: PaletteMetadata | undefined,
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

      let foundItem: ItemDefinition | null = null;
      let matchedVariant = '';
      let matchedRecolor = '';

      if (item.variants && item.variants.length > 0) {
        for (const variant of item.variants) {
          if (variant.toLowerCase() === variantToMatch) {
            foundItem = item;
            matchedVariant = variant;
            matchedRecolor = '';
            break;
          }
        }
      }

      if (palettes) {
        const recolorVariants = getRecolorVariants(item, palettes);
        for (const variant of recolorVariants) {
          const vl = variant.toLowerCase();
          if (
            (recolorToMatch !== '' && vl === recolorToMatch) ||
            (recolorToMatch === '' && vl === variantToMatch)
          ) {
            // Later assignment wins (upstream): recolor overrides variant.
            foundItem = item;
            matchedVariant = '';
            matchedRecolor = variant;
            break;
          }
        }
      }

      if (!foundItem && variantToMatch === '' && recolorToMatch === '') {
        foundItem = item;
        matchedVariant = '';
        matchedRecolor = '';
      }

      if (foundItem) {
        return { foundItem, matchedVariant, matchedRecolor };
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

export function parseHash(
  hash: string,
  catalog: Catalog,
  palettes?: PaletteMetadata,
): ParseHashResult {
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
      palettes,
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

  // Q2 (Step 4.3): the recolor-variant match is now folded into
  // `resolveHashParam` (gated on `palettes`), using `getRecolorVariants`
  // (= upstream `recolors[0].variants`, palette-expanded). The upstream
  // multi-recolor `recolors[i].type_name` sub-binding has no loop in this
  // upstream snapshot and no real data uses it; `recolors[0]` faithfully
  // covers the single-entry case. Without `palettes`, recolor-only items
  // still surface as `unknown_item` (backward-compatible).

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
