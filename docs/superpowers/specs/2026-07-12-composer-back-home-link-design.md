# Composer Back-to-Home Link Design

## Goal

Give users an obvious way to return from the web composer to the landing page.

## User Experience

- Add a dedicated ghost-style action to the left side of the composer top bar,
  next to the LPC Toolkit brand.
- Show `← Back to home` in English and `← 返回首頁` in Traditional Chinese.
- Keep the complete label visible on desktop and mobile so the destination is
  explicit.
- Activating the action returns to the landing page at `/` without a full page
  reload.

## Architecture

`App` already owns route state and SPA navigation. It will pass a landing-page
navigation callback through `ComposerApp` and `LayerStackHarness` to `TopBar`.
`TopBar` remains responsible only for rendering the action and emitting the
click; it will not access browser history or decide routes directly.

No core composition, catalog, attribution, export, or selection behavior will
change.

## Localization

Add one translation key for the visible action label in both existing locales.
The same localized text will serve as the action's accessible name.

## Testing and Verification

- Add a focused component test that first fails because the top bar does not
  expose the back-to-home action, then verify its label and click callback.
- Run the focused web test, web typecheck, and repository boundary check.

## Scope

The change adds only the explicit composer-to-landing navigation action. It
does not redesign the top bar, make the brand clickable, add new routing
dependencies, or change the landing page.
