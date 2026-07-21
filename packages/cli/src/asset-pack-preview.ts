import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  BODY_TYPES,
  creditsToCsv,
  standardAnimationGeometry,
  type AnimationName,
  type BodyType,
  type CreditEntry,
  type CreditsManifest,
  type NormalizedAssetPackAsset,
  type SelectionJson,
} from '@lpc-toolkit/core';
import type { AssetWorkspace } from './asset-workspace.js';
import {
  prepareLinkedAssetPackDesiredState,
  type AssetPackSyncDiagnostic,
  type LinkedAssetPackDesiredState,
} from './asset-pack-sync.js';
import { loadCatalogFromRoots, loadPalettesFromRoot } from './loaders.js';
import { materializePreset } from './preset-commands.js';
import {
  previewIssue,
  renderCharacterPreview,
  type PreviewArtifact,
} from './preview.js';
import type { CliIssue } from './response.js';
import {
  createOverlayRuntimeAssets,
  type RuntimeAssets,
} from './runtime-assets.js';
import {
  loadSelectionDocumentContext,
  readSelectionDocumentFile,
} from './selection-document-file.js';

export interface AssetPackPreviewResult {
  readonly packId: string;
  readonly assetId: string;
  readonly artifacts: readonly PreviewArtifact[];
  readonly warnings: readonly CliIssue[];
  readonly metadataPath: string;
  readonly outDir: string;
}

export class AssetPackPreviewError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly path?: string,
    readonly details?: Readonly<Record<string, unknown>>,
    readonly diagnostics: readonly AssetPackSyncDiagnostic[] = [],
  ) {
    super(message);
    this.name = 'AssetPackPreviewError';
  }
}

interface PreviewTarget {
  readonly assetId: string;
  readonly itemId: string;
}

function previewFailure(
  code: string,
  message: string,
  issuePath?: string,
  details?: Readonly<Record<string, unknown>>,
): AssetPackPreviewError {
  return new AssetPackPreviewError(code, message, issuePath, details);
}

function desiredStateFailure(
  diagnostics: readonly AssetPackSyncDiagnostic[],
): AssetPackPreviewError {
  const first: AssetPackSyncDiagnostic = diagnostics
    .find((diagnostic) => diagnostic.severity === 'error')
    ?? diagnostics[0]
    ?? {
      code: 'asset_publish_failed',
      message: 'Asset-pack preview preparation failed.',
      severity: 'error',
    };
  return new AssetPackPreviewError(
    first.code,
    first.message,
    first.path,
    first.details,
    diagnostics,
  );
}

function targetIdentity(asset: NormalizedAssetPackAsset): PreviewTarget {
  if (asset.kind === 'new-item') {
    return { assetId: asset.localId, itemId: asset.itemId };
  }
  return { assetId: asset.itemId, itemId: asset.itemId };
}

function selectTarget(
  state: LinkedAssetPackDesiredState,
  requestedAssetId: string | undefined,
): PreviewTarget {
  const targets = state.requested.loaded.pack.assets
    .map(targetIdentity)
    .sort((left, right) => left.assetId.localeCompare(right.assetId));
  const target = requestedAssetId === undefined
    ? targets[0]
    : targets.find((candidate) =>
      candidate.assetId === requestedAssetId || candidate.itemId === requestedAssetId,
    );
  if (!target) {
    throw previewFailure(
      'asset_preview_asset_not_found',
      requestedAssetId === undefined
        ? 'The asset pack has no previewable assets.'
        : `The asset pack does not contain asset "${requestedAssetId}".`,
      requestedAssetId,
      { available: targets.map((candidate) => candidate.assetId) },
    );
  }
  return target;
}

function resolveBodyType(requested: string | undefined, fallback: string): BodyType {
  const bodyType = requested ?? fallback;
  if (!(BODY_TYPES as readonly string[]).includes(bodyType)) {
    throw previewFailure(
      'body_type_invalid',
      `Unknown body type: ${bodyType}`,
      bodyType,
      { available: BODY_TYPES },
    );
  }
  return bodyType as BodyType;
}

function uniqueLicenses(credits: readonly CreditEntry[]): CreditsManifest['licenses'] {
  return [...new Set(credits.flatMap((credit) => credit.licenses))]
    .sort((left, right) => left.localeCompare(right)) as CreditsManifest['licenses'];
}

function materializeDesiredState(
  state: LinkedAssetPackDesiredState,
  overlayRoot: string,
): void {
  mkdirSync(overlayRoot, { recursive: true });
  for (const definition of state.compilePlan.definitions) {
    const destination = path.join(overlayRoot, definition.logicalPath);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, `${JSON.stringify(definition.definition, null, 2)}\n`);
  }

  const packRoots = new Map(
    state.packs.map((pack) => [pack.loaded.pack.id, pack.sourceDirectory] as const),
  );
  for (const sprite of state.compilePlan.sprites) {
    const packRoot = packRoots.get(sprite.packId);
    if (!packRoot) {
      throw previewFailure(
        'asset_publish_failed',
        `No linked source directory found for compiled sprite owner ${sprite.packId}.`,
        sprite.destinationPath,
      );
    }
    const destination = path.join(overlayRoot, sprite.destinationPath);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(path.join(packRoot, sprite.sourcePath)));
  }

  const manifest: CreditsManifest = {
    entries: state.compilePlan.credits,
    resolvedPaths: state.compilePlan.credits.map((credit) => `spritesheets/${credit.file}`),
    licenses: uniqueLicenses(state.compilePlan.credits),
  };
  writeFileSync(path.join(overlayRoot, 'CREDITS.csv'), creditsToCsv(manifest, 'walk'));
}

