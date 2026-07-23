import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { nodeAssetPackFormatRuntime } from '../src/asset-pack-node-runtime.js';

describe('nodeAssetPackFormatRuntime', () => {
  it('computes sha256 with sha256: prefix', async () => {
    const bytes = new TextEncoder().encode('hello world');
    const digest = await nodeAssetPackFormatRuntime.sha256(bytes);
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(digest).toBe(
      'sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    );
  });

  it('decodes UTF-8 and fails on invalid sequences', () => {
    const valid = new TextEncoder().encode('valid utf8');
    expect(nodeAssetPackFormatRuntime.decodeUtf8Fatal(valid)).toBe('valid utf8');

    const invalid = new Uint8Array([0xff, 0xff]);
    expect(() =>
      nodeAssetPackFormatRuntime.decodeUtf8Fatal(invalid),
    ).toThrow();
  });

  it('encodes UTF-8 strings', () => {
    const encoded = nodeAssetPackFormatRuntime.encodeUtf8('test string');
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(encoded)).toBe('test string');
  });

  it('inflates raw DEFLATE bytes within bounds and rejects invalid lengths', async () => {
    const original = new TextEncoder().encode('sample raw deflate data');
    const compressed = deflateRawSync(original);

    const result = await nodeAssetPackFormatRuntime.inflateRawBounded({
      compressed,
      declaredSize: original.byteLength,
      maximumSize: original.byteLength + 100,
    });
    expect(result).toEqual(original);

    // Mismatched declaredSize
    await expect(
      nodeAssetPackFormatRuntime.inflateRawBounded({
        compressed,
        declaredSize: original.byteLength + 1,
        maximumSize: original.byteLength + 100,
      }),
    ).rejects.toThrow();

    // Exceeds maximumSize
    await expect(
      nodeAssetPackFormatRuntime.inflateRawBounded({
        compressed,
        declaredSize: original.byteLength,
        maximumSize: original.byteLength - 1,
      }),
    ).rejects.toThrow();
  });
});
