# Layer Stack v2 Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring v2 web UI cosmetic / polish layer into alignment with `reference/v2` design — Loading moves to top bar, preview gets chrome readout + frame counter + zoom presets + Randomize, LayerRow gets a color ramp swatch hint, top bar gets a Logo wordmark, and SettingsCollapsible shows the active license-filter badge while collapsed.

**Architecture:** One hook refactor(`useAnimationPlayer` exposes `{currentFrame, totalFrames, fps}`), one new pure util(`random-outfit.ts` for Feeling Lucky), and small surgical changes to four existing components. No `packages/core/` changes. Task 10 (LayerRow color ramp) depends on Spec 1's `ItemThumbnail` being in place.

**Tech Stack:** TypeScript strict, React 18, Tailwind, Vitest, pnpm.

**Reference spec:** `docs/superpowers/specs/2026-05-25-layer-stack-v2-polish-design.md`

**Spec 1 dependency:** Tasks 1-9 can run independently of Spec 1. Task 10 must run **after** Spec 1's Task 5 (ItemThumbnail integration).

---

## File Structure

**Create:**
- `packages/web/src/slice/random-outfit.ts` — Feeling Lucky generator (pure)
- `packages/web/test/random-outfit.test.ts`

**Modify:**
- `packages/web/src/hooks/use-animation-player.ts` — return `{currentFrame, totalFrames, fps}`
- `packages/web/src/i18n.ts` — add `randomize.title` key
- `packages/web/src/components/layer-stack/preview-pane.tsx` — chrome readout / frame counter / zoom presets / Randomize / remove loading display
- `packages/web/src/components/layer-stack/harness.tsx` — own compose status, pass loadingProgress to TopBar
- `packages/web/src/components/layer-stack/top-bar.tsx` — Logo wordmark + Loading indicator
- `packages/web/src/components/layer-stack/settings-collapsible.tsx` — filter badge in collapsed header
- `packages/web/src/components/layer-stack/layer-row.tsx` — color ramp swatch in main-row subtitle (Task 10 only)

---

## Task 1: Refactor useAnimationPlayer to expose frame state

**Files:**
- Modify: `packages/web/src/hooks/use-animation-player.ts`
- Modify: `packages/web/src/components/layer-stack/preview-pane.tsx` (minimal — consume new return value)

(No test for the hook itself; the only stateful logic is RAF-driven and React-coupled, which doesn't fit the project's pure-function-only test convention.)

- [ ] **Step 1: Modify the hook to return frame state**

Replace `packages/web/src/hooks/use-animation-player.ts` with:

```ts
import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  ANIMATION_CONFIGS,
  type ComposedAnimation,
  type Direction,
} from '@lpc-toolkit/core';
import { frameRect } from '../slice/frame-rect';

export const ANIMATION_FPS = 8;

export interface UseAnimationPlayerResult {
  readonly currentFrame: number;
  readonly totalFrames: number;
  readonly fps: number;
}

/**
 * Draws one direction of `animation` to `canvasRef` at integer `zoom`,
 * advancing through ANIMATION_CONFIGS[name].cycle at ANIMATION_FPS.
 * Pauses (holds frame 0) when `playing` is false or there is no animation.
 *
 * Returns the current frame index (0-based), the total frames in the
 * animation cycle, and the FPS. React re-renders at ANIMATION_FPS while
 * playing — keep heavy work out of consumers that read these values.
 */
export function useAnimationPlayer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  animation: ComposedAnimation | null,
  dir: Direction,
  playing: boolean,
  zoom: number,
): UseAnimationPlayerResult {
  const [currentFrame, setCurrentFrame] = useState(0);
  const config = animation ? ANIMATION_CONFIGS[animation.animation] : null;
  const totalFrames = config?.cycle.length ?? 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !animation || !config) {
      setCurrentFrame(0);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = 64;
    canvas.width = size * zoom;
    canvas.height = size * zoom;
    ctx.imageSmoothingEnabled = false;

    const src = animation.canvas as unknown as CanvasImageSource;
    let frame = 0;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const step = 1000 / ANIMATION_FPS;

    const draw = () => {
      const r = frameRect(config, animation.directions, dir, frame);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        src,
        r.sx, r.sy, r.size, r.size,
        0, 0, size * zoom, size * zoom,
      );
    };

    draw();
    setCurrentFrame(0);
    if (!playing) return;

    const loop = (t: number) => {
      acc += t - last;
      last = t;
      while (acc >= step) {
        acc -= step;
        frame = (frame + 1) % config.cycle.length;
        draw();
        setCurrentFrame(frame);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, animation, config, dir, playing, zoom]);

  return { currentFrame, totalFrames, fps: ANIMATION_FPS };
}
```

