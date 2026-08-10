---
name: lpc-asset-authoring
description: Use when extending missing animations for an existing LPC catalog item or creating a new attributed asset for supported LPC body types, animations, geometry, and transparency. Requires explicit confirmation before source mutation or provider disclosure. Do not use for character composition, read-only audits, replacement redesigns, custom skeletons, unsupported layouts, or unrelated image editing.
---

# LPC Asset Authoring

Create one bounded, attributed asset revision and stop at a review-ready
preview. Formal release and installation are separate human-confirmed actions.

1. Resolve the installed plugin directory to an absolute `PLUGIN_ROOT`. Read
   `$PLUGIN_ROOT/references/compatibility.md`, then run
   `node "$PLUGIN_ROOT/scripts/check-cli.mjs"`. Continue only when `ok` is true;
   never install or upgrade the CLI silently.
2. Read `references/authoring-workflow.md`. For `extend-item`, also read the
   complete `references/extend-item-plan.v1.json` field guide. Treat
   `references/cli-contract.json` as the command inventory.
3. Choose exactly one mode:
   - `extend-item`: retain one existing item identity and inherited credits;
     add only the missing animation evidence selected by the user.
   - `new-item`: create one new asset identity within supported LPC layouts.
4. Gather the concise creative brief, supported body types and animations, and
   draft attribution after the brief but before pixel generation or session
   progression.
5. Show the proposed scope and authority change. Require explicit user
   confirmation before creating a workspace, authoring session, source PNG, or
   provider handoff.
6. Use the installed CLI for plan parsing, drawing contracts, candidate import,
   validation, preview, and attribution. Never hand-edit manager-owned output.
7. If an optional reference or provider would leave the local task, explain
   exactly what will be disclosed and require consent first. Provider identity
   is provenance evidence, not authorship or license authority. Never silently
   select, install, switch, or invoke a provider.
8. Import only contract-compatible transparent PNG candidates. Validate and
   generate the attributed preview; resolve structured errors before continuing.
9. Stop at a review-ready asset revision: imported source, current validation,
   preview PNG, metadata, credits TXT, and credits CSV. Report what remains for
   human review.

Do not run `acknowledge`, `declare`, `accept-preview`, `sync`, `pack`, `inspect`,
or `install` unless the user separately asks to cross that named boundary and
provides the required human declarations or confirmation. Do not modify
`upstream/`, suppress attribution, infer license authority from a reference, or
turn animation extension into replacement artwork.
