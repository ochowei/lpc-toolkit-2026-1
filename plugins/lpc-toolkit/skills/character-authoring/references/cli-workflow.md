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

Search one type with a narrow text query. Read the returned `itemId`, variants,
recolors, animations, and licenses before editing.

```sh
lpc-toolkit character search --selection hero.json --type hair --query braid --json
lpc-toolkit character set --selection hero.json --type hair --item hair_braid --recolor lpcr.brown --json
lpc-toolkit character validate --selection hero.json --json
```

Use `character remove` only for a currently selected type. Resolve one
structured error at a time, using `details.suggestions` and `details.available`.

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
requested pixels plus metadata, credits TXT, and credits CSV. Use
`--allow-partial` only after the user explicitly accepts skipped layers or
animations; report every returned warning and skipped layer. The user must
state a reason for partial output, and the workflow must record that reason.

## Output Discipline

- Use `--json` for agent-consumed commands.
- Keep stdout parseable; asset progress belongs on stderr.
- Refine broad search queries instead of dumping the whole catalog.
- Do not hand-edit generated output or bypass CLI validation.
- Do not modify or initialize `upstream/`.
