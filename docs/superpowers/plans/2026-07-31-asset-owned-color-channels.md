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
- All 79 checked-in `match_body_color` definitions migrate mechanically to
  primary-channel `linked_to` declarations with render/credit parity.
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
only at the external legacy-pack boundary and normalized with a deprecation
warning. Checked-in assets use `linked_to` exclusively.

### Selection v2

```json
{
  "schema": "lpc-toolkit.selection.v2",
  "bodyType": "male",
  "items": {
    "expression": {
      "name": "Neutral",
      "recolor": "light",
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

- [ ] Run: `rtk pnpm --filter @lpc-toolkit/core test`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/web test`
- [ ] Run: `rtk pnpm verify`
- [ ] Manually verify body color changes update body/head/expression together,
  body remains editable, and expression exposes no ineffective button.
- [ ] Reassess documentation impact for the Phase 1-only diff and record it.

---

## Phase 2 — Add complete asset-owned color channels

### Task 3: Define channel/link domain APIs in Core

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/recolor-resolve.ts`
- Modify: `packages/core/src/selection-defaults.ts`
- Modify: `packages/core/src/index.ts`
- Modify/Create focused tests under `packages/core/test/`

- [ ] Add failing tests for ordered channel discovery, stable asset-scoped
  `type_name` IDs, real swatches per channel, asset defaults, and `body/primary`
  links.
- [ ] Introduce strict exported channel/link types and helpers that expose all
  recolor entries without leaking Web presentation concepts.
- [ ] Extend `Selection` with optional non-primary `channelRecolors`; reject or
  diagnose duplicate primary/linked entries at validation boundaries.
- [ ] Preserve the existing primary `getRecolorSwatches` contract for callers
  that have not migrated yet.
- [ ] Run focused Core tests, Core typecheck, and `check:boundaries`.
- [ ] Record implementation note, commit hash, and PASS/FAIL evidence here.

### Task 4: Add asset-schema links and migrate checked-in assets

**Files:**
- Modify: `packages/core/src/asset-pack-schema.ts`
- Modify: `packages/core/src/asset-pack-validation.ts`
- Modify: `packages/core/src/asset-pack-model.ts`
- Modify: focused asset-pack Core tests
- Modify: all applicable JSON under `assets/sheet_definitions/`
- Modify: asset generation/validation snapshots only when mechanically required

- [ ] Add failing schema/validation tests for valid `body/primary` links,
  unsupported targets, linked secondary values, duplicate channel IDs, and
  legacy `match_body_color` deprecation normalization.
- [ ] Implement the schema and compile normalization without weakening strict
  artist-pack validation.
- [ ] Mechanically migrate every checked-in `match_body_color: true` definition
  to `linked_to` on its primary recolor entry; fail and list any definition that
  lacks a resolvable primary entry.
- [ ] Assert no checked-in sheet definition retains `match_body_color` and the
  migration count matches the pre-change inventory (79 unless the active asset
  snapshot changed; if changed, record and explain the new audited count).
- [ ] Verify catalog, layer, animation, pixel-render, and credit-manifest parity
  for representative single- and multi-channel assets.
- [ ] Run Web asset validation and focused Core asset-pack tests.
- [ ] Record implementation note, commit hash, and PASS/FAIL evidence here.

### Task 5: Introduce canonical selection v2 and strict v1 migration

**Files:**
- Modify: `packages/core/src/selection-document.ts`
- Modify: `packages/core/src/upstream-selection-import.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/test/selection-document.test.ts`
- Modify: `packages/core/test/upstream-selection-import.test.ts`
- Modify: CLI/Web document boundary tests as required

- [ ] Add failing tests for strict v2 parsing, v1 in-memory migration, v2-only
  serialization, absent secondary defaults, invalid channel paths, linked-value
  rejection, and visual round-trip preservation.
- [ ] Keep `lpc-toolkit.selection.v1` as accepted input and introduce
  `lpc-toolkit.selection.v2` as the only output discriminator.
- [ ] Ensure upstream v1/v2 import adapters populate asset-owned channels where
  unambiguous and issue structured warnings for lossy mappings.
- [ ] Ensure failed imports and read-only CLI operations never rewrite files.
- [ ] Run focused Core, CLI file-boundary, and Web document tests.
- [ ] Record implementation note, commit hash, and PASS/FAIL evidence here.

### Task 6: Resolve, clear, and transfer independent channels

**Files:**
- Modify: `packages/core/src/recolor-resolve.ts`
- Modify: `packages/core/test/recolor-resolve.test.ts`
- Modify: `packages/web/src/slice/selection.ts`
- Modify: `packages/web/src/slice/color-options.ts`
- Modify: `packages/web/test/selection.test.ts`
- Modify: `packages/web/test/color-options.test.ts`

- [ ] Add failing tests proving head/expression same-name channels remain
  independent, linked skin derives from body, absent values use base/default,
  clear restores default, and item replacement transfers only valid same-name
  values.
- [ ] Replace the current synthetic cross-selection sub-recolor lookup with the
  selected asset's own `channelRecolors` plus explicit link resolution.
- [ ] Keep primary selection/default behavior unchanged; do not make the first
  secondary swatch an implicit default.
- [ ] Add reducer actions for set/clear secondary channel intent without adding
  React or browser behavior to the pure slice.
- [ ] Run focused Core/Web tests, package typechecks, and boundaries.
- [ ] Record implementation note, commit hash, and PASS/FAIL evidence here.

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

- [ ] Add failing tests for legacy hash/`v1.` token reads, deterministic v2
  writes, `color.<slot>.<channel>` parsing, invalid-channel warnings, and exact
  token round trips.
- [ ] Add a versioned v2 serializer/parser and `v2.` token codec while keeping
  legacy decoders.
- [ ] Implement a dedicated upstream serializer that never forwards `v=2` or
  `color.*`, preserves representable selections/colors, chooses a deterministic
  visibly dominant value for collisions, and returns loss diagnostics.
- [ ] Surface the upstream-loss warning in Web tooltip/status while leaving the
  link usable.
- [ ] Verify sample upstream URLs syntactically against the public upstream
  contract without requiring `upstream/` initialization.
- [ ] Run focused Core/Web/CLI token and URL tests.
- [ ] Record implementation note, commit hash, and PASS/FAIL evidence here.

### Task 8: Extend presets without changing existing outputs

**Files:**
- Modify: `packages/presets/src/index.ts`
- Modify: `packages/presets/test/presets.test.ts`
- Modify: consuming Web/CLI preset tests

- [ ] Add failing tests for optional non-primary channel values, linked-channel
  rejection, valid transfer on replacement, and unchanged snapshots for every
  existing preset.
- [ ] Extend preset item types/application with optional channel values; do not
  add secondary values to existing presets.
- [ ] Keep random outfit/profile logic from randomizing secondary channels.
- [ ] Run presets typecheck/tests plus Web and CLI preset consumer tests.
- [ ] Record implementation note, commit hash, and PASS/FAIL evidence here.

### Task 9: Build grouped multi-channel Web controls

**Files:**
- Modify: `packages/web/src/slice/color-options.ts`
- Modify: `packages/web/src/components/color-picker.tsx`
- Modify: `packages/web/src/components/layer-stack/type-item-picker.tsx`
- Modify: `packages/web/src/components/layer-stack/layer-row.tsx`
- Modify: `packages/web/src/i18n.ts`
- Modify: focused Web tests and an E2E spec

- [ ] Add failing UI tests for per-channel headings, translated label fallback,
  explicit default buttons, independent selection/clearing, linked read-only
  source/swatch, collapsed summaries, disabled state, keyboard semantics, and
  mobile wrapping/scrolling.
- [ ] Render all channel groups inside the selected item's picker. Keep
  replacement cards compact and free of multi-channel controls.
- [ ] Show summary swatches for primary and explicit secondary overrides only;
  omit asset-default secondary values from the collapsed summary.
- [ ] Add an E2E flow that sets head/expression eyes differently, saves,
  changes state, imports, and observes the exact restored render/state.
- [ ] Run focused Web tests, Web typecheck, and ordinary Web E2E.
- [ ] Record implementation note, commit hash, and PASS/FAIL evidence here.

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

- [ ] Add failing public-command tests for setting and clearing a named channel,
  unknown/invalid colors, linked-channel refusal, v1 migration warnings, atomic
  writes, human output, and `--json` response envelopes.
- [ ] Add a focused public CLI interface equivalent to:
  `character set-color --type <slot> --channel <id> (--color <id> | --default)`.
- [ ] Preserve existing primary `character set --recolor` behavior.
- [ ] Ensure Agent/plugin guidance uses the command rather than manual JSON
  mutation.
- [ ] Update every documentation surface marked `update` in the matrix.
- [ ] Run focused CLI tests, CLI typecheck/build, plugin verification, and
  landing documentation tests.
- [ ] Record implementation note, commit hash, and PASS/FAIL evidence here.

### Task 11: Integration, attribution, migration, and package acceptance

**Files:**
- Modify/Create only focused integration fixtures/tests required by failures
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/ENGINEERING.md`

