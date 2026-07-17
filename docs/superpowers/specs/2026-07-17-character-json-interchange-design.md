# Character JSON Interchange Design

**Date:** 2026-07-17

**Status:** Design approved; written spec review pending

## Summary

Toolkit Web and CLI will share one canonical character document format:
`lpc-toolkit.selection.v1`. The schema, parser, and serializer will move from
the CLI package into the environment-agnostic core package so both consumers
use the same implementation. A pure compatibility adapter will import the
upstream generator's version 1 and version 2 JSON formats into the canonical
document.

The CLI's structured response envelope remains a command protocol rather than
a character format. Upstream editor state remains an external compatibility
format rather than becoming part of Toolkit's domain model.

## Problem

Three JSON-shaped contracts are currently easy to confuse:

1. The upstream generator exports a versioned editor snapshot. Version 2
   contains selections plus UI settings, URL, rendered-layer metadata, and
   credits. Legacy version 1 contains a URL whose hash encodes selections.
2. Toolkit CLI persists `lpc-toolkit.selection.v1`, a compact document that
   contains only the data required to reconstruct a character.
3. CLI `--json` output wraps command data in
   `{ ok, command, data, warnings, errors }`.

The latter is not a character document, and the upstream snapshot has a
different responsibility from Toolkit's durable selection document. Treating
all three as peer formats would duplicate parsing rules, expose editor-only
state to core, and make Web/CLI compatibility fragile.

## Goals

- Keep `lpc-toolkit.selection.v1` as the one canonical Toolkit character
  document.
- Make the schema, parser, and serializer shared core behavior.
- Let Toolkit Web save JSON that Toolkit CLI can consume without conversion.
- Let Toolkit Web import canonical JSON produced by Toolkit CLI.
- Let Web and CLI import upstream version 1 and version 2 JSON.
- Normalize every newly created, mutated, or saved Toolkit document to the
  canonical schema.
- Preserve atomic behavior: a failed import must not partially change a Web
  character or a CLI file.
- Recompute attribution from the active Toolkit asset source rather than
  trusting imported credits.

## Non-goals

- Exporting Toolkit state back to the upstream generator's JSON schema.
- Round-tripping upstream UI settings, rendered layers, URL, or credits.
- Adding a second Toolkit selection schema version.
- Deprecating hash links or selection tokens.
- Merging an imported character into the current character.
- Importing upstream custom-uploaded image pixels or custom layer state.
- Changing composition, rendering, ZIP, or attribution artifact semantics.
- Initializing or depending on the tracked `upstream/` gitlink.

## Chosen Architecture

### Canonical selection document ownership

`packages/core` becomes the sole owner of the canonical document contract. A
focused selection-document module will export:

- `SELECTION_SCHEMA` with the unchanged value
  `lpc-toolkit.selection.v1`;
- `SelectionJsonItem` and `SelectionJson` types;
- a strict canonical parser that returns core `Selections` plus document
  metadata;
- a serializer that creates a canonical document from core `Selections`.

Moving ownership does not change the serialized shape:

```json
{
  "schema": "lpc-toolkit.selection.v1",
  "name": "hero",
  "bodyType": "male",
  "items": {
    "body": {
      "name": "Body Color",
      "recolor": "light"
    }
  }
}
```

The existing CLI-local duplicate will be removed. CLI production code will
import the public core API directly, so there is no compatibility wrapper that
could later drift.

### Upstream compatibility adapter

A second focused core module will accept already-parsed unknown JSON plus the
active catalog and palette metadata. It will return:

- the canonical selection document;
- the corresponding core `Selections`;
- a source discriminator:
  `canonical | upstream-v1 | upstream-v2`.

The adapter stays pure. It uses no filesystem, browser, URL-location, React,
or Node runtime API. Callers own reading text, parsing JSON, downloading files,
and writing files.

The input flow is:

```text
unknown JSON
    |
    +-- schema = lpc-toolkit.selection.v1
    |      `-- strict canonical parser
    |
    +-- version = 2
    |      `-- upstream selections adapter
    |
    +-- version = 1
    |      `-- upstream URL/hash adapter
    |
    `-- otherwise
           `-- unsupported-format error
