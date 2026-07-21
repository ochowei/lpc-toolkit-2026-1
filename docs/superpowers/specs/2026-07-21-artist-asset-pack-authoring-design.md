# Artist Asset Pack Authoring Design

**Status:** Approved design

**Date:** 2026-07-21

## Summary

Add a CLI-first asset-pack workflow that lets an artist extend LPC assets with
only the public `lpc-toolkit` CLI. The artist does not clone this repository,
initialize `upstream/`, or edit the managed asset cache. They work in a small
project-local artist workspace, maintain a simplified `asset-pack.json` plus
complete animation PNGs, validate and preview those sources, synchronize them
into a generated custom overlay, and later distribute them as installable
`.lpc-assets.zip` packages.

The same pack schema and pure validation/compilation rules will support a later
Web authoring surface. Core owns environment-independent contracts and domain
decisions. The CLI owns filesystem access, PNG inspection, ZIP handling,
workspace state, package installation, and atomic publication.

## Context

The repository currently has four relevant capabilities:

- a pinned, verified CLI asset cache that removes the need for a repository
  checkout after first use;
- an `assets_custom/` definition overlay concept;
- an animation audit that distinguishes unsupported capability, exact missing
  files, blank frames, and inspection errors;
- catalog, composition, animation, recolor, validation, and attribution logic
  in environment-agnostic Core.

These pieces do not yet form a safe artist workflow. An artist would need to
understand internal sheet definitions and credit files, manually choose paths,
and manage collisions and removal without package ownership metadata. The
current public CLI also does not provide asset workspace, pack validation,
preview, synchronization, packaging, installation, upgrade, or removal
commands.

## Goals

1. Let an artist use only the public CLI in a clean directory, without cloning
   this repository.
2. Support both adding animations to existing catalog items and creating new
   items through one asset-pack format.
3. Keep the artist-authored format simpler than the internal sheet-definition
   format.
4. Accept complete LPC animation PNGs in v1; do not require artists to edit an
   atlas or provide separately named frames.
5. Connect existing animation audit reports to bounded pack scaffolding without
   weakening finding semantics.
6. Preserve exact attribution for every physical file and every render,
   preview, download, and export.
7. Detect path, item, version, definition, and package ownership conflicts
   before publication.
8. Make synchronization, install, upgrade, and removal transactional and
   recoverable.
9. Keep the schema and pure compilation rules reusable by a future Web UI.

## Non-Goals

- Editing or generating pixel art.
- Combining separately submitted frame PNGs into animation sheets in v1.
- Modifying the pinned base cache, checked-in `assets/`, or `upstream/`.
- Global user-level installation in v1; installation is project-local.
- A public package registry, marketplace, remote dependency resolver, package
  signing, authentication, or authorization.
- Automatically rebasing a patch when its base definition changes.
- Silently repairing audit inspection errors or guessing paths marked
  `manual-review`.
- Replacing the current internal `ItemDefinition` or `CREDITS.csv` formats.
- Adding a new dependency. Any later dependency proposal requires approval and
  a compatible-license review.

## Chosen Operating Model

The selected model separates artist source, installed package state, and
generated runtime output:

```text
artist source       validate/preview/sync       generated overlay
artist-packs/  --------------------------------> assets_custom/
      |
      +-------------------- pack ----------------> *.lpc-assets.zip
                                                       |
                                                       +---- install
                                                               |
                                                               v
                                                    .lpc-toolkit/asset-packs/
                                                               |
                                                               +---- compile
                                                                       |
                                                                       v
                                                               assets_custom/
```

This hybrid model keeps the authoring loop fast while retaining explicit
package identity, versioning, ownership, conflict handling, upgrade, and
removal.

## Standalone Artist Workspace

An artist creates a workspace with:

```sh
lpc-toolkit asset workspace init ./my-lpc-art
```

The default layout is:

```text
my-lpc-art/
├── lpc-asset-workspace.json
├── artist-packs/
├── assets_custom/
└── .lpc-toolkit/
    └── asset-packs/
        ├── registry.json
        ├── installed/
        ├── validation/
        └── staging/
```

