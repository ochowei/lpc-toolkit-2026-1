# Web UI · ZIP 匯出全套(Sub-project D)

- 日期:2026-05-26
- 範圍:`packages/core`、`packages/web`
- 狀態:設計已核可,待寫實作計畫
- 上層 roadmap:`2026-05-26-upstream-feature-parity-roadmap.md`(Sub-project D)
- 涵蓋功能缺口:F4(ZIP by animation)、F5(ZIP by item)、F6(ZIP by animation + item)、F7(ZIP by animation + frame)
- 前置 sub-projects:A(Download bar)、C(Full Spritesheet Preview)

## 背景與問題

v2 web UI 在 Sub-project A 收尾後已能下載「完整 PNG + Credits TXT/CSV」,但
對應上游 web 工具的 4 種 ZIP 匯出方式 v2 仍完全沒有。這 4 種匯出是遊戲引擎
工作流常用的切分方式:

1. **By animation**:每個 anim 一個 PNG(例:`walk.png` 含所有方向)
2. **By item**:每個 selected item 一個 PNG(例:`body_male_light.png` 含
   該 item 所有 anim)
3. **By animation and item**:交叉切分(例:`walk/body_male_light.png`)
4. **By animation and frame**:逐 frame 一個 PNG(例:`walk/down/3.png`)

本 spec 把這 4 種 ZIP 匯出補回 v2,共用同一個 `DownloadPopover`(Sub-project A
的擴增),路徑/檔名 byte-identical 上游。

## 目標

- 在 `DownloadPopover` 加 4 顆 ZIP 下載鈕,沿用既有 disabled / status toast
  機制
- ZIP 內容含對應 PNG 切分 + `credits/credits.txt` + `credits/credits.csv`
- 路徑/檔名/timestamp 格式與上游 byte-identical(`standard/walk.png` /
  `items/050 body_male_light.png` / `lpc_<bodyType>_<kind>_<timestamp>.zip`)
- 抽出一個 `extractAnimationFrames` helper 到 `packages/core/`,讓 F7
  by-frame 能拆 frame,也讓未來 CLI 可共用
- ZIP 跑到一半的角色切換不會中斷該次 export
- jszip lazy-load:首次 SPA 載入不含 jszip,首次點 ZIP 鈕才動態 import
- 跑 ZIP 時有 slim progress bar(0–100%),完成 / 失敗用既有 status toast

## 非目標(YAGNI)

- **Web Worker / OffscreenCanvas**:全部走主執行緒,F7 by-frame 用
  `setTimeout(0)` 微批 yield 給 UI。實測卡頓再加 Worker(留 follow-up)。
- **Cancel 按鈕**:jszip 不支援 cancel,patch 太大,YAGNI。
- **ETA / 速率顯示**:只顯示 0–100%,不算剩餘時間。
- **下載前 preview / 確認 dialog**:點即下載。
- **Retry**:跑失敗就 fail。
- **IndexedDB 暫存**:每次重跑。
- **character.json / metadata.json 寫入 ZIP**:v2 沒有對應 schema,
  寫入要新 serializer,屬另一 feature。GPL 法律要求由 credits.txt
  滿足即可,不需要這兩個檔。
- **per-layer 匯出**(上游 F5 是 per-layer,v2 是 per-item):v2 的
  `composeSelections` 是 per-Selections,沒有 per-layer API。Per-item
  粒度對 v2 的使用者模型更一致(v2 選 item 不選 layer)。
- **全透明動畫 placeholder**:`sheet.animations` 已是「實際 compose
  出來」清單,沒被 compose 的動畫就不出現在 ZIP 內。
- **全透明 frame 也輸出**(F7):跳過全透明 frame,直接抄上游
  `checkFrameContentFromImageData`。
- **改動 `composeSelections` / `extractAnimation` 既有 API**:F5/F6 直接
  reuse `composeSelections`,F4 reuse `extractAnimation`。
- **Web Worker 預載入**:不預載入 jszip(lazy-import,點到才載)。

## 已收斂的設計決策

1. **jszip 加入方式**:`packages/web` dependencies,**lazy import**
   (`await import('jszip')` 在 ZIP handler 內),Vite 自動切 chunk。
   MIT license,與 GPL-3.0 相容。
2. **F5/F6 by-item 策略**:reuse `composeSelections`,每個 selected item
   重 compose 一次,粒度為 **per-item(非 per-layer)**。
