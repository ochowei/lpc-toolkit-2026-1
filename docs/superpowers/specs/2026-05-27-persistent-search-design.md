# Web UI · 常駐 Sidebar Search(Sub-project E2)

- 日期:2026-05-27
- 範圍:`packages/web`
- 狀態:設計已核可,待寫實作計畫
- 上層 roadmap:`2026-05-26-upstream-feature-parity-roadmap.md`(Sub-project E,迷你拆分 E2)
- 比對對象:`upstream/sources/components/filters/SearchControl.js`
- 前置 sub-project:E1(License Filter UI,已 merge)

## 背景與問題

v2 web UI 目前的搜尋功能藏在 `⌘K` modal(`AdvancedPalette`)後面。TopBar 有
一顆假搜尋鈕(`PaletteTrigger`)點開全螢幕 modal,modal 內含實際 input + 結
果列表。功能完整但有兩個 UX 落差:

1. **不夠 discoverable**:新使用者看不出來那是搜尋,以為是 placeholder
2. **與上游不一致**:上游(`SearchControl.js`)是 sidebar 內的常駐
   `<input type="search">`,使用者一打開就能搜

本 spec 把搜尋提升為 sidebar 常駐元件:input 直接渲染在 sidebar 最頂端,
打字時 dropdown 浮在 input 下方顯示結果。`AdvancedPalette` modal +
`PaletteTrigger` 全刪;`⌘K` 改為 focus 此 input。

## 目標

- 新增 `SidebarSearch` 元件,常駐 sidebar 最頂端
- 打字時 floating dropdown(absolute 定位)顯示 top 60 結果
- 鍵盤 nav(↑ ↓ Enter Esc)完整支援
- `⌘K` shortcut 改為 focus sidebar input(已 focused + 有 query → 全選)
- 刪除 `AdvancedPalette` + `PaletteTrigger` 兩個檔(YAGNI;功能已被 SidebarSearch 涵蓋)
- 重用既有 `filterAndRankPaletteItems` 純函式,零變動
- 重用既有 i18n key(`palette.title` / `palette.placeholder` / `palette.no_match` / `palette.incompatible` / `palette.licenseGroupsBadge`)
- 新增鍵盤 reducer 純函式 + 單元測試(沿用 codebase 「pure logic test only」慣例)

## 非目標(YAGNI)

- **License filter badge 互動**:dropdown header 顯示 read-only `{n}/5 groups`,不可點擊
- **Fuzzy search**:沿用 `.includes()` 比對
- **Search history / recent picks**:不做
- **Mobile / narrow screen 適配**:sidebar 固定 340px
- **`isPending` indicator**:`useDeferredValue` 的 stale flash 不顯示讀取狀態
- **dropdown footer keyboard hint i18n**:`esc close` inline 即可
- **改 `filterAndRankPaletteItems` API**:零變動
- **Component-level Testing-Library 測試**:codebase 無 DOM 測試前例,改用手動 dev server 驗收

## 已收斂的設計決策

1. **位置**:sidebar 最頂端(PresetChips 上方)
2. **結果呈現**:floating dropdown,absolute 定位,query 非空 + input focused 才顯示
3. **`⌘K` 行為**:focus + select sidebar input;`AdvancedPalette` modal 刪除
4. **鍵盤 nav**:↑↓ 移選、Enter 選取(active=−1 + 有結果 → 預設第一個)、Esc 兩段(dropdown 開 → 清+收;dropdown 關 → input blur)
5. **License badge**:dropdown header 顯示 `{n}/5 groups`(沿用 AdvancedPalette 邏輯;< 5 才顯示)
6. **結果數上限**:60(沿用 `RESULT_LIMIT`)
7. **dropdown 滾動**:`block: 'nearest'` 跟隨 activeIndex
8. **Pick 後行為**:dispatch pickActionForItem + setExpanded(typeName) + 清 query + blur input
9. **Click outside**:close dropdown,保留 query

## 設計

### §1 · 元件邊界與檔案結構

**新增**
- `packages/web/src/components/layer-stack/sidebar-search.tsx`
- `packages/web/src/components/layer-stack/sidebar-search-keyboard.ts`(純函式)
- `packages/web/test/sidebar-search-keyboard.test.ts`

