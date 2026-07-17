# CLI Animation Asset Audit Design

**Date:** 2026-07-17

## Summary

Add a dedicated, read-only `lpc-toolkit catalog audit-animations` command for
asset authors who want to identify incomplete animation support and turn the
result into a drawing worklist. The command accepts an explicit set of target
standard animations, inspects the CLI's active runtime asset store and catalog
definition overlay, and reports both logical capability gaps and the physical
sprite files or frames that need attention.

The command does not change catalog selection, composition, rendering,
attribution, or export behavior. It adds no dependency and never writes to the
asset source.

## Goals

- Find catalog items that do not support one or more user-selected standard
  animations.
- Produce the most precise drawable file requirements available from current
  LPC path conventions, including layer, body type, and physical variant.
- Distinguish an undeclared animation from a declared animation whose PNG is
  missing.
- Warn when an animation's referenced direction or frame is fully transparent.
- Preserve enough context in JSON for scripts to generate task lists or reports.
- Use the same active asset store and catalog-definition overlay precedence as
  normal CLI render operations.

## Non-goals

- Requiring every asset to support every registered animation.
- Auditing arbitrary external asset roots in the first version.
- Auditing custom oversized animation names as explicit targets.
- Generating, modifying, repairing, or copying sprite files.
- Treating every transparent frame as an error.
- Changing the existing `catalog items`, `catalog item`, render, or validation
  contracts.

## Command Contract

```sh
lpc-toolkit catalog audit-animations \
  --animation walk \
  --animation run \
  [--type weapon] \
  [--body-type male] \
  [--json]
```

`--animation` is repeatable and at least one value is required. Duplicate
values are removed while preserving the registered animation order. Each value
must be a registered standard logical animation. Unknown values fail before the
scan and use the CLI's existing bounded suggestion format.

`--type` and `--body-type` optionally narrow the scan. Their validation and
spelling follow `catalog items`. The command deliberately has no pagination:
an audit produces one complete report for its selected scope.

The command always reads the runtime assets resolved by the CLI. Catalog
definitions use the active base definitions plus the `assets_custom`
definition overlay; sprite bytes come from the same runtime `AssetStore` used
by rendering. It does not accept a new asset-root option or invent a separate
custom-sprite precedence rule.

## Capability Semantics

For each selected item and target animation, the audit classifies capability as
one of the following:

- **Native:** the item declares the target in `animations`.
- **Compatible:** a registered custom animation supplies the target through its
  standard base, such as `wheelchair` supplying `sit`.
- **Unsupported:** neither the native nor compatible set supplies the target.

This reuses the same defaulting rule as composition and catalog detail: a
missing or malformed `animations` array uses `ANIMATION_DEFAULTS`, while an
explicit empty array remains empty.

Compatibility prevents false work items. For example, an item whose registered
custom animation already supplies `sit` is not reported as missing `sit` merely
because `sit` is absent from its native list.

## Architecture and Responsibilities

### Core planning

Core owns a pure animation-audit planner. It receives a catalog, target standard
animations, and optional type/body-type scope. It expands items into logical
requirements without importing Node, filesystem, browser, React, or concrete
canvas APIs.

The planner owns:

- native, compatible, and unsupported classification;
- logical-animation to physical-folder mapping;
- item layer, body-type, and physical-variant expansion;
- expected relative sprite path construction;
- physical-path deduplication with preservation of all consumers;
- marking requirements whose path cannot be inferred safely.

The existing resolved-layer model will expose the source layer number or key so
audit output can name `layer_1`, `layer_2`, and so on. This is additive metadata
for diagnostics and does not change resolution or composition behavior.

Core returns immutable audit-plan records. It does not test file existence or
decode pixels.

### CLI inspection

CLI owns the new command parser entry, runtime orchestration, Node-backed file
inspection, PNG decoding, bounded concurrency, response construction, and
human-readable formatting.

The CLI resolves each planned relative path through the same runtime
`AssetStore` used by rendering. Catalog record precedence remains base records
followed by matching `assets_custom` definition records. This audit does not
make `assets_custom/spritesheets` a new runtime source.

