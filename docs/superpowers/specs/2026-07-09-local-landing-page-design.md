# Local and deployed landing page

## Goal

Make the web package open to a landing page by default. The landing page
explains how to use the CLI and provides a clear entry point into the existing
sprite composer. The same route behavior must work in local Vite development
and on Vercel deployments.

## Routes

The React app owns a tiny client-side route state derived from
`window.location.pathname`.

- `/` renders the new landing page.
- `/compose` renders the existing `LayerStackHarness` composer.
- Any other path renders a simple 404 page with actions back to `/` and
  `/compose`.

Navigation between these screens uses `history.pushState` plus a `popstate`
listener so back and forward browser buttons stay coherent. No routing
dependency is added.

## Landing page

Add a focused `LandingPage` component under `packages/web/src/components/`.
It should use the existing Tailwind and design-token styling, with a compact
tool/product feel rather than a marketing-heavy hero.

The page has two responsibilities:

1. Show CLI usage from the current command surface:
   - `pnpm --filter @lpc-toolkit/cli build`
   - `node packages/cli/dist/index.js --help`
   - `lpc-toolkit catalog types`
   - `lpc-toolkit catalog items --type <typeName>`
   - `lpc-toolkit selection validate --selection <file>`
   - `lpc-toolkit render --selection <file> --out <dir>`
   - `lpc-toolkit token encode --selection <file>`
   - `lpc-toolkit token decode --token <hash-or-token> --out <file>`
   - `lpc-toolkit preset list`
   - `lpc-toolkit preset materialize <preset-id> --out <file>`
   - `lpc-toolkit preset render <preset-id> --out <dir>`
2. Provide a primary action that opens `/compose` without a full page reload.

The landing page should not initialize catalog, palette, or composer state
unless the user navigates to `/compose`.

## Composer

Keep the current composer behavior intact. The existing catalog and palette
loading, URL hash bootstrap, theme state, locale state, reducer state, and
`LayerStackHarness` props continue to live in `App.tsx` or a small extracted
composer shell if that makes the route split clearer.

The route change must not alter composition output, selection behavior, URL
hash semantics, attribution, downloads, or exports.

## 404 page

Add a simple `NotFoundPage` component. It should say the requested page was
not found and offer two actions:

- Back to the landing page (`/`)
- Open the composer (`/compose`)

It should use the same navigation helper as the landing page.

## Vercel deployment

Update the existing `packages/web/vercel.json` SPA fallback so direct visits
or refreshes on `/compose` and unknown paths return `index.html`, after which
React renders the correct route. The rewrite should send all paths to
`/index.html`.

## Scope and non-goals

This does not add React Router or any other dependency. It does not create a
separate docs site, change CLI commands, alter the CLI help text, or modify
`packages/core/`, `packages/cli/`, `packages/presets/`, `assets/`, or
`upstream/`.

This also does not introduce backend, auth, database, analytics, or remote
content loading.

## Verification

- `rtk pnpm --filter @lpc-toolkit/web typecheck`
- `rtk pnpm --filter @lpc-toolkit/web build`
- `rtk pnpm check:boundaries`

Manual checks:

- Local `/` shows the landing page.
- Local `/compose` shows the existing composer.
- Local unknown paths show the 404 page.
- Landing and 404 actions navigate without a full page reload.
- Browser back and forward move between landing, composer, and 404 states.
- Vercel preview direct visit to `/compose` renders the composer.
