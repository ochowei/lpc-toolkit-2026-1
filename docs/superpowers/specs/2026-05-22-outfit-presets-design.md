# 預設套裝（Outfit Presets）設計

- 日期：2026-05-22
- 範圍：`packages/web`
- 狀態：設計已核可，待寫實作計畫

## 背景與問題

目前 lpc-toolkit 的 web UI 沒有「成套搭配」的概念。使用者要嘛從寫死的初始
選擇開始，要嘛靠 common pickers 與進階搜尋一件一件挑。對想快速得到一個
有主題感角色（農民、魔法師、騎士……）的人來說門檻偏高。

本功能在 web UI 加入一組「預設套裝」：一排主題按鈕，點一下即套用整組
經過挑選的服裝與裝備。

## 目標

- 提供 6 組主題預設：農民、魔法師、騎士、遊俠、貴族、盜賊。
- 點主題按鈕即套用整組服裝，且結果是乾淨的成套造型。
- 套用只動服裝／裝備，保留使用者的個人外貌（body / 髮型 / 臉 / 眼睛 等）。
- 預設資料可讀、可審、可測；upstream 改名／改色時測試會紅燈。

## 非目標（YAGNI）

- 不做縮圖預覽圖庫（v1 用純文字按鈕）。
- 不把預設資料或套用邏輯放進 `packages/core`（CLI 尚未開發；未來真要
  共用再搬，搬移成本低）。
- 不顯示「目前選中哪個預設」的高亮狀態（套用後可逐件微調，active 狀態
  會立即失準）。
- 不讓使用者自訂／儲存自己的預設。
- 不新增任何相依套件。

## 已核可的設計決策

1. **形式**：在 web UI 加功能（非單純文字清單）。
2. **套用範圍**：只覆蓋服裝／裝備分類，保留個人外貌。
3. **清除行為**：套用前先清空所有服裝分類，再套上該主題的整組服裝。
4. **資料存放**：做法 A —— 結構化 TypeScript 資料檔，僅動 `packages/web`。
5. **UI 形式**：一排主題按鈕／chips。

## 主題清單

每個 item 以 `type_name: 物品名(顏色 variant)` 表示。實際物品名與 variant
於實作時對真實 catalog 釘死，並由驗證測試（見「測試」）鎖定。

| 主題 | 內容 |
|---|---|
| 🌾 農民 Farmer | clothes: Shortsleeve · overalls: Overalls(brown) · shoes: Sandals(brown) · hat: Leather Cap(brown) |
| 🔮 魔法師 Mage | clothes: 長袖款（挑體型涵蓋最廣者）· hat: Wizard Hat(purple) · weapon_magic_crystal: Crystal(purple) |
| ⚔️ 騎士 Knight | armour: Plate Armor · hat: Kettle Helm · weapon: Longsword · shield: Round Shield |
| 🏹 遊俠 Ranger | armour: Leather Armor · cape: Solid Cape(forest) · hat: Hood · weapon: Normal Bow · quiver: Quiver |
| 👑 貴族 Noble | clothes: Formal Longsleeve · legs: Formal Pants · shoes: Basic Shoes · hat: Formal Tophat |
| 🗡️ 盜賊 Rogue | chainmail: Chainmail · legs: Pants(深色) · hat: Hood |

### 體型限制（已知）

部分 catalog 服裝不支援全部體型，影響套用行為（見「套用邏輯」）：

- `armour`（Plate / Leather）、`chainmail`：僅 male / female / teen。
- 魔法師長袍 Robe：僅 female —— 故魔法師上衣優先挑體型涵蓋最廣的長袖款。
- Formal Longsleeve：僅 male。

不支援目前體型的單品在套用時會被略過（該 slot 留空）並提示使用者。

## 資料模型

新檔 `packages/web/src/presets.ts`：

```ts
export interface PresetItem {
  readonly typeName: TypeName;   // 'clothes' | 'armour' | 'hat' | 'weapon' | ...
  readonly name: string;         // catalog 裡的 ItemDefinition.name
  readonly variant?: string;     // 顏色 variant，如 'brown'、'purple'
}

export interface Preset {
  readonly id: string;           // 'farmer' | 'mage' | 'knight' | ...
  readonly labelKey: string;     // i18n key，如 'preset.farmer'
  readonly items: readonly PresetItem[];
}

export const PRESETS: readonly Preset[] = [ /* 6 組 */ ];

// 套用預設時會被清空的服裝／裝備分類（curated 常數）。
// 必須涵蓋所有預設用到的 type_name。
export const CLOTHING_TYPES: ReadonlySet<TypeName> = new Set([
  'clothes', 'overalls', 'apron', 'armour', 'chainmail',
  'legs', 'shoes', 'feet', 'cape', 'hat', 'weapon',
  'weapon_magic_crystal', 'shield', 'quiver',
]);
```

