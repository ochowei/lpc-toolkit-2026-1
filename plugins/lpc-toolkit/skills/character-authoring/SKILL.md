---
name: lpc-character-authoring
description: Use when creating, editing, validating, previewing, or rendering LPC characters through the installed lpc-toolkit CLI. Do not use for unrelated image editing or non-LPC sprites. Use lpc-animation-asset-audit for source-asset animation audits and drawing worklists.
---

# LPC Character Authoring

Use `lpc-toolkit` as the only source of catalog, selection, validation, render,
and attribution behavior.

Use lpc-animation-asset-audit for source-asset animation audits and drawing worklists.

1. Read `references/compatibility.md`. Resolve this installed skill directory
   to an absolute path named `SKILL_DIR`, then run
   `node "$SKILL_DIR/scripts/check-cli.mjs"`. Continue only when its JSON result
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
