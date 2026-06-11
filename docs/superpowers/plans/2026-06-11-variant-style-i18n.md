# Variant Style Labels and Tools Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distinguish asset variants from palette colors in the layer UI, translate Tools item/variant names, and preserve raw catalog selection values.

**Architecture:** Extend the existing web `LabelTranslator` with a variant-specific translation path while leaving `color()` unchanged. `ColorPicker` will use the existing `ColorOptions.mode` discriminator to choose both its localized heading and its option translator; `LayerRow` will use the same variant translator for the collapsed summary.

**Tech Stack:** TypeScript strict mode, React 18, Vitest, `react-dom/server`, pnpm workspaces

---

## File Structure

- Modify `packages/web/src/i18n.ts`
  - Add `picker.style`, the Tools variant dictionary, and `LabelTranslator.variant()`.
- Modify `packages/web/src/i18n-item-names.ts`
  - Correct the four Tools item-name translations.
- Modify `packages/web/src/components/color-picker.tsx`
  - Select "Color" versus "Style" and `color()` versus `variant()` from `ColorOptions.mode`.
- Modify `packages/web/src/components/layer-stack/layer-row.tsx`
  - Pass both picker labels and translate the selected variant through `variant()`.
- Modify `packages/web/test/i18n.test.ts`
  - Cover the new static key, Tools item names, variant dictionary, fallback, and safety-guard mapping.
- Create `packages/web/test/color-picker.test.tsx`
  - Verify variant and recolor rendering without adding a browser test dependency.
- Create `packages/web/test/layer-row.test.tsx`
  - Verify the collapsed layer summary uses the variant translator.

### Task 1: Add Variant-Specific Translation Data

**Files:**
- Modify: `packages/web/test/i18n.test.ts:30-161`
- Modify: `packages/web/src/i18n.ts:4-856`
- Modify: `packages/web/src/i18n-item-names.ts:472,554,592,633`

- [ ] **Step 1: Write failing translation tests**

Add `picker.style` assertions to the representative-label test:

```ts
expect(en('picker.style')).toBe('Style');
expect(zh('picker.style')).toBe('款式');
```

Extend the English label-translator test:

```ts
expect(en.variant('pickaxe')).toBe('Pickaxe');
expect(en.variant('longsword_alt')).toBe('Longsword alt');
```

Add focused Traditional Chinese variant and Tools item-name tests:

```ts
it('translates Tools variants for Chinese', () => {
  const zh = createLabelTranslator('zh-TW');

  expect(zh.variant('axe')).toBe('斧頭');
  expect(zh.variant('hammer')).toBe('鐵鎚');
  expect(zh.variant('pickaxe')).toBe('十字鎬');
  expect(zh.variant('hoe')).toBe('鋤頭');
  expect(zh.variant('shovel')).toBe('鏟子');
  expect(zh.variant('watering')).toBe('澆水壺');
  expect(zh.variant('rod')).toBe('釣竿');
  expect(zh.variant('whip')).toBe('鞭子');
});

it('humanizes unknown variants without treating them as colors', () => {
  const zh = createLabelTranslator('zh-TW');

  expect(zh.variant('longsword_alt')).toBe('Longsword alt');
  expect(zh.color('red')).toBe('紅色');
});

it('translates the four Tools item names for Chinese', () => {
  const zh = createLabelTranslator('zh-TW');

  expect(zh.itemName('Rod')).toBe('釣竿');
  expect(zh.itemName('Smash')).toBe('敲擊工具');
  expect(zh.itemName('Thrust')).toBe('推刺工具');
  expect(zh.itemName('Whip')).toBe('鞭子');
});
```

In the catalog safety guard, import `VARIANT_LABELS_ZH`, check color and
variant sets against their own dictionaries, and remove the eight Tools keys
from `legitimatelyUnmapped`:

```ts
import {
  COLOR_LABELS_ZH,
  DEFAULT_LOCALE,
  TRANSLATIONS,
  VARIANT_LABELS_ZH,
  createLabelTranslator,
  createTranslator,
  type TranslationKey,
} from '../src/i18n';
```

