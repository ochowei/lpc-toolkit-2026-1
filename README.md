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
| `packages/web/`     | _Planned_    | React 18 + Vite + Tailwind + shadcn/ui browser UI   |
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

## Documentation

- `CLAUDE.md` — project rules and conventions (authoritative)
- `API.md` — full `@lpc-toolkit/core` public API surface
- `RESEARCH.md` — read-only reconnaissance of the upstream LPC project

## License

GPL-3.0-or-later. See `LICENSE`. This project inherits GPL-3.0 from the
upstream LPC generator; all composed output must retain the attribution
metadata the toolkit generates.
