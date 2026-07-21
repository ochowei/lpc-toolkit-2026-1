import { ANIMATIONS, BODY_TYPES } from './constants.js';
import type {
  AssetPackCreditRecord,
  NormalizedAssetPack,
  NormalizedAssetPackAsset,
  NormalizedExtendItemAsset,
  NormalizedNewItemAsset,
  NormalizedNewItemLayer,
  NormalizedNewItemSprite,
} from './asset-pack-model.js';
import type { AssetPackDiagnostic } from './asset-pack-schema.js';
import type { AssetPackBaseline } from './asset-pack-validation.js';
import type {
  AnimationName,
  BodyType,
  CreditEntry,
  ItemDefinition,
  ItemId,
  RawLayer,
  TypeName,
} from './types.js';

export type { AssetPackBaseline } from './asset-pack-validation.js';

export interface CompileAssetPacksOptions {
  readonly baseline: AssetPackBaseline;
  readonly packs: readonly NormalizedAssetPack[];
}

export interface CompiledAssetDefinition {
  readonly packId: string;
  readonly assetId: ItemId;
  readonly logicalPath: string;
  readonly basename: string;
  readonly definition: ItemDefinition;
}

export interface CompiledAssetSpriteConsumer {
  readonly itemId: ItemId;
  readonly typeName: TypeName;
  readonly layer: `layer_${number}`;
  readonly bodyTypes: readonly BodyType[];
  readonly variant?: string;
}

export interface CompiledAssetSprite {
  readonly packId: string;
  readonly assetId: ItemId;
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly animation: AnimationName;
  readonly consumers: readonly CompiledAssetSpriteConsumer[];
}

export interface CompiledAssetOwnership {
  readonly packId: string;
  readonly logicalPaths: readonly string[];
}

export interface AssetPackCompilePlan {
  readonly definitions: readonly CompiledAssetDefinition[];
  readonly sprites: readonly CompiledAssetSprite[];
  readonly credits: readonly CreditEntry[];
  readonly ownership: readonly CompiledAssetOwnership[];
  readonly diagnostics: readonly AssetPackDiagnostic[];
}

interface CompileState {
  readonly baselineDefinitions: Map<string, readonly ItemId[]>;
  readonly baselineItems: Map<ItemId, BaselineCompileItem>;
  readonly managedPaths: Map<string, ManagedAssetOwner>;
  readonly conflictedDefinitions: Set<string>;
  readonly definitions: Map<string, CompiledDefinitionRecord>;
  readonly extendDrafts: Map<ItemId, ExtendDraft>;
  readonly conflictedSprites: Set<string>;
  readonly sprites: Map<string, MutableCompiledSprite>;
  readonly baselineCredits: Map<string, readonly ItemId[]>;
  readonly conflictedCredits: Set<string>;
  readonly credits: Map<string, CompiledCreditRecord>;
  readonly diagnostics: AssetPackDiagnostic[];
}

interface CompiledDefinitionRecord extends CompiledAssetDefinition {
  readonly ownerKey: string;
  readonly contributorPackIds: Set<string>;
}

interface MutableCompiledSprite {
  readonly ownerKey: string;
  readonly packId: string;
  readonly assetId: ItemId;
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly animation: AnimationName;
  readonly consumers: CompiledAssetSpriteConsumer[];
}

interface CompiledCreditRecord {
  readonly ownerKey: string;
  readonly packId: string;
  readonly assetId: ItemId;
  readonly credit: CreditEntry;
}

interface ManagedAssetOwner {
  readonly packId: string;
  readonly localId: string;
  readonly itemId: ItemId;
  readonly version?: string;
}

interface BaselineCompileItem {
  readonly itemId: ItemId;
  readonly logicalPath: string;
  readonly definition: ItemDefinition;
  readonly definitionDigest?: string;
  readonly creditDigest?: string;
  readonly managedOwner?: ManagedAssetOwner;
}

interface ExtendCreditContribution {
  readonly packId: string;
  readonly credit: CreditEntry;
}

interface ExtendSemanticPatch {
  readonly ownerKey: string;
  readonly packId: string;
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly layer: `layer_${number}`;
  readonly bodyType: BodyType;
  readonly animation: AnimationName;
  readonly variant?: string;
  readonly basePath: string;
}

interface ExtendFieldPatch {
  readonly ownerKey: string;
  readonly packId: string;
  readonly layer: `layer_${number}`;
  readonly bodyType: BodyType;
  readonly basePath: string;
}

interface ExtendDraft {
  readonly baseline: BaselineCompileItem;
  readonly packId: string;
  readonly logicalPath: string;
  readonly basename: string;
  readonly animations: AnimationName[];
  readonly layers: Map<`layer_${number}`, RawLayer>;
  readonly semanticPatches: Map<string, ExtendSemanticPatch>;
  readonly fieldPatches: Map<string, ExtendFieldPatch>;
  readonly contributionsByFile: Map<string, readonly ExtendCreditContribution[]>;
  readonly contributorPackIds: Set<string>;
}

interface CompiledBodyGroup {
  readonly bodyTypes: readonly BodyType[];
  readonly basePath: string;
}

interface LayerCompileState {
  readonly layerName: `layer_${number}`;
  readonly rawLayer: RawLayer;
  readonly groups: readonly CompiledBodyGroup[];
}

interface DefinitionDraft {
  readonly assetId: ItemId;
  readonly logicalPath: string;
  readonly basename: string;
  readonly definition: ItemDefinition;
  readonly creditFiles: Set<string>;
}

