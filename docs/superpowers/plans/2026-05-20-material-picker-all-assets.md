# Material Picker All Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hybrid material picker where Common selectors stay fast, Advanced exposes every upstream asset, and users can choose Auto, Local, or Upstream sprite image loading.

**Architecture:** Keep `packages/core/` unchanged and environment-agnostic. Add pure web-side helpers for asset-source URL resolution and catalog tree construction, then wire them into the existing React harness and browser canvas adapter. Preserve attribution by continuing to compose through core selections.

**Tech Stack:** TypeScript strict mode, React 18, Vite, Vitest, Tailwind utilities, existing pnpm workspace.

---

## File Structure

- Create `packages/web/src/adapter/asset-source.ts`: asset source types, constants, and pure URL resolution/fallback helpers.
- Modify `packages/web/src/adapter/browser-canvas-adapter.ts`: accept an asset source and use URL candidates when loading images.
- Modify `packages/web/src/hooks/use-composed-character.ts`: accept asset source as a dependency and recreate/recompose when it changes.
- Create `packages/web/src/slice/catalog-tree.ts`: derive a sorted category tree from `Catalog.byItemId` using item source paths.
- Modify `packages/core/src/types.ts` and `packages/core/src/catalog.ts`: add optional `sourcePath` to `ItemDefinition` so web can reconstruct upstream folder structure without mutating upstream JSON.
- Modify `packages/web/src/components/slice-harness.tsx`: add source selector UI, Common section, Advanced section, tree rendering, search, and selection handling.
- Modify `packages/web/src/App.tsx`: own the selected asset source and pass it into `SliceHarness`.
- Modify `packages/web/src/i18n.ts`: add labels for source selector and Advanced UI.
- Add/modify Vitest tests under `packages/web/test/` and `packages/core/test/`.

