# Documentation Guidance Restructure Design

**Date:** 2026-07-14

**Status:** Proposed for written review

## Goal

Restructure the repository's contributor and agent guidance so each document
has one primary audience and responsibility, while correcting known drift in
CLI status, package layout, licensing language, attribution sources, and
verification commands.

The result should preserve the useful EverOS-style pattern of a small entry
point leading to detailed, enforceable guidance without copying tool-specific
directory conventions that this repository does not currently need.

## Confirmed Direction

The user approved the moderate restructuring option from the documentation
audit:

- keep public product guidance in the root README;
- keep stable dependency and ownership rules in the architecture document;
- make `AGENTS.md` and `CLAUDE.md` concise, synchronized agent entry points;
- turn onboarding into an executable first-day path;
- add focused human contribution, engineering, and release documents;
- align the common local verification command with the main CI unit gate;
- strengthen documentation contract tests so they detect drift rather than
  merely require historical wording in one file.

This design deliberately avoids a full `.claude/rules/` or nested
`AGENTS.md` rollout. Path-scoped agent rules may be introduced later when a
package has enough stable, unique rules to justify another maintained source.

## Documentation Responsibilities

### `README.md`: public repository entry

The root README will answer:

- what the toolkit does;
- which packages exist and their current status;
- how to install repository dependencies and start the web editor;
- how a user installs and tries the public CLI;
- where to find package API, contributor, architecture, and license details.

It will retain a short package overview and quick starts. It will not remain
the maintainer release runbook, the complete core API tutorial, or the UI
handoff specification.

The complete executable core example will move to
`packages/core/README.md`. The root README's CLI release procedures will move
to `docs/RELEASING.md`. The detailed UI design-reference section will become a
short description and repository-relative link.

### `packages/core/README.md`: core package usage

The core package README will become the home of the existing palette-aware,
attribution-preserving composition example. It will describe the injected
`CanvasAdapter`, link to `API.md`, and identify `@napi-rs/canvas` as the current
Node test/CLI implementation without implying that any concrete canvas package
belongs in core runtime source.

The existing executable example test will read this package README instead of
the root README.

### `docs/ARCHITECTURE.md`: stable system boundaries

Architecture will remain authoritative for:

- package and directory ownership;
- allowed and forbidden dependency direction;
- core, presets, web, and CLI runtime boundaries;
- React data flow;
- attribution and export invariants;
- CLI asset-store and provenance architecture.

The command matrix and CI workflow explanation will move to
`docs/ENGINEERING.md`, leaving only a concise reference to the executable
boundary gate. Local large-React-file extraction advice will move to the agent
entry point because it is change guidance rather than system architecture.

This is a surgical split, not a rewrite of architectural decisions or a move
of the detailed CLI asset lifecycle out of architecture.

### `AGENTS.md` and `CLAUDE.md`: synchronized agent entry points

Both files will contain the same concise repository guidance so Codex and
Claude receive equivalent rules. A contract test will require byte-for-byte
equality, avoiding an unverified manual mirror.

They will contain:

- project summary and current package layout, including presets and the active
  CLI;
- canonical setup and verification commands, all shown with the required RTK
  prefix;
- hard rules for the dormant upstream gitlink, compatible dependencies,
  mandatory attribution, core isolation, strict TypeScript, pnpm, and RTK;
- a compact architecture summary and links to detailed documents;
- approval-required actions;
- local React extraction guidance;
- a condensed version of the existing think-first, simplicity, surgical-change,
  and goal-driven working principles;
- the existing plan-file commit and verification recording requirement.

The project license identifier will be made consistent with package metadata
as `GPL-3.0-or-later`, while still noting that upstream is GPL-3.0. Attribution
wording will identify the active asset source's `CREDITS.csv` as authoritative;
normal output must never depend on initializing `upstream/CREDITS.csv`.

### `docs/ONBOARDING.md`: executable first-day path

Onboarding will be rewritten around tasks rather than an exhaustive file
inventory. It will include:

1. prerequisites: Node.js 22 and the pinned pnpm major;
2. a standard clone without submodule initialization;
3. dependency installation and the common verification gate;
4. starting the web editor and invoking the local CLI build;
5. a focused tour of core, presets, web, CLI, assets, and tests;
6. a "where does this change belong?" routing table;
7. package-scoped verification examples;
8. first-contribution guidance and common pitfalls.

It will remove the stale "planned CLI" description and include presets and CLI
tests in its quality map.

### `CONTRIBUTING.md`: human contribution entry

The new root contribution guide will cover:

- contribution scope and when to discuss a large change first;
- setup and workflow links;
- branch and pull-request expectations;
- the required common verification gate and change-specific checks;
- dependency license approval, attribution, and read-only upstream rules;
- the distinction between pnpm for repository development and npm/npx for
  public CLI consumption or authorized publication.

It will link to onboarding and engineering details rather than duplicate their
commands.

### `docs/ENGINEERING.md`: command and quality-gate source of truth

The new engineering guide will define:

- canonical repository commands;
- the common pre-PR verification command;
- package-scoped test and typecheck commands;
- architecture, web E2E, CLI packaging, asset, and parity checks;
- which checks are common, conditional, slow, or release-only;
- how the main CI jobs map to local commands;
- why ordinary verification must not initialize or install inside `upstream/`.

The root package will expose `pnpm verify` for the main unit gate, implemented
as the existing web asset preparation and upstream-pin verification followed by
`pnpm check:boundaries`, `pnpm typecheck`, and `pnpm -r test`. Calling the
recursive workspace tests directly avoids re-running the root `pretest` hook;
the web package may still run its own required `pretest` lifecycle. The script
will not claim to replace conditional Playwright, cross-platform package,
isolated parity, or release checks.

