# Full Spritesheet Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Full Spritesheet Preview panel to v2 web UI — collapsible, sits below the single-animation preview, with transparency-grid + replace-pink-mask toggles and Fit/1×/2×/4× zoom. Also reorganize PreviewPane so the action bar (N/S/E/W, anim, play, frame counter, dice + new Full Sheet toggle) lives **above** the single preview instead of below it.

**Architecture:** Three small pure-function modules in `packages/web/src/lib/` (rendering algorithm + splitter math), two new React components in `packages/web/src/components/layer-stack/` (splitter + Full Sheet panel), and a refactor of `preview-pane.tsx` + `harness.tsx`. State (5 keys) is session-only `useState` in `LayerStackHarness`. No `packages/core` changes. The render function takes raw `HTMLCanvasElement` (the browser adapter already produces real DOM canvases), with `@napi-rs/canvas` standing in for tests (structurally compatible).

**Tech Stack:** TypeScript strict, React 18 functional components + hooks, Tailwind utility classes, Vitest (`environment: 'node'`, **no jsdom** — pure functions only get tests; React components are hand-written without unit tests, matching the rest of `packages/web/src/components/`), pnpm workspaces. `@napi-rs/canvas` already in `packages/web/devDependencies`.

**Reference spec:** `docs/superpowers/specs/2026-05-26-full-spritesheet-preview-design.md`

---

## File Structure

**Create:**
- `packages/web/src/lib/full-sheet-render.ts` — `drawTransparencyBackground` / `applyTransparencyMaskToCanvas` / `renderFullSheet`
- `packages/web/test/full-sheet-render.test.ts`
- `packages/web/src/lib/splitter-math.ts` — `clampRatio` / `computeRatioFromPointer`
- `packages/web/test/splitter-math.test.ts`
- `packages/web/src/components/layer-stack/preview-pane-splitter.tsx` — draggable horizontal splitter
- `packages/web/src/components/layer-stack/full-spritesheet-preview.tsx` — Full Sheet panel

**Modify:**
- `packages/web/src/i18n.ts` — 8 new `fullSheet.*` keys (en + zh-TW)
- `packages/web/src/components/layer-stack/preview-pane.tsx` — action bar moves to top; conditional splitter + panel below the single preview canvas; accept 5 new props
- `packages/web/src/components/layer-stack/harness.tsx` — 5 new `useState` + props pipe to `PreviewPane`

**Untouched (do not edit):**
- `packages/core/**`
- `upstream/**` (read-only submodule)
- Existing tests in `packages/web/test/` and `packages/core/test/`

---

## Setup

**Branch:** Before Task 1, create the feature branch.

```bash
git checkout -b feat/full-spritesheet-preview
git status   # should show clean tree on the new branch
```

If working in a worktree (per `superpowers:using-git-worktrees`), confirm the worktree is on `feat/full-spritesheet-preview` instead.

---

## Task 1: Add i18n keys for Full Sheet

**Files:**
- Modify: `packages/web/src/i18n.ts`

- [ ] **Step 1: Add 8 keys to the `en:` block**

In `packages/web/src/i18n.ts`, locate the `'download.done': 'Saved ✓',` line (around line 42) and insert the new keys immediately after it (before `'controls.pause'`):

```ts
    'fullSheet.toggle': 'Full Sheet',
    'fullSheet.title': 'Full Spritesheet',
    'fullSheet.grid': 'Grid',
    'fullSheet.mask': 'Replace Pink',
    'fullSheet.zoom.fit': 'Fit',
    'fullSheet.close': 'Close',
    'fullSheet.loading': 'Sheet is still composing…',
    'fullSheet.error': 'Failed to compose',
```

- [ ] **Step 2: Add the same 8 keys to the `zh-TW:` block**

Locate `'download.done': '已儲存 ✓',` (around line 152) and insert after it (before `'controls.pause'`):

```ts
    'fullSheet.toggle': '完整圖集',
    'fullSheet.title': '完整圖集預覽',
    'fullSheet.grid': '棋盤背景',
    'fullSheet.mask': '替換粉紅遮罩',
    'fullSheet.zoom.fit': '適應',
    'fullSheet.close': '關閉',
    'fullSheet.loading': '圖集編譯中…',
    'fullSheet.error': '編譯失敗',
```

- [ ] **Step 3: Verify typecheck still passes**

Run: `pnpm -F @lpc-toolkit/web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/i18n.ts
git commit -m "$(cat <<'EOF'
feat(web/i18n): add fullSheet.* keys (en + zh-TW)

Foundation for Sub-project C (Full Spritesheet Preview).
EOF
)"
```

---

## Task 2: Implement `full-sheet-render.ts` with TDD

**Files:**
- Create: `packages/web/src/lib/full-sheet-render.ts`
- Test: `packages/web/test/full-sheet-render.test.ts`

This module exports three functions. We test them with `@napi-rs/canvas` (already in devDeps); its `Canvas` is structurally compatible with `HTMLCanvasElement` for the methods we use (`getContext('2d')`, `width`/`height`), and its `SKRSContext2D` is a superset of `CanvasRenderingContext2D` for `clearRect`, `fillRect`, `fillStyle`, `getImageData`, `putImageData`, `drawImage`, `imageSmoothingEnabled`. Tests cast napi canvas to `HTMLCanvasElement` at the boundary (`as unknown as HTMLCanvasElement`) — same pattern as `download-popover.tsx:29`.

- [ ] **Step 1: Write the failing test file**

Create `packages/web/test/full-sheet-render.test.ts`:

