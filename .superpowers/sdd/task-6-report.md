# Task 6 Fix-Wave Report — 2026-07-22

Status: complete — final security hardening

Scope:

- Changed only CLI registry/sync production code, their focused tests, and this required report.
- Did not modify checked-in plans/progress, documentation, `upstream/`, assets, cache, web code, dependencies, or use `any`.

Implemented:

- Reject requested and retained linked directories outside `packsRoot` or beneath a symbolic link before source loading, validation, or publication. Regression tests prove requested outside-root and symlink-root attempts leave managed output and registry bytes unchanged.
- Replaced the unconstrained compile digest input with one typed canonical projection. Empty, writer, and reader paths now hash definitions, source-to-destination sprite digests, credits, compiler ownership, and consumers consistently. Independent digest tests cover deterministic ordering and each required field.
- Added strict v2 per-entry sprite ownership metadata and validation: logical destinations exactly match generated sprites, source/destination digests bind to captured/generated records, destination ownership is enforced, and each generated credit must cover an owned destination. Acknowledgement and replacement collections now require normalized sorted uniqueness.
- Preserved read-only v1 data without enrichment, require exact v1 generated-digest coverage, and reject retained v1 version, display-name, source-digest, generated-ownership, and baseline-digest drift before v2 publication. Populated v1 read and rejection tests assert registry/output bytes remain unchanged on failure.

Final hardening fix wave:

- Generated-credit rows are reconstructed from each entry's owned compiled definitions and must exactly match every compiler-derived field (`file`, `authors`, `licenses`, `urls`, and `notes`). This retains valid inherited extension credits such as `hair/braid` without accepting broad prefix rows or altered metadata. The sync writer uses the same definition-owned projection.
- Registry and receipt path keys now require canonical portable managed-relative paths before lookup, hashing, joining, or reads. The reader rejects absolute, traversal, backslash, dot-segment, decomposed-Unicode, and case-colliding forms.
- Acknowledgements and replacements are round-tripped through Core parsing and normalization, then checked for canonical ordering and uniqueness. Invalid diagnostic codes, reasons, subjects, replacement pack IDs, version ranges, and asset keys are rejected.
- Installed receipts now require exact source-payload coverage and matching digests, read only regular non-symlink files, and reject forged, missing, extra, tampered, or symlinked payload evidence.
- Managed-output snapshots lstat every traversed component and reject symbolic links, FIFOs, and other non-regular leaves. Audit reports those conditions as stable managed-output ownership diagnostics instead of following an outside target.
- Containment now lstat-validates `packsRoot` and `stateRoot/installed` themselves as regular directories before resolving linked or installed entries. Root-symlink regressions prove linked sync cannot read external packs or publish output, and installed-registry reads fail before external receipt or payload traversal.
- Installed receipt coverage now includes `asset-pack.json` alongside every sprite/source payload path. The registry hashes every covered regular file, including the manifest, and rejects missing, extra, digest-mismatched, tampered, or symlinked manifest entries.

TDD evidence:

- RED: outside-root and symlink-root sync tests initially succeeded incorrectly; canonical digest tests produced a different digest; retained-v1 metadata drift initially migrated successfully.
- GREEN: each regression passed after the minimal shared containment, canonical projection, strict relationship, and retained-v1 comparison changes.
- RED: exact-credit, Core-semantic, canonical-path, receipt-payload, and managed-output symlink/FIFO regressions failed against the previous reader; extension re-sync exposed the valid inherited-catalog credit case and was corrected by definition-owned credit reconstruction.
- GREEN: the focused registry, sync, and workspace suite passes with the exact compiler-row and receipt/output-audit checks enabled.
- RED: root-symlink containment was accepted and a valid receipt containing `asset-pack.json` was rejected.
- GREEN: root validation rejects those external containment roots before traversal, while exact receipt coverage verifies the manifest and source bytes.

Verification:

- `rtk pnpm --filter @lpc-toolkit/cli test -- asset-pack-registry.test.ts asset-pack-sync.test.ts asset-workspace.test.ts` — PASS: 3 files, 66 tests.
- `rtk pnpm --filter @lpc-toolkit/cli run typecheck` — PASS: `tsc -p tsconfig.json --noEmit`.
- `rtk git diff --check` — PASS.

CLI documentation impact matrix:

```text
help: N/A — no public command syntax or help text changed.
cli-readme: N/A — internal registry validation does not change documented workflow.
root-readme: N/A — repository quick-start behavior is unchanged.
landing: N/A — no web or landing content changed.
architecture: N/A — existing CLI registry ownership and attribution boundaries are preserved.
engineering: N/A — verification and CI command mapping are unchanged.
releasing: N/A — no release or publication workflow changed.
plugin: N/A — plugin contract and skills are unchanged.
```
