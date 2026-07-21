import { ANIMATIONS, BODY_TYPES } from './constants.js';
import type {
  AssetPackCreditRecord,
  NormalizedAssetPack,
  NormalizedAssetPackAsset,
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
  readonly definitions: Map<string, CompiledDefinitionRecord>;
  readonly sprites: Map<string, MutableCompiledSprite>;
  readonly baselineCredits: Map<string, readonly ItemId[]>;
  readonly credits: Map<string, CompiledCreditRecord>;
  readonly ownership: Map<string, Set<string>>;
  readonly diagnostics: AssetPackDiagnostic[];
}

interface CompiledDefinitionRecord extends CompiledAssetDefinition {
  readonly ownerKey: string;
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
  for (const [itemId, definition] of baseline.catalog.byItemId) {
    const existingDefinitions = baselineDefinitions.get(definitionLogicalPath(definition.type_name, itemId)) ?? [];
    baselineDefinitions.set(
      definitionLogicalPath(definition.type_name, itemId),
      [...existingDefinitions, itemId],
    );

    for (const credit of definition.credits) {
      const existingCredits = baselineCredits.get(credit.file) ?? [];
      baselineCredits.set(credit.file, [...existingCredits, itemId]);
    }
  }

  return {
    baselineDefinitions,
    definitions: new Map(),
    sprites: new Map(),
    baselineCredits,
    credits: new Map(),
    ownership: new Map(),
    diagnostics: [],
  };
}

function compileAsset(
  state: CompileState,
  pack: NormalizedAssetPack,
  asset: NormalizedAssetPackAsset,
): void {
  if (asset.kind !== 'new-item') {
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
        addOwnedPath(state, pack.id, destinationPath);
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
  });
  addOwnedPath(state, pack.id, draft.logicalPath);
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

  const existing = state.definitions.get(definition.logicalPath);
  if (!existing) {
    state.definitions.set(definition.logicalPath, definition);
    return true;
  }

  if (existing.ownerKey === definition.ownerKey && sameDefinition(existing, definition)) {
    return true;
  }

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
  const existing = state.sprites.get(sprite.destinationPath);
  if (!existing) {
    return 'insert';
  }

  if (existing.ownerKey === sprite.ownerKey && existing.sourcePath === sprite.sourcePath) {
    return 'merge';
  }

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

  const existing = state.credits.get(credit.credit.file);
  if (!existing) {
    return 'insert';
  }

  if (existing.ownerKey === credit.ownerKey && sameCredit(existing.credit, credit.credit)) {
    return 'merge';
  }

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

function addOwnedPath(state: CompileState, packId: string, logicalPath: string): void {
  const paths = state.ownership.get(packId) ?? new Set<string>();
  paths.add(logicalPath);
  state.ownership.set(packId, paths);
}

function finalizeCompileState(state: CompileState): AssetPackCompilePlan {
  return {
    definitions: [...state.definitions.values()]
      .map(({ ownerKey: _ownerKey, ...definition }) => definition)
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
    credits: sortCredits([...state.credits.values()].map((entry) => entry.credit)),
    ownership: [...state.ownership.entries()]
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

function compiledOwnerKey(pack: NormalizedAssetPack, asset: NormalizedNewItemAsset): string {
  return `${pack.id}@${pack.version}\u0000${asset.itemId}`;
}
