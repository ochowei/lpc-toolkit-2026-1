# Web UI · Layer Stack v2 設計

- 日期：2026-05-24
- 範圍：`packages/web`
- 狀態：設計已核可，待寫實作計畫
- 參考檔：`reference/LPC-Toolkit-LayerStack.html`（內嵌沙盒，主標
  「Direction B · Layer Stack」）

## 背景與問題

目前 `packages/web` 的 UI（`components/slice-harness.tsx`）採 3 欄式設計，
左欄是 23 個分類手風琴（永遠展開可見）、中欄預覽、右欄塞 Attribution、
Token、Reset、體型、License、Sprite 來源等所有設定。同時可見的控制項
過多，造成資訊密度過高、操作焦點分散。

參考檔提出一個方向「Direction B · Layer Stack」：以 2 欄佈局取代 3 欄，
左欄改為「使用者目前的圖層」清單（~6–8 列）而非整個目錄，多數設定收進
頂列彈窗。本設計把這個方向落地到實際程式碼。

## 目標

- 提供與現版功能等價、密度顯著降低的新 UI 版本（v2）。
- 與現版並存，以 `?ui=v2` URL query 切換；現版零修改。
- 共用所有資料層與 hooks：catalog、reducer、useComposedCharacter、
  useAnimationPlayer、ColorPicker、presets、i18n、license filter。
- 重視「體驗同等」而非 pixel-perfect 還原參考檔；具體色票/間距以 Tailwind
  + shadcn token 為主。

## 非目標（YAGNI）

- ⌘K Command Palette（跨全目錄搜尋）— 第一階段不做；預留位置，後續規劃。
- 圖層拖曳排序 — 核心 z-order 固定，無此需求。
- 每層 visibility toggle — 無此需求，現版也無。
- 視覺回歸／完整 e2e 測試 — 第一階段以人工驗證為主。
- 改動 `packages/core` — 不必要。

## 已核可的設計決策

1. **套用範圍**：新版並存、可切換（不取代現版）。
2. **切換機制**：URL query `?ui=v2`。
3. **第一期里程碑**：Layer Stack 左欄 + 頂列重整 + Inline Style 區塊。
   不含 ⌘K Palette。
4. **視覺忠實度**：體驗同等，非 pixel-perfect；以 Tailwind token 為主。
5. **實作路徑**：新建並列實作（新增 `components/layer-stack/` 目錄，
   舊版 `slice-harness.tsx` 零修改）。

## 架構與檔案佈局

### 路由

`packages/web/src/App.tsx` 微改：讀 `URLSearchParams`，若 `ui === 'v2'`
渲染 `LayerStackHarness`，否則維持現版 `SliceHarness`。其餘 props/state
保持不變。

判斷邏輯抽成純函式 `shouldUseV2(search: string): boolean`，便於測試。

### 目錄結構

```
packages/web/src/
├── App.tsx                          // ?ui=v2 路由（小修改）
├── components/
│  ├── slice-harness.tsx             // 原樣，不動
│  ├── selected-items-panel.tsx      // 原樣
│  ├── color-picker.tsx              // 原樣
│  ├── ui/                           // 原樣
│  └── layer-stack/                  // 新增目錄
│     ├── harness.tsx                // v2 入口
│     ├── top-bar.tsx                // 頂列
│     ├── stack-panel.tsx            // 左欄主體（presets + 列表 + 折疊設定）
│     ├── layer-row.tsx              // 單一圖層列（含展開內容）
│     ├── inline-style-block.tsx     // 展開內的 variant + ColorPicker 合一
│     ├── add-layer.tsx              // + Add 互動
│     ├── preview-pane.tsx           // 右側預覽 + 動畫/方向控制
│     └── popovers/
│        ├── body-type-popover.tsx
│        ├── token-popover.tsx
│        ├── reset-menu-popover.tsx
│        └── attribution-popover.tsx
├── hooks/, slice/, catalog/, ...    // 共用，不動
└── i18n.ts                          // 新增 v2 字串 keys
```

### 共用，不複製

- `slice/selection.ts` 的 reducer、`SliceState`/`SliceAction`
- `slice/license-filter.ts`、`slice/catalog-tree.ts`
- `hooks/use-composed-character.ts`、`use-animation-player.ts`
- `catalog/`、`presets.ts`、`presets-apply.ts`
- `i18n.ts`、`adapter/asset-source.ts`
- `components/color-picker.tsx`、`components/ui/*`

### 元件職責邊界

- **`harness.tsx`**：top-level；持 reducer / locale / theme / assetSource，
  把它們分發給左右欄與彈窗。
- **`top-bar.tsx`**：純呈現 + popovers trigger；不持業務 state。
- **`stack-panel.tsx`**：根據 `state.selections` 計算 active / inactive
  分類；管理 `expanded`、`adding`、`settingsOpen` 等 UI-only state。
