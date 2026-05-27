# Web UI · Animation Filter(Sub-project E3)

- 日期:2026-05-27
- 範圍:`packages/web`(+ 零動到 `packages/core` 的小確認)
- 狀態:設計已核可,待寫實作計畫
- 上層 roadmap:`2026-05-26-upstream-feature-parity-roadmap.md`(Sub-project E,迷你拆分 E3)
- 比對對象:
  - `upstream/sources/components/filters/AnimationFilters.js`
  - `upstream/sources/state/filters.ts`(`isItemAnimationCompatible` / `isNodeAnimationCompatible`,154-182 行)
- 兄弟 spec:E1 `2026-05-27-license-filter-ui-design.md`、E2 `2026-05-27-persistent-search-design.md`
- 後續迷你 sub-project:E4(F12 Custom upload + Z-Position)

## 背景與問題

E1 已把 License Filter 改成上游語意(逐 group 勾選 + Remove Incompatible 按鈕)。
E2 加了常駐 SidebarSearch。剩下兩塊上游 F8 / F12 功能尚未到位。

本 spec 處理 **F8 Animation Filters**:讓使用者勾選一組想要的動畫,UI 只顯示
與之相容的素材;當前已選但不相容者出現 ⚠ 視覺反饋,並提供「Remove
Incompatible」一鍵清除。語意完全對齊上游 `isItemAnimationCompatible`,包含
custom animation 的 base resolution(`wheelchair` → `sit`、`tool_rod` → `thrust`)。

與 License Filter 的關鍵語意差異是**翻轉**:
- License:0 enabled = 全擋(不顯示任何 item),預設全選 = 不過濾
- Animation:**0 enabled = 全通**(不過濾),預設空集合 = 不過濾

理由:上游 `isNodeAnimationCompatible` 對 `enabledAnims.length === 0` 直接回
`true`(filters.ts:168);UI 預設無勾選即代表「我不在意動畫過濾」。

## 目標

- 新 slice `packages/web/src/slice/animation-filter.ts`:
  - `AnimationFilter = ReadonlySet<AnimationName>`
  - `itemMatchesAnimationFilter(item, enabled)` 對齊上游 + 含 custom anim base resolution
  - `incompatibleAnimationTypeNamesFor(state, catalog, enabled)` 結構鏡像 E1 的同名函式
- `SettingsCollapsible` 加第三個 section,結構鏡像 License section,15 個 checkbox(noExport 動畫隱藏)
- `harness.tsx` 增管 `animationFilter` state + toggle + memo + remove 函式;Reset menu 的 `filters` scope 同時清 license + anim
- Callsite 視覺反饋:`AttributionPopover` / `LayerRow` swap tray / `SidebarSearch` 三處共用 ⚠ badge,tooltip 區分 license / animation / 雙重不相容
- Session-only state(同 E1),URL hash 不 sync、localStorage 不持久化

## 非目標

- 不影響合成(composition):animation filter 只是 UI 探索狀態,匯出仍為全 anim 範圍
- 不影響 URL hash 結構(無新 query param)
- 不為個別動畫 label 開 i18n(沿用 `ANIMATIONS` 表的英文 `label`,與上游一致)
- 不重構 `ResetMenuPopover` 內部(`filters` scope 既有,意涵自然擴張)
- 不動 v1 path(已凍結)

## §1 Slice 語意(`packages/web/src/slice/animation-filter.ts`,新檔)

### §1.1 型別

```ts
import type { AnimationName } from '@lpc-toolkit/core';

export type AnimationFilter = ReadonlySet<AnimationName>;
```

與 E1 `LicenseFilter` 同形狀,但語意翻轉(0 enabled = 不過濾)。**不**導出
`ALL_ANIMATIONS` 常數 — 預設 state 為空 Set,無「全選」配套需求。

### §1.2 Predicate

