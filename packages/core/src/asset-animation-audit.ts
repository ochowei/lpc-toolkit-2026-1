import {
  auditAnimationFolder,
  compatibleAnimationSources,
  itemAnimationCapabilities,
} from './animation-capabilities.js';
import {
  ANIMATIONS,
  ANIMATION_CONFIGS,
  BODY_TYPES,
  DIRECTIONS,
  FRAME_SIZE,
  VIRTUAL_ANIMATION_MAP,
  type Direction,
} from './constants.js';
import { customAnimations } from './custom-animations.js';
import { getRecolorVariants } from './recolor-resolve.js';
import type {
  AnimationName,
  BodyType,
  Catalog,
  ItemDefinition,
  ItemId,
  PaletteMetadata,
  TypeName,
} from './types.js';

export type AuditLayerName = `layer_${number}`;

export interface AnimationAuditFrameCell {
  readonly sourceColumn: number;
  readonly logicalFrameIndices: readonly number[];
}

export interface AnimationAuditFrameRow {
  readonly sourceRow: number;
  readonly direction?: Direction;
  readonly cells: readonly AnimationAuditFrameCell[];
}

export interface AnimationAuditGeometry {
  readonly kind: 'standard' | 'custom';
  readonly frameSize: number;
  readonly rows: readonly AnimationAuditFrameRow[];
}

export interface AnimationAuditConsumer {
  readonly itemId: ItemId;
  readonly typeName: TypeName;
  readonly layer: AuditLayerName;
  readonly bodyTypes: readonly BodyType[];
  readonly variant?: string;
  readonly recolors: readonly string[];
}

export interface PlannedAnimationAsset {
  readonly path: string;
  readonly animation: AnimationName;
  readonly sourceAnimation: AnimationName;
  readonly geometry: AnimationAuditGeometry;
  readonly consumers: readonly AnimationAuditConsumer[];
}

export interface UnsupportedAnimationRequirement extends AnimationAuditConsumer {
  readonly expectedPath?: string;
  readonly pathConfidence: 'inferred' | 'manual-review';
  readonly manualReviewReason?: string;
}

export interface UnsupportedAnimationFinding {
  readonly itemId: ItemId;
  readonly typeName: TypeName;
  readonly animation: AnimationName;
  readonly nativeAnimations: readonly AnimationName[];
  readonly compatibleAnimations: readonly AnimationName[];
  readonly requirements: readonly UnsupportedAnimationRequirement[];
}

export interface AnimationAuditPlanningError {
  readonly kind: 'path_resolution_requires_selection';
  readonly message: string;
  readonly consumer: AnimationAuditConsumer;
}

export interface AssetAnimationAuditPlan {
  readonly targets: readonly AnimationName[];
  readonly itemsScanned: number;
  readonly assets: readonly PlannedAnimationAsset[];
  readonly unsupported: readonly UnsupportedAnimationFinding[];
  readonly errors: readonly AnimationAuditPlanningError[];
}

export interface PlanAssetAnimationAuditOptions {
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly targets: readonly AnimationName[];
  readonly typeName?: TypeName;
  readonly bodyType?: BodyType;
}

interface ExpandedBasePath {
  readonly path?: string;
  readonly unresolvedToken?: string;
}

interface LayerPathGroup {
  readonly layer: AuditLayerName;
  readonly basePath?: string;
  readonly bodyTypes: readonly BodyType[];
  readonly customAnimation?: string;
  readonly unresolvedToken?: string;
}

function planTargets(targets: readonly AnimationName[]): readonly AnimationName[] {
  const requested = new Set(targets);
  return ANIMATIONS.map(({ value }) => value).filter((name) => requested.has(name));
}

export function standardAnimationGeometry(target: AnimationName): AnimationAuditGeometry {
  const config = ANIMATION_CONFIGS[target];
  if (!config) throw new Error(`Unknown standard animation: ${target}`);

  const positions = new Map<number, number[]>();
  config.cycle.forEach((sourceColumn, logicalFrameIndex) => {
    const indices = positions.get(sourceColumn) ?? [];
    indices.push(logicalFrameIndex);
    positions.set(sourceColumn, indices);
  });

  return {
    kind: 'standard',
    frameSize: FRAME_SIZE,
    rows: Array.from({ length: config.num }, (_, sourceRow) => ({
      sourceRow,
      ...(DIRECTIONS[sourceRow] ? { direction: DIRECTIONS[sourceRow] } : {}),
      cells: [...positions].map(([sourceColumn, logicalFrameIndices]) => ({
        sourceColumn,
        logicalFrameIndices,
      })),
    })),
  };
}

export function customAnimationGeometry(sourceAnimation: AnimationName): AnimationAuditGeometry {
  const definition = customAnimations[sourceAnimation];
  if (!definition) throw new Error(`Unknown custom animation: ${sourceAnimation}`);

  return {
    kind: 'custom',
    frameSize: definition.frameSize,
    rows: definition.frames.map((frames, sourceRow) => ({
      sourceRow,
      ...(DIRECTIONS[sourceRow] ? { direction: DIRECTIONS[sourceRow] } : {}),
      cells: frames.map((_, sourceColumn) => ({
        sourceColumn,
        logicalFrameIndices: [sourceColumn],
      })),
    })),
  };
}

