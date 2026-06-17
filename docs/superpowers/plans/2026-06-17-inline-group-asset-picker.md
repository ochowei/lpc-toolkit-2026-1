# Inline Group Asset Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-group add/replace entries so users can open the asset picker from the relevant upstream group instead of scrolling to the bottom Add Layer control.

**Architecture:** Extract the item grid from `LayerRow` into a shared `TypeItemPicker`, then add an inline group entry component that can open that picker for selected and unselected type slots. `StackPanel` continues to own the single expanded `TypeName | null` state, so only one picker is open at a time and no reducer changes are needed.

**Tech Stack:** TypeScript strict, React 18, Vite/Vitest, Tailwind utility classes, pnpm via `rtk`.

---

## File Structure

- Create: `packages/web/src/components/layer-stack/type-item-picker.tsx`
  - Owns the replacement/add item picker grid currently embedded in `LayerRow`.
  - Handles body type, license filter, animation filter, thumbnail display mode, item selection dispatch, custom animation dispatch, and optional color/style controls.
- Create: `packages/web/src/components/layer-stack/group-type-slot-entries.tsx`
  - Renders compact in-group type-slot entries.
  - Shows `+ {category}` for unselected slots and `{category}: {item} - Replace` for selected slots.
  - Opens `TypeItemPicker` when `expandedTypeName` matches an entry.
- Modify: `packages/web/src/components/layer-stack/layer-row.tsx`
  - Removes the duplicated picker grid and delegates to `TypeItemPicker` when expanded.
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`
  - Renders `GroupTypeSlotEntries` inside each upstream group after selected rows.
  - Updates the expanded-state cleanup so unselected inline picker types are allowed when still shown.
- Modify: `packages/web/test/layer-row.test.tsx`
  - Keeps the existing expanded picker behavior tests passing after extraction.
- Modify: `packages/web/test/stack-panel.test.tsx`
  - Adds coverage for selected replace entries, unselected add entries, expanded inline picker output, and selected item fallback labels.

Follow the project workflow note while implementing each task: after completing a task, update this plan checkbox, add a short implementation note under the task, record the commit hash, and record verification status.

---

### Task 1: Add Failing StackPanel Coverage

**Files:**
- Modify: `packages/web/test/stack-panel.test.tsx`

- [x] **Step 1: Add the test data needed for inline add and replace entries**

In `packages/web/test/stack-panel.test.tsx`, replace the single clothes item with two clothes items so replacement behavior can be detected:

```ts
const { catalog } = createCatalog({
  'body/body.json': defn('Body Color', 'body'),
  'head/heads_human_male.json': defn('Human Male', 'head'),
  'hair/short/hair_a.json': defn('Hair A', 'hair'),
  'headwear/hats/hat_a.json': defn('Hat A', 'hat'),
  'arms/gloves/gloves_a.json': defn('Gloves A', 'gloves'),
  'torso/clothes/long_sleeve.json': defn('Long Sleeve', 'clothes'),
  'torso/clothes/short_sleeve.json': defn('Short Sleeve', 'clothes'),
  'legs/pants/pants_a.json': defn('Pants A', 'legs'),
  'feet/shoes/shoes_a.json': defn('Shoes A', 'shoes'),
  'tools/tool_a.json': defn('Tool A', 'tools'),
  'weapons/sword_a.json': defn('Sword A', 'weapon'),
});
```

- [x] **Step 2: Add a reusable render helper**

First add `TypeName` to the existing core import:

```ts
import { createCatalog, createPaletteCatalog, type ItemDefinition, type TypeName } from '@lpc-toolkit/core';
```

Then add this helper below `state`:

```tsx
function renderPanel(overrides: {
  readonly state?: SliceState;
  readonly expanded?: TypeName | null;
} = {}): string {
  return renderToStaticMarkup(
    <StackPanel
      disabled={false}
      catalog={catalog}
      palettes={palettes}
      state={overrides.state ?? state}
      dispatch={() => {}}
      shownTypeNames={[
        'body',
        'head',
        'hair',
        'hat',
        'gloves',
        'clothes',
        'legs',
        'shoes',
        'tools',
        'weapon',
      ]}
      licenseFilter={ALL_LICENSE_GROUPS}
      toggleLicenseGroup={() => {}}
      licenseIncompatibleCount={0}
      removeLicenseIncompatibleSelections={() => {}}
      animationFilter={new Set()}
      toggleAnimation={() => {}}
      animationIncompatibleCount={0}
      removeAnimationIncompatibleSelections={() => {}}
      customOverlay={null}
      customOverlayZPos={95}
      onCustomOverlayUpload={() => {}}
      onCustomOverlayZPosChange={() => {}}
      onClearCustomOverlay={() => {}}
      t={createTranslator('en')}
      tl={createLabelTranslator('en')}
      onPresetApplied={() => {}}
      onReset={() => {}}
      status={null}
      searchInputRef={{ current: null }}
      expanded={overrides.expanded ?? null}
      setExpanded={() => {}}
      replacementCardDisplayMode="overlay"
      onReplacementCardDisplayModeChange={() => {}}
    />
  );
}
```

- [x] **Step 3: Replace the existing render call with the helper**

In the existing test body, replace the long `renderToStaticMarkup` call that renders `StackPanel` with:

```ts
const html = renderPanel();
```

- [x] **Step 4: Update the existing empty-group assertion**

The inline entries make empty groups actionable, so the exact count of `No layer selected` should go away. Replace:

```ts
expect(html.match(/No layer selected/g)).toHaveLength(8);
```

with:

```ts
expect(html).toContain('+ Head');
expect(html).toContain('+ Hair');
expect(html).toContain('+ Hat');
expect(html).toContain('+ Gloves');
expect(html).toContain('+ Clothes');
expect(html).toContain('+ Legs');
expect(html).toContain('+ Shoes');
expect(html).toContain('+ Tools');
```

- [x] **Step 5: Add tests for selected replace entries and expanded inline picker**

Append these tests in the existing `describe('StackPanel upstream selected-layer groups', () => { ... })` block:

```tsx
it('shows selected type slots as replace entries in their groups', () => {
  const html = renderPanel();

  expect(html).toContain('Body: Body Color');
  expect(html).toContain('Weapon: Sword A');
  expect(html).toContain('Replace');
});

