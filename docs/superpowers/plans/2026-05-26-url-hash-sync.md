# URL Hash Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two-way sync between v2 web UI state and `window.location.hash`, using the raw upstream-compatible query-string format (`#sex=male&body=Body_color_light&...`). Sharable links, browser back/forward, and a "Copy share link" button in TokenPopover.

**Architecture:** A new `packages/web/src/lib/url-hash-sync.ts` module exposes three pure helpers (`bootstrapStateFromHash`, `computeHashWrite`, `computeHashChangeAction`) plus one thin React hook (`useUrlHashSync`). All DOM/`window` access lives in the hook and a tiny `readWindowHash()` reader. App.tsx wires bootstrap (in its `useMemo` `init`) and LayerStackHarness mounts the hook + emits an initial-warning status. Core (`serializeHash` / `parseHash`) is untouched.

**Tech Stack:** TypeScript strict, React 18 (`useReducer` / `useEffect` / `useRef`), Vitest in `node` environment, pnpm workspaces. `@lpc-toolkit/core` resolves from `src/` via vite alias — no mid-session core build.

**Reference spec:** `docs/superpowers/specs/2026-05-26-url-hash-sync-design.md`

---

## File Structure

**Create:**
- `packages/web/src/lib/url-hash-sync.ts` — pure helpers + `useUrlHashSync` hook
- `packages/web/test/url-hash-sync.test.ts` — unit tests for the pure helpers

**Modify:**
- `packages/web/src/i18n.ts` — add `token.copyLink` and `hashSync.skipped` (en + zh-TW)
- `packages/web/src/App.tsx` — bootstrap initial state from hash; skip for v1; pass `initialHashWarnings` to LayerStackHarness
- `packages/web/src/components/layer-stack/harness.tsx` — add `initialHashWarnings` prop, emit one-shot status on mount, call `useUrlHashSync`
- `packages/web/src/components/layer-stack/popovers/token-popover.tsx` — add "Copy share link" button

**Out of scope (do not touch):**
- `packages/core/` (already has everything needed)
- `packages/web/src/slice/selection.ts` (reducer already has `apply_selections`)
- `packages/web/src/components/slice-harness.tsx` (v1 path; spec excludes)
- `upstream/` submodule

---

## Task 1: Add i18n keys

**Files:**
- Modify: `packages/web/src/i18n.ts`

- [ ] **Step 1: Add the two keys to the `en:` block**

In `packages/web/src/i18n.ts`, locate the `en:` block. Add `'token.copyLink'` right after the existing `'token.placeholder'` line (currently around line 95). Add `'hashSync.skipped'` immediately after that. The full additions:

```ts
'token.copyLink': 'Copy share link',
'hashSync.skipped': 'Ignored {n} unknown item(s) from URL',
```

- [ ] **Step 2: Add the same two keys to the `'zh-TW':` block**

In the `'zh-TW':` block, find `'token.placeholder': '在此貼上 token…'` (around line 202). Insert immediately after it:

```ts
'token.copyLink': '複製分享連結',
'hashSync.skipped': 'URL 中有 {n} 個未知項目被略過',
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```
Expected: PASS. `TranslationKey` is `keyof (typeof TRANSLATIONS)['en']`, so as long as both blocks share the same keys, the type widens correctly.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/i18n.ts
git commit -m "feat(web): add token.copyLink and hashSync.skipped i18n keys"
```

---

## Task 2: Create pure helpers in `url-hash-sync.ts` (TDD)

This task creates the testable core of the feature: three pure functions and one DOM-reader. The React hook comes in Task 3.

**Files:**
- Create: `packages/web/src/lib/url-hash-sync.ts`
- Create: `packages/web/test/url-hash-sync.test.ts`

### Step 1 — Write the failing tests

- [ ] **Step 1: Write the test file**

Create `packages/web/test/url-hash-sync.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { serializeHash } from '@lpc-toolkit/core';
import {
  bootstrapStateFromHash,
  computeHashChangeAction,
  computeHashWrite,
} from '../src/lib/url-hash-sync';
import { loadCatalogFromUpstream } from '../src/catalog/load-catalog';
import { loadPalettesFromUpstream } from '../src/catalog/load-palettes';
import { pickInitialSelections, toSelections } from '../src/slice/selection';

