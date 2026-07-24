# Task 5 Report — 2026-07-22

## Outcome

Implemented archive-byte asset-pack inspection without changing command wiring,
archive extraction, runtime assets, attribution policy, dependencies, web code,
or Phase 3 behavior.

- Added `inspectAssetPackArchive` with the required
  `lpc-toolkit.asset-pack-inspection.v1` JSON-safe report.
- Reused `readAssetPackArchive` and returns its byte-bearing verified snapshot
  only when the complete inspection report is valid.
- Reused captured payload validation, the shared compatibility gate and
  `CLI_VERSION`, active runtime catalog/palettes, Core pixel validation,
  baseline definition/credit digests, and acknowledgement matching.
- Added strict PNG signature and complete first-IHDR preflight with unsigned
  big-endian width/height reads. Invalid, truncated, wrong, incompatible, and
  oversized declared geometry is rejected before canvas decode.
- Preserved post-preflight canvas decoding for CRC/image corruption, required
  and optional cells, opaque palette colors, and deterministic Core diagnostics.
- Preserved attribution by routing archive bytes through the existing payload
  and Core validation path; no credit metadata or validation gate was bypassed.

## TDD Evidence

### RED

1. Added focused tests before production code in:
   - `packages/cli/test/asset-pack-inspection.test.ts`
   - `packages/cli/test/asset-pack-validation.test.ts`
2. Ran:

   ```sh
   rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-inspection.test.ts asset-pack-validation.test.ts
   ```

   Result: **FAIL** (exit 1). Vitest could not load the missing
   `../src/asset-pack-inspection.js`, proving the new archive inspection API did
   not exist.
3. Isolated the captured-IHDR validation tests before implementation. The
   deliberately huge IHDR reached the native decoder and terminated its worker,
   demonstrating the missing predecode boundary. The test decoder was then
   guarded against native allocation so the suite could safely retain the
   oversized regression case and assert that the decoder is never called.

### GREEN

Fresh verification after the final implementation:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-inspection.test.ts asset-pack-validation.test.ts
```

Result: **PASS** — 2 test files, 23 tests passed.

```sh
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Result: **PASS** — `tsc -p tsconfig.json --noEmit` exited 0.

`rtk git diff --cached --check` also passed before commit.

## Product Files

- Created `packages/cli/src/asset-pack-inspection.ts`
- Created `packages/cli/test/asset-pack-inspection.test.ts`
- Modified `packages/cli/src/asset-pack-validation.ts`
- Modified `packages/cli/test/asset-pack-validation.test.ts`

No `any`, dependency, asset, base-cache, upstream, web, plan, or progress-ledger
changes were made.

## Product Commit

`b3c85619ff172777af1f139ced7ae732d9505fad` —
`feat(cli): inspect attributed asset archives`

The report was written after the product commit so it can record the full hash.

## CLI Documentation Impact

```text
help: N/A — no command, option, help, or human-output contract changed
cli-readme: N/A — archive inspection is an internal API until later command wiring
root-readme: N/A — no primary CLI workflow or quick start changed
landing: N/A — no landing workflow or artifact changed
architecture: N/A — implementation follows the documented CLI archive/runtime boundary
engineering: N/A — no verification command or CI mapping changed
releasing: N/A — no package, version, publication, or release flow changed
plugin: N/A — no plugin contract or workflow changed
```

## Security Fix Wave

- Fix commit: `3998b10a731a0aa97d9892526a1666611a1c0c6b` — `fix(cli): harden archive inspection inputs`.
- Added complete IHDR format/CRC validation before native decode, bounded PNG dimensions/metadata checks, an isolated corrupt-IHDR child-process regression, and configured recolor source-ramp enforcement against captured opaque colors.
- Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-inspection.test.ts asset-pack-validation.test.ts` PASS (31 tests); `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS; `rtk git diff --check` PASS.
- The security review's Critical native-decoder crash and Important missing-ramp findings were addressed; re-review is pending.

## Residual Concerns

- Archives rejected before a verified snapshot exists report `entryCount: 0`
  and `totalUncompressedBytes: 0`; untrusted partial ZIP metadata is not exposed
  as verified report identity.
- Compressed-image integrity beyond the complete IHDR remains the canvas decoder's
  job after signature/IHDR geometry passes; the preflight intentionally does not
  duplicate a complete PNG decoder.
- Task 9 command integration remains out of scope. `asset-commands.ts` was not
  changed, so no CLI serialization path can accidentally emit the snapshot.
- Only the Task 5 focused tests and CLI typecheck requested by the brief were
  run; the repository-wide `rtk pnpm verify` gate was not run in this task.
