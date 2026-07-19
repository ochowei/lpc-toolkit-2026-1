---
name: lpc-animation-asset-audit
description: Use when identifying LPC assets with incomplete animation support, missing animation PNGs, transparent animation frames, or when producing or verifying a bounded animation drawing worklist through the installed lpc-toolkit CLI. Do not use for character outfit authoring, non-LPC sprites, unrelated raster editing, or source-asset mutation.
---

# LPC Animation Asset Audit

Use `lpc-toolkit` as the only source of catalog, animation capability, expected
path, source geometry, runtime asset, and inspection behavior.

1. Read `references/compatibility.md`, resolve this skill directory to an
   absolute `SKILL_DIR`, and run `node "$SKILL_DIR/scripts/check-cli.mjs"`.
   Continue only when its JSON result has `ok: true`.
2. Read `references/audit-workflow.md` and treat
   `references/cli-contract.json` as the tested command inventory.
3. Require at least one explicit target animation and choose the narrowest safe
   optional type and body-type scope.
4. Run one `catalog audit-animations --json` command and preserve its complete
   stdout before reading findings.
5. Use `scripts/read-audit-report.mjs` for bounded summary, type, finding, and
   worklist views.
6. Keep unsupported, missing-file, blank-frame, and inspection-error semantics
   distinct. Preserve nested requirements and all physical-file consumers.
7. After external asset work, rerun the same target and scope and verify the
   intended findings, not merely the process exit code.

Do not add, edit, generate, or repair sprite assets. Do not initialize or
modify `upstream/`, bypass cache integrity, suppress attribution, infer an
exact path from `manual-review`, or treat runtime recolors as separate PNGs.
