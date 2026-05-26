# Download Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a TopBar Download popover to v2 web UI with three actions — Spritesheet (PNG), Credits (TXT), Credits (CSV) — and a corresponding environment-agnostic `credits-format` module in `@lpc-toolkit/core`.

**Architecture:** Two-layer split. `packages/core/` gets pure formatters that produce upstream-byte-identical TXT/CSV from `CreditsManifest`. To enable byte-identical output the manifest gains a `resolvedPaths` parallel array (the actual PNG path per credit entry, mirroring upstream's `lastUsedPath`). `packages/web/` gets a tiny browser `downloadBlob` helper, a `DownloadPopover` component, and a harness-level lift of `useComposedCharacter` so the popover can read the same composed sheet PreviewPane uses (no duplicate compose).

**Tech Stack:** TypeScript strict, React 18, Tailwind, Vitest, pnpm workspaces. `@lpc-toolkit/core` resolves from `src/` via vite alias — no mid-session core build required.

**Reference spec:** `docs/superpowers/specs/2026-05-26-download-bar-design.md`

---

## File Structure

**Create:**
- `packages/core/src/credits-format.ts` — pure `creditsToTxt` / `creditsToCsv`
- `packages/core/test/credits-format.test.ts`
- `packages/web/src/lib/download.ts` — `downloadBlob` browser helper
- `packages/web/src/components/layer-stack/popovers/download-popover.tsx` — UI

**Modify:**
- `packages/core/src/types.ts` — extend `CreditsManifest` with `resolvedPaths`
- `packages/core/src/credits.ts` — populate `resolvedPaths` in `getCredits`
- `packages/core/src/index.ts` — re-export `creditsToTxt` / `creditsToCsv`
- `packages/core/test/credits.test.ts` — assert new `resolvedPaths` field
- `packages/web/src/components/layer-stack/popovers/attribution-popover.tsx` — pass `resolvedPaths: []` in synthesized manifest
- `packages/web/src/i18n.ts` — add 7 `download.*` keys (en + zh-TW)
- `packages/web/src/hooks/use-composed-character.ts` — no API change; just verifying it stays the single source
- `packages/web/src/components/layer-stack/harness.tsx` — lift `useComposedCharacter`, mount `DownloadPopover`
- `packages/web/src/components/layer-stack/preview-pane.tsx` — accept `result` via props, drop internal `useComposedCharacter` call and `onComposeStatus` callback

---

## Task 1: Add i18n keys for download

**Files:**
- Modify: `packages/web/src/i18n.ts`

- [ ] **Step 1: Add the 7 keys to both en and zh-TW blocks**

In `packages/web/src/i18n.ts`, inside the `en:` block (alphabetical-ish to match existing layout — place after the `direction.*` block, before `controls.*` is fine; the codebase isn't strict about ordering, just keep en and zh-TW symmetric):

```ts
// en block additions:
'download.title': 'Download',
'download.png': 'Spritesheet (PNG)',
'download.creditsTxt': 'Credits (TXT)',
'download.creditsCsv': 'Credits (CSV)',
'download.loading': 'Sheet is still composing…',
'download.failed': 'Download failed',
'download.done': 'Saved ✓',
```

```ts
// zh-TW block additions (same 7 keys):
'download.title': '下載',
'download.png': '完整圖集 (PNG)',
'download.creditsTxt': '授權說明 (TXT)',
'download.creditsCsv': '授權說明 (CSV)',
'download.loading': '圖集編譯中…',
'download.failed': '下載失敗',
'download.done': '已儲存 ✓',
```

- [ ] **Step 2: Typecheck**

Run from repo root:
```bash
pnpm --filter @lpc-toolkit/web typecheck
```
Expected: PASS (no errors). `TranslationKey` type is `keyof (typeof TRANSLATIONS)['en']`, so as long as both blocks share the same keys, the type will pick them up.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/i18n.ts
git commit -m "feat(web): add download.* i18n keys (en + zh-TW)"
```

---

## Task 2: Extend CreditsManifest with resolvedPaths

The upstream CSV/TXT filename column is the actual PNG path (e.g. `head/faces/male/blush/walk.png`), not the credit folder prefix (`head/faces`). To produce byte-identical output we record the matched used path per credit entry.

**Files:**
- Modify: `packages/core/src/types.ts:167-170` (CreditsManifest definition)
- Modify: `packages/core/src/credits.ts` (`getCredits`)
- Modify: `packages/core/test/credits.test.ts` (add resolvedPaths assertions)
- Modify: `packages/web/src/components/layer-stack/popovers/attribution-popover.tsx` (pass `resolvedPaths: []`)

- [ ] **Step 1: Write the failing test**

In `packages/core/test/credits.test.ts`, append a new test (inside the existing `describe('getCredits with real upstream JSON', ...)` block, after the body-male test):

```ts
it('returns resolvedPaths matching entry order, pointing to actual PNG paths', () => {
  const catalog = loadCatalog(['body/body.json']);
  const selections: Selections = {
    bodyType: 'male',
    items: { body: { typeName: 'body', name: 'Body Color' } },
  };

  const manifest = getCredits(selections, catalog);

  // resolvedPaths must be the same length as entries, parallel-indexed.
  expect(manifest.resolvedPaths.length).toBe(manifest.entries.length);

  // The body/bodies/male entry's resolved path should be a PNG under
  // body/bodies/male/, not the folder itself.
  const bodyIdx = manifest.entries.findIndex(
    (e) => e.file === 'body/bodies/male',
  );
  expect(bodyIdx).toBeGreaterThanOrEqual(0);
  expect(manifest.resolvedPaths[bodyIdx]).toMatch(
    /^body\/bodies\/male\/[a-z0-9_]+\.png$/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @lpc-toolkit/core test -- credits.test.ts
```
Expected: FAIL with `Property 'resolvedPaths' does not exist on type 'CreditsManifest'` (TypeScript error) — or runtime undefined depending on test setup.

- [ ] **Step 3: Extend CreditsManifest type**

In `packages/core/src/types.ts`, replace the `CreditsManifest` interface (around line 167):

```ts
export interface CreditsManifest {
  readonly entries: readonly CreditEntry[];
  /**
   * Parallel to `entries`: the actual PNG path that triggered each credit
   * to be included (upstream calls this `lastUsedPath`). Used by the
   * `credits-format` exporters to write the full filename column. Empty
   * array is valid for callers that synthesize a manifest without going
   * through `getCredits` (e.g. AttributionPopover) — exporters should
   * fall back to `entry.file + '/' + anim + '.png'` in that case.
   */
  readonly resolvedPaths: readonly string[];
  readonly licenses: readonly License[];
}
```

- [ ] **Step 4: Update getCredits to populate resolvedPaths**

In `packages/core/src/credits.ts`, change `isCreditUsed` to return the matched path (or `null`):

```ts
/**
 * Upstream prefix-match rule (`utils/credits.ts:72`): the credit row's
 * `file` field is a folder prefix, the layer's `usedPath` is the full PNG
 * path. Returns the matched used path (first hit wins, same as upstream),
 * or null if no used path matches.
 */
function matchCreditUsedPath(
  creditFile: string,
  usedPaths: readonly string[],
): string | null {
  for (const usedPath of usedPaths) {
    if (
      usedPath === creditFile ||
      usedPath.startsWith(creditFile + '/')
    ) {
      return usedPath;
    }
  }
  return null;
}
```

(Delete the old `isCreditUsed` function.)

Then update `getCredits` to capture the path. Replace the inner loop:

```ts
const entries: CreditEntry[] = [];
const resolvedPaths: string[] = [];
const licenses: License[] = [];
const seenFiles = new Set<string>();
const seenLicenses = new Set<License>();

for (const [typeName, sel] of Object.entries(selections.items)) {
  const found = findItem(catalog, typeName, sel.name);
  if (!found) continue;

  const usedPaths = usedPathsByItemId.get(found.itemId);
  if (!usedPaths || usedPaths.length === 0) continue;

  for (const credit of found.item.credits) {
    if (seenFiles.has(credit.file)) continue;
    const matched = matchCreditUsedPath(credit.file, usedPaths);
    if (matched === null) continue;

    seenFiles.add(credit.file);
    entries.push(credit);
    resolvedPaths.push(matched);
    for (const license of credit.licenses) {
      if (seenLicenses.has(license)) continue;
      seenLicenses.add(license);
      licenses.push(license);
    }
  }
}

return { entries, resolvedPaths, licenses };
```

- [ ] **Step 5: Update AttributionPopover synthesized manifest**

In `packages/web/src/components/layer-stack/popovers/attribution-popover.tsx`, find the `const manifest = { entries: item.credits, licenses: allLicenses };` line (around line 56 in the file) and add `resolvedPaths: []`:

```ts
const manifest = { entries: item.credits, licenses: allLicenses, resolvedPaths: [] };
```

- [ ] **Step 6: Run all core tests + typecheck**

```bash
pnpm --filter @lpc-toolkit/core test
pnpm --filter @lpc-toolkit/core typecheck
pnpm --filter @lpc-toolkit/web typecheck
```
Expected: All PASS. New test passes; existing credits tests still pass; AttributionPopover typechecks.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/credits.ts packages/core/test/credits.test.ts packages/web/src/components/layer-stack/popovers/attribution-popover.tsx
git commit -m "feat(core): track resolvedPaths in CreditsManifest"
```

---

## Task 3: creditsToTxt formatter

**Files:**
- Create: `packages/core/src/credits-format.ts`
- Create: `packages/core/test/credits-format.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/credits-format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { creditsToTxt } from '../src/credits-format.js';
import type { CreditsManifest } from '../src/types.js';

const SAMPLE: CreditsManifest = {
  entries: [
    {
      file: 'body/bodies/male',
      notes: '',
      authors: ['Alice', 'Bob'],
      licenses: ['CC-BY-SA 3.0', 'GPL 3.0'],
      urls: ['https://example.com/a'],
    },
    {
      file: 'head/faces',
      notes: 'sample notes',
      authors: ['Carol'],
      licenses: ['CC0'],
      urls: ['https://example.com/b', 'https://example.com/c'],
    },
  ],
  resolvedPaths: [
    'body/bodies/male/walk.png',
    'head/faces/male/blush/walk.png',
  ],
  licenses: ['CC-BY-SA 3.0', 'GPL 3.0', 'CC0'],
};

describe('creditsToTxt', () => {
  it('matches upstream creditsToTxt format byte-for-byte', () => {
    const out = creditsToTxt(SAMPLE, 'walk');
    // Upstream format (see upstream/sources/utils/credits.ts):
    //   `${fileName}\n\t- Note: ${notes}\n\t- Licenses:\n\t\t- L1\n\t\t- L2\n\t- Authors:\n\t\t- A1\n\t\t- A2\n\t- Links:\n\t\t- U1\n\n`
    // Note line only present when credit.notes is truthy.
    const expected =
      'body/bodies/male/walk.png\n' +
      '\t- Licenses:\n\t\t- CC-BY-SA 3.0\n\t\t- GPL 3.0\n' +
      '\t- Authors:\n\t\t- Alice\n\t\t- Bob\n' +
      '\t- Links:\n\t\t- https://example.com/a\n\n' +
      'head/faces/male/blush/walk.png\n' +
      '\t- Note: sample notes\n' +
      '\t- Licenses:\n\t\t- CC0\n' +
      '\t- Authors:\n\t\t- Carol\n' +
      '\t- Links:\n\t\t- https://example.com/b\n\t\t- https://example.com/c\n\n';
    expect(out).toBe(expected);
  });

  it('falls back to entry.file + /<anim>.png when resolvedPaths is empty', () => {
    const manifest: CreditsManifest = { ...SAMPLE, resolvedPaths: [] };
    const out = creditsToTxt(manifest, 'walk');
    // Should start with "body/bodies/male/walk.png" (fallback derives
    // filename from entry.file + /<anim>.png).
    expect(out.startsWith('body/bodies/male/walk.png\n')).toBe(true);
    // And the second entry falls back too:
    expect(out).toContain('head/faces/walk.png\n');
  });

  it('returns empty string for empty manifest', () => {
    const out = creditsToTxt(
      { entries: [], resolvedPaths: [], licenses: [] },
      'walk',
    );
    expect(out).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @lpc-toolkit/core test -- credits-format.test.ts
```
Expected: FAIL with `Cannot find module '../src/credits-format.js'`.

- [ ] **Step 3: Implement creditsToTxt**

Create `packages/core/src/credits-format.ts`:

```ts
import type { CreditsManifest } from './types.js';

/**
 * Pick the filename column value for entry index `i` of `manifest`. Mirrors
 * upstream `getAllCredits`/`creditsToTxt` (`upstream/sources/utils/credits.ts`)
 * which writes the resolved PNG path (its `lastUsedPath`). When the manifest
 * was synthesized without `resolvedPaths` (e.g. AttributionPopover's case),
 * we fall back to `entry.file + '/' + anim + '.png'` so output is still
 * sensible, just not necessarily byte-identical to upstream.
 */
function filenameFor(
  manifest: CreditsManifest,
  i: number,
  anim: string,
): string {
  const resolved = manifest.resolvedPaths[i];
  if (resolved) return resolved;
  return `${manifest.entries[i]!.file}/${anim}.png`;
}

/**
 * Serialize a CreditsManifest to the same TXT layout upstream produces
 * (`upstream/sources/utils/credits.ts:creditsToTxt`). Byte-identical when
 * `manifest.resolvedPaths` is populated (typical: produced by `getCredits`).
 * `anim` is only used by the filename fallback path.
 */
export function creditsToTxt(
  manifest: CreditsManifest,
  anim: string,
): string {
  let out = '';
  manifest.entries.forEach((credit, i) => {
    const fileName = filenameFor(manifest, i, anim);
    out += `${fileName}\n`;
    if (credit.notes) {
      out += `\t- Note: ${credit.notes}\n`;
    }
    out += `\t- Licenses:\n\t\t- ${credit.licenses.join('\n\t\t- ')}\n`;
    out += `\t- Authors:\n\t\t- ${credit.authors.join('\n\t\t- ')}\n`;
    out += `\t- Links:\n\t\t- ${credit.urls.join('\n\t\t- ')}\n\n`;
  });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @lpc-toolkit/core test -- credits-format.test.ts
```
Expected: PASS for all three `creditsToTxt` tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/credits-format.ts packages/core/test/credits-format.test.ts
git commit -m "feat(core): add creditsToTxt formatter (upstream byte-identical)"
```

---

## Task 4: creditsToCsv formatter

**Files:**
- Modify: `packages/core/src/credits-format.ts` (add second function)
- Modify: `packages/core/test/credits-format.test.ts` (add tests)

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/credits-format.test.ts` (after the existing `describe('creditsToTxt', ...)` block), referencing the same `SAMPLE` constant:

```ts
import { creditsToCsv } from '../src/credits-format.js';

describe('creditsToCsv', () => {
  it('matches upstream creditsToCsv format byte-for-byte', () => {
    const out = creditsToCsv(SAMPLE, 'walk');
    // Upstream format (utils/credits.ts:creditsToCsv): simple double-quote
    // wrap, no internal escaping, comma-space joined lists.
    const expected =
      'filename,notes,authors,licenses,urls\n' +
      '"body/bodies/male/walk.png","","Alice, Bob","CC-BY-SA 3.0, GPL 3.0","https://example.com/a"\n' +
      '"head/faces/male/blush/walk.png","sample notes","Carol","CC0","https://example.com/b, https://example.com/c"\n';
    expect(out).toBe(expected);
  });

  it('falls back to entry.file + /<anim>.png when resolvedPaths is empty', () => {
    const manifest: CreditsManifest = { ...SAMPLE, resolvedPaths: [] };
    const out = creditsToCsv(manifest, 'walk');
    expect(out).toContain('"body/bodies/male/walk.png"');
    expect(out).toContain('"head/faces/walk.png"');
  });

  it('returns header-only for empty manifest', () => {
    const out = creditsToCsv(
      { entries: [], resolvedPaths: [], licenses: [] },
      'walk',
    );
    expect(out).toBe('filename,notes,authors,licenses,urls\n');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @lpc-toolkit/core test -- credits-format.test.ts
```
Expected: FAIL with `creditsToCsv is not exported`.

- [ ] **Step 3: Implement creditsToCsv**

In `packages/core/src/credits-format.ts`, append after `creditsToTxt`:

```ts
/**
 * Serialize a CreditsManifest to the same CSV layout upstream produces
 * (`upstream/sources/utils/credits.ts:creditsToCsv`). Byte-identical when
 * `manifest.resolvedPaths` is populated. Note: upstream does NOT escape
 * embedded double-quotes — this matches that behaviour exactly so byte
 * equality holds. Author/license/URL strings in upstream data don't
 * contain `"` so the lack of escaping is not a practical problem.
 */
export function creditsToCsv(
  manifest: CreditsManifest,
  anim: string,
): string {
  let out = 'filename,notes,authors,licenses,urls\n';
  manifest.entries.forEach((credit, i) => {
    const fileName = filenameFor(manifest, i, anim);
    const authors = credit.authors.join(', ');
    const licenses = credit.licenses.join(', ');
    const urls = credit.urls.join(', ');
    const notes = credit.notes || '';
    out += `"${fileName}","${notes}","${authors}","${licenses}","${urls}"\n`;
  });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @lpc-toolkit/core test -- credits-format.test.ts
```
Expected: PASS for all 6 tests (3 txt + 3 csv).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/credits-format.ts packages/core/test/credits-format.test.ts
git commit -m "feat(core): add creditsToCsv formatter (upstream byte-identical)"
```

---

## Task 5: Export formatters from core barrel

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add the export line**

In `packages/core/src/index.ts`, after the existing `export { getCredits, computeEffectiveLicense } from './credits.js';` line (around line 65), append:

```ts
export { creditsToTxt, creditsToCsv } from './credits-format.js';
```

- [ ] **Step 2: Typecheck both packages**

```bash
pnpm --filter @lpc-toolkit/core typecheck
pnpm --filter @lpc-toolkit/web typecheck
```
Expected: PASS — web hasn't used the new exports yet but typecheck of core re-exporting verifies they're reachable.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): re-export creditsToTxt/creditsToCsv from index"
```

---

## Task 6: downloadBlob browser helper

**Files:**
- Create: `packages/web/src/lib/download.ts`

- [ ] **Step 1: Write the implementation**

(No vitest test for this one — it's a thin DOM wrapper, exercised via the popover. Adding jsdom for one helper is overkill; manual verification in the harness counts. Mark verified by the integration check in Task 9.)

Create `packages/web/src/lib/download.ts`:

```ts
/**
 * Trigger a browser download by creating an anonymous anchor with a Blob
 * URL. The temporary anchor is appended → clicked → removed in the same
 * task; the URL is revoked on the next microtask so the download has time
 * to start.
 *
 * Kept as a standalone helper (not tied to the popover) so future
 * sub-projects (ZIP exporter etc.) can reuse it.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the browser has actually fetched the blob URL.
  queueMicrotask(() => URL.revokeObjectURL(url));
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/download.ts
git commit -m "feat(web): add downloadBlob browser helper"
```

---

## Task 7: Lift useComposedCharacter from PreviewPane to harness

The `DownloadPopover` needs `result.sheet` and `result.status`. Calling `useComposedCharacter` a second time would double-compose. Move the call up to `LayerStackHarness` and pass `result` into `PreviewPane` via props. This also lets us simplify the `loadingProgress` plumbing (no callback needed).

**Files:**
- Modify: `packages/web/src/components/layer-stack/harness.tsx`
- Modify: `packages/web/src/components/layer-stack/preview-pane.tsx`

- [ ] **Step 1: Update harness.tsx to call the hook**

In `packages/web/src/components/layer-stack/harness.tsx`:

Add the import near the other hook imports at the top:
```ts
import { useComposedCharacter } from '../../hooks/use-composed-character';
import type { ComposeResult } from '../../hooks/use-composed-character';
```
(Verify `ComposeResult` is the exported result type. If it's named differently, e.g. exported only inline, re-export it from the hook file as needed in the same step.)

Inside `LayerStackHarness`, after the existing `useState` calls and before the JSX `return`, insert:
```ts
const composeResult = useComposedCharacter(
  props.catalog,
  props.palettes,
  props.state,
  props.assetSource,
  reloadCounter,
);
```

Replace the existing `loadingProgress` `useState` + `useEffect` plumbing. Remove these lines:
```ts
const [loadingProgress, setLoadingProgress] = useState<number | null>(null);
```
…and replace usages of `loadingProgress` in the JSX with:
```ts
const loadingProgress =
  composeResult.status === 'loading' ? composeResult.progress : null;
```
(Insert before the `return` JSX.)

In the JSX, where `<PreviewPane ... onComposeStatus={...} ... />` is rendered, remove the `onComposeStatus` prop and add `result={composeResult}`:
```tsx
<PreviewPane
  catalog={props.catalog}
  palettes={props.palettes}
  state={props.state}
  dispatch={props.dispatch}
  assetSource={props.assetSource}
  reloadCounter={reloadCounter}
  t={t}
  result={composeResult}
/>
```

- [ ] **Step 2: Update preview-pane.tsx to accept result**

In `packages/web/src/components/layer-stack/preview-pane.tsx`:

Update the `Props` interface — remove `onComposeStatus`, add `result`:
```ts
interface Props {
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  assetSource: AssetSource;
  reloadCounter: number;
  t: Translator;
  result: ComposeResult;
}
```
Add `import type { ComposeResult } from '../../hooks/use-composed-character';` near other imports.

Inside the component, replace the local `useComposedCharacter` call and `onComposeStatus` `useEffect` with just:
```ts
const result = props.result;
```
(Delete the existing `const result = useComposedCharacter(...)` line and the `useEffect(() => { onComposeStatus(...) }, [...])` block.)

The destructure of `{ catalog, palettes, state, dispatch, assetSource, reloadCounter, t, onComposeStatus }` from props must drop `catalog, palettes, assetSource, reloadCounter, onComposeStatus` (now unused) — `catalog`/`palettes`/`assetSource`/`reloadCounter` were only fed into `useComposedCharacter` which has moved out. Keep `state, dispatch, t` plus add `result`.

Final signature looks like:
```tsx
export function PreviewPane({
  state, dispatch, t, result,
}: Props) {
  // ...rest of component, using `result` directly
}
```

- [ ] **Step 3: Verify ComposeResult is exported**

Open `packages/web/src/hooks/use-composed-character.ts`. If `ComposeResult` isn't exported, add `export` to its type declaration. The interface (around line 16–22) should look like:
```ts
export interface ComposeResult {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  // ...
}
```
If the type is named differently in the file (e.g. inline-typed return), introduce/export a named interface in this step.

- [ ] **Step 4: Run typecheck + existing web tests**

```bash
pnpm --filter @lpc-toolkit/web typecheck
pnpm --filter @lpc-toolkit/web test
```
Expected: PASS. No behavioural change yet — just lifting state.

- [ ] **Step 5: Manual smoke check**

Start dev server, confirm preview still renders, animation still plays, loading-progress text in TopBar still appears during initial load and clears when ready.

```bash
pnpm --filter @lpc-toolkit/web dev
```
Open in browser, look at TopBar during initial load (should show progress text), then character should appear.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/layer-stack/harness.tsx packages/web/src/components/layer-stack/preview-pane.tsx packages/web/src/hooks/use-composed-character.ts
git commit -m "refactor(web): lift useComposedCharacter to harness"
```

---

## Task 8: DownloadPopover component

**Files:**
- Create: `packages/web/src/components/layer-stack/popovers/download-popover.tsx`

- [ ] **Step 1: Write the component**

Create `packages/web/src/components/layer-stack/popovers/download-popover.tsx`:

```tsx
import { creditsToTxt, creditsToCsv } from '@lpc-toolkit/core';
import type { ComposedSheet } from '@lpc-toolkit/core';
import { Button } from '../../ui/button';
import { usePopover } from './use-popover';
import { downloadBlob } from '../../../lib/download';
import type { Translator } from '../../../i18n';
import type { ComposeResult } from '../../../hooks/use-composed-character';

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  result: ComposeResult;
  anim: string;
  t: Translator;
  onStatus: (status: { kind: 'info' | 'error'; text: string }) => void;
}

export function DownloadPopover({ open, setOpen, result, anim, t, onStatus }: Props) {
  const { anchorRef, panelRef, pos } = usePopover(open, () => setOpen(false));
  const sheet: ComposedSheet | null = result.sheet;
  const disabled = sheet === null;
  const disabledReason = result.status === 'error' ? t('download.failed') : t('download.loading');

  const handlePng = () => {
    if (!sheet) return;
    // ComposedSheet.canvas is a CanvasLike; the browser adapter produces a real
    // HTMLCanvasElement, so toBlob is available. Cast to access it.
    const canvas = sheet.canvas as unknown as HTMLCanvasElement;
    canvas.toBlob((blob) => {
      if (!blob) {
        onStatus({ kind: 'error', text: t('download.failed') });
        return;
      }
      downloadBlob(blob, 'character-spritesheet.png');
      onStatus({ kind: 'info', text: t('download.done') });
      setOpen(false);
    }, 'image/png');
  };

  const handleTxt = () => {
    if (!sheet) return;
    const txt = creditsToTxt(sheet.credits, anim);
    downloadBlob(new Blob([txt], { type: 'text/plain' }), 'credits.txt');
    onStatus({ kind: 'info', text: t('download.done') });
    setOpen(false);
  };

  const handleCsv = () => {
    if (!sheet) return;
    const csv = creditsToCsv(sheet.credits, anim);
    downloadBlob(new Blob([csv], { type: 'text/csv' }), 'credits.csv');
    onStatus({ kind: 'info', text: t('download.done') });
    setOpen(false);
  };

  return (
    <>
      <Button
        ref={anchorRef}
        size="sm"
        variant={open ? 'primary' : 'default'}
        onClick={() => setOpen(!open)}
        title={disabled ? disabledReason : undefined}
      >
        ⬇ {t('download.title')}
      </Button>
      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
          className="w-64 rounded-md border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
            {t('download.title')}
          </div>
          <div className="flex flex-col gap-1">
            <Button size="sm" variant="primary" disabled={disabled} onClick={handlePng}>
              {t('download.png')}
            </Button>
            <Button size="sm" disabled={disabled} onClick={handleTxt}>
              {t('download.creditsTxt')}
            </Button>
            <Button size="sm" disabled={disabled} onClick={handleCsv}>
              {t('download.creditsCsv')}
            </Button>
          </div>
          {disabled && (
            <div className="mt-2 text-[10px] text-text-mute">{disabledReason}</div>
          )}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @lpc-toolkit/web typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/layer-stack/popovers/download-popover.tsx
git commit -m "feat(web): add DownloadPopover component"
```

---

## Task 9: Wire DownloadPopover into harness TopBar

**Files:**
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

- [ ] **Step 1: Add import**

In `packages/web/src/components/layer-stack/harness.tsx`, near the other popover imports at the top:
```ts
import { DownloadPopover } from './popovers/download-popover';
```

- [ ] **Step 2: Extend popover state union**

Find the line:
```ts
const [popover, setPopover] = useState<null | 'bodyType' | 'token' | 'reset' | 'attribution'>(null);
```
Change to:
```ts
const [popover, setPopover] = useState<null | 'bodyType' | 'token' | 'reset' | 'attribution' | 'download'>(null);
```

- [ ] **Step 3: Mount the popover inside the TopBar children**

In the JSX inside `<TopBar>`, after the existing `<AttributionPopover ... />` block and before `<PaletteTrigger ... />`, insert:
```tsx
<DownloadPopover
  open={popover === 'download'}
  setOpen={(v) => setPopover(v ? 'download' : null)}
  result={composeResult}
  anim={props.state.anim}
  t={props.t}
  onStatus={(s) => setStatus(s)}
/>
```

Note: `setStatus` here takes `{ kind: 'info' | 'warn' | 'error'; text: string }` — DownloadPopover emits `kind: 'info' | 'error'`, which is a strict subset. TypeScript will accept this assignment directly; no widening needed.

- [ ] **Step 4: Typecheck + run all tests**

```bash
pnpm --filter @lpc-toolkit/web typecheck
pnpm test
```
Expected: PASS for both packages.

- [ ] **Step 5: Manual integration check**

Start dev server:
```bash
pnpm --filter @lpc-toolkit/web dev
```

Open browser, verify each:
- TopBar shows `⬇ Download` button between Attribution and Palette
- Before compose finishes: button shows tooltip "Sheet is still composing…", three inner buttons disabled
- After compose finishes: click `⬇ Download` → popover opens with 3 buttons enabled
- Click "Spritesheet (PNG)" → browser downloads `character-spritesheet.png`; status toast "Saved ✓" appears; popover closes
- Click "Credits (TXT)" → downloads `credits.txt`; opens in text editor and matches expected format (filename `body/bodies/.../walk.png`, tab indents, etc.)
- Click "Credits (CSV)" → downloads `credits.csv`; opens in spreadsheet/text editor with correct headers
- Switch to zh-TW locale → button reads `⬇ 下載`, inner labels are zh
- Toggle dark/light → popover renders correctly in both themes
- Open Attribution popover, Token popover, Reset popover — verify none of them broke (regression check)

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/layer-stack/harness.tsx
git commit -m "feat(web): mount DownloadPopover in TopBar"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run full test + typecheck for both packages**

```bash
pnpm --filter @lpc-toolkit/core test
pnpm --filter @lpc-toolkit/core typecheck
pnpm --filter @lpc-toolkit/web test
pnpm --filter @lpc-toolkit/web typecheck
```
Expected: All PASS.

- [ ] **Step 2: Manual cross-check against upstream**

In the dev server, configure a specific outfit (e.g. body=male light, head=Human Male light, eyes=blue, hair=Pigtails). Download Credits (TXT) and Credits (CSV).

Open `https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/` in another tab, configure the same outfit (best effort — items map 1:1 by name), download upstream's TXT and CSV.

Diff the files:
```bash
diff <downloaded credits.txt> <upstream credits.txt>
diff <downloaded credits.csv> <upstream credits.csv>
```
Expected: identical. If any divergence appears that isn't due to a different selection, investigate and fix.

(Acceptable divergences: line order may differ if upstream and v2 iterate selections in different orders. The spec's intent is "same algorithm produces same output for same input"; if iteration order differs, document it but don't gate on it.)

- [ ] **Step 3: No commit needed**

This task only verifies — nothing to commit.

---

## Self-Review Checklist

Before moving to execution, the plan author confirms (you, when finishing this plan):

- [x] **Spec coverage:**
  - F1 PNG download → Task 8 `handlePng`, Task 9 wiring
  - F2 Credits TXT → Task 3 formatter, Task 8 `handleTxt`
  - F3 Credits CSV → Task 4 formatter, Task 8 `handleCsv`
  - i18n keys → Task 1
  - Per-file filtered credits → already in `getCredits`, no change needed
  - Byte-identical TXT/CSV → Tasks 2 (resolvedPaths) + 3 + 4 (formatter + fixture test)
  - Disable when not ready → Task 8 `disabled` prop, Task 9 manual check
  - Status toast on success/fail → Task 8 `onStatus`, Task 9 wiring
- [x] **No placeholders:** every step shows the actual code to write.
- [x] **Type consistency:** `ComposeResult` exported in Task 7 step 3, consumed in Tasks 7/8/9. `CreditsManifest` reshaped in Task 2 with all consumers updated in the same task.
- [x] **TDD where possible:** Tasks 2/3/4 lead with failing test; Tasks 1/5/6/7/8/9 are wiring / UI / refactor where tests aren't the primary verification (manual check + typecheck used instead, justified).
- [x] **Frequent commits:** every task ends in a commit; Task 10 is verification-only with no commit.
