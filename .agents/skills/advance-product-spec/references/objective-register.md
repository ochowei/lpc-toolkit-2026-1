# Objective Register

## Purpose

Create stable, reviewable identifiers for every auditable statement in the current Product Direction while preserving the English document as the canonical normative source.

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

## Markdown placement

Insert one unobtrusive HTML comment immediately before the statement it identifies:

```md
<!-- PD-CAP-COMP-CLI-001 -->
The CLI provides direct local character discovery, editing, preview, and render operations.
```

For a table cell, place the comment at the beginning of the relevant cell. Use the same ID on the semantically corresponding statement in `docs/PRODUCT-DIRECTION.zh-TW.md`.

## Bootstrap workflow

1. Derive the complete English objective register.
2. Show each proposed ID, classification, concise objective, and source heading before editing.
3. Match every English objective to its Traditional Chinese counterpart.
4. Report missing, extra, or semantically divergent translation statements. Do not rewrite them during ID-only bootstrap.
5. After approval, insert only the ID comments in both files.
6. Run the bundled validator.

Bootstrap changes identity and structure, not product scope. Any semantic Product Direction change remains a separate decision and must update both languages under repository policy.
