---
capability: sprite-composition
title: Sprite composition
status: current
direction_objectives:
  - PD-CAP-INTERFACE-PRODUCT-001
  - PD-CAP-CONTRACT-CLI-001
  - PD-CAP-COMP-PRODUCT-001
  - PD-CAP-GUIDANCE-AGENT-001
  - PD-CAP-OPERATIONS-CLI-001
  - PD-CAP-COMP-WEB-001
  - PD-CAP-COMP-PRODUCT-002
  - PD-CAP-COMP-AGENT-001
  - PD-CAP-COMP-CLI-001
  - PD-OPT-INTERFACE-WEB-001
  - PD-GRD-GENERATION-PRODUCT-001
  - PD-GRD-INDEPENDENCE-WEB-001
  - PD-GRD-COMP-PRODUCT-001
  - PD-GRD-COMP-PRODUCT-002
  - PD-GRD-INDEPENDENCE-PRODUCT-001
  - PD-GRD-AUTHORITY-WEB-001
  - PD-GRD-INDEPENDENCE-PRODUCT-002
  - PD-GRD-OFFLINE-PRODUCT-001
  - PD-GRD-NETWORK-PRODUCT-001
  - PD-GRD-ATTR-PRODUCT-002
  - PD-GRD-ATTR-PRODUCT-003
  - PD-GRD-AUTHORITY-AGENT-004
  - PD-GRD-PROVIDER-PRODUCT-005
  - PD-GRD-CLOUD-PRODUCT-001
  - PD-EVO-TRANSPORT-AGENT-001
---

# Sprite composition

## Purpose

Sprite composition lets humans and Agents discover existing attributed LPC
catalog assets, maintain a character selection, preview the result, and render
portable attributed character output. The CLI is the stable direct operational
interface, Agent integrations guide the same public workflow, and the Web
Composer provides an optional interactive visual interface.

This capability composes existing catalog art. It is distinct from animation
remediation and new asset authoring.

## Scope

### Supported

- Bounded catalog discovery and exact item inspection.
- Named or explicitly located character selections.
- Catalog-backed selection, replacement, removal, color, and validation
  operations.
- Standard and supported custom-animation composition.
- Attributed previews, full renders, and Web exports.
- Canonical character-selection interchange between supported Web and CLI
  surfaces.
- CLI and Agent-guided composition without depending on the hosted Web
  application.
- Local composition after a supported runtime asset source is available.
  Preparing the pinned runtime source may require an explicit bounded network
  operation.

### Excluded

- Creating or replacing source sprite pixels.
- Modifying, releasing, installing, or publishing asset packs.
- Animation remediation and new asset-authoring workflows.
- Treating an Agent or the Web Composer as visual-acceptance, attribution, or
  release authority.
- A guarantee that first-use asset preparation is strictly offline.
- A required account, hosted backend, cloud store, or automatic synchronization
  service.
- Exact UI wording, incidental catalog ordering, internal module layout, exact
  output filenames, and current deployment or publication channels.

## Requirements

### REQ-COMP-001 — Discover attributed catalog assets

The CLI and Agent-guided composition workflow MUST expose bounded catalog
discovery and exact item inspection, including supported compatibility,
license, and attribution information needed to make a selection.

#### Scenario: Inspect a candidate before selection

- GIVEN a supported runtime catalog
- WHEN a human or Agent searches a character type and inspects a returned item
- THEN the result identifies the item, its selectable properties, animation
  compatibility, license information, and matching catalog credits

##### Evidence

- Owner: `packages/cli/src/catalog-commands.ts`
- Verification: `packages/cli/test/catalog-commands.test.ts` — `filters items by search, body type, animation, and license family`
- Verification: `packages/cli/test/catalog-commands.test.ts` — `returns summary licenses and complete item credits`

### REQ-COMP-002 — Maintain a validated character selection

The CLI MUST let a human or Agent create, inspect, edit, remove from, and
validate a character selection through public character operations. An invalid
edit MUST NOT replace the last valid selection.

#### Scenario: Reject an invalid edit without mutation

- GIVEN an existing valid character selection
- WHEN an edit produces a catalog-incompatible candidate
- THEN validation reports an actionable error and the stored selection remains
  unchanged

##### Evidence

- Owner: `packages/cli/src/character-commands.ts`
- Verification: `packages/cli/test/character-commands.test.ts` — `creates, sets, searches, shows, validates, removes, and lists a named character`
- Verification: `packages/cli/test/character-commands.test.ts` — `does not write an invalid set candidate`

### REQ-COMP-003 — Preserve selection interoperability

Supported Web and CLI surfaces MUST read the supported character-selection
schemas and MUST produce the canonical current selection document when saving
or normalizing a selection. Read-only consumption MUST NOT rewrite the source
document.

