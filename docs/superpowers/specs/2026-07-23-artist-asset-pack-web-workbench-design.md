# Artist Asset Pack Web Workbench Design

**Status:** Approved

**Date:** 2026-07-23

## Summary

Phase 3 adds a browser-only Asset Pack Workbench at `/asset-packs`. An artist
can upload one Phase 2 `.lpc-assets.zip`, inspect and repair its manifest and
PNG sources, review exact diagnostics and attribution, preview the pack against
the official base assets, acknowledge warnings one at a time, and download a
corrected archive. The artist does not need the repository or the CLI.

The workbench is an upload-and-correction surface, not a blank-pack creator,
full character editor, package registry, or multi-pack conflict manager. Its
state lives only in browser memory. A draft download is the explicit recovery
and handoff mechanism.

Phase 3 also extracts the environment-neutral archive contract from the CLI
into a shared internal workspace package. CLI and Web then enforce the same ZIP
trust boundary, limits, checksum schema, content-digest semantics, and
deterministic output rules. Core remains free of Node, browser, React, ZIP, and
concrete image-decoding dependencies.

## Context

Phase 1 established the source schema, Core validation and compilation,
attributed preview, and linked local authoring workflow. Phase 2 established
deterministic `.lpc-assets.zip` packaging, strict archive inspection,
project-local installation, lifecycle policy, desired-state compilation, and
transaction recovery.

The remaining Phase 3 problem is not merely a file-upload control. A Web
authoring surface must apply the same security and governance guarantees to
untrusted archives that the CLI already applies, while exposing a useful
correction loop to artists who have neither a repository checkout nor a CLI.
Copying the Node archive parser into Web or using the existing general-purpose
browser ZIP loader would create divergent trust boundaries. Importing the CLI
into Web would violate the current package ownership model.

## Goals

1. Let an artist repair and release one asset pack using only a supported
   browser.
2. Upload the Phase 2 archive format without introducing a Web-only manifest.
3. Preserve the Phase 2 archive safety limits, diagnostic semantics,
   deterministic bytes, content digests, and attribution rules across Node and
   browser runtimes.
4. Provide form-based editing for common metadata and governance fields plus a
   focused JSON editor for complex asset structures.
5. Let an artist replace referenced PNG sources and identify missing sources.
6. Validate every in-memory revision and preview only the current compilable
   revision against the official base release.
7. Require individual, reasoned acknowledgement of every warning.
8. Always preserve attribution in preview and output.
9. Provide a structurally safe, explicitly non-installable draft archive once
   the manifest is serializable, even if domain errors remain.
10. Allow a formal archive only after all release gates pass, including a new
    version for substantive changes.
11. Keep authoring state in memory and warn before discarding changes that have
    not been downloaded.

## Non-Goals

- Creating a pack from a blank template.
- Drawing, generating, cropping, or editing pixels in the browser.
- Combining separately submitted animation frames into sheets.
- Embedding the complete character or outfit editor in the workbench.
- Installing, upgrading, removing, or registering packs in the browser.
- Loading or resolving more than one third-party pack.
- Detecting conflicts between independent third-party packs; CLI install and
  doctor retain that responsibility.
- Fetching an arbitrary base asset release from the network.
- Editing checked-in `assets/`, the managed asset cache, or `upstream/`.
- Server storage, accounts, authentication, authorization, sharing, or live
  collaboration.
- IndexedDB persistence, offline PWA support, or automatic cross-session
  recovery.
- A second manifest schema, private browser archive format, or arbitrary extra
  archive entries.
- Automatic warning acknowledgement, acknowledge-all, or generated
  acknowledgement reasons.
- Adding a new third-party dependency.

## Chosen Approach

Create a shared internal package named `@lpc-toolkit/asset-pack-format` and
express its public operations in terms of `Uint8Array`, `DataView`, serializable
values, and injected runtime ports. Move the existing environment-neutral
archive rules into that package. Keep Node filesystem and zlib adapters in CLI,
and add Web Crypto, bounded browser decompression, worker orchestration, image
decode, object URL, and download adapters in Web.

The alternatives were rejected as follows:

- A second Web parser plus shared fixtures would still duplicate security
  logic and permit behavioral drift between fixtures.
