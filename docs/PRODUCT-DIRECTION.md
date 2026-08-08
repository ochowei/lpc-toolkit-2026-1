# Product Direction

This document is the normative living statement of LPC Toolkit's product
direction, responsibility boundaries, and current scope. Its primary audience
is maintainers, contributors, and coding agents. It is not an
implementation-status dashboard, release roadmap, or user guide.

When a product change adds, removes, or redefines scope, update this document in
the same change. The root README, release notes, and executable verification own
claims about what is currently implemented or shipped.

## Direction

LPC Toolkit treats Agent integrations and the CLI as its primary interfaces for
attributed LPC sprite composition and asset authoring. The Web Composer is an
optional, secondary interface for human visual composition and review.

The CLI is the current stable operational contract used directly by humans and
by Agent integrations. It is not the permanently exclusive Agent transport:
future integrations may also use MCP or another transport, provided they reuse
the same product rules, authority boundaries, and attribution behavior.

LPC Toolkit owns deterministic composition, authoring contracts, local artifact
lifecycle, validation, attribution, preview, and release gates. It does not own
sprite-pixel generation. Asset-authoring outcomes are local-first and
user-controlled.

## Product interfaces

The interfaces below describe supported ways to perform product journeys. They
are not a source-code package or module inventory.

| Product interface | Priority and responsibility |
| --- | --- |
| **Agent integration** | Primary guided interface. A platform-specific integration conducts conversations, preserves authority transitions, and coordinates available external capabilities through public product contracts. `Agent integration` is a cross-platform category; the Codex plugin is one implementation. |
| **CLI** | Primary direct interface for humans and Agents. It is the current stable operational contract for deterministic local discovery, composition, audit, authoring lifecycle, validation, preview, packaging, and installation. |
| **Web Composer** | Optional secondary interface centered on human visual work. It provides a complete interactive composition experience and may assist comparison, preview, review, or handoff for asset authoring. No supported journey may require it. |

## Supported product journeys

LPC Toolkit currently recognizes three top-level product journeys. They define
product scope, not a claim that every planned experience is already shipped.

### A. Sprite composition

Select and render existing attributed catalog assets into a character. Sprite
composition does not create source pixels or modify an asset pack.

### B. Animation remediation journey

Begin with a read-only animation audit that records bounded evidence of missing
or incomplete animation support. The audit may produce an animation remediation
handoff, but it may not create a workspace, generate pixels, or mutate source.

Only after the user reviews the finding and explicitly consents may the journey
cross into animation-extension authoring. The extension retains the existing
catalog identity and inherited credits and changes only the approved animation
scope.

### C. New asset authoring journey

Search the existing catalog first. If existing assets satisfy the request,
offer Sprite composition; if an existing asset only lacks animation support,
offer Animation remediation. A cross-journey transition requires explicit user
confirmation.

When a genuinely new asset remains the chosen goal, create one attributed asset
within supported LPC types, body types, animations, geometry, layers, and
transparency rules.

## Interface and journey responsibilities

| Interface | A. Sprite composition | B. Animation remediation | C. New asset authoring |
| --- | --- | --- | --- |
| **Agent integration** | Guide catalog discovery, selection, preview, and render. | Guide the read-only audit, obtain authoring consent, and coordinate external pixel production when requested. | Route catalog-first, obtain authoring and provider consent, and coordinate external pixel production when requested. |
| **CLI** | Provide direct local character, catalog, validation, preview, and render operations. | Provide audit, drawing-contract, candidate-import, validation, attributed-preview, and explicit lifecycle operations; it does not generate pixels. | Provide plan, drawing-contract, candidate-import, validation, attributed-preview, and explicit lifecycle operations; it does not generate pixels. |
| **Web Composer** | Provide the complete human visual composition interface. | Optionally support comparison, attributed preview, human review, or handoff. | Optionally support comparison, attributed preview, human review, or handoff. |

Agent integrations and the CLI must be able to support all three journeys
without depending on the hosted Web application. The Web Composer may improve
the human experience without becoming a validation, approval, or storage
authority.

