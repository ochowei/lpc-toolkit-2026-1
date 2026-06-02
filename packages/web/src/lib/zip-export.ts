import {
  creditsToCsv,
  creditsToTxt,
  extractAnimation,
  extractAnimationFrames,
} from '@lpc-toolkit/core';
import type {
  Catalog,
  CanvasAdapter,
  ComposedSheet,
  ItemDefinition,
  Selections,
} from '@lpc-toolkit/core';
// Type-only import — erased at compile time, so the actual jszip module
// is still lazily loaded via `await import('jszip')` below.
import type JSZipModule from 'jszip';
import {
  customOverlayItemFileName,
  type CustomOverlay,
} from './custom-overlay';
type JSZipInstance = InstanceType<typeof JSZipModule>;

/** ZIP layouts exposed by the download popover. */
export type ZipExportKind =
  | 'byAnimation'
  | 'byItem'
  | 'byAnimItem'
  | 'byFrame';

/** Shared dependencies and current composition state for every ZIP exporter. */
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
  readonly composeSingleItemLayer?: (
    s: Selections,
    layerNumber: number,
  ) => Promise<ComposedSheet>;
  readonly adapter: CanvasAdapter;
  readonly customOverlay?: CustomOverlay | null;
  readonly onProgress: (progress: number) => void;
}

const KIND_TO_SEGMENT: Readonly<Record<ZipExportKind, string>> = {
  byAnimation: 'animations',
  byItem: 'item_spritesheets',
  byAnimItem: 'item_animations',
  byFrame: 'individual_frames',
};

/** Filesystem-safe timestamp used in generated ZIP names. */
export function zipExportTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

/** Default ZIP filename for a body type and export layout. */
export function zipName(
  bodyType: string,
  kind: ZipExportKind,
  timestamp: string,
): string {
  return `lpc_${bodyType}_${KIND_TO_SEGMENT[kind]}_${timestamp}.zip`;
}

/** Inputs for naming an individual item spritesheet inside a ZIP archive. */
export interface ItemFileNameInput {
  readonly name: string;
  readonly zPos: number;
  readonly itemId?: string;
  readonly variant?: string;
}

/** Stable per-item filename ordered by z-position and sanitized for archives. */
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