The CI unit job will call the shared command so its ordering does not silently
diverge from local guidance.

### `docs/RELEASING.md`: maintainer-only CLI release runbook

The new release guide will receive the existing root README instructions for:

- local package and tarball verification;
- prerelease version and RC tag matching;
- macOS and Windows release-candidate validation;
- the one-time npm publication bootstrap rule;
- stable-tag npm OIDC publication;
- post-publication installation and registry verification.

It will clearly label tag creation, npm publication, Trusted Publisher setup,
and registry verification as externally mutating maintainer actions, not normal
implementation verification.

## Navigation Structure

The intended hierarchy is:

```text
README.md
├── CONTRIBUTING.md
│   ├── docs/ONBOARDING.md
│   └── docs/ENGINEERING.md
├── docs/ARCHITECTURE.md
├── docs/RELEASING.md
├── packages/core/README.md
└── packages/cli/README.md

AGENTS.md == CLAUDE.md
├── docs/ARCHITECTURE.md
├── docs/ENGINEERING.md
└── docs/ONBOARDING.md
```

`docs/README-ARCHITECTURE-AUDIT-CLOSURE.md` remains historical audit evidence.
It is not promoted as a contributor entry point and its existing evidence
contract remains intact.

## Documentation Contract Tests

Existing tests will be updated rather than replaced wholesale.

### README and architecture contract

`packages/web/test/readme-architecture-docs.test.ts` will:

- read the three new public guidance files;
- require `AGENTS.md` and `CLAUDE.md` to be identical;
- reject stale "planned CLI" and "built later" language;
- require the project license identifier to agree with root package metadata;
- verify that release-only details live in `docs/RELEASING.md`, not the root
  README;
- continue verifying package layout, asset lifecycle, routes, attribution, and
  architecture ownership in their new authoritative locations;
- verify repository-relative Markdown links for the maintained entry documents.

Assertions will target stable responsibilities and invariants. They will avoid
forcing the current CLI version or long release prose into the root README.

### Core README example contract

`packages/core/test/readme-example.test.ts` will extract the TypeScript example
from `packages/core/README.md` and continue executing its palette, pixels, and
precise-credit behavior.

### Command and CI contract

`packages/web/test/package-scripts.test.ts` will require the root `verify`
script and require the main CI unit job to invoke it. Existing checks for asset
preparation, upstream pin verification, parity isolation, and release workflow
boundaries remain.

## Verification Strategy

Each implementation batch will use the narrowest relevant tests, followed by
the repository gate:

- documentation contract tests;
- executable core README example test;
- package-script and workflow tests;
- Markdown relative-link validation;
- `rtk pnpm check:boundaries`;
- `rtk pnpm typecheck`;
- `rtk pnpm verify`;
- `rtk pnpm build` because the root README documents build behavior.

No ordinary implementation check will run isolated upstream parity unless a
changed parity instruction or workflow requires that expensive gate.

## Failure Handling

- A moved section is not removed from its old location until its destination
  exists and links back into the documentation hierarchy.
- Commands documented as runnable must correspond to an existing package
  script or executable workspace command.
- Broken relative links, diverged agent files, stale package status, or license
  identifier disagreement fail the documentation contract tests.
- If a common command cannot accurately represent a CI gate, the document will
  label the exceptional gate separately instead of hiding it behind
  `pnpm verify`.

## Sequencing

1. Add failing or redirected contract tests for document ownership and the
   shared verification command.
2. Add `CONTRIBUTING.md`, `docs/ENGINEERING.md`, and `docs/RELEASING.md`, plus
   the root `verify` script and CI wiring.
3. Slim the root README and expand the core package README.
4. Rewrite and synchronize the agent entry points.
5. Rewrite onboarding and trim the moved engineering/change-guidance sections
   from architecture.
6. Run focused and repository-wide verification, then update the implementation
   plan with commit hashes and results.

The implementation plan may divide these into smaller commits, but every
commit must leave documentation links valid and tests coherent.

## Non-Goals

- No new dependency, backend, database, authentication system, build tool, or
  framework.
- No product code, public selection, composition, export, or attribution
  behavior change.
- No modification or package installation inside `upstream/`.
- No license-policy change; this work only makes the existing project metadata
  and guidance consistent.
- No npm publication, tag creation, Trusted Publisher change, or other external
  release action.
- No broad path-scoped agent-rule rollout.
- No rewrite of `API.md`, `RESEARCH.md`, the historical audit closure, or the
  CLI consumer manual beyond links required by the new hierarchy.
- No unrelated cleanup of implementation files or tests.

## Acceptance Criteria

The restructuring is complete when:

1. the root README is a focused public entry and no longer contains the full
   release runbook or UI handoff specification;
2. the executable core example lives in and is tested from the core package
   README;
3. architecture contains stable ownership and dependency rules while
   engineering owns the command and CI matrix;
4. `AGENTS.md` and `CLAUDE.md` are concise, current, identical, and enforced as
   such;
5. onboarding provides a runnable first-day setup and covers all four active
   packages;
6. contribution, engineering, and release documents exist with non-overlapping
   primary responsibilities;
7. the main CI unit gate and documented common local gate share `pnpm verify`;
8. maintained relative links, license identifiers, package status, and
   documentation contract tests pass;
9. boundaries, typecheck, workspace tests, and build pass without initializing
   the dormant submodule;
10. the implementation plan records each completed step's commit and
    verification result.