export function compileAssetPacks(options: CompileAssetPacksOptions): AssetPackCompilePlan {
  const state = createCompileState(options.baseline);
  for (const pack of [...options.packs].sort(comparePackIdentity)) {
    for (const asset of [...pack.assets].sort(compareAssetIdentity)) {
      compileAsset(state, pack, asset);
    }
  }
  return finalizeCompileState(state);
}

function createCompileState(baseline: AssetPackBaseline): CompileState {
  const baselineDefinitions = new Map<string, ItemId[]>();
  const baselineCredits = new Map<string, ItemId[]>();
  const baselineItems = new Map<ItemId, BaselineCompileItem>();
  const managedPaths = new Map<string, ManagedAssetOwner>();
  for (const [itemId, definition] of baseline.catalog.byItemId) {
    const logicalPath = definitionLogicalPath(definition.type_name, itemId);
    const managedOwner = parseManagedOwner(itemId);
    const baselineItem: BaselineCompileItem = {
      itemId,
      logicalPath,
      definition,
      ...(baseline.definitionDigests.has(itemId)
        ? { definitionDigest: baseline.definitionDigests.get(itemId)! }
        : {}),
      ...(baseline.creditDigests.has(itemId)
        ? { creditDigest: baseline.creditDigests.get(itemId)! }
        : {}),
      ...(managedOwner ? { managedOwner: { ...managedOwner, itemId } } : {}),
    };
    baselineItems.set(itemId, baselineItem);

    if (managedOwner) {
      const owner: ManagedAssetOwner = { ...managedOwner, itemId };
      managedPaths.set(logicalPath, owner);
      for (const credit of definition.credits) {
        managedPaths.set(credit.file, owner);
        managedPaths.set(`spritesheets/${credit.file}`, owner);
      }
      continue;
    }

    const existingDefinitions = baselineDefinitions.get(logicalPath) ?? [];
    baselineDefinitions.set(logicalPath, [...existingDefinitions, itemId]);

    for (const credit of definition.credits) {
      const existingCredits = baselineCredits.get(credit.file) ?? [];
      baselineCredits.set(credit.file, [...existingCredits, itemId]);
    }
  }

  return {
    baselineDefinitions,
    baselineItems,
    managedPaths,
    conflictedDefinitions: new Set(),
    definitions: new Map(),
    extendDrafts: new Map(),
    conflictedSprites: new Set(),
    sprites: new Map(),
    baselineCredits,
    conflictedCredits: new Set(),
    credits: new Map(),
    diagnostics: [],
  };
}

function compileAsset(
  state: CompileState,
  pack: NormalizedAssetPack,
  asset: NormalizedAssetPackAsset,
): void {
  if (asset.kind === 'extend-item') {
    compileExtendItem(state, pack, asset);
    return;
  }
  compileNewItem(state, pack, asset);
}

function compileNewItem(
  state: CompileState,
  pack: NormalizedAssetPack,
  asset: NormalizedNewItemAsset,
): void {
  const ownerKey = compiledOwnerKey(pack, asset);
  const definitionPath = definitionLogicalPath(asset.typeName, asset.itemId);
  const draft = createDefinitionDraft(asset, definitionPath);
  const layerStates = asset.layers.map((layer, layerIndex) =>
    compileLayerGroups(pack.id, asset.localId, layer, layerIndex),
  );

  for (const [layerIndex, layer] of asset.layers.entries()) {
    const layerState = layerStates[layerIndex];
    if (!layerState) continue;
    for (const sprite of [...layer.sprites].sort(compareSpriteIdentity)) {
      for (const group of layerState.groups) {
        if (!spriteAppliesToGroup(sprite, group.bodyTypes)) continue;
        const destinationPath = spriteDestinationPath(
          pack.id,
          asset.localId,
          layer.id,
          group.bodyTypes,
          sprite.animation,
          sprite.variant,
        );
        const consumer: CompiledAssetSpriteConsumer = {
          itemId: asset.itemId,
          typeName: asset.typeName,
          layer: layerState.layerName,
          bodyTypes: group.bodyTypes,
          ...(sprite.variant ? { variant: sprite.variant } : {}),
        };
        const compiledSprite: MutableCompiledSprite = {
          ownerKey,
          packId: pack.id,
          assetId: asset.itemId,
          sourcePath: sprite.source,
          destinationPath,
          animation: sprite.animation,
          consumers: [consumer],
        };

        const credit = compiledCreditEntry(
          ownerKey,
          pack.id,
          asset.itemId,
          pack.creditOverrides.get(sprite.source) ?? pack.credits,
          destinationPath,
        );
        const spriteStatus = inspectSpriteRegistration(state, compiledSprite);
        const creditStatus = inspectCreditRegistration(state, credit);
        if (spriteStatus === 'conflict' || creditStatus === 'conflict') {
          continue;
        }

        commitSpriteRegistration(state, compiledSprite, spriteStatus);
        commitCreditRegistration(state, credit, creditStatus);
        draft.creditFiles.add(credit.credit.file);
      }
    }
  }

  const definitionCredits = [...draft.creditFiles]
    .map((file) => state.credits.get(file))
    .map((credit) => credit?.credit)
    .filter((credit): credit is CreditEntry => credit !== undefined);

  const definition: ItemDefinition = {
    ...draft.definition,
    ...Object.fromEntries(layerStates.map((layerState) => [layerState.layerName, layerState.rawLayer])),
    credits: sortCredits(definitionCredits),
  };

  registerDefinition(state, {
    ownerKey,
    packId: pack.id,
    assetId: asset.itemId,
    logicalPath: draft.logicalPath,
    basename: draft.basename,
    definition,
    contributorPackIds: new Set([pack.id]),
  });
}

