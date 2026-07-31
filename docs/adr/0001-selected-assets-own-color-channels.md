---
status: accepted
---

# Selected assets own color channels

Each selected sprite asset owns its color-channel values, and channels on
different assets remain independent even when they share a semantic name.
Synchronization requires an explicit channel link because head and expression
colors may intentionally differ; implicit character-wide colors would prevent
that valid composition.
