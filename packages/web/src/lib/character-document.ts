import {
  importSelectionDocument,
  selectionJsonFromCore,
  type ImportedSelectionDocument,
  type SelectionDocumentImportContext,
  type Selections,
} from '@lpc-toolkit/core';
import { downloadBlob } from './download';

export interface TextJsonFile {
  readonly text: () => Promise<string>;
}

export interface SaveCharacterDocumentOptions {
  readonly download?: (blob: Blob, filename: string) => void;
}

export function saveCharacterDocument(
  selections: Selections,
  options: SaveCharacterDocumentOptions = {},
): void {
  const text = `${JSON.stringify(selectionJsonFromCore(selections), null, 2)}\n`;
  const blob = new Blob([text], { type: 'application/json' });
  (options.download ?? downloadBlob)(blob, 'character.selection.json');
}

export async function importCharacterDocument(
  file: TextJsonFile,
  context: SelectionDocumentImportContext,
): Promise<ImportedSelectionDocument> {
  const value = JSON.parse(await file.text()) as unknown;
  return importSelectionDocument(value, context);
}
