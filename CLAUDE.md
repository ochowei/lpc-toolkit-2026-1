# lpc-toolkit

A monorepo providing a shared core library for composing LPC character
sprites, plus a modern React web UI and a CLI built on top of it.

## Stack

- **Language**: TypeScript (strict mode)
- **Package manager**: pnpm (workspaces)
- **Web**: React 18 + Vite + Tailwind CSS + shadcn/ui
- **State**: useState/useReducer first; Zustand only when needed
- **Deployment**: Cloudflare Pages (static SPA)

## Hard rules (do not violate)

1. **`upstream/` is a git submodule, read-only.** Never modify, never
   commit changes inside it, never run `npm install` or `pnpm install`
   inside it. It exists only as reference material and as the source
   of `spritesheets/` and `sheet_definitions/`.

2. **License is GPL-3.0.** Upstream is GPL-3.0 and we inherit it.
   Do not add dependencies with incompatible licenses. When suggesting
   a dependency, mention its license.

3. **Attribution is mandatory.** Every sprite rendered by this toolkit
   must be accompanied by credit metadata derived from
   `upstream/CREDITS.csv`. This applies to both web and cli outputs.

4. **`packages/core/` must be environment-agnostic.** No direct use of
   `window`, `document`, `fs`, or `node-canvas`. Image loading and
   canvas creation are passed in as dependencies by the caller.

5. **TypeScript strict.** No `any` unless documented why.

6. **Use pnpm.** Do not switch to npm/yarn/bun mid-project.

## Layout

- `upstream/` — git submodule, read-only LPC source
- `packages/core/` — pure TypeScript composition logic
- `packages/web/` — React + Vite browser UI
- `packages/cli/` — Node CLI (built later)

## When in doubt, stop and ask

Before doing any of these, ask first:
- Adding a new dependency
- Modifying `upstream/`
- Adding a backend / database / auth
- Changing the license, build tool, or framework
- Skipping credit/attribution generation
- Adding `any` types

## Style

- Functional React components only
- Hooks for state, no Redux unless explicitly requested
- Tailwind utility classes
- File names: kebab-case for files, PascalCase for component exports
