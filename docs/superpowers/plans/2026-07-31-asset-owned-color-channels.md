# Asset-Owned Color Channels Implementation Plan

**Goal:** Remove the misleading expression-color control immediately, then add
asset-owned primary and secondary color channels across Core, Web, presets,
character documents, hashes/tokens, upstream links, artist packs, and CLI
authoring without changing attribution or silently losing legacy data.

**Architecture:** Core owns color-channel identity, links, validation,
resolution, selection v1-to-v2 migration, canonical v2 serialization, and
upstream projection inputs. Web owns grouped presentation and reducer intent;
CLI owns filesystem persistence, commands, and human/JSON responses; presets
remain pure consumers of Core. Primary color remains `Selection.recolor` for
compatibility, while `Selection.channelRecolors` contains only independent
non-primary values keyed by asset-scoped channel `type_name`.

**Decisions:** This plan implements [ADR-0001](../../adr/0001-selected-assets-own-color-channels.md)
through [ADR-0006](../../adr/0006-project-selections-to-upstream.md) and uses
the language in [`CONTEXT.md`](../../../CONTEXT.md).

## Global Constraints

- Do not add dependencies. If one becomes necessary, stop and ask; state its
  license in the request.
- Never initialize, modify, or install packages inside `upstream/`. Ordinary
  implementation and verification must use checked-in/cache-backed assets.
- Keep `packages/core/` environment-agnostic and preserve dependency direction.
- Preserve credits through every preview, render, download, and export path.
- Do not add `any`.
- Preserve `Selection.recolor` as the primary color-channel value. A primary
  key must never also appear in `channelRecolors`.
- Asset-scoped channels with the same name remain independent. Only an explicit
  `linked_to` declaration synchronizes a channel.
- The selected `body` asset is the only body-color source. Never infer it from
  selection iteration order.
- Read selection v1 and v2; write v2 only. Read legacy hash/token forms; write
  the versioned v2 forms only.
- Missing independent values mean the asset default color. Never replace a
  missing secondary value with the first swatch during migration.
- Follow test-first loops for behavior changes. Use the narrowest checks while
  iterating, then run the complete gates before handoff.
- After each task: check its box, add an implementation note, record the full
  commit hash, and record each exact verification command with PASS/FAIL.
- Keep Phase 1 independently releasable. Do not pull v2 schema work into it.

## Observable Success

- Expression/head skin controls show a read-only resolved body color; changing
  body color updates their render and summary without offering a false control.
- Body primary color remains editable.
- A user can set `head.eyes` and `expression.eyes` to different values and both
  survive render, save/load, URL/token round trips, and CLI editing.
- Clearing an independent channel restores the authored asset default.
- Switching an item transfers only valid same-name channel values.
- Selection v1 imports without visual change and the next save emits v2.
- Invalid canonical v2 input fails with an exact field path; invalid v2
  hash/token channel input produces a warning and falls back to asset default.
- Pinned release `assets-v2026.08.01-color-links-v1` migrates all 79
  `match_body_color` definitions with render/credit parity: 78 follower assets
  receive primary-channel `linked_to` declarations, while the sole `body`
  source drops the legacy flag without a self-link.
- External legacy artist packs remain readable with a deprecation warning.
- Upstream links contain only upstream-compatible parameters, open the selected
  assets, and disclose when private channels require a lossy projection.
- Existing presets and random profiles retain their current outputs.

## Canonical Contracts

### Core selection

```ts
interface Selection {
  readonly typeName: TypeName;
  readonly name: string;
  readonly variant?: string;
  readonly recolor?: string;
  readonly channelRecolors?: Readonly<Record<TypeName, string>>;
}
```

`recolor` is the primary channel. `channelRecolors` excludes the primary and
linked channels. An absent value selects the asset default color.

### Asset channel link

```ts
interface ColorChannelLink {
  readonly selection: 'body';
  readonly channel: 'primary';
}

interface RecolorConfig {
  // existing fields remain
  readonly linked_to?: ColorChannelLink;
}
```

The first version accepts only `body/primary`. `match_body_color` is accepted
at the external legacy-pack boundary and is normalized with a deprecation
warning when authoring a pack. The pinned canonical asset release uses
`linked_to` exclusively.

### Selection v2

```json
{
  "schema": "lpc-toolkit.selection.v2",
  "bodyType": "male",
  "items": {
    "expression": {
      "name": "Neutral",
      "channelRecolors": { "eyes": "red" }
    }
  }
}
```

The v2 parser rejects unknown item fields, primary/secondary duplication,
linked-channel values, unknown channel IDs, and invalid colors. The v1 parser
migrates in memory without inventing secondary values. The serializer writes
v2 only.

### Hash/token v2

```text
v=2&sex=male&expression=Neutral_light&color.expression.eyes=red
```

The serializer sorts selection and channel keys deterministically. The token
prefix is `v2.` and wraps the v2 query. Legacy unversioned hash and `v1.` token
inputs remain readable.

## CLI Documentation Impact

Initial assessment; reassess before handoff.

```text
help: update
cli-readme: update
root-readme: update
landing: update
architecture: update
engineering: update
releasing: N/A — release authorization and publication procedure do not change
plugin: update
```

- `help`: document secondary channel set/default commands and errors.
- `cli-readme`: document selection v2 migration and channel examples.
- `root-readme`: update the primary character-authoring example/schema promise.
- `landing`: update CLI examples that expose character selection authoring.
- `architecture`: record Core ownership of channel/link/migration/projection.
- `engineering`: add the focused color-channel/interchange verification map.
- `releasing`: N/A because package release mechanics and authorization stay the
  same; user-facing migration notes belong with product docs/PR/release notes.
- `plugin`: update character-authoring workflows so agents use the public CLI
  rather than editing v2 JSON by hand.

---

## Phase 1 — Stop exposing a color control that cannot affect rendering

