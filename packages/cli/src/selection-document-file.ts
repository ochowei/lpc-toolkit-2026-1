import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  SelectionDocumentError,
  importSelectionDocument,
  type ImportedSelectionDocument,
  type SelectionDocumentImportContext,
} from '@lpc-toolkit/core';
import type { CliIssue } from './response.js';
import {
  loadRuntimeCatalog,
  loadRuntimePalettes,
  type RuntimeAssets,
} from './runtime-assets.js';

export interface LoadedSelectionDocument extends ImportedSelectionDocument {
  readonly path: string;
}

export interface LoadedSelectionDocumentContext {
  readonly importContext: SelectionDocumentImportContext;
  readonly warnings: readonly CliIssue[];
}

export function loadSelectionDocumentContext(
  runtime: RuntimeAssets,
): LoadedSelectionDocumentContext {
  const catalog = loadRuntimeCatalog(runtime);
  const palettes = loadRuntimePalettes(runtime);
  return {
    importContext: { catalog: catalog.catalog, palettes: palettes.palettes },
    warnings: [...catalog.warnings, ...palettes.warnings],
  };
}

export function readSelectionDocumentFile(
  cwd: string,
  selectionPath: string,
  context: SelectionDocumentImportContext,
): LoadedSelectionDocument {
  const resolvedPath = path.resolve(cwd, selectionPath);
  const text = readFileSync(resolvedPath, 'utf8');
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new SelectionDocumentError(
      'invalid_selection_json',
      error instanceof Error ? error.message : String(error),
      selectionPath,
    );
  }
  return { path: resolvedPath, ...importSelectionDocument(value, context) };
}
