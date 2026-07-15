# CLI Agent Discovery Pagination Design

## Goal

Make single-character discovery through the CLI cheaper and more reliable for
any agent that can invoke shell commands. The CLI remains a deterministic
toolkit: the agent decides which assets fit the user's intent, while the CLI
provides bounded search, complete selection facts, validation, and attribution.

This work uses CLI package version `0.1.4-beta-1` during development. Like the
previous `0.1.3-alpha-1` development version, it is not a tagged or published
prerelease.

## Context

The CLI already provides human and JSON output, stable issue codes, named and
explicit-path character workflows, atomic character edits, validation, preview,
rendering, and mandatory attribution artifacts. Its Codex plugin consumes these
commands through the same public executable available to any shell agent.

Discovery still has two avoidable costs:

- `catalog items` and `character search` may return every match, making broad
  requests expensive for an agent to read.
- `catalog items` omits license summaries, while neither search command is the
  documented source for full credit records. `character search` already returns
  license families and must preserve them.

The design keeps the existing command families and makes their discovery
contract bounded and consistent. It does not introduce an agent-only namespace.

## Non-Goals

- No natural-language character generation or automatic outfit planner.
- No batch cast or game-project pipeline.
- No MCP server, remote catalog service, or machine-readable command schema.
- No change to selection, preview, render, token, preset, or attribution
  semantics.
- No dependency addition and no Node or CLI behavior moved into core.
- No release tag creation or npm publication without separate authorization.

## Command Interface

Extend `catalog items` and `character search` with:

- `--limit <integer>`: return between 1 and 100 items; default `20`.
- `--offset <integer>`: skip a non-negative number of matching items; default
  `0`.
- `--all`: explicitly request every matching item.

`--all` is mutually exclusive with `--limit` and `--offset`. The existing
filters and character locator rules remain unchanged. The old unbounded behavior
remains available through `--all`, but it is no longer the default.

Offset pagination is intentional. The catalog is local, read-mostly, and can be
sorted deterministically, so a readable offset is more useful to an agent than
an opaque cursor. An agent must restart from offset zero if it changes the
catalog source, custom overlay, query filters, or character selection between
pages.

`catalog item <item-id-or-type/name>` remains the second-stage detail command.
It gains the full credit records and compatibility facts needed to inspect one
candidate after bounded search.

## Search Response Contract

The JSON response envelope remains:

```json
{
  "ok": true,
  "command": "catalog items",
  "data": {},
  "warnings": [],
  "errors": []
}
```

Successful `catalog items` and `character search` responses place bounded item
summaries and pagination metadata in `data`. This compact example corresponds
to a request with `--limit 1`:

```json
{
  "items": [
    {
      "itemId": "hair_braid",
      "typeName": "hair",
      "name": "Braid",
      "supportedBodyTypes": ["male", "female"],
      "variants": [],
      "recolors": ["lpcr.brown"],
      "animations": ["walk"],
      "licenses": ["CC-BY-SA"],
      "creditCount": 1
    }
  ],
  "page": {
    "limit": 1,
    "offset": 0,
    "returned": 1,
    "total": 47,
    "hasMore": true,
    "nextOffset": 1
  }
}
```

`licenses` contains the normalized license families used by existing character
search results. Exact license values remain in the full credit entries.
`creditCount` is the number of credit entries for the item, not a count of
authors or licenses.

`character search` items additionally preserve `replacesCurrent` and add
`compatibleBodyType`, whose value is the current character body type. This
means that the candidate has at least one layer for that body type. It does not
claim that every possible variant or recolor is valid; `character set` and
`character validate` retain final authority.

`character search.data.count` remains for compatibility and continues to mean
the total number of matches before pagination. It is equal to
`data.page.total`. `catalog items` does not add a redundant top-level count.

When there is no next page, `hasMore` is `false` and `nextOffset` is `null`.
An offset at or beyond the total is a successful empty page.

## Item Detail Contract

`catalog item` returns the same summary fields for one resolved item plus its
complete normalized `CreditEntry` records:

```json
{
  "item": {
    "itemId": "hair_braid",
    "typeName": "hair",
    "name": "Braid",
    "supportedBodyTypes": ["male", "female"],
    "variants": [],
    "recolors": ["lpcr.brown"],
    "animations": ["walk"],
    "licenses": ["CC-BY-SA"],
    "creditCount": 1,
    "credits": [
      {
        "file": "hair/braid.png",
        "notes": "Braided hairstyle contribution.",
        "authors": ["LPC Contributor"],
        "licenses": ["CC-BY-SA 3.0"],
        "urls": ["https://opengameart.org/content/lpc-hair"]
      }
    ]
  }
}
```

The command exposes existing normalized catalog and credit data. It does not
attempt to predict availability for every variant and recolor combination;
selection validation remains responsible for resolved sprite-path checks.

## Components And Boundaries

Keep command orchestration in `packages/cli/src/catalog-commands.ts` and
`packages/cli/src/character-commands.ts`. Introduce one focused pure discovery
helper inside `packages/cli/src/` that owns:

- query normalization and matching;
- stable item-summary projection;
- deterministic sorting;
- limit/offset slicing and page metadata;
- bounded no-match suggestions.

