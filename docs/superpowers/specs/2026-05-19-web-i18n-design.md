# Web i18n Design

## Goal

Add English and Traditional Chinese UI translations to the web app. English is the default locale. Users can switch between English and Chinese from the app header.

## Scope

Translate the fixed user-facing labels currently rendered by the React UI:

- App subtitle
- Theme toggle labels
- Body type label
- Empty selection label
- Direction labels
- Play and pause labels
- Loading status label
- Attribution panel labels

Catalog-derived identifiers, item names, animation names, body type values, file names, license names, and runtime error messages remain unchanged because they come from domain data or technical state.

## Architecture

Use a lightweight typed dictionary instead of adding an i18n dependency. The web app currently has a small amount of static copy, so a local module is enough and keeps the dependency graph stable.

Add `packages/web/src/i18n.ts` with:

- `Locale` type for `en` and `zh-TW`
- `DEFAULT_LOCALE`, set to `en`
- `TRANSLATIONS`, a typed dictionary keyed by message id
- `createTranslator(locale)`, returning a lookup function

`App` owns the locale state, just like it owns the theme state. It passes the current translator and a toggle handler into `SliceHarness`.

`SliceHarness` receives translated labels through the translator. It does not own persistence, locale detection, or data loading.

## User Interface

The header gains a compact language toggle button. When the current locale is English, the button offers `中文`. When the current locale is Chinese, it offers `English`.

The theme toggle continues to work independently.

## Testing

Add focused unit tests for the i18n module:

- English is the default locale.
- Both locales expose the same translation keys.
- Representative English and Chinese labels resolve correctly.

Run the web package test suite and typecheck after implementation.
