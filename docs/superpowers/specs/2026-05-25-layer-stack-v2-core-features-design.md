# Web UI · Layer Stack v2 核心功能(Spec 1)

- 日期:2026-05-25
- 範圍:`packages/web`
- 狀態:設計已核可,待寫實作計畫
- 參考檔:`reference/v2/LPC-Toolkit-LayerStack.html`(內嵌沙盒,主標
  「Direction B · Layer Stack」)
- 前置 spec:`2026-05-24-web-ui-layer-stack-v2-design.md`
  (第一階段已落地,本 spec 處理該 spec 列為「非目標」的核心後續項目)

## 背景與問題

`2026-05-24` 的 spec 把 Layer Stack v2 第一階段(2 欄佈局 + 左欄圖層列表
+ Inline Style + 頂列彈窗)落地。當時為了縮 scope,把以下 3 項列為非目標:

1. **⌘K AdvancedPalette** — 跨全目錄的進階素材搜尋彈窗。
2. **真實 item thumbnail** — LayerRow 主行與 swap grid 的縮圖。
3. **AddLayer 5 super-group 重構** — 把 23 個 category 收成 5 群。

對比 reference 設計與目前 `packages/web/src/components/layer-stack/` 的
實作,這 3 項是「v2 設計理念能否站住」的關鍵:

- 左欄縮成「YOUR layers」的設計前提,是 ⌘K 作為進階素材的唯一入口。
  缺 ⌘K = 進階使用者無路可走。
- Swap grid 跟 LayerRow 目前是純色占位方塊,對 sprite 編輯器來說等同
  「憑名字選衣服」。
- AddLayer 展開態目前是扁平 filter input + list,跟 v2「依群分組、極簡」
  的精神矛盾。

本 spec 處理這 3 項核心功能。其餘 9 項設計差異(loading 搬位、preview
chrome、color ramp swatch、品牌 logo 等 cosmetic)留給 Spec 2 polish。

## 目標

- 把 ⌘K AdvancedPalette 加入 v2(modal + top bar trigger + 全域 keydown)。
- 把 LayerRow 主行與 swap grid 的占位方塊換成真實 thumbnail。
- 把 AddLayer 展開態重構成 5 super-group 分類純文字 pills。
- 不動 `packages/core/`。Thumbnail 走現有 `composeSelections` pipeline,
  純消費端。
- 不引入新 dependency。
- 不引入 portal,modal 用 `position: absolute` 放在 harness root。
- 沿用既有測試 pattern(pure logic only)。

## 非目標(YAGNI)

- AdvancedPalette 的鍵盤導航(↑↓ Enter)— 屬 polish,留 Spec 2。
- Thumbnail 預載入策略(intersection observer / 預跑常用群)。
- AddLayer pills 加 thumbnail(reference 也沒)。
- ⌘K 快捷鍵可設定。
- Thumbnail 失敗的 retry。
- 移除現有 v1(`slice-harness.tsx`)— 持續並存。
- 改動 `packages/core/`。

## 已核可的設計決策

1. **Spec 拆分**:Spec 1 涵蓋 3 個核心功能(本 spec);Spec 2 處理剩餘
   9 項 cosmetic 對齊。
2. **Thumbnail 策略**:複用 `composeSelections` + 模組級 LRU cache,不在
   core 新增 single-item 渲染 API。
3. **AddLayer UX**:完全照 reference — 5 群純文字 pills、無 filter input、
   無 first-item 預覽。Click 直接加入該 category 第一個 compatible item。
4. **AdvancedPalette 鍵盤**:只實作 Esc close + 全域 ⌘K toggle。Arrow 鍵
   導航留 Spec 2。
5. **檔案配置**:3 個新檔 + 4 個修改。Modal 放在 harness root 的 absolute
   容器內,不用 portal。

## 架構

### 整合點

```
LayerStackHarness
├── 新 state: paletteOpen
├── 新 effect: document keydown (Cmd/Ctrl+K) → toggle paletteOpen
├── TopBar children 多塞 <PaletteTrigger />
└── grid 容器內 mount <AdvancedPalette open={paletteOpen} />
```

