# Desktop 4-Direction Preview Design

Introduce a 4-direction layout preview selection on desktop screens, enabling the user to view character animations from all four directions (Up, Down, Left, Right) simultaneously. The layout will support three modes: Single Direction, 2x2 Grid, and 1x4 Horizontal Row.

## Problem Context

Currently, the web preview pane only displays one direction of the character animation at a time (e.g. only Up, Down, Left, or Right). On desktop devices with large displays, there is ample unused vertical and horizontal space in the preview pane. Allowing users to preview all 4 directions playing in sync is a highly requested feature for checking animation flows.

## Proposed Changes

### Selection Slice State

#### [MODIFY] [selection.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/slice/selection.ts)
- Add a new `layout` property of type `'single' | 'grid' | 'row'` to `SliceState` (defaulting to `'single'`).
- Add a new action `{ type: 'set_layout'; layout: 'single' | 'grid' | 'row' }` to `SliceAction`.
- Handle the `set_layout` action in `sliceReducer`.
- Update the `reset` action in `sliceReducer` to restore `layout` back to `init.layout` when the view scope is reset.
- Update `pickInitialSelections` to set `layout: 'single'` as part of the default state.

---

### UI Translations

#### [MODIFY] [i18n.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/i18n.ts)
- Add translation strings under `en` and `zh-TW` for the new layout modes:
```typescript
// under en
'layout.single': 'Single',
'layout.grid': 'Grid',
'layout.row': 'Row',

// under zh-TW
'layout.single': '單方向',
'layout.grid': '網格',
'layout.row': '水平排列',
```

---

### Animation Hook

#### [MODIFY] [use-animation-player.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/hooks/use-animation-player.ts)
- Export `AnimationTarget` interface:
```typescript
export interface AnimationTarget {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  dir: Direction;
}
```
- Implement and export `useMultiAnimationPlayer` hook:
```typescript
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

  // Extract canvas elements and directions individually for stable dependencies
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

---

### UI Components

#### [MODIFY] [preview-pane.tsx](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/components/layer-stack/preview-pane.tsx)
- Import `useMultiAnimationPlayer` and `type Direction`.
- Define canvas references inside the component:
  ```typescript
  const canvasRefSingle = useRef<HTMLCanvasElement | null>(null);
  const canvasRefUp = useRef<HTMLCanvasElement | null>(null);
  const canvasRefDown = useRef<HTMLCanvasElement | null>(null);
  const canvasRefLeft = useRef<HTMLCanvasElement | null>(null);
  const canvasRefRight = useRef<HTMLCanvasElement | null>(null);
  ```
- Memoize the active targets array:
  ```typescript
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
  ```
- Call `useMultiAnimationPlayer` instead of `useAnimationPlayer` using the memoized targets list:
  ```typescript
  const { currentFrame, totalFrames, fps } = useMultiAnimationPlayer(
    targets,
    result.animation,
    state.playing,
    state.zoom,
  );
  ```
- Update the action bar:
  - Add the layout switcher segmented button group:
    ```typescript
    <div className="flex gap-0.5 border-l border-border pl-2 sm:pl-3">
      {(['single', 'grid', 'row'] as const).map((l) => (
        <Button
          key={l}
          size="sm"
          variant={state.layout === l ? 'primary' : 'ghost'}
          onClick={() => dispatch({ type: 'set_layout', layout: l })}
        >
          {t(`layout.${l}`)}
        </Button>
      ))}
    </div>
    ```
  - Wrap the direction arrows selection in a condition: only render them if `state.layout === 'single'`.
- Update the preview pane container render logic:
  - Conditionally render the canvases based on `state.layout`:
    - **`'single'`**: Render the single centered canvas (as done previously).
    - **`'grid'`**: Render a 2x2 grid layout containing the four canvas targets.
    - **`'row'`**: Render a 1x4 flex row layout containing the four canvas targets.
  - In `'grid'` and `'row'` modes, add a small absolute positioned badge overlay for each canvas displaying the direction text (e.g. `Up (N)`, `Down (S)`, `Left (W)`, `Right (E)`), translated using `t('direction.<dir>')`.

---

## Verification Plan

### Automated Tests
- Run layout-related build validation checks.
- Verify that `pnpm typecheck` compiles clean.
- Verify that standard Playwright parity/preview tests pass (`pnpm test`).

### Manual Verification
- Launch the web client using `pnpm dev`.
- Verify layout switcher controls exist in the top bar.
- Switch to "Grid" mode, verify that 4 canvases render in a 2x2 grid and play in sync.
- Switch to "Row" mode, verify that 4 canvases render horizontally in a row and play in sync.
- Switch back to "Single", verify it functions identically to the previous version and direction arrows work.