- [ ] **Step 2: Update PreviewPane to consume the new return value**

In `packages/web/src/components/layer-stack/preview-pane.tsx`, update the existing `useAnimationPlayer` call (around `line 29`):

```tsx
const { currentFrame, totalFrames, fps } = useAnimationPlayer(
  canvasRef, result.animation, state.dir, state.playing, state.zoom,
);
```

(Values are unused for now — Tasks 4 and later will display them. This step just keeps the call site compiling under the new signature.)

- [ ] **Step 3: Type-check + tests**

Run: `pnpm --filter @lpc-toolkit/web exec tsc --noEmit && pnpm --filter @lpc-toolkit/web test`
Expected: PASS. (No behavior change in dev server.)

- [ ] **Step 4: Smoke-test**

Run: `pnpm --filter @lpc-toolkit/web dev`
Open `?ui=v2`. Confirm:
- Canvas still animates (Play/Pause works)
- No visible change in UI
- No console errors

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/use-animation-player.ts \
  packages/web/src/components/layer-stack/preview-pane.tsx
git commit -m "refactor(web): useAnimationPlayer exposes {currentFrame, totalFrames, fps}

Adds React state to track the current frame index, enabling future UI
(chrome readout, frame counter). Re-renders at 8fps while playing —
no behavior change for existing canvas rendering. ANIMATION_FPS
export replaces the previous module-private constant."
```

---

## Task 2: i18n new key

**Files:**
- Modify: `packages/web/src/i18n.ts`

- [ ] **Step 1: Add `randomize.title` to both locale blocks**

In `packages/web/src/i18n.ts`, add to the `en:` block (after existing keys, before the closing `}`):

```ts
    'randomize.title': 'Randomize outfit',
```

Add to the `'zh-TW':` block (same position):

```ts
    'randomize.title': '隨機生成',
```

(Note: `status.loading`, `app.subtitle`, and `filters.title` already exist and will be reused. We do not add new keys for them.)

- [ ] **Step 2: Verify key parity**

Run: `pnpm --filter @lpc-toolkit/web test i18n`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/i18n.ts
git commit -m "feat(web): i18n key for randomize button"
```

---

## Task 3: random-outfit util + tests