**刪除**
- `packages/web/src/components/layer-stack/advanced-palette.tsx`
- `packages/web/src/components/layer-stack/palette-trigger.tsx`

**修改**
- `packages/web/src/components/layer-stack/harness.tsx`
- `packages/web/src/components/layer-stack/stack-panel.tsx`
- 視 grep 結果處理:`add-layer.tsx`(若依賴 `onOpenPalette`)、`i18n.ts`(若 `picker.searchAssets` 不再有人用)

**重用(零變動)**
- `palette-search.ts`(`filterAndRankPaletteItems`)
- `ItemThumbnail`
- i18n keys:`palette.title` / `palette.placeholder` / `palette.no_match` / `palette.incompatible` / `palette.licenseGroupsBadge`

### §2 · `SidebarSearch` 元件

**Props**

```ts
interface Props {
  catalog: Catalog;
  palettes: PaletteMetadata;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  assetSource: AssetSource;
  shownTypeNames: TypeName[];
  licenseFilter: LicenseFilter;
  t: Translator;
  tl: LabelTranslator;
  onPicked: (typeName: TypeName) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}
```

**Local state**

- `query: string`
- `activeIndex: number`(0..N-1;−1 = 未選)
- `isFocused: boolean`
- `useDeferredValue(query)` 降頻計算

**Dropdown 顯示條件**

```ts
const showDropdown = deferredQuery.trim().length > 0 && isFocused;
```

input 失去 focus → dropdown 關但 query 保留;再 focus 進來 → 條件再次成立 → dropdown 重開。

**結果計算**

```ts
const results = useMemo(
  () => filterAndRankPaletteItems({
    catalog, bodyType: state.bodyType, query: deferredQuery, shownTypeNames,
  }),
  [catalog, state.bodyType, deferredQuery, shownTypeNames],
);
const shown = results.slice(0, 60);
```

**版面**

```
┌──── SidebarSearch ────────────────────┐
│ ┌──────────────────────────────────┐  │
│ │ 🔍 [query...]  {n}/5 groups  ⌘K │  │
│ └──────────────────────────────────┘  │
│       (dropdown,absolute,z-index)     │
│       ┌─────────────────────────────┐ │
│       │ [thumb] hair_long           │ │ ← row
│       │         hair                │ │
│       │ ...                         │ │ overflow-y-auto, max-h ~50vh
│       │─────────────────────────────│ │
│       │ {n} of {total}    esc close │ │ footer
│       └─────────────────────────────┘ │
```

**Row 樣式**(沿用 AdvancedPalette)

| 狀況 | className |
|---|---|
| `!supports`(body type 不相容)| `opacity-35 cursor-not-allowed`,disabled |
| `!matchesFilter`(license) | `opacity-65` + 角落 `⚠`(`text-danger`) |
| `selected`(已是該 typeName 目前 selection)| 右側 `✓`(`text-accent`) |
| `i === activeIndex`(鍵盤高亮)| 額外 `bg-surface-2` |

**鍵盤行為(input 內)**

| 按鍵 | 條件 | 動作 |
|---|---|---|
| `Esc` | dropdown 開 | setQuery('') + activeIndex=−1 + 收(input 保持 focus) |
| `Esc` | dropdown 關(query 空)| input blur |
| `↓` | dropdown 開 | activeIndex = nextActiveIndex(curr, 'ArrowDown', shown.length) |
| `↑` | dropdown 開 | activeIndex = nextActiveIndex(curr, 'ArrowUp', shown.length) |
| `Enter` | dropdown 開 | pickIndexForEnter(activeIndex, shown.length) → 若非 null + supports → onPick |

**滾動跟隨**

```ts
const activeRowRef = useRef<HTMLButtonElement>(null);
useEffect(() => {
  activeRowRef.current?.scrollIntoView({ block: 'nearest' });
}, [activeIndex]);
```

每個 row JSX 加 `ref={i === activeIndex ? activeRowRef : undefined}`。

**Click outside**

用 `pointerdown` listener:target 不是 input 也不在 dropdown DOM 內 → 設 `isFocused = false`(等同 dropdown 關;不清 query)。

**Pick 函式**

