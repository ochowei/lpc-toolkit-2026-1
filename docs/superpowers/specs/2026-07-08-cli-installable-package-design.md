# CLI Installable Package Design

## Goal

Make `@lpc-toolkit/cli` usable like a normal terminal command after
`pnpm build`, with two supported install paths:

- local development install through pnpm global link
- tarball install through `pnpm pack` followed by `pnpm add -g`

The installed command should be `lpc-toolkit`. The CLI should not publish or
install a short `lpc` command because macOS already provides `/usr/sbin/lpc`,
and that name collision makes command resolution unreliable.

## Non-Goals

- Do not publish the package to a registry.
- Do not add new runtime dependencies.
- Do not change CLI command behavior beyond the displayed command name.
- Do not modify `upstream/`.
- Do not change core architecture or move Node runtime behavior into
  `packages/core/`.

## Approach

Use the existing CLI entrypoint and package it more deliberately.

`packages/cli/src/index.ts` already has a Node shebang and delegates to
`runCli`. `packages/cli/package.json` already declares a bin entry, but the
public command name should change from `lpc` to `lpc-toolkit`.

The package should also define its published file allowlist so `pnpm pack`
contains only runtime artifacts and required metadata. The current package shape
can include source files, tests, TypeScript config files, and stale build output
when packed. The build script should remove `dist/` before compiling so old
artifacts cannot be accidentally included.

## Package Shape

Update `packages/cli/package.json`:

- Change `bin` to only expose `lpc-toolkit`.
- Add `files` so tarballs include `dist/`, `README.md` if present, and package
  metadata, but not source, tests, TypeScript configs, or stale outputs.
- Update `build` to clean `dist/` before compiling. Use a dependency-free
  Node command or an existing safe cross-platform mechanism instead of adding a
  cleanup dependency.

The package remains `private: true` unless a later publishing task explicitly
changes that. Private packages can still be linked locally and packed for local
installation, which covers the requested A+C workflows.

## Command Name

The user-facing command is:

```bash
lpc-toolkit
```

Help text and documentation should use this command name in every displayed
example:

```bash
lpc-toolkit catalog types
lpc-toolkit catalog items --type <typeName>
lpc-toolkit selection validate --selection <file>
lpc-toolkit render --selection <file> --out <dir>
lpc-toolkit token encode --selection <file>
lpc-toolkit preset render <preset-id> --out <dir>
```

The old `lpc` command should not be installed as an alias.

## Install Workflows

Local development link:

```bash
pnpm build
pnpm --filter @lpc-toolkit/cli link --global
lpc-toolkit --help
```

Tarball install:

```bash
pnpm build
pnpm --filter @lpc-toolkit/cli pack --pack-destination /tmp
pnpm add -g /tmp/lpc-toolkit-cli-0.0.0.tgz
lpc-toolkit --help
```

The README should document both workflows and avoid recommending
`pnpm --filter @lpc-toolkit/cli exec lpc --help`, because that can resolve to
the system `lpc` command rather than this project.

## Tests

Update focused CLI tests:

- The smoke/help test should expect `lpc-toolkit` examples.
- Add a package metadata test that checks:
  - `bin` exposes `lpc-toolkit`
  - `bin` does not expose `lpc`
  - `files` is present and excludes source/test/config packaging by default

These tests guard the command-name decision and packaging allowlist from
regressing.

## Verification

Run the narrow CLI verification:

```bash
rtk pnpm --filter @lpc-toolkit/cli build
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm --filter @lpc-toolkit/cli pack --pack-destination /tmp
```

Inspect pack output to confirm it contains runtime files and metadata only.

When the environment permits global bin writes, also verify at least one install
workflow end to end:

```bash
rtk pnpm --filter @lpc-toolkit/cli link --global
rtk lpc-toolkit --help
```

or:

```bash
rtk pnpm add -g /tmp/lpc-toolkit-cli-0.0.0.tgz
rtk lpc-toolkit --help
```

If global pnpm installation is blocked by sandboxing or machine configuration,
record that limitation and rely on package build, test, pack inspection, and
direct Node execution as fallback evidence.

## Risks

Global install commands mutate the developer machine's pnpm global bin state.
Implementation should request approval before running them if sandbox policy or
machine configuration requires escalation.

Changing the command name requires updating docs and tests together. The CLI
command parser itself should remain unchanged because it receives arguments
after the bin name.
