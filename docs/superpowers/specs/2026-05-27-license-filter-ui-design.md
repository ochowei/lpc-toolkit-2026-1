# Web UI · License Filter UI 改寫(Sub-project E1)

- 日期:2026-05-27
- 範圍:`packages/web`
- 狀態:設計已核可,待寫實作計畫
- 上層 roadmap:`2026-05-26-upstream-feature-parity-roadmap.md`(Sub-project E,迷你拆分 E1)
- 比對對象:
  - `upstream/sources/components/filters/LicenseFilters.js`
  - `upstream/sources/state/filters.ts`(`isItemLicenseCompatible` / `getAllowedLicenses`)
- 後續迷你 sub-projects:E2(常駐 Search)、E3(F8 Animation Filters)、E4(F12 Custom upload + Z-Position)

## 背景與問題

v2 web UI 目前的 License Filter 是「**單一上限下拉**」(`SettingsCollapsible`
裡一個 `<select>`,選一個 license 版本如 `CC-BY 4.0`),語意為「只顯示 effective
license **小於等於**所選的 item」。這在內部用 `licenseExceedsFilter` +
`LICENSE_GROUP_ORDER` + `LICENSE_VERSION_RANK` 算 ceiling 比較。

上游(`LicenseFilters.js`)的語意完全不同:**逐 group 勾選**(5 個 checkbox:
CC0 / CC-BY / CC-BY-SA / OGA-BY / GPL),predicate 為「item 至少有一個 credit
license 落在啟用 group 內」。預設全 5 個啟用 = 等同無過濾。配套有「Remove N
Incompatible Asset(s)」按鈕,一鍵清掉不在勾選 group 內的已選 items。

兩種互動模型差別不只是 UI 細節 — 是 set inclusion(set 包含)vs ceiling
comparison(漸層比較)。本 spec 把 v2 全面換到上游語意,讓 v2 在 license
filter 互動上完全對齊上游官方工具。

## 目標

- `LicenseFilter` 型別從 `License | null` 換成 `ReadonlySet<LicenseGroup>`
- `itemMatchesLicenseFilter(item, enabledGroups)` 語意對齊上游
  `isItemLicenseCompatible`(set inclusion;empty credits = 視為 compatible)
- `licenseExceedsFilter` 刪除(set inclusion 沒有「exceeds」漸層,二元判斷
  夠用)
- `SettingsCollapsible` 內 License Filter section 改為 5 個 group checkbox +
  外連各 license URL + 條件式「Remove N Incompatible Asset(s)」按鈕
- 預設全 5 group 啟用,等於無過濾
- 受影響呼叫端(`attribution-popover` / `layer-row` / `advanced-palette`)
  跟著遷移到新 helper
- v1 path(`slice-harness.tsx`)行為凍結,不升級
- 8~12 個新增測試,核心 helper 行為與 UI 互動都涵蓋

## 非目標(YAGNI)

- **URL hash sync**:license filter 保持 session-only,不擴 hash schema
  (理由:預設全啟用 = 無過濾,進階使用者罕主動關 group,且不太會想分享
  「我關掉 GPL 的視圖」)
- **v1 path 升級**:`slice-harness.tsx` 維持舊 `License | null` 行為,僅
  inline 重複型別避免被新 slice 污染
- **bulk dispatch action**:`clear_many` 不加;Remove Incompatible 用 loop
  dispatch `clear`,React 18 自動 batch 即可
- **`alert()` 通知**:上游 Remove 後 alert,v2 改用既有 `status` toast
- **「全選/全不選」批次按鈕**:5 個 checkbox 直接點即可
- **keyboard shortcut**:無
- **Animation filter / F8**:那是 E3 的 scope
- **改動 `computeEffectiveLicense`**:attribution popover 仍可保留 effective
  license tag 顯示,只是 incompatibility 判定不再倚賴它

## 已收斂的設計決策

