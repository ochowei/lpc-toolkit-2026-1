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
| `packages/web/`     | **Working**  | React 18 + Vite + Tailwind CSS v4 + shadcn-style UI with a full three-region grid desktop editor and mobile responsive layout |
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
pnpm build       # tsc build across all packages
```

All core art assets (spritesheets, sheet definitions, palette definitions, and `CREDITS.csv`) have been migrated from the `upstream/` submodule into the local `assets/` folder. The submodule is now kept for reference only.

To start the web UI development server locally:

```bash
pnpm --filter @lpc-toolkit/web dev
```

To build and inspect the CLI locally:

```bash
pnpm --filter @lpc-toolkit/cli build
pnpm --filter @lpc-toolkit/cli exec lpc --help
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
  composeSelections,
  extractAnimation,
  type Selections,
} from '@lpc-toolkit/core';

// 1. Build a catalog from sheet_definitions JSON, keyed by file path.
const { catalog, warnings } = createCatalog(records);

// 2. Describe the character.
const selections: Selections = {
  bodyType: 'male',
  items: {
    body: { typeName: 'body', name: 'Body color', variant: 'light' },
    hair: { typeName: 'hair', name: 'Afro', variant: 'black' },
  },
};

// 3. Compose the 832×3456 master sheet. `spritesheetsBaseUrl` points at
//    the directory that contains `spritesheets/` (e.g. the upstream checkout).
const sheet = await composeSelections(selections, {
  catalog,
  adapter,
  spritesheetsBaseUrl: '/path/to/repo/assets',
});

// 4. Crop one animation out of the master sheet.
const walk = extractAnimation(sheet, 'walk', { adapter });

// Attribution is always available alongside the pixels.
console.log(sheet.credits.licenses);
```

### Public API

Exported from `@lpc-toolkit/core` (see `API.md` for full signatures):

- **Catalog** — `createCatalog`
- **Compose** — `composeSelections`, `getSpritePathsForSelections`
- **Animation** — `extractAnimation`
- **Recolor** — `recolorImage`, `recolorPixels`
- **URL hash ↔ state** — `parseHash`, `serializeHash`
- **Attribution** — `getCredits`, `computeEffectiveLicense`
- **Result type** — `ok`, `err`, `isOk`, `isErr`, `unwrapOr` (a tiny
  `neverthrow`-shaped discriminated union, no dependency)
- **Constants** — `FRAME_SIZE` (64), `SHEET_WIDTH` (832), `SHEET_HEIGHT`
  (3456), `ANIMATIONS`, `ANIMATION_OFFSETS`, `LICENSE_CONFIG`, … plus the
  shared `types.ts` definitions (`Selections`, `ComposedSheet`, etc.)

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

- catalog exploration: `lpc catalog types`, `lpc catalog items --type <typeName>`
- selection validation: `lpc selection validate --selection <file>`
- token conversion: `lpc token encode --selection <file>`, `lpc token decode --token <hash-or-token> --out <file>`
- presets: `lpc preset list`, `lpc preset materialize <preset-id> --out <file>`, `lpc preset render <preset-id> --out <dir>`
- rendering: `lpc render --selection <file> --out <dir>`

CLI rendering writes the composed sheet plus required metadata and credit files,
with optional animation strips, frame exports, and ZIP bundles.

The CLI owns Node-specific runtime dependencies such as `@napi-rs/canvas`
(MIT) and `jszip` (MIT). These dependencies are GPL-compatible and must remain
outside `packages/core/src/**`; core continues to receive image loading and
canvas creation through injected adapter contracts.

## Web UI design reference

The web UI in `packages/web/` is fully built. Its design and component mockup live in [`reference/v2/`](reference/v2) as a self-contained HTML file ([`LPC-Toolkit-LayerStack.html`](file:///Users/william/gitRepo/lpc-toolkit-2026-1/reference/v2/LPC-Toolkit-LayerStack.html)). It serves as the **design source and reference material** — the production `packages/web/` is built with React 18 + Vite + Tailwind CSS v4 + shadcn-style UI consuming `@lpc-toolkit/core`.

### Previewing it

Open [LPC-Toolkit-LayerStack.html](file:///Users/william/gitRepo/lpc-toolkit-2026-1/reference/v2/LPC-Toolkit-LayerStack.html) in a browser (no install, no build step). It renders the mockup for the Layer Stack component, showcasing the styling, structure, and design system.

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
