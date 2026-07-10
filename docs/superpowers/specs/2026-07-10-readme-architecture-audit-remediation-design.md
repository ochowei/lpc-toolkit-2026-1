# README and Architecture Audit Remediation Design

**Date:** 2026-07-10

**Status:** Approved for implementation planning

**Source audit:** `docs/README-ARCHITECTURE-AUDIT.tmp.md` (temporary and not to be committed)

## Goal

Resolve all 15 findings in the temporary README/architecture alignment audit
through a risk-first sequence of small, independently verifiable changes. The
work must restore agreement between documented policy, runtime behavior,
architecture boundaries, CI enforcement, and contributor instructions without
changing sprite composition, public selection semantics, or the editor layout.

This document defines the remediation design. It does not authorize
implementation by itself. The work will be decomposed into the implementation
plans defined below; each plan will divide its batch into test-first tasks and
record commits and verification results.

## Confirmed Decisions

### Export attribution

The standalone PNG action will become a download bundle containing:

- `character-spritesheet.png`
- `credits/credits.txt`
- `credits/credits.csv`

The UI label must describe an image-and-credits download rather than promise a
bare PNG. Separate TXT and CSV actions may remain because they do not create an
unattributed pixel artifact. All files in the bundle must be derived from one
frozen `ComposedSheet`, so the pixels and attribution cannot drift during an
async export.

### Thumbnail attribution boundary

Catalog picker thumbnails are an explicit editor-internal preview exception to
the per-artifact credit rule. A thumbnail canvas does not need its own credit
sidecar, but the editor must keep a reachable attribution surface for the
assets used in the active composition. Any downloadable or otherwise
user-exportable pixels remain subject to mandatory bundled attribution.

### Upstream parity isolation

General web E2E and upstream pixel-parity E2E will be separate CI concerns.
Parity setup must use an isolated checkout at the pinned upstream SHA in
`$RUNNER_TEMP/lpc-toolkit-upstream-parity`, outside the repository's
`upstream/` submodule. Package installation and server-generated files may
occur only in that isolated checkout. The tracked submodule remains read-only
and may be used for source reference and SHA provenance, never as an install
target.

### React cleanup scope

The web architecture cleanup will use small local extractions. `harness.tsx`
remains the top-level editor orchestrator, and existing UI, selection, hash,
token, composition, attribution, and export semantics remain stable except for
the deliberate attribution corrections in this design.

### Automated boundary scope

The boundary checker will enforce only objective dependency rules that can be
tested reliably. It will not enforce file size, hook naming, subjective
responsibility boundaries, or other review judgments through brittle text
heuristics.

## Remediation Strategy

The roadmap is risk-first:

1. Protect and repair documented core usage.
2. Remove unattributed pixel export paths and make displayed credits precise.
3. Stop installing packages in the read-only submodule.
4. Move composition, export, and browser-resource plumbing out of components.
5. Lock the corrected dependency boundaries into tests and CI.
6. Bring README and architecture documentation fully in line with the result.
7. Close every audit finding with recorded evidence.

This order addresses hard-rule violations before general documentation polish.
It also fixes behavior before documenting its final shape and installs stricter
boundary checks after the existing violations have been removed.

## Target Data Flow

### Composition and attribution

The composition result is the sole source of truth for credits:

```text
selection state
  -> useComposedCharacter
  -> ComposedSheet
       -> preview
       -> attribution UI
       -> export workflows
```

`ComposedSheet.credits` contains the credit entries that matched actually
resolved sprite paths. The attribution popover must consume this manifest
instead of reconstructing a broader manifest from every credit row attached to
selected catalog items.

The popover will separate two concepts:

1. **Actual attribution.** Render manifest entries and their corresponding
   `resolvedPaths`; calculate the effective license from that manifest only.
2. **Filter compatibility.** Continue deriving license and animation filter
   warnings from catalog plus selection state, but do not add those catalog
   rows to the attribution manifest.

Manifest entries are deduplicated by credit file. They therefore cannot be
reliably converted back into one row per selected `typeName`. The corrected UI
will display actual credit entries rather than preserve the current inaccurate
selected-item row model.

### Export ownership

Export behavior will be divided as follows:

- A focused React hook owns export execution state, progress, errors, and
  frozen inputs.
