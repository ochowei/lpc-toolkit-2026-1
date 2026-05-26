# Web UI · 與上游功能對齊 Roadmap

- 日期:2026-05-26
- 範圍:`packages/web`
- 狀態:roadmap 已撰寫,子專案 spec 尚未開始
- 性質:umbrella 文件 — 本文不是單一功能 spec,而是把與上游功能差異
  拆解成 5 個獨立子專案的規劃文件。每個子專案後續需各自開 spec。
- 比對對象:[Universal LPC Spritesheet Character Generator](
  https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/)
  (source:`upstream/sources/`)
- 前置 specs:
  - `2026-05-24-web-ui-layer-stack-v2-design.md`(v2 第一階段)
  - `2026-05-25-layer-stack-v2-core-features-design.md`
  - `2026-05-25-layer-stack-v2-polish-design.md`

## 背景與問題

v2 web UI 已成為預設介面(commit `b8e1b29`),layer-stack 設計與
reference/v2 設計稿對齊也已收斂。但若把目標放成「**v2 可以完全取代
上游官方 web 工具**」,目前仍有功能落差。

本次比對涵蓋兩個層面:

1. **項目(item)選擇涵蓋度** — v2 是否能選到上游所有可選 item?
2. **功能(feature)涵蓋度** — 上游有的功能在 v2 是否都找得到?

第一項已確認 100% 涵蓋(見「項目涵蓋度」一節);第二項仍有明顯缺口,
本文件做完整盤點並提出子專案規劃。

## 項目涵蓋度(已通過)

| 維度 | 上游 | v2 | 結果 |
|---|---|---|---|
| 頂層 type_name 種類 | 104 | 104 | 100% 對齊 |
| sheet_definition 檔案 | 655(0 個 `ignore=true`) | 全載入 | 100% |
| catalog 載入路徑 | — | `import.meta.glob('upstream/sheet_definitions/**/*.json')` | OK |

註:`hair_tie` / `hat_secondary` / `hat_accessory_secondary` /
`leather_armor_belt` 不是頂層 type_name,而是 `recolor.color_2` 區塊的
sub-palette 標籤,並非可獨立選取的 item 類別。
`packages/web/src/slice/category-groups.ts:21-24` 註解已正確標記。

## 功能差異分析

以下三張表把上游所有可見功能對照到 v2 現況,作為子專案拆分的依據。

### v2 已有對應(部分形式不同)

| 上游功能 | v2 對應實作 | 落差 |
|---|---|---|
| Search 搜尋框(常駐 sidebar) | `AdvancedPalette`(⌘K) | 不是常駐 — UX 落差 |
| License Filters(逐 license 勾選) | `SettingsCollapsible` 單一上限下拉 | 互動模型不同 |
| Animation Preview + zoom slider | `PreviewPane`(下拉動畫 / 方向 / 播放 / 1×/2×/4×/8×) | 大致對等 |
| Body Type Selector | `BodyTypePopover` | 對等 |
| Category Tree(含 recolor variants) | `StackPanel` + `LayerRow` + `AddLayer` | layer-stack 風格,對等 |
| Palette Select Modal | `AdvancedPalette`(⌘K) | 對等 |
| Current Selections | StackPanel 上方 active layers | 對等 |
| Credits 顯示 | `AttributionPopover` | 對等(但無下載) |
| Reset all | `ResetMenuPopover` | 對等 |
| Export/Import JSON 剪貼簿 | `TokenPopover`(base64 token) | 形式不同,功能對等 |

### v2 完全沒有(明確缺口)

