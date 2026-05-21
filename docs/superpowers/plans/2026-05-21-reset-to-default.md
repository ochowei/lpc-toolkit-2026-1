# Reset to default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a header "Reset" button with a dropdown letting the user opt into restoring outfit, view state, and/or filters to first-load defaults.

**Architecture:** A new reducer action `reset` handles outfit + view scope restoration; filters reset is handled inline in `SliceHarness` (license filter + search input live in component state, not reducer state). The trigger is a hand-rolled popover button placed in the header before the language toggle. No new dependencies.

**Tech Stack:** React 18, TypeScript strict, Vitest, Tailwind + shadcn `Button`. Component tests are intentionally out of scope — the project has no React Testing Library setup and adding it for one menu would be disproportionate. The menu is covered by manual smoke testing (Task 5); the reducer is covered by unit tests (Task 1).

**Spec:** `docs/superpowers/specs/2026-05-21-reset-to-default-design.md`

---

## File map

- **Modify** `packages/web/src/slice/selection.ts` — add `reset` to `SliceAction`, add reducer branch.
- **Modify** `packages/web/test/selection.test.ts` — add a `describe('sliceReducer reset')` block.
- **Modify** `packages/web/src/i18n.ts` — add 7 translation keys per locale.
- **Modify** `packages/web/test/i18n.test.ts` — assert the new keys translate.
- **Modify** `packages/web/src/App.tsx` — add `onReset` handler that dispatches `reset` with `init.state`.
- **Modify** `packages/web/src/components/slice-harness.tsx` — accept `onReset` prop, add inline `ResetMenu` component, render it in the header before the language `Button`, pass filter/search resetters into it.

---

## Task 1: Reducer action `reset`

**Files:**
- Modify: `packages/web/src/slice/selection.ts`
- Test: `packages/web/test/selection.test.ts`

- [ ] **Step 1.1: Add failing reducer tests**

Append the following describe block to `packages/web/test/selection.test.ts` (after the existing `describe('sliceReducer', ...)` block, before the file ends):

```ts
describe('sliceReducer reset', () => {
  const init: SliceState = {
    bodyType: 'male',
    selections: {
      body: { typeName: 'body', name: 'Body Color', recolor: 'light' },
      head: { typeName: 'head', name: 'Human Male', recolor: 'light' },
      expression: { typeName: 'expression', name: 'Neutral', recolor: 'light' },
    },
    anim: 'walk',
    dir: 'down',
    playing: true,
  };

  const mutated: SliceState = {
    bodyType: 'female',
    selections: {
      body: { typeName: 'body', name: 'Body Color', recolor: 'light' },
      hair: { typeName: 'hair', name: 'Hair A' },
    },
    anim: 'slash',
    dir: 'left',
    playing: false,
  };

  it('outfit-only reset restores bodyType + selections, leaves view untouched', () => {
    const s = sliceReducer(mutated, {
      type: 'reset',
      scopes: { outfit: true, view: false },
      init,
    });
    expect(s.bodyType).toBe(init.bodyType);
    expect(s.selections).toEqual(init.selections);
    expect(s.anim).toBe(mutated.anim);
    expect(s.dir).toBe(mutated.dir);
    expect(s.playing).toBe(mutated.playing);
  });

  it('view-only reset restores anim/dir/playing, leaves outfit untouched', () => {
    const s = sliceReducer(mutated, {
      type: 'reset',
      scopes: { outfit: false, view: true },
      init,
    });
    expect(s.bodyType).toBe(mutated.bodyType);
    expect(s.selections).toEqual(mutated.selections);
    expect(s.anim).toBe(init.anim);
    expect(s.dir).toBe(init.dir);
    expect(s.playing).toBe(init.playing);
  });

  it('outfit + view reset restores all four fields', () => {
    const s = sliceReducer(mutated, {
      type: 'reset',
      scopes: { outfit: true, view: true },
      init,
    });
    expect(s).toEqual(init);
  });

  it('reset with no scopes is a no-op', () => {
    const s = sliceReducer(mutated, {
      type: 'reset',
      scopes: { outfit: false, view: false },
      init,
    });
    expect(s).toEqual(mutated);
  });
});
```

- [ ] **Step 1.2: Run the new tests to confirm they fail**

```bash
pnpm --filter @lpc-toolkit/web test -- test/selection.test.ts
```

Expected: failure inside the new `describe('sliceReducer reset', ...)` block — TypeScript will reject the action object (`type: 'reset'` is not assignable to `SliceAction`) or the reducer's `default` branch returns the input unchanged, making the first three assertions fail.

- [ ] **Step 1.3: Add the action variant to `SliceAction`**

In `packages/web/src/slice/selection.ts`, extend the union (current location: `selection.ts:20-33`):