`lpc-asset-workspace.json` marks the workspace root and records schema version
plus configured source and output directories. Commands resolve it by walking
upward from the current directory, with an explicit `--workspace` override for
automation.

The CLI owns `assets_custom/` only when it created the directory and its
management marker. Workspace initialization refuses a non-empty unowned output
root. Synchronization and installation refuse to adopt or overwrite unowned
files. This protects existing projects with manually maintained custom assets.
Such projects must select a new generated output root or migrate explicitly in
a separate future workflow.

The managed cache supplies base assets. The first command that needs base
catalog data or pixels prepares the pinned cache through the existing verified
cache lifecycle. Valid cache reuse remains offline. Workspace creation itself
does not require the cache.

Git is optional. Teams may commit `lpc-asset-workspace.json` and
`artist-packs/`; generated output and `.lpc-toolkit/` remain reproducible local
state unless a project deliberately chooses another policy.

## Package Source Layout

An artist-authored pack is the canonical editable source:

```text
artist-packs/acme.fantasy-hair/
├── asset-pack.json
└── sprites/
    ├── moon-braid/
    │   ├── foreground/
    │   │   ├── walk.png
    │   │   └── climb.png
    │   └── background/
    │       ├── walk.png
    │       └── climb.png
    └── hair-messy-child-climb.png
```

Artists edit only the manifest and files below `sprites/`. They do not place
source PNGs directly in the managed cache or generated overlay.

## Architecture

### Core ownership

`packages/core/` will own pure asset-pack behavior:

- source schema types and strict parsing;
- normalized pack types;
- pack and local ID validation;
- namespaced item identity;
- existing-item patch modeling;
- new-item modeling;
- base definition digest checks;
- deterministic patch merging;
- logical path planning;
- physical-file consumer aggregation;
- credit inheritance and full-file override rules;
- conflict and replacement decisions;
- geometry expectations derived from registered animations;
- diagnostic types and stable diagnostic codes;
- compile-plan output.

Core receives parsed data, catalog data, palette metadata, file metadata, and
pixel-inspection results through values or ports. It does not import Node,
React, DOM APIs, concrete canvas implementations, ZIP libraries, or filesystem
APIs.

### CLI ownership

`packages/cli/` will own:

- workspace discovery and initialization;
- reading and writing artist pack sources;
- audit-report selection and scaffolding;
- managed-cache preparation;
- PNG decoding and pixel inspection through the existing Node canvas adapter;
- validation report presentation and JSON envelopes;
- temporary preview overlays;
- attributed preview publication;
- package archive creation and inspection;
- archive safety enforcement;
- project-local registry and installed source storage;
- staging and atomic overlay publication;
- upgrade and removal orchestration;
- progress on stderr and machine-readable results on stdout.

### Web ownership

A later Web phase will own browser file picking, ZIP decoding, temporary browser
asset materialization, preview UI, warning acknowledgement UI, and download.
It will consume the same Core schema and decisions and will not create a second
manifest format.

### Overlay asset loading

The CLI needs an overlay-capable `AssetStore` implementation that resolves a
validated logical custom path before the base directory or ZIP store. The
overlay map comes from the compiled registry rather than arbitrary path
fallback. A custom file may shadow an existing physical base file only when the
compile plan contains explicit authorized replacement intent.

Core still receives only an injected image loader. The overlay implementation
stays in CLI, with an equivalent browser adapter added only in the Web phase.

## Asset Pack Schema

The source schema identifier is:

```text
lpc-toolkit.asset-pack.v1
```

Unknown major versions and unknown v1 fields are errors. Strict unknown-field
handling prevents misspelled artist input from being silently ignored.

### Pack metadata

```json
{
  "schema": "lpc-toolkit.asset-pack.v1",
  "id": "acme.fantasy-hair",
  "version": "1.0.0",
  "displayName": "ACME Fantasy Hair",
  "credits": {
    "authors": ["Alice"],
    "licenses": ["CC-BY-SA 4.0"],
    "urls": ["https://example.com/acme/fantasy-hair"],
    "notes": ""
  },
  "assets": []
}
```

