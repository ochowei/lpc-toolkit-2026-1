# LPC Sprite Composition and Asset Authoring

This context describes the language used to select and compose LPC character
appearance and to author attributed LPC asset packs without confusing consumer
character state, source pixels, validation, publication, or installation.

## Language

**Color channel**:
An independently colorable region owned by a selected sprite asset, such as
skin or eyes. Channels with the same name on different assets remain distinct.
_Avoid_: Color option, recolor slot

**Linked color channel**:
A color channel whose value explicitly comes from a channel owned by another
selected asset, such as expression skin following body skin.
_Avoid_: Disabled color, fixed color

**Body color source**:
The selected body asset whose primary color channel supplies skin color to
linked channels. No other selected asset can substitute as this source.
_Avoid_: First body-colored asset, inferred skin source

**Asset default color**:
The color channel's authored base appearance when a character stores no
explicit color choice for that channel.
_Avoid_: First swatch, missing color

**Agent integration**:
A platform-specific way for an AI coding agent to use LPC Toolkit workflows.
A plugin is one possible form of agent integration, not a synonym for it.
_Avoid_: Agent plugin, Codex integration as the cross-platform category

**Agent prompt example**:
A natural-language task that a user can copy and give to an agent to invoke an
agent integration workflow, including the intended outcome when useful.
_Avoid_: CLI command example, implementation instruction

**Journey kickoff prompt**:
A minimally parameterized Agent prompt example that starts one Agent-guided
journey and leaves stage-specific questions to the Agent at their relevant
authority boundaries.
_Avoid_: Complete authoring specification, CLI command bundle

**Agent-guided journey**:
A progressively disclosed, user-facing path for one LPC Toolkit goal, with its
visible stages, inputs, authority transitions, expected result, and next action
kept together.
_Avoid_: Prompt grid, mixed workflow

**Cross-journey transition**:
An Agent-proposed change from one Agent-guided journey to another after the
current workflow cannot satisfy the user's goal. It requires explicit user
confirmation before the new journey gains authority.
_Avoid_: Automatic fallback, silent generation, automatic repair

**Expected result**:
A read-only summary of the files and conversational response an agent prompt
example is expected to produce. It is guidance, not part of the copied prompt.
_Avoid_: Expected output field, prompt requirement

**Character concept**:
A user's open-ended description of the character they want to create, such as
fisher or blacksmith. It may guide asset discovery without being a built-in
preset.
_Avoid_: Custom preset, inferred preset

**Character document**:
A persisted selection of catalog items, variants, and color-channel values for
one character. It references assets but does not contain or create sprite
pixels.
_Avoid_: Asset pack, spritesheet manifest

**Sprite composition**:
The attributed rendering of selected existing sprite assets into character
output. It does not create new source assets or change an asset pack.
_Avoid_: Asset creation, character creation, character generation

**Asset-pack manifest**:
The canonical declaration of an attributed asset pack's identity, assets,
sprite sources, compatibility, credits, and governance records. It is not a
character document or a spritesheet.
_Avoid_: Character selection, drawing contract

**Sprite pixels**:
The authored RGBA image content of a sprite PNG. Creating or changing sprite
pixels is distinct from declaring, validating, packaging, or installing them.
_Avoid_: Asset manifest, character selection

**Animation extension**:
An attributed addition that supplies missing or incomplete animation pixels
for an existing catalog item while retaining the item's baseline identity and
credits.
_Avoid_: New item, replacement asset, asset redesign, character edit, audit finding

**Asset validation**:
The evaluation of an asset pack's schema, catalog compatibility, PNG geometry
and pixels, attribution, ownership, and governance requirements. It does not
mean that a human has accepted the art or released it.
_Avoid_: Visual acceptance, publication

**Formal asset-pack archive**:
An installable, immutable asset-pack archive whose validation, attribution,
warning acknowledgement, version, and release gates have passed.
_Avoid_: Draft archive, asset pack, installed pack

**Asset-pack installation**:
The activation of a validated formal asset-pack archive in a consumer
workspace. It is distinct from authoring, synchronizing, or publishing the
pack.
_Avoid_: Sync, pack, asset creation

**Authoring session**:
A resumable record of one bounded asset-authoring workflow, including its
phase, consent scope, evidence, artifacts, and invalidated checkpoints. It is
not part of the asset's published identity.
_Avoid_: Asset-pack manifest, Agent chat

**Sprite drawing contract**:
A provider-neutral, digest-bound description of the exact sprite PNG paths,
geometry, cells, layers, body types, and transparency rules that drawing work
must satisfy.
_Avoid_: Prompt, asset-pack manifest, drawing worklist

**Authoring reference**:
An optional image or existing asset used to guide candidate sprite pixels after
the user approves its disclosure to a generation provider. It is not evidence
of authorship, license authority, or permission to reproduce the reference.
_Avoid_: Credit source, license evidence, attribution author

**Animation remediation handoff**:
A read-only, digest-bound transfer of animation audit evidence and a bounded
drawing worklist into a possible animation-extension workflow.
_Avoid_: Asset mutation, acknowledgement, asset pack

**Animation remediation journey**:
A user-facing progression from read-only animation audit through explicit
consent into animation-extension authoring. The audit and source mutation remain
distinct authority boundaries even when presented as one guided experience.
_Avoid_: Automatic repair, audit mutation

**New asset authoring journey**:
A provider-neutral progression that declares a new attributed asset, defines
its sprite drawing contract, obtains candidate sprite pixels, validates them,
and prepares them for human-reviewed release within supported LPC types,
animations, geometry, and transparency rules. A generation provider is optional
and does not change the asset's identity or governance.
_Avoid_: Image generation, provider workflow, sprite composition

**Generation provider**:
An optional tool or delivery path that produces candidate sprite pixels from a
sprite drawing contract, including a handoff to an external author. The role
does not own the asset-pack manifest, validation, or release workflow; a human
contributor may separately be an attribution author. Provider availability does
not authorize selection, invocation, or disclosure of drawing inputs.
_Avoid_: Asset author, authoring skill

**Candidate sprite**:
A generated or externally supplied PNG held outside the canonical pack source
until contract-bound import validation succeeds.
_Avoid_: Published sprite, installed asset

**Generation provenance**:
Traceable evidence about how candidate sprite pixels were produced, including
the provider, inputs, references, contract, and result digests. It is distinct
from authorship and license declarations.
_Avoid_: Credits, author, acknowledgement

**Draft attribution**:
Human-supplied author, license, source, and note information used while
validating and previewing an asset revision. It remains subject to explicit
confirmation before formal release.
_Avoid_: Release declaration, inferred credits, generation provenance

**Release provenance projection**:
A versioned, bounded, deterministic subset of generation provenance that is
explicitly bound to one formal asset-pack release and its review evidence. It
is evidence about production history, not a credit, authorship declaration,
license authority, acknowledgement reason, or release approval.
_Avoid_: Generation credit, release approval, inferred author

**Attribution author**:
The person or organization named in credits and responsible for the claimed
contribution. An automated generation provider is not an attribution author
merely for producing candidate pixels.
_Avoid_: Generation provider, pack maintainer

**Attributed preview**:
A preview whose rendered pixels remain visibly associated with the exact
matching credit metadata used for review.
_Avoid_: Thumbnail, unattributed mockup

**Review-ready asset revision**:
An asset-pack revision whose candidate pixels have been imported, validated,
and rendered in a current attributed preview, but have not necessarily received
the human declarations required for formal release.
_Avoid_: Completed asset, released asset, generated PNG
