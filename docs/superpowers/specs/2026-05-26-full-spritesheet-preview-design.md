# Web UI · Full Spritesheet Preview(Sub-project C)

- 日期:2026-05-26
- 範圍:`packages/web`
- 狀態:設計已核可,待寫實作計畫
- 上層 roadmap:`2026-05-26-upstream-feature-parity-roadmap.md`(Sub-project C)
- 涵蓋功能缺口:F9(完整 sheet 預覽)、F10(Show transparency grid)、
  F11(Replace Mask (Pink))

## 背景與問題

v2 web UI 的 `PreviewPane` 目前只看得到「單一動畫 × 單一方向」的 64×64
一格。但 compose pipeline 已經在 `ComposedSheet.canvas` 產出**完整 sheet**
(標準 832×3456,加上 custom-animation 區塊時更高),只是沒有 UI 暴露。

對應上游 web 工具的 *Full Spritesheet Preview* 區塊提供:

1. 完整 sheet 預覽(所有動畫、所有方向)
2. *Show transparency grid* — 棋盤格透明背景,辨識透明區
3. *Replace Mask (Pink)* — 把 source 內 RGB(255,44,230) 的半透明遮罩
   替換成真透明

本 spec 把這三項補回 v2,演算法與上游一致;UI 重排成「上方 action bar
+ 單一預覽 + 可拖動 splitter + Full Sheet panel」結構。

## 目標

- 在 `PreviewPane` 的(新搬到上方的)action bar 上,加一顆 `Full Sheet`
  toggle 鍵
- 按下後在單一預覽下方展開 `FullSpritesheetPreview` panel,含 Grid /
  Mask / Zoom(Fit/1×/2×/4×)/ Close 控制
- panel 與單一預覽之間用可拖動 splitter 控制高度比例
- F10 棋盤格、F11 Pink mask 演算法 byte-identical 上游
  (`canvas-utils.drawTransparencyBackground` / `mask.applyTransparencyMaskToCanvas`)
- 所有 view-state(展開、Grid、Mask、Zoom、splitter ratio)session-only,
  不持久化,與目前 v2 行為一致

## 非目標(YAGNI)

- **不抽出 frame helper** — Roadmap 原本提到「C 階段把逐 frame 取
  sub-canvas helper 拉到共用層」,經 brainstorm 後延後到 Sub-project D
  (ZIP 匯出)再做。理由:C 本身只需要整張 canvas,沒有 caller 會把
  helper 設計錯介面。
- localStorage 持久化(目前 v2 連 theme / locale 都沒持久化,本子專案
  不率先引入)
- URL hash 紀錄 Full Sheet 狀態(URL hash 專用於 character selection)
- Pinch-to-zoom(上游有,屬於行動裝置加分項;桌面 UX 用按鈕已足)
- Zoom-to-cursor / pan(scroll + scrollbar 已可達成定位)
- Lazy render / IntersectionObserver(832×3456 ≈ 11MB ImageData,實測
  沒問題再優化)
- 改動 `packages/core` 既有 API
- 改動 `useComposedCharacter`(已正確回傳 `ComposedSheet.canvas`,直接
  用)
- 客製化棋盤格顏色 / tile 大小(沿用上游 8px / `#CCCCCC` / `#999999`)
- 客製化 mask 顏色(沿用上游 `(255, 44, 230)`)

## 設計

### UI 結構(PreviewPane 重排)

```
PreviewPane (重排)
├─ Action bar (新位置:單一預覽上方)
│   N/S/E/W · anim ▾ · ▶ · f01/08 · fps · 🎲 · ─── · [▼ Full Sheet]
│
├─ Single preview canvas (zoom 按鈕 / 資訊 overlay 維持現狀)
│
│   ↓ fullSheetOpen === true 時展開 ↓
│
├─ Splitter (可拖動,ratio 0.15–0.85)
│
└─ FullSpritesheetPreview panel
    ├─ Header:Full Sheet · ☐ Grid · ☐ Pink · [Fit|1×|2×|4×] · ✕
    └─ Canvas body (overflow:auto,雙向 scroll)
```

