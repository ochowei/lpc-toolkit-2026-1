# Random Upstream Parity Result

**Date:** 2026-05-30
**Command:** `pnpm --filter @lpc-toolkit/web test:e2e:parity`

## Result

The parity runner starts both local apps and reaches toolkit-vs-upstream
comparison for all 6 configured cases. The current result is a comparison
failure for every case: all 5 fixed seeded random cases and the observed
regression hash fail with deterministic diagnostics.

This is not an infrastructure failure. The run reaches the attribution-backed
toolkit render probe, local upstream render capture, canvas dimension
comparison, and pixel comparison where dimensions allow it.

## Failing Cases

- `seed-1`: dimension mismatch, toolkit `832x3456`, upstream `1536x4224`.
- `seed-7`: dimension mismatch, toolkit `1152x3968`, upstream `1152x4480`.
- `seed-42`: dimension mismatch, toolkit `832x3456`, upstream `1536x4224`.
- `seed-99`: same canvas dimensions, but RGBA pixel mismatch.
- `seed-20260530`: dimension mismatch, toolkit `832x3456`, upstream `1536x4992`.
- `observed-deployed-mismatch-2026-05-30`: dimension mismatch, toolkit
  `832x3456`, upstream `1536x4224`.

## Diagnostics

Each failure includes enough context to reproduce and investigate the mismatch
without committed image artifacts. The Playwright output includes the case
name, source seed or observed-regression label, input hash, canonical hash,
toolkit hash, toolkit body type and render status, toolkit and upstream canvas
dimensions, toolkit layer paths with z-order/type names, and pixel mismatch
samples when the dimensions match.

## Reproduction

Run:

```bash
pnpm --filter @lpc-toolkit/web test:e2e:parity
```

The command should start the toolkit Vite app on `127.0.0.1:5173`, start the
local upstream app on `127.0.0.1:5174`, and run the explicit parity Playwright
config.

## Next Step

Use the mismatch diagnostics to investigate the broader parity gap across hash
parsing, layer path resolution, draw order, recolor handling, and custom
animation canvas sizing. The observed regression remains covered, but the
current failure surface is broader than that single fixed hash.