## Task 1: Preserve Item Source Paths In The Catalog

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/catalog.ts`
- Test: `packages/core/test/catalog.test.ts`

- [ ] **Step 1: Write the failing catalog source path test**

Add this test to `packages/core/test/catalog.test.ts`:

```ts
it('preserves the sheet definition source path on ingested items', () => {
  const { catalog, warnings } = createCatalog({
    'headwear/hats/magic/hat_magic_large.json': {
      name: 'Large Magic Hat',
      type_name: 'hat',
      animations: ['walk'],
      credits: [],
      layer_1: { zPos: 10, male: 'head/hat/magic/large/' },
    } as unknown as ItemDefinition,
  });

  expect(warnings).toEqual([]);
  expect(catalog.byItemId.get('hat_magic_large')?.sourcePath).toBe(
    'headwear/hats/magic/hat_magic_large.json',
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @lpc-toolkit/core test -- catalog.test.ts
```

Expected: FAIL because `sourcePath` is not present on the catalog item.

- [ ] **Step 3: Add the type field**

In `packages/core/src/types.ts`, extend `ItemDefinition`:

```ts
export interface ItemDefinition {
  readonly name: string;
  readonly type_name: TypeName;
  readonly sourcePath?: FilePath;
  readonly animations: readonly AnimationName[];
  readonly credits: readonly CreditEntry[];
  readonly recolors?: RawRecolors;
  readonly variants?: readonly string[];
  readonly tags?: readonly string[];
  readonly required_tags?: readonly string[];
  readonly replace_in_path?: Readonly<Record<TypeName, Readonly<Record<string, string>>>>;
  readonly priority?: number;
  readonly match_body_color?: boolean;
  readonly preview_row?: number;
  readonly preview_column?: number;
  readonly aliases?: Readonly<Record<string, string>>;
  readonly ignore?: boolean;
  readonly [layerKey: `layer_${number}`]: RawLayer | undefined;
}
```

- [ ] **Step 4: Store a source-path copy in the catalog**

In `packages/core/src/catalog.ts`, inside the `for (const [filePath, def] of Object.entries(records))` loop after validation, create a copy and use it for all catalog storage:

```ts
    const item: ItemDefinition = { ...def, sourcePath: filePath };
```

Then replace the item storage and type-name indexing in that loop:

```ts
    if (byItemId.has(itemId)) {
      warnings.push({
        path: filePath,
        message: `duplicate itemId "${itemId}" (first seen at "${itemIdSource.get(itemId) ?? '?'}"); last-write-wins`,
      });
      const prev = byItemId.get(itemId)!;
      const prevList = byTypeName.get(prev.type_name);
      if (prevList) {
        const idx = prevList.indexOf(prev);
        if (idx >= 0) prevList.splice(idx, 1);
        if (prevList.length === 0) byTypeName.delete(prev.type_name);
      }
    }

    byItemId.set(itemId, item);
    itemIdSource.set(itemId, filePath);

    const typeList = byTypeName.get(item.type_name);
    if (typeList) {
      typeList.push(item);
    } else {
      byTypeName.set(item.type_name, [item]);
    }

    processItemAliases(item, aliasMap, warnings, filePath);
```

- [ ] **Step 5: Run the core tests**

Run:

```bash
pnpm --filter @lpc-toolkit/core test -- catalog.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/catalog.ts packages/core/test/catalog.test.ts
git commit -m "feat(core): preserve catalog source paths"
```

## Task 2: Add Asset Source URL Resolution

**Files:**
- Create: `packages/web/src/adapter/asset-source.ts`
- Modify: `packages/web/src/adapter/browser-canvas-adapter.ts`
- Test: `packages/web/test/asset-source.test.ts`
- Test: `packages/web/test/browser-canvas-adapter.test.ts`

- [ ] **Step 1: Write failing tests for asset URL candidates**

Create `packages/web/test/asset-source.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  UPSTREAM_SPRITESHEET_BASE_URL,
  resolveSpriteUrlCandidates,
  type AssetSource,
} from '../src/adapter/asset-source';

const path = 'spritesheets/body/bodies/male/walk.png';
const base = 'http://localhost/app/';

describe('resolveSpriteUrlCandidates', () => {
  it.each([
    ['local' satisfies AssetSource, ['http://localhost/app/spritesheets/body/bodies/male/walk.png']],
    ['upstream' satisfies AssetSource, [`${UPSTREAM_SPRITESHEET_BASE_URL}spritesheets/body/bodies/male/walk.png`]],
    [
      'auto' satisfies AssetSource,
      [
        'http://localhost/app/spritesheets/body/bodies/male/walk.png',
        `${UPSTREAM_SPRITESHEET_BASE_URL}spritesheets/body/bodies/male/walk.png`,
      ],
    ],
  ])('returns ordered candidates for %s', (source, expected) => {
    expect(resolveSpriteUrlCandidates(path, base, source)).toEqual(expected);
  });
});
```

Update `packages/web/test/browser-canvas-adapter.test.ts` to keep `resolveSpriteUrl` covered and add candidate behavior:

```ts
import { describe, expect, it } from 'vitest';
import {
  UPSTREAM_SPRITESHEET_BASE_URL,
  resolveSpriteUrlCandidates,
} from '../src/adapter/asset-source';
import { resolveSpriteUrl } from '../src/adapter/browser-canvas-adapter';

describe('resolveSpriteUrl', () => {
  it('resolves a core sprite path against the document base', () => {
    expect(
      resolveSpriteUrl('spritesheets/body/bodies/male/walk.png', 'http://x/'),
    ).toBe('http://x/spritesheets/body/bodies/male/walk.png');
  });

  it('resolves under a sub-path base', () => {
    expect(resolveSpriteUrl('spritesheets/a.png', 'http://x/app/')).toBe(
      'http://x/app/spritesheets/a.png',
    );
  });
});

describe('resolveSpriteUrlCandidates', () => {
  it('keeps local before upstream for auto mode', () => {
    expect(resolveSpriteUrlCandidates('spritesheets/a.png', 'http://x/app/', 'auto')).toEqual([
      'http://x/app/spritesheets/a.png',
      `${UPSTREAM_SPRITESHEET_BASE_URL}spritesheets/a.png`,
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- asset-source.test.ts browser-canvas-adapter.test.ts
```

Expected: FAIL because `asset-source.ts` does not exist.

- [ ] **Step 3: Implement asset source helpers**

Create `packages/web/src/adapter/asset-source.ts`:

```ts
export type AssetSource = 'auto' | 'local' | 'upstream';

export const UPSTREAM_SPRITESHEET_BASE_URL =
  'https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/';

export function resolveLocalSpriteUrl(path: string, baseHref: string): string {
  return new URL(path, baseHref).href;
}

export function resolveUpstreamSpriteUrl(path: string): string {
  return new URL(path, UPSTREAM_SPRITESHEET_BASE_URL).href;
}

export function resolveSpriteUrlCandidates(
  path: string,
  baseHref: string,
  source: AssetSource,
): readonly string[] {
  if (source === 'local') return [resolveLocalSpriteUrl(path, baseHref)];
  if (source === 'upstream') return [resolveUpstreamSpriteUrl(path)];
  return [resolveLocalSpriteUrl(path, baseHref), resolveUpstreamSpriteUrl(path)];
}
```

- [ ] **Step 4: Update browser adapter to use candidates**

Modify `packages/web/src/adapter/browser-canvas-adapter.ts`:

```ts
import type {
  CanvasAdapter,
  CanvasLike,
  ImageLike,
} from '@lpc-toolkit/core';
import {
  resolveLocalSpriteUrl,
  resolveSpriteUrlCandidates,
  type AssetSource,
} from './asset-source';

export function resolveSpriteUrl(path: string, baseHref: string): string {
  return resolveLocalSpriteUrl(path, baseHref);
}

export function createBrowserCanvasAdapter(
  source: AssetSource = 'local',
): CanvasAdapter {
  return {
    createCanvas(width: number, height: number): CanvasLike {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      return c as unknown as CanvasLike;
    },
    async loadImage(path: string): Promise<ImageLike> {
      const urls = resolveSpriteUrlCandidates(path, document.baseURI, source);
      const errors: string[] = [];
      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (!res.ok) {
            errors.push(`${url}: HTTP ${res.status}`);
            continue;
          }
          const blob = await res.blob();
          return (await createImageBitmap(blob)) as unknown as ImageLike;
        } catch (e: unknown) {
          errors.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      throw new Error(`loadImage failed for ${path}: ${errors.join('; ')}`);
    },
  };
}
```

- [ ] **Step 5: Run web adapter tests**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- asset-source.test.ts browser-canvas-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/adapter/asset-source.ts packages/web/src/adapter/browser-canvas-adapter.ts packages/web/test/asset-source.test.ts packages/web/test/browser-canvas-adapter.test.ts
git commit -m "feat(web): add sprite asset source resolution"
```

## Task 3: Wire Asset Source Into Composition

**Files:**
- Modify: `packages/web/src/hooks/use-composed-character.ts`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/components/slice-harness.tsx`
- Modify: `packages/web/src/i18n.ts`
- Test: `packages/web/test/i18n.test.ts`

- [ ] **Step 1: Add i18n keys test**

Update `packages/web/test/i18n.test.ts` representative labels:

```ts
expect(en('assetSource.title')).toBe('Sprite source');
expect(en('assetSource.auto')).toBe('Auto');
expect(zh('assetSource.upstream')).toBe('上游');
```

- [ ] **Step 2: Run i18n test to verify it fails**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- i18n.test.ts
```

Expected: FAIL because new translation keys do not exist.

- [ ] **Step 3: Add translations**

In `packages/web/src/i18n.ts`, add these keys to both locales:

```ts
'assetSource.title': 'Sprite source',
'assetSource.auto': 'Auto',
'assetSource.local': 'Local',
'assetSource.upstream': 'Upstream',
'assetSource.autoHelp': 'Uses local bundled images first, then upstream for missing assets.',
'assetSource.localHelp': 'Uses only bundled images from this app.',
'assetSource.upstreamHelp': 'Loads images from the upstream GitHub Pages project.',
```

```ts
'assetSource.title': '圖片來源',
'assetSource.auto': '自動',
'assetSource.local': '本地',
'assetSource.upstream': '上游',
'assetSource.autoHelp': '優先使用本地打包圖片，缺圖時改用上游。',
'assetSource.localHelp': '只使用此 app 內打包的圖片。',
'assetSource.upstreamHelp': '從上游 GitHub Pages 專案載入圖片。',
```

- [ ] **Step 4: Update hook signature and adapter lifecycle**

Modify `packages/web/src/hooks/use-composed-character.ts`:

```ts
import { createBrowserCanvasAdapter } from '../adapter/browser-canvas-adapter';
import type { AssetSource } from '../adapter/asset-source';
```

Remove the module-level `const adapter = createBrowserCanvasAdapter();`.

Change the hook signature and create a per-source adapter:

```ts
export function useComposedCharacter(
  catalog: Catalog,
  state: SliceState,
  assetSource: AssetSource,
): ComposedResult {
  const adapter = useMemo(
    () => createBrowserCanvasAdapter(assetSource),
    [assetSource],
  );
```

Add `useMemo` to the React import:

```ts
import { useEffect, useMemo, useRef, useState } from 'react';
```

Update the compose effect dependency list:

```ts
  }, [adapter, catalog, key]);
```

- [ ] **Step 5: Add source state in App**

Modify `packages/web/src/App.tsx`:

```ts
import { useMemo, useReducer, useState } from 'react';
import type { AssetSource } from './adapter/asset-source';
```

Inside `App`:

```ts
const [assetSource, setAssetSource] = useState<AssetSource>('auto');
```

Pass props into `SliceHarness`:

```tsx
assetSource={assetSource}
onAssetSourceChange={setAssetSource}
```

- [ ] **Step 6: Add source selector UI**

Modify `packages/web/src/components/slice-harness.tsx` imports:

```ts
import type { AssetSource } from '../adapter/asset-source';
```

Add props:

```ts
  assetSource,
  onAssetSourceChange,
}: {
  catalog: Catalog;
  shownTypeNames: string[];
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  assetSource: AssetSource;
  theme: 'dark' | 'light';
  locale: Locale;
  t: Translator;
  onAssetSourceChange: (source: AssetSource) => void;
  onToggleTheme: () => void;
  onToggleLocale: () => void;
}) {
```

Call the hook with the source:

```ts
const result = useComposedCharacter(catalog, state, assetSource);
```

Add source options near the top of the left aside, before the license filter:

```tsx
<section className="space-y-1 border-b border-border pb-3 text-xs">
  <div className="text-text-mute uppercase">{t('assetSource.title')}</div>
  <div className="grid grid-cols-3 gap-1">
    {(['auto', 'local', 'upstream'] as const).map((source) => (
      <Button
        key={source}
        size="sm"
        variant={assetSource === source ? 'primary' : 'ghost'}
        onClick={() => onAssetSourceChange(source)}
      >
        {t(`assetSource.${source}`)}
      </Button>
    ))}
  </div>
  <p className="text-[11px] text-text-dim">
    {assetSource === 'auto'
      ? t('assetSource.autoHelp')
      : assetSource === 'local'
        ? t('assetSource.localHelp')
        : t('assetSource.upstreamHelp')}
  </p>
</section>
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- i18n.test.ts browser-canvas-adapter.test.ts asset-source.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/hooks/use-composed-character.ts packages/web/src/App.tsx packages/web/src/components/slice-harness.tsx packages/web/src/i18n.ts packages/web/test/i18n.test.ts
git commit -m "feat(web): add sprite source selector"
```

## Task 4: Build Advanced Catalog Tree Data

**Files:**
- Create: `packages/web/src/slice/catalog-tree.ts`
- Test: `packages/web/test/catalog-tree.test.ts`

- [ ] **Step 1: Write failing catalog tree tests**

Create `packages/web/test/catalog-tree.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import { buildCatalogTree, itemSupportsBodyType } from '../src/slice/catalog-tree';

function item(
  name: string,
  typeName: string,
  layerPath: string,
): ItemDefinition {
  return {
    name,
    type_name: typeName,
    animations: ['walk'],
    credits: [],
    layer_1: { zPos: 10, male: layerPath },
  } as unknown as ItemDefinition;
}

describe('buildCatalogTree', () => {
  it('groups catalog items by source path category segments', () => {
    const { catalog } = createCatalog({
      'headwear/hats/magic/hat_magic_large.json': item('Large Magic Hat', 'hat', 'headwear/hats/magic/large/'),
      'weapons/sword/weapon_sword_rapier.json': item('Rapier', 'weapon', 'weapons/sword/rapier/'),
    });

    const tree = buildCatalogTree(catalog);

    expect(tree.children.headwear?.children.hats?.children.magic?.items).toEqual([
      {
        id: 'hat_magic_large',
        name: 'Large Magic Hat',
        typeName: 'hat',
      },
    ]);
    expect(tree.children.weapons?.children.sword?.items?.[0]?.name).toBe('Rapier');
  });

  it('sorts children and items by display name', () => {
    const { catalog } = createCatalog({
      'zeta/item_z.json': item('Zed', 'hat', 'z/'),
      'alpha/item_a.json': item('Able', 'hat', 'a/'),
      'alpha/item_b.json': item('Baker', 'hat', 'b/'),
    });

    const tree = buildCatalogTree(catalog);

    expect(Object.keys(tree.children)).toEqual(['alpha', 'zeta']);
    expect(tree.children.alpha?.items?.map((i) => i.name)).toEqual([
      'Able',
      'Baker',
    ]);
  });
});

describe('itemSupportsBodyType', () => {
  it('returns true when layer_1 has the selected body type', () => {
    expect(itemSupportsBodyType(item('Rapier', 'weapon', 'weapons/rapier/'), 'male')).toBe(true);
  });

  it('returns false when layer_1 lacks the selected body type', () => {
    const def = {
      name: 'Child Only',
      type_name: 'hat',
      animations: ['walk'],
      credits: [],
      layer_1: { zPos: 10, child: 'hat/child/' },
    } as unknown as ItemDefinition;
    expect(itemSupportsBodyType(def, 'male')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- catalog-tree.test.ts
```

Expected: FAIL because `catalog-tree.ts` does not exist.

- [ ] **Step 3: Implement catalog tree helpers**

Create `packages/web/src/slice/catalog-tree.ts`:

```ts
import type { BodyType, Catalog, ItemDefinition, ItemId, TypeName } from '@lpc-toolkit/core';

export interface CatalogTreeItem {
  readonly id: ItemId;
  readonly name: string;
  readonly typeName: TypeName;
}

export interface CatalogTreeNode {
  readonly name: string;
  readonly items: CatalogTreeItem[];
  readonly children: Record<string, CatalogTreeNode>;
}

export function itemSupportsBodyType(
  item: ItemDefinition,
  bodyType: BodyType,
): boolean {
  return typeof item.layer_1?.[bodyType] === 'string';
}

function categorySegments(itemId: ItemId, item: ItemDefinition): readonly string[] {
  const path = item.sourcePath ?? `${item.type_name}/${itemId}.json`;
  const parts = path.split('/').filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1) : [item.type_name];
}

function makeNode(name: string): CatalogTreeNode {
  return { name, items: [], children: {} };
}

function sortNode(node: CatalogTreeNode): CatalogTreeNode {
  const sortedChildren = Object.fromEntries(
    Object.entries(node.children)
      .sort(([a], [b]) => a.localeCompare(b, ['en']))
      .map(([key, child]) => [key, sortNode(child)]),
  );
  return {
    name: node.name,
    items: [...node.items].sort((a, b) => a.name.localeCompare(b.name, ['en'])),
    children: sortedChildren,
  };
}

export function buildCatalogTree(catalog: Catalog): CatalogTreeNode {
  const root = makeNode('root');

  for (const [itemId, item] of catalog.byItemId.entries()) {
    let current = root;
    for (const segment of categorySegments(itemId, item)) {
      current.children[segment] ??= makeNode(segment);
      current = current.children[segment];
    }
    current.items.push({
      id: itemId,
      name: item.name,
      typeName: item.type_name,
    });
  }

  return sortNode(root);
}
```

- [ ] **Step 4: Run catalog tree tests**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- catalog-tree.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/slice/catalog-tree.ts packages/web/test/catalog-tree.test.ts
git commit -m "feat(web): derive advanced catalog tree"
```

## Task 5: Render Advanced All Assets Picker

**Files:**
- Modify: `packages/web/src/components/slice-harness.tsx`
- Modify: `packages/web/src/i18n.ts`
- Test: `packages/web/test/i18n.test.ts`

- [ ] **Step 1: Add translation test for Advanced labels**

Update `packages/web/test/i18n.test.ts`:

```ts
expect(en('picker.common')).toBe('Common');
expect(en('picker.advanced')).toBe('Advanced: all upstream assets');
expect(en('picker.searchAssets')).toBe('Search all assets');
expect(zh('picker.advanced')).toBe('進階：所有上游素材');
```

- [ ] **Step 2: Run i18n test to verify it fails**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- i18n.test.ts
```

Expected: FAIL because new picker labels do not exist.

- [ ] **Step 3: Add translations**

In `packages/web/src/i18n.ts`, add:

```ts
'picker.common': 'Common',
'picker.advanced': 'Advanced: all upstream assets',
'picker.searchAssets': 'Search all assets',
'picker.incompatibleBodyType': 'Not available for current body type',
```

```ts
'picker.common': '常用',
'picker.advanced': '進階：所有上游素材',
'picker.searchAssets': '搜尋所有素材',
'picker.incompatibleBodyType': '不支援目前身形',
```

- [ ] **Step 4: Add tree imports and state**

In `packages/web/src/components/slice-harness.tsx`, add:

```ts
import {
  buildCatalogTree,
  itemSupportsBodyType,
  type CatalogTreeItem,
  type CatalogTreeNode,
} from '../slice/catalog-tree';
```

Inside `SliceHarness`, add state and tree memo:

```ts
const [assetSearch, setAssetSearch] = useState('');
const catalogTree = useMemo(() => buildCatalogTree(catalog), [catalog]);
```

- [ ] **Step 5: Add helper functions inside `SliceHarness`**

Add these functions before `return`:

```ts
function pickTreeItem(item: CatalogTreeItem): void {
  const items = catalog.byTypeName.get(item.typeName) ?? [];
  const def = items.find((it) => it.name === item.name);
  dispatch({
    type: 'pick',
    typeName: item.typeName,
    name: item.name,
    ...(def?.variants?.[0] ? { variant: def.variants[0] } : {}),
  });
}

function treeItemMatches(item: CatalogTreeItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return (
    item.name.toLowerCase().includes(q) ||
    item.typeName.toLowerCase().includes(q)
  );
}

function nodeHasMatches(node: CatalogTreeNode, query: string): boolean {
  return (
    node.items.some((item) => treeItemMatches(item, query)) ||
    Object.values(node.children).some((child) => nodeHasMatches(child, query))
  );
}

function renderTreeNode(node: CatalogTreeNode, depth = 0): React.ReactNode {
  const query = assetSearch.trim();
  if (query && !nodeHasMatches(node, query)) return null;

  const entries = Object.values(node.children);
  const visibleItems = node.items.filter((item) => treeItemMatches(item, query));
  const showHeader = node.name !== 'root';

  return (
    <div key={node.name} className={depth > 0 ? 'ml-3' : undefined}>
      {showHeader && (
        <details className="group" open={query !== '' || depth < 1}>
          <summary className="cursor-pointer py-1 text-xs font-semibold text-text-mute hover:text-text">
            {node.name}
          </summary>
          <div className="space-y-1">
            {entries.map((child) => renderTreeNode(child, depth + 1))}
            {visibleItems.map((item) => {
              const def = (catalog.byTypeName.get(item.typeName) ?? []).find(
                (it) => it.name === item.name,
              );
              const compatible = def
                ? itemSupportsBodyType(def, state.bodyType)
                : false;
              const selected = state.selections[item.typeName]?.name === item.name;
              return (
                <button
                  key={`${item.typeName}:${item.name}`}
                  type="button"
                  disabled={!compatible}
                  title={!compatible ? t('picker.incompatibleBodyType') : item.typeName}
                  className={`block w-full rounded px-2 py-1 text-left text-xs ${
                    selected
                      ? 'bg-accent text-accent-contrast'
                      : compatible
                        ? 'text-text hover:bg-surface-2'
                        : 'text-text-dim opacity-60'
                  }`}
                  onClick={() => pickTreeItem(item)}
                >
                  <span>{item.name}</span>
                  <span className="ml-1 text-[10px] text-text-dim">
                    {item.typeName}
                  </span>
                </button>
              );
            })}
          </div>
        </details>
      )}
      {!showHeader && (
        <div className="space-y-1">
          {entries.map((child) => renderTreeNode(child, depth + 1))}
          {visibleItems.map((item) => (
            <button
              key={`${item.typeName}:${item.name}`}
              type="button"
              className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-surface-2"
              onClick={() => pickTreeItem(item)}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

If TypeScript complains about `React.ReactNode`, add this import:

```ts
import type React from 'react';
```

- [ ] **Step 6: Split Common and Advanced UI sections**

In the left aside, wrap the current `shownTypeNames.map(...)` block with:

```tsx
<section className="space-y-3 border-b border-border pb-3">
  <h2 className="text-xs font-bold uppercase">{t('picker.common')}</h2>
  {shownTypeNames.map((tn) => {
    // keep existing selector body unchanged
  })}
</section>

<section className="space-y-2">
  <h2 className="text-xs font-bold uppercase">{t('picker.advanced')}</h2>
  <input
    className="w-full rounded border border-border bg-surface-2 p-1 text-xs"
    value={assetSearch}
    placeholder={t('picker.searchAssets')}
    onChange={(e) => setAssetSearch(e.target.value)}
  />
  <div className="space-y-1">{renderTreeNode(catalogTree)}</div>
</section>
```

Keep the license filter and body type selectors above these sections.

- [ ] **Step 7: Run focused tests**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- i18n.test.ts catalog-tree.test.ts selection.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/components/slice-harness.tsx packages/web/src/i18n.ts packages/web/test/i18n.test.ts
git commit -m "feat(web): add advanced all-assets picker"
```

## Task 6: Integration Verification And Polish

**Files:**
- Modify as needed: files touched in Tasks 1-5
- Test: existing test suites

- [ ] **Step 1: Run full web and core tests**

Run:

```bash
pnpm --filter @lpc-toolkit/core test
pnpm --filter @lpc-toolkit/web test
```

Expected: PASS for both packages.

- [ ] **Step 2: Run typecheck/build**

Run:

```bash
pnpm --filter @lpc-toolkit/web build
```

Expected: PASS. The prebuild step should still copy the local spritesheet subset, not the full upstream folder.

- [ ] **Step 3: Start the app**

Run:

```bash
pnpm --filter @lpc-toolkit/web dev -- --host 127.0.0.1
```

Expected: Vite reports a local URL. Keep the server running for browser verification.

- [ ] **Step 4: Browser verification**

Open the Vite URL and verify:

- Source selector appears above the material pickers.
- `Auto`, `Local`, and `Upstream` buttons switch selected state.
- Common selectors still render and update the preview.
- Advanced tree shows categories beyond the old `PREFERRED` list, such as `headwear` or `weapons`.
- Searching for `rapier` or `magic` narrows the Advanced tree.
- In `Upstream` mode, selecting an Advanced item outside the old bundled subset attempts to render from the upstream URL.
- Attribution still lists credit entries after selecting Advanced items that render.

- [ ] **Step 5: Fix any verification issues with focused tests**

If a bug is found, add or update the closest focused test before changing code. Example for an Auto fallback regression:

```ts
it('returns local then upstream for auto mode', () => {
  expect(resolveSpriteUrlCandidates('spritesheets/a.png', 'http://x/', 'auto')).toEqual([
    'http://x/spritesheets/a.png',
    `${UPSTREAM_SPRITESHEET_BASE_URL}spritesheets/a.png`,
  ]);
});
```

Run the focused test first and confirm it fails, apply the minimal fix, then rerun it and the relevant package suite.

- [ ] **Step 6: Final commit**

```bash
git status --short
git add packages/core packages/web
git commit -m "test: verify all-assets material picker"
```

Skip this commit if there are no changes after verification.

## Self-Review

- Spec coverage: Common + Advanced hybrid is covered by Tasks 4-5. Asset source selector and Auto/Local/Upstream behavior are covered by Tasks 2-3. Core environment-agnostic behavior is preserved by keeping all image-source logic in web. Attribution is preserved by continuing to compose with core selections and explicitly verifying credits in Task 6.
- Placeholder scan: no `TBD`, `TODO`, or vague implementation steps remain.
- Type consistency: `AssetSource`, `CatalogTreeNode`, `CatalogTreeItem`, `sourcePath`, and `itemSupportsBodyType` are introduced before later tasks use them.