### 目錄結構(差異部分)

```
packages/web/src/
├── slice/
│  └── category-groups.ts             // NEW
├── hooks/
│  └── use-item-thumbnail.ts          // NEW
├── components/
│  └── layer-stack/
│     ├── item-thumbnail.tsx          // NEW
│     ├── palette-trigger.tsx         // NEW
│     ├── advanced-palette.tsx        // NEW
│     ├── harness.tsx                 // MODIFY: paletteOpen + keydown
│     ├── top-bar.tsx                 // MODIFY (僅 children 用法,結構不變)
│     ├── layer-row.tsx               // MODIFY: 占位方塊 → ItemThumbnail
│     └── add-layer.tsx               // MODIFY: 重寫展開態 + 加 ⌘K 鈕
└── i18n.ts                            // MODIFY: 新 keys
```

## 模組詳述

### `slice/category-groups.ts`(新)

```ts
export type GroupId = 'body' | 'face' | 'clothing' | 'accessories' | 'weapons';

export interface CategoryGroup {
  id: GroupId;
  labelKey: string;            // 如 'group.body'
  typeNames: TypeName[];       // 實作時對齊 catalog-tree.ts
}

export const CATEGORY_GROUPS: readonly CategoryGroup[];
export function groupForType(typeName: TypeName): GroupId | null;
```

- 5 群依 reference 設計(Body & Skin / Hair & Face / Clothing /
  Accessories / Weapons)。
- TypeName 不屬於任何群者回 `null`,UI 暫時不顯示(或落入 fallback,
  實作時決定)。

### `hooks/use-item-thumbnail.ts`(新)

```ts
interface UseItemThumbnailArgs {
  typeName: TypeName;
  name: string;
  variant?: string;
  recolor?: Recolor;
  bodyType: BodyType;
  size: number;                // 24 | 28
  catalog: Catalog;
  palettes: PaletteMetadata;
  assetSource: AssetSource;
}

interface UseItemThumbnailResult {
  canvas: HTMLCanvasElement | null;
  status: 'loading' | 'ready' | 'error';
}

export function useItemThumbnail(args: UseItemThumbnailArgs): UseItemThumbnailResult;
```

- 模組級 LRU cache(`Map` 配合 insert-order 即可,JavaScript Map 保留
  插入序;cap 200,insert 時 evict oldest)。
- Cache key:
  `${bodyType}|${typeName}|${name}|${variant ?? '_'}|${recolorHash}|${size}`
- 渲染步驟:
  1. 組單一 item 的 `Selections`(bodyType + 該項)
  2. `composeSelections` 取 `ComposedSheet`
  3. `extractAnimation('walk')`(或 sheet.animations[0] fallback)
  4. `ctx.drawImage` 第一個 south frame 到 size×size offscreen canvas
  5. cache 並回傳
- reqId guard 丟棄 stale 結果(對齊 `use-composed-character` pattern)。

### `components/layer-stack/item-thumbnail.tsx`(新)

```tsx
interface Props {
  typeName: TypeName;
  name: string;
  variant?: string;
  recolor?: Recolor;
  size: 24 | 28;
  // 從 props 接(對齊現有 pattern,不引入 context)
  bodyType: BodyType;
  catalog: Catalog;
  palettes: PaletteMetadata;
  assetSource: AssetSource;
}
```

- 薄包裝,內部呼叫 `useItemThumbnail`。
- `status === 'loading' | 'error'` 顯示原占位灰塊(維持目前 `bg-surface-2`
  圓角樣式),只在 `ready` 時 swap 進 `<canvas>`。

### `components/layer-stack/palette-trigger.tsx`(新)

```tsx
interface Props { onOpen: () => void; t: Translator; }
```

- 搜尋 icon + `t('palette.title')` 文字 + `⌘K` 提示 chip。
- Tailwind utility 樣式對齊 reference(寬 ~200px、圓角邊框、surface-2 底)。

### `components/layer-stack/advanced-palette.tsx`(新)

