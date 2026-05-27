# Web UI · Custom Upload + Z-Position(Sub-project E4)

- 日期:2026-05-27
- 範圍:`packages/web`
- 狀態:設計已核可,待寫實作計畫
- 上層 roadmap:`2026-05-26-upstream-feature-parity-roadmap.md`(Sub-project E,迷你拆分 E4 / F12)
- 比對對象:
  - `upstream/sources/components/advanced/AdvancedTools.js`
  - `upstream/sources/canvas/renderer.ts`(`customUploadedImage` / `customImageZPos`)
- 兄弟 specs:
  - E1 `2026-05-27-license-filter-ui-design.md`
  - E2 `2026-05-27-persistent-search-design.md`
  - E3 `2026-05-27-animation-filter-design.md`

## 背景與問題

上游提供 **Advanced Tools: Custom file upload + Z-Position**。使用者可上傳一張
本機圖片,設定 z-position,讓它疊在產出的 spritesheet 上。上游實作把
`customUploadedImage` 當成一個額外 layer,依 `customImageZPos` 插入 standard
animation 區域的繪製順序。

v2 目前沒有這個功能。缺口主要影響進階使用者:他們可能已有外部工具產生的
披風、特效、陰影、武器殘影或暫時性的自製 layer,想把它與 LPC character 一起
預覽與匯出。

本 spec 補齊 F12,但刻意保持第一版範圍保守:

- custom upload 是 **web-only overlay state**,不改 `packages/core` 的 selection /
  catalog model
- 只接受標準 master spritesheet 尺寸 `832x3456`
- 參與 Preview / Full Sheet / PNG / ZIP 輸出
- 不加入 upstream credits,因為檔案由使用者提供,不是來自 `upstream/CREDITS.csv`

## 目標

- `SettingsCollapsible` 增加第四個 section:`Advanced Tools`
- 支援上傳本機 image file,載入後驗證尺寸必須是 `832x3456`
- 支援設定 numeric z-position,用於決定 custom overlay 在 standard spritesheet
  layer stack 中的繪製順序
- custom overlay 影響:
  - PreviewPane single-animation preview
  - Full Spritesheet Preview
  - PNG download
  - ZIP by animation / by item / by animation+item / by frame
- custom overlay 不影響:
  - upstream attribution credits
  - URL hash
  - token import/export
  - catalog selection state
  - v1 path
- Reset All / outfit reset 清除 custom overlay;view-only reset 與 filters reset 不清除

## 非目標

- 不支援任意尺寸圖片的縮放、裁切、拖曳定位或 frame 對齊工具
- 不支援多個 custom upload layers
- 不支援 custom-animation blocks(例如 wheelchair 區域)的額外 overlay
- 不把 custom upload 寫入 `packages/core` 的 `Selections` 或 hash schema
- 不持久化到 localStorage
- 不把 user-provided file 寫入 `credits.txt` / `credits.csv`
- 不修改 `upstream/`

## 已收斂的設計決策

1. **架構位置**:採 web-only overlay adapter,不改 `packages/core`
2. **尺寸規則**:第一版嚴格要求 `832x3456`;不自動縮放
3. **輸出範圍**:custom overlay 參與 PNG 與 4 種 ZIP 匯出
4. **Attribution**:不加入 upstream credits;UI 顯示 user-provided 提示
5. **UI 擺放**:放在 `SettingsCollapsible` 內,作為 License / Animation /
   Asset Source 後的第四個 section
6. **狀態生命週期**:session-only;Reset All / outfit reset 清除;view/filter reset 不清除

## §1 Data Model

新增 web-only 型別,放在 `packages/web/src/lib/custom-overlay.ts`:

```ts
export interface CustomOverlay {
  readonly fileName: string;
  readonly objectUrl: string;
  readonly image: HTMLImageElement;
  readonly width: number;
  readonly height: number;
  readonly zPos: number;
}

export interface CustomOverlayInput {
  readonly fileName: string;
  readonly objectUrl: string;
  readonly image: HTMLImageElement;
  readonly zPos: number;
}
```

`image` 是 browser object,所以這個型別不進 `packages/core`。`objectUrl` 由 harness
管理,clear / replace / unmount 時必須 `URL.revokeObjectURL`。

尺寸常數:

```ts
export const CUSTOM_OVERLAY_WIDTH = 832;
export const CUSTOM_OVERLAY_HEIGHT = 3456;
```

這兩個值對應 standard master sheet,也就是 `SHEET_WIDTH` / `SHEET_HEIGHT`。spec
使用固定數字讓 UI 驗證訊息清楚;實作需從 core 常數引用以避免漂移。

## §2 UI

`SettingsCollapsible` 新增 `Advanced Tools` section,位於 Asset Source 後方。

內容:

- file input:`accept="image/*"`
- 已載入狀態:顯示 `fileName` 與尺寸,例如 `cape.png · 832x3456`
- z-position numeric input:
  - 預設 `0`,對齊上游 `customImageZPos`
  - 空值或非數字輸入時回到 `0`
  - 不做 min/max clamp;上游允許任意 number
