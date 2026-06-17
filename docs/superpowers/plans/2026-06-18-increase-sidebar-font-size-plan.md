# Increase Sidebar Font Sizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the LPC sprite builder's left sidebar components and right preview pane details from small hardcoded pixel values to standard, responsive Tailwind v4 semantic font-size classes.

**Architecture:** We will replace absolute size utility classes (such as `text-[9px]`, `text-[10px]`, `text-[11px]`, and `text-[12px]`) with `text-xs` (12px) and `text-sm` (14px) Tailwind utility classes inside the React component source files. This preserves semantic naming, layout styling constraints, and build/type integrity.

**Tech Stack:** React 18, TypeScript, Tailwind CSS v4

---

### Task 1: Update Sidebar Search Component

**Files:**
- Modify: `packages/web/src/components/layer-stack/sidebar-search.tsx`

- [x] **Step 1: Replace hardcoded font sizes in sidebar-search.tsx**
  - Commit: d3d0ffd57fabb623631cf3d3c251b41ab29538f4
  - Verification: pnpm typecheck PASS, unit tests PASS
  - Note: Replaced all custom pixel sizes with standard text-xs/text-sm in sidebar-search.tsx.

Replace `text-[12px]` with `text-sm`, `text-[10px]` with `text-xs`, and `text-[9px]` with `text-xs`.

Target content around line 172:
```tsx
          placeholder={t('palette.placeholder')}
          aria-label={t('palette.title')}
          className="flex-1 bg-transparent text-[12px] text-text outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        {licenseFilter.size < LICENSE_GROUP_ORDER.length && (
          <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-[10px] text-accent">
            {t('palette.licenseGroupsBadge').replace('{n}', String(licenseFilter.size))}
          </span>
        )}
        <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-text-dim">
          ⌘K
        </span>
```

Replacement content:
```tsx
          placeholder={t('palette.placeholder')}
          aria-label={t('palette.title')}
          className="flex-1 bg-transparent text-sm text-text outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        {licenseFilter.size < LICENSE_GROUP_ORDER.length && (
          <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-xs text-accent">
            {t('palette.licenseGroupsBadge').replace('{n}', String(licenseFilter.size))}
          </span>
        )}
        <span className="rounded border border-border px-1.5 py-0.5 font-mono text-xs text-text-dim">
          ⌘K
        </span>
```

Target content around line 193:
```tsx
            {shown.length === 0 ? (
              <div className="px-3 py-6 text-center text-[12px] text-text-mute">
                {t('palette.no_match')}
              </div>
```

Replacement content:
```tsx
            {shown.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-text-mute">
                {t('palette.no_match')}
              </div>
```

Target content around line 247:
```tsx
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
```

Replacement content:
```tsx
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 truncate text-sm font-semibold">
                        {tl.itemName(r.item.name)}
                        {!r.supports && (
                          <span className="rounded bg-amber-500/15 px-1 text-xs uppercase tracking-wide text-amber-500">
                            {t('palette.incompatible')}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs uppercase tracking-wide text-text-mute">
                        {tl.category(r.typeName)}
                        {itemLicense && <> · {itemLicense}</>}
                      </div>
                    </div>
```

Target content around line 267:
```tsx
          </div>
          <div className="flex items-center justify-between border-t border-border px-3 py-1 text-[10px] text-text-dim">
            <span>
              {shown.length} of {results.length}
            </span>
```

Replacement content:
```tsx
          </div>
          <div className="flex items-center justify-between border-t border-border px-3 py-1 text-xs text-text-dim">
            <span>
              {shown.length} of {results.length}
            </span>
```

- [x] **Step 2: Verify typecheck passes**
  - Commit: d3d0ffd57fabb623631cf3d3c251b41ab29538f4
  - Verification: pnpm typecheck PASS

