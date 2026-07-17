# @lpc-toolkit/cli

Node.js 22+ CLI for cataloging, validating, and rendering attributed
[Liberated Pixel Cup](https://lpc.opengameart.org/) character sprites.

## Install and run

Install the public package globally:

```sh
npm install -g @lpc-toolkit/cli
lpc-toolkit --help
```

Or run it without a global install:

```sh
npx @lpc-toolkit/cli --help
```

The package installs only the `lpc-toolkit` binary. Node.js 22 or newer is
required.

## Character authoring quick start

Create and edit a named character without writing a selection JSON file:

```sh
lpc-toolkit character create hero --preset farmer
lpc-toolkit character search hero --type hair --query braid --limit 20
lpc-toolkit catalog item hair_braid --json
lpc-toolkit character set hero --type hair --item hair_braid --recolor lpcr.brown
lpc-toolkit character preview hero
lpc-toolkit character render hero --out ./dist/hero --animation walk --bundle zip
```

The character selection is saved under `./characters/`. Preview and render
commands write the sprite together with metadata and both TXT and CSV credit
files; keep those attribution artifacts with the generated image.

### Codex Plugin

1. Install or upgrade the CLI to the range supported by plugin `0.2.0`:

```sh
npm install -g '@lpc-toolkit/cli@>=0.2.0 <0.3.0'
```

2. Add the repository marketplace once:

```sh
codex plugin marketplace add ochowei/lpc-toolkit-2026-1
```

3. Install or enable the plugin:

```sh
codex plugin add lpc-toolkit@lpc-toolkit
```

The plugin requires an installed compatible `lpc-toolkit` CLI and does not
automatically install the CLI. Its supported CLI range is
`>=0.2.0 <0.3.0`. Restart the ChatGPT desktop app or start a new Codex
task if the newly installed skill is not visible. Public Plugins Directory
distribution can later remove the marketplace-add step.

The plugin guides Codex through JSON search, edit, validate, preview, and render
workflows. Preview, render, and export outputs preserve metadata plus TXT and
CSV credits.

### Character commands and locators

| Command | Purpose |
| --- | --- |
| `character create` | Create a named selection, optionally from a preset. |
| `character list` | List selections stored under `./characters/`. |
| `character show` | Show a stored or explicitly located selection. |
| `character search` | Find compatible catalog items for one selection type. |
| `character set` | Set or replace one selected item. |
| `character remove` | Remove one selected item. |
| `character validate` | Validate the complete selection against the catalog. |
| `character preview` | Render one attributed animation frame. |
| `character render` | Render the attributed sheet and optional exports. |

Locator-based commands accept either a character name or
`--selection <file>`, never both. A named preview defaults to
`characters/previews/<name>/`; use `--out <directory>` to override it.
Character rendering is strict by default. Use `--allow-partial` only when
attributed partial animation output is acceptable; missing paths are reported
in warnings and metadata rather than silently credited.

`lpc-toolkit.selection.v1` is the canonical saved selection format. Wherever
`--selection` reads an existing file, the CLI also accepts upstream version 1
and version 2 selection JSON. Read-only commands import these documents in
memory without rewriting the source. A successful `character set` or
`character remove` mutation of upstream input atomically rewrites that file in
the canonical format and emits the `selection_format_normalized` warning.
`character create --selection <file>` remains an output destination for the
new character rather than an input file.

### Render output

Every successful render writes this attributed artifact set. Entries marked as
optional are present only when their corresponding flag is used:

```text
<out>/
├── <name>.sheet.png
├── <name>.viewer.html
├── <name>.metadata.json
├── <name>.credits.txt
├── <name>.credits.csv
├── animations/
│   └── <animation>.png                 optional: --animation
├── frames/
│   └── <animation>/<direction>-<frame>.png  optional: --frames
└── <name>.bundle.zip                   optional: --bundle zip
```

`<name>.viewer.html` is always produced. Double-click it in the render directory
to play every composed standard and custom animation offline. When using
`--bundle zip`, extract the complete ZIP before double-clicking the viewer so its
relative sheet and artifact links remain beside it. `--animation` and `--frames`
control only the separate PNG outputs; they do not limit the animations available
in the viewer.

## Commands

Commands print human-readable output by default. Add `--json` when a command is
being consumed by a script or agent.

```sh
# Explore the catalog.
lpc-toolkit catalog types
lpc-toolkit catalog items --type hair
lpc-toolkit catalog item hair_braid

# Validate a selection document.
lpc-toolkit selection validate --selection selection.json

# Encode and decode selection tokens.
lpc-toolkit token encode --selection selection.json
lpc-toolkit token decode --token 'sex=male&hair=Braid' --out decoded.json

# List, materialize, and render built-in presets.
lpc-toolkit preset list
lpc-toolkit preset materialize farmer --out farmer.json
lpc-toolkit preset render farmer --out ./farmer --animation walk

# Render a selection, including an animation strip, all frames, and a ZIP.
lpc-toolkit render --selection selection.json --out ./rendered \
  --animation walk --frames all --bundle zip
```

Catalog and `character search` discovery return a deterministic 20-item page by
default. Use `--limit 20` to choose a bounded page size, `--offset 20` (or the
returned `page.nextOffset`) to continue an unchanged result set, and `--all`
for an explicit unbounded response. The JSON `page` object contains `limit`,
`offset`, `returned`, `total`, `hasMore`, and `nextOffset`. Item summaries expose
license families and credit counts; `catalog item <itemId> --json` returns the
full credit entries for exact attribution review. Restart from offset zero when
the catalog source, custom overlay, query filters, or character selection
changes.

`catalog item <itemId>` keeps `animations` as the asset's native animation
identifiers. Item detail also reports `compatibleAnimations`, derived from
registered custom-animation bases such as `wheelchair` → `sit`, and
`unsupportedAnimations`, the ordered standard animation names supported by
neither the native nor compatible set. Human output labels the latter fields
`compatible standard animations` and `unsupported standard animations`.
Definitions without a valid `animations` array use the same standard defaults
as Core composition; an explicit empty array remains empty.

Run `lpc-toolkit --help` for the command summary.

## Local Web UI

Start the packaged production UI with the same verified asset cache used by
render commands:

```sh
lpc-toolkit web
lpc-toolkit web --port 4173 --no-open
```

Use `--port 0` to let the operating system select an available port. The first
run downloads the pinned assets when needed; later runs share the verified cache
with render commands and work offline. Press `Ctrl+C` to stop the server.

The server binds to `127.0.0.1` by default. Using `--host 0.0.0.0` exposes it to
other devices on the local network; only do this on a trusted network. This is a
production server, so it does not provide Vite hot reload.

## Asset download and cache

The npm package does not contain the art archive. The first asset-dependent
command downloads a pinned asset manifest and about 205 MB of compressed assets
from the project's GitHub release. Download, verification, extraction, and
ready progress is written to stderr so stdout remains safe for `--json` output.
`--help`, `--version`, `token decode`, `preset list`, `character list`, and
`character create` without `--preset` do not prepare the managed cache.

The default cache root is platform-specific:

| Platform | Cache root |
| --- | --- |
| macOS | `~/Library/Caches/lpc-toolkit` |
| Windows | `%LOCALAPPDATA%\lpc-toolkit\Cache` (or `%USERPROFILE%\AppData\Local\lpc-toolkit\Cache` when `LOCALAPPDATA` is unset) |
| Linux and other Unix systems | `$XDG_CACHE_HOME/lpc-toolkit`, or `~/.cache/lpc-toolkit` when `XDG_CACHE_HOME` is unset |

Set `LPC_TOOLKIT_CACHE_DIR` to override the cache root:

```sh
LPC_TOOLKIT_CACHE_DIR=/path/to/writable/cache lpc-toolkit catalog types
```

Each pinned asset release has its own directory under that root. Its durable
layout is:

```text
<cache-root>/<release-tag>/
├── CREDITS.csv
├── asset-manifest.json
├── sprite-index.json
├── metadata-index.json
├── zips/
│   ├── sheet_definitions.zip
│   ├── palette_definitions.zip
│   └── <sprite-category>.zip
├── sheet_definitions/
└── palette_definitions/
```

Sprite category ZIPs remain compressed and are read on demand; only definition
metadata is expanded. The downloaded tarball is a temporary preparation input,
not a second durable copy. Before reuse, the CLI validates the pinned manifest,
hashes, retained ZIP set, attribution file, and generated indexes. A valid cache
causes no network requests, so later commands work offline. If the cache is
missing or invalid, a network connection is required to prepare it again.

### Working-directory assets and custom overlays

The current working directory controls local asset discovery:

- A complete `./assets` tree takes precedence over the managed cache. It must
  contain `sheet_definitions/`, `palette_definitions/`, `spritesheets/`, and
  `CREDITS.csv`.
- `./assets_custom/sheet_definitions/` overlays definitions with matching paths
  from either the complete local tree or the managed base. This overlay is
  checked whether the base comes from `./assets` or the cache.
- An incomplete `./assets` tree is not mixed into the managed base; the CLI uses
  the verified cache instead.

Run from the directory containing those folders when using local or custom
assets.

### Troubleshooting

- **Checksum or integrity failure:** the CLI refuses unverified content and does
  not publish it into the cache. Retry on a trusted network. If a local release
  directory was modified, remove only that `<cache-root>/<release-tag>`
  directory and retry; do not bypass checksum validation.
- **`tar` is missing:** initial cache preparation requires a `tar` executable on
  `PATH`. Install the platform's standard tar implementation, then rerun the
  command.
- **Network or GitHub release failure:** confirm HTTPS access to GitHub releases
  and any proxy/firewall configuration. An already valid cache works offline,
  but a missing or invalid cache cannot be rebuilt without the pinned files.
- **Cache-write failure:** check permissions and free disk space, or point
  `LPC_TOOLKIT_CACHE_DIR` at an absolute, writable location. Preparation needs
  temporary space in addition to the retained compressed cache.

## Attribution and license

Every render writes the composed sheet, offline animation viewer, a metadata JSON
file, and both `<name>.credits.txt` and `<name>.credits.csv`. Animation strips,
individual frames, and ZIP bundles are optional; the viewer, attribution files,
and effective-license metadata are not. Credits are derived from the selected
assets and the pinned `CREDITS.csv`.

This package is licensed under GPL-3.0-or-later. Keep the generated attribution
artifacts with rendered sprites and comply with the effective licenses reported
in the render metadata and credit files when copying, modifying, or
redistributing the software or art output.