Pack IDs use lowercase ASCII segments separated by dots or hyphens. Local asset
IDs use lowercase kebab-case. Versions use semantic-version syntax. The CLI
normalizes JSON property ordering for package output but does not rewrite the
artist source during read-only commands.

Credit authors and licenses must be non-empty. License values must be supported
by Core's existing `License` domain and remain compatible with the repository's
GPL-3.0-or-later and upstream LPC obligations. URLs may be empty only when the
source has no public URL; the artist must then provide explanatory notes.

### Extending an existing item

```json
{
  "kind": "extend-item",
  "itemId": "hair_messy",
  "baseDefinitionDigest": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "addAnimations": [
    {
      "animation": "climb",
      "layers": [
        {
          "layer": "layer_1",
          "bodyTypes": ["child"],
          "source": "sprites/hair-messy-child-climb.png",
          "destination": {
            "path": "spritesheets/hair/messy/child/climb.png",
            "evidence": "audit-inferred",
            "accepted": true
          }
        }
      ]
    }
  ]
}
```

An extension stores only its delta. It does not copy the complete base
definition. `baseDefinitionDigest` is computed from the normalized active
baseline definition, excluding the package manager's own generated overlay.
Compilation fails if the baseline changes.

Destination evidence is one of:

- `audit-exact` for an exact `missingFiles.path`;
- `audit-inferred` for an inferred unsupported requirement;
- `artist-specified` for a manually supplied destination supported by catalog
  geometry;
- `manual-review` when the audit cannot infer an exact path.

`audit-inferred` requires an acknowledgement while retaining its original
confidence. `manual-review` cannot be converted into a destination merely by
setting `accepted`; the artist must resolve and record a separate
`artist-specified` decision.

### Creating a new item

```json
{
  "kind": "new-item",
  "localId": "moon-braid",
  "displayName": "Moon Braid",
  "typeName": "hair",
  "bodyTypes": ["male", "female", "teen"],
  "animations": ["walk", "climb"],
  "layers": [
    {
      "id": "foreground",
      "zPos": 120,
      "sprites": [
        {
          "animation": "walk",
          "source": "sprites/moon-braid/foreground/walk.png"
        },
        {
          "animation": "climb",
          "source": "sprites/moon-braid/foreground/climb.png"
        }
      ]
    }
  ],
  "recolor": {
    "material": "hair",
    "palettes": ["ulpc", "lpcr", "all.lpcr"]
  }
}
```

The generated item ID and definition basename are deterministic:

```text
<pack-id>--<local-id>
```

For the example, both are `acme.fantasy-hair--moon-braid`. The item ID is an
opaque catalog identity, not a filesystem destination. Generated sprite paths
are namespaced separately by pack and asset so a new item does not collide with
base or other package files.

The compiler also writes the namespaced identity into internal
`ItemDefinition.name` and writes the artist label into `display_name`. This is
required because current character selections persist `typeName` plus `name`,
not only the definition filename-derived item ID. A pack upgrade may change the
display label, sprites, or destinations, but it may not change pack ID, local
ID, or the resulting internal name without creating a new asset identity.

Simple templates create one layer, one variant, and no recolor. The v1 schema
also supports optional multiple layers, body-specific sprite entries, variants,
and existing recolor metadata. The CLI's `--advanced` scaffold exposes these
fields without requiring every artist to see them.

Asset-level `bodyTypes` are inherited by every layer and sprite entry unless a
child entry narrows the set. A child may not broaden its parent's set. The
normalized form expands every effective body-type set before validation and
compilation, so downstream behavior never depends on implicit inheritance.

Semantic source layer IDs such as `background` and `foreground` are compiled
deterministically into internal `layer_N` fields. The compiler assigns numbers
after sorting by declared z-position and source declaration order. It records
the mapping in compile metadata so diagnostics and upgrades remain stable.

### Complete animation PNGs

Every v1 sprite source is a complete PNG for one logical standard animation,
layer, body-type group, and optional variant. Expected rows, columns,
directions, and required logical frames come from the registered animation
configuration. The artist does not hardcode atlas offsets.

Runtime recolors are dependent outputs and never require additional PNGs.