async function encodeCustomOverlay(
  ctx: ExportContext,
  customOverlay: CustomOverlay,
): Promise<ArrayBuffer> {
  const canvas = ctx.adapter.createCanvas(
    customOverlay.width,
    customOverlay.height,
  );
  const canvasCtx = canvas.getContext('2d');
  canvasCtx.drawImage(customOverlay.image, 0, 0);
  return encodePng(canvas as unknown as HTMLCanvasElement);
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

/** Export one PNG per animation, plus mandatory credits files. */
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

interface ItemMeta {
  readonly itemId: string;
  readonly name: string;
  readonly variant?: string;
  readonly zPos: number;
}

interface ItemLayerMeta extends ItemMeta {
  readonly layerNumber: number;
}

// Map<typeName, ItemMeta> so callers can resolve by typeName cleanly even
// when two selected items share a name across different typeNames.
function lookupItemMetas(ctx: ExportContext): ReadonlyMap<string, ItemMeta> {
  const out = new Map<string, ItemMeta>();
  for (const [typeName, sel] of Object.entries(ctx.selections.items)) {
    for (const [itemId, item] of ctx.catalog.byItemId) {
      if (item.type_name !== typeName || item.name !== sel.name) continue;
      const zPos = item.layer_1?.zPos ?? 100;
      out.set(typeName, {
        itemId,
        name: sel.name,
        ...(sel.variant ? { variant: sel.variant } : {}),
        zPos,
      });
      break;
    }
  }
  return out;
}

function buildSingleSelections(
  base: Selections,
  typeName: string,
  sel: Selections['items'][string],
): Selections {
  return {
    bodyType: base.bodyType,
    items: { [typeName]: sel },
  };
}

function itemLayerMetas(
  itemId: string,
  item: ItemDefinition,
  meta: ItemMeta,
): ItemLayerMeta[] {
  const out: ItemLayerMeta[] = [];
  for (let n = 1; n < 10; n++) {
    const layer = item[`layer_${n}`];
    if (!layer) break;
    out.push({
      ...meta,
      itemId,
      zPos: layer.zPos,
      layerNumber: n,
    });
  }
  return out;
}

/** Export each selected item split by animation folder. */
export async function exportByAnimItemZip(ctx: ExportContext): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  // Cache per-item sheets so each item is composed exactly once.
  const itemSheets = new Map<string, ComposedSheet>();
  const metas = lookupItemMetas(ctx);

  for (const [typeName, sel] of Object.entries(ctx.selections.items)) {
    try {
      const itemSheet = await ctx.composeSingleItem(
        buildSingleSelections(ctx.selections, typeName, sel),
      );
      itemSheets.set(typeName, itemSheet);
    } catch (err) {
      console.warn(`exportByAnimItemZip: skipping ${typeName}/${sel.name}:`, err);
    }
  }

  const standardAnims = ctx.sheet.animations;
  const customAnims = ctx.sheet.customAnimations
    ? [...ctx.sheet.customAnimations.keys()]
    : [];

  // Estimate total = (anims) × (items) for progress.
  const itemCount = Object.keys(ctx.selections.items).length;
  const totalSlots =
    (standardAnims.length + customAnims.length) * itemCount +
    (ctx.customOverlay ? standardAnims.length : 0);
  let done = 0;

  const writeAnim = async (
    folder: 'standard' | 'custom',
    animName: string,
  ): Promise<void> => {
    for (const [typeName] of Object.entries(ctx.selections.items)) {
      const itemSheet = itemSheets.get(typeName);
      if (!itemSheet) {
        done += 1;
        continue;
      }
      const meta = metas.get(typeName);
      if (!meta) {
        done += 1;
        continue;
      }
      // Filter by item declaration (catalog), not itemSheet.animations.
      const itemDef = ctx.catalog.byItemId.get(meta.itemId);
      const declaredAnims = itemDef?.animations ?? [];
      const supports =
        folder === 'standard'
          ? declaredAnims.includes(animName)
          : itemSheet.customAnimations?.has(animName) ?? false;
      if (!supports) {
        done += 1;
        continue;
      }
      const animCanvas = extractAnimation(itemSheet, animName, {
        adapter: ctx.adapter,
      });
      const filename = itemFileName({
        name: meta.name,
        zPos: meta.zPos,
        itemId: meta.itemId,
        ...(meta.variant ? { variant: meta.variant } : {}),
      });
      const buf = await encodePng(
        animCanvas.canvas as unknown as HTMLCanvasElement,
      );
      zip.file(`${folder}/${animName}/${filename}`, buf, { createFolders: false });
      done += 1;
      reportEncode(ctx, done, totalSlots);
    }
  };

  for (const anim of standardAnims) await writeAnim('standard', anim);

  if (ctx.customOverlay) {
    const filename = customOverlayItemFileName({
      fileName: ctx.customOverlay.fileName,
      zPos: ctx.customOverlay.zPos,
    });
    const buf = await encodeCustomOverlay(ctx, ctx.customOverlay);
    for (const anim of standardAnims) {
      zip.file(`standard/${anim}/${filename}`, buf, { createFolders: false });
      done += 1;
      reportEncode(ctx, done, totalSlots);
    }
  }

  for (const anim of customAnims) await writeAnim('custom', anim);

  writeCredits(zip, ctx.sheet, ctx.anim);

  return zip.generateAsync(
    { type: 'blob' },
    (meta) => reportGenerate(ctx, meta.percent),
  );
}