- A JSZip-only untrusted reader would not preserve the Phase 2 metadata-first,
  bounded-inflation trust boundary. JSZip remains acceptable for trusted
  deterministic assembly after all output entries are known and bounded.
- Importing CLI code into Web would bring Node and filesystem ownership into a
  browser package and reverse the intended dependency direction.

## Architecture

### Dependency direction

```text
Web ───────> asset-pack-format ───────> Core
CLI ───────> asset-pack-format ───────> Core

Web ───────> Core
CLI ───────> Core
```

`packages/asset-pack-format/` is environment-neutral. It may depend on Core
types and pure decisions. Core must not depend on it. The package must not
import Node modules, React, DOM APIs, filesystem APIs, canvas implementations,
or Vite-only modules.

The shared package is workspace-internal rather than a separately supported
public product. The Web build bundles it through Vite. The public CLI build
vendors its compiled output using the existing workspace-dependency vendoring
strategy, and the packed-CLI smoke test proves that no workspace checkout is
required at runtime.

### Shared asset-pack-format ownership

The package owns:

- archive constants and exact Phase 2 limits;
- EOCD, central-directory, local-header, flag, method, attribute, descriptor,
  ZIP64, overlap, and trailing-data validation;
- strict filename decoding, path validation, and portable canonical collision
  keys;
- encoded, entry, manifest, total, entry-count, and path bounds;
- CRC-32 calculation and validation;
- checksum schema, ordering, coverage, sizes, and SHA-256 comparison;
- immutable bounded repair snapshots and verified payload snapshots;
- archive and content digest construction;
- environment-neutral payload parsing through Core;
- deterministic entry ordering and archive assembly;
- draft status recognition and formal-output rules;
- stable shared diagnostics.

Untrusted ZIP reading remains local metadata parsing over `DataView`; it does
not delegate trust-boundary decisions to JSZip. Deterministic writing may reuse
the repository's existing JSZip version because all writer inputs are already
trusted, bounded, normalized, and sorted. This does not add a third-party
dependency to the repository.

Runtime ports provide only the operations that cannot be implemented safely
and portably in the package:

- asynchronous SHA-256 over bytes;
- bounded raw-DEFLATE inflation that stops before exceeding its declared and
  configured output limits;
- deterministic DEFLATE encoding used by archive assembly, if the shared
  writer cannot own it directly.

The Node adapter uses `node:crypto` and `node:zlib`. The browser adapter uses
Web Crypto and a streaming browser decompression capability inside a worker.
If a browser cannot provide bounded raw-DEFLATE, upload fails with a Web
capability diagnostic. It must not fall back to an inflater that can allocate
unbounded output.

The shared reader distinguishes three outcomes instead of treating every
failure alike:

- `unsafe` returns diagnostics and no entry bytes when archive structure or a
  resource bound cannot be trusted;
- `repairable` returns an immutable, bounded byte snapshot plus diagnostics
  when the ZIP envelope is safe but checksums, payload coverage, manifest, or
  domain content is invalid;
- `verified` returns the fully authenticated payload used by CLI lifecycle and
  formal Web validation.

Web may edit a repairable snapshot but cannot preview or produce a formal pack
from it until current validation succeeds. CLI inspection may report the
repairable diagnostics, while CLI install continues to require `verified` and
therefore preserves the Phase 2 no-staging-on-error behavior.

### Core ownership

Core continues to own:

- strict `lpc-toolkit.asset-pack.v1` parsing and normalization;
- compatibility and semantic-version rules;
- content-digest projection;
- acknowledgement matching and invalidation;
- catalog, base definition, animation, body, layer, palette, and replacement
  decisions;
- deterministic compilation and logical path planning;
- pixel-result validation;
- credit and license completeness;
- attribution union and matching diagnostic semantics.

Core receives bytes, parsed metadata, pixel-inspection values, catalog values,
and injected image/canvas capabilities. It receives no `File`, `Blob`, Worker,
Node `Buffer`, path, filesystem, or browser-global values.

### CLI ownership

CLI retains:

- bounded filesystem reads and containment;
- Node crypto, zlib, and canvas adapters;
- workspace, registry, installed state, and receipts;
- staging, journal, atomic publication, and recovery;
- install, upgrade, downgrade, remove, list, and doctor orchestration;
- terminal and JSON presentation;
- public CLI packaging and workspace dependency vendoring.

