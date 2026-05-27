# Animation Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add upstream-style F8 Animation Filters to the v2 web UI: a third section in the settings collapsible with 15 animation checkboxes (noExport hidden), incompatibility detection across `AttributionPopover` / `LayerRow` / `SidebarSearch`, and a one-click Remove Incompatible button.

**Architecture:** New slice `animation-filter.ts` mirrors E1's license-filter structure (`ReadonlySet<AnimationName>` + `itemMatchesAnimationFilter` + `incompatibleAnimationTypeNamesFor`) but with **inverted semantics**: 0 enabled = no filter (upstream `isNodeAnimationCompatible:168`). Predicate includes custom animation base resolution (`wheelchair`→`sit`, `tool_rod`→`thrust`) using existing core helpers. Harness owns the `AnimationFilter` state, computes incompatibility once, and threads props through `StackPanel` to all consumers. Session-only (no URL hash, no localStorage), consistent with E1. Existing license incompatibility props get renamed (`incompatibleCount` → `licenseIncompatibleCount`) for symmetry — done as a separate atomic task to keep diffs reviewable.

**Tech Stack:** TypeScript (strict), React 18 + hooks, Vite, Tailwind, Vitest (node env), pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-05-27-animation-filter-design.md`

**Branch:** `feat/animation-filter` (created off `main`).

---

## Pre-flight

- [ ] **Step 0.1: Create feature branch**

  ```bash
  cd /Users/william/gitRepo/lpc-toolkit-2026-1
  git checkout -b feat/animation-filter
  ```

- [ ] **Step 0.2: Verify baseline tests pass**

  ```bash
  pnpm --filter @lpc-toolkit/core test
  pnpm --filter @lpc-toolkit/web test
  pnpm --filter @lpc-toolkit/web typecheck
  ```

  Expected: all green.

- [ ] **Step 0.3: Verify core barrel exports custom-animation helpers**

  ```bash
  grep -n "customAnimations\|customAnimationBase" packages/core/src/index.ts
  ```

  Expected output includes:
  ```
  88:  customAnimationBase,
  89:  customAnimations,
  ```

  If not present, halt the plan and fix the barrel first. (Per spec §1.4 / R1, these should already be public.)

---

## Task 1: Slice 語意 + unit tests

**Files:**
- Create: `packages/web/src/slice/animation-filter.ts`
- Create: `packages/web/test/animation-filter.test.ts`

**Outcome:** Pure-function slice with `itemMatchesAnimationFilter` (custom anim base resolution included) + `incompatibleAnimationTypeNamesFor`, plus 12 unit tests (8 predicate + 4 helper).

- [ ] **Step 1.1: Write the failing test file**

  Create `packages/web/test/animation-filter.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import type {
    Catalog,
    ItemDefinition,
    AnimationName,
    TypeName,
  } from '@lpc-toolkit/core';
  import {
    incompatibleAnimationTypeNamesFor,
    itemMatchesAnimationFilter,
    type AnimationFilter,
  } from '../src/slice/animation-filter';
  import type { SliceState } from '../src/slice/selection';

  function item(
    name: string,
    animations: readonly AnimationName[],
    typeName: TypeName = 'hair',
  ): ItemDefinition {
    return {
      name,
      type_name: typeName,
      animations,
      credits: [
        { file: `${typeName}/${name}`, notes: '', authors: ['Artist'], licenses: ['CC0'], urls: [] },
      ],
      layer_1: { zPos: 10, male: `${typeName}/${name}/` },
    } as ItemDefinition;
  }

  const NONE: AnimationFilter = new Set<AnimationName>();
  const ONLY_WALK: AnimationFilter = new Set<AnimationName>(['walk']);
  const ONLY_SIT: AnimationFilter = new Set<AnimationName>(['sit']);
  const ONLY_SLASH: AnimationFilter = new Set<AnimationName>(['slash']);

  describe('itemMatchesAnimationFilter', () => {
    it('matches everything when no animation is enabled (0 = All)', () => {
      expect(itemMatchesAnimationFilter(item('a', ['walk']), NONE)).toBe(true);
    });

    it('treats empty animations as compatible (assume compatible)', () => {
      expect(itemMatchesAnimationFilter(item('blank', []), ONLY_WALK)).toBe(true);
    });

    it('matches when item.animations contains a directly-enabled anim', () => {
      expect(
        itemMatchesAnimationFilter(item('a', ['walk', 'slash']), ONLY_WALK),
      ).toBe(true);
    });

    it('rejects when item.animations has none of the enabled anims', () => {
      expect(itemMatchesAnimationFilter(item('a', ['walk']), ONLY_SLASH)).toBe(false);
    });

    it('matches via custom anim base resolution (wheelchair -> sit)', () => {
      expect(
        itemMatchesAnimationFilter(item('wc', ['wheelchair']), ONLY_SIT),
      ).toBe(true);
    });

    it('rejects when custom anim base is not in enabled set (wheelchair -> sit, walk only)', () => {
      expect(
        itemMatchesAnimationFilter(item('wc', ['wheelchair']), ONLY_WALK),
      ).toBe(false);
    });

    it('matches when mix of standard + custom anim resolves to an enabled base', () => {
      expect(
        itemMatchesAnimationFilter(item('mix', ['walk', 'wheelchair']), ONLY_SIT),
      ).toBe(true);
    });

    it('does not throw on unknown custom anim names (silently skip)', () => {
      expect(
        itemMatchesAnimationFilter(item('weird', ['nonexistent_custom']), ONLY_SIT),
      ).toBe(false);
    });
  });

  describe('incompatibleAnimationTypeNamesFor', () => {
    function makeCatalog(items: ItemDefinition[]): Catalog {
      const byTypeName = new Map<TypeName, ItemDefinition[]>();
      for (const it of items) {
        const list = byTypeName.get(it.type_name) ?? [];
        list.push(it);
        byTypeName.set(it.type_name, list);
      }
      return { byTypeName } as unknown as Catalog;
    }

    function makeState(
      selections: Record<TypeName, { name: string; typeName: TypeName }>,
    ): SliceState {
      return {
        bodyType: 'male',
        selections,
        anim: 'walk',
        dir: 'down',
        playing: false,
        zoom: 4,
      } as SliceState;
    }

    it('returns empty when filter is empty (0 enabled = All, all compatible)', () => {
      const walkItem = item('a', ['walk']);
      const catalog = makeCatalog([walkItem]);
      const state = makeState({ hair: { name: 'a', typeName: 'hair' } });
      expect(incompatibleAnimationTypeNamesFor(state, catalog, NONE)).toEqual([]);
    });

    it('returns type names whose item lacks any enabled anim', () => {
      const walkOnly = item('walk_only', ['walk']);
      const catalog = makeCatalog([walkOnly]);
      const state = makeState({ hair: { name: 'walk_only', typeName: 'hair' } });
      expect(
        incompatibleAnimationTypeNamesFor(state, catalog, ONLY_SLASH),
      ).toEqual(['hair']);
    });

    it('skips selections whose item is not in catalog', () => {
      const catalog = makeCatalog([item('present', ['walk'])]);
      const state = makeState({ hair: { name: 'missing', typeName: 'hair' } });
      expect(
        incompatibleAnimationTypeNamesFor(state, catalog, ONLY_SLASH),
      ).toEqual([]);
    });

    it('collects all incompatible type names when multiple selections fail', () => {
      const walkHair = item('walk_hair', ['walk'], 'hair');
      const walkClothes = item('walk_clothes', ['walk'], 'clothes');
      const catalog = makeCatalog([walkHair, walkClothes]);
      const state = makeState({
        hair: { name: 'walk_hair', typeName: 'hair' },
        clothes: { name: 'walk_clothes', typeName: 'clothes' },
      });
      const result = incompatibleAnimationTypeNamesFor(state, catalog, ONLY_SLASH);
      expect(result).toHaveLength(2);
      expect(result).toEqual(expect.arrayContaining(['hair', 'clothes']));
    });
  });
  ```

- [ ] **Step 1.2: Run the test to verify it fails**

  ```bash
  pnpm --filter @lpc-toolkit/web test test/animation-filter.test.ts
  ```

  Expected: FAIL with "Cannot find module '../src/slice/animation-filter'" or equivalent.

- [ ] **Step 1.3: Create the slice file**

  Create `packages/web/src/slice/animation-filter.ts`:

  ```ts
  import {
    customAnimationBase,
    customAnimations,
    type AnimationName,
    type Catalog,
    type ItemDefinition,
    type TypeName,
  } from '@lpc-toolkit/core';
  import type { SliceState } from './selection';

  export type AnimationFilter = ReadonlySet<AnimationName>;

  export function itemMatchesAnimationFilter(
    item: ItemDefinition,
    enabled: AnimationFilter,
  ): boolean {
    if (enabled.size === 0) return true;
    if (item.animations.length === 0) return true;
    for (const anim of item.animations) {
      if (enabled.has(anim)) return true;
      const def = customAnimations[anim];
      if (!def) continue;
      const base = customAnimationBase(def);
      if (enabled.has(base)) return true;
    }
    return false;
  }

  export function incompatibleAnimationTypeNamesFor(
    state: SliceState,
    catalog: Catalog,
    enabled: AnimationFilter,
  ): TypeName[] {
    const out: TypeName[] = [];
    for (const [tn, sel] of Object.entries(state.selections)) {
      const item = (catalog.byTypeName.get(tn) ?? []).find(
        (d) => d.name === sel.name,
      );
      if (item && !itemMatchesAnimationFilter(item, enabled)) out.push(tn);
    }
    return out;
  }
  ```

- [ ] **Step 1.4: Run the tests to verify all 12 pass**

  ```bash
  pnpm --filter @lpc-toolkit/web test test/animation-filter.test.ts
  ```

  Expected: 12 tests pass (8 in `itemMatchesAnimationFilter`, 4 in `incompatibleAnimationTypeNamesFor`).

- [ ] **Step 1.5: Run the full web test suite to catch unrelated breaks**

  ```bash
  pnpm --filter @lpc-toolkit/web test
  ```

  Expected: all tests green; total count = baseline + 12.

- [ ] **Step 1.6: Typecheck**

  ```bash
  pnpm --filter @lpc-toolkit/web typecheck
  ```

  Expected: no errors.

- [ ] **Step 1.7: Commit**

  ```bash
  git add packages/web/src/slice/animation-filter.ts packages/web/test/animation-filter.test.ts
  git commit -m "$(cat <<'EOF'
  feat(web): add animation-filter slice with custom anim base resolution

  Pure slice + 12 unit tests. itemMatchesAnimationFilter follows upstream
  isNodeAnimationCompatible: 0 enabled = compatible (no filter), empty
  item.animations = compatible, otherwise either direct match or custom
  animation base lookup (wheelchair -> sit, tool_rod -> thrust).
  incompatibleAnimationTypeNamesFor mirrors the license-filter sibling.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 2: i18n keys (en + zh-TW) + `attribution.incompatibleShort` rename