```ts
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import {
  drawTransparencyBackground,
  applyTransparencyMaskToCanvas,
  renderFullSheet,
} from '../src/lib/full-sheet-render';

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  // napi-rs/canvas is structurally compatible with HTMLCanvasElement for
  // the subset we use (getContext('2d'), width, height).
  return createCanvas(width, height) as unknown as HTMLCanvasElement;
}

function pixelAt(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
): [number, number, number, number] {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  const { data } = ctx.getImageData(x, y, 1, 1);
  return [data[0]!, data[1]!, data[2]!, data[3]!];
}

describe('drawTransparencyBackground', () => {
  it('fills an 8×8 checkerboard with #CCCCCC light and #999999 dark', () => {
    const canvas = makeCanvas(16, 16);
    const ctx = canvas.getContext('2d')!;
    drawTransparencyBackground(ctx, 16, 16);

    // (0,0) is "even row, even col" → light
    expect(pixelAt(canvas, 0, 0)).toEqual([0xcc, 0xcc, 0xcc, 0xff]);
    // (8,0) is "even row, odd col" → dark
    expect(pixelAt(canvas, 8, 0)).toEqual([0x99, 0x99, 0x99, 0xff]);
    // (0,8) is "odd row, even col" → dark
    expect(pixelAt(canvas, 0, 8)).toEqual([0x99, 0x99, 0x99, 0xff]);
    // (8,8) is "odd row, odd col" → light
    expect(pixelAt(canvas, 8, 8)).toEqual([0xcc, 0xcc, 0xcc, 0xff]);
  });

  it('honours a custom square size', () => {
    const canvas = makeCanvas(8, 8);
    const ctx = canvas.getContext('2d')!;
    drawTransparencyBackground(ctx, 8, 8, 4);

    expect(pixelAt(canvas, 0, 0)).toEqual([0xcc, 0xcc, 0xcc, 0xff]);
    expect(pixelAt(canvas, 4, 0)).toEqual([0x99, 0x99, 0x99, 0xff]);
  });
});

describe('applyTransparencyMaskToCanvas', () => {
  it('clears RGB(255,44,230) pixels with alpha > 0 to alpha 0', () => {
    const canvas = makeCanvas(2, 1);
    const ctx = canvas.getContext('2d')!;
    // Pixel (0,0): magic pink, opaque  → should become alpha 0
    // Pixel (1,0): plain red, opaque   → unchanged
    const img = ctx.getImageData(0, 0, 2, 1);
    img.data[0] = 255; img.data[1] = 44;  img.data[2] = 230; img.data[3] = 255;
    img.data[4] = 255; img.data[5] = 0;   img.data[6] = 0;   img.data[7] = 255;
    ctx.putImageData(img, 0, 0);

    applyTransparencyMaskToCanvas(ctx, 2, 1);

    expect(pixelAt(canvas, 0, 0)).toEqual([255, 44, 230, 0]);
    expect(pixelAt(canvas, 1, 0)).toEqual([255, 0, 0, 255]);
  });

  it('does not touch fully transparent magic-pink pixels', () => {
    const canvas = makeCanvas(1, 1);
    const ctx = canvas.getContext('2d')!;
    const img = ctx.getImageData(0, 0, 1, 1);
    img.data[0] = 255; img.data[1] = 44; img.data[2] = 230; img.data[3] = 0;
    ctx.putImageData(img, 0, 0);

    applyTransparencyMaskToCanvas(ctx, 1, 1);

    // Reading a fully-transparent pixel: RGB may be normalized to 0 by some
    // canvas implementations; alpha is the load-bearing assertion here.
    expect(pixelAt(canvas, 0, 0)[3]).toBe(0);
  });
});

describe('renderFullSheet', () => {
  it('copies source to display canvas at full size when grid+mask off', () => {
    const source = makeCanvas(4, 2);
    const sCtx = source.getContext('2d')!;
    const sImg = sCtx.getImageData(0, 0, 4, 2);
    // Fill source with solid blue (0,0,255,255) everywhere
    for (let i = 0; i < sImg.data.length; i += 4) {
      sImg.data[i] = 0; sImg.data[i + 1] = 0; sImg.data[i + 2] = 255; sImg.data[i + 3] = 255;
    }
    sCtx.putImageData(sImg, 0, 0);

    const display = makeCanvas(1, 1); // wrong size — renderFullSheet must resize
    renderFullSheet(display, source, { grid: false, mask: false });

    expect(display.width).toBe(4);
    expect(display.height).toBe(2);
    expect(pixelAt(display, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(display, 3, 1)).toEqual([0, 0, 255, 255]);
  });

  it('draws checkerboard behind the sprite when grid=true', () => {
    const source = makeCanvas(16, 16);
    // leave source fully transparent
    const display = makeCanvas(16, 16);
    renderFullSheet(display, source, { grid: true, mask: false });

    // Top-left tile should be light gray (since source is transparent)
    expect(pixelAt(display, 0, 0)).toEqual([0xcc, 0xcc, 0xcc, 0xff]);
    // Adjacent tile (x=8) should be dark gray
    expect(pixelAt(display, 8, 0)).toEqual([0x99, 0x99, 0x99, 0xff]);
  });

  it('applies mask without mutating source canvas when mask=true', () => {
    const source = makeCanvas(1, 1);
    const sCtx = source.getContext('2d')!;
    const sImg = sCtx.getImageData(0, 0, 1, 1);
    sImg.data[0] = 255; sImg.data[1] = 44; sImg.data[2] = 230; sImg.data[3] = 255;
    sCtx.putImageData(sImg, 0, 0);

    const display = makeCanvas(1, 1);
    renderFullSheet(display, source, { grid: false, mask: true });

    // Display: magic pink should be alpha 0
    expect(pixelAt(display, 0, 0)[3]).toBe(0);
    // Source MUST still be the original opaque magic-pink pixel
    expect(pixelAt(source as unknown as HTMLCanvasElement, 0, 0)).toEqual([
      255, 44, 230, 255,
    ]);
  });

  it('layers grid behind masked sprite when both flags are on', () => {
    const source = makeCanvas(16, 16);
    const sCtx = source.getContext('2d')!;
    // Top-left pixel: magic pink opaque → after mask becomes transparent →
    // grid should show through. Use a 16×16 to fall fully within one 8px tile.
    const sImg = sCtx.getImageData(0, 0, 1, 1);
    sImg.data[0] = 255; sImg.data[1] = 44; sImg.data[2] = 230; sImg.data[3] = 255;
    sCtx.putImageData(sImg, 0, 0);

    const display = makeCanvas(16, 16);
    renderFullSheet(display, source, { grid: true, mask: true });

    // At (0,0): grid light gray shows through the cleared mask pixel
    expect(pixelAt(display, 0, 0)).toEqual([0xcc, 0xcc, 0xcc, 0xff]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @lpc-toolkit/web test full-sheet-render`
