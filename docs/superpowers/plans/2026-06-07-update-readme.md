# Update README.md Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `README.md` to show that the web UI is fully working, setup and layout guides show `packages/web/` is implemented, assets are migrated from the submodule into the local `assets/` folder, and reference design notes are updated.

**Architecture:** We will edit different sections of `README.md` to reflect the current status of `packages/web/` and the asset migration.

**Tech Stack:** Markdown, Git.

---

### Task 1: Update README.md Content

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace description of web UI state in the monorepo overview**

Update the header description in `README.md` (lines 3-5):
```diff
 A monorepo providing an **environment-agnostic core library for composing
-[LPC](https://lpc.opengameart.org/) character spritesheets**, plus a planned
-React web UI and CLI built on top of it.
+[LPC](https://lpc.opengameart.org/) character spritesheets**, plus a modern
+React web UI and a planned CLI built on top of it.
```

- [ ] **Step 2: Update status table and description text**

Update status table and descriptive text (lines 17-24):
```diff
 | Package             | State        | What it is                                          |
 | ------------------- | ------------ | --------------------------------------------------- |
 | `packages/core/`    | **Working**  | Pure TypeScript composition logic (catalog, compose, recolor, hash, credits) |
-| `packages/web/`     | _Foundation slice_ | React 18 + Vite + Tailwind v4 + shadcn-style UI; core integration verified locally. See `docs/superpowers/specs/2026-05-18-web-ui-foundation-slice-design.md`. |
+| `packages/web/`     | **Working**  | React 18 + Vite + Tailwind CSS v4 + shadcn-style UI with a full three-region grid desktop editor and mobile responsive layout |
 | `packages/cli/`     | _Planned_    | Node CLI                                             |
 
-The core composition pipeline is implemented and tested with Vitest. The web
-and CLI packages have not been started yet.
+The core composition pipeline and the web UI are fully working. The CLI package has not been started yet.
```

- [ ] **Step 3: Update tech stack list**

Update stack details (lines 31-32):
```diff
- - **Web (planned)**: React 18 + Vite + Tailwind CSS + shadcn/ui
- - **Deployment (planned)**: Cloudflare Pages (static SPA)
+ - **Web**: React 18 + Vite + Tailwind CSS v4 + shadcn-style UI
+ - **Deployment**: Cloudflare Pages (static SPA)
```

- [ ] **Step 4: Update Layout list to include local assets/ and show web UI as implemented**

Update Layout (lines 34-43):
```diff
 ## Layout
 
 ```
-upstream/          git submodule, read-only — LPC source, spritesheets,
-                   sheet_definitions, CREDITS.csv (reference material only)
+assets/            LPC art assets and metadata migrated from upstream submodule
+upstream/          git submodule, read-only — LPC source (reference material only)
 packages/core/     pure TypeScript composition logic (no DOM, no fs)
-packages/web/      planned React + Vite browser UI
+packages/web/      React + Vite browser UI
 packages/cli/      planned Node CLI
 ```
```

- [ ] **Step 5: Update Getting Started / Setup Guide**

Update setup instructions to clarify the submodule status, local assets folder, and how to run the web UI development server (lines 61-78):
```diff
 ## Getting started
 
-The LPC source lives in a submodule, so clone recursively:
+The LPC source references a submodule, so clone recursively:
 
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
+
+To start the web UI development server:
+
+```bash
+pnpm --filter @lpc-toolkit/web dev
+```
+
+Note that all art assets (spritesheets, sheet definitions, palette definitions, and CREDITS.csv) have been migrated from the `upstream/` submodule into the local `assets/` folder. The `upstream/` submodule is kept for reference only.
```

- [ ] **Step 6: Update Web UI design reference section**

Update the design reference text (lines 150-158):
```diff
 ## Web UI design reference
 
-`packages/web/` has not been built yet, but its UI is fully designed. The
-design lives in [`reference/LPC-Tool-Web_UI/`](reference/LPC-Tool-Web_UI) as a
-self-contained, build-free React prototype (Babel-standalone in the browser,
-mock fixtures, inline styles). It is **reference material only** — the real
-`packages/web/` will be React 18 + Vite + Tailwind + shadcn/ui consuming
-`@lpc-toolkit/core`, not a port of this prototype's code.
+The web UI in `packages/web/` is fully built. Its original design and prototype lives in [`reference/LPC-Tool-Web_UI/`](reference/LPC-Tool-Web_UI) as a self-contained, build-free React prototype (Babel-standalone in the browser, mock fixtures, inline styles). It serves as the **design source and reference material** — the production `packages/web/` is built with React 18 + Vite + Tailwind CSS v4 + shadcn-style UI consuming `@lpc-toolkit/core`.
```

---

### Task 2: Verification and Commit

- [ ] **Step 1: Check build and typecheck status of the workspace**

Run `pnpm typecheck` and `pnpm build` to verify there are no compilation/build errors.

- [ ] **Step 2: Commit README.md**

Commit `README.md` and the new plan.