**Files:**
- Create: `packages/web/src/slice/random-outfit.ts`
- Create: `packages/web/test/random-outfit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/random-outfit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import { pickRandomOutfit } from '../src/slice/random-outfit';

function makeItem(name: string, typeName: string, layerKey: 'male' | 'female' = 'male'): ItemDefinition {
  return {
    name,
    type_name: typeName,
    animations: ['walk'],
    credits: [{ file: '', notes: '', authors: ['A'], licenses: ['CC0'], urls: [] }],
    layer_1: { zPos: 10, [layerKey]: `${typeName}/${name}/` },
  } as unknown as ItemDefinition;
}

// Deterministic RNG: returns a sequence of values from `values`.
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('pickRandomOutfit', () => {
  const { catalog } = createCatalog({
    'body/light.json':       makeItem('Light', 'body'),
    'body/dark.json':        makeItem('Dark', 'body'),
    'head/round.json':       makeItem('Round', 'head'),
    'eyes/blue.json':        makeItem('Blue', 'eyes'),
    'hair/curly.json':       makeItem('Curly', 'hair'),
    'hair/spiky.json':       makeItem('Spiky', 'hair'),
    'cape/red.json':         makeItem('Red Cape', 'cape'),
    'weapon/sword.json':     makeItem('Sword', 'weapon'),
    'unknown_type/foo.json': makeItem('Foo', 'unknown_type'),
  });

  it('always picks a body type compatible body item (required category)', () => {
    const sel = pickRandomOutfit({ catalog, bodyType: 'male', rng: seqRng([0]) });
    expect(sel.items['body']).toBeDefined();
  });

  it('skips categories with no compatible items', () => {
    const femaleOnly: ItemDefinition = makeItem('FemaleHair', 'hair', 'female');
    const { catalog: c2 } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'hair/female.json': femaleOnly,
    });
    // rng=1.0 means add everything; but FemaleHair is incompat for male
    const sel = pickRandomOutfit({
      catalog: c2, bodyType: 'male', rng: () => 0.99, optionalProb: 1.0,
    });
    expect(sel.items['hair']).toBeUndefined();
  });

  it('respects optionalProb: 0 produces no optional categories', () => {
    const sel = pickRandomOutfit({
      catalog, bodyType: 'male', rng: () => 0.5, optionalProb: 0,
    });
    // body / head / eyes are required (group 'body' members);
    // hair / cape / weapon are optional and excluded
    expect(sel.items['hair']).toBeUndefined();
    expect(sel.items['cape']).toBeUndefined();
    expect(sel.items['weapon']).toBeUndefined();
  });

  it('respects optionalProb: 1 includes every optional category that has compatible items', () => {
    const sel = pickRandomOutfit({
      catalog, bodyType: 'male', rng: () => 0.5, optionalProb: 1.0,
    });
    expect(sel.items['hair']).toBeDefined();
    expect(sel.items['cape']).toBeDefined();
    expect(sel.items['weapon']).toBeDefined();
  });

  it('returns the configured bodyType', () => {
    const sel = pickRandomOutfit({ catalog, bodyType: 'female', rng: () => 0 });
    expect(sel.bodyType).toBe('female');
  });

  it('is deterministic for a given rng', () => {
    const a = pickRandomOutfit({
      catalog, bodyType: 'male', rng: seqRng([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]),
    });
    const b = pickRandomOutfit({
      catalog, bodyType: 'male', rng: seqRng([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]),
    });
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lpc-toolkit/web test random-outfit`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `packages/web/src/slice/random-outfit.ts`:

```ts
import type {
  BodyType,
  Catalog,
  Selection,
  Selections,
  TypeName,
} from '@lpc-toolkit/core';
import { itemSupportsBodyType } from './catalog-tree';
import { CATEGORY_GROUPS } from './category-groups';

export interface PickRandomOutfitArgs {
  readonly catalog: Catalog;
  readonly bodyType: BodyType;
  readonly rng?: () => number;          // defaults to Math.random
  readonly optionalProb?: number;       // defaults to 0.5
}

// The `body` super-group's typeNames are treated as required (always
// included if a compatible item exists). All other typeNames are
// optional (included with probability `optionalProb`).
const REQUIRED_GROUP_ID = 'body';

/**
 * Generate a Feeling Lucky outfit. Required categories (body-part group)
 * always get an item; optional categories are included with probability
 * `optionalProb`. Compatible items only.
 */
export function pickRandomOutfit(args: PickRandomOutfitArgs): Selections {
  const rng = args.rng ?? Math.random;
  const optionalProb = args.optionalProb ?? 0.5;

  const requiredGroup = CATEGORY_GROUPS.find((g) => g.id === REQUIRED_GROUP_ID);
  const requiredTypes = new Set<TypeName>(requiredGroup?.typeNames ?? []);
  const allGroupedTypes = new Set<TypeName>(
    CATEGORY_GROUPS.flatMap((g) => g.typeNames),
  );

  const items: Record<TypeName, Selection> = {};
  for (const typeName of allGroupedTypes) {
    const isRequired = requiredTypes.has(typeName);
    if (!isRequired && rng() > optionalProb) continue;

    const defs = args.catalog.byTypeName.get(typeName) ?? [];
    const compatible = defs.filter((d) => itemSupportsBodyType(d, args.bodyType));
    if (compatible.length === 0) continue;

    const pick = compatible[Math.floor(rng() * compatible.length)];
    items[typeName] = { typeName, name: pick.name };
  }

  return { bodyType: args.bodyType, items };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lpc-toolkit/web test random-outfit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/slice/random-outfit.ts \
  packages/web/test/random-outfit.test.ts
git commit -m "feat(web): pickRandomOutfit util for Feeling Lucky randomize

Required categories (body super-group) always picked; optional
categories included with probability (default 0.5). Compatible
items only. Seedable rng for tests."
```

