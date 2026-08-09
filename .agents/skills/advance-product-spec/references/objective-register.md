# Objective Register

## Purpose

Create stable, reviewable identifiers for every auditable statement in the current Product Direction while preserving the English document as the canonical normative source and keeping both Product Direction files free of registry metadata.

## Classification

Classify each normative statement exactly once:

- `CAP`: a required interface, journey, or end-to-end outcome.
- `GRD`: attribution, human authority, local-first lifecycle, provider neutrality, mutation, responsibility boundary, or current non-goal.
- `DEL`: a current package, plugin, hosted channel, or other delivery claim.
- `EVO`: a rule for evolving direction or keeping owned documentation aligned.
- `OPT`: a permitted future possibility or optional enhancement. Exclude it from required completion denominators.

Do not assign IDs to background, examples, definitions, or duplicated explanatory prose. Split a clause when one obligation can succeed while another fails. Merge duplicate wording only when it denotes the same observable objective.

## ID format

Use:

```text
PD-<CLASS>-<DOMAIN>-<SURFACE>-<NNN>
```

- `<CLASS>` is one of `CAP`, `GRD`, `DEL`, `EVO`, or `OPT`.
- `<DOMAIN>` is a short stable capability or concern such as `COMP`, `AUDIT`, `AUTHOR`, `ATTR`, or `LIFECYCLE`.
- `<SURFACE>` is `PRODUCT`, `AGENT`, `CLI`, `WEB`, or another durable owner when useful.
- `<NNN>` is a zero-padded sequence within the preceding segments.

Prefer durable meaning over matching current headings. Keep an existing ID when wording is clarified without changing the objective. Never assign a retired ID to a different objective.

## Register file

Store the complete register at `docs/PRODUCT-OBJECTIVES.md`. Product Direction owns product semantics; the register owns objective identity, classification, and bilingual source mapping. Current capability specs map only IDs declared in this register.

Use this exact entry shape:

```md
## PD-CAP-COMP-CLI-001 — Direct local character operations

- English source: Interface and journey responsibilities > Provide direct local character, catalog, validation, preview, and render operations.
- zh-TW source: 介面與流程責任 > 提供直接的本機角色、目錄、驗證、預覽與渲染操作。
```

The text after `—` is a concise objective, not a second normative contract. Each source locator contains an exact Markdown heading, ` > `, and an exact prose excerpt that uniquely identifies the corresponding sentence or clause within that heading. Keep the excerpt as short as possible while remaining unique. Do not use line numbers or descriptive labels that are absent from Product Direction.

Keep entries in Product Direction order. Declare each ID exactly once. Do not place `PD-*` objective IDs in either Product Direction file.

## Bootstrap workflow

1. Derive the complete English objective register.
2. Show each proposed ID, classification, concise objective, and both source locators before editing.
3. Match every English objective to its Traditional Chinese counterpart.
4. Report missing, extra, or semantically divergent translation statements. Do not rewrite them during bootstrap.
5. Show the complete proposed `docs/PRODUCT-OBJECTIVES.md` scope. If legacy inline IDs exist, also show their comment-only removal from both Product Direction files.
6. After approval, create or update the register and remove only approved legacy inline comments. Preserve Product Direction prose.
7. Run the bundled validator.

Bootstrap changes identity and mapping structure, not product scope. Any semantic Product Direction change remains a separate decision and must update both languages and the standalone register under repository policy.