Run: `rtk pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS with no errors.

- [x] **Step 3: Run unit tests**
  - Commit: d3d0ffd57fabb623631cf3d3c251b41ab29538f4
  - Verification: pnpm test PASS

Run: `rtk pnpm --filter @lpc-toolkit/web test`
Expected: PASS

- [x] **Step 4: Commit**
  - Commit: d3d0ffd57fabb623631cf3d3c251b41ab29538f4
  - Verification: Commit succeeded with hash d3d0ffd57fabb623631cf3d3c251b41ab29538f4

```bash
git add packages/web/src/components/layer-stack/sidebar-search.tsx
git commit -m "feat(web): migrate sidebar search font sizes to standard Tailwind scale"
```


---

### Task 2: Update Preset Bar, Stack Panel, and Add Layer Components

**Files:**
- Modify: `packages/web/src/components/layer-stack/preset-bar.tsx`
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`
- Modify: `packages/web/src/components/layer-stack/add-layer.tsx`

- [x] **Step 1: Replace hardcoded font sizes in preset-bar.tsx**
  - Commit: e632042ee
  - Verification: pnpm typecheck PASS, unit tests PASS
  - Note: Replaced all custom pixel sizes with standard text-sm in preset-bar.tsx.

Replace `text-[12px]` with `text-sm`.

Target content around line 44:
```tsx
          className="rounded border border-border bg-surface-2 px-2 py-1 text-[12px] hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-2"
        >
          🎲
        </button>
        <button
          ref={presetTriggerRef}
          type="button"
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={presetOpen}
          onClick={() => setPresetOpen(!presetOpen)}
          className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-2 py-1 text-[12px] hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-2"
        >
          <span>{t('preset.title')}</span>
          <span aria-hidden>▼</span>
        </button>
        <button
          ref={resetTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={resetOpen}
          onClick={() => setResetOpen(!resetOpen)}
          className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-2 py-1 text-[12px] hover:bg-surface-3"
        >
```

Replacement content:
```tsx
          className="rounded border border-border bg-surface-2 px-2 py-1 text-sm hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-2"
        >
          🎲
        </button>
        <button
          ref={presetTriggerRef}
          type="button"
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={presetOpen}
          onClick={() => setPresetOpen(!presetOpen)}
          className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-2 py-1 text-sm hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-2"
        >
          <span>{t('preset.title')}</span>
          <span aria-hidden>▼</span>
        </button>
        <button
          ref={resetTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={resetOpen}
          onClick={() => setResetOpen(!resetOpen)}
          className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-2 py-1 text-sm hover:bg-surface-3"
        >
```

- [x] **Step 2: Replace hardcoded font sizes in stack-panel.tsx**
  - Commit: e632042ee
  - Verification: pnpm typecheck PASS, unit tests PASS
  - Note: Replaced all custom pixel sizes with standard text-xs/text-sm in stack-panel.tsx.

Replace `text-[10px]` with `text-xs`, `text-[12px]` with `text-sm`, and `text-[11px]` with `text-xs`.

Target content around line 133:
```tsx
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text">
          {t('layers.title')}
        </span>
        <span className="font-mono text-[10px] text-text-mute">
          {active.length} {t('layers.on')} · {inactive.length} {t('layers.off')}
        </span>
      </div>
```

Replacement content:
```tsx
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-text">
          {t('layers.title')}
        </span>
        <span className="font-mono text-xs text-text-mute">
          {active.length} {t('layers.on')} · {inactive.length} {t('layers.off')}
        </span>
      </div>
```

Target content around line 150:
```tsx
            <section key={section.id} className="border-b border-border-strong/60 py-3 last:border-b-0">
              <div className="mb-1 rounded-md bg-surface px-2 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-text-2">
                {section.label}
              </div>
              {activeTypeNames.length === 0 ? (
                <div className="px-2 py-1.5 text-[11px] text-text-dim">No layer selected</div>
              ) : (
```

Replacement content:
```tsx
            <section key={section.id} className="border-b border-border-strong/60 py-3 last:border-b-0">
              <div className="mb-1 rounded-md bg-surface px-2 py-1.5 text-sm font-semibold uppercase tracking-wide text-text-2">
                {section.label}
              </div>
              {activeTypeNames.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-text-dim">No layer selected</div>
              ) : (
```

- [x] **Step 3: Replace hardcoded font sizes in add-layer.tsx**
  - Commit: e632042ee
  - Verification: pnpm typecheck PASS, unit tests PASS
  - Note: Replaced all custom pixel sizes with standard text-xs/text-sm in add-layer.tsx.