Expected: FAIL with `Cannot find module '../src/lib/full-sheet-render'` (or similar — the source file does not exist yet).

- [ ] **Step 3: Create the implementation file**

Create `packages/web/src/lib/full-sheet-render.ts`:

```ts
/**
 * Render a `ComposedSheet.canvas` onto a display canvas with optional
 * transparency-grid background and pink-mask replacement. Algorithm and
 * constants byte-identical to upstream `canvas-utils.ts` /
 * `mask.ts` / `preview-canvas.ts`. Never mutates the source canvas.
 */

const GRID_LIGHT = '#CCCCCC';
const GRID_DARK = '#999999';
const GRID_TILE_DEFAULT = 8;

const MASK_R = 255;
const MASK_G = 44;
const MASK_B = 230;

/**
 * Draw an 8×8 checkerboard (or custom tile) over the entire context, in
 * #CCCCCC / #999999 — matches upstream `drawTransparencyBackground`.
 */
export function drawTransparencyBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  squareSize: number = GRID_TILE_DEFAULT,
): void {
  for (let y = 0; y < height; y += squareSize) {
    for (let x = 0; x < width; x += squareSize) {
      const isEvenRow = Math.floor(y / squareSize) % 2 === 0;
      const isEvenCol = Math.floor(x / squareSize) % 2 === 0;
      const isLight = isEvenRow === isEvenCol;
      ctx.fillStyle = isLight ? GRID_LIGHT : GRID_DARK;
      ctx.fillRect(x, y, squareSize, squareSize);
    }
  }
}

/**
 * Replace every opaque RGB(255,44,230) "magic pink" pixel with full
 * transparency. Mutates `ctx`'s pixel buffer in place (callers must own
 * the canvas or operate on a copy). Algorithm byte-identical to
 * upstream `applyTransparencyMaskToCanvas`.
 */
export function applyTransparencyMaskToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const imgData = ctx.getImageData(0, 0, width, height);
  const pix = imgData.data;
  const n = pix.length;
  for (let i = 0; i < n; i += 4) {
    const a = pix[i + 3]!;
    if (a > 0) {
      if (pix[i] === MASK_R && pix[i + 1] === MASK_G && pix[i + 2] === MASK_B) {
        pix[i + 3] = 0;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

export interface RenderFullSheetOptions {
  readonly grid: boolean;
  readonly mask: boolean;
}

/**
 * Resize `displayCanvas` to match `sourceCanvas`, then render in this
 * order: clear → (optional) grid → (optional) mask-on-tmpCanvas → drawImage.
 * Never mutates `sourceCanvas` (matches upstream `copyToPreviewCanvas`
 * which uses a tmpCanvas for the same reason — toggling mask multiple
 * times must remain idempotent).
 */
export function renderFullSheet(
  displayCanvas: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement,
  options: RenderFullSheetOptions,
): void {
  const { width, height } = sourceCanvas;
  displayCanvas.width = width;
  displayCanvas.height = height;

  const ctx = displayCanvas.getContext('2d');
  if (!ctx) throw new Error('renderFullSheet: failed to acquire 2d context');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);

  if (options.grid) {
    drawTransparencyBackground(ctx, width, height);
  }

  if (options.mask) {
    // tmpCanvas keeps the mutation off `sourceCanvas`. document.createElement
    // is fine here because this function is browser-only (lives in web/lib).
    const tmp = document.createElement('canvas');
    tmp.width = width;
    tmp.height = height;
    const tmpCtx = tmp.getContext('2d');
    if (!tmpCtx) throw new Error('renderFullSheet: failed to acquire tmp 2d context');
    tmpCtx.imageSmoothingEnabled = false;
    tmpCtx.drawImage(sourceCanvas, 0, 0);
    applyTransparencyMaskToCanvas(tmpCtx, width, height);
    ctx.drawImage(tmp, 0, 0);
  } else {
    ctx.drawImage(sourceCanvas, 0, 0);
  }
}
```

**Note for the implementer:** The implementation uses `document.createElement('canvas')`. Tests run in Node where `document` is undefined. The mask-path test (`renderFullSheet ... mask=true`) will therefore need `document` stubbed. Add this to the test file (top of the `renderFullSheet` describe block):

- [ ] **Step 4: Add `document` stub for the mask-path tests**

Update `packages/web/test/full-sheet-render.test.ts` — add this near the top of the file (right after the `pixelAt` helper):

```ts
import { vi, beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  // renderFullSheet uses `document.createElement('canvas')` for the
  // tmpCanvas when mask=true. Stub it with @napi-rs/canvas so the Node
  // test environment can exercise that path.
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`unexpected createElement: ${tag}`);
      return createCanvas(1, 1) as unknown as HTMLCanvasElement;
    },
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});
```

Also add the imports at the top:

```ts
import { vi, beforeAll, afterAll, describe, expect, it } from 'vitest';
```

