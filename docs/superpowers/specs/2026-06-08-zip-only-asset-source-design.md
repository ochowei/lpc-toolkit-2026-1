# Spec: ZIP-Only Asset Source

## Status

- Date: 2026-06-08
- Status: Draft for review

## Problem

The web app currently supports four runtime sprite asset sources:
`auto`, `upstream`, `local`, and `zip`. The project now has local runtime
ZIP archives, and the desired behavior is to keep only ZIP loading. Keeping
the older modes leaves dead paths for upstream fallback, local copied
spritesheets, URL overrides, UI choices, and tests that no longer match the
intended deployment model.

## Goals

- Make ZIP archives the only supported web runtime asset source.
- Treat old `assetSource=auto`, `assetSource=local`, and
  `assetSource=upstream` URL values as invalid and fall back to ZIP.
- Remove the sprite-source selector from the settings UI.
- Keep `packages/core` environment-agnostic.
- Do not modify `upstream/`.
- Do not add dependencies.

## Non-Goals

- Changing asset packaging or release snapshot generation.
- Changing attribution behavior.
- Reworking the Vite ZIP-serving plugin beyond what tests require.
- Supporting a compatibility alias for old source names.

## Design

`packages/web` will collapse `AssetSource` to the single value `'zip'`.
The browser canvas adapter will always load sprites through
`loadFileFromZip(path, document.baseURI)`, fetch the returned blob URL, create
an image bitmap, and revoke the blob URL after the image is loaded or fails.

The URL parser will accept only `assetSource=zip`. Missing, invalid, or legacy
values will resolve to ZIP. This preserves harmless deep links while preventing
old modes from controlling runtime behavior.

The settings panel will remove the sprite source control because there is no
longer a meaningful user choice. Any props, state, translation keys, and tests
that only exist to support source switching will be removed when their callers
no longer need them.

## Testing

Unit tests will verify:

- `assetSourceFromUrl` accepts only `zip`.
- `defaultAssetSourceFromUrl` always returns ZIP for absent, invalid, and
  legacy values.
- `createBrowserCanvasAdapter` loads through category ZIP archives.
- Existing fetch concurrency limits still apply.

E2E tests that currently force `assetSource=local` will use ZIP, either by
omitting the parameter or by explicitly passing `assetSource=zip`. The old
local-vs-ZIP parity test will become a ZIP render smoke test for a complex
outfit, because `local` will no longer be a supported runtime mode.

## Success Criteria

- The web app has no reachable runtime path for `auto`, `local`, or
  `upstream` sprite loading.
- The settings UI does not display sprite-source choices.
- Unit and relevant E2E tests pass with ZIP as the only asset source.
- `packages/core` and `upstream/` remain untouched.