3. **Web Worker**:不做(全部主執行緒;F7 用 `setTimeout(0)` 每 32 個
   frame yield)。
4. **ZIP 內容**:`credits/credits.txt` + `credits/credits.csv`(都附),
   不附 character.json、不附 metadata.json。
5. **路徑/檔名/timestamp**:byte-identical 上游。
6. **Frame helper 擺放**:`packages/core/src/frames.ts`,跨環境,用
   `CanvasAdapter` DI(沿用既有 `extractAnimation` 套路)。
7. **進度回報 UI**:slim progress bar(0–100%),不顯示 ETA / cancel。
8. **F5/F6 重複 compose 的記憶體上限**:不設上限。
9. **F7 客製動畫也 by-frame**:做(複用同一 helper)。

## 設計

### §1 · 模組分層與檔案結構

```
packages/core/src/
└─ frames.ts                                    [新]
     - extractAnimationFrames(sheet, animName, { adapter, skipEmpty })

packages/web/src/lib/
├─ download.ts                                   [既有]
└─ zip-export.ts                                 [新]
     共用 ExportContext:
       {
         sheet: ComposedSheet,           // 開跑時 freeze
         selections: Selections,          // F5/F6 需要
         catalog: Catalog,                // F6 查 item animations
         anim: string,                    // credits 代表動畫
         composeSingleItem: (Selections) => Promise<ComposedSheet>,  // F5/F6
         adapter: CanvasAdapter,          // F4/F7 給 extractAnimation* 用
         onProgress: (p: number) => void  // 0..1,合成兩階段進度
       }

     四個 export(都吃 ExportContext):
       - exportByAnimationZip(ctx)        // F4
       - exportByItemZip(ctx)             // F5
       - exportByAnimItemZip(ctx)         // F6
       - exportByFrameZip(ctx)            // F7

     私有 helper:
       - zipName(bodyType, kind), writeCredits(zip, sheet, anim),
         encodeBlob(canvas), yieldToUi(), itemFileName(itemId, variant, name, zPos)

packages/web/src/components/layer-stack/popovers/
└─ download-popover.tsx                          [改:擴增 4 顆 ZIP 鈕]

packages/web/src/components/layer-stack/
└─ harness.tsx                                   [改:zipRunning state]
```

設計理由:
- `frames.ts` 在 core,跟既有 `animation.ts` 同層,沿用 `CanvasAdapter`
  套路 — 與 `extractAnimation` 體例一致,CLI 未來可共用
- ZIP 真正的 IO/jszip 互動只在 web,所以全部 ZIP 邏輯收在
  `packages/web/src/lib/zip-export.ts` 單一檔(four exports + 私有
  helpers),不切多檔避免散亂
- `DownloadPopover` 只擴 4 顆鈕、不拆元件 — 與 popover 既有風格一致

ZIP 內容(每個 ZIP):

| 路徑 | 來源 |
|---|---|
| `standard/<anim>.png`(F4) 或 `items/<file>.png`(F5) 等 | 各 export 函式 |
| `credits/credits.txt` | `creditsToTxt(sheet.credits, anim)` |
| `credits/credits.csv` | `creditsToCsv(sheet.credits, anim)` |

> 註 1:F5 by-item 沒有「代表動畫」概念(整張只有單一 item 全部 anim),
> credits.txt 沿用「當前 `state.anim`」當代表動畫(與 Sub-project A 同邏輯)。
>
> 註 2:F7 by-frame 的 credits 也用 `state.anim` 當代表(與上游一致)。

### §2 · 4 個 export 的演算法細節 + 檔名

#### F4 · Split by animation

```
for anim in sheet.animations:                    # 標準動畫
    animCanvas = extractAnimation(sheet, anim, { adapter })
    zip.file(`standard/${anim}.png`, await encodeBlob(animCanvas))

for name in sheet.customAnimations.keys():       # 客製動畫(wheelchair…)
    customCanvas = extractAnimation(sheet, name, { adapter })
    zip.file(`custom/${name}.png`, await encodeBlob(customCanvas))

writeCredits(zip, sheet, state.anim)             # credits/credits.txt + csv
download `lpc_${bodyType}_animations_${timestamp}.zip`
```

