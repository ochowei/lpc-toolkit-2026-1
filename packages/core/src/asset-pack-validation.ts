import {
  standardAnimationGeometry,
  type AnimationAuditGeometry,
} from './asset-animation-audit.js';
import {
  warningAcknowledged,
  type NormalizedAssetPack,
  type NormalizedExtendItemAsset,
  type NormalizedExtendItemLayer,
  type NormalizedNewItemAsset,
  type NormalizedNewItemLayer,
  type NormalizedNewItemSprite,
} from './asset-pack-model.js';
import { extensionDestinationBasePath } from './asset-pack-paths.js';
import type {
  AssetPackAcknowledgement,
  AssetPackDiagnostic,
} from './asset-pack-schema.js';
import { ANIMATION_CONFIGS, BODY_TYPES } from './constants.js';
import type {
  BodyType,
  Catalog,
  ItemDefinition,
  ItemId,
  PaletteMetadata,
  RawLayer,
  RawRecolors,
  RecolorConfig,
} from './types.js';

export interface AssetPackSourceInspection {
  readonly sourcePath: string;
  readonly digest?: string;
  readonly regularFile: boolean;
  readonly decoded?: {
    readonly width: number;
    readonly height: number;
    readonly nonTransparentCells: readonly string[];
    readonly paletteColors: readonly string[];
  };
  readonly error?: 'missing' | 'outside-pack' | 'not-regular' | 'decode-failed';
}

export interface AssetPackBaseline {
  readonly catalog: Catalog;
  readonly definitionDigests: ReadonlyMap<ItemId, string>;
  readonly creditDigests: ReadonlyMap<ItemId, string>;
}

export interface ValidateAssetPackOptions {
  readonly pack: NormalizedAssetPack;
  readonly baseline: AssetPackBaseline;
  readonly palettes: PaletteMetadata;
  readonly inspections: readonly AssetPackSourceInspection[];
  readonly contentDigest: string;
}

export interface AssetPackValidationResult {
  readonly ok: boolean;
  readonly contentDigest: string;
  readonly diagnostics: readonly AssetPackDiagnostic[];
  readonly acknowledgementRecords: readonly AssetPackAcknowledgement[];
}

interface SourceUse {
  readonly sourcePath: string;
  readonly geometry: AnimationAuditGeometry;
  readonly path: string;
  readonly assetId: string;
  readonly animation: string;
}