function compileExtendItem(
  state: CompileState,
  pack: NormalizedAssetPack,
  asset: NormalizedExtendItemAsset,
): void {
  const baseline = state.baselineItems.get(asset.itemId);
  if (!baseline) {
    return;
  }

  if (baseline.definitionDigest && baseline.definitionDigest !== asset.baseDefinitionDigest) {
    state.diagnostics.push({
      code: 'asset_base_definition_changed',
      severity: 'error',
      message: `Baseline definition digest changed for "${asset.itemId}".`,
      packId: pack.id,
      assetId: asset.itemId,
    });
    return;
  }

  if (baseline.creditDigest && baseline.creditDigest !== asset.baseCreditDigest) {
    state.diagnostics.push({
      code: 'asset_base_credit_changed',
      severity: 'error',
      message: `Baseline credit digest changed for "${asset.itemId}".`,
      packId: pack.id,
      assetId: asset.itemId,
    });
    return;
  }

  const ownerKey = compiledOwnerKey(pack, asset);
  const pendingSprites: {
    readonly sprite: MutableCompiledSprite;
    readonly credit: CompiledCreditRecord;
    readonly semanticPatches: readonly ExtendSemanticPatch[];
    readonly fieldPatches: readonly ExtendFieldPatch[];
  }[] = [];

  for (const animationEntry of asset.addAnimations) {
    for (const layer of animationEntry.layers) {
      if (!layer.destination.accepted) {
        continue;
      }

      if (!replacementAuthorizedForPath(pack, baseline.managedOwner, layer.destination.path)) {
        state.diagnostics.push({
          code: 'asset_replacement_unauthorized',
          severity: 'error',
          message: `Pack "${pack.id}" is not authorized to replace manager-owned output ${layer.destination.path}.`,
          packId: pack.id,
          assetId: asset.itemId,
          sourcePath: layer.source,
          destinationPath: layer.destination.path,
        });
        return;
      }

      const destinationOwner = state.managedPaths.get(layer.destination.path);
      if (
        destinationOwner
        && !sameManagedOwner(destinationOwner, baseline.managedOwner)
        && !replacementAuthorizedForPath(pack, destinationOwner, layer.destination.path)
      ) {
        state.diagnostics.push({
          code: 'asset_replacement_unauthorized',
          severity: 'error',
          message: `Pack "${pack.id}" is not authorized to replace manager-owned output ${layer.destination.path}.`,
          packId: pack.id,
          assetId: asset.itemId,
          sourcePath: layer.source,
          destinationPath: layer.destination.path,
        });
        return;
      }

      const basePath = destinationBasePath(
        layer.destination.path,
        animationEntry.animation,
        layer.variant,
      );
      const consumer: CompiledAssetSpriteConsumer = {
        itemId: asset.itemId,
        typeName: baseline.definition.type_name,
        layer: layer.layer,
        bodyTypes: layer.bodyTypes,
        ...(layer.variant ? { variant: layer.variant } : {}),
      };
      const sprite: MutableCompiledSprite = {
        ownerKey,
        packId: pack.id,
        assetId: asset.itemId,
        sourcePath: layer.source,
        destinationPath: layer.destination.path,
        animation: animationEntry.animation,
        consumers: [consumer],
      };

      if (state.conflictedSprites.has(sprite.destinationPath)) {
        state.diagnostics.push({
          code: 'asset_path_conflict',
          severity: 'error',
          message: `Two sprite sources target ${sprite.destinationPath}.`,
          packId: sprite.packId,
          assetId: sprite.assetId,
          sourcePath: sprite.sourcePath,
          destinationPath: sprite.destinationPath,
        });
        return;
      }

      const existingSprite = state.sprites.get(sprite.destinationPath);
      if (
        existingSprite
        && (existingSprite.ownerKey !== sprite.ownerKey || existingSprite.sourcePath !== sprite.sourcePath)
      ) {
        state.diagnostics.push({
          code: 'asset_path_conflict',
          severity: 'error',
          message: `Two sprite sources target ${sprite.destinationPath}.`,
          packId: sprite.packId,
          assetId: sprite.assetId,
          sourcePath: sprite.sourcePath,
          destinationPath: sprite.destinationPath,
        });
        return;
      }

      const semanticPatches = layer.bodyTypes.map((bodyType) => ({
        ownerKey,
        packId: pack.id,
        sourcePath: layer.source,
        destinationPath: layer.destination.path,
        layer: layer.layer,
        bodyType,
        animation: animationEntry.animation,
        ...(layer.variant ? { variant: layer.variant } : {}),
        basePath,
      }));
      const fieldPatches = layer.bodyTypes.map((bodyType) => ({
        ownerKey,
        packId: pack.id,
        layer: layer.layer,
        bodyType,
        basePath,
      }));

      const draft = state.extendDrafts.get(asset.itemId);
      if (!canMergeExtendPatches(draft, semanticPatches, fieldPatches, state, pack, asset)) {
        return;
      }

      pendingSprites.push({
        sprite,
        credit: compiledCreditEntry(
          ownerKey,
          pack.id,
          asset.itemId,
          pack.creditOverrides.get(layer.source) ?? pack.credits,
          layer.destination.path,
        ),
        semanticPatches,
        fieldPatches,
      });
    }
  }

  if (pendingSprites.length === 0) {
    return;
  }

  const draft = getOrCreateExtendDraft(state, baseline, pack.id);
  draft.contributorPackIds.add(pack.id);
  for (const pending of pendingSprites) {
    if (!draft.animations.includes(pending.sprite.animation)) {
      draft.animations.push(pending.sprite.animation);
    }
    for (const patch of pending.semanticPatches) {
      draft.semanticPatches.set(semanticPatchKey(patch), patch);
    }
    for (const patch of pending.fieldPatches) {
      draft.fieldPatches.set(fieldPatchKey(patch), patch);
      const layerState = draft.layers.get(patch.layer) ?? { zPos: 0 };
      draft.layers.set(patch.layer, {
        ...layerState,
        [patch.bodyType]: patch.basePath,
      });
    }

    const current = state.sprites.get(pending.sprite.destinationPath);
    if (current) {
      current.consumers.push(...pending.sprite.consumers);
    } else {
      state.sprites.set(pending.sprite.destinationPath, pending.sprite);
    }

    appendExtendContribution(draft, pack.id, pending.credit.credit);
  }
}

