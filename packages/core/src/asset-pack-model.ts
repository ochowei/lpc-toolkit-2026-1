import { BODY_TYPES } from './constants.js';
import type { CreditEntry, ItemId, RawRecolors } from './types.js';
import { ASSET_PACK_SCHEMA, type AssetPackAcknowledgement, type AssetPackAssetSource, type AssetPackDiagnostic, type AssetPackReplacementSource, type AssetPackSource, type ExtendItemAnimationSource, type ExtendItemDestinationSource, type ExtendItemLayerSource, type ExtendItemAssetSource, type NewItemAssetSource, type NewItemLayerSource, type NewItemSpriteSource } from './asset-pack-schema.js';

export type AssetPackCreditRecord = Omit<CreditEntry, 'file'>;

export interface NormalizedAssetPackReplacement {
  readonly packId: string;
  readonly versions: string;
  readonly assets: readonly string[];
}

export interface NormalizedNewItemSprite {
  readonly animation: string;
  readonly source: string;
  readonly bodyTypes: readonly string[];
  readonly variant?: string;
}

export interface NormalizedNewItemLayer {
  readonly id: string;
  readonly zPos: number;
  readonly sourceIndex: number;
  readonly bodyTypes: readonly string[];
  readonly sprites: readonly NormalizedNewItemSprite[];
}

export interface NormalizedNewItemAsset {
  readonly kind: 'new-item';
  readonly localId: string;
  readonly itemId: ItemId;
  readonly displayName: string;
  readonly typeName: string;
  readonly bodyTypes: readonly string[];
  readonly animations: readonly string[];
  readonly layers: readonly NormalizedNewItemLayer[];
  readonly variants?: readonly string[];
  readonly recolor?: RawRecolors;
}

export interface NormalizedExtendItemDestination {
  readonly path: string;
  readonly evidence: ExtendItemDestinationSource['evidence'];
  readonly accepted: boolean;
}

export interface NormalizedExtendItemLayer {
  readonly layer: ExtendItemLayerSource['layer'];
  readonly bodyTypes: readonly string[];
  readonly source: string;
  readonly destination: NormalizedExtendItemDestination;
  readonly variant?: string;
  readonly consumers?: ExtendItemLayerSource['consumers'];
}

export interface NormalizedExtendItemAnimation {
  readonly animation: string;
  readonly layers: readonly NormalizedExtendItemLayer[];
}

export interface NormalizedExtendItemAsset {
  readonly kind: 'extend-item';
  readonly itemId: ItemId;
  readonly baseDefinitionDigest: string;
  readonly baseCreditDigest: string;
  readonly addAnimations: readonly NormalizedExtendItemAnimation[];
}

export type NormalizedAssetPackAsset =
  | NormalizedNewItemAsset
  | NormalizedExtendItemAsset;

export interface NormalizedAssetPack {
  readonly schema: typeof ASSET_PACK_SCHEMA;
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  readonly credits: AssetPackCreditRecord;
  readonly creditOverrides: ReadonlyMap<string, AssetPackCreditRecord>;
  readonly replacements: readonly NormalizedAssetPackReplacement[];
  readonly acknowledgements: readonly AssetPackAcknowledgement[];
  readonly assets: readonly NormalizedAssetPackAsset[];
}

export function assetPackItemId(packId: string, localId: string): ItemId {
  return `${packId}--${localId}`;
}

export function normalizeAssetPack(source: AssetPackSource): NormalizedAssetPack {
  const assets = source.assets
    .map((asset) => normalizeAsset(source.id, asset))
    .sort(compareAssets);

  const overrides = Object.entries(source.creditOverrides ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, credit]) => [path, normalizeCredit(credit)] as const);

  return {
    schema: ASSET_PACK_SCHEMA,
    id: source.id,
    version: source.version,
    displayName: source.displayName,
    credits: normalizeCredit(source.credits),
    creditOverrides: new Map(overrides),
    replacements: normalizeReplacements(source.replaces ?? []),
    acknowledgements: [...(source.acknowledgements ?? [])],
    assets,
  };
}

