# Composer Asset Editor Link Design

## Decision

Move the browser Asset Pack Workbench entry point from the landing page to the
Composer top bar. The action keeps the existing label `Repair an Asset Pack`
and navigates to `/asset-packs` through the existing SPA navigation owner.

The landing page will no longer render this action. The Asset Pack Workbench
route, loading behavior, navigation blocker, editing state, and attribution
behavior remain unchanged.

## Context

The web app currently exposes the Asset Pack Workbench from the landing page.
The Composer already has a persistent top bar and an explicit home-navigation
callback. Asset editing is a workflow reached from the Composer context, so its
entry point should be colocated with the Composer's page-level navigation.

## Architecture and data flow

`App` remains the sole owner of route changes. It passes a new navigation
callback through the existing presentation boundaries:

```text
App
  -> ComposerApp
    -> LayerStackHarness
      -> TopBar
```

The callback invokes `navigateToRoute('asset-packs')`. `TopBar` only renders the
button and emits the callback on click; it does not access browser history or
hard-code route paths. The button is placed immediately to the right of the
existing `Back to home` action.

The existing landing-page callback remains responsible for the Composer and
CLI actions, but its `asset-packs` action is removed. The `/asset-packs` route
continues to mount `AssetPackApp` and its existing navigation safeguards.

## Interface contract

- Visible label: `Repair an Asset Pack`.
- Location: Composer `TopBar`, immediately after `Back to home`.
- Navigation: existing client-side route transition to `/asset-packs`.
- Styling: existing `Button` and TopBar conventions; no new dependency or
  navigation abstraction.
- Back navigation from the Composer and Asset Pack Workbench remains intact.

## Verification

Update the focused web tests to prove:

1. `LandingPage` no longer renders `Repair an Asset Pack`.
2. `TopBar` renders the action near `Back to home`, uses the existing label and
   navigation styling, and invokes its asset-pack callback.
3. Existing App route tests continue to prove that `/asset-packs` initializes
   only its baseline and that navigation remains SPA-owned.

Run the focused web tests and web typecheck while iterating, then run the
repository verification gate:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx top-bar.test.tsx app-shell.test.tsx
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm verify
```

## Scope and non-goals

- Do not change Asset Pack Workbench behavior or its route.
- Do not change Composer editing, composition, attribution, or export logic.
- Do not add a router, dependency, localization key, or new navigation layer.
- No CLI documentation-impact matrix is required because this change does not
  touch CLI source, package metadata, plugin contracts, or CLI behavior.

## Glossary

- **Composer**: the web character-composition route at `/compose`.
- **Asset Editor**: the browser Asset Pack Workbench at `/asset-packs`; the UI
  action keeps the established label `Repair an Asset Pack`.
- **SPA navigation owner**: the `App`-level navigation logic that updates the
  browser history and route state without a full page reload.