**Files:**
- Modify: `packages/web/src/i18n.ts` (en block + zh-TW block)
- Modify: `packages/web/src/components/layer-stack/popovers/attribution-popover.tsx` (one i18n call rename)

**Outcome:** 9 new keys present in both locales; `attribution.incompatibleShort` renamed to `attribution.licenseIncompatibleShort` everywhere it's referenced.

- [ ] **Step 2.1: Edit en block — add 9 new keys + rename existing**

  In `packages/web/src/i18n.ts`, replace line 111:

  ```ts
      'attribution.incompatibleShort': 'Not in enabled licenses',
  ```

  with (note the new key name and the 2 new attribution short keys):

  ```ts
      'attribution.licenseIncompatibleShort': 'License not enabled',
      'attribution.animationIncompatibleShort': 'Missing enabled animations',
  ```

  Then, after line 133 (`'layer.licenseIncompatibleTooltip': 'Does not match enabled license groups',`), insert:

  ```ts
      'animationFilter.title': 'Animation Filter',
      'animationFilter.enabledCount': 'active: {n}',
      'animationFilter.removeIncompatible': 'Remove {n} incompatible asset(s)',
      'animationFilter.incompatibleNotice': '{n} selected item(s) lack the enabled animations',
      'animationFilter.removed': 'Removed {n} animation-incompatible asset(s)',
      'layer.animationIncompatibleTooltip': 'Lacks the enabled animations',
      'layer.bothIncompatibleTooltip': 'License & animation filter mismatch',
  ```

- [ ] **Step 2.2: Edit zh-TW block — add 9 corresponding keys + rename existing**

  In `packages/web/src/i18n.ts`, replace line 240:

  ```ts
      'attribution.incompatibleShort': '不在啟用授權內',
  ```

  with:

  ```ts
      'attribution.licenseIncompatibleShort': '授權未啟用',
      'attribution.animationIncompatibleShort': '缺少啟用的動畫',
  ```

  After line 262 (`'layer.licenseIncompatibleTooltip': '不在啟用授權群組內',`), insert:

  ```ts
      'animationFilter.title': '動畫過濾器',
      'animationFilter.enabledCount': '啟用 {n}',
      'animationFilter.removeIncompatible': '移除 {n} 個不相容素材',
      'animationFilter.incompatibleNotice': '{n} 個已選素材缺少啟用的動畫',
      'animationFilter.removed': '已移除 {n} 個動畫不相容素材',
      'layer.animationIncompatibleTooltip': '不包含啟用的動畫',
      'layer.bothIncompatibleTooltip': '授權與動畫過濾皆不相容',
  ```

- [ ] **Step 2.3: Rename the i18n call in `attribution-popover.tsx`**

  In `packages/web/src/components/layer-stack/popovers/attribution-popover.tsx`, line 117 currently reads:

  ```tsx
                {r.incompatible && <div className="text-[10px]">{t('attribution.incompatibleShort')}</div>}
  ```

  Change the i18n key (Task 5 will rewrite this line further; for now just rename):

  ```tsx
                {r.incompatible && <div className="text-[10px]">{t('attribution.licenseIncompatibleShort')}</div>}
  ```

- [ ] **Step 2.4: Typecheck**

  ```bash
  pnpm --filter @lpc-toolkit/web typecheck
  ```

  Expected: no errors (both en and zh-TW blocks have the same keys; `TranslationKey` is a `keyof`).

- [ ] **Step 2.5: Run tests**

  ```bash
  pnpm --filter @lpc-toolkit/web test
  ```

  Expected: all green.