#### Scenario: Move a character selection between interfaces

- GIVEN a supported character selection
- WHEN it is saved by one supported interface and opened by another
- THEN the selected assets, body type, variants, and supported color-channel
  choices remain equivalent

##### Evidence

- Owner: `packages/core/src/selection-document.ts`
- Owner: `packages/web/src/lib/selection-sharing.ts`
- Verification: `packages/core/test/selection-document.test.ts` — `reads v1 but serializes only the canonical v2 shape`
- Verification: `packages/web/e2e/character-json-interchange.spec.ts` — `saved canonical JSON restores the complete Web selection`
- Verification: `packages/cli/test/character-commands.test.ts` — `shows upstream input as canonical without rewriting the source`

### REQ-COMP-004 — Compose selected catalog layers deterministically

For the same supported catalog, runtime pixels, and character selection, the
composition engine MUST resolve and render the same applicable layers,
variants, authored color choices, and supported standard or custom animations
in their declared visual layering.

Unsupported or unresolved layers MUST NOT be substituted with unrelated catalog
art.

#### Scenario: Compose standard and custom animation layers

- GIVEN a supported selection whose items include standard and custom-animation
  layers
- WHEN the selection is composed
- THEN the output contains the applicable layers and supported animation regions
  with the selected variants and colors

##### Evidence

- Owner: `packages/core/src/compose.ts`
- Verification: `packages/core/test/compose.test.ts` — `resolves both standard and custom animation layers from the same item`
- Verification: `packages/core/test/compose.test.ts` — `composes the wheelchair block below a real body and re-lays its sit frames`
- Verification: `packages/core/test/compose.test.ts` — `applies recolor via options.resolvePalette before drawing (A2)`

### REQ-COMP-005 — Attribute the pixels actually composed

Every successful preview, render, download, or export containing composed
catalog pixels MUST keep matching credit information reachable with those
pixels. Credits MUST describe successfully composed source paths rather than
unselected or failed layers.

An interface MUST NOT export composed pixels when it cannot provide the required
attribution.

#### Scenario: Export pixels with matching credits

- GIVEN a composition with successfully resolved catalog layers
- WHEN a supported interface publishes or downloads its pixels
- THEN the output includes or accompanies matching credit metadata for the
  successfully composed source paths

##### Evidence

- Owner: `packages/core/src/credits.ts`
- Owner: `packages/web/src/lib/spritesheet-export.ts`
- Verification: `packages/core/test/compose.test.ts` — `attributes every successfully composed animation path`
- Verification: `packages/core/test/credits.test.ts` — `limits credits to supplied successfully composed layers`
- Verification: `packages/web/e2e/download-attribution.spec.ts` — `spritesheet download bundles pixels and attribution`
- Verification: `packages/web/e2e/download-attribution.spec.ts` — `empty download credits block every action with a retryable localized error`

### REQ-COMP-006 — Produce a strict attributed preview

The CLI MUST produce a requested supported character preview only when the
selection can yield a complete attributed result. A successful preview MUST
provide the preview pixels, metadata, and matching TXT and CSV credits.

Invalid animation, direction, frame, selection, or empty-attribution input MUST
return an actionable failure without publishing a successful preview.

#### Scenario: Preview one attributed frame

- GIVEN a valid character selection and supported preview coordinates
- WHEN preview is requested
- THEN the CLI publishes one preview frame with metadata and matching TXT and
  CSV credits

##### Evidence

- Owner: `packages/cli/src/preview.ts`
- Verification: `packages/cli/test/preview.test.ts` — `writes one down-facing walk frame and exact attribution`
- Verification: `packages/cli/test/preview.test.ts` — `does not publish a preview for an empty character`
- Verification: `packages/cli/test/character-commands.test.ts` — `maps actionable preview errors into the command response`

### REQ-COMP-007 — Publish an attributed full render transactionally

A successful CLI render MUST publish the composed sheet, an offline animation
viewer, metadata, and matching TXT and CSV credits. Requested supported
animation, frame, and portable bundle outputs MUST remain bound to that same
render result.

A render failure before publication MUST NOT leave a partially published new
artifact set or destroy a previously valid result.

#### Scenario: Render a portable attributed character

- GIVEN a valid character selection and writable output destination
- WHEN a full render is requested
- THEN the resulting artifact set contains the sheet, viewer, metadata, and
  matching credit artifacts, together with any explicitly requested derivatives

##### Evidence

- Owner: `packages/cli/src/render.ts`
- Verification: `packages/cli/test/render.test.ts` — `renders and attributes a managed ZIP runtime through core composition`
- Verification: `packages/cli/test/render.test.ts` — `includes the viewer and attributed artifacts in a ZIP bundle`
- Verification: `packages/cli/test/render.test.ts` — `does not publish artifacts when viewer generation fails`
- Verification: `packages/cli/test/render.test.ts` — `preserves prior outputs when the viewer path collides with a directory`