## Pixel-generation boundary

LPC Toolkit does not bundle or provide an image model, sprite-generation
provider, provider registry, provider executor, or credential store. The CLI
creates provider-neutral sprite drawing contracts, accepts contract-compatible
candidate sprites through its import boundary, and continues with validation,
attribution, preview, and release governance.

An Agent integration may define a platform-specific preference for an external
capability. For example, a compatible Codex environment may propose ImageGen
and `generate2dsprite`. That preference belongs to the Agent integration, not
to LPC Toolkit product logic or the CLI contract. Before sending a prompt,
reference, contract artifact, or other data to an external provider, the Agent
must disclose the exact scope and obtain user consent.

If no compatible provider is available, or the user declines one, the
authoring session and drawing contract remain resumable for an external artist
or another tool. Provider availability must never be confused with permission
to invoke it, authorship, license authority, or release approval.

## Local-first artifact lifecycle

For Animation remediation and New asset authoring, the formal source of truth is
the user-selected local authoring workspace. Provider-owned raw output remains
a candidate outside canonical source until the user selects it and the CLI
imports it through the current drawing-contract boundary.

The default Agent-guided endpoint is a **review-ready asset revision**:
candidate pixels have been imported, validation is current, and an attributed
preview has been produced with matching metadata and TXT/CSV credits. This is
not a formal release or a claim of human acceptance.

After separate human-confirmed release gates, the user may create an immutable,
attributed formal asset-pack archive and explicitly install it into another
local consumer workspace. The portable archive does not replace the original
authoring source, and packaging never implies installation, upload,
publication, or contribution.

Standard journeys do not require a clone of this repository or any related
source repository. They must not use this repository or its read-only
`upstream/` gitlink as an authoring output destination. LPC Toolkit does not
automatically stage, commit, push, open a pull request, upload, or publish user
artifacts. A future contribution workflow must be separately requested and
authorized and must use an external fork or isolated checkout rather than
mutating `upstream/`.

**Local-first and user-controlled** describes where formal artifacts live and
who authorizes movement of them. It does not assert copyright ownership and
does not promise strict offline operation. Preparing pinned runtime assets,
using an external generation provider, or choosing a future cloud feature may
require network access; those actions remain explicit and bounded.

## Human authority and attribution

Attribution is mandatory product logic across composition, preview, render,
download, packaging, and installation. Matching credit metadata must remain
reachable with the pixels it describes.

Agents may collect evidence, propose compatible choices, and explain pending
actions. They may not invent or approve:

- an attribution author or human identity;
- source or license authority;
- a warning-acknowledgement reason or risk acceptance;
- visual acceptance of an attributed preview; or
- formal release, installation, publication, or contribution consent.

A generation provider is production provenance, not automatically an
attribution author. `User-controlled` describes artifact custody and authority
to move files; it does not decide intellectual-property ownership.

## Current delivery

The current delivery choices are:

- the CLI package is published through npm;
- a Codex plugin is one shipped Agent integration; and
- the Web application containing the Web Composer and guidance pages is hosted
  on Vercel.

These are current channels, not permanent product or architecture commitments.
They may change without changing the stable interface priorities, journey
boundaries, local-first lifecycle, human authority, or attribution rules.

## Current non-goals

The current product scope does not include:

- built-in image generation or a required generation provider;
- CLI-owned provider installation, execution, discovery registry, credentials,
  or hidden network access;
- a required account, application backend, cloud asset store, or automatic
  synchronization service;
- making the Web Composer or its hosting provider necessary for a supported
  journey;
- automatic repository mutation, contribution, upload, publication, or asset
  sharing;
- allowing an Agent to replace required human declarations or approvals; or
- a commitment to ship MCP, a particular future Agent platform, or a cloud
  service.

These are current non-goals, not permanent prohibitions. A future product
decision may change them through the evolution rules below.

## Evolution rules

- Update this document in the same change that adds, removes, or redefines a
  product interface, journey, authority boundary, data-lifecycle rule, or
  current non-goal.
- Keep implementation and release status in their owning documents; do not
  rewrite direction merely to hide an implementation gap.
