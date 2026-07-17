import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  SelectionDocumentError,
  decodeSelectionToken,
  encodeSelectionToken,
  parseHash,
  parseSelectionJson,
  selectionJsonFromCore,
  type Catalog,
  type HashWarning,
  type PaletteMetadata,
  type ParseHashResult,
  type SelectionJson,
} from '@lpc-toolkit/core';
import { flagString, type ParsedArgs } from './args.js';
import { createRuntimeContext } from './context.js';
import { loadCatalogFromRoots, loadPalettesFromRoot } from './loaders.js';
import { commandError, commandOk, type CliIssue, type CliResponse } from './response.js';
import type { RuntimeAssets } from './runtime-assets.js';
import {
  loadSelectionDocumentContext,
  readSelectionDocumentFile,
  type LoadedSelectionDocument,
} from './selection-document-file.js';
import {
  loadBundledTokenDecodeData,
  type TokenDecodeData,
} from './token-decode-metadata.js';

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

function loadTokenDecodeData(cwd: string): TokenDecodeData {
  const context = createRuntimeContext({ cwd });
  if (!existsSync(context.sheetDefinitionsRoot)) {
    return loadBundledTokenDecodeData();
  }

  const catalog = loadCatalogFromRoots(
    context.sheetDefinitionsRoot,
    context.customSheetDefinitionsRoot,
  );
  const palettes = loadPalettesFromRoot(context.paletteDefinitionsRoot);
  return {
    catalog: catalog.catalog,
    palettes: palettes.palettes,
    warnings: [...catalog.warnings, ...palettes.warnings],
  };
}

export function runTokenCommand(
  parsed: ParsedArgs,
  cwd: string,
  runtime?: RuntimeAssets,
): CliResponse<unknown> {
  if (parsed.command[1] === 'encode') {
    const selectionPath = flagString(parsed.flags, 'selection');
    if (!selectionPath) {
      return commandError('token encode', {
        code: 'missing_argument',
        message: '--selection is required.',
      });
    }

    if (!runtime) {
      return commandError('token encode', {
        code: 'asset_runtime_required',
        message: 'Token encoding requires runtime assets.',
      });
    }

    const documentContext = loadSelectionDocumentContext(runtime);
    let loaded: LoadedSelectionDocument;
    try {
      loaded = readSelectionDocumentFile(cwd, selectionPath, documentContext.importContext);
    } catch (error) {
      if (error instanceof SelectionDocumentError) {
        return commandError(
          'token encode',
          {
            code: error.code,
            message: error.message,
            ...(error.path === undefined ? {} : { path: error.path }),
          },
          documentContext.warnings,
        );
      }
      return commandError('token encode', {
        code: 'invalid_selection_json',
        message: errorMessage(error),
        path: selectionPath,
      }, documentContext.warnings);
    }

    return commandOk('token encode', {
      token: encodeSelectionToken(loaded.parsed.selections),
    }, documentContext.warnings);
  }

  if (parsed.command[1] === 'decode') {
    const token = flagString(parsed.flags, 'token');
    if (!token) {
      return commandError('token decode', {
        code: 'missing_argument',
        message: '--token is required.',
      });
    }

    let decodeData: TokenDecodeData;
    let decodeWarnings: readonly CliIssue[] = [];
    let selection: SelectionJson;
    let tokenWarnings: readonly CliIssue[] = [];
    try {
      decodeData = loadTokenDecodeData(cwd);
      decodeWarnings = decodeData.warnings;
      const decoded = decodeTokenToSelectionJsonWithWarnings(
        token,
        decodeData.catalog,
        decodeData.palettes,
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
        decodeWarnings,
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
          [...decodeData.warnings, ...tokenWarnings],
        );
      }
    }

    return commandOk('token decode', { selection, out: out ?? null }, [
      ...decodeData.warnings,
      ...tokenWarnings,
    ]);
  }

  return commandError(parsed.command.join(' '), {
    code: 'unknown_command',
    message: `Unknown token command: ${parsed.command.join(' ')}`,
  });
}
