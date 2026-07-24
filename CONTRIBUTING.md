# Contributing to lpc-toolkit

Thank you for helping improve `lpc-toolkit`. Contributions should preserve the
shared core engine, web editor, CLI behavior, asset provenance, and mandatory
attribution as one coherent product.

## Before You Start

Open an issue or discussion before work that would add a dependency, change an
architecture boundary, introduce a backend/database/authentication system,
change the framework or build tool, alter the license, or weaken attribution.
Large product changes also benefit from agreement on scope before code is
written.

Focused documentation, tests, bug fixes, and local UI improvements can normally
start directly. Keep one branch and pull request focused on one purpose.

Never modify, commit inside, or install packages inside `upstream/`. It is an
optional read-only provenance gitlink, not an active development checkout.

## Development Setup

Start with the [onboarding guide](docs/ONBOARDING.md). It covers prerequisites,
the standard clone, dependency installation, the web editor, the local CLI, and
the package tour.

Normal setup must work without initializing the `upstream/` submodule. Active
assets come from the checked-in or pinned cache-backed `assets/` flow.

## Making a Change

1. Create a focused branch from `main`.
2. Read the relevant ownership rules in the
   [architecture guide](docs/ARCHITECTURE.md).
3. Add or update the narrowest test that demonstrates the requested behavior.
4. Make the smallest change that satisfies the test.
5. Run the package-scoped checks while iterating.
6. Run the common verification gate before handoff.

Use Conventional Commit-style messages such as `fix(cli): preserve credits`
or `docs: clarify asset setup`. Do not combine unrelated cleanup with the
requested change.

AI agents must also follow [`AGENTS.md`](AGENTS.md), including its RTK command
and plan-record requirements. Human contributors may run repository commands
directly without the RTK proxy.

## Verification

The [Engineering guide](docs/ENGINEERING.md) is the command and CI source of
truth. The common pre-PR gate is:

```sh
pnpm verify
```

Run the additional change-specific checks listed there for browser E2E, CLI
packaging, asset validation, or isolated upstream parity. The common gate does
not replace those conditional checks.

## Pull Requests

A pull request should:

- explain the user-visible or engineering problem and the chosen scope;
- identify architecture, attribution, asset, or compatibility implications;
- include focused tests for changed behavior;
- list the exact verification commands and results;
- avoid unrelated formatting or refactoring;
- keep generated pixels and their matching credits together.

When a pull request changes CLI-sensitive production, packaging, release,
asset-release, or plugin paths, complete the PR template's machine-readable
documentation declaration:

```text
CLI docs impact: updated | not-applicable
CLI docs surfaces: help, cli-readme, root-readme, landing, architecture, engineering, releasing, plugin | none
CLI docs reason: required for not-applicable
```

Use `updated` and list each documentation surface present in the diff. If no
owned documentation contract changes, use `not-applicable`, set surfaces to
`none`, and provide a concrete reason of at least 20 characters. The CI failure
lists the sensitive files and any declaration field or surface that needs
correction. See the
[Engineering guide](docs/ENGINEERING.md#cli-documentation-synchronization) for
the surface mapping and local reproduction command.

Resolve review conversations and keep all required checks green before merge.

## Dependencies, Licensing, and Attribution

The project metadata declares `GPL-3.0-or-later`; upstream is GPL-3.0. Ask
before adding any dependency, and include its license when proposing it. Do not
add a dependency until compatibility has been reviewed.

Attribution is product logic. Every rendered or exported sprite must preserve
credit metadata derived from the active asset source's `CREDITS.csv`. Web and
CLI output paths may not bypass credits, and normal workflows may not depend on
`upstream/CREDITS.csv` being present.

## Repository Package Manager

Use pnpm for this workspace. Do not switch repository install, build, typecheck,
or test workflows to npm, yarn, or bun.

The npm and npx commands in [`packages/cli/README.md`](packages/cli/README.md)
are public consumer workflows for the published CLI. Authorized maintainers
also use npm for publication because npm is the target registry; that exception
does not change the repository package manager.