---

## Task 4: Preview chrome readout + frame counter

**Files:**
- Modify: `packages/web/src/components/layer-stack/preview-pane.tsx`

- [ ] **Step 1: Add chrome readout (top-left) and frame counter (bottom)**

In `packages/web/src/components/layer-stack/preview-pane.tsx`:

(a) Add constant near the top of the file (after existing `DIR_LABEL`):

```tsx
const DIR_SHORT: Record<Direction, 'N' | 'S' | 'E' | 'W'> = {
  up: 'N', down: 'S', left: 'W', right: 'E',
};
```

(b) Inside the JSX, find the canvas container `<div className="relative flex-1 overflow-hidden">` (around `line 46`). Inside that container, **before** the zoom controls div (around `line 50`), add the chrome readout:

```tsx
        <div className="absolute top-3 left-3 z-10 rounded bg-black/40 px-2 py-0.5 font-mono text-[10px] text-text-2 backdrop-blur-md">
          {state.anim} · {DIR_SHORT[state.dir]} · {state.zoom}× · f{String(currentFrame + 1).padStart(2, '0')}
        </div>
```

(c) In the bottom bar (around `lines 65-100`), replace the existing zoom text/loading display section. Find the trailing `result.status === 'loading'` block and the `zoom {state.zoom}×` block (around `lines 91-99`) and replace them with the frame counter:

```tsx
        <span className="ml-auto font-mono text-[10px] text-text-mute">
          f{String(currentFrame + 1).padStart(2, '0')}/
          {String(totalFrames).padStart(2, '0')} · {fps}fps
        </span>
```

(The loading indicator gets handled in Task 7 — for now Loading visibility is temporarily lost; smoke-test note in step 3 acknowledges this.)

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @lpc-toolkit/web exec tsc --noEmit && pnpm --filter @lpc-toolkit/web test`
Expected: PASS.

- [ ] **Step 3: Smoke-test**

Run: `pnpm --filter @lpc-toolkit/web dev`
Open `?ui=v2`. Confirm:
- Top-left of canvas shows `walk · S · 2× · f01` style chip (semi-transparent)
- Bottom bar shows `f01/06 · 8fps` style text on the right
- Loading indicator temporarily missing (will return in Task 7)
- Frame number advances when Playing

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/layer-stack/preview-pane.tsx
git commit -m "feat(web): preview chrome readout + frame counter

Top-left chip shows anim/dir/zoom/frame; bottom bar shows
frame counter + fps. Loading indicator temporarily absent
until Task 7 lifts it to the top bar."
```

---

## Task 5: Preview zoom presets

**Files:**
- Modify: `packages/web/src/components/layer-stack/preview-pane.tsx`

- [ ] **Step 1: Replace +/- zoom controls with preset buttons**

