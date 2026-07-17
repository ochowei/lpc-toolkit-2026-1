import type {
  SelectionDocumentImportContext,
  Selections,
} from '@lpc-toolkit/core';
import {
  importCharacterDocument,
  type TextJsonFile,
} from './character-document';

export type CharacterDocumentImportOutcome =
  | 'applied'
  | 'rejected'
  | 'failed'
  | 'stale';

export type ReadCharacterDocumentSelections = (
  file: TextJsonFile,
  context: SelectionDocumentImportContext,
) => Promise<Selections>;

export interface LatestCharacterDocumentImportRequest {
  readonly file: TextJsonFile;
  readonly context: SelectionDocumentImportContext;
  readonly apply: (selections: Selections) => boolean | void;
  readonly onApplied: () => void;
  readonly onRejected: () => void;
  readonly onFailed: (message: string) => void;
}

export type LatestCharacterDocumentImporter = (
  request: LatestCharacterDocumentImportRequest,
) => Promise<CharacterDocumentImportOutcome>;

const readCharacterDocumentSelections: ReadCharacterDocumentSelections = async (
  file,
  context,
) => {
  const imported = await importCharacterDocument(file, context);
  return imported.parsed.selections;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Build an import coordinator where only the latest started request may apply
 * selections or publish an outcome to the UI.
 */
export function createLatestCharacterDocumentImporter(
  read: ReadCharacterDocumentSelections = readCharacterDocumentSelections,
): LatestCharacterDocumentImporter {
  let latestRequestId = 0;

  return async (request) => {
    const requestId = ++latestRequestId;
    let selections: Selections;

    try {
      selections = await read(request.file, request.context);
    } catch (error) {
      if (requestId !== latestRequestId) return 'stale';
      request.onFailed(errorMessage(error));
      return 'failed';
    }

    if (requestId !== latestRequestId) return 'stale';

    const accepted = request.apply(selections);
    if (accepted === false) {
      request.onRejected();
      return 'rejected';
    }

    request.onApplied();
    return 'applied';
  };
}