### Task 1: Resolve body color from the body selection only

**Files:**
- Modify: `packages/core/src/recolor-resolve.ts`
- Modify: `packages/core/test/recolor-resolve.test.ts`

- [x] Add failing tests proving the selected `body` primary recolor is the sole
  source, non-body `match_body_color` assets follow it, object insertion order
  cannot change the result, and a missing body produces the existing raw/default
  fallback plus a diagnostic warning.
- [x] Replace the iteration-based body-color lookup with an explicit `body`
  selection lookup; keep the body asset itself editable.
- [x] Run:
  `rtk pnpm --filter @lpc-toolkit/core test -- recolor-resolve.test.ts`
- [x] Run:
  `rtk pnpm --filter @lpc-toolkit/core run typecheck`
- [x] Run: `rtk pnpm check:boundaries`
- [x] Record implementation note, commit hash, and PASS/FAIL evidence here.
  - Implementation: body color now resolves only through the validated `body`
    selection; linked assets warn and draw raw/default when that source is
    missing. Regression coverage proves insertion order cannot let expression
    color override body color and that the body remains editable.
  - Commit: `8bbe1c6ce8ad75eeae6be3bfaf3e08bab35bee23`
  - Verification: `rtk pnpm --filter @lpc-toolkit/core test -- recolor-resolve.test.ts`
    FAIL as expected before implementation (2 failed, 18 passed), then PASS
    after implementation (20 passed).
  - Verification: `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS.
  - Verification: `rtk pnpm check:boundaries` PASS.

### Task 2: Render followed primary color as read-only in Web

**Files:**
- Modify: `packages/web/src/slice/color-options.ts`
- Modify: `packages/web/src/components/color-picker.tsx`
- Modify: `packages/web/src/components/layer-stack/type-item-picker.tsx`
- Modify: `packages/web/src/i18n.ts`
- Modify: `packages/web/test/color-options.test.ts`
- Modify: `packages/web/test/color-picker.test.tsx`
- Modify: `packages/web/test/i18n.test.ts`

- [x] Add failing pure/UI tests proving `body` retains clickable swatches while
  non-body `match_body_color` primary channels show a read-only "follows body"
  label and resolved swatch, with no dispatch on interaction.
- [x] Add a presentation-safe linked-primary result to the pure color-options
  helper; do not teach the component composition policy.
- [x] Wire the current body selection into the selected-item picker and render
  the translated read-only state.
- [x] Confirm secondary channels remain intentionally unavailable in Phase 1;
  do not add partial persistence.
- [x] Run:
  `rtk pnpm --filter @lpc-toolkit/web test -- color-options.test.ts color-picker.test.tsx i18n.test.ts`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/web run typecheck`
- [x] Run: `rtk pnpm check:boundaries`
- [x] Record implementation note, commit hash, and PASS/FAIL evidence here.
  - Implementation: non-body `match_body_color` items now derive a read-only
    linked-primary presentation from the selected body recolor. The body retains
    editable swatches, missing explicit body color is labeled as the asset
    default, and TypeItemPicker wiring plus en/zh-TW copy are covered.
  - Commit: `5dbc74e7ad12cfe116bcad4c27182af56a8f8b52`
  - Verification: `rtk pnpm --filter @lpc-toolkit/web test -- color-options.test.ts color-picker.test.tsx i18n.test.ts`
    could not start in the sandbox because `tsx` IPC creation returned EPERM;
    the escalated rerun then FAILed as expected before implementation (4 failed,
    29 passed) and PASSed after implementation (33 passed).
  - Verification: `rtk pnpm --filter @lpc-toolkit/web test -- color-options.test.ts color-picker.test.tsx type-item-picker.test.tsx i18n.test.ts`
    PASS (35 passed).
  - Verification: `rtk pnpm --filter @lpc-toolkit/web run typecheck` PASS.
  - Verification: `rtk pnpm check:boundaries` PASS.

### Phase 1 handoff gate

- [x] Run: `rtk pnpm --filter @lpc-toolkit/core test`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/web test`
- [x] Run: `rtk pnpm verify`
- [x] Manually verify body color changes update body/head/expression together,
  body remains editable, and expression exposes no ineffective button.
- [x] Reassess documentation impact for the Phase 1-only diff and record it.
  - Verification: `rtk pnpm --filter @lpc-toolkit/core test` PASS (25 files,
    340 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/web test` PASS (105 files,
    835 tests). Expected missing-optional-asset diagnostics remained non-fatal.
  - Verification: `rtk pnpm verify` PASS, including asset/source pins,
    boundaries, CLI docs policy, plugin validation, all workspace typechecks,
    and all workspace unit tests.
  - Manual verification: local Composer initially showed
    `Follows body · Light` for expression with no color buttons; body retained
    editable swatches; selecting Brown changed the expression status to
    `Follows body · Brown`.
  - Phase 1 CLI documentation impact:
    `help`, `cli-readme`, `root-readme`, `landing`, `architecture`,
    `engineering`, `releasing`, and `plugin` are all N/A because Phase 1 changes
    only Core body-source resolution and Web presentation; no CLI command,
    persistence, package, release, plugin, or documented primary workflow
    contract changes.

---

## Phase 2 — Add complete asset-owned color channels

