---
name: lpc-character-authoring
description: Use when creating, editing, validating, previewing, or rendering LPC characters through the installed lpc-toolkit CLI. Do not use for unrelated image editing or non-LPC sprites.
---

# LPC Character Authoring

Use `lpc-toolkit` as the only source of catalog, selection, validation, render,
and attribution behavior.

1. Read `references/compatibility.md`, resolve this skill directory, and run
   `node scripts/check-cli.mjs`. Continue only when its JSON result has
   `ok: true`; never install or upgrade the CLI silently.
2. Use `--json` for every agent-consumed command that supports it.
3. Start from a named character or explicit `--selection` file, never both.
4. Search narrowly by character type and query before selecting an exact item.
5. Apply one edit, validate, and resolve structured errors before continuing.
6. Preview and inspect the returned PNG when visual review is available.
7. Render only after validation succeeds.
8. Verify metadata, credits TXT, and credits CSV before reporting success.

Do not bypass cache integrity, modify `upstream/`, or suppress attribution. Use
`--allow-partial` only when the user explicitly requests or accepts partial
output, states a reason, and the workflow records that reason.
