# Web UI · Layer Stack v2 Polish 對齊(Spec 2)

- 日期:2026-05-25
- 範圍:`packages/web`
- 狀態:設計已核可,待寫實作計畫
- 參考檔:`reference/v2/LPC-Toolkit-LayerStack.html`(內嵌沙盒,主標
  「Direction B · Layer Stack」)
- 前置 specs:
  - `2026-05-24-web-ui-layer-stack-v2-design.md`(v2 第一階段)
  - `2026-05-25-layer-stack-v2-core-features-design.md`(Spec 1,核心功能)

## 背景與問題

把 `reference/v2` 設計稿跟現有 v2 實作交叉比對之後,共找到 12 項設計差異:
3 項核心功能落到 Spec 1,其餘 9 項屬於 cosmetic / polish,落到本 spec。

這 9 項多半是「直接照 reference 對齊」的小幅修改,但其中 4 項牽涉設計
決策已先做核可,避免實作時反覆:

1. Frame counter 實作 — 重構 `useAnimationPlayer` 暴露 frame state。
2. Randomize 行為 — Feeling Lucky 完整 outfit(不只重 roll 已啟用 layers)。
3. Logo 處理 — 文字 wordmark `LPC·Toolkit`,不引入 SVG asset。
4. Preview 獨立 Reset — **不做**(與 top bar ResetMenu 重疊)。

## 目標

把 v2 web UI 跟 `reference/v2` 設計稿在 cosmetic 層面對齊到「視覺上無
明顯落差」。具體 8 項:

- #5  Loading 進度搬到 top bar(從 preview pane 移除)
- #6  LayerRow 行內 color ramp swatch 預覽
- #7  Preview 畫布左上 chrome readout(`{anim · dir · zoom × · f01}`)
- #8  Preview frame counter `f01/06 · 8fps`(底部 bar)
- #9  Preview zoom preset 鈕(1×/2×/4×/8×,取代 +/-)
- #10 Preview Randomize(Feeling Lucky 完整 outfit)
- #11 Top bar Logo wordmark(`LPC·Toolkit` + subtitle)
- #13 SettingsCollapsible 收合態 license filter 徽章

## 非目標(YAGNI)

- #12 Preview 獨立 Reset 鈕 — 已決定不做。
- Loading 進度條(視覺進度條 vs 純文字百分比 — 維持文字)。
- Randomize 機率可調 / 排除 categories。
- Logo 視覺 SVG / 動畫。
- Color ramp swatch 點擊互動(只顯示,不點)。
- 鍵盤快捷鍵(R 鍵 randomize 等)。
- 改動 `packages/core/`。
- 移除 v1。

## 已核可的設計決策

1. Frame counter 來源:重構 `useAnimationPlayer` 回傳 `{ currentFrame,
   totalFrames }`,8fps setState。預期 re-render 衝擊小(只影響顯示
   readout 那一塊)。
2. Randomize:Feeling Lucky 完整 outfit。必選 categories 必選一個、可選
   categories 依機率挑。
3. Logo:純文字 wordmark + subtitle,不引入 asset。
4. #12 不做:top bar ResetMenu 已涵蓋 view scope reset,Preview bar 再加
   一顆是重複 affordance。

## 架構

### 共享改動(影響 ≥ 2 項)

1. **`hooks/use-animation-player.ts` 重構** — 服務 #7、#8
   - 從「fire-and-forget」改成回傳 `{ currentFrame, totalFrames, fps }`
   - 內部仍走 RAF + 8fps 推進,加 `setState` 同步 frame 數
   - 既有 PreviewPane 呼叫端要接住回傳值
2. **`slice/random-outfit.ts`(新)** — 服務 #10
   - `pickRandomOutfit(catalog, bodyType, rng?): Selections`
   - Pure function、seedable for tests
3. **`i18n.ts` 增 keys** — 多項共用

### 目錄差異

```
packages/web/src/
├── hooks/
│  └── use-animation-player.ts        // REFACTOR: 暴露 frame state
├── slice/
│  └── random-outfit.ts                // NEW
├── components/
│  └── layer-stack/
│     ├── top-bar.tsx                  // MODIFY: + Logo wordmark + Loading
│     ├── harness.tsx                  // MODIFY: 提升 loading status 到頂
│     ├── preview-pane.tsx             // MODIFY: chrome readout / frame counter
│     │                                //         / zoom presets / randomize
│     │                                //         / 拿掉 loading
│     ├── layer-row.tsx                // MODIFY: 副標題 color ramp swatch
│     └── settings-collapsible.tsx     // MODIFY: 收合態 filter badge
└── i18n.ts                             // MODIFY: 新 keys
```

## 各項目細節

### #5 Loading 搬到 top bar

- 在 `harness.tsx` 把 `useComposedCharacter` 結果的 `status` / `progress`
  提升到 LayerStackHarness 層(目前在 PreviewPane 內),傳給 TopBar