```ts
import {
  customAnimations,
  customAnimationBase,
  type AnimationName,
  type ItemDefinition,
} from '@lpc-toolkit/core';

export function itemMatchesAnimationFilter(
  item: ItemDefinition,
  enabled: AnimationFilter,
): boolean {
  if (enabled.size === 0) return true;            // 0 enabled = All(語意翻轉的關鍵)
  if (item.animations.length === 0) return true;  // 空 animations 視為相容
  for (const anim of item.animations) {
    if (enabled.has(anim)) return true;
    const def = customAnimations[anim];            // ← custom anim base resolution
    if (!def) continue;
    const base = customAnimationBase(def);
    if (enabled.has(base)) return true;
  }
  return false;
}
```

語意對應上游 `isNodeAnimationCompatible`(filters.ts:154-182)三條 short-circuit
+ custom anim lookup。

具體例子:`wheelchair` body item 的 `animations: ["wheelchair"]`。當使用者勾
選 `sit`,流程:`enabled.has("wheelchair")` → false → `customAnimations["wheelchair"]`
存在 → `customAnimationBase(...)` 回傳 `"sit"` → `enabled.has("sit")` → true。

### §1.3 找出不相容的目前選擇

```ts
import type { Catalog, TypeName } from '@lpc-toolkit/core';
import type { SliceState } from './selection';

export function incompatibleAnimationTypeNamesFor(
  state: SliceState,
  catalog: Catalog,
  enabled: AnimationFilter,
): TypeName[] {
  const out: TypeName[] = [];
  for (const [tn, sel] of Object.entries(state.selections)) {
    const item = (catalog.byTypeName.get(tn) ?? []).find(
      (d) => d.name === sel.name,
    );
    if (item && !itemMatchesAnimationFilter(item, enabled)) out.push(tn);
  }
  return out;
}
```

命名加 `Animation` 前綴避免與 license 版本(`incompatibleTypeNamesFor`)撞名。

### §1.4 對 `packages/core` 的依賴

`customAnimations` 與 `customAnimationBase` 均已在 `packages/core/src/index.ts:88-89`
公開,**不需要**動 core barrel。

### §1.5 `noExport` 與這層的關係

`ANIMATIONS` 表中 `noExport: true` 的(`watering`、`1h_slash`)**仍**參與 predicate 比對 —
predicate 是純語意,不應排除任何 anim name。`noExport` 隱藏只是 UI 顯示層的事
情(§2.6)。

## §2 UI 設計

### §2.1 `SettingsCollapsible` 第三區塊位置

插在 License section 與 Asset Source section 之間,共用同一個 collapsible 容器。

### §2.2 Header chip(雙條,獨立顯示)

```
┌────────────────────────────────────────────────┐
│ FILTERS  [License 1/4]  [Anim 3/15]      ▾   │
└────────────────────────────────────────────────┘
```

- License chip:`enabledLicenseCount < TOTAL_LICENSE_GROUPS` 時顯示(沿用既有條件,前綴 label 加 "License ")
- Anim chip:`animationFilter.size > 0` 時顯示(語意翻轉:有勾選才 active)

每個 chip 各顯示「目前勾選數 / 可選總數」。Anim 的分母 = `VISIBLE_ANIMATIONS.length` = 15(noExport 過濾後)。

### §2.3 Animation 區塊內容(JSX 結構鏡像 License section)

```
ANIMATION FILTER  active: 3
   ☐ Spellcast
   ☑ Thrust
   ☑ Walk
   ☑ Slash
   ☐ Shoot
   …(共 15 列,單欄)

   ⚠️ 2 selections incompatible…
   [ Remove Incompatible (2) ]
```

實作要點:
- 把 `LICENSE_GROUP_ORDER.map(...)` 換成 `VISIBLE_ANIMATIONS.map(...)`
- 移除「show license link」整段(animations 無對外 URL)
- 「active: N」沿用既有 `enabledCount` 顯示位置,文案用 `animationFilter.enabledCount` i18n key
- 警示框 + Remove 按鈕沿用 license 的 amber 框 + Button pattern(`mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2`),i18n key 換成 `animationFilter.*`

