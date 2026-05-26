# License Filter UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch v2 web UI's license filter from a single-ceiling dropdown to upstream-style per-group checkboxes (5 LicenseGroups) with set-inclusion semantics and a one-click Remove Incompatible button.

**Architecture:** `LicenseFilter` becomes `ReadonlySet<LicenseGroup>`. `licenseExceedsFilter` is removed; `itemMatchesLicenseFilter` switches to set-inclusion (an item matches if any of its credits has a license whose group is in the enabled set). A new pure helper `incompatibleTypeNamesFor(state, catalog, enabledGroups)` computes the list once in the harness, shared by the Remove button and (separately) by `AttributionPopover`'s own internal rows scan. UI lives in `SettingsCollapsible`. Tests are pure-logic only (vitest, node env — no DOM); UI behavior is validated by manual run of the dev server at task boundaries. v1 path (`slice-harness.tsx`) stays frozen with its own inline `License | null` type.

**Tech Stack:** TypeScript (strict), React 18 + hooks, Vite, Tailwind, Vitest (node env), pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-05-27-license-filter-ui-design.md`

**Branch:** `feat/license-filter-ui` (created off `main`).

---

## Pre-flight

- [ ] **Step 0.1: Create feature branch**

  ```bash
  cd /Users/william/gitRepo/lpc-toolkit-2026-1
  git checkout -b feat/license-filter-ui
  ```

- [ ] **Step 0.2: Verify baseline tests pass**

  ```bash
  pnpm --filter @lpc-toolkit/core test
  pnpm --filter @lpc-toolkit/web test
  ```

  Expected: both green, web at ~178 tests.

---

## Task 1: Slice 語意改寫 + helper extraction + unit tests

**Files:**
- Modify: `packages/web/src/slice/license-filter.ts` (full rewrite — 35 lines → ~50 lines)
- Modify: `packages/web/test/license-filter.test.ts` (full rewrite)

**Outcome:** `LicenseFilter = ReadonlySet<LicenseGroup>`, set-inclusion semantics, `licenseExceedsFilter` deleted, new helper `incompatibleTypeNamesFor`, exhaustive unit tests.

- [ ] **Step 1.1: Replace `test/license-filter.test.ts` with new test matrix**

  Overwrite the entire file:

  ```ts
  import { describe, expect, it } from 'vitest';
  import type {
    Catalog,
    ItemDefinition,
    LicenseGroup,
    TypeName,
  } from '@lpc-toolkit/core';
  import {
    ALL_LICENSE_GROUPS,
    incompatibleTypeNamesFor,
    itemMatchesLicenseFilter,
    type LicenseFilter,
  } from '../src/slice/license-filter';
  import type { SliceState } from '../src/slice/selection';

  function item(
    name: string,
    licenses: ItemDefinition['credits'][number]['licenses'],
  ): ItemDefinition {
    return {
      name,
      type_name: 'hair',
      animations: ['walk'],
      credits: [
        { file: `hair/${name}`, notes: '', authors: ['Artist'], licenses, urls: [] },
      ],
      layer_1: { zPos: 10, male: `hair/${name}/` },
    } as ItemDefinition;
  }

  function itemNoCredits(name: string): ItemDefinition {
    return {
      name,
      type_name: 'hair',
      animations: ['walk'],
      credits: [],
      layer_1: { zPos: 10, male: `hair/${name}/` },
    } as ItemDefinition;
  }

  function itemMultiCredit(name: string): ItemDefinition {
    return {
      name,
      type_name: 'hair',
      animations: ['walk'],
      credits: [
        { file: 'a', notes: '', authors: ['A'], licenses: ['GPL 3.0'], urls: [] },
        { file: 'b', notes: '', authors: ['B'], licenses: ['CC0'], urls: [] },
      ],
      layer_1: { zPos: 10, male: `hair/${name}/` },
    } as ItemDefinition;
  }

  const ALL: LicenseFilter = ALL_LICENSE_GROUPS;
  const ONLY_CC0: LicenseFilter = new Set<LicenseGroup>(['CC0']);
  const ONLY_GPL: LicenseFilter = new Set<LicenseGroup>(['GPL']);
  const ONLY_CC_BY: LicenseFilter = new Set<LicenseGroup>(['CC-BY']);
  const NONE: LicenseFilter = new Set<LicenseGroup>();

  describe('itemMatchesLicenseFilter', () => {
    it('matches when all 5 groups enabled and item has any license', () => {
      expect(itemMatchesLicenseFilter(item('a', ['CC0']), ALL)).toBe(true);
    });

    it('matches when item license group is in enabled set', () => {
      expect(itemMatchesLicenseFilter(item('a', ['GPL 3.0']), ONLY_GPL)).toBe(true);
    });

    it('rejects when item license group is not in enabled set', () => {
      expect(itemMatchesLicenseFilter(item('a', ['GPL 3.0']), ONLY_CC0)).toBe(false);
    });

    it('rejects everything when no group is enabled', () => {
      expect(itemMatchesLicenseFilter(item('a', ['CC0']), NONE)).toBe(false);
    });

    it('treats empty credits as compatible (assume compatible)', () => {
      expect(itemMatchesLicenseFilter(itemNoCredits('blank'), ONLY_CC0)).toBe(true);
    });

    it('OR-matches across multiple licenses on one credit', () => {
      expect(
        itemMatchesLicenseFilter(item('a', ['GPL 2.0', 'CC-BY 4.0']), ONLY_CC_BY),
      ).toBe(true);
    });

    it('maps versioned license to its group via LICENSE_GROUP_OF', () => {
      expect(itemMatchesLicenseFilter(item('a', ['CC-BY 3.0']), ONLY_CC_BY)).toBe(true);
    });

    it('matches if any one credit (of many) has matching license', () => {
      expect(itemMatchesLicenseFilter(itemMultiCredit('mix'), ONLY_CC0)).toBe(true);
    });
  });

  describe('licenseExceedsFilter is removed from the slice module', () => {
    it('does not exist as an export', async () => {
      const mod = await import('../src/slice/license-filter');
      expect('licenseExceedsFilter' in mod).toBe(false);
    });
  });

  describe('incompatibleTypeNamesFor', () => {
    function makeCatalog(items: ItemDefinition[]): Catalog {
      const byTypeName = new Map<TypeName, ItemDefinition[]>();
      for (const it of items) {
        const list = byTypeName.get(it.type_name) ?? [];
        list.push(it);
        byTypeName.set(it.type_name, list);
      }
      return { byTypeName } as Catalog;
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

    it('returns empty when all selections are compatible', () => {
      const cc0Item = item('cc0', ['CC0']);
      const catalog = makeCatalog([cc0Item]);
      const state = makeState({
        hair: { name: 'cc0', typeName: 'hair' },
      });
      expect(incompatibleTypeNamesFor(state, catalog, ALL)).toEqual([]);
    });

    it('returns type names of selections whose item is not in enabled groups', () => {
      const gplItem = item('gpl', ['GPL 3.0']);
      const cc0Item = item('cc0', ['CC0']);
      const catalog = makeCatalog([gplItem, cc0Item]);
      const state = makeState({
        hair: { name: 'gpl', typeName: 'hair' },
      });
      expect(incompatibleTypeNamesFor(state, catalog, ONLY_CC0)).toEqual(['hair']);
    });

    it('skips unknown selections (item not found in catalog)', () => {
      const catalog = makeCatalog([item('cc0', ['CC0'])]);
      const state = makeState({
        hair: { name: 'missing', typeName: 'hair' },
      });
      expect(incompatibleTypeNamesFor(state, catalog, ONLY_CC0)).toEqual([]);
    });
  });
  ```

- [ ] **Step 1.2: Run tests — expect failure (helpers don't yet exist with new signatures)**

  ```bash
  pnpm --filter @lpc-toolkit/web test license-filter
  ```

  Expected: failures referencing `ALL_LICENSE_GROUPS` / `incompatibleTypeNamesFor` not exported, or type mismatch on `LicenseFilter`.

- [ ] **Step 1.3: Replace `packages/web/src/slice/license-filter.ts`**

  Overwrite the entire file:

  ```ts
  import {
    LICENSE_GROUP_OF,
    LICENSE_GROUP_ORDER,
    type Catalog,
    type ItemDefinition,
    type LicenseGroup,
    type TypeName,
  } from '@lpc-toolkit/core';
  import type { SliceState } from './selection';

  export type LicenseFilter = ReadonlySet<LicenseGroup>;

  export const ALL_LICENSE_GROUPS: LicenseFilter = new Set(LICENSE_GROUP_ORDER);

  export function itemMatchesLicenseFilter(
    item: ItemDefinition,
    enabledGroups: LicenseFilter,
  ): boolean {
    if (item.credits.length === 0) return true;
    if (enabledGroups.size === 0) return false;
    return item.credits.some((credit) =>
      credit.licenses.some((license) =>
        enabledGroups.has(LICENSE_GROUP_OF[license]),
      ),
    );
  }

  export function incompatibleTypeNamesFor(
    state: SliceState,
    catalog: Catalog,
    enabledGroups: LicenseFilter,
  ): TypeName[] {
    const out: TypeName[] = [];
    for (const [tn, sel] of Object.entries(state.selections)) {
      const item = (catalog.byTypeName.get(tn) ?? []).find(
        (d) => d.name === sel.name,
      );
      if (item && !itemMatchesLicenseFilter(item, enabledGroups)) {
        out.push(tn);
      }
    }
    return out;
  }
  ```

- [ ] **Step 1.4: Run tests — expect 11 passing**

  ```bash
  pnpm --filter @lpc-toolkit/web test license-filter
  ```

  Expected: all `itemMatchesLicenseFilter` (8), removal check (1), and `incompatibleTypeNamesFor` (3) — 12 total — pass.

- [ ] **Step 1.5: Verify typecheck still passes (callsites are still broken — that's fine for now, they'll be fixed in tasks 3-5)**

  ```bash
  pnpm --filter @lpc-toolkit/web typecheck
  ```

  Expected: **failures** in callsite files (`settings-collapsible.tsx`, `attribution-popover.tsx`, `layer-row.tsx`, `advanced-palette.tsx`, `harness.tsx`, `slice-harness.tsx`) — referencing the deleted `licenseExceedsFilter` and old `LicenseFilter` type. This is expected at this stage; subsequent tasks fix these.

  **Note:** Do NOT proceed to commit if the slice tests fail. Do proceed to commit even if typecheck has callsite errors — those are tracked by tasks 3-5.

- [ ] **Step 1.6: Commit**

  ```bash
  git add packages/web/src/slice/license-filter.ts packages/web/test/license-filter.test.ts
  git commit -m "$(cat <<'EOF'
  feat(web/slice): switch LicenseFilter to ReadonlySet<LicenseGroup>

  Replaces single-ceiling License | null with upstream-style set inclusion.
  itemMatchesLicenseFilter now returns true iff item has at least one credit
  license whose group is in enabled set; empty credits = compatible (matches
  upstream). licenseExceedsFilter is removed. Adds incompatibleTypeNamesFor
  helper for Remove Incompatible feature.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 2: i18n keys — add new, rename one, remove one

**Files:**
- Modify: `packages/web/src/i18n.ts`

**Outcome:** New license filter / layer / palette / attribution keys for both `en` and `zh-TW`. `attribution.exceededShort` renamed to `attribution.incompatibleShort`. `picker.allLicenses` removed. `attribution.licenseExceeded` (used only by v1) kept.

**Translator note:** `Translator = (key) => string` has NO interpolation. Use literal `{n}` / `{plural}` in strings; callers do `.replace('{n}', String(count))`. Match existing `hashSync.skipped` pattern.

- [ ] **Step 2.1: Edit `packages/web/src/i18n.ts` — English block**

  Find the line `'picker.licenseFilter': 'License filter',` (around line 21) and the surrounding picker/attribution keys. Apply these edits:

  1. **Remove** line `'picker.allLicenses': 'All licenses',` (around line 22)
  2. **Rename** key `'attribution.exceededShort'` → `'attribution.incompatibleShort'`, change value to `'Not in enabled licenses'` (around line 112)
  3. **Add** these new keys (group them near the other `licenseFilter.*` / `attribution.*` / `layer.*` / `palette.*` keys for readability, but exact placement does not matter):

     ```ts
     'licenseFilter.enabledCount': '{n}/{total} enabled',
     'licenseFilter.removeIncompatible': 'Remove {n} Incompatible Asset{plural}',
     'licenseFilter.incompatibleNotice': '{n} selected item{plural} not in enabled licenses',
     'licenseFilter.showLicense': 'Show license',
     'licenseFilter.removed': 'Removed {n} incompatible asset{plural}',
     'layer.licenseIncompatibleTooltip': 'Does not match enabled license groups',
     'palette.licenseGroupsBadge': '{n}/5 license groups',
     ```

- [ ] **Step 2.2: Edit `packages/web/src/i18n.ts` — zh-TW block (around lines 145, 235)**

  1. **Remove** line `'picker.allLicenses': '所有授權',` (around line 146)
  2. **Rename** key `'attribution.exceededShort'` → `'attribution.incompatibleShort'`, change value to `'不在啟用授權內'` (around line 235)
  3. **Add** these new keys in the zh-TW block (mirror the en block placements):

     ```ts
     'licenseFilter.enabledCount': '{n}/{total} 已啟用',
     'licenseFilter.removeIncompatible': '移除 {n} 個不相容素材',
     'licenseFilter.incompatibleNotice': '{n} 個已選素材不在啟用授權內',
     'licenseFilter.showLicense': '查看授權',
     'licenseFilter.removed': '已移除 {n} 個不相容素材',
     'layer.licenseIncompatibleTooltip': '不在啟用授權群組內',
     'palette.licenseGroupsBadge': '{n}/5 個授權群組',
     ```

  (zh-TW does not need plural; `{plural}` omitted.)

- [ ] **Step 2.3: Verify typecheck — i18n.ts itself should be self-consistent**

  ```bash
  pnpm --filter @lpc-toolkit/web typecheck 2>&1 | grep -E "i18n\.ts" | head -20
  ```

  Expected: NO errors mentioning `i18n.ts` (errors in other files for missing/renamed keys will surface in tasks 3-5).

  If you see "Property 'X' is missing in type" inside i18n.ts itself — the en/zh-TW blocks are out of sync. Re-check that every new key is added to BOTH locales.

- [ ] **Step 2.4: Commit**

  ```bash
  git add packages/web/src/i18n.ts
  git commit -m "$(cat <<'EOF'
  feat(web/i18n): license filter UI keys (en + zh-TW)

  Adds licenseFilter.* / palette.licenseGroupsBadge / layer.licenseIncompatibleTooltip
  keys, renames attribution.exceededShort to attribution.incompatibleShort,
  removes picker.allLicenses (no longer needed once select is replaced).
  v1-only attribution.licenseExceeded is kept untouched.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 3: `SettingsCollapsible` UI rewrite

**Files:**
- Modify: `packages/web/src/components/layer-stack/settings-collapsible.tsx` (full rewrite)

**Outcome:** Single `<select>` → 5 group checkboxes + (Show license) external link per group + conditional warning notice + Remove Incompatible button. Asset Source block unchanged. Settings header badge shows `{n}/5` when `< 5` enabled.

**Note on hook ordering:** This task only changes `SettingsCollapsible`'s own props and body. Calling code in `StackPanel` is still passing the OLD prop shape (`setLicenseFilter`) and will not compile after this task — that's fixed in Task 4. Plan task ordering accepts this: each task commits its own slice, callsite wiring is the last step.

- [ ] **Step 3.1: Replace `packages/web/src/components/layer-stack/settings-collapsible.tsx`**

  Overwrite the entire file with:

  ```tsx
  import { useState } from 'react';
  import {
    LICENSE_CONFIG,
    LICENSE_GROUP_ORDER,
    type LicenseGroup,
  } from '@lpc-toolkit/core';
  import { Button } from '../ui/button';
  import type { LicenseFilter } from '../../slice/license-filter';
  import type { AssetSource } from '../../adapter/asset-source';
  import type { Translator } from '../../i18n';

  interface Props {
    t: Translator;
    licenseFilter: LicenseFilter;
    toggleLicenseGroup: (group: LicenseGroup) => void;
    incompatibleCount: number;
    removeIncompatibleSelections: () => void;
    assetSource: AssetSource;
    setAssetSource: (v: AssetSource) => void;
  }

  const TOTAL_GROUPS = LICENSE_GROUP_ORDER.length;

  export function SettingsCollapsible({
    t,
    licenseFilter,
    toggleLicenseGroup,
    incompatibleCount,
    removeIncompatibleSelections,
    assetSource,
    setAssetSource,
  }: Props) {
    const [open, setOpen] = useState(false);
    const enabledCount = licenseFilter.size;
    const showCountBadge = enabledCount < TOTAL_GROUPS;

    return (
      <div className="border-t border-border bg-app">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-mute hover:bg-surface-2"
        >
          <span>{t('filters.title')}</span>
          {showCountBadge && (
            <span className="rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-[9px] font-normal normal-case text-accent">
              {enabledCount}/{TOTAL_GROUPS}
            </span>
          )}
          <span className="ml-auto">{open ? '▾' : '▸'}</span>
        </button>
        {open && (
          <div className="space-y-3 px-3 pb-3">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-text-mute">
                <span>{t('picker.licenseFilter')}</span>
                <span className="font-normal normal-case text-text-dim">
                  {t('licenseFilter.enabledCount')
                    .replace('{n}', String(enabledCount))
                    .replace('{total}', String(TOTAL_GROUPS))}
                </span>
              </div>
              <ul className="flex flex-col gap-1">
                {LICENSE_CONFIG.map((group) => {
                  const checked = licenseFilter.has(group.key as LicenseGroup);
                  const linkLabel = group.urlLabel
                    ? `${t('licenseFilter.showLicense')} ${group.urlLabel}`
                    : t('licenseFilter.showLicense');
                  return (
                    <li key={group.key} className="flex items-center gap-2">
                      <label className="flex flex-1 items-center gap-2 text-[11px] text-text cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleLicenseGroup(group.key as LicenseGroup)}
                          className="h-3 w-3 accent-accent"
                        />
                        <span className="font-mono">{group.label}</span>
                      </label>
                      <a
                        href={group.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-text-mute underline decoration-border underline-offset-2 hover:text-text"
                      >
                        ({linkLabel})
                      </a>
                    </li>
                  );
                })}
              </ul>

              {incompatibleCount > 0 && (
                <div className="mt-2 rounded-md border border-warning/40 bg-warning/10 p-2">
                  <p className="mb-2 text-[11px] text-warning">
                    ⚠️{' '}
                    {t('licenseFilter.incompatibleNotice')
                      .replace('{n}', String(incompatibleCount))
                      .replace('{plural}', incompatibleCount === 1 ? '' : 's')}
                  </p>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={removeIncompatibleSelections}
                    className="w-full"
                  >
                    {t('licenseFilter.removeIncompatible')
                      .replace('{n}', String(incompatibleCount))
                      .replace('{plural}', incompatibleCount === 1 ? '' : 's')}
                  </Button>
                </div>
              )}
            </div>

            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-text-mute">
                {t('assetSource.title')}
              </div>
              <div className="flex gap-1">
                {(['auto', 'local', 'upstream'] as const).map((src) => (
                  <Button
                    key={src}
                    size="sm"
                    variant={assetSource === src ? 'primary' : 'ghost'}
                    className="flex-1"
                    onClick={() => setAssetSource(src)}
                  >
                    {t(`assetSource.${src}` as const)}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
  ```

  **Notes on Tailwind utility class:** the `border-warning` / `bg-warning/10` / `text-warning` classes match the existing palette already used elsewhere in this codebase. If the warning palette doesn't render visibly during manual verification, fall back to `border-amber-500/40 bg-amber-500/10 text-amber-500` (matches the existing pattern in `advanced-palette.tsx:151`).

- [ ] **Step 3.2: Don't run tests yet** — this component has no unit tests; verification is by typecheck (callsite errors expected) + manual run in task 4.

- [ ] **Step 3.3: Commit**

  ```bash
  git add packages/web/src/components/layer-stack/settings-collapsible.tsx
  git commit -m "$(cat <<'EOF'
  feat(web): rewrite SettingsCollapsible as per-group checkboxes

  Replaces single license <select> with 5 LicenseGroup checkboxes, each
  with an external (Show license) link to the group's reference URL.
  Header shows {n}/5 badge when not all enabled. When incompatibleCount > 0,
  shows warning notice + Remove Incompatible Asset(s) button. Asset Source
  block unchanged. Props now expect toggleLicenseGroup / incompatibleCount /
  removeIncompatibleSelections from the parent (wired up in next task).

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 4: Harness state + StackPanel transit + reset

**Files:**
- Modify: `packages/web/src/components/layer-stack/harness.tsx` (initial state, toggle handler, memo, remove handler, reset, props)
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx` (props forwarding)

**Outcome:** `licenseFilter` initialized to `ALL_LICENSE_GROUPS`. `toggleLicenseGroup` + `removeIncompatibleSelections` defined and forwarded down. `incompatibleCount` computed via `incompatibleTypeNamesFor` and forwarded. Reset (filters scope) sets back to `ALL_LICENSE_GROUPS`.

- [ ] **Step 4.1: Edit `harness.tsx` imports (around lines 17-20)**

  Find the existing import:
  ```ts
  import type { LicenseFilter } from '../../slice/license-filter';
  ```

  Replace with:
  ```ts
  import type { LicenseGroup } from '@lpc-toolkit/core';
  import {
    ALL_LICENSE_GROUPS,
    incompatibleTypeNamesFor,
    type LicenseFilter,
  } from '../../slice/license-filter';
  ```

- [ ] **Step 4.2: Edit `harness.tsx` — initial state (around line 58)**

  Find:
  ```ts
  const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>(null);
  ```

  Replace with:
  ```ts
  const [licenseFilter, setLicenseFilter] =
    useState<LicenseFilter>(ALL_LICENSE_GROUPS);
  ```

- [ ] **Step 4.3: Edit `harness.tsx` — add toggleLicenseGroup, incompatibleTypeNames memo, removeIncompatibleSelections**

  Just below the `useState` block (after line ~73, before `composeSingleItem`), insert:

  ```ts
  const toggleLicenseGroup = useCallback((group: LicenseGroup) => {
    setLicenseFilter((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const incompatibleTypeNames = useMemo(
    () => incompatibleTypeNamesFor(props.state, props.catalog, licenseFilter),
    [props.state, props.catalog, licenseFilter],
  );
  const incompatibleCount = incompatibleTypeNames.length;

  const removeIncompatibleSelections = useCallback(() => {
    if (incompatibleTypeNames.length === 0) return;
    for (const tn of incompatibleTypeNames) {
      props.dispatch({ type: 'clear', typeName: tn });
    }
    setStatus({
      kind: 'info',
      text: t('licenseFilter.removed')
        .replace('{n}', String(incompatibleTypeNames.length))
        .replace('{plural}', incompatibleTypeNames.length === 1 ? '' : 's'),
    });
  }, [incompatibleTypeNames, props.dispatch, t]);
  ```

  **Imports check:** `harness.tsx` line 1 currently imports `useCallback, useEffect, useState` from `react`. **You must add `useMemo`** to this import list:

  ```ts
  import { useCallback, useEffect, useMemo, useState } from 'react';
  ```

- [ ] **Step 4.4: Edit `harness.tsx` — reset (around line 219)**

  Find:
  ```ts
  if (filters) {
    setLicenseFilter(null);
  }
  ```

  Replace with:
  ```ts
  if (filters) {
    setLicenseFilter(ALL_LICENSE_GROUPS);
  }
  ```

- [ ] **Step 4.5: Edit `harness.tsx` — forward new props to StackPanel (around lines 260-277)**

  Find the `<StackPanel ... />` element. Change the props block:

  ```tsx
  <StackPanel
    catalog={props.catalog}
    palettes={props.palettes}
    state={props.state}
    dispatch={props.dispatch}
    shownTypeNames={props.shownTypeNames}
    licenseFilter={licenseFilter}
    toggleLicenseGroup={toggleLicenseGroup}
    incompatibleCount={incompatibleCount}
    removeIncompatibleSelections={removeIncompatibleSelections}
    assetSource={props.assetSource}
    setAssetSource={props.onAssetSourceChange}
    t={props.t}
    tl={props.tl}
    onPresetApplied={handlePresetApplied}
    status={status}
    expanded={expanded}
    setExpanded={setExpanded}
    onOpenPalette={() => setPaletteOpen(true)}
  />
  ```

  Remove the old `setLicenseFilter={setLicenseFilter}` line.

- [ ] **Step 4.6: Edit `stack-panel.tsx` — update Props interface**

  Find (around lines 13-30):
  ```ts
  licenseFilter: LicenseFilter;
  setLicenseFilter: (v: LicenseFilter) => void;
  ```

  Replace with:
  ```ts
  licenseFilter: LicenseFilter;
  toggleLicenseGroup: (group: LicenseGroup) => void;
  incompatibleCount: number;
  removeIncompatibleSelections: () => void;
  ```

  Add `LicenseGroup` to the `@lpc-toolkit/core` import (line 2):
  ```ts
  import type { Catalog, PaletteMetadata, TypeName, LicenseGroup } from '@lpc-toolkit/core';
  ```

- [ ] **Step 4.7: Edit `stack-panel.tsx` — destructure new props (around lines 32-49)**

  Find the destructuring:
  ```ts
  export function StackPanel({
    catalog,
    palettes,
    state,
    dispatch,
    shownTypeNames,
    licenseFilter,
    setLicenseFilter,
    ...
  }: Props) {
  ```

  Replace the `setLicenseFilter,` line with:
  ```ts
    toggleLicenseGroup,
    incompatibleCount,
    removeIncompatibleSelections,
  ```

- [ ] **Step 4.8: Edit `stack-panel.tsx` — forward new props to SettingsCollapsible (around lines 125-131)**

  Find:
  ```tsx
  <SettingsCollapsible
    t={t}
    licenseFilter={licenseFilter}
    setLicenseFilter={setLicenseFilter}
    assetSource={assetSource}
    setAssetSource={setAssetSource}
  />
  ```

  Replace with:
  ```tsx
  <SettingsCollapsible
    t={t}
    licenseFilter={licenseFilter}
    toggleLicenseGroup={toggleLicenseGroup}
    incompatibleCount={incompatibleCount}
    removeIncompatibleSelections={removeIncompatibleSelections}
    assetSource={assetSource}
    setAssetSource={setAssetSource}
  />
  ```

- [ ] **Step 4.9: Typecheck — harness + stack-panel + settings-collapsible should be clean**

  ```bash
  pnpm --filter @lpc-toolkit/web typecheck 2>&1 | grep -E "harness\.tsx|stack-panel\.tsx|settings-collapsible\.tsx" | head -20
  ```

  Expected: NO errors in these three files. Remaining errors should be only in `attribution-popover.tsx`, `layer-row.tsx`, `advanced-palette.tsx`, and `slice-harness.tsx` — all targeted in task 5.

- [ ] **Step 4.10: Commit**

  ```bash
  git add packages/web/src/components/layer-stack/harness.tsx packages/web/src/components/layer-stack/stack-panel.tsx
  git commit -m "$(cat <<'EOF'
  feat(web): wire license filter state + reset in harness

  licenseFilter initialised to ALL_LICENSE_GROUPS; new toggleLicenseGroup
  and removeIncompatibleSelections handlers; incompatibleTypeNames computed
  via incompatibleTypeNamesFor; reset (filters scope) restores ALL_LICENSE_GROUPS.
  StackPanel forwards toggleLicenseGroup / incompatibleCount /
  removeIncompatibleSelections to SettingsCollapsible.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 5: Callsite migration (`attribution-popover` / `layer-row` / `advanced-palette` / v1 `slice-harness`)

**Files:**
- Modify: `packages/web/src/components/layer-stack/popovers/attribution-popover.tsx`
- Modify: `packages/web/src/components/layer-stack/layer-row.tsx`
- Modify: `packages/web/src/components/layer-stack/advanced-palette.tsx`
- Modify: `packages/web/src/components/slice-harness.tsx` (v1 — inline its own legacy types)

**Outcome:** Every consumer of the OLD slice signatures is migrated. v1 inlines its own `License | null` and a private copy of `licenseExceedsFilter` so the v1 path stays behaviour-identical without depending on the new slice.

- [ ] **Step 5.1: Edit `attribution-popover.tsx` — imports (around lines 1-11)**

  Find:
  ```ts
  import {
    computeEffectiveLicense,
    type Catalog,
    type ItemDefinition,
    type License,
  } from '@lpc-toolkit/core';
  import { Button } from '../../ui/button';
  import { usePopover } from './use-popover';
  import { licenseExceedsFilter, type LicenseFilter } from '../../../slice/license-filter';
  ```

  Replace with:
  ```ts
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
  ```

- [ ] **Step 5.2: Edit `attribution-popover.tsx` — Row interface + memo (around lines 24-70)**

  Find:
  ```ts
  interface Row {
    typeName: string;
    item: ItemDefinition;
    effective: License;
    authors: string[];
    exceeds: boolean;
  }
  ```

  Replace with:
  ```ts
  interface Row {
    typeName: string;
    item: ItemDefinition;
    effective: License;
    authors: string[];
    incompatible: boolean;
  }
  ```

  Find (inside the `rows` useMemo, around line 67):
  ```ts
  out.push({ typeName: tn, item, effective, authors: allAuthors, exceeds: licenseExceedsFilter(effective, licenseFilter) });
  ```

  Replace with:
  ```ts
  out.push({
    typeName: tn,
    item,
    effective,
    authors: allAuthors,
    incompatible: !itemMatchesLicenseFilter(item, licenseFilter),
  });
  ```

- [ ] **Step 5.3: Edit `attribution-popover.tsx` — trigger button + row rendering (around lines 72-110)**

  Find:
  ```ts
  const exceedsAny = rows.some((r) => r.exceeds);
  ```

  Replace with:
  ```ts
  const incompatibleAny = rows.some((r) => r.incompatible);
  ```

  Find:
  ```tsx
  <Button
    ref={anchorRef}
    size="sm"
    variant={exceedsAny ? 'primary' : 'default'}
    className={exceedsAny ? 'border-danger text-danger' : ''}
    onClick={() => setOpen(!open)}
  >
    {exceedsAny ? '⚠ ' : '© '}{t('attribution.title')} · {sourceCount}
  </Button>
  ```

  Replace with (rename `exceedsAny` → `incompatibleAny`):
  ```tsx
  <Button
    ref={anchorRef}
    size="sm"
    variant={incompatibleAny ? 'primary' : 'default'}
    className={incompatibleAny ? 'border-danger text-danger' : ''}
    onClick={() => setOpen(!open)}
  >
    {incompatibleAny ? '⚠ ' : '© '}{t('attribution.title')} · {sourceCount}
  </Button>
  ```

  Find the row rendering:
  ```tsx
  <li
    key={r.typeName}
    className={`rounded border border-border bg-surface-2 px-2 py-1 ${r.exceeds ? 'border-danger text-danger' : ''}`}
  >
    <div className="font-semibold">{tl.category(r.typeName)}</div>
    <div className="font-mono text-[10px] text-text-mute">
      {r.item.name} · {r.authors.join(', ') || '?'} · {r.effective}
    </div>
    {r.exceeds && <div className="text-[10px]">{t('attribution.exceededShort')}</div>}
  </li>
  ```

  Replace with:
  ```tsx
  <li
    key={r.typeName}
    className={`rounded border border-border bg-surface-2 px-2 py-1 ${r.incompatible ? 'border-danger text-danger' : ''}`}
  >
    <div className="font-semibold">{tl.category(r.typeName)}</div>
    <div className="font-mono text-[10px] text-text-mute">
      {r.item.name} · {r.authors.join(', ') || '?'} · {r.effective}
    </div>
    {r.incompatible && <div className="text-[10px]">{t('attribution.incompatibleShort')}</div>}
  </li>
  ```

- [ ] **Step 5.4: Edit `layer-row.tsx` — tooltip text (around lines 131-135)**

  Find:
  ```tsx
  title={
    !supports ? 'incompatible body type' :
    exceeds ? `exceeds license filter ${licenseFilter ?? ''}` :
    it.name
  }
  ```

  Replace with:
  ```tsx
  title={
    !supports ? 'incompatible body type' :
    exceeds ? tl.t('layer.licenseIncompatibleTooltip') :
    it.name
  }
  ```

  **Wait — `tl` is LabelTranslator, NOT Translator (it doesn't carry `t`).** Add `t: Translator` to the Props interface and to the destructure list at lines 11-24:

  Add to imports (line 4):
  ```ts
  import type { LabelTranslator, Translator } from '../../i18n';
  ```

  Update Props (line 17):
  ```ts
  tl: LabelTranslator;
  t: Translator;
  licenseFilter: LicenseFilter;
  ```

  Update destructure (line 24):
  ```ts
  export function LayerRow({ typeName, catalog, palettes, state, dispatch, tl, t, licenseFilter, assetSource, expanded, onToggle }: Props) {
  ```

  Then use `t('layer.licenseIncompatibleTooltip')` in the tooltip:
  ```tsx
  title={
    !supports ? 'incompatible body type' :
    exceeds ? t('layer.licenseIncompatibleTooltip') :
    it.name
  }
  ```

  Also update `aria-label="exceeds license filter"` (around line 155) to:
  ```tsx
  aria-label={t('layer.licenseIncompatibleTooltip')}
  ```

- [ ] **Step 5.5: Edit `stack-panel.tsx` — pass `t` down to LayerRow (around lines 93-107)**

  Find the `<LayerRow ... />` render:
  ```tsx
  <LayerRow
    key={tn}
    typeName={tn}
    catalog={catalog}
    palettes={palettes}
    state={state}
    dispatch={dispatch}
    tl={tl}
    licenseFilter={licenseFilter}
    ...
  />
  ```

  Add `t={t}` immediately after `tl={tl}`:
  ```tsx
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
    assetSource={assetSource}
    expanded={expanded === tn}
    onToggle={() => setExpanded(expanded === tn ? null : tn)}
  />
  ```

  (`t` is already destructured in `StackPanel`'s parameters — no other change needed.)

- [ ] **Step 5.6: Edit `advanced-palette.tsx` — imports (around lines 10-14)**

  Find:
  ```ts
  import {
    itemMatchesLicenseFilter,
    licenseExceedsFilter,
    type LicenseFilter,
  } from '../../slice/license-filter';
  ```

  Replace with:
  ```ts
  import {
    itemMatchesLicenseFilter,
    type LicenseFilter,
  } from '../../slice/license-filter';
  ```

  Also import `LICENSE_GROUP_ORDER`:

  ```ts
  // existing core import block (around lines 2-6) — add LICENSE_GROUP_ORDER
  import {
    LICENSE_GROUP_ORDER,
    type Catalog,
    type PaletteMetadata,
    type TypeName,
  } from '@lpc-toolkit/core';
  ```

- [ ] **Step 5.7: Edit `advanced-palette.tsx` — header badge (around lines 94-98)**

  Find:
  ```tsx
  {licenseFilter && (
    <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-[10px] text-accent">
      ≤ {licenseFilter}
    </span>
  )}
  ```

  Replace with:
  ```tsx
  {licenseFilter.size < LICENSE_GROUP_ORDER.length && (
    <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-[10px] text-accent">
      {t('palette.licenseGroupsBadge').replace('{n}', String(licenseFilter.size))}
    </span>
  )}
  ```

- [ ] **Step 5.8: Edit `advanced-palette.tsx` — exceeded badge logic (around lines 110-117, 161)**

  Find:
  ```ts
  const matchesFilter = itemMatchesLicenseFilter(item, licenseFilter);
  const exceeded = !matchesFilter;
  const active = state.selections[typeName]?.name === item.name;
  const itemLicense = item.credits[0]?.licenses[0];
  const isExceededByLicense =
    exceeded && itemLicense && licenseExceedsFilter(itemLicense, licenseFilter);
  ```

  Replace with:
  ```ts
  const matchesFilter = itemMatchesLicenseFilter(item, licenseFilter);
  const exceeded = !matchesFilter;
  const active = state.selections[typeName]?.name === item.name;
  const itemLicense = item.credits[0]?.licenses[0];
  ```

  Find:
  ```tsx
  {isExceededByLicense && <span className="text-danger">⚠</span>}
  ```

  Replace with:
  ```tsx
  {exceeded && <span className="text-danger">⚠</span>}
  ```

- [ ] **Step 5.9: Edit `slice-harness.tsx` — inline legacy types (around lines 24-28)**

  Find:
  ```ts
  import {
    itemMatchesLicenseFilter,
    licenseExceedsFilter,
    type LicenseFilter,
  } from '../slice/license-filter';
  ```

  Replace with (v1-only inlined helpers — keep v1 behaviour identical):
  ```ts
  import {
    LICENSE_GROUP_OF,
    LICENSE_GROUP_ORDER,
    LICENSE_VERSION_RANK,
    type ItemDefinition,
  } from '@lpc-toolkit/core';

  // --- v1 legacy license filter (frozen; v2 lives in slice/license-filter.ts) ---
  type LegacyLicenseFilter = License | null;

  function legacyItemMatchesLicenseFilter(
    item: ItemDefinition,
    filter: LegacyLicenseFilter,
  ): boolean {
    if (!filter) return true;
    return item.credits.some((credit) => credit.licenses.includes(filter));
  }

  function legacyLicenseExceedsFilter(
    effective: License,
    filter: LegacyLicenseFilter,
  ): boolean {
    if (!filter) return false;
    const eGroup = LICENSE_GROUP_OF[effective];
    const fGroup = LICENSE_GROUP_OF[filter];
    const eGroupRank = LICENSE_GROUP_ORDER.indexOf(eGroup);
    const fGroupRank = LICENSE_GROUP_ORDER.indexOf(fGroup);
    if (eGroupRank !== fGroupRank) return eGroupRank > fGroupRank;
    return LICENSE_VERSION_RANK[effective] > LICENSE_VERSION_RANK[filter];
  }
  ```

  (You may need to consolidate the `@lpc-toolkit/core` import block with the one already present; merge them so there's a single import statement importing all needed symbols.)

  **Rename every callsite within `slice-harness.tsx`:**
  - `itemMatchesLicenseFilter(...)` → `legacyItemMatchesLicenseFilter(...)`
  - `licenseExceedsFilter(...)` → `legacyLicenseExceedsFilter(...)`
  - `useState<LicenseFilter>(null)` → `useState<LegacyLicenseFilter>(null)`
  - `LicenseFilter` type references → `LegacyLicenseFilter`

  Use multiple Edits or a single replace_all per identifier. After this step, `slice-harness.tsx` should no longer reference the new slice's `LicenseFilter` type at all.

- [ ] **Step 5.10: Verify typecheck — should now be clean across the entire web package**

  ```bash
  pnpm --filter @lpc-toolkit/web typecheck
  ```

  Expected: no errors.

  If errors remain, common culprits:
  - `LicenseGroup` not imported in `stack-panel.tsx` (Step 4.6)
  - `t` not destructured / not threaded through to `LayerRow` (Step 5.5)
  - Stale `licenseExceedsFilter` import somewhere not yet touched — grep:

    ```bash
    grep -rn "licenseExceedsFilter" packages/web/src
    ```

    Expected: zero matches.

  Fix any remaining issues inline until typecheck is clean before moving on.

- [ ] **Step 5.11: Run all tests**

  ```bash
  pnpm --filter @lpc-toolkit/core test
  pnpm --filter @lpc-toolkit/web test
  ```

  Expected: core green, web green at +12 tests vs baseline (`license-filter.test.ts` grew by 8 itemMatches + 1 removal + 3 incompatibleTypeNamesFor = 12 new cases minus 3 old removed cases for `licenseExceedsFilter`, plus 1 absence check).

  Concretely: if baseline was 178, expect ~187. Don't panic if the exact count differs by ±2 — re-read what `vitest` actually reports.

- [ ] **Step 5.12: Manual verification (dev server)**

  ```bash
  pnpm --filter @lpc-toolkit/web dev
  ```

  Open the URL it prints (typically `http://localhost:5173`). Then:

  1. Open `▾ Settings` (sidebar bottom). Confirm 5 LicenseGroup checkboxes are visible: CC0, CC-BY, CC-BY-SA, OGA-BY, GPL. All checked. No `{n}/5` badge in the Settings header. Each row has a `(Show license)` link that opens the license URL in a new tab.
  2. Pick a body + a few items (e.g. via the `🔍` palette). Confirm AttributionPopover shows `© Attribution · N` with no `⚠`.
  3. Uncheck **GPL**. Header badge now shows `4/5`. If any selected item depends on GPL: warning notice appears with `1 selected item not in enabled licenses` and a `Remove 1 Incompatible Asset` button. AttributionPopover trigger turns red `⚠ Attribution · …`. The incompatible row inside AttributionPopover is red with `Not in enabled licenses`.
  4. Click `Remove 1 Incompatible Asset`. The item is cleared from selections. Warning + button disappear. Status toast briefly shows `Removed 1 incompatible asset`.
  5. Open Reset menu, check only **Filters**, confirm. Filter goes back to 5/5. Selected items untouched.
  6. Open Reset menu, check only **Outfit**, confirm. Selections cleared but filter stays as whatever you had.
  7. Switch language to 中文 (top bar). Confirm Settings header → `授權篩選 3/5 已啟用`, Remove button → `移除 N 個不相容素材`, etc.
  8. Press `⌘K` to open `AdvancedPalette`. With <5 groups enabled, confirm header chip shows `{n}/5 license groups` and items not in enabled groups show `⚠` and `opacity-65`.

  If anything is visually broken (palette not loading, dev server errors), fix before committing. **If only the warning palette (border-warning/bg-warning/text-warning) doesn't render visibly**, swap to the amber-500 fallback noted in Step 3.1.

- [ ] **Step 5.13: Commit**

  ```bash
  git add packages/web/src/components/layer-stack/popovers/attribution-popover.tsx \
          packages/web/src/components/layer-stack/layer-row.tsx \
          packages/web/src/components/layer-stack/advanced-palette.tsx \
          packages/web/src/components/layer-stack/stack-panel.tsx \
          packages/web/src/components/slice-harness.tsx
  git commit -m "$(cat <<'EOF'
  feat(web): migrate callsites to new LicenseFilter set semantics

  AttributionPopover / LayerRow / AdvancedPalette switch to
  !itemMatchesLicenseFilter (set inclusion). LayerRow tooltip uses new
  i18n key (no more inline license name). AdvancedPalette header shows
  {n}/5 license-groups badge when <5 enabled. v1 slice-harness.tsx
  inlines its own LegacyLicenseFilter + legacy helpers so its behaviour
  stays frozen.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Wrap-up

- [ ] **Step W.1: Final full test sweep**

  ```bash
  pnpm --filter @lpc-toolkit/core test
  pnpm --filter @lpc-toolkit/web test
  pnpm --filter @lpc-toolkit/web typecheck
  ```

  All green.

- [ ] **Step W.2: Review the diff one more time**

  ```bash
  git log --oneline main..HEAD
  git diff main...HEAD --stat
  ```

  Expected commits (5):
  1. `feat(web/slice): switch LicenseFilter to ReadonlySet<LicenseGroup>`
  2. `feat(web/i18n): license filter UI keys (en + zh-TW)`
  3. `feat(web): rewrite SettingsCollapsible as per-group checkboxes`
  4. `feat(web): wire license filter state + reset in harness`
  5. `feat(web): migrate callsites to new LicenseFilter set semantics`

  Expected stat: ~7 source files + ~1 test file + ~1 i18n file modified. Spec + plan docs already committed on main.

- [ ] **Step W.3: Hand off to finishing-a-development-branch**

  Branch is ready for merge to main via `superpowers:finishing-a-development-branch`.

---

## Acceptance check (against spec §6 / 驗收)

- [ ] `LicenseFilter` 型別 = `ReadonlySet<LicenseGroup>` ✓ (Task 1)
- [ ] `licenseExceedsFilter` 不存在於 `slice/license-filter.ts` ✓ (Task 1)
- [ ] `itemMatchesLicenseFilter` 對齊上游 `isItemLicenseCompatible` ✓ (Task 1 tests)
- [ ] `SettingsCollapsible` 顯示 5 個 group checkbox + license URL ✓ (Task 3)
- [ ] 預設全 5 啟用,等同無過濾 ✓ (Task 4)
- [ ] `enabledCount < 5` 時 header 顯示 `{n}/5` badge ✓ (Task 3)
- [ ] `incompatibleCount > 0` 時顯示 warning notice + Remove 按鈕 ✓ (Task 3)
- [ ] 點 Remove 移除對應 selections + 顯示 status toast ✓ (Task 4)
- [ ] `AttributionPopover` 觸發鈕 + 列表 row 用新 incompatibility 判定 ✓ (Task 5)
- [ ] `LayerRow` tooltip 用新 i18n key,不再內插 license 名稱 ✓ (Task 5)
- [ ] `AdvancedPalette` header 用新 `{n}/5` badge ✓ (Task 5)
- [ ] Reset(filters)歸回 ALL_GROUPS;reset(outfit-only / view-only)filter 不動 ✓ (Task 4)
- [ ] v1 path(`slice-harness.tsx`)行為完全不變 ✓ (Task 5)
- [ ] i18n.ts en + zh-TW 兩 locale 都同步加入新 key ✓ (Task 2)
- [ ] web tests +8~12 個,維持 core 全綠 ✓ (Wrap-up)
