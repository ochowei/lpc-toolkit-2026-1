---
status: accepted
---

# Write selection v2 only

The toolkit reads selection v1 and v2 documents but writes only v2, migrating
v1 in memory before the next save. The same forward-only rule applies to new
hash and token output: legacy input remains readable, while all newly produced
identities use the new representation. This explicit compatibility boundary
avoids conditional output schemas and silent loss of non-primary color-channel
values, at the cost of new output being unreadable by old toolkit versions.