```ts
function onPick(result: PaletteResult) {
  if (!result.supports) return;
  dispatch(pickActionForItem(result.typeName, result.item));
  onPicked(result.typeName);   // harness → setExpanded
  setQuery('');
  setActiveIndex(-1);
  inputRef.current?.blur();
}
```

**License badge**

```tsx
{licenseFilter.size < LICENSE_GROUP_ORDER.length && (
  <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-[10px] text-accent">
    {t('palette.licenseGroupsBadge').replace('{n}', String(licenseFilter.size))}
  </span>
)}
```

### §3 · 純函式 `sidebar-search-keyboard.ts`

```ts
export type ArrowKey = 'ArrowUp' | 'ArrowDown';

export function nextActiveIndex(
  curr: number,
  key: ArrowKey,
  resultsLen: number,
): number {
  if (resultsLen === 0) return -1;
  if (key === 'ArrowDown') return Math.min(curr + 1, resultsLen - 1);
  return Math.max(curr - 1, -1);
}

export function pickIndexForEnter(
  active: number,
  resultsLen: number,
): number | null {
  if (resultsLen === 0) return null;
  if (active >= 0) return active;
  return 0;
}
```

### §4 · Harness / StackPanel 整合

**harness.tsx**

刪:
- `import { PaletteTrigger } from './palette-trigger';`
- `import { AdvancedPalette } from './advanced-palette';`
- `const [paletteOpen, setPaletteOpen] = useState(false);`
- TopBar 內 `<PaletteTrigger ...>`
- grid 內 `<AdvancedPalette ...>`
- `onOpenPalette` 從傳給 StackPanel 的 props 移除

新增:
```ts
const searchInputRef = useRef<HTMLInputElement>(null);
```

改寫 ⌘K listener(harness.tsx 第 160-170 行):
```ts
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}, []);
```

StackPanel 那條 prop 改傳 `searchInputRef`:
```tsx
<StackPanel
  ...
  searchInputRef={searchInputRef}
  // 移除:onOpenPalette={() => setPaletteOpen(true)}
/>
```

**stack-panel.tsx**

Props 介面:
- 移除 `onOpenPalette: () => void`
- 新增 `searchInputRef: React.RefObject<HTMLInputElement>`

JSX 結構:

```tsx
return (
  <div className="flex h-full min-h-0 flex-col">
    <SidebarSearch
      catalog={catalog} palettes={palettes} state={state} dispatch={dispatch}
      assetSource={assetSource} shownTypeNames={shownTypeNames}
      licenseFilter={licenseFilter} t={t} tl={tl}
      onPicked={(tn) => setExpanded(tn)}
      inputRef={searchInputRef}
    />
    <PresetChips ... />
    <StatusToast ... />
    {/* 其餘照舊 */}
  </div>
);
```

**`AddLayer` 的 `onOpenPalette`(視 grep)**

實作時先 grep `onOpenPalette`:
- 若 `AddLayer` 只用它做「點按鈕 → 開 palette modal」shortcut → 改成 focus `searchInputRef.current`
- 若用作其他流程 → 留 prop,改傳一個 focus 的 noop callback
- 若沒用到 → 刪 prop chain

**`picker.searchAssets` i18n key(視 grep)**

grep 全 src 確認用法:
- 若只有 `PaletteTrigger` 用 → PaletteTrigger 刪後此 key 也刪
- 若 `AddLayer` 也用 → 留

### §5 · 測試策略

**新增 unit tests — `test/sidebar-search-keyboard.test.ts`**

`nextActiveIndex` 矩陣:

| Case | curr | key | resultsLen | Expected |
|---|---|---|---|---|
| ↓ from −1 | −1 | ArrowDown | 5 | 0 |
| ↓ at end | 4 | ArrowDown | 5 | 4 |
| ↑ from 0 | 0 | ArrowUp | 5 | −1 |
| ↑ at −1 | −1 | ArrowUp | 5 | −1 |
| empty results | 0 | ArrowDown | 0 | −1 |

`pickIndexForEnter` 矩陣:

| Case | active | resultsLen | Expected |
|---|---|---|---|
| active=−1, results=5 | −1 | 5 | 0 |
| active=3, results=5 | 3 | 5 | 3 |
| active=−1, results=0 | −1 | 0 | null |
| active=0, results=0 | 0 | 0 | null(empty wins)|

