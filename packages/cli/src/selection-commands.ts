import { SelectionDocumentError } from '@lpc-toolkit/core';
import type { ParsedArgs } from './args.js';
import { flagString } from './args.js';
import { commandError, commandOk, type CliResponse } from './response.js';
import type { RuntimeAssets } from './runtime-assets.js';
import {
  loadSelectionDocumentContext,
  readSelectionDocumentFile,
  type LoadedSelectionDocument,
} from './selection-document-file.js';
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

  const documentContext = loadSelectionDocumentContext(runtime);
  let loaded: LoadedSelectionDocument;
  try {
    loaded = readSelectionDocumentFile(
      runtime.context.repoRoot,
      selectionPath,
      documentContext.importContext,
    );
  } catch (error) {
    if (error instanceof SelectionDocumentError) {
      return commandError(
        'selection validate',
        {
          code: error.code,
          message: error.message,
          ...(error.path === undefined ? {} : { path: error.path }),
        },
        documentContext.warnings,
      );
    }
    return commandError('selection validate', {
      code: 'selection_read_failed',
      message: errorMessage(error),
      path: selectionPath,
    }, documentContext.warnings);
  }

  const validation = validateSelections(loaded.parsed.selections, {
    catalog: documentContext.importContext.catalog,
    palettes: documentContext.importContext.palettes,
    pathExists: (spritePath) => runtime.store.has(spritePath),
  });

  const warnings = [...documentContext.warnings, ...validation.warnings];
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
