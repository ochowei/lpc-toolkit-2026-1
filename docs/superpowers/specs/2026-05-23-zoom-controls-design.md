# Zoom controls for character preview

## Goal

Let the user zoom the character preview canvas in and out from the existing
playback control row. Today `packages/web/src/components/slice-harness.tsx`
hardcodes `const ZOOM = 4`; we replace it with a user-controlled, integer
zoom level in the range 1×–8× with a default of 4×.

Zoom is view state, not outfit state. It lives in the selection slice (next
to `anim`, `dir`, `playing`), is reset by the existing `reset` action's
`view` scope, and is **not** encoded into the selection token nor persisted
to `localStorage`.

## Constraints

- Pixel-perfect rendering: integer zoom only. `useAnimationPlayer` already
  documents "integer `zoom`" and sets `imageSmoothingEnabled = false`. We
  keep both invariants.
- No new dependencies. UI uses existing `Button` plus a native
  `<input type="range">`.
- Token compatibility: `toSelections(state)` already omits view state, so
  the selection token format is unaffected.
- No persistence layer is added — this matches the rest of the app
  (theme/locale/asset-source all use `useState` only).

## Constants

Add to `packages/web/src/slice/selection.ts` (exported so the harness can
import them too):

```ts
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
export const DEFAULT_ZOOM = 4;
```

## State layer — `packages/web/src/slice/selection.ts`

1. Extend `SliceState`:

   ```ts
   export interface SliceState {
     // existing fields ...
     readonly zoom: number; // integer in [MIN_ZOOM, MAX_ZOOM]
   }
   ```

2. Extend `SliceAction`:

   ```ts
   | { type: 'set_zoom'; zoom: number }
   ```

3. Reducer:
   - `set_zoom`: `return { ...s, zoom: clamp(a.zoom, MIN_ZOOM, MAX_ZOOM) }`
     where `clamp` rounds to the nearest integer before clamping. Define
     `clamp` locally; do not add a dependency.
   - `reset` with `view` scope: also assign `zoom: a.init.zoom` alongside
     the existing `anim`/`dir`/`playing` resets.

4. `toSelections(state)` is unchanged — it does not surface `zoom`.

5. Initial `SliceState` returned by `pickInitialSelections(catalog)` (same
   file, ~line 196) must include `zoom: DEFAULT_ZOOM`. This is the single
   source of initial state — `App.tsx` passes the same object into both
   `useReducer` and the `reset` action's `init` field, so adding it here
   covers both startup and reset.

## Hook — `packages/web/src/hooks/use-animation-player.ts`

No signature change. The harness simply passes `state.zoom` instead of the
removed `ZOOM` constant. The hook's effect deps already include `zoom`, so
re-render happens automatically.

## UI — `packages/web/src/components/slice-harness.tsx`

1. Remove `const ZOOM = 4` (line 56).
2. Change the `useAnimationPlayer` call site to pass `state.zoom`.
3. In the existing toolbar row (currently containing the animation
   `<select>`, the `DIRS` buttons, and the play/pause button — the row that
   ends with `<div className="flex-1" />` and the status span), insert a
   zoom control group **before** the `flex-1` spacer:

   ```
   [−] [4×] ────slider──── [+]
   ```

   - `−` button: `onClick={() => dispatch({ type: 'set_zoom', zoom: state.zoom - 1 })}`,
     `disabled={state.zoom <= MIN_ZOOM}`, `aria-label={t('controls.zoomOut')}`.
   - Value label: `<span>{state.zoom}×</span>` (mono / fixed-width is
     optional; one digit fits without jitter).
   - Slider:
     ```tsx
     <input
       type="range"
       min={MIN_ZOOM}
       max={MAX_ZOOM}
       step={1}
       value={state.zoom}
       onChange={(e) =>
         dispatch({ type: 'set_zoom', zoom: Number(e.target.value) })
       }
       aria-label={t('controls.zoom')}
     />
     ```
     `step={1}` causes the thumb to snap to integer positions — that
     satisfies the "slider but integer-only" requirement without extra logic.
   - `+` button: mirror of `−`.

4. Add an `onWheel` handler to the canvas container (`<div className="checker …">`):

   ```ts
   const onWheel = (e: React.WheelEvent) => {
     if (!(e.ctrlKey || e.metaKey)) return; // ignore plain scroll
     e.preventDefault();
     const delta = e.deltaY < 0 ? +1 : -1;
     dispatch({ type: 'set_zoom', zoom: state.zoom + delta });
   };
   ```

   Notes:
   - The reducer already clamps, so we do not clamp here.
   - Use `ctrlKey || metaKey` so it works on both Windows/Linux (Ctrl) and
     macOS (Cmd, surfaces as `metaKey`). On macOS, pinch-zoom on a trackpad
     also fires wheel events with `ctrlKey` set, so trackpad pinch will
     work without extra code.
   - `preventDefault()` on a React `onWheel` only works if the listener is
     attached as non-passive. React 17+ does attach wheel listeners as
     passive by default. If `preventDefault` is silently ignored, fall back
     to attaching the listener via `useEffect` + `ref` with
     `{ passive: false }`. Validate this during implementation.

## i18n

Add three keys in `packages/web/src/i18n.ts` (both locales — match the
existing translation pattern):

- `controls.zoomIn` — "Zoom in" / "放大"
- `controls.zoomOut` — "Zoom out" / "縮小"
- `controls.zoom` — "Zoom" / "縮放"

The `4×` numeric label itself is locale-neutral, no key needed.

## Reset behaviour

- "Reset view" (existing): now includes zoom → back to `DEFAULT_ZOOM`.
- "Reset outfit": unchanged, leaves zoom alone.

## Testing

- Unit tests in `packages/web/src/slice/` (matching whatever convention the
  package uses — if no tests exist yet, add a new `selection.test.ts`):
  - `set_zoom` clamps below `MIN_ZOOM` and above `MAX_ZOOM`.
  - `set_zoom` rounds non-integers (defensive — slider sends integers but
    wheel-event reasoning prefers explicit rounding).
  - `reset` with `{ view: true }` restores `zoom` from `init.zoom`.
  - `reset` with `{ outfit: true, view: false }` leaves `zoom` untouched.
- No new harness-level tests (the project has no React Testing Library
  setup today; do not introduce one for this change).

## Out of scope (deliberately not in this spec)

- Continuous (non-integer) zoom or fractional snapping.
- Fit-to-window auto-zoom.
- Persisting zoom across reloads.
- Encoding zoom into the selection token.
- Keyboard shortcuts (Ctrl/Cmd +/−). User chose wheel only as the extra
  interaction. Can be revisited in a follow-up.

## File touch list

- `packages/web/src/slice/selection.ts` — state, action, reducer, constants.
- `packages/web/src/components/slice-harness.tsx` — remove `ZOOM`, add UI,
  add wheel handler.
- `packages/web/src/i18n.ts` — three new keys × two locales.
- `packages/web/src/slice/selection.ts` — `pickInitialSelections` returns
  `zoom: DEFAULT_ZOOM` (covered above; listed here for completeness — same
  file as state/action/reducer changes).
- New test file under `packages/web/src/slice/` if the package adopts the
  pattern, otherwise add tests where existing slice tests live.
