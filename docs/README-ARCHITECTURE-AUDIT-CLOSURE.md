# README and Architecture Audit Closure

This is the permanent closure record for the fifteen findings in the README and
architecture audit. Each row identifies the narrow implementation or
documentation evidence and the command that directly verifies the disposition.

| Finding | Disposition | Commits | Specific verification | Result |
| --- | --- | --- | --- | --- |
| 1 | fixed | `48cae47ae638e1e71d67682c9f39e27f82a60577` | `rtk pnpm --filter @lpc-toolkit/core test -- readme-example.test.ts` | PASS |
| 2 | fixed | `54cccc722` `4c5bbc535` | `rtk pnpm --filter @lpc-toolkit/web test -- spritesheet-bundle.test.ts zip-export.test.ts` | PASS |
| 3 | fixed | `91c26e006` `71a3192e1` `45e1b6b92` | `rtk pnpm --filter @lpc-toolkit/web test -- parity-source.test.ts package-scripts.test.ts` | PASS |
| 4 | fixed | `8259ab51a` `0a8140e97` | `rtk pnpm --filter @lpc-toolkit/cli test -- release-workflows.test.ts` | PASS |
| 5 | fixed | `0a8140e97` | `rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts` | PASS |
| 6 | fixed | `0a8140e97` | `rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts` | PASS |
| 7 | fixed | `0a8140e97` | `rtk pnpm --filter @lpc-toolkit/web test -- app-route.test.ts readme-architecture-docs.test.ts` | PASS |
| 8 | fixed | `0a8140e97` | `rtk pnpm --filter @lpc-toolkit/web test -- package-scripts.test.ts readme-architecture-docs.test.ts` | PASS |
| 9 | fixed | `0a8140e97` | `rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts` | PASS |
| 10 | fixed | `4f6b1bac1` `78e58f4c7` `6912bb515` `e8fc66588` | `rtk pnpm --filter @lpc-toolkit/web test -- use-single-item-composer.test.ts use-custom-overlay.test.ts character-export.test.ts use-character-export.test.ts` | PASS |
| 11 | fixed | `e534731a5` | `rtk pnpm --filter @lpc-toolkit/web test -- attribution-model.test.ts attribution-popover.test.ts` | PASS |
| 12 | fixed | `040967ddc` `9814c0a6f` `0146fb99b` `2007830ac` | `rtk pnpm --filter @lpc-toolkit/cli test -- asset-cache.test.ts asset-store.test.ts runtime-assets.test.ts` | PASS |
| 13 | fixed | `0146fb99b` `2007830ac` | `rtk pnpm --filter @lpc-toolkit/web test -- load-catalog.test.ts readme-architecture-docs.test.ts` | PASS |
| 14 | fixed | `04b11c0ed` `f27a7d6ba` `88e39a35e` `de963e282` `0b49bfde2` | `rtk pnpm check:boundaries` | PASS |
| 15 | documented approved exception | `192a464e4` `2007830ac` | `rtk pnpm --filter @lpc-toolkit/web test -- attribution-popover.test.ts readme-architecture-docs.test.ts` | PASS |

Finding 15 is the approved exception: catalog picker thumbnails are internal
editor previews and do not receive individual credit sidecars. The active
composition keeps attribution visible, and every downloadable pixel artifact
uses its precise `ComposedSheet.credits` manifest and bundled credit files.
