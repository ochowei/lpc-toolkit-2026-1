import {
  standardAnimationGeometry,
  type AnimationAuditGeometry,
  type AssetPackSourceInspection,
  type NormalizedAssetPack,
} from '@lpc-toolkit/core';
import type { AssetPackSha256 } from './runtime.js';

export interface AssetPackPngDecoder {
  readonly decode: (bytes: Uint8Array) => Promise<{
    readonly width: number;
    readonly height: number;
    readonly pixels: Uint8ClampedArray;
  }>;
}

interface SourceUse {
  readonly sourcePath: string;
  readonly geometry: AnimationAuditGeometry;
}

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_IHDR_END = 33;
const PNG_IHDR_LENGTH = 13;
const PNG_MAX_DIMENSION = 0x7fff_ffff;
const PNG_BIT_DEPTHS_BY_COLOR_TYPE: Readonly<Record<number, readonly number[]>> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};

function collectUniqueSourcePaths(pack: NormalizedAssetPack): readonly string[] {
  const seen = new Set<string>();
  const sourcePaths: string[] = [];

  pack.assets.forEach((asset) => {
    if (asset.kind === 'new-item') {
      asset.layers.forEach((layer) => {
        layer.sprites.forEach((sprite) => {
          if (!seen.has(sprite.source)) {
            seen.add(sprite.source);
            sourcePaths.push(sprite.source);
          }
        });
      });
      return;
    }

    asset.addAnimations.forEach((animation) => {
      animation.layers.forEach((layer) => {
        if (!seen.has(layer.source)) {
          seen.add(layer.source);
          sourcePaths.push(layer.source);
        }
      });
    });
  });

  return sourcePaths.sort((left, right) => left.localeCompare(right));
}

function collectSourceUses(pack: NormalizedAssetPack): ReadonlyMap<string, readonly SourceUse[]> {
  const uses = new Map<string, SourceUse[]>();

  pack.assets.forEach((asset) => {
    if (asset.kind === 'new-item') {
      asset.layers.forEach((layer) => {
        layer.sprites.forEach((sprite) => {
          const grouped = uses.get(sprite.source) ?? [];
          grouped.push({
            sourcePath: sprite.source,
            geometry: standardAnimationGeometry(sprite.animation),
          });
          uses.set(sprite.source, grouped);
        });
      });
      return;
    }

    asset.addAnimations.forEach((animation) => {
      animation.layers.forEach((layer) => {
        const grouped = uses.get(layer.source) ?? [];
        grouped.push({
          sourcePath: layer.source,
          geometry: standardAnimationGeometry(animation.animation),
        });
        uses.set(layer.source, grouped);
      });
    });
  });

  return uses;
}

function geometryBounds(geometry: AnimationAuditGeometry): { width: number; height: number } {
  const maxColumn = Math.max(
    ...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)),
  );
  return {
    width: (maxColumn + 1) * geometry.frameSize,
    height: geometry.rows.length * geometry.frameSize,
  };
}

function geometryKey(geometry: AnimationAuditGeometry): string {
  const bounds = geometryBounds(geometry);
  return `${bounds.width}x${bounds.height}`;
}

function geometryForEveryDeclaredUse(
  uses: readonly SourceUse[],
  width: number,
  height: number,
): AnimationAuditGeometry | undefined {
  const first = uses[0]?.geometry;
  if (!first) return undefined;
  const key = `${width}x${height}`;
  return uses.every((use) => geometryKey(use.geometry) === key)
    ? first
    : undefined;
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function pngCrc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 0 ? 0 : 0xedb8_8320);
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function readPngIhdrGeometry(rawBytes: Uint8Array): {
  readonly width: number;
  readonly height: number;
} | undefined {
  if (
    rawBytes.byteLength < PNG_IHDR_END
    || !hasPngSignature(rawBytes)
  ) {
    return undefined;
  }

  const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
  if (
    view.getUint32(8) !== PNG_IHDR_LENGTH
    || rawBytes[12] !== 0x49
    || rawBytes[13] !== 0x48
    || rawBytes[14] !== 0x44
    || rawBytes[15] !== 0x52
  ) {
    return undefined;
  }

  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const bitDepth = rawBytes[24];
  const colorType = rawBytes[25];
  if (
    width === 0
    || height === 0
    || width > PNG_MAX_DIMENSION
    || height > PNG_MAX_DIMENSION
    || bitDepth === undefined
    || colorType === undefined
    || !PNG_BIT_DEPTHS_BY_COLOR_TYPE[colorType]?.includes(bitDepth)
    || rawBytes[26] !== 0
    || rawBytes[27] !== 0
    || (rawBytes[28] !== 0 && rawBytes[28] !== 1)
    || view.getUint32(29) !== pngCrc32(rawBytes.subarray(12, 29))
  ) {
    return undefined;
  }

  return { width, height };
}

