import type { InflateRawBoundedOptions } from './runtime.js';

export interface RawDeflateInspection {
  readonly decodedSize: number;
  readonly consumedBytes: number;
}

const POW2 = [
  1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768,
  65536, 131072, 262144, 524288, 1048576, 2097152, 4194304, 8388608, 16777216,
  33554432, 67108864, 134217728, 268435456, 536870912, 1073741824, 2147483648,
  4294967296,
];

class BitReader {
  private byteOffset = 0;
  private bitBuffer = 0;
  private bitsCount = 0;

  constructor(private readonly bytes: Uint8Array) {}

  public readBits(count: number): number {
    if (count === 0) return 0;
    while (this.bitsCount < count) {
      if (this.byteOffset >= this.bytes.length) {
        throw new Error('Truncated raw DEFLATE stream.');
      }
      this.bitBuffer += this.bytes[this.byteOffset]! * POW2[this.bitsCount]!;
      this.byteOffset += 1;
      this.bitsCount += 8;
    }
    const val = Math.floor(this.bitBuffer) & ((1 << count) - 1);
    this.bitBuffer = Math.floor(this.bitBuffer / POW2[count]!);
    this.bitsCount -= count;
    return val;
  }

  public alignToByte(): void {
    const skip = this.bitsCount & 7;
    if (skip > 0) {
      this.bitBuffer = Math.floor(this.bitBuffer / POW2[skip]!);
      this.bitsCount -= skip;
    }
    const unusedBytes = Math.floor(this.bitsCount / 8);
    this.byteOffset -= unusedBytes;
    this.bitBuffer = 0;
    this.bitsCount = 0;
  }

  public readByte(): number {
    this.alignToByte();
    if (this.byteOffset >= this.bytes.length) {
      throw new Error('Truncated stored DEFLATE block.');
    }
    const val = this.bytes[this.byteOffset]!;
    this.byteOffset += 1;
    return val;
  }

  public skipBytes(count: number): void {
    this.alignToByte();
    if (this.byteOffset + count > this.bytes.length) {
      throw new Error('Truncated stored DEFLATE block.');
    }
    this.byteOffset += count;
  }

  public getConsumedBytes(): number {
    return this.byteOffset - Math.floor(this.bitsCount / 8);
  }
}

interface HuffmanTree {
  // Even index = left (0 bit), Odd index = right (1 bit)
  // Value > 0: leaf node symbol = (val - 1)
  // Value < 0: internal node = -val
  // Value === 0: unallocated
  readonly nodes: Int32Array;
}

function buildHuffmanTree(
  codeLengths: ArrayLike<number>,
  maxSymbolCount: number,
): HuffmanTree {
  const maxLen = 15;
  const blCount = new Uint16Array(maxLen + 1);
  let totalSymbols = 0;

  for (let i = 0; i < codeLengths.length; i += 1) {
    const len = codeLengths[i]!;
    if (len > 0) {
      if (len > maxLen) {
        throw new Error('Huffman code length exceeds maximum 15 bits.');
      }
      blCount[len] = (blCount[len] ?? 0) + 1;
      totalSymbols += 1;
    }
  }

  if (totalSymbols === 0) {
    return { nodes: new Int32Array(0) };
  }

  let code = 0;
  const nextCode = new Uint32Array(maxLen + 1);
  for (let bits = 1; bits <= maxLen; bits += 1) {
    code = (code + (blCount[bits - 1] ?? 0)) << 1;
    nextCode[bits] = code;
  }

  const maxCodeSpace = 1 << maxLen;
  const usedCodeSpace = (code + (blCount[maxLen] ?? 0)) << (maxLen - maxLen);
  if (usedCodeSpace > maxCodeSpace) {
    throw new Error('Oversubscribed Huffman tree.');
  }

  const nodes = new Int32Array(Math.max(maxSymbolCount * 4, 16));
  let nextNodeId = 1;

  for (let sym = 0; sym < codeLengths.length; sym += 1) {
    const len = codeLengths[sym]!;
    if (len === 0) continue;
    const c = nextCode[len] ?? 0;
    nextCode[len] = c + 1;

    let nodeIdx = 1;
    for (let bitIdx = len - 1; bitIdx >= 0; bitIdx -= 1) {
      const bit = (c >>> bitIdx) & 1;
      const childPos = nodeIdx * 2 + bit;

      if (bitIdx === 0) {
        nodes[childPos] = sym + 1;
      } else {
        let childNode = nodes[childPos]!;
        if (childNode === 0) {
          nextNodeId += 1;
          childNode = -nextNodeId;
          nodes[childPos] = childNode;
        }
        nodeIdx = -childNode;
      }
    }
  }

  return { nodes };
}

