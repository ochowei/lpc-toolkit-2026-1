---
status: accepted
---

# Body selection is the skin-color source

The selected `body` asset is the only source for channels that follow body
skin color. A non-body asset marked `match_body_color` follows that source,
while the body asset's own primary channel remains editable; missing body
selection falls back diagnostically rather than inferring a source from
selection iteration order.
