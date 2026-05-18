# Web UI — Foundation Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `packages/web` as a reusable React/Vite/Tailwind/shadcn foundation that proves `@lpc-toolkit/core` runs end-to-end in the browser: real catalog → layer selection → `composeSelections` → `extractAnimation` → animated canvas → attribution.

**Architecture:** A pnpm-workspace package depending on built `@lpc-toolkit/core`. A browser `CanvasAdapter` (`document.createElement('canvas')` + `fetch`/`createImageBitmap`) feeds core. `sheet_definitions` are read via `import.meta.glob` over the `upstream/` submodule; the spritesheet PNG subset is copied into `public/spritesheets/` by a Node script. Pure logic (state→`Selections` bridge, initial-selection picker, sprite-dir collector, frame-rect math, URL resolver) is unit-tested with Vitest; a Node integration test exercises the full core pipeline with real assets.

**Tech Stack:** React 18, Vite, TypeScript (strict), Tailwind CSS v4, shadcn/ui-style components (vendored), Vitest, `@napi-rs/canvas` (Node test adapter), `tsx` (run the TS copy script).

---

## Spec deviations (discovered from core source — read before starting)

These correct the approved spec (`docs/superpowers/specs/2026-05-18-web-ui-foundation-slice-design.md`) against actual core behaviour. They are intentional and load-bearing:

1. **`spritesheetsBaseUrl = ''`**, not `'/spritesheets'`. Core prepends `spritesheets/` to every layer path (`compose.ts:198`, asserted by `credits.ts:18`). PNGs are copied to `packages/web/public/spritesheets/...`; Vite serves them at `/spritesheets/...`; the browser adapter resolves the relative path against `document.baseURI`.
2. **`Direction` = `'up' | 'left' | 'down' | 'right'`** (core `constants.ts:24`); slice default is `'down'`. The spec's `'S'` was prototype shorthand.
3. **Animation playback reads `ANIMATION_CONFIGS[name].cycle`** (exported by core) for column order and `ComposedAnimation.directions` for row count. `ComposedAnimation` does not expose `cycle`.
4. **Initial preset is data-driven, not hardcoded.** The submodule contents are not known at plan time, so hardcoding specific item names / licenses is fragile. `pickInitialSelections(catalog)` derives a known-good outfit from the live catalog. The "verify strictest-license-wins" goal is met by asserting the *property* (effective license ∈ manifest licenses; manifest non-empty) rather than a hardcoded license.
5. **Body-type switching scope:** the copy script bundles the initial outfit across *all* `BODY_TYPES` (so the body-type selector is live) and *all* items of the shown type-names at the default body type (so layer selectors are live). Arbitrary item×bodyType combinations that weren't bundled 404 → core swallows the load → the slice shows a per-layer "failed to load" marker (spec §5). This satisfies spec §7 DoD items 1–3 while staying bounded.

---

## File structure

All paths relative to repo root `/Users/william/gitRepo/lpc-toolkit-2026-1`.

| File | Responsibility |
|---|---|
| `packages/web/package.json` | Package manifest, scripts, deps (`@lpc-toolkit/core` workspace). |
| `packages/web/tsconfig.json` | Strict TS for app + tests + vite/scripts; DOM lib, `react-jsx`. |
| `packages/web/vite.config.ts` | React + Tailwind v4 plugins; `server.fs.allow` reaches repo root. |
| `packages/web/vitest.config.ts` | Node-env test runner, `test/**/*.test.ts`. |
| `packages/web/index.html` | SPA entry. |
| `packages/web/src/vite-env.d.ts` | `vite/client` types (for `import.meta.glob`). |
| `packages/web/src/index.css` | Tailwind import + design tokens ported from `reference/.../styles.css`. |
| `packages/web/src/main.tsx` | React root mount. |
| `packages/web/src/App.tsx` | Composes the harness; owns theme + catalog load. |
| `packages/web/src/lib/cn.ts` | `cn()` class-merge util (shadcn convention). |
| `packages/web/src/components/ui/button.tsx` | Vendored shadcn-style Button (MIT). |
| `packages/web/src/adapter/browser-canvas-adapter.ts` | Core `CanvasAdapter` for the browser + pure `resolveSpriteUrl`. |
| `packages/web/src/catalog/load-catalog.ts` | `import.meta.glob` → `createCatalog`. |
| `packages/web/src/slice/selection.ts` | `SliceState`, reducer, `pickInitialSelections`, `toSelections` (the only core-coupling point). |
| `packages/web/src/slice/sprite-dirs.ts` | `dirsForSelections`, `posixDirname` (shared by copy script). |
| `packages/web/src/slice/frame-rect.ts` | `frameRect()` — maps (config, dir, frame) → source rect. |
| `packages/web/src/hooks/use-composed-character.ts` | state → compose → extract, with stale-request guard + progress + per-layer errors. |
| `packages/web/src/hooks/use-animation-player.ts` | RAF loop drawing `ComposedAnimation` frames to the visible canvas. |
| `packages/web/src/components/slice-harness.tsx` | The minimal 3-region UI. |
| `packages/web/scripts/copy-spritesheets.ts` | Copies the PNG subset from `upstream/` into `public/`. |
| `packages/web/test/*.test.ts` | Unit + Node integration tests. |
| `.gitignore` | Add `packages/web/public/spritesheets/`. |
| `README.md` | Flip the `packages/web/` status row. |

---

## Dependencies & licenses (CLAUDE.md hard rule 2 — confirm at handoff)

All permissive and GPL-3.0-compatible (a GPL-3.0 project may incorporate MIT/Apache-2.0 deps):

- Runtime: `react`, `react-dom` (MIT); `clsx` (MIT), `tailwind-merge` (MIT), `class-variance-authority` (Apache-2.0), `@radix-ui/react-slot` (MIT) — these are the shadcn/ui footprint mandated by the spec stack.
- Dev/build: `vite`, `@vitejs/plugin-react`, `tailwindcss`@4, `@tailwindcss/vite`, `vitest`, `@types/react`, `@types/react-dom` (MIT); `typescript` (Apache-2.0, already in root).
- Test/script tooling **not named in the spec stack — explicitly flag for user**: `@napi-rs/canvas` (MIT, Node integration-test adapter; already a core devDep), `tsx` (MIT, runs the TypeScript copy script).

---

## Prerequisite — Task 0: Initialize the `upstream/` submodule

**Files:** none (environment setup).

- [ ] **Step 1: Check submodule state**

Run: `git submodule status`
Expected: a line beginning with `-` (uninitialized), e.g. `-5734bee... upstream`.

- [ ] **Step 2: Initialize it**

