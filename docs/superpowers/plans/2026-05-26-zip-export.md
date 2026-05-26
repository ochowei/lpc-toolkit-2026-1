# Sub-project D · ZIP Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 ZIP export modes (F4 by-anim / F5 by-item / F6 by-anim+item / F7 by-frame) to v2's `DownloadPopover`, using a lazy-loaded jszip and a new env-agnostic `extractAnimationFrames` helper in core.

**Architecture:** A new `extractAnimationFrames` helper in `packages/core/` (env-agnostic, mirrors `extractAnimation` DI pattern) handles per-frame canvas slicing for F7. All four export flows live in `packages/web/src/lib/zip-export.ts`, take a shared `ExportContext`, and reuse `composeSelections` for per-item modes via a `composeSingleItem` callback passed down from `LayerStackHarness`. jszip is `await import`-ed inside each export function so it sits in its own Vite chunk and the initial SPA bundle stays unchanged. UI: extend the existing `DownloadPopover` (no new component) with 4 buttons + slim progress bar.

**Tech Stack:** TypeScript strict, React 18, Vite, pnpm, vitest, `@napi-rs/canvas` (test-only), jszip 3.x (new dep, MIT, GPL-3.0 compatible).

**Spec:** `docs/superpowers/specs/2026-05-26-zip-export-design.md`

---

## File Map

**Create:**
- `packages/core/src/frames.ts` — `extractAnimationFrames` helper
- `packages/core/test/frames.test.ts` — unit tests
- `packages/web/src/lib/zip-export.ts` — 4 export fns + shared helpers (`ExportContext`, `writeCredits`, `zipName`, `zipExportTimestamp`, `encodeBlob`, `yieldToUi`, `itemFileName`, `safeName`)
- `packages/web/test/zip-export.test.ts` — smoke tests (4 ZIPs round-trip via jszip `loadAsync`)

**Modify:**
- `packages/web/package.json` — add `jszip` to dependencies
- `packages/core/src/index.ts` — re-export `extractAnimationFrames`, `FrameSlice`, `ExtractFramesOptions`
- `packages/web/src/i18n.ts` — add 6 new `download.zip*` keys (en + zh-TW)
- `packages/web/src/components/layer-stack/harness.tsx` — `zipRunning` state, `composeSingleItem` callback, thread new props
- `packages/web/src/components/layer-stack/popovers/download-popover.tsx` — 4 ZIP buttons, progress bar, `w-72` width, disabled wiring

---

## Task 1: Add jszip dependency

**Files:**
- Modify: `packages/web/package.json` (via pnpm CLI)

- [ ] **Step 1: Add the dependency**

```bash
pnpm --filter @lpc-toolkit/web add jszip@^3.10.1
```

Expected: pnpm reports adding `jszip ^3.10.1` to `packages/web/dependencies`.

- [ ] **Step 2: Verify the entry**

```bash
grep -A1 '"jszip"' packages/web/package.json
```

Expected output:
```
    "jszip": "^3.10.1",
```

- [ ] **Step 3: Verify install reproducibility**

```bash
pnpm install --frozen-lockfile
```

Expected: completes without modifying lockfile.

- [ ] **Step 4: Commit**

```bash
git add packages/web/package.json pnpm-lock.yaml
git commit -m "deps(web): add jszip ^3.10.1 for ZIP export (MIT, GPL-3.0 compatible)"
```

---

## Task 2: `extractAnimationFrames` — standard animations

**Files:**
- Create: `packages/core/src/frames.ts`
- Test: `packages/core/test/frames.test.ts`

- [ ] **Step 1: Write the failing test for the standard 4-direction case**

Create `packages/core/test/frames.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { extractAnimationFrames } from '../src/frames.js';
import type { ComposedSheet, CreditsManifest } from '../src/types.js';
import {
  createNodeCanvasAdapter,
  makeCanvas,
} from './helpers/node-canvas-adapter.js';

const adapter = createNodeCanvasAdapter();

const EMPTY_CREDITS: CreditsManifest = {
  entries: [],
  resolvedPaths: [],
  licenses: [],
};

function paintedSheet(): ComposedSheet {
  // Paint walk row group (row 8, num 4, y=512, h=256). Fill only the first
  // 3 frame columns so we can verify skipEmpty drops the rest.
  const canvas = makeCanvas(832, 3456, (ctx) => {
    ctx.fillStyle = '#ff0000';
    for (let dir = 0; dir < 4; dir++) {
      for (let f = 0; f < 3; f++) {
        ctx.fillRect(f * 64, 512 + dir * 64, 64, 64);
      }
    }
  });
  return {
    canvas,
    width: 832,
    height: 3456,
    selections: { bodyType: 'male', items: {} },
    credits: EMPTY_CREDITS,
    layers: [],
    animations: ['walk'],
  };
}

describe('extractAnimationFrames — standard', () => {
  it('returns 4 directions for num=4 animation (walk)', () => {
    const sheet = paintedSheet();
    const frames = extractAnimationFrames(sheet, 'walk', { adapter });
    expect([...frames.keys()]).toEqual(['up', 'left', 'down', 'right']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @lpc-toolkit/core test -- frames
```

Expected: FAIL — "Cannot find module '../src/frames.js'".

- [ ] **Step 3: Create the minimal `frames.ts` implementation**

Create `packages/core/src/frames.ts`:

```typescript
import type { CanvasAdapter, CanvasLike } from './adapters.js';
import {
  ANIMATION_CONFIGS,
  DIRECTIONS,
  FRAME_SIZE,
  STANDARD_ANIMATION_FRAMES_PER_ROW,
  type Direction,
} from './constants.js';
import type { AnimationName, ComposedSheet } from './types.js';

export interface ExtractFramesOptions {
  readonly adapter: CanvasAdapter;
  readonly skipEmpty?: boolean;
}

export interface FrameSlice {
  readonly canvas: CanvasLike;
  readonly frameNumber: number;
  readonly direction: Direction;
}

function rowHasContent(
  data: Uint8ClampedArray,
  imageWidth: number,
  startX: number,
  frameWidth: number,
  frameHeight: number,
): boolean {
  for (let y = 0; y < frameHeight; y++) {
    for (let x = startX; x < startX + frameWidth && x < imageWidth; x++) {
      if (data[(y * imageWidth + x) * 4 + 3]! > 0) return true;
    }
  }
  return false;
}

export function extractAnimationFrames(
  sheet: ComposedSheet,
  name: AnimationName,
  options: ExtractFramesOptions,
): ReadonlyMap<Direction, readonly FrameSlice[]> {
  const skipEmpty = options.skipEmpty ?? true;
  const config = ANIMATION_CONFIGS[name];
  if (!config) {
    throw new Error(`extractAnimationFrames: unknown animation "${name}"`);
  }

  const { row, num } = config;
  const frameSize = FRAME_SIZE;
  const framesPerRow = STANDARD_ANIMATION_FRAMES_PER_ROW;
  const sourceCtx = sheet.canvas.getContext('2d');

  const out = new Map<Direction, FrameSlice[]>();

  for (let dirIndex = 0; dirIndex < num; dirIndex++) {
    const direction = DIRECTIONS[dirIndex]!;
    const sourceY = row * frameSize + dirIndex * frameSize;
    const rowData = sourceCtx.getImageData(
      0,
      sourceY,
      sheet.width,
      frameSize,
    );

    const slices: FrameSlice[] = [];
    for (let frameIndex = 0; frameIndex < framesPerRow; frameIndex++) {
      const sourceX = frameIndex * frameSize;
      if (
        skipEmpty &&
        !rowHasContent(rowData.data, sheet.width, sourceX, frameSize, frameSize)
      ) {
        continue;
      }
      const frameCanvas = options.adapter.createCanvas(frameSize, frameSize);
      const frameCtx = frameCanvas.getContext('2d');
      frameCtx.drawImage(
        sheet.canvas,
        sourceX,
        sourceY,
        frameSize,
        frameSize,
        0,
        0,
        frameSize,
        frameSize,
      );
      slices.push({
        canvas: frameCanvas,
        frameNumber: frameIndex + 1,
        direction,
      });
    }
    out.set(direction, slices);
  }

  return out;
}
```

Note: `Direction` is exported from `constants.ts` already (`export type Direction = (typeof DIRECTIONS)[number]`).

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @lpc-toolkit/core test -- frames
```

Expected: 1 passed.

- [ ] **Step 5: Add tests for num=1 (single direction) and skipEmpty behaviour**

Append to `packages/core/test/frames.test.ts`:

```typescript
it('returns only "up" for num=1 animation (hurt)', () => {
  // Paint hurt row (row 20, num 1, y=1280, h=64). Frames 0–5 only.
  const sheet: ComposedSheet = {
    ...paintedSheet(),
    canvas: makeCanvas(832, 3456, (ctx) => {
      ctx.fillStyle = '#00ff00';
      for (let f = 0; f < 6; f++) {
        ctx.fillRect(f * 64, 1280, 64, 64);
      }
    }),
  };
  const frames = extractAnimationFrames(sheet, 'hurt', { adapter });
  expect([...frames.keys()]).toEqual(['up']);
  expect(frames.get('up')!).toHaveLength(6);
  expect(frames.get('up')![0]!.frameNumber).toBe(1);
});

it('drops fully transparent frames when skipEmpty is true (default)', () => {
  const sheet = paintedSheet();
  const frames = extractAnimationFrames(sheet, 'walk', { adapter });
  // walk row painted frames 0–2 only → each direction has 3 frames
  expect(frames.get('up')!).toHaveLength(3);
  expect(frames.get('up')!.map((f) => f.frameNumber)).toEqual([1, 2, 3]);
});

it('emits 13 frames per row when skipEmpty is false', () => {
  const sheet = paintedSheet();
  const frames = extractAnimationFrames(sheet, 'walk', {
    adapter,
    skipEmpty: false,
  });
  expect(frames.get('up')!).toHaveLength(13);
});

it('produces 64×64 frame canvases with correct pixel content', () => {
  const sheet = paintedSheet();
  const frames = extractAnimationFrames(sheet, 'walk', { adapter });
  const first = frames.get('up')![0]!.canvas;
  expect(first.width).toBe(64);
  expect(first.height).toBe(64);
  const px = first.getContext('2d').getImageData(0, 0, 1, 1).data;
  expect([px[0], px[1], px[2], px[3]]).toEqual([255, 0, 0, 255]);
});

it('throws on unknown animation name', () => {
  const sheet = paintedSheet();
  expect(() =>
    extractAnimationFrames(sheet, 'nope-animation', { adapter }),
  ).toThrow(/unknown animation/);
});
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm --filter @lpc-toolkit/core test -- frames
```

Expected: 5 passed (all standard-animation cases).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/frames.ts packages/core/test/frames.test.ts
git commit -m "feat(core): add extractAnimationFrames for standard animations"
```

---

## Task 3: `extractAnimationFrames` — custom animations

**Files:**
- Modify: `packages/core/src/frames.ts`
- Modify: `packages/core/test/frames.test.ts`

- [ ] **Step 1: Write failing test for custom animation with rows=4**

Append to `packages/core/test/frames.test.ts`:

```typescript
describe('extractAnimationFrames — custom', () => {
  function customSheet(rows: number, cols: number, frameSize: number): ComposedSheet {
    const sheetH = 3456 + rows * frameSize;
    const canvas = makeCanvas(832, sheetH, (ctx) => {
      ctx.fillStyle = '#0000ff';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.fillRect(c * frameSize, 3456 + r * frameSize, frameSize, frameSize);
        }
      }
    });
    return {
      canvas,
      width: 832,
      height: sheetH,
      selections: { bodyType: 'male', items: {} },
      credits: EMPTY_CREDITS,
      layers: [],
      animations: [],
      customAnimations: new Map([
        ['wheelchair', { offsetY: 3456, frameSize, rows, cols }],
      ]),
    };
  }

  it('returns 4 directions when region.rows === 4', () => {
    const sheet = customSheet(4, 8, 64);
    const frames = extractAnimationFrames(sheet, 'wheelchair', { adapter });
    expect([...frames.keys()]).toEqual(['up', 'left', 'down', 'right']);
    expect(frames.get('right')!).toHaveLength(8);
  });

  it('returns only "up" when region.rows === 1', () => {
    const sheet = customSheet(1, 5, 64);
    const frames = extractAnimationFrames(sheet, 'wheelchair', { adapter });
    expect([...frames.keys()]).toEqual(['up']);
    expect(frames.get('up')!).toHaveLength(5);
  });

  it('returns first `rows` DIRECTIONS for rows=2', () => {
    const sheet = customSheet(2, 3, 64);
    const frames = extractAnimationFrames(sheet, 'wheelchair', { adapter });
    expect([...frames.keys()]).toEqual(['up', 'left']);
  });

  it('uses region.frameSize for frame canvas size (non-64)', () => {
    const sheet = customSheet(4, 2, 128);
    const frames = extractAnimationFrames(sheet, 'wheelchair', { adapter });
    const first = frames.get('up')![0]!.canvas;
    expect(first.width).toBe(128);
    expect(first.height).toBe(128);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @lpc-toolkit/core test -- frames
```

