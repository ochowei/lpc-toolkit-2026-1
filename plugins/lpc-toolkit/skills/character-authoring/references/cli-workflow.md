# Character Authoring Workflow

Use an explicit selection path when the user has not asked for repository-local
named character storage. `character create` requires a name and may also use
`--selection` solely to choose the output path. For every other character
command, never pass both a name and `--selection`.

## Create

```sh
lpc-toolkit preset list --json
lpc-toolkit character create hero --selection hero.json --preset farmer --json
```

## Search And Edit

Search one type with a narrow text query and a bounded page. Inspect `page` and
fetch another page with its returned `nextOffset` only when the current results
are insufficient. After choosing an `itemId`, fetch its detail and inspect the
exact credits before editing.

```sh
lpc-toolkit character search --selection hero.json --type hair --query braid --limit 20 --json
lpc-toolkit character search --selection hero.json --type hair --query braid --limit 20 --offset <nextOffset> --json
lpc-toolkit catalog item hair_braid --json
lpc-toolkit character set --selection hero.json --type hair --item hair_braid --recolor lpcr.brown --json
lpc-toolkit character set-color --selection hero.json --type expression --channel eyes --color green --json
lpc-toolkit character set-color --selection hero.json --type expression --channel eyes --default --json
lpc-toolkit character validate --selection hero.json --json
```

The search summary provides `itemId`, variants, recolors, animations, license
families, and credit count. Restart at offset zero after changing the catalog
source, custom overlay, query filters, or character selection; offsets only
continue an unchanged result set.

The `catalog item` detail preserves native identifiers in `animations` and adds
`compatibleAnimations` plus `unsupportedAnimations`. Treat a compatible base
as an action the asset can participate in, while retaining the native custom
name when requesting or describing the actual custom animation output.

Use `character set-color` for every color-channel edit instead of changing
`recolor` or `channelRecolors` in JSON. `--color <id>` stores an explicit value;
`--default` clears it. Treat a linked-channel refusal as read-only behavior and
change its source body color if that matches the user's intent. Use `character
remove` only for a currently selected type. Resolve one structured error at a
time, using `details.suggestions` and `details.available`.

## Preview And Iterate

```sh
lpc-toolkit character preview --selection hero.json --out preview --json
```

Require `ok: true`. Open the returned preview artifact when local image viewing
is available. Confirm that preview metadata, credits TXT, and credits CSV are
present before describing the preview as successful.

## Final Render

```sh
lpc-toolkit character render --selection hero.json --out rendered --animation walk --bundle zip --json
```

Require `ok: true`, inspect warnings, and verify the artifact list includes the
sheet, `<name>.viewer.html`, metadata, credits TXT, and credits CSV. Report the
viewer path with the final result. Open the viewer directly from the render
directory when local inspection is available. For ZIP output, verify the same
viewer entry is present and tell the user to extract the complete archive before
opening it so the relative sheet link works offline. Use `--allow-partial` only
after the user explicitly accepts skipped layers or animations; report every
returned warning and skipped layer. The user must state a reason for partial
output, and the workflow must record that reason.

## Output Discipline

- Use `--json` for agent-consumed commands.
- Keep stdout parseable; asset progress belongs on stderr.
- Refine broad search queries instead of dumping the whole catalog.
- Do not hand-edit generated output or bypass CLI validation.
- Do not modify or initialize `upstream/`.
