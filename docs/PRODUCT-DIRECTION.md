# Product Direction

[繁體中文翻譯](PRODUCT-DIRECTION.zh-TW.md) · [Objective register](PRODUCT-OBJECTIVES.md)

- This English document is the canonical normative living statement of LPC
  Toolkit's product direction, responsibility boundaries, and current scope for
  maintainers, contributors, and coding agents.
- It is not an implementation-status dashboard, release roadmap, or user guide.
- When a product change adds, removes, or redefines scope, update this document
  in the same change.
- The root README, release notes, and executable verification own claims about
  what is currently implemented or shipped.

## Direction

- LPC Toolkit treats Agent integrations and the CLI as its primary interfaces
  for attributed LPC sprite composition and asset authoring.
- The Web Composer is an optional, secondary interface for human visual
  composition and review.
- The CLI is the current stable operational contract used directly by humans
  and by Agent integrations.
- Other Agent transports remain possible: future integrations may also use MCP
  or another transport, provided they reuse the same product rules, authority
  boundaries, and attribution behavior.
- LPC Toolkit owns deterministic composition, authoring contracts, local
  artifact lifecycle, validation, attribution, preview, and release gates.
- It does not own sprite-pixel generation.
- Asset-authoring outcomes are local-first and user-controlled.

## Product interfaces

- **Agent integration:** Primary guided interface. A platform-specific
  integration conducts conversations, preserves authority transitions, and
  coordinates available external capabilities through public product
  contracts. `Agent integration` is the cross-platform category; the Codex
  plugin is one implementation.
- **CLI:** It is the current stable operational contract for deterministic local
  discovery, composition, audit, authoring lifecycle, validation, preview,
  packaging, and installation.
- **Web Composer:** It provides a complete interactive composition experience
  and may assist comparison, preview, review, or handoff for asset authoring.
  No supported journey may require it.

## Supported product journeys

These three journeys define scope, not delivery status.

### A. Sprite composition

- Select and render existing attributed catalog assets into a character.
- Sprite composition does not create source pixels or modify an asset pack.

### B. Animation remediation journey

- Begin with a read-only animation audit that records bounded evidence of
  missing or incomplete animation support.
- The audit may produce an animation remediation handoff, but it may not create
  a workspace, generate pixels, or mutate source.
- Only after the user reviews the finding and explicitly consents may the
  journey cross into animation-extension authoring.
- The extension retains the existing catalog identity and inherited credits and
  changes only the approved animation scope.

### C. New asset authoring journey

- Search the existing catalog first.
- If existing assets satisfy the request, offer Sprite composition; if an
  existing asset only lacks animation support, offer Animation remediation.
- A cross-journey transition requires explicit user confirmation.
- When a genuinely new asset remains the chosen goal, create one attributed
  asset within supported LPC types, body types, animations, geometry, layers,
  and transparency rules.

## Interface and journey responsibilities

| Interface | A. Sprite composition | B. Animation remediation | C. New asset authoring |
| --- | --- | --- | --- |
| **Agent integration** | Guide catalog discovery, selection, preview, and render. | Guide the read-only audit, obtain authoring consent, and coordinate external pixel production when requested. | Route catalog-first, obtain authoring and provider consent, and coordinate external pixel production when requested. |
| **CLI** | Provide direct local character, catalog, validation, preview, and render operations. | Provide audit, drawing-contract, candidate-import, validation, attributed-preview, and explicit lifecycle operations; it does not generate pixels. | Provide plan, drawing-contract, candidate-import, validation, attributed-preview, and explicit lifecycle operations; it does not generate pixels. |
| **Web Composer** | Provide the complete human visual composition interface. | Optionally support comparison, attributed preview, human review, or handoff. | Optionally support comparison, attributed preview, human review, or handoff. |

- Agent integrations and the CLI must be able to support all three journeys
  without depending on the hosted Web application.
- The Web Composer remains optional without becoming a validation, approval, or
  storage authority.

