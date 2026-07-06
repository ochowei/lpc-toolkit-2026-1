# Noble Random Narrowing Design

- Date: 2026-07-06
- Scope: `packages/web`
- Status: design approved, pending implementation plan

## Background

Preset random uses web-only `RandomProfile` data in
`packages/web/src/slice/random-profiles.ts`, consumed by
`packages/web/src/slice/random-outfit.ts`. Recent Farmer random work narrowed
style behavior at the profile level: fixed identity slots, required outfit
slots, item allow-lists, and profile-driven random color slots.

Noble random already has a dedicated profile, but it is still too loose:

- It can omit formal clothing slots because `clothes`, `legs`, `shoes`, and
  `hat` are optional.
- It does not fix human male identity or neutral expression.
- It cannot express that formal top and formal pants should be selected as a
  matching plain or striped set.
- It does not explicitly randomize the intended Noble color slots.

The desired behavior is a complete formal male noble with controlled variety:
skin, hair, formal set style, pants color, shoes color, and top-hat color may
vary, while the identity and outfit silhouette stay stable.

## Goals

- Make Noble preset random always generate a male character.
- Make Noble random always use `Body Color`, `Human Male`, and `Neutral`.
- Make Noble random always include formal top, formal pants, basic shoes, and
  formal top hat.
- Allow two formal outfit styles: plain formal and striped formal.
- Keep formal top and pants paired by style.
- Randomize skin, pants, shoes, and top-hat colors when colors are enabled.
- Keep Noble random restricted to noble-safe formal clothing.
- Keep the change in web pure selection logic and focused tests.

## Non-Goals

- Do not change the fixed Noble preset.
- Do not change random behavior for Farmer, Villager, Mage, Knight, Ranger, or
  normal profiles except through shared generic behavior required by Noble.
- Do not add UI call-site special cases.
- Do not redesign the preset menu UI.
- Do not add dependencies.
- Do not modify `packages/core/`.
- Do not modify `upstream/`.
- Do not change attribution, rendering, export, or catalog-loading behavior.

## Design Decision

Use profile-level item sets for linked Noble clothing choices.

Add optional profile metadata to `RandomProfile`:

```ts
readonly itemSets?: readonly {
  readonly requiredTypeNames: readonly TypeName[];
  readonly items: Partial<Record<TypeName, string>>;
}[];
```

`itemSets` lets a profile define a group of slot item names that must be picked
together. `pickRandomOutfit` will process item sets before the normal per-slot
random loop:

1. Filter item sets to those where every listed item exists in the catalog and
   supports the effective body type.
2. Pick one compatible item set with the existing RNG.
3. Convert each listed item into a `Selection` through `selectionForItem`.
4. Apply profile random color behavior to set items whose type name is listed
   in `randomColorTypeNames`.
5. Write those selections into the accumulating `items` map.

The existing per-slot loop then skips those type names because they are already
selected. This prevents plain and striped formal pieces from being mixed.

If a profile has no compatible item set, `pickRandomOutfit` should not throw.
It should continue to the existing per-slot behavior. This matches the current
picker convention for missing or incompatible allow-listed items.

This keeps style rules out of React components and avoids Noble-specific
branching in UI call sites. The new field is generic, but it is introduced only
because Noble has a real linked-slot requirement.

## Noble Profile

Update `NOBLE_RANDOM_PROFILE` with:

- `bodyType: 'male'`
- `typeNames`: `body`, `head`, `expression`, `hair`, `clothes`, `legs`,
  `shoes`, `hat`
- `requiredTypeNames`: `body`, `head`, `expression`, `clothes`, `legs`,
  `shoes`, `hat`
- `randomColorTypeNames`: `body`, `legs`, `shoes`, `hat`
- `itemPools.body`: `Body Color`
- `itemPools.head`: `Human Male`
- `itemPools.expression`: `Neutral`
- `itemPools.shoes`: `Basic Shoes`
- `itemPools.hat`: `Formal Tophat`
- `itemSets`: one plain formal set and one striped formal set

