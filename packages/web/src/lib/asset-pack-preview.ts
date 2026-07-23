import {
  ANIMATIONS,
  ANIMATION_OFFSETS,
  BODY_TYPES,
  DIRECTIONS,
  animationsSupportFolder,
  computeEffectiveLicense,
  createCatalog,
  getCredits,
  importSelectionDocument,
  itemAnimationCapabilities,
  selectionJsonFromCore,
  type AssetPackCompilePlan,
  type Catalog,
  type CreditsManifest,
  type Direction,
  type ItemId,
  type License,
  type PaletteMetadata,
  type Selections,
} from '@lpc-toolkit/core';
import type { AssetPackPreviewPayload } from './asset-pack-worker-protocol';
import { pickInitialSelections } from '../slice/selection';

export interface AssetPackPreviewModel {
  readonly catalog: Catalog;
  readonly selections: Selections;
  readonly credits: CreditsManifest;
  readonly effectiveLicense: License;
}

export interface BuildAssetPackPreviewOptions {
  readonly baselineCatalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly payload: AssetPackPreviewPayload;
  readonly focusedAssetId?: ItemId;
  readonly bodyType?: string;
  readonly importedSelections?: Selections;
}

/** Merge the official definitions with the current compile-plan definitions. */
export function createAssetPackPreviewCatalog(
  baselineCatalog: Catalog,
  compilePlan: AssetPackCompilePlan,
): Catalog {
  const records: Record<string, (typeof baselineCatalog.byItemId extends ReadonlyMap<string, infer T> ? T : never)> = {};
  for (const [itemId, item] of baselineCatalog.byItemId) {
    records[`sheet_definitions/${item.type_name}/${itemId}.json`] = item;
  }
  for (const compiled of compilePlan.definitions) {
    records[compiled.logicalPath] = compiled.definition;
  }
  return createCatalog(records).catalog;
}

/**
 * Authorize only paths that can be produced by the official baseline catalog.
 * Pack destinations are removed explicitly even if a baseline path ever uses
 * the same logical location.
 */
export function createOfficialAssetPackPreviewPathAuthorizer(
  baselineCatalog: Catalog,
  compilePlan: AssetPackCompilePlan,
): (path: string) => boolean {
  const officialPaths = new Set<string>();
  for (const item of baselineCatalog.byItemId.values()) {
    const animations = itemAnimationCapabilities(item).native;
    const variants = ['', ...(item.variants ?? [])];
    for (let layerNumber = 1; layerNumber < 10; layerNumber += 1) {
      const layer = item[`layer_${layerNumber}`];
      if (!layer) break;
      for (const [bodyType, rawPath] of Object.entries(layer)) {
        if (bodyType === 'zPos' || bodyType === 'custom_animation' || typeof rawPath !== 'string') continue;
        if (rawPath.includes('${')) continue;
        if (layer.custom_animation) {
          for (const variant of variants) {
            if (!variant) continue;
            officialPaths.add(`spritesheets/${rawPath}${variant.replaceAll(' ', '_')}.png`);
          }
          continue;
        }
        for (const folder of Object.keys(ANIMATION_OFFSETS)) {
          if (!animationsSupportFolder(animations, folder)) continue;
          for (const variant of variants) {
            const suffix = variant
              ? `${folder}/${variant.replaceAll(' ', '_')}.png`
              : `${folder}.png`;
            officialPaths.add(`spritesheets/${rawPath}${suffix}`);
          }
        }
      }
    }
  }
  const compiledDestinations = new Set(
    compilePlan.sprites.map((sprite) => sprite.destinationPath),
  );
  return (path: string) => officialPaths.has(path) && !compiledDestinations.has(path);
}

/** Baseline-derived official path check for callers that need one decision. */
export function isOfficialAssetPackPreviewPath(
  path: string,
  baselineCatalog: Catalog,
  compilePlan: AssetPackCompilePlan,
): boolean {
  return createOfficialAssetPackPreviewPathAuthorizer(baselineCatalog, compilePlan)(path);
}

export function previewBodyTypeOptions(catalog: Catalog): readonly string[] {
  return BODY_TYPES.filter((bodyType) => [...catalog.byItemId.values()].some((item) =>
    Object.entries(item)
      .filter(([key]) => key.startsWith('layer_'))
      .some(([, value]) => typeof value === 'object' && value !== null && typeof value[bodyType] === 'string'),
  ));
}

export function previewAnimationOptions(catalog: Catalog): readonly string[] {
  const supported = new Set(
    [...catalog.byItemId.values()].flatMap((item) => item.animations),
  );
  return ANIMATIONS.filter((entry) => supported.has(entry.value)).map((entry) => entry.value);
}

export function previewDirectionOptions(): readonly Direction[] {
  return DIRECTIONS;
}

export function buildAssetPackPreview(
  options: BuildAssetPackPreviewOptions,
): AssetPackPreviewModel {
  const catalog = createAssetPackPreviewCatalog(
    options.baselineCatalog,
    options.payload.compilePlan,
  );
  const initial = pickInitialSelections(catalog).state;
  let selections = options.importedSelections ?? {
    bodyType: options.bodyType ?? initial.bodyType,
    items: initial.selections,
  };

  // Re-run the canonical importer against the compiled catalog even when the
  // caller already parsed the document. This keeps imported state on the same
  // validation contract as an uploaded canonical character file.
  if (options.importedSelections) {
    const imported = importSelectionDocument(
      selectionJsonFromCore(options.importedSelections),
      { catalog, palettes: options.palettes },
    ).parsed.selections;
    selections = options.bodyType
      ? { ...imported, bodyType: options.bodyType }
      : imported;
  }

  const focused = options.focusedAssetId
    ? options.payload.compilePlan.definitions.find((definition) => definition.assetId === options.focusedAssetId)
    : undefined;
  if (options.focusedAssetId && !focused) {
    throw new Error(`Focused asset ${options.focusedAssetId} is not in the current compile plan.`);
  }
  if (focused) {
    const item = catalog.byItemId.get(focused.assetId);
    if (!item) throw new Error(`Focused asset ${focused.assetId} is missing from the preview catalog.`);
    selections = {
      bodyType: selections.bodyType,
      items: {
        ...selections.items,
        [item.type_name]: {
          typeName: item.type_name,
          name: item.name,
          ...(item.variants?.[0] ? { variant: item.variants[0] } : {}),
        },
      },
    };
    if (item.credits.length === 0) {
      throw new Error(`Focused asset ${focused.assetId} has no matching credit data.`);
    }
  }

  const credits = getCredits(selections, catalog);
  if (credits.entries.length === 0 || credits.licenses.length === 0) {
    throw new Error('Preview cannot be composed without matching credit data.');
  }
  if (focused) {
    const focusedFiles = new Set(catalog.byItemId.get(focused.assetId)?.credits.map((entry) => entry.file));
    if (![...credits.entries].some((entry) => focusedFiles.has(entry.file))) {
      throw new Error(`Focused asset ${focused.assetId} has no matching credit data.`);
    }
  }

  return {
    catalog,
    selections,
    credits,
    effectiveLicense: computeEffectiveLicense(credits),
  };
}
