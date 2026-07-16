# Remove Understand Anything Design

## Goal

Remove all project-local Understand Anything artifacts and uninstall the
corresponding Codex plugin. The repository must retain no tracked files,
ignore rules, or textual references dedicated to Understand Anything.

## Scope

The repository change will:

- delete the tracked `.understand-anything/` directory and its generated graph,
  fingerprint, metadata, and scanner configuration files;
- remove the Understand Anything comment and ignore patterns from `.gitignore`;
- leave unrelated repository files and ignore rules unchanged.

The user-environment change will uninstall the `understand-anything` Codex
plugin through Codex's plugin-management interface. It will not manually edit
plugin caches or Codex configuration files.

## Implementation Approach

Use a complete removal rather than retaining defensive ignore rules. The
tracked graph is generated tooling output and has no runtime role in the LPC
sprite engine, presets, web editor, or CLI. Removing it does not alter package
boundaries, composition behavior, attribution, assets, or exports.

Repository deletion and plugin uninstallation are independent operations. If
plugin uninstallation fails, preserve the repository cleanup and report the
remaining global-state issue explicitly rather than attempting manual cache
deletion.

## Verification

After the repository edit:

1. Search tracked and untracked repository content for Understand Anything
   names and `.understand-anything` paths, excluding Git internals.
2. Inspect `git diff --check` and the complete scoped diff.
3. Confirm `.understand-anything/` has no tracked entries.
4. Confirm plugin management reports a successful uninstall.

The change does not touch product source or package metadata, so focused
content and diff checks are proportionate. The repository-wide `rtk pnpm
verify` gate remains the final handoff check required by repository policy.

## CLI Documentation Impact

This change does not touch CLI-owned source, scripts, metadata, plugin contract,
asset release configuration, or release workflows.

```text
help: N/A — no CLI behavior or help changes
cli-readme: N/A — no CLI behavior or usage changes
root-readme: N/A — no user-facing toolkit behavior changes
landing: N/A — no web landing or CLI installation changes
architecture: N/A — no package boundary or ownership changes
engineering: N/A — no development command or CI changes
releasing: N/A — no release or publication changes
plugin: N/A — the removed plugin is external tooling, not plugins/lpc-toolkit
```
