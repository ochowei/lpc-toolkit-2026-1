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
`--help`, token encoding, and `preset list` do not prepare the managed cache.

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

Every render writes the composed sheet, a metadata JSON file, and both
`<name>.credits.txt` and `<name>.credits.csv`. Animation strips, individual
frames, and ZIP bundles are optional; attribution files and effective-license
metadata are not. Credits are derived from the selected assets and the pinned
`CREDITS.csv`.

This package is licensed under GPL-3.0-or-later. Keep the generated attribution
artifacts with rendered sprites and comply with the effective licenses reported
in the render metadata and credit files when copying, modifying, or
redistributing the software or art output.