The Phase 2 reader and writer become thin Node orchestration around the shared
format package. Existing valid archives, archive bytes, limits, error codes,
digest values, and lifecycle decisions remain compatible. The only new
package-state behavior is explicit draft recognition and rejection.

### Web ownership

Web owns:

- the `/asset-packs` route and landing-page entry point;
- drag-and-drop and file-picker interaction;
- a dedicated asset-pack worker and browser runtime ports;
- in-memory workbench revisions and cancellation;
- manifest forms and the focused advanced JSON editor;
- PNG replacement and missing-source upload slots;
- diagnostics, acknowledgement, credits, and release-gate UI;
- attributed preview controls and temporary browser overlay materialization;
- draft and formal browser downloads;
- route-leave and `beforeunload` protection.

React components render and dispatch. Pure workbench state transitions,
diagnostic grouping, release gating, version suggestions, and editor projection
belong in `packages/web/src/slice/` or focused pure helpers. Hooks own worker
and preview orchestration. Browser-only behavior belongs in adapters or
libraries. The top-level route component coordinates these units without
absorbing their domain logic.

## Archive Contract and Draft Status

### Existing archive contract

The accepted archive root remains:

```text
asset-pack.json
checksums.json
sprites/...
```

Phase 3 preserves the exact Phase 2 limits:

- no more than 4,096 entries;
- `asset-pack.json` no larger than 1 MiB;
- one encoded or decoded entry no larger than 64 MiB;
- encoded entry data and total decoded data no larger than 512 MiB;
- an entry path no longer than 1,024 UTF-8 bytes;
- the existing bounded encoded-archive maximum;
- no ZIP64, encryption, symlinks, non-regular files, unsafe paths, duplicate or
  canonical-colliding paths, inconsistent headers, overlapping ranges,
  unsupported flags, uncovered payloads, or checksum mismatches.

Existing formal pack bytes and digests must not change merely because the
implementation moved to the shared package. Golden Phase 2 fixtures guard this
requirement.

### Draft marker

The strict v1 manifest gains one optional authoring-state field:

```json
{
  "status": "draft"
}
```

The field is absent in every formal pack. There is no `"ready"` value, separate
manifest file, or second schema. Existing manifests remain valid because the
field is optional. Unknown status values remain strict schema errors.

The draft status is excluded from the existing content-digest projection, just
as acknowledgements are excluded. Therefore adding or removing the marker does
not invalidate an acknowledgement. Existing manifests, which omit the field,
retain their Phase 2 content digests.

The CLI handles the status as follows:

- `asset inspect` safely parses the archive, reports draft status, emits a
  stable blocking `asset_pack_draft` diagnostic, and does not report it as
  installable;
- `asset install` rejects it before staging or state mutation, even if the file
  has been renamed;
- `asset doctor` treats any draft discovered in managed installed state as
  unhealthy rather than activating it;
- pack source and formal package commands never emit the marker.

### Draft serialization threshold

Draft download is available once the archive is structurally re-serializable:

- there is exactly one safely decoded `asset-pack.json` JSON object;
- the draft marker can be represented in that object;
- every included filename is safe and unique;
- every included byte payload fits the archive limits;
- the writer can generate complete checksums and deterministic ZIP metadata.

The JSON object may still fail the v1 domain schema or reference missing PNGs.
Those are repairable semantic errors, so the draft can preserve them. Invalid
JSON, a non-object manifest, unsafe archive structure, or an output that would
exceed archive limits must be fixed before any draft is offered.

The draft writer includes the manifest plus safe current payloads below the
allowed sprite root, regenerates checksums, adds `status: "draft"`, and drops
every payload outside the archive contract. Safe unreferenced sprites may be
preserved so unfinished path edits survive re-upload, but remain explicit
diagnostics and block formal output. Re-uploading the draft restores the
current repair state and diagnostics.

## Workbench Route and Layout

### Route loading

`/asset-packs` is a dedicated route. The application must not initialize the
character composer or its full data flow for the landing page, this route, or
404 routes. Workbench base catalog and preview data load only when the route is
active. The landing page gains a clear entry point for browser asset-pack
repair while retaining the CLI authoring and install workflows.

