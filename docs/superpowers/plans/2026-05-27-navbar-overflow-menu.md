# Navbar Overflow Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the top navbar by collapsing the Token, Reset, Attribution popover triggers and the Language / Theme toggle buttons into a single `⋯` overflow menu, while keeping BodyType, Download, Reload (↻), and Full Sheet buttons in their current positions.

**Architecture:** Refactor `usePopover` to accept an optional external anchor; refactor Token / Reset / Attribution popovers so their panels can be anchored to an external button (no built-in trigger). Introduce a new `MoreMenuPopover` that renders a single `⋯` button on the right side of the navbar, opens a dropdown with menu items, and dispatches to either the parent's `popover` state (Token/Reset/Attribution → opens the corresponding panel, anchored to the `⋯` button) or to locale/theme toggle handlers. Move locale/theme out of `TopBar` (they now live inside `MoreMenuPopover`).

**Tech Stack:** React 18 (functional + hooks), TypeScript strict, Tailwind, existing `Button` (shadcn-style) + `usePopover` hook + vitest for pure-logic tests.

---

## File Structure

**Modify**
- `packages/web/src/components/layer-stack/popovers/use-popover.ts` — accept optional external `anchorRef`.
- `packages/web/src/components/layer-stack/popovers/token-popover.tsx` — drop built-in trigger; accept `anchorRef` prop; panel-only.
- `packages/web/src/components/layer-stack/popovers/reset-menu-popover.tsx` — same.
- `packages/web/src/components/layer-stack/popovers/attribution-popover.tsx` — same; lift attribution summary into pure helper.
- `packages/web/src/components/layer-stack/top-bar.tsx` — remove hardcoded locale & theme buttons; add `rightSlot` prop rendered after the spacer (loading indicator stays put).
- `packages/web/src/components/layer-stack/harness.tsx` — own a single `moreMenuAnchorRef`; render `MoreMenuPopover` via `rightSlot`; render Token/Reset/Attribution popover **panels** (no triggers), all anchored to the shared ref; remove the in-line trigger buttons.
- `packages/web/src/i18n.ts` — add `more.title`, `more.preferences` keys (en + zh-TW).

**Create**
- `packages/web/src/components/layer-stack/popovers/attribution-summary.ts` — pure helper extracting `{ sourceCount, incompatibleAny }` from `(catalog, state, licenseFilter, animationFilter)`.
- `packages/web/src/components/layer-stack/popovers/more-menu-popover.tsx` — the new `⋯` dropdown component.
- `packages/web/test/attribution-summary.test.ts` — unit tests for the helper.

---

## Task 1: Refactor `usePopover` to accept an external anchor

**Files:**
- Modify: `packages/web/src/components/layer-stack/popovers/use-popover.ts`

- [ ] **Step 1: Update the hook signature & body**

Replace the entire file with:

```ts
import { useEffect, useRef, useState, type RefObject } from 'react';

export function usePopover(
  open: boolean,
  onClose: () => void,
  externalAnchorRef?: RefObject<HTMLElement | null>,
) {
  const internalAnchorRef = useRef<HTMLButtonElement | null>(null);
  const anchorRef = (externalAnchorRef ?? internalAnchorRef) as RefObject<HTMLButtonElement | null>;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) { setPos(null); return; }
    const a = anchorRef.current;
    if (!a) return;
    const r = a.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left });

    const onDoc = (e: MouseEvent) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(e.target as Node)) return;
      if (anchorRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);

  return { anchorRef, panelRef, pos };
}
```

Notes:
- `externalAnchorRef` is optional → callers that pass their own ref share that DOM node as the anchor.
- The `as` cast keeps the original `anchorRef` typing (HTMLButtonElement) for backward compatibility while accepting a wider `HTMLElement` ref from the outside.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS — all existing callers still use the hook with only two args, so they continue to receive the internal `anchorRef`.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/layer-stack/popovers/use-popover.ts
git commit -m "refactor(web): let usePopover accept an external anchor ref"
```

---

## Task 2: Extract `summarizeAttribution` helper + tests

**Files:**
- Create: `packages/web/src/components/layer-stack/popovers/attribution-summary.ts`
- Create: `packages/web/test/attribution-summary.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/web/test/attribution-summary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Catalog } from '@lpc-toolkit/core';
import { summarizeAttribution } from '../src/components/layer-stack/popovers/attribution-summary';
import type { SliceState } from '../src/slice/selection';
import { ALL_LICENSE_GROUPS } from '../src/slice/license-filter';

function makeCatalog(items: { typeName: string; name: string; licenses: readonly string[]; authors: readonly string[]; animations: readonly string[] }[]): Catalog {
  const byTypeName = new Map<string, { name: string; credits: { licenses: readonly string[]; authors: readonly string[] }[]; animations: readonly string[] }[]>();
  for (const it of items) {
    const arr = byTypeName.get(it.typeName) ?? [];
    arr.push({
      name: it.name,
      credits: [{ licenses: it.licenses as readonly never[], authors: it.authors as readonly string[] }],
      animations: it.animations as readonly never[],
    });
    byTypeName.set(it.typeName, arr);
  }
  return { byTypeName } as unknown as Catalog;
}