```

Core continues to know nothing about the CLI response envelope. The envelope
remains owned by `packages/cli` and may carry a canonical document inside its
existing `data.selection` field.

## Format Detection

Detection is discriminator-based and does not use guess-and-fallback parsing:

- A document with `schema` is parsed only as a Toolkit canonical document.
- A document with `version` is parsed only as an upstream document.
- A document containing both discriminators is rejected as ambiguous.
- A document containing neither discriminator is rejected as unsupported.
- An unknown canonical schema or upstream version is rejected explicitly.

This prevents a malformed canonical document from being reinterpreted as an
upstream document and producing a misleading result.

## Upstream Conversion

### Version 2

An upstream version 2 document must contain a string `bodyType` and an object
`selections`. Each selection entry must contain a string `itemId`.

For each entry, the adapter will:

1. Resolve `itemId` through `catalog.byItemId`.
2. Preserve the upstream selection object's outer key as the canonical
   `typeName`. This also covers upstream recolor sub-selection groups.
3. Verify that the resolved item can be selected in that group.
4. Use the active catalog item's trusted `name`, not the imported display
   name.
5. Normalize null or empty `variant` and `recolor` values to omitted canonical
   fields.
6. Validate non-empty variants against the resolved item's declared variants.
7. Validate non-empty recolors through the active palette metadata.

The adapter ignores upstream `selectedAnimation`, transparency and display
settings, enabled filters, URL, layers, and credits. Those fields do not affect
the canonical character selection.

### Version 1

An upstream version 1 document must contain a valid absolute `url`. The
adapter extracts its hash and passes that hash through the existing core
selection hash parser with the active catalog and palette metadata.

The import remains atomic. Any unresolved hash selection warning causes the
import to fail rather than applying a partial character.

## Validation and Errors

Canonical shape parsing remains strict and preserves current behavior. Import
adds catalog-backed validation before returning a candidate to Web or CLI.
Filesystem-backed asset existence checks remain a CLI concern and continue
after the shared document import step.

Stable import error codes will include:

- `unsupported_selection_format`
- `ambiguous_selection_format`
- `unsupported_selection_schema`
- `unsupported_upstream_version`
- `invalid_upstream_selection`
- `unknown_upstream_item`
- `invalid_selection_variant`
- `invalid_selection_recolor`

Errors contain a human-readable message and, when applicable, a bounded JSON
path identifying the first failing entry. The Web maps these errors to concise
status text. The CLI maps them into its existing structured issue envelope.

Every caller follows the same transaction sequence:

```text
read -> parse JSON -> detect -> convert -> validate full candidate -> apply/write
```

No dispatch or file write occurs before the complete candidate passes.

## Web Experience

The current Token popover will become a **Share / Import** popover so JSON,
links, and tokens are presented as different transport options for one
character rather than separate character models.

The popover contains two sections:

1. **Character JSON**
   - **Save character JSON** downloads `character.selection.json` using the
     canonical serializer.
   - **Import character JSON** opens a JSON file picker and accepts canonical,
     upstream version 1, or upstream version 2 input.
2. **Sharing**
   - Preserve Copy Link, Copy Token, and Paste Token.
   - Describe tokens as a lightweight sharing representation, not as a
     character document.

The popover remains a presentation component. A focused browser library helper
owns text-file reading and Blob download behavior; core owns detection,
conversion, and validation. A successful import dispatches one existing
`apply_selections` action. It replaces the complete selection rather than
merging, after which the existing composition and URL-hash synchronization
flows run normally.

If import fails, the popover leaves the current character unchanged and shows
the first actionable issue. Any later Web save writes canonical JSON regardless
of the imported source format.

## CLI Experience

Any CLI option that identifies an existing selection source file will accept
canonical, upstream version 1, or upstream version 2 input. An option that only
chooses a new output path, such as `character create --selection`, does not
perform import merely because it uses the same option name.

A centralized CLI file-reading boundary will parse text and call the shared
core importer. Existing read-only operations, including show, validate,
preview, render, and token encoding, do not modify an upstream source file.

When a mutation such as `character set` or `character remove` successfully
updates an upstream source file, the existing transactional writer atomically
replaces that file with the canonical document and adds a structured
normalization warning to the command response. Failed mutations leave the
source byte-for-byte unchanged.

All new CLI outputs remain canonical, including named character creation,
preset materialization, token decoding, and any mutation write. CLI `--json`
continues to use the unchanged response envelope, with canonical selection
documents in the established data fields.

## Attribution

Imported upstream `credits` and `layers` are not trusted or propagated. They
may describe a different asset revision or contain stale rendered-layer
information.

After conversion, Toolkit resolves and composes the canonical selections using
the active asset source. Matching credit metadata therefore continues to flow
from the active catalog through preview, render, download, and attributed
export paths.

The canonical JSON is a selection document, not a rendered sprite artifact or
a replacement for attributed export bundles. Its selected type names, item
names, variants, and recolors preserve the identity needed to recompute credits.
Existing sprite exports continue to include their required TXT/CSV credit
artifacts without semantic changes.

## Testing

### Core tests

- Move the existing canonical parser and serializer contract tests into core.
- Prove canonical parse/serialize round trips without changing JSON shape.
- Cover upstream version 2 item resolution, recolor sub-groups, trusted catalog
  names, and null/empty normalization.
- Cover upstream version 1 URL/hash import.
- Reject unknown formats, ambiguous discriminators, unsupported versions,
  unknown item IDs, and invalid variants or recolors.
- Prove editor-only fields, layers, and imported credits never enter the
  canonical document.

### Web tests

- Import a CLI-produced canonical fixture.
- Import an upstream fixture and save it back as canonical JSON.
- Prove invalid input does not dispatch or change the current character.
- Exercise the file-reading and Blob-download seams without browser globals in
  pure tests.
- Add one browser E2E flow that saves a character, changes the selection,
  imports the saved file, and observes full restoration.

### CLI tests

- Read a Web-produced canonical fixture through representative validate, show,
  and render paths.
- Prove read-only upstream operations leave the input bytes unchanged.
- Prove a successful mutation atomically normalizes upstream input and returns
  a warning in human and `--json` modes.
- Prove failed conversion or validation leaves the input byte-for-byte
  unchanged.
- Preserve existing response-envelope contract coverage.

Tests use small checked-in or inline fixtures. They do not initialize, read, or
execute the tracked `upstream/` gitlink.

## Verification

Implementation verification will include:

```sh
rtk pnpm --filter @lpc-toolkit/core run typecheck
rtk pnpm --filter @lpc-toolkit/core test
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm --filter @lpc-toolkit/web test
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm check:boundaries
rtk pnpm --filter @lpc-toolkit/web test:e2e
rtk pnpm verify
```

## CLI Documentation Impact

```text
help: update
cli-readme: update
root-readme: update
landing: N/A — landing tutorial does not document selection-file interchange
architecture: update
engineering: N/A — commands and CI/verification mapping remain unchanged
releasing: N/A — package installation, versioning, and publication do not change
plugin: N/A — plugin command workflow continues to use canonical selection files
```

Web English and Traditional Chinese strings will be updated for the Share /
Import labels, actions, success status, and failure status.

## Completion Criteria

1. Web and CLI serialize the same unchanged `lpc-toolkit.selection.v1` schema.
2. Each can consume canonical JSON produced by the other.
3. Both can import upstream version 1 and version 2 documents.
4. Import and mutation failures never partially apply or overwrite data.
5. Read-only CLI commands never rewrite upstream input.
6. Successful CLI mutations normalize upstream input atomically and report it.
7. Attribution is recomputed from the active asset source and rendered exports
   retain required credit artifacts.
8. Normal build and verification workflows remain independent of `upstream/`.
9. The focused tests, boundary check, Web E2E, and full verification gate pass.
