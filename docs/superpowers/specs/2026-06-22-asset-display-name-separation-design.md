# Asset display-name separation

## Goal

Render every asset with a meaningful, localized label without changing the
legacy `name` value that identifies selections, URL hashes, presets, sprite
composition, exports, and attribution lookups.

## Problem

`ItemDefinition.name` currently serves two incompatible purposes:

- It is the selection identity used throughout core and the web application.
- It is the user-visible label passed to `tl.itemName(name)`.

This causes generic upstream names to be displayed without their asset context.
For example, the ordinary bow is `Normal`, while the Chinese global translation
for `Great` is incorrectly `大頭盔`. The existing translation table is keyed only
by the raw name, so it cannot distinguish assets that happen to share a name.

## Scope

This change separates display labels from selection identity in the web UI. It
does not change the `Selection` contract, core composition, credit resolution,
or the public URL hash format.

The first migrated labels are:

| Item ID | Legacy `name` | English display name | Chinese display name |
| --- | --- | --- | --- |
| `weapon_ranged_bow_normal` | `Normal` | Normal Bow | 普通弓 |
| `weapon_ranged_bow_great` | `Great` | Great Bow | 大弓 |
| `weapon_ranged_bow_recurve` | `Recurve` | Recurve Bow | 反曲弓 |
| `weapon_ranged_bow_arrow` | `Ammo` | Arrow | 箭矢 |
| `hair_natural` | `Natural` | Natural Hair | 自然髮型 |
| `hair_plain` | `Plain` | Plain Hair | 樸素髮型 |
| `face_neutral` | `Neutral` | Neutral Expression | 中性表情 |

## Design

### Metadata

Add an optional `display_name` to `ItemDefinition`. It is an English,
human-readable label and defaults to `name` when absent. Set it only on assets
whose source `name` is not adequate as a standalone label. The source `name`
and definition paths remain unchanged.

`ItemId`, already derived from the definition filename by the catalog loader,
is the key for localized overrides. A new display-label helper receives both
the item ID and definition:

```ts
displayName(itemId: ItemId, item: ItemDefinition): string
```

For English it returns `item.display_name ?? item.name`. For Chinese it first
looks up an item-ID-specific label, then falls back to that English display
name. Existing raw-name translations remain as the fallback for unmigrated
assets, preserving current coverage.

### UI use

All user-facing catalog labels use the helper, including:

- picker cards, titles, ARIA labels, selected-item panels, layer rows, and
  grouped slot controls;
- sidebar/advanced search results and catalog-tree item labels;
- attribution rows.

Catalog-tree nodes retain `itemId` so rendering can resolve a display label.
Search matches both the display label and the legacy raw name. Sorting uses the
display label, so the visible ordering matches what users read.

User-facing ZIP filenames use display names. Asset resolution, attribution
matching, and console diagnostics continue to use `name`, because it remains
the selection identity.

### Compatibility

Selections retain `{ typeName, name, variant?, recolor? }`. `serializeHash`
continues to produce legacy names, and `parseHash` continues to accept existing
shared links such as `weapon=Normal_dark`. Presets, core composition, credits,
and asset exports therefore require no identity migration.

The more invasive alternative—storing item IDs in `Selection` and changing the
hash format—is explicitly out of scope. It would require a public API and
compatibility migration without solving a problem that the display-label layer
does not already solve.

## Errors and tests

The helper must always fall back to a non-empty label, so an absent
`display_name` or translation cannot make an asset blank.

Tests will cover:

- English and Chinese labels for all seven migrated items;
- fallback to `display_name` and then legacy `name`;
- two items sharing a raw name but receiving separate item-ID translations;
- display-label sorting and search, including raw-name backward search;
- unchanged selections, legacy URL parsing/serialization, preset application,
  core composition, and credit resolution.

## Non-goals

- Renaming source assets or altering `upstream/`.
- Replacing `name` in core selection or attribution contracts.
- Translating every existing asset as part of this change.
