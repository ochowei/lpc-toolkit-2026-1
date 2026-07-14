# lpc-toolkit

A TypeScript monorepo with an environment-agnostic LPC sprite composition
engine, shared presets, a React web editor, and a Node CLI.

## Start Here

Use this file for non-negotiable repository rules and navigation. Read the
focused guide that owns the work before making broad changes:

- [Architecture guide](docs/ARCHITECTURE.md) — package boundaries, ownership,
  assets, attribution, and stable design decisions.
- [Engineering guide](docs/ENGINEERING.md) — commands, tests, CI mapping, and
  change-specific verification.
- [Onboarding guide](docs/ONBOARDING.md) — first setup and package tour.
- [Contributing guide](CONTRIBUTING.md) — branch, change, and pull request
  workflow.

## Common Commands

```sh
rtk pnpm install --frozen-lockfile
rtk pnpm verify
rtk pnpm build
rtk pnpm --filter @lpc-toolkit/web dev
```

Use the narrowest relevant checks while iterating, then run `rtk pnpm verify`
before handoff. See `docs/ENGINEERING.md` for conditional checks.

## Hard Rules

1. **`upstream/` is an optional, read-only dormant provenance gitlink.** Never
   modify or commit inside it, and never install packages inside it.
   Normal workflows must not require it to be initialized. Active assets use the
   checked-in or pinned cache-backed `assets/` flow; parity uses a separate
   isolated checkout.
2. **License is GPL-3.0-or-later.** Dependencies must be compatible. Ask before
   adding one, and state its license when proposing it.
3. **Attribution is mandatory product logic.** Every web or CLI render, preview,
   download, or export must preserve matching credit metadata from the active
   asset source's `CREDITS.csv`. Normal workflows must not require the submodule
   to obtain credits.
4. **`packages/core/` is environment-agnostic.** Core must not import React,
   DOM/browser runtime APIs, Node filesystem/runtime APIs, Vite-only modules,
   concrete canvas or ZIP implementations, presets, web, or CLI implementation.
   Callers inject image loading and canvas creation.
5. **TypeScript is strict.** Do not add `any` unless its need is documented and
   explicitly approved.
6. **Use pnpm for repository development.** Do not switch workspace workflows
   to npm, yarn, or bun. npm/npx remain valid only for documented public CLI
   consumption or authorized npm publication.
7. **Prefix terminal commands with RTK.** Follow [RTK.md](RTK.md).

## Repository Layout

- `assets/` — active LPC spritesheets, definitions, palettes, and `CREDITS.csv`
- `upstream/` — optional read-only dormant provenance/reference gitlink
- `packages/core/` — pure catalog, composition, animation, recolor, validation,
  token, and credit logic
- `packages/presets/` — shared pure outfit presets and preset application
- `packages/web/` — React/Vite browser UI and browser adapters
- `packages/cli/` — Node CLI, persistence, filesystem/canvas adapters, caching,
  packaging, and publication behavior

## Architecture Summary

The dependency direction is core-first:

```text
web ───────┐
           ├──> presets ──> core
CLI ───────┘          └────> core
```

- React components render and dispatch; they do not own composition,
  attribution, catalog normalization, or selection-transition rules.
- Pure helpers in `packages/web/src/slice/` own selection decisions,
  catalog-derived behavior, filters, ordering, and compatibility checks.
- Hooks in `packages/web/src/hooks/` own React effects and async orchestration.
- Browser canvas, ZIP, download, storage, and URL behavior belongs in
  `packages/web/src/adapter/` or `packages/web/src/lib/`.
- Attribution must remain reachable through composition, preview, render,
  download, and export paths.

Run `rtk pnpm check:boundaries` after architecture-sensitive changes, especially
under `packages/core/`, `packages/web/src/`, or `packages/web/scripts/`. Fix a
reported violation; do not weaken or route around the checker without explicit
approval. Pair it with the narrowest relevant typecheck and tests.

## Change Guidance

Read `docs/ARCHITECTURE.md` before broad changes to core or to web components,
hooks, slices, adapters, libraries, catalogs, and scripts. Prefer small local
extractions over architectural reshuffles, and extract only for a reusable
responsibility, independently testable unit, or stable visual region.

For `packages/web/src/components/layer-stack/harness.tsx`:

- keep it as the top-level editor orchestrator;
- extract reusable or independently testable UI/effect state into hooks;
- extract JSX regions only when they have a clear visual responsibility;
- keep domain decisions in core, `slice/`, hooks, or focused helpers;
- keep browser runtime behavior in `adapter/` or `lib/`.

For `packages/web/src/components/layer-stack/layer-row.tsx`:

- keep it focused on one selected layer row;
- extract named subcomponents for row header, actions, style controls,
  replacement picker, or compatibility notes when useful;
- keep compatibility, ordering, pick/clear decisions, and color option
  resolution in pure helpers where possible.

Do not change public selection behavior, composition output, attribution, or
export semantics merely to make a file smaller.

## Ask Before Proceeding

Ask before:

- adding a dependency;
- modifying or initializing `upstream/` outside the isolated parity workflow;
- adding a backend, database, authentication, or authorization;
- changing the license, build tool, package manager, or framework;
- skipping or weakening credit/attribution generation;
- adding an `any` type;
- weakening an architecture or verification gate.

## Style

- Use functional React components and hooks; do not add Redux unless requested.
- Prefer `useState`/`useReducer`; use Zustand only when local state is no longer
  sufficient.
- Use Tailwind utility classes and the existing shadcn/ui patterns.
- Use kebab-case file names and PascalCase component exports.
- Match surrounding style and avoid unrelated cleanup.

## Plan Record Requirement

When work follows a checked-in plan, after each completed step:

- check the plan item;
- add a short implementation or verification note;
- after the related commit, record its full hash;
- record the exact verification command and PASS/FAIL result.

Example:

```markdown
- [x] Implement asset validator
  - Commit: abc1234
  - Verification: `rtk pnpm run typecheck` PASS
```

## Working Principles

- **Think first:** state assumptions, surface meaningful alternatives and
  tradeoffs, and stop for clarification when uncertainty would change scope.
- **Keep it simple:** implement the minimum requested solution; do not add
  speculative abstractions, configurability, or impossible-case handling.
- **Change surgically:** touch only lines traceable to the request, preserve
  unrelated user work, and remove only orphans created by the change.
- **Work toward evidence:** define observable success, start with a focused
  failing test for behavior changes, and loop until the relevant checks pass.