function createDefinitionDraft(
  asset: NormalizedNewItemAsset,
  logicalPath: string,
): DefinitionDraft {
  const basename = logicalPath.slice(logicalPath.lastIndexOf('/') + 1);
  return {
    assetId: asset.itemId,
    logicalPath,
    basename,
    definition: {
      name: asset.itemId,
      display_name: asset.displayName,
      type_name: asset.typeName,
      animations: [...asset.animations],
      credits: [],
      ...(asset.recolor ? { recolors: asset.recolor } : {}),
      ...(asset.variants ? { variants: [...asset.variants] } : {}),
    },
    creditFiles: new Set(),
  };
}

function compileLayerGroups(
  packId: string,
  localId: string,
  layer: NormalizedNewItemLayer,
  layerIndex: number,
): LayerCompileState {
  const signatures = new Map<string, BodyType[]>();
  for (const bodyType of layer.bodyTypes) {
    const signature = bodySignature(layer, bodyType);
    const grouped = signatures.get(signature);
    if (grouped) {
      grouped.push(bodyType);
    } else {
      signatures.set(signature, [bodyType]);
    }
  }

  const groups = [...signatures.values()]
    .map((bodyTypes) => ({
      bodyTypes: sortBodyTypes(bodyTypes),
      basePath: `packages/${packId}/${localId}/${layer.id}/${groupName(bodyTypes)}/`,
    }))
    .sort((left, right) =>
      compareValues(
        [left.basePath, left.bodyTypes.join('\u0000')],
        [right.basePath, right.bodyTypes.join('\u0000')],
      ),
    );

  const rawLayerData: Record<string, number | string | undefined> = { zPos: layer.zPos };
  for (const group of groups) {
    for (const bodyType of group.bodyTypes) {
      rawLayerData[bodyType] = group.basePath;
    }
  }

  return {
    layerName: `layer_${layerIndex + 1}` as const,
    rawLayer: rawLayerData as RawLayer,
    groups,
  };
}

function bodySignature(layer: NormalizedNewItemLayer, bodyType: BodyType): string {
  const relevant = layer.sprites
    .filter((sprite) => sprite.bodyTypes.includes(bodyType))
    .map((sprite) => [sprite.animation, sprite.variant ?? '', sprite.source].join('\u0000'))
    .sort((left, right) => left.localeCompare(right));
  return relevant.join('\u0001');
}

function spriteAppliesToGroup(
  sprite: NormalizedNewItemSprite,
  bodyTypes: readonly BodyType[],
): boolean {
  return bodyTypes.every((bodyType) => sprite.bodyTypes.includes(bodyType));
}

function spriteDestinationPath(
  packId: string,
  localId: string,
  layerId: string,
  bodyTypes: readonly BodyType[],
  animation: AnimationName,
  variant: string | undefined,
): string {
  const folder = animationFolder(animation);
  const group = groupName(bodyTypes);
  const variantPath = variant ? `/${variantToFilename(variant)}` : '';
  return `spritesheets/packages/${packId}/${localId}/${layerId}/${group}/${folder}${variantPath}.png`;
}

function animationFolder(animation: AnimationName): string {
  const matched = ANIMATIONS.find((entry) => entry.value === animation);
  return matched?.folderName ?? matched?.value ?? animation;
}

function definitionLogicalPath(typeName: TypeName, itemId: ItemId): string {
  return `sheet_definitions/${typeName}/${itemId}.json`;
}