function decodeSymbol(reader: BitReader, tree: HuffmanTree): number {
  if (tree.nodes.length === 0) {
    throw new Error('Attempted to decode from an empty Huffman tree.');
  }
  let nodeIdx = 1;
  while (true) {
    const bit = reader.readBits(1);
    const childPos = nodeIdx * 2 + bit;
    if (childPos >= tree.nodes.length) {
      throw new Error('Invalid Huffman code in DEFLATE stream.');
    }
    const val = tree.nodes[childPos]!;
    if (val === 0) {
      throw new Error('Invalid Huffman code in DEFLATE stream.');
    }
    if (val > 0) {
      return val - 1;
    }
    nodeIdx = -val;
  }
}

const FIXED_LIT_LEN_LENGTHS = new Uint8Array(288);
for (let i = 0; i <= 143; i += 1) FIXED_LIT_LEN_LENGTHS[i] = 8;
for (let i = 144; i <= 255; i += 1) FIXED_LIT_LEN_LENGTHS[i] = 9;
for (let i = 256; i <= 279; i += 1) FIXED_LIT_LEN_LENGTHS[i] = 7;
for (let i = 280; i <= 287; i += 1) FIXED_LIT_LEN_LENGTHS[i] = 8;
const FIXED_LIT_LEN_TREE = buildHuffmanTree(FIXED_LIT_LEN_LENGTHS, 288);

const FIXED_DIST_LENGTHS = new Uint8Array(32);
for (let i = 0; i <= 31; i += 1) FIXED_DIST_LENGTHS[i] = 5;
const FIXED_DIST_TREE = buildHuffmanTree(FIXED_DIST_LENGTHS, 32);

const LENGTH_BASE = new Uint16Array([
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67,
  83, 99, 115, 131, 163, 195, 227, 258,
]);
const LENGTH_EXTRA_BITS = new Uint8Array([
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5,
  5, 5, 0,
]);

const DISTANCE_BASE = new Uint32Array([
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513,
  769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
]);
const DISTANCE_EXTRA_BITS = new Uint8Array([
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11,
  11, 12, 12, 13, 13,
]);

const CODE_LENGTH_ORDER = [
  16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
];

