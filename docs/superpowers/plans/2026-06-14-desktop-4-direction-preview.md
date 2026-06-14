# Desktop 4-Direction Preview Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users on desktop screens to preview all four animation directions (Up, Down, Left, Right) playing in sync, using either a 2x2 Grid layout or a 1x4 Horizontal Row layout, with a switcher to toggle between them and the Single direction view.

**Architecture:** Add `layout` field to selection state. Create a unified `useMultiAnimationPlayer` hook to draw frames onto multiple canvases in sync. Update the `PreviewPane` to render these layouts with CSS Grid/Flex.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, HTML5 Canvas, Vitest

---

### Task 1: Update Selection Slice State and Actions

**Files:**
- Modify: `packages/web/src/slice/selection.ts:30-130`
- Test: `packages/web/test/slice/selection.test.ts` (Verify new reducer cases)

- [ ] **Step 1: Write test cases in `packages/web/test/slice/selection.test.ts` to verify layout actions**
  Add a test block:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { sliceReducer, pickInitialSelections } from '../../src/slice/selection';

  describe('selection slice layout', () => {
    it('sets layout correctly', () => {
      const { state: init } = pickInitialSelections(mockCatalog);
      expect(init.layout).toBe('single');
      const next = sliceReducer(init, { type: 'set_layout', layout: 'grid' });
      expect(next.layout).toBe('grid');
    });

    it('resets layout to init layout on reset view scope', () => {
      const { state: init } = pickInitialSelections(mockCatalog);
      const changed = sliceReducer(init, { type: 'set_layout', layout: 'row' });
      const resetState = sliceReducer(changed, {
        type: 'reset',
        scopes: { outfit: false, view: true },
        init,
      });
      expect(resetState.layout).toBe('single');
    });
  });
  ```
  *(Note: Re-use/import mockCatalog or test harness constants from existing selection tests).*

- [ ] **Step 2: Run tests to verify failure**
  Run: `rtk pnpm --filter @lpc-toolkit/web test run selection.test.ts`
  Expected: FAIL due to compilation errors (missing `layout` type and properties).

- [ ] **Step 3: Update `SliceState`, `SliceAction` and `sliceReducer` in `packages/web/src/slice/selection.ts`**
  Modify type definitions and logic:
  ```typescript
  // In SliceState interface:
  export interface SliceState {
    readonly bodyType: BodyType;
    readonly selections: Readonly<Record<TypeName, Selection>>;
    readonly anim: AnimationName;
    readonly dir: Direction;
    readonly playing: boolean;
    readonly zoom: number;
    readonly layout: 'single' | 'grid' | 'row';
  }

  // In SliceAction type:
  export type SliceAction =
    // ... existing actions ...
    | { type: 'set_layout'; layout: 'single' | 'grid' | 'row' };

  // In sliceReducer():
  // In case 'reset':
  if (a.scopes.view) {
    next = {
      ...next,
      anim: a.init.anim,
      dir: a.init.dir,
      playing: a.init.playing,
      zoom: a.init.zoom,
      layout: a.init.layout,
    };
  }

  // Add case 'set_layout':
  case 'set_layout':
    return { ...s, layout: a.layout };

  // In pickInitialSelections():
  return {
    state: {
      bodyType: DEFAULT_BODY_TYPE,
      selections,
      anim: 'walk',
      dir: 'down',
      playing: true,
      zoom: DEFAULT_ZOOM,
      layout: 'single',
    },
    shownTypeNames,
  };
  ```

- [ ] **Step 4: Run tests to verify success**
  Run: `rtk pnpm --filter @lpc-toolkit/web test run selection.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  rm -f .git/index.lock && git add packages/web/src/slice/selection.ts packages/web/test/slice/selection.test.ts
  rm -f .git/index.lock && git commit -m "feat(web): add layout state to selection slice"
  ```

---

### Task 2: Add Translations for Layout Switcher Labels

**Files:**
- Modify: `packages/web/src/i18n.ts:50-250`

- [ ] **Step 1: Add translation strings for English and Chinese**
  Locate `TRANSLATIONS` map in `packages/web/src/i18n.ts`. Under `en` section:
  ```typescript
      'layout.single': 'Single',
      'layout.grid': 'Grid',
      'layout.row': 'Row',
  ```
  Under `zh-TW` section:
  ```typescript
      'layout.single': '單方向',
      'layout.grid': '網格',
      'layout.row': '水平排列',
  ```

- [ ] **Step 2: Run typescript check to verify no errors**
  Run: `rtk pnpm --filter @lpc-toolkit/web exec tsc --noEmit`
  Expected: PASS

- [ ] **Step 3: Commit**
  ```bash
  rm -f .git/index.lock && git add packages/web/src/i18n.ts
  rm -f .git/index.lock && git commit -m "intl: add layout translation strings for en/zh-TW"
  ```

---

### Task 3: Implement Unified `useMultiAnimationPlayer` Hook

**Files:**
- Modify: `packages/web/src/hooks/use-animation-player.ts`
- Test: `packages/web/test/hooks/use-animation-player.test.ts`

- [ ] **Step 1: Write Vitest test case for `useMultiAnimationPlayer`**
  Add test in `packages/web/test/hooks/use-animation-player.test.ts` or create it if not existing:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { useMultiAnimationPlayer } from '../../src/hooks/use-animation-player';

  describe('useMultiAnimationPlayer', () => {
    it('exists and is defined', () => {
      expect(useMultiAnimationPlayer).toBeDefined();
    });
  });
  ```