export function validateAssetPack(
  options: ValidateAssetPackOptions,
): AssetPackValidationResult {
  const diagnostics: AssetPackDiagnostic[] = [];
  const sourceUses = new Map<string, SourceUse>();
  const inspectionMap = new Map(options.inspections.map((inspection) => [
    inspection.sourcePath,
    inspection,
  ]));

  options.pack.assets.forEach((asset, assetIndex) => {
    if (asset.kind === 'new-item') {
      validateNewItem(
        asset,
        assetIndex,
        options,
        diagnostics,
        sourceUses,
      );
      return;
    }

    validateExtendItem(
      asset,
      assetIndex,
      options,
      diagnostics,
      sourceUses,
    );
  });

  for (const [sourcePath, use] of sourceUses) {
    const inspection = inspectionMap.get(sourcePath);
    if (
      !inspection
      || inspection.error === 'missing'
      || inspection.error === 'outside-pack'
      || inspection.error === 'not-regular'
    ) {
      diagnostics.push({
        code: 'asset_source_missing',
        severity: 'error',
        message: `Missing usable source PNG for ${sourcePath}.`,
        assetId: use.assetId,
        sourcePath,
        details: { path: use.path, sourceError: inspection?.error ?? 'missing' },
      });
      continue;
    }

    if (inspection.error === 'decode-failed' || !inspection.decoded) {
      diagnostics.push({
        code: 'asset_png_decode_failed',
        severity: 'error',
        message: `Could not decode source PNG for ${sourcePath}.`,
        assetId: use.assetId,
        sourcePath,
        details: { path: use.path },
      });
      continue;
    }

    const expectedBounds = geometryBounds(use.geometry);
    if (
      inspection.decoded.width !== expectedBounds.width
      || inspection.decoded.height !== expectedBounds.height
    ) {
      diagnostics.push({
        code: 'asset_geometry_mismatch',
        severity: 'error',
        message: `Source PNG dimensions do not match the expected geometry for ${sourcePath}.`,
        assetId: use.assetId,
        sourcePath,
        details: {
          path: use.path,
          expectedWidth: expectedBounds.width,
          expectedHeight: expectedBounds.height,
          actualWidth: inspection.decoded.width,
          actualHeight: inspection.decoded.height,
        },
      });
      continue;
    }

    const presentCells = new Set(inspection.decoded.nonTransparentCells);
    const missingRequired = requiredCells(use.geometry).filter((cell) => !presentCells.has(cell));
    if (missingRequired.length > 0) {
      diagnostics.push({
        code: 'asset_required_frame_blank',
        severity: 'error',
        message: `Required frames are blank in ${sourcePath}.`,
        assetId: use.assetId,
        sourcePath,
        subject: warningSubject({
          assetId: use.assetId,
          animation: use.animation,
          sourcePath,
          cells: missingRequired,
        }),
        details: {
          path: use.path,
          cells: missingRequired,
        },
      });
    }

    const blankOptionalCells = optionalCells(use.geometry).filter((cell) => !presentCells.has(cell));
    if (blankOptionalCells.length > 0) {
      diagnostics.push({
        code: 'asset_optional_frame_blank',
        severity: 'warning',
        message: `Optional padding frames are blank in ${sourcePath}.`,
        assetId: use.assetId,
        sourcePath,
        subject: warningSubject({
          assetId: use.assetId,
          animation: use.animation,
          sourcePath,
          cells: blankOptionalCells,
        }),
        details: {
          path: use.path,
          cells: blankOptionalCells,
        },
      });
    }
  }

  diagnostics.push(...validateRecolorSourceRamps(
    options.pack,
    options.palettes,
    options.inspections,
  ));

  const sortedDiagnostics = sortDiagnostics(diagnostics);
  const acknowledgementRecords = buildAcknowledgementRecords(
    sortedDiagnostics,
    options.contentDigest,
  );
  const hasErrors = sortedDiagnostics.some((diagnostic) => diagnostic.severity === 'error');
  const hasBlockingWarnings = sortedDiagnostics.some((diagnostic) =>
    diagnostic.severity === 'warning'
    && !warningAcknowledged(
      diagnostic,
      options.contentDigest,
      options.pack.acknowledgements,
    ),
  );

  return {
    ok: !hasErrors && !hasBlockingWarnings,
    contentDigest: options.contentDigest,
    diagnostics: sortedDiagnostics,
    acknowledgementRecords,
  };
}

function validateNewItem(
  asset: NormalizedNewItemAsset,
  assetIndex: number,
  options: ValidateAssetPackOptions,
  diagnostics: AssetPackDiagnostic[],
  sourceUses: Map<string, SourceUse>,
): void {
  if (options.baseline.catalog.byItemId.has(asset.itemId)) {
    diagnostics.push({
      code: 'asset_path_conflict',
      severity: 'error',
      message: `New-item identity "${asset.itemId}" already exists in the baseline catalog.`,
      assetId: asset.itemId,
      destinationPath: `sheet_definitions/${asset.typeName}/${asset.itemId}.json`,
      details: { path: `$.assets[${assetIndex}].localId`, itemId: asset.itemId },
    });
  }

  if (!options.baseline.catalog.typeNames.includes(asset.typeName)) {
    diagnostics.push(schemaDiagnostic(
      `$.assets[${assetIndex}].typeName`,
      `Unknown type "${asset.typeName}".`,
      asset.itemId,
    ));
  }

  const variants = new Set(asset.variants ?? []);
  const supportedBodies = new Set(asset.bodyTypes);

  asset.animations.forEach((animation, animationIndex) => {
    if (!isRegisteredAnimation(animation)) {
      diagnostics.push(schemaDiagnostic(
        `$.assets[${assetIndex}].animations[${animationIndex}]`,
        `Unknown animation "${animation}".`,
        asset.itemId,
      ));
    }
  });

  validateRecolors(
    asset.recolor,
    `$.assets[${assetIndex}].recolor`,
    asset.itemId,
    options.palettes,
    diagnostics,
  );

  asset.layers.forEach((layer, layerIndex) => {
    validateNewItemLayer(
      asset,
      layer,
      assetIndex,
      layerIndex,
      variants,
      supportedBodies,
      diagnostics,
      sourceUses,
    );
  });
}