- 直接複用既有 `extractAnimation`(已處理標準 + 客製兩條路徑)
- `sheet.animations` 已經是「實際被 compose 出來的標準動畫」清單;`watering`
  / `1h_slash` 這類 `noExport` 動畫,因為 `folderName` 對應同一 row,
  `composeSelections` 已正確處理(`watering` 不會進 `sheet.animations`,
  `1h_slash` / `1h_backslash` 兩個若同時宣告會出現兩次)
- **不**對全透明動畫做篩選(YAGNI;`sheet.animations` 本來就只有有 compose
  的)

#### F5 · Split by item

```
for [typeName, sel] in selections.items:
    singleSelections = { bodyType, items: { [typeName]: sel } }
    itemSheet = await composeSelections(singleSelections, options)
    filename = `${zPad(zPos)} ${safeName(itemId, variant, name)}.png`
    zip.file(`items/${filename}`, await encodeBlob(itemSheet.canvas))
    await yieldToUi()

writeCredits(zip, sheet, state.anim)
download `lpc_${bodyType}_item_spritesheets_${timestamp}.zip`
```

- 對每個 selected item 跑完整 pipeline → 得到該 item 在所有 anim 的 sheet,
  粒度為 **per-item(非 per-layer)**
- 每個 item 一次完整 IO + recolor,N items 次。一般角色 7–10 items,
  可接受(且圖檔 HTTP cache 命中率高,實際 IO 集中在第一個 item)
- 檔名 `${zPos zero-padded 3} ${safeName}.png` 跟上游同字:
  - `zPos` = `item.layer_1.zPos`(item 主要 z 序)
  - `safeName` = `(name || ${itemId}_${variant}).replace(/[^a-z0-9.]/gi, '_').toLowerCase()`
    (與上游 `getItemFileName` 同邏輯)
- **ComposeOptions 注入**:`DownloadPopover` 不自己持有 `catalog` /
  `palettes` / `assetSource`。`LayerStackHarness` 已經有這些,thread 進
  popover 為**單一 callback prop**:

  ```ts
  // harness 端建立(closure 抓 catalog / palettes / assetSource)
  const composeSingleItem = useCallback(
    async (singleSelections: Selections): Promise<ComposedSheet> => {
      const adapter = createBrowserCanvasAdapter(assetSource);
      return composeSelections(singleSelections, {
        catalog,
        adapter,
        spritesheetsBaseUrl: '',
        resolvePalette: makeResolvePalette(catalog, palettes, singleSelections),
      });
    },
    [catalog, palettes, assetSource],
  );

  // popover props 新增:
  // composeSingleItem: (s: Selections) => Promise<ComposedSheet>
  ```

  zip-export.ts 內 F5/F6 呼叫 `composeSingleItem(singleSelections)`,不直接 import
  core 的 `composeSelections`(維持 web → core 的單一依賴邊界一致)。同時也讓
  `zip-export.ts` 的 unit test 可以 mock 此 callback 而不用真的跑 compose。

#### F6 · Split by animation and item

```
const itemSheets = new Map<TypeName, ComposedSheet>();
for [typeName, sel] in selections.items:
    itemSheets.set(typeName, await composeSelections(singleSelections, options))

for anim in sheet.animations:                    # 標準動畫
    for [typeName, sel] in selections.items:
        itemDef = catalog.byItemId.get(itemId)
        if !itemDef.animations.includes(anim): continue
        itemSheet = itemSheets.get(typeName)!
        animCanvas = extractAnimation(itemSheet, anim, { adapter })
        zip.file(`standard/${anim}/${itemFileName}`, await encodeBlob(animCanvas))
        await yieldToUi()

# custom animation 同樣 nested:custom/<name>/<itemFileName>

writeCredits(zip, sheet, state.anim)
download `lpc_${bodyType}_item_animations_${timestamp}.zip`
```

- **效能要點**:itemSheet 在迴圈外 cache,每個 item 只 compose 一次,然後
  對每個 anim `extractAnimation`(極輕,只是 sub-canvas 切片)
- 已支援動畫的 item 才放入該 anim folder(用 `catalog.byItemId.get(itemId).animations`)
- itemFileName 邏輯同 F5

#### F7 · Split by animation and frame

```
for anim in sheet.animations:                    # 標準動畫
    framesByDir = extractAnimationFrames(sheet, anim, { adapter, skipEmpty: true })
    for [dir, frames] in framesByDir:
        for { frameNumber, canvas } in frames:
            zip.file(`standard/${anim}/${dir}/${frameNumber}.png`, await encodeBlob(canvas))
            encodedCount += 1
            if encodedCount % 32 === 0: await yieldToUi()

# custom 同上:custom/<name>/<dir>/<frameNumber>.png

writeCredits(zip, sheet, state.anim)
download `lpc_${bodyType}_individual_frames_${timestamp}.zip`
```

