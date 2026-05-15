# @lpc-toolkit/core

Environment-agnostic TypeScript library for composing LPC character sprite
sheets from `sheet_definitions/` JSON. Has no DOM and no filesystem
dependencies — canvas creation and image loading are passed in by the caller
(browser supplies `HTMLCanvasElement` + `HTMLImageElement`, Node CLI supplies
`node-canvas`).