```tsx
interface Props {
  open: boolean;
  onClose: () => void;
  onPicked: (typeName: TypeName) => void;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  catalog: Catalog;
  palettes: PaletteMetadata;
  assetSource: AssetSource;
  licenseFilter: LicenseFilter;
  t: Translator;
  tl: LabelTranslator;
}
```

- 內部 state:`query: string`、`inputRef: RefObject<HTMLInputElement>`。
- 結果計算(`useMemo`,deps: query / bodyType):
  1. flatten 全 catalog items
  2. filter:query 對 `item.name`、category label、author 之 substring(case
     insensitive)
  3. sort:compat(bodyType)-first → category 顯示序 → name
  4. `slice(0, 60)`
- 列表項:`ItemThumbnail size={24}` + name + category 標籤 + author + license
  badge + 警告 icon。
- 鍵盤:Esc close(global doc listener,open 時掛載、close 時卸載)。
- Click 結果 → `dispatch({type:'pick', typeName, name})` + `onPicked(typeName)`。
- 不相容:disabled + `opacity: 0.35` + `incompatible` 角標。
- License 超出:`opacity: 0.65` + 警告 icon(沿用 `licenseExceedsFilter`)。
- 已選中:check icon。
- DOM:`absolute inset-0 z-50`,backdrop blur,中央卡片寬 640、最大高 520。
- **抽出 pure helper**:`filterAndRankPaletteItems(catalog, bodyType, query)`
  以便單測。

### 修改:`add-layer.tsx`

- 收合態:2 顆 dashed pill 並排
  - `[+ Add layer (N available)]` 主鈕
  - `[search-icon ⌘K]` 副鈕(右側,固定寬度)
- 展開態完全重寫:
  - 刪除 filter input
  - `CATEGORY_GROUPS.map(g => ...)` 每群算交集 `g.typeNames ∩ inactive`
  - 空交集隱藏該群
  - 群 header(uppercase 10px tracking-wide)+ pills row
  - Pill 文字 `+ {tl.category(tn)}`
  - Pill click → 取該 category 第一個 compatible item(`itemSupportsBodyType`)
    → `dispatch pick` → `onAdded(tn)`
  - 無 compatible item 的 category → disabled pill + cursor not-allowed
- 新 props:`onOpenPalette: () => void`、`bodyType: BodyType`。

### 修改:`layer-row.tsx`

- `:39` 主行占位 div → `<ItemThumbnail size={28} typeName={typeName}
  name={selection.name} variant={selection.variant}
  recolor={selection.recolor} ... />`
- `:100` swap grid 占位 div → `<ItemThumbnail size={24} typeName={typeName}
  name={it.name} ... />`(刻意不帶 user 的 recolor/variant,讓 swap grid
  顯示 item 預設外觀,加速 cache 命中)
- 從 props 接 `bodyType / palettes / assetSource`(harness 已有)。

### 修改:`harness.tsx`

- 新 state `paletteOpen: boolean`。
- `useEffect` document keydown:
  ```ts
  (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
    → e.preventDefault(); setPaletteOpen(o => !o);
  ```
- 加 `assetSource` 進現有 props transit 鏈(到 stack-panel → layer-row →
  item-thumbnail)。
- TopBar children 末端在現有 popovers 之外多塞 `<PaletteTrigger />`。
- grid 容器加 `relative`,內部最後 mount:
  ```tsx
  {paletteOpen && <AdvancedPalette
    open onClose={() => setPaletteOpen(false)}
    onPicked={(tn) => { setExpanded(tn); setPaletteOpen(false); }}
    ... />}
  ```

### 修改:`top-bar.tsx`

- 結構不變,children slot 已能容納 PaletteTrigger。
- 確認 PaletteTrigger 渲染順序合理(BodyType 之後、locale toggle 之前)
  — 由 harness 決定 children 順序。

### 修改:`i18n.ts`

新 keys(en + zh-TW 兩本都加):

| key | en | zh-TW |
|---|---|---|
| `palette.title` | Search all assets… | 搜尋所有素材… |
| `palette.placeholder` | Search by name, category, author | 依名稱、分類、作者搜尋 |
| `palette.no_match` | No matches. | 找不到符合的項目。 |
| `palette.incompatible` | incompatible | 不相容 |
| `add.search` | Search all | 搜尋全部 |
| `group.body` | Body & Skin | 身體 |
| `group.face` | Hair & Face | 髮型與臉部 |
| `group.clothing` | Clothing | 服裝 |
| `group.accessories` | Accessories | 配件 |
| `group.weapons` | Weapons | 武器 |