### Credits and file overrides

Pack credits apply to every source file unless a complete override exists:

```json
{
  "creditOverrides": {
    "sprites/moon-braid/foreground/climb.png": {
      "authors": ["Alice", "Bob"],
      "licenses": ["CC-BY-SA 4.0"],
      "urls": ["https://example.com/bob/climb-contribution"],
      "notes": "Climb animation contributed by Bob."
    }
  }
}
```

Overrides replace the entire credit record rather than merging individual
fields. Compilation emits credit records keyed to every logical destination.
Shared physical files produce one credit record and retain every consumer.

For a new item, the effective credit record is the pack default or its complete
file override. For an existing-item extension or authorized base replacement,
the effective record is the deterministic union of the active baseline item's
credit records and the pack contribution record. A file override replaces only
the pack contribution portion; it can never erase inherited authors, licenses,
URLs, or notes. Audit scaffolding records a baseline-credit digest alongside
the definition digest, and compilation fails on credit drift until the artist
reviews a new scaffold. This preserves attribution for derivative animation
work while still adding the new artist's contribution.

### Replacement declaration

Cross-package replacement requires an exact declaration:

```json
{
  "replaces": [
    {
      "packId": "acme.fantasy-hair",
      "versions": ">=1.0.0 <1.1.0",
      "assets": ["moon-braid"]
    }
  ]
}
```

This grants no general overwrite permission. The compiler verifies current
owner, version range, asset identity, logical destinations, and credit change.
Replacing an existing base physical file likewise requires explicit base
replacement intent and matching baseline digest.

## Audit Report Scaffolding

`asset init --from-audit` reads one complete structured audit report and
requires a bounded item/category selection. It validates `ok`, command name,
target, scope, all four finding arrays, and top-level errors before use.

Phase 1 supports:

- `unsupported`: preserve every nested requirement, body type, layer, variant,
  recolor dependency, consumer, expected path, and confidence;
- `missingFiles`: use the exact active-source relative path and preserve every
  consumer.

It does not turn runtime recolors into separate PNG tasks. A shared physical
path becomes one source entry with multiple consumers.

`blankFrames` requires replacing an existing physical source and safely
carrying forward its credits and unchanged pixels. Automatic extraction and
repair scaffolding is deferred from Phase 1; the command returns a stable
`finding_not_scaffoldable_v1` diagnostic. `errors` are never converted into
drawing work.

Audit scaffolding never mutates source assets, the managed cache, or
`upstream/`.

## Validation Model

Validation occurs in four layers.

### Contract validation

- schema and strict fields;
- pack ID, local ID, generated item ID, and version;
- source paths remain inside the pack root;
- unique local asset and source identities;
- complete credit records;
- supported licenses and URLs/notes policy.

### Catalog validation

- existing target item and base digest;
- registered type, animation, body type, layer, material, palette, and variant;
- new-item identity and type conflicts;
- nested patch merge conflicts;
- path consumers and replacement authorization.

### Pixel validation

- file exists and is a regular file inside the pack root;
- PNG decoding succeeds;
- width, height, rows, columns, and directions match registered geometry;
- required logical frames contain non-transparent pixels;
- optional transparent frames are reported separately;
- multi-layer geometry is compatible;
- configured recolor source ramps occur as required.

### Governance validation

- every physical source resolves to one complete credit record;
- final logical destinations resolve to matching generated credit records;
- licenses are supported and compatible;
- package and path ownership is unambiguous;
- replacement scope is exact;
- registry and desired-state digests agree.

## Diagnostics and Warning Acknowledgements

Diagnostics contain stable code, severity, message, pack, asset, source path,
logical destination, item/type/animation/body/layer context, and structured
details where relevant.

Blocking error codes include:

- `asset_pack_schema_invalid`
- `asset_pack_id_invalid`
- `asset_source_missing`
- `asset_png_decode_failed`
- `asset_geometry_mismatch`
- `asset_required_frame_blank`
- `asset_credit_missing`
- `asset_license_invalid`
- `asset_base_definition_changed`
- `asset_path_conflict`
- `asset_replacement_unauthorized`
- `asset_output_root_unowned`
- `asset_digest_mismatch`
- `asset_archive_unsafe`
- `asset_publish_failed`