`character-editor.ts` continues to own catalog-backed compatibility with the
current selection and whether a candidate replaces the current type. It passes
compatible candidates to the shared discovery helper for sorting and paging.

The helper consumes catalog, palette, selection, and normalized credit data
already available to the CLI. It performs no filesystem IO and imports no
browser or React code. Core remains environment-agnostic and does not learn
about CLI pagination or agent response contracts.

## Data Flow

For each search command:

1. Parse and validate pagination option shapes before runtime asset preparation
   whenever the check does not require catalog data.
2. Load the catalog and palettes once through the existing runtime path.
3. Validate catalog-backed filters and return structured suggestions for
   unknown closed-domain values.
4. Normalize the text query by trimming and case-folding it.
5. Match the query against `itemId`, internal name, and display name.
6. Apply catalog filters or character body-type compatibility.
7. Sort by `typeName`, normalized display name, then `itemId`.
8. Compute the total match count and slice the requested page.
9. Project bounded summaries and return page metadata.

Detail lookup resolves exactly one item and projects its summary plus complete
credit entries. Rendering and attribution flows are not involved.

## Errors And Recovery

Input errors return `ok: false`, exit nonzero, and use the existing `CliIssue`
shape:

- a limit outside 1 through 100 or a non-integer limit: `invalid_option` with
  path `--limit`;
- a negative or non-integer offset: `invalid_option` with path `--offset`;
- `--all` combined with `--limit` or `--offset`: `invalid_option`;
- an unknown type, body type, animation, or license filter: the existing or
  focused stable domain error code with bounded `details.suggestions` and
  `details.available` values.

No textual match is not an error. It returns an empty page. If the request
included a non-empty text query, `data.suggestions` may contain at most five
minimal `{ itemId, typeName, name }` candidates. Suggestions rank by the lowest
case-folded edit distance between the query and each candidate's item ID,
internal name, or display name, with the normal stable item order as the tie
breaker. The CLI never silently rewrites the query or chooses an item.

Human output displays only the current page. When another page exists, it ends
with `More results available; rerun with --offset <nextOffset>.` JSON stdout
continues to contain one parseable response envelope, while asset preparation
progress remains on stderr.

## Documentation And Plugin Contract

Update generated command help and `packages/cli/README.md` for the new defaults,
options, JSON fields, two-stage search/detail workflow, and `--all` migration.
The root README changes only if its primary character-authoring quick start
needs the new bounded flags.

Update the Codex character-authoring workflow and tested CLI contract to use
bounded search and to verify summary license families, page metadata, and detail
credits. Because that workflow will rely on the new flags and response fields,
the repository plugin's compatibility declaration and installed-CLI check move
their minimum supported CLI version to `0.1.4-beta-1`. Plugin release versioning
is separate from this CLI development version. Public installation guidance
must not claim that `0.1.4-beta-1` is available from npm.

## Development Version And Later Release

Implementation culminates in setting `packages/cli/package.json` to
`0.1.4-beta-1`, matching the repository's existing `alpha-1` prerelease naming
style. This is a development marker only: implementation does not create or
push `v0.1.4-beta-1`, publish it to npm, or change the release workflows.

A later, separately authorized stable release changes the package version to
`0.1.4`, validates `v0.1.4-rc.1` through the existing cross-platform release
candidate workflow, and publishes only from `v0.1.4`. That release sequence is
outside this design and implementation plan.

## Testing

Pure discovery tests cover:

- matching item ID, internal name, and display name;
- body type, animation, license, and existing catalog filters;
- stable sorting with deterministic ties;
- default, minimum, maximum, offset, empty-page, and `--all` behavior;
- bounded no-match suggestions;
- summary and detail projections without mutation.

Command tests cover:

- exact JSON shapes for both search commands and item detail;
- preservation of `character search.data.count`, `licenses`, and
  `replacesCurrent`;
- human current-page output and next-offset guidance;
- structured errors, exit codes, and stdout/stderr separation;
- invalid pagination options failing before `prepareRuntimeAssets`.

Contract and regression tests cover:

- the Codex plugin's tested command inventory and minimum compatible version;
- unchanged small-result, character mutation, validation, preview, render, and
  attribution behavior;
- CLI version reporting and package metadata at `0.1.4-beta-1`;
- unchanged release workflows and existing release-verifier unit behavior,
  without creating a beta tag.

Implementation verification runs the narrow CLI and plugin checks while
iterating, then:

```sh
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm verify:plugin
rtk pnpm check:boundaries
rtk pnpm verify
```

## Completion Criteria

- A broad search returns at most 20 item summaries unless `--all` is explicit.
- For an unchanged catalog, filters, and character selection, consecutive
  offsets contain no duplicates or omissions.
- An agent can obtain candidate facts with one search and complete attribution
  details with one item-detail command.
- Search summaries contain license families and credit counts; detail contains
  exact normalized credit entries.
- Invalid inputs, empty results, and additional pages all have bounded,
  machine-readable outcomes.
- Preview, render, metadata, credits TXT, credits CSV, and effective-license
  behavior remain unchanged.
- The completed CLI reports version `0.1.4-beta-1`; no beta tag or npm
  publication is created.