it('shows selected item fallback names in replace entries when catalog lookup is missing', () => {
  const missingCatalogState: SliceState = {
    ...state,
    selections: {
      ...state.selections,
      hat: { typeName: 'hat', name: 'Missing Hat' },
    },
  };

  const html = renderPanel({ state: missingCatalogState });

  expect(html).toContain('Hat: Missing Hat');
  expect(html).toContain('Replace');
});

it('opens an inline picker for an unselected type without selecting the first item', () => {
  const html = renderPanel({ expanded: 'clothes' });

  expect(html).toContain('Swap Clothes');
  expect(html).toContain('Long Sleeve');
  expect(html).toContain('Short Sleeve');
  expect(html).toContain('grid-cols-[repeat(auto-fill,minmax(72px,1fr))]');
});

it('opens an inline picker for a selected type with the current item marked selected', () => {
  const selectedClothesState: SliceState = {
    ...state,
    selections: {
      ...state.selections,
      clothes: { typeName: 'clothes', name: 'Long Sleeve' },
    },
  };

  const html = renderPanel({ state: selectedClothesState, expanded: 'clothes' });

  expect(html).toContain('Clothes: Long Sleeve');
  expect(html).toContain('Short Sleeve');
  expect(html).toContain('border-accent bg-accent/10 text-text');
});
```

- [x] **Step 6: Run the targeted test and verify it fails for the expected reason**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- stack-panel
```

Expected: FAIL because the new inline entries and unselected inline picker do not exist yet.

- [x] **Step 7: Commit the failing test**

Run:

```bash
rtk git add packages/web/test/stack-panel.test.tsx docs/superpowers/plans/2026-06-17-inline-group-asset-picker.md
rtk git commit -m "test: cover inline group asset picker"
```

Implementation note: record the commit hash and the failing verification result below this task.

**Implementation Note:**
- **Commit:** a12c241c6380a99bcbe26ca95071065f690fdb8b
- **Verification:** `rtk pnpm --filter @lpc-toolkit/web test -- stack-panel` failed as expected with 5 failing tests because components and picker do not yet exist.

