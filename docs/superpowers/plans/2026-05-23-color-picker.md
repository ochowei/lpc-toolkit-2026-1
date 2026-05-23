# Color Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add upstream-style color selection so every colorable asset in the web UI can be recolored — real color swatches for `recolors` items, named chips for `variants` items.

**Architecture:** `packages/core` already implements both color mechanisms; this work is ~90% in the web layer. One additive core function (`getRecolorSwatches`) exposes resolved color ramps. The web gains a palette loader, a pure color-options resolver, a `ColorPicker` component, and wires `resolvePalette` into composition so recolors actually render.

**Tech Stack:** TypeScript (strict), React 18 + Vite + Tailwind, pnpm workspaces, Vitest.

---

## Prerequisites & Conventions

- Work on branch `feat/color-picker` (already checked out; the design spec is committed there).
- The `upstream/` submodule must be initialized: `git submodule update --init` (already done).
- The web package imports `@lpc-toolkit/core` from its built `dist/`. **After Task 1 you must rebuild core** (`pnpm --filter @lpc-toolkit/core build`) or web typecheck/tests will not see the new export. Task 1 includes this step.
- Every commit message ends with this trailer:
  `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- Never modify `upstream/`. No `any`. Functional components, kebab-case files.

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/core/src/recolor-resolve.ts` | + `getRecolorSwatches` — resolved color ramps per recolor option |
| `packages/core/src/index.ts` | + export `getRecolorSwatches` / `RecolorSwatch` |
| `packages/web/src/catalog/load-palettes.ts` | NEW — ingest `upstream/palette_definitions/**` into `PaletteMetadata` |
| `packages/web/src/slice/color-options.ts` | NEW — pure resolver: item → color options + pick defaults |
| `packages/web/src/components/color-picker.tsx` | NEW — swatch/chip renderer over `color-options` |
| `packages/web/src/hooks/use-composed-character.ts` | wire `resolvePalette` into composition |
| `packages/web/src/App.tsx` | load palettes, thread `PaletteMetadata` |
| `packages/web/src/components/slice-harness.tsx` | render `ColorPicker`; use `pickDefaults` |
| `packages/web/src/i18n.ts` | + `picker.color` label |

---

## Task 1: Core — `getRecolorSwatches`

