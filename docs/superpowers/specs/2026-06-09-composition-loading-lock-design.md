# Spec: Composition Loading Indicator and Layer Lock

## Status

- Date: 2026-06-09
- Status: Draft for review

## Problem

Changing the character's selected layers starts an asynchronous sprite
composition, but the preview does not clearly show that work is in progress.
Users can also make another composition-changing selection while the current
composition is loading. Although stale async results are discarded, this
allows confusing rapid changes and makes it unclear which character is being
rendered.

## Goals

- Show a centered loading overlay whenever character composition is running,
  including the initial page load.
- Display a spinner, localized loading text, and the real integer completion
  percentage reported by the existing core `onProgress` callback.
- Keep the last successfully rendered character visible beneath the loading
  overlay while a replacement is composing.
- Disable every control that can change the composed character until the
  current composition succeeds or fails.
- Keep preview-only controls usable while composition is running.
- Add no dependencies and leave `packages/core` and `upstream/` unchanged.

## Non-Goals

- Cancelling in-flight image requests.
- Adding a minimum loading-overlay duration.
- Blocking the entire page.
- Changing thumbnail loading behavior, ZIP export progress, attribution, or
  core composition semantics.

## Architecture

`useComposedCharacter` remains the source of composition status and progress.
`LayerStackHarness` derives `isComposing` from
`composeResult.status === 'loading'` and passes that explicit state to the
preview and composition-changing UI components.

The existing `ComposedResult.progress` remains a normalized value from zero to
one. The preview converts it to a rounded integer percentage for display.
No new progress API is required because `composeSelections` already invokes
`onProgress(loaded, total)` as image loads settle.

The harness will expose a guarded composition dispatch for child controls that
change `bodyType` or `selections`. While `isComposing` is true, that dispatch
ignores composition-changing actions. Native disabled states remain the
primary user-facing protection; the guarded dispatch is a second boundary for
keyboard interaction or an already-open popover.

## Loading Overlay

`PreviewPane` will render a centered overlay over the single-character preview
canvas while composition is loading. The overlay contains:

- An animated spinner.
- Localized loading text.
- The current integer percentage from `0%` through `100%`.

The overlay covers only the preview canvas area. It does not cover the preview
action bar or block direction, animation, playback, zoom, full-sheet
visibility, theme, or locale controls.

When a previous composition exists, its canvas remains visible below the
overlay. On initial load, the same overlay appears over the empty preview
background. The hook must therefore retain the last successful sheet and
animation when entering a later loading state rather than clearing them.

No artificial delay is added. A cache-fast composition may show the overlay
only briefly.

## Locked Controls

While `isComposing` is true, the following composition-changing operations are
disabled:

- Selecting an item from sidebar search.
- Adding, clearing, or replacing a layer.
- Changing a layer variant or recolor.
- Applying a random outfit.
- Applying a preset outfit.
- Resetting the outfit.
- Changing body type.
- Removing selections that conflict with license or animation filters.
- Uploading, clearing, or changing the z-position of a custom overlay.
- Forcing asset reload.

The affected controls stay in place, use native `disabled` behavior where
possible, reduce opacity, and show a not-allowed cursor. An already-open menu
may remain open, but its composition-changing actions are disabled.

Filter toggles themselves may remain usable because they do not recompose the
character. Only their actions that remove selected layers are locked.
View-only reset remains usable; a combined reset option that includes outfit
reset is disabled while composition is running.

## Unlocked Controls

These controls remain available during composition because they do not change
the selected sprite layers:

- Direction.
- Animation selection.
- Play and pause.
- Preview zoom.
- Full-sheet open, close, grid, mask, zoom, and splitter controls.
- Mobile navigation.
- Theme and locale.
- Attribution and other read-only UI.

Downloads continue to follow their existing readiness checks and are not part
of the layer-lock behavior.

## Completion and Errors

On successful composition, the hook replaces the retained sheet and animation
with the new result, sets progress to one, and removes the loading lock and
overlay.

On hard composition failure, the hook enters its existing error state and the
loading lock is removed so the interface cannot remain permanently disabled.
Existing error presentation remains responsible for communicating the
failure. Stale requests continue to be ignored by the existing monotonic
request identifier.

## Testing

Focused unit and component tests will verify:

- Initial composition reports loading and starts at zero progress.
- Progress updates are displayed as an integer percentage.
- A previous successful preview remains available during the next load.
- The loading overlay appears during composition and disappears on success or
  error.
- Search, add, clear, replace, variant, recolor, random, preset, outfit reset,
  body type, incompatible-selection removal, custom overlay, and reload
  controls are disabled while loading.
- Composition-changing dispatches are ignored while loading.
- Direction, animation, playback, zoom, and full-sheet controls remain usable.
- Controls are re-enabled after success and after error.

An E2E test will exercise a visible loading state using delayed image loading
or an equivalent deterministic harness, confirm that a layer-changing control
is disabled, and confirm that it becomes usable after composition completes.

## Success Criteria

- Every initial and subsequent character composition displays a spinner,
  localized loading text, and real progress percentage in the preview.
- The last successful character remains visible during subsequent
  compositions.
- Users cannot alter the composed layer selection, including through presets,
  until the active composition settles.
- Preview-only controls remain responsive during loading.
- Both success and failure release the lock.
- No dependency is added, attribution remains intact, and neither
  `packages/core` nor `upstream/` is modified.