Replace the combined mapping loop with:

```ts
const missingColors = [...colorKeys].filter((key) => !isMappedColor(key));
const missingVariants = [...variantKeys].filter(
  (key) =>
    !legitimatelyUnmapped.has(key) &&
    VARIANT_LABELS_ZH[key.toLowerCase()] === undefined,
);
const missing = [
  ...missingColors.map((key) => `color: ${key}`),
  ...missingVariants.map((key) => `variant: ${key}`),
];
```

Keep the existing full-key and suffix lookup logic in `isMappedColor()`.

- [ ] **Step 2: Run the translation tests and verify failure**

Run:

```sh
pnpm --filter @lpc-toolkit/web exec vitest run test/i18n.test.ts
```

Expected: FAIL because `picker.style`, `variant()`, `VARIANT_LABELS_ZH`, and
the corrected Tools names do not exist yet.

- [ ] **Step 3: Add the static UI key and variant translator**

In both locale maps in `packages/web/src/i18n.ts`, add:

```ts
// en
'picker.style': 'Style',

// zh-TW
'picker.style': '款式',
```

Add a dedicated exported dictionary near `COLOR_LABELS_ZH`:

```ts
export const VARIANT_LABELS_ZH: Readonly<Record<string, string>> = {
  axe: '斧頭',
  hammer: '鐵鎚',
  pickaxe: '十字鎬',
  hoe: '鋤頭',
  shovel: '鏟子',
  watering: '澆水壺',
  rod: '釣竿',
  whip: '鞭子',
};
```

Rename `humanizeColor` to the value-neutral `humanizeLabel` and update its
existing callers:

```ts
function humanizeLabel(raw: string): string {
  const tail = raw.includes('.') ? raw.slice(raw.lastIndexOf('.') + 1) : raw;
  const spaced = tail.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
```

Extend `LabelTranslator`:

```ts
/** asset variant key, e.g. "axe", "longsword_alt". */
variant(value: string): string;
```

Add the English implementation:

```ts
variant: humanizeLabel,
color: humanizeLabel,
```

Add the Traditional Chinese implementation:

```ts
variant: (value) =>
  VARIANT_LABELS_ZH[value.toLowerCase()] ?? humanizeLabel(value),
```

Keep the existing color lookup behavior and change only its fallback:

```ts
return humanizeLabel(value);
```

- [ ] **Step 4: Correct the Tools item-name dictionary**

In `packages/web/src/i18n-item-names.ts`, replace only these values:

```ts
"Rod": "釣竿",
"Smash": "敲擊工具",
"Thrust": "推刺工具",
"Whip": "鞭子",
```

- [ ] **Step 5: Run the translation tests and verify success**

Run:

```sh
pnpm --filter @lpc-toolkit/web exec vitest run test/i18n.test.ts
```

Expected: PASS, including the catalog safety guard. Existing color assertions
must remain unchanged and pass.

- [ ] **Step 6: Commit the translation API and data**

```sh
git add packages/web/src/i18n.ts packages/web/src/i18n-item-names.ts packages/web/test/i18n.test.ts
git commit -m "feat(web): translate asset variants separately"
```

### Task 2: Render Variant Options as Styles

**Files:**
- Create: `packages/web/test/color-picker.test.tsx`
- Modify: `packages/web/src/components/color-picker.tsx:17-79`
- Modify: `packages/web/src/components/layer-stack/layer-row.tsx:179-194`

- [ ] **Step 1: Write failing static-render tests**