- 用新的 `extractAnimationFrames(sheet, anim, { adapter, skipEmpty })` helper
- 跳過全透明 frame:做。直接抄上游 `checkFrameContentFromImageData` 邏輯
- frame 編號從 1 開始(上游同字)
- 每 32 個 frame yield 一次 UI

#### Timestamp 格式

```ts
const zipExportTimestamp = (): string =>
  new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
// e.g. "2026-05-26T14-32-08"
```

byte-identical 上游 `utils/zip-helpers.ts:zipExportTimestamp`。

### §3 · `extractAnimationFrames` 介面、UI 改動、進度條串接

#### `packages/core/src/frames.ts` 介面

```ts
import type { Direction } from './constants.js';
import type { CanvasAdapter, CanvasLike } from './adapters.js';
import type { AnimationName, ComposedSheet } from './types.js';

export interface ExtractFramesOptions {
  readonly adapter: CanvasAdapter;
  /**
   * Skip frames whose pixels are all transparent. Defaults to true —
   * matches upstream `extractFramesFromAnimation` behaviour for the
   * standard sheet (custom animations always emit every frame upstream,
   * but v2 unifies on "skip empties" for simpler downstream UX).
   */
  readonly skipEmpty?: boolean;
}

export interface FrameSlice {
  readonly canvas: CanvasLike;
  /** 1-indexed within its direction row (upstream parity). */
  readonly frameNumber: number;
  readonly direction: Direction;
}

export function extractAnimationFrames(
  sheet: ComposedSheet,
  name: AnimationName,
  options: ExtractFramesOptions,
): ReadonlyMap<Direction, readonly FrameSlice[]>;
```

實作要點:
- 內部用 `sheet.canvas.getContext('2d').getImageData` 一次抓一整 row,再對每個
  64×64 slot 做 `hasContent` 檢查
- 標準動畫:用 `ANIMATION_CONFIGS[name]` 取得 `row` / `num`;frame 數來自
  `STANDARD_ANIMATION_FRAMES_PER_ROW = 13`(有內容才 emit)
- 客製動畫:用 `sheet.customAnimations.get(name)` 取得 region;frame 數來自
  `region.cols`,frame size 來自 `region.frameSize`
- Direction 對應(標準與客製共用 `DIRECTIONS = ['up','left','down','right']`):
  - **標準動畫 num=1**(`hurt` / `climb`):只回 `'up'`
  - **標準動畫 num=4**:全 4 個方向
  - **客製動畫 region.rows=1**:只回 `'up'`
  - **客製動畫 region.rows≥2**:依 `DIRECTIONS` 順序前 `rows` 個方向
    (`rows=2` → up + left,`rows=4` → 全部),與上游
    `CUSTOM_ANIM_DIRECTION_TO_ROW` 同字
- 未知 anim:throw(與 `extractAnimation` 一致)

**Adapter 限制**:`CanvasAdapter.createCanvas` 已有,且 `CanvasLike.getContext('2d')`
拿到的型別已涵蓋 `getImageData`(browser 與 `@napi-rs/canvas` 都支援)。
不用新增 adapter method。

#### UI 改動

`download-popover.tsx` 擴增 4 顆 ZIP 鈕,popover 內版面:

```
┌─ Download ────────────────┐
│ ┌─────────────────────┐  │
│ │ Spritesheet (PNG)   │  │  ← Sub-project A
│ │ Credits (TXT)       │  │
│ │ Credits (CSV)       │  │
│ └─────────────────────┘  │
│ ─────  ZIP  ──────────── │  ← 分隔線 + 小標
│ ┌─────────────────────┐  │
│ │ ZIP · By Animation  │  │  ← 新 F4
│ │ ZIP · By Item       │  │  ← 新 F5
│ │ ZIP · Anim + Item   │  │  ← 新 F6
│ │ ZIP · By Frame      │  │  ← 新 F7
│ └─────────────────────┘  │
│ ▱▱▱▱▱▱▱▱▱▱▱▱  35%        │  ← 進度條(running 時才出現)
│ Sheet is still composing… │  ← disabled tooltip(既有)
└──────────────────────────┘
```

