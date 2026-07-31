---
status: accepted
---

# Preserve primary recolor compatibility

Selections retain `recolor` as the selected asset's primary color-channel
value, while a separate mapping stores only non-primary channel values. This
deliberate split preserves existing core, character-document, hash, token,
preset, CLI, and Web behavior without creating two sources of truth for the
primary channel; a future breaking schema version may unify the representation.
