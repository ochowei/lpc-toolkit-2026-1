# Engineering Guide

This document is the source of truth for repository commands, verification
scope, and the relationship between local checks and GitHub Actions. See
[`ARCHITECTURE.md`](ARCHITECTURE.md) for dependency and ownership rules.

## Prerequisites

- Node.js 22 or newer
- pnpm 9, as pinned by the root `packageManager` field
- RTK for repository commands run by AI agents

Install the locked workspace dependencies from the repository root:

```sh
rtk pnpm install --frozen-lockfile
```

Normal setup does not initialize the optional `upstream/` submodule.

## Common Verification Gate

Run the common pre-PR gate from the repository root:

```sh
rtk pnpm verify
```

The command runs these stages in order:

1. prepare the pinned web asset snapshot;
2. verify the release, fixture, and dormant-gitlink source pins;
3. run `check:boundaries`;
4. test the CLI documentation-impact policy;
5. run `verify:plugin`;
6. typecheck every workspace package;
7. run every workspace package's Vitest suite.

This is the same entry point used by the main CI unit job. It does not include
the production build, browser E2E, isolated upstream parity, cross-platform CLI
package validation, or npm publication.

## Canonical Commands

| Command | Purpose |
| --- | --- |
| `rtk pnpm install --frozen-lockfile` | Install exactly the locked workspace dependencies. |
| `rtk pnpm verify` | Run the common asset, boundary, type, and unit-test gate. |
| `rtk pnpm verify:cli-docs-policy` | Test the CLI documentation-impact parser and path policy. |
| `rtk pnpm check:cli-docs-impact -- --base <sha> --head <sha> --body-file <file>` | Reproduce the live pull-request documentation-impact check. |
| `rtk pnpm verify:plugin` | Validate Codex plugin structure and skill contracts. |
| `rtk pnpm build` | Build core, presets, web assets/Vite output, and the CLI package. |
| `rtk pnpm check:boundaries` | Enforce the executable dependency policy. |
| `rtk pnpm run typecheck` | Typecheck all workspace packages. |
| `rtk pnpm test` | Run the root test lifecycle and all workspace tests. |

Use the narrowest package command while iterating, then run the common gate
before handing off a repository-wide change.

Use the explicit `run` form for standalone typechecks. This avoids RTK's
pnpm-to-tsc shortcut, which does not preserve root workspace or leading
`--filter` context when the script name is used as shorthand.

## Change-Specific Checks

### Core

```sh
rtk pnpm --filter @lpc-toolkit/core run typecheck
rtk pnpm --filter @lpc-toolkit/core test
```

Core changes must also run `rtk pnpm check:boundaries` because runtime source
cannot import browser, Node, React, CLI, web, presets, ZIP, or concrete canvas
implementations.

### Presets

```sh
rtk pnpm --filter @lpc-toolkit/presets run typecheck
rtk pnpm --filter @lpc-toolkit/presets test
```

When preset behavior changes, verify at least one consuming web or CLI path in
addition to the package tests.

### Web

```sh
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm --filter @lpc-toolkit/web test
rtk pnpm --filter @lpc-toolkit/web test:e2e
```

Ordinary `test:e2e` uses the toolkit only. It does not initialize or run the
tracked upstream submodule.

### CLI

```sh
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm --filter @lpc-toolkit/cli build
rtk pnpm --filter @lpc-toolkit/cli test:package
```

#### Artist asset-pack authoring and lifecycle

Run the focused Core lifecycle modules whenever compatibility, semantic
version/replacement, source schema, or compile decisions change:

```sh
rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-version.test.ts asset-pack-schema.test.ts asset-pack-compile.test.ts
```

The seven focused CLI authoring modules cover workspace ownership, safe source
reads, scaffolding, PNG/baseline validation, authorized overlay loading, linked
sync/publication, and attributed preview:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-workspace.test.ts asset-pack-files.test.ts asset-pack-scaffold.test.ts asset-pack-validation.test.ts asset-overlay-store.test.ts asset-pack-sync.test.ts asset-pack-preview.test.ts
```

The no-repository acceptance runs the Phase 1 workflow through `runCli` with an
injected prepared base runtime. It covers a new item plus the `hair_messy`
climb extension, default and supplied-character previews, two-pack sync,
compiled-overlay rendering with base/custom credits, and the same-scope audit
closure:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-authoring-e2e.test.ts
```