Expected: 4 new tests FAIL — `extractAnimationFrames` throws "unknown animation" for `wheelchair`.

- [ ] **Step 3: Extend `frames.ts` to handle custom animations**

Replace the body of `extractAnimationFrames` in `packages/core/src/frames.ts` with a branched lookup. After the `const config = ANIMATION_CONFIGS[name]` line, restructure so the function first tries standard, then custom:

```typescript
export function extractAnimationFrames(
  sheet: ComposedSheet,
  name: AnimationName,
  options: ExtractFramesOptions,
): ReadonlyMap<Direction, readonly FrameSlice[]> {
  const skipEmpty = options.skipEmpty ?? true;
  const config = ANIMATION_CONFIGS[name];
  if (config) {
    return extractStandard(sheet, config.row, config.num, options.adapter, skipEmpty);
  }
  const region = sheet.customAnimations?.get(name);
  if (region) {
    return extractCustom(sheet, region, options.adapter, skipEmpty);
  }
  throw new Error(`extractAnimationFrames: unknown animation "${name}"`);
}

function extractStandard(
  sheet: ComposedSheet,
  row: number,
  num: 1 | 4,
  adapter: CanvasAdapter,
  skipEmpty: boolean,
): ReadonlyMap<Direction, readonly FrameSlice[]> {
  const frameSize = FRAME_SIZE;
  const framesPerRow = STANDARD_ANIMATION_FRAMES_PER_ROW;
  const sourceCtx = sheet.canvas.getContext('2d');
  const out = new Map<Direction, FrameSlice[]>();

  for (let dirIndex = 0; dirIndex < num; dirIndex++) {
    const direction = DIRECTIONS[dirIndex]!;
    const sourceY = row * frameSize + dirIndex * frameSize;
    const rowData = sourceCtx.getImageData(
      0,
      sourceY,
      sheet.width,
      frameSize,
    );

    const slices: FrameSlice[] = [];
    for (let frameIndex = 0; frameIndex < framesPerRow; frameIndex++) {
      const sourceX = frameIndex * frameSize;
      if (
        skipEmpty &&
        !rowHasContent(rowData.data, sheet.width, sourceX, frameSize, frameSize)
      ) {
        continue;
      }
      slices.push(
        sliceFrame(sheet, adapter, sourceX, sourceY, frameSize, frameIndex + 1, direction),
      );
    }
    out.set(direction, slices);
  }
  return out;
}

function extractCustom(
  sheet: ComposedSheet,
  region: { offsetY: number; frameSize: number; rows: number; cols: number },
  adapter: CanvasAdapter,
  skipEmpty: boolean,
): ReadonlyMap<Direction, readonly FrameSlice[]> {
  const { offsetY, frameSize, rows, cols } = region;
  const sourceCtx = sheet.canvas.getContext('2d');
  const out = new Map<Direction, FrameSlice[]>();
  const directionsToEmit = Math.min(rows, DIRECTIONS.length);

  for (let dirIndex = 0; dirIndex < directionsToEmit; dirIndex++) {
    const direction = DIRECTIONS[dirIndex]!;
    const sourceY = offsetY + dirIndex * frameSize;
    const rowData = sourceCtx.getImageData(
      0,
      sourceY,
      sheet.width,
      frameSize,
    );

    const slices: FrameSlice[] = [];
    for (let frameIndex = 0; frameIndex < cols; frameIndex++) {
      const sourceX = frameIndex * frameSize;
      if (
        skipEmpty &&
        !rowHasContent(rowData.data, sheet.width, sourceX, frameSize, frameSize)
      ) {
        continue;
      }
      slices.push(
        sliceFrame(sheet, adapter, sourceX, sourceY, frameSize, frameIndex + 1, direction),
      );
    }
    out.set(direction, slices);
  }
  return out;
}

function sliceFrame(
  sheet: ComposedSheet,
  adapter: CanvasAdapter,
  sourceX: number,
  sourceY: number,
  frameSize: number,
  frameNumber: number,
  direction: Direction,
): FrameSlice {
  const frameCanvas = adapter.createCanvas(frameSize, frameSize);
  const frameCtx = frameCanvas.getContext('2d');
  frameCtx.drawImage(
    sheet.canvas,
    sourceX,
    sourceY,
    frameSize,
    frameSize,
    0,
    0,
    frameSize,
    frameSize,
  );
  return { canvas: frameCanvas, frameNumber, direction };
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
pnpm --filter @lpc-toolkit/core test -- frames
```

Expected: 9 passed (5 standard + 4 custom).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/frames.ts packages/core/test/frames.test.ts
git commit -m "feat(core): extend extractAnimationFrames to custom animations"
```

---

## Task 4: Export `extractAnimationFrames` from core index

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Find the existing animation exports**

```bash
grep -n "extractAnimation\|animation.js" packages/core/src/index.ts
```

Expected: shows current `export { extractAnimation } from './animation.js'` line.

- [ ] **Step 2: Add the new re-exports**

Add to `packages/core/src/index.ts` near the existing animation export:

```typescript
export { extractAnimationFrames } from './frames.js';
export type { ExtractFramesOptions, FrameSlice } from './frames.js';
```

Also add `Direction` to the type re-exports if not already there:

```bash
grep -n "Direction" packages/core/src/index.ts
```

If not present, add to the type export block:
```typescript
export type { Direction } from './constants.js';
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm --filter @lpc-toolkit/core typecheck
```

Expected: no errors.

- [ ] **Step 4: Verify the symbols are reachable from web**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: no errors (web hasn't imported them yet, but the build graph must stay clean).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export extractAnimationFrames and FrameSlice"
```

---

## Task 5: `zip-export.ts` skeleton + shared helpers

**Files:**
- Create: `packages/web/src/lib/zip-export.ts`
- Test: `packages/web/test/zip-export.test.ts`

- [ ] **Step 1: Write failing tests for pure helpers**