**Files:**
- Modify: `packages/core/src/recolor-resolve.ts` (append after `getRecolorVariants`, end of file)
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/recolor-resolve.test.ts` (append new `describe`)

- [ ] **Step 1: Write the failing test**

In `packages/core/test/recolor-resolve.test.ts`, change the import on line 7 to add `getRecolorSwatches`:

```ts
import { getRecolorSwatches, makeResolvePalette } from '../src/recolor-resolve.js';
```

Append this `describe` block at the end of the file:

```ts
describe('getRecolorSwatches', () => {
  it('returns each recolor name with its resolved color ramp', () => {
    const palettes = createPaletteCatalog({
      'm/meta_m.json': { type: 'material', default: 'v1', base: 'c0' },
      'm/m_v1.json': {
        c0: ['#000000', '#111111'],
        red: ['#ff0000', '#ee0000'],
      },
    }).palettes;
    const item: ItemDefinition = {
      name: 'Thing',
      type_name: 't',
      animations: ['walk'],
      credits: [],
      recolors: { material: 'm', palettes: ['v1'] },
      layer_1: { zPos: 1, male: 't/' },
    };
    expect(getRecolorSwatches(item, palettes)).toEqual([
      { recolor: 'c0', colors: ['#000000', '#111111'] },
      { recolor: 'red', colors: ['#ff0000', '#ee0000'] },
    ]);
  });

  it('returns an empty array for an item with no recolors', () => {
    const palettes = createPaletteCatalog({}).palettes;
    const plain: ItemDefinition = {
      name: 'Plain',
      type_name: 't',
      animations: ['walk'],
      credits: [],
      layer_1: { zPos: 1, male: 't/' },
    };
    expect(getRecolorSwatches(plain, palettes)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lpc-toolkit/core exec vitest run test/recolor-resolve.test.ts`
Expected: FAIL — `getRecolorSwatches` is not exported / not a function.

- [ ] **Step 3: Write the implementation**

In `packages/core/src/recolor-resolve.ts`, append at the end of the file (after `getRecolorVariants`):

```ts
/** One recolor option plus the hex ramp behind it — what a swatch UI draws. */
export interface RecolorSwatch {
  readonly recolor: string;
  readonly colors: readonly string[];
}

/**
 * The first recolor entry's palette-expanded variants paired with their
 * resolved color ramps. Shares the expansion path with `getRecolorVariants`
 * (`collectRecolorEntries` + `normalizeRecolor`); each variant's ramp is
 * resolved through `getTargetPalette`. Returns `[]` when the item has no
 * recolors or the material is unknown. Lets a UI draw real color swatches
 * without re-implementing core's recolor-key resolution.
 */
export function getRecolorSwatches(
  item: ItemDefinition,
  palettes: PaletteMetadata,
): readonly RecolorSwatch[] {
  const first = collectRecolorEntries(item.recolors)[0];
  if (!first) return [];
  const nr = normalizeRecolor(first, palettes.materials);
  if (!nr) return [];
  const out: RecolorSwatch[] = [];
  for (const recolor of nr.variants) {
    const colors = getTargetPalette(nr.material, recolor, palettes.materials);
    if (colors && colors.length > 0) out.push({ recolor, colors });
  }
  return out;
}
```

In `packages/core/src/index.ts`, update the `recolor-resolve.js` exports. Replace:

```ts
export type {
  MakeResolvePaletteOptions,
  ResolvePalette,
} from './recolor-resolve.js';
export { getRecolorVariants, makeResolvePalette } from './recolor-resolve.js';
```

with:

```ts
export type {
  MakeResolvePaletteOptions,
  RecolorSwatch,
  ResolvePalette,
} from './recolor-resolve.js';
export {
  getRecolorSwatches,
  getRecolorVariants,
  makeResolvePalette,
} from './recolor-resolve.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lpc-toolkit/core exec vitest run test/recolor-resolve.test.ts`
Expected: PASS (all tests in the file, including the two new ones).

- [ ] **Step 5: Rebuild core so web can see the new export**

Run: `pnpm --filter @lpc-toolkit/core build`
Expected: succeeds, no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/recolor-resolve.ts packages/core/src/index.ts packages/core/test/recolor-resolve.test.ts
git commit -m "feat(core): add getRecolorSwatches"
```

---

## Task 2: Web — palette definitions loader

**Files:**
- Create: `packages/web/src/catalog/load-palettes.ts`
- Test: `packages/web/test/load-palettes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/load-palettes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { recordsToPalettes } from '../src/catalog/load-palettes';

describe('recordsToPalettes', () => {
  it('builds palette metadata keyed by material and version', () => {
    const palettes = recordsToPalettes({
      'body/meta_body.json': {
        type: 'material',
        label: 'Skintone',
        default: 'ulpc',
        base: 'light',
      },
      'body/body_ulpc.json': {
        light: ['#aaa', '#bbb'],
        brown: ['#111', '#222'],
      },
    });
    expect(palettes.materials.body?.default).toBe('ulpc');
    expect(palettes.materials.body?.base).toBe('light');
    expect(palettes.materials.body?.palettes.ulpc?.brown).toEqual([
      '#111',
      '#222',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/load-palettes.test.ts`
Expected: FAIL — cannot resolve `../src/catalog/load-palettes`.

- [ ] **Step 3: Write the implementation**

Create `packages/web/src/catalog/load-palettes.ts`:

```ts
import { createPaletteCatalog, type PaletteMetadata } from '@lpc-toolkit/core';

/**
 * Build `PaletteMetadata` from a `{ path: parsedJson }` record map.
 * `createPaletteCatalog` derives material/version from each file's
 * basename, so the path prefix does not matter. Warnings are logged, not
 * thrown — mirrors `recordsToCatalog`.
 */
export function recordsToPalettes(
  records: Readonly<Record<string, unknown>>,
): PaletteMetadata {
  const { palettes, warnings } = createPaletteCatalog(records);
  if (warnings.length > 0) {
    console.warn(`[palettes] ${warnings.length} load warning(s)`, warnings);
  }
  return palettes;
}

/**
 * Build `PaletteMetadata` from the read-only `upstream/` submodule. The
 * glob is static and relative: from packages/web/src/catalog/ the repo
 * root is four levels up. Vite inlines every matched JSON at build time.
 * Throws with a fix instruction if the submodule is not initialized.
 */
export function loadPalettesFromUpstream(): PaletteMetadata {
  const mods = import.meta.glob<unknown>(
    '../../../../upstream/palette_definitions/**/*.json',
    { eager: true, import: 'default' },
  );
  if (Object.keys(mods).length === 0) {
    throw new Error(
      'No palette definitions found. Run: git submodule update --init',
    );
  }
  return recordsToPalettes(mods);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/load-palettes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/catalog/load-palettes.ts packages/web/test/load-palettes.test.ts
git commit -m "feat(web): add palette definitions loader"
```

---

## Task 3: Web — color options resolver

**Files:**
- Create: `packages/web/src/slice/color-options.ts`
- Test: `packages/web/test/color-options.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/color-options.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createPaletteCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import { getColorOptions, pickDefaults } from '../src/slice/color-options';

const palettes = createPaletteCatalog({
  'm/meta_m.json': { type: 'material', default: 'v1', base: 'c0' },
  'm/m_v1.json': {
    c0: ['#000000', '#111111'],
    red: ['#ff0000', '#ee0000'],
  },
}).palettes;

const recolorItem: ItemDefinition = {
  name: 'Recolor Thing',
  type_name: 't',
  animations: ['walk'],
  credits: [],
  recolors: { material: 'm', palettes: ['v1'] },
  layer_1: { zPos: 1, male: 't/' },
};

const variantItem: ItemDefinition = {
  name: 'Variant Thing',
  type_name: 't',
  animations: ['walk'],
  credits: [],
  variants: ['black', 'bright_green'],
  layer_1: { zPos: 1, male: 't/' },
};

const plainItem: ItemDefinition = {
  name: 'Plain Thing',
  type_name: 't',
  animations: ['walk'],
  credits: [],
  layer_1: { zPos: 1, male: 't/' },
};

describe('getColorOptions', () => {
  it('returns real color swatches for a recolors item', () => {
    expect(getColorOptions(recolorItem, palettes)).toEqual({
      mode: 'recolors',
      options: [
        { kind: 'recolor', value: 'c0', swatch: '#111111', label: 'C0' },
        { kind: 'recolor', value: 'red', swatch: '#ee0000', label: 'Red' },
      ],
    });
  });

  it('returns named chips for a variants item', () => {
    expect(getColorOptions(variantItem, palettes)).toEqual({
      mode: 'variants',
      options: [
        { kind: 'variant', value: 'black', label: 'Black' },
        { kind: 'variant', value: 'bright_green', label: 'Bright green' },
      ],
    });
  });

  it('returns mode "none" for an item with no colors', () => {
    expect(getColorOptions(plainItem, palettes)).toEqual({ mode: 'none' });
  });
});

describe('pickDefaults', () => {
  it('defaults a recolors item to its first color', () => {
    expect(pickDefaults(recolorItem, palettes)).toEqual({ recolor: 'c0' });
  });

  it('defaults a variants item to its first variant', () => {
    expect(pickDefaults(variantItem, palettes)).toEqual({ variant: 'black' });
  });

  it('returns no color fields for an item with no colors', () => {
    expect(pickDefaults(plainItem, palettes)).toEqual({});
  });

  it('returns no color fields for a missing item', () => {
    expect(pickDefaults(undefined, palettes)).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/color-options.test.ts`
Expected: FAIL — cannot resolve `../src/slice/color-options`.

- [ ] **Step 3: Write the implementation**

Create `packages/web/src/slice/color-options.ts`:

```ts
import {
  getRecolorSwatches,
  type ItemDefinition,
  type PaletteMetadata,
} from '@lpc-toolkit/core';

export interface RecolorColorOption {
  readonly kind: 'recolor';
  readonly value: string; // goes into Selection.recolor
  readonly swatch: string; // hex color for the swatch square
  readonly label: string; // display text + tooltip
}

export interface VariantColorOption {
  readonly kind: 'variant';
  readonly value: string; // goes into Selection.variant
  readonly label: string; // display text
}

export type ColorOptions =
  | { readonly mode: 'recolors'; readonly options: readonly RecolorColorOption[] }
  | { readonly mode: 'variants'; readonly options: readonly VariantColorOption[] }
  | { readonly mode: 'none' };

/** "fur_black" -> "Fur black"; "lpcr.tan" -> "Tan". */
function humanize(raw: string): string {
  const tail = raw.includes('.') ? raw.slice(raw.lastIndexOf('.') + 1) : raw;
  const spaced = tail.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A recognizable single color from a dark-to-light ramp: the mid entry. */
function representative(colors: readonly string[]): string {
  return colors[Math.floor(colors.length / 2)] ?? colors[0] ?? '#000000';
}

/**
 * The color choices for an item. A `recolors` item yields real color
 * swatches; a `variants` item yields named chips (variant folders carry no
 * color value); an item with neither yields `mode: 'none'`. Upstream data
 * never sets both, so `recolors` is checked first.
 */
export function getColorOptions(
  item: ItemDefinition,
  palettes: PaletteMetadata,
): ColorOptions {
  const swatches = getRecolorSwatches(item, palettes);
  if (swatches.length > 0) {
    return {
      mode: 'recolors',
      options: swatches.map((s) => ({
        kind: 'recolor',
        value: s.recolor,
        swatch: representative(s.colors),
        label: humanize(s.recolor),
      })),
    };
  }
  if (item.variants && item.variants.length > 0) {
    return {
      mode: 'variants',
      options: item.variants.map((v) => ({
        kind: 'variant',
        value: v,
        label: humanize(v),
      })),
    };
  }
  return { mode: 'none' };
}

/**
 * The color fields to set when an item is freshly picked: variant items
 * need `variants[0]` (the sprite path requires a variant folder); recolor
 * items default to their first color so the swatch row has an active
 * choice. Returns `{}` for an item with no colors or a missing item.
 */
export function pickDefaults(
  item: ItemDefinition | undefined,
  palettes: PaletteMetadata,
): { variant?: string; recolor?: string } {
  if (!item) return {};
  const colors = getColorOptions(item, palettes);
  if (colors.mode === 'variants') {
    const first = colors.options[0];
    return first ? { variant: first.value } : {};
  }
  if (colors.mode === 'recolors') {
    const first = colors.options[0];
    return first ? { recolor: first.value } : {};
  }
  return {};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/color-options.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/slice/color-options.ts packages/web/test/color-options.test.ts
git commit -m "feat(web): add color options resolver"
```

---

## Task 4: Web — `ColorPicker` component

**Files:**
- Create: `packages/web/src/components/color-picker.tsx`

The pickable logic (`getColorOptions`) is already unit-tested in Task 3. This component is a thin presentational renderer; the web package has no DOM test environment, so it is verified by typecheck here and by the manual checklist in Task 8.

- [ ] **Step 1: Write the component**

Create `packages/web/src/components/color-picker.tsx`:

```tsx
import { useMemo } from 'react';
import type {
  ItemDefinition,
  PaletteMetadata,
  Selection,
} from '@lpc-toolkit/core';
import { getColorOptions } from '../slice/color-options';

/**
 * Color swatches / variant chips for one selected item. Renders nothing
 * for an item with no colors. `recolors` items show real color squares;
 * `variants` items show named chips (variant folders carry no color value).
 * The row wraps and scrolls so a many-color material (e.g. skin tone) does
 * not overrun the panel.
 */
export function ColorPicker({
  item,
  selection,
  palettes,
  colorLabel,
  onSelect,
}: {
  item: ItemDefinition;
  selection: Selection | undefined;
  palettes: PaletteMetadata;
  colorLabel: string;
  onSelect: (change: { variant: string } | { recolor: string }) => void;
}) {
  const colors = useMemo(
    () => getColorOptions(item, palettes),
    [item, palettes],
  );
  if (colors.mode === 'none') return null;

  return (
    <div className="text-xs">
      <span className="text-text-mute uppercase">{colorLabel}</span>
      <div className="mt-1 flex max-h-28 flex-wrap gap-1 overflow-y-auto">
        {colors.mode === 'recolors'
          ? colors.options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                title={opt.label}
                aria-label={opt.label}
                aria-pressed={opt.value === selection?.recolor}
                className={`h-5 w-5 rounded border border-border ${
                  opt.value === selection?.recolor ? 'ring-2 ring-accent' : ''
                }`}
                style={{ backgroundColor: opt.swatch }}
                onClick={() => onSelect({ recolor: opt.value })}
              />
            ))
          : colors.options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={opt.value === selection?.variant}
                className={`rounded border border-border px-1.5 py-0.5 text-[11px] ${
                  opt.value === selection?.variant
                    ? 'bg-accent text-accent-ink'
                    : 'bg-surface-2 text-text'
                }`}
                onClick={() => onSelect({ variant: opt.value })}
              >
                {opt.label}
              </button>
            ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS, no type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/color-picker.tsx
git commit -m "feat(web): add ColorPicker component"
```

---

## Task 5: Web — `picker.color` i18n key

**Files:**
- Modify: `packages/web/src/i18n.ts`

- [ ] **Step 1: Add the key to both locales**

In `packages/web/src/i18n.ts`, in the `en` block, after the `'picker.searchAssets'` line, add:

```ts
    'picker.color': 'Color',
```

In the `'zh-TW'` block, after its `'picker.searchAssets'` line, add:

```ts
    'picker.color': '顏色',
```

- [ ] **Step 2: Verify i18n tests still pass**

Run: `pnpm --filter @lpc-toolkit/web exec vitest run test/i18n.test.ts`
Expected: PASS (both locales stay in key parity).

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/i18n.ts
git commit -m "feat(web): add picker.color i18n key"
```

---

## Task 6: Web — apply recolor palettes during composition

Loads palettes in `App`, threads `PaletteMetadata` to `SliceHarness`, and passes `resolvePalette` into `composeSelections`. After this task the recolor pipeline is live; there is no visible change yet because the only recolor values present are the default `'light'` (an identity swap against the base ramp).

**Files:**
- Modify: `packages/web/src/hooks/use-composed-character.ts`
- Modify: `packages/web/src/components/slice-harness.tsx`
- Modify: `packages/web/src/App.tsx`

- [ ] **Step 1: Update `use-composed-character.ts`**

Change the core import (lines 2–8) to add `makeResolvePalette` and `PaletteMetadata`:

```ts
import {
  composeSelections,
  extractAnimation,
  makeResolvePalette,
  type Catalog,
  type ComposedAnimation,
  type ComposedSheet,
  type PaletteMetadata,
} from '@lpc-toolkit/core';
```

Add a `palettes` parameter to the function signature. Replace:

```ts
export function useComposedCharacter(
  catalog: Catalog,
  state: SliceState,
  assetSource: AssetSource,
): ComposedResult {
```

with:

```ts
export function useComposedCharacter(
  catalog: Catalog,
  palettes: PaletteMetadata,
  state: SliceState,
  assetSource: AssetSource,
): ComposedResult {
```

In the compose effect, pass `resolvePalette`. Replace:

```ts
    composeSelections(selections, {
      catalog,
      adapter,
      spritesheetsBaseUrl: '',
      onProgress: (loaded, total) => {
```

with:

```ts
    composeSelections(selections, {
      catalog,
      adapter,
      spritesheetsBaseUrl: '',
      resolvePalette: makeResolvePalette(catalog, palettes, selections),
      onProgress: (loaded, total) => {
```

Add `palettes` to the effect dependency array. Replace `}, [adapter, catalog, key]);` with `}, [adapter, catalog, palettes, key]);`.

- [ ] **Step 2: Update `slice-harness.tsx`**

Add `PaletteMetadata` to the core import block (lines 3–14), keeping alphabetical order among the `type` entries — i.e. add `type PaletteMetadata,` after `type License,`:

```ts
  type License,
  type PaletteMetadata,
} from '@lpc-toolkit/core';
```

Add `palettes` to the destructured props (in the `SliceHarness({ ... })` list) and to the props type. In the destructuring list add `palettes,` after `catalog,`. In the props type object add this line after `catalog: Catalog;`:

```ts
  palettes: PaletteMetadata;
```

Update the hook call. Replace:

```ts
  const result = useComposedCharacter(catalog, state, assetSource);
```

with:

```ts
  const result = useComposedCharacter(catalog, palettes, state, assetSource);
```

- [ ] **Step 3: Update `App.tsx`**

Add the import after the `loadCatalogFromUpstream` import:

```ts
import { loadPalettesFromUpstream } from './catalog/load-palettes';
```

In the `init` `useMemo`, load palettes and include them in the returned object. Replace:

```ts
  const init = useMemo(() => {
    const catalog = loadCatalogFromUpstream();
    const { state, shownTypeNames } = pickInitialSelections(catalog);
    return { catalog, state, shownTypeNames };
  }, []);
```

with:

```ts
  const init = useMemo(() => {
    const catalog = loadCatalogFromUpstream();
    const palettes = loadPalettesFromUpstream();
    const { state, shownTypeNames } = pickInitialSelections(catalog);
    return { catalog, palettes, state, shownTypeNames };
  }, []);
```

Pass the prop to `<SliceHarness>` — add this line next to `catalog={init.catalog}`:

```tsx
      palettes={init.palettes}
```

- [ ] **Step 4: Verify typecheck and existing tests**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS.

Run: `pnpm --filter @lpc-toolkit/web test`
Expected: PASS — all existing tests still green (the `pretest` hook copies spritesheets first).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/use-composed-character.ts packages/web/src/components/slice-harness.tsx packages/web/src/App.tsx
git commit -m "feat(web): apply recolor palettes during composition"
```

---

## Task 7: Web — render the color picker

Adds `ColorPicker` to the Common section and the Advanced tree, and switches item-pick handlers to `pickDefaults` so a freshly picked item gets a sensible default color.

**Files:**
- Modify: `packages/web/src/components/slice-harness.tsx`

- [ ] **Step 1: Add imports**

After the existing `import { computePresetSelection } from '../presets-apply';` line, add:

```ts
import { pickDefaults } from '../slice/color-options';
import { ColorPicker } from './color-picker';
```

- [ ] **Step 2: Use `pickDefaults` in `pickTreeItem`**

Replace the body of `pickTreeItem`:

```ts
  function pickTreeItem(item: CatalogTreeItem): void {
    const def = itemByTypeAndName.get(`${item.typeName}:${item.name}`);
    dispatch({
      type: 'pick',
      typeName: item.typeName,
      name: item.name,
      ...(def?.variants?.[0] ? { variant: def.variants[0] } : {}),
    });
  }
```

with:

```ts
  function pickTreeItem(item: CatalogTreeItem): void {
    const def = itemByTypeAndName.get(`${item.typeName}:${item.name}`);
    dispatch({
      type: 'pick',
      typeName: item.typeName,
      name: item.name,
      ...pickDefaults(def, palettes),
    });
  }
```

- [ ] **Step 3: Use `pickDefaults` in the Common picker `<select>` handler**

In the Common section's `onChange`, replace:

```ts
                      const item = items.find((it) => it.name === name);
                      dispatch({
                        type: 'pick',
                        typeName: tn,
                        name,
                        ...(item?.variants?.[0]
                          ? { variant: item.variants[0] }
                          : {}),
                      });
```

with:

```ts
                      const item = items.find((it) => it.name === name);
                      dispatch({
                        type: 'pick',
                        typeName: tn,
                        name,
                        ...pickDefaults(item, palettes),
                      });
```

- [ ] **Step 4: Render `ColorPicker` in the Common section**

In the Common section's `shownTypeNames.map(...)` callback, the returned element is a `<label key={tn} className="block text-xs">…</label>`. Wrap it in a `<div>` and append the picker.

Replace the opening tag:

```tsx
                <label key={tn} className="block text-xs">
```

with:

```tsx
                <div key={tn} className="space-y-1">
                  <label className="block text-xs">
```

Replace the closing of that block (the `</select>` / `</label>` immediately before the `);` that ends the map callback):

```tsx
                  </select>
                </label>
              );
```

with:

```tsx
                  </select>
                  </label>
                  {selectedItem && (
                    <ColorPicker
                      item={selectedItem}
                      selection={state.selections[tn]}
                      palettes={palettes}
                      colorLabel={t('picker.color')}
                      onSelect={(change) =>
                        dispatch({
                          type: 'pick',
                          typeName: tn,
                          name: selectedItem.name,
                          ...change,
                        })
                      }
                    />
                  )}
                </div>
              );
```

(`selectedItem` is already computed earlier in the same callback. Re-indenting the wrapped `<select>` block is optional — it does not affect behavior.)

- [ ] **Step 5: Render `ColorPicker` in the Advanced tree**

In `renderTreeNode`, the header branch maps `visibleItems` to a `<button>`. Replace that entire `visibleItems.map(...)` callback (the one inside `<details>`, returning the `<button key={`${item.typeName}:${item.name}`} …>`) with this version, which wraps each row and appends the picker for the selected item:

```tsx
              {visibleItems.map((item) => {
                const def = itemByTypeAndName.get(
                  `${item.typeName}:${item.name}`,
                );
                const compatible = def
                  ? itemSupportsBodyType(def, state.bodyType)
                  : false;
                const selected =
                  state.selections[item.typeName]?.name === item.name;
                return (
                  <div key={`${item.typeName}:${item.name}`}>
                    <button
                      type="button"
                      disabled={!compatible}
                      title={
                        !compatible
                          ? t('picker.incompatibleBodyType')
                          : tl.category(item.typeName)
                      }
                      className={`block w-full rounded px-2 py-1 text-left text-xs ${
                        selected
                          ? 'bg-accent text-accent-ink'
                          : compatible
                            ? 'text-text hover:bg-surface-2'
                            : 'text-text-dim opacity-60'
                      }`}
                      onClick={() => pickTreeItem(item)}
                    >
                      <span>{tl.itemName(item.name)}</span>
                      <span className="ml-1 text-[10px] text-text-dim">
                        {tl.category(item.typeName)}
                      </span>
                    </button>
                    {selected && def && (
                      <div className="ml-2 mt-1">
                        <ColorPicker
                          item={def}
                          selection={state.selections[item.typeName]}
                          palettes={palettes}
                          colorLabel={t('picker.color')}
                          onSelect={(change) =>
                            dispatch({
                              type: 'pick',
                              typeName: item.typeName,
                              name: item.name,
                              ...change,
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })}
```

- [ ] **Step 6: Verify typecheck and existing tests**

Run: `pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS.

Run: `pnpm --filter @lpc-toolkit/web test`
Expected: PASS — all existing tests still green.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/slice-harness.tsx
git commit -m "feat(web): render color picker in common section and asset tree"
```

---

## Task 8: Full verification

No code changes — confirm the whole monorepo is green and exercise the feature manually.

- [ ] **Step 1: Rebuild core and run the full suite**

```bash
pnpm --filter @lpc-toolkit/core build
pnpm test
pnpm typecheck
pnpm build
```

Expected: all packages build, typecheck, and test successfully.

- [ ] **Step 2: Manual verification**

Run `pnpm --filter @lpc-toolkit/web dev` and check, in the browser:

- Selecting **Body** in the Common section shows a row of real skin-tone swatches; clicking a dark tone recolors the live preview immediately.
- Selecting a **Hair** shows hair-color swatches; changing the color updates the preview.
- Picking a `variants` item in the Advanced tree (e.g. an **earring** or **mask**) shows named chips; clicking one changes the rendered color.
- The active swatch/chip is highlighted; many-color materials (skin tone) wrap and scroll instead of overrunning the panel.
- A `match_body_color` accessory follows the body skin tone.
- Attribution / credits still render. Default outfit looks unchanged from before this feature.

- [ ] **Step 3: Done**

No commit needed if Step 1 produced no file changes. The feature branch `feat/color-picker` now holds the complete implementation.

---

## Self-Review Notes

- **Spec coverage:** core `getRecolorSwatches` (Task 1); web gap A palette loading (Task 2, 6); web gap B `resolvePalette` wiring (Task 6); web gap C `ColorPicker` (Tasks 3, 4, 7); placement in Common + Advanced (Task 7); many-colors scroll (Task 4 `max-h-28 overflow-y-auto`); `picker.color` i18n (Task 5); non-regression verified (Task 8). All spec sections map to a task.
- **Type consistency:** `RecolorSwatch { recolor, colors }` (Task 1) is consumed by `getColorOptions` (Task 3); `ColorOptions` / `RecolorColorOption` / `VariantColorOption` (Task 3) are consumed by `ColorPicker` (Task 4); `useComposedCharacter(catalog, palettes, state, assetSource)` (Task 6) matches its one call site in `slice-harness.tsx` (Task 6); `onSelect` accepts `{ variant: string } | { recolor: string }`, spread into the `pick` action whose `SliceAction` already allows optional `variant` / `recolor`.