Warning codes include:

- `asset_path_inferred`
- `asset_optional_frame_blank`
- `asset_partial_body_coverage`
- `asset_partial_animation_coverage`

Errors always block sync, pack, install, and publication. Warnings require an
exact acknowledgement bound to diagnostic code, structured subject, and pack
content digest. The content digest covers the normalized manifest with its
`acknowledgements` array omitted plus every source-file digest. Adding the exact
acknowledgement therefore does not invalidate itself, while changing any
substantive manifest field or source PNG does. There is no broad `--force` or
`--ignore-warnings` option.

The validation JSON response includes the exact acknowledgement record an
artist may persist in the source manifest's top-level `acknowledgements` array.
Each record contains code, structured subject, content digest, and a non-empty
human reason. Interactive helpers may add that record after confirmation;
automation must provide the exact record. Packaging requires persisted
acknowledgements so a consumer can reproduce the decision.

## CLI Command Surface

### Workspace and scaffolding

```text
lpc-toolkit asset workspace init <directory>
lpc-toolkit asset init --new [options]
lpc-toolkit asset init --from-audit <report.json> [selection options]
```

`init --new` creates a simple template by default and an advanced template with
`--advanced`. `init --from-audit` preserves report evidence and never infers an
unsupported selection from truncated output.

### Authoring

```text
lpc-toolkit asset validate <pack-directory> [--json]
lpc-toolkit asset preview <pack-directory> [--asset <local-id>]
  [--animation <name>] [--body-type <type>] [--character <selection.json>]
lpc-toolkit asset sync <pack-directory>
```

Preview uses a fixed standard body by default and accepts a character JSON for
layer-overlap testing. It builds a temporary overlay and publishes an
attributed preview artifact without changing active workspace state.

Sync adds or updates a development link in the project-local registry and then
rebuilds the desired overlay from every active linked and installed pack. The
registry distinguishes `linked` source directories from `installed` archive
sources. Removing a linked pack from active state never deletes its artist
source.

### Distribution and lifecycle

```text
lpc-toolkit asset pack <pack-directory>
lpc-toolkit asset inspect <pack.lpc-assets.zip> [--json]
lpc-toolkit asset install <pack.lpc-assets.zip>
lpc-toolkit asset list [--json]
lpc-toolkit asset remove <pack-id>
lpc-toolkit asset doctor [--json]
```

Installing the same pack ID at a newer version is an upgrade. Downgrade or
cross-package replacement requires explicit compatible manifest intent.
`doctor` verifies registry digests, installed sources, generated output, credit
coverage, and ownership without mutating state.

All commands use existing CLI response envelopes. JSON results go to stdout;
progress and human diagnostics go to stderr when stdout must remain
machine-readable.

## Authoring and Package State

The authoring state is conceptual and digest-backed:

```text
Workspace -> Draft -> Validated -> Previewed -> Synced -> Packed
```

Any substantive manifest or source-file change alters the pack content digest,
invalidates validation, preview, sync, and package receipts, and returns the
pack to Draft. Adding an acknowledgement for that same content digest does not
alter the content digest, but validation must run again to confirm that the
warning is now acknowledged. Preview is optional before sync but remains part
of the recommended artist workflow. Sync and pack always perform fresh
validation rather than trusting only a prior exit code.

An install transaction is:

```text
read archive
-> enforce archive bounds and safe paths
-> verify manifest and checksums
-> stage normalized installed source
-> compute complete desired registry state
-> compile all active packs
-> verify definitions, pixels, and credits
-> atomically publish overlay and registry
```

Removal computes the desired state without the target package, recompiles all
remaining packages, and publishes atomically. It deletes only manager-owned
installed and generated files. It never deletes artist source, base assets, or
another package's content.

## Generated Overlay and Registry

The generated `assets_custom/` contains definitions, logical sprites, merged
custom credit data, and a manager marker. Registry records include:

- pack ID, version, display name, and source kind;
- linked source path or installed source directory;
- normalized content digest, acknowledgement records, and source-file digests;
- generated definition and sprite ownership;
- logical destination ownership;
- replacement relationships;
- baseline definition digests;
- generated credit records;
- last successful compile digest.

The compiler treats base catalog plus any explicitly configured unmanaged
custom source as the baseline. Manager-owned generated output is excluded from
baseline digest calculation to avoid self-drift. Multiple disjoint patches to
one item compile into one deterministic final definition. Patches that modify
the same semantic field or physical destination conflict unless an authorized
replacement orders them.

Desired packs are processed in stable pack-ID and asset-ID order. Generated
JSON, credits, indexes, and archive entries use deterministic ordering.

## Package Archive

The `.lpc-assets.zip` archive contains:

```text
asset-pack.json
checksums.json
sprites/...
```

`asset-pack.json` is normalized. `checksums.json` records SHA-256 for every
payload file. Archive entries are sorted and use deterministic metadata so the
same normalized source produces identical bytes.

Archive inspection rejects:

- absolute, drive-qualified, backslash, empty, dot, or parent paths;
- canonical-path collisions and duplicate entries;
- entries outside the allowed manifest, checksum, and sprite roots;
- more than 4,096 entries;
- a manifest larger than 1 MiB;
- one entry larger than 64 MiB;
- total uncompressed content larger than 512 MiB;
- symlink or non-regular-file entries;
- checksum omissions, extras, or mismatches.

Expected animation geometry is checked before allocating full pixel buffers.
Archive extraction always targets a newly created staging directory inside the
workspace's managed state.

## Transaction and Recovery Guarantees

Sync, install, upgrade, and removal never publish incrementally. They build a
complete sibling staging output, validate it, fsync or close all files as
required by the platform adapter, then atomically exchange managed output and
registry state. If any pre-publication step fails, current output remains
unchanged.

If a platform cannot atomically exchange both directories in one primitive,
the CLI uses a small journal with old/new generation IDs and completes or rolls
back on the next command. `asset doctor` reports and repairs only these
manager-owned interrupted transactions; it does not adopt unknown files.

## Compatibility

### Schema compatibility

- Unknown major schema versions fail.
- Unknown v1 fields fail.
- Additive compatible behavior requires a newer explicit schema capability,
  not silent interpretation.
- Packs may state a minimum CLI version and asset schema capability.

### Base asset compatibility

Existing-item patches record active baseline definition digest and source
release identity. A changed definition produces
`asset_base_definition_changed`. Automatic rebase is deferred. Artists create a
new pack version after reviewing a fresh audit and scaffold.

New items do not pin the complete base release, but every referenced type,
animation, body type, material, and palette must exist in the active runtime.

### Character compatibility

Pack ID plus local asset ID determines stable item identity. Upgrades cannot
silently change that identity. Removing a pack leaves character JSON parseable;
catalog validation reports the missing item. Physical destination changes do
not change selection identity.

### Attribution compatibility

Runtime composition merges base credits and compiled custom credits before
selection. Preview, render, frame, sheet, viewer, and ZIP publication continue
to consume the frozen composed credit manifest. Custom thumbnails retain only
the existing narrow editor-internal thumbnail exception.

## Testing Strategy

### Core tests

- strict schema parsing and normalization;
- pack/local ID and namespaced identity;
- new and extension models;
- deterministic baseline digest and drift;
- disjoint and conflicting patch merge;
- physical consumer aggregation;
- credits inheritance and full override;
- inherited baseline-credit drift and contribution union;
- replacement authorization;
- geometry planning from registered animations;
- warning acknowledgement invalidation;
- acknowledgement self-stability when only the acknowledgement array changes;
- deterministic compile plan.

### CLI integration tests

Use fresh temporary workspaces plus small checked-in attributed fixtures. Tests
must not require network access, a repository checkout in the simulated artist
workspace, or initialized `upstream/`.