- [ ] **Step 2.6: Commit**

  ```bash
  git add packages/web/src/i18n.ts packages/web/src/components/layer-stack/popovers/attribution-popover.tsx
  git commit -m "$(cat <<'EOF'
  feat(web): add animation-filter i18n keys, rename attribution.incompatibleShort

  Adds 9 new keys for animation-filter UI (en + zh-TW). Renames the existing
  attribution.incompatibleShort to attribution.licenseIncompatibleShort to
  make room for the new attribution.animationIncompatibleShort sibling.
  Updates the single reference in attribution-popover.tsx atomically.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 3: License incompatibility prop rename (no behavior change)

**Files:**
- Modify: `packages/web/src/components/layer-stack/harness.tsx`
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`
- Modify: `packages/web/src/components/layer-stack/settings-collapsible.tsx`

**Outcome:** `incompatibleCount` → `licenseIncompatibleCount`, `removeIncompatibleSelections` → `removeLicenseIncompatibleSelections`, and the harness's internal `incompatibleTypeNames` variable → `licenseIncompatibleTypeNames`. UI behavior is unchanged. This sets up Task 4 to add the parallel `animationIncompatibleCount` / `removeAnimationIncompatibleSelections`.

- [ ] **Step 3.1: Rename in `harness.tsx`**

  In `packages/web/src/components/layer-stack/harness.tsx`, locate the block at lines 87-102 (license incompatibility memo + remove handler) and rename:

  - `incompatibleTypeNames` → `licenseIncompatibleTypeNames`
  - `incompatibleCount` → `licenseIncompatibleCount`
  - `removeIncompatibleSelections` → `removeLicenseIncompatibleSelections`

  After edit, the block should read:

  ```tsx
    const licenseIncompatibleTypeNames = useMemo(
      () => incompatibleTypeNamesFor(props.state, props.catalog, licenseFilter),
      [props.state, props.catalog, licenseFilter],
    );
    const licenseIncompatibleCount = licenseIncompatibleTypeNames.length;

    const removeLicenseIncompatibleSelections = useCallback(() => {
      if (licenseIncompatibleTypeNames.length === 0) return;
      for (const tn of licenseIncompatibleTypeNames) {
        props.dispatch({ type: 'clear', typeName: tn });
      }
      setStatus({
        kind: 'info',
        text: t('licenseFilter.removed').replace('{n}', String(licenseIncompatibleTypeNames.length)),
      });
    }, [licenseIncompatibleTypeNames, props.dispatch, t]);
  ```

  Then, at the `<StackPanel>` JSX (lines 289-308 in the original), rename the prop names:

  ```diff
    <StackPanel
      …
      licenseFilter={licenseFilter}
      toggleLicenseGroup={toggleLicenseGroup}
  -   incompatibleCount={incompatibleCount}
  -   removeIncompatibleSelections={removeIncompatibleSelections}
  +   licenseIncompatibleCount={licenseIncompatibleCount}
  +   removeLicenseIncompatibleSelections={removeLicenseIncompatibleSelections}
      …
    />
  ```

- [ ] **Step 3.2: Rename in `stack-panel.tsx`**

  In `packages/web/src/components/layer-stack/stack-panel.tsx`:

  Rename the props (interface lines 22-23 currently):

  ```diff
    interface Props {
      …
      licenseFilter: LicenseFilter;
      toggleLicenseGroup: (group: LicenseGroup) => void;
  -   incompatibleCount: number;
  -   removeIncompatibleSelections: () => void;
  +   licenseIncompatibleCount: number;
  +   removeLicenseIncompatibleSelections: () => void;
      …
    }
  ```

  Rename in the destructure (around lines 41-44):

  ```diff
    export function StackPanel({
      …
      licenseFilter,
      toggleLicenseGroup,
  -   incompatibleCount,
  -   removeIncompatibleSelections,
  +   licenseIncompatibleCount,
  +   removeLicenseIncompatibleSelections,
      …
    }: Props) {
  ```

  Rename in the `<SettingsCollapsible>` JSX (around lines 147-148):

  ```diff
    <SettingsCollapsible
      t={t}
      licenseFilter={licenseFilter}
      toggleLicenseGroup={toggleLicenseGroup}
  -   incompatibleCount={incompatibleCount}
  -   removeIncompatibleSelections={removeIncompatibleSelections}
  +   licenseIncompatibleCount={licenseIncompatibleCount}
  +   removeLicenseIncompatibleSelections={removeLicenseIncompatibleSelections}
      assetSource={assetSource}
      setAssetSource={setAssetSource}
    />
  ```

- [ ] **Step 3.3: Rename in `settings-collapsible.tsx`**

  In `packages/web/src/components/layer-stack/settings-collapsible.tsx`:

  Props interface (lines 16-17):

  ```diff
    interface Props {
      t: Translator;
      licenseFilter: LicenseFilter;
      toggleLicenseGroup: (group: LicenseGroup) => void;
  -   incompatibleCount: number;
  -   removeIncompatibleSelections: () => void;
  +   licenseIncompatibleCount: number;
  +   removeLicenseIncompatibleSelections: () => void;
      assetSource: AssetSource;
      setAssetSource: (v: AssetSource) => void;
    }
  ```

  Function destructure (lines 28-29):

  ```diff
    export function SettingsCollapsible({
      t,
      licenseFilter,
      toggleLicenseGroup,
  -   incompatibleCount,
  -   removeIncompatibleSelections,
  +   licenseIncompatibleCount,
  +   removeLicenseIncompatibleSelections,
      assetSource,
      setAssetSource,
    }: Props) {
  ```

  Usages inside the JSX (lines 94 + 103 + 106):

  ```diff
  -           {incompatibleCount > 0 && (
  +           {licenseIncompatibleCount > 0 && (
                <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
                  <p className="mb-2 text-[11px] text-amber-500">
                    ⚠️{' '}
  -                 {t('licenseFilter.incompatibleNotice').replace('{n}', String(incompatibleCount))}
  +                 {t('licenseFilter.incompatibleNotice').replace('{n}', String(licenseIncompatibleCount))}
                  </p>
                  <Button
                    size="sm"
                    variant="primary"
  -                 onClick={removeIncompatibleSelections}
  +                 onClick={removeLicenseIncompatibleSelections}
                    className="w-full"
                  >
  -                 {t('licenseFilter.removeIncompatible').replace('{n}', String(incompatibleCount))}
  +                 {t('licenseFilter.removeIncompatible').replace('{n}', String(licenseIncompatibleCount))}
                  </Button>
                </div>
              )}
  ```

- [ ] **Step 3.4: Typecheck**

  ```bash
  pnpm --filter @lpc-toolkit/web typecheck
  ```

  Expected: no errors.

- [ ] **Step 3.5: Run tests**

  ```bash
  pnpm --filter @lpc-toolkit/web test
  ```

  Expected: all green (no test references these prop names directly).

- [ ] **Step 3.6: Manual smoke — confirm no behavioral regression**

  Start the dev server:

  ```bash
  pnpm --filter @lpc-toolkit/web dev
  ```

  In a browser:
  1. Open the Filters collapsible
  2. Uncheck a license group → confirm the existing "Remove Incompatible (N)" button still works (if any selection becomes incompatible)
  3. Click it → confirm selection is cleared + status toast appears

  Stop the dev server.