const catalog = loadCatalogFromUpstream();
const palettes = loadPalettesFromUpstream();
const defaults = pickInitialSelections(catalog).state;
const defaultsHash = serializeHash(toSelections(defaults));

describe('bootstrapStateFromHash', () => {
  it('returns defaults when rawHash is empty', () => {
    const result = bootstrapStateFromHash({
      rawHash: '',
      catalog,
      palettes,
      defaults,
    });
    expect(result.state).toBe(defaults);
    expect(result.warnings).toEqual([]);
  });

  it('replaces selections + bodyType when rawHash has valid items', () => {
    const result = bootstrapStateFromHash({
      rawHash: 'sex=female&body=Body_color_light',
      catalog,
      palettes,
      defaults,
    });
    expect(result.state.bodyType).toBe('female');
    expect(result.state.selections.body?.name).toBe('Body Color');
    // anim/dir/zoom/playing are preserved from defaults:
    expect(result.state.anim).toBe(defaults.anim);
    expect(result.state.dir).toBe(defaults.dir);
    expect(result.state.zoom).toBe(defaults.zoom);
    expect(result.warnings).toEqual([]);
  });

  it('returns defaults when every hash key is unknown', () => {
    const result = bootstrapStateFromHash({
      rawHash: 'fictional_type=foo&another_fake=bar',
      catalog,
      palettes,
      defaults,
    });
    expect(result.state).toBe(defaults);
    expect(result.warnings.length).toBe(2);
  });

  it('keeps known items and reports unknowns when partially valid', () => {
    const result = bootstrapStateFromHash({
      rawHash: 'sex=male&body=Body_color_light&fictional_xyz=foo',
      catalog,
      palettes,
      defaults,
    });
    expect(result.state.bodyType).toBe('male');
    expect(result.state.selections.body).toBeDefined();
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]?.key).toBe('fictional_xyz');
  });
});

describe('computeHashWrite', () => {
  it('returns null when currentHash equals nextHash', () => {
    expect(
      computeHashWrite({
        currentHash: 'sex=male&body=Body_color_light',
        nextHash: 'sex=male&body=Body_color_light',
        isFirstWrite: false,
      }),
    ).toBe(null);
  });

  it('returns "replace" on first write when hashes differ', () => {
    expect(
      computeHashWrite({
        currentHash: '',
        nextHash: 'sex=male&body=Body_color_light',
        isFirstWrite: true,
      }),
    ).toBe('replace');
  });

  it('returns "push" on subsequent writes when hashes differ', () => {
    expect(
      computeHashWrite({
        currentHash: 'sex=male&body=Body_color_light',
        nextHash: 'sex=male&body=Body_color_dark',
        isFirstWrite: false,
      }),
    ).toBe('push');
  });

  it('still returns null on first write when hashes already match', () => {
    expect(
      computeHashWrite({
        currentHash: 'sex=male&body=Body_color_light',
        nextHash: 'sex=male&body=Body_color_light',
        isFirstWrite: true,
      }),
    ).toBe(null);
  });
});

