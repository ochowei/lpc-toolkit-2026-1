# lpc-toolkit Onboarding Guide

This guide gets a new contributor from a standard clone to a verified workspace,
a running editor, and the local CLI. For stable dependency rules, read the
[Architecture guide](ARCHITECTURE.md); for the complete command matrix, use the
[Engineering guide](ENGINEERING.md).

## Prerequisites

- Node.js 22 or newer
- pnpm 9, matching the root `packageManager` field
- Git
- RTK for terminal commands run by repository Agents

The repository uses strict TypeScript and pnpm workspaces. Do not substitute
npm, yarn, or bun for repository install, test, typecheck, or build commands.

## First-Time Setup

Use a standard clone. The optional `upstream/` provenance gitlink is read-only
and is not part of normal setup. Do not initialize `upstream/` for normal setup.

```sh
git clone <repo-url>
cd lpc-toolkit-2026-1
rtk pnpm install --frozen-lockfile
rtk pnpm verify
```

`rtk pnpm install --frozen-lockfile` installs exactly the locked workspace.
`rtk pnpm verify` prepares and verifies the active asset snapshot, checks
architecture boundaries, typechecks every package, and runs all workspace unit
tests.

Normal setup, verification, build, packaging, and ordinary browser tests use the
checked-in or pinned cache-backed asset flow. They do not need the submodule.

## Start the Web Editor

```sh
rtk pnpm --filter @lpc-toolkit/web dev
```

Open the URL printed by Vite. `/` is the landing page and `/compose` is the
editor. The editor loads the prepared local assets and keeps attribution
available while composing, previewing, and exporting a sprite.

## Try the Local CLI

Build the workspace CLI and invoke its local entry point:

```sh
rtk pnpm --filter @lpc-toolkit/cli build
rtk node packages/cli/dist/index.js --help
```

These are repository-development commands. The npm/npx installation examples
in [`packages/cli/README.md`](../packages/cli/README.md) are for consumers of
the published package and do not change the workspace package manager.

## Package Tour

- `packages/core/` contains environment-agnostic catalog, composition,
  animation, recolor, token, validation, and credit logic. It receives canvas
  creation and image loading through injected ports.
- `packages/presets/` contains pure shared outfit definitions and
  catalog-backed preset application used by web and CLI.
- `packages/web/` contains the React/Vite editor, browser adapters, asset
  preparation scripts, Vitest coverage, and Playwright scenarios.
- `packages/cli/` contains Node commands, character persistence, filesystem and
  canvas adapters, managed asset caching, render publication, and packaging.
- `assets/` is the active LPC asset source, including spritesheets, definitions,
  palettes, and the mandatory `CREDITS.csv`.
- Package tests live beside their packages; repository-level boundary tooling
  lives under `scripts/`, and CI workflows live under `.github/workflows/`.

Start at a package's public surface or README, then follow the responsibility
you need. Avoid reading every file before making a focused change.

## Where Does This Change Belong?

| Responsibility | Primary location |
| --- | --- |
| Reusable composition, animation, selection serialization, validation, and credits | `packages/core/` |
| Shared preset definitions and pure preset application | `packages/presets/` |
| Pure browser selection decisions, compatibility, filters, and ordering | `packages/web/src/slice/` |
| React effects, async composition, animation, and orchestration | `packages/web/src/hooks/` |
| Presentation, controls, and user-intent dispatch | `packages/web/src/components/` |
| Browser canvas/assets and ZIP/download/URL/storage bridges | `packages/web/src/adapter/` or `packages/web/src/lib/` |
| Node commands, persistence, filesystem/canvas integration, and output publication | `packages/cli/` |
| Asset preparation, validation, generation, and audits | `packages/web/scripts/` |

If a change crosses several rows, read `docs/ARCHITECTURE.md` and confirm the
dependency direction before editing. Components should not absorb domain
decisions, and core should not gain runtime-specific implementations.

## Verification by Change Type

The [Engineering guide](ENGINEERING.md) owns the canonical commands and CI
mapping. Use package-scoped checks while iterating, for example:

```sh
rtk pnpm --filter @lpc-toolkit/core test
rtk pnpm --filter @lpc-toolkit/presets test
rtk pnpm --filter @lpc-toolkit/web test
rtk pnpm --filter @lpc-toolkit/cli test
```

Architecture-sensitive changes also run:

```sh
rtk pnpm check:boundaries
```

Before handoff, run `rtk pnpm verify`. Browser E2E, CLI package validation,
asset audits, and isolated upstream parity are conditional checks; use the
engineering guide to decide when they apply.

## First Contributions

Good first contributions are focused documentation corrections, regression
tests around pure helpers, isolated UI polish, or small fixes with an observable
failure and a narrow verification path.

Before changing behavior, keep these constraints visible:

- attribution is product logic; generated pixels and their matching credits
  travel together;
- core adapter contracts protect browser/Node portability;
- `upstream/` is not a development or generated-output directory;
- large files such as `harness.tsx`, `layer-row.tsx`, `selection.ts`, and
  `compose.ts` are not invitations for broad cleanup.

Discuss new dependencies, architecture reshuffles, backend/auth work, framework
or license changes, and attribution changes before implementation. See
[`CONTRIBUTING.md`](../CONTRIBUTING.md) for the full contribution workflow.

## Common Pitfalls

- Initializing or installing packages inside `upstream/` for ordinary work.
- Moving DOM, Node filesystem, concrete canvas, ZIP, or Vite behavior into core.
- Rendering or exporting pixels without metadata and TXT/CSV credit artifacts.
- Putting compatibility or selection policy directly in a React component.
- Running only a broad command after editing instead of using a focused failing
  test while iterating.
- Treating npm/npx consumer examples as repository package-manager commands.

## Next References

- [README](../README.md) — public project overview and quick starts
- [Architecture guide](ARCHITECTURE.md) — stable ownership and dependency rules
- [Engineering guide](ENGINEERING.md) — commands, tests, CI, and parity
- [Core package guide](../packages/core/README.md) — executable library example
- [CLI package guide](../packages/cli/README.md) — complete command reference
- [Contributing guide](../CONTRIBUTING.md) — branch and pull request workflow
- [Agent rules](../AGENTS.md) — non-negotiable repository policy