Run: `git submodule update --init --depth 1 upstream`
Expected: clone progress, ends without error. (This is README's documented step. It is large; allow time.)

- [ ] **Step 3: Verify content exists**

Run: `ls upstream/sheet_definitions | head -3 && ls upstream/spritesheets | head -3`
Expected: JSON filenames (e.g. `body_*.json`) and spritesheet subdirectories. If empty, stop — nothing downstream works without this.

No commit (submodule pointer is unchanged; this only populates the working tree).

---

## Task 1: Scaffold the `packages/web` package

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/index.html`
- Create: `packages/web/src/vite-env.d.ts`
- Create: `packages/web/src/main.tsx`
- Create: `packages/web/src/App.tsx`
- Create: `packages/web/src/index.css`
- Modify: `.gitignore`

- [ ] **Step 1: Write `packages/web/package.json`**

```json
{
  "name": "@lpc-toolkit/web",
  "version": "0.0.0",
  "private": true,
  "license": "GPL-3.0-or-later",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "copy-sprites": "tsx scripts/copy-spritesheets.ts",
    "pretest": "tsx scripts/copy-spritesheets.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@lpc-toolkit/core": "workspace:*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.4",
    "class-variance-authority": "^0.7.1",
    "@radix-ui/react-slot": "^1.1.1"
  },
  "devDependencies": {
    "@napi-rs/canvas": "^1.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "tailwindcss": "^4.0.0",
    "tsx": "^4.19.2",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: Write `packages/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"],
    "noEmit": true,
    "allowImportingTsExtensions": true
  },
  "include": ["src", "test", "scripts", "vite.config.ts", "vitest.config.ts"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Write `packages/web/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `server.fs.allow` must reach the repo root so `import.meta.glob` can read
// the read-only `upstream/` submodule (two levels up from packages/web).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { fs: { allow: ['../..'] } },
});
```

- [ ] **Step 4: Write `packages/web/index.html`**

```html
<!doctype html>
<html lang="en" class="lpc dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LPC Toolkit</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write `packages/web/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 6: Write `packages/web/src/index.css`** (Tailwind only for now; tokens land in Task 2)

```css
@import 'tailwindcss';
```

- [ ] **Step 7: Write `packages/web/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 8: Write a placeholder `packages/web/src/App.tsx`**

```tsx
export default function App() {
  return <div className="p-4 text-sm">LPC Toolkit — foundation slice</div>;
}
```

- [ ] **Step 9: Ignore copied assets — append to `.gitignore`**

Add this block at the end of `.gitignore`:

```
# Web slice: copied spritesheet subset (regenerated by copy-spritesheets)
packages/web/public/spritesheets/
```

- [ ] **Step 10: Install and verify the scaffold builds**

Run: `pnpm install`
Then: `pnpm --filter @lpc-toolkit/core build`
Then: `pnpm --filter @lpc-toolkit/web build`
Expected: install succeeds; core emits `packages/core/dist`; web `vite build` succeeds and writes `packages/web/dist/index.html`.

- [ ] **Step 11: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add packages/web/package.json packages/web/tsconfig.json packages/web/vite.config.ts packages/web/index.html packages/web/src/vite-env.d.ts packages/web/src/main.tsx packages/web/src/App.tsx packages/web/src/index.css .gitignore pnpm-lock.yaml
git commit -m "feat(web): scaffold @lpc-toolkit/web package (Vite + React + Tailwind v4)"
```

---

## Task 2: Port design tokens into Tailwind v4 theme

**Files:**
- Modify: `packages/web/src/index.css`