- **`layer-row.tsx`**：單一分類列；展開時內嵌 swap grid + InlineStyleBlock。
- **`popovers/*`**：每個彈窗自管 open/close 與內部 input；對外只暴露
  trigger 與 onAction。

## 頂列（Top Bar）

由左到右共 7 個元素；中段彈性留白。

| 元素 | 行為 |
| --- | --- |
| BodyType pill | 點開 popover，列出 BODY_TYPES。切換時若有目前 layers 不相容 → 顯示警告 + 套用後 status toast 提示 Skipped 清單。 |
| Loading 進度 | 僅在資產載入未完成時顯示百分比；完成後消失。 |
| Token 按鈕 | popover：目前 token（唯讀可複製）+ 貼上套用。串 `encodeSelectionToken` / `decodeSelectionToken`。 |
| Reset menu | popover：三 checkbox（Outfit / View / Filters）+ Reset 鈕。預設勾 Outfit。 |
| Locale | 點擊 en ⇄ zh-TW 切換。 |
| Theme | 點擊 dark ⇄ light 切換。 |
| Attribution badge | 顯示來源計數；點開 popover 完整 CREDITS。若 license filter 已設且有 item 超出 → badge 警告色 + ⚠。 |

不放頂列：⌘K trigger（第一期不做）、Zoom 控制（留預覽區）、License
filter / Asset source（收左欄底部）。

## 左欄 Layer Stack（寬 340px）

由上而下 4 個區塊：Preset chips → Status toast → 圖層列表 → 折疊設定。

### 核心邏輯

- **active / inactive 分離**：根據 `state.selections`，有選擇的分類進
  active；其他放到「Add layer」清單。
- **分類顯示順序**：沿用 packages/core 的 z-order 排序，不是字母序。
- **展開狀態**：UI-only state，存在 `stack-panel.tsx`。一次只展開一列；
  再次點同列收合。
- **Swap grid**：展開列上半部；每個 tile 透過 `itemSupportsBodyType` +
  `licenseExceedsFilter` 計算 dim/disabled 狀態。
- **Inline Style**：展開列下半部；把現版 variant chips + ColorPicker
  合併為單一 Style 區塊。ColorPicker 元件直接複用。
- **Preset chips 預警**：若有 item 與當前 bodyType 不相容，chip 半透明
  + ⚠ icon；hover tooltip 提示「會略過 N 項」。套用後在 status 區彈訊息。
- **Add layer**：第一階段以 collapsed → expanded picker 呈現；按分類
  分組（5 個 super-group）。點分類即建立第一個 item 並自動展開。
- **底部 Filters & source**：折疊區，內含 License filter dropdown +
  Asset source segmented control。預設折疊。

## 右側預覽區

主預覽（沿用 canvasRef） + 底部薄 toolbar。

| 元素 | 行為 |
| --- | --- |
| Canvas | 沿用 `useComposedCharacter` + `useAnimationPlayer(canvasRef, result.animation, ...)`。 |
| Zoom（畫面右上浮層） | − / 百分比 / + 三鍵；沿用 `state.zoom` 與 MIN_ZOOM/MAX_ZOOM；Ctrl/⌘ + 滾輪縮放保留。 |
| Direction quad | ↑ ← ↓ → 4 鍵，目前方向 highlight；dispatch direction action。 |
| Animation 下拉 | 列出 ANIMATION_CONFIGS 所有動畫。 |
| Play / pause + frame scrubber | 沿用現版動畫播放控制；scrubber 顯示當前 frame / 總 frame。 |
| Export | 第一階段：開啟現版的匯出 flow（PNG sheet / 單幀）。 |

## 資料與狀態流

### 共用層（不動）

`App.tsx` 已建立的 `useMemo` 載 catalog/palettes、`useReducer(sliceReducer,
init.state)`、`useState` 持 theme/locale/assetSource。這層不動，只是改在
最後渲染時依 `?ui=v2` 切換 root component。

### LayerStackHarness 本地 UI state

```ts
const [expanded, setExpanded] = useState<string | null>(initialExpandedCategory);
const [adding, setAdding] = useState(false);
const [popover, setPopover] = useState<null | 'bodyType' | 'token' | 'reset' | 'attribution'>(null);
const [settingsOpen, setSettingsOpen] = useState(false);
const [status, setStatus] = useState<{ kind: 'info' | 'warn' | 'error'; text: string } | null>(null);
const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>(null);
```

`licenseFilter` 為本地 state（非 reducer），與現版 `slice-harness.tsx`
一致。

### Status toast

呼叫 `setStatus({...})` → `useEffect` 在 4s 後 `setStatus(null)`。

### Actions