Replace `text-[12px]` with `text-sm`, `text-[11px]` with `text-xs`, and `text-[10px]` with `text-xs`.

Target content around line 32 in `packages/web/src/components/layer-stack/add-layer.tsx`:
```tsx
        className="mt-2 mb-2 flex w-full items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-[12px] text-text-mute hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        onClick={() => setAdding(true)}
      >
        <span>+ {t('addLayer.button')}</span>
        <span className="ml-auto font-mono text-[10px]">
          ⌘A
        </span>
```

Replacement content:
```tsx
        className="mt-2 mb-2 flex w-full items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-text-mute hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        onClick={() => setAdding(true)}
      >
        <span>+ {t('addLayer.button')}</span>
        <span className="ml-auto font-mono text-xs">
          ⌘A
        </span>
```

Target content around line 53 in `packages/web/src/components/layer-stack/add-layer.tsx`:
```tsx
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-mute">
          {t('addLayer.title')}
        </span>
        <button
          type="button"
          onClick={() => setAdding(false)}
          className="ml-auto rounded px-2 py-1 text-[11px] text-text-mute hover:bg-surface-2"
        >
          Cancel
        </button>
      </div>

      <div className="max-h-[calc(100vh-14rem)] overflow-y-auto p-2">
        {inactive.length === 0 ? (
          <div className="px-2 py-2 text-[11px] text-text-mute">
            No remaining compatible layers to add.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
```

Replacement content:
```tsx
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-mute">
          {t('addLayer.title')}
        </span>
        <button
          type="button"
          onClick={() => setAdding(false)}
          className="ml-auto rounded px-2 py-1 text-xs text-text-mute hover:bg-surface-2"
        >
          Cancel
        </button>
      </div>

      <div className="max-h-[calc(100vh-14rem)] overflow-y-auto p-2">
        {inactive.length === 0 ? (
          <div className="px-2 py-2 text-xs text-text-mute">
            No remaining compatible layers to add.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
```

Target content around line 67 in `packages/web/src/components/layer-stack/add-layer.tsx`:
```tsx
              return (
                <div key={section.id} className="w-full">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
                    {section.label}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
```

Replacement content:
```tsx
              return (
                <div key={section.id} className="w-full">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-mute">
                    {section.label}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
```

Target content around line 95 in `packages/web/src/components/layer-stack/add-layer.tsx`:
```tsx
                  className={[
                    'rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px]',
                    'hover:bg-surface-3 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40',
                  ].join(' ')}
```

Replacement content:
```tsx
                  className={[
                    'rounded-full border border-border bg-surface-2 px-3 py-1 text-xs',
                    'hover:bg-surface-3 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40',
                  ].join(' ')}
```

- [x] **Step 4: Verify typecheck passes**
  - Commit: e632042ee
  - Verification: pnpm typecheck PASS

Run: `rtk pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS with no errors.

- [x] **Step 5: Run unit tests**
  - Commit: e632042ee
  - Verification: pnpm test PASS

Run: `rtk pnpm --filter @lpc-toolkit/web test`
Expected: PASS

- [x] **Step 6: Commit**
  - Commit: e632042ee
  - Verification: Commit succeeded with hash e632042ee

```bash
git add packages/web/src/components/layer-stack/preset-bar.tsx packages/web/src/components/layer-stack/stack-panel.tsx packages/web/src/components/layer-stack/add-layer.tsx
git commit -m "feat(web): update font sizes in PresetBar, StackPanel, and AddLayer components"
```

---

### Task 3: Update Layer Row, Collapsible Group Slots, Color Picker, and Item Picker Components

**Files:**
- Modify: `packages/web/src/components/layer-stack/layer-row.tsx`
- Modify: `packages/web/src/components/layer-stack/group-type-slot-entries.tsx`
- Modify: `packages/web/src/components/color-picker.tsx`
- Modify: `packages/web/src/components/layer-stack/type-item-picker.tsx`

- [x] **Step 1: Replace hardcoded font sizes in layer-row.tsx**
  - Commit: 0dba1459e
  - Verification: pnpm typecheck PASS, unit tests PASS
  - Note: Replaced all custom pixel sizes with standard text-xs/text-sm in layer-row.tsx.

Replace `text-[12px]` with `text-sm`, and `text-[10px]` with `text-xs`.

Target content around line 80:
```tsx
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-text">
            {item ? tl.itemName(item.name) : selection.name}
          </div>
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-text-mute">
            <span>{tl.category(typeName)}</span>