1. **UI 粒度**:5 個 group checkbox(對齊上游),不做 12 個 individual license
2. **Remove Incompatible 按鈕**:加(對齊上游)
3. **元件擺放**:留在 `SettingsCollapsible` 內,Asset Source 區塊不動
4. **URL hash**:不寫,session-only
5. **狀態型別**:`ReadonlySet<LicenseGroup>`(非 `Record<LicenseGroup, boolean>`
   也非 `LicenseGroup[]`)
6. **helper 收斂**:只保留 `itemMatchesLicenseFilter`,刪 `licenseExceedsFilter`
7. **Reset 行為**:`view` scope reset 時把 filter 回 `ALL_GROUPS`;`outfit`-only
   reset 不動 filter
8. **credits 為空語意**:回 `true`(對齊上游 `isItemLicenseCompatible`,
   舊 v2 是回 `false` — 此為有意翻轉)
9. **Remove Incompatible 通知**:用既有 `status` toast,不用 `alert()`
10. **Settings header badge**:5/5 enabled 時無 badge;< 5 顯示 `{n}/5` accent
    badge(取代舊 `≤ {filter}` badge)
11. **toggle API**:由 harness 暴露 `toggleLicenseGroup(group)`,不傳整個
    setter(`setLicenseFilter`)— 單一 atomic action 較好理解

## 設計

### §1 · Slice 語意改寫(`slice/license-filter.ts`)

**型別**

```ts
// 舊:
export type LicenseFilter = License | null;

// 新:
export type LicenseFilter = ReadonlySet<LicenseGroup>;
```

**helper**

```ts
// 移除:
// export function licenseExceedsFilter(...) — 整支函式刪除
//
// 改寫:
export function itemMatchesLicenseFilter(
  item: ItemDefinition,
  enabledGroups: LicenseFilter,
): boolean;
```

**新語意(對齊上游 `isItemLicenseCompatible`)**

1. `item.credits` 為空 → 回 `true`(無 license 資訊,假設相容)
2. `enabledGroups.size === 0` → 回 `false`(零啟用 = 全部不相容)
3. 任一 credit 的任一 license 的 group 在 `enabledGroups` 內 → 回 `true`
4. 否則 → 回 `false`

```ts
export function itemMatchesLicenseFilter(
  item: ItemDefinition,
  enabledGroups: LicenseFilter,
): boolean {
  if (item.credits.length === 0) return true;
  if (enabledGroups.size === 0) return false;
  return item.credits.some((credit) =>
    credit.licenses.some((license) =>
      enabledGroups.has(LICENSE_GROUP_OF[license])
    )
  );
}
```

**舊 callers 遷移對映**

| 呼叫端 | 舊 | 新 |
|---|---|---|
| `attribution-popover.tsx` | `licenseExceedsFilter(effective, filter)` | `!itemMatchesLicenseFilter(item, enabledGroups)` |
| `layer-row.tsx` | `!itemMatchesLicenseFilter(item, filter)` | signature 不變,filter 型別變 |
| `advanced-palette.tsx` | `licenseExceedsFilter` + `itemMatchesLicenseFilter` | 只剩 `itemMatchesLicenseFilter` |

### §2 · UI 改寫(`settings-collapsible.tsx`)

**版面**

```
▾ SETTINGS                              [collapsed badge: 3/5 ←若 < 5 才顯示]
  LICENSE FILTERS                       (3/5 enabled)
  [x] CC0          (Show license)
  [ ] CC-BY        (Show license 4.0)
  [x] CC-BY-SA     (Show license 4.0)
  [ ] OGA-BY       (Show license 3.0)
  [x] GPL          (Show license 3.0)

  ┌─ ⚠️  2 selected items not in enabled licenses ──┐
  │ [ Remove 2 Incompatible Assets ]                │   ← incompatibleCount > 0 時才顯示
  └─────────────────────────────────────────────────┘
  ───────────────────────────────────────────────────
  ASSET SOURCE
  [auto] [local] [upstream]
```

**Header badge 規則**