function validateNewItemLayer(
  asset: NormalizedNewItemAsset,
  layer: NormalizedNewItemLayer,
  assetIndex: number,
  layerIndex: number,
  variants: ReadonlySet<string>,
  supportedBodies: ReadonlySet<string>,
  diagnostics: AssetPackDiagnostic[],
  sourceUses: Map<string, SourceUse>,
): void {
  const animationBodies = new Map<string, Set<string>>();
  const seenAnimations = new Set<string>();
  const layerBodies = new Set(layer.bodyTypes);
  const pathPrefix = `$.assets[${assetIndex}].layers[${layerIndex}]`;

  layer.sprites.forEach((sprite, spriteIndex) => {
    validateNewItemSprite(
      asset,
      sprite,
      pathPrefix,
      spriteIndex,
      variants,
      supportedBodies,
      layerBodies,
      diagnostics,
      sourceUses,
      seenAnimations,
      animationBodies,
    );
  });

  const missingAnimations = asset.animations.filter((animation) => !seenAnimations.has(animation));
  if (missingAnimations.length > 0) {
    diagnostics.push({
      code: 'asset_partial_animation_coverage',
      severity: 'warning',
      message: `Layer "${layer.id}" does not cover every declared animation.`,
      assetId: asset.itemId,
      subject: warningSubject({
        assetId: asset.itemId,
        layerId: layer.id,
        animations: missingAnimations,
      }),
      details: {
        path: `${pathPrefix}.sprites`,
        animations: missingAnimations,
      },
    });
  }

  for (const [animation, bodies] of animationBodies) {
    const missingBodies = layer.bodyTypes.filter((bodyType) => !bodies.has(bodyType));
    if (missingBodies.length > 0) {
      diagnostics.push({
        code: 'asset_partial_body_coverage',
        severity: 'warning',
        message: `Animation "${animation}" does not cover every layer body type.`,
        assetId: asset.itemId,
        subject: warningSubject({
          assetId: asset.itemId,
          layerId: layer.id,
          animation,
          bodyTypes: missingBodies,
        }),
        details: {
          path: `${pathPrefix}.sprites`,
          bodyTypes: missingBodies,
        },
      });
    }
  }
}

function validateNewItemSprite(
  asset: NormalizedNewItemAsset,
  sprite: NormalizedNewItemSprite,
  pathPrefix: string,
  spriteIndex: number,
  variants: ReadonlySet<string>,
  supportedBodies: ReadonlySet<string>,
  layerBodies: ReadonlySet<string>,
  diagnostics: AssetPackDiagnostic[],
  sourceUses: Map<string, SourceUse>,
  seenAnimations: Set<string>,
  animationBodies: Map<string, Set<string>>,
): void {
  if (!isRegisteredAnimation(sprite.animation)) {
    diagnostics.push(schemaDiagnostic(
      `${pathPrefix}.sprites[${spriteIndex}].animation`,
      `Unknown animation "${sprite.animation}".`,
      asset.itemId,
    ));
    return;
  }

  if (sprite.variant && !variants.has(sprite.variant)) {
    diagnostics.push(schemaDiagnostic(
      `${pathPrefix}.sprites[${spriteIndex}].variant`,
      `Unknown variant "${sprite.variant}".`,
      asset.itemId,
    ));
  }

  seenAnimations.add(sprite.animation);
  const bodies = animationBodies.get(sprite.animation) ?? new Set<string>();
  sprite.bodyTypes.forEach((bodyType, bodyIndex) => {
    if (!layerBodies.has(bodyType) || !supportedBodies.has(bodyType)) {
      diagnostics.push(schemaDiagnostic(
        `${pathPrefix}.sprites[${spriteIndex}].bodyTypes[${bodyIndex}]`,
        `Unknown body type "${bodyType}" for this sprite.`,
        asset.itemId,
      ));
      return;
    }

    bodies.add(bodyType);
  });
  animationBodies.set(sprite.animation, bodies);

  registerSourceUse(
    sourceUses,
    diagnostics,
    {
      sourcePath: sprite.source,
      geometry: standardAnimationGeometry(sprite.animation),
      path: `${pathPrefix}.sprites[${spriteIndex}].source`,
      assetId: asset.itemId,
      animation: sprite.animation,
    },
  );
}