- [ ] **Step 3.7: Commit**

  ```bash
  git add packages/web/src/components/layer-stack/harness.tsx packages/web/src/components/layer-stack/stack-panel.tsx packages/web/src/components/layer-stack/settings-collapsible.tsx
  git commit -m "$(cat <<'EOF'
  refactor(web): rename license incompatibility props to license-prefixed names

  No behavior change. Renames incompatibleCount -> licenseIncompatibleCount,
  removeIncompatibleSelections -> removeLicenseIncompatibleSelections, and
  the internal harness variable incompatibleTypeNames -> licenseIncompatible
  TypeNames. Sets up Task 4 to add the parallel animation-* names without
  forcing reviewers to disentangle a rename from new functionality.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 4: Harness animation state + `SettingsCollapsible` third section + reset

**Files:**
- Modify: `packages/web/src/components/layer-stack/harness.tsx`
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`
- Modify: `packages/web/src/components/layer-stack/settings-collapsible.tsx`

**Outcome:** `animationFilter` state lives in the harness; 4 new props flow to `SettingsCollapsible`; the third filter section renders with 15 checkboxes (noExport hidden), counter chip, and conditional Remove Incompatible button; Reset menu's `filters` scope clears both filters. `LayerRow` / `SidebarSearch` / `AttributionPopover` still see only `licenseFilter` (Task 5 wires their badges).

- [ ] **Step 4.1: Update `harness.tsx` imports**

  In `packages/web/src/components/layer-stack/harness.tsx`, replace the existing core import block (around lines 2-11) and add the slice import. The full replacement for lines 1-25:

  ```tsx
  import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
  import {
    composeSelections,
    makeResolvePalette,
    type AnimationName,
    type Catalog,
    type HashWarning,
    type LicenseGroup,
    type PaletteMetadata,
    type Selections,
    type TypeName,
  } from '@lpc-toolkit/core';
  import type {
    FullSheetUiState,
    FullSheetUiActions,
    FullSheetZoom,
  } from './preview-pane';
  import { useUrlHashSync } from '../../lib/url-hash-sync';
  import type { SliceState, SliceAction } from '../../slice/selection';
  import type { Locale, Translator, LabelTranslator } from '../../i18n';
  import type { AssetSource } from '../../adapter/asset-source';
  import {
    ALL_LICENSE_GROUPS,
    incompatibleTypeNamesFor,
    type LicenseFilter,
  } from '../../slice/license-filter';
  import {
    incompatibleAnimationTypeNamesFor,
    type AnimationFilter,
  } from '../../slice/animation-filter';
  ```

  (The only changes from the existing imports are: added `type AnimationName` to the core import; added the new `animation-filter` slice import block.)

- [ ] **Step 4.2: Add animation state + toggle + memo + remove in `harness.tsx`**

  Right after the existing `toggleLicenseGroup` declaration (currently lines 78-85), and right after the existing license memo+remove block (now renamed by Task 3), add the animation block. The full new sequence (replacing lines 78-102 of the post-Task-3 file) should be:

  ```tsx
    const toggleLicenseGroup = useCallback((group: LicenseGroup) => {
      setLicenseFilter((prev) => {
        const next = new Set(prev);
        if (next.has(group)) next.delete(group);
        else next.add(group);
        return next;
      });
    }, []);

    const toggleAnimation = useCallback((anim: AnimationName) => {
      setAnimationFilter((prev) => {
        const next = new Set(prev);
        if (next.has(anim)) next.delete(anim);
        else next.add(anim);
        return next;
      });
    }, []);

    const licenseIncompatibleTypeNames = useMemo(
      () => incompatibleTypeNamesFor(props.state, props.catalog, licenseFilter),
      [props.state, props.catalog, licenseFilter],
    );
    const licenseIncompatibleCount = licenseIncompatibleTypeNames.length;

    const removeLicenseIncompatibleSelections = useCallback(() => {
      if (licenseIncompatibleTypeNames.length === 0) return;
      for (const tn of licenseIncompatibleTypeNames) {
        props.dispatch({ type: 'clear', typeName: tn });
      }
      setStatus({
        kind: 'info',
        text: t('licenseFilter.removed').replace('{n}', String(licenseIncompatibleTypeNames.length)),
      });
    }, [licenseIncompatibleTypeNames, props.dispatch, t]);

    const animationIncompatibleTypeNames = useMemo(
      () => incompatibleAnimationTypeNamesFor(props.state, props.catalog, animationFilter),
      [props.state, props.catalog, animationFilter],
    );
    const animationIncompatibleCount = animationIncompatibleTypeNames.length;

    const removeAnimationIncompatibleSelections = useCallback(() => {
      if (animationIncompatibleTypeNames.length === 0) return;
      for (const tn of animationIncompatibleTypeNames) {
        props.dispatch({ type: 'clear', typeName: tn });
      }
      setStatus({
        kind: 'info',
        text: t('animationFilter.removed').replace('{n}', String(animationIncompatibleTypeNames.length)),
      });
    }, [animationIncompatibleTypeNames, props.dispatch, t]);
  ```

  Above that block (where `licenseFilter` state is declared, line 61 originally), add the animation state right below:

  ```diff
    const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>(ALL_LICENSE_GROUPS);
  + const [animationFilter, setAnimationFilter] = useState<AnimationFilter>(
  +   () => new Set<AnimationName>(),
  + );
    const [status, setStatus] = useState<{ kind: 'info' | 'warn' | 'error'; text: string } | null>(null);
  ```

- [ ] **Step 4.3: Update Reset menu wiring in `harness.tsx`**

  In the `<ResetMenuPopover>` `onReset` callback (currently around lines 244-252), add the second filter clear:

  ```diff
    onReset={({ outfit, view, filters }) => {
      if (outfit || view) {
        props.onReset({ outfit, view });
      }
      if (filters) {
        setLicenseFilter(ALL_LICENSE_GROUPS);
  +     setAnimationFilter(new Set<AnimationName>());
      }
      setStatus({ kind: 'info', text: 'Reset ✓' });
    }}
  ```