In `packages/web/src/components/layer-stack/preview-pane.tsx`, find the existing zoom controls (around `lines 50-62`):

```tsx
<div className="absolute top-3 right-3 flex gap-1">
  <Button size="sm" variant="default" ... >−</Button>
  <span className="...">{state.zoom * 100}%</span>
  <Button size="sm" variant="default" ... >+</Button>
</div>
```

Replace with:

```tsx
        <div className="absolute top-3 right-3 z-10 flex gap-0.5 rounded bg-black/40 p-0.5 backdrop-blur-md">
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
        </div>
```

The `MIN_ZOOM` / `MAX_ZOOM` imports may become unused — remove them from the import line if no other code references them. Also remove the `Button` import if no other usage remains in this file.

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @lpc-toolkit/web exec tsc --noEmit && pnpm --filter @lpc-toolkit/web test`
Expected: PASS.

- [ ] **Step 3: Smoke-test**

Run: `pnpm --filter @lpc-toolkit/web dev`
Open `?ui=v2`. Confirm:
- Top-right of canvas shows `1× 2× 4× 8×` row, current zoom highlighted
- Click `4×` → canvas re-renders at 4× zoom
- `Cmd/Ctrl+wheel` zoom still works (may produce non-preset values like 3× — that's OK)

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/layer-stack/preview-pane.tsx
git commit -m "feat(web): preview zoom preset buttons (1×/2×/4×/8×)

Replaces +/- controls with one-click preset row, matching
reference design. Cmd/Ctrl+wheel zoom still works for
intermediate values."
```

---

## Task 6: Preview Randomize button

**Files:**
- Modify: `packages/web/src/components/layer-stack/preview-pane.tsx`

- [ ] **Step 1: Add Randomize button to bottom bar**

In `packages/web/src/components/layer-stack/preview-pane.tsx`:

(a) Add to imports:

```tsx
import { pickRandomOutfit } from '../../slice/random-outfit';
import type { Translator } from '../../i18n';
```

(b) Update `Props` to include `t: Translator`:

```tsx
interface Props {
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  assetSource: AssetSource;
  t: Translator;
}
```

(c) Destructure `t` in the function signature.

(d) In the bottom bar JSX, between the frame counter and the end of the bar, add the Randomize button. Find the frame counter `<span className="ml-auto ...">` from Task 4 and add after it:

```tsx
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
```

(The frame counter still carries `ml-auto`, pushing it + the dice button to the right of the bar. The parent bottom-bar flex already uses `gap-3`, so no extra wrapping is needed for spacing.)

- [ ] **Step 2: Pass `t` from harness to PreviewPane**

In `packages/web/src/components/layer-stack/harness.tsx`, find the `<PreviewPane />` invocation (around `lines 133-139`) and add `t={t}`:

```tsx
          <PreviewPane
            catalog={props.catalog}
            palettes={props.palettes}
            state={props.state}
            dispatch={props.dispatch}
            assetSource={props.assetSource}
            t={t}
          />
```

- [ ] **Step 3: Type-check + tests**

Run: `pnpm --filter @lpc-toolkit/web exec tsc --noEmit && pnpm --filter @lpc-toolkit/web test`
Expected: PASS.

- [ ] **Step 4: Smoke-test**

Run: `pnpm --filter @lpc-toolkit/web dev`
Open `?ui=v2`. Confirm:
- Bottom bar has 🎲 button (right of frame counter)
- Click 🎲 → outfit changes (different items in active layers; some new layers may appear; some may disappear)
- Hovering shows tooltip "Randomize outfit"

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/layer-stack/preview-pane.tsx \
  packages/web/src/components/layer-stack/harness.tsx
git commit -m "feat(web): preview Randomize (Feeling Lucky) button