- Browser workflow helpers in `packages/web/src/lib/` own canvas encoding, ZIP
  construction, naming inputs, and artifact assembly.
- The browser canvas adapter is constructed outside presentation components.
- `DownloadPopover` renders controls and invokes actions. It does not call
  `toBlob`, construct adapters, assemble ZIP files, or perform object URL
  plumbing.

The basic spritesheet bundle and the four existing ZIP layouts must all use the
credits from the same `ComposedSheet` whose pixels they export.

### Single-item composition

The single-item composition callback currently owned by `harness.tsx` will move
to a focused hook. The hook may depend on catalog, palettes, core APIs, and the
browser adapter. Consumers receive a small action interface for full-item or
specific-layer composition.

This extraction does not change the existing single-item selection or palette
resolution rules.

### Custom overlay lifecycle

A dedicated hook will own custom overlay state and the complete lifetime of its
object URL:

- load and validate the image;
- replace an existing overlay;
- change z-position;
- clear the overlay;
- discard a result that finishes after composition becomes locked;
- revoke the active URL during replacement, cancellation, or unmount.

`harness.tsx` will consume overlay state and actions without calling
`URL.revokeObjectURL` directly.

## Error Handling

- Pixel export is disabled until composition is ready.
- Canvas encoding, ZIP creation, or artifact preparation failure must leave no
  intentionally triggered partial download and must return the UI to a
  retryable state.
- A ready composition with an empty credit manifest may still be previewed for
  diagnosis, but user-exportable pixels must be blocked with a clear error.
- Separate TXT or CSV download actions must report an empty-manifest error
  rather than generating misleading attribution.
- The attribution popover must render a deliberate no-resolved-credits state
  instead of calling effective-license logic with an empty manifest.
- Parity checkout, pinned-SHA validation, dependency installation, or upstream
  server startup failure fails the parity job. The workflow must not fall back
  to installing inside the submodule.

## Work Batches

### Batch A: Executable README core example

**Audit coverage:** Finding 1.

Repair the README example so it uses the exact catalog identity `Body Color`,
uses `recolor` for recolor-backed body and Afro hair assets, loads palette
metadata, and supplies `makeResolvePalette`. Explain the asset base URL without
implying that production callers should use the upstream submodule.

Add an executable contract test using the same selection and palette wiring.
The test must exercise real core composition against controlled fixtures based
on the canonical body, Afro hair, palette, pixel, and credit records. It must
prove that the selected body/hair paths resolve, the result contains visible
pixels, and the credits manifest is non-empty. A string-only README assertion
is insufficient.

**Verification:** core tests and workspace typecheck.

### Batch B: Attribution product contract

**Audit coverage:** Findings 2, 11, and 15.

Add a basic spritesheet bundle workflow, replace the bare PNG UI action, and
make the attribution UI consume `ComposedSheet.credits`. Document the thumbnail
exception and the distinction between preview-only pixels and exported
artifacts.

Tests must prove:

- the basic bundle always contains the PNG and both credit formats;
- all three files use one frozen composed sheet;
- credit entries not matched to resolved paths are absent from the popover;
- effective license is based only on the precise manifest;
- filter incompatibility remains visible without broadening attribution;
- an empty manifest blocks pixel export and is handled safely in the UI.

**Verification:** focused web unit/component tests, download E2E, boundaries,
and workspace typecheck.

### Batch C: Isolated upstream parity

**Audit coverage:** Finding 3.

Remove the upstream server from the general Playwright configuration and keep
the random parity spec under the dedicated parity configuration. The parity
configuration will accept the isolated checkout location through the required
`LPC_UPSTREAM_PARITY_DIR` environment variable. CI will set it to
`$RUNNER_TEMP/lpc-toolkit-upstream-parity`.

CI will materialize the upstream repository at the SHA pinned by
`asset-release.json`, verify the actual checkout SHA, install with its lockfile
in that isolated directory, and run the parity server from there. The existing
toolkit asset preparation and source-SHA consistency checks remain in force.

Configuration tests must prove that general E2E neither starts upstream nor
references `../../upstream`, while the parity path requires an explicitly
validated isolated source.

**Verification:** general E2E, parity E2E, package/config tests, and workflow
inspection.

### Batch D: Local web responsibility extractions