function validateExtendItem(
  asset: NormalizedExtendItemAsset,
  assetIndex: number,
  options: ValidateAssetPackOptions,
  diagnostics: AssetPackDiagnostic[],
  sourceUses: Map<string, SourceUse>,
): void {
  const item = options.baseline.catalog.byItemId.get(asset.itemId);
  if (!item) {
    diagnostics.push(schemaDiagnostic(
      `$.assets[${assetIndex}].itemId`,
      `Unknown baseline item "${asset.itemId}".`,
      asset.itemId,
    ));
    return;
  }

  const expectedDefinitionDigest = options.baseline.definitionDigests.get(asset.itemId);
  if (expectedDefinitionDigest && expectedDefinitionDigest !== asset.baseDefinitionDigest) {
    diagnostics.push({
      code: 'asset_base_definition_changed',
      severity: 'error',
      message: `Baseline definition digest changed for "${asset.itemId}".`,
      assetId: asset.itemId,
      details: { path: `$.assets[${assetIndex}].baseDefinitionDigest` },
    });
  }

  const expectedCreditDigest = options.baseline.creditDigests.get(asset.itemId);
  if (expectedCreditDigest && expectedCreditDigest !== asset.baseCreditDigest) {
    diagnostics.push({
      code: 'asset_base_credit_changed',
      severity: 'error',
      message: `Baseline credit digest changed for "${asset.itemId}".`,
      assetId: asset.itemId,
      details: { path: `$.assets[${assetIndex}].baseCreditDigest` },
    });
  }

  asset.addAnimations.forEach((animation, animationIndex) => {
    const animationRegistered = isRegisteredAnimation(animation.animation);
    if (!animationRegistered) {
      diagnostics.push(schemaDiagnostic(
        `$.assets[${assetIndex}].addAnimations[${animationIndex}].animation`,
        `Unknown animation "${animation.animation}".`,
        asset.itemId,
      ));
    }

    animation.layers.forEach((layer, layerIndex) => {
      validateExtendLayer(
        item,
        asset,
        animation.animation,
        animationRegistered,
        layer,
        assetIndex,
        animationIndex,
        layerIndex,
        diagnostics,
        sourceUses,
      );
    });
  });
}

function validateExtendLayer(
  item: ItemDefinition,
  asset: NormalizedExtendItemAsset,
  animation: string,
  animationRegistered: boolean,
  layer: NormalizedExtendItemLayer,
  assetIndex: number,
  animationIndex: number,
  layerIndex: number,
  diagnostics: AssetPackDiagnostic[],
  sourceUses: Map<string, SourceUse>,
): void {
  const layerPath = `$.assets[${assetIndex}].addAnimations[${animationIndex}].layers[${layerIndex}]`;
  const baseLayer = item[layer.layer];

  if (!baseLayer) {
    diagnostics.push(schemaDiagnostic(
      `${layerPath}.layer`,
      `Unknown baseline layer "${layer.layer}".`,
      asset.itemId,
    ));
    return;
  }

  const supportedBodies = supportedLayerBodies(baseLayer);
  layer.bodyTypes.forEach((bodyType, bodyIndex) => {
    if (!supportedBodies.has(bodyType)) {
      diagnostics.push(schemaDiagnostic(
        `${layerPath}.bodyTypes[${bodyIndex}]`,
        `Unknown body type "${bodyType}" for baseline layer "${layer.layer}".`,
        asset.itemId,
      ));
    }
  });

  const variants = new Set(item.variants ?? []);
  if (layer.variant && !variants.has(layer.variant)) {
    diagnostics.push(schemaDiagnostic(
      `${layerPath}.variant`,
      `Unknown variant "${layer.variant}" for "${asset.itemId}".`,
      asset.itemId,
    ));
  }

  if (!layer.destination.accepted) {
    diagnostics.push({
      code: 'asset_destination_unaccepted',
      severity: 'error',
      message: `Destination path has not been accepted for "${asset.itemId}".`,
      assetId: asset.itemId,
      sourcePath: layer.source,
      destinationPath: layer.destination.path,
      details: { path: `${layerPath}.destination.accepted` },
    });
  }

  if (extensionDestinationBasePath(layer.destination.path, animation, layer.variant) === undefined) {
    diagnostics.push({
      code: 'asset_pack_schema_invalid',
      severity: 'error',
      message: `Extension destination does not match animation "${animation}" for "${asset.itemId}".`,
      assetId: asset.itemId,
      sourcePath: layer.source,
      destinationPath: layer.destination.path,
      details: { path: `${layerPath}.destination.path` },
    });
  }

  if (layer.destination.evidence === 'audit-inferred') {
    diagnostics.push({
      code: 'asset_path_inferred',
      severity: 'warning',
      message: `Destination path for "${asset.itemId}" was inferred from the animation audit.`,
      assetId: asset.itemId,
      sourcePath: layer.source,
      destinationPath: layer.destination.path,
      subject: warningSubject({
        itemId: asset.itemId,
        animation,
        layer: layer.layer,
        bodyTypes: layer.bodyTypes,
        destinationPath: layer.destination.path,
      }),
      details: { path: `${layerPath}.destination.path` },
    });
  }

  if (animationRegistered) {
    registerSourceUse(
      sourceUses,
      diagnostics,
      {
        sourcePath: layer.source,
        geometry: standardAnimationGeometry(animation),
        path: `${layerPath}.source`,
        assetId: asset.itemId,
        animation,
      },
    );
  }
}

