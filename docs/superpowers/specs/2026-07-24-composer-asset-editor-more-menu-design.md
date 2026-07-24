# Composer Asset Editor More Menu Link Design

## Decision

Move the `Repair an Asset Pack` entry from the Composer TopBar's always-visible
actions into the right-side More (`⋯`) menu.

This decision supersedes the previous design in
`2026-07-24-composer-asset-editor-link-design.md` only for the action's
placement and component wiring. The label, `/asset-packs` route, App-owned SPA
navigation, and Asset Pack Workbench behavior remain unchanged.

## Context

The current Composer TopBar exposes `Repair an Asset Pack` beside `Back to
home`. The TopBar also has a More menu for secondary workflow actions and
preferences. The asset editor is a secondary workflow, so the entry should be
available from that menu without occupying persistent top-level space.

## Architecture and data flow

`App` remains the sole route owner and continues to pass the callback through
the Composer boundary to the layer-stack UI. The new flow is:

```text
App
  -> ComposerApp
    -> LayerStackHarness
      -> MoreMenuPopover
```

`TopBar` no longer receives `onNavigateAssetPacks` and no longer renders the
asset-editor button. `MoreMenuPopover` receives
`onNavigateAssetPacks: () => void`; its menu item closes the menu and emits the
callback. `MoreMenuTarget` remains limited to Share and Attribution popover
targets, so route navigation is not mixed into popover selection state.

## Interface contract

- Visible label: `Repair an Asset Pack`.
- Location: More menu, immediately below Attribution and above the Preferences
  divider.
- Click behavior: close More menu, then invoke the App-owned callback that
  navigates to `/asset-packs`.
- TopBar: retains `Back to home` and all existing controls, but has no asset
  editor action or callback prop.
- No new router, dependency, localization key, or route abstraction.

## Verification

Update the focused web tests to prove:

1. TopBar no longer renders `Repair an Asset Pack`.
2. MoreMenuPopover renders the item in the workflow section, invokes
   `onNavigateAssetPacks`, and closes the menu on click.
3. App shell wiring still passes an App-owned callback that pushes
   `/asset-packs`.

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- top-bar.test.tsx more-menu-popover.test.tsx app-shell.test.tsx
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm verify
```

## Scope and non-goals

- Remove only the current TopBar asset-editor action and relocate it into More.
- Do not change the Asset Pack Workbench route, loading, navigation blocker,
  editing, attribution, or export behavior.
- Do not change Share, Attribution, language, theme, or other More menu
  actions.
- No CLI documentation-impact matrix is required because this remains a web UI
  navigation change and does not touch CLI behavior or contracts.

## Glossary

- **Composer**: the web character-composition route at `/compose`.
- **More menu**: the compact right-side `⋯` menu rendered by
  `MoreMenuPopover`.
- **Asset Editor**: the browser Asset Pack Workbench at `/asset-packs`; the UI
  action keeps the established label `Repair an Asset Pack`.
- **SPA navigation owner**: the `App`-level navigation logic that updates
  browser history and route state without a full page reload.