- Clear button:清除 image,重設 z-position 到 `0`,並清空 file input
- helper text:
  - accepted size:`832x3456`
  - layer hints:`0=shadow, 10=body, 70=arms, 110=beard`
  - attribution note:user-provided image is included in image exports but not upstream credits

新增 i18n keys:

```ts
'advancedTools.title': 'Advanced Tools',
'advancedTools.customUpload': 'Custom spritesheet image',
'advancedTools.acceptedSize': 'Accepted size: 832x3456',
'advancedTools.zPosition': 'Z-position',
'advancedTools.layerHints': 'Layer order: 0=shadow, 10=body, 70=arms, 110=beard',
'advancedTools.clear': 'Clear Custom Image',
'advancedTools.userProvidedNotice': 'User-provided image is included in image exports but not upstream credits.',
'advancedTools.invalidSize': 'Custom image must be 832x3456; got {width}x{height}.',
'advancedTools.loaded': 'Loaded custom image: {name}',
'advancedTools.cleared': 'Cleared custom image',
```

zh-TW 對應:

```ts
'advancedTools.title': '進階工具',
'advancedTools.customUpload': '自訂 spritesheet 圖片',
'advancedTools.acceptedSize': '接受尺寸:832x3456',
'advancedTools.zPosition': 'Z 位置',
'advancedTools.layerHints': '圖層順序:0=陰影,10=身體,70=手臂,110=鬍鬚',
'advancedTools.clear': '清除自訂圖片',
'advancedTools.userProvidedNotice': '使用者提供的圖片會包含在圖片匯出中,但不會加入上游 credits。',
'advancedTools.invalidSize': '自訂圖片必須是 832x3456;目前為 {width}x{height}。',
'advancedTools.loaded': '已載入自訂圖片:{name}',
'advancedTools.cleared': '已清除自訂圖片',
```

## §3 Composition Semantics

custom overlay 對 standard spritesheet 區域生效。第一版不處理 custom-animation blocks。

核心語意:

1. 先照既有 `composeSelections` 合成 normal sheet
2. 若沒有 custom overlay,直接回傳 normal sheet
3. 若有 custom overlay,建立與 normal sheet 同尺寸的新 canvas
4. 以 z-position sort:
   - normal layers 依 core 原本的 zPos 排序
   - custom overlay 作為一個額外 layer,`zPos = customOverlay.zPos`
5. 畫出 overlayed sheet,再交給 `extractAnimation` / Full Sheet / download / ZIP 使用

實作時不要反解已經合成完成的 bitmap 來猜 layer order。需要保留「原本 core
composition 排序 + custom layer」語意,新增 web helper:

```ts
export async function composeSelectionsWithCustomOverlay(args: {
  readonly selections: Selections;
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly adapter: BrowserCanvasAdapter;
  readonly assetSource: AssetSource;
  readonly customOverlay: CustomOverlay | null;
  readonly onProgress?: (loaded: number, total: number) => void;
}): Promise<ComposedSheet>;
```

這個 helper 先呼叫 core `composeSelections` 取得 attribution、custom animation
metadata 與一般 sheet,再用 web-only standard-layer renderer 重畫 standard 區域以
插入 custom overlay。standard-layer renderer 使用既有 catalog / selection /
palette resolve 規則,並以與 core 相同的 z-position stable sort 繪製。此 renderer
只處理 standard spritesheet 區域;custom-animation blocks 沿用 core `composeSelections`
產物,不套用 custom overlay。

`packages/core` 不新增 browser-specific API。若實作需要共用更細的 layer resolution,
只能抽出 environment-agnostic helper,且不得引入 `File` / `HTMLImageElement` /
`window` / `document`。

### §3.1 Standard Animation Placement

上傳圖片必須已是完整 `832x3456` master sheet。因此 custom overlay 的 standard
區域可直接以 `(0, 0)` 畫到 output canvas。它不是單張 frame,也不是單個 animation
row。這降低第一版風險,也讓 by animation / by frame ZIP 可沿用現有 crop 邏輯。

### §3.2 Custom Animation Blocks

若目前 outfit 包含 wheelchair / tool rod 等 custom animation block,custom overlay
不畫到那些額外 block。理由:

- 上傳圖只被驗證為 standard master sheet 尺寸,沒有 custom block 區域
- custom block 的尺寸與位置依選取素材動態產生
- 自動把 standard frames 投影到 custom block 需要更多 mapping UI,超出 E4 第一版

這一點需在 spec / UI help text 中保持清楚:custom upload overlays the standard
spritesheet only.

## §4 Hook / State Flow

`LayerStackHarness` owns:

```ts
const [customOverlay, setCustomOverlay] = useState<CustomOverlay | null>(null);
const [customOverlayZPos, setCustomOverlayZPos] = useState(0);
```

行為:

- upload success:set overlay + zPos,show info toast
- invalid size:revoke object URL,do not change existing overlay,show error toast
- z-position change:update state and trigger recomposition
- clear:revoke object URL,set overlay null,set zPos 0,show info toast
- unmount:revoke current object URL