**Audit coverage:** Finding 10.

Extract responsibilities in this order:

1. single-item composer hook;
2. custom overlay lifecycle hook;
3. character export orchestration hook plus browser workflow helpers;
4. presentation-only download popover props and actions.

Each extraction must preserve reducer actions, selection identity, URL hash,
selection tokens, rendered pixels, progress behavior, existing ZIP layouts,
and visible editor layout. Avoid adjacent refactors and retain
`harness.tsx` as the top-level orchestrator.

Lifecycle tests must cover stale async results, frozen export inputs, object
URL replacement and unmount cleanup, retry after export failure, and prevention
of duplicate export execution.

**Verification:** web tests, general E2E, parity E2E, boundaries, and workspace
typecheck.

### Batch E: Boundary checker and CI enforcement

**Audit coverage:** Finding 14.

Extend `scripts/check-boundaries.mjs` and its tests to enforce:

- core cannot depend on presets, web, CLI, React, browser runtime, Node runtime,
  or concrete canvas packages;
- presets cannot depend on web, CLI, React, browser runtime, Node filesystem,
  or concrete canvas packages;
- web components cannot directly import `composeSelections`, the concrete
  browser canvas adapter, or ZIP/export workflow implementations that the
  approved hooks/libs own;
- web continues importing core through the public package entry point.

Every rule needs at least one legal and one illegal fixture. Checks should use
import specifiers and scoped source directories rather than generic word
searches where possible.

Add `pnpm check:boundaries` to the main CI unit job so the command runs on every
push and pull request covered by that job. Keep it in release verification as
well.

**Verification:** boundary checker fixture tests, `pnpm check:boundaries`,
workspace typecheck, and workspace tests.

### Batch F: README and architecture alignment

**Audit coverage:** Findings 4 through 9, 12, 13, the documentation portion of
14, and the approved resolution of 15.

Update README documentation for:

- current CLI package version and non-historical release instructions;
- the current sidebar, splitter, preview, top-bar popovers, and responsive
  layout;
- `/`, `/compose`, and not-found routing;
- the public core API by coherent API category, with `API.md` remaining the
  signature source of truth;
- standard versus custom-animation sheet dimensions;
- first-time asset preparation, pinned downloads, cache reuse, and offline
  behavior;
- the real workspace build behavior for core, presets, web, and CLI;
- repository-relative design reference links only.

Update architecture documentation for:

- CLI pinned manifest/tarball configuration;
- checksum verification, platform cache creation/reuse, and failure handling;
- complete working-directory `assets/` precedence and `assets_custom/`
  overlays;
- directory- and ZIP-backed `AssetStore` ownership;
- ownership of `packages/web/src/catalog/`;
- thumbnail attribution exception and export attribution contract;
- the actual `pnpm check:boundaries` command and its CI role.

Describe the submodule precisely: production assets are materialized through
the pinned local/cache flow, while the submodule remains read-only reference
and provenance material. Isolated parity execution may use a separate checkout;
no documentation may imply that package installation inside `upstream/` is
allowed.

**Verification:** link check, command/version inspection, public export
comparison, and review against the final runtime/configuration state.

### Batch G: Audit closure

Create the Plan 6 closure table outside the temporary audit. It maps findings
1 through 15 to:

- disposition (`fixed` or `documented approved exception`);
- implementation/documentation commit;
- verification command;
- verification result.

Run the complete verification suite:

- `rtk pnpm check:boundaries`
- `rtk pnpm typecheck`
- `rtk pnpm test`
- `rtk pnpm build`
- general web E2E
- isolated upstream parity E2E
- README core example contract test

The temporary audit file remains uncommitted. A finding may not be closed merely
because a broad test suite passes; its specific acceptance criterion must be
recorded.

## Finding Disposition Matrix

