import { useRef } from 'react';
import {
  createLatestCharacterDocumentImporter,
  type LatestCharacterDocumentImporter,
} from '../lib/character-document-import';

/** Keep one latest-only character-document import coordinator per mounted UI. */
export function useLatestCharacterDocumentImporter(): LatestCharacterDocumentImporter {
  const importerRef = useRef<LatestCharacterDocumentImporter | null>(null);
  if (importerRef.current === null) {
    importerRef.current = createLatestCharacterDocumentImporter();
  }
  return importerRef.current;
}
