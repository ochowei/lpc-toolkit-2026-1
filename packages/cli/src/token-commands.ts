import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  decodeSelectionToken,
  encodeSelectionToken,
  parseHash,
  type Catalog,
  type HashWarning,
  type PaletteMetadata,
  type ParseHashResult,
} from '@lpc-toolkit/core';
import { flagString, type ParsedArgs } from './args.js';
import { createRuntimeContext } from './context.js';
import { loadCatalogFromRoots, loadPalettesFromRoot } from './loaders.js';
import { commandError, commandOk, type CliIssue, type CliResponse } from './response.js';
import {
  parseSelectionJson,
  selectionJsonFromCore,
  type SelectionJson,
} from './selection.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function encodeSelectionJsonToToken(selectionJson: SelectionJson): string {
  return encodeSelectionToken(parseSelectionJson(selectionJson).selections);
}

function tokenWarningsToCliIssues(warnings: readonly HashWarning[]): readonly CliIssue[] {
  return warnings.map((warning) => ({
    code: `token_warning_${warning.reason}`,
    message: `Token ignored ${warning.key}=${warning.value}: ${warning.reason}.`,
    path: warning.key,
  }));
}

function decodeTokenOrHash(
  tokenOrHash: string,
  catalog: Catalog,
  palettes?: PaletteMetadata,
): ParseHashResult {
  const trimmed = tokenOrHash.trim();
  return trimmed.startsWith('v1.')
    ? decodeSelectionToken(trimmed, catalog, palettes)
    : parseHash(trimmed, catalog, palettes);
}

export function decodeTokenToSelectionJsonWithWarnings(
  tokenOrHash: string,
  catalog: Catalog,
  palettes?: PaletteMetadata,
): { readonly selection: SelectionJson; readonly warnings: readonly CliIssue[] } {
  const decoded = decodeTokenOrHash(tokenOrHash, catalog, palettes);
  return {
    selection: selectionJsonFromCore(decoded.selections),
    warnings: tokenWarningsToCliIssues(decoded.warnings),
  };
}

export function decodeTokenToSelectionJson(
  tokenOrHash: string,
  catalog: Catalog,
  palettes?: PaletteMetadata,
): SelectionJson {
  return decodeTokenToSelectionJsonWithWarnings(tokenOrHash, catalog, palettes).selection;
}

export function runTokenCommand(
  parsed: ParsedArgs,
  cwd: string,
): CliResponse<unknown> {
  if (parsed.command[1] === 'encode') {
    const selectionPath = flagString(parsed.flags, 'selection');
    if (!selectionPath) {
      return commandError('token encode', {
        code: 'missing_argument',
        message: '--selection is required.',
      });
    }

    let selectionJson: ReturnType<typeof parseSelectionJson>;
    try {
      const selectionSource = readFileSync(path.resolve(cwd, selectionPath), 'utf8');
      selectionJson = parseSelectionJson(JSON.parse(selectionSource) as unknown);
    } catch (error) {
      return commandError('token encode', {
        code: 'invalid_selection_json',
        message: errorMessage(error),
        path: selectionPath,
      });
    }

    return commandOk('token encode', {
      token: encodeSelectionToken(selectionJson.selections),
    });
  }

  if (parsed.command[1] === 'decode') {
    const token = flagString(parsed.flags, 'token');
    if (!token) {
      return commandError('token decode', {
        code: 'missing_argument',
        message: '--token is required.',
      });
    }

    const context = createRuntimeContext({ cwd });
    const catalog = loadCatalogFromRoots(
      context.sheetDefinitionsRoot,
      context.customSheetDefinitionsRoot,
    );
    const palettes = loadPalettesFromRoot(context.paletteDefinitionsRoot);
    let selection: SelectionJson;
    let tokenWarnings: readonly CliIssue[] = [];
    try {
      const decoded = decodeTokenToSelectionJsonWithWarnings(
        token,
        catalog.catalog,
        palettes.palettes,
      );
      selection = decoded.selection;
      tokenWarnings = decoded.warnings;
    } catch (error) {
      return commandError(
        'token decode',
        {
          code: 'invalid_token',
          message: errorMessage(error),
        },
        [...catalog.warnings, ...palettes.warnings],
      );
    }

    const out = flagString(parsed.flags, 'out');
    if (out) {
      try {
        writeFileSync(path.resolve(cwd, out), `${JSON.stringify(selection, null, 2)}\n`);
      } catch (error) {
        return commandError(
          'token decode',
          {
            code: 'selection_write_failed',
            message: errorMessage(error),
            path: out,
          },
          [...catalog.warnings, ...palettes.warnings, ...tokenWarnings],
        );
      }
    }

    return commandOk('token decode', { selection, out: out ?? null }, [
      ...catalog.warnings,
      ...palettes.warnings,
      ...tokenWarnings,
    ]);
  }

  return commandError(parsed.command.join(' '), {
    code: 'unknown_command',
    message: `Unknown token command: ${parsed.command.join(' ')}`,
  });
}