/** Export one full spritesheet per selected item layer, plus any custom overlay. */
export async function exportByItemZip(ctx: ExportContext): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  const metas = lookupItemMetas(ctx);
  const itemLayerCount = [...metas.values()].reduce((count, meta) => {
    const itemDef = ctx.catalog.byItemId.get(meta.itemId);
    return (
      count + (itemDef ? itemLayerMetas(meta.itemId, itemDef, meta).length : 0)
    );
  }, 0);
  const total = itemLayerCount + (ctx.customOverlay ? 1 : 0);
  let done = 0;

  const fileOpts = { createFolders: false };

  for (const [typeName, sel] of Object.entries(ctx.selections.items)) {
    const meta = metas.get(typeName);
    if (!meta) continue;
    const itemDef = ctx.catalog.byItemId.get(meta.itemId);
    if (!itemDef) continue;
    const layers = itemLayerMetas(meta.itemId, itemDef, meta);
    try {
      for (const layer of layers) {
        const composeItemLayer =
          ctx.composeSingleItemLayer ?? ctx.composeSingleItem;
        const itemSheet = await composeItemLayer(
          buildSingleSelections(ctx.selections, typeName, sel),
          layer.layerNumber,
        );
        const filename = itemFileName({
          name: layer.name,
          zPos: layer.zPos,
          itemId: layer.itemId,
          ...(layer.variant ? { variant: layer.variant } : {}),
        });
        const buf = await encodePng(
          itemSheet.canvas as unknown as HTMLCanvasElement,
        );
        zip.file(`items/${filename}`, buf, fileOpts);
        done += 1;
        reportEncode(ctx, done, total);
      }
    } catch (err) {
      console.warn(`exportByItemZip: skipping ${typeName}/${sel.name}:`, err);
    }
  }

  if (ctx.customOverlay) {
    const filename = customOverlayItemFileName({
      fileName: ctx.customOverlay.fileName,
      zPos: ctx.customOverlay.zPos,
    });
    zip.file(
      `items/${filename}`,
      await encodeCustomOverlay(ctx, ctx.customOverlay),
      fileOpts,
    );
    done += 1;
    reportEncode(ctx, done, total);
  }

  writeCredits(zip, ctx.sheet, ctx.anim);

  return zip.generateAsync(
    { type: 'blob' },
    (meta) => reportGenerate(ctx, meta.percent),
  );
}

const yieldToUi = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Export every non-empty frame as an individual PNG grouped by animation/direction. */
export async function exportByFrameZip(ctx: ExportContext): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  const standardAnims = ctx.sheet.animations;
  const customAnims = ctx.sheet.customAnimations
    ? [...ctx.sheet.customAnimations.keys()]
    : [];

  type Task = {
    folder: 'standard' | 'custom';
    animName: string;
    direction: string;
    frameNumber: number;
    canvas: import('@lpc-toolkit/core').CanvasLike;
  };
  const tasks: Task[] = [];

  for (const animName of standardAnims) {
    const byDir = extractAnimationFrames(ctx.sheet, animName, {
      adapter: ctx.adapter,
      skipEmpty: true,
    });
    for (const [direction, frames] of byDir) {
      for (const frame of frames) {
        tasks.push({
          folder: 'standard',
          animName,
          direction,
          frameNumber: frame.frameNumber,
          canvas: frame.canvas,
        });
      }
    }
  }
  for (const animName of customAnims) {
    const byDir = extractAnimationFrames(ctx.sheet, animName, {
      adapter: ctx.adapter,
      skipEmpty: false,
    });
    for (const [direction, frames] of byDir) {
      for (const frame of frames) {
        tasks.push({
          folder: 'custom',
          animName,
          direction,
          frameNumber: frame.frameNumber,
          canvas: frame.canvas,
        });
      }
    }
  }

  const total = tasks.length;
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]!;
    const buf = await encodePng(
      t.canvas as unknown as HTMLCanvasElement,
    );
    zip.file(
      `${t.folder}/${t.animName}/${t.direction}/${t.frameNumber}.png`,
      buf,
      { createFolders: false },
    );
    reportEncode(ctx, i + 1, total);
    if ((i + 1) % 32 === 0) await yieldToUi();
  }

  writeCredits(zip, ctx.sheet, ctx.anim);

  return zip.generateAsync(
    { type: 'blob' },
    (meta) => reportGenerate(ctx, meta.percent),
  );
}