### Existing validator

The current Core asset validator already contains related standard-folder and
path-construction rules. Implementation should share the new pure planning
helpers where this removes duplication without changing validator behavior.
Existing validator tests remain regression coverage; this work is not a broad
validator redesign.

## Requirement Expansion

The planner evaluates only body types actually supported by each layer. When
`--body-type` is provided, it evaluates only that body type. Otherwise it uses
the existing registered body-type order.

An item with physical `variants` creates a requirement for each variant file.
An item without physical variants creates the unqualified `.png` requirement.
Runtime recolors do not create additional PNG requirements: recolors are
derived from a source sprite. Findings include the recolor names that depend on
the source so an artist understands the downstream impact without being asked
to draw duplicate recolor files.

Requirements are deduplicated by resolved physical path, animation, and frame
geometry. The record retains every consuming item, layer, body type, and variant
so one missing shared PNG is one drawing task rather than several duplicates.

For a declared or compatible animation, its physical path is exact. For an
unsupported standard animation, the planner may infer a proposed path from an
ordinary layer's established LPC directory convention. Such a requirement has
`pathConfidence: "inferred"`. If the item has only custom-animation layers,
contains an unresolved selection-dependent path placeholder, or has another
layout that makes a standard path unsafe to infer, `expectedPath` is omitted,
`pathConfidence` is `"manual-review"`, and a specific `manualReviewReason` is
required.

## Inspection and Classification

The CLI processes the plan in three stages:

1. Unsupported targets become `unsupported` findings. The CLI does not probe a
   hypothetical inferred path because the catalog does not declare it as an
   active asset.
2. Declared and compatible requirements are resolved against the active asset
   source. A path that cannot be found becomes a `missingFiles` finding.
3. A found PNG is decoded and only cells referenced by the planned source
   geometry are scanned. Native targets use their standard animation geometry;
   compatible targets use the geometry of the registered custom animation that
   supplies the standard base. Fully transparent referenced cells become
   `blankFrames` warnings.

Repeated source indices in an animation cycle are scanned once. Padding and
unused cells are ignored. Direction and frame identifiers in findings are the
logical identifiers an asset author needs to locate the cell. Source row and
column are always included; a logical direction is included when the planned
geometry defines one.

An unreadable or corrupt PNG is recorded in `errors` with its path and consumer
context. It does not masquerade as a missing file and does not stop unrelated
items from being inspected.

## JSON Output

The result remains inside the CLI's standard success response envelope. Its
data has this conceptual shape:

```json
{
  "targets": ["walk", "run"],
  "scope": {
    "typeName": "weapon",
    "bodyType": "male"
  },
  "summary": {
    "itemsScanned": 120,
    "incompleteItems": 34,
    "unsupported": 28,
    "missingFiles": 3,
    "blankFrames": 5,
    "errors": 0
  },
  "unsupported": [],
  "missingFiles": [],
  "blankFrames": [],
  "errors": []
}
```

Finding granularity is fixed:

- `unsupported` contains one record per item and target animation, with a
  nested `requirements` array for its affected layers, body types, and
  variants;
- `missingFiles` contains one record per resolved physical path, animation, and
  source geometry, with a nested `consumers` array;
- `blankFrames` contains one record per resolved physical path, logical
  animation, and source row, with all blank frame indices in that row;
- `errors` contains one record per failed physical-path inspection.

The corresponding summary values are the lengths of these final deduplicated
arrays. Every unsupported finding includes:

- item ID, type name, and target animation;
- native and compatible animation context;
- a `requirements` array whose records contain affected layer, body types,
  physical variant, and dependent runtime recolors;
- an optional expected relative path on each requirement;
- `pathConfidence` of `inferred` or `manual-review` on each requirement;
- a required reason whenever a requirement needs manual review.

Every missing-file finding includes the exact active-source relative path and
all consumers. Every blank-frame finding additionally includes all blank
logical frame indices, the source cell coordinates, and the logical direction
when one exists. Every inspection error includes a stable error kind, message,
path, and consumers.

