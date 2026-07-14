# LPC Toolkit Codex Plugin Design

## Context

`@lpc-toolkit/cli` already provides the execution surface needed for directed
Codex character authoring: structured JSON responses, catalog search, persistent
or explicit selection documents, validation, attributed previews, full renders,
and ZIP export. Codex can complete the workflow today, but it must infer the
correct command sequence from general CLI help and can consume unnecessarily
large catalog responses while doing so.

The distribution goal is broader than a repository-local workflow. Any user who
has installed the public CLI should be able to add the corresponding Codex
capability with a straightforward plugin installation.

## Goals

- Package a reliable Codex workflow for authoring LPC characters through the
  existing CLI.
- Keep the CLI as the only implementation of catalog, selection, rendering, and
  attribution behavior.
- Distribute the workflow as an installable Codex plugin from this monorepo.
- Support a repository marketplace during beta and a future public Plugins
  Directory submission without changing the workflow architecture.
- Detect missing or incompatible CLI installations before attempting character
  operations.
- Preserve attribution through every preview, render, and export workflow.

## Non-goals

- No MCP server in the first plugin version.
- No duplicate implementation of CLI commands or core composition behavior.
- No automatic installation or upgrade of `@lpc-toolkit/cli` by the plugin.
- No natural-language outfit planner, batch cast generator, or game-engine
  importer.
- No hooks unless a later requirement needs mechanical enforcement that skill
  instructions and CLI validation cannot provide.
- No separate GitHub repository for the first version.
- No changes to `upstream/`.

## Selected Approach

Create a lightweight Codex plugin in this monorepo. The plugin bundles one
focused character-authoring skill, reference material, compatibility checking,
and install-surface assets. It invokes the external `lpc-toolkit` executable and
does not wrap the CLI in MCP.

This separates responsibilities:

```text
@lpc-toolkit/cli
  catalog, selection persistence, validation, rendering, attribution
          ^
          |
character-authoring skill
  command sequencing, output discipline, preview/iteration workflow
          ^
          |
Codex plugin
  installation, discovery, versioning, marketplace metadata, presentation
```

The alternatives were:

1. A repository or personal skill without a plugin. This is simpler for local
   iteration but does not meet the install-and-share goal.
2. A plugin containing an MCP server that wraps the CLI. This could expose
   typed tools, but it duplicates the existing structured command surface and
   adds server lifecycle, packaging, sandbox, and cross-platform complexity.
3. A plugin containing the CLI implementation. This would create two release
   paths for the same behavior and risk attribution or validation drift.

The selected lightweight plugin retains the skill as the workflow authoring
unit while using the plugin only as its distribution envelope.

## Repository Layout

Add the plugin and beta marketplace to the existing monorepo:

```text
.agents/
  plugins/
    marketplace.json
plugins/
  lpc-toolkit/
    .codex-plugin/
      plugin.json
    skills/
      character-authoring/
        SKILL.md
        agents/
          openai.yaml
        references/
          cli-workflow.md
          compatibility.md
    assets/
      icon.png
      logo.png
```

The exact asset formats may be adjusted to the current plugin manifest rules,
but the plugin must remain self-contained under `plugins/lpc-toolkit/` except
for the repository marketplace entry.

## Plugin Manifest And Presentation

`.codex-plugin/plugin.json` identifies the plugin, points to `./skills/`, and
provides install-surface metadata. The first version does not declare MCP
servers, apps, or hooks.

The presentation metadata should include:

- display name: `LPC Toolkit`
- a concise description centered on creating and rendering attributed LPC
  characters through the installed CLI
- project repository, homepage, GPL-3.0-or-later license, and issue tracker
- developer identity consistent with the CLI package
- a small icon and larger logo
- starter prompts for creating a character, changing equipment, previewing a
  design, and rendering a final attributed bundle

The plugin and CLI have independent versions. The plugin's compatibility
reference defines a supported CLI version range. The first published range is
chosen from the actual CLI release available when implementation begins rather
than guessed in this design.

## Character-Authoring Skill

The bundled skill is responsible for reliable workflow sequencing, not product
logic. Its description should trigger for requests to create, inspect, edit,
preview, or render LPC characters with `lpc-toolkit`.

The workflow is:

1. Run `lpc-toolkit --version` and compare the result with the supported range.
2. If the CLI is usable, inspect the narrowest relevant command help when
   needed.
3. Create or locate a character through a named character document or an
   explicit `--selection` file.
4. Use `character search --json` with a type and query narrow enough to avoid
   broad catalog dumps.
5. Select an exact `itemId`, variant, or recolor from structured output.
6. Apply one change at a time with `character set` or `character remove`.
7. Validate after edits and resolve structured errors before rendering.
8. Generate an attributed preview, inspect the returned artifact path, and
   visually review the PNG when the Codex surface supports local images.
9. Iterate only when the preview or validation result requires it.
10. Render the requested final artifacts and verify that metadata plus TXT and
    CSV credit files are present.

All agent-consumed commands use `--json` where supported. Human help output is
used only for command discovery. The skill must not suppress attribution
artifacts, bypass cache integrity checks, use `--allow-partial` without an
explicit reason, or modify generated selection data behind the CLI's back when
an equivalent character command exists.

