---
status: accepted
---

# Keep sprite generation provider-neutral

The public CLI owns versioned authoring sessions, sprite drawing contracts,
candidate import, validation, and release orchestration, while optional
generation providers receive only a provider-neutral drawing contract and
return candidate pixels. No Codex skill, ImageGen integration, Antigravity or
Claude Code adapter, or external author becomes required asset-pack product
logic; when no provider is available, the same workflow pauses with a durable
handoff. This adds a stable CLI contract, but avoids binding LPC asset authoring
or its safety guarantees to one Agent platform or image model.