### Task 3: Define channel/link domain APIs in Core

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/recolor-resolve.ts`
- Modify: `packages/core/src/selection-defaults.ts`
- Modify: `packages/core/src/index.ts`
- Modify/Create focused tests under `packages/core/test/`

- [x] Add failing tests for ordered channel discovery, stable asset-scoped
  `type_name` IDs, real swatches per channel, asset defaults, and `body/primary`
  links.
- [x] Introduce strict exported channel/link types and helpers that expose all
  recolor entries without leaking Web presentation concepts.
- [x] Extend `Selection` with optional non-primary `channelRecolors`. Duplicate
  primary/linked entries remain rejected at the concrete asset and selection
  document validation boundaries in Tasks 4 and 5.
- [x] Preserve the existing primary `getRecolorSwatches` contract for callers
  that have not migrated yet.
- [x] Run focused Core tests, Core typecheck, and `check:boundaries`.
- [x] Record implementation note, commit hash, and PASS/FAIL evidence here.
  - Implementation: Core now exposes ordered, asset-owned recolor channels with
    reserved primary IDs, explicit secondary `type_name` IDs, resolved defaults
    and swatches, and strict `body/primary` link metadata. `Selection` can carry
    non-primary `channelRecolors`, while the legacy primary swatch helper keeps
    its existing behavior for unmigrated callers.
  - Commit: `bc5f0e82cf5549a38ba5ada75bc93431d263fa51`
  - Verification: `rtk pnpm --filter @lpc-toolkit/core test -- recolor-resolve.test.ts`
    FAILed as expected before implementation (2 failed, 20 passed) because
    `getColorChannels` was not yet exported, then PASSed after implementation
    (22 passed).
  - Verification: `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS.
  - Verification: `rtk pnpm check:boundaries` PASS.
  - Verification: `rtk git diff --check` PASS.

### Task 4: Add asset-schema links and migrate checked-in assets

**Files:**
- Modify: `packages/core/src/asset-pack-schema.ts`
- Modify: `packages/core/src/asset-pack-validation.ts`
- Modify: `packages/core/src/asset-pack-model.ts`
- Modify: focused asset-pack Core tests
- Modify: all applicable JSON under `assets/sheet_definitions/`
- Modify: asset generation/validation snapshots only when mechanically required

- [x] Add failing schema/validation tests for valid `body/primary` links,
  unsupported targets, linked secondary values, duplicate channel IDs, and
  legacy `match_body_color` deprecation normalization.
- [x] Implement the schema and compile normalization without weakening strict
  artist-pack validation.
- [x] In the next pinned asset release, mechanically migrate every follower
  definition with
  `match_body_color: true` to `linked_to` on its primary recolor entry; remove
  the flag without adding a self-link on the sole `body` source; fail and list
  any definition that lacks a resolvable primary entry.
- [x] Assert no definition in that release retains `match_body_color` and the
  migration count matches the pre-change inventory (79 unless the active asset
  snapshot changed; if changed, record and explain the new audited count).
- [x] Verify catalog, layer, animation, pixel-render, and credit-manifest parity
  for representative single- and multi-channel assets.
- [x] Run Web asset validation when a full directory asset tree is available;
  otherwise verify the compressed asset pin and record why the directory-only
  validator is not applicable.