### Entry state

The initial view accepts one `.lpc-assets.zip` or
`.draft.lpc-assets.zip` through drag-and-drop or a native picker. The file is
not persisted. Its declared `File.size` is checked before the file is sent to
the worker, and the worker enforces the encoded bound again over received
bytes.

An unsafe archive displays a report but never creates an editable model. A
structurally safe archive with manifest, checksum, source, schema, pixel, or
governance errors opens in repair mode when its manifest meets the draft
serialization threshold.

### Three-region workbench

Desktop layout uses three stable responsibilities:

1. The left region shows pack identity, overall readiness, diagnostic counts,
   and navigation for Overview, Manifest, Source PNGs, Warnings, and Credits.
2. The center region owns the attributed live preview and its focused controls.
3. The right region shows the editor, source action, acknowledgement form, or
   diagnostic detail for the current left-side selection.

Narrow screens expose the same responsibilities as tabs or stacked views; they
must not squeeze three columns into an unusable viewport. Status is conveyed by
text and icon as well as color. Validation progress is announced through an
accessible live region, editor errors receive focus on explicit navigation,
and all controls remain keyboard-operable.

## Editing Model

### One in-memory pack

The workbench holds exactly one editable pack. It does not create a browser
registry and does not merge another third-party pack. The uploaded immutable
snapshot is retained only for comparison. All edits apply to a separate
in-memory working model containing:

- the editable manifest document and its normalized form when valid;
- current source PNG bytes by canonical source path;
- original archive, content, source, and release fingerprints;
- current diagnostics and exact acknowledgement candidates;
- the identity of the official base release used for validation;
- the current revision number and latest downloaded revision.

Closing, reloading, or leaving the route discards this model. If the current
revision is newer than the latest draft or formal download, route navigation
and `beforeunload` warn about unsaved work. Either kind of successful download
marks that exact revision as recoverable.

### Form and JSON ownership

The Overview form owns common scalar metadata, including ID, display name,
version, and compatibility. Credits has a structured form for authors,
licenses, URLs, and notes. Schema identity is shown but not casually changed.

The advanced JSON editor owns the complex `assets`, layers, sprite uses,
overrides, replacements, and other nested structures that would be cumbersome
or lossy in forms. It edits a defined projection and merges through one pure
manifest-update path, so forms and JSON cannot maintain conflicting copies.
The first implementation uses existing controls and a plain accessible
monospace text area; it does not add an editor dependency.

Acknowledgements are not part of the writable advanced projection. Existing
acknowledgements are visible through the Warnings area. In raw-manifest repair
mode, syntax and schema corrections are accepted, but changes to the
acknowledgements array are rejected with an instruction to use the warning
workflow. This prevents a malformed upload from becoming an acknowledgement
bypass.

### PNG sources

Source PNGs lists every source path referenced by the current manifest and any
safe, allowed uploaded sprite payload that is not referenced. A referenced row
shows its consumers, dimensions when inspectable, digest, and current
diagnostics. The artist may replace its exact path with one PNG.

Changing a source path in JSON creates a missing-source row with an upload
slot. Unreferenced payloads remain visible as errors and may be removed from the
working model; they are never silently included in output. Files are accepted
as opaque bytes until the worker verifies PNG signature, IHDR, CRC, dimensions,
decode, logical frame pixels, palettes, and required source ramps.

## Revision, Validation, and Worker Flow

### State flow

```text
Browser File
  -> encoded-size gate
  -> worker ZIP metadata inspection
  -> safe, bounded per-entry inflation
  -> CRC, checksums, payload coverage, and SHA-256
  -> Core parse and normalization
  -> browser PNG preflight and pixel inspection
  -> Core validation and compilation against official base data
  -> temporary overlay and matched credits
  -> current-revision preview and release gates
```

The worker receives the `File` or a transferred archive buffer and keeps heavy
archive, hashing, decompression, PNG inspection, and deterministic assembly off
the React main thread. It returns serializable progress, diagnostics, verified
metadata, preview materialization results, and output bytes. Main-thread-only
browser capabilities are exposed through narrow adapters when required; they
do not move archive trust decisions into React.

### Revisions and cancellation