function compiledCreditEntry(
  ownerKey: string,
  packId: string,
  assetId: ItemId,
  credit: AssetPackCreditRecord,
  destinationPath: string,
): CompiledCreditRecord {
  return {
    ownerKey,
    packId,
    assetId,
    credit: {
      file: destinationPath.replace(/^spritesheets\//, ''),
      authors: [...credit.authors],
      licenses: [...credit.licenses],
      urls: [...credit.urls],
      notes: credit.notes,
    },
  };
}

function parseManagedOwner(itemId: ItemId): Omit<ManagedAssetOwner, 'itemId' | 'version'> | undefined {
  const separator = itemId.indexOf('--');
  if (separator <= 0 || separator >= itemId.length - 2) {
    return undefined;
  }
  return {
    packId: itemId.slice(0, separator),
    localId: itemId.slice(separator + 2),
  };
}

function replacementAuthorizedForPath(
  pack: NormalizedAssetPack,
  owner: ManagedAssetOwner | undefined,
  _path: string,
): boolean {
  if (!owner) return true;
  if (pack.id === owner.packId) return true;
  return pack.replacements.some((replacement) =>
    replacement.packId === owner.packId
    && replacement.assets.includes(owner.localId)
    && (owner.version === undefined || versionRangeMatches(replacement.versions, owner.version)),
  );
}

function sameManagedOwner(
  left: ManagedAssetOwner | undefined,
  right: ManagedAssetOwner | undefined,
): boolean {
  if (!left || !right) return false;
  return left.packId === right.packId && left.localId === right.localId;
}

function semanticPatchKey(patch: Pick<
  ExtendSemanticPatch,
  'layer' | 'bodyType' | 'animation' | 'variant'
>): string {
  return [
    patch.layer,
    patch.bodyType,
    patch.animation,
    patch.variant ?? '',
  ].join('\u0001');
}

function fieldPatchKey(patch: Pick<ExtendFieldPatch, 'layer' | 'bodyType'>): string {
  return [patch.layer, patch.bodyType].join('\u0001');
}

function canMergeExtendPatches(
  draft: ExtendDraft | undefined,
  semanticPatches: readonly ExtendSemanticPatch[],
  fieldPatches: readonly ExtendFieldPatch[],
  state: CompileState,
  pack: NormalizedAssetPack,
  asset: NormalizedExtendItemAsset,
): boolean {
  if (!draft) return true;

  for (const patch of semanticPatches) {
    const existing = draft.semanticPatches.get(semanticPatchKey(patch));
    if (
      existing
      && (
        existing.destinationPath !== patch.destinationPath
        || existing.sourcePath !== patch.sourcePath
      )
    ) {
      state.diagnostics.push({
        code: 'asset_path_conflict',
        severity: 'error',
        message: `Two extensions target the same semantic patch field on "${asset.itemId}".`,
        packId: pack.id,
        assetId: asset.itemId,
        sourcePath: patch.sourcePath,
        destinationPath: patch.destinationPath,
      });
      return false;
    }
  }

  for (const patch of fieldPatches) {
    const existing = draft.fieldPatches.get(fieldPatchKey(patch));
    if (existing && existing.basePath !== patch.basePath) {
      state.diagnostics.push({
        code: 'asset_path_conflict',
        severity: 'error',
        message: `Two extensions assign different destinations to "${asset.itemId}" ${patch.layer}.${patch.bodyType}.`,
        packId: pack.id,
        assetId: asset.itemId,
      });
      return false;
    }
  }

  return true;
}

function getOrCreateExtendDraft(
  state: CompileState,
  baseline: BaselineCompileItem,
  packId: string,
): ExtendDraft {
  const existing = state.extendDrafts.get(baseline.itemId);
  if (existing) {
    return existing;
  }

  const layers = new Map<`layer_${number}`, RawLayer>();
  for (const [layerName, layer] of layerEntries(baseline.definition)) {
    layers.set(layerName, { ...layer });
  }

  const draft: ExtendDraft = {
    baseline,
    packId,
    logicalPath: baseline.logicalPath,
    basename: baseline.logicalPath.slice(baseline.logicalPath.lastIndexOf('/') + 1),
    animations: [...baseline.definition.animations],
    layers,
    semanticPatches: new Map(),
    fieldPatches: new Map(),
    contributionsByFile: new Map(),
    contributorPackIds: new Set([packId]),
  };
  state.extendDrafts.set(baseline.itemId, draft);
  return draft;
}

function appendExtendContribution(
  draft: ExtendDraft,
  packId: string,
  credit: CreditEntry,
): void {
  const existing = draft.contributionsByFile.get(credit.file) ?? [];
  if (existing.some((entry) => entry.packId === packId && sameCredit(entry.credit, credit))) {
    return;
  }
  draft.contributionsByFile.set(credit.file, [...existing, { packId, credit }]);
}

function layerEntries(
  definition: ItemDefinition,
): readonly [`layer_${number}`, RawLayer][] {
  const entries: [`layer_${number}`, RawLayer][] = Object.entries(definition)
    .filter(([key, value]) => key.startsWith('layer_') && value !== undefined)
    .map(([key, value]) => [key as `layer_${number}`, value as RawLayer]);
  return entries.sort((left, right) => left[0].localeCompare(right[0]));
}

function destinationBasePath(
  destinationPath: string,
  animation: AnimationName,
  variant: string | undefined,
): string {
  const relative = destinationPath.replace(/^spritesheets\//, '');
  const variantFile = variant ? variantToFilename(variant) : undefined;
  const suffix = variantFile
    ? `${animationFolder(animation)}/${variantFile}.png`
    : `${animationFolder(animation)}.png`;
  if (relative.endsWith(suffix)) {
    return relative.slice(0, -suffix.length);
  }
  return `${relative.slice(0, relative.lastIndexOf('/') + 1)}`;
}

function registerDefinition(state: CompileState, definition: CompiledDefinitionRecord): boolean {
  if (state.baselineDefinitions.has(definition.logicalPath)) {
    state.diagnostics.push({
      code: 'asset_path_conflict',
      severity: 'error',
      message: `Generated definition targets existing baseline path ${definition.logicalPath}.`,
      packId: definition.packId,
      assetId: definition.assetId,
      destinationPath: definition.logicalPath,
    });
    return false;
  }

  if (state.conflictedDefinitions.has(definition.logicalPath)) {
    state.diagnostics.push({
      code: 'asset_path_conflict',
      severity: 'error',
      message: `Two generated definitions target ${definition.logicalPath}.`,
      packId: definition.packId,
      assetId: definition.assetId,
      destinationPath: definition.logicalPath,
    });
    return false;
  }

  const existing = state.definitions.get(definition.logicalPath);
  if (!existing) {
    state.definitions.set(definition.logicalPath, definition);
    return true;
  }

  if (existing.ownerKey === definition.ownerKey && sameDefinition(existing, definition)) {
    return true;
  }

  state.definitions.delete(definition.logicalPath);
  state.conflictedDefinitions.add(definition.logicalPath);
  state.diagnostics.push({
    code: 'asset_path_conflict',
    severity: 'error',
    message: `Two generated definitions target ${definition.logicalPath}.`,
    packId: definition.packId,
    assetId: definition.assetId,
    destinationPath: definition.logicalPath,
  });
  return false;
}

type RegistrationStatus = 'insert' | 'merge' | 'conflict';

function inspectSpriteRegistration(
  state: CompileState,
  sprite: MutableCompiledSprite,
): RegistrationStatus {
  if (state.conflictedSprites.has(sprite.destinationPath)) {
    state.diagnostics.push({
      code: 'asset_path_conflict',
      severity: 'error',
      message: `Two sprite sources target ${sprite.destinationPath}.`,
      packId: sprite.packId,
      assetId: sprite.assetId,
      sourcePath: sprite.sourcePath,
      destinationPath: sprite.destinationPath,
    });
    return 'conflict';
  }

  const existing = state.sprites.get(sprite.destinationPath);
  if (!existing) {
    return 'insert';
  }

  if (existing.ownerKey === sprite.ownerKey && existing.sourcePath === sprite.sourcePath) {
    return 'merge';
  }

  state.sprites.delete(sprite.destinationPath);
  state.conflictedSprites.add(sprite.destinationPath);
  state.diagnostics.push({
    code: 'asset_path_conflict',
    severity: 'error',
    message: `Two sprite sources target ${sprite.destinationPath}.`,
    packId: sprite.packId,
    assetId: sprite.assetId,
    sourcePath: sprite.sourcePath,
    destinationPath: sprite.destinationPath,
  });
  return 'conflict';
}

function commitSpriteRegistration(
  state: CompileState,
  sprite: MutableCompiledSprite,
  status: Exclude<RegistrationStatus, 'conflict'>,
): void {
  if (status === 'insert') {
    state.sprites.set(sprite.destinationPath, sprite);
    return;
  }

  const existing = state.sprites.get(sprite.destinationPath);
  if (!existing) return;
  existing.consumers.push(...sprite.consumers);
}

function inspectCreditRegistration(
  state: CompileState,
  credit: CompiledCreditRecord,
): RegistrationStatus {
  if (state.baselineCredits.has(credit.credit.file)) {
    state.diagnostics.push({
      code: 'asset_path_conflict',
      severity: 'error',
      message: `Generated credit targets existing baseline path ${credit.credit.file}.`,
      packId: credit.packId,
      assetId: credit.assetId,
      destinationPath: credit.credit.file,
    });
    return 'conflict';
  }

  if (state.conflictedCredits.has(credit.credit.file)) {
    state.diagnostics.push({
      code: 'asset_path_conflict',
      severity: 'error',
      message: `Two generated credit records target ${credit.credit.file}.`,
      packId: credit.packId,
      assetId: credit.assetId,
      destinationPath: credit.credit.file,
    });
    return 'conflict';
  }

  const existing = state.credits.get(credit.credit.file);
  if (!existing) {
    return 'insert';
  }

  if (existing.ownerKey === credit.ownerKey && sameCredit(existing.credit, credit.credit)) {
    return 'merge';
  }

  state.credits.delete(credit.credit.file);
  state.conflictedCredits.add(credit.credit.file);
  state.diagnostics.push({
    code: 'asset_path_conflict',
    severity: 'error',
    message: `Two generated credit records target ${credit.credit.file}.`,
    packId: credit.packId,
    assetId: credit.assetId,
    destinationPath: credit.credit.file,
  });
  return 'conflict';
}

function commitCreditRegistration(
  state: CompileState,
  credit: CompiledCreditRecord,
  status: Exclude<RegistrationStatus, 'conflict'>,
): void {
  if (status === 'insert') {
    state.credits.set(credit.credit.file, credit);
  }
}

interface ExtendFinalizeResult {
  readonly definitions: readonly (CompiledAssetDefinition & {
    readonly contributorPackIds: readonly string[];
  })[];
  readonly credits: readonly CreditEntry[];
}

function finalizeExtendDrafts(state: CompileState): ExtendFinalizeResult {
  const definitions: (CompiledAssetDefinition & {
    readonly contributorPackIds: readonly string[];
  })[] = [];
  const credits: CreditEntry[] = [];

  for (const draft of state.extendDrafts.values()) {
    const mergedCredits = mergeExtendCredits(
      draft.baseline.definition.credits,
      draft.contributionsByFile,
    );
    const definition = buildExtendedDefinition(draft, mergedCredits);
    definitions.push({
      packId: draft.packId,
      assetId: draft.baseline.itemId,
      logicalPath: draft.logicalPath,
      basename: draft.basename,
      definition,
      contributorPackIds: [...draft.contributorPackIds].sort((left, right) => left.localeCompare(right)),
    });
    credits.push(...mergedCredits);
  }

  return { definitions, credits };
}

function finalizeCompileState(state: CompileState): AssetPackCompilePlan {
  const extendOutputs = finalizeExtendDrafts(state);
  const ownership = new Map<string, Set<string>>();
  for (const definition of state.definitions.values()) {
    for (const packId of definition.contributorPackIds) {
      const paths = ownership.get(packId) ?? new Set<string>();
      paths.add(definition.logicalPath);
      ownership.set(packId, paths);
    }
  }
  for (const definition of extendOutputs.definitions) {
    for (const packId of definition.contributorPackIds) {
      const paths = ownership.get(packId) ?? new Set<string>();
      paths.add(definition.logicalPath);
      ownership.set(packId, paths);
    }
  }
  for (const sprite of state.sprites.values()) {
    const paths = ownership.get(sprite.packId) ?? new Set<string>();
    paths.add(sprite.destinationPath);
    ownership.set(sprite.packId, paths);
  }

  return {
    definitions: [
      ...[...state.definitions.values()]
        .map(({ ownerKey: _ownerKey, contributorPackIds: _contributorPackIds, ...definition }) => definition),
      ...extendOutputs.definitions.map(({ contributorPackIds: _contributorPackIds, ...definition }) => definition),
    ]
      .sort((left, right) =>
      left.logicalPath.localeCompare(right.logicalPath),
      ),
    sprites: [...state.sprites.values()]
      .map(({ ownerKey: _ownerKey, ...sprite }) => ({
        ...sprite,
        consumers: sortConsumers(dedupeConsumers(sprite.consumers)),
      }))
      .sort((left, right) =>
        compareValues(
          [left.destinationPath, left.sourcePath],
          [right.destinationPath, right.sourcePath],
        ),
      ),
    credits: sortCredits([
      ...[...state.credits.values()].map((entry) => entry.credit),
      ...extendOutputs.credits,
    ]),
    ownership: [...ownership.entries()]
      .map(([packId, logicalPaths]) => ({
        packId,
        logicalPaths: [...logicalPaths].sort((left, right) => left.localeCompare(right)),
      }))
      .sort((left, right) => left.packId.localeCompare(right.packId)),
    diagnostics: [...state.diagnostics].sort((left, right) =>
      compareValues(
        [
          left.code,
          left.destinationPath ?? '',
          left.sourcePath ?? '',
          left.assetId ?? '',
          left.packId ?? '',
        ],
        [
          right.code,
          right.destinationPath ?? '',
          right.sourcePath ?? '',
          right.assetId ?? '',
          right.packId ?? '',
        ],
      ),
    ),
  };
}

function mergeExtendCredits(
  baselineCredits: readonly CreditEntry[],
  contributionsByFile: ReadonlyMap<string, readonly ExtendCreditContribution[]>,
): readonly CreditEntry[] {
  const merged: CreditEntry[] = [];
  const consumed = new Set<string>();

  for (const credit of baselineCredits) {
    const contributions = contributionsByFile.get(credit.file);
    if (!contributions || contributions.length === 0) {
      merged.push(credit);
      continue;
    }
    merged.push(unionCreditEntries(credit, contributions));
    consumed.add(credit.file);
  }

  const pendingFiles = [...contributionsByFile.keys()]
    .filter((file) => !consumed.has(file))
    .sort((left, right) => left.localeCompare(right));
  for (const file of pendingFiles) {
    const contributions = contributionsByFile.get(file);
    if (!contributions || contributions.length === 0) continue;
    merged.push(unionCreditEntries(undefined, contributions));
  }

  return merged;
}

function unionCreditEntries(
  inherited: CreditEntry | undefined,
  contributions: readonly ExtendCreditContribution[],
): CreditEntry {
  const ordered = [...contributions].sort((left, right) =>
    left.packId.localeCompare(right.packId),
  );
  const file = inherited?.file ?? ordered[0]?.credit.file ?? '';
  return {
    file,
    authors: unionStringValues(
      inherited?.authors ?? [],
      ordered.map((entry) => entry.credit.authors),
    ),
    licenses: unionStringValues(
      inherited?.licenses ?? [],
      ordered.map((entry) => entry.credit.licenses),
    ),
    urls: unionStringValues(
      inherited?.urls ?? [],
      ordered.map((entry) => entry.credit.urls),
    ),
    notes: unionNotes(
      inherited?.notes,
      ordered.map((entry) => entry.credit.notes),
    ),
  };
}

function buildExtendedDefinition(
  draft: ExtendDraft,
  credits: readonly CreditEntry[],
): ItemDefinition {
  const {
    itemId: _itemId,
    sourcePath: _sourcePath,
    credits: _credits,
    animations: _animations,
    ...baselineDefinition
  } = draft.baseline.definition;

  return {
    ...baselineDefinition,
    animations: [...draft.animations],
    credits,
    ...Object.fromEntries(
      [...draft.layers.entries()].sort((left, right) => left[0].localeCompare(right[0])),
    ),
  };
}

function unionStringValues<T extends string>(
  inherited: readonly T[],
  additions: readonly (readonly T[])[],
): readonly T[] {
  const merged: T[] = [];
  const seen = new Set<T>();
  const append = (value: T) => {
    if (seen.has(value)) return;
    seen.add(value);
    merged.push(value);
  };
  inherited.forEach(append);
  additions.forEach((values) => values.forEach(append));
  return merged;
}

function unionNotes(
  inherited: string | undefined,
  additions: readonly string[],
): string {
  const paragraphs = new Set<string>();
  const ordered: string[] = [];
  const append = (value: string | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed || paragraphs.has(trimmed)) return;
    paragraphs.add(trimmed);
    ordered.push(trimmed);
  };
  append(inherited);
  additions.forEach(append);
  return ordered.join('\n\n');
}

function versionRangeMatches(range: string, version: string): boolean {
  return range.split(/\s+/).every((token) => versionComparatorMatches(token, version));
}

function versionComparatorMatches(token: string, version: string): boolean {
  const match = /^(<=|>=|=|<|>)(.+)$/.exec(token);
  if (!match) return false;
  const operator = match[1];
  const candidate = match[2];
  if (!candidate) return false;
  const comparison = compareSemver(version, candidate);
  switch (operator) {
    case '<':
      return comparison < 0;
    case '<=':
      return comparison <= 0;
    case '=':
      return comparison === 0;
    case '>=':
      return comparison >= 0;
    case '>':
      return comparison > 0;
    default:
      return false;
  }
}

function compareSemver(left: string, right: string): number {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);
  if (!leftParts || !rightParts) {
    return left.localeCompare(right);
  }

  const [leftMajor, leftMinor, leftPatch] = leftParts.core;
  const [rightMajor, rightMinor, rightPatch] = rightParts.core;
  const coreComparisons = [
    leftMajor - rightMajor,
    leftMinor - rightMinor,
    leftPatch - rightPatch,
  ];
  for (const comparison of coreComparisons) {
    if (comparison !== 0) return comparison;
  }

  if (leftParts.prerelease.length === 0 && rightParts.prerelease.length === 0) return 0;
  if (leftParts.prerelease.length === 0) return 1;
  if (rightParts.prerelease.length === 0) return -1;

  for (let index = 0; index < Math.max(leftParts.prerelease.length, rightParts.prerelease.length); index += 1) {
    const leftIdentifier = leftParts.prerelease[index];
    const rightIdentifier = rightParts.prerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    const leftNumeric = /^\d+$/.test(leftIdentifier);
    const rightNumeric = /^\d+$/.test(rightIdentifier);
    if (leftNumeric && rightNumeric) {
      const comparison = Number(leftIdentifier) - Number(rightIdentifier);
      if (comparison !== 0) return comparison;
      continue;
    }
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    const comparison = leftIdentifier.localeCompare(rightIdentifier);
    if (comparison !== 0) return comparison;
  }

  return 0;
}

