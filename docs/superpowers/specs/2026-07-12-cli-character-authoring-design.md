# CLI Character Authoring Design

## Goal

Make the CLI sufficient for a terminal-oriented game developer to create,
revise, preview, validate, and render one LPC character without manually
writing selection JSON.

The same command contract must remain useful to AI agents and automation. The
first phase therefore uses composable, non-interactive commands rather than a
full-screen wizard.

## Current Assessment

The existing CLI is strong after a selection already exists. It can:

- explore catalog types and items;
- validate selection documents;
- encode and decode Web-compatible selection tokens;
- materialize and render shared presets;
- render sheets, animations, frames, ZIP bundles, metadata, and mandatory
  credit artifacts;
- launch the packaged Web UI against the verified managed asset cache.

The missing part is the authoring loop. A user must currently understand the
selection schema, correlate catalog output with type/name/variant/recolor
fields, edit JSON outside the CLI, and repeat that process for every revision.
Global help also exposes only a command summary, so command-specific options
and valid authoring sequences are difficult to discover.

The CLI is therefore sufficient for an AI agent or a developer already
comfortable with the selection schema, but not yet convenient as a standalone
human character-creation workflow.

## Success Criteria

A terminal-oriented developer who does not know the LPC selection schema can,
using only command help:

1. create a named empty character or start from a shared preset;
2. search compatible catalog items;
3. add, replace, and remove selected items without editing JSON;
4. inspect and validate the current character;
5. generate an attributed representative preview;
6. render the existing full artifact set.

Every mutation is deterministic, scriptable, available through the existing
structured `--json` response contract, and safe against partial file writes.

## Non-Goals

The first phase does not add:

- a full-screen interactive wizard;
- natural-language character generation;
- random generation or seeded randomization;
- batch cast or NPC generation;
- shell completion;
- asset-cache status, repair, or clear commands;
- game-engine-specific atlases or importers;
- a new runtime dependency;
- writes to `upstream/`.

## Considered Approaches

### 1. Composable `character` commands (selected)

Add a thin authoring layer over the existing catalog, preset, selection,
validation, composition, and render capabilities.

This approach serves humans, agents, and scripts through one stable contract.
It is independently testable and does not duplicate core composition or
attribution logic. Asset selection in a terminal will remain less visual than
the Web UI, but the existing `web` command remains available when visual
browsing is preferable.

### 2. Interactive terminal wizard

A wizard could guide first-time users with prompts and menus. It is less useful
for automation, becomes awkward for large searchable catalogs, introduces
terminal compatibility work, and would likely require a new dependency. It is
deferred until the composable authoring primitives exist.

### 3. Delegate authoring to the packaged Web UI

The Web UI offers the best visual selection experience. Treating it as the
only authoring path would leave agents and terminal automation dependent on
manual JSON. The Web UI remains a complementary surface, not the replacement
for a complete CLI workflow.

## Command Interface

The first phase adds:

```text
lpc-toolkit character create <name> [--preset <id>] [--body-type <type>]
lpc-toolkit character list
lpc-toolkit character show <name>
lpc-toolkit character search <name> --type <type> [--query <text>]
lpc-toolkit character set <name> --type <type> --item <item-id-or-type/name>
  [--variant <id>] [--recolor <id>]
lpc-toolkit character remove <name> --type <type>
lpc-toolkit character validate <name>
lpc-toolkit character preview <name>
  [--animation <name>] [--direction <id>] [--frame <index>]
  [--out <directory>]
lpc-toolkit character render <name> --out <directory>
  [--animation <name>]... [--frames <name|all>]...
  [--bundle zip] [--allow-partial]
```

Commands that operate on one existing character also accept
`--selection <path>` instead of the positional character name. Supplying both
forms is an error. `character create <name> --selection <path>` may be used to
choose a non-default output path while keeping `<name>` as selection metadata.

The default character location is:

```text
characters/<name>.selection.json
```

`character list` lists documents from this default directory. It does not scan
arbitrary selection paths.

Each command and subcommand has dedicated `--help` output with options,
defaults, and at least one complete example. Unknown options are rejected with
an actionable error instead of being silently ignored. Existing public command
forms continue to work.

## Architecture

The authoring workflow remains a thin application layer inside
`packages/cli/`. One environment-agnostic default-selection helper is added to
core and consumed by Web, presets, and CLI so their item-pick behavior cannot
drift. This does not move filesystem, Node canvas, or command parsing into
core.

### Shared item defaults

Core exports:

```ts
getDefaultColorSelection(
  item: ItemDefinition | undefined,
  palettes: PaletteMetadata,
): { readonly variant?: string; readonly recolor?: string }
```

The helper follows the Web editor's established priority:

1. If palette-backed recolor swatches exist, return the first recolor.
2. Otherwise, if declared variants exist, return the first variant.
3. Otherwise, return an empty object.

Web keeps its existing `pickDefaults` API as a thin delegation to the core
helper. Shared preset materialization and CLI character editing use the same
helper directly. This preserves current Web and preset output while giving the
CLI identical defaults.

### Character store

The character store:

- resolves a validated character name to the default path;
- accepts an explicit selection path where supported;
- prevents a character name from escaping the `characters/` directory;
- reads and parses the existing `lpc-toolkit.selection.v1` schema;
- writes through a sibling temporary file and atomically publishes the final
  document;
- distinguishes not-found, invalid-document, name-conflict, and write errors.

The selection JSON remains the durable source of truth. No second project
registry or hidden database is introduced.

### Character editor

The character editor is a set of pure operations over parsed selections and
catalog data:

- create an empty selection with a body type;
- materialize a shared preset;
- set or replace exactly one type selection;
- remove exactly one type selection;
- produce suggestions and candidate option data for invalid input.

It does not read files, print output, compose pixels, or silently change other
selected types.

### Character commands

The command layer:

- parses command intent and validates allowed options before preparing assets;
- loads the character through the store;
- uses existing catalog and palette loaders;
- invokes the pure editor;
- validates a candidate selection before publishing a mutation;
- delegates full rendering to the existing render pipeline;
- formats human and structured responses through the existing response
  conventions.

Core remains environment-agnostic. Shared presets remain in
`packages/presets/`. CLI code must not import Web components, hooks, adapters,
or Web-only helpers.

## Authoring Behavior

### Create

`character create hero` creates an empty `male` selection unless
`--body-type` is supplied:

```json
{
  "schema": "lpc-toolkit.selection.v1",
  "name": "hero",
  "bodyType": "male",
  "items": {}
}
```

An empty character is an authoring state, not a promise of useful pixels.
Preview or render reports an actionable incomplete-character error until the
selection can produce output.

`--preset <id>` uses shared preset materialization and writes the resulting
explicit selection. `--body-type` applies to empty creation and is passed into
preset materialization when both flags are present. An unsupported preset/body
combination fails without writing a document.

Create refuses to overwrite an existing character. A later explicit overwrite
feature is outside this design.

### Search

Search defaults to the character's body type and therefore excludes items that
cannot produce a layer for that body type. It returns:

- stable item ID;
- type name and human-readable item name;
- variants and recolors;
- animations;
- license families;
- whether setting the item will replace the character's current selection for
  that type.

`--query` matches item name and item ID case-insensitively. Results use a stable
sort and include a total count. The first phase does not infer subjective
fashion compatibility or cross-slot conflicts that are not represented by
shared domain data.

### Set

`--item` resolves a stable item ID first and also accepts an exact
`type/name`. The resolved item's type must match `--type`.

The command builds a candidate selection, validates body compatibility,
variant, recolor, and sprite path, then publishes it only if valid. When both
`--variant` and `--recolor` are omitted, it applies
`getDefaultColorSelection`. An explicitly supplied value overrides the shared
default and remains subject to `unknown_variant` or `unknown_recolor`
validation.

Variant can alter the resolved PNG path. Recolor never does: it selects a
palette swap after the PNG is loaded. The command therefore never translates
`missing_sprite_path` into `missing_recolor`. If the default or explicit
variant still cannot resolve a sprite, the command preserves the accurate
`missing_sprite_path` error and does not write the selection.

Set replaces only the current selection under the named type. It never clears
another type as a side effect.

### Remove

Remove deletes exactly one selected type. Removing an unselected type is an
error in human mode and a stable structured error in JSON mode, preventing a
misspelled type from appearing successful.

### Show and validate

Show prints the character's path, body type, selected items, variants,
recolors, and validation status. JSON mode returns the selection and validation
issues as structured data.

Validate reuses the existing selection validation path and does not implement
a competing rule set.

## Preview and Rendering

`character preview` generates one representative frame with precise
attribution. Its documented defaults are:

- animation: `walk`;
- direction: `down`;
- frame index: `0`.

If a default or requested value is unavailable, preview fails with the
available animations, directions, or frame range. It does not silently select
a different visual.

Default output:

```text
characters/previews/<name>/
  <name>.preview.png
  <name>.credits.txt
  <name>.credits.csv
  <name>.metadata.json
```

