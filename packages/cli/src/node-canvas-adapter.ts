import { writeFileSync } from 'node:fs';
import { createCanvas, loadImage as napiLoadImage } from '@napi-rs/canvas';
import type { CanvasAdapter, CanvasLike, ImageLike } from '@lpc-toolkit/core';
import type { AssetStore } from './asset-store.js';

export interface NodeCanvasAdapterOptions {
  readonly assetStore?: AssetStore;
}

export function createNodeCanvasAdapter(
  options: NodeCanvasAdapterOptions = {},
): CanvasAdapter {
  return {
    createCanvas(width: number, height: number): CanvasLike {
      return createCanvas(width, height);
    },
    async loadImage(sourcePath: string): Promise<ImageLike> {
      const source = options.assetStore
        ? await options.assetStore.load(sourcePath)
        : sourcePath;
      return napiLoadImage(source);
    },
  };
}

interface PngCanvasLike extends CanvasLike {
  readonly encode: (format: 'png') => Promise<Buffer>;
}

function hasEncode(canvas: CanvasLike): canvas is PngCanvasLike {
  return typeof (canvas as { readonly encode?: unknown }).encode === 'function';
}

export async function writeCanvasPng(canvas: CanvasLike, filePath: string): Promise<void> {
  if (!hasEncode(canvas)) {
    throw new Error('Canvas implementation does not support PNG encoding.');
  }
  writeFileSync(filePath, await canvas.encode('png'));
}