export function assetPackContentProjection(pack: NormalizedAssetPack): unknown {
  return sortProjection({
    schema: pack.schema,
    id: pack.id,
    version: pack.version,
    displayName: pack.displayName,
    credits: projectCredit(pack.credits),
    creditOverrides: Object.fromEntries(pack.creditOverrides),
    replacements: pack.replacements.map((replacement) => ({
      packId: replacement.packId,
      versions: replacement.versions,
      assets: [...replacement.assets],
    })),
    assets: pack.assets.map(projectAsset),
  });
}

export function warningAcknowledged(
  diagnostic: AssetPackDiagnostic,
  contentDigest: string,
  acknowledgements: readonly AssetPackAcknowledgement[],
): boolean {
  const subject = diagnostic.subject;
  if (diagnostic.severity !== 'warning' || !subject) return false;
  return acknowledgements.some((acknowledgement) =>
    acknowledgement.code === diagnostic.code
    && acknowledgement.contentDigest === contentDigest
    && acknowledgement.reason.trim().length > 0
    && subjectsEqual(acknowledgement.subject, subject),
  );
}

function normalizeAsset(
  packId: string,
  asset: AssetPackAssetSource,
): NormalizedAssetPackAsset {
  if (asset.kind === 'new-item') {
    return normalizeNewItem(packId, asset);
  }
  return normalizeExtendItem(asset);
}

function normalizeNewItem(
  packId: string,
  asset: NewItemAssetSource,
): NormalizedNewItemAsset {
  const assetBodyTypes = normalizeBodyTypes(asset.bodyTypes);
  const layers = asset.layers
    .map((layer, index) => normalizeNewItemLayer(layer, index, assetBodyTypes))
    .sort((left, right) => left.zPos - right.zPos || left.sourceIndex - right.sourceIndex);

  return {
    kind: 'new-item',
    localId: asset.localId,
    itemId: assetPackItemId(packId, asset.localId),
    displayName: asset.displayName,
    typeName: asset.typeName,
    bodyTypes: assetBodyTypes,
    animations: [...asset.animations],
    layers,
    ...(asset.variants ? { variants: [...asset.variants] } : {}),
    ...(asset.recolor ? { recolor: asset.recolor } : {}),
  };
}

function normalizeNewItemLayer(
  layer: NewItemLayerSource,
  sourceIndex: number,
  parentBodyTypes: readonly string[],
): NormalizedNewItemLayer {
  const layerBodyTypes = normalizeBodyTypes(layer.bodyTypes ?? parentBodyTypes);
  return {
    id: layer.id,
    zPos: layer.zPos,
    sourceIndex,
    bodyTypes: layerBodyTypes,
    sprites: layer.sprites.map((sprite) => normalizeNewItemSprite(sprite, layerBodyTypes)),
  };
}

function normalizeNewItemSprite(
  sprite: NewItemSpriteSource,
  parentBodyTypes: readonly string[],
): NormalizedNewItemSprite {
  const bodyTypes = normalizeBodyTypes(sprite.bodyTypes ?? parentBodyTypes);
  return {
    animation: sprite.animation,
    source: sprite.source,
    bodyTypes,
    ...(sprite.variant ? { variant: sprite.variant } : {}),
  };
}

function normalizeExtendItem(asset: ExtendItemAssetSource): NormalizedExtendItemAsset {
  return {
    kind: 'extend-item',
    itemId: asset.itemId,
    baseDefinitionDigest: asset.baseDefinitionDigest,
    baseCreditDigest: asset.baseCreditDigest,
    addAnimations: asset.addAnimations.map(normalizeExtendAnimation),
  };
}

function normalizeExtendAnimation(
  animation: ExtendItemAnimationSource,
): NormalizedExtendItemAnimation {
  return {
    animation: animation.animation,
    layers: animation.layers.map(normalizeExtendLayer),
  };
}

function normalizeExtendLayer(
  layer: ExtendItemLayerSource,
): NormalizedExtendItemLayer {
  return {
    layer: layer.layer,
    bodyTypes: normalizeBodyTypes(layer.bodyTypes),
    source: layer.source,
    destination: normalizeDestination(layer.destination),
    ...(layer.variant ? { variant: layer.variant } : {}),
    ...(layer.consumers ? { consumers: [...layer.consumers] } : {}),
  };
}