function targetDefinition(state: LinkedAssetPackDesiredState, target: PreviewTarget) {
  const compiled = state.compilePlan.definitions.find(
    (definition) => definition.assetId === target.itemId,
  );
  if (!compiled) {
    throw previewFailure(
      'asset_preview_asset_not_found',
      `The compiled preview definition is missing for asset "${target.assetId}".`,
      target.assetId,
    );
  }
  return compiled.definition;
}

function selectAnimation(
  requested: string | undefined,
  available: readonly string[],
): AnimationName {
  const animation = requested ?? 'walk';
  if (!available.includes(animation)) {
    throw previewIssue('preview_animation_unavailable', animation, { available });
  }
  return animation as AnimationName;
}

function replaceTargetSelection(
  selection: SelectionJson,
  bodyType: BodyType,
  typeName: string,
  itemName: string,
): SelectionJson {
  return {
    ...selection,
    bodyType,
    items: {
      ...selection.items,
      [typeName]: { name: itemName },
    },
  };
}

export async function previewAssetPack(options: {
  readonly packDirectory: string;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly assetId?: string;
  readonly animation?: string;
  readonly bodyType?: string;
  readonly characterPath?: string;
}): Promise<AssetPackPreviewResult> {
  const desiredState = await prepareLinkedAssetPackDesiredState(options);
  if (!desiredState.ok) throw desiredStateFailure(desiredState.diagnostics);

  const packRoot = desiredState.requested.sourceDirectory;
  const overlayRoot = path.join(
    options.workspace.stateRoot,
    'validation',
    desiredState.requested.loaded.contentDigest,
  );

  rmSync(overlayRoot, { recursive: true, force: true });
  try {
    const target = selectTarget(desiredState, options.assetId);
    const definition = targetDefinition(desiredState, target);
    const animation = selectAnimation(options.animation, definition.animations);
    materializeDesiredState(desiredState, overlayRoot);
    const logicalPaths = [
      ...desiredState.compilePlan.definitions.map((definitionEntry) => definitionEntry.logicalPath),
      ...desiredState.compilePlan.sprites.map((sprite) => sprite.destinationPath),
    ];
    const overlayRuntime = createOverlayRuntimeAssets({
      runtime: options.runtime,
      customSheetDefinitionsRoot: path.join(overlayRoot, 'sheet_definitions'),
      overlayRoot,
      logicalPaths,
    });
    const catalog = loadCatalogFromRoots(
      overlayRuntime.context.sheetDefinitionsRoot,
      overlayRuntime.context.customSheetDefinitionsRoot,
    );
    const palettes = loadPalettesFromRoot(overlayRuntime.context.paletteDefinitionsRoot);

    let selection: SelectionJson;
    let selectionPath: string;
    if (options.characterPath !== undefined) {
      const documentContext = loadSelectionDocumentContext(overlayRuntime);
      const loaded = readSelectionDocumentFile(
        options.workspace.root,
        options.characterPath,
        documentContext.importContext,
      );
      selection = loaded.selection;
      selectionPath = loaded.path;
    } else {
      const requestedBody = resolveBodyType(options.bodyType, 'male');
      selection = materializePreset('farmer', {
        catalog: catalog.catalog,
        palettes: palettes.palettes,
        bodyType: requestedBody,
        overridePresetBodyType: true,
      });
      selection = { ...selection, name: target.assetId };
      selectionPath = path.join(packRoot, 'asset-pack.json');
    }

    const bodyType = resolveBodyType(options.bodyType, selection.bodyType);
    const finalSelection = replaceTargetSelection(
      selection,
      bodyType,
      definition.type_name,
      definition.name,
    );
    const rendered = await renderCharacterPreview({
      runtime: overlayRuntime,
      cwd: options.workspace.root,
      selectionPath,
      selectionJson: finalSelection,
      outDir: path.join(packRoot, 'previews', target.assetId),
      animation,
      direction: standardAnimationGeometry(animation).rows.length === 1 ? 'up' : 'down',
    });

    return {
      packId: desiredState.requested.loaded.pack.id,
      assetId: target.assetId,
      artifacts: rendered.artifacts,
      warnings: [...desiredState.warnings, ...rendered.warnings],
      metadataPath: rendered.metadataPath,
      outDir: rendered.outDir,
    };
  } finally {
    rmSync(overlayRoot, { recursive: true, force: true });
  }
}