行為重點:

- Action bar **從 PreviewPane 底部搬到單一預覽上方**;既有欄位
  (N/S/E/W、anim、play、frame counter、dice)順序、樣式不變,
  Full Sheet toggle 是**新增的最右側欄位**,與 dice 之間視覺上留間
  距(用 `ml-auto` 之類分隔)。
- Single preview canvas 的 zoom 按鈕 / `state.anim · dir · zoom · frame`
  資訊 overlay **維持現狀**(canvas 上層 absolute 定位),不併入 action
  bar。
- Splitter / Full Sheet panel **只在 `fullSheetOpen === true` 時 render**
  (不是 `display:none`,是 conditional render — 確保 collapse 時不浪費
  GPU 渲染 panel canvas)。

### State(全部 session-only,放在 `LayerStackHarness` 的 `useState`)

| state key | 型別 | default | 來源 |
|---|---|---|---|
| `fullSheetOpen` | `boolean` | `false` | action bar toggle |
| `fullSheetGrid` | `boolean` | `false` | panel header checkbox |
| `fullSheetMask` | `boolean` | `false` | panel header checkbox |
| `fullSheetZoom` | `'fit' \| 1 \| 2 \| 4` | `'fit'` | panel header zoom buttons |
| `splitterRatio` | `number` (0.15–0.85) | `0.5` | 拖動 splitter |

理由:這些都是 view-only、不影響 character selection,放 SliceState
reducer 反而會把 reducer 弄混(reducer 專注於 character + view-of-anim);
放 `LayerStackHarness` 的 `useState` 與既有 `popover` / `paletteOpen` /
`reloadCounter` 同層,動線一致。

### 元件結構

| 路徑 | 新/改 | 職責 |
|---|---|---|
| `packages/web/src/components/layer-stack/full-spritesheet-preview.tsx` | 新 | `FullSpritesheetPreview` 元件 — 接 `sheet / grid / mask / zoom`,內部 canvas 渲染。emit `onClose` / `onGrid` / `onMask` / `onZoom`。 |
| `packages/web/src/components/layer-stack/preview-pane-splitter.tsx` | 新 | 純 UI splitter — `ratio` + `onChange`,內部用 `pointer` events,釋放後 commit。 |
| `packages/web/src/lib/full-sheet-render.ts` | 新 | `renderFullSheet(displayCanvas, sourceCanvas, { grid, mask })` 純函式(瀏覽器專屬,不放 core)。 |
| `packages/web/src/components/layer-stack/preview-pane.tsx` | 改 | layout 重排:action bar 搬到上方;接收 `fullSheetOpen` 等 props,展開時 render splitter + panel。 |
| `packages/web/src/components/layer-stack/harness.tsx` | 改 | 新增 5 個 useState;props 透 PreviewPane。 |
| `packages/web/src/i18n.ts` | 改 | 新增 `fullSheet.*` keys(en / zh-TW)。 |

`FullSpritesheetPreview` props 介面:

```ts
interface FullSpritesheetPreviewProps {
  sheet: ComposedSheet | null; // null → 顯示 loading / placeholder
  status: 'idle' | 'loading' | 'ready' | 'error';
  grid: boolean;
  mask: boolean;
  zoom: 'fit' | 1 | 2 | 4;
  onGrid: (v: boolean) => void;
  onMask: (v: boolean) => void;
  onZoom: (v: 'fit' | 1 | 2 | 4) => void;
  onClose: () => void;
  t: Translator;
}
```

### 渲染演算法

`renderFullSheet(displayCanvas, sourceCanvas, { grid, mask })`:

```
1. const { width, height } = sourceCanvas
2. displayCanvas.width = width
3. displayCanvas.height = height
4. const ctx = displayCanvas.getContext('2d')
5. ctx.imageSmoothingEnabled = false
6. ctx.clearRect(0, 0, width, height)
7. if (grid) drawTransparencyBackground(ctx, width, height, 8)
       // 8px tile, '#CCCCCC' / '#999999' — 上游同字
8. if (mask):
       const tmp = document.createElement('canvas')
       tmp.width = width; tmp.height = height
       const tmpCtx = tmp.getContext('2d')
       tmpCtx.imageSmoothingEnabled = false
       tmpCtx.drawImage(sourceCanvas, 0, 0)
       applyTransparencyMaskToCanvas(tmp, tmpCtx)
           // for each pixel: if (r,g,b) === (255,44,230) && a > 0 → a = 0
           // 上游同字
       ctx.drawImage(tmp, 0, 0)
   else:
       ctx.drawImage(sourceCanvas, 0, 0)
```

關鍵:**永不 mutate `sourceCanvas`(就是 `ComposedSheet.canvas`)**。
Mask 路徑用 tmpCanvas 中介,與上游一致(`copyToPreviewCanvas` 的注解
也提到「avoid modifying the original offscreen canvas which causes a
bug if the user toggles the checkbox multiple times」)。

`drawTransparencyBackground` 與 `applyTransparencyMaskToCanvas` 重寫在
`packages/web/src/lib/full-sheet-render.ts`,**演算法 byte-identical**
上游 `canvas-utils.ts` / `mask.ts`(不複用上游檔案,因為 upstream/ 是
read-only submodule)。

### Zoom 行為

CSS-only,不重畫 canvas:

| zoom value | CSS 樣式 |
|---|---|
| `'fit'` | `max-width: 100%; height: auto;` |
| `1` | `width: ${sheet.width}px; height: auto;` |
| `2` | `width: ${sheet.width * 2}px; height: auto;` |
| `4` | `width: ${sheet.width * 4}px; height: auto;` |

`image-rendering: pixelated` 一律開啟。

Canvas 容器 `overflow: auto`,zoom > fit 時自動雙向 scrollbar。

### Splitter 行為

- 元件接 `ratio: number` + `onChange(next: number) => void`。
- 拖動時持續 `onChange`(過程中即時 update,簡單做法 — 沒效能問題就不做
  drag-end commit)。
- clamp 到 `[0.15, 0.85]`(避免任一邊被擠到 0)。
- 高度計算:`preview-region` 的可用高度 × ratio = 上半(單一預覽)、
  剩下的高度 = 下半(panel)。
- 拖動時 `cursor: ns-resize`,UI 顯示一條細的可拖動條(4–6px 高,hover
  時加亮)。
- 鍵盤可達性:暫不做(YAGNI);只支援 pointer。

### Loading / Error 處理

| 情境 | 行為 |
|---|---|
| `result.sheet === null` && action bar 的 Full Sheet 鈕 | 鈕 enabled(可開,但 panel 內顯示 placeholder) |
| `fullSheetOpen` 且 `status === 'loading'` | panel body 顯示 i18n `fullSheet.loading`(沿用 `t('download.loading')` 風格),canvas 不渲染 |
| `fullSheetOpen` 且 `status === 'error'` | panel body 顯示 i18n `fullSheet.error` |
| `fullSheetOpen` 且 `status === 'ready'` | 正常渲染 canvas |
| sheet 從 ready → loading(切角色)| panel body 切到 loading placeholder,**不 force-close panel**(避免畫面跳動) |

### 對 custom-animation 高度的處理

`ComposedSheet` 的 `width` 永遠是 832,`height` 在無 custom animation 時
為 3456,有 custom animation 時更高。本元件 **直接讀 `sheet.width` /
`sheet.height`**,不做特殊判斷 — display canvas 跟著 source 大小即可。
custom animation 區塊會自然出現在 sheet 下半部,與既有上游行為一致。

### i18n keys(新增)

```
en:
  fullSheet.toggle  = "Full Sheet"
  fullSheet.title   = "Full Spritesheet"
  fullSheet.grid    = "Grid"
  fullSheet.mask    = "Replace Pink"
  fullSheet.zoom.fit = "Fit"
  fullSheet.close   = "Close"
  fullSheet.loading = "Sheet is still composing…"
  fullSheet.error   = "Failed to compose"

zh-TW:
  fullSheet.toggle  = "完整圖集"
  fullSheet.title   = "完整圖集預覽"
  fullSheet.grid    = "棋盤背景"
  fullSheet.mask    = "替換粉紅遮罩"
  fullSheet.zoom.fit = "適應"
  fullSheet.close   = "關閉"
  fullSheet.loading = "圖集編譯中…"
  fullSheet.error   = "編譯失敗"
```

