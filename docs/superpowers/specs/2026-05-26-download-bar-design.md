# Web UI · Download Bar(Sub-project A)

- 日期:2026-05-26
- 範圍:`packages/core`、`packages/web`
- 狀態:設計已核可,待寫實作計畫
- 上層 roadmap:`2026-05-26-upstream-feature-parity-roadmap.md`(Sub-project A)
- 涵蓋功能缺口:F1(PNG 下載)、F2(Credits TXT)、F3(Credits CSV)

## 背景與問題

v2 web UI 目前**沒有任何下載入口**:使用者組好角色後無法把成果存成
檔案、無法保存授權資訊。對應上游 web 工具的這三項是核心 use case:

1. Spritesheet (PNG) — 完整 sheet 給遊戲引擎使用
2. Credits (TXT) — 人讀的授權清單
3. Credits (CSV) — 結構化授權清單

本 spec 把這三項補回 v2,並讓 TXT/CSV 輸出與上游 byte-identical。

## 目標

- 在 TopBar 加一顆 `⬇Download` popover 鈕,內含 PNG / TXT / CSV 三項下載
- PNG = `ComposedSheet.canvas` 直接 `toBlob('image/png')`
- TXT/CSV 與上游 `creditsToTxt` / `creditsToCsv` byte-identical
- 把格式化函式放在 `packages/core/`,環境無關,方便 CLI 共用
- 三個下載動作都在 sheet ready 時才啟用,失敗有 status toast 提示

## 非目標(YAGNI)

- ZIP 匯出(Sub-project D)
- Export/Import JSON 剪貼簿(`TokenPopover` 已涵蓋,不重做)
- 客製檔名(讓使用者輸入名稱)— 用固定檔名,與上游一致
- 進度條(瞬間完成)
- 下載歷史 / 雲端 / 分享
- 改動 `packages/core/getCredits` 內部邏輯(已正確,直接讀
  `ComposedSheet.credits`)
- 改動 `AttributionPopover` 內容呈現方式(per-item 顯示維持現狀,
  Download 走 per-file)
- 多動畫合併到同一份 credits 檔案(沿用上游慣例:固定挑「代表動畫」
  寫入 filename 欄位)

## 設計

### 元件結構

```
TopBar
├─ BodyTypePopover            (既有)
├─ TokenPopover               (既有)
├─ ResetMenuPopover           (既有)
├─ AttributionPopover         (既有)
├─ PaletteTrigger             (既有)
└─ DownloadPopover            (新增)
   └─ 三顆下載鍵
      ├─ Spritesheet (PNG)
      ├─ Credits (TXT)
      └─ Credits (CSV)
```

`DownloadPopover` 沿用既有 `usePopover` hook,排版與 TokenPopover /
AttributionPopover 一致。

### 三個下載動作

#### A. Spritesheet (PNG)

- 來源:`result.sheet.canvas`(`ComposedSheet.canvas`,完整 832×3456
  + 客製動畫區塊)
- 動作:`canvas.toBlob('image/png')` → 透過 `downloadBlob` helper 觸發
  `<a download>`
- 檔名:`character-spritesheet.png`(與上游同字)

#### B. Credits (TXT)

- 來源:`result.sheet.credits`(`CreditsManifest`,已是 per-file 過濾)
- 格式:byte-identical 上游 `utils/credits.ts:creditsToTxt`:
  ```
  body/bodies/male/walk.png
  \t- Note: (notes if any)
  \t- Licenses:
  \t\t- CC-BY-SA 3.0
  \t\t- GPL 3.0
  \t- Authors:
  \t\t- author1
  \t\t- author2
  \t- Links:
  \t\t- https://...
  ```
- 檔名:`credits.txt`

#### C. Credits (CSV)

- 來源:同 B
- 格式:byte-identical 上游 `utils/credits.ts:creditsToCsv`:
  ```csv
  filename,notes,authors,licenses,urls
  "body/bodies/male/walk.png","","author1, author2","CC-BY-SA 3.0, GPL 3.0","https://..."
  ```
- 檔名:`credits.csv`

### 「代表動畫」決定

TXT/CSV 的 filename 欄位含 `<animation>.png`,所以匯出時要選一個動畫
當代表(不然同份 body credit 會重複 9 次)。

- v2 採用 `state.anim`(使用者目前在 PreviewPane 看的那個動畫)
- 上游採用 `state.selectedAnimation`,語意等同
- `state.anim` 是客製動畫名也照寫,不做特殊處理

### 程式碼擺放(layering)