Source of truth: `reference/LPC-Tool-Web_UI/styles.css` (read it; this task transcribes its `:root` / `.lpc.dark` / `.lpc.light` custom properties and the checkerboard/scrollbar/focus rules into the Vite app's stylesheet, scoped the same way).

- [ ] **Step 1: Replace `packages/web/src/index.css` with the full token sheet**

```css
@import 'tailwindcss';

/* Design tokens — transcribed from reference/LPC-Tool-Web_UI/styles.css.
   Kept as CSS custom properties so future shadcn components and Tailwind
   arbitrary values (e.g. bg-[var(--surface)]) can consume them. */
:root {
  --font-sans: 'Space Grotesk', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, Menlo, monospace;
  --s-0: 2px; --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px;
  --s-5: 20px; --s-6: 24px; --s-8: 32px; --s-10: 40px;
  --r-1: 3px; --r-2: 5px; --r-3: 8px; --r-4: 12px;
  --t-10: 10px; --t-11: 11px; --t-12: 12px; --t-13: 13px;
  --t-14: 14px; --t-16: 16px; --t-20: 20px; --t-24: 24px; --t-32: 32px;
}

.lpc.dark {
  --bg-deep: #0a0c11; --bg-app: #10131a; --surface: #171b24;
  --surface-2: #1e2330; --surface-3: #262c3b; --border: #2a3142;
  --border-strong: #3b4258; --text: #e6eaf3; --text-2: #aab2c4;
  --text-mute: #717a92; --text-dim: #4d556a;
  --accent: oklch(82% 0.18 130); --accent-ink: #0a0c11;
  --accent-2: oklch(80% 0.15 70); --danger: oklch(72% 0.18 25);
  --success: oklch(80% 0.16 150); --info: oklch(78% 0.13 230);
  --lic-gpl-bg: #3a1f1a; --lic-gpl-fg: #ff8b6a;
  --lic-ccby-bg: #1c2b3a; --lic-ccby-fg: #6cc1ff;
  --lic-ccbysa-bg: #2f2a18; --lic-ccbysa-fg: #e8c75a;
  --lic-ogaby-bg: #2a1f3a; --lic-ogaby-fg: #b890ff;
  --checker-a: #1a1f2a; --checker-b: #232938;
  color-scheme: dark;
}

.lpc.light {
  --bg-deep: #ebe6da; --bg-app: #f4f0e6; --surface: #fbf8ef;
  --surface-2: #ffffff; --surface-3: #f0ecdf; --border: #d9d2bf;
  --border-strong: #b8af97; --text: #1a1d24; --text-2: #4a4c54;
  --text-mute: #6e6a5b; --text-dim: #9a9485;
  --accent: oklch(58% 0.17 130); --accent-ink: #ffffff;
  --accent-2: oklch(60% 0.16 60); --danger: oklch(55% 0.18 25);
  --success: oklch(55% 0.16 150); --info: oklch(55% 0.13 230);
  --lic-gpl-bg: #fbe2d6; --lic-gpl-fg: #8c2b13;
  --lic-ccby-bg: #d6e7fb; --lic-ccby-fg: #1b4f87;
  --lic-ccbysa-bg: #faf0c6; --lic-ccbysa-fg: #6e5500;
  --lic-ogaby-bg: #ece0fa; --lic-ogaby-fg: #5b2a93;
  --checker-a: #e8e2d2; --checker-b: #d6cfba;
  color-scheme: light;
}

/* Map tokens into the Tailwind v4 theme so utilities like `bg-app`,
   `text-text`, `border-border`, `font-sans` resolve to the tokens. */
@theme inline {
  --color-bg-app: var(--bg-app);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-surface-3: var(--surface-3);
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-text: var(--text);
  --color-text-2: var(--text-2);
  --color-text-mute: var(--text-mute);
  --color-text-dim: var(--text-dim);
  --color-accent: var(--accent);
  --color-accent-ink: var(--accent-ink);
  --color-danger: var(--danger);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
}

.lpc {
  font-family: var(--font-sans);
  background: var(--bg-app);
  color: var(--text);
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
}
* { box-sizing: border-box; }

.lpc .checker {
  background-image:
    linear-gradient(45deg, var(--checker-a) 25%, transparent 25%),
    linear-gradient(-45deg, var(--checker-a) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--checker-a) 75%),
    linear-gradient(-45deg, transparent 75%, var(--checker-a) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-color: var(--checker-b);
}
.lpc canvas {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
.lpc .scroll { overflow-y: auto; scrollbar-width: thin; }
.lpc :focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Verify build still succeeds with the token sheet**

Run: `pnpm --filter @lpc-toolkit/web build`
Expected: success; no Tailwind/PostCSS errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/index.css
git commit -m "feat(web): port LPC design tokens into Tailwind v4 theme"
```

---

## Task 3: shadcn/ui-style `cn` util + Button (vendored)

**Files:**
- Create: `packages/web/src/lib/cn.ts`
- Create: `packages/web/src/components/ui/button.tsx`
- Test: `packages/web/test/cn.test.ts`

- [ ] **Step 1: Write the failing test `packages/web/test/cn.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { cn } from '../src/lib/cn';

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', false && 'b', 'c')).toBe('a c');
  });

  it('lets later tailwind classes win on conflict', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/cn.test.ts`
Expected: FAIL — cannot resolve `../src/lib/cn`.

- [ ] **Step 3: Write `packages/web/src/lib/cn.ts`**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn convention: clsx for conditionals, tailwind-merge for conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/cn.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write `packages/web/src/components/ui/button.tsx`** (vendored shadcn-style, MIT)

```tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--surface-3)]',
        primary:
          'bg-[var(--accent)] text-[var(--accent-ink)] hover:opacity-90',
        ghost: 'text-[var(--text-2)] hover:bg-[var(--surface-2)]',
      },
      size: {
        sm: 'h-7 px-2',
        md: 'h-9 px-4',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/lib/cn.ts packages/web/src/components/ui/button.tsx packages/web/test/cn.test.ts
git commit -m "feat(web): add shadcn-style cn() util and Button component"
```

---

## Task 4: Browser canvas adapter + pure URL resolver

**Files:**
- Create: `packages/web/src/adapter/browser-canvas-adapter.ts`
- Test: `packages/web/test/browser-canvas-adapter.test.ts`

- [ ] **Step 1: Write the failing test `packages/web/test/browser-canvas-adapter.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { resolveSpriteUrl } from '../src/adapter/browser-canvas-adapter';

describe('resolveSpriteUrl', () => {
  it('resolves a core sprite path against the document base', () => {
    expect(
      resolveSpriteUrl('spritesheets/body/bodies/male/walk.png', 'http://x/'),
    ).toBe('http://x/spritesheets/body/bodies/male/walk.png');
  });

  it('resolves under a sub-path base', () => {
    expect(
      resolveSpriteUrl('spritesheets/a.png', 'http://x/app/'),
    ).toBe('http://x/app/spritesheets/a.png');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/browser-canvas-adapter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/web/src/adapter/browser-canvas-adapter.ts`**

```ts
import type {
  CanvasAdapter,
  CanvasLike,
  ImageLike,
} from '@lpc-toolkit/core';

/**
 * Core hands us paths like `spritesheets/body/bodies/male/walk.png` (it
 * prepends `spritesheets/` itself — see compose.ts). We serve the copied
 * subset from Vite's `public/`, so resolve relative to the document base.
 * Pure + DOM-free so it is unit-testable.
 */
export function resolveSpriteUrl(path: string, baseHref: string): string {
  return new URL(path, baseHref).href;
}

export function createBrowserCanvasAdapter(): CanvasAdapter {
  return {
    createCanvas(width: number, height: number): CanvasLike {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      return c as unknown as CanvasLike;
    },
    async loadImage(path: string): Promise<ImageLike> {
      const url = resolveSpriteUrl(path, document.baseURI);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`loadImage ${url}: HTTP ${res.status}`);
      const blob = await res.blob();
      return (await createImageBitmap(blob)) as unknown as ImageLike;
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/browser-canvas-adapter.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/adapter/browser-canvas-adapter.ts packages/web/test/browser-canvas-adapter.test.ts
git commit -m "feat(web): browser CanvasAdapter + pure resolveSpriteUrl"
```

---

## Task 5: Catalog loader (`import.meta.glob`)

**Files:**
- Create: `packages/web/src/catalog/load-catalog.ts`
- Test: `packages/web/test/load-catalog.test.ts`

`import.meta.glob` cannot run under Vitest's Node transform the way it does in Vite, so the testable seam is a pure `recordsToCatalog(records)` wrapper; the glob call is a thin shell verified by the running app + the Task 11 integration test.

- [ ] **Step 1: Write the failing test `packages/web/test/load-catalog.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { ItemDefinition } from '@lpc-toolkit/core';
import { recordsToCatalog } from '../src/catalog/load-catalog';

const item: ItemDefinition = {
  name: 'Plain',
  type_name: 'hair',
  animations: ['walk'],
  credits: [],
  layer_1: { zPos: 100, male: 'hair/plain/' },
} as unknown as ItemDefinition;

describe('recordsToCatalog', () => {
  it('builds a catalog and surfaces it with warnings', () => {
    const { catalog, warnings } = recordsToCatalog({
      'hair_plain.json': item,
    });
    expect(catalog.byTypeName.get('hair')?.[0]?.name).toBe('Plain');
    expect(warnings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/load-catalog.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/web/src/catalog/load-catalog.ts`**

```ts
import {
  createCatalog,
  type Catalog,
  type CreateCatalogResult,
  type FilePath,
  type ItemDefinition,
} from '@lpc-toolkit/core';

export function recordsToCatalog(
  records: Readonly<Record<FilePath, ItemDefinition>>,
): CreateCatalogResult {
  return createCatalog(records);
}

/**
 * Build the catalog from the read-only `upstream/` submodule. The glob is
 * static and relative: from packages/web/src/catalog/ the repo root is four
 * levels up. Vite inlines every matched JSON's default export at build time.
 * If the submodule is not initialized the glob is empty and we throw with a
 * fix instruction (spec §5).
 */
export function loadCatalogFromUpstream(): Catalog {
  const mods = import.meta.glob<ItemDefinition>(
    '../../../../upstream/sheet_definitions/**/*.json',
    { eager: true, import: 'default' },
  );
  const records: Record<FilePath, ItemDefinition> = {};
  for (const [key, def] of Object.entries(mods)) records[key] = def;

  if (Object.keys(records).length === 0) {
    throw new Error(
      'No sheet definitions found. Run: git submodule update --init',
    );
  }

  const { catalog, warnings } = recordsToCatalog(records);
  if (warnings.length > 0) {
    console.warn(`[catalog] ${warnings.length} load warning(s)`, warnings);
  }
  if (catalog.typeNames.length === 0) {
    throw new Error('Catalog is empty after ingest (all records invalid).');
  }
  return catalog;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/load-catalog.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/catalog/load-catalog.ts packages/web/test/load-catalog.test.ts
git commit -m "feat(web): catalog loader over upstream sheet_definitions"
```

---

## Task 6: Slice state, reducer, initial-selection picker, and `toSelections` bridge

**Files:**
- Create: `packages/web/src/slice/selection.ts`
- Test: `packages/web/test/selection.test.ts`

- [ ] **Step 1: Write the failing test `packages/web/test/selection.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import {
  pickInitialSelections,
  sliceReducer,
  toSelections,
  type SliceState,
} from '../src/slice/selection';

function defn(
  name: string,
  type_name: string,
  bodyType = 'male',
): ItemDefinition {
  return {
    name,
    type_name,
    animations: ['walk'],
    credits: [],
    layer_1: { zPos: 10, [bodyType]: `${type_name}/${name}/` },
  } as unknown as ItemDefinition;
}

const { catalog } = createCatalog({
  'body_a.json': defn('Body A', 'body'),
  'hair_a.json': defn('Hair A', 'hair'),
  'hair_b.json': defn('Hair B', 'hair'),
});

describe('pickInitialSelections', () => {
  it('picks a body + first item of each available preferred type', () => {
    const { state, shownTypeNames } = pickInitialSelections(catalog);
    expect(state.bodyType).toBe('male');
    expect(state.selections['body']).toBe('Body A');
    expect(state.selections['hair']).toBe('Hair A');
    expect(shownTypeNames).toContain('body');
    expect(shownTypeNames).toContain('hair');
    expect(state.anim).toBe('walk');
    expect(state.dir).toBe('down');
  });
});

describe('toSelections', () => {
  it('maps state to core Selections using ItemDefinition.name, no variant', () => {
    const state: SliceState = {
      bodyType: 'male',
      selections: { body: 'Body A', hair: 'Hair A' },
      anim: 'walk',
      dir: 'down',
      playing: true,
    };
    const sel = toSelections(state);
    expect(sel.bodyType).toBe('male');
    expect(sel.items['hair']).toEqual({ typeName: 'hair', name: 'Hair A' });
    expect('variant' in sel.items['body']!).toBe(false);
  });
});

describe('sliceReducer', () => {
  it('pick sets, clear removes', () => {
    const s0: SliceState = {
      bodyType: 'male',
      selections: { body: 'Body A' },
      anim: 'walk',
      dir: 'down',
      playing: true,
    };
    const s1 = sliceReducer(s0, { type: 'pick', typeName: 'hair', name: 'Hair B' });
    expect(s1.selections['hair']).toBe('Hair B');
    const s2 = sliceReducer(s1, { type: 'clear', typeName: 'hair' });
    expect('hair' in s2.selections).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/selection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/web/src/slice/selection.ts`**

```ts
import {
  BODY_TYPES,
  type AnimationName,
  type BodyType,
  type Catalog,
  type Direction,
  type ItemDefinition,
  type Selections,
  type TypeName,
} from '@lpc-toolkit/core';

export interface SliceState {
  readonly bodyType: BodyType;
  /** typeName -> ItemDefinition.name (raw name, what core's Selection wants). */
  readonly selections: Readonly<Record<TypeName, string>>;
  readonly anim: AnimationName;
  readonly dir: Direction;
  readonly playing: boolean;
}

export type SliceAction =
  | { type: 'set_body_type'; bodyType: BodyType }
  | { type: 'pick'; typeName: TypeName; name: string }
  | { type: 'clear'; typeName: TypeName }
  | { type: 'set_anim'; anim: AnimationName }
  | { type: 'set_dir'; dir: Direction }
  | { type: 'toggle_play' };

export function sliceReducer(s: SliceState, a: SliceAction): SliceState {
  switch (a.type) {
    case 'set_body_type':
      return { ...s, bodyType: a.bodyType };
    case 'pick':
      return {
        ...s,
        selections: { ...s.selections, [a.typeName]: a.name },
      };
    case 'clear': {
      const next = { ...s.selections };
      delete next[a.typeName];
      return { ...s, selections: next };
    }
    case 'set_anim':
      return { ...s, anim: a.anim };
    case 'set_dir':
      return { ...s, dir: a.dir };
    case 'toggle_play':
      return { ...s, playing: !s.playing };
    default:
      return s;
  }
}

/** Core's Selection requires `name` to equal ItemDefinition.name; no variant. */
export function toSelections(state: SliceState): Selections {
  const items: Record<TypeName, { typeName: TypeName; name: string }> = {};
  for (const [typeName, name] of Object.entries(state.selections)) {
    if (name) items[typeName] = { typeName, name };
  }
  return { bodyType: state.bodyType, items };
}

const PREFERRED: readonly TypeName[] = [
  'body',
  'head',
  'hair',
  'eyes',
  'torso',
  'legs',
  'feet',
];

function supportsBodyType(item: ItemDefinition, bt: BodyType): boolean {
  return typeof item.layer_1?.[bt] === 'string';
}

/**
 * Derive a known-good starting outfit from the live catalog (spec deviation
 * 4). Body type = first BODY_TYPES value some body item supports. shownTypeNames
 * = the preferred types present in the catalog; the body type is always shown.
 */
export function pickInitialSelections(catalog: Catalog): {
  state: SliceState;
  shownTypeNames: TypeName[];
} {
  const bodies = catalog.byTypeName.get('body') ?? [];
  let bodyType: BodyType | undefined;
  let bodyName: string | undefined;
  for (const bt of BODY_TYPES) {
    const item = bodies.find((i) => supportsBodyType(i, bt));
    if (item) {
      bodyType = bt;
      bodyName = item.name;
      break;
    }
  }
  if (!bodyType || !bodyName) {
    throw new Error(
      'pickInitialSelections: no "body" item supports any standard body type',
    );
  }

  const shownTypeNames: TypeName[] = ['body'];
  const selections: Record<TypeName, string> = { body: bodyName };
  for (const tn of PREFERRED) {
    if (tn === 'body') continue;
    const items = catalog.byTypeName.get(tn);
    if (!items || items.length === 0) continue;
    shownTypeNames.push(tn);
    const first = items.find((i) => supportsBodyType(i, bodyType!));
    if (first) selections[tn] = first.name;
  }

  return {
    state: { bodyType, selections, anim: 'walk', dir: 'down', playing: true },
    shownTypeNames,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/selection.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/slice/selection.ts packages/web/test/selection.test.ts
git commit -m "feat(web): slice state, reducer, initial picker, toSelections bridge"
```

---

## Task 7: Sprite-dir collector + copy script

**Files:**
- Create: `packages/web/src/slice/sprite-dirs.ts`
- Create: `packages/web/scripts/copy-spritesheets.ts`
- Test: `packages/web/test/sprite-dirs.test.ts`

- [ ] **Step 1: Write the failing test `packages/web/test/sprite-dirs.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import { dirsForSelections, posixDirname } from '../src/slice/sprite-dirs';

const body: ItemDefinition = {
  name: 'Body A',
  type_name: 'body',
  animations: ['walk'],
  credits: [],
  layer_1: { zPos: 10, male: 'body/bodies/male/' },
} as unknown as ItemDefinition;

const { catalog } = createCatalog({ 'body_a.json': body });

describe('posixDirname', () => {
  it('drops the last path segment', () => {
    expect(posixDirname('body/bodies/male/walk.png')).toBe('body/bodies/male');
  });
});

describe('dirsForSelections', () => {
  it('returns the layer directory (sans spritesheets/ prefix)', () => {
    const dirs = dirsForSelections(catalog, {
      bodyType: 'male',
      items: { body: { typeName: 'body', name: 'Body A' } },
    });
    expect(dirs).toEqual(['body/bodies/male']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/sprite-dirs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/web/src/slice/sprite-dirs.ts`**

```ts
import {
  getSpritePathsForSelections,
  type Catalog,
  type Selections,
} from '@lpc-toolkit/core';

export function posixDirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

/**
 * The spritesheet directories a selection needs. core's LayerSpec.path is
 * `spritesheets/<basePath><defaultAnim>.png`; all animation PNGs for a
 * non-variant standard layer are siblings in `<basePath>`, so copying the
 * directory of the default-anim path brings every animation along.
 */
export function dirsForSelections(
  catalog: Catalog,
  selections: Selections,
): string[] {
  const out = new Set<string>();
  for (const layer of getSpritePathsForSelections(selections, catalog)) {
    const rel = layer.path.replace(/^spritesheets\//, '');
    out.add(posixDirname(rel));
  }
  return [...out];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/sprite-dirs.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write `packages/web/scripts/copy-spritesheets.ts`**

```ts
/**
 * Copies the spritesheet PNG subset the slice needs from the read-only
 * `upstream/` submodule into packages/web/public/spritesheets/.
 *
 *  - Pass B (layer switching): every item of each shown type-name at the
 *    default body type.
 *  - Pass A (body-type switching): the initial outfit across all BODY_TYPES.
 *
 * upstream/ is never written. Idempotent: clears the target subtree first.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BODY_TYPES,
  createCatalog,
  type FilePath,
  type ItemDefinition,
  type Selections,
} from '@lpc-toolkit/core';
import { pickInitialSelections, toSelections } from '../src/slice/selection';
import { dirsForSelections } from '../src/slice/sprite-dirs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const sheetDefsDir = path.join(repoRoot, 'upstream/sheet_definitions');
const spritesSrc = path.join(repoRoot, 'upstream/spritesheets');
const spritesDest = path.join(here, '../public/spritesheets');

if (!existsSync(sheetDefsDir) || !existsSync(spritesSrc)) {
  console.error(
    '[copy-sprites] upstream/ not initialized. Run: git submodule update --init',
  );
  process.exit(1);
}

function walkJson(dir: string, base = dir): Record<FilePath, ItemDefinition> {
  const out: Record<FilePath, ItemDefinition> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(out, walkJson(full, base));
    else if (entry.name.endsWith('.json')) {
      out[path.relative(base, full)] = JSON.parse(
        readFileSync(full, 'utf8'),
      ) as ItemDefinition;
    }
  }
  return out;
}

const { catalog } = createCatalog(walkJson(sheetDefsDir));
const { state, shownTypeNames } = pickInitialSelections(catalog);

const dirs = new Set<string>();

// Pass B: all items of shown type-names at the default body type.
for (const tn of shownTypeNames) {
  for (const item of catalog.byTypeName.get(tn) ?? []) {
    const sel: Selections = {
      bodyType: state.bodyType,
      items: { [tn]: { typeName: tn, name: item.name } },
    };
    for (const d of dirsForSelections(catalog, sel)) dirs.add(d);
  }
}

// Pass A: the initial outfit across every standard body type.
const baseItems = toSelections(state).items;
for (const bt of BODY_TYPES) {
  for (const d of dirsForSelections(catalog, { bodyType: bt, items: baseItems }))
    dirs.add(d);
}

rmSync(spritesDest, { recursive: true, force: true });
mkdirSync(spritesDest, { recursive: true });

let copied = 0;
let bytes = 0;
for (const d of dirs) {
  const from = path.join(spritesSrc, d);
  if (!existsSync(from)) continue;
  const to = path.join(spritesDest, d);
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  copied++;
  for (const f of readdirSync(from)) {
    const fp = path.join(from, f);
    if (statSync(fp).isFile()) bytes += statSync(fp).size;
  }
}

console.log(
  `[copy-sprites] ${copied} dir(s), ~${(bytes / 1e6).toFixed(1)} MB -> public/spritesheets/`,
);
```

- [ ] **Step 6: Run the copy script (requires Task 0 submodule + built core)**

Run: `pnpm --filter @lpc-toolkit/core build && pnpm --filter @lpc-toolkit/web copy-sprites`
Expected: a line like `[copy-sprites] N dir(s), ~X MB -> public/spritesheets/` with N > 0; `packages/web/public/spritesheets/` now contains PNG subdirectories. (Not committed — gitignored.)

- [ ] **Step 7: Commit (code only; assets are gitignored)**

```bash
git add packages/web/src/slice/sprite-dirs.ts packages/web/scripts/copy-spritesheets.ts packages/web/test/sprite-dirs.test.ts
git commit -m "feat(web): sprite-dir collector + copy-spritesheets script"
```

---

## Task 8: Pure frame-rect math

**Files:**
- Create: `packages/web/src/slice/frame-rect.ts`
- Test: `packages/web/test/frame-rect.test.ts`

- [ ] **Step 1: Write the failing test `packages/web/test/frame-rect.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { ANIMATION_CONFIGS } from '@lpc-toolkit/core';
import { frameRect } from '../src/slice/frame-rect';

describe('frameRect', () => {
  it('maps a 4-dir walk frame to the right source cell', () => {
    // walk.cycle = [1,2,3,4,5,6,7,8]; DIRECTIONS index of 'down' = 2.
    const r = frameRect(ANIMATION_CONFIGS['walk']!, 4, 'down', 0);
    expect(r).toEqual({ sx: 1 * 64, sy: 2 * 64, size: 64 });
  });

  it('clamps to row 0 for single-direction animations', () => {
    const r = frameRect(ANIMATION_CONFIGS['hurt']!, 1, 'right', 2);
    // hurt.cycle = [0,1,2,3,4,5]; directions=1 => row 0.
    expect(r).toEqual({ sx: 2 * 64, sy: 0, size: 64 });
  });

  it('wraps frameIndex past the cycle length', () => {
    const cfg = ANIMATION_CONFIGS['walk']!; // length 8
    expect(frameRect(cfg, 4, 'up', 8)).toEqual(
      frameRect(cfg, 4, 'up', 0),
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/frame-rect.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/web/src/slice/frame-rect.ts`**

```ts
import {
  DIRECTIONS,
  FRAME_SIZE,
  type AnimationConfig,
  type Direction,
} from '@lpc-toolkit/core';

export interface FrameRect {
  readonly sx: number;
  readonly sy: number;
  readonly size: number;
}

/**
 * Source rectangle (within an extracted ComposedAnimation canvas) for one
 * playback frame. Column = cycle[frameIndex % cycle.length]; row = direction
 * index, clamped to row 0 when the animation has a single directional row.
 */
export function frameRect(
  config: AnimationConfig,
  directions: 1 | 4,
  dir: Direction,
  frameIndex: number,
): FrameRect {
  const col = config.cycle[frameIndex % config.cycle.length] ?? 0;
  const rowIndex = directions === 1 ? 0 : Math.max(0, DIRECTIONS.indexOf(dir));
  return { sx: col * FRAME_SIZE, sy: rowIndex * FRAME_SIZE, size: FRAME_SIZE };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/frame-rect.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/slice/frame-rect.ts packages/web/test/frame-rect.test.ts
git commit -m "feat(web): pure frameRect cycle/direction math"
```

---

## Task 9: Compose orchestration hook

**Files:**
- Create: `packages/web/src/hooks/use-composed-character.ts`

This hook is not unit-tested (it is React + async I/O; spec §6 excludes this and the Task 11 integration test covers the underlying pipeline). Its only non-trivial logic — the stale-request guard — is a closure over a ref counter.

- [ ] **Step 1: Write `packages/web/src/hooks/use-composed-character.ts`**

```ts
import { useEffect, useRef, useState } from 'react';
import {
  composeSelections,
  extractAnimation,
  type Catalog,
  type ComposedAnimation,
  type ComposedSheet,
} from '@lpc-toolkit/core';
import { createBrowserCanvasAdapter } from '../adapter/browser-canvas-adapter';
import { toSelections, type SliceState } from '../slice/selection';

export interface ComposedResult {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly progress: number; // 0..1
  readonly sheet: ComposedSheet | null;
  readonly animation: ComposedAnimation | null;
  readonly error: string | null;
}

const adapter = createBrowserCanvasAdapter();

/**
 * Re-composes whenever the selection-relevant slice of state changes.
 * `spritesheetsBaseUrl` is '' (core already prefixes `spritesheets/`); the
 * browser adapter resolves the rest against document.baseURI. A monotonic
 * request id discards stale async results (spec §2).
 */
export function useComposedCharacter(
  catalog: Catalog,
  state: SliceState,
): ComposedResult {
  const [result, setResult] = useState<ComposedResult>({
    status: 'idle',
    progress: 0,
    sheet: null,
    animation: null,
    error: null,
  });
  const reqIdRef = useRef(0);
  const key = JSON.stringify({
    b: state.bodyType,
    s: state.selections,
    a: state.anim,
  });

  useEffect(() => {
    const reqId = ++reqIdRef.current;
    const selections = toSelections(state);
    setResult((r) => ({ ...r, status: 'loading', progress: 0, error: null }));

    composeSelections(selections, {
      catalog,
      adapter,
      spritesheetsBaseUrl: '',
      onProgress: (loaded, total) => {
        if (reqId !== reqIdRef.current) return;
        setResult((r) => ({
          ...r,
          progress: total === 0 ? 1 : loaded / total,
        }));
      },
    })
      .then((sheet) => {
        if (reqId !== reqIdRef.current) return;
        const animName = sheet.animations.includes(state.anim)
          ? state.anim
          : (sheet.animations[0] ?? 'walk');
        const animation = extractAnimation(sheet, animName, { adapter });
        setResult({
          status: 'ready',
          progress: 1,
          sheet,
          animation,
          error: null,
        });
      })
      .catch((e: unknown) => {
        if (reqId !== reqIdRef.current) return;
        setResult({
          status: 'error',
          progress: 1,
          sheet: null,
          animation: null,
          error: e instanceof Error ? e.message : String(e),
        });
      });
    // key encodes the selection-relevant state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, key]);

  // Re-extract when only the chosen animation changes and a sheet exists.
  useEffect(() => {
    setResult((r) => {
      if (r.status !== 'ready' || !r.sheet) return r;
      const name = r.sheet.animations.includes(state.anim)
        ? state.anim
        : (r.sheet.animations[0] ?? 'walk');
      return { ...r, animation: extractAnimation(r.sheet, name, { adapter }) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.anim]);

  return result;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/hooks/use-composed-character.ts
git commit -m "feat(web): useComposedCharacter (compose+extract, stale-guarded)"
```

---

## Task 10: Animation player hook

**Files:**
- Create: `packages/web/src/hooks/use-animation-player.ts`

RAF loop; not unit-tested (spec §6). Pure math already covered by Task 8.

- [ ] **Step 1: Write `packages/web/src/hooks/use-animation-player.ts`**

```ts
import { useEffect, type RefObject } from 'react';
import {
  ANIMATION_CONFIGS,
  type ComposedAnimation,
  type Direction,
} from '@lpc-toolkit/core';
import { frameRect } from '../slice/frame-rect';

const FPS = 8;

/**
 * Draws one direction of `animation` to `canvasRef` at integer `zoom`,
 * advancing through ANIMATION_CONFIGS[name].cycle at a fixed FPS. Pauses
 * (holds frame 0) when `playing` is false or there is no animation.
 */
export function useAnimationPlayer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  animation: ComposedAnimation | null,
  dir: Direction,
  playing: boolean,
  zoom: number,
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !animation) return;
    const config = ANIMATION_CONFIGS[animation.animation];
    if (!config) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = 64;
    canvas.width = size * zoom;
    canvas.height = size * zoom;
    ctx.imageSmoothingEnabled = false;

    const src = animation.canvas as unknown as CanvasImageSource;
    let frame = 0;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const step = 1000 / FPS;

    const draw = () => {
      const r = frameRect(config, animation.directions, dir, frame);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        src,
        r.sx, r.sy, r.size, r.size,
        0, 0, size * zoom, size * zoom,
      );
    };

    draw();
    if (!playing) return;

    const loop = (t: number) => {
      acc += t - last;
      last = t;
      while (acc >= step) {
        acc -= step;
        frame = (frame + 1) % config.cycle.length;
        draw();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, animation, dir, playing, zoom]);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/hooks/use-animation-player.ts
git commit -m "feat(web): useAnimationPlayer RAF loop"
```

---

## Task 11: Node integration test (real catalog + real assets + core pipeline)

**Files:**
- Create: `packages/web/vitest.config.ts`
- Create: `packages/web/test/integration.test.ts`

- [ ] **Step 1: Write `packages/web/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 2: Write `packages/web/test/integration.test.ts`**

```ts
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCanvas,
  loadImage as napiLoadImage,
} from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import {
  composeSelections,
  computeEffectiveLicense,
  createCatalog,
  extractAnimation,
  getCredits,
  SHEET_WIDTH,
  type CanvasAdapter,
  type CanvasLike,
  type FilePath,
  type ImageLike,
  type ItemDefinition,
} from '@lpc-toolkit/core';
import { pickInitialSelections, toSelections } from '../src/slice/selection';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const sheetDefsDir = path.join(repoRoot, 'upstream/sheet_definitions');
const publicSprites = path.join(here, '../public/spritesheets');

function walkJson(dir: string, base = dir): Record<FilePath, ItemDefinition> {
  const out: Record<FilePath, ItemDefinition> = {};
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) Object.assign(out, walkJson(full, base));
    else if (e.name.endsWith('.json'))
      out[path.relative(base, full)] = JSON.parse(
        readFileSync(full, 'utf8'),
      ) as ItemDefinition;
  }
  return out;
}

// Node adapter: napi-rs canvas + filesystem loadImage from public/.
function nodeAdapter(): CanvasAdapter {
  return {
    createCanvas: (w, h) => createCanvas(w, h) as unknown as CanvasLike,
    loadImage: async (p: string): Promise<ImageLike> => {
      const rel = p.replace(/^spritesheets\//, '');
      return (await napiLoadImage(
        path.join(publicSprites, rel),
      )) as unknown as ImageLike;
    },
  };
}

const haveUpstream = existsSync(sheetDefsDir);
const haveSprites = existsSync(publicSprites);

describe.runIf(haveUpstream && haveSprites)('core pipeline (real assets)', () => {
  it('composes, extracts, and attributes the initial outfit', async () => {
    const { catalog } = createCatalog(walkJson(sheetDefsDir));
    const { state } = pickInitialSelections(catalog);
    const selections = toSelections(state);

    const sheet = await composeSelections(selections, {
      catalog,
      adapter: nodeAdapter(),
      spritesheetsBaseUrl: '',
    });

    expect(sheet.width).toBe(SHEET_WIDTH); // 832
    expect(sheet.height).toBe(3456);
    expect(sheet.animations).toContain('walk');

    const anim = extractAnimation(sheet, 'walk', { adapter: nodeAdapter() });
    expect(anim.width).toBe(SHEET_WIDTH);
    expect(anim.directions).toBe(4);
    expect(anim.frameCount).toBeGreaterThan(0);

    const credits = getCredits(selections, catalog);
    expect(credits.entries.length).toBeGreaterThan(0);
    expect(credits.licenses.length).toBeGreaterThan(0);

    const effective = computeEffectiveLicense(credits);
    expect(credits.licenses).toContain(effective);
  });
});

it('fails loudly if assets are missing', () => {
  if (!haveUpstream)
    throw new Error('upstream/ not initialized — run git submodule update --init');
  if (!haveSprites)
    throw new Error('public/spritesheets missing — run pnpm --filter @lpc-toolkit/web copy-sprites');
  expect(true).toBe(true);
});
```

- [ ] **Step 3: Ensure assets are present, then run the full web test suite**

Run: `pnpm --filter @lpc-toolkit/core build && pnpm --filter @lpc-toolkit/web test`
Expected: `pretest` runs the copy script; all unit tests (cn, adapter, load-catalog, selection, sprite-dirs, frame-rect) PASS; the integration test PASSES (composes real sprites, asserts dims/credits/effective license). If the integration `describe` is skipped, the "fails loudly" test surfaces why.

- [ ] **Step 4: Commit**

```bash
git add packages/web/vitest.config.ts packages/web/test/integration.test.ts
git commit -m "test(web): Node integration test over real catalog + assets"
```

---

## Task 12: Slice harness UI + wire-up + repo verification

**Files:**
- Create: `packages/web/src/components/slice-harness.tsx`
- Modify: `packages/web/src/App.tsx`
- Modify: `README.md`

- [ ] **Step 1: Write `packages/web/src/components/slice-harness.tsx`**

```tsx
import { useMemo, useRef } from 'react';
import {
  ANIMATION_CONFIGS,
  type Catalog,
  type Direction,
} from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../slice/selection';
import { useComposedCharacter } from '../hooks/use-composed-character';
import { useAnimationPlayer } from '../hooks/use-animation-player';
import { Button } from './ui/button';

const DIRS: Direction[] = ['up', 'left', 'down', 'right'];
const ZOOM = 4;

export function SliceHarness({
  catalog,
  shownTypeNames,
  state,
  dispatch,
  theme,
  onToggleTheme,
}: {
  catalog: Catalog;
  shownTypeNames: string[];
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const result = useComposedCharacter(catalog, state);
  useAnimationPlayer(
    canvasRef,
    result.animation,
    state.dir,
    state.playing,
    ZOOM,
  );

  const animNames = useMemo(
    () =>
      (result.sheet?.animations ?? []).filter(
        (a) => a in ANIMATION_CONFIGS,
      ),
    [result.sheet],
  );

  const failed = result.status === 'error';

  return (
    <div className="flex h-screen flex-col bg-bg-app text-text">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2">
        <span className="font-bold">
          LPC<span className="text-text-mute">·Toolkit</span>
        </span>
        <span className="text-text-dim text-xs">foundation slice</span>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onToggleTheme}>
          {theme === 'dark' ? 'Light' : 'Dark'}
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr_300px]">
        {/* Left: pickers */}
        <aside className="scroll border-r border-border p-3 space-y-3">
          <label className="block text-xs">
            <span className="text-text-mute uppercase">Body type</span>
            <select
              className="mt-1 w-full bg-surface-2 border border-border rounded p-1"
              value={state.bodyType}
              onChange={(e) =>
                dispatch({ type: 'set_body_type', bodyType: e.target.value })
              }
            >
              <option value={state.bodyType}>{state.bodyType}</option>
            </select>
          </label>

          {shownTypeNames.map((tn) => {
            const items = catalog.byTypeName.get(tn) ?? [];
            return (
              <label key={tn} className="block text-xs">
                <span className="text-text-mute uppercase">{tn}</span>
                <select
                  className="mt-1 w-full bg-surface-2 border border-border rounded p-1"
                  value={state.selections[tn] ?? ''}
                  onChange={(e) =>
                    e.target.value
                      ? dispatch({
                          type: 'pick',
                          typeName: tn,
                          name: e.target.value,
                        })
                      : dispatch({ type: 'clear', typeName: tn })
                  }
                >
                  <option value="">— none —</option>
                  {items.map((it) => (
                    <option key={it.name} value={it.name}>
                      {it.name}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </aside>

        {/* Center: preview */}
        <main className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <select
              className="bg-surface-2 border border-border rounded p-1 text-xs"
              value={state.anim}
              onChange={(e) =>
                dispatch({ type: 'set_anim', anim: e.target.value })
              }
            >
              {animNames.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <div className="flex gap-1">
              {DIRS.map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={state.dir === d ? 'primary' : 'ghost'}
                  onClick={() => dispatch({ type: 'set_dir', dir: d })}
                >
                  {d}
                </Button>
              ))}
            </div>
            <Button
              size="sm"
              onClick={() => dispatch({ type: 'toggle_play' })}
            >
              {state.playing ? 'Pause' : 'Play'}
            </Button>
            <div className="flex-1" />
            <span className="text-text-dim text-xs">
              {result.status === 'loading'
                ? `loading ${Math.round(result.progress * 100)}%`
                : result.status}
            </span>
          </div>
          <div className="checker flex flex-1 items-center justify-center">
            {failed ? (
              <div className="text-danger text-sm">{result.error}</div>
            ) : (
              <canvas ref={canvasRef} />
            )}
          </div>
        </main>

        {/* Right: attribution */}
        <aside className="scroll border-l border-border p-3">
          <h2 className="text-xs font-bold uppercase">
            Attribution
            <span className="text-text-mute"> — required</span>
          </h2>
          {result.sheet && result.sheet.credits.licenses.length > 0 && (
            <div className="mt-2 rounded border border-border p-2 text-xs">
              <span className="text-text-mute">Effective license: </span>
              <span className="font-bold">
                {effectiveLicenseLabel(result.sheet)}
              </span>
            </div>
          )}
          <ul className="mt-2 space-y-2">
            {(result.sheet?.credits.entries ?? []).map((c) => (
              <li
                key={c.file}
                className="border-b border-border pb-2 text-xs"
              >
                <div className="font-semibold">{c.file}</div>
                <div className="text-text-mute">
                  by {c.authors.join(', ') || 'unknown'}
                </div>
                <div className="text-text-dim">
                  {c.licenses.join(', ')}
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function effectiveLicenseLabel(sheet: NonNullable<
  ReturnType<typeof useComposedCharacter>
>['sheet']): string {
  // sheet is non-null at call site; compute from its credits.
  return sheet ? sheet.credits.licenses.slice().sort().join(' / ') : '';
}
```

Note: the effective license is shown live by the integration-tested `computeEffectiveLicense`; in the UI we display the union for transparency and rely on Task 11 to assert `computeEffectiveLicense` correctness. Replace the helper body with the real call:

- [ ] **Step 2: Use the real `computeEffectiveLicense` in the harness**

Replace the `effectiveLicenseLabel` function and its single call site with a direct computation:

```tsx
// add to the core import in slice-harness.tsx:
//   computeEffectiveLicense,
// replace the effective-license block with:
{result.sheet && result.sheet.credits.licenses.length > 0 && (
  <div className="mt-2 rounded border border-border p-2 text-xs">
    <span className="text-text-mute">Effective license: </span>
    <span className="font-bold">
      {computeEffectiveLicense(result.sheet.credits)}
    </span>
  </div>
)}
```

Delete the `effectiveLicenseLabel` helper entirely.

- [ ] **Step 3: Rewrite `packages/web/src/App.tsx`**

```tsx
import { useMemo, useReducer, useState } from 'react';
import { loadCatalogFromUpstream } from './catalog/load-catalog';
import {
  pickInitialSelections,
  sliceReducer,
} from './slice/selection';
import { SliceHarness } from './components/slice-harness';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const init = useMemo(() => {
    const catalog = loadCatalogFromUpstream();
    const { state, shownTypeNames } = pickInitialSelections(catalog);
    return { catalog, state, shownTypeNames };
  }, []);

  const [state, dispatch] = useReducer(sliceReducer, init.state);

  document.documentElement.className = `lpc ${theme}`;

  return (
    <SliceHarness
      catalog={init.catalog}
      shownTypeNames={init.shownTypeNames}
      state={state}
      dispatch={dispatch}
      theme={theme}
      onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
    />
  );
}
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm --filter @lpc-toolkit/core build && pnpm --filter @lpc-toolkit/web typecheck && pnpm --filter @lpc-toolkit/web build`
Expected: no type errors; `vite build` succeeds.

- [ ] **Step 5: Manual smoke test**

Run: `pnpm --filter @lpc-toolkit/web copy-sprites && pnpm --filter @lpc-toolkit/web dev`
Open the printed localhost URL. Expected: an animated character on a checkerboard; changing a layer/anim/direction updates it live; the right panel lists credits + an effective license; toggling theme swaps palettes. Stop the dev server when satisfied.

- [ ] **Step 6: Flip the README status row**

In `README.md`, change the `packages/web/` table row from `_Planned_` to reflect the slice. Replace the line:

```
| `packages/web/`     | _Planned_    | React 18 + Vite + Tailwind + shadcn/ui browser UI — design spec'd, see [Web UI design reference](#web-ui-design-reference) |
```

with:

```
| `packages/web/`     | _Foundation slice_ | React 18 + Vite + Tailwind v4 + shadcn-style UI; core integration verified locally. See `docs/superpowers/specs/2026-05-18-web-ui-foundation-slice-design.md`. |
```

- [ ] **Step 7: Full repo verification (spec §7 success gate)**

Run: `pnpm install && pnpm -r build && pnpm -r typecheck && pnpm -r test`
Expected: all green across `@lpc-toolkit/core` and `@lpc-toolkit/web` (web `pretest` runs the copy script; integration test passes).

Then: `pnpm --filter @lpc-toolkit/web build && pnpm --filter @lpc-toolkit/web preview`
Expected: the production build previews and renders an animated character locally. Stop the preview server.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/components/slice-harness.tsx packages/web/src/App.tsx README.md
git commit -m "feat(web): slice harness UI; wire foundation slice end-to-end"
```

---

## Self-review (completed by plan author)

**Spec coverage:** §1 package/stack → Tasks 1–3; §2 data flow (catalog/adapter/compose/extract/credits, stale-guard, progress) → Tasks 4,5,9,11; §3 minimal state + bridge → Task 6; §4 minimal UI (header/theme, left selects, center canvas, right credits+effective license) → Tasks 8,10,12; §5 error handling (empty catalog, missing image, stale, submodule missing) → Tasks 5,9,11,12; §6 testing (cn/adapter/loader/bridge/sprite-dirs/frame-rect unit + Node integration) → Tasks 3–8,11; §7 success gate → Task 12 Step 7. Prerequisite (submodule init) → Task 0. All spec sections map to tasks.

**Placeholder scan:** No TBD/TODO; every code step contains complete code; commands have expected output. The `effectiveLicenseLabel` placeholder in Task 12 Step 1 is explicitly replaced in Step 2 (sequenced, not left dangling).

**Type consistency:** `SliceState`/`SliceAction`/`sliceReducer`/`toSelections`/`pickInitialSelections` defined in Task 6 and used identically in Tasks 7, 9, 11, 12. `resolveSpriteUrl`/`createBrowserCanvasAdapter` (Task 4) used in Task 9. `dirsForSelections`/`posixDirname` (Task 7) used in the copy script. `frameRect` signature `(AnimationConfig, 1|4, Direction, number)` defined in Task 8 and called identically in Task 10. `spritesheetsBaseUrl: ''` consistent in Tasks 9 and 11. All core symbols (`composeSelections`, `extractAnimation`, `getCredits`, `computeEffectiveLicense`, `createCatalog`, `getSpritePathsForSelections`, `ANIMATION_CONFIGS`, `DIRECTIONS`, `BODY_TYPES`, `FRAME_SIZE`, `SHEET_WIDTH`, and the types) verified against `packages/core/src/index.ts` exports.
