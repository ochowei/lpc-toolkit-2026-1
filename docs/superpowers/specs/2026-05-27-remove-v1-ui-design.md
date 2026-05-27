# Remove v1 UI; retarget v1 link to upstream

Status: design approved (William, 2026-05-27).

## Background

The web app currently ships two UIs:

- **v2 (`LayerStackHarness`)** — the default modern UI.
- **v1 (`SliceHarness`)** — the legacy UI, reachable via the query string
  `?ui=v1` and selected at render time by `shouldUseV1(window.location.search)`
  in `packages/web/src/lib/should-use-v1.ts`.

A small `v1` link in the top bar (`packages/web/src/components/layer-stack/top-bar.tsx:25-31`)
points to `?ui=v1` so a user can fall back to the legacy UI.

We are retiring v1. The link should instead deep-link the current outfit
into the canonical upstream generator at
`https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/`.
The previous research turn confirmed our project's serialized hash format is
byte-compatible with upstream's, so the hash can be passed through verbatim.

## Goals

1. Remove the v1 UI entirely (component, query-string switch, and branch
   logic).
2. Replace the `v1` link in the top bar with an `upstream` link that opens a
   new tab pointing at the upstream generator, with the current character's
   hash appended.
3. No regression in v2 functionality, including the existing selection-token
   feature (`encodeSelectionToken` / `decodeSelectionToken`, the `v1.` token
   prefix, `TokenPopover`, `more-menu`'s 🔗 entry, all `token.*` i18n keys).

## Non-goals

- Filtering the outgoing hash to only items upstream supports. Upstream's
  parser is tolerant of unknown items (warns + skips); we accept any drift
  between our submodule pin and upstream's deployed catalog as a graceful
  degradation. (Decided 2026-05-27 during brainstorming.)
- Touching the `v1.<base64url>` selection token. Despite the `v1.` prefix,
  it is a separate feature from the v1 UI and stays.
- Redirecting old `?ui=v1` bookmarks. They will simply render v2 (query
  string is ignored); any `#…` hash present continues to be parsed and
  applied by `bootstrapStateFromHash`.

## Design

### Files

**New**

- `packages/web/src/lib/upstream-url.ts`
  - `UPSTREAM_URL = 'https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/'`
  - `buildUpstreamUrl(hash: string): string` — returns `UPSTREAM_URL` when
    `hash === ''`, else `${UPSTREAM_URL}#${hash}`.
- `packages/web/test/upstream-url.test.ts`
  - Empty hash → returns `UPSTREAM_URL` (no trailing `#`).
  - Non-empty hash → returns `UPSTREAM_URL` + `#` + hash verbatim.
  - Hash already containing `encodeURIComponent`-ed values is **not**
    re-encoded by `buildUpstreamUrl` (`serializeHash` already encodes).

**Modified**

- `packages/web/src/App.tsx`
  - Remove `import { shouldUseV1 } from './lib/should-use-v1'`.
  - Remove `import { SliceHarness } from './components/slice-harness'`.
  - Remove the `useV1` ternary at lines 33-41; call
    `bootstrapStateFromHash` unconditionally.
  - Remove the `if (shouldUseV1(window.location.search)) { return <SliceHarness ... /> }`
    block (lines 62-83).
- `packages/web/src/components/layer-stack/top-bar.tsx`
  - Add required prop `upstreamHref: string` to `Props`.
  - Replace the `<a href="?ui=v1" title="legacy UI (v1)">v1</a>` element
    with `<a href={upstreamHref} target="_blank" rel="noopener noreferrer"
    title={t('topBar.upstreamLink')}>upstream</a>`. Keep existing classes.
- `packages/web/src/components/layer-stack/harness.tsx`
  - Import `serializeHash` from `@lpc-toolkit/core`, `toSelections` from the
    selection slice, and `buildUpstreamUrl` from the new `upstream-url` lib.
  - Compute
    `const upstreamHref = useMemo(() => buildUpstreamUrl(serializeHash(toSelections(props.state))), [props.state.bodyType, props.state.selections])`.
  - Pass `upstreamHref={upstreamHref}` to `<TopBar>`.
- `packages/web/src/i18n.ts`
  - Add key `topBar.upstreamLink`:
    - `en`: `'Open this character in the upstream Universal LPC Sprite
      Sheet Character Generator'`
    - `zh-TW`: `'在原始 Universal LPC Sprite Sheet Character Generator 開啟此角色'`

**Deleted**

- `packages/web/src/components/slice-harness.tsx`
- `packages/web/src/lib/should-use-v1.ts`

**Untouched** (called out explicitly to prevent over-reach)

- `packages/web/src/components/layer-stack/popovers/token-popover.tsx`
- `packages/web/src/components/layer-stack/popovers/more-menu-popover.tsx`
  (the 🔗 token entry stays)
- `packages/core/src/hash.ts`: `encodeSelectionToken`,
  `decodeSelectionToken`, `SELECTION_TOKEN_PREFIX = 'v1.'`, the base64url
  helpers
- `packages/core/src/index.ts`: `encodeSelectionToken` /
  `decodeSelectionToken` exports
- `packages/web/src/i18n.ts`: all `token.*` keys
- `packages/core/test/hash.test.ts`: `describe('selection tokens', …)` block

### Data flow

```
SliceState (state.bodyType, state.selections)
   │
   ▼
toSelections(state)            packages/web/src/slice/selection.ts
   │
   ▼
serializeHash(selections)      packages/core/src/hash.ts
   │  e.g. "sex=male&body=Body_color_light&hair=Plain_v01|black"
   ▼
buildUpstreamUrl(hash)         packages/web/src/lib/upstream-url.ts (new)
   │  e.g. "https://liberatedpixelcup.github.io/.../#sex=male&body=…"
   ▼
TopBar prop: upstreamHref
   │
   ▼
<a href={upstreamHref} target="_blank" rel="noopener noreferrer">upstream</a>
```

The `upstreamHref` is derived from `state`, **not** read from
`window.location.hash`. This avoids any race with `useUrlHashSync`'s
post-render `useEffect` write. The harness already holds `state`, so a
single `useMemo` keyed on `state.bodyType` and `state.selections` is
sufficient — `anim` / `dir` / `zoom` / `playing` deliberately do not
trigger recompute, matching the URL hash write strategy at
`url-hash-sync.ts:184`.

### Edge cases

| Scenario | Behavior |
|---|---|
| Defaults (no user selection yet) | `serializeHash` still emits `sex=<bodyType>` (and any default items). Link opens upstream at that baseline. |
| Empty `selections` object | Same as above; `sex=<bodyType>` only. Upstream accepts. |
| Long hash (many selections) | No practical browser limit on hash length; upstream parses tolerantly. No special handling. |
| Hash refers to items upstream doesn't have (drift) | Upstream's `loadSelectionsFromHash` (`Wt`) logs a warning and skips the unknown item — the rest of the character still loads. Accepted graceful degradation. |
| Old `?ui=v1` bookmark | Query string ignored; renders v2. |
| Old `?ui=v1#sex=…` bookmark | Query string ignored; hash applied as usual. |
| `target="_blank"` with rel | `rel="noopener noreferrer"` set, prevents reverse tabnabbing. |
| Upstream URL changes | Constant lives in one file (`upstream-url.ts`); manual update. |
| Middle-click / right-click "open in new tab" | Works — the `<a>` element has a real `href`. |
| Locale switch | Link **text** stays `upstream` (treated as a proper noun for the project); `title` translates via `t('topBar.upstreamLink')`. |

### Why `useMemo`, not `useEffect + state`

`upstreamHref` is a pure derivation of `state`. `useMemo` runs synchronously
during render so the value is correct on the same frame as the state
change. An `useEffect + setState` pattern would add a render and reintroduce
the very timing problem we're avoiding by not reading
`window.location.hash`.

### Why the hash is not re-encoded

`serializeHash` (`packages/core/src/hash.ts:247-260`) already wraps each key
and value with `encodeURIComponent`. The result is safe to drop into a URL
after `#`. Re-encoding would double-encode (e.g. `%7C` → `%257C`).

### Why a real `<a>`, not `onClick + window.open`

A real `href` preserves middle-click, right-click "open in new tab",
"copy link address", a11y semantics, and SEO. The `onClick + window.open`
approach breaks all of those for no benefit.

### Bundle impact

- Remove: `slice-harness.tsx` (~890 lines of TSX), `should-use-v1.ts`
  (4 lines).
- Add: `upstream-url.ts` (a const plus a one-line helper).
- Net: production bundle is meaningfully smaller. No new runtime
  dependencies.

### Accessibility

- Link text `upstream` is meaningful in context (`app.subtitle · upstream`).
- `title` provides the full description, localized.
- No `aria-label` (would cause screen readers to announce the link twice).

## Implementation order

Each step is independently verifiable; type-checker is the safety net.

1. Add `packages/web/src/lib/upstream-url.ts`.
2. Add `packages/web/test/upstream-url.test.ts`; run tests.
3. Add `topBar.upstreamLink` to both locales in
   `packages/web/src/i18n.ts`.
4. Update `top-bar.tsx`: add `upstreamHref` prop, change the `<a>`.
5. Update `harness.tsx`: compute `upstreamHref` via `useMemo`, pass to
   `TopBar`. Type-checker now requires step 4 was completed.
6. Update `App.tsx`: drop v1 imports, ternary, and the v1 branch return.
7. `pnpm -r typecheck`. v1 files exist but are unimported.
8. Delete `packages/web/src/components/slice-harness.tsx`.
9. Delete `packages/web/src/lib/should-use-v1.ts`.
10. `pnpm -r typecheck && pnpm -r test && pnpm -r build`. All green.
11. Run the manual verification checklist below.

## Verification

### Automated

- `pnpm -r typecheck` — 0 errors.
- `pnpm -r test` — all suites pass.
- `pnpm -r build` — production bundle builds; spot-check that
  `slice-harness` / `shouldUseV1` are absent from the output.

### Manual (in a browser, against `pnpm --filter @lpc-toolkit/web dev`)

1. Load app with no hash; v2 (`LayerStackHarness`) is rendered.
2. Top bar shows `upstream` link; hover surfaces the localized title.
3. Click `upstream`: new tab opens at
   `https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/`
   with the current character composed correctly upstream.
4. Change a selection (e.g. hair); URL hash updates; clicking `upstream`
   again reflects the new hair in upstream.
5. Visit `…/?ui=v1` directly: v2 renders (query string ignored).
6. Visit `…/?ui=v1#sex=female&hair=…` directly: v2 renders with the hash
   applied via `bootstrapStateFromHash`.
7. Middle-click `upstream`: new tab opens with the correct URL.
8. Toggle locale; link text remains `upstream`; `title` updates.

## Rollback

`git revert` the implementing commit. `slice-harness.tsx` and
`should-use-v1.ts` are restored verbatim. No data migration, no schema
change, no external systems involved.
