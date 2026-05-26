# Persistent Sidebar Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote v2's `⌘K AdvancedPalette` modal search into a persistent sidebar input with a floating dropdown, delete the modal + its trigger, and re-wire `⌘K` to focus the new input.

**Architecture:** Add `SidebarSearch.tsx` at the top of the sidebar (above `PresetChips`). Input renders inline; results render in an `absolute`-positioned dropdown that appears only when the query is non-empty and the input has focus. Keyboard navigation (↑ ↓ Enter Esc) lives in a small pure-function module so it can be unit-tested without DOM infrastructure. `AdvancedPalette.tsx` + `PaletteTrigger.tsx` are deleted entirely; their callsites in `harness.tsx` / `stack-panel.tsx` / `add-layer.tsx` are removed. `filterAndRankPaletteItems` is reused unchanged.

**Tech Stack:** TypeScript (strict), React 18 + hooks (incl. `useDeferredValue`), Vite, Tailwind, Vitest (node env), pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-05-27-persistent-search-design.md`

**Branch:** `feat/persistent-search` (created off `main`).

---

## Pre-flight

- [ ] **Step 0.1: Create feature branch**

  ```bash
  cd /Users/william/gitRepo/lpc-toolkit-2026-1
  git checkout -b feat/persistent-search
  ```

- [ ] **Step 0.2: Verify baseline**

  ```bash
  pnpm --filter @lpc-toolkit/core test
  pnpm --filter @lpc-toolkit/web test
  pnpm --filter @lpc-toolkit/web typecheck
  ```

  Expected: core ~146 / web ~184 tests green, typecheck clean.

---

## Task 1: Keyboard reducer + unit tests

**Files:**
- Create: `packages/web/src/components/layer-stack/sidebar-search-keyboard.ts`
- Create: `packages/web/test/sidebar-search-keyboard.test.ts`

**Outcome:** Two pure functions (`nextActiveIndex`, `pickIndexForEnter`) with full unit test coverage. No other code touched.

- [ ] **Step 1.1: Write the failing tests**

  Create `packages/web/test/sidebar-search-keyboard.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import {
    nextActiveIndex,
    pickIndexForEnter,
  } from '../src/components/layer-stack/sidebar-search-keyboard';

  describe('nextActiveIndex', () => {
    it('moves from -1 to 0 on ArrowDown', () => {
      expect(nextActiveIndex(-1, 'ArrowDown', 5)).toBe(0);
    });

    it('clamps at the last index on ArrowDown', () => {
      expect(nextActiveIndex(4, 'ArrowDown', 5)).toBe(4);
    });

    it('moves from 0 to -1 on ArrowUp', () => {
      expect(nextActiveIndex(0, 'ArrowUp', 5)).toBe(-1);
    });

    it('clamps at -1 on ArrowUp from -1', () => {
      expect(nextActiveIndex(-1, 'ArrowUp', 5)).toBe(-1);
    });

    it('returns -1 when results are empty', () => {
      expect(nextActiveIndex(0, 'ArrowDown', 0)).toBe(-1);
    });
  });

  describe('pickIndexForEnter', () => {
    it('returns the active index when active >= 0', () => {
      expect(pickIndexForEnter(3, 5)).toBe(3);
    });

    it('returns 0 (first row) when active is -1 but results exist', () => {
      expect(pickIndexForEnter(-1, 5)).toBe(0);
    });

    it('returns null when results are empty (active = -1)', () => {
      expect(pickIndexForEnter(-1, 0)).toBeNull();
    });

    it('returns null when results are empty (active = 0)', () => {
      expect(pickIndexForEnter(0, 0)).toBeNull();
    });
  });
  ```

- [ ] **Step 1.2: Run tests — expect failure**

  ```bash
  pnpm --filter @lpc-toolkit/web test sidebar-search-keyboard
  ```

  Expected: module-not-found error (the source file doesn't exist yet).

- [ ] **Step 1.3: Create the source module**

  Create `packages/web/src/components/layer-stack/sidebar-search-keyboard.ts`:

  ```ts
  export type ArrowKey = 'ArrowUp' | 'ArrowDown';

  export function nextActiveIndex(
    curr: number,
    key: ArrowKey,
    resultsLen: number,
  ): number {
    if (resultsLen === 0) return -1;
    if (key === 'ArrowDown') return Math.min(curr + 1, resultsLen - 1);
    return Math.max(curr - 1, -1);
  }

  export function pickIndexForEnter(
    active: number,
    resultsLen: number,
  ): number | null {
    if (resultsLen === 0) return null;
    if (active >= 0) return active;
    return 0;
  }
  ```

- [ ] **Step 1.4: Run tests — expect 9 passing**

  ```bash
  pnpm --filter @lpc-toolkit/web test sidebar-search-keyboard
  ```

  Expected: 5 `nextActiveIndex` + 4 `pickIndexForEnter` = 9 passing.

- [ ] **Step 1.5: Typecheck**

  ```bash
  pnpm --filter @lpc-toolkit/web typecheck
  ```

  Expected: clean (no callsite errors yet — file is new and uncalled).

- [ ] **Step 1.6: Commit**

  ```bash
  git add packages/web/src/components/layer-stack/sidebar-search-keyboard.ts \
          packages/web/test/sidebar-search-keyboard.test.ts
  git commit -m "$(cat <<'EOF'
  feat(web): add SidebarSearch keyboard reducer (pure fns + tests)

  nextActiveIndex / pickIndexForEnter are tiny pure helpers used by the
  upcoming SidebarSearch component. Extracting them keeps the component
  testable in the node-env vitest setup (no DOM required).

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 2: `SidebarSearch` component

