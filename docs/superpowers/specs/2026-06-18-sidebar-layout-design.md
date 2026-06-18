# Design Spec: Left Asset Sidebar Layout Optimization

**Date**: 2026-06-18  
**Feature Branch**: `feature/sidebar-layout-optimization`  
**Status**: User Approved (Option B - Screenshot-Inspired Layout)

---

## 1. Problem & Context

The current LPC Toolkit left sidebar displays layer management (active selections, empty slots, search) using a vertical layout with text buttons and rounded capsule pill tags. Specifically:
- Active layer rows (`LayerRow`) are displayed as flat items with generic borders and small actions.
- Inactive slots are shown via `GroupTypeSlotEntries` using inline pill buttons (e.g. `+ Ears`, `+ Eyes`), which can look cluttered when a category has many empty slots.
- The styling does not leverage card-like elevation, shadows, or unified layouts matching modern dark-mode application designs.

The user provided a screenshot reference showing a sleek, modern, card-based layer selection layout that groups layers under category headers. Active items are prominent cards with thumbnails, status tags (recolor swatches), a clear button (`✕`), and a toggle/play button (`▶`). Empty slots/options are collapsed behind neat, full-width buttons ("Show X slots").

---

## 2. Requirements & Goals

- **Card-based Active Selections**: Re-style `LayerRow.tsx` to render as distinct card-like elements with background, padding, subtle borders, and hover effects.
- **Improved Metadata Placement**: Place the slot type name (e.g., `BODY`, `HEAD`, `HAIR`) alongside the recolor color swatches as a unified subtitle row on the card.
- **Sleek Action Layout**: Standardize action buttons on the right side of the card (clear `✕` and expand arrow `▶`).
- **Clean Inactive Slot Handling**: Re-style `GroupTypeSlotEntries.tsx` so the "Show X slots" toggle is a sleek, full-width button.
- **Consistent Empty Categories**: Display a subtle, styled placeholder ("No layer selected") when a category has no active layers, match the screenshot design.
- **Theme Support**: Ensure the layout works seamlessly in both light and dark themes using Tailwind CSS utilities.

---

## 3. UI Component Changes

### 3.1 `LayerRow.tsx`

```tsx
// Proposed layout snippet
<div className="mb-2 rounded-lg border border-border/40 bg-card p-2.5 shadow-sm transition hover:bg-accent/5">
  <div className="flex items-center gap-3">
    {/* Item Thumbnail */}
    <ItemThumbnail ... />
    
    {/* Name and Meta */}
    <div className="min-w-0 flex-1">
      <div className="text-sm font-semibold text-foreground truncate">{itemName}</div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase font-medium mt-0.5">
        <span>{category}</span>
        {swatches}
      </div>
    </div>
    
    {/* Actions */}
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" onClick={onClear}>✕</Button>
      <Button variant="ghost" size="icon" onClick={onToggle}>▶</Button>
    </div>
  </div>
  
  {/* Expanded Item Picker */}
  {expanded && <TypeItemPicker ... />}
</div>
```

### 3.2 `GroupTypeSlotEntries.tsx`

- Change the toggle button from a simple border button to a full-width flat panel button with `▶` icon.
- List empty slots vertically as clean, subtle cards/placeholders rather than wrap-around pill tags when expanded.

### 3.3 `StackPanel.tsx`

- Adjust the layout and spacing between sections (e.g., BODY, HEAD, HAIR, HEADWEAR).
- Ensure categories without active selections show a clean "No layer selected" placeholder above the "Show X slots" button.

---

## 4. Verification Plan

1. **Visual Inspection**: Use the web interface to verify sidebar layout alignment, card padding, action icons, and text vertical alignment.
2. **Keyboard Navigation**: Ensure keyboard shortcuts (Esc, arrow keys, Enter) in the search dropdown and layer pickers function identically to current behaviors.
3. **Responsive Check**: Verify that the sidebar behaves correctly under mobile layouts and different width adjustments using the splitter handle.
4. **Type Check**: Run `pnpm typecheck` to confirm TypeScript compatibility.
5. **Lint Check**: Run `pnpm lint` to ensure style rules are adhered to.
