# Landing Page Progressive Tutorial Design

**Date:** 2026-07-17

## Goal

Turn the landing page from a complete CLI reference into a product-led entry
point. A first-time visitor should see what LPC Toolkit creates, choose the Web
Composer or CLI path, and produce an attributed character preview after three
CLI commands. Detailed discovery, pagination, selection-file, and token
guidance remains available through the CLI README and built-in help.

This is a presentation change only. It does not alter CLI behavior, command
contracts, output paths, composition, persistence, or attribution rules.

## Audience and Success Criteria

The primary audience is a game developer, artist, or modder encountering LPC
Toolkit for the first time. The page succeeds when that visitor can:

1. understand that the product creates attributed LPC character sprites;
2. choose between the visual Composer and the CLI without scrolling;
3. copy a three-command path that produces a visible preview;
4. anticipate the one-time asset download instead of mistaking it for a hang;
5. identify the generated PNG, metadata, and required credit files; and
6. find customization, final rendering, and complete CLI documentation without
   reading a long reference on the landing page.

## Information Architecture

The page uses a single progressive reading path:

1. **Hero** — outcome-oriented copy, one attributed farmer preview, a primary
   `Open Composer` action, and a secondary `Use the CLI` anchor.
2. **CLI quick start** — install, create from the farmer preset, and preview.
3. **Preview result** — the generated file tree and the preview image outcome.
4. **Customize the character** — search, inspect exact credits, and set an item.
5. **Render final output** — one final render command plus the attribution
   contract.
6. **More workflows** — a compact link to the canonical CLI README plus the
   `lpc-toolkit --help` discovery command instead of an inline reference.

The current standalone Web Composer card, pagination paragraph, and secondary
command inventory are removed. The Composer remains prominent through the hero
action; the CLI README remains the authoritative place for selection JSON,
tokens, pagination, cache details, and troubleshooting.

The canonical documentation link is
`https://github.com/ochowei/lpc-toolkit-2026-1/blob/main/packages/cli/README.md`.

## Hero and Product Visual

The hero headline describes the outcome rather than the implementation. The
supporting copy explains that users can compose visually or automate through
the CLI while keeping attribution with the result.

The hero displays a real 64×64 farmer preview at a pixel-preserving scale. The
preview is generated from the public CLI's farmer preset, not hand-drawn or
substituted with unrelated artwork. The checked-in landing artifacts are kept
together under `packages/web/src/landing-artifacts/` so Vite bundles them into
both the normal web build and the CLI embedded build:

```text
hero.preview.png
hero.credits.txt
hero.credits.csv
```

The component imports the PNG normally and imports both credit files with
Vite's `?url` suffix, then links those bundled URLs beside the image. The
credit files preserve the matching source and license entries from the active
`CREDITS.csv`. These files are generated as one attributed visual set; the
implementation must not add the PNG without its matching credits. The later
CLI output example still shows the metadata JSON produced by
`character preview`.

The hero has exactly two decisions:

- `Open Composer` calls the existing `onNavigate('compose')` callback.
- `Use the CLI` links to `#cli-quick-start` on the same page.

## Three-Command Quick Start

The primary tutorial uses the globally installed public binary:

```sh
npm install -g @lpc-toolkit/cli
lpc-toolkit character create hero --preset farmer
lpc-toolkit character preview hero
```

An adjacent sentence retains `npx @lpc-toolkit/cli --help` as the no-install
discovery option without turning it into a fourth tutorial step. Node.js 22 or
newer remains explicit.

Before the first asset-dependent command, the page states that initial setup
downloads approximately 205 MB of pinned assets once, verifies them, and then
reuses the local cache. It does not imply that installation itself contains
the art archive.

The preview result shows the exact default named-character output:

```text
characters/previews/hero/
├── hero.preview.png
├── hero.metadata.json
├── hero.credits.txt
└── hero.credits.csv
```

The output explanation states that the TXT and CSV files must stay with the
generated sprite.

## Customization and Final Render

Customization is secondary to the first preview. It uses human-readable output
by default so the landing page remains approachable:

```sh
lpc-toolkit character search hero --type hair --query braid
lpc-toolkit catalog item hair_braid
lpc-toolkit character set hero --type hair --item hair_braid --recolor lpcr.brown
```

The descriptions explain that search results provide the item identifier,
detail lookup exposes exact credits, and `character set` persists the selected
item. JSON output, pagination fields, and offset-reset rules remain documented
in the CLI README and help rather than repeated here.

The final export is one command:

```sh
lpc-toolkit character render hero --out ./dist/hero --animation walk --bundle zip
```

The page explains that render output includes the composed sheet, metadata,
TXT and CSV credits, and the requested ZIP bundle. It continues to state that
attribution artifacts are required, not optional extras.

## Components and Interaction

The implementation stays inside the web presentation layer. `LandingPage`
owns the static section composition and uses the existing `Button` component
for the Composer action. Small data arrays may continue to describe tutorial
steps. A focused presentational subcomponent may be extracted only if it makes
the repeated tutorial cards or output panel materially clearer.

No clipboard API, copy-status state, tabs, accordion behavior, syntax
highlighting, new dependency, runtime composition, or asset loading pipeline is
added. Code blocks remain selectable and horizontally scrollable.

## Responsive and Accessibility Requirements

- On a wide viewport, the hero copy and farmer preview form two columns; on a
  narrow viewport they stack with the copy and actions first.
- The 64×64 preview uses pixelated rendering and an explicit intrinsic size so
  scaling remains crisp and layout shift is avoided.
- The image has outcome-oriented alt text. Credit links have descriptive names
  rather than raw filenames alone.
- Heading levels preserve one `h1`, section `h2` headings, and step `h3`
  headings.
- Long commands scroll within their own blocks and must not create page-level
  horizontal overflow at a 375-pixel viewport.
- The CLI anchor receives a stable `id="cli-quick-start"` target.

## Testing and Verification

Update the focused server-rendering test first so it requires:

- the outcome-oriented hero and attributed preview image;
- one Composer action and the `Use the CLI` anchor;
- the three quick-start commands in execution order;
- Node.js 22 and the approximately 205 MB first-use download guidance;
- the exact preview output filenames and required attribution statement;
- the three customization commands and final render command;
- links to both checked-in credit files and the CLI README; and
- removal of landing-level pagination, token, and selection-file reference
  content.

Add a focused artifact check that confirms the preview PNG, TXT credits, and
CSV credits all exist together and that both credit files contain attribution
content. Verify the final page in a browser at desktop width and at 375 pixels
without page-level horizontal overflow.

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm check:boundaries
rtk pnpm verify
```

## CLI Documentation Impact

```text
help: N/A — no command, option, default, output, or help contract changes
cli-readme: N/A — remains the authoritative complete CLI workflow and reference
root-readme: N/A — its existing complete character-authoring quick start remains valid
landing: update
architecture: N/A — no package ownership or attribution contract changes
engineering: N/A — no command, test, or CI mapping changes
releasing: N/A — no package, version, or publication changes
plugin: N/A — no plugin workflow or supported CLI contract changes
```

The matrix is reassessed before handoff. If generating the example reveals a
CLI contract mismatch, implementation stops and the affected documentation
surface is added instead of silently documenting different behavior.

## Out of Scope

- New CLI commands, options, aliases, or output behavior.
- A multi-page examples portal.
- Batch generation, random NPC packs, or theme/count commands that the current
  CLI does not provide.
- Changes to the Composer route or editor UI.
- Runtime rendering of the hero preview.
- Dependencies, framework changes, backend services, or modifications to
  `upstream/`.