The reference files own longer command examples, compatibility policy, known
output-volume caveats, and troubleshooting guidance so the main `SKILL.md`
stays focused.

## Data Flow

For a normal character request:

```text
User request
  -> Codex selects bundled character-authoring skill
  -> skill checks installed CLI version
  -> CLI loads local assets or verified managed cache
  -> Codex searches compatible catalog items through JSON output
  -> CLI validates and atomically updates the selection
  -> CLI renders attributed preview artifacts
  -> Codex inspects preview and optionally iterates
  -> CLI publishes final sheet/animation/frame/ZIP artifacts
  -> Codex verifies metadata and credit artifacts before handoff
```

The plugin does not read the asset cache, selection documents, or rendered
files independently of the CLI, except that Codex may open the preview PNG for
visual review and inspect returned artifact paths for verification.

## Errors And Recovery

### CLI not found

Stop before authoring and explain that the plugin requires the public CLI.
Provide the documented installation command and Node.js requirement. Do not
silently install software.

### CLI version unsupported

Report the installed version and supported range. Recommend the documented
upgrade path. Do not continue with commands whose JSON contract may differ.

### Asset cache preparation failure

Surface the CLI's structured error and path. Follow the CLI troubleshooting
guidance; never bypass manifest or checksum verification.

### Search returns too much data

Refine type and query filters before repeating the command. Do not request the
entire catalog unless the user explicitly needs it. CLI-level pagination and
warning compaction remain potential future improvements, not plugin-owned
behavior.

### Selection or edit invalid

Use stable error codes, suggestions, and available-value details returned by
the CLI. Correct one issue at a time and revalidate.

### Preview or render failure

Do not treat partial files as successful output. Use `--allow-partial` only
when the user accepts partial animation output and the returned warnings and
metadata make all skipped layers explicit.

### Attribution incomplete

Treat missing metadata, credits TXT, or credits CSV as a failed handoff even if
a PNG exists.

## Marketplace And Distribution

During beta, `.agents/plugins/marketplace.json` exposes
`plugins/lpc-toolkit/` from this GitHub repository. A user adds the repository
as a marketplace source once, restarts the desktop app if required, and then
installs the LPC Toolkit plugin from the Plugin Directory UI.

The documented beta onboarding is:

```sh
codex plugin marketplace add ochowei/lpc-toolkit-2026-1
```

The repository README and CLI package README should distinguish three actions:

1. Install or upgrade `@lpc-toolkit/cli`.
2. Add the beta marketplace once.
3. Install or enable the LPC Toolkit plugin in Codex.

After beta validation, the same plugin can be submitted to the public Plugins
Directory. Public directory availability removes the marketplace-add step;
users still install the CLI separately because plugin installation does not run
package-manager lifecycle commands or silently install executables.

## Testing And Verification

### Static plugin checks

- Validate `.codex-plugin/plugin.json` and marketplace JSON against current
  plugin requirements.
- Confirm every declared skill, reference, and asset path exists within the
  plugin.
- Confirm marketplace paths resolve from the repository root.
- Scan the skill and references for stale binary names and undocumented flags.

### Skill behavior tests

Exercise realistic prompts that cover:

- create from a preset, search, set, validate, preview, and render
- explicit selection-file operation
- missing CLI
- unsupported CLI version
- unknown item with suggestions
- invalid variant or recolor with available values
- cache failure
- strict render failure
- successful output with metadata and both credit formats

The tests should verify both explicit skill invocation and representative
implicit-trigger prompts.

### CLI contract tests

Add the smallest maintainable contract check that compares commands and flags
used by plugin references with the generated CLI command specification. Avoid
copying the entire help output into brittle snapshots.

### Repository verification

Use the narrowest plugin-specific checks while iterating. Before handoff, run
the plugin validation, focused CLI contract tests, CLI typecheck and tests,
documentation contract tests if touched, `rtk pnpm check:boundaries`, and
`rtk pnpm verify` as required by the engineering guide.

## Rollout

1. Add the plugin skeleton, skill, references, presentation assets, and beta
   marketplace entry in this monorepo.
2. Test against the current published CLI and record the supported range.
3. Document beta installation in the repository and CLI package READMEs.
4. Validate installation from the Git-backed marketplace in a clean Codex
   environment.
5. Collect workflow and compatibility feedback without adding MCP or hooks.
6. Submit the stable plugin to the public Plugins Directory when its metadata,
   support policy, and starter prompts are ready for public users.

## Success Criteria

- A user with a supported `lpc-toolkit` executable can add the beta marketplace,
  install the plugin, and start a new Codex task without manually copying a
  prompt or workflow guide.
- Codex can create, search, edit, validate, preview, visually inspect, and
  render a character through the CLI while preserving attribution.
- Missing CLI, incompatible version, cache failure, invalid selection, and
  incomplete attribution paths produce actionable guidance instead of silent
  fallback.
- Plugin installation does not install dependencies, duplicate CLI logic, or
  introduce an MCP server.
- CLI and plugin releases can evolve independently through an explicit tested
  compatibility range.
- The same plugin structure can move from the repository marketplace to public
  Plugins Directory distribution without redesigning the skill.