| 路徑 | 內容 | 依賴 |
|---|---|---|
| `packages/core/src/credits-format.ts`(新) | `creditsToTxt(manifest, anim)` / `creditsToCsv(manifest, anim)` 純函式 | 無 DOM |
| `packages/core/src/index.ts` | 匯出上述兩個函式 | — |
| `packages/web/src/lib/download.ts`(新) | `downloadBlob(blob, filename)` browser helper(`<a download>` 觸發) | DOM |
| `packages/web/src/components/layer-stack/popovers/download-popover.tsx`(新) | `DownloadPopover` 元件 | core + lib/download |
| `packages/web/src/components/layer-stack/harness.tsx`(改) | 註冊 `'download'` popover state、嵌入 `DownloadPopover` | — |
| `packages/web/src/i18n.ts`(改) | 新增 download.* keys | — |

### Harness state 改動

`harness.tsx` 既有的 popover state union 從:
```ts
'bodyType' | 'token' | 'reset' | 'attribution'
```
擴充為:
```ts
'bodyType' | 'token' | 'reset' | 'attribution' | 'download'
```

`useComposedCharacter` 已經回傳 `result`,從 harness 經 props 帶到
`DownloadPopover` 即可。

### 錯誤處理 & 邊界

| 情境 | 行為 |
|---|---|
| Sheet 還在 compose(`result.sheet === null`) | 三顆鍵 `disabled`,hover 顯示 `t('download.loading')` |
| Sheet compose 失敗(`result.status === 'error'`) | 三顆鍵 `disabled`(同上 disabled tooltip 改為錯誤狀態) |
| `canvas.toBlob` 失敗(記憶體不足等) | `setStatus({ kind: 'error', text: t('download.failed') })`,沿用 TopBar 既有 status toast |
| Credits manifest 為空 | TXT/CSV 仍可下載,TXT 內容為空字串、CSV 內容只有標頭列 |
| `state.anim` 是客製動畫名 | 直接用該名字當代表動畫,不做 fallback |

### i18n keys(新增)

```
en:
  download.title       = "Download"
  download.png         = "Spritesheet (PNG)"
  download.creditsTxt  = "Credits (TXT)"
  download.creditsCsv  = "Credits (CSV)"
  download.loading     = "Sheet is still composing…"
  download.failed      = "Download failed"
  download.done        = "Saved ✓"

zh-TW:
  download.title       = "下載"
  download.png         = "完整圖集 (PNG)"
  download.creditsTxt  = "授權說明 (TXT)"
  download.creditsCsv  = "授權說明 (CSV)"
  download.loading     = "圖集編譯中…"
  download.failed      = "下載失敗"
  download.done        = "已儲存 ✓"
```

## 已核可的設計決策

1. **UI 位置:** TopBar popover(與既有 BodyType/Token/Reset/Attribution/
   Palette 平行),不放 AttributionPopover 內、不放 SettingsCollapsible、
   不放 PreviewPane bottom toolbar。
2. **PNG 內容:** 完整 sheet,與上游一致。不另加「當前 frame」選項。
3. **Credits 來源:** `ComposedSheet.credits`(per-file 過濾,與上游
   `getAllCredits` 同邏輯),不沿用 AttributionPopover 的 per-item 資料。
4. **Credits 格式:** byte-identical 上游 TXT/CSV,filename 欄位以
   `state.anim` 當代表動畫。
5. **格式化函式擺放:** `packages/core/src/credits-format.ts`(環境無
   關,CLI 可共用)。

## 驗收條件

- [ ] TopBar 出現 `⬇Download` 鈕,點開出現三顆下載鍵
- [ ] Sheet 未 ready 時三顆鍵 disabled,hover 顯示 loading tooltip
- [ ] PNG 內容與目前 PreviewPane 看到的角色一致(含全部動畫)
- [ ] PNG 檔案大小合理(標準 sheet 預期 50–300 KB 範圍)
- [ ] TXT 內容與上游 `creditsToTxt` 對同樣 selections + 同樣 anim 產出
      byte-identical
- [ ] CSV 內容與上游 `creditsToCsv` 對同樣 selections + 同樣 anim 產出
      byte-identical
- [ ] `packages/core/src/credits-format.ts` 有 unit test 覆蓋 fixture
      比對(至少 1 個 selections fixture × TXT + CSV)
- [ ] dark / light theme 都正常顯示
- [ ] en / zh-TW i18n 都正常
- [ ] 既有 BodyType / Token / Reset / Attribution / Palette popover 不
      受影響(regression check)
- [ ] `pnpm typecheck` 通過、`pnpm test` 通過
