# LPC Sprite Composition

This context describes the language used to select and compose LPC character
appearance from layered sprite assets.

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

**Character concept**:
A user's open-ended description of the character they want to create, such as
fisher or blacksmith. It may guide asset discovery without being a built-in
preset.
_Avoid_: Custom preset, inferred preset
