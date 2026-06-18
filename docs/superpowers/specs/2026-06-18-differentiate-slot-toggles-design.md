# Design Spec: Differentiate Slot Toggles vs Active Layer Items

## Context & Problem Statement
Currently, both active layer rows (e.g., Body Color, Hair, Torso) and the group collapsible "Show/Hide slots" buttons in the left sidebar share the same visual structure: they both use the background `--surface-2` (mapped to Tailwind `bg-surface-2`) and border `--border` (mapped to Tailwind `border-border`). Because of this, it is hard for users to quickly distinguish between an already active/selected layer and a collapsible slot toggle container trigger, reducing visual hierarchy and dashboard clarity.

## Goal
Establish a clear visual hierarchy by differentiating the active layer rows from secondary/utility slot toggle triggers.
We will achieve this by combining:
1. **Highlighting active selections**: Add a distinctive left border highlight using the primary theme accent color on active layer rows.
2. **De-emphasizing collapsible slot triggers**: Style the "Show/Hide slots" toggle buttons with a dashed border, transparent background, and muted text color (flat/dashed style), similar to the existing `AddLayer` style.

## Design Details

### 1. Active Selection Accent Bar (`packages/web/src/components/layer-stack/layer-row.tsx`)
We will update the wrapper `div` of `LayerRow` to add `border-l-4 border-l-accent`.
For visual alignment and weight spacing, we will adjust the left padding from `p-2.5` to `pl-2` so the layout remains balanced:
```diff
 <div
-  className="mb-2 rounded-lg border border-border bg-surface-2 p-2.5 transition hover:bg-surface-3 shadow-sm flex flex-col gap-1"
+  className="mb-2 rounded-lg border border-border border-l-4 border-l-accent bg-surface-2 p-2.5 pl-2 transition hover:bg-surface-3 shadow-sm flex flex-col gap-1"
 >
```

### 2. Flat/Dashed Style for Slot Toggles (`packages/web/src/components/layer-stack/group-type-slot-entries.tsx`)
We will style the collapsible slot toggle button to use a transparent background (`bg-transparent`), dashed border (`border-dashed`), and muted text (`text-text-mute`).
On hover, we will transition it to a solid background (`hover:bg-surface-2`), standard text color (`hover:text-text`), and strong border (`hover:border-border-strong` or `hover:border-border`):
```diff
 <button
   type="button"
   disabled={isDisabled}
   aria-expanded={sectionOpen}
   onClick={onToggleSection}
   className={[
-    'flex w-full items-center justify-between rounded-md bg-surface-2 border border-border px-3 py-2 text-left text-xs font-semibold text-text-2',
-    isDisabled
-      ? 'cursor-not-allowed opacity-40'
-      : 'hover:bg-surface-3 cursor-pointer',
+    'flex w-full items-center justify-between rounded-md bg-transparent border border-dashed border-border px-3 py-2 text-left text-xs font-semibold text-text-mute transition-colors',
+    isDisabled
+      ? 'cursor-not-allowed opacity-40'
+      : 'hover:bg-surface-2 hover:text-text hover:border-border cursor-pointer',
   ].join(' ')}
 >
```

## Testing & Verification
- Perform a local build and inspect the layout visually.
- Verify that active layers are highlighted clearly with the left-accent strip, and slot toggle buttons appear correctly as dashed triggers.
- Run `pnpm typecheck` and any existing workspace unit/integration tests to ensure no regressions.