Every accepted form, JSON, acknowledgement, or PNG edit increments a monotonic
revision ID. Validation is debounced only enough to combine immediate input and
is otherwise automatic. Starting a new validation cancels superseded work when
possible. Every worker response includes its revision ID, and hooks discard a
response that does not match the current revision even if cancellation arrived
too late.

The UI shows explicit stages such as Inspecting archive, Verifying checksums,
Inspecting PNGs, Compiling preview, Ready, or Needs correction. Errors and
capability failures include stable codes rather than only prose.

### Preview freshness

The center preview represents only the current revision. A revision may preview
when it has no blocking errors and compiles successfully; unacknowledged
warnings do not prevent preview. While the current revision is validating, the
preview shows a pending state. If it fails, the previous image is removed
rather than presented as current output.

The default subject is a fixed standard character. Focused controls may change
body type, animation, direction, and the selected pack asset. The artist may
optionally import canonical character JSON to inspect layer overlap. That
character selection is preview input only: it is neither a second pack nor a
full embedded composer and is not included in the downloaded archive.

The official base catalog, definitions, sprites, palettes, and credits bundled
with the active Web release are the only baseline. The workbench records and
shows that base release identity. A pack may add content or perform only the
explicit replacements allowed by its manifest; arbitrary path shadowing is
never enabled.

## Diagnostics and Acknowledgements

### Diagnostic presentation

Diagnostics have three presentation severities:

- errors block current-revision preview when compilation is unsafe or
  impossible and always block formal download;
- warnings allow preview but require exact acknowledgement before formal
  download;
- informational notes provide guidance without creating a release gate.

Each diagnostic exposes its stable code, complete structured subject, pack and
asset scope, source or destination path where relevant, animation/body/layer
context, and a corrective hint. Sorting is deterministic. Selecting a
diagnostic navigates to the corresponding form field, JSON section, PNG row,
warning record, or credit record.

Unsafe archive diagnostics are terminal for that upload. Safe archive and
domain diagnostics are repairable. Missing or invalid attribution is always an
error and cannot be acknowledged away.

### Exact acknowledgement workflow

Warnings are handled individually. For each current warning, the user must:

1. inspect its full code, subject, scope, and affected content;
2. enter a non-empty human reason;
3. explicitly confirm that one warning.

The workbench persists the exact Core acknowledgement record: diagnostic code,
structured subject, current content digest, and reason. It offers no
acknowledge-all and never invents a reason.

The existing content digest covers substantive normalized manifest content
with `acknowledgements` and `status` omitted plus every source-file digest.
Adding an acknowledgement or toggling draft status therefore does not
invalidate the acknowledgement. Changing a substantive field or source PNG
does. An existing acknowledgement remains accepted only when its exact code,
subject, and content digest still match a current warning. Stale records are
removed from generated output when their warning disappears or their binding
changes.

## Version and Release Governance

### Separate digest purposes

Phase 3 must not overload the acknowledgement content digest with release
version policy. The workbench computes an internal release fingerprint from
the normalized manifest and source digests:

- include credits, acknowledgements, compatibility, assets, replacements, and
  every source digest;
- exclude only `version` and the authoring-only `status` field.

This fingerprint is not a new manifest or archive field. It exists only to
compare the uploaded revision with the current revision. It preserves the
existing content-digest semantics while ensuring that changing an
acknowledgement reason or any other release-relevant content requires a new
version.

### Version gate

Formal download requires a semantic version greater than the uploaded version
when any of these conditions is true:

- current and original release fingerprints differ;
- the upload is marked draft;
- the assembled formal candidate has a different archive digest from an
  uploaded formal archive, even when its release fingerprint is unchanged.

The final rule preserves Phase 2's same-version/different-bytes rejection. An
unchanged uploaded formal pack may retain its version only when final assembly
is byte-identical to the upload. A draft may retain its current version while
editing, but formalizing it always crosses the version gate because no prior
publishable byte identity can be proven from a draft.

The UI proposes the next patch version, such as `1.2.3` to `1.2.4`, but the
artist may select another valid greater version. Merely editing the version
field does not recursively create another change because version is excluded
from the release fingerprint. The CLI remains the authority for conflicts with
an already installed pack and version.

