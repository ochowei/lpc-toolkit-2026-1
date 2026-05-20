# Material Picker All Assets Design

Date: 2026-05-20

## Goal

The web UI must provide a way to discover every upstream LPC asset, while
preserving the current fast path for common character-building choices. Users
should not be forced into a very large selector list for normal edits, but they
must be able to browse the full upstream catalog when needed.

## Current State

The web app already ingests all JSON files from `upstream/sheet_definitions/`
into the core catalog. The limited left panel is a product/UI limitation, not a
catalog ingestion limitation: `packages/web/src/slice/selection.ts` currently
uses a `PREFERRED` type-name list, so the UI only shows common fields such as
`body`, `head`, `hair`, `eyes`, `torso`, `legs`, and `feet`.

The bundled web spritesheet subset is much smaller than upstream:

- `upstream/spritesheets`: about 603 MB and 145,452 files.
- `packages/web/public/spritesheets`: about 34 MB and 7,273 files.

This means a full UI catalog and full local render coverage are separate
concerns.

## Design

The left material picker will use a hybrid structure:

- **Common**: quick selectors for high-frequency choices. It starts with the
  current core fields and can include high-value additions such as weapon, hat,
  shield, or common accessory groups.
- **Advanced: All upstream assets**: an expandable tree built from the upstream
  `sheet_definitions/` path structure. This section exposes every non-ignored
  upstream item, supports search, and filters by compatibility where possible.

The Advanced section should make the full catalog reachable without making the
default UI feel like a wall of one hundred type groups.

## Asset Source Selector

The UI will include a visible sprite source selector near the top of the left
panel:

- **Auto**: default. Try local bundled spritesheets first, then fall back to
  upstream remote spritesheets when a local image is missing.
- **Local**: use only `packages/web/public/spritesheets`. This is best for
  deterministic local/dev behavior and offline-friendly use, but it may not
  preview every upstream asset.
- **Upstream**: load spritesheet PNGs from
  `https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/`.
  This gives the broadest preview coverage without bundling all upstream PNGs,
  but it depends on network access and the upstream GitHub Pages site.

The asset source affects image loading only. Catalog selection, composition
rules, hash/token behavior, and credit generation still use the app's catalog
and core selection model.

## Data Flow

1. Web loads the catalog from the pinned `upstream/sheet_definitions/` submodule
   at build time, as it does today.
2. The material picker renders Common selectors plus the Advanced tree from that
   catalog.
3. When selections change, web calls core composition with the same
   environment-agnostic API.
4. The web image-loading adapter resolves each requested spritesheet path
   according to the selected asset source:
   - Local: local URL only.
   - Upstream: upstream base URL only.
   - Auto: local URL first, upstream URL on missing-image failure.
5. Core continues to compute attribution from selected layers. Attribution must
   remain visible for all rendered sprites.

## Compatibility And Warnings

The Advanced tree should avoid showing unusable choices as if they are normal
choices. It should surface lightweight signals for:

- Body-type compatibility.
- Animation compatibility when known.
- Upstream-source dependency when `Upstream` or `Auto` fallback is used.
- Missing local bundle coverage when the source is `Local`.

Warnings should be informative, not blocking, except where the selected source
cannot load the requested image.

## Non-Goals

This design does not require bundling the full upstream spritesheets folder into
the web app. Full local bundling remains possible later, but it is not the
recommended first implementation because of size and file-count cost.

This design does not modify `upstream/`. The submodule remains read-only.

This design does not add a backend, database, or authentication.

## Testing

Tests should cover:

- Common selectors remain available and produce the same selections as today.
- Advanced tree includes representative items from multiple upstream folders,
  including categories not present in the current `PREFERRED` list.
- Local source resolves only local spritesheet paths.
- Upstream source resolves URLs under the upstream GitHub Pages base URL.
- Auto source retries upstream when the local load path reports a missing image.
- Credit metadata remains present after selecting items through Advanced.

Manual verification should include selecting at least one local-only common item
and one Advanced item that is not in the current bundled subset, then confirming
the expected preview behavior for Local, Upstream, and Auto.