- `enabledCount === 5` → 不顯示 badge
- `enabledCount < 5` → 顯示 `{n}/5` accent 色 badge
- 取代舊版的 `≤ {filter}` badge

**checkbox 列結構**

每列:`<label>` 包 `<input type=checkbox>` + group label + 外連 `<a>` 到
`LICENSE_CONFIG[*].url`。順序按 `LICENSE_GROUP_ORDER`(CC0 → CC-BY → OGA-BY
→ CC-BY-SA → GPL)。連結文字加上 `urlLabel`(若有),例:`Show license 4.0`。

**Remove 區塊互動**

- `incompatibleCount === 0` → 整個 warning + button 區塊不渲染(完全不在 DOM)
- 點擊 button → 呼叫 `removeIncompatibleSelections()`(由 harness 注入)
- 不彈 `alert()`,移除完成由 harness 觸發 `status` toast 顯示
  `"Removed N incompatible asset(s)"`

**Props 變更**

```ts
// 舊:
interface Props {
  t: Translator;
  licenseFilter: LicenseFilter;  // License | null
  setLicenseFilter: (v: LicenseFilter) => void;
  assetSource: AssetSource;
  setAssetSource: (v: AssetSource) => void;
}

// 新:
interface Props {
  t: Translator;
  licenseFilter: LicenseFilter;                       // ReadonlySet<LicenseGroup>
  toggleLicenseGroup: (group: LicenseGroup) => void;
  incompatibleCount: number;
  removeIncompatibleSelections: () => void;
  assetSource: AssetSource;
  setAssetSource: (v: AssetSource) => void;
}
```

`toggleLicenseGroup` 取代 `setLicenseFilter`:單一 atomic action 比每次傳新
Set 簡潔。`incompatibleCount` 由父層算好傳下來,避免本元件再掃一次
`state.selections`(`AttributionPopover` 也需這個數,共用一份計算)。

### §3 · State 持有與 reset(`harness.tsx`)

**初值**

```ts
import { LICENSE_GROUP_ORDER, type LicenseGroup } from '@lpc-toolkit/core';

const ALL_GROUPS: ReadonlySet<LicenseGroup> = new Set(LICENSE_GROUP_ORDER);

const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>(ALL_GROUPS);
```

**toggle**

```ts
const toggleLicenseGroup = useCallback((group: LicenseGroup) => {
  setLicenseFilter((prev) => {
    const next = new Set(prev);
    if (next.has(group)) next.delete(group); else next.add(group);
    return next;
  });
}, []);
```

**incompatible 計算(`useMemo`)**

harness 算一次,供 `SettingsCollapsible`(顯示 Remove 區塊)與
`removeIncompatibleSelections`(loop dispatch)共用。`AttributionPopover`
內部已自行掃 `state.selections`(現有 rows useMemo),那邊直接複用,**不從
harness 拉 prop**,避免雙向耦合:

```ts
const incompatibleTypeNames = useMemo(() => {
  const out: TypeName[] = [];
  for (const [tn, sel] of Object.entries(state.selections)) {
    const item = (catalog.byTypeName.get(tn) ?? []).find(
      (d) => d.name === sel.name,
    );
    if (item && !itemMatchesLicenseFilter(item, licenseFilter)) {
      out.push(tn);
    }
  }
  return out;
}, [catalog, state.selections, licenseFilter]);

const incompatibleCount = incompatibleTypeNames.length;
```

**removeIncompatibleSelections**

```ts
const removeIncompatibleSelections = useCallback(() => {
  if (incompatibleTypeNames.length === 0) return;
  for (const tn of incompatibleTypeNames) {
    dispatch({ type: 'clear', typeName: tn });
  }
  setStatus({
    kind: 'info',
    text: t('licenseFilter.removed', { n: incompatibleTypeNames.length }),
  });
}, [incompatibleTypeNames, dispatch, t]);
```

React 18 在事件 handler 內的多次 `dispatch` 自動 batch,單次 re-render。

**Reset 行為**