- `top-bar.tsx` 新 prop `loadingProgress: number | null`(null = 已 ready)
- 在 wordmark 區後、children 區前插入:
  ```tsx
  {loadingProgress != null && loadingProgress < 1 && (
    <span className="font-mono text-[10px] text-text-dim inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
      {t('status.loading')} {Math.round(loadingProgress * 100)}%
    </span>
  )}
  ```
- `preview-pane.tsx:91-96` 刪掉現有 loading 段,改顯示 zoom value
- i18n:`status.loading` 已存在(Spec 1 也用),直接複用

### #6 LayerRow 行內 color ramp swatch

- `layer-row.tsx:44-47` 副標題擴充:
  ```tsx
  <div className="text-[10px] uppercase tracking-wide text-text-mute
                  flex gap-1 items-center">
    {tl.category(typeName)}
    {selection.variant && <><span>·</span><span>{selection.variant}</span></>}
    {selection.recolor && (
      <>
        <span>·</span>
        <span className="inline-flex gap-px">
          {getSwatchesForRecolor(palettes, item.palette, selection.recolor)
            .map((c, i) => (
              <span key={i} style={{ background: c }}
                    className="h-1 w-1 rounded-sm" />
            ))}
        </span>
      </>
    )}
  </div>
  ```
- `getSwatchesForRecolor` 從 `palettes` + item.palette + recolor 取色
  (可能直接 inline 用現有的 PaletteMetadata getter)
- 只顯示,不互動

### #7 Preview 畫布左上 chrome readout

- `preview-pane.tsx` canvas 容器內加 absolute 定位的 readout chip:
  ```tsx
  <div className="absolute top-3 left-3 font-mono text-[10px] text-text-2
                  px-2 py-0.5 bg-black/40 backdrop-blur-md rounded">
    {state.anim} · {DIR_SHORT[state.dir]} · {state.zoom}× ·
    f{String(currentFrame + 1).padStart(2, '0')}
  </div>
  ```
- `DIR_SHORT: Record<Direction, 'N'|'S'|'E'|'W'>`(up→N 等等)
- `currentFrame` 來自重構後的 `useAnimationPlayer` 回傳值

### #8 Preview frame counter(底部 bar)

- `preview-pane.tsx` 底部 bar 加:
  ```tsx
  <span className="font-mono text-[10px] text-text-mute">
    f{String(currentFrame + 1).padStart(2, '0')}/
    {String(totalFrames).padStart(2, '0')} · {fps}fps
  </span>
  ```
- 三個值(currentFrame、totalFrames、fps)全從 `useAnimationPlayer` 拿
- 取代現有 `zoom 2×` 顯示(zoom 已搬去 chrome readout)

### #9 Preview zoom presets

- 取代 `preview-pane.tsx:50-62` 的 +/- 按鈕跟百分比顯示
- 4 顆 preset 按鈕 row(位置不變,canvas 右上角):
  ```tsx
  <div className="absolute top-3 right-3 flex gap-1 bg-black/40
                  backdrop-blur-md rounded p-0.5">
    {[1, 2, 4, 8].map(z => (
      <button key={z}
        onClick={() => dispatch({ type: 'set_zoom', zoom: z })}
        className={[
          'px-1.5 py-0.5 font-mono text-[10px] rounded',
          state.zoom === z
            ? 'bg-accent text-accent-ink'
            : 'text-text-2 hover:bg-white/10',
        ].join(' ')}>
        {z}×
      </button>
    ))}
  </div>
  ```
- `Cmd/Ctrl+wheel` zoom 行為(`:31-42`)維持不變
- 注意:set_zoom 直接吃任意值,不限定 preset(wheel zoom 仍可中間值)

### #10 Preview Randomize(Feeling Lucky)

- 新 util `slice/random-outfit.ts`:
  ```ts
  export interface PickRandomOptions {
    catalog: Catalog;
    bodyType: BodyType;
    rng?: () => number;            // 預設 Math.random,測試可 seed
    optionalProb?: number;         // 預設 0.5
  }
  export function pickRandomOutfit(opts: PickRandomOptions): Selections;
  ```
  - 必選 categories(以 `CATEGORY_GROUPS['body']` 為起點,可能還需 head)
    永遠挑一個 body-type 相容的 item
  - 其他 categories 依 `optionalProb` 決定是否加;加的話從 compatible
    items 隨機挑
  - 回傳 `Selections`(bodyType + items map)
- `preview-pane.tsx` 底部 bar 加 ghost 按鈕:
  ```tsx
  <Button size="sm" variant="ghost"
    title={t('randomize.title')}
    onClick={() => dispatch({
      type: 'apply_selections',
      selections: pickRandomOutfit({ catalog, bodyType: state.bodyType }),
    })}>
    🎲
  </Button>
  ```
  (icon 用 emoji 或 unicode,沿用 reference 字符 pattern)
- 需把 `catalog` 從 harness 傳到 preview-pane(已有)
- i18n:`randomize.title` 新增,en `Randomize outfit`,zh-TW `隨機生成`

### #11 Top bar Logo wordmark