```ts
export type SliceAction =
  | { type: 'set_body_type'; bodyType: BodyType }
  | {
      type: 'pick';
      typeName: TypeName;
      name: string;
      variant?: string;
      recolor?: string;
    }
  | { type: 'clear'; typeName: TypeName }
  | { type: 'apply_selections'; selections: Selections }
  | {
      type: 'reset';
      scopes: { outfit: boolean; view: boolean };
      init: SliceState;
    }
  | { type: 'set_anim'; anim: AnimationName }
  | { type: 'set_dir'; dir: Direction }
  | { type: 'toggle_play' };
```

- [ ] **Step 1.4: Implement the reducer branch**

In the same file, add this case inside `sliceReducer` (between `case 'apply_selections'` and `case 'set_anim'`):

```ts
    case 'reset': {
      let next = s;
      if (a.scopes.outfit) {
        next = {
          ...next,
          bodyType: a.init.bodyType,
          selections: a.init.selections,
        };
      }
      if (a.scopes.view) {
        next = {
          ...next,
          anim: a.init.anim,
          dir: a.init.dir,
          playing: a.init.playing,
        };
      }
      return next;
    }
```

The "no scopes" case naturally returns the input reference unchanged (the no-op test asserts `toEqual`, not referential equality, so this is fine).

- [ ] **Step 1.5: Run the tests to confirm they pass**

```bash
pnpm --filter @lpc-toolkit/web test -- test/selection.test.ts
```

Expected: all four `sliceReducer reset` tests pass, plus existing tests remain green.

- [ ] **Step 1.6: Commit**

```bash
git add packages/web/src/slice/selection.ts packages/web/test/selection.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add reset reducer action for outfit and view

Adds a 'reset' SliceAction that restores bodyType + selections and/or
anim/dir/playing back to a caller-provided init state. Filter state is
intentionally out of scope — license filter and search input live in
component state, not the reducer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: i18n keys

**Files:**
- Modify: `packages/web/src/i18n.ts`
- Test: `packages/web/test/i18n.test.ts`

- [ ] **Step 2.1: Add failing translation assertions**

In `packages/web/test/i18n.test.ts`, append the following test inside the existing `describe('i18n', ...)` block:

```ts
  it('translates reset menu labels', () => {
    const en = createTranslator('en');
    const zh = createTranslator('zh-TW');

    expect(en('reset.button')).toBe('Reset');
    expect(en('reset.menuTitle')).toBe('What to reset');
    expect(en('reset.scope.outfit')).toBe('Outfit');
    expect(en('reset.scope.view')).toBe('View');
    expect(en('reset.scope.filters')).toBe('Filters');
    expect(en('reset.confirm')).toBe('Reset selected');
    expect(en('reset.cancel')).toBe('Cancel');

    expect(zh('reset.button')).toBe('重置');
    expect(zh('reset.menuTitle')).toBe('要重置的項目');
    expect(zh('reset.scope.outfit')).toBe('服裝');
    expect(zh('reset.scope.view')).toBe('檢視');
    expect(zh('reset.scope.filters')).toBe('篩選');
    expect(zh('reset.confirm')).toBe('重置選取項目');
    expect(zh('reset.cancel')).toBe('取消');
  });
```

- [ ] **Step 2.2: Run the i18n tests to confirm failure**

```bash
pnpm --filter @lpc-toolkit/web test -- test/i18n.test.ts
```

Expected: TypeScript error or runtime failure — the keys are not yet in `TranslationKey`.

- [ ] **Step 2.3: Add the seven keys to both locales**

In `packages/web/src/i18n.ts`, add the keys to the `en` block (e.g., after `'token.unresolved'`) and to the `zh-TW` block in the same position. Inserts:

```ts
// inside the `en` object:
'reset.button': 'Reset',
'reset.menuTitle': 'What to reset',
'reset.scope.outfit': 'Outfit',
'reset.scope.view': 'View',
'reset.scope.filters': 'Filters',
'reset.confirm': 'Reset selected',
'reset.cancel': 'Cancel',
```

```ts
// inside the `zh-TW` object:
'reset.button': '重置',
'reset.menuTitle': '要重置的項目',
'reset.scope.outfit': '服裝',
'reset.scope.view': '檢視',
'reset.scope.filters': '篩選',
'reset.confirm': '重置選取項目',
'reset.cancel': '取消',
```

The order within each object does not matter, but keep en and zh-TW in matching order for readability.

- [ ] **Step 2.4: Run i18n tests to confirm pass**

```bash
pnpm --filter @lpc-toolkit/web test -- test/i18n.test.ts
```

Expected: all i18n tests pass (including the existing `keeps English and Chinese translation keys in sync` test).

- [ ] **Step 2.5: Commit**

```bash
git add packages/web/src/i18n.ts packages/web/test/i18n.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add reset menu translation keys

