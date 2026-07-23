import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { inspectRawDeflate } from '../src/deflate.js';

describe('inspectRawDeflate', () => {
  it('correctly inspects valid stored raw DEFLATE streams', () => {
    // Header 0x01 (BFINAL=1, BTYPE=00), LEN=5 (0x05, 0x00), NLEN=0xFFFA (0xFA, 0xFF), data "hello"
    const stored = new Uint8Array([0x01, 0x05, 0x00, 0xfa, 0xff, 104, 101, 108, 108, 111]);
    const result = inspectRawDeflate({
      compressed: stored,
      declaredSize: 5,
      maximumSize: 64,
    });
    expect(result).toEqual({ decodedSize: 5, consumedBytes: 10 });
  });

  it('correctly inspects valid fixed-Huffman raw DEFLATE streams', () => {
    const data = new TextEncoder().encode('Hello, RFC 1951!');
    const compressed = deflateRawSync(data);
    const result = inspectRawDeflate({
      compressed,
      declaredSize: data.byteLength,
      maximumSize: 1024,
    });
    expect(result.decodedSize).toBe(data.byteLength);
    expect(result.consumedBytes).toBe(compressed.byteLength);
  });

  it('correctly inspects valid dynamic-Huffman raw DEFLATE streams', () => {
    const data = new TextEncoder().encode('A'.repeat(500) + 'B'.repeat(500));
    const compressed = deflateRawSync(data);
    const result = inspectRawDeflate({
      compressed,
      declaredSize: data.byteLength,
      maximumSize: 2048,
    });
    expect(result.decodedSize).toBe(data.byteLength);
    expect(result.consumedBytes).toBe(compressed.byteLength);
  });

  it('permits unused padding bits in the final consumed byte', () => {
    const data = new TextEncoder().encode('abc');
    const compressed = deflateRawSync(data);
    const result = inspectRawDeflate({
      compressed,
      declaredSize: data.byteLength,
      maximumSize: 64,
    });
    expect(result.decodedSize).toBe(3);
    expect(result.consumedBytes).toBe(compressed.byteLength);
  });

  it('rejects complete trailing bytes after the final block', () => {
    const data = new TextEncoder().encode('test');
    const compressed = deflateRawSync(data);
    const withTrailing = new Uint8Array(compressed.byteLength + 2);
    withTrailing.set(compressed);
    withTrailing.set([0xde, 0xad], compressed.byteLength);

    expect(() =>
      inspectRawDeflate({
        compressed: withTrailing,
        declaredSize: data.byteLength,
        maximumSize: 64,
      }),
    ).toThrow(/trailing|consumed/i);
  });

  it('rejects truncated headers and bit fields', () => {
    const truncatedHeader = new Uint8Array([0x01, 0x05]);
    expect(() =>
      inspectRawDeflate({
        compressed: truncatedHeader,
        declaredSize: 5,
        maximumSize: 64,
      }),
    ).toThrow();
  });

  it('rejects invalid LEN/NLEN in stored blocks', () => {
    const badNlen = new Uint8Array([0x01, 0x05, 0x00, 0x00, 0x00, 104, 101, 108, 108, 111]);
    expect(() =>
      inspectRawDeflate({
        compressed: badNlen,
        declaredSize: 5,
        maximumSize: 64,
      }),
    ).toThrow(/nlen|invalid/i);
  });

  it('rejects reserved block types (BTYPE=11)', () => {
    const reserved = new Uint8Array([0x07]);
    expect(() =>
      inspectRawDeflate({
        compressed: reserved,
        declaredSize: 0,
        maximumSize: 64,
      }),
    ).toThrow(/reserved|block type/i);
  });

  it('rejects back-references beyond decoded history', () => {
    const badDist = new Uint8Array([0x03, 0x8d, 0x04, 0x0b, 0x00]);
    expect(() =>
      inspectRawDeflate({
        compressed: badDist,
        declaredSize: 4,
        maximumSize: 64,
      }),
    ).toThrow();
  });

  it('rejects decoded size greater than declared size or entry limit', () => {
    const data = new TextEncoder().encode('1234567890');
    const compressed = deflateRawSync(data);

    expect(() =>
      inspectRawDeflate({
        compressed,
        declaredSize: 5,
        maximumSize: 64,
      }),
    ).toThrow(/declared|size/i);

    expect(() =>
      inspectRawDeflate({
        compressed,
        declaredSize: 10,
        maximumSize: 8,
      }),
    ).toThrow(/limit|exceed/i);
  });
});
