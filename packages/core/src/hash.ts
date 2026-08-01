import {
  getColorChannels,
  getRecolorVariantsForType,
  itemSupportsSelectionType,
} from './recolor-resolve.js';
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

/**
 * Types of warnings raised during hash parsing when an asset identifier,
 * slot category, or color variant cannot be correctly located.
 */
export interface HashWarning {
  /** The slot category key string parsed from the URL parameter. */
  readonly key: string;
  /** The value string parsed from the URL parameter. */
  readonly value: string;
  /** The specific reason for the warning. */
  readonly reason:
    | 'unknown_type_name'
    | 'unknown_item'
    | 'unknown_variant'
    | 'unknown_recolor'
    | 'unknown_channel'
    | 'unknown_channel_recolor'
    | 'linked_channel_value'
    | 'malformed';
}

/**
 * The consolidated result of parsing a serialized state hash.
 */
export interface ParseHashResult {
  /** The successfully resolved, fully populated selections. */
  readonly selections: Selections;
  /** Detailed warnings raised for unresolvable items, categories, or colors. */
  readonly warnings: readonly HashWarning[];
  /** Categorized slot names that were present in the hash but not found in the catalog. */
  readonly unknownKeys: readonly TypeName[];
}

/** A canonical color choice that cannot be represented exactly upstream. */
export interface UpstreamProjectionLoss {
  readonly reason: 'channel_collision';
  /** Legacy global channel key shared by the colliding assets. */
  readonly channelId: TypeName;
  /** Selected asset whose value remains visible in the projected link. */
  readonly keptSlot: TypeName;
  /** Selected assets whose independent values cannot be forwarded. */
  readonly omittedSlots: readonly TypeName[];
}

/** Legacy-compatible hash plus any known fidelity loss. */
export interface UpstreamHashResult {
  readonly hash: string;
  readonly losses: readonly UpstreamProjectionLoss[];
}

/** The default body archetype applied when sex or bodyType parameters are absent. */
const DEFAULT_BODY_TYPE: BodyType = 'male';

/** The version header prefix prepended to packed base64url selection tokens. */
const SELECTION_TOKEN_V1_PREFIX = 'v1.';
const SELECTION_TOKEN_V2_PREFIX = 'v2.';

/**
 * Custom URL-safe Base64 alphabet used for token packing/unpacking.
 * Swaps standard '+' and '/' for '-' and '_' respectively, eliminating padding characters '='.
 */
const BASE64URL_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Strips the leading prefix characters '#' or '?' from a URL hash or search string.
 * 
 * @param hash - The raw URL hash or search string.
 * @returns The cleaned, parameter-only string.
 */
function stripHashPrefix(hash: string): string {
  let s = hash;
  if (s.startsWith('#')) s = s.slice(1);
  if (s.startsWith('?')) s = s.slice(1);
  return s;
}

/**
 * Safely parses a query or hash string into a list of key-value tuples.
 * 
 * @param s - The raw query string.
 * @returns An array of key-value tuples.
 */
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

