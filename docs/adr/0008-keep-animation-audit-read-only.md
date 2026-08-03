---
status: accepted
---

# Keep animation audit read-only

Animation audit remains a read-only workflow that may produce a digest-bound
animation remediation handoff but may not create a workspace, scaffold a pack,
generate or import pixels, or mutate an asset source. An upper-level Agent
integration may show the handoff, obtain authoring consent, and then invoke the
separate asset-pack authoring workflow. The explicit transition costs one
consent boundary, but preserves the audit's trustworthy evidence-gathering
role and prevents a diagnostic request from silently becoming source mutation.