Seven new keys per locale for the upcoming reset-to-default dropdown:
button, menu title, three scope labels, confirm, cancel.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `onReset` plumbing in `App.tsx`

**Files:**
- Modify: `packages/web/src/App.tsx`

- [ ] **Step 3.1: Add `onReset` handler and pass it to `SliceHarness`**

Replace the body of the `App` component in `packages/web/src/App.tsx` so that an `onReset` handler is created and threaded into `SliceHarness`:

```tsx
  const [state, dispatch] = useReducer(sliceReducer, init.state);

  const handleReset = (scopes: { outfit: boolean; view: boolean }) => {
    dispatch({ type: 'reset', scopes, init: init.state });
  };

  document.documentElement.className = `lpc ${theme}`;

  return (
    <SliceHarness
      catalog={init.catalog}
      shownTypeNames={init.shownTypeNames}
      state={state}
      dispatch={dispatch}
      theme={theme}
      locale={locale}
      assetSource={assetSource}
      t={t}
      onAssetSourceChange={setAssetSource}
      onReset={handleReset}
      onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      onToggleLocale={() =>
        setLocale((current) => (current === 'en' ? 'zh-TW' : 'en'))
      }
    />
  );
```

- [ ] **Step 3.2: Typecheck (expected to fail until Task 4 lands the prop on `SliceHarness`)**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: TS2322 / TS2769 saying `onReset` is not a known prop on `SliceHarness`. **Do not commit yet** — Task 4 makes it compile.

---

## Task 4: `ResetMenu` component and `SliceHarness` prop

**Files:**
- Modify: `packages/web/src/components/slice-harness.tsx`

- [ ] **Step 4.1: Add the `onReset` prop to `SliceHarness`**

In `packages/web/src/components/slice-harness.tsx`, extend the prop type (current location: `slice-harness.tsx:66-77`):

```tsx
export function SliceHarness({
  catalog,
  shownTypeNames,
  state,
  dispatch,
  theme,
  locale,
  assetSource,
  t,
  onAssetSourceChange,
  onReset,
  onToggleTheme,
  onToggleLocale,
}: {
  catalog: Catalog;
  shownTypeNames: string[];
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  theme: 'dark' | 'light';
  locale: Locale;
  assetSource: AssetSource;
  t: Translator;
  onAssetSourceChange: (source: AssetSource) => void;
  onReset: (scopes: { outfit: boolean; view: boolean }) => void;
  onToggleTheme: () => void;
  onToggleLocale: () => void;
}) {
```

- [ ] **Step 4.2: Add `useEffect` to the React import**

At the top of `slice-harness.tsx` (line 1), change:

```tsx
import { useDeferredValue, useMemo, useRef, useState } from 'react';
```

to:

```tsx
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
```

- [ ] **Step 4.3: Define the `ResetMenu` component at the bottom of the file**

Append the following to the end of `packages/web/src/components/slice-harness.tsx` (after the `SliceHarness` function definition closes):

```tsx
function ResetMenu({
  t,
  onReset,
  onResetLicenseFilter,
  onResetSearch,
}: {
  t: Translator;
  onReset: (scopes: { outfit: boolean; view: boolean }) => void;
  onResetLicenseFilter: () => void;
  onResetSearch: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [scopes, setScopes] = useState({
    outfit: true,
    view: false,
    filters: false,
  });
  const rootRef = useRef<HTMLDivElement | null>(null);

  const close = () => {
    setOpen(false);
    setScopes({ outfit: true, view: false, filters: false });
  };

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const anySelected = scopes.outfit || scopes.view || scopes.filters;

  const confirm = () => {
    if (scopes.filters) {
      onResetLicenseFilter();
      onResetSearch();
    }
    onReset({ outfit: scopes.outfit, view: scopes.view });
    close();
  };

  const toggle = (key: 'outfit' | 'view' | 'filters') =>
    setScopes((s) => ({ ...s, [key]: !s[key] }));

  return (
    <div ref={rootRef} className="relative">
      <Button
        size="sm"
        variant="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {t('reset.button')}
      </Button>
      {open && (
        <div
          role="menu"
          aria-label={t('reset.menuTitle')}
          className="absolute right-0 z-10 mt-1 w-56 rounded-md border border-border bg-surface-2 p-2 shadow-lg"
        >
          <div className="px-1 pb-1 text-[11px] uppercase text-text-mute">
            {t('reset.menuTitle')}
          </div>
          {(
            [
              ['outfit', 'reset.scope.outfit'],
              ['view', 'reset.scope.view'],
              ['filters', 'reset.scope.filters'],
            ] as const
          ).map(([key, labelKey]) => (
            <button
              key={key}
              type="button"
              role="menuitemcheckbox"
              aria-checked={scopes[key]}
              onClick={() => toggle(key)}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-surface-3"
            >
              <span
                aria-hidden
                className="inline-block h-3 w-3 rounded border border-border text-center leading-3"
              >
                {scopes[key] ? '✓' : ''}
              </span>
              {t(labelKey)}
            </button>
          ))}
          <div className="mt-2 flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={close}>
              {t('reset.cancel')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!anySelected}
              onClick={confirm}
            >
              {t('reset.confirm')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4.4: Render `ResetMenu` in the header**

In the header section (current location: `slice-harness.tsx:262-276`), insert the `ResetMenu` immediately before the language `Button`:

```tsx
      <header className="flex items-center gap-3 border-b border-border px-4 py-2">
        <span className="font-bold">
          LPC<span className="text-text-mute">·Toolkit</span>
        </span>
        <span className="text-text-dim text-xs">{t('app.subtitle')}</span>
        <div className="flex-1" />
        <ResetMenu
          t={t}
          onReset={onReset}
          onResetLicenseFilter={() => setLicenseFilter(null)}
          onResetSearch={() => setAssetSearch('')}
        />
        <Button size="sm" variant="ghost" onClick={onToggleLocale}>
          {locale === 'en'
            ? t('language.toChinese')
            : t('language.toEnglish')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onToggleTheme}>
          {theme === 'dark' ? t('theme.light') : t('theme.dark')}
        </Button>
      </header>
