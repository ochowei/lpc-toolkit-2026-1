import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  decodeSelectionToken,
  encodeSelectionToken,
  parseHash,
  type Catalog,
  type PaletteMetadata,
} from '@lpc-toolkit/core';
import { flagString, type ParsedArgs } from './args.js';
import { createRuntimeContext } from './context.js';
import { loadCatalogFromRoots, loadPalettesFromRoot } from './loaders.js';
import { commandError, commandOk, type CliResponse } from './response.js';
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

export function decodeTokenToSelectionJson(
  tokenOrHash: string,
  catalog: Catalog,
  palettes?: PaletteMetadata,
): SelectionJson {
  const decoded = tokenOrHash.startsWith('v1.')
    ? decodeSelectionToken(tokenOrHash, catalog, palettes).selections
    : parseHash(tokenOrHash, catalog, palettes).selections;
  return selectionJsonFromCore(decoded);
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
    try {
      selection = decodeTokenToSelectionJson(token, catalog.catalog, palettes.palettes);
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
          [...catalog.warnings, ...palettes.warnings],
        );
      }
    }

    return commandOk('token decode', { selection, out: out ?? null }, [
      ...catalog.warnings,
      ...palettes.warnings,
    ]);
  }

  return commandError(parsed.command.join(' '), {
    code: 'unknown_command',
    message: `Unknown token command: ${parsed.command.join(' ')}`,
  });
}
