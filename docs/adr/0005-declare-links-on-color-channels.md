---
status: accepted
---

# Declare links on color channels

Asset definitions declare `linked_to` on the affected color channel rather
than using item-level `match_body_color`. Built-in assets migrate to the
channel-level form, while external legacy packs remain readable through a
deprecated compatibility normalization. The first version accepts only links
to the selected body's primary channel, preventing ambiguous multi-channel
items without introducing arbitrary chains or cycles.