## 已核可的設計決策

1. **UI 位置:** PreviewPane 下方常駐,但**預設收合**,由 action bar 的
   toggle 鈕開合(不放 modal、tab、drawer)。
2. **Action bar 位置:** 從 PreviewPane 底部搬到單一預覽上方;Full Sheet
   toggle 放在 bar 最右側。
3. **展開時的高度策略:** 可拖動 splitter,ratio clamp 到 [0.15, 0.85],
   預設 0.5。
4. **渲染策略:** 複製 source canvas 到獨立 display canvas,grid / mask
   都在 display canvas 處理;never mutate source。演算法 byte-identical
   上游。
5. **Zoom 控制:** Fit + 1×/2×/4×(共 4 個按鈕);Fit = `max-width:100%
   height:auto`;倍率 = 對應 CSS width;**不做 zoom-to-cursor / pan /
   slider**。
6. **State 持久化:** session-only,放 `LayerStackHarness` 的 useState,
   不進 SliceState reducer、不進 localStorage、不進 URL hash。
7. **Frame helper 抽離:** 延後到 Sub-project D。
8. **演算法常數:** 棋盤格 8px `#CCCCCC` / `#999999`、mask `(255,44,230)`,
   皆 byte-identical 上游,不暴露使用者調整。
9. **不做 pinch-to-zoom / 客製化捲動:** 用 native scrollbar。

## 驗收條件

- [ ] PreviewPane action bar **從底部搬到單一預覽上方**;既有欄位
      (N/S/E/W / anim / play / frame counter / dice)順序與既有一致,
      最右側**新增**一顆 `Full Sheet` toggle 鈕
- [ ] 按下 `Full Sheet` toggle:單一預覽下方出現 splitter + Full Sheet
      panel;再按一次或按 panel header 的 ✕ → 收回(panel 與 splitter
      conditional unmount,不只是 `display:none`)
- [ ] Panel header 含 Grid checkbox、Mask checkbox、Zoom Fit/1×/2×/4×
      四鈕、Close ✕
- [ ] Grid 切換:棋盤格立即顯示 / 消失,8px tile,`#CCCCCC` / `#999999`
      與上游同(像素比對 fixture 至少 1 個)
- [ ] Mask 切換:source 內 RGB(255,44,230) 的半透明像素立即變透明 /
      還原;切換多次不留汙染(因為 source 從未被 mutate)
- [ ] 切角色 → sheet 變動 → Full Sheet panel 自動 re-render,zoom / grid
      / mask state 保留
- [ ] 預設值:`fullSheetOpen=false`、`Grid=off`、`Mask=off`、`Zoom=Fit`、
      `splitterRatio=0.5`
- [ ] Splitter 拖動更新比例,clamp 在 [0.15, 0.85];released ratio 不
      跳動
- [ ] `result.sheet === null` 時 panel body 顯示 loading placeholder,
      不嘗試 render canvas(無 console 錯誤)
- [ ] `result.status === 'error'` 時 panel body 顯示 error placeholder
- [ ] Custom animation selection(例如 wheelchair)時 panel 渲染完整
      sheet 高度,custom 區塊正確顯示在下半部
- [ ] Reload 後 `fullSheetOpen=false` 等 5 個 state 都回到 default(no
      persistence — 由 v2 既有行為決定)
- [ ] dark / light theme 都正常顯示(panel header 配色、splitter cursor
      / hover 樣式)
- [ ] en / zh-TW i18n 都正常
- [ ] 既有 PreviewPane 行為不受影響(single-animation playback、zoom
      overlay、direction buttons、dice — regression check)
- [ ] `pnpm typecheck` 通過、`pnpm test` 通過、`pnpm lint` 通過