`useComposedCharacter` signature extends with `customOverlay` or a small
`CustomOverlayState`. The memo key must include overlay identity and z-position,so changing
z-position recomposes the sheet. Animation change remains cheap extraction off the current sheet.

URL hash sync ignores custom overlay. If a user shares a URL,recipient gets the catalog outfit only,
not the local file. This is intentional because browsers cannot serialize local files into hash.

## §5 Export Behavior

### §5.1 PNG

Existing PNG download uses `composeResult.sheet`. Once hook result includes the overlayed sheet,
PNG automatically includes custom overlay.

### §5.2 Credits TXT / CSV

Credits remain derived only from selected catalog items and `upstream/CREDITS.csv` metadata.
Custom upload is not included in TXT / CSV. UI copy states this explicitly.

Rationale:the user-provided file has unknown license and authorship. Adding fake upstream credit
metadata would violate the attribution model more than omitting it. The user remains responsible
for their own custom image rights.

### §5.3 ZIP by Animation(F4)

Each animation PNG is extracted from the overlayed sheet,so custom pixels are included in
`standard/<anim>.png`. Custom upload does not create a separate `custom/` block entry.

### §5.4 ZIP by Item(F5)

ZIP by item must include one extra item entry for the custom upload:

```txt
items/<zPos-padded> custom-upload_<safe-file-name>.png
```

The image content is the original uploaded `832x3456` sheet. This mirrors the mental model that
custom upload is a separate layer.

### §5.5 ZIP by Animation + Item(F6)

For each standard animation,include custom upload as an additional item PNG cropped from the
uploaded sheet:

```txt
standard/<anim>/<zPos-padded> custom-upload_<safe-file-name>.png
```

Custom-animation folders do not receive custom upload entries.

### §5.6 ZIP by Frame(F7)

Frame PNGs are extracted from the overlayed sheet,so custom pixels are included automatically in
the final frame images. No separate custom file entries are needed.

## §6 Reset Semantics

Reset menu currently exposes outfit / view / filters scopes.

- outfit reset:clear custom overlay and z-position,then select defaults
- view reset:do not clear custom overlay
- filters reset:do not clear custom overlay
- Reset All(outfit + view + filters):clear custom overlay through outfit scope

Reasoning:custom upload changes the rendered outfit output,not merely the camera/view or filter
state. This mirrors upstream `resetAll()`,which clears `customUploadedImage` and
`customImageZPos`.

## §7 Error Handling

| Case | Behavior |
|---|---|
| User cancels file picker | No state change |
| File cannot be decoded as image | Revoke object URL,show error toast |
| Image dimensions are not `832x3456` | Revoke object URL,keep previous overlay,show `advancedTools.invalidSize` |
| User uploads a valid new file while one exists | Revoke previous object URL,replace overlay |
| Recomposition fails after upload | Existing compose error path handles it; overlay state remains so user can clear |

No alert dialogs. Use existing status toast.

## §8 Test Plan

Unit tests:

- `validateCustomOverlayImageSize(832, 3456)` accepts
- invalid width / invalid height reject with exact dimensions
- `customOverlayItemFileName({ zPos: 70, fileName: 'cape test.png' })`
  returns padded zPos + safe name
- z-position parser maps empty / non-number to `0`

Integration-style web tests:

- If `useComposedCharacter` is hard to isolate, test `composeSelectionsWithCustomOverlay`
  directly with a browser-canvas adapter test double
- z-position changes produce a different overlayed sheet when the uploaded pixels overlap
  an existing layer
- overlayed sheet includes custom pixels in a known frame crop
- clearing overlay returns output to baseline

ZIP tests:

- F4 output includes custom pixels through overlayed animation PNG
- F5 includes one `custom-upload` item file
- F6 includes one `custom-upload` item file per standard animation
- F7 frame output includes custom pixels
- credits files do not mention `custom-upload` or uploaded filename

Manual smoke:

1. Open Settings -> Advanced Tools
2. Upload valid `832x3456` transparent PNG with a visible mark; preview updates
3. Change z-position below/above body; layer order changes
4. Upload invalid size; previous valid overlay remains and toast reports dimensions
5. Download PNG; custom mark is present
6. Download all 4 ZIP modes; expected custom pixels/files are present
7. Download credits TXT/CSV; uploaded filename is absent
8. Reset view only; overlay remains
9. Reset all; overlay clears

## 驗收

- [ ] Settings 內出現 Advanced Tools section
- [ ] 只接受 `832x3456` image;invalid size 不改變目前 overlay
- [ ] custom overlay 依 z-position 參與 Preview / Full Sheet / PNG
- [ ] custom overlay 參與 4 種 ZIP 匯出,且 F5/F6 有可辨識的 custom-upload item
- [ ] credits TXT/CSV 不包含 user-provided file
- [ ] Reset All / outfit reset 清除 overlay;view/filter reset 不清除
- [ ] URL hash / token 不包含 custom upload state
- [ ] `packages/core` 不直接引用 browser `File` / `HTMLImageElement` / `window` / `document`