function parseSemver(
  value: string,
): { readonly core: readonly [number, number, number]; readonly prerelease: readonly string[] } | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+.*)?$/.exec(value);
  if (!match) return undefined;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function comparePackIdentity(left: NormalizedAssetPack, right: NormalizedAssetPack): number {
  return compareValues([left.id, left.version], [right.id, right.version]);
}

function compareAssetIdentity(
  left: NormalizedAssetPackAsset,
  right: NormalizedAssetPackAsset,
): number {
  return compareValues(
    [left.kind, left.itemId],
    [right.kind, right.itemId],
  );
}

function compareSpriteIdentity(left: NormalizedNewItemSprite, right: NormalizedNewItemSprite): number {
  return compareValues(
    [left.animation, left.variant ?? '', left.source, left.bodyTypes.join('\u0000')],
    [right.animation, right.variant ?? '', right.source, right.bodyTypes.join('\u0000')],
  );
}

function dedupeConsumers(
  consumers: readonly CompiledAssetSpriteConsumer[],
): readonly CompiledAssetSpriteConsumer[] {
  const unique = new Map<string, CompiledAssetSpriteConsumer>();
  for (const consumer of consumers) {
    unique.set(consumerKey(consumer), consumer);
  }
  return [...unique.values()];
}

function consumerKey(consumer: CompiledAssetSpriteConsumer): string {
  return [
    consumer.itemId,
    consumer.typeName,
    consumer.layer,
    consumer.bodyTypes.join('\u0000'),
    consumer.variant ?? '',
  ].join('\u0001');
}