Create `packages/web/test/zip-export.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  zipExportTimestamp,
  zipName,
  itemFileName,
} from '../src/lib/zip-export';

describe('zipExportTimestamp', () => {
  it('matches the upstream yyyy-MM-ddTHH-mm-ss pattern', () => {
    expect(zipExportTimestamp()).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/,
    );
  });
});

describe('zipName', () => {
  it.each([
    ['byAnimation', 'animations'],
    ['byItem', 'item_spritesheets'],
    ['byAnimItem', 'item_animations'],
    ['byFrame', 'individual_frames'],
  ] as const)('formats %s ZIP filename', (kind, segment) => {
    const name = zipName('male', kind, '2026-05-26T14-32-08');
    expect(name).toBe(`lpc_male_${segment}_2026-05-26T14-32-08.zip`);
  });
});

describe('itemFileName', () => {
  it('zero-pads zPos to 3 digits and lowercases name', () => {
    expect(itemFileName({ name: 'Body Male Light', zPos: 50 })).toBe(
      '050 body_male_light.png',
    );
  });

  it('replaces non-[a-z0-9.] with underscore', () => {
    expect(itemFileName({ name: 'shield #1 (round)', zPos: 200 })).toBe(
      '200 shield__1__round_.png',
    );
  });

  it('falls back to itemId_variant when name is empty', () => {
    expect(
      itemFileName({
        name: '',
        zPos: 7,
        itemId: 'hair_messy',
        variant: 'blonde',
      }),
    ).toBe('007 hair_messy_blonde.png');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @lpc-toolkit/web test -- zip-export
```

Expected: FAIL — "Cannot find module '../src/lib/zip-export'".

- [ ] **Step 3: Create the skeleton with helpers**

Create `packages/web/src/lib/zip-export.ts`:

```typescript
import type {
  Catalog,
  CanvasAdapter,
  ComposedSheet,
  Selections,
} from '@lpc-toolkit/core';

export type ZipExportKind =
  | 'byAnimation'
  | 'byItem'
  | 'byAnimItem'
  | 'byFrame';

export interface ExportContext {
  readonly sheet: ComposedSheet;
  readonly selections: Selections;
  readonly catalog: Catalog;
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
```

(`CanvasAdapter`, `Catalog`, `ComposedSheet`, `Selections` are all already re-exported from `@lpc-toolkit/core` — no index changes needed.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @lpc-toolkit/web test -- zip-export
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/zip-export.ts packages/web/test/zip-export.test.ts
git commit -m "feat(web/lib): scaffold zip-export with timestamp/zipName/itemFileName"
```

---

## Task 6: F4 `exportByAnimationZip`

**Files:**
- Modify: `packages/web/src/lib/zip-export.ts`
- Modify: `packages/web/test/zip-export.test.ts`

- [ ] **Step 1: Write failing smoke test for F4**

Add to `packages/web/test/zip-export.test.ts`:

```typescript
import { vi, beforeAll, afterAll } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import JSZip from 'jszip';
import {
  exportByAnimationZip,
  type ExportContext,
} from '../src/lib/zip-export';
import type { ComposedSheet, CreditsManifest } from '@lpc-toolkit/core';

// Stub document.createElement('a') so downloadBlob doesn't blow up under node
// (download is a side effect; we capture the blob via spy on URL.createObjectURL).
beforeAll(() => {
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'a' && tag !== 'canvas') {
        throw new Error(`unexpected createElement: ${tag}`);
      }
      if (tag === 'canvas') return createCanvas(1, 1);
      // anchor stub
      return {
        href: '',
        download: '',
        style: {},
        click: () => {},
      };
    },
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
  });
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:stub',
    revokeObjectURL: () => {},
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const EMPTY_CREDITS: CreditsManifest = {
  entries: [],
  resolvedPaths: [],
  licenses: [],
};

function makeAdapter() {
  return {
    createCanvas: (w: number, h: number) =>
      createCanvas(w, h) as unknown as import('@lpc-toolkit/core').CanvasLike,
    loadImage: async () => {
      throw new Error('not used in this test');
    },
  };
}

function makeWalkSheet(): ComposedSheet {
  // Paint walk row group only (row 8 → y 512, h 256).
  const canvas = createCanvas(832, 3456);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 512, 832, 256);
  return {
    canvas: canvas as unknown as import('@lpc-toolkit/core').CanvasLike,
    width: 832,
    height: 3456,
    selections: { bodyType: 'male', items: {} },
    credits: EMPTY_CREDITS,
    layers: [],
    animations: ['walk'],
  };
}

