# Web UI · URL Hash Sync(Sub-project B)

- 日期:2026-05-26
- 範圍:`packages/web`
- 狀態:設計已核可,待寫實作計畫
- 上層 roadmap:`2026-05-26-upstream-feature-parity-roadmap.md`(Sub-project B)
- 涵蓋功能缺口:F13(URL hash 同步 / 可分享連結)

## 背景與問題

v2 web UI 目前**沒有 URL 狀態同步**:使用者組好角色後,要分享給別人
得先打開 TokenPopover、複製 base64 token、傳給對方、對方再貼進
TokenPopover 才能還原。流程麻煩,且失去網頁應用最自然的分享形式
——「複製網址列」。

上游官方工具的做法是把 selections 即時序列化到 `window.location.hash`
(格式如 `#sex=male&body=Body_color_light&head=Heads_human_male_light`)。
這份 hash 可讀、可手改、且只要存進連結就能在任何瀏覽器還原。

本 spec 把這項補回 v2,且與上游 hash 格式相容——別人從上游官方工具分享
的連結,直接在我們 v2 也能開。

## 目標

- 任何時刻網址列的 hash 都對應當前角色狀態(`bodyType` + `selections`)
- URL 含 hash → 首次 render 就是 hash 對應的角色,不閃過預設
- 改 selection → hash 自動更新(`history.pushState`,可用瀏覽器上一頁
  回到先前角色)
- 瀏覽器 back / forward / 手改 URL → 角色跟著變(監聽 `hashchange`)
- 與上游 hash 格式 byte-compatible(雙向):從上游分享的連結可直接打
  開;我們產生的 hash 貼回上游官方工具也能讀
- TokenPopover 多一顆「Copy share link」按鈕,複製含 hash 的完整 URL
- 不能解析的 hash 項目(unknown_type_name / unknown_item)跳過,在 status
  bar 顯示提示

## 非目標(YAGNI)

- 不用 base64 token 當 URL hash 格式(roadmap 原本決策 #2 的 deviation,
  見「設計決策」)
- 不刪 TokenPopover(進階使用者仍可用 token 形式)
- 不引入 routing library(react-router 等)
- 不對 hash 寫入做 debounce(每次 state 變化即寫,瀏覽器 API 夠快)
- 不寫 history 壓縮 / 上限管理
- 不做跨 tab 同步(BroadcastChannel)
- 不動 `packages/core/`(core 已有 `serializeHash`/`parseHash`,直接用)
- 不動 v1 路徑(`?v=1` 走 SliceHarness,維持現狀不接 hash sync)

## 設計

### 元件與模組

```
packages/core(不動)
└─ serializeHash(selections): string
└─ parseHash(raw, catalog, palettes?): { selections, warnings, unknownKeys }

packages/web/src/lib/url-hash-sync.ts  ← 新增
├─ readWindowHash(): string                            讀 window.location.hash(去 #)
├─ bootstrapStateFromHash({                            純函式,無 side effect
│     catalog, palettes, defaults,
│  }): { state, warnings }
└─ useUrlHashSync({ state, dispatch, catalog,         hook
       palettes, t, onStatus }): void

packages/web/src/App.tsx                ← 修改
└─ useMemo `init` 內計算 bootstrapStateFromHash,連同 warnings 一起回傳
└─ useReducer 用 init.state
└─ mount 時 useEffect:若 init.warnings 非空,呼叫 onStatus 提示
└─ LayerStackHarness 內呼叫 useUrlHashSync(...)

packages/web/src/components/layer-stack/popovers/token-popover.tsx  ← 修改
└─ 多一顆「Copy share link」按鈕

packages/web/src/i18n.ts               ← 修改
└─ 新增 token.copyLink、hashSync.* keys
```

### 資料流

#### 初始載入