function itemsForSelectionType(
  typeName: TypeName,
  catalog: Catalog,
  includeRecolorSubTypes: boolean,
): readonly ItemDefinition[] {
  const items = [...(catalog.byTypeName.get(typeName) ?? [])];
  if (!includeRecolorSubTypes) return items;
  for (const item of catalog.byItemId.values()) {
    if (
      item.type_name !== typeName &&
      itemSupportsSelectionType(item, typeName)
    ) {
      items.push(item);
    }
  }
  return items;
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
 * 
 * Parameter Parsing & Priority Matching Algorithm:
 * 1. Progressively splits `nameAndVariant` on underscores `_` to separate the core item name
 *    from its variant/recolor tokens (since item names can contain underscores, we search
 *    left-to-right from token 1 to the end).
 * 2. Checks if the candidate item name exists in the catalog under the current `typeName`.
 * 3. Priority Match 1: If the item defines a list of physical variants, checks if the trailing
 *    token (split on `|` to separate potential recolors) matches any of these variants.
 * 4. Priority Match 2: If the item supports recolors, checks if the trailing token (or the recolor part
 *    after a `|` separator) matches the palette-expanded list of variant swatches.
 *    - Note: Because "later assignment wins", a recolor match takes precedence and overrides a variant match
 *      for overlapping names.
 * 5. Priority Match 3: If no variant or recolor matches, falls back to a bare name match with empty values.
 * 
 * @param typeName - The category type name.
 * @param nameAndVariant - The parameter value (e.g. 'hair_messy1_long' or 'chest_shirt|red').
 * @param catalog - The compiled asset Catalog.
 * @param palettes - Optional compiled PaletteMetadata database.
 * @returns A structure containing the found item, matched variant, and matched recolor.
 */
function resolveHashParam(
  typeName: TypeName,
  nameAndVariant: string,
  catalog: Catalog,
  palettes: PaletteMetadata | undefined,
): ResolveResult {
  const items = itemsForSelectionType(
    typeName,
    catalog,
    palettes !== undefined,
  );
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

      // Match Priority 1: Physical item variants list
      if (
        item.type_name === typeName &&
        item.variants &&
        item.variants.length > 0
      ) {
        for (const variant of item.variants) {
          if (variant.toLowerCase() === variantToMatch) {
            foundItem = item;
            matchedVariant = variant;
            matchedRecolor = '';
            break;
          }
        }
      }

      // Match Priority 2: Recolor palette expanded variants (overrides variant on overlap)
      if (palettes) {
        const recolorVariants = getRecolorVariantsForType(
          item,
          palettes,
          typeName,
        );
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

      // Match Priority 3: Bare item name fallback
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

/**
 * Constructs a Selection record from resolved parse parameters.
 * 
 * @param typeName - The category type name.
 * @param item - The selected ItemDefinition.
 * @param matchedVariant - The matching variant string.
 * @param matchedRecolor - The matching recolor string.
 * @returns A structured selection configuration.
 */
function buildSelection(
  typeName: TypeName,
  item: ItemDefinition,
  matchedVariant: string,
  matchedRecolor: string,
  palettes?: PaletteMetadata,
  applyDefaults = true,
): Selection {
  const variant =
    matchedVariant ||
    (
      item.type_name === typeName && matchedRecolor === ''
        ? (item.variants?.[0] ?? '')
        : ''
    );
  
  let recolor = matchedRecolor;
  if (
    applyDefaults
    && !recolor
    && (!item.variants || item.variants.length === 0)
    && palettes
  ) {
    const recolorVariants = getRecolorVariantsForType(
      item,
      palettes,
      typeName,
    );
    if (recolorVariants.length > 0) {
      recolor = recolorVariants[0] ?? '';
    }
  }

  return {
    typeName,
    name: item.name,
    ...(variant ? { variant } : {}),
    ...(recolor ? { recolor } : {}),
  };
}

/**
 * Searches the catalog aliases map to locate redirection definitions for a given key and value.
 * 
 * @param aliases - Nested catalog alias maps.
 * @param typeName - Incoming slot category name.
 * @param nameAndVariant - Incoming value string.
 * @returns The matching AliasEntry if found, otherwise `undefined`.
 */
function lookupAlias(
  aliases: Catalog['aliases'],
  typeName: TypeName,
  nameAndVariant: string,
): AliasEntry | undefined {
  const byKey = aliases.get(typeName);
  if (!byKey) return undefined;
  return byKey.get(nameAndVariant) ?? byKey.get('*');
}

/**
 * Parses a serialized URL hash state into structured, validated character `Selections`.
 * 
 * Parsing Workflow:
 * 1. Clean hash prefixes ('#' or '?') and tokenize query parameters.
 * 2. Parse global parameters like `bodyType` or `sex` (mapped to `selections.bodyType`).
 * 3. Skip slots explicitly marked as `none`.
 * 4. Perform alias resolution using the catalog aliases map:
 *    - Redirect obsolete or short categories (e.g. `torso` alias to `chest`).
 *    - Expand shortened item/variant tokens.
 * 5. Locate and validate the target ItemDefinition via `resolveHashParam` which processes
 *    the names, variants, and palette-expanded recolor swatches.
 * 6. Record robust warnings for invalid categories, missing items, or unmatched variants.
 * 
 * @param hash - The raw URL hash or query string.
 * @param catalog - The compiled asset Catalog.
 * @param palettes - Optional compiled PaletteMetadata catalog (enables full recolor parsing).
 * @returns A ParseHashResult containing resolved selections, warnings, and unrecognized keys.
 */
export function parseHash(
  hash: string,
  catalog: Catalog,
  palettes?: PaletteMetadata,
): ParseHashResult {
  const raw = stripHashPrefix(hash);
  const params = parseQueryString(raw);
  const version2 = params.some(([key, value]) => key === 'v' && value === '2');

  const warnings: HashWarning[] = [];
  const unknownKeys: TypeName[] = [];
  const itemEntries: Array<readonly [TypeName, Selection]> = [];
  let bodyType: BodyType = DEFAULT_BODY_TYPE;

  for (let [key, value] of params) {
    if (key === 'v' || key.startsWith('color.')) continue;
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

    if (
      itemsForSelectionType(
        typeName,
        catalog,
        palettes !== undefined && !version2,
      )
        .length === 0
    ) {
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
    itemEntries.push([
      typeName,
      buildSelection(
        typeName,
        foundItem,
        matchedVariant,
        matchedRecolor,
        palettes,
        !version2,
      ),
    ]);
  }

  const items: Record<TypeName, Selection> = Object.fromEntries(itemEntries);
  if (version2) {
    for (const [key, value] of params) {
      if (!key.startsWith('color.')) continue;
      const parts = key.split('.');
      const slot = parts[1] ?? '';
      const channelId = parts[2] ?? '';
      if (parts.length !== 3 || !slot || !channelId || !palettes) {
        warnings.push({ key, value, reason: 'malformed' });
        continue;
      }
      const owner = items[slot];
      const item = owner
        ? (catalog.byTypeName.get(slot) ?? [])
          .find((candidate) => candidate.name === owner.name)
        : undefined;
      const channel = item
        ? getColorChannels(item, palettes)
          .find((candidate) => candidate.id === channelId && !candidate.primary)
        : undefined;
      if (!owner || !item || !channel) {
        warnings.push({ key, value, reason: 'unknown_channel' });
        continue;
      }
      if (channel.linkedTo) {
        warnings.push({ key, value, reason: 'linked_channel_value' });
        continue;
      }
      if (!channel.swatches.some((swatch) => swatch.recolor === value)) {
        warnings.push({ key, value, reason: 'unknown_channel_recolor' });
        continue;
      }
      items[slot] = {
        ...owner,
        channelRecolors: {
          ...owner.channelRecolors,
          [channelId]: value,
        },
      };
    }
  }

  // Q2 (Step 4.3): the recolor-variant match is now folded into
  // `resolveHashParam` (gated on `palettes`), using `getRecolorVariants`
  // (= upstream `recolors[0].variants`, palette-expanded). The upstream
  // Multi-recolor `recolors[i].type_name` sub-bindings resolve through the
  // same type-aware recolor helpers used by canonical import validation.
  // Without `palettes`, recolor-only items still surface as `unknown_item`
  // (backward-compatible).

  return {
    selections: { bodyType, items },
    warnings,
    unknownKeys,
  };
}

/**
 * Serializes a set of character Selections into a standard URL query string.
 * Formats spaces as underscores and uses custom delimiter structures to organize
 * variants and recolors within a parameter value:
 * - Format: `typeName=itemName_variantName|recolorName`
 * 
 * @param selections - The character selections configuration to serialize.
 * @returns The serialized URL parameter string.
 */
export function serializeHash(selections: Selections): string {
  const parts: string[] = ['v=2'];
  parts.push(`sex=${encodeURIComponent(selections.bodyType)}`);
  for (const [typeName, sel] of Object.entries(selections.items)
    .sort(([left], [right]) => left.localeCompare(right))) {
    const namePart = sel.name.replaceAll(' ', '_');
    const variantPart = sel.variant ?? '';
    const recolorPart = sel.recolor ?? '';
    const uscore = variantPart || recolorPart ? '_' : '';
    const split = variantPart && recolorPart ? '|' : '';
    const value = namePart + uscore + variantPart + split + recolorPart;
    parts.push(`${encodeURIComponent(typeName)}=${encodeURIComponent(value)}`);
  }
  for (const [typeName, sel] of Object.entries(selections.items)
    .sort(([left], [right]) => left.localeCompare(right))) {
    for (const [channelId, recolor] of Object.entries(
      sel.channelRecolors ?? {},
    ).sort(([left], [right]) => left.localeCompare(right))) {
      parts.push(
        `color.${encodeURIComponent(typeName)}.${encodeURIComponent(channelId)}=${encodeURIComponent(recolor)}`,
      );
    }
  }
  return parts.join('&');
}

/** Serialize the legacy upstream-compatible global selection shape. */
export function serializeLegacyHash(selections: Selections): string {
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

interface UpstreamChannelCandidate {
  readonly channelId: TypeName;
  readonly slot: TypeName;
  readonly value: string;
  readonly zPos: number;
}

interface UpstreamPrimaryParam {
  readonly slot: TypeName;
  readonly value: string;
}

function serializeSelectionValue(selection: Selection): string {
  const namePart = selection.name.replaceAll(' ', '_');
  const variantPart = selection.variant ?? '';
  const recolorPart = selection.recolor ?? '';
  const uscore = variantPart || recolorPart ? '_' : '';
  const split = variantPart && recolorPart ? '|' : '';
  return namePart + uscore + variantPart + split + recolorPart;
}

function highestLayerZPos(item: ItemDefinition): number {
  let highest = Number.NEGATIVE_INFINITY;
  for (const [key, value] of Object.entries(item)) {
    if (!/^layer_\d+$/.test(key) || typeof value !== 'object' || !value) {
      continue;
    }
    if ('zPos' in value && typeof value.zPos === 'number') {
      highest = Math.max(highest, value.zPos);
    }
  }
  return highest;
}

/**
 * Project canonical asset-owned colors into upstream's legacy global slots.
 * Independent values that collide on one global slot are inherently lossy;
 * the selected asset with the highest rendered layer wins, with slot name as
 * a deterministic tie-breaker.
 */
export function serializeUpstreamHash(
  selections: Selections,
  catalog: Catalog,
  palettes: PaletteMetadata,
): UpstreamHashResult {
  const primaryParams: UpstreamPrimaryParam[] = [];
  const candidates = new Map<TypeName, UpstreamChannelCandidate[]>();

  // Preserve encounter order: both composers stable-sort equal-z layers, so
  // reordering primary params can change which same-z pixels remain visible.
  for (const [slot, selection] of Object.entries(selections.items)) {
    const item = (catalog.byTypeName.get(slot) ?? [])
      .find((candidate) => candidate.name === selection.name);
    primaryParams.push({
      slot,
      value: serializeSelectionValue(selection),
    });
    if (!item) continue;
    const channels = getColorChannels(item, palettes);
    for (const [channelId, recolor] of Object.entries(
      selection.channelRecolors ?? {},
    ).sort(([left], [right]) => left.localeCompare(right))) {
      const channel = channels.find(
        (candidate) => candidate.id === channelId && !candidate.primary,
      );
      if (
        !channel
        || channel.linkedTo
        || !channel.swatches.some((swatch) => swatch.recolor === recolor)
      ) {
        continue;
      }
      const values = candidates.get(channel.typeName) ?? [];
      values.push({
        channelId: channel.typeName,
        slot,
        value: `${item.name.replaceAll(' ', '_')}_${recolor}`,
        zPos: highestLayerZPos(item),
      });
      candidates.set(channel.typeName, values);
    }
  }

  const losses: UpstreamProjectionLoss[] = [];
  const channelParams: Array<readonly [TypeName, string]> = [];
  for (const [channelId, values] of candidates) {
    values.sort((left, right) =>
      right.zPos - left.zPos || left.slot.localeCompare(right.slot),
    );
    const winner = values[0];
    if (!winner) continue;
    channelParams.push([channelId, winner.value]);
    if (values.length > 1) {
      losses.push({
        reason: 'channel_collision',
        channelId,
        keptSlot: winner.slot,
        omittedSlots: values.slice(1).map(({ slot }) => slot),
      });
    }
  }

  losses.sort((left, right) => left.channelId.localeCompare(right.channelId));
  channelParams.sort(([left], [right]) => left.localeCompare(right));
  const hash = [
    ['sex', selections.bodyType] as const,
    ...primaryParams.map(({ slot, value }) => [slot, value] as const),
    ...channelParams,
  ]
    .map(([key, value]) =>
      `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join('&');
  return { hash, losses };
}

/**
 * Packs an ASCII string into a URL-safe Base64 token.
 * 
 * Bit-Packing Mechanism:
 * 1. Process the source string in 3-character (3-byte) chunks.
 * 2. Ensure each byte value belongs to the standard 7-bit ASCII range (<= 0x7F).
 *    Throws an error if any byte contains non-ASCII characters.
 * 3. Pack 3 bytes (24 bits total) into a single 24-bit integer accumulator:
 *    `n = (b1 << 16) | (b2 << 8) | b3`
 * 4. Extract four 6-bit index values from the accumulator:
 *    - 1st 6-bit index: `(n >> 18) & 63`
 *    - 2nd 6-bit index: `(n >> 12) & 63`
 *    - 3rd 6-bit index (optional): `(n >> 6) & 63`
 *    - 4th 6-bit index (optional): `n & 63`
 * 5. Map these indices to characters inside the custom `BASE64URL_ALPHABET` string.
 * 6. Omits standard Base64 padding characters ('=').
 * 
 * @param s - The raw ASCII query string to encode.
 * @returns The packed URL-safe Base64 string.
 */
function encodeBase64UrlAscii(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i += 3) {
    const b1 = s.charCodeAt(i);
    const b2 = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
    const b3 = i + 2 < s.length ? s.charCodeAt(i + 2) : 0;
    if (b1 > 0x7f || b2 > 0x7f || b3 > 0x7f) {
      throw new Error('Selection token payload must be ASCII');
    }

    const n = (b1 << 16) | (b2 << 8) | b3;
    out += BASE64URL_ALPHABET[(n >> 18) & 63];
    out += BASE64URL_ALPHABET[(n >> 12) & 63];
    if (i + 1 < s.length) out += BASE64URL_ALPHABET[(n >> 6) & 63];
    if (i + 2 < s.length) out += BASE64URL_ALPHABET[n & 63];
  }
  return out;
}

/**
 * Unpacks a URL-safe Base64 token back to its raw ASCII string.
 * 
 * Bit-Unpacking Mechanism:
 * 1. Validate the length of the Base64 input string (must not be empty, and modulo 4 must not equal 1).
 * 2. Maintain a bit accumulator (`buffer`) and track the number of accumulated bits (`bits`).
 * 3. Iterate through each character of the Base64 string:
 *    - Translate the character to its 6-bit value by locating its index within `BASE64URL_ALPHABET`.
 *      Throws an error if the character is not present in the alphabet.
 *    - Shift the 6-bit value into the accumulator: `buffer = (buffer << 6) | value`.
 *    - Add 6 to the bit count.
 *    - If 8 or more bits are accumulated, extract the top byte: `(buffer >> (bits - 8)) & 0xFF`,
 *      decrement the bit count by 8, and push the byte value onto the array.
 * 4. Verify that all decoded bytes represent valid 7-bit ASCII characters (<= 0x7F).
 * 5. Reconstruct the raw ASCII string using `String.fromCharCode(...bytes)`.
 * 
 * @param s - The packed Base64URL string.
 * @returns The original ASCII query string.
 */
function decodeBase64UrlAscii(s: string): string {
  if (s.length === 0 || s.length % 4 === 1) {
    throw new Error('Malformed selection token');
  }

  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of s) {
    const value = BASE64URL_ALPHABET.indexOf(ch);
    if (value < 0) throw new Error('Malformed selection token');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  for (const byte of bytes) {
    if (byte > 0x7f) throw new Error('Malformed selection token');
  }
  return String.fromCharCode(...bytes);
}

/**
 * Compiles a Selections configuration into a compact, shareable, URL-safe Base64 selection token.
 * Prepends the version prefix `v2.` to distinguish asset-owned channel state.
 * 
 * @param selections - The character selections configuration.
 * @returns The formatted packed selection token.
 */
export function encodeSelectionToken(selections: Selections): string {
  return `${SELECTION_TOKEN_V2_PREFIX}${encodeBase64UrlAscii(
    serializeHash(selections),
  )}`;
}

/**
 * Decodes a shareable selection token back into fully resolved character selections.
 * 
 * Decoding Workflow:
 * 1. Trim whitespace and verify a supported `v1.` or `v2.` version prefix.
 * 2. Extract and decode the packed Base64 URL-safe ASCII segment.
 * 3. Validate that the decoded ASCII query string contains key-value parameters ('=').
 * 4. Delegate to `parseHash` to locate items and assign selections.
 * 
 * @param token - The raw packed selection token string.
 * @param catalog - The compiled asset Catalog.
 * @param palettes - Optional compiled PaletteMetadata catalog.
 * @returns The resolved ParseHashResult structure.
 */
export function decodeSelectionToken(
  token: string,
  catalog: Catalog,
  palettes?: PaletteMetadata,
): ParseHashResult {
  const trimmed = token.trim();
  const prefix = trimmed.startsWith(SELECTION_TOKEN_V2_PREFIX)
    ? SELECTION_TOKEN_V2_PREFIX
    : trimmed.startsWith(SELECTION_TOKEN_V1_PREFIX)
      ? SELECTION_TOKEN_V1_PREFIX
      : undefined;
  if (!prefix) {
    throw new Error('Unsupported selection token version');
  }
  const hash = decodeBase64UrlAscii(trimmed.slice(prefix.length));
  if (!hash.includes('=')) throw new Error('Malformed selection token');
  return parseHash(hash, catalog, palettes);
}
