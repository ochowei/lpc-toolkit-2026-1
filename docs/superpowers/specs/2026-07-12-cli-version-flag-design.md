# CLI Version Flag Design

## Goal

Add root-level `--version` and `-V` flags to the `lpc-toolkit` CLI so users can
inspect the installed package version without loading runtime assets.

## Behavior

- `lpc-toolkit --version` prints the CLI package version followed by a newline.
- `lpc-toolkit -V` produces the same output.
- Root help lists `lpc-toolkit --version` and `lpc-toolkit -V` on separate lines
  so both supported forms are discoverable.
- Both commands write only to stdout and exit with status `0`.
- Version handling occurs before general argument parsing and asset preparation,
  matching the existing root-level `--help` and `-h` handling.
- The version comes from the existing `CLI_VERSION` export, which reads the
  packaged `packages/cli/package.json`; no duplicated version constant is added.
- Only a first argument of `--version` or `-V` triggers this root-level behavior.

## Implementation

Update `packages/cli/src/main.ts` to import `CLI_VERSION`, recognize both version
flags in the initial root-option branch, and print `${CLI_VERSION}\n`. Add the
long and short version invocations to the CLI help summary on separate lines.

No new dependency, command abstraction, asset behavior, or JSON response format
is introduced.

## Tests

Use test-driven development to add focused `runCli` coverage that verifies:

- `--version` prints the expected package version and returns `0`;
- `-V` behaves identically;
- neither form prepares runtime assets or writes to stderr;
- root help contains both `lpc-toolkit --version` and `lpc-toolkit -V`.

Run the CLI package's focused test, package typecheck, and repository boundary
check because the change touches CLI source code.