- Treat future accounts, backend services, or cloud storage as optional unless
  a separately reviewed direction change explicitly revisits local-first
  behavior. Update the relevant privacy, security, architecture, and operating
  documentation at the same time.
- Require future MCP or other transports to reuse existing domain,
  attribution, validation, consent, and release authorities rather than
  defining parallel product logic.
- Record a separate architecture decision only when the choice is hard to
  reverse, surprising without context, and the result of a real trade-off.

## Related documentation

- [Domain glossary](../CONTEXT.md)
- [Repository rules](../AGENTS.md)
- [Architecture guide](ARCHITECTURE.md)
- [CLI guide](../packages/cli/README.md)
- [Character-authoring Agent skill](../plugins/lpc-toolkit/skills/character-authoring/SKILL.md)
- [Animation-audit Agent skill](../plugins/lpc-toolkit/skills/animation-asset-audit/SKILL.md)
- [Asset-authoring Agent skill](../plugins/lpc-toolkit/skills/asset-authoring/SKILL.md)
- [ADR-0007: Keep sprite generation provider-neutral](adr/0007-keep-sprite-generation-provider-neutral.md)
- [ADR-0008: Keep animation audit read-only](adr/0008-keep-animation-audit-read-only.md)
- [ADR-0009: Require human asset release declarations](adr/0009-require-human-asset-release-declarations.md)
- [ADR-0010: Version the CLI and plugin independently](adr/0010-version-cli-and-plugin-independently.md)

---

# 產品方向

本文件是 LPC Toolkit 產品方向、責任邊界與目前範圍的規範性動態聲明。主要讀者是維護者、貢獻者與程式設計 Agent。它不是實作狀態儀表板、發布路線圖或使用者指南。

當產品變更新增、移除或重新定義範圍時，應在同一項變更中更新本文件。根目錄 README、發布說明與可執行驗證負責說明目前已實作或已交付的內容。

## 方向

LPC Toolkit 將 Agent 整合與 CLI 視為帶有署名資訊的 LPC 精靈圖合成與資產製作之主要介面。Web Composer 是供人類進行視覺化合成與審查的選用次要介面。

CLI 是目前由人類及 Agent 整合直接使用的穩定操作契約。它不會永遠是 Agent 的唯一傳輸方式：未來的整合也可以使用 MCP 或其他傳輸方式，前提是重用相同的產品規則、權責邊界與署名行為。

LPC Toolkit 負責確定性合成、製作契約、本機成品生命週期、驗證、署名、預覽與發布關卡；它不負責產生精靈圖像素。資產製作成果採本機優先，並由使用者掌控。

## 產品介面

下列介面描述執行產品流程時所支援的方式，並非原始碼套件或模組清單。

| 產品介面 | 優先順序與責任 |
| --- | --- |
| **Agent 整合** | 主要引導式介面。平台專屬整合負責進行對話、維持權責轉換，並透過公開產品契約協調可用的外部能力。`Agent integration` 是跨平台類別；Codex 外掛是其中一種實作。 |
| **CLI** | 人類與 Agent 的主要直接介面。它是目前的穩定操作契約，負責確定性的本機探索、合成、稽核、製作生命週期、驗證、預覽、封裝與安裝。 |
| **Web Composer** | 以人類視覺化工作為核心的選用次要介面。它提供完整的互動式合成體驗，也可協助資產製作的比較、預覽、審查或交接。任何受支援的流程都不得以它為必要條件。 |

## 支援的產品流程

LPC Toolkit 目前定義三項頂層產品流程。它們界定產品範圍，但不表示每一項規劃中的體驗都已交付。

### A. 精靈圖合成

選取既有且帶有署名資訊的目錄資產，並將其渲染成角色。精靈圖合成不會建立來源像素，也不會修改資產包。

### B. 動畫補全流程

流程從唯讀動畫稽核開始，記錄動畫支援缺失或不完整的有限範圍證據。稽核可以產生動畫補全交接資料，但不得建立工作區、產生像素或修改來源。