| # | 上游功能 | 影響 |
|---|---|---|
| F1 | **Spritesheet PNG 下載** | 上游核心 use case,缺它工具無法產出成品 |
| F2 | **Credits TXT 下載** | GPL 要求保留作者署名,缺存檔 |
| F3 | **Credits CSV 下載** | 同上,結構化版本 |
| F4 | **ZIP: Split by animation** | 遊戲引擎工作流常用 |
| F5 | **ZIP: Split by item** | 同上 |
| F6 | **ZIP: Split by animation and item** | 同上 |
| F7 | **ZIP: Split by animation and frame** | 個別 frame 匯出 |
| F8 | **Animation Filters**(按可用動畫篩選 items + 一鍵移除不相容) | 進階使用者篩選功能 |
| F9 | **Full Spritesheet Preview**(完整 sheet 含所有動畫所有方向) | 下載前的全貌預覽 |
| F10 | ↳ Full Spritesheet 內 "Show transparency grid" | 棋盤格背景便於識別透明區 |
| F11 | ↳ Full Spritesheet 內 "Replace Mask (Pink)" | 替換半透明遮罩 |
| F12 | **Advanced Tools: Custom file upload + Z-Position** | 疊外部圖層,小眾但有用 |
| F13 | **URL hash 同步 / 可分享連結** | 連結分享比 token 文字方便 |

### v2 額外多出(上游沒有)

- 🎲 Random outfit / Feeling Lucky
- Theme 切換(dark / light)
- Locale 切換(en / zh-TW)
- Asset source 切換(auto / local / upstream)
- Preset chips(一鍵套裝)
- 強制重新載入 thumbnail(↻)
- 方向按鈕(N/S/E/W 獨立 UI)
- 縮放 preset 按鈕(1×/2×/4×/8×)

不在本 roadmap 處理。列於此處只為記錄差異全貌。

## 子專案規劃

13 項缺口若塞進一份 spec 會超過合理範圍。依「功能聚合度 × 共用程式碼
× 風險獨立性」拆成 5 個子專案,每個獨立進入 spec → plan → 實作循環。

### Sub-project A · Download bar(P0)

- **涵蓋:** F1 PNG 下載、F2 Credits TXT 下載、F3 Credits CSV 下載
- **核心元件:** 新增 `DownloadPopover` / Top bar 鈕,內含三顆下載鍵
- **資料來源:**
  - PNG:複用 PreviewPane 已有的 off-screen canvas → `toBlob('image/png')`
  - TXT/CSV:複用 `AttributionPopover` 內已彙整的 credits 資料,改寫
    成 plain text / CSV 字串
- **規模:** 小(估 1 個 PR)
- **風險:** 低 — 無新依賴,純前端 blob download
- **產物:** `docs/superpowers/specs/<date>-download-bar-design.md`

### Sub-project B · URL hash sync(P1)

- **涵蓋:** F13 URL hash / 可分享連結
- **核心元件:** state ↔ `window.location.hash` 雙向同步
- **資料來源:** 既有 `encodeSelectionToken` / `decodeSelectionToken`
  (`packages/core/`)直接接到 hash
- **規模:** 小
- **風險:** 中 — routing 與 reducer 互動需要小心避開無窮 loop,需要
  獨立 PR 方便 review
- **產物:** `docs/superpowers/specs/<date>-url-hash-sync-design.md`

### Sub-project C · Full Spritesheet Preview(P1 + P2)

- **涵蓋:** F9 完整 sheet 預覽、F10 transparency grid、F11 pink mask 替換
- **核心元件:** 新增 `FullSpritesheetPreview` 元件,放在 PreviewPane
  下方或以 tab 切換
- **資料來源:** compose pipeline 既有 frame 資料;F10/F11 需在 canvas
  繪製階段加 toggle
- **規模:** 中
- **風險:** 中 — 全 sheet 渲染對記憶體/效能有影響,可能需 lazy render
- **依賴:** 抽出的「逐 frame 取 sub-canvas」helper 之後 Sub-project D
  會共用 — 在 C 階段就把 helper 拉到 `packages/web/src/lib/`
- **產物:** `docs/superpowers/specs/<date>-full-spritesheet-preview-design.md`

