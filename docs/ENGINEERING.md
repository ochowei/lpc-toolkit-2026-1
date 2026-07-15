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
4. run `verify:plugin`;
5. typecheck every workspace package;
6. run every workspace package's Vitest suite.

This is the same entry point used by the main CI unit job. It does not include
the production build, browser E2E, isolated upstream parity, cross-platform CLI
package validation, or npm publication.

## Canonical Commands

| Command | Purpose |
| --- | --- |
| `rtk pnpm install --frozen-lockfile` | Install exactly the locked workspace dependencies. |
| `rtk pnpm verify` | Run the common asset, boundary, type, and unit-test gate. |
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