只有在使用者審閱發現並明確同意後，流程才可進入動畫擴充製作。擴充內容保留既有目錄識別與繼承的署名資訊，且僅變更已核准的動畫範圍。

### C. 新資產製作流程

先搜尋既有目錄。若現有資產已符合需求，應提供精靈圖合成；若現有資產僅缺少動畫支援，則提供動畫補全。跨流程轉換必須取得使用者明確確認。

若最終選擇的目標確實仍是新資產，則在受支援的 LPC 類型、身體類型、動畫、幾何、圖層與透明度規則內，建立一項附有署名資訊的資產。

## 介面與流程責任

| 介面 | A. 精靈圖合成 | B. 動畫補全 | C. 新資產製作 |
| --- | --- | --- | --- |
| **Agent 整合** | 引導目錄探索、選取、預覽與渲染。 | 引導唯讀稽核、取得製作同意，並在使用者要求時協調外部像素製作。 | 先導向目錄搜尋、取得製作與提供者使用同意，並在使用者要求時協調外部像素製作。 |
| **CLI** | 提供直接的本機角色、目錄、驗證、預覽與渲染操作。 | 提供稽核、繪製契約、候選成品匯入、驗證、附署名預覽及明確的生命週期操作；它不產生像素。 | 提供計畫、繪製契約、候選成品匯入、驗證、附署名預覽及明確的生命週期操作；它不產生像素。 |
| **Web Composer** | 提供完整的人類視覺化合成介面。 | 可選擇性支援比較、附署名預覽、人工審查或交接。 | 可選擇性支援比較、附署名預覽、人工審查或交接。 |

Agent 整合與 CLI 必須能在不依賴託管 Web 應用程式的情況下支援全部三項流程。Web Composer 可以改善人類使用體驗，但不得成為驗證、核准或儲存的權責主體。

## 像素產生邊界

LPC Toolkit 不綁定或提供影像模型、精靈圖產生提供者、提供者登錄機制、提供者執行器或憑證儲存區。CLI 會建立與提供者無關的精靈圖繪製契約，透過匯入邊界接收符合契約的候選精靈圖，接著進行驗證、署名、預覽與發布治理。

Agent 整合可以針對外部能力定義平台專屬偏好。例如，相容的 Codex 環境可以提議使用 ImageGen 與 `generate2dsprite`。該偏好屬於 Agent 整合，而非 LPC Toolkit 產品邏輯或 CLI 契約。在將提示、參考資料、契約成品或其他資料傳送給外部提供者之前，Agent 必須揭露確切範圍並取得使用者同意。

如果沒有相容的提供者，或使用者拒絕使用，製作工作階段與繪製契約仍可保留，以便交由外部美術人員或其他工具繼續處理。絕不可將提供者是否可用，混同於呼叫它的權限、作者身分、授權權限或發布核准。

## 本機優先的成品生命週期

對於動畫補全與新資產製作，正式事實來源是使用者選定的本機製作工作區。提供者所擁有的原始輸出仍是正式來源之外的候選成品，直到使用者選取它，且 CLI 透過目前的繪製契約邊界將其匯入為止。

Agent 引導流程的預設終點是**可供審查的資產修訂版**：候選像素已匯入、驗證結果為最新狀態，並已產生附有相符中繼資料及 TXT/CSV 署名資料的預覽。這並非正式發布，也不表示已獲得人類接受。

通過另外取得人工確認的發布關卡後，使用者可以建立不可變且附有署名資訊的正式資產包封存檔，並明確將其安裝至另一個本機消費端工作區。可攜式封存檔不會取代原始製作來源，且封裝不代表安裝、上傳、發布或貢獻。

標準流程不需要複製本儲存庫或任何相關的原始碼儲存庫。它們不得將本儲存庫或其中的唯讀 `upstream/` gitlink 作為製作輸出的目的地。LPC Toolkit 不會自動暫存、提交、推送、建立 Pull Request、上傳或發布使用者成品。未來的貢獻流程必須另外提出要求並取得授權，且必須使用外部分叉（fork）儲存庫或隔離的簽出目錄，不得修改 `upstream/`。