- 寬度從 `w-64`(256px)放寬到 `w-72`(288px),讓較長 label 不換行
- 用 `<hr class="my-2 border-border" />` + `<span class="text-[10px] uppercase tracking-wide text-text-mute">ZIP</span>` 做分組標題
- ZIP 鈕全用 `variant="default"`(非 primary)— PNG 才是主要 CTA

#### Popover state(`harness.tsx`)

不需要改 popover discriminator(已是 `'download'` 即可)。新增單一 state:

```ts
const [zipRunning, setZipRunning] = useState<null | {
  kind: 'byAnimation' | 'byItem' | 'byAnimItem' | 'byFrame';
  progress: number;  // 0..1
}>(null);
```

放在 `harness.tsx`(與既有 popover state 同層),透 props 入 `DownloadPopover`。

- 開始跑 ZIP 時 `setZipRunning({ kind, progress: 0 })`
- 階段性更新 `setZipRunning(r => r && { ...r, progress })`
- 完成或錯誤 → `setZipRunning(null)`

#### 進度條串接

兩階段 progress,合成 0–100%:

```
[0%, 50%]    : per-canvas encode 進度(本地估算)
              = (encodedCount / totalCanvases) * 0.5
[50%, 100%]  : jszip generateAsync 進度
              = 0.5 + (jsZipPercent / 100) * 0.5
```

理由:
- F7 by-frame 有 ~300 canvases,PNG encode 階段佔大半時間
- jszip 階段只是 STORE(不 deflate,因為 PNG 已壓過),也快
- 上游也接 jszip progress callback(`zipGenerateBlobWithProfiler` 內)

helper:

```ts
// Note: ComposedSheet.canvas is typed CanvasLike (env-agnostic). Browser
// adapter produces a real HTMLCanvasElement, so callers cast at the boundary
// — same pattern as Sub-project A's DownloadPopover PNG handler. Likewise
// extractAnimationFrames returns FrameSlice[] with CanvasLike — cast to
// HTMLCanvasElement before passing to encodeBlob().
function encodeBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/png',
    );
  });
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));
```

每 32 個 PNG encode 一次 yield;F4/F5/F6 量少不需要,只 F7 用。

#### Disabled / 互斥

- `sheet === null` 或 `result.status === 'error'` → 全部下載鈕 disabled
  (沿用 Sub-project A 邏輯)
- `zipRunning !== null` → 4 顆 ZIP 鈕 disabled(避免並發);PNG/TXT/CSV
  不 disabled(它們同步 + 快速)
- 進度條只在 `zipRunning !== null` 時 render

#### i18n keys(新增)

```
en:
  download.zipByAnim       = "ZIP · By Animation"
  download.zipByItem       = "ZIP · By Item"
  download.zipByAnimItem   = "ZIP · Animation + Item"
  download.zipByFrame      = "ZIP · By Frame"
  download.zipSectionLabel = "ZIP"
  download.zipBusy         = "Packing…"

zh-TW:
  download.zipByAnim       = "ZIP · 依動畫"
  download.zipByItem       = "ZIP · 依項目"
  download.zipByAnimItem   = "ZIP · 動畫 × 項目"
  download.zipByFrame      = "ZIP · 逐 frame"
  download.zipSectionLabel = "ZIP"
  download.zipBusy         = "封包中…"
```

### §4 · 錯誤處理、測試策略

#### 錯誤處理

| 情境 | 行為 |
|---|---|
| `await import('jszip')` 失敗 | `onStatus({ kind: 'error', text: t('download.failed') })`,`zipRunning` 設回 null,popover 不關 |
| F5/F6 單一 `composeSelections` 失敗 | 該 item skip(不中斷整個 ZIP),`console.warn` 印 itemId。與 `composeSelections` 內部對 per-image 失敗的吞錯策略一致 |
| `canvas.toBlob` 回 null | 該 frame/item skip,`console.warn` 印路徑 |
| jszip `generateAsync` 失敗 | `onStatus({ kind: 'error', text: t('download.failed') })`,`zipRunning` 設回 null |
| ZIP 內容為空 | 仍下載 ZIP(只含 credits/),不顯示特殊錯誤 |
| user 在 ZIP 跑到一半切角色 | 跑到完整個 ZIP **不取消、不重來**;用開跑時抓的 sheet ref 跑完。使用者拿到「點下去那一瞬間」的狀態 |
| user 在 ZIP 跑到一半開另一顆 ZIP | 鈕 disabled,點不到 |