`CLOTHING_TYPES` 是「套用預設時會先清空的分類集合」。body / head / hair /
鬍子 / 表情 / 眼睛等個人外貌分類不在此集合內，永遠不被動到。若使用者透過
進階搜尋裝了某個不在 `CLOTHING_TYPES` 內的服裝分類，套用預設時不會自動
清掉它——這是可接受的邊界情況（在預設之間切換的常見路徑一定乾淨，因為
所有預設 item 的 type_name 都在集合內）。

## 套用邏輯

純函式（放 `presets.ts` 或 `presets-apply.ts`，方便單元測試）：

```ts
computePresetSelection(
  preset: Preset,
  currentSelections: Record<TypeName, Selection>,
  bodyType: BodyType,
  catalog: Catalog,
): { selections: Record<TypeName, Selection>; skipped: PresetItem[] }
```

步驟：

1. 從 `currentSelections` 出發，移除所有 `typeName ∈ CLOTHING_TYPES` 的
   項目（清空服裝，個人外貌原封不動）。
2. 逐一處理 `preset.items`：
   - 用 common pickers 既有的體型相容性判斷，檢查該 item 是否支援目前
     `bodyType`。
   - 支援 → 加進結果 selections（含 `variant`）。
   - 不支援、或 catalog 查不到 → 收進 `skipped`，該 slot 留空。
3. 回傳 `{ selections, skipped }`。

### Reducer / dispatch

元件點按鈕時呼叫上述純函式算出結果，再 dispatch 既有的「整批取代
selections」動作（貼 token 功能已在使用的那個）。若該動作與 token 解析
綁太死，則新增一個輕量的 `applyPreset` action 接收算好的 selections。
原則：reducer 不新增業務邏輯，邏輯集中在純函式裡。

### 體型不符的回饋

沿用現有 token 區的狀態列樣式，顯示一行短訊息，例如：

> 已套用「魔法師」（Robe 不支援目前體型，已略過）

torso 被略過時該層留空——優於硬塞錯體型的圖。

## UI

`packages/web/src/components/slice-harness.tsx` 新增「預設套裝」區塊，
放在 common pickers 上方（成為使用者第一眼的起點）：

- 小標題（i18n：`預設套裝` / `Presets`）。
- 一排按鈕／chips，`flex-wrap`，每個主題一顆，顯示 emoji + i18n 名稱。
- 按鈕下方一行狀態訊息（套用成功 / 略過提示），沿用既有狀態列樣式。
- Tailwind class 比照現有元件風格。

按鈕為純「動作」，不帶 active 高亮狀態。

## i18n

沿用 `packages/web/src/i18n.ts` 現有結構，新增 `preset` 命名空間，每個
支援語言都補齊：

- 區塊標題：`預設套裝` / `Presets`。
- 6 個主題名 key：`preset.farmer` … `preset.rogue`。
- 狀態訊息：套用成功、體型略過提示（帶參數的字串模板）。

主題名稱與所有訊息一律走 i18n，不寫死中英文。

## 測試（TDD：先寫測試，後實作）

**1. Catalog 驗證測試**（`packages/web` 測試目錄）
載入真實 catalog，對每個預設的每個 item 斷言：

- item 名稱能在 catalog 解析得到。
- `item.typeName ∈ CLOTHING_TYPES`。
- 若有指定 `variant`，該 variant 確實存在於該 item。

**2. `computePresetSelection` 單元測試**

- 清掉所有 `CLOTHING_TYPES` 選擇、但保留個人外貌（body / hair / 鬍子…）。
- 體型不相容的 item → 進 `skipped`，不進 selections。
- 相容的 item → 進 selections 且 `variant` 正確。
- 先套 A 再套 B → 結果沒有殘留 A 的單品。

**3. i18n 完整性**
若專案已有 i18n 測試就擴充，斷言 6 個 `preset.*` key 在每個語言都存在；
否則於驗證測試內順帶檢查。

**驗收條件**

- `pnpm test`、`pnpm typecheck`（TypeScript strict）、build 全綠。
- 手動跑 web，逐一點過 6 顆按鈕，確認造型正確、略過提示如預期。

## 已知限制

- 體型涵蓋不均：部分服裝缺某些體型的圖，套用時略過並提示，v1 不做
  per-body-type 的替代品。
- 不在 `CLOTHING_TYPES` 內、由進階搜尋手動加入的服裝分類，套用預設時
  不會被自動清除。

## 受影響檔案

新增：

- `packages/web/src/presets.ts`（資料 + `CLOTHING_TYPES` + 套用純函式）
- `packages/web` 測試目錄下的預設相關測試檔

修改：

- `packages/web/src/components/slice-harness.tsx`（新增按鈕區塊）
- `packages/web/src/i18n.ts`（新增 `preset` 命名空間）
- `packages/web/src/slice/selection.ts`（必要時新增輕量 `applyPreset` action）
