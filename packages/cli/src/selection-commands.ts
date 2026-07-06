import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ParsedArgs } from './args.js';
import { flagString } from './args.js';
import { createRuntimeContext } from './context.js';
import { loadCatalogFromRoots, loadPalettesFromRoot } from './loaders.js';
import { commandError, commandOk, type CliResponse } from './response.js';
import { parseSelectionJson } from './selection.js';
import { validateSelections } from './validation.js';

export function runSelectionCommand(
  parsed: ParsedArgs,
  cwd: string,
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

  const context = createRuntimeContext({ cwd });
  const catalog = loadCatalogFromRoots(
    context.sheetDefinitionsRoot,
    context.customSheetDefinitionsRoot,
  );
  const palettes = loadPalettesFromRoot(context.paletteDefinitionsRoot);
  const parsedSelection = parseSelectionJson(
    JSON.parse(readFileSync(path.resolve(cwd, selectionPath), 'utf8')) as unknown,
  );
  const validation = validateSelections(parsedSelection.selections, {
    catalog: catalog.catalog,
    palettes: palettes.palettes,
    pathExists: (spritePath) => existsSync(path.join(context.spritesheetsBaseUrl, spritePath)),
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