- [ ] **Step 4.4: Update `<StackPanel>` JSX in `harness.tsx`**

  In the `<StackPanel>` block, add 4 new animation props alongside the existing license props:

  ```diff
    <StackPanel
      catalog={props.catalog}
      palettes={props.palettes}
      state={props.state}
      dispatch={props.dispatch}
      shownTypeNames={props.shownTypeNames}
      licenseFilter={licenseFilter}
      toggleLicenseGroup={toggleLicenseGroup}
      licenseIncompatibleCount={licenseIncompatibleCount}
      removeLicenseIncompatibleSelections={removeLicenseIncompatibleSelections}
  +   animationFilter={animationFilter}
  +   toggleAnimation={toggleAnimation}
  +   animationIncompatibleCount={animationIncompatibleCount}
  +   removeAnimationIncompatibleSelections={removeAnimationIncompatibleSelections}
      assetSource={props.assetSource}
      setAssetSource={props.onAssetSourceChange}
      …
    />
  ```

  (Don't touch `<AttributionPopover>` here — Task 5 will add `animationFilter` to it.)

- [ ] **Step 4.5: Update `stack-panel.tsx` imports & Props interface**

  In `packages/web/src/components/layer-stack/stack-panel.tsx`, update the imports (around lines 1-12):

  ```tsx
  import { useEffect, useMemo, useState, type RefObject } from 'react';
  import type { AnimationName, Catalog, LicenseGroup, PaletteMetadata, TypeName } from '@lpc-toolkit/core';
  import type { SliceState, SliceAction } from '../../slice/selection';
  import type { Translator, LabelTranslator } from '../../i18n';
  import { type LicenseFilter } from '../../slice/license-filter';
  import { type AnimationFilter } from '../../slice/animation-filter';
  import type { AssetSource } from '../../adapter/asset-source';
  import { LayerRow } from './layer-row';
  import { AddLayer } from './add-layer';
  import { PresetChips } from './preset-chips';
  import { StatusToast } from './status-toast';
  import { SettingsCollapsible } from './settings-collapsible';
  import { SidebarSearch } from './sidebar-search';
  ```

  Update the `Props` interface — add 4 new props after the license block:

  ```diff
    interface Props {
      catalog: Catalog;
      palettes: PaletteMetadata;
      state: SliceState;
      dispatch: (a: SliceAction) => void;
      shownTypeNames: string[];
      licenseFilter: LicenseFilter;
      toggleLicenseGroup: (group: LicenseGroup) => void;
      licenseIncompatibleCount: number;
      removeLicenseIncompatibleSelections: () => void;
  +   animationFilter: AnimationFilter;
  +   toggleAnimation: (anim: AnimationName) => void;
  +   animationIncompatibleCount: number;
  +   removeAnimationIncompatibleSelections: () => void;
      assetSource: AssetSource;
      setAssetSource: (v: AssetSource) => void;
      t: Translator;
      tl: LabelTranslator;
      onPresetApplied: (name: string, skippedCount: number, skippedTypes: string[]) => void;
      status: { kind: 'info' | 'warn' | 'error'; text: string } | null;
      searchInputRef: RefObject<HTMLInputElement>;
      expanded: TypeName | null;
      setExpanded: (v: TypeName | null) => void;
    }
  ```

- [ ] **Step 4.6: Update `stack-panel.tsx` destructure + thread props to `SettingsCollapsible`**

  Update the function signature destructure:

  ```diff
    export function StackPanel({
      catalog,
      palettes,
      state,
      dispatch,
      shownTypeNames,
      licenseFilter,
      toggleLicenseGroup,
      licenseIncompatibleCount,
      removeLicenseIncompatibleSelections,
  +   animationFilter,
  +   toggleAnimation,
  +   animationIncompatibleCount,
  +   removeAnimationIncompatibleSelections,
      assetSource,
      setAssetSource,
      t,
      tl,
      onPresetApplied,
      status,
      searchInputRef,
      expanded,
      setExpanded,
    }: Props) {
  ```

  Thread the 4 new props into `<SettingsCollapsible>`:

  ```diff
    <SettingsCollapsible
      t={t}
      licenseFilter={licenseFilter}
      toggleLicenseGroup={toggleLicenseGroup}
      licenseIncompatibleCount={licenseIncompatibleCount}
      removeLicenseIncompatibleSelections={removeLicenseIncompatibleSelections}
  +   animationFilter={animationFilter}
  +   toggleAnimation={toggleAnimation}
  +   animationIncompatibleCount={animationIncompatibleCount}
  +   removeAnimationIncompatibleSelections={removeAnimationIncompatibleSelections}
      assetSource={assetSource}
      setAssetSource={setAssetSource}
    />
  ```

  (Do NOT add `animationFilter` to `<SidebarSearch>` or `<LayerRow>` yet — Task 5 handles those.)

- [ ] **Step 4.7: Update `settings-collapsible.tsx` imports + module-level constant**

  In `packages/web/src/components/layer-stack/settings-collapsible.tsx`, expand the imports (lines 1-10):

  ```tsx
  import { useState } from 'react';
  import {
    ANIMATIONS,
    LICENSE_CONFIG,
    LICENSE_GROUP_ORDER,
    type AnimationName,
    type LicenseGroup,
  } from '@lpc-toolkit/core';
  import { Button } from '../ui/button';
  import type { LicenseFilter } from '../../slice/license-filter';
  import type { AnimationFilter } from '../../slice/animation-filter';
  import type { AssetSource } from '../../adapter/asset-source';
  import type { Translator } from '../../i18n';
  ```

  Below the existing `TOTAL_GROUPS` constant (line 22), add the visible-animations constant:

  ```diff
    const TOTAL_GROUPS = LICENSE_GROUP_ORDER.length;
  + const VISIBLE_ANIMATIONS = ANIMATIONS.filter((a) => !a.noExport);
  ```

- [ ] **Step 4.8: Extend `settings-collapsible.tsx` Props interface**

  ```diff
    interface Props {
      t: Translator;
      licenseFilter: LicenseFilter;
      toggleLicenseGroup: (group: LicenseGroup) => void;
      licenseIncompatibleCount: number;
      removeLicenseIncompatibleSelections: () => void;
  +   animationFilter: AnimationFilter;
  +   toggleAnimation: (anim: AnimationName) => void;
  +   animationIncompatibleCount: number;
  +   removeAnimationIncompatibleSelections: () => void;
      assetSource: AssetSource;
      setAssetSource: (v: AssetSource) => void;
    }
  ```

  Update the destructure:

  ```diff
    export function SettingsCollapsible({
      t,
      licenseFilter,
      toggleLicenseGroup,
      licenseIncompatibleCount,
      removeLicenseIncompatibleSelections,
  +   animationFilter,
  +   toggleAnimation,
  +   animationIncompatibleCount,
  +   removeAnimationIncompatibleSelections,
      assetSource,
      setAssetSource,
    }: Props) {
  ```

- [ ] **Step 4.9: Update the header chip logic in `settings-collapsible.tsx`**

  The current implementation (lines 34-35 + 45-49) has a single `showCountBadge`. Replace with dual-chip logic. Around lines 33-51, the final state should look like:

  ```tsx
    const [open, setOpen] = useState(false);
    const enabledLicenseCount = licenseFilter.size;
    const showLicenseChip = enabledLicenseCount < TOTAL_GROUPS;
    const enabledAnimCount = animationFilter.size;
    const showAnimChip = enabledAnimCount > 0;

    return (
      <div className="border-t border-border bg-app">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-mute hover:bg-surface-2"
        >
          <span>{t('filters.title')}</span>
          {showLicenseChip && (
            <span className="rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-[9px] font-normal normal-case text-accent">
              License {enabledLicenseCount}/{TOTAL_GROUPS}
            </span>
          )}
          {showAnimChip && (
            <span className="rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-[9px] font-normal normal-case text-accent">
              Anim {enabledAnimCount}/{VISIBLE_ANIMATIONS.length}
            </span>
          )}
          <span className="ml-auto">{open ? '▾' : '▸'}</span>
        </button>
  ```

- [ ] **Step 4.10: Insert the Animation section JSX in `settings-collapsible.tsx`**

  In the open-body of the collapsible, between the existing License `<div>` and the Asset Source `<div>` (currently lines 110-129 — between the closing `</div>` of the license block and the opening `<div>` of asset source), insert the new animation block:

  ```tsx
            <div>
              <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-text-mute">
                <span>{t('animationFilter.title')}</span>
                <span className="font-normal normal-case text-text-dim">
                  {t('animationFilter.enabledCount').replace('{n}', String(enabledAnimCount))}
                </span>
              </div>
              <ul className="flex flex-col gap-1">
                {VISIBLE_ANIMATIONS.map((anim) => {
                  const checked = animationFilter.has(anim.value);
                  return (
                    <li key={anim.value} className="flex items-center gap-2">
                      <label className="flex flex-1 items-center gap-2 text-[11px] text-text cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAnimation(anim.value)}
                          className="h-3 w-3 accent-accent"
                        />
                        <span className="font-mono">{anim.label}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              {animationIncompatibleCount > 0 && (
                <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
                  <p className="mb-2 text-[11px] text-amber-500">
                    ⚠️{' '}
                    {t('animationFilter.incompatibleNotice').replace('{n}', String(animationIncompatibleCount))}
                  </p>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={removeAnimationIncompatibleSelections}
                    className="w-full"
                  >
                    {t('animationFilter.removeIncompatible').replace('{n}', String(animationIncompatibleCount))}
                  </Button>
                </div>
              )}
            </div>
  ```

- [ ] **Step 4.11: Typecheck**

  ```bash
  pnpm --filter @lpc-toolkit/web typecheck
  ```

  Expected: no errors. If errors mention missing `animationFilter` on `<SidebarSearch>` / `<LayerRow>` / `<AttributionPopover>`, you over-applied — those don't get `animationFilter` until Task 5.

- [ ] **Step 4.12: Run tests**

  ```bash
  pnpm --filter @lpc-toolkit/web test
  ```

  Expected: all green.

- [ ] **Step 4.13: Manual smoke — filter UI works in isolation**

  ```bash
  pnpm --filter @lpc-toolkit/web dev
  ```

  In the browser:
  1. Open the Filters collapsible — see License section, **new Animation Filter section** (15 checkboxes — Spellcast, Thrust, Walk, Slash, Shoot, Hurt, Climb, Idle, Jump, Sit, Emote, Run, Combat Idle, 1-Handed Backslash, 1-Handed Halfslash), Asset Source section
  2. Confirm `Watering` and `1-Handed Slash` (the two `noExport` anims) are **not** in the list
  3. Header chip: with everything default, you should see only the License chip (if any group is unchecked) or no chips. Anim chip is hidden.
  4. Check `Walk` → see new header chip `Anim 1/15` appear
  5. Pick a few items, then check `Sit` while unchecking everything else → items lacking `sit` (or a custom anim resolving to `sit`) should make `animationIncompatibleCount > 0` → see the amber warning + "Remove Incompatible (N)" button
  6. Click "Remove Incompatible" → selections cleared + toast appears "Removed N animation-incompatible asset(s)"
  7. Open Reset menu → tick **Filters** → click Reset → confirm: license back to all-enabled, animation back to none (warning vanishes, anim chip disappears)
  8. Switch locale (zh-TW button in top bar) → all new text in zh-TW
  9. **What you should NOT see yet** (Task 5 wires these): ⚠ badges on individual LayerRow swap items, SidebarSearch rows, or AttributionPopover

  Stop the dev server.

- [ ] **Step 4.14: Commit**

  ```bash
  git add packages/web/src/components/layer-stack/harness.tsx packages/web/src/components/layer-stack/stack-panel.tsx packages/web/src/components/layer-stack/settings-collapsible.tsx
  git commit -m "$(cat <<'EOF'
  feat(web): add animation filter section + harness state + reset wiring

  Adds the third section to SettingsCollapsible (15 checkboxes, noExport
  anims hidden), header dual-chip (License N/4, Anim N/15), warning +
  Remove Incompatible button, and harness-side state. Reset menu's
  'filters' scope now clears both license and animation filters.
  LayerRow / SidebarSearch / AttributionPopover do not yet show
  per-item animation badges — that lands in Task 5.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 5: Callsite ⚠ badges (AttributionPopover + LayerRow + SidebarSearch)

**Files:**
- Modify: `packages/web/src/components/layer-stack/harness.tsx` (one prop on AttributionPopover)
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx` (props drilling to LayerRow + SidebarSearch)
- Modify: `packages/web/src/components/layer-stack/popovers/attribution-popover.tsx`
- Modify: `packages/web/src/components/layer-stack/layer-row.tsx`
- Modify: `packages/web/src/components/layer-stack/sidebar-search.tsx`

**Outcome:** ⚠ badges appear on items that fail either license OR animation filter. Tooltips disambiguate "license only" / "animation only" / "both".

- [ ] **Step 5.1: Thread `animationFilter` through harness → AttributionPopover**

  In `packages/web/src/components/layer-stack/harness.tsx`, find `<AttributionPopover>` (around line 254) and add the new prop:

  ```diff
    <AttributionPopover
      open={popover === 'attribution'}
      setOpen={(v) => setPopover(v ? 'attribution' : null)}
      catalog={props.catalog}
      state={props.state}
      licenseFilter={licenseFilter}
  +   animationFilter={animationFilter}
      t={props.t}
      tl={props.tl}
    />
  ```

- [ ] **Step 5.2: Thread `animationFilter` through stack-panel → LayerRow + SidebarSearch**

  In `packages/web/src/components/layer-stack/stack-panel.tsx`, update both child usages:

  ```diff
    <SidebarSearch
      catalog={catalog}
      palettes={palettes}
      state={state}
      dispatch={dispatch}
      assetSource={assetSource}
      shownTypeNames={shownTypeNames}
      licenseFilter={licenseFilter}
  +   animationFilter={animationFilter}
      t={t}
      tl={tl}
      onPicked={(tn) => setExpanded(tn)}
      inputRef={searchInputRef}
    />
    …
    <LayerRow
      key={tn}
      typeName={tn}
      catalog={catalog}
      palettes={palettes}
      state={state}
      dispatch={dispatch}
      tl={tl}
      t={t}
      licenseFilter={licenseFilter}
  +   animationFilter={animationFilter}
      assetSource={assetSource}
      expanded={expanded === tn}
      onToggle={() => setExpanded(expanded === tn ? null : tn)}
    />
  ```

- [ ] **Step 5.3: Update `attribution-popover.tsx` — imports + Props + Row interface**

  In `packages/web/src/components/layer-stack/popovers/attribution-popover.tsx`:

  Imports (around lines 1-15):

  ```tsx
  import { useMemo } from 'react';
  import {
    computeEffectiveLicense,
    type Catalog,
    type ItemDefinition,
    type License,
  } from '@lpc-toolkit/core';
  import { Button } from '../../ui/button';
  import { usePopover } from './use-popover';
  import {
    itemMatchesLicenseFilter,
    type LicenseFilter,
  } from '../../../slice/license-filter';
  import {
    itemMatchesAnimationFilter,
    type AnimationFilter,
  } from '../../../slice/animation-filter';
  import type { SliceState } from '../../../slice/selection';
  import type { LabelTranslator, Translator } from '../../../i18n';
  ```

  Props interface (around lines 17-25):

  ```diff
    interface Props {
      open: boolean;
      setOpen: (v: boolean) => void;
      catalog: Catalog;
      state: SliceState;
      licenseFilter: LicenseFilter;
  +   animationFilter: AnimationFilter;
      t: Translator;
      tl: LabelTranslator;
    }
  ```

  `Row` interface (around lines 27-33):

  ```diff
    interface Row {
      typeName: string;
      item: ItemDefinition;
      effective: License;
      authors: string[];
  -   incompatible: boolean;
  +   licenseIncompatible: boolean;
  +   animationIncompatible: boolean;
    }
  ```

  Function signature destructure (line 35):

  ```diff
  - export function AttributionPopover({ open, setOpen, catalog, state, licenseFilter, t, tl }: Props) {
  + export function AttributionPopover({ open, setOpen, catalog, state, licenseFilter, animationFilter, t, tl }: Props) {
  ```

- [ ] **Step 5.4: Update `attribution-popover.tsx` — useMemo + render**

  Inside the `rows = useMemo<Row[]>(...)` body (currently lines 38-79), modify the `out.push({...})` call (around lines 70-76) to set both flags:

  ```diff
        out.push({
          typeName: tn,
          item,
          effective,
          authors: allAuthors,
  -       incompatible: !itemMatchesLicenseFilter(item, licenseFilter),
  +       licenseIncompatible: !itemMatchesLicenseFilter(item, licenseFilter),
  +       animationIncompatible: !itemMatchesAnimationFilter(item, animationFilter),
        });
      }
      return out;
  -   }, [catalog, state.selections, licenseFilter]);
  +   }, [catalog, state.selections, licenseFilter, animationFilter]);
  ```

  Update `incompatibleAny` (line 81):

  ```diff
  - const incompatibleAny = rows.some((r) => r.incompatible);
  + const incompatibleAny = rows.some((r) => r.licenseIncompatible || r.animationIncompatible);
  ```

  Update the per-row JSX (around lines 108-118):

  ```diff
    {rows.map((r) => (
      <li
        key={r.typeName}
  -     className={`rounded border border-border bg-surface-2 px-2 py-1 ${r.incompatible ? 'border-danger text-danger' : ''}`}
  +     className={`rounded border border-border bg-surface-2 px-2 py-1 ${(r.licenseIncompatible || r.animationIncompatible) ? 'border-danger text-danger' : ''}`}
      >
        <div className="font-semibold">{tl.category(r.typeName)}</div>
        <div className="font-mono text-[10px] text-text-mute">
          {r.item.name} · {r.authors.join(', ') || '?'} · {r.effective}
        </div>
  -     {r.incompatible && <div className="text-[10px]">{t('attribution.licenseIncompatibleShort')}</div>}
  +     {r.licenseIncompatible && <div className="text-[10px]">{t('attribution.licenseIncompatibleShort')}</div>}
  +     {r.animationIncompatible && <div className="text-[10px]">{t('attribution.animationIncompatibleShort')}</div>}
      </li>
    ))}
  ```

- [ ] **Step 5.5: Update `layer-row.tsx` — imports + Props**

  In `packages/web/src/components/layer-stack/layer-row.tsx`:

  Imports (around lines 1-10):

  ```tsx
  import type { Catalog, ItemDefinition, PaletteMetadata, TypeName } from '@lpc-toolkit/core';
  import { getRecolorSwatches } from '@lpc-toolkit/core';
  import { pickActionForItem, type SliceState, type SliceAction } from '../../slice/selection';
  import type { LabelTranslator, Translator } from '../../i18n';
  import { itemSupportsBodyType } from '../../slice/catalog-tree';
  import { itemMatchesLicenseFilter, type LicenseFilter } from '../../slice/license-filter';
  import { itemMatchesAnimationFilter, type AnimationFilter } from '../../slice/animation-filter';
  import { ColorPicker } from '../color-picker';
  import { ItemThumbnail } from './item-thumbnail';
  import type { AssetSource } from '../../adapter/asset-source';
  ```

  Props interface (around lines 11-23):

  ```diff
    interface Props {
      typeName: TypeName;
      catalog: Catalog;
      palettes: PaletteMetadata;
      state: SliceState;
      dispatch: (a: SliceAction) => void;
      tl: LabelTranslator;
      t: Translator;
      licenseFilter: LicenseFilter;
  +   animationFilter: AnimationFilter;
      assetSource: AssetSource;
      expanded: boolean;
      onToggle: () => void;
    }
  ```

  Function destructure (line 25):

  ```diff
  - export function LayerRow({ typeName, catalog, palettes, state, dispatch, tl, t, licenseFilter, assetSource, expanded, onToggle }: Props) {
  + export function LayerRow({ typeName, catalog, palettes, state, dispatch, tl, t, licenseFilter, animationFilter, assetSource, expanded, onToggle }: Props) {
  ```

- [ ] **Step 5.6: Update `layer-row.tsx` — swap tray badge logic**

  Inside the items map (currently lines 122-160), update the `supports`/`exceeds` block + the `title` + the icon `aria-label`. The full updated map body should be:

  ```tsx
              {items.map((it) => {
                const supports = itemSupportsBodyType(it, state.bodyType);
                const licenseExceeds = !itemMatchesLicenseFilter(it, licenseFilter);
                const animExceeds = !itemMatchesAnimationFilter(it, animationFilter);
                const exceeds = licenseExceeds || animExceeds;
                const isSelected = it.name === item.name;
                const exceedsTitle =
                  licenseExceeds && animExceeds
                    ? t('layer.bothIncompatibleTooltip')
                    : licenseExceeds
                      ? t('layer.licenseIncompatibleTooltip')
                      : t('layer.animationIncompatibleTooltip');
                return (
                  <button
                    key={it.name}
                    type="button"
                    disabled={!supports}
                    title={
                      !supports ? 'incompatible body type' :
                      exceeds ? exceedsTitle :
                      it.name
                    }
                    onClick={() => dispatch(pickActionForItem(typeName, it))}
                    className={[
                      'relative flex flex-col items-center gap-1 rounded-md border p-1 text-[10px]',
                      isSelected ? 'border-accent bg-accent/10 text-text' : 'border-border bg-surface-2 text-text-2',
                      !supports ? 'opacity-30 cursor-not-allowed' : '',
                      exceeds && supports ? 'opacity-60' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <ItemThumbnail
                      typeName={typeName}
                      name={it.name}
                      size={24}
                      bodyType={state.bodyType}
                      catalog={catalog}
                      palettes={palettes}
                      assetSource={assetSource}
                    />
                    <span className="max-w-full truncate">{it.name}</span>
                    {exceeds && supports && (
                      <span className="absolute -top-1 -right-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-danger text-[8px] text-white" aria-label={exceedsTitle}>!</span>
                    )}
                  </button>
                );
              })}
  ```

- [ ] **Step 5.7: Update `sidebar-search.tsx` — imports + Props**

  In `packages/web/src/components/layer-stack/sidebar-search.tsx`, locate the existing license-filter import and add the animation-filter import next to it. Find the props interface and add `animationFilter: AnimationFilter`. Find the function destructure and add `animationFilter`.

  Concretely, add this import near the other slice imports at the top of the file:

  ```tsx
  import { itemMatchesAnimationFilter, type AnimationFilter } from '../../slice/animation-filter';
  ```

  Add the prop to the `Props` interface (next to `licenseFilter`):

  ```diff
    interface Props {
      …
      licenseFilter: LicenseFilter;
  +   animationFilter: AnimationFilter;
      …
    }
  ```

  Add `animationFilter` to the function destructure (next to `licenseFilter`).

- [ ] **Step 5.8: Update `sidebar-search.tsx` — row exceeded logic**

  Inside the result rows map (the block around lines 178-230), replace the existing license-only `matchesFilter` / `exceeded` derivation + title with the dual-filter version. The full updated map body should look like:

  ```tsx
              shown.map((r, i) => {
                const licenseExceeded = !itemMatchesLicenseFilter(r.item, licenseFilter);
                const animExceeded = !itemMatchesAnimationFilter(r.item, animationFilter);
                const exceeded = licenseExceeded || animExceeded;
                const selected = state.selections[r.typeName]?.name === r.item.name;
                const itemLicense = r.item.credits[0]?.licenses[0];
                const isActive = i === activeIndex;
                const exceededTitle =
                  licenseExceeded && animExceeded
                    ? t('layer.bothIncompatibleTooltip')
                    : licenseExceeded
                      ? t('layer.licenseIncompatibleTooltip')
                      : t('layer.animationIncompatibleTooltip');
                return (
                  <button
                    key={`${r.typeName}:${r.item.name}`}
                    ref={isActive ? activeRowRef : undefined}
                    type="button"
                    disabled={!r.supports}
                    title={
                      !r.supports
                        ? t('palette.incompatible')
                        : exceeded
                          ? exceededTitle
                          : r.item.name
                    }
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => onPick(r)}
                    className={[
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left',
                      i > 0 ? 'border-t border-border' : '',
                      !r.supports
                        ? 'cursor-not-allowed opacity-35'
                        : exceeded
                          ? 'opacity-65 hover:bg-surface-2'
                          : 'hover:bg-surface-2',
                      isActive && r.supports ? 'bg-surface-2' : '',
                    ].join(' ')}
                  >
                    <ItemThumbnail
                      typeName={r.typeName}
                      name={r.item.name}
                      size={20}
                      bodyType={state.bodyType}
                      catalog={catalog}
                      palettes={palettes}
                      assetSource={assetSource}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 truncate text-[12px] font-semibold">
                        {tl.itemName(r.item.name)}
                        {!r.supports && (
                          <span className="rounded bg-amber-500/15 px-1 text-[9px] uppercase tracking-wide text-amber-500">
                            {t('palette.incompatible')}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[10px] uppercase tracking-wide text-text-mute">
                        {tl.category(r.typeName)}
                        {itemLicense && <> · {itemLicense}</>}
                      </div>
                    </div>
                    {exceeded && <span className="text-danger">⚠</span>}
                    {selected && <span className="text-accent">✓</span>}
                  </button>
                );
              })
  ```

- [ ] **Step 5.9: Typecheck**

  ```bash
  pnpm --filter @lpc-toolkit/web typecheck
  ```

  Expected: no errors.

- [ ] **Step 5.10: Run tests**

  ```bash
  pnpm --filter @lpc-toolkit/web test
  ```

  Expected: all green.

- [ ] **Step 5.11: Full manual smoke checklist**

  Start the dev server:

  ```bash
  pnpm --filter @lpc-toolkit/web dev
  ```

  Run through every step (matches spec §5.5):

  1. Open settings collapsible → see three sections: License / **Animation Filter** / Asset Source.
  2. Animation Filter lists **15** anims (no `Watering`, no `1-Handed Slash`).
  3. Default: no anim checked → no anim chip in header → all layers normal.
  4. Check `Walk` → see `Anim 1/15` chip. Items with no `walk` support get ⚠ badge.
  5. Add a wheelchair body to selection. In anim filter, check **only `Sit`** → wheelchair should have **no** ⚠ (custom anim base resolution works). Now check `Walk` instead → wheelchair shows ⚠ and counts toward Remove.
  6. Click Remove Incompatible → selection cleared + toast `Removed N animation-incompatible asset(s)` (or zh-TW equivalent).
  7. Switch to en locale → all new text is English.
  8. Open Reset menu → tick Filters → Reset → license back to all-enabled, anim back to empty.
  9. SidebarSearch (top of sidebar): search for an item that the current anim filter excludes → row has `⚠` icon + dimmed opacity + tooltip "Lacks the enabled animations" (en) / "不包含啟用的動畫" (zh-TW).
  10. Expand a LayerRow swap tray → incompatible item shows `!` red badge (top-right of thumbnail) + appropriate tooltip.
  11. Open AttributionPopover → button has ⚠ + red border; each row shows the right short label ("License not enabled" / "Missing enabled animations" / both, depending on which filter(s) fail).
  12. Reload page (`Cmd+R`) → anim filter resets to empty (session-only).

  Stop the dev server.

- [ ] **Step 5.12: Commit**

  ```bash
  git add packages/web/src/components/layer-stack/harness.tsx packages/web/src/components/layer-stack/stack-panel.tsx packages/web/src/components/layer-stack/popovers/attribution-popover.tsx packages/web/src/components/layer-stack/layer-row.tsx packages/web/src/components/layer-stack/sidebar-search.tsx
  git commit -m "$(cat <<'EOF'
  feat(web): show animation-incompatibility badges in 3 callsites

  AttributionPopover, LayerRow swap tray, and SidebarSearch results now
  flag items that fail the animation filter the same way they flag
  license incompatibility. Tooltips disambiguate license-only / animation-
  only / both. Row interface in AttributionPopover splits 'incompatible'
  into 'licenseIncompatible' + 'animationIncompatible' so the per-row
  short text can name the actual failure mode.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Post-flight

- [ ] **Step P.1: Final whole-repo verification**

  ```bash
  pnpm --filter @lpc-toolkit/core build
  pnpm --filter @lpc-toolkit/web typecheck
  pnpm --filter @lpc-toolkit/web test
  pnpm --filter @lpc-toolkit/web build
  ```

  Expected: all green.

- [ ] **Step P.2: Confirm branch state**

  ```bash
  git log --oneline main..feat/animation-filter
  ```

  Expected: 5 commits (Task 1 through Task 5).

- [ ] **Step P.3: Hand off to finishing-a-development-branch**

  Per the parent workflow, invoke `superpowers:finishing-a-development-branch` to decide on merge / PR / cleanup. (No additional plan steps inside this file.)

---

## Notes for the executing engineer

- **Order matters.** Tasks 1 → 5 must run sequentially. Each task assumes the previous task's renames and new exports are in place. Skipping or reordering will cause type errors that mask the real intent of each task.
- **Don't add `animationFilter` to LayerRow/SidebarSearch/AttributionPopover during Task 4.** Task 4 only wires the settings UI. Task 5 wires the callsites. Doing both at once mixes two reviewable concerns.
- **Custom animation base resolution is essential.** A `wheelchair` body item has `animations: ["wheelchair"]` and needs to pass when `sit` is enabled (because `customAnimationBase(customAnimations.wheelchair) === "sit"`). Test cases 5–7 in Task 1 cover this; smoke step 5 in Task 5 verifies it end-to-end.
- **i18n key removal is atomic with its single consumer.** Task 2 renames `attribution.incompatibleShort` and updates the only reader in the same commit. If you forget the consumer, typecheck will fail (TranslationKey is `keyof`).
- **Session-only state is intentional.** Don't add URL hash sync or localStorage persistence for animation filter — that's how E1 (license) works too and the spec §3.5 documents the reasoning.