function registerSourceUse(
  sourceUses: Map<string, SourceUse>,
  diagnostics: AssetPackDiagnostic[],
  use: SourceUse,
): void {
  const existing = sourceUses.get(use.sourcePath);
  if (
    existing
    && geometrySignature(existing.geometry) !== geometrySignature(use.geometry)
  ) {
    diagnostics.push({
      code: 'asset_geometry_mismatch',
      severity: 'error',
      message: `Source PNG ${use.sourcePath} is reused with incompatible animation geometry.`,
      assetId: use.assetId,
      sourcePath: use.sourcePath,
      details: {
        path: use.path,
        firstPath: existing.path,
      },
    });
    return;
  }

  if (!existing) {
    sourceUses.set(use.sourcePath, use);
  }
}

function validateRecolors(
  recolor: RawRecolors | undefined,
  path: string,
  assetId: string,
  palettes: PaletteMetadata,
  diagnostics: AssetPackDiagnostic[],
): void {
  collectRecolorEntries(recolor).forEach((entry) => {
    const materialExists = Boolean(palettes.materials[entry.material]);
    if (!materialExists) {
      diagnostics.push(schemaDiagnostic(
        `${path}.material`,
        `Unknown recolor material "${entry.material}".`,
        assetId,
      ));
    }

    entry.palettes.forEach((token, paletteIndex) => {
      const resolved = resolvePaletteToken(token, entry.material);
      if (!palettes.materials[resolved.material]?.palettes[resolved.version]) {
        diagnostics.push(schemaDiagnostic(
          `${path}.palettes[${paletteIndex}]`,
          `Unknown palette token "${token}".`,
          assetId,
        ));
      }
    });
  });
}

function collectRecolorEntries(recolor: RawRecolors | undefined): readonly RecolorConfig[] {
  if (!recolor) return [];
  const entries: RecolorConfig[] = [];
  const multi = recolor as { readonly [key: `color_${number}`]: RecolorConfig | undefined };
  for (let index = 1; index < 10; index += 1) {
    const entry = multi[`color_${index}`];
    if (entry) {
      entries.push(entry);
      continue;
    }
    break;
  }
  return entries.length > 0 ? entries : [recolor as RecolorConfig];
}

interface RecolorEntry {
  readonly config: RecolorConfig;
  readonly path: string;
}

function collectRecolorEntriesWithPaths(
  recolor: RawRecolors | undefined,
  pathValue: string,
): readonly RecolorEntry[] {
  if (!recolor) return [];
  const entries: RecolorEntry[] = [];
  const multi = recolor as {
    readonly [key: `color_${number}`]: RecolorConfig | undefined;
  };
  for (let index = 1; index < 10; index += 1) {
    const config = multi[`color_${index}`];
    if (!config) break;
    entries.push({ config, path: `${pathValue}.color_${index}` });
  }
  return entries.length > 0
    ? entries
    : [{ config: recolor as RecolorConfig, path: pathValue }];
}