**Files:**
- Create: `packages/web/src/components/layer-stack/sidebar-search.tsx`

**Outcome:** Component renders inline (no consumers yet). Compiles cleanly in isolation. Behavior validated by manual run after Task 4 wires it up.

- [ ] **Step 2.1: Create the file**

  Create `packages/web/src/components/layer-stack/sidebar-search.tsx`:

  ```tsx
  import {
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
    type RefObject,
  } from 'react';
  import {
    LICENSE_GROUP_ORDER,
    type Catalog,
    type PaletteMetadata,
    type TypeName,
  } from '@lpc-toolkit/core';
  import { pickActionForItem, type SliceState, type SliceAction } from '../../slice/selection';
  import type { AssetSource } from '../../adapter/asset-source';
  import type { LabelTranslator, Translator } from '../../i18n';
  import { itemMatchesLicenseFilter, type LicenseFilter } from '../../slice/license-filter';
  import { filterAndRankPaletteItems, type PaletteResult } from './palette-search';
  import { ItemThumbnail } from './item-thumbnail';
  import {
    nextActiveIndex,
    pickIndexForEnter,
  } from './sidebar-search-keyboard';

  const RESULT_LIMIT = 60;

  interface Props {
    catalog: Catalog;
    palettes: PaletteMetadata;
    state: SliceState;
    dispatch: (a: SliceAction) => void;
    assetSource: AssetSource;
    shownTypeNames: TypeName[];
    licenseFilter: LicenseFilter;
    t: Translator;
    tl: LabelTranslator;
    onPicked: (typeName: TypeName) => void;
    inputRef: RefObject<HTMLInputElement>;
  }

  export function SidebarSearch({
    catalog,
    palettes,
    state,
    dispatch,
    assetSource,
    shownTypeNames,
    licenseFilter,
    t,
    tl,
    onPicked,
    inputRef,
  }: Props) {
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(-1);
    const [isFocused, setIsFocused] = useState(false);
    const deferredQuery = useDeferredValue(query);
    const containerRef = useRef<HTMLDivElement>(null);
    const activeRowRef = useRef<HTMLButtonElement>(null);

    const results = useMemo(
      () =>
        filterAndRankPaletteItems({
          catalog,
          bodyType: state.bodyType,
          query: deferredQuery,
          shownTypeNames,
        }),
      [catalog, state.bodyType, deferredQuery, shownTypeNames],
    );
    const shown = results.slice(0, RESULT_LIMIT);

    const showDropdown = deferredQuery.trim().length > 0 && isFocused;

    useEffect(() => {
      if (!showDropdown) return;
      activeRowRef.current?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex, showDropdown]);

    useEffect(() => {
      if (!isFocused) return;
      const onPointerDown = (e: PointerEvent) => {
        const target = e.target as Node | null;
        if (!target || !containerRef.current) return;
        if (!containerRef.current.contains(target)) {
          setIsFocused(false);
        }
      };
      document.addEventListener('pointerdown', onPointerDown);
      return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [isFocused]);

    function onPick(result: PaletteResult) {
      if (!result.supports) return;
      dispatch(pickActionForItem(result.typeName, result.item));
      onPicked(result.typeName);
      setQuery('');
      setActiveIndex(-1);
      inputRef.current?.blur();
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showDropdown) {
          setQuery('');
          setActiveIndex(-1);
        } else {
          inputRef.current?.blur();
        }
        return;
      }
      if (!showDropdown) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((curr) => nextActiveIndex(curr, 'ArrowDown', shown.length));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((curr) => nextActiveIndex(curr, 'ArrowUp', shown.length));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const idx = pickIndexForEnter(activeIndex, shown.length);
        if (idx === null) return;
        const pick = shown[idx];
        if (pick) onPick(pick);
      }
    }

    return (
      <div ref={containerRef} className="relative px-2 pt-2 pb-1">
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2 py-1.5">
          <span className="text-text-mute">🔍</span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(-1);
            }}
            onFocus={() => setIsFocused(true)}
            onKeyDown={onKeyDown}
            placeholder={t('palette.placeholder')}
            aria-label={t('palette.title')}
            className="flex-1 bg-transparent text-[12px] text-text outline-none"
          />
          {licenseFilter.size < LICENSE_GROUP_ORDER.length && (
            <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-[10px] text-accent">
              {t('palette.licenseGroupsBadge').replace('{n}', String(licenseFilter.size))}
            </span>
          )}
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-text-dim">
            ⌘K
          </span>
        </div>

        {showDropdown && (
          <div
            className="absolute left-2 right-2 top-full z-30 mt-1 max-h-[50vh] overflow-hidden rounded-md border border-border bg-surface shadow-lg"
          >
            <div className="max-h-[calc(50vh-28px)] overflow-y-auto">
              {shown.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-text-mute">
                  {t('palette.no_match')}
                </div>
              ) : (
                shown.map((r, i) => {
                  const matchesFilter = itemMatchesLicenseFilter(r.item, licenseFilter);
                  const exceeded = !matchesFilter;
                  const selected = state.selections[r.typeName]?.name === r.item.name;
                  const itemLicense = r.item.credits[0]?.licenses[0];
                  const isActive = i === activeIndex;
                  return (
                    <button
                      key={`${r.typeName}:${r.item.name}`}
                      ref={isActive ? activeRowRef : undefined}
                      type="button"
                      disabled={!r.supports}
                      title={!r.supports ? t('palette.incompatible') : r.item.name}
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
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border px-3 py-1 text-[10px] text-text-dim">
              <span>
                {shown.length} of {results.length}
              </span>
              <span>
                <span className="font-mono">esc</span> close
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }
  ```

  **Notes:**
  - `ItemThumbnail` size 20 (smaller than AdvancedPalette's 24) to fit in 340px sidebar.
  - `onMouseEnter` syncs `activeIndex` to the row under the cursor — so keyboard and mouse stay in sync.
  - `pointerdown` listener on document closes the dropdown when the user clicks outside the component container.
  - `useDeferredValue(query)` mirrors the pattern already used in `slice-harness.tsx:69`.

- [ ] **Step 2.2: Typecheck**

  ```bash
  pnpm --filter @lpc-toolkit/web typecheck
  ```

  Expected: clean (the new component has no consumers yet, but its imports must all resolve).

- [ ] **Step 2.3: Run tests**

  ```bash
  pnpm --filter @lpc-toolkit/web test
  ```

  Expected: 184 + 9 = 193 passing.

- [ ] **Step 2.4: Commit**

  ```bash
  git add packages/web/src/components/layer-stack/sidebar-search.tsx
  git commit -m "$(cat <<'EOF'
  feat(web): add SidebarSearch component (not yet wired in)

  Inline input + floating dropdown that reuses filterAndRankPaletteItems
  and ItemThumbnail. Dropdown opens when query is non-empty and input is
  focused; closes on click outside, Esc (also clears query), or pick.
  Keyboard nav via the pure reducer from Task 1. Not yet wired to harness
  / StackPanel — that's Tasks 3 and 4.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 3: Harness refactor — remove paletteOpen / AdvancedPalette / PaletteTrigger + add searchInputRef

**Files:**
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

**Outcome:** Modal-trigger state and JSX gone. `⌘K` listener focuses the new search input. `searchInputRef` defined and forwarded to `StackPanel`. After this task, `harness.tsx` typechecks cleanly on its own, BUT `<StackPanel>` will fail typecheck because Task 4 hasn't yet updated `StackPanel`'s props. That's expected.

- [ ] **Step 3.1: Edit imports**

  Read the existing imports in `harness.tsx`. Make these specific edits:

  Find:
  ```ts
  import { useCallback, useEffect, useMemo, useState } from 'react';
  ```
  Replace:
  ```ts
  import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
  ```

  Find (around lines 33-34):
  ```ts
  import { PaletteTrigger } from './palette-trigger';
  import { AdvancedPalette } from './advanced-palette';
  ```
  Delete both lines entirely.

- [ ] **Step 3.2: Remove `paletteOpen` state, add `searchInputRef`**

  Find (around line 66):
  ```ts
  const [paletteOpen, setPaletteOpen] = useState(false);
  ```
  Replace with:
  ```ts
  const searchInputRef = useRef<HTMLInputElement>(null);
  ```

- [ ] **Step 3.3: Rewrite the ⌘K listener**

  Find (around lines 160-170):
  ```ts
  // Global ⌘K / Ctrl+K toggles the advanced palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  ```
  Replace with:
  ```ts
  // Global ⌘K / Ctrl+K focuses the sidebar search input (selects existing text if any).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  ```

- [ ] **Step 3.4: Remove `<PaletteTrigger>` from TopBar**

  Find (around line 278):
  ```tsx
  <PaletteTrigger onOpen={() => setPaletteOpen(true)} t={t} />
  ```
  Delete this line entirely.

- [ ] **Step 3.5: Remove `<AdvancedPalette>` from the layout**

  Find (around lines 323-339):
  ```tsx
  <AdvancedPalette
    open={paletteOpen}
    onClose={() => setPaletteOpen(false)}
    onPicked={(tn) => {
      setPaletteOpen(false);
      setExpanded(tn);
    }}
    state={props.state}
    dispatch={props.dispatch}
    catalog={props.catalog}
    palettes={props.palettes}
    assetSource={props.assetSource}
    shownTypeNames={props.shownTypeNames}
    licenseFilter={licenseFilter}
    t={t}
    tl={props.tl}
  />
  ```
  Delete the entire block (the closing `</div>` for the grid stays; just remove the `<AdvancedPalette>` JSX).

- [ ] **Step 3.6: Update `<StackPanel>` props**

  Find the `<StackPanel ... />` JSX (around lines 291-310). Change the props:

  Remove the line:
  ```tsx
  onOpenPalette={() => setPaletteOpen(true)}
  ```

  Add (anywhere among the props):
  ```tsx
  searchInputRef={searchInputRef}
  ```

  The final `<StackPanel>` JSX should look like:
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
    searchInputRef={searchInputRef}
  />
  ```

- [ ] **Step 3.7: Typecheck**

  ```bash
  pnpm --filter @lpc-toolkit/web typecheck 2>&1 | grep -E "harness\.tsx" | head -10
  ```
  Expected: zero matches in `harness.tsx` itself.

  ```bash
  pnpm --filter @lpc-toolkit/web typecheck 2>&1 | grep -E "stack-panel\.tsx" | head -10
  ```
  Expected: errors here — `searchInputRef` is unknown prop, `onOpenPalette` is missing. **These are expected and fixed by Task 4.**

- [ ] **Step 3.8: Commit**

  ```bash
  git add packages/web/src/components/layer-stack/harness.tsx
  git commit -m "$(cat <<'EOF'
  refactor(web): remove modal palette state from harness

  Removes paletteOpen state and the AdvancedPalette + PaletteTrigger JSX
  (their files are deleted in a later task). Rewrites the ⌘K shortcut to
  focus + select the new sidebar search input. Forwards searchInputRef to
  StackPanel; the StackPanel-side wiring lands next.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 4: StackPanel wiring + AddLayer cleanup + i18n cleanup

**Files:**
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`
- Modify: `packages/web/src/components/layer-stack/add-layer.tsx`
- Modify: `packages/web/src/i18n.ts`

**Outcome:** `<SidebarSearch>` rendered at top of sidebar. `onOpenPalette` removed from the StackPanel → AddLayer prop chain. AddLayer's `🔍 ⌘K` shortcut button removed (redundant with the now-always-visible SidebarSearch). Dead i18n key `add.search` removed from both locales. After this task, typecheck across the whole web package is clean.

- [ ] **Step 4.1: Edit `stack-panel.tsx` — imports + Props**

  Read the existing file. Find (line 1):
  ```ts
  import { useEffect, useMemo, useState } from 'react';
  ```
  Replace with (adds `type RefObject` to the named imports — matches the style used in `sidebar-search.tsx`):
  ```ts
  import { useEffect, useMemo, useState, type RefObject } from 'react';
  ```

  Find the existing imports block (around lines 2-6) and add ONE new line at the end of the block:
  ```ts
  import { SidebarSearch } from './sidebar-search';
  ```

  Find in the Props interface (around lines 27-29):
  ```ts
    onPresetApplied: (name: string, skippedCount: number, skippedTypes: string[]) => void;
    status: { kind: 'info' | 'warn' | 'error'; text: string } | null;
    onOpenPalette: () => void;
  ```
  Replace with:
  ```ts
    onPresetApplied: (name: string, skippedCount: number, skippedTypes: string[]) => void;
    status: { kind: 'info' | 'warn' | 'error'; text: string } | null;
    searchInputRef: RefObject<HTMLInputElement>;
  ```

- [ ] **Step 4.2: Edit `stack-panel.tsx` — destructure**

  Find the destructure (around line 50):
  ```ts
    onPresetApplied,
    status,
    onOpenPalette,
    expanded,
    setExpanded,
  ```
  Replace `onOpenPalette` with `searchInputRef`:
  ```ts
    onPresetApplied,
    status,
    searchInputRef,
    expanded,
    setExpanded,
  ```

- [ ] **Step 4.3: Edit `stack-panel.tsx` — render SidebarSearch at top**

  Find the start of the return block (around line 67):
  ```tsx
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PresetChips
  ```
  Insert `<SidebarSearch>` before `<PresetChips>`:
  ```tsx
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidebarSearch
        catalog={catalog}
        palettes={palettes}
        state={state}
        dispatch={dispatch}
        assetSource={assetSource}
        shownTypeNames={shownTypeNames}
        licenseFilter={licenseFilter}
        t={t}
        tl={tl}
        onPicked={(tn) => setExpanded(tn)}
        inputRef={searchInputRef}
      />
      <PresetChips
  ```

- [ ] **Step 4.4: Edit `stack-panel.tsx` — remove `onOpenPalette` from `<AddLayer>`**

  Find the `<AddLayer ... />` element (around line 126). Remove the prop:
  ```tsx
  onOpenPalette={onOpenPalette}
  ```
  (Keep all other AddLayer props intact.)

- [ ] **Step 4.5: Edit `add-layer.tsx` — remove the shortcut button + the prop**

  Read the existing file. Find (around lines 14-18):
  ```ts
    adding: boolean;
    setAdding: (v: boolean) => void;
    onAdded: (tn: TypeName) => void;
    onOpenPalette: () => void;
  }
  ```
  Replace with:
  ```ts
    adding: boolean;
    setAdding: (v: boolean) => void;
    onAdded: (tn: TypeName) => void;
  }
  ```

  Find the destructure (line 22):
  ```ts
  export function AddLayer({
    catalog, dispatch, inactive, bodyType, t, tl,
    adding, setAdding, onAdded, onOpenPalette,
  }: Props) {
  ```
  Replace with:
  ```ts
  export function AddLayer({
    catalog, dispatch, inactive, bodyType, t, tl,
    adding, setAdding, onAdded,
  }: Props) {
  ```

  Find the `🔍 ⌘K` shortcut button (around lines 26-48). The current JSX is:
  ```tsx
  if (!adding) {
    return (
      <div className="mt-2 mb-2 flex gap-1">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex flex-1 items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-[12px] text-text-mute hover:bg-surface-2"
        >
          <span>＋</span>
          <span>{t('add.button')}</span>
          <span className="ml-auto font-mono text-[10px]">
            {inactive.length} {t('add.available')}
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenPalette}
          title={t('add.search')}
          className="flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-2 text-[12px] text-text-mute hover:bg-surface-2"
        >
          <span>🔍</span>
          <span className="font-mono text-[10px]">⌘K</span>
        </button>
      </div>
    );
  }
  ```
  Replace with (delete the second `<button>` entirely and unwrap the flex layout since only one button remains):
  ```tsx
  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="mt-2 mb-2 flex w-full items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-[12px] text-text-mute hover:bg-surface-2"
      >
        <span>＋</span>
        <span>{t('add.button')}</span>
        <span className="ml-auto font-mono text-[10px]">
          {inactive.length} {t('add.available')}
        </span>
      </button>
    );
  }
  ```

- [ ] **Step 4.6: Edit `i18n.ts` — remove `add.search` from both locales**

  Find in the `en` block (search for `'add.search'`):
  ```ts
      'add.search': 'Search all assets',
  ```
  Delete this line.

  Find in the `zh-TW` block:
  ```ts
      'add.search': '搜尋所有素材',
  ```
  Delete this line.

  **Do not touch `picker.searchAssets`** — it is still used by v1 `slice-harness.tsx:560`.

- [ ] **Step 4.7: Typecheck full package**

  ```bash
  pnpm --filter @lpc-toolkit/web typecheck
  ```
  Expected: clean exit (0 errors). Common pitfalls if it fails:
  - `React` / `RefObject` not imported in `stack-panel.tsx`
  - `SidebarSearch` imported but not used (or wrong import path)
  - Stray `onOpenPalette` reference left in `stack-panel.tsx` body

- [ ] **Step 4.8: Run tests**

  ```bash
  pnpm --filter @lpc-toolkit/web test
  ```
  Expected: 193 passing (184 baseline + 9 from Task 1).

- [ ] **Step 4.9: Commit**

  ```bash
  git add packages/web/src/components/layer-stack/stack-panel.tsx \
          packages/web/src/components/layer-stack/add-layer.tsx \
          packages/web/src/i18n.ts
  git commit -m "$(cat <<'EOF'
  feat(web): mount SidebarSearch in sidebar, drop AddLayer modal shortcut

  StackPanel renders SidebarSearch at the top (above PresetChips), wired
  to setExpanded on pick. AddLayer loses its 🔍 ⌘K button — the sidebar
  search is now persistently visible so the duplicate shortcut is
  redundant. add.search i18n key is removed (en + zh-TW); picker.searchAssets
  stays because v1 slice-harness still references it.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 5: Delete old `AdvancedPalette` + `PaletteTrigger` files