- [x] Record implementation note, commit hash, and PASS/FAIL evidence here.
  - Implementation: strict artist-pack parsing now accepts only explicit
    `body/primary` link targets, preserves linked primary and secondary
    channels through normalization, rejects duplicate/missing secondary IDs
    and body self-links, and converts legacy `match_body_color` input to a
    canonical primary link with an acknowledgeable deprecation warning. Core
    rendering and Web presentation accept the canonical declaration while
    retaining deprecated compatibility for external legacy definitions.
  - Commit: `1ecd7fe5c1a2fdd08bbea808ffa20710698315b3`
  - Asset inventory: the current ignored, materialized release cache contains
    79 legacy flags: 78 followers and one `body` source. A trial mechanical
    migration confirmed `legacy=0`, `primaryBodyLinks=78`, and no body
    self-link, then the cache was restored because `assets/` is not a
    versionable source in this repository.
  - Release completion: `assets-v2026.08.01-color-links-v1` publishes source
    SHA `9c190fb596f855d1adc253454786536993829b84`, a migration report, an immutable
    manifest, and a runtime tarball. The repository pin, dormant gitlink
    pointer, and fixture provenance moved atomically in
    `b98a00ef2923067275d6ef0dbfaf1f23ab69a20b`.
  - Release inventory: the published report and independently inspected
    materialized definitions agree on `legacy=0`, `primaryBodyLinks=78`, no
    body self-links, no unsupported targets, and 79 changed definition files.
    The downloaded manifest SHA-256 is
    `4e039fa8b48e1f1e2ed37b5c8b8037d1f058d5c33234ac82bcf7dd41c7004fcc`;
    the runtime tarball SHA-256 is
    `c9f13a5f2b39306bae29e4fd8d3aa019dd0da4caa8ecda6daa00803660cc6a92`.
  - Verification: `rtk pnpm --filter @lpc-toolkit/core test -- asset-pack-schema.test.ts asset-pack-validation.test.ts`
    FAILed as expected before implementation (6 failed, 53 passed), then the
    expanded focused Core set PASSed (97 passed).
  - Verification: `rtk pnpm --filter @lpc-toolkit/core test` PASS (25 files,
    350 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS.
  - Verification: `rtk pnpm --filter @lpc-toolkit/web test -- color-options.test.ts`
    could not start in the sandbox because `tsx` IPC creation returned EPERM;
    the escalated rerun PASSed (11 passed).
  - Verification: `rtk pnpm --filter @lpc-toolkit/web run typecheck` PASS.
  - Verification: `rtk pnpm --filter @lpc-toolkit/web validate-assets` N/A for
    the active compressed snapshot: the directory-only script correctly
    reported that `assets/spritesheets/` is absent. The pin-aware replacement
    evidence, `rtk pnpm verify`, PASSed, including cache preparation, pin and
    fixture verification, all workspace typechecks, and all unit tests.
  - Verification: `rtk pnpm check:boundaries` PASS.
  - Verification: `rtk git diff --check` PASS.
  - Task 4 CLI documentation impact: `help`, `cli-readme`, `root-readme`,
    `landing`, `architecture`, `engineering`, `releasing`, and `plugin` are all
    N/A for this partial commit because it adds no CLI command or documented
    authoring example; the complete public channel workflow remains assigned
    to Tasks 10 and 11.
  - Release-transition verification: `rtk pnpm verify` PASS (Core 370,
    Presets 8, Web 852, CLI 1048 passed plus 1 skipped); `rtk pnpm build` PASS;
    Web E2E PASS (33); packed CLI install smoke PASS; four-way pin verification
    PASS for 17 fixtures at `9c190fb596f855d1adc253454786536993829b84`.
  - Release-transition CLI documentation impact:
    - `help`: N/A — command syntax and behavior did not change.
    - `cli-readme`: N/A — the documented asset preparation contract is
      unchanged; only its immutable pin advanced.
    - `root-readme`: N/A — the documented pinned-cache workflow is unchanged.
    - `landing`: N/A — no user-facing workflow or command changed.
    - `architecture`: N/A — the existing four-way pin and explicit-link
      contracts were fulfilled without changing their design.
    - `engineering`: N/A — verification commands and CI mapping are unchanged.
    - `releasing`: N/A — CLI versioning and npm publication procedure did not
      change.
    - `plugin`: N/A — plugin command and compatibility contracts did not
      change.

### Task 5: Introduce canonical selection v2 and strict v1 migration

**Files:**
- Modify: `packages/core/src/selection-document.ts`
- Modify: `packages/core/src/upstream-selection-import.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/test/selection-document.test.ts`
- Modify: `packages/core/test/upstream-selection-import.test.ts`
- Modify: CLI/Web document boundary tests as required

- [x] Add failing tests for strict v2 parsing, v1 in-memory migration, v2-only
  serialization, absent secondary defaults, invalid channel paths, linked-value
  rejection, and visual round-trip preservation.
- [x] Keep `lpc-toolkit.selection.v1` as accepted input and introduce
  `lpc-toolkit.selection.v2` as the only output discriminator.
- [x] Ensure upstream v1/v2 import adapters populate asset-owned channels where
  unambiguous, reject ambiguous or lossy mappings at exact paths, and warn when
  a mutating CLI operation normalizes a successfully imported legacy format.
- [x] Ensure failed imports and read-only CLI operations never rewrite files.
- [x] Run focused Core, CLI file-boundary, and Web document tests.
- [x] Record implementation note, commit hash, and PASS/FAIL evidence here.

Task 5 record:

- Implementation: added strict canonical selection v2 parsing and v2-only
  serialization while retaining tolerant v1 reads; nested independent secondary
  values now live in `channelRecolors`. Canonical v1 and upstream v1/v2
  secondary selections migrate to their selected owner asset when the mapping is
  unambiguous. Ambiguous, invalid, or linked-value inputs fail with stable codes
  and exact paths instead of continuing with a lossy result. Legacy primary
  values that were already ignored because the channel follows body are removed
  during migration, preserving the rendered result while producing valid v2.
  Mutating CLI operations warn when they rewrite a legacy format; read-only and
  failed operations leave source files unchanged.
- Commit: `2be3c999f85f886500060c9b2b28c62bf9a3a228`.
- Initial RED verification:
  `rtk pnpm --filter @lpc-toolkit/core test -- selection-document.test.ts`
  FAIL as expected (13 failed, 12 passed) before implementation.
- Verification:
  `rtk pnpm --filter @lpc-toolkit/core test -- upstream-selection-import.test.ts selection-document.test.ts`
  PASS (65 passed).
- Verification:
  `rtk pnpm --filter @lpc-toolkit/cli test -- main-human.test.ts character-editor.test.ts preset-commands.test.ts selection-document-file.test.ts character-commands.test.ts character-store.test.ts token-commands.test.ts`
  PASS (103 passed).
- Verification: focused Web character-document and documentation contract tests
  PASS (26 passed).
- Verification: `rtk pnpm -r typecheck` PASS.
- Verification: `rtk pnpm verify` PASS, including asset preparation and pin
  verification, architecture and CLI documentation policy gates, plugin checks,
  every workspace typecheck, Core tests, Web tests (836 passed), and CLI tests
  (1034 passed, 1 platform-specific skip).
- Verification: `rtk git diff --check` PASS.
- Task 5 CLI documentation impact:
  - `help`: N/A — no command, option, or help text changed.
  - `cli-readme`: update — documented v2 writes, v1/v2 reads, and
    `channelRecolors`.
  - `root-readme`: update — documented the canonical v2 interchange contract.
  - `landing`: N/A — the landing page has no owned selection-schema literal or
    channel document example.
  - `architecture`: update — recorded schema ownership, migration, and strict
    channel validation.
  - `engineering`: N/A — development and verification commands are unchanged.
  - `releasing`: N/A — release and publication procedures are unchanged.
  - `plugin`: N/A — plugin command workflows and contracts are unchanged.

### Task 6: Resolve, clear, and transfer independent channels

**Files:**
- Modify: `packages/core/src/recolor-resolve.ts`
- Modify: `packages/core/test/recolor-resolve.test.ts`
- Modify: `packages/web/src/slice/selection.ts`
- Modify: `packages/web/src/slice/color-options.ts`
- Modify: `packages/web/test/selection.test.ts`
- Modify: `packages/web/test/color-options.test.ts`

- [x] Add failing tests proving head/expression same-name channels remain
  independent, linked skin derives from body, absent values use base/default,
  clear restores default, and item replacement transfers only valid same-name
  values.
- [x] Replace the current synthetic cross-selection sub-recolor lookup with the
  selected asset's own `channelRecolors` plus explicit link resolution.
- [x] Keep primary selection/default behavior unchanged; do not make the first
  secondary swatch an implicit default.
- [x] Add reducer actions for set/clear secondary channel intent without adding
  React or browser behavior to the pure slice.
- [x] Run focused Core/Web tests, package typechecks, and boundaries.
- [x] Record implementation note, commit hash, and PASS/FAIL evidence here.

Task 6 record:

- Implementation: replaced the cross-selection secondary lookup with
  asset-scoped `Selection.channelRecolors`; every explicit `linked_to`
  channel resolves from the selected body primary, while the pinned legacy
  primary flag remains readable. Missing independent values continue to use the
  authored base/default ramp. Added pure set/clear reducer actions, composition
  locking for those actions, and a replacement helper that transfers only
  valid same-name independent values. Linked primaries no longer receive local
  defaults, including the initial Web head/expression selections, so direct v2
  saves cannot persist ignored linked values.
- Commit: `b2bfaa3444f91e85218a1ebcde1dfe57f13abd37`.
- Initial RED verification:
  `rtk pnpm --filter @lpc-toolkit/core test -- recolor-resolve.test.ts`
  FAIL as expected (3 failed, 22 passed).
- Initial RED verification:
  `rtk pnpm --filter @lpc-toolkit/web test -- selection.test.ts color-options.test.ts`
  FAIL as expected (5 failed, 49 passed) after the required escalated rerun for
  the `tsx` IPC sandbox restriction.
- Verification:
  `rtk pnpm --filter @lpc-toolkit/core test -- recolor-resolve.test.ts`
  PASS (25 passed).
- Verification:
  `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/selection.test.ts test/color-options.test.ts test/composition-lock.test.ts`
  PASS (69 passed).
- Verification: `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS.
- Verification: `rtk pnpm --filter @lpc-toolkit/web run typecheck` PASS.
- Verification: `rtk pnpm check:boundaries` PASS.
- Verification: `rtk pnpm --filter @lpc-toolkit/core test` PASS (364 passed).
- Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run` PASS
  (843 passed).
- Verification: `rtk pnpm verify` PASS, including pin, architecture, CLI
  documentation policy, plugin, all workspace typechecks, Core tests, Web tests
  (843 passed), and CLI tests (1034 passed, 1 platform-specific skip).
- Verification: `rtk git diff --check` PASS.
- Task 6 CLI documentation impact: `help`, `cli-readme`, `root-readme`,
  `landing`, `architecture`, `engineering`, `releasing`, and `plugin`
  are all N/A because this task changes Core/Web in-memory resolution and pure
  reducer behavior only; public serialization was documented in Task 5 and
  public CLI authoring remains assigned to Task 10.

### Task 7: Add deterministic v2 hash/token and upstream projection

**Files:**
- Modify: `packages/core/src/hash.ts`
- Modify: `packages/core/test/hash.test.ts`
- Modify: `packages/web/src/lib/url-hash-sync.ts`
- Modify: `packages/web/src/lib/selection-sharing.ts`
- Modify: `packages/web/src/lib/upstream-url.ts`
- Modify: `packages/web/test/url-hash-sync.test.ts`
- Modify: `packages/web/test/upstream-url.test.ts`
- Modify: CLI token commands/tests

- [x] Add failing tests for legacy hash/`v1.` token reads, deterministic v2
  writes, `color.<slot>.<channel>` parsing, invalid-channel warnings, and exact
  token round trips.
- [x] Add a versioned v2 serializer/parser and `v2.` token codec while keeping
  legacy decoders.
- [x] Implement a dedicated upstream serializer that never forwards `v=2` or
  `color.*`, preserves representable selections/colors, chooses a deterministic
  visibly dominant value for collisions, and returns loss diagnostics.
- [x] Surface the upstream-loss warning in Web tooltip/status while leaving the
  link usable.
- [x] Verify sample upstream URLs syntactically against the public upstream
  contract without requiring `upstream/` initialization.
- [x] Run focused Core/Web/CLI token and URL tests.
- [x] Record implementation note, commit hash, and PASS/FAIL evidence here.

Task 7 record:

- Implementation: added deterministic canonical `v=2` hashes with sorted
  asset-owned `color.<slot>.<channel>` fields, `v2.` tokens, and backward reads
  for legacy hashes and `v1.` tokens. The Core upstream projection emits only
  the public legacy contract, orders selected assets by highest layer so the
  intended visibly dominant sub-selection wins upstream's first-match lookup,
  and reports every global-channel collision. Web keeps the projected link
  usable while displaying a localized warning glyph and tooltip when fidelity
  is lost. CLI encode now emits `v2.`; decode accepts both token versions and
  its help/README describe that contract.
- Commit: `adf45606860fd9220f644ed8885d01e566f32057`.
- Initial RED verification:
  `rtk pnpm --filter @lpc-toolkit/core test -- hash.test.ts` FAIL as expected
  (2 failed, 32 passed: canonical v2 expectation and missing upstream
  projection).
- Initial RED verification:
  `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/upstream-url.test.ts test/top-bar.test.tsx test/url-hash-sync.test.ts test/share-import-popover.test.ts`
  FAIL as expected (3 failed, 27 passed: projection result and loss warning not
  implemented).
- Initial RED verification:
  `rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/token-commands.test.ts test/main-human.test.ts`
  FAIL as expected (2 failed, 39 passed: CLI routed `v2.` input as a raw hash).
- Verification:
  `rtk pnpm --filter @lpc-toolkit/core test -- hash.test.ts` PASS (34 passed).
- Verification:
  `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/upstream-url.test.ts test/top-bar.test.tsx test/url-hash-sync.test.ts test/share-import-popover.test.ts`
  PASS (30 passed).
- Verification:
  `rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/token-commands.test.ts test/main-human.test.ts`
  PASS (41 passed).
- Verification: `rtk pnpm --filter @lpc-toolkit/core test` PASS (370 passed).
- Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run` PASS.
- Verification: `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS.
- Verification: `rtk pnpm --filter @lpc-toolkit/web run typecheck` PASS.
- Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
- Verification: `rtk pnpm check:boundaries` PASS.
- Verification: `rtk pnpm verify` PASS, including source pins, architecture,
  CLI documentation policy, plugin verification, all workspace typechecks, and
  all workspace unit tests. The loopback-dependent CLI web-server tests were
  run with the required sandbox escalation.
- Verification: `rtk git diff --check` PASS.
- Public upstream verification: compared the projection with public upstream
  `sources/state/hash.ts` and `sources/state/resolve-hash-param.ts` at Git tree
  `0f898bb675a1abe16ce430e82e3bf9daed278690`, without initializing the dormant
  gitlink. A live projected URL loaded `Neutral`, `Human Male`, `Body Color`,
  and `Eye Color (red)` and rendered non-empty 256×64 animation and 832×3456
  full-sheet canvases.
- Task 7 CLI documentation impact:
  `help: update`; `cli-readme: update`; `root-readme: N/A — token versioning is
  not a primary root quick-start workflow`; `landing: N/A — the landing page
  mentions tokens generically and owns no wire-format contract`;
  `architecture: N/A — Core already owns hash/token compatibility and accepted
  ADR-0004/0006 own this format decision`; `engineering: N/A — commands, gates,
  and CI mapping are unchanged`; `releasing: N/A — package publication and
  release verification are unchanged`; `plugin: N/A — installed skills do not
  expose the token workflow`.

### Task 8: Extend presets without changing existing outputs

**Files:**
- Modify: `packages/presets/src/index.ts`
- Modify: `packages/presets/test/presets.test.ts`
- Modify: consuming Web/CLI preset tests

- [x] Add failing tests for optional non-primary channel values, linked-channel
  rejection, valid transfer on replacement, and unchanged snapshots for every
  existing preset.
- [x] Extend preset item types/application with optional channel values; do not
  add secondary values to existing presets.
- [x] Keep random outfit/profile logic from randomizing secondary channels.
- [x] Run presets typecheck/tests plus Web and CLI preset consumer tests.
- [x] Record implementation note, commit hash, and PASS/FAIL evidence here.
  - Implementation: preset items may provide strict, catalog-validated values
    for independent non-primary channels. Replacement transfers only still-valid
    values with the same channel ID; an explicit unknown, primary, linked, or
    invalid value skips that preset item. All six built-in presets remain exact
    primary-only snapshots, and random outfit selection remains primary-only.
  - Product commit: `14a1b4613ea697e56ab545baef7bc9080fc51f81`
  - RED: `rtk pnpm --filter @lpc-toolkit/presets test -- presets.test.ts`
    FAIL as expected (3 failed, 4 passed before implementation).
  - GREEN: `rtk pnpm --filter @lpc-toolkit/presets test -- presets.test.ts`
    PASS (7 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/presets run typecheck` PASS.
  - Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/presets-apply.test.ts test/presets.test.ts test/random-outfit.test.ts`
    PASS (69 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli exec vitest run test/preset-commands.test.ts`
    PASS (8 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/web run typecheck && rtk pnpm --filter @lpc-toolkit/cli run typecheck`
    PASS.
  - Verification: `rtk pnpm check:boundaries` PASS.
  - Verification: `rtk pnpm verify` PASS (Core 370, asset-pack-format 72,
    Presets 7, Web 846, CLI 1036 passed and 1 skipped).
  - Verification: `rtk git diff --check` PASS.
  - CLI documentation impact reassessment:

    ```text
    help: N/A — no command, option, argument, output, or help behavior changed
    cli-readme: N/A — every existing built-in preset materializes unchanged
    root-readme: N/A — the documented CLI and preset workflows are unchanged
    landing: N/A — the existing landing preset and rendered output are unchanged
    architecture: N/A — presets retain pure application ownership and CLI only materializes the shared result
    engineering: N/A — development commands, verification gates, and ownership are unchanged
    releasing: N/A — package publication and release behavior are unchanged
    plugin: N/A — no plugin command or character-authoring contract exposes preset channel authoring
    ```

### Task 9: Build grouped multi-channel Web controls

**Files:**
- Modify: `packages/web/src/slice/color-options.ts`
- Modify: `packages/web/src/components/color-picker.tsx`
- Modify: `packages/web/src/components/layer-stack/type-item-picker.tsx`
- Modify: `packages/web/src/components/layer-stack/layer-row.tsx`
- Modify: `packages/web/src/i18n.ts`
- Modify: focused Web tests and an E2E spec

- [x] Add failing UI tests for per-channel headings, translated label fallback,
  explicit default buttons, independent selection/clearing, linked read-only
  source/swatch, collapsed summaries, disabled state, keyboard semantics, and
  mobile wrapping/scrolling.
- [x] Render all channel groups inside the selected item's picker. Keep
  replacement cards compact and free of multi-channel controls.
- [x] Show summary swatches for primary and explicit secondary overrides only;
  omit asset-default secondary values from the collapsed summary.
- [x] Add an E2E flow that sets head/expression eyes differently, saves,
  changes state, imports, and observes the exact restored render/state.
- [x] Run focused Web tests, Web typecheck, and ordinary Web E2E.
- [x] Record implementation note, commit hash, and PASS/FAIL evidence here.
  - Implementation: the selected-item picker now renders ordered primary,
    independent-secondary, and read-only linked groups. Independent secondary
    groups expose explicit asset-default clearing, unique accessible labels,
    native keyboard buttons, disabled semantics, and wrapping/scrolling. Layer
    summaries show primary plus explicit secondary overrides only, while
    replacement cards remain compact. Primary/style changes preserve secondary
    state, and replacement transfers only valid same-name channels.
  - Regression fix: canonical v2 import now uses
    `primaryColorFollowsBody()` consistently, so the legacy
    `match_body_color` flag on the selected `body` source cannot misclassify its
    legal primary recolor as a linked follower value.
  - Product commit: `1aaaba9b9c278ed5df3979af19265408b5f2efa2`
  - RED: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/color-options.test.ts test/color-picker.test.tsx test/i18n.test.ts`
    FAIL as expected (6 failed, 35 passed before implementation).
  - RED regression: `rtk pnpm --filter @lpc-toolkit/core exec vitest run test/upstream-selection-import.test.ts`
    FAIL as expected (1 failed, 39 passed before the body-source fix).
  - Verification: `rtk pnpm --filter @lpc-toolkit/core exec vitest run test/upstream-selection-import.test.ts`
    PASS (40 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/core run typecheck` PASS.
  - Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/color-options.test.ts test/color-picker.test.tsx test/i18n.test.ts test/type-item-picker.test.tsx test/layer-row.test.tsx test/selection.test.ts`
    PASS (80 tests before the final duplicate-ID regression case; final focused
    color projection/picker rerun PASS with 23 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/web run typecheck` PASS.
  - Verification: `rtk pnpm check:boundaries` PASS.
  - Verification: `rtk pnpm --filter @lpc-toolkit/web test:e2e -- character-json-interchange.spec.ts color-channels.spec.ts`
    PASS (2 tests), including exact v2 JSON channel payload, hash, and canvas
    restoration.
  - Verification: `rtk pnpm --filter @lpc-toolkit/web test` PASS (852 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/web test:e2e` PASS (33 tests).
  - Verification: `rtk git diff --check` PASS.

### Task 10: Add CLI channel authoring and migration responses

**Files:**
- Modify: `packages/cli/src/character-editor.ts`
- Modify: `packages/cli/src/character-commands.ts`
- Modify: `packages/cli/src/command-spec.ts`
- Modify: `packages/cli/src/response.ts` if human formatting requires it
- Modify: focused CLI tests
- Modify: `packages/cli/README.md`
- Modify: `README.md`
- Modify: `packages/web/src/components/landing-page.tsx`
- Modify: `plugins/lpc-toolkit/skills/**`

- [x] Add failing public-command tests for setting and clearing a named channel,
  unknown/invalid colors, linked-channel refusal, v1 migration warnings, atomic
  writes, human output, and `--json` response envelopes.
- [x] Add a focused public CLI interface equivalent to:
  `character set-color --type <slot> --channel <id> (--color <id> | --default)`.
- [x] Preserve existing primary `character set --recolor` behavior.
- [x] Ensure Agent/plugin guidance uses the command rather than manual JSON
  mutation.
- [x] Update every documentation surface marked `update` in the matrix.
- [x] Run focused CLI tests, CLI typecheck/build, plugin verification, and
  landing documentation tests.
- [x] Record implementation note, commit hash, and PASS/FAIL evidence here.
  - Implementation: added `character set-color` with exact-one-of
    `--color`/`--default`, catalog-derived primary and secondary validation,
    linked-channel refusal, atomic v2 persistence, migration warnings, and
    focused human/JSON responses. Existing `character set --recolor` remains
    supported. Root/CLI/landing/help/plugin guidance now uses the public
    command; architecture and engineering ownership were completed with Task
    11 as assigned by this plan.
  - Commit: `4ffbd1adce9e1bc41f539a804eba0c3fc10a5468`.
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- character-commands.test.ts command-spec.test.ts`
    FAIL as expected before implementation (10 failed, 70 passed), then the
    final focused command/contract set PASS (101 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli build` PASS.
  - Verification: `rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx`
    PASS (2 tests) after rerunning outside the sandbox because the first
    attempt could not create the `tsx` IPC socket (`EPERM`).
  - Verification: `rtk pnpm verify:plugin` PASS (40 tests and structure check).
  - Verification: `rtk pnpm check:boundaries` PASS.
  - Verification: `rtk git diff --check` PASS.

### Task 11: Integration, attribution, migration, and package acceptance

**Files:**
- Modify/Create only focused integration fixtures/tests required by failures
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/ENGINEERING.md`

- [x] Add cross-package fixtures covering v1→v2→render, v2 Web↔CLI round trip,
  custom legacy pack normalization, linked body changes, independent channels,
  default clearing, upstream lossy diagnostics, and malformed input.
- [x] Prove every render/export path retains matching credit metadata and
  transactional publication behavior.
- [x] Prove existing presets/random profiles retain their pre-change output.
- [x] Run CLI package smoke when production CLI/package output changes.
- [x] Update architecture and engineering ownership/verification documentation.
- [x] Record implementation note, commit hash, and PASS/FAIL evidence here.
  - Implementation: the distributed integration fixtures from Tasks 3–10
    already cover migration, strict malformed input, independent/default/linked
    resolution, Web interchange, legacy pack normalization, lossy upstream
    projection, credits, transactional render/export, and random/preset
    stability. The packed smoke exposed one remaining writer defect: presets
    emitted a stored recolor for a linked primary. Preset materialization now
    omits that illegal redundant value while preserving the same body-linked
    pixels, with a focused regression. Architecture and Engineering now record
    the ownership boundaries and complete focused acceptance map.
  - Commit: `59432c01af2cd0961ddb519b99be166de3ad8f8a`.
  - Verification: `rtk pnpm --filter @lpc-toolkit/presets test -- presets.test.ts`
    FAIL as expected before implementation (1 failed, 7 passed), then PASS
    (8 tests); preset typecheck PASS.
  - Verification: focused Core integration map PASS (202 tests), focused
    Presets map PASS (7 tests before the added regression), focused CLI map
    PASS (134 tests), and focused Web map PASS (127 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/web test:e2e -- character-json-interchange.spec.ts color-channels.spec.ts`
    PASS (2 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- preset-commands.test.ts character-commands.test.ts`
    PASS (46 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test:package` first
    FAIL with `linked_selection_channel_value` for `head/Human Male`, then PASS
    after the preset writer fix.
  - Verification: `rtk pnpm check:boundaries` PASS.
  - Verification: `rtk git diff --check` PASS.

### Task 12: Final audit and handoff

- [x] Re-read `AGENTS.md`, all six ADRs, `CONTEXT.md`, and this plan; verify the
  implementation uses canonical terms and does not contradict a decision.
- [x] Reassess and record the CLI documentation matrix with final `update` or
  `N/A — reason` values.
- [x] Run: `rtk pnpm check:boundaries`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/core run typecheck`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/core test`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/presets run typecheck`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/presets test`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/web run typecheck`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/web test`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/web test:e2e`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/cli run typecheck`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/cli test`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/cli build`
- [x] Run: `rtk pnpm --filter @lpc-toolkit/cli test:package`
- [x] Run: `rtk pnpm verify:plugin`
- [x] Run: `rtk pnpm verify`
- [x] Run: `rtk pnpm build`
- [x] If isolated parity infrastructure is already provisioned, run
  `rtk pnpm --filter @lpc-toolkit/web test:e2e:parity`; otherwise record why it
  was not run without initializing `upstream/`.
- [x] Confirm `rtk git status --short` contains only intended changes and record
  the final verification evidence and commit hashes.

Task 12 record:

- Audit: repository instructions, context, and all six ADRs agree on
  asset-owned channel identity, `body/primary` links, canonical selection v2,
  attribution preservation, and Core/Web/CLI ownership. The audit corrected
  the plan's pinned-release fallback wording and removed an illegal linked
  primary value from the canonical v2 example.
- Audit commit: `4c8b118bf3c723e1d563b2bf343d97dc7589e9b2`.
- Final CLI documentation impact:
  - `help`: update — documents `character set-color` syntax and behavior.
  - `cli-readme`: update — documents channel editing, v2 persistence, and
    migration behavior.
  - `root-readme`: update — documents the public asset-owned color workflow.
  - `landing`: update — exposes the CLI color-channel authoring workflow.
  - `architecture`: update — records channel, migration, and persistence
    ownership.
  - `engineering`: update — records focused color-channel acceptance commands.
  - `releasing`: N/A — release authorization, package versioning, and
    publication procedure did not change.
  - `plugin`: update — the character-authoring contract documents the new
    command and selection behavior.
- Verification: `rtk pnpm check:boundaries` PASS.
- Verification: Core typecheck PASS; full Core tests PASS (25 files, 370
  tests).
- Verification: Presets typecheck PASS; full Presets tests PASS (8 tests).
- Verification: Web typecheck PASS; full Web unit tests PASS (105 files, 852
  tests); full Web E2E PASS (33 tests).
- Verification: CLI typecheck PASS; full CLI tests PASS (55 files, 1048 passed,
  1 skipped); CLI build PASS; packed CLI install smoke test PASS.
- Verification: `rtk pnpm verify:plugin` PASS (40 tests and structure check).
- Verification: `rtk pnpm verify` PASS after rerunning outside the filesystem
  sandbox because `tsx` requires a local IPC socket; `rtk pnpm build` PASS.
- Parity: `LPC_UPSTREAM_PARITY_DIR` is not provisioned, so
  `test:e2e:parity` was not run. The initial audit did not initialize or use
  `upstream/`; the later authorized release transition advanced only its
  recorded gitlink pointer, and pin-aware verification passed at the new SHA.
- Hygiene: `rtk git diff --check` PASS. The generated untracked
  `.lpc-toolkit-cache/` directory was removed; the final pre-commit status
  contains only this intended plan evidence update.
- Product commits for the final Web, CLI, and preset phases are
  `1aaaba9b9c278ed5df3979af19265408b5f2efa2`,
  `4ffbd1adce9e1bc41f539a804eba0c3fc10a5468`, and
  `59432c01af2cd0961ddb519b99be166de3ad8f8a`; earlier task records above retain
  their corresponding full hashes and verification evidence.
- Asset-release closure: the two previously deferred source-migration items in
  Task 4 are complete in `assets-v2026.08.01-color-links-v1`; pin transition
  commit `b98a00ef2923067275d6ef0dbfaf1f23ab69a20b` passed the same full repository,
  E2E, package, attribution, and four-way provenance gates recorded above.

### Task 13: CI follow-up — preserve projected upstream parity

- [x] Route the parity harness through the same upstream compatibility
  projection used by the public upstream link.
- [x] Preserve primary selection encounter order so equal-`zPos` layers retain
  the same stable rendering order in the toolkit and upstream.
- [x] Add focused regressions for legacy-only upstream hashes and primary
  selection order.
- [x] Run the fixed failing case, the complete isolated parity suite, and the
  repository verification gate.
  - Implementation: the E2E probe now exposes both canonical v2 and projected
    upstream hashes, and parity diagnostics report both. The compatibility
    serializer retains primary selection encounter order while continuing to
    choose visibly dominant independent-channel collision winners by layer.
  - Root cause: the parity harness forwarded canonical v2 state, then the
    compatibility projection independently reordered primary parameters by
    layer. Both renderers stable-sort equal-`zPos` layers, so that parameter
    reordering changed same-layer pixel precedence in the complex fixed case.
  - Commit: `9caad23219fd7680d7274e08453734ffc954e875`.
  - Verification: `rtk pnpm --filter @lpc-toolkit/core test -- hash.test.ts`
    FAIL as expected before implementation (1 failed, 34 passed), then PASS
    (35 tests); Core typecheck PASS.
  - Verification: `rtk pnpm --filter @lpc-toolkit/web test -- upstream-url.test.ts`
    PASS (3 tests); Web typecheck and `rtk pnpm check:boundaries` PASS.
  - Verification: pinned isolated fixed parity case PASS (1 test), then
    `LPC_UPSTREAM_PARITY_DIR=<isolated-checkout> rtk pnpm --filter @lpc-toolkit/web test:e2e:parity`
    PASS (7 tests).
  - Verification: `rtk pnpm verify` PASS; `rtk git diff --check` PASS.
  - Documentation: ADR update N/A — this fix restores the already accepted
    ADR-0006 compatibility projection and does not change its decision.