所有變動走現有 reducer actions：
- 換 item / 變 variant / 變色 → 現有 `slice/selection.ts` actions
- 套用 preset → `computePresetSelection` 計算選擇 + dispatch
- Scoped reset → `dispatch({ type: 'reset', scopes, init })`
- Direction / animation / zoom → 現有 actions

### 「不相容 preset 套用」流程

```ts
const skipped = computeSkippedItems(preset, state.bodyType, catalog);
applyPreset(dispatch, preset);  // 用 presets-apply.ts 等價邏輯
if (skipped.length === 0) {
  setStatus({ kind: 'info', text: t('preset.applied', { name }) });
} else {
  const names = skipped.map((s) => tl(`category.${s.cat}`)).join(', ');
  setStatus({ kind: 'warn', text: t('preset.applied.skipped', { name, names }) });
}
```

`computeSkippedItems` 為 pure helper，若不存在則新增於 `presets-apply.ts`。

### i18n 新增 keys

新增（中英對照），不動現有 key：

```
layers.title            "Your layers" / "你的圖層"
layers.on               "on" / "已開"
layers.off              "off" / "未開"
add.button              "Add layer" / "加圖層"
add.available           "available" / "可選"
preset.title            "Presets" / "預設造型"
preset.applied          "Applied {name}." / "已套用 {name}。"
preset.applied.skipped  "Applied {name} (skipped: {names})." / "已套用 {name}（略過：{names}）。"
filters.title           "Filters & source" / "篩選與來源"
status.loading          "Loading" / "載入中"
```

### 對共用程式碼的影響

- `packages/core`：零修改。
- `slice/selection.ts`：可能新增 `apply_preset` action（若不存在）。
- `presets-apply.ts`：可能新增 `computeSkippedItems` helper。
- `i18n.ts`：新增上述 keys。

## 驗證

### 手動 golden path（一次跑通即可發版）

切到 `?ui=v2`：

1. 基本載入：左欄出現預設 layers、右側預覽出現角色、頂列 7 元素就位。
2. 換 item：點收合列 → 展開 → swap grid 點 tile → 預覽更新。
3. 改 style：展開列內切換 variant + ColorPicker → 預覽更新。
4. 加圖層：點 + Add → 挑分類 → 自動展開新加列。
5. 移除圖層：列上 ✕ → 列消失，移回 + Add 可選清單。
6. 預設造型：點 Knight chip → 多分類更新；切 child body type 再按 →
   顯示 Skipped warn toast。
7. 體型切換：BodyType pill → popover → 切 child → 不相容圖層處理。
8. Token：複製 → 重整頁面（保留 `?ui=v2`）→ 貼上 → 還原。
9. Reset scoped：勾 Outfit only → 套用 → 視角、theme 不變、選擇清空。
10. License filter：左欄底部展開 Filters → 設 CC-BY 3.0 → swap grid 不符
    item 警告 + Attribution badge 警告色。
11. 預覽控制：方向 quad、動畫、播放、Zoom +/− 與 Ctrl/⌘ 滾輪皆作用。
12. i18n / theme：EN ⇄ zh-TW、☾ ⇄ ☀ 切換，全 UI 跟著變。

### 自動化測試

第一期不強求完整 e2e。建議補：

- **單元測試**：`computeSkippedItems(preset, bodyType, catalog)` —
  pure function。
- **單元測試**：`shouldUseV2(search: string): boolean` — pure function。
- **結構測試（選擇性）**：`LayerStackPanel` 在「6 active / 17 inactive」
  狀態下渲染輸出，斷言關鍵 testid。

### 邊界 case

| 情境 | 行為 |
| --- | --- |
| `?ui=v2` 但 hash 帶舊版 token | Token 仍可解，沿用 `decodeSelectionToken`。 |
| `state.selections` 全空 | 左欄只剩 + Add，預覽顯示空白（沿用現版 fallback）。 |
| BodyType 切換後當前展開列已不存在 | `useEffect` 監測 expanded；若該 cat 不在 active → `setExpanded(null)`。 |
| License filter 設定後已選 item 超出 | Attribution badge 警告色 + ⚠；該圖層列名稱旁 ⚠。不自動移除 item（與現版一致）。 |
| `?ui=v1`、`?ui=anything`、無 ?ui | 一律走現版（safe default）。 |
| 已開 popover 時觸發另一個 | popover 為單一變數，state 設新值自動收掉舊的。Esc 關閉。 |

### 回歸風險

- 共用 hooks/reducer 不動 → 對舊版應零影響。
- 風險點：App.tsx 微改路由邏輯——務必保留現版完整 props 流到
  `SliceHarness`。
- `slice/selection.ts` 若新增 `apply_preset` action，舊版未用即無事；
  `computeSkippedItems` 為純函式，不影響舊路徑。

## 開放問題

無。實作期若發現 reducer 已有 `apply_preset` 等價 action / `presets-apply.ts`
已有跳過判斷，於 plan 階段確認後不另新增。
