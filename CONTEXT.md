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