function resolvePaletteToken(
  token: string,
  fallbackMaterial: string,
): { material: string; version: string } {
  const parts = token.split('.');
  const first = parts[0] ?? '';
  const second = parts[1];
  if (second) {
    return { material: first, version: second };
  }
  return { material: fallbackMaterial, version: first };
}

function isRegisteredAnimation(animation: string): boolean {
  return Boolean(ANIMATION_CONFIGS[animation]);
}

function supportedLayerBodies(layer: RawLayer): ReadonlySet<BodyType> {
  return new Set(BODY_TYPES.filter((bodyType) => typeof layer[bodyType] === 'string'));
}

function geometryBounds(geometry: AnimationAuditGeometry): { width: number; height: number } {
  const maxColumn = Math.max(
    ...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)),
  );
  return {
    width: (maxColumn + 1) * geometry.frameSize,
    height: geometry.rows.length * geometry.frameSize,
  };
}

function requiredCells(geometry: AnimationAuditGeometry): readonly string[] {
  return geometry.rows.flatMap((row) =>
    row.cells.map((cell) => `${row.sourceRow}:${cell.sourceColumn}`),
  );
}

function optionalCells(geometry: AnimationAuditGeometry): readonly string[] {
  const required = new Set(requiredCells(geometry));
  const maxColumn = Math.max(
    ...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)),
  );
  return geometry.rows.flatMap((row) =>
    Array.from({ length: maxColumn + 1 }, (_, column) => `${row.sourceRow}:${column}`),
  ).filter((cell) => !required.has(cell));
}

function geometrySignature(geometry: AnimationAuditGeometry): string {
  return JSON.stringify(geometry);
}

function collectSourceUses(pack: NormalizedAssetPack): ReadonlyMap<string, readonly SourceUse[]> {
  const uses = new Map<string, SourceUse[]>();

  pack.assets.forEach((asset) => {
    if (asset.kind !== 'new-item') return;

    asset.layers.forEach((layer) => {
      layer.sprites.forEach((sprite) => {
        if (!isRegisteredAnimation(sprite.animation)) return;
        const grouped = uses.get(sprite.source) ?? [];
        grouped.push({
          sourcePath: sprite.source,
          geometry: standardAnimationGeometry(sprite.animation),
          path: '',
          assetId: asset.itemId,
          animation: sprite.animation,
        });
        uses.set(sprite.source, grouped);
      });
    });
  });

  return uses;
}

function normalizedColorRamp(colors: readonly string[]): readonly string[] | undefined {
  if (colors.length === 0) return undefined;
  const normalized: string[] = [];
  for (const color of colors) {
    const match = /^#?([0-9a-f]{6})$/i.exec(color);
    if (!match?.[1]) return undefined;
    normalized.push(`#${match[1].toLowerCase()}`);
  }
  return normalized;
}

function configuredSourceRamp(
  config: RecolorConfig,
  palettes: PaletteMetadata,
): readonly string[] | undefined {
  if (config.source) return normalizedColorRamp(config.source);

  const material = palettes.materials[config.material];
  if (!material) return undefined;
  let base = config.base;
  if (!base) {
    if (!material.default || !material.base) return undefined;
    base = `${material.default}.${material.base}`;
  } else if (!base.includes('.')) {
    if (!material.default) return undefined;
    base = `${material.default}.${base}`;
  }

  const [version, recolor] = base.split('.');
  if (!version || !recolor) return undefined;
  const ramp = material.palettes[version]?.[recolor];
  return ramp ? normalizedColorRamp(ramp) : undefined;
}

function geometryForEveryDeclaredUse(
  uses: readonly SourceUse[],
  width: number,
  height: number,
): AnimationAuditGeometry | undefined {
  const first = uses[0]?.geometry;
  if (!first) return undefined;
  const bounds = geometryBounds(first);
  if (bounds.width !== width || bounds.height !== height) return undefined;
  const signature = geometrySignature(first);
  return uses.every((use) => geometrySignature(use.geometry) === signature)
    ? first
    : undefined;
}