If the uploaded manifest has no valid semantic version, there is no ordered
baseline to increment. The repaired formal candidate must provide a valid
version, but any valid value may establish that first usable release identity.
All other formal gates still apply.

## Attribution and Credits

The preview always renders an adjacent, visible attribution panel derived from
the exact current composition. It unions:

- credits for visible pack-provided sources and destinations;
- credits for visible official base layers;
- additional official layer credits introduced by imported character JSON.

Changing the preview selection updates the matched credit set. Credits are not
detached from preview, hidden behind export, or derived from the dormant
`upstream/` gitlink.

Draft output preserves all current credit data even when diagnostics say it is
incomplete. Formal output requires complete, supported credit and license data
for every physical source and generated logical destination. It reconstructs
the existing canonical manifest and archive credit representation; there is no
Web-only credit sidecar. A formal candidate is validated again after archive
assembly so preview, manifest, checksums, and downloadable bytes refer to the
same attributed revision.

## Download Gates

### Draft download

Draft download is enabled at the draft serialization threshold. It:

- adds `status: "draft"`;
- uses the same normalized or canonicalized manifest JSON rules where the
  available model permits them;
- includes only safe allowed current source bytes;
- regenerates complete sorted checksums;
- produces deterministic ZIP metadata and bytes;
- uses a `.draft.lpc-assets.zip` filename;
- remains rejected by CLI install regardless of filename.

Domain errors, unresolved warnings, missing referenced sources, incomplete
credits, or an unchanged version may remain in a draft and are listed before
download.

### Formal download

Formal download is enabled only when the exact current revision satisfies all
of the following:

- the archive and manifest are structurally valid;
- Core validation and compilation return no errors;
- every current warning has an exact acknowledgement with a non-empty reason;
- PNG, geometry, frame, palette, replacement, and compatibility checks pass;
- attribution is complete and valid;
- the version gate passes;
- the formal candidate omits draft status;
- final assembly, checksum verification, archive inspection, and digest
  verification succeed for the exact bytes to be downloaded.

The workbench never creates a formal archive from a previous valid revision
while later edits are invalid or pending.

## Error Handling

Errors are classified by the boundary that can safely recover:

- file acquisition errors leave the entry view active;
- unsafe ZIP structure aborts the upload and exposes a read-only report;
- safe envelope or checksum errors can open repair mode when the manifest is
  serializable;
- JSON syntax or non-object manifest errors expose raw diagnostics but block
  draft until corrected;
- schema, source, PNG, compilation, warning, version, and credit errors remain
  editable in the workbench;
- browser capability errors explain the missing capability and do not attempt
  an unsafe fallback;
- worker crashes discard transient results, retain the current main-thread
  model where possible, and offer a retry for that revision;
- archive assembly is all-or-nothing, and no download begins until final byte
  verification succeeds.

No failure mutates official assets, browser durable storage, a CLI workspace,
or the originally uploaded `File`.

## Testing Strategy

### Shared package tests

Port the Phase 2 archive suite to the shared package and preserve cases for:

- EOCD, central/local header consistency, methods, flags, descriptors,
  attributes, overlap, trailing bytes, and ZIP64 rejection;
- strict UTF-8 and ASCII filenames, unsafe paths, reserved names, canonical
  collisions, and duplicates;
- entry count, encoded archive, encoded entry, decoded entry, manifest, total,
  and path bounds;
- bounded inflation, declared-size mismatch, trailing DEFLATE data, CRC,
  checksum schema/order/coverage, and SHA mismatch;
- immutable snapshots and input mutation resistance;
- deterministic sorted bytes across insertion order, timezone, Node, and Web
  adapters;
- draft marker parsing, content-digest exclusion, formal omission, and install
  rejection contract.

Existing formal fixtures must produce identical archive bytes and digests
before and after extraction. Shared conformance fixtures run through both Node
and browser adapters and assert equal normalized manifest, content digest,
source digests, archive digest, and shared diagnostics.

### Core tests

Add focused coverage for the optional draft field, strict unknown status
values, normalized reconstruction, content-digest stability, acknowledgement
self-stability, and exact invalidation after substantive edits. Release
fingerprint logic belongs in a pure Web helper unless later consumers require
it; its tests cover every included and excluded field.