**Files:**
- Delete: `packages/web/src/components/layer-stack/advanced-palette.tsx`
- Delete: `packages/web/src/components/layer-stack/palette-trigger.tsx`

**Outcome:** Dead files removed. Tasks 3 + 4 already removed all imports, so deletion is a no-op for typecheck.

- [ ] **Step 5.1: Confirm no remaining imports**

  ```bash
  grep -rn "AdvancedPalette\|PaletteTrigger\|palette-trigger\|advanced-palette" packages/web/src
  ```
  Expected: only the file names themselves (no `import` statements). If anything else shows up, abort and fix the import in that file before deleting.

- [ ] **Step 5.2: Delete the files**

  ```bash
  git rm packages/web/src/components/layer-stack/advanced-palette.tsx \
         packages/web/src/components/layer-stack/palette-trigger.tsx
  ```

- [ ] **Step 5.3: Typecheck + tests**

  ```bash
  pnpm --filter @lpc-toolkit/web typecheck
  pnpm --filter @lpc-toolkit/web test
  ```
  Expected: typecheck clean; web test count still 193.

- [ ] **Step 5.4: Manual verification — run dev server**

  ```bash
  pnpm --filter @lpc-toolkit/web dev
  ```

  Open the URL it prints (typically `http://localhost:5173`). Verify all spec acceptance bullets:

  1. Sidebar top has a 🔍 input with placeholder `Search by name, category, author` (en) / `依名稱、分類、作者搜尋` (zh-TW).
  2. ⌘K (or Ctrl-K) focuses the input. With existing text, it selects.
  3. Type `hair` — dropdown appears below input, showing items, ranked supported-first.
  4. ↓ ↑ keys move highlight; the highlighted row scrolls into view.
  5. Enter on highlighted row picks it (clears query, expands that layer in the sidebar).
  6. Enter with no highlight (activeIndex = -1) picks the first row.
  7. Esc with non-empty query → clears query + closes dropdown (input stays focused).
  8. Esc with empty query → input loses focus.
  9. Click outside dropdown → dropdown closes, query stays in input.
  10. Re-focus input → dropdown re-opens (query stays).
  11. License filter < 5 enabled → small `{n}/5 license groups` badge visible inside the input bar.
  12. Items not in enabled license groups → grey-out with ⚠ corner mark.
  13. Items incompatible with current body type → grey-out, disabled.
  14. Already-selected items show ✓ on the right.
  15. AddLayer button is a single full-width dashed button (no 🔍 ⌘K side button).
  16. No top-bar PaletteTrigger button (the gray "Search all assets ⌘K" pill from before is gone).
  17. Switch to zh-TW — all SidebarSearch text translates correctly.

  If any of these fails, fix before committing. Then proceed to Step 5.5.