```
mount
  ↓
loadCatalogFromUpstream() + loadPalettesFromUpstream()
  ↓
defaults = pickInitialSelections(catalog)         ← 既有
  ↓
bootstrapStateFromHash({ catalog, palettes, defaults: defaults.state }):
  raw = readWindowHash()
  if raw 為空:
    → return { state: defaults.state, warnings: [] }
  else:
    parsed = parseHash(raw, catalog, palettes)
    if Object.keys(parsed.selections.items).length === 0:
      → return { state: defaults.state, warnings: parsed.warnings }
    else:
      → return {
          state: {
            ...defaults.state,                    ← 沿用 anim/dir/zoom/playing
            bodyType: parsed.selections.bodyType,
            selections: parsed.selections.items,
          },
          warnings: parsed.warnings,
        }
  ↓
App.tsx 把上述結果合進 init useMemo
  ↓
useReducer(sliceReducer, init.state)
  ↓
mount useEffect(once):
  if init.warnings.length > 0:
    onStatus(t('hashSync.skipped').replace('{n}', String(init.warnings.length)))
  ↓
首次 render(state 已是 hash 對應狀態,不會閃過預設)
  ↓
useUrlHashSync 內 useEffect [bodyType, selections]:
  next = serializeHash(toSelections(state))
  curr = readWindowHash()
  if next === curr: return
  if isFirstWrite.current:                        ← bootstrap 後第一次寫
    history.replaceState(null, '', '#' + next)   ← URL 正規化,不佔 history
    isFirstWrite.current = false
  else:
    history.pushState(null, '', '#' + next)       ← 使用者動作,可 back
```

註:`shownTypeNames` 永遠由 `pickInitialSelections` 決定(它取決於
catalog 內有哪些 type,跟 user selection 無關),不必序列化進 hash。

註:`anim` / `dir` / `zoom` / `playing` 是 view state,不寫進 hash
(與上游一致;這些是當前 session 的偏好,跨人分享意義不大)。

#### 改 selection 之後

```
dispatch({ type: 'pick' | 'clear' | 'set_body_type' | 'apply_selections' | ... })
  ↓
state 更新 → useEffect 觸發
  ↓
serializeHash → 與 readWindowHash() 比較
  ↓
不同 → history.pushState(null, '', '#' + next)
  ↓
pushState 不會觸發 hashchange(規範保證)→ 無迴圈
```

#### 瀏覽器 back / forward / 手改網址

```
hashchange event(瀏覽器 fire)
  ↓
handler(stateRef.current 拿最新 state):
  raw = readWindowHash()
  expected = serializeHash(toSelections(stateRef.current))
  if raw === expected: return                ← guard
  parsed = parseHash(raw, catalog, palettes)
  dispatch({
    type: 'apply_selections',
    selections: parsed.selections,
  })
  if parsed.warnings.length > 0:
    onStatus(t('hashSync.skipped').replace('{n}', String(parsed.warnings.length)))
  ↓
state 更新 → useEffect [selections, bodyType]:
  serializeHash(state) === readWindowHash() → 跳過 pushState ✓
```

不變式:**穩態時 `serializeHash(toSelections(state)) === readWindowHash()`**。
guard 與「無迴圈」皆建立在此。

### Stale closure 處理

hashchange handler 註冊一次、跨多次 render 存在,直接 capture 的 state
會過時。Hook 內用 ref 持有最新 state:

```ts
const stateRef = useRef(state);
useEffect(() => {
  stateRef.current = state;
}, [state]);

useEffect(() => {
  const handler = () => {
    const raw = readWindowHash();
    const expected = serializeHash(toSelections(stateRef.current));
    if (raw === expected) return;
    const parsed = parseHash(raw, catalog, palettes);
    dispatch({ type: 'apply_selections', selections: parsed.selections });
    if (parsed.warnings.length > 0) {
      onStatus(t('hashSync.skipped').replace('{n}', String(parsed.warnings.length)));
    }
  };
  window.addEventListener('hashchange', handler);
  return () => window.removeEventListener('hashchange', handler);
}, [catalog, palettes, dispatch, onStatus, t]);
```

(`{n}` 插值沿用既有 `preset.skipPreview` 的 `replace('{n}', ...)`
pattern,不引進新的 i18n abstraction。)

### TokenPopover 變更

在現有 `Copy / Paste` 兩顆鍵之間 / 之後加一顆 `Copy share link`:

```tsx
<Button
  size="sm"
  onClick={async () => {
    const hash = serializeHash(toSelections(state));
    const url = `${window.location.origin}${window.location.pathname}#${hash}`;
    await navigator.clipboard.writeText(url);
    onStatus(`${t('token.copyLink')} ✓`);
  }}
>
  {t('token.copyLink')}
