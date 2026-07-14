# lpc-toolkit

`lpc-toolkit` provides an environment-agnostic TypeScript engine for composing
[Liberated Pixel Cup](https://lpc.opengameart.org/) character spritesheets, a
React web editor, shared outfit presets, and an agent-first Node CLI.

LPC art is distributed as layered body, hair, clothing, weapon, expression,
and accessory sheets. The toolkit turns those layers into one reusable,
attribution-aware composition pipeline that runs in browsers and Node.

## Status

| Package | State | Responsibility |
| --- | --- | --- |
| `packages/core/` | **Working** | Pure catalog, composition, recolor, animation, token, validation, and credits logic. |
| `packages/presets/` | **Working** | Shared themed presets and pure preset-application rules. |
| `packages/web/` | **Working** | React 18, Vite, Tailwind CSS v4, and shadcn-style browser editor. |
| `packages/cli/` | **Working** | Node CLI for named characters, catalog search, validation, tokens, presets, preview, and rendering. |

The composition pipeline, presets, web editor, and CLI are working and tested.

## What Is Included

```text
assets/            active LPC spritesheets, definitions, palettes, and CREDITS.csv
upstream/          optional read-only provenance/reference gitlink
packages/core/     environment-agnostic TypeScript engine
packages/presets/  shared pure preset logic
packages/web/      React/Vite browser application
packages/cli/      Node CLI, filesystem adapters, canvas, ZIP, and JSON output
```

The most important product invariants are:

- `packages/core/` imports no browser, React, Node filesystem, concrete canvas,
  ZIP, web, CLI, or presets implementation.
- Every rendered or exported sprite preserves matching credit metadata from
  the active asset source's `CREDITS.csv`.
- Repository development uses pnpm and strict TypeScript.
- `upstream/` remains optional and read-only; normal workflows neither install
  packages nor write generated files inside it.
- The project metadata declares GPL-3.0-or-later; new dependencies must be
  compatible and require review.

See [`AGENTS.md`](AGENTS.md) for the authoritative Agent rules and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for detailed boundaries.

## Getting Started

Repository development requires Node.js 22 or newer and pnpm 9. Use a standard
clone:

```sh
git clone <repo-url>
cd lpc-toolkit-2026-1
pnpm install --frozen-lockfile
pnpm verify
```

The standard clone does not initialize the submodule. Install, verification,
builds, ordinary E2E, CLI packaging, and publish validation use checked-in or
pinned cache-backed assets and fixtures instead.

Build the reusable packages, web application, and CLI:

```sh
pnpm build
```

The root build covers core, presets, web, and CLI. Core and presets compile
their reusable TypeScript output; web prepares assets and builds the Vite SPA;
CLI builds and vendors the workspace runtime needed by its npm tarball.

Contributor setup, package tours, and focused checks are documented in:

- [`CONTRIBUTING.md`](CONTRIBUTING.md)
- [`docs/ONBOARDING.md`](docs/ONBOARDING.md)
- [`docs/ENGINEERING.md`](docs/ENGINEERING.md)
- [`docs/RELEASING.md`](docs/RELEASING.md) for authorized maintainers

## Web Editor

Start the local development server:

```sh
pnpm --filter @lpc-toolkit/web dev
```

The web app has three routes: `/`, `/compose`, and the not-found route. The
landing page is `/`, while the editor is `/compose`. The editor keeps
attribution reachable while users compose, preview, and export characters.

## Command-Line Interface

Node.js 22 or newer is required. Install the public package:

```sh
npm install -g @lpc-toolkit/cli
lpc-toolkit --help
```

Repository development still uses pnpm. npm/npx here are consumer commands for
the published CLI.

### Character authoring quick start

Create and edit a named character without writing selection JSON by hand:

```sh
lpc-toolkit character create hero --preset farmer
lpc-toolkit character search hero --type hair --query braid
lpc-toolkit character set hero --type hair --item hair_braid --recolor lpcr.brown
lpc-toolkit character preview hero
lpc-toolkit character render hero --out ./dist/hero --animation walk --bundle zip
```

Named selections live under `./characters/`. Preview and render outputs include
metadata plus TXT and CSV attribution. See
[`packages/cli/README.md`](packages/cli/README.md) for every command, `npx`
usage, cache locations, local asset precedence, output defaults, and
troubleshooting.

### Codex Plugin

Install the beta Codex plugin from this repository marketplace:

```sh
codex plugin marketplace add ochowei/lpc-toolkit-2026-1
codex plugin add lpc-toolkit@lpc-toolkit
```

The plugin requires an installed compatible `lpc-toolkit` CLI and does not
automatically install the CLI. Beta users add the repository marketplace once,
then install or enable the plugin. Restart the ChatGPT desktop app or start a
new Codex task if the newly installed skill is not visible. Public Plugins
Directory distribution can later remove the marketplace-add step.

The plugin guides Codex through JSON search, edit, validate, preview, and render
workflows. Preview, render, and export outputs preserve metadata plus TXT and
CSV credits.

The CLI performs first-time asset preparation from a pinned release download,
verifies checksums, and stores a platform cache. Later commands rely on
verified cache reuse. A valid offline cache needs no network; a missing or invalid
offline cache fails with recovery guidance. A complete working-directory
`assets/` tree takes precedence, with `assets_custom/` applied as an overlay.

CLI rendering writes the composed sheet with required metadata and credit
files, plus optional animation strips, frames, and ZIP bundles. Node-specific
dependencies such as `@napi-rs/canvas` (MIT) and `jszip` (MIT) remain in the CLI
package and outside core runtime source.

## Core Library

The core does not load files or create canvases. Callers supply a
`CanvasAdapter`:

```ts
interface CanvasAdapter {
  createCanvas(width: number, height: number): CanvasLike;
  loadImage(path: string): Promise<ImageLike>;
}
```

Concrete browser and Node implementations remain outside
`packages/core/src/`. See the
[`packages/core/README.md`](packages/core/README.md) for the executable example,
public API map, attribution contract, and link to full exported signatures.

The standard animation atlas is `832×3456` pixels.
For custom-animation source sheets, callers must not assume those dimensions:
each block is computed as `frameSize × columns` by `frameSize × rows` and
appended to the composed sheet.

## Architecture and Contributing

The repository follows a core-first, ports-and-adapters dependency direction:

```text
web ───────┐
           ├──> presets ──> core
CLI ───────┘          └────> core
```

Web components render and dispatch; pure `slice/` helpers own selection
decisions; hooks own effects and async orchestration; browser adapters/libs own
canvas, ZIP, download, storage, and URL behavior. CLI-specific filesystem,
canvas, persistence, cache, and publication behavior remains in the CLI.

Read the [architecture guide](docs/ARCHITECTURE.md) before broad package or web
responsibility changes. Read [CONTRIBUTING.md](CONTRIBUTING.md) before preparing
a pull request. The isolated parity checkout is the only executable upstream
source checkout; it is separate from the tracked read-only gitlink.

## Design Reference

The production web app uses a layer sidebar and sidebar splitter beside the
preview canvas. Its top-bar popovers own settings and export actions, and the
responsive layout collapses the same workflow into mobile navigation without
changing composition or attribution behavior.

The checked-in
[Layer Stack reference](reference/v2/LPC-Toolkit-LayerStack.html) is design
reference material; the production implementation remains the React/Vite app.

## License

GPL-3.0-or-later. See [`LICENSE`](LICENSE). The project inherits GPL-3.0 source
and LPC asset obligations from upstream; keep generated attribution metadata
with composed output and comply with the effective licenses it reports.
