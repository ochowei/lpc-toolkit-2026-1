import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import type { AssetPackFormatRuntime } from '@lpc-toolkit/asset-pack-format';

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