The plain formal item set is:

```ts
{
  requiredTypeNames: ['clothes', 'legs'],
  items: {
    clothes: 'Collared/Formal Longsleeve',
    legs: 'Formal Pants',
  },
}
```

The striped formal item set is:

```ts
{
  requiredTypeNames: ['clothes', 'legs'],
  items: {
    clothes: 'Striped Collared/Formal Longsleeve',
    legs: 'Striped Formal Pants',
  },
}
```

Noble should continue to exclude `fantasy`, `weapons`, and `fx`, and should
continue to omit non-noble slots by keeping the explicit `typeNames` allow-list.

## Resulting Behavior

Noble random should always produce a complete male human noble:

- `Selections.bodyType` is `male`.
- `body` is `Body Color`.
- `head` is `Human Male`.
- `expression` is `Neutral`.
- `clothes` and `legs` are either plain formal together or striped formal
  together.
- `shoes` is `Basic Shoes`.
- `hat` is `Formal Tophat`.

Noble random must not select:

- skeleton or zombie body/head items
- non-human heads
- farmer workwear such as `overalls` or `apron`
- mage, ranger, knight, or combat slots such as `cape`, `armour`,
  `chainmail`, `weapon`, `weapon_magic_crystal`, `shield`, `quiver`, `arms`,
  or `gloves`
- fantasy or `fx` slots

Noble random keeps reasonable variation:

- Skin color can vary through `body`.
- Hair remains optional and random when included by optional probability.
- Formal set style can vary between plain and striped.
- Pants color can vary through `legs`.
- Shoes color can vary through `shoes`.
- Top-hat color can vary through `hat`.
- Formal shirt color stays at its catalog default; current formal shirt assets
  expose only the `white` variant.

When colors are disabled through random scope, Noble should keep the default
selection colors, matching the existing Farmer/Mage/Knight/Ranger color-scope
behavior.

## Data Flow

```text
user clicks Noble / Random
  -> preset menu resolves randomProfileForStyle('noble')
  -> pickRandomOutfit receives NOBLE_RANDOM_PROFILE
  -> effective body type becomes male
  -> compatible Noble item set is selected
  -> formal top and pants are inserted together
  -> required Noble slots bypass optional probability
  -> remaining required slots select Body Color, Human Male, Neutral,
     Basic Shoes, and Formal Tophat from profile pools
  -> profile random color slots randomize body, legs, shoes, and hat
  -> apply_selections receives complete male Noble selections
```

The preset menu does not need to know about Noble identity, required slots,
formal item sets, or color rules.

## Error Handling

- Unknown profile ids continue to fall back to the normal profile.
- Missing or incompatible set items cause that set to be filtered out.
- If all item sets are filtered out, generation continues through existing
  per-slot item pools without throwing.
- Missing or incompatible required item-pool entries continue to be skipped by
  the existing picker rather than throwing.
- Disabled random scopes continue to preserve current selections as they do
  today, with existing body-type compatibility filtering when a profile forces
  a body type.

## Testing

Update `packages/web/test/random-outfit.test.ts` with focused Noble coverage:

- Noble fixes male human neutral identity and a complete formal outfit even
  with `optionalProb: 0`.
- Noble excludes undead or non-human identity choices and non-noble slots.
- Noble keeps formal tops and pants paired across deterministic RNG paths.
- Noble randomizes `body`, `legs`, `shoes`, and `hat` colors when palette data
  exists.
- Noble keeps default colors when `scope.colors` is disabled.

Existing profile type-name coverage should remain unchanged for Noble:

```ts
['body', 'head', 'expression', 'hair', 'clothes', 'legs', 'shoes', 'hat']
```

Verification should run:

```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/random-outfit.test.ts
rtk pnpm --filter @lpc-toolkit/web typecheck
rtk pnpm check:boundaries
```

Run broader web tests if the implementation touches shared random behavior
beyond `RandomProfile`, `pickRandomOutfit`, and focused random-outfit tests.
