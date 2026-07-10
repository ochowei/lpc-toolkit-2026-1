import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ParsedArgs } from './args.js';
import { flagString } from './args.js';
import { loadCatalogFromRoots, loadPalettesFromRoot } from './loaders.js';
import { commandError, commandOk, type CliResponse } from './response.js';
import type { RuntimeAssets } from './runtime-assets.js';
import { parseSelectionJson } from './selection.js';
import { validateSelections } from './validation.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function runSelectionCommand(
  parsed: ParsedArgs,
  runtime: RuntimeAssets,
): CliResponse<unknown> {
  if (parsed.command[1] !== 'validate') {
    return commandError(parsed.command.join(' '), {
      code: 'unknown_command',
      message: `Unknown selection command: ${parsed.command.join(' ')}`,
    });
  }
  const selectionPath = flagString(parsed.flags, 'selection');
  if (!selectionPath) {
    return commandError('selection validate', {
      code: 'missing_argument',
      message: '--selection is required.',
    });
  }

  const context = runtime.context;
  const catalog = loadCatalogFromRoots(
    context.sheetDefinitionsRoot,
    context.customSheetDefinitionsRoot,
  );
  const palettes = loadPalettesFromRoot(context.paletteDefinitionsRoot);
  let selectionSource: string;
  try {
    selectionSource = readFileSync(path.resolve(context.repoRoot, selectionPath), 'utf8');
  } catch (error) {
    return commandError('selection validate', {
      code: 'selection_read_failed',
      message: errorMessage(error),
      path: selectionPath,
    });
  }

  let parsedSelection;
  try {
    parsedSelection = parseSelectionJson(JSON.parse(selectionSource) as unknown);
  } catch (error) {
    return commandError('selection validate', {
      code: 'invalid_selection_json',
      message: errorMessage(error),
      path: selectionPath,
    });
  }

  const validation = validateSelections(parsedSelection.selections, {
    catalog: catalog.catalog,
    palettes: palettes.palettes,
    pathExists: (spritePath) => runtime.store.has(spritePath),
  });

  const warnings = [...catalog.warnings, ...palettes.warnings, ...validation.warnings];
  if (!validation.ok) {
    return {
      ok: false,
      command: 'selection validate',
      data: null,
      warnings,
      errors: validation.errors,
    };
  }
  return commandOk('selection validate', { valid: true }, warnings);
}
