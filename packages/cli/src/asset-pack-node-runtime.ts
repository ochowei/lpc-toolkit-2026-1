import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { loadImage as loadCanvasImage } from '@napi-rs/canvas';
import type {
  AssetPackFormatRuntime,
  AssetPackPngDecoder,
} from '@lpc-toolkit/asset-pack-format';
import { createNodeCanvasAdapter } from './node-canvas-adapter.js';

export const nodeAssetPackFormatRuntime: AssetPackFormatRuntime = {
  sha256: async (bytes) =>
    `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  decodeUtf8Fatal: (bytes) =>
    new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  encodeUtf8: (value) => new TextEncoder().encode(value),
  inflateRawBounded: async ({ compressed, declaredSize, maximumSize }) => {
    const limit = Math.min(declaredSize, maximumSize);
    const output = inflateRawSync(compressed, { maxOutputLength: limit });
    if (output.byteLength !== declaredSize) {
      throw new Error('Raw DEFLATE output length does not match its declaration.');
    }
    return new Uint8Array(output);
  },
};

export const nodeAssetPackPngDecoder: AssetPackPngDecoder = {
  decode: async (bytes) => {
    const image = await loadCanvasImage(bytes);
    const adapter = createNodeCanvasAdapter();
    const canvas = adapter.createCanvas(image.width, image.height);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    return {
      width: image.width,
      height: image.height,
      pixels: new Uint8ClampedArray(pixels),
    };
  },
};