(文案可在實作 PR 微調,以上為初稿。)

## Data flow

### ⌘K open → pick item

1. User 按 `⌘K`(或點 PaletteTrigger)→ harness `setPaletteOpen(true)`
2. AdvancedPalette mount,autofocus 搜尋框
3. User 打字 → `useMemo` 重算 filtered+sorted results
4. User 點一筆 → `dispatch pick` → `onPicked(typeName)` → harness 設
   `paletteOpen=false` + `setExpanded(typeName)` 展開該 layer
5. Esc / 點 backdrop → `onClose()` → harness 設 `paletteOpen=false`

### Thumbnail flow(每個 ItemThumbnail 實例)

1. Mount/props 改變 → 計算 cache key
2. Cache hit → 直接 return canvas,`status='ready'`
3. Cache miss → `setState status='loading'`,啟動 async compose
4. async 完成 → 寫 cache,`setState status='ready'`,觸發 re-render
5. 卸載中:reqId guard 丟棄 stale 結果

### AddLayer flow

- 收合 → 兩顆 pill。`+ Add` 顯示 inactive count;`⌘K` 開 palette
- 展開 → 依 GROUPS 渲染,空群隱藏
- 點 pill → 第一個 compatible item → dispatch pick → 收 add UI + 展開該 layer

## 錯誤處理

| 情境 | 處理 |
|---|---|
| Thumbnail compose 失敗 | `status='error'`,渲染占位灰塊(現有樣式) |
| Thumbnail compose race | reqId guard 丟棄 stale `.then` |
| Palette 搜尋無結果 | 顯示 `t('palette.no_match')` |
| ⌘K 與瀏覽器內建衝突 | `e.preventDefault()` 攔截(對齊 reference) |
| ⌘K 在 input/textarea focus 時觸發 | 不特別 guard。⌘K 永遠可用 |
| AddLayer 點 disabled pill | onClick early return |

## 測試策略

沿用現有 vitest pattern(`packages/web/test/*.test.ts`,pure logic only,
不寫 React 元件渲染測試)。

新增測試檔:

- `test/category-groups.test.ts` — 每個 catalog TypeName 對 GROUPS 的歸屬;
  允許 null 的 TypeName 列表不超過預期。
- `test/palette-search.test.ts` — `filterAndRankPaletteItems` pure
  function:query 匹配、compat 排序、limit。
- `test/thumbnail-cache.test.ts` — LRU cache 行為:insert 滿時 evict oldest、
  讀取觸發 recency 更新、cache key 一致性。

不寫:
- AdvancedPalette / ItemThumbnail / AddLayer 元件渲染測試。
- 全鏈路 compose pipeline(已有 `integration.test.ts`)。

## Open questions(留實作時決定,不阻塞 spec)

1. **GROUPS 對應的真實 TypeName 集合** — 實作時對齊 `catalog-tree.ts`,
   未涵蓋者列入 spec 後續迭代。
2. **Thumbnail 取 walk vs 其他 anim** — 預設 walk,fallback `sheet.animations[0]`;
   若多數 item walk 表現不佳再調。
3. **i18n 文案微調** — spec 提初稿,實作 PR 可微改。

## Out of scope(明確排除)

- AdvancedPalette 鍵盤導航(↑↓ Enter)
- Thumbnail 預載入 / intersection observer
- Thumbnail 加到 AddLayer pills(reference 也沒)
- ⌘K 可設定快捷鍵
- Thumbnail 失敗 retry
- 移除 v1
- Spec 2 涵蓋的 9 個 cosmetic 對齊項目

## 後續

Spec 通過 → 寫 `2026-05-25-layer-stack-v2-core-features-plan.md`
實作計畫 → 依計畫分次 PR 落地 → 啟動 Spec 2(剩餘 cosmetic 對齊)。