- [ ] **Step 2: Run tests to verify failure**
  Run: `rtk pnpm --filter @lpc-toolkit/web test run use-animation-player`
  Expected: FAIL (missing export)

- [ ] **Step 3: Export `AnimationTarget` and implement `useMultiAnimationPlayer`**
  Modify `packages/web/src/hooks/use-animation-player.ts`:
  ```typescript
  import { useEffect, useState, type RefObject } from 'react';
  import {
    ANIMATION_CONFIGS,
    DIRECTIONS,
    customAnimations,
    type ComposedAnimation,
    type Direction,
  } from '@lpc-toolkit/core';
  import { frameRect } from '../slice/frame-rect';

  export interface AnimationTarget {
    canvasRef: RefObject<HTMLCanvasElement | null>;
    dir: Direction;
  }

  // Keep existing useAnimationPlayer for compatibility (or refactor it to call useMultiAnimationPlayer)
  export function useAnimationPlayer(
    canvasRef: RefObject<HTMLCanvasElement | null>,
    animation: ComposedAnimation | null,
    dir: Direction,
    playing: boolean,
    zoom: number,
  ): UseAnimationPlayerResult {
    return useMultiAnimationPlayer(
      [{ canvasRef, dir }],
      animation,
      playing,
      zoom
    );
  }

  export function useMultiAnimationPlayer(
    targets: AnimationTarget[],
    animation: ComposedAnimation | null,
    playing: boolean,
    zoom: number,
  ): UseAnimationPlayerResult {
    const [currentFrame, setCurrentFrame] = useState(0);

    const customDef = animation ? customAnimations[animation.animation as keyof typeof customAnimations] : null;
    const config = animation ? ANIMATION_CONFIGS[animation.animation as keyof typeof ANIMATION_CONFIGS] : null;

    const totalFrames = customDef
      ? (animation?.frameCount ?? 0)
      : (config?.cycle.length ?? 0);

    // Extract values individually for stable dependencies
    const el0 = targets[0]?.canvasRef.current;
    const el1 = targets[1]?.canvasRef.current;
    const el2 = targets[2]?.canvasRef.current;
    const el3 = targets[3]?.canvasRef.current;
    const dir0 = targets[0]?.dir;
    const dir1 = targets[1]?.dir;
    const dir2 = targets[2]?.dir;
    const dir3 = targets[3]?.dir;

    useEffect(() => {
      const activeTargets = targets.filter(t => t.canvasRef.current !== null);
      if (activeTargets.length === 0) {
        setCurrentFrame(0);
        return;
      }

      if (!animation || (!config && !customDef)) {
        for (const target of activeTargets) {
          if (target.canvasRef.current) {
            clearAnimationCanvas(target.canvasRef.current);
          }
        }
        setCurrentFrame(0);
        return;
      }

      const size = customDef ? customDef.frameSize : 64;
      const ctxs: { ctx: CanvasRenderingContext2D; dir: Direction; canvas: HTMLCanvasElement }[] = [];

      for (const target of activeTargets) {
        const canvas = target.canvasRef.current;
        if (!canvas) continue;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        canvas.width = size * zoom;
        canvas.height = size * zoom;
        ctx.imageSmoothingEnabled = false;
        ctxs.push({ ctx, dir: target.dir, canvas });
      }

      const src = animation.canvas as unknown as CanvasImageSource;
      let frame = 0;
      let raf = 0;
      let last = performance.now();
      let acc = 0;
      const step = 1000 / ANIMATION_FPS;

      const draw = () => {
        for (const { ctx, dir, canvas } of ctxs) {
          let sx = 0;
          let sy = 0;
          if (customDef) {
            const col = frame % animation.frameCount;
            const rowIndex = animation.directions === 1 ? 0 : Math.max(0, DIRECTIONS.indexOf(dir));
            sx = col * size;
            sy = rowIndex * size;
          } else if (config) {
            const r = frameRect(config, animation.directions, dir, frame);
            sx = r.sx;
            sy = r.sy;
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(
            src,
            sx, sy, size, size,
            0, 0, size * zoom, size * zoom,
          );
        }
      };

      draw();
      setCurrentFrame(0);
      if (!playing) return;

      const loop = (t: number) => {
        acc += t - last;
        last = t;
        while (acc >= step) {
          acc -= step;
          frame = (frame + 1) % totalFrames;
          draw();
          setCurrentFrame(frame);
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }, [
      animation,
      config,
      customDef,
      playing,
      zoom,
      totalFrames,
      el0, el1, el2, el3,
      dir0, dir1, dir2, dir3
    ]);

    return { currentFrame, totalFrames, fps: ANIMATION_FPS };
  }
  ```

