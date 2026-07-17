import {
  composeSelections,
  makeResolvePalette,
  parseSelectionJson,
  type CanvasAdapter,
  type Catalog,
  type ComposedSheet,
  type PaletteMetadata,
  type ParsedSelectionJson,
  type SelectionJson,
} from '@lpc-toolkit/core';
import { AssetStoreError } from './asset-store.js';
import { loadCatalogFromRoots, loadPalettesFromRoot } from './loaders.js';
import { createNodeCanvasAdapter } from './node-canvas-adapter.js';
import type { CliIssue } from './response.js';
import type { RuntimeAssets } from './runtime-assets.js';
import { validateSelections } from './validation.js';

export interface ComposeSelectionOptions {
  readonly runtime: RuntimeAssets;
  readonly selectionJson: SelectionJson;
  readonly allowPartial: boolean;
}

export interface ComposedSelectionOutput {
  readonly sheet: ComposedSheet;
  readonly adapter: CanvasAdapter;
  readonly warnings: readonly CliIssue[];
  readonly parsed: ParsedSelectionJson;
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly validationErrors: readonly CliIssue[];
}

export class SelectionOutputError extends Error {
  readonly code = 'selection_output_invalid';

  constructor(readonly issues: readonly CliIssue[]) {
    super(issues.map((issue) => issue.message).join('\n'));
    this.name = 'SelectionOutputError';
  }
}

export async function composeSelectionForOutput(
  options: ComposeSelectionOptions,
): Promise<ComposedSelectionOutput> {
  const catalog = loadCatalogFromRoots(
    options.runtime.context.sheetDefinitionsRoot,
    options.runtime.context.customSheetDefinitionsRoot,
  );
  const palettes = loadPalettesFromRoot(options.runtime.context.paletteDefinitionsRoot);
  const parsed = parseSelectionJson(options.selectionJson);
  const validation = validateSelections(parsed.selections, {
    catalog: catalog.catalog,
    palettes: palettes.palettes,
    pathExists: (spritePath) => options.runtime.store.has(spritePath),
  });
  if (!validation.ok && !options.allowPartial) {
    throw new SelectionOutputError(validation.errors);
  }

  const recolorWarnings: CliIssue[] = [];
  const resolvePalette = makeResolvePalette(
    catalog.catalog,
    palettes.palettes,
    parsed.selections,
    {
      onWarn: (message) => recolorWarnings.push({ code: 'recolor_warning', message }),
    },
  );
  const adapter = createNodeCanvasAdapter({ assetStore: options.runtime.store });
  const sheet = await composeSelections(parsed.selections, {
    catalog: catalog.catalog,
    adapter,
    spritesheetsBaseUrl: options.runtime.store.baseUrl,
    resolvePalette,
    onImageLoadError: (error) => {
      if (!options.allowPartial && error instanceof AssetStoreError) throw error;
    },
  });
  const warnings: CliIssue[] = [
    ...catalog.warnings,
    ...palettes.warnings,
    ...validation.warnings,
    ...(options.allowPartial ? validation.errors : []),
    ...recolorWarnings,
    ...(sheet.missingPaths ?? []).map((missingPath) => ({
      code: 'missing_sprite_path',
      message: 'Composed sheet skipped a missing sprite path.',
      path: missingPath,
    })),
  ];
  return {
    sheet,
    adapter,
    warnings,
    parsed,
    catalog: catalog.catalog,
    palettes: palettes.palettes,
    validationErrors: validation.errors,
  };
}