實作關鍵:每個 export 函式進入時 `const frozenSheet = sheet, frozenSelections = selections`,後續 closure 全用這兩個 ref,不再讀 `result`。

#### 測試策略

**1. `packages/core/src/frames.test.ts`(新)— vitest**

- Fixture sheet:用 `composeSelections` 對「最小 selections(只一個 body)」compose
- Cases:
  - 標準動畫 `walk`(num=4):Map 含 4 個 direction,每個有正確 frame 數
  - 單方向動畫 `hurt`(num=1):只回 `'up'` direction
  - `skipEmpty: true`(default):空白 frame 不在結果裡
  - `skipEmpty: false`:每 row 都回 13 frames
  - 未知 anim:throw
- Frame canvas 大小:64×64
- 至少 1 個 case 對 frame[0,0] 的 imageData 跟 sheet 對應座標逐 byte 比對

**2. `packages/web/src/lib/zip-export.test.ts`(新)— vitest**

注意:web 既有測試環境用 `@napi-rs/canvas` 補 canvas,沿用同一套 setup。

- 4 個 export 各做一個 smoke test(F4/F5/F6/F7)
- 用 jszip `loadAsync` 讀回產出的 ZIP,assert:
  - 含 `credits/credits.txt` 與 `credits/credits.csv`
  - F4:`standard/walk.png` 存在
  - F5:`items/050 body_<bodyType>_<variant>.png`(實際從 fixture 算)存在
  - F6:`standard/walk/<itemFileName>` 存在
  - F7:`standard/walk/down/3.png` 存在,且 entry size > 0
- 跨 fixture 不做 byte-identical 比對(像素由 composeSelections 決定)

**3. UI 沒有 unit test**(沿用既有慣例)。手動 QA on `pnpm dev`。

## 驗收條件

- [ ] `pnpm add jszip@^3.10.1` 加入 `packages/web` dependencies,並在
      註解內標注 MIT(GPL-3.0 相容)
- [ ] `DownloadPopover` 新增 4 顆 ZIP 鈕,popover 寬度 `w-72`,中間有
      `ZIP` section label + 分隔線
- [ ] F4 → `lpc_<bodyType>_animations_<timestamp>.zip`,內含
      `standard/<anim>.png` + `custom/<name>.png` + `credits/`
- [ ] F5 → `lpc_<bodyType>_item_spritesheets_<timestamp>.zip`,內含
      `items/<zPos> <name>.png` + `credits/`
- [ ] F6 → `lpc_<bodyType>_item_animations_<timestamp>.zip`,內含
      `standard/<anim>/<itemFile>` + `custom/<name>/<itemFile>` + `credits/`
- [ ] F7 → `lpc_<bodyType>_individual_frames_<timestamp>.zip`,內含
      `standard/<anim>/<dir>/<frame#>.png` + `custom/<name>/<dir>/<frame#>.png`
      + `credits/`
- [ ] timestamp 格式 `yyyy-MM-ddTHH-mm-ss`(byte-identical 上游)
- [ ] PNG / TXT / CSV(Sub-project A 三顆鈕)行為不受影響(regression)
- [ ] `sheet === null` 或 status error 時所有下載鈕 disabled
- [ ] ZIP 跑到一半時:同類 ZIP 鈕 disabled、進度條 0–100% 出現、完成
      `Saved ✓` toast、錯誤 `Download failed` toast
- [ ] 跑 ZIP 時切角色不會中斷該次 ZIP(產出舊狀態的 ZIP)
- [ ] `extractAnimationFrames` core unit test 通過(標準 + 客製、skipEmpty
      兩種模式)
- [ ] `zip-export.test.ts` 4 個 smoke test 都通過(ZIP 結構正確 + 像素非零)
- [ ] dark / light theme 都正常顯示(進度條配色、新分隔線)
- [ ] en / zh-TW i18n 都正常
- [ ] `pnpm typecheck` 通過、`pnpm test` 通過
- [ ] jszip lazy-import:Network tab 確認首次 SPA 載入**不含** jszip chunk,
      首次點 ZIP 鈕才看到 jszip chunk 載入
- [ ] customAnimations(wheelchair 等)能正確輸出到 ZIP 的 `custom/` folder
- [ ] 手動驗證 4 個 ZIP 用桌面解壓器(macOS Archive Utility / 7-zip)解得開,
      內容能在 image viewer 開啟