Phase 2 archive and lifecycle coverage is intentionally split by trust
boundary. Run this complete focused set for payload snapshots, bounded ZIP
parsing/checksums, deterministic packaging, inspection, strict registry/source
state, crash recovery, install policy, cleanup, and doctor non-repair behavior:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-payload.test.ts asset-pack-archive-format.test.ts asset-pack-packaging.test.ts asset-pack-inspection.test.ts asset-pack-registry.test.ts asset-pack-state.test.ts asset-pack-transaction.test.ts asset-pack-install.test.ts asset-pack-remove.test.ts asset-pack-doctor.test.ts
```

Runtime activation has its own integrity boundary. This focused suite proves
linked and installed tamper rejection, v1 refusal, managed-cache baseline
selection, immutable definition/sprite snapshots, and claim retention through
lazy consumption:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- runtime-asset-pack-activation.test.ts
```

The two-workspace acceptance drives the public CLI from clean author and
consumer directories with an injected compatible base cache. It proves
scaffold/validate/preview/sync/pack, inspect/install/list, installed catalog and
animation behavior, attributed preview/render, upgrade identity, remove,
remaining extension credits, doctor health, write containment, and untouched
base-cache sentinel:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-lifecycle-e2e.test.ts
```

Landing documentation and its checked-in attributed artifacts are verified
together:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx landing-artifacts.test.ts
```

Run `rtk pnpm check:boundaries` for every asset-pack architecture change. Run
the packed CLI smoke conditionally whenever CLI package metadata, build output,
or `packages/cli/scripts/` changes; it installs the produced tarball in a clean
consumer directory. After preparing one pinned cache, it proves no-repository
workspace init, fixture authoring/validation/packing, second-workspace
inspection/install/list, installed attributed preview/render, doctor, and
removal through the installed package without `upstream/`:

```sh
rtk pnpm --filter @lpc-toolkit/cli test:package
```

The complete Task 13 focused handoff gate is:

```sh
rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-version.test.ts asset-pack-schema.test.ts asset-pack-compile.test.ts
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-payload.test.ts asset-pack-archive-format.test.ts asset-pack-packaging.test.ts asset-pack-inspection.test.ts asset-pack-registry.test.ts asset-pack-state.test.ts asset-pack-transaction.test.ts asset-pack-install.test.ts asset-pack-remove.test.ts asset-pack-doctor.test.ts asset-lifecycle-e2e.test.ts
rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx landing-artifacts.test.ts
rtk pnpm --filter @lpc-toolkit/cli test:package
```

Before handoff, run the complete Task 13 mapping below. `rtk pnpm verify`
repeats the shared asset-pin, boundary, CLI documentation policy, plugin,
workspace typecheck, and workspace Vitest stages; it does not replace the
explicit CLI build/package smoke.

```sh
rtk pnpm check:boundaries
rtk pnpm --filter @lpc-toolkit/core run typecheck
rtk pnpm --filter @lpc-toolkit/core test
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm --filter @lpc-toolkit/cli build
rtk pnpm --filter @lpc-toolkit/cli test:package
rtk pnpm --filter @lpc-toolkit/web test
rtk pnpm verify
```

These checks require no initialized `upstream/`. The package smoke may require
network access for a clean npm dependency install and first pinned-cache
preparation; valid existing caches are reusable offline.

### Codex plugin

```sh
rtk pnpm verify:plugin
rtk pnpm --filter @lpc-toolkit/cli test -- plugin-contract.test.ts
```

#### CLI documentation synchronization

For a CLI behavior change, update only the documents whose owned contract
actually changes; ordinary CLI work does not require editing every document.
Before handoff, check the applicable items:

- [ ] When commands, subcommands, arguments, defaults, locators, output content
  or paths, error or recovery guidance, or usage examples change,
  update `packages/cli/README.md` and the corresponding `--help` or usage text.
- [ ] When a primary public CLI workflow or quick start changes, check and
  update the root `README.md`.
- [ ] When CLI build, typecheck, test, package-validation commands, or their CI
  mapping change, update this guide.
- [ ] When the npm package, installation method, versioning, release-candidate,
  publication, or post-publication verification flow changes, update
  `docs/RELEASING.md`.
- [ ] When CLI package ownership, persistence, asset lifecycle, adapter
  boundaries, or attribution/output contracts change, update
  `docs/ARCHITECTURE.md`.