**本機優先且由使用者掌控**描述正式成品存放的位置，以及由誰授權其移動；這並不主張著作權歸屬，也不承諾完全離線運作。準備固定版本的執行期資產、使用外部產生提供者，或選用未來的雲端功能，都可能需要網路存取；這些行動仍須明確且範圍有限。

## 人類權責與署名

署名是合成、預覽、渲染、下載、封裝與安裝過程中不可省略的產品邏輯。與像素相符的署名中繼資料必須能和其描述的像素一併取得。

Agent 可以蒐集證據、提出相容的選項，並說明待執行的動作。它們不得虛構或核准：

- 署名作者或人類身分；
- 來源或授權權限；
- 警告確認理由或風險接受；
- 對附署名預覽的視覺驗收；或
- 正式發布、安裝、公開發表或貢獻同意。

產生服務的提供者是製作來源資訊，不會自動成為署名作者。`由使用者掌控` 描述成品保管方式與移動檔案的權責；它不判定智慧財產權的歸屬。

## 目前交付方式

目前的交付方式如下：

- CLI 套件透過 npm 發布；
- Codex 外掛是其中一個已交付的 Agent 整合；以及
- 包含 Web Composer 與指引頁面的 Web 應用程式託管於 Vercel。

這些是目前採用的管道，不是永久的產品或架構承諾。即使改變這些管道，也不會改變穩定的介面優先順序、流程邊界、本機優先生命週期、人類權責或署名規則。

## 目前的非目標

目前的產品範圍不包括：

- 內建影像產生功能或必要的產生服務提供者；
- 由 CLI 負責提供者的安裝、執行、探索登錄、憑證或隱藏的網路存取；
- 必要帳號、應用程式後端、雲端資產儲存區或自動同步服務；
- 讓 Web Composer 或其託管提供者成為受支援流程的必要條件；
- 自動修改儲存庫、貢獻、上傳、公開發表或分享資產；
- 允許 Agent 取代必要的人類宣告或核准；或
- 承諾交付 MCP、特定的未來 Agent 平台或雲端服務。

這些是目前的非目標，而非永久禁止事項。未來的產品決策可依下方演進規則加以變更。

## 演進規則

- 在新增、移除或重新定義產品介面、流程、權責邊界、資料生命週期規則或目前的非目標時，應在同一項變更中更新本文件。
- 實作與發布狀態應保留在各自所屬的文件中；不得為了掩蓋實作缺口而改寫產品方向。
- 除非另行審查的方向變更明確重新檢視本機優先行為，否則未來的帳號、後端服務或雲端儲存空間皆應視為選用功能。同時更新相關的隱私、安全、架構與操作文件。
- 未來的 MCP 或其他傳輸方式必須重用既有的領域、署名、驗證、同意與發布權責，不得另行定義平行的產品邏輯。
- 只有在選擇難以回復、缺乏背景脈絡便令人意外，且確實經過取捨時，才另行記錄架構決策。

## 相關文件

- [領域詞彙表](../CONTEXT.md)
- [儲存庫規則](../AGENTS.md)
- [架構指南](ARCHITECTURE.md)
- [CLI 指南](../packages/cli/README.md)
- [角色製作 Agent 技能](../plugins/lpc-toolkit/skills/character-authoring/SKILL.md)
- [動畫稽核 Agent 技能](../plugins/lpc-toolkit/skills/animation-asset-audit/SKILL.md)
- [資產製作 Agent 技能](../plugins/lpc-toolkit/skills/asset-authoring/SKILL.md)
- [ADR-0007：保持精靈圖產生服務提供者中立](adr/0007-keep-sprite-generation-provider-neutral.md)
- [ADR-0008：保持動畫稽核唯讀](adr/0008-keep-animation-audit-read-only.md)
- [ADR-0009：要求人類進行資產發布宣告](adr/0009-require-human-asset-release-declarations.md)
- [ADR-0010：CLI 與外掛採獨立版本控制](adr/0010-version-cli-and-plugin-independently.md)
