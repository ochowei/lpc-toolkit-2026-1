---
name: lpc-character-authoring
description: Use when composing, editing, validating, previewing, or rendering LPC characters from existing catalog assets through the installed lpc-toolkit CLI. Do not use for creating source pixels, unrelated image editing, or non-LPC sprites. Use lpc-animation-asset-audit for read-only source-asset animation audits and lpc-asset-authoring for confirmed source-asset revisions.
---

# LPC Character Authoring

Use `lpc-toolkit` as the only source of catalog, selection, validation, render,
and attribution behavior.

This journey composes existing art; it does not create or replace source assets.
Use lpc-animation-asset-audit for read-only source-asset animation audits. If
the catalog cannot satisfy the character, explain the gap and ask before
switching to lpc-asset-authoring.

1. Resolve the installed plugin directory to an absolute path named
   `PLUGIN_ROOT`. Read `$PLUGIN_ROOT/references/compatibility.md`, then run
   `node "$PLUGIN_ROOT/scripts/check-cli.mjs"`. Continue only when its JSON result
   has `ok: true`; never install or upgrade the CLI silently.

Read `references/cli-workflow.md` before authoring. Treat
`references/cli-contract.json` as the tested inventory of commands this skill
may rely on. Use the narrowest applicable command and preserve its JSON output
until validation and attribution checks are complete.

2. Use `--json` for every agent-consumed command that supports it.
3. For `character create`, provide the required name and use `--selection` only
   to choose an output path. For every other character command, use exactly one
   locator: a name or `--selection`, never both.
4. Search narrowly by character type and query before selecting an exact item.
5. Apply one edit through `character set`, `character set-color`, or
   `character remove`; never hand-edit selection JSON. Validate and resolve
   structured errors before continuing.
6. Preview and inspect the returned PNG when visual review is available.
7. Render only after validation succeeds.
8. For a final render, verify the sheet, `.viewer.html`, metadata, credits TXT,
   and credits CSV, then report the viewer path with the result.

Do not bypass cache integrity, modify `upstream/`, or suppress attribution. Use
`--allow-partial` only when the user explicitly requests or accepts partial
output, states a reason, and the workflow records that reason.