function makeState(sel: Record<string, { name: string }>): SliceState {
  return {
    bodyType: 'male',
    anim: 'walk',
    selections: sel as never,
    view: {} as never,
  } as SliceState;
}

describe('summarizeAttribution', () => {
  it('counts unique (authors|effectiveLicense) buckets', () => {
    const catalog = makeCatalog([
      { typeName: 'body', name: 'pale', licenses: ['CC0'], authors: ['Alice'], animations: ['walk'] },
      { typeName: 'hair', name: 'short', licenses: ['CC0'], authors: ['Alice'], animations: ['walk'] },
      { typeName: 'shirt', name: 'tee', licenses: ['CC-BY-SA 3.0'], authors: ['Bob'], animations: ['walk'] },
    ]);
    const state = makeState({
      body: { name: 'pale' }, hair: { name: 'short' }, shirt: { name: 'tee' },
    });
    const summary = summarizeAttribution(catalog, state, ALL_LICENSE_GROUPS, new Set());
    expect(summary.sourceCount).toBe(2);
    expect(summary.incompatibleAny).toBe(false);
  });

  it('flags incompatibleAny when an item fails the license filter', () => {
    const catalog = makeCatalog([
      { typeName: 'body', name: 'pale', licenses: ['CC-BY-SA 3.0'], authors: ['Alice'], animations: ['walk'] },
    ]);
    const state = makeState({ body: { name: 'pale' } });
    // empty license filter → nothing matches → incompatible
    const summary = summarizeAttribution(catalog, state, new Set(), new Set());
    expect(summary.incompatibleAny).toBe(true);
  });

  it('flags incompatibleAny when an item lacks an enabled animation', () => {
    const catalog = makeCatalog([
      { typeName: 'body', name: 'pale', licenses: ['CC0'], authors: ['Alice'], animations: ['walk'] },
    ]);
    const state = makeState({ body: { name: 'pale' } });
    const summary = summarizeAttribution(catalog, state, ALL_LICENSE_GROUPS, new Set(['cast']));
    expect(summary.incompatibleAny).toBe(true);
  });

  it('returns zero sources when nothing is selected', () => {
    const catalog = makeCatalog([]);
    const state = makeState({});
    const summary = summarizeAttribution(catalog, state, ALL_LICENSE_GROUPS, new Set());
    expect(summary.sourceCount).toBe(0);
    expect(summary.incompatibleAny).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @lpc-toolkit/web test -- attribution-summary`
Expected: FAIL with "Cannot find module … attribution-summary".

- [ ] **Step 3: Create the helper module**

Create `packages/web/src/components/layer-stack/popovers/attribution-summary.ts`:

```ts
import {
  computeEffectiveLicense,
  type Catalog,
  type License,
} from '@lpc-toolkit/core';
import {
  itemMatchesLicenseFilter,
  type LicenseFilter,
} from '../../../slice/license-filter';
import {
  itemMatchesAnimationFilter,
  type AnimationFilter,
} from '../../../slice/animation-filter';
import type { SliceState } from '../../../slice/selection';

export interface AttributionSummary {
  sourceCount: number;
  incompatibleAny: boolean;
}

export function summarizeAttribution(
  catalog: Catalog,
  state: SliceState,
  licenseFilter: LicenseFilter,
  animationFilter: AnimationFilter,
): AttributionSummary {
  const buckets = new Set<string>();
  let incompatibleAny = false;

  for (const [tn, sel] of Object.entries(state.selections)) {
    const item = (catalog.byTypeName.get(tn) ?? []).find((d) => d.name === sel.name);
    if (!item) continue;

    const seenLicenses = new Set<License>();
    const allLicenses: License[] = [];
    const seenAuthors = new Set<string>();
    const allAuthors: string[] = [];
    for (const credit of item.credits) {
      for (const license of credit.licenses) {
        if (!seenLicenses.has(license)) {
          seenLicenses.add(license);
          allLicenses.push(license);
        }
      }
      for (const author of credit.authors) {
        if (!seenAuthors.has(author)) {
          seenAuthors.add(author);
          allAuthors.push(author);
        }
      }
    }
    if (allLicenses.length === 0) continue;

    const effective = computeEffectiveLicense({
      entries: item.credits,
      licenses: allLicenses,
      resolvedPaths: [],
    });
    buckets.add(`${allAuthors.join(',')}|${effective}`);

    if (!itemMatchesLicenseFilter(item, licenseFilter)) incompatibleAny = true;
    if (!itemMatchesAnimationFilter(item, animationFilter)) incompatibleAny = true;
  }

  return { sourceCount: buckets.size, incompatibleAny };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @lpc-toolkit/web test -- attribution-summary`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/layer-stack/popovers/attribution-summary.ts \
        packages/web/test/attribution-summary.test.ts
git commit -m "refactor(web): extract summarizeAttribution helper with tests"
```

---

## Task 3: Refactor `AttributionPopover` to be panel-only when given an external anchor

**Files:**
- Modify: `packages/web/src/components/layer-stack/popovers/attribution-popover.tsx`

- [ ] **Step 1: Replace the component body**

Replace the entire file with:

```tsx
import { useMemo, type RefObject } from 'react';
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
import { summarizeAttribution } from './attribution-summary';

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  catalog: Catalog;
  state: SliceState;
  licenseFilter: LicenseFilter;
  animationFilter: AnimationFilter;
  t: Translator;
  tl: LabelTranslator;
  /** When provided, the popover renders panel-only (no built-in trigger). */
  anchorRef?: RefObject<HTMLElement | null>;
}

interface Row {
  typeName: string;
  item: ItemDefinition;
  effective: License;
  authors: string[];
  licenseIncompatible: boolean;
  animationIncompatible: boolean;
}

export function AttributionPopover({
  open,
  setOpen,
  catalog,
  state,
  licenseFilter,
  animationFilter,
  t,
  tl,
  anchorRef: externalAnchorRef,
}: Props) {
  const { anchorRef, panelRef, pos } = usePopover(open, () => setOpen(false), externalAnchorRef);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const [tn, sel] of Object.entries(state.selections)) {
      const item = (catalog.byTypeName.get(tn) ?? []).find((d) => d.name === sel.name);
      if (!item) continue;

      const allLicenses: License[] = [];
      const seenLicenses = new Set<License>();
      const allAuthors: string[] = [];
      const seenAuthors = new Set<string>();

      for (const credit of item.credits) {
        for (const license of credit.licenses) {
          if (!seenLicenses.has(license)) {
            seenLicenses.add(license);
            allLicenses.push(license);
          }
        }
        for (const author of credit.authors) {
          if (!seenAuthors.has(author)) {
            seenAuthors.add(author);
            allAuthors.push(author);
          }
        }
      }

      if (allLicenses.length === 0) continue;

      const manifest = { entries: item.credits, licenses: allLicenses, resolvedPaths: [] };
      const effective = computeEffectiveLicense(manifest);
      out.push({
        typeName: tn,
        item,
        effective,
        authors: allAuthors,
        licenseIncompatible: !itemMatchesLicenseFilter(item, licenseFilter),
        animationIncompatible: !itemMatchesAnimationFilter(item, animationFilter),
      });
    }
    return out;
  }, [catalog, state.selections, licenseFilter, animationFilter]);

  const summary = useMemo(
    () => summarizeAttribution(catalog, state, licenseFilter, animationFilter),
    [catalog, state, licenseFilter, animationFilter],
  );

  return (
    <>
      {!externalAnchorRef && (
        <Button
          ref={anchorRef}
          size="sm"
          variant={summary.incompatibleAny ? 'primary' : 'default'}
          className={summary.incompatibleAny ? 'border-danger text-danger' : ''}
          onClick={() => setOpen(!open)}
        >
          {summary.incompatibleAny ? '⚠ ' : '© '}
          {t('attribution.title')} · {summary.sourceCount}
        </Button>
      )}
      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
          className="max-h-96 w-96 overflow-y-auto rounded-md border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
            {t('attribution.title')}
          </div>
          {rows.length === 0 && (
            <div className="text-[11px] text-text-mute">No items selected.</div>
          )}
          <ul className="flex flex-col gap-1 text-[11px]">
            {rows.map((r) => (
              <li
                key={r.typeName}
                className={`rounded border border-border bg-surface-2 px-2 py-1 ${
                  r.licenseIncompatible || r.animationIncompatible ? 'border-danger text-danger' : ''
                }`}
              >
                <div className="font-semibold">{tl.category(r.typeName)}</div>
                <div className="font-mono text-[10px] text-text-mute">
                  {r.item.name} · {r.authors.join(', ') || '?'} · {r.effective}
                </div>
                {r.licenseIncompatible && (
                  <div className="text-[10px]">{t('attribution.licenseIncompatibleShort')}</div>
                )}
                {r.animationIncompatible && (
                  <div className="text-[10px]">{t('attribution.animationIncompatibleShort')}</div>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-border pt-2 text-[10px] text-text-mute">
            <a
              className="underline decoration-border underline-offset-2 hover:text-text"
              href="https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/"
              target="_blank"
              rel="noreferrer"
            >
              {t('source.project')}
            </a>
          </p>
        </div>
      )}
    </>
  );
}
```

Key changes:
- New optional `anchorRef` prop (typed `RefObject<HTMLElement | null>`).
- When `anchorRef` is provided, the built-in trigger button is **not rendered** (parent owns the trigger).
- `usePopover` is called with the external ref → the panel positions itself below the external button.
- Internal row computation unchanged (still used to render the panel list).

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS — existing harness still calls `AttributionPopover` without `anchorRef`, so it falls through to the built-in trigger.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/layer-stack/popovers/attribution-popover.tsx
git commit -m "refactor(web): make AttributionPopover panel-only when anchorRef passed"
```

---

## Task 4: Refactor `TokenPopover` to accept an external anchor

**Files:**
- Modify: `packages/web/src/components/layer-stack/popovers/token-popover.tsx`

- [ ] **Step 1: Update the component to accept `anchorRef`**

Replace the entire file with:

```tsx
import { useMemo, useState, type RefObject } from 'react';
import {
  decodeSelectionToken,
  encodeSelectionToken,
  serializeHash,
  type Catalog,
} from '@lpc-toolkit/core';
import { Button } from '../../ui/button';
import { usePopover } from './use-popover';
import { toSelections, type SliceAction, type SliceState } from '../../../slice/selection';
import type { Translator } from '../../../i18n';

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  catalog: Catalog;
  t: Translator;
  onStatus: (text: string) => void;
  anchorRef?: RefObject<HTMLElement | null>;
}

export function TokenPopover({
  open,
  setOpen,
  state,
  dispatch,
  catalog,
  t,
  onStatus,
  anchorRef: externalAnchorRef,
}: Props) {
  const { anchorRef, panelRef, pos } = usePopover(open, () => setOpen(false), externalAnchorRef);
  const token = useMemo(() => encodeSelectionToken(toSelections(state)), [state]);
  const [paste, setPaste] = useState('');

  return (
    <>
      {!externalAnchorRef && (
        <Button ref={anchorRef} size="sm" variant={open ? 'primary' : 'default'} onClick={() => setOpen(!open)}>
          🔗 Token
        </Button>
      )}
      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
          className="w-80 rounded-md border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
            {t('token.title')}
          </div>
          <textarea
            readOnly
            value={token}
            className="mb-2 h-16 w-full resize-none rounded border border-border bg-surface-2 p-2 text-[11px] font-mono"
          />
          <div className="mb-2 flex gap-1">
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(token);
                  onStatus(`${t('token.copy')} ✓`);
                } catch {
                  onStatus(t('token.copyFailed'));
                }
              }}
            >
              {t('token.copy')}
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                const hash = serializeHash(toSelections(state));
                const url = `${window.location.origin}${window.location.pathname}#${hash}`;
                try {
                  await navigator.clipboard.writeText(url);
                  onStatus(`${t('token.copyLink')} ✓`);
                } catch {
                  onStatus(t('token.copyFailed'));
                }
              }}
            >
              {t('token.copyLink')}
            </Button>
          </div>

          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={t('token.placeholder')}
            className="mb-2 h-16 w-full resize-none rounded border border-border bg-surface-2 p-2 text-[11px] font-mono"
          />
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="primary"
              disabled={!paste.trim()}
              onClick={() => {
                try {
                  const decoded = decodeSelectionToken(paste.trim(), catalog);
                  if (decoded.warnings.length > 0) {
                    onStatus(t('token.unresolved'));
                    return;
                  }
                  dispatch({ type: 'apply_selections', selections: decoded.selections });
                  setPaste('');
                  setOpen(false);
                  onStatus(`${t('token.paste')} ✓`);
                } catch (err) {
                  onStatus(`${t('token.invalid')}: ${String(err)}`);
                }
              }}
            >
              {t('token.paste')}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/layer-stack/popovers/token-popover.tsx
git commit -m "refactor(web): make TokenPopover panel-only when anchorRef passed"
```

---

## Task 5: Refactor `ResetMenuPopover` to accept an external anchor

**Files:**
- Modify: `packages/web/src/components/layer-stack/popovers/reset-menu-popover.tsx`

- [ ] **Step 1: Update the component to accept `anchorRef`**

Replace the entire file with:

```tsx
import { useState, type RefObject } from 'react';
import { Button } from '../../ui/button';
import { usePopover } from './use-popover';
import type { Translator } from '../../../i18n';

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  t: Translator;
  onReset: (scopes: { outfit: boolean; view: boolean; filters: boolean }) => void;
  anchorRef?: RefObject<HTMLElement | null>;
}

