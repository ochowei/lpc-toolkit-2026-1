import { describe, expect, it } from 'vitest';
import type {
  AnimationAuditConsumer,
  AnimationAuditGeometry,
  AssetAnimationAuditPlan,
} from '@lpc-toolkit/core';
import type {
  CanvasAdapter,
  CanvasLike,
  Context2DLike,
  ImageDataLike,
  ImageLike,
} from '@lpc-toolkit/core';
import { AssetStoreError, type AssetStore } from '../src/asset-store.js';
import { inspectAssetAnimationPlan } from '../src/animation-audit.js';

class MemoryImage implements ImageLike {
  readonly pixels: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number,
    opaqueCells: readonly { readonly column: number; readonly row: number }[],
    frameSize: number,
  ) {
    this.pixels = new Uint8ClampedArray(width * height * 4);
    for (const { column, row } of opaqueCells) {
      for (let y = row * frameSize; y < (row + 1) * frameSize; y += 1) {
        for (let x = column * frameSize; x < (column + 1) * frameSize; x += 1) {
          this.pixels[(y * width + x) * 4 + 3] = 255;
        }
      }
    }
  }
}

class MemoryCanvas implements CanvasLike {
  readonly pixels: Uint8ClampedArray;
  readonly requests: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[] = [];

  constructor(readonly width: number, readonly height: number) {
    this.pixels = new Uint8ClampedArray(width * height * 4);
  }

  getContext(_contextId: '2d'): Context2DLike {
    return {
      drawImage: (image: ImageLike | CanvasLike) => {
        if (!(image instanceof MemoryImage)) throw new Error('Expected a memory image.');
        this.pixels.set(image.pixels);
      },
      getImageData: (x, y, width, height) => {
        this.requests.push({ x, y, width, height });
        const data = new Uint8ClampedArray(width * height * 4);
        for (let row = 0; row < height; row += 1) {
          const source = ((y + row) * this.width + x) * 4;
          data.set(this.pixels.subarray(source, source + width * 4), row * width * 4);
        }
        return { data, width, height } satisfies ImageDataLike;
      },
      putImageData: () => undefined,
      clearRect: () => undefined,
    };
  }
}

function consumer(itemId: string): AnimationAuditConsumer {
  return {
    itemId,
    typeName: 'hair',
    layer: 'layer_1',
    bodyTypes: ['male'],
    recolors: [],
  };
}

function geometry(
  rows: AnimationAuditGeometry['rows'],
): AnimationAuditGeometry {
  return { kind: 'standard', frameSize: 2, rows };
}

const singleCellGeometry = geometry([{
  sourceRow: 0,
  direction: 'down',
  cells: [{ sourceColumn: 0, logicalFrameIndices: [0] }],
}]);

function plan(
  assets: AssetAnimationAuditPlan['assets'],
  overrides: Partial<AssetAnimationAuditPlan> = {},
): AssetAnimationAuditPlan {
  return {
    targets: ['walk'],
    itemsScanned: 4,
    assets,
    unsupported: [],
    errors: [],
    ...overrides,
  };
}

function storeFor(present: ReadonlySet<string>): AssetStore {
  return {
    kind: 'directory',
    baseUrl: '/fixture-assets/',
    description: 'fixture',
    has: (logicalPath) => present.has(logicalPath),
    load: async (sourcePath) => sourcePath,
  };
}

function asset(path: string, assetGeometry = singleCellGeometry, itemId = path): AssetAnimationAuditPlan['assets'][number] {
  return {
    path,
    animation: 'walk',
    sourceAnimation: 'walk',
    geometry: assetGeometry,
    consumers: [consumer(itemId)],
  };
}

function memoryAdapter(
  images: ReadonlyMap<string, MemoryImage | Error>,
  options: { readonly delay?: (path: string) => number } = {},
): { readonly adapter: CanvasAdapter; readonly loads: string[]; readonly canvases: MemoryCanvas[]; readonly peak: () => number } {
  const loads: string[] = [];
  const canvases: MemoryCanvas[] = [];
  let active = 0;
  let peak = 0;
  return {
    adapter: {
      createCanvas: (width, height) => {
        const canvas = new MemoryCanvas(width, height);
        canvases.push(canvas);
        return canvas;
      },
      async loadImage(sourcePath) {
        loads.push(sourcePath);
        active += 1;
        peak = Math.max(peak, active);
        try {
          const delay = options.delay?.(sourcePath) ?? 0;
          if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
          const image = images.get(sourcePath);
          if (image instanceof Error) throw image;
          if (!image) throw new Error(`Unknown fixture image: ${sourcePath}`);
          return image;
        } finally {
          active -= 1;
        }
      },
    },
    loads,
    canvases,
    peak: () => peak,
  };
}

