# Design Spec: Indent Unselected Slots and Nested Items

## Context & Problem Statement
Currently, the unselected slots toggle button and the inactive slot item buttons in the left sidebar are aligned very close to the left boundary of their categories (with only a `px-1` padding). This lacks visual hierarchy and makes it hard to distinguish these collapsible, secondary slots from primary selections and category sections.

## Goal
Improve visual nesting and dashboard hierarchy by adding structured indentation:
1. Indent the "Show/Hide slots" collapsible toggle button by `pl-2` (8px).
2. Indent the inactive slot items inside the expanded list (e.g. `+ clothing`) by an additional `pl-2` (8px), creating a nested hierarchy.

## Design Details

### 1. Toggle Button Indentation (`packages/web/src/components/layer-stack/group-type-slot-entries.tsx`)
We will change the padding class of the wrapper `div` of `GroupTypeSlotEntries` from `px-1` to `pl-2 pr-1`:
```diff
-    <div className="mt-1 space-y-1 px-1">
+    <div className="mt-1 space-y-1 pl-2 pr-1">
```

### 2. Nested Inactive Slots Indentation (`packages/web/src/components/layer-stack/group-type-slot-entries.tsx`)
We will add `pl-2` to the inner container `div` that wraps the inactive slot item list when the section is expanded:
```diff
-      {sectionOpen && (
-        <div className="flex flex-col gap-1.5 mt-1.5">
+      {sectionOpen && (
+        <div className="flex flex-col gap-1.5 mt-1.5 pl-2">
```

## Testing & Verification
- Verify that both the unselected slots toggle buttons and active nested slot buttons appear correctly indented with visual nesting.
- Verify unit tests and ensure typechecks pass.