- [ ] **Step 5.5: Commit**

  ```bash
  git commit -m "$(cat <<'EOF'
  chore(web): delete AdvancedPalette + PaletteTrigger

  Functionality moved to SidebarSearch in Tasks 2-4. No remaining imports.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Wrap-up

- [ ] **Step W.1: Final full sweep**

  ```bash
  pnpm --filter @lpc-toolkit/core test
  pnpm --filter @lpc-toolkit/web test
  pnpm --filter @lpc-toolkit/web typecheck
  ```
  All green.

- [ ] **Step W.2: Review branch state**

  ```bash
  git log --oneline main..HEAD
  git diff main...HEAD --stat
  ```

  Expected commits (5):
  1. `feat(web): add SidebarSearch keyboard reducer (pure fns + tests)`
  2. `feat(web): add SidebarSearch component (not yet wired in)`
  3. `refactor(web): remove modal palette state from harness`
  4. `feat(web): mount SidebarSearch in sidebar, drop AddLayer modal shortcut`
  5. `chore(web): delete AdvancedPalette + PaletteTrigger`

  Expected stat: ~4 new files (sidebar-search.tsx, sidebar-search-keyboard.ts, their test), ~5 modified files, 2 deleted files.

- [ ] **Step W.3: Hand off to finishing-a-development-branch**

  Branch ready for merge via `superpowers:finishing-a-development-branch`.

---

## Acceptance check (against spec § 驗收)

- [ ] Sidebar 最頂端有 SidebarSearch input ✓ (Task 4)
- [ ] 打字時 dropdown 浮在 input 下方,query 非空才顯示 ✓ (Task 2)
- [ ] Dropdown 顯示最多 60 結果,supports/unsupported/已選/不在 license 的視覺差異一致 ✓ (Task 2)
- [ ] ↑↓ 鍵 navigation,activeIndex 高亮,scrollIntoView 跟隨 ✓ (Task 1 + 2)
- [ ] Enter 在 active=−1 時選第一個,active≥0 時選 active ✓ (Task 1 + 2)
- [ ] Esc 兩段:dropdown 開 → 清 query + 收;dropdown 關 → input blur ✓ (Task 2)
- [ ] ⌘K focus + select input ✓ (Task 3)
- [ ] Pick 後:dispatch + setExpanded + 清 query + blur ✓ (Task 2 + 4)
- [ ] Click outside dropdown → 收 dropdown,保留 query ✓ (Task 2)
- [ ] License badge 在 size < 5 時顯示 `{n}/5 groups` ✓ (Task 2)
- [ ] `AdvancedPalette` + `PaletteTrigger` 兩個檔不存在於 src ✓ (Task 5)
- [ ] `paletteOpen` state 不存在於 harness ✓ (Task 3)
- [ ] AddLayer 不再有 🔍 ⌘K 按鈕,prop chain 乾淨 ✓ (Task 4)
- [ ] `add.search` 已從 i18n 刪除;`picker.searchAssets` 保留(v1 用)✓ (Task 4)
- [ ] web tests +9 個(共 193),core + 全部 web tests 全綠 ✓ (Wrap-up)