describe('inspectAssetAnimationPlan', () => {
  it('separates missing, blank, and unreadable files and keeps findings successful', async () => {
    const missingPath = 'spritesheets/hair/missing/walk.png';
    const blankPath = 'spritesheets/hair/blank/walk.png';
    const corruptPath = 'spritesheets/hair/corrupt/walk.png';
    const blankGeometry = geometry([{
      sourceRow: 2,
      direction: 'down',
      cells: [{ sourceColumn: 3, logicalFrameIndices: [0] }],
    }]);
    const fixtures = memoryAdapter(new Map<string, MemoryImage | Error>([
      [`/fixture-assets/${blankPath}`, new MemoryImage(8, 6, [], 2)],
      [`/fixture-assets/${corruptPath}`, new Error('PNG decode failed')],
    ]));

    const report = await inspectAssetAnimationPlan(plan([
      asset(missingPath),
      asset(blankPath, blankGeometry),
      asset(corruptPath),
    ]), {
      store: storeFor(new Set([blankPath, corruptPath])),
      adapter: fixtures.adapter,
      concurrency: 2,
    });

    expect(report.missingFiles).toEqual([
      expect.objectContaining({ path: missingPath }),
    ]);
    expect(report.blankFrames).toEqual([
      expect.objectContaining({
        path: blankPath,
        sourceRow: 2,
        direction: 'down',
        frames: [expect.objectContaining({ sourceColumn: 3 })],
      }),
    ]);
    expect(report.errors).toEqual([
      expect.objectContaining({ kind: 'image_decode_failed', path: corruptPath }),
    ]);
    expect(report.summary).toMatchObject({
      missingFiles: 1,
      blankFrames: 1,
      errors: 1,
      incompleteItems: 2,
    });
  });

  it('reports AssetStore load failures separately from image decode failures', async () => {
    const failedPath = 'spritesheets/hair/read-failed/walk.png';
    const fixtures = memoryAdapter(new Map([
      [`/fixture-assets/${failedPath}`, new AssetStoreError(
        'asset_image_missing',
        'Unable to read fixture asset.',
        failedPath,
      )],
    ]));

    const report = await inspectAssetAnimationPlan(plan([asset(failedPath)]), {
      store: storeFor(new Set([failedPath])),
      adapter: fixtures.adapter,
    });

    expect(report.errors).toEqual([
      expect.objectContaining({ kind: 'asset_read_failed', path: failedPath }),
    ]);
    expect(report.summary.incompleteItems).toBe(0);
  });

  it('ignores unreferenced transparent columns and retains repeated logical indices once', async () => {
    const path = 'spritesheets/hair/repeated/walk.png';
    const repeatedGeometry = geometry([{
      sourceRow: 0,
      direction: 'down',
      cells: [
        { sourceColumn: 0, logicalFrameIndices: [0] },
        { sourceColumn: 1, logicalFrameIndices: [1, 3] },
      ],
    }]);
    const fixtures = memoryAdapter(new Map([
      [`/fixture-assets/${path}`, new MemoryImage(6, 2, [{ column: 0, row: 0 }], 2)],
    ]));

    const report = await inspectAssetAnimationPlan(plan([asset(path, repeatedGeometry)]), {
      store: storeFor(new Set([path])),
      adapter: fixtures.adapter,
    });

    expect(report.blankFrames).toEqual([
      expect.objectContaining({
        frames: [{ sourceColumn: 1, logicalFrameIndices: [1, 3] }],
      }),
    ]);
    expect(fixtures.canvases[0]?.requests).toHaveLength(2);
  });

  it('loads shared paths once, observes the limit, and reports in plan order', async () => {
    const firstPath = 'spritesheets/hair/z-first/walk.png';
    const sharedPath = 'spritesheets/hair/shared/walk.png';
    const lastPath = 'spritesheets/hair/a-last/walk.png';
    const images = new Map<string, MemoryImage>([
      [`/fixture-assets/${firstPath}`, new MemoryImage(2, 2, [], 2)],
      [`/fixture-assets/${sharedPath}`, new MemoryImage(2, 2, [], 2)],
      [`/fixture-assets/${lastPath}`, new MemoryImage(2, 2, [], 2)],
    ]);
    const fixtures = memoryAdapter(images, {
      delay: (sourcePath) => sourcePath.includes('z-first') ? 20 : 1,
    });
    const sharedRun = { ...asset(sharedPath, singleCellGeometry, 'shared-run'), animation: 'run' };

    const report = await inspectAssetAnimationPlan(plan([
      asset(firstPath),
      asset(sharedPath, singleCellGeometry, 'shared-walk'),
      sharedRun,
      asset(lastPath),
    ]), {
      store: storeFor(new Set([firstPath, sharedPath, lastPath])),
      adapter: fixtures.adapter,
      concurrency: 2,
    });

    expect(fixtures.loads.filter((path) => path.endsWith(sharedPath))).toHaveLength(1);
    expect(fixtures.peak()).toBeLessThanOrEqual(2);
    expect(report.blankFrames.map((finding) => finding.path)).toEqual([
      firstPath,
      sharedPath,
      sharedPath,
      lastPath,
    ]);
  });
});