All arrays use deterministic ordering by type, item, animation, path, layer,
body type, and variant as applicable. Summary counts are derived from the final
deduplicated findings. `incompleteItems` counts distinct items that appear in
`unsupported`, `missingFiles`, or `blankFrames`; inspection-only `errors` are
reported separately.

## Human-readable Output

Human output begins with the target set and summary, then groups findings by
item. It favors a drawing worklist over reproducing the complete JSON structure:

```text
Animation audit: walk, run
Scanned: 120 items
Incomplete: 34 items

weapon_ranged_bow_normal
  unsupported: run
  expected:
    spritesheets/weapon/ranged/bow/normal/universal/background/run/light.png
  layer: layer_1
  body types: male, female, muscular, pregnant, teen
  variant: light

body_example
  blank frames:
    walk/down: 3, 4
```

Manual-review findings state why no path was proposed. Inspection errors appear
after drawing findings so a partial audit remains useful.

## Exit and Error Behavior

Finding unsupported animations, missing files, or blank frames is a successful
audit. The command exits successfully and reports the findings. This makes it
suitable for building worklists without treating expected incompleteness as an
operational failure.

Invalid command arguments, unknown filters, or failure to load the catalog or
active asset source fail the command before or during orchestration using the
existing CLI error envelope. A failure to inspect one PNG is captured in
`errors`, and the remaining scan continues.

The first version does not add `--fail-on` policy. Automation can inspect the
JSON summary and choose its own threshold.

## Performance and Safety

The CLI uses a small fixed concurrency limit for file reads and PNG decoding so
a full catalog scan cannot create an unbounded image-memory spike. It caches
inspection results by resolved physical path and geometry, and it releases
canvas/image references after recording the required findings.

The command is read-only. It never creates placeholder files, modifies custom
assets, initializes `upstream/`, or writes inside the official cache. It does
not bypass or weaken credit metadata. Because it produces no rendered pixel
artifact, it does not create a new attribution export; item identity remains in
the report so authors can inspect existing catalog credits separately.

## Testing

### Core tests

- repeated target removal and registered animation ordering;
- native, compatible, and unsupported capability classification;
- default handling for absent, malformed, and explicitly empty animation lists;
- physical folder aliases including `combat_idle`, `backslash`, `halfslash`,
  and virtual animation mapping;
- layer, body-type, and variant expansion;
- physical-path deduplication with complete consumer context;
- runtime recolors recorded as dependents rather than PNG requirements;
- manual-review output for custom-only and unresolved selection-dependent
  paths;
- unchanged existing composition and asset-validator behavior.

### CLI tests

- one or more required `--animation` flags;
- unknown animation, type, and body-type diagnostics;
- type and body-type filtering;
- base and `assets_custom` catalog-definition precedence;
- runtime `AssetStore` path resolution matching normal render behavior;
- missing file, referenced blank frame, unused transparent padding, corrupt PNG,
  and partial inspection failure;
- deterministic human-readable and JSON output;
- deduplicated summary and incomplete-item counts;
- unchanged `catalog items` and `catalog item` behavior.

### Verification

Implementation verification will include:

```sh
rtk pnpm --filter @lpc-toolkit/core run typecheck
rtk pnpm --filter @lpc-toolkit/core test
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm --filter @lpc-toolkit/cli build
rtk pnpm --filter @lpc-toolkit/cli test:package
rtk pnpm check:boundaries
rtk pnpm verify
```

## CLI Documentation Impact

```text
help: update
cli-readme: update
root-readme: N/A — specialized asset-authoring audit, not a primary quick start
landing: N/A — no landing-page workflow change
architecture: N/A — existing Core planning and CLI filesystem boundaries remain unchanged
engineering: N/A — repository verification and CI commands do not change
releasing: N/A — no package or publication workflow change
plugin: N/A — character-authoring plugin does not perform asset production audits
```

This matrix must be reassessed before implementation handoff as required by
`AGENTS.md`.