---

### Task 2: Extract the Shared TypeItemPicker

**Files:**
- Create: `packages/web/src/components/layer-stack/type-item-picker.tsx`
- Modify: `packages/web/src/components/layer-stack/layer-row.tsx`
- Test: `packages/web/test/layer-row.test.tsx`

- [x] **Step 1: Create the shared picker component**

Create `packages/web/src/components/layer-stack/type-item-picker.tsx` with this content:

```tsx
import type { Catalog, ItemDefinition, PaletteMetadata, TypeName } from '@lpc-toolkit/core';
import { pickActionForItem, type SliceAction, type SliceState } from '../../slice/selection';
import type { LabelTranslator, Translator, TranslationKey } from '../../i18n';
import { itemSupportsBodyType } from '../../slice/catalog-tree';
import { itemMatchesLicenseFilter, type LicenseFilter } from '../../slice/license-filter';
import { itemMatchesAnimationFilter, type AnimationFilter } from '../../slice/animation-filter';
import { ColorPicker } from '../color-picker';
import { ItemThumbnail } from './item-thumbnail';
import {
  REPLACEMENT_CARD_DISPLAY_MODES,
  type ReplacementCardDisplayMode,
} from '../../lib/replacement-card-display-mode';

const DISPLAY_MODE_ICONS: Record<ReplacementCardDisplayMode, string> = {
  stacked: '\u25A4',
  overlay: '\u25A3',
  hidden: '\u25A1',
};

const DISPLAY_MODE_LABEL_KEYS: Record<ReplacementCardDisplayMode, TranslationKey> = {
  stacked: 'replacementCards.stacked',
  overlay: 'replacementCards.overlay',
  hidden: 'replacementCards.hidden',
};

interface Props {
  disabled: boolean;
  typeName: TypeName;
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  tl: LabelTranslator;
  t: Translator;
  licenseFilter: LicenseFilter;
  animationFilter: AnimationFilter;
  replacementCardDisplayMode: ReplacementCardDisplayMode;
  onReplacementCardDisplayModeChange: (mode: ReplacementCardDisplayMode) => void;
}

function customAnimationFor(item: ItemDefinition) {
  return item.layer_1?.custom_animation ||
    item.layer_2?.custom_animation ||
    item.layer_3?.custom_animation ||
    item.layer_4?.custom_animation;
}

/** Shared add/replace picker for all catalog items belonging to one type slot. */
export function TypeItemPicker({
  disabled,
  typeName,
  catalog,
  palettes,
  state,
  dispatch,
  tl,
  t,
  licenseFilter,
  animationFilter,
  replacementCardDisplayMode,
  onReplacementCardDisplayModeChange,
}: Props) {
  const items = catalog.byTypeName.get(typeName) ?? [];
  const selection = state.selections[typeName];
  const selectedItem = selection
    ? items.find((d) => d.name === selection.name)
    : undefined;
  const fullHeightThumbnail = replacementCardDisplayMode !== 'stacked';
  const thumbnailSize = fullHeightThumbnail ? 56 : 40;

  return (
    <div className="px-2 pb-2">
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <div className="mr-auto text-[10px] uppercase tracking-wide text-text-mute">
          {t('layer.swap').replace('{name}', tl.category(typeName))}
        </div>
        <div
          className="flex flex-wrap items-center gap-0.5"
          role="group"
          aria-label={t('replacementCards.displayMode')}
        >
          {REPLACEMENT_CARD_DISPLAY_MODES.map((mode) => {
            const selected = replacementCardDisplayMode === mode;
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={selected}
                onClick={() => onReplacementCardDisplayModeChange(mode)}
                className={[
                  'inline-flex items-center gap-1 rounded border px-1.5 py-0.5',
                  'text-[9px] focus-visible:outline-none focus-visible:ring-1',
                  'focus-visible:ring-accent',
                  selected
                    ? 'border-accent bg-accent/15 text-text'
                    : 'border-border bg-surface-2 text-text-mute hover:bg-surface-3',
                ].join(' ')}
              >
                <span aria-hidden>{DISPLAY_MODE_ICONS[mode]}</span>
                <span>{t(DISPLAY_MODE_LABEL_KEYS[mode])}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1">
        {items.map((it) => {
          const supports = itemSupportsBodyType(it, state.bodyType);
          const licenseExceeds = !itemMatchesLicenseFilter(it, licenseFilter);
          const animExceeds = !itemMatchesAnimationFilter(it, animationFilter);
          const exceeds = licenseExceeds || animExceeds;
          const isSelected = selection?.name === it.name;
          const exceedsTitle =
            licenseExceeds && animExceeds
              ? t('layer.bothIncompatibleTooltip')
              : licenseExceeds
                ? t('layer.licenseIncompatibleTooltip')
                : t('layer.animationIncompatibleTooltip');
          return (
            <button
              key={it.name}
              type="button"
              disabled={disabled || !supports}
              title={
                !supports ? t('picker.incompatibleBodyType') :
                exceeds ? exceedsTitle :
                tl.itemName(it.name)
              }
              onClick={() => {
                dispatch(pickActionForItem(typeName, it));
                const customAnim = customAnimationFor(it);
                if (customAnim) {
                  dispatch({ type: 'set_anim', anim: customAnim });
                }
              }}
              aria-label={tl.itemName(it.name)}
              data-label-layout={replacementCardDisplayMode}
              className={[
                'relative flex h-16 items-center justify-center overflow-hidden',
                'rounded-md border p-1 text-[10px]',
                replacementCardDisplayMode === 'stacked' ? 'flex-col gap-1' : '',
                isSelected
                  ? 'border-accent bg-accent/10 text-text'
                  : 'border-border bg-surface-2 text-text-2',
                disabled || !supports ? 'cursor-not-allowed opacity-30' : '',
                !disabled && exceeds && supports ? 'opacity-60' : '',
              ].filter(Boolean).join(' ')}
            >
              <ItemThumbnail
                typeName={typeName}
                name={it.name}
                size={thumbnailSize}
                bodyType={state.bodyType}
                catalog={catalog}
                palettes={palettes}
              />
              {replacementCardDisplayMode !== 'hidden' && (
                <span
                  data-visible-item-label="true"
                  className={[
                    'max-w-full truncate',
                    replacementCardDisplayMode === 'overlay'
                      ? 'absolute inset-x-1 bottom-1 rounded-sm bg-black/65 px-1 py-0.5 text-white'
                      : '',
                  ].filter(Boolean).join(' ')}
                >
                  {tl.itemName(it.name)}
                </span>
              )}
              {exceeds && supports && (
                <span className="absolute -top-1 -right-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-danger text-[8px] text-white" aria-label={exceedsTitle}>!</span>
              )}
            </button>
          );
        })}
      </div>

      {selectedItem && selection && (
        <div className="mt-2 rounded-md border border-border bg-surface-2 p-2">
          <ColorPicker
            disabled={disabled}
            item={selectedItem}
            selection={selection}
            palettes={palettes}
            colorLabel={t('picker.color')}
            styleLabel={t('picker.style')}
            tl={tl}
            onSelect={(change) => {
              if ('variant' in change) {
                dispatch({ type: 'pick', typeName, name: selectedItem.name, variant: change.variant });
              } else {
                dispatch({ type: 'pick', typeName, name: selectedItem.name, recolor: change.recolor });
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
```