## Pixel-generation boundary

- LPC Toolkit does not bundle or provide an image model, sprite-generation
  provider, provider registry, provider executor, or credential store.
- The CLI creates provider-neutral sprite drawing contracts, accepts
  contract-compatible candidate sprites through its import boundary, and
  continues with validation, attribution, preview, and release governance.
- An Agent integration may define a platform-specific preference for an
  external capability.
- That preference belongs to the Agent integration, not to LPC Toolkit product
  logic or the CLI contract.
- Before sending data to an external provider, the Agent must disclose the exact
  scope and obtain user consent.
- If a compatible provider is unavailable or declined, the authoring session
  and drawing contract remain resumable for an external artist or another tool.
- Provider availability must never be confused with permission to invoke it,
  authorship, license authority, or release approval.

## Local-first artifact lifecycle

- In both authoring journeys, the formal source of truth is the user-selected
  local authoring workspace.
- Provider-owned raw output remains a candidate outside canonical source until
  the user selects it and the CLI imports it through the current
  drawing-contract boundary.
- The default Agent-guided endpoint is a **review-ready asset revision**:
  candidate pixels have been imported, validation is current, and an attributed
  preview has been produced with matching metadata and TXT/CSV credits.
- This is not a formal release or a claim of human acceptance.
- After separate human-confirmed release gates, the user may create an
  immutable, attributed formal asset-pack archive and explicitly install it
  into another local consumer workspace.
- The portable archive does not replace the original authoring source, and
  packaging never implies installation, upload, publication, or contribution.
- Standard journeys do not require a clone of this repository or any related
  source repository.
- They must not use this repository or its read-only `upstream/` gitlink as an
  authoring output destination.
- LPC Toolkit does not automatically stage, commit, push, open a pull request,
  upload, or publish user artifacts.
- A future contribution workflow must be separately requested and authorized
  and must use an external fork or isolated checkout rather than mutating
  `upstream/`.
- Local-first describes artifact custody and authority. It does not assert
  copyright ownership and does not promise strict offline operation.
- Network-requiring actions may occur; those actions remain explicit and
  bounded.

## Human authority and attribution

- Attribution is mandatory product logic across composition, preview, render,
  download, packaging, and installation.
- Matching credit metadata must remain reachable with the pixels it describes.
- Agents may collect evidence, propose compatible choices, and explain pending
  actions.
- They may not invent or approve:
  - an attribution author or human identity;
  - source or license authority;
  - a warning-acknowledgement reason or risk acceptance;
  - visual acceptance of an attributed preview; or
  - formal release, installation, publication, or contribution consent.
- A generation provider is production provenance, not automatically an
  attribution author.

## Current delivery

- the CLI package is published through npm;
- a Codex plugin is one shipped Agent integration; and
- the Web application containing the Web Composer and guidance pages is hosted
  on Vercel.

These are current channels, not permanent product or architecture commitments.
They may change without changing the stable interface priorities, journey
boundaries, local-first lifecycle, human authority, or attribution rules.

## Current non-goals

The current product scope does not include:

- a required generation provider;
- CLI-owned provider installation, execution, discovery registry, credentials,
  or hidden network access;
- a required account, application backend, cloud asset store, or automatic
  synchronization service;
- automatic asset sharing; or
- a commitment to ship MCP, a particular future Agent platform, or a cloud
  service.

These are current non-goals, not permanent prohibitions. A future product
decision may change them through the evolution rules below.

## Evolution rules

- Keep implementation gaps visible; do not rewrite direction merely to hide an
  implementation gap.
- Treat future accounts, backend services, or cloud storage as optional unless
  a separately reviewed direction change explicitly revisits local-first
  behavior.
- Update the relevant privacy, security, architecture, and operating
  documentation at the same time.
- Update the maintained Traditional Chinese translation in the same change as
  any product-direction change.
- Record a separate architecture decision only when the choice is hard to
  reverse, surprising without context, and the result of a real trade-off.
