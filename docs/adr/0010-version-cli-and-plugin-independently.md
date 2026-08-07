---
status: accepted
---

# Version the CLI and plugin independently

The published CLI and Codex plugin use independent release versions because
they evolve and ship on different schedules. The CLI package manifest and
plugin manifest each own their release version, while one plugin compatibility
record owns the supported CLI range; documentation and verification project
those values instead of defining them again. Private workspace placeholder
versions and author-owned asset-pack versions do not participate in either
release sequence.