(replacing the existing `import { describe, expect, it } from 'vitest';`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm -F @lpc-toolkit/web test full-sheet-render`
Expected: all tests in `full-sheet-render.test.ts` PASS (8 tests across 3 `describe` blocks).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/lib/full-sheet-render.ts packages/web/test/full-sheet-render.test.ts
git commit -m "$(cat <<'EOF'
feat(web/lib): add full-sheet-render with grid + mask algorithms

Pure rendering module for Sub-project C. Grid (#CCCCCC/#999999 8px
checkerboard) and pink-mask (RGB 255,44,230 → alpha 0) algorithms
byte-identical to upstream canvas-utils.ts / mask.ts. tmpCanvas
indirection keeps source canvas pristine across toggles.

Tested with @napi-rs/canvas (structurally compatible with HTMLCanvasElement).
EOF
)"
```

---

## Task 3: Implement `splitter-math.ts` with TDD

**Files:**
- Create: `packages/web/src/lib/splitter-math.ts`
- Test: `packages/web/test/splitter-math.test.ts`

Pure math helpers for the draggable splitter. Separated from the React component so they can be unit-tested without DOM.

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/splitter-math.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  clampRatio,
  computeRatioFromPointer,
  SPLITTER_MIN_RATIO,
  SPLITTER_MAX_RATIO,
} from '../src/lib/splitter-math';

describe('clampRatio', () => {
  it('returns the input when within [0.15, 0.85]', () => {
    expect(clampRatio(0.5)).toBe(0.5);
    expect(clampRatio(0.15)).toBe(0.15);
    expect(clampRatio(0.85)).toBe(0.85);
  });

  it('clamps below 0.15 to 0.15', () => {
    expect(clampRatio(0)).toBe(0.15);
    expect(clampRatio(-0.5)).toBe(0.15);
    expect(clampRatio(0.149)).toBe(0.15);
  });

  it('clamps above 0.85 to 0.85', () => {
    expect(clampRatio(1)).toBe(0.85);
    expect(clampRatio(1.5)).toBe(0.85);
    expect(clampRatio(0.851)).toBe(0.85);
  });

  it('exports the bounds for reuse', () => {
    expect(SPLITTER_MIN_RATIO).toBe(0.15);
    expect(SPLITTER_MAX_RATIO).toBe(0.85);
  });
});