Generates a complete random outfit via pickRandomOutfit and
dispatches apply_selections. Required body categories always
included; optional categories at 50% probability."
```

---

## Task 7: Loading lift to top bar

**Files:**
- Modify: `packages/web/src/components/layer-stack/harness.tsx`
- Modify: `packages/web/src/components/layer-stack/preview-pane.tsx`
- Modify: `packages/web/src/components/layer-stack/top-bar.tsx`

This task moves the loading status display from the preview pane to the top bar. Architecturally, harness now owns the compose status (lifted out of PreviewPane via a callback) and passes the progress to TopBar.

- [ ] **Step 1: Refactor PreviewPane to publish loading status via callback**

In `packages/web/src/components/layer-stack/preview-pane.tsx`:

(a) Add new prop:

```tsx
interface Props {
  // ... existing
  onComposeStatus: (status: { progress: number; loading: boolean }) => void;
}
```

(b) Destructure `onComposeStatus`.

(c) Inside the component, just after `const result = useComposedCharacter(...)`, add:

```tsx
  useEffect(() => {
    onComposeStatus({
      progress: result.progress,
      loading: result.status === 'loading',
    });
  }, [result.progress, result.status, onComposeStatus]);
```

- [ ] **Step 2: Harness owns the loading state**

In `packages/web/src/components/layer-stack/harness.tsx`:

(a) Add state:

```tsx
  const [loadingProgress, setLoadingProgress] = useState<number | null>(null);
```

(b) In the `<PreviewPane />` invocation, add:

```tsx
            onComposeStatus={({ progress, loading }) =>
              setLoadingProgress(loading ? progress : null)
            }
```

(c) Pass `loadingProgress` to TopBar:

```tsx
      <TopBar
        t={t}
        theme={theme}
        locale={locale}
        loadingProgress={loadingProgress}
        onToggleTheme={onToggleTheme}
        onToggleLocale={onToggleLocale}
      >
