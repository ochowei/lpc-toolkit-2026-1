# Layer Selection i18n and Color Safety Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Localize selection options, swap headers, and color picker variant/recolor choices in the layer list stack, backed by a Vitest CI safety guard that validates translation coverage of all assets.

**Architecture:** We add a static translation map `COLOR_LABELS_ZH` in `packages/web/src/i18n.ts`, extending the `LabelTranslator` interface with a `color` method. We update components (`LayerRow`, `ColorPicker`) to pass and use this translator, and write a test in `packages/web/test/i18n.test.ts` to scan catalogs and prevent untranslated color regressions.

**Tech Stack:** React 18, Vite, Vitest, TypeScript, Node.js FS APIs (test-only).

---

### Task 1: Extend i18n Translation Dictionary and Interface

**Files:**
- Modify: `packages/web/src/i18n.ts`
- Test: `packages/web/test/i18n.test.ts`

- [ ] **Step 1.1: Add test assertions for `layer.swap` and new `color` translator method**

Update `packages/web/test/i18n.test.ts` by appending assertions for the `layer.swap` key and checking that `createLabelTranslator` implements `color` correctly (translating simple colors, prefixed colors, and falling back to humanized English).

Lines to insert in `packages/web/test/i18n.test.ts`:
```typescript
// inside describe('i18n') / translates representative labels
expect(en('layer.swap')).toBe('Swap {name}');
expect(zh('layer.swap')).toBe('更換{name}');

// inside describe('label translator')
it('translates colors and falls back to humanized value', () => {
  const zh = createLabelTranslator('zh-TW');
  const en = createLabelTranslator('en');

  // English returns humanized
  expect(en.color('lpcr.brown')).toBe('Brown');
  expect(en.color('brown')).toBe('Brown');

  // Chinese translates known keys
  expect(zh.color('lpcr.brown')).toBe('棕色');
  expect(zh.color('brown')).toBe('棕色');
  expect(zh.color('ivory')).toBe('象牙色');
  expect(zh.color('fur_black')).toBe('黑色毛皮');

  // Chinese falls back to humanized for unknown
  expect(zh.color('lpcr.neon_purple')).toBe('Neon purple');
  expect(zh.color('neon_purple')).toBe('Neon purple');
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `pnpm --filter @lpc-toolkit/web test -- test/i18n.test.ts`
Expected: FAIL with "layer.swap not defined" or similar type errors.

- [ ] **Step 1.3: Implement `layer.swap`, `COLOR_LABELS_ZH` map, and `color` method**

Modify [packages/web/src/i18n.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/i18n.ts):
1. Add `'layer.swap': 'Swap {name}',` under `'preset.skipPreview'` in `TRANSLATIONS.en`.
2. Add `'layer.swap': '更換{name}',` under `'preset.skipPreview'` in `TRANSLATIONS['zh-TW']`.
3. Add helper function `humanize` (if not already exported, or duplicate/move/import it. Note that `humanize` in `color-options.ts` is currently internal, so define a local helper `humanize` in `i18n.ts`):
   ```typescript
   function humanize(raw: string): string {
     const tail = raw.includes('.') ? raw.slice(raw.lastIndexOf('.') + 1) : raw;
     const spaced = tail.replace(/_/g, ' ');
     return spaced.charAt(0).toUpperCase() + spaced.slice(1);
   }
   ```
4. Define the `COLOR_LABELS_ZH` mapping of all LPC standard colors:
   ```typescript
   const COLOR_LABELS_ZH: Record<string, string> = {
     // Body/Skin
     ivory: '象牙色',
     porcelain: '瓷白色',
     peach: '桃色',
     tawny: '茶褐色',
     honey: '蜜黃色',
     light: '淺膚色',
     amber: '琥珀色',
     olive: '橄欖色',
     taupe: '灰褐色',
     pale_green: '蒼綠色',
     bright_green: '亮綠色',
     dark_green: '深綠色',
     zombie: '殭屍膚色',
     zombie_green: '綠色殭屍膚色',

     // Hair
     ash_brown: '亞麻棕',
     blonde: '金色',
     chestnut: '板栗色',
     platinum: '白金色',
     raven: '烏黑色',
     ruby: '紅寶石色',
     silver: '銀色',
     violet: '紫羅蘭色',
     ash: '灰亞麻色',
     sandy: '沙金色',
     strawberry: '草莓金色',
     gold: '金黃色',
     ginger: '薑黃色',
     carrot: '胡蘿蔔橘色',
     redhead: '紅髮',
     light_brown: '淺棕色',
     dark_brown: '深棕色',
     dark_gray: '深灰色',

     // Fur
     fur_black: '黑色毛皮',
     fur_brown: '棕色毛皮',
     fur_copper: '紅銅毛皮',
     fur_gold: '金色毛皮',
     fur_grey: '灰色毛皮',
     fur_tan: '黃褐毛皮',
     fur_white: '白色毛皮',

     // Metal & Ceramic
     brass: '黃銅色',
     copper: '紅銅色',
     iron: '鐵灰色',
     steel: '鋼灰色',
     ceramic: '陶瓷色',
     bronze: '青銅色',

     // Eyes
     hazel: '淡褐色',

     // Clothing / Accent Colors
     brown: '棕色',
     leather: '皮革色',
     walnut: '胡桃木色',
     yellow: '黃色',
     tan: '黃褐色',
     orange: '橘色',
     rose: '玫瑰色',
     maroon: '栗色',
     red: '紅色',
     pink: '粉紅色',
     lavender: '薰衣草紫',
     purple: '紫色',
     blue: '藍色',
     navy: '海軍藍',
     teal: '藍綠色',
     bluegray: '藍灰色',
     forest: '森林綠',
     green: '綠色',
     white: '白色',
     sky: '天藍色',
     slate: '石板灰',
     gray: '灰色',
     black: '黑色',
     charcoal: '炭灰色',
     base: '基礎色',
   };
   ```
5. Update the `LabelTranslator` interface and both translator builder paths:
   ```typescript
   export interface LabelTranslator {
     category(value: string): string;
     bodyType(value: string): string;
     anim(value: string): string;
     itemName(value: string): string;
     color(value: string): string; // <-- New
   }

   export function createLabelTranslator(locale: Locale): LabelTranslator {
     if (locale !== 'zh-TW') {
       const raw = (value: string): string => value;
       return {
         category: raw,
         bodyType: raw,
         anim: raw,
         itemName: raw,
         color: (value) => humanize(value),
       };
     }
     return {
       category: (value) => CATEGORY_LABELS_ZH[value.toLowerCase()] ?? value,
       bodyType: (value) => BODY_TYPE_LABELS_ZH[value] ?? value,
       anim: (value) => ANIM_LABELS_ZH[value] ?? value,
       itemName: (value) => ITEM_NAME_LABELS_ZH[value] ?? value,
       color: (value) => {
         const key = value.toLowerCase();
         const tail = key.includes('.') ? key.slice(key.lastIndexOf('.') + 1) : key;
         return COLOR_LABELS_ZH[key] ?? COLOR_LABELS_ZH[tail] ?? humanize(value);
       },
     };
   }
   ```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `pnpm --filter @lpc-toolkit/web test -- test/i18n.test.ts`
Expected: PASS

- [ ] **Step 1.5: Commit**

```bash
git add packages/web/src/i18n.ts packages/web/test/i18n.test.ts
git commit -m "feat: extend translator interface with color support"
```

---

### Task 2: Implement Component Layer Stack Localizations

**Files:**
- Modify: `packages/web/src/components/layer-stack/layer-row.tsx`
- Modify: `packages/web/src/components/color-picker.tsx`

- [ ] **Step 2.1: Localize LayerRow metadata and swap headers**

In [layer-row.tsx](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/components/layer-stack/layer-row.tsx):
1. In the layer details subheader (line 69), change `<span>{selection.variant}</span>` to `<span>{tl.color(selection.variant)}</span>`.
2. In the body part options header (line 129), replace the hardcoded `Swap {typeName}` with:
   ```tsx
   {t('layer.swap').replace('{name}', tl.category(typeName))}
   ```
3. In the option button rendering loop:
   - For `title` tooltip (line 150): replace `'incompatible body type'` with `t('picker.incompatibleBodyType')`.
   - For option `title` (line 152): replace `it.name` with `tl.itemName(it.name)`.
   - For option text label (line 170): replace `{it.name}` with `{tl.itemName(it.name)}`.
4. In the `<ColorPicker>` instantiation (line 180):
   - Pass the translator prop: `tl={tl}`.
   - Replace the label `'Style'` with:
     ```tsx
     colorLabel={t('picker.color')}
     ```

- [ ] **Step 2.2: Add translation support to ColorPicker component**

In [color-picker.tsx](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/components/color-picker.tsx):
1. Update component signature to accept `tl`:
   ```typescript
   export function ColorPicker({
     item,
     selection,
     palettes,
     colorLabel,
     onSelect,
     tl, // <-- New
     disabled = false,
   }: {
     item: ItemDefinition;
     selection: Selection | undefined;
     palettes: PaletteMetadata;
     colorLabel: string;
     onSelect: (change: { variant: string } | { recolor: string }) => void;
     tl: LabelTranslator; // <-- New
     disabled?: boolean;
   }) {
   ```
2. Under recolors swatch rendering buttons, translate `title` and `aria-label`:
   - Change `title={opt.label}` to `title={tl.color(opt.value)}`.
   - Change `aria-label={opt.label}` to `aria-label={tl.color(opt.value)}`.
3. Under variants chip rendering buttons (line 70), translate button text:
   - Change `{opt.label}` to `{tl.color(opt.value)}`.

- [ ] **Step 2.3: Verify no compilation errors**

Run: `pnpm --filter @lpc-toolkit/web run build`
Expected: Build passes with no TypeScript errors.

- [ ] **Step 2.4: Commit**

```bash
git add packages/web/src/components/layer-stack/layer-row.tsx packages/web/src/components/color-picker.tsx
git commit -m "feat: localize layer stack options, color swatches and swap headers"
```

---

### Task 3: Add Catalog-Level i18n Validation safety Guard Test

**Files:**
- Modify: `packages/web/test/i18n.test.ts`

- [ ] **Step 3.1: Add the scanning safety guard test**

Add a new test suite inside `packages/web/test/i18n.test.ts` that dynamically scans the sheet and palette definitions, collects color keys, and checks their translation coverage.

Lines to append to `packages/web/test/i18n.test.ts`:
```typescript
import fs from 'node:fs';
import path from 'node:path';

describe('i18n translation coverage safety guard', () => {
  it('covers all variant and recolor names in actual assets', () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const paletteDefsDir = path.join(repoRoot, 'assets/palette_definitions');
    const sheetDefsDir = path.join(repoRoot, 'assets/sheet_definitions');

    const missingKeys = new Set<string>();
    const tl = createLabelTranslator('zh-TW');

    // Helper to verify a raw value has a translation in Chinese
    const verifyTranslation = (raw: string) => {
      const result = tl.color(raw);
      // If the translator output is identical to the humanized English output,
      // and the value is not "base" (where 'Base' is acceptable, but let's assert strictly),
      // we check if it is missing.
      // A more robust check: does tl.color(raw) equal humanize(raw)?
      // If it equals humanize(raw) and humanize(raw) is NOT in COLOR_LABELS_ZH or custom exceptions:
      const human = raw.includes('.') ? raw.slice(raw.lastIndexOf('.') + 1) : raw;
      const normalized = human.replace(/_/g, ' ').toLowerCase();
      // Check if this normalized value translates back to English default
      // (which is character-capitalized and same as humanized English)
      const expectedEn = normalized.charAt(0).toUpperCase() + normalized.slice(1);
      if (result === expectedEn) {
        // Double check if this is an expected untranslated value
        // "base" is translated to "基礎色", so it should not match.
        // If it equals expectedEn, it was not matched in the dictionary.
        missingKeys.add(raw);
      }
    };

    // 1. Scan palette JSON files
    if (fs.existsSync(paletteDefsDir)) {
      const scanDir = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.name.endsWith('.json') && !entry.name.startsWith('meta_')) {
            const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            for (const key of Object.keys(content)) {
              verifyTranslation(key);
            }
          }
        }
      };
      scanDir(paletteDefsDir);
    }

    // 2. Scan sheet definitions JSON files for variants
    if (fs.existsSync(sheetDefsDir)) {
      const scanDir = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.name.endsWith('.json') && !entry.name.startsWith('meta_')) {
            const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            if (content && Array.isArray(content.variants)) {
              for (const variant of content.variants) {
                verifyTranslation(variant);
              }
            }
          }
        }
      };
      scanDir(sheetDefsDir);
    }

    if (missingKeys.size > 0) {
      const list = [...missingKeys].sort().join(', ');
      expect.fail(`Missing Chinese color translations in COLOR_LABELS_ZH: [${list}]`);
    }
  });
});
```

- [ ] **Step 3.2: Run test to verify it passes**

Run: `pnpm --filter @lpc-toolkit/web test -- test/i18n.test.ts`
Expected: PASS (if all verified keys are correctly mapped. If any keys are reported missing, we will add them to `COLOR_LABELS_ZH` in `packages/web/src/i18n.ts` until the test passes).

- [ ] **Step 3.3: Commit**

```bash
git add packages/web/test/i18n.test.ts
git commit -m "test: add dynamic color translation coverage safety guard test"
```