### Web unit and integration tests

Test:

- route parsing and lazy workbench loading;
- upload state, repair eligibility, and terminal unsafe archives;
- revision increments, debouncing, cancellation, stale-result rejection, and
  worker retry;
- form/JSON projection round trips and acknowledgement write protection;
- PNG replacement, missing upload slots, and unreferenced-source removal;
- diagnostic sorting, navigation, acknowledgement creation and invalidation;
- release fingerprint and suggested patch behavior;
- draft and formal gate predicates;
- preview freshness and no stale image after an invalid edit;
- matched base-plus-pack attribution;
- unload protection and downloaded-revision tracking;
- worker message serialization and browser capability diagnostics.

### Browser end-to-end and CLI acceptance tests

Use the repository's existing Playwright setup to cover:

1. upload a valid formal pack and preview it with visible credits;
2. open a safe invalid pack in repair mode;
3. repair manifest and missing PNG errors;
4. replace a PNG and observe a new validation revision;
5. acknowledge warnings individually with required reasons;
6. download and re-upload a draft without losing repair state;
7. satisfy version and attribution gates and download a formal pack;
8. inspect and install that formal pack in a clean CLI workspace;
9. prove CLI inspect reports and CLI install rejects the draft;
10. prove no browser workflow reads or mutates `upstream/`, checked-in assets,
    cache state, or an artist workspace.

The handoff runs the narrow package tests while iterating, then relevant
typechecks, `rtk pnpm check:boundaries`, the Web build and E2E workflow, packed
CLI smoke coverage, and `rtk pnpm verify`.

## CLI Documentation Impact

Phase 3 changes CLI-sensitive archive, package metadata, release, and plugin
surfaces. The implementation plan must carry this matrix and reassess it before
handoff:

```text
help: update
cli-readme: update
root-readme: update
landing: update
architecture: update
engineering: update
releasing: update
plugin: update
```

- Help and CLI README document draft inspection, install rejection, and the
  unchanged formal archive contract.
- Root README and landing page present the browser-only correction workflow
  alongside CLI creation, lifecycle, and clean-workspace use cases.
- Architecture records the shared package, runtime ports, Worker trust
  boundary, in-memory model, and attribution flow.
- Engineering maps shared conformance, Worker, Web, CLI acceptance, boundary,
  build, and complete verification commands.
- Releasing records how the internal package is built and vendored into the
  public CLI and bundled into Web without a separate publication stream.
- The lpc-toolkit plugin contract distinguishes CLI source creation from Web
  archive repair and documents draft behavior wherever asset-pack commands are
  surfaced.

## Acceptance Criteria

Phase 3 is complete when all of the following are observable:

1. A user can enter `/asset-packs`, upload one Phase 2 archive, and receive the
   same trust-boundary outcome as CLI inspection.
2. Unsafe archives are never inflated into an editable model.
3. A safe, serializable but invalid pack can be repaired through forms, focused
   JSON, PNG replacement, credits, and warning controls.
4. Every edit validates as a distinct revision; stale async work cannot replace
   current state or preview.
5. Current error-free revisions preview against identified official base data
   with exact visible attribution.
6. A draft archive is deterministic, recoverable by re-upload, carries the
   canonical draft marker, and is rejected by CLI install.
7. A formal archive cannot be downloaded with errors, unacknowledged warnings,
   missing credits, stale preview state, or an unchanged version after a
   substantive release-fingerprint change.
8. The exact downloaded formal bytes pass shared inspection and install in a
   clean CLI workspace.
9. Existing Phase 2 formal fixtures retain their archive bytes, digests,
   limits, diagnostic behavior, and install lifecycle.
10. No new dependency, `any` type, alternate manifest, persistent browser
    store, backend, or mutation of `upstream/`, checked-in assets, or the
    managed cache is introduced.

## Delivery Boundary

This design is one Phase 3 implementation scope with ordered checkpoints: first
extract and prove archive parity, then add draft governance, then browser
runtime ports and worker flow, then the in-memory editing domain, workbench UI,
preview and attribution, downloads, acceptance tests, and documentation. The
implementation plan may divide these into small commits, but it must not split
the security extraction from its cross-runtime parity evidence or expose a Web
download before final-byte validation exists.