```ts
// harness.tsx 第 219 行(ResetMenuPopover onReset 的 `filters` 分支內)
// 舊:setLicenseFilter(null);
// 新:setLicenseFilter(ALL_GROUPS);
```

`ResetMenuPopover` 有 3 個獨立勾選 scope:`outfit` / `view` / `filters`。
License filter 對應 `filters` scope(現有),只換值不換 scope name。**`outfit`
或 `view` 單獨重設不動 license filter** — 與既有設計一致。

**透傳路徑**

```
harness.tsx
  └─ <StackPanel>
       ├─ licenseFilter
       ├─ toggleLicenseGroup           [新]
       ├─ incompatibleCount            [新]
       └─ removeIncompatibleSelections [新]
           └─ <SettingsCollapsible>
                ↑ 上述 4 個 props 在 SettingsCollapsible 接住

harness.tsx
  └─ <AttributionPopover>
       └─ licenseFilter                [型別變但 prop name 不變]
       (內部自掃 selections 算 incompatibleAny,不從外面拉)

harness.tsx
  └─ <LayerRow> / <AdvancedPalette>
       └─ licenseFilter                [型別變但 prop name 不變]
```

### §4 · 受影響呼叫端細節

#### `attribution-popover.tsx`

- 移除 `import { licenseExceedsFilter }`
- `Row.exceeds` 改名為 `Row.incompatible`,值改為
  `!itemMatchesLicenseFilter(item, licenseFilter)`(注意:傳整個 `item`,
  不再傳 `effective`)
- 觸發鈕 `⚠ ` / `© ` 切換邏輯不變(改讀 `incompatibleAny` = rows.some 的
  `incompatible`)
- 列表 row 紅框條件改用 `incompatible`
- i18n key `attribution.exceededShort` → `attribution.incompatibleShort`
  - en: `Not in enabled licenses`
  - zh-TW: `不在啟用授權內`
- `effective` 顯示可保留(item 標籤仍有用),只是 incompatibility 判定獨立

#### `layer-row.tsx`

- 第 124 行 `exceeds = !itemMatchesLicenseFilter(it, licenseFilter)` 維持,
  只是 `licenseFilter` 型別變(`ReadonlySet<LicenseGroup>`)
- 第 133 行 tooltip
  - 舊:`exceeds license filter ${licenseFilter ?? ''}`
  - 新:i18n key `layer.licenseIncompatibleTooltip`
    - en: `Does not match enabled license groups`
    - zh-TW: `不在啟用授權群組內`
- 不再內插 license 名稱(set 包含的不命中沒有單一「責任 license」)

#### `advanced-palette.tsx`

- 移除 `licenseExceedsFilter` import
- `matchesFilter = itemMatchesLicenseFilter(item, licenseFilter)` 保留
- 第 116 行 `exceeded && itemLicense && licenseExceedsFilter(...)` →
  簡化為 `!matchesFilter`
- 第 94-96 行 header `≤ {licenseFilter}` badge → 改顯示
  `palette.licenseGroupsBadge`(`{n}/5 license groups` / `{n}/5 個授權群組`)
  - 只在 `enabledCount < 5` 時顯示
  - 計算:`licenseFilter.size`

#### `i18n.ts`

| Key | Action | en | zh-TW |
|---|---|---|---|
| `picker.licenseFilter` | keep | `License filter` | `授權篩選` |
| `picker.allLicenses` | **remove** | — | — |
| `attribution.exceededShort` | **rename → `attribution.incompatibleShort`** | `Not in enabled licenses` | `不在啟用授權內` |
| `licenseFilter.enabledCount` | **new** | `{n}/{total} enabled` | `{n}/{total} 已啟用` |
| `licenseFilter.removeIncompatible` | **new** | `Remove {n} Incompatible Asset{plural}` | `移除 {n} 個不相容素材` |
| `licenseFilter.incompatibleNotice` | **new** | `{n} selected item{plural} not in enabled licenses` | `{n} 個已選素材不在啟用授權內` |
| `licenseFilter.showLicense` | **new** | `Show license` | `查看授權` |
| `licenseFilter.removed` | **new** | `Removed {n} incompatible asset{plural}` | `已移除 {n} 個不相容素材` |
| `layer.licenseIncompatibleTooltip` | **new** | `Does not match enabled license groups` | `不在啟用授權群組內` |
| `palette.licenseGroupsBadge` | **new** | `{n}/5 license groups` | `{n}/5 個授權群組` |