- [ ] Add cross-package fixtures covering v1→v2→render, v2 Web↔CLI round trip,
  custom legacy pack normalization, linked body changes, independent channels,
  default clearing, upstream lossy diagnostics, and malformed input.
- [ ] Prove every render/export path retains matching credit metadata and
  transactional publication behavior.
- [ ] Prove existing presets/random profiles retain their pre-change output.
- [ ] Run CLI package smoke when production CLI/package output changes.
- [ ] Update architecture and engineering ownership/verification documentation.
- [ ] Record implementation note, commit hash, and PASS/FAIL evidence here.

### Task 12: Final audit and handoff

- [ ] Re-read `AGENTS.md`, all six ADRs, `CONTEXT.md`, and this plan; verify the
  implementation uses canonical terms and does not contradict a decision.
- [ ] Reassess and record the CLI documentation matrix with final `update` or
  `N/A — reason` values.
- [ ] Run: `rtk pnpm check:boundaries`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/core run typecheck`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/core test`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/presets run typecheck`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/presets test`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/web run typecheck`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/web test`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/web test:e2e`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/cli run typecheck`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/cli test`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/cli build`
- [ ] Run: `rtk pnpm --filter @lpc-toolkit/cli test:package`
- [ ] Run: `rtk pnpm verify:plugin`
- [ ] Run: `rtk pnpm verify`
- [ ] Run: `rtk pnpm build`
- [ ] If isolated parity infrastructure is already provisioned, run
  `rtk pnpm --filter @lpc-toolkit/web test:e2e:parity`; otherwise record why it
  was not run without initializing `upstream/`.
- [ ] Confirm `rtk git status --short` contains only intended changes and record
  the final verification evidence and commit hashes.