**Component-level 行為**手動 dev server 驗收(§6 風險表 + 下方 acceptance list)。

**目標**
- baseline(184)+ 9 新 case = **193 web tests**,core 全綠維持

### §6 · 實作切分與風險

**檔案異動清單**

| 檔案 | 動作 | 規模 |
|---|---|---|
| `sidebar-search-keyboard.ts` | 新建 | 小 |
| `sidebar-search.tsx` | 新建 | 中 |
| `harness.tsx` | 改寫 ⌘K listener + 拆 modal/trigger + 加 ref | 中 |
| `stack-panel.tsx` | props 調整 + 插入 SidebarSearch | 小 |
| `advanced-palette.tsx` | **刪除整檔** | — |
| `palette-trigger.tsx` | **刪除整檔** | — |
| `add-layer.tsx`(視 grep)| 處理 onOpenPalette | 小 |
| `i18n.ts`(視 grep)| 視情況刪 `picker.searchAssets` | 微 |
| `test/sidebar-search-keyboard.test.ts` | 新建 | 小 |

**Task 切分**

| # | Task | 動到的檔 | review 等級 |
|---|---|---|---|
| 1 | Keyboard reducer + tests | `sidebar-search-keyboard.ts` + test | **完整 review** |
| 2 | `SidebarSearch` 元件 | `sidebar-search.tsx` | **完整 review** |
| 3 | Harness 拆 modal + 接 ⌘K + ref | `harness.tsx` | **完整 review** |
| 4 | StackPanel 插入 + props 透傳 + AddLayer / i18n cleanup(視 grep)| `stack-panel.tsx`, `add-layer.tsx`, `i18n.ts` | **完整 review** |
| 5 | 刪掉舊 AdvancedPalette / PaletteTrigger | `git rm` 2 個檔 | 簡 review |

**依賴**

```
1 (keyboard) ─► 2 (sidebar-search 用)
                  │
                  ├─► 3 (harness 接 ref)
                  └─► 4 (stack-panel 接 ref + 插)
                       │
                       └─► 5 (確認沒人 import 舊檔)
```

序列建議 1→2→3→4→5。

**風險**

| 風險 | 緩解 |
|---|---|
| ⌘K 已 focus 時應全選 query | `.focus() + .select()` |
| Dropdown 蓋住 sidebar 其他內容 | `absolute` + `z-index` + `inset-x` 對齊 input |
| Sidebar 340px 寬,row 排版要塞下 | 沿用 AdvancedPalette row layout(24px thumb + truncate) |
| `scrollIntoView` 跳得太大 | `block: 'nearest'` |
| `useDeferredValue` stale flash | 沿用 slice-harness.tsx pattern;不加 isPending |
| AddLayer onOpenPalette 用法若是核心流程 | 實作前 grep 全文確認 |
| Dropdown overflow 與 sidebar 滾動互動 | dropdown 用 `absolute` 浮在上,不參與 sidebar 滾動 |

## 驗收

- [ ] Sidebar 最頂端有 SidebarSearch input
- [ ] 打字時 dropdown 浮在 input 下方,query 非空才顯示
- [ ] Dropdown 顯示最多 60 結果,supports/unsupported/已選/不在 license 的視覺差異一致
- [ ] ↑↓ 鍵 navigation,activeIndex 高亮,scrollIntoView 跟隨
- [ ] Enter 在 active=−1 時選第一個,active≥0 時選 active
- [ ] Esc 兩段:dropdown 開 → 清 query + 收;dropdown 關 → input blur
- [ ] ⌘K focus + select input(已 focus + 有 query → 全選)
- [ ] Pick 後:dispatch + setExpanded + 清 query + blur
- [ ] Click outside dropdown → 收 dropdown,保留 query
- [ ] License badge 在 size < 5 時顯示 `{n}/5 groups`
- [ ] `AdvancedPalette` + `PaletteTrigger` 兩個檔不存在於 src
- [ ] `paletteOpen` state 不存在於 harness
- [ ] AddLayer onOpenPalette 處理(視 grep)結果合理
- [ ] `picker.searchAssets` 視 grep 結果決定刪/留
- [ ] web tests +9 個(共 193),core + 全部 web tests 全綠