export function ResetMenuPopover({ open, setOpen, t, onReset, anchorRef: externalAnchorRef }: Props) {
  const { anchorRef, panelRef, pos } = usePopover(open, () => setOpen(false), externalAnchorRef);
  const [outfit, setOutfit] = useState(true);
  const [view, setView] = useState(false);
  const [filters, setFilters] = useState(false);

  return (
    <>
      {!externalAnchorRef && (
        <Button ref={anchorRef} size="sm" variant={open ? 'primary' : 'default'} onClick={() => setOpen(!open)}>
          ↻ Reset ▾
        </Button>
      )}
      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
          className="w-56 rounded-md border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
            {t('reset.menuTitle')}
          </div>
          <label className="mb-1 flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={outfit} onChange={(e) => setOutfit(e.target.checked)} />
            <span>{t('reset.scope.outfit')}</span>
          </label>
          <label className="mb-1 flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={view} onChange={(e) => setView(e.target.checked)} />
            <span>{t('reset.scope.view')}</span>
          </label>
          <label className="mb-2 flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={filters} onChange={(e) => setFilters(e.target.checked)} />
            <span>{t('reset.scope.filters')}</span>
          </label>
          <Button
            size="sm"
            variant="primary"
            disabled={!outfit && !view && !filters}
            onClick={() => {
              onReset({ outfit, view, filters });
              setOpen(false);
            }}
          >
            {t('reset.confirm')}
          </Button>
        </div>
      )}
    </>
  );
}
```

Note: also fixed the previous hardcoded English strings inside the panel (`"Reset scopes"`, `"Outfit"`, `"View"`, `"Reset"`) to use existing i18n keys — that's a tiny in-scope improvement because we're already touching this file.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/layer-stack/popovers/reset-menu-popover.tsx
git commit -m "refactor(web): make ResetMenuPopover panel-only when anchorRef passed"
```