### §2.4 `SettingsCollapsible` props 變更

```ts
interface Props {
  t: Translator;
  // license(rename:incompatibleCount → licenseIncompatibleCount,並列加 animation 4 個)
  licenseFilter: LicenseFilter;
  toggleLicenseGroup: (g: LicenseGroup) => void;
  licenseIncompatibleCount: number;
  removeLicenseIncompatibleSelections: () => void;
  // animation(新增)
  animationFilter: AnimationFilter;
  toggleAnimation: (anim: AnimationName) => void;
  animationIncompatibleCount: number;
  removeAnimationIncompatibleSelections: () => void;
  // asset source(不變)
  assetSource: AssetSource;
  setAssetSource: (v: AssetSource) => void;
}
```

rename 是為了讓「兩種 incompatibility 來源」在 wiring 一目了然,屬於必要的清晰度改善。

### §2.5 三個 callsite 的 ⚠ badge 整合

| 檔案 | 既有 license 邏輯 | 新增 |
|---|---|---|
| `attribution-popover.tsx` | Row.incompatible = !license match;Button 紅框 + ⚠;per-row 短文案 | Row 改 `licenseIncompatible` + `animationIncompatible`;`incompatibleAny = OR`;per-row 兩條短文案 conditional |
| `layer-row.tsx` swap tray | `exceeds = !license match` → `!` red badge + dim + tooltip | 拆 `licenseExceeds` / `animExceeds`,`exceeds = OR`;tooltip 三向 conditional |
| `sidebar-search.tsx` | `exceeded = !license match` → ⚠ icon + dim | 同上 |

完整 diff 見 §4。

### §2.6 noExport 過濾的單一定義位置

`VISIBLE_ANIMATIONS` derive 在 **`SettingsCollapsible` 模組頂層**:

```ts
const VISIBLE_ANIMATIONS = ANIMATIONS.filter((a) => !a.noExport);
```

harness 不需要知道 `VISIBLE_ANIMATIONS`,因為 incompatibleCount 計算用完整
predicate(隱藏 anim 不勾選 → 不影響語意)。

## §3 Harness state + reset

### §3.1 新增 state

```ts
const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>(ALL_LICENSE_GROUPS);
const [animationFilter, setAnimationFilter] = useState<AnimationFilter>(
  () => new Set<AnimationName>(),    // 初始 = 空 Set(= "All",不過濾)
);
```

### §3.2 Toggle / memo / remove(鏡像 license)

```ts
const toggleAnimation = useCallback((anim: AnimationName) => {
  setAnimationFilter((prev) => {
    const next = new Set(prev);
    if (next.has(anim)) next.delete(anim);
    else next.add(anim);
    return next;
  });
}, []);

const animationIncompatibleTypeNames = useMemo(
  () => incompatibleAnimationTypeNamesFor(props.state, props.catalog, animationFilter),
  [props.state, props.catalog, animationFilter],
);
const animationIncompatibleCount = animationIncompatibleTypeNames.length;

const removeAnimationIncompatibleSelections = useCallback(() => {
  if (animationIncompatibleTypeNames.length === 0) return;
  for (const tn of animationIncompatibleTypeNames) {
    props.dispatch({ type: 'clear', typeName: tn });
  }
  setStatus({
    kind: 'info',
    text: t('animationFilter.removed').replace(
      '{n}', String(animationIncompatibleTypeNames.length),
    ),
  });
}, [animationIncompatibleTypeNames, props.dispatch, t]);
```

同時把既有 license 的內部變數一起 rename(`incompatibleTypeNames` →
`licenseIncompatibleTypeNames` 等),保持對稱。

兩個 remove handler 之間**不**抽 helper — i18n key 不同,提早抽象會把兩條軸
混在一起。三行 dispatch loop 重複可接受。

### §3.3 Reset 整合(`filters` scope 同時清兩個)