</Button>
```

Layout 細節留給實作;原則:不破壞既有 Copy / Paste 排版。

### 邊界 case

| 狀況 | 行為 |
|---|---|
| URL 沒有 hash(或只有 `#`) | 載入 defaults;首個 useEffect 用 `replaceState` 把 defaults 對應的 hash 補上(URL 正規化,不入 history)|
| Hash 全部項目都 unknown | 落到 defaults;status bar 顯示「忽略 N 個未知項目」;首個 useEffect 用 `replaceState` 把 hash 正規化成 defaults 形式 |
| Hash 部分 unknown | 已知部分照常載入,未知部分跳過,status bar 顯示計數 |
| Hash 是舊版 token(`v1.xxx`) | `parseHash` 嘗試 `decodeURIComponent` → 多半解不出有效 key=value,當作全 unknown,落到 defaults 並提示 |
| `decodeURIComponent` 失敗 | core 內已 `try/catch`,該 pair 跳過,不影響其他 |
| Catalog 尚未載入時讀 hash | 不可能 — bootstrap 在 `loadCatalogFromUpstream()` 之後執行 |
| 寫入時 `serializeHash` 空字串 | 不可能 — bodyType 永遠有值,至少有 `sex=male`;guard 仍照常比較 |
| `dispatch` 來自 hashchange 觸發後再 dispatch | useEffect 寫入 guard 會發現 serialize 結果 === 現有 hash,跳過 pushState |

### Push vs replace

- **第一次同步寫**(bootstrap 後 useEffect 首跑):`replaceState`。這是
  URL 正規化(把空 hash / 含 unknown 項的 hash 改成 canonical 形式),
  不該佔 history entry。
  - 副效益:back 不會把使用者帶到「無 hash」URL,避免 hashchange handler
    把 selections 清空成空角色的怪 UX。
- **使用者主動觸發的 state 變化**:`pushState`。可用 back 回到先前角色。
- 同一 selection 重複點(同 state)→ guard 比較字串相等,不寫,不會多
  新增 history entry。

### URL 結構

- 永遠用 fragment(`#...`),不動 path / query string
- query string `?v=1` 仍走 SliceHarness;LayerStackHarness 是接收 hash
  sync 的對象。`?v=1` 路徑此 spec 不接 hash sync
- hash 內容遵循上游格式:`sex=<bodyType>&<typeName>=<name>[_<variant>][|<recolor>]`
  (`serializeHash` 已實作)

## 已核可的設計決策

1. **格式選擇:** 用 `serializeHash` 產生的原始 query 字串,**不**用
   `encodeSelectionToken` 的 base64 token。原因:
   - 與上游官方工具 URL 雙向相容
   - 可讀、可手改、可在 issue / changelog 直接複製貼上
   - core 已實作,無新風險
   - Roadmap 原本決策 #2 寫「沿用 token」,本 spec 推翻——選 token 的理由
     是「避免重造輪子」,但 serializeHash 同樣是已實作的輪子,且多帶
     上游相容性
2. **寫入時機:** 每次 selections / bodyType 變化都同步,不 debounce
3. **初始載入:** URL 有 hash 完全取代預設;hash 全 unknown 或為空則
   載入預設並把預設 hash 寫上去
4. **History 模型:** bootstrap 後首次同步寫用 `replaceState`(URL 正
   規化,不入 history);後續 state 變化用 `pushState`(可 back)
5. **TokenPopover:** 保留,新增「Copy share link」按鈕(不取代)
6. **Unknown 處理:** parseHash 返回 warnings 時,已知部分照常載入,
   未知部分跳過,status bar 顯示計數
7. **觀察事件:** `hashchange`(瀏覽器 back/forward + 手改網址都會觸發);
   不額外監聽 `popstate`
8. **Stale closure:** hashchange handler 用 ref 讀最新 state
9. **Hook 邊界:** sync 邏輯只裝在 LayerStackHarness(`?v=1` SliceHarness
   不掛)
10. **`shownTypeNames` 與 view state 不入 hash:** `shownTypeNames` 由
    catalog 推導;`anim`/`dir`/`zoom`/`playing` 是 session 偏好

## i18n keys(新增)

```
en:
  token.copyLink       = "Copy share link"
  hashSync.skipped     = "Ignored {n} unknown item(s) from URL"

zh-TW:
  token.copyLink       = "複製分享連結"
  hashSync.skipped     = "URL 中有 {n} 個未知項目被略過"
```

## 測試計畫