describe('exportByAnimationZip (F4)', () => {
  it('produces a ZIP containing standard/<anim>.png and credits/credits.txt+csv', async () => {
    const sheet = makeWalkSheet();
    const ctx: ExportContext = {
      sheet,
      selections: sheet.selections,
      catalog: {
        byItemId: new Map(),
        byTypeName: new Map(),
        typeNames: [],
        aliases: new Map(),
      },
      anim: 'walk',
      composeSingleItem: async () => sheet,
      adapter: makeAdapter(),
      onProgress: () => {},
    };
    const blob = await exportByAnimationZip(ctx);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual([
      'credits/credits.csv',
      'credits/credits.txt',
      'standard/walk.png',
    ]);
    const pngBytes = await zip.file('standard/walk.png')!.async('uint8array');
    expect(pngBytes.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @lpc-toolkit/web test -- zip-export
```

Expected: FAIL — "exportByAnimationZip is not exported".

- [ ] **Step 3: Implement `exportByAnimationZip` + shared helpers**

Append to `packages/web/src/lib/zip-export.ts`:

```typescript
import { creditsToCsv, creditsToTxt, extractAnimation } from '@lpc-toolkit/core';
// Type-only import — erased at compile time, so the actual jszip module
// is still lazily loaded via `await import('jszip')` below.
import type JSZipModule from 'jszip';
type JSZipInstance = InstanceType<typeof JSZipModule>;

function encodeBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/png',
    );
  });
}

function writeCredits(
  zip: JSZipInstance,
  sheet: ComposedSheet,
  anim: string,
): void {
  zip.file('credits/credits.txt', creditsToTxt(sheet.credits, anim));
  zip.file('credits/credits.csv', creditsToCsv(sheet.credits, anim));
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

  for (const anim of standardAnims) {
    const animCanvas = extractAnimation(sheet, anim, { adapter: ctx.adapter });
    const blob = await encodeBlob(animCanvas.canvas as unknown as HTMLCanvasElement);
    zip.file(`standard/${anim}.png`, blob);
    done += 1;
    reportEncode(ctx, done, total);
  }
  for (const name of customAnims) {
    const animCanvas = extractAnimation(sheet, name, { adapter: ctx.adapter });
    const blob = await encodeBlob(animCanvas.canvas as unknown as HTMLCanvasElement);
    zip.file(`custom/${name}.png`, blob);
    done += 1;
    reportEncode(ctx, done, total);
  }

  writeCredits(zip, sheet, ctx.anim);

  return zip.generateAsync(
    { type: 'blob' },
    (meta) => reportGenerate(ctx, meta.percent),
  );
}
```

Note: `ExportContext` should also be exported (used by callers). Add `export` keyword if not present.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @lpc-toolkit/web test -- zip-export
```

Expected: 7 passed (6 helpers + 1 F4 smoke).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/zip-export.ts packages/web/test/zip-export.test.ts
git commit -m "feat(web/lib): add F4 exportByAnimationZip"
```

---

## Task 7: F5 `exportByItemZip`

**Files:**
- Modify: `packages/web/src/lib/zip-export.ts`
- Modify: `packages/web/test/zip-export.test.ts`

- [ ] **Step 1: Write failing F5 smoke test**

Add to `packages/web/test/zip-export.test.ts` (inside the same file):

```typescript
import { exportByItemZip } from '../src/lib/zip-export';
import type { ItemDefinition } from '@lpc-toolkit/core';

function makeItem(zPos: number): ItemDefinition {
  return {
    name: 'male light',
    type_name: 'body',
    animations: ['walk'],
    credits: [],
    layer_1: { zPos, male: 'body/bodies/male/' },
  };
}

describe('exportByItemZip (F5)', () => {
  it('produces a ZIP with one items/<zPos> <name>.png entry per selected item', async () => {
    const sheet = makeWalkSheet();
    const selections = {
      bodyType: 'male',
      items: { body: { typeName: 'body', name: 'male light' } },
    };
    const itemDef = makeItem(50);
    const ctx: ExportContext = {
      sheet,
      selections,
      catalog: {
        byItemId: new Map([['body/male_light', itemDef]]),
        byTypeName: new Map([['body', [itemDef]]]),
        typeNames: ['body'],
        aliases: new Map(),
      },
      anim: 'walk',
      composeSingleItem: async () => sheet,
      adapter: makeAdapter(),
      onProgress: () => {},
    };
    const blob = await exportByItemZip(ctx);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const keys = Object.keys(zip.files).sort();
    expect(keys).toContain('credits/credits.txt');
    expect(keys).toContain('credits/credits.csv');
    expect(keys.some((k) => k.startsWith('items/050 '))).toBe(true);
    expect(keys.find((k) => k.startsWith('items/'))).toBe('items/050 male_light.png');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @lpc-toolkit/web test -- zip-export
```

Expected: FAIL — "exportByItemZip is not exported".

- [ ] **Step 3: Implement F5**

Append to `packages/web/src/lib/zip-export.ts`:

```typescript
interface ItemMeta {
  readonly itemId: string;
  readonly name: string;
  readonly variant?: string;
  readonly zPos: number;
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

export async function exportByItemZip(ctx: ExportContext): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  const metas = lookupItemMetas(ctx);
  const total = metas.size;
  let done = 0;

  for (const [typeName, sel] of Object.entries(ctx.selections.items)) {
    const meta = metas.get(typeName);
    if (!meta) continue;
    try {
      const itemSheet = await ctx.composeSingleItem(
        buildSingleSelections(ctx.selections, typeName, sel),
      );
      const filename = itemFileName({
        name: meta.name,
        zPos: meta.zPos,
        itemId: meta.itemId,
        ...(meta.variant ? { variant: meta.variant } : {}),
      });
      const blob = await encodeBlob(
        itemSheet.canvas as unknown as HTMLCanvasElement,
      );
      zip.file(`items/${filename}`, blob);
    } catch (err) {
      console.warn(`exportByItemZip: skipping ${typeName}/${sel.name}:`, err);
    }
    done += 1;
    reportEncode(ctx, done, total);
  }

  writeCredits(zip, ctx.sheet, ctx.anim);

  return zip.generateAsync(
    { type: 'blob' },
    (meta) => reportGenerate(ctx, meta.percent),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @lpc-toolkit/web test -- zip-export
```

Expected: 8 passed (previous + F5 smoke).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/zip-export.ts packages/web/test/zip-export.test.ts
git commit -m "feat(web/lib): add F5 exportByItemZip"
```

---

## Task 8: F6 `exportByAnimItemZip`

**Files:**
- Modify: `packages/web/src/lib/zip-export.ts`
- Modify: `packages/web/test/zip-export.test.ts`

- [ ] **Step 1: Write failing F6 smoke test**

Append to `packages/web/test/zip-export.test.ts`:

```typescript
import { exportByAnimItemZip } from '../src/lib/zip-export';

describe('exportByAnimItemZip (F6)', () => {
  it('nests item PNGs under standard/<anim>/ folders', async () => {
    const sheet = makeWalkSheet();
    const selections = {
      bodyType: 'male',
      items: { body: { typeName: 'body', name: 'male light' } },
    };
    const itemDef = makeItem(50);
    const ctx: ExportContext = {
      sheet,
      selections,
      catalog: {
        byItemId: new Map([['body/male_light', itemDef]]),
        byTypeName: new Map([['body', [itemDef]]]),
        typeNames: ['body'],
        aliases: new Map(),
      },
      anim: 'walk',
      composeSingleItem: async () => sheet,
      adapter: makeAdapter(),
      onProgress: () => {},
    };
    const blob = await exportByAnimItemZip(ctx);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const keys = Object.keys(zip.files).sort();
    expect(keys).toContain('standard/walk/050 male_light.png');
    expect(keys).toContain('credits/credits.txt');
  });

  it('skips an item for an anim it does not declare', async () => {
    const sheet = makeWalkSheet();
    // Override sheet.animations to include slash even though the item only declares walk.
    const sheet2: ComposedSheet = { ...sheet, animations: ['walk', 'slash'] };
    const selections = {
      bodyType: 'male',
      items: { body: { typeName: 'body', name: 'male light' } },
    };
    const itemDef = makeItem(50);
    const ctx: ExportContext = {
      sheet: sheet2,
      selections,
      catalog: {
        byItemId: new Map([['body/male_light', itemDef]]),
        byTypeName: new Map([['body', [itemDef]]]),
        typeNames: ['body'],
        aliases: new Map(),
      },
      anim: 'walk',
      composeSingleItem: async () => sheet2,
      adapter: makeAdapter(),
      onProgress: () => {},
    };
    const blob = await exportByAnimItemZip(ctx);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const keys = Object.keys(zip.files);
    expect(keys).toContain('standard/walk/050 male_light.png');
    expect(keys.some((k) => k.startsWith('standard/slash/'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @lpc-toolkit/web test -- zip-export
```

Expected: FAIL — "exportByAnimItemZip is not exported".

- [ ] **Step 3: Implement F6**

Append to `packages/web/src/lib/zip-export.ts`:

```typescript
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
  const totalSlots = (standardAnims.length + customAnims.length) * metas.size;
  let done = 0;

  const writeAnim = async (
    folder: 'standard' | 'custom',
    animName: string,
  ): Promise<void> => {
    for (const [typeName, sel] of Object.entries(ctx.selections.items)) {
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
      const supports =
        folder === 'standard'
          ? itemSheet.animations.includes(animName)
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
      const blob = await encodeBlob(
        animCanvas.canvas as unknown as HTMLCanvasElement,
      );
      zip.file(`${folder}/${animName}/${filename}`, blob);
      done += 1;
      reportEncode(ctx, done, totalSlots);
    }
  };

  for (const anim of standardAnims) await writeAnim('standard', anim);
  for (const anim of customAnims) await writeAnim('custom', anim);

  writeCredits(zip, ctx.sheet, ctx.anim);

  return zip.generateAsync(
    { type: 'blob' },
    (meta) => reportGenerate(ctx, meta.percent),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @lpc-toolkit/web test -- zip-export
```

Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/zip-export.ts packages/web/test/zip-export.test.ts
git commit -m "feat(web/lib): add F6 exportByAnimItemZip"
```

---

## Task 9: F7 `exportByFrameZip`

**Files:**
- Modify: `packages/web/src/lib/zip-export.ts`
- Modify: `packages/web/test/zip-export.test.ts`

- [ ] **Step 1: Write failing F7 smoke test**

Append to `packages/web/test/zip-export.test.ts`:

```typescript
import { exportByFrameZip } from '../src/lib/zip-export';

describe('exportByFrameZip (F7)', () => {
  it('produces standard/<anim>/<dir>/<frame#>.png entries', async () => {
    const sheet = makeWalkSheet();
    const ctx: ExportContext = {
      sheet,
      selections: sheet.selections,
      catalog: {
        byItemId: new Map(),
        byTypeName: new Map(),
        typeNames: [],
        aliases: new Map(),
      },
      anim: 'walk',
      composeSingleItem: async () => sheet,
      adapter: makeAdapter(),
      onProgress: () => {},
    };
    const blob = await exportByFrameZip(ctx);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const keys = Object.keys(zip.files);
    // walk row group y=512..768, painted full 832×256, so all 13 cols × 4 dirs.
    expect(keys.filter((k) => k.startsWith('standard/walk/'))).toHaveLength(
      4 * 13,
    );
    expect(keys).toContain('standard/walk/down/3.png');
    expect(keys).toContain('credits/credits.txt');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @lpc-toolkit/web test -- zip-export
```

Expected: FAIL — "exportByFrameZip is not exported".

- [ ] **Step 3: Implement F7**

Append to `packages/web/src/lib/zip-export.ts`:

```typescript
import { extractAnimationFrames } from '@lpc-toolkit/core';

const yieldToUi = (): Promise<void> =>
  new Promise((r) => setTimeout(r, 0));

export async function exportByFrameZip(ctx: ExportContext): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  const standardAnims = ctx.sheet.animations;
  const customAnims = ctx.sheet.customAnimations
    ? [...ctx.sheet.customAnimations.keys()]
    : [];

  // First pass: extract every frame into memory so we know `total` for the
  // progress estimate. Frames are small (64×64), and we'd hold them anyway.
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
      skipEmpty: true,
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

  // Second pass: encode + add to zip, yielding to UI every 32 frames.
  const total = tasks.length;
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]!;
    const blob = await encodeBlob(
      t.canvas as unknown as HTMLCanvasElement,
    );
    zip.file(
      `${t.folder}/${t.animName}/${t.direction}/${t.frameNumber}.png`,
      blob,
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @lpc-toolkit/web test -- zip-export
```

Expected: 11 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/zip-export.ts packages/web/test/zip-export.test.ts
git commit -m "feat(web/lib): add F7 exportByFrameZip"
```

---

## Task 10: i18n keys for `download.zip*`

**Files:**
- Modify: `packages/web/src/i18n.ts`

- [ ] **Step 1: Locate the `download.*` block**

```bash
grep -n "'download\." packages/web/src/i18n.ts
```

Expected: shows 7 existing `download.*` keys in the `en` block (lines ~36–42) and 7 in the `zh` block (lines ~154–160).

- [ ] **Step 2: Insert 6 new keys after `download.done` in BOTH locales**

In `packages/web/src/i18n.ts`, change the English `'download.done': 'Saved ✓',` line to be followed by:

```typescript
    'download.done': 'Saved ✓',
    'download.zipByAnim': 'ZIP · By Animation',
    'download.zipByItem': 'ZIP · By Item',
    'download.zipByAnimItem': 'ZIP · Animation + Item',
    'download.zipByFrame': 'ZIP · By Frame',
    'download.zipSectionLabel': 'ZIP',
    'download.zipBusy': 'Packing…',
```

Then in the `zh-TW` block, after `'download.done': '已儲存 ✓',`:

```typescript
    'download.done': '已儲存 ✓',
    'download.zipByAnim': 'ZIP · 依動畫',
    'download.zipByItem': 'ZIP · 依項目',
    'download.zipByAnimItem': 'ZIP · 動畫 × 項目',
    'download.zipByFrame': 'ZIP · 逐 frame',
    'download.zipSectionLabel': 'ZIP',
    'download.zipBusy': '封包中…',
```

- [ ] **Step 3: Verify typecheck (TranslationKey union picks up new keys)**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: no errors.

- [ ] **Step 4: Verify i18n test still passes**

```bash
pnpm --filter @lpc-toolkit/web test -- i18n
```

Expected: PASS (existing test ensures every en key also exists in zh).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/i18n.ts
git commit -m "feat(web/i18n): add download.zip* keys (en + zh-TW)"
```

---

## Task 11: Wire `DownloadPopover` (4 ZIP buttons + progress) and harness state

**Files:**
- Modify: `packages/web/src/components/layer-stack/harness.tsx`
- Modify: `packages/web/src/components/layer-stack/popovers/download-popover.tsx`

> **Atomicity note:** The popover's props contract changes (`+5` props). Editing only the harness leaves the typecheck red; editing only the popover does too. Do all edits in this task before running typecheck. Commit harness + popover together as one commit.

- [ ] **Step 1: Replace `download-popover.tsx` entirely**

Replace the contents of `packages/web/src/components/layer-stack/popovers/download-popover.tsx` with:

```typescript
import { creditsToTxt, creditsToCsv } from '@lpc-toolkit/core';
import type {
  Catalog,
  ComposedSheet,
  Selections,
} from '@lpc-toolkit/core';
import { Button } from '../../ui/button';
import { usePopover } from './use-popover';
import { downloadBlob } from '../../../lib/download';
import {
  exportByAnimationZip,
  exportByItemZip,
  exportByAnimItemZip,
  exportByFrameZip,
  zipExportTimestamp,
  zipName,
  type ExportContext,
  type ZipExportKind,
} from '../../../lib/zip-export';
import { createBrowserCanvasAdapter } from '../../../adapter/browser-canvas-adapter';
import type { AssetSource } from '../../../adapter/asset-source';
import type { Translator } from '../../../i18n';
import type { ComposedResult } from '../../../hooks/use-composed-character';

interface ZipRunning {
  kind: ZipExportKind;
  progress: number;
}

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  result: ComposedResult;
  anim: string;
  selections: Selections;
  catalog: Catalog;
  assetSource: AssetSource;
  composeSingleItem: (s: Selections) => Promise<ComposedSheet>;
  zipRunning: ZipRunning | null;
  setZipRunning: (r: ZipRunning | null) => void;
  t: Translator;
  onStatus: (status: { kind: 'info' | 'error'; text: string }) => void;
}

export function DownloadPopover({
  open,
  setOpen,
  result,
  anim,
  selections,
  catalog,
  assetSource,
  composeSingleItem,
  zipRunning,
  setZipRunning,
  t,
  onStatus,
}: Props) {
  const { anchorRef, panelRef, pos } = usePopover(open, () => setOpen(false));
  const sheet: ComposedSheet | null = result.sheet;
  const disabled = sheet === null;
  const disabledReason =
    result.status === 'error' ? t('download.failed') : t('download.loading');
  const zipDisabled = disabled || zipRunning !== null;

  const handlePng = () => {
    if (!sheet) return;
    const canvas = sheet.canvas as unknown as HTMLCanvasElement;
    canvas.toBlob((blob) => {
      if (!blob) {
        onStatus({ kind: 'error', text: t('download.failed') });
        return;
      }
      downloadBlob(blob, 'character-spritesheet.png');
      onStatus({ kind: 'info', text: t('download.done') });
      setOpen(false);
    }, 'image/png');
  };

  const handleTxt = () => {
    if (!sheet) return;
    const txt = creditsToTxt(sheet.credits, anim);
    downloadBlob(new Blob([txt], { type: 'text/plain' }), 'credits.txt');
    onStatus({ kind: 'info', text: t('download.done') });
    setOpen(false);
  };

  const handleCsv = () => {
    if (!sheet) return;
    const csv = creditsToCsv(sheet.credits, anim);
    downloadBlob(new Blob([csv], { type: 'text/csv' }), 'credits.csv');
    onStatus({ kind: 'info', text: t('download.done') });
    setOpen(false);
  };

  const runZip = async (
    kind: ZipExportKind,
    fn: (ctx: ExportContext) => Promise<Blob>,
  ) => {
    if (!sheet) return;
    const frozenSheet = sheet;
    const frozenSelections = selections;
    const adapter = createBrowserCanvasAdapter(assetSource);
    setZipRunning({ kind, progress: 0 });
    try {
      const blob = await fn({
        sheet: frozenSheet,
        selections: frozenSelections,
        catalog,
        anim,
        composeSingleItem,
        adapter,
        onProgress: (p) => setZipRunning({ kind, progress: p }),
      });
      const filename = zipName(
        frozenSelections.bodyType,
        kind,
        zipExportTimestamp(),
      );
      downloadBlob(blob, filename);
      onStatus({ kind: 'info', text: t('download.done') });
    } catch (err) {
      console.error('ZIP export failed:', err);
      onStatus({ kind: 'error', text: t('download.failed') });
    } finally {
      setZipRunning(null);
    }
  };

  return (
    <>
      <Button
        ref={anchorRef}
        size="sm"
        variant={open ? 'primary' : 'default'}
        onClick={() => setOpen(!open)}
        title={disabled ? disabledReason : undefined}
      >
        ⬇ {t('download.title')}
      </Button>
      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
          className="w-72 rounded-md border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
            {t('download.title')}
          </div>
          <div className="flex flex-col gap-1">
            <Button size="sm" variant="primary" disabled={disabled} onClick={handlePng}>
              {t('download.png')}
            </Button>
            <Button size="sm" disabled={disabled} onClick={handleTxt}>
              {t('download.creditsTxt')}
            </Button>
            <Button size="sm" disabled={disabled} onClick={handleCsv}>
              {t('download.creditsCsv')}
            </Button>
          </div>
          <div className="my-2 flex items-center gap-2">
            <hr className="flex-1 border-border" />
            <span className="text-[10px] uppercase tracking-wide text-text-mute">
              {t('download.zipSectionLabel')}
            </span>
            <hr className="flex-1 border-border" />
          </div>
          <div className="flex flex-col gap-1">
            <Button
              size="sm"
              disabled={zipDisabled}
              onClick={() => runZip('byAnimation', exportByAnimationZip)}
            >
              {t('download.zipByAnim')}
            </Button>
            <Button
              size="sm"
              disabled={zipDisabled}
              onClick={() => runZip('byItem', exportByItemZip)}
            >
              {t('download.zipByItem')}
            </Button>
            <Button
              size="sm"
              disabled={zipDisabled}
              onClick={() => runZip('byAnimItem', exportByAnimItemZip)}
            >
              {t('download.zipByAnimItem')}
            </Button>
            <Button
              size="sm"
              disabled={zipDisabled}
              onClick={() => runZip('byFrame', exportByFrameZip)}
            >
              {t('download.zipByFrame')}
            </Button>
          </div>
          {zipRunning && (
            <div className="mt-2">
              <div className="h-1 w-full overflow-hidden rounded bg-border">
                <div
                  className="h-full bg-accent transition-[width] duration-150"
                  style={{ width: `${Math.round(zipRunning.progress * 100)}%` }}
                />
              </div>
              <div className="mt-1 text-[10px] text-text-mute">
                {t('download.zipBusy')} {Math.round(zipRunning.progress * 100)}%
              </div>
            </div>
          )}
          {disabled && !zipRunning && (
            <div className="mt-2 text-[10px] text-text-mute">{disabledReason}</div>
          )}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Update `harness.tsx` imports**

In `packages/web/src/components/layer-stack/harness.tsx`, replace the existing top-level `@lpc-toolkit/core` import line with:

```typescript
import {
  composeSelections,
  makeResolvePalette,
  type Catalog,
  type HashWarning,
  type PaletteMetadata,
  type Selections,
  type TypeName,
} from '@lpc-toolkit/core';
```

Add `useCallback` to the existing react import (change `import { useEffect, useState } from 'react';` to `import { useCallback, useEffect, useState } from 'react';`).

Add a new import below the existing imports:

```typescript
import { createBrowserCanvasAdapter } from '../../adapter/browser-canvas-adapter';
import { toSelections } from '../../slice/selection';
```

(`toSelections` is already exported from `slice/selection.ts` — verify with `grep -n "^export function toSelections" packages/web/src/slice/selection.ts`.)

- [ ] **Step 3: Add `zipRunning` state and `composeSingleItem` callback**

Inside `LayerStackHarness`, after `const [splitterRatio, setSplitterRatio] = useState(0.5);` (currently line ~57), insert:

```typescript
const [zipRunning, setZipRunning] = useState<null | {
  kind: 'byAnimation' | 'byItem' | 'byAnimItem' | 'byFrame';
  progress: number;
}>(null);

const composeSingleItem = useCallback(
  async (singleSelections: Selections) => {
    const adapter = createBrowserCanvasAdapter(props.assetSource);
    return composeSelections(singleSelections, {
      catalog: props.catalog,
      adapter,
      spritesheetsBaseUrl: '',
      resolvePalette: makeResolvePalette(
        props.catalog,
        props.palettes,
        singleSelections,
      ),
    });
  },
  [props.catalog, props.palettes, props.assetSource],
);
```

- [ ] **Step 4: Update the `<DownloadPopover>` JSX block**

Replace the existing `<DownloadPopover ...>` block with:

```typescript
<DownloadPopover
  open={popover === 'download'}
  setOpen={(v) => setPopover(v ? 'download' : null)}
  result={composeResult}
  anim={props.state.anim}
  selections={toSelections(props.state)}
  catalog={props.catalog}
  assetSource={props.assetSource}
  composeSingleItem={composeSingleItem}
  zipRunning={zipRunning}
  setZipRunning={setZipRunning}
  t={props.t}
  onStatus={(s) => setStatus(s)}
/>
```

`toSelections(props.state)` returns the canonical `Selections` shape (`{ bodyType, items }`) and filters out empty selections — same pattern used by `useComposedCharacter`.

- [ ] **Step 5: Run typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: no errors. If you see "unused import" warnings, remove the offending unused imports inline.

- [ ] **Step 6: Run full web tests**

```bash
pnpm --filter @lpc-toolkit/web test
```

Expected: all tests pass (existing + new zip-export tests).

- [ ] **Step 7: Commit both harness and popover changes**

```bash
git add packages/web/src/components/layer-stack/harness.tsx \
        packages/web/src/components/layer-stack/popovers/download-popover.tsx
git commit -m "feat(web): wire 4 ZIP export buttons + progress into DownloadPopover"
```

---

## Task 12: Manual QA pass + final regression checks

**Files:** none modified directly (fixes spin off into their own commits if needed)

- [ ] **Step 1: Run the dev server**

```bash
pnpm --filter @lpc-toolkit/web dev
```

Open the URL printed by Vite (typically `http://localhost:5173`).

- [ ] **Step 2: Verify jszip is lazy-loaded**

In the browser DevTools Network tab:
1. Hard-reload the page (Cmd+Shift+R / Ctrl+Shift+F5)
2. Confirm **no** `jszip` chunk appears
3. Click `⬇ Download` → click `ZIP · By Animation`
4. Confirm a chunk containing `jszip` is now loaded

Expected: lazy-load works; initial bundle does not contain jszip.

- [ ] **Step 3: Manually test each ZIP type with a representative outfit**

Reset → apply the Knight preset (or any preset with 5+ items including a body). For each of the 4 ZIP buttons:

1. Click the button
2. Verify the progress bar appears, climbs to 100%, then disappears
3. Verify `Saved ✓` toast appears
4. Open the downloaded ZIP in Finder / Explorer with the OS's built-in extractor
5. Verify the structure matches the design:
   - F4: `standard/*.png` + `credits/`
   - F5: `items/*.png` + `credits/`
   - F6: `standard/*/*.png` + `credits/`
   - F7: `standard/*/*/*.png` + `credits/`
6. Open one PNG from each ZIP in an image viewer and verify it renders correctly

- [ ] **Step 4: Verify custom-animation ZIP contents**

Select a body type that has a custom-animation item (e.g. wheelchair). Run F4 and F7. Verify `custom/wheelchair.png` (F4) and `custom/wheelchair/<dir>/<frame#>.png` (F7) appear.

- [ ] **Step 5: Verify disabled states**

1. Open DevTools → throttle to "Offline" mode and hard-reload — `sheet` will be null
2. Verify all 7 download buttons are disabled
3. Restore network → wait for sheet to load → all buttons enabled

While a ZIP is running:
1. Click one ZIP button
2. Confirm the other 3 ZIP buttons are immediately disabled
3. Confirm PNG/TXT/CSV buttons remain enabled

- [ ] **Step 6: Verify dark / light / i18n**

1. Toggle theme — verify popover, separator, progress bar all look correct in both
2. Toggle locale (en / zh-TW) — verify all 4 new ZIP labels render correctly

- [ ] **Step 7: Verify the "freeze on click" semantic**

1. Open popover, start `ZIP · By Frame` (slowest)
2. While the progress bar is running, change body type or click a different preset
3. Wait for the ZIP to finish
4. Open the ZIP — frames should reflect the **original** selection, not the new one

- [ ] **Step 8: Run final checks**

```bash
pnpm typecheck
pnpm test
```

Expected: both green.

- [ ] **Step 9: If any regressions found, fix in a separate commit**

If any of Steps 1–7 fail, create a single fix commit. The commit message should be `fix(web): <one-line description>`.

- [ ] **Step 10: Final commit (if everything was clean — otherwise the fix commit replaces this)**

No additional commit required if all manual checks pass.