`<ResetMenuPopover>` 的 `onReset` 回呼補一行:

```tsx
if (filters) {
  setLicenseFilter(ALL_LICENSE_GROUPS);
  setAnimationFilter(new Set<AnimationName>());   // 新增
}
```

`ResetMenuPopover` 內部 UI **不改**;`filters` scope 既有,意涵自然包含新加的
animation filter。

### §3.4 Props 向下傳遞

- `harness` → `StackPanel`:4 個 anim props 在 4 個 license props 後並列
- `StackPanel` → `SettingsCollapsible`:全 8 個 filter props
- `StackPanel` → `SidebarSearch`、`LayerRow`:各加 `animationFilter`
- `harness` → `AttributionPopover`:直接加 `animationFilter`

### §3.5 為何 animation 不持久化(session-only)

- `useUrlHashSync` 只 sync `SliceState`(角色 selections + body type + anim row),沿用
- localStorage 完全不存 filter UI state,沿用
- 理由:filter 是「探索意圖」UI 狀態,不是角色設定;分享連結時不該帶過去

## §4 Callsite 遷移清單

### §4.1 `packages/web/src/slice/animation-filter.ts`(新檔)

§1 內容。

### §4.2 `packages/core/src/index.ts`

**無變更** — `customAnimations` 與 `customAnimationBase` 已於 `index.ts:88-89` 公開。

### §4.3 `packages/web/src/i18n.ts`

en 區塊新增(licenseFilter group 之後並列):

```ts
'animationFilter.title': 'Animation Filter',
'animationFilter.enabledCount': 'active: {n}',
'animationFilter.removeIncompatible': 'Remove {n} incompatible asset(s)',
'animationFilter.incompatibleNotice': '{n} selected item(s) lack the enabled animations',
'animationFilter.removed': 'Removed {n} animation-incompatible asset(s)',
'layer.animationIncompatibleTooltip': 'Lacks the enabled animations',
'layer.bothIncompatibleTooltip': 'License & animation filter mismatch',
'attribution.licenseIncompatibleShort': 'License not enabled',
'attribution.animationIncompatibleShort': 'Missing enabled animations',
```

`attribution.incompatibleShort` 重新命名為 `attribution.licenseIncompatibleShort`(舊 key 移除)。

zh-TW 對譯:
- `'動畫過濾器'` / `'啟用 {n}'` / `'移除 {n} 個不相容素材'` / `'{n} 個已選素材缺少啟用的動畫'` / `'已移除 {n} 個動畫不相容素材'`
- `'不包含啟用的動畫'` / `'授權與動畫過濾皆不相容'`
- `'授權未啟用'` / `'缺少啟用的動畫'`

### §4.4 `packages/web/src/components/layer-stack/settings-collapsible.tsx`

- props 全套(§2.4)
- 新 import:`ANIMATIONS`, `type AnimationName` from `@lpc-toolkit/core`;`type AnimationFilter` from `'../../slice/animation-filter'`
- 模組頂層 `const VISIBLE_ANIMATIONS = ANIMATIONS.filter((a) => !a.noExport);`
- Header chip 拆兩個(license + anim 各自顯示條件)
- JSX:既有 license section + **新 animation section**(鏡像 license,移除 license link)+ 既有 asset source section

### §4.5 `packages/web/src/components/layer-stack/stack-panel.tsx`

- props 新增 4 個 anim,並把 license 兩個 prop 名 rename(`incompatibleCount` → `licenseIncompatibleCount` 等)
- 新 import:`type AnimationName` from core;`type AnimationFilter` from slice
- 對 `SidebarSearch` / `LayerRow` 新增 `animationFilter` prop
- 對 `SettingsCollapsible` 傳完整 8 個 filter props

### §4.6 `packages/web/src/components/layer-stack/harness.tsx`

§3 內容。Props 對 `StackPanel`(8 個 filter props,license 那 4 個改名)+ `AttributionPopover`(新增 `animationFilter`)。