- [x] **Step 2: Replace the embedded picker in LayerRow**

In `packages/web/src/components/layer-stack/layer-row.tsx`:

1. Remove these imports:

```ts
import { getRecolorSwatches } from '@lpc-toolkit/core';
import { pickActionForItem, type SliceState, type SliceAction } from '../../slice/selection';
import { itemSupportsBodyType } from '../../slice/catalog-tree';
import { itemMatchesLicenseFilter, type LicenseFilter } from '../../slice/license-filter';
import { itemMatchesAnimationFilter, type AnimationFilter } from '../../slice/animation-filter';
import { ColorPicker } from '../color-picker';
import {
  REPLACEMENT_CARD_DISPLAY_MODES,
  type ReplacementCardDisplayMode,
} from '../../lib/replacement-card-display-mode';
import type { TranslationKey } from '../../i18n';
```

2. Replace them with:

```ts
import { getRecolorSwatches, type Catalog, type ItemDefinition, type PaletteMetadata, type TypeName } from '@lpc-toolkit/core';
import type { SliceState, SliceAction } from '../../slice/selection';
import type { LabelTranslator, Translator } from '../../i18n';
import { type LicenseFilter } from '../../slice/license-filter';
import { type AnimationFilter } from '../../slice/animation-filter';
import type { ReplacementCardDisplayMode } from '../../lib/replacement-card-display-mode';
import { ItemThumbnail } from './item-thumbnail';
import { TypeItemPicker } from './type-item-picker';
```