- `top-bar.tsx` children 前加:
  ```tsx
  <div className="flex flex-col leading-none mr-1">
    <span className="text-[13px] font-bold tracking-tight">
      LPC<span className="text-text-mute font-medium">·Toolkit</span>
    </span>
    <span className="font-mono text-[9px] text-text-dim">
      {t('app.subtitle')}
    </span>
  </div>
  ```
- i18n:`app.subtitle` 新增,en `sprite composer`,zh-TW `角色合成器`

### #13 SettingsCollapsible filter badge

- `settings-collapsible.tsx:22-29` 收合 button 右側加:
  ```tsx
  <button ...>
    <span>{t('filters.title')}</span>
    {licenseFilter && (
      <span className="ml-auto rounded-full border border-accent/40
                       bg-accent/15 px-2 py-0.5 text-[9px] text-accent">
        ≤ {licenseFilter}
      </span>
    )}
    <span className={licenseFilter ? '' : 'ml-auto'}>{open ? '▾' : '▸'}</span>
  </button>
  ```
- 注意:有 badge 時,`ml-auto` 移到 badge 上;沒 badge 時保留在箭頭上

## i18n keys 一覽

| key | en | zh-TW | 用於 |
|---|---|---|---|
| `status.loading` | Loading | 載入中 | #5(若 Spec 1 已加,複用) |
| `randomize.title` | Randomize outfit | 隨機生成 | #10 |
| `app.subtitle` | sprite composer | 角色合成器 | #11 |
| `zoom.preset` | Zoom {n}× | 縮放 {n}× | #9 tooltip(optional) |

(以上文案可 PR review 時微調。)

## 測試策略

沿用現有 vitest pattern(pure logic only,不寫 React 元件渲染測試)。

新測試:
- `test/random-outfit.test.ts` — `pickRandomOutfit`:
  - body-type compatibility 永遠滿足
  - 必選 categories 永遠在
  - 可選 categories 依 rng 決定加入(seeded test 驗證)
  - 同 seed 同結果
- `test/use-animation-player.test.ts`(若還沒有,補)— frame 推進、
  playing=false 時固定 frame 0、cycle 邊界(cycle.length 滿時 wrap)

不寫:
- preview-pane / top-bar / layer-row / settings-collapsible 元件渲染測試
- Loading 提升的 React state 行為(整合測試已涵蓋)

## Data flow

### Loading 提升(#5)
- `harness.tsx` 多持有 composed result 的 `status` / `progress`(從 PreviewPane
  抽出,或讓 PreviewPane 透過 callback 回報)
- TopBar 接 loadingProgress prop,顯示 spinner + 百分比
- 已 ready 時 prop 為 null,top bar 段落不渲染

### Randomize flow(#10)
- 點 🎲 → `pickRandomOutfit({ catalog, bodyType })` → `Selections`
- dispatch `{type:'apply_selections', selections}` → reducer 取代整個
  `state.selections` + `state.bodyType`
- 新狀態觸發 `useComposedCharacter` re-compose(透過現有 key 機制)
- Loading 進度顯示(#5 已搬到 top bar)

### Frame counter flow(#7、#8)
- `useAnimationPlayer` 內部 RAF loop 推進 frame 時呼叫 `setCurrentFrame`
- React re-render 影響:只有持有 useAnimationPlayer 回傳值的元件(PreviewPane)
- canvas 繪製不走 React,效能不變

## 錯誤處理

| 情境 | 處理 |
|---|---|
| `pickRandomOutfit` 某 category 無 compatible item | 略過該 category(不加入 selections) |
| Loading status === 'error' | TopBar 不顯示 loading 段;沿用現有 preview error 處理 |
| `useAnimationPlayer` animation = null | currentFrame = 0,totalFrames = 0,readout 顯示 `—` |

## Open questions(實作時定)

1. **必選 vs 可選 categories** — 預計依 `CATEGORY_GROUPS.body` = 必選,
   其餘可選;實作時對齊 catalog-tree.ts(可能需要更細分,例如 hair 不
   是必選但通常想要)
2. **Randomize 機率** — 初版可選 0.5,實際手感 PR review 時調
3. **frame 8fps re-render 效能** — 若 React DevTools profiler 顯示 jank,
   改用 ref + 直接寫 DOM(只更新 readout text)
4. **i18n 文案** — spec 列初稿,實作 PR 可改

## Out of scope(明確排除)

- #12 Preview 獨立 Reset 鈕
- Loading 進度條(維持文字百分比)
- Randomize 可調機率 / category 排除
- Logo SVG / 動畫
- Color ramp swatch 互動
- 鍵盤快捷鍵
- 移除 v1

## 後續

Spec 通過 → 寫 `2026-05-25-layer-stack-v2-polish-plan.md` 實作計畫 →
依計畫分次 PR 落地。

Spec 1 與本 spec 為**獨立 plan**,可平行執行(各自 PR),但建議:
- Spec 1 先(因為 thumbnail 新元件可能影響 LayerRow color ramp swatch
  的渲染容器)
- Spec 2 #6(color ramp swatch)等 Spec 1 落地後再做
- Spec 2 其他項目(#5/#7/#8/#9/#10/#11/#13)與 Spec 1 無依賴,可平行
