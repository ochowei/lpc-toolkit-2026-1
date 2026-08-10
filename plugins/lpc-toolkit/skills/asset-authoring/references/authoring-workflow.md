# Asset Authoring Workflow

## Shared kickoff

Ask only for information needed at the current stage. Begin with the goal,
asset concept or selected finding, body type, animation, and any visual
constraints. Then collect draft credits before generating pixels:

- human-provided author or source label;
- human-chosen compatible license;
- source URL when applicable;
- notes that distinguish references from authored source.

A visual reference may guide style, but does not prove authorship, ownership,
license compatibility, or permission to redistribute. Before sending a
reference, prompt, asset, or metadata to a provider, list that disclosure and
ask for explicit consent.

## `extend-item`

1. Begin in the lpc-animation-asset-audit skill. Run a read-only bounded audit
   and show the selected finding, physical source, consumers, body types,
   recolors, geometry evidence, and path confidence.
2. Ask whether to start a source-asset revision. Do not mutate anything until
   the user confirms.
3. Retain the catalog `itemId`, type, baseline credits, and all unaffected
   animations. The revision adds only the selected missing animation or blank
   cells; it is not a redesign or replacement.
4. Build one strict `lpc-toolkit.asset-authoring-plan.v1` `extend-item` plan
   from the confirmed finding. Preserve the complete audit report and digest,
   physical source, consumers, body types, variants, recolors, geometry,
   confidence, exact source-cell evidence, and approved remediation bounds.
5. Start the authoring session and materialize its provider-neutral sprite
   drawing contract:

   ```sh
   lpc-toolkit asset authoring start --plan <plan.json> --workspace <workspace> --json
   lpc-toolkit asset authoring contract --session <session-id> --workspace <workspace> --json
   ```

## `new-item`

1. Search the catalog first. If an existing asset can satisfy the request,
   offer character composition or an existing item; switching journeys still
   requires the user's confirmation.
2. Constrain the new asset to catalog-supported type, body type, animation,
   sheet geometry, layers, and transparency. Reject custom skeletons or layouts.
3. Build a strict `lpc-toolkit.asset-authoring-plan.v1` JSON document with one
   `new-item`, one pack identity, exact scope paths, and draft credits. Use the
   schema described in the CLI guide; do not invent fields.
4. Start the session and request the provider-neutral drawing contract:

   ```sh
   lpc-toolkit asset authoring start --plan <plan.json> --workspace <workspace> --json
   lpc-toolkit asset authoring contract --session <session-id> --workspace <workspace> --json
   ```

## Candidate production

First inspect the returned contract and non-importable templates. If the active
host exposes a compatible generation provider, propose it and explain network,
credential, prompt, reference, and asset disclosure. Continue only after the
user consents. The CLI provider commands normalize, preflight, and record a
handoff; they do not execute a provider. If no provider is available or the
user declines, preserve the session and drawing contract for an external artist
or tool.

Never pass contract templates, guides, overlays, metadata, credentials, or an
unverified provider result directly as source. Candidate PNGs must be regular,
transparent RGBA files with exact contract geometry.

## Review-ready endpoint

For a strict session, import each candidate with the returned target and
contract digest, then validate and preview:

```sh
lpc-toolkit asset authoring import --session <session-id> --target <target-id> --candidate <png> --contract-digest <sha256> --workspace <workspace> --json
lpc-toolkit asset authoring validate --session <session-id> --workspace <workspace> --json
lpc-toolkit asset authoring preview --session <session-id> --workspace <workspace> --json
```

Review-ready means source is imported through the current contract boundary,
validation is current, and the attributed preview includes matching metadata,
`credits.txt`, and `credits.csv`. It does not mean formally released, installed,
or accepted by a human.

At handoff, report the paths, validation warnings, effective credits, retained
identity for extensions, and the next human decision. Formal release requires
separate warning acknowledgement, author/source and license declaration,
preview acceptance, synchronization, packing, inspection, and optional install.
