# Design Spec: Increase Sidebar Font Sizing using Standard Tailwind Scale

## Context & Problem Statement
Currently, the LPC Sprite composition web UI contains text elements with hardcoded tiny pixel sizing (9px, 10px, 11px, 12px) in the left asset selection column. On many monitors and screens, these font sizes are extremely small and hard to read, creating a strain on user experience.

## Goal
Improve reading comfort by migrating the asset selection column (and aligned canvas/status elements) from tiny absolute pixel font sizes to standard, semantic Tailwind v4 font-size classes. Specifically, we will scale up text elements to standard `text-xs` (12px) and `text-sm` (14px) sizes.

## Design Details

### 1. Large Text & Interactive Triggers (`text-sm` / 14px)
We will increase the size of interactive input fields, selectors, buttons, and section headers in the left sidebar from `12px` to `14px` (`text-sm`):
- **Search Input Field**: Change `text-[12px]` to `text-sm` in `packages/web/src/components/layer-stack/sidebar-search.tsx`.
- **Sidebar Control Buttons**: Change randomize, preset, and reset button labels from `text-[12px]` to `text-sm` in `packages/web/src/components/layer-stack/preset-bar.tsx`.
- **Collapsible Section Headers**: Change group category header text from `text-[12px]` to `text-sm` in `packages/web/src/components/layer-stack/stack-panel.tsx`.
- **Category Action Buttons**: Change collapsible group toggles (e.g. "Hide 7 slots") and subcategory selection buttons (e.g. "+ hair") from `text-[12px]` to `text-sm` in `packages/web/src/components/layer-stack/group-type-slot-entries.tsx`.
- **Add Layer Trigger**: Change add custom layer button text from `text-[12px]` to `text-sm` in `packages/web/src/components/layer-stack/add-layer.tsx`.
- **Active Layer Title**: Change selected active layer name text from `text-[12px]` to `text-sm` in `packages/web/src/components/layer-stack/layer-row.tsx`.

### 2. Medium Labels, Metadata & Grid Labels (`text-xs` / 12px)
We will increase grid asset thumbnail labels, tag details, and uppercase labels from `10px/11px` to `12px` (`text-xs`):
- **Asset Item Labels**: Change grid card names from `text-[10px]` to `text-xs` in `packages/web/src/components/layer-stack/type-item-picker.tsx`.
- **Search Results Dropdown**: Change dropdown items to `text-sm` (14px) for titles, `text-xs` (12px) for categories/sub-labels, and `text-xs` (12px) for footer status in `packages/web/src/components/layer-stack/sidebar-search.tsx`.
- **Active Layer Subtext**: Change active layer sub-labels (such as category names, selected variant name, and color swatch indicator blocks) from `text-[10px]` to `text-xs` in `packages/web/src/components/layer-stack/layer-row.tsx`.
- **Display Mode Controls**: Change the "Stacked", "Overlay", "Hidden" segment button text from `text-[9px]` to `text-xs` in `packages/web/src/components/layer-stack/type-item-picker.tsx`.
- **Color Picker Details**: Change variant option pills and swatch category labels from `text-[11px]/text-xs` to `text-xs` in `packages/web/src/components/color-picker.tsx`.
- **Shortcut & License Badges**: Change search tags (`⌘K`, `⌘A` and license count badges) from `text-[10px]` to `text-xs`.
- **Layer Panel Title & Count**: Change the "YOUR LAYERS" header and active layer counters from `text-[10px]` to `text-xs` in `packages/web/src/components/layer-stack/stack-panel.tsx`.

### 3. Canvas Controls & Metadata Alignment
For design consistency, we will also align status and details on the right preview pane to standard size variables:
- **Frame details / FPS text**: Change `text-[10px]` to `text-xs` in `packages/web/src/components/layer-stack/preview-pane.tsx`.
- **Canvas grid indices and zoom button controls**: Change `text-[9px]/text-[10px]` to `text-xs` in `packages/web/src/components/layer-stack/preview-pane.tsx`.

## Testing & Verification
- Run a local static build and verify there are no layout regressions, font collisions, or button overlaps in the left sidebar under English and Traditional Chinese locales.
- Run typecheck and existing visual or E2E tests (`pnpm typecheck` and playwright tests) to verify build integrity.