export function inspectRawDeflate(
  options: InflateRawBoundedOptions,
): RawDeflateInspection {
  const reader = new BitReader(options.compressed);
  let decodedSize = 0;
  let bfinal = 0;

  while (bfinal === 0) {
    bfinal = reader.readBits(1);
    const btype = reader.readBits(2);

    if (btype === 0) {
      // Stored block
      reader.alignToByte();
      const len = reader.readByte() | (reader.readByte() << 8);
      const nlen = reader.readByte() | (reader.readByte() << 8);
      if ((len ^ 0xffff) !== nlen) {
        throw new Error('Invalid stored DEFLATE block NLEN.');
      }
      reader.skipBytes(len);
      decodedSize += len;
      if (
        decodedSize > options.declaredSize ||
        decodedSize > options.maximumSize
      ) {
        throw new Error(
          'Decoded size exceeds declaration or maximum size limit.',
        );
      }
    } else if (btype === 1 || btype === 2) {
      let litLenTree: HuffmanTree;
      let distTree: HuffmanTree;

      if (btype === 1) {
        litLenTree = FIXED_LIT_LEN_TREE;
        distTree = FIXED_DIST_TREE;
      } else {
        const hlit = reader.readBits(5) + 257;
        const hdist = reader.readBits(5) + 1;
        const hclen = reader.readBits(4) + 4;

        if (hlit > 286) {
          throw new Error(`Invalid HLIT value ${hlit}.`);
        }

        const clLengths = new Uint8Array(19);
        for (let i = 0; i < hclen; i += 1) {
          clLengths[CODE_LENGTH_ORDER[i]!] = reader.readBits(3);
        }
        const clTree = buildHuffmanTree(clLengths, 19);

        const totalCodes = hlit + hdist;
        const combinedLengths = new Uint8Array(totalCodes);
        let codeIdx = 0;
        while (codeIdx < totalCodes) {
          const sym = decodeSymbol(reader, clTree);
          if (sym < 16) {
            combinedLengths[codeIdx] = sym;
            codeIdx += 1;
          } else if (sym === 16) {
            if (codeIdx === 0) {
              throw new Error(
                'Invalid repeat code length instruction 16 at index 0.',
              );
            }
            const prev = combinedLengths[codeIdx - 1]!;
            const count = reader.readBits(2) + 3;
            if (codeIdx + count > totalCodes) {
              throw new Error(
                'Code length repeat exceeds total expected count.',
              );
            }
            for (let c = 0; c < count; c += 1) {
              combinedLengths[codeIdx] = prev;
              codeIdx += 1;
            }
          } else if (sym === 17) {
            const count = reader.readBits(3) + 3;
            if (codeIdx + count > totalCodes) {
              throw new Error(
                'Code length repeat exceeds total expected count.',
              );
            }
            for (let c = 0; c < count; c += 1) {
              combinedLengths[codeIdx] = 0;
              codeIdx += 1;
            }
          } else if (sym === 18) {
            const count = reader.readBits(7) + 11;
            if (codeIdx + count > totalCodes) {
              throw new Error(
                'Code length repeat exceeds total expected count.',
              );
            }
            for (let c = 0; c < count; c += 1) {
              combinedLengths[codeIdx] = 0;
              codeIdx += 1;
            }
          } else {
            throw new Error(`Invalid code length symbol ${sym}.`);
          }
        }

        const litLenLengths = combinedLengths.subarray(0, hlit);
        const distLengths = combinedLengths.subarray(hlit, hlit + hdist);

        if (litLenLengths.length <= 256 || litLenLengths[256] === 0) {
          throw new Error('Missing end-of-block symbol in literal tree.');
        }

        litLenTree = buildHuffmanTree(litLenLengths, 288);
        distTree = buildHuffmanTree(distLengths, 32);
      }

      while (true) {
        const sym = decodeSymbol(reader, litLenTree);
        if (sym < 256) {
          decodedSize += 1;
          if (
            decodedSize > options.declaredSize ||
            decodedSize > options.maximumSize
          ) {
            throw new Error(
              'Decoded size exceeds declaration or maximum size limit.',
            );
          }
        } else if (sym === 256) {
          break; // EOB
        } else if (sym >= 257 && sym <= 285) {
          const lenIdx = sym - 257;
          const baseLen = LENGTH_BASE[lenIdx]!;
          const extraBits = LENGTH_EXTRA_BITS[lenIdx]!;
          const extra = extraBits > 0 ? reader.readBits(extraBits) : 0;
          const length = baseLen + extra;

          const distSym = decodeSymbol(reader, distTree);
          if (distSym > 29) {
            throw new Error(`Invalid distance symbol ${distSym}.`);
          }
          const distBase = DISTANCE_BASE[distSym]!;
          const distExtraBits = DISTANCE_EXTRA_BITS[distSym]!;
          const distExtra =
            distExtraBits > 0 ? reader.readBits(distExtraBits) : 0;
          const distance = distBase + distExtra;

          if (distance > decodedSize) {
            throw new Error('Distance back-reference exceeds decoded history.');
          }
          decodedSize += length;
          if (
            decodedSize > options.declaredSize ||
            decodedSize > options.maximumSize
          ) {
            throw new Error(
              'Decoded size exceeds declaration or maximum size limit.',
            );
          }
        } else {
          throw new Error(`Invalid literal/length symbol ${sym}.`);
        }
      }
    } else {
      throw new Error(`Reserved DEFLATE block type ${btype}.`);
    }
  }

  if (decodedSize !== options.declaredSize) {
    throw new Error('Raw DEFLATE decoded size does not match declaration.');
  }

  const consumedBytes = reader.getConsumedBytes();
  if (consumedBytes < options.compressed.length) {
    throw new Error('Trailing bytes after final DEFLATE block.');
  }

  return { decodedSize, consumedBytes };
}