```

- [ ] **Step 3: TopBar displays the loading indicator**

In `packages/web/src/components/layer-stack/top-bar.tsx`:

(a) Update `Props`:

```tsx
interface Props {
  t: Translator;
  theme: 'dark' | 'light';
  locale: 'en' | 'zh-TW';
  loadingProgress: number | null;
  onToggleTheme: () => void;
  onToggleLocale: () => void;
}
```

(b) Update destructuring + use `t` (was `t: _t`):

```tsx
export function TopBar({
  t,
  theme,
  locale,
  loadingProgress,
  onToggleTheme,
  onToggleLocale,
  children,
}: PropsWithChildren<Props>) {
```

(c) Inside the header, after `<div className="flex-1" />`, before the locale toggle, add:

```tsx
      {loadingProgress != null && loadingProgress < 1 && (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-text-dim">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          {t('status.loading')} {Math.round(loadingProgress * 100)}%
        </span>
      )}
```

- [ ] **Step 4: Type-check + tests**

Run: `pnpm --filter @lpc-toolkit/web exec tsc --noEmit && pnpm --filter @lpc-toolkit/web test`
Expected: PASS.

- [ ] **Step 5: Smoke-test**

Run: `pnpm --filter @lpc-toolkit/web dev`
Open `?ui=v2`. Hard-refresh to trigger fresh loading. Confirm:
- Top bar (right side, before locale toggle) briefly shows `● loading 42%` style indicator
- Preview pane no longer shows the loading text
- Once loaded, the top bar indicator disappears

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/layer-stack/harness.tsx \
  packages/web/src/components/layer-stack/preview-pane.tsx \
  packages/web/src/components/layer-stack/top-bar.tsx
git commit -m "feat(web): lift compose loading status to top bar

Harness owns the loading state (received from PreviewPane via
callback) and passes progress to TopBar, which renders a pulsing
dot + percentage on the right. Preview pane no longer carries
the loading display."
```

---

## Task 8: Top bar Logo wordmark

**Files:**
- Modify: `packages/web/src/components/layer-stack/top-bar.tsx`

- [ ] **Step 1: Add wordmark to the left**

In `packages/web/src/components/layer-stack/top-bar.tsx`, inside the `<header>`, before `{children}`, add:

```tsx
      <div className="mr-1 flex flex-col leading-none">
        <span className="text-[13px] font-bold tracking-tight">
          LPC<span className="font-medium text-text-mute">·Toolkit</span>
        </span>
        <span className="font-mono text-[9px] text-text-dim">
          {t('app.subtitle')}
        </span>
      </div>
```

(Reuses the existing `app.subtitle` key. Current values: en `foundation slice`, zh-TW `基礎切片`. These are inherited from v1; a copy-edit can update them later without touching this task.)

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @lpc-toolkit/web exec tsc --noEmit && pnpm --filter @lpc-toolkit/web test`
Expected: PASS.

- [ ] **Step 3: Smoke-test**

Run: `pnpm --filter @lpc-toolkit/web dev`
Open `?ui=v2`. Confirm:
- Top bar leftmost shows `LPC·Toolkit` two-tone wordmark with smaller subtitle below
- Layout unchanged for other top-bar elements

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/layer-stack/top-bar.tsx
git commit -m "feat(web): top bar Logo wordmark + subtitle

Two-tone text wordmark (LPC + ·Toolkit muted) with the existing
app.subtitle key as the small subtitle. Zero asset / dependency."
```

---

## Task 9: SettingsCollapsible filter badge

**Files:**
- Modify: `packages/web/src/components/layer-stack/settings-collapsible.tsx`

- [ ] **Step 1: Add badge to the collapsed header**

In `packages/web/src/components/layer-stack/settings-collapsible.tsx`, replace the existing toggle button JSX (around `lines 22-29`) with:

```tsx
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-mute hover:bg-surface-2"
      >
        <span>{t('filters.title')}</span>
        {licenseFilter && (
          <span className="rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-[9px] font-normal normal-case text-accent">
            ≤ {licenseFilter}
          </span>
        )}
        <span className="ml-auto">{open ? '▾' : '▸'}</span>
      </button>
```

- [ ] **Step 2: Type-check + tests**

Run: `pnpm --filter @lpc-toolkit/web exec tsc --noEmit && pnpm --filter @lpc-toolkit/web test`
Expected: PASS.

- [ ] **Step 3: Smoke-test**

Run: `pnpm --filter @lpc-toolkit/web dev`
Open `?ui=v2`. Confirm:
- With no license filter set: collapsible header shows only title + arrow
- Set a license filter via the open settings panel, then collapse: header shows `Filters & source  ≤ CC-BY 3.0  ▸`
- Re-open: panel content unchanged

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/layer-stack/settings-collapsible.tsx
git commit -m "feat(web): show active license filter badge in collapsed settings header

User can see the active filter even while the settings panel is
collapsed — prevents 'filter on but invisible' confusion."
```

---

## Task 10: LayerRow color ramp swatch (post-Spec-1)

**Files:**
- Modify: `packages/web/src/components/layer-stack/layer-row.tsx`

**Dependency:** This task assumes Spec 1's Task 5 (ItemThumbnail integration in LayerRow) has been completed. Do not start until that task lands.

- [ ] **Step 1: Add a swatch helper next to the LayerRow subtitle**

In `packages/web/src/components/layer-stack/layer-row.tsx`:

(a) Add imports at top:

```tsx
import { resolveRecolorSwatches } from '@lpc-toolkit/core';
```

(Check the actual export name in `packages/core/src/index.ts` — the spec assumes a function exists that, given `(palettes, item.palette, recolor)`, returns swatches. If it does not exist, inline the logic: read `palettes.byName[recolor]?.swatches ?? []`. See Step 1c for inline fallback.)

(b) Update the subtitle JSX. Find the existing subtitle div (the one with `{tl.category(typeName)}` and `selection.variant`, around `line 44-47`). Replace with:

```tsx
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-text-mute">
            <span>{tl.category(typeName)}</span>
            {selection.variant && (
              <>
                <span>·</span>
                <span>{selection.variant}</span>
              </>
            )}
            {selection.recolor && (
              <>
                <span>·</span>
                <span className="inline-flex gap-px">
                  {getRecolorSwatches(palettes, item, selection.recolor).map((c, i) => (
                    <span
                      key={i}
                      className="h-1 w-1 rounded-sm"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </span>
              </>
            )}
          </div>
```

(c) Add a local helper near the top of the file (above `LayerRow`):

```tsx
/**
 * Returns the color swatches for the user's chosen recolor on this item.
 * Returns empty array if anything is missing — caller renders nothing then.
 */
function getRecolorSwatches(
  palettes: PaletteMetadata,
  item: ItemDefinition,
  recolorName: string,
): readonly string[] {
  const paletteGroup = item.palette;
  if (!paletteGroup) return [];
  const group = palettes.byGroup?.get(paletteGroup);
  if (!group) return [];
  const recolor = group.find((r) => r.name === recolorName);
  return recolor?.swatches ?? [];
}
```

Note: the exact `PaletteMetadata` shape may differ (`byGroup` vs `byName`, etc.). Check `packages/core/src/palettes.ts` for the actual API. If the structure is `byName: Map<string, RecolorRamp>`, simplify to `palettes.byName.get(recolorName)?.swatches ?? []` and drop the `paletteGroup` lookup. The contract: "given recolor name, return its color swatches".

- [ ] **Step 2: Type-check + tests**

Run: `pnpm --filter @lpc-toolkit/web exec tsc --noEmit && pnpm --filter @lpc-toolkit/web test`
Expected: PASS.

- [ ] **Step 3: Smoke-test**

Run: `pnpm --filter @lpc-toolkit/web dev`
Open `?ui=v2`. Pick a layer that supports recolor (e.g., hair, weapon), apply a color ramp via the expanded ColorPicker. Confirm:
- Collapsed LayerRow subtitle now ends with `· ▪▪▪▪▪` (small color swatches)
- Items without recolor show no swatch suffix

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/layer-stack/layer-row.tsx
git commit -m "feat(web): LayerRow subtitle shows color ramp swatch preview

When a layer has a recolor applied, the subtitle ends with a row
of tiny color swatches matching the chosen ramp. Display-only,
no click behavior."
```

---

## Self-Review Notes

**Spec coverage:**
- #5 Loading lift → Task 7 ✓
- #6 Color ramp swatch → Task 10 ✓
- #7 Chrome readout → Task 4 ✓
- #8 Frame counter → Task 4 ✓
- #9 Zoom presets → Task 5 ✓
- #10 Randomize → Tasks 3 + 6 ✓
- #11 Logo → Task 8 ✓
- #13 Filter badge → Task 9 ✓
- ❌ #12 Preview Reset — explicitly excluded per spec
- Hook refactor (shared) → Task 1 ✓
- i18n → Task 2 ✓

**Placeholder scan:** No TBD / TODO. Task 10 Step 1(c) intentionally documents an API-name uncertainty (palettes.byGroup vs byName) with a fallback rule — this is implementation-time guidance, not a placeholder.

**Type consistency:**
- `loadingProgress: number | null` used identically in harness, top-bar
- `currentFrame / totalFrames / fps` from hook used in Task 4 readout + counter
- `pickRandomOutfit` returns `Selections`, fed into `apply_selections` action (already existing in slice/selection.ts)

**Execution order:** Tasks 1-9 independent of Spec 1; can execute in this order any time. Task 10 **must wait** until Spec 1's Task 5 lands (LayerRow already restructured to host ItemThumbnail).

**Temporary regression in Task 4:** Loading indicator disappears between Task 4 commit and Task 7 commit. If executing tasks atomically with PRs, either bundle Tasks 4+7 or land them in close succession.

---

## Execution

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task with two-stage review
2. **Inline Execution** — execute tasks in this session with checkpoints