3. Delete `DISPLAY_MODE_ICONS` and `DISPLAY_MODE_LABEL_KEYS`.

4. Replace the entire `{expanded && item && (() => { ... })()}` block with:

```tsx
      {expanded && (
        <TypeItemPicker
          disabled={disabled}
          typeName={typeName}
          catalog={catalog}
          palettes={palettes}
          state={state}
          dispatch={dispatch}
          tl={tl}
          t={t}
          licenseFilter={licenseFilter}
          animationFilter={animationFilter}
          replacementCardDisplayMode={replacementCardDisplayMode}
          onReplacementCardDisplayModeChange={onReplacementCardDisplayModeChange}
        />
      )}
```

Keep the collapsed `LayerRow` summary and clear button unchanged.

- [x] **Step 3: Run LayerRow tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- layer-row
```

Expected: PASS. The HTML output for display modes remains the same because `TypeItemPicker` preserves class names and labels.

- [x] **Step 4: Run the StackPanel test to confirm Task 1 is still failing only for missing inline entries**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- stack-panel
```

Expected: FAIL because `StackPanel` has not rendered `GroupTypeSlotEntries` yet. It should not fail because `LayerRow` replacement cards disappeared.

- [x] **Step 5: Commit the extraction**

Run:

```bash
rtk git add packages/web/src/components/layer-stack/type-item-picker.tsx packages/web/src/components/layer-stack/layer-row.tsx docs/superpowers/plans/2026-06-17-inline-group-asset-picker.md
rtk git commit -m "refactor: share type item picker"
```

**Implementation Note:**
- **Commit:** 5cb393614911d957388741364d9b1e988220f188
- **Verification:**
  - `rtk pnpm --filter @lpc-toolkit/web test -- layer-row`: PASS
  - `rtk pnpm --filter @lpc-toolkit/web test -- stack-panel`: FAIL (as expected, 5 failing tests because components/group-type-slot-entries do not exist yet)

---

### Task 3: Render Inline Group Type Slot Entries

**Files:**
- Create: `packages/web/src/components/layer-stack/group-type-slot-entries.tsx`
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`
- Test: `packages/web/test/stack-panel.test.tsx`

- [x] **Step 1: Create GroupTypeSlotEntries**

Create `packages/web/src/components/layer-stack/group-type-slot-entries.tsx` with this content:

```tsx
import type { Catalog, PaletteMetadata, TypeName } from '@lpc-toolkit/core';
import type { LabelTranslator, Translator } from '../../i18n';
import type { AnimationFilter } from '../../slice/animation-filter';
import { itemSupportsBodyType } from '../../slice/catalog-tree';
import type { LicenseFilter } from '../../slice/license-filter';
import type { SliceAction, SliceState } from '../../slice/selection';
import type { ReplacementCardDisplayMode } from '../../lib/replacement-card-display-mode';
import { TypeItemPicker } from './type-item-picker';

interface Props {
  disabled: boolean;
  typeNames: readonly TypeName[];
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  tl: LabelTranslator;
  t: Translator;
  licenseFilter: LicenseFilter;
  animationFilter: AnimationFilter;
  expanded: TypeName | null;
  setExpanded: (v: TypeName | null) => void;
  replacementCardDisplayMode: ReplacementCardDisplayMode;
  onReplacementCardDisplayModeChange: (mode: ReplacementCardDisplayMode) => void;
}