### §4.7 `packages/web/src/components/layer-stack/popovers/attribution-popover.tsx`

- props 新增 `animationFilter: AnimationFilter`
- import:`itemMatchesAnimationFilter, type AnimationFilter`
- Row interface:`incompatible: boolean` 拆成 `licenseIncompatible` + `animationIncompatible`
- useMemo body 加 `animationIncompatible: !itemMatchesAnimationFilter(item, animationFilter)`;deps 加 `animationFilter`
- `incompatibleAny = rows.some(r => r.licenseIncompatible || r.animationIncompatible)`
- per-row className OR 條件;短文案兩條 conditional 渲染(用新 i18n key)

### §4.8 `packages/web/src/components/layer-stack/layer-row.tsx`

- props 新增 `animationFilter`
- import:`itemMatchesAnimationFilter, type AnimationFilter`
- swap tray:`licenseExceeds` / `animExceeds` 拆分,`exceeds = OR`
- title 與 aria-label tooltip 三向 conditional(`bothIncompatibleTooltip` /
  `licenseIncompatibleTooltip` / `animationIncompatibleTooltip`)

### §4.9 `packages/web/src/components/layer-stack/sidebar-search.tsx`

- props 新增 `animationFilter`
- import:`itemMatchesAnimationFilter, type AnimationFilter`
- 逐 row 渲染:拆 `licenseExceeded` / `animExceeded`,`exceeded = OR`
- title tooltip 三向 conditional

### §4.10 不改的 callsites

| 檔案 | 為何不動 |
|---|---|
| `useUrlHashSync` / `url-hash-sync.ts` | filter 不入 hash |
| `useComposedCharacter` / `compose.ts` | animation filter 不影響合成 |
| `download-popover.tsx` / `zip-export.ts` | 匯出仍用全 anim 集 |
| `body-type-popover.tsx` | 與 anim filter 無關 |
| `preset-chips.tsx` | preset apply 不參考 filter |
| `ResetMenuPopover` 內部 UI | `filters` scope 已涵蓋 |
| v1 path(`slice-harness.tsx`) | 已凍結 |

## §5 測試設計

### §5.1 範圍與哲學

沿用 E1:**slice 層覆蓋率高、UI 層靠 manual smoke + typecheck**。v2 目前無
jsdom / RTL 設置,加 component test 邊際效益低。

### §5.2 Unit tests — `packages/web/test/animation-filter.test.ts`(新檔)

鏡像 `packages/web/test/license-filter.test.ts` 的結構與 fixture helper 命名。

**`itemMatchesAnimationFilter`** suite — 8 case:

| # | Case | Setup | 預期 |
|---|---|---|---|
| 1 | 0 enabled = All | `enabled = new Set()` + 任意 item | `true`(語意翻轉的關鍵) |
| 2 | 空 animations 視為相容 | item `animations: []` + `enabled = {walk}` | `true` |
| 3 | 直接匹配 | item `animations: ['walk', 'slash']` + `enabled = {walk}` | `true` |
| 4 | 完全不匹配 | item `animations: ['walk']` + `enabled = {slash}` | `false` |
| 5 | Custom anim base resolution(命中) | item `animations: ['wheelchair']` + `enabled = {sit}` | `true` |
| 6 | Custom anim base resolution(不命中) | item `animations: ['wheelchair']` + `enabled = {walk}` | `false` |
| 7 | 混合 standard + custom | item `animations: ['walk', 'wheelchair']` + `enabled = {sit}` | `true` |
| 8 | Unknown custom anim 不爆 | item `animations: ['nonexistent_custom']` + `enabled = {sit}` | `false` |

**`incompatibleAnimationTypeNamesFor`** suite — 4 case:

| # | Case | 預期 |
|---|---|---|
| 1 | 空 filter → 全相容 | `[]`(predicate `enabled.size === 0` short-circuit) |
| 2 | 一個 selection 不相容 | `['hair']` |
| 3 | catalog 找不到的 selection → skip | `[]` |
| 4 | 多個不相容 | 全部 type name(`arrayContaining`,順序無關) |