Plural 內插樣式對齊 i18n.ts 既有用法(`{plural}` 內插或 `{n > 1 ? 's' : ''}`,
zh-TW 不需 plural)。

#### `slice-harness.tsx`(v1 path)

不動 v1。v1 內部 inline 舊 `License | null` 型別(不從 slice import 新型別),
避免污染 v2 slice。實作時:

```ts
// slice-harness.tsx 內部 inline:
type LegacyLicenseFilter = License | null;
const [licenseFilter, setLicenseFilter] = useState<LegacyLicenseFilter>(null);
// 其餘 v1 行為完全不動
```

### §5 · 測試策略

**Unit tests — `slice/license-filter.test.ts`**

| Case | item.credits | enabledGroups | Expected |
|---|---|---|---|
| 全啟用 + 有 license | `[{licenses: ['CC0']}]` | 全 5 group | `true` |
| 部分啟用 + 命中 | `[{licenses: ['GPL 3.0']}]` | `{GPL}` | `true` |
| 部分啟用 + 不命中 | `[{licenses: ['GPL 3.0']}]` | `{CC0}` | `false` |
| 零啟用 | `[{licenses: ['CC0']}]` | `{}` (empty) | `false` |
| credits 為空(未知)| `[]` | `{CC0}` | `true` **語意翻轉** |
| 多 license OR | `[{licenses: ['GPL 2.0', 'CC-BY 4.0']}]` | `{CC-BY}` | `true` |
| 多 credit OR | `[{licenses:['GPL 3.0']}, {licenses:['CC0']}]` | `{CC0}` | `true` |
| version variants 同 group | `[{licenses: ['CC-BY 3.0']}]` | `{CC-BY}` | `true` |

也驗證 `licenseExceedsFilter` 被完全移除。

**Component tests — `settings-collapsible.test.tsx`**

- render 預設 5/5 enabled,header 無 `{n}/5` badge
- toggle CC0 checkbox → `toggleLicenseGroup` 被以 `'CC0'` 呼叫
- `incompatibleCount = 0` → Remove 區塊不在 DOM
- `incompatibleCount = 2` → 顯示 warning notice + 按鈕,文字含 `2`
- 點 Remove 按鈕 → `removeIncompatibleSelections` 被呼叫一次
- 5 個 group 都各自渲染 `(Show license)` 連結,連到 `LICENSE_CONFIG` 對應 `url`
- 4/5 enabled → header 出現 `4/5` badge

**Integration — `harness.test.tsx`**(新增或擴增)

- 初始 `licenseFilter.size === 5`
- 取消勾 GPL → 任何 GPL-only item 進入 incompatible 計數
- 點 Remove → 對應 selections 從 `state.selections` 移除
- Reset(filters scope)→ filter 回 5/5
- Reset(outfit-only / view-only)→ filter 不動
- `AttributionPopover` 觸發鈕在 `incompatibleCount > 0` 時切到 danger style

**目標**

178 web tests + core 全綠的基準,本 sub-project 完成後 web tests 預計 +8~12
個(slice 8 個 case + UI 4~6 個 case)。

### §6 · 實作切分與風險

**檔案異動清單(7 個 source + 2 個 test)**