function selectedItemName(args: {
  catalog: Catalog;
  state: SliceState;
  typeName: TypeName;
}) {
  const selection = args.state.selections[args.typeName];
  if (!selection) return null;
  const item = (args.catalog.byTypeName.get(args.typeName) ?? []).find(
    (candidate) => candidate.name === selection.name,
  );
  return item?.name ?? selection.name;
}

function hasBodyCompatibleItem(args: {
  catalog: Catalog;
  state: SliceState;
  typeName: TypeName;
}) {
  return (args.catalog.byTypeName.get(args.typeName) ?? []).some((item) =>
    itemSupportsBodyType(item, args.state.bodyType),
  );
}

/** Inline add/replace entries for every type slot in one upstream group. */
export function GroupTypeSlotEntries({
  disabled,
  typeNames,
  catalog,
  palettes,
  state,
  dispatch,
  tl,
  t,
  licenseFilter,
  animationFilter,
  expanded,
  setExpanded,
  replacementCardDisplayMode,
  onReplacementCardDisplayModeChange,
}: Props) {
  if (typeNames.length === 0) return null;

  return (
    <div className="mt-1 space-y-1 px-1">
      <div className="flex flex-wrap gap-1">
        {typeNames.map((typeName) => {
          const currentName = selectedItemName({ catalog, state, typeName });
          const hasCompatible = hasBodyCompatibleItem({ catalog, state, typeName });
          const entryDisabled = disabled || !hasCompatible;
          const selected = expanded === typeName;
          const label = currentName
            ? `${tl.category(typeName)}: ${tl.itemName(currentName)} - Replace`
            : `+ ${tl.category(typeName)}`;

          return (
            <button
              key={typeName}
              type="button"
              disabled={entryDisabled}
              title={!hasCompatible ? t('picker.incompatibleBodyType') : label}
              aria-expanded={selected}
              onClick={() => setExpanded(selected ? null : typeName)}
              className={[
                'rounded-full border px-2.5 py-1 text-[11px]',
                selected
                  ? 'border-accent bg-accent/15 text-text'
                  : 'border-border bg-surface-2 text-text-2',
                entryDisabled
                  ? 'cursor-not-allowed opacity-40'
                  : 'hover:bg-surface-3 cursor-pointer',
              ].join(' ')}
            >
              {label}
            </button>
          );
        })}
      </div>

      {expanded && typeNames.includes(expanded) && (
        <div className="rounded-md border border-border bg-app pt-2">
          <TypeItemPicker
            disabled={disabled}
            typeName={expanded}
            catalog={catalog}
            palettes={palettes}
            state={state}
            dispatch={dispatch}
            tl={tl}
            t={t}
            licenseFilter={licenseFilter}
            animationFilter={animationFilter}
            replacementCardDisplayMode={replacementCardDisplayMode}
            onReplacementCardDisplayModeChange={onReplacementCardDisplayModeChange}
          />
        </div>
      )}
    </div>
  );
}
```

- [x] **Step 2: Wire the entries into StackPanel**

In `packages/web/src/components/layer-stack/stack-panel.tsx`:

1. Add this import:

```ts
import { GroupTypeSlotEntries } from './group-type-slot-entries';
```

2. Replace the expanded cleanup effect:

```ts
  useEffect(() => {
    if (expanded && !active.includes(expanded)) setExpanded(null);
  }, [expanded, active, setExpanded]);
```

with:

```ts
  useEffect(() => {
    if (expanded && !shownTypeNames.includes(expanded)) setExpanded(null);
  }, [expanded, shownTypeNames, setExpanded]);