case 5–7 必須用 `'wheelchair'` 這個真實 custom anim name(在
`packages/core/src/custom-animations.ts:55` 定義,base 為 `sit`)。

### §5.3 不寫的測試

- `SettingsCollapsible` / `LayerRow` / `SidebarSearch` / `AttributionPopover` 的 component render — 無自動測試
- HarnessReset wiring — 一行改動,typecheck 保證 prop 對稱
- i18n key 完整性 — `Translator` 是 keyof 型別,typecheck 抓
- URL hash sync 不含 animation filter — 沒新增 hash 行為,現有 hash-sync test 自然不會觸碰

### §5.4 Type-check & build

`pnpm -w typecheck` 應抓:
- `SettingsCollapsible` props rename 沒同步到 `StackPanel` / `harness`
- 三個 callsite 缺 `animationFilter` prop
- 新 i18n key 漏在 zh-TW block

`pnpm -w build` 走過代表 Vite + esbuild 沒問題。

### §5.5 Manual smoke checklist(收尾要過)

跑 `pnpm -F web dev`:

1. 開 settings collapsible,看到三個 section:License / Animation Filter (NEW) / Asset Source
2. Animation Filter 區塊列出 **15** 個 anim(無 `Watering`、無 `1-Handed Slash`)
3. 預設無勾選 → header 不顯示 anim chip,所有 layer 正常顯示
4. 勾 `Walk` → 看到 chip `Anim 1/15`;不支援 walk 的 item(若有)出現 ⚠ badge
5. 選一個 wheelchair body 為 selection,然後在 anim filter 只勾 `Sit` → 應**無** ⚠(透過 custom anim base 解析通過);改勾 `Walk` → wheelchair 出現 ⚠ 並計入 Remove 計數
6. 點 Remove Incompatible → 該 selection 被清掉,toast "已移除 N 個動畫不相容素材"
7. 切到 en locale,所有新文案是英文
8. Reset menu → 勾 `Filters` → Reset → license + anim filter 都回到預設(license: all enabled / anim: empty)
9. SidebarSearch 搜尋一個被 anim filter 排除的 item → row 有 ⚠ icon 和 dim opacity
10. LayerRow 展開 swap tray → 不相容 item 有 `!` red badge
11. AttributionPopover 按鈕變紅有 ⚠;個別 row 顯示「缺少啟用的動畫」短文案
12. 重新整理頁面 → anim filter 回到空 Set(session-only)

## §6 Task 切分

每個 task 結束時 `pnpm -w typecheck` + `pnpm -w test` 應該過。**強制
1 → 2 → 3 → 4 → 5 序列執行**(各 task 都改 harness/StackPanel,無法並行)。

### Task 1 · slice + unit tests

**改動**
- 新檔 `packages/web/src/slice/animation-filter.ts`(§1)
- 新檔 `packages/web/test/animation-filter.test.ts`(§5.2)

**驗收**
- `pnpm -F core build` 通過
- `pnpm -F web test` animation-filter.test 全綠
- `pnpm -w typecheck` 通過

### Task 2 · i18n keys

**改動**
- `packages/web/src/i18n.ts` 新增 9 個 key(§4.3),en + zh-TW 對稱
- `attribution.incompatibleShort` 改名 → `attribution.licenseIncompatibleShort`
- 同步改 `attribution-popover.tsx:117` 那一行 i18n key 引用(rename 的 atomic boundary)

**驗收**
- `pnpm -w typecheck` 通過

### Task 3 · license incompatibility prop rename(無新行為)

**改動**
- `harness.tsx`:`incompatibleTypeNames` → `licenseIncompatibleTypeNames`、`incompatibleCount` → `licenseIncompatibleCount`、`removeIncompatibleSelections` → `removeLicenseIncompatibleSelections`
- `stack-panel.tsx`:對應 props rename
- `settings-collapsible.tsx`:對應 props rename + 內部變數同步