describe('computeHashChangeAction', () => {
  it('returns shouldApply=false when rawHash matches current state serialize', () => {
    const result = computeHashChangeAction({
      rawHash: defaultsHash,
      currentState: defaults,
      catalog,
      palettes,
    });
    expect(result.shouldApply).toBe(false);
    expect(result.selections).toBe(null);
  });

  it('returns parsed selections + warnings when rawHash differs', () => {
    const result = computeHashChangeAction({
      rawHash: 'sex=female&body=Body_color_light',
      currentState: defaults,
      catalog,
      palettes,
    });
    expect(result.shouldApply).toBe(true);
    expect(result.selections?.bodyType).toBe('female');
    expect(result.warnings).toEqual([]);
  });

  it('surfaces warnings when rawHash has unknown entries and differs', () => {
    const result = computeHashChangeAction({
      rawHash: 'sex=female&fictional_xyz=foo',
      currentState: defaults,
      catalog,
      palettes,
    });
    expect(result.shouldApply).toBe(true);
    expect(result.warnings.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test file to verify all tests fail**

```bash
pnpm --filter @lpc-toolkit/web test -- url-hash-sync.test.ts
```
Expected: FAIL with `Cannot find module '../src/lib/url-hash-sync'` (or a similar resolve error) on every test.

### Step 2 — Implement the helpers

- [ ] **Step 3: Create `url-hash-sync.ts` with the four helpers**

Create `packages/web/src/lib/url-hash-sync.ts`:

```ts
import {
  parseHash,
  serializeHash,
  type Catalog,
  type HashWarning,
  type PaletteMetadata,
  type Selections,
} from '@lpc-toolkit/core';
import { toSelections, type SliceState } from '../slice/selection';

export type HashWriteAction = 'replace' | 'push' | null;

export interface BootstrapResult {
  readonly state: SliceState;
  readonly warnings: readonly HashWarning[];
}

export interface HashChangeAction {
  readonly shouldApply: boolean;
  readonly selections: Selections | null;
  readonly warnings: readonly HashWarning[];
}

/** Read `window.location.hash`, stripping the leading `#`. */
export function readWindowHash(): string {
  const h = window.location.hash;
  return h.startsWith('#') ? h.slice(1) : h;
}

/**
 * Compute the initial SliceState given the URL hash and the defaults the
 * app would otherwise use. Pure; caller is responsible for reading
 * `window.location.hash`.
 *
 * - empty hash → defaults, no warnings
 * - hash with at least one resolvable item → defaults with `bodyType` and
 *   `selections` replaced by the parsed values (preserves `anim`, `dir`,
 *   `zoom`, `playing`)
 * - hash where every key is unknown → defaults, warnings non-empty so
 *   the caller can surface a status message
 */
export function bootstrapStateFromHash(args: {
  rawHash: string;
  catalog: Catalog;
  palettes: PaletteMetadata;
  defaults: SliceState;
}): BootstrapResult {
  if (args.rawHash === '') {
    return { state: args.defaults, warnings: [] };
  }
  const parsed = parseHash(args.rawHash, args.catalog, args.palettes);
  if (Object.keys(parsed.selections.items).length === 0) {
    return { state: args.defaults, warnings: parsed.warnings };
  }
  return {
    state: {
      ...args.defaults,
      bodyType: parsed.selections.bodyType,
      selections: parsed.selections.items,
    },
    warnings: parsed.warnings,
  };
}

/**
 * Decide what to do when state has changed and we want to write the new
 * hash. Returns `null` when the hashes already match (no-op), `'replace'`
 * for the bootstrap-time URL normalization (no history entry), and
 * `'push'` for user-driven state changes (back-able).
 */
export function computeHashWrite(args: {
  currentHash: string;
  nextHash: string;
  isFirstWrite: boolean;
}): HashWriteAction {
  if (args.currentHash === args.nextHash) return null;
  return args.isFirstWrite ? 'replace' : 'push';
}

/**
 * Decide whether a `hashchange` event needs to update state, and what
 * to apply. Returns `shouldApply: false` when the incoming hash equals
 * what the current state would serialize to (i.e. the event was the
 * echo of our own previous write — the invariant says we never reach
 * here in practice with pushState, but the guard is cheap and makes the
 * hook robust to future history-API changes).
 */
export function computeHashChangeAction(args: {
  rawHash: string;
  currentState: SliceState;
  catalog: Catalog;
  palettes: PaletteMetadata;
}): HashChangeAction {
  const expected = serializeHash(toSelections(args.currentState));
  if (args.rawHash === expected) {
    return { shouldApply: false, selections: null, warnings: [] };
  }
  const parsed = parseHash(args.rawHash, args.catalog, args.palettes);
  return {
    shouldApply: true,
    selections: parsed.selections,
    warnings: parsed.warnings,
  };
}
```

- [ ] **Step 4: Run the test file to verify all tests pass**

```bash
pnpm --filter @lpc-toolkit/web test -- url-hash-sync.test.ts
```
Expected: PASS (all 11 tests).

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/lib/url-hash-sync.ts packages/web/test/url-hash-sync.test.ts
git commit -m "feat(web): add url-hash-sync helpers (bootstrap, write, change)"
```

---

## Task 3: Add the `useUrlHashSync` React hook

The hook is a thin wrapper around the Task 2 helpers plus `window` / `history` side effects. It's intentionally NOT unit-tested (Vitest runs in `node`, not jsdom) — the helpers are tested, and end-to-end behavior is covered by the manual browser checklist in Task 6.

**Files:**
- Modify: `packages/web/src/lib/url-hash-sync.ts` (append the hook)

- [ ] **Step 1: Add `useRef` / `useEffect` imports and the hook**

At the **top** of `packages/web/src/lib/url-hash-sync.ts`, add the React imports immediately after the existing import block:

```ts
import { useEffect, useRef } from 'react';
import type { SliceAction } from '../slice/selection';
import type { Translator } from '../i18n';
```

At the **bottom** of the file, append:

```ts
/**
 * Two-way sync between SliceState and `window.location.hash`. Mount once
 * inside the harness; it:
 *
 * 1. On every state change, writes the serialized hash with `replaceState`
 *    on the first write (URL normalization, no history entry) and
 *    `pushState` thereafter (back-able).
 * 2. Listens for `hashchange` (browser back/forward, manual URL edit) and
 *    dispatches `apply_selections` to mirror the new hash into state.
 *
 * The "we just wrote this, ignore it" guard works because `pushState`
 * does not fire `hashchange` (HTML spec). The guard in
 * `computeHashChangeAction` is belt-and-braces.
 */
export function useUrlHashSync(args: {
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  catalog: Catalog;
  palettes: PaletteMetadata;
  t: Translator;
  onStatus: (text: string) => void;
}): void {
  const isFirstWriteRef = useRef(true);
  const stateRef = useRef(args.state);
  useEffect(() => {
    stateRef.current = args.state;
  }, [args.state]);

  // Write effect: state → hash.
  useEffect(() => {
    const nextHash = serializeHash(toSelections(args.state));
    const action = computeHashWrite({
      currentHash: readWindowHash(),
      nextHash,
      isFirstWrite: isFirstWriteRef.current,
    });
    if (action === null) return;
    const target = '#' + nextHash;
    if (action === 'replace') {
      window.history.replaceState(null, '', target);
    } else {
      window.history.pushState(null, '', target);
    }
    isFirstWriteRef.current = false;
  }, [args.state.bodyType, args.state.selections]);

  // Listen for external hash changes (back/forward, manual edit).
  useEffect(() => {
    const handler = () => {
      const action = computeHashChangeAction({
        rawHash: readWindowHash(),
        currentState: stateRef.current,
        catalog: args.catalog,
        palettes: args.palettes,
      });
      if (!action.shouldApply || action.selections === null) return;
      args.dispatch({ type: 'apply_selections', selections: action.selections });
      if (action.warnings.length > 0) {
        args.onStatus(
          args.t('hashSync.skipped').replace('{n}', String(action.warnings.length)),
        );
      }
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, [args.catalog, args.palettes, args.dispatch, args.t, args.onStatus]);
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```
Expected: PASS.

- [ ] **Step 3: Run web tests to confirm no regression**

```bash
pnpm --filter @lpc-toolkit/web test
```
Expected: PASS (all tests, including the helper tests from Task 2).

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/url-hash-sync.ts
git commit -m "feat(web): add useUrlHashSync hook (write + hashchange listener)"
```

---

## Task 4: Wire bootstrap + hook into App.tsx and LayerStackHarness

This task does two changes: App.tsx bootstrap initial state from hash (skipping for `?v=1` SliceHarness), and LayerStackHarness mounts the hook + emits a one-shot status for initial-load warnings.

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

### Step 1 — Update App.tsx to bootstrap from hash

- [ ] **Step 1: Add the new imports to App.tsx**

In `packages/web/src/App.tsx`, add these import statements alongside the existing imports (e.g. immediately after the `shouldUseV1` import). Do NOT reformat existing imports — add only:

```ts
import type { HashWarning } from '@lpc-toolkit/core';
import {
  bootstrapStateFromHash,
  readWindowHash,
} from './lib/url-hash-sync';
```

App.tsx does not need `useEffect` for this feature — the one-shot warning emission lives in LayerStackHarness (Task 4 Step 6). Don't add `useEffect` to the `react` import.

- [ ] **Step 2: Update the `init` useMemo to bootstrap from hash**

Replace the existing `init` useMemo block (currently lines 24–29) with:

```tsx
const init = useMemo(() => {
  const catalog = loadCatalogFromUpstream();
  const palettes = loadPalettesFromUpstream();
  const defaults = pickInitialSelections(catalog);
  const useV1 = shouldUseV1(window.location.search);
  const boot = useV1
    ? { state: defaults.state, warnings: [] as readonly HashWarning[] }
    : bootstrapStateFromHash({
        rawHash: readWindowHash(),
        catalog,
        palettes,
        defaults: defaults.state,
      });
  return {
    catalog,
    palettes,
    state: boot.state,
    warnings: boot.warnings,
    shownTypeNames: defaults.shownTypeNames,
  };
}, []);
```

- [ ] **Step 3: Pass `initialHashWarnings` to LayerStackHarness**

In the JSX `return` block of App.tsx, find the `<LayerStackHarness ... />` element and add one prop:

```tsx
initialHashWarnings={init.warnings}
```

Place it next to `shownTypeNames` for readability.

The `<SliceHarness ... />` element does **not** receive this prop.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```
Expected: FAIL with `Property 'initialHashWarnings' does not exist on type 'LayerStackHarnessProps'`. This is expected — we'll fix it in the next step.

### Step 2 — Update LayerStackHarness to mount the hook

- [ ] **Step 5: Add `initialHashWarnings` to `LayerStackHarnessProps`**

In `packages/web/src/components/layer-stack/harness.tsx`, add to the imports:

```ts
import type { HashWarning } from '@lpc-toolkit/core';
import { useUrlHashSync } from '../../lib/url-hash-sync';
```

In the `LayerStackHarnessProps` interface, add:

```ts
initialHashWarnings: readonly HashWarning[];
```

(Place it next to `shownTypeNames` for symmetry with App.tsx.)

- [ ] **Step 6: Mount `useUrlHashSync` and the one-shot warning effect**

Inside the `LayerStackHarness` component body, after the existing `useEffect` for ⌘K (around line 79) and before `handlePresetApplied`, add:

```tsx
useUrlHashSync({
  state: props.state,
  dispatch: props.dispatch,
  catalog: props.catalog,
  palettes: props.palettes,
  t,
  onStatus: (text) => setStatus({ kind: 'info', text }),
});

useEffect(() => {
  if (props.initialHashWarnings.length === 0) return;
  setStatus({
    kind: 'warn',
    text: t('hashSync.skipped').replace(
      '{n}',
      String(props.initialHashWarnings.length),
    ),
  });
  // Run once on mount only:
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

- [ ] **Step 7: Typecheck and run all tests**

```bash
pnpm --filter @lpc-toolkit/web typecheck && pnpm --filter @lpc-toolkit/web test
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/components/layer-stack/harness.tsx
git commit -m "feat(web): wire URL hash sync into App and LayerStackHarness"
```

---

## Task 5: Add "Copy share link" button to TokenPopover

**Files:**
- Modify: `packages/web/src/components/layer-stack/popovers/token-popover.tsx`

- [ ] **Step 1: Update imports**

In `packages/web/src/components/layer-stack/popovers/token-popover.tsx`, change the existing core import line:

```ts
import {
  decodeSelectionToken,
  encodeSelectionToken,
  type Catalog,
} from '@lpc-toolkit/core';
```

to:

```ts
import {
  decodeSelectionToken,
  encodeSelectionToken,
  serializeHash,
  type Catalog,
} from '@lpc-toolkit/core';
```

- [ ] **Step 2: Add the Copy share link button**

In the same file, locate the existing `Copy` button block (currently around lines 46–53):

```tsx
<div className="mb-2 flex gap-1">
  <Button size="sm" onClick={async () => {
    await navigator.clipboard.writeText(token);
    onStatus(`${t('token.copy')} ✓`);
  }}>
    {t('token.copy')}
  </Button>
</div>
```

Replace with:

```tsx
<div className="mb-2 flex gap-1">
  <Button size="sm" onClick={async () => {
    await navigator.clipboard.writeText(token);
    onStatus(`${t('token.copy')} ✓`);
  }}>
    {t('token.copy')}
  </Button>
  <Button
    size="sm"
    onClick={async () => {
      const hash = serializeHash(toSelections(state));
      const url = `${window.location.origin}${window.location.pathname}#${hash}`;
      await navigator.clipboard.writeText(url);
      onStatus(`${t('token.copyLink')} ✓`);
    }}
  >
    {t('token.copyLink')}
  </Button>
</div>
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```
Expected: PASS.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @lpc-toolkit/web test
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/layer-stack/popovers/token-popover.tsx
git commit -m "feat(web): add Copy share link button to TokenPopover"
```

---

## Task 6: Manual browser verification

This task has no code changes — it's the spec's acceptance checklist run against a live dev server. Do not skip; the React hook is not unit-tested and this is the primary verification.

**Files:** None.

- [ ] **Step 1: Start the dev server**

```bash
pnpm --filter @lpc-toolkit/web dev
```
Open `http://localhost:5173/` (or whatever port Vite reports).

- [ ] **Step 2: Initial-load URL normalization**

Visit `http://localhost:5173/` (no hash). Expected:
- Default character renders (male body, Human Male head, Neutral expression, light recolor)
- URL becomes `http://localhost:5173/#sex=male&body=Body_Color_light&head=Human_Male_light&expression=Neutral_light` (exact casing because `serializeHash` uses item names verbatim with spaces → underscores)
- Browser back arrow (history) does NOT show the no-hash URL as a separate entry (replaceState)

- [ ] **Step 3: State change → hash update + history push**

In the UI, change one layer (e.g. switch hair to any hair item). Expected:
- URL hash updates immediately to include the new selection
- Browser back arrow becomes active (pushState)

- [ ] **Step 4: Back / forward navigation**

Click browser **back**. Expected: hair selection reverts; URL hash reverts. Click **forward**: hair re-applied; URL hash advances.

- [ ] **Step 5: Cross-tab share**

Copy the full URL (with hash). Open a new tab, paste, hit Enter. Expected: identical character renders on first frame, no flash of default.

- [ ] **Step 6: Manual URL edit**

In the address bar, replace the hash with `#sex=female&body=Body_color_light` and hit Enter. Expected: character switches to female + light body. Status message may briefly indicate normalization.

- [ ] **Step 7: Upstream-compat**

Open the upstream official tool (https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/), build a character, copy its URL hash, paste the same hash into our app's URL. Expected: character loads (some items may fall back, but the body/head/clothes/etc. that exist in both catalogs should resolve).

- [ ] **Step 8: Partial-unknown hash**

Visit `http://localhost:5173/#sex=male&body=Body_color_light&fictional_xyz=foo`. Expected:
- Body loads (light male body)
- Status bar shows "Ignored 1 unknown item(s) from URL" (or zh-TW equivalent if locale toggled)
- URL hash is rewritten to drop `fictional_xyz` (because the next state-change effect serializes only known items)

- [ ] **Step 9: Legacy token in hash**

Visit `http://localhost:5173/#v1.SGVsbG8` (some arbitrary base64-ish string). Expected: falls back to defaults, status bar shows the "Ignored N unknown item(s)" message.

- [ ] **Step 10: TokenPopover Copy share link**

Open TokenPopover. Click "Copy share link" (in zh-TW: 複製分享連結). Open a new tab, paste, Enter. Expected: same character renders.

- [ ] **Step 11: ?v=1 path unaffected**

Visit `http://localhost:5173/?v=1`. Expected: legacy SliceHarness loads, URL hash is NOT mutated, and no hashSync warnings appear. Visit `http://localhost:5173/?v=1#sex=female` — `?v=1` should still load default character (hash sync disabled for v1).

- [ ] **Step 12: Regression sweep**

Verify the following still work in v2:
- BodyType popover toggle
- Token popover Copy / Paste & apply (existing buttons)
- Reset menu
- Attribution popover
- Download popover (PNG / TXT / CSV)
- Palette trigger (⌘K)
- Random outfit button (URL should update after randomize)
- Reset outfit (URL should revert to defaults)

- [ ] **Step 13: Dark / light + en / zh-TW**

Toggle theme to light then back to dark. Toggle locale to 中文 then back to English. Both should render the new "Copy share link" / "複製分享連結" button label correctly, and the warning status should localize.

- [ ] **Step 14: Final full test run**

```bash
pnpm --filter @lpc-toolkit/web test && pnpm --filter @lpc-toolkit/core test && pnpm --filter @lpc-toolkit/web typecheck
```
Expected: all green.

---

## Done criteria

All of these must be true before marking the feature shipped:

- [ ] Task 1–5 commits exist on the branch
- [ ] Task 6 manual checklist passes (all 13 steps)
- [ ] `pnpm typecheck` passes at repo root
- [ ] `pnpm test` passes at repo root
- [ ] `packages/core/` has zero changes (verify with `git diff main packages/core/`)
- [ ] `upstream/` submodule has zero changes
- [ ] No new `any` introduced (grep `git diff main -- '*.ts' '*.tsx' | grep -E ":\s*any"`)
- [ ] No `console.log` / `debugger` left behind (grep `git diff main -- '*.ts' '*.tsx' | grep -E "console\.log|debugger"`)