/**
 * Returns the registered geometry for either a standard or custom animation
 * source. Callers must use this registry-backed helper rather than inferring
 * LPC frame dimensions from an asset path or provider input.
 */
export function animationAuditGeometry(sourceAnimation: AnimationName): AnimationAuditGeometry {
  return customAnimations[sourceAnimation]
    ? customAnimationGeometry(sourceAnimation)
    : standardAnimationGeometry(sourceAnimation);
}

function variantsFor(item: ItemDefinition): readonly (string | undefined)[] {
  return item.variants && item.variants.length > 0 ? item.variants : [undefined];
}

function expandBasePath(path: string, item: ItemDefinition): readonly ExpandedBasePath[] {
  const tokens = [...path.matchAll(/\$\{([^}]+)\}/g)].flatMap((match) =>
    match[1] ? [match[1]] : [],
  );
  const uniqueTokens = [...new Set(tokens)];
  for (const token of uniqueTokens) {
    const replacements = item.replace_in_path?.[token];
    if (!replacements || Object.values(replacements).every((value) => !value)) {
      return [{ unresolvedToken: token }];
    }
  }

  let paths = [path];
  for (const token of uniqueTokens) {
    const replacements = [...new Set(Object.values(item.replace_in_path?.[token] ?? {}).filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    ))];
    paths = paths.flatMap((current) => replacements.map((replacement) =>
      current.replaceAll(`\${${token}}`, replacement),
    ));
  }
  return [...new Set(paths)].map((resolvedPath) => ({ path: resolvedPath }));
}

function layerPathGroups(
  item: ItemDefinition,
  bodyType: BodyType | undefined,
): readonly LayerPathGroup[] {
  const selectedBodies = bodyType ? [bodyType] : BODY_TYPES;
  const groups: LayerPathGroup[] = [];

  for (let layerNumber = 1; layerNumber < 10; layerNumber += 1) {
    const layerName = `layer_${layerNumber}` as AuditLayerName;
    const layer = item[layerName];
    if (!layer) break;
    const byPath = new Map<string, BodyType[]>();
    const unresolved = new Map<string, BodyType[]>();
    for (const body of selectedBodies) {
      const rawPath = layer[body];
      if (typeof rawPath !== 'string') continue;
      for (const result of expandBasePath(rawPath, item)) {
        if (result.path) {
          const bodies = byPath.get(result.path) ?? [];
          bodies.push(body);
          byPath.set(result.path, bodies);
        } else if (result.unresolvedToken) {
          const bodies = unresolved.get(result.unresolvedToken) ?? [];
          bodies.push(body);
          unresolved.set(result.unresolvedToken, bodies);
        }
      }
    }
    for (const [basePath, bodyTypes] of byPath) {
      groups.push({
        layer: layerName,
        basePath,
        bodyTypes,
        ...(layer.custom_animation ? { customAnimation: layer.custom_animation } : {}),
      });
    }
    for (const [unresolvedToken, bodyTypes] of unresolved) {
      groups.push({
        layer: layerName,
        bodyTypes,
        ...(layer.custom_animation ? { customAnimation: layer.custom_animation } : {}),
        unresolvedToken,
      });
    }
  }

  return groups;
}

function consumerFor(
  itemId: ItemId,
  typeName: TypeName,
  group: LayerPathGroup,
  variant: string | undefined,
  recolors: readonly string[],
): AnimationAuditConsumer {
  return {
    itemId,
    typeName,
    layer: group.layer,
    bodyTypes: group.bodyTypes,
    ...(variant ? { variant } : {}),
    recolors,
  };
}

function unresolvedReason(token: string): string {
  return `Layer path depends on an unresolved \${${token}} selection.`;
}

function assetKey(asset: PlannedAnimationAsset): string {
  return [asset.path, asset.animation, asset.sourceAnimation, JSON.stringify(asset.geometry)].join('\u0000');
}

