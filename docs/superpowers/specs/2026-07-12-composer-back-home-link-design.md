# Composer Back-to-Home Link Design

## Goal

Give users an obvious way to return from the web composer to the landing page.

## User Experience

- Make the dedicated ghost-style action the first interactive element at the
  far left of the composer top bar.
- Place a vertical divider after the action, followed by the LPC Toolkit brand
  and the existing composer tools. This makes the action read as page-level
  navigation rather than another composer control.
- Show `← Back to home` in English and `← 返回首頁` in Traditional Chinese.
- Keep the complete label visible on desktop and mobile so the destination is
  explicit.
- Activating the action returns to the landing page at `/` without a full page
  reload.

## Visual Styling

- Distinguish the page-level home action from adjacent ghost-style composer
  tools with the existing theme-aware `accent` color.
- Use accent-colored text, a 10% accent-tinted background, and a 50%
  accent-colored border. Increase the accent tint to 20% on hover.
- Preserve the existing small button size and accent focus outline.
- Apply these classes only to this TopBar action. Do not add or change a shared
  `Button` variant.

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

- Keep the focused component coverage for the action label and click callback,
  and add a structural assertion that the action appears before the brand in
  rendered markup.
- Assert the TopBar action carries the approved accent text, tint, border, and
  hover classes.
- Run the focused web test, web typecheck, and repository boundary check.

## Scope

The change adds only the explicit composer-to-landing navigation action. It
does not redesign the top bar, make the brand clickable, add new routing
dependencies, or change the landing page.
