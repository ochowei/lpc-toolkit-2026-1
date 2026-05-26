import {
  creditsToCsv,
  creditsToTxt,
  extractAnimation,
} from '@lpc-toolkit/core';
import type {
  Catalog,
  CanvasAdapter,
  ComposedSheet,
  Selections,
} from '@lpc-toolkit/core';
// Type-only import — erased at compile time, so the actual jszip module
// is still lazily loaded via `await import('jszip')` below.
import type JSZipModule from 'jszip';
type JSZipInstance = InstanceType<typeof JSZipModule>;

export type ZipExportKind =
  | 'byAnimation'
  | 'byItem'
  | 'byAnimItem'
  | 'byFrame';

export interface ExportContext {
  readonly sheet: ComposedSheet;
  readonly selections: Selections;
  readonly catalog: Catalog;
  /**
   * The UI-selected animation. Used by `writeCredits` only as a fallback
   * when `sheet.credits.resolvedPaths` is empty (it's populated in normal
   * production flow, so this is rarely consulted). Other exports may also
   * use it for the credits.txt filename column.
   */
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

// ComposedSheet.canvas / extractAnimation return CanvasLike (the minimal
// env-agnostic interface from @lpc-toolkit/core). Both the browser adapter
// and @napi-rs/canvas (used in tests) provide a .toBlob method on their
// canvas implementation, so the `as unknown as HTMLCanvasElement` cast at
// call sites is safe in both environments. Don't switch to .toBuffer —
// that would break the browser path.
function encodePng(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) =>
        b
          ? resolve(b.arrayBuffer())
          : reject(new Error('toBlob returned null')),
      'image/png',
    );
  });
}

function writeCredits(
  zip: JSZipInstance,
  sheet: ComposedSheet,
  anim: string,
): void {
  const opts = { createFolders: false };
  zip.file('credits/credits.txt', creditsToTxt(sheet.credits, anim), opts);
  zip.file('credits/credits.csv', creditsToCsv(sheet.credits, anim), opts);
}

// jszip's `generateAsync` onUpdate callback gives `{ percent: 0..100 }`.
// Map encode-stage progress to 0–0.5 and generate-stage to 0.5–1.0.
function reportEncode(
  ctx: ExportContext,
  done: number,
  total: number,
): void {
  if (total > 0) ctx.onProgress((done / total) * 0.5);
}

function reportGenerate(ctx: ExportContext, percent: number): void {
  ctx.onProgress(0.5 + (percent / 100) * 0.5);
}

export async function exportByAnimationZip(ctx: ExportContext): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const { sheet } = ctx;

  const standardAnims = sheet.animations;
  const customAnims = sheet.customAnimations
    ? [...sheet.customAnimations.keys()]
    : [];
  const total = standardAnims.length + customAnims.length;
  let done = 0;

  const fileOpts = { createFolders: false };

  for (const anim of standardAnims) {
    const animCanvas = extractAnimation(sheet, anim, { adapter: ctx.adapter });
    const buf = await encodePng(
      animCanvas.canvas as unknown as HTMLCanvasElement,
    );
    zip.file(`standard/${anim}.png`, buf, fileOpts);
    done += 1;
    reportEncode(ctx, done, total);
  }
  for (const name of customAnims) {
    const animCanvas = extractAnimation(sheet, name, { adapter: ctx.adapter });
    const buf = await encodePng(
      animCanvas.canvas as unknown as HTMLCanvasElement,
    );
    zip.file(`custom/${name}.png`, buf, fileOpts);
    done += 1;
    reportEncode(ctx, done, total);
  }

  writeCredits(zip, sheet, ctx.anim);

  return zip.generateAsync(
    { type: 'blob' },
    (meta) => reportGenerate(ctx, meta.percent),
  );
}