```

Replacement content:
```tsx
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-text">
            {item ? tl.itemName(item.name) : selection.name}
          </div>
          <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-text-mute">
            <span>{tl.category(typeName)}</span>
```

Target content around line 140:
```tsx
          aria-label={`Clear ${typeName}`}
        >
          ✕
        </span>
        <span className="text-[10px] text-text-mute">{expanded ? '▾' : '▸'}</span>
      </button>
```

Replacement content:
```tsx
          aria-label={`Clear ${typeName}`}
        >
          ✕
        </span>
        <span className="text-xs text-text-mute">{expanded ? '▾' : '▸'}</span>
      </button>
```

- [x] **Step 2: Replace hardcoded font sizes in group-type-slot-entries.tsx**
  - Commit: 0dba1459e
  - Verification: pnpm typecheck PASS, unit tests PASS
  - Note: Replaced all custom pixel sizes with standard text-sm in group-type-slot-entries.tsx.

Replace `text-[12px]` with `text-sm`.

Target content around line 105:
```tsx
        className={[
          'flex w-full items-center justify-between rounded-md border px-2.5 py-1.5',
          'text-left text-[12px] font-medium',
          sectionOpen
```

Replacement content:
```tsx
        className={[
          'flex w-full items-center justify-between rounded-md border px-2.5 py-1.5',
          'text-left text-sm font-medium',
          sectionOpen
```

Target content around line 138:
```tsx
              return (
                <button
                  key={typeName}
                  type="button"
                  disabled={entryDisabled}
                  title={!hasCompatible ? t('picker.incompatibleBodyType') : label}
                  aria-expanded={selected}
                  onClick={() => setExpanded(selected ? null : typeName)}
                  className={[
                    'rounded-full border px-3 py-1.5 text-[12px]',
                    selected
```

Replacement content:
```tsx
              return (
                <button
                  key={typeName}
                  type="button"
                  disabled={entryDisabled}
                  title={!hasCompatible ? t('picker.incompatibleBodyType') : label}
                  aria-expanded={selected}
                  onClick={() => setExpanded(selected ? null : typeName)}
                  className={[
                    'rounded-full border px-3 py-1.5 text-sm',
                    selected
```

- [x] **Step 3: Replace hardcoded font sizes in color-picker.tsx**
  - Commit: 0dba1459e
  - Verification: pnpm typecheck PASS, unit tests PASS
  - Note: Replaced all custom pixel sizes with standard text-xs in color-picker.tsx.

Replace `text-[11px]` with `text-xs`.

Target content around line 70:
```tsx
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                aria-pressed={opt.value === selection?.variant}
                className={`rounded border border-border px-1.5 py-0.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-50 ${
                  opt.value === selection?.variant
```

Replacement content:
```tsx
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                aria-pressed={opt.value === selection?.variant}
                className={`rounded border border-border px-1.5 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${
                  opt.value === selection?.variant
```

- [x] **Step 4: Replace hardcoded font sizes in type-item-picker.tsx**
  - Commit: 0dba1459e
  - Verification: pnpm typecheck PASS, unit tests PASS
  - Note: Replaced custom pixel sizes with standard text-xs in type-item-picker.tsx.

Replace `text-[10px]` with `text-xs`, `text-[9px]` with `text-xs`, and `text-[8px]` with `text-xs`.

Target content around line 74:
```tsx
    <div className="px-2 pb-2">
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <div className="mr-auto text-[10px] uppercase tracking-wide text-text-mute">
          {t('layer.swap').replace('{name}', tl.category(typeName))}
        </div>
```

Replacement content:
```tsx
    <div className="px-2 pb-2">
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <div className="mr-auto text-xs uppercase tracking-wide text-text-mute">
          {t('layer.swap').replace('{name}', tl.category(typeName))}
        </div>
```

Target content around line 92:
```tsx
              <button
                key={mode}
                type="button"
                aria-pressed={selected}
                onClick={() => onReplacementCardDisplayModeChange(mode)}
                className={[
                  'inline-flex items-center gap-1 rounded border px-1.5 py-0.5',
                  'text-[9px] focus-visible:outline-none focus-visible:ring-1',
                  'focus-visible:ring-accent',
```

Replacement content:
```tsx
              <button
                key={mode}
                type="button"
                aria-pressed={selected}
                onClick={() => onReplacementCardDisplayModeChange(mode)}
                className={[
                  'inline-flex items-center gap-1 rounded border px-1.5 py-0.5',
                  'text-xs focus-visible:outline-none focus-visible:ring-1',
                  'focus-visible:ring-accent',
```

Target content around line 140:
```tsx
              className={[
                'relative flex h-16 items-center justify-center overflow-hidden',
                'rounded-md border p-1 text-[10px]',
                replacementCardDisplayMode === 'stacked' ? 'flex-col gap-1' : '',
```

Replacement content:
```tsx
              className={[
                'relative flex h-16 items-center justify-center overflow-hidden',
                'rounded-md border p-1 text-xs',
                replacementCardDisplayMode === 'stacked' ? 'flex-col gap-1' : '',
```

Target content around line 171:
```tsx
              {exceeds && supports && (
                <span className="absolute -top-1 -right-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-danger text-[8px] text-white" aria-label={exceedsTitle}>!</span>
              )}
```

Replacement content:
```tsx
              {exceeds && supports && (
                <span className="absolute -top-1 -right-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-danger text-xs text-white" aria-label={exceedsTitle}>!</span>
              )}
```

- [x] **Step 5: Verify typecheck passes**
  - Commit: 0dba1459e
  - Verification: pnpm typecheck PASS

Run: `rtk pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS with no errors.

- [x] **Step 6: Run unit tests**
  - Commit: 0dba1459e
  - Verification: pnpm test PASS

Run: `rtk pnpm --filter @lpc-toolkit/web test`
Expected: PASS

- [x] **Step 7: Commit**
  - Commit: 0dba1459e
  - Verification: Commit succeeded with hash 0dba1459e

```bash
git add packages/web/src/components/layer-stack/layer-row.tsx packages/web/src/components/layer-stack/group-type-slot-entries.tsx packages/web/src/components/color-picker.tsx packages/web/src/components/layer-stack/type-item-picker.tsx
git commit -m "feat(web): update font sizes in LayerRow, GroupTypeSlotEntries, ColorPicker, and TypeItemPicker"
```

---

### Task 4: Align Font Sizes in Right Preview Pane Component

**Files:**
- Modify: `packages/web/src/components/layer-stack/preview-pane.tsx`

- [ ] **Step 1: Replace hardcoded font sizes in preview-pane.tsx**

Replace `text-[10px]` with `text-xs`, `text-[9px]` with `text-xs`, and `text-[11px]` with `text-xs`.

Target content around line 186:
```tsx
        <span className="ml-auto whitespace-nowrap font-mono text-[10px] text-text-mute">
          f{String(currentFrame + 1).padStart(2, '0')}/
          {String(totalFrames).padStart(2, '0')} · {fps}fps
        </span>
```

Replacement content:
```tsx
        <span className="ml-auto whitespace-nowrap font-mono text-xs text-text-mute">
          f{String(currentFrame + 1).padStart(2, '0')}/
          {String(totalFrames).padStart(2, '0')} · {fps}fps
        </span>
```

Target content around line 238:
```tsx
                  <canvas ref={ref} className="image-render-pixel max-h-full max-w-full" />
                  <div className="absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-white/90">
                    {t(`direction.${dir}`)} ({DIR_SHORT[dir]})
                  </div>
```

Replacement content:
```tsx
                  <canvas ref={ref} className="image-render-pixel max-h-full max-w-full" />
                  <div className="absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-xs text-white/90">
                    {t(`direction.${dir}`)} ({DIR_SHORT[dir]})
                  </div>
```

Target content around line 260:
```tsx
                <span className="text-xs font-medium text-text">
                  {t('composition.loading')}
                </span>
                <span className="font-mono text-[11px] text-text-mute">
                  {progressPercent}%
                </span>
```

Replacement content:
```tsx
                <span className="text-xs font-medium text-text">
                  {t('composition.loading')}
                </span>
                <span className="font-mono text-xs text-text-mute">
                  {progressPercent}%
                </span>
```

Target content around line 266:
```tsx
          <div className="absolute top-3 left-3 z-10 rounded bg-black/40 px-2 py-0.5 font-mono text-[10px] text-white/90 backdrop-blur-md">
            {state.anim} · {state.layout === 'single' ? `${DIR_SHORT[state.dir]} · ` : ''}{state.zoom}× · f{String(currentFrame + 1).padStart(2, '0')}
          </div>
```

Replacement content:
```tsx
          <div className="absolute top-3 left-3 z-10 rounded bg-black/40 px-2 py-0.5 font-mono text-xs text-white/90 backdrop-blur-md">
            {state.anim} · {state.layout === 'single' ? `${DIR_SHORT[state.dir]} · ` : ''}{state.zoom}× · f{String(currentFrame + 1).padStart(2, '0')}
          </div>
```

Target content around line 277:
```tsx
            <button
              type="button"
              disabled={state.zoom <= MIN_ZOOM}
              aria-label={t('controls.zoomOut')}
              onClick={() =>
                dispatch({ type: 'set_zoom', zoom: state.zoom - 1 })
              }
              className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white/90 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              −
            </button>
            {[1, 2, 4, 8].map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => dispatch({ type: 'set_zoom', zoom: z })}
                className={[
                  'rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold',
                  state.zoom === z
                    ? 'bg-accent text-accent-ink'
                    : 'text-white/90 hover:bg-white/10',
                ].join(' ')}
              >
                {z}×
              </button>
            ))}
            <button
              type="button"
              disabled={state.zoom >= MAX_ZOOM}
              aria-label={t('controls.zoomIn')}
              onClick={() =>
                dispatch({ type: 'set_zoom', zoom: state.zoom + 1 })
              }
              className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white/90 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent"
            >
```

Replacement content:
```tsx
            <button
              type="button"
              disabled={state.zoom <= MIN_ZOOM}
              aria-label={t('controls.zoomOut')}
              onClick={() =>
                dispatch({ type: 'set_zoom', zoom: state.zoom - 1 })
              }
              className="rounded px-1.5 py-0.5 font-mono text-xs font-semibold text-white/90 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              −
            </button>
            {[1, 2, 4, 8].map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => dispatch({ type: 'set_zoom', zoom: z })}
                className={[
                  'rounded px-1.5 py-0.5 font-mono text-xs font-semibold',
                  state.zoom === z
                    ? 'bg-accent text-accent-ink'
                    : 'text-white/90 hover:bg-white/10',
                ].join(' ')}
              >
                {z}×
              </button>
            ))}
            <button
              type="button"
              disabled={state.zoom >= MAX_ZOOM}
              aria-label={t('controls.zoomIn')}
              onClick={() =>
                dispatch({ type: 'set_zoom', zoom: state.zoom + 1 })
              }
              className="rounded px-1.5 py-0.5 font-mono text-xs font-semibold text-white/90 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent"
            >
```

- [ ] **Step 2: Verify typecheck passes**

Run: `rtk pnpm --filter @lpc-toolkit/web typecheck`
Expected: PASS with no errors.

- [ ] **Step 3: Run unit tests**

Run: `rtk pnpm --filter @lpc-toolkit/web test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/layer-stack/preview-pane.tsx
git commit -m "feat(web): migrate preview pane status and zoom controls to standard Tailwind scale"
```

---

### Task 5: Integration Check and Clean Up

- [ ] **Step 1: Run full linting, typecheck, and formatting tests**

Run: `rtk pnpm --filter @lpc-toolkit/web typecheck`
Run: `rtk pnpm --filter @lpc-toolkit/web test`
Expected: ALL PASS.

- [ ] **Step 2: Stop Visual Companion Server**

Stop the companion server task using the `manage_task` kill action or run script:
Run: `rtk /Users/william/.gemini/config/plugins/superpowers/skills/brainstorming/scripts/stop-server.sh`
