# Match upstream default selections

**Status:** approved
**Date:** 2026-05-21

## Goal

Make the web app's first-load character match the upstream
[Universal LPC Spritesheet Character Generator](https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/)
exactly: a male body with the "Human Male (light)" head and the
"Neutral (light)" expression, and nothing else pre-selected.

## Why

Today, `pickInitialSelections` (`packages/web/src/slice/selection.ts`)
derives a starting outfit from "first catalog item per preferred type"
(body, head, hair, eyes, torso, legs, feet). This produces a fully-dressed
character that does not match the upstream generator's much sparser default
(body + head + face, all `light`). Users coming from upstream see a different
starting state.

Upstream's defaults live in `selectDefaults()` at
`upstream/sources/state/state.ts:161`:

| itemId             | typeName     | recolor | display name        |
| ------------------ | ------------ | ------- | ------------------- |
| `body`             | `body`       | `light` | Body color (light)  |
| `heads_human_male` | `head`       | `light` | Human Male (light)  |
| `face_neutral`     | `expression` | `light` | Neutral (light)     |

Body type: `male` (first of `BODY_TYPES`).

## Scope

In scope:

- Change initial selections returned by `pickInitialSelections` to match
  the upstream 3-item set.
- Add `expression` to `shownTypeNames` so users can change/clear the face
  via the existing "Common" picker.
- Update tests to assert the new contract.
- Update the doc comment to reflect itemId-based (order-independent)
  lookup.

Out of scope:

- Picker UI restructuring (upstream uses a tree; we keep our flat
  "Common" sliders).
- Asset-copy script logic — no code changes; bundled subset grows
  automatically.
- Hash-encoded URL behaviour — unchanged; encoded selections still
  override defaults on first load.
- `selectionForItem`, `toSelections`, `sliceReducer` — unchanged.

## Design

### 1. `pickInitialSelections` (`packages/web/src/slice/selection.ts`)

Replace the loop over `PREFERRED` types with a lookup by stable itemId
via `catalog.byItemId`:

```ts
const DEFAULT_ITEM_IDS = {
  body: 'body',
  head: 'heads_human_male',
  expression: 'face_neutral',
} as const;

const DEFAULT_RECOLOR = 'light';
```

For each `(typeName, itemId)` entry:

1. `const item = catalog.byItemId.get(itemId);`
2. If `!item`, throw:
   `pickInitialSelections: missing required default item "${itemId}"`.
3. Build a `Selection`:
   `{ typeName, name: item.name, recolor: DEFAULT_RECOLOR }`
   (no `variant` — upstream's defaults use recolor only).

`bodyType` stays `'male'` (first of `BODY_TYPES`), but is now a named
constant instead of "first body item that supports a body type". The
previous fallback existed because the body item was discovered by scan;
now it's looked up directly.

`anim = 'walk'`, `dir = 'down'`, `playing = true` — unchanged.

### 2. `shownTypeNames`

Return order: `['body', 'head', 'hair', 'expression', 'eyes', 'torso',
'legs', 'feet']`.

- `body`, `head`, `expression` have defaults selected.
- `hair`, `eyes`, `torso`, `legs`, `feet` render as empty selectors;
  user can pick into them.
- A type-name is included only if `catalog.byTypeName.get(tn)` is
  non-empty (preserves the existing "skip-if-missing" behaviour for
  pared-down catalogs).

### 3. Doc comment

Replace the "spec deviation 4 / catalog-order determinism" paragraph
with a short note that defaults are looked up by stable itemId. The
existing DETERMINISM CONTRACT comment in
`packages/web/scripts/copy-spritesheets.ts:55-61` and the
`pickInitialSelections determinism` test in
`packages/web/test/integration.test.ts:69-84` become redundant but
remain in place — they still pass and document the older invariant.

### 4. Tests (`packages/web/test/selection.test.ts`)

Rewrite the `pickInitialSelections` describe block:

```ts
const { catalog } = createCatalog({
  'body.json': defn('Body Color', 'body'),
  'heads_human_male.json': defn('Human Male', 'head'),
  'face_neutral.json': defn('Neutral', 'expression'),
});
```

Assertions:

- `state.bodyType === 'male'`
- `state.selections.body` equals `{ typeName: 'body', name: 'Body Color', recolor: 'light' }`
- `state.selections.head` equals `{ typeName: 'head', name: 'Human Male', recolor: 'light' }`
- `state.selections.expression` equals `{ typeName: 'expression', name: 'Neutral', recolor: 'light' }`
- `shownTypeNames` contains `body`, `head`, `expression` and `hair`,
  `eyes`, `torso`, `legs`, `feet` are included when present in the
  catalog (a second fixture asserts ordering).
- A missing-item case throws with a message naming the missing itemId
  (drop `heads_human_male` from the fixture, expect throw).

The `toSelections` and `sliceReducer` tests remain unchanged.

### 5. Asset bundling

`packages/web/scripts/copy-spritesheets.ts`: no code change. Pass A
copies the new initial outfit (`body`, `heads_human_male`,
`face_neutral`) across every body type. Pass B already iterates every
shown type-name × every item at default body type; adding `expression`
to `shownTypeNames` extends Pass B to cover all expression items at
`male`.

## Verification

1. `pnpm --filter @lpc-toolkit/web test` — selection tests pass.
2. `pnpm --filter @lpc-toolkit/web copy-sprites` — bundles include
   `head/heads/human/male/light.png`, `head/faces/male/neutral/light.png`,
   `body/bodies/male/light.png`.
3. `pnpm --filter @lpc-toolkit/web dev` — open the app on a clean URL
   (no hash), confirm:
   - Body type selector shows `male`.
   - Body renders in `light` skin tone.
   - Head renders as "Human Male" in `light`.
   - Face renders as "Neutral" expression.
   - No hair / torso / legs / feet visible.
   - "Common" picker shows sliders for body, head, hair, expression,
     eyes, torso, legs, feet; the three pre-selected ones show the
     correct value, the rest are empty.

## Risks

- **"light" recolor must resolve for all 3 items.** If our recolor
  pipeline doesn't recognize `"light"` on one of them, the sprite
  silently falls back to base. Verification step 3 catches this.
- **Bundle size delta.** All `expression`-typed items at `male` are
  now bundled. Most were already pulled in via head dependencies, so
  the increase should be small (single-digit MB). If unacceptable,
  follow-up work could limit Pass B to types with default selections.
