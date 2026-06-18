# Design Spec: Inline Inactive Slot Picker Layout

**Date**: 2026-06-18  
**Feature Branch**: `feature/sidebar-layout-optimization`  
**Status**: Proposal (UX refinement for slot picker)

---

## 1. Problem & Context

Currently, when a category slot is inactive (e.g. `wings` is not selected), clicking on its placeholder button in the "Show X slots" list sets the expanded slot `typeName` to `wings`.
However, the `TypeItemPicker` is rendered at the very bottom of the slots list inside `GroupTypeSlotEntries.tsx`. If a section has many slots (e.g. 15 slots in the BODY section), the style/item picker appears very far down the sidebar, forcing the user to scroll down to select their style.

---

## 2. Requirements & Goals

- **Inline Style Picker**: Render the `TypeItemPicker` for inactive slots directly under the clicked placeholder button in the list of slots, rather than at the bottom of the slots list.
- **Consistent Layout**: Wrap each slot list entry in a column flex wrapper (`div`), maintaining the card theme.
- **Remove Bottom Picker**: Clean up the redundant bottom-level rendering of the style picker in `GroupTypeSlotEntries.tsx`.
- **Verify Test Compliance**: Ensure all unit tests in `group-type-slot-entries.test.tsx` pass successfully.

---

## 3. UI Component Changes

### `GroupTypeSlotEntries.tsx`

- Wrap the list map item in a `<div key={typeName} className="w-full flex flex-col gap-1">` element.
- Render the `TypeItemPicker` component inside this wrapper if the slot is selected/expanded and does not have an active selection (`selected && !state.selections[typeName]`).
- Delete the bottom-level `TypeItemPicker` component wrapper at the end of the file.

---

## 4. Verification Plan

1. **Unit Tests**: Run `pnpm test test/group-type-slot-entries.test.tsx` to verify passing status.
2. **Type check**: Run `pnpm typecheck` to confirm strict TypeScript compilation.
3. **Manual Check**: Click an unselected slot in a multi-slot category (e.g., BODY slots) and check that the item list opens immediately below that button.