function normalizeDestination(
  destination: ExtendItemDestinationSource,
): NormalizedExtendItemDestination {
  return {
    path: destination.path,
    evidence: destination.evidence,
    accepted: destination.accepted,
  };
}

function normalizeReplacements(
  replacements: readonly AssetPackReplacementSource[],
): readonly NormalizedAssetPackReplacement[] {
  return [...replacements]
    .map((replacement) => ({
      packId: replacement.packId,
      versions: replacement.versions,
      assets: [...replacement.assets].sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) =>
      left.packId.localeCompare(right.packId)
      || left.versions.localeCompare(right.versions)
      || left.assets.join('\0').localeCompare(right.assets.join('\0')),
    );
}

function normalizeCredit(credit: AssetPackCreditRecord): AssetPackCreditRecord {
  return {
    authors: [...credit.authors],
    licenses: [...credit.licenses],
    urls: [...credit.urls],
    notes: credit.notes,
  };
}

function normalizeBodyTypes(bodyTypes: readonly string[]): readonly string[] {
  const requested = new Set(bodyTypes);
  return BODY_TYPES.filter((bodyType) => requested.has(bodyType));
}

function compareAssets(
  left: NormalizedAssetPackAsset,
  right: NormalizedAssetPackAsset,
): number {
  return assetIdentity(left).localeCompare(assetIdentity(right));
}

function assetIdentity(asset: NormalizedAssetPackAsset): string {
  return asset.kind === 'new-item' ? asset.itemId : asset.itemId;
}

function projectAsset(asset: NormalizedAssetPackAsset): unknown {
  if (asset.kind === 'new-item') {
    return {
      animations: [...asset.animations],
      bodyTypes: [...asset.bodyTypes],
      displayName: asset.displayName,
      itemId: asset.itemId,
      kind: asset.kind,
      layers: asset.layers.map((layer) => ({
        bodyTypes: [...layer.bodyTypes],
        id: layer.id,
        sourceIndex: layer.sourceIndex,
        sprites: layer.sprites.map((sprite) => ({
          animation: sprite.animation,
          bodyTypes: [...sprite.bodyTypes],
          ...(sprite.variant ? { variant: sprite.variant } : {}),
          source: sprite.source,
        })),
        zPos: layer.zPos,
      })),
      localId: asset.localId,
      ...(asset.recolor ? { recolor: asset.recolor } : {}),
      typeName: asset.typeName,
      ...(asset.variants ? { variants: [...asset.variants] } : {}),
    };
  }

  return {
    addAnimations: asset.addAnimations.map((animation) => ({
      animation: animation.animation,
      layers: animation.layers.map((layer) => ({
        bodyTypes: [...layer.bodyTypes],
        ...(layer.consumers ? { consumers: [...layer.consumers] } : {}),
        destination: { ...layer.destination },
        layer: layer.layer,
        source: layer.source,
        ...(layer.variant ? { variant: layer.variant } : {}),
      })),
    })),
    baseCreditDigest: asset.baseCreditDigest,
    baseDefinitionDigest: asset.baseDefinitionDigest,
    itemId: asset.itemId,
    kind: asset.kind,
  };
}

function projectCredit(credit: AssetPackCreditRecord) {
  return {
    authors: [...credit.authors],
    licenses: [...credit.licenses],
    notes: credit.notes,
    urls: [...credit.urls],
  };
}

function sortProjection(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortProjection(entry));
  }
  if (!isRecord(value)) {
    return value;
  }

  const sortedEntries = Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, sortProjection(entry)] as const);

  return Object.fromEntries(sortedEntries);
}

function subjectsEqual(
  left: Readonly<Record<string, string | readonly string[]>>,
  right: Readonly<Record<string, string | readonly string[]>>,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key, index) => {
    if (key !== rightKeys[index]) return false;
    const leftValue = left[key];
    const rightValue = right[key];
    if (typeof leftValue === 'string' || typeof rightValue === 'string') {
      return leftValue === rightValue;
    }
    if (!leftValue || !rightValue || leftValue.length !== rightValue.length) {
      return false;
    }
    return leftValue.every((entry, valueIndex) => entry === rightValue[valueIndex]);
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