### 單元測試

新增 `packages/web/test/url-hash-sync.test.ts`,涵蓋:

**`bootstrapStateFromHash`:**
- 空 hash → state === defaults, warnings === []
- 有效 hash 全部解出 → state.selections 對應 parsed,bodyType 對應
- 全 unknown → state === defaults, warnings 非空
- 部分 unknown → state 含可解部分, warnings 含跳過項
- 舊 token 字串(`v1.xxx`) → state === defaults, warnings 含 malformed
  或 unknown(取決於 decode 路徑)

**`useUrlHashSync`(用 jsdom + `@testing-library/react` `renderHook`):**
- mount 後 URL hash 與 state serialize 一致 → 不呼叫 `pushState` / `replaceState`
- mount 後 URL hash 為空 → 第一次同步用 `replaceState`(**不**是 pushState)
- state 改變(模擬一次 dispatch 後 re-render) → `pushState` 被呼叫,
  傳入 `'#' + serializeHash`
- 連續兩次 re-render 給相同 selection → pushState 呼叫次數不增加
- 觸發 `hashchange` 事件 → `dispatch({ type: 'apply_selections', ... })`
  被呼叫,參數對應 hash 內容
- hashchange 但 hash === serialize(state) → **不** dispatch
- hashchange 結果含 warnings → `onStatus` 被呼叫

### 既有測試 regression

- `packages/web/test/selection.test.ts` 應仍通過(reducer 沒動)
- `packages/core/test/hash.test.ts` 應仍通過(core 沒動)

### 手動 browser 驗收

放在「驗收條件」一節,實作完成後逐項勾選。

## 驗收條件

### 功能

- [ ] 首次開 `localhost:5173`(URL 無 hash):載入預設角色 + 網址列出
      現 `#sex=male&body=Body_Color_light&head=Human_Male_light&expression=Neutral_light`
      (item.name 字面值,空格轉底線;`serializeHash` 不做大小寫轉換)
- [ ] 改一個 layer(例如換 hair) → 網址列 hash 立刻更新
- [ ] 按瀏覽器上一頁 → 回到改 hair 前的角色
- [ ] 按瀏覽器下一頁 → 又回到改 hair 後的角色
- [ ] 複製整個 URL → 新分頁開 → 角色狀態完全一樣
- [ ] 把網址列 hash 改成 `#sex=female&body=Body_color_light` 並按 Enter
      → 角色變成 female + light body
- [ ] 把上游官方工具的 share URL hash 貼到我們網址列(替換掉本機的
      hash 部分) → 能載入(可能有 1–2 項 fallback,但主體成功)
- [ ] URL 含 `#sex=male&body=...&fictional_xyz=foo` → 載入 body,fictional_xyz
      跳過,status bar 顯示「URL 中有 1 個未知項目被略過」
- [ ] URL 含 `#v1.xxxxx`(舊 token 形式) → 落回預設,status bar 提示
- [ ] TokenPopover 內出現「Copy share link」按鈕,點下 → 剪貼簿是含 hash
      的完整 URL → 貼到另一分頁能還原

### 程式碼品質

- [ ] `pnpm typecheck` 通過
- [ ] `pnpm test` 通過(含新增的 url-hash-sync.test.ts)
- [ ] `pnpm lint` 通過(若 repo 有設)
- [ ] core 沒被改動
- [ ] `packages/web/src/lib/url-hash-sync.ts` 內所有 DOM/window 互動集中
      在 hook 與 read 函式,bootstrap 純函式不碰 window
- [ ] 沒有新 `any`(嚴格 TS)
- [ ] 沒有 console.log / debugger 殘留
- [ ] 程式碼風格與既有 `packages/web/src/lib/*` 一致

### 跨環境

- [ ] dark / light theme 都正常
- [ ] en / zh-TW i18n 都正常
- [ ] Chrome / Firefox / Safari 至少各測一次基本行為

### Regression

- [ ] 既有 TokenPopover 的 Copy / Paste 仍正常
- [ ] BodyType / Reset / Attribution / Palette / Download popover 不受影響
- [ ] `?v=1`(SliceHarness)依舊運作且不會被 hash sync 影響
- [ ] Random outfit 鈕仍可用,且觸發後 URL hash 自動更新
- [ ] Reset 按鈕(reset outfit)後 URL hash 也回到預設
