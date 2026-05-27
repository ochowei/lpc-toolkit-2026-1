# Navbar Overflow Menu Design

## Goal

Reduce visual clutter in the top navbar by collapsing five low-frequency controls (Token, Reset, Attribution, Language toggle, Theme toggle) into a single `⋯` overflow menu, while keeping the high-frequency controls (BodyType pill, Download, Reload `↻`) visible as direct buttons. The Full Sheet toggle in the preview-pane toolbar is intentionally out of scope and stays where it is.

## Motivation

Before this change the navbar carried 8 distinct controls in addition to the logo and the loading indicator: `BodyType · Token · Reset · Attribution · Download · ↻ · 中文/EN · ☀/☾`. That density makes the bar feel busy and pushes secondary actions (language/theme) onto the same visual layer as primary content actions (Body type, Download). Three of the items (Token, Reset, Attribution) are rarely used during normal editing, and two (language/theme) are once-per-session preferences. Folding them all behind `⋯` is appropriate.

## Design

### Final navbar layout

```
[ LPC·Toolkit ]  [ BodyType ]  [ Download ]  [ ↻ ]  …spacer…  [ loading? ]  [ ⋯ ]
```

- BodyType, Download, and `↻` remain direct buttons because they are high-frequency or hold non-obvious shortcut value (`↻` clears the thumbnail cache).
- The loading indicator stays where it was (right side, before the overflow button).
- Full Sheet is unchanged — it remains in the preview-pane toolbar.

### `⋯` overflow menu contents

A single dropdown panel, anchored to the `⋯` button, split into two sections by a divider:

```
🔗  Selection token
↻   Reset
©   Attribution · N        ← shows count; flips to ⚠ when any selected item violates the
                              license filter or animation filter
──────────────────────────
Preferences
Language                EN | 中文     ← current value shown on the right; click toggles
Theme                   ☾ | ☀        ← current value shown on the right; click toggles
```

Combining Tools and Preferences into one menu is intentional. Each individual list (3 tools, 2 preferences) is too small to justify two separate dropdowns; a single overflow with a labeled `Preferences` divider keeps the navbar to three buttons total without losing legibility.

### Interaction rules

- Clicking a tool item (Token / Reset / Attribution) closes the overflow menu and immediately opens the corresponding popover, anchored directly below the `⋯` button (so the user's eye does not jump).
- Clicking a preference item (Language / Theme) closes the overflow menu and applies the toggle immediately. The menu does not stay open between toggles.
- Pressing `Esc` or clicking outside closes whichever popover is currently open.
- Only one popover may be open at a time. Opening any of Token / Reset / Attribution / Download from elsewhere automatically closes the overflow menu.
- The existing `⌘K / Ctrl+K` shortcut for focusing the sidebar search is not affected.

### Attribution warning surfacing

When any selected item fails the active license or animation filter, the `⋯` button itself gains a red border and red glyph color, and the Attribution menu item shows a `⚠` marker and the same red treatment. This preserves the at-a-glance compliance warning the standalone Attribution button used to provide, even when the panel itself is one click deeper.

### Component-level notes

- The three popovers being absorbed (`TokenPopover`, `ResetMenuPopover`, `AttributionPopover`) become panel-only when given an external `anchorRef`, but keep their original built-in-trigger behavior when used without one. This keeps the components reusable elsewhere and avoids forcing every call site to provide a button.
- A small pure helper (`summarizeAttribution`) is extracted from `AttributionPopover` so both the popover panel and the overflow menu's Attribution item can derive `{ sourceCount, incompatibleAny }` from the same source of truth.

## Out of scope

- Full Sheet toggle relocation — explicitly kept in the preview-pane toolbar.
- Reload `↻` relocation — kept as a direct navbar button.
- BodyType / Download — kept as direct navbar buttons.
- Changing what any of the underlying popovers do (Token / Reset / Attribution panels keep identical content and behavior).
- Mobile/narrow-viewport responsive design — current navbar layout is desktop-only; same constraint applies post-change.

## Testing

- `summarizeAttribution` is covered by unit tests in `packages/web/test/attribution-summary.test.ts`: source-count bucketing, license-filter mismatch, animation-filter mismatch, and the empty-selection case.
- All component-level behavior is verified manually in the dev server (the project has no React component test setup): button visibility, menu open/close, each menu item routing correctly, language/theme toggling, Esc/outside-click dismissal, attribution warning indicator under a constrained license filter, and that the existing `⌘K` shortcut still works.

## Implementation plan

See `docs/superpowers/plans/2026-05-27-navbar-overflow-menu.md` for the task-by-task breakdown.