---

## Task 6: Add new i18n keys for the More menu

**Files:**
- Modify: `packages/web/src/i18n.ts`

- [ ] **Step 1: Add the English keys**

Find the line `'advancedTools.cleared': 'Cleared custom image',` (last key in the `en` block, around line 155). Immediately after it, before the closing `},` of the `en` block, insert:

```ts
    'more.title': 'More',
    'more.preferences': 'Preferences',
    'more.language': 'Language',
    'more.theme': 'Theme',
```

- [ ] **Step 2: Add the zh-TW keys**

Find the line `'advancedTools.cleared': '已清除自訂圖片',` (last key in the `zh-TW` block, around line 303). Immediately after it, before the closing `},`, insert:

```ts
    'more.title': '更多',
    'more.preferences': '偏好',
    'more.language': '語言',
    'more.theme': '主題',
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS (`TranslationKey` is auto-derived from the en block; missing keys in zh-TW would error).

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/i18n.ts
git commit -m "feat(web/i18n): add more.title / more.preferences / more.language / more.theme"
```

---

## Task 7: Create `MoreMenuPopover` component

**Files:**
- Create: `packages/web/src/components/layer-stack/popovers/more-menu-popover.tsx`

- [ ] **Step 1: Write the component**

Create `packages/web/src/components/layer-stack/popovers/more-menu-popover.tsx`:

```tsx
import { useRef, type RefObject } from 'react';
import { Button } from '../../ui/button';
import { usePopover } from './use-popover';
import type { Locale, Translator } from '../../../i18n';

export type MoreMenuTarget = 'token' | 'reset' | 'attribution';

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  t: Translator;
  locale: Locale;
  theme: 'dark' | 'light';
  attributionCount: number;
  attributionIncompatible: boolean;
  onSelect: (target: MoreMenuTarget) => void;
  onToggleLocale: () => void;
  onToggleTheme: () => void;
  /** Forwarded so other popovers can anchor to the same `⋯` button. */
  anchorRefOut?: RefObject<HTMLButtonElement | null>;
}

export function MoreMenuPopover({
  open,
  setOpen,
  t,
  locale,
  theme,
  attributionCount,
  attributionIncompatible,
  onSelect,
  onToggleLocale,
  onToggleTheme,
  anchorRefOut,
}: Props) {
  const localAnchor = useRef<HTMLButtonElement | null>(null);
  const anchor = (anchorRefOut ?? localAnchor) as RefObject<HTMLButtonElement | null>;
  const { panelRef, pos } = usePopover(open, () => setOpen(false), anchor);

  const handlePick = (target: MoreMenuTarget) => {
    setOpen(false);
    onSelect(target);
  };

  return (
    <>
      <Button
        ref={anchor}
        size="sm"
        variant={open ? 'primary' : 'ghost'}
        className={attributionIncompatible ? 'border border-danger text-danger' : ''}
        onClick={() => setOpen(!open)}
        aria-label={t('more.title')}
        title={t('more.title')}
      >
        ⋯
      </Button>
      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, right: 12, zIndex: 50 }}
          className="w-56 rounded-md border border-border bg-surface p-1 text-[12px] shadow-lg"
          role="menu"
        >
          <MenuItem onClick={() => handlePick('token')} role="menuitem">
            <span>🔗 {t('token.title')}</span>
          </MenuItem>
          <MenuItem onClick={() => handlePick('reset')} role="menuitem">
            <span>↻ {t('reset.button')}</span>
          </MenuItem>
          <MenuItem
            onClick={() => handlePick('attribution')}
            role="menuitem"
            className={attributionIncompatible ? 'text-danger' : ''}
          >
            <span>
              {attributionIncompatible ? '⚠' : '©'} {t('attribution.title')}
            </span>
            <span className="ml-auto font-mono text-[10px] text-text-mute">
              {attributionCount}
            </span>
          </MenuItem>

          <div className="my-1 border-t border-border" />
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
            {t('more.preferences')}
          </div>

          <MenuItem onClick={() => { setOpen(false); onToggleLocale(); }} role="menuitem">
            <span>{t('more.language')}</span>
            <span className="ml-auto font-mono text-[10px] text-text-mute">
              {locale === 'en' ? 'EN' : '中文'}
            </span>
          </MenuItem>
          <MenuItem onClick={() => { setOpen(false); onToggleTheme(); }} role="menuitem">
            <span>{t('more.theme')}</span>
            <span className="ml-auto font-mono text-[10px] text-text-mute">
              {theme === 'dark' ? '☾' : '☀'}
            </span>
          </MenuItem>
        </div>
      )}
    </>
  );
}

function MenuItem({
  onClick,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-2 ' +
        (className ?? '')
      }
      {...rest}
    >
      {children}
    </button>
  );
}
```