function compareValues(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const comparison = (left[index] ?? '').localeCompare(right[index] ?? '');
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function consumerSortFields(consumer: AnimationAuditConsumer): readonly string[] {
  return [
    consumer.typeName,
    consumer.itemId,
    consumer.layer,
    consumer.bodyTypes.join('\u0000'),
    consumer.variant ?? '',
    consumer.recolors.join('\u0000'),
  ];
}

function sortConsumers(consumers: readonly AnimationAuditConsumer[]): readonly AnimationAuditConsumer[] {
  return [...consumers].sort((left, right) =>
    compareValues(consumerSortFields(left), consumerSortFields(right)),
  );
}

function sortRequirements(
  requirements: readonly UnsupportedAnimationRequirement[],
): readonly UnsupportedAnimationRequirement[] {
  return [...requirements].sort((left, right) => compareValues(
    [
      left.typeName,
      left.itemId,
      left.expectedPath ?? '',
      left.layer,
      left.bodyTypes.join('\u0000'),
      left.variant ?? '',
    ],
    [
      right.typeName,
      right.itemId,
      right.expectedPath ?? '',
      right.layer,
      right.bodyTypes.join('\u0000'),
      right.variant ?? '',
    ],
  ));
}

export function planAssetAnimationAudit(
  options: PlanAssetAnimationAuditOptions,
): AssetAnimationAuditPlan {
  const targets = planTargets(options.targets);
  const assets = new Map<string, PlannedAnimationAsset>();
  const unsupported: UnsupportedAnimationFinding[] = [];
  const errors: AnimationAuditPlanningError[] = [];
  const items = [...options.catalog.byItemId.entries()]
    .filter(([, item]) => !options.typeName || item.type_name === options.typeName)
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId));

  for (const [itemId, item] of items) {
    const typeName = item.type_name;
    const recolors = getRecolorVariants(item, options.palettes);
    const groups = layerPathGroups(item, options.bodyType);
    const capabilities = itemAnimationCapabilities(item);

    for (const target of targets) {
      const native = capabilities.native.includes(target);
      const compatibleSources = compatibleAnimationSources(item, target);
      if (!native && compatibleSources.length === 0) {
        const requirements: UnsupportedAnimationRequirement[] = [];
        const ordinaryGroups = groups.filter((group) => !group.customAnimation);
        for (const group of ordinaryGroups) {
          for (const variant of variantsFor(item)) {
            const consumer = consumerFor(itemId, typeName, group, variant, recolors);
            if (!group.basePath) {
              const reason = unresolvedReason(group.unresolvedToken ?? 'path');
              requirements.push({ ...consumer, pathConfidence: 'manual-review', manualReviewReason: reason });
              errors.push({ kind: 'path_resolution_requires_selection', message: reason, consumer });
              continue;
            }
            const folder = auditAnimationFolder(target);
            const variantFile = variant?.replaceAll(' ', '_');
            requirements.push({
              ...consumer,
              expectedPath: `spritesheets/${group.basePath}${folder}${variantFile ? `/${variantFile}` : ''}.png`,
              pathConfidence: 'inferred',
            });
          }
        }
        if (ordinaryGroups.length === 0 && groups.length > 0) {
          const group = groups[0];
          if (group) {
            const consumer = consumerFor(itemId, typeName, group, undefined, recolors);
            requirements.push({
              ...consumer,
              pathConfidence: 'manual-review',
              manualReviewReason: 'Item has only custom-animation layers; choose a standard layout before drawing.',
            });
          }
        }
        if (requirements.length > 0) {
          unsupported.push({
            itemId,
            typeName,
            animation: target,
            nativeAnimations: capabilities.native,
            compatibleAnimations: capabilities.compatible,
            requirements: sortRequirements(requirements),
          });
        }
        continue;
      }

      for (const compatibleSource of [
        ...(native ? [undefined] : []),
        ...compatibleSources,
      ]) {
        const sourceAnimation = compatibleSource
          ?? (VIRTUAL_ANIMATION_MAP[target as keyof typeof VIRTUAL_ANIMATION_MAP] ?? target);
        const geometry = compatibleSource
          ? customAnimationGeometry(compatibleSource)
          : standardAnimationGeometry(target);
        const applicableGroups = compatibleSource
          ? groups.filter((group) => group.customAnimation === compatibleSource)
          : groups.filter((group) => !group.customAnimation);
        for (const group of applicableGroups) {
          for (const variant of variantsFor(item)) {
            const consumer = consumerFor(itemId, typeName, group, variant, recolors);
            if (!group.basePath) {
              errors.push({
                kind: 'path_resolution_requires_selection',
                message: unresolvedReason(group.unresolvedToken ?? 'path'),
                consumer,
              });
              continue;
            }
            const variantFile = variant?.replaceAll(' ', '_');
            const path = compatibleSource
              ? `spritesheets/${group.basePath}${variantFile ?? ''}.png`
              : `spritesheets/${group.basePath}${auditAnimationFolder(target)}${variantFile ? `/${variantFile}` : ''}.png`;
            const asset: PlannedAnimationAsset = {
              path,
              animation: target,
              sourceAnimation,
              geometry,
              consumers: [consumer],
            };
            const key = assetKey(asset);
            const existing = assets.get(key);
            if (existing) {
              assets.set(key, { ...existing, consumers: [...existing.consumers, consumer] });
            } else {
              assets.set(key, asset);
            }
          }
        }
      }
    }
  }

  return {
    targets,
    itemsScanned: items.length,
    assets: [...assets.values()]
      .map((asset) => ({ ...asset, consumers: sortConsumers(asset.consumers) }))
      .sort((left, right) => assetKey(left).localeCompare(assetKey(right))),
    unsupported: unsupported.sort((left, right) =>
      `${left.itemId}\u0000${left.animation}`.localeCompare(`${right.itemId}\u0000${right.animation}`),
    ),
    errors: errors.sort((left, right) => {
      const messageComparison = left.message.localeCompare(right.message);
      return messageComparison !== 0
        ? messageComparison
        : compareValues(consumerSortFields(left.consumer), consumerSortFields(right.consumer));
    }),
  };
}
