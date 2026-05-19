# lpc-toolkit

A monorepo providing an **environment-agnostic core library for composing
[LPC](https://lpc.opengameart.org/) character spritesheets**, plus a planned
React web UI and CLI built on top of it.

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
| `packages/web/`     | _Foundation slice_ | React 18 + Vite + Tailwind v4 + shadcn-style UI; core integration verified locally. See `docs/superpowers/specs/2026-05-18-web-ui-foundation-slice-design.md`. |
| `packages/cli/`     | _Planned_    | Node CLI                                             |

The core composition pipeline is implemented and tested with Vitest. The web
and CLI packages have not been started yet.

## Stack

- **Language**: TypeScript (strict mode)
- **Package manager**: pnpm (workspaces) — do not switch to npm/yarn/bun
- **Tests**: Vitest
- **Web (planned)**: React 18 + Vite + Tailwind CSS + shadcn/ui
- **Deployment (planned)**: Cloudflare Pages (static SPA)

## Layout

```
upstream/          git submodule, read-only — LPC source, spritesheets,
                   sheet_definitions, CREDITS.csv (reference material only)
packages/core/     pure TypeScript composition logic (no DOM, no fs)
packages/web/      planned React + Vite browser UI
packages/cli/      planned Node CLI
```

## Hard rules

These constraints are load-bearing — see `CLAUDE.md` for the authoritative list.

1. **`upstream/` is a read-only git submodule.** Never modify it, never
   commit inside it, never run a package manager inside it. It is the source
   of `spritesheets/` and `sheet_definitions/`.
2. **License is GPL-3.0-or-later.** Upstream is GPL-3.0 and we inherit it. New
   dependencies must be license-compatible.
3. **Attribution is mandatory.** Every rendered sprite must carry credit
   metadata derived from `upstream/CREDITS.csv`. `composeSelections` always
   returns a `credits` manifest for exactly this reason.
4. **`packages/core/` is environment-agnostic.** No `window`, `document`,
   `fs`, or `node-canvas`. Canvas creation and image loading are injected by
   the caller via a `CanvasAdapter`.
5. **TypeScript strict.** No `any` without a documented reason.

## Getting started

The LPC source lives in a submodule, so clone recursively:

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
  spritesheetsBaseUrl: '/path/to/upstream',
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

## Web UI design reference

`packages/web/` has not been built yet, but its UI is fully designed. The
design lives in [`reference/LPC-Tool-Web_UI/`](reference/LPC-Tool-Web_UI) as a
self-contained, build-free React prototype (Babel-standalone in the browser,
mock fixtures, inline styles). It is **reference material only** — the real
`packages/web/` will be React 18 + Vite + Tailwind + shadcn/ui consuming
`@lpc-toolkit/core`, not a port of this prototype's code.

### Previewing it

Open `reference/LPC-Tool-Web_UI/index.html` in a browser (no install, no build
step). It renders a "design canvas" of artboards: desktop (dark + light),
mobile, required states, design tokens, and the component inventory.

### Layout

Desktop is a top bar over a fixed three-region grid; mobile collapses the
three regions into four bottom tabs with the preview kept as the priority.

| Region | Desktop | Contents |
| ------ | ------- | -------- |
| **Left** | `320px` | Body-type grid (6 types) · search (`⌘K`) · category accordion · item grid with pixel thumbnails · inline variant chips + recolor ramp swatches |
| **Center** | `1fr` | Checkerboard preview canvas (`image-rendering: pixelated`) · animation tabs (12 animations) · 3×3 N/S/E/W direction pad · zoom stepper (1×/2×/4×/8×) · playback transport (play/pause, frame scrubber, FPS) |
| **Right** | `340px` | **Attribution** panel (mandatory, never hidden) — effective-license hero card ("strictest wins") + per-layer credit rows · **Export** panel — 832×3456 PNG, current strip, animated GIF, share link |
| **Mobile** | — | Bottom tabs: Preview · Layers · Credits · Export |

Attribution being a permanent, prominent region is a direct expression of the
mandatory-attribution hard rule, not a UI afterthought.

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

## Documentation

- `CLAUDE.md` — project rules and conventions (authoritative)
- `API.md` — full `@lpc-toolkit/core` public API surface
- `RESEARCH.md` — read-only reconnaissance of the upstream LPC project
- `reference/LPC-Tool-Web_UI/` — Claude-designed web UI prototype and design
  spec for the planned `packages/web/` (see above)

## License

GPL-3.0-or-later. See `LICENSE`. This project inherits GPL-3.0 from the
upstream LPC generator; all composed output must retain the attribution
metadata the toolkit generates.