function sortConsumers(
  consumers: readonly CompiledAssetSpriteConsumer[],
): readonly CompiledAssetSpriteConsumer[] {
  return [...consumers].sort((left, right) =>
    compareValues(
      [
        left.typeName,
        left.itemId,
        left.layer,
        left.bodyTypes.join('\u0000'),
        left.variant ?? '',
      ],
      [
        right.typeName,
        right.itemId,
        right.layer,
        right.bodyTypes.join('\u0000'),
        right.variant ?? '',
      ],
    ),
  );
}

function sortCredits(credits: readonly CreditEntry[]): readonly CreditEntry[] {
  return [...credits].sort((left, right) =>
    compareValues(
      [left.file, left.authors.join('\u0000'), left.licenses.join('\u0000')],
      [right.file, right.authors.join('\u0000'), right.licenses.join('\u0000')],
    ),
  );
}

function sameDefinition(left: CompiledAssetDefinition, right: CompiledAssetDefinition): boolean {
  return JSON.stringify(left.definition) === JSON.stringify(right.definition);
}

function sameCredit(left: CreditEntry, right: CreditEntry): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function compareValues(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const comparison = (left[index] ?? '').localeCompare(right[index] ?? '');
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function sortBodyTypes(bodyTypes: readonly BodyType[]): readonly BodyType[] {
  const requested = new Set(bodyTypes);
  return BODY_TYPES.filter((bodyType) => requested.has(bodyType));
}

function groupName(bodyTypes: readonly BodyType[]): string {
  return sortBodyTypes(bodyTypes).join('-');
}

function variantToFilename(variant: string): string {
  return variant.replaceAll(' ', '_');
}

function compiledOwnerKey(
  pack: NormalizedAssetPack,
  asset: Pick<NormalizedAssetPackAsset, 'itemId'>,
): string {
  return `${pack.id}@${pack.version}\u0000${asset.itemId}`;
}