Create `packages/web/test/color-picker.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createPaletteCatalog,
  type ItemDefinition,
} from '@lpc-toolkit/core';
import { describe, expect, it, vi } from 'vitest';
import { ColorPicker } from '../src/components/color-picker';
import { createLabelTranslator } from '../src/i18n';

const palettes = createPaletteCatalog({
  'cloth/meta_cloth.json': {
    type: 'material',
    default: 'v1',
    base: 'red',
  },
  'cloth/cloth_v1.json': {
    red: ['#ff0000', '#cc0000'],
  },
}).palettes;

const variantItem: ItemDefinition = {
  name: 'Smash',
  type_name: 'weapon',
  animations: ['walk', 'slash_128'],
  credits: [],
  variants: ['axe', 'hammer', 'pickaxe'],
  layer_1: { zPos: 140, male: 'tools/smash/universal/male/' },
};

const recolorItem: ItemDefinition = {
  name: 'Cloth',
  type_name: 'clothes',
  animations: ['walk'],
  credits: [],
  recolors: { material: 'cloth', palettes: ['v1'] },
  layer_1: { zPos: 50, male: 'clothes/cloth/' },
};

describe('ColorPicker', () => {
  it('renders variants as localized styles', () => {
    const html = renderToStaticMarkup(
      <ColorPicker
        item={variantItem}
        selection={{
          typeName: 'weapon',
          name: 'Smash',
          variant: 'axe',
        }}
        palettes={palettes}
        colorLabel="顏色"
        styleLabel="款式"
        tl={createLabelTranslator('zh-TW')}
        onSelect={vi.fn()}
      />,
    );

    expect(html).toContain('款式');
    expect(html).toContain('斧頭');
    expect(html).toContain('鐵鎚');
    expect(html).toContain('十字鎬');
    expect(html).not.toContain('>顏色<');
  });

  it('keeps recolors under the localized color label', () => {
    const html = renderToStaticMarkup(
      <ColorPicker
        item={recolorItem}
        selection={{
          typeName: 'clothes',
          name: 'Cloth',
          recolor: 'red',
        }}
        palettes={palettes}
        colorLabel="顏色"
        styleLabel="款式"
        tl={createLabelTranslator('zh-TW')}
        onSelect={vi.fn()}
      />,
    );

    expect(html).toContain('顏色');
    expect(html).toContain('aria-label="紅色"');
    expect(html).not.toContain('>款式<');
  });
});
```

- [ ] **Step 2: Run the picker test and verify failure**

Run:

```sh
pnpm --filter @lpc-toolkit/web exec vitest run test/color-picker.test.tsx
```

Expected: FAIL because `ColorPicker` has no `styleLabel` prop and variants
still render with the color label and `tl.color()`.

- [ ] **Step 3: Make `ColorPicker` mode-aware**

Update the props in `packages/web/src/components/color-picker.tsx`:

```ts
export function ColorPicker({
  item,
  selection,
  palettes,
  colorLabel,
  styleLabel,
  onSelect,
  tl,
  disabled = false,
}: {
  item: ItemDefinition;
  selection: Selection | undefined;
  palettes: PaletteMetadata;
  colorLabel: string;
  styleLabel: string;
  onSelect: (change: { variant: string } | { recolor: string }) => void;
  tl: LabelTranslator;
  disabled?: boolean;
}) {
```

Select the heading from the existing discriminator:

```tsx
<span className="text-text-mute uppercase">
  {colors.mode === 'recolors' ? colorLabel : styleLabel}
</span>
```

Change only the variant chip label:

```tsx
{tl.variant(opt.value)}
```

Keep recolor titles and `aria-label` values on `tl.color(opt.value)`.

- [ ] **Step 4: Pass the localized style label from `LayerRow`**

Update the existing `ColorPicker` call:

```tsx
<ColorPicker
  disabled={disabled}
  item={item}
  selection={selection}
  palettes={palettes}
  colorLabel={t('picker.color')}
  styleLabel={t('picker.style')}
  tl={tl}
  onSelect={(change) => {
    if ('variant' in change) {
      dispatch({
        type: 'pick',
        typeName,
        name: item.name,
        variant: change.variant,
      });
    } else {
      dispatch({
        type: 'pick',
        typeName,
        name: item.name,
        recolor: change.recolor,
      });
    }
  }}
/>
```

- [ ] **Step 5: Run picker and type checks**

Run:

```sh
pnpm --filter @lpc-toolkit/web exec vitest run test/color-picker.test.tsx
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: both commands PASS.

- [ ] **Step 6: Commit the mode-aware picker**

```sh
git add packages/web/src/components/color-picker.tsx packages/web/src/components/layer-stack/layer-row.tsx packages/web/test/color-picker.test.tsx
git commit -m "fix(web): label asset variants as styles"
```

### Task 3: Use Variant Translation in the Layer Summary

**Files:**
- Create: `packages/web/test/layer-row.test.tsx`
- Modify: `packages/web/src/components/layer-stack/layer-row.tsx:64-71`

- [ ] **Step 1: Write a failing collapsed-summary test**

Create `packages/web/test/layer-row.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createCatalog,
  createPaletteCatalog,
  type ItemDefinition,
} from '@lpc-toolkit/core';
import { describe, expect, it, vi } from 'vitest';
import { LayerRow } from '../src/components/layer-stack/layer-row';
import { createLabelTranslator, createTranslator } from '../src/i18n';
import { ALL_LICENSE_GROUPS } from '../src/slice/license-filter';

const smash: ItemDefinition = {
  name: 'Smash',
  type_name: 'weapon',
  animations: ['walk', 'slash_128'],
  credits: [],
  variants: ['axe', 'hammer', 'pickaxe'],
  layer_1: { zPos: 140, male: 'tools/smash/universal/male/' },
};

const catalog = createCatalog({
  'tools/tool_smash.json': smash,
}).catalog;

const palettes = createPaletteCatalog({}).palettes;

describe('LayerRow', () => {
  it('uses the variant translator in the collapsed layer summary', () => {
    const html = renderToStaticMarkup(
      <LayerRow
        disabled={false}
        typeName="weapon"
        catalog={catalog}
        palettes={palettes}
        state={{
          bodyType: 'male',
          selections: {
            weapon: {
              typeName: 'weapon',
              name: 'Smash',
              variant: 'axe',
            },
          },
          anim: 'walk',
          dir: 'down',
          playing: false,
          zoom: 4,
        }}
        dispatch={vi.fn()}
        tl={createLabelTranslator('zh-TW')}
        t={createTranslator('zh-TW')}
        licenseFilter={ALL_LICENSE_GROUPS}
        animationFilter={new Set()}
        expanded={false}
        onToggle={vi.fn()}
      />,
    );

    expect(html).toContain('敲擊工具');
    expect(html).toContain('斧頭');
  });
});
```

- [ ] **Step 2: Run the summary test and verify failure**

Run:

```sh
pnpm --filter @lpc-toolkit/web exec vitest run test/layer-row.test.tsx
```

Expected: FAIL because the summary still calls `tl.color('axe')`, which
humanizes the value to `Axe` rather than translating it to `斧頭`.

- [ ] **Step 3: Switch the summary to the variant translator**

In `packages/web/src/components/layer-stack/layer-row.tsx`, change:

```tsx
<span>{tl.color(selection.variant)}</span>
```

to:

```tsx
<span>{tl.variant(selection.variant)}</span>
```

- [ ] **Step 4: Run the summary test and verify success**

Run:

```sh
pnpm --filter @lpc-toolkit/web exec vitest run test/layer-row.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run complete web verification**

Run:

```sh
pnpm --filter @lpc-toolkit/web test
pnpm --filter @lpc-toolkit/web typecheck
pnpm --filter @lpc-toolkit/web build
```

Expected: all commands PASS. The build may regenerate prepared asset output,
but it must not modify `upstream/`.

- [ ] **Step 6: Inspect the final diff**

Run:

```sh
git diff --check
git status --short
git diff -- packages/web/src packages/web/test
```

Expected:

- No whitespace errors.
- No changes under `upstream/`, `packages/core/`, or `assets/`.
- Existing unrelated untracked files remain untouched.
- Raw variant keys such as `axe` still flow through selection callbacks.

- [ ] **Step 7: Commit the summary fix and tests**

```sh
git add packages/web/src/components/layer-stack/layer-row.tsx packages/web/test/layer-row.test.tsx
git commit -m "fix(web): translate selected variant summaries"
```
