import {
  creditsToCsv,
  creditsToTxt,
  type CanvasAdapter,
  type Catalog,
  type ComposedSheet,
  type ItemDefinition,
  type Selections,
} from '@lpc-toolkit/core';
import { createBrowserCanvasAdapter } from '../adapter/browser-canvas-adapter';
import { downloadBlob } from './download';
import type { CustomOverlay } from './custom-overlay';
import {
  assertExportableCredits,
  exportSpritesheetBundle,
} from './spritesheet-export';
import {
  exportByAnimationZip,
  exportByAnimItemZip,
  exportByFrameZip,
  exportByItemZip,
  zipExportTimestamp,
  zipName,
  type ExportContext,
  type ZipExportKind,
} from './zip-export';

export type CharacterExportKind =
  | 'bundle'
  | 'creditsTxt'
  | 'creditsCsv'
  | ZipExportKind;

/** All composition data required to assemble one downloadable artifact. */
export interface CharacterExportInput {
  readonly sheet: ComposedSheet;
  readonly selections: Selections;
  readonly catalog: Catalog;
  readonly anim: string;
  readonly composeSingleItem: (selections: Selections) => Promise<ComposedSheet>;
  readonly composeSingleItemLayer: (
    selections: Selections,
    layerNumber: number,
  ) => Promise<ComposedSheet>;
  readonly customOverlay: CustomOverlay | null;
  readonly itemLabel: (item: ItemDefinition) => string;
}

type ZipExporter = (context: ExportContext) => Promise<Blob>;

/** Test seams for browser effects and artifact exporters. */
export interface CharacterExportOptions {
  readonly createAdapter?: () => CanvasAdapter;
  readonly download?: (blob: Blob, filename: string) => void;
  readonly timestamp?: () => string;
  readonly zipExporters?: Readonly<Record<ZipExportKind, ZipExporter>>;
  readonly onProgress?: (progress: number) => void;
}

const ZIP_EXPORTERS: Readonly<Record<ZipExportKind, ZipExporter>> = {
  byAnimation: exportByAnimationZip,
  byItem: exportByItemZip,
  byAnimItem: exportByAnimItemZip,
  byFrame: exportByFrameZip,
};

/** Snapshot mutable selection and overlay metadata at export invocation. */
export function freezeCharacterExportInput(
  input: CharacterExportInput,
): CharacterExportInput {
  return {
    ...input,
    selections: {
      bodyType: input.selections.bodyType,
      items: Object.fromEntries(
        Object.entries(input.selections.items).map(([typeName, selection]) => [
          typeName,
          { ...selection },
        ]),
      ),
    },
    customOverlay: input.customOverlay ? { ...input.customOverlay } : null,
  };
}

/** Assemble and download one browser artifact from one frozen composition. */
export async function exportCharacterArtifact(
  kind: CharacterExportKind,
  input: CharacterExportInput,
  options: CharacterExportOptions = {},
): Promise<void> {
  const frozen = freezeCharacterExportInput(input);
  const download = options.download ?? downloadBlob;
  assertExportableCredits(frozen.sheet.credits);

  if (kind === 'bundle') {
    const blob = await exportSpritesheetBundle(frozen.sheet, frozen.anim);
    download(blob, 'character-spritesheet-with-credits.zip');
    return;
  }

  if (kind === 'creditsTxt') {
    const text = creditsToTxt(frozen.sheet.credits, frozen.anim);
    download(new Blob([text], { type: 'text/plain' }), 'credits.txt');
    return;
  }

  if (kind === 'creditsCsv') {
    const text = creditsToCsv(frozen.sheet.credits, frozen.anim);
    download(new Blob([text], { type: 'text/csv' }), 'credits.csv');
    return;
  }

  const exporter = (options.zipExporters ?? ZIP_EXPORTERS)[kind];
  const context: ExportContext = {
    sheet: frozen.sheet,
    selections: frozen.selections,
    catalog: frozen.catalog,
    anim: frozen.anim,
    composeSingleItem: frozen.composeSingleItem,
    composeSingleItemLayer: frozen.composeSingleItemLayer,
    adapter: (options.createAdapter ?? createBrowserCanvasAdapter)(),
    customOverlay: frozen.customOverlay,
    itemLabel: frozen.itemLabel,
    onProgress: options.onProgress ?? (() => {}),
  };
  const blob = await exporter(context);
  const filename = zipName(
    frozen.selections.bodyType,
    kind,
    (options.timestamp ?? zipExportTimestamp)(),
  );
  download(blob, filename);
}
