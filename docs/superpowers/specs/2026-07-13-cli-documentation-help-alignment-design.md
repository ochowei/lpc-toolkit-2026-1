# CLI Documentation and Help Alignment Design

## Context

PR #115 adds a persistent CLI character-authoring workflow with `create`,
`list`, `show`, `search`, `set`, `remove`, `validate`, `preview`, and `render`
commands. The package README contains the primary five-command quick start,
but the repository README and architecture guide do not yet describe the new
workflow. The package README also does not provide a complete character
subcommand index or explain the two locator forms.

The generated CLI help includes the character command tree and its options.
However, locator-based command usage currently presents `<name>` together with
an optional `--selection <file>`, while runtime validation requires exactly one
of those locators.

## Goals

- Give repository readers a short, accurate entry point into character
  authoring without duplicating the package README.
- Make the CLI package README the complete workflow-oriented reference for
  character commands.
- Record the character persistence, editing, validation, preview, rendering,
  and attribution ownership boundaries in the architecture guide.
- Make generated help accurately state that a character name and an explicit
  selection file are mutually exclusive locator forms.

## Non-goals

- No command behavior, persisted selection schema, output format, or default
  path changes.
- No exhaustive duplication of generated `--help` options in Markdown.
- No dependency, asset, Web UI, core composition, or preset changes.
- No changes to the read-only `upstream/` submodule.

## Documentation Design

### Repository README

Extend the CLI package status and command overview to mention named character
authoring. Add a compact five-command quick start using the already verified
`farmer`, `hair_braid`, and `lpcr.brown` values. Link to
`packages/cli/README.md` for the complete character command reference and
retain the existing install, asset-cache, attribution, and maintainer sections.

### CLI Package README

Keep the existing quick start. Add a compact character subcommand table that
documents all nine commands and their purpose. Explain that locator-based
commands accept either a name stored under `./characters/` or
`--selection <file>`, never both. Document the default named-preview directory
and state that character rendering is strict by default while
`--allow-partial` permits attributed partial output.

### Architecture Guide

Extend only the CLI ownership sections. Assign filesystem-backed character
documents and atomic create/replace operations to the character store;
catalog-backed edit/search/validation decisions to CLI application logic; and
transactional attributed preview/render publication to the CLI output layer.
State that shared selection, composition, preset, and attribution rules remain
in core or presets and that CLI persistence must not leak Node filesystem APIs
into those packages.

## Help Design

Use one shared locator notation for `show`, `search`, `set`, `remove`,
`validate`, `preview`, and `render`:

```text
(<name> | --selection <file>)
```

Keep `create <name>` and `character list` unchanged. Options continue to be
generated from `command-spec.ts`; only usage strings change. Runtime conflict
validation remains the source of truth and is not modified.

## Verification

- Add command-spec assertions covering the mutually exclusive locator notation
  and all character subcommands.
- Extend the existing README/architecture contract test with the smallest
  stable phrases that prove each document owns its intended information.
- Run focused CLI command-spec and Web documentation-contract tests.
- Run CLI and Web typechecks plus `rtk pnpm check:boundaries` because the
  architecture document and CLI command metadata are touched.
- Run `rtk git diff --check` before committing.

## Success Criteria

- A new user can discover and complete the primary character workflow from the
  repository README, then reach the package README for all character commands.
- The package README explains all nine subcommands, locator rules, preview
  defaults, strict rendering, partial output, and attribution preservation.
- The architecture guide names the correct owners without changing package
  boundaries.
- Generated help no longer implies that `<name>` and `--selection` may be used
  together.
- Existing CLI behavior and all focused verification remain unchanged and
  passing.