```

3. Inside the `sections.map` callback, keep `activeTypeNames` and render `GroupTypeSlotEntries` after the selected rows. Replace the current selected row block with:

```tsx
              {activeTypeNames.length === 0 ? (
                <div className="px-2 py-1.5 text-[11px] text-text-dim">No layer selected</div>
              ) : (
                activeTypeNames.map((tn) => (
                  <LayerRow
                    key={tn}
                    disabled={disabled}
                    typeName={tn}
                    catalog={catalog}
                    palettes={palettes}
                    state={state}
                    dispatch={dispatch}
                    tl={tl}
                    t={t}
                    licenseFilter={licenseFilter}
                    animationFilter={animationFilter}
                    expanded={expanded === tn}
                    onToggle={() => setExpanded(expanded === tn ? null : tn)}
                    replacementCardDisplayMode={replacementCardDisplayMode}
                    onReplacementCardDisplayModeChange={onReplacementCardDisplayModeChange}
                  />
                ))
              )}
              <GroupTypeSlotEntries
                disabled={disabled}
                typeNames={section.typeNames}
                catalog={catalog}
                palettes={palettes}
                state={state}
                dispatch={dispatch}
                tl={tl}
                t={t}
                licenseFilter={licenseFilter}
                animationFilter={animationFilter}
                expanded={expanded}
                setExpanded={setExpanded}
                replacementCardDisplayMode={replacementCardDisplayMode}
                onReplacementCardDisplayModeChange={onReplacementCardDisplayModeChange}
              />
```

- [x] **Step 3: Run StackPanel tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- stack-panel
```

Expected: PASS.

- [x] **Step 4: Run LayerRow tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- layer-row
```

Expected: PASS.

- [x] **Step 5: Commit the inline entries**

Run:

```bash
rtk git add packages/web/src/components/layer-stack/group-type-slot-entries.tsx packages/web/src/components/layer-stack/stack-panel.tsx packages/web/test/stack-panel.test.tsx docs/superpowers/plans/2026-06-17-inline-group-asset-picker.md
rtk git commit -m "feat: add inline group asset picker"
```

**Implementation Note:**
- **Commit:** 09cb58c69e6712864d689e06889cae2f933a102e
- **Verification:**
  - `rtk pnpm --filter @lpc-toolkit/web test -- stack-panel`: PASS
  - `rtk pnpm --filter @lpc-toolkit/web test -- layer-row`: PASS

---

### Task 4: Final Verification and Manual Check

**Files:**
- Modify: `docs/superpowers/plans/2026-06-17-inline-group-asset-picker.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test -- stack-panel layer-row
```

Expected: PASS.

- [ ] **Step 2: Run the broader web test suite**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web test
```

Expected: PASS. If this command cannot be completed in the session, record the exact failure or timeout reason in the final verification note.

- [ ] **Step 3: Start the web app for manual verification**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/web dev
```

Expected: Vite prints a local URL such as `http://localhost:5173/`. Keep the server running until manual verification is complete.

- [ ] **Step 4: Verify manually in the browser**

Check these behaviors:

- Each upstream group still renders.
- Groups with no selected layer still show `No layer selected` plus add entries such as `+ Clothes`.
- A selected type slot appears as `{category}: {item} - Replace`.
- Clicking an unselected entry opens the picker without selecting the first item.
- Clicking a selected replace entry opens the picker with the current item highlighted.
- Picking another item updates the selected layer row and keeps color/style controls reachable.
- The bottom `AddLayer` control still exists and still works.

- [ ] **Step 5: Stop the dev server**

If the dev server was started in this session, stop it with `Ctrl-C` in the running shell session.

- [ ] **Step 6: Record final plan notes**

Under this task, add an implementation note with the actual output of `rtk git rev-parse --short HEAD` when a verification-only commit is created. If no verification-only commit is needed, write `Commit: covered by prior task commits`. Record the exact focused-test, broader-test, and manual-check status.

- [ ] **Step 7: Commit any plan-note-only updates**

If Step 6 changed only this plan file, commit it:

```bash
rtk git add docs/superpowers/plans/2026-06-17-inline-group-asset-picker.md
rtk git commit -m "docs: record inline group picker verification"
```

Expected: commit succeeds, or no commit is needed if no plan-note-only updates were made.

---

## Self-Review

- Spec coverage: Task 1 covers the expected selected/unselected entry behavior. Task 2 covers shared picker reuse. Task 3 wires entries into the upstream groups and allows unselected expanded picker state. Task 4 covers focused tests and manual add/replace verification.
- Placeholder scan: no intentionally incomplete implementation steps remain.
- Type consistency: `TypeItemPicker`, `GroupTypeSlotEntries`, `expanded: TypeName | null`, and `replacementCardDisplayMode` prop names are consistent across tasks.