Notes:
- Uses `right: 12` for the panel position instead of `left: pos.left` because the menu lives on the right edge of the navbar; anchoring by the right edge avoids the panel spilling off-screen when the `⋯` button is near the viewport edge. (The `pos.top` from `usePopover` is still useful — it places the panel right below the anchor.)
- `anchorRefOut` is exposed so harness.tsx can pass it down to Token/Reset/Attribution popovers, anchoring them to the same `⋯` button.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/layer-stack/popovers/more-menu-popover.tsx
git commit -m "feat(web): add MoreMenuPopover for navbar overflow"
```

---

## Task 8: Add `rightSlot` to `TopBar`, remove hardcoded locale/theme buttons

**Files:**
- Modify: `packages/web/src/components/layer-stack/top-bar.tsx`

- [ ] **Step 1: Update `TopBar`**

Replace the entire file with:

```tsx
import type { PropsWithChildren, ReactNode } from 'react';
import type { Translator } from '../../i18n';

interface Props {
  t: Translator;
  loadingProgress: number | null;
  rightSlot?: ReactNode;
}

export function TopBar({
  t,
  loadingProgress,
  rightSlot,
  children,
}: PropsWithChildren<Props>) {
  return (
    <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 text-xs">
      <div className="mr-1 flex flex-col leading-none">
        <span className="text-[13px] font-bold tracking-tight">
          LPC<span className="font-medium text-text-mute">·Toolkit</span>
        </span>
        <span className="font-mono text-[9px] text-text-dim">
          {t('app.subtitle')}
          {' · '}
          <a
            href="?ui=v1"
            className="underline-offset-2 hover:text-text-mute hover:underline"
            title="legacy UI (v1)"
          >
            v1
          </a>
        </span>
      </div>
      {children /* slots for BodyType pill, popovers, attribution */}
      <div className="flex-1" />
      {loadingProgress != null && loadingProgress < 1 && (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-text-dim">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          {t('status.loading')} {Math.round(loadingProgress * 100)}%
        </span>
      )}
      {rightSlot}
    </header>
  );
}
```

Changes:
- Removed `theme`, `locale`, `onToggleTheme`, `onToggleLocale` props.
- Removed hardcoded locale/theme `<Button>`s.
- Added a `rightSlot` prop rendered after the spacer + loading indicator.
- Removed unused `Button` import.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: FAIL — `harness.tsx` still passes the removed props to `<TopBar>`. We'll fix harness in Task 9.

- [ ] **Step 3: Do NOT commit yet**

Hold this change uncommitted; bundle with Task 9 so the working tree stays compileable per-commit.

---

## Task 9: Wire MoreMenu into `harness.tsx` and switch popovers to panel-only mode

**Files:**
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

- [ ] **Step 1: Add the `MoreMenuPopover` import and a shared anchor ref**

Near the other popover imports (around line 34-38), add:

```ts
import { MoreMenuPopover } from './popovers/more-menu-popover';
```

Then, in the `LayerStackHarness` function body, near the other refs/state (after `const searchInputRef = useRef<HTMLInputElement>(null);`, around line 77), add:

```ts
import { useRef } from 'react';
// ... and inside the component:
const moreMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
```

(The `useRef` import is already present at line 1 — just add the ref line inside the function.)

Then widen the `popover` state union to include `'more'`:

```ts
const [popover, setPopover] = useState<
  null | 'bodyType' | 'token' | 'reset' | 'attribution' | 'download' | 'more'