**驗收**
- UI 行為完全一致
- `pnpm -w typecheck` + `pnpm -w test` 過
- diff 一眼可看出是純機械 rename

### Task 4 · harness animation state + `SettingsCollapsible` 第三區塊

**改動**
- `harness.tsx`:加 `animationFilter` state、`toggleAnimation`、`animationIncompatibleTypeNames` memo、`animationIncompatibleCount`、`removeAnimationIncompatibleSelections`、Reset wiring(§3.1–§3.3)
- `harness.tsx` → `StackPanel`:加 4 個 anim props
- `stack-panel.tsx`:介面新增 4 個 anim props,只往下傳到 `SettingsCollapsible`(LayerRow / SidebarSearch / AttributionPopover **暫不**傳)
- `settings-collapsible.tsx`:`VISIBLE_ANIMATIONS` 常數、Animation section JSX、Header 雙 chip

**驗收**
- Animation Filter 區塊出現,15 個 checkbox,header chip 行為正確
- 勾選 → 若有不相容 selection,出現 amber 警示 + Remove 按鈕 + toast
- Reset menu 勾 filters → 兩個 filter 都清回預設
- `pnpm -w typecheck` + `pnpm -w test` 過
- **未完成**:⚠ badge 在 LayerRow / SidebarSearch / AttributionPopover 還沒出現,留給 Task 5

### Task 5 · callsite 視覺反饋(⚠ badge 三處)

**改動**
- `stack-panel.tsx`:`animationFilter` 從 props 往下傳到 `LayerRow` + `SidebarSearch`
- `harness.tsx`:`animationFilter` 傳給 `AttributionPopover`
- `attribution-popover.tsx`:§4.7
- `layer-row.tsx`:§4.8
- `sidebar-search.tsx`:§4.9

**驗收**
- Manual smoke checklist(§5.5)12 條全過
- `pnpm -w typecheck` + `pnpm -w test` 過

## §7 風險評估

| # | 風險 | 機率 | 影響 | 緩解 |
|---|---|---|---|---|
| R1 | ~~core barrel 未公開 `customAnimations` / `customAnimationBase`~~ | — | — | 已驗證:`packages/core/src/index.ts:88-89` 已 export,無風險 |
| R2 | 真實 `wheelchair` body 在 unit test fixture 是手刻的,跨真實資料路徑未驗 | 中 | 邏輯正確但合成情境未過 | manual smoke 第 5 條專門測 wheelchair + sit / wheelchair + walk |
| R3 | `attribution.incompatibleShort` rename 遺漏 | 低 | runtime 顯示「[missing key]」 | Task 2 內 atomic 完成;`Translator` keyof 型別 typecheck 會抓 |
| R4 | Header 兩個 chip 並排在 340px sidebar 內可能擠 | 低 | 視覺溢出 | manual smoke 第 1–2 條觀察;極端可改縮短 label |
| R5 | zh-TW 個別文案需 polish | 高 | 字詞品質 | PR description 標出新 zh-TW 文案,讓 reviewer 聚焦 |
| R6 | `useMemo` deps 漏改:attribution-popover 的 `rows` memo 沒加 `animationFilter` | 低 | filter 改了 popover 不更新 | Task 5 acceptance 第一條 manual 抓;ESLint react-hooks/exhaustive-deps 也會抓 |
| R7 | `setAnimationFilter(new Set())` 在 Reset 時 trigger 雙重 re-render | 低 | 效能微小 | React 18 batching 合併,無實際問題 |
| R8 | sheet_definitions 內若有 anim name 不在 `ANIMATIONS` 也不在 `customAnimations`(資料 corner case) | 低 | predicate 對該 anim 永遠回 false | §1 邏輯正確處理(`customAnimations[anim]` undefined → `continue`);與上游一致 |

## 開放性問題

無 — 4 個 brainstorm 決策已封閉,設計細節已對應實體 code。