| Finding | Disposition | Batch |
| --- | --- | --- |
| 1. Broken README core example | Correct and execute-test the example | A |
| 2. Standalone PNG lacks attribution | Replace with PNG + TXT + CSV bundle | B |
| 3. CI installs inside submodule | Use pinned isolated parity checkout | C |
| 4. Stale CLI maintainer instructions | Update current release guidance | F |
| 5. Outdated desktop layout | Document current production layout | F |
| 6. Incomplete core public API | Update categorized API overview | F |
| 7. Missing app shell/routes | Document current routes | F |
| 8. Inaccurate asset/build description | Document preparation, cache, and builds | F |
| 9. Machine-specific links | Replace with repository-relative links | F |
| 10. Component responsibility leakage | Focused hooks/libs extractions | D |
| 11. Attribution ignores precise manifest | Render `ComposedSheet.credits` | B |
| 12. CLI managed assets undocumented | Document lifecycle and failures | F |
| 13. Catalog/custom asset ownership missing | Document owners and precedence | F |
| 14. Boundary verification incomplete | Expand checker, CI, and docs | E, F |
| 15. Thumbnail attribution ambiguous | Document approved UI-preview exception | B, F |

## Dependencies and Sequencing

- Batch A is independent and should land first because it repairs public usage
  guidance with low architectural risk.
- B and C can proceed independently after A.
- D follows B so it extracts the approved attribution/export behavior rather
  than an obsolete workflow.
- E follows D so the strengthened checker locks in the corrected component
  boundary without first making the current tree permanently red.
- F follows behavior stabilization. Small policy text required by B or C may
  land with those batches, followed by the comprehensive alignment pass.
- G is the final acceptance gate.

Known-bug regression tests follow red-green development within their work
branch. No deliberately failing test-only phase is merged to the main branch.
Passing characterization tests and reusable test infrastructure may be merged
earlier when independently valuable.

## Implementation Plan Decomposition

This roadmap is intentionally broader than one implementation plan. Execute it
through these plan/spec cycles in order:

1. **Plan 1:** Batch A, executable README example.
2. **Plan 2:** Batch B, attribution contract and export behavior.
3. **Plan 3:** Batch C, isolated upstream parity.
4. **Plan 4:** Batch D, local web responsibility extractions.
5. **Plan 5:** Batch E, boundary checker and CI enforcement.
6. **Plan 6:** Batches F and G, final documentation alignment and audit
   closure.

Each plan must verify its own acceptance criteria before the next dependent
plan starts. Plans 2 and 3 are technically independent, but the default
execution order remains risk-first as listed above. The closure matrix belongs
to Plan 6 and must reference the completed plans' commit and verification
records.

## Risks and Mitigations

### Attribution row count changes

Precise manifest display can show fewer rows than the current catalog-derived
UI. This is expected. Assertions should use resolved credit files and licenses,
not preserve the inaccurate historical count.

### Download behavior changes

Replacing a bare PNG with a ZIP changes the interaction contract. Update button
text, filename, success messaging, and E2E expectations together. Do not retain
a hidden unattributed PNG shortcut.

### Parity job cost and reliability

An isolated checkout adds network and install time. Pin the SHA, use the
upstream lockfile, and apply appropriately scoped CI caching. Reliability or
speed problems must not be solved by writing into the submodule.

### Boundary checker false positives

Limit checks to explicit imports and unambiguous runtime references in known
directories. Add legal fixtures before enabling each rule in CI. Subjective
architecture decisions stay in review guidance.

### React lifecycle regressions

Moving async and object URL behavior can introduce stale closures, double
revocation, or export races. Preserve current public props until the new hook is
covered, test cancellation and unmount paths, and retain parity E2E as the pixel
output safety net.

## Non-Goals

- No new dependency, backend, database, authentication system, build tool, or
  framework.
- No modifications inside `upstream/`.
- No license change and no weakening of mandatory export attribution.
- No redesign of the editor layout or design system.
- No change to core selection meaning, hash/token compatibility, sprite layer
  resolution, or composition output.
- No broad cleanup of large React files beyond responsibilities named here.
- No per-thumbnail embedded or sidecar credit artifact.
- No unrelated API redesign or CLI feature work.

## Overall Acceptance Criteria

The remediation is complete when:

1. all 15 findings have an explicit disposition and evidence;
2. no user-exportable pixel path can omit its matching credits;
3. attribution UI reflects the precise composition manifest;
4. no CI or local documented workflow installs packages in `upstream/`;
5. component-level composition/export/browser plumbing identified by the audit
   has moved behind the approved hooks/libs boundaries;
6. the boundary checker enforces the objective dependency rules and runs in
   main CI;
7. README and architecture documentation describe the final repository rather
   than historical behavior;
8. the complete verification suite passes.