>(null);
```

- [ ] **Step 2: Compute the attribution summary in the harness**

In the harness function body (anywhere after `licenseFilter` and `animationFilter` are declared, e.g. just before the `composeSingleItem` definition around line 145), add:

```ts
import { summarizeAttribution } from './popovers/attribution-summary';
// inside the component:
const attributionSummary = useMemo(
  () => summarizeAttribution(props.catalog, props.state, licenseFilter, animationFilter),
  [props.catalog, props.state, licenseFilter, animationFilter],
);
```

(`useMemo` is already imported at line 1.)

- [ ] **Step 3: Update the `<TopBar>` invocation**

Locate the current `<TopBar … >` opening (line 306) and replace **only the prop list and the children block** so it looks like this:

```tsx
<TopBar
  t={t}
  loadingProgress={loadingProgress}
  rightSlot={
    <MoreMenuPopover
      open={popover === 'more'}
      setOpen={(v) => setPopover(v ? 'more' : null)}
      t={props.t}
      locale={locale}
      theme={theme}
      attributionCount={attributionSummary.sourceCount}
      attributionIncompatible={attributionSummary.incompatibleAny}
      onSelect={(target) => setPopover(target)}
      onToggleLocale={onToggleLocale}
      onToggleTheme={onToggleTheme}
      anchorRefOut={moreMenuAnchorRef}
    />
  }
>
  <BodyTypePopover
    open={popover === 'bodyType'}
    setOpen={(v) => setPopover(v ? 'bodyType' : null)}
    state={props.state}
    dispatch={props.dispatch}
    catalog={props.catalog}
    t={props.t}
    tl={props.tl}
    onIncompatibilityWarning={(names) => {
      setStatus({
        kind: 'warn',
        text: `Incompatible: ${names.join(', ')}.`,
      });
    }}
  />
  <TokenPopover
    open={popover === 'token'}
    setOpen={(v) => setPopover(v ? 'token' : null)}
    state={props.state}
    dispatch={props.dispatch}
    catalog={props.catalog}
    t={props.t}
    onStatus={(text) => setStatus({ kind: 'info', text })}
    anchorRef={moreMenuAnchorRef}
  />
  <ResetMenuPopover
    open={popover === 'reset'}
    setOpen={(v) => setPopover(v ? 'reset' : null)}
    t={props.t}
    onReset={({ outfit, view, filters }) => {
      if (outfit) {
        clearCustomOverlay();
      }
      if (outfit || view) {
        props.onReset({ outfit, view });
      }
      if (filters) {
        setLicenseFilter(ALL_LICENSE_GROUPS);
        setAnimationFilter(new Set<AnimationName>());
      }
      setStatus({ kind: 'info', text: 'Reset ✓' });
    }}
    anchorRef={moreMenuAnchorRef}
  />
  <AttributionPopover
    open={popover === 'attribution'}
    setOpen={(v) => setPopover(v ? 'attribution' : null)}
    catalog={props.catalog}
    state={props.state}
    licenseFilter={licenseFilter}
    animationFilter={animationFilter}
    t={props.t}
    tl={props.tl}
    anchorRef={moreMenuAnchorRef}
  />
  <DownloadPopover
    open={popover === 'download'}
    setOpen={(v) => setPopover(v ? 'download' : null)}
    result={composeResult}
    anim={props.state.anim}
    selections={toSelections(props.state)}
    catalog={props.catalog}
    assetSource={props.assetSource}
    composeSingleItem={composeSingleItem}
    customOverlay={customOverlay}
    zipRunning={zipRunning}
    setZipRunning={setZipRunning}
    t={props.t}
    onStatus={(s) => setStatus(s)}
  />
  <Button
    size="sm"
    variant="ghost"
    onClick={handleForceReload}
    title={t('reload.title')}
    aria-label={t('reload.title')}
  >
    ↻
  </Button>
</TopBar>
```

Changes summary:
- `<TopBar>` no longer receives `theme`, `locale`, `onToggleTheme`, `onToggleLocale` (they now flow into `MoreMenuPopover`).
- `<TopBar>` gets a `rightSlot` with `<MoreMenuPopover>`.
- `<TokenPopover>`, `<ResetMenuPopover>`, `<AttributionPopover>` each get `anchorRef={moreMenuAnchorRef}` — so they render panel-only, anchored to the `⋯` button.
- BodyType, Download, and the Reload `↻` button remain as left-side `children` items (unchanged behavior — they still render their own triggers).
- The previously hardcoded "Reset ✓" status text stays English to match existing string — we'll leave that as-is; it's outside this plan's scope.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS.

- [ ] **Step 5: Run all tests**

Run: `pnpm --filter @lpc-toolkit/web test`
Expected: PASS (no UI tests, but the existing pure-logic tests + the new `attribution-summary` test should all pass).

- [ ] **Step 6: Commit (bundles Task 8 + Task 9)**

```bash
git add packages/web/src/components/layer-stack/top-bar.tsx \
        packages/web/src/components/layer-stack/harness.tsx
