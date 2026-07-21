# Task 5 Report — 2026-07-21

Status: complete

Product commit:

- `fd4b669907ec3a6248aa4e986202c4fb975de97d` — `feat(cli): initialize artist asset workspaces`

Scope followed:

- Worked only in `packages/cli/src/asset-workspace.ts`
- Worked only in `packages/cli/test/asset-workspace.test.ts`
- Did not modify the checked-in Phase 1 plan, `.superpowers/sdd/progress.md`, `upstream/`, `assets/`, or managed cache
- Did not wire commands, scaffold/sync behavior, runtime/cache preparation, or later-task registry/publication flows

Files changed:

- `packages/cli/src/asset-workspace.ts`
- `packages/cli/test/asset-workspace.test.ts`

What changed:

- Added standalone artist workspace initialization with the Task 5 default config:
  - `artist-packs/`
  - `assets_custom/`
  - `.lpc-toolkit/asset-packs/`
- Wrote normalized `lpc-asset-workspace.json` with only the v1 required fields
- Wrote `.lpc-toolkit-managed.json` ownership markers with generated workspace IDs
- Added upward workspace discovery plus explicit `--workspace`-style resolution without fallback
- Refused unknown output-marker schemas and non-empty unowned `assets_custom/`
- Allowed safe adoption of an existing empty `assets_custom/`
- Added symlink-escape protection so initialization refuses workspace-tree paths that would write outside the requested target
- Kept initialization local-only; no runtime asset preparation or cache work is performed

RED evidence:

1. Wrote `packages/cli/test/asset-workspace.test.ts` before creating production code.
   - Covered explicit initialization
   - Covered upward discovery
   - Covered explicit workspace-path resolution
   - Covered idempotent re-open of an unchanged workspace
   - Covered refusal of unknown marker schema
   - Covered refusal of non-empty unowned `assets_custom/`
   - Covered adoption of an empty `assets_custom/`
   - Covered no writes outside the requested target via a symlinked output path
   - Covered rejection of config paths that escape the workspace root

2. Ran the exact focused RED command from the brief before production edits:

   - Command: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-workspace.test.ts`
   - Result: FAIL
   - Evidence:
     - `Error: Failed to load url ../src/asset-workspace.js`
     - `Does the file exist?`

GREEN evidence:

1. Focused Task 5 verification after implementing `asset-workspace.ts`:

   - Command: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-workspace.test.ts`
   - Result: PASS (`10 passed`)

2. Required CLI typecheck from the brief:

   - Command: `rtk pnpm --filter @lpc-toolkit/cli run typecheck`
   - Result: PASS

Self-review:

- Re-checked the module against the Task 5 brief and the approved Phase 1 plan slice to keep the public surface limited to workspace config/discovery/ownership only
- Confirmed explicit workspace resolution never falls back to ancestor discovery
- Confirmed config-relative paths must stay inside the workspace root
- Confirmed a second `initializeAssetWorkspace()` call preserves the original ownership marker instead of rewriting it
- Confirmed initialization rejects unowned non-empty output and rejects workspace-tree symlink escapes before any external writes occur
- Confirmed the implementation does not prepare runtime assets, touch cache state, or wire command parsing

Concerns:

- `registryPath` is exposed and the `.lpc-toolkit/asset-packs/` subtree is created, but `registry.json` itself is intentionally not materialized yet because Task 5 did not define its on-disk schema or lifecycle; later tasks that own registry publication should create and validate it explicitly.

---

## Reviewer fix follow-up — 2026-07-21

Status: complete

Files changed:

- `packages/cli/src/asset-workspace.ts`
- `packages/cli/test/asset-workspace.test.ts`

Fix commit summary:

- `fix(cli): harden asset workspace containment checks`

What changed:

- Rejected workspace-target initialization when the requested target sits under an existing symlinked parent, so `mkdir` cannot materialize a workspace outside the requested tree before validation.
- Hardened configured `packsDirectory`, `outputDirectory`, and `stateDirectory` resolution so reopened and discovered workspaces reject symlink-parent escapes even when the configured path is lexically under the workspace root.
- Enforced exact v1 workspace-config keys and exact v1 output-marker keys, rejecting unknown JSON fields instead of silently accepting forward- or typo-shaped drift.
- Added focused regressions for initialization, reopen, discovery, and JSON-schema-key enforcement.

RED evidence:

1. Added these regression tests in `packages/cli/test/asset-workspace.test.ts` before changing production code:
   - rejects a workspace target whose existing parent path is a symlink
   - rejects reopened configs whose state directory traverses a symlinked parent
   - rejects discovered configs whose output directory traverses a symlinked parent
   - rejects workspace configs with unknown keys
   - rejects output markers with unknown keys

2. Ran the required focused RED command before touching `packages/cli/src/asset-workspace.ts`:

   - Command: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-workspace.test.ts`
   - Result: FAIL
   - Evidence:
     - `15 tests | 5 failed`
     - `initializeAssetWorkspace > refuses a workspace target whose existing parent path is a symlink`
     - `initializeAssetWorkspace > rejects reopened configs whose state directory traverses a symlinked parent`
     - `initializeAssetWorkspace > rejects workspace configs with unknown keys`
     - `initializeAssetWorkspace > rejects output markers with unknown keys`
     - `findAssetWorkspace > rejects discovered configs whose output directory traverses a symlinked parent`

GREEN evidence:

1. Re-ran the focused workspace suite after the production fix:

   - Command: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-workspace.test.ts`
   - Result: PASS
   - Evidence:
     - `✓ test/asset-workspace.test.ts (15 tests)`
     - `Tests 15 passed (15)`

2. Ran the required CLI typecheck:

   - Command: `rtk pnpm --filter @lpc-toolkit/cli run typecheck`
   - Result: PASS
   - Evidence:
     - `tsc -p tsconfig.json --noEmit`

Self-review:

- The root-cause fix stays minimal: it hardens existing path-validation and JSON parsing rather than changing workspace layout, marker shape, or discovery semantics.
- The ancestry validator deliberately starts at the nearest existing path segment so it still rejects user-created symlink escapes without treating the macOS `/var` tempdir alias as an invalid workspace path.
- Reopen and discovery now validate all configured internal directories, not just the managed output directory, which closes the `stateDirectory` and `packsDirectory` escape gap the reviewer called out.
- The exact-key enforcement is limited to the v1 config and output-marker files requested here; no later-task registry behavior or schema ownership was widened.