### REQ-COMP-008 — Require explicit acceptance of partial output

CLI character rendering MUST be strict by default. It MAY produce attributed
partial output only after the caller explicitly requests partial behavior.

Partial output MUST report the skipped validation or sprite evidence and MUST
retain attribution for the pixels that were actually composed.

#### Scenario: Request an attributed partial render

- GIVEN a selection with a missing or invalid optional layer
- WHEN the caller explicitly requests partial rendering
- THEN the CLI publishes the remaining attributed output and reports the skipped
  evidence as warnings or metadata

##### Evidence

- Owner: `packages/cli/src/compose-selection.ts`
- Owner: `packages/cli/src/render.ts`
- Verification: `packages/cli/test/render.test.ts` — `reports skipped validation errors as warnings when partial render is allowed`
- Verification: `packages/cli/test/render.test.ts` — `keeps attributed directory output when a selected image is missing in partial mode`
- Verification: `packages/cli/test/render.test.ts` — `keeps attributed ZIP output when an indexed selected image is missing in partial mode`

### REQ-COMP-009 — Provide interactive Web composition

The Web Composer MUST let a human interactively maintain a catalog-backed
character selection, observe the current composed preview, and export supported
character artifacts with matching attribution.

While a replacement composition is pending, actions that would publish or
replace composition-dependent state MUST remain blocked or deferred until the
current result settles.

#### Scenario: Change and export an interactive composition

- GIVEN the Web Composer has loaded a supported runtime asset source
- WHEN the user changes the character and downloads the composed result
- THEN the preview represents the settled selection and the downloaded pixels
  include matching attribution

##### Evidence

- Owner: `packages/web/src/components/layer-stack/harness.tsx`
- Owner: `packages/web/src/hooks/use-composed-character.ts`
- Verification: `packages/web/e2e/zip-asset-source.spec.ts` — `renders a complex outfit without significant errors`
- Verification: `packages/web/e2e/composition-loading-lock.spec.ts` — `retains the old preview and locks presets during replacement composition`
- Verification: `packages/web/e2e/download-attribution.spec.ts` — `spritesheet download bundles pixels and attribution`

### REQ-COMP-010 — Guide Agents through the public composition contract

An Agent integration for sprite composition MUST guide catalog discovery,
selection, validation, preview, and final render through the supported public
CLI contract. It MUST preserve structured results through validation and
attribution checks and MUST NOT silently install, upgrade, or bypass the CLI.

An Agent MUST NOT claim visual acceptance of a preview on the user's behalf.

#### Scenario: Complete an Agent-guided character render

- GIVEN a compatible installed CLI and an existing-art composition request
- WHEN an Agent guides the composition journey
- THEN it uses the public catalog and character operations through validation,
  verifies attributed preview and render artifacts, and leaves visual acceptance
  to the user

##### Evidence

- Owner: `plugins/lpc-toolkit/skills/character-authoring/SKILL.md`
- Owner: `plugins/lpc-toolkit/skills/character-authoring/references/cli-workflow.md`
- Verification: `packages/cli/test/plugin-contract.test.ts` — `uses the versioned character contract schema`
- Verification: `packages/cli/test/plugin-contract.test.ts` — `keeps authoring out of read-only and composition skills`
- Verification: `packages/cli/test/character-commands.test.ts` — `creates, sets, searches, shows, validates, removes, and lists a named character`

### REQ-COMP-011 — Keep composition outside source-authoring mutation

Sprite composition MUST use existing catalog assets and MUST NOT create source
pixels or modify asset packs. The supported CLI and Agent-guided journey MUST
remain usable without the hosted Web application and without a repository
clone.

Composition MAY write explicitly requested character-selection, preview, and
render artifacts only to their supported destinations.

#### Scenario: Render without mutating source assets

- GIVEN an existing catalog asset source and character selection
- WHEN a CLI or Agent-guided preview or render completes
- THEN the requested output artifacts are written while source sprite pixels and
  asset-pack source remain unchanged

##### Evidence

- Owner: `packages/core/src/compose.ts`
- Owner: `packages/cli/src/compose-selection.ts`
- Verification: `packages/cli/test/render.test.ts` — `renders upstream v2 without rewriting the source file`
- Verification: `packages/cli/test/plugin-contract.test.ts` — `keeps authoring out of read-only and composition skills`
- Verification: gap — No focused composition-only sentinel test currently exercises catalog discovery, character editing, preview, and render together while proving that the active asset-pack source bytes remain unchanged.