`--out <directory>` replaces this default directory. When the character is
addressed through `--selection <path>` and `--out` is absent, preview writes to
`<selection-directory>/previews/<safe-selection-name>/`. The safe name comes
from selection metadata when present and otherwise from the selection file
stem.

Preview metadata records the source selection path, chosen animation,
direction, frame index, dimensions, effective license, artifact paths, and CLI
version. Preview credits come from the exact composed sheet manifest used for
the pixel output.

`character render` resolves the character document and delegates to the
existing render workflow. Existing animation, frame, ZIP, partial-render,
metadata, transactional publication, and attribution semantics remain
unchanged.

Missing assets remain strict by default for character mutation, preview, and
render. `character render --allow-partial` is the only character workflow that
adopts the Web-like tolerant behavior: missing layers are skipped and emitted
as structured warnings and metadata. Preview never produces a knowingly
partial representative image.

## Errors and Structured Responses

Human errors explain the failed input and the next valid action. Examples:

```text
unknown_item: Unknown item: hair_briad
Did you mean: hair_braid?

unknown_recolor: Unknown recolor: ultraviolet
Available: black, blonde, brown

missing_sprite_path: No sprite path exists for hair/Braid
```

JSON mode keeps the existing envelope:

```json
{
  "ok": false,
  "command": "character set",
  "data": null,
  "warnings": [],
  "errors": []
}
```

Suggestion and available-option details are structured fields rather than text
that an agent must parse. `CliIssue` gains one optional field:

```ts
readonly details?: {
  readonly suggestions?: readonly string[];
  readonly available?: readonly string[];
};
```

The field is omitted when unused, preserving existing `code`, `message`, and
optional `path` consumers.

Stable new error codes include:

- `character_not_found`;
- `character_already_exists`;
- `character_name_invalid`;
- `character_write_failed`;
- `unknown_option`;
- `unknown_item`;
- `item_type_mismatch`;
- `selection_type_not_set`;
- `preview_animation_unavailable`;
- `preview_direction_unavailable`;
- `preview_frame_out_of_range`;
- `preview_incomplete_character`.

## Attribution and License

Every preview and rendered pixel artifact remains accompanied by metadata and
credits derived from the exact `ComposedSheet.credits` manifest. The feature
must not introduce a preview shortcut that bypasses attribution.

The implementation adds no dependency. Existing CLI runtime dependencies
remain `@napi-rs/canvas` (MIT) and `jszip` (MIT), both compatible with the
project's GPL-3.0-or-later license.

## Testing

### Unit tests

- character-name and explicit-path resolution;
- create, set, replace, and remove as pure transitions;
- item-ID and exact type/name resolution;
- body-type, variant, recolor, and item-type validation;
- shared default selection uses recolor first, variant fallback, and empty
  fallback;
- Web and preset default-selection behavior remains unchanged after delegating
  to the shared core helper;
- CLI omitted options use the shared default while explicit options override
  it;
- missing sprite paths remain `missing_sprite_path` and are never mislabeled
  as recolor failures;
- deterministic search sorting and case-insensitive matching;
- suggestion and available-option data;
- command-specific option validation and help generation.

### Integration tests

- default-directory and explicit-path character lifecycles;
- create refuses an existing target;
- failed mutation leaves the original file byte-for-byte unchanged;
- successful mutation is published atomically;
- human and `--json` response behavior;
- preview produces PNG, metadata, TXT credits, and CSV credits from one credit
  manifest;
- character render delegates existing options and artifact behavior;
- existing catalog, selection, token, preset, render, and Web commands do not
  regress.

### Packed-package smoke test

From outside the repository, an installed package completes:

```text
create -> search -> set -> preview -> render
```

The smoke test asserts that output pixels, metadata, and mandatory credit files
are present.

### Verification commands

```sh
rtk pnpm --filter @lpc-toolkit/cli typecheck
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm --filter @lpc-toolkit/core test
rtk pnpm check:boundaries
rtk pnpm --filter @lpc-toolkit/cli test:package
```

Broader workspace checks are required if implementation changes shared package
APIs.

## Delivery Order

1. Add strict hierarchical help and option validation without changing valid
   existing invocations.
2. Add the character store and pure editor transitions.
3. Add the shared core default-selection helper and migrate Web and presets
   without changing their output.
4. Add create, list, show, search, set, remove, and validate commands.
5. Add attributed single-frame preview.
6. Add character render delegation and packed-package workflow coverage.

Each delivery step must preserve the existing selection schema and render
attribution contract.