- [ ] **Step 4: Run tests to verify success**
  Run: `rtk pnpm --filter @lpc-toolkit/web test run use-animation-player`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  rm -f .git/index.lock && git add packages/web/src/hooks/use-animation-player.ts packages/web/test/hooks/use-animation-player.test.ts
  rm -f .git/index.lock && git commit -m "feat(web): implement useMultiAnimationPlayer hook for multi-canvas playback"
  ```

---

### Task 4: Integrate Switcher and Render Grid/Row Layouts in `PreviewPane`

**Files:**
- Modify: `packages/web/src/components/layer-stack/preview-pane.tsx`

- [ ] **Step 1: Update imports, declare Refs, and setup `useMultiAnimationPlayer`**
  Modify the top of `PreviewPane` inside `packages/web/src/components/layer-stack/preview-pane.tsx`:
  ```typescript
  import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
  import { ANIMATION_CONFIGS, type Direction } from '@lpc-toolkit/core';
  import type { ComposedResult } from '../../hooks/use-composed-character';
  import { useMultiAnimationPlayer } from '../../hooks/use-animation-player';
  // ... rest of imports
  ```
  Replace `canvasRef` declaration with multiple refs:
  ```typescript
    const canvasRefSingle = useRef<HTMLCanvasElement | null>(null);
    const canvasRefUp = useRef<HTMLCanvasElement | null>(null);
    const canvasRefDown = useRef<HTMLCanvasElement | null>(null);
    const canvasRefLeft = useRef<HTMLCanvasElement | null>(null);
    const canvasRefRight = useRef<HTMLCanvasElement | null>(null);

    const targets = useMemo(() => {
      if (state.layout === 'single') {
        return [{ canvasRef: canvasRefSingle, dir: state.dir }];
      }
      return [
        { canvasRef: canvasRefUp, dir: 'up' as const },
        { canvasRef: canvasRefDown, dir: 'down' as const },
        { canvasRef: canvasRefLeft, dir: 'left' as const },
        { canvasRef: canvasRefRight, dir: 'right' as const },
      ];
    }, [state.layout, state.dir]);

    const { currentFrame, totalFrames, fps } = useMultiAnimationPlayer(
      targets,
      result.animation,
      state.playing,
      state.zoom,
    );
  ```

- [ ] **Step 2: Conditional Render for Layout Switcher Controls**
  In the top Action Bar (around line 118), render direction arrows conditionally:
  ```typescript
          {state.layout === 'single' && (
            <div className="flex gap-0.5">
              <Button size="sm" variant={state.dir === 'up' ? 'primary' : 'ghost'}
                className="w-6 px-0"
                onClick={() => dispatch({ type: 'set_dir', dir: 'up' })}>{DIR_LABEL.up}</Button>
              <Button size="sm" variant={state.dir === 'down' ? 'primary' : 'ghost'}
                className="w-6 px-0"
                onClick={() => dispatch({ type: 'set_dir', dir: 'down' })}>{DIR_LABEL.down}</Button>
              <Button size="sm" variant={state.dir === 'left' ? 'primary' : 'ghost'}
                className="w-6 px-0" onClick={() => dispatch({ type: 'set_dir', dir: 'left' })}>{DIR_LABEL.left}</Button>
              <Button size="sm" variant={state.dir === 'right' ? 'primary' : 'ghost'}
                className="w-6 px-0" onClick={() => dispatch({ type: 'set_dir', dir: 'right' })}>{DIR_LABEL.right}</Button>
            </div>
          )}
  ```
  Add the Layout Switcher buttons immediately after:
  ```typescript
          <div className="flex gap-0.5 border-l border-border pl-2 sm:pl-3">
            {(['single', 'grid', 'row'] as const).map((l) => (
              <Button
                key={l}
                size="sm"
                variant={state.layout === l ? 'primary' : 'ghost'}
                className="px-2"
                onClick={() => dispatch({ type: 'set_layout', layout: l })}
              >
                {t(`layout.${l}`)}
              </Button>
            ))}
          </div>
  ```

- [ ] **Step 3: Conditional Render for Preview Canvases**
  Update the main canvas rendering container (around line 169):
  Replace the single canvas render with:
  ```typescript
            {state.layout === 'single' && (
              <div className="flex h-full items-center justify-center">
                <canvas ref={canvasRefSingle} className="image-render-pixel max-h-full max-w-full" />
              </div>
            )}
            {state.layout === 'grid' && (
              <div className="grid grid-cols-2 gap-4 p-4 h-full w-full justify-items-center align-items-center overflow-auto">
                {([
                  { ref: canvasRefUp, dir: 'up' as const },
                  { ref: canvasRefDown, dir: 'down' as const },
                  { ref: canvasRefLeft, dir: 'left' as const },
                  { ref: canvasRefRight, dir: 'right' as const },
                ]).map(({ ref, dir }) => (
                  <div key={dir} className="relative border border-border/20 rounded bg-black/10 p-2 flex items-center justify-center min-h-0 min-w-0">
                    <canvas ref={ref} className="image-render-pixel max-h-full max-w-full" />
                    <div className="absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-text-2">
                      {t(`direction.${dir}`)} ({DIR_SHORT[dir]})
                    </div>
                  </div>
                ))}
              </div>
            )}
            {state.layout === 'row' && (
              <div className="flex flex-row gap-4 p-4 h-full w-full justify-center items-center overflow-x-auto overflow-y-hidden">
                {([
                  { ref: canvasRefUp, dir: 'up' as const },
                  { ref: canvasRefDown, dir: 'down' as const },
                  { ref: canvasRefLeft, dir: 'left' as const },
                  { ref: canvasRefRight, dir: 'right' as const },
                ]).map(({ ref, dir }) => (
                  <div key={dir} className="relative border border-border/20 rounded bg-black/10 p-2 flex items-center justify-center min-h-0 min-w-0 flex-1 h-full">
                    <canvas ref={ref} className="image-render-pixel max-h-full max-w-full" />
                    <div className="absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-text-2">
                      {t(`direction.${dir}`)} ({DIR_SHORT[dir]})
                    </div>
                  </div>
                ))}
              </div>
            )}
  ```
  *(Update layout details to fit screen correctly, keeping overlays like composition-loading-overlay and top-left/top-right settings overlays aligned properly relative to the parent relative container).*

- [ ] **Step 4: Build check & tests check**
  Run: `rtk pnpm build`
  Expected: Success without TypeScript or lint errors.

- [ ] **Step 5: Commit**
  ```bash
  rm -f .git/index.lock && git add packages/web/src/components/layer-stack/preview-pane.tsx
  rm -f .git/index.lock && git commit -m "feat(web): support Grid and Row layout layouts in PreviewPane"
  ```
