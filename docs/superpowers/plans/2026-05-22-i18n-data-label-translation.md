# Data-Label Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Traditional Chinese, every web-UI picker option — category labels, asset names, body-type values, animation values — displays in Chinese, while the English UI stays pixel-identical.

**Architecture:** Keep the existing UI-string translator `t` untouched. Add a parallel "label translator" `tl` for catalog-derived strings. Finite label sets (category, body type, animation) live as `zh-TW`-only maps in `i18n.ts`; the ~1000+ asset-name dictionary lives in a generated file `i18n-item-names.ts`. Every lookup falls back to the raw English value, so missing entries degrade gracefully and English is provably unchanged. Translation is display-only — selection state, tokens, and catalog keys stay English.

**Tech Stack:** TypeScript (strict), React 18, Vite, Vitest, pnpm workspaces, `tsx` for dev scripts.

**Spec:** `docs/superpowers/specs/2026-05-22-i18n-data-label-translation-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/web/scripts/gen-i18n-data.ts` | **New.** Dev script: reads `upstream/`, (re)generates the asset-name dictionary file, prints the category-label list. Merge-safe: re-running preserves existing translations. |
| `packages/web/src/i18n-item-names.ts` | **New, generated.** `ITEM_NAME_LABELS_ZH: Record<string, string>` — every asset `name` → Traditional Chinese. |
| `packages/web/src/i18n.ts` | **Modified.** Existing `TRANSLATIONS` / `createTranslator` untouched. Adds three `zh-TW` label maps, `LabelTranslator` type, `createLabelTranslator()`. |
| `packages/web/src/App.tsx` | **Modified.** Creates `tl` and passes it to `SliceHarness`. |
| `packages/web/src/components/slice-harness.tsx` | **Modified.** Accepts `tl`; routes 8 display sites + 1 `title` through it; makes advanced search translation-aware. |
| `packages/web/test/i18n.test.ts` | **Modified.** Adds unit tests for the label translator. |

---

## Task 1: Prerequisites — submodule, deps, baseline

No code changes; this task makes the workspace buildable so later tasks can enumerate upstream assets. No commit.

**Files:** none.

- [ ] **Step 1: Install workspace dependencies**

Run: `pnpm install`
Expected: completes without error (git worktrees do not share `node_modules`).

- [ ] **Step 2: Initialize the upstream submodule**

Run: `git submodule update --init`
Expected: `upstream/` is populated. This only checks out the pinned commit — it reads upstream content, never modifies it, so it respects the read-only rule.

- [ ] **Step 3: Verify upstream sheet definitions exist**

Run: `ls upstream/sheet_definitions | head`
Expected: a list of category directories (e.g. `body`, `hair`, `torso`, ...).

- [ ] **Step 4: Build core and confirm the baseline test suite is green**

Run: `pnpm --filter @lpc-toolkit/core build && pnpm --filter @lpc-toolkit/web test`
Expected: core builds; all existing web tests PASS. This is the baseline — every later task must keep it green.

---

## Task 2: Asset-enumeration / dictionary-generation script

Create the dev script that enumerates upstream asset names and category labels and (re)generates `i18n-item-names.ts`. The script is merge-safe so it doubles as the maintenance tool when upstream adds assets.

**Files:**
- Create: `packages/web/scripts/gen-i18n-data.ts`

- [ ] **Step 1: Write the generation script**

Create `packages/web/scripts/gen-i18n-data.ts` with exactly this content:

```ts
/**
 * Enumerates the catalog-derived picker strings that need Traditional
 * Chinese translations, and (re)generates packages/web/src/i18n-item-names.ts.
 *
 * Reads the read-only upstream/ submodule; upstream/ is never written.
 * Re-running is merge-safe: existing translations are preserved and any new
 * asset names are appended with an identity value, so this also serves as a
 * maintenance check when upstream adds assets.
 *
 * Run: pnpm --filter @lpc-toolkit/web exec tsx scripts/gen-i18n-data.ts
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createCatalog,
  type FilePath,
  type ItemDefinition,
} from '@lpc-toolkit/core';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const sheetDefsDir = path.join(repoRoot, 'upstream/sheet_definitions');
const outFile = path.join(here, '../src/i18n-item-names.ts');

if (!existsSync(sheetDefsDir)) {
  console.error('upstream/ not initialized. Run: git submodule update --init');
  process.exit(1);
}

function walkJson(dir: string, base = dir): Record<FilePath, ItemDefinition> {
  const out: Record<FilePath, ItemDefinition> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(out, walkJson(full, base));
    else if (entry.name.endsWith('.json')) {
      const key = path.relative(base, full).split(path.sep).join('/');
      out[key] = JSON.parse(readFileSync(full, 'utf8')) as ItemDefinition;
    }
  }
  return out;
}

const { catalog } = createCatalog(walkJson(sheetDefsDir));

const names = new Set<string>();
const categories = new Set<string>();
for (const item of catalog.byItemId.values()) {
  names.add(item.name);
  categories.add(item.type_name);
  const parts = (item.sourcePath ?? '').split('/').filter(Boolean);
  for (const seg of parts.slice(0, -1)) categories.add(seg);
}

// Preserve translations produced by a previous run.
const existing: Record<string, string> = {};
if (existsSync(outFile)) {
  const mod = await import(pathToFileURL(outFile).href);
  Object.assign(existing, mod.ITEM_NAME_LABELS_ZH ?? {});
}

const sortedNames = [...names].sort((a, b) => a.localeCompare(b, 'en'));
const body = sortedNames
  .map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(existing[n] ?? n)},`)
  .join('\n');

writeFileSync(
  outFile,
  '// AUTO-GENERATED by scripts/gen-i18n-data.ts.\n' +
    '// Values are hand-translated; re-running preserves existing translations.\n' +
    'export const ITEM_NAME_LABELS_ZH: Record<string, string> = {\n' +
    `${body}\n};\n`,
);

const untranslated = sortedNames.filter((n) => (existing[n] ?? n) === n);
console.log(
  `asset names: ${sortedNames.length} (untranslated: ${untranslated.length})`,
);
console.log(`-> wrote ${path.relative(repoRoot, outFile)}`);
console.log(`\n# CATEGORY LABELS (${categories.size}) — translate in i18n.ts:`);
for (const c of [...categories].sort((a, b) => a.localeCompare(b, 'en'))) {
  console.log(c);
}
```

- [ ] **Step 2: Run the script to generate the skeleton dictionary**

Run: `pnpm --filter @lpc-toolkit/web exec tsx scripts/gen-i18n-data.ts`
Expected: prints `asset names: N (untranslated: N)` (first run — every entry untranslated), `-> wrote packages/web/src/i18n-item-names.ts`, then a `# CATEGORY LABELS` list. **Copy the full `# CATEGORY LABELS` list into a scratch note — Task 4 needs it.** `i18n-item-names.ts` now exists with identity values (`"Name": "Name"`).

- [ ] **Step 3: Typecheck the new files**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS (the script and the generated `i18n-item-names.ts` both compile).

- [ ] **Step 4: Commit the script only**

`i18n-item-names.ts` is committed in Task 3 once translated. Commit just the script now.

```bash
git add packages/web/scripts/gen-i18n-data.ts
git commit -m "chore(web): add i18n data-enumeration script"
```

---

## Task 3: Translate the asset-name dictionary

Translate every value in the generated `i18n-item-names.ts` into Traditional Chinese. This is the bulk generative step — ~1000–1500 short noun phrases. Quality is machine-translation-grade per the agreed spec; individual entries can be corrected later.

**Files:**
- Modify: `packages/web/src/i18n-item-names.ts` (generated in Task 2)

- [ ] **Step 1: Translate every dictionary value**

Open `packages/web/src/i18n-item-names.ts`. For every entry, keep the key (English `name`) unchanged and replace the value with its Traditional Chinese translation. Do **not** reformat, reorder, or remove keys — the script owns the file's shape.

The file format is fixed; only values change. Representative transformations:

```ts
// before (identity skeleton)        // after (translated)
"Boots": "Boots",                    "Boots": "靴子",
"Plate armor": "Plate armor",        "Plate armor": "板甲",
"Long hair": "Long hair",            "Long hair": "長髮",
"Bangs": "Bangs",                    "Bangs": "瀏海",
"Pants": "Pants",                    "Pants": "長褲",
"Sandals": "Sandals",                "Sandals": "涼鞋",
"Bandana": "Bandana",                "Bandana": "頭巾",
"Buckler": "Buckler",                "Buckler": "圓盾",
"Wings": "Wings",                    "Wings": "翅膀",
"Glasses": "Glasses",                "Glasses": "眼鏡",
```

Translation rules:
- Translate the visible meaning; keep it concise and natural for a Traditional Chinese UI.
- Preserve descriptive qualifiers in parentheses, e.g. `"Long hair (wavy)"` → `"長髮（波浪）"` (use full-width parentheses).
- For proper nouns or LPC-specific terms with no natural translation, transliterate or keep the English term inside the value.
- Every value must end up different from its key (no entry left in English) unless no sensible translation exists.

- [ ] **Step 2: Re-run the script to confirm full coverage**

Run: `pnpm --filter @lpc-toolkit/web exec tsx scripts/gen-i18n-data.ts`
Expected: `asset names: N (untranslated: 0)` — the merge preserved every translation and nothing is left untranslated. (If `untranslated` is not 0, translate the remaining entries it would still leave as identity and re-run.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit the translated dictionary**

```bash
git add packages/web/src/i18n-item-names.ts
git commit -m "feat(web): add Traditional Chinese asset-name dictionary"
```

---

## Task 4: Label translator and finite label maps

Add the `LabelTranslator` type, the three `zh-TW` label maps, and `createLabelTranslator()` to `i18n.ts`, with unit tests. TDD: write the test first.

**Files:**
- Modify: `packages/web/src/i18n.ts`
- Test: `packages/web/test/i18n.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/web/test/i18n.test.ts`, change the top import block to also import `createLabelTranslator`, and add an import for the dictionary:

```ts
import {
  DEFAULT_LOCALE,
  TRANSLATIONS,
  createLabelTranslator,
  createTranslator,
  type TranslationKey,
} from '../src/i18n';
import { ITEM_NAME_LABELS_ZH } from '../src/i18n-item-names';
```

Then add this `describe` block at the end of the file (before the final closing brace of the file, as a sibling of the existing `describe('i18n', ...)`):

```ts
describe('label translator', () => {
  it('returns raw values for English', () => {
    const en = createLabelTranslator('en');
    expect(en.category('body')).toBe('body');
    expect(en.bodyType('male')).toBe('male');
    expect(en.anim('walk')).toBe('walk');
    expect(en.itemName('Plate armor')).toBe('Plate armor');
  });

  it('translates category, body type and animation labels for Chinese', () => {
    const zh = createLabelTranslator('zh-TW');
    expect(zh.category('body')).toBe('身體');
    expect(zh.category('expression')).toBe('表情');
    expect(zh.bodyType('male')).toBe('男性');
    expect(zh.anim('walk')).toBe('行走');
  });

  it('falls back to the raw value for unknown keys', () => {
    const zh = createLabelTranslator('zh-TW');
    expect(zh.category('__nope__')).toBe('__nope__');
    expect(zh.itemName('__nope__')).toBe('__nope__');
  });

  it('translates a known asset name for Chinese', () => {
    const zh = createLabelTranslator('zh-TW');
    const translated = Object.entries(ITEM_NAME_LABELS_ZH).find(
      ([key, value]) => key !== value,
    );
    expect(translated).toBeDefined();
    const [name, label] = translated!;
    expect(zh.itemName(name)).toBe(label);
  });

  it('has a non-trivial asset-name dictionary', () => {
    expect(Object.keys(ITEM_NAME_LABELS_ZH).length).toBeGreaterThan(100);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @lpc-toolkit/web test -- i18n`
Expected: FAIL — `createLabelTranslator` is not exported from `../src/i18n`.

- [ ] **Step 3: Add the label translator to `i18n.ts`**

In `packages/web/src/i18n.ts`, add this import as the **first line** of the file:

```ts
import { ITEM_NAME_LABELS_ZH } from './i18n-item-names';
```

Then append this block at the **end** of `i18n.ts` (after `createTranslator`):

```ts

// --- Data-label translation (catalog-derived strings) ------------------
// Maps hold zh-TW entries only. Any miss falls back to the raw English
// value, so the English UI is unchanged and a missing zh-TW entry (e.g. an
// asset added upstream after generation) degrades to English, never breaks.

const CATEGORY_LABELS_ZH: Record<string, string> = {
  body: '身體',
  head: '頭部',
  hair: '頭髮',
  expression: '表情',
  eyes: '眼睛',
  torso: '上衣',
  legs: '下身',
  feet: '鞋子',
  // Advanced categories: add one entry per remaining type_name / segment
  // from the gen-i18n-data.ts "CATEGORY LABELS" output (see Step 4).
};

const BODY_TYPE_LABELS_ZH: Record<string, string> = {
  male: '男性',
  female: '女性',
  teen: '青少年',
  child: '兒童',
  muscular: '健壯',
  pregnant: '孕婦',
};

const ANIM_LABELS_ZH: Record<string, string> = {
  spellcast: '施法',
  thrust: '突刺',
  walk: '行走',
  slash: '揮砍',
  shoot: '射擊',
  hurt: '受傷',
  climb: '攀爬',
  idle: '待機',
  jump: '跳躍',
  sit: '坐下',
  emote: '表情動作',
  run: '奔跑',
  watering: '澆水',
  combat: '戰鬥',
  '1h_slash': '單手揮砍',
  '1h_backslash': '單手反手揮砍',
  '1h_halfslash': '單手半揮砍',
};

export interface LabelTranslator {
  /** type_name or advanced-tree path segment, e.g. "body", "weapon". */
  category(value: string): string;
  /** body type value, e.g. "male". */
  bodyType(value: string): string;
  /** animation name, e.g. "walk". */
  anim(value: string): string;
  /** asset display name, e.g. "Plate armor". */
  itemName(value: string): string;
}

/**
 * Translator for catalog-derived strings. English returns every value
 * unchanged; zh-TW looks up the maps with a raw-value fallback.
 */
export function createLabelTranslator(locale: Locale): LabelTranslator {
  if (locale !== 'zh-TW') {
    const raw = (value: string): string => value;
    return { category: raw, bodyType: raw, anim: raw, itemName: raw };
  }
  return {
    category: (value) => CATEGORY_LABELS_ZH[value.toLowerCase()] ?? value,
    bodyType: (value) => BODY_TYPE_LABELS_ZH[value] ?? value,
    anim: (value) => ANIM_LABELS_ZH[value] ?? value,
    itemName: (value) => ITEM_NAME_LABELS_ZH[value] ?? value,
  };
}
```

- [ ] **Step 4: Fill in the advanced category labels**

Using the `# CATEGORY LABELS` list captured in Task 2 Step 2, add a `zh-TW` entry to `CATEGORY_LABELS_ZH` for **every** category not already covered by the 8 common entries. Translate each into Traditional Chinese. Representative transformations:

```ts
weapon: '武器',
shield: '盾牌',
cape: '披風',
wings: '翅膀',
hat: '帽子',
helmet: '頭盔',
ears: '耳朵',
nose: '鼻子',
beard: '鬍子',
shoulders: '護肩',
arms: '護臂',
clothes: '衣物',
```

Anything you genuinely cannot translate may be left out — `category()` falls back to the raw value. Aim for full coverage of the printed list.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @lpc-toolkit/web test -- i18n`
Expected: PASS — all `label translator` tests plus the existing `i18n` tests.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/i18n.ts packages/web/test/i18n.test.ts
git commit -m "feat(web): add label translator for catalog-derived strings"
```

---

## Task 5: Use the label translator at every picker display site

Plumb `tl` from `App` into `SliceHarness` and route all 8 untranslated display sites (plus one `title` attribute) through it. Display-only changes — no logic, state, or token behavior changes.

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/components/slice-harness.tsx`

- [ ] **Step 1: Create and pass `tl` in `App.tsx`**

In `packages/web/src/App.tsx`, change the i18n import to add `createLabelTranslator`:

```ts
import {
  DEFAULT_LOCALE,
  createLabelTranslator,
  createTranslator,
  type Locale,
} from './i18n';
```

Add the `tl` memo immediately after the existing `t` memo:

```ts
  const t = useMemo(() => createTranslator(locale), [locale]);
  const tl = useMemo(() => createLabelTranslator(locale), [locale]);
```

Pass it to `SliceHarness` — add `tl={tl}` next to the existing `t={t}` prop:

```tsx
      t={t}
      tl={tl}
```

- [ ] **Step 2: Accept the `tl` prop in `SliceHarness`**

In `packages/web/src/components/slice-harness.tsx`, change the i18n type import to add `LabelTranslator`:

```ts
import type { Locale, TranslationKey, Translator, LabelTranslator } from '../i18n';
```

Add `tl` to the destructured parameter list (next to `t,`):

```ts
  locale,
  assetSource,
  t,
  tl,
  onAssetSourceChange,
```

Add `tl` to the props type object (next to `t: Translator;`):

```ts
  t: Translator;
  tl: LabelTranslator;
```

- [ ] **Step 3: Route the body-type dropdown through `tl`**

In the body-type `<select>`, change the option label:

```tsx
              {BODY_TYPES.map((bt) => (
                <option key={bt} value={bt}>
                  {tl.bodyType(bt)}
                </option>
              ))}
```

- [ ] **Step 4: Route the common-section header through `tl`**

In the common section, the per-type label:

```tsx
                <label key={tn} className="block text-xs">
                  <span className="text-text-mute uppercase">
                    {tl.category(tn)}
                  </span>
```

- [ ] **Step 5: Route the common-section asset options through `tl`**

In the common section `<select>` options, change the displayed name (keep the license suffix logic unchanged):

```tsx
                    {shownItems.map((it) => (
                      <option key={it.name} value={it.name}>
                        {tl.itemName(it.name)}
                        {licenseFilter &&
                        selectedName === it.name &&
                        !itemMatchesLicenseFilter(it, licenseFilter)
                          ? ` (${t('picker.current')})`
                          : ''}
                      </option>
                    ))}
```

- [ ] **Step 6: Route the animation dropdown through `tl`**

In the animation `<select>` (center panel):

```tsx
              {animNames.map((a) => (
                <option key={a} value={a}>
                  {tl.anim(a)}
                </option>
              ))}
```

- [ ] **Step 7: Route the advanced-tree folder header through `tl`**

In `renderTreeNode`, the `<summary>` content:

```tsx
            <summary className="cursor-pointer py-1 text-xs font-semibold text-text-mute hover:text-text">
              {tl.category(node.name)}
            </summary>
```

- [ ] **Step 8: Route the advanced-tree item name, type badge, and title through `tl`**

In `renderTreeNode`, the `showHeader` branch item button — change the `title` and both `<span>`s:

```tsx
                    title={
                      !compatible
                        ? t('picker.incompatibleBodyType')
                        : tl.category(item.typeName)
                    }
```

```tsx
                    <span>{tl.itemName(item.name)}</span>
                    <span className="ml-1 text-[10px] text-text-dim">
                      {tl.category(item.typeName)}
                    </span>
```

And in the `!showHeader` (root) branch item button:

```tsx
                onClick={() => pickTreeItem(item)}
              >
                {tl.itemName(item.name)}
              </button>
```

- [ ] **Step 9: Typecheck and run tests**

Run: `pnpm --filter @lpc-toolkit/web typecheck && pnpm --filter @lpc-toolkit/web test`
Expected: both PASS. `TranslationKey` is still imported and used; no unused-import errors.

- [ ] **Step 10: Manual verification in the browser**

Run: `pnpm --filter @lpc-toolkit/web dev`, open the local URL.
- Default (English): the picker looks exactly as before.
- Click the language toggle → 中文. Verify: common-section headers show `身體 / 頭部 / 頭髮 / 表情 / 眼睛 / 上衣 / 下身 / 鞋子`; body-type dropdown shows `男性` etc.; animation dropdown shows `行走` etc.; common dropdown asset names are Chinese; the advanced tree's folder headers, asset names, and type badges are Chinese.
- Toggle back to English → everything reverts to English.

- [ ] **Step 11: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/components/slice-harness.tsx
git commit -m "feat(web): translate picker options via label translator"
```

---

## Task 6: Translation-aware advanced search

Make the advanced-section search match Chinese queries against the translated labels, so a Chinese user can search with the text they actually see.

**Files:**
- Modify: `packages/web/src/components/slice-harness.tsx`

- [ ] **Step 1: Update `treeItemMatches`**

In `packages/web/src/components/slice-harness.tsx`, change the `treeItemMatches` function's return statement to also match the translated label and category. `tl` is already in scope via the component closure — no signature change:

```ts
  function treeItemMatches(item: CatalogTreeItem, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (q === '') return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.typeName.toLowerCase().includes(q) ||
      tl.itemName(item.name).toLowerCase().includes(q) ||
      tl.category(item.typeName).toLowerCase().includes(q)
    );
  }
```

- [ ] **Step 2: Typecheck and run tests**

Run: `pnpm --filter @lpc-toolkit/web typecheck && pnpm --filter @lpc-toolkit/web test`
Expected: both PASS.

- [ ] **Step 3: Manual verification**

In `pnpm --filter @lpc-toolkit/web dev` with locale set to 中文: type a Chinese term into the advanced "搜尋所有素材" box (e.g. a category word like `武器` or a translated asset name) and confirm matching items appear. Confirm an English query still matches too.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/slice-harness.tsx
git commit -m "feat(web): make advanced search match translated labels"
```

---

## Task 7: Final verification

Confirm the whole feature builds, typechecks, and tests clean.

**Files:** none.

- [ ] **Step 1: Full typecheck**

Run: `pnpm -r typecheck`
Expected: PASS for every package.

- [ ] **Step 2: Full test suite**

Run: `pnpm -r test`
Expected: PASS, including the new `label translator` tests.

- [ ] **Step 3: Production build**

Run: `pnpm --filter @lpc-toolkit/web build`
Expected: build succeeds.

- [ ] **Step 4: Final manual checklist**

In `pnpm --filter @lpc-toolkit/web dev`:
- English UI is pixel-identical to before the change.
- Switching to 中文 translates every common and advanced category label, asset name, body-type value, and animation value.
- Advanced search matches Chinese and English queries.
- Pick items, copy the selection token, switch language, paste/apply the token — the selection round-trips correctly (translation did not touch token data).

---

## Self-Review

**Spec coverage:**
- Category / type labels (common headers, advanced folder headers, type badges, incompatible `title`) → Task 5 Steps 4, 7, 8.
- Asset names (common dropdowns + advanced tree) → Task 5 Steps 5, 8; dictionary in Tasks 2–3.
- Body-type values → Task 5 Step 3; map in Task 4.
- Animation values → Task 5 Step 6; map in Task 4.
- Translation-aware advanced search → Task 6.
- English-unchanged + raw-value fallback → Task 4 `createLabelTranslator` (`locale !== 'zh-TW'` branch + `?? value`); tested in Task 4 Step 1.
- Translation is display-only (state/token untouched) → no task modifies `selection.ts` or token code; verified in Task 7 Step 4.
- Out of scope (license codes, status text, sort order) → correctly untouched; no task addresses them.

**Placeholder scan:** No "TBD"/"TODO". The two generative steps (Task 3 asset-name translation, Task 4 Step 4 advanced categories) are inherent data-translation work; each gives an exact procedure, file format, concrete example transformations, and an objective completion check (`untranslated: 0` / typecheck). No code step omits its code.

**Type consistency:** `LabelTranslator` (methods `category`, `bodyType`, `anim`, `itemName`) is defined in Task 4 and used identically in Tasks 5–6. `createLabelTranslator(locale: Locale)` signature matches its use in `App.tsx`. `ITEM_NAME_LABELS_ZH` export name is consistent across the generator (Task 2), the dictionary file, `i18n.ts` import (Task 4), and the test import.

---

## Execution

After each task: review the diff, confirm the stated expected output, then move to the next task. Tasks 1→7 are strictly ordered (each depends on the previous).