function validateRecolorSourceRamps(
  pack: NormalizedAssetPack,
  palettes: PaletteMetadata,
  inspections: readonly AssetPackSourceInspection[],
): readonly AssetPackDiagnostic[] {
  const diagnostics: AssetPackDiagnostic[] = [];
  const inspectionMap = new Map(inspections.map((inspection) => [
    inspection.sourcePath,
    inspection,
  ]));
  const uses = collectSourceUses(pack);

  pack.assets.forEach((asset, assetIndex) => {
    if (asset.kind !== 'new-item' || !asset.recolor) return;
    const entries = collectRecolorEntriesWithPaths(
      asset.recolor,
      `$.assets[${assetIndex}].recolor`,
    );
    const sourcePaths = [...new Set(asset.layers.flatMap((layer) =>
      layer.sprites.map((sprite) => sprite.source),
    ))].sort((left, right) => left.localeCompare(right));

    for (const sourcePath of sourcePaths) {
      const inspection = inspectionMap.get(sourcePath);
      const sourceUses = uses.get(sourcePath) ?? [];
      if (!inspection?.decoded || inspection.error) continue;
      const geometry = geometryForEveryDeclaredUse(
        sourceUses,
        inspection.decoded.width,
        inspection.decoded.height,
      );
      if (!geometry) continue;
      const presentCells = new Set(inspection.decoded.nonTransparentCells);
      if (requiredCells(geometry).some((cell) => !presentCells.has(cell))) continue;
      const presentColors = new Set(inspection.decoded.paletteColors);

      for (const entry of entries) {
        const requiredColors = configuredSourceRamp(entry.config, palettes);
        if (!requiredColors) continue;
        const missingColors = requiredColors.filter((color) => !presentColors.has(color));
        if (missingColors.length === 0) continue;
        diagnostics.push({
          code: 'asset_pack_schema_invalid',
          severity: 'error',
          message: `Configured recolor source ramp is not present in ${sourcePath}.`,
          assetId: asset.itemId,
          sourcePath,
          details: {
            path: entry.path,
            material: entry.config.material,
            requiredColors,
            missingColors,
          },
        });
      }
    }
  });

  return diagnostics;
}

function warningSubject(
  subject: Readonly<Record<string, string | readonly string[] | undefined>>,
): Readonly<Record<string, string | readonly string[]>> {
  const entries = Object.entries(subject)
    .filter((entry): entry is [string, string | readonly string[]] => entry[1] !== undefined)
    .map<[string, string | readonly string[]]>(([key, value]) => [
      key,
      Array.isArray(value) ? [...value] : value,
    ]);

  return Object.fromEntries(
    entries.sort(([left], [right]) => left.localeCompare(right)),
  );
}

function buildAcknowledgementRecords(
  diagnostics: readonly AssetPackDiagnostic[],
  contentDigest: string,
): readonly AssetPackAcknowledgement[] {
  const records = new Map<string, AssetPackAcknowledgement>();
  diagnostics.forEach((diagnostic) => {
    if (diagnostic.severity !== 'warning' || !diagnostic.subject) return;
    const key = `${diagnostic.code}\u0000${JSON.stringify(diagnostic.subject)}`;
    records.set(key, {
      code: diagnostic.code,
      subject: diagnostic.subject,
      contentDigest,
      reason: '',
    });
  });
  return [...records.values()].sort((left, right) =>
    acknowledgementKey(left).localeCompare(acknowledgementKey(right)),
  );
}

function acknowledgementKey(record: AssetPackAcknowledgement): string {
  return `${record.code}\u0000${JSON.stringify(record.subject)}\u0000${record.contentDigest}`;
}

function schemaDiagnostic(
  path: string,
  message: string,
  assetId?: string,
): AssetPackDiagnostic {
  return {
    code: 'asset_pack_schema_invalid',
    severity: 'error',
    message,
    ...(assetId ? { assetId } : {}),
    details: { path },
  };
}

function sortDiagnostics(diagnostics: readonly AssetPackDiagnostic[]): readonly AssetPackDiagnostic[] {
  return [...diagnostics].sort((left, right) => diagnosticKey(left).localeCompare(diagnosticKey(right)));
}

function diagnosticKey(diagnostic: AssetPackDiagnostic): string {
  const path = typeof diagnostic.details?.path === 'string' ? diagnostic.details.path : '\uffff';
  return [
    path,
    diagnostic.code,
    diagnostic.sourcePath ?? '',
    diagnostic.destinationPath ?? '',
    JSON.stringify(diagnostic.subject ?? {}),
    diagnostic.message,
  ].join('\u0000');
}