| 檔案 | 改動 | 規模 |
|---|---|---|
| `packages/web/src/slice/license-filter.ts` | 型別+語意改寫 | 小 |
| `packages/web/src/components/layer-stack/settings-collapsible.tsx` | UI 重寫 | 中 |
| `packages/web/src/components/layer-stack/harness.tsx` | state init / toggle / memo / reset | 中 |
| `packages/web/src/components/layer-stack/stack-panel.tsx` | props 透傳 | 小 |
| `packages/web/src/components/layer-stack/popovers/attribution-popover.tsx` | helper 切換 | 小 |
| `packages/web/src/components/layer-stack/layer-row.tsx` | tooltip i18n | 小 |
| `packages/web/src/components/layer-stack/advanced-palette.tsx` | badge 邏輯 / import 整理 | 小 |
| `packages/web/src/i18n.ts` | i18n keys | 小 |
| `packages/web/src/slice/license-filter.test.ts` | 新建 | 小 |
| `packages/web/src/components/layer-stack/settings-collapsible.test.tsx` | 新建 | 小 |
| `packages/web/src/components/slice-harness.tsx` | v1 內部 inline `License | null` 型別 | 微 |

**Task 切分(subagent-driven-development)**

| # | Task | 動到的檔 | review 等級 |
|---|---|---|---|
| 1 | Slice 語意改寫 + unit tests | `slice/license-filter.ts` + test | **完整 review** |
| 2 | i18n keys | `i18n.ts` | 簡 review(對照 §4 表)|
| 3 | Settings UI 改寫 + component test | `settings-collapsible.tsx` + test | **完整 review** |
| 4 | Harness state + reset + props 透傳 | `harness.tsx`, `stack-panel.tsx` | **完整 review** |
| 5 | 呼叫端遷移 + v1 inline | `attribution-popover`, `layer-row`, `advanced-palette`, `slice-harness.tsx` | code quality review |

**依賴**

```
1 (slice) ─┬─► 3 (UI 用 toggle signature)
           ├─► 4 (harness 用新 state shape)
           └─► 5 (呼叫端用新 helper)
2 (i18n) ──┴─► 3, 4, 5(都會引用新 key)
```

1 跟 2 並行起跑;3、4、5 等 1+2 完成。3 跟 4 介面契約耦合,**序列做 3→4**
(先 settings 元件定 props,再 harness 接);5 可與 4 並行(只動呼叫端)。

**風險**

| 風險 | 緩解 |
|---|---|
| credits 為空語意翻轉(false→true)影響既有測試 | §5 測試明確列出此 case;snapshot 跑出來會抓到 |
| `licenseExceedsFilter` 刪除後 v1 編譯失敗 | §4 已規劃 v1 inline 舊型別,task 5 順手處理 |
| Settings UI 高度擠 | 緊湊 row(11px font / 4-6px gap),5 行不超過原 select + asset source 總高 |
| Reset 把 filter 重設,使用者覺得 reset 把 filter 也清了 | 沿用既有 `filters` scope 區分,使用者可主動取消勾選 filters 框只 reset outfit / view |

## 驗收

- [ ] `LicenseFilter` 型別 = `ReadonlySet<LicenseGroup>`
- [ ] `licenseExceedsFilter` 不存在於 `slice/license-filter.ts`
- [ ] `itemMatchesLicenseFilter` 對齊上游 `isItemLicenseCompatible` 行為矩陣
- [ ] `SettingsCollapsible` 顯示 5 個 group checkbox + license URL
- [ ] 預設全 5 啟用,等同無過濾
- [ ] `enabledCount < 5` 時 header 顯示 `{n}/5` badge
- [ ] `incompatibleCount > 0` 時顯示 warning notice + Remove 按鈕
- [ ] 點 Remove 移除對應 selections + 顯示 status toast
- [ ] `AttributionPopover` 觸發鈕 + 列表 row 用新 incompatibility 判定
- [ ] `LayerRow` tooltip 用新 i18n key,不再內插 license 名稱
- [ ] `AdvancedPalette` header 用新 `{n}/5` badge
- [ ] Reset(filters)歸回 ALL_GROUPS;reset(outfit-only / view-only)filter 不動
- [ ] v1 path(`slice-harness.tsx`)行為完全不變
- [ ] i18n.ts en + zh-TW 兩 locale 都同步加入新 key
- [ ] web tests +8~12 個,178 + core 全綠基準維持