describe('computeRatioFromPointer', () => {
  it('returns the relative position when pointer is inside the container', () => {
    // Container at y=100, height=400. Pointer at y=300 → (300-100)/400 = 0.5
    expect(computeRatioFromPointer(300, 100, 400)).toBe(0.5);
  });

  it('clamps to [0.15, 0.85] when pointer is outside', () => {
    // Pointer well above container top
    expect(computeRatioFromPointer(0, 100, 400)).toBe(0.15);
    // Pointer below container bottom
    expect(computeRatioFromPointer(600, 100, 400)).toBe(0.85);
  });

  it('returns 0.85 when containerHeight is zero (degenerate)', () => {
    // (pointerY - top) / 0 = ±Infinity; clamp catches it and returns max.
    expect(computeRatioFromPointer(100, 0, 0)).toBe(0.85);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @lpc-toolkit/web test splitter-math`
Expected: FAIL with `Cannot find module '../src/lib/splitter-math'`.

- [ ] **Step 3: Create the implementation**

Create `packages/web/src/lib/splitter-math.ts`:

```ts
export const SPLITTER_MIN_RATIO = 0.15;
export const SPLITTER_MAX_RATIO = 0.85;

export function clampRatio(
  ratio: number,
  min: number = SPLITTER_MIN_RATIO,
  max: number = SPLITTER_MAX_RATIO,
): number {
  if (ratio < min || Number.isNaN(ratio)) return min;
  if (ratio > max) return max;
  return ratio;
}

/**
 * Compute splitter ratio given the pointer's y coordinate, the splitter
 * container's top y, and its height. The ratio is the **top child's**
 * share of available height. Result is clamped to [0.15, 0.85].
 *
 * Degenerate `containerHeight === 0` falls through to clampRatio, which
 * pins NaN / ±Infinity to `SPLITTER_MIN_RATIO` (NaN) or
 * `SPLITTER_MAX_RATIO` (+Infinity) — the +Infinity branch covers a
 * positive (pointerY - containerTop) divided by zero, which is the only
 * realistic case in our pointer-drag flow.
 */
export function computeRatioFromPointer(
  pointerY: number,
  containerTop: number,
  containerHeight: number,
): number {
  const raw = (pointerY - containerTop) / containerHeight;
  return clampRatio(raw);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -F @lpc-toolkit/web test splitter-math`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/splitter-math.ts packages/web/test/splitter-math.test.ts
git commit -m "$(cat <<'EOF'
feat(web/lib): add splitter-math helpers (clamp + pointer-to-ratio)

Pure helpers for Sub-project C splitter. Ratio clamp [0.15, 0.85],
degenerate zero-height container resolves to the max bound.
EOF
)"
```

---

## Task 4: Implement `PreviewPaneSplitter` component

**Files:**
- Create: `packages/web/src/components/layer-stack/preview-pane-splitter.tsx`

No unit tests (no jsdom — matches existing pattern; the math is already tested in Task 3).

- [ ] **Step 1: Create the component**

Create `packages/web/src/components/layer-stack/preview-pane-splitter.tsx`:

```tsx
import { useCallback, useEffect, useRef } from 'react';
import { computeRatioFromPointer } from '../../lib/splitter-math';

export interface PreviewPaneSplitterProps {
  /**
   * The y-coordinate (in viewport pixels) of the splitter container's
   * top edge. Used together with `containerHeight` to translate raw
   * pointer-y into a ratio.
   */
  containerTop: number;
  containerHeight: number;
  onChange: (next: number) => void;
}

/**
 * Draggable horizontal splitter (4–6px tall). Holds no ratio state of
 * its own; emits `onChange(next)` continuously during pointer drag. The
 * parent owns the ratio state.
 */
export function PreviewPaneSplitter({
  containerTop,
  containerHeight,
  onChange,
}: PreviewPaneSplitterProps) {
  const draggingRef = useRef(false);
  const handleRef = useRef<HTMLDivElement | null>(null);

  // Stash latest container metrics so the document-level pointermove
  // listener (attached once when drag starts) sees fresh values without
  // re-binding on every parent re-render.
  const topRef = useRef(containerTop);
  const heightRef = useRef(containerHeight);
  useEffect(() => {
    topRef.current = containerTop;
    heightRef.current = containerHeight;
  }, [containerTop, containerHeight]);

  const onMove = useCallback(
    (e: PointerEvent) => {
      if (!draggingRef.current) return;
      onChange(
        computeRatioFromPointer(e.clientY, topRef.current, heightRef.current),
      );
    },
    [onChange],
  );

  const onUp = useCallback(() => {
    draggingRef.current = false;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [onMove]);

  const onDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      draggingRef.current = true;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [onMove, onUp],
  );

  // Safety cleanup if component unmounts mid-drag.
  useEffect(() => {
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [onMove, onUp]);

  return (
    <div
      ref={handleRef}
      role="separator"
      aria-orientation="horizontal"
      onPointerDown={onDown}
      className="group relative h-1.5 cursor-ns-resize bg-border hover:bg-accent/60 transition-colors"
    >
      <div className="pointer-events-none absolute inset-x-0 -inset-y-1" />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm -F @lpc-toolkit/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/layer-stack/preview-pane-splitter.tsx
git commit -m "$(cat <<'EOF'
feat(web): add PreviewPaneSplitter component

Draggable horizontal splitter that emits a [0.15, 0.85] ratio via
onChange. Stateless — parent owns ratio. Document-level pointermove
listener attaches on pointerdown so dragging works even when the cursor
leaves the splitter handle.
EOF
)"
```

---

## Task 5: Implement `FullSpritesheetPreview` component

**Files:**
- Create: `packages/web/src/components/layer-stack/full-spritesheet-preview.tsx`

No unit tests (no jsdom).

- [ ] **Step 1: Create the component**

Create `packages/web/src/components/layer-stack/full-spritesheet-preview.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import type { ComposedSheet } from '@lpc-toolkit/core';
import { renderFullSheet } from '../../lib/full-sheet-render';
import type { Translator } from '../../i18n';
import { Button } from '../ui/button';

export type FullSheetZoom = 'fit' | 1 | 2 | 4;

export interface FullSpritesheetPreviewProps {
  sheet: ComposedSheet | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  grid: boolean;
  mask: boolean;
  zoom: FullSheetZoom;
  onGrid: (v: boolean) => void;
  onMask: (v: boolean) => void;
  onZoom: (v: FullSheetZoom) => void;
  onClose: () => void;
  t: Translator;
}

const ZOOM_PRESETS: readonly FullSheetZoom[] = ['fit', 1, 2, 4];

export function FullSpritesheetPreview({
  sheet,
  status,
  grid,
  mask,
  zoom,
  onGrid,
  onMask,
  onZoom,
  onClose,
  t,
}: FullSpritesheetPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const display = canvasRef.current;
    if (!display || !sheet) return;
    // ComposedSheet.canvas is a CanvasLike; the browser adapter returns a
    // real HTMLCanvasElement — same cast pattern as download-popover.tsx.
    const source = sheet.canvas as unknown as HTMLCanvasElement;
    renderFullSheet(display, source, { grid, mask });
  }, [sheet, grid, mask]);

  const canvasStyle: React.CSSProperties =
    zoom === 'fit'
      ? { maxWidth: '100%', height: 'auto', imageRendering: 'pixelated' }
      : sheet
        ? {
            width: `${sheet.width * zoom}px`,
            height: 'auto',
            imageRendering: 'pixelated',
          }
        : { imageRendering: 'pixelated' };

  const zoomLabel = (z: FullSheetZoom): string =>
    z === 'fit' ? t('fullSheet.zoom.fit') : `${z}×`;

  return (
    <section
      className="flex min-h-0 flex-col border-t border-border bg-surface"
      aria-label={t('fullSheet.title')}
    >
      <header className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-1.5 text-xs">
        <span className="font-semibold uppercase tracking-wide text-text-mute">
          {t('fullSheet.title')}
        </span>
        <label className="ml-2 flex items-center gap-1">
          <input
            type="checkbox"
            checked={grid}
            onChange={(e) => onGrid(e.currentTarget.checked)}
          />
          {t('fullSheet.grid')}
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={mask}
            onChange={(e) => onMask(e.currentTarget.checked)}
          />
          {t('fullSheet.mask')}
        </label>
        <div className="ml-auto flex items-center gap-0.5 rounded bg-surface p-0.5">
          {ZOOM_PRESETS.map((z) => (
            <button
              key={String(z)}
              type="button"
              onClick={() => onZoom(z)}
              className={[
                'rounded px-2 py-0.5 font-mono text-[10px] font-semibold',
                zoom === z
                  ? 'bg-accent text-accent-ink'
                  : 'text-text-2 hover:bg-white/10',
              ].join(' ')}
            >
              {zoomLabel(z)}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          aria-label={t('fullSheet.close')}
          title={t('fullSheet.close')}
        >
          ✕
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-app">
        {status === 'loading' && !sheet && (
          <div className="flex h-full items-center justify-center text-xs text-text-mute">
            {t('fullSheet.loading')}
          </div>
        )}
        {status === 'error' && (
          <div className="flex h-full items-center justify-center text-xs text-text-mute">
            {t('fullSheet.error')}
          </div>
        )}
        {sheet && (
          <canvas
            ref={canvasRef}
            style={canvasStyle}
            className="block"
            aria-label={t('fullSheet.title')}
          />
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm -F @lpc-toolkit/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/layer-stack/full-spritesheet-preview.tsx
git commit -m "$(cat <<'EOF'
feat(web): add FullSpritesheetPreview panel component

Header with Grid / Pink toggles, Fit/1×/2×/4× zoom, and a close button.
Body shows a display canvas re-rendered via renderFullSheet on every
sheet/grid/mask change. Loading / error placeholders for non-ready
compose status. CSS-only zoom (max-width:100% for fit, fixed width for
1×/2×/4×) with image-rendering: pixelated.
EOF
)"
```

---

## Task 6: Reorganize PreviewPane and lift state in LayerStackHarness

This is the integration task. Touches both `preview-pane.tsx` and `harness.tsx`. Outcome:

1. Action bar moves from the bottom of PreviewPane to **above** the single preview canvas.
2. A new `Full Sheet` toggle button is appended (rightmost) to the action bar.
3. When `fullSheetOpen === true`, render `<PreviewPaneSplitter />` + `<FullSpritesheetPreview />` below the single preview, with the splitter ratio driving heights via inline flex-basis styles.
4. 5 new `useState` hooks live in `LayerStackHarness` and pipe through `PreviewPane`'s props.

**Files:**
- Modify: `packages/web/src/components/layer-stack/preview-pane.tsx`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

- [ ] **Step 1: Replace `preview-pane.tsx` with the reorganized layout**

Replace the entire contents of `packages/web/src/components/layer-stack/preview-pane.tsx` with:

```tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ANIMATION_CONFIGS, type Direction } from '@lpc-toolkit/core';
import type { ComposedResult } from '../../hooks/use-composed-character';
import { useAnimationPlayer } from '../../hooks/use-animation-player';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  type SliceAction,
  type SliceState,
} from '../../slice/selection';
import type { Catalog } from '@lpc-toolkit/core';
import { Button } from '../ui/button';
import { pickRandomOutfit } from '../../slice/random-outfit';
import type { Translator } from '../../i18n';
import {
  FullSpritesheetPreview,
  type FullSheetZoom,
} from './full-spritesheet-preview';
import { PreviewPaneSplitter } from './preview-pane-splitter';

const DIR_LABEL: Record<Direction, string> = { up: '↑', left: '←', down: '↓', right: '→' };
const DIR_SHORT: Record<Direction, 'N' | 'S' | 'E' | 'W'> = {
  up: 'N', down: 'S', left: 'W', right: 'E',
};

export interface FullSheetUiState {
  open: boolean;
  grid: boolean;
  mask: boolean;
  zoom: FullSheetZoom;
  splitterRatio: number;
}

export interface FullSheetUiActions {
  setOpen: (v: boolean) => void;
  setGrid: (v: boolean) => void;
  setMask: (v: boolean) => void;
  setZoom: (v: FullSheetZoom) => void;
  setSplitterRatio: (v: number) => void;
}

interface Props {
  catalog: Catalog;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  t: Translator;
  result: ComposedResult;
  fullSheet: FullSheetUiState;
  fullSheetActions: FullSheetUiActions;
}

export function PreviewPane({
  catalog,
  state,
  dispatch,
  t,
  result,
  fullSheet,
  fullSheetActions,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(state.zoom);
  useEffect(() => {
    zoomRef.current = state.zoom;
  }, [state.zoom]);

  const { currentFrame, totalFrames, fps } = useAnimationPlayer(
    canvasRef, result.animation, state.dir, state.playing, state.zoom,
  );

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1 : -1;
      dispatch({ type: 'set_zoom', zoom: zoomRef.current + delta });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [dispatch]);

  // Splitter needs absolute viewport y + height of the *split container*
  // (the region under the action bar). Measure on layout and on resize.
  const [splitMetrics, setSplitMetrics] = useState({ top: 0, height: 0 });
  useLayoutEffect(() => {
    if (!fullSheet.open) return;
    const el = splitContainerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSplitMetrics({ top: rect.top, height: rect.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [fullSheet.open]);

  return (
    <div ref={previewRef} className="relative flex h-full min-h-0 flex-col">
      {/* Action bar — now at the TOP, above the single preview. */}
      <div className="flex items-center gap-3 border-b border-border bg-surface px-3 py-2 text-xs">
        <div className="grid grid-cols-2 gap-0.5">
          <Button size="sm" variant={state.dir === 'up' ? 'primary' : 'ghost'}
            className="col-span-2 w-6 px-0"
            onClick={() => dispatch({ type: 'set_dir', dir: 'up' })}>{DIR_LABEL.up}</Button>
          <Button size="sm" variant={state.dir === 'left' ? 'primary' : 'ghost'}
            className="w-6 px-0" onClick={() => dispatch({ type: 'set_dir', dir: 'left' })}>{DIR_LABEL.left}</Button>
          <Button size="sm" variant={state.dir === 'right' ? 'primary' : 'ghost'}
            className="w-6 px-0" onClick={() => dispatch({ type: 'set_dir', dir: 'right' })}>{DIR_LABEL.right}</Button>
          <Button size="sm" variant={state.dir === 'down' ? 'primary' : 'ghost'}
            className="col-span-2 w-6 px-0"
            onClick={() => dispatch({ type: 'set_dir', dir: 'down' })}>{DIR_LABEL.down}</Button>
        </div>

        <select className="rounded-md border border-border bg-surface-2 px-2 py-1"
          value={state.anim}
          onChange={(e) => dispatch({ type: 'set_anim', anim: e.target.value as typeof state.anim })}>
          {Object.keys(ANIMATION_CONFIGS).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'toggle_play' })}>
          {state.playing ? '⏸' : '▶'}
        </Button>

        <span className="ml-auto font-mono text-[10px] text-text-mute">
          f{String(currentFrame + 1).padStart(2, '0')}/
          {String(totalFrames).padStart(2, '0')} · {fps}fps
        </span>
        <button
          type="button"
          onClick={() => dispatch({
            type: 'apply_selections',
            selections: pickRandomOutfit({ catalog, bodyType: state.bodyType }),
          })}
          title={t('randomize.title')}
          className="rounded px-2 py-1 text-text-mute hover:bg-surface-2"
        >
          🎲
        </button>

        <Button
          size="sm"
          variant={fullSheet.open ? 'primary' : 'default'}
          onClick={() => fullSheetActions.setOpen(!fullSheet.open)}
          title={t('fullSheet.toggle')}
        >
          {fullSheet.open ? '▲' : '▼'} {t('fullSheet.toggle')}
        </Button>
      </div>

      {/* Split container — single preview + (optional) splitter + Full Sheet. */}
      <div ref={splitContainerRef} className="flex min-h-0 flex-1 flex-col">
        {/* Single preview canvas (with existing overlays). */}
        <div
          className="relative overflow-hidden"
          style={{
            flex: fullSheet.open ? `${fullSheet.splitterRatio} 1 0` : '1 1 0',
            minHeight: 0,
          }}
        >
          <div className="flex h-full items-center justify-center">
            <canvas ref={canvasRef} className="image-render-pixel max-h-full max-w-full" />
          </div>
          <div className="absolute top-3 left-3 z-10 rounded bg-black/40 px-2 py-0.5 font-mono text-[10px] text-text-2 backdrop-blur-md">
            {state.anim} · {DIR_SHORT[state.dir]} · {state.zoom}× · f{String(currentFrame + 1).padStart(2, '0')}
          </div>
          <div className="absolute top-3 right-3 z-10 flex items-center gap-0.5 rounded bg-black/40 p-0.5 backdrop-blur-md">
            <button
              type="button"
              disabled={state.zoom <= MIN_ZOOM}
              aria-label={t('controls.zoomOut')}
              onClick={() =>
                dispatch({ type: 'set_zoom', zoom: state.zoom - 1 })
              }
              className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold text-text-2 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              −
            </button>
            {[1, 2, 4, 8].map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => dispatch({ type: 'set_zoom', zoom: z })}
                className={[
                  'rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold',
                  state.zoom === z
                    ? 'bg-accent text-accent-ink'
                    : 'text-text-2 hover:bg-white/10',
                ].join(' ')}
              >
                {z}×
              </button>
            ))}
            <button
              type="button"
              disabled={state.zoom >= MAX_ZOOM}
              aria-label={t('controls.zoomIn')}
              onClick={() =>
                dispatch({ type: 'set_zoom', zoom: state.zoom + 1 })
              }
              className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold text-text-2 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              +
            </button>
          </div>
        </div>

        {fullSheet.open && (
          <>
            <PreviewPaneSplitter
              containerTop={splitMetrics.top}
              containerHeight={splitMetrics.height}
              onChange={fullSheetActions.setSplitterRatio}
            />
            <div
              style={{ flex: `${1 - fullSheet.splitterRatio} 1 0`, minHeight: 0 }}
              className="flex min-h-0 flex-col"
            >
              <FullSpritesheetPreview
                sheet={result.sheet}
                status={result.status}
                grid={fullSheet.grid}
                mask={fullSheet.mask}
                zoom={fullSheet.zoom}
                onGrid={fullSheetActions.setGrid}
                onMask={fullSheetActions.setMask}
                onZoom={fullSheetActions.setZoom}
                onClose={() => fullSheetActions.setOpen(false)}
                t={t}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `harness.tsx` to own the 5 state values + pass props**

Open `packages/web/src/components/layer-stack/harness.tsx`. Inside the `LayerStackHarness` component, locate the existing `useState` block (around line 42–47):

```ts
  const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>(null);
  const [status, setStatus] = useState<{ kind: 'info' | 'warn' | 'error'; text: string } | null>(null);
  const [popover, setPopover] = useState<null | 'bodyType' | 'token' | 'reset' | 'attribution' | 'download'>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [expanded, setExpanded] = useState<TypeName | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);
```

Add 5 more `useState` calls **after** `reloadCounter` (and add the import for `FullSheetZoom` at the top):

```ts
import type { FullSheetUiState, FullSheetUiActions } from './preview-pane';
import type { FullSheetZoom } from './full-spritesheet-preview';
```

```ts
  const [fullSheetOpen, setFullSheetOpen] = useState(false);
  const [fullSheetGrid, setFullSheetGrid] = useState(false);
  const [fullSheetMask, setFullSheetMask] = useState(false);
  const [fullSheetZoom, setFullSheetZoom] = useState<FullSheetZoom>('fit');
  const [splitterRatio, setSplitterRatio] = useState(0.5);

  const fullSheet: FullSheetUiState = {
    open: fullSheetOpen,
    grid: fullSheetGrid,
    mask: fullSheetMask,
    zoom: fullSheetZoom,
    splitterRatio,
  };
  const fullSheetActions: FullSheetUiActions = {
    setOpen: setFullSheetOpen,
    setGrid: setFullSheetGrid,
    setMask: setFullSheetMask,
    setZoom: setFullSheetZoom,
    setSplitterRatio,
  };
```

Then locate the `<PreviewPane ... />` JSX (around line 216–222) and add the two new props at the bottom:

```tsx
          <PreviewPane
            catalog={props.catalog}
            state={props.state}
            dispatch={props.dispatch}
            t={t}
            result={composeResult}
            fullSheet={fullSheet}
            fullSheetActions={fullSheetActions}
          />
```

- [ ] **Step 3: Verify typecheck and lint**

Run: `pnpm -F @lpc-toolkit/web typecheck`
Expected: no errors.

Run: `pnpm -F @lpc-toolkit/web lint`
Expected: no errors.

- [ ] **Step 4: Run the full vitest suite to catch any regression**

Run: `pnpm -F @lpc-toolkit/web test`
Expected: all existing tests pass + the 2 new test files from Tasks 2 and 3 pass. No failures.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/layer-stack/preview-pane.tsx packages/web/src/components/layer-stack/harness.tsx
git commit -m "$(cat <<'EOF'
feat(web): reorganize PreviewPane + wire Full Sheet panel

- Action bar moves from below the single preview to above it
- New Full Sheet toggle button (rightmost, ml-auto) appended to bar
- When toggled open: PreviewPaneSplitter + FullSpritesheetPreview
  render below the single preview, with ratio driving flex-basis
- LayerStackHarness owns 5 new useState (open/grid/mask/zoom/ratio),
  passes as { fullSheet, fullSheetActions } props
- Splitter container measured via ResizeObserver + window resize for
  pointer-to-ratio math

Closes Sub-project C (F9 + F10 + F11).
EOF
)"
```

---

## Task 7: Final verification

**Files:** none modified; runs checks only.

- [ ] **Step 1: Run all packages typecheck**

Run: `pnpm -r typecheck`
Expected: every package reports 0 errors. If `pnpm -r typecheck` is not defined, fall back to running per-package: `pnpm -F @lpc-toolkit/core typecheck && pnpm -F @lpc-toolkit/web typecheck`.

- [ ] **Step 2: Run all packages tests**

Run: `pnpm -r test`
Expected: all tests pass across `@lpc-toolkit/core` and `@lpc-toolkit/web`. No skipped failures.

- [ ] **Step 3: Run lint**

Run: `pnpm -F @lpc-toolkit/web lint`
Expected: no errors.

- [ ] **Step 4: Manual smoke test in the dev server**

Run: `pnpm -F @lpc-toolkit/web dev`
Then open the dev URL (default `http://localhost:5173`) and verify:

1. PreviewPane action bar is now **above** the single preview canvas.
2. Bar contents (left→right): N/S/E/W cluster, anim dropdown (`walk` default), play `▶`, frame counter (`f01/08 · 30fps`), dice `🎲`, then **rightmost** `▼ Full Sheet` button.
3. Clicking `▼ Full Sheet`: button switches to `▲ Full Sheet` (primary variant), splitter + panel appear below the single preview.
4. Panel header: `FULL SPRITESHEET` (or i18n equivalent), `☐ Grid`, `☐ Replace Pink`, `Fit | 1× | 2× | 4×` (Fit highlighted), `✕`.
5. Toggle Grid: checkerboard background visible behind sprite.
6. Toggle Replace Pink: any magic-pink mask pixels become transparent (most stock sprites won't have any, so this may be a no-op visually — that's correct).
7. Drag the splitter handle: ratio changes smoothly; clamps at top/bottom so both panes always have height.
8. Zoom buttons: Fit shrinks the sheet to panel width; 1× shows actual size (832 wide → likely horizontal scroll); 2× / 4× scale up further.
9. `✕` or re-pressing `▲ Full Sheet`: panel collapses, single preview returns to full height.
10. Switch language (zh-TW): all `fullSheet.*` strings render Chinese.
11. Switch theme (dark / light): panel header colors still readable, splitter handle still visible.
12. Switch character (e.g., via a preset): Full Sheet panel re-renders the new sheet while keeping the open state and Grid/Mask/Zoom values.

If any step fails, file a follow-up commit fixing the specific issue before declaring the branch ready.

- [ ] **Step 5: Confirm branch is ready for merge**

Run: `git log --oneline main..HEAD`
Expected: 6 commits (one per Task 1–6).

```bash
git status   # clean tree
```

Sub-project C complete — ready to hand off to `superpowers:finishing-a-development-branch`.

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Implemented in |
|---|---|
| Action bar moved to single-preview top | Task 6 step 1 |
| Full Sheet toggle button rightmost in action bar | Task 6 step 1 |
| Toggle opens panel below single preview, conditional unmount | Task 6 step 1 (`{fullSheet.open && ( ... )}`) |
| Splitter draggable, ratio clamp [0.15, 0.85] | Tasks 3 + 4 |
| Grid (8px / `#CCCCCC` / `#999999` byte-identical to upstream) | Task 2 + tests |
| Mask (RGB 255,44,230 → alpha 0) byte-identical to upstream | Task 2 + tests |
| Render never mutates source canvas | Task 2 step 3 + test "applies mask without mutating source canvas" |
| Zoom Fit / 1× / 2× / 4×, CSS only, `image-rendering: pixelated` | Task 5 step 1 |
| Custom-animation sheet height (sheet.height) handled directly | Task 5 step 1 (uses `sheet.width` / `sheet.height` from props; `renderFullSheet` reads from source) |
| Loading / error placeholders, not force-close on sheet change | Task 5 step 1 (status-driven body branches; panel stays mounted) |
| 5 state values session-only in LayerStackHarness | Task 6 step 2 |
| Defaults: closed / off / off / Fit / 0.5 | Task 6 step 2 (`useState(false / false / false / 'fit' / 0.5)`) |
| i18n keys (en + zh-TW) | Task 1 |
| Frame helper deferred to D | Confirmed in spec; not in any plan task |

**Placeholder scan:** ran a mental search for "TBD", "TODO", "later", "appropriate", "similar to" — none found. Every code block is complete; every command has an expected outcome.

**Type consistency:** `FullSheetZoom` defined in `full-spritesheet-preview.tsx` (Task 5) and imported by `harness.tsx` (Task 6 step 2). `FullSheetUiState` / `FullSheetUiActions` defined and exported in `preview-pane.tsx` (Task 6 step 1) and imported by `harness.tsx` (Task 6 step 2). All `setX` / `setOnX` naming aligned (`setOpen` / `setGrid` / `setMask` / `setZoom` / `setSplitterRatio`).