```

- [ ] **Step 4.5: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: no errors.

- [ ] **Step 4.6: Run the full test suite**

```bash
pnpm --filter @lpc-toolkit/web test
```

Expected: all tests pass (no new tests added in this task; this is a regression check that the reducer and i18n tests still pass).

- [ ] **Step 4.7: Commit (Task 3 + Task 4 together)**

```bash
git add packages/web/src/App.tsx packages/web/src/components/slice-harness.tsx
git commit -m "$(cat <<'EOF'
feat(web): add reset-to-default header dropdown

New ResetMenu component in the header lets the user pick which
categories to restore (outfit / view / filters) before confirming.
Outfit and view dispatch the new 'reset' reducer action; filters reset
clears the local license filter and asset search state in SliceHarness.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Manual smoke test

**Files:** (none modified)

- [ ] **Step 5.1: Start the dev server**

```bash
pnpm --filter @lpc-toolkit/web dev
```

Open the URL it prints (usually `http://localhost:5173`).

- [ ] **Step 5.2: Mutate state across all three scopes**

In the running app:
1. Pick a non-default hair item.
2. Switch direction to `Left`.
3. Click `Pause`.
4. Change animation to something other than `walk`.
5. Set the license filter to a specific license (not "All licenses").
6. Type a query into the "Search all assets" input.

- [ ] **Step 5.3: Reset outfit only**

Click `Reset`. Confirm:
- Menu opens, anchored under the button.
- `Outfit` checkbox is checked, `View` and `Filters` are unchecked.
- `Reset selected` is enabled.

Click `Reset selected`. Confirm:
- Character returns to body / heads_human_male / face_neutral (no hair).
- Direction is still `Left`, still paused, animation unchanged.
- License filter still shows the specific license.
- Search input still contains your query.
- Menu has closed.

- [ ] **Step 5.4: Reset filters only**

Open `Reset` again. Uncheck `Outfit`, check `Filters`. Confirm `Reset selected` is enabled, then click it. Confirm:
- License filter is back to "All licenses".
- Search input is empty.
- Outfit and view state unchanged.

- [ ] **Step 5.5: Reset view only**

Mutate view state again (pause, change direction, change animation). Open `Reset`, uncheck `Outfit`, check `View` only, confirm. Confirm:
- Direction is `Down`, playing, animation `walk`.
- Outfit and filters unchanged.

- [ ] **Step 5.6: Cancel and outside-click dismissal**

Open `Reset`, click `Cancel` — menu closes, nothing changes. Open `Reset` again, click somewhere else in the page — menu closes, nothing changes. Open `Reset`, press `Escape` — menu closes.

- [ ] **Step 5.7: Disabled confirm**

Open `Reset`, uncheck all three boxes. Confirm `Reset selected` is disabled (greyed out, click does nothing).

- [ ] **Step 5.8: Verify in `zh-TW`**

Click the language button to switch to Chinese. Re-open `Reset`. Confirm:
- Trigger label: `重置`.
- Heading: `要重置的項目`.
- Scope labels: `服裝`, `檢視`, `篩選`.
- Buttons: `重置選取項目` and `取消`.

- [ ] **Step 5.9: Stop the dev server**

In the terminal where `pnpm dev` is running: `Ctrl-C`.

- [ ] **Step 5.10: Final repo check**

```bash
git status
git log --oneline -5
```

Expected: working tree clean, three new commits ahead of `main` (`feat(web): add reset reducer ...`, `feat(web): add reset menu translation keys`, `feat(web): add reset-to-default header dropdown`).