### Sub-project D · ZIP 匯出全套(P1 + P2)

- **涵蓋:** F4 by animation、F5 by item、F6 by anim+item、F7 by frame
- **核心元件:** 新增 ZIP export 模組,Download bar(Sub-project A 完成
  後)新增四顆 ZIP 鈕
- **新依賴:** `jszip`(MIT,與 GPL-3.0 相容);依 CLAUDE.md 規定,加入前
  須先口頭確認
- **資料來源:** 共用 Sub-project C 抽出的 sub-canvas helper
- **規模:** 中
- **風險:** 中 — bundle size 增加、ZIP 產生在主執行緒可能卡頓,需考慮
  Web Worker
- **依賴:** 建議排在 A、C 之後
- **產物:** `docs/superpowers/specs/<date>-zip-export-design.md`

### Sub-project E · 其他 UI 補強(P2 + P3)

- **涵蓋:**
  - F8 Animation Filters
  - 常駐 Search(把 ⌘K 內的 search 提升為 sidebar 元件)
  - F12 Custom file upload(Advanced Tools)
  - License Filter UI 改成逐 license 勾選(取代單一上限下拉)
- **規模:** 中(內部可再拆 4 個小 PR)
- **風險:** 低 — 多為獨立 UI 元件
- **產物:** `docs/superpowers/specs/<date>-ui-supplements-design.md`(或
  視情況拆 2–3 份 spec)

## 依賴關係

```
A (Download bar)  ─┐
                   ├─► A 與 B 互相獨立、與 C 大致獨立
B (URL hash)      ─┘

C (Full preview)  ─► 抽出 frame helper
                       │
                       ▼
D (ZIP export)    ─► 使用 C 抽出的 helper、需要 A 已有 Download bar 容器

E (UI 補強)        ─► 與其他 4 個都不依賴,可任意時機插入
```

## 建議執行順序

1. **A · Download bar** — 投資/回報比最高,風險最低,最快讓 v2 達成
   「能產出成品」的最低門檻。
2. **B · URL hash sync** — 與 A 平行可做,但建議獨立 PR。
3. **C · Full Spritesheet Preview** — 為 D 鋪路,使用者也馬上有感。
4. **D · ZIP 匯出全套** — 完整 export 工具鏈收尾。
5. **E · UI 補強** — 雜項,最後處理。

## 非目標(YAGNI)

- 移除 v1 路徑(目前由 query string `?v=1` 切換,維持現狀)
- 改動 `packages/core/` 既有 API(除非 sub-project 內明確需要)
- 改動 upstream submodule
- 處理上述「v2 額外多出」清單裡的功能(它們本來就沒缺)
- 為 ZIP 匯出加進度條 UI(jszip 進度 callback 簡單接即可,不做進階)
- 服務端渲染、雲端儲存等任何後端功能

## 已知決策

1. **採用 jszip(MIT)** — 與 GPL-3.0 相容,純前端,無 Web Worker 也能跑
   (Worker 視效能再決定)。最終於 Sub-project D 寫 spec 時提交 dep 加入
   PR,本 roadmap 階段先記錄。
2. **URL hash 內容** — 沿用既有 `encodeSelectionToken` 的 token,避免重
   造輪子。
3. **每個 sub-project 獨立 PR、獨立 spec** — 避免大 PR review 困難。

## 後續流程

本文件確認後:

1. 進入 **Sub-project A · Download bar** 的 brainstorming → spec → plan
   → 實作循環。
2. A 收尾後依序進入 B、C、D、E。
3. 每完成一個子專案,回到本文件勾選對應 F# 並記錄 spec 連結。

## 驗收(本 roadmap 文件本身)

- [ ] 13 項功能缺口都有歸屬到一個子專案
- [ ] 每個子專案有明確涵蓋範圍、規模、風險、產物路徑
- [ ] 依賴關係清楚,無循環
- [ ] 順序建議與依賴一致