- workspace initialization and output ownership refusal;
- simple and advanced new-item scaffolds;
- bounded unsupported and missing-file audit scaffolds;
- valid and invalid PNG inspection;
- default-body and character-JSON attributed previews;
- linked-pack sync and re-sync after source changes;
- deterministic archive bytes and checksums;
- install, upgrade, replacement, list, remove, and doctor;
- multi-pack disjoint merge and true conflicts;
- stale baseline definition failure;
- missing or incompatible credits failure;
- interrupted staging and publication rollback;
- no writes to cache, checked-in assets, or upstream.

### Security tests

- traversal and absolute ZIP paths;
- duplicate canonical paths;
- entry, per-file, manifest, and total-size bounds;
- symlink and non-file entries;
- checksum omission, extra entries, and mismatch;
- PNG decode and dimension bombs;
- registry tampering and output ownership mismatch;
- staging cleanup and safe retry.

### End-to-end acceptance

In a clean directory with only the compatible public CLI installed:

```text
create workspace
-> prepare managed base assets when first required
-> scaffold hair_messy climb from an audit report
-> add the complete child climb PNG
-> create a new moon-braid item
-> validate both packs
-> preview on a standard body and a supplied character JSON
-> sync both packs
-> pack them
-> install in a second clean workspace
-> render with complete base and custom credits
-> upgrade one pack
-> remove it without damaging the other pack
```

The same-scope animation audit must confirm intended unsupported or missing-file
findings disappear after external art work, rather than relying only on command
exit status.

## Delivery Phases

### Phase 1: local artist workflow

- Core source and normalized schemas;
- pure patch merge, credits, conflict, and compile plan;
- workspace init and discovery;
- new and audit-based scaffolding;
- validation and attributed preview;
- linked-pack synchronization;
- overlay asset loading;
- clean no-repository acceptance case.

Phase 1 supports local creation and preview. Teams may share source directories,
but formal archive installation is not complete.

### Phase 2: package lifecycle

- deterministic pack and inspect;
- project-local install and registry;
- upgrade and explicit replacement;
- list, remove, and doctor;
- archive bounds and security checks;
- transaction journal and recovery;
- clean second-workspace acceptance case.

### Phase 3: Web authoring surface

- upload the same archive format;
- browser validation and temporary overlay;
- errors, warnings, acknowledgement, and credits UI;
- attributed preview;
- corrected pack download;
- no alternate manifest format.

Each phase requires a separate implementation plan. Phase 3 may require its own
design review once concrete UI behavior is in scope.

## CLI Documentation Impact

The implementation plan must reassess this matrix before handoff:

```text
help: update
cli-readme: update
root-readme: update
landing: update
architecture: update
engineering: update
releasing: N/A — no npm or pinned base-asset publication procedure changes
plugin: N/A — the current animation audit skill remains read-only; any asset-authoring skill requires a separate design
```

Help and CLI README must document every new command, stdout/stderr behavior,
workspace resolution, output ownership, and warning policy. Root README and the
landing page must show the no-repository artist workflow. Architecture must
record Core/CLI/Web ownership and overlay/registry decisions. Engineering must
map focused tests, boundary checks, conditional asset checks, and complete
verification.

## Success Criteria

- A public-CLI-only artist can create, validate, preview, sync, and package
  assets without cloning this repository.
- Artist-authored PNGs live only below the pack's `sprites/` source root.
- Both existing-item animation extensions and new items use the same schema.
- Generated identities and output are deterministic.
- Unsupported, missing-file, blank-frame, and inspection-error audit semantics
  remain distinct.
- Runtime recolors are not treated as source PNGs.
- Every physical file retains all consumers and exact attribution.
- Base assets, managed cache contents, and `upstream/` are never modified.
- Path conflicts never resolve through implicit last-write-wins behavior.
- Failure never leaves a partially published overlay or registry.
- Core remains environment-agnostic and passes the architecture boundary gate.
- The future Web surface can reuse the same normalized schema and validation
  decisions.

## Deferred Work

- Frame-by-frame source import and sheet assembly.
- Safe blank-frame repair scaffolding that extracts an attributed base source
  into artist space.
- Automatic patch rebase after a base definition changes.
- Global installation, remote dependencies, signing, registries, and
  marketplaces.
- A Codex asset-authoring skill; the existing animation audit skill remains
  intentionally read-only.
