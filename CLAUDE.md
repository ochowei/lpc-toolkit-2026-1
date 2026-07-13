# lpc-toolkit

A monorepo providing a shared core library for composing LPC character
sprites, plus a modern React web UI and a CLI built on top of it.

## Stack

- **Language**: TypeScript (strict mode)
- **Package manager**: pnpm (workspaces)
- **Web**: React 18 + Vite + Tailwind CSS v4 + shadcn/ui
- **State**: useState/useReducer first; Zustand only when needed
- **Deployment**: Vercel (static SPA)

## Hard rules (do not violate)

1. **`upstream/` is an optional, read-only git submodule retained as a provenance gitlink.** Never modify or commit inside it, and never install packages inside it. Normal workflows must not require it to be initialized. Active assets use the pinned local/cache-backed `assets/` flow; parity uses a separate isolated checkout.

2. **License is GPL-3.0.** Upstream is GPL-3.0 and we inherit it.
   Do not add dependencies with incompatible licenses. When suggesting
   a dependency, mention its license.

3. **Attribution is mandatory.** Every sprite rendered by this toolkit
   must be accompanied by credit metadata derived from
   `assets/CREDITS.csv` (or the `upstream/CREDITS.csv`). This applies to
   both web and cli outputs.

4. **`packages/core/` must be environment-agnostic.** No direct use of
   `window`, `document`, `fs`, or `node-canvas`. Image loading and
   canvas creation are passed in as dependencies by the caller.

5. **TypeScript strict.** No `any` unless documented why.

6. **Use pnpm.** Do not switch to npm/yarn/bun mid-project.

7. **Use RTK prefix for commands.** Run terminal commands using the `rtk` prefix to optimize token usage as described in [RTK.md][rtk-ref].

## Layout

- `assets/` — LPC art assets (spritesheets, definitions, CREDITS.csv) migrated from upstream
- `upstream/` — optional read-only provenance/reference LPC source checkout
- `packages/core/` — pure TypeScript composition logic
- `packages/web/` — React + Vite browser UI
- `packages/cli/` — Node CLI (built later)

## Architecture boundaries

Read `docs/ARCHITECTURE.md` before broad changes to:

- `packages/core/`
- `packages/web/src/components/layer-stack/`
- `packages/web/src/hooks/`
- `packages/web/src/slice/`
- `packages/web/src/adapter/`
- `packages/web/src/lib/`
- `packages/web/scripts/`

Follow these dependency rules:

- `packages/core/` must remain environment-agnostic.
  It must not import React, DOM APIs, browser globals, Node filesystem APIs,
  node-canvas, JSZip, Vite-only modules, or web package modules.
- Browser image loading, canvas creation, ZIP loading, downloads, URL sync,
  and other runtime browser behavior belong in `packages/web/src/adapter/`
  or `packages/web/src/lib/`.
- React components should not own core composition, attribution, catalog
  normalization, or selection-transition rules.
- Prefer pure helpers in `packages/web/src/slice/` for selection decisions,
  catalog-derived behavior, filters, ordering, and compatibility checks.
- Prefer hooks in `packages/web/src/hooks/` for React effects and async
  orchestration.
- Attribution is product logic, not decoration. Do not bypass credit metadata
  when rendering, previewing, downloading, or exporting sprites.

## Boundary verification

Run `rtk pnpm check:boundaries` after changes that touch architecture-sensitive
areas, especially `packages/core/`, `packages/web/src/`, or
`packages/web/scripts/`.

Boundary checks do not replace typecheck or tests. Pair them with the narrowest
relevant verification for the change, such as `rtk pnpm typecheck`,
`rtk pnpm test`, or a package-scoped command.

If a boundary check fails, fix the architecture violation. Do not disable the
check, weaken `scripts/check-boundaries.mjs`, or route around the boundary
without explicit approval.

## Large React file local extraction guidance

Do not perform broad refactors just because a React file is large. Extract only
when there is a clear reusable responsibility, an independently testable unit,
or a JSX region with a stable visual purpose.

For `packages/web/src/components/layer-stack/harness.tsx`:

- keep it as the top-level editor orchestrator
- extract hooks for reusable or independently testable UI/effect state
- extract components for JSX regions with clear visual responsibility
- keep domain decisions in core, `slice/`, hooks, or focused helpers
- keep browser adapter logic in `adapter/` or `lib/`

For `packages/web/src/components/layer-stack/layer-row.tsx`:

- keep it focused on one selected layer row
- extract subcomponents for row header, actions, style controls, replacement
  picker, and compatibility notes when those regions need their own names
- keep item compatibility, ordering, pick/clear decisions, and color option
  resolution in pure helpers where possible

Prefer small, local extractions over architectural reshuffles. A good extraction
should make the next change easier without changing public selection behavior,
composition output, attribution, or export semantics.

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

## Superpowers Workflow Extension

After completing any plan step:

- Update the plan file checkbox.
- Add a short implementation note.
- Record the commit hash.
- Record verification status.

Example:

- [x] Implement asset validator
  - Commit: abc1234
  - Verification: pnpm typecheck PASS


---

#  andrej-karpathy-skills Behavioral guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.


[rtk-ref]: RTK.md
