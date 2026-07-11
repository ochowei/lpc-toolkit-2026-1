# lpc-toolkit

A monorepo providing an **environment-agnostic core library for composing
[LPC](https://lpc.opengameart.org/) character spritesheets**, plus a modern
React web UI and an agent-first Node CLI built on top of it.

LPC (Liberated Pixel Cup) art ships as many layered spritesheets — body,
hair, clothing, weapons, expressions, and so on. The
[Universal-LPC-Spritesheet-Character-Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator)
upstream project composes those layers in a DOM-bound Mithril web app. This
toolkit lifts the composition pipeline out into a clean, testable, reusable
library that runs unchanged in the browser **and** in Node, so a web UI and a
CLI can share one engine.

## Status

| Package             | State        | What it is                                          |
| ------------------- | ------------ | --------------------------------------------------- |
| `packages/core/`    | **Working**  | Pure TypeScript composition logic (catalog, compose, recolor, hash, credits) |
| `packages/presets/` | **Working**  | Shared themed outfit presets and preset-application logic |
| `packages/web/`     | **Working**  | React 18 + Vite + Tailwind CSS v4 + shadcn-style UI with a two-column desktop editor, top-bar popovers, and responsive mobile layout |
| `packages/cli/`     | **Working**  | Agent-first Node CLI for catalog exploration, selection validation, token conversion, presets, and rendering |

The core composition pipeline, shared presets, web UI, and CLI are working and tested.

## Stack

- **Language**: TypeScript (strict mode)
- **Package manager**: pnpm (workspaces) — do not switch to npm/yarn/bun
- **Tests**: Vitest
- **Web**: React 18 + Vite + Tailwind CSS v4 + shadcn-style UI
- **Deployment**: Vercel (static SPA)

## Layout

```
assets/            LPC art assets (spritesheets, sheet definitions, palette definitions, CREDITS.csv) migrated from upstream
upstream/          git submodule, read-only — LPC source (reference material only)
packages/core/     pure TypeScript composition logic (no DOM, no fs)
packages/presets/  shared preset definitions and pure preset-application helpers
packages/web/      React + Vite browser UI
packages/cli/      Node CLI with filesystem, canvas, ZIP, and agent-friendly JSON output
```

## Hard rules

These constraints are load-bearing — see `AGENTS.md` for the authoritative list.

1. **`upstream/` is a read-only git submodule.** Never modify it, never
   commit inside it, never run a package manager inside it. It is now legacy/reference,
   as active assets are migrated to the local `assets/` folder.
2. **License is GPL-3.0-or-later.** Upstream is GPL-3.0 and we inherit it. New
   dependencies must be license-compatible.
3. **Attribution is mandatory.** Every rendered sprite must carry credit
   metadata derived from `assets/CREDITS.csv` (or `upstream/CREDITS.csv`).
   `composeSelections` always returns a `credits` manifest for exactly this reason.
4. **`packages/core/` is environment-agnostic.** No `window`, `document`,
   `fs`, or `node-canvas`. Canvas creation and image loading are injected by
   the caller via a `CanvasAdapter`.
5. **TypeScript strict.** No `any` without a documented reason.

## Getting started

The LPC source references a submodule, so clone recursively:

```bash
git clone --recurse-submodules <repo-url>
# or, if already cloned:
git submodule update --init
```

Install dependencies and verify the workspace:

```bash
pnpm install
pnpm typecheck   # tsc --noEmit across all packages
pnpm test        # vitest run across all packages
pnpm build       # package builds: TypeScript, asset preparation, Vite, and CLI vendoring
```

The root build runs the package builds for core, presets, web, and CLI. Core and
presets compile their reusable TypeScript output; web prepares assets and builds
the Vite SPA; CLI builds and vendors the workspace runtime needed by its npm
tarball.

All core art assets (spritesheets, sheet definitions, palette definitions, and
`CREDITS.csv`) have been migrated from the `upstream/` submodule into the local
`assets/` folder. The submodule is read-only reference and provenance material.
Production web and CLI flows use local or pinned/cache-backed assets; parity
tests use an isolated parity checkout and never install packages inside
`upstream/`.

The CLI performs first-time asset preparation from its pinned release download,
verifies the checksum, and stores a platform cache. Later commands use verified cache reuse.
Offline cache use works after preparation; an empty or invalid
offline cache fails with recovery guidance. A working-directory `assets/`
override takes precedence, with `assets_custom/` applied as custom overlays.

To start the web UI development server locally:

```bash
pnpm --filter @lpc-toolkit/web dev
```

## `@lpc-toolkit/core`

The core is pure logic. It does not load files or create canvases itself —
the caller injects a `CanvasAdapter`:

```ts
interface CanvasAdapter {
  createCanvas(width: number, height: number): CanvasLike;
  loadImage(path: string): Promise<ImageLike>;
}
```

In the browser this wraps `<canvas>` / `Image`; in Node a library such as
`@napi-rs/canvas` (MIT) — see `packages/core/test/helpers/node-canvas-adapter.ts`
for the Node adapter used by the test suite. Concrete canvas libraries must
never be imported from `packages/core/src/`.

### Example

```ts
import {
  createCatalog,
  createPaletteCatalog,
  composeSelections,
  extractAnimation,
  makeResolvePalette,
  type CanvasAdapter,
  type FilePath,
  type ItemDefinition,
  type Selections,
} from '@lpc-toolkit/core';

// The caller loads sheet_definitions and palette_definitions JSON records and
// supplies an environment-specific canvas adapter.
declare const records: Readonly<Record<FilePath, ItemDefinition>>;
declare const paletteRecords: Readonly<Record<FilePath, unknown>>;
declare const adapter: CanvasAdapter;

// 1. Build the item and palette catalogs from records keyed by file path.
const { catalog, warnings: catalogWarnings } = createCatalog(records);
const { palettes, warnings: paletteWarnings } =
  createPaletteCatalog(paletteRecords);
console.warn(...catalogWarnings, ...paletteWarnings);

// 2. Recolor-backed assets use `recolor`, not a filename `variant`.
const selections: Selections = {
  bodyType: 'male',
  items: {
    body: { typeName: 'body', name: 'Body Color', recolor: 'brown' },
    hair: { typeName: 'hair', name: 'Afro', recolor: 'black' },
  },
};

// 3. Compose the standard 832×3456 master sheet. The base URL/path is the
//    directory that contains `spritesheets/`, such as the prepared `assets/`.
const sheet = await composeSelections(selections, {
  catalog,
  adapter,
  spritesheetsBaseUrl: '/path/to/repo/assets',
  resolvePalette: makeResolvePalette(catalog, palettes, selections),
});

// 4. Crop one animation out of the master sheet.
const walk = extractAnimation(sheet, 'walk', { adapter });

// Attribution is always available alongside both outputs.
console.log(sheet.credits.licenses, walk.credits.licenses);
```

### Public API

Exported from `@lpc-toolkit/core`; [`API.md`](API.md) is the signature source of
truth:

- **Catalog and palettes** — catalog creation, palette catalogs, lookups, and
  palette resolution.
- **Selections and tokens** — selection types, hash/token parsing, and
  serialization.
- **Composition and animation** — `composeSelections`, sprite-path resolution,
  frame helpers, and `extractAnimation`.
- **Recoloring** — image and pixel recoloring helpers.
- **Credits and validation** — precise credit manifests, effective licenses,
  credit formatting, and asset validation.
- **Shared contracts** — result helpers, canvas/image adapter types, constants,
  and animation metadata.

The standard animation atlas is `832×3456` pixels. The custom-animation source sheets
are not assumed to share those dimensions: each block is computed as
`frameSize × columns` by `frameSize × rows` and appended to the composed sheet.

## `@lpc-toolkit/presets`

`packages/presets/` contains shared themed outfit presets and pure helper logic
for applying those presets to existing selections. It depends on
`@lpc-toolkit/core` types and catalog helpers, but does not own rendering,
canvas creation, filesystem access, downloads, or browser UI behavior.

Both the web UI and CLI consume this package so preset behavior stays
consistent across surfaces.

## `@lpc-toolkit/cli`

`packages/cli/` is the Node runtime surface for agents and scripts. It provides
commands for:

- catalog exploration: `lpc-toolkit catalog types`, `lpc-toolkit catalog items --type <typeName>`
- selection validation: `lpc-toolkit selection validate --selection <file>`
- token conversion: `lpc-toolkit token encode --selection <file>`, `lpc-toolkit token decode --token <hash-or-token> --out <file>`
- presets: `lpc-toolkit preset list`, `lpc-toolkit preset materialize <preset-id> --out <file>`, `lpc-toolkit preset render <preset-id> --out <dir>`
- rendering: `lpc-toolkit render --selection <file> --out <dir>`

Node.js 22 or newer is required. Install the public CLI package from npm:

The current public package contract is `@lpc-toolkit/cli` version `0.1.1`.

```bash
npm install -g @lpc-toolkit/cli
lpc-toolkit --help
```

See [`packages/cli/README.md`](packages/cli/README.md) for `npx` usage, command
examples, cache locations and offline behavior, local asset precedence,
troubleshooting, attribution, and licensing. The CLI is the public npm package;
`@lpc-toolkit/core` and `@lpc-toolkit/presets` remain workspace packages and are
not published separately.

CLI rendering writes the composed sheet plus required metadata and credit files,
with optional animation strips, frame exports, and ZIP bundles.

The CLI owns Node-specific runtime dependencies such as `@napi-rs/canvas`
(MIT) and `jszip` (MIT). These dependencies are GPL-compatible and must remain
outside `packages/core/src/**`; core continues to receive image loading and
canvas creation through injected adapter contracts.

### Maintainers: local package and tarball verification

These commands exercise the unpublished workspace build. They are not public
installation instructions:

```bash
pnpm --filter @lpc-toolkit/cli build
node packages/cli/dist/index.js --help
pnpm --filter @lpc-toolkit/cli test:package
pnpm --filter @lpc-toolkit/cli pack --pack-destination /tmp
pnpm add -g /tmp/lpc-toolkit-cli-0.1.1.tgz
lpc-toolkit --help
```

The CLI build vendors the local core and presets runtime output into `dist/`, so
the tarball does not require `@lpc-toolkit/core` or `@lpc-toolkit/presets` to be
published.

### Maintainers: RC validation, npm bootstrap, and later releases

Before any stable release, update `packages/cli/package.json` to the intended
stable version and push a matching `v<version>-rc.<number>` tag. The **CLI
Release Candidate** workflow verifies the full CLI package flow on
`macos-latest` and `windows-latest`; it does not publish npm. Both jobs must pass
before the matching stable tag is created.

Maintainers may also launch **CLI Release Candidate** manually for any selected
ref. A manual run performs the same macOS and Windows checks, but it is advisory
and does not replace a successful tagged RC run.

The first publication is a deliberate manual gate. After the tagged
`v0.1.0-rc.<number>` validation passes and the release is explicitly authorized:

1. Create and push stable tag `v0.1.0`.
2. Confirm the **Publish CLI** workflow passes all verification and skips only
   its publish step for `v0.1.0`.
3. From `packages/cli`, use the npm owner account and 2FA to run
   `npm publish --access public`.
4. Install `@lpc-toolkit/cli@0.1.0` from the public npm registry into a clean
   prefix and verify `lpc-toolkit --help` and a real asset-dependent command.
5. Configure npm Trusted Publisher for repository
   `ochowei/lpc-toolkit-2026-1`, workflow `publish.yml`, with `npm publish` as
   the allowed action.

For later releases, push the matching RC tag and wait for both platform jobs,
then manually push stable tag `v<version>`. The stable tag workflow verifies the
version, boundaries, types, tests, packed install, and real assets before
publishing via npm OIDC. After one later OIDC release succeeds, restrict
traditional token publishing. Creating tags, publishing, registry verification,
and Trusted Publisher configuration are external release operations and must
not be run as ordinary implementation verification.

## Web UI and design reference

The web app has three routes: `/`, `/compose`, and the not-found route. The
landing page at `/` introduces the toolkit; `/compose` opens the editor; other
paths show the local not-found page.

The desktop editor uses a layer sidebar and sidebar splitter beside the preview canvas.
The top-bar popovers own settings and export actions. The responsive layout
collapses these regions into mobile navigation without changing composition or
attribution behavior.

The design mockup is the repository-relative
[Layer Stack reference](reference/v2/LPC-Toolkit-LayerStack.html). It is
reference material; the production `packages/web/` implementation uses React
18, Vite, Tailwind CSS v4, and the shared core package.

### Previewing it

Open the checked-in
[Layer Stack reference](reference/v2/LPC-Toolkit-LayerStack.html) in a browser
(no install or build step). It renders the component mockup, styling, structure,
and design system.

### Layout

Desktop is a top bar over a fixed 2-column grid; mobile collapses the view using a bottom navigation bar.

| Region | Desktop | Contents |
| ------ | ------- | -------- |
| **Left** | `340px` | Category accordions · search (`⌘K`) · active layers list (re-orderable) · inline variant selectors & color ramp swatches · active license & animation filters. |
| **Right** | `1fr` | Checkerboard preview canvas (`image-rendering: pixelated`) · playback transport & scrubber · zoom controls (fit/1×/2×/4×/8×) · collapsible attribution/export sidebar (attributions summary + licensing badge, download options). |
| **Mobile** | — | Bottom tabs to toggle between Preview and Layers, with popovers for settings and export. |

### Required states

The design specs four non-happy-path states: catalog loading (skeleton +
progress), empty character (body only, with a coachmark), search with no
matches, and a layer that failed to load (inline error chip + retry/pick-another
callout, preview falls back to the next layer).

### Design tokens

Tokens are CSS custom properties that flip wholesale between `.lpc.dark` (the
default, for pixel work) and `.lpc.light`. Accent hues are defined in `oklch`
for stable lightness across themes.

- **Type** — Space Grotesk (UI) + JetBrains Mono (numbers, code, badges); scale `10 → 32px`
- **Spacing** — `2 4 8 12 16 20 24 32 40`; radii `3 5 8 12`; focus ring always visible, 2px `--accent` at offset 2
- **License palettes** — distinct color families per license: GPL, CC-BY, CC-BY-SA, OGA-BY, CC0 (license strictness order, strictest first: `GPL 3.0` > `CC-BY-SA 3.0` > `CC-BY 3.0` / `OGA-BY 3.0` > `CC0`)

### Component inventory

The design enumerates ~32 function components in 6 groups — App shell, Picker
(left), Preview (center), Attribution & export (right), Mobile, and Feedback —
each annotated with key props/states and the shadcn/ui primitive it composes
onto (Button, Input, Accordion, Tabs, Slider, Badge, Skeleton, Sheet, Toast,
…). See the "Component inventory" artboard for the full handoff table.

## License

GPL-3.0-or-later. See `LICENSE`. This project inherits GPL-3.0 from the
upstream LPC generator; all composed output must retain the attribution
metadata the toolkit generates.