git commit -m "feat(web): consolidate navbar into MoreMenu overflow dropdown"
```

---

## Task 10: Manual UI verification

The codebase has no React component tests, so we verify the UI directly.

- [ ] **Step 1: Start the dev server**

Run: `pnpm --filter @lpc-toolkit/web dev`
Open the printed URL (usually `http://localhost:5173`) in a browser.

- [ ] **Step 2: Verify the navbar layout**

Expected: navbar shows, from left to right:
1. `LPC·Toolkit` logo
2. BodyType pill (e.g. `♂ Male`)
3. Download button
4. `↻` reload button
5. (spacer)
6. (loading indicator when applicable)
7. `⋯` button (the new MoreMenu)

The Token, Reset, Attribution, Language (中文/EN), Theme (☾/☀) buttons should **NOT** appear directly on the navbar anymore.

- [ ] **Step 3: Verify the MoreMenu opens and routes correctly**

Click `⋯`. Expected: dropdown opens below the button containing:
- 🔗 Selection token
- ↻ Reset
- © Attribution · N  (or ⚠ if any incompatibility is present)
- ─── Preferences ───
- Language · EN (or 中文)
- Theme · ☾ (or ☀)

Click each menu item and confirm:
- 🔗 → Token popover opens anchored below `⋯`; menu closes.
- ↻ Reset → Reset popover opens with the 3 checkboxes.
- © Attribution → Attribution panel opens with the rows.
- Language → menu closes; locale toggles immediately (UI strings switch).
- Theme → menu closes; theme toggles immediately (colors switch).

- [ ] **Step 4: Verify the attribution warning indicator**

Apply a license filter that excludes one of the currently selected items (e.g. uncheck the relevant license group in the sidebar). Expected: the `⋯` button shows a red border + red text, and the Attribution menu item also shows `⚠`. Clear the filter — both indicators return to default.

- [ ] **Step 5: Verify Esc / outside-click closes the popovers**

Open `⋯`, then press Esc → menu closes.
Open `⋯` → click "Token" → click outside the Token panel → Token panel closes.

- [ ] **Step 6: Verify ⌘K / Ctrl+K still focuses the sidebar search**

Press ⌘K (mac) or Ctrl+K (linux/win). Expected: focus jumps to the sidebar search input.

- [ ] **Step 7: Verify other buttons still work**

- Click BodyType pill → BodyTypePopover opens, anchored to the pill (unchanged).
- Click Download → DownloadPopover opens (unchanged).
- Click `↻` → "Reloaded." status flashes (unchanged).
- Click Full Sheet (in the preview pane toolbar) → Full Sheet panel toggles (unchanged).

- [ ] **Step 8: Commit (only if any tweak was needed)**

If everything works on the first try, there's nothing to commit beyond Task 9. If you needed to adjust spacing, copy, or behavior:

```bash
git add packages/web/src/components/layer-stack/popovers/more-menu-popover.tsx
git commit -m "fix(web): tune MoreMenu after UI verification"
```

---

## Self-Review

**Spec coverage:**
- ✅ "Tools 跟 Preferences 合併成一個 ⋯ overflow menu" → Task 7 (MoreMenuPopover), Task 9 (harness wiring).
- ✅ "包含 Token, Reset, Attribution, Language, Theme" → MoreMenu items in Task 7.
- ✅ "Full Sheet 跟 Reload 保留不動" → Full Sheet untouched (preview-pane.tsx is not modified); the `↻` Reload button stays in `<TopBar>` children in Task 9.
- ✅ "BodyType 跟 Download 留在主 navbar" → both stay in `<TopBar>` children in Task 9.

**Placeholder scan:** No TBDs, no "implement similar to", no "add error handling" hand-waves. Every code step contains the full file content or a clearly-anchored snippet.

**Type consistency:**
- `MoreMenuTarget = 'token' | 'reset' | 'attribution'` ← matches the parent `popover` state union values in harness.
- `anchorRef?: RefObject<HTMLElement | null>` is consistent across TokenPopover, ResetMenuPopover, AttributionPopover.
- `MoreMenuPopover.anchorRefOut?: RefObject<HTMLButtonElement | null>` — narrower than the others on purpose (the actual `⋯` button is a `<button>`), but compatible because `HTMLButtonElement extends HTMLElement`.
- `summarizeAttribution` return type `{ sourceCount: number; incompatibleAny: boolean }` matches what MoreMenuPopover expects (`attributionCount: number`, `attributionIncompatible: boolean`).

**Risk areas to watch during execution:**
- `usePopover`'s effect dependency array gained `anchorRef`. Since refs are stable, this won't cause re-runs — but TypeScript's `RefObject` cast must hold; if a downstream callsite passes `MutableRefObject<…>`, that's also assignable. Verified by re-reading existing callsites (BodyType, Download still use the no-arg form).
- The MoreMenu panel uses `right: 12` instead of `left: pos.left`. If the navbar layout changes (e.g. wider safe-area inset on mobile), this could need tuning — fine for now.