function decodeImageCells(
  decoded: Awaited<ReturnType<AssetPackPngDecoder['decode']>>,
  geometry: AnimationAuditGeometry,
): AssetPackSourceInspection['decoded'] | undefined {
  if (
    decoded.width <= 0
    || decoded.height <= 0
    || decoded.pixels.byteLength !== decoded.width * decoded.height * 4
  ) {
    return undefined;
  }

  const maxColumn = Math.max(
    ...geometry.rows.flatMap((row) => row.cells.map((cell) => cell.sourceColumn)),
  );
  const nonTransparentCells: string[] = [];
  const paletteColors = new Set<string>();

  for (const row of geometry.rows) {
    for (let column = 0; column <= maxColumn; column += 1) {
      const startX = column * geometry.frameSize;
      const startY = row.sourceRow * geometry.frameSize;
      let hasOpaquePixel = false;

      for (let y = startY; y < startY + geometry.frameSize; y += 1) {
        for (let x = startX; x < startX + geometry.frameSize; x += 1) {
          const index = (y * decoded.width + x) * 4;
          const alpha = decoded.pixels[index + 3];
          if (alpha === undefined || alpha === 0) {
            continue;
          }
          hasOpaquePixel = true;
          const red = decoded.pixels[index] ?? 0;
          const green = decoded.pixels[index + 1] ?? 0;
          const blue = decoded.pixels[index + 2] ?? 0;
          paletteColors.add(
            `#${red.toString(16).padStart(2, '0')}${green
              .toString(16)
              .padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`,
          );
        }
      }

      if (hasOpaquePixel) {
        nonTransparentCells.push(`${row.sourceRow}:${column}`);
      }
    }
  }

  return {
    width: decoded.width,
    height: decoded.height,
    nonTransparentCells,
    paletteColors: [...paletteColors].sort((left, right) => left.localeCompare(right)),
  };
}

export async function inspectAssetPackSourceBytes(options: {
  readonly pack: NormalizedAssetPack;
  readonly sourceBytes: ReadonlyMap<string, Uint8Array>;
  readonly sourceDigests: ReadonlyMap<string, AssetPackSha256>;
  readonly decoder: AssetPackPngDecoder;
}): Promise<readonly AssetPackSourceInspection[]> {
  const sourcePaths = collectUniqueSourcePaths(options.pack);
  const uses = collectSourceUses(options.pack);
  const inspections: AssetPackSourceInspection[] = [];

  for (const sourcePath of sourcePaths) {
    const bytes = options.sourceBytes.get(sourcePath);
    const digest = options.sourceDigests.get(sourcePath);
    if (!bytes) {
      inspections.push({
        sourcePath,
        regularFile: false,
        error: 'missing',
      });
      continue;
    }

    const ihdr = readPngIhdrGeometry(bytes);
    if (!ihdr) {
      inspections.push({
        sourcePath,
        ...(digest ? { digest } : {}),
        regularFile: true,
        error: 'decode-failed',
      });
      continue;
    }

    const geometry = geometryForEveryDeclaredUse(uses.get(sourcePath) ?? [], ihdr.width, ihdr.height);
    if (!geometry) {
      inspections.push({
        sourcePath,
        ...(digest ? { digest } : {}),
        regularFile: true,
        decoded: {
          width: ihdr.width,
          height: ihdr.height,
          nonTransparentCells: [],
          paletteColors: [],
        },
      });
      continue;
    }

    try {
      const decoded = await options.decoder.decode(bytes);
      const inspection = decodeImageCells(decoded, geometry);
      inspections.push(
        inspection
          ? {
              sourcePath,
              ...(digest ? { digest } : {}),
              regularFile: true,
              decoded: inspection,
            }
          : {
              sourcePath,
              ...(digest ? { digest } : {}),
              regularFile: true,
              error: 'decode-failed',
            },
      );
    } catch {
      inspections.push({
        sourcePath,
        ...(digest ? { digest } : {}),
        regularFile: true,
        error: 'decode-failed',
      });
    }
  }

  return inspections;
}