- [ ] Add or update behavior tests, and verify both
  human-readable and `--json` output contracts.
- [ ] For render, preview, bundle, or export changes, retain
  metadata and TXT/CSV credit artifacts;
  preserve transactional output behavior.

CLI-sensitive pull requests must include these exact PR-body fields:

```text
CLI docs impact: updated | not-applicable
CLI docs surfaces: help, cli-readme, root-readme, landing, architecture, engineering, releasing, plugin | none
CLI docs reason: required for not-applicable
```

Use `updated` with every changed surface. Use `not-applicable`, `none`, and a
specific reason of at least 20 characters only when the implementation is
internal and changes no owned documentation contract.

The closed surface mapping is:

| Token | Owned path |
| --- | --- |
| `help` | `packages/cli/src/command-spec.ts` |
| `cli-readme` | `packages/cli/README.md` |
| `root-readme` | `README.md` |
| `landing` | `packages/web/src/components/landing-page.tsx` |
| `architecture` | `docs/ARCHITECTURE.md` |
| `engineering` | `docs/ENGINEERING.md` |
| `releasing` | `docs/RELEASING.md` |
| `plugin` | `plugins/lpc-toolkit/skills/**` |

The live check activates for CLI production source, CLI package metadata and
scripts, the LPC plugin, `asset-release.json`, and CLI release/publish workflow
changes. Test-only, fixture-only, plan-only, spec-only, and ordinary
documentation-only diffs do not activate it by themselves. To reproduce a PR
failure locally, save the PR description to a file and run:

```sh
rtk pnpm check:cli-docs-impact -- --base <base-sha> --head <head-sha> --body-file <pr-body-file>
```

Editing the pull request body creates a fresh documentation-impact check. That
`edited` event runs only this policy job; unit, package, and E2E jobs remain
skipped. Do not rerun the old failed job after correcting the declaration,
because the rerun retains its original pull-request event context.

The Agent plan/handoff matrix remains the semantic completeness check: CI can
prove that a declared surface appears in the diff, but cannot infer every
surface that ought to have been declared.

### Asset tooling

```sh
rtk pnpm --filter @lpc-toolkit/web validate-assets
rtk pnpm --filter @lpc-toolkit/web audit:thumbnail-bounds
```

Asset changes must preserve the active source's `CREDITS.csv` and source-pin
agreement.

### Isolated upstream parity

`test:e2e:parity` is exceptional. It requires
`LPC_UPSTREAM_PARITY_DIR` to point to a separate isolated checkout at the SHA
pinned by `asset-release.json`. After provisioning that checkout, run:

```sh
rtk pnpm --filter @lpc-toolkit/web test:e2e:parity
```

Never point this variable at the repository's tracked `upstream/` directory.

## CI Mapping

| GitHub Actions job | Local equivalent or scope |
| --- | --- |
| `Unit tests` | `pnpm verify`, including Codex plugin structure and skill contracts |
| `CLI documentation impact` | PR-body declaration validated against CLI-sensitive changed paths |
| `CLI package` | CLI typecheck, tests, build, and `test:package` |
| `E2E (web)` | Web `test:e2e` with ordinary local assets |
| `E2E parity (web)` | A separately provisioned pinned checkout plus `test:e2e:parity` |
| `CLI Release Candidate` | Cross-platform package validation; see `docs/RELEASING.md` |
| `Publish CLI` | Stable-tag verification and authorized npm publication; see `docs/RELEASING.md` |

The CI unit job and local development share `pnpm verify`. Conditional and
release jobs remain separate because they require browsers, multiple operating
systems, an isolated upstream checkout, tags, or publication authority.

## Asset and Upstream Rules

Ordinary install, verification, build, package, publish validation, and web E2E
use the checked-in or pinned cache-backed asset flow. They must not initialize
`upstream/`, install packages inside it, or write generated files there.

The tracked gitlink exists only for provenance and source reference. Pixel
parity runs against a separate checkout of the same pinned revision. The
active asset source's `CREDITS.csv` remains mandatory for rendered output.

## Release-Only Checks

Version/tag matching, macOS and Windows RC validation, packed public installs,
npm OIDC publication, registry verification, and Trusted Publisher changes are
maintainer release operations. Their runbook lives in `docs/RELEASING.md` and
requires explicit authorization before any external mutation.
