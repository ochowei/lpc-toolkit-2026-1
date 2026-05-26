import type {
  Catalog,
  CanvasAdapter,
  ComposedSheet,
  Selections,
} from '@lpc-toolkit/core';

export type ZipExportKind =
  | 'byAnimation'
  | 'byItem'
  | 'byAnimItem'
  | 'byFrame';

export interface ExportContext {
  readonly sheet: ComposedSheet;
  readonly selections: Selections;
  readonly catalog: Catalog;
  readonly anim: string;
  readonly composeSingleItem: (s: Selections) => Promise<ComposedSheet>;
  readonly adapter: CanvasAdapter;
  readonly onProgress: (progress: number) => void;
}

const KIND_TO_SEGMENT: Readonly<Record<ZipExportKind, string>> = {
  byAnimation: 'animations',
  byItem: 'item_spritesheets',
  byAnimItem: 'item_animations',
  byFrame: 'individual_frames',
};

export function zipExportTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

export function zipName(
  bodyType: string,
  kind: ZipExportKind,
  timestamp: string,
): string {
  return `lpc_${bodyType}_${KIND_TO_SEGMENT[kind]}_${timestamp}.zip`;
}

export interface ItemFileNameInput {
  readonly name: string;
  readonly zPos: number;
  readonly itemId?: string;
  readonly variant?: string;
}

export function itemFileName(input: ItemFileNameInput): string {
  const fallback = input.itemId
    ? `${input.itemId}_${input.variant ?? ''}`
    : '';
  const raw = input.name || fallback;
  const safe = raw.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
  const padded = String(input.zPos).padStart(3, '0');
  return `${padded} ${safe}.png`;
}
